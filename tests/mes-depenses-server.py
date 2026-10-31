from pathlib import Path
import importlib.util
import json
import threading
import unittest
import urllib.request
import urllib.error

source = Path(__file__).resolve().parent.parent / "mes-depenses/server.py"
spec = importlib.util.spec_from_file_location("spending_server", source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PolicyTest(unittest.TestCase):
    def test_crypto_read_only(self):
        self.assertTrue(module.crypto_allowed("/v1/portfolio", "GET"))
        for path, method in [("/v1/portfolio", "POST"), ("/v1/order", "GET"), ("/v1/portfolio?x=1", "GET"), ("//evil.test", "GET")]:
            self.assertFalse(module.crypto_allowed(path, method))
        signed = {"provider": "crypto", "path": "/v1/portfolio", "method": "GET", "headers": {"Cdc-Api-Key": "fake", "Cdc-Api-Timestamp": "1793440800123", "Cdc-Api-Signature": "a" * 43 + "="}}
        req = module.upstream_request(signed)
        self.assertEqual(req.full_url, "https://wapi.crypto.com/v1/portfolio")
        self.assertIsNone(req.data)
        self.assertNotIn("Authorization", req.headers)
        signed["headers"]["Cdc-Api-Key"] = "fake\r\nInjected: header"
        with self.assertRaises(ValueError):
            module.upstream_request(signed)

    def test_read_only_policy(self):
        self.assertTrue(module.allowed("/application", "GET"))
        self.assertTrue(module.allowed("/auth", "POST"))
        self.assertTrue(module.allowed("/accounts/id/transactions?date_from=2026-10-01", "GET"))
        for path, method in [("/payments", "POST"), ("/application", "DELETE"), ("/accounts/%2e%2e/transactions", "GET"), ("/auth#fragment", "POST")]:
            self.assertFalse(module.allowed(path, method))

    def test_server_origin_and_credentials(self):
        server = module.ThreadingHTTPServer(("127.0.0.1", 0), module.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = "http://127.0.0.1:" + str(server.server_port)
        try:
            with urllib.request.urlopen(base) as response:
                self.assertIn(b"Mes d", response.read())
                self.assertEqual(response.headers.get("Cache-Control"), "no-store")
            malicious = urllib.request.Request(base + "/bank-api", data=b"{}", headers={"Origin": "https://evil.example", "Content-Type": "application/json"})
            with self.assertRaises(urllib.error.HTTPError) as rejected:
                urllib.request.urlopen(malicious)
            self.assertEqual(rejected.exception.code, 403)
            invalid = urllib.request.Request(base + "/bank-api", data=json.dumps({"path": "/payments", "method": "POST", "token": "x.y.z", "body": "{}"}).encode(), headers={"Origin": base, "Content-Type": "application/json"})
            with self.assertRaises(urllib.error.HTTPError) as rejected:
                urllib.request.urlopen(invalid)
            self.assertEqual(rejected.exception.code, 502)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
