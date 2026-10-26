// FRAY signalling + relay server (Node). Run: `npm run server` (port 8787, or $PORT).
// Clients connect to ws://host:PORT/ws?room=CODE. Deploy anywhere that runs Node (Render web service, Fly, a VPS).
// On Cloudflare the same protocol is served by server/worker.ts (Durable Object) — no Node needed there.
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { Room, sanitizeRoom } from './rooms.mjs';

const PORT = Number(process.env.PORT || 8787);
const rooms = new Map();

const http = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end(`FRAY relay ok · ${rooms.size} rooms\n`);
});
const wss = new WebSocketServer({ noServer: true });

http.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  const room = sanitizeRoom(url.searchParams.get('room'));
  if (!url.pathname.startsWith('/ws') || !room) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    let r = rooms.get(room);
    if (!r) rooms.set(room, (r = new Room()));
    const slot = r.join(ws);
    if (slot < 0) return;
    ws.on('message', (data, isBinary) => {
      if (!isBinary) r.onMessage(slot, data.toString());
    });
    ws.on('close', () => {
      r.onClose(slot, ws);
      if (r.empty) rooms.delete(room);
    });
    ws.on('error', () => ws.close());
  });
});

http.listen(PORT, () => console.log(`FRAY relay listening on :${PORT}`));
