/**
 * 妆匣 BeautyBox · 浏览器交互原型（TASK 02）
 * 媒体资产存储（IndexedDB Blob）与本地离线 SVG 示例图生成器
 *
 * 严格约束：
 * - 用户实际选择的图片文件以 Blob 形式保存在浏览器 IndexedDB（数据库 beautybox_prototype_media）
 * - 严禁将图片 Base64 存入 localStorage（localStorage 仅存 mediaAssets 元数据与 sampleKey / idb 标识）
 * - 示例图片由本地 SVG 模板按 sampleKey 实时生成，零外网图床依赖
 * - 清空模拟数据时调用 clearAllMediaBlobs() 同步清理 IndexedDB
 */

import { PrototypeSaveError, recordDiagnostic } from './diagnostics.js';

const IDB_NAME = 'beautybox_prototype_media';
const IDB_VERSION = 1;
const STORE_NAME = 'blobs';
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|heic|heif|bmp|avif)$/i;

const objectUrlCache = new Map();
let dbPromise = null;

function openMediaDb() {
  if (typeof indexedDB === 'undefined') {
    const err = new PrototypeSaveError('idb_open_failed', new Error('当前浏览器环境不支持 IndexedDB'));
    recordDiagnostic('idb_open_failed', err, { storageMode: 'indexeddb' });
    return Promise.reject(err);
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(IDB_NAME, IDB_VERSION);
    } catch (e) {
      dbPromise = null;
      const err = new PrototypeSaveError('idb_open_failed', e);
      recordDiagnostic('idb_open_failed', err, { storageMode: 'indexeddb' });
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onblocked = () => {
      dbPromise = null;
      const err = new PrototypeSaveError('idb_open_failed', new Error('IndexedDB 打开被其他标签页阻塞'));
      recordDiagnostic('idb_open_failed', err, { storageMode: 'indexeddb' });
      reject(err);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      const err = new PrototypeSaveError('idb_open_failed', req.error || new Error('无法打开 IndexedDB'));
      recordDiagnostic('idb_open_failed', err, { storageMode: 'indexeddb' });
      reject(err);
    };
  });
  return dbPromise;
}

/**
 * 将 File/Blob 转为独立 Blob，避免 iOS Safari 在经过异步步骤或文件选择器切换后 File 句柄失效。
 */
async function stabilizeBlob(fileOrBlob) {
  if (!fileOrBlob) {
    throw new PrototypeSaveError('file_read_failed', new Error('未获取到有效图片对象'));
  }
  if (typeof fileOrBlob.arrayBuffer === 'function') {
    try {
      const buf = await fileOrBlob.arrayBuffer();
      const type = fileOrBlob.type || inferMimeFromName(fileOrBlob.name) || 'image/jpeg';
      return new Blob([buf], { type });
    } catch (e) {
      throw new PrototypeSaveError('file_read_failed', e);
    }
  }
  return fileOrBlob;
}

function inferMimeFromName(name = '') {
  const lower = String(name).toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return '';
}

export async function saveMediaBlob(id, fileOrBlob) {
  let stableBlob;
  try {
    stableBlob = await stabilizeBlob(fileOrBlob);
  } catch (err) {
    recordDiagnostic(err.stage || 'file_read_failed', err, {
      fileType: fileOrBlob?.type || '',
      fileSize: fileOrBlob?.size || 0,
    });
    throw err;
  }

  const db = await openMediaDb();
  await new Promise((resolve, reject) => {
    let tx;
    let putReq;
    try {
      tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      putReq = store.put({ id, blob: stableBlob, updatedAt: new Date().toISOString() });
    } catch (e) {
      const err = new PrototypeSaveError('idb_tx_failed', e);
      recordDiagnostic('idb_tx_failed', err, { fileSize: stableBlob.size || 0 });
      reject(err);
      return;
    }

    let settled = false;
    putReq.onerror = () => {
      if (settled) return;
      settled = true;
      const err = new PrototypeSaveError('idb_blob_write_failed', putReq.error || new Error('写入图片 Blob 失败'));
      recordDiagnostic('idb_blob_write_failed', err, { fileSize: stableBlob.size || 0, fileType: stableBlob.type || '' });
      reject(err);
    };
    tx.onabort = () => {
      if (settled) return;
      settled = true;
      const err = new PrototypeSaveError('idb_tx_failed', tx.error || new Error('IndexedDB 写入事务中止'));
      recordDiagnostic('idb_tx_failed', err, { fileSize: stableBlob.size || 0 });
      reject(err);
    };
    tx.onerror = () => {
      if (settled) return;
      settled = true;
      const err = new PrototypeSaveError('idb_tx_failed', tx.error || new Error('IndexedDB 事务错误'));
      recordDiagnostic('idb_tx_failed', err, { fileSize: stableBlob.size || 0 });
      reject(err);
    };
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
  });

  if (objectUrlCache.has(id)) {
    URL.revokeObjectURL(objectUrlCache.get(id));
  }
  const url = URL.createObjectURL(stableBlob);
  objectUrlCache.set(id, url);
  return url;
}

