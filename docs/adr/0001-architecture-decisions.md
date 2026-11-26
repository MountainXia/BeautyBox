# ADR-0001：妆匣 BeautyBox 正式架构与核心业务决策

- **状态**：已确认核心决策（TASK 01 收尾定稿，待最终验收）
- **日期**：2026-11-19
- **适用范围**：妆匣 BeautyBox V1 正式 iOS 原生应用及前期原型/数据库研发阶段
- **参考文档**：
  - `AGENTS.md`
  - `docs/01_产品需求设计_V2.0.docx`
  - `docs/02_数据库设计_V2.0.docx`
  - `docs/03_界面原型说明_V2.0.docx`
  - `docs/04_开发计划与AI指令_V2.0.docx`

---

## 一、正式确定的技术架构

1. **客户端平台**：正式产品采用 iOS 原生 **Swift + SwiftUI**。`TASK 02` 的浏览器原型仅用于验证页面流程与交互，不作为正式产品技术栈或正式数据存储。
2. **应用分层架构**：采用 **Feature 模块化 + MVVM + Repository**。Repository 层统一封装数据库与媒体读写；**View 层禁止直接编写或执行 SQL**。
3. **本地数据库选型（最终锁定）**：确定采用 **SQLite + GRDB**，**不再保留 SwiftData 作为并列备选**。
   - **决策理由**：便于在当前 Linux/Windows 环境直接使用 `sqlite3` 验证 DDL、外键、CHECK 约束、索引与 Migration 脚本；结构可控，方便执行 `.beautyboxbackup` 一致性快照与逐版本迁移。
4. **媒体存储机制**：所有产品图、妆容照、持妆照、肌肤日记照片统一存储在 App 私有文件目录（`Application Support/Media/` 及缩略图目录），由 `MediaStore` 统一负责写入、缩略图生成、方向修正、压缩、校验与孤儿清理；数据库仅保存相对路径与元数据（MIME、尺寸、字节数、SHA-256），**严禁 Base64 存入数据库**。
5. **核心资产模型**：`Product`（产品主档案）与 `ProductItem`（实际持有实例）严格分离；妆容与日常流程关联用户实际拥有的 `ProductItem` 并保存历史快照。
6. **离线能力**：核心 CRUD、搜索、筛选、统计、妆容/持妆/日常记录、照片查看与本地导出在飞行模式 / 无网络环境下必须完全可用。
7. **无账号原则**：不建立用户账号、登录、注册、手机号/邮箱体系，不增加 `users`、`auth`、`owner_id`、RLS 或任何云端用户体系。

---

## 二、正式确定的 iCloud 与备份恢复方案

1. **默认状态**：App 内 iCloud 备份相关开关与入口**默认关闭**。
2. **V1 同步边界**：V1 **不做 CloudKit**，**不做自动多设备实时同步**。
3. **用户主动导出备份机制**：
   - 采用用户**主动生成 `.beautyboxbackup` 文件**的方式（ZIP 压缩包，内含 `manifest.json`、`database.sqlite`、`Media/`、`checksums.json`）。
   - 生成备份前创建数据库一致性快照并写入临时文件，校验通过后交付给用户；用户通过 iOS **系统文件选择器**自行选择保存到 **iCloud Drive 或其他本地/外接存储位置**。
4. **用户主动恢复机制**：
   - 恢复时由用户**主动通过系统文件选择器选择 `.beautyboxbackup` 文件**导入。
   - 恢复前必须依次执行：格式版本校验（不支持降级时明确拒绝）、`checksums.json` 与数据库完整性校验、剩余磁盘空间与路径安全检查，并**自动创建本地安全点**（Safepoint），确保恢复失败可回滚且不损毁当前本地数据。
5. **交互与文案语义红线**：
   - **不得将 iCloud Drive 文件同步行为描述或宣传为单纯的“手动备份”或“实时多设备同步”**。需向用户明确说明：App 仅在用户主动触发时生成或导入 `.beautyboxbackup` 文件；文件放入 iCloud Drive 后的跨设备同步由 Apple 系统级 iCloud Drive 机制决定。
