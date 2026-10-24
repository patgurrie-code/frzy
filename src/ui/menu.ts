// Menus: title, mode select, character/player select, settings (remap + key test), pause, results.
import { FIGHTERS } from '../sim/fighters';
import { Mode, GameState } from '../sim/state';
import { ACTIONS, ACTION_BITS, InputManager, keyLabel, saveKeySets, resetKeySets } from '../input/input';
import { INPUT_NAMES } from '../sim/input';
import type { MatchSetup, PlayerSetup } from '../game';
import type { Sfx } from '../audio/sfx';
import { portrait } from './hud';

export interface MenuCallbacks {
  start(setup: MatchSetup): void;
  resume(): void;
  quit(): void;
  rematch(): void;
}

const SETUP_KEY = 'fray.setup.v1';

function h(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

export class Menu {
  readonly root: HTMLElement;
  private lastSetup: MatchSetup | null = null;
  private keyTestCleanup: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    private input: InputManager,
    private sfx: Sfx,
    private cb: MenuCallbacks,
  ) {
    this.root = h('<div class="menu"></div>');
    parent.append(this.root);
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.sfx.ui('select');
    });
  }

  private show(node: HTMLElement): void {
    this.keyTestCleanup?.();
    this.keyTestCleanup = null;
    this.input.onKey = null;
    this.root.innerHTML = '';
    this.root.append(node);
    this.root.classList.remove('hidden', 'overlay');
    const first = node.querySelector<HTMLElement>('button.primary, button');
    first?.focus();
  }

  hide(): void {
    this.keyTestCleanup?.();
    this.keyTestCleanup = null;
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
  }

  title(): void {
    const n = h(`<div class="screen title-screen">
      <div class="logo">FRAY</div>
      <div class="tagline">platform brawls · ki duels</div>
      <button class="primary" data-a="go">PRESS START</button>
      <div class="hint">Click or press Enter</div>
    </div>`);
    n.querySelector('[data-a=go]')!.addEventListener('click', () => {
      this.sfx.unlock();
      this.main();
    });
    this.show(n);
  }

  main(): void {
    const n = h(`<div class="screen main-menu">
      <div class="logo small">FRAY</div>
      <div class="menu-list">
        <button class="primary big" data-m="platform"><b>PLATFORM</b><small>1–4 players · stocks · knock them off the stage</small></button>
        <button class="big" data-m="versus"><b>VERSUS</b><small>1v1 · health bars · best of 3 · 99 s</small></button>
        <button class="big" data-m="training"><b>TRAINING</b><small>hitboxes (F1) · frame step (F2)</small></button>
        <button class="big" data-m="settings"><b>SETTINGS</b><small>controls · key test · audio</small></button>
      </div>
    </div>`);
    n.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) =>
      b.addEventListener('click', () => {
        const m = b.dataset.m!;
        if (m === 'settings') this.settings();
        else this.select(m === 'versus' ? Mode.Versus : Mode.Platform, m === 'training');
      }),
    );
    this.show(n);
  }

  private loadSaved(): Partial<MatchSetup> | null {
    try {
      return JSON.parse(localStorage.getItem(SETUP_KEY) ?? 'null');
    } catch {
      return null;
    }
  }

  select(mode: Mode, training: boolean): void {
    const slots = mode === Mode.Versus || training ? 2 : 4;
    const saved = this.loadSaved();
    const players: (PlayerSetup & { on: boolean })[] = [];
    for (let i = 0; i < 4; i++) {
      const sp = saved?.players?.[i];
      players.push({
        device: sp?.device ?? (i === 0 ? 'kb0' : i === 1 ? (training ? 'cpu' : 'kb1') : 'cpu'),
        cpuLevel: training && i === 1 ? 0 : sp?.cpuLevel ?? 3,
        char: sp?.char ?? i % FIGHTERS.length,
        label: `P${i + 1}`,
        on: i < 2 || (sp ? (saved?.players?.length ?? 0) > i : false),
      });
    }
    if (training) {
      players[1].device = 'cpu';
      players[1].cpuLevel = 0;
    }
    let stocks = saved?.stocks ?? 3;
    const title = training ? 'TRAINING' : mode === Mode.Versus ? 'VERSUS' : 'PLATFORM';
    const n = h(`<div class="screen select-screen">
      <div class="screen-title">${title} <small>choose fighters & controls</small></div>
      <div class="slots"></div>
      <div class="select-footer">
        <button data-a="back">◀ Back</button>
        ${mode === Mode.Platform && !training ? '<label class="opt">Stocks <select data-a="stocks"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label>' : ''}
        <button class="primary" data-a="start">FIGHT ▶</button>
      </div>
    </div>`);
    const slotsEl = n.querySelector('.slots')!;
    const pads = this.input.connectedPads();
    const deviceOpts = (i: number) => {
      const opts: [string, string][] = [
        ['kb0', 'Keyboard (WASD)'],
        ['kb1', 'Keyboard (Arrows)'],
      ];
      for (let p = 0; p < 4; p++) opts.push([`pad${p}`, `Gamepad ${p + 1}${pads.includes(p) ? '' : ' (not connected)'}`]);
      opts.push(['cpu', 'CPU']);
      void i;
      return opts;
    };
    const render = () => {
      slotsEl.innerHTML = '';
      for (let i = 0; i < slots; i++) {
        const p = players[i];
        const d = FIGHTERS[p.char];
        const lvlOpts = Array.from({ length: training ? 10 : 9 }, (_, k) => (training ? k : k + 1))
          .map((k) => `<option value="${k}" ${k === p.cpuLevel ? 'selected' : ''}>${k === 0 ? 'Dummy (idle)' : 'Level ' + k}</option>`)
          .join('');
        const slot = h(`<div class="slot ${p.on ? '' : 'off'}" style="--pc:${['#ff4b4b', '#4b9bff', '#ffd23f', '#4bdc7a'][i]}">
          <div class="slot-head">P${i + 1}${i >= 2 ? ` <button class="tiny" data-a="toggle">${p.on ? 'Remove' : 'Add'}</button>` : ''}</div>
          ${
            p.on
              ? `<div class="fighter-pick">
              <button class="arrow" data-a="prev">◀</button>
              <div class="fighter-card">${portrait(p.char, 84)}<div class="f-name">${d.name}</div><div class="f-title">${d.title}</div><div class="f-desc">${d.description}</div></div>
              <button class="arrow" data-a="next">▶</button>
            </div>
            <label class="opt">Control <select data-a="device">${deviceOpts(i)
              .map(([v, l]) => `<option value="${v}" ${v === p.device ? 'selected' : ''}>${l}</option>`)
              .join('')}</select></label>
            ${p.device === 'cpu' ? `<label class="opt">CPU <select data-a="level">${lvlOpts}</select></label>` : ''}`
              : '<div class="slot-empty">Empty</div>'
          }
        </div>`);
        slot.querySelector('[data-a=prev]')?.addEventListener('click', () => {
          p.char = (p.char + FIGHTERS.length - 1) % FIGHTERS.length;
          render();
        });
        slot.querySelector('[data-a=next]')?.addEventListener('click', () => {
          p.char = (p.char + 1) % FIGHTERS.length;
          render();
        });
        slot.querySelector('[data-a=toggle]')?.addEventListener('click', () => {
          p.on = !p.on;
          render();
        });
        slot.querySelector<HTMLSelectElement>('[data-a=device]')?.addEventListener('change', (e) => {
          p.device = (e.target as HTMLSelectElement).value;
          render();
        });
        slot.querySelector<HTMLSelectElement>('[data-a=level]')?.addEventListener('change', (e) => {
          p.cpuLevel = Number((e.target as HTMLSelectElement).value);
        });
        slotsEl.append(slot);
      }
    };
    render();
    const stockSel = n.querySelector<HTMLSelectElement>('[data-a=stocks]');
    if (stockSel) {
      stockSel.value = String(stocks);
      stockSel.addEventListener('change', () => (stocks = Number(stockSel.value)));
    }
    n.querySelector('[data-a=back]')!.addEventListener('click', () => this.main());
    n.querySelector('[data-a=start]')!.addEventListener('click', () => {
      const active = players.slice(0, slots).filter((p) => p.on);
      const setup: MatchSetup = {
        mode,
        training,
        stocks,
        players: active.map((p, i) => ({
          device: p.device,
          cpuLevel: p.cpuLevel,
          char: p.char,
          label: p.device === 'cpu' ? (p.cpuLevel === 0 ? 'DUMMY' : `CPU ${p.cpuLevel}`) : `P${i + 1}`,
        })),
      };
      try {
        if (!training) localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
      } catch {
        /* ignore */
      }
      this.lastSetup = setup;
      this.sfx.unlock();
      this.hide();
      this.cb.start(setup);
    });
    this.show(n);
  }

  settings(tab: 'controls' | 'keytest' | 'audio' = 'controls'): void {
    const n = h(`<div class="screen settings-screen">
      <div class="screen-title">SETTINGS</div>
      <div class="tabs">
        <button data-t="controls" class="${tab === 'controls' ? 'on' : ''}">Controls</button>
        <button data-t="keytest" class="${tab === 'keytest' ? 'on' : ''}">Key test</button>
        <button data-t="audio" class="${tab === 'audio' ? 'on' : ''}">Audio</button>
      </div>
      <div class="tab-body"></div>
      <div class="select-footer"><button data-a="back">◀ Back</button></div>
    </div>`);
    n.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => b.addEventListener('click', () => this.settings(b.dataset.t as typeof tab)));
    n.querySelector('[data-a=back]')!.addEventListener('click', () => this.main());
    const body = n.querySelector('.tab-body') as HTMLElement;
    this.show(n);
    if (tab === 'controls') this.controlsTab(body);
    else if (tab === 'keytest') this.keyTestTab(body);
    else this.audioTab(body);
  }

  private controlsTab(body: HTMLElement): void {
    const sets = this.input.keySets;
    const render = () => {
      body.innerHTML = `
        <p class="hint">Click a binding, then press a key to replace it. Shift+click adds an extra key. Right-click clears.
        Tap-jump: Up is also bound to Jump by default — remove it from Jump to turn tap-jump off.</p>
        <div class="bind-grid">
          ${[0, 1]
            .map(
              (si) => `<div class="bind-col"><h3>Keyboard ${si === 0 ? '1 (WASD)' : '2 (Arrows)'}</h3>
              ${ACTIONS.map(
                (a) => `<div class="bind-row"><span>${a}</span><button class="bind" data-s="${si}" data-a="${a}">${sets[si][a].map(keyLabel).join(' / ') || '—'}</button></div>`,
              ).join('')}</div>`,
            )
            .join('')}
        </div>
        <div class="hint">Gamepad (standard mapping): stick/d-pad move · A attack · B special · X/Y jump · LB/LT guard · RB/RT grab · right stick = smash attack.</div>
        <button data-a="reset">Reset to defaults</button>`;
      body.querySelectorAll<HTMLButtonElement>('.bind').forEach((b) => {
        const si = Number(b.dataset.s);
        const a = b.dataset.a as (typeof ACTIONS)[number];
        b.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          sets[si][a] = [];
          saveKeySets(sets);
          render();
        });
        b.addEventListener('click', (e) => {
          const add = e.shiftKey;
          b.textContent = 'press a key…';
          b.classList.add('listening');
          this.input.onKey = (code, down) => {
            if (!down) return;
            this.input.onKey = null;
            if (code !== 'Escape') {
              sets[si][a] = add ? Array.from(new Set([...sets[si][a], code])) : [code];
              saveKeySets(sets);
            }
            render();
          };
        });
      });
      body.querySelector('[data-a=reset]')!.addEventListener('click', () => {
        this.input.keySets = resetKeySets();
        this.controlsTab(body);
      });
    };
    render();
  }

  private keyTestTab(body: HTMLElement): void {
    body.innerHTML = `
      <p class="hint">Hold keys to see what registers. Many laptop keyboards can't report certain 3+ key combinations ("ghosting").
      If a combo you need drops out, remap to keys that work together.</p>
      <div class="keytest">
        <div class="kt-held">Keys held: <b data-k="keys">—</b></div>
        <div class="kt-max">Most keys seen at once: <b data-k="max">0</b></div>
        <div class="kt-sets"></div>
      </div>`;
    const keysEl = body.querySelector('[data-k=keys]')!;
    const maxEl = body.querySelector('[data-k=max]')!;
    const setsEl = body.querySelector('.kt-sets')!;
    let max = 0;
    const bits = Object.entries(INPUT_NAMES).map(([b, name]) => [Number(b), name] as const);
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const held = Array.from(this.input.down);
      max = Math.max(max, held.length);
      keysEl.textContent = held.length ? held.map(keyLabel).join(' + ') : '—';
      maxEl.textContent = String(max);
      const rows: string[] = [];
      const devices: [string, number][] = [
        ['Keyboard 1', this.input.keyboardMask(0)],
        ['Keyboard 2', this.input.keyboardMask(1)],
      ];
      for (const p of this.input.connectedPads()) devices.push([`Gamepad ${p + 1}`, this.input.gamepadMask(p)]);
      for (const [name, m] of devices) {
        rows.push(`<div class="kt-row"><span>${name}</span>${bits.map(([b, nm]) => `<i class="${m & b ? 'on' : ''}">${nm}</i>`).join('')}</div>`);
      }
      setsEl.innerHTML = rows.join('');
    };
    tick();
    void ACTION_BITS;
    this.keyTestCleanup = () => cancelAnimationFrame(raf);
  }

  private audioTab(body: HTMLElement): void {
    body.innerHTML = `<label class="opt">Volume <input type="range" min="0" max="100" value="${Math.round(this.sfx.volume * 100)}" data-a="vol"></label>
      <button data-a="test">Test sound</button>`;
    body.querySelector<HTMLInputElement>('[data-a=vol]')!.addEventListener('input', (e) => {
      this.sfx.setVolume(Number((e.target as HTMLInputElement).value) / 100);
    });
    body.querySelector('[data-a=test]')!.addEventListener('click', () => {
      this.sfx.unlock();
      this.sfx.hit(2);
    });
  }

  pause(show: boolean): void {
    if (!show) {
      this.hide();
      return;
    }
    const n = h(`<div class="screen pause-screen">
      <div class="screen-title">PAUSED</div>
      <div class="menu-list">
        <button class="primary" data-a="resume">Resume</button>
        <button data-a="quit">Quit to menu</button>
      </div>
      <div class="hint">Esc to resume</div>
    </div>`);
    n.querySelector('[data-a=resume]')!.addEventListener('click', () => this.cb.resume());
    n.querySelector('[data-a=quit]')!.addEventListener('click', () => this.cb.quit());
    this.show(n);
    this.root.classList.add('overlay');
  }

  results(s: GameState, setup: MatchSetup): void {
    const w = s.winner;
    const rows = s.fighters
      .map((f, i) => {
        const d = FIGHTERS[f.char];
        const stat = s.mode === Mode.Versus ? `${s.roundWins[i]} rounds` : `${f.kos} KOs · ${f.falls} falls`;
        return `<div class="res-row ${i === w ? 'win' : ''}">${portrait(f.char, 48)}<b>${setup.players[i].label}</b><span>${d.name}</span><span>${stat}</span>${i === w ? '<em>WINNER</em>' : ''}</div>`;
      })
      .join('');
    const n = h(`<div class="screen results-screen">
      <div class="screen-title">${w >= 0 ? `${setup.players[w].label} WINS` : 'DRAW'}</div>
      <div class="res-list">${rows}</div>
      <div class="menu-list">
        <button class="primary" data-a="rematch">Rematch</button>
        <button data-a="select">Character select</button>
        <button data-a="menu">Main menu</button>
      </div>
    </div>`);
    n.querySelector('[data-a=rematch]')!.addEventListener('click', () => this.cb.rematch());
    n.querySelector('[data-a=select]')!.addEventListener('click', () => {
      this.cb.quit();
      this.select(setup.mode, setup.training);
    });
    n.querySelector('[data-a=menu]')!.addEventListener('click', () => this.cb.quit());
    this.show(n);
    this.root.classList.add('overlay');
  }

  get setup(): MatchSetup | null {
    return this.lastSetup;
  }
}