export async function getMediaBlob(id) {
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = () => reject(req.error || new Error('读取图片 Blob 失败'));
  });
}

export async function deleteMediaBlob(id) {
  if (objectUrlCache.has(id)) {
    URL.revokeObjectURL(objectUrlCache.get(id));
    objectUrlCache.delete(id);
  }
  const db = await openMediaDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('删除图片 Blob 失败'));
  });
}

export async function clearAllMediaBlobs() {
  for (const url of objectUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  objectUrlCache.clear();
  if (typeof indexedDB === 'undefined') return;
  const db = await openMediaDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('清空 IndexedDB 图片失败'));
  });
}

export async function listMediaBlobIds() {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error || new Error('读取图片列表失败'));
  });
}

/** 启动或刷新后将 IndexedDB 中已保存的 Blob 恢复为内存 ObjectURL */
export async function hydrateMediaAssets(mediaAssets = []) {
  if (typeof indexedDB === 'undefined') return { restored: 0, missingIds: [] };
  let restored = 0;
  const missingIds = [];
  for (const asset of mediaAssets) {
    if (!asset || asset.kind !== 'idb') continue;
    if (objectUrlCache.has(asset.id)) {
      restored += 1;
      continue;
    }
    try {
      const blob = await getMediaBlob(asset.id);
      if (blob) {
        objectUrlCache.set(asset.id, URL.createObjectURL(blob));
        restored += 1;
      } else {
        missingIds.push(asset.id);
      }
    } catch {
      missingIds.push(asset.id);
    }
  }
  return { restored, missingIds };
}

/** 读取图片尺寸，不生成 Base64 */
export function readImageDimensions(file) {
  return new Promise((resolve) => {
    const tempUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth || 0, height: img.naturalHeight || 0 };
      URL.revokeObjectURL(tempUrl);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(tempUrl);
      resolve({ width: 0, height: 0 });
    };
    img.src = tempUrl;
  });
}

/** 校验用户选择的文件（兼容部分 iOS Safari 文件选择器 MIME 为空但文件名后缀为图片的情况，限制单张 15MB） */
export function validateImageFile(file) {
  if (!file) return '未选择图片文件';
  const hasImageMime = typeof file.type === 'string' && file.type.startsWith('image/');
  const hasImageExt = typeof file.name === 'string' && IMAGE_EXT_RE.test(file.name);
  if (!hasImageMime && !hasImageExt) {
    return '请选择有效的图片文件（JPG / PNG / HEIC / WebP）';
  }
  if (file.size > 15 * 1024 * 1024) {
    return '单张图片不能超过 15 MB';
  }
  return null;
}

/* ---------------- 离线本地 SVG 示例图与占位图 ---------------- */

