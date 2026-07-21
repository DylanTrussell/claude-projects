// Local dev harness: serves the assembled game and emulates the platform's
// room kernel by driving the REAL server.js GameServer class over 'ws'.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const PORT = process.env.PORT || 8787;

// Load server.js with a shim for cloudflare:workers
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8')
  .replace(/import\s*\{\s*DurableObject\s*\}\s*from\s*'cloudflare:workers';?/, 'class DurableObject { constructor(ctx, env) {} }');
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const GameServer = mod.GameServer;

const rooms = new Map();
function room(id) {
  if (!rooms.has(id)) rooms.set(id, new GameServer({}, {}));
  return rooms.get(id);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.m4a': 'audio/mp4' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end('404 ' + p); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const m = req.url.match(/\/ws\/([\w-]+)/);
  if (!m) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const gs = room(m[1]);
    const wrapper = { send: (d) => { try { ws.send(d); } catch (_) {} } };
    ws.on('message', (d) => gs.onMessage(wrapper, { data: d.toString() }));
    ws.on('close', () => gs.onClose(wrapper));
    ws.on('error', () => gs.onClose(wrapper));
  });
});

server.listen(PORT, () => console.log('local harness on http://localhost:' + PORT));
