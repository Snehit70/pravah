"""Loopback-only provider fixture. It never forwards requests to a provider."""
from http.server import BaseHTTPRequestHandler, HTTPServer
import json


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        # Require the prompt to contain actual scheduled task data. This catches
        # the Inbox-only Kairo regression through the production prompt path.
        text = json.dumps(request)
        content = "Native fixture response: scheduled tasks received" if "Fixture task 300" in text else "Native fixture ERROR: schedule missing"
        payload = json.dumps({"choices": [{"message": {"role": "assistant", "content": content}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args):
        pass


HTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
