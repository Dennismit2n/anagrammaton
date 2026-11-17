/*
 * Anagrammaton: Engine. Reine Funktionen als ES-Modul, laufen im Browser (Seite und Worker) und in Node (Tests).
 * Einheiten sind Graphem-Cluster des NFC-Textes, klein geschrieben nach den Regeln der Sprache.
 * So gilt derselbe Code für Latein, Kyrillisch, Devanagari (Akshara), Hangul (Silbenblock) und CJK (Zeichen).
 */

export const SPRACHEN = ['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'tr', 'ru', 'hi', 'zh', 'ja', 'ko'];
export const LATEIN_KYRILL = new Set(['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'tr', 'ru']);

export const akzenteMoeglich = lang => LATEIN_KYRILL.has(lang);
export const standardMinLaenge = lang => (LATEIN_KYRILL.has(lang) ? 3 : 2);

const jetzt = () => globalThis.performance.now();

/* ===================== Einheiten ===================== */
const segmenter = new Map();
function zerlege(text, lang) {
  let s = segmenter.get(lang);
  if (!s) { s = new Intl.Segmenter(lang, { granularity: 'grapheme' }); segmenter.set(lang, s); }
  const aus = [];
  for (const g of s.segment(text)) aus.push(g.segment);
  return aus;
}
const BUCHSTABE = /\p{L}/u;
const MARKE = /\p{M}/u;
const MARKEN = /\p{M}+/gu;
const NUR_BUCHSTABEN = /^\p{L}+$/u;

/** Graphem-Cluster eines Textes (NFC), ohne Kleinschreibung und ohne Filter. */
export function grapheme(text, lang) {
  return zerlege(String(text).normalize('NFC'), lang);
}

// Eigene Buchstaben, keine Akzentformen: ru й (nicht и), es ñ (nicht n). ё und е gelten als gleich.
const EIGENE = new Set(['й', 'ñ']);
function ohneAkzent(e) {
  if (EIGENE.has(e)) return e;
  return e.normalize('NFD').replace(MARKEN, '').normalize('NFC') || e;
}

/** Zählende Einheiten: klein, NFC, ohne Leerzeichen, Satzzeichen und Ziffern. */
export function einheiten(text, lang, akzente = false) {
  const t = String(text).normalize('NFC').toLocaleLowerCase(lang).normalize('NFC');
  // Schneller Weg: nur Buchstaben ohne Kombinationszeichen, dann ist jeder Codepunkt ein Graphem.
  let u = NUR_BUCHSTABEN.test(t) ? Array.from(t) : zerlege(t, lang).filter(g => BUCHSTABE.test(g));
  if (akzente && LATEIN_KYRILL.has(lang)) u = u.map(ohneAkzent);
  return u;
}

/** Schlüssel der sortierten Einheiten: gleich für alle Anagramme. */
export function schluessel(u) {
  return u.slice().sort().join('\u0001');
}

/** Die Wörter eines Textes, jeweils als Einheiten-Form (für den Vergleich mit Treffern). */
function wortFormen(text, lang, akzente) {
  return String(text).split(/[^\p{L}\p{M}]+/u).filter(Boolean)
    .map(w => einheiten(w, lang, akzente).join('')).filter(Boolean);
}

/* ===================== Index ===================== */
/**
 * Baut den Index einer Wortliste (Rang = Position in der Liste, 0 ist das häufigste Wort).
 * schl: Schlüssel der sortierten Einheiten → Wortnummern, form: Einheiten-Form → erste Wortnummer.
 */
export function baueIndex(woerter, lang, akzente = false) {
  const akz = !!akzente && LATEIN_KYRILL.has(lang);
  const einh = new Array(woerter.length);
  const schl = new Map();
  const form = new Map();
  for (let i = 0; i < woerter.length; i++) {
    const u = einheiten(woerter[i], lang, akz);
    einh[i] = u;
    const k = schluessel(u);
    const l = schl.get(k);
    if (l) l.push(i); else schl.set(k, [i]);
    const f = u.join('');
    if (!form.has(f)) form.set(f, i);
  }
  return { lang, akzente: akz, woerter, einh, schl, form };
}

/** Ein-Wort-Anagramme in Rangfolge, ohne das Eingabewort selbst. */
export function einWort(index, text) {
  const u = einheiten(text, index.lang, index.akzente);
  if (u.length < 2) return [];
  const selbst = u.join('');
  const l = index.schl.get(schluessel(u)) || [];
  const aus = [];
  for (const i of l) if (index.einh[i].join('') !== selbst) aus.push(index.woerter[i]);
  return aus;
}

/* ===================== Mehr-Wort-Anagramme ===================== */
/** Wortgrenze für „Auto“: 3 wie bisher, bei langen Eingaben etwa ein Wort je 6 Einheiten, höchstens 8. */
export const autoWorte = n => Math.min(8, Math.max(3, Math.ceil(n / 6)));
const VORLAUF_AB = 20;      // ab so vielen Einheiten (ohne Pflichtwort) gibt es den Vorlauf
const VORLAUF_NACH = 300;   // er beginnt erst, wenn die Stufen nach so vielen ms nicht fertig sind
const VORLAUF_MS = 1500;    // so lange darf er höchstens laufen
const BREITE = 24;          // Vorlauf: so viele zweite Wörter je erstem, ab dem dritten die Hälfte

/**
 * Backtracking über alle Wörter, die als Teilmenge in die Eingabe passen.
 * Stufenweise: erst alle Treffer mit 2 Wörtern, dann mit 3 usw. (weniger Wörter zuerst).
 * Jede Multimenge kommt nur einmal (Kandidaten nur in aufsteigender Reihenfolge).
 * Das letzte Wort wird nicht gesucht, sondern über den Zählvektor des Rests nachgeschlagen.
 * schritt(ms) arbeitet höchstens ms Millisekunden und gibt die neuen Treffer zurück;
 * so kann der Worker zwischendurch Nachrichten annehmen und die Suche abbrechen.
 * Grenze: Die Suche behält nur die `grenze` besten Treffer nach vergleiche (weniger Wörter, dann
 * kleinere Rangsumme) in einem Max-Heap. Ein gemeldeter Treffer kann später verdrängt werden: Wer alle
 * neu-Listen sammelt, sortiert sie mit vergleiche und kürzt auf `anzahl`. Äste, die nichts Besseres
 * mehr liefern können, fallen weg (die Kandidaten stehen nach Rang, spätere Wörter haben nie kleineren Rang).
 * Vorlauf (lange Eingaben): Sind die Stufen nach VORLAUF_NACH ms nicht fertig, halten sie an, und eine
 * schmale Tiefensuche mit langen Wörtern zuerst
 * (jedes passende erste Wort ein eigener Start, danach je Tiefe nur die ersten paar Wörter) und liefert
 * so schnell volle Treffer. Ist sie vor ihrer Zeit durch, beginnt sie doppelt so breit von vorn, solange
 * die Breite etwas abgeschnitten hat. Ihre Treffer landen im selben Heap; die Stufen überspringen sie
 * (Signaturen-Menge), deshalb ist das Endergebnis dasselbe wie ohne Vorlauf. Was die Stufen vor dem
 * Vorlauf gemeldet haben, merkt sich die Menge `gemeldet`, damit der Vorlauf es nicht noch einmal meldet.
 */
export class MehrwortSuche {
  constructor(index, text, { maxWorte = 3, minLaenge, pflicht = '', grenze = 3000, vorlauf } = {}) {
    const lang = index.lang, akz = index.akzente;
    this.index = index;
    this.grenze = grenze;
    this.heap = [];       // beste Treffer, schlechtester oben
    this.summe = 0;       // Rangsumme der gerade gewählten Wörter (ohne Pflichtwort)
    this.fertig = false;
    this.grund = null;
    this.abbruch = false;
    this.stufen = [];
    this.si = -1;
    this.worte = 0;       // Gesamtzahl der Wörter in der laufenden Stufe
    this.stapel = null;
    this.gewaehlt = [];
    this.gefunden = new Set();  // Signaturen der Vorlauf-Treffer
    this.gemeldet = null;       // Signaturen der Stufen-Treffer, solange der Vorlauf noch aussteht
    this.vl = null;
    this.t0 = 0;
    this.min = Math.max(1, minLaenge || standardMinLaenge(lang));

    const u = einheiten(text, lang, akz);
    maxWorte = maxWorte > 0 ? Math.min(8, maxWorte | 0) : autoWorte(u.length);
    this.maxWorte = maxWorte;
    const ids = new Map();
    for (const x of u) if (!ids.has(x)) ids.set(x, ids.size);
    const k = this.k = ids.size;
    const rest = this.rest = new Int16Array(k);
    for (const x of u) rest[ids.get(x)]++;
    this.restLen = u.length;
    this.eingabe = wortFormen(text, lang, akz).sort().join(' ');
    this.vorab = [];

    // Pflichtwort zuerst abziehen.
    this.pflicht = null;
    this.pflichtRang = 0;
    const p = String(pflicht || '').normalize('NFC').toLocaleLowerCase(lang).trim().replace(/\s+/g, ' ');
    if (p) {
      const pu = einheiten(p, lang, akz);
      const bedarf = new Int16Array(k);
      let ok = pu.length > 0;
      for (const x of pu) { const j = ids.get(x); if (j === undefined || ++bedarf[j] > rest[j]) { ok = false; break; } }
      if (!ok) { this.fertig = true; this.grund = 'pflicht'; return; }
      for (let j = 0; j < k; j++) rest[j] -= bedarf[j];
      this.restLen -= pu.length;
      this.pflicht = p;
      const r = index.form.get(pu.join(''));
      this.pflichtRang = r === undefined ? index.woerter.length : r;
      this.pflichtForm = wortFormen(p, lang, akz);
    }
    const vorne = this.vorne = this.pflicht ? 1 : 0;

    // Kandidaten: alle Wörter, die in den Rest passen, in Rangfolge.
    const cWort = [], cLen = [], cStart = [0], cIds = [], cAnz = [], cSchl = [];
    const dicht = new Int16Array(k);
    for (let i = 0; i < index.einh.length; i++) {
      const w = index.einh[i];
      if (w.length < this.min || w.length > this.restLen) continue;
      dicht.fill(0);
      let ok = true;
      for (const x of w) { const j = ids.get(x); if (j === undefined || ++dicht[j] > rest[j]) { ok = false; break; } }
      if (!ok) continue;
      cWort.push(i); cLen.push(w.length);
      for (let j = 0; j < k; j++) if (dicht[j]) { cIds.push(j); cAnz.push(dicht[j]); }
      cStart.push(cIds.length);
      cSchl.push(dicht.join(','));
    }
    const m = this.m = cWort.length;
    this.cWort = Int32Array.from(cWort);
    this.cLen = Int16Array.from(cLen);
    this.cStart = Int32Array.from(cStart);
    this.cIds = Int16Array.from(cIds);
    this.cAnz = Int16Array.from(cAnz);
    this.nachRest = new Map();
    for (let c = 0; c < m; c++) {
      const l = this.nachRest.get(cSchl[c]);
      if (l) l.push(c); else this.nachRest.set(cSchl[c], [c]);
    }
    this.alle = new Int32Array(m);
    for (let c = 0; c < m; c++) this.alle[c] = c;

    // Stufen: Gesamtzahl der Wörter (mit Pflichtwort), weniger zuerst.
    if (this.pflicht && this.restLen === 0) {
      this._melde([], this.vorab);
    } else {
      for (let t = maxWorte === 1 ? 1 : 2; t <= maxWorte; t++) {
        const extra = t - vorne;
        if (extra >= 1 && extra * this.min <= this.restLen) this.stufen.push(extra);
      }
    }
    const vlMs = vorlauf ?? (this.restLen >= VORLAUF_AB ? VORLAUF_MS : 0);
    const maxExtra = this.stufen.length ? this.stufen[this.stufen.length - 1] : 0;
    if (vlMs > 0 && maxExtra >= 3) {
      // Lange Wörter zuerst, bei gleicher Länge das geläufigere.
      const liste = Int32Array.from(this.alle).sort((a, b) => this.cLen[b] - this.cLen[a] || a - b);
      this.vl = { ms: vlMs, bis: 0, maxExtra, liste, breite: BREITE, gekappt: false, stapel: [{ liste, i: 0, n: 0 }], gewaehlt: [] };
      this.gemeldet = new Set();
    }
  }

  /** Gesamtzahl der Wörter in der laufenden Stufe (für die Fortschrittsanzeige). */
  get stufe() {
    const e = this.stufen[Math.max(0, Math.min(this.si, this.stufen.length - 1))];
    return (e || 0) + (this.pflicht ? 1 : 0);
  }

  get anzahl() { return this.heap.length; }

  abbrechen() { this.abbruch = true; }

  _passt(c) {
    const r = this.rest;
    for (let q = this.cStart[c], e = this.cStart[c + 1]; q < e; q++) if (r[this.cIds[q]] < this.cAnz[q]) return false;
    return true;
  }
  _ab(c) {
    for (let q = this.cStart[c], e = this.cStart[c + 1]; q < e; q++) this.rest[this.cIds[q]] -= this.cAnz[q];
    this.restLen -= this.cLen[c];
    this.summe += this.cWort[c];
  }
  _zu(c) {
    for (let q = this.cStart[c], e = this.cStart[c + 1]; q < e; q++) this.rest[this.cIds[q]] += this.cAnz[q];
    this.restLen += this.cLen[c];
    this.summe -= this.cWort[c];
  }

  // Schranke für Treffer mit n Wörtern: Rangsumme, die sie unterbieten müssen.
  // Infinity, solange Platz ist oder oben mehr Wörter liegen; -Infinity, wenn oben weniger liegen.
  _schranke(n) {
    const h = this.heap;
    if (h.length < this.grenze) return Infinity;
    const o = h[0].w.length;
    return o > n ? Infinity : o < n ? -Infinity : h[0].r;
  }

  // cs: Kandidaten in aufsteigender Reihenfolge (ohne Pflichtwort).
  _melde(cs, neu, ausVorlauf = false) {
    if (this.grenze <= 0) return;
    const ix = this.index;
    let rang = this.pflicht ? this.pflichtRang : 0;
    for (const c of cs) rang += this.cWort[c];
    if (rang >= this._schranke(cs.length + this.vorne)) return;
    if (ausVorlauf || this.gefunden.size || this.gemeldet) {
      const sig = cs.join(',');
      if (this.gefunden.has(sig)) return;
      if (ausVorlauf) {
        if (this.gemeldet.has(sig)) return;
        this.gefunden.add(sig);
      } else if (this.gemeldet) this.gemeldet.add(sig);
    }
    const w = [];
    if (this.pflicht) w.push(this.pflicht);
    for (const c of cs) w.push(ix.woerter[this.cWort[c]]);
    // Das Eingabewort (oder der Eingabesatz) selbst ist kein Treffer.
    const formen = [];
    if (this.pflicht) formen.push(...this.pflichtForm);
    for (const c of cs) formen.push(ix.einh[this.cWort[c]].join(''));
    if (formen.sort().join(' ') === this.eingabe) return;
    const t = { w, r: rang };
    neu.push(t);
    const h = this.heap;
    if (h.length >= this.grenze) { h[0] = h[h.length - 1]; h.pop(); runter(h, 0); }
    h.push(t); hoch(h, h.length - 1);
  }

  // Letztes Wort: der Rest muss genau ein Kandidat sein, mit Nummer ab `ab`.
  _letztes(ab, neu) {
    if (this.restLen < this.min) return;
    const l = this.nachRest.get(this.rest.join(','));
    if (!l) return;
    for (const c2 of l) {
      if (c2 < ab) continue;
      this.gewaehlt.push(c2);
      this._melde(this.gewaehlt, neu);
      this.gewaehlt.pop();
    }
  }

  // Vorlauf bis `ende`; true, wenn er vorbei ist (abgesucht, Heap voll oder seine Zeit um).
  _vorlauf(ende, neu) {
    const v = this.vl, st = v.stapel, g = v.gewaehlt;
    const halt = Math.min(ende, v.bis);
    let z = 0;
    for (;;) {
      if ((++z & 3) === 0) {
        if (this.heap.length >= this.grenze) return true;   // Heap voll: den Rest machen die Stufen genau
        if (jetzt() > halt) return jetzt() > v.bis;
      }
      if (!st.length) {
        if (!v.gekappt) return true;   // nichts abgeschnitten: alles abgesucht
        v.breite *= 2; v.gekappt = false;
        st.push({ liste: v.liste, i: 0, n: 0 });
      }
      const oben = st[st.length - 1], tiefe = st.length - 1;
      const breite = tiefe === 0 ? Infinity : tiefe === 1 ? v.breite : v.breite >> 1;
      if (oben.i >= oben.liste.length || oben.n >= breite) {
        if (oben.i < oben.liste.length) v.gekappt = true;
        st.pop();
        if (g.length) this._zu(g.pop());
        continue;
      }
      const L = oben.liste, c = L[oben.i++], lc = this.cLen[c];
      const frei = v.maxExtra - tiefe - 1;   // so viele Wörter dürfen nach c noch kommen
      const r = this.restLen - lc;
      // Spätere Wörter sind höchstens so lang wie c.
      if (frei < 1 || r < this.min || r > frei * lc) continue;
      oben.n++;
      this._ab(c); g.push(c);
      const l = this.nachRest.get(this.rest.join(','));
      if (l) for (const c2 of l) this._melde(g.concat(c2).sort((a, b) => a - b), neu, true);
      if (frei >= 2) {
        const max = Math.min(lc, r - this.min), nl = [];
        for (let j = oben.i - 1; j < L.length; j++) {
          const c2 = L[j];
          if (this.cLen[c2] <= max && this._passt(c2)) nl.push(c2);
        }
        if (nl.length) { st.push({ liste: nl, i: 0, n: 0 }); continue; }
      }
      this._zu(g.pop());
    }
  }

  schritt(ms = 30) {
    const neu = this.vorab.length ? this.vorab.splice(0) : [];
    const ende = jetzt() + ms;
    if (!this.t0) this.t0 = jetzt();
    // Vorlauf beginnen: die Stufe hält an, ihre gewählten Wörter gehen so lange zurück in den Rest.
    if (this.vl && !this.vl.bis && !this.fertig && ende - ms - this.t0 >= VORLAUF_NACH) {
      for (const c of this.gewaehlt) this._zu(c);
      this.vl.bis = jetzt() + this.vl.ms;
    }
    let z = 0;
    while (!this.fertig) {
      if (this.abbruch) { this.fertig = true; this.grund = 'abbruch'; break; }
      if (this.vl && this.vl.bis) {
        if (!this._vorlauf(ende, neu)) break;
        // Aufräumen, dann macht die Stufe dort weiter, wo sie angehalten hat.
        while (this.vl.gewaehlt.length) this._zu(this.vl.gewaehlt.pop());
        for (const c of this.gewaehlt) this._ab(c);
        this.vl = null; this.gemeldet = null;
        continue;
      }
      if (this.stapel === null) {
        // Abgeschlossene Stufe steht fest; mehr Wörter sind immer schlechter als volle weniger Wörter.
        const h = this.heap, voll = h.length >= this.grenze;
        if (voll && this.si >= 0 && h[0].w.length <= this.worte) { this.fertig = true; this.grund = 'grenze'; break; }
        this.si++;
        if (this.si >= this.stufen.length) { this.fertig = true; this.grund = voll ? 'grenze' : 'alle'; break; }
        this.extra = this.stufen[this.si];
        this.worte = this.extra + this.vorne;
        this.gewaehlt = [];
        if (this.extra === 1) { this._letztes(0, neu); continue; }
        this.stapel = [{ liste: this.alle, i: 0 }];
        continue;
      }
      if (this.stapel.length === 0) { this.stapel = null; continue; }
      if ((++z & 127) === 0 && jetzt() > ende) break;

      const oben = this.stapel[this.stapel.length - 1];
      if (oben.i >= oben.liste.length) {
        this.stapel.pop();
        if (this.gewaehlt.length) this._zu(this.gewaehlt.pop());
        continue;
      }
      const c = oben.liste[oben.i++];
      const nachher = this.extra - this.gewaehlt.length - 1;
      // Jedes weitere Wort hat mindestens den Rang von c: reicht das nicht mehr, ist die Ebene erledigt.
      if ((this.pflicht ? this.pflichtRang : 0) + this.summe + this.cWort[c] * (nachher + 1) >= this._schranke(this.worte)) {
        oben.i = oben.liste.length; continue;
      }
      const r = this.restLen - this.cLen[c];
      if (r < nachher * this.min) continue;
      this._ab(c);
      if (nachher === 1) {
        this.gewaehlt.push(c);
        this._letztes(c, neu);
        this.gewaehlt.pop();
        this._zu(c);
        continue;
      }
      const L = oben.liste, max = this.restLen - (nachher - 1) * this.min, nl = [];
      for (let j = oben.i - 1; j < L.length; j++) {
        const c2 = L[j];
        if (this.cLen[c2] <= max && this._passt(c2)) nl.push(c2);
      }
      if (!nl.length) { this._zu(c); continue; }
      this.gewaehlt.push(c);
      this.stapel.push({ liste: nl, i: 0 });
    }
    return { neu, fertig: this.fertig, grund: this.grund, anzahl: this.anzahl, stufe: this.stufe };
  }
}

// Max-Heap nach vergleiche: der schlechteste Treffer oben.
function hoch(h, i) {
  while (i > 0) { const p = (i - 1) >> 1; if (vergleiche(h[p], h[i]) >= 0) break; [h[p], h[i]] = [h[i], h[p]]; i = p; }
}
function runter(h, i) {
  for (;;) {
    const l = 2 * i + 1, r = l + 1; let g = i;
    if (l < h.length && vergleiche(h[l], h[g]) > 0) g = l;
    if (r < h.length && vergleiche(h[r], h[g]) > 0) g = r;
    if (g === i) return;
    [h[g], h[i]] = [h[i], h[g]]; i = g;
  }
}

/** Sortierung der Treffer: weniger Wörter zuerst, dann geläufigere Wörter (kleinere Rangsumme). */
export function vergleiche(a, b) {
  return a.w.length - b.w.length || a.r - b.r;
}

/* ===================== Rückwärts ===================== */
/** Rückwärtsfassung nach Graphemen (klein geschrieben, Leer- und Satzzeichen bleiben stehen). */
export function rueckwaerts(text, lang) {
  return grapheme(String(text).toLocaleLowerCase(lang), lang).reverse().join('');
}

/** Palindrom-Prüfung ohne Leer- und Satzzeichen. */
export function istPalindrom(text, lang, akzente = false) {
  const u = einheiten(text, lang, akzente);
  if (u.length < 2) return false;
  for (let i = 0, j = u.length - 1; i < j; i++, j--) if (u[i] !== u[j]) return false;
  return true;
}

/** Rückwärtswörter: Wörter der Eingabe (und die ganze Eingabe), deren Rückwärtsfassung ein anderes Wort ist. */
export function rueckwaertsWoerter(index, text) {
  const { lang, akzente } = index;
  const teile = String(text).split(/[^\p{L}\p{M}]+/u).filter(Boolean);
  if (teile.length > 1) teile.unshift(teile.join(''));
  const aus = [], gesehen = new Set();
  for (const t of teile) {
    const u = einheiten(t, lang, akzente);
    if (u.length < 2) continue;
    const f = u.join(''), r = u.slice().reverse().join('');
    if (r === f || gesehen.has(f)) continue;
    gesehen.add(f);
    const i = index.form.get(r);
    if (i !== undefined) aus.push({ wort: t.toLocaleLowerCase(lang), rueck: index.woerter[i] });
  }
  return aus;
}

/**
 * Entdecken: die geläufigsten Palindrome und Rückwärtspaare der Wortliste (ab 3 Einheiten).
 * Ein Paar ist so geläufig wie sein selteneres Wort. Palindrome aus nur einer Einheit (iii) zählen nicht.
 */
export function entdecken(index, n = 12) {
  const pal = [], paare = [], belegt = new Set();
  const { einh, woerter, form } = index;
  for (let i = 0; i < einh.length; i++) {
    const u = einh[i];
    if (u.length < 3) continue;
    const f = u.join(''), r = u.slice().reverse().join('');
    if (r === f) { if (pal.length < n && new Set(u).size > 1) pal.push(woerter[i]); continue; }
    if (belegt.has(f)) continue;
    const j = form.get(r);
    if (j === undefined) continue;
    belegt.add(f); belegt.add(r);
    paare.push([i, j]);
  }
  paare.sort((a, b) => Math.max(a[0], a[1]) - Math.max(b[0], b[1]));
  return { palindrome: pal, paare: paare.slice(0, n).map(([i, j]) => [woerter[i], woerter[j]]) };
}

/* ===================== Mischen ===================== */
/** Gleichverteilte Zufallszahl 0 ≤ x < n aus crypto.getRandomValues (ohne Modulo-Schieflage). */
export function kryptoZufall(n) {
  const a = new Uint32Array(1), grenze = Math.floor(0x100000000 / n) * n;
  do { globalThis.crypto.getRandomValues(a); } while (a[0] >= grenze);
  return a[0] % n;
}

/** Fisher-Yates. Nie gleich der Eingabe, wenn es eine andere Reihenfolge gibt. */
export function mische(arr, zufall = kryptoZufall) {
  const anders = arr.some(x => x !== arr[0]);
  for (let versuch = 0; versuch < 50; versuch++) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = zufall(i + 1);
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    if (!anders || a.some((x, i) => x !== arr[i])) return a;
  }
  // Notweg (praktisch nie): um eins drehen, das ist sicher anders.
  return arr.slice(1).concat(arr.slice(0, 1));
}

/* ===================== Farben ===================== */
/*
 * Fester Farbton je Einheit auf dem OKLCH-Farbkreis (Fibonacci-Hashing mit dem goldenen Winkel).
 * Lateinische und kyrillische Buchstaben gehen nach ihrem Häufigkeitsrang hinein: so liegen die
 * häufigsten Buchstaben (e, n, i, r, s, t, a ...) weit auseinander und lassen sich gut verfolgen.
 * Buchstaben mit Akzent bekommen den Ton ihres Grundbuchstabens, leicht gedreht (ä neben a).
 * Alle übrigen Einheiten (Devanagari, Hangul, CJK, ß, ı ...) laufen über einen FNV-1a-Hash.
 */
const RANG_LATEIN = 'etaoinsrhldcumfpgwybvkxjqz';
const RANG_KYRILL = 'оеаинтсрвлкмдпуяыьгзбчйхжшюцщэфъё';
const GOLD = 137.50776405003785;
export function farbton(einheit) {
  const e = String(einheit);
  const rang = z => (z.length === 1 ? Math.max(RANG_LATEIN.indexOf(z), RANG_KYRILL.indexOf(z)) : -1);
  let r = rang(e), plus = 0;
  if (r < 0) {
    const basis = e.normalize('NFD').replace(MARKEN, '');
    if (basis !== e) { r = rang(basis); plus = 9; }
  }
  if (r >= 0) return (r * GOLD + 24 + plus) % 360;
  let n = 0x811c9dc5;
  for (const c of e) { n ^= c.codePointAt(0); n = Math.imul(n, 0x01000193) >>> 0; }
  n = (n ^ (n >>> 15)) >>> 0; n = Math.imul(n, 0x2c1b3c6d) >>> 0; n = (n ^ (n >>> 12)) >>> 0;
  return (n % 3600) / 10;
}

/** OKLCH → sRGB (Gamma-kodiert, 0..1, kann außerhalb liegen). */
export function oklchZuSrgb(L, C, h) {
  const hr = h * Math.PI / 180, a = C * Math.cos(hr), b = C * Math.sin(hr);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ];
  return lin.map(c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.sign(c) * Math.abs(c) ** (1 / 2.4) - 0.055));
}
const imGamut = rgb => rgb.every(c => c >= -1e-4 && c <= 1 + 1e-4);

