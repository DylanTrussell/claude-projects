// WebSocket room client. Host-authoritative relay protocol (see server.js).
// Offline/solo fallback: if the socket can't connect, the game still runs solo.
export class Net {
  constructor() {
    this.ws = null;
    this.role = 'offline';
    this.pid = sessionStorage.getItem('am_pid') ||
      ('cat-' + Math.random().toString(36).slice(2, 10));
    sessionStorage.setItem('am_pid', this.pid);
    this.room = new URLSearchParams(location.search).get('room') ||
      Math.random().toString(36).slice(2, 8);
    this.handlers = {};
    this.connected = false;
    this.shouldReconnect = true;
    this._backoff = 500;
  }

  on(t, fn) { this.handlers[t] = fn; }
  emit(t, m) { if (this.handlers[t]) this.handlers[t](m); }

  inviteUrl() {
    const u = new URL(location.href);
    u.searchParams.set('room', this.room);
    return u.toString();
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    let path = location.pathname.replace(/\/(index\.html)?$/, '');
    const url = proto + location.host + path + '/ws/' + this.room;
    try { this.ws = new WebSocket(url); } catch (_) { this.emit('offline'); return; }
    const to = setTimeout(() => { if (!this.connected) { try { this.ws.close(); } catch (_) {} } }, 4000);
    this.ws.onopen = () => {
      clearTimeout(to);
      this.connected = true; this._backoff = 500;
      this.send({ t: 'join', pid: this.pid });
      this.emit('open');
    };
    this.ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m && m.t) {
        if (m.t === 'you') this.role = m.role;
        this.emit(m.t, m);
      }
    };
    this.ws.onclose = () => {
      const was = this.connected;
      this.connected = false;
      if (!was && this.role === 'offline') { this.emit('offline'); return; }
      this.emit('closed');
      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), this._backoff);
        this._backoff = Math.min(this._backoff * 2, 5000);
      }
    };
    this.ws.onerror = () => {};
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify(obj)); } catch (_) {}
    }
  }
}
