import Foundation
import BeautyBoxCore
import GRDB

/// GRDB 记录映射：`products` 表。
public struct ProductRecord: Codable, Equatable, Sendable, FetchableRecord, PersistableRecord {
    public static let databaseTableName = "products"

    public let id: String
    public var brandId: String?
    public var categoryId: String
    public var name: String
    public var isCustomName: Bool
    public var specValue: String?
    public var specUnit: String?
    public var shade: String?
    public var categoryAttrsSchemaVer: Int
    public var categoryAttrsJson: String?
    public var notesPrivate: String?
    public var migrationLegacyCategoryRaw: String?
    public var migrationReviewStatus: String?
    public var archivedAt: String?
    public var deletedAt: String?
    public var trashExpiresAt: String?
    public var trashScope: String?
    public var deleteBatchId: String?
    public let createdAt: String
    public var updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case brandId = "brand_id"
        case categoryId = "category_id"
        case name
        case isCustomName = "is_custom_name"
        case specValue = "spec_value"
        case specUnit = "spec_unit"
        case shade
        case categoryAttrsSchemaVer = "category_attrs_schema_ver"
        case categoryAttrsJson = "category_attrs_json"
        case notesPrivate = "notes_private"
        case migrationLegacyCategoryRaw = "migration_legacy_category_raw"
        case migrationReviewStatus = "migration_review_status"
        case archivedAt = "archived_at"
        case deletedAt = "deleted_at"
        case trashExpiresAt = "trash_expires_at"
        case trashScope = "trash_scope"
        case deleteBatchId = "delete_batch_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

/// GRDB 记录映射：`product_lens_profiles` 表（仅美瞳产品可关联 1:0..1）。
public struct ProductLensProfileRecord: Codable, Equatable, Sendable, FetchableRecord, PersistableRecord {
    public static let databaseTableName = "product_lens_profiles"

    public let productId: String
    public var replacementCycleCode: String
    public var bcMm: String?
    public var diaMm: String?
    public var waterContentPercent: Int?
    public var packPieceCount: Int?
    public var lensColorPattern: String?
    public let createdAt: String
    public var updatedAt: String

    enum CodingKeys: String, CodingKey {
        case productId = "product_id"
        case replacementCycleCode = "replacement_cycle_code"
        case bcMm = "bc_mm"
        case diaMm = "dia_mm"
        case waterContentPercent = "water_content_percent"
        case packPieceCount = "pack_piece_count"
        case lensColorPattern = "lens_color_pattern"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    public func toDomainProfile() throws -> ProductLensProfile {
        guard let cycle = ReplacementCycle(rawValue: replacementCycleCode) else {
            throw PersistenceError.invalidStoredValue(
                table: Self.databaseTableName,
                column: "replacement_cycle_code",
                value: replacementCycleCode
            )
        }
        let bc: Decimal? = try parseOptionalDecimal(bcMm, column: "bc_mm")
        let dia: Decimal? = try parseOptionalDecimal(diaMm, column: "dia_mm")
        let water: Decimal? = waterContentPercent.map { Decimal($0) }

        return ProductLensProfile(
            replacementCycle: cycle,
            baseCurveMm: bc,
            diameterMm: dia,
            waterContentPercent: water,
            packPieceCount: packPieceCount,
            colorPattern: lensColorPattern
        )
    }

    public static func fromDomainProfile(
        _ profile: ProductLensProfile,
        productId: String,
        createdAt: String,
        updatedAt: String
    ) throws -> ProductLensProfileRecord {
        let waterInt: Int?
        if let water = profile.waterContentPercent {
            guard let parsed = Int(water.description), (1...99).contains(parsed) else {
                throw PersistenceError.invalidStoredValue(
                    table: Self.databaseTableName,
                    column: "water_content_percent",
                    value: water.description
                )
            }
            waterInt = parsed
        } else {
            waterInt = nil
        }

        return ProductLensProfileRecord(
            productId: productId,
            replacementCycleCode: profile.replacementCycle.rawValue,
            bcMm: profile.baseCurveMm?.description,
            diaMm: profile.diameterMm?.description,
            waterContentPercent: waterInt,
            packPieceCount: profile.packPieceCount,
            lensColorPattern: profile.colorPattern,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }

    private func parseOptionalDecimal(_ raw: String?, column: String) throws -> Decimal? {
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        guard let dec = Decimal(string: trimmed) else {
            throw PersistenceError.invalidStoredValue(table: Self.databaseTableName, column: column, value: raw)
        }
        return dec
    }
}

/// 联合查询聚合模型：含 `BeautyBoxCore.Product` 与所属品牌/分类/数量统计。
public struct ProductAggregate: Equatable, Sendable {
    public let product: Product
    public let brand: BrandRecord?
    public let category: CategoryRecord
    public let notesPrivate: String?
    public let categoryAttrsSchemaVer: Int
    public let categoryAttrsJson: String?
    public let archivedAt: String?
    public let activeItemCount: Int
    public let totalItemCount: Int
    public let createdAt: String
    public let updatedAt: String
}
