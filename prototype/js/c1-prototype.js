/**
 * 妆匣 BeautyBox · TASK02.1-C1 交互原型控制器
 * 重点验证：
 * 1. 添加产品单页连续流程（默认 1 件、名称选填自动组合、规格与数量单位分离、详细信息可选展开）
 * 2. 「未记录」状态与最新数量统计口径（未记录/未开封/使用中计入当前拥有；已用完保留历史）
 * 3. 产品列表 & 产品详情（零专业术语、单件展开查看与编辑、数量加减、状态操作、7天回收站恢复不覆盖新品）
 */

import {
  C1_ACQUISITION_PRESETS,
  C1_CATEGORY_TREE,
  C1_ITEM_STATUSES,
  C1_QUANTITY_UNITS,
  C1_SPEC_UNITS,
  composeProductDisplayName,
  createC1InitialState,
  describeC1ItemDualExpiry,
  evaluateC1QuickStatusOption,
  findCategoryNames,
  formatC1Price,
  formatSpecDisplay,
  hasC1LifecycleRecord,
  resolveC1ItemExpiryForDisplay,
  summarizeProductCounts,
  validateC1ItemTransitionAndFields,
} from './c1-mock-data.js';
import { CURRENCIES, CURRENCY_ORDER, minorToDecimalString, parseAmountToMinor } from './currency.js';
import { expiryStatus, resolveExpiry, todayStr } from './expiry.js';
import { buildCategoryPlaceholderUrl, getSampleArtworkOptions, validateImageFile } from './assets.js';
import {
  createDialogManager,
  createSheetManager,
  createToastManager,
  esc,
  formatBytes,
  renderEmptyState,
  renderSamplePickerGrid,
  renderUploadPreview,
  showFormError,
} from './components/ui.js';

let state = createC1InitialState();

const ui = {
  page: 'list', // 'list' | 'detail' | 'trash'
  selectedProductId: null,
  search: '',
  primaryCatId: 'all',
  statusFilter: 'all', // 'all' | 'in_use' | 'unopened' | 'unrecorded' | 'near' | 'used_up'
  expandedItemIds: new Set(),
  showUsedUpHistory: false,
};

const headerEl = document.getElementById('app-header');
const mainEl = document.getElementById('app-main');
const sheetRootEl = document.getElementById('sheet-root');
const dialogRootEl = document.getElementById('dialog-root');
const sheet = createSheetManager(sheetRootEl);
const dialog = createDialogManager(dialogRootEl);
const toast = createToastManager(document.getElementById('toast-root'));

/** iOS Safari 防卡死兜底：确保弹窗关闭后绝不残留 has-modal-open 锁死页面触控 */
function syncModalLockSafety() {
  const anyOpen =
    sheetRootEl?.classList.contains('is-open') || dialogRootEl?.classList.contains('is-open');
  if (!anyOpen) {
    document.documentElement.classList.remove('has-modal-open');
  }
}

