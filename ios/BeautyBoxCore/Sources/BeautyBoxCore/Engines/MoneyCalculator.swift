import Foundation

/// 金额精确解析、格式化与多币种独立统计引擎（M8 / UD-04）。
///
/// 全程使用整数最小货币单位（`Int64`）与字符串/十进制验证，绝不使用 `Float` 或 `Double`。
public enum MoneyCalculator {
    /// 将十进制字符串严格解析为 `MoneyAmount`，拒绝负值、超精度小数、未知/空币种、格式错误与整数溢出。
    public static func parse(decimalString rawInput: String, currencyCode: String) throws -> MoneyAmount {
        let currency = try CurrencyCode.parse(currencyCode)
        return try parse(decimalString: rawInput, currency: currency)
    }

    /// 将十进制字符串严格解析为指定 `CurrencyCode` 的 `MoneyAmount`。
    public static func parse(decimalString rawInput: String, currency: CurrencyCode) throws -> MoneyAmount {
        let cleaned = rawInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else {
            throw DomainError.invalidMoneyFormat(rawInput)
        }
        if cleaned.hasPrefix("-") {
            throw DomainError.negativeMoneyNotAllowed(rawInput)
        }

        let parts = cleaned.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count <= 2 else {
            throw DomainError.invalidMoneyFormat(rawInput)
        }

        let wholePart = String(parts[0])
        guard !wholePart.isEmpty, wholePart.allSatisfy({ $0.isASCII && $0.isNumber }) else {
            throw DomainError.invalidMoneyFormat(rawInput)
        }

        let fracPart: String
        if parts.count == 2 {
            let subFrac = String(parts[1])
            guard !subFrac.isEmpty, subFrac.allSatisfy({ $0.isASCII && $0.isNumber }) else {
                throw DomainError.invalidMoneyFormat(rawInput)
            }
            fracPart = subFrac
        } else {
            fracPart = ""
        }

        let exponent = currency.minorExponent
        guard fracPart.count <= exponent else {
            throw DomainError.excessiveDecimalPrecision(
                currency: currency.rawValue,
                maxFractionDigits: exponent,
                rawInput: rawInput
            )
        }

        let paddedFrac = fracPart + String(repeating: "0", count: exponent - fracPart.count)

        let wholeInt: Int64 = try parseNonNegativeInt64(wholePart)
        let fracInt: Int64 = paddedFrac.isEmpty ? 0 : try parseNonNegativeInt64(paddedFrac)
        let scale = pow10Int64(exponent)

        let scaled = wholeInt.multipliedReportingOverflow(by: scale)
        guard !scaled.overflow else {
            throw DomainError.moneyOverflow(maxMinorDigits: MoneyAmount.maxMinorDigits)
        }
        let summed = scaled.partialValue.addingReportingOverflow(fracInt)
        guard !summed.overflow else {
            throw DomainError.moneyOverflow(maxMinorDigits: MoneyAmount.maxMinorDigits)
        }

        return try MoneyAmount(minorUnits: summed.partialValue, currency: currency)
    }

    /// 从精确 `Decimal` 转换为 `MoneyAmount`（禁止从 `Double` 构造）。
    public static func parse(decimal: Decimal, currency: CurrencyCode) throws -> MoneyAmount {
        guard !decimal.isNaN else {
            throw DomainError.invalidMoneyFormat("NaN")
        }
        if decimal < 0 {
            throw DomainError.negativeMoneyNotAllowed(decimal.description)
        }
        return try parse(decimalString: decimal.description, currency: currency)
    }

    /// 将最小货币单位精确格式化为十进制字符串。
    public static func format(_ amount: MoneyAmount) -> String {
        let exponent = amount.currency.minorExponent
        if exponent == 0 {
            return String(amount.minorUnits)
        }
        let scale = pow10Int64(exponent)
        let whole = amount.minorUnits / scale
        let rem = amount.minorUnits % scale
        let remStr = String(rem)
        let paddedRem = String(repeating: "0", count: exponent - remStr.count) + remStr
        return "\(whole).\(paddedRem)"
    }

    /// 同币种相加，跨币种或溢出时立即报错拒绝。
    public static func addSameCurrency(_ lhs: MoneyAmount, _ rhs: MoneyAmount) throws -> MoneyAmount {
        guard lhs.currency == rhs.currency else {
            throw DomainError.currencyMismatch(expected: lhs.currency.rawValue, actual: rhs.currency.rawValue)
        }
        let summed = lhs.minorUnits.addingReportingOverflow(rhs.minorUnits)
        guard !summed.overflow else {
            throw DomainError.moneyOverflow(maxMinorDigits: MoneyAmount.maxMinorDigits)
        }
        return try MoneyAmount(minorUnits: summed.partialValue, currency: lhs.currency)
    }

    /// 按币种独立分组聚合（M8 / UD-04）：严禁跨币种直接相加或隐式汇率换算。
    public static func aggregateByCurrency(
        _ amounts: [MoneyAmount],
        primaryCurrency: CurrencyCode = .cny
    ) throws -> MoneySummary {
        var totalsByCurrency: [CurrencyCode: (minor: Int64, count: Int)] = [:]

        for amount in amounts {
            if let existing = totalsByCurrency[amount.currency] {
                let summed = existing.minor.addingReportingOverflow(amount.minorUnits)
                guard !summed.overflow, summed.partialValue <= MoneyAmount.maxMinorValue else {
                    throw DomainError.moneyOverflow(maxMinorDigits: MoneyAmount.maxMinorDigits)
                }
                totalsByCurrency[amount.currency] = (summed.partialValue, existing.count + 1)
            } else {
                totalsByCurrency[amount.currency] = (amount.minorUnits, 1)
            }
        }

        let primaryEntry = totalsByCurrency[primaryCurrency] ?? (0, 0)
        let primaryTotal = try MoneyAmount(minorUnits: primaryEntry.minor, currency: primaryCurrency)

        let secondaryTotals: [CurrencyTotal] = try totalsByCurrency
            .keys
            .filter { $0 != primaryCurrency }
            .sorted { $0.rawValue < $1.rawValue }
            .map { code in
                let entry = totalsByCurrency[code]!
                let total = try MoneyAmount(minorUnits: entry.minor, currency: code)
                return CurrencyTotal(currency: code, totalAmount: total, itemCount: entry.count)
            }

        return MoneySummary(
            primaryCurrency: primaryCurrency,
            primaryTotal: primaryTotal,
            primaryItemCount: primaryEntry.count,
            otherCurrencyTotals: secondaryTotals
        )
    }

    private static func parseNonNegativeInt64(_ digits: String) throws -> Int64 {
        guard let value = Int64(digits) else {
            throw DomainError.moneyOverflow(maxMinorDigits: MoneyAmount.maxMinorDigits)
        }
        return value
    }

    private static func pow10Int64(_ exponent: Int) -> Int64 {
        var result: Int64 = 1
        for _ in 0..<exponent {
            result *= 10
        }
        return result
    }
}
