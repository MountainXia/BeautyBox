import Foundation
import GRDB

/// 与 `database/python/beautybox_db.py` `MigrationStep` 严格对齐的持久化迁移描述符。
public struct SQLMigrationStep: Equatable, Sendable {
    public let version: Int
    public let migrationKey: String
    public let description: String
    public let sqlScripts: [String]

    public init(
        version: Int,
        migrationKey: String,
        description: String,
        sqlScripts: [String]
    ) {
        self.version = version
        self.migrationKey = migrationKey
        self.description = description
        self.sqlScripts = sqlScripts
    }

    /// 与 Python `"\n--STEP--\n".join(sql_scripts)` + SHA-256 hex 完全一致的校验和。
    public var checksumSHA256: String {
        let joined = sqlScripts.joined(separator: "\n--STEP--\n")
        return SHA256Hasher.hexDigest(utf8String: joined)
    }
}

/// 负责从仓库 `database/` 目录或应用资源目录加载 V1 SQL 脚本。
public enum SQLMigrationLoader {
    public static func loadV1Migration(databaseDirectory: URL) throws -> SQLMigrationStep {
        let ddlURL = databaseDirectory
            .appendingPathComponent("migrations", isDirectory: true)
            .appendingPathComponent("0001_schema_v1.sql")
        let seedURL = databaseDirectory
            .appendingPathComponent("seeds", isDirectory: true)
            .appendingPathComponent("0001_categories_v1.sql")

        guard FileManager.default.fileExists(atPath: ddlURL.path) else {
            throw PersistenceError.sqlScriptNotFound(ddlURL.path)
        }
        guard FileManager.default.fileExists(atPath: seedURL.path) else {
            throw PersistenceError.sqlScriptNotFound(seedURL.path)
        }

        let ddlSQL = try String(contentsOf: ddlURL, encoding: .utf8)
        let seedSQL = try String(contentsOf: seedURL, encoding: .utf8)

        return SQLMigrationStep(
            version: 1,
            migrationKey: "0001_initial_schema_v1_and_taxonomy_seeds",
            description: "初始化 BeautyBox V3.1 Schema V1（22 张表、外键/CHECK/索引）与 147 节点三维分类种子",
            sqlScripts: [ddlSQL, seedSQL]
        )
    }
}

/// 事务化 SQLite Migration 引擎：校验版本单调递增、拒绝降级并验证历史 SHA-256 校验和。
public enum BeautyBoxMigrator {
    @discardableResult
    public static func migrate(
        dbWriter: some DatabaseWriter,
        steps: [SQLMigrationStep],
        appliedAt: String = Self.utcNowISO8601()
    ) throws -> [Int] {
        let orderedSteps = steps.sorted { $0.version < $1.version }
        guard let maxSupported = orderedSteps.last?.version else {
            return []
        }

        var currentVersion = try dbWriter.read { db -> Int in
            let fk = try Int.fetchOne(db, sql: "PRAGMA foreign_keys;")
            guard fk == 1 else {
                throw PersistenceError.foreignKeysNotEnabled
            }
            return try Int.fetchOne(db, sql: "PRAGMA user_version;") ?? 0
        }

        if currentVersion > maxSupported {
            throw PersistenceError.downgradeNotAllowed(
                currentVersion: currentVersion,
                maxSupportedVersion: maxSupported
            )
        }

        var appliedVersions: [Int] = []

        for step in orderedSteps {
            if step.version <= currentVersion {
                try dbWriter.read { db in
                    let hasTable = try Int.fetchOne(
                        db,
                        sql: "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations';"
                    ) ?? 0
                    if hasTable > 0,
                       let storedChecksum = try String.fetchOne(
                           db,
                           sql: "SELECT checksum_sha256 FROM schema_migrations WHERE version = ?;",
                           arguments: [step.version]
                       ),
                       storedChecksum != step.checksumSHA256 {
                        throw PersistenceError.checksumMismatch(
                            version: step.version,
                            migrationKey: step.migrationKey,
                            expected: step.checksumSHA256,
                            actual: storedChecksum
                        )
                    }
                }
                continue
            }

            if step.version != currentVersion + 1 {
                throw PersistenceError.nonSequentialMigrationVersion(
                    expected: currentVersion + 1,
                    actual: step.version
                )
            }

            do {
                try dbWriter.writeWithoutTransaction { db in
                    try db.inTransaction(.immediate) {
                        for script in step.sqlScripts {
                            try db.execute(sql: script)
                        }
                        try db.execute(
                            sql: """
                            INSERT INTO schema_migrations (version, migration_key, description, checksum_sha256, applied_at)
                            VALUES (?, ?, ?, ?, ?);
                            """,
                            arguments: [
                                step.version,
                                step.migrationKey,
                                step.description,
                                step.checksumSHA256,
                                appliedAt,
                            ]
                        )
                        try db.execute(sql: "PRAGMA user_version = \(step.version);")
                        return .commit
                    }
                }
            } catch let error as PersistenceError {
                throw error
            } catch {
                throw PersistenceError.migrationExecutionFailed(
                    version: step.version,
                    migrationKey: step.migrationKey,
                    message: error.localizedDescription
                )
            }

            currentVersion = step.version
            appliedVersions.append(step.version)
        }

        return appliedVersions
    }

    public static func utcNowISO8601(_ date: Date = Date()) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }
}
