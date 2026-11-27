import Foundation
import GRDB

/// GRDB SQLite 数据库连接管理器，统一强制开启 `PRAGMA foreign_keys = ON` 并执行版本校验与迁移。
public final class BeautyBoxDatabase: Sendable {
    public let dbQueue: DatabaseQueue

    private init(dbQueue: DatabaseQueue) {
        self.dbQueue = dbQueue
    }

    /// 打开本地 SQLite 文件数据库并执行受控迁移（支持重新打开已有文件并核验版本/校验和）。
    public static func open(
        atPath path: String,
        migrations: [SQLMigrationStep],
        appliedAt: String = BeautyBoxMigrator.utcNowISO8601()
    ) throws -> BeautyBoxDatabase {
        let dbQueue = try DatabaseQueue(path: path, configuration: makeConfiguration())
        return try initializeAndMigrate(dbQueue: dbQueue, migrations: migrations, appliedAt: appliedAt)
    }

    /// 便捷入口：从指定 `database/` 根目录加载 Schema V1 脚本并打开数据库。
    public static func openV1(
        atPath path: String,
        databaseDirectory: URL,
        appliedAt: String = BeautyBoxMigrator.utcNowISO8601()
    ) throws -> BeautyBoxDatabase {
        let v1 = try SQLMigrationLoader.loadV1Migration(databaseDirectory: databaseDirectory)
        return try open(atPath: path, migrations: [v1], appliedAt: appliedAt)
    }

    /// 打开内存测试库并初始化 V1 Schema。
    public static func openInMemory(
        migrations: [SQLMigrationStep],
        appliedAt: String = BeautyBoxMigrator.utcNowISO8601()
    ) throws -> BeautyBoxDatabase {
        let dbQueue = try DatabaseQueue(configuration: makeConfiguration())
        return try initializeAndMigrate(dbQueue: dbQueue, migrations: migrations, appliedAt: appliedAt)
    }

    private static func makeConfiguration() -> Configuration {
        var config = Configuration()
        config.foreignKeysEnabled = true
        config.busyMode = .timeout(5.0)
        return config
    }

    private static func initializeAndMigrate(
        dbQueue: DatabaseQueue,
        migrations: [SQLMigrationStep],
        appliedAt: String
    ) throws -> BeautyBoxDatabase {
        // 再次显式确认外键处于开启状态，杜绝隐式静默关闭
        let fkEnabled = try dbQueue.read { db in
            try Int.fetchOne(db, sql: "PRAGMA foreign_keys;")
        }
        guard fkEnabled == 1 else {
            throw PersistenceError.foreignKeysNotEnabled
        }

        try BeautyBoxMigrator.migrate(dbWriter: dbQueue, steps: migrations, appliedAt: appliedAt)
        return BeautyBoxDatabase(dbQueue: dbQueue)
    }

    public func read<T>(_ block: (Database) throws -> T) throws -> T {
        try dbQueue.read(block)
    }

    public func write<T>(_ updates: (Database) throws -> T) throws -> T {
        try dbQueue.write(updates)
    }
}
