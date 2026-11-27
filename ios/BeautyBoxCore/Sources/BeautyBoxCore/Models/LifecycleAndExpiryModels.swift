import Foundation

/// 单件实物的 4 态核心生命周期（V3.1 正式枚举：无 `idle`）。
public enum LifecycleStatus: String, CaseIterable, Codable, Hashable, Sendable {
    case unrecorded
    case unopened
    case inUse = "in_use"
    case finished

    /// 是否计入“当前持有活跃件数”（M8：已用完不计入当前持有，但保留在历史与总消费中）。
    public var countsAsActiveOwned: Bool {
        self != .finished
    }

    /// 是否允许出现在顶部/列表快捷切换菜单（M2/M9：`unrecorded` 严禁出现在快捷切换条，仅允许通过详情页独立重置进入）。
    public var isShortcutSelectable: Bool {
        self != .unrecorded
    }
}

/// 生命周期流转操作触发入口。
public enum TransitionSource: Equatable, Hashable, Sendable {
    /// 列表中快捷切换菜单（禁止直接切向 `unrecorded`）。
    case quickAction
    /// 详情页独立“重置为未记录”红色操作入口。
    case dedicatedResetFlow
}

/// 单件状态转换请求。
public struct LifecycleTransitionRequest: Equatable, Hashable, Sendable {
    public let targetStatus: LifecycleStatus
    public let source: TransitionSource
    public let userConfirmed: Bool
    public let openedDateInput: PureDate?
    public let finishedDateInput: PureDate?
    public let remainingPercentInput: Int?
    public let today: PureDate

    public init(
        targetStatus: LifecycleStatus,
        source: TransitionSource = .quickAction,
        userConfirmed: Bool = false,
        openedDateInput: PureDate? = nil,
        finishedDateInput: PureDate? = nil,
        remainingPercentInput: Int? = nil,
        today: PureDate
    ) {
        self.targetStatus = targetStatus
        self.source = source
        self.userConfirmed = userConfirmed
        self.openedDateInput = openedDateInput
        self.finishedDateInput = finishedDateInput
        self.remainingPercentInput = remainingPercentInput
        self.today = today
    }
}

/// 生命周期状态转换执行结果：明确指示是否确认、清除字段与保留字段，便于纯单测与 GRDB 事务写回。
public struct LifecycleTransitionOutcome: Equatable, Hashable, Sendable {
    public let previousStatus: LifecycleStatus
    public let nextStatus: LifecycleStatus
    public let requiresConfirmation: Bool
    public let openedDate: PureDate?
    public let finishedAt: PureDate?
    public let remainingPercent: Int?
    public let lifecycleNote: String?
    public let confirmedExpiryDate: PureDate?
    public let expiryConfirmedAt: String?
    public let confirmedInputFingerprint: String?
    public let clearedFields: [String]
    public let preservedFields: [String]
    public let shouldClearComputedExpiry: Bool
}

/// 历史废弃 `idle` 迁移评估输入。
public struct LegacyIdleEvidence: Equatable, Hashable, Sendable {
    public let legacyStatus: String
    public let openedDate: PureDate?
    public let paoMonths: Int?
    public let remainingPercent: Int?
    public let manufactureDate: PureDate?
    public let finishedAt: PureDate?
    public let lastUsedAt: PureDate?
    public let hasUsageOrLookLinks: Bool
    public let today: PureDate?

    public init(
        legacyStatus: String,
        openedDate: PureDate? = nil,
        paoMonths: Int? = nil,
        remainingPercent: Int? = nil,
        manufactureDate: PureDate? = nil,
        finishedAt: PureDate? = nil,
        lastUsedAt: PureDate? = nil,
        hasUsageOrLookLinks: Bool = false,
        today: PureDate? = nil
    ) {
        self.legacyStatus = legacyStatus
        self.openedDate = openedDate
        self.paoMonths = paoMonths
        self.remainingPercent = remainingPercent
        self.manufactureDate = manufactureDate
        self.finishedAt = finishedAt
        self.lastUsedAt = lastUsedAt
        self.hasUsageOrLookLinks = hasUsageOrLookLinks
        self.today = today
    }
}

/// 历史 `idle` 迁移审核状态。
public enum MigrationReviewStatus: String, Codable, Hashable, Sendable {
    case pendingIdleReview = "pending_idle_review"
}

/// 历史 `idle` 证据评估输出。
public struct IdleMigrationAssessment: Equatable, Hashable, Sendable {
    public let targetStatus: LifecycleStatus
    public let reviewStatus: MigrationReviewStatus?
    public let branch: String
    public let conflicts: [String]
    public let openedDate: PureDate?
    public let finishedAt: PureDate?
    public let remainingPercent: Int?
    public let auditNote: String?
}

