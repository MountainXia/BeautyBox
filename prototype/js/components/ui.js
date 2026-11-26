/**
 * 妆匣 BeautyBox · 浏览器交互原型（TASK 02）
 * 通用 UI 组件与安全渲染工具
 */

import { buildCategoryPlaceholderUrl, getSampleArtworkOptions } from '../assets.js';

export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderStars(rating = 0) {
  const n = Math.max(0, Math.min(5, Number(rating) || 0));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

export function formatBytes(bytes = 0) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getProductDisplayImageUrl(store, productId) {
  const coverPhoto = store.getProductCoverPhoto(productId);
  if (coverPhoto) {
    const url = store.getAssetUrl(coverPhoto.assetId);
    if (url) return { url, isPlaceholder: false, isFallback: !coverPhoto.isCover, photo: coverPhoto };
  }
  const prod = store.state.products.find((p) => p.id === productId);
  const catName = prod ? store.getCategoryName(prod.categoryId) : '美妆';
  return {
    url: buildCategoryPlaceholderUrl(catName),
    isPlaceholder: true,
    isFallback: false,
    photo: null,
  };
}

export function renderEmptyState({ icon = '✦', title, desc = '', descHtml = '', actionLabel = '', actionAttr = '' }) {
  return `
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">${esc(icon)}</div>
      <div style="font-weight:700;font-size:15px;">${esc(title)}</div>
      <div class="muted-note" style="max-width:300px;line-height:1.55;">${descHtml || esc(desc)}</div>
      ${actionLabel ? `<button type="button" class="btn btn-primary btn-sm" ${actionAttr}>${esc(actionLabel)}</button>` : ''}
    </div>
  `;
}

let activeModalCount = 0;

function syncVisualViewport() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (vv) {
    root.style.setProperty('--vv-height', `${Math.round(vv.height)}px`);
    root.style.setProperty('--vv-offset-top', `${Math.round(vv.offsetTop)}px`);
  } else if (typeof window !== 'undefined') {
    root.style.setProperty('--vv-height', `${window.innerHeight}px`);
    root.style.setProperty('--vv-offset-top', '0px');
  }
}

function setModalLock(open) {
  if (typeof document === 'undefined') return;
  activeModalCount = Math.max(0, activeModalCount + (open ? 1 : -1));
  document.documentElement.classList.toggle('has-modal-open', activeModalCount > 0);
  if (activeModalCount > 0) {
    syncVisualViewport();
  }
}

if (typeof window !== 'undefined' && window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncVisualViewport);
  window.visualViewport.addEventListener('scroll', syncVisualViewport);
}

