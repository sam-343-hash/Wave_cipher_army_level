#!/usr/bin/env python3
"""Clicks every button on every page and reports JavaScript errors and buttons that change nothing observable.
Destructive buttons only open a confirmation dialog, which the sweep cancels with Escape."""
import os, sys, time, socket, subprocess, tempfile, json
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close(); BASE = f'http://localhost:{PORT}/'
srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'server.py'), str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=ROOT); time.sleep(1.4)
PW = 'amber lantern orbit quiet harbor 7'; errs = []; report = []; SKIP = {'sec-lock'}
tmp = tempfile.mkdtemp()
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']); ctx = b.new_context(accept_downloads=True, viewport={'width': 1300, 'height': 900}); pg = ctx.new_page(); pg.set_default_timeout(30000)
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(BASE); pg.fill('#vault-pass', PW); pg.fill('#vault-pass2', PW); pg.click('#vault-go'); pg.wait_for_selector('h1:has-text("Command Overview")')
    def nav(v): pg.click('#nav-' + v); pg.wait_for_timeout(300)
    # seed data so every conditional button exists
    nav('incidents'); pg.click('#inc-new'); pg.fill('#f-title', 'Sweep incident'); pg.fill('#f-rep', 'x'); pg.click('#f-save'); pg.wait_for_selector('#inc-title')
    open(os.path.join(tmp, 'a.txt'), 'w').write('hello'); pg.set_input_files('#att-file', os.path.join(tmp, 'a.txt')); pg.wait_for_selector('#atts tr')
    pg.click('#d-export'); pg.fill('#pp1', 'gale-harbor-quiet-ember-52!'); pg.fill('#pp2', 'gale-harbor-quiet-ember-52!')
    with pg.expect_download(timeout=60000): pg.click('#pp-ok')
    nav('sop'); pg.click('#tpl-list tr:first-child button.primary'); pg.wait_for_selector('#run-steps select')
    nav('training'); pg.click('#drill-gen'); pg.wait_for_selector('#drill-run-3', timeout=60000)
    pages = [('overview', None), ('evidence', None), ('signal', None), ('incidents', None), ('incident-detail', None), ('sop', None), ('run', None), ('translate', None), ('gesture', None), ('training', None), ('security', None), ('settings', None)]
    def visit(name):
        if name == 'incident-detail': nav('incidents'); pg.click('#inc-list tr'); pg.wait_for_selector('#inc-title')
        elif name == 'run': nav('sop'); pg.click('#run-list button'); pg.wait_for_selector('#run-steps select')
        else: nav(name)
        if name == 'training': pg.click('#drill-gen'); pg.wait_for_selector('#drill-run-3', timeout=60000)
    def snap(): return (pg.evaluate('document.getElementById("main").innerHTML.length'), pg.locator('.toast').count(), pg.locator('#overlay:not([hidden])').count(), pg.locator('#status').inner_text(), pg.evaluate('document.getElementById("main").innerText.length'))
    for name, _ in pages:
        visit(name); n = pg.locator('#main button').count()
        for i in range(n):
            visit(name); btn = pg.locator('#main button').nth(i)
            if btn.count() == 0: continue
            bid = btn.get_attribute('id') or ''; label = (btn.inner_text() or '').strip()[:40]
            if bid in SKIP or btn.is_disabled(): report.append((name, label, 'skipped (disabled or would end the session)')); continue
            before = snap(); dl = []; pg.once('download', lambda d: dl.append(1));
            try: btn.click(timeout=4000)
            except Exception as e: report.append((name, label, 'CLICK FAILED ' + str(e)[:60])); continue
            pg.wait_for_timeout(250); after = snap(); changed = before != after or bool(dl)
            if pg.locator('#overlay:not([hidden])').count(): pg.keyboard.press('Escape'); pg.wait_for_timeout(100); changed = True
            report.append((name, label, 'acts' if changed else 'NO VISIBLE EFFECT'))
    b.close()
srv.terminate()
total = len(report); noop = [r for r in report if r[2] == 'NO VISIBLE EFFECT' or r[2].startswith('CLICK')]
print(f'buttons clicked: {sum(r[2]=="acts" for r in report)} acted, {sum(r[2].startswith("skipped") for r in report)} skipped, {len(noop)} with no visible effect, of {total}')
for r in noop: print('  CHECK:', r)
print('JS errors:', errs[:5] or 'none')
json.dump({'rows': report, 'errors': errs}, open(os.path.join(ROOT, 'tests', 'e2e', 'button_sweep.json'), 'w'), indent=1)
sys.exit(1 if errs else 0)
