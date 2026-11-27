import Foundation

/// 单件实物生命周期状态机与历史 `idle` 证据评估引擎（M2 / M9）。
public enum LifecycleEngine {
    /// 执行 V3.1 完整 9 项状态转换规则校验与字段清除/保留决策。
    public static func transition(
        item: ProductItem,
        request: LifecycleTransitionRequest
    ) throws -> LifecycleTransitionOutcome {
        let from = item.lifecycleStatus
        let to = request.targetStatus

        if from == to {
            return try handleSameStateEdit(item: item, request: request)
        }

        switch (from, to) {
        case (.unopened, .unrecorded), (.inUse, .unrecorded), (.finished, .unrecorded):
            guard request.source == .dedicatedResetFlow else {
                throw DomainError.shortcutTransitionDisallowed(
                    from: from,
                    to: to,
                    reason: "快捷切换菜单严禁出现“未记录”，仅详情页独立重置入口允许重置"
                )
            }
            guard request.userConfirmed else {
                throw DomainError.confirmationRequired(from: from, to: to)
            }
            return LifecycleTransitionOutcome(
                previousStatus: from,
                nextStatus: .unrecorded,
                requiresConfirmation: true,
                openedDate: nil,
                finishedAt: nil,
                remainingPercent: nil,
                lifecycleNote: nil,
                confirmedExpiryDate: nil,
                expiryConfirmedAt: nil,
                confirmedInputFingerprint: nil,
                clearedFields: [
                    "opened_date",
                    "finished_at",
                    "remaining_percent",
                    "lifecycle_note",
                    "confirmed_expiry_date",
                    "expiry_confirmed_at",
                    "confirmed_input_fingerprint",
                    "computed_expiry_date",
                ],
                preservedFields: [
                    "product_id",
                    "purchase_price",
                    "purchase_date",
                    "manufacture_date",
                    "unopened_shelf_months",
                    "pao_months",
                    "packaging_exp_date",
                    "lens_eye_side",
                    "lens_power",
                    "batch_code",
                    "look_product_items_and_usage_logs",
                ],
                shouldClearComputedExpiry: true
            )

        case (.unrecorded, .unopened):
            return LifecycleTransitionOutcome(
                previousStatus: from,
                nextStatus: .unopened,
                requiresConfirmation: false,
                openedDate: nil,
                finishedAt: nil,
                remainingPercent: 100,
                lifecycleNote: item.lifecycleNote,
                confirmedExpiryDate: item.confirmedExpiryDate,
                expiryConfirmedAt: item.expiryConfirmedAt,
                confirmedInputFingerprint: item.confirmedInputFingerprint,
                clearedFields: [],
                preservedFields: ["manufacture_date", "unopened_shelf_months", "packaging_exp_date", "pao_months", "purchase_price", "purchase_date"],
                shouldClearComputedExpiry: false
            )

        case (.unrecorded, .inUse), (.unopened, .inUse):
            let resolvedOpened = request.openedDateInput ?? (from == .unopened ? request.today : nil)
            if let opened = resolvedOpened, let mfg = item.manufactureDate, opened < mfg {
                throw DomainError.openedDateBeforeManufactureDate(opened: opened, manufacture: mfg)
            }
            let resolvedRemaining = request.remainingPercentInput ?? item.remainingPercent ?? 100
            guard (0...100).contains(resolvedRemaining) else {
                throw DomainError.invalidRemainingPercent(resolvedRemaining)
            }
            return LifecycleTransitionOutcome(
                previousStatus: from,
                nextStatus: .inUse,
                requiresConfirmation: false,
                openedDate: resolvedOpened,
                finishedAt: nil,
                remainingPercent: resolvedRemaining,
                lifecycleNote: item.lifecycleNote,
                confirmedExpiryDate: item.confirmedExpiryDate,
                expiryConfirmedAt: item.expiryConfirmedAt,
                confirmedInputFingerprint: item.confirmedInputFingerprint,
                clearedFields: [],
                preservedFields: ["manufacture_date", "unopened_shelf_months", "packaging_exp_date", "pao_months", "confirmed_expiry_date"],
                shouldClearComputedExpiry: false
            )

        case (.inUse, .finished):
            guard request.userConfirmed else {
                throw DomainError.confirmationRequired(from: from, to: to)
            }
            let resolvedFinished = request.finishedDateInput ?? request.today
            if let opened = item.openedDate, resolvedFinished < opened {
                throw DomainError.finishedDateBeforeOpenedDate(finished: resolvedFinished, opened: opened)
            }
            return LifecycleTransitionOutcome(
                previousStatus: from,
                nextStatus: .finished,
                requiresConfirmation: true,
                openedDate: item.openedDate,
                finishedAt: resolvedFinished,
                remainingPercent: 0,
                lifecycleNote: item.lifecycleNote,
                confirmedExpiryDate: item.confirmedExpiryDate,
                expiryConfirmedAt: item.expiryConfirmedAt,
                confirmedInputFingerprint: item.confirmedInputFingerprint,
                clearedFields: [],
                preservedFields: ["manufacture_date", "opened_date", "pao_months", "packaging_exp_date", "purchase_price", "look_product_items"],
                shouldClearComputedExpiry: false
            )

        case (.unrecorded, .finished), (.unopened, .finished):
            throw DomainError.shortcutTransitionDisallowed(
                from: from,
                to: to,
                reason: "请先记录开封使用中状态，再标记为已用完"
            )

        case (.finished, .inUse):
            guard request.userConfirmed else {
                throw DomainError.confirmationRequired(from: from, to: to)
            }
            let candidateRemaining = request.remainingPercentInput ?? 50
            guard (1...100).contains(candidateRemaining) else {
                throw DomainError.invalidRemainingPercent(candidateRemaining)
            }
            return LifecycleTransitionOutcome(
                previousStatus: from,
                nextStatus: .inUse,
                requiresConfirmation: true,
                openedDate: request.openedDateInput ?? item.openedDate,
                finishedAt: nil,
                remainingPercent: candidateRemaining,
                lifecycleNote: item.lifecycleNote,
                confirmedExpiryDate: item.confirmedExpiryDate,
                expiryConfirmedAt: item.expiryConfirmedAt,
                confirmedInputFingerprint: item.confirmedInputFingerprint,
                clearedFields: ["finished_at"],
                preservedFields: ["opened_date", "pao_months", "manufacture_date", "packaging_exp_date", "purchase_price", "look_product_items"],
                shouldClearComputedExpiry: false
            )

        case (.inUse, .unopened), (.finished, .unopened):
            guard request.userConfirmed else {
                throw DomainError.confirmationRequired(from: from, to: to)
            }
            return LifecycleTransitionOutcome(
                previousStatus: from,
                nextStatus: .unopened,
                requiresConfirmation: true,
                openedDate: nil,
                finishedAt: nil,
                remainingPercent: 100,
                lifecycleNote: item.lifecycleNote,
                confirmedExpiryDate: item.confirmedExpiryDate,
                expiryConfirmedAt: item.expiryConfirmedAt,
                confirmedInputFingerprint: item.confirmedInputFingerprint,
                clearedFields: from == .finished ? ["opened_date", "finished_at"] : ["opened_date"],
                preservedFields: ["manufacture_date", "unopened_shelf_months", "packaging_exp_date", "pao_months", "purchase_price", "look_product_items"],
                shouldClearComputedExpiry: false
            )

        case (.unrecorded, .unrecorded), (.unopened, .unopened), (.inUse, .inUse), (.finished, .finished):
            return try handleSameStateEdit(item: item, request: request)
        }
    }

