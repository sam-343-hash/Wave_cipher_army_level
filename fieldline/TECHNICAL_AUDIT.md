# FIELDLINE Technical Audit

Scope: the earlier **WaveCipher** prototype (`wavecipher_local.html` + `server.py`) that FIELDLINE v1 was built from, and what changed.
Method: code reading of both files, plus the browser behaviour observed while testing them. No external review.

## 1. Existing architecture (WaveCipher)

* One self-contained HTML file (about 35 KB) with inline CSS and JavaScript, no modules, no persistence, no service worker.
* `server.py`: a minimal static server bound to localhost, no security headers.
* Audio: Web Audio `AnalyserNode` for the oscilloscope and spectrum; a `ScriptProcessorNode` collected recordings.
* Camera: frames shrunk to 96x72; skin-colour mask (YCrCb thresholds); flood-fill blob; silhouette grid and outline; the outline was turned into a Web Audio `PeriodicWave`.
* "Vault": AES-256-GCM over a message, key from PBKDF2-HMAC-SHA256 (**100,000** iterations), kept in a JavaScript object; hidden-in-WAV via least-significant-bit steganography; a hand-shape template as a "lock".
* Voice: Chrome `SpeechRecognition` (or a Claude helper when hosted); translation through the **external MyMemory API** in the local build.

## 2. What worked

* Live waveform and spectrum from a real microphone; WAV encode/parse round trip.
* AES-GCM encrypt/decrypt round trip, wrong-passphrase rejection.
* Hand silhouette extraction and shape matching of synthetic shapes.
* Local run with `python3 server.py`.

## 3. Incomplete features or demonstrations only

| Item | Finding |
|---|---|
| Gesture "lock" | A shape-similarity gate in the page, not authentication. The passphrase sat in a page variable while locked. It is not biometric and was never a key. |
| LSB steganography | Destroyed by any compression or resampling; trivially detectable; gave no security beyond the encryption. |
| Persistence | None: all state lived in memory and was lost on reload. |
| Evidence handling | No incidents, timelines, hashes, integrity checking or import/export. |
| Offline | Worked only while the server ran; no service worker or cache. |
| Checklists, training, audit log, backup | Did not exist. |
| Audio diagnostics | Waveform and spectrum only; no peak/RMS/clipping/noise floor/silence measurements, no recording analysis. |

## 4. Security weaknesses found

1. PBKDF2 at 100,000 iterations is below current guidance (600,000 for SHA-256). **Fixed:** minimum 600,000, calibrated per device, enforced on import.
2. No additional authenticated data on ciphertexts; nothing bound a ciphertext to its context. **Fixed:** vault rows bind `{store,id,v}`; packages authenticate the full header.
3. No format version, no integrity manifest. **Fixed:** versioned formats, per-attachment SHA-256, hash-chained events.
4. WAV parser trusted chunk lengths and had no size limits. **Fixed:** bounds-checked parser, 200 MB cap, rejects truncation, odd chunks, bad rates, huge `fmt` chunks (tested).
5. Package-style files had no size or schema limits and could throw internal exceptions on malformed input. **Fixed:** staged `inspect()`; a further bug found during this work (random non-UTF-8 bytes raised an internal `TypeError`) is fixed and covered by a unit test.
6. No Content-Security-Policy or security headers. **Fixed:** strict CSP, nosniff, no-referrer, frame denial, permissions policy.
7. Server served any file under its folder. **Fixed:** application files only; tests, docs, `*.py`, `*.json` and dotfiles return 404.
8. Gesture lock presented as access control. **Fixed:** gestures never authenticate and never confirm sensitive actions.

## 5. Privacy concerns

* **MyMemory translation** sent the user's text to a third party. **Removed.** Translation is now manual, a bundled glossary, or an optional localhost server (non-local URLs are refused).
* **Browser dictation** may send audio to the browser vendor. **Kept as opt-in only**, behind an explicit consent checkbox and warning.
* Camera: no visible indicator before. **Fixed:** red CAMERA ON badge, preview, stops on lock, in-memory processing only.
* Sensitive data lived unencrypted in memory only. **Fixed:** encrypted at rest; passphrases never stored.

## 6. Browser compatibility and performance

* `ScriptProcessorNode` is deprecated. **Fixed:** AudioWorklet with ScriptProcessor fallback.
* Canvas sizing bug on high-DPI screens (height grew every frame) was found and fixed in the earlier prototype; the new canvas helper sizes only on change.
* Dictation is Chrome/Edge only; AudioWorklet needs a secure context (localhost qualifies).
* PBKDF2 at 600k+ iterations blocks for a fraction of a second on weak phones; calibration keeps it near 350 ms.

## 7. Accessibility

Before: no labels, no keyboard navigation, colour-only status. Now: labelled controls, `aria-current`, live regions for toasts and results, keyboard shortcuts (`Alt+1..0`, `Esc`), manual alternatives for every gesture, reduced-motion support, 16 px inputs. **Not audited with a screen reader**; contrast was designed but not formally measured.

## 8. Recommended architecture (implemented in FIELDLINE v1)

ES modules with one responsibility each (`crypto`, `chain`, `pkg`, `vault`, `db`, `wav`, `signal`, `sop`, `translate`, `gesture`, UI and views), encrypted IndexedDB, service worker precache, no dependencies, hardened local server, tests at both unit and browser level.

## 9. Remaining priorities

1. Independent security review and a decision on Argon2id.
2. Trained hand-landmark model bundled locally.
3. Package signatures and trusted timestamps.
4. Screen-reader and contrast audit; localisation.
5. Large-file streaming (attachments currently live fully in memory, capped at 25 MB each, 100 MB per package).
6. Hardware testing on real microphones, cameras and low-end phones.
