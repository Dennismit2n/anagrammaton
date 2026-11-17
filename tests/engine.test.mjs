// Tests der Engine: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  einheiten, schluessel, baueIndex, einWort, MehrwortSuche, vergleiche, rueckwaerts, istPalindrom,
  rueckwaertsWoerter, entdecken, mische, farbton, kachelFarben, kontrast, umgekehrt, autoWorte, SPRACHEN
} from '../engine.js';

const indizes = {};
function index(lang, akz = false) {
  const k = lang + akz;
  if (!indizes[k]) {
    const w = readFileSync(new URL(`../woerter/${lang}.txt`, import.meta.url), 'utf8').split('\n').filter(Boolean);
    indizes[k] = baueIndex(w, lang, akz);
  }
  return indizes[k];
}
function alleTreffer(ix, text, opts = {}) {
  const s = new MehrwortSuche(ix, text, opts);
  const aus = [];
  let r;
  do { r = s.schritt(200); aus.push(...r.neu); } while (!r.fertig);
  // Wie die Seite: verdrängte Treffer fallen beim Kürzen auf anzahl weg.
  return { treffer: aus.sort(vergleiche).slice(0, r.anzahl), grund: r.grund };
}
const multimenge = w => w.slice().sort().join(' ');

test('Türkisch: İ wird i, I wird ı', () => {
  assert.deepEqual(einheiten('İstanbul', 'tr'), ['i', 's', 't', 'a', 'n', 'b', 'u', 'l']);
  assert.deepEqual(einheiten('ILIK', 'tr'), ['ı', 'l', 'ı', 'k']);
  assert.deepEqual(einheiten('İ', 'de').length, 1);
});

test('Hindi: Einheiten sind Graphem-Cluster (Akshara)', () => {
  const u = einheiten('नमस्ते', 'hi');
  assert.equal(u.length, 3);
  assert.equal(u[2], 'स्ते');
  for (const e of u) assert.ok(!/^\p{M}/u.test(e), 'keine Einheit beginnt mit einem Vokalzeichen');
  assert.equal(rueckwaerts('नमस्ते', 'hi'), 'स्तेमन');
  assert.ok(einWort(index('hi'), 'करता').includes('तारक'));
});

test('Leerzeichen, Satzzeichen und Ziffern zählen nicht', () => {
  assert.deepEqual(einheiten('Ab, c! 12 d', 'de'), ['a', 'b', 'c', 'd']);
  assert.equal(schluessel(einheiten('Lager', 'de')), schluessel(einheiten('REGAL', 'de')));
});

test('Akzente gleich: nur auf Wunsch, ß, й und ñ bleiben, ё wird е', () => {
  assert.deepEqual(einheiten('Café', 'fr'), ['c', 'a', 'f', 'é']);
  assert.deepEqual(einheiten('Café', 'fr', true), ['c', 'a', 'f', 'e']);
  assert.deepEqual(einheiten('Straße', 'de', true), ['s', 't', 'r', 'a', 'ß', 'e']);
  assert.deepEqual(einheiten('ёлка', 'ru', true), ['е', 'л', 'к', 'а']);
  assert.deepEqual(einheiten('Йод', 'ru', true), ['й', 'о', 'д'], 'й bleibt й');
  assert.deepEqual(einheiten('Niño', 'es', true), ['n', 'i', 'ñ', 'o'], 'ñ bleibt ñ');
  assert.deepEqual(einheiten('mañana', 'es', true).filter(x => x === 'ñ').length, 1);
  assert.deepEqual(einheiten('会社', 'ja', true), ['会', '社'], 'nicht für CJK');
});

test('de: lager → regal', () => {
  const r = einWort(index('de'), 'Lager');
  assert.ok(r.includes('regal'));
  assert.ok(!r.includes('lager'), 'das Eingabewort selbst ist kein Treffer');
});

test('en: listen → silent, enlist, tinsel', () => {
  const r = einWort(index('en'), 'listen');
  for (const w of ['silent', 'enlist', 'tinsel']) assert.ok(r.includes(w), w);
  assert.ok(!r.includes('listen'));
});

test('zh: 蜂蜜 → 蜜蜂', () => {
  assert.deepEqual(einWort(index('zh'), '蜂蜜'), ['蜜蜂']);
});

