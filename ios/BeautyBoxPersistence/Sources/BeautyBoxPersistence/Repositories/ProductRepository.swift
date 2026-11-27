import Foundation
import BeautyBoxCore
import GRDB

/// 创建产品主档入参。
public struct CreateProductInput: Sendable {
    public let id: String
    public let brandName: String?
    public let categoryId: String
    public let editedName: String?
    public let shade: String?
    public let spec: ProductSpec?
    public let lensProfile: ProductLensProfile?
    public let notesPrivate: String?
    public let categoryAttrsSchemaVer: Int
    public let categoryAttrsJson: String?

    public init(
        id: String = UUID().uuidString.lowercased(),
        brandName: String? = nil,
        categoryId: String,
        editedName: String? = nil,
        shade: String? = nil,
        spec: ProductSpec? = nil,
        lensProfile: ProductLensProfile? = nil,
        notesPrivate: String? = nil,
        categoryAttrsSchemaVer: Int = 1,
        categoryAttrsJson: String? = nil
    ) {
        self.id = id
        self.brandName = brandName
        self.categoryId = categoryId
        self.editedName = editedName
        self.shade = shade
        self.spec = spec
        self.lensProfile = lensProfile
        self.notesPrivate = notesPrivate
        self.categoryAttrsSchemaVer = categoryAttrsSchemaVer
        self.categoryAttrsJson = categoryAttrsJson
    }
}

/// 更新产品主档入参（严格沿用 `ProductNameComposer` `is_custom_name` 保护规则）。
public struct UpdateProductInput: Sendable {
    public let brandName: String?
    public let categoryId: String
    public let editedName: String?
    public let explicitRefreshNameToSuggested: Bool
    public let shade: String?
    public let spec: ProductSpec?
    public let lensProfile: ProductLensProfile?
    public let notesPrivate: String?
    public let categoryAttrsSchemaVer: Int
    public let categoryAttrsJson: String?

    public init(
        brandName: String? = nil,
        categoryId: String,
        editedName: String? = nil,
        explicitRefreshNameToSuggested: Bool = false,
        shade: String? = nil,
        spec: ProductSpec? = nil,
        lensProfile: ProductLensProfile? = nil,
        notesPrivate: String? = nil,
        categoryAttrsSchemaVer: Int = 1,
        categoryAttrsJson: String? = nil
    ) {
        self.brandName = brandName
        self.categoryId = categoryId
        self.editedName = editedName
        self.explicitRefreshNameToSuggested = explicitRefreshNameToSuggested
        self.shade = shade
        self.spec = spec
        self.lensProfile = lensProfile
        self.notesPrivate = notesPrivate
        self.categoryAttrsSchemaVer = categoryAttrsSchemaVer
        self.categoryAttrsJson = categoryAttrsJson
    }
}

/// 产品主档持久化访问契约（含美瞳 `product_lens_profiles` 单事务联动与触发器校验）。
public protocol ProductRepository: Sendable {
    func createProduct(_ input: CreateProductInput, nowISO: String) throws -> ProductAggregate
    func updateProduct(id: String, input: UpdateProductInput, nowISO: String) throws -> ProductAggregate
    func fetchProduct(id: String) throws -> ProductAggregate?
    func listActiveProducts(categoryId: String?, lensCycle: ReplacementCycle?, includeArchived: Bool) throws -> [ProductAggregate]
    func deleteProductIfUnreferenced(id: String) throws
}

public final class GRDBProductRepository: ProductRepository, Sendable {
    private let database: BeautyBoxDatabase

    public init(database: BeautyBoxDatabase) {
        self.database = database
    }