6. **iOS 系统自动设备备份排除策略（`isExcludedFromBackup` —— 待验证）**：
   - **风险事实**：在 iOS 中，`Application Support/` 与 `Documents/` 目录默认会被纳入系统级 **iCloud 整机备份（iCloud Backup）** 或本地整机备份。
   - **隐私要求**：为严格履行“默认纯本地、未经用户主动操作不上传个人资料和照片”的规则，必须将 `URLResourceValues.isExcludedFromBackup = true`（排除 `database.sqlite`、`Application Support/Media/`、缩略图目录及本地安全点目录出系统整机自动备份）列为**强制实现与必测的隐私要求**。
   - **验证状态明确声明**：当前开发环境无 Mac/Xcode 与 iOS 真机，**`isExcludedFromBackup` 目前仅为已确认的架构与隐私要求，尚未实现且未经 Mac/Xcode/真机实测，严禁在后续报告中提前标记为“已实现”或“已验证”**；必须标注为**“待 Mac/Xcode 与真机实测”**。

---

## 三、正式确定的分享方案

1. **V1 分享范围**：V1 **仅实现用户主动生成分享图片**（妆容展示卡、持妆实测卡、产品清单卡），通过系统分享面板或保存系统相册完成。
2. **后置非目标**：V1 **暂不实现**在线分享链接、好友评分、公共内容浏览和社区功能（`TASK 16` 仅输出技术架构评估文档，不进入 V1 编码实现）。
3. **白名单与默认脱敏**：
   - 分享图片生成页必须展示清晰的可勾选项，采用**明确白名单**过滤导出字段。
   - **价格、购买渠道、私人备注、肌肤日记默认关闭且不纳入分享**，不得因为开启分享而默认暴露个人私密数据。

---

## 四、数据库设计补充决策（对 `docs/02` 的修订与完整核对）

为解决 `docs/02_数据库设计_V2.0.docx` 中的关联缺失、主图冗余与外键口径模糊，确定以下补充规则（在 `TASK 03` 建表时直接落地）：

### 4.1 20 张本地核心表清单（覆盖 `docs/02` 原 18 表 + 新增 2 张照片关联表）
1. 基础分类与品牌：`categories`、`brands`
2. 产品与多图：`products`（**不再保留 `cover_asset_id`**）、`product_photos`（**新增**）、`product_items`
3. 媒体元数据：`media_assets`
4. 妆容与持妆：`looks`、`look_photos`、`look_product_items`、`wear_reviews`
5. 日常与肌肤日记：`product_usage_logs`、`skin_diaries`、`skin_diary_photos`（**新增**）、`routines`、`routine_steps`、`routine_step_products`、`routine_logs`、`routine_log_items`
6. 设置与备份：`app_settings`、`backup_manifests`

> 严禁建立：`users`、`auth`、`owner_id`、RLS 或服务端分享表（V1 不建 `share_records`、`share_payloads`、`friend_ratings`、`abuse_reports`）。

### 4.2 产品封面图唯一真相源（正式确认）
- **决策**：以 **`product_photos.is_cover` 作为产品封面图的唯一真相源**，**`products` 表不再保留或重复维护 `cover_asset_id` 字段**（此条修订并取代 `docs/02` 第 3 节中 `products.cover_asset_id` 的定义；`looks.cover_asset_id` 暂按 `docs/02` 保持不变，或后续按需对齐）。
- **数据库唯一性约束**：
  - `product_photos` 表结构：`id`（UUID PK）、`product_id`（FK → `products.id`）、`asset_id`（FK → `media_assets.id`）、`sort_order`（INTEGER NOT NULL DEFAULT 0）、`is_cover`（INTEGER NOT NULL DEFAULT 0，CHECK `is_cover IN (0, 1)`）、`created_at`（ISO-8601 UTC）。
  - 索引与约束：
    - `CREATE UNIQUE INDEX idx_product_photos_single_cover ON product_photos(product_id) WHERE is_cover = 1;` —— 从数据库层强制保证**同一产品最多只有 1 张封面图**（允许 0 张）。
    - `CREATE INDEX idx_product_photos_order ON product_photos(product_id, sort_order, created_at);`
    - `CREATE UNIQUE INDEX idx_product_photos_unique_asset ON product_photos(product_id, asset_id);` —— 防止同一产品重复绑定同一媒体资产。
