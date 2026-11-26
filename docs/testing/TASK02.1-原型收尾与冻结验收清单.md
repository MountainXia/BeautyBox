# TASK02.1 原型冻结与验收记录

- **文档名称**：TASK02.1 原型冻结与验收记录
- **版本号**：V1.0
- **更新时间**：2026-11-26
- **文档状态**：**已完成 / 正式冻结**（历史验收归档，不再作为活跃开发待办）
- **适用阶段**：`TASK02.1` 冻结基线留存与原生迁移参考
- **相关文档引用**：[ADR-0001](../adr/0001-architecture-decisions.md)、[ADR-0002](../adr/0002-m1-to-m10-product-decisions.md)、[BeautyBox_新版开发路线图_V3.0](../BeautyBox_%E6%96%B0%E7%89%88%E5%BC%80%E5%8F%91%E8%B7%AF%E7%BA%BF%E5%9B%BE_V3.0.md)、[BeautyBox_当前待办与决策清单](../BeautyBox_%E5%BD%93%E5%89%8D%E5%BE%85%E5%8A%9E%E4%B8%8E%E5%86%B3%E7%AD%AE%E6%B8%85%E5%8D%95.md)、[BeautyBox_产品需求规格说明书_V3.0](../BeautyBox_%E4%BA%A7%E5%93%81%E9%9C%80%E6%B1%82%E8%A7%84%E6%A0%BC%E8%AF%B4%E6%98%8E%E4%B9%A6_V3.0.md)

---

## 一、TASK02.1 正式冻结声明

经用户确认，此前发现的生命周期状态交互问题及顶部安全区配色问题均已修复完成，**正式批准将 `TASK02.1`（`prototype/` 浏览器可点击交互原型）状态调整为「已完成 / 正式冻结」**。

- **冻结基准分支**：`test/task02-prototype`（未擅自合并 `main`，未删除分支或 C1 历史原型文件）
- **冻结 Git 标签**：`v0.2-task02.1-frozen`（本地只读里程碑冻结标签）
- **历史文档保留说明**：同目录下的 `TASK02.1-阶段执行与验收记录.md` 与 `TASK02.1-最终测试与验收报告.md` 作为冻结前的过程测试快照予以保留，不予删除或覆写。

---

## 二、TASK02.1 完成范围与本轮收尾修复内容

### 2.1 原型总体交付范围（`TASK02.1-A / B / C1 / C2 / D` + 收尾修复）
1. **五 Tab 完整交互骨架**：首页、美妆盒、妆容、日常、我的。
2. **核心资产流与去术语化**：连续单页「+ 添加产品」、名称选填与自动组合（`customName` 保护）、单件规格（`ml/g/其他`）与数量单位（`瓶/支/盒/盘/块/个`）分离、全端清除内部研发术语。
3. **生命周期与有效期独立拆分（方案 3）**：引入 `unrecorded` 系统兜底态，将「待补充信息」严格拆分为「待记录使用状态」与「有效期信息待完善」（明确输出具体缺项如 `缺 PAO`、`缺生产日期`），实现双有效期独立推算、用户确认保护及日期顺序校验（开封/用完日期不早于生产日期）。
4. **多币种与隐私本地化**：`localStorage` 业务状态与 `IndexedDB` 图片 Blob 分离存储、全整数最小货币单位 + 离线币种精度字典（含 `JPY` 0 位、`KWD` 3 位等）、D1 默认单币种设置、7 天回收站（产品按 UUID 恢复不覆盖同名新品）、脱敏诊断日志与 Canvas PNG 白名单分享导出（离屏 `decode()` 原位换图防闪动）。
5. **视觉与图标收尾**：替换为 [beautybox-source.png](file:///home/xianggujiang/projects/BeautyBox/prototype/assets/icons/beautybox-source.png) 切图图标集与 `manifest.webmanifest`，统一筛选栏高度、空状态短语不折行与表单双列对齐。

### 2.2 本轮最终收尾修复清单（用户已确认完成）
- **生命周期交互修复**：修复「使用中 → 未开封」切换时（[store.js](file:///home/xianggujiang/projects/BeautyBox/prototype/js/store.js#L622,L1404) 与 [boxView.js](file:///home/xianggujiang/projects/BeautyBox/prototype/js/views/boxView.js#L1598-L1620,L2122-L2149)）`remainingPercent` 未强制重置为 `100%` 的缺陷；细化折叠卡片缺失字段提示 `shortMissingLabel`（如 `待完善 · 缺 PAO`）；保障取消确认无部分持久化。
- **顶部安全区配色统一**：补充 `<meta name="color-scheme" content="light" />` 与 `:root { color-scheme: light; }`，将暖灰 `--bg-page` 下沉至 `.app-main`，统一 `html`、`body`、`.device-frame` 与 `.app-header` 为纯白 `#FFFFFF` 并补充 `display-mode: standalone` 高度适配（用户已确认修复完成）。
- **其他已知缺陷修复**：修复 [looksView.js](file:///home/xianggujiang/projects/BeautyBox/prototype/js/views/looksView.js#L802-L815) 持妆取消选图 `ReferenceError`；补全 [store.js](file:///home/xianggujiang/projects/BeautyBox/prototype/js/store.js#L2104-L2160) `buildProductItemsCsv` 的 `used_up_date`/`deleted_at` 列与模拟备份 `schema_version: 2`；移除 [app.js](file:///home/xianggujiang/projects/BeautyBox/prototype/js/app.js#L15-L18) 无用导入。

---

## 三、自动化与回归测试结果

- **Node 语法校验**：`prototype/js/` 全部模块 `node --check` 全部通过（退出码 `0`）。
- **Node 自动化测试（[prototype/tests/run-tests.mjs](file:///home/xianggujiang/projects/BeautyBox/prototype/tests/run-tests.mjs)）**：**9 项全部通过、0 项失败、0 项跳过**（涵盖币种精度防浮点、未配置币种拦截、双有效期不猜测、单封面唯一真相源、Safari 空 MIME 图片与回滚、7 天回收站、C2 状态与有效期拆分及第 9 组 M9 生命周期转换、未开封重置 100%、过期与未开封并存、缺失字段细化及导出白名单断言）。
- **无头 Chrome CDP 移动端仿真 E2E（`390×844`）**：运行通过，0 控制台/运行时错误。
- **用户验收结果**：用户已确认本轮生命周期交互问题、顶部安全区配色问题等修复完成，正式批准冻结 `TASK02.1`。

---

## 四、冻结后基线保护与后续缺陷处理原则

1. **只读基线保护**：不再向 `prototype/` 主动新增任何功能（如 9 大分类重构、美瞳专属结构、四维可选评分补齐、多图妆容编辑等新需求**全部转入后续正式原生阶段实现**，不再往原型返工）。
2. **禁止为建库强改原型**：不得为了配合后续 SQLite Schema 而逆向重构已冻结原型代码。
3. **严重缺陷例外机制**：冻结期间如发现阻碍演示的严重缺陷，须单独登记缺陷记录并经用户明确确认后，方可做最小范围修补。
4. **原生参考定位**：原生 Swift / SwiftUI 工程以《产品需求规格说明书 V3.0》《ADR-0001》《ADR-0002》《SQLite 数据库设计前置清单》为唯一正式蓝图，**不直接照搬浏览器原型 DOM/localStorage 代码结构**。
