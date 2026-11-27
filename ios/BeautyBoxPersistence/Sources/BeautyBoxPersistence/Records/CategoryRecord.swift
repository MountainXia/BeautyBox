import Foundation
import BeautyBoxCore
import GRDB

/// GRDB 记录映射：`categories` 表（V1 147 节点三级分类树）。
public struct CategoryRecord: Codable, Equatable, Sendable, FetchableRecord, PersistableRecord {
    public static let databaseTableName = "categories"

    public let id: String
    public let code: String
    public let parentId: String?
    public let level: Int
    public let name: String
    public let definition: String?
    public let examplesText: String?
    public let defaultUnit: String
    public let allowDirectProduct: Bool
    public let expiryManagementMode: String
    public let hasSpecialtyAttrs: Bool
    public let specialtyGroupCode: String?
    public let isSystem: Bool
    public let isActive: Bool
    public let deprecatedByCode: String?
    public let sortOrder: Int
    public let createdAt: String
    public let updatedAt: String
    public let deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case code
        case parentId = "parent_id"
        case level
        case name
        case definition
        case examplesText = "examples_text"
        case defaultUnit = "default_unit"
        case allowDirectProduct = "allow_direct_product"
        case expiryManagementMode = "expiry_management_mode"
        case hasSpecialtyAttrs = "has_specialty_attrs"
        case specialtyGroupCode = "specialty_group_code"
        case isSystem = "is_system"
        case isActive = "is_active"
        case deprecatedByCode = "deprecated_by_code"
        case sortOrder = "sort_order"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
    }

    public func toDomainMeta() throws -> CategoryMeta {
        guard let catLevel = CategoryLevel(rawValue: level) else {
            throw PersistenceError.invalidStoredValue(table: Self.databaseTableName, column: "level", value: String(level))
        }
        guard let mode = ExpiryManagementMode(rawValue: expiryManagementMode) else {
            throw PersistenceError.invalidStoredValue(
                table: Self.databaseTableName,
                column: "expiry_management_mode",
                value: expiryManagementMode
            )
        }
        let specialty: SpecialtyGroup? = specialtyGroupCode == "lens" ? .lens : nil
        let unit = SpecUnit(rawValue: defaultUnit)

        return CategoryMeta(
            id: id,
            code: code,
            parentId: parentId,
            level: catLevel,
            name: name,
            defaultSpecUnit: unit,
            allowDirectProduct: allowDirectProduct,
            expiryManagementMode: mode,
            specialtyGroup: specialty
        )
    }
}
