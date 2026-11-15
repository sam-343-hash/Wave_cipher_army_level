# FIELDLINE Test Report

Generated 2026-11-14 04:10 from the real output of the test runners. Nothing is marked passed unless it was executed.

**Summary:** unit tests 23/23 passed (0 failed); browser end-to-end tests 21/21 passed; button sweep: 56 buttons acted, 3 showed no change in the page text (all explained below), 0 JavaScript errors.

Reproduce: `sh tests/run_all.sh`, then `python3 tests/e2e/button_sweep.py` (see README).

## Environment

Node v22.23.4, Python 3.12.3, Playwright with headless Chromium. The browser used a **fake microphone and fake camera** supplied by Chromium (a test tone and a moving test pattern). No real hardware was used.

## Unit tests (`node --test tests/unit/*.test.mjs`)

| Result | Test |
|---|---|
| PASS | 1 encryption/decryption round trip (AES-256-GCM) |
| PASS | 2 wrong passphrase rejected |
| PASS | 3 ciphertext tampering detected |
| PASS | 4 metadata (header) tampering detected |
| PASS | 5 large evidence package (40 MB attachment) round trip |
| PASS | 5b size limits enforced |
| PASS | 6 corrupted files rejected |
| PASS | 7 WAV parsing and validation |
| PASS | 8 hash verification catches a swapped attachment |
| PASS | 8b out-of-range attachment offsets rejected |
| PASS | 9 hash-linked chain detects edits, deletion, reordering and clock regression |
| PASS | 10 package carries explicit timestamp-trust warning and capture info |
| PASS | 11 signal metrics are computed from samples |
| PASS | 12 passphrase strength guidance and KDF calibration floor |
| PASS | 6b random and non-UTF-8 bytes give a clean BAD_FILE error (never an internal exception) |
| PASS | 13 gesture: open hand classified as open and fires open then hold |
| PASS | 13 gesture: fist classified as fist and fires once |
| PASS | 13 gesture: swipe right and left detected |
| PASS | 13 gesture: no hand and empty frame fire nothing |
| PASS | 13 gesture: brief or unstable shapes do not fire |
| PASS | 14 SOP engine: validation, run progress, report, version |
| PASS | 15 translation: only localhost endpoints accepted; reports contain only supplied facts |
| PASS | 16 weak passphrases are flagged |

## Browser end-to-end tests (`python3 tests/e2e/run_e2e.py`)

| Result | Test | Seconds |
|---|---|---|
| PASS | E01 every precached asset returns HTTP 200 and the shell list matches the files on disk | 0.2 |
| PASS | E02 every JavaScript import specifier resolves to an existing file | 0.0 |
| PASS | E03 vault lifecycle: weak/mismatch rejected, create, manual lock, wrong passphrase rejected, unlock, reload stays locked | 3.8 |
| PASS | E04 automatic idle lock engages after the idle timeout (browser clock fast-forwarded) | 1.5 |
| PASS | E05 UI navigation: all ten pages open without errors, keyboard shortcuts and Escape work | 5.8 |
| PASS | E06 incident persistence: validation, encrypted save, timeline, hash chain, attachment bytes preserved, survives reload | 3.7 |
| PASS | E07 evidence export: weak package passphrase rejected, .flpkg produced, queued, duplicate import of own export refused | 3.1 |
| PASS | E08 evidence import on a fresh vault: wrong passphrase, tampered, random and truncated files rejected; valid import verifies each check, shows time warning, preserves bytes; second import refused | 6.9 |
| PASS | E09 SOP: start, save progress, resume after reload, complete, export report; create + import validation | 5.9 |
| PASS | E10 offline: precache installs, cache count equals shell size, app reloads and works with the network off | 6.9 |
| PASS | E11 data persists after the browser is fully closed and restarted (persistent profile) | 3.6 |
| PASS | E12 missing microphone and camera: clear unavailable states; WAV analysis and manual navigation still work | 2.0 |
| PASS | E13 live microphone (fake device): real measurements, recording, playback element, WAV export, attach to incident | 5.7 |
| PASS | E14 training is synthetic and separate: drill scored, records isolated from incidents | 4.2 |
| PASS | E15 privacy: no request leaves localhost during a full session; external translation endpoint refused; manual translation works | 5.8 |
| PASS | E16 backup and restore: restore replaces newer data with the backup; backup file contains no plaintext | 4.9 |
| PASS | E17 stored incident data is ciphertext in IndexedDB (no plaintext title or text) | 1.8 |
| PASS | E18 complete local-data deletion: typed confirmation, passphrase check, database empty, fresh vault creation offered | 6.0 |
| PASS | E20 camera (fake device): CAMERA ON indicator, live preview, keeps running across pages, stops on request and when the vault locks | 3.4 |
| PASS | E21 buttons whose effect is not visible in the page text: bundled phrase, stop-recording with none active, update check | 2.4 |
| PASS | E19 no console or page errors (including CSP violations) occurred anywhere in the suite | 0.0 |

