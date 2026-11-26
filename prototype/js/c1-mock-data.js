/**
 * 妆匣 BeautyBox · TASK02.1-C1 交互原型专用模拟数据与纯计算辅助
 * 完全独立于正式 store.js / seedData.js，不读写正式 localStorage（beautybox_prototype_v1）。
 */

import { deriveDualComputedExpiry, expiryStatus, todayStr } from './expiry.js';
import { CURRENCIES, formatMinor } from './currency.js';

/** 可扩展的一级 / 二级分类字典与默认数量单位 */
export const C1_CATEGORY_TREE = [
  {
    id: 'c1-cat-base',
    name: '底妆',
    sortOrder: 1,
    children: [
      { id: 'c1-sub-foundation', name: '粉底液', defaultUnit: '瓶' },
      { id: 'c1-sub-cream-found', name: '粉底膏', defaultUnit: '盒' },
      { id: 'c1-sub-cushion', name: '气垫', defaultUnit: '盒' },
      { id: 'c1-sub-concealer', name: '遮瑕', defaultUnit: '支' },
      { id: 'c1-sub-primer', name: '妆前乳', defaultUnit: '支' },
      { id: 'c1-sub-sunbase', name: '隔离霜', defaultUnit: '支' },
      { id: 'c1-sub-loose-powder', name: '散粉', defaultUnit: '盒' },
      { id: 'c1-sub-pressed-powder', name: '粉饼', defaultUnit: '盒' },
    ],
  },
  {
    id: 'c1-cat-lip',
    name: '唇妆',
    sortOrder: 2,
    children: [
      { id: 'c1-sub-lipstick', name: '口红', defaultUnit: '支' },
      { id: 'c1-sub-lipglaze', name: '唇釉', defaultUnit: '支' },
      { id: 'c1-sub-lipgloss', name: '唇蜜', defaultUnit: '支' },
      { id: 'c1-sub-lipliner', name: '唇线笔', defaultUnit: '支' },
      { id: 'c1-sub-lipbalm', name: '润唇膏', defaultUnit: '支' },
    ],
  },
  {
    id: 'c1-cat-eye',
    name: '眼妆',
    sortOrder: 3,
    children: [
      { id: 'c1-sub-eyeshadow', name: '眼影', defaultUnit: '盘' },
      { id: 'c1-sub-eyeliner', name: '眼线笔', defaultUnit: '支' },
      { id: 'c1-sub-mascara', name: '睫毛膏', defaultUnit: '支' },
      { id: 'c1-sub-lashes', name: '假睫毛', defaultUnit: '盒' },
    ],
  },
  {
    id: 'c1-cat-brow',
    name: '眉妆',
    sortOrder: 4,
    children: [
      { id: 'c1-sub-browpencil', name: '眉笔', defaultUnit: '支' },
      { id: 'c1-sub-browpowder', name: '眉粉', defaultUnit: '盒' },
      { id: 'c1-sub-browgel', name: '染眉膏', defaultUnit: '支' },
    ],
  },
  {
    id: 'c1-cat-contour',
    name: '修容',
    sortOrder: 5,
    children: [
      { id: 'c1-sub-contourpowder', name: '修容粉', defaultUnit: '盘' },
      { id: 'c1-sub-highlighter', name: '高光', defaultUnit: '块' },
      { id: 'c1-sub-blush', name: '腮红', defaultUnit: '块' },
    ],
  },
  {
    id: 'c1-cat-care',
    name: '护肤',
    sortOrder: 6,
    children: [
      { id: 'c1-sub-serum', name: '精华', defaultUnit: '瓶' },
      { id: 'c1-sub-cream', name: '面霜', defaultUnit: '瓶' },
      { id: 'c1-sub-sunscreen', name: '防晒', defaultUnit: '支' },
      { id: 'c1-sub-toner', name: '化妆水', defaultUnit: '瓶' },
    ],
  },
];

