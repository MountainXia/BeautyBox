import Foundation
import BeautyBoxCore
import GRDB

/// 创建单件/单盒实物入参。
public struct CreateProductItemInput: Sendable {
    public let item: ProductItem
    public let acquireChannel: String?
    public let defaultCurrency: CurrencyCode

    public init(
        item: ProductItem,
        acquireChannel: String? = nil,
        defaultCurrency: CurrencyCode = .cny
    ) {
        self.item = item
        self.acquireChannel = acquireChannel
        self.defaultCurrency = defaultCurrency
    }
}

/// 生命周期流转持久化结果。
public struct PersistedLifecycleTransition: Equatable, Sendable {
    public let record: ProductItemRecord
    public let outcome: LifecycleTransitionOutcome
    public let expiryEvaluation: ExpiryEvaluationResult
}

/// 单件/单盒实物持久层访问契约，所有规则计算统一委托 `BeautyBoxCore` 并运行在 SQLite 事务内。
public protocol ProductItemRepository: Sendable {
    func createItem(_ input: CreateProductItemInput, today: PureDate, nowISO: String) throws -> ProductItemRecord
    func createItemsBatch(_ inputs: [CreateProductItemInput], today: PureDate, nowISO: String) throws -> [ProductItemRecord]
    func fetchItem(id: String) throws -> ProductItemRecord?
    func listItems(productId: String, includeDeleted: Bool) throws -> [ProductItemRecord]
    func updateItem(_ item: ProductItem, acquireChannel: String?, today: PureDate, nowISO: String) throws -> ProductItemRecord
    func transitionLifecycle(itemId: String, request: LifecycleTransitionRequest, nowISO: String) throws -> PersistedLifecycleTransition
    func deleteItemIfUnreferenced(id: String) throws
    func fetchSpendSummary(primaryCurrency: CurrencyCode) throws -> MoneySummary
}

public final class GRDBProductItemRepository: ProductItemRepository, Sendable {
    private let database: BeautyBoxDatabase

    public init(database: BeautyBoxDatabase) {
        self.database = database
    }

    public func createItem(
        _ input: CreateProductItemInput,
        today: PureDate,
        nowISO: String = BeautyBoxMigrator.utcNowISO8601()
    ) throws -> ProductItemRecord {
        let batch = try createItemsBatch([input], today: today, nowISO: nowISO)
        return batch[0]
    }

    /// 原子批量新增多瓶/多盒（如左眼盒 + 右眼盒）：任一单盒违反业务或数据库约束即整体回滚。
    public func createItemsBatch(
        _ inputs: [CreateProductItemInput],
        today: PureDate,
        nowISO: String = BeautyBoxMigrator.utcNowISO8601()
    ) throws -> [ProductItemRecord] {
        try database.write { db in
            var created: [ProductItemRecord] = []
            for input in inputs {
                let record = try insertItem(in: db, input: input, today: today, nowISO: nowISO)
                created.append(record)
            }
            return created
        }
    }

    public func fetchItem(id: String) throws -> ProductItemRecord? {
        try database.read { db in
            try ProductItemRecord.fetchOne(db, sql: "SELECT * FROM product_items WHERE id = ?;", arguments: [id])
        }
    }

    public func listItems(productId: String, includeDeleted: Bool = false) throws -> [ProductItemRecord] {
        try database.read { db in
            let sql = includeDeleted
                ? "SELECT * FROM product_items WHERE product_id = ? ORDER BY created_at ASC;"
                : "SELECT * FROM product_items WHERE product_id = ? AND deleted_at IS NULL ORDER BY created_at ASC;"
            return try ProductItemRecord.fetchAll(db, sql: sql, arguments: [productId])
        }
    }

