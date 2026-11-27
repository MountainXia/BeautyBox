# 妆匣 BeautyBox 新版开发路线图（V3.1 产品基线正式冻结版）

- **文档版本**：V3.1-Schema-Done（2026-11-27 同步；沿用 [BeautyBox_新版开发路线图_V3.0.md](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_新版开发路线图_V3.0.md) 路径更新，历史原型计划归档于 [docs/04_开发计划与AI指令_V2.0.docx](file:///home/xianggujiang/projects/BeautyBox/docs/04_开发计划与AI指令_V2.0.docx)）
- **当前里程碑状态**：**Phase 1.5（V3.1 规则基线冻结）及 Phase 2 前半段（`V3-03` 目录隔离与 `V3-04` SQLite Schema V1 正式实施及本机 14/14 自动化测试）已完成！下一目标为 `V3-05` Swift 领域规则引擎。**
- **重要执行边界声明**：
  1. 原型完成 & SQLite 本机通过 ≠ 原生 iOS App 完成；目前**尚未启动任何 Swift / SwiftUI / GRDB 原生代码开发**，GRDB 与真机存储仍**需 Mac/Xcode 实测**。
  2. `prototype/` 目录自 `f6752ac`（标签 `v0.2-task02.1-frozen`）起永久冻结只读。
  3. 当前工作流等待用户审阅 SQLite Schema V1 实施结果并指令开启 `V3-05`。

---

## 一、全局阶段进度总览（V3.1-Frozen）

| 阶段 | 任务范围 | 当前状态 | 关键产出 / 门禁状态 |
| --- | --- | --- | --- |
| **Phase 0 & 1** | 架构锁定 & 浏览器可点击原型收尾（TASK01 / TASK02 / TASK02.1） | **已完成并正式冻结** | 提交 `f6752ac`、标签 `v0.2-task02.1-frozen`、[验收清单](file:///home/xianggujiang/projects/BeautyBox/docs/testing/TASK02.1-原型收尾与冻结验收清单.md) |
| **Phase 1.5（本轮完成）** | M1～M10 规则冻结、三级分类与迁移字典校准、美瞳单盒模型、7 天回收站完整机制与 `idle` 分流 | **已完成并正式冻结（待用户决策清零）** | [ADR-0002 V3.1-Frozen](file:///home/xianggujiang/projects/BeautyBox/docs/adr/0002-m1-to-m10-product-decisions.md)、[PRD V3.1](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_产品需求规格说明书_V3.0.md)、[SQLite 前置清单](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_SQLite数据库设计前置清单.md)、[待办与决策清单](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_当前待办与决策清单.md) |
| **Phase 2（进行中：`V3-03`/`V3-04` 完成）** | `V3-03` 目录隔离 & `V3-04` SQLite Schema V1（**已完成本机 DDL/Seeds/Migration/14项测试**）→ `V3-05` Swift 领域规则引擎（**未开始**）→ `V3-06` GRDB Repository & 媒体安全存储（**未开始**） | **进行中（数据库层已通过本机 `sqlite3` 验证）** | [Schema 设计与 ER](file:///home/xianggujiang/projects/BeautyBox/docs/db/SQLite_Schema_V1_设计说明与ER关系.md)、[字段字典](file:///home/xianggujiang/projects/BeautyBox/docs/db/SQLite_Schema_V1_字段字典.md)、[测试报告](file:///home/xianggujiang/projects/BeautyBox/docs/db/SQLite_Schema_V1_测试说明.md)；Swift/GRDB 仍标「需 Mac 实测」 |
| **Phase 3（待启动）** | `V3-07`～`V3-13` iOS 原生五 Tab UI 工程落地 | **未开始** | 严格复用 `V3-05/V3-06`，UI 层零日期/金额/回收站孤立逻辑 |
| **Phase 4（待启动）** | `V3-14`～`V3-20` 备份恢复、白名单图片分享、StoreKit 2 会员、Mac/Xcode 真机编译与 TestFlight 发布 | **未开始（高度依赖 Mac/Xcode）** | 备份/恢复/导出对全部用户永久免费 |

---

## 二、后续开发任务清单与依赖链（V3-03 ～ V3-20）

### 阶段 A：工程隔离与原生数据基石（`V3-03`/`V3-04` 已完成，待推进 `V3-05`/`V3-06`）
1. **`V3-03`：原型冻结隔离与独立目录建立（`已完成`）**
   - **产出**：确立顶层 `database/` 与未来 `ios/` 原生工作目录物理隔离于 `prototype/`；`v0.2-task02.1-frozen` 与 `f6752ac` 保持零改写。
2. **`V3-04`：SQLite Schema V1、147 节点三级分类种子与 Migration 引擎（`已完成本机 SQLite 实施与测试`）**
   - **已落地产出**：
     - [0001_schema_v1.sql](file:///home/xianggujiang/projects/BeautyBox/database/migrations/0001_schema_v1.sql)（22 张真实表、外键/`ON DELETE`/`CHECK`/部分唯一索引、零 `REAL`/`FLOAT`）；
     - [0001_categories_v1.sql](file:///home/xianggujiang/projects/BeautyBox/database/seeds/0001_categories_v1.sql)（9 一级 / 45 二级 / 93 三级预设分类 + 默认设置）；
     - [beautybox_db.py](file:///home/xianggujiang/projects/BeautyBox/database/python/beautybox_db.py)（事务化 Migration、7 天回收站批次隔离/彻删/引用归零、五类分类迁移与 `idle` 三分支兼容）；
     - [test_schema_v1.py](file:///home/xianggujiang/projects/BeautyBox/database/tests/test_schema_v1.py)（**14/14 自动化测试通过** + 原生 `sqlite3` CLI `foreign_key_check` 通过）。
   - **尚未验证边界**：Swift `GRDB` 打包挂载及 iOS 沙盒实测归属 `V3-06` 及 Mac/Xcode 真机验证。
3. **`V3-05`：Swift 核心领域模型与规则引擎（纯逻辑可跨平台单测层）**
   - **前置依赖**：依赖 `V3-04` 字段字典定型，实现 M1～M10 规则（`is_custom_name`、9+2 状态机与独立重置、美瞳 `replacement_cycle_code` 单源分组、4 层日期引擎与 `min()`、多币种 Decimal 精度）。
4. **`V3-06`：GRDB Repository 持久层与 `MediaStore` 沙盒媒体引擎**
   - **前置依赖**：依赖 `V3-04` DDL + `V3-05` 领域引擎。
   - **核心职责**：单事务跨表写入与快照冻结；7 天到期回收站与提前彻删调度；四表引用归零删图与启动孤儿文件对账。注：GRDB Swift 编译与真机 IO **需 Mac/Xcode 实测**。

### 阶段 B：SwiftUI 五 Tab 原生界面落地（`V3-07` ～ `V3-13`）
- **`V3-07`**：设计系统 DesignTokens、五 Tab 骨架、顶栏安全区统一导航与原生底部 Sheet 完整展现组件。
- **`V3-08`**：首页模块（`UD-04` 弱化单行主币种展示 + 多币种消费明细弹窗 + 临期提醒）。
- **`V3-09`**：妆匣列表与产品主档（三级分类搜索直达、美瞳 `replacement_cycle_code` 动态周期胶囊筛选、自然件数展示与缩略图预览）。
- **`V3-10`**：单件详情、多瓶/单盒展开管理（**美瞳按左右眼成对聚合呈现 + 单盒独立 `lens_power`/`lens_eye_side` 编辑**）、快捷状态转换、独立红色重置与减量防盲删。
- **`V3-11`**：妆容日记模块（主照+细节多图、单选风格/场景+自由 `tags`、**4 项选填 1～5 整数评分**、多实物含左右眼美瞳盒快照绑定、7 天回收站删除/恢复）。
- **`V3-12`**：持妆时间线与日常模块（单品打卡+美瞳佩戴次数天数统计、护肤步骤模板与执行快照、主观肌肤日记）。
- **`V3-13`**：`我的` 模块与 7 天本地回收站统一管理中心（批量恢复/孤儿拦截提示/高危确认彻删/清空回收站）。

### 阶段 C：数据主权、分享、商业化与发布（`V3-14` ～ `V3-20`）
- **`V3-14`**：全量本地 `.beautyboxbackup` 备份（含一致性快照、SHA256 与旧版迁移器）、安全点还原与 JSON/CSV/照片 ZIP 导出（全用户免费开放）。
- **`V3-15`**：可选 iCloud Drive 备份开关集成（`需 Mac/Xcode 与真机实测`）。
- **`V3-16`**：本地白名单长图分享生成器。
- **`V3-17`**：StoreKit 2 订阅集成与可配置权益 `EntitlementService`（免费额度与具体定价在此步前最终锁数）。
- **`V3-18`～`V3-20`**：Mac/Xcode 真机联调（`isExcludedFromBackup`、相机/PHPicker、StoreKit 沙盒）→ 隐私安全专项回归 → TestFlight 与 App Store 提交准备。