test('ja: 会社 → 社会', () => {
  assert.ok(einWort(index('ja'), '会社').includes('社会'));
});

test('en: dormitory → dirty room (Mehrwort)', () => {
  const { treffer, grund } = alleTreffer(index('en'), 'dormitory');
  assert.equal(grund, 'alle');
  assert.ok(treffer.some(t => multimenge(t.w) === 'dirty room'));
});

test('Mehrwort: Multimengen entdoppelt, sortiert, Eingabe selbst fehlt', () => {
  const { treffer } = alleTreffer(index('en'), 'dirty room');
  const sig = treffer.map(t => multimenge(t.w));
  assert.equal(new Set(sig).size, sig.length, 'jede Multimenge nur einmal');
  assert.ok(!sig.includes('dirty room'), 'der Eingabesatz ist kein Treffer');
  for (let i = 1; i < treffer.length; i++) assert.ok(vergleiche(treffer[i - 1], treffer[i]) <= 0, 'sortiert');
  const ix = index('en');
  for (const t of treffer.slice(0, 50)) {
    assert.equal(schluessel(t.w.flatMap(w => einheiten(w, 'en'))), schluessel(einheiten('dirty room', 'en')));
    assert.ok(t.w.every(w => ix.form.has(w)));
  }
});

test('Mehrwort: Grenzen für Wortzahl, Mindestlänge, Pflichtwort und Trefferzahl', () => {
  const ix = index('en');
  const zwei = alleTreffer(ix, 'astronomer', { maxWorte: 2 }).treffer;
  assert.ok(zwei.length > 0 && zwei.every(t => t.w.length === 2));
  const lang = alleTreffer(ix, 'astronomer', { maxWorte: 3, minLaenge: 5 }).treffer;
  assert.ok(lang.every(t => t.w.every(w => w.length >= 5)));
  const pf = alleTreffer(ix, 'astronomer', { maxWorte: 3, pflicht: 'moon' }).treffer;
  assert.ok(pf.length > 0 && pf.every(t => t.w[0] === 'moon'));
  assert.equal(alleTreffer(ix, 'astronomer', { pflicht: 'zebra' }).grund, 'pflicht');
  const g = alleTreffer(ix, 'astronomer', { maxWorte: 4, minLaenge: 2, grenze: 50 });
  assert.equal(g.treffer.length, 50);
  assert.equal(g.grund, 'grenze');
});

test('Grenze: die besten Treffer nach Rangsumme bleiben (en conversation enthält non star voice)', () => {
  const ix = index('en');
  const voll = alleTreffer(ix, 'conversation', { maxWorte: 3, grenze: 1e9 });
  assert.equal(voll.grund, 'alle');
  const g = alleTreffer(ix, 'conversation', { maxWorte: 3, grenze: 3000 });
  assert.equal(g.grund, 'grenze');
  assert.equal(g.treffer.length, 3000);
  assert.deepEqual(g.treffer.map(t => t.w.length + ':' + t.r), voll.treffer.slice(0, 3000).map(t => t.w.length + ':' + t.r), 'dieselben Rangsummen wie die besten 3000');
  assert.ok(g.treffer.some(t => multimenge(t.w) === 'non star voice'));
});

// Lange Sätze wie im Worker (schritt(25), Budget 4 s, Wortgrenze „Auto“): Treffer kommen schnell.
const SAETZE = [
  ['de', 'Anagramme machen wirklich gute Laune heute'],
  ['en', 'the quick brown fox jumps over the lazy dog'],
  ['ru', 'Мороз и солнце день чудесный еще ты дремлешь'],
  ['fr', 'Les anagrammes rendent la vie plus amusante']
];
for (const [lang, satz] of SAETZE) {
  test(`Lange Eingabe ${lang}: mindestens 20 Treffer im Budget, der erste in unter 1 s`, () => {
    const ix = index(lang);
    const t0 = performance.now();
    const s = new MehrwortSuche(ix, satz, { maxWorte: 0 });
    assert.ok(s.maxWorte > 3, 'Auto lässt bei langen Sätzen mehr Wörter zu');
    const aus = [];
    let erst = null, r, maxSchritt = 0;
    for (;;) {
      const a = performance.now();
      r = s.schritt(25);
      maxSchritt = Math.max(maxSchritt, performance.now() - a);
      aus.push(...r.neu);
      if (erst === null && r.neu.length) erst = performance.now() - t0;
      if (r.fertig || r.anzahl >= 20 || performance.now() - t0 > 4000) break;
    }
    assert.ok(r.anzahl >= 20, `${r.anzahl} Treffer`);
    assert.ok(erst !== null && erst < 1000, `erster Treffer nach ${erst} ms`);
    assert.ok(maxSchritt < 60, `längster Schritt ${maxSchritt.toFixed(1)} ms`);
    const ziel = schluessel(einheiten(satz, lang));
    const treffer = aus.sort(vergleiche).slice(0, r.anzahl);
    const sig = treffer.map(t => multimenge(t.w));
    assert.equal(new Set(sig).size, sig.length, 'jede Multimenge nur einmal');
    for (const t of treffer) {
      assert.equal(schluessel(t.w.flatMap(w => einheiten(w, lang))), ziel, t.w.join(' '));
      assert.ok(t.w.length >= 2 && t.w.length <= s.maxWorte && t.w.every(w => einheiten(w, lang).length >= 3));
    }
  });
}

