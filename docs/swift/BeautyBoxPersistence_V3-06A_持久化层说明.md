# 妆匣 BeautyBox — `BeautyBoxPersistence`（V3-06A）GRDB 持久化层说明

- **版本基线**：`V3.1-Frozen`（严格对齐 [0001_schema_v1.sql](file:///home/xianggujiang/projects/BeautyBox/database/migrations/0001_schema_v1.sql)、[0001_categories_v1.sql](file:///home/xianggujiang/projects/BeautyBox/database/seeds/0001_categories_v1.sql) 与 [BeautyBoxCore](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxCore/Package.swift)）
- **Swift 包位置**：[ios/BeautyBoxPersistence/Package.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Package.swift)
- **锁定依赖版本**：
  - 官方 `GRDB.swift`：`exact: "7.12.0"`
  - 本地核心规则包：`BeautyBoxCore`（`../BeautyBoxCore`）
- **当前实施范围**：仅涵盖 `V3-06A`（数据库初始化与校验和 Migration、`Category` / `Brand` / `Product` / `ProductLensProfile` / `ProductItem` GRDB Record 与 Repository 访问、事务回滚及 `BeautyBoxCore` 规则联动）；不包含 `MediaStore`、`looks`/妆容快照、7 天回收站批次编排及 SwiftUI 页面（归属 `V3-06B` 及后续阶段）。

---

## 一、核心模块与 SQLite 字段映射概览

| 模块文件 | 对应 SQLite 表 / 机制 | 职责与核心约束 | 测试位置 |
| --- | --- | --- | --- |
| [DatabaseMigration.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Sources/BeautyBoxPersistence/Database/DatabaseMigration.swift) & [SHA256Hasher.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Sources/BeautyBoxPersistence/Database/SHA256Hasher.swift) | `schema_migrations`、`PRAGMA user_version` | 严格复刻 [beautybox_db.py](file:///home/xianggujiang/projects/BeautyBox/database/python/beautybox_db.py) 的 `"\n--STEP--\n"` + SHA-256 校验和算法（实测 V1 摘要为 `aad985b769a87e7b0e101d85d3ec44b82eb954fb6908eb6244a64192e31ef878`）；拒绝降级、拒绝跳号升级、检测历史脚本篡改并支持失败整体回滚。 | [MigrationAndCompatibilityTests.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Tests/BeautyBoxPersistenceTests/MigrationAndCompatibilityTests.swift) |
| [BeautyBoxDatabase.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Sources/BeautyBoxPersistence/Database/BeautyBoxDatabase.swift) | 全库连接配置 | 统一设置 `foreignKeysEnabled = true` 与 `busyMode = .timeout(5.0)`，每次打开前验证 `PRAGMA foreign_keys == 1`。 | [MigrationAndCompatibilityTests.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Tests/BeautyBoxPersistenceTests/MigrationAndCompatibilityTests.swift) |
| [CategoryRecord.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Sources/BeautyBoxPersistence/Records/CategoryRecord.swift) & [CategoryRepository.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Sources/BeautyBoxPersistence/Repositories/CategoryRepository.swift) | `categories`（147 节点） | 一/二/三级树检索、可直选节点筛选与搜索；映射为 `BeautyBoxCore.CategoryMeta`（保持工具 `optional` 豁免与美瞳 `.lens` 标识）。 | [ProductRepositoryTests.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Tests/BeautyBoxPersistenceTests/ProductRepositoryTests.swift) |
| [BrandRecord.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Sources/BeautyBoxPersistence/Records/BrandRecord.swift) & [BrandRepository.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Sources/BeautyBoxPersistence/Repositories/BrandRepository.swift) | `brands` | 按清洗空白并小写的 `normalized_name` 幂等查找或创建品牌。 | [ProductRepositoryTests.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Tests/BeautyBoxPersistenceTests/ProductRepositoryTests.swift) |
| [ProductRecord.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Sources/BeautyBoxPersistence/Records/ProductRecord.swift) & [ProductRepository.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Sources/BeautyBoxPersistence/Repositories/ProductRepository.swift) | `products`、`product_lens_profiles` | `allow_direct_product` 拦截、委托 `ProductNameComposer` 维护 `is_custom_name`、委托 `LensConstraintValidator` 校验美瞳光学档案归属（并与 SQLite 触发器双重保障）、单事务创建/更新/按周期筛选与受控删除。 | [ProductRepositoryTests.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Tests/BeautyBoxPersistenceTests/ProductRepositoryTests.swift) |
| [ProductItemRecord.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Sources/BeautyBoxPersistence/Records/ProductItemRecord.swift) & [ProductItemRepository.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Sources/BeautyBoxPersistence/Repositories/ProductItemRepository.swift) | `product_items` | 映射 35 列结构（含 `INTEGER` 最小货币单位 `purchase_price_minor` + `currency_code`、`YYYY-MM-DD` 日期列、单盒 `lens_eye_side`/`lens_power`/`batch_code`、4 层效期）；支持原子批量建盒、`LifecycleEngine` + `ExpiryEngine` 单事务状态流转及分币种 `MoneyCalculator` 消费聚合。 | [ProductItemRepositoryTests.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxPersistence/Tests/BeautyBoxPersistenceTests/ProductItemRepositoryTests.swift) |

---

## 二、尚未纳入 `V3-06A` 的数据库业务（明确归属 `V3-06B`）
1. `MediaStore` 沙盒图片资产元数据（`media_assets`、`product_photos`、`look_photos`、`skin_diary_photos`）、四表引用归零物理删图、失败重试队列与启动孤儿文件对账。
2. `looks` & `look_product_items`（妆容日记 CRUD、四项 1～5 选填评分、不可变产品/美瞳单盒快照冻结）。
3. 完整 **7 天本地软删除回收站**（`direct` / `cascade_with_product`、`delete_batch_id` 恢复隔离、7 天到期及主动彻删事务编排）。
4. `wear_reviews`、`product_usage_logs`、`skin_diaries`、`routines` / `routine_steps` / `routine_logs` 与 `app_settings` / `backup_manifests` Repository。

---

## 三、本机已验证范围与 Mac/Xcode 待验证事项
- **已在当前 Linux 环境实际验证（Ubuntu 24.04 x86_64 + Swift 6.4.3 + `libsqlite3-dev 3.45.1-1ubuntu2.11` + GRDB `7.12.0`）**：
  - `swift build`（零警告、零错误）与 `swift test --enable-swift-testing` 真实磁盘/内存 SQLite 测试（3 套件 8 项全部通过）；
  - 与 `database/python/beautybox_db.py` 双向读写同一磁盘 SQLite 库与 SHA-256 校验和完全兼容。
- **需 Mac/Xcode 实测**：
  - iOS 真机 / iOS Simulator（ARM64）下链接 GRDB 7.12.0 与系统 `libsqlite3.tbd` 编译验证；
  - 将 `0001_schema_v1.sql` 与 `0001_categories_v1.sql` 打包进 Xcode App Bundle 资源并通过 `Bundle.main` 加载初始化；
  - 真机沙盒 `Library/Application Support` 与 `MediaStore` 物理文件 IO、`isExcludedFromBackup` 属性配置及 SwiftUI 界面联合联调。
