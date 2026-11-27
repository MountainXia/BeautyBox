import Foundation
import BeautyBoxCore
import BeautyBoxPersistence
import GRDB
import Testing

@Suite("ProductItem Repository 事务、多币种、生命周期、效期持久化与重开完整性测试")
struct ProductItemRepositoryTests {
    private let d = { (iso: String) -> PureDate in try! PureDate(isoString: iso) }

    @Test("多币种精确存取与分组聚合，原子批量建盒失败整体回滚，重开磁盘库完全保真")
    func multiCurrencyBatchRollbackAndReopenIntegrity() throws {
        let (dir, dbPath) = try TestSupport.makeTempSQLitePath(prefix: "items_persist")
        defer { try? FileManager.default.removeItem(at: dir) }

        let db = try BeautyBoxDatabase.openV1(atPath: dbPath, databaseDirectory: TestSupport.databaseDirectoryURL)
        let prodRepo = GRDBProductRepository(database: db)
        let itemRepo = GRDBProductItemRepository(database: db)
        let today = d("2026-11-27")

        let lens = try prodRepo.createProduct(
            CreateProductInput(
                id: "p-lens-1",
                brandName: "Olens",
                categoryId: "cat-seed-l2_ln_cosmetic",
                editedName: "Olens Scandi 日抛",
                lensProfile: ProductLensProfile(replacementCycle: .daily, packPieceCount: 10)
            ),
            nowISO: "2026-11-27T10:00:00Z"
        )

        // 1. 原子批量入库左右眼两盒不同度数、不同币种
        let leftBox = try ProductItem(
            id: "box-left",
            productId: lens.product.id,
            purchasePrice: try MoneyCalculator.parse(decimalString: "128.50", currencyCode: "CNY"),
            purchaseDate: d("2026-11-01"),
            lifecycleStatus: .unopened,
            remainingPercent: 100,
            packagingExpDate: d("2028-05-01"),
            lensEyeSide: .left,
            lensPower: "-2.50",
            batchCode: "B001"
        )
        let rightBox = try ProductItem(
            id: "box-right",
            productId: lens.product.id,
            purchasePrice: try MoneyCalculator.parse(decimalString: "1980", currencyCode: "JPY"),
            purchaseDate: d("2026-11-01"),
            lifecycleStatus: .unopened,
            remainingPercent: 100,
            packagingExpDate: d("2028-05-01"),
            lensEyeSide: .right,
            lensPower: "-3.00",
            batchCode: "B002"
        )
        let createdBoxes = try itemRepo.createItemsBatch(
            [
                CreateProductItemInput(item: leftBox, acquireChannel: "官方旗舰店"),
                CreateProductItemInput(item: rightBox, acquireChannel: "海淘"),
            ],
            today: today,
            nowISO: "2026-11-27T10:01:00Z"
        )
        #expect(createdBoxes.count == 2)
        #expect(createdBoxes[0].computedExpiryDate == "2028-05-01")
        #expect(createdBoxes[0].computedExpiryBasis == "packaging_exp")

        // 2. 批量事务回滚验证：第二条引用不存在的 productId -> 第一条也必须回滚
        let validExtra = try ProductItem(id: "rollback-ok", productId: lens.product.id, lifecycleStatus: .unopened, remainingPercent: 100)
        let missingParent = try ProductItem(id: "rollback-fail", productId: "non-existent-prod", lifecycleStatus: .unopened, remainingPercent: 100)
        #expect(throws: PersistenceError.recordNotFound(entity: "products", id: "non-existent-prod")) {
            _ = try itemRepo.createItemsBatch(
                [CreateProductItemInput(item: validExtra), CreateProductItemInput(item: missingParent)],
                today: today
            )
        }
        #expect(try itemRepo.fetchItem(id: "rollback-ok") == nil)

