import Foundation
import Testing
@testable import BeautyBoxCore

@Suite("ProductNameComposer (M1) 与 LensConstraintValidator (UD-02/M10) 测试")
struct ProductNameAndLensTests {
    @Test("建议名生成规则：品牌 + 叶子分类 + 色号，跳空消重，绝不混入规格与数量")
    func composeSuggestedName() {
        let full = ProductNameComposer.composeSuggestedName(
            brandName: "  Zelens  ",
            leafCategoryName: "粉底液",
            shade: "Youth  #Cameo"
        )
        #expect(full == "Zelens 粉底液 Youth #Cameo")

        let noBrandNoShade = ProductNameComposer.composeSuggestedName(
            brandName: "   ",
            leafCategoryName: "爽肤水/保湿水",
            shade: nil
        )
        #expect(noBrandNoShade == "爽肤水/保湿水")

        let emptyAll = ProductNameComposer.composeSuggestedName(
            brandName: nil,
            leafCategoryName: "",
            shade: "  "
        )
        #expect(emptyAll == "未命名产品")
    }

    @Test("is_custom_name 手动改名保护与显式刷新/恢复保留行为")
    func customNameProtection() {
        // 1. 新建留空自动生成并保持 isCustomName = false
        let autoCreated = ProductNameComposer.resolveForSave(
            editedNameInput: "",
            brandName: "MAC",
            leafCategoryName: "口红",
            shade: "Chili"
        )
        #expect(autoCreated.name == "MAC 口红 Chili")
        #expect(autoCreated.isCustomName == false)

        // 2. 用户手工改成爱称 -> 锁定 isCustomName = true
        let customSaved = ProductNameComposer.resolveForSave(
            existingName: autoCreated.name,
            existingIsCustomName: false,
            editedNameInput: "小辣椒正红",
            brandName: "MAC",
            leafCategoryName: "口红",
            shade: "Chili"
        )
        #expect(customSaved.name == "小辣椒正红")
        #expect(customSaved.isCustomName == true)

        // 3. 之后仅修改品牌或色号，绝不覆盖手动名称，只提示存在更新建议
        let afterBrandChange = ProductNameComposer.resolveForSave(
            existingName: customSaved.name,
            existingIsCustomName: customSaved.isCustomName,
            editedNameInput: nil,
            brandName: "M·A·C",
            leafCategoryName: "口红",
            shade: "#316 Devoted to Chili"
        )
        #expect(afterBrandChange.name == "小辣椒正红")
        #expect(afterBrandChange.isCustomName == true)
        #expect(afterBrandChange.hasSuggestedUpdateAvailable == true)
        #expect(afterBrandChange.suggestedName == "M·A·C 口红 #316 Devoted to Chili")

        // 4. 备份恢复透传：严禁重算已有历史名
        let restored = ProductNameComposer.restorePreservedName(
            savedName: "绝版旧名称",
            savedIsCustomName: false,
            brandName: "新品牌",
            leafCategoryName: "唇釉",
            shade: "01"
        )
        #expect(restored.name == "绝版旧名称")
        #expect(restored.isCustomName == false)

        // 5. 用户主动点击刷新按钮才更新
        let refreshed = ProductNameComposer.applyExplicitRefresh(
            brandName: "M·A·C",
            leafCategoryName: "口红",
            shade: "#316"
        )
        #expect(refreshed.name == "M·A·C 口红 #316")
        #expect(refreshed.isCustomName == false)
    }

    @Test("美瞳主档分类归属校验、单盒单一度数校验与左右眼配对汇总")
    func lensConstraintsAndPairing() throws {
        let lipstickCat = CategoryMeta(
            id: "cat_lipstick",
            code: "makeup.lip.lipstick",
            level: .leaf,
            name: "口红",
            specialtyGroup: nil
        )
        let lensCat = CategoryMeta(
            id: "cat_lens",
            code: "eye.lens.color_lens",
            level: .leaf,
            name: "美瞳/彩色隐形眼镜",
            defaultSpecUnit: .piece,
            specialtyGroup: .lens
        )
        let dailyProfile = ProductLensProfile(replacementCycle: .daily)

        // 非美瞳分类不可挂美瞳光学档案
        #expect(throws: DomainError.lensProfileRequiresLensCategory(categoryId: "cat_lipstick", specialtyGroup: nil)) {
            _ = try Product(
                id: "p_lip",
                name: "口红",
                category: lipstickCat,
                lensProfile: dailyProfile
            )
        }

        // 美瞳分类除 replacementCycle 外所有光学参数可留空
        let lensProduct = try Product(
            id: "p_lens",
            name: "Olens Scandi 日抛",
            isCustomName: true,
            category: lensCat,
            lensProfile: dailyProfile
        )
        #expect(lensProduct.lensProfile?.replacementCycle == .daily)
        #expect(lensProduct.lensProfile?.baseCurveMm == nil)

        // 单盒度数不可含双度数分隔符或内部空格
        for invalid in ["-2.50/-3.00", "-2.50,-3.00", "-2.50，-3.00", "-2.50;-3.00", "-2.50|-3.00", "-2.50 -3.00"] {
            #expect(throws: DomainError.invalidLensPowerFormat(invalid)) {
                _ = try ProductItem(
                    id: "bad_box",
                    productId: "p_lens",
                    lensEyeSide: .left,
                    lensPower: invalid
                )
            }
        }

        let leftBox = try ProductItem(
            id: "box_l",
            productId: "p_lens",
            lifecycleStatus: .inUse,
            remainingPercent: 80,
            packagingExpDate: try PureDate(isoString: "2028-01-01"),
            lensEyeSide: .left,
            lensPower: " -2.50 "
        )
        let rightBox = try ProductItem(
            id: "box_r",
            productId: "p_lens",
            lifecycleStatus: .unopened,
            remainingPercent: 100,
            packagingExpDate: try PureDate(isoString: "2028-01-01"),
            lensEyeSide: .right,
            lensPower: "-3.00"
        )
        let finishedBox = try ProductItem(
            id: "box_done",
            productId: "p_lens",
            lifecycleStatus: .finished,
            remainingPercent: 0,
            lensEyeSide: .left,
            lensPower: "-2.50"
        )

        #expect(leftBox.lensPower == "-2.50")
        #expect(LensConstraintValidator.canShareSameBoxProfile(leftBox, rightBox) == false)

        let pairing = LensConstraintValidator.summarizePairing(boxes: [leftBox, rightBox, finishedBox])
        #expect(pairing.leftBoxes.map(\.id) == ["box_l"])
        #expect(pairing.rightBoxes.map(\.id) == ["box_r"])
        #expect(pairing.hasDistinctLeftRightPair == true)
    }
}