- **没有封面图时的处理规则**：
  1. **情况 A（产品无任何照片：`product_photos` 为 0 行）**：数据库允许存在无封面产品（不报错、不阻塞保存）；Repository 返回 `coverAsset = nil`，UI 展示品牌/分类默认占位卡片或空白主图占位样式。
  2. **情况 B（产品有照片但无 `is_cover = 1`，例如封面图被删除或新增时未指定封面）**：
     - 读取展示层兜底：Repository 查询主图时按 `ORDER BY is_cover DESC, sort_order ASC, created_at ASC LIMIT 1` 取首张可用照片用于卡片预览，不强制要求界面报错；
     - 删除封面图操作：当用户删掉当前 `is_cover = 1` 的照片且该产品仍有其他照片时，可在 Repository 事务内显式将剩余第一张（按 `sort_order ASC, created_at ASC`）设为 `is_cover = 1`，或允许无封面回退到兜底顺序展示（具体交互在 `TASK 07` 明确，但**绝不允许出现多个 `is_cover = 1`**）。

### 4.3 肌肤日记照片表补充
- **`skin_diary_photos`**：支持一篇肌肤日记关联多张照片。
  - 字段：`id`（UUID PK）、`skin_diary_id`（FK → `skin_diaries.id`）、`asset_id`（FK → `media_assets.id`）、`sort_order`（INTEGER NOT NULL DEFAULT 0）、`created_at`（ISO-8601 UTC）。
  - 索引：`skin_diary_photos(skin_diary_id, sort_order)`；`UNIQUE(skin_diary_id, asset_id)`。

### 4.4 补齐日常流程快照字段
- 在 **`routine_step_products`** 和 **`routine_log_items`** 中，除已有 `product_name_snapshot` 外，补充：
  - `brand_name_snapshot`（TEXT NULL）
  - `shade_snapshot`（TEXT NULL）
  - `category_snapshot`（TEXT NULL）
- **目的**：与 `look_product_items` 对齐，确保关联的 `ProductItem` / `Product` 修改、归档或删除后，日常流程步骤及历史执行记录依然保留当时的完整产品信息。

### 4.5 备份清单字段对齐
- 在 **`backup_manifests`** 表补充 `schema_version`（INTEGER NOT NULL），与 `.beautyboxbackup` 内部 `manifest.json` 保持字段一致，便于恢复时直接比对本地库与备份包的 Schema 版本。

### 4.6 全表外键删除策略矩阵（`RESTRICT` / `SET NULL`）
删除产品或持有实例时优先采用软归档（`archived_at` / `deleted_at`）；物理删除受以下外键策略保护，严禁 `CASCADE` 误清历史记录或快照：

| 表名 | 外键列 | 引用目标 | `ON DELETE` 策略 | 设计原因 |
| --- | --- | --- | --- | --- |
| `categories` | `parent_id` | `categories(id)` | `RESTRICT` | 存在子分类时禁止直接物理删除父分类 |
| `products` | `brand_id` | `brands(id)` | `SET NULL` | 品牌删除或合并时保留产品档案，不级联删除产品 |
| `products` | `category_id` | `categories(id)` | `RESTRICT` | 有产品归属的分类禁止物理删除（优先软删 `deleted_at`） |
| `product_photos` | `product_id` | `products(id)` | `RESTRICT` | 删除产品需经业务层显式解绑或归档，防止静默删图 |
| `product_photos` | `asset_id` | `media_assets(id)` | `RESTRICT` | 存在产品照片引用时禁止直接删除底层媒体元数据 |
| `product_items` | `product_id` | `products(id)` | `RESTRICT` | 有持有实例时禁止直接物理删除主档，强制提示归档 |
| `looks` | `cover_asset_id` | `media_assets(id)` | `SET NULL` | 妆容封面图变更或清理时保留妆容主记录 |
| `look_photos` | `look_id` | `looks(id)` | `RESTRICT` | 需业务层按删除确认流程显式处理照片关联与清理 |
| `look_photos` | `asset_id` | `media_assets(id)` | `RESTRICT` | 媒体仍被妆容引用时阻止直接删库，防悬空引用 |
| `look_product_items` | `look_id` | `looks(id)` | `RESTRICT` | 历史妆容快照受保护，需显式删除流程处理 |
| `look_product_items` | `product_item_id` | `product_items(id)` | `SET NULL` | **核心**：实例被删后置空外键，依靠快照字段保留历史妆容 |
| `wear_reviews` | `look_id` | `looks(id)` | `RESTRICT` | 存在持妆记录时禁止直接级联清空 |
| `wear_reviews` | `asset_id` | `media_assets(id)` | `SET NULL` | 持妆照片被移除时保留主观评分与时间线记录 |
| `product_usage_logs` | `product_item_id` | `product_items(id)` | `RESTRICT` | 存在使用历史时提示归档实例，不静默清空日志 |
| `skin_diary_photos` | `skin_diary_id` | `skin_diaries(id)` | `RESTRICT` | 需业务层受控删除日记及关联照片，防止残留孤儿 |
| `skin_diary_photos` | `asset_id` | `media_assets(id)` | `RESTRICT` | 媒体仍被日记引用时禁止直接删除 `media_assets` |
| `routine_steps` | `routine_id` | `routines(id)` | `RESTRICT` | 存在步骤的流程优先归档或由事务受控清理 |
| `routine_step_products` | `routine_step_id` | `routine_steps(id)` | `RESTRICT` | 事务内受控删除步骤时先处理子关联 |
| `routine_step_products` | `product_item_id` | `product_items(id)` | `SET NULL` | 实例删除后置空外键，靠快照保留流程步骤历史信息 |
| `routine_logs` | `routine_id` | `routines(id)` | `RESTRICT` | 保留历史打卡记录，有执行记录的流程走归档 |
| `routine_log_items` | `routine_log_id` | `routine_logs(id)` | `RESTRICT` | 保护历史执行明细 |
| `routine_log_items` | `routine_step_id` | `routine_steps(id)` | `SET NULL` | 步骤调整或删除后保留历史执行记录 |
| `routine_log_items` | `product_item_id` | `product_items(id)` | `SET NULL` | 实例删除后保留快照与完成状态 |

