import Foundation
import BeautyBoxCore
import BeautyBoxPersistence
import GRDB
import Testing

@Suite("SQLite V1 Migration、校验和、版本治理与 Python 跨层兼容测试")
struct MigrationAndCompatibilityTests {
    @Test("真实初始化 Schema V1：22 张表、3 触发器、147 分类节点、默认设置与外键开启")
    func freshV1InitializationAndSeeds() throws {
        let (dir, dbPath) = try TestSupport.makeTempSQLitePath(prefix: "v1_init")
        defer { try? FileManager.default.removeItem(at: dir) }

        let v1 = try SQLMigrationLoader.loadV1Migration(databaseDirectory: TestSupport.databaseDirectoryURL)
        // 核验 Swift SHA256 与 Python build_v1_migration() 完全一致
        #expect(v1.checksumSHA256 == "aad985b769a87e7b0e101d85d3ec44b82eb954fb6908eb6244a64192e31ef878")

        let db = try BeautyBoxDatabase.open(atPath: dbPath, migrations: [v1], appliedAt: "2026-11-27T09:50:00Z")

        try db.read { conn in
            let tableCount = try Int.fetchOne(
                conn,
                sql: "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';"
            )
            #expect(tableCount == 22)

            let triggerCount = try Int.fetchOne(
                conn,
                sql: "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger';"
            )
            #expect(triggerCount == 3)

            let l1 = try Int.fetchOne(conn, sql: "SELECT COUNT(*) FROM categories WHERE level = 1;")
            let l2 = try Int.fetchOne(conn, sql: "SELECT COUNT(*) FROM categories WHERE level = 2;")
            let l3 = try Int.fetchOne(conn, sql: "SELECT COUNT(*) FROM categories WHERE level = 3;")
            #expect(l1 == 9)
            #expect(l2 == 45)
            #expect(l3 == 93)

            let settingsCount = try Int.fetchOne(conn, sql: "SELECT COUNT(*) FROM app_settings;")
            #expect(settingsCount == 4)

            let userVersion = try Int.fetchOne(conn, sql: "PRAGMA user_version;")
            let fkEnabled = try Int.fetchOne(conn, sql: "PRAGMA foreign_keys;")
            let fkViolations = try Row.fetchAll(conn, sql: "PRAGMA foreign_key_check;")
            #expect(userVersion == 1)
            #expect(fkEnabled == 1)
            #expect(fkViolations.isEmpty)
        }

        // 重新打开已有磁盘库应安全幂等通过
        let reopened = try BeautyBoxDatabase.openV1(atPath: dbPath, databaseDirectory: TestSupport.databaseDirectoryURL)
        let migrationCount = try reopened.read { conn in
            try Int.fetchOne(conn, sql: "SELECT COUNT(*) FROM schema_migrations WHERE version = 1;")
        }
        #expect(migrationCount == 1)
    }

