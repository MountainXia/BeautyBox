import Foundation

/// 三级产品分类层级，对应 V3.1 9 个一级 / 45 个二级 / 93 个三级分类体系。
public enum CategoryLevel: Int, Codable, Hashable, Sendable {
    case primary = 1
    case secondary = 2
    case leaf = 3
}

/// 分类效期管理模式（M6 工具豁免开关）。
public enum ExpiryManagementMode: String, Codable, Hashable, Sendable {
    /// 默认追踪效期。
    case tracked
    /// 化妆刷、美妆蛋、修眉刀等美妆工具，空白日期不报错不进“无法判断”告警。
    case optional
}

/// 分类专项能力标记（目前仅美瞳使用 `.lens`）。
public enum SpecialtyGroup: String, Codable, Hashable, Sendable {
    case lens
}

/// 轻量化分类元数据（供名称组合、效期豁免、美瞳强校验使用，脱离 SQLite 行实现）。
public struct CategoryMeta: Identifiable, Equatable, Hashable, Codable, Sendable {
    public let id: String
    public let code: String
    public let parentId: String?
    public let level: CategoryLevel
    public let name: String
    public let defaultSpecUnit: SpecUnit?
    public let allowDirectProduct: Bool
    public let expiryManagementMode: ExpiryManagementMode
    public let specialtyGroup: SpecialtyGroup?

    public init(
        id: String,
        code: String,
        parentId: String? = nil,
        level: CategoryLevel,
        name: String,
        defaultSpecUnit: SpecUnit? = nil,
        allowDirectProduct: Bool = true,
        expiryManagementMode: ExpiryManagementMode = .tracked,
        specialtyGroup: SpecialtyGroup? = nil
    ) {
        self.id = id
        self.code = code
        self.parentId = parentId
        self.level = level
        self.name = name
        self.defaultSpecUnit = defaultSpecUnit
        self.allowDirectProduct = allowDirectProduct
        self.expiryManagementMode = expiryManagementMode
        self.specialtyGroup = specialtyGroup
    }

    public var isLensCategory: Bool {
        specialtyGroup == .lens
    }

    public var isExpiryOptional: Bool {
        expiryManagementMode == .optional
    }
}

/// 轻量化品牌引用。
public struct BrandRef: Identifiable, Equatable, Hashable, Codable, Sendable {
    public let id: String
    public let name: String

    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

/// 产品规格单位（M5：固定存储于 Product 主档，不与库存数量混淆）。
public enum SpecUnit: String, CaseIterable, Codable, Hashable, Sendable {
    case ml
    case g
    case piece = "片"
    case stick = "支"
    case count = "枚"
    case other = "其他"
}

/// 产品规格描述（M5：只描述单瓶/单盒容量，绝不自动拼接进 `products.name`）。
public struct ProductSpec: Equatable, Hashable, Codable, Sendable {
    public let value: Decimal?
    public let unit: SpecUnit

    public init(value: Decimal?, unit: SpecUnit) {
        self.value = value
        self.unit = unit
    }
}
