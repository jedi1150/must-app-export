import { zipSync, strToU8 } from '../vendor/fflate.esm.js';

/**
 * @param {{ name: string, content: string }[]} files
 */
export async function createZipBlob(files) {
  /** @type {Record<string, Uint8Array>} */
  const zipData = {};
  for (const file of files) {
    zipData[file.name] = strToU8(file.content);
  }
  const zipped = zipSync(zipData);
  return new Blob([zipped], { type: 'application/zip' });
}