    public func createProduct(
        _ input: CreateProductInput,
        nowISO: String = BeautyBoxMigrator.utcNowISO8601()
    ) throws -> ProductAggregate {
        try database.write { db in
            let category = try requireSelectableCategory(in: db, id: input.categoryId)
            let categoryMeta = try category.toDomainMeta()
            try LensConstraintValidator.validateProduct(category: categoryMeta, lensProfile: input.lensProfile)

            let cleanBrand = input.brandName.map(BrandRecord.cleanDisplayName).flatMap { $0.isEmpty ? nil : $0 }
            let brand: BrandRecord? = try cleanBrand.map {
                try GRDBBrandRepository.findOrCreate(in: db, name: $0, nowISO: nowISO)
            }

            let nameResolution = ProductNameComposer.resolveForSave(
                editedNameInput: input.editedName,
                brandName: brand?.name,
                leafCategoryName: category.name,
                shade: input.shade
            )

            // 先由 BeautyBoxCore Domain 校验构造，再写入 SQLite
            _ = try Product(
                id: input.id,
                name: nameResolution.name,
                isCustomName: nameResolution.isCustomName,
                brandName: brand?.name,
                category: categoryMeta,
                shade: input.shade,
                spec: input.spec,
                lensProfile: input.lensProfile
            )

            let record = ProductRecord(
                id: input.id,
                brandId: brand?.id,
                categoryId: category.id,
                name: nameResolution.name,
                isCustomName: nameResolution.isCustomName,
                specValue: input.spec?.value?.description,
                specUnit: input.spec?.unit.rawValue,
                shade: input.shade?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true ? nil : input.shade?.trimmingCharacters(in: .whitespacesAndNewlines),
                categoryAttrsSchemaVer: input.categoryAttrsSchemaVer,
                categoryAttrsJson: input.categoryAttrsJson,
                notesPrivate: input.notesPrivate,
                migrationLegacyCategoryRaw: nil,
                migrationReviewStatus: nil,
                archivedAt: nil,
                deletedAt: nil,
                trashExpiresAt: nil,
                trashScope: nil,
                deleteBatchId: nil,
                createdAt: nowISO,
                updatedAt: nowISO
            )
            try record.insert(db)

            if let lensProfile = input.lensProfile {
                let lensRecord = try ProductLensProfileRecord.fromDomainProfile(
                    lensProfile,
                    productId: record.id,
                    createdAt: nowISO,
                    updatedAt: nowISO
                )
                try lensRecord.insert(db)
            }

            return try Self.assembleAggregate(in: db, productRecord: record)
        }
    }

