import importlib.util
import json
from pathlib import Path
import threading
import unittest
import urllib.request
import urllib.error

spec = importlib.util.spec_from_file_location("gmail_local", Path(__file__).parents[1] / "matchwork/gmail-local.py")
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)

class FakeImap:
    calls = []
    def __init__(self, host, port, **kwargs):
        self.calls.append(("tls", host, port, kwargs["ssl_context"].check_hostname))
    def login(self, email, password):
        self.calls.append(("login", email))
    def list(self):
        return "OK", [b'(\\HasNoChildren \\All) "/" "[Gmail]/Tous les messages"']
    def select(self, folder, readonly=False):
        self.calls.append(("select", folder, readonly))
        return "OK", [b"2"]
    def response(self, name):
        return name, [b"42"]
    def uid(self, command, *args):
        self.calls.append((command,) + args)
        if command == "SEARCH":
            return "OK", [b"2 8"]
        raw = b"From: LinkedIn <jobalerts-noreply@linkedin.com>\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nResponsable conformit=C3=A9\r\n"
        return "OK", [(b"1 (UID 8 RFC822.SIZE " + str(len(raw)).encode() + b" BODY[] {" + str(len(raw)).encode() + b"}", raw), b")"]
    def shutdown(self):
        self.calls.append(("shutdown",))

class GmailTests(unittest.TestCase):
    def setUp(self):
        self.original = g.imaplib.IMAP4_SSL
        g.imaplib.IMAP4_SSL = FakeImap
        FakeImap.calls.clear()
        g.SESSIONS.clear()
        g.EPOCHS.clear()
    def tearDown(self):
        for session in g.SESSIONS.values():
            session.close()
        g.SESSIONS.clear()
        g.imaplib.IMAP4_SSL = self.original
    def test_read_and_profiles(self):
        result = g.dispatch("connect", {"profileId": "p1", "email": "test@gmail.com", "password": "abcd efgh ijkl mnop"})
        self.assertEqual(result, {"email": "test@gmail.com"})
        path = "messages?" + g.urllib.parse.urlencode({"q": "from:jobalerts-noreply@linkedin.com after:1790000000 before:1792314000 -in:spam -in:trash", "maxResults": "100", "fields": "messages(id),nextPageToken"})
        listing = g.dispatch("fetch", {"profileId": "p1", "email": "test@gmail.com", "path": path})
        self.assertEqual(listing["messages"], [{"id": "i42_8"}, {"id": "i42_2"}])
        mail = g.dispatch("fetch", {"profileId": "p1", "email": "test@gmail.com", "path": "messages/i42_8?format=full"})
        self.assertIn("conformité", mail["payload"]["parts"][0]["body"]["content"])
        self.assertTrue(any(c[0] == "FETCH" and "BODY.PEEK[]" in c[-1] for c in FakeImap.calls))
        self.assertTrue(any(c[0] == "select" and c[-1] is True for c in FakeImap.calls))
        self.assertIn(("tls", "imap.gmail.com", 993, True), FakeImap.calls)
        for bad in ["messages/send", "messages/i41_8?format=full", "https://evil.org", path + "&q=other", path.replace("jobalerts-noreply", "other")]:
            with self.assertRaises(ValueError):
                g.dispatch("fetch", {"profileId": "p1", "email": "test@gmail.com", "path": bad})
        with self.assertRaises(ValueError):
            g.dispatch("fetch", {"profileId": "p2", "email": "test@gmail.com", "path": "profile"})
        g.dispatch("forget", {"profileId": "p1"})
        self.assertNotIn("p1", g.SESSIONS)
    def test_attachment_exclusion(self):
        raw = b'From: a@b.com\r\nContent-Type: multipart/mixed; boundary=x\r\n\r\n--x\r\nContent-Type: text/plain\r\n\r\nKeep\r\n--x\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename=a.txt\r\n\r\nPrivate attachment\r\n--x--\r\n'
        self.assertEqual(len(g.parse_mail(raw, "i1_1")["payload"]["parts"]), 1)
    def test_http_origin_and_token(self):
        server = g.ThreadingHTTPServer(("127.0.0.1", 0), g.Handler)
        old_port, old_origin = g.PORT, g.ORIGIN
        g.PORT = server.server_port
        g.ORIGIN = f"http://127.0.0.1:{g.PORT}"
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        def request(headers, data=None, path="/gmail/connect"):
            return urllib.request.urlopen(urllib.request.Request(g.ORIGIN + path, data=data, headers=headers), timeout=3)
        try:
            with request({}, path="/matchwork.html") as r:
                html = r.read().decode()
                self.assertIn(g.TOKEN, html)
                self.assertEqual(r.headers["X-Frame-Options"], "DENY")
            body = json.dumps({"profileId": "p1", "email": "test@gmail.com", "password": "abcdefghijklmnop"}).encode()
            headers = {"Content-Type": "application/json", "Origin": g.ORIGIN, "X-Matchwork-Local": g.TOKEN}
            for bad in [{}, {**headers, "Origin": "https://evil.example"}, {**headers, "X-Matchwork-Local": "bad"}, {**headers, "Host": "evil.example"}]:
                with self.assertRaises(urllib.error.HTTPError) as error:
                    request(bad, body)
                self.assertEqual(error.exception.code, 403)
            with request(headers, body) as response:
                self.assertEqual(json.load(response)["email"], "test@gmail.com")
        finally:
            server.shutdown()
            server.server_close()
            g.PORT, g.ORIGIN = old_port, old_origin

if __name__ == "__main__":
    unittest.main()
