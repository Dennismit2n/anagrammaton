"""Baut die Wortlisten fuer Anagrammaton aus wordfreq (CC BY-SA 4.0).
Aufruf: wfenv/Scripts/python woerter.py <zielordner> <ldnoobw-ordner>
"""
import sys, os, unicodedata, json
import regex
sys.stdout.reconfigure(encoding="utf-8")
from wordfreq import top_n_list, zipf_frequency

ZIEL, SPERR = sys.argv[1], sys.argv[2]
os.makedirs(ZIEL, exist_ok=True)

SCHRIFT = {
    'latn': r'^[\p{Latin}\p{M}]+$',
    'cyrl': r'^[\p{Cyrillic}\p{M}]+$',
    'deva': r'^[\p{Devanagari}]+$',
    'hani': r'^[\p{Han}]+$',
    'jpan': r'^[\p{Han}\p{Hiragana}\p{Katakana}ー]+$',
    'hang': r'^[\p{Hangul}]+$',
}
SPRACHEN = {
    'de': ('latn', 70000), 'en': ('latn', 70000), 'es': ('latn', 70000), 'fr': ('latn', 70000),
    'it': ('latn', 70000), 'nl': ('latn', 70000), 'pl': ('latn', 70000), 'pt': ('latn', 70000),
    'tr': ('latn', 70000), 'ru': ('cyrl', 70000), 'hi': ('deva', 40000),
    'zh': ('hani', 40000), 'ja': ('jpan', 40000), 'ko': ('hang', 40000),
}
# Einbuchstabige Woerter, die als Teil von Mehrwort-Anagrammen erlaubt sind
EINZEL = {
    'en': {'a', 'i'}, 'es': {'a', 'o', 'y', 'e', 'u'}, 'it': {'a', 'e', 'o', 'i'},
    'pt': {'a', 'e', 'o'}, 'pl': {'a', 'i', 'o', 'u', 'w', 'z'}, 'fr': {'a', 'à', 'y'},
    'ru': {'а', 'в', 'и', 'к', 'о', 'с', 'у', 'я'},
}
MAXLAENGE = 18

def sperrliste(lang):
    worte = set()
    for datei in (lang, 'en'):
        pfad = os.path.join(SPERR, datei + '.txt')
        if os.path.exists(pfad):
            for z in open(pfad, encoding='utf-8'):
                z = unicodedata.normalize('NFC', z.strip().lower())
                if z and ' ' not in z:
                    worte.add(z)
    return worte

bericht = {}
for lang, (schrift, n) in SPRACHEN.items():
    muster = regex.compile(SCHRIFT[schrift])
    gesperrt = sperrliste(lang)
    gesehen, aus = set(), []
    for w in top_n_list(lang, n, wordlist='large' if lang in ('de','en','es','fr','it','nl','pl','pt','ru','zh','ja') else 'best'):
        w = unicodedata.normalize('NFC', w.lower())
        if w in gesehen or not muster.match(w):
            continue
        g = regex.findall(r'\X', w)
        if len(g) > MAXLAENGE:
            continue
        if len(g) < 2 and w not in EINZEL.get(lang, set()):
            continue
        if w in gesperrt or any(len(s) >= 5 and s in w for s in gesperrt if schrift == 'latn'):
            continue
        gesehen.add(w)
        aus.append(w)
    with open(os.path.join(ZIEL, lang + '.txt'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(aus) + '\n')
    bericht[lang] = len(aus)
    print(lang, len(aus), aus[:12])
print(json.dumps(bericht))