export const C1_SPEC_UNITS = ['ml', 'g'];
export const C1_QUANTITY_UNITS = ['瓶', '支', '盒', '盘', '块', '个'];
export const C1_ACQUISITION_PRESETS = [
  '专柜',
  '官方旗舰店',
  '免税店',
  '代购',
  '集合店',
  '二手/闲置购入',
  '他人赠送',
  '品牌赠品/小样',
];

/** C1 状态定义（增加 unrecorded 未记录状态） */
export const C1_ITEM_STATUSES = Object.freeze({
  unrecorded: { key: 'unrecorded', label: '未记录', listHint: '待补充信息', held: true, pillClass: '' },
  unopened: { key: 'unopened', label: '未开封', listHint: '未开封', held: true, pillClass: 'pill-sage' },
  in_use: { key: 'in_use', label: '使用中', listHint: '使用中', held: true, pillClass: 'pill-accent' },
  used_up: { key: 'used_up', label: '已用完', listHint: '已用完', held: false, pillClass: '' },
});

export function findCategoryNames(primaryId, subId) {
  const pri = C1_CATEGORY_TREE.find((c) => c.id === primaryId);
  const sub = pri?.children?.find((s) => s.id === subId);
  return {
    primaryName: pri?.name || '',
    subName: sub?.name || '',
    defaultUnit: sub?.defaultUnit || '件',
  };
}

/**
 * 选填产品名称自动生成展示名称：
 * - 用户填写自定义名称时，优先展示自定义名称
 * - 未填写时，按「品牌 + 分类（优先二级分类） + 色号」自动组合
 * - 缺项仅拼已有字段，不出现多余分隔符
 */
export function composeProductDisplayName({ customName = '', brand = '', primaryCategoryName = '', subCategoryName = '', shade = '' }) {
  const cleanCustom = String(customName || '').trim();
  if (cleanCustom) return cleanCustom;
  const catLabel = String(subCategoryName || primaryCategoryName || '').trim();
  const parts = [String(brand || '').trim(), catLabel, String(shade || '').trim()].filter(Boolean);
  return parts.join(' ') || '未命名产品';
}

export function formatSpecDisplay({ value = '', unit = '', customUnit = '' }) {
  const v = String(value || '').trim();
  const u = unit === '其他' ? String(customUnit || '').trim() : String(unit || '').trim();
  if (v && u) return `${v} ${u}`;
  return v || u || '';
}

/**
 * 校验单瓶是否存在状态与生命周期日期冲突（例如状态为未记录却保留开封日期）
 */
export function detectC1ItemDataConflict(item) {
  if (!item) return { hasConflict: false, message: '' };
  const hasOpened = String(item.openedDate || '').trim() !== '';
  if (item.status === 'unrecorded' && hasOpened) {
    return {
      hasConflict: true,
      message: '数据校验异常：使用状态为「未记录」，却存在开封日期，请核对使用状态。',
    };
  }
  if (item.status === 'unopened' && hasOpened) {
    return {
      hasConflict: true,
      message: '数据校验异常：使用状态为「未开封」，却存在开封日期。',
    };
  }
  return { hasConflict: false, message: '' };
}

/**
 * 独立判断单瓶的「待记录使用状态」与「有效期信息待完善」归属，确保两者互斥、不重复统计：
 * - 待记录使用状态：仅当使用状态为 unrecorded 且不存在开封日期冲突时进入
 * - 有效期信息待完善：仅当使用状态已明确（未开封或使用中）且既无用户确认到期日也无法按对应公式推算时进入
 * - 已用完（used_up）不进入以上任一分类
 */
