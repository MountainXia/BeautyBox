# BeautyBox（妆匣）项目现状审计报告

- **审计基准时间**：2026-11-26
- **审计分支与提交**：`test/task02-prototype`（`49da567`，与 `origin/test/task02-prototype` 同步）；`main` 停留在 `c53cff8`
- **审计范围与方法**：逐份核对仓库文档、Git 提交历史与工作区状态、`prototype/` 全部源码（约 15,472 行）、测试套执行结果（`node prototype/tests/run-tests.mjs`）及本机运行工具链（`sqlite3 3.45.1`、`node v18.19.1`、`python3`）。本次审计**未修改任何源代码、配置或数据结构**。

---

## 一、仓库与 Git 现状审计

### 1.1 目录与工程定位
- **文档区**（`docs/`、`README.md`、`AGENTS.md`）：包含 V2.0 四份 `.docx` 规范文档、`ADR-0001` 架构决策文档及 `docs/testing/` 两份测试归档文档。
- **浏览器原型区**（`prototype/`）：纯前端 ESM + HTML + CSS 原型（`localStorage` + `IndexedDB`），用于交互验证。**仓库内尚未创建正式 iOS 原生 Xcode 工程（无 `.xcodeproj` / `.swift` / `Package.swift` 文件）及正式 SQLite 建库脚本**。
- **部署与工作流**：`.github/workflows/deploy-prototype-pages.yml` 将 `test/task02-prototype` 分支下的 `prototype/` 目录发布到 GitHub Pages。

### 1.2 Git 状态与分支差异
1. **未合并分支差异（重要）**：
   - `main` 分支最新提交为 `c53cff8`（`TASK02` 初版原型完成节点）。
   - `test/task02-prototype` 在 `c53cff8` 之上新增了 **25 个提交**（`ca26815..49da567`），完整承载了 **TASK02.1-A / B / C1 / C2 / D** 的全部代码、图标与测试报告，目前**尚未合并回 `main`**。
2. **工作区状态**：
   - 仅存在 1 个既有未跟踪文档 `测试情况.docx`，无未提交源码改动。
3. **原型内残留冗余文件**：
   - C1 阶段的独立体验原型文件仍留在仓库中：`prototype/c1-prototype.html`（133 行）、`prototype/js/c1-prototype.js`（2,252 行）、`prototype/js/c1-mock-data.js`（840 行），共计 **3,225 行** 与正式版（`index.html` + `boxView.js` + `store.js`）重复或分叉的临时代码。

---

## 二、文档一致性审计（冲突、过时与未同步决策）

