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
  isPositiveIntMonths,
  isValidDate,
  resolveExpiry,
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

export const STORAGE_KEY = 'beautybox_prototype_v1';

/** 视为“仍在持有”的实例状态（未用完、未丢弃、未转让） */
export const ITEM_STATUSES = Object.freeze({
  unopened: Object.freeze({ key: 'unopened', label: '未开封', held: true }),
  in_use: Object.freeze({ key: 'in_use', label: '使用中', held: true }),
  idle: Object.freeze({ key: 'idle', label: '闲置中', held: true }),
  used_up: Object.freeze({ key: 'used_up', label: '已用完', held: false }),
  disposed: Object.freeze({ key: 'disposed', label: '已弃用', held: false }),
  transferred: Object.freeze({ key: 'transferred', label: '已转让', held: false }),
});

export function isHeldStatus(status) {
  return Boolean(ITEM_STATUSES[status]?.held);
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
    version: 1,
    categories: [
      { id: 'cat-base', name: '底妆', sortOrder: 1, isSystem: true },
      { id: 'cat-lip', name: '唇妆', sortOrder: 2, isSystem: true },
      { id: 'cat-eye', name: '眼妆', sortOrder: 3, isSystem: true },
      { id: 'cat-cheek', name: '腮红修容', sortOrder: 4, isSystem: true },
      { id: 'cat-care', name: '护肤', sortOrder: 5, isSystem: true },
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
            return parsed;
          }
        }
      } catch {
        // 损坏的模拟数据则重新使用默认演示数据
      }
    }
    const seed = createSeedData();
    this.saveRawState(seed);
    return seed;
  }

  saveRawState(state) {
    if (!this.storage) return;
    this.storage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  persist() {
    this.saveRawState(this.state);
    this.notify();
  }

  async hydrateMedia() {
    const res = await this.mediaOps.hydrateAssets(this.state.mediaAssets);
    this.notify();
    return res;
  }

  /** 将用户选择的文件保存为 IndexedDB Blob，并登记元数据 */
  async addImageFileAsset(file) {
    const err = this.mediaOps.validateFile(file);
    if (err) throw new Error(err);
    const id = uid('asset');
    const dims = await this.mediaOps.readDimensions(file);
    await this.mediaOps.saveBlob(id, file);
    const asset = {
      id,
      kind: 'idb',
      mimeType: file.type || 'image/jpeg',
      byteSize: file.size || 0,
      width: dims.width || 0,
      height: dims.height || 0,
      createdAt: new Date().toISOString(),
    };
    this.state.mediaAssets.push(asset);
    this.persist();
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

  /* ---------------- 产品与持有实例 CRUD ---------------- */

  getItemsForProduct(productId, { includeArchived = true } = {}) {
    return this.state.productItems
      .filter((i) => i.productId === productId && (includeArchived || !i.archivedAt))
      .sort((a, b) => Number(!a.archivedAt) - Number(!b.archivedAt) || b.updatedAt.localeCompare(a.updatedAt));
  }

  saveProduct(input) {
    const name = (input.name || '').trim();
    const categoryId = (input.categoryId || '').trim();
    if (!name) return { ok: false, error: '请填写产品名称' };
    if (!categoryId || !this.state.categories.some((c) => c.id === categoryId)) {
      return { ok: false, error: '请选择产品分类' };
    }

    const now = new Date().toISOString();
    const brandId = this.ensureBrandId(input.brandName || '');

    if (input.id) {
      const existing = this.state.products.find((p) => p.id === input.id);
      if (!existing) return { ok: false, error: '未找到要编辑的产品' };
      existing.name = name;
      existing.categoryId = categoryId;
      existing.brandId = brandId;
      existing.specification = (input.specification || '').trim();
      existing.shade = (input.shade || '').trim();
      existing.texture = (input.texture || '').trim();
      existing.finish = (input.finish || '').trim();
      existing.notesPrivate = (input.notesPrivate || '').trim();
      existing.updatedAt = now;
      if (input.newAssetId) {
        this.addProductPhoto(existing.id, input.newAssetId, { makeCover: Boolean(input.makeNewPhotoCover) });
      }
      this.persist();
      return { ok: true, product: existing };
    }

    const product = {
      id: uid('prod'),
      brandId,
      categoryId,
      name,
      specification: (input.specification || '').trim(),
      shade: (input.shade || '').trim(),
      texture: (input.texture || '').trim(),
      finish: (input.finish || '').trim(),
      notesPrivate: (input.notesPrivate || '').trim(),
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    this.state.products.push(product);
    if (input.newAssetId) {
      this.addProductPhoto(product.id, input.newAssetId, { makeCover: true });
    }
    this.persist();
    return { ok: true, product };
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
   * 保存或更新 ProductItem。
   * - 金额严格按 currencyCode 精度从十进制字符串转换，绝不自动按 2 位或浮点计算。
   * - 有效期严格遵守不猜测原则，并保护已确认的到期日不被自动覆盖。
   */
  saveProductItem(input) {
    const product = this.state.products.find((p) => p.id === input.productId);
    if (!product) return { ok: false, error: '所属产品不存在' };

    const status = input.status || 'in_use';
    if (!ITEM_STATUSES[status]) return { ok: false, error: '请选择有效的持有状态' };

    let purchasePriceMinor = null;
    let currencyCode = null;
    const priceInput = (input.purchasePriceInput ?? '').trim();
    const selectedCode = (input.currencyCode || '').trim();

    if (priceInput !== '' || (selectedCode !== '' && !isSupportedCurrency(selectedCode))) {
      if (!selectedCode) return { ok: false, error: '请选择购买币种' };
      if (!isSupportedCurrency(selectedCode)) {
        return { ok: false, error: UNSUPPORTED_MESSAGE };
      }
      const parsed = parseAmountToMinor(priceInput, selectedCode);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      purchasePriceMinor = parsed.minor;
      currencyCode = parsed.currencyCode;
    } else if (selectedCode !== '') {
      if (!isSupportedCurrency(selectedCode)) return { ok: false, error: UNSUPPORTED_MESSAGE };
      currencyCode = selectedCode;
    }

    const checkDate = (val, label) => {
      const s = (val || '').trim();
      if (!s) return { ok: true, value: null };
      if (!isValidDate(s)) return { ok: false, error: `${label}格式应为 YYYY-MM-DD` };
      return { ok: true, value: s };
    };
    const checkMonths = (val, label) => {
      const s = String(val ?? '').trim();
      if (!s) return { ok: true, value: null };
      if (!/^\d+$/.test(s)) return { ok: false, error: `${label}必须为正整数月数` };
      const n = Number.parseInt(s, 10);
      if (!isPositiveIntMonths(n)) return { ok: false, error: `${label}必须大于 0 个月` };
      return { ok: true, value: n };
    };

    const pd = checkDate(input.purchaseDate, '购买日期');
    if (!pd.ok) return pd;
    const md = checkDate(input.manufactureDate, '生产日期');
    if (!md.ok) return md;
    const od = checkDate(input.openedDate, '开封日期');
    if (!od.ok) return od;
    const cd = checkDate(input.confirmedExpiryDate, '用户确认到期日');
    if (!cd.ok) return cd;
    const sm = checkMonths(input.unopenedShelfMonths, '未开封保质期');
    if (!sm.ok) return sm;
    const pm = checkMonths(input.paoMonths, '开封后使用期限（PAO）');
    if (!pm.ok) return pm;

    const remRaw = input.remainingPercent === '' || input.remainingPercent === null || input.remainingPercent === undefined
      ? 100
      : Number.parseInt(String(input.remainingPercent), 10);
    if (!Number.isInteger(remRaw) || remRaw < 0 || remRaw > 100) {
      return { ok: false, error: '剩余比例必须在 0 到 100 之间' };
    }

    const prev = input.id ? this.state.productItems.find((i) => i.id === input.id) : null;
    if (input.id && !prev) return { ok: false, error: '未找到要编辑的持有实例' };

    const now = new Date().toISOString();
    const draftDates = {
      manufactureDate: md.value,
      unopenedShelfMonths: sm.value,
      openedDate: od.value,
      paoMonths: pm.value,
      confirmedExpiryDate: cd.value,
    };
    const computed = deriveComputedExpiry(draftDates);
    const confirmation = applyExpiryConfirmation(prev, draftDates, now);

    const record = {
      id: prev ? prev.id : uid('item'),
      productId: product.id,
      purchasePriceMinor,
      currencyCode,
      purchaseDate: pd.value,
      purchaseChannel: (input.purchaseChannel || '').trim(),
      manufactureDate: md.value,
      unopenedShelfMonths: sm.value,
      openedDate: od.value,
      paoMonths: pm.value,
      computedExpiryDate: computed.computedExpiryDate,
      expiryBasis: computed.expiryBasis,
      confirmedExpiryDate: confirmation.confirmedExpiryDate,
      expiryConfirmedAt: confirmation.expiryConfirmedAt,
      expiryNeedsReconfirm: confirmation.expiryNeedsReconfirm,
      status,
      remainingPercent: status === 'used_up' ? 0 : remRaw,
      lastUsedAt: prev ? prev.lastUsedAt : null,
      createdAt: prev ? prev.createdAt : now,
      updatedAt: now,
      archivedAt: input.archivedAt !== undefined ? input.archivedAt : (prev ? prev.archivedAt : null),
    };

    if (prev) {
      Object.assign(prev, record);
    } else {
      this.state.productItems.push(record);
    }
    this.persist();
    return { ok: true, item: record };
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
    if (!name) return { ok: false, error: '请填写妆容名称' };
    if (!isValidDate(lookDate)) return { ok: false, error: '请选择有效的妆容日期' };
    const dur = input.durationMinutes === '' || input.durationMinutes === null || input.durationMinutes === undefined
      ? null
      : Number.parseInt(String(input.durationMinutes), 10);
    if (dur !== null && (!Number.isInteger(dur) || dur < 0)) {
      return { ok: false, error: '耗时必须是非负整数分钟' };
    }

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
    };

    if (input.id) {
      const existing = this.state.looks.find((l) => l.id === input.id);
      if (!existing) return { ok: false, error: '妆容不存在' };
      Object.assign(existing, look, { createdAt: existing.createdAt });
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

    this.persist();
    return { ok: true, look: this.state.looks.find((l) => l.id === lookId) };
  }

  addWearReview(lookId, input) {
    const look = this.state.looks.find((l) => l.id === lookId);
    if (!look) return { ok: false, error: '妆容不存在' };
    const timepointKey = (input.timepointKey || '').trim();
    if (!timepointKey) return { ok: false, error: '请选择持妆时间点' };
    const mins = input.wearMinutes === '' || input.wearMinutes === null || input.wearMinutes === undefined
      ? 0
      : Number.parseInt(String(input.wearMinutes), 10);
    if (!Number.isInteger(mins) || mins < 0) return { ok: false, error: '带妆分钟数需为非负整数' };

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
    look.updatedAt = now;
    this.persist();
    return { ok: true, review };
  }

  /* ---------------- 日常：流程、使用记录、肌肤日记 ---------------- */

  recordRoutineExecution({ routineId, logDate, completedStepIds = [], notesPrivate = '' }) {
    const routine = this.state.routines.find((r) => r.id === routineId);
    if (!routine) return { ok: false, error: '未找到对应护肤流程' };
    if (!isValidDate(logDate)) return { ok: false, error: '日期无效' };

    const now = new Date().toISOString();
    const items = [];
    for (const step of routine.steps) {
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
      routineId: routine.id,
      routineNameSnapshot: routine.name,
      performedAt: now,
      logDate,
      completed: routine.steps.length > 0 && completedStepIds.length === routine.steps.length,
      notesPrivate: notesPrivate.trim(),
      items,
    };
    this.state.routineLogs.unshift(log);
    this.persist();
    return { ok: true, log };
  }

  saveRoutine(input) {
    const name = (input.name || '').trim();
    if (!name) return { ok: false, error: '请填写流程名称' };
    const stepNames = (input.steps || []).map((s) => ({
      name: (s.name || '').trim(),
      productItemId: s.productItemId || null,
    })).filter((s) => s.name !== '');
    if (stepNames.length === 0) return { ok: false, error: '请至少添加一个流程步骤' };

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
    this.persist();
    return { ok: true, routine };
  }

  saveUsageLog(input) {
    const item = this.state.productItems.find((i) => i.id === input.productItemId);
    if (!item) return { ok: false, error: '请选择使用的产品实例' };
    const usedDate = (input.usedDate || '').trim();
    if (!isValidDate(usedDate)) return { ok: false, error: '请选择有效使用日期' };

    const now = new Date().toISOString();
    const log = {
      id: uid('ulog'),
      productItemId: item.id,
      usedAt: `${usedDate}T12:00:00Z`,
      usedDate,
      scene: (input.scene || '').trim() || '日常使用',
      feeling: (input.feeling || '').trim(),
      notesPrivate: (input.notesPrivate || '').trim(),
    };
    this.state.productUsageLogs.unshift(log);
    item.lastUsedAt = now;
    item.updatedAt = now;
    this.persist();
    return { ok: true, log };
  }

  saveSkinDiary(input) {
    const diaryDate = (input.diaryDate || '').trim();
    if (!isValidDate(diaryDate)) return { ok: false, error: '请选择有效日期' };
    const notesPrivate = (input.notesPrivate || '').trim();
    const moodTags = Array.isArray(input.moodTags) ? input.moodTags.filter(Boolean) : [];
    const photoAssetIds = Array.isArray(input.photoAssetIds) ? input.photoAssetIds.filter(Boolean) : [];
    if (!notesPrivate && moodTags.length === 0 && photoAssetIds.length === 0) {
      return { ok: false, error: '请填写日记内容、选择状态标签或添加照片' };
    }
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
    this.persist();
    return { ok: true, diary };
  }

  /* ---------------- 首页统计聚合（严格遵循 ADR-0001 第五节） ---------------- */

  getHomeSummary(today = todayStr()) {
    const activeProducts = this.state.products.filter((p) => !p.archivedAt);
    const activeHeldItems = this.state.productItems.filter(
      (i) => !i.archivedAt && isHeldStatus(i.status),
    );

    // 累计购买金额：包含所有存在有效金额的实例（含已用完、已归档），严格按 currencyCode 分组
    const purchaseEntries = this.state.productItems
      .filter((i) => i.purchasePriceMinor !== null && i.purchasePriceMinor !== undefined && i.purchasePriceMinor !== '')
      .map((i) => ({ minor: i.purchasePriceMinor, currencyCode: i.currencyCode }));
    const currencyTotals = sumByCurrency(purchaseEntries);

    const nearDays = this.state.settings.nearExpiryDays;
    const nearExpiryItems = [];
    const expiredItems = [];

    for (const item of activeHeldItems) {
      const resolved = resolveExpiry(item);
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
      .filter((l) => !l.archivedAt)
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
          title: prod ? prod.name : '已移除产品实例',
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
      totalItemCount: this.state.productItems.length,
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
      'purchase_channel',
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
        i.purchaseChannel ?? '',
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
    const seed = createSeedData();
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