    public func updateItem(
        _ item: ProductItem,
        acquireChannel: String? = nil,
        today: PureDate,
        nowISO: String = BeautyBoxMigrator.utcNowISO8601()
    ) throws -> ProductItemRecord {
        try database.write { db in
            guard let oldRecord = try ProductItemRecord.fetchOne(
                db,
                sql: "SELECT * FROM product_items WHERE id = ?;",
                arguments: [item.id]
            ) else {
                throw PersistenceError.recordNotFound(entity: "product_items", id: item.id)
            }

            let aggregate = try requireProductAggregate(in: db, productId: item.productId)
            let expiry = try evaluateExpiry(for: item, aggregate: aggregate, today: today)

            var updated = ProductItemRecord.fromDomainItem(
                item,
                acquireChannel: acquireChannel ?? oldRecord.acquireChannel,
                defaultCurrency: (try? CurrencyCode.parse(oldRecord.currencyCode)) ?? .cny,
                computedExpiryDate: expiry.computedExpiryDate,
                computedExpiryBasis: expiry.computedBasis,
                archivedAt: oldRecord.archivedAt,
                createdAt: oldRecord.createdAt,
                updatedAt: nowISO
            )
            // 保留已有的迁移溯源或回收站元数据，不被常规编辑抹掉
            updated.migrationLegacyStatus = oldRecord.migrationLegacyStatus
            updated.migrationReviewStatus = oldRecord.migrationReviewStatus
            updated.migrationAuditJson = oldRecord.migrationAuditJson
            updated.deletedAt = oldRecord.deletedAt
            updated.trashExpiresAt = oldRecord.trashExpiresAt
            updated.trashScope = oldRecord.trashScope
            updated.deletedByParentId = oldRecord.deletedByParentId
            updated.deleteBatchId = oldRecord.deleteBatchId

            try updated.update(db)
            return updated
        }
    }

    public func transitionLifecycle(
        itemId: String,
        request: LifecycleTransitionRequest,
        nowISO: String = BeautyBoxMigrator.utcNowISO8601()
    ) throws -> PersistedLifecycleTransition {
        try database.write { db in
            guard var record = try ProductItemRecord.fetchOne(
                db,
                sql: "SELECT * FROM product_items WHERE id = ?;",
                arguments: [itemId]
            ) else {
                throw PersistenceError.recordNotFound(entity: "product_items", id: itemId)
            }

            let domainItem = try record.toDomainItem()
            let outcome = try LifecycleEngine.transition(item: domainItem, request: request)

            let updatedItem = try ProductItem(
                id: domainItem.id,
                productId: domainItem.productId,
                purchasePrice: domainItem.purchasePrice,
                purchaseDate: domainItem.purchaseDate,
                lifecycleStatus: outcome.nextStatus,
                remainingPercent: outcome.remainingPercent,
                lifecycleNote: outcome.lifecycleNote,
                lastUsedAt: domainItem.lastUsedAt,
                finishedAt: outcome.finishedAt,
                manufactureDate: domainItem.manufactureDate,
                unopenedShelfMonths: domainItem.unopenedShelfMonths,
                packagingExpDate: domainItem.packagingExpDate,
                openedDate: outcome.openedDate,
                paoMonths: domainItem.paoMonths,
                confirmedExpiryDate: outcome.confirmedExpiryDate,
                expiryConfirmedAt: outcome.expiryConfirmedAt,
                confirmedInputFingerprint: outcome.confirmedInputFingerprint,
                lensEyeSide: domainItem.lensEyeSide,
                lensPower: domainItem.lensPower,
                batchCode: domainItem.batchCode
            )

            let aggregate = try requireProductAggregate(in: db, productId: updatedItem.productId)
            let expiry = try evaluateExpiry(for: updatedItem, aggregate: aggregate, today: request.today)

            record.lifecycleStatus = updatedItem.lifecycleStatus.rawValue
            record.openedDate = updatedItem.openedDate?.isoString
            record.finishedAt = updatedItem.finishedAt?.isoString
            record.remainingPercent = updatedItem.remainingPercent
            record.lifecycleNote = updatedItem.lifecycleNote
            record.confirmedExpiryDate = updatedItem.confirmedExpiryDate?.isoString
            record.expiryConfirmedAt = updatedItem.expiryConfirmedAt
            record.confirmedInputFingerprint = updatedItem.confirmedInputFingerprint
            record.computedExpiryDate = outcome.shouldClearComputedExpiry ? nil : expiry.computedExpiryDate?.isoString
            record.computedExpiryBasis = expiry.computedBasis.rawValue
            record.updatedAt = nowISO

            try record.update(db)
            return PersistedLifecycleTransition(record: record, outcome: outcome, expiryEvaluation: expiry)
        }
    }

