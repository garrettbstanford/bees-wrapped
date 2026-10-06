import { SRGBColorSpace, TextureLoader } from 'three';

const cache = new Map();
// Promises resolve on failure as well, keeping an unavailable PNG local to its button.
export function loadPatchTexture(url) {
  if (!cache.has(url)) cache.set(url, new Promise(resolve => {
    new TextureLoader().load(url, texture => {
      // Three clamps this to the GPU's supported maximum. Keep mipmaps for
      // stable detail as the tote rotates and the patches become smaller.
      texture.colorSpace = SRGBColorSpace; texture.anisotropy = 16;
      resolve(texture);
    }, undefined, () => resolve(null));
  }));
  return cache.get(url);
}
