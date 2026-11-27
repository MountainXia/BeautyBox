# 妆匣 BeautyBox SQLite Schema V1 设计前置基线清单（V3.1 正式准入版）

- **版本**：V3.1-Schema-Verified（2026-11-27 补强验收通过）
- **状态**：**`V3-04` SQLite Schema V1 已在 Linux (`sqlite3 3.45.1`) 完成最终补强并通过 20/20 自动化测试**（22 张表 + 3 个美瞳完整性触发器；注：真实 iOS 沙盒 `MediaStore` 物理删图、`GRDB` Swift 集成及真机写入仍标注「未开始 / 需 Mac/Xcode 实测」）
- **正式产出链接**：
  - 建表 DDL：[0001_schema_v1.sql](file:///home/xianggujiang/projects/BeautyBox/database/migrations/0001_schema_v1.sql)
  - 分类种子：[0001_categories_v1.sql](file:///home/xianggujiang/projects/BeautyBox/database/seeds/0001_categories_v1.sql)
  - 设计与 ER 说明：[SQLite_Schema_V1_设计说明与ER关系.md](file:///home/xianggujiang/projects/BeautyBox/docs/db/SQLite_Schema_V1_设计说明与ER关系.md)
  - 字段字典：[SQLite_Schema_V1_字段字典.md](file:///home/xianggujiang/projects/BeautyBox/docs/db/SQLite_Schema_V1_字段字典.md)
  - 数据库测试报告：[SQLite_Schema_V1_测试说明.md](file:///home/xianggujiang/projects/BeautyBox/docs/db/SQLite_Schema_V1_测试说明.md)
- **权威依赖**：
  - [docs/adr/0001-architecture-decisions.md](file:///home/xianggujiang/projects/BeautyBox/docs/adr/0001-architecture-decisions.md)（含第十节 V3.1 适用边界说明）
  - [docs/adr/0002-m1-to-m10-product-decisions.md](file:///home/xianggujiang/projects/BeautyBox/docs/adr/0002-m1-to-m10-product-decisions.md)（V3.1-Frozen）
  - [docs/BeautyBox_产品需求规格说明书_V3.0.md](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_产品需求规格说明书_V3.0.md)

---

## 一、对 ADR-0001「20 张核心表」的务实重估与实体必要性审查

`ADR-0001` 第十节已明确：**“20 张核心表”不作为硬性 KPI**。按真实业务实体逐表审查如下（严禁建 `users` / `auth` / `owner_id` / `RLS` 及联网分享表）：

| 编号 | 实体/表名 | 是否必须存在 | 业务职责 | 主要字段（V3.1-Frozen 输入） | 与其他实体的关系 | 是否有必要独立成表 | 设计风险与应对 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `categories` | **必须** | 9 一级 / 45 二级 / 93 三级（147 节点）可扩展分类字典与迁移锚点 | `id`, `code UNIQUE`, `parent_id`, `level`, `name`, `default_unit`, `allow_direct_product`, `expiry_management_mode`, `has_specialty_attrs`, `specialty_group_code`, `is_system`, `is_active`, `deprecated_by_code`, `sort_order`, `deleted_at` | `1:N` 自引用 `parent_id`；`1:N` 关联 `products` | **必须独立**（支持多级树与 `ON DELETE RESTRICT`） | **风险**：硬删或复用 `code` 破坏老品归属。**应对**：软废弃 `is_active=0 + deprecated_by_code`。 |
| 2 | `brands` | **必须** | 品牌归一化去重、展示与搜索聚合 | `id`, `name`, `normalized_name UNIQUE`, `created_at`, `updated_at` | `1:N` 关联 `products` | **必须独立** | **风险**：大小写重复。**应对**：`normalized_name` 索引去重；删品牌 `SET NULL`。 |
| 3 | `products` | **必须** | 产品主档（同款共享不变特征与命名保护） | `id`, `brand_id`, `category_id`, `name`, `is_custom_name`, `spec_value`, `spec_unit`, `shade`, `category_attrs_schema_ver`, `category_attrs_json`, `notes_private`, `migration_legacy_category_raw`, `migration_review_status`, `archived_at`, `deleted_at`, `trash_expires_at`, `trash_scope`, `delete_batch_id` | `N:1` `categories`/`brands`；`1:N` `product_items`/`product_photos`；`1:0..1` `product_lens_profiles` | **必须独立** | **风险**：无回收站批元数据导致错恢复或子级误删。**应对**：`trash_scope + delete_batch_id` 精确隔离。 |
| 4 | `product_lens_profiles` *(V3.1 轻量结构表)* | **必须（`UD-02` 方案最优落地）** | 承载 `L1_LENS` 产品级周期与光学特征，确保 **`replacement_cycle_code` 单源事实来源** | `product_id PK/FK`, `replacement_cycle_code`, `bc_mm`, `dia_mm`, `water_content_percent`, `pack_piece_count`, `lens_color_pattern`, `updated_at` | `1:0..1` 绑定 `products(id)` | **有必要独立**（仅美瞳存行，0 稀疏列，强 `CHECK` + 抛期索引） | **风险**：若直接硬删父产品需同事务先清本表。**应对**：彻删事务有序删除本表。 |
| 5 | `product_photos` | **必须** | 产品多图顺序管理与唯一封面图锚点 | `id`, `product_id`, `asset_id`, `sort_order`, `is_cover`, `created_at` | `N:1` `products` & `media_assets` | **必须独立**（支持 `WHERE is_cover=1` 唯一索引） | **风险**：双封面或孤儿文件。**应对**：部分唯一索引 + 提交后 GC。 |
| 6 | `product_items` | **必须** | 单瓶/单盒独立实物（含 **`UD-02` 单盒美瞳度数与眼别**、4 层日期、生命周期、回收站批元数据及 `idle` 迁移字段） | `id`, `product_id`, `acquire_channel`, `purchase_price_minor`, `currency_code`, `purchase_date`, `lifecycle_status`, `remaining_percent`, `lifecycle_note`, `manufacture_date`, `unopened_shelf_months`, `packaging_exp_date`, `opened_date`, `pao_months`, `computed_expiry_date`, `computed_expiry_basis`, `confirmed_expiry_date`, `expiry_confirmed_at`, `confirmed_input_fingerprint`, `finished_at`, `last_used_at`, **`lens_eye_side`**, **`lens_power`**, **`batch_code`**, **`migration_legacy_status`**, **`migration_review_status`**, `migration_audit_json`, `archived_at`, **`deleted_at`**, **`trash_expires_at`**, **`trash_scope`**, **`deleted_by_parent_id`**, **`delete_batch_id`** | `N:1` `products`；被 `look_product_items`、`product_usage_logs`、`routine_*` 引用 | **必须独立** | **风险**：① 若建双度数会毁单盒粒度；② `idle` 无条件转 `in_use` 会染脏。**应对**：已单盒仅存单一 `lens_power`；`idle` 严格分流留痕。 |
| 7 | `media_assets` | **必须** | App 沙盒私有图片元数据统一索引与防删保护 | `id`, `relative_path UNIQUE`, `thumbnail_path`, `media_type`, `mime_type`, `byte_size`, `pixel_width`, `pixel_height`, `sha256`, `created_at`, `updated_at` | 被 4 张照片关联表及 `looks.cover_asset_id` 引用 | **必须独立** | **风险**：7 天回收站误删原图。**应对**：软删期绝对禁删图，彻删提交且全部引用总计归 0 后删磁盘。 |
| 8 | `looks` | **必须** | 妆容日记、预设/手填风格场景、4 项选填自评 & 回收站字段 | `id`, `name`, `look_date`, `style`, `scene`, `started_at`, `finished_at`, `duration_minutes`, `duration_source`, `cover_asset_id`, `self_rating`, `coordination_rating`, `color_rating`, `wear_rating`, `tags_json`, `notes_private`, `archived_at`, `deleted_at`, `trash_expires_at`, `trash_scope`, `delete_batch_id` | `1:N` `look_photos` / `look_product_items` / `wear_reviews` | **必须独立** | **风险**：未评分填 0 毁均分。**应对**：4 列全部 `INTEGER NULL CHECK (1..5)`。 |
| 9 | `look_photos` | **必须** | 妆容主图与多细节图有序关联 | `id`, `look_id`, `asset_id`, `photo_role`, `captured_at`, `sort_order`, `created_at` | `N:1` `looks` & `media_assets` | **必须独立** | 与 `looks.cover_asset_id` 同事务同步维护。 |
| 10 | `look_product_items` | **必须** | 妆容实际使用实物关联与**不可变产品历史快照** | `id`, `look_id`, `product_item_id NULL`, `step_key`, `step_order`, `product_name_snapshot`, `brand_name_snapshot`, `shade_snapshot`, `category_snapshot`, `spec_snapshot`, `created_at` | `N:1` `looks`；`N:1` `product_items` (**`ON DELETE SET NULL`**) | **必须独立** | **风险**：误写 `CASCADE` 清毁历史。**应对**：强制 `SET NULL` + 单测验证。 |
| 11 | `wear_reviews` | **必须** | 持妆时间线记录（2/4/6/8h 或自定义节点） | `id`, `look_id`, `asset_id NULL`, `captured_at`, `wear_minutes`, `wear_minutes_source`, `timepoint_key`, `overall_rating`, `smudge_level`, `oxidation_level`, `makeup_loss_level`, `oil_level`, `caking_level`, `floating_level`, `patchiness_level`, `notes_private`, `created_at`, `updated_at` | `N:1` `looks` & `media_assets` (`SET NULL`) | **必须独立** | 指标枚举加 `CHECK`。 |
| 12 | `product_usage_logs` | **必须** | 日常单品使用日志（含美瞳单盒佩戴次数/天数流水） | `id`, `product_item_id`, `used_at`, `wear_count_delta`, `scene`, `feeling`, `notes_private`, `created_at`, `updated_at` | `N:1` `product_items` (`RESTRICT`) | **必须独立** | **关键风险**：`RESTRICT` 会阻断彻底删实物。**应对**：彻底删除事务中按序显式先删/清理 `product_usage_logs`。 |
| 13～14 | `skin_diaries` / `skin_diary_photos` | **必须** | 主观肌肤状况日记及多图关联 | 继承 `ADR-0001` 第 4.3 节字段 | `1:N` 关联 & `media_assets` | **必须独立** | 照片同步接入 `MediaStore` 引用计数 GC。 |
| 15～19 | `routines` / `routine_steps` / `routine_step_products` / `routine_logs` / `routine_log_items` | **预置建表（UI 在 V3-12 接入）** | 早晚/周期护肤步骤模板、步骤关联品快照及打卡流水 | 继承 `ADR-0001` 第 4.4 节完整快照字段 | 级联模板及快照流水 | **必要独立** | V1 Schema 一次稳态建表，减少后续大迁移。 |
| 20 | `app_settings` | **必须** | 主展示币种（`primary_display_currency`）、临期天数、iCloud 状态等本地设置 | `key PK`, `value_json`, `updated_at` | 全局 KV | **必须独立** | 缺省安全读取类型化默认值（`CNY`, `30`）。 |
| 21 | `backup_manifests` | **必须** | `.beautyboxbackup` 备份审计、`schema_version` 与完整性追踪 | 继承 `ADR-0001` 第 4.5 节字段 | 独立审计 | **必须独立** | 保持与包内 `manifest.json` 同步校验。 |

> **实体总览结论**：V3.1 业务驱动确认 **21 张本地核心表**（无需额外新建冗余回收站副表，而是通过 `deleted_at` + `trash_expires_at` + `trash_scope` + `deleted_by_parent_id` + `delete_batch_id` 完整结构列实现 7 天回收站精确作用域与父子批次隔离）。

---

## 二、SQLite Schema V1 二十项完整前置设计输入（冻结定稿）

1. **核心实体清单**：上述 21 张业务驱动本地核心表（零账号、零云表）。
2. **实体之间的关系**：`Category (1:N self) → Product ← (N:1) Brand`；`Product (1:0..1) → ProductLensProfile`；`Product (1:N) → ProductItem / ProductPhoto`；`ProductItem (N:M via LookProductItem) ↔ Look`；`Look (1:N) → LookPhoto / WearReview`；`ProductItem (1:N) → ProductUsageLog`；照片关联统一引用 `MediaAsset`。
3. **Product 与 ProductItem 边界**：`Product` 管同款共性（名称与 `is_custom_name`、品牌、三级分类、规格、色号、低频分类属性 JSON、美瞳更换周期与光学参数、主档图组）；`ProductItem` 管独立实物（价格/币种、购买日/渠道、4 层日期、生命周期、剩余量、**美瞳单盒 `lens_eye_side` + 单一 `lens_power` + `batch_code`**、回收站控制字段）。
4. **分类树结构**：`parent_id + level` 可扩展自引用表；通过 `allow_direct_product` 精确控管 9 个 L1（`0`）、12 个无子级末端 L2（`1`）、便捷粗选 L2（`1`）与多态细选 L2（`0`）的行为。
5. **分类稳定编码**：`categories.code` 全局 `UNIQUE` 不可变业务码（`L1_*` / `L2_*` / `L3_*`）。
6. **分类迁移策略**：严格落实 `ADR-0002` 第 5.4.3 节**五类迁移字典（一对一 / 一对多 / 条件映射 / 合并映射 / 待人工确认）**，旧 6+24 编码、C1 别名、缺二级/未知码 100% 均有明确归属与溯源日志，**禁止静默丢弃**。
7. **通用字段清单**：UUID TEXT 主键；`YYYY-MM-DD` TEXT 纯日期；`ISO-8601 UTC` TEXT 时间戳。
8. **分类专属属性清单**：`products.shade` 留主列；美瞳主档入 `product_lens_profiles`（`replacement_cycle_code` 为周期唯一事实来源）；美瞳单盒仅记 `lens_eye_side`（`unspecified/left/right/both`）+ 单一 `lens_power` + `batch_code` 于 `product_items`；香水/彩妆/护肤低频文案入版本化 JSON（**严禁 EAV**）。
9. **生命周期与历史 `idle` 迁移**：`lifecycle_status` `CHECK IN ('unrecorded', 'unopened', 'in_use', 'finished')`；`idle` 已废弃，迁入时按**开封/使用证据**分流：**有证据 → `in_use` + 迁移备注；无任何开封/使用证据 → `unrecorded` + `migration_review_status = 'pending_idle_review'` 待人工确认**，全部写入 `migration_legacy_status = 'idle'` 与 `migration_audit_json`。
10. **有效期来源与计算规则**：物理隔离 4 层字段（`raw_input` → `system_computed` → `user_confirmed` → `display_result`）；强制 `opened_date >= manufacture_date`；计算执行 `min(未开封上限, 开封 + PAO/抛期)`；`unrecorded` 重置精确清开封/用完/确认/推算字段但保护生产日期、保质期参数与历史记录；工具豁免项标 `expiry_management_mode = 'optional'`。
11. **妆容与产品多对多关系**：`look_product_items` 支持 1 妆多品（可同选左眼盒与右眼盒实现成对记录），不干扰单盒独立库存。
12. **历史快照规则**：`look_product_items`、`routine_step_products`、`routine_log_items` 均保存完整品牌/产品名/色号/分类/规格快照（兼容含单盒美瞳眼别与度数拼入 `spec_snapshot`）。
13. **7 天本地回收站完整设计（`已确认 UD-03`）**：
    - `products`、`looks` 含 `deleted_at`, `trash_expires_at`, `trash_scope`, `delete_batch_id`；`product_items` 额外含 `deleted_by_parent_id`；
    - 顶层直删与随父级连带隐藏清晰隔离，恢复父级绝不误复活更早单删旧件；保持原 UUID 不并款；
    - 期满 7 天及手动「彻底删除 / 清空回收站」走单事务有序物理删除（显式清 `product_usage_logs` 后删 `product_item`，保留 `look_product_items` 快照）。
14. **照片文件和引用关系**：回收站 7 天期严禁删图；彻删事务提交后检查 `product_photos`、`look_photos`、`wear_reviews`、`skin_diary_photos` 与 `looks.cover_asset_id` 全部引用为 0 方删沙盒文件；开机含孤儿巡检。
15. **货币存储规则（`已确认 UD-04`）**：`purchase_price_minor` + `currency_code` 整数存算；离线精度表转换；汇总强按 `currency_code` 分组，禁 `Float` 与跨币种相加。
16. **唯一约束和索引建议**：`categories(code)`、`brands(normalized_name)`、`media_assets(relative_path)`、`product_photos(product_id) WHERE is_cover = 1`；加建回收站与查询索引 `products(category_id, deleted_at, archived_at)`、`product_items(product_id, deleted_at, trash_scope, lifecycle_status)`、`product_items(trash_expires_at)`、`looks(deleted_at, trash_expires_at, look_date)`、`product_lens_profiles(replacement_cycle_code)`。
17. **外键删除策略**：历史快照全用 `ON DELETE SET NULL`；结构保护用 `ON DELETE RESTRICT`；**彻底删除事务负责按拓扑序先清理不可保留子行后再删主行，杜绝物理删除触发 `RESTRICT` 异常**。
18. **数据迁移策略**：`PRAGMA foreign_keys = ON` + `PRAGMA user_version` 事务脚本；内置旧分类五类迁移器、`idle` 证据分流迁移器与审计留痕。
19. **备份和恢复兼容性**：`.beautyboxbackup` 一致性快照 ZIP + `manifest.json`（含 `schema_version` / SHA256）+ 恢复前安全点 + 逐级迁移升级，全用户免费可用。
20. **V3-04 必测自动化验收边界清单**：
    - 147 节点三维分类种子与五类历史分类映射全覆盖测试；
    - `idle` 双分支（有证据→`in_use`；无证据→`unrecorded + pending_idle_review`）与留痕回归测试；
    - 美瞳同款不同度数 `Product` 共用 + 单盒 `lens_eye_side`/`lens_power` 隔离测试（禁止单盒双度数与错合并）；
    - 7 天回收站完整回归：先单删瓶 A → 再删产品连带瓶 B → 恢复产品仅恢复瓶 B（A 仍在回收站）；父彻删后禁单恢复孤儿子瓶；期满/提前彻删保历史妆容快照；共享图片在任一引用未归零前禁止删物理文件；
    - 4 层日期校验、`min()` 计算、独立重置、`NULL` 四维评分排除均分、多币种精度往返一致性全测通。

---

## 三、`SQLite Schema V1`（`V3-04`）启动条件检查门（全部满足，正式解锁）

| 序号 | 必须满足的前置基线条件 | 当前状态 | 依据文档 |
| --- | --- | --- | --- |
| 1 | 分类体系已正式冻结（含 9 一级 / 45 二级 / 93 三级校验无误） | **已满足** | [ADR-0002 M4](file:///home/xianggujiang/projects/BeautyBox/docs/adr/0002-m1-to-m10-product-decisions.md#L121-L355)（`UD-01` 已确认） |
| 2 | 历史分类五类迁移规则与 `idle` 兼容规则已明确 | **已满足** | `ADR-0002` M2 / M4 / M9（零静默丢弃） |
| 3 | `Product` 与 `ProductItem` 边界已明确 | **已满足** | `ADR-0002` M5 / M10 & `ADR-0001` |
| 4 | 美瞳单盒粒度与属性归属已明确 | **已满足** | `ADR-0002` 5.10.2～5.10.3（`UD-02` 已确认） |
| 5 | 删除、7 天回收站作用域与异常恢复规则已明确 | **已满足** | `ADR-0002` M3（`UD-03` 已确认） |
| 6 | 生命周期转换、重置与 4 层有效期规则已明确 | **已满足** | `ADR-0002` M2 / M6 / M9 |
| 7 | 妆容历史快照与四项选填 `NULL` 评分规则已明确 | **已满足** | `ADR-0002` M7 & `ADR-0001` 第 4.6 节 |
| 8 | 照片文件沙盒存储、单封面唯一索引与归零 GC 规则已明确 | **已满足** | `ADR-0001` 第 4.2 节 & `ADR-0002` M3 |
| 9 | 货币存储整数最小单位与首页展示规则已明确 | **已满足** | `ADR-0002` M8 & `ADR-0001` 第五节（`UD-04` 已确认） |

**实施验收结论：`SQLite Schema V1（V3-04）` 已正式完成 DDL（22 张表 + 3 个完整性触发器）、147 节点分类种子、事务校验和 Migration 与 20 项本机真实数据库测试（20/20 通过），现已作为稳定基线正式通过验收；下一步按路线图推进 `V3-05`（Swift 领域引擎）与 `V3-06`（GRDB 持久层 & 真实 iOS `MediaStore` 物理删图与重试验收），其中原生编译与真机 IO 均需 Mac/Xcode 实测。**
