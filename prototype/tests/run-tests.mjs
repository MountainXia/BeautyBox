/**
 * 妆匣 BeautyBox · TASK 02 自动化逻辑测试（Node 原生 node:test，零第三方依赖）
 * 运行方式：node prototype/tests/run-tests.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  UNSUPPORTED_MESSAGE,
  addMoney,
  formatMinor,
  minorToDecimalString,
  parseAmountToMinor,
  sumByCurrency,
} from '../js/currency.js';
import {
  addMonths,
  deriveComputedExpiry,
  deriveDualComputedExpiry,
  expiryStatus,
  missingExpiryInputs,
  resolveExpiry,
} from '../js/expiry.js';
import {
  ACQUISITION_PRESETS,
  LOOK_TRASH_RETENTION_DAYS,
  PrototypeStore,
  SPEC_UNITS,
  STORAGE_KEY,
  formatSpecification,
  getItemAcquisitionDisplay,
  parseSpecificationParts,
} from '../js/store.js';
import { validateImageFile } from '../js/assets.js';
import { clearDiagnostics, getDiagnostics } from '../js/diagnostics.js';
import { buildShareCardPayload } from '../js/shareCard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTOTYPE_DIR = path.resolve(__dirname, '..');

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

function createFakeMediaOps() {
  const blobs = new Map();
  let clearCount = 0;
  return {
    blobs,
    get clearCount() {
      return clearCount;
    },
    async saveBlob(id, file) {
      blobs.set(id, file);
      return `blob:mock/${id}`;
    },
    async deleteBlob(id) {
      blobs.delete(id);
    },
    async clearAllBlobs() {
      blobs.clear();
      clearCount += 1;
    },
    async hydrateAssets() {
      return { restored: blobs.size, missingIds: [] };
    },
    async readDimensions() {
      return { width: 100, height: 100 };
    },
    validateFile(file) {
      return file && file.type?.startsWith('image/') ? null : '无效图片';
    },
    resolveUrl(asset) {
      if (!asset) return null;
      return asset.kind === 'idb' ? (blobs.has(asset.id) ? `blob:mock/${asset.id}` : null) : `sample://${asset.sampleKey}`;
    },
  };
}

test('静态规范检查：currency.js 不包含浮点转换，store 序列化不写入 Base64 图片', () => {
  const curSrc = fs.readFileSync(path.join(PROTOTYPE_DIR, 'js/currency.js'), 'utf8');
  assert.equal(/\bparseFloat\b/.test(curSrc), false, 'currency.js 不允许使用 parseFloat');
  assert.equal(/\bNumber\s*\(/.test(curSrc), false, 'currency.js 不允许使用 Number() 做金额计算');

  const storage = createMemoryStorage();
  const mediaOps = createFakeMediaOps();
  const store = new PrototypeStore({ storage, mediaOps });
  const rawJson = storage.getItem(STORAGE_KEY);
  assert.ok(rawJson);
  assert.equal(/data:image\/(png|jpeg|webp|gif);base64/i.test(rawJson), false, 'localStorage 禁止存入图片 Base64');
  store.state.mediaAssets.push({ id: 'a1', kind: 'idb', mimeType: 'image/png', byteSize: 42 });
  store.persist();
  assert.equal(/data:image\/.*;base64/i.test(storage.getItem(STORAGE_KEY)), false);
});

test('多币种精确转换与往返一致：CNY/HKD/USD/GBP（2位小数）', () => {
  const cases = [
    { code: 'CNY', input: '12.34', minor: '1234', dec: '12.34', formatted: '¥ 12.34' },
    { code: 'CNY', input: '0.05', minor: '5', dec: '0.05', formatted: '¥ 0.05' },
    { code: 'CNY', input: '320', minor: '32000', dec: '320.00', formatted: '¥ 320.00' },
    { code: 'HKD', input: '480', minor: '48000', dec: '480.00', formatted: 'HK$ 480.00' },
    { code: 'USD', input: '12.34', minor: '1234', dec: '12.34', formatted: 'US$ 12.34' },
    { code: 'GBP', input: '32.50', minor: '3250', dec: '32.50', formatted: '£ 32.50' },
  ];
  for (const c of cases) {
    const parsed = parseAmountToMinor(c.input, c.code);
    assert.equal(parsed.ok, true, `${c.code} ${c.input} 应解析成功`);
    assert.equal(parsed.minor, c.minor);
    assert.equal(minorToDecimalString(parsed.minor, c.code), c.dec);
    assert.equal(formatMinor(parsed.minor, c.code), c.formatted);
  }
});

test('拦截未配置币种与超出标准精度的输入（禁止默认 2 位与静默截断）', () => {
  const eur = parseAmountToMinor('12.34', 'EUR');
  assert.equal(eur.ok, false);
  assert.equal(eur.error, UNSUPPORTED_MESSAGE);

  const cny3 = parseAmountToMinor('12.345', 'CNY');
  assert.equal(cny3.ok, false);
  assert.equal(cny3.code, 'PRECISION');

  const gbp3 = parseAmountToMinor('12.345', 'GBP');
  assert.equal(gbp3.ok, false);
  assert.equal(gbp3.code, 'PRECISION');

  assert.throws(() => addMoney({ currencyCode: 'CNY', minor: '100' }, { currencyCode: 'USD', minor: '100' }));

  const grouped = sumByCurrency([
    { currencyCode: 'CNY', minor: '1234' },
    { currencyCode: 'HKD', minor: '48000' },
    { currencyCode: 'GBP', minor: '3250' },
    { currencyCode: 'CNY', minor: '66' },
  ]);
  assert.equal(grouped.length, 3);
  assert.deepEqual(
    grouped.map((g) => [g.currencyCode, g.minor]),
    [
      ['CNY', '1300'],
      ['HKD', '48000'],
      ['GBP', '3250'],
    ],
  );
});

test('有效期规则：不猜测缺项、月末边界正确、不覆盖用户确认日期', () => {
  assert.equal(addMonths('2025-01-31', 1), '2025-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');

  const incomplete = { manufactureDate: '2025-01-01', unopenedShelfMonths: null, openedDate: null, paoMonths: null };
  assert.deepEqual(deriveComputedExpiry(incomplete), {
    computedExpiryDate: null,
    expiryBasis: 'none',
    unopenedComputedExpiry: null,
    openedComputedExpiry: null,
  });
  assert.equal(missingExpiryInputs(incomplete).length, 1);

  const storage = createMemoryStorage();
  const store = new PrototypeStore({ storage, mediaOps: createFakeMediaOps() });

  // 验证未配置币种拦截
  const badCur = store.saveProductItem({
    productId: 'prod-lip-196',
    status: 'in_use',
    currencyCode: 'EUR',
    purchasePriceInput: '25.00',
  });
  assert.equal(badCur.ok, false);
  assert.equal(badCur.error, UNSUPPORTED_MESSAGE);

  // 验证输入变化不覆盖用户确认日期
  const created = store.saveProductItem({
    productId: 'prod-lip-196',
    status: 'in_use',
    currencyCode: 'GBP',
    purchasePriceInput: '12.35',
    openedDate: '2026-01-01',
    paoMonths: '12',
    confirmedExpiryDate: '2027-06-30',
  });
  assert.equal(created.ok, true);
  assert.equal(created.item.purchasePriceMinor, '1235');
  assert.equal(created.item.confirmedExpiryDate, '2027-06-30');
  assert.equal(created.item.expiryNeedsReconfirm, false);

  const updated = store.saveProductItem({
    id: created.item.id,
    productId: 'prod-lip-196',
    status: 'in_use',
    currencyCode: 'GBP',
    purchasePriceInput: '12.35',
    openedDate: '2026-02-01',
    paoMonths: '12',
    confirmedExpiryDate: '2027-06-30',
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.item.computedExpiryDate, '2027-02-01');
  assert.equal(updated.item.confirmedExpiryDate, '2027-06-30');
  assert.equal(updated.item.expiryNeedsReconfirm, true);

  // nearDays 未设置时不判为临期
  const stUnset = expiryStatus(resolveExpiry({ confirmedExpiryDate: '2026-11-25' }), '2026-11-19', null);
  assert.equal(stUnset.key, 'ok');
  const st30 = expiryStatus(resolveExpiry({ confirmedExpiryDate: '2026-11-25' }), '2026-11-19', 30);
  assert.equal(st30.key, 'near');
});

test('首页统计口径、单封面唯一真相源、历史快照保护与清空同步删 Blob', async () => {
  const storage = createMemoryStorage();
  const mediaOps = createFakeMediaOps();
  const store = new PrototypeStore({ storage, mediaOps });

  const sum = store.getHomeSummary();
  // seedData 有 5 个未归档 Product；7 个 ProductItem 中 1 个已用完归档，剩余 6 个在持有
  assert.equal(sum.productCount, 5);
  assert.equal(sum.heldItemCount, 6);
  // 累计消费金额包含已归档的 590.00 CNY (320 + 630 + 590 + 58 = 1598.00)
  const cny = sum.currencyTotals.find((t) => t.currencyCode === 'CNY');
  assert.equal(cny.minor, '159800');

  // 封面唯一性 + 无封面兜底
  const lipPhotos = store.getProductPhotos('prod-lip-196');
  assert.equal(lipPhotos.filter((p) => p.isCover).length, 1);
  store.setProductCover('prod-lip-196', 'pp-2');
  assert.equal(store.getProductPhotos('prod-lip-196').filter((p) => p.isCover).length, 1);
  assert.equal(store.getProductCoverPhoto('prod-lip-196').id, 'pp-2');
  store.clearProductCover('prod-lip-196');
  assert.equal(store.getProductPhotos('prod-lip-196').filter((p) => p.isCover).length, 0);
  assert.ok(store.getProductCoverPhoto('prod-lip-196')); // 兜底返回首张
  assert.equal(store.getProductCoverPhoto('prod-blush-nocover'), null); // 无照片返回 null

  // 改名 + 归档后历史妆容快照不失真
  store.saveProduct({
    id: 'prod-found-ls',
    categoryId: 'cat-base',
    brandName: 'Giorgio Armani',
    name: '新版改名粉底液',
  });
  store.toggleArchiveProduct('prod-found-ls');
  const snap = store.state.lookProductItems.find((lpi) => lpi.id === 'lpi-4');
  assert.equal(snap.productNameSnapshot, '柔亮自然粉底液（旧版空瓶）');

  // 上传图片存 Blob 并随清空数据同步清理
  const asset = await store.addImageFileAsset({ type: 'image/png', size: 1024 });
  assert.equal(mediaOps.blobs.has(asset.id), true);
  assert.equal(store.getAssetUrl(asset.id), `blob:mock/${asset.id}`);
  await store.clearAllData();
  assert.equal(mediaOps.blobs.size, 0);
  assert.equal(mediaOps.clearCount, 1);
  assert.equal(store.state.products.length, 0);
  assert.equal(store.state.mediaAssets.length, 0);
});

test('TASK02.1-A：Safari 空 MIME 图片校验、localStorage 失败回滚与脱敏诊断日志', () => {
  clearDiagnostics();
  // iOS Safari 部分图片选择 MIME 为空但文件名后缀为 .heic / .jpg
  assert.equal(validateImageFile({ name: 'IMG_001.HEIC', type: '', size: 2048 }), null);
  assert.notEqual(validateImageFile({ name: 'doc.pdf', type: 'application/pdf', size: 1024 }), null);

  // 模拟 localStorage 写入失败（如无痕模式 / 配额超限）
  const storage = createMemoryStorage();
  const store = new PrototypeStore({ storage, mediaOps: createFakeMediaOps() });
  const initialCount = store.state.products.length;

  storage.setItem = () => {
    const err = new Error('Quota exceeded');
    err.name = 'QuotaExceededError';
    throw err;
  };

  const failRes = store.saveProduct({
    name: '测试回滚产品',
    categoryId: 'cat-base',
    notesPrivate: '绝对不应该进诊断日志的私人备注',
  });
  assert.equal(failRes.ok, false);
  assert.equal(failRes.stage, 'localstorage_write_failed');
  // 失败后内存状态必须回滚，不能假装已保存
  assert.equal(store.state.products.length, initialCount);

  const logs = getDiagnostics();
  assert.ok(logs.length >= 1);
  assert.equal(logs[0].stage, 'localstorage_write_failed');
  assert.equal(logs[0].errorName, 'QuotaExceededError');
  assert.equal(JSON.stringify(logs[0]).includes('绝对不应该进诊断日志的私人备注'), false);
  clearDiagnostics();
});

test('TASK02.1-B：未开封与开封后独立推算、获得方式兼容、妆容 7 天回收站、首页单币种汇总', async () => {
  const storage = createMemoryStorage();
  const mediaOps = createFakeMediaOps();
  const store = new PrototypeStore({ storage, mediaOps });

  // 1. 未开封与开封后独立推算：互不覆盖、不自动取较早日期、不覆盖用户确认日期
  const dual = deriveDualComputedExpiry({
    manufactureDate: '2025-01-01',
    unopenedShelfMonths: 36,
    openedDate: '2026-06-01',
    paoMonths: 12,
  });
  assert.equal(dual.unopened.date, '2028-01-01');
  assert.equal(dual.opened.date, '2027-06-01');

  const itemDualRes = store.saveProductItem({
    productId: 'prod-lip-196',
    status: 'in_use',
    currencyCode: 'CNY',
    purchasePriceInput: '100.00',
    acquisitionPreset: ACQUISITION_PRESETS[0], // 专柜
    manufactureDate: '2025-01-01',
    unopenedShelfMonths: '36',
    openedDate: '2026-06-01',
    paoMonths: '12',
    confirmedExpiryDate: '2027-12-31',
  });
  assert.equal(itemDualRes.ok, true);
  assert.equal(itemDualRes.item.unopenedComputedExpiry, '2028-01-01');
  assert.equal(itemDualRes.item.openedComputedExpiry, '2027-06-01');
  assert.equal(itemDualRes.item.expiryBasis, 'conflict');
  assert.equal(itemDualRes.item.computedExpiryDate, null); // 不自动取较早日期
  assert.equal(itemDualRes.item.confirmedExpiryDate, '2027-12-31'); // 不覆盖确认日期
  assert.equal(getItemAcquisitionDisplay(itemDualRes.item), '专柜');

  // 2. 获得方式自定义 + 旧版 purchaseChannel 向后兼容
  const customAcq = store.saveProductItem({
    productId: 'prod-lip-196',
    status: 'unopened',
    acquisitionPreset: '其他',
    acquisitionCustomText: '日本药妆店带回',
  });
  assert.equal(customAcq.ok, true);
  assert.equal(getItemAcquisitionDisplay(customAcq.item), '日本药妆店带回');

  // 模拟旧版 localStorage（仅 purchaseChannel，无 acquisitionMethod / deletedAt / homeSelectedCurrency）
  const legacyRaw = JSON.parse(storage.getItem(STORAGE_KEY));
  delete legacyRaw.settings.homeSelectedCurrency;
  legacyRaw.productItems[0].purchaseChannel = '机场日上旧格式';
  delete legacyRaw.productItems[0].acquisitionMethod;
  delete legacyRaw.looks[0].deletedAt;
  delete legacyRaw.looks[0].purgeAt;
  storage.setItem(STORAGE_KEY, JSON.stringify(legacyRaw));

  const migratedStore = new PrototypeStore({ storage, mediaOps });
  assert.equal(migratedStore.state.settings.homeSelectedCurrency, 'CNY');
  assert.equal(getItemAcquisitionDisplay(migratedStore.state.productItems[0]), '机场日上旧格式');
  assert.equal(migratedStore.state.looks[0].deletedAt, null);

  // 3. 首页累计金额单币种切换、记住选择、无记录显零、详情保留多币种
  const homeDefault = migratedStore.getHomeSummary();
  assert.equal(homeDefault.selectedCurrency, 'CNY');
  assert.equal(homeDefault.selectedCurrencyTotal.currencyCode, 'CNY');
  assert.equal(homeDefault.selectedCurrencyTotal.minor, '169800'); // 原 159800 + 新 10000

  migratedStore.updateSettings({ homeSelectedCurrency: 'GBP' });
  const reloadedHomeStore = new PrototypeStore({ storage, mediaOps });
  const homeGbpSeeded = reloadedHomeStore.getHomeSummary();
  assert.equal(homeGbpSeeded.selectedCurrency, 'GBP');
  assert.equal(homeGbpSeeded.selectedCurrencyTotal.minor, '3200'); // 仅统计 GBP，不跨币种相加
  assert.equal(homeGbpSeeded.currencyTotals.length >= 3, true); // 多币种明细仍完整

  // 清空后选定 HKD 无记录应显示零金额，新增后仅累计该币种
  const emptyCurStorage = createMemoryStorage();
  const emptyCurStore = new PrototypeStore({ storage: emptyCurStorage, mediaOps: createFakeMediaOps() });
  await emptyCurStore.clearAllData();
  emptyCurStore.updateSettings({ homeSelectedCurrency: 'HKD' });
  const homeHkdEmpty = emptyCurStore.getHomeSummary();
  assert.equal(homeHkdEmpty.selectedCurrencyTotal.minor, '0');
  assert.equal(homeHkdEmpty.selectedCurrencyTotal.count, 0);
  assert.equal(formatMinor(homeHkdEmpty.selectedCurrencyTotal.minor, 'HKD', { showCode: false }), 'HK$ 0.00');

  const pForHkd = emptyCurStore.saveProduct({
    categoryId: 'cat-base',
    name: '测试粉底',
    specificationValue: '30',
    specificationUnit: 'ml',
  }).product;
  assert.equal(pForHkd.specification, '30 ml');
  assert.deepEqual(parseSpecificationParts('30ml'), { value: '30', unit: 'ml', customUnit: '' });
  assert.equal(formatSpecification({ value: '12', unit: '其他', customUnit: '片' }), '12 片');
  assert.equal(SPEC_UNITS.includes('盒'), true);

  emptyCurStore.saveProductItem({
    productId: pForHkd.id,
    status: 'in_use',
    currencyCode: 'HKD',
    purchasePriceInput: '480.00',
  });
  const homeHkdFilled = emptyCurStore.getHomeSummary();
  assert.equal(homeHkdFilled.selectedCurrencyTotal.minor, '48000');

  // 4. 妆容 7 天回收站：软删除、恢复、引用图片保护、到期自动清理、不连带删除产品
  const sharedAsset = await reloadedHomeStore.addImageFileAsset({ name: 'shared.png', type: 'image/png', size: 1200 });
  const uniqueAsset = await reloadedHomeStore.addImageFileAsset({ name: 'unique.png', type: 'image/png', size: 900 });
  reloadedHomeStore.addProductPhoto('prod-lip-196', sharedAsset.id);

  const prodCountBefore = reloadedHomeStore.state.products.length;
  const itemCountBefore = reloadedHomeStore.state.productItems.length;

  const look1 = reloadedHomeStore.saveLook({
    name: '测试回收站妆容 A',
    lookDate: '2026-11-20',
    assetIds: [sharedAsset.id, uniqueAsset.id],
    selectedItems: [{ productItemId: itemDualRes.item.id }],
  }).look;

  const t0 = new Date('2026-11-20T10:00:00Z');
  const softDel = reloadedHomeStore.softDeleteLook(look1.id, t0);
  assert.equal(softDel.ok, true);
  assert.equal(reloadedHomeStore.getActiveLooks().some((l) => l.id === look1.id), false);
  assert.equal(reloadedHomeStore.getTrashLooks(t0).length, 1);
  assert.equal(reloadedHomeStore.getTrashLooks(t0)[0].remainingDays, LOOK_TRASH_RETENTION_DAYS);
  assert.equal(mediaOps.blobs.has(uniqueAsset.id), true); // 回收站期间保留照片以便恢复

  // 3 天后恢复
  const restoreRes = reloadedHomeStore.restoreLookFromTrash(look1.id);
  assert.equal(restoreRes.ok, true);
  assert.equal(reloadedHomeStore.getActiveLooks().some((l) => l.id === look1.id), true);
  assert.equal(reloadedHomeStore.getTrashLooks(t0).length, 0);

  // 再次软删除：第 6 天启动不清理；第 8 天启动自动永久清理
  reloadedHomeStore.softDeleteLook(look1.id, t0);
  const day6 = new Date('2026-11-26T10:00:00Z');
  const notYet = await reloadedHomeStore.purgeExpiredLooks(day6);
  assert.equal(notYet.purgedCount, 0);

  const day8 = new Date('2026-11-28T10:00:00Z');
  const purged = await reloadedHomeStore.purgeExpiredLooks(day8);
  assert.equal(purged.purgedCount, 1);
  assert.equal(reloadedHomeStore.state.looks.some((l) => l.id === look1.id), false);
  assert.equal(reloadedHomeStore.state.products.length, prodCountBefore); // 不连带删除 Product
  assert.equal(reloadedHomeStore.state.productItems.length, itemCountBefore); // 不连带删除 ProductItem
  assert.equal(mediaOps.blobs.has(uniqueAsset.id), false); // 无其他引用 -> 清理 Blob
  assert.equal(mediaOps.blobs.has(sharedAsset.id), true); // 仍被 prod-lip-196 引用 -> 必须保留 Blob

  // 5. 白名单分享卡片字段提取（严禁泄露价格、获得方式、私人备注）
  const payload = buildShareCardPayload({
    look: {
      name: '清透通勤妆',
      lookDate: '2026-11-25',
      style: '伪素颜',
      scene: '日常上班',
      durationMinutes: 18,
      selfRating: 5,
      notesPrivate: '绝不能公开的私人备注_SECRET',
    },
    items: [
      {
        brandNameSnapshot: 'Lancôme',
        productNameSnapshot: '菁纯唇膏',
        shadeSnapshot: '#196',
        purchasePriceMinor: '32000',
        acquisitionMethod: { preset: '专柜', customText: '' },
      },
    ],
    wearList: [{ timepointKey: '4小时', overallRating: 4 }],
    shareOpts: { cardType: 'look', showPhoto: true, showProducts: true, showWear: true },
  });
  const payloadJson = JSON.stringify(payload);
  assert.equal(payload.titlePrefix, '妆容展示卡');
  assert.equal(payload.showPhoto, true);
  assert.equal(payloadJson.includes('绝不能公开的私人备注_SECRET'), false);
  assert.equal(payloadJson.includes('32000'), false);
  assert.equal(payloadJson.includes('专柜'), false);
  assert.equal(payloadJson.includes('Lancôme 菁纯唇膏 #196'), true);

  const listPayload = buildShareCardPayload({
    look: { name: '清单测试', lookDate: '2026-11-25' },
    items: [],
    shareOpts: { cardType: 'list', showPhoto: true },
  });
  assert.equal(listPayload.showPhoto, false);
  assert.equal(listPayload.titlePrefix, '产品清单卡');
  assert.equal(listPayload.footerRight, '');

  // 6. 删除产品主档：清理名下实例与无引用 Blob，但保留历史妆容快照不失真
  const lookWithProd = reloadedHomeStore.saveLook({
    name: '删除保护测试妆容',
    lookDate: '2026-11-25',
    selectedItems: [{ productItemId: itemDualRes.item.id }],
  }).look;
  const delProdRes = await reloadedHomeStore.deleteProductSafe('prod-lip-196');
  assert.equal(delProdRes.ok, true);
  assert.equal(reloadedHomeStore.state.products.some((p) => p.id === 'prod-lip-196'), false);
  const keptSnap = reloadedHomeStore.state.lookProductItems.find((lpi) => lpi.lookId === lookWithProd.id);
  assert.ok(keptSnap);
  assert.equal(keptSnap.productItemId, null);
  assert.equal(keptSnap.productNameSnapshot, '菁纯丝绒雾面唇膏');
});
