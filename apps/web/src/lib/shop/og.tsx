import { ImageResponse } from 'next/og';

/** Open Graph images: 1200 x 630, the size every network crops from. */
export const OG_SIZE = { width: 1200, height: 630 };

/**
 * A shared link's picture: the photo (if any) beside the name and a line about it, on the brand's
 * clay. Text is in English (Latin script): the image renderer's default font has no Arabic.
 */
export function ogCard({
  title,
  lines,
  imageUrl,
}: {
  title: string;
  lines: string[];
  imageUrl?: string | null;
}) {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: '#fbf6ef',
        fontFamily: 'sans-serif',
      }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" width={630} height={630} style={{ objectFit: 'cover' }} />
      ) : null}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 64,
          borderTop: '16px solid #a9500e',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: imageUrl ? 56 : 72, fontWeight: 800, color: '#2a211b' }}>
            {title}
          </div>
          {lines.map((line) => (
            <div key={line} style={{ fontSize: 34, color: '#6b5d52' }}>
              {line}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, color: '#a9500e' }}>African Market UAE</div>
      </div>
    </div>,
    OG_SIZE,
  );
}
