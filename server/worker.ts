// Cloudflare Worker entry: serves the static game (ASSETS) and the online signalling/relay at /ws?room=CODE
// via one Durable Object per room. Same protocol as server/rooms.mjs. Deployed by `npx wrangler deploy`.
// (Not type-checked by the app's tsconfig; wrangler bundles it with esbuild.)

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const WebSocketPair: any;

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  ROOMS: any;
}

function sanitizeRoom(raw: string | null): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/ws')) {
      const room = sanitizeRoom(url.searchParams.get('room'));
      if (!room || req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket + room', { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
      return stub.fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};

export class Room {
  private sockets: any[] = [null, null];

  constructor(_state: unknown, _env: unknown) {}

  async fetch(_req: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    const slot = this.sockets[0] ? (this.sockets[1] ? -1 : 1) : 0;
    if (slot < 0) {
      server.send(JSON.stringify({ t: 'full' }));
      server.close(1000, 'full');
      return new Response(null, { status: 101, webSocket: client } as any);
    }
    this.sockets[slot] = server;
    server.send(JSON.stringify({ t: 'joined', slot }));
    if (this.sockets[0] && this.sockets[1]) for (const s of this.sockets) s.send(JSON.stringify({ t: 'peer' }));
    server.addEventListener('message', (e: any) => {
      const other = this.sockets[1 - slot];
      if (other && typeof e.data === 'string' && e.data.length < 65536) {
        try {
          other.send(e.data);
        } catch {
          /* peer gone */
        }
      }
    });
    const gone = () => {
      if (this.sockets[slot] !== server) return;
      this.sockets[slot] = null;
      const other = this.sockets[1 - slot];
      if (other) {
        try {
          other.send(JSON.stringify({ t: 'left' }));
        } catch {
          /* ignore */
        }
      }
    };
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client } as any);
  }
}
