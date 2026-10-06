import { patchPlacement as config } from '../config/toteConfig.js';

function compactSlot(index, count) {
  const sideCount = count >= 7 ? 2 : 0;
  const rowCount = count - sideCount;
  const upperCount = Math.min(count === 10 ? 4 : 3, Math.ceil(rowCount / 2));
  const lowerCount = rowCount - upperCount;
  const sizeFactor = count <= 2 ? config.layout.smallCountScale
    : count <= 4 ? config.layout.mediumCountScale : 1;
  const size = config.scale[0] * sizeFactor;
  const depth = config.scale[2];
  if (sideCount && index >= upperCount && index < upperCount + sideCount) {
    const left = index === upperCount;
    return { position: [config.layout.sideX * (left ? -1 : 1), left ? -0.025 : 0.02, 0],
      rotation: [0, 0, left ? 0.12 : -0.14], scale: [size * 0.85, size * 0.85, depth] };
  }
  const upper = index < upperCount;
  const rowIndex = upper ? index : index - upperCount - sideCount;
  const columns = upper ? upperCount : lowerCount;
  const x = (rowIndex - (columns - 1) / 2) * (size + config.layout.gap);
  const y = columns === 1 ? (upper ? 0.44 : -0.46)
    : (upper ? config.layout.upperY : config.layout.lowerY)
      + (upper ? [0, 0.10, -0.02, -0.03] : [0, 0.06, -0.045, 0.07])[rowIndex];
  const rotation = columns === 1 ? (upper ? -0.04 : 0.06)
    : (upper ? [-0.11, 0.08, -0.06, 0.09] : [0.09, -0.10, 0.12, -0.07])[rowIndex];
  const variation = columns === 1 ? 1 : [1, 0.96, 1.04, 0.98][rowIndex];
  return { position: [x, y, 0], rotation: [0, 0, rotation], scale: [size * variation, size * variation, depth] };
}

export function getPatchPlacement(patch, index, count) {
  let slot;
  let scale;
  if (count <= 10) {
    slot = compactSlot(index, count);
    scale = slot.scale;
  } else {
    const columns = Math.ceil(count / config.grid.rowOffsets.length);
    const row = Math.floor(index / columns);
    const rowCount = Math.min(columns, count - row * columns);
    const width = config.grid.width / columns;
    slot = { position: [(index % columns - (rowCount - 1) / 2) * width,
      config.grid.rowOffsets[row], 0], rotation: [0, 0, 0] };
    const cellSize = Math.min(width, config.grid.rowHeight);
    const size = Math.min(config.scale[0], config.scale[1], cellSize - Math.min(config.grid.gap, cellSize / 4));
    scale = [size, size, config.scale[2]];
  }
  return {
    position: patch.placement?.position ?? config.position.map((v, i) => v + (slot?.position[i] ?? 0)),
    rotation: patch.placement?.rotation ?? config.rotation.map((v, i) => v + (slot?.rotation[i] ?? 0)),
    scale: patch.placement?.scale ?? scale,
  };
}
