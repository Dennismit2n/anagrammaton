"""Zeichnet die PNG-Icons von Anagrammaton (wie favicon.svg) mit 4-fachem Überabtasten.
Motiv: vier Buchstabenkacheln A N / A G auf dunklem Grund, die G-Kachel fliegt gerade ein.
Die Farben kommen aus engine.js (farbton je Buchstabe, OKLCH, im sRGB-Gamut).
Aufruf: python tools/icons.py [zielordner]
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ZIEL = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
GRUND = '#15121E'
SCHRIFT = '#F4EFFA'
FARBEN = {  # oben rechts, unten links
    'A': ('#8D55DD', '#8B1693'),
    'N': ('#CB3587', '#A6002F'),
    'G': ('#AF6600', '#6C5500'),
}


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def verlauf(groesse, oben, unten):
    """Diagonaler Verlauf von oben rechts nach unten links."""
    maske = Image.linear_gradient('L').rotate(-45, resample=Image.BICUBIC, expand=True)
    w = maske.size[0]
    maske = maske.crop((w // 2 - 91, w // 2 - 91, w // 2 + 91, w // 2 + 91)).resize((groesse, groesse), Image.BICUBIC)
    a = Image.new('RGB', (groesse, groesse), rgb(oben))
    b = Image.new('RGB', (groesse, groesse), rgb(unten))
    return Image.composite(b, a, maske)


def kachel(k, buchstabe):
    """Eine Kachel (22 Einheiten) mit Buchstabe als eigenes Bild."""
    g = round(22 * k)
    bild = Image.new('RGBA', (g, g), (0, 0, 0, 0))
    maske = Image.new('L', (g, g), 0)
    ImageDraw.Draw(maske).rounded_rectangle([0, 0, g - 1, g - 1], radius=4 * k, fill=255)
    bild.paste(verlauf(g, *FARBEN[buchstabe]), (0, 0), maske)
    d = ImageDraw.Draw(bild)
    w = round(2.6 * k)
    P = lambda x, y: (x * k, y * k)

    def linie(*pkte):
        d.line([P(*p) for p in pkte], fill=SCHRIFT, width=w, joint='curve')
        for p in pkte:
            x, y = P(*p)
            d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=SCHRIFT)

    if buchstabe == 'A':
        linie((5, 17), (11, 5), (17, 17))
        linie((7.6, 12.6), (14.4, 12.6))
    elif buchstabe == 'N':
        linie((6, 17), (6, 5), (16, 17), (16, 5))
    else:  # G
        r = 6.3
        d.arc([P(11 - r - 1.3, 11 - r - 1.3), P(11 + r + 1.3, 11 + r + 1.3)], 9, 327, fill=SCHRIFT, width=w)  # PIL zeichnet die Breite nach innen
        linie((11.6, 12), (17.2, 12))
        linie((16.3, 7.6), (16.3, 7.6))
    return bild


def icon(groesse, maskable=False):
    s = groesse * 4
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, s, s], fill=GRUND)
        k, off = s / 64 * 0.72, s * 0.14   # Inhalt in die sichere Zone (80 %) schieben
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=16 * s / 64, fill=GRUND)
        k, off = s / 64, 0
    plaetze = [('A', 9, 9, 0), ('N', 33, 9, 0), ('A', 9, 33, 0), ('G', 33, 33, -7)]
    # Schatten nach links unten
    schatten = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    for b, x, y, dreh in plaetze:
        t = Image.new('RGBA', (round(22 * k), round(22 * k)), (0, 0, 0, 0))
        ImageDraw.Draw(t).rounded_rectangle([0, 0, t.size[0] - 1, t.size[1] - 1], radius=4 * k, fill=(0, 0, 0, 115))
        t = t.rotate(-dreh, resample=Image.BICUBIC, expand=True)
        cx, cy = off + (x + 11 - 1.5) * k, off + (y + 11 + 2) * k
        schatten.alpha_composite(t, (round(cx - t.size[0] / 2), round(cy - t.size[1] / 2)))
    img.alpha_composite(schatten.filter(ImageFilter.GaussianBlur(1.2 * k)))
    for b, x, y, dreh in plaetze:
        t = kachel(k, b)
        if dreh:
            t = t.rotate(-dreh, resample=Image.BICUBIC, expand=True)
        cx, cy = off + (x + 11) * k, off + (y + 11) * k
        img.alpha_composite(t, (round(cx - t.size[0] / 2), round(cy - t.size[1] / 2)))
    return img.resize((groesse, groesse), Image.LANCZOS)


icon(192).save(ZIEL / 'icon-192.png')
icon(512).save(ZIEL / 'icon-512.png')
icon(512, True).save(ZIEL / 'icon-maskable.png')
print('ok')
