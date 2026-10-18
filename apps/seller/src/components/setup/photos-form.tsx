'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MEDIA_RULES, type MediaPurpose } from '@am/contracts';
import { Button, IconButton } from '@am/ui';
import { shopsApi, type SellerShop } from '@/lib/shops';
import { useErrorText } from '../error-text';

const MAX_GALLERY = 12;

/** A picture's link: the processed one when ready, else what was just picked (shown locally). */
function useImageSource(shop: SellerShop) {
  const local = useRef(new Map<string, string>());
  return {
    remember: (id: string, file: File) => local.current.set(id, URL.createObjectURL(file)),
    src: (id: string) => {
      const urls = shop.imageUrls?.[id];
      return urls?.card ?? urls?.thumb ?? urls?.full ?? local.current.get(id);
    },
    processing: (id: string) => !shop.imageUrls?.[id],
  };
}

/**
 * The logo (a square, shown round) and up to twelve photos of the shop, in the order customers see
 * them. Each file goes straight to storage, then onto the shop; images are checked and resized
 * after upload, so a new one shows "processing" until it is ready.
 */
export function PhotosForm({
  shop,
  onChange,
  onDone,
}: {
  shop: SellerShop;
  /** The shop as saved, after each change. */
  onChange: (shop: SellerShop) => void;
  onDone: () => void;
}) {
  const t = useTranslations('photos');
  const s = useTranslations('setup');
  const errorText = useErrorText();
  const images = useImageSource(shop);
  const [busy, setBusy] = useState<'logo' | 'gallery' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  /** Checks the file here first, so a wrong type or size is explained before any upload. */
  const check = (file: File, purpose: MediaPurpose) => {
    const rule = MEDIA_RULES[purpose];
    if (!rule.contentTypes.includes(file.type)) return t('wrongType');
    if (file.size > rule.maxBytes) {
      return t('tooLarge', { mb: Math.round(rule.maxBytes / 1024 / 1024) });
    }
    return null;
  };

  const save = async (patch: { logoMediaId?: string | null; galleryMediaIds?: string[] }) => {
    const result = await shopsApi.update(shop.id, patch);
    if (!result.ok) {
      setError(errorText(result.code));
      return false;
    }
    onChange(result.data);
    return true;
  };

  const addLogo = async (file: File) => {
    const problem = check(file, 'shop_logo');
    if (problem) return setError(problem);
    setBusy('logo');
    setError(null);
    const uploaded = await shopsApi.upload(shop.id, file, 'shop_logo');
    if (uploaded.ok) {
      images.remember(uploaded.data, file);
      await save({ logoMediaId: uploaded.data });
    } else setError(errorText(uploaded.code));
    setBusy(null);
  };

  const addPhotos = async (files: File[]) => {
    const room = MAX_GALLERY - shop.galleryMediaIds.length;
    const chosen = files.slice(0, room);
    for (const file of chosen) {
      const problem = check(file, 'shop_gallery');
      if (problem) return setError(problem);
    }
    setBusy('gallery');
    setError(files.length > room ? t('tooMany', { max: MAX_GALLERY }) : null);
    const ids: string[] = [];
    for (const file of chosen) {
      const uploaded = await shopsApi.upload(shop.id, file, 'shop_gallery');
      if (!uploaded.ok) {
        setError(errorText(uploaded.code));
        break;
      }
      images.remember(uploaded.data, file);
      ids.push(uploaded.data);
    }
    if (ids.length) await save({ galleryMediaIds: [...shop.galleryMediaIds, ...ids] });
    setBusy(null);
  };

  const move = (index: number, by: -1 | 1) => {
    const ids = [...shop.galleryMediaIds];
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    void save({ galleryMediaIds: ids });
  };

  const accept = MEDIA_RULES.shop_gallery.contentTypes.join(',');

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t('logo')}</h2>
        <p className="text-sm text-ink-muted">{t('logoHint')}</p>
        <div className="flex flex-wrap items-center gap-4">
          <span className="am-avatar" style={{ width: 96, height: 96 }} aria-hidden>
            {shop.logoMediaId && images.src(shop.logoMediaId) ? (
              <img src={images.src(shop.logoMediaId)} alt="" />
            ) : null}
          </span>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              iconStart="upload"
              loading={busy === 'logo'}
              loadingLabel={t('uploading')}
              onClick={() => logoInput.current?.click()}
            >
              {shop.logoMediaId ? t('replaceLogo') : t('addLogo')}
            </Button>
            {shop.logoMediaId && images.processing(shop.logoMediaId) && (
              <p className="text-sm text-ink-muted">{t('processing')}</p>
            )}
          </div>
        </div>
        <input
          ref={logoInput}
          type="file"
          accept={accept}
          hidden
          onChange={(ev) => {
            const file = ev.target.files?.[0];
            ev.target.value = '';
            if (file) void addLogo(file);
          }}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t('gallery')}</h2>
        <p className="text-sm text-ink-muted">{t('galleryHint', { max: MAX_GALLERY })}</p>
        {shop.galleryMediaIds.length > 0 && (
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shop.galleryMediaIds.map((id, index) => (
              <li key={id} className="flex flex-col gap-1">
                <div
                  className="am-media am-media-empty rounded-md"
                  style={{ aspectRatio: '4 / 3' }}
                >
                  {images.src(id) && (
                    <img src={images.src(id)} alt={t('photoN', { n: index + 1 })} />
                  )}
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs text-ink-muted">
                    {images.processing(id) ? t('processing') : t('photoN', { n: index + 1 })}
                  </span>
                  <span className="flex">
                    {index > 0 && (
                      <IconButton
                        icon="chevron-left"
                        label={t('moveEarlier')}
                        className="rtl:rotate-180"
                        onClick={() => move(index, -1)}
                      />
                    )}
                    {index < shop.galleryMediaIds.length - 1 && (
                      <IconButton
                        icon="chevron-right"
                        label={t('moveLater')}
                        className="rtl:rotate-180"
                        onClick={() => move(index, 1)}
                      />
                    )}
                    <IconButton
                      icon="x"
                      label={t('remove')}
                      onClick={() =>
                        void save({ galleryMediaIds: shop.galleryMediaIds.filter((g) => g !== id) })
                      }
                    />
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
        {shop.galleryMediaIds.length < MAX_GALLERY && (
          <Button
            type="button"
            iconStart="photo"
            className="self-start"
            loading={busy === 'gallery'}
            loadingLabel={t('uploading')}
            onClick={() => galleryInput.current?.click()}
          >
            {t('addPhotos')}
          </Button>
        )}
        <input
          ref={galleryInput}
          type="file"
          accept={accept}
          multiple
          hidden
          onChange={(ev) => {
            const files = Array.from(ev.target.files ?? []);
            ev.target.value = '';
            if (files.length) void addPhotos(files);
          }}
        />
      </section>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="primary" disabled={busy !== null} onClick={onDone}>
          {s('save')}
        </Button>
        {!shop.logoMediaId && (
          <Button type="button" variant="ghost" onClick={onDone}>
            {s('skipForNow')}
          </Button>
        )}
      </div>
    </div>
  );
}