| 文档 | 冲突 / 过时点 | 实际最新状态与影响 |
|---|---|---|
| [`AGENTS.md`](./../AGENTS.md) | 权威长期约束有效，但未明确指出当前文档与 TASK02.1 新增字段的滞后 | 继续作为全局最高开发纪律（纯本地、无账号、防猜测有效期、12 项报告模板等）。 |
| [`docs/01_产品需求设计_V2.0.docx`](./01_%E4%BA%A7%E5%93%81%E9%9C%80%E6%B1%82%E8%AE%BE%E8%AE%A1_V2.0.docx) | ① 第 4/5 节及原型说明要求「新增产品名称必填」；② 仅提「购买渠道」；③ 仅有常规状态与「归档」，无「未记录」与产品 7 天回收站 | **已冲突**：TASK02.1 将名称改为选填自动组合、渠道升级为「获得方式」、引入系统兜底状态 `unrecorded` 与「待记录使用状态 vs 有效期信息待完善」双拆分、引入产品 7 天回收站。 |
| [`docs/02_数据库设计_V2.0.docx`](./02_%E6%95%B0%E6%8D%AE%E5%BA%93%E8%AE%BE%E8%AE%A1_V2.0.docx) | 未包含 `ADR-0001` 与 `TASK02.1` 新增字段及约束修订 | **严重滞后（TASK03 前必须同步）**：缺 `unrecorded` CHECK 枚举、双推算有效期列、`expiry_needs_reconfirm`、`used_up_date`、`acquisition_method`、`custom_name`、`subcategory_id`、`quantity_unit`、规格拆分列、产品/妆容 `deleted_at`/`purge_at`、`product_photos` 单封面表、`skin_diary_photos`、Routine 快照补充字段、`backup_manifests.schema_version`。 |
| [`docs/adr/0001-architecture-decisions.md`](./adr/0001-architecture-decisions.md) | 写于 TASK01（2026-11-19），早于 TASK02.1 | 技术底座决策（Swift+SwiftUI、SQLite+GRDB、`.beautyboxbackup`、白名单分享）依然有效；但第 5.2 节未同步 TASK02.1-D1 的「首页主展示币种选择器 + 按需外币开关」，第 8.2 节仍把 `product_items.status` 枚举标为待确定（在原型层已细化但尚未书面锁定到 SQLite DDL）。 |
| [`docs/03_界面原型说明_V2.0.docx`](./03_%E7%95%8C%E9%9D%A2%E5%8E%9F%E5%9E%8B%E8%AF%B4%E6%98%8E_V2.0.docx) | 仍描述「名称必填」「产品档案 / 持有实例」「购买渠道」「先建产品再添实例」两步流程 | **已过时**：TASK02.1-C1/C2 已改为连续单页添加、可跳过详情、去术语化界面文案与手风琴收起式「我的」。 |
| [`docs/04_开发计划与AI指令_V2.0.docx`](./04_%E5%BC%80%E5%8F%91%E8%AE%A1%E5%88%92%E4%B8%8EAI%E6%8C%87%E4%BB%A4_V2.0.docx) | TASK 02 仅列单一交互原型任务，且预设部分分享/导出排在 TASK 12/14 | **边界已漂移**：TASK 02 实际演进出 TASK02.1-A/B/C1/C2/D 五轮；导出 JSON/CSV 与本地 PNG 分享卡片已经在原型提前验证了逻辑与交互，但原生 iOS 工程与 SQLite 尚未起步。 |
| [`README.md`](./../README.md) & [`prototype/README.md`](./../prototype/README.md) | 仍含「产品主档案 / 持有实例」「名称必填」「旧 JPY/KWD 示例路径」 | 仅更新滞后，需随路线图同步修正。 |

---

## 三、全模块功能真实完成状态审计

> 状态严格按统一口径标注：`已完成且测试通过` / `已实现但未充分测试` / `部分实现` / `仅有 UI 或交互原型` / `使用模拟数据或模拟服务` / `已设计但未实现` / `未开始` / `存在缺陷，需要返工`。

### 模块 A：基础架构与导航
| 功能项 | 真实完成状态 | 文件与关键位置 | 测试依据与尚存问题 | 可复用性 |
|---|---|---|---|---|
| 五个 Tab 与主路由 | 仅有 UI 或交互原型 | `prototype/js/app.js`（`TABS`、`render`、`actions`） | 经 Chrome CDP E2E 遍历 5 Tab；为浏览器 DOM 切换，无原生 SwiftUI `TabView`/`NavigationStack`；`app.js:17` 存在未使用导入 `openItemFormSheet`。 | 交互架构与状态树可作参考，代码不可复用 |
| 页面跳转与弹窗控制 | 仅有 UI 或交互原型 | `prototype/js/app.js:54-77`、`prototype/js/components/ui.js:56-220` | 包含 `visualViewport` 与 `has-modal-open` 防锁死机制，经 CDP 实测弹窗切换；无自动化单测，待原生改写。 | 交互规范可参考 |
| 设计系统与公共组件 | 仅有 UI 或交互原型 | `prototype/styles/tokens.css`、`components.css`、`ui.js` | 色值、圆角、安全区与防折行 CSS 在 Chrome CDP 390×844 下通过；桌面与移动样式无法直接迁移至 SwiftUI DesignTokens。 | Token 数值与间距规范可复用 |
| 响应式与图标/清单 | 已实现但未充分测试 | `prototype/index.html:6-18`、`prototype/manifest.webmanifest`、`prototype/assets/icons/*` | HTTP 200 及 Chrome 计算样式通过；**iPhone Safari 实机顶部安全区消分界线及「添加到主屏幕」图标效果尚未在 `49da567` 后真机验收**。 | PNG 源图标 `beautybox-source.png` 与切图可直接用于 Xcode `AppIcon` |

