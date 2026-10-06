import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { Box3, Euler, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { prepareModel } from '../tote/src/lib/model.js';
import { getPatchPlacement } from '../tote/src/lib/placements.js';
import { patches } from '../tote/src/data/patches.js';
import { toteConfig } from '../tote/src/config/toteConfig.js';
import { constrainPan, frameCamera, panCamera } from '../tote/src/lib/camera.js';

async function loadModel() {
  const bytes = await readFile(new URL('../tote/public/models/tote.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return prepareModel(gltf.scene);
}

test('the bundled GLB has the configured body, black straps, and normalized height', async () => {
  const model = await loadModel();
  assert.equal(model.target.name, 'Tote_Body');
  assert.equal(model.automaticTarget, false);
  assert.ok(Math.abs(new Box3().setFromObject(model.scene).getSize(new Vector3()).y - toteConfig.model.height) < 0.001);
  const handles = model.scene.children.filter(mesh => mesh.name.startsWith('Handle'));
  assert.equal(handles.length, 2);
  for (const handle of handles) assert.equal('#' + handle.material.color.getHexString(), toteConfig.model.colors.straps);
  model.dispose();
});

test('every selected-count layout projects onto the front without covering the logo or another patch', async () => {
  const model = await loadModel();
  const image = await readFile(new URL('../tote/public/branding/bees-wordmark.png', import.meta.url));
  const logoHeight = toteConfig.logoPlacement.scale[1] * image.readUInt32BE(20) / image.readUInt32BE(16);
  const logoBottom = toteConfig.logoPlacement.position[1] - logoHeight / 2;
  const logoTop = toteConfig.logoPlacement.position[1] + logoHeight / 2;
  const logoLeft = toteConfig.logoPlacement.position[0] - toteConfig.logoPlacement.scale[0] / 2;
  const logoRight = toteConfig.logoPlacement.position[0] + toteConfig.logoPlacement.scale[0] / 2;
  for (let count = 1; count <= patches.length; count++) {
    const occupied = [];
    for (const [index, patch] of patches.slice(0, count).entries()) {
      const placement = getPatchPlacement(patch, index, count);
      const origin = new Vector3(...placement.position); origin.z += 5;
      const hit = new Raycaster(origin, new Vector3(0, 0, -1)).intersectObject(model.target)[0];
      assert.ok(hit, `${patch.id} must hit the tote`);
      const decal = new DecalGeometry(model.target, hit.point, new Euler(...placement.rotation), new Vector3(...placement.scale));
      assert.ok(decal.attributes.position.count > 6, `${patch.id} must conform to the curved body`);
      decal.computeBoundingBox();
      const bounds = decal.boundingBox;
      assert.ok(bounds.min.z > 0, `${patch.id} must not project onto the reverse`);
      assert.ok(bounds.max.y < logoBottom || bounds.min.y > logoTop
        || bounds.max.x < logoLeft || bounds.min.x > logoRight,
        `${patch.id} must leave the center wordmark unobstructed with ${count} selected`);
      for (const other of occupied) {
        assert.ok(bounds.max.x < other.min.x || bounds.min.x > other.max.x
          || bounds.max.y < other.min.y || bounds.min.y > other.max.y,
          `${patch.id} must not overlap another patch with ${count} selected`);
      }
      occupied.push(bounds.clone());
      decal.dispose();
    }
  }
  model.dispose();
});

test('additional patch entries get distinct positions inside the front panel', () => {
  for (const count of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 20]) {
    const placements = Array.from({ length: count }, (_, index) => getPatchPlacement({}, index, count));
    assert.equal(new Set(placements.map(p => p.position.join(','))).size, count);
    for (const p of placements) {
      assert.ok(p.scale[0] > 0);
      assert.ok(Math.abs(p.position[0]) + p.scale[0] / 2 < 1);
      const distanceFromLogo = Math.abs(p.position[1] - toteConfig.logoPlacement.position[1]);
      assert.ok(distanceFromLogo + p.scale[1] / 2 < 0.97);
      assert.ok(distanceFromLogo - p.scale[1] / 2 > 0.14
        || Math.abs(p.position[0]) - p.scale[0] / 2 > toteConfig.logoPlacement.scale[0] / 2,
      'additional patches must avoid the center logo');
    }
  }
});

test('removing a patch repacks remaining patches rather than leaving its catalog slot vacant', () => {
  const selected = patches.filter(patch => ['patch-1', 'patch-4', 'patch-5', 'patch-6', 'patch-7', 'patch-8', 'patch-9'].includes(patch.id));
  const before = selected.map((patch, index) => getPatchPlacement(patch, index, selected.length));
  const remaining = selected.filter(patch => patch.id !== 'patch-5');
  const after = remaining.map((patch, index) => getPatchPlacement(patch, index, remaining.length));
  assert.ok(after.some((placement, index) => {
    const oldIndex = selected.indexOf(remaining[index]);
    return placement.position.some((value, axis) => value !== before[oldIndex].position[axis])
      || placement.scale.some((value, axis) => value !== before[oldIndex].scale[axis]);
  }), 'the remaining layout must close the gap rather than keep the old slots');
  for (const patch of patches) {
    const lone = getPatchPlacement(patch, 0, 1);
    assert.equal(lone.position[0], 0, 'any single remaining patch must center itself, regardless of catalog index');
  }
});

test('both handle attachments stay outside the canvas, including between vertices', async () => {
  const model = await loadModel();
  for (const handle of model.scene.children.filter(mesh => mesh.name.startsWith('Handle'))) {
    const sign = handle.name.endsWith('Front') ? 1 : -1;
    const positions = handle.geometry.attributes.position;
    const indices = handle.geometry.index;
    let checked = 0;
    function check(point) {
      const hit = new Raycaster(new Vector3(point.x, point.y, sign * 3), new Vector3(0, 0, -sign))
        .intersectObject(model.target)[0];
      if (!hit) return;
      checked++;
      assert.ok(sign * (point.z - hit.point.z) > 0.002, `${handle.name} must clear the canvas at ${point.toArray()}`);
    }
    for (let i = 0; i < positions.count; i++) check(new Vector3().fromBufferAttribute(positions, i));
    for (let i = 0; i < indices.count; i += 3) {
      const center = new Vector3();
      for (let j = 0; j < 3; j++) center.add(new Vector3().fromBufferAttribute(positions, indices.getX(i + j)));
      check(center.divideScalar(3));
    }
    assert.ok(checked > 20, 'both sewn ends must be checked against the body');
  }
  model.dispose();
});

test('joystick moves the viewpoint in the requested direction and stays bounded without changing zoom', () => {
  for (const angle of [0, Math.PI / 2, Math.PI]) {
    const camera = new PerspectiveCamera(37, 1, 0.05, 100);
    const target = new Vector3();
    camera.position.set(Math.sin(angle) * 3, 0, Math.cos(angle) * 3);
    camera.lookAt(target); camera.updateMatrixWorld();
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    panCamera(camera, target, 1, 0, 1 / 60);
    assert.ok(target.dot(right) > 0, 'dragging right must move the viewpoint right');
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    panCamera(camera, target, 0, 1, 1 / 60);
    assert.ok(target.dot(up) > 0, 'dragging up must move the viewpoint up');
    assert.ok(Math.abs(camera.position.distanceTo(target) - 3) < 1e-10);
    for (let i = 0; i < 500; i++) panCamera(camera, target, 1, 1, 1 / 60);
    assert.ok(Math.abs(target.x) <= 1.65 && Math.abs(target.y) <= 1.65 && Math.abs(target.z) <= 1);
    assert.ok(Math.abs(camera.position.distanceTo(target) - 3) < 1e-10);
    const offset = camera.position.clone().sub(target);
    target.addScalar(10); camera.position.addScalar(10);
    constrainPan(camera, target);
    assert.ok(camera.position.clone().sub(target).distanceTo(offset) < 1e-10, 'mouse panning bounds must preserve camera offset');
  }
});

test('full-screen projection preserves the starting frame and continues behind UI margins', () => {
  const layouts = [
    { width: 1440, height: 1000, frame: { left: 20, top: 100, width: 1180, height: 830 } },
    { width: 390, height: 844, frame: { left: 0, top: 98, width: 390, height: 501 } },
    { width: 844, height: 390, frame: { left: 150, top: 12, width: 474, height: 366 } },
    { width: 320, height: 568, frame: { left: 0, top: 78, width: 320, height: 268 } },
  ];
  for (const { frame, ...viewport } of layouts) {
    const insetCamera = new PerspectiveCamera(37, frame.width / frame.height, 0.05, 100);
    insetCamera.position.set(0, 0, 3);
    insetCamera.updateMatrixWorld();
    const fullCamera = insetCamera.clone();
    frameCamera(fullCamera, viewport, frame, 37);
    for (const point of [new Vector3(), new Vector3(1.2, 1.7, 0.3), new Vector3(-1.2, -1.7, -0.3)]) {
      const old = point.clone().project(insetCamera), current = point.clone().project(fullCamera);
      const expectedX = frame.left + (old.x + 1) * frame.width / 2;
      const expectedY = frame.top + (1 - old.y) * frame.height / 2;
      assert.ok(Math.abs((current.x + 1) * viewport.width / 2 - expectedX) < 1e-8);
      assert.ok(Math.abs((1 - current.y) * viewport.height / 2 - expectedY) < 1e-8);
    }
    // A point in the header margin is outside the old canvas but inside the
    // expanded frustum. UI overlays can now cover it instead of cropping it.
    const marginPoint = new Vector3(0, 1 + frame.top / frame.height, 0).unproject(insetCamera);
    assert.ok(marginPoint.clone().project(insetCamera).y > 1);
    assert.ok(Math.abs(marginPoint.clone().project(fullCamera).y) < 1);
  }
});

test('missing target names fall back to the largest body mesh', async () => {
  const bytes = await readFile(new URL('../tote/public/models/tote.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.getObjectByName('Tote_Body').name = 'Replacement_Fabric';
  const model = prepareModel(gltf.scene);
  assert.equal(model.target.name, 'Replacement_Fabric');
  assert.equal(model.automaticTarget, true);
  model.dispose();
});
