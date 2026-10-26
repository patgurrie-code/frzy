// Character "kit": a small modelling toolkit for the procedural fighters.
// Parts are authored in each bone's local space, then merged per (bone, material) into one mesh, plus one
// inflated-hull outline mesh per bone — so a detailed character costs ~2 draw calls per bone.
// Dangles (scarves, capes, hair, coat tails) are separate chains with render-only secondary motion.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BONES } from '../sim/skeleton';
import { OUTLINE_MAT } from './toon';

export interface PartOpts {
  pos?: [number, number, number];
  rot?: [number, number, number]; // radians, XYZ
  scale?: [number, number, number] | number;
  /** Outline thickness in metres (0 = no outline). */
  line?: number;
}

/** Push every vertex out along its normal (inverted-hull outline). */
function inflate(geo: THREE.BufferGeometry, t: number): THREE.BufferGeometry {
  const g = geo.clone();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) + nrm.getX(i) * t, pos.getY(i) + nrm.getY(i) * t, pos.getZ(i) + nrm.getZ(i) * t);
  }
  return g;
}

function normalise(g: THREE.BufferGeometry): THREE.BufferGeometry {
  // mergeGeometries needs identical attribute sets and indexing on every part.
  if (!g.index) {
    const idx: number[] = [];
    for (let i = 0; i < g.attributes.position.count; i++) idx.push(i);
    g.setIndex(idx);
  }
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

export class Kit {
  private parts = new Map<THREE.Object3D, { geo: THREE.BufferGeometry; mat: THREE.Material }[]>();
  private lines = new Map<THREE.Object3D, THREE.BufferGeometry[]>();
  readonly dangles: Dangle[] = [];
  /** Expression groups created by the design (render swaps visibility). */
  faces?: { normal: THREE.Object3D; hurt: THREE.Object3D; shout: THREE.Object3D; blink: THREE.Object3D };

  constructor(readonly bones: THREE.Bone[], readonly lineScale = 1) {}

  /** Add a geometry to a bone (or any object), transformed by opts. */
  add(target: THREE.Object3D | number, geo: THREE.BufferGeometry, mat: THREE.Material, o: PartOpts = {}): void {
    const obj = typeof target === 'number' ? this.bones[target] : target;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot ?? [0, 0, 0])));
    const sc = o.scale === undefined ? [1, 1, 1] : typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] : o.scale;
    m.compose(new THREE.Vector3(...(o.pos ?? [0, 0, 0])), q, new THREE.Vector3(sc[0], sc[1], sc[2]));
    const g = normalise(geo.clone());
    // Outline is inflated before transforming so thickness stays uniform under non-uniform scale (approximately).
    const line = o.line === undefined ? 0.018 : o.line;
    if (line > 0) {
      const lg = inflate(g, line * this.lineScale / Math.max(0.5, Math.min(sc[0], sc[1], sc[2])));
      lg.applyMatrix4(m);
      if (!this.lines.has(obj)) this.lines.set(obj, []);
      this.lines.get(obj)!.push(lg);
    }
    g.applyMatrix4(m);
    if (!this.parts.has(obj)) this.parts.set(obj, []);
    this.parts.get(obj)!.push({ geo: g, mat });
  }

  /** Tapered limb from a bone's joint to its child joint, with a rounded joint ball. */
  limb(bone: number, child: number, r1: number, r2: number, mat: THREE.Material, o: { bulge?: number; line?: number } = {}): void {
    const c = BONES[child];
    const dir = new THREE.Vector3(c.x, c.y, 0);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(r2, r1, len, 10, 3);
    // Muscle bulge: widen the middle ring(s)
    if (o.bulge) {
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) / len + 0.5; // 0 bottom .. 1 top
        const k = 1 + o.bulge * Math.sin(Math.PI * Math.min(1, Math.max(0, (y - 0.1) / 0.8)));
        p.setX(i, p.getX(i) * k);
        p.setZ(i, p.getZ(i) * k);
      }
      geo.computeVertexNormals();
    }
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    this.add(bone, geo, mat, { pos: [dir.x / 2, dir.y / 2, 0], rot: [e.x, e.y, e.z], line: o.line });
    this.add(bone, new THREE.SphereGeometry(r1 * 1.02, 10, 8), mat, { line: o.line });
  }

  box(target: THREE.Object3D | number, size: [number, number, number], mat: THREE.Material, o: PartOpts & { round?: number } = {}): void {
    const r = Math.min(o.round ?? 0.025, Math.min(...size) / 2 - 0.001);
    this.add(target, new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.max(0.001, r)), mat, o);
  }

  sphere(target: THREE.Object3D | number, r: number, mat: THREE.Material, o: PartOpts = {}): void {
    this.add(target, new THREE.SphereGeometry(r, 14, 10), mat, o);
  }

  cone(target: THREE.Object3D | number, r: number, h: number, mat: THREE.Material, o: PartOpts & { seg?: number } = {}): void {
    this.add(target, new THREE.ConeGeometry(r, h, o.seg ?? 6), mat, o);
  }

  cyl(target: THREE.Object3D | number, r1: number, r2: number, h: number, mat: THREE.Material, o: PartOpts & { seg?: number } = {}): void {
    this.add(target, new THREE.CylinderGeometry(r2, r1, h, o.seg ?? 10), mat, o);
  }

  /** Lathe solid from a (radius, y) profile, optionally flattened in depth. */
  lathe(target: THREE.Object3D | number, profile: [number, number][], mat: THREE.Material, o: PartOpts & { depth?: number } = {}): void {
    const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y));
    const geo = new THREE.LatheGeometry(pts, 14);
    const d = o.depth ?? 0.72;
    const sc = o.scale === undefined ? [1, 1, d] : typeof o.scale === 'number' ? [o.scale, o.scale, o.scale * d] : [o.scale[0], o.scale[1], o.scale[2] * d];
    this.add(target, geo, mat, { ...o, scale: sc as [number, number, number] });
  }

  /** A chain of swinging segments hanging from `target` at `pos`. Each segment gets a mesh built by `make`. */
  dangle(
    target: THREE.Object3D | number,
    pos: [number, number, number],
    seg: number,
    len: number,
    make: (k: Kit, holder: THREE.Object3D, i: number, len: number) => void,
    o: DangleOpts = {},
  ): Dangle {
    const parent = typeof target === 'number' ? this.bones[target] : target;
    const d = new Dangle(parent, pos, seg, len, o);
    for (let i = 0; i < seg; i++) make(this, d.holders[i], i, len);
    this.dangles.push(d);
    return d;
  }

  /** Merge everything into meshes. Call once after authoring. */
  build(): void {
    for (const [obj, list] of this.parts) {
      const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
      for (const p of list) {
        if (!byMat.has(p.mat)) byMat.set(p.mat, []);
        byMat.get(p.mat)!.push(p.geo);
      }
      for (const [mat, geos] of byMat) {
        const merged = mergeGeometries(geos, false);
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, mat);
        mesh.frustumCulled = false;
        obj.add(mesh);
      }
    }
    for (const [obj, geos] of this.lines) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, OUTLINE_MAT);
      mesh.renderOrder = -1;
      mesh.frustumCulled = false;
      obj.add(mesh);
    }
    this.parts.clear();
    this.lines.clear();
  }
}

