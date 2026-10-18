export interface GalleryImage {
  full?: string;
  card?: string;
  thumb?: string;
}

/**
 * Photos in a row that scrolls sideways and snaps, in reading order (it mirrors in Arabic). The
 * first is loaded at once (it is usually what people see first), the rest when scrolled to.
 */
export function Gallery({
  images,
  label,
  aspect = '16 / 9',
}: {
  images: GalleryImage[];
  /** Names the photos, e.g. the shop's or product's name. */
  label: string;
  aspect?: string;
}) {
  const urls = images.map((i) => i.full ?? i.card ?? i.thumb).filter(Boolean) as string[];
  if (urls.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={label}
      className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
    >
      {urls.map((url, i) => (
        <img
          key={url}
          src={url}
          alt=""
          loading={i === 0 ? 'eager' : 'lazy'}
          className="w-[85%] shrink-0 snap-start rounded-lg border border-line object-cover sm:w-[70%]"
          style={{ aspectRatio: aspect }}
        />
      ))}
    </div>
  );
}
