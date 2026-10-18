#!/usr/bin/env node
/**
 * Fills a test environment with made-up shops through the gateway, as a seller and an admin
 * would (decision T-39): sign-up by test number, shops, branches, hours, products, the stand-in
 * identity check, admin approval, and search opened in Dubai and Sharjah (Abu Dhabi stays closed,
 * to show that state). Never run it against staging or production: it needs OTP_TEST_NUMBERS,
 * which identity refuses there.
 *
 *   node tools/test-env/seed.mjs        (SEED_GATEWAY_URL defaults to http://localhost:4000)
 *
 * Running it again skips shops that already exist.
 */
import { execFileSync } from 'node:child_process';

const GATEWAY = (process.env.SEED_GATEWAY_URL ?? 'http://localhost:4000') + '/api/v1';
const SELLER = '+971500000010';
const ADMIN = '+971500000011';

/** The fixed codes, from the same variable identity reads. */
const codes = new Map(
  (process.env.OTP_TEST_NUMBERS ?? '')
    .split(',')
    .filter(Boolean)
    .map((entry) => entry.trim().split(':')),
);

async function call(method, path, token, body) {
  const response = await fetch(GATEWAY + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
}

async function signIn(phone) {
  const code = codes.get(phone);
  if (!code) throw new Error(`${phone} is not in OTP_TEST_NUMBERS`);
  // A number may ask for a code once every 30 seconds: wait it out when signing in again.
  for (;;) {
    try {
      await call('POST', '/auth/otp/request', undefined, { phone });
      break;
    } catch (error) {
      const wait = /"retryAfterSeconds":(\d+)/.exec(error.message)?.[1];
      if (!wait) throw error;
      console.log(`  waiting ${wait} s to ask for another code`);
      await new Promise((resolve) => setTimeout(resolve, (Number(wait) + 1) * 1000));
    }
  }
  const session = await call('POST', '/auth/otp/verify', undefined, {
    phone,
    code,
    termsAccepted: true,
    preferredLanguage: 'en',
  });
  return session;
}

/**
 * Catalog learns of a new shop or branch from an event, a moment after the shops service made
 * it: retry a catalog call until it knows them (up to 30 s).
 */
async function untilKnown(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!/CATALOG_(SHOP|BRANCH)_NOT_FOUND/.test(error.message) || attempt >= 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

const EVERY_DAY = (opensAt, closesAt, closedOn = []) =>
  [0, 1, 2, 3, 4, 5, 6]
    .filter((day) => !closedOn.includes(day))
    .map((weekday) => ({ weekday, opensAt, closesAt }));

const SHOPS = [
  {
    name: 'Mama Nkechi African Foods',
    description: {
      en: 'Nigerian groceries: egusi, ogbono, garri, palm oil and stockfish.',
      ar: 'بقالة نيجيرية: إيغوسي وأوغبونو وغاري وزيت النخيل والسمك المجفف.',
    },
    category: 'groceries-food',
    originCountries: ['NG'],
    contactWhatsapp: '+971501110001',
    contactPhone: '+971501110001',
    branch: {
      name: 'Al Nahda',
      emirate: 'DXB',
      area: 'Al Nahda',
      location: { lat: 25.2897, lng: 55.3712 },
      pickup: true,
      delivery: true,
      serviceRadiusM: 8000,
    },
    hours: EVERY_DAY('09:00', '22:00'),
    products: [
      {
        category: 'spices-soup-ingredients',
        en: 'Egusi seeds 500 g',
        ar: 'بذور إيغوسي 500 غ',
        fils: 1800,
      },
      { category: 'spices-soup-ingredients', en: 'Ogbono 250 g', ar: 'أوغبونو 250 غ', fils: 2200 },
      { category: 'grains-flours', en: 'Yellow garri 2 kg', ar: 'غاري أصفر 2 كغ', fils: 2500 },
    ],
  },
  {
    name: 'Accra Braids Lounge',
    description: {
      en: 'Knotless braids, cornrows and wig installs by Ghanaian stylists.',
      ar: 'ضفائر بدون عقد وكورنرو وتركيب باروكات على يد مصففات من غانا.',
    },
    category: 'services',
    originCountries: ['GH'],
    contactWhatsapp: '+971501110002',
    branch: {
      name: 'Deira',
      emirate: 'DXB',
      area: 'Deira',
      location: { lat: 25.2711, lng: 55.3075 },
      pickup: true,
      delivery: false,
    },
    // Closed on Sundays, to show a closed shop on that day.
    hours: EVERY_DAY('10:00', '21:00', [0]),
    products: [
      {
        category: 'hair-salons-braiding',
        en: 'Knotless braids',
        ar: 'ضفائر بدون عقد',
        fils: 25000,
      },
    ],
  },
  {
    name: 'Addis Spice House',
    description: {
      en: 'Ethiopian berbere, mitmita, coffee and injera flour.',
      ar: 'بربري وميتميتا وقهوة ودقيق إنجيرا من إثيوبيا.',
    },
    category: 'groceries-food',
    originCountries: ['ET'],
    contactWhatsapp: '+971501110003',
    contactPhone: '+971501110003',
    branch: {
      name: 'Al Majaz',
      emirate: 'SHJ',
      area: 'Al Majaz',
      location: { lat: 25.326, lng: 55.386 },
      pickup: true,
      delivery: true,
      serviceRadiusM: 12000,
    },
    hours: EVERY_DAY('08:00', '23:00'),
    products: [
      { category: 'spices-soup-ingredients', en: 'Berbere 250 g', ar: 'بربري 250 غ', fils: 1500 },
      { category: 'grains-flours', en: 'Teff flour 1 kg', ar: 'دقيق التيف 1 كغ', fils: 2800 },
    ],
  },
  {
    name: 'Kente & Ankara Tailors',
    description: {
      en: 'Made-to-measure Ankara and Kente outfits.',
      ar: 'أزياء أنقرة وكنتي حسب المقاس.',
    },
    category: 'fashion',
    originCountries: ['GH', 'NG'],
    contactWhatsapp: '+971501110004',
    branch: {
      name: 'Mussafah',
      emirate: 'AUH',
      area: 'Mussafah',
      location: { lat: 24.35, lng: 54.5 },
      pickup: true,
      delivery: false,
    },
    hours: EVERY_DAY('10:00', '20:00'),
    products: [
      {
        category: 'tailoring',
        en: 'Ankara dress, made to measure',
        ar: 'فستان أنقرة حسب المقاس',
        fils: 32000,
      },
    ],
  },
];

/** Search opens in these; the others stay closed (an admin's switch, F1-08). */
const OPEN_EMIRATES = ['DXB', 'SHJ'];

async function main() {
  console.log(`Seeding ${GATEWAY}`);
  const categories = new Map((await call('GET', '/categories')).items.map((c) => [c.slug, c]));
  const category = (slug) => {
    const found = categories.get(slug);
    if (!found) throw new Error(`No category ${slug}`);
    return found;
  };

  // The admin: signs up, gets the role from the identity container, signs in again for it.
  let admin = await signIn(ADMIN);
  if (!admin.user.roles.includes('admin')) {
    execFileSync(
      'docker',
      ['compose', 'exec', '-T', 'identity', 'node', 'dist/scripts/grant-role.js', ADMIN, 'admin'],
      { stdio: 'inherit' },
    );
    admin = await signIn(ADMIN);
  }
  const adminToken = admin.accessToken;
  const seller = (await signIn(SELLER)).accessToken;
  const mine = (await call('GET', '/seller/shops?limit=100', seller)).items;

  // Each step is skipped when already done, so a run that stopped half way can be run again.
  for (const spec of SHOPS) {
    let shop = mine.find((s) => s.name === spec.name);
    if (shop?.verificationStatus === 'verified') {
      console.log(`- ${spec.name}: already verified`);
      continue;
    }
    shop ??= await call('POST', '/seller/shops', seller, {
      name: spec.name,
      description: spec.description,
      categoryIds: [category(spec.category).id],
      originCountries: spec.originCountries,
      contactWhatsapp: spec.contactWhatsapp,
      contactPhone: spec.contactPhone,
    });
    const base = `/seller/shops/${shop.id}`;
    shop = await call('GET', base, seller);
    const branch =
      shop.branches?.find((b) => b.name === spec.branch.name) ??
      (await call('POST', `${base}/branches`, seller, { ...spec.branch, isPrimary: true }));
    await call('PUT', `${base}/branches/${branch.id}/hours`, seller, { hours: spec.hours });

    const products = (await untilKnown(() => call('GET', `${base}/products?limit=100`, seller)))
      .items;
    for (const p of spec.products) {
      const c = category(p.category);
      const product =
        products.find((x) => x.title?.en === p.en) ??
        (await untilKnown(() =>
          call('POST', `${base}/products`, seller, {
            categoryId: c.id,
            title: { en: p.en, ar: p.ar },
            originCountry: spec.originCountries[0],
            variants: [{ priceFils: p.fils }],
            ...(c.requiresDeclaration
              ? {
                  foodDeclaration: {
                    packagedAndLabelled: true,
                    noRestrictedItems: true,
                    storage: 'ambient',
                  },
                }
              : {}),
          }),
        ));
      await untilKnown(() =>
        call('PUT', `${base}/products/${product.id}/listings`, seller, {
          listings: [{ branchId: branch.id, variantId: product.variants[0].id, inStock: true }],
        }),
      );
      if (product.status !== 'active' && product.status !== 'pending_review') {
        await call('PUT', `${base}/products/${product.id}/status`, seller, { status: 'active' });
      }
    }

    // The stand-in identity check passes as soon as its result is asked for.
    if (shop.kycStatus !== 'passed') {
      if (shop.kycStatus === 'none') {
        await call('POST', `${base}/verification/kyc`, seller, { locale: 'en' });
      }
      await call('POST', `${base}/verification/kyc/refresh`, seller);
    }
    if (shop.verificationStatus !== 'pending') {
      await call('POST', `${base}/verification/submit`, seller);
    }
    await call('POST', `/admin/shops/${shop.id}/listing`, adminToken, { decision: 'approve' });
    console.log(`+ ${spec.name} (${spec.branch.emirate})`);
  }

  // Products in categories that are reviewed first.
  const review = await call('GET', '/admin/products/review?limit=100', adminToken);
  for (const product of review.items) {
    await call('POST', `/admin/products/${product.id}/decision`, adminToken, {
      decision: 'approve',
    });
  }

  for (const code of OPEN_EMIRATES) {
    await call('PUT', `/admin/emirates/${code}/search`, adminToken, { open: true });
  }
  console.log(`Search open in ${OPEN_EMIRATES.join(', ')}. Seller ${SELLER}, admin ${ADMIN}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
