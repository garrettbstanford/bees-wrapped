import * as THREE from 'three';
import { toteConfig } from '../config/toteConfig.js';

let fabric;
function fabricTexture() {
  if (fabric) return fabric;
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const value = 155 + 45 * Math.sin(x * Math.PI / 2) * Math.cos(y * Math.PI / 2)
      + 14 * Math.sin(x * 7.13 + y * 19.17);
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255;
  }
  fabric = new THREE.DataTexture(data, size, size);
  fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping;
  fabric.repeat.set(20, 12); fabric.needsUpdate = true;
  return fabric;
}

export function prepareModel(source) {
  const config = toteConfig.model;
  const rotated = new THREE.Group();
  rotated.rotation.fromArray(config.rotation);
  rotated.add(source.clone(true)); rotated.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rotated);
  if (box.isEmpty()) throw new Error('The model contains no visible geometry.');
  const center = box.getCenter(new THREE.Vector3());
  const scale = config.height / Math.max(box.getSize(new THREE.Vector3()).y, 0.001);
  const transform = new THREE.Matrix4().makeScale(scale, scale, scale)
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  const scene = new THREE.Group(), candidates = [], ownedMaterials = new Set();
  const materialCache = new Map();
  rotated.traverse(node => {
    if (!node.isMesh) return;
    const geometry = node.geometry.clone().applyMatrix4(transform.clone().multiply(node.matrixWorld));
    const material = (Array.isArray(node.material) ? node.material : [node.material]).map(original => {
      if (materialCache.has(original)) return materialCache.get(original);
      const copy = original.clone(); ownedMaterials.add(copy); materialCache.set(original, copy);
      const strap = config.strapMaterialNames.includes(original.name) || /strap|handle|webbing/i.test(node.name + original.name);
      const body = config.bodyMaterialNames.includes(original.name) || !strap;
      if (config.recolor && copy.color && (body || strap)) {
        copy.color.set(strap ? config.colors.straps : config.colors.body);
        copy.map = null; copy.metalness = 0; copy.roughness = strap ? 0.92 : 0.98;
      }
      if (!copy.bumpMap && !copy.normalMap) { copy.bumpMap = fabricTexture(); copy.bumpScale = strap ? 0.012 : 0.022; }
      copy.side = THREE.DoubleSide;
      return copy;
    });
    const mesh = new THREE.Mesh(geometry, material.length === 1 ? material[0] : material);
    mesh.name = node.name; mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    if (!/strap|handle|webbing/i.test(node.name)) candidates.push(mesh);
  });
  scene.updateMatrixWorld(true);
  const exact = candidates.find(mesh => config.bodyMeshNames.includes(mesh.name));
  candidates.sort((a, b) => {
    const area = m => { m.geometry.computeBoundingBox(); const s = m.geometry.boundingBox.getSize(new THREE.Vector3()); return s.x * s.y; };
    return area(b) - area(a);
  });
  const target = exact || candidates[0] || scene.children[0];
  if (!target) throw new Error('The model contains no usable meshes.');
  return { scene, target, automaticTarget: !exact, dispose() {
    scene.traverse(node => node.geometry?.dispose()); ownedMaterials.forEach(m => m.dispose());
  } };
}
