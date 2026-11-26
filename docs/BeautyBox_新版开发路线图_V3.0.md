# BeautyBox（妆匣）新版开发路线图 V3.0

- **文档名称**：BeautyBox V3.0 开发路线图
- **版本号**：V3.0（2026-11-26 基线更新版）
- **更新时间**：2026-11-26
- **文档状态**：正式发布基线草案（`TASK02.1` **已完成 / 正式冻结**；`V3-02` `M1～M10` 定稿与 `SQLite` 前置清单已编制待审阅；`SQLite` 正式设计与 `Swift/SwiftUI` 原生开发均 **未开始**）
- **适用阶段**：`TASK02.1` 冻结之后 → `V3-02` 决策定稿 → 原生本地 MVP 至发布全周期
- **相关文档引用**：[04_开发计划与AI指令_V2.0.docx](./04_%E5%BC%80%E5%8F%91%E8%AE%A1%E5%88%92%E4%B8%8EAI%E6%8C%87%E4%BB%A4_V2.0.docx)（历史 V2.0 基线保留）、[ADR-0001](./adr/0001-architecture-decisions.md)、[ADR-0002](./adr/0002-m1-to-m10-product-decisions.md)、[BeautyBox_产品需求规格说明书_V3.0](./BeautyBox_%E4%BA%A7%E5%93%81%E9%9C%80%E6%B1%82%E8%A7%84%E6%A0%BC%E8%AF%B4%E6%98%8E%E4%B9%A6_V3.0.md)、[BeautyBox_SQLite数据库设计前置清单](./BeautyBox_SQLite%E6%95%B0%E6%8D%AE%E5%BA%93%E8%AE%BE%E8%AE%A1%E5%89%8D%E7%BD%AE%E6%B8%85%E5%8D%95.md)、[BeautyBox_当前待办与决策清单](./BeautyBox_%E5%BD%93%E5%89%8D%E5%BE%85%E5%8A%9E%E4%B8%8E%E5%86%B3%E7%AD%AE%E6%B8%85%E5%8D%95.md)、[TASK02.1 原型冻结与验收记录](./testing/TASK02.1-%E5%8E%9F%E5%9E%8B%E6%94%B6%E5%B0%BE%E4%B8%8E%E5%86%BB%E7%BB%93%E9%AA%8C%E6%94%B6%E6%B8%85%E5%8D%95.md)

---

## 一、总体开发路线与当前阶段真实状态

- **原 V2.0 路线**：`产品冻结(TASK00-01) → 浏览器原型(TASK02) → 原生本地MVP(TASK03-11) → 导出/备份(TASK12-13) → 分享(TASK14) → StoreKit(TASK15-16) → 发布(TASK17)`。
- **V3.0 现实调整路线**：
  1. **`TASK02 / TASK02.1`（已完成 / 正式冻结）**：交互原型经过 A/B/C1/C2/D 与本轮生命周期、顶部安全区修复，经用户确认修复完成并正式冻结。
  2. **当前正在准备（决策审阅关卡）**：审阅确认 `ADR-0002` 中 **`M1～M10`** 全部待拍板规则（特别是 **9 大类包含美瞳、M7 四维可选评分、M9 状态转换与重置、M10 分类专属属性与美瞳度数/周期存储**），作为 SQLite 正式建表的唯一前提。
  3. **后续正式原生开发（全部尚未启动）**：待 `M1～M10` 拍板后，依次推进 `P1（SQLite + 领域 + Repository，Linux 可先行实测 SQL 与逻辑）→ P2（MediaStore + 五 Tab SwiftUI MVP，需 Mac/Xcode）→ P3（导出/备份/分享图片/StoreKit 2）→ P4（Mac/Xcode 真机回归与上架）`。

---

## 二、原 `TASK00～TASK17` 与新版 `V3` 任务映射及状态表