## Button sweep (`python3 tests/e2e/button_sweep.py`)

After seeding an incident, attachment, exported package, checklist run and training drill, the sweep clicked every button on all ten pages (including the incident detail and checklist run views) and recorded JavaScript errors and buttons that changed nothing observable. Destructive buttons only open a confirmation dialog, which the sweep cancelled with Escape.

* 56 buttons produced a visible effect; 4 were skipped (Stop; Translate with local server; Generate drill packages; Lock now).
* Buttons that changed nothing in the page text: 'Insert bundled phrase', 'Stop recording', 'Check for update'. Each acts without altering visible page text (it fills a text box, shows a toast that may expire during the check, or checks for updates), and E21 verifies all three directly.
* JavaScript errors during the sweep: 0.
* This found a real bug (the erase dialog could not be closed with Escape), which is fixed; E05 now asserts Escape closes it.

## Coverage against the required list

| Requirement | Where it is tested |
|---|---|
| Encryption round trip, wrong passphrase, ciphertext and metadata tampering | Unit 1 to 4 |
| Large evidence package, corrupted files, size limits | Unit 5, 5b, 6, 6b |
| WAV parsing and validation, hash verification | Unit 7, 8, 8b |
| Hash chain, timestamp trust | Unit 9, 10 |
| Vault lifecycle, idle lock | E03, E04 |
| Incident persistence, restart persistence | E06, E11 |
| Evidence export/import, duplicates, malformed packages, byte preservation | E07, E08 |
| Offline loading, service-worker asset availability and installation | E01, E10 |
| SOP persistence, import validation | E09, Unit 14 |
| Local-data deletion | E18 |
| UI navigation, keyboard, Escape | E05 |
| Missing microphone and camera, gesture fallback | E12, E20, Unit 13 |
| Synthetic-data separation | E14 |
| Privacy: no external requests | E15 |
| Backup and restore, ciphertext at rest | E16, E17 |
| Every button | Button sweep, E21 |
| No console, page or CSP errors | E19 |

## What these tests do NOT prove

* **Real hardware.** Microphone and camera tests use Chromium's fake devices. Behaviour with real microphones (levels, latency, device switching) and cameras was not tested.
* **Gesture accuracy.** The gesture engine is tested on synthetic drawn shapes (open hand, fist, swipes, empty and unstable frames). It has **not** been tested on real hands, skin tones, lighting or backgrounds. Expect misses and false detections in the field. Gesture-confirmed and gesture-cancelled dialogs are covered only by the engine unit tests and the manual alternatives, not by a browser test with a moving hand.
* **Idle lock** was tested with a fast-forwarded browser clock, not by waiting ten minutes.
* **Browsers.** Only Chromium was run. Firefox and Safari were not tested. Browser dictation (cloud speech) and the optional local translation server were **not** exercised end to end.
* **Phones and tablets.** The layout is responsive, but no mobile device or emulation was part of this suite. Performance on low-end devices is untested.
* **Large files.** The 40 MB package test runs in Node; browser tests use attachments under 1 MB.
* **Security.** These tests check behaviour, not security. No penetration test, fuzzing campaign or independent review has been done. See `SECURITY_MODEL.md`.
* **Accessibility.** No screen-reader or automated contrast audit.