    public func deleteItemIfUnreferenced(id: String) throws {
        try database.write { db in
            guard try ProductItemRecord.fetchOne(db, sql: "SELECT * FROM product_items WHERE id = ?;", arguments: [id]) != nil else {
                throw PersistenceError.recordNotFound(entity: "product_items", id: id)
            }
            do {
                try db.execute(sql: "DELETE FROM product_items WHERE id = ?;", arguments: [id])
            } catch let error as DatabaseError where error.resultCode == .SQLITE_CONSTRAINT {
                throw PersistenceError.deleteRestricted(entity: "product_items", id: id, reason: error.message ?? "外键约束拦截")
            }
        }
    }

    /// 统计未进入回收站的累计购买消费（含已用完/已归档历史实物），通过 `MoneyCalculator` 严格分币种聚合。
    public func fetchSpendSummary(primaryCurrency: CurrencyCode = .cny) throws -> MoneySummary {
        try database.read { db in
            let rows = try Row.fetchAll(
                db,
                sql: """
                SELECT purchase_price_minor, currency_code
                FROM product_items
                WHERE deleted_at IS NULL
                  AND purchase_price_minor IS NOT NULL;
                """
            )
            let amounts: [MoneyAmount] = try rows.map { row in
                let minor: Int64 = row["purchase_price_minor"]
                let rawCode: String = row["currency_code"]
                let code = try CurrencyCode.parse(rawCode)
                return try MoneyAmount(minorUnits: minor, currency: code)
            }
            return try MoneyCalculator.aggregateByCurrency(amounts, primaryCurrency: primaryCurrency)
        }
    }

    private func insertItem(
        in db: Database,
        input: CreateProductItemInput,
        today: PureDate,
        nowISO: String
    ) throws -> ProductItemRecord {
        let aggregate = try requireProductAggregate(in: db, productId: input.item.productId)
        let expiry = try evaluateExpiry(for: input.item, aggregate: aggregate, today: today)
        let record = ProductItemRecord.fromDomainItem(
            input.item,
            acquireChannel: input.acquireChannel,
            defaultCurrency: input.defaultCurrency,
            computedExpiryDate: expiry.computedExpiryDate,
            computedExpiryBasis: expiry.computedBasis,
            createdAt: nowISO,
            updatedAt: nowISO
        )
        try record.insert(db)
        return record
    }

    private func requireProductAggregate(in db: Database, productId: String) throws -> ProductAggregate {
        guard let prodRecord = try ProductRecord.fetchOne(
            db,
            sql: "SELECT * FROM products WHERE id = ?;",
            arguments: [productId]
        ) else {
            throw PersistenceError.recordNotFound(entity: "products", id: productId)
        }
        return try GRDBProductRepository.assembleAggregate(in: db, productRecord: prodRecord)
    }

    private func evaluateExpiry(
        for item: ProductItem,
        aggregate: ProductAggregate,
        today: PureDate
    ) throws -> ExpiryEvaluationResult {
        let rawInputs = ExpiryRawInputs(
            lifecycleStatus: item.lifecycleStatus,
            expiryManagementMode: aggregate.product.category.expiryManagementMode,
            isLens: aggregate.product.category.isLensCategory,
            replacementCycle: aggregate.product.lensProfile?.replacementCycle,
            lensPackPieceCount: aggregate.product.lensProfile?.packPieceCount,
            manufactureDate: item.manufactureDate,
            unopenedShelfMonths: item.unopenedShelfMonths,
            packagingExpDate: item.packagingExpDate,
            openedDate: item.openedDate,
            paoMonths: item.paoMonths
        )
        let confirmation = ExpiryConfirmationState(
            confirmedExpiryDate: item.confirmedExpiryDate,
            expiryConfirmedAt: item.expiryConfirmedAt,
            confirmedInputFingerprint: item.confirmedInputFingerprint
        )
        return try ExpiryEngine.evaluate(inputs: rawInputs, confirmation: confirmation, today: today)
    }
}