    public func updateProduct(
        id: String,
        input: UpdateProductInput,
        nowISO: String = BeautyBoxMigrator.utcNowISO8601()
    ) throws -> ProductAggregate {
        try database.write { db in
            guard var existing = try ProductRecord.fetchOne(db, sql: "SELECT * FROM products WHERE id = ?;", arguments: [id]) else {
                throw PersistenceError.recordNotFound(entity: "products", id: id)
            }

            let category = try requireSelectableCategory(in: db, id: input.categoryId)
            let categoryMeta = try category.toDomainMeta()
            try LensConstraintValidator.validateProduct(category: categoryMeta, lensProfile: input.lensProfile)

            let cleanBrand = input.brandName.map(BrandRecord.cleanDisplayName).flatMap { $0.isEmpty ? nil : $0 }
            let brand: BrandRecord? = try cleanBrand.map {
                try GRDBBrandRepository.findOrCreate(in: db, name: $0, nowISO: nowISO)
            }

            let nameResolution: NameResolutionResult
            if input.explicitRefreshNameToSuggested {
                nameResolution = ProductNameComposer.applyExplicitRefresh(
                    brandName: brand?.name,
                    leafCategoryName: category.name,
                    shade: input.shade
                )
            } else {
                nameResolution = ProductNameComposer.resolveForSave(
                    existingName: existing.name,
                    existingIsCustomName: existing.isCustomName,
                    editedNameInput: input.editedName,
                    brandName: brand?.name,
                    leafCategoryName: category.name,
                    shade: input.shade
                )
            }

            _ = try Product(
                id: existing.id,
                name: nameResolution.name,
                isCustomName: nameResolution.isCustomName,
                brandName: brand?.name,
                category: categoryMeta,
                shade: input.shade,
                spec: input.spec,
                lensProfile: input.lensProfile
            )

            existing.brandId = brand?.id
            existing.categoryId = category.id
            existing.name = nameResolution.name
            existing.isCustomName = nameResolution.isCustomName
            existing.specValue = input.spec?.value?.description
            existing.specUnit = input.spec?.unit.rawValue
            existing.shade = input.shade?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true ? nil : input.shade?.trimmingCharacters(in: .whitespacesAndNewlines)
            existing.categoryAttrsSchemaVer = input.categoryAttrsSchemaVer
            existing.categoryAttrsJson = input.categoryAttrsJson
            existing.notesPrivate = input.notesPrivate
            existing.updatedAt = nowISO

            // 同步管理 product_lens_profiles：若目标不再包含档案，须先删除旧档案再改分类，避免触发器拦截
            if let lensProfile = input.lensProfile {
                try existing.update(db)
                if let oldProfile = try ProductLensProfileRecord.fetchOne(
                    db,
                    sql: "SELECT * FROM product_lens_profiles WHERE product_id = ?;",
                    arguments: [existing.id]
                ) {
                    let updatedProfile = try ProductLensProfileRecord.fromDomainProfile(
                        lensProfile,
                        productId: existing.id,
                        createdAt: oldProfile.createdAt,
                        updatedAt: nowISO
                    )
                    try updatedProfile.update(db)
                } else {
                    let inserted = try ProductLensProfileRecord.fromDomainProfile(
                        lensProfile,
                        productId: existing.id,
                        createdAt: nowISO,
                        updatedAt: nowISO
                    )
                    try inserted.insert(db)
                }
            } else {
                try db.execute(sql: "DELETE FROM product_lens_profiles WHERE product_id = ?;", arguments: [existing.id])
                try existing.update(db)
            }

            return try Self.assembleAggregate(in: db, productRecord: existing)
        }
    }

    public func fetchProduct(id: String) throws -> ProductAggregate? {
        try database.read { db in
            guard let record = try ProductRecord.fetchOne(db, sql: "SELECT * FROM products WHERE id = ?;", arguments: [id]) else {
                return nil
            }
            return try Self.assembleAggregate(in: db, productRecord: record)
        }
    }

    public func listActiveProducts(
        categoryId: String? = nil,
        lensCycle: ReplacementCycle? = nil,
        includeArchived: Bool = false
    ) throws -> [ProductAggregate] {
        try database.read { db in
            var clauses: [String] = ["p.deleted_at IS NULL"]
            var args: [DatabaseValueConvertible] = []
            if !includeArchived {
                clauses.append("p.archived_at IS NULL")
            }
            if let categoryId {
                clauses.append("p.category_id = ?")
                args.append(categoryId)
            }
            var joinClause = ""
            if let lensCycle {
                joinClause = "JOIN product_lens_profiles lp ON lp.product_id = p.id"
                clauses.append("lp.replacement_cycle_code = ?")
                args.append(lensCycle.rawValue)
            }
            let sql = """
            SELECT p.* FROM products p
            \(joinClause)
            WHERE \(clauses.joined(separator: " AND "))
            ORDER BY p.updated_at DESC, p.created_at DESC;
            """
            let records = try ProductRecord.fetchAll(db, sql: sql, arguments: StatementArguments(args))
            return try records.map { try Self.assembleAggregate(in: db, productRecord: $0) }
        }
    }

