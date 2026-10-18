import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { pickLocalized, type Locale } from '@am/i18n';
import { Badge, countryName, CountryFlag, shopInitials } from '@am/ui';
import { BranchCard } from '@/components/shop/branch-card';
import { BranchesMap } from '@/components/shop/branches-map';
import { ContactActions } from '@/components/shop/contact-actions';
import { Gallery } from '@/components/shop/gallery';
import { ProductGrid } from '@/components/shop/product-grid';
import { ReportLink, SellerDetails } from '@/components/shop/seller-details';
import { config } from '@/lib/config';
import { MapsProvider } from '@/lib/maps';
import { categories, originCountries } from '@/lib/search/server';
import { jsonLdText, shopJsonLd } from '@/lib/shop/json-ld';
import { alternates, shopPath } from '@/lib/shop/paths';
import { getShop, shopProducts } from '@/lib/shop/server';

/** Rendered on first visit, then kept for a minute: shops change rarely, and hours are per day. */
export const revalidate = 60;

/** None at build time: each shop page is rendered on its first visit, then cached. */
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const shop = await getShop(locale, slug);
  if (!shop) return {};
  const t = await getTranslations({ locale, namespace: 'shop' });
  const e = await getTranslations({ locale, namespace: 'emirates' });
  const where = [...new Set(shop.branches.map((b) => b.area ?? e(b.emirate)))].join(', ');
  const description =
    pickLocalized(shop.description, locale as Locale) ||
    [t('verified'), where].filter(Boolean).join(' · ');
  return {
    title: where ? `${shop.name} · ${where}` : shop.name,
    description: description.slice(0, 200),
    alternates: alternates(locale, shopPath(slug)),
    openGraph: {
      type: 'website',
      title: shop.name,
      description,
      url: `/${locale}${shopPath(slug)}`,
    },
  };
}

/** A shop's page (F1-12): who, where, when open, how to reach them, and what they sell. */
export default async function ShopPage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const shop = await getShop(locale, slug);
  if (!shop) notFound();

  const [products, categoryList, countries, t] = await Promise.all([
    shopProducts(locale, slug),
    categories(locale),
    originCountries(locale),
    getTranslations('shop'),
  ]);
  const loc = locale as Locale;
  const now = new Date();
  const url = `${config.webUrl}/${locale}${shopPath(slug)}`;
  const primary = shop.branches.find((b) => b.isPrimary) ?? shop.branches[0];
  const shopCategories = categoryList.filter((c) => shop.categoryIds.includes(c.id));
  const list = new Intl.ListFormat(locale, { type: 'conjunction' });
  const origin = (code: string) => countries.find((c) => c.code === code);
  const description = pickLocalized(shop.description, loc);
  const logo = shop.logo?.card ?? shop.logo?.thumb;

  return (
    <MapsProvider>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-2 pb-12">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdText(shopJsonLd(shop, url, loc)) }}
        />
        <Gallery images={shop.gallery} label={shop.name} />

        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="am-avatar shrink-0" aria-hidden>
              {logo ? <img src={logo} alt="" /> : shopInitials(shop.name)}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="text-[26px] leading-8 font-bold">{shop.name}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="verified">{t('verified')}</Badge>
                {shop.originCountries.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
                    {shop.originCountries.map((code) => (
                      <CountryFlag key={code} code={code} />
                    ))}
                    {t('from', {
                      countries: list.format(
                        shop.originCountries.map((code) => {
                          const c = origin(code);
                          return c ? countryName(c, loc) : code;
                        }),
                      ),
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>
          {shopCategories.length > 0 && (
            <p className="text-sm text-ink-muted">
              {shopCategories.map((c) => pickLocalized(c.name, loc)).join(' · ')}
            </p>
          )}
          {description && (
            <p className="whitespace-pre-line text-[15px] leading-6">{description}</p>
          )}
          {primary && (
            <ContactActions
              shopId={shop.id}
              branchId={primary.id}
              whatsapp={primary.contactWhatsapp ?? shop.contactWhatsapp}
              phone={primary.contactPhone ?? shop.contactPhone}
              email={primary.contactEmail ?? shop.contactEmail}
              message={t('whatsappHello', { shop: shop.name })}
            />
          )}
        </header>

        <section className="flex flex-col gap-3" aria-labelledby="branches">
          <h2 id="branches" className="text-lg font-semibold">
            {t('branches', { count: shop.branches.length })}
          </h2>
          <BranchesMap
            branches={shop.branches.map((b) => ({ id: b.id, name: b.name, location: b.location }))}
          />
          {shop.branches.map((branch) => (
            <BranchCard key={branch.id} shop={shop} branch={branch} now={now} />
          ))}
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="products">
          <h2 id="products" className="text-lg font-semibold">
            {t('products')}
          </h2>
          {products.length > 0 ? (
            <ProductGrid products={products} categories={categoryList} countries={countries} />
          ) : (
            <p className="text-sm text-ink-muted">{t('noProducts')}</p>
          )}
        </section>

        <SellerDetails shop={shop} />
        <ReportLink query={{ shop: shop.slug }} label={t('report')} />
      </main>
    </MapsProvider>
  );
}
