import Testing
@testable import BeautyBoxCore

@Suite("LifecycleEngine 4态流转与历史 idle 证据分流测试")
struct LifecycleEngineTests {
    private let d = { (iso: String) -> PureDate in try! PureDate(isoString: iso) }

    @Test("ProductItem 不变式校验：unrecorded、finished、开封/用完日期先后、剩余比例")
    func productItemInvariants() throws {
        #expect(throws: DomainError.unrecordedCannotHoldUsageFields) {
            _ = try ProductItem(
                id: "i1",
                productId: "p1",
                lifecycleStatus: .unrecorded,
                openedDate: d("2026-01-10")
            )
        }
        #expect(throws: DomainError.finishedRequiresZeroRemaining(actual: 20)) {
            _ = try ProductItem(
                id: "i2",
                productId: "p1",
                lifecycleStatus: .finished,
                remainingPercent: 20
            )
        }
        #expect(throws: DomainError.openedDateBeforeManufactureDate(opened: d("2025-12-01"), manufacture: d("2026-01-01"))) {
            _ = try ProductItem(
                id: "i3",
                productId: "p1",
                lifecycleStatus: .inUse,
                remainingPercent: 80,
                manufactureDate: d("2026-01-01"),
                openedDate: d("2025-12-01")
            )
        }
        #expect(throws: DomainError.finishedDateBeforeOpenedDate(finished: d("2026-02-01"), opened: d("2026-03-01"))) {
            _ = try ProductItem(
                id: "i4",
                productId: "p1",
                lifecycleStatus: .finished,
                remainingPercent: 0,
                finishedAt: d("2026-02-01"),
                openedDate: d("2026-03-01")
            )
        }
    }

    @Test("9 项状态转换矩阵：开封、标记已用完二次确认、退回未开封、独立红色重置为未记录")
    func lifecycleTransitionMatrix() throws {
        let mfg = d("2025-06-01")
        let exp = d("2028-06-01")
        let today = d("2026-11-27")

        let unopenedItem = try ProductItem(
            id: "item-1",
            productId: "prod-1",
            lifecycleStatus: .unopened,
            remainingPercent: 100,
            manufactureDate: mfg,
            unopenedShelfMonths: 36,
            packagingExpDate: exp,
            paoMonths: 12
        )

        // 1. unopened -> in_use（直接开启，默认 today + 100%）
        let openedOutcome = try LifecycleEngine.transition(
            item: unopenedItem,
            request: LifecycleTransitionRequest(targetStatus: .inUse, today: today)
        )
        #expect(openedOutcome.nextStatus == .inUse)
        #expect(openedOutcome.openedDate == today)
        #expect(openedOutcome.remainingPercent == 100)
        #expect(openedOutcome.requiresConfirmation == false)

        // 2. unopened -> in_use 若开封早于生产日期应拦截
        #expect(throws: DomainError.openedDateBeforeManufactureDate(opened: d("2025-05-01"), manufacture: mfg)) {
            _ = try LifecycleEngine.transition(
                item: unopenedItem,
                request: LifecycleTransitionRequest(
                    targetStatus: .inUse,
                    openedDateInput: d("2025-05-01"),
                    today: today
                )
            )
        }

        // 3. in_use -> finished 未确认时拦截，确认后归零并记录用完日
        let inUseItem = try ProductItem(
            id: "item-1",
            productId: "prod-1",
            lifecycleStatus: .inUse,
            remainingPercent: 25,
            manufactureDate: mfg,
            unopenedShelfMonths: 36,
            packagingExpDate: exp,
            openedDate: d("2026-05-01"),
            paoMonths: 12,
            confirmedExpiryDate: d("2027-04-30"),
            expiryConfirmedAt: "2026-05-01T10:00:00Z",
            confirmedInputFingerprint: "fp1"
        )
        #expect(throws: DomainError.confirmationRequired(from: .inUse, to: .finished)) {
            _ = try LifecycleEngine.transition(
                item: inUseItem,
                request: LifecycleTransitionRequest(targetStatus: .finished, userConfirmed: false, today: today)
            )
        }
        let finishedOutcome = try LifecycleEngine.transition(
            item: inUseItem,
            request: LifecycleTransitionRequest(targetStatus: .finished, userConfirmed: true, today: today)
        )
        #expect(finishedOutcome.nextStatus == .finished)
        #expect(finishedOutcome.remainingPercent == 0)
        #expect(finishedOutcome.finishedAt == today)

        // 4. 快捷菜单严禁直接切换至 unrecorded
        #expect(throws: DomainError.shortcutTransitionDisallowed(
            from: .inUse,
            to: .unrecorded,
            reason: "快捷切换菜单严禁出现“未记录”，仅详情页独立重置入口允许重置"
        )) {
            _ = try LifecycleEngine.transition(
                item: inUseItem,
                request: LifecycleTransitionRequest(
                    targetStatus: .unrecorded,
                    source: .quickAction,
                    userConfirmed: true,
                    today: today
                )
            )
        }

        // 5. 详情页独立红色重置：清除使用/确认字段，保留原始生产/PAO/包装期与历史关联
        let resetOutcome = try LifecycleEngine.transition(
            item: inUseItem,
            request: LifecycleTransitionRequest(
                targetStatus: .unrecorded,
                source: .dedicatedResetFlow,
                userConfirmed: true,
                today: today
            )
        )
        #expect(resetOutcome.nextStatus == .unrecorded)
        #expect(resetOutcome.openedDate == nil)
        #expect(resetOutcome.finishedAt == nil)
        #expect(resetOutcome.remainingPercent == nil)
        #expect(resetOutcome.confirmedExpiryDate == nil)
        #expect(resetOutcome.shouldClearComputedExpiry == true)
        #expect(resetOutcome.preservedFields.contains("manufacture_date"))
        #expect(resetOutcome.preservedFields.contains("pao_months"))
        #expect(resetOutcome.preservedFields.contains("look_product_items_and_usage_logs"))

        // 6. in_use -> unopened 退回需确认并清除 opened_date、重回 100%
        let revertOutcome = try LifecycleEngine.transition(
            item: inUseItem,
            request: LifecycleTransitionRequest(targetStatus: .unopened, userConfirmed: true, today: today)
        )
        #expect(revertOutcome.nextStatus == .unopened)
        #expect(revertOutcome.openedDate == nil)
        #expect(revertOutcome.remainingPercent == 100)
        #expect(revertOutcome.clearedFields == ["opened_date"])

        // 7. finished -> in_use 重新启用需确认并清除 finished_at，禁止保持 0%
        let finishedItem = try ProductItem(
            id: "item-1",
            productId: "prod-1",
            lifecycleStatus: .finished,
            remainingPercent: 0,
            finishedAt: d("2026-11-01"),
            manufactureDate: mfg,
            openedDate: d("2026-05-01")
        )
        #expect(throws: DomainError.invalidRemainingPercent(0)) {
            _ = try LifecycleEngine.transition(
                item: finishedItem,
                request: LifecycleTransitionRequest(
                    targetStatus: .inUse,
                    userConfirmed: true,
                    remainingPercentInput: 0,
                    today: today
                )
            )
        }
        let reopenOutcome = try LifecycleEngine.transition(
            item: finishedItem,
            request: LifecycleTransitionRequest(
                targetStatus: .inUse,
                userConfirmed: true,
                remainingPercentInput: 30,
                today: today
            )
        )
        #expect(reopenOutcome.nextStatus == .inUse)
        #expect(reopenOutcome.finishedAt == nil)
        #expect(reopenOutcome.remainingPercent == 30)
        #expect(reopenOutcome.clearedFields == ["finished_at"])

        // 8. finished -> in_use 时改填早于生产日期的开封日亦应拦截，finished -> unopened 高风险退回双清
        #expect(throws: DomainError.openedDateBeforeManufactureDate(opened: d("2025-05-01"), manufacture: mfg)) {
            _ = try LifecycleEngine.transition(
                item: finishedItem,
                request: LifecycleTransitionRequest(
                    targetStatus: .inUse,
                    userConfirmed: true,
                    openedDateInput: d("2025-05-01"),
                    remainingPercentInput: 30,
                    today: today
                )
            )
        }
        let finishedToUnopened = try LifecycleEngine.transition(
            item: finishedItem,
            request: LifecycleTransitionRequest(targetStatus: .unopened, userConfirmed: true, today: today)
        )
        #expect(finishedToUnopened.nextStatus == .unopened)
        #expect(finishedToUnopened.openedDate == nil)
        #expect(finishedToUnopened.finishedAt == nil)
        #expect(finishedToUnopened.remainingPercent == 100)
        #expect(finishedToUnopened.clearedFields == ["opened_date", "finished_at"])
    }

    @Test("历史废弃 idle 严格证据分流：拒绝孤立 PAO/剩余比例臆断，矛盾证据进待核对")
    func legacyIdleEvidenceAssessment() {
        let today = d("2026-11-27")

        // 分支 A1：明确开封日期 -> in_use
        let byOpened = LifecycleEngine.assessLegacyIdle(
            LegacyIdleEvidence(legacyStatus: "idle", openedDate: d("2026-08-01"), today: today)
        )
        #expect(byOpened.targetStatus == .inUse)
        #expect(byOpened.reviewStatus == nil)

        // 分支 A2：有真实妆容或使用打卡记录 -> in_use
        let byUsage = LifecycleEngine.assessLegacyIdle(
            LegacyIdleEvidence(legacyStatus: "idle", hasUsageOrLookLinks: true, today: today)
        )
        #expect(byUsage.targetStatus == .inUse)
        #expect(byUsage.reviewStatus == nil)

        // 分支 B1：仅填写 PAO 但无开封与使用记录 -> 不得擅自推断 in_use，迁为 unrecorded + pending_idle_review
        let onlyPao = LifecycleEngine.assessLegacyIdle(
            LegacyIdleEvidence(legacyStatus: "idle", paoMonths: 12, today: today)
        )
        #expect(onlyPao.targetStatus == .unrecorded)
        #expect(onlyPao.reviewStatus == .pendingIdleReview)

        // 分支 B2：只有 remainingPercent == 100 -> 证据不足，转待人工核对
        let onlyFullRem = LifecycleEngine.assessLegacyIdle(
            LegacyIdleEvidence(legacyStatus: "idle", remainingPercent: 100, today: today)
        )
        #expect(onlyFullRem.targetStatus == .unrecorded)
        #expect(onlyFullRem.reviewStatus == .pendingIdleReview)

        // 分支 B3：存在矛盾证据（例如同时有 finishedAt，未来开封日，或孤立残量 < 100）
        let conflictZero = LifecycleEngine.assessLegacyIdle(
            LegacyIdleEvidence(legacyStatus: "idle", remainingPercent: 0, finishedAt: d("2026-09-01"), today: today)
        )
        #expect(conflictZero.targetStatus == .unrecorded)
        #expect(conflictZero.reviewStatus == .pendingIdleReview)
        #expect(conflictZero.conflicts.contains("idle_with_finished_at"))
        #expect(conflictZero.conflicts.contains("idle_with_zero_remaining"))

        let futureOpened = LifecycleEngine.assessLegacyIdle(
            LegacyIdleEvidence(legacyStatus: "idle", openedDate: d("2026-12-01"), today: today)
        )
        #expect(futureOpened.targetStatus == .unrecorded)
        #expect(futureOpened.reviewStatus == .pendingIdleReview)
        #expect(futureOpened.conflicts == ["opened_in_future"])

        let conflictPartial = LifecycleEngine.assessLegacyIdle(
            LegacyIdleEvidence(legacyStatus: "idle", remainingPercent: 60, today: today)
        )
        #expect(conflictPartial.targetStatus == .unrecorded)
        #expect(conflictPartial.reviewStatus == .pendingIdleReview)
        #expect(conflictPartial.conflicts == ["partial_remaining_without_usage_or_open_evidence"])
    }
}
