# ADR-0002：妆匣 BeautyBox V3.1 产品规则全面收口决策基线（M1～M10）

- **状态**：V3.1 正式收口基线（`已确认` 与 `推荐定稿` 已按口径严格区分；含 `UD-01`～`UD-04` 共 4 项 `待用户决策`）
- **版本**：V3.1（升级自 V3.0 首轮 ADR-0002，2026-11-26）
- **关联架构基线**：[ADR-0001](file:///home/xianggujiang/projects/BeautyBox/docs/adr/0001-architecture-decisions.md)（保持历史正文完整，含第十节 V3.1 适用边界说明）
- **配套规范文档**：
  - [BeautyBox_产品需求规格说明书_V3.0.md](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_产品需求规格说明书_V3.0.md)（V3.1 收口修订版）
  - [BeautyBox_SQLite数据库设计前置清单.md](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_SQLite数据库设计前置清单.md)
  - [BeautyBox_当前待办与决策清单.md](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_当前待办与决策清单.md)
  - [BeautyBox_新版开发路线图_V3.0.md](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_新版开发路线图_V3.0.md)
  - [TASK02.1-原型收尾与冻结验收清单.md](file:///home/xianggujiang/projects/BeautyBox/docs/testing/TASK02.1-原型收尾与冻结验收清单.md)
- **决策来源依据**：`AGENTS.md`、V2.0 原始四份 `.docx` 文档、`测试情况.docx` 用户实测反馈、`prototype/` 冻结源码（`f6752ac` / `v0.2-task02.1-frozen`）及用户已明确确认原则。

---

## 一、决策状态口径与继承的「已确认」原则

### 1.1 状态标签定义（全文严格统一）
- **`已确认`**：用户已明确表达或亲自拍板的产品原则与业务规则，本轮及后续不得私自推翻或降级。
- **`推荐定稿`**：AI 基于业务合理性、iOS 用户体验、数据可靠性与实现成本给出的首选可执行方案，等待用户一并审阅，不拆成零碎疑问。
- **`待用户决策`**：真正涉及产品体验取舍、数据结构边界或删除恢复方向的重大事项，全项目压缩收敛为 **4 项（`UD-01`～`UD-04`）**。
- **`暂缓`**：明确推迟至 V1.1 / V2 的增强能力，不进入 V1 范围与 SQLite 首版强制开发。
- **`已废弃`**：已被新方案明确取代的旧枚举或旧规则（同时给出历史数据迁移路径，禁止静默丢失）。

### 1.2 必须继承的已确认原则（100% 锁定）
1. **产品体验原则（`已确认`）**：**「简单为主，精细可选」**——默认以产品为中心展示名称、拥有总件数与聚合状态；需要时展开管理单瓶/单盒实例明细；底层严格区分 `Product` 与 `ProductItem`，前端不对普通用户暴露「持有实例」等技术词；不强迫用户填满专业属性才能保存产品；不做复杂电商仓储 ERP。
2. **数据、隐私与商业化底线（`已确认`）**：默认纯本地、无账号/注册/登录（严禁 `users`、`auth`、`owner_id`、RLS）；资料与照片默认存 iPhone App 私有沙盒；核心功能 100% 离线可用；iCloud 备份默认关闭由用户主动开启且与实时同步区分；分享由用户主动触发并采用字段白名单；**数据备份、恢复、导出对所有用户永久免费开放**，会员到期不得锁定、隐藏或删除已有数据。
3. **TASK02.1 原型冻结原则（`已确认`）**：浏览器原型已随提交 `f6752ac` 与标签 `v0.2-task02.1-frozen` 正式冻结，不得重开、不得改写冻结原型代码；原型完成不等于原生 iOS 完成。
4. **M7 妆容四项评分原则（`已确认`）**：整体满意度（`self_rating`）、妆容协调度（`coordination_rating`）、色彩表现（`color_rating`）、持妆表现（`wear_rating`）**全部选填**；允许 0～4 项任意填写；未评分存储真 `NULL`，**严禁存为 `0` 分，严禁计入均分分母**。
5. **M4 美瞳独立一级分类（`已确认`）**：**「美瞳」必须作为独立一级分类**，不得合并进「美妆工具」或「其他」。
6. **M6 有效期不臆测与双约束（`已确认`）**：不得按类别猜测未开封保质期或 PAO；在 `测试情况.docx` 用户明确要求下，已开封后若同时存在生产日期+未开封保质期与开封日期+PAO，系统推算取 **`min(未开封截止日, 开封日期 + PAO)`**。

---

## 二、M1～M10 全局决策状态总览

| 编号 | 主题模块 | 总体状态 | 核心定稿结论 | 用户确认 / 待决策映射 |
| --- | --- | --- | --- | --- |
| **M1** | 产品名称规则 | **`推荐定稿`** | 引入 `is_custom_name` 显式标记；建议名按「品牌 + 叶子品类 (+ 色号)」去重拼接；规格与件数不拼入名称 | 继承用户反馈：不强制冗余重复命名 |
| **M2** | 生命周期状态定义 | **`推荐定稿`** | 两套正交状态：生命周期(`unrecorded/unopened/in_use/finished`) × 有效期(`normal/expiring_soon/expired/unknown`)；`idle` 废弃并迁移 | `未记录` 禁入快捷开关、`未开封+已过期` 可共存 |
| **M3** | 删除与回收站机制 | **`推荐定稿` + `待用户决策`** | 删产品护历史快照(`ON DELETE SET NULL`)、按引用计数清图；**是否统一启用 7 天本地回收站列入 `UD-03`** | **`UD-03`**（优先呼应 `测试情况.docx` 7天诉求） |
| **M4** | 完整三级产品分类体系 | **`部分已确认` + `待用户决策`** | 9 一级 + **45 二级** + **91 三级**（共 145 节点，含 29 个可直选二级与全部 91 个三级）完整树（覆盖全部 V2/原型细分类型 + `美瞳` 周期由 `replacement_cycle_code` 单源驱动） | `美瞳` 独立一级=`已确认`；全树核准=`UD-01` |
| **M5** | 产品规格与拥有数量 | **`推荐定稿`** | 规格（如 `30ml/50g/10片`）描述单品；数量=未删除未用完的 `ProductItem` 件数；减量不静默删有历史记录的实例 | 继承 `Product`/`ProductItem` 分离原则 |
| **M6** | 日期与有效期规则 | **`部分已确认` + `推荐定稿`** | 7 类日期口径 + **4 层到期日来源字段**解耦；`min()` 双算规则；美妆工具默认效期豁免；美瞳包装 EXP 与抛期分离 | `min()` 规则 & 不按类猜测=`已确认` |
| **M7** | 妆容记录体系 | **`已确认` + `推荐定稿`** | **四项评分全选填 (`已确认`)**；推荐 `1～5` 整数星级、风格/场景单选预设+手填（多标签用 `tags`）、编辑保留原图/关联 | 四项评分全选填=`已确认`；UI细节=`推荐定稿` |
| **M8** | 货币与资产统计体系 | **`部分已确认` + `待用户决策`** | 默认 `CNY`；`purchase_price_minor + currency_code`；严禁 `Float` 与跨币种相加；**首页主币种单行 vs 全币种平铺列入 `UD-04`** | 底层精度与禁混加=`已确认`；首页展示=`UD-04` |
| **M9** | 生命周期转换与重置规则 | **`推荐定稿`** | 9 种转换矩阵 + 详情页独立「重置为未记录」入口；精确定义清除范围，保留主档/生产日期/效期参数/历史记录 | 取消动作零部分保存、`opened_date >= mfg` 强校验 |
| **M10** | 通用字段与分类专属属性 | **`推荐定稿` + `待用户决策`** | 「核心高频强类型列 + 美瞳结构化字段 + 中低频版本化 JSON」混合模型（拒绝 EAV）；**美瞳度数归属列入 `UD-02`** | **`UD-02`**（同款共用 `Product`、盒装度数挂 `ProductItem`） |

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
3. **旧版 `idle`（闲置）枚举处置与历史兼容方案**：
   - **`idle` 正式状态：`已废弃`**（不再作为核心 `lifecycle_status` 取值，避免“既不算未开封、又和暂放不用中的使用中重叠”造成的筛选歧义与转化弹窗复杂度）。
   - **历史数据平滑迁移**：Migration / 导入恢复逻辑检测到旧记录 `status IN ('idle', 'paused')` 时，自动转换为 `lifecycle_status = 'in_use'`，并在 `lifecycle_note` 追加 `"[迁移保留] 原状态：闲置"`（若原已有备注则换行附加），不丢失用户的历史意愿表达。对极少数“已丢弃/已转让”旧草稿词，若有 `archived_at` 则设为 `finished` 并在备注标明来源或归档，SQLite `CHECK` 严格限制在 `('unrecorded', 'unopened', 'in_use', 'finished')`。

---

### M3：删除与回收站机制（状态：`推荐定稿` 保护逻辑 + **`待用户决策 UD-03`**）
1. **删整款产品 vs 删单件实物**：
   - **删除单件实物（`ProductItem`）**：仅作用于该件实物；若 `Product` 下还有其他活跃件数，主档保留并重算汇总；若为最后一件且用户只删该实物，`Product` 主档默认保留为 0 件档案（可在产品编辑页单独删整款产品）。
   - **删除整款产品（`Product`）**：连同其名下所属 `ProductItem` 一起进入删除/回收站流程；**二次确认弹窗必须明确提示“同时移除 X 件持有实物，但历史妆容关联与记录快照将继续保留”**。
2. **历史妆容与照片安全规则（不随产品删除受损）**：
   - `look_product_items`、`routine_step_products`、`routine_log_items` 对 `product_item_id` 一律使用 **`ON DELETE SET NULL`**；产品彻底删除前即已保存完整快照（`product_name_snapshot`、`brand_name_snapshot`、`shade_snapshot`、`category_snapshot`、`spec_snapshot`），历史妆容可完整查阅当时用了哪款产品。
   - **照片引用计数清理（Ref-Count GC）**：`product_photos` 仅删除产品与媒体关联行；**仅当 `media_assets.id` 不再被任何 `product_photos`、`look_photos`、`wear_reviews`、`skin_diary_photos` 引用时**，方在事务提交后由 `MediaStore` 删除沙盒物理文件与缩略图（若正在回收站中则暂不删文件，彻底删除或期满清理时才触发）。
   - **妆容照片与产品照片完全解耦**：删产品绝不影响任何 `look_photos` 文件。
3. **回收站机制方案对比（列入 `UD-03`）**：
   - **方案 A（`推荐定稿`）：统一 7 天本地软删除回收站（`Product` / `ProductItem` / `Look` 一体支持）**
     - 来源依据：`测试情况.docx` 中用户明确提出「妆容也应支持删除，并加上 7 天回收站、7 天后自动删除或手动恢复」。
     - 技术落地：在 `products`、`product_items`、`looks` 表设置 `deleted_at`（ISO-8601 UTC）与 `trash_expires_at`（`deleted_at + 7 天`）；「我的 → 回收站」提供统一列表入口（免费可用）。
     - **恢复逻辑**：
       - **保持原有 `UUID` 恢复**：所有原 `id` 保持不变，关联的 `product_items`、`product_photos`、以及尚未置空的 `look_product_items.product_item_id` 自动重新生效。
       - **禁止恢复时自动合并同款新产品**：即使用户删后又手动新建了同名同品牌新产品，恢复时仍维持独立两款（各自 UUID 与历史关联隔离，避免错合并规格与批次）。
     - **期满与手动彻底删除**：支持单条/一键「彻底删除」；启动 App 或每日后台检查 `trash_expires_at <= now` 时在单事务内按外键安全序物理删除，并触发快照字段保全检查与无引用图片文件清理。
   - **方案 B（替代方案）：无回收站，仅保留「归档 + 二次确认直接彻底删除」**
     - 优点：少维护回收站页与过期清理任务；缺点：误删整款含多瓶历史的产品或珍贵妆容后无法反悔找回，且与 `测试情况.docx` 用户期待不一致。

---

### M4：完整三级产品分类体系与旧版迁移映射（状态：`美瞳独立=已确认`，**全树核准=`UD-01`**）

#### 5.4.1 分类树结构原则
- 采用自引用父子树：`categories(id, code UNIQUE, parent_id FK RESTRICT, level CHECK >= 1, name, definition, examples_text, default_unit, allow_direct_product, has_specialty_attrs, specialty_group_code, is_system, sort_order, is_active, deprecated_by_code)`。
- **不将树深度死锁在三层**：数据库通过 `parent_id + level` 天然支持未来 4 级扩展；V1 预设为规范三级分类（一级：大领域 → 二级：功能/步骤 → 三级：具体产品形态）。
- **`allow_direct_product` 精确控制**：大多数需选到具体三级品类（如 `底妆 → 粉底液`），但对「其他类兜底」或结构清晰无需强迫再分的叶子二级（如 `美瞳 → 彩色美瞳镜片`）设置 `allow_direct_product = 1`，允许直接选择并保存产品。
- **美瞳更换周期单一事实来源（`推荐定稿`）**：
  - 「日抛 / 双周抛 / 月抛 / 季抛 / 半年抛 / 年抛 / 其他周期」是**更换周期属性**（`replacement_cycle_code`），而非物理分类结构。
  - 若在 `categories` 建立「日抛/月抛」二级分类同时又设 `replacement_cycle_code` 字段，极易发生「分类在日抛、属性填月抛」的双重冲突。
  - **推荐架构**：`L1_LENS`（美瞳）在 `categories` 中按客观品类设为 `L2_LN_COSMETIC`（彩色美瞳镜片）、`L2_LN_CARE`（美瞳护理与伴侣盒）、`L2_LN_OTHER`（其他美瞳相关）；**`replacement_cycle_code` 作为唯一事实来源**，妆匣页面「美瞳」Tab/筛选区下的「日抛 / 月抛 / 半年抛 / 年抛 / 其他周期」胶囊完全由 `replacement_cycle_code` 动态生成展示与筛选。

#### 5.4.2 完整三级分类全表（9 一级 / 45 二级 / 91 三级，覆盖全部历史品类）

> 编码规则：稳定编码一经上线永不复用改意；前缀 `L1_` / `L2_` / `L3_` 仅代表预设种子层级，实际关系以 `parent_id` 为准。

##### 1. `L1_MAKEUP` 彩妆（10 个二级 / 34 个三级）
| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与典型产品示例 | 易混淆归属与历史映射 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_MAKEUP` | L1 | 彩妆 | `NULL` | 件 | 0 | `makeup` | 面部、眼唇眉修饰润色化妆品 | 含历史 `cat-base/lip/eye/cheek/brow` |
| `L2_MK_BASE` | L2 | 底妆 | `L1_MAKEUP` | 瓶 | 0 | `makeup` | 均匀肤色与打底类的基础面部妆品 | 不含纯粹无润色护肤防晒 |
| `L3_MK_BASE_FOUNDATION` | L3 | 粉底液 | `L2_MK_BASE` | 瓶 | 1 | `makeup` | 液体状面部粉底（如雅诗兰黛 DW、Zelens 粉底液） | 历史 `sub-foundation`/`c1-sub-foundation` |
| `L3_MK_BASE_CREAM` | L3 | 粉底膏/粉底霜 | `L2_MK_BASE` | 盒 | 1 | `makeup` | 膏状/霜状高遮瑕底妆（如 SUQQU 粉霜、Covermark） | 历史 `sub-cream-found`/`c1-sub-cream-found` |
| `L3_MK_BASE_CUSHION` | L3 | 气垫 | `L2_MK_BASE` | 盒 | 1 | `makeup` | 海绵芯便携粉底/BB（如 YSL 气垫、兰蔻气垫） | 历史 `sub-cushion`/`c1-sub-cushion` |
| `L3_MK_BASE_PRIMER` | L3 | 妆前乳 | `L2_MK_BASE` | 支 | 1 | `makeup` | 彩妆前平滑毛孔/控油/提亮打底（如 Laura Mercier） | 历史 `sub-primer`/`c1-sub-primer`；高倍防晒为主归护肤防晒 |
| `L3_MK_BASE_SUNBASE` | L3 | 隔离霜 | `L2_MK_BASE` | 支 | 1 | `makeup` | 润色修颜妆前隔离（如 CPB 长管隔离、兰芝紫隔） | 历史 `sub-sunbase`/`c1-sub-sunbase` |
| `L3_MK_BASE_BB_CC` | L3 | BB/CC霜/素颜霜 | `L2_MK_BASE` | 支 | 1 | `makeup` | 轻底妆或提亮润色素颜霜（如 W.Lab、珂莱欧 BB） | 无润色纯护肤保湿面霜归 `L3_SK_EC_CREAM` |
| `L2_MK_CONCEALER` | L2 | 遮瑕 | `L1_MAKEUP` | 支 | 0 | `makeup` | 局部瑕疵、黑眼圈、痘印修饰产品 | 独立自原底妆遮瑕，便于精细筛选 |
| `L3_MK_CONCEALER_LIQUID` | L3 | 遮瑕液 | `L2_MK_CONCEALER` | 支 | 1 | `makeup` | 刷头液体遮瑕（如 NARS 遮瑕蜜、美宝莲橡皮擦） | 历史 `sub-concealer`/`c1-sub-concealer` 默认映射目标 |
| `L3_MK_CONCEALER_CREAM` | L3 | 遮瑕膏/遮瑕盘 | `L2_MK_CONCEALER` | 盘 | 1 | `makeup` | 罐装膏体或多色遮瑕盘（如 IPSA 三色、毛戈平） | — |
| `L3_MK_CONCEALER_PENCIL` | L3 | 遮瑕笔/遮瑕棒 | `L2_MK_CONCEALER` | 支 | 1 | `makeup` | 笔状/棒状点涂遮瑕 | — |
| `L2_MK_SETTING` | L2 | 定妆 | `L1_MAKEUP` | 盒 | 0 | `makeup` | 控油、柔焦并固定妆面的产品 | 从原底妆粉类独立 |
| `L3_MK_SETTING_LOOSE` | L3 | 散粉/蜜粉 | `L2_MK_SETTING` | 盒 | 1 | `makeup` | 散粉状定妆粉（如纪梵希四宫格、NARS 大白饼散粉） | 历史 `sub-loose-powder`/`c1-sub-loose-powder` |
| `L3_MK_SETTING_PRESSED` | L3 | 粉饼/蜜粉饼 | `L2_MK_SETTING` | 盒 | 1 | `makeup` | 压盘便携补妆/定妆粉饼（如 MAC、E大饼） | 历史 `sub-pressed-powder`/`c1-sub-pressed-powder`；膏状固态按湿粉看，压粉归此 |
| `L3_MK_SETTING_SPRAY` | L3 | 定妆喷雾 | `L2_MK_SETTING` | 瓶 | 1 | `makeup` | 成膜锁妆喷雾（如 UD、柏瑞美） | 普通保湿补水喷雾归 `L3_SK_TN_MIST` |
| `L2_MK_LIP` | L2 | 唇部产品 | `L1_MAKEUP` | 支 | 0 | `makeup` | 唇部色彩修饰产品 | 无色纯护唇归 `L3_SK_OT_LIPBALM` |
| `L3_MK_LIP_STICK` | L3 | 口红/唇膏 | `L2_MK_LIP` | 支 | 1 | `makeup` | 固体管装有色唇膏（如 MAC 子弹头、TF 黑管） | 历史 `sub-lipstick`/`c1-sub-lipstick` |
| `L3_MK_LIP_GLAZE` | L3 | 唇釉 | `L2_MK_LIP` | 支 | 1 | `makeup` | 带刷头哑光/镜面唇釉（如 YSL、INTO YOU 水雾） | 历史 `sub-lipglaze`/`c1-sub-lipglaze` |
| `L3_MK_LIP_GLOSS` | L3 | 唇蜜/唇油 | `L2_MK_LIP` | 支 | 1 | `makeup` | 高光泽透明或半透润色唇蜜/唇油（如 Dior 丰唇蜜） | 历史 `sub-lipgloss`/`c1-sub-lipgloss` |
| `L3_MK_LIP_MUD` | L3 | 唇泥 | `L2_MK_LIP` | 支 | 1 | `makeup` | 泥状丝绒哑光唇部彩妆（如 INTO YOU 女主唇泥） | — |
| `L3_MK_LIP_LINER` | L3 | 唇线笔 | `L2_MK_LIP` | 支 | 1 | `makeup` | 勾勒唇形或丰唇阴影笔（如 CT Pillow Talk） | 历史 `sub-lipliner`/`c1-sub-lipliner` |
| `L3_MK_LIP_TINTED_BALM` | L3 | 有色润唇膏 | `L2_MK_LIP` | 支 | 1 | `makeup` | 兼具显色提气色与润唇功能（如 Dior 变色唇膏） | 与无色护理润唇膏清晰区分 |
| `L2_MK_EYE` | L2 | 眼部产品 | `L1_MAKEUP` | 支 | 0 | `makeup` | 眼影、眼线、睫毛饰妆品 | — |
| `L3_MK_EYE_PALETTE` | L3 | 眼影盘/单色眼影 | `L2_MK_EYE` | 盘 | 1 | `makeup` | 粉状单色或多色眼影盘（如 TF 20、3CE 九宫格） | 历史 `sub-eyeshadow`/`c1-sub-eyeshadow` |
| `L3_MK_EYE_LIQUID` | L3 | 液体眼影/眼影棒 | `L2_MK_EYE` | 支 | 1 | `makeup` | 液体闪片、眼影蜜或眼影笔 | — |
| `L3_MK_EYE_LINER` | L3 | 眼线笔/液/胶笔 | `L2_MK_EYE` | 支 | 1 | `makeup` | 眼线液笔、眼线胶笔、眼线膏（如 KissMe） | 历史 `sub-eyeliner`/`c1-sub-eyeliner` |
| `L3_MK_EYE_MASCARA` | L3 | 睫毛膏/打底 | `L2_MK_EYE` | 支 | 1 | `makeup` | 纤长浓密睫毛膏与睫毛打底（如艾杜纱、兰蔻） | 历史 `sub-mascara`/`c1-sub-mascara` |
| `L3_MK_EYE_LASHES` | L3 | 假睫毛 | `L2_MK_EYE` | 盒 | 1 | `makeup` | 分段式/整排假睫毛（支持单位 `盒`/`副`/`对`） | 历史 `sub-lashes`/`c1-sub-lashes`；胶水/镊子可入工具或此 |
| `L3_MK_EYE_PRIMER` | L3 | 眼部打底 | `L2_MK_EYE` | 支 | 1 | `makeup` | 防眼影积线晕妆（如 UD 眼部打底） | — |
| `L2_MK_BLUSH` | L2 | 腮红 | `L1_MAKEUP` | 块 | 1 | `makeup` | 面颊红润提气色彩妆 | 由原「腮红修容」拆分独立 |
| `L3_MK_BLUSH_POWDER` | L3 | 粉状腮红 | `L2_MK_BLUSH` | 块 | 1 | `makeup` | 单色/多色压粉腮红（如 NARS Orgasm、倩碧小雏菊） | 历史 `sub-blush`/`c1-sub-blush` |
| `L3_MK_BLUSH_CREAM` | L3 | 膏状/液体腮红 | `L2_MK_BLUSH` | 支 | 1 | `makeup` | 腮红膏、腮红棒、液体腮红（如 Rare Beauty） | — |
| `L2_MK_CONTOUR` | L2 | 修容 | `L1_MAKEUP` | 盘 | 1 | `makeup` | 鼻影、侧影与面部立体塑形阴影产品 | 由原「腮红修容」拆分独立 |
| `L3_MK_CONTOUR_POWDER` | L3 | 修容粉/修容盘 | `L2_MK_CONTOUR` | 盘 | 1 | `makeup` | 双色/三色阴影粉盘（如彩棠三色、KA 修容） | 历史 `sub-contour`/`c1-sub-contourpowder` |
| `L3_MK_CONTOUR_STICK` | L3 | 修容棒/修容液 | `L2_MK_CONTOUR` | 支 | 1 | `makeup` | 膏体棒状或液体修容（如 Fenty Beauty） | — |
| `L2_MK_HIGHLIGHTER` | L2 | 高光 | `L1_MAKEUP` | 块 | 1 | `makeup` | 面部提亮、哑光膨胀色或珠光高光 | 由原「腮红修容」拆分独立 |
| `L3_MK_HL_POWDER` | L3 | 高光粉/高光盘 | `L2_MK_HIGHLIGHTER` | 块 | 1 | `makeup` | 粉饼状细闪或哑光提亮粉（如 Becca、资生堂 WT905） | 历史 `sub-highlighter`/`c1-sub-highlighter` |
| `L3_MK_HL_LIQUID` | L3 | 高光液/高光棒 | `L2_MK_HIGHLIGHTER` | 支 | 1 | `makeup` | 液体或膏棒状高光 | — |
| `L2_MK_BROW` | L2 | 眉部产品 | `L1_MAKEUP` | 支 | 0 | `makeup` | 眉毛塑形、填色与定型产品 | — |
| `L3_MK_BROW_PENCIL` | L3 | 眉笔 | `L2_MK_BROW` | 支 | 1 | `makeup` | 极细/砍刀/双头眉笔（如植村秀、花洛莉亚） | 历史 `sub-browpencil`/`c1-sub-browpencil` |
| `L3_MK_BROW_POWDER` | L3 | 眉粉/眉膏 | `L2_MK_BROW` | 盒 | 1 | `makeup` | 压盘眉粉与罐装眉膏（如 KATE 三色眉粉） | 历史 `sub-browpowder`/`c1-sub-browpowder` |
| `L3_MK_BROW_GEL` | L3 | 染眉膏/眉胶 | `L2_MK_BROW` | 支 | 1 | `makeup` | 改变眉色或定型野生眉（如 KissMe 染眉膏） | 历史 `sub-browgel`/`c1-sub-browgel` |
| `L2_MK_OTHER` | L2 | 其他彩妆 | `L1_MAKEUP` | 件 | 1 | `makeup` | 综合彩妆盘或特殊彩妆兜底 | — |
| `L3_MK_OT_FACE_PALETTE` | L3 | 面部综合盘 | `L2_MK_OTHER` | 盘 | 1 | `makeup` | 集腮红+修容+高光或眼颊于一体综合盘（如彩棠综合盘） | 避免用户在腮红/修容间反复纠结 |

##### 2. `L1_SKINCARE` 护肤（8 个二级 / 21 个三级）
| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与典型产品示例 | 易混淆归属与历史映射 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_SKINCARE` | L1 | 护肤 | `NULL` | 瓶 | 0 | `skincare` | 面部洁净、保湿、修护及防晒护理品 | 历史 `cat-care`/`c1-cat-care` |
| `L2_SK_CLEAN` | L2 | 清洁 | `L1_SKINCARE` | 瓶 | 0 | `skincare` | 卸妆及面部表层清洁护理 | 身体沐浴露归 `L1_BODYCARE` |
| `L3_SK_CL_OIL` | L3 | 卸妆油/卸妆膏 | `L2_SK_CLEAN` | 瓶 | 1 | `skincare` | 乳化型洁颜油与卸妆膏（如植村秀琥珀、芭妮兰） | — |
| `L3_SK_CL_WATER` | L3 | 卸妆水/眼唇卸 | `L2_SK_CLEAN` | 瓶 | 1 | `skincare` | 水状及水油分离眼唇卸妆（如贝德玛、曼丹） | — |
| `L3_SK_CL_WASH` | L3 | 洁面乳/啫喱/慕斯 | `L2_SK_CLEAN` | 支 | 1 | `skincare` | 氨基酸/皂基洗面奶、洁颜蜜（如芙丽芳丝） | — |
| `L3_SK_CL_EXFOLIATE` | L3 | 面部去角质/磨砂 | `L2_SK_CLEAN` | 支 | 1 | `skincare` | 刷酸棉片、清洁凝露、磨砂膏 | 身体磨砂膏归 `L3_BD_CL_SCRUB` |
| `L2_SK_TONER` | L2 | 保湿水类 | `L1_SKINCARE` | 瓶 | 0 | `skincare` | 补水与二次调理液态水剂 | — |
| `L3_SK_TN_TONER` | L3 | 化妆水/爽肤水 | `L2_SK_TONER` | 瓶 | 1 | `skincare` | 常规爽肤水、柔肤水、收敛水（如悦木之源菌菇水） | 历史 `sub-toner`/`c1-sub-toner` |
| `L3_SK_TN_ESSENCE_WATER` | L3 | 精华水/肌底水 | `L2_SK_TONER` | 瓶 | 1 | `skincare` | 高浓度活性精华水（如 SK-II 神仙水、兰蔻极光水） | — |
| `L3_SK_TN_MIST` | L3 | 保湿喷雾 | `L2_SK_TONER` | 瓶 | 1 | `skincare` | 随时补水舒缓喷雾（如理肤泉、雅漾大喷） | 成膜锁妆用归 `L3_MK_SETTING_SPRAY` |
| `L2_SK_SERUM` | L2 | 精华 | `L1_SKINCARE` | 瓶 | 0 | `skincare` | 高浓度功效型修护/抗老/美白精华 | — |
| `L3_SK_SR_ESSENCE` | L3 | 精华液/肌底液 | `L2_SK_SERUM` | 瓶 | 1 | `skincare` | 滴管或按压面部精华（如雅诗兰黛小棕瓶、修丽可 CE） | 历史 `sub-serum`/`c1-sub-serum` |
| `L3_SK_SR_AMPOULE` | L3 | 安瓶/次抛精华 | `L2_SK_SERUM` | 盒 | 1 | `skincare` | 独立支装高活性次抛/安瓶（如润百颜、夸迪） | 规格填如 `30支` |
| `L3_SK_SR_OIL` | L3 | 护肤精华油 | `L2_SK_SERUM` | 瓶 | 1 | `skincare` | 以油养肤面部油（如娇韵诗双萃/兰花油） | 护发油归 `L3_HR_CD_OIL` |
| `L2_SK_EMULSION_CREAM` | L2 | 乳液面霜 | `L1_SKINCARE` | 瓶 | 0 | `skincare` | 面部锁水滋润乳与霜 | — |
| `L3_SK_EC_LOTION` | L3 | 乳液 | `L2_SK_EMULSION_CREAM` | 瓶 | 1 | `skincare` | 流动性面部乳液（如黛珂牛油果、倩碧黄油） | 身体乳归 `L3_BD_LT_LOTION` |
| `L3_SK_EC_CREAM` | L3 | 面霜/凝霜/晚霜 | `L2_SK_EMULSION_CREAM` | 瓶 | 1 | `skincare` | 霜状/啫喱状滋润面霜（如海蓝之谜、黑绷带） | 历史 `sub-cream`/`c1-sub-cream` |
| `L2_SK_SUNSCREEN` | L2 | 防晒 | `L1_SKINCARE` | 支 | 0 | `skincare` | 面部光防护防晒（SPF/PA 为属性不拆分类） | 大容量身体专用防晒归 `L2_BD_SUNSCREEN` |
| `L3_SK_SS_LOTION` | L3 | 防晒霜/防晒乳 | `L2_SK_SUNSCREEN` | 支 | 1 | `skincare` | 面部日常/户外防晒乳/摇摇乐（如安耐晒、怡丽丝尔） | 历史 `sub-sunscreen`/`c1-sub-sunscreen` |
| `L3_SK_SS_SPRAY_STICK` | L3 | 防晒喷雾/防晒棒 | `L2_SK_SUNSCREEN` | 支 | 1 | `skincare` | 面部补涂用喷雾或固体防晒棒 | — |
| `L2_SK_MASK` | L2 | 面膜 | `L1_SKINCARE` | 盒 | 0 | `skincare` | 集中敷贴或涂抹面部护理 | — |
| `L3_SK_MK_SHEET` | L3 | 贴片面膜 | `L2_SK_MASK` | 盒 | 1 | `skincare` | 膜布袋装片状面膜（规格常用 `5片`/`10片`） | — |
| `L3_SK_MK_WASH` | L3 | 涂抹面膜/泥膜 | `L2_SK_MASK` | 罐 | 1 | `skincare` | 水洗清洁泥膜/涂抹修护面膜（如科颜氏白泥） | — |
| `L3_SK_MK_SLEEP` | L3 | 睡眠面膜 | `L2_SK_MASK` | 罐 | 1 | `skincare` | 夜间免洗修护面膜（如兰芝、Fresh 红茶） | — |
| `L2_SK_EYE` | L2 | 眼部护理 | `L1_SKINCARE` | 支 | 0 | `skincare` | 眼周抗老、保湿及去肿产品 | — |
| `L3_SK_EY_CREAM` | L3 | 眼霜/眼部精华 | `L2_SK_EYE` | 支 | 1 | `skincare` | 眼周霜/精华（如兰蔻发光眼霜、小棕瓶眼霜） | — |
| `L3_SK_EY_PATCH` | L3 | 眼膜 | `L2_SK_EYE` | 盒 | 1 | `skincare` | 凝胶或膜布贴片眼膜（如悦薇眼膜） | — |
| `L2_SK_OTHER` | L2 | 其他护肤 | `L1_SKINCARE` | 支 | 1 | `skincare` | 护唇护理及点涂修护产品 | — |
| `L3_SK_OT_LIPBALM` | L3 | 润唇膏/唇膜 | `L2_SK_OTHER` | 支 | 1 | `skincare` | 无色日常润唇护理及睡眠唇膜（如依泉、兰芝唇膜） | **历史 `sub-lipbalm` 默认映射此节点**；有色归 `L3_MK_LIP_TINTED_BALM` |
| `L3_SK_OT_SPOT` | L3 | 局部点涂/痘痘贴 | `L2_SK_OTHER` | 支 | 1 | `skincare` | 祛痘膏、水杨酸点涂液、隐形痘痘贴 | — |

##### 3. `L1_FRAGRANCE` 香水香氛（4 个二级 / 4 个三级）
> 规则红线：**香型、前中后调、香精浓度（Parfum/EDP/EDT/EDC）属于专属属性，严禁拆成子分类**。

| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与示例 | 历史映射与边界 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_FRAGRANCE` | L1 | 香水香氛 | `NULL` | 瓶 | 0 | `fragrance` | 个人用香与随身香氛制品 | — |
| `L2_FR_PERFUME` | L2 | 香水 | `L1_FRAGRANCE` | 瓶 | 1 | `fragrance` | 酒精基底常规及便携香水 | 含 EDP/EDT/古龙等全部浓度 |
| `L3_FR_PF_SPRAY` | L3 | 常规喷雾香水 | `L2_FR_PERFUME` | 瓶 | 1 | `fragrance` | 正装/Q香/试管喷雾（如祖玛珑、Byredo） | 按容量区分规格，不分Q香正装类 |
| `L3_FR_PF_ROLL` | L3 | 滚珠/涂抹香水 | `L2_FR_PERFUME` | 支 | 1 | `fragrance` | 滚珠/蘸取式香油或便携香 | — |
| `L2_FR_MIST` | L2 | 香氛喷雾 | `L1_FRAGRANCE` | 瓶 | 1 | `fragrance` | 低浓度身体或头发微香喷雾 | 护肤保湿喷雾归 `L3_SK_TN_MIST` |
| `L3_FR_MS_MIST` | L3 | 身体/发香喷雾 | `L2_FR_MIST` | 瓶 | 1 | `fragrance` | 如香奈儿发香雾、维密香氛喷雾 | — |
| `L2_FR_SOLID` | L2 | 香膏 | `L1_FRAGRANCE` | 盒 | 1 | `fragrance` | 固体蜡基随身香膏 | — |
| `L3_FR_SD_BALM` | L3 | 固体香膏 | `L2_FR_SOLID` | 盒 | 1 | `fragrance` | 如 Diptyque、TAMBURINS 香膏 | — |
| `L2_FR_OTHER` | L2 | 其他香氛 | `L1_FRAGRANCE` | 瓶 | 1 | `fragrance` | 香薰蜡烛/无火扩香等梳妆台扩香兜底 | — |

##### 4. `L1_BODYCARE` 身体护理（5 个二级 / 8 个三级）
| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与示例 | 边界说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_BODYCARE` | L1 | 身体护理 | `NULL` | 瓶 | 0 | `skincare` | 颈部以下全身皮肤清洁、滋润与防护 | — |
| `L2_BD_CLEAN` | L2 | 身体清洁 | `L1_BODYCARE` | 瓶 | 0 | `skincare` | 沐浴清洗与角质护理 | — |
| `L3_BD_CL_WASH` | L3 | 沐浴露/油/香皂 | `L2_BD_CLEAN` | 瓶 | 1 | `skincare` | 沐浴露、沐浴油、洁肤皂 | 面部洁面归 `L3_SK_CL_WASH` |
| `L3_BD_CL_SCRUB` | L3 | 身体磨砂膏 | `L2_BD_CLEAN` | 罐 | 1 | `skincare` | 去角质身体磨砂（如 Sabon、Dove） | — |
| `L2_BD_LOTION` | L2 | 身体乳 | `L1_BODYCARE` | 瓶 | 1 | `skincare` | 身体保湿乳霜与精华油 | — |
| `L3_BD_LT_LOTION` | L3 | 身体乳/身体霜 | `L2_BD_LOTION` | 瓶 | 1 | `skincare` | 果酸身体乳、舒缓身体霜（如适乐肤、欧舒丹） | — |
| `L3_BD_LT_OIL` | L3 | 身体护理油 | `L2_BD_LOTION` | 瓶 | 1 | `skincare` | 身体滋养/紧致按摩油（如娇韵诗、帕玛氏） | — |
| `L2_BD_SUNSCREEN` | L2 | 身体防晒 | `L1_BODYCARE` | 瓶 | 1 | `skincare` | 大容量专用于肢体或户外喷涂的防晒 | 面部优先且日常用归 `L2_SK_SUNSCREEN` |
| `L3_BD_SS_BODY` | L3 | 身体防晒乳/喷雾 | `L2_BD_SUNSCREEN` | 瓶 | 1 | `skincare` | 香蕉船、水宝宝大瓶等 | — |
| `L2_BD_CARE` | L2 | 身体局部护理 | `L1_BODYCARE` | 支 | 0 | `skincare` | 手足颈及体味管理专项品 | — |
| `L3_BD_CR_HAND` | L3 | 护手霜 | `L2_BD_CARE` | 支 | 1 | `skincare` | 手部滋润霜（如欧舒丹乳木果、茱莉蔻） | — |
| `L3_BD_CR_FOOT_NECK` | L3 | 护足霜/颈霜 | `L2_BD_CARE` | 支 | 1 | `skincare` | 足跟霜、颈纹护理霜 | — |
| `L3_BD_CR_DEODORANT` | L3 | 止汗露/体香走珠 | `L2_BD_CARE` | 支 | 1 | `skincare` | 腋下止汗走珠、香体棒 | 专供喷洒用香归 `L1_FRAGRANCE` |
| `L2_BD_OTHER` | L2 | 其他身体护理 | `L1_BODYCARE` | 瓶 | 1 | `skincare` | 私处洗液、身体膜等身体护理兜底 | — |

##### 5. `L1_HAIRCARE` 头发洗护（5 个二级 / 6 个三级）
| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与示例 | 边界说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_HAIRCARE` | L1 | 头发洗护 | `NULL` | 瓶 | 0 | `haircare` | 头皮与发丝清洁、修护及造型 | — |
| `L2_HR_SHAMPOO` | L2 | 洗发 | `L1_HAIRCARE` | 瓶 | 1 | `haircare` | 清洁发丝与头皮的产品 | — |
| `L3_HR_SH_SHAMPOO` | L3 | 洗发水/洗发膏 | `L2_HR_SHAMPOO` | 瓶 | 1 | `haircare` | 控油/蓬松/去屑洗发露与海盐膏（如卡诗、卡诗白金） | — |
| `L3_HR_SH_SCALP` | L3 | 头皮磨砂/精华 | `L2_HR_SHAMPOO` | 瓶 | 1 | `haircare` | 头皮清洁磨砂膏、防脱头皮精华（如 CR、Grow Gorgeous） | — |
| `L3_HR_SH_DRY` | L3 | 干发喷雾 | `L2_HR_SHAMPOO` | 瓶 | 1 | `haircare` | 免洗去油蓬松干发喷雾（如 Batiste、Spes） | — |
| `L2_HR_CONDITIONER` | L2 | 护发 | `L1_HAIRCARE` | 瓶 | 1 | `haircare` | 抚平毛躁的日常润发/免洗护发品 | — |
| `L3_HR_CD_RINSE` | L3 | 护发素 | `L2_HR_CONDITIONER` | 瓶 | 1 | `haircare` | 冲洗型润发乳（如潘婷、资生堂） | — |
| `L3_HR_CD_OIL` | L3 | 护发精油/免洗乳 | `L2_HR_CONDITIONER` | 瓶 | 1 | `haircare` | 护发精油、防热损伤喷雾、免洗素（如摩洛哥油） | — |
| `L2_HR_MASK` | L2 | 发膜 | `L1_HAIRCARE` | 罐 | 1 | `haircare` | 深层修护发膜/倒膜（如资生堂 Fino、K18） | — |
| `L2_HR_STYLING` | L2 | 造型 | `L1_HAIRCARE` | 瓶 | 1 | `haircare` | 固定发型、打造卷度或蓬松质地产品 | 发香雾（纯粹留香）归 `L3_FR_MS_MIST` |
| `L3_HR_ST_SPRAY_WAX` | L3 | 定型喷雾/发蜡/弹力素 | `L2_HR_STYLING` | 瓶 | 1 | `haircare` | 定型喷雾、发泥、泡沫发蜡、卷发弹力素 | — |
| `L2_HR_OTHER` | L2 | 其他头发洗护 | `L1_HAIRCARE` | 盒 | 1 | `haircare` | 染发剂、头皮防晒等头发产品兜底 | — |

##### 6. `L1_NAILCARE` 美甲护理（4 个二级 / 6 个三级）
| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与示例 | 边界说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_NAILCARE` | L1 | 美甲护理 | `NULL` | 瓶 | 0 | `makeup` | 指甲涂饰、修护及配套美甲器具耗材 | — |
| `L2_NL_POLISH` | L2 | 指甲油 | `L1_NAILCARE` | 瓶 | 0 | `makeup` | 指甲色彩涂层与护甲涂剂 | — |
| `L3_NL_PL_REGULAR` | L3 | 普通指甲油 | `L2_NL_POLISH` | 瓶 | 1 | `makeup` | 自然风干指甲油/水性可撕拉指甲油（如 OPI） | — |
| `L3_NL_PL_GEL` | L3 | 甲油胶 | `L2_NL_POLISH` | 瓶 | 1 | `makeup` | 需照灯固化的光疗甲油胶（支持色号） | — |
| `L3_NL_PL_CARE` | L3 | 底油/亮油/指缘油 | `L2_NL_POLISH` | 瓶 | 1 | `makeup` | 加钙底油、封层亮油、指缘营养油 | — |
| `L2_NL_TOOL` | L2 | 美甲工具 | `L1_NAILCARE` | 套 | 1 | `tool` | 修甲/穿戴甲/光疗器材（无有效期强制） | 普通修眉工具归 `L1_TOOLS` |
| `L3_NL_TL_IMPLEMENT` | L3 | 指甲剪/挫条/光疗灯 | `L2_NL_TOOL` | 把 | 1 | `tool` | 死皮剪、海绵搓、手持美甲灯 | — |
| `L3_NL_TL_TIPS` | L3 | 穿戴甲/甲片 | `L2_NL_TOOL` | 盒 | 1 | `tool` | 手工穿戴甲成品盒及果冻胶配套（常用单位 `盒`/`副`） | — |
| `L2_NL_REMOVER` | L2 | 卸甲产品 | `L1_NAILCARE` | 瓶 | 1 | `tool` | 溶解卸除甲油或甲油胶产品 | 需效期管理（`tracked`） |
| `L3_NL_RM_LIQUID` | L3 | 卸甲水/卸甲巾 | `L2_NL_REMOVER` | 瓶 | 1 | `tool` | 洗甲水、锡纸包卸甲片、卸胶膏 | — |
| `L2_NL_OTHER` | L2 | 其他美甲护理 | `L1_NAILCARE` | 件 | 1 | `tool` | 甲面饰品钻、美甲胶水等兜底 | — |

##### 7. `L1_TOOLS` 美妆工具（5 个二级 / 10 个三级）
> 规则红线：除清洗液外，其余器具默认 `expiry_management_mode = 'optional'`，**免强制有效期、不展示刺眼「无法判断」警告**。

| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与示例 | 边界说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_TOOLS` | L1 | 美妆工具 | `NULL` | 件 | 0 | `tool` | 上妆刷扑、修容工具及梳妆收纳辅助品 | **严禁混入美瞳** |
| `L2_TL_BRUSH` | L2 | 化妆刷 | `L1_TOOLS` | 支 | 1 | `tool` | 动物毛或人造纤维上妆刷具 | — |
| `L3_TL_BR_FACE` | L3 | 面部刷 | `L2_TL_BRUSH` | 支 | 1 | `tool` | 散粉刷、粉底刷、腮红刷、高光修容刷 | — |
| `L3_TL_BR_EYE_LIP` | L3 | 眼唇与细节刷 | `L2_TL_BRUSH` | 支 | 1 | `tool` | 眼影晕染刷、遮瑕刷、眉刷、唇刷 | — |
| `L3_TL_BR_SET` | L3 | 化妆刷套装 | `L2_TL_BRUSH` | 套 | 1 | `tool` | 整套盒装/袋装多支化妆刷（如受受狼套刷） | — |
| `L2_TL_SPONGE` | L2 | 美妆蛋与粉扑 | `L1_TOOLS` | 个 | 1 | `tool` | 海绵美妆蛋与干湿粉扑 | — |
| `L3_TL_SP_EGG` | L3 | 美妆蛋 | `L2_TL_SPONGE` | 个 | 1 | `tool` | 葫芦/斜切非乳胶美妆蛋（如 Beautyblender） | — |
| `L3_TL_SP_PUFF` | L3 | 粉扑/气垫扑 | `L2_TL_SPONGE` | 盒 | 1 | `tool` | 尔木萄粉扑、气垫替换粉扑、棉花糖粉扑 | — |
| `L2_TL_CURLER` | L2 | 睫毛夹 | `L1_TOOLS` | 把 | 1 | `tool` | 卷翘睫毛辅助器械 | — |
| `L3_TL_CL_MANUAL` | L3 | 手动睫毛夹 | `L2_TL_CURLER` | 把 | 1 | `tool` | 广角/局部睫毛夹（如植村秀、无印良品） | — |
| `L3_TL_CL_HEATED` | L3 | 电热烫睫毛器 | `L2_TL_CURLER` | 支 | 1 | `tool` | 充电加热睫毛卷翘器 | — |
| `L2_TL_OTHER` | L2 | 其他化妆工具 | `L1_TOOLS` | 件 | 1 | `tool` | 修眉剪镊、化妆棉与洗刷液 | — |
| `L3_TL_OT_COTTON` | L3 | 化妆棉/棉签/吸油纸 | `L2_TL_OTHER` | 盒 | 1 | `tool` | 省水湿敷化妆棉、尖头棉签、面部吸油面纸 | — |
| `L3_TL_OT_IMPLEMENT` | L3 | 修眉刀/镊子/假睫毛夹 | `L2_TL_OTHER` | 把 | 1 | `tool` | 修眉刀、粉刺针、辅助佩戴假睫毛镊子 | 美瞳佩戴工具归 `L2_LN_CARE` |
| `L3_TL_OT_CLEANSER` | L3 | 刷具/粉扑清洗剂 | `L2_TL_OTHER` | 瓶 | 1 | `tool` | **液体洗刷水（特例：`expiry_management_mode = 'tracked'`）** | — |
| `L2_TL_STORAGE` | L2 | 收纳工具 | `L1_TOOLS` | 个 | 1 | `tool` | 化妆包、桌面亚克力刷桶与随身镜 | — |

##### 8. `L1_LENS` 美瞳（3 个二级 / 0 独立周期三级，周期由 `replacement_cycle_code` 唯一驱动）
> **单源防冲突定稿说明**：日抛、月抛、半年抛、年抛本质为结构化更换周期属性（`replacement_cycle_code`）。若同时建成二级分类和产品属性字段，必定冲突。因此 `L1_LENS` 下在 `categories` 只保留 3 个客观品类节点，**界面按「日抛 / 双周抛 / 月抛 / 季抛 / 半年抛 / 年抛 / 其他周期」浏览筛选时，查询层直接由 `replacement_cycle_code` 动态分组与渲染！**

| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与示例 | 边界与单源规则 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_LENS` | L1 | 美瞳 | `NULL` | 盒 | 0 | `lens` | **独立一级分类**，彩色软性角膜接触镜及配套护理品 | 禁止归入美妆工具或其他 |
| `L2_LN_COSMETIC` | L2 | 彩色美瞳镜片 | `L1_LENS` | 盒 | 1 | `lens` | 各类彩色软性隐形眼镜（如 Olens Scandi、可啦啦、博士伦） | **更换周期强制通过 `replacement_cycle_code` 单源选择**（日抛/月抛/半年抛/年抛等） |
| `L2_LN_CARE` | L2 | 美瞳护理与伴侣盒 | `L1_LENS` | 瓶 | 1 | `tool` | 隐形眼镜护理液、润眼液、伴侣盒、佩戴钳 | 护理液适用开封后效期（如 90 天 PAO）；镜片本身归 `L2_LN_COSMETIC` |
| `L2_LN_OTHER` | L2 | 其他美瞳相关 | `L1_LENS` | 盒 | 1 | `lens` | 周期未明、特殊功能片或其他美瞳配套兜底 | — |

##### 9. `L1_OTHER` 其他（1 个二级 / 2 个三级）
| 编码 | 层级 | 名称 | 父级 | 默认单位 | 可直选 | 专属属性组 | 定义与示例 | 边界说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `L1_OTHER` | L1 | 其他 | `NULL` | 件 | 1 | `none` | 跨类组合套盒及极少数无法归入前 8 大类的产品 | 严禁将有清晰归属的单品偷懒归入本类 |
| `L2_OT_GENERAL` | L2 | 未归类/综合美妆 | `L1_OTHER` | 件 | 1 | `none` | 兜底二级节点 | — |
| `L3_OT_GIFT_SET` | L3 | 综合礼盒/中样套装 | `L2_OT_GENERAL` | 套 | 1 | `none` | 跨彩妆护肤的圣诞倒数日历或旅行多件套盒（暂不想拆单录入时） | 强烈推荐拆分为独立单品入账 |
| `L3_OT_UNCLASSIFIED` | L3 | 其他暂未归类物品 | `L2_OT_GENERAL` | 件 | 1 | `none` | 极少数待后续版本扩展新分类的美妆相关物品 | — |

*(统计核对：9 个一级分类，45 个二级分类，91 个三级具体产品类型，总计 145 个分类节点；其中 `allow_direct_product = 1` 的 29 个可直选二级叶子与全部 91 个三级合计 120 个可直接挂接产品的末端节点。)*

#### 5.4.3 历史分类完整迁移映射表（覆盖 `store.js`、`seedData.js`、`c1-mock-data.js`、`V2.0` 原型全部 6+24 分类）

| 旧版原型一级分类 | 旧版子分类编码（含 C1/正式原型别名） | 旧版展示名 | 新一级分类 | 新二级分类 | 新三级目标节点（稳定编码） | 迁移说明与冲突处置 |
| --- | --- | --- | --- | --- | --- | --- |
| 底妆 (`cat-base`/`c1-cat-base`) | `sub-foundation` / `c1-sub-foundation` | 粉底液 | 彩妆 | 底妆 | `L3_MK_BASE_FOUNDATION`（粉底液） | 1:1 无损直迁 |
| 底妆 | `sub-cream-found` / `c1-sub-cream-found` | 粉底膏 | 彩妆 | 底妆 | `L3_MK_BASE_CREAM`（粉底膏/粉底霜） | 名称语义扩展兼容粉霜，直迁 |
| 底妆 | `sub-cushion` / `c1-sub-cushion` | 气垫 | 彩妆 | 底妆 | `L3_MK_BASE_CUSHION`（气垫） | 1:1 无损直迁 |
| 底妆 | `sub-concealer` / `c1-sub-concealer` | 遮瑕 | 彩妆 | 遮瑕 | `L3_MK_CONCEALER_LIQUID`（遮瑕液） | 默认迁至最常见遮瑕液；备注若写"三色盘/膏"提示可在详情改至遮瑕膏/盘，不丢数据 |
| 底妆 | `sub-primer` / `c1-sub-primer` | 妆前乳 | 彩妆 | 底妆 | `L3_MK_BASE_PRIMER`（妆前乳） | 1:1 无损直迁 |
| 底妆 | `sub-sunbase` / `c1-sub-sunbase` | 隔离霜 | 彩妆 | 底妆 | `L3_MK_BASE_SUNBASE`（隔离霜） | 1:1 无损直迁 |
| 底妆 | `sub-loose-powder` / `c1-sub-loose-powder` | 散粉 | 彩妆 | 定妆 | `L3_MK_SETTING_LOOSE`（散粉/蜜粉） | 由底妆重组至定妆二级 |
| 底妆 | `sub-pressed-powder` / `c1-sub-pressed-powder` | 粉饼 | 彩妆 | 定妆 | `L3_MK_SETTING_PRESSED`（粉饼/蜜粉饼） | 由底妆重组至定妆二级 |
| 唇妆 (`cat-lip`/`c1-cat-lip`) | `sub-lipstick` / `c1-sub-lipstick` | 口红 | 彩妆 | 唇部产品 | `L3_MK_LIP_STICK`（口红/唇膏） | 1:1 无损直迁 |
| 唇妆 | `sub-lipglaze` / `c1-sub-lipglaze` | 唇釉 | 彩妆 | 唇部产品 | `L3_MK_LIP_GLAZE`（唇釉） | 1:1 无损直迁 |
| 唇妆 | `sub-lipgloss` / `c1-sub-lipgloss` | 唇蜜 | 彩妆 | 唇部产品 | `L3_MK_LIP_GLOSS`（唇蜜/唇油） | 1:1 无损直迁 |
| 唇妆 | `sub-lipliner` / `c1-sub-lipliner` | 唇线笔 | 彩妆 | 唇部产品 | `L3_MK_LIP_LINER`（唇线笔） | 1:1 无损直迁 |
| 唇妆 | `sub-lipbalm` / `c1-sub-lipbalm` | 润唇膏 | 护肤（默认）/彩妆 | 其他护肤 / 唇部 | `L3_SK_OT_LIPBALM`（润唇膏/唇膜） | **易混淆映射说明**：无色护理默认迁 `L3_SK_OT_LIPBALM`；若历史品含 `shade` 色号，自动/引导迁入 `L3_MK_LIP_TINTED_BALM`（有色润唇膏） |
| 眼妆 (`cat-eye`/`c1-cat-eye`) | `sub-eyeshadow` / `c1-sub-eyeshadow` | 眼影盘/眼影 | 彩妆 | 眼部产品 | `L3_MK_EYE_PALETTE`（眼影盘/单色眼影） | 1:1 无损直迁 |
| 眼妆 | `sub-eyeliner` / `c1-sub-eyeliner` | 眼线笔 | 彩妆 | 眼部产品 | `L3_MK_EYE_LINER`（眼线笔/液/胶笔） | 1:1 无损直迁 |
| 眼妆 | `sub-mascara` / `c1-sub-mascara` | 睫毛膏 | 彩妆 | 眼部产品 | `L3_MK_EYE_MASCARA`（睫毛膏/打底） | 1:1 无损直迁 |
| 眼妆 | `sub-lashes` / `c1-sub-lashes` | 假睫毛 | 彩妆 | 眼部产品 | `L3_MK_EYE_LASHES`（假睫毛） | 1:1 无损直迁 |
| 腮红修容 (`cat-cheek`/`c1-cat-contour`) | `sub-blush` / `c1-sub-blush` | 腮红 | 彩妆 | 腮红 | `L3_MK_BLUSH_POWDER`（粉状腮红） | 原复合二级拆分为独立腮红二级（质地若写液体可微调至 `L3_MK_BLUSH_CREAM`） |
| 腮红修容 | `sub-contour` / `c1-sub-contourpowder` | 修容/修容粉 | 彩妆 | 修容 | `L3_MK_CONTOUR_POWDER`（修容粉/修容盘） | 1:1 无损直迁 |
| 腮红修容 | `sub-highlighter` / `c1-sub-highlighter` | 高光 | 彩妆 | 高光 | `L3_MK_HL_POWDER`（高光粉/高光盘） | 1:1 无损直迁 |
| 眉妆 (`cat-brow`/`c1-cat-brow`) | `sub-browpencil` / `c1-sub-browpencil` | 眉笔 | 彩妆 | 眉部产品 | `L3_MK_BROW_PENCIL`（眉笔） | 1:1 无损直迁 |
| 眉妆 | `sub-browpowder` / `c1-sub-browpowder` | 眉粉 | 彩妆 | 眉部产品 | `L3_MK_BROW_POWDER`（眉粉/眉膏） | 1:1 无损直迁 |
| 眉妆 | `sub-browgel` / `c1-sub-browgel` | 染眉膏 | 彩妆 | 眉部产品 | `L3_MK_BROW_GEL`（染眉膏/眉胶） | 1:1 无损直迁 |
| 护肤 (`cat-care`/`c1-cat-care`) | `sub-serum` / `c1-sub-serum` | 精华 | 护肤 | 精华 | `L3_SK_SR_ESSENCE`（精华液/肌底液） | 1:1 无损直迁 |
| 护肤 | `sub-cream` / `c1-sub-cream` | 面霜 | 护肤 | 乳液面霜 | `L3_SK_EC_CREAM`（面霜/凝霜/晚霜） | 1:1 无损直迁 |
| 护肤 | `sub-sunscreen` / `c1-sub-sunscreen` | 防晒 | 护肤 | 防晒 | `L3_SK_SS_LOTION`（防晒霜/防晒乳） | 1:1 无损直迁 |
| 护肤 | `sub-toner` / `c1-sub-toner` | 化妆水 | 护肤 | 保湿水类 | `L3_SK_TN_TONER`（化妆水/爽肤水） | 1:1 无损直迁 |
| 未归类/旧仅选一级 | 仅一级未选二级或自定义未知码 | — | 对应新一级或 `其他` | 对应兜底二级 | 优先归入对应一级 `其他` 叶子或 `L3_OT_UNCLASSIFIED` | **严禁静默丢弃**；在 `products.notes_private` 或迁移日志记录原 `category_id` 供核对 |

- **分类调整与废弃兼容性原则**：任何后续版本废弃某预设分类时，实行「软废弃 + 重定向」：`is_active = 0` + `deprecated_by_code` 指向新节点，**历史产品 `category_id` 及历史妆容 `category_snapshot` 永不清空或断链**，仅在新建产品选择器隐藏已废弃节点；迁移老产品时允许一键批量或映射迁移并保留历史展示快照。

#### 5.4.4 分类 vs 产品属性严格边界表
| 属于「分类」的内容（品类形态/使用部位） | 属于「产品属性」的内容（严禁做成分类） |
| --- | --- |
| 粉底液、粉底膏、气垫、粉饼、散粉、口红、唇釉、眼影盘、睫毛膏、精华液、面霜、香水、香膏、沐浴露、身体乳、洗发水、护发素、指甲油、甲油胶、化妆刷、美妆蛋、彩色美瞳镜片 | **色号 (`shade`)**、**规格净含量 (`30ml`/`50g`/`10片`)**、**香水浓度 (`EDP`/`EDT`)**、**香调 (`木质调`/`花香调`)**、**妆效 (`哑光`/`水光`)**、**质地 (`液态`/`慕斯`)**、**防晒指数 (`SPF`/`PA`)**、**适用肤质**、**美瞳更换周期 (`replacement_cycle_code`)**、**美瞳左右眼度数 (`left/right_power`)**、**基弧 (`BC`) / 直径 (`DIA`) / 含水量** |

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

### M8：货币与资产统计体系（底层精度=`已确认`，首页展示=`待用户决策 UD-04`）
1. **底层存储与计算红线（`已确认`）**：
   - 默认币种 `CNY`。每件 `ProductItem` 记录实际 `purchase_price_minor`（`INTEGER` 最小货币单位，如分/日元/费尔斯，非负 `>= 0`）+ `currency_code`（ISO 4217 三位码）。
   - 严禁使用 `Float`/`Double`；依靠集中式 100% 离线币种精度表转换（`CNY/USD/EUR/GBP/HKD/KRW` 等各自精确小数位：`CNY=2`、`USD=2`、`JPY=0`、`KWD=3`）。
   - **严禁不同币种金额直接相加，严禁离线瞎猜汇率强行折算总额**。
   - **资产汇总口径**：累计购买消费包含历史已用完/已归档但记录有价格的实物；「当前持有活跃件数」仅统计未删且未用完（`deleted_at IS NULL AND lifecycle_status != 'finished'`）的实物。
2. **首页累计购买金额展示方式（列入 `UD-04`，不阻塞数据库设计）**：
   - **方案 A（`推荐定稿`，与用户 `测试情况.docx` 反馈高度一致）**：首页仅展示用户在「我的 → 展示偏好」单选的 **1 个主展示币种累计金额（弱化为单行辅助信息）**，右侧提供「查看多币种明细 >」弹窗入口按币种独立分行展示全币种消费账单。既减少视觉压迫、避免跨币种误差，又不遗漏外币资产。
   - **方案 B（替代方案）**：首页卡片内直接分行平铺显示全部已有币种总和。信息直接但占用首屏视野。

---

### M9：生命周期状态转换表、重置规则与取消保障（状态：`推荐定稿`）

#### 5.9.1 完整生命周期状态转换表
| 序号 | 当前状态 | 目标状态 | 是否允许 | 是否需二次确认 | 需要用户填写/引导信息 | 清除字段 | 保留字段 | 是否重算有效期 | 是否产生日志 | 异常与取消边界 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `unrecorded` | `unopened` | **允许** | 否 | 提示确认/补选生产日期、未开封保质期或包装 EXP（均可空跳过） | 无 | 全部主档/价格/照片/原始日期参数 | **是**（按未开封侧重算） | 可选状态审计，不强制写日常使用日志 | 弹窗点取消零部分保存 |
| 2 | `unrecorded` | `in_use` | **允许** | 否 | 引导填开封日期（默认建议今日，可改或留空）、PAO 月数、默认剩余比例 `100%` | 无 | 全部主档/价格/照片/原始日期参数 | **是**（触发 `min()` 或 PAO 侧重算） | 可选（若用户主动打卡才写 usage log） | **`opened_date < manufacture_date` 拦截拒存** |
| 3 | `unopened` | `in_use` | **允许** | 否（直接进入开封面板） | 引导填写开封日期（默认今日）、PAO；原剩余比例默认为 `100%`（可调） | 无 | 生产日期、保质期、包装 EXP、价格、照片及手动确认日期（若指纹变则提示确认） | **是**（重算 `computed_expiry_date`） | 否（开封本身非妆容打卡） | 取消开封面板时必须保持原 `unopened`，不得半保存开封日 |
| 4 | `in_use` | `finished` | **允许** | **是**（确认“标记为已用完”且提示将归入已用完记录） | 自动默认 `finished_at = today`、`remaining_percent = 0`（可附用完心得） | 无 | 生产/开封/价格/历史妆容关联与所有照片 | 停止主动临期告警（保留静态日期仅供查看） | 否（不混同日常消耗打卡） | 用户点取消则状态、`remaining_percent` 全回滚 |
| 5 | `finished` | `in_use` | **允许** | **是**（确认“重新启用为使用中”） | 确认或修改当前剩余比例（不可保持 0，建议弹至 `10%`～`50%` 或保持旧值供改） | **`finished_at = NULL`** | 保留原 `opened_date`、PAO、生产日期、价格、历史妆容与照片 | **是**（恢复有效期状态重算与临期判定） | 否 | 取消操作则保持 `finished` |
| 6 | `in_use` | `unopened` | **允许** | **是**（警告“将清除已填写的开封日期并退回未开封”） | 无需额外填写 | **`opened_date = NULL`、`finished_at = NULL`**；`remaining_percent` 恢复 `100` 或 `NULL`（统一清回 `NULL` 或 `100`，推荐清回 **`100`** 表示未拆封满量）；若 `confirmed_expiry_date` 指纹依赖旧 `opened_date` 则提示或清除 | **保留 `manufacture_date`、`unopened_shelf_months`、`packaging_exp_date`、`pao_months`**、价格、主档、照片、历史妆容快照 | **是**（立即仅按未开封参数重算 `computed_expiry_date`） | 否 | 确认弹窗点击取消，原 `opened_date` 与状态纹丝不动 |
| 7 | `finished` | `unopened` | **允许** | **是**（高风险跨态退回警告：将清除用完与开封信息） | 无需额外填写 | **`opened_date = NULL`、`finished_at = NULL`**；`remaining_percent = 100`；失效原开封确认日（按指纹提示或随确认清除） | **保留 `manufacture_date`、保质期参数、包装 EXP、价格、主档、历史记录** | **是**（按未开封重新计算） | 否 | 取消零改动 |
| 8 | `unopened` / `in_use` / `finished` | **`unrecorded`** | **仅详情页独立入口允许** | **必须**（红色二次确认“重置为未记录状态”） | 不填新信息 | **精准清除**：`lifecycle_status = 'unrecorded'`、`opened_date = NULL`、`finished_at = NULL`、`remaining_percent = NULL`、`lifecycle_note = NULL`、`confirmed_expiry_date = NULL`、`expiry_confirmed_at = NULL`、`confirmed_input_fingerprint = NULL`、`computed_expiry_date = NULL`、`computed_expiry_basis = 'unrecorded'` | **完整保留**：`Product` 主档、品牌/名称/分类/规格、价格/币种、购买日期、获得渠道、产品照片、基础备注、`manufacture_date`、`unopened_shelf_months`、`pao_months`、`packaging_exp_date`、**历史妆容关联与使用日志** | 不展示推算（等待用户重新指定状态后即时重算） | 否 | 快捷菜单严禁出现「未记录」；取消操作绝不清空任何字段 |
| 9 | 同态内部编辑 | 同态 | **允许** | 仅修改关键日期影响手动确认日时提示是否同步更新 | 自由改日期、剩余量、价格等 | 仅按字段编辑替换 | 其他全部字段 | **是**（每次变更原始日期即实时刷新 `computed`） | 否 | 必须通过事务保存与取消丢弃草稿 |

> 补充状态约束：`remaining_percent` 处于 `in_use` 时通常在 `1..100`；一旦通过「标记为已用完」进入 `finished` 强制归 `0`；处于 `unrecorded` 时明确置 `NULL`。任何保存动作前先校验：`opened_date >= manufacture_date`（若均非空）、`finished_at >= opened_date`（若均非空）；弹窗或表单中**点击取消必须整体丢弃编辑草稿，严禁出现“只改了一半字段（如清了开封日期但没切回未开封）”的部分保存脏态**。

---

### M10：通用字段、分类专属属性与美瞳归属模型（结构模型=`推荐定稿`，**美瞳归属=`UD-02`**）

#### 5.10.1 数据存储架构方案对比（拒绝 EAV）
| 候选架构方案 | SQLite 可靠性与查询 | Swift 类型安全 | 迁移成本与拓展性 | 最终评价 |
| --- | --- | --- | --- | --- |
| A. 通用超大平铺表 | 极差（几十个稀疏 NULL 列污染主表） | 差 | 每次增新分类字段都需改大表 | 淘汰 |
| B. 通用字段 + 纯自由 JSON | **关键过滤字段（如美瞳周期/度数）无法高效建索引与强约束** | 需手工解码易弱化 | 易退化成 schema-less 垃圾箱 | 淘汰 |
| C. 全品类拆独立附表 | 多表高频 Join 过于零碎 | 高 | 新分类必建表，过度设计 | 淘汰（仅美瞳高度结构化值得附表/专项字段） |
| **D. 混合分层模型（`推荐定稿`）** | **核心过滤/计算全有强类型列与索引；低频文案有版本化校验 JSON** | **Swift `Codable` 分组 DTO 强类型映射** | **平滑演进，绝不建通用 EAV 系统** | **唯一推荐定稿** |

#### 5.10.2 最终字段归属矩阵（Product vs ProductItem vs 分类专属属性）
1. **`Product`（产品主档 — 同款共享不变本质特征）**：
   - 通用主档：`name`、`is_custom_name`、`brand_id`、`category_id`（三级树叶子或可直选二级）、`spec_value`、`spec_unit`、`notes_private`、`deleted_at`/`trash_expires_at`、`archived_at`；
   - 高频共享彩妆/美妆核心列：`shade`（色号 —— 尽管非全品类必填，但在妆容快照、产品卡片和搜索中使用率极高，放 `products.shade` 允许为空最优）；
   - **`美瞳` Product 级光学与周期特征**（放轻量 1:0..1 `product_lens_profiles` 或 `products` 专项结构列）：**`replacement_cycle_code`（唯一事实来源）**、`bc_mm`（基弧）、`dia_mm`（直径）、`water_content_percent`（含水量）、`pack_piece_count`（单盒标称片数，如 `10片/盒`）、`lens_color_pattern`（花色款式）；
   - **中低频分类属性（受控版本化 JSON `products.category_attrs_json` + `schema_tag`）**：
     - 香水香氛：`concentration`（EDP/EDT/Parfum 等）、`fragrance_family`（香型）、`top_notes`/`middle_notes`/`base_notes`（前中后调）
     - 彩妆：`texture`（质地）、`finish`（妆效）
     - 护肤/洗护：`suitable_skin_types`（适用肤质）、`efficacy_tags`（功效）、`key_ingredients`（核心成分备注）、`spf_value`/`pa_rating`
     - 全部专业参数**允许为 `NULL`/留空**，绝不强迫用户填完才准保存。
2. **`ProductItem`（单件实物 — 每瓶/每支/每盒独立物理实例）**：
   - 通用实物：`product_id`、`acquire_channel`（获得渠道：专柜/旗舰店/代购/赠予/其他）、`purchase_price_minor`、`currency_code`、`purchase_date`、`lifecycle_status`、`remaining_percent`、`lifecycle_note`、`last_used_at`、`finished_at`、`deleted_at`；
   - 4 层日期与效期：`manufacture_date`、`unopened_shelf_months`、`packaging_exp_date`、`opened_date`、`pao_months`、`computed_expiry_date`、`computed_expiry_basis`、`confirmed_expiry_date`、`expiry_confirmed_at`、`confirmed_input_fingerprint`；
   - **美瞳盒装独立度数属性（列入 `UD-02` 确认，强烈推荐）**：`lens_power_mode`（`same_both` 双眼同度 / `left_only` 仅左眼盒 / `right_only` 仅右眼盒 / `paired_lr` 一盒配左右两片）、`left_eye_power`（左眼度数，如 `-2.50` / `0.00`）、`right_eye_power`（右眼度数，如 `-3.00`）。

#### 5.10.3 美瞳同款不同度数归属论证（`UD-02` 核心依据）
- **现实痛点**：中国用户买美瞳常见“左眼 -2.50、右眼 -3.00”，于是同一个品牌花色周期（`Olens Scandi Gray 日抛`）通常会同时囤两盒不同度数。
- **推荐方案 A（「品牌 + 系列 + 花色 + 更换周期」共用同一 `Product`，每一盒具体的「左右眼度数 & EXP」放在 `ProductItem`）**：
  - 妆匣浏览时清晰显示「Olens Scandi Gray 日抛 · 共 2 盒」，**不会因为左右眼度数不同被割裂成两条孤立商品卡、主图重复上传、账单分散**；
  - 点开商品详情后，每一盒实物清清楚楚显示「盒 #1：左眼 -2.50 · 剩 8 片 · EXP 2028-04」、「盒 #2：右眼 -3.00 · 剩 8 片 · EXP 2028-04」；
  - 妆容关联时既能一眼选到该款美瞳，又能按实际佩戴配对记录具体哪一盒。
- **替代方案 B（不同度数拆分成不同 `Product`）**：
  - 导致两只眼睛度数不同的人每次录一款美瞳就要建 2 条主档、传 2 次图、写 2 次品牌和周期；且在「我的美妆 8 款产品」里同款美瞳占掉 2 个款数。用户体验明显不如方案 A，故强烈推荐方案 A 并请用户于 `UD-02` 拍板。

---

## 四、跨模块一致性检查矩阵（14 组全检）

> 所有发现的潜在规则缝隙，已在本版 M1～M10 与前置清单中先行修正定稿；以下为最终闭环状态。

| 编号 | 检查维度 | 潜在冲突点 | 处置与修正结果 | 最终状态 |
| --- | --- | --- | --- | --- |
| **1** | **M1 × M5**（名称生成 × 规格数量） | 若规格/数量拼入 `name`，增减件数或补全规格会导致自定义名破坏或反复变化 | 已规则隔离：`products.name` 仅由「品牌+品类(+色号)」生成，**规格与数量仅归结构化字段及界面角标**，互不篡改 | **无冲突** |
| **2** | **M2 × M6**（生命周期 × 有效期） | 未开封与已过期能否共存？`unrecorded` 是否该报过期？ | 已打通：`unopened` 可与 `expired` 共存并高亮；`unrecorded` 仅保留原始参数不推算开封态日期（未开封过期可先按基础日检测或等置入状态后触发） | **无冲突** |
| **3** | **M2 × M9**（生命周期定义 × 状态转换） | 历史原型 `idle` 在转换表与 `CHECK` 约束中去留不明，快捷入口能否切 `unrecorded`？ | 已彻底修正：`idle` 正式废弃并迁移至 `in_use + 备注`；`unrecorded` 禁入快捷条，只走详情页独立重置入口 | **已解决** |
| **4** | **M3 × M7**（产品删除 × 妆容历史） | 删除产品或单瓶后，旧妆容关联行会否 `CASCADE` 消失或展示缺品牌色号？ | 已彻底修正：`look_product_items.product_item_id` 强制 `ON DELETE SET NULL`，连同品牌/商品名/色号/分类/规格快照全量保底 | **无冲突** |
| **5** | **M4 × M5**（三级分类 × 规格单位） | 分类「美瞳」「贴片面膜」「假睫毛」的默认拥有单位与内含片数规格易混 | 已统一：分类节点绑定 `default_unit`（`盒`/`副`/`瓶`/`支`/`个`），盒内数量（如 `10片`）入 `spec_value + spec_unit`，绝不充当拥有盒数 | **无冲突** |
| **6** | **M4 × M6**（分类体系 × 专属效期） | 化妆刷、睫毛夹、收纳盒缺生产/PAO 时整屏报红「无法判断」体验极差 | 已修正：`categories` 增设 `expiry_management_mode = 'optional'`，非液体美妆工具自动豁免强制效期提示 | **已解决** |
| **7** | **M4 × M10**（三级分类 × 专属属性） | 香水浓度（EDP/EDT）、美瞳抛期（日抛/月抛）易既建分类又建属性字段引发双重冲突 | 已修正：香水浓度仅做属性、**美瞳抛期仅存 `replacement_cycle_code` 单一事实来源**，`categories` 不重复建互相矛盾的抛期节点 | **已解决** |
| **8** | **M5 × M10**（Product/ProductItem 边界） | 同款美瞳左右眼不同度数如何拆分，是否与多瓶多件模型一致？ | 按方案 A 将同款共性留 `Product`、盒装左右眼度数挂 `ProductItem` 已与 M5 多盒管理完全对齐；最终取舍列入 **`UD-02`** | **存在待决事项**（待 `UD-02`） |
| **9** | **M6 × M9**（有效期计算 × 生命周期重置） | 以前混存日期时，重置为未记录会误删生产日期或错留手动确认日期 | 已彻底修正：引入 **4 层日期模型**；重置仅清除 `opened_date`/`finished_at`/`remaining_percent`/`confirmed_expiry_date`/`computed_expiry_date`，永久保护 `manufacture_date` 与周期参数 | **已解决** |
| **10** | **M7 × M10**（妆容快照 × 分类属性） | `products.shade` 迁走或特殊分类属性变化时，妆容快照能不能拿到色号？ | 已锁定：`shade` 保留在 `products` 通用可空列中，`look_product_items` 同时保存 `shade_snapshot`、`spec_snapshot`、`category_snapshot`（含三层级全路径可读文本） | **无冲突** |
| **11** | **M8 × M5**（规格 × 价格 × 币种统计） | 产品改数量或标为已用完后，累计购买金额如何算？不同币种会否混加？ | 已锁定：价格严格挂在每条 `ProductItem` 上，累计消费按 `currency_code` 分组累加所有有价实例（含已用完），首页是否折叠单主币种见 **`UD-04`** | **存在待决事项**（UI 见 `UD-04`） |
| **12** | **美瞳分类 × 抛期 × EXP × 生命周期** | 会否用“日抛”代替“2028-05 EXP”，或未开封却因买太久误算按抛期过期？ | 已隔离：包装 EXP 管未开封灭菌底线；未开封只看 EXP；实际开封后按 `min(包装 EXP, 开封日 + 更换周期)`（按单副拆封/着用周期追踪） | **无冲突** |
| **13** | **产品删除 × 历史记录 × 照片引用** | 回收站期间会否误删沙盒照片？不同记录共享同一张图会否连带删毁？ | 已隔离：若启用 7 天回收站（`UD-03`），软删态不触发物理文件清理；彻底删除仅当 `media_assets` 引用计数跨全表归 0 后才删本地文件 | **存在待决事项**（待 `UD-03` 确认是否启用 7 天缓冲） |
| **14** | **产品数量调整 × 单件实物数据** | 用户点 `-1` 减数量时若静默删最后一行，极易误删用户辛辛苦苦填了开封日和价格的那一瓶 | 已防护：仅空白 `unrecorded` 实例允许自动从末尾减 1；只要涉及已记录日期/价格/妆容的实例，**强制弹窗选瓶或改记已用完** | **已解决** |
