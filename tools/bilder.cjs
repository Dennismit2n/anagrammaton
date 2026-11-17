// Bildschirmfotos fuer die README: docs/screens-de.png und docs/screens-en.png
// Aufruf bei laufendem repos-static (Port 8625): node tools/bilder.cjs <pfad-zu-playwright>
// danach: python tools/webp.py
const path = require('path');
const { chromium } = require(process.argv[2] || 'playwright');

const FAELLE = [
  { lang: 'de', wort: 'Sterne', datei: 'screens-de.png' },
  { lang: 'en', wort: 'listen', datei: 'screens-en.png' },
];

(async () => {
  const browser = await chromium.launch();
  for (const f of FAELLE) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, colorScheme: 'dark', locale: f.lang, reducedMotion: 'reduce' });
    await ctx.addInitScript(([l]) => { try { localStorage.setItem('anagrammaton.sprache', l); localStorage.setItem('werkstatt.darstellung', 'dark'); } catch (e) {} }, [f.lang]);
    const page = await ctx.newPage();
    await page.goto(`http://localhost:8625/anagrammaton/#w=${encodeURIComponent(f.wort)}&l=${f.lang}`);
    await page.waitForTimeout(2500);
    const ziel = path.join(__dirname, '..', 'docs', f.datei);
    await page.screenshot({ path: ziel, clip: { x: 0, y: 0, width: 1280, height: 640 } });
    console.log(ziel);
    await ctx.close();
  }
  await browser.close();
})();
