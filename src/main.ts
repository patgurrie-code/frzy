import './style.css';
import { GameRenderer } from './render/renderer';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { Sfx } from './audio/sfx';
import { InputManager } from './input/input';
import { Match, MatchSetup } from './game';
import { Mode } from './sim/state';

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

const menu = new Menu(ui, input, sfx, {
  start(setup: MatchSetup) {
    startMatch(setup);
  },
  resume() {
    if (match?.paused) match.togglePause();
  },
  quit() {
    match?.stop();
    match = null;
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
  match.onEnd = (s) => menu.results(s, setup);
  match.start();
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') fpsEl.classList.toggle('hidden');
});
setInterval(() => {
  const m = match ?? attract;
  if (m) fpsEl.textContent = `${m.fps} fps`;
}, 500);

startAttract();
menu.title();
