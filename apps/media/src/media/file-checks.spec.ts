import sharp from 'sharp';
import { checkPdf, encodeImage, FileRejected, sniffType } from './file-checks';

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 169, g: 80, b: 14 } } });

/** A JPEG carrying what phones put in photos: where it was taken, and who took it. */
const photoWithExif = () =>
  solid(3000, 2000)
    .jpeg()
    .withExif({
      IFD0: { Artist: 'Adaeze Okafor', Copyright: 'private' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '25/1 12/1 0/1' },
    })
    .toBuffer();

/**
 * A two-frame animated WebP, put together by hand: this sharp build does not write animations.
 * RIFF/WEBP container with VP8X (animation flag), ANIM and one ANMF chunk per frame.
 */
async function animatedWebp(): Promise<Buffer> {
  const u24 = (n: number) => Buffer.from([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff]);
  const chunk = (tag: string, data: Buffer) => {
    const size = Buffer.alloc(4);
    size.writeUInt32LE(data.length);
    return Buffer.concat([Buffer.from(tag), size, data, Buffer.alloc(data.length % 2)]);
  };
  const frame = (await solid(20, 20).webp({ lossless: true }).toBuffer()).subarray(12);
  const anmf = chunk(
    'ANMF',
    Buffer.concat([u24(0), u24(0), u24(19), u24(19), u24(100), Buffer.from([0]), frame]),
  );
  const body = Buffer.concat([
    Buffer.from('WEBP'),
    chunk('VP8X', Buffer.concat([Buffer.from([0x02, 0, 0, 0]), u24(19), u24(19)])),
    chunk('ANIM', Buffer.alloc(6)),
    anmf,
    anmf,
  ]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  return Buffer.concat([Buffer.from('RIFF'), size, body]);
}

describe('sniffType', () => {
  it('reads the real type from the first bytes', async () => {
    expect(sniffType(await solid(10, 10).jpeg().toBuffer())).toBe('image/jpeg');
    expect(sniffType(await solid(10, 10).png().toBuffer())).toBe('image/png');
    expect(sniffType(await solid(10, 10).webp().toBuffer())).toBe('image/webp');
    expect(sniffType(Buffer.from('%PDF-1.7\n...'))).toBe('application/pdf');
  });

  it('does not recognise anything else, whatever it is called', async () => {
    expect(
      sniffType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    ).toBeUndefined();
    expect(sniffType(Buffer.from('<html><script>alert(1)</script>'))).toBeUndefined();
    expect(sniffType(await solid(10, 10).gif().toBuffer())).toBeUndefined();
    expect(sniffType(Buffer.alloc(0))).toBeUndefined();
  });
});

describe('encodeImage', () => {
  it('makes each size as WebP, never larger than the original', async () => {
    const images = await encodeImage(await solid(1000, 500).png().toBuffer(), [
      'thumb',
      'card',
      'full',
    ]);
    expect(images.map((i) => [i.name, i.width, i.height])).toEqual([
      ['thumb', 200, 100],
      ['card', 600, 300],
      ['full', 1000, 500],
    ]);
    for (const image of images) expect(sniffType(image.bytes)).toBe('image/webp');
  });

  it('drops EXIF, so no location or name leaves with the image', async () => {
    const original = await photoWithExif();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const [card] = await encodeImage(original, ['card']);
    const meta = await sharp(card.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(card.bytes.includes(Buffer.from('Adaeze'))).toBe(false);
  });

  it('keeps a private document whole up to 2400 wide', async () => {
    const [document] = await encodeImage(await solid(3000, 1000).jpeg().toBuffer(), []);
    expect(document).toMatchObject({ name: 'document', width: 2400, height: 800 });
  });

  it('refuses animated, damaged and oversized images', async () => {
    await expect(encodeImage(await animatedWebp(), ['thumb'])).rejects.toEqual(
      new FileRejected('animated'),
    );

    const damaged = (await solid(100, 100).jpeg().toBuffer()).subarray(0, 60);
    await expect(encodeImage(damaged, ['thumb'])).rejects.toEqual(new FileRejected('unreadable'));

    const huge = await solid(8000, 8000).png({ compressionLevel: 9 }).toBuffer();
    await expect(encodeImage(huge, ['thumb'])).rejects.toEqual(new FileRejected('too_many_pixels'));
  });
});

describe('checkPdf', () => {
  it('accepts a complete PDF and refuses a cut-off one', () => {
    expect(() => checkPdf(Buffer.from('%PDF-1.7\n1 0 obj\n%%EOF\n'))).not.toThrow();
    expect(() => checkPdf(Buffer.from('%PDF-1.7\n1 0 obj\n'))).toThrow(FileRejected);
  });
});