### 模块 B：产品管理（含首页统计）
| 功能项 | 真实完成状态 | 文件与关键位置 | 测试依据与尚存问题 | 可复用性 |
|---|---|---|---|---|
| 产品档案 `Product` | 仅有 UI 或交互原型 | `prototype/js/store.js:996-1170`、`prototype/js/seedData.js:50-156` | Node 测试 #5/#8 通过（含原子创建与规格拆分）；仅 `localStorage` JSON 模拟，无 SQLite 约束。 | 业务逻辑与字段校验规则可直接指导 Swift/SQL |
| 单瓶实例 `ProductItem` | 仅有 UI 或交互原型 | `prototype/js/store.js:1246-1430`、`prototype/js/views/boxView.js:507-606` | Node 测试 #2/#3/#4/#7/#8 通过；底层 `saveProductItem` 为兼容测试 #7 仍允许编程式跳过 `openedDate` 创建 `in_use`（与 UI 强校验存在双轨差异）。 | 状态机规则高度可参考 |
| 一级、二级分类与品牌 | 部分实现 | `prototype/js/store.js:49-109, 850-868` | 一级 6 大类入 `state.categories`；**二级 `CATEGORY_SUBCATEGORIES`（24 项）为硬编码静态字典，未入状态表也无自定义分类 CRUD**。 | 分类与默认单位字典可迁移为 SQLite 种子数据 |
| 产品名称自动组合 | 已实现但未充分测试（原型层通过） | `prototype/js/store.js:116-128, 996-1017` | Node 测试 #8 与 CDP E2E 通过（选填，留空按品牌+分类/子分类+色号组合）；尚未原生实现。 | 纯函数规范可直接移植 Swift |
| 新增 / 编辑 / 删除（7 天回收站） | 仅有 UI 或交互原型 | `prototype/js/store.js:1019-1175, 1650-1747`、`boxView.js:1034-1520` | Node 测试 #8（UUID 独立恢复不覆盖同名新品、第 8 天自动清理保快照）+ CDP E2E 通过；无原生 CRUD。 | 业务规则成熟，可直接移植设计 |
| 多件管理与剩余比例 | 仅有 UI 或交互原型 | `prototype/js/store.js:1094-1170`、`boxView.js:1054-1505` | 支持 `batch` 统一或 `per_item` 逐件及 `0-100` 比例校验；Node 与 E2E 通过；批量上限硬编码为 20。 | 交互流程可参考 |
| 生命周期状态与日期顺序校验 | 已实现但未充分测试（原型层通过） | `prototype/js/store.js:211-316, 495-606` | 含 `unrecorded` 兜底、`evaluateQuickStatusOption` 3 态流转、`openedDate >= manufactureDate`、`usedUpDate >= openedDate/manufactureDate` 拦截，Node 测试 #8 全通过；待原生实现。 | 状态机规则可 100% 映射为 Swift 领域服务 |
| 生产/保质期/开封/PAO/确认到期日与双推算 | 已实现但未充分测试（原型层通过） | `prototype/js/expiry.js:1-355`、`boxView.js:896-1030` | Node 测试 #4/#7/#8 完整覆盖月末溢出、缺项不猜、不覆盖用户确认与独立双推算；待原生实现。 | 算法精确无浏览器依赖，可直接移植 Swift |
| 临期/过期展示与阈值设定 | 仅有 UI 或交互原型 | `prototype/js/expiry.js:244-280`、`homeView.js:87-124`、`meView.js:104-120` | 默认 `nearExpiryDays: null`（不猜测默认天数）；但仅测过基本渲染，边界如临期天数 `0` 天/负值前端未加完整单测。 | 规则可迁移 |
| 已用完历史记录与时长 | 仅有 UI 或交互原型 | `prototype/js/expiry.js:317-355`、`boxView.js:517-575, 1699-1778` | 支持 `usedUpDate` 默认当天、使用时长计算与详情页折叠区；Node 与 E2E 通过；但旧测试 #7 创建的无 `openedDate` `used_up` 数据仅显示“未填开封日期”。 | 算法可直接移植 |
| 产品筛选、排序与待补充独立拆分 | 已实现但未充分测试（原型层通过） | `prototype/js/store.js:318-485`、`boxView.js:64-298` | `待记录使用状态` 与 `有效期信息待完善` 严格互斥统计，Node 测试 #8 + CDP E2E 通过；待原生实现与真机复测。 | 聚合口径可直接移植 |
| 首页资产汇总与多币种精度 | 已实现但未充分测试（原型层通过） | `prototype/js/currency.js`、`store.js:1942-2048`、`homeView.js` | Node 测试 #1/#2/#3/#5/#7/#8 验证 `CNY/HKD/USD/GBP/EUR/JPY/KWD` 整数 `BigInt` 精度及跨币种不相加；但 `homeSelectedCurrency` 单币种摘要与 `ADR-0001` 原全币种并列口径存在展示层差异。 | 精度配置与汇总算法可移植 Swift `Decimal` + Int64 |

