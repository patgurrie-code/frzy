import './style.css';
import { GameRenderer } from './render/renderer';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { Sfx } from './audio/sfx';
import { InputManager } from './input/input';
import { Match, MatchSetup } from './game';
import { Mode, GameState } from './sim/state';
import { Story } from './ui/story';
import { OnlineLobby } from './ui/online';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const fpsEl = document.getElementById('fps') as HTMLElement;

const renderer = new GameRenderer(canvas);
const hud = new Hud(ui);
const sfx = new Sfx();
const input = new InputManager();
let match: Match | null = null;

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// Attract-mode backdrop behind the menus: two CPUs fighting on the stage.
let attract: Match | null = null;
function startAttract() {
  stopAttract();
  attract = new Match(
    {
      mode: Mode.Platform,
      training: false,
      stocks: 99,
      quiet: true,
      players: [
        { device: 'cpu', cpuLevel: 5, char: 0, label: 'CPU' },
        { device: 'cpu', cpuLevel: 5, char: 1, label: 'CPU' },
      ],
    },
    renderer,
    hud,
    sfx,
    input,
  );
  attract.start();
}
function stopAttract() {
  attract?.stop();
  attract = null;
}

let storyDone: ((s: GameState) => void) | null = null;

const menu = new Menu(ui, input, sfx, {
  start(setup: MatchSetup) {
    startMatch(setup);
  },
  story() {
    menu.hide();
    story.open();
  },
  online() {
    menu.hide();
    stopAttract();
    online.open();
  },
  resume() {
    if (match?.paused) match.togglePause();
  },
  quit() {
    if (online.active) {
      menu.hide();
      online.quitMatch();
      return;
    }
    match?.stop();
    match = null;
    if (story.active) {
      storyDone = null;
      menu.hide();
      story.open();
      return;
    }
    startAttract();
    menu.main();
  },
  rematch() {
    if (match) startMatch(match.setup);
  },
});

function startMatch(setup: MatchSetup) {
  stopAttract();
  match?.stop();
  menu.hide();
  match = new Match(setup, renderer, hud, sfx, input);
  match.onPause = () => menu.pause(match!.paused);
  match.onEnd = (s) => {
    if (onlineDone) {
      const cb = onlineDone;
      onlineDone = null;
      cb(s);
    } else if (storyDone) {
      const cb = storyDone;
      storyDone = null;
      match?.stop();
      match = null;
      cb(s);
    } else menu.results(s, setup);
  };
  match.start();
}

// Online lobby host: matches end back in the lobby (results / rematch), never in the offline results screen.
let onlineDone: ((s: GameState) => void) | null = null;
const online = new OnlineLobby(ui, {
  startMatch(setup, onEnd) {
    onlineDone = onEnd;
    startMatch(setup);
    return match!;
  },
  stopMatch() {
    onlineDone = null;
    match?.stop();
    match = null;
    menu.hide();
  },
  exit() {
    startAttract();
    menu.main();
  },
}, sfx);

// Story mode host: backdrops are quiet idle matches; fights are normal matches whose end goes back to the story.
const story = new Story(ui, {
  backdrop(players) {
    match?.stop();
    match = null;
    stopAttract();
    attract = new Match(
      { mode: Mode.Versus, training: false, stocks: 1, quiet: true, idle: true, timeLimit: 0, players },
      renderer,
      hud,
      sfx,
      input,
    );
    attract.start();
  },
  fight(setup, done) {
    storyDone = done;
    startMatch(setup);
  },
  exit() {
    startAttract();
    menu.main();
  },
}, sfx);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') fpsEl.classList.toggle('hidden');
});
setInterval(() => {
  const m = match ?? attract;
  if (m) fpsEl.textContent = `${m.fps} fps · ${renderer.renderer.info.render.calls} draws`;
}, 500);

// Invite links: ?room=CODE jumps straight into the online lobby.
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) {
  menu.hide();
  online.open(roomParam.toUpperCase());
} else {
  startAttract();
  menu.title();
}
