// Browser network link for online play.
// - Signalling + reliable messages go through the room relay WebSocket (/ws?room=CODE).
// - Fast game traffic (inputs) prefers a WebRTC data channel (unordered, no retransmits — rollback re-sends inputs);
//   if the peer-to-peer connection can't be made, it falls back to the relay WebSocket automatically.
export type LinkState = 'connecting' | 'waiting' | 'connected' | 'closed';

interface Wire {
  t: string;
  slot?: number;
  d?: unknown;
}

export interface LinkEvents {
  onState?: (s: LinkState, detail?: string) => void;
  onPeer?: () => void;
  onLeft?: () => void;
  onReliable?: (msg: unknown) => void;
  onFast?: (msg: unknown) => void;
}

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

export function signalUrl(room: string): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  const base = env?.VITE_SIGNAL_URL;
  if (base) return `${base.replace(/\/$/, '')}/ws?room=${encodeURIComponent(room)}`;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws?room=${encodeURIComponent(room)}`;
}

export function randomRoomCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export class NetLink {
  slot = -1;
  state: LinkState = 'connecting';
  rtt = 0; // ms, smoothed
  p2p = false;
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private pingTimer = 0;
  private pendingIce: RTCIceCandidateInit[] = [];

  constructor(
    readonly room: string,
    private ev: LinkEvents = {},
    private allowP2P = true,
  ) {}

  private setState(s: LinkState, detail?: string): void {
    this.state = s;
    this.ev.onState?.(s, detail);
  }

  connect(): void {
    const ws = new WebSocket(signalUrl(this.room));
    this.ws = ws;
    ws.onmessage = (e) => this.onWs(e.data as string);
    ws.onclose = () => {
      if (this.state !== 'closed') this.setState('closed', 'Connection to the server was lost');
      this.cleanup();
    };
    ws.onerror = () => this.setState('closed', 'Could not reach the online server');
  }

  private wsSend(o: Wire): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o));
  }

  /** Reliable, ordered (lobby/control messages). */
  sendReliable(msg: unknown): void {
    this.wsSend({ t: 'app', d: msg });
  }

  /** Fast, unreliable (game inputs). */
  sendFast(msg: unknown): void {
    if (this.dc && this.dc.readyState === 'open') this.dc.send(JSON.stringify(msg));
    else this.wsSend({ t: 'fast', d: msg });
  }

  private onWs(raw: string): void {
    let m: Wire;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    switch (m.t) {
      case 'joined':
        this.slot = m.slot ?? -1;
        this.setState('waiting');
        break;
      case 'full':
        this.setState('closed', 'That room is full');
        break;
      case 'peer':
        this.setState('connected');
        this.ev.onPeer?.();
        this.startPing();
        if (this.allowP2P && typeof RTCPeerConnection !== 'undefined') void this.startRtc();
        break;
      case 'left':
        this.ev.onLeft?.();
        break;
      case 'app':
        this.handleApp(m.d, true);
        break;
      case 'fast':
        this.handleApp(m.d, false);
        break;
      case 'sig':
        void this.onSignal(m.d as { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit });
        break;
    }
  }

  private handleApp(d: unknown, reliable: boolean): void {
    const o = d as { t?: string; ts?: number };
    if (o && o.t === '_png') {
      this.sendFast({ t: '_pog', ts: o.ts });
      return;
    }
    if (o && o.t === '_pog' && typeof o.ts === 'number') {
      const sample = performance.now() - o.ts;
      this.rtt = this.rtt ? this.rtt * 0.8 + sample * 0.2 : sample;
      return;
    }
    if (reliable) this.ev.onReliable?.(d);
    else this.ev.onFast?.(d);
  }

  private startPing(): void {
    clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => this.sendFast({ t: '_png', ts: performance.now() }), 1000);
  }

  // ---- WebRTC (best effort) ----------------------------------------------

  private async startRtc(): Promise<void> {
    try {
      const pc = new RTCPeerConnection({ iceServers: ICE });
      this.pc = pc;
      pc.onicecandidate = (e) => {
        if (e.candidate) this.wsSend({ t: 'sig', d: { ice: e.candidate.toJSON() } });
      };
      pc.ondatachannel = (e) => this.bindDc(e.channel);
      if (this.slot === 0) {
        this.bindDc(pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 }));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.wsSend({ t: 'sig', d: { sdp: pc.localDescription } });
      }
    } catch {
      this.pc = null; // stay on the relay
    }
  }

  private bindDc(dc: RTCDataChannel): void {
    this.dc = dc;
    dc.onopen = () => {
      this.p2p = true;
    };
    dc.onclose = () => {
      this.p2p = false;
    };
    dc.onmessage = (e) => {
      try {
        this.handleApp(JSON.parse(e.data as string), false);
      } catch {
        /* ignore */
      }
    };
  }

  private async onSignal(d: { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit }): Promise<void> {
    if (!this.allowP2P || typeof RTCPeerConnection === 'undefined') return;
    try {
      if (!this.pc) await this.startRtc();
      const pc = this.pc;
      if (!pc) return;
      if (d.sdp) {
        await pc.setRemoteDescription(d.sdp);
        for (const c of this.pendingIce) await pc.addIceCandidate(c);
        this.pendingIce = [];
        if (d.sdp.type === 'offer') {
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          this.wsSend({ t: 'sig', d: { sdp: pc.localDescription } });
        }
      } else if (d.ice) {
        if (pc.remoteDescription) await pc.addIceCandidate(d.ice);
        else this.pendingIce.push(d.ice);
      }
    } catch {
      /* P2P failed — relay keeps working */
    }
  }

  close(): void {
    this.setState('closed');
    this.cleanup();
  }

  private cleanup(): void {
    clearInterval(this.pingTimer);
    try {
      this.dc?.close();
      this.pc?.close();
    } catch {
      /* ignore */
    }
    this.dc = null;
    this.pc = null;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close();
    this.ws = null;
  }
}
