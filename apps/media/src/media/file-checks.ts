import sharp from 'sharp';
import { IMAGE_VARIANTS, ImageVariant } from '@am/contracts';

/**
 * The type a file really is, read from its first bytes, never from its name or the type the
 * browser declared. Only the types the media service accepts are recognised.
 */
export function sniffType(bytes: Buffer): string | undefined {
  const starts = (signature: number[], offset = 0) =>
    signature.every((byte, i) => bytes[offset + i] === byte);
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // RIFF....WEBP
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'; // %PDF-
  return undefined;
}

/** Large enough for any phone photo; stops images built to exhaust memory when decoded. */
export const MAX_INPUT_PIXELS = 50_000_000;
/** A private document image is kept at this width at most. */
const DOCUMENT_MAX_WIDTH = 2400;

export type FileProblem = 'unreadable' | 'animated' | 'too_many_pixels';

export class FileRejected extends Error {
  constructor(readonly reason: FileProblem) {
    super(reason);
  }
}

export interface EncodedImage {
  name: ImageVariant | 'document';
  bytes: Buffer;
  width: number;
  height: number;
}

async function inspect(bytes: Buffer) {
  try {
    // Reads the header only (no decoding), so a huge image is measured before it can cost memory.
    const meta = await sharp(bytes, { limitInputPixels: false, animated: true }).metadata();
    if ((meta.pages ?? 1) > 1) throw new FileRejected('animated');
    if (!meta.width || !meta.height) throw new FileRejected('unreadable');
    if (meta.width * meta.height > MAX_INPUT_PIXELS) throw new FileRejected('too_many_pixels');
    return meta;
  } catch (err) {
    if (err instanceof FileRejected) throw err;
    throw new FileRejected('unreadable');
  }
}

/**
 * Decodes and encodes again as WebP, once per size. Nothing of the original file survives:
 * metadata (EXIF, GPS position, camera serial) is dropped and anything appended or hidden in the
 * file is not carried over. Phone photos are turned upright first, from their EXIF orientation.
 */
export async function encodeImage(
  bytes: Buffer,
  variants: readonly ImageVariant[],
): Promise<EncodedImage[]> {
  await inspect(bytes);
  const sizes: Array<[EncodedImage['name'], number]> = variants.length
    ? variants.map((name) => [name, IMAGE_VARIANTS[name]])
    : [['document', DOCUMENT_MAX_WIDTH]];
  try {
    return await Promise.all(
      sizes.map(async ([name, width]) => {
        const { data, info } = await sharp(bytes, {
          limitInputPixels: MAX_INPUT_PIXELS,
          failOn: 'error',
        })
          .rotate()
          .resize({ width, height: width * 2, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: name === 'document' ? 90 : 80 })
          .toBuffer({ resolveWithObject: true });
        return { name, bytes: data, width: info.width, height: info.height };
      }),
    );
  } catch {
    throw new FileRejected('unreadable');
  }
}

/** A PDF is kept as it is (it is only ever downloaded by admins), once it is known to be whole. */
export function checkPdf(bytes: Buffer): void {
  const tail = bytes.subarray(Math.max(0, bytes.length - 1024)).toString('latin1');
  if (!tail.includes('%%EOF')) throw new FileRejected('unreadable');
}