> 注：当用户明确确认“彻底删除”某条产品、妆容、日记或流程并清理关联照片时，必须在 Repository 事务中按依赖顺序解除关联、检查 `media_assets` 是否被其他记录共享引用，并在事务提交后由 `MediaStore` 清理不再被引用的物理文件与缩略图。

### 4.7 Migration 与自动化测试要求
- 必须使用 `PRAGMA user_version`（及/或 `schema_version` 校验机制）追踪版本；每个 Migration 必须在数据库事务内执行且可幂等验证。
- `TASK 03` 必须提供本机可运行的自动化测试，覆盖：
  - 空库初始化、Migration 升级、外键 `RESTRICT`/`SET NULL` 行为、CHECK 约束；
  - `product_photos` 单封面部分唯一索引与无封面兜底查询、多实例隔离、有效期不猜测规则；
  - 删除实例后历史妆容/流程快照保留、孤儿媒体检测；
  - **多币种金额精度与往返一致性测试**（见第 5.3 节完整必测项：CNY/USD 2 位、JPY 0 位、KWD 3 位转换、禁止跨币种直接相加、禁止超精度静默截断/舍入、存储-读取-展示往返一致）。

---

## 五、多币种金额精度与首页统计口径决策（正式确认）

### 5.1 多币种存储与精度转换规则（强制）
1. **字段定义**：金额统一采用整数最小货币单位存储（如 `product_items.purchase_price_minor`），同时**必须保存 `currency_code`（ISO 4217 三位币种代码）**。（注：对 `docs/02` 草案中 `product_items.currency` 列名在 `TASK 03` 落地时统一规范为 `currency_code`。）
2. **禁止固定 2 位小数假设**：**不允许假设所有币种都是 2 位小数，也不允许所有金额统一乘以 100**。
3. **集中式离线币种精度配置**：必须建立集中式、100% 离线可用的币种精度配置（不依赖任何在线汇率接口或网络服务），明确记录每种支持币种的标准小数位数（minor unit exponent）：
   - `CNY`：2 位小数，`12.34` 元存储为 `1234`；
   - `USD`：2 位小数，`12.34` 美元存储为 `1234`；
   - `JPY`：0 位小数，`1234` 日元存储为 `1234`；
   - `KWD`：3 位小数，`12.345` 第纳尔存储为 `12345`。
4. **录入校验与精确转换**：金额录入时必须基于 `Decimal`（十进制精确表示）与对应币种的 `minor unit exponent` 进行精确转换和校验。**严禁使用 `Float` / `Double` 进行金额计算**；**禁止静默截断、隐式舍入或丢失精度**。遇到小数位数超过该币种标准精度的输入时，必须明确提示用户修正，或显式采用事先明确记录的舍入规则。
5. **展示格式化**：金额展示时必须同时依据 `currency_code` 与集中式币种精度配置进行格式化，**不得仅凭金额整数猜测小数位数**。
6. **币种支持范围与未配置币种拦截**：
   - V1 仅支持已纳入本地离线币种精度配置的币种。
   - 当用户选择或传入未在配置中的币种时，必须明确提示“该币种暂不支持”，**禁止默认按 2 位小数处理，也禁止继续保存金额**。
   - 后续新增支持币种时，仅通过扩展本地离线配置并补充对应自动化测试实现，不依赖在线接口。
