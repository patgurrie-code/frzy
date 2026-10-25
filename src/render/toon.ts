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

/** Adds a fresnel rim light to a toon material (anime-style edge highlight). */
function addRim(m: THREE.MeshToonMaterial, strength: number): void {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.rimStrength = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float rimStrength;')
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 vd = normalize(vViewPosition);
          float rim = pow(1.0 - clamp(dot(normal, vd), 0.0, 1.0), 3.0);
          rim = smoothstep(0.35, 0.6, rim);
          outgoingLight += vec3(1.0, 0.96, 0.9) * rim * rimStrength;
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'toon-rim';
}

export function toonMat(color: number, emissive = 0, rim = 0): THREE.MeshToonMaterial {
  const key = `${color}:${emissive}:${rim}`;
  let m = toonCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), emissive });
    if (rim > 0) addRim(m, rim);
    toonCache.set(key, m);
  }
  return m;
}

const basicCache = new Map<number, THREE.MeshBasicMaterial>();
/** Unlit material (eyes, glowing bits). */
export function flatMat(color: number): THREE.MeshBasicMaterial {
  let m = basicCache.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    basicCache.set(color, m);
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