export function getC1ItemExpiryCompleteness(item) {
  const status = item?.status || 'unrecorded';
  const conflict = detectC1ItemDataConflict(item);
  const isPendingStatus = status === 'unrecorded' && !conflict.hasConflict;

  if (status === 'used_up' || status === 'unrecorded' || conflict.hasConflict) {
    return {
      status,
      isPendingStatus,
      isIncompleteExpiry: false,
      isComplete: status !== 'unrecorded' && !conflict.hasConflict,
      missingReason: '',
      conflict,
    };
  }

  const resolved = resolveC1ItemExpiryForDisplay(item);
  if (resolved.date) {
    return {
      status,
      isPendingStatus: false,
      isIncompleteExpiry: false,
      isComplete: true,
      missingReason: '',
      conflict,
    };
  }

  let missingReason = '缺少到期信息（可补充或直接填写确认到期日）';
  if (status === 'unopened') {
    const hasMfg = Boolean(String(item?.manufactureDate || '').trim());
    const hasShelf = Boolean(item?.unopenedShelfMonths);
    if (!hasMfg && !hasShelf) {
      missingReason = '缺生产日期与未开封保质期（或直接确认到期日）';
    } else if (!hasMfg) {
      missingReason = '缺生产日期（或直接确认到期日）';
    } else if (!hasShelf) {
      missingReason = '缺未开封保质期（或直接确认到期日）';
    }
  } else if (status === 'in_use') {
    const hasOpened = Boolean(String(item?.openedDate || '').trim());
    const hasPao = Boolean(item?.paoMonths);
    if (!hasOpened && !hasPao) {
      missingReason = '缺开封日期与 PAO（或直接确认到期日）';
    } else if (!hasPao) {
      missingReason = '缺 PAO 期限（或直接确认到期日）';
    } else if (!hasOpened) {
      missingReason = '缺开封日期（或直接确认到期日）';
    }
  }

  return {
    status,
    isPendingStatus: false,
    isIncompleteExpiry: true,
    isComplete: false,
    missingReason,
    conflict,
  };
}

/**
 * 按最新数量统计口径聚合单个产品的实时件数：
 * - 未记录 / 未开封 / 使用中 -> 计入当前拥有数量
 * - 已用完 -> 不计入当前拥有数量，计入历史用完
 * - 已移除（deletedAt）-> 不计入当前拥有数量
 */
export function summarizeProductCounts(product, items, { today = todayStr(), nearDays = 30 } = {}) {
  const activeItems = items.filter((i) => i.productId === product.id && !i.deletedAt);
  const heldItems = activeItems.filter((i) => Boolean(C1_ITEM_STATUSES[i.status]?.held));
  const usedUpItems = activeItems.filter((i) => i.status === 'used_up');

  let inUseCount = 0;
  let unopenedCount = 0;
  let unrecordedCount = 0;
  let pendingStatusCount = 0;
  let incompleteExpiryCount = 0;
  let conflictCount = 0;
  let nearExpiryCount = 0;
  let expiredCount = 0;

  for (const item of heldItems) {
    if (item.status === 'in_use') inUseCount += 1;
    else if (item.status === 'unopened') unopenedCount += 1;
    else if (item.status === 'unrecorded') unrecordedCount += 1;

    const comp = getC1ItemExpiryCompleteness(item);
    if (comp.conflict.hasConflict) conflictCount += 1;
    if (comp.isPendingStatus) pendingStatusCount += 1;
    if (comp.isIncompleteExpiry) incompleteExpiryCount += 1;

    const resolved = resolveC1ItemExpiryForDisplay(item);
    const st = expiryStatus(resolved, today, nearDays);
    if (st.key === 'near') nearExpiryCount += 1;
    else if (st.key === 'expired') expiredCount += 1;
  }

  return {
    heldCount: heldItems.length,
    inUseCount,
    unopenedCount,
    unrecordedCount,
    pendingStatusCount,
    incompleteExpiryCount,
    conflictCount,
    usedUpCount: usedUpItems.length,
    nearExpiryCount,
    expiredCount,
    heldItems,
    usedUpItems,
  };
}

/** 列表/详情状态筛选标签元信息 */
export const C1_STATUS_FILTER_META = Object.freeze({
  all: { key: 'all', label: '当前拥有' },
  in_use: { key: 'in_use', label: '使用中' },
  unopened: { key: 'unopened', label: '未开封' },
  pending: { key: 'pending', label: '待补充信息' },
  pending_status: { key: 'pending_status', label: '待记录使用状态' },
  incomplete_expiry: { key: 'incomplete_expiry', label: '有效期信息待完善' },
  near: { key: 'near', label: '临期/过期' },
  used_up: { key: 'used_up', label: '已用完记录' },
});

