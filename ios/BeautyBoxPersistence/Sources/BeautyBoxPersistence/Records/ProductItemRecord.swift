import Foundation
import BeautyBoxCore
import GRDB

/// GRDB 记录映射：`product_items` 表（单瓶/单支/单盒独立实物实例）。
public struct ProductItemRecord: Codable, Equatable, Sendable, FetchableRecord, PersistableRecord {
    public static let databaseTableName = "product_items"

    public let id: String
    public var productId: String
    public var acquireChannel: String?
    public var purchasePriceMinor: Int64?
    public var currencyCode: String
    public var purchaseDate: String?
    public var lifecycleStatus: String
    public var remainingPercent: Int?
    public var lifecycleNote: String?
    public var manufactureDate: String?
    public var unopenedShelfMonths: Int?
    public var packagingExpDate: String?
    public var openedDate: String?
    public var paoMonths: Int?
    public var computedExpiryDate: String?
    public var computedExpiryBasis: String
    public var confirmedExpiryDate: String?
    public var expiryConfirmedAt: String?
    public var confirmedInputFingerprint: String?
    public var finishedAt: String?
    public var lastUsedAt: String?
    public var lensEyeSide: String?
    public var lensPower: String?
    public var batchCode: String?
    public var migrationLegacyStatus: String?
    public var migrationReviewStatus: String?
    public var migrationAuditJson: String?
    public var archivedAt: String?
    public var deletedAt: String?
    public var trashExpiresAt: String?
    public var trashScope: String?
    public var deletedByParentId: String?
    public var deleteBatchId: String?
    public let createdAt: String
    public var updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case productId = "product_id"
        case acquireChannel = "acquire_channel"
        case purchasePriceMinor = "purchase_price_minor"
        case currencyCode = "currency_code"
        case purchaseDate = "purchase_date"
        case lifecycleStatus = "lifecycle_status"
        case remainingPercent = "remaining_percent"
        case lifecycleNote = "lifecycle_note"
        case manufactureDate = "manufacture_date"
        case unopenedShelfMonths = "unopened_shelf_months"
        case packagingExpDate = "packaging_exp_date"
        case openedDate = "opened_date"
        case paoMonths = "pao_months"
        case computedExpiryDate = "computed_expiry_date"
        case computedExpiryBasis = "computed_expiry_basis"
        case confirmedExpiryDate = "confirmed_expiry_date"
        case expiryConfirmedAt = "expiry_confirmed_at"
        case confirmedInputFingerprint = "confirmed_input_fingerprint"
        case finishedAt = "finished_at"
        case lastUsedAt = "last_used_at"
        case lensEyeSide = "lens_eye_side"
        case lensPower = "lens_power"
        case batchCode = "batch_code"
        case migrationLegacyStatus = "migration_legacy_status"
        case migrationReviewStatus = "migration_review_status"
        case migrationAuditJson = "migration_audit_json"
        case archivedAt = "archived_at"
        case deletedAt = "deleted_at"
        case trashExpiresAt = "trash_expires_at"
        case trashScope = "trash_scope"
        case deletedByParentId = "deleted_by_parent_id"
        case deleteBatchId = "delete_batch_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    public func toDomainItem() throws -> ProductItem {
        let money: MoneyAmount?
        if let minor = purchasePriceMinor {
            let currency = try CurrencyCode.parse(currencyCode)
            money = try MoneyAmount(minorUnits: minor, currency: currency)
        } else {
            money = nil
        }

        guard let status = LifecycleStatus(rawValue: lifecycleStatus) else {
            throw PersistenceError.invalidStoredValue(
                table: Self.databaseTableName,
                column: "lifecycle_status",
                value: lifecycleStatus
            )
        }

        let parsedEyeSide: LensEyeSide?
        if let rawSide = lensEyeSide {
            guard let side = LensEyeSide(rawValue: rawSide) else {
                throw PersistenceError.invalidStoredValue(
                    table: Self.databaseTableName,
                    column: "lens_eye_side",
                    value: rawSide
                )
            }
            parsedEyeSide = side
        } else {
            parsedEyeSide = nil
        }

        let lastUsedPure: PureDate? = try lastUsedAt.map { raw in
            let prefix = String(raw.prefix(10))
            return try PureDate(isoString: prefix)
        }

        return try ProductItem(
            id: id,
            productId: productId,
            purchasePrice: money,
            purchaseDate: try purchaseDate.map(PureDate.init(isoString:)),
            lifecycleStatus: status,
            remainingPercent: remainingPercent,
            lifecycleNote: lifecycleNote,
            lastUsedAt: lastUsedPure,
            finishedAt: try finishedAt.map(PureDate.init(isoString:)),
            manufactureDate: try manufactureDate.map(PureDate.init(isoString:)),
            unopenedShelfMonths: unopenedShelfMonths,
            packagingExpDate: try packagingExpDate.map(PureDate.init(isoString:)),
            openedDate: try openedDate.map(PureDate.init(isoString:)),
            paoMonths: paoMonths,
            confirmedExpiryDate: try confirmedExpiryDate.map(PureDate.init(isoString:)),
            expiryConfirmedAt: expiryConfirmedAt,
            confirmedInputFingerprint: confirmedInputFingerprint,
            lensEyeSide: parsedEyeSide,
            lensPower: lensPower,
            batchCode: batchCode
        )
    }

    public static func fromDomainItem(
        _ item: ProductItem,
        acquireChannel: String? = nil,
        defaultCurrency: CurrencyCode = .cny,
        computedExpiryDate: PureDate? = nil,
        computedExpiryBasis: ComputedExpiryBasis = .insufficient,
        archivedAt: String? = nil,
        createdAt: String,
        updatedAt: String
    ) -> ProductItemRecord {
        let effectiveCurrency = item.purchasePrice?.currency ?? defaultCurrency
        let effectiveBasis: ComputedExpiryBasis = item.lifecycleStatus == .unrecorded ? .unrecorded : computedExpiryBasis

        return ProductItemRecord(
            id: item.id,
            productId: item.productId,
            acquireChannel: acquireChannel,
            purchasePriceMinor: item.purchasePrice?.minorUnits,
            currencyCode: effectiveCurrency.rawValue,
            purchaseDate: item.purchaseDate?.isoString,
            lifecycleStatus: item.lifecycleStatus.rawValue,
            remainingPercent: item.remainingPercent,
            lifecycleNote: item.lifecycleNote,
            manufactureDate: item.manufactureDate?.isoString,
            unopenedShelfMonths: item.unopenedShelfMonths,
            packagingExpDate: item.packagingExpDate?.isoString,
            openedDate: item.openedDate?.isoString,
            paoMonths: item.paoMonths,
            computedExpiryDate: computedExpiryDate?.isoString,
            computedExpiryBasis: effectiveBasis.rawValue,
            confirmedExpiryDate: item.confirmedExpiryDate?.isoString,
            expiryConfirmedAt: item.expiryConfirmedAt,
            confirmedInputFingerprint: item.confirmedInputFingerprint,
            finishedAt: item.finishedAt?.isoString,
            lastUsedAt: item.lastUsedAt?.isoString,
            lensEyeSide: item.lensEyeSide?.rawValue,
            lensPower: item.lensPower,
            batchCode: item.batchCode,
            migrationLegacyStatus: nil,
            migrationReviewStatus: nil,
            migrationAuditJson: nil,
            archivedAt: archivedAt,
            deletedAt: nil,
            trashExpiresAt: nil,
            trashScope: nil,
            deletedByParentId: nil,
            deleteBatchId: nil,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }
}
