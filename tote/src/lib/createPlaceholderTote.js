import * as THREE from 'three';

// A locally authored stand-in, also exported to public/models/tote.glb.
// No remote models, textures, or provider branding are needed.
export function createPlaceholderTote() {
  const tote = new THREE.Group();
  tote.name = 'Canvas_Tote_Placeholder';
  const canvas = new THREE.MeshStandardMaterial({ name: 'Natural_Canvas', color: '#e9dfca', roughness: 0.95, side: THREE.DoubleSide });
  const webbing = new THREE.MeshStandardMaterial({ name: 'Black_Webbing', color: '#171819', roughness: 0.94, side: THREE.DoubleSide });
  const seams = new THREE.MeshStandardMaterial({ name: 'Canvas_Seams', color: '#d3c6ac', roughness: 1 });
  function mesh(name, geometry, material) {
    const object = new THREE.Mesh(geometry, material);
    object.name = name;
    tote.add(object);
    return object;
  }
  function point(angle, t) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const width = 1.12 + t * 0.13;
    const x = Math.sign(c) * Math.abs(c) ** 0.30 * width;
    const y = -1.55 + 2.15 * t;
    const depth = 0.28 + Math.sin(t * Math.PI) * 0.12;
    const folds = 0.025 * Math.sin(x * 13 + t * 4) * (0.25 + t * t)
      + 0.012 * Math.sin(x * 21 - t * 10);
    const z = Math.sign(s) * (Math.abs(s) ** 0.30 * depth + folds);
    return new THREE.Vector3(x, y + 0.022 * Math.sin(x * 4) * t ** 5, z);
  }
  const positions = [], uvs = [], indices = [];
  const around = 128, rows = 48;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= around; i++) {
      const p = point(i / around * Math.PI * 2, j / rows);
      positions.push(...p.toArray()); uvs.push(i / around, j / rows);
      if (j < rows && i < around) {
        const a = j * (around + 1) + i, b = a + around + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  body.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  body.setIndex(indices); body.computeVertexNormals();
  const bodyMesh = mesh('Tote_Body', body, canvas);
  // Close the bottom; the top remains open with a visible inside.
  const bottom = new THREE.BoxGeometry(2.15, 0.032, 0.48, 12, 1, 4);
  mesh('Tote_Base', bottom, canvas).position.y = -1.53;
  for (const t of [0.025, 0.945, 0.987]) {
    const points = Array.from({ length: 129 }, (_, i) => point(i / 128 * Math.PI * 2, t));
    mesh('Canvas_Hem_' + t, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), 128, 0.008, 4, true), seams);
  }
  const ray = new THREE.Raycaster();
  // The sewn ends follow the actual canvas surface. Above the rim, the same
  // continuous ribbon eases away from the bag into the loop.
  function attach(q, sign, thickness = 0) {
    ray.set(new THREE.Vector3(q.x, Math.min(q.y, 0.55), sign * 2), new THREE.Vector3(0, 0, -sign));
    const hit = ray.intersectObject(bodyMesh)[0];
    if (hit) {
      const blend = THREE.MathUtils.smoothstep(q.y, 0.62, 0.84);
      q.z = THREE.MathUtils.lerp(hit.point.z + sign * 0.019, q.z, blend);
    }
    q.z += sign * thickness;
    return q;
  }
  for (const [side, sign] of [['Front', 1], ['Back', -1]]) {
    const z = sign * 0.36;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.67, 0.28, z), new THREE.Vector3(-0.65, 0.97, z),
      new THREE.Vector3(-0.5, 1.62, z * 0.8), new THREE.Vector3(0, 1.82, z * 0.6),
      new THREE.Vector3(0.5, 1.62, z * 0.8), new THREE.Vector3(0.65, 0.97, z),
      new THREE.Vector3(0.67, 0.28, z),
    ], false, 'centripetal');
    const verts = [], faces = [], uv = [];
    // Subdivide across the webbing as well as along it, so fabric folds cannot
    // poke through the middle of a wide, flat triangle at the attachment.
    const section = [
      ...Array.from({ length: 9 }, (_, i) => [-1 + i / 4, -1]),
      ...Array.from({ length: 9 }, (_, i) => [1 - i / 4, 1]),
    ];
    const ring = section.length;
    for (let i = 0; i <= 96; i++) {
      const t = i / 96, p = curve.getPointAt(t), tangent = curve.getTangentAt(t);
      const cross = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
      for (const [w, d] of section) {
        const q = p.clone().addScaledVector(cross, w * 0.082);
        attach(q, sign, d * 0.009);
        verts.push(...q.toArray()); uv.push((w + 1) / 2, t * 3);
      }
      if (i < 96) for (let k = 0; k < ring; k++) {
        const a = i * ring + k, b = i * ring + (k + 1) % ring;
        faces.push(a, a + ring, b, b, a + ring, b + ring);
      }
    }
    // Close both sewn ends instead of overlapping separate anchor boxes.
    for (let k = 0; k < 8; k++) {
      const a = k, b = k + 1, c = ring - 2 - k, d = ring - 1 - k;
      faces.push(a, b, d, b, c, d);
      const end = 96 * ring;
      faces.push(end + a, end + d, end + b, end + b, end + d, end + c);
    }
    const handle = new THREE.BufferGeometry();
    handle.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    handle.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    handle.setIndex(faces); handle.computeVertexNormals();
    mesh('Handle_' + side, handle, webbing);
  }
  return tote;
}
