import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** 3-step ramp for cel shading. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const toonCache = new Map<string, THREE.MeshToonMaterial>();
export function toonMat(color: number, emissive = 0): THREE.MeshToonMaterial {
  const key = `${color}:${emissive}`;
  let m = toonCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), emissive });
    toonCache.set(key, m);
  }
  return m;
}

export const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x0b0b12, side: THREE.BackSide });

/** Mesh + inverted-hull outline child. */
export function outlined(geo: THREE.BufferGeometry, mat: THREE.Material, thickness = 0.022): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  const line = new THREE.Mesh(geo, OUTLINE_MAT);
  geo.computeBoundingSphere();
  const r = geo.boundingSphere ? geo.boundingSphere.radius : 0.2;
  const sc = 1 + thickness / Math.max(0.05, r);
  line.scale.setScalar(sc);
  line.renderOrder = -1;
  mesh.add(line);
  return mesh;
}
