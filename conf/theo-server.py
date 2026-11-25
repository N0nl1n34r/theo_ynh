#!/usr/bin/env python3
"""
Theo Companion-Server — macht CalDAV/WebDAV (Nextcloud) aus dem Browser voll nutzbar.

Warum es das gibt: Der Browser verweigert Webseiten das Lesen von Antworten
fremder Server (CORS-Sicherheitsregel). Eine lokal geöffnete Theo-HTML-Datei
ist "fremd" gegenüber der Nextcloud — Kalender-Zugriff bleibt blockiert. Dieser
kleine Server löst das: Er liefert Theo aus und leitet alle Kalender-Anfragen
serverseitig weiter. Server-zu-Server gibt es kein CORS.

Start:
    python3 theo-server.py https://deine-nextcloud.example.de

Optionen:
    --port 8787                     (Standard 8787)
    --datei lebensrhythmus-prototyp.html

Danach http://localhost:8787 öffnen. Theo erkennt den Companion automatisch
(Prüfung von /__theo_proxy__) und leitet Verbinden/Schreiben/Lesen über ihn.
Zugangsdaten kommen aus der Theo-Konfiguration (Verbindung) und werden nur für
die jeweilige Anfrage an die Nextcloud weitergereicht — dieser Server speichert
nichts. Er lauscht nur auf 127.0.0.1 (localhost) und ist damit nicht aus dem
Netzwerk erreichbar.

Nur Python-Standardbibliothek — keine Installation nötig.
"""
import argparse
import base64
import hmac
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ARGS = None

PROXY_METHODS = ('PROPFIND', 'REPORT', 'PUT', 'DELETE', 'MKCALENDAR',
                 'PROPPATCH', 'MOVE', 'POST', 'PATCH', 'LOCK', 'UNLOCK')

# ---------- PWA-Bestandteile (Alpha-Betrieb auf Laptop/Tablet/Smartphone) ----------
MANIFEST = json.dumps({
    'name': 'Theo',
    'short_name': 'Theo',
    'description': 'Ruhige Planung und Lebensrhythmus — Blöcke, Termine, Phasen, Kalender-Sync',
    'start_url': './',
    'scope': './',
    'display': 'standalone',
    'background_color': '#FBF9F2',
    'theme_color': '#FBF9F2',
    'icons': [{'src': 'theo-icon.png', 'sizes': '512x512', 'type': 'image/png'}]
})

