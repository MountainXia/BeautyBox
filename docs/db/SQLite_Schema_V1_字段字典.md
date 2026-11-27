# 妆匣 BeautyBox SQLite Schema V1 完整字段字典

- **版本**：V1.1（直接自补强后 [0001_schema_v1.sql](file:///home/xianggujiang/projects/BeautyBox/database/migrations/0001_schema_v1.sql) 在 SQLite `3.45.1` 实时 introspection 提取生成，与物理库 100% 一致）
- **表与触发器规模**：**22 张表**（零 `REAL`/`FLOAT`/`DOUBLE` 列）、**3 个完整性触发器**

## 1. `schema_migrations`（5 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `version` | `INTEGER` | NOT NULL | — | PK |
| `migration_key` | `TEXT` | NOT NULL | — | — |
| `description` | `TEXT` | NOT NULL | — | — |
| `checksum_sha256` | `TEXT` | NOT NULL | — | — |
| `applied_at` | `TEXT` | NOT NULL | — | — |

## 2. `categories`（19 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `code` | `TEXT` | NOT NULL | — | — |
| `parent_id` | `TEXT` | NULL | — | `categories(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `level` | `INTEGER` | NOT NULL | — | — |
| `name` | `TEXT` | NOT NULL | — | — |
| `definition` | `TEXT` | NULL | — | — |
| `examples_text` | `TEXT` | NULL | — | — |
| `default_unit` | `TEXT` | NOT NULL | — | — |
| `allow_direct_product` | `INTEGER` | NOT NULL | `0` | — |
| `expiry_management_mode` | `TEXT` | NOT NULL | `'tracked'` | — |
| `has_specialty_attrs` | `INTEGER` | NOT NULL | `0` | — |
| `specialty_group_code` | `TEXT` | NULL | — | — |
| `is_system` | `INTEGER` | NOT NULL | `1` | — |
| `is_active` | `INTEGER` | NOT NULL | `1` | — |
| `deprecated_by_code` | `TEXT` | NULL | — | — |
| `sort_order` | `INTEGER` | NOT NULL | `0` | — |
| `created_at` | `TEXT` | NOT NULL | — | — |
| `updated_at` | `TEXT` | NOT NULL | — | — |
| `deleted_at` | `TEXT` | NULL | — | — |

**显式索引**：
- `idx_categories_active_level` (`is_active, level, sort_order`)
- `idx_categories_parent` (`parent_id, sort_order`)

## 3. `brands`（5 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `name` | `TEXT` | NOT NULL | — | — |
| `normalized_name` | `TEXT` | NOT NULL | — | — |
| `created_at` | `TEXT` | NOT NULL | — | — |
| `updated_at` | `TEXT` | NOT NULL | — | — |

## 4. `media_assets`（11 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `relative_path` | `TEXT` | NOT NULL | — | — |
| `thumbnail_path` | `TEXT` | NULL | — | — |
| `media_type` | `TEXT` | NOT NULL | `'image'` | — |
| `mime_type` | `TEXT` | NOT NULL | — | — |
| `byte_size` | `INTEGER` | NOT NULL | — | — |
| `pixel_width` | `INTEGER` | NULL | — | — |
| `pixel_height` | `INTEGER` | NULL | — | — |
| `sha256` | `TEXT` | NOT NULL | — | — |
| `created_at` | `TEXT` | NOT NULL | — | — |
| `updated_at` | `TEXT` | NOT NULL | — | — |

## 5. `products`（20 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `brand_id` | `TEXT` | NULL | — | `brands(id)` (`ON DELETE SET NULL`, `ON UPDATE RESTRICT`) |
| `category_id` | `TEXT` | NOT NULL | — | `categories(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `name` | `TEXT` | NOT NULL | — | — |
| `is_custom_name` | `INTEGER` | NOT NULL | `0` | — |
| `spec_value` | `TEXT` | NULL | — | — |
| `spec_unit` | `TEXT` | NULL | — | — |
| `shade` | `TEXT` | NULL | — | — |
| `category_attrs_schema_ver` | `INTEGER` | NOT NULL | `1` | — |
| `category_attrs_json` | `TEXT` | NULL | — | — |
| `notes_private` | `TEXT` | NULL | — | — |
| `migration_legacy_category_raw` | `TEXT` | NULL | — | — |
| `migration_review_status` | `TEXT` | NULL | — | — |
| `archived_at` | `TEXT` | NULL | — | — |
| `deleted_at` | `TEXT` | NULL | — | — |
| `trash_expires_at` | `TEXT` | NULL | — | — |
| `trash_scope` | `TEXT` | NULL | — | — |
| `delete_batch_id` | `TEXT` | NULL | — | — |
| `created_at` | `TEXT` | NOT NULL | — | — |
| `updated_at` | `TEXT` | NOT NULL | — | — |

**显式索引**：
- `idx_products_trash` (`deleted_at, trash_expires_at`)
- `idx_products_name` (`name`)
- `idx_products_category_active` (`category_id, deleted_at, archived_at`)

## 6. `product_lens_profiles`（9 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `product_id` | `TEXT` | NOT NULL | — | PK / `products(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `replacement_cycle_code` | `TEXT` | NOT NULL | — | — |
| `bc_mm` | `TEXT` | NULL | — | — |
| `dia_mm` | `TEXT` | NULL | — | — |
| `water_content_percent` | `INTEGER` | NULL | — | — |
| `pack_piece_count` | `INTEGER` | NULL | — | — |
| `lens_color_pattern` | `TEXT` | NULL | — | — |
| `created_at` | `TEXT` | NOT NULL | — | — |
| `updated_at` | `TEXT` | NOT NULL | — | — |

**显式索引**：
- `idx_lens_profiles_cycle` (`replacement_cycle_code`)

## 7. `product_photos`（6 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `product_id` | `TEXT` | NOT NULL | — | `products(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `asset_id` | `TEXT` | NOT NULL | — | `media_assets(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `sort_order` | `INTEGER` | NOT NULL | `0` | — |
| `is_cover` | `INTEGER` | NOT NULL | `0` | — |
| `created_at` | `TEXT` | NOT NULL | — | — |

**显式索引**：
- `idx_product_photos_order` (`product_id, sort_order, created_at`)
- UNIQUE `idx_product_photos_unique_asset` (`product_id, asset_id`)
- UNIQUE `idx_product_photos_single_cover` (`product_id`) WHERE is_cover = 1

## 8. `product_items`（35 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `product_id` | `TEXT` | NOT NULL | — | `products(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `acquire_channel` | `TEXT` | NULL | — | — |
| `purchase_price_minor` | `INTEGER` | NULL | — | — |
| `currency_code` | `TEXT` | NOT NULL | `'CNY'` | — |
| `purchase_date` | `TEXT` | NULL | — | — |
| `lifecycle_status` | `TEXT` | NOT NULL | `'unrecorded'` | — |
| `remaining_percent` | `INTEGER` | NULL | — | — |
| `lifecycle_note` | `TEXT` | NULL | — | — |
| `manufacture_date` | `TEXT` | NULL | — | — |
| `unopened_shelf_months` | `INTEGER` | NULL | — | — |
| `packaging_exp_date` | `TEXT` | NULL | — | — |
| `opened_date` | `TEXT` | NULL | — | — |
| `pao_months` | `INTEGER` | NULL | — | — |
| `computed_expiry_date` | `TEXT` | NULL | — | — |
| `computed_expiry_basis` | `TEXT` | NOT NULL | `'insufficient'` | — |
| `confirmed_expiry_date` | `TEXT` | NULL | — | — |
| `expiry_confirmed_at` | `TEXT` | NULL | — | — |
| `confirmed_input_fingerprint` | `TEXT` | NULL | — | — |
| `finished_at` | `TEXT` | NULL | — | — |
| `last_used_at` | `TEXT` | NULL | — | — |
| `lens_eye_side` | `TEXT` | NULL | — | — |
| `lens_power` | `TEXT` | NULL | — | — |
| `batch_code` | `TEXT` | NULL | — | — |
| `migration_legacy_status` | `TEXT` | NULL | — | — |
| `migration_review_status` | `TEXT` | NULL | — | — |
| `migration_audit_json` | `TEXT` | NULL | — | — |
| `archived_at` | `TEXT` | NULL | — | — |
| `deleted_at` | `TEXT` | NULL | — | — |
| `trash_expires_at` | `TEXT` | NULL | — | — |
| `trash_scope` | `TEXT` | NULL | — | — |
| `deleted_by_parent_id` | `TEXT` | NULL | — | `products(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `delete_batch_id` | `TEXT` | NULL | — | — |
| `created_at` | `TEXT` | NOT NULL | — | — |
| `updated_at` | `TEXT` | NOT NULL | — | — |

**显式索引**：
- `idx_product_items_lens` (`product_id, lens_eye_side, lens_power`)
- `idx_product_items_trash` (`deleted_at, trash_expires_at, trash_scope, deleted_by_parent_id, delete_batch_id`)
- `idx_product_items_currency` (`currency_code, purchase_price_minor`)
- `idx_product_items_expiry` (`confirmed_expiry_date, computed_expiry_date`)
- `idx_product_items_product_active` (`product_id, deleted_at, lifecycle_status`)

## 9. `looks`（23 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `name` | `TEXT` | NOT NULL | — | — |
| `look_date` | `TEXT` | NOT NULL | — | — |
| `style` | `TEXT` | NULL | — | — |
| `scene` | `TEXT` | NULL | — | — |
| `started_at` | `TEXT` | NULL | — | — |
| `finished_at` | `TEXT` | NULL | — | — |
| `duration_minutes` | `INTEGER` | NULL | — | — |
| `duration_source` | `TEXT` | NOT NULL | `'unknown'` | — |
| `cover_asset_id` | `TEXT` | NULL | — | `media_assets(id)` (`ON DELETE SET NULL`, `ON UPDATE RESTRICT`) |
| `self_rating` | `INTEGER` | NULL | — | — |
| `coordination_rating` | `INTEGER` | NULL | — | — |
| `color_rating` | `INTEGER` | NULL | — | — |
| `wear_rating` | `INTEGER` | NULL | — | — |
| `tags_json` | `TEXT` | NULL | — | — |
| `notes_private` | `TEXT` | NULL | — | — |
| `archived_at` | `TEXT` | NULL | — | — |
| `deleted_at` | `TEXT` | NULL | — | — |
| `trash_expires_at` | `TEXT` | NULL | — | — |
| `trash_scope` | `TEXT` | NULL | — | — |
| `delete_batch_id` | `TEXT` | NULL | — | — |
| `created_at` | `TEXT` | NOT NULL | — | — |
| `updated_at` | `TEXT` | NOT NULL | — | — |

**显式索引**：
- `idx_looks_trash` (`deleted_at, trash_expires_at`)
- `idx_looks_date_active` (`look_date, deleted_at`)

## 10. `look_photos`（7 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `look_id` | `TEXT` | NOT NULL | — | `looks(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `asset_id` | `TEXT` | NOT NULL | — | `media_assets(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `photo_role` | `TEXT` | NOT NULL | `'detail'` | — |
| `captured_at` | `TEXT` | NULL | — | — |
| `sort_order` | `INTEGER` | NOT NULL | `0` | — |
| `created_at` | `TEXT` | NOT NULL | — | — |

**显式索引**：
- `idx_look_photos_order` (`look_id, sort_order`)
- UNIQUE `idx_look_photos_unique_asset` (`look_id, asset_id`)

## 11. `look_product_items`（11 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `look_id` | `TEXT` | NOT NULL | — | `looks(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `product_item_id` | `TEXT` | NULL | — | `product_items(id)` (`ON DELETE SET NULL`, `ON UPDATE RESTRICT`) |
| `step_key` | `TEXT` | NULL | — | — |
| `step_order` | `INTEGER` | NOT NULL | `0` | — |
| `product_name_snapshot` | `TEXT` | NOT NULL | — | — |
| `brand_name_snapshot` | `TEXT` | NULL | — | — |
| `shade_snapshot` | `TEXT` | NULL | — | — |
| `category_snapshot` | `TEXT` | NULL | — | — |
| `spec_snapshot` | `TEXT` | NULL | — | — |
| `created_at` | `TEXT` | NOT NULL | — | — |

**显式索引**：
- `idx_look_product_items_item` (`product_item_id`)
- `idx_look_product_items_look_order` (`look_id, step_order`)

## 12. `wear_reviews`（18 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `look_id` | `TEXT` | NOT NULL | — | `looks(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `asset_id` | `TEXT` | NULL | — | `media_assets(id)` (`ON DELETE SET NULL`, `ON UPDATE RESTRICT`) |
| `captured_at` | `TEXT` | NOT NULL | — | — |
| `wear_minutes` | `INTEGER` | NOT NULL | — | — |
| `wear_minutes_source` | `TEXT` | NOT NULL | `'manual'` | — |
| `timepoint_key` | `TEXT` | NOT NULL | — | — |
| `overall_rating` | `INTEGER` | NULL | — | — |
| `smudge_level` | `INTEGER` | NULL | — | — |
| `oxidation_level` | `INTEGER` | NULL | — | — |
| `makeup_loss_level` | `INTEGER` | NULL | — | — |
| `oil_level` | `INTEGER` | NULL | — | — |
| `caking_level` | `INTEGER` | NULL | — | — |
| `floating_level` | `INTEGER` | NULL | — | — |
| `patchiness_level` | `INTEGER` | NULL | — | — |
| `notes_private` | `TEXT` | NULL | — | — |
| `created_at` | `TEXT` | NOT NULL | — | — |
| `updated_at` | `TEXT` | NOT NULL | — | — |

**显式索引**：
- `idx_wear_reviews_look_time` (`look_id, captured_at`)

## 13. `product_usage_logs`（9 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `product_item_id` | `TEXT` | NOT NULL | — | `product_items(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `used_at` | `TEXT` | NOT NULL | — | — |
| `wear_count_delta` | `INTEGER` | NOT NULL | `1` | — |
| `scene` | `TEXT` | NULL | — | — |
| `feeling` | `TEXT` | NULL | — | — |
| `notes_private` | `TEXT` | NULL | — | — |
| `created_at` | `TEXT` | NOT NULL | — | — |
| `updated_at` | `TEXT` | NOT NULL | — | — |

**显式索引**：
- `idx_usage_logs_item_time` (`product_item_id, used_at`)

## 14. `skin_diaries`（6 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `diary_date` | `TEXT` | NOT NULL | — | — |
| `mood_tags_json` | `TEXT` | NULL | — | — |
| `notes_private` | `TEXT` | NULL | — | — |
| `created_at` | `TEXT` | NOT NULL | — | — |
| `updated_at` | `TEXT` | NOT NULL | — | — |

**显式索引**：
- `idx_skin_diaries_date` (`diary_date`)

## 15. `skin_diary_photos`（5 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `skin_diary_id` | `TEXT` | NOT NULL | — | `skin_diaries(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `asset_id` | `TEXT` | NOT NULL | — | `media_assets(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `sort_order` | `INTEGER` | NOT NULL | `0` | — |
| `created_at` | `TEXT` | NOT NULL | — | — |

**显式索引**：
- `idx_skin_diary_photos_order` (`skin_diary_id, sort_order`)
- UNIQUE `idx_skin_diary_photos_unique_asset` (`skin_diary_id, asset_id`)

## 16. `routines`（7 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `name` | `TEXT` | NOT NULL | — | — |
| `period_type` | `TEXT` | NOT NULL | — | — |
| `sort_order` | `INTEGER` | NOT NULL | `0` | — |
| `created_at` | `TEXT` | NOT NULL | — | — |
| `updated_at` | `TEXT` | NOT NULL | — | — |
| `archived_at` | `TEXT` | NULL | — | — |

## 17. `routine_steps`（6 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `routine_id` | `TEXT` | NOT NULL | — | `routines(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `name` | `TEXT` | NOT NULL | — | — |
| `sort_order` | `INTEGER` | NOT NULL | `0` | — |
| `created_at` | `TEXT` | NOT NULL | — | — |
| `updated_at` | `TEXT` | NOT NULL | — | — |

**显式索引**：
- `idx_routine_steps_routine` (`routine_id, sort_order`)

## 18. `routine_step_products`（8 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `routine_step_id` | `TEXT` | NOT NULL | — | `routine_steps(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `product_item_id` | `TEXT` | NULL | — | `product_items(id)` (`ON DELETE SET NULL`, `ON UPDATE RESTRICT`) |
| `product_name_snapshot` | `TEXT` | NOT NULL | — | — |
| `brand_name_snapshot` | `TEXT` | NULL | — | — |
| `shade_snapshot` | `TEXT` | NULL | — | — |
| `category_snapshot` | `TEXT` | NULL | — | — |
| `sort_order` | `INTEGER` | NOT NULL | `0` | — |

**显式索引**：
- `idx_routine_step_products_step` (`routine_step_id, sort_order`)

## 19. `routine_logs`（5 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `routine_id` | `TEXT` | NOT NULL | — | `routines(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `performed_at` | `TEXT` | NOT NULL | — | — |
| `completed` | `INTEGER` | NOT NULL | `1` | — |
| `notes_private` | `TEXT` | NULL | — | — |

**显式索引**：
- `idx_routine_logs_routine_time` (`routine_id, performed_at`)

## 20. `routine_log_items`（9 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `routine_log_id` | `TEXT` | NOT NULL | — | `routine_logs(id)` (`ON DELETE RESTRICT`, `ON UPDATE RESTRICT`) |
| `routine_step_id` | `TEXT` | NULL | — | `routine_steps(id)` (`ON DELETE SET NULL`, `ON UPDATE RESTRICT`) |
| `product_item_id` | `TEXT` | NULL | — | `product_items(id)` (`ON DELETE SET NULL`, `ON UPDATE RESTRICT`) |
| `product_name_snapshot` | `TEXT` | NOT NULL | — | — |
| `brand_name_snapshot` | `TEXT` | NULL | — | — |
| `shade_snapshot` | `TEXT` | NULL | — | — |
| `category_snapshot` | `TEXT` | NULL | — | — |
| `completed` | `INTEGER` | NOT NULL | `1` | — |

**显式索引**：
- `idx_routine_log_items_log` (`routine_log_id`)

## 21. `app_settings`（3 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `key` | `TEXT` | NOT NULL | — | PK |
| `value_json` | `TEXT` | NOT NULL | — | — |
| `updated_at` | `TEXT` | NOT NULL | — | — |

## 22. `backup_manifests`（10 列）
| 列名 | 类型 | 非空 | 默认值 | 主键 / 外键引用 |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | NOT NULL | — | PK |
| `backup_format_version` | `INTEGER` | NOT NULL | — | — |
| `schema_version` | `INTEGER` | NOT NULL | — | — |
| `created_at` | `TEXT` | NOT NULL | — | — |
| `app_version` | `TEXT` | NOT NULL | — | — |
| `database_sha256` | `TEXT` | NOT NULL | — | — |
| `media_count` | `INTEGER` | NOT NULL | — | — |
| `total_bytes` | `INTEGER` | NOT NULL | — | — |
| `destination_kind` | `TEXT` | NOT NULL | — | — |
| `status` | `TEXT` | NOT NULL | — | — |

## 23. 完整性触发器清单
| 触发器名 | 绑定表 | 作用 |
| --- | --- | --- |
| `trg_lens_profile_require_lens_category_insert` | `product_lens_profiles` | 禁止非美瞳（及护理液）产品插入 `product_lens_profiles` |
| `trg_lens_profile_require_lens_category_update` | `product_lens_profiles` | 禁止将 `product_lens_profiles` 关联改绑至非美瞳产品 |
| `trg_product_forbid_non_lens_with_profile` | `products` | 禁止在存在美瞳档案时将 `products.category_id` 改为非美瞳分类 |
