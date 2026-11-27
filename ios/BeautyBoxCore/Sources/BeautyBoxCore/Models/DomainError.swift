import Foundation

/// 妆匣核心领域校验与规则执行错误。
public enum DomainError: Error, Equatable, Hashable, Sendable, LocalizedError {
    // 金额与币种错误
    case emptyCurrencyCode
    case unsupportedCurrency(String)
    case invalidMoneyFormat(String)
    case negativeMoneyNotAllowed(String)
    case excessiveDecimalPrecision(currency: String, maxFractionDigits: Int, rawInput: String)
    case moneyOverflow(maxMinorDigits: Int)
    case currencyMismatch(expected: String, actual: String)
    case negativeMinorUnits(Int64)

    // 日期与期限错误
    case invalidDateFormat(String)
    case invalidCalendarDate(year: Int, month: Int, day: Int)
    case nonPositiveMonths(field: String, value: Int)
    case openedDateBeforeManufactureDate(opened: PureDate, manufacture: PureDate)
    case finishedDateBeforeOpenedDate(finished: PureDate, opened: PureDate)

    // 生命周期状态机错误
    case invalidRemainingPercent(Int)
    case finishedRequiresZeroRemaining(actual: Int?)
    case unrecordedCannotHoldUsageFields
    case shortcutTransitionDisallowed(from: LifecycleStatus, to: LifecycleStatus, reason: String)
    case confirmationRequired(from: LifecycleStatus, to: LifecycleStatus)

    // 美瞳单盒与主档约束错误
    case lensProfileRequiresLensCategory(categoryId: String, specialtyGroup: String?)
    case invalidLensPowerFormat(String)

    public var errorDescription: String? {
        switch self {
        case .emptyCurrencyCode:
            return "币种代码不能为空"
        case .unsupportedCurrency(let code):
            return "该币种暂不支持：\(code)"
        case .invalidMoneyFormat(let raw):
            return "非法金额格式：\(raw)"
        case .negativeMoneyNotAllowed(let raw):
            return "金额不能为负数：\(raw)"
        case .excessiveDecimalPrecision(let currency, let maxDigits, let raw):
            return "\(currency) 最多允许 \(maxDigits) 位小数，拒绝静默截断：\(raw)"
        case .moneyOverflow(let maxDigits):
            return "金额超出安全整数上限（最多 \(maxDigits) 位最小单位）"
        case .currencyMismatch(let expected, let actual):
            return "禁止跨币种直接相加：\(expected) 与 \(actual)"
        case .negativeMinorUnits(let minor):
            return "最小货币单位不能为负数：\(minor)"
        case .invalidDateFormat(let raw):
            return "日期格式无效（需 YYYY-MM-DD）：\(raw)"
        case .invalidCalendarDate(let year, let month, let day):
            return "无效日历日期：\(year)-\(month)-\(day)"
        case .nonPositiveMonths(let field, let value):
            return "\(field) 必须为正整数月数，实际为：\(value)"
        case .openedDateBeforeManufactureDate(let opened, let manufacture):
            return "开封日期（\(opened.isoString)）不能早于生产日期（\(manufacture.isoString)）"
        case .finishedDateBeforeOpenedDate(let finished, let opened):
            return "用完日期（\(finished.isoString)）不能早于开封日期（\(opened.isoString)）"
        case .invalidRemainingPercent(let value):
            return "剩余比例必须在 0...100 之间，实际为：\(value)"
        case .finishedRequiresZeroRemaining(let actual):
            return "已用完状态要求剩余比例为 0，实际为：\(String(describing: actual))"
        case .unrecordedCannotHoldUsageFields:
            return "未记录状态不得保留开封日期、用完日期或剩余比例"
        case .shortcutTransitionDisallowed(let from, let to, let reason):
            return "不允许的快捷状态转换（\(from.rawValue) -> \(to.rawValue)）：\(reason)"
        case .confirmationRequired(let from, let to):
            return "状态转换 \(from.rawValue) -> \(to.rawValue) 需要用户明确二次确认"
        case .lensProfileRequiresLensCategory(let categoryId, let specialty):
            return "只有美瞳专项分类才允许配置美瞳周期与光学档案（categoryId=\(categoryId), specialty=\(specialty ?? "nil")）"
        case .invalidLensPowerFormat(let raw):
            return "美瞳单盒度数必须为单一有效数值字符串，不可包含多度数分隔符或空格：\(raw)"
        }
    }
}
