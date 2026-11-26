# 妆匣 BeautyBox SQLite Schema V1 设计前置基线清单（V3.1 完整输入版）

- **版本**：V3.1（升级自 V1.0 前置清单，2026-11-26）
- **状态**：**待拍板 `UD-01`～`UD-03` 后即可进入 `V3-04` 正式建表**（`UD-04` 不阻塞建表）
- **权威依赖**：
  - [docs/adr/0001-architecture-decisions.md](file:///home/xianggujiang/projects/BeautyBox/docs/adr/0001-architecture-decisions.md)（含第十节 V3.1 适用边界说明）
  - [docs/adr/0002-m1-to-m10-product-decisions.md](file:///home/xianggujiang/projects/BeautyBox/docs/adr/0002-m1-to-m10-product-decisions.md)
  - [docs/BeautyBox_产品需求规格说明书_V3.0.md](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_产品需求规格说明书_V3.0.md)
- **前置边界声明**：**本轮仅提供 Schema 设计输入基线，严禁在用户核准前直接编写 `.sql` 建表 DDL、Migration 代码或 Swift 模型代码。**

---

## 一、对 ADR-0001「20 张核心表」的务实重估与实体必要性审查

`ADR-0001` 第十节已明确：**“20 张核心表”不作为硬性 KPI**。本清单对所有候选实体按真实业务必要性逐一审查（严禁建 `users` / `auth` / `owner_id` / `RLS` 及联网分享表）：

| 编号 | 实体/表名 | 是否必须存在 | 业务职责 | 主要字段（草案） | 与其他实体的关系 | 是否有必要独立成表 | 设计风险与应对 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `categories` | **必须** | 9 一级 / 45 二级 / 91 三级可扩展分类字典与迁移映射锚点 | `id`, `code UNIQUE`, `parent_id`, `level`, `name`, `default_unit`, `allow_direct_product`, `expiry_management_mode`, `has_specialty_attrs`, `specialty_group_code`, `is_system`, `is_active`, `deprecated_by_code`, `sort_order`, `deleted_at` | `1:N` 自引用 `parent_id`；`1:N` 关联 `products` | **必须独立**（支持多级树与外键 `RESTRICT`） | **风险**：硬删或复用 `code` 破坏老品归属。**应对**：强制软废弃 `is_active=0 + deprecated_by_code`，严禁物理删库。 |
| 2 | `brands` | **必须** | 品牌归一化去重、展示与搜索聚合 | `id`, `name`, `normalized_name UNIQUE`, `created_at`, `updated_at` | `1:N` 关联 `products` | **必须独立**（防止 "YSL"/"圣罗兰" 拼写漂移碎片化） | **风险**：大小写重复。**应对**：`normalized_name` 索引去重；删除品牌时 `products.brand_id` 走 `SET NULL`。 |
| 3 | `products` | **必须** | 产品主档（跨瓶共享不变特征与命名保护） | `id`, `brand_id`, `category_id`, `name`, `is_custom_name`, `spec_value`, `spec_unit`, `shade`, `category_attrs_schema_ver`, `category_attrs_json`, `notes_private`, `archived_at`, `deleted_at`, `trash_expires_at` | `N:1` `categories`/`brands`；`1:N` `product_items` / `product_photos`；`1:0..1` `product_lens_profiles` | **必须独立**（核心 `Product` vs `ProductItem` 分离基石） | **风险**：JSON 承载过多无索引查询字段。**应对**：高频色号 `shade` 留主列，美瞳核心结构参数独立结构化。 |
| 4 | `product_lens_profiles` *(V3.1 新增轻量结构)* | **强烈建议**（比全塞 `products` 稀疏列或无约束 JSON 更优） | 承载 `L1_LENS` 产品级结构化光学与周期属性，确保 **`replacement_cycle_code` 为唯一事实来源** | `product_id PK/FK`, `replacement_cycle_code`, `bc_mm`, `dia_mm`, `water_content_percent`, `pack_piece_count`, `lens_color_pattern`, `updated_at` | `1:0..1` 绑定 `products(id)` (`ON DELETE RESTRICT/CONTROLLED`) | **建议独立**（仅美瞳记录存在，0 冗余空列，强 `CHECK` + 索引过滤抛期） | **风险**：如 `UD-02` 选"不同度数拆 `Product`"则左右眼度数亦需跟主档（不推荐）。当前设计完全可控。 |
| 5 | `product_photos` | **必须** | 产品多图顺序管理与唯一封面图锚点 | `id`, `product_id`, `asset_id`, `sort_order`, `is_cover`, `created_at` | `N:1` `products`；`N:1` `media_assets` | **必须独立**（支撑多图及 `WHERE is_cover=1` 部分唯一索引） | **风险**：出现多封面或孤儿文件。**应对**：数据库部分唯一索引硬防 + 引用计数清理。 |
| 6 | `product_items` | **必须** | 每瓶/每支/每盒独立实物、价格、获得渠道、4 层日期与生命周期 | `id`, `product_id`, `acquire_channel`, `purchase_price_minor`, `currency_code`, `purchase_date`, `lifecycle_status`, `remaining_percent`, `lifecycle_note`, `manufacture_date`, `unopened_shelf_months`, `packaging_exp_date`, `opened_date`, `pao_months`, `computed_expiry_date`, `computed_expiry_basis`, `confirmed_expiry_date`, `expiry_confirmed_at`, `confirmed_input_fingerprint`, `finished_at`, `last_used_at`, `lens_power_mode`, `left_eye_power`, `right_eye_power`, `archived_at`, `deleted_at`, `trash_expires_at` | `N:1` `products`；被 `look_product_items`、`product_usage_logs`、`routine_*` 引用 | **必须独立**（多瓶多效期核心载体） | **风险**：旧 `idle` 状态残余、取消弹出脏改。**应对**：严格 `CHECK` + 迁移映射 + 事务草稿提交。 |
| 7 | `media_assets` | **必须** | App 沙盒私有图片元数据统一索引与防删保护 | `id`, `relative_path UNIQUE`, `thumbnail_path`, `media_type`, `mime_type`, `byte_size`, `pixel_width`, `pixel_height`, `sha256`, `created_at`, `updated_at` | 被 `product_photos`、`look_photos`、`wear_reviews`、`skin_diary_photos` 引用 | **必须独立**（实现统一去重、校验与安全 GC） | **风险**：数据库回滚遗留物理图片或误删被共享照片。**应对**：提交后 GC，必须全 4 张引用表 count=0 才删文件。 |
| 8 | `looks` | **必须** | 妆容日记主记录、时间消耗、预设/手填风格场景及 **4 项全选填自评** | `id`, `name`, `look_date`, `style`, `scene`, `started_at`, `finished_at`, `duration_minutes`, `duration_source`, `cover_asset_id`, `self_rating`, `coordination_rating`, `color_rating`, `wear_rating`, `tags_json`, `notes_private`, `archived_at`, `deleted_at`, `trash_expires_at` | `1:N` `look_photos` / `look_product_items` / `wear_reviews` | **必须独立** | **风险**：空评分存为 0 破坏均分。**应对**：4 个 rating 全部 `INTEGER NULL CHECK (rating BETWEEN 1 AND 5)`，均值查询 `AVG(col)`。 |
| 9 | `look_photos` | **必须** | 妆容主图与多细节图有序关联 | `id`, `look_id`, `asset_id`, `photo_role`, `captured_at`, `sort_order`, `created_at` | `N:1` `looks` & `media_assets` | **必须独立**（支持多张细节照与角色区分） | **风险**：与 `looks.cover_asset_id` 失步。**应对**：Schema V1 建议同步参照 `product_photos` 收敛 `is_cover` 或严格在单事务维护。 |
| 10 | `look_product_items` | **必须** | 妆容实际使用单品关联及**不可变产品历史快照** | `id`, `look_id`, `product_item_id NULL`, `step_key`, `step_order`, `product_name_snapshot`, `brand_name_snapshot`, `shade_snapshot`, `category_snapshot`, `spec_snapshot`, `created_at` | `N:1` `looks` (`RESTRICT`)；`N:1` `product_items` (**`ON DELETE SET NULL`**) | **必须独立**（N:M 关系与防删保快照核心） | **风险**：写错成 `CASCADE` 会随删产品把历史妆容清空。**应对**：硬编码 `ON DELETE SET NULL` 并写专项单测验收。 |
| 11 | `wear_reviews` | **必须** | 持妆时间线记录（2/4/6/8h 或自定义节点表现） | `id`, `look_id`, `asset_id NULL`, `captured_at`, `wear_minutes`, `wear_minutes_source`, `timepoint_key`, `overall_rating`, `smudge_level`, `oxidation_level`, `makeup_loss_level`, `oil_level`, `caking_level`, `floating_level`, `patchiness_level`, `notes_private`, `created_at`, `updated_at` | `N:1` `looks`；`N:1` `media_assets` (`SET NULL`) | **必须独立**（一个妆容对应多时间点持妆跟踪） | **风险**：主观指标枚举随手改。**应对**：评分与等级加 `CHECK` 范围约束。 |
| 12 | `product_usage_logs` | **必须** | 日常单品使用记录（含**美瞳实际佩戴天数/次跟踪**） | `id`, `product_item_id`, `used_at`, `wear_count_delta`, `scene`, `feeling`, `notes_private`, `created_at`, `updated_at` | `N:1` `product_items` (`RESTRICT`) | **必须独立**（高频流水日志不可塞回主表） | **风险**：删除实物后历史流水约束。**应对**：有流水引导归档/回收站，彻删时显式确认或按规则清理。 |
| 13 | `skin_diaries` | **必须** | 日常主观肌肤状况日记（非医疗诊断） | `id`, `diary_date`, `mood_tags_json`, `notes_private`, `created_at`, `updated_at` | `1:N` `skin_diary_photos` | **必须独立** | 无显著风险，字段稳定。 |
| 14 | `skin_diary_photos` | **必须** | 肌肤日记多图关联 | `id`, `skin_diary_id`, `asset_id`, `sort_order`, `created_at` | `N:1` `skin_diaries` & `media_assets` | **必须独立**（与多图设计保持一致） | 同 `product_photos` 需配合 GC 清理。 |
| 15～19 | `routines` / `routine_steps` / `routine_step_products` / `routine_logs` / `routine_log_items`（5张） | **按路线图保留（V1 Schema 一次性预置，UI 在 V3-12 接入）** | 早晚/每周护肤步骤模板、步骤关联品快照与历史执行打卡记录 | 继承 `ADR-0001` 第 4.4 节补全快照字段（`product/brand/shade/category_snapshot`） | 级联流程树与历史快照 | **必要独立**（流程模板 `≠` 每日打卡，历史改步不破坏旧打卡） | **风险**：5 张表工作量偏后置。**应对**：在 `V3-04` 一次性稳态建表，不急于在产品页 UI 提前暴露。 |
| 20 | `app_settings` | **必须** | 离线应用级偏好设置（主展示币种 `primary_display_currency`、临期提醒阈值 `expiring_threshold_days`、iCloud 开关状态等） | `key PK`, `value_json`, `updated_at` | 全局 KV | **必须独立** | **风险**：强依赖隐式默认值。**应对**：Repository 读不到 key 时给安全类型化默认值（如 `CNY`, `30`）。 |
| 21 | `backup_manifests` | **必须** | `.beautyboxbackup` 备份审计、Schema 版本比对与完整性校验追踪 | `id`, `backup_format_version`, `schema_version`, `created_at`, `app_version`, `database_sha256`, `media_count`, `total_bytes`, `destination_kind`, `status` | 独立备份记录 | **必须独立**（遵循 `ADR-0001` 第 4.5 节） | 无显著风险。 |

> **表数量真实评估结论**：当前业务天然需要 **21 张本地核心表**（原 `ADR-0001` 20 张 + `product_lens_profiles` 1 张轻量结构表，具体随 `UD-02` 最终拍板可定为 20 或 21 张；回收站无需额外建表，通过 `deleted_at`/`trash_expires_at` 就地实现）。严格证明：**表结构由真实业务驱动，不迎合数字指标，也不滥用 EAV 或无约束 JSON。**

---

## 二、SQLite Schema V1 二十项完整前置设计输入

对照规划目标，逐项固化 20 项设计边界与规范如下：

1. **核心实体清单**：见第一节完整 21 实体审查表（归属本地个人档案、美妆物品、美瞳结构、妆容持妆、日常、配置与备份七大域）。
2. **实体之间的关系**：`Category (1:N self) → Category (1:N) → Product ← (N:1) Brand`；`Product (1:0..1) → ProductLensProfile`；`Product (1:N) → ProductItem` & `ProductPhoto`；`ProductItem (N:M via LookProductItem) ↔ Look`；`Look (1:N) → LookPhoto / WearReview`；`ProductItem (1:N) → ProductUsageLog`；`Routine (1:N) → RoutineStep (1:N) → RoutineStepProduct` 及 `RoutineLog` / `RoutineLogItem`；所有照片关联表多对一指向 `MediaAsset`。
3. **Product 与 ProductItem 边界**：
   - `Product` 管本质共性（名称与 `is_custom_name`、品牌、三级分类、单件标称规格、色号、分类专业属性、美瞳换抛周期与光学参数、主档图组）。
   - `ProductItem` 管物理个体差异（获得渠道、实付价格最小单位+币种、购买日期、4 层生命周期日期、使用状态、剩余比例、开封/用完日、美瞳各盒左右眼度数）。
4. **分类树结构**：采用 `parent_id + level` 自引用邻接表；不死锁三层上限；`allow_direct_product` 精确控制哪些二级叶子可直选。
5. **分类稳定编码**：采用不可变稳定字符串业务编码 `categories.code`（如 `L1_MAKEUP`、`L3_MK_BASE_FOUNDATION`、`L2_LN_COSMETIC`）配合 `UNIQUE` 索引；迁移与代码引用优先绑定 `code` 而非脆性中文名称或随机 UUID。
6. **分类迁移策略**：完整遵循 `ADR-0002` 第 5.4.3 节全映射表；对 `store.js`/`seedData.js`/`c1-mock-data.js` 全量 24+ 子类建立 `code -> new code` 确定映射；未知或仅一级历史记录迁入对应大类兜底叶子并写 `notes_private` 溯源，**绝对禁止静默丢弃**；`sub-lipbalm` 按是否有 `shade` 分流护理润唇膏与有色润唇膏。
7. **通用字段清单**：全表统一使用 UUID TEXT PK；创建/更新时间采用 `ISO-8601 UTC` TEXT；纯业务日期（生产/购买/开封/EXP/到期/妆容日期）采用 `YYYY-MM-DD` TEXT，禁止带时区时间戳混入引发跨日偏移。
8. **分类专属属性清单**：
   - `shade` 留作 `products` 高频可空列；
   - 美瞳主档属性入 `product_lens_profiles`（`replacement_cycle_code` 单源 + `bc_mm`、`dia_mm`、`water_content_percent`、`pack_piece_count`、`lens_color_pattern`），每盒度数（`lens_power_mode`、`left_eye_power`、`right_eye_power`）入 `product_items`（`UD-02` 方案）；
   - 香水浓度/香调、彩妆质地/妆效、护肤肤质/功效/SPF 入带版本标识 `category_attrs_schema_ver` 的 `products.category_attrs_json`，由 Swift 强类型 `Codable` 分组解析，**严禁建通用 EAV 表**。
9. **生命周期状态字段**：
   - `lifecycle_status` `CHECK (lifecycle_status IN ('unrecorded', 'unopened', 'in_use', 'finished'))`，默认值 `'unrecorded'`；
   - `remaining_percent` `INTEGER NULL CHECK (remaining_percent IS NULL OR (remaining_percent BETWEEN 0 AND 100))`（`unrecorded` 存 `NULL`、`finished` 存 `0`）；
   - `idle` 旧枚举迁移至 `in_use` 并追加备注 `"[迁移保留] 原状态：闲置"`。
10. **有效期来源与计算规则**：
    - 物理隔离 4 层字段：`raw_input`（`manufacture_date`、`unopened_shelf_months`、`packaging_exp_date`、`opened_date`、`pao_months`、`replacement_cycle_code`）→ `system_computed`（`computed_expiry_date` + `computed_expiry_basis`）→ `user_confirmed`（`confirmed_expiry_date` + `expiry_confirmed_at` + `confirmed_input_fingerprint`）→ 运行时派生 `effective_expiry_date`；
    - 强制校验：`opened_date IS NULL OR manufacture_date IS NULL OR opened_date >= manufacture_date`；
    - 计算函数按 `min(未开封截止日, 开封日期 + PAO/美瞳更换周期)` 执行，绝不无依据按品类猜保质期；重置为未记录时精准清空开封/用完/确认/推算字段但保留原始生产与保质期参数。
11. **妆容与产品多对多关系**：通过 `look_product_items` 实现一妆对多件实物、一件实物入多套妆容；允许按 `step_key` / `step_order` 记录上妆部位顺序。
12. **历史快照规则**：`look_product_items`、`routine_step_products`、`routine_log_items` 一律存 `product_name_snapshot`、`brand_name_snapshot`、`shade_snapshot`、`category_snapshot`、`spec_snapshot`；`product_item_id` 一律可空。
13. **删除与回收站规则**（待 `UD-03` 拍板）：
    - 推荐在 `products`、`product_items`、`looks` 上统一增加 `deleted_at TEXT NULL` 与 `trash_expires_at TEXT NULL`；常规查询视图/Repository 过滤 `deleted_at IS NULL`；恢复按原 UUID 置空双字段且**不强制合并同款新品**；彻删或期满清理走单事务有序解绑与快照保底。
14. **照片文件和引用关系**：数据库只存相对路径与 SHA256/尺寸元数据（严禁 Base64）；`product_photos` 通过部分唯一索引限制单产品至多 1 张 `is_cover = 1`；删除后先提交事务再查 `media_assets` 四表引用总和，仅当全为 `0` 时调用 `MediaStore` 清理沙盒原图与缩略图。
15. **货币存储规则**：`purchase_price_minor INTEGER NULL CHECK (purchase_price_minor IS NULL OR purchase_price_minor >= 0)` + `currency_code TEXT NOT NULL DEFAULT 'CNY'`；配套离线币种精度字典表/常量（`CNY=2`, `USD=2`, `JPY=0`, `KWD=3`）；查询汇总必须 `GROUP BY currency_code`，**禁止不同币种在 SQL 中直接 `SUM(purchase_price_minor)` 跨越相加**。
16. **唯一约束与索引建议**：
    - `categories(code)` UNIQUE、`brands(normalized_name)` UNIQUE、`media_assets(relative_path)` UNIQUE；
    - `product_photos(product_id) WHERE is_cover = 1` 部分唯一索引 + `(product_id, asset_id)` UNIQUE；
    - 业务查询高频索引：`products(category_id, deleted_at, archived_at)`、`product_items(product_id, deleted_at, lifecycle_status)`、`product_items(confirmed_expiry_date, computed_expiry_date)`、`product_lens_profiles(replacement_cycle_code)`、`looks(look_date, deleted_at)`、`look_product_items(look_id, step_order)`、`product_usage_logs(product_item_id, used_at)`。
17. **外键删除策略**：全面沿用 `ADR-0001` 第 4.6 节矩阵——**历史保留链全部 `ON DELETE SET NULL`**（`look_product_items.product_item_id`、`routine_*_products.product_item_id`、`products.brand_id`、`wear_reviews.asset_id`），**引用保护链全部 `ON DELETE RESTRICT`**（`categories`、`products→product_items`、`product_photos`、`look_photos`、`skin_diary_photos`），严禁无保护 `CASCADE` 误清用户长期数据。
18. **数据迁移策略**：`PRAGMA foreign_keys = ON` + `PRAGMA user_version` 版本递进事务脚本；含结构迁移（1→2→3 升级）与历史原型 JSON 导入映射器（处理旧 6+24 分类编码、`idle` 状态迁移、`is_custom_name` 初始赋值与 `currency` -> `currency_code` 字段对齐）。
19. **备份和恢复兼容性**：`.beautyboxbackup` 压缩包（`manifest.json` 含 `schema_version` / `backup_format_version` / `database_checksum` + `database.sqlite` + `Media/` + `checksums.json`）；恢复前本地建安全点、验 SHA256 与空间，旧版备份经版本迁移器逐级升级后挂载，**拒绝降级损坏包**；免费用户永久可用。
20. **测试用例及边界条件（`V3-04` 必测验收门槛）**：
    - 空库建表 + 种子分类 145 节点初始化 + 全量 24+ 旧分类与 `idle` 数据迁移回归测试；
    - `ON DELETE RESTRICT` 拦截与 `ON DELETE SET NULL` 删后妆容历史快照完整留存测试；
    - `product_photos` 并发双封面拒绝 + 无封面兜底首图查询测试；
    - 日期合法性 `CHECK`（`opened_date < manufacture_date` 拦截）、`min()` 双算、美瞳未开封 EXP 与日抛/月抛分离、独立重置保留 `manufacture_date` 与历史记录测试；
    - 4 项 `looks` 评分为 `NULL` 排除在 `AVG()` 外（对比误填 `0` 的回归验证）；
    - 多币种精度往返一致性（`CNY`/`USD` 2位、`JPY` 0位、`KWD` 3位、超精度拦截、跨币种禁止混加）；
    - 照片引用计数 GC 边界（同一图片被产品和妆容共享时，删产品不得误删沙盒物理文件）。

---

## 三、启动 `V3-04`（正式 SQLite Schema V1 建表）准入检查门

必须全部满足以下条件后方能启动 `V3-04` 编码：
1. 用户已对 **`UD-01`（分类全树核准）**、**`UD-02`（美瞳度数归属）**、**`UD-03`（7 天回收站开关）** 给出明确拍板结论（`UD-04` 首页币种展示可并行或延后，不阻塞建表）；
2. `V3-03` 已在工作流中确认原型隔离基线与历史备份 Tag 无污染；
3. SQLite DDL、种子迁移器及约束自动化验证套件计划在当前 Linux 环境使用 `sqlite3 3.45.1` + `python3` 本机跑通全部 20 项边界用例（真机 GRDB SPM 编译标记为“需 Mac/Xcode 实测”）。
