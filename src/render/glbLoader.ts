// Optional GLB fighters: public/fighters/<id>/model.glb (auto-rigged, Mixamo skeleton).
// If present, the GLB is shown instead of the placeholder primitives. The placeholder skeleton keeps
// being posed (invisibly) from the sim and is retargeted onto the GLB bones by direction matching.
// If the GLB contains a clip whose name equals the current pose clip key ("idle", "walk", "move:FSmash", …)
// that clip drives the visuals instead. Hitboxes always come from the sim's code pose.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BONES, BONE_COUNT } from '../sim/skeleton';
import type { FighterModel } from './fighterModel';

interface Retarget {
  glbBone: THREE.Bone;
  /** R * Q_g_rest precomputed: rotation taking the placeholder rest frame to the glb bone's world rest. */
  restFix: THREE.Quaternion;
  pRestInv: THREE.Quaternion;
}

const retargets = new WeakMap<FighterModel, (Retarget | null)[]>();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpV = new THREE.Vector3();

function normName(n: string): string {
  return n.replace(/^mixamorig[:_]?/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function childDir(bone: THREE.Object3D, child: THREE.Object3D | undefined, out: THREE.Vector3): THREE.Vector3 {
  const a = bone.getWorldPosition(new THREE.Vector3());
  if (child) return out.copy(child.getWorldPosition(new THREE.Vector3())).sub(a).normalize();
  return out.set(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()));
}

export async function tryLoadGlb(id: string, model: FighterModel, heightM: number): Promise<boolean> {
  const url = `${import.meta.env.BASE_URL}fighters/${id}/model.glb`;
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok || !(head.headers.get('content-type') ?? '').match(/gltf|octet|model/)) return false;
  } catch {
    return false;
  }
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = gltf.scene;
  // Normalise height and face +X (Mixamo models face +Z).
  const box = new THREE.Box3().setFromObject(scene);
  const h = box.max.y - box.min.y || 1;
  scene.scale.setScalar(heightM / h);
  scene.rotation.y = Math.PI / 2;
  scene.position.y = -box.min.y * (heightM / h);

  const byName = new Map<string, THREE.Bone>();
  scene.traverse((o) => {
    if ((o as THREE.Bone).isBone) byName.set(normName(o.name), o as THREE.Bone);
    if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
  });
  const bones: (THREE.Bone | null)[] = BONES.map((b) => byName.get(normName(b.name)) ?? null);

  // Hide placeholder visuals, keep the bones.
  for (const b of model.bones) for (const c of b.children) if (!(c as THREE.Bone).isBone) c.visible = false;
  model.root.add(scene);
  // Measure both skeletons in their rest poses.
  for (let i = 0; i < BONE_COUNT; i++) {
    model.bones[i].rotation.set(0, 0, 0);
    model.bones[i].position.set(BONES[i].x, BONES[i].y, BONES[i].z);
  }
  const savedRot = model.root.rotation.y;
  model.root.rotation.y = 0;
  model.root.updateMatrixWorld(true);

  const list: (Retarget | null)[] = [];
  for (let i = 0; i < BONE_COUNT; i++) {
    const g = bones[i];
    if (!g) {
      list.push(null);
      continue;
    }
    const childIdx = BONES.findIndex((b) => b.parent === i);
    const pDir = childDir(model.bones[i], childIdx >= 0 ? model.bones[childIdx] : undefined, new THREE.Vector3());
    const gChild = childIdx >= 0 ? bones[childIdx] ?? undefined : undefined;
    const gDir = childDir(g, gChild, new THREE.Vector3());
    const R = new THREE.Quaternion().setFromUnitVectors(gDir, pDir);
    const gRest = g.getWorldQuaternion(new THREE.Quaternion());
    const pRestInv = model.bones[i].getWorldQuaternion(new THREE.Quaternion()).invert();
    list.push({ glbBone: g, restFix: R.multiply(gRest), pRestInv });
  }
  retargets.set(model, list);
  model.root.rotation.y = savedRot;

  const clips = new Map<string, THREE.AnimationClip>();
  for (const c of gltf.animations) clips.set(c.name, c);
  model.glb = { scene, bones, clips, mixer: clips.size ? new THREE.AnimationMixer(scene) : undefined };
  return true;
}

const lastClip = new WeakMap<FighterModel, THREE.AnimationAction>();

/** Called after the placeholder skeleton has been posed for this frame. */
export function updateGlb(model: FighterModel, clipKey: string, frame: number): void {
  const glb = model.glb;
  if (!glb) return;
  const clip = glb.clips.get(clipKey);
  if (clip && glb.mixer) {
    let action = lastClip.get(model);
    if (!action || action.getClip() !== clip) {
      action?.stop();
      action = glb.mixer.clipAction(clip);
      action.play();
      lastClip.set(model, action);
    }
    action.time = Math.min(clip.duration, frame / 60);
    glb.mixer.update(0);
    return;
  }
  lastClip.get(model)?.stop();
  lastClip.delete(model);
  const list = retargets.get(model);
  if (!list) return;
  model.root.updateMatrixWorld(true);
  for (let i = 0; i < BONE_COUNT; i++) {
    const r = list[i];
    if (!r) continue;
    // Q_g(t) = Q_p(t) * Q_p_rest^-1 * R * Q_g_rest
    model.bones[i].getWorldQuaternion(tmpQ);
    tmpQ.multiply(r.pRestInv).multiply(r.restFix);
    const parent = r.glbBone.parent!;
    parent.updateWorldMatrix(true, false);
    parent.getWorldQuaternion(tmpQ2).invert();
    r.glbBone.quaternion.copy(tmpQ2.multiply(tmpQ));
    r.glbBone.updateMatrixWorld(true);
  }
  void tmpV;
}
