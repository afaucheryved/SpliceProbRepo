#!/usr/bin/env python3
"""Static file server + reverse proxy for the SpliceProb frontend.

This is a *frontend-only* dev tool. It never touches ``app/`` (the FastAPI
backend). It exists because the SpliceProb backend registers no CORS
middleware, so a browser page served from one origin (this script) cannot
call a FastAPI server on another origin (e.g. http://127.0.0.1:8000)
directly. Proxying same-origin sidesteps CORS without modifying backend code
-- the same trick a Vite/webpack dev-server "proxy" option performs.

Usage:
    python3 frontend/serve.py
    python3 frontend/serve.py --port 5500 --backend http://127.0.0.1:8000

Then open http://127.0.0.1:5500 in a browser. Any request whose path starts
with one of API_PREFIXES is forwarded to the backend; everything else is
served as a static file from this directory.
"""
import argparse
import http.server
import os
import urllib.error
import urllib.request

API_PREFIXES = (
    "/GetSimpleProb/",
    "/GetDeltaScore/",
    "/resetgv",
    "/get/",
    "/altbyindex/",
    "/altbypattern/",
    "/mutateindependently",
    "/analysis/",
    "/ensembl/",
    "/docs",
    "/openapi.json",
    "/redoc",
)

BACKEND_URL = "http://127.0.0.1:8000"


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self._is_api_path():
            self._proxy("GET")
        else:
            super().do_GET()

    def do_POST(self):
        if self._is_api_path():
            self._proxy("POST")
        else:
            self.send_error(405)

    def _is_api_path(self) -> bool:
        return self.path.startswith(API_PREFIXES)

    def _proxy(self, method: str):
        target = BACKEND_URL.rstrip("/") + self.path
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length else None

        req = urllib.request.Request(target, data=body, method=method)
        if body is not None:
            req.add_header(
                "Content-Type", self.headers.get("Content-Type", "application/json")
            )

        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                self._relay(resp.status, resp.getheaders(), resp.read())
        except urllib.error.HTTPError as e:
            self._relay(e.code, e.headers.items() if e.headers else [], e.read())
        except urllib.error.URLError as e:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                (
                    '{"detail":"Cannot reach backend at %s (%s). '
                    'Is `fastapi dev app/main.py` running?"}' % (target, e.reason)
                ).encode("utf-8")
            )

    def _relay(self, status: int, headers, payload: bytes):
        self.send_response(status)
        skip = {"transfer-encoding", "connection", "content-encoding"}
        for key, value in headers:
            if key.lower() not in skip:
                self.send_header(key, value)
        self.end_headers()
        if payload:
            self.wfile.write(payload)

    def end_headers(self):
        # Relaxed CORS on the *frontend's own* responses only (harmless for a
        # local static server); does not touch the FastAPI backend at all.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        print(f"[frontend] {self.address_string()} - {fmt % args}")


def main():
    global BACKEND_URL
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5500)
    parser.add_argument("--backend", default=BACKEND_URL)
    args = parser.parse_args()

    BACKEND_URL = args.backend

    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"SpliceProb frontend: http://127.0.0.1:{args.port}")
    print(f"Proxying API calls to: {BACKEND_URL}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
