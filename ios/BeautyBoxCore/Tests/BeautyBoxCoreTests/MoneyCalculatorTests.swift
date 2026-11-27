import Foundation
import Testing
@testable import BeautyBoxCore

@Suite("MoneyCalculator 多币种与零浮点精度测试")
struct MoneyCalculatorTests {
    @Test("支持全量 16 种 ISO 4217 币种精确小数位解析与格式化")
    func parseAndFormatAllCurrencies() throws {
        let cny = try MoneyCalculator.parse(decimalString: "199.90", currencyCode: "CNY")
        #expect(cny.minorUnits == 19_990)
        #expect(cny.decimalString == "199.90")
        #expect(cny.displayString == "¥199.90")

        let jpy = try MoneyCalculator.parse(decimalString: "3200", currencyCode: "JPY")
        #expect(jpy.minorUnits == 3200)
        #expect(jpy.decimalString == "3200")

        let krw = try MoneyCalculator.parse(decimalString: "45000", currencyCode: "KRW")
        #expect(krw.minorUnits == 45000)
        #expect(krw.decimalString == "45000")

        let kwd = try MoneyCalculator.parse(decimalString: "12.05", currencyCode: "KWD")
        #expect(kwd.minorUnits == 12_050)
        #expect(kwd.decimalString == "12.050")

        let bhd = try MoneyCalculator.parse(decimalString: "0.005", currencyCode: "BHD")
        #expect(bhd.minorUnits == 5)
        #expect(bhd.decimalString == "0.005")

        let decCny = try MoneyCalculator.parse(decimal: Decimal(string: "88.5")!, currency: .cny)
        #expect(decCny.minorUnits == 8850)
        #expect(decCny.decimalValue == Decimal(string: "88.50")!)

        // 全量 16 币种精度表完整覆盖
        #expect(CurrencyCode.allCases.count == 16)
        for currency in CurrencyCode.allCases {
            let parsed = try MoneyCalculator.parse(decimalString: "1", currency: currency)
            let expectedMinor: Int64 = switch currency.minorExponent {
            case 0: 1
            case 2: 100
            case 3: 1000
            default: -1
            }
            #expect(parsed.minorUnits == expectedMinor)
        }
    }

