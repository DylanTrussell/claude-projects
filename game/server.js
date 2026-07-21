// Apocalypse Meow — realtime co-op relay server.
// One GameServer instance per shard; the shard IS the room (<base>/ws/<roomId>).
// Host-authoritative model: seat 0 (host) runs the simulation and streams snapshots;
// guests send inputs; the server referees seating, relays traffic, and retains the
// last snapshot so a refreshed host or guest can resume mid-game.
import { DurableObject } from 'cloudflare:workers';

const MAX_SEATS = 2;
const MAX_MSG = 32 * 1024; // hostile-input bound: drop oversized frames

export class GameServer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sockets = new Map();   // ws -> { pid }
    this.seats = [];            // [{ pid, hero, ready, connected }]
    this.started = false;
    this.seed = 0;
    this.lastSnap = null;       // latest full state snapshot from the host
    this.lastSnapAt = 0;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('apocalypse-meow relay', { status: 200 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    server.addEventListener('message', (ev) => this.onMessage(server, ev));
    server.addEventListener('close', () => this.onClose(server));
    server.addEventListener('error', () => this.onClose(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  seatOf(pid) { return this.seats.findIndex(s => s.pid === pid); }
  hostPid() { return this.seats.length ? this.seats[0].pid : null; }

  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (_) {} }

  broadcast(obj, exceptPid) {
    const raw = JSON.stringify(obj);
    for (const [ws, meta] of this.sockets) {
      if (exceptPid && meta.pid === exceptPid) continue;
      try { ws.send(raw); } catch (_) {}
    }
  }

  sendToPid(pid, obj) {
    const raw = JSON.stringify(obj);
    for (const [ws, meta] of this.sockets) {
      if (meta.pid === pid) { try { ws.send(raw); } catch (_) {} }
    }
  }

  lobbyMsg() {
    return {
      t: 'lobby',
      started: this.started,
      seats: this.seats.map((s, i) => ({
        pid: s.pid, hero: s.hero, ready: s.ready, connected: s.connected, host: i === 0,
      })),
    };
  }

  onMessage(ws, ev) {
    if (typeof ev.data !== 'string' || ev.data.length > MAX_MSG) return;
    let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
    if (!m || typeof m.t !== 'string') return;
    const meta = this.sockets.get(ws);

    if (m.t === 'join') {
      const pid = String(m.pid || '').slice(0, 64);
      if (!pid) return;
      this.sockets.set(ws, { pid });
      let idx = this.seatOf(pid);
      if (idx === -1 && this.seats.length < MAX_SEATS && !this.started) {
        this.seats.push({ pid, hero: this.seats.length === 0 ? 'us' : 'vc', ready: false, connected: true });
        idx = this.seats.length - 1;
      } else if (idx !== -1) {
        this.seats[idx].connected = true;
      }
      const role = idx === -1 ? 'spectator' : (idx === 0 ? 'host' : 'guest');
      this.send(ws, { t: 'you', pid, role, seat: idx });
      this.broadcast(this.lobbyMsg());
      if (this.started) {
        this.send(ws, { t: 'start', seed: this.seed, seats: this.seats.map(s => ({ pid: s.pid, hero: s.hero })) });
        if (role === 'host' && this.lastSnap) this.send(ws, { t: 'resume', snap: this.lastSnap });
        else if (this.lastSnap) this.send(ws, { t: 'snap', snap: this.lastSnap });
      }
      return;
    }

    if (!meta) return; // must join first
    const idx = this.seatOf(meta.pid);
    const isHost = idx === 0;
    const isSeated = idx !== -1;

    switch (m.t) {
      case 'hero':
        if (isSeated && !this.started && (m.hero === 'us' || m.hero === 'vc')) {
          this.seats[idx].hero = m.hero;
          this.broadcast(this.lobbyMsg());
        }
        break;
      case 'ready':
        if (isSeated && !this.started) {
          this.seats[idx].ready = !!m.ready;
          this.broadcast(this.lobbyMsg());
        }
        break;
      case 'start':
        if (isHost && !this.started) {
          const others = this.seats.slice(1).filter(s => s.connected);
          if (others.some(s => !s.ready)) break; // connected guests must be ready
          this.started = true;
          this.seed = (Math.random() * 0xffffffff) >>> 0;
          this.lastSnap = null;
          this.broadcast({ t: 'start', seed: this.seed, seats: this.seats.map(s => ({ pid: s.pid, hero: s.hero })) });
        }
        break;
      case 'input': // guest -> host
        if (isSeated && !isHost && this.started) {
          this.sendToPid(this.hostPid(), { t: 'input', pid: meta.pid, seq: m.seq | 0, c: m.c });
        }
        break;
      case 'snap': // host -> everyone else; retained for resume
        if (isHost && this.started) {
          this.lastSnap = m.snap;
          this.lastSnapAt = Date.now();
          this.broadcast({ t: 'snap', snap: m.snap }, meta.pid);
        }
        break;
      case 'event': // host -> everyone else (one-shot fx/cues)
        if (isHost && this.started) this.broadcast({ t: 'event', e: m.e }, meta.pid);
        break;
      case 'reset':
        if (isHost) {
          this.started = false;
          this.lastSnap = null;
          for (const s of this.seats) s.ready = false;
          this.broadcast({ t: 'reset' });
          this.broadcast(this.lobbyMsg());
        }
        break;
    }
  }

  onClose(ws) {
    const meta = this.sockets.get(ws);
    this.sockets.delete(ws);
    if (!meta) return;
    // Only mark disconnected if no other socket carries the same pid (multi-tab safety).
    for (const other of this.sockets.values()) if (other.pid === meta.pid) return;
    const idx = this.seatOf(meta.pid);
    if (idx !== -1) {
      this.seats[idx].connected = false;
      if (idx === 0 && this.started) this.broadcast({ t: 'hostgone' });
      // An empty un-started lobby seat can be recycled so rooms don't jam.
      if (!this.started && this.seats.every(s => !s.connected)) { this.seats = []; }
      this.broadcast(this.lobbyMsg());
    }
  }
}
