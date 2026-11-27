import Foundation
import GRDB

/// 品牌主数据访问契约，负责品牌归一化去重存储。
public protocol BrandRepository: Sendable {
    func findOrCreate(name: String, nowISO: String) throws -> BrandRecord
    func fetchAll() throws -> [BrandRecord]
    func fetchById(_ id: String) throws -> BrandRecord?
}

public final class GRDBBrandRepository: BrandRepository, Sendable {
    private let database: BeautyBoxDatabase

    public init(database: BeautyBoxDatabase) {
        self.database = database
    }

    public func findOrCreate(name: String, nowISO: String = BeautyBoxMigrator.utcNowISO8601()) throws -> BrandRecord {
        try database.write { db in
            try Self.findOrCreate(in: db, name: name, nowISO: nowISO)
        }
    }

    public func fetchAll() throws -> [BrandRecord] {
        try database.read { db in
            try BrandRecord.fetchAll(db, sql: "SELECT * FROM brands ORDER BY normalized_name ASC;")
        }
    }

    public func fetchById(_ id: String) throws -> BrandRecord? {
        try database.read { db in
            try BrandRecord.fetchOne(db, sql: "SELECT * FROM brands WHERE id = ?;", arguments: [id])
        }
    }

    /// 供同事务内的产品写操作直接调用，保证品牌去重与主档写入原子性。
    static func findOrCreate(in db: Database, name: String, nowISO: String) throws -> BrandRecord {
        let cleaned = BrandRecord.cleanDisplayName(name)
        guard !cleaned.isEmpty else {
            throw PersistenceError.invalidStoredValue(table: "brands", column: "name", value: name)
        }
        let normalized = BrandRecord.normalizeName(cleaned)
        if let existing = try BrandRecord.fetchOne(
            db,
            sql: "SELECT * FROM brands WHERE normalized_name = ?;",
            arguments: [normalized]
        ) {
            return existing
        }

        let created = BrandRecord(
            id: UUID().uuidString.lowercased(),
            name: cleaned,
            normalizedName: normalized,
            createdAt: nowISO,
            updatedAt: nowISO
        )
        try created.insert(db)
        return created
    }
}
