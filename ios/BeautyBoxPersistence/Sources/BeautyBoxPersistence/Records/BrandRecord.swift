import Foundation
import BeautyBoxCore
import GRDB

/// GRDB 记录映射：`brands` 表（品牌归一化主数据）。
public struct BrandRecord: Codable, Equatable, Sendable, FetchableRecord, PersistableRecord {
    public static let databaseTableName = "brands"

    public let id: String
    public var name: String
    public var normalizedName: String
    public let createdAt: String
    public var updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case normalizedName = "normalized_name"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    public init(
        id: String,
        name: String,
        normalizedName: String? = nil,
        createdAt: String,
        updatedAt: String
    ) {
        let trimmed = Self.cleanDisplayName(name)
        self.id = id
        self.name = trimmed
        self.normalizedName = normalizedName ?? Self.normalizeName(trimmed)
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    public func toDomainRef() -> BrandRef {
        BrandRef(id: id, name: name)
    }

    public static func cleanDisplayName(_ raw: String) -> String {
        raw.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    public static func normalizeName(_ raw: String) -> String {
        cleanDisplayName(raw).lowercased()
    }
}
