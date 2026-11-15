# FIELDLINE

**An offline-first field operations and incident assurance workstation** (evolved from WaveCipher).
It runs entirely in your browser from a small local server. It makes **no external network requests**.

> FIELDLINE is a prototype for lawful safety, equipment-support, documentation and training use.
> It is **not certified, not "military-grade", and has had no independent security review.**
> Read `SECURITY_MODEL.md` before trusting it with anything that matters.

## What it does

| Page | What you can do |
|---|---|
| Command Overview | Live counts and activity read from local storage; quick actions |
| Evidence Vault | Verify or import `.flpkg` packages, export queue for manual transfer, import history |
| Signal Intelligence | Microphone waveform, spectrum, spectrogram, peak/RMS, clipping, noise floor, silence, record, play back, export WAV; analyse any WAV file |
| Incident Management | Create incidents, tags, equipment info, hash-chained timeline, attachments (photos, audio, files), encrypted package export |
| SOP Workbench | Generic checklist templates, your own, JSON import; run, save, resume, complete, export a report |
| Translation Centre | Original and translation side by side, bundled phrase glossary, optional **local** translation server, consent-gated browser dictation, structured report from your notes |
| Gesture Controls | Camera preview, open hand / fist / swipe detection, sensitivity, manual and keyboard alternatives |
| Training Simulator | Synthetic-only drills (package integrity, practice checklist, report exercise, offline check), scored, stored separately |
| Security Centre | Vault and encryption details, data inventory, security-event log with chain check, backup and restore, passphrase guidance, session lock, erase everything |
| System Settings | Local translation server, offline cache status and update, key-derivation calibration |

## Requirements

* Python 3.8+ (only to serve static files; there is no backend)
* A current Chromium-based browser (Chrome, Edge) or Firefox/Safari for most features
* Node 20+ and Playwright for Python only if you want to run the tests

## Install and run

1. Unzip the project and open a terminal in the `fieldline` folder.
2. Start the server:

   ```
   python3 server.py          # macOS / Linux
   py server.py               # Windows (or: python server.py)
   ```
3. Your browser opens **http://localhost:8000/**. If it does not, open that address yourself.
   Use a different port with `python3 server.py 8123`.
4. Press Ctrl+C in the terminal to stop.

The server binds to `127.0.0.1` only, serves only the application files (not tests or docs), logs nothing, and sets a strict Content-Security-Policy and other security headers.

Use `http://localhost`, not a double-clicked `index.html`: browsers only allow the camera, microphone and service worker on localhost or HTTPS.

## First use

1. **Create your vault.** Choose a strong passphrase (4+ unrelated words). It encrypts everything stored on this device. **It cannot be recovered.** Lose it and the data is gone.
2. The top bar should show **Offline cache ready** after a few seconds. From then on the app loads with no network.

## Offline operation (Blackout mode)