| 原 V2.0 编号 | 新版 V3 编号与名称 | 当前真实状态 | 说明与变化点 |
|---|---|---|---|
| `TASK 00` | 仓库审计（历史基线） | **已完成** | 已产出初始结构与约束边界。 |
| `TASK 01` | `ADR-0001` 技术决策固化 | **已完成** | 锁定本地优先、无账号、`SQLite+GRDB`、`.beautyboxbackup`、白名单分享。 |
| `TASK 02` + `02.1` | `V3-01`（原型实现、修复与体验收口） | **已完成 / 正式冻结** | 浏览器交互原型已覆盖五 Tab、连续新建、方案 3、7 天回收站原型、D1/D3 币种、Canvas 分享与安全区修复，由用户确认冻结（不再新增功能）。 |
| *(新增关卡)* | `V3-02`：产品规则文档梳理与 `ADR-0002` / V3.0 基线编制 | **正在准备（待用户确认 M1～M10）** | 本轮已产出 `PRD V3.0`、`ADR-0002`、`SQLite 前置清单` 与冻结记录；需用户确认待定决策后定稿生效。 |
| *(收口隔离)* | `V3-03`：原型冻结保护与分支策略处理 | **待用户指令（按需合并或保留 `test/task02-prototype`）** | 冻结 Tag 已打在 `test/task02-prototype`；C1 临时文件清理与分支合并 `main` 待后续单独确认执行。 |
| `TASK 03` | `V3-04`：SQLite Schema V1 与自动化约束测试 | **未开始（等待 M1～M10 拍板）** | 按《SQLite 数据库设计前置清单》设计建表，不再机械追求 20 张表数量，重点落地 9 大类/美瞳/M9/M10 并在 Linux `sqlite3` 验证。 |
| `TASK 04`（拆分） | `V3-05`：Swift 纯领域规则与状态机引擎<br>`V3-06`：GRDB 模型与迁移宿主<br>`V3-07`：核心 Repository 仓储层 | **未开始** | 拆分为 3 个独立任务：纯领域引擎（币种/双有效期/M9状态机/M10属性豁免）先于数据层；View 严禁直连 SQL。 |
| `TASK 05` | `V3-08`：本地 `MediaStore` 图片沙盒与清理服务 | **未开始**（需 Mac/Xcode） | 私有目录存储、缩略图、压缩、SHA-256、引用计数孤儿清理、`isExcludedFromBackup = true`。 |
| `TASK 06` | `V3-09`：DesignSystem 与五 Tab 原生导航骨架 | **未开始**（需 Mac/Xcode） | 挂载 `AppIcon`、统一纯白安全区顶栏、极简无账号首启引导。 |
| `TASK 07` + `08` | `V3-10`：原生「首页」与「美妆盒」（含 M4/M9/M10） | **未开始**（需 Mac/Xcode） | 落地 9 大类及美瞳独立管理（左右眼不同度数/更换周期）、M9 专用重置与状态流转、首页统计口径。 |
| `TASK 09` + `10` | `V3-11`：原生「妆容」与持妆时间线（含 M7） | **未开始**（需 Mac/Xcode） | 补齐原型缺失的多图妆容编辑、四维全可选评分、持妆节点 CRUD 与快照保护。 |
| `TASK 11` + 基础我的 | `V3-12`：原生「日常」与「我的 → 最近删除/基础设置」 | **未开始**（需 Mac/Xcode） | 补齐使用日志/流程模板/肌肤日记全 CRUD 闭环与统一回收站。 |
| *(M2 里程碑验)* | `V3-13`：本地原生 MVP 离线与稳定性测试 | **未开始**（需 Mac/Xcode） | 飞行模式全流程跑通与重启完整性核查。 |
| `TASK 12` | `V3-14`：本地免费数据导出（JSON / 完整 CSV / 照片 ZIP） | **未开始**（需 Mac/Xcode） | 原型仅演示基础 JSON/CSV，原生端正式实现含照片 ZIP 与完整新字段导出。 |
| `TASK 13` | `V3-15`：`.beautyboxbackup` 备份恢复与 iCloud 边界 | **未开始**（需 Mac/Xcode） | 须先出 `ADR-0003` 确认 iCloud Drive 文件包实现细则；含 Safepoint 自动创建与回滚。 |
| `TASK 14` | `V3-16`：SwiftUI `ImageRenderer` 白名单分享图片 | **未开始**（需 Mac/Xcode） | 复用原型白名单规范，原生端正式实现并补充零泄漏单测。 |
| `TASK 15` | `V3-17`：StoreKit 2 配置化订阅服务 | **未开始**（需 Mac/Xcode） | 配置化额度阈值；过期不锁数据、不阻断导出与备份恢复。 |
| `TASK 16` | `V3-18`：可选链接分享架构评估（仅输出文档不编码） | **暂缓 / 后置评估** | V1 不建服务端表不编码。 |
| `TASK 17` | `V3-19`：真机隐私、无障碍与全量回归<br>`V3-20`：TestFlight 与 App Store 上架准备 | **未开始**（强制 Mac/Xcode + 真机） | 实机验证 `isExcludedFromBackup`、VoiceOver、动态字体与审前材料。 |

---

## 三、阶段划分与详细 AI 可执行任务卡

### 阶段 P0：原型冻结与规范对齐（`M1`）
- **`V3-01`（已完成 / 正式冻结）**：交付冻结原型代码、`run-tests.mjs` 9/9 通过与 [冻结验收清单](./testing/TASK02.1-%E5%8E%9F%E5%9E%8B%E6%94%B6%E5%B0%BE%E4%B8%8E%E5%86%BB%E7%BB%93%E9%AA%8C%E6%94%B6%E6%B8%85%E5%8D%95.md)。
- **`V3-02`（正在准备 · 待用户确认 `M1~M10`）**：
  - **开始条件**：审阅 [ADR-0002](./adr/0002-m1-to-m10-product-decisions.md) 与 [SQLite 前置清单](./BeautyBox_SQLite%E6%95%B0%E6%8D%AE%E5%BA%93%E8%AE%BE%E8%AE%A1%E5%89%8D%E7%BD%AE%E6%B8%85%E5%8D%95.md)。
  - **完成条件**：用户明确确认 `M1~M10` 所有待确认决策（重点 `M4`、`M7`、`M9`、`M10`），将 `ADR-0002` 状态更新为「已确认定稿」。
