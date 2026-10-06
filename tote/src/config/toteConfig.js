// All placement values use the centered, normalized model, in Three.js units.
// +X = right, +Y = up, +Z = the front. Rotations are radians.
export const patchPlacement = {
  position: [0, -0.64, 0.4],
  rotation: [0, 0, 0],
  scale: [0.40, 0.40, 0.2], // width, height, and decal projection depth for a full bag
  surfaceOffset: 0.004,
  // Layout uses the selected count, never the catalog's unselected slots.
  layout: { gap: 0.065, upperY: 0.48, lowerY: -0.52, sideX: 0.80,
    smallCountScale: 1.25, mediumCountScale: 1.15 },
  // Extra patches fit two rows above and below the permanent center logo.
  grid: { width: 1.95, rowHeight: 0.4, rowOffsets: [0.47, -0.65], gap: 0.12 },
};

export const toteConfig = {
  background: { image: '/branding/faint-logo-tile.webp', size: '510px', repeat: 'repeat' },
  wordmark: '/branding/bees-wordmark.png',
  // Permanent printed logo: image aspect ratio determines height.
  logoPlacement: {
    position: [0, -0.64, 0.4],
    rotation: [0, 0, 0],
    scale: [1.04, 1.04, 0.22],
  },
  model: {
    path: '/models/tote.glb',
    height: 3.4,
    rotation: [0, 0, 0],
    // These are the inspected mesh/material names of the bundled placeholder GLB.
    // After replacing it, run npm run inspect:tote and update these names.
    bodyMeshNames: ['Tote_Body'],
    strapMaterialNames: ['Black_Webbing'],
    bodyMaterialNames: ['Natural_Canvas', 'Canvas_Seams'],
    colors: { body: '#e9dfca', straps: '#171819' },
    recolor: true,
  },
  camera: {
    position: [0.55, 0.22, 6.8],
    target: [0, 0, 0],
    fov: 37,
    near: 0.05,
    minDistance: 1.8,
    maxDistance: 9,
    minPolarAngle: Math.PI * 0.18,
    maxPolarAngle: Math.PI * 0.61,
  },
  patchPlacement,
};