    private static func handleSameStateEdit(
        item: ProductItem,
        request: LifecycleTransitionRequest
    ) throws -> LifecycleTransitionOutcome {
        let nextOpened = item.lifecycleStatus == .unrecorded ? nil : (request.openedDateInput ?? item.openedDate)
        let nextFinished = item.lifecycleStatus == .finished ? (request.finishedDateInput ?? item.finishedAt) : nil
        if let opened = nextOpened, let mfg = item.manufactureDate, opened < mfg {
            throw DomainError.openedDateBeforeManufactureDate(opened: opened, manufacture: mfg)
        }
        if let finished = nextFinished, let opened = nextOpened, finished < opened {
            throw DomainError.finishedDateBeforeOpenedDate(finished: finished, opened: opened)
        }
        let nextRemaining: Int?
        switch item.lifecycleStatus {
        case .unrecorded:
            nextRemaining = nil
        case .finished:
            nextRemaining = 0
        case .unopened, .inUse:
            let rem = request.remainingPercentInput ?? item.remainingPercent
            if let r = rem, !(0...100).contains(r) {
                throw DomainError.invalidRemainingPercent(r)
            }
            nextRemaining = rem
        }
        return LifecycleTransitionOutcome(
            previousStatus: item.lifecycleStatus,
            nextStatus: item.lifecycleStatus,
            requiresConfirmation: false,
            openedDate: nextOpened,
            finishedAt: nextFinished,
            remainingPercent: nextRemaining,
            lifecycleNote: item.lifecycleNote,
            confirmedExpiryDate: item.confirmedExpiryDate,
            expiryConfirmedAt: item.expiryConfirmedAt,
            confirmedInputFingerprint: item.confirmedInputFingerprint,
            clearedFields: [],
            preservedFields: ["all_existing_fields"],
            shouldClearComputedExpiry: false
        )
    }

