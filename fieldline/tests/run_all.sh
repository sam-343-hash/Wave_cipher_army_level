#!/bin/sh
# Runs the unit tests (Node 20+) and the browser end-to-end suite (Python 3 + Playwright + Chromium).
cd "$(dirname "$0")/.." || exit 1
node --test tests/unit/*.test.mjs && python3 tests/e2e/run_e2e.py
