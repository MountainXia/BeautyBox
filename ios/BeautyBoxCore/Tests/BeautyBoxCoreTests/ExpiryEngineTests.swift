import Testing
@testable import BeautyBoxCore

@Suite("ExpiryEngine 4层效期推算、min()双约束、美瞳周期与确认保护测试")
struct ExpiryEngineTests {
    private let d = { (iso: String) -> PureDate in try! PureDate(isoString: iso) }

    @Test("PureDate 闰年与月末收口运算完全准确且不依赖时区")
    func pureDateCalendarMath() throws {
        // 2024 闰年
        #expect(d("2024-01-31").addingMonths(1) == d("2024-02-29"))
        // 2025 平年
        #expect(d("2025-01-31").addingMonths(1) == d("2025-02-28"))
        // 跨年加月与减月
        #expect(d("2025-11-30").addingMonths(3) == d("2026-02-28"))
        #expect(d("2026-03-31").addingMonths(-1) == d("2026-02-28"))
        // 非法闰日应拦截
        #expect(throws: DomainError.invalidCalendarDate(year: 2025, month: 2, day: 29)) {
            _ = try PureDate(year: 2025, month: 2, day: 29)
        }
        // 自然日加减与间隔
        #expect(d("2026-02-27").addingDays(3) == d("2026-03-02"))
        #expect(d("2026-11-01").days(until: d("2026-12-01")) == 30)
    }

    @Test("通用产品开封后严格取 min(未开封上限, 开封+PAO)")
    func generalProductMinConstraint() throws {
        let today = d("2026-11-27")

        // 场景 A：PAO 早于未开封期限 -> 取 PAO
        let paoEarlier = ExpiryRawInputs(
            lifecycleStatus: .inUse,
            manufactureDate: d("2024-06-01"),
            unopenedShelfMonths: 36, // 2027-06-01
            openedDate: d("2026-05-01"),
            paoMonths: 6 // 2026-11-01
        )
        let resA = try ExpiryEngine.evaluate(inputs: paoEarlier, today: today)
        #expect(resA.computedExpiryDate == d("2026-11-01"))
        #expect(resA.computedBasis == .minUnopenedAndPao)
        #expect(resA.effectiveSource == .systemComputed)
        #expect(resA.status == .expired)
        #expect(resA.daysUntilExpiry == -26)

        // 场景 B：外包装 EXP 早于开封 + PAO -> 不允许因新开封延长包装寿命，仍取外包装 EXP
        let expEarlier = ExpiryRawInputs(
            lifecycleStatus: .inUse,
            packagingExpDate: d("2026-12-10"),
            openedDate: d("2026-11-01"),
            paoMonths: 12 // 2027-11-01
        )
        let resB = try ExpiryEngine.evaluate(inputs: expEarlier, today: today, expiringThresholdDays: 30)
        #expect(resB.computedExpiryDate == d("2026-12-10"))
        #expect(resB.computedBasis == .minUnopenedAndPao)
        #expect(resB.status == .expiringSoon)
        #expect(resB.daysUntilExpiry == 13)
    }

    @Test("用户确认日期具有最高展示优先级，原始输入改动时仅提示不静默覆盖")
    func userConfirmationIsolationAndFingerprintDetection() throws {
        let today = d("2026-11-27")
        let initialInputs = ExpiryRawInputs(
            lifecycleStatus: .inUse,
            manufactureDate: d("2024-06-01"),
            unopenedShelfMonths: 36,
            openedDate: d("2026-06-01"),
            paoMonths: 12
        )
        let confirmed = ExpiryEngine.makeConfirmationState(
            confirmedExpiryDate: d("2027-06-01"),
            confirmedAtISO8601: "2026-06-01T09:00:00Z",
            inputs: initialInputs
        )

        // 用户后补 PAO 为 6M（推算变成 2026-12-01）
        let modifiedInputs = ExpiryRawInputs(
            lifecycleStatus: .inUse,
            manufactureDate: d("2024-06-01"),
            unopenedShelfMonths: 36,
            openedDate: d("2026-06-01"),
            paoMonths: 6
        )
        let evaluated = try ExpiryEngine.evaluate(
            inputs: modifiedInputs,
            confirmation: confirmed,
            today: today
        )
        #expect(evaluated.computedExpiryDate == d("2026-12-01"))
        #expect(evaluated.confirmedExpiryDate == d("2027-06-01"))
        #expect(evaluated.effectiveExpiryDate == d("2027-06-01"))
        #expect(evaluated.effectiveSource == .userConfirmed)
        #expect(evaluated.inputsChangedSinceConfirmation == true)
        #expect(evaluated.needsReconfirmationPrompt == true)
    }

    @Test("美瞳未开封严禁凭周期推测，开封后取 min(包装EXP, 开封日+周期天数)，10片日抛提示不误伤整盒")
    func lensExpiryIsolationAndCycleRules() throws {
        let today = d("2026-11-27")

        // 未开封日抛：只用包装 EXP（哪怕有周期也不得推算开封到期）
        let unopenedLens = ExpiryRawInputs(
            lifecycleStatus: .unopened,
            isLens: true,
            replacementCycle: .daily,
            lensPackPieceCount: 10,
            packagingExpDate: d("2028-05-01")
        )
        let uRes = try ExpiryEngine.evaluate(inputs: unopenedLens, today: today)
        #expect(uRes.openedLimitDate == nil)
        #expect(uRes.computedExpiryDate == d("2028-05-01"))
        #expect(uRes.computedBasis == .packagingExp)
        #expect(uRes.lensMultiPieceDailyNotice == nil)

        // 拆封多片日抛盒：周期当日弃用，但附带整盒剩余片独立灭菌期安全提示
        let openedDailyLens = ExpiryRawInputs(
            lifecycleStatus: .inUse,
            isLens: true,
            replacementCycle: .daily,
            lensPackPieceCount: 10,
            packagingExpDate: d("2028-05-01"),
            openedDate: today
        )
        let dRes = try ExpiryEngine.evaluate(inputs: openedDailyLens, today: today)
        #expect(dRes.computedExpiryDate == today)
        #expect(dRes.computedBasis == .minLensExpAndCycle)
        #expect(dRes.status == .expiringSoon) // 0 days left
        #expect(dRes.lensMultiPieceDailyNotice != nil)

        // 拆封月抛（+30 天）若包装 EXP 更早，同样受包装 EXP 封顶
        let openedMonthlyCapped = ExpiryRawInputs(
            lifecycleStatus: .inUse,
            isLens: true,
            replacementCycle: .monthly,
            packagingExpDate: d("2026-12-05"),
            openedDate: d("2026-11-20") // +30d -> 2026-12-20
        )
        let mRes = try ExpiryEngine.evaluate(inputs: openedMonthlyCapped, today: today)
        #expect(mRes.computedExpiryDate == d("2026-12-05"))
        #expect(mRes.computedBasis == .minLensExpAndCycle)
    }

    @Test("未开封仍可并存已过期告警，美妆工具豁免空白日期提示")
    func unopenedExpiredAndOptionalTools() throws {
        let today = d("2026-11-27")

        let expiredUnopened = ExpiryRawInputs(
            lifecycleStatus: .unopened,
            packagingExpDate: d("2026-11-20")
        )
        let expRes = try ExpiryEngine.evaluate(inputs: expiredUnopened, today: today)
        #expect(expRes.status == .expired)
        #expect(expRes.daysUntilExpiry == -7)

        let toolBlank = ExpiryRawInputs(
            lifecycleStatus: .inUse,
            expiryManagementMode: .optional
        )
        let toolRes = try ExpiryEngine.evaluate(inputs: toolBlank, today: today)
        #expect(toolRes.computedBasis == .insufficient)
        #expect(toolRes.effectiveSource == .optionalNotTracked)
        #expect(toolRes.status == .optionalNotTracked)

        // 使用中但缺少开封日/PAO：兜底采用未开封上限并给出提示，不盲目报“无法判断”
        let inUseFallback = ExpiryRawInputs(
            lifecycleStatus: .inUse,
            manufactureDate: d("2025-01-01"),
            unopenedShelfMonths: 24, // 2027-01-01
            openedDate: d("2026-10-01")
        )
        let fallbackRes = try ExpiryEngine.evaluate(inputs: inUseFallback, today: today)
        #expect(fallbackRes.computedExpiryDate == d("2027-01-01"))
        #expect(fallbackRes.computedBasis == .mfgPlusShelf)
        #expect(fallbackRes.fallbackNotice != nil)
        #expect(fallbackRes.status == .normal)
    }
}
