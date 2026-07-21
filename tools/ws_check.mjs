import WebSocket from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';
const agent = new HttpsProxyAgent('http://127.0.0.1:40117');
const URL = 'wss://soft-cabin-573.higgsfield.gg/ws/wsverify' + Math.floor(Math.random()*10000);
const log = [];
function client(pid) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL, { agent });
    const msgs = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', pid })));
    ws.on('message', (d) => { const m = JSON.parse(d); msgs.push(m); log.push(pid + ' <- ' + m.t); });
    ws.on('error', reject);
    setTimeout(() => resolve({ ws, msgs }), 2500);
  });
}
const A = await client('verify-host');
const B = await client('verify-guest');
B.ws.send(JSON.stringify({ t: 'hero', hero: 'vc' }));
B.ws.send(JSON.stringify({ t: 'ready', ready: true }));
await new Promise(r => setTimeout(r, 800));
A.ws.send(JSON.stringify({ t: 'start' }));
await new Promise(r => setTimeout(r, 1200));
A.ws.send(JSON.stringify({ t: 'snap', snap: { v: { test: 1 }, evs: [] } }));
await new Promise(r => setTimeout(r, 800));
const youA = A.msgs.find(m => m.t === 'you');
const youB = B.msgs.find(m => m.t === 'you');
const startB = B.msgs.find(m => m.t === 'start');
const snapB = B.msgs.find(m => m.t === 'snap');
console.log('A role:', youA && youA.role, '| B role:', youB && youB.role);
console.log('B got start:', !!startB, startB && ('seed=' + startB.seed));
console.log('B got relayed snapshot:', !!snapB);
const lobby = B.msgs.filter(m => m.t === 'lobby').pop();
console.log('final lobby seats:', lobby && JSON.stringify(lobby.seats));
A.ws.close(); B.ws.close();
const ok = youA?.role === 'host' && youB?.role === 'guest' && startB && snapB;
console.log(ok ? 'WS LIVE OK' : 'WS LIVE FAIL');
process.exit(ok ? 0 : 1);
