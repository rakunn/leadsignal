export class UploadLimitError extends Error {}

/** Read a request stream while enforcing its actual byte count. */
export async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > maxBytes) {
    throw new UploadLimitError("Request body exceeds the upload limit.");
  }

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new UploadLimitError("Request body exceeds the upload limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
