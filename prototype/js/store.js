/**
 * 妆匣 BeautyBox · 浏览器交互原型（TASK 02）
 * 统一模拟数据仓库（localStorage 业务 JSON + IndexedDB 图片 Blob 分离存储）
 *
 * 严格遵循 ADR-0001：
 * - Product 与 ProductItem 严格分离
 * - 金额采用整数最小货币单位字符串 + currencyCode；不支持或超精度输入一律拦截
 * - 首页：产品资料数与当前持有件数独立统计；累计购买金额按币种分组（含已用完/归档历史消费）
 * - 产品封面图以 productPhotos.isCover 为唯一真相源，最多 1 张
 * - 历史妆容与日常流程执行记录保存产品快照，产品改名或归档后历史记录不失真
 * - 业务数据存 localStorage，用户选择的真实图片 Blob 存 IndexedDB，绝不将 Base64 写入 localStorage
 */

import {
  CURRENCIES,
  UNSUPPORTED_MESSAGE,
  isSupportedCurrency,
  parseAmountToMinor,
  sumByCurrency,
} from './currency.js';
import {
  applyExpiryConfirmation,
  deriveComputedExpiry,
  expiryStatus,
  formatUsageDuration,
  isPositiveIntMonths,
  isValidDate,
  resolveExpiry,
  resolveItemExpiryForDisplay,
  todayStr,
} from './expiry.js';
import {
  clearAllMediaBlobs,
  deleteMediaBlob,
  hydrateMediaAssets,
  readImageDimensions,
  resolveMediaUrl,
  saveMediaBlob,
  validateImageFile,
} from './assets.js';
import { createSeedData } from './seedData.js';
import { PrototypeSaveError, recordDiagnostic } from './diagnostics.js';

export const STORAGE_KEY = 'beautybox_prototype_v1';
export const LOOK_TRASH_RETENTION_DAYS = 7;
export const PRODUCT_TRASH_RETENTION_DAYS = 7;
export const QUANTITY_UNITS = Object.freeze(['瓶', '支', '盒', '盘', '块', '个']);

/** 各一级分类下的常用二级分类与默认数量单位 */
export const CATEGORY_SUBCATEGORIES = Object.freeze({
  'cat-base': [
    { id: 'sub-foundation', name: '粉底液', defaultUnit: '瓶' },
    { id: 'sub-cream-found', name: '粉底膏', defaultUnit: '盒' },
    { id: 'sub-cushion', name: '气垫', defaultUnit: '盒' },
    { id: 'sub-concealer', name: '遮瑕', defaultUnit: '支' },
    { id: 'sub-primer', name: '妆前乳', defaultUnit: '支' },
    { id: 'sub-sunbase', name: '隔离霜', defaultUnit: '支' },
    { id: 'sub-loose-powder', name: '散粉', defaultUnit: '盒' },
    { id: 'sub-pressed-powder', name: '粉饼', defaultUnit: '盒' },
  ],
  'cat-lip': [
    { id: 'sub-lipstick', name: '口红', defaultUnit: '支' },
    { id: 'sub-lipglaze', name: '唇釉', defaultUnit: '支' },
    { id: 'sub-lipgloss', name: '唇蜜', defaultUnit: '支' },
    { id: 'sub-lipliner', name: '唇线笔', defaultUnit: '支' },
    { id: 'sub-lipbalm', name: '润唇膏', defaultUnit: '支' },
  ],
  'cat-eye': [
    { id: 'sub-eyeshadow', name: '眼影盘', defaultUnit: '盘' },
    { id: 'sub-eyeliner', name: '眼线笔', defaultUnit: '支' },
    { id: 'sub-mascara', name: '睫毛膏', defaultUnit: '支' },
    { id: 'sub-lashes', name: '假睫毛', defaultUnit: '盒' },
  ],
  'cat-cheek': [
    { id: 'sub-blush', name: '腮红', defaultUnit: '块' },
    { id: 'sub-contour', name: '修容', defaultUnit: '盘' },
    { id: 'sub-highlighter', name: '高光', defaultUnit: '块' },
  ],
  'cat-brow': [
    { id: 'sub-browpencil', name: '眉笔', defaultUnit: '支' },
    { id: 'sub-browpowder', name: '眉粉', defaultUnit: '盒' },
    { id: 'sub-browgel', name: '染眉膏', defaultUnit: '支' },
  ],
  'cat-care': [
    { id: 'sub-serum', name: '精华', defaultUnit: '瓶' },
    { id: 'sub-cream', name: '面霜', defaultUnit: '瓶' },
    { id: 'sub-sunscreen', name: '防晒', defaultUnit: '支' },
    { id: 'sub-toner', name: '化妆水', defaultUnit: '瓶' },
  ],
});

export function findSubCategoryInfo(categoryId, subCategoryId) {
  const list = CATEGORY_SUBCATEGORIES[categoryId] || [];
  const sub = list.find((s) => s.id === subCategoryId) || null;
  const fallbackUnit =
    categoryId === 'cat-lip' || categoryId === 'cat-brow'
      ? '支'
      : categoryId === 'cat-eye'
        ? '盘'
        : categoryId === 'cat-cheek'
          ? '块'
          : categoryId === 'cat-base' || categoryId === 'cat-care'
            ? '瓶'
            : '件';
  return {
    subCategoryName: sub?.name || '',
    defaultUnit: sub?.defaultUnit || fallbackUnit,
  };
}

/**
 * 选填产品名称自动组合：
 * - 用户填写了自定义名称时优先采用
 * - 留空时按「品牌 + 分类（优先二级分类） + 色号」拼已有项，不产生多余分隔符
 */
export function composeProductDisplayName({
  customName = '',
  brandName = '',
  categoryName = '',
  subCategoryName = '',
  shade = '',
} = {}) {
  const cleanCustom = String(customName || '').trim();
  if (cleanCustom) return cleanCustom;
  const catLabel = String(subCategoryName || categoryName || '').trim();
  const parts = [String(brandName || '').trim(), catLabel, String(shade || '').trim()].filter(Boolean);
  return parts.join(' ') || '未命名产品';
}

export const ACQUISITION_PRESETS = Object.freeze([
  '专柜',
  '官方旗舰店',
  '免税店',
  '代购',
  '集合店',
  '二手/闲置购入',
  '他人赠送',
  '品牌赠品/小样',
]);

export const SPEC_UNITS = Object.freeze(['ml', 'g', '瓶', '支', '盒', '把', '套', '块', '个']);

export function parseSpecificationParts(spec = '') {
  const raw = String(spec || '').trim();
  if (!raw) return { value: '', unit: '', customUnit: '' };
  const sortedUnits = [...SPEC_UNITS].sort((a, b) => b.length - a.length);
  for (const u of sortedUnits) {
    const re = new RegExp(`^([\\d.]+)\\s*${u}$`, 'i');
    const m = raw.match(re);
    if (m) return { value: m[1], unit: u, customUnit: '' };
  }
  const generic = raw.match(/^([\d.]+)\s*(.+)$/);
  if (generic) {
    return { value: generic[1], unit: '其他', customUnit: generic[2].trim() };
  }
  return { value: raw, unit: '', customUnit: '' };
}

export function formatSpecification({ value = '', unit = '', customUnit = '', fallback = '' } = {}) {
  const v = String(value || '').trim();
  const uRaw = String(unit || '').trim();
  const u = uRaw === '其他' ? String(customUnit || '').trim() : uRaw;
  if (v && u) return `${v} ${u}`;
  if (v) return v;
  if (u) return u;
  return String(fallback || '').trim();
}

export function normalizeAcquisitionMethod(input) {
  if (!input) return { acquisitionMethod: null, purchaseChannel: '' };
  if (typeof input === 'object' && !Array.isArray(input)) {
    const presetRaw = (input.preset || '').trim();
    const customRaw = (input.customText || '').trim();
    if (!presetRaw && !customRaw) return { acquisitionMethod: null, purchaseChannel: '' };
    if (presetRaw === '其他') {
      return {
        acquisitionMethod: { preset: '其他', customText: customRaw },
        purchaseChannel: customRaw || '其他',
      };
    }
    if (ACQUISITION_PRESETS.includes(presetRaw)) {
      return {
        acquisitionMethod: { preset: presetRaw, customText: '' },
        purchaseChannel: presetRaw,
      };
    }
    const text = customRaw || presetRaw;
    return {
      acquisitionMethod: { preset: '其他', customText: text },
      purchaseChannel: text,
    };
  }
  const text = String(input).trim();
  if (!text) return { acquisitionMethod: null, purchaseChannel: '' };
  if (ACQUISITION_PRESETS.includes(text)) {
    return { acquisitionMethod: { preset: text, customText: '' }, purchaseChannel: text };
  }
  return { acquisitionMethod: { preset: '其他', customText: text }, purchaseChannel: text };
}

export function getItemAcquisitionDisplay(item) {
  if (!item) return '';
  const m = item.acquisitionMethod;
  if (m && typeof m === 'object') {
    if (m.preset === '其他') return (m.customText || '').trim() || '其他';
    return (m.preset || m.customText || '').trim();
  }
  if (typeof m === 'string' && m.trim()) return m.trim();
  return (item.purchaseChannel || '').trim();
}

/** 视为“仍在持有”的实例状态（未记录 / 未开封 / 使用中 / 兼容旧闲置） */
export const ITEM_STATUSES = Object.freeze({
  unrecorded: Object.freeze({ key: 'unrecorded', label: '未记录', listHint: '待记录使用状态', held: true, pillClass: '' }),
  unopened: Object.freeze({ key: 'unopened', label: '未开封', listHint: '未开封', held: true, pillClass: 'pill-sage' }),
  in_use: Object.freeze({ key: 'in_use', label: '使用中', listHint: '使用中', held: true, pillClass: 'pill-accent' }),
  idle: Object.freeze({ key: 'idle', label: '闲置中', listHint: '闲置中', held: true, pillClass: '' }),
  used_up: Object.freeze({ key: 'used_up', label: '已用完', listHint: '已用完', held: false, pillClass: '' }),
  disposed: Object.freeze({ key: 'disposed', label: '已弃用', listHint: '已弃用', held: false, pillClass: '' }),
  transferred: Object.freeze({ key: 'transferred', label: '已转让', listHint: '已转让', held: false, pillClass: '' }),
});

