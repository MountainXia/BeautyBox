# BeautyBox SQLite 数据库设计前置清单

- **文档名称**：BeautyBox SQLite 数据库设计前置清单
- **版本号**：V1.0
- **更新时间**：2026-11-26
- **文档状态**：设计输入清单（**本次不建表、不执行 Migration**；标 `【待用户确认】` 项锁定后方可启动 `V3-04` 建表）
- **适用阶段**：`V3-04`（原 `TASK 03` SQLite Schema 与迁移框架）前置唯一数据设计输入
- **相关文档引用**：[ADR-0001](./adr/0001-architecture-decisions.md)、[ADR-0002](./adr/0002-m1-to-m10-product-decisions.md)、[BeautyBox_产品需求规格说明书_V3.0](./BeautyBox_%E4%BA%A7%E5%93%81%E9%9C%80%E6%B1%82%E8%A7%84%E6%A0%BC%E8%AF%B4%E6%98%8E%E4%B9%A6_V3.0.md)、[02_数据库设计_V2.0.docx](./02_%E6%95%B0%E6%8D%AE%E5%BA%93%E8%AE%BE%E8%AE%A1_V2.0.docx)（历史 V2.0 基线保留）

> 结构设计准则：不以“凑齐 20 张表”为 KPI，而以业务职责清晰、外键一致性、约束严密、易于版本化迁移、离线可用及兼顾未来备份同步扩展为最高标准；严禁建立 `users`、`auth`、`owner_id`、RLS 或服务端分享表。

---

## 1. 核心实体清单（按业务域划分，约 19～21 张实表）

| 业务域 | 核心表 / 实体 | 职责与说明 |
|---|---|---|
| **基础字典** | `categories`、`brands` | 父子级产品分类字典（含稳定 `code` 与默认数量单位）；品牌规范化字典 |
| **产品与实物** | `products`、`product_items`、`product_photos` | 产品款式主档；用户实际拥有的独立单件（含生命周期、双有效期、美瞳度数）；单封面唯一真相源多图关联 |
| **专属扩展** | *(待选定 M10 方案)* 如 `contact_lens_profiles` 或主档内嵌 + `specialty_attrs_json` | 承载美瞳更换周期/BC/DIA/含水量，以及香水浓度香调、护肤功效等分类专属参数 |
| **媒体资产** | `media_assets` | App 私有沙盒文件相对路径、缩略图路径、MIME、宽高、字节数、SHA-256（无 Base64） |
| **妆容与持妆** | `looks`、`look_photos`、`look_product_items`、`wear_reviews` | 妆容主体（四维可选评分）、完成/局部照、关联单件历史快照、时间节点持妆测评 |
| **日常与日记** | `product_usage_logs`、`routines`、`routine_steps`、`routine_step_products`、`routine_logs`、`routine_log_items`、`skin_diaries`、`skin_diary_photos` | 单品使用日志、护肤流程模板与执行打卡（含完整快照）、主观肌肤日记及多图关联 |
| **设置与备份** | `app_settings`、`backup_manifests` | 本地偏好配置（首页币种、外币开关、临期天数等）与备份包清单元数据 |

## 2. 核心实体关系（ER）概览
- `categories(id)` 自关联 `parent_id`（`1:N` 支持一级 → 二级；未来可扩展自定义）。
- `brands(id)` `1:N` `products(brand_id)`；`categories(id)` `1:N` `products(category_id)` 与 `products(subcategory_id)`。
- `products(id)` `1:N` `product_items(product_id)`；`products(id)` `1:N` `product_photos(product_id)`。
- `product_items(id)` `N:M` `looks(id)` 通过 `look_product_items`（保留产品快照，`ON DELETE SET NULL`）。
- `looks(id)` `1:N` `look_photos`；`looks(id)` `1:N` `wear_reviews`。
- `product_items(id)` `1:N` `product_usage_logs`；`routines` `1:N` `routine_steps` `N:M` `product_items`（经 `routine_step_products` / `routine_log_items` 快照护航）。
- `skin_diaries(id)` `1:N` `skin_diary_photos` `N:1` `media_assets`。

## 3. `Product` 与 `ProductItem` 职责边界
| 归属实体 | 应存字段（示例） | 理由 |
|---|---|---|
| **`Product`（产品款式）** | 分类（一级+二级）、品牌、自定义名 `custom_name` + `is_custom_name` + 展示名 `name`、单件规格（值/单位/自定义单位）、数量单位 `quantity_unit`、彩妆通用色号/质地/妆效、美瞳花纹/系列/BC/DIA/含水量/默认周期、`expiry_tracking_enabled`、产品基础备注、产品回收站字段 `deleted_at`/`purge_at` | 同一款产品共享的品类归属、物理配方属性与产品库展示信息 |
| **`ProductItem`（实物单件）** | 所属 `product_id`、生命周期状态 `status`、`remaining_percent`、购入价格 `purchase_price_minor` + `currency_code`、购买日期、获得方式（预设+自定义）、生产日期、未开封保质期月数、开封日期、用完日期 `used_up_date`、PAO 月数、未开封/开封后双推算到期日、最终推算日与依据、用户确认到期日/确认时间/重确认标记、单件级美瞳左/右眼度数（`left_eye_power` / `right_eye_power`）、`last_used_at`、`deleted_at` | 同款多次购入、不同开封时间、不同批次效期、不同价格渠道、不同美瞳左右眼度数彼此完全独立 |

