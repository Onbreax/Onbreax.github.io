#!/usr/bin/env python3
"""Serve Matchwork locally and read Gmail via TLS. Python 3.9+, no packages."""
import email
import email.policy
import email.utils
import imaplib
import json
import re
import secrets
import ssl
import threading
import time
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST, PORT = "127.0.0.1", 8765
ORIGIN = f"http://{HOST}:{PORT}"
TOKEN = secrets.token_urlsafe(32)
MAX_MAIL = 2 * 1024 * 1024
QUERY = r"from:jobalerts-noreply@linkedin\.com after:[0-9]{9,12} before:[0-9]{9,12} -in:spam -in:trash"
SESSIONS, EPOCHS = {}, {}
LOCK = threading.RLock()

def valid_profile(value):
    return isinstance(value, str) and re.fullmatch(r"p[a-zA-Z0-9_-]{1,100}", value) is not None

def parse_mail(raw, mid):
    msg = email.message_from_bytes(raw, policy=email.policy.default)
    parts = []
    def walk(part, depth=0):
        if depth > 12 or len(parts) >= 32 or part.get_filename() or part.get_content_disposition() == "attachment":
            return
        if part.get_content_type() == "message/rfc822":
            return
        if part.is_multipart():
            for child in part.iter_parts():
                walk(child, depth + 1)
        elif part.get_content_type() in ("text/plain", "text/html"):
            data = part.get_payload(decode=True) or b""
            try:
                text = data.decode(part.get_content_charset() or "utf-8", errors="replace")
            except LookupError:
                text = data.decode("utf-8", errors="replace")
            parts.append({"mimeType": part.get_content_type(), "body": {"content": text[:1000000]}})
    walk(msg)
    result = {"id": mid, "payload": {"mimeType": "multipart/mixed", "headers": [{"name": k, "value": str(v)} for k, v in msg.items()], "parts": parts}}
    try:
        received = email.utils.parsedate_to_datetime(msg.get("Date", ""))
        result["internalDate"] = int(received.timestamp() * 1000)
    except (ValueError, TypeError, OverflowError):
        pass
    return result

class Mailbox:
    def __init__(self, address, password):
        self.email, self.password = address, password
        self.client = None
        self.query, self.ids = None, []
        self.lock = threading.RLock()
        self.touch = time.monotonic()
        self.open()

    def open(self):
        client = imaplib.IMAP4_SSL("imap.gmail.com", 993, ssl_context=ssl.create_default_context(), timeout=20)
        self.client = client
        try:
            client.login(self.email, self.password)
            kind, rows = client.list()
            folder = None
            for row in rows or []:
                if not isinstance(row, bytes) or not re.search(rb"\\All\b", row, re.I):
                    continue
                match = re.search(rb'"((?:[^"\\]|\\.)*)"\s*$', row)
                if match:
                    folder = b'"' + match.group(1) + b'"'
            if kind != "OK" or folder is None:
                raise ValueError("Le dossier Gmail Tous les messages est inaccessible en IMAP.")
            if client.select(folder, readonly=True)[0] != "OK":
                raise ValueError("Gmail a refusé la lecture du dossier Tous les messages.")
            self.validity = client.response("UIDVALIDITY")[1][0].decode("ascii")
            if not self.validity.isdigit():
                raise ValueError("Réponse Gmail IMAP incomplète.")
            self.query, self.ids = None, []
        except Exception:
            self.close()
            raise

    def close(self):
        if self.client:
            try:
                self.client.shutdown()
            except (OSError, imaplib.IMAP4.error):
                pass
            self.client = None

    def fetch(self, path):
        with self.lock:
            self.touch = time.monotonic()
            if self.client is None:
                self.open()
            if path == "profile":
                return {"emailAddress": self.email}
            if path.startswith("messages?"):
                pairs = urllib.parse.parse_qsl(path[9:], keep_blank_values=True)
                params = dict(pairs)
                if len(params) != len(pairs) or set(params) not in ({"q", "maxResults", "fields"}, {"q", "maxResults", "fields", "pageToken"}) or params["maxResults"] != "100" or params["fields"] != "messages(id),nextPageToken" or not re.fullmatch(QUERY, params["q"]):
                    raise ValueError("Lecture Gmail non autorisée.")
                if params["q"] != self.query:
                    quoted = '"' + params["q"].replace("\\", "\\\\").replace('"', '\\"') + '"'
                    kind, rows = self.client.uid("SEARCH", "X-GM-RAW", quoted)
                    if kind != "OK":
                        raise ValueError("Gmail a refusé la recherche des alertes.")
                    ids = b" ".join(r for r in rows if isinstance(r, bytes)).split()
                    if any(not re.fullmatch(rb"[0-9]{1,15}", uid) for uid in ids):
                        raise ValueError("Réponse Gmail invalide.")
                    self.ids = sorted((uid.decode("ascii") for uid in ids), key=int, reverse=True)
                    self.query = params["q"]
                cursor = params.get("pageToken", "0")
                if not re.fullmatch(r"[0-9]{1,8}", cursor):
                    raise ValueError("Reprise Gmail invalide. Modifie la période puis relance.")
                start = int(cursor)
                end = min(len(self.ids), start + 100)
                result = {"messages": [{"id": f"i{self.validity}_{uid}"} for uid in self.ids[start:end]]}
                if end < len(self.ids):
                    result["nextPageToken"] = str(end)
                return result
            match = re.fullmatch(r"messages/(i([0-9]{1,15})_([0-9]{1,15}))\?format=full", path)
            if not match or match[2] != self.validity or match[3] not in self.ids:
                raise ValueError("Lecture Gmail non autorisée ou identifiant ancien. Modifie la période puis relance.")
            kind, rows = self.client.uid("FETCH", match[3], f"(UID RFC822.SIZE BODY.PEEK[]<0.{MAX_MAIL+1}>)")
            literals = []
            for row in rows or []:
                if isinstance(row, tuple):
                    size = re.search(rb"RFC822.SIZE ([0-9]+)", row[0])
                    if size and int(size[1]) > MAX_MAIL:
                        raise ValueError("Email Gmail supérieur à 2 Mo ; récupération interrompue.")
                    literals.append(row[1])
            if kind != "OK" or len(literals) != 1 or len(literals[0]) > MAX_MAIL:
                raise ValueError("Email Gmail absent ou trop volumineux.")
            return parse_mail(literals[0], match[1])

