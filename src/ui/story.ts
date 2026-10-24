// Story mode presentation + flow. Content lives in src/story/story.ts (data only).
// Flow per chapter: scenes in order → title card / narration / dialogue (with fighters idling on stage behind) /
// fight (VS splash → real match) → on loss: retry screen → on chapter end: save progress, unlock the next.
import { FIGHTERS } from '../sim/fighters';
import { Mode, GameState } from '../sim/state';
import type { FighterLook } from '../sim/defs';
import { CHAPTERS, SPEAKERS, Chapter, Scene, FightScene, Speaker } from '../story/story';
import type { MatchSetup, PlayerSetup } from '../game';
import type { Sfx } from '../audio/sfx';

const SAVE_KEY = 'fray.story.v1';

export interface StoryHost {
  /** Show two characters idling on the stage behind story screens. */
  backdrop(players: PlayerSetup[]): void;
  /** Run a real match; call `done` with the final state when it ends. */
  fight(setup: MatchSetup, done: (s: GameState) => void): void;
  /** Leave story mode (back to main menu). */
  exit(): void;
}

interface Progress {
  done: string[];
}

function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
    if (p && Array.isArray(p.done)) return p;
  } catch {
    /* ignore */
  }
  return { done: [] };
}

function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function h(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

function speakerLook(sp: Speaker): FighterLook | null {
  if (sp.char === undefined) return null;
  return { ...FIGHTERS[sp.char].look, ...(sp.look ?? {}) };
}

/** Big stylised portrait (placeholder art: colour bust built from the fighter's look). */
export function bust(key: string, size = 220, flip = false): string {
  const sp = SPEAKERS[key];
  const lk = sp ? speakerLook(sp) : null;
  if (!sp || !lk) return `<div class="bust bust-empty" style="width:${size}px;height:${size}px"></div>`;
  return `<div class="bust ${flip ? 'flip' : ''}" style="width:${size}px;height:${size}px;--skin:${hex(lk.skin)};--body:${hex(lk.body)};--trim:${hex(lk.trim)};--acc:${hex(lk.accent)};--hair:${hex(lk.hair)}">
    <div class="b-body"></div><div class="b-head"></div><div class="b-hair hs-${lk.hairStyle ?? (lk.build === 'bulky' || lk.build === 'giant' ? 'flat' : 'spiky')}"></div><div class="b-band"></div>
    <span class="b-initial">${sp.name[0]}</span>
  </div>`;
}

export class Story {
  readonly root: HTMLElement;
  private progress = loadProgress();
  private chapter: Chapter | null = null;
  private sceneIdx = 0;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private timers: number[] = [];
  active = false;

  constructor(
    parent: HTMLElement,
    private host: StoryHost,
    private sfx: Sfx,
  ) {
    this.root = h('<div class="story hidden"></div>');
    parent.append(this.root);
  }

  // ---- helpers -------------------------------------------------------------

  private clear(): void {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.root.innerHTML = '';
  }

  private show(node: HTMLElement, cls = ''): void {
    this.clear();
    this.root.className = 'story ' + cls;
    this.root.append(node);
    node.querySelector<HTMLElement>('button.primary, button')?.focus();
  }

  /** Advance on Enter / Space / J / click; Esc calls `skip` if given. */
  private onAdvance(node: HTMLElement, next: () => void, skip?: () => void): void {
    let used = false;
    const go = () => {
      if (used) return;
      used = true;
      next();
    };
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ') {
        e.preventDefault();
        go();
      } else if (e.code === 'Escape' && skip) {
        e.preventDefault();
        used = true;
        skip();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
    node.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      go();
    });
  }

  isDone(id: string): boolean {
    return this.progress.done.includes(id);
  }

  private unlocked(i: number): boolean {
    return i === 0 || this.isDone(CHAPTERS[i - 1].id);
  }

  // ---- chapter select ------------------------------------------------------

  open(): void {
    this.active = true;
    this.root.classList.remove('hidden');
    this.host.backdrop([this.idlePlayer('kestrel'), this.idlePlayer('torval')]);
    this.chapterSelect();
  }

  close(): void {
    this.active = false;
    this.clear();
    this.root.className = 'story hidden';
  }

  chapterSelect(): void {
    const next = CHAPTERS.findIndex((c, i) => this.unlocked(i) && !this.isDone(c.id));
    const cards = CHAPTERS.map((c, i) => {
      const locked = !this.unlocked(i);
      const done = this.isDone(c.id);
      return `<button class="ch-card ${locked ? 'locked' : ''} ${done ? 'done' : ''} ${i === next ? 'next' : ''}" data-i="${i}" ${locked ? 'disabled' : ''}>
        ${bust(c.hero, 90)}
        <div class="ch-text">
          <div class="ch-num">${c.number === 'PROLOGUE' ? 'PROLOGUE' : 'CHAPTER ' + c.number}</div>
          <div class="ch-title">${locked ? '??????' : c.title}</div>
          <div class="ch-blurb">${locked ? 'Complete the previous chapter to unlock.' : c.blurb}</div>
        </div>
        <div class="ch-state">${locked ? '🔒' : done ? '✔' : i === next ? 'NEW' : ''}</div>
      </button>`;
    }).join('');
    const pct = Math.round((this.progress.done.length / CHAPTERS.length) * 100);
    const n = h(`<div class="screen story-select">
      <div class="story-logo">FRAY<span>EMBERFALL</span></div>
      <div class="story-progress"><div style="width:${pct}%"></div><b>${pct}% complete</b></div>
      <div class="ch-list">${cards}</div>
      <div class="select-footer">
        <button data-a="back">◀ Main menu</button>
        <button data-a="reset" class="tiny">Reset story progress</button>
        ${next >= 0 ? '<button class="primary" data-a="continue">CONTINUE ▶</button>' : ''}
      </div>
    </div>`);
    n.querySelectorAll<HTMLButtonElement>('.ch-card').forEach((b) =>
      b.addEventListener('click', () => {
        this.sfx.ui('select');
        this.playChapter(Number(b.dataset.i));
      }),
    );
    n.querySelector('[data-a=back]')!.addEventListener('click', () => {
      this.close();
      this.host.exit();
    });
    n.querySelector('[data-a=continue]')?.addEventListener('click', () => this.playChapter(next));
    n.querySelector('[data-a=reset]')!.addEventListener('click', () => {
      if (!confirm('Reset all story progress?')) return;
      this.progress = { done: [] };
      saveProgress(this.progress);
      this.chapterSelect();
    });
    this.show(n, 'dim');
  }

  // ---- scene flow ----------------------------------------------------------

  playChapter(i: number): void {
    this.chapter = CHAPTERS[i];
    this.sceneIdx = 0;
    this.playScene();
  }

  private nextScene = (): void => {
    this.sceneIdx++;
    this.playScene();
  };

  private playScene(): void {
    const ch = this.chapter!;
    const sc: Scene | undefined = ch.scenes[this.sceneIdx];
    if (!sc) {
      this.chapterComplete();
      return;
    }
    switch (sc.kind) {
      case 'title':
        return this.titleCard(sc.kicker, sc.title, sc.subtitle);
      case 'narration':
        return this.narration(sc.lines);
      case 'dialogue':
        return this.dialogue(sc.lines, sc.stage);
      case 'fight':
        return this.vsSplash(sc);
    }
  }

  private skipToNextFight = (): void => {
    // Esc during cutscenes skips ahead to the next fight (or chapter end).
    const ch = this.chapter!;
    let i = this.sceneIdx + 1;
    while (i < ch.scenes.length && ch.scenes[i].kind !== 'fight') i++;
    this.sceneIdx = i;
    this.playScene();
  };

  private titleCard(kicker: string, title: string, subtitle?: string): void {
    const n = h(`<div class="story-title">
      <div class="st-kicker">${kicker}</div>
      <div class="st-title">${title}</div>
      ${subtitle ? `<div class="st-sub">${subtitle}</div>` : ''}
      <div class="story-hint">ENTER / SPACE / J to continue · ESC to skip</div>
    </div>`);
    this.show(n, 'black');
    this.sfx.ui('select');
    this.onAdvance(n, this.nextScene, this.skipToNextFight);
    this.timers.push(window.setTimeout(() => this.keyHandler && this.nextScene(), 3200));
  }

  private narration(lines: string[]): void {
    let i = 0;
    const n = h(`<div class="story-narration"><div class="sn-lines"></div><div class="story-hint">ENTER / SPACE / J · ESC to skip</div></div>`);
    const box = n.querySelector('.sn-lines')!;
    const step = () => {
      if (i >= lines.length) {
        this.nextScene();
        return;
      }
      const p = h(`<p>${lines[i++]}</p>`);
      box.append(p);
      while (box.children.length > 4) box.firstElementChild!.remove();
    };
    this.show(n, 'black');
    step();
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ') {
        e.preventDefault();
        step();
      } else if (e.code === 'Escape') this.skipToNextFight();
    };
    window.addEventListener('keydown', this.keyHandler);
    n.addEventListener('click', step);
  }

  private idlePlayer(key: string): PlayerSetup {
    const sp = SPEAKERS[key];
    return { device: 'cpu', cpuLevel: 0, char: sp?.fighter ?? 0, label: '', name: sp?.name, look: sp?.look };
  }

  private dialogue(lines: { who: string; text: string; side?: 'left' | 'right'; shout?: boolean }[], stage?: [string, string]): void {
    if (stage) this.host.backdrop([this.idlePlayer(stage[0]), this.idlePlayer(stage[1])]);
    let i = 0;
    let typing = 0;
    let full = '';
    const n = h(`<div class="story-dialogue">
      <div class="sd-portrait left"></div>
      <div class="sd-portrait right"></div>
      <div class="sd-box"><div class="sd-name"></div><div class="sd-text"></div><div class="sd-more">▼</div></div>
      <div class="story-hint">ENTER / SPACE / J · ESC to skip</div>
    </div>`);
    const nameEl = n.querySelector('.sd-name') as HTMLElement;
    const textEl = n.querySelector('.sd-text') as HTMLElement;
    const box = n.querySelector('.sd-box') as HTMLElement;
    const left = n.querySelector('.sd-portrait.left') as HTMLElement;
    const right = n.querySelector('.sd-portrait.right') as HTMLElement;
    const showLine = () => {
      if (i >= lines.length) {
        this.nextScene();
        return;
      }
      const ln = lines[i++];
      const sp = SPEAKERS[ln.who] ?? { name: ln.who };
      const side = ln.side ?? (stage && stage[1] === ln.who ? 'right' : 'left');
      const target = side === 'left' ? left : right;
      const other = side === 'left' ? right : left;
      if (sp.char !== undefined) {
        target.innerHTML = bust(ln.who, 300, side === 'right');
        target.classList.add('on');
      }
      target.classList.remove('dim');
      other.classList.add('dim');
      nameEl.textContent = sp.name;
      nameEl.style.background = sp.color ?? '#555';
      nameEl.className = 'sd-name ' + side;
      box.classList.toggle('shout', !!ln.shout);
      full = ln.text;
      let k = 0;
      textEl.textContent = '';
      clearInterval(typing);
      typing = window.setInterval(() => {
        k += 2;
        textEl.textContent = full.slice(0, k);
        if (k % 6 === 0) this.sfx.ui('move');
        if (k >= full.length) clearInterval(typing);
      }, 24);
      this.timers.push(typing);
    };
    const advance = () => {
      if (textEl.textContent!.length < full.length) {
        clearInterval(typing);
        textEl.textContent = full;
      } else showLine();
    };
    this.show(n, 'clear');
    showLine();
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ') {
        e.preventDefault();
        advance();
      } else if (e.code === 'Escape') {
        clearInterval(typing);
        this.skipToNextFight();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
    n.addEventListener('click', advance);
  }

  private vsSplash(sc: FightScene): void {
    const a = SPEAKERS[sc.player];
    const b = SPEAKERS[sc.opponent];
    const rules =
      sc.mode === Mode.Platform
        ? `PLATFORM RULES · ${sc.stocks ?? 2} STOCKS`
        : `VERSUS · ${(sc.roundsToWin ?? 1) === 1 ? 'ONE ROUND' : `BEST OF ${(sc.roundsToWin ?? 1) * 2 - 1}`} · ${sc.timeLimit === 0 ? 'NO TIME LIMIT' : (sc.timeLimit ?? 99) + 's'}`;
    const n = h(`<div class="story-vs">
      <div class="vs-half left">${bust(sc.player, 360)}<div class="vs-pname">${a.name}</div>${sc.taunt ? `<div class="vs-taunt">"${sc.taunt[0]}"</div>` : ''}</div>
      <div class="vs-mid">VS</div>
      <div class="vs-half right">${bust(sc.opponent, 360, true)}<div class="vs-pname">${b.name}</div>${sc.taunt ? `<div class="vs-taunt">"${sc.taunt[1]}"</div>` : ''}</div>
      <div class="vs-info"><div class="vs-rules">${rules}</div><div class="vs-obj">${sc.objective}</div>
        <button class="primary" data-a="go">FIGHT ▶</button></div>
    </div>`);
    this.show(n, 'black');
    this.sfx.ui('select');
    const go = () => this.runFight(sc);
    n.querySelector('[data-a=go]')!.addEventListener('click', go);
    this.onAdvance(n, go);
  }

  private runFight(sc: FightScene): void {
    this.clear();
    this.root.className = 'story hidden-soft';
    const pa = SPEAKERS[sc.player];
    const pb = SPEAKERS[sc.opponent];
    const setup: MatchSetup = {
      mode: sc.mode,
      training: false,
      stocks: sc.stocks ?? 2,
      roundsToWin: sc.roundsToWin ?? 1,
      timeLimit: sc.timeLimit,
      players: [
        { device: 'kb0', cpuLevel: 0, char: pa.fighter ?? 0, label: 'YOU', name: pa.name, look: pa.look, mods: sc.playerMods },
        { device: 'cpu', cpuLevel: sc.level, char: pb.fighter ?? 1, label: `CPU ${sc.level}`, name: pb.name, look: pb.look, mods: sc.opponentMods },
      ],
    };
    this.host.fight(setup, (s) => {
      this.root.classList.remove('hidden-soft');
      if (s.winner === 0) this.nextScene();
      else this.defeat(sc);
    });
  }

  private defeat(sc: FightScene): void {
    const n = h(`<div class="screen story-defeat">
      <div class="sdf-title">DEFEAT</div>
      ${sc.defeatLine ? `<div class="sdf-line">${bust(sc.opponent, 120)}<span>"${sc.defeatLine}"</span></div>` : ''}
      <div class="menu-list">
        <button class="primary" data-a="retry">Retry fight</button>
        <button data-a="easier">Retry (easier CPU)</button>
        <button data-a="quit">Back to chapters</button>
      </div>
    </div>`);
    n.querySelector('[data-a=retry]')!.addEventListener('click', () => this.runFight(sc));
    n.querySelector('[data-a=easier]')!.addEventListener('click', () => this.runFight({ ...sc, level: Math.max(1, sc.level - 2) }));
    n.querySelector('[data-a=quit]')!.addEventListener('click', () => this.open());
    this.show(n, 'dim');
  }

  private chapterComplete(): void {
    const ch = this.chapter!;
    if (!this.isDone(ch.id)) {
      this.progress.done.push(ch.id);
      saveProgress(this.progress);
    }
    const idx = CHAPTERS.indexOf(ch);
    const next = CHAPTERS[idx + 1];
    const n = h(`<div class="screen story-complete">
      <div class="sc-kicker">${ch.number === 'PROLOGUE' ? 'PROLOGUE' : 'CHAPTER ' + ch.number} COMPLETE</div>
      <div class="sc-title">${ch.title}</div>
      <div class="menu-list">
        ${next ? `<button class="primary" data-a="next">Next: ${next.title} ▶</button>` : '<div class="sc-end">You have finished the story. More chapters coming soon.</div>'}
        <button data-a="chapters">Chapter select</button>
      </div>
    </div>`);
    n.querySelector('[data-a=next]')?.addEventListener('click', () => this.playChapter(idx + 1));
    n.querySelector('[data-a=chapters]')!.addEventListener('click', () => this.open());
    this.show(n, 'dim');
  }
}
