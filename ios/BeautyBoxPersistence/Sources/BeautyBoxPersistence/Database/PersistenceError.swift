import Foundation

/// 持久化层、Migration 校验及 Repository 操作错误。
public enum PersistenceError: Error, Equatable, Sendable, LocalizedError {
    case foreignKeysNotEnabled
    case downgradeNotAllowed(currentVersion: Int, maxSupportedVersion: Int)
    case nonSequentialMigrationVersion(expected: Int, actual: Int)
    case checksumMismatch(version: Int, migrationKey: String, expected: String, actual: String)
    case migrationExecutionFailed(version: Int, migrationKey: String, message: String)
    case sqlScriptNotFound(String)
    case recordNotFound(entity: String, id: String)
    case categoryDisallowsDirectProduct(categoryId: String, categoryName: String)
    case invalidStoredValue(table: String, column: String, value: String)
    case deleteRestricted(entity: String, id: String, reason: String)

    public var errorDescription: String? {
        switch self {
        case .foreignKeysNotEnabled:
            return "SQLite 外键约束未能成功启用（PRAGMA foreign_keys != 1）"
        case .downgradeNotAllowed(let current, let maxSupported):
            return "禁止数据库降级：当前库版本 v\(current) 高于应用支持上限 v\(maxSupported)"
        case .nonSequentialMigrationVersion(let expected, let actual):
            return "迁移版本号不连续：期望 v\(expected)，实际为 v\(actual)"
        case .checksumMismatch(let version, let key, let expected, let actual):
            return "Migration v\(version) (\(key)) SHA-256 校验和不匹配（期望 \(expected)，实际 \(actual)）"
        case .migrationExecutionFailed(let version, let key, let message):
            return "Migration v\(version) (\(key)) 执行失败并已回滚：\(message)"
        case .sqlScriptNotFound(let path):
            return "未找到 SQLite 脚本文件：\(path)"
        case .recordNotFound(let entity, let id):
            return "未找到 \(entity) 记录（id=\(id)）"
        case .categoryDisallowsDirectProduct(let id, let name):
            return "分类「\(name)」(\(id)) 不允许直接挂载产品，请选择允许直选的二级或三级叶子分类"
        case .invalidStoredValue(let table, let column, let value):
            return "数据库字段值无效（\(table).\(column)=\(value)）"
        case .deleteRestricted(let entity, let id, let reason):
            return "无法删除 \(entity)(\(id))：\(reason)"
        }
    }
}
