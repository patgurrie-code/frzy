// STORY MODE DATA — "FRAY: EMBERFALL".
// Pure data: chapters are lists of scenes played in order by src/ui/story.ts.
// To add content: append scenes/chapters here. Character indices refer to FIGHTERS (0 KESTREL, 1 TORVAL,
// 2 SERA, 3 VESHA, 4 BRAKKA). Bosses reuse a fighter's moveset with a name/look override + gameplay mods.
import { Mode } from '../sim/state';
import type { FighterLook } from '../sim/defs';
import type { FighterMods } from '../sim/sim';

export const C = { KESTREL: 0, TORVAL: 1, SERA: 2, VESHA: 3, BRAKKA: 4 } as const;

/** A speaker in dialogue. `char` picks the portrait colours; `look` overrides them (bosses). */
export interface Speaker {
  name: string;
  char?: number;
  look?: Partial<FighterLook>;
  color?: string; // name plate colour
}

export interface Line {
  who: string; // key into SPEAKERS
  text: string;
  side?: 'left' | 'right';
  /** Emphasis: shake the box / bigger text. */
  shout?: boolean;
}

export interface TitleScene {
  kind: 'title';
  kicker: string; // e.g. "CHAPTER 1"
  title: string;
  subtitle?: string;
}

export interface NarrationScene {
  kind: 'narration';
  lines: string[];
}

export interface DialogueScene {
  kind: 'dialogue';
  /** Characters standing on stage behind the dialogue (left, right). */
  stage?: [string, string];
  lines: Line[];
}

export interface FightScene {
  kind: 'fight';
  player: string; // speaker key of the fighter the player controls
  opponent: string; // speaker key of the CPU opponent
  level: number; // CPU level 1..9
  mode: Mode;
  objective: string; // shown on the VS splash
  roundsToWin?: number; // Versus (default 1 in story)
  timeLimit?: number; // Versus seconds (default 99, 0 = untimed)
  stocks?: number; // Platform
  playerMods?: FighterMods;
  opponentMods?: FighterMods;
  /** Lines spoken on the VS splash. */
  taunt?: [string, string];
  /** Shown if the player loses (retry screen). */
  defeatLine?: string;
}

export type Scene = TitleScene | NarrationScene | DialogueScene | FightScene;

export interface Chapter {
  id: string;
  number: string; // "PROLOGUE", "1", ...
  title: string;
  hero: string; // speaker key (portrait on the chapter card)
  blurb: string;
  scenes: Scene[];
}

// ---------------------------------------------------------------------------
// Cast
// ---------------------------------------------------------------------------

const HOLLOW_LOOK: Partial<FighterLook> = { body: 0x1b1b2a, trim: 0x3a0d4f, accent: 0xff2d6f, hair: 0xe8e8f0, skin: 0x9fa3b8 };
const MALVEK_LOOK: Partial<FighterLook> = { body: 0x1a1410, trim: 0xd4af37, accent: 0xfff1a8, hair: 0xd4af37, skin: 0x6b5b4b, cape: true };
const BRUISER_LOOK: Partial<FighterLook> = { body: 0x5a5a3a, trim: 0x3a2a1a, accent: 0xb0b0b0, hair: 0x6a4a2a };
const WARDEN_LOOK: Partial<FighterLook> = { body: 0x3a3f4a, trim: 0xd4af37, accent: 0x9fe8ff, hair: 0x22252b };

export const SPEAKERS: Record<string, Speaker & { fighter?: number }> = {
  kestrel: { name: 'KESTREL', char: C.KESTREL, fighter: C.KESTREL, color: '#ff6a3d' },
  torval: { name: 'TORVAL', char: C.TORVAL, fighter: C.TORVAL, color: '#ffc23d' },
  sera: { name: 'SERA', char: C.SERA, fighter: C.SERA, color: '#8fd3ff' },
  vesha: { name: 'VESHA', char: C.VESHA, fighter: C.VESHA, color: '#b36bff' },
  brakka: { name: 'BRAKKA', char: C.BRAKKA, fighter: C.BRAKKA, color: '#ff8a2b' },
  bruiser: { name: 'GRISTLE', char: C.BRAKKA, fighter: C.BRAKKA, look: BRUISER_LOOK, color: '#b0b0b0' },
  warden: { name: 'IRON WARDEN', char: C.BRAKKA, fighter: C.BRAKKA, look: WARDEN_LOOK, color: '#9fe8ff' },
  ren: { name: 'HOLLOW REN', char: C.KESTREL, fighter: C.KESTREL, look: HOLLOW_LOOK, color: '#ff2d6f' },
  malvek: { name: 'HIERARCH MALVEK', char: C.TORVAL, fighter: C.TORVAL, look: MALVEK_LOOK, color: '#d4af37' },
  announcer: { name: 'PIT CALLER', color: '#cccccc' },
};

