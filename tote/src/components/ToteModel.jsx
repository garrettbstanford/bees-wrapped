import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Euler, Mesh, PlaneGeometry, Raycaster, Vector3 } from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { toteConfig } from '../config/toteConfig.js';
import { patches } from '../data/patches.js';
import { prepareModel } from '../lib/model.js';
import { createPlaceholderTote } from '../lib/createPlaceholderTote.js';
import { getPatchPlacement } from '../lib/placements.js';
import { loadPatchTexture } from '../lib/patchTextures.js';
import { sharpenPatchShader } from '../lib/patchMaterial.js';

useGLTF.preload(toteConfig.model.path);
patches.forEach(patch => loadPatchTexture(patch.image));
const bagLogo = { id: 'bag-logo', image: toteConfig.wordmark, placement: toteConfig.logoPlacement };
loadPatchTexture(bagLogo.image);

function Patch({ patch, index, count, target, onUnavailable }) {
  const invalidate = useThree(state => state.invalidate);
  const [texture, setTexture] = useState(null);
  useEffect(() => {
    let active = true;
    loadPatchTexture(patch.image).then(value => {
      if (!active) return;
      setTexture(value);
      if (!value) onUnavailable?.(patch.id);
    });
    return () => { active = false; };
  }, [patch.id, patch.image, onUnavailable]);
  const geometry = useMemo(() => {
    const placement = getPatchPlacement(patch, index, count);
    const position = new Vector3(...placement.position);
    const rotation = new Euler(...placement.rotation);
    const size = new Vector3(...placement.scale);
    // Fit a non-square PNG inside the slot without stretching its artwork.
    const aspect = texture ? texture.image.width / texture.image.height : 1;
    if (aspect > 1) size.y /= aspect; else size.x *= aspect;
    const outward = new Vector3(0, 0, 1).applyEuler(rotation);
    const ray = new Raycaster(position.clone().addScaledVector(outward, 5), outward.clone().negate());
    const hit = ray.intersectObject(target, false)[0];
    if (hit) position.copy(hit.point);
    let decal = new DecalGeometry(target, position, rotation, size);
    if (!decal.attributes.position.count) {
      // Thin plane is a safe fallback for a replacement GLB with incompatible topology.
      decal.dispose(); decal = new PlaneGeometry(size.x, size.y);
      const plane = new Mesh(decal); plane.rotation.copy(rotation);
      plane.position.copy(position).addScaledVector(outward, toteConfig.patchPlacement.surfaceOffset);
      plane.updateMatrix(); decal.applyMatrix4(plane.matrix);
    } else {
      const positions = decal.attributes.position, normals = decal.attributes.normal;
      for (let i = 0; i < positions.count; i++) {
        positions.setXYZ(i, positions.getX(i) + normals.getX(i) * toteConfig.patchPlacement.surfaceOffset,
          positions.getY(i) + normals.getY(i) * toteConfig.patchPlacement.surfaceOffset,
          positions.getZ(i) + normals.getZ(i) * toteConfig.patchPlacement.surfaceOffset);
      }
      positions.needsUpdate = true;
    }
    return decal;
  }, [patch, index, count, target, texture]);
  // Texture promises resolve outside Fiber's render loop. Draw after the new
  // texture and projected geometry have actually committed to the scene.
  useLayoutEffect(() => { invalidate(); }, [geometry, texture, invalidate]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (!texture) return null;
  return <mesh geometry={geometry} renderOrder={2}>
    <meshStandardMaterial map={texture} transparent alphaTest={0.08} roughness={0.9}
      onBeforeCompile={sharpenPatchShader}
      polygonOffset polygonOffsetFactor={-4} depthWrite={false} />
  </mesh>;
}

function ModelContent({ source, selected, onUnavailable, onReady }) {
  const invalidate = useThree(state => state.invalidate);
  const model = useMemo(() => prepareModel(source), [source]);
  const activePatches = patches.filter(patch => selected.includes(patch.id));
  useEffect(() => { onReady(model.automaticTarget); return () => model.dispose(); }, [model, onReady]);
  // Removed meshes have already lost their Fiber parent and may not request a
  // frame themselves. This also covers clearing the very last selected patch.
  useLayoutEffect(() => { invalidate(); }, [selected, model, invalidate]);
  return <group>
    <primitive object={model.scene} />
    <Patch patch={bagLogo} index={0} count={1} target={model.target} />
    {activePatches.map((patch, index) => <Patch key={patch.id} patch={patch} index={index}
      count={activePatches.length} target={model.target} onUnavailable={onUnavailable} />)}
  </group>;
}

export function FallbackTote(props) {
  const source = useMemo(createPlaceholderTote, []);
  useEffect(() => () => {
    const materials = new Set();
    source.traverse(node => { node.geometry?.dispose(); if (node.material) materials.add(node.material); });
    materials.forEach(material => material.dispose());
  }, [source]);
  return <ModelContent source={source} {...props} />;
}

export default function ToteModel(props) {
  const { scene } = useGLTF(toteConfig.model.path);
  return <ModelContent source={scene} {...props} />;
}