    @Test("拒绝未知币种、空币种、负金额、非法格式、超精度小数与整数溢出")
    func rejectInvalidMoneyInputs() throws {
        #expect(throws: DomainError.emptyCurrencyCode) {
            _ = try MoneyCalculator.parse(decimalString: "10", currencyCode: "   ")
        }
        #expect(throws: DomainError.unsupportedCurrency("XYZ")) {
            _ = try MoneyCalculator.parse(decimalString: "10", currencyCode: "XYZ")
        }
        #expect(throws: DomainError.negativeMoneyNotAllowed("-1.00")) {
            _ = try MoneyCalculator.parse(decimalString: "-1.00", currencyCode: "CNY")
        }
        #expect(throws: DomainError.invalidMoneyFormat("10.")) {
            _ = try MoneyCalculator.parse(decimalString: "10.", currencyCode: "CNY")
        }
        #expect(throws: DomainError.invalidMoneyFormat("1e5")) {
            _ = try MoneyCalculator.parse(decimalString: "1e5", currencyCode: "CNY")
        }
        #expect(throws: DomainError.excessiveDecimalPrecision(currency: "JPY", maxFractionDigits: 0, rawInput: "10.5")) {
            _ = try MoneyCalculator.parse(decimalString: "10.5", currencyCode: "JPY")
        }
        #expect(throws: DomainError.excessiveDecimalPrecision(currency: "CNY", maxFractionDigits: 2, rawInput: "10.123")) {
            _ = try MoneyCalculator.parse(decimalString: "10.123", currencyCode: "CNY")
        }
        #expect(throws: DomainError.excessiveDecimalPrecision(currency: "KWD", maxFractionDigits: 3, rawInput: "1.2345")) {
            _ = try MoneyCalculator.parse(decimalString: "1.2345", currencyCode: "KWD")
        }
        #expect(throws: DomainError.moneyOverflow(maxMinorDigits: 15)) {
            _ = try MoneyCalculator.parse(decimalString: "10000000000000.00", currencyCode: "CNY")
        }
        #expect(throws: DomainError.negativeMinorUnits(-1)) {
            _ = try MoneyAmount(minorUnits: -1, currency: .cny)
        }
    }

    @Test("同币种可精确累加，跨币种直接相加被严格阻止，按币种分组统计不互混")
    func aggregationAndCrossCurrencyProtection() throws {
        let a = try MoneyCalculator.parse(decimalString: "199.90", currencyCode: "CNY")
        let b = try MoneyCalculator.parse(decimalString: "0.10", currencyCode: "CNY")
        let usd = try MoneyCalculator.parse(decimalString: "45.00", currencyCode: "USD")
        let jpy = try MoneyCalculator.parse(decimalString: "3200", currencyCode: "JPY")
        let kwd = try MoneyCalculator.parse(decimalString: "3.250", currencyCode: "KWD")

        let sumCny = try MoneyCalculator.addSameCurrency(a, b)
        #expect(sumCny.minorUnits == 20_000)
        #expect(sumCny.decimalString == "200.00")

        #expect(throws: DomainError.currencyMismatch(expected: "CNY", actual: "USD")) {
            _ = try MoneyCalculator.addSameCurrency(a, usd)
        }

        let summary = try MoneyCalculator.aggregateByCurrency([a, b, usd, jpy, kwd], primaryCurrency: .cny)
        #expect(summary.primaryCurrency == .cny)
        #expect(summary.primaryTotal.minorUnits == 20_000)
        #expect(summary.primaryItemCount == 2)
        #expect(summary.hasForeignCurrencies == true)
        #expect(summary.otherCurrencyTotals.map(\.currency) == [.jpy, .kwd, .usd])
        #expect(summary.otherCurrencyTotals[0].totalAmount.minorUnits == 3200)
        #expect(summary.otherCurrencyTotals[1].totalAmount.minorUnits == 3250)
        #expect(summary.otherCurrencyTotals[2].totalAmount.minorUnits == 4500)
    }

    @Test("边界防护：加法/聚合安全上限溢出与 Codable 反序列化不变式拦截")
    func moneyOverflowAndDecodableInvariants() throws {
        let maxCny = try MoneyAmount(minorUnits: MoneyAmount.maxMinorValue, currency: .cny)
        let oneCent = try MoneyAmount(minorUnits: 1, currency: .cny)

        #expect(throws: DomainError.moneyOverflow(maxMinorDigits: 15)) {
            _ = try MoneyCalculator.addSameCurrency(maxCny, oneCent)
        }
        #expect(throws: DomainError.moneyOverflow(maxMinorDigits: 15)) {
            _ = try MoneyCalculator.aggregateByCurrency([maxCny, oneCent], primaryCurrency: .cny)
        }

        // 无外币且主币种为空时归零但不报外币
        let emptySummary = try MoneyCalculator.aggregateByCurrency([], primaryCurrency: .cny)
        #expect(emptySummary.primaryTotal.minorUnits == 0)
        #expect(emptySummary.primaryItemCount == 0)
        #expect(emptySummary.hasForeignCurrencies == false)

        // JSON 解码负最小单位或超限金额必须受 Codable 校验拦截
        let negativeJSON = #"{"minorUnits": -50, "currency": "CNY"}"#.data(using: .utf8)!
        #expect(throws: DomainError.negativeMinorUnits(-50)) {
            _ = try JSONDecoder().decode(MoneyAmount.self, from: negativeJSON)
        }
        let overflowJSON = #"{"minorUnits": 1000000000000000, "currency": "CNY"}"#.data(using: .utf8)!
        #expect(throws: DomainError.moneyOverflow(maxMinorDigits: 15)) {
            _ = try JSONDecoder().decode(MoneyAmount.self, from: overflowJSON)
        }
    }
}
