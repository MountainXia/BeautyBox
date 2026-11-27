import Foundation

/// 美瞳左右眼成对聚合视图（仅用于详情/妆容选择呈现，不合并独立 `ProductItem` 单盒库存）。
public struct LensEyePairingSummary: Equatable, Hashable, Sendable {
    public let leftBoxes: [ProductItem]
    public let rightBoxes: [ProductItem]
    public let bothBoxes: [ProductItem]
    public let unspecifiedBoxes: [ProductItem]

    public var hasDistinctLeftRightPair: Bool {
        !leftBoxes.isEmpty && !rightBoxes.isEmpty
    }
}

/// 美瞳单盒粒度与主档结构校验引擎（UD-02 / M10）。
public enum LensConstraintValidator {
    private static let forbiddenPowerChars: Set<Character> = ["/", ",", "，", ";", "；", "|", " "]

    /// 校验美瞳主档与分类归属一致性：仅 `specialtyGroup == .lens` 的分类允许挂载 `ProductLensProfile`。
    public static func validateProduct(
        category: CategoryMeta,
        lensProfile: ProductLensProfile?
    ) throws {
        if lensProfile != nil && !category.isLensCategory {
            throw DomainError.lensProfileRequiresLensCategory(
                categoryId: category.id,
                specialtyGroup: category.specialtyGroup?.rawValue
            )
        }
    }

    /// 规范化并校验单盒 `lens_power`：只允许单一有效度数或 `nil`，严禁双度数斜杠/逗号/分号/空格混填。
    public static func normalizeSingleBoxPower(_ rawPower: String?) throws -> String? {
        guard let rawPower else { return nil }
        let trimmed = rawPower.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        if trimmed.contains(where: { forbiddenPowerChars.contains($0) || $0.isNewline }) {
            throw DomainError.invalidLensPowerFormat(rawPower)
        }
        return trimmed
    }

    /// 判断两盒美瞳是否可在批量创建/采购入库时视作完全同规格的复制盒；若度数、眼别、包装 EXP、批号或购买日期任一不同则严禁合并。
    public static func canShareSameBoxProfile(_ lhs: ProductItem, _ rhs: ProductItem) -> Bool {
        lhs.productId == rhs.productId
            && lhs.lensPower == rhs.lensPower
            && lhs.lensEyeSide == rhs.lensEyeSide
            && lhs.packagingExpDate == rhs.packagingExpDate
            && lhs.batchCode == rhs.batchCode
            && lhs.purchaseDate == rhs.purchaseDate
    }

    /// 将同一美瞳产品下的多个独立单盒按眼别聚合展示，自动排除已软删或已用完（可选过滤）。
    public static func summarizePairing(
        boxes: [ProductItem],
        includeFinished: Bool = false
    ) -> LensEyePairingSummary {
        let active = includeFinished ? boxes : boxes.filter { $0.lifecycleStatus.countsAsActiveOwned }
        var left: [ProductItem] = []
        var right: [ProductItem] = []
        var both: [ProductItem] = []
        var unspecified: [ProductItem] = []

        for box in active {
            switch box.lensEyeSide {
            case .left:
                left.append(box)
            case .right:
                right.append(box)
            case .both:
                both.append(box)
            case .unspecified, .none:
                unspecified.append(box)
            }
        }

        return LensEyePairingSummary(
            leftBoxes: left,
            rightBoxes: right,
            bothBoxes: both,
            unspecifiedBoxes: unspecified
        )
    }
}
