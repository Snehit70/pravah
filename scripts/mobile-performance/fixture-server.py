"""Loopback-only provider fixture. It never forwards requests to a provider."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import date
import json


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        messages = request.get("messages", [])
        tool_results = [message.get("content", "") for message in messages if message.get("role") == "tool"]
        if not tool_results:
            # Exercise the production agent loop and local read tools, with no
            # model variability. The second round validates their actual results.
            day = date.today().isoformat()
            calls = [("get_tasks_in_range", {"startDate": day, "endDate": day}), ("get_completed", {})]
            message = {"role": "assistant", "content": None, "tool_calls": [
                {"id": f"fixture-{index}", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}
                for index, (name, args) in enumerate(calls)
            ]}
        else:
            text = json.dumps(tool_results)
            valid = "Fixture task 300" in text and "Fixture task 450" in text
            message = {"role": "assistant", "content": "Native fixture response: scheduled tasks received" if valid else "Native fixture ERROR: task scope missing"}
        payload = json.dumps({"choices": [{"message": message}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args):
        pass


HTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