    public func deleteProductIfUnreferenced(id: String) throws {
        try database.write { db in
            guard try ProductRecord.fetchOne(db, sql: "SELECT * FROM products WHERE id = ?;", arguments: [id]) != nil else {
                throw PersistenceError.recordNotFound(entity: "products", id: id)
            }
            let itemCount = try Int.fetchOne(
                db,
                sql: "SELECT COUNT(*) FROM product_items WHERE product_id = ?;",
                arguments: [id]
            ) ?? 0
            guard itemCount == 0 else {
                throw PersistenceError.deleteRestricted(
                    entity: "products",
                    id: id,
                    reason: "仍存在 \(itemCount) 条关联实物（含回收站），受外键 ON DELETE RESTRICT 保护"
                )
            }
            do {
                try db.execute(sql: "DELETE FROM product_lens_profiles WHERE product_id = ?;", arguments: [id])
                try db.execute(sql: "DELETE FROM products WHERE id = ?;", arguments: [id])
            } catch let error as DatabaseError where error.resultCode == .SQLITE_CONSTRAINT {
                throw PersistenceError.deleteRestricted(entity: "products", id: id, reason: error.message ?? "约束拦截")
            }
        }
    }

    private func requireSelectableCategory(in db: Database, id: String) throws -> CategoryRecord {
        guard let category = try CategoryRecord.fetchOne(
            db,
            sql: "SELECT * FROM categories WHERE id = ? AND is_active = 1 AND deleted_at IS NULL;",
            arguments: [id]
        ) else {
            throw PersistenceError.recordNotFound(entity: "categories", id: id)
        }
        guard category.allowDirectProduct else {
            throw PersistenceError.categoryDisallowsDirectProduct(categoryId: category.id, categoryName: category.name)
        }
        return category
    }

    static func assembleAggregate(in db: Database, productRecord: ProductRecord) throws -> ProductAggregate {
        guard let category = try CategoryRecord.fetchOne(
            db,
            sql: "SELECT * FROM categories WHERE id = ?;",
            arguments: [productRecord.categoryId]
        ) else {
            throw PersistenceError.recordNotFound(entity: "categories", id: productRecord.categoryId)
        }

        let brand: BrandRecord?
        if let brandId = productRecord.brandId {
            brand = try BrandRecord.fetchOne(db, sql: "SELECT * FROM brands WHERE id = ?;", arguments: [brandId])
        } else {
            brand = nil
        }

        let lensRecord = try ProductLensProfileRecord.fetchOne(
            db,
            sql: "SELECT * FROM product_lens_profiles WHERE product_id = ?;",
            arguments: [productRecord.id]
        )
        let domainLens = try lensRecord?.toDomainProfile()

        let spec: ProductSpec?
        if let unitRaw = productRecord.specUnit {
            let unit = SpecUnit(rawValue: unitRaw) ?? .other
            let decValue = productRecord.specValue.flatMap { Decimal(string: $0) }
            spec = ProductSpec(value: decValue, unit: unit)
        } else {
            spec = nil
        }

        let categoryMeta = try category.toDomainMeta()
        let product = try Product(
            id: productRecord.id,
            name: productRecord.name,
            isCustomName: productRecord.isCustomName,
            brandName: brand?.name,
            category: categoryMeta,
            shade: productRecord.shade,
            spec: spec,
            lensProfile: domainLens
        )

        let totalItems = try Int.fetchOne(
            db,
            sql: "SELECT COUNT(*) FROM product_items WHERE product_id = ? AND deleted_at IS NULL;",
            arguments: [productRecord.id]
        ) ?? 0
        let activeItems = try Int.fetchOne(
            db,
            sql: """
            SELECT COUNT(*) FROM product_items
            WHERE product_id = ? AND deleted_at IS NULL AND lifecycle_status != 'finished';
            """,
            arguments: [productRecord.id]
        ) ?? 0

        return ProductAggregate(
            product: product,
            brand: brand,
            category: category,
            notesPrivate: productRecord.notesPrivate,
            categoryAttrsSchemaVer: productRecord.categoryAttrsSchemaVer,
            categoryAttrsJson: productRecord.categoryAttrsJson,
            archivedAt: productRecord.archivedAt,
            activeItemCount: activeItems,
            totalItemCount: totalItems,
            createdAt: productRecord.createdAt,
            updatedAt: productRecord.updatedAt
        )
    }
}
