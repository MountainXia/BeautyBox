# ADR-0002：妆匣 BeautyBox V3.1 产品规则基线冻结决策（M1～M10）

- **状态**：**V3.1 正式冻结基线**（`UD-01`～`UD-04` 全部已由用户确认，M1～M10 已最终校准收口，**已具备启动 `SQLite Schema V1` 全部条件**）
- **版本**：V3.1-Frozen（2026-11-27 最终校准冻结，基于 2026-11-26 收口版升级）
- **关联架构基线**：[ADR-0001](file:///home/xianggujiang/projects/BeautyBox/docs/adr/0001-architecture-decisions.md)（保持历史正文完整，含第十节 V3.1 适用边界说明）
- **配套规范文档**：
  - [BeautyBox_产品需求规格说明书_V3.0.md](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_产品需求规格说明书_V3.0.md)（V3.1 冻结同步版）
  - [BeautyBox_SQLite数据库设计前置清单.md](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_SQLite数据库设计前置清单.md)（SQLite Schema V1 准入就绪）
  - [BeautyBox_当前待办与决策清单.md](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_当前待办与决策清单.md)
  - [BeautyBox_新版开发路线图_V3.0.md](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_新版开发路线图_V3.0.md)
  - [TASK02.1-原型收尾与冻结验收清单.md](file:///home/xianggujiang/projects/BeautyBox/docs/testing/TASK02.1-原型收尾与冻结验收清单.md)
- **决策来源依据**：`AGENTS.md`、V2.0 原始四份 `.docx` 文档、`测试情况.docx` 用户实测反馈、`prototype/` 冻结源码（`f6752ac` / `v0.2-task02.1-frozen`）及用户 `UD-01`～`UD-04` 最终确认拍板。

---

## 一、决策状态口径与继承的「已确认」原则

### 1.1 状态标签定义（全文严格统一）
- **`已确认`**：用户已明确表达或亲自拍板的产品原则与业务规则（含本次确认的 `UD-01`～`UD-04`）。
- **`推荐定稿`**：AI 基于业务合理性、iOS 用户体验与数据可靠性落地的默认执行准则，已随 V3.1 基线统一冻结生效。
- **`暂缓`**：明确推迟至 V1.1 / V2 的增强能力，不进入 V1 范围与 SQLite 首版强制开发。
- **`已废弃`**：已被新方案明确取代的旧枚举或旧规则（同时给出历史数据迁移路径，禁止静默丢失）。

*(说明：`UD-01`～`UD-04` 已全部升级为 `已确认`，本基线已无悬而未决的用户决策项。)*

### 1.2 必须继承与本轮新确认的基线原则（100% 锁定）
1. **产品体验原则（`已确认`）**：**「简单为主，精细可选」**——默认以产品为中心展示名称、拥有总件数与聚合状态；需要时展开管理单瓶/单盒实例明细；底层严格区分 `Product` 与 `ProductItem`，前端不对普通用户暴露「持有实例」等技术词；不强迫用户填满专业属性才能保存产品；不做复杂电商仓储 ERP。
2. **数据、隐私与商业化底线（`已确认`）**：默认纯本地、无账号/注册/登录（严禁 `users`、`auth`、`owner_id`、RLS）；资料与照片默认存 iPhone App 私有沙盒；核心功能 100% 离线可用；iCloud 备份默认关闭由用户主动开启且与实时同步区分；分享由用户主动触发并采用字段白名单；**数据备份、恢复、导出对所有用户永久免费开放**，会员到期不得锁定、隐藏或删除已有数据。
3. **TASK02.1 原型冻结原则（`已确认`）**：浏览器原型已随提交 `f6752ac` 与标签 `v0.2-task02.1-frozen` 正式冻结，不得重开、不得改写冻结原型代码；原型完成不等于原生 iOS 完成。
4. **M7 妆容四项评分原则（`已确认`）**：整体满意度（`self_rating`）、妆容协调度（`coordination_rating`）、色彩表现（`color_rating`）、持妆表现（`wear_rating`）**全部选填**；允许 0～4 项任意填写；未评分存储真 `NULL`，**严禁存为 `0` 分，严禁计入均分分母**。
5. **M4 美瞳独立一级分类与三级树冻结（`已确认 UD-01`）**：**「美瞳」保持独立一级分类**；经过对合并项（护足霜/颈霜、底油亮油/指缘油、定型喷雾/发蜡/弹力素等）、名称归属（爽肤水/保湿水）与单子级防膨胀校准后的 **9 一级 + 45 二级 + 93 三级（共 147 节点）** 完整分类树与五类迁移映射正式冻结为 V1 字典。
6. **M10 美瞳单盒粒度与共享主档模型（`已确认 UD-02`）**：同款同系列美瞳共用 `Product`；不同度数不拆成不同 `Product`；**每个 `ProductItem` 严格代表一盒独立包装实物**，单盒仅记录自己的单一 `lens_power` 与 `lens_eye_side`（左眼 / 右眼 / 双眼同度通用 / 未指定），不要求必填专业参数；不同度数、批次、包装严禁错误合并；左右眼成对匹配由 UI/上层关系展示实现。
7. **M3 7 天本地回收站与引用安全机制（`已确认 UD-03`）**：正式启用 7 天本地回收站，明确区分直接删除与父级连带删除、支持原 UUID 恢复且不自动并款、保护历史妆容快照、7 天期满与主动提前彻底删除均按安全事务顺序执行、照片仅在跨全表有效引用归零后物理删图。
8. **M8 首页多币种展示与独立存储（`已确认 UD-04`）**：首页弱化展示用户选择的主币种金额，其余币种收敛至多币种明细入口；不做无授权汇率换算，底层始终按原币种整数独立存储。
9. **M6 有效期不臆测与双约束（`已确认`）**：不得按类别猜测未开封保质期或 PAO；已开封后若同时存在未开封截止日与开封+PAO，系统推算取 **`min(未开封截止日, 开封日期 + PAO)`**。

---

## 二、M1～M10 全局决策状态总览（全部完成收口冻结）

| 编号 | 主题模块 | 总体状态 | 核心定稿结论 | 确认与校准落点 |
| --- | --- | --- | --- | --- |
| **M1** | 产品名称规则 | **`推荐定稿`（冻结生效）** | 显式 `is_custom_name` 标记位；建议名=`品牌 + 叶子品类 (+ 色号)` 去重拼接；规格与数量不拼入名称 | 保留既有用户命名与恢复一致性 |
| **M2** | 生命周期状态定义 | **`推荐定稿`（冻结生效）** | 双正交维度：`lifecycle_status` (`unrecorded/unopened/in_use/finished`) × `expiry_status`；`idle` 废弃并按证据分支迁移 | **`idle` 校准**：有开封/使用证据迁 `in_use`，无证据迁 `unrecorded` 待人工核对并留日志 |
| **M3** | 删除与回收站机制 | **`已确认 UD-03`** | 正式启用 7 天本地回收站（含 `trash_scope`/`deleted_by_parent_id` 批次元数据、UUID 恢复、安全彻删、引用归零清图及异常兜底） | **不再仅靠单列 `deleted_at` 设计** |
| **M4** | 完整三级产品分类体系 | **`已确认 UD-01`** | **9 一级 + 45 二级 + 93 三级**（共 147 节点，含 29 个可直选二级）正式冻结；`replacement_cycle_code` 为美瞳周期唯一事实来源；五类精确迁移映射 | 已拆正错误合并项、砍除 1 子级冗余节点、修定名称 |
| **M5** | 产品规格与拥有数量 | **`推荐定稿`（冻结生效）** | 规格（`ml/g/片/支/枚/其他`）归 `Product`；数量=未删未用完 `ProductItem` 实时件数；减量禁静默删有记录实物 | 继承 `Product`/`ProductItem` 分离原则 |
| **M6** | 日期与有效期规则 | **`已确认` + `推荐定稿`** | 7 类日期口径 + **4 层到期日来源**隔离；`min()` 双算规则；美妆工具豁免；美瞳包装 EXP 与更换周期分离 | `min()` 与不猜测=`已确认` |
| **M7** | 妆容记录体系 | **`已确认` + `推荐定稿`** | **四项评分全选填 (`已确认`)**；推荐 `1～5` 整数星级、风格/场景单选预设+手填（多标签用 `tags`）、编辑保留原图与快照 | 四项评分全选填=`已确认` |
| **M8** | 货币与资产统计体系 | **`已确认 UD-04`** | 默认 `CNY`；`purchase_price_minor + currency_code`；首页弱化展示自选主币种，其余币种入明细；禁 `Float` 与伪汇率 | `UD-04` 已确认（具体 UI 细节可随迭代，不阻塞 SQLite） |
| **M9** | 生命周期转换与重置 | **`推荐定稿`（冻结生效）** | 完整 9 组状态转换表 + 详情页独立「重置为未记录」入口（精准清除状态/开封/确认/推算，保留生产期与历史） | 同步收录 `idle` 历史数据兼容分支处理表 |
| **M10** | 通用字段与专属属性 | **`已确认 UD-02` + `推荐定稿`** | 混合分层模型（拒绝 EAV）；**美瞳单盒 `ProductItem` 只记单一度数 `lens_power` 与 `lens_eye_side`**，不同盒禁合并 | 已移除 `ProductItem` 双眼并行度数错误设计 |

---

## 三、M1～M10 逐项详细规则设计

### M1：产品名称规则（状态：`推荐定稿`）
1. **核心机制（`is_custom_name` 显式标志位）**：
   - `products.is_custom_name`（`INTEGER NOT NULL DEFAULT 0 CHECK (is_custom_name IN (0, 1))`）。
   - **严禁通过字符串前缀/正则对比猜用户是否修改过名称**（历史品牌改名或输入法空格会导致误覆盖）。
2. **自动建议名称生成规则**：
   - 当用户新建产品或保持 `is_custom_name = 0` 时，建议名公式为：
     `[品牌名] + [最细分类名称（叶子节点，如粉底液/口红）] + [可选色号]`（自动去重连续空格；若品牌/色号未填则跳过该段；若产品名字段留空但已选品牌或分类，自动填充该建议名，避免用户在已填 `Zelens` + `粉底液` 时被迫重复键入相同名称，回应 `测试情况.docx` 反馈）。
   - 例：品牌 `Zelens` + 三级分类 `粉底液` + 色号 `Youth #Cameo` → `Zelens 粉底液 Youth #Cameo`。
3. **手动改名保护与修改品牌/分类/色号行为**：
   - 用户一旦在名称输入框主动编辑改写成非自动同步结果并保存，立即设 `is_custom_name = 1`。
   - 当 `is_custom_name = 1` 时，后续用户变更品牌、分类或色号，**系统绝不自动改写 `products.name`**；编辑页仅在检测到主档信息变化时，提供温和的辅助按钮「按当前品牌与品类更新名称」（用户点击才覆盖并重置或保留标记）。
   - 当 `is_custom_name = 0` 时，修改品牌/分类/色号可在编辑页即时联动更新建议名称。
4. **导入、备份恢复与历史编辑一致性**：
   - JSON/备份包导出与恢复时，全量序列化并原样写回 `name` 与 `is_custom_name`，恢复逻辑**严禁触发重算名称**，保证用户多年历史命名与妆容快照对比一致。
5. **与规格/数量（M5）的边界**：
   - 产品规格（`30ml`）与拥有数量（`2瓶`）**均不自动拼接到 `products.name` 内部**，防止改了数量或补全容量后破坏产品名称及历史关联显示。

---

### M2：生命周期状态定义与旧枚举兼容（状态：`推荐定稿`）
1. **双正交状态维度**：
   - **生命周期状态 `lifecycle_status`**（人为主动的使用阶段）：
     - `unrecorded`（未记录）：仅建档未录入开封/使用信息时的默认态，**禁止出现在状态快捷切换条中**，仅新建默认值或通过「重置为未记录」进入。
     - `unopened`（未开封）：明确尚未开封启用的囤货/全新状态。
     - `in_use`（使用中）：已开封启用、正在消耗。
     - `finished`（已用完）：已消耗完毕，自动保留在「已用完记录」中可供复盘（计入历史消费总账，不计入「当前持有活跃件数」）。
   - **有效期状态 `expiry_status`**（由日期引擎实时推导，不手工直接修改）：
     - `normal`（正常）：`effective_expiry_date - today > expiring_threshold_days`（默认 30 天，可配置）。
     - `expiring_soon`（即将到期）：`0 <= effective_expiry_date - today <= expiring_threshold_days`。
     - `expired`（已过期）：`effective_expiry_date < today`。
     - `unknown`（无法判断）：未确认且无法凭有效输入参数计算到期日；若所属分类为 `expiry_management_mode = 'optional'`（如大部分美妆工具）且未填任何日期，UI 渲染为「无需效期管理」而非报错感「无法判断」。
2. **双维度组合规则与展示优先级**：
   - **`unopened`（未开封）与 `expired`（已过期）允许并存**：只要当前日期超过未开封包装到期日，哪怕从未开封，仍必须明确告警「未开封 · 已过期」。
   - **默认状态**：新建单件在未填写任何日期参数时默认为 `unrecorded`；若用户在新增时填写了开封日期且未勾选已用完，自动置 `in_use`；若明确选择未开封或仅填生产/包装期则按用户所选（默认 `unopened` 或 `unrecorded`）。
   - **前端展示优先级**：列表角标按 `finished`（灰标已用完） > `expired`（红标已过期） > `expiring_soon`（橙标临期） > 正常态优先级显示主提醒；并在详情与状态标签中并列可读出「使用中 · 即将到期」或「未开封 · 已过期」。
3. **旧版 `idle`（闲置）枚举处置与按证据分流兼容方案（校准定稿）**：
   - **`idle` 正式状态：`已废弃`**（不再作为核心 `lifecycle_status` 取值，避免“既不算未开封、又和暂放不用中的使用中重叠”造成的筛选歧义）。
   - **严禁无条件迁移至 `in_use`**（依据对 `prototype/js/seedData.js:325` 与 `prototype/js/expiry.js:314` 的代码审查，`idle` 历史数据存在“开封后暂放”与“完全无开封/使用信息”两种情形），必须按以下确定性证据规则分流处理：
     1. **分支 A（有明确已开封或实际使用证据 → 迁移至 `in_use`）**：满足任一条件：`opened_date IS NOT NULL` OR `pao_months IS NOT NULL` OR (`remaining_percent IS NOT NULL AND remaining_percent < 100`) OR `last_used_at IS NOT NULL` OR 存在关联的 `look_product_items` / `product_usage_logs` 历史记录。迁移写入 `lifecycle_status = 'in_use'`，并在 `lifecycle_note` 追加 `"[迁移日志] 原状态：idle（依据开封/使用证据迁至使用中）"`。
     2. **分支 B（无开封及使用证据、无法确认含义 → 迁移至 `unrecorded` 并列入人工核对清单）**：满足 `opened_date IS NULL` AND `pao_months IS NULL` AND (`remaining_percent IS NULL OR remaining_percent = 100`) AND `last_used_at IS NULL` AND 无历史妆容/使用流水。此时无法判断是“未开封囤货闲置”还是“漏记开封日”，统一迁至 `lifecycle_status = 'unrecorded'` 并打标 `migration_review_status = 'pending_idle_review'`，在 UI 待确认清单/详情顶部引导用户一键确认转为「未开封」或「使用中」。
     3. **分支 C（迁移留痕保护）**：迁移器必须写入 `migration_legacy_status = 'idle'`（及迁移时间戳与命中分支 A/B），绝不静默丢弃原始状态；SQLite `CHECK` 严格限定为 `('unrecorded', 'unopened', 'in_use', 'finished')`。

---

### M3：7 天本地回收站与删除恢复完整设计（状态：**`已确认 UD-03`**）
> **正式拍板结论**：确认全产品线统一启用 **7 天本地软删除回收站**，**不再仅通过各表孤立添加 `deleted_at` 实现**，而是构建包含删除作用域、父子联动、安全彻删事务与跨全表引用计数清图的完整生命周期机制：

1. **删除作用域明确（Product / ProductItem / Look）**：
   - **单删实物（`ProductItem`）**：仅该件实物进入回收站（`trash_scope = 'direct'`, `deleted_by_parent_id = NULL`）；同 `Product` 下其他活跃实物及 `Product` 主档保持正常可见（若为最后一件，主档保留为 0 件档案）。
   - **删整款产品（`Product`）**：整款 `Product`（`trash_scope = 'direct'`）连同其名下**当时尚未在回收站中**的活跃 `ProductItem`（标记 `trash_scope = 'cascade_with_product'`, `deleted_by_parent_id = product.id`, 共享同一 `delete_batch_id` 与 `trash_expires_at`）一并进入回收站。二次确认弹窗明确提示：“将同时移入 X 件持有实物，已关联的历史妆容快照依然保留”。
   - **删除妆容（`Look`）**：`Look` 主记录进入回收站（`trash_scope = 'direct'`）；其 `look_photos`、`look_product_items`、`wear_reviews` 在 7 天期内完整保留不触发删图。
2. **删父级时子级隔离与恢复精确规则（防误复活陷阱）**：
   - 若用户先单删「第 1 瓶」（`direct`），随后又删「整款产品」（连带隐藏「第 2 瓶」，`cascade_with_product`）：
     - 回收站主列表**仅展示顶层删除对象**（整款产品 / 单删实物 / 妆容），不把被连带的子瓶铺满回收站刷屏；
     - **恢复整款产品时**：只一并恢复 `deleted_by_parent_id == product.id AND delete_batch_id == product.delete_batch_id` 的「第 2 瓶」，**绝不误把此前单独删除的「第 1 瓶」死而复生**！
3. **支持原 UUID 恢复且绝不自动合并**：
   - 恢复时完整保留原 `Product.id` / `ProductItem.id` / `Look.id` UUID；
   - 即便用户在删除后又新建了同名同品牌同色号新产品，恢复旧产品后仍保持独立两条主档，**严禁自动合并**，防止混淆批次、日期与历史妆容快照。
4. **删除期间保留历史妆容快照**：
   - 产品或单瓶在回收站 7 天内，所有历史妆容照常读取 `look_product_items` 快照字段（`product_name_snapshot`、`brand_name_snapshot`、`shade_snapshot`、`category_snapshot`、`spec_snapshot`），详情展示不受影响。
5. **7 天期满与用户主动提前「彻底删除」执行管线**：
   - 支持回收站单条「彻底删除」与顶部「清空回收站」（强制不可逆高危二次确认弹窗）；App 启动及回前台时扫描 `trash_expires_at <= now` 的过期项执行同管线：
   - **单事务安全删除顺序（严格遵守 `ADR-0001` 外键约束，防 FK 报错）**：
     - 彻删 `ProductItem`：先确认 `look_product_items` / `routine_step_products` / `routine_log_items` 已写满快照 → 由 SQLite `ON DELETE SET NULL` 自动置空 `product_item_id` → **显式清理或归档其 `product_usage_logs`（因 `product_usage_logs.product_item_id` 为 `ON DELETE RESTRICT`，必须在删 `product_item` 前于同一事务先处理完毕）** → 物理 `DELETE FROM product_items`。
     - 彻删 `Product`：先按上步依次彻删其全部所属 `product_items` → 采集待核查 `asset_id` 并删除 `product_photos` → 删除 `product_lens_profiles`（如有）→ 物理 `DELETE FROM products`。
     - 彻删 `Look`：采集待核查 `asset_id` → 同事务依次删 `wear_reviews`、`look_photos`、`look_product_items` → 物理 `DELETE FROM looks`。
6. **照片仅在跨全表有效引用全部归零后才物理删图**：
   - **回收站 7 天期内存绝对禁止物理删除沙盒图片文件**；
   - 仅当彻底删除事务成功 `COMMIT` 后，`MediaStore` 对采集到的 `asset_id` 执行全库引用总计：检查 `product_photos`、`look_photos`、`wear_reviews`、`skin_diary_photos` 与 `looks.cover_asset_id` 中有效剩余行数。**只有全部引用总数 = 0 时才删除 `media_assets` 行及沙盒原图/缩略图**；只要仍有任意记录（含回收站未到期对象）引用即继续保留！
7. **异常与边界恢复兜底**：
   - **子瓶先于父级被单删，或父级已被彻删后试图单恢复子瓶**：若 `ProductItem` 所属 `Product` 仍在回收站，恢复该单件时提示“所属产品也在回收站”，确认后**连同恢复父 `Product` + 仅该件实物**（绝不复活其余已删子件）；若父 `Product` 已永久物理销毁，**禁止产生无父孤儿实物**，明确提示无法恢复并允许清理该条残留。
   - **分类停用兼容**：所属 `categories` 行已软废弃（`is_active = 0`）仍可正常恢复（因受 `ON DELETE RESTRICT` 保护），详情展示原分类名及迁移导向提示。
   - **沙盒媒体文件意外缺失**：不阻塞记录主体恢复，UI 兜底占位图并标注图片已丢失。
   - **清理过程闪退中断**：依赖 SQLite 单事务原子回滚保障 DB 一致性；App 启动执行轻量 `MediaStore` 孤儿文件对账（清掉 DB 已无记录但磁盘残留的废图）。

---

### M4：完整三级产品分类体系与旧版迁移映射（状态：**`已确认 UD-01`，V1 分类树与迁移字典正式冻结**）

#### 5.4.1 分类树结构与校准规则
- 采用自引用父子树：`categories(id, code UNIQUE, parent_id FK RESTRICT, level CHECK >= 1, name, definition, examples_text, default_unit, allow_direct_product, expiry_management_mode, has_specialty_attrs, specialty_group_code, is_system, sort_order, is_active, deprecated_by_code)`。
- **不将树深度死锁在三层**：数据库通过 `parent_id + level` 支持未来深度扩展；V1 预设为规范三级树，已针对合并混杂项、名称语义与冗余单子级完成最终校准。
- **二级分类能否作为最终选择节点（`allow_direct_product` 精确原则）**：
  1. **全部 L1 一级节点（9 个）**：`allow_direct_product = 0`（任何产品必须至少选到二级节点，防止全堆到一级下失去分类统计价值）。
  2. **无三级子节点的末端 L2（共 12 个）**：`allow_direct_product = 1`（如 `香氛喷雾`、`香膏`、`身体防晒`、`发膜`、`卸甲产品`、`收纳工具`、`彩色美瞳镜片`、`美瞳护理与伴侣盒` 等，不强迫凑出冗余同名 L3）。
  3. **有 L3 但日常允许粗选的 L2（便捷直选二级）**：如 `腮红`、`修容`、`高光`、`香水`、`身体乳`、`洗发`、`护发`、`造型`、`美甲工具`、`化妆刷`、`美妆蛋与粉扑`、`睫毛夹`、`其他*`（用户懒得区分粉状/膏状或具体刷型时，可直接选至该二级，提高录入效率）；而内部分化极大、名称高度依赖具体形态的二级（如 `底妆`、`遮瑕`、`定妆`、`唇部产品`、`眼部产品`、`清洁`、`爽肤水/保湿水`、`精华`、`乳液面霜`、`防晒`、`面膜`、`眼部护理`、`指甲油`）设 `allow_direct_product = 0`，强制选择三级具体品类（如 `粉底液`/`口红`/`面霜`）。
- **美瞳更换周期单一事实来源（`已确认`）**：
  - 「日抛 / 双周抛 / 月抛 / 季抛 / 半年抛 / 年抛 / 其他周期」是结构化属性 **`replacement_cycle_code`**，非物理品类节点。`L1_LENS` 下在 `categories` 只保留 3 个客观品类二级节点，界面周期筛选与分组完全从 `replacement_cycle_code` 动态生成，杜绝分类与属性打架。

#### 5.4.2 最终校准冻结的三级分类全表（9 一级 / 45 二级 / 93 三级 / 共 147 节点）

> 校准修订说明：① 拆开误合并品类：`护足霜/颈霜` 拆为 **`护足霜` + `颈霜`**；`底油/亮油/指缘油` 拆为 **`底油/亮油/封层`（归指甲油）+ `指缘油/护甲精华`（归其他美甲护理）**；`定型喷雾/发蜡/弹力素` 拆为 **`定型喷雾/蓬松喷雾` + `发蜡/发泥` + `弹力素/护卷造型乳`**；`指甲剪/挫条/光疗灯` 拆为 **`指甲剪/死皮剪/搓条` + `美甲光疗灯`**；`化妆棉/棉签/吸油纸` 拆为 **`化妆棉/棉签` + `吸油面纸`**。② 修正名称：`保湿水类` 规范为 **`爽肤水/保湿水`**。③ 消除强行细分：移除只为凑数的同名 1 子级三级节点（`身体/发香喷雾`、`固体香膏`、`身体防晒乳/喷雾`、`卸甲水/卸甲巾`）。

##### 1. `L1_MAKEUP` 彩妆（10 个二级 / 34 个三级）
| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与典型产品示例 | 易混淆归属与历史映射 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_MAKEUP` | L1 | 彩妆 | `NULL` | 件 | 0 | `makeup` | 面部、眼唇眉修饰润色化妆品 | 含历史 `cat-base/lip/eye/cheek/brow` |
| `L2_MK_BASE` | L2 | 底妆 | `L1_MAKEUP` | 瓶 | 0 | `makeup` | 均匀肤色与打底类的基础面部妆品 | 不含无润色纯护肤防晒 |
| `L3_MK_BASE_FOUNDATION` | L3 | 粉底液 | `L2_MK_BASE` | 瓶 | 1 | `makeup` | 液体状面部粉底（如雅诗兰黛 DW、Zelens） | 历史 `sub-foundation`/`c1-sub-foundation` |
| `L3_MK_BASE_CREAM` | L3 | 粉底膏/粉底霜 | `L2_MK_BASE` | 盒 | 1 | `makeup` | 膏状/霜状高遮瑕底妆（如 SUQQU 粉霜、Covermark） | 历史 `sub-cream-found`/`c1-sub-cream-found` |
| `L3_MK_BASE_CUSHION` | L3 | 气垫 | `L2_MK_BASE` | 盒 | 1 | `makeup` | 海绵芯便携粉底/BB（如 YSL、兰蔻气垫） | 历史 `sub-cushion`/`c1-sub-cushion` |
| `L3_MK_BASE_PRIMER` | L3 | 妆前乳 | `L2_MK_BASE` | 支 | 1 | `makeup` | 彩妆前平滑毛孔/控油/提亮打底 | 历史 `sub-primer`/`c1-sub-primer` |
| `L3_MK_BASE_SUNBASE` | L3 | 隔离霜 | `L2_MK_BASE` | 支 | 1 | `makeup` | 润色修颜妆前隔离（如 CPB 长管隔离） | 历史 `sub-sunbase`/`c1-sub-sunbase` |
| `L3_MK_BASE_BB_CC` | L3 | BB/CC霜/素颜霜 | `L2_MK_BASE` | 支 | 1 | `makeup` | 轻底妆或带润色粉体需卸妆的素颜霜 | 无润色纯保湿日霜归 `L3_SK_EC_CREAM` |
| `L2_MK_CONCEALER` | L2 | 遮瑕 | `L1_MAKEUP` | 支 | 0 | `makeup` | 局部瑕疵、黑眼圈、痘印修饰产品 | 独立自原底妆 |
| `L3_MK_CONCEALER_LIQUID` | L3 | 遮瑕液 | `L2_MK_CONCEALER` | 支 | 1 | `makeup` | 刷头液体遮瑕（如 NARS 遮瑕蜜） | 历史 `sub-concealer` 默认映射目标 |
| `L3_MK_CONCEALER_CREAM` | L3 | 遮瑕膏/遮瑕盘 | `L2_MK_CONCEALER` | 盘 | 1 | `makeup` | 罐装膏体或多色遮瑕盘（如 IPSA 三色） | — |
| `L3_MK_CONCEALER_PENCIL` | L3 | 遮瑕笔/遮瑕棒 | `L2_MK_CONCEALER` | 支 | 1 | `makeup` | 笔状/棒状点涂遮瑕 | — |
| `L2_MK_SETTING` | L2 | 定妆 | `L1_MAKEUP` | 盒 | 0 | `makeup` | 控油、柔焦并固定妆面的产品 | 从原底妆粉类独立 |
| `L3_MK_SETTING_LOOSE` | L3 | 散粉/蜜粉 | `L2_MK_SETTING` | 盒 | 1 | `makeup` | 散粉状定妆粉（如纪梵希四宫格） | 历史 `sub-loose-powder`/`c1-sub-loose-powder` |
| `L3_MK_SETTING_PRESSED` | L3 | 粉饼/蜜粉饼 | `L2_MK_SETTING` | 盒 | 1 | `makeup` | 压盘便携补妆/定妆粉饼（如 E大饼） | 历史 `sub-pressed-powder`/`c1-sub-pressed-powder` |
| `L3_MK_SETTING_SPRAY` | L3 | 定妆喷雾 | `L2_MK_SETTING` | 瓶 | 1 | `makeup` | 成膜锁妆喷雾（如 UD、柏瑞美） | 补水舒缓喷雾归 `L3_SK_TN_MIST` |
| `L2_MK_LIP` | L2 | 唇部产品 | `L1_MAKEUP` | 支 | 0 | `makeup` | 唇部色彩修饰产品 | 无色护唇归 `L3_SK_OT_LIPBALM` |
| `L3_MK_LIP_STICK` | L3 | 口红/唇膏 | `L2_MK_LIP` | 支 | 1 | `makeup` | 固体管装有色唇膏（如 MAC、TF） | 历史 `sub-lipstick`/`c1-sub-lipstick` |
| `L3_MK_LIP_GLAZE` | L3 | 唇釉 | `L2_MK_LIP` | 支 | 1 | `makeup` | 带刷头哑光/镜面唇釉 | 历史 `sub-lipglaze`/`c1-sub-lipglaze` |
| `L3_MK_LIP_GLOSS` | L3 | 唇蜜/唇油 | `L2_MK_LIP` | 支 | 1 | `makeup` | 高光泽透明或半透润色唇蜜/唇油 | 历史 `sub-lipgloss`/`c1-sub-lipgloss` |
| `L3_MK_LIP_MUD` | L3 | 唇泥 | `L2_MK_LIP` | 支 | 1 | `makeup` | 泥状丝绒哑光唇部彩妆 | — |
| `L3_MK_LIP_LINER` | L3 | 唇线笔 | `L2_MK_LIP` | 支 | 1 | `makeup` | 勾勒唇形或丰唇阴影笔 | 历史 `sub-lipliner`/`c1-sub-lipliner` |
| `L3_MK_LIP_TINTED_BALM` | L3 | 有色润唇膏 | `L2_MK_LIP` | 支 | 1 | `makeup` | 显色提气色兼润唇（如 Dior 变色唇膏） | 与无色护理润唇膏清晰区分 |
| `L2_MK_EYE` | L2 | 眼部产品 | `L1_MAKEUP` | 支 | 0 | `makeup` | 眼影、眼线、睫毛饰妆品 | — |
| `L3_MK_EYE_PALETTE` | L3 | 眼影盘/单色眼影 | `L2_MK_EYE` | 盘 | 1 | `makeup` | 粉状单色或多色眼影盘 | 历史 `sub-eyeshadow`/`c1-sub-eyeshadow` |
| `L3_MK_EYE_LIQUID` | L3 | 液体眼影/眼影棒 | `L2_MK_EYE` | 支 | 1 | `makeup` | 液体闪片、眼影蜜或眼影笔 | — |
| `L3_MK_EYE_LINER` | L3 | 眼线笔/液/胶笔 | `L2_MK_EYE` | 支 | 1 | `makeup` | 眼线液笔、眼线胶笔、眼线膏 | 历史 `sub-eyeliner`/`c1-sub-eyeliner` |
| `L3_MK_EYE_MASCARA` | L3 | 睫毛膏/打底 | `L2_MK_EYE` | 支 | 1 | `makeup` | 纤长浓密睫毛膏与睫毛打底 | 历史 `sub-mascara`/`c1-sub-mascara` |
| `L3_MK_EYE_LASHES` | L3 | 假睫毛 | `L2_MK_EYE` | 盒 | 1 | `makeup` | 分段式/整排假睫毛（单位 `盒`/`副`/`对`） | 历史 `sub-lashes`/`c1-sub-lashes` |
| `L3_MK_EYE_PRIMER` | L3 | 眼部打底 | `L2_MK_EYE` | 支 | 1 | `makeup` | 防眼影积线晕妆打底 | — |
| `L2_MK_BLUSH` | L2 | 腮红 | `L1_MAKEUP` | 块 | 1 | `makeup` | 面颊红润提气色彩妆（可粗选或选粉/膏） | 由原「腮红修容」拆分独立 |
| `L3_MK_BLUSH_POWDER` | L3 | 粉状腮红 | `L2_MK_BLUSH` | 块 | 1 | `makeup` | 单色/多色压粉腮红 | 历史 `sub-blush`/`c1-sub-blush` 默认目标 |
| `L3_MK_BLUSH_CREAM` | L3 | 膏状/液体腮红 | `L2_MK_BLUSH` | 支 | 1 | `makeup` | 腮红膏、腮红棒、液体腮红 | — |
| `L2_MK_CONTOUR` | L2 | 修容 | `L1_MAKEUP` | 盘 | 1 | `makeup` | 鼻影、侧影立体塑形产品 | 由原「腮红修容」拆分独立 |
| `L3_MK_CONTOUR_POWDER` | L3 | 修容粉/修容盘 | `L2_MK_CONTOUR` | 盘 | 1 | `makeup` | 双色/三色阴影粉盘 | 历史 `sub-contour`/`c1-sub-contourpowder` |
| `L3_MK_CONTOUR_STICK` | L3 | 修容棒/修容液 | `L2_MK_CONTOUR` | 支 | 1 | `makeup` | 膏体棒状或液体修容 | — |
| `L2_MK_HIGHLIGHTER` | L2 | 高光 | `L1_MAKEUP` | 块 | 1 | `makeup` | 面部提亮、哑光膨胀色或珠光高光 | 由原「腮红修容」拆分独立 |
| `L3_MK_HL_POWDER` | L3 | 高光粉/高光盘 | `L2_MK_HIGHLIGHTER` | 块 | 1 | `makeup` | 粉饼状细闪或哑光提亮粉 | 历史 `sub-highlighter`/`c1-sub-highlighter` |
| `L3_MK_HL_LIQUID` | L3 | 高光液/高光棒 | `L2_MK_HIGHLIGHTER` | 支 | 1 | `makeup` | 液体或膏棒状高光 | — |
| `L2_MK_BROW` | L2 | 眉部产品 | `L1_MAKEUP` | 支 | 0 | `makeup` | 眉毛塑形、填色与定型产品 | — |
| `L3_MK_BROW_PENCIL` | L3 | 眉笔 | `L2_MK_BROW` | 支 | 1 | `makeup` | 极细/砍刀/双头眉笔 | 历史 `sub-browpencil`/`c1-sub-browpencil` |
| `L3_MK_BROW_POWDER` | L3 | 眉粉/眉膏 | `L2_MK_BROW` | 盒 | 1 | `makeup` | 压盘眉粉与罐装眉膏 | 历史 `sub-browpowder`/`c1-sub-browpowder` |
| `L3_MK_BROW_GEL` | L3 | 染眉膏/眉胶 | `L2_MK_BROW` | 支 | 1 | `makeup` | 改变眉色或定型野生眉 | 历史 `sub-browgel`/`c1-sub-browgel` |
| `L2_MK_OTHER` | L2 | 其他彩妆 | `L1_MAKEUP` | 件 | 1 | `makeup` | 综合彩妆盘或特殊亮片彩妆兜底 | 兜底二级支持直接选入 |
| `L3_MK_OT_FACE_PALETTE` | L3 | 面部综合盘 | `L2_MK_OTHER` | 盘 | 1 | `makeup` | 腮红+修容+高光或眼颊一体综合盘 | — |

##### 2. `L1_SKINCARE` 护肤（8 个二级 / 21 个三级）
| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与典型产品示例 | 易混淆归属与历史映射 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_SKINCARE` | L1 | 护肤 | `NULL` | 瓶 | 0 | `skincare` | 面部洁净、保湿、修护及防晒护理品 | 历史 `cat-care`/`c1-cat-care` |
| `L2_SK_CLEAN` | L2 | 清洁 | `L1_SKINCARE` | 瓶 | 0 | `skincare` | 卸妆及面部表层清洁护理 | 身体沐浴露归 `L1_BODYCARE` |
| `L3_SK_CL_OIL` | L3 | 卸妆油/卸妆膏 | `L2_SK_CLEAN` | 瓶 | 1 | `skincare` | 乳化型洁颜油与卸妆膏 | — |
| `L3_SK_CL_WATER` | L3 | 卸妆水/眼唇卸 | `L2_SK_CLEAN` | 瓶 | 1 | `skincare` | 水状及水油分离眼唇卸妆 | — |
| `L3_SK_CL_WASH` | L3 | 洁面乳/啫喱/慕斯 | `L2_SK_CLEAN` | 支 | 1 | `skincare` | 氨基酸/皂基洗面奶、洁颜蜜 | — |
| `L3_SK_CL_EXFOLIATE` | L3 | 面部去角质/磨砂 | `L2_SK_CLEAN` | 支 | 1 | `skincare` | 刷酸棉片、清洁凝露、面部磨砂 | 身体磨砂归 `L3_BD_CL_SCRUB` |
| `L2_SK_TONER` | L2 | **爽肤水/保湿水** | `L1_SKINCARE` | 瓶 | 0 | `skincare` | 面部补水与二次调理水剂（校准命名，原“保湿水类”） | 乳霜保湿归 `L2_SK_EMULSION_CREAM` |
| `L3_SK_TN_TONER` | L3 | 化妆水/爽肤水 | `L2_SK_TONER` | 瓶 | 1 | `skincare` | 常规爽肤水、柔肤水、收敛水 | 历史 `sub-toner`/`c1-sub-toner` |
| `L3_SK_TN_ESSENCE_WATER` | L3 | 精华水/肌底水 | `L2_SK_TONER` | 瓶 | 1 | `skincare` | 高浓度活性精华水（如神仙水、极光水） | — |
| `L3_SK_TN_MIST` | L3 | 保湿喷雾 | `L2_SK_TONER` | 瓶 | 1 | `skincare` | 随时补水舒缓喷雾 | 成膜锁妆用归 `L3_MK_SETTING_SPRAY` |
| `L2_SK_SERUM` | L2 | 精华 | `L1_SKINCARE` | 瓶 | 0 | `skincare` | 高浓度功效型修护/抗老/美白精华 | — |
| `L3_SK_SR_ESSENCE` | L3 | 精华液/肌底液 | `L2_SK_SERUM` | 瓶 | 1 | `skincare` | 滴管或按压面部精华 | 历史 `sub-serum`/`c1-sub-serum` |
| `L3_SK_SR_AMPOULE` | L3 | 安瓶/次抛精华 | `L2_SK_SERUM` | 盒 | 1 | `skincare` | 独立支装高活性次抛/安瓶 | 规格填如 `30支` |
| `L3_SK_SR_OIL` | L3 | 护肤精华油 | `L2_SK_SERUM` | 瓶 | 1 | `skincare` | 以油养肤面部油（如双萃/兰花油） | 护发油归 `L3_HR_CD_OIL` |
| `L2_SK_EMULSION_CREAM` | L2 | 乳液面霜 | `L1_SKINCARE` | 瓶 | 0 | `skincare` | 面部锁水滋润乳与霜 | — |
| `L3_SK_EC_LOTION` | L3 | 乳液 | `L2_SK_EMULSION_CREAM` | 瓶 | 1 | `skincare` | 流动性面部乳液 | 身体乳归 `L3_BD_LT_LOTION` |
| `L3_SK_EC_CREAM` | L3 | 面霜/凝霜/晚霜 | `L2_SK_EMULSION_CREAM` | 瓶 | 1 | `skincare` | 霜状/啫喱状滋润面霜 | 历史 `sub-cream`/`c1-sub-cream` |
| `L2_SK_SUNSCREEN` | L2 | 防晒 | `L1_SKINCARE` | 支 | 0 | `skincare` | 面部光防护防晒（SPF/PA 为属性） | 大瓶身体防晒归 `L2_BD_SUNSCREEN` |
| `L3_SK_SS_LOTION` | L3 | 防晒霜/防晒乳 | `L2_SK_SUNSCREEN` | 支 | 1 | `skincare` | 面部日常/户外防晒乳 | 历史 `sub-sunscreen`/`c1-sub-sunscreen` |
| `L3_SK_SS_SPRAY_STICK` | L3 | 防晒喷雾/防晒棒 | `L2_SK_SUNSCREEN` | 支 | 1 | `skincare` | 面部补涂用喷雾或固体防晒棒 | — |
| `L2_SK_MASK` | L2 | 面膜 | `L1_SKINCARE` | 盒 | 0 | `skincare` | 集中敷贴或涂抹面部护理 | — |
| `L3_SK_MK_SHEET` | L3 | 贴片面膜 | `L2_SK_MASK` | 盒 | 1 | `skincare` | 膜布袋装片状面膜（规格如 `5片`/`10片`） | — |
| `L3_SK_MK_WASH` | L3 | 涂抹面膜/泥膜 | `L2_SK_MASK` | 罐 | 1 | `skincare` | 水洗清洁泥膜/涂抹修护面膜 | — |
| `L3_SK_MK_SLEEP` | L3 | 睡眠面膜 | `L2_SK_MASK` | 罐 | 1 | `skincare` | 夜间免洗修护面膜 | — |
| `L2_SK_EYE` | L2 | 眼部护理 | `L1_SKINCARE` | 支 | 0 | `skincare` | 眼周抗老、保湿及去肿产品 | — |
| `L3_SK_EY_CREAM` | L3 | 眼霜/眼部精华 | `L2_SK_EYE` | 支 | 1 | `skincare` | 眼周霜/精华 | — |
| `L3_SK_EY_PATCH` | L3 | 眼膜 | `L2_SK_EYE` | 盒 | 1 | `skincare` | 凝胶或膜布贴片眼膜 | — |
| `L2_SK_OTHER` | L2 | 其他护肤 | `L1_SKINCARE` | 支 | 1 | `skincare` | 护唇护理及局部点涂修护产品 | — |
| `L3_SK_OT_LIPBALM` | L3 | 润唇膏/唇膜 | `L2_SK_OTHER` | 支 | 1 | `skincare` | 无色日常润唇护理及睡眠唇膜 | 历史无色 `sub-lipbalm` 目标节点 |
| `L3_SK_OT_SPOT` | L3 | 局部点涂/痘痘贴 | `L2_SK_OTHER` | 支 | 1 | `skincare` | 祛痘膏、水杨酸点涂液、隐形痘痘贴 | — |

##### 3. `L1_FRAGRANCE` 香水香氛（4 个二级 / 2 个三级）
> 规则红线：**香型、前中后调、香精浓度（Parfum/EDP/EDT/EDC）属于专属属性，严禁拆成子分类**。同时移除了多余同义单子级（`香氛喷雾`、`香膏`、`其他香氛` 直接作为末端可直选二级）。

| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与示例 | 历史映射与边界 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_FRAGRANCE` | L1 | 香水香氛 | `NULL` | 瓶 | 0 | `fragrance` | 个人用香与随身香氛制品 | — |
| `L2_FR_PERFUME` | L2 | 香水 | `L1_FRAGRANCE` | 瓶 | 1 | `fragrance` | 酒精基底常规及便携香水 | 含全部浓度；可直选或细分喷雾/滚珠 |
| `L3_FR_PF_SPRAY` | L3 | 常规喷雾香水 | `L2_FR_PERFUME` | 瓶 | 1 | `fragrance` | 正装/Q香/试管喷雾（按规格区分容量） | — |
| `L3_FR_PF_ROLL` | L3 | 滚珠/涂抹香水 | `L2_FR_PERFUME` | 支 | 1 | `fragrance` | 滚珠/蘸取式香油或便携香 | — |
| `L2_FR_MIST` | L2 | 香氛喷雾 | `L1_FRAGRANCE` | 瓶 | 1 | `fragrance` | 末端直选二级：身体香氛喷雾、头发香雾 | 护肤保湿喷雾归 `L3_SK_TN_MIST` |
| `L2_FR_SOLID` | L2 | 香膏 | `L1_FRAGRANCE` | 盒 | 1 | `fragrance` | 末端直选二级：固体蜡基随身香膏 | 无冗余三级 |
| `L2_FR_OTHER` | L2 | 其他香氛 | `L1_FRAGRANCE` | 瓶 | 1 | `fragrance` | 末端直选二级：香薰蜡烛/无火扩香等 | — |

##### 4. `L1_BODYCARE` 身体护理（5 个二级 / 8 个三级）
| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与示例 | 边界说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_BODYCARE` | L1 | 身体护理 | `NULL` | 瓶 | 0 | `skincare` | 颈部以下全身皮肤清洁、滋润与防护 | — |
| `L2_BD_CLEAN` | L2 | 身体清洁 | `L1_BODYCARE` | 瓶 | 0 | `skincare` | 沐浴清洗与角质护理 | — |
| `L3_BD_CL_WASH` | L3 | 沐浴露/油/香皂 | `L2_BD_CLEAN` | 瓶 | 1 | `skincare` | 沐浴露、沐浴油、洁肤皂 | 面部洁面归 `L3_SK_CL_WASH` |
| `L3_BD_CL_SCRUB` | L3 | 身体磨砂膏 | `L2_BD_CLEAN` | 罐 | 1 | `skincare` | 去角质身体磨砂（如 Sabon） | — |
| `L2_BD_LOTION` | L2 | 身体乳 | `L1_BODYCARE` | 瓶 | 1 | `skincare` | 身体保湿乳霜与身体护理油 | — |
| `L3_BD_LT_LOTION` | L3 | 身体乳/身体霜 | `L2_BD_LOTION` | 瓶 | 1 | `skincare` | 果酸身体乳、舒缓身体霜 | — |
| `L3_BD_LT_OIL` | L3 | 身体护理油 | `L2_BD_LOTION` | 瓶 | 1 | `skincare` | 身体滋养/紧致按摩油 | — |
| `L2_BD_SUNSCREEN` | L2 | 身体防晒 | `L1_BODYCARE` | 瓶 | 1 | `skincare` | 末端直选二级：大容量肢体/户外身体防晒乳及喷雾 | 面部防晒归 `L2_SK_SUNSCREEN` |
| `L2_BD_CARE` | L2 | 身体局部护理 | `L1_BODYCARE` | 支 | 0 | `skincare` | 手、足、颈及体味管理专项护理 | — |
| `L3_BD_CR_HAND` | L3 | 护手霜 | `L2_BD_CARE` | 支 | 1 | `skincare` | 手部滋润霜 | — |
| `L3_BD_CR_FOOT` | L3 | **护足霜** | `L2_BD_CARE` | 支 | 1 | `skincare` | 足跟龟裂修护与足部滋润霜（从原合并项拆出） | 不可与颈霜混放 |
| `L3_BD_CR_NECK` | L3 | **颈霜** | `L2_BD_CARE` | 支 | 1 | `skincare` | 颈部及前胸细纹紧致护理霜（从原合并项拆出） | 面霜归 `L3_SK_EC_CREAM` |
| `L3_BD_CR_DEODORANT` | L3 | 止汗露/体香走珠 | `L2_BD_CARE` | 支 | 1 | `skincare` | 腋下止汗走珠、香体棒 | 专供喷洒用香归 `L1_FRAGRANCE` |
| `L2_BD_OTHER` | L2 | 其他身体护理 | `L1_BODYCARE` | 瓶 | 1 | `skincare` | 末端直选二级：私处洗液、身体膜等兜底 | — |

##### 5. `L1_HAIRCARE` 头发洗护（5 个二级 / 8 个三级）
| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与示例 | 边界说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_HAIRCARE` | L1 | 头发洗护 | `NULL` | 瓶 | 0 | `haircare` | 头皮与发丝清洁、修护及造型 | — |
| `L2_HR_SHAMPOO` | L2 | 洗发 | `L1_HAIRCARE` | 瓶 | 1 | `haircare` | 清洁发丝与头皮的产品 | — |
| `L3_HR_SH_SHAMPOO` | L3 | 洗发水/洗发膏 | `L2_HR_SHAMPOO` | 瓶 | 1 | `haircare` | 控油/蓬松/去屑洗发露与海盐膏 | — |
| `L3_HR_SH_SCALP` | L3 | 头皮磨砂/精华 | `L2_HR_SHAMPOO` | 瓶 | 1 | `haircare` | 头皮清洁磨砂膏、防脱头皮精华 | — |
| `L3_HR_SH_DRY` | L3 | 干发喷雾 | `L2_HR_SHAMPOO` | 瓶 | 1 | `haircare` | 免洗去油蓬松干发喷雾 | — |
| `L2_HR_CONDITIONER` | L2 | 护发 | `L1_HAIRCARE` | 瓶 | 1 | `haircare` | 抚平毛躁的日常润发/免洗护发品 | — |
| `L3_HR_CD_RINSE` | L3 | 护发素 | `L2_HR_CONDITIONER` | 瓶 | 1 | `haircare` | 冲洗型润发乳 | — |
| `L3_HR_CD_OIL` | L3 | 护发精油/免洗乳 | `L2_HR_CONDITIONER` | 瓶 | 1 | `haircare` | 护发精油、防热损伤喷雾、免洗护发乳 | — |
| `L2_HR_MASK` | L2 | 发膜 | `L1_HAIRCARE` | 罐 | 1 | `haircare` | 末端直选二级：深层修护发膜/倒膜 | — |
| `L2_HR_STYLING` | L2 | 造型 | `L1_HAIRCARE` | 瓶 | 1 | `haircare` | 固定发型、打造卷度或蓬松造型（已拆正喷雾/发蜡/弹力素） | 纯发香雾归 `L2_FR_MIST` |
| `L3_HR_ST_SPRAY` | L3 | **定型喷雾/蓬松喷雾** | `L2_HR_STYLING` | 瓶 | 1 | `haircare` | 液态气压或水状定型、发根蓬松喷雾 | — |
| `L3_HR_ST_WAX` | L3 | **发蜡/发泥** | `L2_HR_STYLING` | 罐 | 1 | `haircare` | 膏体哑光发泥、发蜡、造型油膏 | — |
| `L3_HR_ST_ELASTIN` | L3 | **弹力素/护卷造型乳** | `L2_HR_STYLING` | 瓶 | 1 | `haircare` | 烫卷发抗毛躁弹力素与泡沫摩丝 | — |
| `L2_HR_OTHER` | L2 | 其他头发洗护 | `L1_HAIRCARE` | 盒 | 1 | `haircare` | 末端直选二级：家用染发剂、头皮防晒等兜底 | — |

##### 6. `L1_NAILCARE` 美甲护理（4 个二级 / 7 个三级）
| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与示例 | 边界说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_NAILCARE` | L1 | 美甲护理 | `NULL` | 瓶 | 0 | `makeup` | 指甲涂饰、指缘修护及配套美甲器具 | — |
| `L2_NL_POLISH` | L2 | 指甲油 | `L1_NAILCARE` | 瓶 | 0 | `makeup` | 甲面色彩涂层与前/后置功能涂剂 | 不含甲周护肤指缘油 |
| `L3_NL_PL_REGULAR` | L3 | 普通指甲油 | `L2_NL_POLISH` | 瓶 | 1 | `makeup` | 自然风干指甲油/水性可撕拉指甲油 | — |
| `L3_NL_PL_GEL` | L3 | 甲油胶 | `L2_NL_POLISH` | 瓶 | 1 | `makeup` | 需照灯固化的光疗甲油胶（支持色号） | — |
| `L3_NL_PL_BASE_TOP` | L3 | **底油/亮油/封层** | `L2_NL_POLISH` | 瓶 | 1 | `makeup` | 美甲前置吻合剂、加钙底油与封层亮油（从指缘油拆出） | 滋润指缘皮肤归 `L3_NL_OT_CUTICLE_OIL` |
| `L2_NL_TOOL` | L2 | 美甲工具 | `L1_NAILCARE` | 套 | 1 | `tool` | 修甲器具、穿戴甲与光疗灯具 | 普通修眉镊子归 `L1_TOOLS` |
| `L3_NL_TL_CLIPPER` | L3 | **指甲剪/死皮剪/搓条** | `L2_NL_TOOL` | 把 | 1 | `tool` | 手工金属及海绵修甲工具（从光疗灯拆出，工具豁免效期） | — |
| `L3_NL_TL_LAMP` | L3 | **美甲光疗灯** | `L2_NL_TOOL` | 台 | 1 | `tool` | UV/LED 美甲固化照灯电器（工具豁免效期） | — |
| `L3_NL_TL_TIPS` | L3 | 穿戴甲/甲片 | `L2_NL_TOOL` | 盒 | 1 | `tool` | 手工穿戴甲成品盒及果冻胶（单位 `盒`/`副`） | — |
| `L2_NL_REMOVER` | L2 | 卸甲产品 | `L1_NAILCARE` | 瓶 | 1 | `tool` | 末端直选二级：洗甲水、卸甲巾、卸胶膏（需追踪效期） | — |
| `L2_NL_OTHER` | L2 | 其他美甲护理 | `L1_NAILCARE` | 件 | 1 | `tool` | 甲周护肤精华与美甲装饰耗材 | — |
| `L3_NL_OT_CUTICLE_OIL` | L3 | **指缘油/护甲精华** | `L2_NL_OTHER` | 支 | 1 | `skincare` | 甲周干燥修护油、甲床滋养精华（从指甲油涂层拆出并修正父级） | 需追踪效期（`tracked`） |

##### 7. `L1_TOOLS` 美妆工具（5 个二级 / 11 个三级）
> 规则红线：除清洗剂外，其余器具默认 `expiry_management_mode = 'optional'`，**免强制有效期、不展示刺眼「无法判断」警告**。

| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与示例 | 边界说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_TOOLS` | L1 | 美妆工具 | `NULL` | 件 | 0 | `tool` | 上妆刷扑、修容工具及梳妆收纳辅助品 | **严禁混入美瞳** |
| `L2_TL_BRUSH` | L2 | 化妆刷 | `L1_TOOLS` | 支 | 1 | `tool` | 动物毛或人造纤维上妆刷具 | — |
| `L3_TL_BR_FACE` | L3 | 面部刷 | `L2_TL_BRUSH` | 支 | 1 | `tool` | 散粉刷、粉底刷、腮红刷、修容高光刷 | — |
| `L3_TL_BR_EYE_LIP` | L3 | 眼唇与细节刷 | `L2_TL_BRUSH` | 支 | 1 | `tool` | 眼影晕染刷、遮瑕刷、眉刷、唇刷 | — |
| `L3_TL_BR_SET` | L3 | 化妆刷套装 | `L2_TL_BRUSH` | 套 | 1 | `tool` | 整套盒装/袋装多支化妆刷 | — |
| `L2_TL_SPONGE` | L2 | 美妆蛋与粉扑 | `L1_TOOLS` | 个 | 1 | `tool` | 海绵美妆蛋与干湿粉扑 | — |
| `L3_TL_SP_EGG` | L3 | 美妆蛋 | `L2_TL_SPONGE` | 个 | 1 | `tool` | 葫芦/斜切上妆美妆蛋 | — |
| `L3_TL_SP_PUFF` | L3 | 粉扑/气垫扑 | `L2_TL_SPONGE` | 盒 | 1 | `tool` | 棉花糖粉扑、气垫替换粉扑、散粉扑 | — |
| `L2_TL_CURLER` | L2 | 睫毛夹 | `L1_TOOLS` | 把 | 1 | `tool` | 卷翘睫毛辅助器械 | — |
| `L3_TL_CL_MANUAL` | L3 | 手动睫毛夹 | `L2_TL_CURLER` | 把 | 1 | `tool` | 广角/局部睫毛夹 | — |
| `L3_TL_CL_HEATED` | L3 | 电热烫睫毛器 | `L2_TL_CURLER` | 支 | 1 | `tool` | 充电加热睫毛卷翘器 | — |
| `L2_TL_OTHER` | L2 | 其他化妆工具 | `L1_TOOLS` | 件 | 1 | `tool` | 修眉剪镊、棉品耗材与洗刷液 | — |
| `L3_TL_OT_COTTON` | L3 | **化妆棉/棉签** | `L2_TL_OTHER` | 盒 | 1 | `tool` | 省水湿敷化妆棉、卸妆棉与尖头棉签（从吸油纸拆出） | — |
| `L3_TL_OT_BLOTTING` | L3 | **吸油面纸** | `L2_TL_OTHER` | 盒 | 1 | `tool` | 随身面部控油吸油纸（从化妆棉拆出） | — |
| `L3_TL_OT_IMPLEMENT` | L3 | 修眉刀/镊子/假睫毛夹 | `L2_TL_OTHER` | 把 | 1 | `tool` | 修眉刀、粉刺针、辅助佩戴假睫毛镊子 | 美瞳佩戴工具归 `L2_LN_CARE` |
| `L3_TL_OT_CLEANSER` | L3 | 刷具/粉扑清洗剂 | `L2_TL_OTHER` | 瓶 | 1 | `tool` | **液体洗刷水（特例：`expiry_management_mode = 'tracked'`）** | — |
| `L2_TL_STORAGE` | L2 | 收纳工具 | `L1_TOOLS` | 个 | 1 | `tool` | 末端直选二级：化妆包、桌面刷桶与随身镜 | — |

##### 8. `L1_LENS` 美瞳（3 个二级 / 0 独立周期三级，周期由 `replacement_cycle_code` 唯一驱动）
> **单源防冲突定稿说明**：日抛、月抛、半年抛、年抛本质为结构化更换周期属性（`replacement_cycle_code`）。`L1_LENS` 下在 `categories` 只保留 3 个客观品类二级节点（全部可末端直选），**界面按「日抛 / 双周抛 / 月抛 / 季抛 / 半年抛 / 年抛 / 其他周期」浏览筛选时，由 `product_lens_profiles.replacement_cycle_code` 动态分组与渲染！**

| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与示例 | 边界与单源规则 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_LENS` | L1 | 美瞳 | `NULL` | 盒 | 0 | `lens` | **独立一级分类**，彩色软性角膜接触镜及配套护理品 | 禁止归入美妆工具或其他 |
| `L2_LN_COSMETIC` | L2 | 彩色美瞳镜片 | `L1_LENS` | 盒 | 1 | `lens` | 各类彩色软性隐形眼镜（如 Olens、可啦啦） | **更换周期强制通过 `replacement_cycle_code` 单源选择** |
| `L2_LN_CARE` | L2 | 美瞳护理与伴侣盒 | `L1_LENS` | 瓶 | 1 | `tool` | 隐形眼镜护理液、润眼液、伴侣盒、佩戴钳 | 护理液适用开封后效期（如 90 天 PAO）；镜片本身归 `L2_LN_COSMETIC` |
| `L2_LN_OTHER` | L2 | 其他美瞳相关 | `L1_LENS` | 盒 | 1 | `lens` | 周期未明、特殊功能片或美瞳杂项兜底 | — |

##### 9. `L1_OTHER` 其他（1 个二级 / 2 个三级）
| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与示例 | 边界说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_OTHER` | L1 | 其他 | `NULL` | 件 | 0 | `none` | 跨类组合套盒及极少数无法归入前 8 大类的产品 | L1 不可直选；有清晰归属严禁入本类 |
| `L2_OT_GENERAL` | L2 | 未归类/综合美妆 | `L1_OTHER` | 件 | 1 | `none` | 兜底二级节点 | — |
| `L3_OT_GIFT_SET` | L3 | 综合礼盒/中样套装 | `L2_OT_GENERAL` | 套 | 1 | `none` | 跨彩妆护肤的圣诞倒数日历或旅行多件套盒 | 强烈推荐拆分为独立单品入账 |
| `L3_OT_UNCLASSIFIED` | L3 | 其他暂未归类物品 | `L2_OT_GENERAL` | 件 | 1 | `none` | 极少数暂未归类物品及历史未知编码兜底 | — |

*(统计核对：9 个一级分类，45 个二级分类，93 个三级具体产品类型，总计 147 个分类节点；全部节点经校准无误合并、无同义重复 1 子级、父子归属严谨；可末端挂接产品节点共计 `29` 个可直选二级 + `93` 个三级 = `122` 个。)*

#### 5.4.3 历史分类完整迁移映射字典 V1（严格区分 5 种映射类型，零静默丢弃）

> 严格覆盖 `prototype/js/store.js`、`seedData.js`、`c1-mock-data.js` 与 V2.0 全量 6+24 分类；每条均明确标注映射类型：**`一对一`** / **`一对多`** / **`条件映射`** / **`合并映射`** / **`待人工确认`**。

| 旧版原型一级分类 | 旧版子分类编码（含 C1 别名） | 旧版展示名 | 映射类型 | 新一级 → 新二级 → 新三级目标编码 | 迁移判定规则与历史冲突处置 |
| --- | --- | --- | --- | --- | --- |
| 底妆 (`cat-base`/`c1-cat-base`) | `sub-foundation` / `c1-sub-foundation` | 粉底液 | **一对一**（C1 别名并入） | 彩妆 → 底妆 → `L3_MK_BASE_FOUNDATION` | 两套旧码均无歧义指向粉底液 |
| 底妆 | `sub-cream-found` / `c1-sub-cream-found` | 粉底膏 | **合并映射** | 彩妆 → 底妆 → `L3_MK_BASE_CREAM` | 原粉底膏与同类霜状粉霜语义合并 |
| 底妆 | `sub-cushion` / `c1-sub-cushion` | 气垫 | **一对一**（C1 别名并入） | 彩妆 → 底妆 → `L3_MK_BASE_CUSHION` | 无歧义直迁 |
| 底妆 | `sub-concealer` / `c1-sub-concealer` | 遮瑕 | **一对多** | 彩妆 → 遮瑕 → **`L3_MK_CONCEALER_LIQUID`**（默认） | 新版细分为遮瑕液 / 遮瑕膏盘 / 遮瑕笔；按产品名/质地若含「盘/膏」切 `CREAM`、含「笔/棒」切 `PENCIL`，否则默认落 `LIQUID` 并标迁移可微调 |
| 底妆 | `sub-primer` / `c1-sub-primer` | 妆前乳 | **一对一**（C1 别名并入） | 彩妆 → 底妆 → `L3_MK_BASE_PRIMER` | 无歧义直迁 |
| 底妆 | `sub-sunbase` / `c1-sub-sunbase` | 隔离霜 | **一对一**（C1 别名并入） | 彩妆 → 底妆 → `L3_MK_BASE_SUNBASE` | 无歧义直迁 |
| 底妆 | `sub-loose-powder` / `c1-sub-loose-powder` | 散粉 | **一对一**（C1 别名并入） | 彩妆 → 定妆 → `L3_MK_SETTING_LOOSE` | 随一级归并彩妆、二级转入「定妆」 |
| 底妆 | `sub-pressed-powder` / `c1-sub-pressed-powder` | 粉饼 | **一对一**（C1 别名并入） | 彩妆 → 定妆 → `L3_MK_SETTING_PRESSED` | 随一级归并彩妆、二级转入「定妆」 |
| 唇妆 (`cat-lip`/`c1-cat-lip`) | `sub-lipstick` / `c1-sub-lipstick` | 口红 | **合并映射** | 彩妆 → 唇部产品 → `L3_MK_LIP_STICK` | 口红与固体有色唇膏合并归口 |
| 唇妆 | `sub-lipglaze` / `c1-sub-lipglaze` | 唇釉 | **一对多** | 彩妆 → 唇部产品 → **`L3_MK_LIP_GLAZE`**（默认） | 旧版「唇釉」可能包含部分近年「唇泥」；名称含“唇泥”按规则入 `L3_MK_LIP_MUD`，其余入 `GLAZE` |
| 唇妆 | `sub-lipgloss` / `c1-sub-lipgloss` | 唇蜜 | **合并映射** | 彩妆 → 唇部产品 → `L3_MK_LIP_GLOSS` | 唇蜜与唇油合并归口 |
| 唇妆 | `sub-lipliner` / `c1-sub-lipliner` | 唇线笔 | **一对一**（C1 别名并入） | 彩妆 → 唇部产品 → `L3_MK_LIP_LINER` | 无歧义直迁 |
| 唇妆 | `sub-lipbalm` / `c1-sub-lipbalm` | 润唇膏 | **条件映射** | ① **`L3_MK_LIP_TINTED_BALM`**（有色润唇膏）<br>② **`L3_SK_OT_LIPBALM`**（护肤润唇膏） | 若旧品 `shade` 非空或名含“变色/润色/有色” → 迁彩妆「有色润唇膏」；否则（无色护理） → 迁护肤「润唇膏/唇膜」 |
| 眼妆 (`cat-eye`/`c1-cat-eye`) | `sub-eyeshadow` / `c1-sub-eyeshadow` | 眼影盘/眼影 | **一对多** | 彩妆 → 眼部产品 → **`L3_MK_EYE_PALETTE`**（默认） | 新版拆分粉状眼影与液体眼影/棒；名/质地含“液体/眼影蜜/眼影笔”迁 `L3_MK_EYE_LIQUID`，其余入 `PALETTE` |
| 眼妆 | `sub-eyeliner` / `c1-sub-eyeliner` | 眼线笔 | **合并映射** | 彩妆 → 眼部产品 → `L3_MK_EYE_LINER` | 眼线笔、眼线液笔、眼线胶笔合并至同一规范叶子 |
| 眼妆 | `sub-mascara` / `c1-sub-mascara` | 睫毛膏 | **合并映射** | 彩妆 → 眼部产品 → `L3_MK_EYE_MASCARA` | 睫毛膏与睫毛打底膏合并 |
| 眼妆 | `sub-lashes` / `c1-sub-lashes` | 假睫毛 | **一对一**（C1 别名并入） | 彩妆 → 眼部产品 → `L3_MK_EYE_LASHES` | 无歧义直迁 |
| 腮红修容 (`cat-cheek`/`c1-cat-contour`) | `sub-blush` / `c1-sub-blush` | 腮红 | **一对多** | 彩妆 → 腮红 → **`L3_MK_BLUSH_POWDER`**（默认） | 原复合二级拆出腮红；旧 `texture`/名含“膏/液体/慕斯”迁 `L3_MK_BLUSH_CREAM`，其余入 `POWDER` |
| 腮红修容 | `sub-contour` / `c1-sub-contourpowder` | 修容 / 修容粉 | **一对多 / 一对一** | 彩妆 → 修容 → **`L3_MK_CONTOUR_POWDER`**（默认） | `c1-sub-contourpowder` 为**一对一**；通用 `sub-contour` 为**一对多**（含「棒/液」者迁 `CONTOUR_STICK`） |
| 腮红修容 | `sub-highlighter` / `c1-sub-highlighter` | 高光 | **一对多** | 彩妆 → 高光 → **`L3_MK_HL_POWDER`**（默认） | 名/质地含“高光液/棒/膏”迁 `L3_MK_HL_LIQUID`，其余入 `POWDER` |
| 眉妆 (`cat-brow`/`c1-cat-brow`) | `sub-browpencil` / `c1-sub-browpencil` | 眉笔 | **一对一**（C1 别名并入） | 彩妆 → 眉部产品 → `L3_MK_BROW_PENCIL` | 无歧义直迁 |
| 眉妆 | `sub-browpowder` / `c1-sub-browpowder` | 眉粉 | **合并映射** | 彩妆 → 眉部产品 → `L3_MK_BROW_POWDER` | 压盘眉粉与罐装眉膏合并 |
| 眉妆 | `sub-browgel` / `c1-sub-browgel` | 染眉膏 | **合并映射** | 彩妆 → 眉部产品 → `L3_MK_BROW_GEL` | 染眉膏与透明/定型眉胶合并 |
| 护肤 (`cat-care`/`c1-cat-care`) | `sub-serum` / `c1-sub-serum` | 精华 | **一对多** | 护肤 → 精华 → **`L3_SK_SR_ESSENCE`**（默认） | 新版细分为精华液/安瓶次抛/精华油；名含“安瓶/次抛”迁 `AMPOULE`，含“精华油/美容油”迁 `OIL`，其余入 `ESSENCE` |
| 护肤 | `sub-cream` / `c1-sub-cream` | 面霜 | **一对多** | 护肤 → 乳液面霜 → **`L3_SK_EC_CREAM`**（默认） | 旧版无独立「乳液」；名/质地显含“乳液/乳”而无“霜”迁 `L3_SK_EC_LOTION`，其余入 `CREAM` |
| 护肤 | `sub-sunscreen` / `c1-sub-sunscreen` | 防晒 | **一对多** | 护肤 → 防晒 → **`L3_SK_SS_LOTION`**（默认） | 新版区分面部防晒乳/喷雾棒/身体防晒；名含“身体”迁 `L2_BD_SUNSCREEN`，含“喷雾/棒”迁 `L3_SK_SS_SPRAY_STICK` |
| 护肤 | `sub-toner` / `c1-sub-toner` | 化妆水 | **一对多** | 护肤 → 爽肤水/保湿水 → **`L3_SK_TN_TONER`**（默认） | 名含“精华水/神仙水”迁 `ESSENCE_WATER`，含“喷雾”迁 `MIST`，其余入 `TONER` |
| 缺二级或未知/自定义编码 | 仅传一级 `cat-*` 或未识别字符串 | — | **待人工确认** | 对应大类兜底（如 `L2_MK_OTHER` / `L2_SK_OTHER`）或 `L3_OT_UNCLASSIFIED` | **严禁静默丢弃**；在 `migration_legacy_category_raw` 与备注保留原值，置 `migration_review_status = 'pending_category_review'` 引导用户一次性确认 |

- **分类停用与兼容**：后续废除某分类只做 `is_active = 0` + `deprecated_by_code` 软定向，历史记录 `category_id` 与妆容 `category_snapshot` 永不清空或报错。

#### 5.4.4 分类 vs 产品属性严格边界表
| 属于「分类」的内容（品类形态/使用部位） | 属于「产品属性」的内容（严禁做成分类） |
| --- | --- |
| 粉底液、粉底膏、气垫、粉饼、散粉、口红、唇釉、眼影盘、睫毛膏、精华液、面霜、香水、香膏、沐浴露、身体乳、洗发水、护发素、指甲油、甲油胶、底油亮油、指缘油、护足霜、颈霜、化妆刷、美妆蛋、彩色美瞳镜片 | **色号 (`shade`)**、**规格净含量 (`30ml`/`50g`/`10片`)**、**香水浓度 (`EDP`/`EDT`)**、**香调**、**妆效**、**质地**、**SPF/PA**、**适用肤质**、**美瞳更换周期 (`replacement_cycle_code`)**、**美瞳单盒度数 (`lens_power`) 与眼别 (`lens_eye_side`)**、**基弧 (`BC`) / 直径 (`DIA`) / 含水量** |

---

### M5：产品规格与拥有数量（状态：`推荐定稿`）
1. **严格定义分离**：
   - **单件规格（`Product` 主档）**：表示单个标准包装的容量或数量，存储为 `spec_value`（TEXT/Decimal 或标称展示串）+ `spec_unit`（预设 `ml` / `g` / `片` / `支` / `枚` / `其他自定义单位`）。例：`30ml`、`50g`、`10片/盒`。
   - **拥有数量（`ProductItem` 聚合结果）**：不作为独立手填静态整数存储，而是等价于 **`Product` 名下 `deleted_at IS NULL` 且 `lifecycle_status != 'finished'` 的 `ProductItem` 实时行数**（单位优先读取所属分类的 `default_unit`，如 `瓶`、`支`、`盒`、`副`、`套`、`把`、`个`、`块`、`盘`、`罐`）。
2. **界面简繁切换**：
   - 列表卡片与产品详情页头部展示简洁形式：`共持有 2 瓶`（含 `30ml/瓶` 小标签），**完全隐藏“实例/SKU”等技术词**；用户点击「展开每一瓶」或直接点击任意一瓶卡片即可调整单瓶开封日、剩余量与价格。
3. **数量增减时的安全操作规则**：
   - **增加件数**（如由 1 瓶 `+1` 变为 2 瓶）：自动创建 `lifecycle_status = 'unrecorded'`、继承默认币种的新 `ProductItem` 行，不破坏原有第一瓶任何日期与价格。
   - **减少件数**（如点击快速减量或删除一件）：
     - 若存在完全未填生命周期/价格且未关联妆容的空白 `unrecorded` 件，优先删除最新一件空白件；
     - **一旦被删件包含开封日期、生产日期、价格或已关联任何历史妆容/使用记录，严禁静默挑选删除**——必须弹出提示让用户明确点选要删哪一瓶或转为「标记为已用完」。

---

### M6：日期、有效期与美瞳专有日期规则（状态：`min()` 双约束与不猜测=`已确认`，4 层字段与工具豁免=`推荐定稿`）
1. **7 个日期/期限字段完整语义表**：

| 字段名 | 存储表 | 类型 | 必填性 | 业务含义 |
| --- | --- | --- | --- | --- |
| `purchase_date` | `product_items` | 纯日期 `YYYY-MM-DD` | 选填 | 购买或获得该件实物的日期（仅作资产与追溯参考，**不参与推算到期日**） |
| `manufacture_date` | `product_items` | 纯日期 `YYYY-MM-DD` | 选填 | 包装标注生产日期（批号解析结果须由用户手动确认后填入，禁止静默猜批号） |
| `unopened_shelf_months` | `product_items` | INTEGER `> 0` | 选填 | 未开封保质期（月数，通常 24/36 个月） |
| `packaging_exp_date` | `product_items` | 纯日期 `YYYY-MM-DD` | 选填 | 包装外直接印刷的原始 EXP 到期日（**美瞳、药妆、日系产品最常见原始输入**） |
| `opened_date` | `product_items` | 纯日期 `YYYY-MM-DD` | 选填（标使用中建议填） | 实际开封日期；**强制校验 `opened_date >= manufacture_date`**（若均存在） |
| `pao_months` | `product_items` | INTEGER `> 0` | 选填 | 开封后保质期 PAO（如 `6M`/`12M` 存为整数月数） |
| `confirmed_expiry_date` | `product_items` | 纯日期 `YYYY-MM-DD` | 选填 | 用户在表单主动录入或点击「采纳推荐日期」确认的最终锁定到期日 |

2. **到期日期的 4 层来源隔离模型（彻底解决来源混淆）**：
   - **第 1 层 `raw_input`**：上述 `manufacture_date`、`unopened_shelf_months`、`packaging_exp_date`、`opened_date`、`pao_months`（以及美瞳 `replacement_cycle_code`）。
   - **第 2 层 `system_computed`**：`computed_expiry_date`（纯日期）+ `computed_expiry_basis`（枚举：`packaging_exp` / `mfg_plus_shelf` / `opened_pao_only` / `min_unopened_and_pao` / `lens_open_cycle` / `min_lens_exp_and_cycle` / `insufficient`）。由领域引擎按优先级纯函数随时重算，用户不可直接手写篡改。
   - **第 3 层 `user_confirmed`**：`confirmed_expiry_date` + `expiry_confirmed_at` + `confirmed_input_fingerprint`（对确认瞬间原始参数拼接摘要哈希）。只有用户显式手选到期日或主动点击「采纳」时才更新。
   - **第 4 层 `display_result`（有效到期日 `effective_expiry_date`）**：
     - 展示与临期筛选优先级：**若 `confirmed_expiry_date IS NOT NULL` → 采用 `confirmed_expiry_date`（标记来源「已手动确认」）；否则若 `computed_expiry_date IS NOT NULL` → 采用 `computed_expiry_date`（标记来源「系统推算」）；否则 → `NULL`（「无法判断」）。**
3. **系统推算优先级与缺失处理**：
   - **未开封（`unopened`）**：
     - 未开封上限 `unopened_limit` = 若填有 `packaging_exp_date` 取 `packaging_exp_date`；否则若有 `manufacture_date + unopened_shelf_months` 取相加日期；两者皆缺则为 `NULL`（不可凭空猜测）。
   - **使用中（`in_use`）**：
     - 若存在 `opened_date` 且（存在 `pao_months` 或美瞳存在结构化更换周期）：计算 `opened_limit`。
     - 若同时存在 `unopened_limit` 与 `opened_limit`：严格取 **`min(unopened_limit, opened_limit)`**（对应用户 `测试情况.docx` 原话）；依据标为 `min_unopened_and_pao`。
     - 若缺 `unopened_limit` 但有 `opened_limit`：返回 `opened_limit`，依据标为 `opened_pao_only`（提示未填生产期，若已临近原保质期请注意风险）。
     - 若缺 `opened_date` 或缺 `pao_months` 但有 `unopened_limit`：仅返回 `unopened_limit` 作为最迟底线参考，并标注提示“缺开封/PAO，当前按未开封到期日兜底提醒”。
   - **用户修改历史输入参数时**：系统即时更新 `computed_expiry_date`，**绝不静默覆盖 `confirmed_expiry_date`**；但若对比 `confirmed_input_fingerprint` 发现输入源变化且 `computed != confirmed`，界面显示温和对比条与一键更新确认按钮。
4. **美妆工具按需豁免**：
   - `categories.expiry_management_mode` 分为 `'tracked'`（默认追踪效期）与 `'optional'`（化妆刷、美妆蛋、睫毛夹、指甲剪、收纳工具等）。`optional` 品类空白时不计入“缺信息/无法判断”列表，仍允许用户可选填清洗提醒备注或手填更换日。
5. **美瞳专属日期与佩戴规则（核心防混淆设计）**：
   - **五个必须隔离的概念**：
     1. **外包装印刷到期日（`packaging_exp_date`）**：指未开封铝箔/PP杯密封状态下的灭菌有效期（如 `EXP 2029-05-01`），无论日抛年抛均由厂家标注，**绝不可用更换周期替代**。
     2. **未开封保质期（`unopened_shelf_months`）**：可选与生产日期组合验证外包装期。
     3. **实际开封日期（`opened_date`）**：用户在某一具体日子真正拆封第一片/该副镜片的日期。**未拆封前严禁按“日抛/月抛”反推开封日或默认计算已开始计时！**
     4. **结构化更换周期（`replacement_cycle_code`）**：日抛 (`daily`: 当日抛弃 / 拆封日+0天提示次日失效)、双周抛 (`biweekly`: +14天)、月抛 (`monthly`: +30天/1个月)、季抛 (`quarterly`: +90天)、半年抛 (`semiannual`: +180天)、年抛 (`annual`: +365天)、其他 (`other`: 手动填)。开封后 `opened_limit` 按 **`opened_date + cycle_days`**（或有显式 PAO 时兼容校验）计算，**受 `min(packaging_exp_date, opened_limit)` 双重封顶保护**。
     5. **实际佩戴记录**：一盒 10 片日抛开封 1 盒不等于 10 天一次性失效——整盒尚未拆开剩余独立铝箔片维持其未开封 `packaging_exp_date`，而**正在佩戴的那一副/当日记录**可通过日常模块 `product_usage_logs` 记录“实际佩戴天数/次”（例：月抛拆封算起第 X 天，或日抛消耗 1 片扣减剩余片数比例）。若用户以单盒为 `ProductItem`，开启该盒表示整盒已启用、记录剩余比例/剩余片数，**仅针对单副/当前拆开镜片才触发开封周期倒计时（日抛当日使用提示，长周期镜片按首次开封日计算总弃用截止日）**，绝不盲目用整盒开盒日把盒内未撕封的另外 8 片日抛算作当天同时过期！

---

### M7：妆容记录体系（四项评分全选填=`已确认`，UI 细则=`推荐定稿`）
1. **字段必填/选填矩阵**：
   - **必要字段**：`name`（妆容名称，允许自动日期+风格占位或手填）、`look_date`（妆容日期，YYYY-MM-DD）。
   - **选填字段**：`style`（风格）、`scene`（场景）、耗时（`started_at` / `finished_at` / `duration_minutes`）、妆容主照、细节照（多图）、**四项评分（`self_rating` / `coordination_rating` / `color_rating` / `wear_rating`，全部选填且真 `NULL` 语义）**、自由标签 `tags_json`、私人备注 `notes_private`、关联产品列表（`look_product_items`）。
2. **星级粒度比较与推荐定稿**：
   - **唯一推荐定稿：`1～5 整数星级`**（`CHECK (rating BETWEEN 1 AND 5)`）。
   - **对比理由**：整数星级（1~5）符合 `ADR-0001`/`V2.0` 数据库约束、无浮点精度风险、手指在手机弹窗中点击精准零误触、平均分直接支持按小数值展示（如 `4.3 ★`）；相比半星 `0.5` 分（需 `2..10` 换算、易点偏且 5 分制区分度已足），整数星级更克制高效。
3. **风格、场景「单选 vs 多选」比较与推荐定稿**：
   - **唯一推荐定稿**：`style`（妆容风格）与 `scene`（适用场景）均采用 **「单选精选预设胶囊 + 用户手填自定义短文本 + 允许留空」**（不建庞大外键字典表，直接存可读文本 `style TEXT NULL` / `scene TEXT NULL`）。
   - **对比理由**：妆容表已有独立的 `tags_json` 自由多标签栏可承担“多关键词补充”（如 `#减龄` `#早八` `#秋日`）；若 `style` 和 `scene` 也允许复选多个，既与 `tags` 职责重合，又会导致“按风格/场景分组筛选”时同一妆容在多个分组重复计数。单值主风格/主场景录入 1 次点击完成，统计口径唯一清晰。
4. **产品关联、照片分离与再编辑保护**：
   - 一个妆容可关联多个真实持有的 `ProductItem`，同一 `ProductItem` 可被任意次历史妆容引用。
   - **每次保存关联即写入完整快照**（`product_name_snapshot`, `brand_name_snapshot`, `shade_snapshot`, `category_snapshot`, `spec_snapshot`），日后产品主档改名、换分类、归档或彻底删除后，历史妆容依旧完整展示当时所用产品记录。
   - **再次编辑妆容时默认全量保留已有 `look_photos` 与 `look_product_items`**，仅当用户显式移除或新增才改动关联；妆容照与产品照物理关联表完全分开（`look_photos` vs `product_photos`）。

---

### M8：货币与资产统计体系（状态：**`已确认 UD-04`**）
1. **底层存储与计算红线（`已确认`）**：
   - 默认币种 `CNY`。每件 `ProductItem` 记录实际 `purchase_price_minor`（`INTEGER` 最小货币单位，如分/日元/费尔斯，非负 `>= 0`）+ `currency_code`（ISO 4217 三位码）。
   - 严禁使用 `Float`/`Double`；依靠集中式 100% 离线币种精度表转换（`CNY/USD/EUR/GBP/HKD/KRW` 等各自精确小数位：`CNY=2`、`USD=2`、`JPY=0`、`KWD=3`）。
   - **严禁不同币种金额直接相加，严禁离线瞎猜汇率强行折算总额**。
   - **资产汇总口径**：累计购买消费包含历史已用完/已归档但记录有价格的实物；「当前持有活跃件数」仅统计未删（不在回收站）且未用完（`deleted_at IS NULL AND lifecycle_status != 'finished'`）的实物。
2. **首页累计购买金额展示方式（`已确认 UD-04`）**：
   - 首页概览区**弱化单行展示用户自选的 1 个主币种累计金额**（默认 `CNY`）；其余实际发生过消费的外币汇总统一收敛至旁侧「多币种明细」弹窗独立分行展示（不同币种仍互不换算混加）。
   - 具体文案、弹窗布局及主币种选择器位置可在后续 `V3-07`/`V3-08` UI 开发期按需迭代，**不再阻塞 SQLite 设计**。

---

### M9：生命周期状态转换表、重置规则与历史 `idle` 迁移兼容（状态：`推荐定稿` 冻结生效）

#### 5.9.1 完整生命周期状态转换与历史兼容表
| 序号 | 当前状态 | 目标状态 | 是否允许 | 是否需二次确认 | 需要用户填写/引导信息 | 清除字段 | 保留字段 | 是否重算有效期 | 是否产生日志 | 异常与取消边界 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `unrecorded` | `unopened` | **允许** | 否 | 提示确认/补选生产日期、未开封保质期或包装 EXP（均可空跳过） | 无 | 全部主档/价格/照片/原始日期参数 | **是**（按未开封侧重算） | 可选状态审计，不强制写日常使用日志 | 弹窗点取消零部分保存 |
| 2 | `unrecorded` | `in_use` | **允许** | 否 | 引导填开封日期（默认建议今日，可改或留空）、PAO 月数、默认剩余比例 `100%` | 无 | 全部主档/价格/照片/原始日期参数 | **是**（触发 `min()` 或 PAO 侧重算） | 可选（若用户主动打卡才写 usage log） | **`opened_date < manufacture_date` 拦截拒存** |
| 3 | `unopened` | `in_use` | **允许** | 否（直接进入开封面板） | 引导填写开封日期（默认今日）、PAO；原剩余比例默认为 `100%`（可调） | 无 | 生产日期、保质期、包装 EXP、价格、照片及手动确认日期（若指纹变则提示确认） | **是**（重算 `computed_expiry_date`） | 否（开封本身非妆容打卡） | 取消开封面板时必须保持原 `unopened`，不得半保存开封日 |
| 4 | `in_use` | `finished` | **允许** | **是**（确认“标记为已用完”且提示将归入已用完记录） | 自动默认 `finished_at = today`、`remaining_percent = 0`（可附用完心得） | 无 | 生产/开封/价格/历史妆容关联与所有照片 | 停止主动临期告警（保留静态日期仅供查看） | 否（不混同日常消耗打卡） | 用户点取消则状态、`remaining_percent` 全回滚 |
| 5 | `finished` | `in_use` | **允许** | **是**（确认“重新启用为使用中”） | 确认或修改当前剩余比例（不可保持 0，建议弹至 `10%`～`50%` 或保持旧值供改） | **`finished_at = NULL`** | 保留原 `opened_date`、PAO、生产日期、价格、历史妆容与照片 | **是**（恢复有效期状态重算与临期判定） | 否 | 取消操作则保持 `finished` |
| 6 | `in_use` | `unopened` | **允许** | **是**（警告“将清除已填写的开封日期并退回未开封”） | 无需额外填写 | **`opened_date = NULL`、`finished_at = NULL`**；`remaining_percent` 清回 `100` 表示未拆封满量；若 `confirmed_expiry_date` 指纹依赖旧 `opened_date` 则提示或清除 | **保留 `manufacture_date`、`unopened_shelf_months`、`packaging_exp_date`、`pao_months`**、价格、主档、照片、历史妆容快照 | **是**（立即仅按未开封参数重算 `computed_expiry_date`） | 否 | 确认弹窗点击取消，原 `opened_date` 与状态纹丝不动 |
| 7 | `finished` | `unopened` | **允许** | **是**（高风险跨态退回警告：将清除用完与开封信息） | 无需额外填写 | **`opened_date = NULL`、`finished_at = NULL`**；`remaining_percent = 100`；失效原开封确认日（按指纹提示或随确认清除） | **保留 `manufacture_date`、保质期参数、包装 EXP、价格、主档、历史记录** | **是**（按未开封重新计算） | 否 | 取消零改动 |
| 8 | `unopened` / `in_use` / `finished` | **`unrecorded`** | **仅详情页独立入口允许** | **必须**（红色二次确认“重置为未记录状态”） | 不填新信息 | **精准清除**：`lifecycle_status = 'unrecorded'`、`opened_date = NULL`、`finished_at = NULL`、`remaining_percent = NULL`、`lifecycle_note = NULL`、`confirmed_expiry_date = NULL`、`expiry_confirmed_at = NULL`、`confirmed_input_fingerprint = NULL`、`computed_expiry_date = NULL`、`computed_expiry_basis = 'unrecorded'` | **完整保留**：`Product` 主档、品牌/名称/分类/规格、价格/币种、购买日期、获得渠道、产品照片、基础备注、`manufacture_date`、`unopened_shelf_months`、`pao_months`、`packaging_exp_date`、**历史妆容关联与使用日志** | 不展示推算（等待用户重新指定状态后即时重算） | 否 | 快捷菜单严禁出现「未记录」；取消操作绝不清空任何字段 |
| 9 | 同态内部编辑 | 同态 | **允许** | 仅修改关键日期影响手动确认日时提示是否同步更新 | 自由改日期、剩余量、价格等 | 仅按字段编辑替换 | 其他全部字段 | **是**（每次变更原始日期即实时刷新 `computed`） | 否 | 必须通过事务保存与取消丢弃草稿 |
| **10** | **历史 `idle`（迁移分支 A：有证据）** | **`in_use`** | **迁移自动** | 否（迁后可人工改） | 迁移条件：存在 `opened_date` / `pao_months` / `remaining_percent < 100` / `last_used_at` 或历史妆容使用关联 | 清除废弃枚举值 `idle` | 保留原全部日期/比例/照片并在 **`lifecycle_note` + 迁移日志保留 `idle` 原值与时间** | **是** | **写入强制迁移审计日志** | 不得无条件归类无证据记录 |
| **11** | **历史 `idle`（迁移分支 B：无证据）** | **`unrecorded`（待核对）** | **迁移自动 + 待确认** | 后续详情一键确认 | 迁移条件：`opened_date`、`pao_months`、`last_used_at` 全为空且剩余量为空/100且无历史关联 | 清除废弃枚举值 `idle` | 保留全部主档与生产期并在 `migration_review_status = 'pending_idle_review'` 与迁移日志留痕 | 重置为 `unrecorded` 等候用户确认 | **写入强制迁移审计日志** | 用户在详情点「确认未开封/使用中」前不乱猜已开封 |

> 补充状态约束：`remaining_percent` 处于 `in_use` 时通常在 `1..100`；一旦通过「标记为已用完」进入 `finished` 强制归 `0`；处于 `unrecorded` 时明确置 `NULL`。任何保存动作前先校验：`opened_date >= manufacture_date`（若均非空）、`finished_at >= opened_date`（若均非空）；弹窗或表单中**点击取消必须整体丢弃编辑草稿，严禁出现“只改了一半字段”的部分保存脏态**。

---

### M10：通用字段、分类专属属性与美瞳单盒归属模型（结构模型=`推荐定稿`，**美瞳归属=`已确认 UD-02`**）

#### 5.10.1 数据存储架构方案对比（拒绝 EAV）
| 候选架构方案 | SQLite 可靠性与查询 | Swift 类型安全 | 迁移成本与拓展性 | 最终评价 |
| --- | --- | --- | --- | --- |
| A. 通用超大平铺表 | 极差（几十个稀疏 NULL 列污染主表） | 差 | 每次增新分类字段都需改大表 | 淘汰 |
| B. 通用字段 + 纯自由 JSON | **关键过滤字段（如美瞳周期/度数/眼别）无法高效建索引与强约束** | 需手工解码易弱化 | 易退化成 schema-less 垃圾箱 | 淘汰 |
| C. 全品类拆独立附表 | 多表高频 Join 过于零碎 | 高 | 新分类必建表，过度设计 | 淘汰（仅美瞳高度结构化值得附表/专项字段） |
| **D. 混合分层模型（`推荐定稿`）** | **核心过滤/计算全有强类型列与索引；低频文案有版本化校验 JSON** | **Swift `Codable` 分组 DTO 强类型映射** | **平滑演进，绝不建通用 EAV 系统** | **唯一推荐定稿** |

#### 5.10.2 最终字段归属矩阵（严格校准 `UD-02` 单盒粒度）
1. **`Product`（产品主档 — 同款共享不变本质特征）**：
   - 通用主档：`name`、`is_custom_name`、`brand_id`、`category_id`、`spec_value`、`spec_unit`、`notes_private`、`archived_at`、回收站元字段（`deleted_at` / `trash_expires_at` / `trash_scope` / `delete_batch_id`）；
   - 高频共享彩妆/美妆核心列：`shade`（色号 —— 允许为空，供妆容快照、产品卡片和检索高频复用）；
   - **`美瞳` Product 级光学与周期特征**（归 `product_lens_profiles` 1:0..1 结构表，**全字段除 `replacement_cycle_code` 建议选填外均允许为空**）：
     - **`replacement_cycle_code`**（日抛/双周抛/月抛/季抛/半年抛/年抛/其他 —— **唯一事实来源**）
     - `bc_mm`（基弧，可选）
     - `dia_mm`（直径，可选）
     - `water_content_percent`（含水量，可选）
     - `pack_piece_count`（标称单盒片数，如 `10`，可选）
     - `lens_color_pattern`（花色款式，可选）
   - **中低频分类属性（受控版本化 JSON `products.category_attrs_json` + `category_attrs_schema_ver`）**：
     - 香水香氛：`concentration`（EDP/EDT/Parfum 等）、`fragrance_family`（香型）、`top_notes`/`middle_notes`/`base_notes`
     - 彩妆：`texture`（质地）、`finish`（妆效）
     - 护肤/洗护：`suitable_skin_types`、`efficacy_tags`、`key_ingredients`、`spf_value`/`pa_rating`
     - 全部专业参数**允许为 `NULL`/留空**，绝不强迫用户填完才准保存。
2. **`ProductItem`（单件/单盒实物 — 每瓶、每支、或每一独立包装美瞳盒）**：
   - 通用实物：`product_id`、`acquire_channel`、`purchase_price_minor`、`currency_code`、`purchase_date`、`lifecycle_status`、`remaining_percent`、`lifecycle_note`、`last_used_at`、`finished_at`、`archived_at`、迁移溯源字段（`migration_legacy_status` / `migration_review_status`）、回收站元字段（`deleted_at` / `trash_expires_at` / `trash_scope` / `deleted_by_parent_id` / `delete_batch_id`）；
   - 4 层日期与效期：`manufacture_date`、`unopened_shelf_months`、`packaging_exp_date`、`opened_date`、`pao_months`、`computed_expiry_date`、`computed_expiry_basis`、`confirmed_expiry_date`、`expiry_confirmed_at`、`confirmed_input_fingerprint`；
   - **美瞳单盒专属度数与眼别字段（`已确认 UD-02` 校准后模型，彻底废除单盒同时存左右双度数的旧设计）**：
     - **`lens_eye_side`**：`TEXT NULL CHECK (lens_eye_side IS NULL OR lens_eye_side IN ('unspecified', 'left', 'right', 'both'))` —— 区分该盒对应**左眼 (`left`)**、**右眼 (`right`)**、**双眼同度通用 (`both`)**，或**未指定 (`unspecified` / `NULL`)**；
     - **`lens_power`**：`TEXT NULL` —— **单一度数字符串**（如 `"-2.50"`、`"-0.00"`、`"-3.25"`），严格对应这 **1 盒独立包装** 的实际度数，**允许留空**；
     - **`batch_code`**：`TEXT NULL` —— 可选包装批号，用于防同度数不同批次/不同 EXP 被错误合并。

#### 5.10.3 美瞳同款多盒隔离与左右眼配对展示规则（`已确认 UD-02`）
- **同一 `Product` 共用原则**：同品牌、同系列花色、同更换周期（例如 `Olens Scandi Gray 日抛`）共用 1 个 `Product` 主档，不因度数不同拆出碎片化的多条产品。
- **单盒 `ProductItem` 不可错合并红线**：只要两盒之间 **度数（`lens_power`）、适用眼别（`lens_eye_side`）、包装有效期（`packaging_exp_date`）、购买批次/日期** 任一不同，就必须作为各自独立的 `ProductItem` 行存储（若在购买记录上同一度数同一批一次性买了 2 盒，可建 2 个独立单盒实例分别追踪各自开盒日与剩余片数，前端默认折叠数量角标保持简单）。
- **左右眼成对展示与妆容佩戴实现层（不破坏单盒库存）**：
  - 在「产品详情页 → 持有盒列表」中，UI 自动按 `lens_eye_side` 分区或以配对卡片展示（如显示「当前可用配对：左眼 -2.50（盒 #1） + 右眼 -3.00（盒 #2）」）；
  - 在「妆容日记 → 关联使用产品」中，用户可一并勾选左眼盒与右眼盒两条 `ProductItem`（写入两条 `look_product_items` 并完整快照各自 `"-2.50 (左眼)"` 与 `"-3.00 (右眼)"`），**单盒库存扣减与开封寿命彼此独立**。

---

## 四、跨模块一致性检查矩阵（14 组最终全闭环）

> 随着 `UD-01`～`UD-04` 全部由用户拍板、历史 `idle` 语义与美瞳单盒粒度及 7 天回收站机制校准完成，**14 组跨模块检查现已全部关闭，零残留待决冲突**。

| 编号 | 检查维度 | 潜在冲突点 | 处置与校准结果 | 最终状态 |
| --- | --- | --- | --- | --- |
| **1** | **M1 × M5**（名称生成 × 规格数量） | 若规格/数量拼入 `name`，增减件数或补全规格会导致自定义名破坏 | 已隔离：`products.name` 仅由「品牌+品类(+色号)」生成，规格与数量单独存储展示 | **无冲突** |
| **2** | **M2 × M6**（生命周期 × 有效期） | 未开封与已过期能否共存？`unrecorded` 如何处理效期？ | 已打通：`unopened` 可与 `expired` 共存并高亮；`unrecorded` 仅保原始参数 | **无冲突** |
| **3** | **M2 × M9**（生命周期定义 × `idle` 迁移） | 旧 `idle` 存在“开封后闲置”与“无开封信息”两种可能，无条件迁 `in_use` 会制造脏数据 | **已校准解决**：按开封/使用证据分流迁至 `in_use` 或 `unrecorded（待人工确认）`，并保留全量迁移审计日志 | **已解决** |
| **4** | **M3 × M7**（产品删除 × 妆容历史） | 回收站内及彻底删除后，旧妆容关联行会否丢失或报错？ | 已闭环：回收站期保持软隐；彻删经 `ON DELETE SET NULL` 置空外键并用全部快照字段兜底历史 | **无冲突** |
| **5** | **M4 × M5**（三级分类 × 规格单位） | 美瞳、面膜、假睫毛的拥有单位与盒内片数易混 | 已统一：拥有单位挂分类 `default_unit`（`盒/副/瓶`），盒内片数入规格/`pack_piece_count` | **无冲突** |
| **6** | **M4 × M6**（分类体系 × 专属效期） | 化妆刷、光疗灯、指甲剪等工具缺日期时报错影响体验 | 已解决：`expiry_management_mode = 'optional'` 豁免非液体器械强制效期告警（洗刷水除外） | **无冲突** |
| **7** | **M4 × M10**（三级分类 × 专属属性） | 香水浓度、美瞳抛期既当分类又当属性会冲突；部分合并/单子级结构问题 | **已校准解决**：砍除多余单子级、拆开误合并品、`L1_LENS` 仅设客观二级，抛期由 `replacement_cycle_code` 单源驱动 | **已解决** |
| **8** | **M5 × M10**（Product/ProductItem 边界） | 单盒实物若同时挂左右眼两组度数会破坏单盒库存；不同度数是否拆款？ | **已校准解决（`UD-02`）**：同款共用 `Product`；`ProductItem` 严守单盒粒度只记单一度数 `lens_power` + `lens_eye_side`；左右眼配对由 UI/妆容上层关联完成 | **已解决** |
| **9** | **M6 × M9**（有效期计算 × 生命周期重置） | 重置状态时容易误删生产日期或残存旧确认日期 | 已解决：4 层日期物理隔离；重置精准清开封/用完/确认/推算日，永久保生产期、PAO 及历史日志 | **无冲突** |
| **10** | **M7 × M10**（妆容快照 × 分类属性） | 美瞳盒别与度数能否随妆容快照留存？`shade` 是否稳定？ | 已锁定：`shade` 留主列；`look_product_items` 快照扩展兼容 `spec_snapshot`（含单盒美瞳度数与眼别标识）与三级分类路径 | **无冲突** |
| **11** | **M8 × M5**（规格 × 价格 × 币种统计） | 首页只展 1 个主币种时，其他币种或已用完品会否统计丢失？ | **已闭环（`UD-04`）**：底层所有实付实物（含已用完）按 `currency_code` 独立存算，首页单选主币种弱化展示并保留多币种明细完整账本 | **已解决** |
| **12** | **美瞳分类 × 抛期 × EXP × 生命周期** | 抛期与包装 EXP 混淆或未开封按抛期起算 | 已隔离：未开封看 `packaging_exp_date`；拆封后看 `min(包装EXP, 开封日 + 更换周期)`；佩戴记录入日常流水 | **无冲突** |
| **13** | **产品删除 × 回收站 × 照片引用** | 先单删 1 瓶再删整款产品恢复误复活；直接 `RESTRICT` 阻断彻删；孤儿删图误伤共享照 | **已校准解决（`UD-03`）**：`trash_scope`/`deleted_by_parent_id` 隔离恢复批；单事务先删日志/关联后物理删行；四表引用总计归 0 后才删磁盘文件 | **已解决** |
| **14** | **产品数量调整 × 单件实物数据** | 快速 `-1` 误删用户填写过开封日或关联妆容的瓶子 | 已防护：仅允许自动减掉无信息空白 `unrecorded` 件；涉及有日期/价格/妆容关联者必须点选具体实物或改已用完 | **无冲突** |
