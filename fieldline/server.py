#!/usr/bin/env python3
"""FIELDLINE local development server.
Serves static files from this folder, bound to 127.0.0.1 only. No backend, no uploads, no logging of content.
Run:  python3 server.py [port]      then open http://localhost:8000/
"""
import http.server, socketserver, sys, os, webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
CSP = ("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; "
       "font-src 'self'; manifest-src 'self'; worker-src 'self'; "
       "connect-src 'self' http://localhost:* http://127.0.0.1:*; "  # localhost only: optional local translation server
       "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml'}
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def end_headers(self):
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        self.send_header('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def do_GET(self):
        # Only serve the application itself, never the tests, docs source or dotfiles.
        p = self.path.split('?')[0]
        if p.startswith(('/tests', '/docs')) or '/.' in p or p.endswith(('.py', '.json')) and not p.endswith('manifest.webmanifest'):
            self.send_error(404); return
        super().do_GET()
    def log_message(self, fmt, *args): pass  # no request logging

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('127.0.0.1', PORT), Handler) as s:
        url = f'http://localhost:{PORT}/'
        print(f'FIELDLINE running at {url}  (bound to 127.0.0.1 only; Ctrl+C to stop)')
        try: webbrowser.open(url)
        except Exception: pass
        try: s.serve_forever()
        except KeyboardInterrupt: print('\nStopped.')