/** Größte Chroma ≤ cmax, die bei L und h noch in sRGB passt (keine Kappung im Browser). */
export function maxChroma(L, h, cmax) {
  if (imGamut(oklchZuSrgb(L, cmax, h))) return cmax;
  let lo = 0, hi = cmax;
  for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (imGamut(oklchZuSrgb(L, mid, h))) lo = mid; else hi = mid; }
  return lo;
}

export function hex(rgb) {
  return '#' + rgb.map(c => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function hexZuRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
}
export function leuchtdichte(h) {
  const [r, g, b] = hexZuRgb(h).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function kontrast(h1, h2) {
  const a = leuchtdichte(h1), b = leuchtdichte(h2);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
/** Farbe nach `filter: invert(1)` (Darstellung „Umgekehrte Farben“). */
export function umgekehrt(h) {
  return hex(hexZuRgb(h).map(c => 1 - c));
}

/*
 * Kachelfarben: kräftige Edelstein-Töne (hohe Chroma, mittleres L) mit heller Schrift.
 * Oben rechts etwas heller (Licht von rechts oben), unten links etwas dunkler mit leicht gedrehtem Ton.
 * Hoher Kontrast: einfarbig, dunkler, weiße Schrift (mindestens 7:1).
 */
export const KACHEL = {
  normal: { L1: 0.505, L2: 0.425, C: 0.2, dreh: 26, text: '#F1EBF7' },
  kontrast: { L: 0.36, C: 0.13, text: '#FFFFFF' }
};
export function kachelFarben(h, modus = 'normal') {
  if (modus === 'kontrast') {
    const k = KACHEL.kontrast, f = hex(oklchZuSrgb(k.L, maxChroma(k.L, h, k.C), h));
    return { k1: f, k2: f, text: k.text, glow: f };
  }
  const k = KACHEL.normal, h2 = (h + k.dreh) % 360;
  return {
    k1: hex(oklchZuSrgb(k.L1, maxChroma(k.L1, h, k.C), h)),
    k2: hex(oklchZuSrgb(k.L2, maxChroma(k.L2, h2, k.C), h2)),
    text: k.text,
    glow: hex(oklchZuSrgb(0.62, maxChroma(0.62, h, 0.16), h))
  };
}