        // 3. 含 KWD 三位小数价格的另一产品实物写入，检验分组聚合零浮点误差
        let serum = try prodRepo.createProduct(
            CreateProductInput(id: "p-serum", brandName: "Clarins", categoryId: "cat-seed-l3_sk_sr_essence"),
            nowISO: "2026-11-27T10:02:00Z"
        )
        let kwdItem = try ProductItem(
            id: "serum-kwd",
            productId: serum.product.id,
            purchasePrice: try MoneyCalculator.parse(decimalString: "24.375", currencyCode: "KWD"),
            lifecycleStatus: .unrecorded
        )
        _ = try itemRepo.createItem(CreateProductItemInput(item: kwdItem), today: today, nowISO: "2026-11-27T10:03:00Z")

        // 4. 存在子实物时，删除主档受 ON DELETE RESTRICT / Repository 拦截
        #expect(throws: PersistenceError.deleteRestricted(
            entity: "products",
            id: lens.product.id,
            reason: "仍存在 2 条关联实物（含回收站），受外键 ON DELETE RESTRICT 保护"
        )) {
            try prodRepo.deleteProductIfUnreferenced(id: lens.product.id)
        }

        // 5. 关闭重开磁盘 SQLite 文件后核对完整数据与多币种聚合
        let reopened = try BeautyBoxDatabase.openV1(atPath: dbPath, databaseDirectory: TestSupport.databaseDirectoryURL)
        let reopenedItemRepo = GRDBProductItemRepository(database: reopened)
        let spendSummary = try reopenedItemRepo.fetchSpendSummary(primaryCurrency: .cny)
        #expect(spendSummary.primaryCurrency == .cny)
        #expect(spendSummary.primaryTotal.minorUnits == 12_850)
        #expect(spendSummary.otherCurrencyTotals.map(\.currency) == [.jpy, .kwd])
        #expect(spendSummary.otherCurrencyTotals[0].totalAmount.minorUnits == 1980)
        #expect(spendSummary.otherCurrencyTotals[1].totalAmount.minorUnits == 24_375)

        let reopenedLeft = try reopenedItemRepo.fetchItem(id: "box-left")?.toDomainItem()
        #expect(reopenedLeft?.lensEyeSide == .left)
        #expect(reopenedLeft?.lensPower == "-2.50")
    }

    @Test("生命周期流转事务、4 层效期重算与独立红色重置持久化")
    func lifecycleAndExpiryPersistenceFlow() throws {
        let v1 = try SQLMigrationLoader.loadV1Migration(databaseDirectory: TestSupport.databaseDirectoryURL)
        let db = try BeautyBoxDatabase.openInMemory(migrations: [v1])
        let prodRepo = GRDBProductRepository(database: db)
        let itemRepo = GRDBProductItemRepository(database: db)
        let today = d("2026-11-27")

        let prod = try prodRepo.createProduct(
            CreateProductInput(id: "p-cream", brandName: "La Mer", categoryId: "cat-seed-l3_sk_ec_cream"),
            nowISO: "2026-11-27T10:00:00Z"
        )

        let initialItem = try ProductItem(
            id: "cream-1",
            productId: prod.product.id,
            purchasePrice: try MoneyCalculator.parse(decimalString: "1850.00", currencyCode: "CNY"),
            lifecycleStatus: .unopened,
            remainingPercent: 100,
            manufactureDate: d("2025-01-01"),
            unopenedShelfMonths: 36, // 2028-01-01
            paoMonths: 12
        )
        let created = try itemRepo.createItem(
            CreateProductItemInput(item: initialItem),
            today: today,
            nowISO: "2026-11-27T10:01:00Z"
        )
        #expect(created.computedExpiryDate == "2028-01-01")
        #expect(created.computedExpiryBasis == "mfg_plus_shelf")

        // 1. 开封使用中（2026-11-27 + 12m -> 2027-11-27 < 2028-01-01，取 min）
        let openedRes = try itemRepo.transitionLifecycle(
            itemId: "cream-1",
            request: LifecycleTransitionRequest(targetStatus: .inUse, today: today),
            nowISO: "2026-11-27T10:02:00Z"
        )
        #expect(openedRes.record.lifecycleStatus == "in_use")
        #expect(openedRes.record.openedDate == "2026-11-27")
        #expect(openedRes.record.computedExpiryDate == "2027-11-27")
        #expect(openedRes.record.computedExpiryBasis == "min_unopened_and_pao")

        // 2. 写入用户手动确认日期后，重新调整 raw_input 不静默覆盖 confirmed_expiry_date
        var domainAfterOpen = try openedRes.record.toDomainItem()
        let confirmedAt = "2026-11-27T10:03:00Z"
        let fp = ExpiryEngine.inputFingerprint(for: ExpiryRawInputs(
            lifecycleStatus: .inUse,
            manufactureDate: domainAfterOpen.manufactureDate,
            unopenedShelfMonths: domainAfterOpen.unopenedShelfMonths,
            openedDate: domainAfterOpen.openedDate,
            paoMonths: domainAfterOpen.paoMonths
        ))
        domainAfterOpen.confirmedExpiryDate = d("2027-12-15")
        domainAfterOpen.expiryConfirmedAt = confirmedAt
        domainAfterOpen.confirmedInputFingerprint = fp
        domainAfterOpen.paoMonths = 6 // 改为 6 个月 -> 2027-05-27

        let updatedRecord = try itemRepo.updateItem(domainAfterOpen, today: today, nowISO: "2026-11-27T10:04:00Z")
        #expect(updatedRecord.computedExpiryDate == "2027-05-27")
        #expect(updatedRecord.confirmedExpiryDate == "2027-12-15") // 保护不被静默覆盖

        // 3. 标记已用完需二次确认，成功后残量归零，活跃件数降为 0，历史总消费仍计入
        let finishedRes = try itemRepo.transitionLifecycle(
            itemId: "cream-1",
            request: LifecycleTransitionRequest(targetStatus: .finished, userConfirmed: true, today: today),
            nowISO: "2026-11-27T10:05:00Z"
        )
        #expect(finishedRes.record.lifecycleStatus == "finished")
        #expect(finishedRes.record.remainingPercent == 0)
        #expect(finishedRes.expiryEvaluation.isActiveAlertSuppressed == true)

        let aggAfterFinish = try prodRepo.fetchProduct(id: prod.product.id)
        #expect(aggAfterFinish?.activeItemCount == 0)
        #expect(aggAfterFinish?.totalItemCount == 1)

        // 4. 详情页独立红色重置为 unrecorded：清除使用与确认日期，保留生产期/保质期/PAO
        let resetRes = try itemRepo.transitionLifecycle(
            itemId: "cream-1",
            request: LifecycleTransitionRequest(
                targetStatus: .unrecorded,
                source: .dedicatedResetFlow,
                userConfirmed: true,
                today: today
            ),
            nowISO: "2026-11-27T10:06:00Z"
        )
        #expect(resetRes.record.lifecycleStatus == "unrecorded")
        #expect(resetRes.record.openedDate == nil)
        #expect(resetRes.record.finishedAt == nil)
        #expect(resetRes.record.remainingPercent == nil)
        #expect(resetRes.record.confirmedExpiryDate == nil)
        #expect(resetRes.record.computedExpiryDate == nil)
        #expect(resetRes.record.computedExpiryBasis == "unrecorded")
        #expect(resetRes.record.manufactureDate == "2025-01-01")
        #expect(resetRes.record.unopenedShelfMonths == 36)
        #expect(resetRes.record.paoMonths == 6)

        // 5. 若无任何外键限制表（usage logs）引用，可安全删除单件
        try itemRepo.deleteItemIfUnreferenced(id: "cream-1")
        #expect(try itemRepo.fetchItem(id: "cream-1") == nil)
    }
}