### 模块 C：妆容管理
| 功能项 | 真实完成状态 | 文件与关键位置 | 测试依据与尚存问题 | 可复用性 |
|---|---|---|---|---|
| 妆容新增、编辑与 7 天回收站 | 仅有 UI 或交互原型 | `prototype/js/store.js:1456-1648`、`prototype/js/views/looksView.js` | Node 测试 #7 覆盖 7 天回收站清理与恢复；但 `saveLook` 在编辑时仅保留 1 张既有封面（`preserveExistingAssetId`），多图编辑被简化丢失，且筛选仅支持单风格筛选。 | 业务流程与回收站逻辑可迁移 |
| 妆容照片、耗时、自评、风格/场景预设 | 仅有 UI 或交互原型 | `looksView.js:340-680` | 风格/场景胶囊经 CDP E2E 测试；自评 4 个维度（`self/coordination/color/wear`）在表单里合并成了单一 `selfRating` 下拉框，其余 3 维直接复用同值（简化了详情展示的四维数据）。 | UI 结构可参考 |
| 关联实际 `ProductItem` 与历史快照 | 已实现但未充分测试（原型层通过） | `prototype/js/store.js:1435-1549`、`looksView.js:245-281` | Node 测试 #5 与 #8 实测产品改名、删除、回收站永久清除后快照保留与外键置空；但在 UI 上不支持拖拽排序或为每件单品单独选择 `stepKey`。 | 快照构建机制可直接移植 Repository |

### 模块 D：持妆管理
| 功能项 | 真实完成状态 | 文件与关键位置 | 测试依据与尚存问题 | 可复用性 |
|---|---|---|---|---|
| 完成照、2/4/6/8 小时/自定义时间点、主观等级与备注 | **存在缺陷，需要返工** | `prototype/js/store.js:1749-1785`、`prototype/js/views/looksView.js:684-835` | **发现代码缺陷：`looksView.js:810` `openWearReviewSheet` 在未选文件取消分支误引用未定义变量 `preserveExistingAssetId`，会触发 `ReferenceError`**；Node 测试与 CDP E2E 均未覆盖持妆提交与图片上传；无持妆记录编辑/删除功能。 | 修复该引用错误后，数据字段与时间点模型可迁移至原生 |