## 4. 产品分类字典设计输入（M4 · `【待用户确认】`）
- `categories` 关键列：`id` (UUID PK)、`code` (TEXT UNIQUE NOT NULL，稳定底层编码如 `contact_lenses`, `lens_monthly`)、`parent_id` (FK nullable → `categories(id)` `RESTRICT`)、`name` (展示名，可随本地化或温和调整更新)、`default_quantity_unit` (TEXT NULL，仅二级必填如 `瓶`/`支`/`副`/`盒`/`把`)、`sort_order`、`is_system` (`1` 系统预设 / `0` 未来自定义)、`created_at`、`updated_at`、`deleted_at`。
- **迁移保障**：因为 `products` 引用 `categories.id` 且字典具有稳定 `code`，调整分类中文名或映射旧原型 6 大类到新 9 大类时，不会破坏历史产品与快照关联。

## 5. 美瞳及其更换周期属性（M4 / M6 / M9 / M10 · `【待用户确认】`）
- **一级分类**：`contact_lenses`（「美瞳」）。
- **二级分类**（浏览筛选）：`lens_daily`（日抛）、`lens_monthly`（月抛）、`lens_half_year`（半年抛）、`lens_yearly`（年抛）、`lens_other`（其他周期）。
- **结构化周期字段**：`replacement_cycle_code`（`daily`/`monthly`/`half_year`/`yearly`/`biweekly`/`quarterly`/`custom`）与 `replacement_days`（INTEGER NULL，可空正整数天数），新建/改分类时与 `subcategory_id` 自动同步一致。
- **左右眼度数与包装**：
  - 支持同款不同盒购买不同度数，故 `left_eye_power`、`right_eye_power`（TEXT NULL，如 `"-2.50"`、`"-0.00"`，保留小数精度）挂在 `product_items`（或对应扩展关联）；
  - 美瞳参数 `series_name`、`pattern_color`、`base_curve_mm`、`diameter_mm`、`graphic_dia_mm`、`water_content_percent`、`packaging_type`、`pack_count` 全部 **允许 `NULL` 选填**。

## 6. 通用字段与分类专属属性存储前置决定（M10 · `【待用户确认】`）
- **M10 方案选型（见 `ADR-0002` §M10-3）**：推荐采用 **方案 C 务实混合**：
  - 高频共有字段直接驻留 `products`（不再保留旧 `docs/02` 中的 `products.cover_asset_id`！）；
  - 美瞳强业务参数（周期、BC/DIA/含水量、单件左右眼度数）采用结构化列/子表保障类型安全与索引；
  - 香水（浓度、香调、前中后调）、护肤（适用肤质、功效、核心成分）等低频延伸属性放入 `products.specialty_attrs_json`（或专用只读结构映射），V1 禁止建通用 EAV 三元组大表。

## 7. 生命周期与有效期状态数据设计输入（M2 / M6 / M9）
- **`product_items.status`**：`CHECK (status IN ('unrecorded', 'unopened', 'in_use', 'idle', 'used_up', 'disposed', 'transferred'))`（其中前端日常流转面向前 4 态，详见 `ADR-0002` M2/M9）。
- **有效期计算状态独立**：数据库不单独设静态 `expired` 列覆写 `status`——有效期状态（`normal` / `near_expiry` / `expired` / `unknown`）由领域层根据 `today`、用户设置的 `near_expiry_days` 及 `COALESCE(confirmed_expiry_date, status_specific_computed_expiry)` 实时计算，确保随自然日推进永不过时。
- **单件完整性判断输入**：Repository / Domain 联合读取 `product_items` 与 `products.expiry_tracking_enabled`，按 `status` 区分缺失字段（`unrecorded` → 待记录状态；`unopened` → 查 `manufacture_date` & `unopened_shelf_months`；`in_use` → 查 `opened_date` & `pao_months`；`used_up` 或豁免工具类 → 不进入有效期待完善）。

## 8. 妆容记录及产品关联（M7）
- `looks`：`id`、`name` (NOT NULL)、`look_date` (YYYY-MM-DD NOT NULL)、`style` (TEXT NULL)、`scene` (TEXT NULL)、`duration_minutes` (INTEGER NULL `CHECK >= 0`)、`cover_asset_id` (FK → `media_assets.id` `SET NULL`)、`self_rating` / `coordination_rating` / `color_rating` / `wear_rating` (**四维全部允许 `NULL`，`CHECK (col IS NULL OR (col BETWEEN 1 AND 5))`**)、`tags_json`、`notes_private`、`deleted_at`、`purge_at`、`created_at`、`updated_at`。
- `look_photos`：支持多张完成照/局部照（`photo_role IN ('finished', 'detail')`、`sort_order`）。
- `look_product_items`：`product_item_id` (FK nullable `ON DELETE SET NULL`) + 4 项快照字段（`product_name_snapshot`, `brand_name_snapshot`, `shade_snapshot`, `category_snapshot`）+ `step_key`、`step_order`。

