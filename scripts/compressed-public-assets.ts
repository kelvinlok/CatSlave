import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import type { Plugin } from 'vite';
import { shareModelTextures } from './shared-model-textures.ts';

/** Explicit gzip files work on static hosts without Content-Encoding configuration. */
export function compressedPublicAssets(): Plugin {
  let publicDirectory: string;
  return {
    name: 'compressed-public-assets',
    apply: 'build',
    configResolved(config) { publicDirectory = path.resolve(config.root, 'public'); },
    async generateBundle() {
      const inputs = new Map<string, Buffer>();
      const visit = async (directory: string): Promise<void> => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const file = path.join(directory, entry.name);
          if (entry.isDirectory()) { await visit(file); continue; }
          if (!entry.isFile()) continue;
          this.addWatchFile(file);
          const original = await readFile(file);
          const fileName = path.relative(publicDirectory, file).split(path.sep).join('/');
          inputs.set(fileName, original);
        }
      };
      await visit(publicDirectory);
      const { models, shared } = shareModelTextures(new Map([...inputs].filter(([name]) => name.endsWith('.glb'))));
      for (const [fileName, original] of inputs) {
        if (fileName.endsWith('.glb')) {
          const model = models.get(fileName)!;
          const compressed = gzipSync(model, { level: 9 });
          // Packing verifies the original geometry/image bytes; transport must
          // then restore the packed GLB exactly, including its external URIs.
          if (!gunzipSync(compressed).equals(model)) throw new Error(`Lossless check failed: ${fileName}`);
          this.emitFile({ type: 'asset', fileName: `${fileName}.gz`, source: compressed });
        } else this.emitFile({ type: 'asset', fileName, source: original });
      }
      for (const [fileName, source] of shared) {
        if (inputs.has(fileName)) throw new Error(`Shared texture output collision: ${fileName}`);
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
  };
}
