#!/usr/bin/env python3
"""FIELDLINE browser end-to-end suite (Playwright + Chromium). Starts its own server on a free port.
Run from the project folder:  python3 tests/e2e/run_e2e.py
Chromium is launched with a FAKE microphone/camera device, so no real hardware is needed."""
import os, sys, re, json, time, socket, subprocess, tempfile, hashlib, wave, struct, math, shutil, traceback
from playwright.sync_api import sync_playwright, expect

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
PORT = free_port(); BASE = f'http://localhost:{PORT}/'
srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'server.py'), str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=ROOT)
time.sleep(1.5)
PASS1 = 'amber lantern orbit quiet harbor 7'
PKGPASS = 'gale-harbor-quiet-ember-52!'
TMP = tempfile.mkdtemp(prefix='fl-e2e-')
ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
RESULTS, REQUESTS, ERRORS = [], [], []

def attach(pg):
    pg.on('request', lambda r: REQUESTS.append(r.url))
    pg.on('pageerror', lambda e: ERRORS.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: ERRORS.append('console: ' + m.text) if m.type == 'error' else None)
    pg.set_default_timeout(30000)
def new_ctx(br, **kw): return br.new_context(accept_downloads=True, viewport={'width': 1300, 'height': 900}, **kw)
def open_app(ctx):
    pg = ctx.new_page(); attach(pg); pg.goto(BASE); pg.wait_for_selector('#vault-pass'); return pg
def create_vault(pg, pw=PASS1):
    pg.fill('#vault-pass', pw); pg.fill('#vault-pass2', pw); pg.click('#vault-go'); pg.wait_for_selector('h1:has-text("Command Overview")')
def unlock(pg, pw=PASS1):
    pg.wait_for_selector('#vault-pass'); pg.fill('#vault-pass', pw); pg.click('#vault-go'); pg.wait_for_selector('h1:has-text("Command Overview")')
def nav(pg, v): pg.click('#nav-' + v); pg.wait_for_timeout(350)
def new_incident(pg, title='Pump 7 overheating', cat='Equipment fault'):
    nav(pg, 'incidents'); pg.click('#inc-new'); pg.fill('#f-title', title); pg.select_option('#f-cat', cat); pg.fill('#f-tags', 'pump, heat'); pg.fill('#f-eq', 'Pump-07'); pg.fill('#f-rep', 'Casing hot to touch at 14:20.'); pg.click('#f-save'); pg.wait_for_selector('#inc-title')
def blob(n, seed=1):
    out = bytearray(); h = hashlib.sha256(str(seed).encode()).digest()
    while len(out) < n: h = hashlib.sha256(h).digest(); out += h
    return bytes(out[:n])
def make_wav(path, secs=2, rate=16000, amp=0.6):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(b''.join(struct.pack('<h', int(amp * 32767 * math.sin(2 * math.pi * 440 * i / rate))) for i in range(secs * rate)))

def has(pg, sel, text, timeout=30000): expect(pg.locator(sel).first).to_contain_text(text, timeout=timeout)
def nonempty(pg, sel): expect(pg.locator(sel).first).not_to_be_empty()

def test(name):
    def deco(fn):
        t0 = time.time()
        try: fn(); RESULTS.append((name, 'PASS', '', round(time.time() - t0, 1)))
        except Exception as e:
            RESULTS.append((name, 'FAIL', (str(e).splitlines() or [''])[0][:300], round(time.time() - t0, 1))); traceback.print_exc()
        return fn
    return deco

