// tools/sprachen.cjs: Rauchtest aller 14 Oberflächensprachen im echten Browser.
//
//   node tools/sprachen.cjs [basis-url]      (Standard http://localhost:8625/anagrammaton/)
//   Playwright kommt aus node_modules oder aus der Umgebungsvariable PLAYWRIGHT (Pfad zum Paket).
//
// Je Sprache × 320 und 1280 px: erstes Beispielwort der Sprache antippen, alle drei Reiter
// ansehen, Treffer müssen kommen. Geprüft wird: kein seitlicher Überlauf (Seite, Spielknöpfe,
// Treffer, Chips), keine Konsolenfehler, keine rohen i18n-Schlüssel, Klick auf einen Treffer,
// Mischen, Invert, Reverse und Ausgangsstellung. Dazu einmal: Der Fokus bleibt auf einem
// Treffer, während die Mehrwortsuche nachliefert. Exitcode 1 bei Befund.

const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const BASIS = process.argv[2] || 'http://localhost:8625/anagrammaton/';
const SPRACHEN = ['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'tr', 'ru', 'hi', 'zh', 'ja', 'ko'];
const BREITEN = [320, 1280];
const befunde = [];
const notiz = (wo, was) => { befunde.push(wo + ': ' + was); };

// Wartet, bis die Suche durch ist: Abbrechen-Knopf weg, Fortschrittsbalken voll.
async function sucheFertig(page) {
  await page.waitForFunction(() => {
    const b = document.getElementById('balken');
    return document.getElementById('stopp').hidden && parseFloat(b.style.width) === 100;
  }, null, { timeout: 15000 });
  await page.waitForTimeout(600);   // Listen erneuern sich höchstens alle 0,5 s
}

// Überlauf: Seite insgesamt und jedes Bauteil in sich (Text, der aus seinem Kasten ragt).
function ueberlauf() {
  const out = [];
  const w = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > w + 1) out.push('Seite ' + document.documentElement.scrollWidth + ' > ' + w);
  const sichtbar = e => e.getClientRects().length && getComputedStyle(e).visibility === 'visible';
  const name = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ').join('.') : '');
  for (const e of document.querySelectorAll('body *')) {
    if (!sichtbar(e) || e.closest('.vh, .aurora')) continue;
    const r = e.getBoundingClientRect();
    if (r.width && r.right > w + 1) { out.push(name(e) + ' rechts ' + Math.round(r.right)); continue; }
    if (r.width && r.left < -1) { out.push(name(e) + ' links ' + Math.round(r.left)); continue; }
  }
  // Bauteile in sich: Inhalt breiter als der Kasten
  for (const e of document.querySelectorAll('.spielknopf, .spielknopf span, .knopf, .t, .spielen, .chip, .reiter button, select, .wahl, .kachel, .rueck-text, .urteil, .hinweis, #stand')) {
    if (!sichtbar(e)) continue;
    if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible' || e.scrollWidth > e.clientWidth + 1 && e.tagName !== 'SELECT') {
      out.push(name(e) + ' Inhalt ' + e.scrollWidth + ' > ' + e.clientWidth + ' „' + e.textContent.trim().slice(0, 24) + '“');
    }
    const r = e.getBoundingClientRect();
    for (const k of e.children) {
      if (!sichtbar(k)) continue;
      const q = k.getBoundingClientRect();
      if (q.right > r.right + 1 || q.left < r.left - 1) out.push(name(k) + ' ragt aus ' + name(e) + ' „' + k.textContent.trim().slice(0, 24) + '“');
    }
  }
  return [...new Set(out)].slice(0, 6);
}