- **`V3-03`（按需独立执行）**：确认是否推送冻结节点、清理/归档 C1 临时文件并将 `test/task02-prototype` 合入 `main`（本次禁止执行）。

### 阶段 P1：正式 SQLite 数据库与纯领域底座（`M2-A`，Linux 可先验核心逻辑）
- **`V3-04`｜SQLite Schema V1 与自动化约束测试（未开始）**
  - **前置依赖**：`V3-02`（`ADR-0002` 定稿，特别是 `M4` 9 大类与二级字典、`M9` 枚举/重置语义、`M10` 属性表选型）。
  - **交付物**：`001_initial_schema.sql`、`001_system_categories.sql`、本机 `sqlite3` + `python3` 自动化约束测试（校验外键 `RESTRICT`/`SET NULL`、`CHECK` 约束、美瞳不同度数多件、快照保留、防账号字段）。
  - **需 Mac/Xcode**：Schema SQL 与约束验证在 Linux 可全测；Swift GRDB 编译需 Mac。
- **`V3-05`｜Swift 核心纯领域规则与状态机引擎（未开始）**
  - **前置依赖**：`V3-02`。
  - **交付物**：`BeautyBoxDomain`（离线币种精确计算、双有效期、M9 全量状态转换矩阵+重置+未开封100%+美瞳生命周期、M10 工具免追踪规则、名称组合）。
  - **需 Mac/Xcode**：XCTest 编译运行需 Mac/Xcode。
- **`V3-06`｜Swift GRDB 数据模型与迁移宿主（未开始）**
  - **前置依赖**：`V3-04`。
  - **需 Mac/Xcode**：编译与迁移测试需 Mac/Xcode。
- **`V3-07`｜核心 Repository 仓储层（未开始）**
  - **前置依赖**：`V3-05`、`V3-06`。
  - **交付物**：`CategoryRepository`、`ProductRepository`（含原子状态转换、7 天回收站 UUID 恢复、专用重置回 `unrecorded`）、`HomeSummaryRepository`、`LookWearRepository`、`DailyRepository`。
  - **需 Mac/Xcode**：Swift 集成测需 Mac/Xcode（核心 SQL 聚合可在 Linux `sqlite3` 交叉验证）。

### 阶段 P2：本地媒体服务与原生五 Tab UI MVP（`M2-B`，强制需 Mac/Xcode 实测）
- **`V3-08`｜`MediaStore` 私有沙盒图片服务**（依赖 `V3-06`）
- **`V3-09`｜DesignSystem、AppIcon 与五 Tab 骨架**（依赖 `V3-07`）
- **`V3-10`｜原生「首页」与「美妆盒」**（依赖 `V3-07`~`V3-09`，含 9 大类、美瞳专属交互与左右眼度数、M9 完整流转与重置）
- **`V3-11`｜原生「妆容」与持妆时间线**（依赖 `V3-07`~`V3-09`，含 M7 预设+自定义、四维全可选评分、多图编辑、持妆全 CRUD）
- **`V3-12`｜原生「日常」与「我的」基础模块**（依赖 `V3-07`~`V3-09`，含使用日志/流程/日记全 CRUD 与统一 7 天回收站）
- **`V3-13`｜M2 本地原生 MVP 离线与稳定性验证**（依赖 `V3-08`~`V3-12`）

### 阶段 P3：数据安全、导出备份、图片分享与商业化（`M3 + M4`）
- **`V3-14`｜免费全量导出（JSON / 完整 CSV / 照片 ZIP）**（依赖 `V3-07`、`V3-08`，需 Mac/Xcode）
- **`V3-15`｜`ADR-0003` + `.beautyboxbackup` 手动备份与 Safepoint 恢复**（依赖 `V3-07`、`V3-08`、`V3-14`，需 Mac/Xcode）
- **`V3-16`｜SwiftUI `ImageRenderer` 白名单分享图片**（依赖 `V3-11`、`V3-08`，需 Mac/Xcode）
- **`V3-17`｜StoreKit 2 配置化会员订阅**（依赖 `V3-09`，需 Mac/Xcode）
- **`V3-18`｜可选链接分享架构评估文档（仅出方案不编码）**（暂缓至 V1 闭环后）

### 阶段 P4：Mac/Xcode 真机集成、隐私无障碍回归与发布（`M5`）
- **`V3-19`｜全端 XCTest、`isExcludedFromBackup` 真机核查与 VoiceOver/动态字体回归**（强依赖 Mac/Xcode + 真机）
- **`V3-20`｜TestFlight 分发与 App Store 上架准备**（强依赖 Mac/Xcode）

---

## 四、明确标注暂缓与不纳入 V1 的能力
- **暂缓（V1.x / V2 候选）**：用户自定义一/二级分类管理 UI、本地过期提醒通知推送（`UNUserNotificationCenter`）、批量表格导入、CloudKit 多设备自动同步、可选链接分享与好友评分。
- **永久红线（永不违背）**：无自建账号登录墙、无未经用户主动授权的上传、无 `Float` 金额、无 Base64 图片入库、订阅过期永不锁定或删除已有数据查看与导出权。
