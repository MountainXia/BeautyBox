# 妆匣 BeautyBox SQLite Schema V1 自动化测试说明

- **测试套件路径**：[database/tests/test_schema_v1.py](file:///home/xianggujiang/projects/BeautyBox/database/tests/test_schema_v1.py)
- **被测核心实现**：[0001_schema_v1.sql](file:///home/xianggujiang/projects/BeautyBox/database/migrations/0001_schema_v1.sql)、[0001_categories_v1.sql](file:///home/xianggujiang/projects/BeautyBox/database/seeds/0001_categories_v1.sql)、[beautybox_db.py](file:///home/xianggujiang/projects/BeautyBox/database/python/beautybox_db.py)
- **测试环境**：Linux x86_64 + Python `3.12.3` + SQLite `3.45.1`（每个用例均独立创建真实临时磁盘 `.sqlite` 数据库执行完整 SQL）
- **最新运行结果**：**14/14 全部通过（0 failures, 0 errors, 0 skipped）** + 原生 `sqlite3` CLI `PRAGMA foreign_key_check` 零违规；原型回归 `node prototype/tests/run-tests.mjs` **9/9 通过**。

---

## 用例覆盖矩阵（全对应 V3-04 阶段 E 验收要求）

| 用例编号 | 测试方法名 | 验证焦点与关键断言 | 实测状态 |
| --- | --- | --- | --- |
| **TC-01** | `test_01_fresh_init_tables_seeds_and_no_float_columns` | 全新空库建齐 22 张表；扫描全部表字段**零 `REAL`/`FLOAT`/`DOUBLE`**；147 节点（9/45/93）初始化及 V3.1 分类校准项存在性（拆`护足霜`/`颈霜`、`底油亮油`/`指缘油`、更名`爽肤水/保湿水`、工具洗刷水特例） | 通过 |
| **TC-02** | `test_02_foreign_keys_enabled_and_restrict_enforced` | 连接后 `PRAGMA foreign_keys == 1`；非法外键插入失败；有产品引用的分类禁止删除（`ON DELETE RESTRICT`） | 通过 |
| **TC-03** | `test_03_required_fields_check_constraints_and_nullable_ratings` | 空白名拦截；`2026-02-30` 非法日历拦截；`opened < manufacture` 拦截；`unrecorded`/`finished` 与剩余比例互斥约束；单封面部分唯一索引防双封面；`looks` 4 评分真 `NULL` 且排除在 `AVG()` 外（禁止 0 分） | 通过 |
| **TC-04** | `test_04_product_and_multiple_product_items` | 1 款产品下挂多个不同状态/日期/剩余量 `ProductItem`；活跃持有计数排除 `finished` | 通过 |
| **TC-05** | `test_05_contact_lens_single_box_isolation` | 确认表结构无双目并行度数旧列；同款下兼容 `left`/`right`/`both`/`unspecified` 四类单盒及批号隔离；拒绝单盒塞入 `-2.50/-3.00` 双度数 | 通过 |
| **TC-06** | `test_06_contact_lens_single_source_replacement_cycle` | 确认 `L1_LENS` 无“日抛/月抛”分类节点，仅由 `replacement_cycle_code` 单源筛选与合法性 `CHECK` 约束 | 通过 |
| **TC-07** | `test_07_lifecycle_enum_and_idle_three_branch_migration` | 拒绝库中写入废弃 `idle`；验证 `idle` 三分支兼容（有使用证据→`in_use` + 日志；无证据→`unrecorded + pending_idle_review`）及五类旧分类映射真实落库 | 通过 |
| **TC-08** | `test_08_currency_integer_minor_units_and_isolation` | 验证 `CNY(2)`、`JPY(0)`、`KWD(3)` 整数转换；拦截超精度输入与未配置币种 `XTS`；负价格拒存；分币种汇总隔离（含已用完历史消费） | 通过 |
| **TC-09** | `test_09_trash_scope_isolation` | 先单删实物 A（`direct`），再删整款产品（仅实物 B 标记 `cascade_with_product + deleted_by_parent_id`），互不污染批次 | 通过 |
| **TC-10** | `test_10_parent_restore_isolation_uuid_no_merge_and_orphan_guard` | 恢复父产品仅恢复同批次实物 B，实物 A 留在回收站；恢复保持原 UUID 且不与同名新品自动合并；拦截父产品仍在回收站或已被彻删时产生孤儿单件 | 通过 |
| **TC-11** | `test_11_look_snapshots_preserved_after_product_purge` | 产品与单件含使用流水经安全事务彻底删除后，`look_product_items.product_item_id` 置 `NULL` 且品牌/产品/色号/分类/规格快照全量可读 | 通过 |
| **TC-12** | `test_12_photo_multi_reference_protection_and_zero_ref_gc` | 共享照片同时被产品与妆容引用时，软删或彻删产品后严禁删图（引用=2）；直至妆容也彻删使引用归 0 时才释放删除 `media_assets` | 通过 |
| **TC-13** | `test_13_migration_transaction_rollback_on_failure` | V2 迁移脚本执行到一半报错时整批 `ROLLBACK`，不残留半成品表、`user_version` 维持 1、V1 已有数据无损 | 通过 |
| **TC-14** | `test_14_migration_version_governance_and_v2_upgrade` | 合法 Schema V2 增量脚本升级保留所有 V1 用户数据，递增 `user_version = 2` 并写 `schema_migrations`；拒绝高版本库降级 | 通过 |

---

## 复现运行命令

```bash
# 1. 运行 14 项真实 SQLite Schema V1 自动化测试
python3 -m unittest discover -s database/tests -v

# 2. 原生 sqlite3 CLI 全量冷启动与外键体检验证
TMP_DB=$(mktemp /tmp/bb_cli_XXXXXX.sqlite)
sqlite3 "$TMP_DB" "PRAGMA foreign_keys = ON; $(cat database/migrations/0001_schema_v1.sql) $(cat database/seeds/0001_categories_v1.sql)"
sqlite3 "$TMP_DB" "PRAGMA foreign_key_check; SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'; SELECT COUNT(*) FROM categories;"
rm -f "$TMP_DB"

# 3. 验证冻结原型未受影响
node prototype/tests/run-tests.mjs
```

> **尚未验证的范围声明**：Swift `GRDB` 封装层与 iOS 真机真文件系统 IO / `isExcludedFromBackup` 特性在当前 Linux 环境无法执行，统一保持为「待 `V3-05`/`V3-06` 开发及 Mac/Xcode 真机实测」。