### 模块 E：日常管理
| 功能项 | 真实完成状态 | 文件与关键位置 | 测试依据与尚存问题 | 可复用性 |
|---|---|---|---|---|
| 产品使用日志 | 仅有 UI 或交互原型 | `prototype/js/store.js:1890-1913`、`dailyView.js:135-173, 355-419` | 无独立 Node 或 E2E 自动化用例覆盖；仅支持新增，无编辑、删除、按日期筛选；`lastUsedAt` 会同步更新，但 UI 未展示关联历史使用次数。 | 数据模型可参考 |
| 护肤流程与执行记录（含快照） | 仅有 UI 或交互原型 | `prototype/js/store.js:1789-1888`、`dailyView.js:54-133, 229-353` | 新建流程与打卡逻辑完整（含步骤产品快照）；无自动化测试覆盖；缺少流程编辑、停用归档及步骤单件多选。 | 快照模型需保留迁移 |
| 肌肤日记（含多图与声明） | 仅有 UI 或交互原型 | `prototype/js/store.js:1915-1938`、`dailyView.js:175-225, 421-524` | 含非医疗诊断提示与多图数组 `photoAssetIds`；无自动化测试覆盖；无日记编辑/删除入口。 | 非医疗声明与关联照片表 `skin_diary_photos` 需迁入原生 |

### 模块 F：数据管理
| 功能项 | 真实完成状态 | 文件与关键位置 | 测试依据与尚存问题 | 可复用性 |
|---|---|---|---|---|
| 数据导出（JSON / CSV） | **部分实现（原型层存在缺口）** | `prototype/js/store.js:2067-2129`、`meView.js:377-387` | 原型无测试覆盖；**`buildProductItemsCsv` 漏掉了 C2 新增的 `used_up_date` 与 `deleted_at` 列**；正式需求要求的照片 ZIP 导出在原型未实现。 | CSV 转义与表头结构需补全后迁入原生 |
| 备份与恢复（`.beautyboxbackup`） | **使用模拟数据或模拟服务** | `prototype/js/store.js:2131-2151`、`meView.js:389-424` | 仅导出模拟 JSON 清单且 `schema_version` 硬编码为 `1`（与 `state.version = 2` 不一致）；**恢复仅为弹窗文案演示，未实现实际解析还原**；无一致性 SQLite 快照与 Safepoint 机制。 | 仅 manifest 字段规范可作参考 |
| 本地图片管理与孤儿清理 | 使用模拟数据或模拟服务（浏览器沙盒） | `prototype/js/assets.js`、`store.js:806-964` | Node 测试 #5/#6 覆盖 Safari 空 MIME 校验、Blob 回滚与 `clearAll` 同步清 Blob；浏览器端是 IndexedDB，未做图片压缩、EXIF 方向修正与缩略图生成（原生 TASK05 目标）。 | 校验口径与孤儿引用计数逻辑可迁移 |
| 数据版本迁移 | 部分实现（原型级迁移） | `prototype/js/store.js:699-751` | Node 测试 #8 验证了 `localStorage` v1→v2 向后兼容迁移；**正式 SQLite DDL 与 `PRAGMA user_version` Migration 尚未开始**。 | 向后兜底默认值策略可参考 |
| 保存异常脱敏诊断日志 | 已实现但未充分测试（原型层通过） | `prototype/js/diagnostics.js`、`meView.js:456-516` | Node 测试 #6 验证失败回滚与脱敏日志键白名单；仅用于原型，待随原生错误监控规范化。 | 白名单字段脱敏设计可直接复用 |

### 模块 G：商业化与扩展
| 功能项 | 真实完成状态 | 文件与关键位置 | 测试依据与尚存问题 | 可复用性 |
|---|---|---|---|---|
| iCloud 备份接入与整机排除 | 已设计但未实现（原型仅交互说明） | `meView.js:426-454`、`docs/adr/0001` 第 2/8 节 | 原型无真实能力；`URLResourceValues.isExcludedFromBackup = true` 与系统文件选择器 **须待 Mac/Xcode 与真机实测**。 | ADR 规范可直接指导开发 |
| 分享图片（Canvas PNG + 白名单） | 仅有 UI 或交互原型（原型逻辑完善） | `prototype/js/shareCard.js`、`looksView.js:830-1120` | CDP E2E 验证了卡片重绘与原位替换防闪动；`buildShareCardPayload` 无独立 Node 单测校验隐私字段排除。 | **白名单裁剪逻辑与卡片信息结构可直接移植 SwiftUI `ImageRenderer`** |
| StoreKit 2 与会员状态 | 使用模拟数据或模拟服务 | `meView.js:144-158, 360-366` | 仅 3 态模拟开关验证“过期不锁数据”；无配置化额度表、`EntitlementService` 及真实 StoreKit 2（需 Mac/Xcode）。 | 仅“不过期锁数据”原则可直接沿用 |
| 链接分享方案 | 未开始（V1 明确后置） | `docs/04` TASK 16、`ADR-0001` 第 3.2 节 | V1 明确不编码，仅在后期出架构评估方案。 | — |

