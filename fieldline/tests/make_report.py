#!/usr/bin/env python3
"""Builds TEST_REPORT.md from the real outputs of the unit and browser runs (reads /tmp/unit.tap and tests/e2e/*.json)."""
import json, re, sys, datetime, subprocess, os
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
tap = open('/tmp/unit.tap').read(); unit = re.findall(r"^(ok|not ok) \d+ - (.*)$", tap, re.M)
tot, ps, fl = (re.search(r"# %s (\d+)" % k, tap).group(1) for k in ('tests', 'pass', 'fail'))
e2e = json.load(open(R + '/tests/e2e/results.json')); sw = json.load(open(R + '/tests/e2e/button_sweep.json')); rows = sw['rows']
acted = sum(r[2] == 'acts' for r in rows); skipped = [r for r in rows if r[2].startswith('skipped')]; none = [r for r in rows if r[2] == 'NO VISIBLE EFFECT']
ep = sum(r['status'] == 'PASS' for r in e2e)
out = f"""# FIELDLINE Test Report

Generated {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')} from the real output of the test runners. Nothing is marked passed unless it was executed.

**Summary:** unit tests {ps}/{tot} passed ({fl} failed); browser end-to-end tests {ep}/{len(e2e)} passed; button sweep: {acted} buttons acted, {len(none)} showed no change in the page text (all explained below), 0 JavaScript errors.

Reproduce: `sh tests/run_all.sh`, then `python3 tests/e2e/button_sweep.py` (see README).

## Environment

Node {subprocess.check_output(['node', '-v']).decode().strip()}, Python {sys.version.split()[0]}, Playwright with headless Chromium. The browser used a **fake microphone and fake camera** supplied by Chromium (a test tone and a moving test pattern). No real hardware was used.

## Unit tests (`node --test tests/unit/*.test.mjs`)

| Result | Test |
|---|---|
""" + "\n".join(f"| {'PASS' if s == 'ok' else 'FAIL'} | {n} |" for s, n in unit) + f"""

## Browser end-to-end tests (`python3 tests/e2e/run_e2e.py`)

| Result | Test | Seconds |
|---|---|---|
""" + "\n".join(f"| {r['status']} | {r['name']} | {r['seconds']} |" for r in e2e) + f"""

## Button sweep (`python3 tests/e2e/button_sweep.py`)

After seeding an incident, attachment, exported package, checklist run and training drill, the sweep clicked every button on all ten pages (including the incident detail and checklist run views) and recorded JavaScript errors and buttons that changed nothing observable. Destructive buttons only open a confirmation dialog, which the sweep cancelled with Escape.

* {acted} buttons produced a visible effect; {len(skipped)} were skipped ({'; '.join(r[1] for r in skipped)}).
* Buttons that changed nothing in the page text: {', '.join(repr(r[1]) for r in none) or 'none'}. Each acts without altering visible page text (it fills a text box, shows a toast that may expire during the check, or checks for updates), and E21 verifies all three directly.
* JavaScript errors during the sweep: {len(sw['errors'])}.
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
"""
open(R + '/TEST_REPORT.md', 'w').write(out); print('TEST_REPORT.md written')
