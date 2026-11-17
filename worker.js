/*
 * Anagrammaton: Modul-Worker. Lädt woerter/<lang>.txt, baut den Index und sucht.
 * Eine neue Suche bricht die alte ab. Die Mehr-Wort-Suche läuft in Häppchen (schritt),
 * dazwischen nimmt der Worker Nachrichten an. Zeitbudget 4 s, höchstens 3.000 Treffer.
 */
import { baueIndex, einWort, MehrwortSuche, rueckwaertsWoerter, entdecken, SPRACHEN } from './engine.js';

const BUDGET = 4000;
const GRENZE = 3000;
const listen = new Map();   // lang → Promise<string[]>
const indizes = new Map();  // lang|akz → Promise<Index>, höchstens drei behalten
let aktuell = 0;
let laufend = null;
let abgebrochen = 0;        // id einer Suche, die abgebrochen wurde, bevor sie lief (Wortliste lädt noch)

const post = m => self.postMessage(m);
const pause = () => new Promise(r => setTimeout(r, 0));

function liste(lang) {
  if (!listen.has(lang)) {
    const p = fetch(`./woerter/${lang}.txt`).then(r => {
      if (!r.ok) throw new Error(String(r.status));
      return r.text();
    }).then(t => t.split('\n').map(w => w.trim()).filter(Boolean));
    p.catch(() => listen.delete(lang));
    listen.set(lang, p);
  }
  return listen.get(lang);
}

function index(lang, akz) {
  const k = lang + '|' + (akz ? 1 : 0);
  if (indizes.has(k)) {
    const p = indizes.get(k);
    indizes.delete(k); indizes.set(k, p);   // zuletzt benutzt nach hinten
    return { p, neu: false };
  }
  const p = liste(lang).then(w => {
    const ix = baueIndex(w, lang, akz);
    ix.entdecken = entdecken(ix, 12);
    return ix;
  });
  p.catch(() => indizes.delete(k));
  indizes.set(k, p);
  while (indizes.size > 3) indizes.delete(indizes.keys().next().value);
  return { p, neu: true };
}

async function suche(m) {
  const id = m.id;
  aktuell = id;
  if (laufend) { laufend.abbrechen(); laufend = null; }
  if (!SPRACHEN.includes(m.lang)) return;
  const { p, neu } = index(m.lang, m.akz);
  if (neu) post({ typ: 'laedt', id });
  let ix;
  try { ix = await p; } catch (e) { if (id === aktuell) post({ typ: 'fehler', id }); return; }
  if (id !== aktuell) return;

  post({ typ: 'entdecken', id, lang: m.lang, ...ix.entdecken });
  post({ typ: 'einwort', id, treffer: einWort(ix, m.text) });
  post({ typ: 'rueck', id, treffer: rueckwaertsWoerter(ix, m.text) });
  if (abgebrochen === id) { post({ typ: 'fertig', id, grund: 'abbruch', anzahl: 0 }); return; }

  const s = new MehrwortSuche(ix, m.text, { maxWorte: m.maxWorte, minLaenge: m.minLaenge, pflicht: m.pflicht, grenze: GRENZE });
  laufend = s;
  const start = performance.now();
  let puffer = [], zuletzt = start;
  for (;;) {
    const r = s.schritt(25);
    if (r.neu.length) puffer = puffer.concat(r.neu);
    if (id !== aktuell) return;   // abgelöst: keine weiteren Nachrichten
    const t = performance.now();
    const zeitAus = !r.fertig && t - start > BUDGET;
    if (r.fertig || zeitAus) {
      post({ typ: 'schub', id, treffer: puffer, anzahl: r.anzahl, stufe: r.stufe });
      post({ typ: 'fertig', id, grund: zeitAus ? 'zeit' : r.grund, anzahl: r.anzahl });
      if (laufend === s) laufend = null;
      return;
    }
    if (t - zuletzt > 150) {
      post({ typ: 'schub', id, treffer: puffer, anzahl: r.anzahl, stufe: r.stufe, zeit: t - start });
      puffer = []; zuletzt = t;
    }
    await pause();
  }
}

self.onmessage = e => {
  const m = e.data || {};
  if (m.typ === 'suche') suche(m);
  else if (m.typ === 'abbrechen' && m.id === aktuell) { abgebrochen = m.id; if (laufend) laufend.abbrechen(); }
};