/**
 * 按筛选状态提取某个产品下匹配的实例及对应的细分统计，
 * 让列表卡片与详情页能够聚焦展示所选状态的真实数量与实例，而非一律混同全量。
 */
export function filterC1ProductItems(product, items, filterKey = 'all', { today = todayStr(), nearDays = 30 } = {}) {
  const activeItems = items.filter((i) => i.productId === product.id && !i.deletedAt);
  const key = C1_STATUS_FILTER_META[filterKey] ? filterKey : 'all';

  const matchedItems = activeItems.filter((item) => {
    if (key === 'used_up') return item.status === 'used_up';
    const isHeld = Boolean(C1_ITEM_STATUSES[item.status]?.held);
    if (!isHeld) return false;
    if (key === 'all') return true;
    if (key === 'in_use' || key === 'unopened') return item.status === key;
    if (key === 'pending_status') return getC1ItemExpiryCompleteness(item).isPendingStatus;
    if (key === 'incomplete_expiry') return getC1ItemExpiryCompleteness(item).isIncompleteExpiry;
    if (key === 'pending') {
      const comp = getC1ItemExpiryCompleteness(item);
      return comp.isPendingStatus || comp.isIncompleteExpiry;
    }
    if (key === 'near') {
      const exp = expiryStatus(resolveC1ItemExpiryForDisplay(item), today, nearDays);
      return exp.key === 'near' || exp.key === 'expired';
    }
    return false;
  });

  let matchedInUseCount = 0;
  let matchedUnopenedCount = 0;
  let matchedUnrecordedCount = 0;
  let matchedPendingStatusCount = 0;
  let matchedIncompleteExpiryCount = 0;
  let matchedUsedUpCount = 0;
  let matchedExpiredCount = 0;
  let matchedNearCount = 0;
  const matchedMissingReasons = [];

  for (const item of matchedItems) {
    if (item.status === 'in_use') matchedInUseCount += 1;
    else if (item.status === 'unopened') matchedUnopenedCount += 1;
    else if (item.status === 'unrecorded') matchedUnrecordedCount += 1;
    else if (item.status === 'used_up') matchedUsedUpCount += 1;

    const comp = getC1ItemExpiryCompleteness(item);
    if (comp.isPendingStatus) matchedPendingStatusCount += 1;
    if (comp.isIncompleteExpiry) {
      matchedIncompleteExpiryCount += 1;
      if (comp.missingReason && !matchedMissingReasons.includes(comp.missingReason)) {
        matchedMissingReasons.push(comp.missingReason);
      }
    }

    if (item.status !== 'used_up') {
      const exp = expiryStatus(resolveC1ItemExpiryForDisplay(item), today, nearDays);
      if (exp.key === 'expired') matchedExpiredCount += 1;
      else if (exp.key === 'near') matchedNearCount += 1;
    }
  }

  return {
    filterKey: key,
    matchedItems,
    matchedCount: matchedItems.length,
    matchedInUseCount,
    matchedUnopenedCount,
    matchedUnrecordedCount,
    matchedPendingStatusCount,
    matchedIncompleteExpiryCount,
    matchedMissingReasons,
    matchedUsedUpCount,
    matchedExpiredCount,
    matchedNearCount,
  };
}