// ---------------------------------------------------------------------------
// Chapters
// ---------------------------------------------------------------------------

export const CHAPTERS: Chapter[] = [
  {
    id: 'prologue',
    number: 'PROLOGUE',
    title: 'Emberfall',
    hero: 'kestrel',
    blurb: 'The moon broke. The world changed. A kid from the Low Wards learned to fight.',
    scenes: [
      { kind: 'title', kicker: 'PROLOGUE', title: 'EMBERFALL', subtitle: 'Twelve years after the sky broke' },
      {
        kind: 'narration',
        lines: [
          'Twelve years ago, the Ember Moon shattered.',
          'Its shards fell across the world of Aster — and where they landed, people woke up with ki burning in their veins.',
          'The Shardborn.',
          'From his Sky Citadel, Hierarch Malvek offered them a promise: fight in THE FRAY, and the champion will be granted anything.',
          'Every five years, the strongest climb the Citadel steps.',
          'None of them come back down.',
        ],
      },
      {
        kind: 'dialogue',
        stage: ['kestrel', 'bruiser'],
        lines: [
          { who: 'announcer', text: 'Low Ward Pit, night three! In the red corner — the kid nobody bets on — KESTREL!' },
          { who: 'bruiser', text: 'Skinny little bird. I\'ll fold you in half and mail you home.', side: 'right' },
          { who: 'kestrel', text: 'You talk a lot for a guy who\'s about to take a nap.', side: 'left' },
          { who: 'announcer', text: 'FIGHT!', shout: true },
        ],
      },
      {
        kind: 'fight',
        player: 'kestrel',
        opponent: 'bruiser',
        level: 2,
        mode: Mode.Versus,
        objective: 'Win the round. Jab chains: tap ATTACK ×3. Smash: SMASH + direction.',
        roundsToWin: 1,
        opponentMods: { health: 800, dmg: 85 },
        taunt: ['Let\'s go.', 'Stay down, bird.'],
        defeatLine: 'The pit doesn\'t care about excuses. Get up.',
      },
      {
        kind: 'dialogue',
        stage: ['kestrel', 'bruiser'],
        lines: [
          { who: 'announcer', text: 'Down goes Gristle! The bird flies again!' },
          { who: 'kestrel', text: '...Ren would\'ve finished that in half the time.', side: 'left' },
          { who: 'vesha', text: 'He would have. Your brother was faster.', side: 'right' },
          { who: 'kestrel', text: 'Who said that? Show yourself!', side: 'left', shout: true },
        ],
      },
    ],
  },
  {
    id: 'ch1',
    number: '1',
    title: 'Shadow in the Rain',
    hero: 'kestrel',
    blurb: 'A hooded assassin knows what happened to Ren. She wants to see if Kestrel can survive the truth.',
    scenes: [
      { kind: 'title', kicker: 'CHAPTER 1', title: 'SHADOW IN THE RAIN' },
      {
        kind: 'dialogue',
        stage: ['kestrel', 'vesha'],
        lines: [
          { who: 'vesha', text: 'Ren entered the Fray five years ago. He reached the Citadel. Then the Hierarch took him.', side: 'right' },
          { who: 'kestrel', text: '"Took" him? Took him where?', side: 'left' },
          { who: 'vesha', text: 'This token gets you through the Citadel gate. But I don\'t hand it to people who die on the steps.', side: 'right' },
          { who: 'kestrel', text: 'Then come take a look at how I don\'t die.', side: 'left' },
        ],
      },
      {
        kind: 'fight',
        player: 'kestrel',
        opponent: 'vesha',
        level: 3,
        mode: Mode.Versus,
        objective: 'Defeat VESHA. Hold GUARD + SPECIAL to charge ki. SMASH + SPECIAL = EX special.',
        roundsToWin: 1,
        taunt: ['Talk later.', 'Show me.'],
        defeatLine: 'Too slow. Ren would be disappointed.',
      },
      {
        kind: 'dialogue',
        stage: ['kestrel', 'vesha'],
        lines: [
          { who: 'vesha', text: 'Good. Fast enough to be interesting.', side: 'right' },
          { who: 'vesha', text: 'The road to the Citadel crosses the Brakka Range. Don\'t let the mountain eat you.', side: 'right' },
          { who: 'kestrel', text: 'Wait — whose side are you on?', side: 'left' },
          { who: 'vesha', text: '...Mine.', side: 'right' },
        ],
      },
    ],
  },
  {
    id: 'ch2',
    number: '2',
    title: 'The Mountain Fist',
    hero: 'kestrel',
    blurb: 'A giant guards the only bridge to the Citadel. He needs Kestrel\'s token as badly as Kestrel does.',
    scenes: [
      { kind: 'title', kicker: 'CHAPTER 2', title: 'THE MOUNTAIN FIST', subtitle: 'The Skyforge Bridge' },
      {
        kind: 'dialogue',
        stage: ['kestrel', 'brakka'],
        lines: [
          { who: 'brakka', text: 'Small one. You carry a Fray token. Give it to me.', side: 'right' },
          { who: 'kestrel', text: 'Big one. No.', side: 'left' },
          { who: 'brakka', text: 'The Ascendancy stole my clan\'s shard-heart. Without it, my mountain freezes. I must reach the Hierarch.', side: 'right' },
          { who: 'kestrel', text: 'Yeah? Get in line. He took my brother.', side: 'left' },
          { who: 'brakka', text: 'Then we settle it the mountain way. Whoever leaves the bridge... loses.', side: 'right', shout: true },
        ],
      },
      {
        kind: 'fight',
        player: 'kestrel',
        opponent: 'brakka',
        level: 4,
        mode: Mode.Platform,
        objective: 'RING OUT! Knock BRAKKA off the bridge. 2 stocks each.',
        stocks: 2,
        taunt: ['Timber.', 'The mountain does not fall.'],
        defeatLine: 'The mountain does not move for the weak.',
      },
      {
        kind: 'dialogue',
        stage: ['kestrel', 'brakka'],
        lines: [
          { who: 'brakka', text: '...Ha. HAHA! The mountain fell! Small one, you hit like a landslide.', side: 'right' },
          { who: 'kestrel', text: 'Come with me. Two tokens, one gate — we kick it down together.', side: 'left' },
          { who: 'brakka', text: 'Brakka of the Range walks with you. Until the Hierarch is dust.', side: 'right' },
        ],
      },
    ],
  },
  {
    id: 'ch3',
    number: '3',
    title: 'Oath of the Lance',
    hero: 'sera',
    blurb: 'The last knight of a fallen order hunts the Ascendancy\'s shadows — and catches one.',
    scenes: [
      { kind: 'title', kicker: 'CHAPTER 3', title: 'OATH OF THE LANCE', subtitle: 'Meanwhile, beneath the Citadel' },
      {
        kind: 'narration',
        lines: [
          'The Order of the Dawn Lance swore to protect Aster from those who would hoard the shards.',
          'Malvek burned their keep in a single night.',
          'One knight survived.',
        ],
      },
      {
        kind: 'dialogue',
        stage: ['sera', 'vesha'],
        lines: [
          { who: 'sera', text: 'I know that cloak. You\'re the Hierarch\'s knife.', side: 'left' },
          { who: 'vesha', text: 'Was. It\'s complicated.', side: 'right' },
          { who: 'sera', text: 'My order died screaming while your kind watched. Nothing about that is complicated.', side: 'left', shout: true },
        ],
      },
      {
        kind: 'fight',
        player: 'sera',
        opponent: 'vesha',
        level: 5,
        mode: Mode.Versus,
        objective: 'Defeat VESHA. Keep her at the tip of your spear.',
        roundsToWin: 1,
        taunt: ['For the Dawn Lance.', 'You\'re making a mistake.'],
        defeatLine: 'The Order deserved a better last knight. Rise.',
      },
      {
        kind: 'dialogue',
        stage: ['sera', 'vesha'],
        lines: [
          { who: 'vesha', text: 'Enough! Look — the Hierarch\'s seal. He\'s harvesting champions. Draining their shards to rebuild the moon.', side: 'right' },
          { who: 'sera', text: '...Rebuild the moon? With what power?', side: 'left' },
          { who: 'vesha', text: 'Theirs. All of it. Until they\'re hollow.', side: 'right' },
          { who: 'sera', text: 'Then the Fray isn\'t a tournament. It\'s a slaughterhouse.', side: 'left' },
        ],
      },
    ],
  },
  {
    id: 'ch4',
    number: '4',
    title: 'The Storm Engine',
    hero: 'kestrel',
    blurb: 'The Fray begins. Standing in Kestrel\'s way: the undefeated champion, Torval.',
    scenes: [
      { kind: 'title', kicker: 'CHAPTER 4', title: 'THE STORM ENGINE', subtitle: 'The Fray — Citadel Quarterfinal' },
      {
        kind: 'dialogue',
        stage: ['kestrel', 'torval'],
        lines: [
          { who: 'torval', text: 'You have Ren\'s eyes. And his habit of charging in.', side: 'right' },
          { who: 'kestrel', text: 'You knew him?', side: 'left' },
          { who: 'torval', text: 'I beat him. In this very ring. Then I stood aside while they carried him into the dark.', side: 'right' },
          { who: 'kestrel', text: 'Then you\'re first.', side: 'left', shout: true },
        ],
      },
      {
        kind: 'fight',
        player: 'kestrel',
        opponent: 'torval',
        level: 5,
        mode: Mode.Versus,
        objective: 'Best of 3. Get inside his beams — and if beams collide, MASH!',
        roundsToWin: 2,
        taunt: ['For Ren.', 'Show me you\'re worth it.'],
        defeatLine: 'Is that all the fire you have?',
      },
      {
        kind: 'dialogue',
        stage: ['kestrel', 'torval'],
        lines: [
          { who: 'torval', text: 'Good. That\'s the fire he had.', side: 'right' },
          { who: 'torval', text: 'Listen. Ren is alive — what\'s left of him. Malvek made him a vessel. They call him the Hollow.', side: 'right' },
          { who: 'kestrel', text: 'And you just... let it happen?', side: 'left' },
          { who: 'torval', text: 'Twelve years I\'ve served a monster. No more. My beams are yours, Kestrel.', side: 'right' },
        ],
      },
    ],
  },
  {
    id: 'ch5',
    number: '5',
    title: 'Shards and Shadows',
    hero: 'vesha',
    blurb: 'Vesha breaks into the Citadel vaults to free the harvested — and meets the Iron Warden.',
    scenes: [
      { kind: 'title', kicker: 'CHAPTER 5', title: 'SHARDS AND SHADOWS', subtitle: 'The Citadel Vaults' },
      {
        kind: 'dialogue',
        stage: ['vesha', 'warden'],
        lines: [
          { who: 'warden', text: 'Traitor. The Hierarch fed you, trained you, named you.', side: 'right' },
          { who: 'vesha', text: 'He named me "Seven". I picked "Vesha" myself.', side: 'left' },
          { who: 'warden', text: 'My armour was forged from moon-iron. Your little knives will shatter.', side: 'right' },
        ],
      },
      {
        kind: 'fight',
        player: 'vesha',
        opponent: 'warden',
        level: 6,
        mode: Mode.Versus,
        objective: 'The Warden is armoured (takes less damage). Use speed — and your counter.',
        roundsToWin: 1,
        opponentMods: { def: 75, kb: 70, health: 1200 },
        taunt: ['Knives find gaps.', 'Kneel.'],
        defeatLine: 'Seven. You were always a tool.',
      },
      {
        kind: 'dialogue',
        stage: ['vesha', 'warden'],
        lines: [
          { who: 'vesha', text: 'Moon-iron has seams. Everything does.', side: 'left' },
          { who: 'warden', text: '...You\'re too late. The Hollow is awake. The Hierarch sent it for the boy.', side: 'right' },
        ],
      },
    ],
  },
  {
    id: 'ch6',
    number: '6',
    title: 'Hollow',
    hero: 'kestrel',
    blurb: 'Brother against brother. Kestrel has to reach whatever is left of Ren.',
    scenes: [
      { kind: 'title', kicker: 'CHAPTER 6', title: 'HOLLOW' },
      {
        kind: 'dialogue',
        stage: ['kestrel', 'ren'],
        lines: [
          { who: 'kestrel', text: 'Ren...? Ren! It\'s me! It\'s Kes!', side: 'left', shout: true },
          { who: 'ren', text: '...Vessel... online. Target: Shardborn. Harvest.', side: 'right' },
          { who: 'kestrel', text: 'You taught me to throw a punch in the alley behind Mom\'s shop. Remember?', side: 'left' },
          { who: 'ren', text: '...K...Kes...trel. Run.', side: 'right' },
          { who: 'kestrel', text: 'Not this time. This time I\'m bringing you home.', side: 'left' },
        ],
      },
      {
        kind: 'fight',
        player: 'kestrel',
        opponent: 'ren',
        level: 7,
        mode: Mode.Versus,
        objective: 'Best of 3. HOLLOW REN hits harder and regenerates ki. Reach him.',
        roundsToWin: 2,
        opponentMods: { dmg: 115, health: 1250, kiRegen: 25, ki: 100 },
        taunt: ['Come back to me.', 'HARVEST.'],
        defeatLine: '...Run... Kes...',
      },
      {
        kind: 'dialogue',
        stage: ['kestrel', 'ren'],
        lines: [
          { who: 'ren', text: 'Kes... you got... so fast...', side: 'right' },
          { who: 'kestrel', text: 'Had a good teacher. Stay with me, okay? Stay with me.', side: 'left' },
          { who: 'malvek', text: 'Touching. The vessel is spent — but its brother burns brighter still.', side: 'right' },
          { who: 'malvek', text: 'Come up to the summit, Kestrel. Let us finish the moon together.', side: 'right' },
        ],
      },
    ],
  },
  {
    id: 'ch7',
    number: '7',
    title: 'Ascension',
    hero: 'kestrel',
    blurb: 'The summit of the Sky Citadel. Malvek has taken the power of every fallen champion.',
    scenes: [
      { kind: 'title', kicker: 'FINAL CHAPTER', title: 'ASCENSION', subtitle: 'The Summit of the Sky Citadel' },
      {
        kind: 'narration',
        lines: [
          'Above the clouds, the half-built moon turns over the Citadel like a wound in the sky.',
          'Beneath it waits the Hierarch — swollen with the stolen ki of a hundred champions.',
        ],
      },
      {
        kind: 'dialogue',
        stage: ['kestrel', 'malvek'],
        lines: [
          { who: 'malvek', text: 'I gave this broken world purpose. The Fray. A ladder to godhood.', side: 'right' },
          { who: 'kestrel', text: 'You built a ladder out of people.', side: 'left' },
          { who: 'torval', text: 'Kestrel! Take our ki — all of it!', side: 'left' },
          { who: 'sera', text: 'For the Dawn Lance!', side: 'left' },
          { who: 'brakka', text: 'For the mountain!', side: 'left' },
          { who: 'vesha', text: '...For Ren. Don\'t miss.', side: 'left' },
          { who: 'malvek', text: 'Then come. Let the last shard decide what the moon becomes!', side: 'right', shout: true },
        ],
      },
      {
        kind: 'fight',
        player: 'kestrel',
        opponent: 'malvek',
        level: 9,
        mode: Mode.Versus,
        objective: 'FINAL BATTLE. No time limit. You start with full ki — your friends\' gift.',
        roundsToWin: 1,
        timeLimit: 0,
        playerMods: { ki: 300, kiRegen: 20 },
        opponentMods: { health: 2200, dmg: 120, def: 90, kiRegen: 40, ki: 300 },
        taunt: ['This ends now.', 'KNEEL BEFORE THE MOON.'],
        defeatLine: 'The moon rises on your silence.',
      },
      {
        kind: 'narration',
        lines: [
          'The half-built moon cracked — and then it sang.',
          'A hundred stolen lights poured out of it and fell like warm rain across Aster, finding their way home.',
          'Ren woke up in the Low Wards three days later, asking for breakfast.',
          'The Fray still happens every five years.',
          'Now, everybody comes back down.',
          'THE END... for now.',
        ],
      },
    ],
  },
];
