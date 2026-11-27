import Foundation

/// 与时区无关的纯日期值对象（`YYYY-MM-DD`），用于生产日期、包装到期日、开封日期等。
///
/// 使用公历（Gregorian）与 UTC 零偏移进行日历运算，杜绝跨时区/夏令时引发的日期偏移问题。
public struct PureDate: Comparable, Hashable, Codable, Sendable, CustomStringConvertible {
    public let year: Int
    public let month: Int
    public let day: Int

    private static let utcGregorian: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }()

    /// 以显式年月日构造，严格校验日历合法性（含闰年 2 月 29 日）。
    public init(year: Int, month: Int, day: Int) throws {
        guard (1...9999).contains(year), (1...12).contains(month) else {
            throw DomainError.invalidCalendarDate(year: year, month: month, day: day)
        }
        let maxDay = Self.daysInMonth(year: year, month: month)
        guard (1...maxDay).contains(day) else {
            throw DomainError.invalidCalendarDate(year: year, month: month, day: day)
        }
        self.year = year
        self.month = month
        self.day = day
    }

    /// 严格解析 `YYYY-MM-DD` 格式纯日期字符串。
    public init(isoString: String) throws {
        let bytes = Array(isoString.utf8)
        guard bytes.count == 10, bytes[4] == 45, bytes[7] == 45 else {
            throw DomainError.invalidDateFormat(isoString)
        }
        let yearStr = String(isoString.prefix(4))
        let monthStr = String(isoString.dropFirst(5).prefix(2))
        let dayStr = String(isoString.suffix(2))
        guard
            yearStr.allSatisfy(\.isASCII) && yearStr.allSatisfy(\.isNumber),
            monthStr.allSatisfy(\.isASCII) && monthStr.allSatisfy(\.isNumber),
            dayStr.allSatisfy(\.isASCII) && dayStr.allSatisfy(\.isNumber),
            let year = Int(yearStr),
            let month = Int(monthStr),
            let day = Int(dayStr)
        else {
            throw DomainError.invalidDateFormat(isoString)
        }
        try self.init(year: year, month: month, day: day)
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        try self.init(isoString: raw)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(isoString)
    }

    /// 标准 `YYYY-MM-DD` 字符串，与 SQLite `TEXT` 日期列完全一致。
    public var isoString: String {
        "\(Self.zeroPad(year, width: 4))-\(Self.zeroPad(month, width: 2))-\(Self.zeroPad(day, width: 2))"
    }

    private static func zeroPad(_ value: Int, width: Int) -> String {
        let raw = String(value)
        if raw.count >= width { return raw }
        return String(repeating: "0", count: width - raw.count) + raw
    }

    public var description: String {
        isoString
    }

    public static func < (lhs: PureDate, rhs: PureDate) -> Bool {
        if lhs.year != rhs.year { return lhs.year < rhs.year }
        if lhs.month != rhs.month { return lhs.month < rhs.month }
        return lhs.day < rhs.day
    }

    /// 是否闰年。
    public static func isLeapYear(_ year: Int) -> Bool {
        (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
    }

    /// 指定年月的总天数。
    public static func daysInMonth(year: Int, month: Int) -> Int {
        switch month {
        case 1, 3, 5, 7, 8, 10, 12:
            return 31
        case 4, 6, 9, 11:
            return 30
        case 2:
            return isLeapYear(year) ? 29 : 28
        default:
            return 0
        }
    }

    /// 按自然月递增/递减；当目标月份天数少于原日期（如 `01-31 + 1个月`）时，自动收口至目标月最后一天。
    public func addingMonths(_ months: Int) throws -> PureDate {
        let zeroBasedMonth = month - 1
        let baseMonths = year * 12 + zeroBasedMonth
        let summed = baseMonths.addingReportingOverflow(months)
        guard !summed.overflow else {
            throw DomainError.invalidCalendarDate(year: year, month: month, day: day)
        }
        let totalMonths = summed.partialValue
        let targetYear = totalMonths >= 0 ? (totalMonths / 12) : ((totalMonths - 11) / 12)
        let targetMonth = totalMonths - targetYear * 12 + 1
        let maxDay = Self.daysInMonth(year: targetYear, month: targetMonth)
        let clampedDay = min(day, maxDay)
        return try PureDate(year: targetYear, month: targetMonth, day: clampedDay)
    }

    /// 按自然日递增/递减（基于 UTC 公历 `Calendar.date(byAdding: .day, ...)`）。
    public func addingDays(_ days: Int) throws -> PureDate {
        let baseDate = toUTCDate()
        guard let shifted = Self.utcGregorian.date(byAdding: .day, value: days, to: baseDate) else {
            throw DomainError.invalidCalendarDate(year: year, month: month, day: day)
        }
        let comps = Self.utcGregorian.dateComponents([.year, .month, .day], from: shifted)
        guard let targetYear = comps.year, let targetMonth = comps.month, let targetDay = comps.day else {
            throw DomainError.invalidCalendarDate(year: year, month: month, day: day)
        }
        return try PureDate(year: targetYear, month: targetMonth, day: targetDay)
    }

    /// 计算 `self` 到目标日期 `other` 的自然日差（`other - self`）。
    public func days(until other: PureDate) -> Int {
        let start = toUTCDate()
        let end = other.toUTCDate()
        let diff = Self.utcGregorian.dateComponents([.day], from: start, to: end)
        return diff.day ?? 0
    }

    private func toUTCDate() -> Date {
        let comps = DateComponents(
            calendar: Self.utcGregorian,
            timeZone: Self.utcGregorian.timeZone,
            year: year,
            month: month,
            day: day
        )
        return Self.utcGregorian.date(from: comps)!
    }
}
