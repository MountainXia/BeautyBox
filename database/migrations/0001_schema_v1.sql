-- =============================================================================
-- 妆匣 BeautyBox · SQLite Schema V1 正式 DDL
-- 基线依据：BeautyBox V3.1-Frozen（ADR-0001 / ADR-0002 / SQLite前置清单）
-- 说明：
--   1. 外键约束必须由数据库连接在事务外执行：PRAGMA foreign_keys = ON;
--   2. 全表严格禁用 REAL / FLOAT 金额存储，金额统一使用 INTEGER 最小货币单位 + ISO 4217
--   3. 纯日期字段统一使用 YYYY-MM-DD（TEXT）并以 SQLite 内置 date(col) = col 校验真实日历
--   4. 时间戳字段统一使用 ISO-8601 UTC（TEXT）
--   5. 全库共 22 张表（21 张 V3.1 业务核心表 + 1 张 schema_migrations 版本治理表）
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. schema_migrations（Schema 版本迁移治理记录）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY CHECK (version >= 1),
    migration_key TEXT NOT NULL UNIQUE CHECK (length(trim(migration_key)) > 0),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    checksum_sha256 TEXT NOT NULL CHECK (length(checksum_sha256) = 64),
    applied_at TEXT NOT NULL CHECK (length(trim(applied_at)) > 0)
);

-- -----------------------------------------------------------------------------
-- 2. categories（可扩展多级分类字典：V1 固化 9 一级 / 45 二级 / 93 三级，共 147 节点）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    parent_id TEXT NULL REFERENCES categories(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    level INTEGER NOT NULL CHECK (level >= 1),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    definition TEXT NULL,
    examples_text TEXT NULL,
    default_unit TEXT NOT NULL CHECK (length(trim(default_unit)) > 0),
    allow_direct_product INTEGER NOT NULL DEFAULT 0 CHECK (allow_direct_product IN (0, 1)),
    expiry_management_mode TEXT NOT NULL DEFAULT 'tracked' CHECK (expiry_management_mode IN ('tracked', 'optional')),
    has_specialty_attrs INTEGER NOT NULL DEFAULT 0 CHECK (has_specialty_attrs IN (0, 1)),
    specialty_group_code TEXT NULL CHECK (
        specialty_group_code IS NULL OR
        specialty_group_code IN ('none', 'makeup', 'skincare', 'fragrance', 'haircare', 'tool', 'lens')
    ),
    is_system INTEGER NOT NULL DEFAULT 1 CHECK (is_system IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    deprecated_by_code TEXT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
    updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0),
    deleted_at TEXT NULL,
    CHECK ((level = 1 AND parent_id IS NULL) OR (level > 1 AND parent_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_active_level ON categories(is_active, level, sort_order);

-- -----------------------------------------------------------------------------
-- 3. brands（品牌主数据，归一化去重）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    normalized_name TEXT NOT NULL UNIQUE CHECK (length(trim(normalized_name)) > 0),
    created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
    updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0)
);

-- -----------------------------------------------------------------------------
-- 4. media_assets（App 沙盒媒体文件元数据唯一索引与引用清理锚点）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    relative_path TEXT NOT NULL UNIQUE CHECK (length(trim(relative_path)) > 0),
    thumbnail_path TEXT NULL CHECK (thumbnail_path IS NULL OR length(trim(thumbnail_path)) > 0),
    media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image')),
    mime_type TEXT NOT NULL CHECK (length(trim(mime_type)) > 0),
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    pixel_width INTEGER NULL CHECK (pixel_width IS NULL OR pixel_width > 0),
    pixel_height INTEGER NULL CHECK (pixel_height IS NULL OR pixel_height > 0),
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
    updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0)
);

