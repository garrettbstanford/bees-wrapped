import { writeFile } from 'node:fs/promises';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createPlaceholderTote } from '../tote/src/lib/createPlaceholderTote.js';

// GLTFExporter uses FileReader in browsers; Blob is native in Node.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(buffer => { this.result = buffer; this.onloadend?.(); });
  }
};
const model = createPlaceholderTote();
const glb = await new GLTFExporter().parseAsync(model, { binary: true });
const path = new URL('../tote/public/models/tote.glb', import.meta.url);
await writeFile(path, Buffer.from(glb));
console.log(`Wrote placeholder tote (${Math.round(glb.byteLength / 1024)} KB).`);