with sync_playwright() as p:
    br = p.chromium.launch(args=ARGS)

    @test('E01 every precached asset returns HTTP 200 and the shell list matches the files on disk')
    def _():
        sw = open(os.path.join(ROOT, 'sw.js')).read(); shell = re.findall(r"'([^']+)'", re.search(r'const SHELL = \[(.*?)\];', sw, re.S).group(1))
        ctx = new_ctx(br); bad = []
        for f in shell:
            r = ctx.request.get(BASE + ('' if f == './' else f))
            if r.status != 200: bad.append((f, r.status))
        assert not bad, f'non-200: {bad}'
        onDisk = {'js/' + f for f in os.listdir(os.path.join(ROOT, 'js'))}; assert onDisk <= set(shell), f'js files missing from shell: {onDisk - set(shell)}'
        assert ctx.request.get(BASE + 'tests/unit/core.test.mjs').status == 404 and ctx.request.get(BASE + 'server.py').status == 404, 'tests/server source must not be served'
        hd = ctx.request.get(BASE).headers; assert 'script-src' in hd['content-security-policy'] and hd['x-content-type-options'] == 'nosniff', 'security headers missing'
        ctx.close()

    @test('E02 every JavaScript import specifier resolves to an existing file')
    def _():
        miss = []
        for f in os.listdir(os.path.join(ROOT, 'js')):
            for spec in re.findall(r"from '(\.[^']+)'", open(os.path.join(ROOT, 'js', f)).read()):
                if not os.path.exists(os.path.normpath(os.path.join(ROOT, 'js', spec))): miss.append((f, spec))
        assert not miss, miss

    @test('E03 vault lifecycle: weak/mismatch rejected, create, manual lock, wrong passphrase rejected, unlock, reload stays locked')
    def _():
        ctx = new_ctx(br); pg = open_app(ctx)
        pg.fill('#vault-pass', 'short'); pg.fill('#vault-pass2', 'short'); pg.click('#vault-go'); has(pg,'#vault-err','too weak')
        pg.fill('#vault-pass', PASS1); pg.fill('#vault-pass2', PASS1 + 'x'); pg.click('#vault-go'); has(pg,'#vault-err','do not match')
        pg.fill('#vault-pass2', PASS1); pg.click('#vault-go'); pg.wait_for_selector('h1:has-text("Command Overview")')
        assert 'unlocked' in pg.inner_text('#st-enc'), 'status bar should show unlocked'
        nav(pg, 'security'); pg.click('#sec-lock'); pg.wait_for_selector('#vault-pass'); assert 'locked' in pg.inner_text('#st-enc').lower()
        pg.fill('#vault-pass', 'not the passphrase at all'); pg.click('#vault-go'); has(pg,'#vault-err','Wrong')
        assert pg.locator('#vault-pass').count() == 1, 'must stay locked after wrong passphrase'
        unlock(pg); pg.reload(); pg.wait_for_selector('#vault-pass'); assert pg.inner_text('#main h1') == 'Vault locked', 'reload must lock the session'
        unlock(pg); ctx.close()

    @test('E04 automatic idle lock engages after the idle timeout (browser clock fast-forwarded)')
    def _():
        ctx = new_ctx(br); pg = ctx.new_page(); attach(pg); pg.clock.install(); pg.goto(BASE); pg.wait_for_selector('#vault-pass'); create_vault(pg)
        pg.clock.fast_forward('11:00'); pg.wait_for_selector('#lock-reason'); assert 'idle timeout' in pg.inner_text('#lock-reason'); ctx.close()

    @test('E05 UI navigation: all ten pages open without errors, keyboard shortcuts and Escape work')
    def _():
        ctx = new_ctx(br); pg = open_app(ctx); create_vault(pg)
        names = {'overview': 'Command Overview', 'evidence': 'Evidence Vault', 'signal': 'Signal Intelligence', 'incidents': 'Incident Management', 'sop': 'SOP Workbench', 'translate': 'Translation Centre', 'gesture': 'Gesture Controls', 'training': 'Training Simulator', 'security': 'Security Centre', 'settings': 'System Settings'}
        for v, t in names.items():
            nav(pg, v); assert pg.inner_text('#main h1') == t, (v, pg.inner_text('#main h1')); assert pg.locator('#view-error').count() == 0
        pg.keyboard.press('Alt+3'); pg.wait_for_selector('h1:has-text("Signal Intelligence")'); pg.keyboard.press('Alt+0'); pg.wait_for_selector('h1:has-text("System Settings")')
        assert pg.locator('#status .pill').count() >= 8 and pg.inner_text('#sidebar').count('\n') >= 9
        assert 'null' not in pg.inner_text('#status') and 'undefined' not in pg.inner_text('#status'), 'stray text in status bar'
        nav(pg, 'security'); pg.click('#erase'); pg.wait_for_selector('#erase-typed'); pg.keyboard.press('Escape'); pg.wait_for_selector('#erase-typed', state='detached'); assert pg.locator('#overlay:not([hidden])').count() == 0, 'Escape must close dialogs'; ctx.close()

    @test('E06 incident persistence: validation, encrypted save, timeline, hash chain, attachment bytes preserved, survives reload')
    def _():
        ctx = new_ctx(br); pg = open_app(ctx); create_vault(pg)
        nav(pg, 'incidents'); pg.click('#inc-new'); pg.fill('#f-title', 'ab'); pg.click('#f-save'); has(pg,'#f-err','at least 3')
        pg.fill('#f-title', 'Valid title'); pg.fill('#f-tags', ','.join(f't{i}' for i in range(12))); pg.click('#f-save'); has(pg,'#f-err','at most 10')
        pg.fill('#f-tags', 'a,b'); pg.click('#f-save'); pg.wait_for_selector('#inc-title')
        pg.select_option('#ev-type', 'action'); pg.fill('#ev-text', 'Isolated the pump'); pg.click('#ev-add'); pg.wait_for_selector('#timeline tr:nth-child(2)')
        data = blob(300_000, 3); f = os.path.join(TMP, 'evidence.bin'); open(f, 'wb').write(data); pg.set_input_files('#att-file', f); pg.wait_for_selector('#atts tr')
        assert 'hash chain intact' in pg.inner_text('#chain-badge')
        pg.reload(); unlock(pg); nav(pg, 'incidents'); assert 'Valid title' in pg.inner_text('#inc-list'); pg.click('#inc-list tr'); pg.wait_for_selector('#atts tr')
        with pg.expect_download() as d: pg.click('#atts button')
        assert open(d.value.path(), 'rb').read() == data, 'attachment bytes changed'
        assert pg.locator('#timeline tr').count() == 3, 'created + action + attachment events'
        ctx.close()

    exported = {}
    @test('E07 evidence export: weak package passphrase rejected, .flpkg produced, queued, duplicate import of own export refused')
    def _():
        ctx = new_ctx(br); pg = open_app(ctx); create_vault(pg); new_incident(pg)
        data = blob(150_000, 9); f = os.path.join(TMP, 'photo.jpg'); open(f, 'wb').write(data); pg.set_input_files('#att-file', f); pg.wait_for_selector('#atts tr')
        pg.click('#d-export'); pg.fill('#pp1', 'weak'); pg.fill('#pp2', 'weak'); pg.click('#pp-ok'); has(pg,'#pp-err','Too weak')
        pg.fill('#pp1', PKGPASS); pg.fill('#pp2', PKGPASS)
        with pg.expect_download(timeout=60000) as d: pg.click('#pp-ok')
        path = os.path.join(TMP, 'out.flpkg'); d.value.save_as(path); assert d.value.suggested_filename.endswith('.flpkg'); exported.update(path=path, data=data)
        nav(pg, 'evidence'); assert '.flpkg' in pg.inner_text('#exp-list') and 'pending' in pg.inner_text('#exp-list'); assert 'Pending exports: 1' in pg.inner_text('#st-pend')
        pg.set_input_files('#pkg-file', path); pg.click('#pkg-import'); pg.wait_for_selector('#dup-msg'); assert 'Duplicate' in pg.inner_text('#dup-msg')
        pg.click('#exp-list button:has-text("Mark transferred")'); has(pg,'#st-pend','Pending exports: 0'); ctx.close()

    @test('E08 evidence import on a fresh vault: wrong passphrase, tampered, random and truncated files rejected; valid import verifies each check, shows time warning, preserves bytes; second import refused')
    def _():
        raw = open(exported['path'], 'rb').read(); tam = bytearray(raw); tam[-9] ^= 1; tp = os.path.join(TMP, 'tampered.flpkg'); open(tp, 'wb').write(tam)
        rp = os.path.join(TMP, 'random.flpkg'); open(rp, 'wb').write(blob(5000, 4)); tr = os.path.join(TMP, 'trunc.flpkg'); open(tr, 'wb').write(raw[:100])
        ctx = new_ctx(br); pg = open_app(ctx); create_vault(pg); nav(pg, 'evidence')
        def attempt(path, pw, btn='#pkg-import'):
            pg.set_input_files('#pkg-file', path); pg.click(btn);
            if pw is not None: pg.wait_for_selector('#pp1'); pg.fill('#pp1', pw); pg.click('#pp-ok')
        attempt(os.path.join(TMP, 'random.flpkg'), None); pg.wait_for_selector('#reject-msg'); assert 'not a FIELDLINE package' in pg.inner_text('#reject-msg')
        attempt(os.path.join(TMP, 'trunc.flpkg'), None); pg.wait_for_selector('#reject-msg');
        attempt(exported['path'], 'definitely the wrong passphrase'); pg.wait_for_selector('#reject-msg'); assert 'Wrong passphrase' in pg.inner_text('#reject-msg')
        attempt(tp, PKGPASS); pg.wait_for_selector('#reject-msg'); assert 'modified' in pg.inner_text('#reject-msg')
        nav(pg, 'incidents'); assert 'No incidents yet' in pg.inner_text('#main'), 'rejected packages must not create incidents'; nav(pg, 'evidence')
        attempt(exported['path'], PKGPASS); pg.wait_for_selector('#import-ok', timeout=60000)
        txt = pg.inner_text('#verify-out'); assert 'INTEGRITY VERIFIED' in txt and 'Attachment hash: photo.jpg' in txt and 'Event hash chain' in txt and 'cannot be independently verified' in txt
        assert 'Passed' in pg.inner_text('#side-verify')
        pg.click('#verify-out button:has-text("Open incident")'); pg.wait_for_selector('#atts tr')
        with pg.expect_download() as d: pg.click('#atts button')
        assert open(d.value.path(), 'rb').read() == exported['data'], 'attachment bytes not preserved through export/import'
        assert 'imported' in pg.inner_text('#timeline'), 'import event appended to chain'; assert 'hash chain intact' in pg.inner_text('#chain-badge')
        nav(pg, 'evidence'); attempt(exported['path'], None); pg.wait_for_selector('#dup-msg'); assert 'Duplicate' in pg.inner_text('#dup-msg')
        pg.set_input_files('#pkg-file', exported['path']); pg.click('#pkg-verify'); pg.wait_for_selector('#pp1'); pg.fill('#pp1', PKGPASS); pg.click('#pp-ok'); pg.wait_for_selector('#verify-verdict'); ctx.close()

    @test('E09 SOP: start, save progress, resume after reload, complete, export report; create + import validation')
    def _():
        ctx = new_ctx(br); pg = open_app(ctx); create_vault(pg); nav(pg, 'sop')
        pg.click('#tpl-list tr:first-child button.primary'); pg.wait_for_selector('#run-steps select')
        pg.select_option('#run-steps .step:nth-child(1) select', 'done'); pg.fill('#run-steps .step:nth-child(1) input', 'Pump-07 tag 1182'); pg.press('#run-steps .step:nth-child(1) input', 'Tab'); pg.select_option('#run-steps .step:nth-child(2) select', 'incomplete'); pg.wait_for_timeout(500)
        assert '1 of 7 done' in pg.inner_text('#run-prog')
        pg.reload(); unlock(pg); nav(pg, 'sop'); assert 'in-progress' in pg.inner_text('#run-list'); pg.click('#run-list button:has-text("Resume")'); pg.wait_for_selector('#run-steps select')
        assert '1 of 7 done' in pg.inner_text('#run-prog') and pg.input_value('#run-steps .step:nth-child(1) input') == 'Pump-07 tag 1182' and pg.input_value('#run-steps .step:nth-child(2) select') == 'incomplete'
        pg.click('#run-complete'); pg.wait_for_selector('#confirm-ok'); pg.click('#confirm-ok'); has(pg,'body','completed')
        with pg.expect_download() as d: pg.click('#run-report')
        rep = open(d.value.path()).read(); assert 'version 1' in rep and '[DONE]' in rep and 'Pump-07 tag 1182' in rep and '[INCOMPLETE]' in rep
        nav(pg, 'sop'); pg.fill('#t-name', ''); pg.click('#t-save'); nonempty(pg,'#t-err')
        pg.fill('#t-name', 'My radio check'); pg.fill('#t-cat', 'Comms'); pg.fill('#t-steps', 'Charge battery\nTest channel 1'); pg.click('#t-save'); pg.wait_for_selector('#tpl-list tr:has-text("My radio check")')
        bad = os.path.join(TMP, 'bad.json'); open(bad, 'w').write('{not json'); pg.set_input_files('#t-import', bad); pg.wait_for_selector('.toast.err'); assert 'rejected' in pg.inner_text('.toast.err').lower()
        good = os.path.join(TMP, 'good.json'); open(good, 'w').write(json.dumps({'name': 'Org approved check', 'version': 3, 'steps': ['one', 'two']})); pg.set_input_files('#t-import', good); pg.wait_for_selector('#tpl-list tr:has-text("Org approved check")'); assert 'imported' in pg.inner_text('#tpl-list tr:has-text("Org approved check")')
        pg.reload(); unlock(pg); nav(pg, 'sop'); assert 'My radio check' in pg.inner_text('#tpl-list'); ctx.close()

    @test('E10 offline: precache installs, cache count equals shell size, app reloads and works with the network off')
    def _():
        ctx = new_ctx(br); pg = open_app(ctx); has(pg,'#st-cache','ready')
        n = pg.evaluate("caches.keys().then(async ks=>{const c=await caches.open(ks[0]);return [ks.length,(await c.keys()).length]})"); sw = open(os.path.join(ROOT, 'sw.js')).read(); shell = re.findall(r"'([^']+)'", re.search(r'const SHELL = \[(.*?)\];', sw, re.S).group(1))
        assert n == [1, len(shell)], f'cache {n} vs shell {len(shell)}'
        create_vault(pg); new_incident(pg, 'Created while online')
        ctx.set_offline(True); pg.reload(); pg.wait_for_selector('#vault-pass'); assert 'Offline' in pg.inner_text('#st-net'); assert pg.locator('script[src="js/app.js"]').count() == 1
        unlock(pg); nav(pg, 'incidents'); assert 'Created while online' in pg.inner_text('#inc-list')
        pg.click('#inc-new'); pg.fill('#f-title', 'Created fully offline'); pg.click('#f-save'); pg.wait_for_selector('#inc-title'); assert 'Created fully offline' in pg.inner_text('#inc-title')
        for v in ['overview', 'evidence', 'signal', 'sop', 'translate', 'gesture', 'training', 'security', 'settings']: nav(pg, v); assert pg.locator('#view-error').count() == 0, v
        ctx.set_offline(False); ctx.close()

    @test('E11 data persists after the browser is fully closed and restarted (persistent profile)')
    def _():
        prof = os.path.join(TMP, 'profile'); c1 = p.chromium.launch_persistent_context(prof, args=ARGS, accept_downloads=True); pg = c1.pages[0] if c1.pages else c1.new_page(); attach(pg); pg.goto(BASE); pg.wait_for_selector('#vault-pass'); create_vault(pg); new_incident(pg, 'Survives restart'); c1.close()
        c2 = p.chromium.launch_persistent_context(prof, args=ARGS, accept_downloads=True); pg = c2.pages[0] if c2.pages else c2.new_page(); attach(pg); pg.goto(BASE); pg.wait_for_selector('#vault-pass'); assert pg.inner_text('#main h1') == 'Vault locked'
        unlock(pg); nav(pg, 'incidents'); assert 'Survives restart' in pg.inner_text('#inc-list'); c2.close()

    @test('E12 missing microphone and camera: clear unavailable states; WAV analysis and manual navigation still work')
    def _():
        ctx = new_ctx(br); ctx.add_init_script("navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('none','NotFoundError'));"); pg = open_app(ctx); create_vault(pg)
        nav(pg, 'signal'); pg.click('#rec-start'); has(pg,'#mic-state','Microphone unavailable'); assert 'no input device' in pg.inner_text('#mic-state'); assert pg.inner_text('#m-peak') == 'n/a', 'no fake measurements'
        w = os.path.join(TMP, 'tone.wav'); make_wav(w); pg.set_input_files('#wav-file', w); pg.wait_for_selector('#an-kv')
        assert '16000 Hz' in pg.inner_text('#an-kv') and '2.00 s' in pg.inner_text('#an-kv'); peak = float(pg.inner_text('#m-peak').split()[0]); assert -5 < peak < -3, peak
        nav(pg, 'gesture'); pg.click('#g-toggle'); has(pg,'#g-msg','Camera unavailable'); assert pg.locator('#st-cam').count() == 0
        pg.click('#man-next'); pg.wait_for_selector('h1:has-text("Training Simulator")'); pg.click('#nav-gesture'); pg.click('#man-home'); pg.wait_for_selector('h1:has-text("Command Overview")'); ctx.close()

    @test('E13 live microphone (fake device): real measurements, recording, playback element, WAV export, attach to incident')
    def _():
        ctx = new_ctx(br); pg = open_app(ctx); create_vault(pg); new_incident(pg, 'Audio incident'); nav(pg, 'signal')
        pg.click('#rec-start'); has(pg,'#mic-state','Microphone active'); pg.wait_for_timeout(2500)
        assert 'dBFS' in pg.inner_text('#m-peak') and 'dBFS' in pg.inner_text('#m-rms') and 'Hz' in pg.inner_text('#m-rate'); assert 'REC' in pg.inner_text('#st-mic').upper() or 'recording' in pg.inner_text('#st-mic')
        pg.click('#rec-stop'); pg.wait_for_selector('#an-kv'); assert pg.locator('#playback').count() == 1
        with pg.expect_download() as d: pg.click('#wav-dl')
        wp = os.path.join(TMP, 'rec.wav'); d.value.save_as(wp); w = wave.open(wp); assert w.getnframes() > 8000 and w.getnchannels() == 1; w.close()
        pg.select_option('#att-incident', label='Audio incident'); pg.click('#wav-attach'); pg.wait_for_selector('.toast.ok:has-text("Attached")')
        nav(pg, 'incidents'); pg.click('#inc-list tr'); pg.wait_for_selector('#atts tr'); assert 'in-app-microphone' in pg.inner_text('#atts'); ctx.close()

    @test('E14 training is synthetic and separate: drill scored, records isolated from incidents')
    def _():
        ctx = new_ctx(br); pg = open_app(ctx); create_vault(pg); new_incident(pg, 'Real incident'); nav(pg, 'training'); assert 'SYNTHETIC DATA ONLY' in pg.inner_text('#main')
        pg.click('#drill-gen'); pg.wait_for_selector('#drill-run-3', timeout=60000)
        for i in range(4):
            pg.click(f'#drill-run-{i}'); nonempty(pg,f'#drill-res-{i}'); t = pg.inner_text(f'#drill-res-{i}'); pg.select_option(f'#drill-ans-{i}', 'intact' if 'all checks passed' in t else 'modified')
        pg.click('#drill-submit'); pg.wait_for_selector('#train-list'); assert '4/4' in pg.inner_text('#train-list') and 'SYNTHETIC' in pg.inner_text('#train-list')
        nav(pg, 'incidents'); assert pg.locator('#inc-list tr').count() == 1 and 'SYNTHETIC' not in pg.inner_text('#inc-list'); nav(pg, 'evidence'); assert 'No packages exported' in pg.inner_text('#main')
        n = pg.evaluate("new Promise(r=>{const q=indexedDB.open('fieldline');q.onsuccess=()=>{const d=q.result,c=(s)=>new Promise(k=>{const x=d.transaction(s).objectStore(s).count();x.onsuccess=()=>k(x.result)});Promise.all([c('training'),c('incidents')]).then(r)}})"); assert n == [1, 1], n; ctx.close()

    @test('E15 privacy: no request leaves localhost during a full session; external translation endpoint refused; manual translation works')
    def _():
        ctx = new_ctx(br); pg = open_app(ctx); start = len(REQUESTS); create_vault(pg); nav(pg, 'translate'); pg.fill('#t-orig', 'Help is needed'); pg.select_option('#t-tgt', 'es'); pg.select_option('#phrase', label='Help is needed'); pg.click('#phrase-use'); assert pg.input_value('#t-trans') == 'Se necesita ayuda'
        pg.click('#speech-start'); assert pg.locator('.toast.err:has-text("consent")').count() == 1 or not pg.is_enabled('#speech-start')
        with pg.expect_download() as d: pg.click('#t-export')
        t = open(d.value.path()).read(); assert 'Help is needed' in t and 'Se necesita ayuda' in t
        nav(pg, 'settings'); pg.fill('#s-endpoint', 'https://api.mymemory.translated.net'); pg.click('#s-save'); has(pg,'#s-err','localhost')
        pg.fill('#s-endpoint', 'http://localhost:5000'); pg.click('#s-save'); pg.wait_for_selector('.toast.ok'); nav(pg, 'translate'); assert pg.is_enabled('#t-local')
        for v in ['overview', 'evidence', 'signal', 'incidents', 'sop', 'training', 'security', 'settings']: nav(pg, v)
        external = [u for u in REQUESTS[start:] if not u.startswith(BASE) and not u.startswith('blob:') and not u.startswith('data:')]; assert not external, external; ctx.close()

    @test('E16 backup and restore: restore replaces newer data with the backup; backup file contains no plaintext')
    def _():
        ctx = new_ctx(br); pg = open_app(ctx); create_vault(pg); new_incident(pg, 'Before backup SECRETWORD'); nav(pg, 'security')
        with pg.expect_download() as d: pg.click('#bk-make')
        bp = os.path.join(TMP, 'backup.json'); d.value.save_as(bp); raw = open(bp).read(); assert 'SECRETWORD' not in raw and 'Pump' not in raw and 'FIELDLINE-BACKUP' in raw, 'backup must be ciphertext'
        pg.wait_for_selector('#bk-last:has-text("Last backup:")'); new_incident(pg, 'After backup'); nav(pg, 'incidents'); assert pg.locator('#inc-list tr').count() == 2
        nav(pg, 'security'); pg.set_input_files('#restore-file', bp); pg.wait_for_selector('#confirm-ok'); pg.click('#confirm-ok'); pg.wait_for_selector('#vault-pass'); unlock(pg); nav(pg, 'incidents'); assert pg.locator('#inc-list tr').count() == 1 and 'Before backup' in pg.inner_text('#inc-list'); ctx.close()

    @test('E17 stored incident data is ciphertext in IndexedDB (no plaintext title or text)')
    def _():
        ctx = new_ctx(br); pg = open_app(ctx); create_vault(pg); new_incident(pg, 'PLAINTEXTCHECK title')
        dump = pg.evaluate("new Promise(r=>{const q=indexedDB.open('fieldline');q.onsuccess=()=>{const d=q.result,out=[];const t=d.transaction(['incidents','attachments','meta']);for(const s of ['incidents','meta']){const x=t.objectStore(s).getAll();x.onsuccess=()=>{out.push(JSON.stringify(x.result,(k,v)=>v instanceof Uint8Array?Array.from(v):v));if(out.length==2)r(out.join(''))}}}})")
        assert 'PLAINTEXTCHECK' not in dump and 'Casing hot' not in dump and 'Pump-07' not in dump, 'plaintext found in IndexedDB'; assert PASS1 not in dump; ctx.close()

    @test('E18 complete local-data deletion: typed confirmation, passphrase check, database empty, fresh vault creation offered')
    def _():
        ctx = new_ctx(br); pg = open_app(ctx); create_vault(pg); new_incident(pg, 'To be erased'); nav(pg, 'security'); pg.click('#erase'); pg.fill('#erase-typed', 'nope'); pg.click('#erase-ok'); pg.wait_for_timeout(400); assert pg.locator('#pp1').count() == 0, 'must not proceed without ERASE'
        pg.click('#erase'); pg.fill('#erase-typed', 'ERASE'); pg.click('#erase-ok'); pg.wait_for_selector('#pp1'); pg.fill('#pp1', 'wrong passphrase here'); pg.click('#pp-ok'); pg.wait_for_selector('.toast.err:has-text("Nothing was erased")'); nav(pg, 'incidents'); assert 'To be erased' in pg.inner_text('#inc-list')
        nav(pg, 'security'); pg.click('#erase'); pg.fill('#erase-typed', 'ERASE'); pg.click('#erase-ok'); pg.wait_for_selector('#pp1'); pg.fill('#pp1', PASS1); pg.click('#pp-ok')
        pg.wait_for_selector('h1:has-text("Create your vault")', timeout=30000)
        names = pg.evaluate("indexedDB.databases().then(l=>l.map(d=>d.name))"); assert 'fieldline' not in names or pg.evaluate("new Promise(r=>{const q=indexedDB.open('fieldline');q.onsuccess=()=>{const d=q.result;const x=d.transaction('incidents').objectStore('incidents').count();x.onsuccess=()=>r(x.result)}})") == 0
        create_vault(pg, 'brand new vault passphrase 99'); nav(pg, 'incidents'); assert 'No incidents yet' in pg.inner_text('#main'); ctx.close()

    @test('E20 camera (fake device): CAMERA ON indicator, live preview, keeps running across pages, stops on request and when the vault locks')
    def _():
        ctx = new_ctx(br); pg = open_app(ctx); create_vault(pg); nav(pg, 'gesture'); assert pg.locator('#st-cam').count() == 0
        pg.click('#g-toggle'); has(pg, '#st-cam', 'CAMERA ON'); has(pg, '#g-state', 'dashed box'); assert pg.locator('#g-prev').count() == 1
        pg.fill('#g-sens', '80'); nav(pg, 'overview'); assert pg.locator('#st-cam').count() == 1, 'camera keeps running across pages so gestures can navigate'
        nav(pg, 'gesture'); pg.click('#g-toggle'); pg.wait_for_function('() => !document.querySelector("#st-cam")'); assert pg.locator('#st-cam').count() == 0
        pg.click('#g-toggle'); has(pg, '#st-cam', 'CAMERA ON'); nav(pg, 'security'); pg.click('#sec-lock'); pg.wait_for_selector('#vault-pass'); assert pg.locator('#st-cam').count() == 0, 'locking must stop the camera'; ctx.close()

    @test('E21 buttons whose effect is not visible in the page text: bundled phrase, stop-recording with none active, update check')
    def _():
        ctx = new_ctx(br); pg = open_app(ctx); create_vault(pg); nav(pg, 'translate'); pg.select_option('#phrase', label='Fire'); pg.click('#phrase-use'); assert pg.input_value('#t-trans') == 'आग'
        nav(pg, 'gesture'); pg.click('#man-stop'); has(pg, '.toast >> nth=-1', 'No recording is active'); nav(pg, 'settings'); has(pg, '#st-cache', 'ready'); pg.click('#s-update'); has(pg, '.toast >> nth=-1', 'Checked for updates'); ctx.close()

    @test('E19 no console or page errors (including CSP violations) occurred anywhere in the suite')
    def _():
        real = [e for e in ERRORS if 'Failed to load resource' not in e or '503' not in e]
        # E10 deliberately goes offline; ignore the browser's own network-failure noise only
        real = [e for e in real if 'net::ERR_INTERNET_DISCONNECTED' not in e and 'ERR_NETWORK' not in e]
        assert not real, real[:5]
    br.close()

srv.terminate(); shutil.rmtree(TMP, ignore_errors=True)
w = max(len(r[0]) for r in RESULTS)
for n, s, d, t in RESULTS: print(f'{s}  {n}  ({t}s)' + (f'\n      -> {d}' if d else ''))
passed = sum(r[1] == 'PASS' for r in RESULTS); print(f'\n{passed}/{len(RESULTS)} end-to-end tests passed')
json.dump([dict(name=n, status=s, detail=d, seconds=t) for n, s, d, t in RESULTS], open(os.path.join(ROOT, 'tests', 'e2e', 'results.json'), 'w'), indent=1)
sys.exit(0 if passed == len(RESULTS) else 1)
