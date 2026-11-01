# IBIS IV – Your stream. Your control.

Freies Streaming-Studio für Windows (Tauri 2 + Rust + React/TypeScript + SQLite).

## Stand: Phase 1 (Grundgerüst) – ehrlich

**Funktioniert (Code vorhanden):**
- Installer-Build (NSIS): Installieren-Button, Desktop- und Startmenü-Verknüpfung, Deinstallation, WebView2 wird mitgeliefert, **kein Konsolenfenster**.
- Hauptfenster mit Menüleiste, Vorschau-Bereich und 8 Docks (verschiebbar per Drag & Drop, Größe per Ziehen, ein-/ausblendbar).
- Arbeitsbereiche: Standard, Streaming, Gaming, Recording, Editing, Vertical Streaming, Custom Workspace.
- Einrichtungsassistent (9 Schritte): echte Mikrofon-Pegelanzeige, echtes Kamerabild, Hardware-Erkennung, Internet-Test zu Twitch.
- Szenen anlegen, umbenennen, löschen (gespeichert).
- Profile (eigene Einstellungen je Profil), Einstellungen in SQLite.
- Streaming-/Video-Einstellungen mit Prüfung gegen Twitch-Grenzen (u. a. Hinweis, dass Twitch kein 4K annimmt).
- Performance-Dock mit echten CPU-/RAM-Werten.
- Reparaturmenü: Datenbank prüfen/reparieren, Sicherung erstellen/wiederherstellen, Protokoll anzeigen.
- Updater-Oberfläche mit Fortschrittsbalken.

**Noch nicht vorhanden (in der Oberfläche als „Phase X“ markiert):**
Streaming-Engine/libobs (P3), Quellen/Audio/Kamera (P4), Twitch-Anmeldung und Chat (P5), Alerts/TTS (P6), Grafik-/Overlay-Editor (P7), Aufnahme/Replay/Vertical-Ausgabe (P8), 4K-Test (P9), Plugins (P10).

**Wichtig:** Dieser Code wurde ohne Windows-Build und ohne Hardware geschrieben. Er wurde nicht kompiliert und nicht gestartet. Rechne beim ersten Build mit Compilerfehlern, die behoben werden müssen.

## EXE bauen (ohne eigenen Rechner-Setup)

1. Repository auf GitHub hochladen.
2. Reiter **Actions → „Windows-Installer bauen“ → Run workflow**.
3. Nach ein paar Minuten unter **Artifacts** die `IBIS-IV-Setup` herunterladen (enthält die Setup-.exe).

## Lokal entwickeln (nur für Entwickler)

Voraussetzungen: Node 20, Rust (stable), Visual Studio Build Tools (C++).

```
npm install
npm run icons      # erzeugt alle Icons aus src-tauri/app-icon.svg
npm run tauri dev
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

## Auto-Updates einrichten (einmalig)

1. `npx tauri signer generate -w ibis.key` → öffentlichen Schlüssel in `tauri.conf.json` unter `plugins.updater.pubkey` eintragen, `endpoints` auf dein Repository ändern.
2. `bundle.createUpdaterArtifacts` auf `true` setzen, privaten Schlüssel als GitHub-Secret `TAURI_SIGNING_PRIVATE_KEY` hinterlegen.
Ohne das zeigt IBIS IV beim Update-Check eine verständliche Meldung.

## Twitch (Phase 5, Vorbereitung)

Registriere auf https://dev.twitch.tv/console eine Anwendung vom Typ **Public**, um eine Client-ID zu erhalten. Es wird kein Client-Secret verwendet (Device Code Flow). Hinweis: Twitch nimmt über RTMP höchstens 1080p60 an.

## Ordnerstruktur

```
src/                 React-Oberfläche (App, Docks, Wizard, Einstellungen, Reparatur)
src/lib/             Layout-Logik, Twitch-Grenzen, API-Brücke (+ Tests)
src-tauri/src/       Rust: Datenbank, Befehle, Protokoll
.github/workflows/   Windows-Build
```
