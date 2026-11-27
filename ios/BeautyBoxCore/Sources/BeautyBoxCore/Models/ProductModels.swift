import Foundation

/// 美瞳结构化更换周期（唯一事实来源：`product_lens_profiles.replacement_cycle_code`）。
public enum ReplacementCycle: String, CaseIterable, Codable, Hashable, Sendable {
    case daily
    case biweekly
    case monthly
    case quarterly
    case semiannual
    case annual
    case other

    /// 按 ADR-0002 M6 定义的开封后更换周期自然天数；`other` 返回 `nil`，交由用户可选 PAO 或手动确认到期日决定。
    public var cycleDays: Int? {
        switch self {
        case .daily: return 0
        case .biweekly: return 14
        case .monthly: return 30
        case .quarterly: return 90
        case .semiannual: return 180
        case .annual: return 365
        case .other: return nil
        }
    }

    public var displayName: String {
        switch self {
        case .daily: return "日抛"
        case .biweekly: return "双周抛"
        case .monthly: return "月抛"
        case .quarterly: return "季抛"
        case .semiannual: return "半年抛"
        case .annual: return "年抛"
        case .other: return "其他"
        }
    }
}

/// 美瞳单盒适用眼别（`product_items.lens_eye_side`）。
public enum LensEyeSide: String, CaseIterable, Codable, Hashable, Sendable {
    case unspecified
    case left
    case right
    case both

    public var displayName: String {
        switch self {
        case .unspecified: return "未指定"
        case .left: return "左眼"
        case .right: return "右眼"
        case .both: return "双眼通用"
        }
    }
}

/// 美瞳 Product 主档光学与周期档案（`product_lens_profiles`，除更换周期外全部光学参数允许留空）。
public struct ProductLensProfile: Equatable, Hashable, Codable, Sendable {
    public let replacementCycle: ReplacementCycle
    public let baseCurveMm: Decimal?
    public let diameterMm: Decimal?
    public let waterContentPercent: Decimal?
    public let packPieceCount: Int?
    public let colorPattern: String?

    public init(
        replacementCycle: ReplacementCycle,
        baseCurveMm: Decimal? = nil,
        diameterMm: Decimal? = nil,
        waterContentPercent: Decimal? = nil,
        packPieceCount: Int? = nil,
        colorPattern: String? = nil
    ) {
        self.replacementCycle = replacementCycle
        self.baseCurveMm = baseCurveMm
        self.diameterMm = diameterMm
        self.waterContentPercent = waterContentPercent
        self.packPieceCount = packPieceCount
        self.colorPattern = colorPattern
    }
}

/// 产品主档（Product，同款同系列共享，独立于单件/单盒实物 ProductItem）。
public struct Product: Identifiable, Equatable, Hashable, Codable, Sendable {
    public let id: String
    public var name: String
    public var isCustomName: Bool
    public var brandName: String?
    public var category: CategoryMeta
    public var shade: String?
    public var spec: ProductSpec?
    public var lensProfile: ProductLensProfile?

    public init(
        id: String,
        name: String,
        isCustomName: Bool = false,
        brandName: String? = nil,
        category: CategoryMeta,
        shade: String? = nil,
        spec: ProductSpec? = nil,
        lensProfile: ProductLensProfile? = nil
    ) throws {
        if lensProfile != nil && !category.isLensCategory {
            throw DomainError.lensProfileRequiresLensCategory(
                categoryId: category.id,
                specialtyGroup: category.specialtyGroup?.rawValue
            )
        }
        self.id = id
        self.name = name
        self.isCustomName = isCustomName
        self.brandName = brandName
        self.category = category
        self.shade = shade
        self.spec = spec
        self.lensProfile = lensProfile
    }
}