7. **落地阶段**：在 `TASK 03` 中正式落实数据库字段（`purchase_price_minor` + `currency_code`）、离线币种精度配置、金额精确转换与格式化校验逻辑及自动化测试。

### 5.2 首页统计口径（正式确认）
1. **不做自动汇率换算**：离线环境下不引入不可靠的汇率折算，也不制造伪精确估值。
2. **首页累计购买金额（分币种历史消费总账）**：
   - 按 `product_items.currency_code` 分组分别汇总展示（例如分别展示 CNY、USD、JPY、KWD 等），**不同币种金额不能直接相加**。
   - **统计所有存在有效购买金额记录（`purchase_price_minor IS NOT NULL`）的产品实例，包括已用完、已归档的历史消费记录**。
3. **首页当前持有件数与产品资料数（独立统计）**：
   - **产品资料数量**：独立统计 `Product` 主档案数量（未归档口径：`archived_at IS NULL`）。
   - **当前持有件数**：仅统计**仍在持有、未用完、未归档**的 `ProductItem` 实例（`archived_at IS NULL` 且 `status` 不属于已用完/已丢弃/已转让等结束状态）。

### 5.3 `TASK 03` 多币种自动化测试必测清单
后续 `TASK 03` 必须覆盖以下测试用例：
1. `CNY`、`USD` 两位小数精确转换（录入 → 存储整数 → 读取 → 格式化展示）。
2. `JPY` 零位小数精确转换。
3. `KWD` 三位小数精确转换。
4. 不同币种金额不能直接相加（聚合/统计严格按 `currency_code` 分组隔离）。
5. 超出币种标准精度的输入不能静默截断或隐式舍入（例如 `CNY` 输入 `12.345` 或 `JPY` 输入 `12.5` 时必须拦截提示或按显式规则处理）。
6. 金额存储、读取、展示往返一致（round-trip 无精度丢失、无位移偏差）。

---

## 六、商业化与配置化决策（正式确认）

- **免费版额度和 PRO 定价**：现阶段**暂不确定**具体额度与价格，所有限制阈值与商品配置必须保持**配置化**（通过集中配置/远端或本地配置文件管理），**禁止在页面或业务逻辑中硬编码额度或价格**。
- **权益统一入口**：所有 PRO 权限判断统一经 `EntitlementService`（基于 StoreKit 2）提供；免费用户与订阅过期用户永久保留查看、导出、备份和恢复已有数据的能力。

---

## 七、开发报告规范统一决策（正式确认）

- 全项目统一采用 `docs/04_开发计划与AI指令_V2.0.docx` 第 5 节的 **12 项任务结束报告模板**（已同步至 `AGENTS.md` 第七节）：
  1. `任务编号`
  2. `本次目标`
  3. `完成范围`
  4. `新增/修改文件`
  5. `数据库迁移`
  6. `执行命令`
  7. `自动化测试结果`
  8. `人工验收步骤`
  9. `未完成/需 Mac 实测`
  10. `隐私与数据安全影响`
  11. `已知问题`
  12. `下一任务前置条件`

---

## 八、待验证与尚未确定的事项

### 8.1 必须等待 Mac / Xcode / 真机实测的事项（当前未实现、未验证）
1. **`isExcludedFromBackup` 隐私排除验证**：在 iOS 沙盒实机上设置 `URLResourceValues.isExcludedFromBackup = true`，验证系统 iCloud 整机备份是否确实排除了数据库、私有媒体与安全点目录（**需 Mac/Xcode 与真机实测**）。
2. **系统文件选择器与 iCloud Drive 交互**：`UIDocumentPickerViewController` / SwiftUI `fileExporter` & `fileImporter` 对 `.beautyboxbackup` 的导出、导入及 iCloud Drive 提示文案验证（**需 Mac/Xcode 与真机实测**）。
3. **SQLite + GRDB 原生工程编译与性能验证**：GRDB SPM 依赖集成、真机写入与备份快照一致性（**需 Mac/Xcode 实测**）。
4. **StoreKit 2、PHPicker、相机、通知、SwiftUI 渲染与无障碍**：均**需 Mac/Xcode 与真机实测**。