const SAMPLE_ARTWORKS = Object.freeze({
  'sample-foundation': {
    bg: '#F3ECE6',
    accent: '#CBB29E',
    sub: '#8E735E',
    label: 'SILK SERUM',
    title: '养肤粉底液',
    shape: 'bottle',
  },
  'sample-lipstick': {
    bg: '#F5EAEB',
    accent: '#B9787B',
    sub: '#7E4E52',
    label: 'VELVET LIP',
    title: '丝绒唇釉',
    shape: 'lipstick',
  },
  'sample-lipstick-detail': {
    bg: '#EFE4E6',
    accent: '#9E6166',
    sub: '#6E3F43',
    label: 'SWATCH #196',
    title: '手背试色',
    shape: 'swatch',
  },
  'sample-blush': {
    bg: '#F6ECE9',
    accent: '#D59E94',
    sub: '#9A6B62',
    label: 'CHEEK CLOUD',
    title: '柔雾腮红',
    shape: 'compact',
  },
  'sample-eyeshadow': {
    bg: '#EEECE9',
    accent: '#9C8D81',
    sub: '#635850',
    label: 'QUAD PALETTE',
    title: '四色眼影盘',
    shape: 'palette',
  },
  'sample-serum': {
    bg: '#EAF0EC',
    accent: '#8FA899',
    sub: '#546E5E',
    label: 'CALM DROPS',
    title: '修护精华',
    shape: 'dropper',
  },
  'sample-look-commute': {
    bg: '#F2EBE5',
    accent: '#C49A87',
    sub: '#7D5C4E',
    label: 'DAILY LOOK',
    title: '早八清透伪素颜',
    shape: 'portrait-soft',
  },
  'sample-look-commute-4h': {
    bg: '#EDE8E3',
    accent: '#B3917F',
    sub: '#6E5548',
    label: 'WEAR CHECK · 4H',
    title: '带妆 4 小时实测',
    shape: 'wear-check',
  },
  'sample-look-date': {
    bg: '#F3E8EA',
    accent: '#BA7E83',
    sub: '#79474C',
    label: 'ROSE VELVET',
    title: '玫瑰茶棕约会妆',
    shape: 'portrait-rose',
  },
  'sample-diary-calm': {
    bg: '#ECF1ED',
    accent: '#87A292',
    sub: '#4D6758',
    label: 'SKIN LOG',
    title: '换季修护记录',
    shape: 'skin-note',
  },
});