function offsetDate(days) {
  const dt = new Date();
  dt.setDate(dt.getDate() + days);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function createC1InitialState() {
  const products = [
    {
      id: 'c1-p-zelens',
      brand: 'Zelens',
      customName: '',
      primaryCategoryId: 'c1-cat-base',
      subCategoryId: 'c1-sub-foundation',
      shade: '浮雕白',
      specValue: '30',
      specUnit: 'ml',
      specCustomUnit: '',
      quantityUnit: '瓶',
      sampleKey: 'sample-look-commute',
      imageUrl: '',
      notesPrivate: '',
      hiddenFromActive: false,
      deletedAt: null,
      purgeAt: null,
      createdAt: '2026-10-01T08:00:00Z',
    },
    {
      id: 'c1-p-3ce',
      brand: '3CE',
      customName: '',
      primaryCategoryId: 'c1-cat-contour',
      subCategoryId: 'c1-sub-blush',
      shade: 'Nude Peach',
      specValue: '5',
      specUnit: 'g',
      specCustomUnit: '',
      quantityUnit: '块',
      sampleKey: 'sample-lip-196',
      imageUrl: '',
      notesPrivate: '日常裸蜜桃色，很提气色',
      hiddenFromActive: false,
      deletedAt: null,
      purgeAt: null,
      createdAt: '2026-10-12T08:00:00Z',
    },
    {
      id: 'c1-p-lancome',
      brand: 'Lancôme',
      customName: '菁纯丝绒雾面唇膏',
      primaryCategoryId: 'c1-cat-lip',
      subCategoryId: 'c1-sub-lipstick',
      shade: '#196 朱砂橘',
      specValue: '3.4',
      specUnit: 'g',
      specCustomUnit: '',
      quantityUnit: '支',
      sampleKey: 'sample-lip-nude',
      imageUrl: '',
      notesPrivate: '',
      hiddenFromActive: false,
      deletedAt: null,
      purgeAt: null,
      createdAt: '2026-09-10T08:00:00Z',
    },
  ];

  const items = [
    // Zelens：1 瓶使用中 + 1 瓶未记录（待补充信息）+ 1 瓶历史已用完
    {
      id: 'c1-i-1',
      productId: 'c1-p-zelens',
      status: 'in_use',
      manufactureDate: offsetDate(-200),
      unopenedShelfMonths: 36,
      openedDate: offsetDate(-90),
      paoMonths: 12,
      confirmedExpiryDate: offsetDate(22), // 30天内即将到期示例
      remainingPercent: 60,
      purchasePriceMinor: '42000',
      currencyCode: 'CNY',
      acquisitionMethod: '官方旗舰店',
      deletedAt: null,
    },
    {
      id: 'c1-i-2',
      productId: 'c1-p-zelens',
      status: 'unrecorded',
      manufactureDate: null,
      unopenedShelfMonths: null,
      openedDate: null,
      paoMonths: null,
      confirmedExpiryDate: null,
      remainingPercent: 100,
      purchasePriceMinor: null,
      currencyCode: 'CNY',
      acquisitionMethod: '',
      deletedAt: null,
    },
    {
      id: 'c1-i-3',
      productId: 'c1-p-zelens',
      status: 'used_up',
      manufactureDate: offsetDate(-520),
      unopenedShelfMonths: 36,
      openedDate: offsetDate(-380),
      usedUpDate: offsetDate(-15),
      paoMonths: 12,
      confirmedExpiryDate: offsetDate(-15),
      remainingPercent: 0,
      purchasePriceMinor: '39800',
      currencyCode: 'CNY',
      acquisitionMethod: '专柜',
      deletedAt: null,
    },
    // 3CE 腮红：1 块使用中 + 1 块未开封
    {
      id: 'c1-i-4',
      productId: 'c1-p-3ce',
      status: 'in_use',
      manufactureDate: offsetDate(-180),
      unopenedShelfMonths: 36,
      openedDate: offsetDate(-120),
      paoMonths: 24,
      confirmedExpiryDate: null,
      remainingPercent: 80,
      purchasePriceMinor: '12500',
      currencyCode: 'CNY',
      acquisitionMethod: '集合店',
      deletedAt: null,
    },
    {
      id: 'c1-i-5',
      productId: 'c1-p-3ce',
      status: 'unopened',
      manufactureDate: offsetDate(-60),
      unopenedShelfMonths: 36,
      openedDate: null,
      paoMonths: null,
      confirmedExpiryDate: null,
      remainingPercent: 100,
      purchasePriceMinor: '11500',
      currencyCode: 'CNY',
      acquisitionMethod: '免税店',
      deletedAt: null,
    },
    // Lancôme 唇膏：1 支未开封
    {
      id: 'c1-i-6',
      productId: 'c1-p-lancome',
      status: 'unopened',
      manufactureDate: offsetDate(-90),
      unopenedShelfMonths: 36,
      openedDate: null,
      paoMonths: null,
      confirmedExpiryDate: null,
      remainingPercent: 100,
      purchasePriceMinor: '32000',
      currencyCode: 'CNY',
      acquisitionMethod: '他人赠送',
      deletedAt: null,
    },
  ];

  // 演示：历史妆容记录已保存的产品快照（用于验证产品移除/单件移除/用完不破坏历史记录）
  const mockLookSnapshots = [
    {
      id: 'c1-look-1',
      name: '早八清透伪素颜',
      lookDate: offsetDate(-3),
      linkedProductIds: ['c1-p-zelens', 'c1-p-3ce'],
      productSnapshots: [
        { productId: 'c1-p-zelens', itemId: 'c1-i-1', label: 'Zelens 粉底液 浮雕白' },
        { productId: 'c1-p-3ce', itemId: 'c1-i-4', label: '3CE 腮红 Nude Peach' },
      ],
    },
  ];

  return {
    settings: {
      defaultCurrency: 'CNY',
      enableForeignCurrency: false,
      nearExpiryDays: 30,
    },
    products,
    items,
    mockLookSnapshots,
  };
}

export function describeC1ItemDualExpiry(item) {
  return deriveDualComputedExpiry(item);
}

function parseIsoUtc(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo, d);
  const dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== d) return null;
  return { y, mo, d, ms };
}

