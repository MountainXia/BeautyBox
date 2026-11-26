# 妆匣 BeautyBox 新版开发路线图（V3.1 规则收口同步版）

- **文档版本**：V3.1（沿用 [BeautyBox_新版开发路线图_V3.0.md](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_新版开发路线图_V3.0.md) 路径同步更新，历史原型计划归档于 [docs/04_开发计划与AI指令_V2.0.docx](file:///home/xianggujiang/projects/BeautyBox/docs/04_开发计划与AI指令_V2.0.docx)）
- **更新日期**：2026-11-26
- **当前真实里程碑位置**：**`TASK02.1` 浏览器交互原型已冻结** + **V3.1 产品规则收口与 SQLite 前置设计已完成**，**正式进入 `UD-01`～`UD-03` 用户基线拍板等待期**。
- **重要边界声明**：
  1. 原型完成 ≠ 原生 iOS App 完成；目前**尚未启动 SQLite 正式建表、Migration 脚本及任何 Swift/SwiftUI 原生代码开发**。
  2. `prototype/` 目录自 `f6752ac`（标签 `v0.2-task02.1-frozen`）起永久冻结只读，禁止回退改写。
  3. 仅在用户明确拍板 `UD-01`～`UD-03` 后，方可解锁 `V3-04` 启动建表。

---

## 一、全局阶段进度总览（V3.1 校准）

| 阶段 | 任务范围 | 当前状态 | 关键产出 / 门禁说明 |
| --- | --- | --- | --- |
| **Phase 0 & 1** | 架构锁定 & 浏览器可点击原型收尾（TASK01 / TASK02 / TASK02.1） | **已完成并正式冻结** | 提交 `f6752ac`、标签 `v0.2-task02.1-frozen`、[验收清单](file:///home/xianggujiang/projects/BeautyBox/docs/testing/TASK02.1-原型收尾与冻结验收清单.md) |
| **Phase 1.5（本轮）** | M1～M10 产品规则收口、三级分类重构、跨模块校验与 SQLite 前置输入 | **已完成基线编制（待用户审定 4 项 `UD`）** | [ADR-0002 V3.1](file:///home/xianggujiang/projects/BeautyBox/docs/adr/0002-m1-to-m10-product-decisions.md)、[PRD V3.1](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_产品需求规格说明书_V3.0.md)、[SQLite 前置清单](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_SQLite数据库设计前置清单.md)、[待办与决策清单](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_当前待办与决策清单.md) |
| **Phase 2（待启动）** | `V3-03` 仓库隔离整理 → `V3-04` SQLite Schema V1 → `V3-05` Swift 领域规则引擎 → `V3-06` GRDB Repository & 媒体安全存储 | **未开始（`V3-04` 受 `UD-01`～`UD-03` 阻塞）** | 必须在 `sqlite3 + python3` 先跑通全约束与边界单测；Swift/Xcode 编译标「需 Mac 实测」 |
| **Phase 3（待启动）** | `V3-07`～`V3-13` iOS 原生五 Tab UI 工程落地（需在 `V3-05/V3-06` 后展开） | **未开始（不可绕过架构直写原型移植代码）** | 严格复用 M1～M10 领域引擎，界面绝不写日期/金额/快照业务公式 |
| **Phase 4（待启动）** | `V3-14`～`V3-20` 备份恢复、白名单图片分享、StoreKit 2 会员、Mac/Xcode 真机编译与 TestFlight 发布 | **未开始（高度依赖 Mac/Xcode）** | 备份/恢复/导出对全部用户永久免费 |

---

## 二、后续开发任务清单与依赖链（V3-03 ～ V3-20）

### 阶段 A：工程隔离与原生数据基石（严格顺序串行，禁跨步）
1. **`V3-03`：原型冻结隔离与工程骨架准备**
   - **前置条件**：用户确认收口文档无误；确认 `prototype/` 与未来 `ios/` 原生工程目录严格物理隔离。
   - **执行要求**：保持 `v0.2-task02.1-frozen` 与 `f6752ac` 不可变；按用户明确授权再处理分支合并或远端同步（未经确认不自动 merge `main` 或 push）。
2. **`V3-04`：SQLite Schema V1、种子分类与 Migration 引擎**
   - **硬性准入条件**：
     - 用户已完成 **`UD-01`（三级分类全表）**、**`UD-02`（美瞳度数归属）**、**`UD-03`（7 天回收站开关）** 拍板；
     - `ADR-0001`（含第 10 节边界说明）与 [SQLite 前置清单](file:///home/xianggujiang/projects/BeautyBox/docs/BeautyBox_SQLite数据库设计前置清单.md)（20 项输入基线）完全对齐。
   - **交付与本机必测要求**：建表 DDL（约 20～21 张业务驱动核心表）、145 节点三级分类初始化、`idle` 与旧 6+24 分类兼容迁移器；在当前 Linux 环境使用 `sqlite3 3.45.1` + `python3` 执行 20 项边界自动化测试（`ON DELETE SET NULL` 快照保护、`is_cover=1` 部分唯一索引、`opened_date >= manufacture_date`、多币种精度往返、`NULL` 评分排除均分等）。
3. **`V3-05`：Swift 核心领域模型与规则引擎（纯逻辑可跨平台单测层）**
   - **前置依赖**：依赖 `V3-04` 字段字典定型，实现 M1～M10 所有无 UI 纯业务规则：
     - M1 `is_custom_name` 建议命名与防护；
     - M2/M9 完整 9 组生命周期状态机、独立重置清除规则与取消零部分保存；
     - M4/M10 美瞳 `replacement_cycle_code` 单源分面、`category_attrs_json` 版本化编解码；
     - M6 4 层日期引擎、`min()` 计算、指纹冲突提醒及美瞳 EXP/抛期隔离算子；
     - M8 集中式离线多币种 Decimal 精度转换与防混加统计器。
4. **`V3-06`：GRDB Repository 持久层与 `MediaStore` 沙盒媒体引擎**
   - **前置依赖**：依赖 `V3-04` DDL + `V3-05` 领域引擎。
   - **核心职责**：单事务控制跨表写入与快照冻结（禁止 View 层直拼 SQL）；`media_assets` 四表引用计数 GC；`trash_expires_at`（若 `UD-03` 确认）7 天到期事务化物理清理。注：GRDB Swift 编译与真机 IO **需 Mac/Xcode 实测**。

### 阶段 B：SwiftUI 五 Tab 原生界面落地（`V3-07` ～ `V3-13`）
- **`V3-07`**：设计系统 DesignTokens、五 Tab 骨架、顶栏安全区统一导航与空/错/确认弹窗公共组件（消化 `测试情况.docx` 反馈的卡片齐高、防换行、iOS 原生底部 Sheet 完整展现问题）。
- **`V3-08`**：首页模块（持有与临期提醒卡、近况妆容、分类分布、单选主币种弱化展示与多币种资产明细弹窗——若 `UD-04` 选方案 A）。
- **`V3-09`**：妆匣列表与产品主档（三级分类模糊检索、美瞳按 `replacement_cycle_code` 动态分组筛选、隐藏技术词的自然数量展示、多图上传与缩略图预览）。
- **`V3-10`**：单件实物详情、多瓶/多盒展开管理（含美瞳盒左右眼度数录入）、快捷状态流转弹窗、独立红色重置入口与减数量安全选择弹窗。
- **`V3-11`**：妆容日记模块（主照+细节多图、单选预设/手填风格场景+自由 tags、**4 项全选填 1～5 整数评分**、多件实物快照绑定、再编辑保留关联、7 天回收站删除/恢复）。
- **`V3-12`**：持妆时间线（2/4/6/8h 及自定义节点）与日常模块（单品使用打卡 + 美瞳佩戴天数提示、早晚护肤流程模板与快照执行、主观肌肤日记）。
- **`V3-13`**：`我的` 模块与回收站统一入口（展示偏好设置、隐私安全声明、回收站批量还原/彻底清空）。

### 阶段 C：数据主权、分享、商业化与发布（`V3-14` ～ `V3-20`）
- **`V3-14`**：全量本地 `.beautyboxbackup` 备份（含一致性快照、SHA256 校验与旧版迁移）、安全点还原及 JSON/CSV/照片 ZIP 导出（全用户免费开放）。
- **`V3-15`**：可选 iCloud Drive 手动/开关备份集成与边界提示（`需 Mac/Xcode 与真机实测`）。
- **`V3-16`**：本地白名单长图分享生成器（强制屏蔽价格、获得渠道、私人备注、日记）。
- **`V3-17`**：StoreKit 2 订阅集成与可配置权益 `EntitlementService`（免费额度与会员定价暂缓至本步前最终确认）。
- **`V3-18`～`V3-20`**：Mac/Xcode 全工程真机联调（`isExcludedFromBackup`、相机/PHPicker、StoreKit 沙盒、内存与无障碍）→ 专项隐私安全回归 → TestFlight 与 App Store 提交准备。

---

## 三、现阶段唯一等待解锁条件
- 本路线图在 **V3.1 规则收口提交后暂停于 `Phase 1.5` 验收口**；请用户审阅 `UD-01`～`UD-04` 并确认 `ADR-0002` 整体基线后，再下达下一条明确指令启动 `V3-03` / `V3-04`。
