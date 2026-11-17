# Lizenz der Wortlisten

Die Dateien `de.txt`, `en.txt`, `es.txt`, `fr.txt`, `it.txt`, `nl.txt`, `pl.txt`, `pt.txt`, `tr.txt`, `ru.txt`, `hi.txt`, `zh.txt`, `ja.txt` und `ko.txt` in diesem Ordner sind eine Bearbeitung der Daten von **wordfreq**.

## Quelle

- **wordfreq** von Robyn Speer, https://github.com/rspeer/wordfreq
- Lizenz der Daten: **Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**, https://creativecommons.org/licenses/by-sa/4.0/
- Zitat: Robyn Speer (2022), rspeer/wordfreq v3.0, Zenodo, doi:10.5281/zenodo.7199437
- wordfreq stützt sich auf viele Quellen, unter anderem Wikipedia, Nachrichten, Webtexte aus OSCAR, Reddit und Twitter. Die vollständigen Einzelnachweise stehen in der README von wordfreq. Ausdrücklich zu nennen sind:
  - **SUBTLEX**: Die Listen SUBTLEX-US, SUBTLEX-UK, SUBTLEX-CH, SUBTLEX-DE und SUBTLEX-NL stammen von Marc Brysbaert und Mitautoren und sind frei verfügbar, http://crr.ugent.be/programs-data/subtitle-frequencies. Autoren: Brysbaert und New (2009); Brysbaert, Buchmeier, Conrad, Jacobs, Bölte und Böhl (2011); Cai und Brysbaert (2010); Keuleers, Brysbaert und New (2010); van Heuven, Mandera, Keuleers und Brysbaert (2014).
  - **OpenSubtitles**: Untertitel aus OPUS OpenSubtitles 2018, http://opus.nlpl.eu/OpenSubtitles.php, Daten des Projekts OpenSubtitles, http://www.opensubtitles.org/
  - **Google Books Ngram Viewer**: http://books.google.com/ngrams

## Was geändert wurde

Gebaut mit `tools/woerter.py`:

- je Sprache die häufigsten Wörter aus wordfreq (`top_n_list`), nach Häufigkeit sortiert, ein Wort je Zeile
- klein geschrieben und in Unicode-NFC gebracht, doppelte Einträge entfernt
- nur Wörter aus der Schrift der Sprache (Latein, Kyrillisch, Devanagari, Han, Kana, Hangul), höchstens 18 Graphem-Cluster
- einbuchstabige Wörter entfernt, außer einer kleinen Liste echter Einbuchstaben-Wörter (zum Beispiel englisch „a“ und „i“)
- Schimpfwörter und anstößige Wörter herausgefiltert, siehe unten

Die bearbeiteten Listen stehen unter derselben Lizenz wie die Quelle: **CC BY-SA 4.0**.

## Filter

Zum Herausfiltern diente die **List of Dirty, Naughty, Obscene, and Otherwise Bad Words (LDNOOBW)** von Shutterstock und Mitwirkenden, https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words, Lizenz **Creative Commons Attribution 4.0 International (CC BY 4.0)**, https://creativecommons.org/licenses/by/4.0/. Die Filterliste selbst ist hier nicht enthalten.

## Hinweis

Die Listen stammen aus echten Texten. Darum stehen auch Namen, Abkürzungen, Fremdwörter und seltene Formen darin, und ein Filter erwischt nie alles.

Der Programmcode von Anagrammaton steht unter der MIT-Lizenz und ist davon getrennt.

## English

The word lists in this folder are adapted from **wordfreq** by Robyn Speer (https://github.com/rspeer/wordfreq; cite as Robyn Speer (2022), rspeer/wordfreq v3.0, Zenodo, doi:10.5281/zenodo.7199437) and are licensed under **CC BY-SA 4.0**. wordfreq includes data from the SUBTLEX lists by Marc Brysbaert et al. (freely available data), from OPUS OpenSubtitles 2018 (OpenSubtitles) and from the Google Books Ngram Viewer (http://books.google.com/ngrams), among other sources listed in its README. Changes: top words per language, lower case, NFC, script filter, at most 18 grapheme clusters, single letters removed, offensive words filtered with the LDNOOBW list by Shutterstock and contributors (CC BY 4.0). The program code of Anagrammaton is MIT licensed and separate.
