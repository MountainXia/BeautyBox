import Foundation
import BeautyBoxCore
import BeautyBoxPersistence
import GRDB
import Testing

@Suite("Category/Brand/Product Repository 与美瞳主档触发器测试")
struct ProductRepositoryTests {
    @Test("147 分类树检索与一级父节点禁止直挂产品约束")
    func categoryQueriesAndDirectMountGuard() throws {
        let v1 = try SQLMigrationLoader.loadV1Migration(databaseDirectory: TestSupport.databaseDirectoryURL)
        let db = try BeautyBoxDatabase.openInMemory(migrations: [v1])
        let catRepo = GRDBCategoryRepository(database: db)
        let prodRepo = GRDBProductRepository(database: db)

        #expect(try catRepo.fetchAllActive().count == 147)
        #expect(try catRepo.fetchByLevel(.primary).count == 9)
        #expect(try catRepo.fetchByLevel(.secondary).count == 45)
        #expect(try catRepo.fetchByLevel(.leaf).count == 93)
        #expect(try catRepo.fetchDirectSelectable().count > 93) // 93 L3 + 若干可直选 L2

        let lensSearch = try catRepo.search(query: "美瞳")
        #expect(lensSearch.contains(where: { $0.id == "cat-seed-l2_ln_cosmetic" }))

        // 尝试向一级分类 cat-seed-l1_makeup 直接建档应被拒绝
        #expect(throws: PersistenceError.categoryDisallowsDirectProduct(categoryId: "cat-seed-l1_makeup", categoryName: "彩妆")) {
            _ = try prodRepo.createProduct(
                CreateProductInput(brandName: "Zelens", categoryId: "cat-seed-l1_makeup"),
                nowISO: "2026-11-27T10:00:00Z"
            )
        }
    }

    @Test("品牌归一化去重、Product CRUD 与 is_custom_name 更新保护")
    func brandDeduplicationAndProductCrud() throws {
        let v1 = try SQLMigrationLoader.loadV1Migration(databaseDirectory: TestSupport.databaseDirectoryURL)
        let db = try BeautyBoxDatabase.openInMemory(migrations: [v1])
        let brandRepo = GRDBBrandRepository(database: db)
        let prodRepo = GRDBProductRepository(database: db)

        // 品牌空格与大小写归一化去重
        let b1 = try brandRepo.findOrCreate(name: "  Zelens  ", nowISO: "2026-11-27T10:00:00Z")
        let b2 = try brandRepo.findOrCreate(name: "zelens", nowISO: "2026-11-27T10:01:00Z")
        #expect(b1.id == b2.id)
        #expect(try brandRepo.fetchAll().count == 1)

        // 1. 新建：未填自定义名称时由 ProductNameComposer 自动拼装，绝不拼接 spec
        let created = try prodRepo.createProduct(
            CreateProductInput(
                id: "prod-foundation-1",
                brandName: "Zelens",
                categoryId: "cat-seed-l3_mk_base_foundation",
                editedName: nil,
                shade: "Youth #Cameo",
                spec: ProductSpec(value: Decimal(string: "30")!, unit: .ml)
            ),
            nowISO: "2026-11-27T10:02:00Z"
        )
        #expect(created.product.name == "Zelens 粉底液 Youth #Cameo")
        #expect(created.product.isCustomName == false)
        #expect(created.product.spec?.value == Decimal(30))
        #expect(created.product.spec?.unit == .ml)

        // 2. 用户手工改名 -> 锁定 isCustomName = true
        let customRenamed = try prodRepo.updateProduct(
            id: created.product.id,
            input: UpdateProductInput(
                brandName: "Zelens",
                categoryId: "cat-seed-l3_mk_base_foundation",
                editedName: "我的本命养肤粉底",
                shade: "Youth #Cameo",
                spec: ProductSpec(value: Decimal(string: "30")!, unit: .ml)
            ),
            nowISO: "2026-11-27T10:03:00Z"
        )
        #expect(customRenamed.product.name == "我的本命养肤粉底")
        #expect(customRenamed.product.isCustomName == true)

        // 3. 修改色号但未改名称字段 -> 绝不覆盖已有自定义名称
        let afterShadeEdit = try prodRepo.updateProduct(
            id: created.product.id,
            input: UpdateProductInput(
                brandName: "Zelens",
                categoryId: "cat-seed-l3_mk_base_foundation",
                editedName: nil,
                shade: "Porcelain",
                spec: ProductSpec(value: Decimal(string: "30")!, unit: .ml)
            ),
            nowISO: "2026-11-27T10:04:00Z"
        )
        #expect(afterShadeEdit.product.name == "我的本命养肤粉底")
        #expect(afterShadeEdit.product.isCustomName == true)

        // 4. 列表查询与无引用安全删除
        #expect(try prodRepo.listActiveProducts().count == 1)
        try prodRepo.deleteProductIfUnreferenced(id: created.product.id)
        #expect(try prodRepo.fetchProduct(id: created.product.id) == nil)
    }

    @Test("美瞳主档周期绑定、周期过滤及 SQLite 触发器/外键强制拦截")
    func lensProfileAndDatabaseTriggers() throws {
        let v1 = try SQLMigrationLoader.loadV1Migration(databaseDirectory: TestSupport.databaseDirectoryURL)
        let db = try BeautyBoxDatabase.openInMemory(migrations: [v1])
        let prodRepo = GRDBProductRepository(database: db)

        // 非美瞳分类在 Swift 层拦截挂载美瞳档案
        #expect(throws: DomainError.lensProfileRequiresLensCategory(
            categoryId: "cat-seed-l3_mk_base_foundation",
            specialtyGroup: nil
        )) {
            _ = try prodRepo.createProduct(
                CreateProductInput(
                    id: "prod-non-lens",
                    brandName: "MAC",
                    categoryId: "cat-seed-l3_mk_base_foundation",
                    lensProfile: ProductLensProfile(replacementCycle: .daily)
                ),
                nowISO: "2026-11-27T10:05:00Z"
            )
        }

        // 先创建普通粉底产品，验证绕过 Swift 直接 SQL 插 product_lens_profiles 时仍被 SQLite 触发器拦截
        let nonLens = try prodRepo.createProduct(
            CreateProductInput(
                id: "prod-non-lens-ok",
                brandName: "MAC",
                categoryId: "cat-seed-l3_mk_base_foundation"
            ),
            nowISO: "2026-11-27T10:06:00Z"
        )
        do {
            try db.write { conn in
                try conn.execute(
                    sql: """
                    INSERT INTO product_lens_profiles (product_id, replacement_cycle_code, created_at, updated_at)
                    VALUES (?, 'daily', '2026-11-27T10:06:00Z', '2026-11-27T10:06:00Z');
                    """,
                    arguments: [nonLens.product.id]
                )
            }
            Issue.record("SQLite trigger trg_lens_profile_require_lens_category_insert should have aborted")
        } catch {
            // 触发器按预期拦截
        }

        // 正常创建美瞳 Product + 按 replacement_cycle_code 过滤查询
        let lensAgg = try prodRepo.createProduct(
            CreateProductInput(
                id: "prod-olens",
                brandName: "Olens",
                categoryId: "cat-seed-l2_ln_cosmetic",
                editedName: "Olens Scandi Gray 日抛",
                lensProfile: ProductLensProfile(
                    replacementCycle: .daily,
                    baseCurveMm: Decimal(string: "8.6")!,
                    diameterMm: Decimal(string: "14.2")!,
                    waterContentPercent: Decimal(48),
                    packPieceCount: 10,
                    colorPattern: "Scandi Gray"
                )
            ),
            nowISO: "2026-11-27T10:07:00Z"
        )
        #expect(lensAgg.product.lensProfile?.replacementCycle == .daily)
        #expect(lensAgg.product.lensProfile?.packPieceCount == 10)
        #expect(try prodRepo.listActiveProducts(lensCycle: .daily).map(\.product.id) == ["prod-olens"])
        #expect(try prodRepo.listActiveProducts(lensCycle: .monthly).isEmpty)

        // 已有美瞳档案时禁止通过 SQL 将产品分类改成非美瞳分类（trg_product_forbid_non_lens_with_profile）
        do {
            try db.write { conn in
                try conn.execute(
                    sql: "UPDATE products SET category_id = 'cat-seed-l3_mk_base_foundation' WHERE id = ?;",
                    arguments: [lensAgg.product.id]
                )
            }
            Issue.record("SQLite trigger trg_product_forbid_non_lens_with_profile should have aborted")
        } catch {
            // 触发器按预期拦截
        }
    }
}
