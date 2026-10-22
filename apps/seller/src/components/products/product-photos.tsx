'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MEDIA_RULES } from '@am/contracts';
import { Button, IconButton } from '@am/ui';
import { MAX_PRODUCT_IMAGES, type SellerProduct } from '@/lib/product-form';
import { shopsApi } from '@/lib/shops';
import { useErrorText } from '../error-text';

/**
 * The product's pictures in the order customers see them, the first as the cover. Files go
 * straight to storage; the list is saved with the product, which binds them to it.
 */
export function ProductPhotos({
  shopId,
  product,
  ids,
  onChange,
  onBusy,
}: {
  shopId: string;
  product?: SellerProduct;
  ids: string[];
  onChange: (ids: string[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  const t = useTranslations('products');
  const p = useTranslations('photos');
  const errorText = useErrorText();
  const local = useRef(new Map<string, string>());
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rule = MEDIA_RULES.product_image;

  const src = (id: string) => {
    const urls = product?.imageUrls[id];
    return urls?.card ?? urls?.thumb ?? urls?.full ?? local.current.get(id);
  };

  const add = async (files: File[]) => {
    const room = MAX_PRODUCT_IMAGES - ids.length;
    const chosen = files.slice(0, room);
    for (const file of chosen) {
      if (!rule.contentTypes.includes(file.type)) return setError(p('wrongType'));
      if (file.size > rule.maxBytes)
        return setError(p('tooLarge', { mb: Math.round(rule.maxBytes / 1024 / 1024) }));
    }
    setUploading(true);
    onBusy(true);
    setError(files.length > room ? t('tooManyPhotos', { max: MAX_PRODUCT_IMAGES }) : null);
    const added: string[] = [];
    for (const file of chosen) {
      const uploaded = await shopsApi.upload(shopId, file, 'product_image');
      if (!uploaded.ok) {
        setError(errorText(uploaded.code));
        break;
      }
      local.current.set(uploaded.data, URL.createObjectURL(file));
      added.push(uploaded.data);
    }
    if (added.length) onChange([...ids, ...added]);
    setUploading(false);
    onBusy(false);
  };

  const move = (index: number, by: -1 | 1) => {
    const next = [...ids];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="product-photos">
      <h2 id="product-photos" className="text-lg font-semibold">
        {t('photos')}
      </h2>
      <p className="text-sm text-ink-muted">{t('photosHint', { max: MAX_PRODUCT_IMAGES })}</p>
      {ids.length > 0 && (
        <ol className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {ids.map((id, index) => (
            <li key={id} className="flex flex-col gap-1">
              <div className="am-media am-media-empty rounded-md" style={{ aspectRatio: '1' }}>
                {src(id) && <img src={src(id)} alt={p('photoN', { n: index + 1 })} />}
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs text-ink-muted">
                  {src(id)
                    ? index === 0
                      ? t('cover')
                      : p('photoN', { n: index + 1 })
                    : p('processing')}
                </span>
                <span className="flex">
                  {index > 0 && (
                    <IconButton
                      icon="chevron-left"
                      label={p('moveEarlier')}
                      onClick={() => move(index, -1)}
                    />
                  )}
                  <IconButton
                    icon="x"
                    label={p('remove')}
                    onClick={() => onChange(ids.filter((x) => x !== id))}
                  />
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {ids.length < MAX_PRODUCT_IMAGES && (
        <Button
          type="button"
          iconStart="photo"
          className="self-start"
          loading={uploading}
          loadingLabel={p('uploading')}
          onClick={() => input.current?.click()}
        >
          {p('addPhotos')}
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept={rule.contentTypes.join(',')}
        multiple
        hidden
        onChange={(ev) => {
          const files = Array.from(ev.target.files ?? []);
          ev.target.value = '';
          if (files.length) void add(files);
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
