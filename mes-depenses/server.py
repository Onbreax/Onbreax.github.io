#!/usr/bin/env python3
"""Local desktop launcher. No bank credentials are stored by this server."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

BASE = "https://api.enablebanking.com"
CRYPTO_BASE = "https://wapi.crypto.com"
ROOT = Path(__file__).resolve().parent
HTML = ROOT / "mes-depenses.html"
if not HTML.exists():
    HTML = ROOT.parent / "mes-depenses.html"


def allowed(path, method):
    parts = urllib.parse.urlsplit(BASE + path)
    if parts.scheme != "https" or parts.netloc != "api.enablebanking.com" or parts.fragment:
        return False
    p = parts.path
    if "%" in p or ".." in p:
        return False
    if method == "POST":
        return p in ("/auth", "/sessions") and not parts.query
    if method != "GET":
        return False
    return p in ("/application", "/aspsps") or bool(
        re.fullmatch(r"/sessions/[a-zA-Z0-9_-]{1,150}", p)
        or re.fullmatch(r"/accounts/[a-zA-Z0-9_-]{1,150}/(balances|transactions)", p)
    )


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        return None


def crypto_allowed(path, method):
    return method == "GET" and path in ("/v1/portfolio", "/v1/crypto-account", "/v1/fiat-account")


def upstream_request(request):
    path, method = request["path"], request["method"]
    headers = {"Accept": "application/json", "Content-Type": "application/json", "User-Agent": "MesDepenses/1.1.0"}
    if request.get("provider", "bank") == "crypto":
        if not crypto_allowed(path, method):
            raise ValueError()
        supplied = request["headers"]
        for field, pattern in (("Cdc-Api-Key", r"[!-~]{1,500}"), ("Cdc-Api-Timestamp", r"[0-9]{13}"), ("Cdc-Api-Signature", r"[a-zA-Z0-9+/]{43}=")):
            value = supplied[field]
            if not isinstance(value, str) or not re.fullmatch(pattern, value):
                raise ValueError()
            headers[field] = value
        return urllib.request.Request(CRYPTO_BASE + path, method="GET", headers=headers)
    if request.get("provider", "bank") != "bank":
        raise ValueError()
    token = request["token"]
    if not isinstance(path, str) or not allowed(path, method) or not isinstance(token, str) or len(token) > 20000 or not re.fullmatch(r"[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+", token):
        raise ValueError()
    body = request.get("body")
    payload = None
    if method == "POST":
        if not isinstance(body, str) or len(body.encode()) > 100000:
            raise ValueError()
        payload = body.encode()
    headers["Authorization"] = "Bearer " + token
    return urllib.request.Request(BASE + path, data=payload, method=method, headers=headers)


class Handler(BaseHTTPRequestHandler):
    server_version = "MesDepenses/1.1.0"

    def log_message(self, *args):
        # Bank request paths, authorization codes and tokens are never logged.
        pass

    def response(self, status, content, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers()
        self.wfile.write(content)

    def trusted_host(self):
        port = self.server.server_port
        return self.headers.get("Host") in ("127.0.0.1:" + str(port), "localhost:" + str(port))

    def do_GET(self):
        if not self.trusted_host() or urllib.parse.urlsplit(self.path).path not in ("/", "/mes-depenses.html"):
            self.response(404, b"Not found", "text/plain")
            return
        self.response(200, HTML.read_bytes(), "text/html; charset=utf-8")

    def do_POST(self):
        origins = ("http://127.0.0.1:" + str(self.server.server_port), "http://localhost:" + str(self.server.server_port))
        if not self.trusted_host() or self.path != "/bank-api" or self.headers.get("Origin") not in origins:
            self.response(403, b"Forbidden", "text/plain")
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 200000:
                raise ValueError()
            request = json.loads(self.rfile.read(size))
            req = upstream_request(request)
            opener = urllib.request.build_opener(NoRedirect())
            deadline = time.monotonic() + 50
            try:
                remote = opener.open(req, timeout=40)
            except urllib.error.HTTPError as error:
                remote = error
            with remote:
                chunks = []
                total = 0
                while True:
                    chunk = remote.read(8192)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > 4 * 1024 * 1024 or time.monotonic() > deadline:
                        raise ValueError()
                    chunks.append(chunk)
                result = {"status": remote.code, "text": b"".join(chunks).decode("utf-8")}
            self.response(200, json.dumps(result).encode(), "application/json")
        except (ValueError, KeyError, TypeError, urllib.error.URLError, OSError):
            self.response(502, b'{"error":"Connexion bancaire interrompue ou requete non autorisee."}', "application/json")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-open", action="store_true")
    args = parser.parse_args()
    if not HTML.is_file():
        raise SystemExit("Le fichier mes-depenses.html doit se trouver a cote du lanceur.")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    url = "http://127.0.0.1:" + str(args.port)
    print("Mes depenses : " + url + "\nLaisse cette fenetre ouverte pendant la synchronisation. Ctrl+C pour fermer.")
    if not args.no_open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
