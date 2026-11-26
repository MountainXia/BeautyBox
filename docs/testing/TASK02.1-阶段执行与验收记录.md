# 妆匣 BeautyBox · TASK02.1 阶段执行与验收记录

> 说明：本记录严格区分「Linux Node 自动化测试」「Linux 无头 Chrome 手机视口 CDP 测试（390×844）」「iPhone Safari 真机人工验收」与「未来原生 Mac/Xcode 实测」，不做跨环境越权代测声明。

## 1. 各子阶段执行台账

| 子阶段 | 核心范围 | 代码状态 | 自动化 / 桌面 CDP 状态 | iPhone 真机 / 原生状态 |
|---|---|---|---|---|
| **TASK02.1-A** | Safari 空 MIME 图片校验、缩略图预览、`visualViewport` 弹窗与触摸锁防护、脱敏诊断日志、本地分享 Canvas PNG 导出 | 已完成 | Node 8 项测试包含 A 专项用例通过 | 已随在线测试版真机验证 |
| **TASK02.1-B** | 未开封与开封后双有效期独立推算与 `?` 折叠、获得方式预设与自定义、妆容编辑与 7 天回收站、首页单币种汇总、`我的` 折叠列表 | 已完成 | Node 8 项测试包含 B 专项用例通过 | 已随在线测试版真机验证 |
| **TASK02.1-C1** | 独立交互原型（`c1-prototype.html`），验证单页连续添加、未记录状态、待记录状态与有效期待完善拆分（方案 3）、状态流转、用完日期与使用时长、产品 7 天回收站 | 已完成并验收 | 已通过交互校验 | 用户在 iPhone Safari 实测并验收通过 |
| **TASK02.1-C2** | 正式代码落地：状态 `unrecorded`、版本 `1 -> 2` 平滑迁移、单页连续新建、状态与有效期拆分、UUID 独立恢复回收站、D1 默认币种收敛、D3 离线全币种字典、日期顺序校验（开封/用完不早于生产日期）、去术语化 | 已完成 | Node 8/8 通过；Chrome CDP（390×844）全部通过 | **待推送后真机复测** |
| **TASK02.1-D** | 顶部状态栏安全区与顶栏纯白一体化配色（消灰白分界线）、App 图标替换与 `manifest.webmanifest`、单件规格收敛为 `ml / g / 其他`、妆容风格/场景快捷预设、分享复选框离屏预解码防闪动、验收报告归档 | 已完成 | Node 8/8 通过；Chrome CDP（390×844）验证通过 | **待推送后真机复测**（图标添加到主屏幕、状态栏色差及无闪动观感需真机确认） |

## 2. 对下一阶段 TASK03（SQLite Schema 与迁移）的记录约束

1. `product_items.status` 的 `CHECK` 约束须纳入 `'unrecorded'`，不得在原生建表时遗漏导致写入失败。
2. `product_items` 须包含 `used_up_date` 与 `deleted_at`；`products` 须包含 `custom_name`（可空）、`subcategory_id`、`specification_value` / `specification_unit` / `specification_custom_unit`、`quantity_unit`、`deleted_at`、`purge_at`；`settings` 须包含 `enable_foreign_currency`。
3. 历史妆容关联与使用日志快照外键须严格保持 `ON DELETE SET NULL`。
4. 若涉及旧表结构升级，必须通过规范 SQLite Migration 重建表迁移并附带单元测试。
