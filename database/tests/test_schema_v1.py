"""
妆匣 BeautyBox · SQLite Schema V1 自动化验收测试套件
全部测试均真实创建 SQLite 数据库文件并执行真实 SQL / 事务 / 约束 / 迁移脚本。
"""

from __future__ import annotations

import pathlib
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "python"))

import beautybox_db as db  # noqa: E402

NOW = "2026-11-27T08:30:00Z"


class BeautyBoxSchemaV1TestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = pathlib.Path(self.tmp_dir.name) / "beautybox_test.sqlite"
        self.conn = db.connect_sqlite(self.db_path)
        applied = db.apply_migrations(self.conn, applied_at=NOW)
        self.assertEqual(applied, [1])

    def tearDown(self) -> None:
        self.conn.close()
        self.tmp_dir.cleanup()

    def _cat_id(self, code: str) -> str:
        row = self.conn.execute("SELECT id FROM categories WHERE code = ?;", (code,)).fetchone()
        self.assertIsNotNone(row, f"Missing category code: {code}")
        return row["id"]

    def _seed_brand(self, bid: str = "brand-zelens", name: str = "Zelens") -> str:
        self.conn.execute(
            "INSERT INTO brands (id, name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?);",
            (bid, name, name.lower(), NOW, NOW),
        )
        return bid

    def _seed_product(
        self,
        pid: str = "prod-1",
        *,
        cat_code: str = "L3_MK_BASE_FOUNDATION",
        brand_id: str | None = None,
        name: str = "Zelens 粉底液 Youth",
        shade: str | None = "Youth",
    ) -> str:
        cid = self._cat_id(cat_code)
        self.conn.execute(
            """
            INSERT INTO products (id, brand_id, category_id, name, is_custom_name, spec_value, spec_unit, shade, created_at, updated_at)
            VALUES (?, ?, ?, ?, 0, '30', 'ml', ?, ?, ?);
            """,
            (pid, brand_id, cid, name, shade, NOW, NOW),
        )
        return pid

    def _seed_item(
        self,
        iid: str = "item-1",
        product_id: str = "prod-1",
        *,
        status: str = "unrecorded",
        remaining: int | None = None,
        price_minor: int | None = 42000,
        currency: str = "CNY",
        mfg: str | None = "2025-01-10",
        shelf_months: int | None = 36,
        opened: str | None = None,
        pao: int | None = None,
        exp_pkg: str | None = None,
        lens_eye_side: str | None = None,
        lens_power: str | None = None,
        batch_code: str | None = None,
    ) -> str:
        self.conn.execute(
            """
            INSERT INTO product_items (
                id, product_id, purchase_price_minor, currency_code, purchase_date,
                lifecycle_status, remaining_percent, manufacture_date, unopened_shelf_months,
                packaging_exp_date, opened_date, pao_months, lens_eye_side, lens_power, batch_code,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, '2026-01-15', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                iid,
                product_id,
                price_minor,
                currency,
                status,
                remaining,
                mfg,
                shelf_months,
                exp_pkg,
                opened,
                pao,
                lens_eye_side,
                lens_power,
                batch_code,
                NOW,
                NOW,
            ),
        )
        return iid

    # 1. 全新数据库初始化 & 禁用 Float 列检查 & 147 节点分类字典
    def test_01_fresh_init_tables_seeds_and_no_float_columns(self) -> None:
        tables = [
            r["name"]
            for r in self.conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
            ).fetchall()
        ]
        self.assertEqual(len(tables), 22)
        self.assertIn("schema_migrations", tables)
        self.assertIn("product_lens_profiles", tables)
        self.assertEqual(self.conn.execute("PRAGMA user_version;").fetchone()[0], 1)

        # 确认全库无 REAL / FLOAT 类型列
        for tbl in tables:
            cols = self.conn.execute(f"PRAGMA table_info({tbl});").fetchall()
            for col in cols:
                ctype = (col["type"] or "").upper()
                self.assertNotIn("REAL", ctype, f"{tbl}.{col['name']} must not use REAL")
                self.assertNotIn("FLOAT", ctype, f"{tbl}.{col['name']} must not use FLOAT")
                self.assertNotIn("DOUBLE", ctype, f"{tbl}.{col['name']} must not use DOUBLE")

        counts = {
            r["level"]: r["cnt"]
            for r in self.conn.execute(
                "SELECT level, COUNT(*) AS cnt FROM categories GROUP BY level ORDER BY level;"
            ).fetchall()
        }
        self.assertEqual(counts, {1: 9, 2: 45, 3: 93})
        self.assertEqual(sum(counts.values()), 147)

        # 校准分类检查：护足霜/颈霜拆分、底油/指缘油拆分及归属、爽肤水命名、工具洗刷水特例
        self.assertIsNotNone(self._cat_id("L3_BD_CR_FOOT"))
        self.assertIsNotNone(self._cat_id("L3_BD_CR_NECK"))
        self.assertIsNotNone(self._cat_id("L3_NL_PL_BASE_TOP"))
        cuticle_row = self.conn.execute(
            "SELECT c.name, p.code AS parent_code FROM categories c JOIN categories p ON p.id = c.parent_id WHERE c.code = 'L3_NL_OT_CUTICLE_OIL';"
        ).fetchone()
        self.assertEqual(cuticle_row["parent_code"], "L2_NL_OTHER")
        toner_row = self.conn.execute("SELECT name FROM categories WHERE code = 'L2_SK_TONER';").fetchone()
        self.assertEqual(toner_row["name"], "爽肤水/保湿水")
        cleanser_mode = self.conn.execute(
            "SELECT expiry_management_mode FROM categories WHERE code = 'L3_TL_OT_CLEANSER';"
        ).fetchone()
        brush_mode = self.conn.execute(
            "SELECT expiry_management_mode FROM categories WHERE code = 'L2_TL_BRUSH';"
        ).fetchone()
        self.assertEqual(cleanser_mode["expiry_management_mode"], "tracked")
        self.assertEqual(brush_mode["expiry_management_mode"], "optional")

    # 2. 外键真实启用验证
    def test_02_foreign_keys_enabled_and_restrict_enforced(self) -> None:
        self.assertEqual(self.conn.execute("PRAGMA foreign_keys;").fetchone()[0], 1)
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(
                """
                INSERT INTO products (id, category_id, name, created_at, updated_at)
                VALUES ('p-bad-cat', 'non-existent-category', 'Test', ?, ?);
                """,
                (NOW, NOW),
            )
        self._seed_product("p-fk")
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute("DELETE FROM categories WHERE code = 'L3_MK_BASE_FOUNDATION';")

    # 3. 必填字段、CHECK 约束、单封面索引与四维评分 NULL 语义
    def test_03_required_fields_check_constraints_and_nullable_ratings(self) -> None:
        self._seed_product("p-chk")
        # 空白名称拒存
        with self.assertRaises(sqlite3.IntegrityError):
            self._seed_product("p-blank-name", name="   ")
        # 非法日历 2026-02-30 拒存
        with self.assertRaises(sqlite3.IntegrityError):
            self._seed_item("i-bad-date", "p-chk", mfg="2026-02-30")
        # 开封早于生产日期拒存
        with self.assertRaises(sqlite3.IntegrityError):
            self._seed_item("i-bad-order", "p-chk", status="in_use", remaining=90, mfg="2026-05-10", opened="2026-05-01")
        # unrecorded 不得带 remaining_percent
        with self.assertRaises(sqlite3.IntegrityError):
            self._seed_item("i-bad-unrec", "p-chk", status="unrecorded", remaining=80)
        # finished 必须 remaining_percent == 0
        with self.assertRaises(sqlite3.IntegrityError):
            self._seed_item("i-bad-fin", "p-chk", status="finished", remaining=10)

        # 单封面唯一约束
        for aid in ("asset-1", "asset-2"):
            self.conn.execute(
                """
                INSERT INTO media_assets (id, relative_path, mime_type, byte_size, sha256, created_at, updated_at)
                VALUES (?, ?, 'image/jpeg', 1024, ?, ?, ?);
                """,
                (aid, f"Media/{aid}.jpg", "a" * 64, NOW, NOW),
            )
        self.conn.execute(
            "INSERT INTO product_photos (id, product_id, asset_id, sort_order, is_cover, created_at) VALUES ('pp1', 'p-chk', 'asset-1', 0, 1, ?);",
            (NOW,),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(
                "INSERT INTO product_photos (id, product_id, asset_id, sort_order, is_cover, created_at) VALUES ('pp2', 'p-chk', 'asset-2', 1, 1, ?);",
                (NOW,),
            )

        # M7 四项评分全选填真 NULL 不拉低 AVG()
        self.conn.execute(
            """
            INSERT INTO looks (id, name, look_date, self_rating, coordination_rating, color_rating, wear_rating, created_at, updated_at)
            VALUES ('look-rated', '通勤妆', '2026-11-20', 5, 4, 3, 5, ?, ?);
            """,
            (NOW, NOW),
        )
        self.conn.execute(
            """
            INSERT INTO looks (id, name, look_date, self_rating, coordination_rating, color_rating, wear_rating, created_at, updated_at)
            VALUES ('look-unrated', '随手妆', '2026-11-21', NULL, NULL, NULL, NULL, ?, ?);
            """,
            (NOW, NOW),
        )
        for bad_col in ("self_rating", "coordination_rating", "color_rating", "wear_rating"):
            for bad_val in (0, 6):
                with self.assertRaises(sqlite3.IntegrityError):
                    self.conn.execute(
                        f"INSERT INTO looks (id, name, look_date, {bad_col}, created_at, updated_at) VALUES (?, '坏分', '2026-11-21', ?, ?, ?);",
                        (f"look-bad-{bad_col}-{bad_val}", bad_val, NOW, NOW),
                    )
        avg_row = self.conn.execute(
            """
            SELECT AVG(self_rating) AS s, AVG(coordination_rating) AS co,
                   AVG(color_rating) AS cl, AVG(wear_rating) AS w,
                   COUNT(self_rating) AS cnt
            FROM looks;
            """
        ).fetchone()
        self.assertEqual(avg_row["cnt"], 1)
        self.assertEqual((avg_row["s"], avg_row["co"], avg_row["cl"], avg_row["w"]), (5.0, 4.0, 3.0, 5.0))

    # 4. Product 与 ProductItem 多瓶隔离与独立计数
    def test_04_product_and_multiple_product_items(self) -> None:
        self._seed_product("p-multi")
        self._seed_item("i-1", "p-multi", status="in_use", remaining=60, opened="2026-06-01", pao=12)
        self._seed_item("i-2", "p-multi", status="unopened", remaining=100, mfg="2026-09-01", shelf_months=36)
        self._seed_item("i-3", "p-multi", status="finished", remaining=0, mfg="2024-06-01", opened="2025-01-01", pao=12)
        held_count = self.conn.execute(
            "SELECT COUNT(*) FROM product_items WHERE product_id = 'p-multi' AND deleted_at IS NULL AND lifecycle_status != 'finished';"
        ).fetchone()[0]
        self.assertEqual(held_count, 2)

    # 5. 不同美瞳度数和批次独立保存（单盒粒度、防错合并、禁止双度数）
    def test_05_contact_lens_single_box_isolation(self) -> None:
        item_cols = {r["name"] for r in self.conn.execute("PRAGMA table_info(product_items);").fetchall()}
        self.assertIn("lens_eye_side", item_cols)
        self.assertIn("lens_power", item_cols)
        self.assertNotIn("left_eye_power", item_cols)
        self.assertNotIn("right_eye_power", item_cols)
        self.assertNotIn("lens_power_mode", item_cols)

        self._seed_product("prod-olens", cat_code="L2_LN_COSMETIC", name="Olens Scandi Gray 日抛", shade=None)
        self.conn.execute(
            """
            INSERT INTO product_lens_profiles (product_id, replacement_cycle_code, bc_mm, dia_mm, water_content_percent, pack_piece_count, lens_color_pattern, created_at, updated_at)
            VALUES ('prod-olens', 'daily', '8.6', '14.2', 48, 10, 'Scandi Gray', ?, ?);
            """,
            (NOW, NOW),
        )

        # 四种单盒眼别互不混同：left、right、both(同度数通用盒)、unspecified(未指定且不强制写度数)
        self._seed_item("box-L", "prod-olens", status="unopened", remaining=100, exp_pkg="2029-05-01", lens_eye_side="left", lens_power="-2.50", batch_code="B01")
        self._seed_item("box-R", "prod-olens", status="unopened", remaining=100, exp_pkg="2029-05-01", lens_eye_side="right", lens_power="-3.00", batch_code="B01")
        self._seed_item("box-both", "prod-olens", status="in_use", remaining=80, opened="2026-11-27", exp_pkg="2029-08-01", lens_eye_side="both", lens_power="0.00", batch_code="B02")
        self._seed_item("box-unspec", "prod-olens", status="unrecorded", remaining=None, exp_pkg="2028-12-01", lens_eye_side="unspecified", lens_power=None, batch_code=None)

        # 拒绝向单盒塞入左右双度数（如 "-2.50/-3.00"）
        with self.assertRaises(sqlite3.IntegrityError):
            self._seed_item("box-bad-dual", "prod-olens", lens_eye_side="both", lens_power="-2.50/-3.00")

        cnt = self.conn.execute("SELECT COUNT(*) FROM product_items WHERE product_id = 'prod-olens';").fetchone()[0]
        self.assertEqual(cnt, 4)

    # 6. 美瞳周期字段的唯一事实来源
    def test_06_contact_lens_single_source_replacement_cycle(self) -> None:
        lens_children = [
            r["name"]
            for r in self.conn.execute(
                "SELECT name FROM categories WHERE parent_id = ?;", (self._cat_id("L1_LENS"),)
            ).fetchall()
        ]
        self.assertEqual(set(lens_children), {"彩色美瞳镜片", "美瞳护理与伴侣盒", "其他美瞳相关"})

        self._seed_product("prod-cycle", cat_code="L2_LN_COSMETIC", name="博士伦蕾丝月抛", shade=None)
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(
                "INSERT INTO product_lens_profiles (product_id, replacement_cycle_code, created_at, updated_at) VALUES ('prod-cycle', 'invalid_cycle', ?, ?);",
                (NOW, NOW),
            )
        self.conn.execute(
            "INSERT INTO product_lens_profiles (product_id, replacement_cycle_code, created_at, updated_at) VALUES ('prod-cycle', 'monthly', ?, ?);",
            (NOW, NOW),
        )
        self._seed_item("box-m1", "prod-cycle", status="unopened", remaining=100, lens_eye_side="both", lens_power="-1.75")
        matched = self.conn.execute(
            """
            SELECT pi.id FROM product_items pi
            JOIN product_lens_profiles lp ON lp.product_id = pi.product_id
            WHERE lp.replacement_cycle_code = 'monthly';
            """
        ).fetchall()
        self.assertEqual([r["id"] for r in matched], ["box-m1"])

    # 7. 生命周期与废弃 idle 三分支兼容验证
    def test_07_lifecycle_enum_and_idle_three_branch_migration(self) -> None:
        self._seed_product("p-life")
        with self.assertRaises(sqlite3.IntegrityError):
            self._seed_item("i-idle", "p-life", status="idle")

        # 分支 A：有剩余比例<100 / lastUsedAt 证据 -> in_use
        res_a = db.migrate_legacy_idle_status({"status": "idle", "openedDate": None, "remainingPercent": 95, "lastUsedAt": "2026-11-10T10:00:00Z"})
        self.assertEqual(res_a["lifecycle_status"], "in_use")
        self.assertIsNone(res_a["migration_review_status"])
        self.assertIn("idle", res_a["audit_note"])

        # 分支 B：无任何开封或使用证据 -> unrecorded + 待人工核对
        res_b = db.migrate_legacy_idle_status({"status": "idle", "openedDate": None, "paoMonths": None, "remainingPercent": 100, "lastUsedAt": None})
        self.assertEqual(res_b["lifecycle_status"], "unrecorded")
        self.assertEqual(res_b["migration_review_status"], "pending_idle_review")
        self.assertIn("idle", res_b["audit_json"])

        # 验证历史分类五类映射均真实落入库中存在的三级/末端编码
        cases = [
            ("sub-foundation", None, "粉底液", None, None, "one_to_one", "L3_MK_BASE_FOUNDATION"),
            ("sub-concealer", None, "三色遮瑕膏", None, None, "one_to_many", "L3_MK_CONCEALER_CREAM"),
            ("sub-lipbalm", None, "Dior变色润唇膏", "#001", None, "conditional", "L3_MK_LIP_TINTED_BALM"),
            ("sub-lipbalm", None, "依泉润唇膏", None, None, "conditional", "L3_SK_OT_LIPBALM"),
            ("c1-sub-eyeliner", None, "眼线胶笔", None, None, "merged", "L3_MK_EYE_LINER"),
            ("unknown-code", "cat-care", "神秘精华", None, None, "pending_manual_confirm", "L2_SK_OTHER"),
        ]
        for legacy_sub, legacy_pri, cname, shade, tex, exp_kind, exp_code in cases:
            mapped = db.migrate_legacy_category(legacy_sub, legacy_primary_id=legacy_pri, name=cname, shade=shade, texture=tex)
            self.assertEqual(mapped["mapping_type"], exp_kind)
            self.assertEqual(mapped["target_code"], exp_code)
            self._cat_id(mapped["target_code"])

    # 8. 货币与整数最小单位约束（CNY/JPY/KWD 及防混加）
    def test_08_currency_integer_minor_units_and_isolation(self) -> None:
        self.assertEqual(db.parse_decimal_to_minor("12.34", "CNY"), 1234)
        self.assertEqual(db.parse_decimal_to_minor("1200", "JPY"), 1200)
        self.assertEqual(db.parse_decimal_to_minor("12.345", "KWD"), 12345)
        with self.assertRaises(db.DomainRuleError):
            db.parse_decimal_to_minor("12.345", "CNY")
        with self.assertRaises(db.DomainRuleError):
            db.parse_decimal_to_minor("12.5", "JPY")
        with self.assertRaises(db.DomainRuleError):
            db.parse_decimal_to_minor("10.00", "XTS")

        self._seed_product("p-cur")
        with self.assertRaises(sqlite3.IntegrityError):
            self._seed_item("i-neg", "p-cur", price_minor=-10, currency="CNY")
        with self.assertRaises(sqlite3.IntegrityError):
            self._seed_item("i-bad-cur", "p-cur", price_minor=100, currency="XTS")

        self._seed_item("i-cny", "p-cur", status="finished", remaining=0, price_minor=1234, currency="CNY")
        self._seed_item("i-jpy", "p-cur", status="in_use", remaining=80, price_minor=1200, currency="JPY")
        self._seed_item("i-kwd", "p-cur", status="unopened", remaining=100, price_minor=12345, currency="KWD")
        summary = db.get_spend_summary_by_currency(self.conn)
        self.assertEqual(summary, {"CNY": 1234, "JPY": 1200, "KWD": 12345})

    # 9. 产品删除与子件删除作用域隔离
    def test_09_trash_scope_isolation(self) -> None:
        pid = self._seed_product("uuid-scope-prod", name="NARS 腮红")
        item_a = self._seed_item("uuid-scope-a", pid, status="in_use", remaining=50)
        item_b = self._seed_item("uuid-scope-b", pid, status="unopened", remaining=100)

        batch_a = db.soft_delete_product_item(self.conn, item_a, now_iso="2026-11-20T00:00:00Z", batch_id="batch-direct-a")
        batch_p = db.soft_delete_product(self.conn, pid, now_iso="2026-11-21T00:00:00Z", batch_id="batch-parent-p")

        row_a = self.conn.execute("SELECT trash_scope, deleted_by_parent_id, delete_batch_id FROM product_items WHERE id = ?;", (item_a,)).fetchone()
        row_b = self.conn.execute("SELECT trash_scope, deleted_by_parent_id, delete_batch_id FROM product_items WHERE id = ?;", (item_b,)).fetchone()
        self.assertEqual((row_a["trash_scope"], row_a["deleted_by_parent_id"], row_a["delete_batch_id"]), ("direct", None, batch_a))
        self.assertEqual((row_b["trash_scope"], row_b["deleted_by_parent_id"], row_b["delete_batch_id"]), ("cascade_with_product", pid, batch_p))

    # 10. 父级恢复不误恢复单独删除的子件 + 保持原 UUID + 不并款 + 孤儿恢复防护
    def test_10_parent_restore_isolation_uuid_no_merge_and_orphan_guard(self) -> None:
        pid = self._seed_product("uuid-orig-prod", name="NARS 腮红")
        self._seed_product("uuid-dup-prod", name="NARS 腮红")
        item_a = self._seed_item("uuid-item-a", pid, status="in_use", remaining=50)
        item_b = self._seed_item("uuid-item-b", pid, status="unopened", remaining=100)

        db.soft_delete_product_item(self.conn, item_a, now_iso="2026-11-20T00:00:00Z", batch_id="batch-direct-a")
        db.soft_delete_product(self.conn, pid, now_iso="2026-11-21T00:00:00Z", batch_id="batch-parent-p")

        with self.assertRaises(db.DomainRuleError):
            db.restore_product_item(self.conn, item_b, restore_trashed_parent=False)

        restored_cnt = db.restore_product(self.conn, pid, now_iso="2026-11-22T00:00:00Z")
        self.assertEqual(restored_cnt, 1)
        self.assertIsNotNone(self.conn.execute("SELECT deleted_at FROM product_items WHERE id = ?;", (item_a,)).fetchone()["deleted_at"])
        self.assertIsNone(self.conn.execute("SELECT deleted_at FROM product_items WHERE id = ?;", (item_b,)).fetchone()["deleted_at"])
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) FROM products WHERE name = 'NARS 腮红' AND deleted_at IS NULL;").fetchone()[0],
            2,
        )

        # 父彻删后单件必然一同被彻删，无法单独复生孤儿
        db.permanent_purge_product(self.conn, pid)
        with self.assertRaises(db.DomainRuleError):
            db.restore_product_item(self.conn, item_a)

    # 11. 删除后历史妆容快照仍然可读
    def test_11_look_snapshots_preserved_after_product_purge(self) -> None:
        brand_id = self._seed_brand("b-ct-11", "Charlotte Tilbury")
        pid = self._seed_product("p-snap-11", brand_id=brand_id, name="CT 枕边话", shade="Pillow Talk")
        iid = self._seed_item("i-snap-11", pid, status="in_use", remaining=75)
        self.conn.execute(
            "INSERT INTO looks (id, name, look_date, created_at, updated_at) VALUES ('look-snap-11', '约会粉棕妆', '2026-11-25', ?, ?);",
            (NOW, NOW),
        )
        self.conn.execute(
            """
            INSERT INTO look_product_items (
                id, look_id, product_item_id, step_order,
                product_name_snapshot, brand_name_snapshot, shade_snapshot, category_snapshot, spec_snapshot, created_at
            ) VALUES ('lpi-11', 'look-snap-11', ?, 1, 'CT 枕边话', 'Charlotte Tilbury', 'Pillow Talk', '彩妆/唇部/口红/唇膏', '3.5g', ?);
            """,
            (iid, NOW),
        )
        self.conn.execute(
            "INSERT INTO product_usage_logs (id, product_item_id, used_at, wear_count_delta, created_at, updated_at) VALUES ('log-11', ?, ?, 1, ?, ?);",
            (iid, NOW, NOW, NOW),
        )

        db.permanent_purge_product(self.conn, pid)
        snap = self.conn.execute("SELECT product_item_id, product_name_snapshot, brand_name_snapshot, shade_snapshot, spec_snapshot FROM look_product_items WHERE id = 'lpi-11';").fetchone()
        self.assertIsNone(snap["product_item_id"])
        self.assertEqual(snap["product_name_snapshot"], "CT 枕边话")
        self.assertEqual(snap["brand_name_snapshot"], "Charlotte Tilbury")
        self.assertEqual(snap["shade_snapshot"], "Pillow Talk")
        self.assertEqual(snap["spec_snapshot"], "3.5g")

    # 12. 图片多处引用时不会被提前清理，归零后才可物理清理
    def test_12_photo_multi_reference_protection_and_zero_ref_gc(self) -> None:
        pid = self._seed_product("p-img-12", name="共用主图产品")
        self.conn.execute(
            "INSERT INTO media_assets (id, relative_path, mime_type, byte_size, sha256, created_at, updated_at) VALUES ('shared-img', 'Media/shared.jpg', 'image/jpeg', 2048, ?, ?, ?);",
            ("b" * 64, NOW, NOW),
        )
        self.conn.execute(
            "INSERT INTO product_photos (id, product_id, asset_id, sort_order, is_cover, created_at) VALUES ('pp-s', ?, 'shared-img', 0, 1, ?);",
            (pid, NOW),
        )
        self.conn.execute(
            "INSERT INTO looks (id, name, look_date, cover_asset_id, created_at, updated_at) VALUES ('look-snap', '约会粉棕妆', '2026-11-25', 'shared-img', ?, ?);",
            (NOW, NOW),
        )
        self.conn.execute(
            "INSERT INTO look_photos (id, look_id, asset_id, photo_role, sort_order, created_at) VALUES ('lp-s', 'look-snap', 'shared-img', 'main', 0, ?);",
            (NOW,),
        )

        db.soft_delete_product(self.conn, pid, now_iso="2026-11-20T00:00:00Z", batch_id="b-exp")
        self.assertEqual(db.count_asset_references(self.conn, "shared-img"), 3)

        purge_res = db.purge_expired_trash(self.conn, "2026-11-27T00:00:01Z")
        self.assertEqual(purge_res["purged_products"], 1)
        self.assertEqual(purge_res["removed_media_paths"], [])
        self.assertEqual(db.count_asset_references(self.conn, "shared-img"), 2)
        self.assertIsNotNone(self.conn.execute("SELECT id FROM media_assets WHERE id = 'shared-img';").fetchone())

        removed = db.permanent_purge_look(self.conn, "look-snap")
        self.assertEqual(removed, ["Media/shared.jpg"])
        self.assertEqual(db.count_asset_references(self.conn, "shared-img"), 0)
        self.assertIsNone(self.conn.execute("SELECT id FROM media_assets WHERE id = 'shared-img';").fetchone())

    # 13. 事务失败回滚保护
    def test_13_migration_transaction_rollback_on_failure(self) -> None:
        self._seed_product("p-survive-13")
        broken_v2 = db.MigrationStep(
            version=2,
            migration_key="0002_broken_v2",
            description="故意失败测试回滚",
            sql_scripts=(
                "CREATE TABLE temp_should_rollback (id TEXT PRIMARY KEY);",
                "INSERT INTO non_existent_table VALUES (1);",
            ),
        )
        with self.assertRaises(db.MigrationError):
            db.apply_migrations(self.conn, [db.build_v1_migration(), broken_v2], applied_at=NOW)

        self.assertEqual(self.conn.execute("PRAGMA user_version;").fetchone()[0], 1)
        self.assertIsNone(
            self.conn.execute("SELECT name FROM sqlite_master WHERE name = 'temp_should_rollback';").fetchone()
        )
        self.assertIsNotNone(self.conn.execute("SELECT id FROM products WHERE id = 'p-survive-13';").fetchone())

    # 14. Migration 版本治理、平滑 V2 扩展与拒绝降级
    def test_14_migration_version_governance_and_v2_upgrade(self) -> None:
        self._seed_product("p-survive-14")
        valid_v2 = db.MigrationStep(
            version=2,
            migration_key="0002_add_brand_country_v2",
            description="测试将来 V2 平滑扩展不重建库",
            sql_scripts=("ALTER TABLE brands ADD COLUMN origin_country TEXT NULL;",),
        )
        applied_v2 = db.apply_migrations(self.conn, [db.build_v1_migration(), valid_v2], applied_at=NOW)
        self.assertEqual(applied_v2, [2])
        self.assertEqual(self.conn.execute("PRAGMA user_version;").fetchone()[0], 2)
        mig_rows = self.conn.execute("SELECT version, migration_key FROM schema_migrations ORDER BY version;").fetchall()
        self.assertEqual([r["version"] for r in mig_rows], [1, 2])
        self.assertIsNotNone(self.conn.execute("SELECT id FROM products WHERE id = 'p-survive-14';").fetchone())

        with self.assertRaises(db.MigrationError):
            db.apply_migrations(self.conn, [db.build_v1_migration()], applied_at=NOW)

    # 15. 美瞳专属资料触发器护栏、允许缺美瞳档案、外键 RESTRICT 删除及更严密 lens_power 校验
    def test_15_contact_lens_triggers_optional_profile_and_power_check(self) -> None:
        # 1) 非美瞳产品（口红 / 美瞳护理液 tool 组）禁止绑定 product_lens_profiles
        self._seed_product("p-lip", cat_code="L3_MK_LIP_STICK", name="MAC 子弹头")
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(
                "INSERT INTO product_lens_profiles (product_id, replacement_cycle_code, created_at, updated_at) VALUES ('p-lip', 'daily', ?, ?);",
                (NOW, NOW),
            )
        self._seed_product("p-care-sol", cat_code="L2_LN_CARE", name="傲滴护理液", shade=None)
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(
                "INSERT INTO product_lens_profiles (product_id, replacement_cycle_code, created_at, updated_at) VALUES ('p-care-sol', 'monthly', ?, ?);",
                (NOW, NOW),
            )

        # 2) 美瞳产品允许缺省不填 product_lens_profiles 也能正常建档与加盒（专业参数不强制）
        self._seed_product("p-lens-minimal", cat_code="L2_LN_COSMETIC", name="可啦啦简约款", shade=None)
        self._seed_item("box-min", "p-lens-minimal", status="unrecorded", remaining=None, lens_eye_side="unspecified", lens_power=None)
        prof_cnt = self.conn.execute("SELECT COUNT(*) FROM product_lens_profiles WHERE product_id = 'p-lens-minimal';").fetchone()[0]
        self.assertEqual(prof_cnt, 0)

        # 3) 已建美瞳专属资料后，禁止改成非美瞳分类，且直接 DELETE products 受 RESTRICT 拦截
        self.conn.execute(
            "INSERT INTO product_lens_profiles (product_id, replacement_cycle_code, created_at, updated_at) VALUES ('p-lens-minimal', 'monthly', ?, ?);",
            (NOW, NOW),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(
                "UPDATE products SET category_id = ? WHERE id = 'p-lens-minimal';",
                (self._cat_id("L3_MK_LIP_STICK"),),
            )
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute("DELETE FROM products WHERE id = 'p-lens-minimal';")

        # 经由安全彻删管线可连同档案与单盒干净拆除
        db.permanent_purge_product(self.conn, "p-lens-minimal")
        self.assertIsNone(self.conn.execute("SELECT product_id FROM product_lens_profiles WHERE product_id = 'p-lens-minimal';").fetchone())

        # 4) 更严密单一 lens_power 校验（拒绝空格、分号、竖线拼接双度数）
        self._seed_product("p-lens-pow", cat_code="L2_LN_COSMETIC", name="度数校验款", shade=None)
        for bad_pow in ("", "  ", "-2.50 -3.00", "-2.50;-3.00", "-2.50|-3.00", " -2.50"):
            with self.assertRaises(sqlite3.IntegrityError):
                self._seed_item(f"bad-pow-{hash(bad_pow)}", "p-lens-pow", lens_power=bad_pow)

    # 16. ProductItem idle 生命周期五类证据判定与真实落库验收
    def test_16_lifecycle_idle_evidence_cases_and_conflicts(self) -> None:
        self._seed_product("p-idle-suite")
        # 5 种边界情况直接落入数据库并验证迁移结果
        legacy_items = [
            # ① 明确有 opened_date -> in_use
            {"id": "idle-1-opened", "productId": "p-idle-suite", "status": "idle", "openedDate": "2026-10-01", "remainingPercent": 85},
            # ② 无 opened_date，但有明确 lastUsedAt -> in_use（且提示缺开封日期）
            {"id": "idle-2a-lastused", "productId": "p-idle-suite", "status": "idle", "openedDate": None, "lastUsedAt": "2026-11-10T10:00:00Z", "remainingPercent": 95},
            # ②b 无 opened_date，但有妆容/使用关联 -> in_use
            {"id": "idle-2b-linked", "productId": "p-idle-suite", "status": "idle", "openedDate": None, "remainingPercent": 90},
            # ③ 仅有 PAO=12，无开封日及使用痕迹 -> 不得擅自推断 in_use，迁至 unrecorded 待人工核对
            {"id": "idle-3a-pao-only", "productId": "p-idle-suite", "status": "idle", "openedDate": None, "paoMonths": 12, "remainingPercent": 100},
            # ③b 仅有 remainingPercent=95，无开封日/最近使用/关联 -> 证据不足，转 unrecorded 待核对
            {"id": "idle-3b-rem-only", "productId": "p-idle-suite", "status": "idle", "openedDate": None, "remainingPercent": 95},
            # ④ 多项证据互相矛盾：idle 同时带 finishedAt（或 opened < mfg / 未来开封） -> 转 unrecorded + conflict
            {"id": "idle-4a-conflict-fin", "productId": "p-idle-suite", "status": "idle", "openedDate": "2026-08-01", "finishedAt": "2026-10-01", "remainingPercent": 60},
            {"id": "idle-4b-conflict-mfg", "productId": "p-idle-suite", "status": "idle", "manufactureDate": "2026-10-01", "openedDate": "2026-09-01"},
            {"id": "idle-4c-conflict-zero", "productId": "p-idle-suite", "status": "idle", "openedDate": "2026-10-01", "remainingPercent": 0},
            # ⑤ 全无证据无法判断 -> unrecorded + pending_idle_review
            {"id": "idle-5-unknown", "productId": "p-idle-suite", "status": "idle", "openedDate": None, "remainingPercent": None},
        ]
        res = db.migrate_legacy_snapshot(
            self.conn,
            [],
            legacy_items,
            usage_or_look_item_ids={"idle-2b-linked"},
            now_iso=NOW,
        )
        self.assertEqual(res["inserted_items"], 9)

        rows = {
            r["id"]: r
            for r in self.conn.execute(
                "SELECT id, lifecycle_status, migration_legacy_status, migration_review_status, migration_audit_json FROM product_items WHERE product_id = 'p-idle-suite';"
            ).fetchall()
        }
        self.assertEqual(rows["idle-1-opened"]["lifecycle_status"], "in_use")
        self.assertIsNone(rows["idle-1-opened"]["migration_review_status"])
        self.assertEqual(rows["idle-2a-lastused"]["lifecycle_status"], "in_use")
        self.assertEqual(rows["idle-2b-linked"]["lifecycle_status"], "in_use")

        for pending_id in (
            "idle-3a-pao-only",
            "idle-3b-rem-only",
            "idle-4a-conflict-fin",
            "idle-4b-conflict-mfg",
            "idle-4c-conflict-zero",
            "idle-5-unknown",
        ):
            self.assertEqual(rows[pending_id]["lifecycle_status"], "unrecorded", pending_id)
            self.assertEqual(rows[pending_id]["migration_review_status"], "pending_idle_review", pending_id)
            self.assertEqual(rows[pending_id]["migration_legacy_status"], "idle", pending_id)
            self.assertIn("idle", rows[pending_id]["migration_audit_json"])

        self.assertIn("idle_with_finished_at", rows["idle-4a-conflict-fin"]["migration_audit_json"])
        self.assertIn("opened_before_manufacture", rows["idle-4b-conflict-mfg"]["migration_audit_json"])
        self.assertIn("idle_with_zero_remaining", rows["idle-4c-conflict-zero"]["migration_audit_json"])

    # 17. 五类历史分类真实落库迁移、幂等重跑与失败整批回滚
    def test_17_category_migration_persistence_idempotency_and_rollback(self) -> None:
        legacy_products = [
            {"id": "mig-p1", "primaryCategoryId": "cat-base", "subCategoryId": "sub-foundation", "name": "粉底液A"},
            {"id": "mig-p2", "primaryCategoryId": "cat-cheek", "subCategoryId": "sub-blush", "name": "液体腮红B", "texture": "液体"},
            {"id": "mig-p3", "primaryCategoryId": "cat-lip", "subCategoryId": "sub-lipbalm", "name": "变色唇膏C", "shade": "#001"},
            {"id": "mig-p4", "primaryCategoryId": "c1-cat-lip", "subCategoryId": "c1-sub-lipstick", "name": "口红D"},
            {"id": "mig-p5", "primaryCategoryId": "cat-care", "subCategoryId": "legacy-weird-sub", "name": "未知护肤E"},
        ]
        res1 = db.migrate_legacy_snapshot(self.conn, legacy_products, [], now_iso=NOW)
        self.assertEqual(res1, {"inserted_products": 5, "inserted_items": 0})

        # 确认原始分类追溯与待人工确认标记落库正确
        p5 = self.conn.execute(
            "SELECT c.code, p.migration_legacy_category_raw, p.migration_review_status FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = 'mig-p5';"
        ).fetchone()
        self.assertEqual(p5["code"], "L2_SK_OTHER")
        self.assertEqual(p5["migration_review_status"], "pending_category_review")
        self.assertIn("legacy-weird-sub", p5["migration_legacy_category_raw"])

        p2 = self.conn.execute(
            "SELECT c.code, p.migration_review_status FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = 'mig-p2';"
        ).fetchone()
        self.assertEqual(p2["code"], "L3_MK_BLUSH_CREAM")
        self.assertIsNone(p2["migration_review_status"])

        # 重复运行迁移必须幂等，不重复建档或污染
        res2 = db.migrate_legacy_snapshot(self.conn, legacy_products, [], now_iso=NOW)
        self.assertEqual(res2, {"inserted_products": 0, "inserted_items": 0})

        # 事务回滚测试：第二条单件非法（负金额）导致整批失败回滚，绝不跳过坏记录留半截数据
        bad_batch_prods = [{"id": "mig-p-bad-batch", "primaryCategoryId": "cat-base", "subCategoryId": "sub-cushion", "name": "回滚测试气垫"}]
        bad_batch_items = [
            {"id": "mig-i-ok", "productId": "mig-p-bad-batch", "status": "unopened", "purchasePriceMinor": 100},
            {"id": "mig-i-fail", "productId": "mig-p-bad-batch", "status": "unopened", "purchasePriceMinor": -50},
        ]
        with self.assertRaises(sqlite3.IntegrityError):
            db.migrate_legacy_snapshot(self.conn, bad_batch_prods, bad_batch_items, now_iso=NOW)
        self.assertIsNone(self.conn.execute("SELECT id FROM products WHERE id = 'mig-p-bad-batch';").fetchone())
        self.assertIsNone(self.conn.execute("SELECT id FROM product_items WHERE id = 'mig-i-ok';").fetchone())

    # 18. 金额 Float 拒绝、缺币种拒绝、最小单位往返与 INT64 溢出防护
    def test_18_currency_float_missing_roundtrip_and_overflow_guard(self) -> None:
        # 拒绝直接传 Python float 或 bool
        with self.assertRaises(db.DomainRuleError):
            db.parse_decimal_to_minor(12.34, "CNY")  # type: ignore[arg-type]
        with self.assertRaises(db.DomainRuleError):
            db.parse_decimal_to_minor("10.00", "")
        with self.assertRaises(db.DomainRuleError):
            db.parse_decimal_to_minor("10.00", None)  # type: ignore[arg-type]

        # 准确转换与无损往返验证
        for raw, cur, expected_minor in (
            ("0.00", "CNY", 0),
            ("320.50", "CNY", 32050),
            ("19800", "JPY", 19800),
            ("12.345", "KWD", 12345),
            ("9999999999999.99", "CNY", 999999999999999),
        ):
            m = db.parse_decimal_to_minor(raw, cur)
            self.assertEqual(m, expected_minor)
            self.assertEqual(db.format_minor_to_decimal(m, cur), raw)

        # 超出安全 15 位上限拦截
        with self.assertRaises(db.DomainRuleError):
            db.parse_decimal_to_minor("10000000000000.00", "CNY")

        # 数据库层面拒绝 NULL / 空币种
        self._seed_product("p-cur-edge")
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(
                "INSERT INTO product_items (id, product_id, purchase_price_minor, currency_code, created_at, updated_at) VALUES ('i-null-cur', 'p-cur-edge', 100, NULL, ?, ?);",
                (NOW, NOW),
            )
        with self.assertRaises(sqlite3.IntegrityError):
            self._seed_item("i-empty-cur", "p-cur-edge", price_minor=100, currency="")

        # 测试极端大值汇总在受限 15 位下严格保持精确 int；若库内强写入两笔接近 INT64_MAX 值触发 SQLite SUM 转 float 溢出则应显式拦截
        self._seed_item("i-big-1", "p-cur-edge", price_minor=9_000_000_000_000_000_000, currency="USD")
        self._seed_item("i-big-2", "p-cur-edge", price_minor=9_000_000_000_000_000_000, currency="USD")
        with self.assertRaises(db.DomainRuleError):
            db.get_spend_summary_by_currency(self.conn)

    # 19. 图片待清理任务生成、物理删除失败可重试与事务回滚保护
    def test_19_media_cleanup_queue_retry_and_tx_rollback(self) -> None:
        pid = self._seed_product("p-gc-queue")
        self.conn.execute(
            "INSERT INTO media_assets (id, relative_path, thumbnail_path, mime_type, byte_size, sha256, created_at, updated_at) VALUES ('a-gc', 'Media/gc.jpg', 'Thumbs/gc.jpg', 'image/jpeg', 500, ?, ?, ?);",
            ("c" * 64, NOW, NOW),
        )
        self.conn.execute(
            "INSERT INTO product_photos (id, product_id, asset_id, sort_order, is_cover, created_at) VALUES ('pp-gc', ?, 'a-gc', 0, 1, ?);",
            (pid, NOW),
        )

        # 1) 彻删事务在提交前失败回滚：产品、媒体元数据、清理任务列表都不得变化
        with self.assertRaises(RuntimeError):
            db.permanent_purge_product(self.conn, pid, fail_before_commit_for_test=True)
        self.assertIsNotNone(self.conn.execute("SELECT id FROM products WHERE id = ?;", (pid,)).fetchone())
        self.assertIsNotNone(self.conn.execute("SELECT id FROM media_assets WHERE id = 'a-gc';").fetchone())
        self.assertEqual(db.get_pending_media_cleanup_tasks(self.conn), [])

        # 2) 成功彻底删除 -> 引用归零 -> 自动入队待清理任务
        removed = db.permanent_purge_product(self.conn, pid)
        self.assertEqual(removed, ["Media/gc.jpg"])
        tasks = db.get_pending_media_cleanup_tasks(self.conn)
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0]["relative_path"], "Media/gc.jpg")
        self.assertEqual(tasks[0]["status"], "pending")

        # 3) 首次模拟磁盘清理失败（如文件系统临时锁定），任务保留、retry_count=1 且记录错误
        def fail_once(rel_path: str, thumb: str | None) -> None:
            raise OSError("simulated disk permission locked")

        r1 = db.execute_pending_media_cleanups(self.conn, fail_once, now_iso=NOW)
        self.assertEqual(r1, {"deleted": 0, "failed": 1, "remaining": 1})
        tasks_after_fail = db.get_pending_media_cleanup_tasks(self.conn)
        self.assertEqual(tasks_after_fail[0]["status"], "failed")
        self.assertEqual(tasks_after_fail[0]["retry_count"], 1)
        self.assertIn("simulated disk", tasks_after_fail[0]["last_error"])

        # 4) 重试清理成功 -> 任务移出队列
        deleted_calls: list[tuple[str, str | None]] = []
        r2 = db.execute_pending_media_cleanups(
            self.conn, lambda rp, tp: deleted_calls.append((rp, tp)), now_iso=NOW
        )
        self.assertEqual(r2, {"deleted": 1, "failed": 0, "remaining": 0})
        self.assertEqual(deleted_calls, [("Media/gc.jpg", "Thumbs/gc.jpg")])
        self.assertEqual(db.get_pending_media_cleanup_tasks(self.conn), [])

    # 20. Migration 校验和篡改检测
    def test_20_migration_checksum_mismatch_detection(self) -> None:
        tampered_v1 = db.MigrationStep(
            version=1,
            migration_key="0001_initial_schema_v1_and_taxonomy_seeds",
            description="tampered",
            sql_scripts=("-- altered DDL",),
        )
        with self.assertRaises(db.MigrationError):
            db.apply_migrations(self.conn, [tampered_v1], applied_at=NOW)


if __name__ == "__main__":
    unittest.main(verbosity=2)