## 9. 图片与文件存储关系（遵守 ADR-0001 §4.2–4.3）
- **`products` 不存 `cover_asset_id`**：以 `product_photos.is_cover` 为唯一封面真相源（部分唯一索引 `UNIQUE(product_id) WHERE is_cover = 1`）。
- **多图覆盖范围**：`product_photos`、`look_photos`、`wear_reviews.asset_id`、`skin_diary_photos`（覆盖 `ADR-0001` 补充表）。
- **`media_assets`**：仅存 `relative_path`、`thumbnail_path`、`mime_type`、`byte_size`、`pixel_width`、`pixel_height`、`sha256`（全部物理文件设 `isExcludedFromBackup = true`，需 Mac/Xcode 实测）。

## 10. 删除、恢复与历史记录保留规则（M3 / M9）
- **7 天回收站（推荐待确认）**：`products` 与 `looks` 设 `deleted_at`、`purge_at`（`product_items` 设 `deleted_at`）。回收恢复凭 `UUID` 清空 `deleted_at`/`purge_at`，严禁合并覆写同款新品。
- **重置为未记录（M9-4 `推荐待确认`）**：仅清除生命周期态字段，严禁删除主档、购买信息、使用日志及妆容关联。
- **外键保护矩阵**：严禁 `ON DELETE CASCADE` 破坏快照；`products`/`product_items` 对快照关联全部采用 `ON DELETE SET NULL`（与已确认外键矩阵一致）；有未清理子项时底层用 `RESTRICT` 防止孤儿。

## 11. 金额、货币、时间与日期约束（M6 / M8 / M9）
- **金额**：`purchase_price_minor INTEGER NULL CHECK (purchase_price_minor IS NULL OR purchase_price_minor >= 0)` + `currency_code TEXT NULL`；金额与币种成对校验，绝对不用 `REAL`/`FLOAT`。
- **日期时间**：纯日期（`YYYY-MM-DD`）用于生产/购买/开封/用完/到期日/妆容日/日记日；时间戳（ISO-8601 UTC）用于 `created_at`、`updated_at`、`deleted_at`、`purge_at`、`expiry_confirmed_at`、`captured_at`。
- **核心数据库 / 仓储级一致性约束**：
  1. `remaining_percent BETWEEN 0 AND 100`；
  2. `unopened_shelf_months IS NULL OR unopened_shelf_months > 0`；`pao_months IS NULL OR pao_months > 0`；
  3. `opened_date IS NULL OR manufacture_date IS NULL OR opened_date >= manufacture_date`；
  4. `used_up_date IS NULL OR ( (manufacture_date IS NULL OR used_up_date >= manufacture_date) AND (opened_date IS NULL OR used_up_date >= opened_date) )`；
  5. `status = 'unrecorded'` 时不允许正常路径带 `opened_date`（`CHECK` 或导入隔离）；`status = 'unopened'` 时 `opened_date IS NULL AND remaining_percent = 100`；`status = 'used_up'` 时 `remaining_percent = 0`；`status = 'in_use'` 时 `opened_date IS NOT NULL`。

## 12. 迁移与后续扩展要求
- 使用 `PRAGMA user_version` + GRDB `DatabaseMigrator` 严格在事务内执行单向迁移；`backup_manifests` 同步存储 `schema_version`。
- 由于 SQLite 不支持直接 `ALTER` 修改 `CHECK` 约束，所有关键 `CHECK`（如 `unrecorded`、四维可空星级、美瞳参数边界、日期顺序约束）必须在 `001_initial_schema.sql` 建表时一次就位。

## 13. 尚未确定、须在编写 DDL 前拍板的数据库决策清单
1. **【待确认】M4**：最终采用 9 大一级分类及所附 47 个二级分类清单中是否有需合并、拆分或改名项？
2. **【待确认】M10**：美瞳周期/参数及分类专属属性最终选「混合方案 C」（美瞳结构化字段 + 中低频 JSON）、「纯方案 B」（全 JSON），还是「纯方案 C」（各分类建专表）？工具类是否确定加入 `expiry_tracking_enabled`？
3. **【待确认】M9**：`status = 'unrecorded'` 重置入口的清理范围（保留生产日期与保质期？）、`in_use → unopened` 对原确认到期日的处理、`status = 'in_use' CHECK (opened_date IS NOT NULL)` 是否放宽导入历史数据？
4. **【待确认】M3 / M2**：是否确认引入 `deleted_at`/`purge_at` 7 天回收站机制，以及 `idle` 历史态是否保留进 `CHECK` 约束？
5. **【待确认】M7**：`looks` 4 维评分全可选 + `1–5` 整数（无半星）是否最终确定？