export interface DangleOpts {
  /** How fast the chain follows (higher = stiffer). */
  stiffness?: number;
  /** How much motion drags the chain backwards. */
  drag?: number;
  /** Constant bias in character space (x = backwards, y = down, z = towards camera). */
  bias?: [number, number, number];
  /** Rest direction weight for gravity. */
  gravity?: number;
  /** Idle flutter amplitude. */
  flutter?: number;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const tmpV = new THREE.Vector3();

/** Render-only secondary motion chain (never affects gameplay). */
export class Dangle {
  readonly anchor = new THREE.Group();
  readonly holders: THREE.Group[] = [];
  private dirs: THREE.Vector3[] = [];
  private prev: THREE.Vector3[] = [];
  private t = Math.random() * 10;
  private initialized = false;
  private velocity = new THREE.Vector3();
  private bias = new THREE.Vector3();
  private want = new THREE.Vector3();
  private parentDown = new THREE.Vector3();
  private rootQ = new THREE.Quaternion();
  private parentQ = new THREE.Quaternion();
  private deltaQ = new THREE.Quaternion();
  private o: Required<DangleOpts>;

  constructor(parent: THREE.Object3D, pos: [number, number, number], seg: number, readonly len: number, o: DangleOpts) {
    this.o = { stiffness: 10, drag: 0.08, bias: [0.35, 0, 0], gravity: 1, flutter: 0.12, ...o };
    this.anchor.position.set(...pos);
    parent.add(this.anchor);
    let p: THREE.Object3D = this.anchor;
    for (let i = 0; i < seg; i++) {
      const g = new THREE.Group();
      if (i > 0) g.position.y = -len;
      p.add(g);
      this.holders.push(g);
      this.dirs.push(new THREE.Vector3(0, -1, 0));
      this.prev.push(new THREE.Vector3());
      p = g;
    }
  }

  /** `facing` = ±1, `root` = the fighter root (character space). */
  update(dt: number, root: THREE.Object3D): void {
    if (dt <= 0) return;
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const o = this.o;
    root.updateWorldMatrix(true, false);
    const rootQ = root.getWorldQuaternion(this.rootQ);
    const k = 1 - Math.exp(-o.stiffness * dt);
    for (let i = 0; i < this.holders.length; i++) {
      const h = this.holders[i];
      const wp = h.getWorldPosition(tmpV.set(0, 0, 0));
      const vel = this.velocity.copy(wp).sub(this.prev[i]).divideScalar(Math.max(dt, 1 / 240));
      if (!this.initialized || wp.distanceToSquared(this.prev[i]) > 4) vel.set(0, 0, 0);
      this.prev[i].copy(wp);
      if (vel.lengthSq() > 400) vel.setLength(20);
      // Desired hanging direction: gravity + drag opposite to motion + character-space bias + flutter.
      const bias = this.bias.set(-o.bias[0], -o.bias[1], o.bias[2]).applyQuaternion(rootQ);
      const flutter = Math.sin(this.t * 3.1 + i * 1.3) * o.flutter;
      const want = this.want.copy(DOWN)
        .multiplyScalar(o.gravity)
        .addScaledVector(vel, -o.drag)
        .add(bias)
        .add(tmpV.set(0, 0, flutter).applyQuaternion(rootQ));
      if (want.lengthSq() < 1e-6) want.copy(DOWN);
      want.normalize();
      this.dirs[i].lerp(want, k).normalize();
      // Orient holder so its local -Y points along dir (in world), then convert to parent space.
      // Keep the parent's twist: rotate the parent's down axis onto dir, on top of the parent orientation.
      const parent = h.parent!;
      parent.updateWorldMatrix(true, false);
      const pq = parent.getWorldQuaternion(this.parentQ);
      const pd = this.parentDown.copy(DOWN).applyQuaternion(pq);
      const delta = this.deltaQ.setFromUnitVectors(pd, this.dirs[i]);
      const wq = delta.multiply(pq);
      h.quaternion.copy(pq.invert().multiply(wq));
      h.updateWorldMatrix(false, false);
    }
    this.initialized = true;
  }
}
