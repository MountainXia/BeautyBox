import Foundation
import BeautyBoxPersistence

enum TestSupport {
    static var repoRootURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // BeautyBoxPersistenceTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // BeautyBoxPersistence
            .deletingLastPathComponent() // ios
            .deletingLastPathComponent() // BeautyBox
    }

    static var databaseDirectoryURL: URL {
        repoRootURL.appendingPathComponent("database", isDirectory: true)
    }

    static func makeTempSQLitePath(prefix: String = "beautybox_test") throws -> (dir: URL, dbPath: String) {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(prefix)_\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let dbPath = dir.appendingPathComponent("beautybox.sqlite").path
        return (dir, dbPath)
    }
}