test('Vorlauf ändert das Endergebnis nicht (de Anagramme machen Laune, 4 Wörter)', async () => {
  const ix = index('de');
  const ohne = alleTreffer(ix, 'Anagramme machen Laune', { maxWorte: 4, vorlauf: 0 });
  const s = new MehrwortSuche(ix, 'Anagramme machen Laune', { maxWorte: 4 });
  // Die Stufen laufen kurz an und sind nach 300 ms nicht fertig: der Vorlauf unterbricht sie mittendrin.
  const aus = [];
  let r = s.schritt(2);
  aus.push(...r.neu);
  assert.equal(r.fertig, false);
  await new Promise(ok => setTimeout(ok, 350));
  do { r = s.schritt(25); aus.push(...r.neu); } while (!r.fertig);
  assert.ok(s.gefunden.size > 0, 'der Vorlauf hat Treffer geliefert');
  const mit = aus.sort(vergleiche).slice(0, r.anzahl);
  assert.equal(r.grund, ohne.grund);
  assert.deepEqual(mit.map(t => t.w.length + ':' + t.r), ohne.treffer.map(t => t.w.length + ':' + t.r));
  const sig = mit.map(t => multimenge(t.w));
  assert.equal(new Set(sig).size, sig.length, 'keine Dopplung aus Vorlauf und Stufen');
});

test('Auto-Wortgrenze: 3 bei kurzen Eingaben, mehr bei langen, höchstens 8', () => {
  assert.equal(autoWorte(9), 3);
  assert.equal(autoWorte(18), 3);
  assert.equal(autoWorte(20), 4);
  assert.equal(autoWorte(40), 7);
  assert.equal(autoWorte(60), 8);
  const ix = index('en');
  const auto = alleTreffer(ix, 'dirty room', { maxWorte: 0 }).treffer.map(t => multimenge(t.w));
  const drei = alleTreffer(ix, 'dirty room', { maxWorte: 3 }).treffer.map(t => multimenge(t.w));
  assert.deepEqual(auto, drei);
});

test('Abbruch einer laufenden Suche', () => {
  const s = new MehrwortSuche(index('en'), 'the quick brown fox jumps over the lazy dog', { maxWorte: 5, minLaenge: 2 });
  const r1 = s.schritt(5);
  assert.equal(r1.fertig, false, 'nach 5 ms noch nicht fertig');
  s.abbrechen();
  const r2 = s.schritt(1000);
  assert.equal(r2.fertig, true);
  assert.equal(r2.grund, 'abbruch');
  assert.equal(r2.neu.length, 0);
});

test('de: Reliefpfeiler ist ein Palindrom, auch „Ein Esel lese nie“', () => {
  assert.ok(istPalindrom('Reliefpfeiler', 'de'));
  assert.ok(istPalindrom('Ein Esel lese nie!', 'de'));
  assert.ok(!istPalindrom('Lager', 'de'));
  assert.equal(rueckwaerts('Lager', 'de'), 'regal');
});

test('de: lager ↔ regal als Rückwärtswort', () => {
  assert.deepEqual(rueckwaertsWoerter(index('de'), 'Lager'), [{ wort: 'lager', rueck: 'regal' }]);
  const satz = rueckwaertsWoerter(index('de'), 'Ein Esel lese nie').map(p => p.wort + '>' + p.rueck);
  assert.ok(satz.includes('esel>lese') && satz.includes('ein>nie'));
});

