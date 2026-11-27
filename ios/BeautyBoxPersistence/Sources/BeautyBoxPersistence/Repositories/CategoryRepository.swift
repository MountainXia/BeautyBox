import Foundation
import BeautyBoxCore
import GRDB

/// 三级产品分类只读访问契约（V1 固化 9 一级 / 45 二级 / 93 三级）。
public protocol CategoryRepository: Sendable {
    func fetchAllActive() throws -> [CategoryRecord]
    func fetchByLevel(_ level: CategoryLevel) throws -> [CategoryRecord]
    func fetchDirectSelectable() throws -> [CategoryRecord]
    func fetchById(_ id: String) throws -> CategoryRecord?
    func fetchByCode(_ code: String) throws -> CategoryRecord?
    func fetchChildren(parentId: String) throws -> [CategoryRecord]
    func search(query: String) throws -> [CategoryRecord]
}

public final class GRDBCategoryRepository: CategoryRepository, Sendable {
    private let database: BeautyBoxDatabase

    public init(database: BeautyBoxDatabase) {
        self.database = database
    }

    public func fetchAllActive() throws -> [CategoryRecord] {
        try database.read { db in
            try CategoryRecord.fetchAll(
                db,
                sql: """
                SELECT * FROM categories
                WHERE is_active = 1 AND deleted_at IS NULL
                ORDER BY level ASC, sort_order ASC;
                """
            )
        }
    }

    public func fetchByLevel(_ level: CategoryLevel) throws -> [CategoryRecord] {
        try database.read { db in
            try CategoryRecord.fetchAll(
                db,
                sql: """
                SELECT * FROM categories
                WHERE level = ? AND is_active = 1 AND deleted_at IS NULL
                ORDER BY sort_order ASC;
                """,
                arguments: [level.rawValue]
            )
        }
    }

    public func fetchDirectSelectable() throws -> [CategoryRecord] {
        try database.read { db in
            try CategoryRecord.fetchAll(
                db,
                sql: """
                SELECT * FROM categories
                WHERE allow_direct_product = 1 AND is_active = 1 AND deleted_at IS NULL
                ORDER BY sort_order ASC;
                """
            )
        }
    }

    public func fetchById(_ id: String) throws -> CategoryRecord? {
        try database.read { db in
            try CategoryRecord.fetchOne(db, sql: "SELECT * FROM categories WHERE id = ?;", arguments: [id])
        }
    }

    public func fetchByCode(_ code: String) throws -> CategoryRecord? {
        try database.read { db in
            try CategoryRecord.fetchOne(db, sql: "SELECT * FROM categories WHERE code = ?;", arguments: [code])
        }
    }

    public func fetchChildren(parentId: String) throws -> [CategoryRecord] {
        try database.read { db in
            try CategoryRecord.fetchAll(
                db,
                sql: """
                SELECT * FROM categories
                WHERE parent_id = ? AND is_active = 1 AND deleted_at IS NULL
                ORDER BY sort_order ASC;
                """,
                arguments: [parentId]
            )
        }
    }

    public func search(query: String) throws -> [CategoryRecord] {
        let cleaned = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else {
            return try fetchAllActive()
        }
        let pattern = "%\(cleaned)%"
        return try database.read { db in
            try CategoryRecord.fetchAll(
                db,
                sql: """
                SELECT * FROM categories
                WHERE is_active = 1 AND deleted_at IS NULL
                  AND (name LIKE ? OR code LIKE ? OR COALESCE(definition, '') LIKE ?)
                ORDER BY allow_direct_product DESC, level DESC, sort_order ASC;
                """,
                arguments: [pattern, pattern, pattern]
            )
        }
    }
}
