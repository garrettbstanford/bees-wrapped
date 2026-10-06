import { readFile } from 'node:fs/promises';
const file = process.argv[2] || new URL('../tote/public/models/tote.glb', import.meta.url);
const bytes = await readFile(file);
if (bytes.toString('utf8', 0, 4) !== 'glTF') throw new Error('Expected a binary glTF (.glb) file.');
const length = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + length));
console.log('Meshes and materials (use these names in tote/src/config/toteConfig.js):');
for (const node of gltf.nodes || []) {
  if (node.mesh === undefined) continue;
  const mesh = gltf.meshes[node.mesh];
  console.log(JSON.stringify({ node: node.name, mesh: mesh.name,
    primitives: mesh.primitives.map(p => ({ material: gltf.materials?.[p.material]?.name,
      vertices: gltf.accessors[p.attributes.POSITION].count,
      min: gltf.accessors[p.attributes.POSITION].min, max: gltf.accessors[p.attributes.POSITION].max })) }));
}
