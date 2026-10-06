import { ShaderChunk } from 'three';

// Prefer half a mip level more detail for the small lettering. Retain trilinear
// filtering and mipmaps so fine embroidery stays stable during zoom and orbit.
const detailedMap = ShaderChunk.map_fragment.replace(
  'texture2D( map, vMapUv )', 'texture2D( map, vMapUv, -0.5 )',
);

export function sharpenPatchShader(shader) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', detailedMap);
}