if (typeof MutationObserver !== 'undefined' && sheetRootEl && dialogRootEl) {
  const obs = new MutationObserver(syncModalLockSafety);
  obs.observe(sheetRootEl, { attributes: true, attributeFilter: ['class'] });
  obs.observe(dialogRootEl, { attributes: true, attributeFilter: ['class'] });
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    syncModalLockSafety();
    toast(`页面异常：${e?.message || '未知错误'}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    syncModalLockSafety();
    toast(`操作异常：${e?.reason?.message || '未知错误'}`);
  });
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function getProductImageUrl(prod) {
  if (prod.imageUrl) return prod.imageUrl;
  if (prod.sampleKey) {
    const opt = getSampleArtworkOptions().find((o) => o.key === prod.sampleKey);
    if (opt) return opt.url;
  }
  const { primaryName } = findCategoryNames(prod.primaryCategoryId, prod.subCategoryId);
  return buildCategoryPlaceholderUrl(primaryName || '美妆');
}

function getDisplayName(prod) {
  const { primaryName, subName } = findCategoryNames(prod.primaryCategoryId, prod.subCategoryId);
  return composeProductDisplayName({
    customName: prod.customName,
    brand: prod.brand,
    primaryCategoryName: primaryName,
    subCategoryName: subName,
    shade: prod.shade,
  });
}

function setHeader({ title, subtitle = '', backBtnAttr = '', actionsHtml = '' }) {
  headerEl.innerHTML = `
    <div class="header-left">
      ${backBtnAttr ? `<button type="button" class="icon-btn" ${backBtnAttr}>← 返回</button>` : ''}
      <div class="header-title-wrap">
        <h1 class="header-title">${esc(title)}</h1>
        ${subtitle ? `<div class="header-subtitle">${esc(subtitle)}</div>` : ''}
      </div>
    </div>
    <div class="header-actions">${actionsHtml}</div>
  `;
}

/* ---------------- 视图 1：产品列表 ---------------- */

function renderListView() {
  const today = todayStr();
  const nearDays = state.settings.nearExpiryDays;
  const activeProducts = state.products.filter((p) => !p.deletedAt && !p.hiddenFromActive);
  const trashCount = state.products.filter((p) => Boolean(p.deletedAt)).length;

  let totalHeldUnits = 0;
  const rows = activeProducts.map((p) => {
    const sum = summarizeProductCounts(p, state.items, { today, nearDays });
    totalHeldUnits += sum.heldCount;
    return { prod: p, sum, displayName: getDisplayName(p) };
  });

  setHeader({
    title: '我的美妆（C1 原型）',
    subtitle: `${activeProducts.length} 款产品 · 共持有 ${totalHeldUnits} 件`,
    actionsHtml: `
      <button type="button" class="btn btn-secondary btn-sm" id="c1-open-trash">最近删除${trashCount > 0 ? ` (${trashCount})` : ''}</button>
      <button type="button" class="btn btn-primary btn-sm" id="c1-add-product">+ 添加产品</button>
    `,
  });

  const q = ui.search.trim().toLowerCase();
  const filtered = rows.filter(({ prod, sum, displayName }) => {
    if (ui.primaryCatId !== 'all' && prod.primaryCategoryId !== ui.primaryCatId) return false;
    if (ui.statusFilter === 'used_up') {
      if (sum.usedUpCount === 0) return false;
    } else if (ui.statusFilter === 'in_use') {
      if (sum.inUseCount === 0) return false;
    } else if (ui.statusFilter === 'unopened') {
      if (sum.unopenedCount === 0) return false;
    } else if (ui.statusFilter === 'unrecorded') {
      if (sum.unrecordedCount === 0) return false;
    } else if (ui.statusFilter === 'near') {
      if (sum.nearExpiryCount + sum.expiredCount === 0) return false;
    } else {
      // 默认“全部”视图只显示当前仍拥有至少 1 件的产品（避免已全部用完的老产品混杂当前库存认知）
      if (sum.heldCount === 0) return false;
    }
    if (q) {
      const { primaryName, subName } = findCategoryNames(prod.primaryCategoryId, prod.subCategoryId);
      const hay = [displayName, prod.brand, prod.shade, primaryName, subName].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const filterChips = [
    { id: 'all', label: '当前拥有' },
    { id: 'in_use', label: '使用中' },
    { id: 'unopened', label: '未开封' },
    { id: 'unrecorded', label: '待补充信息' },
    { id: 'near', label: '临期/过期' },
    { id: 'used_up', label: '已用完记录' },
  ];

  mainEl.innerHTML = `
    <div class="stack">
      <div class="card-muted" style="font-size:12px;line-height:1.5;">
        <div class="row-between" style="gap:8px;">
          <span><strong>C1 体验原型（纯模拟数据）</strong>：默认看产品、需要时看每一件；与正式数据完全隔离。</span>
          <button type="button" class="ghost-mini-btn" id="c1-reset-mock">重置演示</button>
        </div>
        <div class="row-wrap" style="margin-top:6px;">
          <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="c1-toggle-fx" ${state.settings.enableForeignCurrency ? 'checked' : ''} />
            <span>开启外币录入（默认仅人民币）</span>
          </label>
          ${state.settings.enableForeignCurrency ? `
            <select id="c1-default-currency" class="select" style="width:auto;height:30px;min-height:30px;line-height:28px;font-size:12px;padding:0 26px 0 8px;">
              ${CURRENCY_ORDER.map((c) => `<option value="${esc(c)}" ${state.settings.defaultCurrency === c ? 'selected' : ''}>默认 ${esc(CURRENCIES[c].name)}</option>`).join('')}
            </select>
          ` : ''}
        </div>
      </div>

      <div class="search-bar">
        <span style="color:var(--text-tertiary);">⌕</span>
        <input id="c1-search" type="search" placeholder="搜索产品名称、品牌、分类或色号" value="${esc(ui.search)}" />
      </div>

      <div class="chips-scroll">
        <button type="button" class="chip ${ui.primaryCatId === 'all' ? 'is-active' : ''}" data-c1-cat="all">全部分类</button>
        ${C1_CATEGORY_TREE.map(
          (c) => `<button type="button" class="chip ${ui.primaryCatId === c.id ? 'is-active' : ''}" data-c1-cat="${esc(c.id)}">${esc(c.name)}</button>`,
        ).join('')}
      </div>

      <div class="chips-scroll">
        ${filterChips
          .map(
            (f) => `<button type="button" class="chip ${ui.statusFilter === f.id ? 'is-active' : ''}" data-c1-status="${esc(f.id)}">${esc(f.label)}</button>`,
          )
          .join('')}
      </div>

      ${filtered.length === 0
        ? renderEmptyState({
            icon: '✧',
            title: '没有找到匹配的美妆产品',
            desc: '可以切换筛选条件，或点右上角「+ 添加产品」快速记一件。',
            actionLabel: '+ 添加产品',
            actionAttr: 'data-c1-empty-add="1"',
          })
        : `
          <div class="stack-sm">
            ${filtered
              .map(({ prod, sum, displayName }) => {
                const { primaryName, subName } = findCategoryNames(prod.primaryCategoryId, prod.subCategoryId);
                const unit = prod.quantityUnit || '件';
                const statusBits = [];
                if (sum.inUseCount > 0) statusBits.push(`${sum.inUseCount} ${unit}使用中`);
                if (sum.unopenedCount > 0) statusBits.push(`${sum.unopenedCount} ${unit}未开封`);
                if (sum.unrecordedCount > 0) statusBits.push(`${sum.unrecordedCount} ${unit}待补充信息`);

                return `
                  <button type="button" class="product-list-row" data-c1-open="${esc(prod.id)}">
                    <img class="product-list-thumb" src="${getProductImageUrl(prod)}" alt="${esc(displayName)}" />
                    <div style="flex:1;min-width:0;">
                      <div class="row-between" style="gap:6px;">
                        <div style="font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(displayName)}</div>
                        <span class="pill pill-accent">拥有 ${sum.heldCount} ${esc(unit)}</span>
                      </div>
                      <div class="muted-note" style="margin-top:2px;">
                        ${esc([primaryName, subName, formatSpecDisplay({ value: prod.specValue, unit: prod.specUnit, customUnit: prod.specCustomUnit })].filter(Boolean).join(' · '))}
                      </div>
                      <div class="row-wrap" style="margin-top:6px;">
                        ${statusBits.length > 0
                          ? `<span class="pill">${esc(statusBits.join(' · '))}</span>`
                          : `<span class="pill">已全部用完（历史 ${sum.usedUpCount} ${esc(unit)}）</span>`}
                        ${sum.expiredCount > 0 ? `<span class="pill pill-danger">${sum.expiredCount} ${esc(unit)}已过期</span>` : ''}
                        ${sum.nearExpiryCount > 0 ? `<span class="pill pill-amber">${sum.nearExpiryCount} ${esc(unit)}即将到期</span>` : ''}
                      </div>
                    </div>
                  </button>
                `;
              })
              .join('')}
          </div>
        `}
    </div>
  `;

  bindListEvents();
}

function bindListEvents() {
  headerEl.querySelector('#c1-add-product')?.addEventListener('click', () => openAddOrEditProductSheet());
  headerEl.querySelector('#c1-open-trash')?.addEventListener('click', () => {
    ui.page = 'trash';
    render();
  });
  mainEl.querySelector('[data-c1-empty-add]')?.addEventListener('click', () => openAddOrEditProductSheet());
  mainEl.querySelector('#c1-reset-mock')?.addEventListener('click', () => {
    state = createC1InitialState();
    ui.expandedItemIds.clear();
    toast('已重置 C1 模拟数据');
    render();
  });
  mainEl.querySelector('#c1-toggle-fx')?.addEventListener('change', (e) => {
    state.settings.enableForeignCurrency = e.target.checked;
    render();
  });
  mainEl.querySelector('#c1-default-currency')?.addEventListener('change', (e) => {
    state.settings.defaultCurrency = e.target.value;
    toast(`默认币种已改为 ${CURRENCIES[e.target.value]?.name || e.target.value}`);
  });
  mainEl.querySelector('#c1-search')?.addEventListener('input', (e) => {
    ui.search = e.target.value;
    render({ preserveFocusId: 'c1-search' });
  });
  mainEl.querySelectorAll('[data-c1-cat]').forEach((el) => {
    el.addEventListener('click', () => {
      ui.primaryCatId = el.dataset.c1Cat;
      render();
    });
  });
  mainEl.querySelectorAll('[data-c1-status]').forEach((el) => {
    el.addEventListener('click', () => {
      ui.statusFilter = el.dataset.c1Status;
      render();
    });
  });
  mainEl.querySelectorAll('[data-c1-open]').forEach((el) => {
    el.addEventListener('click', () => {
      ui.selectedProductId = el.dataset.c1Open;
      ui.page = 'detail';
      ui.showUsedUpHistory = false;
      render();
    });
  });
}

/* ---------------- 视图 2：产品详情与每件管理 ---------------- */

function renderDetailView() {
  const prod = state.products.find((p) => p.id === ui.selectedProductId && !p.deletedAt);
  if (!prod) {
    ui.page = 'list';
    renderListView();
    return;
  }

  const today = todayStr();
  const nearDays = state.settings.nearExpiryDays;
  const displayName = getDisplayName(prod);
  const { primaryName, subName } = findCategoryNames(prod.primaryCategoryId, prod.subCategoryId);
  const specText = formatSpecDisplay({ value: prod.specValue, unit: prod.specUnit, customUnit: prod.specCustomUnit });
  const sum = summarizeProductCounts(prod, state.items, { today, nearDays });
  const unit = prod.quantityUnit || '件';

  setHeader({
    title: displayName,
    subtitle: [primaryName, subName, specText].filter(Boolean).join(' · '),
    backBtnAttr: 'id="c1-back-list"',
    actionsHtml: `<button type="button" class="btn btn-secondary btn-sm" id="c1-edit-product">编辑</button>`,
  });

  const renderItemCard = (item, idx, isHistory = false) => {
    const stObj = C1_ITEM_STATUSES[item.status] || C1_ITEM_STATUSES.unrecorded;
    const isExpanded = ui.expandedItemIds.has(item.id);
    const resolved = resolveC1ItemExpiryForDisplay(item);
    const expSt = expiryStatus(resolved, today, nearDays);
    const priceText = formatC1Price(item.purchasePriceMinor, item.currencyCode);

    let shortExpiry = '未记录有效期';
    if (resolved.date) {
      shortExpiry = resolved.source === 'confirmed' ? `到期 ${resolved.date}` : `参考到期 ${resolved.date}`;
    }

    const statusOptions = [
      { key: 'unrecorded', label: '未记录' },
      { key: 'unopened', label: '未开封' },
      { key: 'in_use', label: '使用中' },
      { key: 'used_up', label: '已用完' },
    ];

    return `
      <div class="card" style="padding:12px 14px;">
        <div class="row-between" style="gap:8px;">
          <div class="row-wrap" style="gap:6px;">
            <strong style="font-size:14px;">第 ${idx + 1} ${esc(unit)}</strong>
            <span class="pill ${esc(stObj.pillClass)}">${esc(stObj.label)}</span>
            ${expSt.key === 'near' ? `<span class="pill pill-amber">${esc(expSt.label)}</span>` : ''}
            ${expSt.key === 'expired' ? `<span class="pill pill-danger">${esc(expSt.label)}</span>` : ''}
          </div>
          <button type="button" class="ghost-mini-btn" data-c1-expand-item="${esc(item.id)}">
            ${isExpanded ? '收起 ▴' : '展开详情 ▾'}
          </button>
        </div>

        <div class="row-between" style="margin-top:8px;font-size:12px;color:var(--text-secondary);">
          <span>${esc(shortExpiry)}</span>
          <span>剩余 ${item.remainingPercent}%${priceText ? ` · ${esc(priceText)}` : ''}</span>
        </div>

        ${isExpanded ? `
          <div class="divider"></div>
          <div class="stack-sm" style="font-size:12px;color:var(--text-secondary);">
            <div class="row-between" style="gap:8px;">
              <span>到期参考：<strong>${esc(shortExpiry)}</strong></span>
              <button type="button" class="help-icon-btn" data-c1-expiry-help="${esc(item.id)}" aria-label="查看有效期计算详情">?</button>
            </div>
            <div>购买记录：${priceText ? esc(priceText) : '未填金额'}${item.acquisitionMethod ? ` · ${esc(item.acquisitionMethod)}` : ''}</div>
          </div>

          <div class="stack-sm" style="margin-top:10px;">
            <div class="row-between">
              <span style="font-size:12px;color:var(--text-tertiary);">快速改状态</span>
              <span style="font-size:11px;color:var(--text-tertiary);">浅色虚线项不可选，点击可看原因</span>
            </div>
            <div class="segmented c1-status-bar">
              ${statusOptions
                .map((opt) => {
                  const ev = evaluateC1QuickStatusOption(item, opt.key);
                  const cls = ev.isCurrent ? 'is-active' : ev.allowed ? '' : 'is-unavailable';
                  return `<button type="button" class="seg-btn ${cls}" data-c1-status-action="${esc(item.id)}:${opt.key}" aria-pressed="${ev.isCurrent}" aria-disabled="${!ev.allowed}">${opt.label}</button>`;
                })
                .join('')}
            </div>
            <div class="row-between" style="margin-top:6px;gap:8px;">
              <button type="button" class="btn btn-secondary btn-sm" data-c1-edit-item="${esc(item.id)}">编辑详细信息</button>
              ${item.status === 'unopened'
                ? `<button type="button" class="btn btn-soft btn-sm" data-c1-open-today="${esc(item.id)}">今日开封</button>`
                : ''}
              <button type="button" class="ghost-mini-btn" data-c1-remove-item="${esc(item.id)}" style="color:var(--danger);border-color:rgba(180,75,75,0.28);margin-left:auto;">删掉这 1 ${esc(unit)}</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  };

  mainEl.innerHTML = `
    <div class="stack">
      <!-- 顶部简洁产品概览 -->
      <div class="card">
        <div class="row" style="gap:12px;align-items:flex-start;">
          <img src="${getProductImageUrl(prod)}" alt="${esc(displayName)}" style="width:76px;height:76px;object-fit:cover;border-radius:14px;flex-shrink:0;" />
          <div style="flex:1;min-width:0;">
            <div style="font-size:17px;font-weight:700;">${esc(displayName)}</div>
            <div class="muted-note" style="margin-top:3px;">
              ${esc([prod.brand, `${primaryName}·${subName}`, prod.shade, specText].filter(Boolean).join(' ｜ '))}
            </div>
            ${prod.notesPrivate ? `<div class="muted-note" style="margin-top:4px;">备注：${esc(prod.notesPrivate)}</div>` : ''}
          </div>
        </div>

        <div class="divider"></div>

        <!-- 拥有数量步进控制与状态分布 -->
        <div class="row-between" style="gap:10px;">
          <div>
            <div style="font-weight:700;font-size:15px;">当前拥有：${sum.heldCount} ${esc(unit)}</div>
            <div class="muted-note" style="margin-top:2px;">
              ${sum.heldCount > 0
                ? [
                    sum.inUseCount ? `使用中 ${sum.inUseCount}` : '',
                    sum.unopenedCount ? `未开封 ${sum.unopenedCount}` : '',
                    sum.unrecordedCount ? `待补充信息 ${sum.unrecordedCount}` : '',
                  ].filter(Boolean).join(' · ')
                : '当前暂无在手产品'}
              ${sum.usedUpCount > 0 ? `（历史用完 ${sum.usedUpCount} ${esc(unit)}）` : ''}
            </div>
          </div>
          <div class="row" style="gap:6px;">
            <button type="button" class="icon-btn" id="c1-qty-dec" ${sum.heldCount === 0 ? 'disabled' : ''} aria-label="减少一件">−</button>
            <button type="button" class="btn btn-primary btn-sm" id="c1-qty-inc">+ 添加一件</button>
          </div>
        </div>
      </div>

      <!-- 每件产品明细区（默认紧凑，点击展开） -->
      <div class="stack-sm">
        <div class="section-header" style="margin-bottom:0;">
          <h2 class="section-title">我的每件产品（${sum.heldCount} ${esc(unit)}）</h2>
          <span class="section-hint">点卡片可展开或修改状态</span>
        </div>
        ${sum.heldItems.length === 0
          ? renderEmptyState({
              icon: '🧴',
              title: '当前没有正在使用的这一款',
              desc: '新购入时点上方「+ 添加一件」，已有历史用完记录仍安全保留在下方。',
              actionLabel: '+ 添加一件',
              actionAttr: 'data-c1-detail-add-one="1"',
            })
          : sum.heldItems.map((it, idx) => renderItemCard(it, idx, false)).join('')}
      </div>

      <!-- 历史用完折叠区 -->
      ${sum.usedUpCount > 0 ? `
        <div class="card">
          <button type="button" class="me-accordion-trigger" id="c1-toggle-usedup" style="padding:0;min-height:32px;">
            <span style="font-weight:700;font-size:14px;">历史用完记录（${sum.usedUpCount} ${esc(unit)}）</span>
            <span class="muted-note">${ui.showUsedUpHistory ? '收起 ▴' : '展开查看 ▾'}</span>
          </button>
          ${ui.showUsedUpHistory ? `
            <div class="stack-sm" style="margin-top:12px;">
              ${sum.usedUpItems.map((it, idx) => renderItemCard(it, idx, true)).join('')}
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- 整款产品管理（与上面“删掉这 1 件”明确区分） -->
      <div class="card">
        <div class="row-between" style="gap:12px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;">整款产品管理</div>
            <div class="muted-note" style="margin-top:2px;">移除整款产品将进入「最近删除」保留 7 天，不影响历史妆容。</div>
          </div>
          <button type="button" class="btn btn-danger btn-sm" id="c1-remove-product" style="flex-shrink:0;">移除整款产品</button>
        </div>
      </div>
    </div>
  `;

  bindDetailEvents(prod, sum, unit);
}

function bindDetailEvents(prod, sum, unit) {
  headerEl.querySelector('#c1-back-list')?.addEventListener('click', () => {
    ui.page = 'list';
    render();
  });
  headerEl.querySelector('#c1-edit-product')?.addEventListener('click', () => openAddOrEditProductSheet(prod));

  const addOneItem = () => {
    const newItem = {
      id: uid('c1-i'),
      productId: prod.id,
      status: 'unrecorded',
      manufactureDate: null,
      unopenedShelfMonths: null,
      openedDate: null,
      paoMonths: null,
      confirmedExpiryDate: null,
      remainingPercent: 100,
      purchasePriceMinor: null,
      currencyCode: state.settings.defaultCurrency || 'CNY',
      acquisitionMethod: '',
      deletedAt: null,
    };
    state.items.push(newItem);
    ui.expandedItemIds.add(newItem.id);
    toast(`已增加 1 ${unit}（默认为未记录，可随时补充详情）`);
    render();
  };

  mainEl.querySelector('#c1-qty-inc')?.addEventListener('click', addOneItem);
  mainEl.querySelector('[data-c1-detail-add-one]')?.addEventListener('click', addOneItem);

  // 点击“−”减少数量时，明确区分「标记用完」和「移除这一件」
  mainEl.querySelector('#c1-qty-dec')?.addEventListener('click', () => {
    const target = sum.heldItems[sum.heldItems.length - 1];
    if (!target) return;
    sheet.open({
      title: `减少 1 ${unit}`,
      bodyHtml: `
        <div class="stack">
          <div class="muted-note">请选择减少这 1 ${esc(unit)}的原因，系统会按不同方式保留您的历史记录：</div>
          <button type="button" class="btn btn-primary btn-block" id="c1-dec-usedup">标记为已用完（退出当前拥有，保留历史）</button>
          <button type="button" class="btn btn-danger btn-block" id="c1-dec-remove">移除这一件（误录或不再保留）</button>
        </div>
      `,
      onMount: (body, close) => {
        body.querySelector('#c1-dec-usedup')?.addEventListener('click', () => {
          target.status = 'used_up';
          target.remainingPercent = 0;
          close();
          toast('已标记为用完并保留至历史记录');
          render();
        });
        body.querySelector('#c1-dec-remove')?.addEventListener('click', () => {
          target.deletedAt = new Date().toISOString();
          close();
          toast('已移除这 1 件（不影响其他件和历史妆容）');
          render();
        });
      },
    });
  });

  mainEl.querySelectorAll('[data-c1-expand-item]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.c1ExpandItem;
      if (ui.expandedItemIds.has(id)) ui.expandedItemIds.delete(id);
      else ui.expandedItemIds.add(id);
      render();
    });
  });

  mainEl.querySelectorAll('[data-c1-expiry-help]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const it = state.items.find((x) => x.id === btn.dataset.c1ExpiryHelp);
      if (!it) return;
      const dual = describeC1ItemDualExpiry(it);
      sheet.open({
        title: '有效期计算详情',
        bodyHtml: `
          <div class="stack">
            <div class="card">
              <div class="stack-sm" style="font-size:13px;">
                <div><span class="muted-note">生产日期：</span>${esc(it.manufactureDate || '未填')} ｜ <span class="muted-note">未开封保质期：</span>${it.unopenedShelfMonths ? `${it.unopenedShelfMonths} 个月` : '未填'}</div>
                <div><span class="muted-note">开封日期：</span>${esc(it.openedDate || '未填')} ｜ <span class="muted-note">开封后期限：</span>${it.paoMonths ? `${it.paoMonths} 个月` : '未填'}</div>
              </div>
            </div>
            <div class="card">
              <div class="stack-sm" style="font-size:13px;">
                <div>• 未开封推算：${dual.unopened.date ? `<strong>${esc(dual.unopened.date)}</strong>（${esc(dual.unopened.formula)}）` : esc(dual.unopened.missingHint || '未填写生产日期或未开封保质期')}</div>
                <div>• 开封后推算：${dual.opened.date ? `<strong>${esc(dual.opened.date)}</strong>（${esc(dual.opened.formula)}）` : esc(dual.opened.missingHint || '未填写开封日期或 PAO')}</div>
                <div>• 确认到期日：<strong>${it.confirmedExpiryDate ? esc(it.confirmedExpiryDate) : '未手动确认'}</strong></div>
              </div>
            </div>
            <div class="form-banner-info">未开封与开封后分别独立推算、互不覆盖，也不会自动取较早日期。</div>
          </div>
        `,
      });
    });
  });

  mainEl.querySelectorAll('[data-c1-status-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const [id, nextStatus] = btn.dataset.c1StatusAction.split(':');
      const it = state.items.find((x) => x.id === id);
      if (!it) return;
      const evalRes = evaluateC1QuickStatusOption(it, nextStatus);
      if (evalRes.isCurrent) return;
      if (!evalRes.allowed) {
        toast(evalRes.reason || '当前产品状态不支持此操作。');
        return;
      }

      if (evalRes.requiresConfirm === 'mark_used_up') {
        const ok = await dialog.confirm({
          title: '确认产品已用完？',
          message: '标记为已用完后，该瓶产品将从当前拥有数量中移除，但历史记录和使用信息仍会保留。',
          confirmLabel: '确认已用完',
          cancelLabel: '取消',
        });
        if (!ok) return;
        it.status = 'used_up';
        it.remainingPercent = 0;
        ui.expandedItemIds.delete(it.id);
        toast('已标记为已用完（已从当前拥有移出，历史记录保留）');
        render();
        return;
      }

      if (evalRes.requiresConfirm === 'restore_unopened') {
        const ok = await dialog.confirm({
          title: '确认恢复为未开封？',
          message: '切换后将清空原开封日期，并重新按照生产日期和未开封保质期计算到期日。',
          confirmLabel: '确认恢复未开封',
          cancelLabel: '取消',
        });
        if (!ok) return;
        it.status = 'unopened';
        it.openedDate = null;
        if (it.confirmedExpiryDate) {
          toast('已恢复为未开封并清空开封日期；已保留您的确认到期日，请核实是否正确');
        } else {
          toast('已恢复为未开封，已清空原开封日期');
        }
        render();
        return;
      }

      if (evalRes.requiresConfirm === 'restore_in_use') {
        sheet.open({
          title: '确认恢复使用？',
          bodyHtml: `
            <form id="c1-restore-use-form" class="form-stack" novalidate>
              <div id="c1-ru-err" class="form-banner-error" style="display:none;"></div>
              <div class="form-banner-info">
                恢复后，该瓶产品将重新计入当前拥有数量。请确认产品仍有剩余，并补充当前剩余比例。
              </div>
              <div class="field-row">
                <div class="field">
                  <label>当前剩余比例（1–100%）<span class="req">*</span></label>
                  <input class="input" type="number" min="1" max="100" name="remainingPercent" value="${it.remainingPercent > 0 ? it.remainingPercent : 50}" required />
                </div>
                <div class="field">
                  <label>开封日期 <span class="req">*</span></label>
                  <input class="input" type="date" name="openedDate" value="${esc(it.openedDate || todayStr())}" required />
                </div>
              </div>
              <div class="field-row">
                <button type="button" class="btn btn-secondary" data-ru-cancel="1">取消</button>
                <button type="submit" class="btn btn-primary">确认恢复使用</button>
              </div>
            </form>
          `,
          onMount: (body, close) => {
            const f = body.querySelector('#c1-restore-use-form');
            const errBox = body.querySelector('#c1-ru-err');
            body.querySelector('[data-ru-cancel]')?.addEventListener('click', close);
            f.addEventListener('submit', (e) => {
              e.preventDefault();
              errBox.style.display = 'none';
              const fd = new FormData(f);
              const check = validateC1ItemTransitionAndFields({
                previousItem: it,
                nextInput: {
                  ...it,
                  status: 'in_use',
                  remainingPercent: fd.get('remainingPercent'),
                  openedDate: fd.get('openedDate'),
                },
              });
              if (!check.ok) {
                showFormError(errBox, check.error, toast);
                return;
              }
              it.status = 'in_use';
              it.remainingPercent = check.normalized.remainingPercent;
              it.openedDate = check.normalized.openedDate;
              ui.expandedItemIds.add(it.id);
              close();
              toast('已恢复为使用中，已重新计入当前拥有数量');
              render();
            });
          },
        });
        return;
      }

      // 直接合法切换（如：未记录 -> 未开封 / 使用中，未开封 -> 使用中）
      const nextOpened = nextStatus === 'in_use' ? (it.openedDate || todayStr()) : null;
      const check = validateC1ItemTransitionAndFields({
        previousItem: it,
        nextInput: {
          ...it,
          status: nextStatus,
          openedDate: nextOpened,
        },
      });
      if (!check.ok) {
        toast(check.error);
        return;
      }
      it.status = check.normalized.status;
      it.openedDate = check.normalized.openedDate;
      toast(
        nextStatus === 'in_use'
          ? '已设为「使用中」并记录有效开封日期'
          : `已切换为「${C1_ITEM_STATUSES[nextStatus]?.label || nextStatus}」`,
      );
      render();
    });
  });

  mainEl.querySelectorAll('[data-c1-open-today]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const it = state.items.find((x) => x.id === btn.dataset.c1OpenToday);
      if (!it) return;
      it.status = 'in_use';
      if (!it.openedDate) it.openedDate = todayStr();
      toast('已设为「使用中」并记录今日开封日期');
      render();
    });
  });

  mainEl.querySelectorAll('[data-c1-remove-item]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await dialog.confirm({
        title: '移除这一件',
        message: '仅移除当前选中的这一件，不会删除同款其他件，也不会破坏关联的历史妆容快照。确认移除？',
        confirmLabel: '移除这一件',
        danger: true,
      });
      if (!ok) return;
      const it = state.items.find((x) => x.id === btn.dataset.c1RemoveItem);
      if (it) it.deletedAt = new Date().toISOString();
      toast('已移除这一件');
      render();
    });
  });

  mainEl.querySelectorAll('[data-c1-edit-item]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const it = state.items.find((x) => x.id === btn.dataset.c1EditItem);
      if (it) openEditSingleItemSheet(prod, it);
    });
  });

  mainEl.querySelector('#c1-toggle-usedup')?.addEventListener('click', () => {
    ui.showUsedUpHistory = !ui.showUsedUpHistory;
    render();
  });

  mainEl.querySelector('#c1-remove-product')?.addEventListener('click', async () => {
    const linkedCount = state.mockLookSnapshots.filter((l) => l.linkedProductIds.includes(prod.id)).length;
    const ok = await dialog.confirm({
      title: '从我的美妆中移除',
      message: `确定移除「${getDisplayName(prod)}」吗？移除后将进入「最近删除」保留 7 天（7 天内可完整恢复，绝不覆盖新添加的产品）。${linkedCount > 0 ? `已关联的 ${linkedCount} 篇历史妆容会通过快照继续保留名称。` : ''}`,
      confirmLabel: '移入最近删除',
      danger: true,
    });
    if (!ok) return;
    const nowMs = Date.now();
    prod.deletedAt = new Date(nowMs).toISOString();
    prod.purgeAt = new Date(nowMs + 7 * 86400000).toISOString();
    ui.selectedProductId = null;
    ui.page = 'list';
    toast('已移入「最近删除」（保留 7 天）');
    render();
  });
}

/* ---------------- 视图 3：统一最近删除（7 天回收站 + 安全恢复演示） ---------------- */

function renderTrashView() {
  const deletedProds = state.products.filter((p) => Boolean(p.deletedAt));
  setHeader({
    title: '最近删除（7 天回收站）',
    subtitle: '恢复产品不会覆盖后来新建的同款产品',
    backBtnAttr: 'id="c1-trash-back"',
  });

  mainEl.innerHTML = `
    <div class="stack">
      <div class="form-banner-info">
        移除整个产品后暂存此处 7 天。恢复时仅按原标识恢复产品与所属每件记录，即使品牌、分类、色号完全相同，也绝不覆盖您后来新建的产品。
      </div>

      ${deletedProds.length === 0
        ? renderEmptyState({
            icon: '🗑',
            title: '最近删除是空的',
            desc: '您移除的产品会暂存这里 7 天，可随时一键恢复。',
            actionLabel: '返回产品列表',
            actionAttr: 'id="c1-trash-empty-back"',
          })
        : deletedProds
            .map((prod) => {
              const itemsCount = state.items.filter((i) => i.productId === prod.id && !i.deletedAt).length;
              return `
                <div class="card">
                  <div class="row" style="gap:12px;">
                    <img src="${getProductImageUrl(prod)}" alt="" style="width:60px;height:60px;object-fit:cover;border-radius:12px;" />
                    <div style="flex:1;min-width:0;">
                      <div style="font-weight:700;font-size:15px;">${esc(getDisplayName(prod))}</div>
                      <div class="muted-note">包含 ${itemsCount} ${esc(prod.quantityUnit || '件')}记录 · 剩余 7 天到期</div>
                    </div>
                  </div>
                  <div class="row-wrap" style="margin-top:10px;justify-content:flex-end;">
                    <button type="button" class="btn btn-soft btn-sm" data-c1-restore-prod="${esc(prod.id)}">恢复产品</button>
                    <button type="button" class="btn btn-danger btn-sm" data-c1-purge-prod="${esc(prod.id)}">永久删除</button>
                  </div>
                </div>
              `;
            })
            .join('')}

      <!-- 历史妆容快照保护演示区 -->
      <div class="card">
        <div class="section-header" style="margin-bottom:6px;">
          <h2 class="section-title">历史妆容快照保护验证</h2>
          <span class="pill pill-sage">始终完好</span>
        </div>
        ${state.mockLookSnapshots
          .map(
            (lk) => `
          <div class="card-muted" style="font-size:12px;">
            <div style="font-weight:700;">${esc(lk.name)}（${esc(lk.lookDate)}）</div>
            <div style="margin-top:4px;">快照保留产品：${lk.productSnapshots.map((s) => esc(s.label)).join('、')}</div>
          </div>
        `,
          )
          .join('')}
      </div>
    </div>
  `;

  headerEl.querySelector('#c1-trash-back')?.addEventListener('click', () => {
    ui.page = 'list';
    render();
  });
  mainEl.querySelector('#c1-trash-empty-back')?.addEventListener('click', () => {
    ui.page = 'list';
    render();
  });
  mainEl.querySelectorAll('[data-c1-restore-prod]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = state.products.find((x) => x.id === btn.dataset.c1RestoreProd);
      if (!p) return;
      p.deletedAt = null;
      p.purgeAt = null;
      toast('已完整恢复产品及所属每件记录（与现有同名新品独立并存）');
      render();
    });
  });
  mainEl.querySelectorAll('[data-c1-purge-prod]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const p = state.products.find((x) => x.id === btn.dataset.c1PurgeProd);
      if (!p) return;
      const ok1 = await dialog.confirm({
        title: '提前永久删除（第 1 步确认）',
        message: `确定永久删除「${getDisplayName(p)}」吗？删除后无法恢复。`,
        confirmLabel: '继续',
        danger: true,
      });
      if (!ok1) return;
      const ok2 = await dialog.confirm({
        title: '二次确认',
        message: '即将永久清除该产品及名下记录；历史妆容快照仍会完整保留。确认永久删除？',
        confirmLabel: '确认永久删除',
        danger: true,
      });
      if (!ok2) return;
      state.items = state.items.filter((i) => i.productId !== p.id);
      state.products = state.products.filter((x) => x.id !== p.id);
      toast('已永久删除（历史妆容快照保持完整）');
      render();
    });
  });
}

/* ---------------- 连续单页：添加 / 编辑产品 ---------------- */

function createBlankItemDraft() {
  return {
    status: 'unrecorded',
    manufactureDate: '',
    unopenedShelfMonths: '',
    openedDate: '',
    paoMonths: '',
    confirmedExpiryDate: '',
    remainingPercent: 100,
    purchasePriceInput: '',
    currencyCode: state.settings.defaultCurrency || 'CNY',
    acquisitionPreset: '',
    acquisitionCustomText: '',
  };
}

function renderItemDraftBlock(idx, draft, { showTitle = false, showCurrency = false } = {}) {
  return `
    <div class="card-muted" data-draft-idx="${idx}" style="margin-top:8px;">
      ${showTitle ? `<div style="font-weight:700;font-size:13px;margin-bottom:8px;">第 ${idx + 1} 件详细信息（均选填）</div>` : ''}

      <div class="field-row">
        <div class="field">
          <label>使用状态</label>
          <select class="select" data-df="status">
            <option value="unrecorded" ${draft.status === 'unrecorded' ? 'selected' : ''}>未记录（默认）</option>
            <option value="unopened" ${draft.status === 'unopened' ? 'selected' : ''}>未开封</option>
            <option value="in_use" ${draft.status === 'in_use' ? 'selected' : ''}>使用中</option>
            <option value="used_up" ${draft.status === 'used_up' ? 'selected' : ''}>已用完</option>
          </select>
        </div>
        <div class="field">
          <label>剩余比例（%）</label>
          <input class="input" type="number" min="0" max="100" data-df="remainingPercent" value="${esc(draft.remainingPercent)}" />
        </div>
      </div>

      <div class="field-row field-row-mobile-stack" style="margin-top:8px;">
        <div class="field">
          <label>生产日期</label>
          <input class="input" type="date" data-df="manufactureDate" value="${esc(draft.manufactureDate)}" />
        </div>
        <div class="field">
          <label>未开封保质期（月）</label>
          <input class="input" type="number" min="1" placeholder="例如 36" data-df="unopenedShelfMonths" value="${esc(draft.unopenedShelfMonths)}" />
        </div>
      </div>

      <div class="field-row field-row-mobile-stack" style="margin-top:8px;">
        <div class="field">
          <label>开封日期</label>
          <input class="input" type="date" data-df="openedDate" value="${esc(draft.openedDate)}" />
        </div>
        <div class="field">
          <label>开封后期限 PAO（月）</label>
          <input class="input" type="number" min="1" placeholder="例如 12" data-df="paoMonths" value="${esc(draft.paoMonths)}" />
        </div>
      </div>

      <div class="field" style="margin-top:8px;">
        <div class="row-between" style="gap:6px;">
          <label style="margin:0;">用户确认到期日（选填）</label>
          <button type="button" class="help-icon-btn" data-toggle-dual-help aria-label="查看推算依据">?</button>
        </div>
        <div class="form-banner-info" data-dual-preview style="display:none;font-size:12px;"></div>
        <input class="input" type="date" data-df="confirmedExpiryDate" value="${esc(draft.confirmedExpiryDate)}" />
        <div class="row-wrap" style="margin-top:4px;">
          <button type="button" class="btn btn-soft btn-sm" data-adopt-unopened>采纳未开封推算</button>
          <button type="button" class="btn btn-soft btn-sm" data-adopt-opened>采纳开封后推算</button>
        </div>
      </div>

      <div class="field-row field-row-mobile-stack" style="margin-top:8px;">
        <div class="field">
          <label>购买价格（${esc(CURRENCIES[draft.currencyCode]?.name || '人民币')}）</label>
          <input class="input" inputmode="decimal" placeholder="例如 320.00" data-df="purchasePriceInput" value="${esc(draft.purchasePriceInput)}" />
        </div>
        <div class="field">
          <label>获得方式</label>
          <select class="select" data-df="acquisitionPreset">
            <option value="">不填写</option>
            ${C1_ACQUISITION_PRESETS.map((p) => `<option value="${esc(p)}" ${draft.acquisitionPreset === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}
            <option value="其他" ${draft.acquisitionPreset === '其他' ? 'selected' : ''}>其他（自定义）</option>
          </select>
        </div>
      </div>

      ${showCurrency ? `
        <div class="field" style="margin-top:8px;">
          <label>购买币种</label>
          <select class="select" data-df="currencyCode">
            ${CURRENCY_ORDER.map((c) => `<option value="${esc(c)}" ${draft.currencyCode === c ? 'selected' : ''}>${esc(CURRENCIES[c].name)} (${esc(c)})</option>`).join('')}
          </select>
        </div>
      ` : ''}
    </div>
  `;
}

function bindDraftExpiryHelpers(box, draft) {
  const previewEl = box.querySelector('[data-dual-preview]');
  const toggleHelpBtn = box.querySelector('[data-toggle-dual-help]');
  const btnUnopened = box.querySelector('[data-adopt-unopened]');
  const btnOpened = box.querySelector('[data-adopt-opened]');
  const confInput = box.querySelector('[data-df="confirmedExpiryDate"]');
  const mfgInput = box.querySelector('[data-df="manufactureDate"]');
  const shelfInput = box.querySelector('[data-df="unopenedShelfMonths"]');
  const openInput = box.querySelector('[data-df="openedDate"]');
  const paoInput = box.querySelector('[data-df="paoMonths"]');

  toggleHelpBtn?.addEventListener('click', () => {
    if (!previewEl) return;
    previewEl.style.display = previewEl.style.display === 'none' ? 'block' : 'none';
  });

  const readVal = (el, fallback) => (el ? String(el.value || '').trim() : String(fallback || '').trim());

  const refresh = () => {
    const mfg = readVal(mfgInput, draft.manufactureDate);
    const shelfRaw = readVal(shelfInput, draft.unopenedShelfMonths);
    const opened = readVal(openInput, draft.openedDate);
    const paoRaw = readVal(paoInput, draft.paoMonths);

    draft.manufactureDate = mfg;
    draft.unopenedShelfMonths = shelfRaw;
    draft.openedDate = opened;
    draft.paoMonths = paoRaw;

    const dual = describeC1ItemDualExpiry({
      manufactureDate: mfg || null,
      unopenedShelfMonths: /^\d+$/.test(shelfRaw) ? Number.parseInt(shelfRaw, 10) : null,
      openedDate: opened || null,
      paoMonths: /^\d+$/.test(paoRaw) ? Number.parseInt(paoRaw, 10) : null,
    });
    if (previewEl) {
      const lines = [
        dual.unopened.date
          ? `未开封推算：${dual.unopened.date}（${dual.unopened.formula}）`
          : `未开封推算：${dual.unopened.missingHint || '未填写生产日期与未开封保质期'}`,
        dual.opened.date
          ? `开封后推算：${dual.opened.date}（${dual.opened.formula}）`
          : `开封后推算：${dual.opened.missingHint || '未填写开封日期与 PAO'}`,
      ];
      previewEl.innerHTML = lines.map((l) => `<div>${esc(l)}</div>`).join('');
    }
    if (btnUnopened) {
      btnUnopened.disabled = !dual.unopened.date;
      btnUnopened.style.display = dual.unopened.date ? '' : 'none';
      btnUnopened.textContent = dual.unopened.date ? `采纳未开封 (${dual.unopened.date})` : '采纳未开封推算';
    }
    if (btnOpened) {
      btnOpened.disabled = !dual.opened.date;
      btnOpened.style.display = dual.opened.date ? '' : 'none';
      btnOpened.textContent = dual.opened.date ? `采纳开封后 (${dual.opened.date})` : '采纳开封后推算';
    }
    return dual;
  };

  [mfgInput, shelfInput, openInput, paoInput].forEach((el) => {
    el?.addEventListener('input', refresh);
    el?.addEventListener('change', refresh);
  });

  btnUnopened?.addEventListener('click', () => {
    const dual = refresh();
    if (dual.unopened.date && confInput) {
      confInput.value = dual.unopened.date;
      draft.confirmedExpiryDate = dual.unopened.date;
    }
  });
  btnOpened?.addEventListener('click', () => {
    const dual = refresh();
    if (dual.opened.date && confInput) {
      confInput.value = dual.opened.date;
      draft.confirmedExpiryDate = dual.opened.date;
    }
  });

  refresh();
}

function openAddOrEditProductSheet(existing = null) {
  const isEdit = Boolean(existing);
  const initPrimary = existing?.primaryCategoryId || C1_CATEGORY_TREE[0].id;
  const initSub = existing?.subCategoryId || C1_CATEGORY_TREE[0].children[0].id;
  const initCatInfo = findCategoryNames(initPrimary, initSub);

  let selectedPrimaryId = initPrimary;
  let selectedSubId = initSub;
  let quantity = 1;
  let quantityUnit = existing?.quantityUnit || initCatInfo.defaultUnit;
  let unitManuallyChanged = Boolean(existing);
  let detailsExpanded = false;
  let batchMode = 'same'; // 'same' | 'per_item'
  let itemDrafts = [createBlankItemDraft()];
  let pendingImageUrl = existing?.imageUrl || '';
  let selectedSampleKey = existing ? (existing.sampleKey || '') : 'sample-look-commute';

  const syncDraftCount = () => {
    while (itemDrafts.length < quantity) itemDrafts.push(createBlankItemDraft());
    if (itemDrafts.length > quantity) itemDrafts = itemDrafts.slice(0, quantity);
  };

  const renderSubOptions = (priId, chosenSubId) => {
    const pri = C1_CATEGORY_TREE.find((c) => c.id === priId);
    return (pri?.children || [])
      .map((s) => `<option value="${esc(s.id)}" ${s.id === chosenSubId ? 'selected' : ''}>${esc(s.name)}</option>`)
      .join('');
  };

  const bodyHtml = `
    <form id="c1-product-form" class="form-stack" novalidate>
      <div id="c1-form-err" class="form-banner-error" style="display:none;"></div>

      <!-- 第一部分：产品基本信息（同页连续完成） -->
      <div class="field-row">
        <div class="field">
          <label>一级分类 <span class="req">*</span></label>
          <select class="select" name="primaryCategoryId" id="c1-f-pri">
            ${C1_CATEGORY_TREE.map((c) => `<option value="${esc(c.id)}" ${c.id === selectedPrimaryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>二级分类 <span class="req">*</span></label>
          <select class="select" name="subCategoryId" id="c1-f-sub">
            ${renderSubOptions(selectedPrimaryId, selectedSubId)}
          </select>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>品牌（选填）</label>
          <input class="input" name="brand" id="c1-f-brand" placeholder="例如：Zelens" value="${esc(existing?.brand || '')}" />
        </div>
        <div class="field">
          <label>色号 / 款式（选填）</label>
          <input class="input" name="shade" id="c1-f-shade" placeholder="例如：浮雕白" value="${esc(existing?.shade || '')}" />
        </div>
      </div>

      <div class="field">
        <label>产品名称（选填，留空自动按品牌+分类+色号命名）</label>
        <input class="input" name="customName" id="c1-f-name" placeholder="不填则自动生成展示名称" value="${esc(existing?.customName || '')}" />
        <div class="field-help">展示预览：<strong id="c1-name-preview"></strong></div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>单件规格（选填）</label>
          <input class="input" name="specValue" placeholder="例如：30" value="${esc(existing?.specValue || '')}" />
        </div>
        <div class="field">
          <label>规格单位</label>
          <select class="select" name="specUnit" id="c1-f-spec-unit">
            <option value="">不填</option>
            ${C1_SPEC_UNITS.map((u) => `<option value="${esc(u)}" ${(existing?.specUnit || 'ml') === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}
            <option value="其他" ${existing?.specUnit === '其他' ? 'selected' : ''}>其他</option>
          </select>
        </div>
      </div>

      <div class="field" id="c1-f-spec-custom-wrap" style="${existing?.specUnit === '其他' ? '' : 'display:none;'}">
        <label>自定义规格单位</label>
        <input class="input" name="specCustomUnit" placeholder="例如：片/套" value="${esc(existing?.specCustomUnit || '')}" />
      </div>

      <div class="field">
        <label>产品图片（选填）</label>
        <div class="row-wrap">
          <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
            选择本地照片
            <input type="file" accept="image/*" id="c1-file-input" style="display:none;" />
          </label>
          <span id="c1-file-status" class="muted-note">${pendingImageUrl ? '已选本地照片' : selectedSampleKey ? '已选示例图' : '暂不配图'}</span>
        </div>
        <div id="c1-upload-preview"></div>
        ${renderSamplePickerGrid(selectedSampleKey)}
      </div>

      <!-- 第二部分：拥有数量（紧跟同页，默认 1，与规格单位分开） -->
      ${!isEdit ? `
        <div class="divider"></div>
        <div class="row-between" style="gap:10px;">
          <div>
            <div style="font-weight:700;font-size:14px;">拥有数量</div>
            <div class="muted-note">与单件规格分开，默认 1</div>
          </div>
          <div class="row" style="gap:8px;">
            <button type="button" class="icon-btn" id="c1-add-qty-dec">−</button>
            <strong id="c1-add-qty-val" style="min-width:24px;text-align:center;font-size:16px;">1</strong>
            <button type="button" class="icon-btn" id="c1-add-qty-inc">+</button>
            <select class="select" id="c1-f-qty-unit" style="width:auto;min-width:74px;">
              ${C1_QUANTITY_UNITS.map((u) => `<option value="${esc(u)}" ${u === quantityUnit ? 'selected' : ''}>${esc(u)}</option>`).join('')}
              <option value="其他" ${!C1_QUANTITY_UNITS.includes(quantityUnit) ? 'selected' : ''}>其他</option>
            </select>
          </div>
        </div>
        <div class="field" id="c1-f-qty-custom-wrap" style="${!C1_QUANTITY_UNITS.includes(quantityUnit) ? '' : 'display:none;'}">
          <label>自定义数量单位</label>
          <input class="input" id="c1-f-qty-custom" placeholder="例如：对 / 组" value="${esc(!C1_QUANTITY_UNITS.includes(quantityUnit) ? quantityUnit : '')}" />
        </div>

        <!-- 第三部分：可选展开区域（允许完全跳过，跳过默认为「未记录」） -->
        <div class="card" style="padding:10px 12px;">
          <button type="button" class="me-accordion-trigger" id="c1-toggle-details" style="padding:2px 0;min-height:36px;">
            <span style="font-weight:700;font-size:14px;">补充每件详细信息（选填，可跳过）</span>
            <span class="pill" id="c1-details-pill">已收起</span>
          </button>
          <div id="c1-details-body" style="display:none;margin-top:8px;"></div>
        </div>
      ` : `
        <div class="field">
          <label>数量单位</label>
          <select class="select" id="c1-f-qty-unit">
            ${C1_QUANTITY_UNITS.map((u) => `<option value="${esc(u)}" ${u === quantityUnit ? 'selected' : ''}>${esc(u)}</option>`).join('')}
            <option value="其他" ${!C1_QUANTITY_UNITS.includes(quantityUnit) ? 'selected' : ''}>其他</option>
          </select>
        </div>
        <div class="field" id="c1-f-qty-custom-wrap" style="${!C1_QUANTITY_UNITS.includes(quantityUnit) ? '' : 'display:none;'}">
          <label>自定义数量单位</label>
          <input class="input" id="c1-f-qty-custom" value="${esc(!C1_QUANTITY_UNITS.includes(quantityUnit) ? quantityUnit : '')}" />
        </div>
      `}

      <button type="submit" class="btn btn-primary btn-block">${isEdit ? '保存修改' : '保存并查看产品'}</button>
    </form>
  `;

  sheet.open({
    title: isEdit ? '编辑产品信息' : '添加美妆产品',
    bodyHtml,
    onMount: (body, close) => {
      const form = body.querySelector('#c1-product-form');
      const errBox = body.querySelector('#c1-form-err');
      const priEl = body.querySelector('#c1-f-pri');
      const subEl = body.querySelector('#c1-f-sub');
      const brandEl = body.querySelector('#c1-f-brand');
      const shadeEl = body.querySelector('#c1-f-shade');
      const nameEl = body.querySelector('#c1-f-name');
      const namePreviewEl = body.querySelector('#c1-name-preview');
      const specUnitEl = body.querySelector('#c1-f-spec-unit');
      const specCustomWrap = body.querySelector('#c1-f-spec-custom-wrap');
      const qtyUnitEl = body.querySelector('#c1-f-qty-unit');
      const qtyCustomWrap = body.querySelector('#c1-f-qty-custom-wrap');
      const qtyCustomEl = body.querySelector('#c1-f-qty-custom');
      const qtyValEl = body.querySelector('#c1-add-qty-val');
      const detailsBodyEl = body.querySelector('#c1-details-body');
      const detailsPillEl = body.querySelector('#c1-details-pill');
      const fileInput = body.querySelector('#c1-file-input');
      const fileStatusEl = body.querySelector('#c1-file-status');
      const previewWrap = body.querySelector('#c1-upload-preview');

      const updateNamePreview = () => {
        const { primaryName, subName } = findCategoryNames(priEl.value, subEl.value);
        namePreviewEl.textContent = composeProductDisplayName({
          customName: nameEl.value,
          brand: brandEl.value,
          primaryCategoryName: primaryName,
          subCategoryName: subName,
          shade: shadeEl.value,
        });
      };

      const renderDetailsSection = () => {
        if (!detailsBodyEl) return;
        detailsBodyEl.style.display = detailsExpanded ? 'block' : 'none';
        if (detailsPillEl) detailsPillEl.textContent = detailsExpanded ? '点击收起' : '已收起';
        if (!detailsExpanded) return;

        syncDraftCount();
        const showFx = state.settings.enableForeignCurrency;
        detailsBodyEl.innerHTML = `
          <div class="muted-note" style="margin-bottom:8px;">
            所有日期、价格与状态均为选填；未填写状态时将记为「未记录」，随时可在详情补充。
          </div>
          ${quantity > 1 ? `
            <div class="segmented" style="margin-bottom:8px;">
              <button type="button" class="seg-btn ${batchMode === 'same' ? 'is-active' : ''}" data-c1-batch="same">全部采用同一批信息</button>
              <button type="button" class="seg-btn ${batchMode === 'per_item' ? 'is-active' : ''}" data-c1-batch="per_item">逐件分别编辑 (${quantity} 件)</button>
            </div>
          ` : ''}
          ${quantity > 1 && batchMode === 'per_item'
            ? itemDrafts.map((d, idx) => renderItemDraftBlock(idx, d, { showTitle: true, showCurrency: showFx })).join('')
            : renderItemDraftBlock(0, itemDrafts[0], { showTitle: false, showCurrency: showFx })}
        `;

        detailsBodyEl.querySelectorAll('[data-c1-batch]').forEach((b) => {
          b.addEventListener('click', () => {
            batchMode = b.dataset.c1Batch;
            renderDetailsSection();
          });
        });

        detailsBodyEl.querySelectorAll('[data-draft-idx]').forEach((box) => {
          const idx = Number.parseInt(box.dataset.draftIdx, 10);
          bindDraftExpiryHelpers(box, itemDrafts[idx]);
          box.querySelectorAll('[data-df]').forEach((inp) => {
            const eventName = inp.tagName === 'SELECT' ? 'change' : 'input';
            inp.addEventListener(eventName, () => {
              itemDrafts[idx][inp.dataset.df] = inp.value;
            });
          });
        });
      };

      const updateUploadThumb = () => {
        if (pendingImageUrl) {
          previewWrap.innerHTML = renderUploadPreview({
            previewUrl: pendingImageUrl,
            title: '已选产品照片',
            badgeText: '产品主图',
            subtitle: '本地原型预览',
          });
        } else if (selectedSampleKey) {
          const opt = getSampleArtworkOptions().find((o) => o.key === selectedSampleKey);
          previewWrap.innerHTML = opt
            ? renderUploadPreview({
                previewUrl: opt.url,
                title: opt.title,
                badgeText: '示例主图',
                subtitle: '离线示例图',
              })
            : '';
        } else {
          previewWrap.innerHTML = '';
        }
      };

      priEl.addEventListener('change', () => {
        selectedPrimaryId = priEl.value;
        const pri = C1_CATEGORY_TREE.find((c) => c.id === selectedPrimaryId);
        selectedSubId = pri?.children?.[0]?.id || '';
        subEl.innerHTML = renderSubOptions(selectedPrimaryId, selectedSubId);
        if (!unitManuallyChanged) {
          const { defaultUnit } = findCategoryNames(selectedPrimaryId, selectedSubId);
          quantityUnit = defaultUnit;
          if (qtyUnitEl) qtyUnitEl.value = C1_QUANTITY_UNITS.includes(defaultUnit) ? defaultUnit : '其他';
        }
        updateNamePreview();
      });

      subEl.addEventListener('change', () => {
        selectedSubId = subEl.value;
        if (!unitManuallyChanged) {
          const { defaultUnit } = findCategoryNames(selectedPrimaryId, selectedSubId);
          quantityUnit = defaultUnit;
          if (qtyUnitEl) qtyUnitEl.value = C1_QUANTITY_UNITS.includes(defaultUnit) ? defaultUnit : '其他';
        }
        updateNamePreview();
      });

      [brandEl, shadeEl, nameEl].forEach((el) => el.addEventListener('input', updateNamePreview));
      specUnitEl.addEventListener('change', () => {
        specCustomWrap.style.display = specUnitEl.value === '其他' ? '' : 'none';
      });
      qtyUnitEl?.addEventListener('change', () => {
        unitManuallyChanged = true;
        qtyCustomWrap.style.display = qtyUnitEl.value === '其他' ? '' : 'none';
      });

      body.querySelector('#c1-add-qty-dec')?.addEventListener('click', () => {
        if (quantity <= 1) return;
        quantity -= 1;
        qtyValEl.textContent = String(quantity);
        if (detailsExpanded) renderDetailsSection();
      });
      body.querySelector('#c1-add-qty-inc')?.addEventListener('click', () => {
        if (quantity >= 20) return;
        quantity += 1;
        qtyValEl.textContent = String(quantity);
        if (detailsExpanded) renderDetailsSection();
      });
      body.querySelector('#c1-toggle-details')?.addEventListener('click', () => {
        detailsExpanded = !detailsExpanded;
        renderDetailsSection();
      });

      fileInput?.addEventListener('change', () => {
        const f = fileInput.files?.[0];
        if (!f) return;
        const vErr = validateImageFile(f);
        if (vErr) {
          showFormError(errBox, vErr, toast);
          return;
        }
        selectedSampleKey = '';
        pendingImageUrl = URL.createObjectURL(f);
        fileStatusEl.textContent = `${f.name} (${formatBytes(f.size)})`;
        body.querySelectorAll('[data-pick-sample]').forEach((b) => b.classList.remove('is-active'));
        updateUploadThumb();
      });

      body.querySelectorAll('[data-pick-sample]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.pickSample;
          selectedSampleKey = selectedSampleKey === key ? '' : key;
          pendingImageUrl = '';
          fileStatusEl.textContent = selectedSampleKey ? `已选示例图：${btn.title}` : '暂不配图';
          body.querySelectorAll('[data-pick-sample]').forEach((b) => b.classList.toggle('is-active', b.dataset.pickSample === selectedSampleKey));
          updateUploadThumb();
        });
      });

      updateNamePreview();
      updateUploadThumb();

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        errBox.style.display = 'none';
        const fd = new FormData(form);
        const resolvedQtyUnit = qtyUnitEl?.value === '其他' ? (qtyCustomEl?.value || '').trim() || '件' : (qtyUnitEl?.value || quantityUnit);

        if (isEdit) {
          existing.primaryCategoryId = String(fd.get('primaryCategoryId') || '');
          existing.subCategoryId = String(fd.get('subCategoryId') || '');
          existing.brand = String(fd.get('brand') || '').trim();
          existing.shade = String(fd.get('shade') || '').trim();
          existing.customName = String(fd.get('customName') || '').trim();
          existing.specValue = String(fd.get('specValue') || '').trim();
          existing.specUnit = String(fd.get('specUnit') || '').trim();
          existing.specCustomUnit = String(fd.get('specCustomUnit') || '').trim();
          existing.quantityUnit = resolvedQtyUnit;
          existing.imageUrl = pendingImageUrl;
          existing.sampleKey = selectedSampleKey;
          close();
          toast('产品信息已更新');
          render();
          return;
        }

        const newProd = {
          id: uid('c1-p'),
          primaryCategoryId: String(fd.get('primaryCategoryId') || ''),
          subCategoryId: String(fd.get('subCategoryId') || ''),
          brand: String(fd.get('brand') || '').trim(),
          shade: String(fd.get('shade') || '').trim(),
          customName: String(fd.get('customName') || '').trim(),
          specValue: String(fd.get('specValue') || '').trim(),
          specUnit: String(fd.get('specUnit') || '').trim(),
          specCustomUnit: String(fd.get('specCustomUnit') || '').trim(),
          quantityUnit: resolvedQtyUnit,
          imageUrl: pendingImageUrl,
          sampleKey: selectedSampleKey,
          notesPrivate: '',
          hiddenFromActive: false,
          deletedAt: null,
          purgeAt: null,
          createdAt: new Date().toISOString(),
        };

        syncDraftCount();
        const createdItems = [];
        for (let i = 0; i < quantity; i++) {
          const src = detailsExpanded ? (batchMode === 'per_item' ? itemDrafts[i] : itemDrafts[0]) : createBlankItemDraft();
          let minor = null;
          if (String(src.purchasePriceInput || '').trim() !== '') {
            const parsed = parseAmountToMinor(src.purchasePriceInput, src.currencyCode || 'CNY');
            if (!parsed.ok) {
              showFormError(errBox, `第 ${i + 1} 件价格无效：${parsed.error}`, toast);
              return;
            }
            minor = parsed.minor;
          }
          const check = validateC1ItemTransitionAndFields({
            previousItem: null,
            nextInput: {
              ...src,
              purchasePriceMinor: minor,
              acquisitionMethod: src.acquisitionPreset || '',
            },
          });
          if (!check.ok) {
            showFormError(errBox, `第 ${i + 1} 件校验未通过：${check.error}`, toast);
            return;
          }
          createdItems.push({
            id: uid('c1-i'),
            productId: newProd.id,
            status: check.normalized.status,
            manufactureDate: check.normalized.manufactureDate,
            unopenedShelfMonths: check.normalized.unopenedShelfMonths,
            openedDate: check.normalized.openedDate,
            paoMonths: check.normalized.paoMonths,
            confirmedExpiryDate: check.normalized.confirmedExpiryDate,
            remainingPercent: check.normalized.remainingPercent,
            purchasePriceMinor: minor,
            currencyCode: src.currencyCode || state.settings.defaultCurrency || 'CNY',
            acquisitionMethod: src.acquisitionPreset || '',
            deletedAt: null,
          });
        }

        state.products.unshift(newProd);
        state.items.push(...createdItems);
        ui.selectedProductId = newProd.id;
        ui.page = 'detail';
        close();
        toast(`已保存「${getDisplayName(newProd)}」（${quantity} ${resolvedQtyUnit}）`);
        render();
      });
    },
  });
}

function openEditSingleItemSheet(prod, item) {
  const initPrice =
    item.purchasePriceMinor !== null && item.purchasePriceMinor !== undefined && CURRENCIES[item.currencyCode]
      ? minorToDecimalString(item.purchasePriceMinor, item.currencyCode)
      : '';
  const draft = {
    status: item.status || 'unrecorded',
    manufactureDate: item.manufactureDate || '',
    unopenedShelfMonths: item.unopenedShelfMonths ?? '',
    openedDate: item.openedDate || '',
    paoMonths: item.paoMonths ?? '',
    confirmedExpiryDate: item.confirmedExpiryDate || '',
    remainingPercent: item.remainingPercent ?? 100,
    purchasePriceInput: initPrice,
    currencyCode: item.currencyCode || state.settings.defaultCurrency || 'CNY',
    acquisitionPreset: item.acquisitionMethod || '',
  };

  sheet.open({
    title: `编辑详情 · ${getDisplayName(prod)}`,
    bodyHtml: `
      <form id="c1-single-item-form" class="form-stack" novalidate>
        <div id="c1-si-err" class="form-banner-error" style="display:none;"></div>
        ${renderItemDraftBlock(0, draft, { showTitle: false, showCurrency: state.settings.enableForeignCurrency })}
        <button type="submit" class="btn btn-primary btn-block">保存这 1 件信息</button>
      </form>
    `,
    onMount: (body, close) => {
      const form = body.querySelector('#c1-single-item-form');
      const errBox = body.querySelector('#c1-si-err');
      const box = body.querySelector('[data-draft-idx="0"]');
      if (box) bindDraftExpiryHelpers(box, draft);
      const statusSel = box?.querySelector('[data-df="status"]');
      const openedInp = box?.querySelector('[data-df="openedDate"]');
      const remInp = box?.querySelector('[data-df="remainingPercent"]');

      body.querySelectorAll('[data-df]').forEach((inp) => {
        const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
        inp.addEventListener(ev, () => {
          draft[inp.dataset.df] = inp.value;
          if (inp === statusSel) {
            if (inp.value === 'in_use' && !draft.openedDate) {
              const t = todayStr();
              draft.openedDate = t;
              if (openedInp) {
                openedInp.value = t;
                openedInp.dispatchEvent(new Event('input'));
              }
            } else if (inp.value === 'used_up') {
              draft.remainingPercent = 0;
              if (remInp) remInp.value = '0';
            }
          }
        });
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.style.display = 'none';
        let minor = null;
        if (String(draft.purchasePriceInput || '').trim() !== '') {
          const parsed = parseAmountToMinor(draft.purchasePriceInput, draft.currencyCode || 'CNY');
          if (!parsed.ok) {
            showFormError(errBox, parsed.error, toast);
            return;
          }
          minor = parsed.minor;
        }

        // 若从「使用中」改回「未开封」且仍留着开封日期，则弹出确认框并在确认后清空开封日期
        let nextOpenedInput = draft.openedDate;
        if (item.status === 'in_use' && draft.status === 'unopened' && String(nextOpenedInput || '').trim()) {
          const ok = await dialog.confirm({
            title: '确认恢复为未开封？',
            message: '切换后将清空原开封日期，并重新按照生产日期和未开封保质期计算到期日。',
            confirmLabel: '确认恢复未开封',
            cancelLabel: '取消',
          });
          if (!ok) return;
          nextOpenedInput = '';
          draft.openedDate = '';
          if (openedInp) openedInp.value = '';
        }

        const check = validateC1ItemTransitionAndFields({
          previousItem: item,
          nextInput: {
            ...draft,
            openedDate: nextOpenedInput,
            purchasePriceMinor: minor,
            acquisitionMethod: draft.acquisitionPreset || '',
          },
        });
        if (!check.ok) {
          showFormError(errBox, check.error, toast);
          return;
        }

        const needsRestoreConfirm = item.status === 'used_up' && check.normalized.status === 'in_use';
        if (needsRestoreConfirm) {
          const ok = await dialog.confirm({
            title: '确认恢复使用？',
            message: '恢复后，该瓶产品将重新计入当前拥有数量。确认保持以上剩余比例并恢复使用？',
            confirmLabel: '确认恢复使用',
            cancelLabel: '取消',
          });
          if (!ok) return;
        }

        if (check.normalized.status === 'used_up' && item.status !== 'used_up') {
          const ok = await dialog.confirm({
            title: '确认产品已用完？',
            message: '标记为已用完后，该瓶产品将从当前拥有数量中移除，但历史记录和使用信息仍会保留。',
            confirmLabel: '确认已用完',
            cancelLabel: '取消',
          });
          if (!ok) return;
        }

        item.status = check.normalized.status;
        item.remainingPercent = check.normalized.remainingPercent;
        item.manufactureDate = check.normalized.manufactureDate;
        item.unopenedShelfMonths = check.normalized.unopenedShelfMonths;
        item.openedDate = check.normalized.openedDate;
        item.paoMonths = check.normalized.paoMonths;
        item.confirmedExpiryDate = check.normalized.confirmedExpiryDate;
        item.purchasePriceMinor = minor;
        item.currencyCode = draft.currencyCode || 'CNY';
        item.acquisitionMethod = draft.acquisitionPreset || '';
        close();
        toast(item.confirmedExpiryDate && item.status === 'unopened'
          ? '已更新信息；已保留您的确认到期日，请核实是否正确'
          : '已更新这 1 件的详细信息');
        render();
      });
    },
  });
}

function render({ preserveFocusId = null } = {}) {
  if (ui.page === 'detail') renderDetailView();
  else if (ui.page === 'trash') renderTrashView();
  else renderListView();

  if (preserveFocusId) {
    const el = document.getElementById(preserveFocusId);
    if (el) {
      el.focus();
      const len = el.value.length;
      if (typeof el.setSelectionRange === 'function') el.setSelectionRange(len, len);
    }
  }
}

render();
