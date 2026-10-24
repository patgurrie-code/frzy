// three.js renderer. Reads sim state (previous + current for interpolation); never mutates it.
import * as THREE from 'three';
import { FX } from '../sim/fixed';
import { FIGHTERS } from '../sim/fighters';
import { STAGES, StageDef } from '../sim/stage';
import { Act, EvType, GameState, Mode, SimEvent } from '../sim/state';
import { ProjKind } from '../sim/defs';
import { AnimRef, fighterAnim } from '../sim/pose';
import { samplePoseF } from '../sim/anim';
import { fighterJoints } from '../sim/sim';
import { HURTBOXES, bonePoint, makeJoints, BONE_COUNT } from '../sim/skeleton';
import { buildFighterModel, applyPose, FighterModel } from './fighterModel';
import { tryLoadGlb, updateGlb } from './glbLoader';
import { toonMat, outlined } from './toon';

const toM = (v: number) => v / FX;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Spark {
  mesh: THREE.Mesh;
  ring: THREE.Mesh;
  life: number;
  max: number;
  size: number;
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 400);
  private stageGroup = new THREE.Group();
  private models: FighterModel[] = [];
  private projGroup = new THREE.Group();
  private blastPool: THREE.Mesh[] = [];
  private beamPool: { body: THREE.Mesh; head: THREE.Mesh; core: THREE.Mesh }[] = [];
  private sparks: Spark[] = [];
  private shake = 0;
  private camPos = new THREE.Vector3(0, 3, 30);
  private camLook = new THREE.Vector3(0, 2, 0);
  private rot = new Float32Array(BONE_COUNT);
  private rootOff = new Float32Array(2);
  private ref: AnimRef = { anim: FIGHTERS[0].anims.idle, frame: 0, clip: '' };
  private stage: StageDef = STAGES[0];
  private time = 0;
  showBoxes = false;
  // Debug overlay
  private hurtInst: THREE.InstancedMesh;
  private hitInst: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private joints = makeJoints();
  private clashFx: THREE.Mesh;
  private bgFar: THREE.Group = new THREE.Group();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a3a4a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(4, 10, 8);
    this.scene.add(sun);
    this.scene.add(this.stageGroup, this.projGroup, this.bgFar);

    const circle = new THREE.CircleGeometry(1, 16);
    this.hurtInst = new THREE.InstancedMesh(
      circle,
      new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.35, depthTest: false }),
      200,
    );
    this.hitInst = new THREE.InstancedMesh(
      circle,
      new THREE.MeshBasicMaterial({ color: 0xff2d4d, transparent: true, opacity: 0.55, depthTest: false }),
      64,
    );
    this.hurtInst.renderOrder = 10;
    this.hitInst.renderOrder = 11;
    this.hurtInst.frustumCulled = this.hitInst.frustumCulled = false;
    this.scene.add(this.hurtInst, this.hitInst);

    const sparkGeo = new THREE.OctahedronGeometry(1, 0);
    const ringGeo = new THREE.RingGeometry(0.7, 1, 20);
    for (let i = 0; i < 24; i++) {
      const mesh = new THREE.Mesh(
        sparkGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      );
      mesh.visible = ring.visible = false;
      this.scene.add(mesh, ring);
      this.sparks.push({ mesh, ring, life: 0, max: 1, size: 1 });
    }
    this.clashFx = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.clashFx.visible = false;
    this.scene.add(this.clashFx);
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** (Re)build the scene for a match. */
  setup(s: GameState): void {
    for (const m of this.models) {
      this.scene.remove(m.root);
      this.scene.remove(m.shadow);
    }
    this.models = s.fighters.map((f) => {
      const def = FIGHTERS[f.char];
      const m = buildFighterModel(def);
      this.scene.add(m.root);
      this.scene.add(m.shadow);
      void tryLoadGlb(def.id, m, 1.8 * (def.stats.scale / 1000)).catch(() => false);
      return m;
    });
    this.buildStage(STAGES[s.stage], s.mode === Mode.Versus);
    this.camPos.set(0, 3, 30);
  }

  private buildStage(st: StageDef, versus: boolean): void {
    this.stage = st;
    this.stageGroup.clear();
    this.bgFar.clear();
    // Sky gradient dome
    const skyGeo = new THREE.SphereGeometry(180, 24, 12);
    const top = new THREE.Color(st.sky[0]);
    const bottom = new THREE.Color(st.sky[1]);
    const colors: number[] = [];
    const pos = skyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.clamp((pos.getY(i) + 20) / 120, 0, 1);
      const c = bottom.clone().lerp(top, t);
      colors.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.bgFar.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false })));

    // Distant floating islands + a sun disc
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xffe7b0, transparent: true, opacity: 0.85 }));
    sunDisc.position.set(-30, 18, -120);
    this.bgFar.add(sunDisc);
    const rockMat = toonMat(0x4b4f66);
    const grass = toonMat(st.accent);
    for (let i = 0; i < 9; i++) {
      const r = 3 + ((i * 37) % 7);
      const isl = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.6, 6), rockMat);
      isl.rotation.x = Math.PI;
      const x = -70 + i * 17 + ((i * 13) % 9);
      const y = -6 + ((i * 29) % 18);
      const z = -45 - ((i * 41) % 50);
      isl.position.set(x, y, z);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.95, 0.6, 6), grass);
      cap.position.set(x, y + r * 0.8 + 0.3, z);
      this.bgFar.add(isl, cap);
    }

    // Main platform
    const p0 = st.platforms[0];
    const w = toM(p0.x2 - p0.x1);
    const depth = 4.2;
    const thick = toM(p0.y - p0.bottom);
    const block = outlined(new THREE.BoxGeometry(w, thick, depth), toonMat(st.ground), 0.05);
    block.position.set(toM(p0.x1 + p0.x2) / 2, toM(p0.y) - thick / 2, 0);
    this.stageGroup.add(block);
    // Glowing trims along the front and back edges of the floor
    for (const z of [depth / 2, -depth / 2]) {
      const trimEdge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.12, 0.14), toonMat(st.accent, 0x113322));
      trimEdge.position.set(block.position.x, toM(p0.y) - 0.05, z);
      this.stageGroup.add(trimEdge);
    }
    const under = new THREE.Mesh(new THREE.ConeGeometry(w * 0.45, thick * 2.4, 6), toonMat(0x3c3f52));
    under.rotation.x = Math.PI;
    under.position.set(block.position.x, toM(p0.bottom) - thick * 1.2, 0);
    this.stageGroup.add(under);
    // Floor tiles stripes for motion reference
    for (let x = Math.ceil(toM(p0.x1)); x < toM(p0.x2); x += 1) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, depth - 0.3), toonMat(0x8a8fa3));
      line.position.set(x, 0.002, 0);
      this.stageGroup.add(line);
    }
    // Ruined pillars in the background of the stage
    for (const px of [-5.2, -2.5, 2.8, 5.4]) {
      const h = 2 + Math.abs(px) * 0.4;
      const pillar = outlined(new THREE.CylinderGeometry(0.28, 0.32, h, 8), toonMat(0x8c8faa), 0.04);
      pillar.position.set(px, h / 2, -2.6);
      this.stageGroup.add(pillar);
    }

    if (!versus) {
      for (let i = 1; i < st.platforms.length; i++) {
        const p = st.platforms[i];
        const pw = toM(p.x2 - p.x1);
        const slab = outlined(new THREE.BoxGeometry(pw, 0.22, 2.4), toonMat(0x9aa0b8), 0.04);
        slab.position.set(toM(p.x1 + p.x2) / 2, toM(p.y) - 0.11, 0);
        const glow = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.04, 2.45), toonMat(st.accent, 0x224433));
        glow.position.set(slab.position.x, toM(p.y) - 0.01, 0);
        this.stageGroup.add(slab, glow);
      }
    } else {
      // Versus walls: translucent energy barriers
      for (const wx of [st.wallL, st.wallR]) {
        const wall = new THREE.Mesh(
          new THREE.PlaneGeometry(4, 12),
          new THREE.MeshBasicMaterial({ color: st.accent, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
        );
        wall.rotation.y = Math.PI / 2;
        wall.position.set(toM(wx), 6, 0);
        this.stageGroup.add(wall);
      }
    }
  }

  /** Consume sim events for visual effects. */
  onEvents(events: SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case EvType.Hit:
          this.spawnSpark(toM(e.x), toM(e.y), 0.25 + e.a * 0.18, e.a >= 2 ? 0xffe066 : 0xffffff, 10 + e.a * 3);
          if (e.a >= 2) this.shake = Math.max(this.shake, 0.12 + (e.a - 2) * 0.12);
          break;
        case EvType.Shield:
          this.spawnSpark(toM(e.x), toM(e.y), 0.3, 0x7fd6ff, 8);
          break;
        case EvType.KO:
          this.spawnSpark(toM(e.x), toM(e.y), 2.5, 0xffffff, 30);
          this.shake = 0.5;
          break;
        case EvType.RoundKO:
          this.shake = 0.45;
          break;
        case EvType.ShieldBreak:
          this.spawnSpark(toM(e.x), toM(e.y) + 1, 1.2, 0x7fd6ff, 20);
          this.shake = 0.25;
          break;
        case EvType.Clash:
          this.shake = 0.2;
          break;
        case EvType.ClashEnd:
          this.spawnSpark(toM(e.x), toM(e.y), 2, 0xffffff, 24);
          this.shake = 0.4;
          break;
      }
    }
  }

  private spawnSpark(x: number, y: number, size: number, color: number, life: number): void {
    let sp = this.sparks.find((s) => s.life <= 0);
    if (!sp) sp = this.sparks[0];
    sp.life = sp.max = life;
    sp.size = size;
    sp.mesh.position.set(x, y, 0.8);
    sp.ring.position.set(x, y, 0.8);
    (sp.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    (sp.ring.material as THREE.MeshBasicMaterial).color.setHex(color);
    sp.mesh.rotation.z = Math.random() * Math.PI;
    sp.mesh.visible = sp.ring.visible = true;
  }

  render(prev: GameState, cur: GameState, alpha: number, dt: number): void {
    this.time += dt;
    const st = this.stage;
    const n = cur.fighters.length;
    if (this.models.length !== n) this.setup(cur);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < n; i++) {
      const f = cur.fighters[i];
      const p = prev.fighters[i] ?? f;
      const model = this.models[i];
      const def = FIGHTERS[f.char];
      const dead = f.act === Act.Dead && cur.mode === Mode.Platform;
      model.root.visible = !dead;
      model.shadow.visible = !dead;
      if (dead) continue;
      const teleport = Math.abs(f.x - p.x) > 2 * FX || Math.abs(f.y - p.y) > 2 * FX;
      const t = teleport ? 1 : alpha;
      let x = toM(lerp(p.x, f.x, t));
      const y = toM(lerp(p.y, f.y, t));
      if (f.hitlag > 0 && f.act === Act.Hitstun) x += Math.sin(this.time * 90) * 0.04;
      model.root.position.set(x, y, 0);
      model.root.rotation.y = f.facing > 0 ? 0 : Math.PI;

      fighterAnim(f, def, this.ref);
      let frame = this.ref.frame;
      if (p.act === f.act && p.move === f.move && p.actFrame !== f.actFrame && f.hitlag === 0) frame = f.actFrame - 1 + alpha;
      samplePoseF(this.ref.anim, Math.max(0, frame), this.rot, this.rootOff);
      applyPose(model, this.rot, this.rootOff);
      updateGlb(model, this.ref.clip, frame);

      // Invulnerability flicker, aura, shield
      const blink = f.invuln > 0 && f.act !== Act.LedgeHang && Math.floor(this.time * 20) % 2 === 0;
      model.body.visible = !blink || f.act === Act.Respawn;
      const auraOn = f.ex > 0 || (f.act === Act.Attack && f.charge > 0) || (cur.freeze > 0 && cur.freezeOwner === f.port);
      const ma = model.auraMat;
      ma.opacity = lerp(ma.opacity, auraOn ? 0.28 + Math.sin(this.time * 30) * 0.08 : f.ki >= 300 ? 0.08 : 0, 0.3);
      model.aura.visible = ma.opacity > 0.01;
      model.aura.scale.set(0.8 + Math.sin(this.time * 25) * 0.04, 1.35, 0.8);
      const shielding = f.act === Act.Shield || f.act === Act.ShieldStun;
      model.shield.visible = shielding;
      if (shielding) {
        const r = toM(def.stats.shieldSize) * (cur.mode === Mode.Versus ? 1 : 0.45 + 0.55 * (f.shieldHp / 5000));
        model.shield.scale.setScalar(r);
        model.shield.position.set(0, 0.95 * (def.stats.scale / 1000), 0);
      }

      // Blob shadow on the nearest platform below
      let groundY = -100;
      const nPlat = cur.mode === Mode.Versus ? 1 : st.platforms.length;
      for (let k = 0; k < nPlat; k++) {
        const pl = st.platforms[k];
        const py = toM(pl.y);
        if (x >= toM(pl.x1) && x <= toM(pl.x2) && py <= y + 0.05 && py > groundY) groundY = py;
      }
      model.shadow.visible = groundY > -100;
      if (groundY > -100) {
        model.shadow.position.set(x, groundY + 0.01, 0);
        const hgt = y - groundY;
        model.shadow.scale.setScalar(Math.max(0.3, 1 - hgt * 0.12));
      }

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + 1.8);
    }

    this.renderProjectiles(cur);
    this.updateSparks(dt);
    this.updateDebug(cur);
    this.updateCamera(cur, minX, maxX, minY, maxY, dt);
    this.renderer.render(this.scene, this.camera);
  }

  private renderProjectiles(s: GameState): void {
    let bi = 0;
    let mi = 0;
    for (const p of s.projectiles) {
      const def = FIGHTERS[p.char].moves[p.move].projectile!;
      const color = def.color;
      if (def.kind === ProjKind.Blast) {
        let m = this.blastPool[bi];
        if (!m) {
          m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
          const core = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
          m.add(core);
          this.blastPool.push(m);
          this.projGroup.add(m);
        }
        bi++;
        m.visible = true;
        (m.material as THREE.MeshBasicMaterial).color.setHex(color);
        const r = toM(def.r) * (1 + Math.sin(this.time * 40) * 0.08);
        m.scale.setScalar(r);
        m.position.set(toM(p.x), toM(p.y), 0.3);
      } else {
        let b = this.beamPool[mi];
        if (!b) {
          const mat = () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
          const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 14, 1, true), mat());
          body.rotation.z = Math.PI / 2;
          const core = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
          core.rotation.z = Math.PI / 2;
          const head = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat());
          b = { body, head, core };
          this.beamPool.push(b);
          this.projGroup.add(body, head, core);
        }
        mi++;
        const len = Math.max(0.05, toM(p.len));
        const r = toM(def.r) * (1 + Math.sin(this.time * 50) * 0.1) * (p.power > 100 ? 1.15 : 1);
        const cx = toM(p.x) + (p.facing * len) / 2;
        for (const part of [b.body, b.core]) {
          part.visible = true;
          part.position.set(cx, toM(p.y), 0.3);
          part.scale.set(part === b.core ? r : r, len, part === b.core ? r : r);
        }
        (b.body.material as THREE.MeshBasicMaterial).color.setHex(color);
        (b.head.material as THREE.MeshBasicMaterial).color.setHex(color);
        b.head.visible = true;
        b.head.scale.setScalar(r * 1.5);
        b.head.position.set(toM(p.x) + p.facing * len, toM(p.y), 0.3);
      }
    }
    for (let i = bi; i < this.blastPool.length; i++) this.blastPool[i].visible = false;
    for (let i = mi; i < this.beamPool.length; i++) {
      const b = this.beamPool[i];
      b.body.visible = b.head.visible = b.core.visible = false;
    }
    // Beam clash flare
    if (s.clash.active) {
      const pa = s.projectiles[s.clash.pa];
      this.clashFx.visible = true;
      this.clashFx.position.set(toM(s.clash.pos), pa ? toM(pa.y) : 1, 0.5);
      this.clashFx.scale.setScalar(0.9 + Math.sin(this.time * 60) * 0.3);
    } else this.clashFx.visible = false;
  }

  private updateSparks(dt: number): void {
    const step = dt * 60;
    for (const sp of this.sparks) {
      if (sp.life <= 0) continue;
      sp.life -= step;
      const t = 1 - sp.life / sp.max;
      const mat = sp.mesh.material as THREE.MeshBasicMaterial;
      const rmat = sp.ring.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 1 - t);
      rmat.opacity = Math.max(0, 0.8 - t);
      sp.mesh.scale.set(sp.size * (1 + t * 0.5), sp.size * 0.3 * (1 - t), 1);
      sp.ring.scale.setScalar(sp.size * (0.3 + t * 1.6));
      if (sp.life <= 0) sp.mesh.visible = sp.ring.visible = false;
    }
  }

  private updateDebug(s: GameState): void {
    this.hurtInst.visible = this.hitInst.visible = this.showBoxes;
    if (!this.showBoxes) return;
    let hu = 0;
    let hi = 0;
    const d = this.dummy;
    for (const f of s.fighters) {
      if (f.act === Act.Dead && s.mode === Mode.Platform) continue;
      const def = FIGHTERS[f.char];
      const j = fighterJoints(f, this.joints);
      const sc = def.stats.scale / 1000;
      for (const hc of HURTBOXES) {
        const ax = f.x + j.x[hc.a] * f.facing;
        const ay = f.y + j.y[hc.a];
        let bx: number;
        let by: number;
        if (hc.b >= 0) {
          bx = f.x + j.x[hc.b] * f.facing;
          by = f.y + j.y[hc.b];
        } else {
          const [px, py] = bonePoint(j, hc.a, hc.bx, hc.by);
          bx = f.x + px * f.facing;
          by = f.y + py;
        }
        const r = toM(hc.r) * sc;
        for (let k = 0; k <= 2 && hu < 200; k++) {
          d.position.set(toM(lerp(ax, bx, k / 2)), toM(lerp(ay, by, k / 2)), 1);
          d.scale.setScalar(r);
          d.updateMatrix();
          this.hurtInst.setMatrixAt(hu++, d.matrix);
        }
      }
      if (f.act === Act.Attack && f.move >= 0) {
        const mv = def.moves[f.move];
        for (const h of mv.hitboxes) {
          if (f.actFrame < h.start || f.actFrame > h.end || hi >= 64) continue;
          const [px, py] = bonePoint(j, h.bone, h.ox, h.oy);
          d.position.set(toM(f.x + px * f.facing), toM(f.y + py), 1.05);
          d.scale.setScalar(toM(h.r));
          d.updateMatrix();
          this.hitInst.setMatrixAt(hi++, d.matrix);
        }
      }
    }
    for (const p of s.projectiles) {
      const def = FIGHTERS[p.char].moves[p.move].projectile!;
      if (hi >= 64) break;
      const len = def.kind === ProjKind.Beam ? p.len : 0;
      const steps = Math.min(8, Math.max(1, Math.ceil(len / def.r)));
      for (let k = 0; k <= steps && hi < 64; k++) {
        d.position.set(toM(p.x + (p.facing * len * k) / steps), toM(p.y), 1.05);
        d.scale.setScalar(toM(def.r));
        d.updateMatrix();
        this.hitInst.setMatrixAt(hi++, d.matrix);
      }
    }
    this.hurtInst.count = hu;
    this.hitInst.count = hi;
    this.hurtInst.instanceMatrix.needsUpdate = true;
    this.hitInst.instanceMatrix.needsUpdate = true;
  }

  private updateCamera(s: GameState, minX: number, maxX: number, minY: number, maxY: number, dt: number): void {
    const st = this.stage;
    const versus = s.mode === Mode.Versus;
    if (!isFinite(minX)) {
      minX = -4;
      maxX = 4;
      minY = 0;
      maxY = 3;
    }
    const margin = versus ? 2.2 : 3;
    const width = Math.max(versus ? 7 : 9, maxX - minX + margin * 2);
    const height = Math.max(versus ? 4 : 5, maxY - minY + margin * 1.4);
    const fov = (this.camera.fov * Math.PI) / 180;
    const distH = height / 2 / Math.tan(fov / 2);
    const distW = width / 2 / (Math.tan(fov / 2) * this.camera.aspect);
    let dist = Math.min(versus ? 24 : 42, Math.max(distH, distW));
    let cx = (minX + maxX) / 2;
    let cy = (minY + maxY) / 2 + 0.4;
    const cb = st.camBounds;
    cx = THREE.MathUtils.clamp(cx, toM(cb.left) + 4, toM(cb.right) - 4);
    cy = THREE.MathUtils.clamp(cy, toM(cb.bottom) + 2, toM(cb.top) - 2);
    if (versus) cy = Math.max(cy, 1.8);

    // Super cinematic: zoom on the owner
    if (s.freeze > 0 && s.freezeOwner >= 0) {
      const o = s.fighters[s.freezeOwner];
      cx = toM(o.x) + o.facing * 0.6;
      cy = toM(o.y) + 1.2;
      dist = 6.5;
    }
    const target = new THREE.Vector3(cx, cy + dist * 0.05, dist);
    const k = 1 - Math.pow(s.freeze > 0 ? 0.0005 : 0.02, dt);
    this.camPos.lerp(target, k);
    this.camLook.lerp(new THREE.Vector3(cx, cy, 0), k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    this.camera.lookAt(this.camLook);
    this.bgFar.position.set(this.camPos.x * 0.85, this.camPos.y * 0.5, 0);
  }
}
