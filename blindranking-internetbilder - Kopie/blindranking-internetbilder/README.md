# Blindranking Online

Komplett neue Version ohne Firebase.

## Funktionen

- Bis zu 10 Spieler
- Raumcode
- Host lädt bis zu 10 Bilder hoch
- Alle Bilder bleiben zunächst verdeckt
- Host deckt immer nur das nächste Bild auf
- Nur der Host kann Bilder platzieren und verschieben
- Spieler sehen links nur Raumcode und aktuelles Bild
- Ranking steht rechts
- Spieler haben keine obere Steuerleiste
- Keine Dateinamen unter den Bildern
- Etwas größere Ranking-Spalten
- Live-Synchronisation über Socket.IO

## Installation

1. Node.js installieren
2. ZIP entpacken
3. Im Projektordner ein Terminal öffnen
4. Folgende Befehle ausführen:

```bash
npm install
npm start
```

5. Im Browser öffnen:

```text
http://localhost:3000
```

## Im gleichen WLAN spielen

Andere Geräte öffnen die lokale IP-Adresse des Host-PCs, zum Beispiel:

```text
http://192.168.178.25:3000
```

Unter Windows findest du die IP-Adresse mit:

```bash
ipconfig
```

Suche dort nach „IPv4-Adresse“.


## Bilder aus dem Internet hinzufügen

Der Host kann Bilder jetzt auf vier Arten hinzufügen:

1. Über „Dateien auswählen“
2. Einen direkten Bild-Link in das URL-Feld kopieren
3. Ein Bild aus einer Webseite in das Ablagefeld ziehen
4. Ein kopiertes Bild oder einen kopierten Bild-Link mit `Strg + V` einfügen

Hinweis: Manche Webseiten verhindern das direkte Anzeigen ihrer Bilder. Dann das Bild herunterladen oder über die Zwischenablage einfügen.