* A service worker caches every application file on first load (cache name `fieldline-v1.0.1`).
* After **Offline cache ready** appears, you can disconnect and reload. Create incidents, record audio, run checklists and verify packages with no network.
* The status bar shows Online/Offline. Reconnecting never uploads anything.
* After editing project files, bump `VERSION` in `sw.js` so browsers fetch the new copy.
* Not available offline: browser dictation (usually needs the browser vendor's servers) and any remote translation. Both are off by default and say so.

## Create an evidence package

1. **Incident Management > New incident.** Fill in title, category, tags, equipment, description.
2. On the incident, add timeline entries and attach files (up to 25 MB each). Record audio in Signal Intelligence and use **Attach to incident**.
3. Press **Encrypt and export package**, choose a package passphrase (min 10 characters, strength checked) and confirm it. A `.flpkg` file downloads and is queued under **Evidence Vault > Export queue**.
4. Transfer the file yourself (USB drive, local network, etc.). Mark it **transferred** in the queue when done. FIELDLINE never uploads it.

Each package holds a versioned manifest, SHA-256 of every attachment, the hash-chained event history, capture-source information, device-clock timestamps and an explicit timestamp-trust warning. All of it is encrypted with AES-256-GCM; the header is authenticated.

## Import and verify a package

**Evidence Vault > Verify or import a package.**

* **Verify only**: decrypts and checks everything, shows each check, changes nothing.
* **Verify and import**: refuses duplicates (a package already imported, or exported from this vault), refuses anything that fails integrity checks, and otherwise creates a new incident whose attachments are byte-identical to the originals.
* Wrong passphrase, tampering, truncation, random files and oversized files are rejected with a clear message.

## Backup, restore, erase

Security Centre: **Create backup** downloads your data exactly as stored (still encrypted; needs your vault passphrase). **Restore** replaces everything with a backup. **Erase all local data** needs you to type `ERASE` and re-enter your passphrase.

## Gestures

Turn the camera on in Gesture Controls. A red **CAMERA ON** badge shows in the top bar whenever it is active; locking the vault stops it. Frames are analysed in memory at 96x72 pixels and never saved or sent. Gestures only navigate or cancel. They never confirm sensitive actions and are **not authentication**.

Keyboard: `Alt+1`..`Alt+9`, `Alt+0` open the pages in order; `Esc` closes dialogs.

## Guided camera evidence (prototype)

In an incident, use **Guided camera evidence** to select a purpose, add a short factual observation, and review the image for bystanders or sensitive details before attaching. The app checks decoded image dimensions and average brightness locally and records those results, the device-clock capture time, purpose, note, and privacy-review confirmation alongside the attachment. Attachment bytes receive the existing SHA-256 hash and are encrypted in the local vault; package export includes the attachment source metadata.

This is a capture-quality aid, not automatic redaction or a guarantee of evidentiary authenticity. It does not identify people, recognize equipment, or assess damage. It keeps the original photo unchanged. If the image contains bystanders or sensitive details, redact it with a suitable tool before attaching and retain only material needed for the incident. Device time is not independently verified, and someone controlling the device can alter local data.

## Optional local translation server

FIELDLINE has no translation engine of its own. If you run a LibreTranslate-compatible server on your own machine, enter `http://localhost:5000` (or similar) in System Settings. Only `localhost` / `127.0.0.1` addresses are accepted. Without it, type translations by hand or use the bundled phrase glossary (English, Spanish, French, Hindi; not a translation engine, have a qualified speaker verify critical wording).

## Run the tests

```
sh tests/run_all.sh
```

or separately:

```
node --test tests/unit/*.test.mjs            # 27 unit tests, no dependencies
pip install playwright && python3 -m playwright install chromium
python3 tests/e2e/run_e2e.py                 # 20 browser tests, own server, fake mic/camera
```

See `TEST_REPORT.md` for results and what the tests do not cover.

## Browser compatibility

| Feature | Chrome / Edge | Firefox | Safari |
|---|---|---|---|
| Vault, incidents, packages, SOP, offline | Yes (tested) | Expected | Expected |
| Audio lab (AudioWorklet, with fallback) | Yes (tested) | Expected | Expected |
| Camera gestures | Yes (tested with fake camera) | Expected | Expected |
| Browser dictation | Yes (cloud-based, consent required) | No | Partial |

"Expected" means it uses standard APIs but was not tested here.

## Project layout

```
index.html  sw.js  manifest.webmanifest  server.py
css/app.css   icons/icon.svg
js/  app.js (shell)  state.js  ui.js  views_core.js  views_tools.js
     crypto.js  chain.js  pkg.js  vault.js  db.js  wav.js  signal.js
     sop.js  translate.js  gesture.js  recorder-worklet.js
tests/unit  tests/e2e  tests/run_all.sh
README.md  SECURITY_MODEL.md  TECHNICAL_AUDIT.md  TEST_REPORT.md
```

## Known limitations

* No hand-landmark model could be bundled offline; gestures use colour silhouettes and can fail in coloured light or against skin-tone backgrounds.
* Argon2id was not bundled; PBKDF2-HMAC-SHA256 (calibrated, at least 600,000 iterations) is used.
* Single user, single device. No accounts, roles, sync or remote access.
* Browsers may evict site storage under pressure: make backups.
* Timestamps are the device clock and are not independently verified.
