// Shared room logic for the FRAY signalling/relay server (used by the Node server; mirrored in worker.ts).
// Protocol (JSON text frames):
//   server -> client: {t:'joined', slot} · {t:'peer'} (both present) · {t:'left'} (peer gone) · {t:'full'}
//   client -> client (relayed verbatim to the other slot): anything else, e.g. {t:'sig', d} / {t:'app', d}
export function sanitizeRoom(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export class Room {
  constructor() {
    this.sockets = [null, null];
  }
  /** `ws` must have send(string), close(), and the caller wires message/close to onMessage/onClose. */
  join(ws) {
    const slot = this.sockets[0] ? (this.sockets[1] ? -1 : 1) : 0;
    if (slot < 0) {
      ws.send(JSON.stringify({ t: 'full' }));
      ws.close();
      return -1;
    }
    this.sockets[slot] = ws;
    ws.send(JSON.stringify({ t: 'joined', slot }));
    if (this.sockets[0] && this.sockets[1]) for (const s of this.sockets) s.send(JSON.stringify({ t: 'peer' }));
    return slot;
  }
  onMessage(slot, data) {
    const other = this.sockets[1 - slot];
    if (other && typeof data === 'string' && data.length < 65536) other.send(data);
  }
  onClose(slot, ws) {
    if (this.sockets[slot] !== ws) return;
    this.sockets[slot] = null;
    const other = this.sockets[1 - slot];
    if (other) other.send(JSON.stringify({ t: 'left' }));
  }
  get empty() {
    return !this.sockets[0] && !this.sockets[1];
  }
}
