// DOM HUD overlay. Reads state only.
import { FIGHTERS } from '../sim/fighters';
import { EvType, GameState, Mode, Phase, SimEvent, Act, ACT_NAMES } from '../sim/state';
import { KI_MAX } from '../sim/sim';
import { MOVE_NAMES, FighterLook } from '../sim/defs';

const PORT_COLORS = ['#ff4b4b', '#4b9bff', '#ffd23f', '#4bdc7a'];

function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

export function portrait(char: number, size = 56, look?: Partial<FighterLook>, name?: string): string {
  const d = FIGHTERS[char];
  const lk = { ...d.look, ...(look ?? {}) };
  return `<div class="portrait" style="width:${size}px;height:${size}px;background:radial-gradient(circle at 35% 30%, ${hex(lk.skin)} 0 28%, ${hex(lk.body)} 29% 62%, ${hex(lk.trim)} 63%);border-color:${hex(lk.accent)}"><span>${(name ?? d.name)[0]}</span></div>`;
}

function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

export class Hud {
  readonly root: HTMLElement;
  private nodes: Record<string, HTMLElement> = {};
  private banner: HTMLElement;
  private bannerTimer = 0;
  private training: HTMLElement;
  private calls: HTMLElement;
  private netEl: HTMLElement;
  private dispHealth: number[] = [];
  private names: string[] = [];

  constructor(parent: HTMLElement) {
    this.root = el('<div class="hud"></div>');
    this.banner = el('<div class="banner"></div>');
    this.training = el('<div class="training-panel hidden"></div>');
    this.calls = el('<div class="callouts"><div class="co-side left"></div><div class="co-side right"></div></div>');
    this.netEl = el('<div class="net-status hidden"></div>');
    parent.append(this.root, this.calls, this.banner, this.training, this.netEl);
  }

  setup(s: GameState, playerLabels: string[], nameOverrides: (string | undefined)[] = [], looks: (Partial<FighterLook> | undefined)[] = []): void {
    const fname = (i: number) => nameOverrides[i] ?? FIGHTERS[s.fighters[i].char].name;
    this.names = playerLabels;
    this.root.innerHTML = '';
    this.nodes = {};
    this.dispHealth = s.fighters.map((f) => f.maxHealth);
    this.root.className = 'hud ' + (s.mode === Mode.Versus ? 'hud-versus' : 'hud-platform');
    if (s.mode === Mode.Versus) {
      const [a, b] = s.fighters;
      const side = (i: number, f = i === 0 ? a : b) => `
        <div class="vs-side vs-side-${i}">
          ${portrait(f.char, 64, looks[i], nameOverrides[i])}
          <div class="vs-barwrap">
            <div class="vs-name">${fname(i)} <small>${playerLabels[i] ?? ''}</small></div>
            <div class="vs-bar"><div class="vs-lag" data-k="lag${i}"></div><div class="vs-fill" data-k="hp${i}"></div></div>
            <div class="vs-pips" data-k="pips${i}">${'<i></i>'.repeat(s.roundsToWin)}</div>
          </div>
        </div>`;
      this.root.append(
        el(`<div class="vs-top">${side(0)}<div class="vs-timer" data-k="timer">99</div>${side(1)}</div>`),
        el(`<div class="vs-bottom">
          <div class="ki ki-0"><div class="ki-bars" data-k="ki0"><i></i><i></i><i></i></div><b data-k="kin0">0</b></div>
          <div class="ki ki-1"><b data-k="kin1">0</b><div class="ki-bars" data-k="ki1"><i></i><i></i><i></i></div></div>
        </div>`),
        el(`<div class="combo combo-0" data-k="combo0"></div>`),
        el(`<div class="combo combo-1" data-k="combo1"></div>`),
      );
    } else {
      const row = el('<div class="pf-row"></div>');
      s.fighters.forEach((f, i) => {
        row.append(
          el(`<div class="pf-card" style="--pc:${PORT_COLORS[i]}">
            ${portrait(f.char, 52, looks[i], nameOverrides[i])}
            <div class="pf-info">
              <div class="pf-name">${playerLabels[i] ?? 'P' + (i + 1)} · ${fname(i)}</div>
              <div class="pf-dmg" data-k="dmg${i}">0<small>%</small></div>
              <div class="pf-stocks" data-k="stk${i}"></div>
              <div class="ki-bars small" data-k="ki${i}"><i></i><i></i><i></i></div>
            </div>
          </div>`),
        );
      });
      this.root.append(row);
    }
    this.root.querySelectorAll<HTMLElement>('[data-k]').forEach((n) => (this.nodes[n.dataset.k!] = n));
  }

