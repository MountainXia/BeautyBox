/**
 * 妆匣 BeautyBox · TASK02.1-C1 交互原型专用模拟数据与纯计算辅助
 * 完全独立于正式 store.js / seedData.js，不读写正式 localStorage（beautybox_prototype_v1）。
 */

import { deriveDualComputedExpiry, expiryStatus, resolveExpiry, todayStr } from './expiry.js';
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
  let nearExpiryCount = 0;
  let expiredCount = 0;

  for (const item of heldItems) {
    if (item.status === 'in_use') inUseCount += 1;
    else if (item.status === 'unopened') unopenedCount += 1;
    else if (item.status === 'unrecorded') unrecordedCount += 1;

    const resolved = resolveExpiry(item);
    const st = expiryStatus(resolved, today, nearDays);
    if (st.key === 'near') nearExpiryCount += 1;
    else if (st.key === 'expired') expiredCount += 1;
  }

  return {
    heldCount: heldItems.length,
    inUseCount,
    unopenedCount,
    unrecordedCount,
    usedUpCount: usedUpItems.length,
    nearExpiryCount,
    expiredCount,
    heldItems,
    usedUpItems,
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

/**
 * 校验单个产品可选的状态流转（防止逻辑矛盾）：
 * - 已有开封日期 -> 不可选「未记录」或「未开封」
 * - 已有任意详细信息或已脱离未记录 -> 不可回退为「未记录」
 */
export function getAllowedC1Statuses(item) {
  const hasOpened = Boolean(item?.openedDate);
  const hasDetails = Boolean(
    item?.manufactureDate ||
      item?.unopenedShelfMonths ||
      item?.openedDate ||
      item?.paoMonths ||
      item?.confirmedExpiryDate ||
      (item?.purchasePriceMinor !== null && item?.purchasePriceMinor !== undefined && item?.purchasePriceMinor !== '') ||
      item?.acquisitionMethod,
  );
  return {
    unrecorded: !hasOpened && !hasDetails && item?.status === 'unrecorded',
    unopened: !hasOpened,
    in_use: true,
    used_up: true,
  };
}

export function formatC1Price(minor, currencyCode = 'CNY') {
  if (minor === null || minor === undefined || minor === '') return '';
  if (CURRENCIES[currencyCode]) return formatMinor(minor, currencyCode, { showCode: false });
  return `${currencyCode} ${minor}`;
}