/**
 * 计算从开封日期到用完日期的使用时长（日历月+天，同时给出总天数）
 */
export function formatC1UsageDuration(openedDate, usedUpDate) {
  if (!openedDate || !usedUpDate) {
    return { valid: false, days: null, text: '', error: '' };
  }
  const start = parseIsoUtc(openedDate);
  const end = parseIsoUtc(usedUpDate);
  if (!start || !end) {
    return { valid: false, days: null, text: '', error: '日期格式无效' };
  }
  const diffDays = Math.round((end.ms - start.ms) / 86400000);
  if (diffDays < 0) {
    return { valid: false, days: diffDays, text: '', error: '用完日期不能早于开封日期' };
  }
  if (diffDays === 0) {
    return { valid: true, days: 0, text: '0天（开封当天用完）', error: '' };
  }
  if (diffDays < 30) {
    return { valid: true, days: diffDays, text: `${diffDays}天`, error: '' };
  }

  let months = (end.y - start.y) * 12 + (end.mo - start.mo);
  let anchorMs = Date.UTC(start.y, start.mo + months, Math.min(start.d, new Date(Date.UTC(start.y, start.mo + months + 1, 0)).getUTCDate()));
  if (anchorMs > end.ms) {
    months -= 1;
    anchorMs = Date.UTC(start.y, start.mo + months, Math.min(start.d, new Date(Date.UTC(start.y, start.mo + months + 1, 0)).getUTCDate()));
  }
  const remDays = Math.round((end.ms - anchorMs) / 86400000);
  const spanLabel = months > 0
    ? (remDays > 0 ? `${months}个月${remDays}天（共${diffDays}天）` : `${months}个月（共${diffDays}天）`)
    : `${diffDays}天`;
  return { valid: true, days: diffDays, text: spanLabel, error: '' };
}

/**
 * 解析当前单瓶在列表/详情徽标展示用的到期参考（遵循：用户确认优先；否则按当前状态采用未开封或开封后独立推算）
 */
