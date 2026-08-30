#!/usr/bin/env python3
"""Static server that refuses to let anything cache.

python3 -m http.server sends Last-Modified, so browsers happily reuse ES
modules across reloads. That silently invalidated visual verification: the
page kept running an OLD fps.js while curl fetched the new one, so a fix
could look "not applied" when it was fine on disk (and vice versa -- a
stale bug could look alive after it was fixed).

    tools/serve.py <port> <dir>
"""
import sys, os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def send_header(self, key, value):
        if key.lower() == 'last-modified':
            return  # no validator -> no 304 revalidation path at all
        super().send_header(key, value)

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1])
    os.chdir(sys.argv[2])
    ThreadingHTTPServer(('', port), NoCacheHandler).serve_forever()
