import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import type { Plugin } from 'vite';

/** Explicit gzip files work on static hosts without Content-Encoding configuration. */
export function compressedPublicAssets(): Plugin {
  let publicDirectory: string;
  return {
    name: 'compressed-public-assets',
    apply: 'build',
    configResolved(config) { publicDirectory = path.resolve(config.root, 'public'); },
    async generateBundle() {
      const visit = async (directory: string): Promise<void> => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const file = path.join(directory, entry.name);
          if (entry.isDirectory()) { await visit(file); continue; }
          if (!entry.isFile()) continue;
          this.addWatchFile(file);
          const original = await readFile(file);
          const fileName = path.relative(publicDirectory, file).split(path.sep).join('/');
          if (fileName.endsWith('.glb')) {
            const compressed = gzipSync(original, { level: 9 });
            // Fail the build rather than publish a changed or corrupted model.
            if (!gunzipSync(compressed).equals(original)) throw new Error(`Lossless check failed: ${fileName}`);
            this.emitFile({ type: 'asset', fileName: `${fileName}.gz`, source: compressed });
          } else {
            this.emitFile({ type: 'asset', fileName, source: original });
          }
        }
      };
      await visit(publicDirectory);
    },
  };
}