export function resolveC1ItemExpiryForDisplay(item) {
  if (item?.confirmedExpiryDate) {
    return { source: 'confirmed', date: item.confirmedExpiryDate, candidates: [] };
  }
  const dual = deriveDualComputedExpiry(item);
  if (item?.status === 'unopened') {
    return dual.unopened.date
      ? { source: 'computed', date: dual.unopened.date, candidates: [dual.unopened] }
      : { source: 'none', date: null, candidates: [] };
  }
  if (item?.status === 'in_use') {
    return dual.opened.date
      ? { source: 'computed', date: dual.opened.date, candidates: [dual.opened] }
      : { source: 'none', date: null, candidates: [] };
  }
  if (item?.status === 'used_up') {
    if (dual.opened.date) return { source: 'computed', date: dual.opened.date, candidates: [dual.opened] };
    if (dual.unopened.date) return { source: 'computed', date: dual.unopened.date, candidates: [dual.unopened] };
    return { source: 'none', date: null, candidates: [] };
  }
  return { source: 'none', date: null, candidates: [] };
}

/**
 * 判断单瓶是否已经存在生命周期或购买记录（有记录则不允许再切回或保存为「未记录」）
 */
export function hasC1LifecycleRecord(item) {
  if (!item) return false;
  const hasPrice =
    (item.purchasePriceMinor !== null && item.purchasePriceMinor !== undefined && item.purchasePriceMinor !== '') ||
    String(item.purchasePriceInput || '').trim() !== '';
  const hasRemainingUsed =
    item.remainingPercent !== undefined &&
    item.remainingPercent !== null &&
    item.remainingPercent !== '' &&
    Number(item.remainingPercent) !== 100;
  return Boolean(
    item.manufactureDate ||
      item.unopenedShelfMonths ||
      item.openedDate ||
      item.usedUpDate ||
      item.paoMonths ||
      item.confirmedExpiryDate ||
      hasPrice ||
      item.acquisitionMethod ||
      item.acquisitionPreset ||
      hasRemainingUsed,
  );
}

/**
 * 统一的状态切换可用性与原因校验（供快速改状态 UI 与点击反馈共用）
 */
export function evaluateC1QuickStatusOption(item, targetStatus) {
  const cur = item?.status || 'unrecorded';
  if (cur === targetStatus) {
    return { allowed: true, isCurrent: true, requiresConfirm: false, reason: '' };
  }

  if (targetStatus === 'unopened') {
    if (cur === 'used_up') {
      return {
        allowed: false,
        isCurrent: false,
        requiresConfirm: false,
        reason: '已用完产品不能直接改为未开封，请先恢复为使用中。',
      };
    }
    if (cur === 'in_use') {
      return {
        allowed: true,
        isCurrent: false,
        requiresConfirm: 'restore_unopened',
        reason: '',
      };
    }
    return { allowed: true, isCurrent: false, requiresConfirm: false, reason: '' };
  }

  if (targetStatus === 'in_use') {
    if (cur === 'used_up') {
      return {
        allowed: true,
        isCurrent: false,
        requiresConfirm: 'restore_in_use',
        reason: '',
      };
    }
    if (cur === 'unopened') {
      return {
        allowed: true,
        isCurrent: false,
        requiresConfirm: 'open_today',
        reason: '',
      };
    }
    return { allowed: true, isCurrent: false, requiresConfirm: false, reason: '' };
  }

  if (targetStatus === 'used_up') {
    return {
      allowed: true,
      isCurrent: false,
      requiresConfirm: 'mark_used_up',
      reason: '',
    };
  }

  return {
    allowed: false,
    isCurrent: false,
    requiresConfirm: false,
    reason: '当前产品状态不支持此操作。',
  };
}

/**
 * 统一的保存前状态与日期一致性校验（编辑详情与快速修改共用）：
 * - 「未记录」仅作为首次未填任何信息时由系统自动赋予的状态，绝不要求用户手动选择
 * - 若首次/未记录单瓶填写了日期或价格但未手动选状态，系统按录入内容自动判定为「未开封」或「使用中」，绝不错误拦截
 */
