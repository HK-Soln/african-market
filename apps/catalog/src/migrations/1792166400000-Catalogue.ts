import { MigrationInterface, QueryRunner } from 'typeorm';

interface SeedCategory {
  slug: string;
  en: string;
  ar: string;
  fr: string;
  isRestricted?: boolean;
  requiresDeclaration?: boolean;
  checkoutAllowed?: boolean;
  children?: SeedCategory[];
}

/** The launch tree (F1-04). Flags are set on every level, so each row reads true on its own. */
const TREE: Array<SeedCategory & { kind: 'product' | 'service' }> = [
  {
    slug: 'groceries-food',
    kind: 'product',
    en: 'Groceries & Food',
    ar: 'البقالة والأطعمة',
    fr: 'Épicerie et alimentation',
    requiresDeclaration: true,
    children: [
      {
        slug: 'grains-flours',
        en: 'Grains & flours',
        ar: 'الحبوب والدقيق',
        fr: 'Céréales et farines',
      },
      {
        slug: 'spices-soup-ingredients',
        en: 'Spices & soup ingredients',
        ar: 'التوابل ومكونات الحساء',
        fr: 'Épices et ingrédients pour soupes',
      },
      { slug: 'snacks', en: 'Snacks', ar: 'الوجبات الخفيفة', fr: 'En-cas' },
      { slug: 'drinks', en: 'Drinks', ar: 'المشروبات', fr: 'Boissons' },
      { slug: 'frozen', en: 'Frozen', ar: 'الأطعمة المجمدة', fr: 'Surgelés' },
    ],
  },
  {
    slug: 'beauty-hair',
    kind: 'product',
    en: 'Beauty & Hair',
    ar: 'الجمال والشعر',
    fr: 'Beauté et cheveux',
    children: [
      { slug: 'hair-wigs', en: 'Hair & wigs', ar: 'الشعر والباروكات', fr: 'Cheveux et perruques' },
      {
        slug: 'skin-care',
        en: 'Skin care',
        ar: 'العناية بالبشرة',
        fr: 'Soins de la peau',
        isRestricted: true,
      },
      {
        slug: 'cosmetics',
        en: 'Cosmetics',
        ar: 'مستحضرات التجميل',
        fr: 'Cosmétiques',
        isRestricted: true,
      },
    ],
  },
  {
    slug: 'fashion',
    kind: 'product',
    en: 'Fashion',
    ar: 'الأزياء',
    fr: 'Mode',
    children: [
      {
        slug: 'ankara-fabrics',
        en: 'Ankara & fabrics',
        ar: 'أقمشة الأنقرة والمنسوجات',
        fr: 'Wax et tissus',
      },
      { slug: 'ready-to-wear', en: 'Ready-to-wear', ar: 'الملابس الجاهزة', fr: 'Prêt-à-porter' },
      { slug: 'tailoring', en: 'Tailoring', ar: 'الخياطة حسب الطلب', fr: 'Sur mesure' },
    ],
  },
  {
    slug: 'home-culture',
    kind: 'product',
    en: 'Home & Culture',
    ar: 'المنزل والثقافة',
    fr: 'Maison et culture',
    children: [
      {
        slug: 'art-crafts',
        en: 'Art & crafts',
        ar: 'الفنون والحرف اليدوية',
        fr: 'Art et artisanat',
      },
      { slug: 'books-music', en: 'Books & music', ar: 'الكتب والموسيقى', fr: 'Livres et musique' },
    ],
  },
  {
    slug: 'services',
    kind: 'service',
    en: 'Services',
    ar: 'الخدمات',
    fr: 'Services',
    children: [
      {
        slug: 'hair-salons-braiding',
        en: 'Hair salons & braiding',
        ar: 'صالونات الشعر والضفائر',
        fr: 'Salons de coiffure et tresses',
      },
      {
        slug: 'tailoring-services',
        en: 'Tailoring',
        ar: 'الخياطة والتعديلات',
        fr: 'Couture et retouches',
      },
      {
        slug: 'events-catering',
        en: 'Events & catering',
        ar: 'المناسبات وخدمات الطعام',
        fr: 'Événements et traiteur',
      },
      {
        slug: 'money-transfer-agents',
        en: 'Money transfer agents (listing only)',
        ar: 'وكلاء تحويل الأموال (إدراج فقط)',
        fr: "Agents de transfert d'argent (annonce uniquement)",
        isRestricted: true,
        checkoutAllowed: false,
      },
      {
        slug: 'cargo-shipping',
        en: 'Cargo & shipping',
        ar: 'الشحن والبضائع',
        fr: 'Fret et expédition',
      },
      { slug: 'restaurants', en: 'Restaurants', ar: 'المطاعم', fr: 'Restaurants' },
    ],
  },
];

