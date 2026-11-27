# 妆匣 BeautyBox — `BeautyBoxCore`（V3-05）纯 Swift 核心领域模块说明

- **版本基线**：`V3.1-Frozen`（依据 [ADR-0002](file:///home/xianggujiang/projects/BeautyBox/docs/adr/0002-m1-to-m10-product-decisions.md) 与 [0001_schema_v1.sql](file:///home/xianggujiang/projects/BeautyBox/database/migrations/0001_schema_v1.sql)）
- **Swift 包位置**：[ios/BeautyBoxCore/Package.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxCore/Package.swift)
- **模块性质**：零 UI（无 SwiftUI/UIKit）、零持久层（无 GRDB/SQLite）、零文件系统/网络依赖的纯 `Foundation` Swift 6 模块（全部值类型严格遵循 `Sendable`）。

---

## 一、V3.1 产品规则 → Swift 类型与单测映射表

| 产品规则维度 | Swift 核心实现 | 核心能力与约束 | 自动化测试位置 |
| --- | --- | --- | --- |
| **M8 / UD-04 多币种与零浮点金额** | [CurrencyAndMoney.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxCore/Sources/BeautyBoxCore/Models/CurrencyAndMoney.swift)、[MoneyCalculator.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxCore/Sources/BeautyBoxCore/Engines/MoneyCalculator.swift) | 覆盖全部 16 种 ISO 4217 币种及小数位（0/2/3 位），`Int64` 最小单位存储，上限 15 位（`999_999_999_999_999`），禁止 `Float`/`Double` 与跨币种直加，分币种独立合计。 | [MoneyCalculatorTests.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxCore/Tests/BeautyBoxCoreTests/MoneyCalculatorTests.swift) |
| **M2 / M9 生命周期 4 态与历史 `idle` 分流** | [LifecycleAndExpiryModels.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxCore/Sources/BeautyBoxCore/Models/LifecycleAndExpiryModels.swift)、[LifecycleEngine.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxCore/Sources/BeautyBoxCore/Engines/LifecycleEngine.swift) | `unrecorded/unopened/in_use/finished` 4 态不变式与 9 项转换矩阵；快捷栏禁选 `unrecorded`，仅独立红色重置清空使用与确认字段并保留原生产/PAO/历史关联；`assessLegacyIdle` 严格对齐 Python 迁移器证据分流。 | [LifecycleEngineTests.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxCore/Tests/BeautyBoxCoreTests/LifecycleEngineTests.swift) |
| **M6 四层日期模型与 `min()` 双约束** | [PureDate.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxCore/Sources/BeautyBoxCore/Models/PureDate.swift)、[ExpiryEngine.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxCore/Sources/BeautyBoxCore/Engines/ExpiryEngine.swift) | 公历 UTC 零偏移 `PureDate`（支持闰年与月末收口）；通用产品严格 `min(unopened_limit, opened_limit)`；`confirmed_expiry_date` 最高展示优先级及指纹变动检测；工具 `optional` 豁免。 | [ExpiryEngineTests.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxCore/Tests/BeautyBoxCoreTests/ExpiryEngineTests.swift) |
| **M1 `is_custom_name` 命名保护** | [ProductNameComposer.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxCore/Sources/BeautyBoxCore/Engines/ProductNameComposer.swift) | `[品牌] + [叶子分类] + [可选色号]` 建议名、跳过空白与邻近消重、不拼规格/数量；显式 `isCustomName` 保护不被品牌/色号调整误覆盖；提供显式刷新与恢复原样透传方法。 | [ProductNameAndLensTests.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxCore/Tests/BeautyBoxCoreTests/ProductNameAndLensTests.swift) |
| **UD-02 / M10 美瞳单盒与主档强校验** | [ProductModels.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxCore/Sources/BeautyBoxCore/Models/ProductModels.swift)、[LensConstraintValidator.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxCore/Sources/BeautyBoxCore/Engines/LensConstraintValidator.swift) | `Product` 仅当 `specialtyGroup == .lens` 时允许挂 `ProductLensProfile`；`replacement_cycle_code` 单源周期（开封后受 `min(packaging_exp, opened + cycle_days)` 约束，未开封禁猜）；单盒 `lens_power` 拒收多度数分隔符与空格；提供左右眼配对汇总但不合并实物库存。 | [ProductNameAndLensTests.swift](file:///home/xianggujiang/projects/BeautyBox/ios/BeautyBoxCore/Tests/BeautyBoxCoreTests/ProductNameAndLensTests.swift) |

---

## 二、典型调用示例

```swift
import BeautyBoxCore

// 1. 解析多币种金额并分组汇总（禁跨币种混加）
let cnyPrice = try MoneyCalculator.parse(decimalString: "299.00", currencyCode: "CNY")
let jpyPrice = try MoneyCalculator.parse(decimalString: "3200", currencyCode: "JPY")
let moneySummary = try MoneyCalculator.aggregateByCurrency([cnyPrice, jpyPrice], primaryCurrency: .cny)

// 2. 自动名称与自定义名称保护
let nameResult = ProductNameComposer.resolveForSave(
    existingName: "小辣椒正红",
    existingIsCustomName: true,
    editedNameInput: nil,
    brandName: "M·A·C",
    leafCategoryName: "口红",
    shade: "#316"
)

// 3. 评估四层隔离有效期
let today = try PureDate(isoString: "2026-11-27")
let expiryResult = try ExpiryEngine.evaluate(
    inputs: ExpiryRawInputs(
        lifecycleStatus: .inUse,
        manufactureDate: try PureDate(isoString: "2025-01-01"),
        unopenedShelfMonths: 36,
        openedDate: try PureDate(isoString: "2026-06-01"),
        paoMonths: 12
    ),
    today: today
)
```

---

## 三、与 Python 参考实现一致性及后续 `V3-06` 边界

1. **与 `beautybox_db.py` / SQLite DDL 对齐点**：
   - 16 种币种小数位、`MAX_MINOR_VALUE = 999_999_999_999_999` 与溢出拒绝语义完全一致。
   - `LifecycleStatus`、`ComputedExpiryBasis`、`ReplacementCycle`、`LensEyeSide` raw values 与 `0001_schema_v1.sql` `CHECK` 枚举逐字相同。
   - `LifecycleEngine.assessLegacyIdle` 的冲突检测键名、PAO/剩余比例不擅自推断 `in_use` 的保守边界与 `migrate_legacy_idle_status` 一致。
2. **供 `V3-06`（GRDB Repository & MediaStore）集成边界**：
   - GRDB Record 层负责 SQLite 行与 `Product` / `ProductItem` 的字段映射、外键触发器联动、7 天回收站事务与 `MediaStore` 沙盒文件清理；所有业务不变量（金额精度、状态切换清除表、`min()` 到期推算、美瞳单盒约束、名称建议）均应直接委托 `BeautyBoxCore` 计算，不在 Repository 或 SwiftUI View 内重复手写。
3. **当前验证范围与 Mac/Xcode 待实测项**：
   - **已在本机 Linux 完成**：`Swift 6.4.3 (x86_64-unknown-linux-gnu)` 编译、Swift Testing 纯逻辑单测、SQLite 真实库 20 项及冻结原型 9 项回归。
   - **需 Mac/Xcode 实测**：iOS/ARM64 真机与模拟器编译、Xcode Package 工程集成、GRDB SQLite 运行时挂载、SwiftUI 绑定与沙盒文件 IO。