### 8.2 仍待后续业务确认的事项
1. **免费版产品/妆容额度与 PRO 订阅定价**：进入 `TASK 15` 商业化阶段前确定最终数值（此前全部配置化）。
2. **`product_items.status` 完整枚举值列表**：在 `TASK 03` 建表前确定用于区分“当前持有（如未开封/使用中/闲置）”与“已结束（如已用完/已丢弃/已转让）”的标准状态枚举，确保首页“当前持有件数”查询条件精准无歧义。

---

## 九、下一阶段前置条件（TASK 02 与 TASK 03）

### 9.1 `TASK 02`（浏览器可点击交互原型）前置条件
1. 本 ADR（`ADR-0001`）已通过验收。
2. 原型代码置于独立目录（如 `prototype/`），与未来正式 iOS 工程及 SQLite 正式数据完全隔离，仅使用浏览器模拟数据供 iPhone Safari 走查。
3. 原型中的统计展示遵循第五节口径（产品资料数与当前持有件数独立展示；分币种累计购买金额含历史已用完/归档记录；无封面图展示占位卡）。

### 9.2 `TASK 03`（SQLite Schema & Migration）前置条件
1. 本 ADR（`ADR-0001`）第四、五节验收通过（含 20 张核心表、`product_photos.is_cover` 单封面部分唯一索引、移除 `products.cover_asset_id`、`skin_diary_photos`、Routine 快照字段、`backup_manifests.schema_version`、`purchase_price_minor` + `currency_code` 字段及外键矩阵）。
2. 明确 `product_items.status`、`expiry_basis`、`photo_role` 等 `CHECK` 约束枚举取值字典，以及离线币种精度配置清单（含 `CNY`/`USD`/`JPY`/`KWD` 等及超出精度输入策略）。
3. 使用当前 Linux 环境已验证可用的 `sqlite3 3.45.1` 与 `python3 3.12.3` 编写并执行 Migration、多币种金额转换与往返一致性等自动化约束测试。

---

## 十、2026-11-26 V3.1 适用边界与补充说明（保留历史正文，不作覆盖改写）

为保持历史决策记录完整，本 ADR 第一至九节正文原样保留；在后续 `V3.1` 产品规则全面收口中，以下 4 条适用边界补充生效，并与 `docs/adr/0002-m1-to-m10-product-decisions.md`（V3.1）共同构成 `SQLite Schema V1` 设计依据：

1. **第四节 4.1 “20 张本地核心表清单”的非 KPI 边界**：4.1 所列 20 张表为对 `docs/02_数据库设计_V2.0.docx` 缺漏表的基线补齐参考，**不构成硬性表数量 KPI**。正式 `SQLite Schema V1` 应依据真实业务实体必要性设计（例如为兼容三级分类字段、4 层日期溯源、美瞳结构化光学/度数属性或回收站软删字段而做的列扩展或轻量附表），不得为凑满“20 张”而保留冗余表，也不得为压缩表数量而把核心关联强塞入无约束 JSON。
2. **第 5.2 节首页累计购买金额展示的架构与视图分离边界**：架构层“禁止自动汇率换算、禁止不同币种直接相加、所有有效购买记录分币种统计”的核心原则维持不变；首页前端究竟直接平铺多币种，还是单选主展示币种并把其余币种收入明细弹窗（`UD-04`），属于 UI 展示决策，不改写底层多币种最小货币单位存储规则。
3. **第 8.2 节 `product_items.status` 枚举收口引用**：本文件 8.2 提及的待确认状态枚举（含当时示例词“闲置”“已丢弃”“已转让”），已在 `ADR-0002` V3.1 的 M2/M9 中完成业务收口：核心生命周期枚举收敛为 `unrecorded / unopened / in_use / finished`，旧原型 `idle`（闲置）标记为 `已废弃` 并给出迁移兼容规则。
4. **第 9.2 节 `TASK 03`（现 `V3-04`）前置条件补充**：进入正式 `SQLite Schema V1` 建表前，除满足本文件 9.2 原有条件外，还必须先完成 `ADR-0002` V3.1 与 `docs/BeautyBox_当前待办与决策清单.md` 中标注为阻塞级的用户拍板项（`UD-01`～`UD-03`），并以 `docs/BeautyBox_SQLite数据库设计前置清单.md`（V3.1 修订版）作为完整 Schema 输入基线。