  showBanner(text: string, cls = '', frames = 90): void {
    this.banner.innerHTML = `<span>${text}</span>`;
    this.banner.className = 'banner show ' + cls;
    this.bannerTimer = frames;
  }

  /** Fighting-game style callout text that pops on the player's side of the screen. */
  callout(port: number, text: string, cls = ''): void {
    const side = this.calls.children[port % 2] as HTMLElement;
    const c = el(`<div class="callout ${cls}">${text}</div>`);
    side.prepend(c);
    while (side.children.length > 3) side.lastElementChild!.remove();
    window.setTimeout(() => c.remove(), 1400);
  }

  onEvents(s: GameState, events: SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case EvType.Parry:
          this.callout(e.a, 'PARRY!', 'c-parry');
          break;
        case EvType.CounterHit:
          this.callout(e.a, 'COUNTER HIT', 'c-counter');
          break;
        case EvType.Punish:
          this.callout(e.a, 'PUNISH!', 'c-punish');
          break;
        case EvType.Tech:
          this.callout(e.a, 'TECH', 'c-tech');
          break;
        case EvType.FirstHit:
          this.callout(e.a, 'FIRST ATTACK', 'c-first');
          break;
        case EvType.Cancel:
          this.callout(e.a, 'CANCEL', 'c-cancel');
          break;
        case EvType.WrongGuard:
          this.callout(e.a, s.fighters[e.b]?.guardLow ? 'OVERHEAD!' : 'LOW!', 'c-counter');
          break;
        case EvType.ThrowTech:
          this.callout(e.a, 'THROW ESCAPE', 'c-tech');
          break;
        case EvType.WallBounce:
          this.callout(1 - (e.a % 2), 'WALL BOUNCE', 'c-punish');
          break;
        case EvType.Burst:
          this.callout(e.a, 'BURST!', 'c-parry');
          break;
        case EvType.Launch:
          this.callout(e.a, 'LAUNCH!', 'c-first');
          break;
        case EvType.RoundStart:
          this.showBanner(
            s.mode === Mode.Versus
              ? s.roundsToWin > 1 && s.roundWins.every((w) => w === s.roundsToWin - 1)
                ? 'FINAL ROUND'
                : s.roundsToWin === 1
                  ? 'ONE ROUND'
                  : `ROUND ${e.a}`
              : 'READY',
            'b-round',
            110,
          );
          break;
        case EvType.Fight:
          this.showBanner(s.mode === Mode.Versus ? 'FIGHT!' : 'GO!', 'b-fight', 50);
          break;
        case EvType.RoundKO:
          this.showBanner('K.O.', 'b-ko', 140);
          break;
        case EvType.TimeUp:
          this.showBanner('TIME', 'b-ko', 140);
          break;
        case EvType.MatchEnd: {
          const w = e.a;
          const name = w >= 0 ? (this.names[w] === 'YOU' ? 'YOU WIN' : `${this.names[w] ?? 'P' + (w + 1)} WINS`) : 'DRAW';
          this.showBanner(s.mode === Mode.Versus ? name : `GAME!<br><small>${name}</small>`, 'b-game', 100000);
          break;
        }
        case EvType.SuperStart: {
          const f = s.fighters[e.a];
          this.showBanner(`<small>${FIGHTERS[f.char].name}</small><br>${FIGHTERS[f.char].superName}`, 'b-super', 55);
          break;
        }
        case EvType.Clash:
          this.showBanner('BEAM CLASH!<br><small>MASH ATTACK / SPECIAL</small>', 'b-clash', 60);
          break;
      }
    }
  }

  update(s: GameState, dtFrames: number): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dtFrames;
      if (this.bannerTimer <= 0) this.banner.className = 'banner';
    }
    const n = this.nodes;
    if (s.mode === Mode.Versus) {
      const secs = Math.ceil(s.timer / 60);
      n.timer.textContent = s.roundFrames === 0 ? '∞' : String(Math.min(99, secs));
      n.timer.classList.toggle('low', s.roundFrames > 0 && secs <= 10 && s.phase === Phase.Fight);
      s.fighters.forEach((f, i) => {
        const pct = (f.health / f.maxHealth) * 100;
        n['hp' + i].style.width = pct + '%';
        n['hp' + i].classList.toggle('danger', pct < 25);
        this.dispHealth[i] = Math.max(f.health, this.dispHealth[i] - 6 * dtFrames);
        if (f.combo === 0) this.dispHealth[i] = Math.max(f.health, this.dispHealth[i] - 12 * dtFrames);
        n['lag' + i].style.width = (this.dispHealth[i] / f.maxHealth) * 100 + '%';
        const pips = n['pips' + i].children;
        for (let k = 0; k < pips.length; k++) pips[k].classList.toggle('on', s.roundWins[i] > k);
        this.updateKi(f.ki, n['ki' + i], n['kin' + i]);
        const combo = n['combo' + (1 - i)];
        if (f.combo >= 2 && f.act === Act.Hitstun) {
          combo.innerHTML = `<b>${f.combo}</b> HITS`;
          combo.classList.add('show');
        } else combo.classList.remove('show');
      });
    } else {
      s.fighters.forEach((f, i) => {
        const dmg = n['dmg' + i];
        const p = Math.floor(f.damage / 10);
        const out = f.stocks <= 0 && !s.training;
        dmg.innerHTML = out ? 'OUT' : `${p}<small>.${f.damage % 10}%</small>`;
        const heat = Math.min(1, p / 150);
        dmg.style.color = `rgb(255, ${Math.round(255 - heat * 200)}, ${Math.round(255 - heat * 230)})`;
        if (f.hitlag > 0 && f.act === Act.Hitstun) dmg.classList.add('shake');
        else dmg.classList.remove('shake');
        n['stk' + i].innerHTML = s.training ? '∞' : '<i></i>'.repeat(Math.max(0, f.stocks));
        this.updateKi(f.ki, n['ki' + i]);
      });
    }
  }

  private updateKi(ki: number, bars: HTMLElement, num?: HTMLElement): void {
    const kids = bars.children;
    for (let k = 0; k < kids.length; k++) {
      const fill = Math.max(0, Math.min(1, (ki - k * 100) / 100));
      (kids[k] as HTMLElement).style.setProperty('--fill', String(fill));
      kids[k].classList.toggle('full', fill >= 1);
    }
    bars.classList.toggle('max', ki >= KI_MAX);
    if (num) num.textContent = String(Math.floor(ki / 100));
  }

  setTraining(on: boolean, s: GameState | null, info: { stepping: boolean; boxes: boolean }): void {
    this.training.classList.toggle('hidden', !on);
    if (!on || !s) return;
    const lines = s.fighters.map((f, i) => {
      const move = f.act === Act.Attack && f.move >= 0 ? `${MOVE_NAMES[f.move]} f${f.actFrame}` : ACT_NAMES[f.act];
      return `<div><b style="color:${PORT_COLORS[i]}">P${i + 1}</b> ${move}${f.hitstun > 0 && f.act === Act.Hitstun ? ` · stun ${f.hitstun}` : ''}${f.hitlag ? ` · lag ${f.hitlag}` : ''} · combo ${f.combo} (${f.comboDamage}%)</div>`;
    });
    this.training.innerHTML = `
      <div class="tp-title">TRAINING · frame ${s.frame}</div>
      ${lines.join('')}
      <div class="tp-keys">F1 boxes: <b>${info.boxes ? 'ON' : 'off'}</b> · F2 step${info.stepping ? ' (<b>PAUSED</b>)' : ''} · F3 resume · F4 reset %</div>`;
  }

  setNet(text: string | null): void {
    this.netEl.classList.toggle('hidden', !text);
    if (text && this.netEl.textContent !== text) this.netEl.textContent = text;
  }

  clear(): void {
    this.netEl.classList.add('hidden');
    this.root.innerHTML = '';
    for (const c of Array.from(this.calls.children)) c.innerHTML = '';
    this.banner.className = 'banner';
    this.training.classList.add('hidden');
  }
}