// Rohe Schlüssel: sichtbare Texte, die wie ein Schlüssel aussehen, leere data-i-Felder, „undefined“.
function rohe() {
  const out = [];
  const keys = new Set([...document.querySelectorAll('[data-i]')].map(e => e.dataset.i));
  for (const e of document.querySelectorAll('[data-i]')) {
    if (!e.getClientRects().length || e.closest('[hidden]')) continue;
    const t = e.textContent.trim();
    if (!t) out.push('leer [data-i=' + e.dataset.i + ']');
    else if (keys.has(t) && t !== t.charAt(0).toUpperCase() + t.slice(1)) out.push('Schlüssel ' + t);
  }
  const text = document.body.innerText;
  for (const m of text.matchAll(/\b[a-z]+[A-Z][A-Za-z]*\b|undefined|NaN|\[object/g)) out.push('Text „' + m[0] + '“');
  for (const e of document.querySelectorAll('[aria-label], [title], [placeholder]')) {
    for (const a of ['aria-label', 'title', 'placeholder']) {
      const v = e.getAttribute(a);
      if (v !== null && (!v.trim() || /undefined|NaN|\[object|^[a-z]+[A-Z]\w*$/.test(v))) out.push(a + ' „' + v + '“ an ' + (e.id || e.className));
    }
  }
  for (const o of document.querySelectorAll('#darstellung option, #sprache option, #wb option')) if (!o.textContent.trim()) out.push('leere Option ' + o.value);
  return [...new Set(out)].slice(0, 6);
}

const reihe = page => page.$$eval('#kacheln .kachel', ks => ks.map(k => k.textContent).join(''));
const ruhe = page => page.waitForFunction(() => document.getAnimations().filter(a => a.playState === 'running').length === 0, null, { timeout: 4000 }).catch(() => {});

async function eineSprache(browser, lang, breite) {
  const wo = `${lang} ${breite}px`;
  const ctx = await browser.newContext({ viewport: { width: breite, height: 900 }, colorScheme: 'dark', locale: 'de-DE' });
  const page = await ctx.newPage();
  const fehler = [];
  page.on('console', m => { if (m.type() === 'error') fehler.push(m.text()); });
  page.on('pageerror', e => fehler.push('pageerror ' + e.message));
  await page.addInitScript(l => { try { localStorage.setItem('anagrammaton.sprache', l); } catch (e) {} }, lang);
  await page.goto(BASIS, { waitUntil: 'load' });

  // Leerer Zustand: Beispiele da, kein Überlauf
  await page.locator('#beispiele .chip').first().waitFor({ timeout: 5000 });
  for (const u of await page.evaluate(ueberlauf)) notiz(wo + ' leer', 'Überlauf ' + u);
  for (const r of await page.evaluate(rohe)) notiz(wo + ' leer', r);

  const wort = await page.locator('#beispiele .chip').first().getAttribute('data-w');
  await page.locator('#beispiele .chip').first().click();
  await sucheFertig(page);
  const eingabe = await reihe(page);

  const zahlen = {};
  for (const tab of ['ein', 'mehr', 'rueck']) {
    await page.click('#tab-' + tab);
    await page.waitForTimeout(150);
    zahlen[tab] = await page.locator('#l-' + tab + ' li').count();
    for (const u of await page.evaluate(ueberlauf)) notiz(`${wo} ${wort} Reiter ${tab}`, 'Überlauf ' + u);
    for (const r of await page.evaluate(rohe)) notiz(`${wo} ${wort} Reiter ${tab}`, r);
  }
  const ent = await page.locator('#e-pal .chip, #e-paare .chip').count();
  if (zahlen.ein + zahlen.mehr + zahlen.rueck === 0) notiz(wo, `keine Treffer für „${wort}“`);
  if (!ent) notiz(wo, 'Entdecken-Liste leer');

  // Ein Treffer auf die Bühne: erst Ein Wort, sonst Mehrere Wörter
  const tab = zahlen.ein ? 'ein' : zahlen.mehr ? 'mehr' : null;
  if (tab) {
    await page.click('#tab-' + tab);
    const b = page.locator(`#l-${tab} .spielen`).first();
    const ziel = await b.getAttribute('data-t');
    await b.click();
    await ruhe(page);
    const auf = await reihe(page);
    // Kacheln zeigen Großbuchstaben (ß als ẞ): klein geschrieben muss die Folge dem Treffer gleichen
    const klein = s => s.replace(/\s+/g, '').replace(/ẞ/g, 'ß').toLocaleLowerCase(lang);
    if (klein(auf) !== klein(ziel)) notiz(wo, `Treffer „${ziel}“ zeigt Bühne „${auf}“`);
    const bt = await page.textContent('#buehne-text');
    if (!klein(bt).includes(klein(ziel))) notiz(wo, `Ansage passt nicht zu „${ziel}“: ${bt}`);
  } else notiz(wo, 'kein spielbarer Treffer');

  // Spielknöpfe
  const vorMischen = await reihe(page);
  await page.click('#mischen'); await ruhe(page);
  const gemischt = await reihe(page);
  if ([...gemischt].sort().join('') !== [...vorMischen].sort().join('')) notiz(wo, `Mischen ändert die Buchstaben: ${vorMischen} → ${gemischt}`);
  if (gemischt === vorMischen && new Set([...vorMischen]).size > 1) notiz(wo, 'Mischen ohne Wirkung');

  const farbeVor = await page.$eval('#kacheln .kachel', k => k.style.getPropertyValue('--k1'));
  await page.click('#invert'); await page.waitForTimeout(800);
  const farbeNach = await page.$eval('#kacheln .kachel', k => k.style.getPropertyValue('--k1'));
  if (await page.getAttribute('#invert', 'aria-pressed') !== 'true') notiz(wo, 'Invert ohne aria-pressed');
  if (farbeVor === farbeNach) notiz(wo, 'Invert ändert die Kachelfarbe nicht');
  if (!/inv=1/.test(page.url())) notiz(wo, 'Invert fehlt im Link-Anker');

  const vorRev = await reihe(page);
  await page.click('#reverse'); await ruhe(page);
  const rev = await reihe(page);
  if (await page.getAttribute('#reverse', 'aria-pressed') !== 'true') notiz(wo, 'Reverse ohne aria-pressed');
  const segs = s => [...new Intl.Segmenter(lang, { granularity: 'grapheme' }).segment(s)].map(x => x.segment);
  if (rev !== segs(vorRev).reverse().join('')) notiz(wo, `Reverse: ${vorRev} → ${rev}`);
  if (await page.getAttribute('#tab-rueck', 'aria-selected') !== 'true') notiz(wo, 'Reverse wechselt nicht zum Reiter Rückwärts');
  for (const u of await page.evaluate(ueberlauf)) notiz(wo + ' nach Reverse', 'Überlauf ' + u);

  await page.click('#ausgang'); await ruhe(page);
  if (await reihe(page) !== eingabe) notiz(wo, `Ausgangsstellung zeigt ${await reihe(page)} statt ${eingabe}`);
  if (await page.getAttribute('#reverse', 'aria-pressed') !== 'false') notiz(wo, 'Ausgangsstellung lässt Reverse an');
  await page.click('#invert'); await page.waitForTimeout(800);
  if (await page.getAttribute('#invert', 'aria-pressed') !== 'false') notiz(wo, 'Invert geht nicht zurück');
  for (const u of await page.evaluate(ueberlauf)) notiz(wo + ' Ende', 'Überlauf ' + u);

  if (fehler.length) notiz(wo, 'Konsole: ' + [...new Set(fehler)].slice(0, 3).join(' | '));
  await ctx.close();
  return { wort, ...zahlen, ent };
}

// Fokus während die Mehrwortsuche nachliefert: Satz mit vier Wörtern höchstens, Fokus auf den letzten Treffer,
// dann bis zum Ende der Suche alle 100 ms nachsehen, wo der Fokus steht.
async function fokusTest(browser, breite, lang, satz) {
  const wo = `Fokus ${lang} ${breite}px`;
  const ctx = await browser.newContext({ viewport: { width: breite, height: 900 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', e => fehler.push(e.message));
  await page.addInitScript(l => { try { localStorage.setItem('anagrammaton.sprache', l); } catch (e) {} }, lang);
  await page.goto(BASIS + '#w=' + encodeURIComponent(satz) + '&l=' + lang, { waitUntil: 'load' });
  await page.click('#tab-mehr');
  await sucheFertig(page);
  // Mit vier Wörtern läuft die Suche bis ans Zeitbudget und liefert dabei laufend nach
  await page.selectOption('#maxw', '4');
  await page.locator('#l-mehr .spielen').first().waitFor({ timeout: 10000 });
  if (await page.locator('#stopp').isHidden()) { notiz(wo, 'Suche schon fertig, Fokus nicht prüfbar'); await ctx.close(); return; }
  // Den letzten Treffer nehmen: der wird am ehesten von besseren verdrängt
  await page.waitForTimeout(1200);
  await page.locator('#l-mehr .spielen').last().focus();
  const t0 = await page.evaluate(() => document.activeElement.dataset.t);
  let proben = 0, weg = 0, letzt = '';
  const ende = Date.now() + 6000;
  while (Date.now() < ende) {
    const s = await page.evaluate(() => ({ ok: !!document.activeElement.closest('#l-mehr') && document.activeElement.dataset.t !== undefined, wo: document.activeElement.id || document.activeElement.className, lauf: !document.getElementById('stopp').hidden }));
    proben++;
    if (!s.ok) { weg++; letzt = s.wo; }
    if (!s.lauf) break;
    await page.waitForTimeout(100);
  }
  if (weg) notiz(wo, `Fokus ${weg}× von ${proben} Proben nicht auf einem Treffer (zuletzt ${letzt})`);
  const t1 = await page.evaluate(() => document.activeElement.dataset.t);
  console.log(`${wo}: ${proben} Proben, Fokus auf „${t0}“ → „${t1}“`);
  if (fehler.length) notiz(wo, 'Konsole: ' + fehler.join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  for (const lang of SPRACHEN) for (const breite of BREITEN) {
    try {
      const r = await eineSprache(browser, lang, breite);
      console.log(`${lang} ${breite}px „${r.wort}“: ein ${r.ein}, mehr ${r.mehr}, rück ${r.rueck}, entdecken ${r.ent}`);
    } catch (e) { notiz(`${lang} ${breite}px`, 'Abbruch: ' + e.message.split('\n')[0]); }
  }
  for (const breite of BREITEN) {
    try { await fokusTest(browser, breite, 'de', 'Anagramme machen gute Laune'); } catch (e) { notiz('Fokus ' + breite, 'Abbruch: ' + e.message.split('\n')[0]); }
  }
  await browser.close();
  if (befunde.length) {
    console.log(befunde.length + ' Befunde:');
    for (const b of befunde) console.log('  ' + b);
    process.exitCode = 1;
  } else console.log('ohne Befund');
})();