---

## 四、核心技术债务与自动化测试覆盖盲区

### 4.1 关键代码缺陷与技术债务
1. **代码运行时 Defect（已发现）**：`prototype/js/views/looksView.js:810` 在持妆弹窗文件选择器取消分支引用未定义变量 `preserveExistingAssetId`。
2. **原型字段与导出不一致**：`store.js:2080` `buildProductItemsCsv` 缺少 `used_up_date` 与 `deleted_at`；`store.js:2138` `buildMockBackupPackageJson` 硬编码 `schema_version: 1`；`app.js:17` 导入未使用的 `openItemFormSheet`。
3. **冗余大文件未清理**：`prototype/c1-prototype.html`、`c1-prototype.js`、`c1-mock-data.js`（3,225 行）已无业务用途但仍留在 `prototype/`。
4. **单文件巨石与双轨校验**：`boxView.js`（2,401 行）与 `store.js`（2,166 行）高度耦合；`saveProductItem` 低层写入未像交互表单那样阻断无 `openedDate` 的 `in_use` 记录，属于原型演进遗留折中。
5. **分支漂移**：`test/task02-prototype` 领先 `main` 25 个提交尚未合并，文档中心信息停留在旧版 `main`。

### 4.2 自动化测试覆盖统计（本轮实测）
- **现有 Node 测试**（`node prototype/tests/run-tests.mjs`）：**8 项通过、0 项失败**。
  - **已覆盖**：`currency.js` 精度/防浮点、`expiry.js` 月末与双推算、首页统计口径、单封面与历史快照、Safari 空 MIME 与回滚脱敏、7 天回收站、`unrecorded` 与有效期待完善拆分、1→2 迁移、去术语化扫描。
  - **测试盲区**：`wearReviews`、`routines`/`routineLogs`、`productUsageLogs`、`skinDiaries`、`buildShareCardPayload` 白名单断言、`buildProductItemsCsv`、以及 `dailyView.js` / `looksView.js` UI 全流程均无 Node 自动化测试（`e2e_formal_c2.py` 目前也仅存放在临时 scratch 目录，未进入仓库受控目录）。

---

## 五、识别出的关键边界：原型 vs 原生

| 类别 | 不可直接迁移（原型专属） | 可直接作为原生开发蓝图与规范 |
|---|---|---|
| 底层机制 | `localStorage` JSON 读写、`IndexedDB` Blob 存储、ESM 手写 DOM 字符串渲染、`hash/内存 uiState`、HTML5 Canvas 2D 绘图 | `ADR-0001` 20 张 SQLite 表与外键策略、整数 `minor` + `currency_code` 精度字典（含 0/2/3 位）、`expiry.js` 纯日期与双推算状态机、`unrecorded` 与有效期完整性判断规则、`buildShareCardPayload` 白名单字段过滤契约、`.beautyboxbackup` 安全点恢复步骤 |

---

## 六、进入正式原生开发前必须明确的差距汇总

1. **文档规范需立即反哺同步**：`docs/01`、`docs/02`、`docs/03` 与 `ADR-0001` 必须书面吸收 TASK02.1 已经确认的所有新规则（详见《BeautyBox_当前待办与决策清单.md》），否则 `TASK 03` 按旧 `docs/02` 建表一定会漏列与错误约束 `CHECK`。
2. **明确原型收尾边界**：防止 `TASK02.1` 继续无边界扩张。待当前已推送版真机走查并修掉 `looksView.js:810` 等极小瑕疵后，应立即**冻结原型（不再加新交互功能）**，将分支回并 `main`（或打 Tag），正式转入原生底层工程化阶段（SQLite Schema）。