# Network-first: Updates sind live (neue HTML-Datei auf dem Server genügt),
# der Cache hält nur den letzten Stand für Offline-Start bereit.
SW_JS = """const C='theo-shell-v1';
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim())});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET')return;
  if(u.pathname.indexOf('/__dav_proxy__')!==-1||u.pathname.indexOf('/__theo_proxy__')!==-1)return;
  if(!(u.pathname.endsWith('/')||u.pathname.endsWith('/theo-icon.png')))return;
  e.respondWith(fetch(e.request).then(r=>{
    const cp=r.clone();
    caches.open(C).then(c=>c.put(e.request,cp));
    return r;
  }).catch(()=>caches.match(e.request).then(m=>m||caches.match('./'))));
});
"""


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'TheoCompanion/1.0'

    def log_message(self, fmt, *args):
        sys.stderr.write('[theo] %s %s\n' % (self.command, self.path))

    # ---------- Antworten ----------
    def _send(self, status, body, ctype='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    # ---------- Endpunkte ----------
    def do_OPTIONS(self):
        self._send(204, b'')

    # ---------- HTTP-Basic-Schutz (für Betrieb im offenen Internet, z. B. VPS) ----------
    def _auth_ok(self):
        if not getattr(ARGS, 'auth', None):
            return True
        h = self.headers.get('Authorization', '')
        if h.startswith('Basic '):
            try:
                dec = base64.b64decode(h[6:].strip()).decode('utf-8', 'replace')
                if hmac.compare_digest(dec, ARGS.auth):
                    return True
            except Exception:
                pass
        body = '401 — Theo verlangt Benutzer & Passwort (HTTP Basic).'
        self.send_response(401)
        self.send_header('WWW-Authenticate', 'Basic realm="Theo", charset="UTF-8"')
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body.encode('utf-8'))))
        self.end_headers()
        try:
            self.wfile.write(body.encode('utf-8'))
        except (BrokenPipeError, ConnectionResetError):
            pass
        return False

    def _pfad_strip(self, p):
        """Basis-Pfad abziehen, wenn Theo unterhalb einer Domain läuft (YunoHost /pfad)."""
        pre = getattr(ARGS, 'pfad', '') or ''
        if pre and p == pre:
            return '/'
        if pre and p.startswith(pre + '/'):
            return p[len(pre):]
        return p

    def do_GET(self):
        if not self._auth_ok():
            return
        p = self._pfad_strip(urllib.parse.urlparse(self.path).path)
        if p == '/__theo_proxy__':
            self._send(200, json.dumps({'proxy': True, 'target': ARGS.target}).encode())
        elif p == '/' or p == '/index.html':
            self._serve_html()
        elif p == '/manifest.webmanifest':
            self._send(200, MANIFEST.encode(), 'application/manifest+json; charset=utf-8')
        elif p == '/sw.js':
            self._send(200, SW_JS.encode(), 'application/javascript; charset=utf-8')
        elif p == '/theo-icon.png':
            self._serve_file('theo-icon.png', 'image/png')
        else:
            self._proxy()

    def _serve_file(self, name, ctype):
        base = os.path.dirname(os.path.abspath(__file__))
        cand = os.path.join(base, name)
        if os.path.isfile(cand):
            with open(cand, 'rb') as f:
                self._send(200, f.read(), ctype)
            return
        self._send(404, ('Datei fehlt neben theo-server.py: %s' % name).encode(), 'text/plain; charset=utf-8')

    def _serve_html(self):
        for cand in (ARGS.datei, os.path.join(os.path.dirname(os.path.abspath(__file__)), ARGS.datei)):
            if os.path.isfile(cand):
                with open(cand, 'rb') as f:
                    self._send(200, f.read(), 'text/html; charset=utf-8')
                return
        self._send(500, ('Theo-HTML nicht gefunden: %s' % ARGS.datei).encode(), 'text/plain; charset=utf-8')

    # ---------- Der eigentliche Proxy ----------
    def _proxy(self):
        if not self._auth_ok():
            return
        path = self._pfad_strip(urllib.parse.urlparse(self.path).path)
        if not path.startswith('/__dav_proxy__'):
            self._send(404, b'not found', 'text/plain')
            return
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        url = (qs.get('url') or [None])[0]
        if not url:
            self._send(400, b'missing url', 'text/plain')
            return
        if not url.lower().startswith(('http://', 'https://')):
            self._send(400, b'bad url', 'text/plain')
            return
        # Ziel-Pinning: der Proxy leitet ausschließlich zur konfigurierten
        # Nextcloud weiter (kein offenes Relay, solange der Server erreichbar ist)
        if not url.lower().startswith(ARGS.target.lower()):
            self._send(403, ('URL liegt außerhalb des Companion-Ziels (%s)' % ARGS.target).encode('utf-8'),
                       'text/plain; charset=utf-8')
            return
        user = (qs.get('u') or [''])[0]
        pw = (qs.get('p') or [''])[0]
        length = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(length) if length else None
        req = urllib.request.Request(url, data=body, method=self.command)
        # Manche Hoster (WAF/Bot-Schutz) blocken Standard-Python-User-Agents → harmlosen UA senden
        req.add_header('User-Agent', 'Mozilla/5.0 (compatible; Theo/5; personal CalDAV client)')
        req.add_header('Accept', '*/*')
        if user or pw:
            token = base64.b64encode((user + ':' + pw).encode('utf-8')).decode('ascii')
            req.add_header('Authorization', 'Basic ' + token)
        ctype = self.headers.get('Content-Type')
        if ctype:
            req.add_header('Content-Type', ctype)
        depth = self.headers.get('Depth')
        if depth is not None:
            req.add_header('Depth', depth)
        try:
            resp = urllib.request.urlopen(req, timeout=60)
            status, data = resp.getcode(), resp.read()
            rtype = resp.headers.get('Content-Type', 'application/xml; charset=utf-8')
        except urllib.error.HTTPError as e:
            status = e.code
            data = e.read() if e.fp else b''
            rtype = e.headers.get('Content-Type', 'text/plain') if e.headers else 'text/plain'
        except Exception as e:
            self._send(502, ('Upstream-Fehler: %s' % e).encode('utf-8'), 'text/plain; charset=utf-8')
            return
        self._send(status, data, rtype)

    # DAV-Methoden an den Proxy binden (BaseHTTPRequestHandler braucht do_<METHOD>)
    do_PUT = do_DELETE = do_PROPFIND = do_REPORT = do_MKCALENDAR = do_PROPPATCH = do_MOVE = do_POST = do_PATCH = do_LOCK = do_UNLOCK = _proxy


def main():
    global ARGS
    ap = argparse.ArgumentParser(description='Theo Companion-Server (lokaler CalDAV-Proxy)')
    ap.add_argument('target', help='Basis-URL der Nextcloud, z. B. https://cloud.example.de')
    ap.add_argument('--port', type=int, default=8787)
    ap.add_argument('--host', default='127.0.0.1', help='Bind-Adresse (0.0.0.0 für Sandbox/Preview)')
    ap.add_argument('--datei', default='lebensrhythmus-prototyp.html', help='Pfad zur Theo-HTML')
    ap.add_argument('--auth', metavar='BENUTZER:PASSWORT', default=None,
                    help='HTTP-Basic-Schutz für Betrieb im offenen Internet (VPS); alternativ Umgebungsvariable THEO_AUTH')
    ap.add_argument('--pfad', default='', help='Basis-Pfad, wenn Theo unterhalb einer Domain läuft (z. B. /theo)')
    ARGS = ap.parse_args()
    if not ARGS.auth:
        ARGS.auth = os.environ.get('THEO_AUTH') or None
    if ARGS.auth and ':' not in ARGS.auth:
        sys.exit('--auth erwartet BENUTZER:PASSWORT')
    t = ARGS.target.strip().rstrip('/')
    if not t.lower().startswith(('http://', 'https://')):
        t = 'https://' + t
    ARGS.target = t
    _pf = ARGS.pfad.strip('/')
    ARGS.pfad = ('/' + _pf) if _pf else ''
    srv = ThreadingHTTPServer((ARGS.host, ARGS.port), Handler)
    print('Theo Companion läuft:  http://%s:%d' % (ARGS.host, ARGS.port))
    print('Kalender-Ziel:         %s' % ARGS.target)
    print('App-Datei:             %s' % ARGS.datei)
    if ARGS.pfad:
        print('Basis-Pfad:            %s' % ARGS.pfad)
    if ARGS.auth:
        print('Zugriffsschutz:        HTTP Basic (--auth)')
    else:
        print('Zugriffsschutz:        keiner')
        if ARGS.host in ('0.0.0.0', '::'):
            print('Hinweis: offen an 0.0.0.0 — im Heimnetz ok, im Internet nur mit --auth betreiben!')
    print('Beenden mit Strg+C.')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\nBye.')


if __name__ == '__main__':
    main()