/** 统一展示表单错误横幅并滚动到可见位置，绝不吞掉或隐藏失败提示 */
export function showFormError(errEl, msg, toast = null) {
  if (errEl) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
    if (typeof errEl.scrollIntoView === 'function') {
      errEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
  if (typeof toast === 'function') {
    toast(msg);
  }
}

export function renderUploadPreview({ previewUrl, title, badgeText = '', subtitle = '' }) {
  if (!previewUrl) return '';
  return `
    <div class="upload-preview-box">
      <img class="upload-preview-thumb" src="${esc(previewUrl)}" alt="${esc(title || '预览缩略图')}" />
      <div style="min-width:0;flex:1;">
        <div class="row-wrap" style="gap:6px;">
          ${badgeText ? `<span class="pill pill-accent">${esc(badgeText)}</span>` : ''}
          <span style="font-size:13px;font-weight:600;word-break:break-word;">${esc(title || '已选择图片')}</span>
        </div>
        ${subtitle ? `<div class="muted-note" style="margin-top:3px;">${esc(subtitle)}</div>` : ''}
      </div>
    </div>
  `;
}

/** 底部 Sheet 控制器 */
export function createSheetManager(rootEl) {
  let closeHandler = null;
  let isOpen = false;

  function close() {
    if (!isOpen && !rootEl.innerHTML) return;
    isOpen = false;
    rootEl.innerHTML = '';
    rootEl.classList.remove('is-open');
    rootEl.setAttribute('aria-hidden', 'true');
    setModalLock(false);
    if (closeHandler) {
      const fn = closeHandler;
      closeHandler = null;
      fn();
    }
  }

  function open({ title, bodyHtml, onMount, onClose, beforeClose }) {
    const wasOpen = isOpen;
    closeHandler = onClose || null;
    isOpen = true;
    rootEl.innerHTML = `
      <div class="sheet-backdrop" data-sheet-backdrop="1">
        <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="${esc(title)}">
          <div class="sheet-header">
            <h2 class="sheet-title">${esc(title)}</h2>
            <button type="button" class="btn btn-secondary btn-sm" data-sheet-close="1">关闭</button>
          </div>
          <div class="sheet-body">${bodyHtml}</div>
        </div>
      </div>
    `;
    rootEl.classList.add('is-open');
    rootEl.setAttribute('aria-hidden', 'false');
    if (!wasOpen) setModalLock(true);
    else syncVisualViewport();

    const tryClose = () => {
      if (typeof beforeClose === 'function' && beforeClose(rootEl) === false) return;
      close();
    };

    rootEl.querySelector('[data-sheet-close]')?.addEventListener('click', tryClose);
    rootEl.querySelector('[data-sheet-backdrop]')?.addEventListener('click', (e) => {
      if (e.target.dataset.sheetBackdrop === '1') tryClose();
    });

    if (typeof onMount === 'function') {
      onMount(rootEl.querySelector('.sheet-body'), close);
    }
  }

  return { open, close };
}

/** 确认弹窗控制器 */
export function createDialogManager(rootEl) {
  let isOpen = false;

  function close() {
    if (!isOpen && !rootEl.innerHTML) return;
    isOpen = false;
    rootEl.innerHTML = '';
    rootEl.classList.remove('is-open');
    rootEl.setAttribute('aria-hidden', 'true');
    setModalLock(false);
  }

  function confirm({ title, message, confirmLabel = '确认', cancelLabel = '取消', danger = false }) {
    return new Promise((resolve) => {
      const wasOpen = isOpen;
      isOpen = true;
      rootEl.innerHTML = `
        <div class="dialog-backdrop">
          <div class="dialog-panel" role="alertdialog" aria-modal="true">
            <div style="font-size:16px;font-weight:700;margin-bottom:8px;">${esc(title)}</div>
            <div style="font-size:14px;color:var(--text-secondary);line-height:1.55;margin-bottom:18px;">${esc(message)}</div>
            <div class="field-row">
              <button type="button" class="btn btn-secondary" data-dlg-cancel="1">${esc(cancelLabel)}</button>
              <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-dlg-ok="1">${esc(confirmLabel)}</button>
            </div>
          </div>
        </div>
      `;
      rootEl.classList.add('is-open');
      rootEl.setAttribute('aria-hidden', 'false');
      if (!wasOpen) setModalLock(true);
      else syncVisualViewport();
      rootEl.querySelector('[data-dlg-cancel]')?.addEventListener('click', () => {
        close();
        resolve(false);
      });
      rootEl.querySelector('[data-dlg-ok]')?.addEventListener('click', () => {
        close();
        resolve(true);
      });
    });
  }

  return { confirm, close };
}

export function createToastManager(rootEl) {
  return function showToast(msg, duration = 2600) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    rootEl.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, duration);
  };
}

/** 通用图片选择辅助：支持本地上传（存 IndexedDB）或挑选本地示例 SVG 图 */
export function renderSamplePickerGrid(selectedKey = '') {
  const opts = getSampleArtworkOptions();
  return `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;">
      ${opts
        .map(
          (o) => `
        <button type="button" class="chip ${selectedKey === o.key ? 'is-active' : ''}"
          data-pick-sample="${esc(o.key)}" title="${esc(o.title)}"
          style="padding:3px;height:auto;border-radius:10px;display:flex;flex-direction:column;align-items:center;gap:2px;">
          <img src="${o.url}" alt="${esc(o.title)}" style="width:42px;height:42px;border-radius:6px;" />
        </button>
      `,
        )
        .join('')}
    </div>
  `;
}

/** 底部 5 Tab 内联极简线性 SVG 图标 */
export const TAB_ICONS = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z" stroke-linejoin="round"/></svg>`,
  box: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M3 12h18"/></svg>`,
  looks: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3l2.2 4.8L19 10l-4.8 2.2L12 17l-2.2-4.8L5 10l4.8-2.2z" stroke-linejoin="round"/><path d="M18.5 16.5l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" stroke-linejoin="round"/></svg>`,
  daily: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4M16 2v4M8 11h8M8 15h5" stroke-linecap="round"/></svg>`,
  me: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0" stroke-linecap="round"/></svg>`,
};
