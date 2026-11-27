import Foundation

/// 4 层日期与有效期推算引擎（M6），支持通用产品 `min()` 双约束、美瞳周期规则、工具豁免及用户确认保护。
public enum ExpiryEngine {
    /// 计算第 1 层原始输入的规范指纹，用于检测用户确认到期日之后源输入是否被修改。
    public static func inputFingerprint(for inputs: ExpiryRawInputs) -> String {
        [
            "mfg:\(inputs.manufactureDate?.isoString ?? "")",
            "shelf:\(inputs.unopenedShelfMonths.map(String.init) ?? "")",
            "exp:\(inputs.packagingExpDate?.isoString ?? "")",
            "open:\(inputs.openedDate?.isoString ?? "")",
            "pao:\(inputs.paoMonths.map(String.init) ?? "")",
            "lens:\(inputs.isLens ? "1" : "0")",
            "cycle:\(inputs.replacementCycle?.rawValue ?? "")",
        ].joined(separator: "|")
    }

    /// 执行完整 4 层效期推算、来源仲裁与状态评估。
    public static func evaluate(
        inputs: ExpiryRawInputs,
        confirmation: ExpiryConfirmationState = ExpiryConfirmationState(),
        today: PureDate,
        expiringThresholdDays: Int = 30
    ) throws -> ExpiryEvaluationResult {
        if let shelf = inputs.unopenedShelfMonths, shelf <= 0 {
            throw DomainError.nonPositiveMonths(field: "unopenedShelfMonths", value: shelf)
        }
        if let pao = inputs.paoMonths, pao <= 0 {
            throw DomainError.nonPositiveMonths(field: "paoMonths", value: pao)
        }
        if let opened = inputs.openedDate, let mfg = inputs.manufactureDate, opened < mfg {
            throw DomainError.openedDateBeforeManufactureDate(opened: opened, manufacture: mfg)
        }

        // 未开封上限来源识别（packaging_exp_date 优先于 mfg + shelf_months）
        let mfgPlusShelfDate: PureDate? = {
            guard let mfg = inputs.manufactureDate, let shelf = inputs.unopenedShelfMonths else {
                return nil
            }
            return mfg.addingMonths(shelf)
        }()

        let unopenedLimit: PureDate?
        let unopenedBasis: ComputedExpiryBasis?
        if let exp = inputs.packagingExpDate {
            unopenedLimit = exp
            unopenedBasis = .packagingExp
        } else if let mfgShelf = mfgPlusShelfDate {
            unopenedLimit = mfgShelf
            unopenedBasis = .mfgPlusShelf
        } else {
            unopenedLimit = nil
            unopenedBasis = nil
        }

        // 开封后上限推算（按通用 PAO 与美瞳更换周期区分）
        let openedLimit: PureDate? = {
            guard let opened = inputs.openedDate else { return nil }
            if inputs.isLens {
                if let cycleDays = inputs.replacementCycle?.cycleDays {
                    return opened.addingDays(cycleDays)
                }
                if let pao = inputs.paoMonths {
                    return opened.addingMonths(pao)
                }
                return nil
            } else {
                guard let pao = inputs.paoMonths else { return nil }
                return opened.addingMonths(pao)
            }
        }()

        // 第 2 层：系统推算值与推算依据
        var computedDate: PureDate?
        var computedBasis: ComputedExpiryBasis
        var fallbackNotice: String?

        switch inputs.lifecycleStatus {
        case .unrecorded:
            computedDate = nil
            computedBasis = .unrecorded

        case .unopened:
            if let limit = unopenedLimit, let basis = unopenedBasis {
                computedDate = limit
                computedBasis = basis
            } else {
                computedDate = nil
                computedBasis = .insufficient
            }

        case .inUse, .finished:
            if inputs.isLens {
                if let u = unopenedLimit, let o = openedLimit {
                    computedDate = min(u, o)
                    computedBasis = .minLensExpAndCycle
                } else if let o = openedLimit {
                    computedDate = o
                    computedBasis = .lensOpenCycle
                } else if let u = unopenedLimit, let uBasis = unopenedBasis {
                    computedDate = u
                    computedBasis = uBasis
                    fallbackNotice = "缺开封或更换周期信息，当前按未开封到期日兜底提醒"
                } else {
                    computedDate = nil
                    computedBasis = .insufficient
                }
            } else {
                if let u = unopenedLimit, let o = openedLimit {
                    computedDate = min(u, o)
                    computedBasis = .minUnopenedAndPao
                } else if let o = openedLimit {
                    computedDate = o
                    computedBasis = .openedPaoOnly
                } else if let u = unopenedLimit, let uBasis = unopenedBasis {
                    computedDate = u
                    computedBasis = uBasis
                    fallbackNotice = "缺开封/PAO，当前按未开封到期日兜底提醒"
                } else {
                    computedDate = nil
                    computedBasis = .insufficient
                }
            }
        }

        // 第 3 层：用户手动确认保护与输入变更检测（绝不静默覆盖 confirmedExpiryDate）
        let currentFingerprint = inputFingerprint(for: inputs)
        let inputsChanged: Bool
        if confirmation.confirmedExpiryDate != nil,
           let savedFingerprint = confirmation.confirmedInputFingerprint {
            inputsChanged = savedFingerprint != currentFingerprint
        } else {
            inputsChanged = false
        }
        let needsReconfirm = inputsChanged && computedDate != nil && computedDate != confirmation.confirmedExpiryDate

        // 第 4 层：最终展示到期日与正交状态
        let effectiveDate: PureDate?
        let effectiveSource: EffectiveExpirySource
        if let confirmed = confirmation.confirmedExpiryDate {
            effectiveDate = confirmed
            effectiveSource = .userConfirmed
        } else if let computed = computedDate {
            effectiveDate = computed
            effectiveSource = .systemComputed
        } else if inputs.expiryManagementMode == .optional {
            effectiveDate = nil
            effectiveSource = .optionalNotTracked
        } else {
            effectiveDate = nil
            effectiveSource = .unknown
        }

        let daysLeft: Int?
        let status: ExpiryStatus
        if let eff = effectiveDate {
            let delta = today.days(until: eff)
            daysLeft = delta
            let threshold = max(0, expiringThresholdDays)
            if delta < 0 {
                status = .expired
            } else if delta <= threshold {
                status = .expiringSoon
            } else {
                status = .normal
            }
        } else {
            daysLeft = nil
            status = effectiveSource == .optionalNotTracked ? .optionalNotTracked : .unknown
        }

        let multiPieceDailyNotice: String?
        if inputs.isLens,
           inputs.replacementCycle == .daily,
           (inputs.lensPackPieceCount ?? 0) > 1,
           inputs.lifecycleStatus == .inUse {
            multiPieceDailyNotice = "盒内未拆封的其余独立日抛镜片仍按外包装到期日有效，仅已拆封佩戴的单副/当日片当日弃用"
        } else {
            multiPieceDailyNotice = nil
        }

        return ExpiryEvaluationResult(
            unopenedLimitDate: unopenedLimit,
            openedLimitDate: openedLimit,
            computedExpiryDate: computedDate,
            computedBasis: computedBasis,
            confirmedExpiryDate: confirmation.confirmedExpiryDate,
            currentInputFingerprint: currentFingerprint,
            inputsChangedSinceConfirmation: inputsChanged,
            needsReconfirmationPrompt: needsReconfirm,
            effectiveExpiryDate: effectiveDate,
            effectiveSource: effectiveSource,
            status: status,
            daysUntilExpiry: daysLeft,
            fallbackNotice: fallbackNotice,
            lensMultiPieceDailyNotice: multiPieceDailyNotice
        )
    }

    /// 构造用户确认到期日时需持久化的第 3 层状态。
    public static func makeConfirmationState(
        confirmedExpiryDate: PureDate,
        confirmedAtISO8601: String,
        inputs: ExpiryRawInputs
    ) -> ExpiryConfirmationState {
        ExpiryConfirmationState(
            confirmedExpiryDate: confirmedExpiryDate,
            expiryConfirmedAt: confirmedAtISO8601,
            confirmedInputFingerprint: inputFingerprint(for: inputs)
        )
    }
}
