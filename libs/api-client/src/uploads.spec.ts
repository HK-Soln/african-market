import { createApiClient, NETWORK_ERROR, UPLOAD_REFUSED, uploadMedia } from './index';

const BASE = 'http://gateway.test';
const STORAGE = 'http://storage.test/uploads';
const MEDIA_ID = '6f1b8d2e-7c1a-4b8e-9f7a-0d9e2c4b5a61';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Gateway and storage in one fake fetch; `storage` decides what the bucket answers. */
function fakeBackend(storage: () => Response | Promise<Response>) {
  const seen: Array<{ url: string; body?: unknown }> = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = request.url;
    if (url === STORAGE) {
      seen.push({ url, body: await request.formData() });
      return storage();
    }
    seen.push({ url, body: await request.text() });
    if (url.endsWith('/api/v1/media/uploads')) {
      return json(200, {
        mediaId: MEDIA_ID,
        upload: {
          url: STORAGE,
          fields: { key: MEDIA_ID, 'Content-Type': 'image/png', Policy: 'p' },
        },
        expiresAt: '2026-10-16T10:05:00.000Z',
      });
    }
    return json(200, {
      id: MEDIA_ID,
      purpose: 'avatar',
      status: 'ready',
      contentType: 'image/webp',
      width: 200,
      height: 200,
      urls: { thumb: 'https://cdn.test/t.webp' },
    });
  };
  return { client: createApiClient({ baseUrl: BASE, fetch }), fetch, seen };
}

const file = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });

describe('uploadMedia', () => {
  it('asks for a form, posts the file to storage with the fields first, then confirms', async () => {
    const { client, fetch, seen } = fakeBackend(() => new Response(null, { status: 204 }));
    const result = await uploadMedia(client, file, { purpose: 'avatar', fetch });

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({ id: MEDIA_ID, status: 'ready' }),
    });
    expect(seen.map((s) => s.url)).toEqual([
      `${BASE}/api/v1/media/uploads`,
      STORAGE,
      `${BASE}/api/v1/media/uploads/${MEDIA_ID}/confirm`,
    ]);
    expect(JSON.parse(seen[0].body as string)).toEqual({
      purpose: 'avatar',
      contentType: 'image/png',
      sizeBytes: 4,
    });
    const form = seen[1].body as FormData;
    const names: string[] = [];
    form.forEach((_, name) => names.push(name));
    expect(names).toEqual(['key', 'Content-Type', 'Policy', 'file']);
  });

  it('stops when storage refuses the file, without confirming', async () => {
    const { client, fetch, seen } = fakeBackend(() => new Response('<Error/>', { status: 400 }));
    expect(await uploadMedia(client, file, { purpose: 'avatar', fetch })).toEqual({
      ok: false,
      code: UPLOAD_REFUSED,
    });
    expect(seen).toHaveLength(2);
  });

  it('reports a network failure on the way to storage', async () => {
    const { client, fetch } = fakeBackend(() => Promise.reject(new TypeError('fetch failed')));
    expect(await uploadMedia(client, file, { purpose: 'avatar', fetch })).toEqual({
      ok: false,
      code: NETWORK_ERROR,
    });
  });
});