/// 单件/单盒实物领域模型（ProductItem），严禁包含旧版双度数或 `idle` 状态。
public struct ProductItem: Identifiable, Equatable, Hashable, Codable, Sendable {
    public let id: String
    public let productId: String
    public var purchasePrice: MoneyAmount?
    public var purchaseDate: PureDate?
    public var lifecycleStatus: LifecycleStatus
    public var remainingPercent: Int?
    public var lifecycleNote: String?
    public var lastUsedAt: PureDate?
    public var finishedAt: PureDate?
    public var manufactureDate: PureDate?
    public var unopenedShelfMonths: Int?
    public var packagingExpDate: PureDate?
    public var openedDate: PureDate?
    public var paoMonths: Int?
    public var confirmedExpiryDate: PureDate?
    public var expiryConfirmedAt: String?
    public var confirmedInputFingerprint: String?
    public var lensEyeSide: LensEyeSide?
    public var lensPower: String?
    public var batchCode: String?

    public init(
        id: String,
        productId: String,
        purchasePrice: MoneyAmount? = nil,
        purchaseDate: PureDate? = nil,
        lifecycleStatus: LifecycleStatus = .unrecorded,
        remainingPercent: Int? = nil,
        lifecycleNote: String? = nil,
        lastUsedAt: PureDate? = nil,
        finishedAt: PureDate? = nil,
        manufactureDate: PureDate? = nil,
        unopenedShelfMonths: Int? = nil,
        packagingExpDate: PureDate? = nil,
        openedDate: PureDate? = nil,
        paoMonths: Int? = nil,
        confirmedExpiryDate: PureDate? = nil,
        expiryConfirmedAt: String? = nil,
        confirmedInputFingerprint: String? = nil,
        lensEyeSide: LensEyeSide? = nil,
        lensPower: String? = nil,
        batchCode: String? = nil
    ) throws {
        if let shelf = unopenedShelfMonths, shelf <= 0 {
            throw DomainError.nonPositiveMonths(field: "unopenedShelfMonths", value: shelf)
        }
        if let pao = paoMonths, pao <= 0 {
            throw DomainError.nonPositiveMonths(field: "paoMonths", value: pao)
        }
        if let opened = openedDate, let mfg = manufactureDate, opened < mfg {
            throw DomainError.openedDateBeforeManufactureDate(opened: opened, manufacture: mfg)
        }
        if let finished = finishedAt, let opened = openedDate, finished < opened {
            throw DomainError.finishedDateBeforeOpenedDate(finished: finished, opened: opened)
        }
        if let rem = remainingPercent, !(0...100).contains(rem) {
            throw DomainError.invalidRemainingPercent(rem)
        }
        if lifecycleStatus == .unrecorded && (remainingPercent != nil || openedDate != nil || finishedAt != nil) {
            throw DomainError.unrecordedCannotHoldUsageFields
        }
        if lifecycleStatus == .finished && remainingPercent != 0 {
            throw DomainError.finishedRequiresZeroRemaining(actual: remainingPercent)
        }
        let normalizedPower = try LensConstraintValidator.normalizeSingleBoxPower(lensPower)

        self.id = id
        self.productId = productId
        self.purchasePrice = purchasePrice
        self.purchaseDate = purchaseDate
        self.lifecycleStatus = lifecycleStatus
        self.remainingPercent = remainingPercent
        self.lifecycleNote = lifecycleNote
        self.lastUsedAt = lastUsedAt
        self.finishedAt = finishedAt
        self.manufactureDate = manufactureDate
        self.unopenedShelfMonths = unopenedShelfMonths
        self.packagingExpDate = packagingExpDate
        self.openedDate = openedDate
        self.paoMonths = paoMonths
        self.confirmedExpiryDate = confirmedExpiryDate
        self.expiryConfirmedAt = expiryConfirmedAt
        self.confirmedInputFingerprint = confirmedInputFingerprint
        self.lensEyeSide = lensEyeSide
        self.lensPower = normalizedPower
        self.batchCode = batchCode?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    }
}

extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}