    @Test("拒绝数据库降级、跳号升级、历史 SHA-256 篡改以及失败迁移整体回滚")
    func migrationGovernanceAndRollback() throws {
        let (dir, dbPath) = try TestSupport.makeTempSQLitePath(prefix: "v1_mig_guard")
        defer { try? FileManager.default.removeItem(at: dir) }

        let v1 = try SQLMigrationLoader.loadV1Migration(databaseDirectory: TestSupport.databaseDirectoryURL)
        let db = try BeautyBoxDatabase.open(atPath: dbPath, migrations: [v1])

        // 1. 失败的 v2 多语句迁移必须整体回滚，且 user_version 保持 1
        let brokenV2 = SQLMigrationStep(
            version: 2,
            migrationKey: "0002_broken_test",
            description: "故意在第二条语句失败以验证原子回滚",
            sqlScripts: [
                """
                CREATE TABLE tmp_should_rollback (id TEXT PRIMARY KEY);
                INSERT INTO non_existent_table_xyz VALUES ('boom');
                """,
            ]
        )
        #expect(throws: PersistenceError.migrationExecutionFailed(
            version: 2,
            migrationKey: "0002_broken_test",
            message: "SQLite error 1: no such table: non_existent_table_xyz - while executing `INSERT INTO non_existent_table_xyz VALUES ('boom')`"
        )) {
            _ = try BeautyBoxMigrator.migrate(dbWriter: db.dbQueue, steps: [v1, brokenV2])
        }

        try db.read { conn in
            let tmpExists = try Int.fetchOne(
                conn,
                sql: "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'tmp_should_rollback';"
            )
            let userVersion = try Int.fetchOne(conn, sql: "PRAGMA user_version;")
            #expect(tmpExists == 0)
            #expect(userVersion == 1)
        }

        // 2. 跳号升级 v3 应被拒绝
        let skippedV3 = SQLMigrationStep(version: 3, migrationKey: "0003_skip", description: "跳号", sqlScripts: ["SELECT 1;"])
        #expect(throws: PersistenceError.nonSequentialMigrationVersion(expected: 2, actual: 3)) {
            _ = try BeautyBoxMigrator.migrate(dbWriter: db.dbQueue, steps: [v1, skippedV3])
        }

        // 3. 篡改 schema_migrations 校验和必须阻断打开
        try db.write { conn in
            try conn.execute(
                sql: "UPDATE schema_migrations SET checksum_sha256 = ? WHERE version = 1;",
                arguments: [String(repeating: "0", count: 64)]
            )
        }
        #expect(throws: PersistenceError.checksumMismatch(
            version: 1,
            migrationKey: v1.migrationKey,
            expected: v1.checksumSHA256,
            actual: String(repeating: "0", count: 64)
        )) {
            _ = try BeautyBoxDatabase.open(atPath: dbPath, migrations: [v1])
        }

        // 4. 数据库版本高于应用支持上限（降级）必须阻断打开
        try db.write { conn in
            try conn.execute(sql: "UPDATE schema_migrations SET checksum_sha256 = ? WHERE version = 1;", arguments: [v1.checksumSHA256])
            try conn.execute(sql: "PRAGMA user_version = 5;")
        }
        #expect(throws: PersistenceError.downgradeNotAllowed(currentVersion: 5, maxSupportedVersion: 1)) {
            _ = try BeautyBoxDatabase.open(atPath: dbPath, migrations: [v1])
        }
    }

    @Test("Python beautybox_db.py 与 Swift GRDB 双向互通兼容验证")
    func pythonAndSwiftSQLiteCompatibility() throws {
        let (dir, swiftDbPath) = try TestSupport.makeTempSQLitePath(prefix: "compat_swift")
        let pyDbPath = dir.appendingPathComponent("from_python.sqlite").path
        defer { try? FileManager.default.removeItem(at: dir) }

        // A. Swift 初始化库 -> 交给 Python beautybox_db 校验并插入产品与实物 -> Swift 读取验证
        let _ = try BeautyBoxDatabase.openV1(atPath: swiftDbPath, databaseDirectory: TestSupport.databaseDirectoryURL)

        let pyScript = """
        import sys
        sys.path.insert(0, r'\(TestSupport.repoRootURL.path)/database/python')
        import beautybox_db

        # 1. 打开 Swift 创建的库，验证 v1 幂等无新增且无校验和错误
        conn1 = beautybox_db.connect_sqlite(r'\(swiftDbPath)')
        applied = beautybox_db.apply_migrations(conn1)
        assert applied == [], f"Expected no migrations, got {applied}"
        conn1.execute("INSERT INTO brands (id, name, normalized_name, created_at, updated_at) VALUES ('b-py', 'SUQQU', 'suqqu', '2026-11-27T00:00:00Z', '2026-11-27T00:00:00Z')")
        conn1.execute("INSERT INTO products (id, brand_id, category_id, name, is_custom_name, shade, created_at, updated_at) VALUES ('p-py', 'b-py', 'cat-seed-l3_mk_base_foundation', 'SUQQU 粉底液 110', 0, '110', '2026-11-27T00:00:00Z', '2026-11-27T00:00:00Z')")
        conn1.execute("INSERT INTO product_items (id, product_id, purchase_price_minor, currency_code, lifecycle_status, remaining_percent, manufacture_date, unopened_shelf_months, opened_date, pao_months, computed_expiry_date, computed_expiry_basis, created_at, updated_at) VALUES ('i-py', 'p-py', 52000, 'CNY', 'in_use', 80, '2025-01-01', 36, '2026-06-01', 12, '2027-06-01', 'min_unopened_and_pao', '2026-11-27T00:00:00Z', '2026-11-27T00:00:00Z')")
        conn1.close()

        # 2. Python 从零初始化另一个库供 Swift GRDB 打开读取
        conn2 = beautybox_db.connect_sqlite(r'\(pyDbPath)')
        beautybox_db.apply_migrations(conn2)
        conn2.execute("INSERT INTO products (id, brand_id, category_id, name, is_custom_name, created_at, updated_at) VALUES ('p-from-py', NULL, 'cat-seed-l3_mk_base_foundation', 'Python 写入粉底液', 1, '2026-11-27T00:00:00Z', '2026-11-27T00:00:00Z')")
        conn2.close()
        """

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        proc.arguments = ["python3", "-B", "-c", pyScript]
        let pipe = Pipe()
        proc.standardError = pipe
        try proc.run()
        proc.waitUntilExit()
        let stderrText = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        #expect(proc.terminationStatus == 0, "Python bridge check failed: \(stderrText)")

        // Swift GRDB 重开 Swift 库读取 Python 写入的产品和实物
        let reopenedSwift = try BeautyBoxDatabase.openV1(atPath: swiftDbPath, databaseDirectory: TestSupport.databaseDirectoryURL)
        let itemRepo = GRDBProductItemRepository(database: reopenedSwift)
        let fetchedPyItem = try itemRepo.fetchItem(id: "i-py")
        let domainPyItem = try fetchedPyItem?.toDomainItem()
        #expect(domainPyItem?.purchasePrice?.minorUnits == 52_000)
        #expect(domainPyItem?.purchasePrice?.currency == .cny)
        #expect(domainPyItem?.lifecycleStatus == .inUse)

        // Swift GRDB 打开 Python 初始化的库
        let openedPyDb = try BeautyBoxDatabase.openV1(atPath: pyDbPath, databaseDirectory: TestSupport.databaseDirectoryURL)
        let prodRepo = GRDBProductRepository(database: openedPyDb)
        let fetchedProd = try prodRepo.fetchProduct(id: "p-from-py")
        #expect(fetchedProd?.product.name == "Python 写入粉底液")
        #expect(fetchedProd?.product.isCustomName == true)
    }
}
