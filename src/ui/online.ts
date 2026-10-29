// Online lobby: create/join a room, pick a fighter, start a rollback match, rematch, handle disconnects.
// Reliable lobby messages (over the relay):
//   {t:'hello', char, ver}  both ways when the peer appears / fighter changes
//   {t:'start', seed, mode, chars, stocks}   host -> guest; both start the match immediately
//   {t:'rematch'}            either side; when both have asked, the host sends a new 'start'
// Fast messages = rollback NetMsg (inputs, checksums) -> Match.receiveNet.
import { FIGHTERS } from '../sim/fighters';
import { Mode, GameState } from '../sim/state';
import { NetLink, randomRoomCode, LinkState } from '../net/link';
import type { NetMsg } from '../net/rollback';
import type { Match, MatchSetup } from '../game';
import type { Sfx } from '../audio/sfx';
import { portrait } from './hud';

const PROTOCOL = 5;

export interface OnlineHost {
  startMatch(setup: MatchSetup, onEnd: (s: GameState) => void): Match;
  stopMatch(): void;
  exit(): void;
}

function h(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

export class OnlineLobby {
  readonly root: HTMLElement;
  private link: NetLink | null = null;
  private myChar = 0;
  private peerChar = -1;
  private mode: Mode = Mode.Versus;
  private match: Match | null = null;
  private wantRematch = false;
  private peerRematch = false;
  private status = '';
  active = false;

  constructor(
    parent: HTMLElement,
    private host: OnlineHost,
    private sfx: Sfx,
  ) {
    this.root = h('<div class="online hidden"></div>');
    parent.append(this.root);
    try {
      this.myChar = Number(localStorage.getItem('fray.online.char') ?? 0) % FIGHTERS.length;
    } catch {
      /* ignore */
    }
  }

  open(joinCode?: string): void {
    this.active = true;
    this.root.classList.remove('hidden');
    if (joinCode) this.connect(joinCode, false);
    else this.home();
  }

  private close(): void {
    this.link?.close();
    this.link = null;
    this.active = false;
    this.root.className = 'online hidden';
    this.root.innerHTML = '';
  }

  private show(node: HTMLElement): void {
    this.root.innerHTML = '';
    this.root.className = 'online';
    this.root.append(node);
  }

  private fighterPicker(): string {
    const d = FIGHTERS[this.myChar];
    return `<div class="fighter-pick on-pick">
      <button class="arrow" data-a="prev">◀</button>
      <div class="fighter-card">${portrait(this.myChar, 84)}<div class="f-name">${d.name}</div><div class="f-title">${d.title}</div></div>
      <button class="arrow" data-a="next">▶</button>
    </div>`;
  }

  private bindPicker(n: HTMLElement, rerender: () => void): void {
    const set = (c: number) => {
      this.myChar = (c + FIGHTERS.length) % FIGHTERS.length;
      try {
        localStorage.setItem('fray.online.char', String(this.myChar));
      } catch {
        /* ignore */
      }
      this.sendHello();
      rerender();
    };
    n.querySelector('[data-a=prev]')?.addEventListener('click', () => set(this.myChar - 1));
    n.querySelector('[data-a=next]')?.addEventListener('click', () => set(this.myChar + 1));
  }

  private home(): void {
    const n = h(`<div class="screen online-home">
      <div class="screen-title">ONLINE <small>1v1 · rollback netcode</small></div>
      ${this.fighterPicker()}
      <div class="online-actions">
        <div class="on-box">
          <h3>Host a match</h3>
          <label class="opt">Rules <select data-a="mode"><option value="1">Versus (best of 3)</option><option value="0">Platform (3 stocks)</option></select></label>
          <button class="primary" data-a="create">Create room</button>
        </div>
        <div class="on-box">
          <h3>Join a friend</h3>
          <input data-a="code" maxlength="8" placeholder="ROOM CODE" autocomplete="off" spellcheck="false" />
          <button data-a="join">Join</button>
        </div>
      </div>
      <div class="hint">Both players use their own laptop (keyboard 1 controls). Share the room code or the invite link.</div>
      <div class="select-footer"><button data-a="back">◀ Back</button></div>
    </div>`);
    this.bindPicker(n, () => this.home());
    const modeSel = n.querySelector<HTMLSelectElement>('[data-a=mode]')!;
    modeSel.value = String(this.mode);
    modeSel.addEventListener('change', () => (this.mode = Number(modeSel.value) as Mode));
    n.querySelector('[data-a=create]')!.addEventListener('click', () => this.connect(randomRoomCode(), true));
    const codeIn = n.querySelector<HTMLInputElement>('[data-a=code]')!;
    const join = () => {
      const c = codeIn.value.trim().toUpperCase();
      if (c.length >= 3) this.connect(c, false);
    };
    n.querySelector('[data-a=join]')!.addEventListener('click', join);
    codeIn.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') join();
    });
    n.querySelector('[data-a=back]')!.addEventListener('click', () => {
      this.close();
      this.host.exit();
    });
    this.show(n);
  }

  private connect(code: string, hosting: boolean): void {
    this.link?.close();
    this.peerChar = -1;
    this.status = 'Connecting…';
    const link = new NetLink(code, {
      onState: (s: LinkState, detail?: string) => {
        if (s === 'waiting') this.status = this.link?.slot === 0 ? 'Waiting for your opponent to join…' : 'Joined. Waiting…';
        if (s === 'connected') this.status = 'Opponent connected!';
        if (s === 'closed' && detail) this.status = detail;
        if (s === 'closed' && this.match) this.opponentGone(detail ?? 'Connection lost');
        else this.room(code, hosting);
      },
      onPeer: () => {
        this.sfx.ui('select');
        this.sendHello();
      },
      onLeft: () => {
        this.peerChar = -1;
        if (this.match) this.opponentGone('Your opponent left the match');
        else {
          this.status = 'Opponent left. Waiting for someone to join…';
          this.room(code, hosting);
        }
      },
      onReliable: (m) => this.onReliable(m as { t: string; [k: string]: unknown }),
      onFast: (m) => this.match?.receiveNet(m as NetMsg),
    });
    this.link = link;
    link.connect();
    this.room(code, hosting);
  }

  private sendHello(): void {
    this.link?.sendReliable({ t: 'hello', char: this.myChar, ver: PROTOCOL });
  }

  private onReliable(m: { t: string; [k: string]: unknown }): void {
    const link = this.link;
    if (!link) return;
    if (m.t === 'hello') {
      if (m.ver !== PROTOCOL) {
        this.status = 'Your opponent is running a different version of FRAY — both refresh the page.';
        this.room(link.room, link.slot === 0);
        return;
      }
      this.peerChar = Number(m.char) % FIGHTERS.length;
      if (!this.match) this.room(link.room, link.slot === 0);
    } else if (m.t === 'start') {
      this.begin(Number(m.seed) >>> 0, Number(m.mode) as Mode, m.chars as number[], Number(m.stocks));
    } else if (m.t === 'rematch') {
      this.peerRematch = true;
      this.maybeRematch();
    }
  }

  private room(code: string, hosting: boolean): void {
    if (this.match) return;
    const link = this.link;
    const isHost = link ? link.slot === 0 : hosting;
    const invite = `${location.origin}${location.pathname}?room=${code}`;
    const ready = this.peerChar >= 0;
    const n = h(`<div class="screen online-room">
      <div class="screen-title">ROOM <span class="room-code">${code}</span></div>
      <div class="invite"><input readonly value="${invite}" /><button data-a="copy">Copy invite link</button></div>
      <div class="on-status">${this.status}</div>
      <div class="on-vs">
        <div class="on-player">${this.fighterPicker()}<div class="on-tag">YOU ${isHost ? '(host)' : ''}</div></div>
        <div class="on-vs-mid">VS</div>
        <div class="on-player">${ready ? `<div class="fighter-card">${portrait(this.peerChar, 84)}<div class="f-name">${FIGHTERS[this.peerChar].name}</div></div>` : '<div class="on-empty">waiting…</div>'}<div class="on-tag">OPPONENT</div></div>
      </div>
      <div class="hint">${isHost ? `Rules: ${this.mode === Mode.Versus ? 'Versus, best of 3' : 'Platform, 3 stocks'}. Press START when you're both ready.` : 'The host starts the match.'}</div>
      <div class="select-footer">
        <button data-a="leave">◀ Leave room</button>
        ${isHost ? `<button class="primary" data-a="start" ${ready ? '' : 'disabled'}>START ▶</button>` : ''}
      </div>
    </div>`);
    this.bindPicker(n, () => this.room(code, hosting));
    n.querySelector('[data-a=copy]')!.addEventListener('click', () => {
      void navigator.clipboard?.writeText(invite);
      (n.querySelector('[data-a=copy]') as HTMLElement).textContent = 'Copied!';
    });
    n.querySelector('[data-a=leave]')!.addEventListener('click', () => {
      this.link?.close();
      this.link = null;
      this.home();
    });
    n.querySelector('[data-a=start]')?.addEventListener('click', () => this.hostStart());
    this.show(n);
  }

  private hostStart(): void {
    const link = this.link;
    if (!link || link.slot !== 0 || this.peerChar < 0) return;
    const seed = (Math.random() * 0x7fffffff) >>> 0;
    const chars = [this.myChar, this.peerChar];
    const stocks = 3;
    link.sendReliable({ t: 'start', seed, mode: this.mode, chars, stocks });
    this.begin(seed, this.mode, chars, stocks);
  }

  private begin(seed: number, mode: Mode, chars: number[], stocks: number): void {
    const link = this.link;
    if (!link) return;
    this.wantRematch = this.peerRematch = false;
    this.root.className = 'online hidden';
    const me = link.slot;
    const setup: MatchSetup = {
      mode,
      training: false,
      stocks,
      players: chars.map((c, i) => ({
        device: i === me ? 'kb0' : 'net',
        cpuLevel: 0,
        char: c,
        label: i === me ? 'YOU' : 'RIVAL',
      })),
      online: { seed, localPort: me, link },
    };
    this.match = this.host.startMatch(setup, (s) => this.matchOver(s));
  }

  private matchOver(s: GameState): void {
    const link = this.link;
    const me = link ? link.slot : 0;
    const won = s.winner === me;
    this.host.stopMatch();
    this.match = null;
    const n = h(`<div class="screen online-result">
      <div class="screen-title">${s.winner < 0 ? 'DRAW' : won ? 'YOU WIN' : 'YOU LOSE'}</div>
      <div class="on-status" data-k="st">${link && link.state === 'connected' ? 'Rematch?' : 'Opponent disconnected'}</div>
      <div class="menu-list">
        <button class="primary" data-a="rematch">Rematch</button>
        <button data-a="room">Back to room</button>
        <button data-a="leave">Leave</button>
      </div>
    </div>`);
    n.querySelector('[data-a=rematch]')!.addEventListener('click', () => {
      this.wantRematch = true;
      this.link?.sendReliable({ t: 'rematch' });
      (n.querySelector('[data-k=st]') as HTMLElement).textContent = 'Waiting for your opponent…';
      this.maybeRematch();
    });
    n.querySelector('[data-a=room]')!.addEventListener('click', () => this.link && this.room(this.link.room, this.link.slot === 0));
    n.querySelector('[data-a=leave]')!.addEventListener('click', () => {
      this.link?.close();
      this.link = null;
      this.home();
    });
    this.show(n);
  }

  private maybeRematch(): void {
    if (!this.wantRematch || !this.peerRematch || this.match) return;
    if (this.link?.slot === 0) this.hostStart();
  }

  private opponentGone(reason: string): void {
    this.host.stopMatch();
    this.match = null;
    this.status = reason;
    const n = h(`<div class="screen online-result">
      <div class="screen-title">DISCONNECTED</div>
      <div class="on-status">${reason}</div>
      <div class="menu-list"><button class="primary" data-a="home">Back to online menu</button></div>
    </div>`);
    n.querySelector('[data-a=home]')!.addEventListener('click', () => {
      this.link?.close();
      this.link = null;
      this.home();
    });
    this.show(n);
  }

  /** Quit from the pause menu during an online match. */
  quitMatch(): void {
    this.host.stopMatch();
    this.match = null;
    this.link?.close();
    this.link = null;
    this.home();
  }
}
