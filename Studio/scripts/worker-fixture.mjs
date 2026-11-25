// Separate in-memory Worker storage for each test process.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const src = await readFile(new URL('../dist/server/index.js', import.meta.url), 'utf8'),
  owner = 'qa@example.invalid';
export const ownerDigest = createHash('sha256').update(owner).digest('hex');
export const worker = (await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))).default;
export const store = new Map();
let revision = 0;
export const BUCKET = {
  async get(k) {
    const v = store.get(k);
    if (!v) return null;
    return { ...v, json: async () => JSON.parse(v.body) };
  },
  async head(k) {
    return store.get(k) || null;
  },
  async put(k, body, opts = {}) {
    const old = store.get(k),
      cond = opts.onlyIf;
    if (
      cond &&
      ((cond.etagMatches && cond.etagMatches !== old?.etag) || (cond.etagDoesNotMatch === '*' && old))
    )
      return null;
    // A stored stream is kept as bytes, so it can be read again like an object in the real bucket.
    if (body instanceof ReadableStream) body = new Uint8Array(await new Response(body).arrayBuffer());
    const item = { body, etag: String(++revision), httpMetadata: opts.httpMetadata, customMetadata: opts.customMetadata };
    store.set(k, item);
    return item;
  },
  async delete(k) {
    store.delete(k);
  },
};
const origin = 'https://studio.test';
export const previewOwnerHeaders = { 'oai-authenticated-user-email': owner };
export const ownerHeaders = { ...previewOwnerHeaders, 'oai-authenticated-user-id': 'test-owner' };
export async function call(path, data, headers = {}, env = {}) {
  return worker.fetch(
    new Request(origin + '/api/' + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
    { BUCKET, STUDIO_OWNER_EMAIL_SHA256: ownerDigest, ...env },
  );
}