/// 第 2 层系统推算依据，与 `0001_schema_v1.sql` `computed_expiry_basis` CHECK 严格对齐。
public enum ComputedExpiryBasis: String, CaseIterable, Codable, Hashable, Sendable {
    case unrecorded
    case packagingExp = "packaging_exp"
    case mfgPlusShelf = "mfg_plus_shelf"
    case openedPaoOnly = "opened_pao_only"
    case minUnopenedAndPao = "min_unopened_and_pao"
    case lensOpenCycle = "lens_open_cycle"
    case minLensExpAndCycle = "min_lens_exp_and_cycle"
    case insufficient
}

/// 第 4 层有效到期日展示来源。
public enum EffectiveExpirySource: String, Codable, Hashable, Sendable {
    case userConfirmed = "user_confirmed"
    case systemComputed = "system_computed"
    case optionalNotTracked = "optional_not_tracked"
    case unknown
}

/// 有效期状态枚举（M2 正交维度）。
public enum ExpiryStatus: String, Codable, Hashable, Sendable {
    case normal
    case expiringSoon = "expiring_soon"
    case expired
    case unknown
    case optionalNotTracked = "optional_not_tracked"
}

/// 第 1 层有效期原始输入快照（供计算与确认指纹比对）。
public struct ExpiryRawInputs: Equatable, Hashable, Codable, Sendable {
    public let lifecycleStatus: LifecycleStatus
    public let expiryManagementMode: ExpiryManagementMode
    public let isLens: Bool
    public let replacementCycle: ReplacementCycle?
    public let lensPackPieceCount: Int?
    public let manufactureDate: PureDate?
    public let unopenedShelfMonths: Int?
    public let packagingExpDate: PureDate?
    public let openedDate: PureDate?
    public let paoMonths: Int?

    public init(
        lifecycleStatus: LifecycleStatus,
        expiryManagementMode: ExpiryManagementMode = .tracked,
        isLens: Bool = false,
        replacementCycle: ReplacementCycle? = nil,
        lensPackPieceCount: Int? = nil,
        manufactureDate: PureDate? = nil,
        unopenedShelfMonths: Int? = nil,
        packagingExpDate: PureDate? = nil,
        openedDate: PureDate? = nil,
        paoMonths: Int? = nil
    ) {
        self.lifecycleStatus = lifecycleStatus
        self.expiryManagementMode = expiryManagementMode
        self.isLens = isLens
        self.replacementCycle = replacementCycle
        self.lensPackPieceCount = lensPackPieceCount
        self.manufactureDate = manufactureDate
        self.unopenedShelfMonths = unopenedShelfMonths
        self.packagingExpDate = packagingExpDate
        self.openedDate = openedDate
        self.paoMonths = paoMonths
    }
}

/// 用户第 3 层手动确认状态输入。
public struct ExpiryConfirmationState: Equatable, Hashable, Codable, Sendable {
    public let confirmedExpiryDate: PureDate?
    public let expiryConfirmedAt: String?
    public let confirmedInputFingerprint: String?

    public init(
        confirmedExpiryDate: PureDate? = nil,
        expiryConfirmedAt: String? = nil,
        confirmedInputFingerprint: String? = nil
    ) {
        self.confirmedExpiryDate = confirmedExpiryDate
        self.expiryConfirmedAt = expiryConfirmedAt
        self.confirmedInputFingerprint = confirmedInputFingerprint
    }
}

/// 4 层隔离有效期计算结果。
public struct ExpiryEvaluationResult: Equatable, Hashable, Sendable {
    // 第 2 层：系统推算
    public let unopenedLimitDate: PureDate?
    public let openedLimitDate: PureDate?
    public let computedExpiryDate: PureDate?
    public let computedBasis: ComputedExpiryBasis

    // 第 3 层：用户确认与变更保护
    public let confirmedExpiryDate: PureDate?
    public let currentInputFingerprint: String
    public let inputsChangedSinceConfirmation: Bool
    public let needsReconfirmationPrompt: Bool

    // 第 4 层：最终展示与状态判定
    public let effectiveExpiryDate: PureDate?
    public let effectiveSource: EffectiveExpirySource
    public let status: ExpiryStatus
    public let daysUntilExpiry: Int?

    // 非猜测型安全提示（如缺开封/PAO 兜底、多片日抛盒单副提醒）
    public let fallbackNotice: String?
    public let lensMultiPieceDailyNotice: String?
}
