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
  expiryStatus,
  missingExpiryInputs,
  resolveExpiry,
} from '../js/expiry.js';
import { PrototypeStore, STORAGE_KEY } from '../js/store.js';

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

test('多币种精确转换与往返一致：CNY/USD 2位、JPY 0位、KWD 3位', () => {
  const cases = [
    { code: 'CNY', input: '12.34', minor: '1234', dec: '12.34', formatted: '¥ 12.34' },
    { code: 'CNY', input: '0.05', minor: '5', dec: '0.05', formatted: '¥ 0.05' },
    { code: 'CNY', input: '320', minor: '32000', dec: '320.00', formatted: '¥ 320.00' },
    { code: 'USD', input: '12.34', minor: '1234', dec: '12.34', formatted: 'US$ 12.34' },
    { code: 'JPY', input: '1234', minor: '1234', dec: '1234', formatted: 'JP¥ 1,234' },
    { code: 'KWD', input: '12.345', minor: '12345', dec: '12.345', formatted: 'KD 12.345' },
    { code: 'KWD', input: '0.005', minor: '5', dec: '0.005', formatted: 'KD 0.005' },
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

  const jpyDec = parseAmountToMinor('12.5', 'JPY');
  assert.equal(jpyDec.ok, false);
  assert.equal(jpyDec.code, 'PRECISION');

  const kwd4 = parseAmountToMinor('1.2345', 'KWD');
  assert.equal(kwd4.ok, false);
  assert.equal(kwd4.code, 'PRECISION');

  assert.throws(() => addMoney({ currencyCode: 'CNY', minor: '100' }, { currencyCode: 'USD', minor: '100' }));

  const grouped = sumByCurrency([
    { currencyCode: 'CNY', minor: '1234' },
    { currencyCode: 'JPY', minor: '1234' },
    { currencyCode: 'KWD', minor: '12345' },
    { currencyCode: 'CNY', minor: '66' },
  ]);
  assert.equal(grouped.length, 3);
  assert.deepEqual(
    grouped.map((g) => [g.currencyCode, g.minor]),
    [
      ['CNY', '1300'],
      ['JPY', '1234'],
      ['KWD', '12345'],
    ],
  );
});

test('有效期规则：不猜测缺项、月末边界正确、不覆盖用户确认日期', () => {
  assert.equal(addMonths('2025-01-31', 1), '2025-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');

  const incomplete = { manufactureDate: '2025-01-01', unopenedShelfMonths: null, openedDate: null, paoMonths: null };
  assert.deepEqual(deriveComputedExpiry(incomplete), { computedExpiryDate: null, expiryBasis: 'none' });
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
    currencyCode: 'KWD',
    purchasePriceInput: '12.345',
    openedDate: '2026-01-01',
    paoMonths: '12',
    confirmedExpiryDate: '2027-06-30',
  });
  assert.equal(created.ok, true);
  assert.equal(created.item.purchasePriceMinor, '12345');
  assert.equal(created.item.confirmedExpiryDate, '2027-06-30');
  assert.equal(created.item.expiryNeedsReconfirm, false);

  const updated = store.saveProductItem({
    id: created.item.id,
    productId: 'prod-lip-196',
    status: 'in_use',
    currencyCode: 'KWD',
    purchasePriceInput: '12.345',
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
