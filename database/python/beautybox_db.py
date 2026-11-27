"""
妆匣 BeautyBox · SQLite Schema V1 连接治理、事务化 Migration 与核心持久层验证模块
基线依据：BeautyBox V3.1-Frozen（ADR-0001 / ADR-0002 / SQLite 前置清单）
注意：本模块用于在无 Mac/Xcode 环境下于 Linux 使用真实 sqlite3 执行 DDL、Migration 与边界验证。
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import pathlib
import sqlite3
import uuid
from dataclasses import dataclass
from typing import Callable, Iterable, Optional

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
SCHEMA_V1_PATH = REPO_ROOT / "database" / "migrations" / "0001_schema_v1.sql"
SEEDS_V1_PATH = REPO_ROOT / "database" / "seeds" / "0001_categories_v1.sql"

CURRENT_SCHEMA_VERSION = 1
MAX_MINOR_DIGITS = 15
MAX_MINOR_VALUE = (10**MAX_MINOR_DIGITS) - 1
PENDING_MEDIA_CLEANUP_KEY = "pending_media_cleanup_queue"

# 与 prototype/js/currency.js 完全对齐的集中式离线 ISO 4217 精度字典（禁用 Float）
CURRENCY_EXPONENTS: dict[str, int] = {
    "CNY": 2,
    "HKD": 2,
    "USD": 2,
    "GBP": 2,
    "JPY": 0,
    "KRW": 0,
    "EUR": 2,
    "TWD": 2,
    "SGD": 2,
    "AUD": 2,
    "CAD": 2,
    "THB": 2,
    "CHF": 2,
    "KWD": 3,
    "BHD": 3,
    "OMR": 3,
}


class MigrationError(RuntimeError):
    """数据库迁移失败或版本不兼容异常。"""


class DomainRuleError(ValueError):
    """违反 V3.1 业务规则异常（如孤儿恢复拦截、币种不支持等）。"""


@dataclass(frozen=True)
class MigrationStep:
    version: int
    migration_key: str
    description: str
    sql_scripts: tuple[str, ...] = ()
    post_hook: Optional[Callable[[sqlite3.Connection], None]] = None

    @property
    def checksum_sha256(self) -> str:
        joined = "\n--STEP--\n".join(self.sql_scripts)
        return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def _utc_now_iso(now: Optional[dt.datetime] = None) -> str:
    current = now or dt.datetime.now(dt.timezone.utc)
    return current.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _plus_days_iso(base_iso: str, days: int) -> str:
    parsed = dt.datetime.strptime(base_iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)
    return (parsed + dt.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect_sqlite(db_path: str | pathlib.Path) -> sqlite3.Connection:
    """
    创建标准 SQLite 连接：
    - 强制在任何事务前启用 PRAGMA foreign_keys = ON
    - 使用 isolation_level = None 显式控制事务边界
    """
    conn = sqlite3.connect(str(db_path), isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    fk_enabled = conn.execute("PRAGMA foreign_keys;").fetchone()[0]
    if fk_enabled != 1:
        conn.close()
        raise MigrationError("SQLite 外键约束未能成功启用（PRAGMA foreign_keys != 1）")
    return conn


def build_v1_migration() -> MigrationStep:
    ddl_sql = SCHEMA_V1_PATH.read_text(encoding="utf-8")
    seed_sql = SEEDS_V1_PATH.read_text(encoding="utf-8")
    return MigrationStep(
        version=1,
        migration_key="0001_initial_schema_v1_and_taxonomy_seeds",
        description="初始化 BeautyBox V3.1 Schema V1（22 张表、外键/CHECK/索引）与 147 节点三维分类种子",
        sql_scripts=(ddl_sql, seed_sql),
    )


def _exec_script_statements(conn: sqlite3.Connection, sql_text: str) -> None:
    """
    逐条执行 SQL 脚本而非 sqlite3.executescript（executescript 会隐式提交并脱离显式事务）。
    逐句执行可确保 DDL + Seed 全部在当前显式事务内原子生效或失败整体回滚。
    """
    buf = []
    for line in sql_text.splitlines(keepends=True):
        stripped = line.strip()
        if stripped.startswith("--") or not stripped:
            continue
        buf.append(line)
        candidate = "".join(buf)
        if sqlite3.complete_statement(candidate):
            stmt = candidate.strip()
            if stmt:
                conn.execute(stmt)
            buf = []
    leftover = "".join(buf).strip()
    if leftover:
        conn.execute(leftover)


def apply_migrations(
    conn: sqlite3.Connection,
    steps: Optional[Iterable[MigrationStep]] = None,
    *,
    applied_at: Optional[str] = None,
) -> list[int]:
    """
    在显式事务中顺序执行所有尚未应用的 MigrationStep：
    - 严格校验 PRAGMA user_version 不允许降级
    - 每个版本在 BEGIN IMMEDIATE ... COMMIT 内执行，任何异常立即 ROLLBACK
    - 同步更新 schema_migrations 与 PRAGMA user_version
    """
    ordered_steps = sorted(steps if steps is not None else [build_v1_migration()], key=lambda s: s.version)
    if not ordered_steps:
        return []

    max_supported = ordered_steps[-1].version
    current_version = conn.execute("PRAGMA user_version;").fetchone()[0]
    if current_version > max_supported:
        raise MigrationError(
            f"禁止数据库降级：当前库版本 v{current_version} 高于应用支持上限 v{max_supported}"
        )

    applied_versions: list[int] = []
    ts = applied_at or _utc_now_iso()

    for step in ordered_steps:
        if step.version <= current_version:
            existing = conn.execute(
                "SELECT checksum_sha256 FROM schema_migrations WHERE version = ?;",
                (step.version,),
            ).fetchone()
            if existing is not None and existing["checksum_sha256"] != step.checksum_sha256:
                raise MigrationError(
                    f"Migration v{step.version} ({step.migration_key}) 校验和不匹配，历史迁移脚本疑似被篡改"
                )
            continue
        if step.version != current_version + 1:
            raise MigrationError(f"迁移版本号不连续：期望 v{current_version + 1}，实际为 v{step.version}")

        conn.execute("BEGIN IMMEDIATE;")
        try:
            for script in step.sql_scripts:
                _exec_script_statements(conn, script)
            if step.post_hook is not None:
                step.post_hook(conn)
            conn.execute(
                """
                INSERT INTO schema_migrations (version, migration_key, description, checksum_sha256, applied_at)
                VALUES (?, ?, ?, ?, ?);
                """,
                (step.version, step.migration_key, step.description, step.checksum_sha256, ts),
            )
            conn.execute(f"PRAGMA user_version = {int(step.version)};")
            conn.execute("COMMIT;")
        except Exception as exc:
            conn.execute("ROLLBACK;")
            raise MigrationError(f"Migration v{step.version} ({step.migration_key}) 执行失败并已回滚: {exc}") from exc

        current_version = step.version
        applied_versions.append(step.version)

    return applied_versions


# -----------------------------------------------------------------------------
# 金额精确解析/聚合辅助（严禁 Float）
# -----------------------------------------------------------------------------
def parse_decimal_to_minor(raw_amount: str, currency_code: str) -> int:
    """将十进制字符串严格转为整数最小货币单位，拒绝 Float、未知币种、超精度小数或超限整数。"""
    if not isinstance(raw_amount, str):
        raise DomainRuleError(f"金额必须为十进制字符串，禁止传入 {type(raw_amount).__name__}")
    if not isinstance(currency_code, str) or not currency_code.strip():
        raise DomainRuleError("币种代码不能为空")
    code = currency_code.strip()
    if code not in CURRENCY_EXPONENTS:
        raise DomainRuleError(f"该币种暂不支持: {code}")
    exponent = CURRENCY_EXPONENTS[code]
    cleaned = raw_amount.strip()
    if not cleaned or cleaned.startswith("-"):
        raise DomainRuleError(f"非法金额格式: {raw_amount}")
    parts = cleaned.split(".")
    if len(parts) > 2 or not parts[0].isdigit():
        raise DomainRuleError(f"非法金额格式: {raw_amount}")
    whole = parts[0]
    frac = parts[1] if len(parts) == 2 else ""
    if frac and not frac.isdigit():
        raise DomainRuleError(f"非法小数部分: {raw_amount}")
    if len(frac) > exponent:
        raise DomainRuleError(f"{code} 最多允许 {exponent} 位小数，拒绝静默截断: {raw_amount}")
    padded_frac = frac.ljust(exponent, "0")
    minor = int(whole) * (10**exponent) + (int(padded_frac) if padded_frac else 0)
    if minor > MAX_MINOR_VALUE:
        raise DomainRuleError(f"金额超出安全整数上限（最多 {MAX_MINOR_DIGITS} 位最小单位）: {raw_amount}")
    return minor


def format_minor_to_decimal(minor: int, currency_code: str) -> str:
    """将最小货币单位整数精确格式化为十进制字符串（纯整数运算，严禁 Float）。"""
    if isinstance(minor, bool) or not isinstance(minor, int) or minor < 0:
        raise DomainRuleError(f"非法最小货币单位整数: {minor}")
    if currency_code not in CURRENCY_EXPONENTS:
        raise DomainRuleError(f"该币种暂不支持: {currency_code}")
    exp = CURRENCY_EXPONENTS[currency_code]
    if exp == 0:
        return str(minor)
    scale = 10**exp
    whole, rem = divmod(minor, scale)
    return f"{whole}.{str(rem).zfill(exp)}"


def get_spend_summary_by_currency(conn: sqlite3.Connection) -> dict[str, int]:
    """按币种分组统计所有已记录价格的有效消费（含已用完历史，严格不跨币种相加）。"""
    try:
        rows = conn.execute(
            """
            SELECT currency_code, SUM(purchase_price_minor) AS total_minor
            FROM product_items
            WHERE deleted_at IS NULL
              AND purchase_price_minor IS NOT NULL
            GROUP BY currency_code
            ORDER BY currency_code;
            """
        ).fetchall()
    except sqlite3.OperationalError as exc:
        if "overflow" in str(exc).lower():
            raise DomainRuleError(f"单币种消费汇总超出 SQLite 64 位整数安全上限: {exc}") from exc
        raise
    result: dict[str, int] = {}
    for row in rows:
        total = row["total_minor"]
        if isinstance(total, float):
            raise DomainRuleError(f"汇总结果溢出为浮点型（{row['currency_code']}），已拦截")
        result[row["currency_code"]] = int(total)
    return result


# -----------------------------------------------------------------------------
# 7 天回收站、父子隔离恢复、安全彻删与四表引用归零清理（UD-03）
# -----------------------------------------------------------------------------
def soft_delete_product_item(
    conn: sqlite3.Connection, item_id: str, *, now_iso: Optional[str] = None, batch_id: Optional[str] = None
) -> str:
    now = now_iso or _utc_now_iso()
    exp = _plus_days_iso(now, 7)
    bid = batch_id or f"batch-{uuid.uuid4()}"
    conn.execute("BEGIN IMMEDIATE;")
    try:
        cur = conn.execute(
            """
            UPDATE product_items
            SET deleted_at = ?, trash_expires_at = ?, trash_scope = 'direct',
                deleted_by_parent_id = NULL, delete_batch_id = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL;
            """,
            (now, exp, bid, now, item_id),
        )
        if cur.rowcount != 1:
            raise DomainRuleError(f"实物不存在或已在回收站中: {item_id}")
        conn.execute("COMMIT;")
        return bid
    except Exception:
        conn.execute("ROLLBACK;")
        raise


def soft_delete_product(
    conn: sqlite3.Connection, product_id: str, *, now_iso: Optional[str] = None, batch_id: Optional[str] = None
) -> str:
    now = now_iso or _utc_now_iso()
    exp = _plus_days_iso(now, 7)
    bid = batch_id or f"batch-{uuid.uuid4()}"
    conn.execute("BEGIN IMMEDIATE;")
    try:
        cur = conn.execute(
            """
            UPDATE products
            SET deleted_at = ?, trash_expires_at = ?, trash_scope = 'direct',
                delete_batch_id = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL;
            """,
            (now, exp, bid, now, product_id),
        )
        if cur.rowcount != 1:
            raise DomainRuleError(f"产品不存在或已在回收站中: {product_id}")
        # 只连带隐藏“当时尚未在回收站”的活跃子级；更早单删的实物保留其原有 direct 批次！
        conn.execute(
            """
            UPDATE product_items
            SET deleted_at = ?, trash_expires_at = ?, trash_scope = 'cascade_with_product',
                deleted_by_parent_id = ?, delete_batch_id = ?, updated_at = ?
            WHERE product_id = ? AND deleted_at IS NULL;
            """,
            (now, exp, product_id, bid, now, product_id),
        )
        conn.execute("COMMIT;")
        return bid
    except Exception:
        conn.execute("ROLLBACK;")
        raise


def soft_delete_look(
    conn: sqlite3.Connection, look_id: str, *, now_iso: Optional[str] = None, batch_id: Optional[str] = None
) -> str:
    now = now_iso or _utc_now_iso()
    exp = _plus_days_iso(now, 7)
    bid = batch_id or f"batch-{uuid.uuid4()}"
    conn.execute("BEGIN IMMEDIATE;")
    try:
        cur = conn.execute(
            """
            UPDATE looks
            SET deleted_at = ?, trash_expires_at = ?, trash_scope = 'direct',
                delete_batch_id = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL;
            """,
            (now, exp, bid, now, look_id),
        )
        if cur.rowcount != 1:
            raise DomainRuleError(f"妆容不存在或已在回收站中: {look_id}")
        conn.execute("COMMIT;")
        return bid
    except Exception:
        conn.execute("ROLLBACK;")
        raise


def restore_product(conn: sqlite3.Connection, product_id: str, *, now_iso: Optional[str] = None) -> int:
    """恢复产品主档，严格只恢复同批次 cascade_with_product 子件，不误复活更早单独删掉的子件。"""
    now = now_iso or _utc_now_iso()
    conn.execute("BEGIN IMMEDIATE;")
    try:
        row = conn.execute(
            "SELECT delete_batch_id FROM products WHERE id = ? AND deleted_at IS NOT NULL;",
            (product_id,),
        ).fetchone()
        if row is None:
            raise DomainRuleError(f"产品不在回收站中，无法恢复: {product_id}")
        batch_id = row["delete_batch_id"]
        conn.execute(
            """
            UPDATE products
            SET deleted_at = NULL, trash_expires_at = NULL, trash_scope = NULL,
                delete_batch_id = NULL, updated_at = ?
            WHERE id = ?;
            """,
            (now, product_id),
        )
        restored_children = conn.execute(
            """
            UPDATE product_items
            SET deleted_at = NULL, trash_expires_at = NULL, trash_scope = NULL,
                deleted_by_parent_id = NULL, delete_batch_id = NULL, updated_at = ?
            WHERE product_id = ?
              AND trash_scope = 'cascade_with_product'
              AND deleted_by_parent_id = ?
              AND delete_batch_id = ?;
            """,
            (now, product_id, product_id, batch_id),
        ).rowcount
        conn.execute("COMMIT;")
        return restored_children
    except Exception:
        conn.execute("ROLLBACK;")
        raise


def restore_product_item(
    conn: sqlite3.Connection,
    item_id: str,
    *,
    restore_trashed_parent: bool = False,
    now_iso: Optional[str] = None,
) -> None:
    """恢复单件实物：禁止父主档永久消失时产生孤儿；若父主档尚在回收站则受控处理。"""
    now = now_iso or _utc_now_iso()
    conn.execute("BEGIN IMMEDIATE;")
    try:
        row = conn.execute(
            """
            SELECT pi.product_id, p.deleted_at AS parent_deleted_at
            FROM product_items pi
            LEFT JOIN products p ON p.id = pi.product_id
            WHERE pi.id = ? AND pi.deleted_at IS NOT NULL;
            """,
            (item_id,),
        ).fetchone()
        if row is None:
            raise DomainRuleError(f"实物不在回收站中: {item_id}")
        parent_deleted = row["parent_deleted_at"] is not None
        if parent_deleted:
            if not restore_trashed_parent:
                raise DomainRuleError("所属产品当前也在回收站中，请确认连同恢复父产品后再恢复本件实物")
            # 仅恢复父主档，绝不自动恢复同父下其他已删子件
            conn.execute(
                """
                UPDATE products
                SET deleted_at = NULL, trash_expires_at = NULL, trash_scope = NULL,
                    delete_batch_id = NULL, updated_at = ?
                WHERE id = ?;
                """,
                (now, row["product_id"]),
            )
        conn.execute(
            """
            UPDATE product_items
            SET deleted_at = NULL, trash_expires_at = NULL, trash_scope = NULL,
                deleted_by_parent_id = NULL, delete_batch_id = NULL, updated_at = ?
            WHERE id = ?;
            """,
            (now, item_id),
        )
        conn.execute("COMMIT;")
    except Exception:
        conn.execute("ROLLBACK;")
        raise


def count_asset_references(conn: sqlite3.Connection, asset_id: str) -> int:
    """统计某媒体资源在全库 5 个有效引用位置的总引用数（含回收站未到期记录）。"""
    row = conn.execute(
        """
        SELECT
            (SELECT COUNT(*) FROM product_photos WHERE asset_id = ?) +
            (SELECT COUNT(*) FROM look_photos WHERE asset_id = ?) +
            (SELECT COUNT(*) FROM wear_reviews WHERE asset_id = ?) +
            (SELECT COUNT(*) FROM skin_diary_photos WHERE asset_id = ?) +
            (SELECT COUNT(*) FROM looks WHERE cover_asset_id = ?) AS total_refs;
        """,
        (asset_id, asset_id, asset_id, asset_id, asset_id),
    ).fetchone()
    return int(row["total_refs"])


def _load_cleanup_queue(conn: sqlite3.Connection) -> list[dict]:
    row = conn.execute(
        "SELECT value_json FROM app_settings WHERE key = ?;",
        (PENDING_MEDIA_CLEANUP_KEY,),
    ).fetchone()
    if row is None:
        return []
    data = json.loads(row["value_json"])
    return data if isinstance(data, list) else []


def _save_cleanup_queue(conn: sqlite3.Connection, queue: list[dict], now_iso: str) -> None:
    conn.execute(
        """
        INSERT INTO app_settings (key, value_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at;
        """,
        (PENDING_MEDIA_CLEANUP_KEY, json.dumps(queue, ensure_ascii=False), now_iso),
    )


def get_pending_media_cleanup_tasks(conn: sqlite3.Connection) -> list[dict]:
    """读取当前待执行/失败待重试的沙盒文件清理任务。"""
    return _load_cleanup_queue(conn)


def _cleanup_unreferenced_assets(
    conn: sqlite3.Connection, candidate_asset_ids: set[str], *, now_iso: Optional[str] = None
) -> list[str]:
    """
    在同一数据库事务内执行：
    仅当某媒体资产在全库 5 处引用总计归零后才删除 media_assets 行，
    并将待删文件路径原子写入 app_settings['pending_media_cleanup_queue'] 供后续 MediaStore 重试清理。
    """
    now = now_iso or _utc_now_iso()
    removed_paths: list[str] = []
    queue = _load_cleanup_queue(conn)
    queued_ids = {t.get("asset_id") for t in queue}

    for asset_id in sorted(candidate_asset_ids):
        if not asset_id:
            continue
        if count_asset_references(conn, asset_id) == 0:
            row = conn.execute(
                "SELECT relative_path, thumbnail_path FROM media_assets WHERE id = ?;", (asset_id,)
            ).fetchone()
            if row is not None:
                removed_paths.append(row["relative_path"])
                conn.execute("DELETE FROM media_assets WHERE id = ?;", (asset_id,))
                if asset_id not in queued_ids:
                    queue.append(
                        {
                            "asset_id": asset_id,
                            "relative_path": row["relative_path"],
                            "thumbnail_path": row["thumbnail_path"],
                            "status": "pending",
                            "retry_count": 0,
                            "last_error": None,
                            "enqueued_at": now,
                        }
                    )
                    queued_ids.add(asset_id)

    if removed_paths:
        _save_cleanup_queue(conn, queue, now)
    return removed_paths


def execute_pending_media_cleanups(
    conn: sqlite3.Connection,
    delete_file_fn: Callable[[str, Optional[str]], None],
    *,
    now_iso: Optional[str] = None,
) -> dict[str, int]:
    """
    在数据库事务已提交后执行待清理文件队列（由调用方传入真实或模拟文件删除器）：
    - 删除成功则从队列移除
    - 删除失败保留任务并递增 retry_count 与 last_error，支持后续重试
    """
    now = now_iso or _utc_now_iso()
    queue = _load_cleanup_queue(conn)
    if not queue:
        return {"deleted": 0, "failed": 0, "remaining": 0}

    remaining: list[dict] = []
    deleted_cnt = 0
    failed_cnt = 0
    for task in queue:
        try:
            delete_file_fn(task["relative_path"], task.get("thumbnail_path"))
            deleted_cnt += 1
        except Exception as exc:
            failed_cnt += 1
            remaining.append(
                {
                    **task,
                    "status": "failed",
                    "retry_count": int(task.get("retry_count", 0)) + 1,
                    "last_error": str(exc),
                }
            )

    conn.execute("BEGIN IMMEDIATE;")
    try:
        _save_cleanup_queue(conn, remaining, now)
        conn.execute("COMMIT;")
    except Exception:
        conn.execute("ROLLBACK;")
        raise
    return {"deleted": deleted_cnt, "failed": failed_cnt, "remaining": len(remaining)}


def permanent_purge_product_item(conn: sqlite3.Connection, item_id: str) -> None:
    """在单事务内按拓扑安全序彻底删除单件实物，保留 look_product_items 快照（外键置空）。"""
    conn.execute("BEGIN IMMEDIATE;")
    try:
        conn.execute("DELETE FROM product_usage_logs WHERE product_item_id = ?;", (item_id,))
        conn.execute("DELETE FROM product_items WHERE id = ?;", (item_id,))
        conn.execute("COMMIT;")
    except Exception:
        conn.execute("ROLLBACK;")
        raise


def permanent_purge_product(
    conn: sqlite3.Connection,
    product_id: str,
    *,
    fail_before_commit_for_test: bool = False,
) -> list[str]:
    """
    在单一原子事务内彻底删除整款产品、子件并同步完成无引用 media_assets 清理与清理任务入队：
    - 若事务中发生任意失败回滚，products、media_assets 及待删文件队列均保持原状，绝不误删图片。
    """
    candidate_assets: set[str] = set()
    conn.execute("BEGIN IMMEDIATE;")
    try:
        asset_rows = conn.execute(
            "SELECT asset_id FROM product_photos WHERE product_id = ?;", (product_id,)
        ).fetchall()
        candidate_assets.update(r["asset_id"] for r in asset_rows)

        item_rows = conn.execute(
            "SELECT id FROM product_items WHERE product_id = ?;", (product_id,)
        ).fetchall()
        for r in item_rows:
            conn.execute("DELETE FROM product_usage_logs WHERE product_item_id = ?;", (r["id"],))
        conn.execute("DELETE FROM product_items WHERE product_id = ?;", (product_id,))
        conn.execute("DELETE FROM product_photos WHERE product_id = ?;", (product_id,))
        conn.execute("DELETE FROM product_lens_profiles WHERE product_id = ?;", (product_id,))
        conn.execute("DELETE FROM products WHERE id = ?;", (product_id,))

        removed = _cleanup_unreferenced_assets(conn, candidate_assets)
        if fail_before_commit_for_test:
            raise RuntimeError("模拟彻底删除提交前异常")
        conn.execute("COMMIT;")
        return removed
    except Exception:
        conn.execute("ROLLBACK;")
        raise


def permanent_purge_look(conn: sqlite3.Connection, look_id: str) -> list[str]:
    """在单一原子事务内彻底删除妆容记录，并按引用计数清理无用媒体及入队清理任务。"""
    candidate_assets: set[str] = set()
    conn.execute("BEGIN IMMEDIATE;")
    try:
        look_row = conn.execute("SELECT cover_asset_id FROM looks WHERE id = ?;", (look_id,)).fetchone()
        if look_row and look_row["cover_asset_id"]:
            candidate_assets.add(look_row["cover_asset_id"])
        for r in conn.execute("SELECT asset_id FROM look_photos WHERE look_id = ?;", (look_id,)).fetchall():
            candidate_assets.add(r["asset_id"])
        for r in conn.execute("SELECT asset_id FROM wear_reviews WHERE look_id = ?;", (look_id,)).fetchall():
            if r["asset_id"]:
                candidate_assets.add(r["asset_id"])

        conn.execute("DELETE FROM wear_reviews WHERE look_id = ?;", (look_id,))
        conn.execute("DELETE FROM look_photos WHERE look_id = ?;", (look_id,))
        conn.execute("DELETE FROM look_product_items WHERE look_id = ?;", (look_id,))
        conn.execute("DELETE FROM looks WHERE id = ?;", (look_id,))

        removed = _cleanup_unreferenced_assets(conn, candidate_assets)
        conn.execute("COMMIT;")
        return removed
    except Exception:
        conn.execute("ROLLBACK;")
        raise


def purge_expired_trash(conn: sqlite3.Connection, now_iso: str) -> dict[str, int | list[str]]:
    """清理全部到期（trash_expires_at <= now_iso）的回收站记录。"""
    purged_products = 0
    purged_items = 0
    purged_looks = 0
    removed_paths: list[str] = []

    exp_products = [
        r["id"]
        for r in conn.execute(
            "SELECT id FROM products WHERE deleted_at IS NOT NULL AND trash_expires_at <= ?;",
            (now_iso,),
        ).fetchall()
    ]
    for pid in exp_products:
        removed_paths.extend(permanent_purge_product(conn, pid))
        purged_products += 1

    exp_items = [
        r["id"]
        for r in conn.execute(
            "SELECT id FROM product_items WHERE deleted_at IS NOT NULL AND trash_expires_at <= ?;",
            (now_iso,),
        ).fetchall()
    ]
    for iid in exp_items:
        permanent_purge_product_item(conn, iid)
        purged_items += 1

    exp_looks = [
        r["id"]
        for r in conn.execute(
            "SELECT id FROM looks WHERE deleted_at IS NOT NULL AND trash_expires_at <= ?;",
            (now_iso,),
        ).fetchall()
    ]
    for lid in exp_looks:
        removed_paths.extend(permanent_purge_look(conn, lid))
        purged_looks += 1

    return {
        "purged_products": purged_products,
        "purged_items": purged_items,
        "purged_looks": purged_looks,
        "removed_media_paths": removed_paths,
    }


# -----------------------------------------------------------------------------
# V3.1 历史兼容迁移规则（分类五类映射 & idle 三分支分流）
# -----------------------------------------------------------------------------
LEGACY_ONE_TO_ONE_OR_MERGED: dict[str, tuple[str, str]] = {
    "sub-foundation": ("L3_MK_BASE_FOUNDATION", "one_to_one"),
    "c1-sub-foundation": ("L3_MK_BASE_FOUNDATION", "merged"),
    "sub-cream-found": ("L3_MK_BASE_CREAM", "merged"),
    "c1-sub-cream-found": ("L3_MK_BASE_CREAM", "merged"),
    "sub-cushion": ("L3_MK_BASE_CUSHION", "one_to_one"),
    "c1-sub-cushion": ("L3_MK_BASE_CUSHION", "merged"),
    "sub-primer": ("L3_MK_BASE_PRIMER", "one_to_one"),
    "c1-sub-primer": ("L3_MK_BASE_PRIMER", "merged"),
    "sub-sunbase": ("L3_MK_BASE_SUNBASE", "one_to_one"),
    "c1-sub-sunbase": ("L3_MK_BASE_SUNBASE", "merged"),
    "sub-loose-powder": ("L3_MK_SETTING_LOOSE", "one_to_one"),
    "c1-sub-loose-powder": ("L3_MK_SETTING_LOOSE", "merged"),
    "sub-pressed-powder": ("L3_MK_SETTING_PRESSED", "one_to_one"),
    "c1-sub-pressed-powder": ("L3_MK_SETTING_PRESSED", "merged"),
    "sub-lipstick": ("L3_MK_LIP_STICK", "merged"),
    "c1-sub-lipstick": ("L3_MK_LIP_STICK", "merged"),
    "sub-lipgloss": ("L3_MK_LIP_GLOSS", "merged"),
    "c1-sub-lipgloss": ("L3_MK_LIP_GLOSS", "merged"),
    "sub-lipliner": ("L3_MK_LIP_LINER", "one_to_one"),
    "c1-sub-lipliner": ("L3_MK_LIP_LINER", "merged"),
    "sub-eyeliner": ("L3_MK_EYE_LINER", "merged"),
    "c1-sub-eyeliner": ("L3_MK_EYE_LINER", "merged"),
    "sub-mascara": ("L3_MK_EYE_MASCARA", "merged"),
    "c1-sub-mascara": ("L3_MK_EYE_MASCARA", "merged"),
    "sub-lashes": ("L3_MK_EYE_LASHES", "one_to_one"),
    "c1-sub-lashes": ("L3_MK_EYE_LASHES", "merged"),
    "c1-sub-contourpowder": ("L3_MK_CONTOUR_POWDER", "one_to_one"),
    "sub-browpencil": ("L3_MK_BROW_PENCIL", "one_to_one"),
    "c1-sub-browpencil": ("L3_MK_BROW_PENCIL", "merged"),
    "sub-browpowder": ("L3_MK_BROW_POWDER", "merged"),
    "c1-sub-browpowder": ("L3_MK_BROW_POWDER", "merged"),
    "sub-browgel": ("L3_MK_BROW_GEL", "merged"),
    "c1-sub-browgel": ("L3_MK_BROW_GEL", "merged"),
}


def migrate_legacy_category(
    legacy_sub_id: Optional[str],
    *,
    legacy_primary_id: Optional[str] = None,
    name: str = "",
    shade: Optional[str] = None,
    texture: Optional[str] = None,
) -> dict[str, Optional[str]]:
    """严格区分五类历史分类映射，绝不静默丢弃未知分类。"""
    sub = (legacy_sub_id or "").strip()
    norm_sub = sub.removeprefix("c1-") if sub.startswith("c1-") else sub
    hint_text = f"{name} {texture or ''}"

    if sub in LEGACY_ONE_TO_ONE_OR_MERGED:
        code, kind = LEGACY_ONE_TO_ONE_OR_MERGED[sub]
        return {"target_code": code, "mapping_type": kind, "review_status": None}

    if norm_sub == "sub-lipbalm":
        has_tint = bool((shade or "").strip()) or any(k in name for k in ("变色", "润色", "有色"))
        return {
            "target_code": "L3_MK_LIP_TINTED_BALM" if has_tint else "L3_SK_OT_LIPBALM",
            "mapping_type": "conditional",
            "review_status": None,
        }

    one_to_many_rules: dict[str, tuple[str, list[tuple[tuple[str, ...], str]]]] = {
        "sub-concealer": (
            "L3_MK_CONCEALER_LIQUID",
            [(("盘", "膏"), "L3_MK_CONCEALER_CREAM"), (("笔", "棒"), "L3_MK_CONCEALER_PENCIL")],
        ),
        "sub-lipglaze": ("L3_MK_LIP_GLAZE", [(("唇泥",), "L3_MK_LIP_MUD")]),
        "sub-eyeshadow": ("L3_MK_EYE_PALETTE", [(("液体", "眼影蜜", "眼影笔"), "L3_MK_EYE_LIQUID")]),
        "sub-blush": ("L3_MK_BLUSH_POWDER", [(("膏", "液", "慕斯"), "L3_MK_BLUSH_CREAM")]),
        "sub-contour": ("L3_MK_CONTOUR_POWDER", [(("棒", "液"), "L3_MK_CONTOUR_STICK")]),
        "sub-highlighter": ("L3_MK_HL_POWDER", [(("液", "棒", "膏"), "L3_MK_HL_LIQUID")]),
        "sub-serum": (
            "L3_SK_SR_ESSENCE",
            [(("安瓶", "次抛"), "L3_SK_SR_AMPOULE"), (("油",), "L3_SK_SR_OIL")],
        ),
        "sub-cream": ("L3_SK_EC_CREAM", [(("乳液",), "L3_SK_EC_LOTION")]),
        "sub-sunscreen": (
            "L3_SK_SS_LOTION",
            [(("身体",), "L2_BD_SUNSCREEN"), (("喷雾", "防晒棒"), "L3_SK_SS_SPRAY_STICK")],
        ),
        "sub-toner": (
            "L3_SK_TN_TONER",
            [(("精华水", "神仙水", "肌底水"), "L3_SK_TN_ESSENCE_WATER"), (("喷雾",), "L3_SK_TN_MIST")],
        ),
    }
    if norm_sub in one_to_many_rules:
        default_code, patterns = one_to_many_rules[norm_sub]
        chosen = default_code
        for kws, target in patterns:
            if any(k in hint_text for k in kws):
                chosen = target
                break
        return {"target_code": chosen, "mapping_type": "one_to_many", "review_status": None}

    # 待人工确认兜底（绝不丢弃）
    pri = (legacy_primary_id or "").removeprefix("c1-")
    fallback_by_pri = {
        "cat-care": "L2_SK_OTHER",
        "cat-base": "L2_MK_OTHER",
        "cat-lip": "L2_MK_OTHER",
        "cat-eye": "L2_MK_OTHER",
        "cat-cheek": "L2_MK_OTHER",
        "cat-contour": "L2_MK_OTHER",
        "cat-brow": "L2_MK_OTHER",
    }
    return {
        "target_code": fallback_by_pri.get(pri, "L3_OT_UNCLASSIFIED"),
        "mapping_type": "pending_manual_confirm",
        "review_status": "pending_category_review",
    }


def migrate_legacy_idle_status(
    legacy_item: dict,
    *,
    has_usage_or_look_links: bool = False,
    today_iso: Optional[str] = None,
) -> dict:
    """
    依据 V3.1 校准后 idle 三分支兼容规则处理旧版闲置记录（严格修补 PAO/剩余比例误判与冲突判定）：
    - 严禁仅凭 pao_months 或孤立 remaining_percent 擅自推断为 in_use
    - 存在任一自相矛盾证据时必须进入 unrecorded + pending_idle_review 保守态
    - 仅当无矛盾且存在明确开封日期（opened_date）或真实使用轨迹（last_used_at / usage/look links）时才迁至 in_use
    - 全量保留迁移审计信息与原始状态
    """
    raw_status = legacy_item.get("status")
    opened = legacy_item.get("openedDate") or legacy_item.get("opened_date")
    mfg = legacy_item.get("manufactureDate") or legacy_item.get("manufacture_date")
    finished = legacy_item.get("finishedAt") or legacy_item.get("finished_at") or legacy_item.get("usedUpDate")
    pao = legacy_item.get("paoMonths") or legacy_item.get("pao_months")
    rem = legacy_item.get("remainingPercent") if "remainingPercent" in legacy_item else legacy_item.get("remaining_percent")
    last_used = legacy_item.get("lastUsedAt") or legacy_item.get("last_used_at")

    if raw_status != "idle":
        if raw_status in ("unrecorded", "unopened", "in_use", "finished"):
            return {
                "lifecycle_status": raw_status,
                "remaining_percent": rem,
                "opened_date": opened,
                "finished_at": finished,
                "migration_legacy_status": raw_status,
                "migration_review_status": None,
                "audit_note": None,
                "audit_json": None,
            }
        # 未知非法枚举禁止静默吞掉
        return {
            "lifecycle_status": "unrecorded",
            "remaining_percent": None,
            "opened_date": None,
            "finished_at": None,
            "migration_legacy_status": str(raw_status),
            "migration_review_status": "pending_idle_review",
            "audit_note": f"[迁移日志] 未知旧状态：{raw_status}（转为未记录待人工核对）",
            "audit_json": json.dumps(
                {"legacy_status": raw_status, "branch": "branch_c_unknown_status_to_pending"},
                ensure_ascii=False,
            ),
        }

    # 1. 检测证据矛盾（优先于一切推断）
    conflicts: list[str] = []
    if finished:
        conflicts.append("idle_with_finished_at")
    if rem is not None and int(rem) == 0:
        conflicts.append("idle_with_zero_remaining")
    if opened and mfg and opened < mfg:
        conflicts.append("opened_before_manufacture")
    if opened and today_iso and opened > today_iso[:10]:
        conflicts.append("opened_in_future")
    if opened and rem is None and not last_used and not has_usage_or_look_links:
        # 例：有开封日期但剩余量未知不构成矛盾，但若同时标明 "unopened" 来源等才算冲突；保留作正常参考
        pass
    if not opened and not last_used and not has_usage_or_look_links and rem is not None and int(rem) < 100:
        # 剩余比例 < 100 但没有任何开封日期/最近使用/历史关联，证据不足且信息不完整/存疑
        conflicts.append("partial_remaining_without_usage_or_open_evidence")

    # 2. 判定明确使用证据（不含单纯 PAO 或单纯剩余比例）
    has_opened = bool(opened)
    has_active_usage = bool(last_used or has_usage_or_look_links)

    if conflicts:
        target_status = "unrecorded"
        out_opened = None
        out_finished = None
        out_rem = None
        review_status = "pending_idle_review"
        branch = "branch_b_conflict_to_unrecorded_pending"
        note = f"[迁移日志] 原状态：idle（证据存在冲突或不足[{','.join(conflicts)}]，转未记录待人工核对）"
    elif has_opened or has_active_usage:
        target_status = "in_use"
        out_opened = opened
        out_finished = None
        out_rem = int(rem) if rem is not None else None
        review_status = None
        branch = "branch_a_opened_date_to_in_use" if has_opened else "branch_a_usage_evidence_to_in_use"
        basis_txt = "明确开封日期" if has_opened else "实际使用/妆容关联记录（缺开封日期）"
        note = f"[迁移日志] 原状态：idle（依据{basis_txt}迁至使用中）"
    else:
        # 仅有 PAO 或剩余比例 100% 或全空，不足以证明已经开封使用
        target_status = "unrecorded"
        out_opened = None
        out_finished = None
        out_rem = None
        review_status = "pending_idle_review"
        branch = "branch_b_insufficient_evidence_to_pending"
        note = "[迁移日志] 原状态：idle（仅有 PAO/基础参数或无使用证据，迁至未记录待核对）"

    audit = json.dumps(
        {
            "legacy_status": "idle",
            "branch": branch,
            "conflicts": conflicts,
            "had_opened_date": bool(opened),
            "had_pao": bool(pao),
            "raw_remaining_percent": rem,
            "had_last_used_at": bool(last_used),
            "had_usage_or_look_links": bool(has_usage_or_look_links),
        },
        ensure_ascii=False,
    )
    return {
        "lifecycle_status": target_status,
        "remaining_percent": out_rem,
        "opened_date": out_opened,
        "finished_at": out_finished,
        "migration_legacy_status": "idle",
        "migration_review_status": review_status,
        "audit_note": note,
        "audit_json": audit,
    }


def migrate_legacy_snapshot(
    conn: sqlite3.Connection,
    legacy_products: list[dict],
    legacy_items: list[dict],
    *,
    usage_or_look_item_ids: Optional[set[str]] = None,
    now_iso: Optional[str] = None,
) -> dict[str, int]:
    """
    在单事务内幂等迁移旧版产品与单件快照到 SQLite Schema V1：
    - 保留全部原始分类/状态审计信息
    - 重复执行按主键幂等跳过，绝不重复建档或污染既有记录
    - 任一记录违反约束时整批回滚，绝不跳过异常静默留脏数据
    """
    now = now_iso or _utc_now_iso()
    linked_ids = usage_or_look_item_ids or set()
    inserted_products = 0
    inserted_items = 0

    conn.execute("BEGIN IMMEDIATE;")
    try:
        for lp in legacy_products:
            pid = lp["id"]
            exists = conn.execute("SELECT 1 FROM products WHERE id = ?;", (pid,)).fetchone()
            if exists is not None:
                continue
            mapped = migrate_legacy_category(
                lp.get("subCategoryId"),
                legacy_primary_id=lp.get("primaryCategoryId"),
                name=lp.get("name", ""),
                shade=lp.get("shade"),
                texture=lp.get("texture"),
            )
            cat_row = conn.execute(
                "SELECT id FROM categories WHERE code = ?;", (mapped["target_code"],)
            ).fetchone()
            if cat_row is None:
                raise MigrationError(f"目标分类编码不存在: {mapped['target_code']}")
            raw_cat_meta = json.dumps(
                {
                    "primaryCategoryId": lp.get("primaryCategoryId"),
                    "subCategoryId": lp.get("subCategoryId"),
                    "mapping_type": mapped["mapping_type"],
                    "target_code": mapped["target_code"],
                },
                ensure_ascii=False,
            )
            conn.execute(
                """
                INSERT INTO products (
                    id, brand_id, category_id, name, is_custom_name, shade,
                    migration_legacy_category_raw, migration_review_status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    pid,
                    lp.get("brandId"),
                    cat_row["id"],
                    lp["name"],
                    1 if lp.get("isCustomName") else 0,
                    lp.get("shade"),
                    raw_cat_meta,
                    mapped["review_status"],
                    lp.get("createdAt") or now,
                    lp.get("updatedAt") or now,
                ),
            )
            inserted_products += 1

        for li in legacy_items:
            iid = li["id"]
            exists = conn.execute("SELECT 1 FROM product_items WHERE id = ?;", (iid,)).fetchone()
            if exists is not None:
                continue
            idle_res = migrate_legacy_idle_status(
                li,
                has_usage_or_look_links=(iid in linked_ids),
                today_iso=now,
            )
            conn.execute(
                """
                INSERT INTO product_items (
                    id, product_id, purchase_price_minor, currency_code, purchase_date,
                    lifecycle_status, remaining_percent, lifecycle_note,
                    manufacture_date, unopened_shelf_months, packaging_exp_date,
                    opened_date, pao_months, finished_at, last_used_at,
                    migration_legacy_status, migration_review_status, migration_audit_json,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    iid,
                    li["productId"],
                    li.get("purchasePriceMinor"),
                    li.get("currencyCode") or "CNY",
                    li.get("purchaseDate"),
                    idle_res["lifecycle_status"],
                    idle_res["remaining_percent"],
                    idle_res["audit_note"],
                    li.get("manufactureDate"),
                    li.get("unopenedShelfMonths"),
                    li.get("packagingExpDate"),
                    idle_res["opened_date"],
                    li.get("paoMonths"),
                    idle_res["finished_at"],
                    li.get("lastUsedAt"),
                    idle_res["migration_legacy_status"],
                    idle_res["migration_review_status"],
                    idle_res["audit_json"],
                    li.get("createdAt") or now,
                    li.get("updatedAt") or now,
                ),
            )
            inserted_items += 1

        conn.execute("COMMIT;")
        return {"inserted_products": inserted_products, "inserted_items": inserted_items}
    except Exception:
        conn.execute("ROLLBACK;")
        raise
