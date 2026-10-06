import { MathUtils, Vector3 } from 'three';

const limit = new Vector3(1.65, 1.65, 1);
const minimum = limit.clone().negate();
const before = new Vector3();
const movement = new Vector3();
const up = new Vector3();

// Preserve the starting composition while drawing through the entire viewport.
// Expanding the projection, instead of shrinking the canvas, lets the bag pass
// behind every overlay when the viewer zooms or pans.
export function frameCamera(camera, viewport, frame, baseFov) {
  const height = Math.max(1, frame.height);
  camera.fov = MathUtils.radToDeg(2 * Math.atan(
    Math.tan(MathUtils.degToRad(baseFov / 2)) * viewport.height / height,
  ));
  camera.setViewOffset(viewport.width, viewport.height,
    viewport.width / 2 - (frame.left + frame.width / 2),
    viewport.height / 2 - (frame.top + frame.height / 2),
    viewport.width, viewport.height);
}

// Keep the bag within easy reach, including after mouse/two-finger panning.
export function constrainPan(camera, target) {
  before.copy(target);
  target.clamp(minimum, limit);
  camera.position.add(before.sub(target).negate());
}

// Positive input moves the viewpoint right/up, regardless of orbit angle.
export function panCamera(camera, target, x, y, delta) {
  const speed = camera.position.distanceTo(target) * 0.35 * Math.min(delta, 0.05);
  camera.updateMatrixWorld();
  movement.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(x * speed);
  up.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(y * speed);
  movement.add(up);
  camera.position.add(movement);
  target.add(movement);
  constrainPan(camera, target);
}