/** 界面允许用户主动选填或切换的使用状态（「未记录」仅作为未填时的系统默认兜底） */
export const USER_SELECTABLE_STATUSES = Object.freeze(['unopened', 'in_use', 'used_up']);

export function isHeldStatus(status) {
  return Boolean(ITEM_STATUSES[status]?.held);
}

/** 校验单件是否存在状态与开封日期冲突 */
export function detectItemDataConflict(item) {
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
 * 独立判断单件的「待记录使用状态」与「有效期信息待完善」（严格互斥、不重复计入）
 */
export function getItemExpiryCompleteness(item) {
  const status = item?.status || 'unrecorded';
  const conflict = detectItemDataConflict(item);
  const isPendingStatus = status === 'unrecorded' && !conflict.hasConflict;

  if (status === 'used_up' || status === 'disposed' || status === 'transferred' || status === 'unrecorded' || conflict.hasConflict) {
    return {
      status,
      isPendingStatus,
      isIncompleteExpiry: false,
      isComplete: status !== 'unrecorded' && !conflict.hasConflict,
      missingReason: '',
      conflict,
    };
  }

  const resolved = resolveItemExpiryForDisplay(item);
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
    if (!hasMfg && !hasShelf) missingReason = '缺生产日期与未开封保质期（或直接确认到期日）';
    else if (!hasMfg) missingReason = '缺生产日期（或直接确认到期日）';
    else if (!hasShelf) missingReason = '缺未开封保质期（或直接确认到期日）';
  } else if (status === 'in_use') {
    const hasOpened = Boolean(String(item?.openedDate || '').trim());
    const hasPao = Boolean(item?.paoMonths);
    if (!hasOpened && !hasPao) missingReason = '缺开封日期与 PAO（或直接确认到期日）';
    else if (!hasPao) missingReason = '缺 PAO 期限（或直接确认到期日）';
    else if (!hasOpened) missingReason = '缺开封日期（或直接确认到期日）';
  } else if (status === 'idle') {
    missingReason = '缺 PAO / 保质期（或直接确认到期日）';
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

export const STATUS_FILTER_META = Object.freeze({
  all: { key: 'all', label: '当前拥有' },
  in_use: { key: 'in_use', label: '使用中' },
  unopened: { key: 'unopened', label: '未开封' },
  pending: { key: 'pending', label: '待补充信息' },
  pending_status: { key: 'pending_status', label: '待记录使用状态' },
  incomplete_expiry: { key: 'incomplete_expiry', label: '有效期信息待完善' },
  near: { key: 'near', label: '临期/过期' },
  used_up: { key: 'used_up', label: '已用完记录' },
});

export function summarizeProductCounts(product, items, { today = todayStr(), nearDays = null } = {}) {
  const activeItems = items.filter((i) => i.productId === product.id && !i.archivedAt && !i.deletedAt);
  const heldItems = activeItems.filter((i) => isHeldStatus(i.status));
  // 历史用完同时涵盖已用完及曾归档的旧用完记录（不计入当前拥有，但保留历史展示）
  const usedUpItems = items.filter((i) => i.productId === product.id && !i.deletedAt && i.status === 'used_up');

  let inUseCount = 0;
  let unopenedCount = 0;
  let idleCount = 0;
  let unrecordedCount = 0;
  let pendingStatusCount = 0;
  let incompleteExpiryCount = 0;
  let conflictCount = 0;
  let nearExpiryCount = 0;
  let expiredCount = 0;

  for (const item of heldItems) {
    if (item.status === 'in_use') inUseCount += 1;
    else if (item.status === 'unopened') unopenedCount += 1;
    else if (item.status === 'idle') idleCount += 1;
    else if (item.status === 'unrecorded') unrecordedCount += 1;

    const comp = getItemExpiryCompleteness(item);
    if (comp.conflict.hasConflict) conflictCount += 1;
    if (comp.isPendingStatus) pendingStatusCount += 1;
    if (comp.isIncompleteExpiry) incompleteExpiryCount += 1;

    const st = expiryStatus(resolveItemExpiryForDisplay(item), today, nearDays);
    if (st.key === 'near') nearExpiryCount += 1;
    else if (st.key === 'expired') expiredCount += 1;
  }

  return {
    heldCount: heldItems.length,
    inUseCount,
    unopenedCount,
    idleCount,
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

export function filterProductItems(product, items, filterKey = 'all', { today = todayStr(), nearDays = null } = {}) {
  const key = STATUS_FILTER_META[filterKey] ? filterKey : 'all';
  const pool =
    key === 'used_up'
      ? items.filter((i) => i.productId === product.id && !i.deletedAt)
      : items.filter((i) => i.productId === product.id && !i.archivedAt && !i.deletedAt);

  const matchedItems = pool.filter((item) => {
    if (key === 'used_up') return item.status === 'used_up';
    if (!isHeldStatus(item.status)) return false;
    if (key === 'all') return true;
    if (key === 'in_use') return item.status === 'in_use' || item.status === 'idle';
    if (key === 'unopened') return item.status === 'unopened';
    if (key === 'pending_status') return getItemExpiryCompleteness(item).isPendingStatus;
    if (key === 'incomplete_expiry') return getItemExpiryCompleteness(item).isIncompleteExpiry;
    if (key === 'pending') {
      const comp = getItemExpiryCompleteness(item);
      return comp.isPendingStatus || comp.isIncompleteExpiry;
    }
    if (key === 'near') {
      const exp = expiryStatus(resolveItemExpiryForDisplay(item), today, nearDays);
      return exp.key === 'near' || exp.key === 'expired';
    }
    return false;
  });

  let matchedInUseCount = 0;
  let matchedUnopenedCount = 0;
  let matchedPendingStatusCount = 0;
  let matchedIncompleteExpiryCount = 0;
  let matchedUsedUpCount = 0;
  let matchedExpiredCount = 0;
  let matchedNearCount = 0;
  const matchedMissingReasons = [];

  for (const item of matchedItems) {
    if (item.status === 'in_use' || item.status === 'idle') matchedInUseCount += 1;
    else if (item.status === 'unopened') matchedUnopenedCount += 1;
    else if (item.status === 'used_up') matchedUsedUpCount += 1;

    const comp = getItemExpiryCompleteness(item);
    if (comp.isPendingStatus) matchedPendingStatusCount += 1;
    if (comp.isIncompleteExpiry) {
      matchedIncompleteExpiryCount += 1;
      if (comp.missingReason && !matchedMissingReasons.includes(comp.missingReason)) {
        matchedMissingReasons.push(comp.missingReason);
      }
    }

    if (item.status !== 'used_up') {
      const exp = expiryStatus(resolveItemExpiryForDisplay(item), today, nearDays);
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
    matchedPendingStatusCount,
    matchedIncompleteExpiryCount,
    matchedMissingReasons,
    matchedUsedUpCount,
    matchedExpiredCount,
    matchedNearCount,
  };
}

export function evaluateQuickStatusOption(item, targetStatus) {
  const cur = item?.status || 'unrecorded';
  if (targetStatus === 'unrecorded') {
    return { allowed: false, isCurrent: cur === 'unrecorded', requiresConfirm: false, reason: '未记录仅作系统默认状态，不可手动选择。' };
  }
  if (cur === targetStatus) {
    return { allowed: true, isCurrent: true, requiresConfirm: false, reason: '' };
  }
  if (targetStatus === 'unopened') {
    if (cur === 'used_up') {
      return { allowed: false, isCurrent: false, requiresConfirm: false, reason: '已用完产品不能直接改为未开封，请先恢复为使用中。' };
    }
    if (cur === 'in_use' || cur === 'idle') {
      return { allowed: true, isCurrent: false, requiresConfirm: 'restore_unopened', reason: '' };
    }
    return { allowed: true, isCurrent: false, requiresConfirm: false, reason: '' };
  }
  if (targetStatus === 'in_use') {
    if (cur === 'used_up') return { allowed: true, isCurrent: false, requiresConfirm: 'restore_in_use', reason: '' };
    if (cur === 'unopened') return { allowed: true, isCurrent: false, requiresConfirm: 'open_today', reason: '' };
    return { allowed: true, isCurrent: false, requiresConfirm: false, reason: '' };
  }
  if (targetStatus === 'used_up') {
    return { allowed: true, isCurrent: false, requiresConfirm: 'mark_used_up', reason: '' };
  }
  return { allowed: false, isCurrent: false, requiresConfirm: false, reason: '当前产品状态不支持此操作。' };
}

export function hasLifecycleRecord(item) {
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
      item.purchaseDate ||
      hasPrice ||
      item.acquisitionMethod ||
      item.acquisitionPreset ||
      item.acquisitionCustomText ||
      hasRemainingUsed,
  );
}

/**
 * 统一的交互层状态与字段一致性校验（C1 已验收规则落地至正式 store）
 */
export function validateItemTransitionAndFields({ previousItem = null, nextInput }) {
  const rawStatus = String(nextInput?.status || '').trim();
  let targetStatus = rawStatus;
  const openedDate = String(nextInput?.openedDate || '').trim() || null;
  let usedUpDate = String(nextInput?.usedUpDate || '').trim() || null;
  const manufactureDate = String(nextInput?.manufactureDate || '').trim() || null;
  const purchaseDate = String(nextInput?.purchaseDate || '').trim() || null;
  const unopenedShelfMonths = nextInput?.unopenedShelfMonths ? String(nextInput.unopenedShelfMonths).trim() : '';
  const paoMonths = nextInput?.paoMonths ? String(nextInput.paoMonths).trim() : '';
  const confirmedExpiryDate = String(nextInput?.confirmedExpiryDate || '').trim() || null;

  const remainingRaw =
    nextInput?.remainingPercent === '' || nextInput?.remainingPercent === null || nextInput?.remainingPercent === undefined
      ? (targetStatus === 'used_up' ? 0 : 100)
      : Number.parseInt(String(nextInput.remainingPercent), 10);
  if (!Number.isInteger(remainingRaw) || remainingRaw < 0 || remainingRaw > 100) {
    return { ok: false, error: '剩余比例必须在 0 到 100 之间。' };
  }

  const nextHasLifecycle = hasLifecycleRecord({
    ...nextInput,
    manufactureDate,
    unopenedShelfMonths,
    openedDate,
    usedUpDate,
    paoMonths,
    confirmedExpiryDate,
    purchaseDate,
    remainingPercent: remainingRaw,
  });

  if (!targetStatus || targetStatus === 'unrecorded') {
    if (rawStatus === 'unrecorded' && openedDate) {
      return { ok: false, error: '使用状态为「未记录」时不能存在开封日期，请改为「使用中」或清空开封日期。' };
    }
    if (previousItem && previousItem.status && previousItem.status !== 'unrecorded') {
      return { ok: false, error: '已有记录的产品不能改为未记录，请选择未开封、使用中或已用完。' };
    }
    if (!nextHasLifecycle) targetStatus = 'unrecorded';
    else if (usedUpDate || remainingRaw === 0) targetStatus = 'used_up';
    else if (openedDate) targetStatus = 'in_use';
    else targetStatus = 'unopened';
  }

  if (!ITEM_STATUSES[targetStatus]) {
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
  if (targetStatus === 'in_use' && !openedDate) {
    return { ok: false, error: '「使用中」状态必须填写有效的开封日期。' };
  }
  if (targetStatus === 'used_up') {
    if (!usedUpDate) usedUpDate = todayStr();
    if (openedDate && isValidDate(openedDate) && isValidDate(usedUpDate) && usedUpDate < openedDate) {
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
      purchaseDate,
      remainingPercent: targetStatus === 'used_up' ? 0 : remainingRaw,
    },
  };
}

export function uid(prefix = 'id') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function createEmptyState(prevSettings = {}) {
  return {
    version: 2,
    categories: [
      { id: 'cat-base', name: '底妆', sortOrder: 1, isSystem: true },
      { id: 'cat-lip', name: '唇妆', sortOrder: 2, isSystem: true },
      { id: 'cat-eye', name: '眼妆', sortOrder: 3, isSystem: true },
      { id: 'cat-cheek', name: '腮红修容', sortOrder: 4, isSystem: true },
      { id: 'cat-brow', name: '眉妆', sortOrder: 5, isSystem: true },
      { id: 'cat-care', name: '护肤', sortOrder: 6, isSystem: true },
    ],
    brands: [],
    mediaAssets: [],
    products: [],
    productPhotos: [],
    productItems: [],
    looks: [],
    lookPhotos: [],
    lookProductItems: [],
    wearReviews: [],
    routines: [],
    routineLogs: [],
    productUsageLogs: [],
    skinDiaries: [],
    settings: {
      onboardingDismissed: true,
      nearExpiryDays: prevSettings.nearExpiryDays ?? null,
      homeSelectedCurrency: isSupportedCurrency(prevSettings.homeSelectedCurrency) ? prevSettings.homeSelectedCurrency : 'CNY',
      enableForeignCurrency: Boolean(prevSettings.enableForeignCurrency),
      simulatedSubscription: prevSettings.simulatedSubscription || 'free',
      icloudEnabledMock: false,
      lastMockBackupAt: null,
    },
  };
}

export class PrototypeStore {
  constructor({ storage = null, mediaOps = null } = {}) {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.mediaOps = mediaOps || {
      saveBlob: saveMediaBlob,
      deleteBlob: deleteMediaBlob,
      clearAllBlobs: clearAllMediaBlobs,
      hydrateAssets: hydrateMediaAssets,
      readDimensions: readImageDimensions,
      validateFile: validateImageFile,
      resolveUrl: resolveMediaUrl,
    };
    this.listeners = new Set();
    this.state = this.loadState();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) fn(this.state);
  }

  loadState() {
    if (this.storage) {
      try {
        const raw = this.storage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.products)) {
            return this.normalizeState(parsed);
          }
        }
      } catch {
        // 损坏的模拟数据则重新使用默认演示数据
      }
    }
    const seed = this.normalizeState(createSeedData());
    this.saveRawState(seed);
    return seed;
  }

  /** 向后兼容旧版 localStorage 缓存字段并执行 version 1 -> 2 迁移，绝不清空用户已有记录 */
  normalizeState(state) {
    state.settings = state.settings && typeof state.settings === 'object' ? state.settings : {};
    if (!isSupportedCurrency(state.settings.homeSelectedCurrency)) {
      state.settings.homeSelectedCurrency = 'CNY';
    }
    if (state.settings.enableForeignCurrency === undefined) {
      state.settings.enableForeignCurrency = false;
    }
    if (!Array.isArray(state.categories)) state.categories = [];
    if (!state.categories.some((c) => c.id === 'cat-brow')) {
      state.categories.push({ id: 'cat-brow', name: '眉妆', sortOrder: 5, isSystem: true });
    }
    if (!Array.isArray(state.products)) state.products = [];
    for (const prod of state.products) {
      if (prod.deletedAt === undefined) prod.deletedAt = null;
      if (prod.purgeAt === undefined) prod.purgeAt = null;
      if (prod.subCategoryId === undefined) prod.subCategoryId = '';
      if (prod.customName === undefined) prod.customName = prod.name || '';
      if (!prod.quantityUnit) {
        prod.quantityUnit = findSubCategoryInfo(prod.categoryId, prod.subCategoryId).defaultUnit || '件';
      }
      if (prod.specificationValue === undefined && prod.specification) {
        const parts = parseSpecificationParts(prod.specification);
        prod.specificationValue = parts.value;
        prod.specificationUnit = parts.unit;
        prod.specificationCustomUnit = parts.customUnit;
      }
    }
    if (!Array.isArray(state.productItems)) state.productItems = [];
    for (const item of state.productItems) {
      if (!item.acquisitionMethod && item.purchaseChannel) {
        const norm = normalizeAcquisitionMethod(item.purchaseChannel);
        item.acquisitionMethod = norm.acquisitionMethod;
      }
      if (item.unopenedComputedExpiry === undefined || item.openedComputedExpiry === undefined) {
        const dual = deriveComputedExpiry(item);
        item.unopenedComputedExpiry = dual.unopenedComputedExpiry;
        item.openedComputedExpiry = dual.openedComputedExpiry;
      }
      if (item.usedUpDate === undefined) {
        item.usedUpDate = item.status === 'used_up' ? ((item.updatedAt || '').slice(0, 10) || null) : null;
      }
      if (item.deletedAt === undefined) item.deletedAt = null;
    }
    if (!Array.isArray(state.looks)) state.looks = [];
    for (const look of state.looks) {
      if (look.deletedAt === undefined) look.deletedAt = null;
      if (look.purgeAt === undefined) look.purgeAt = null;
    }
    state.version = 2;
    return state;
  }

  saveRawState(state, entityType = 'state') {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      const err = new PrototypeSaveError(
        'localstorage_write_failed',
        e,
        `本地存储写入失败（${e?.name || 'StorageError'}: ${e?.message || '可能是无痕模式或存储空间不足'}）`,
      );
      recordDiagnostic('localstorage_write_failed', err, { entityType, storageMode: 'localStorage' });
      throw err;
    }
  }

  persist(entityType = 'state') {
    this.saveRawState(this.state, entityType);
    this.notify();
  }

  failValidation(entityType, field, error) {
    recordDiagnostic('form_validation_failed', new Error(error), { entityType, field });
    return { ok: false, stage: 'form_validation_failed', error };
  }

  runPersistMutation(entityType, mutator) {
    const snapshotJson = JSON.stringify(this.state);
    try {
      const result = mutator();
      this.persist(entityType);
      return result;
    } catch (e) {
      this.state = JSON.parse(snapshotJson);
      const stage = e?.stage || 'unexpected_save_error';
      if (!e?.stage) {
        recordDiagnostic(stage, e, { entityType });
      }
      return {
        ok: false,
        stage,
        errorName: e?.originalName || e?.name || 'Error',
        error: e?.message || '保存失败，请查看诊断日志',
      };
    }
  }

  async hydrateMedia() {
    const res = await this.mediaOps.hydrateAssets(this.state.mediaAssets);
    this.notify();
    return res;
  }

  /** 将用户选择的文件保存为 IndexedDB Blob，并登记元数据（区分各阶段异常，绝不吞错） */
  async addImageFileAsset(file) {
    const err = this.mediaOps.validateFile(file);
    if (err) {
      recordDiagnostic('form_validation_failed', new Error(err), {
        entityType: 'media_asset',
        field: 'imageFile',
        fileType: file?.type || '',
        fileSize: file?.size || 0,
      });
      throw new PrototypeSaveError('form_validation_failed', new Error(err), err);
    }
    const id = uid('asset');
    await this.mediaOps.saveBlob(id, file);
    const dims = await this.mediaOps.readDimensions(file).catch(() => ({ width: 0, height: 0 }));
    const asset = {
      id,
      kind: 'idb',
      mimeType: file.type || 'image/jpeg',
      byteSize: file.size || 0,
      width: dims.width || 0,
      height: dims.height || 0,
      createdAt: new Date().toISOString(),
    };
    const prevAssets = [...this.state.mediaAssets];
    this.state.mediaAssets.push(asset);
    try {
      this.persist('media_asset');
    } catch (persistErr) {
      this.state.mediaAssets = prevAssets;
      await this.mediaOps.deleteBlob(id).catch(() => {});
      throw persistErr;
    }
    return asset;
  }

  getAssetById(assetId) {
    return this.state.mediaAssets.find((a) => a.id === assetId) || null;
  }

  getAssetUrl(assetId) {
    const asset = this.getAssetById(assetId);
    return this.mediaOps.resolveUrl(asset);
  }

  getCategoryName(categoryId) {
    return this.state.categories.find((c) => c.id === categoryId)?.name || '未分类';
  }

  getBrandName(brandId) {
    if (!brandId) return '';
    return this.state.brands.find((b) => b.id === brandId)?.name || '';
  }

  ensureBrandId(brandName) {
    const clean = (brandName || '').trim();
    if (!clean) return null;
    const norm = clean.toLowerCase();
    const existing = this.state.brands.find((b) => b.name.trim().toLowerCase() === norm);
    if (existing) return existing.id;
    const brand = { id: uid('brand'), name: clean };
    this.state.brands.push(brand);
    return brand.id;
  }

  /* ---------------- 产品照片唯一真相源逻辑 ---------------- */

  getProductPhotos(productId) {
    return this.state.productPhotos
      .filter((p) => p.productId === productId)
      .sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * 封面图查询：优先 isCover === true；若无封面但仍有照片则按 sortOrder/createdAt 兜底展示；无照片返回 null
   */
  getProductCoverPhoto(productId) {
    const photos = this.state.productPhotos.filter((p) => p.productId === productId);
    if (photos.length === 0) return null;
    const cover = photos.find((p) => p.isCover === true);
    if (cover) return cover;
    const sorted = [...photos].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
    return sorted[0];
  }

  setProductCover(productId, photoId) {
    const target = this.state.productPhotos.find((p) => p.id === photoId && p.productId === productId);
    if (!target) throw new Error('照片不存在');
    for (const p of this.state.productPhotos) {
      if (p.productId === productId) {
        p.isCover = p.id === photoId;
      }
    }
    this.persist();
  }

  clearProductCover(productId) {
    for (const p of this.state.productPhotos) {
      if (p.productId === productId) p.isCover = false;
    }
    this.persist();
  }

  addProductPhoto(productId, assetId, { makeCover = false } = {}) {
    const exists = this.state.productPhotos.find((p) => p.productId === productId && p.assetId === assetId);
    if (exists) return exists;
    const current = this.state.productPhotos.filter((p) => p.productId === productId);
    const hasCover = current.some((p) => p.isCover === true);
    const shouldCover = makeCover || !hasCover;
    if (shouldCover) {
      for (const p of current) p.isCover = false;
    }
    const maxOrder = current.reduce((m, p) => Math.max(m, p.sortOrder), -1);
    const photo = {
      id: uid('pp'),
      productId,
      assetId,
      sortOrder: maxOrder + 1,
      isCover: shouldCover,
      createdAt: new Date().toISOString(),
    };
    this.state.productPhotos.push(photo);
    this.persist();
    return photo;
  }

  async removeProductPhoto(productId, photoId) {
    const idx = this.state.productPhotos.findIndex((p) => p.id === photoId && p.productId === productId);
    if (idx === -1) return;
    const [removed] = this.state.productPhotos.splice(idx, 1);
    this.persist();
    await this.cleanupOrphanAsset(removed.assetId);
  }

  isAssetReferenced(assetId) {
    if (!assetId) return false;
    return (
      this.state.productPhotos.some((p) => p.assetId === assetId) ||
      this.state.lookPhotos.some((p) => p.assetId === assetId) ||
      this.state.looks.some((l) => l.coverAssetId === assetId) ||
      this.state.wearReviews.some((w) => w.assetId === assetId) ||
      this.state.skinDiaries.some((d) => Array.isArray(d.photoAssetIds) && d.photoAssetIds.includes(assetId))
    );
  }

  async cleanupOrphanAsset(assetId) {
    if (!assetId || this.isAssetReferenced(assetId)) return false;
    const assetIdx = this.state.mediaAssets.findIndex((a) => a.id === assetId);
    if (assetIdx === -1) return false;
    const [asset] = this.state.mediaAssets.splice(assetIdx, 1);
    this.persist();
    if (asset.kind === 'idb') {
      try {
        await this.mediaOps.deleteBlob(asset.id);
      } catch {
        // 原型中仅静默容错清理
      }
    }
    return true;
  }

  /* ---------------- 产品与单件管理 CRUD（含 7 天回收站） ---------------- */

  getActiveProducts() {
    return this.state.products.filter((p) => !p.archivedAt && !p.deletedAt);
  }

  getItemsForProduct(productId, { includeArchived = true, includeDeleted = false } = {}) {
    return this.state.productItems
      .filter((i) => i.productId === productId && (includeDeleted || !i.deletedAt) && (includeArchived || !i.archivedAt))
      .sort((a, b) => Number(!a.archivedAt) - Number(!b.archivedAt) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  }

  getTrashProducts(now = new Date()) {
    const nowMs = this._toNowMs(now);
    const retentionMs = PRODUCT_TRASH_RETENTION_DAYS * 86400000;
    return this.state.products
      .filter((p) => Boolean(p.deletedAt))
      .map((p) => {
        const purgeMs = Number.isFinite(Date.parse(p.purgeAt || ''))
          ? Date.parse(p.purgeAt)
          : Date.parse(p.deletedAt) + retentionMs;
        const remainingMs = Math.max(0, purgeMs - nowMs);
        const remainingDays = Math.max(0, Math.ceil(remainingMs / 86400000));
        const items = this.state.productItems.filter((i) => i.productId === p.id && !i.deletedAt);
        const heldCount = items.filter((i) => !i.archivedAt && isHeldStatus(i.status)).length;
        return { product: p, totalItemCount: items.length, heldCount, remainingDays, expired: nowMs >= purgeMs };
      })
      .sort((a, b) => String(b.product.deletedAt).localeCompare(String(a.product.deletedAt)));
  }

  _buildProductNameFields(input, categoryId, existing = null) {
    const catName = this.getCategoryName(categoryId);
    const subCategoryId = (input.subCategoryId ?? existing?.subCategoryId ?? '').trim();
    const { subCategoryName, defaultUnit } = findSubCategoryInfo(categoryId, subCategoryId);
    const customName =
      input.customName !== undefined
        ? String(input.customName || '').trim()
        : input.name !== undefined
          ? String(input.name || '').trim()
          : String(existing?.customName || '').trim();
    const brandName = input.brandName !== undefined ? String(input.brandName || '').trim() : this.getBrandName(existing?.brandId);
    const shade = input.shade !== undefined ? String(input.shade || '').trim() : String(existing?.shade || '').trim();
    const resolvedName = composeProductDisplayName({
      customName,
      brandName,
      categoryName: catName,
      subCategoryName,
      shade,
    });
    const quantityUnit = (input.quantityUnit ?? existing?.quantityUnit ?? '').trim() || defaultUnit || '件';
    return { customName, subCategoryId, shade, resolvedName, quantityUnit };
  }

  saveProduct(input) {
    const categoryId = (input.categoryId || '').trim();
    if (!categoryId || !this.state.categories.some((c) => c.id === categoryId)) {
      return this.failValidation('product', 'categoryId', '请选择产品分类');
    }

    return this.runPersistMutation('product', () => {
      const now = new Date().toISOString();
      const brandId = this.ensureBrandId(input.brandName || '');
      const existing = input.id ? this.state.products.find((p) => p.id === input.id) : null;
      if (input.id && !existing) return { ok: false, error: '未找到要编辑的产品' };

      const { customName, subCategoryId, shade, resolvedName, quantityUnit } = this._buildProductNameFields(input, categoryId, existing);
      const specStr = formatSpecification({
        value: input.specificationValue,
        unit: input.specificationUnit,
        customUnit: input.specificationCustomUnit,
        fallback: input.specification,
      });

      if (existing) {
        existing.name = resolvedName;
        existing.customName = customName;
        existing.categoryId = categoryId;
        existing.subCategoryId = subCategoryId;
        existing.brandId = brandId;
        existing.quantityUnit = quantityUnit;
        existing.specification = specStr;
        existing.specificationValue = (input.specificationValue || '').trim();
        existing.specificationUnit = (input.specificationUnit || '').trim();
        existing.specificationCustomUnit = (input.specificationCustomUnit || '').trim();
        existing.shade = shade;
        existing.texture = (input.texture || '').trim();
        existing.finish = (input.finish || '').trim();
        existing.notesPrivate = (input.notesPrivate || '').trim();
        existing.updatedAt = now;
        if (input.newAssetId) {
          this.addProductPhoto(existing.id, input.newAssetId, { makeCover: Boolean(input.makeNewPhotoCover) });
        }
        return { ok: true, product: existing };
      }

      const product = {
        id: uid('prod'),
        brandId,
        categoryId,
        subCategoryId,
        name: resolvedName,
        customName,
        quantityUnit,
        specification: specStr,
        specificationValue: (input.specificationValue || '').trim(),
        specificationUnit: (input.specificationUnit || '').trim(),
        specificationCustomUnit: (input.specificationCustomUnit || '').trim(),
        shade,
        texture: (input.texture || '').trim(),
        finish: (input.finish || '').trim(),
        notesPrivate: (input.notesPrivate || '').trim(),
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        deletedAt: null,
        purgeAt: null,
      };
      this.state.products.push(product);
      if (input.newAssetId) {
        this.addProductPhoto(product.id, input.newAssetId, { makeCover: true });
      }
      return { ok: true, product };
    });
  }

  /**
   * 原子保存连续单页「+ 添加产品」及其名下 1~N 件 ProductItem（默认跳过详情时自动记为未记录）。
   */
  saveProductWithItems({ productInput = {}, quantity = 1, batchMode = 'same', itemInputs = [] } = {}) {
    const qty = Number.parseInt(String(quantity ?? 1), 10);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
      return this.failValidation('product', 'quantity', '拥有数量必须在 1 到 20 之间');
    }
    const categoryId = String(productInput.categoryId || '').trim();
    if (!categoryId || !this.state.categories.some((c) => c.id === categoryId)) {
      return this.failValidation('product', 'categoryId', '请选择产品分类');
    }

    const now = new Date().toISOString();
    const pendingItems = [];
    for (let i = 0; i < qty; i++) {
      const src = batchMode === 'per_item' ? (itemInputs[i] || {}) : (itemInputs[0] || {});
      const check = validateItemTransitionAndFields({ previousItem: null, nextInput: src });
      if (!check.ok) {
        return this.failValidation('product_item', 'status', `第 ${i + 1} 件校验未通过：${check.error}`);
      }
      const built = this._buildValidatedItemRecord({
        productId: 'pending',
        targetPrev: null,
        input: {
          ...src,
          ...check.normalized,
        },
        now,
      });
      if (!built.ok) {
        return this.failValidation('product_item', built.field || 'item', `第 ${i + 1} 件信息无效：${built.error}`);
      }
      pendingItems.push(built.record);
    }

    return this.runPersistMutation('product', () => {
      const brandId = this.ensureBrandId(productInput.brandName || '');
      const { customName, subCategoryId, shade, resolvedName, quantityUnit } = this._buildProductNameFields(productInput, categoryId, null);
      const specStr = formatSpecification({
        value: productInput.specificationValue,
        unit: productInput.specificationUnit,
        customUnit: productInput.specificationCustomUnit,
        fallback: productInput.specification,
      });
      const product = {
        id: uid('prod'),
        brandId,
        categoryId,
        subCategoryId,
        name: resolvedName,
        customName,
        quantityUnit,
        specification: specStr,
        specificationValue: (productInput.specificationValue || '').trim(),
        specificationUnit: (productInput.specificationUnit || '').trim(),
        specificationCustomUnit: (productInput.specificationCustomUnit || '').trim(),
        shade,
        texture: (productInput.texture || '').trim(),
        finish: (productInput.finish || '').trim(),
        notesPrivate: (productInput.notesPrivate || '').trim(),
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        deletedAt: null,
        purgeAt: null,
      };
      this.state.products.push(product);
      if (productInput.newAssetId) {
        this.addProductPhoto(product.id, productInput.newAssetId, { makeCover: true });
      }
      const createdItems = [];
      for (const rec of pendingItems) {
        rec.productId = product.id;
        this.state.productItems.push(rec);
        createdItems.push(rec);
      }
      return { ok: true, product, items: createdItems };
    });
  }

  /** 将产品整款移入 7 天最近删除，不影响已记录的历史妆容快照 */
  softDeleteProductToTrash(productId, now = new Date()) {
    const prod = this.state.products.find((p) => p.id === productId);
    if (!prod) return this.failValidation('product', 'id', '产品不存在');
    if (prod.deletedAt) return { ok: true, product: prod };
    const nowMs = this._toNowMs(now);
    const deletedIso = new Date(nowMs).toISOString();
    const purgeIso = new Date(nowMs + PRODUCT_TRASH_RETENTION_DAYS * 86400000).toISOString();
    return this.runPersistMutation('product', () => {
      const target = this.state.products.find((p) => p.id === productId);
      target.deletedAt = deletedIso;
      target.purgeAt = purgeIso;
      target.updatedAt = deletedIso;
      return { ok: true, product: target };
    });
  }

  /** 按产品 UUID 精确恢复，绝不覆盖或合并用户后来新建的同款产品 */
  restoreProductFromTrash(productId) {
    const prod = this.state.products.find((p) => p.id === productId);
    if (!prod) return this.failValidation('product', 'id', '产品不存在');
    if (!prod.deletedAt) return { ok: true, product: prod };
    const nowIso = new Date().toISOString();
    return this.runPersistMutation('product', () => {
      const target = this.state.products.find((p) => p.id === productId);
      target.deletedAt = null;
      target.purgeAt = null;
      target.updatedAt = nowIso;
      return { ok: true, product: target };
    });
  }

  async permanentlyDeleteProductFromTrash(productId) {
    return this.deleteProductSafe(productId);
  }

  toggleArchiveProduct(productId) {
    const prod = this.state.products.find((p) => p.id === productId);
    if (!prod) return { ok: false, error: '产品不存在' };
    const now = new Date().toISOString();
    if (prod.archivedAt) {
      prod.archivedAt = null;
      prod.updatedAt = now;
    } else {
      prod.archivedAt = now;
      prod.updatedAt = now;
      for (const item of this.state.productItems) {
        if (item.productId === productId && !item.archivedAt) {
          item.archivedAt = now;
          item.updatedAt = now;
        }
      }
    }
    this.persist();
    return { ok: true, product: prod };
  }

  /**
   * 安全删除产品主档：
   * - 同步清理名下持有实例与产品照片（仅当图片无其他记录引用时才删 Blob）
   * - 历史妆容、日常流程与使用记录采用 ON DELETE SET NULL 解绑外键，完整保留历史快照，绝不破坏历史记录
   */
  async deleteProductSafe(productId) {
    const prod = this.state.products.find((p) => p.id === productId);
    if (!prod) return this.failValidation('product', 'id', '产品不存在');

    const itemIds = new Set(this.state.productItems.filter((i) => i.productId === productId).map((i) => i.id));
    const photoAssets = this.state.productPhotos.filter((p) => p.productId === productId).map((p) => p.assetId);
    const affectedLookIds = new Set(
      this.state.lookProductItems.filter((lpi) => itemIds.has(lpi.productItemId)).map((lpi) => lpi.lookId),
    );

    const res = this.runPersistMutation('product', () => {
      for (const lpi of this.state.lookProductItems) {
        if (itemIds.has(lpi.productItemId)) lpi.productItemId = null;
      }
      for (const rt of this.state.routines) {
        for (const st of rt.steps) {
          for (const sp of st.products) {
            if (itemIds.has(sp.productItemId)) sp.productItemId = null;
          }
        }
      }
      for (const rlog of this.state.routineLogs) {
        for (const rli of rlog.items) {
          if (itemIds.has(rli.productItemId)) rli.productItemId = null;
        }
      }
      this.state.productItems = this.state.productItems.filter((i) => i.productId !== productId);
      this.state.productPhotos = this.state.productPhotos.filter((p) => p.productId !== productId);
      this.state.products = this.state.products.filter((p) => p.id !== productId);
      return { ok: true, unlinkedLookCount: affectedLookIds.size };
    });

    if (!res.ok) return res;
    for (const aid of photoAssets) {
      await this.cleanupOrphanAsset(aid);
    }
    return res;
  }

  _buildValidatedItemRecord({ productId, targetPrev = null, input, now }) {
    const status = input.status || 'unrecorded';
    if (!ITEM_STATUSES[status]) return this.failValidation('product_item', 'status', '请选择有效的使用状态');

    let purchasePriceMinor = null;
    let currencyCode = null;
    const priceInput = (input.purchasePriceInput ?? '').trim();
    const selectedCode = (input.currencyCode || '').trim();

    if (priceInput !== '' || (selectedCode !== '' && !isSupportedCurrency(selectedCode))) {
      if (!selectedCode) return this.failValidation('product_item', 'currencyCode', '请选择购买币种');
      if (!isSupportedCurrency(selectedCode)) {
        return this.failValidation('product_item', 'currencyCode', UNSUPPORTED_MESSAGE);
      }
      const parsed = parseAmountToMinor(priceInput, selectedCode);
      if (!parsed.ok) return this.failValidation('product_item', 'purchasePriceInput', parsed.error);
      purchasePriceMinor = parsed.minor;
      currencyCode = parsed.currencyCode;
    } else if (selectedCode !== '') {
      if (!isSupportedCurrency(selectedCode)) return this.failValidation('product_item', 'currencyCode', UNSUPPORTED_MESSAGE);
      currencyCode = selectedCode;
    }

    const checkDate = (val, field, label) => {
      const s = (val || '').trim();
      if (!s) return { ok: true, value: null };
      if (!isValidDate(s)) return this.failValidation('product_item', field, `${label}格式应为 YYYY-MM-DD`);
      return { ok: true, value: s };
    };
    const checkMonths = (val, field, label) => {
      const s = String(val ?? '').trim();
      if (!s) return { ok: true, value: null };
      if (!/^\d+$/.test(s)) return this.failValidation('product_item', field, `${label}必须为正整数月数`);
      const n = Number.parseInt(s, 10);
      if (!isPositiveIntMonths(n)) return this.failValidation('product_item', field, `${label}必须大于 0 个月`);
      return { ok: true, value: n };
    };

    const pd = checkDate(input.purchaseDate, 'purchaseDate', '购买日期');
    if (!pd.ok) return pd;
    const md = checkDate(input.manufactureDate, 'manufactureDate', '生产日期');
    if (!md.ok) return md;
    const od = checkDate(input.openedDate, 'openedDate', '开封日期');
    if (!od.ok) return od;
    const ud = checkDate(input.usedUpDate, 'usedUpDate', '用完日期');
    if (!ud.ok) return ud;
    const cd = checkDate(input.confirmedExpiryDate, 'confirmedExpiryDate', '用户确认到期日');
    if (!cd.ok) return cd;
    const sm = checkMonths(input.unopenedShelfMonths, 'unopenedShelfMonths', '未开封保质期');
    if (!sm.ok) return sm;
    const pm = checkMonths(input.paoMonths, 'paoMonths', '开封后使用期限（PAO）');
    if (!pm.ok) return pm;

    let finalUsedUpDate = null;
    if (status === 'used_up') {
      finalUsedUpDate = ud.value || (targetPrev?.status === 'used_up' ? targetPrev.usedUpDate : null) || todayStr();
      if (od.value && finalUsedUpDate < od.value) {
        return this.failValidation('product_item', 'usedUpDate', '用完日期不能早于开封日期');
      }
    }

    const remRaw = input.remainingPercent === '' || input.remainingPercent === null || input.remainingPercent === undefined
      ? (status === 'used_up' ? 0 : 100)
      : Number.parseInt(String(input.remainingPercent), 10);
    if (!Number.isInteger(remRaw) || remRaw < 0 || remRaw > 100) {
      return this.failValidation('product_item', 'remainingPercent', '剩余比例必须在 0 到 100 之间');
    }

    const draftDates = {
      manufactureDate: md.value,
      unopenedShelfMonths: sm.value,
      openedDate: od.value,
      paoMonths: pm.value,
      confirmedExpiryDate: cd.value,
    };
    const computed = deriveComputedExpiry(draftDates);
    const confirmation = applyExpiryConfirmation(targetPrev, draftDates, now);
    const acqInput = input.acquisitionMethod !== undefined
      ? input.acquisitionMethod
      : (input.acquisitionPreset !== undefined || input.acquisitionCustomText !== undefined)
        ? { preset: input.acquisitionPreset, customText: input.acquisitionCustomText }
        : input.purchaseChannel;
    const acq = normalizeAcquisitionMethod(acqInput);

    const record = {
      id: targetPrev ? targetPrev.id : uid('item'),
      productId,
      purchasePriceMinor,
      currencyCode,
      purchaseDate: pd.value,
      acquisitionMethod: acq.acquisitionMethod,
      purchaseChannel: acq.purchaseChannel,
      manufactureDate: md.value,
      unopenedShelfMonths: sm.value,
      openedDate: od.value,
      usedUpDate: finalUsedUpDate,
      paoMonths: pm.value,
      unopenedComputedExpiry: computed.unopenedComputedExpiry,
      openedComputedExpiry: computed.openedComputedExpiry,
      computedExpiryDate: computed.computedExpiryDate,
      expiryBasis: computed.expiryBasis,
      confirmedExpiryDate: confirmation.confirmedExpiryDate,
      expiryConfirmedAt: confirmation.expiryConfirmedAt,
      expiryNeedsReconfirm: confirmation.expiryNeedsReconfirm,
      status,
      remainingPercent: status === 'used_up' ? 0 : remRaw,
      lastUsedAt: targetPrev ? targetPrev.lastUsedAt : null,
      createdAt: targetPrev ? targetPrev.createdAt : now,
      updatedAt: now,
      archivedAt: input.archivedAt !== undefined ? input.archivedAt : (targetPrev ? targetPrev.archivedAt : null),
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : (targetPrev ? targetPrev.deletedAt || null : null),
    };
    return { ok: true, record };
  }

  /**
   * 保存或更新 ProductItem。
   * - 金额严格按 currencyCode 精度从十进制字符串转换，绝不自动按 2 位或浮点计算。
   * - 有效期严格遵守不猜测原则，并保护已确认的到期日不被自动覆盖。
   */
  saveProductItem(input) {
    const product = this.state.products.find((p) => p.id === input.productId);
    if (!product) return this.failValidation('product_item', 'productId', '所属产品不存在');

    const prev = input.id ? this.state.productItems.find((i) => i.id === input.id) : null;
    if (input.id && !prev) return this.failValidation('product_item', 'id', '未找到要编辑的产品件记录');

    const now = new Date().toISOString();
    const built = this._buildValidatedItemRecord({
      productId: product.id,
      targetPrev: prev,
      input: { ...input, status: input.status || 'in_use' },
      now,
    });
    if (!built.ok) return built;

    return this.runPersistMutation('product_item', () => {
      const targetPrev = input.id ? this.state.productItems.find((i) => i.id === input.id) : null;
      if (targetPrev) {
        Object.assign(targetPrev, built.record);
      } else {
        this.state.productItems.push(built.record);
      }
      return { ok: true, item: built.record };
    });
  }

  /** 软删除单件产品，保留历史妆容快照与使用记录完整性 */
  softDeleteProductItem(itemId) {
    const item = this.state.productItems.find((i) => i.id === itemId);
    if (!item) return this.failValidation('product_item', 'id', '未找到该件产品');
    const now = new Date().toISOString();
    return this.runPersistMutation('product_item', () => {
      const target = this.state.productItems.find((i) => i.id === itemId);
      target.deletedAt = now;
      target.updatedAt = now;
      return { ok: true, item: target };
    });
  }

  archiveProductItem(itemId) {
    const item = this.state.productItems.find((i) => i.id === itemId);
    if (!item) return { ok: false, error: '实例不存在' };
    const now = new Date().toISOString();
    item.archivedAt = item.archivedAt ? null : now;
    item.updatedAt = now;
    this.persist();
    return { ok: true, item };
  }

  /** 允许将非关联主档记录的孤儿或演示保护机制测试删除，绝不删除历史快照 */
  deleteProductItemSafe(itemId) {
    const item = this.state.productItems.find((i) => i.id === itemId);
    if (!item) return { ok: false, error: '实例不存在' };
    const usedInUsage = this.state.productUsageLogs.some((u) => u.productItemId === itemId);
    if (usedInUsage) {
      return { ok: false, error: '该实例存在使用记录，请使用“归档”保留历史台账，不能直接删除。' };
    }
    // 历史妆容与流程快照采用 ON DELETE SET NULL 语义：置空外键，但快照字段完整保留
    for (const lpi of this.state.lookProductItems) {
      if (lpi.productItemId === itemId) lpi.productItemId = null;
    }
    for (const rt of this.state.routines) {
      for (const st of rt.steps) {
        for (const sp of st.products) {
          if (sp.productItemId === itemId) sp.productItemId = null;
        }
      }
    }
    for (const rlog of this.state.routineLogs) {
      for (const rli of rlog.items) {
        if (rli.productItemId === itemId) rli.productItemId = null;
      }
    }
    this.state.productItems = this.state.productItems.filter((i) => i.id !== itemId);
    this.persist();
    return { ok: true };
  }

  /* ---------------- 妆容、快照与持妆实测 ---------------- */

  buildProductSnapshot(productItemId) {
    const item = this.state.productItems.find((i) => i.id === productItemId);
    if (!item) return null;
    const prod = this.state.products.find((p) => p.id === item.productId);
    if (!prod) return null;
    return {
      productItemId: item.id,
      productNameSnapshot: prod.name,
      brandNameSnapshot: this.getBrandName(prod.brandId),
      shadeSnapshot: prod.shade || '',
      categorySnapshot: this.getCategoryName(prod.categoryId),
    };
  }

  saveLook(input) {
    const name = (input.name || '').trim();
    const lookDate = (input.lookDate || '').trim();
    if (!name) return this.failValidation('look', 'name', '请填写妆容名称');
    if (!isValidDate(lookDate)) return this.failValidation('look', 'lookDate', '请选择有效的妆容日期');
    const dur = input.durationMinutes === '' || input.durationMinutes === null || input.durationMinutes === undefined
      ? null
      : Number.parseInt(String(input.durationMinutes), 10);
    if (dur !== null && (!Number.isInteger(dur) || dur < 0)) {
      return this.failValidation('look', 'durationMinutes', '耗时必须是非负整数分钟');
    }

    return this.runPersistMutation('look', () => {
      const now = new Date().toISOString();
      const assetIds = Array.isArray(input.assetIds) ? input.assetIds.filter(Boolean) : [];
      const coverAssetId = assetIds[0] || null;

      const lookId = input.id || uid('look');
      const look = {
        id: lookId,
        name,
        lookDate,
        style: (input.style || '').trim(),
        scene: (input.scene || '').trim(),
        durationMinutes: dur,
        coverAssetId,
        selfRating: Number(input.selfRating) || 5,
        coordinationRating: Number(input.coordinationRating) || 5,
        colorRating: Number(input.colorRating) || 5,
        wearRating: Number(input.wearRating) || 5,
        tags: Array.isArray(input.tags) ? input.tags : [],
        notesPrivate: (input.notesPrivate || '').trim(),
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        deletedAt: null,
        purgeAt: null,
      };

      if (input.id) {
        const existing = this.state.looks.find((l) => l.id === input.id);
        if (!existing) return { ok: false, error: '妆容不存在' };
        Object.assign(existing, look, {
          createdAt: existing.createdAt,
          deletedAt: existing.deletedAt || null,
          purgeAt: existing.purgeAt || null,
        });
        this.state.lookPhotos = this.state.lookPhotos.filter((lp) => lp.lookId !== lookId);
        this.state.lookProductItems = this.state.lookProductItems.filter((lpi) => lpi.lookId !== lookId);
      } else {
        this.state.looks.push(look);
      }

      assetIds.forEach((aid, idx) => {
        this.state.lookPhotos.push({
          id: uid('lp'),
          lookId,
          assetId: aid,
          photoRole: idx === 0 ? 'finished' : 'detail',
          capturedAt: now,
          sortOrder: idx,
        });
      });

      const selectedItems = Array.isArray(input.selectedItems) ? input.selectedItems : [];
      selectedItems.forEach((sel, idx) => {
        const itemId = typeof sel === 'string' ? sel : sel.productItemId;
        const snap = this.buildProductSnapshot(itemId);
        if (!snap) return;
        this.state.lookProductItems.push({
          id: uid('lpi'),
          lookId,
          productItemId: snap.productItemId,
          stepKey: (typeof sel === 'object' && sel.stepKey) || snap.categorySnapshot || '上妆',
          stepOrder: idx + 1,
          productNameSnapshot: snap.productNameSnapshot,
          brandNameSnapshot: snap.brandNameSnapshot,
          shadeSnapshot: snap.shadeSnapshot,
          categorySnapshot: snap.categorySnapshot,
        });
        const targetItem = this.state.productItems.find((i) => i.id === itemId);
        if (targetItem) {
          targetItem.lastUsedAt = now;
        }
      });

      return { ok: true, look: this.state.looks.find((l) => l.id === lookId) };
    });
  }

  _toNowMs(now = new Date()) {
    if (now instanceof Date) return now.getTime();
    if (typeof now === 'number' && Number.isFinite(now)) return now;
    const parsed = Date.parse(String(now));
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  getActiveLooks() {
    return this.state.looks.filter((l) => !l.archivedAt && !l.deletedAt);
  }

  getTrashLooks(now = new Date()) {
    const nowMs = this._toNowMs(now);
    const retentionMs = LOOK_TRASH_RETENTION_DAYS * 86400000;
    return this.state.looks
      .filter((l) => Boolean(l.deletedAt))
      .map((l) => {
        const purgeMs = Number.isFinite(Date.parse(l.purgeAt || ''))
          ? Date.parse(l.purgeAt)
          : Date.parse(l.deletedAt) + retentionMs;
        const remainingMs = Math.max(0, purgeMs - nowMs);
        const remainingDays = Math.max(0, Math.ceil(remainingMs / 86400000));
        return { look: l, remainingDays, expired: nowMs >= purgeMs };
      })
      .sort((a, b) => String(b.look.deletedAt).localeCompare(String(a.look.deletedAt)));
  }

  softDeleteLook(lookId, now = new Date()) {
    const look = this.state.looks.find((l) => l.id === lookId);
    if (!look) return this.failValidation('look', 'id', '妆容不存在');
    if (look.deletedAt) return { ok: true, look };
    const nowMs = this._toNowMs(now);
    const deletedIso = new Date(nowMs).toISOString();
    const purgeIso = new Date(nowMs + LOOK_TRASH_RETENTION_DAYS * 86400000).toISOString();
    return this.runPersistMutation('look', () => {
      const target = this.state.looks.find((l) => l.id === lookId);
      target.deletedAt = deletedIso;
      target.purgeAt = purgeIso;
      target.updatedAt = deletedIso;
      return { ok: true, look: target };
    });
  }

  restoreLookFromTrash(lookId) {
    const look = this.state.looks.find((l) => l.id === lookId);
    if (!look) return this.failValidation('look', 'id', '妆容不存在');
    if (!look.deletedAt) return { ok: true, look };
    const nowIso = new Date().toISOString();
    return this.runPersistMutation('look', () => {
      const target = this.state.looks.find((l) => l.id === lookId);
      target.deletedAt = null;
      target.purgeAt = null;
      target.updatedAt = nowIso;
      return { ok: true, look: target };
    });
  }

  _collectLookAssetIds(lookId) {
    const ids = new Set();
    const look = this.state.looks.find((l) => l.id === lookId);
    if (look?.coverAssetId) ids.add(look.coverAssetId);
    for (const lp of this.state.lookPhotos) {
      if (lp.lookId === lookId && lp.assetId) ids.add(lp.assetId);
    }
    for (const wr of this.state.wearReviews) {
      if (wr.lookId === lookId && wr.assetId) ids.add(wr.assetId);
    }
    return [...ids];
  }

  /**
   * 永久删除妆容：绝不删除 Product / ProductItem / 使用记录 / 日记，
   * 仅当关联图片不再被任何其余记录（含回收站内其他妆容、产品照片等）引用时才清理。
   */
  async permanentlyDeleteLook(lookId) {
    const look = this.state.looks.find((l) => l.id === lookId);
    if (!look) return this.failValidation('look', 'id', '妆容不存在');
    const candidateAssets = this._collectLookAssetIds(lookId);
    const res = this.runPersistMutation('look', () => {
      this.state.looks = this.state.looks.filter((l) => l.id !== lookId);
      this.state.lookPhotos = this.state.lookPhotos.filter((lp) => lp.lookId !== lookId);
      this.state.lookProductItems = this.state.lookProductItems.filter((lpi) => lpi.lookId !== lookId);
      this.state.wearReviews = this.state.wearReviews.filter((w) => w.lookId !== lookId);
      return { ok: true, purgedAssetCandidates: candidateAssets };
    });
    if (!res.ok) return res;
    let cleanedAssets = 0;
    for (const aid of candidateAssets) {
      if (await this.cleanupOrphanAsset(aid)) cleanedAssets += 1;
    }
    return { ok: true, cleanedAssets };
  }

  /**
   * 应用启动时检查回收站过期记录（>=7天）并自动永久清理，不依赖后台任务。
   */
  async purgeExpiredLooks(now = new Date()) {
    const nowMs = this._toNowMs(now);
    const retentionMs = LOOK_TRASH_RETENTION_DAYS * 86400000;
    const expiredIds = this.state.looks
      .filter((l) => {
        if (!l.deletedAt) return false;
        const purgeMs = Number.isFinite(Date.parse(l.purgeAt || ''))
          ? Date.parse(l.purgeAt)
          : Date.parse(l.deletedAt) + retentionMs;
        return nowMs >= purgeMs;
      })
      .map((l) => l.id);

    if (expiredIds.length === 0) return { ok: true, purgedCount: 0, purgedIds: [] };

    const expiredSet = new Set(expiredIds);
    const candidateAssets = new Set();
    for (const id of expiredIds) {
      for (const aid of this._collectLookAssetIds(id)) candidateAssets.add(aid);
    }

    const res = this.runPersistMutation('look', () => {
      this.state.looks = this.state.looks.filter((l) => !expiredSet.has(l.id));
      this.state.lookPhotos = this.state.lookPhotos.filter((lp) => !expiredSet.has(lp.lookId));
      this.state.lookProductItems = this.state.lookProductItems.filter((lpi) => !expiredSet.has(lpi.lookId));
      this.state.wearReviews = this.state.wearReviews.filter((w) => !expiredSet.has(w.lookId));
      return { ok: true, purgedCount: expiredIds.length, purgedIds: expiredIds };
    });
    if (!res.ok) return res;

    for (const aid of candidateAssets) {
      await this.cleanupOrphanAsset(aid);
    }
    return res;
  }

  /** 启动时自动永久清理已到期（>=7天）的回收站产品 */
  async purgeExpiredProducts(now = new Date()) {
    const nowMs = this._toNowMs(now);
    const retentionMs = PRODUCT_TRASH_RETENTION_DAYS * 86400000;
    const expiredIds = this.state.products
      .filter((p) => {
        if (!p.deletedAt) return false;
        const purgeMs = Number.isFinite(Date.parse(p.purgeAt || ''))
          ? Date.parse(p.purgeAt)
          : Date.parse(p.deletedAt) + retentionMs;
        return nowMs >= purgeMs;
      })
      .map((p) => p.id);

    let purgedCount = 0;
    for (const id of expiredIds) {
      const r = await this.permanentlyDeleteProductFromTrash(id);
      if (r.ok) purgedCount += 1;
    }
    return { ok: true, purgedCount, purgedIds: expiredIds };
  }

  async purgeExpiredTrash(now = new Date()) {
    const looksRes = await this.purgeExpiredLooks(now);
    const prodsRes = await this.purgeExpiredProducts(now);
    return {
      ok: Boolean(looksRes.ok && prodsRes.ok),
      purgedLooks: looksRes.purgedCount || 0,
      purgedProducts: prodsRes.purgedCount || 0,
    };
  }

  addWearReview(lookId, input) {
    const look = this.state.looks.find((l) => l.id === lookId);
    if (!look) return this.failValidation('wear_review', 'lookId', '妆容不存在');
    const timepointKey = (input.timepointKey || '').trim();
    if (!timepointKey) return this.failValidation('wear_review', 'timepointKey', '请选择持妆时间点');
    const mins = input.wearMinutes === '' || input.wearMinutes === null || input.wearMinutes === undefined
      ? 0
      : Number.parseInt(String(input.wearMinutes), 10);
    if (!Number.isInteger(mins) || mins < 0) {
      return this.failValidation('wear_review', 'wearMinutes', '带妆分钟数需为非负整数');
    }

    return this.runPersistMutation('wear_review', () => {
      const targetLook = this.state.looks.find((l) => l.id === lookId);
      const now = new Date().toISOString();
      const review = {
        id: uid('wr'),
        lookId,
        assetId: input.assetId || null,
        capturedAt: now,
        wearMinutes: mins,
        timepointKey,
        overallRating: Number(input.overallRating) || 4,
        smudgeLevel: input.smudgeLevel || '无',
        oxidationLevel: input.oxidationLevel || '轻微',
        makeupLossLevel: input.makeupLossLevel || '轻微',
        oilLevel: input.oilLevel || 'T区微油',
        cakingLevel: input.cakingLevel || '无',
        floatingLevel: input.floatingLevel || '无',
        patchinessLevel: input.patchinessLevel || '无',
        notesPrivate: (input.notesPrivate || '').trim(),
      };
      this.state.wearReviews.push(review);
      if (targetLook) targetLook.updatedAt = now;
      return { ok: true, review };
    });
  }

  /* ---------------- 日常：流程、使用记录、肌肤日记 ---------------- */

  recordRoutineExecution({ routineId, logDate, completedStepIds = [], notesPrivate = '' }) {
    const routine = this.state.routines.find((r) => r.id === routineId);
    if (!routine) return this.failValidation('routine_log', 'routineId', '未找到对应护肤流程');
    if (!isValidDate(logDate)) return this.failValidation('routine_log', 'logDate', '日期无效');

    return this.runPersistMutation('routine_log', () => {
      const targetRoutine = this.state.routines.find((r) => r.id === routineId);
      const now = new Date().toISOString();
      const items = [];
      for (const step of targetRoutine.steps) {
        const done = completedStepIds.includes(step.id);
        if (step.products.length === 0) {
          items.push({
            id: uid('rli'),
            routineStepId: step.id,
            stepNameSnapshot: step.name,
            productItemId: null,
            productNameSnapshot: step.name,
            brandNameSnapshot: '',
            shadeSnapshot: '',
            categorySnapshot: '流程步骤',
            completed: done,
          });
        } else {
          for (const sp of step.products) {
            const liveSnap = sp.productItemId ? this.buildProductSnapshot(sp.productItemId) : null;
            items.push({
              id: uid('rli'),
              routineStepId: step.id,
              stepNameSnapshot: step.name,
              productItemId: sp.productItemId || null,
              productNameSnapshot: liveSnap ? liveSnap.productNameSnapshot : sp.productNameSnapshot,
              brandNameSnapshot: liveSnap ? liveSnap.brandNameSnapshot : (sp.brandNameSnapshot || ''),
              shadeSnapshot: liveSnap ? liveSnap.shadeSnapshot : (sp.shadeSnapshot || ''),
              categorySnapshot: liveSnap ? liveSnap.categorySnapshot : (sp.categorySnapshot || ''),
              completed: done,
            });
            if (done && sp.productItemId) {
              const targetItem = this.state.productItems.find((i) => i.id === sp.productItemId);
              if (targetItem) targetItem.lastUsedAt = now;
            }
          }
        }
      }

      const log = {
        id: uid('rlog'),
        routineId: targetRoutine.id,
        routineNameSnapshot: targetRoutine.name,
        performedAt: now,
        logDate,
        completed: targetRoutine.steps.length > 0 && completedStepIds.length === targetRoutine.steps.length,
        notesPrivate: notesPrivate.trim(),
        items,
      };
      this.state.routineLogs.unshift(log);
      return { ok: true, log };
    });
  }

  saveRoutine(input) {
    const name = (input.name || '').trim();
    if (!name) return this.failValidation('routine', 'name', '请填写流程名称');
    const stepNames = (input.steps || []).map((s) => ({
      name: (s.name || '').trim(),
      productItemId: s.productItemId || null,
    })).filter((s) => s.name !== '');
    if (stepNames.length === 0) return this.failValidation('routine', 'steps', '请至少添加一个流程步骤');

    return this.runPersistMutation('routine', () => {
      const steps = stepNames.map((s, idx) => {
        const snap = s.productItemId ? this.buildProductSnapshot(s.productItemId) : null;
        return {
          id: uid('rts'),
          name: s.name,
          sortOrder: idx + 1,
          products: snap
            ? [{
                id: uid('rtsp'),
                productItemId: snap.productItemId,
                productNameSnapshot: snap.productNameSnapshot,
                brandNameSnapshot: snap.brandNameSnapshot,
                shadeSnapshot: snap.shadeSnapshot,
                categorySnapshot: snap.categorySnapshot,
              }]
            : [],
        };
      });

      const routine = {
        id: uid('rt'),
        name,
        periodType: input.periodType || 'custom',
        sortOrder: this.state.routines.length + 1,
        steps,
      };
      this.state.routines.push(routine);
      return { ok: true, routine };
    });
  }

  saveUsageLog(input) {
    const item = this.state.productItems.find((i) => i.id === input.productItemId);
    if (!item) return this.failValidation('usage_log', 'productItemId', '请选择使用的产品实例');
    const usedDate = (input.usedDate || '').trim();
    if (!isValidDate(usedDate)) return this.failValidation('usage_log', 'usedDate', '请选择有效使用日期');

    return this.runPersistMutation('usage_log', () => {
      const targetItem = this.state.productItems.find((i) => i.id === input.productItemId);
      const now = new Date().toISOString();
      const log = {
        id: uid('ulog'),
        productItemId: targetItem.id,
        usedAt: `${usedDate}T12:00:00Z`,
        usedDate,
        scene: (input.scene || '').trim() || '日常使用',
        feeling: (input.feeling || '').trim(),
        notesPrivate: (input.notesPrivate || '').trim(),
      };
      this.state.productUsageLogs.unshift(log);
      targetItem.lastUsedAt = now;
      targetItem.updatedAt = now;
      return { ok: true, log };
    });
  }

  saveSkinDiary(input) {
    const diaryDate = (input.diaryDate || '').trim();
    if (!isValidDate(diaryDate)) return this.failValidation('skin_diary', 'diaryDate', '请选择有效日期');
    const notesPrivate = (input.notesPrivate || '').trim();
    const moodTags = Array.isArray(input.moodTags) ? input.moodTags.filter(Boolean) : [];
    const photoAssetIds = Array.isArray(input.photoAssetIds) ? input.photoAssetIds.filter(Boolean) : [];
    if (!notesPrivate && moodTags.length === 0 && photoAssetIds.length === 0) {
      return this.failValidation('skin_diary', 'notesPrivate', '请填写日记内容、选择状态标签或添加照片');
    }
    return this.runPersistMutation('skin_diary', () => {
      const now = new Date().toISOString();
      const diary = {
        id: uid('diary'),
        diaryDate,
        moodTags,
        notesPrivate,
        photoAssetIds,
        createdAt: now,
        updatedAt: now,
      };
      this.state.skinDiaries.unshift(diary);
      return { ok: true, diary };
    });
  }

  /* ---------------- 首页统计聚合（严格遵循 ADR-0001 第五节） ---------------- */

  getHomeSummary(today = todayStr()) {
    const activeProducts = this.state.products.filter((p) => !p.archivedAt && !p.deletedAt);
    const activeProdIds = new Set(activeProducts.map((p) => p.id));
    const activeHeldItems = this.state.productItems.filter(
      (i) => !i.archivedAt && !i.deletedAt && activeProdIds.has(i.productId) && isHeldStatus(i.status),
    );

    // 累计购买金额：包含所有存在有效金额的记录（含已用完/历史归档），严格按 currencyCode 分组
    const purchaseEntries = this.state.productItems
      .filter((i) => !i.deletedAt && i.purchasePriceMinor !== null && i.purchasePriceMinor !== undefined && i.purchasePriceMinor !== '')
      .map((i) => ({ minor: i.purchasePriceMinor, currencyCode: i.currencyCode }));
    const currencyTotals = sumByCurrency(purchaseEntries);
    const selectedCurrency = isSupportedCurrency(this.state.settings?.homeSelectedCurrency)
      ? this.state.settings.homeSelectedCurrency
      : 'CNY';
    const selectedCurrencyTotal =
      currencyTotals.find((row) => row.currencyCode === selectedCurrency) || {
        currencyCode: selectedCurrency,
        minor: '0',
        count: 0,
      };

    const nearDays = this.state.settings.nearExpiryDays;
    const nearExpiryItems = [];
    const expiredItems = [];
    let pendingStatusCount = 0;
    let incompleteExpiryCount = 0;

    for (const item of activeHeldItems) {
      const comp = getItemExpiryCompleteness(item);
      if (comp.isPendingStatus) pendingStatusCount += 1;
      if (comp.isIncompleteExpiry) incompleteExpiryCount += 1;
      const resolved = resolveItemExpiryForDisplay(item);
      const st = expiryStatus(resolved, today, nearDays);
      if (st.key === 'near') nearExpiryItems.push({ item, status: st, resolved });
      if (st.key === 'expired') expiredItems.push({ item, status: st, resolved });
    }

    const categoryStats = this.state.categories
      .map((cat) => {
        const prods = activeProducts.filter((p) => p.categoryId === cat.id);
        const prodIds = new Set(prods.map((p) => p.id));
        const heldCount = activeHeldItems.filter((i) => prodIds.has(i.productId)).length;
        return {
          category: cat,
          productCount: prods.length,
          heldCount,
        };
      })
      .filter((row) => row.productCount > 0 || row.heldCount > 0);

    const recentLooks = [...this.state.looks]
      .filter((l) => !l.archivedAt && !l.deletedAt)
      .sort((a, b) => b.lookDate.localeCompare(a.lookDate) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 6);

    const recentDaily = [
      ...this.state.routineLogs.map((r) => ({
        kind: 'routine',
        date: r.logDate,
        sortKey: r.performedAt,
        title: r.routineNameSnapshot,
        subtitle: r.completed ? '已完成全部步骤' : '部分步骤打卡',
        raw: r,
      })),
      ...this.state.productUsageLogs.map((u) => {
        const item = this.state.productItems.find((i) => i.id === u.productItemId);
        const prod = item ? this.state.products.find((p) => p.id === item.productId) : null;
        return {
          kind: 'usage',
          date: u.usedDate,
          sortKey: u.usedAt,
          title: prod ? prod.name : '已移除产品',
          subtitle: `${u.scene}${u.feeling ? ` · ${u.feeling}` : ''}`,
          raw: u,
        };
      }),
      ...this.state.skinDiaries.map((d) => ({
        kind: 'diary',
        date: d.diaryDate,
        sortKey: d.createdAt,
        title: `肌肤日记 · ${d.moodTags.join(' / ') || '日常记录'}`,
        subtitle: d.notesPrivate || `${d.photoAssetIds.length} 张照片`,
        raw: d,
      })),
    ]
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
      .slice(0, 5);

    return {
      productCount: activeProducts.length,
      heldItemCount: activeHeldItems.length,
      totalItemCount: this.state.productItems.filter((i) => !i.deletedAt).length,
      pendingStatusCount,
      incompleteExpiryCount,
      selectedCurrency,
      selectedCurrencyTotal,
      currencyTotals,
      nearExpiryConfigured: Number.isInteger(nearDays) && nearDays > 0,
      nearDays,
      nearExpiryItems,
      expiredItems,
      categoryStats,
      recentLooks,
      recentDaily,
    };
  }

  /* ---------------- 设置、导出与重置/清空 ---------------- */

  updateSettings(patch) {
    Object.assign(this.state.settings, patch);
    this.persist();
  }

  getMediaStats() {
    const idbAssets = this.state.mediaAssets.filter((a) => a.kind === 'idb');
    const totalBytes = idbAssets.reduce((sum, a) => sum + (a.byteSize || 0), 0);
    return {
      sampleCount: this.state.mediaAssets.length - idbAssets.length,
      idbCount: idbAssets.length,
      totalBytes,
    };
  }

  buildExportJson() {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        prototypeNotice: 'BeautyBox 浏览器交互原型导出（模拟业务数据，非原生 SQLite）',
        currenciesSupported: Object.keys(CURRENCIES),
        data: deepClone(this.state),
      },
      null,
      2,
    );
  }

  buildProductItemsCsv() {
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'item_id',
      'product_name',
      'brand_name',
      'category',
      'shade',
      'status',
      'purchase_price_minor',
      'currency_code',
      'purchase_date',
      'acquisition_method',
      'manufacture_date',
      'unopened_shelf_months',
      'opened_date',
      'pao_months',
      'computed_expiry_date',
      'confirmed_expiry_date',
      'remaining_percent',
      'archived_at',
    ];
    const rows = this.state.productItems.map((i) => {
      const p = this.state.products.find((pr) => pr.id === i.productId);
      return [
        i.id,
        p?.name || '',
        p ? this.getBrandName(p.brandId) : '',
        p ? this.getCategoryName(p.categoryId) : '',
        p?.shade || '',
        ITEM_STATUSES[i.status]?.label || i.status,
        i.purchasePriceMinor ?? '',
        i.currencyCode ?? '',
        i.purchaseDate ?? '',
        getItemAcquisitionDisplay(i),
        i.manufactureDate ?? '',
        i.unopenedShelfMonths ?? '',
        i.openedDate ?? '',
        i.paoMonths ?? '',
        i.computedExpiryDate ?? '',
        i.confirmedExpiryDate ?? '',
        i.remainingPercent,
        i.archivedAt ?? '',
      ].map(esc).join(',');
    });
    return `\uFEFF${header.join(',')}\n${rows.join('\n')}`;
  }

  buildMockBackupPackageJson() {
    const now = new Date().toISOString();
    this.updateSettings({ lastMockBackupAt: now });
    return JSON.stringify(
      {
        manifest: {
          backup_format_version: 1,
          schema_version: 1,
          app_version: 'prototype-task02',
          created_at: now,
          product_count: this.state.products.length,
          item_count: this.state.productItems.length,
          media_idb_count: this.getMediaStats().idbCount,
          note: '此文件仅为浏览器原型生成的 .beautyboxbackup 结构示例（JSON），正式原生版为包含 SQLite 与 Media/ 的 ZIP 包。',
        },
        payload: deepClone(this.state),
      },
      null,
      2,
    );
  }

  async resetToSeedData() {
    await this.mediaOps.clearAllBlobs();
    const seed = this.normalizeState(createSeedData());
    seed.settings.onboardingDismissed = true;
    this.state = seed;
    this.persist();
  }

  async clearAllData() {
    await this.mediaOps.clearAllBlobs();
    this.state = createEmptyState(this.state.settings);
    this.persist();
  }
}