-- -----------------------------------------------------------------------------
-- 5. products（产品主档：同款共享不变本质特征 + 7 天回收站作用域）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    brand_id TEXT NULL REFERENCES brands(id) ON DELETE SET NULL ON UPDATE RESTRICT,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    is_custom_name INTEGER NOT NULL DEFAULT 0 CHECK (is_custom_name IN (0, 1)),
    spec_value TEXT NULL CHECK (spec_value IS NULL OR length(trim(spec_value)) > 0),
    spec_unit TEXT NULL CHECK (spec_unit IS NULL OR length(trim(spec_unit)) > 0),
    shade TEXT NULL,
    category_attrs_schema_ver INTEGER NOT NULL DEFAULT 1 CHECK (category_attrs_schema_ver >= 1),
    category_attrs_json TEXT NULL CHECK (category_attrs_json IS NULL OR json_valid(category_attrs_json)),
    notes_private TEXT NULL,
    migration_legacy_category_raw TEXT NULL,
    migration_review_status TEXT NULL CHECK (
        migration_review_status IS NULL OR
        migration_review_status IN ('pending_category_review', 'confirmed')
    ),
    archived_at TEXT NULL,
    deleted_at TEXT NULL,
    trash_expires_at TEXT NULL,
    trash_scope TEXT NULL CHECK (trash_scope IS NULL OR trash_scope IN ('direct')),
    delete_batch_id TEXT NULL,
    created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
    updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0),
    CHECK (
        (deleted_at IS NULL AND trash_expires_at IS NULL AND trash_scope IS NULL AND delete_batch_id IS NULL)
        OR
        (deleted_at IS NOT NULL AND trash_expires_at IS NOT NULL AND trash_scope = 'direct' AND delete_batch_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_products_category_active ON products(category_id, deleted_at, archived_at);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_trash ON products(deleted_at, trash_expires_at);

-- -----------------------------------------------------------------------------
-- 6. product_lens_profiles（美瞳 Product 级周期与光学参数 1:0..1 结构表）
--    replacement_cycle_code 为美瞳更换周期唯一事实来源
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_lens_profiles (
    product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    replacement_cycle_code TEXT NOT NULL CHECK (
        replacement_cycle_code IN ('daily', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'other')
    ),
    bc_mm TEXT NULL CHECK (bc_mm IS NULL OR length(trim(bc_mm)) > 0),
    dia_mm TEXT NULL CHECK (dia_mm IS NULL OR length(trim(dia_mm)) > 0),
    water_content_percent INTEGER NULL CHECK (water_content_percent IS NULL OR (water_content_percent BETWEEN 1 AND 99)),
    pack_piece_count INTEGER NULL CHECK (pack_piece_count IS NULL OR pack_piece_count > 0),
    lens_color_pattern TEXT NULL,
    created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
    updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_lens_profiles_cycle ON product_lens_profiles(replacement_cycle_code);

-- 确保只有美瞳主类（specialty_group_code = 'lens'）的产品才能绑定 product_lens_profiles
CREATE TRIGGER IF NOT EXISTS trg_lens_profile_require_lens_category_insert
BEFORE INSERT ON product_lens_profiles
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, '非美瞳产品禁止关联 product_lens_profiles')
    WHERE NOT EXISTS (
        SELECT 1
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE p.id = NEW.product_id
          AND c.specialty_group_code = 'lens'
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_lens_profile_require_lens_category_update
BEFORE UPDATE OF product_id ON product_lens_profiles
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, '非美瞳产品禁止关联 product_lens_profiles')
    WHERE NOT EXISTS (
        SELECT 1
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE p.id = NEW.product_id
          AND c.specialty_group_code = 'lens'
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_product_forbid_non_lens_with_profile
BEFORE UPDATE OF category_id ON products
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, '存在美瞳专属资料时禁止变更至非美瞳分类')
    WHERE EXISTS (
        SELECT 1 FROM product_lens_profiles WHERE product_id = NEW.id
    )
    AND NOT EXISTS (
        SELECT 1 FROM categories WHERE id = NEW.category_id AND specialty_group_code = 'lens'
    );
END;

-- -----------------------------------------------------------------------------
-- 7. product_photos（产品多图关联，is_cover = 1 为封面唯一真相源）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_photos (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1)),
    created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_photos_single_cover
    ON product_photos(product_id) WHERE is_cover = 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_photos_unique_asset
    ON product_photos(product_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_product_photos_order
    ON product_photos(product_id, sort_order, created_at);

-- -----------------------------------------------------------------------------
-- 8. product_items（独立实物实例：每瓶/每支/每一盒独立美瞳包装）
--    严格践行 V3.1 单盒粒度、4层日期、严禁 idle 回归、7天回收站父子批次隔离
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_items (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    acquire_channel TEXT NULL,
    purchase_price_minor INTEGER NULL CHECK (purchase_price_minor IS NULL OR purchase_price_minor >= 0),
    currency_code TEXT NOT NULL DEFAULT 'CNY' CHECK (
        currency_code IN ('CNY', 'HKD', 'USD', 'GBP', 'JPY', 'KRW', 'EUR', 'TWD', 'SGD', 'AUD', 'CAD', 'THB', 'CHF', 'KWD', 'BHD', 'OMR')
    ),
    purchase_date TEXT NULL CHECK (purchase_date IS NULL OR (length(purchase_date) = 10 AND date(purchase_date) = purchase_date)),
    lifecycle_status TEXT NOT NULL DEFAULT 'unrecorded' CHECK (
        lifecycle_status IN ('unrecorded', 'unopened', 'in_use', 'finished')
    ),
    remaining_percent INTEGER NULL CHECK (remaining_percent IS NULL OR (remaining_percent BETWEEN 0 AND 100)),
    lifecycle_note TEXT NULL,
    manufacture_date TEXT NULL CHECK (manufacture_date IS NULL OR (length(manufacture_date) = 10 AND date(manufacture_date) = manufacture_date)),
    unopened_shelf_months INTEGER NULL CHECK (unopened_shelf_months IS NULL OR unopened_shelf_months > 0),
    packaging_exp_date TEXT NULL CHECK (packaging_exp_date IS NULL OR (length(packaging_exp_date) = 10 AND date(packaging_exp_date) = packaging_exp_date)),
    opened_date TEXT NULL CHECK (opened_date IS NULL OR (length(opened_date) = 10 AND date(opened_date) = opened_date)),
    pao_months INTEGER NULL CHECK (pao_months IS NULL OR pao_months > 0),
    computed_expiry_date TEXT NULL CHECK (computed_expiry_date IS NULL OR (length(computed_expiry_date) = 10 AND date(computed_expiry_date) = computed_expiry_date)),
    computed_expiry_basis TEXT NOT NULL DEFAULT 'insufficient' CHECK (
        computed_expiry_basis IN (
            'unrecorded', 'packaging_exp', 'mfg_plus_shelf', 'opened_pao_only',
            'min_unopened_and_pao', 'lens_open_cycle', 'min_lens_exp_and_cycle', 'insufficient'
        )
    ),
    confirmed_expiry_date TEXT NULL CHECK (confirmed_expiry_date IS NULL OR (length(confirmed_expiry_date) = 10 AND date(confirmed_expiry_date) = confirmed_expiry_date)),
    expiry_confirmed_at TEXT NULL,
    confirmed_input_fingerprint TEXT NULL,
    finished_at TEXT NULL CHECK (finished_at IS NULL OR (length(finished_at) = 10 AND date(finished_at) = finished_at)),
    last_used_at TEXT NULL,
    lens_eye_side TEXT NULL CHECK (lens_eye_side IS NULL OR lens_eye_side IN ('unspecified', 'left', 'right', 'both')),
    lens_power TEXT NULL CHECK (
        lens_power IS NULL OR
        (
            length(trim(lens_power)) > 0
            AND lens_power = trim(lens_power)
            AND lens_power NOT LIKE '%/%'
            AND lens_power NOT LIKE '%,%'
            AND lens_power NOT LIKE '%;%'
            AND lens_power NOT LIKE '%|%'
            AND lens_power NOT LIKE '% %'
        )
    ),
    batch_code TEXT NULL CHECK (batch_code IS NULL OR length(trim(batch_code)) > 0),
    migration_legacy_status TEXT NULL,
    migration_review_status TEXT NULL CHECK (
        migration_review_status IS NULL OR
        migration_review_status IN ('pending_idle_review', 'confirmed')
    ),
    migration_audit_json TEXT NULL CHECK (migration_audit_json IS NULL OR json_valid(migration_audit_json)),
    archived_at TEXT NULL,
    deleted_at TEXT NULL,
    trash_expires_at TEXT NULL,
    trash_scope TEXT NULL CHECK (trash_scope IS NULL OR trash_scope IN ('direct', 'cascade_with_product')),
    deleted_by_parent_id TEXT NULL REFERENCES products(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    delete_batch_id TEXT NULL,
    created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
    updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0),
    CHECK (opened_date IS NULL OR manufacture_date IS NULL OR opened_date >= manufacture_date),
    CHECK (finished_at IS NULL OR opened_date IS NULL OR finished_at >= opened_date),
    CHECK (lifecycle_status != 'unrecorded' OR (remaining_percent IS NULL AND opened_date IS NULL AND finished_at IS NULL)),
    CHECK (lifecycle_status != 'finished' OR remaining_percent = 0),
    CHECK ((confirmed_expiry_date IS NULL AND expiry_confirmed_at IS NULL) OR (confirmed_expiry_date IS NOT NULL AND expiry_confirmed_at IS NOT NULL)),
    CHECK (
        (deleted_at IS NULL AND trash_expires_at IS NULL AND trash_scope IS NULL AND deleted_by_parent_id IS NULL AND delete_batch_id IS NULL)
        OR
        (
            deleted_at IS NOT NULL AND trash_expires_at IS NOT NULL AND delete_batch_id IS NOT NULL AND
            (
                (trash_scope = 'direct' AND deleted_by_parent_id IS NULL)
                OR
                (trash_scope = 'cascade_with_product' AND deleted_by_parent_id = product_id)
            )
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_product_items_product_active ON product_items(product_id, deleted_at, lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_product_items_expiry ON product_items(confirmed_expiry_date, computed_expiry_date);
CREATE INDEX IF NOT EXISTS idx_product_items_currency ON product_items(currency_code, purchase_price_minor);
CREATE INDEX IF NOT EXISTS idx_product_items_trash ON product_items(deleted_at, trash_expires_at, trash_scope, deleted_by_parent_id, delete_batch_id);
CREATE INDEX IF NOT EXISTS idx_product_items_lens ON product_items(product_id, lens_eye_side, lens_power);

-- -----------------------------------------------------------------------------
-- 9. looks（妆容日记主记录：四项评分全部选填 NULL、7天回收站）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS looks (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    look_date TEXT NOT NULL CHECK (length(look_date) = 10 AND date(look_date) = look_date),
    style TEXT NULL,
    scene TEXT NULL,
    started_at TEXT NULL,
    finished_at TEXT NULL,
    duration_minutes INTEGER NULL CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
    duration_source TEXT NOT NULL DEFAULT 'unknown' CHECK (duration_source IN ('timestamps', 'manual', 'unknown')),
    cover_asset_id TEXT NULL REFERENCES media_assets(id) ON DELETE SET NULL ON UPDATE RESTRICT,
    self_rating INTEGER NULL CHECK (self_rating IS NULL OR (self_rating BETWEEN 1 AND 5)),
    coordination_rating INTEGER NULL CHECK (coordination_rating IS NULL OR (coordination_rating BETWEEN 1 AND 5)),
    color_rating INTEGER NULL CHECK (color_rating IS NULL OR (color_rating BETWEEN 1 AND 5)),
    wear_rating INTEGER NULL CHECK (wear_rating IS NULL OR (wear_rating BETWEEN 1 AND 5)),
    tags_json TEXT NULL CHECK (tags_json IS NULL OR json_valid(tags_json)),
    notes_private TEXT NULL,
    archived_at TEXT NULL,
    deleted_at TEXT NULL,
    trash_expires_at TEXT NULL,
    trash_scope TEXT NULL CHECK (trash_scope IS NULL OR trash_scope IN ('direct')),
    delete_batch_id TEXT NULL,
    created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
    updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0),
    CHECK (
        (deleted_at IS NULL AND trash_expires_at IS NULL AND trash_scope IS NULL AND delete_batch_id IS NULL)
        OR
        (deleted_at IS NOT NULL AND trash_expires_at IS NOT NULL AND trash_scope = 'direct' AND delete_batch_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_looks_date_active ON looks(look_date, deleted_at);
CREATE INDEX IF NOT EXISTS idx_looks_trash ON looks(deleted_at, trash_expires_at);

-- -----------------------------------------------------------------------------
-- 10. look_photos（妆容主图与多细节图关联）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS look_photos (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    look_id TEXT NOT NULL REFERENCES looks(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    photo_role TEXT NOT NULL DEFAULT 'detail' CHECK (photo_role IN ('main', 'detail')),
    captured_at TEXT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_look_photos_unique_asset ON look_photos(look_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_look_photos_order ON look_photos(look_id, sort_order);

-- -----------------------------------------------------------------------------
-- 11. look_product_items（妆容实际使用单品关联 + 不可变历史快照）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS look_product_items (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    look_id TEXT NOT NULL REFERENCES looks(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    product_item_id TEXT NULL REFERENCES product_items(id) ON DELETE SET NULL ON UPDATE RESTRICT,
    step_key TEXT NULL,
    step_order INTEGER NOT NULL DEFAULT 0 CHECK (step_order >= 0),
    product_name_snapshot TEXT NOT NULL CHECK (length(trim(product_name_snapshot)) > 0),
    brand_name_snapshot TEXT NULL,
    shade_snapshot TEXT NULL,
    category_snapshot TEXT NULL,
    spec_snapshot TEXT NULL,
    created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_look_product_items_look_order ON look_product_items(look_id, step_order);
CREATE INDEX IF NOT EXISTS idx_look_product_items_item ON look_product_items(product_item_id);

-- -----------------------------------------------------------------------------
-- 12. wear_reviews（持妆时间线记录）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wear_reviews (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    look_id TEXT NOT NULL REFERENCES looks(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    asset_id TEXT NULL REFERENCES media_assets(id) ON DELETE SET NULL ON UPDATE RESTRICT,
    captured_at TEXT NOT NULL CHECK (length(trim(captured_at)) > 0),
    wear_minutes INTEGER NOT NULL CHECK (wear_minutes >= 0),
    wear_minutes_source TEXT NOT NULL DEFAULT 'manual' CHECK (wear_minutes_source IN ('timestamps', 'manual')),
    timepoint_key TEXT NOT NULL CHECK (timepoint_key IN ('fresh', 'h2', 'h4', 'h6', 'h8', 'custom')),
    overall_rating INTEGER NULL CHECK (overall_rating IS NULL OR (overall_rating BETWEEN 1 AND 5)),
    smudge_level INTEGER NULL CHECK (smudge_level IS NULL OR (smudge_level BETWEEN 0 AND 4)),
    oxidation_level INTEGER NULL CHECK (oxidation_level IS NULL OR (oxidation_level BETWEEN 0 AND 4)),
    makeup_loss_level INTEGER NULL CHECK (makeup_loss_level IS NULL OR (makeup_loss_level BETWEEN 0 AND 4)),
    oil_level INTEGER NULL CHECK (oil_level IS NULL OR (oil_level BETWEEN 0 AND 4)),
    caking_level INTEGER NULL CHECK (caking_level IS NULL OR (caking_level BETWEEN 0 AND 4)),
    floating_level INTEGER NULL CHECK (floating_level IS NULL OR (floating_level BETWEEN 0 AND 4)),
    patchiness_level INTEGER NULL CHECK (patchiness_level IS NULL OR (patchiness_level BETWEEN 0 AND 4)),
    notes_private TEXT NULL,
    created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
    updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_wear_reviews_look_time ON wear_reviews(look_id, captured_at);

-- -----------------------------------------------------------------------------
-- 13. product_usage_logs（日常单品使用打卡与美瞳单盒佩戴流水）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_usage_logs (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    product_item_id TEXT NOT NULL REFERENCES product_items(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    used_at TEXT NOT NULL CHECK (length(trim(used_at)) > 0),
    wear_count_delta INTEGER NOT NULL DEFAULT 1 CHECK (wear_count_delta >= 0),
    scene TEXT NULL,
    feeling TEXT NULL,
    notes_private TEXT NULL,
    created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
    updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_item_time ON product_usage_logs(product_item_id, used_at);

-- -----------------------------------------------------------------------------
-- 14. skin_diaries（主观肌肤状态日记，非医疗诊断）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skin_diaries (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    diary_date TEXT NOT NULL CHECK (length(diary_date) = 10 AND date(diary_date) = diary_date),
    mood_tags_json TEXT NULL CHECK (mood_tags_json IS NULL OR json_valid(mood_tags_json)),
    notes_private TEXT NULL,
    created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
    updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_skin_diaries_date ON skin_diaries(diary_date);

-- -----------------------------------------------------------------------------
-- 15. skin_diary_photos（肌肤日记多图关联）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skin_diary_photos (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    skin_diary_id TEXT NOT NULL REFERENCES skin_diaries(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_skin_diary_photos_unique_asset ON skin_diary_photos(skin_diary_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_skin_diary_photos_order ON skin_diary_photos(skin_diary_id, sort_order);

-- -----------------------------------------------------------------------------
-- 16～20. routines / routine_steps / routine_step_products / routine_logs / routine_log_items
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routines (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    period_type TEXT NOT NULL CHECK (period_type IN ('morning', 'evening', 'weekly', 'custom')),
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
    updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0),
    archived_at TEXT NULL
);

CREATE TABLE IF NOT EXISTS routine_steps (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
    updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_routine_steps_routine ON routine_steps(routine_id, sort_order);

CREATE TABLE IF NOT EXISTS routine_step_products (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    routine_step_id TEXT NOT NULL REFERENCES routine_steps(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    product_item_id TEXT NULL REFERENCES product_items(id) ON DELETE SET NULL ON UPDATE RESTRICT,
    product_name_snapshot TEXT NOT NULL CHECK (length(trim(product_name_snapshot)) > 0),
    brand_name_snapshot TEXT NULL,
    shade_snapshot TEXT NULL,
    category_snapshot TEXT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS idx_routine_step_products_step ON routine_step_products(routine_step_id, sort_order);

CREATE TABLE IF NOT EXISTS routine_logs (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    performed_at TEXT NOT NULL CHECK (length(trim(performed_at)) > 0),
    completed INTEGER NOT NULL DEFAULT 1 CHECK (completed IN (0, 1)),
    notes_private TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_routine_logs_routine_time ON routine_logs(routine_id, performed_at);

CREATE TABLE IF NOT EXISTS routine_log_items (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    routine_log_id TEXT NOT NULL REFERENCES routine_logs(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    routine_step_id TEXT NULL REFERENCES routine_steps(id) ON DELETE SET NULL ON UPDATE RESTRICT,
    product_item_id TEXT NULL REFERENCES product_items(id) ON DELETE SET NULL ON UPDATE RESTRICT,
    product_name_snapshot TEXT NOT NULL CHECK (length(trim(product_name_snapshot)) > 0),
    brand_name_snapshot TEXT NULL,
    shade_snapshot TEXT NULL,
    category_snapshot TEXT NULL,
    completed INTEGER NOT NULL DEFAULT 1 CHECK (completed IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_routine_log_items_log ON routine_log_items(routine_log_id);

-- -----------------------------------------------------------------------------
-- 21. app_settings（离线应用偏好设置：主展示币种、临期阈值、iCloud 默认关闭开关）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY CHECK (length(trim(key)) > 0),
    value_json TEXT NOT NULL CHECK (json_valid(value_json)),
    updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0)
);

-- -----------------------------------------------------------------------------
-- 22. backup_manifests（.beautyboxbackup 本地备份清单与一致性追踪）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backup_manifests (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    backup_format_version INTEGER NOT NULL CHECK (backup_format_version >= 1),
    schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
    created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
    app_version TEXT NOT NULL CHECK (length(trim(app_version)) > 0),
    database_sha256 TEXT NOT NULL CHECK (length(database_sha256) = 64),
    media_count INTEGER NOT NULL CHECK (media_count >= 0),
    total_bytes INTEGER NOT NULL CHECK (total_bytes >= 0),
    destination_kind TEXT NOT NULL CHECK (destination_kind IN ('local_export', 'local_safety_point', 'icloud_drive')),
    status TEXT NOT NULL CHECK (status IN ('created', 'verified', 'restored', 'failed'))
);