test('Entdecken: geläufigste Palindrome und Rückwärtspaare ab 3 Einheiten', () => {
  const e = entdecken(index('de'), 12);
  assert.equal(e.palindrome.length, 12);
  assert.ok(e.palindrome.every(w => istPalindrom(w, 'de') && einheiten(w, 'de').length >= 3));
  assert.ok(e.paare.some(([a, b]) => (a === 'egal' && b === 'lage') || (a === 'lage' && b === 'egal')), 'egal ↔ lage');
  assert.ok(!e.paare.some(([a]) => a === 'die' || a === 'ist'), 'kein Paar mit seltenem Partner wie eid oder tsi');
  for (const [a, b] of e.paare) assert.equal(rueckwaerts(a, 'de'), b);
  for (const l of SPRACHEN) {
    for (const w of entdecken(index(l), 12).palindrome) assert.ok(new Set(einheiten(w, l)).size > 1, l + ' ' + w);
  }
});

test('Worker: Abbrechen während die Wortliste lädt endet sofort mit abbruch', async () => {
  const log = [];
  let laden;
  globalThis.self = { postMessage: m => log.push(m) };
  const fetchVorher = globalThis.fetch;
  globalThis.fetch = () => new Promise(r => { laden = r; });
  try {
    await import('../worker.js');
    self.onmessage({ data: { typ: 'suche', id: 1, lang: 'de', akz: false, text: 'Kraftfahrzeughaftpflichtversicherung', maxWorte: 5, minLaenge: 3, pflicht: '' } });
    self.onmessage({ data: { typ: 'abbrechen', id: 1 } });
    const t = readFileSync(new URL('../woerter/de.txt', import.meta.url), 'utf8');
    laden({ ok: true, text: async () => t });
    for (let i = 0; i < 200 && !log.some(m => m.typ === 'fertig'); i++) await new Promise(r => setTimeout(r, 10));
    const f = log.find(m => m.typ === 'fertig');
    assert.ok(f, 'fertig kommt');
    assert.equal(f.grund, 'abbruch');
    assert.ok(!log.some(m => m.typ === 'schub'), 'keine Mehrwortsuche');
  } finally {
    globalThis.fetch = fetchVorher;
    delete globalThis.self;
  }
});

test('Mischen: Fisher-Yates mit crypto, nie gleich der Eingabe', () => {
  const ein = ['l', 'a', 'g', 'e', 'r'];
  for (let i = 0; i < 300; i++) {
    const m = mische(ein);
    assert.equal(schluessel(m), schluessel(ein));
    assert.notDeepEqual(m, ein);
  }
  assert.deepEqual(mische(['a', 'a', 'a']), ['a', 'a', 'a']);
  const zwei = mische(['a', 'b']);
  assert.deepEqual(zwei, ['b', 'a']);
});

test('Farben: fester Ton je Einheit, Schrift auf jeder Kachel mindestens 4,5:1', () => {
  assert.equal(farbton('a'), farbton('a'));
  assert.notEqual(farbton('e'), farbton('n'));
  for (const u of ['a', 'ä', 'ß', 'ı', 'स्ते', '蜂', '한', 'ё']) {
    const h = farbton(u);
    assert.ok(h >= 0 && h < 360, u + ' ' + h);
  }
  for (let h = 0; h < 360; h += 0.5) {
    const f = kachelFarben(h);
    assert.ok(kontrast(f.k1, f.text) >= 4.5 && kontrast(f.k2, f.text) >= 4.5, `normal ${h}`);
    assert.ok(kontrast(umgekehrt(f.k1), umgekehrt(f.text)) >= 4.5 && kontrast(umgekehrt(f.k2), umgekehrt(f.text)) >= 4.5, `umgekehrt ${h}`);
    const k = kachelFarben(h, 'kontrast');
    assert.ok(kontrast(k.k1, k.text) >= 7, `hoher Kontrast ${h}`);
  }
});

test('Alle 14 Wortlisten laden und liefern einen Index', () => {
  for (const l of SPRACHEN) {
    const ix = index(l);
    assert.ok(ix.woerter.length > 20000, l);
  }
});
