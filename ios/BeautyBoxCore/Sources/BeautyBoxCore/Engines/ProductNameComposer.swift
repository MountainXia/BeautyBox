import Foundation

/// 产品保存时名称解析结果（M1 `is_custom_name` 保护机制）。
public struct NameResolutionResult: Equatable, Hashable, Sendable {
    public let name: String
    public let isCustomName: Bool
    public let suggestedName: String
    /// 当 `isCustomName == true` 且最新主档建议名与当前保存名不同，提示 UI 可显示“按当前品牌与品类更新名称”。
    public let hasSuggestedUpdateAvailable: Bool
}

/// 产品自动建议名称与 `is_custom_name` 保护规则引擎（M1）。
///
/// 规则边界：
/// - 建议名公式：`[品牌名] + [叶子分类名称] + [可选色号]`；
/// - 严禁拼接规格值（M5）与件数；
/// - 仅通过显式 `isCustomName` 标志位区分手动改名与自动同步，严禁通过前缀对比猜测；
/// - 备份/恢复场景调用 `restorePreservedName` 原样回填，禁止触发重算。
public enum ProductNameComposer {
    public static let fallbackUnnamedProduct = "未命名产品"

    /// 按 `[品牌名] + [最细分类名称] + [可选色号]` 生成自动建议名，跳过空白项并消除重复空白与相邻重复词。
    public static func composeSuggestedName(
        brandName: String?,
        leafCategoryName: String?,
        shade: String?
    ) -> String {
        let rawTokens = [brandName, leafCategoryName, shade].compactMap { token -> String? in
            guard let raw = token else { return nil }
            let collapsed = collapseWhitespace(raw)
            return collapsed.isEmpty ? nil : collapsed
        }

        var deduped: [String] = []
        for token in rawTokens {
            if let last = deduped.last, last.caseInsensitiveCompare(token) == .orderedSame {
                continue
            }
            deduped.append(token)
        }

        return deduped.isEmpty ? fallbackUnnamedProduct : deduped.joined(separator: " ")
    }

    /// 新建或编辑保存产品主档时，按 M1 保护机制决定最终 `name` 与 `isCustomName`。
    public static func resolveForSave(
        existingName: String? = nil,
        existingIsCustomName: Bool = false,
        editedNameInput: String? = nil,
        brandName: String?,
        leafCategoryName: String?,
        shade: String?
    ) -> NameResolutionResult {
        let suggested = composeSuggestedName(
            brandName: brandName,
            leafCategoryName: leafCategoryName,
            shade: shade
        )

        if let rawInput = editedNameInput {
            let cleanInput = collapseWhitespace(rawInput)
            if cleanInput.isEmpty {
                return NameResolutionResult(
                    name: suggested,
                    isCustomName: false,
                    suggestedName: suggested,
                    hasSuggestedUpdateAvailable: false
                )
            }
            if cleanInput == suggested && !existingIsCustomName {
                return NameResolutionResult(
                    name: suggested,
                    isCustomName: false,
                    suggestedName: suggested,
                    hasSuggestedUpdateAvailable: false
                )
            }
            if let prev = existingName, cleanInput == collapseWhitespace(prev), existingIsCustomName {
                return NameResolutionResult(
                    name: prev,
                    isCustomName: true,
                    suggestedName: suggested,
                    hasSuggestedUpdateAvailable: suggested != prev
                )
            }
            let isCustom = cleanInput != suggested
            return NameResolutionResult(
                name: cleanInput,
                isCustomName: isCustom,
                suggestedName: suggested,
                hasSuggestedUpdateAvailable: isCustom && suggested != cleanInput
            )
        }

        // 未触碰名称输入（例如在编辑页只修改了品牌、分类或色号）
        if existingIsCustomName, let prev = existingName, !collapseWhitespace(prev).isEmpty {
            return NameResolutionResult(
                name: prev,
                isCustomName: true,
                suggestedName: suggested,
                hasSuggestedUpdateAvailable: suggested != prev
            )
        }

        return NameResolutionResult(
            name: suggested,
            isCustomName: false,
            suggestedName: suggested,
            hasSuggestedUpdateAvailable: false
        )
    }

    /// 用户主动点击辅助按钮“按当前品牌与品类更新名称”时，显式刷新名称并恢复自动联动状态。
    public static func applyExplicitRefresh(
        brandName: String?,
        leafCategoryName: String?,
        shade: String?
    ) -> NameResolutionResult {
        let suggested = composeSuggestedName(
            brandName: brandName,
            leafCategoryName: leafCategoryName,
            shade: shade
        )
        return NameResolutionResult(
            name: suggested,
            isCustomName: false,
            suggestedName: suggested,
            hasSuggestedUpdateAvailable: false
        )
    }

    /// 备份恢复或历史记录迁移透传：严格原样保留 `name` 与 `isCustomName`，严禁重算覆盖。
    public static func restorePreservedName(
        savedName: String,
        savedIsCustomName: Bool,
        brandName: String?,
        leafCategoryName: String?,
        shade: String?
    ) -> NameResolutionResult {
        let suggested = composeSuggestedName(
            brandName: brandName,
            leafCategoryName: leafCategoryName,
            shade: shade
        )
        return NameResolutionResult(
            name: savedName,
            isCustomName: savedIsCustomName,
            suggestedName: suggested,
            hasSuggestedUpdateAvailable: savedIsCustomName && suggested != savedName
        )
    }

    private static func collapseWhitespace(_ raw: String) -> String {
        raw.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }
}