def dispatch(action, body):
    profile = body.get("profileId")
    if not valid_profile(profile):
        raise ValueError("Profil Gmail invalide.")
    with LOCK:
        epoch = EPOCHS.get(profile, 0)
        session = SESSIONS.get(profile)
        if action == "forget":
            EPOCHS[profile] = epoch + 1
            old = SESSIONS.pop(profile, None)
            if old:
                old.close()
            return {}
    if action == "connect":
        address = str(body.get("email", "")).strip().lower()
        password = re.sub(r"\s", "", str(body.get("password", "")))
        if not password:
            if session and session.email == address:
                return {"email": address}
            raise ValueError("Connecte Gmail avec le mot de passe d’application pour cette session locale.")
        if len(address) > 254 or not re.fullmatch(r"[^\s<>\r\n]+@[^\s<>\r\n]+\.[^\s<>\r\n]+", address) or not re.fullmatch(r"[a-zA-Z0-9]{16}", password):
            raise ValueError("Adresse Gmail ou mot de passe d’application à 16 caractères invalide.")
        candidate = Mailbox(address, password)
        with LOCK:
            if EPOCHS.get(profile, 0) != epoch:
                candidate.close()
                raise ValueError("La connexion Gmail du profil a changé.")
            if len(SESSIONS) >= 30 and profile not in SESSIONS:
                candidate.close()
                raise ValueError("Trop de profils connectés. Dissocie un compte.")
            old = SESSIONS.get(profile)
            SESSIONS[profile] = candidate
            if old:
                old.close()
        return {"email": address}
    if action != "fetch" or not session or session.email != body.get("email"):
        raise ValueError("Reconnecte Gmail pour ce profil.")
    path = body.get("path")
    if not isinstance(path, str) or len(path) > 6000 or "\r" in path or "\n" in path or "#" in path:
        raise ValueError("Lecture Gmail non autorisée.")
    try:
        result = session.fetch(path)
        with LOCK:
            if EPOCHS.get(profile, 0) != epoch or SESSIONS.get(profile) is not session:
                raise ValueError("La connexion Gmail du profil a changé.")
        return result
    except Exception:
        session.close()
        raise

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Never log request bodies, credentials, or mail contents.

    def send(self, code, data, mime="application/json; charset=utf-8"):
        if isinstance(data, dict):
            data = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.end_headers()
        self.wfile.write(data)

    def host_ok(self):
        return self.headers.get("Host") == f"{HOST}:{PORT}"

    def do_GET(self):
        if not self.host_ok():
            return self.send(403, {"error": "Accès local refusé."})
        if self.path not in ("/", "/matchwork.html"):
            return self.send(404, {"error": "Page introuvable."})
        root = Path(__file__).resolve().parent
        page = root / "matchwork.html"
        if not page.exists():
            page = root.parent / "matchwork.html"
        try:
            html = page.read_text(encoding="utf-8")
            html = html.replace("<head>", f'<head><meta name="matchwork-gmail-local" content="{TOKEN}">', 1)
            self.send(200, html.encode("utf-8"), "text/html; charset=utf-8")
        except OSError:
            self.send(404, {"error": "Place matchwork.html à côté du lanceur."})

    def do_POST(self):
        if not self.host_ok() or self.headers.get("Origin") != ORIGIN or self.headers.get("X-Matchwork-Local") != TOKEN:
            return self.send(403, {"error": "Accès local refusé."})
        if not self.path in ("/gmail/connect", "/gmail/fetch", "/gmail/forget") or self.headers.get_content_type() != "application/json":
            return self.send(400, {"error": "Action non autorisée."})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size <= 0 or size > 65536:
                raise ValueError("Requête locale trop volumineuse.")
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError("Requête invalide.")
            result = dispatch(self.path.rsplit("/", 1)[1], body)
            self.send(200, result)
        except imaplib.IMAP4.error:
            self.send(400, {"error": "Gmail a refusé la connexion ou la lecture. Vérifie le mot de passe d’application et la validation en deux étapes."})
        except ValueError as error:
            self.send(400, {"error": str(error) if str(error).startswith(("Gmail", "Le dossier", "Réponse Gmail", "Email Gmail", "Lecture Gmail", "Reprise Gmail", "Profil Gmail", "Adresse Gmail", "Connecte Gmail", "Reconnecte Gmail", "La connexion Gmail", "Trop de profils", "Requête")) else "Requête locale invalide."})
        except Exception:
            self.send(502, {"error": "Connexion Gmail interrompue ou délai dépassé. Relance la récupération."})

def main():
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError:
        print(f"Le port {PORT} est occupé. Ferme le précédent lanceur Matchwork puis relance.")
        return
    print(f"Matchwork : {ORIGIN}/matchwork.html")
    print("Garde cette fenêtre ouverte. Ctrl+C pour arrêter. Aucun mot de passe n’est enregistré sur le disque.")
    webbrowser.open(f"{ORIGIN}/matchwork.html")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        for session in list(SESSIONS.values()):
            session.close()
        SESSIONS.clear()

if __name__ == "__main__":
    main()
