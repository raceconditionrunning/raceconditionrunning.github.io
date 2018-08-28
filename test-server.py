import http.server
import socketserver

PORT = 8001

Handler = http.server.SimpleHTTPRequestHandler
httpd = socketserver.TCPServer(("", PORT), Handler)
httpd.serve_forever()