function buildSampleSvg(spec) {
  let centerGraphic = '';
  switch (spec.shape) {
    case 'bottle':
      centerGraphic = `
        <rect x="116" y="64" width="48" height="24" rx="6" fill="${spec.sub}" opacity="0.88"/>
        <rect x="128" y="88" width="24" height="14" rx="2" fill="${spec.accent}"/>
        <rect x="96" y="102" width="88" height="122" rx="18" fill="#FFFFFF" stroke="${spec.accent}" stroke-width="2.5"/>
        <rect x="108" y="128" width="64" height="72" rx="8" fill="${spec.accent}" opacity="0.32"/>
      `;
      break;
    case 'lipstick':
      centerGraphic = `
        <path d="M126 62 C126 52, 154 52, 154 78 L154 114 L126 114 Z" fill="${spec.sub}"/>
        <rect x="118" y="114" width="44" height="28" rx="4" fill="${spec.accent}" opacity="0.65"/>
        <rect x="112" y="142" width="56" height="82" rx="10" fill="#FFFFFF" stroke="${spec.sub}" stroke-width="2.2"/>
      `;
      break;
    case 'swatch':
      centerGraphic = `
        <ellipse cx="140" cy="122" rx="54" ry="26" transform="rotate(-14 140 122)" fill="${spec.accent}" opacity="0.85"/>
        <ellipse cx="142" cy="166" rx="44" ry="18" transform="rotate(-10 142 166)" fill="${spec.sub}" opacity="0.68"/>
      `;
      break;
    case 'compact':
      centerGraphic = `
        <circle cx="140" cy="142" r="56" fill="#FFFFFF" stroke="${spec.accent}" stroke-width="2.5"/>
        <circle cx="140" cy="142" r="38" fill="${spec.accent}" opacity="0.72"/>
      `;
      break;
    case 'palette':
      centerGraphic = `
        <rect x="80" y="88" width="120" height="106" rx="16" fill="#FFFFFF" stroke="${spec.sub}" stroke-width="2.2"/>
        <rect x="94" y="102" width="40" height="34" rx="8" fill="#DFD1C5"/>
        <rect x="146" y="102" width="40" height="34" rx="8" fill="#C4A693"/>
        <rect x="94" y="146" width="40" height="34" rx="8" fill="#A68C7D"/>
        <rect x="146" y="146" width="40" height="34" rx="8" fill="#7D685E"/>
      `;
      break;
    case 'dropper':
      centerGraphic = `
        <rect x="132" y="58" width="16" height="32" rx="8" fill="${spec.sub}"/>
        <rect x="122" y="88" width="36" height="16" rx="4" fill="${spec.accent}"/>
        <rect x="102" y="104" width="76" height="118" rx="20" fill="#FFFFFF" stroke="${spec.accent}" stroke-width="2.5"/>
        <circle cx="140" cy="164" r="22" fill="${spec.accent}" opacity="0.35"/>
      `;
      break;
    case 'portrait-soft':
    case 'portrait-rose':
      centerGraphic = `
        <circle cx="140" cy="122" r="46" fill="#FFFFFF" opacity="0.88"/>
        <circle cx="122" cy="124" r="10" fill="${spec.accent}" opacity="0.55"/>
        <circle cx="158" cy="124" r="10" fill="${spec.accent}" opacity="0.55"/>
        <path d="M126 142 Q140 154 154 142" fill="none" stroke="${spec.sub}" stroke-width="3" stroke-linecap="round"/>
        <path d="M90 218 C94 180, 186 180, 190 218" fill="#FFFFFF" opacity="0.72"/>
      `;
      break;
    case 'wear-check':
      centerGraphic = `
        <circle cx="140" cy="134" r="52" fill="#FFFFFF" stroke="${spec.accent}" stroke-width="2.5"/>
        <path d="M140 98 L140 134 L164 146" fill="none" stroke="${spec.sub}" stroke-width="3.5" stroke-linecap="round"/>
      `;
      break;
    default:
      centerGraphic = `
        <rect x="92" y="84" width="96" height="112" rx="18" fill="#FFFFFF" stroke="${spec.accent}" stroke-width="2.5"/>
        <line x1="112" y1="120" x2="168" y2="120" stroke="${spec.accent}" stroke-width="3" stroke-linecap="round"/>
        <line x1="112" y1="142" x2="156" y2="142" stroke="${spec.accent}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
        <line x1="112" y1="164" x2="144" y2="164" stroke="${spec.accent}" stroke-width="3" stroke-linecap="round" opacity="0.4"/>
      `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 280" width="280" height="280">
    <rect width="280" height="280" rx="28" fill="${spec.bg}"/>
    <circle cx="228" cy="52" r="36" fill="${spec.accent}" opacity="0.16"/>
    <circle cx="48" cy="236" r="44" fill="${spec.accent}" opacity="0.12"/>
    ${centerGraphic}
    <text x="140" y="252" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="12" letter-spacing="1.8" font-weight="600" fill="${spec.sub}" opacity="0.88">${spec.label}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function getSampleArtworkOptions() {
  return Object.entries(SAMPLE_ARTWORKS).map(([key, spec]) => ({
    key,
    title: spec.title,
    label: spec.label,
    url: buildSampleSvg(spec),
  }));
}

/** 解析任意 mediaAsset 的可展示 URL（IndexedDB ObjectURL 或离线示例 SVG） */
export function resolveMediaUrl(asset) {
  if (!asset) return null;
  if (asset.kind === 'sample') {
    const spec = SAMPLE_ARTWORKS[asset.sampleKey];
    return spec ? buildSampleSvg(spec) : null;
  }
  if (asset.kind === 'idb') {
    return objectUrlCache.get(asset.id) || null;
  }
  return null;
}

/** 按产品分类生成无封面占位 SVG（绝不依赖网络图床） */
export function buildCategoryPlaceholderUrl(categoryName = '美妆') {
  const paletteMap = {
    底妆: { bg: '#F4EFE9', fg: '#8F7865', tag: 'BASE' },
    唇妆: { bg: '#F5EAEB', fg: '#9A6368', tag: 'LIP' },
    眼妆: { bg: '#EEECE9', fg: '#71655C', tag: 'EYE' },
    腮红修容: { bg: '#F6ECE8', fg: '#A37065', tag: 'CHEEK' },
    护肤: { bg: '#EBF1ED', fg: '#5D7968', tag: 'CARE' },
  };
  const pal = paletteMap[categoryName] || { bg: '#F1EFEA', fg: '#78726B', tag: 'ITEM' };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
    <rect width="240" height="240" rx="24" fill="${pal.bg}"/>
    <rect x="74" y="68" width="92" height="92" rx="22" fill="#FFFFFF" opacity="0.82" stroke="${pal.fg}" stroke-width="1.8" stroke-dasharray="5 4"/>
    <text x="120" y="120" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="14" font-weight="600" fill="${pal.fg}">${pal.tag}</text>
    <text x="120" y="196" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="500" fill="${pal.fg}" opacity="0.85">暂无封面 · ${categoryName}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
