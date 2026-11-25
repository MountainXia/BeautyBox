/**
 * 妆匣 BeautyBox · 浏览器交互原型（TASK 02）
 * 有效期推算与用户确认保护
 *
 * 规则来源：docs/01 第 5 节、docs/adr/0001-architecture-decisions.md
 * - 未开封推算到期日 = 生产日期 + 用户填写的未开封保质期（月）
 * - 开封后推算到期日 = 开封日期 + PAO（月）
 * - 缺少计算要素时不推算；绝不按品类猜测保质期或 PAO
 * - 同时保留系统推算日期、计算依据、用户确认日期和确认时间
 * - 用户确认值不会被自动覆盖；相关输入变化时只提示重新确认
 *
 * 原型实现中的「待产品确认」假设（已在任务报告中列出，未擅自定为正式规则）：
 * A1. 月份相加遇到月末溢出时，取目标月最后一天（如 01-31 + 1 个月 → 02-28/29）。
 * A2. 到期日当天仍视为有效，晚于到期日才判定为“已过期”。
 * A3. 两种推算结果同时存在且不一致时，系统不自动取舍，标记为“待确认”，由用户填写确认值。
 * A4. 临期阈值文档未定义，原型默认“未设置”，只有用户在「我的」中手动设置后才统计临期。
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y, m) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

export function parseDate(s) {
  if (typeof s !== 'string') return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

export function isValidDate(s) {
  return parseDate(s) !== null;
}

const pad2 = (n) => String(n).padStart(2, '0');

export function formatDate({ y, m, d }) {
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

/** 本地时区的“今天”（纯日期 YYYY-MM-DD） */
export function todayStr(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** 纯日期加月份（月末溢出按假设 A1 取当月最后一天） */
export function addMonths(s, months) {
  const p = parseDate(s);
  if (!p) throw new Error('无效日期');
  if (!Number.isInteger(months)) throw new Error('月份必须是整数');
  const total = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(total / 12);
  const m = total - y * 12 + 1;
  return formatDate({ y, m, d: Math.min(p.d, daysInMonth(y, m)) });
}

function toUTC(s) {
  const p = parseDate(s);
  if (!p) throw new Error('无效日期');
  return Date.UTC(p.y, p.m - 1, p.d);
}

export function addDays(s, n) {
  const t = new Date(toUTC(s) + n * DAY_MS);
  return formatDate({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

/** to - from 的天数差（纯日期） */
export function daysBetween(from, to) {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

export function isPositiveIntMonths(v) {
  return Number.isInteger(v) && v > 0;
}

export const EXPIRY_BASIS_LABELS = Object.freeze({
  unopened: '生产日期 + 未开封保质期',
  opened: '开封日期 + 开封后使用期限（PAO）',
  both: '两种推算结果一致',
  conflict: '两种推算结果不一致',
  none: '信息不足，未推算',
});

/** 计算所有可推算的候选到期日（只依据用户填写的日期与月数，不读取品类） */
export function computeExpiryCandidates(item) {
  const out = [];
  if (isValidDate(item.manufactureDate) && isPositiveIntMonths(item.unopenedShelfMonths)) {
    out.push({
      basis: 'unopened',
      label: EXPIRY_BASIS_LABELS.unopened,
      date: addMonths(item.manufactureDate, item.unopenedShelfMonths),
      formula: `${item.manufactureDate} + ${item.unopenedShelfMonths} 个月`,
    });
  }
  if (isValidDate(item.openedDate) && isPositiveIntMonths(item.paoMonths)) {
    out.push({
      basis: 'opened',
      label: EXPIRY_BASIS_LABELS.opened,
      date: addMonths(item.openedDate, item.paoMonths),
      formula: `${item.openedDate} + ${item.paoMonths} 个月`,
    });
  }
  return out;
}

/** 缺项提示：只说明缺什么，不补全、不猜测 */
export function missingExpiryInputs(item) {
  const hints = [];
  const hasMfg = isValidDate(item.manufactureDate);
  const hasShelf = isPositiveIntMonths(item.unopenedShelfMonths);
  const hasOpen = isValidDate(item.openedDate);
  const hasPao = isPositiveIntMonths(item.paoMonths);
  if (hasMfg && !hasShelf) hints.push('已填写生产日期，缺少未开封保质期，暂不推算未开封到期日');
  if (!hasMfg && hasShelf) hints.push('已填写未开封保质期，缺少生产日期，暂不推算未开封到期日');
  if (hasOpen && !hasPao) hints.push('已填写开封日期，缺少 PAO（开封后使用期限），暂不推算开封后到期日');
  if (!hasOpen && hasPao) hints.push('已填写 PAO，缺少开封日期，暂不推算开封后到期日');
  return hints;
}

/**
 * 独立推算未开封有效期与开封后有效期（TASK02.1-B）：
 * - 未开封推算：生产日期 + 未开封保质期（月）
 * - 开封后推算：开封日期 + PAO（月）
 * 两者相互独立、分别返回，互不覆盖，缺项不猜测。
 */
export function deriveDualComputedExpiry(item) {
  const hasMfg = isValidDate(item.manufactureDate);
  const hasShelf = isPositiveIntMonths(item.unopenedShelfMonths);
  const hasOpen = isValidDate(item.openedDate);
  const hasPao = isPositiveIntMonths(item.paoMonths);

  let unopenedMissing = null;
  if (hasMfg && !hasShelf) unopenedMissing = '已填生产日期，缺少未开封保质期，暂不推算';
  else if (!hasMfg && hasShelf) unopenedMissing = '已填未开封保质期，缺少生产日期，暂不推算';

  let openedMissing = null;
  if (hasOpen && !hasPao) openedMissing = '已填开封日期，缺少 PAO，暂不推算';
  else if (!hasOpen && hasPao) openedMissing = '已填 PAO，缺少开封日期，暂不推算';

  return {
    unopened: hasMfg && hasShelf
      ? {
          basis: 'unopened',
          label: EXPIRY_BASIS_LABELS.unopened,
          date: addMonths(item.manufactureDate, item.unopenedShelfMonths),
          formula: `${item.manufactureDate} + ${item.unopenedShelfMonths} 个月`,
          missingHint: null,
        }
      : {
          basis: 'unopened',
          label: EXPIRY_BASIS_LABELS.unopened,
          date: null,
          formula: null,
          missingHint: unopenedMissing,
        },
    opened: hasOpen && hasPao
      ? {
          basis: 'opened',
          label: EXPIRY_BASIS_LABELS.opened,
          date: addMonths(item.openedDate, item.paoMonths),
          formula: `${item.openedDate} + ${item.paoMonths} 个月`,
          missingHint: null,
        }
      : {
          basis: 'opened',
          label: EXPIRY_BASIS_LABELS.opened,
          date: null,
          formula: null,
          missingHint: openedMissing,
        },
  };
}

/** 对应数据库 computed_expiry_date + expiry_basis 两列 */
export function deriveComputedExpiry(item) {
  const dual = deriveDualComputedExpiry(item);
  const c = computeExpiryCandidates(item);
  if (c.length === 0) {
    return {
      computedExpiryDate: null,
      expiryBasis: 'none',
      unopenedComputedExpiry: null,
      openedComputedExpiry: null,
    };
  }
  if (c.length === 1) {
    return {
      computedExpiryDate: c[0].date,
      expiryBasis: c[0].basis,
      unopenedComputedExpiry: dual.unopened.date,
      openedComputedExpiry: dual.opened.date,
    };
  }
  if (c[0].date === c[1].date) {
    return {
      computedExpiryDate: c[0].date,
      expiryBasis: 'both',
      unopenedComputedExpiry: dual.unopened.date,
      openedComputedExpiry: dual.opened.date,
    };
  }
  return {
    computedExpiryDate: null,
    expiryBasis: 'conflict',
    unopenedComputedExpiry: dual.unopened.date,
    openedComputedExpiry: dual.opened.date,
  };
}

/**
 * 解析“当前采用的到期日”：用户确认值优先；否则使用唯一的系统推算值；
 * 两种推算冲突时不自动取舍（假设 A3）。
 */
export function resolveExpiry(item) {
  const candidates = computeExpiryCandidates(item);
  if (isValidDate(item.confirmedExpiryDate)) {
    return { source: 'confirmed', date: item.confirmedExpiryDate, candidates, needsReconfirm: !!item.expiryNeedsReconfirm };
  }
  const d = deriveComputedExpiry(item);
  if (d.expiryBasis === 'conflict') return { source: 'conflict', date: null, candidates, needsReconfirm: false };
  if (d.computedExpiryDate) {
    return { source: 'computed', date: d.computedExpiryDate, basis: d.expiryBasis, candidates, needsReconfirm: false };
  }
  return { source: 'none', date: null, candidates, needsReconfirm: false };
}

/**
 * 有效期状态。nearDays 为 null 时表示临期阈值未设置，不会判定“临期”（假设 A4）。
 */
export function expiryStatus(resolved, today, nearDays) {
  if (!resolved.date) {
    return resolved.source === 'conflict'
      ? { key: 'needs_confirm', label: '推算结果不一致，待确认', short: '待确认' }
      : { key: 'unknown', label: '未设置有效期', short: '未设置' };
  }
  const left = daysBetween(today, resolved.date);
  if (left < 0) return { key: 'expired', label: `已过期 ${-left} 天`, short: '已过期', daysLeft: left };
  if (Number.isInteger(nearDays) && nearDays > 0 && left <= nearDays) {
    return { key: 'near', label: left === 0 ? '今天到期' : `${left} 天后到期`, short: '临期', daysLeft: left };
  }
  return { key: 'ok', label: left === 0 ? '今天到期' : `剩余 ${left} 天`, short: '有效', daysLeft: left };
}

const EXPIRY_INPUT_FIELDS = ['manufactureDate', 'unopenedShelfMonths', 'openedDate', 'paoMonths'];

export function expiryInputsChanged(prev, next) {
  return EXPIRY_INPUT_FIELDS.some((k) => (prev[k] ?? null) !== (next[k] ?? null));
}

/**
 * 保存实例时计算确认相关字段：
 * - 用户主动修改确认日期 → 记录新确认时间，清除“需重新确认”
 * - 用户未修改确认日期，但推算输入变化 → 保留原确认值，只标记“需重新确认”
 */
export function applyExpiryConfirmation(prev, next, nowIso) {
  const nextConfirmed = next.confirmedExpiryDate || null;
  if (!prev) {
    return {
      confirmedExpiryDate: nextConfirmed,
      expiryConfirmedAt: nextConfirmed ? nowIso : null,
      expiryNeedsReconfirm: false,
    };
  }
  const prevConfirmed = prev.confirmedExpiryDate || null;
  if (nextConfirmed !== prevConfirmed) {
    return {
      confirmedExpiryDate: nextConfirmed,
      expiryConfirmedAt: nextConfirmed ? nowIso : null,
      expiryNeedsReconfirm: false,
    };
  }
  const changed = expiryInputsChanged(prev, next);
  return {
    confirmedExpiryDate: prevConfirmed,
    expiryConfirmedAt: prev.expiryConfirmedAt || null,
    expiryNeedsReconfirm: prevConfirmed ? (!!prev.expiryNeedsReconfirm || changed) : false,
  };
}
