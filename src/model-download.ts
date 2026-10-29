/** Hosts may return the gzip file verbatim or decode it via Content-Encoding. */
export async function readModelResponse(response: Response): Promise<ArrayBuffer> {
  const buffer = await response.arrayBuffer();
  const magic = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
  if (magic[0] !== 0x1f || magic[1] !== 0x8b) return buffer;
  const stream = new Response(buffer).body!.pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}