    /// V3.1 历史废弃 `idle` 枚举严格证据分流评估（与 `beautybox_db.py` `migrate_legacy_idle_status` 对齐）。
    ///
    /// - 存在任何矛盾证据时，进入 `unrecorded + pending_idle_review` 保守待核对态；
    /// - 仅凭 `paoMonths` 或孤立 `remainingPercent` 绝不擅自推断为 `in_use`；
    /// - 仅无矛盾且存在明确 `openedDate` 或真实使用证据（`lastUsedAt` / `hasUsageOrLookLinks`）才迁至 `in_use`。
    public static func assessLegacyIdle(_ evidence: LegacyIdleEvidence) -> IdleMigrationAssessment {
        let raw = evidence.legacyStatus
        if raw != "idle" {
            if let valid = LifecycleStatus(rawValue: raw) {
                return IdleMigrationAssessment(
                    targetStatus: valid,
                    reviewStatus: nil,
                    branch: "direct_valid_status",
                    conflicts: [],
                    openedDate: evidence.openedDate,
                    finishedAt: evidence.finishedAt,
                    remainingPercent: evidence.remainingPercent,
                    auditNote: nil
                )
            }
            return IdleMigrationAssessment(
                targetStatus: .unrecorded,
                reviewStatus: .pendingIdleReview,
                branch: "branch_c_unknown_status_to_pending",
                conflicts: ["unknown_legacy_status:\(raw)"],
                openedDate: nil,
                finishedAt: nil,
                remainingPercent: nil,
                auditNote: "[迁移日志] 未知旧状态：\(raw)（转为未记录待人工核对）"
            )
        }

        var conflicts: [String] = []
        if evidence.finishedAt != nil {
            conflicts.append("idle_with_finished_at")
        }
        if evidence.remainingPercent == 0 {
            conflicts.append("idle_with_zero_remaining")
        }
        if let opened = evidence.openedDate, let mfg = evidence.manufactureDate, opened < mfg {
            conflicts.append("opened_before_manufacture")
        }
        if let opened = evidence.openedDate, let today = evidence.today, opened > today {
            conflicts.append("opened_in_future")
        }

        let hasOpened = evidence.openedDate != nil
        let hasActiveUsage = evidence.lastUsedAt != nil || evidence.hasUsageOrLookLinks
        if !hasOpened && !hasActiveUsage, let rem = evidence.remainingPercent, rem < 100 {
            conflicts.append("partial_remaining_without_usage_or_open_evidence")
        }

        if !conflicts.isEmpty {
            return IdleMigrationAssessment(
                targetStatus: .unrecorded,
                reviewStatus: .pendingIdleReview,
                branch: "branch_b_conflict_to_unrecorded_pending",
                conflicts: conflicts,
                openedDate: nil,
                finishedAt: nil,
                remainingPercent: nil,
                auditNote: "[迁移日志] 原状态：idle（证据存在冲突或不足[\(conflicts.joined(separator: ","))]，转未记录待人工核对）"
            )
        }

        if hasOpened || hasActiveUsage {
            let branch = hasOpened ? "branch_a_opened_date_to_in_use" : "branch_a_usage_evidence_to_in_use"
            let basis = hasOpened ? "明确开封日期" : "实际使用/妆容关联记录（缺开封日期）"
            return IdleMigrationAssessment(
                targetStatus: .inUse,
                reviewStatus: nil,
                branch: branch,
                conflicts: [],
                openedDate: evidence.openedDate,
                finishedAt: nil,
                remainingPercent: evidence.remainingPercent,
                auditNote: "[迁移日志] 原状态：idle（依据\(basis)迁至使用中）"
            )
        }

        return IdleMigrationAssessment(
            targetStatus: .unrecorded,
            reviewStatus: .pendingIdleReview,
            branch: "branch_b_insufficient_evidence_to_pending",
            conflicts: [],
            openedDate: nil,
            finishedAt: nil,
            remainingPercent: nil,
            auditNote: "[迁移日志] 原状态：idle（无明确开封及使用证据，转未记录待人工核对）"
        )
    }
}