/**
 * F1-04: categories (seeded), products, variants, branch listings, and what the catalogue knows
 * about shops and branches from the shops service's events.
 */
export class Catalogue1792166400000 implements MigrationInterface {
  name = 'Catalogue1792166400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "catalog"."category" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "parent_id" uuid, "slug" text NOT NULL, "name" jsonb NOT NULL, "kind" text NOT NULL, "is_restricted" boolean NOT NULL DEFAULT false, "requires_declaration" boolean NOT NULL DEFAULT false, "checkout_allowed" boolean NOT NULL DEFAULT true, "sort" integer NOT NULL DEFAULT '0', "active" boolean NOT NULL DEFAULT true, CONSTRAINT "category_slug_chk" CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'), CONSTRAINT "category_kind_chk" CHECK (kind IN ('product', 'service')), CONSTRAINT "PK_9c4e4a89e3674fc9f382d733f03" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "category_parent_idx" ON "catalog"."category" ("parent_id", "sort") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "category_slug_uq" ON "catalog"."category" ("slug") WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "catalog"."product" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "shop_id" uuid NOT NULL, "category_id" uuid NOT NULL, "type" text NOT NULL, "title" jsonb NOT NULL, "description" jsonb NOT NULL DEFAULT '{}', "origin_country" text, "image_media_ids" uuid array NOT NULL DEFAULT '{}', "status" text NOT NULL DEFAULT 'draft', "review_reason" text, "reviewed_at" TIMESTAMP WITH TIME ZONE, "reviewed_by" uuid, "submitted_at" TIMESTAMP WITH TIME ZONE, "food_declaration" jsonb, CONSTRAINT "product_origin_chk" CHECK (origin_country IS NULL OR origin_country ~ '^[A-Z]{2}$'), CONSTRAINT "product_type_chk" CHECK (type IN ('product', 'service')), CONSTRAINT "product_status_chk" CHECK (status IN ('draft', 'pending_review', 'active', 'hidden', 'rejected')), CONSTRAINT "PK_bebc9158e480b949565b4dc7a82" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "product_category_idx" ON "catalog"."product" ("category_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "product_review_queue_idx" ON "catalog"."product" ("submitted_at") WHERE status = 'pending_review'`,
    );
    await queryRunner.query(
      `CREATE INDEX "product_shop_updated_idx" ON "catalog"."product" ("shop_id", "updated_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "product_shop_created_idx" ON "catalog"."product" ("shop_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "catalog"."variant" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "product_id" uuid NOT NULL, "shop_id" uuid NOT NULL, "sku" text, "options" jsonb NOT NULL DEFAULT '{}', "price_fils" integer, "compare_at_fils" integer, "sort" integer NOT NULL DEFAULT '0', CONSTRAINT "variant_compare_at_chk" CHECK (compare_at_fils IS NULL OR compare_at_fils > price_fils), CONSTRAINT "variant_price_chk" CHECK (price_fils IS NULL OR price_fils >= 0), CONSTRAINT "PK_f8043a8a34fa021a727a4718470" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "variant_shop_sku_uq" ON "catalog"."variant" ("shop_id", "sku") WHERE sku IS NOT NULL AND deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "variant_product_idx" ON "catalog"."variant" ("product_id", "sort") `,
    );
    await queryRunner.query(
      `CREATE TABLE "catalog"."branch_listing" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "branch_id" uuid NOT NULL, "variant_id" uuid NOT NULL, "product_id" uuid NOT NULL, "shop_id" uuid NOT NULL, "in_stock" boolean NOT NULL DEFAULT true, "quantity" integer, "price_override_fils" integer, CONSTRAINT "branch_listing_price_chk" CHECK (price_override_fils IS NULL OR price_override_fils >= 0), CONSTRAINT "branch_listing_quantity_chk" CHECK (quantity IS NULL OR quantity >= 0), CONSTRAINT "PK_157639818cf09e20dd8d2d6653a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "branch_listing_variant_idx" ON "catalog"."branch_listing" ("variant_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "branch_listing_product_idx" ON "catalog"."branch_listing" ("product_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "branch_listing_uq" ON "catalog"."branch_listing" ("branch_id", "variant_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "catalog"."known_shop" ("id" uuid NOT NULL, "owner_id" uuid, "verified" boolean NOT NULL DEFAULT false, "verification_changed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0f8096a0706b78e49bd114c43bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "catalog"."known_branch" ("id" uuid NOT NULL, "shop_id" uuid NOT NULL, "deleted" boolean NOT NULL DEFAULT false, "changed_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ab2b28ae7f6aec7a1975af55b50" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "known_branch_shop_idx" ON "catalog"."known_branch" ("shop_id") `,
    );

    // Seed data only (the tree the directive names), no logic.
    for (const [rootSort, root] of TREE.entries()) {
      const [{ id: rootId }] = await this.insertCategory(
        queryRunner,
        root,
        root.kind,
        null,
        rootSort,
      );
      for (const [sort, child] of (root.children ?? []).entries()) {
        await this.insertCategory(
          queryRunner,
          {
            ...child,
            isRestricted: child.isRestricted ?? root.isRestricted,
            requiresDeclaration: child.requiresDeclaration ?? root.requiresDeclaration,
            checkoutAllowed: child.checkoutAllowed ?? root.checkoutAllowed,
          },
          root.kind,
          rootId,
          sort,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "catalog"."known_branch_shop_idx"`);
    await queryRunner.query(`DROP TABLE "catalog"."known_branch"`);
    await queryRunner.query(`DROP TABLE "catalog"."known_shop"`);
    await queryRunner.query(`DROP INDEX "catalog"."branch_listing_uq"`);
    await queryRunner.query(`DROP INDEX "catalog"."branch_listing_product_idx"`);
    await queryRunner.query(`DROP INDEX "catalog"."branch_listing_variant_idx"`);
    await queryRunner.query(`DROP TABLE "catalog"."branch_listing"`);
    await queryRunner.query(`DROP INDEX "catalog"."variant_product_idx"`);
    await queryRunner.query(`DROP INDEX "catalog"."variant_shop_sku_uq"`);
    await queryRunner.query(`DROP TABLE "catalog"."variant"`);
    await queryRunner.query(`DROP INDEX "catalog"."product_shop_created_idx"`);
    await queryRunner.query(`DROP INDEX "catalog"."product_shop_updated_idx"`);
    await queryRunner.query(`DROP INDEX "catalog"."product_review_queue_idx"`);
    await queryRunner.query(`DROP INDEX "catalog"."product_category_idx"`);
    await queryRunner.query(`DROP TABLE "catalog"."product"`);
    await queryRunner.query(`DROP INDEX "catalog"."category_slug_uq"`);
    await queryRunner.query(`DROP INDEX "catalog"."category_parent_idx"`);
    await queryRunner.query(`DROP TABLE "catalog"."category"`);
  }

  private insertCategory(
    queryRunner: QueryRunner,
    category: SeedCategory,
    kind: 'product' | 'service',
    parentId: string | null,
    sort: number,
  ): Promise<Array<{ id: string }>> {
    return queryRunner.query(
      `INSERT INTO "catalog"."category"
         ("parent_id", "slug", "name", "kind", "is_restricted", "requires_declaration", "checkout_allowed", "sort")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING "id"`,
      [
        parentId,
        category.slug,
        JSON.stringify({ en: category.en, ar: category.ar, fr: category.fr }),
        kind,
        category.isRestricted ?? false,
        category.requiresDeclaration ?? false,
        category.checkoutAllowed ?? true,
        sort * 10,
      ],
    );
  }
}