export function validateC1ItemTransitionAndFields({ previousItem = null, nextInput }) {
  const rawStatus = String(nextInput?.status || '').trim();
  let targetStatus = rawStatus;
  const openedDate = String(nextInput?.openedDate || '').trim() || null;
  let usedUpDate = String(nextInput?.usedUpDate || '').trim() || null;
  const manufactureDate = String(nextInput?.manufactureDate || '').trim() || null;
  const unopenedShelfMonths = nextInput?.unopenedShelfMonths
    ? Number.parseInt(String(nextInput.unopenedShelfMonths), 10)
    : null;
  const paoMonths = nextInput?.paoMonths ? Number.parseInt(String(nextInput.paoMonths), 10) : null;
  const confirmedExpiryDate = String(nextInput?.confirmedExpiryDate || '').trim() || null;

  const remainingRaw =
    nextInput?.remainingPercent === '' || nextInput?.remainingPercent === null || nextInput?.remainingPercent === undefined
      ? (targetStatus === 'used_up' ? 0 : 100)
      : Number.parseInt(String(nextInput.remainingPercent), 10);
  if (!Number.isInteger(remainingRaw) || remainingRaw < 0 || remainingRaw > 100) {
    return { ok: false, error: '剩余比例必须在 0 到 100 之间。' };
  }

  const nextHasLifecycle = hasC1LifecycleRecord({
    ...nextInput,
    manufactureDate,
    unopenedShelfMonths,
    openedDate,
    usedUpDate,
    paoMonths,
    confirmedExpiryDate,
    remainingPercent: remainingRaw,
  });

  if (!targetStatus || targetStatus === 'unrecorded') {
    if (rawStatus === 'unrecorded' && openedDate) {
      return { ok: false, error: '使用状态为「未记录」时不能存在开封日期，请改为「使用中」或清空开封日期。' };
    }
    if (previousItem && previousItem.status && previousItem.status !== 'unrecorded') {
      return { ok: false, error: '已有记录的产品不能改为未记录，请选择未开封、使用中或已用完。' };
    }
    if (!nextHasLifecycle) {
      targetStatus = 'unrecorded';
    } else if (usedUpDate || remainingRaw === 0) {
      targetStatus = 'used_up';
    } else if (openedDate) {
      targetStatus = 'in_use';
    } else {
      targetStatus = 'unopened';
    }
  }

  if (!C1_ITEM_STATUSES[targetStatus]) {
    return { ok: false, error: '请选择有效的使用状态。' };
  }

  if (targetStatus === 'unopened') {
    if (previousItem && previousItem.status === 'used_up') {
      return { ok: false, error: '已用完产品不能直接改为未开封，请先恢复为使用中。' };
    }
    if (openedDate) {
      return { ok: false, error: '未开封状态不能保留开封日期，请先清空开封日期或选择「使用中」。' };
    }
  }

  if (targetStatus === 'in_use') {
    if (!openedDate) {
      return { ok: false, error: '「使用中」状态必须填写有效的开封日期。' };
    }
  }

  if (targetStatus === 'used_up') {
    if (!usedUpDate) {
      usedUpDate = todayStr();
    }
    if (openedDate && usedUpDate < openedDate) {
      return { ok: false, error: '用完日期不能早于开封日期。' };
    }
  } else {
    usedUpDate = null;
  }

  if (previousItem?.status === 'used_up' && targetStatus === 'in_use' && remainingRaw <= 0) {
    return { ok: false, error: '恢复使用中时，剩余比例必须大于 0%。' };
  }

  return {
    ok: true,
    normalized: {
      status: targetStatus,
      manufactureDate,
      unopenedShelfMonths,
      openedDate,
      usedUpDate,
      paoMonths,
      confirmedExpiryDate,
      remainingPercent: targetStatus === 'used_up' ? 0 : remainingRaw,
    },
  };
}

export function getAllowedC1Statuses(item) {
  return {
    unopened: evaluateC1QuickStatusOption(item, 'unopened').allowed,
    in_use: evaluateC1QuickStatusOption(item, 'in_use').allowed,
    used_up: evaluateC1QuickStatusOption(item, 'used_up').allowed,
  };
}

export function formatC1Price(minor, currencyCode = 'CNY') {
  if (minor === null || minor === undefined || minor === '') return '';
  if (CURRENCIES[currencyCode]) return formatMinor(minor, currencyCode, { showCode: false });
  return `${currencyCode} ${minor}`;
}
