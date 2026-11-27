import Foundation

/// 妆匣支持的 16 种 ISO 4217 货币枚举，与 SQLite Schema V1 `CHECK` 约束严格对齐。
public enum CurrencyCode: String, CaseIterable, Codable, Hashable, Sendable {
    case cny = "CNY"
    case hkd = "HKD"
    case usd = "USD"
    case gbp = "GBP"
    case jpy = "JPY"
    case krw = "KRW"
    case eur = "EUR"
    case twd = "TWD"
    case sgd = "SGD"
    case aud = "AUD"
    case cad = "CAD"
    case thb = "THB"
    case chf = "CHF"
    case kwd = "KWD"
    case bhd = "BHD"
    case omr = "OMR"

    /// 严格解析币种代码（仅接受 16 种白名单代码，拒绝空串或未知码）。
    public static func parse(_ rawCode: String) throws -> CurrencyCode {
        let trimmed = rawCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw DomainError.emptyCurrencyCode
        }
        guard let code = CurrencyCode(rawValue: trimmed) else {
            throw DomainError.unsupportedCurrency(trimmed)
        }
        return code
    }

    /// 小数位精度（ISO 4217 exponent），绝不按 2 位硬编码。
    public var minorExponent: Int {
        switch self {
        case .jpy, .krw:
            return 0
        case .kwd, .bhd, .omr:
            return 3
        case .cny, .hkd, .usd, .gbp, .eur, .twd, .sgd, .aud, .cad, .thb, .chf:
            return 2
        }
    }

    /// 常见展示符号。
    public var symbol: String {
        switch self {
        case .cny: return "¥"
        case .hkd: return "HK$"
        case .usd: return "$"
        case .gbp: return "£"
        case .jpy: return "¥"
        case .krw: return "₩"
        case .eur: return "€"
        case .twd: return "NT$"
        case .sgd: return "S$"
        case .aud: return "A$"
        case .cad: return "C$"
        case .thb: return "฿"
        case .chf: return "CHF "
        case .kwd: return "KWD "
        case .bhd: return "BHD "
        case .omr: return "OMR "
        }
    }

    /// 中文展示名称。
    public var displayName: String {
        switch self {
        case .cny: return "人民币"
        case .hkd: return "港币"
        case .usd: return "美元"
        case .gbp: return "英镑"
        case .jpy: return "日元"
        case .krw: return "韩元"
        case .eur: return "欧元"
        case .twd: return "新台币"
        case .sgd: return "新加坡元"
        case .aud: return "澳元"
        case .cad: return "加元"
        case .thb: return "泰铢"
        case .chf: return "瑞士法郎"
        case .kwd: return "科威特第纳尔"
        case .bhd: return "巴林第纳尔"
        case .omr: return "阿曼里亚尔"
        }
    }
}

/// 非负金额值对象，严格以整数最小货币单位 `Int64`（分/日元/费尔斯等）存储，绝不使用 `Float`/`Double`。
public struct MoneyAmount: Hashable, Codable, Sendable {
    /// 与 `0001_schema_v1.sql` / `beautybox_db.py` 对齐的安全上限（15 位十进制最小单位）。
    public static let maxMinorDigits = 15
    public static let maxMinorValue: Int64 = 999_999_999_999_999

    public let minorUnits: Int64
    public let currency: CurrencyCode

    public init(minorUnits: Int64, currency: CurrencyCode) throws {
        guard minorUnits >= 0 else {
            throw DomainError.negativeMinorUnits(minorUnits)
        }
        guard minorUnits <= Self.maxMinorValue else {
            throw DomainError.moneyOverflow(maxMinorDigits: Self.maxMinorDigits)
        }
        self.minorUnits = minorUnits
        self.currency = currency
    }

    private enum CodingKeys: String, CodingKey {
        case minorUnits
        case currency
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let minorUnits = try container.decode(Int64.self, forKey: .minorUnits)
        let currency = try container.decode(CurrencyCode.self, forKey: .currency)
        try self.init(minorUnits: minorUnits, currency: currency)
    }

    /// 精确十进制字符串表达（例如 `CNY 199.90` -> `"199.90"`，`JPY 3200` -> `"3200"`，`KWD 12.345` -> `"12.345"`）。
    public var decimalString: String {
        MoneyCalculator.format(self)
    }

    /// 转为带币种符号的精确展示文本（如 `"¥199.90"`）。
    public var displayString: String {
        "\(currency.symbol)\(decimalString)"
    }

    /// 无浮点误差的 `Decimal` 转换，仅用于接口互操作。
    public var decimalValue: Decimal {
        let significand = Decimal(minorUnits)
        return Decimal(sign: .plus, exponent: -currency.minorExponent, significand: significand)
    }
}

/// 单币种消费统计条目（按 UD-04 与 M8，严格分币种独立合计）。
public struct CurrencyTotal: Equatable, Hashable, Codable, Sendable {
    public let currency: CurrencyCode
    public let totalAmount: MoneyAmount
    public let itemCount: Int

    public init(currency: CurrencyCode, totalAmount: MoneyAmount, itemCount: Int) {
        self.currency = currency
        self.totalAmount = totalAmount
        self.itemCount = itemCount
    }
}

/// 首页与明细页多币种资产汇总结果：自选主币种单列突出，其余实际发生消费的币种独立成行。
public struct MoneySummary: Equatable, Hashable, Codable, Sendable {
    public let primaryCurrency: CurrencyCode
    public let primaryTotal: MoneyAmount
    public let primaryItemCount: Int
    public let otherCurrencyTotals: [CurrencyTotal]

    public var hasForeignCurrencies: Bool {
        !otherCurrencyTotals.isEmpty
    }
}
