// three.js renderer. Reads sim state (previous + current for interpolation); never mutates it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FX } from '../sim/fixed';
import { FIGHTERS } from '../sim/fighters';
import { STAGES, StageDef } from '../sim/stage';
import { Act, EvType, GameState, Mode, SimEvent } from '../sim/state';
import { ProjKind, FighterLook } from '../sim/defs';
import { PoseBlend, VisualPosition, damping } from './presentation';
import { fighterJoints } from '../sim/sim';
import { HURTBOXES, bonePoint, makeJoints } from '../sim/skeleton';
import { buildFighterModel, applyPose, FighterModel, setFlash, setExpression } from './fighterModel';
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
  private punch = 0; // camera punch-in on big hits
  private parts: { mesh: THREE.Mesh; vx: number; vy: number; life: number; max: number; w: number; len: number; kind: 'streak' | 'dust' }[] = [];
  private camPos = new THREE.Vector3(0, 3, 30);
  private camLook = new THREE.Vector3(0, 2, 0);
  private poses: PoseBlend[] = [];
  private positions: VisualPosition[] = [];
  private camTarget = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private stage: StageDef = STAGES[0];
  private time = 0;
  showBoxes = false;
  // Debug overlay
  private hurtInst: THREE.InstancedMesh;
  private hitInst: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private joints = makeJoints();
  private trails: { pts: THREE.Vector3[]; spare: THREE.Vector3[]; mesh: THREE.Mesh; geo: THREE.BufferGeometry; width: number }[] = [];
  private trailPoint = new THREE.Vector3();
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
  setup(s: GameState, looks: (Partial<FighterLook> | undefined)[] = []): void {
    for (const m of this.models) {
      this.scene.remove(m.root);
      this.scene.remove(m.shadow);
    }
    for (const t of this.trails) this.scene.remove(t.mesh);
    this.trails = s.fighters.map((f) => {
      const N = 10;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 2 * 3), 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(N * 2 * 4), 4));
      const idx: number[] = [];
      for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      geo.setIndex(idx);
      const col = new THREE.Color(looks[f.port]?.accent ?? FIGHTERS[f.char].look.accent);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: col.lerp(new THREE.Color(1, 1, 1), 0.45), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      );
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return { pts: [] as THREE.Vector3[], spare: Array.from({ length: 10 }, () => new THREE.Vector3()), mesh, geo, width: 0.15 };
    });
    this.models = s.fighters.map((f) => {
      const base = FIGHTERS[f.char];
      const def = looks[f.port] ? { ...base, look: { ...base.look, ...looks[f.port] } } : base;
      const m = buildFighterModel(def);
      this.scene.add(m.root);
      this.scene.add(m.shadow);
      void tryLoadGlb(def.id, m, 1.8 * (def.stats.scale / 1000)).catch(() => false);
      return m;
    });
    this.poses = s.fighters.map((f) => new PoseBlend(FIGHTERS[f.char]));
    this.positions = s.fighters.map(() => new VisualPosition());
    this.camLook.set(0, 2, 0);
    this.shake = this.punch = 0;
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
          new THREE.MeshBasicMaterial({ color: st.accent, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }),
        );
        wall.rotation.y = Math.PI / 2;
        wall.position.set(toM(wx), 6, 0);
        this.stageGroup.add(wall);
      }
    }
    this.batchStatic(this.stageGroup);
    this.batchStatic(this.bgFar);
  }

  /** Static stage meshes share materials: batch once at setup instead of submitting every tile/pillar. */
  private batchStatic(group: THREE.Group): void {
    group.updateMatrixWorld(true);
    const inverse = group.matrixWorld.clone().invert();
    const transform = new THREE.Matrix4();
    const batches = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; order: number }>();
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      let batch = batches.get(mesh.material);
      if (!batch) { batch = { geos: [], order: mesh.renderOrder }; batches.set(mesh.material, batch); }
      transform.multiplyMatrices(inverse, mesh.matrixWorld);
      batch.geos.push(mesh.geometry.clone().applyMatrix4(transform));
    });
    group.clear();
    for (const [mat, batch] of batches) {
      const geometry = mergeGeometries(batch.geos, false);
      if (!geometry) throw new Error('Incompatible static stage geometry');
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.renderOrder = batch.order;
      group.add(mesh);
      for (const g of batch.geos) g.dispose();
    }
  }

  /** Consume sim events for visual effects. */
  onEvents(events: SimEvent[], s?: GameState): void {
    for (const e of events) {
      switch (e.type) {
        case EvType.Hit: {
          const x = toM(e.x);
          const y = toM(e.y);
          const v = s && e.b >= 0 ? s.fighters[e.b] : undefined;
          const ang = v && (v.kbx !== 0 || v.kby !== 0) ? Math.atan2(v.kby, v.kbx) : Math.random() * Math.PI * 2;
          this.spawnSpark(x, y, 0.25 + e.a * 0.18, e.a >= 2 ? 0xffe066 : 0xffffff, 10 + e.a * 3, ang);
          // Directional impact streaks along the launch direction
          const n = 4 + e.a * 4;
          for (let i = 0; i < n; i++) {
            const a = ang + (Math.random() - 0.5) * (e.a >= 2 ? 0.9 : 1.6);
            const sp = 6 + Math.random() * 8 + e.a * 4;
            this.particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, e.a >= 2 ? 0xfff1a0 : 0xffffff, 0.05, 0.5 + e.a * 0.15, 10 + Math.random() * 8, 'streak');
          }
          if (e.a >= 1) this.punch = Math.max(this.punch, 0.35 + e.a * 0.25);
          if (e.a >= 1) this.shake = Math.max(this.shake, 0.05 + e.a * 0.1);
          break;
        }
        case EvType.Parry:
          this.spawnSpark(toM(e.x), toM(e.y), 0.9, 0x7fe8ff, 18);
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            this.particle(toM(e.x), toM(e.y), Math.cos(a) * 9, Math.sin(a) * 9, 0x9ff2ff, 0.05, 0.45, 14, 'streak');
          }
          this.shake = Math.max(this.shake, 0.15);
          this.punch = Math.max(this.punch, 0.6);
          break;
        case EvType.Burst:
          this.spawnSpark(toM(e.x), toM(e.y), 2.4, 0xfff1a8, 22);
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2;
            this.particle(toM(e.x), toM(e.y), Math.cos(a) * 11, Math.sin(a) * 11, 0xfff1a8, 0.07, 0.6, 16, 'streak');
          }
          this.shake = Math.max(this.shake, 0.3);
          this.punch = Math.max(this.punch, 0.8);
          break;
        case EvType.WallBounce:
          this.spawnSpark(toM(e.x), toM(e.y), 1.4, 0xffffff, 18, Math.PI / 2);
          this.shake = Math.max(this.shake, 0.35);
          break;
        case EvType.Launch:
          for (let i = 0; i < 10; i++) this.particle(toM(e.x) + (Math.random() - 0.5) * 0.4, toM(e.y), (Math.random() - 0.5) * 2, 10 + Math.random() * 6, 0xffffff, 0.04, 0.7, 14, 'streak');
          break;
        case EvType.CounterHit:
          this.spawnSpark(toM(e.x), toM(e.y), 1.1, 0xff4d4d, 16);
          break;
        case EvType.Tech:
        case EvType.Land:
        case EvType.Jump:
        case EvType.Dodge:
          if (e.type === EvType.Dodge && e.b !== 1) break;
          for (let i = 0; i < (e.type === EvType.Land ? 5 : 4); i++) {
            const dir = i % 2 ? 1 : -1;
            this.particle(toM(e.x) + dir * 0.15, toM(e.y) + 0.08, dir * (1 + Math.random() * 1.5), 0.4 + Math.random() * 0.6, 0xd8d4cc, 0.12, 0.18, 20 + Math.random() * 10, 'dust');
          }
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

  private particle(x: number, y: number, vx: number, vy: number, color: number, w: number, len: number, life: number, kind: 'streak' | 'dust'): void {
    let p: (typeof this.parts)[number] | undefined;
    for (const q of this.parts) if (q.life <= 0 && q.kind === kind) { p = q; break; }
    if (!p) {
      if (this.parts.length > 160) return;
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        depthWrite: false,
        blending: kind === 'streak' ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const geo = kind === 'streak' ? new THREE.PlaneGeometry(1, 1) : new THREE.CircleGeometry(1, 10);
      p = { mesh: new THREE.Mesh(geo, mat), vx: 0, vy: 0, life: 0, max: 1, w, len, kind };
      p.mesh.frustumCulled = false;
      this.scene.add(p.mesh);
      this.parts.push(p);
    }
    (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    p.mesh.position.set(x, y, 0.9);
    p.vx = vx;
    p.vy = vy;
    p.life = p.max = life;
    p.w = w;
    p.len = len;
    p.mesh.visible = true;
  }

  private updateParticles(dt: number): void {
    const step = dt * 60;
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= step;
      const t = 1 - p.life / p.max;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      if (p.kind === 'streak') {
        p.vx *= Math.exp(-dt * 6);
        p.vy *= Math.exp(-dt * 6);
        p.mesh.rotation.z = Math.atan2(p.vy, p.vx);
        p.mesh.scale.set(p.len * (1 - t * 0.6), p.w * (1 - t), 1);
        mat.opacity = 1 - t;
      } else {
        p.vx *= Math.exp(-dt * 3);
        p.vy *= Math.exp(-dt * 2);
        p.mesh.scale.setScalar(p.w + t * 0.25);
        mat.opacity = 0.45 * (1 - t);
      }
      if (p.life <= 0) p.mesh.visible = false;
    }
  }

  private spawnSpark(x: number, y: number, size: number, color: number, life: number, angle = Math.random() * Math.PI): void {
    let sp = this.sparks[0];
    for (const q of this.sparks) if (q.life <= 0) { sp = q; break; }
    sp.life = sp.max = life;
    sp.size = size;
    sp.mesh.position.set(x, y, 0.8);
    sp.ring.position.set(x, y, 0.8);
    (sp.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    (sp.ring.material as THREE.MeshBasicMaterial).color.setHex(color);
    sp.mesh.rotation.z = angle;
    sp.mesh.visible = sp.ring.visible = true;
  }

  render(prev: GameState, cur: GameState, alpha: number, dt: number): void {
    dt = Math.max(0, Math.min(dt, 0.1));
    alpha = Math.max(0, Math.min(alpha, 1));
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
      const reset = teleport || p.act === Act.Dead || f.act === Act.Respawn && p.act !== Act.Respawn;
      const position = this.positions[i];
      position.sample(p, f, cur.frame, t, dt, reset);
      let x = position.x;
      const y = position.y;
      if (f.hitlag > 0 && f.act === Act.Hitstun) x += Math.sin(this.time * 90) * 0.04;
      model.root.position.set(x, y, 0);
      // 3/4 view: turn the model a little towards the camera (render-only) so faces and outfits read.
      const yaw = 0.42;
      const targetYaw = f.facing > 0 ? -yaw : Math.PI + yaw;
      const cy = model.root.rotation.y;
      let dy = targetYaw - cy;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      model.root.rotation.y = Math.abs(dy) < 0.01 || dt === 0 ? targetYaw : cy + dy * damping(30, dt);

      const pose = this.poses[i];
      const ref = pose.sample(p, f, def, alpha, dt, cur.phase, cur.phaseTimer, prev.phaseTimer, reset);
      applyPose(model, pose.rot, pose.root);
      updateGlb(model, ref.clip, ref.frame);
      model.root.updateMatrixWorld(true);
      for (const d of model.dangles) d.update(dt, model.root);

      // Invulnerability flicker, aura, shield
      const blink = f.invuln > 0 && f.act !== Act.LedgeHang && Math.floor(this.time * 20) % 2 === 0;
      const mvDef = f.act === Act.Attack && f.move >= 0 ? def.moves[f.move] : undefined;
      const vanished = !!mvDef?.vanish && f.actFrame >= mvDef.vanish[0] && f.actFrame <= mvDef.vanish[1];
      model.body.visible = (!blink || f.act === Act.Respawn) && !vanished;
      const auraOn = f.ex > 0 || f.act === Act.KiCharge || (f.act === Act.Attack && f.charge > 0) || (cur.freeze > 0 && cur.freezeOwner === f.port);
      const au = model.auraU;
      const charging = f.act === Act.KiCharge;
      const target = auraOn ? (charging ? 1.0 : 0.75) : f.ki >= 300 ? 0.22 : 0;
      au.uOpacity.value = lerp(au.uOpacity.value, target, damping(10, dt));
      au.uTime.value = this.time * (charging ? 1.6 : 1);
      model.aura.visible = au.uOpacity.value > 0.01;
      const pulse = charging ? 1.1 + Math.sin(this.time * 20) * 0.05 : 1;
      model.aura.scale.set(0.9 * pulse, 1.6 * pulse, 0.9 * pulse);
      // Hit flash (white on impact) and super glow
      const hitFlash = f.act === Act.Hitstun && f.hitlag > 0 ? Math.min(1, f.hitlag / 8) * 0.85 : 0;
      const superGlow = cur.freeze > 0 && cur.freezeOwner === f.port ? 0.35 + Math.sin(this.time * 25) * 0.15 : 0;
      const parryGlow = f.invuln > 0 && f.act === Act.Attack ? 0.15 : 0;
      setFlash(model, Math.max(hitFlash, superGlow, parryGlow));
      // Expressions: hurt when hit, shout while attacking/charging/super, random blinks otherwise
      let expr: 'normal' | 'hurt' | 'shout' | 'blink' = 'normal';
      const hurt = f.act === Act.Hitstun || f.act === Act.Dizzy || f.act === Act.Grabbed || f.act === Act.Dead || (f.act === Act.Land && f.landLag >= 20);
      if (hurt) expr = 'hurt';
      else if (f.act === Act.KiCharge || f.act === Act.Beam || (cur.freeze > 0 && cur.freezeOwner === f.port)) expr = 'shout';
      else if (f.act === Act.Attack && f.move >= 0) {
        const mv = def.moves[f.move];
        if (mv.projectile || f.charge > 0) expr = 'shout';
        else for (const h of mv.hitboxes) if (f.actFrame >= h.start - 2 && f.actFrame <= h.end + 2) { expr = 'shout'; break; }
      }
      if (expr === 'normal') {
        model.blinkAt -= dt;
        if (model.blinkAt < 0) {
          expr = 'blink';
          if (model.blinkAt < -0.12) model.blinkAt = 2 + Math.random() * 3.5;
        }
      }
      setExpression(model, expr);
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

    this.updateTrails(cur);
    this.renderProjectiles(prev, cur, alpha);
    this.updateSparks(dt);
    this.updateParticles(dt);
    this.updateDebug(cur);
    this.updateCamera(cur, minX, maxX, minY, maxY, dt);
    this.renderer.render(this.scene, this.camera);
  }

  private renderProjectiles(prev: GameState, s: GameState, alpha: number): void {
    let bi = 0;
    let mi = 0;
    for (const p of s.projectiles) {
      const def = FIGHTERS[p.char].moves[p.move].projectile!;
      const color = def.color;
      // Match by lifetime as projectile arrays compact after hits/despawns.
      let old: (typeof prev.projectiles)[number] | undefined;
      for (const q of prev.projectiles) {
        if (q.owner === p.owner && q.move === p.move && q.char === p.char && q.facing === p.facing &&
          (q.life === p.life + 1 || q.clash && p.clash && q.life === p.life)) { old = q; break; }
      }
      const x = old ? lerp(old.x, p.x, alpha) : p.x;
      const y = old ? lerp(old.y, p.y, alpha) : p.y;
      const beamLen = old ? lerp(old.len, p.len, alpha) : p.len;
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
        m.position.set(toM(x), toM(y), 0.3);
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
        const len = Math.max(0.05, toM(beamLen));
        const r = toM(def.r) * (1 + Math.sin(this.time * 50) * 0.1) * (p.power > 100 ? 1.15 : 1);
        const cx = toM(x) + (p.facing * len) / 2;
        for (const part of [b.body, b.core]) {
          part.visible = true;
          part.position.set(cx, toM(y), 0.3);
          part.scale.set(part === b.core ? r : r, len, part === b.core ? r : r);
        }
        (b.body.material as THREE.MeshBasicMaterial).color.setHex(color);
        (b.head.material as THREE.MeshBasicMaterial).color.setHex(color);
        b.head.visible = true;
        b.head.scale.setScalar(r * 1.5);
        b.head.position.set(toM(x) + p.facing * len, toM(y), 0.3);
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

  /** Swoosh ribbons that follow each attack's (first) active hitbox. */
  private updateTrails(s: GameState): void {
    for (let i = 0; i < this.trails.length; i++) {
      const tr = this.trails[i];
      const f = s.fighters[i];
      let added = false;
      if (f && f.act === Act.Attack && f.move >= 0 && s.freeze === 0) {
        const mv = FIGHTERS[f.char].moves[f.move];
        let h: (typeof mv.hitboxes)[number] | undefined;
        for (const hb of mv.hitboxes) if (hb.kind === 0 && f.actFrame >= hb.start - 1 && f.actFrame <= hb.end + 2) { h = hb; break; }
        if (h) {
          // Follow the rendered (interpolated, crossfaded) limb rather than the tick-rate sim joint, so arcs stay
          // smooth at any refresh rate and match what's on screen. Hitbox offsets are unscaled; bones live in the
          // body group's scaled space.
          const model = this.models[i];
          const k = 1 / (FX * model.body.scale.x);
          const p = model.bones[h.bone].localToWorld(this.trailPoint.set(h.ox * k, h.oy * k, 0));
          p.z += 0.1;
          const last = tr.pts[tr.pts.length - 1];
          if (!last || last.distanceToSquared(p) > 0.0004) {
            const point = tr.spare.pop() ?? tr.pts.shift()!;
            tr.pts.push(point.copy(p));
            tr.width = toM(h.r) * 1.1;
            added = true;
          }
        }
      }
      if (!added && tr.pts.length) tr.spare.push(tr.pts.shift()!);
      const pos = tr.geo.attributes.position as THREE.BufferAttribute;
      const col = tr.geo.attributes.color as THREE.BufferAttribute;
      const n = tr.pts.length;
      for (let k = 0; k < 10; k++) {
        const p = tr.pts[Math.min(k, n - 1)];
        if (!p || n < 2) {
          pos.setXYZ(k * 2, 0, -100, 0);
          pos.setXYZ(k * 2 + 1, 0, -100, 0);
          continue;
        }
        const a = tr.pts[Math.max(0, Math.min(k, n - 1) - 1)];
        const b = tr.pts[Math.min(n - 1, Math.min(k, n - 1) + 1)];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const t = Math.min(k, n - 1) / Math.max(1, n - 1); // 0 = oldest
        const w = tr.width * t;
        pos.setXYZ(k * 2, p.x - (dy / len) * w, p.y + (dx / len) * w, p.z);
        pos.setXYZ(k * 2 + 1, p.x + (dy / len) * w, p.y - (dx / len) * w, p.z);
        col.setXYZW(k * 2, 1, 1, 1, t * 0.9);
        col.setXYZW(k * 2 + 1, 1, 1, 1, t * 0.9);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }
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
    const target = this.camTarget.set(cx, cy + dist * 0.05, dist);
    const k = 1 - Math.pow(s.freeze > 0 ? 0.0005 : 0.02, dt);
    this.camPos.lerp(target, k);
    this.camLook.lerp(this.lookTarget.set(cx, cy, 0), k);
    this.camera.position.copy(this.camPos);
    if (this.punch > 0) {
      // Punch-in: snap the camera slightly towards the action, then ease back out
      this.camera.position.lerp(this.camLook, this.punch * 0.08);
      this.punch = this.punch < 0.01 ? 0 : this.punch * (1 - damping(7, dt));
    }
    if (this.shake > 0) {
      // Smooth pseudo-noise (sum of incommensurate sines) instead of per-frame random jumps:
      // reads as a rumble at any refresh rate and never strobes.
      const t = this.time;
      this.camera.position.x += (Math.sin(t * 53.1) + Math.sin(t * 31.7 + 1.3)) * 0.3 * this.shake;
      this.camera.position.y += (Math.sin(t * 47.3 + 2.1) + Math.sin(t * 27.9 + 0.4)) * 0.3 * this.shake;
      this.shake = this.shake < 0.005 ? 0 : this.shake * (1 - damping(5, dt));
    }
    this.camera.lookAt(this.camLook);
    this.bgFar.position.set(this.camPos.x * 0.85, this.camPos.y * 0.5, 0);
  }
}
