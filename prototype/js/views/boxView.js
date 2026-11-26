/**
 * 妆匣 BeautyBox · 浏览器交互原型（TASK02.1-C2 正式实现）
 * Tab 2：妆匣
 * - 连续单页添加产品（默认 1 件、名称选填自动组合、规格与数量单位分离、详细信息可选跳过）
 * - 状态与有效期完整性独立拆分（「待记录使用状态」与「有效期信息待完善」互斥统计展示）
 * - 列表与详情状态联动筛选、单件快捷改状态（今日开封确认 / 已用完日期与使用时长）、7 天回收站移除保护
 */

import {
  CURRENCIES,
  CURRENCY_ORDER,
  UNCONFIGURED_DEMO_CODES,
  describePrecision,
  formatMinor,
  isSupportedCurrency,
  minorToDecimalString,
} from '../currency.js';
import {
  deriveDualComputedExpiry,
  expiryStatus,
  formatUsageDuration,
  resolveItemExpiryForDisplay,
  todayStr,
} from '../expiry.js';
import { getSampleArtworkOptions } from '../assets.js';
import {
  ACQUISITION_PRESETS,
  CATEGORY_SUBCATEGORIES,
  ITEM_STATUSES,
  QUANTITY_UNITS,
  STATUS_FILTER_META,
  composeProductDisplayName,
  evaluateQuickStatusOption,
  filterProductItems,
  findSubCategoryInfo,
  formatSpecification,
  getItemAcquisitionDisplay,
  getItemExpiryCompleteness,
  isHeldStatus,
  normalizeAcquisitionMethod,
  parseSpecificationParts,
  summarizeProductCounts,
  validateItemTransitionAndFields,
} from '../store.js';
import { recordDiagnostic } from '../diagnostics.js';
import {
  esc,
  formatBytes,
  getProductDisplayImageUrl,
  renderEmptyState,
  renderSamplePickerGrid,
  renderUploadPreview,
  showFormError,
} from '../components/ui.js';

function statusPillClass(key) {
  if (key === 'expired') return 'pill-danger';
  if (key === 'near' || key === 'needs_confirm') return 'pill-amber';
  if (key === 'ok') return 'pill-sage';
  return '';
}

function buildListCardPresentation({ filterKey, unit, sum, match }) {
  const {
    matchedCount,
    matchedInUseCount,
    matchedUnopenedCount,
    matchedPendingStatusCount,
    matchedIncompleteExpiryCount,
    matchedMissingReasons,
    matchedExpiredCount,
    matchedNearCount,
  } = match;

  if (filterKey === 'all' || filterKey === 'held') {
    const statusBits = [];
    if (sum.inUseCount + sum.idleCount > 0) statusBits.push(`使用中 ${sum.inUseCount + sum.idleCount}`);
    if (sum.unopenedCount > 0) statusBits.push(`未开封 ${sum.unopenedCount}`);
    if (sum.pendingStatusCount > 0) statusBits.push(`待记录使用状态 ${sum.pendingStatusCount}`);
    return {
      pillClass: sum.heldCount > 0 ? 'pill-accent' : '',
      pillText: `拥有 ${sum.heldCount} ${unit}`,
      summaryText: statusBits.length > 0 ? statusBits.join(' · ') : `已全部用完（历史 ${sum.usedUpCount} ${unit}）`,
      expiredCount: sum.expiredCount,
      nearCount: sum.nearExpiryCount,
      extraPillText: sum.incompleteExpiryCount > 0 ? `有效期待完善 ${sum.incompleteExpiryCount} ${unit}` : '',
    };
  }

  if (filterKey === 'in_use') {
    return {
      pillClass: 'pill-accent',
      pillText: `使用中 ${matchedCount} ${unit}`,
      summaryText: sum.heldCount > matchedCount ? `使用中 ${matchedCount} ${unit} · 当前共持有 ${sum.heldCount} ${unit}` : `使用中 ${matchedCount} ${unit}`,
      expiredCount: matchedExpiredCount,
      nearCount: matchedNearCount,
      extraPillText: '',
    };
  }

  if (filterKey === 'unopened') {
    return {
      pillClass: 'pill-sage',
      pillText: `未开封 ${matchedCount} ${unit}`,
      summaryText: sum.heldCount > matchedCount ? `未开封 ${matchedCount} ${unit} · 当前共持有 ${sum.heldCount} ${unit}` : `未开封 ${matchedCount} ${unit}`,
      expiredCount: matchedExpiredCount,
      nearCount: matchedNearCount,
      extraPillText: '',
    };
  }

  if (filterKey === 'pending_status') {
    const restHeld = sum.heldCount - matchedPendingStatusCount;
    return {
      pillClass: '',
      pillText: `待记录使用状态 ${matchedPendingStatusCount} ${unit}`,
      summaryText: restHeld > 0
        ? `待记录使用状态 ${matchedPendingStatusCount} ${unit} · 另有 ${restHeld} ${unit}已明确使用状态`
        : `待记录使用状态 ${matchedPendingStatusCount} ${unit}`,
      expiredCount: 0,
      nearCount: 0,
      extraPillText: '',
    };
  }

  if (filterKey === 'incomplete_expiry') {
    const bits = [];
    if (matchedInUseCount > 0) bits.push(`使用中 ${matchedInUseCount}`);
    if (matchedUnopenedCount > 0) bits.push(`未开封 ${matchedUnopenedCount}`);
    const hintText = matchedMissingReasons.length > 0 ? matchedMissingReasons.join('；') : '可补充 PAO / 保质期或直接确认到期日';
    return {
      pillClass: '',
      pillText: `有效期信息待完善 ${matchedIncompleteExpiryCount} ${unit}`,
      summaryText: `有效期信息待完善 ${matchedIncompleteExpiryCount} ${unit}${bits.length ? `（${bits.join(' · ')}）` : ''} · ${hintText}`,
      expiredCount: 0,
      nearCount: 0,
      extraPillText: '',
    };
  }

  if (filterKey === 'near' || filterKey === 'expired') {
    const nearBits = [];
    if (matchedInUseCount > 0) nearBits.push(`使用中 ${matchedInUseCount}`);
    if (matchedUnopenedCount > 0) nearBits.push(`未开封 ${matchedUnopenedCount}`);
    return {
      pillClass: matchedExpiredCount > 0 ? 'pill-danger' : 'pill-amber',
      pillText: `临期/过期 ${matchedCount} ${unit}`,
      summaryText: `${nearBits.join(' · ') || `临期/过期 ${matchedCount} ${unit}`}${sum.heldCount > matchedCount ? ` · 当前共持有 ${sum.heldCount} ${unit}` : ''}`,
      expiredCount: matchedExpiredCount,
      nearCount: matchedNearCount,
      extraPillText: '',
    };
  }

  // used_up
  return {
    pillClass: '',
    pillText: `已用完 ${matchedCount} ${unit}`,
    summaryText: sum.heldCount > 0
      ? `历史已用完 ${matchedCount} ${unit} · 当前仍持有 ${sum.heldCount} ${unit}`
      : `历史已用完 ${matchedCount} ${unit}`,
    expiredCount: 0,
    nearCount: 0,
    extraPillText: '',
  };
}

function normalizeStatusFilterKey(raw) {
  if (raw === 'held') return 'all';
  if (raw === 'expired') return 'near';
  return STATUS_FILTER_META[raw] ? raw : 'all';
}

function renderListProductCard(store, { prod, sum, match }, { filterKey, detailFilterKey, viewMode }) {
  const img = getProductDisplayImageUrl(store, prod.id);
  const brand = store.getBrandName(prod.brandId);
  const catName = store.getCategoryName(prod.categoryId);
  const { subCategoryName } = findSubCategoryInfo(prod.categoryId, prod.subCategoryId);
  const unit = prod.quantityUnit || '件';
  const pres = buildListCardPresentation({ filterKey, unit, sum, match });
  const metaLine = [catName, subCategoryName, prod.shade, prod.specification].filter(Boolean).join(' · ');

  if (viewMode === 'grid') {
    return `
      <button type="button" class="product-card" data-box-open-product="${esc(prod.id)}" data-box-open-filter="${esc(detailFilterKey || filterKey)}">
        <img class="product-card-img" src="${img.url}" alt="${esc(prod.name)}" />
        <div class="product-card-body">
          <div class="product-brand">${esc(brand || catName)}</div>
          <div class="product-name">${esc(prod.name)}</div>
          ${prod.shade ? `<div class="product-meta">${esc(prod.shade)}</div>` : ''}
          <div class="row-wrap" style="margin-top:auto;padding-top:4px;">
            <span class="pill ${esc(pres.pillClass)}">${esc(pres.pillText)}</span>
            ${pres.expiredCount > 0 ? `<span class="pill pill-danger">已过期 ${pres.expiredCount}</span>` : ''}
            ${pres.nearCount > 0 ? `<span class="pill pill-amber">即将到期 ${pres.nearCount}</span>` : ''}
            ${pres.extraPillText ? `<span class="pill">${esc(pres.extraPillText)}</span>` : ''}
            ${sum.conflictCount > 0 ? `<span class="pill pill-danger">数据异常</span>` : ''}
          </div>
        </div>
      </button>
    `;
  }

  return `
    <button type="button" class="product-list-row" data-box-open-product="${esc(prod.id)}" data-box-open-filter="${esc(detailFilterKey || filterKey)}">
      <img class="product-list-thumb" src="${img.url}" alt="${esc(prod.name)}" />
      <div style="flex:1;min-width:0;">
        <div class="row-between" style="gap:6px;">
          <div style="font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(prod.name)}</div>
          <span class="pill ${esc(pres.pillClass)}">${esc(pres.pillText)}</span>
        </div>
        <div class="muted-note" style="margin-top:2px;">
          ${esc([brand, metaLine].filter(Boolean).join(' · '))}
        </div>
        <div class="muted-note" style="margin-top:5px;">
          ${esc(pres.summaryText)}
        </div>
        ${(pres.expiredCount > 0 || pres.nearCount > 0 || pres.extraPillText || sum.conflictCount > 0) ? `
          <div class="row-wrap" style="margin-top:5px;">
            ${pres.expiredCount > 0 ? `<span class="pill pill-danger">⚠ 其中 ${pres.expiredCount} ${esc(unit)}已过期</span>` : ''}
            ${pres.nearCount > 0 ? `<span class="pill pill-amber">⚠ 其中 ${pres.nearCount} ${esc(unit)}即将到期</span>` : ''}
            ${pres.extraPillText ? `<span class="pill">${esc(pres.extraPillText)}</span>` : ''}
            ${sum.conflictCount > 0 ? `<span class="pill pill-danger">⚠ 数据异常 ${sum.conflictCount} ${esc(unit)}</span>` : ''}
          </div>
        ` : ''}
      </div>
    </button>
  `;
}

function renderPendingListContent(store, scopedRows, viewState, today, nearDays) {
  const viewMode = viewState.viewMode || 'list';
  const subFilter = viewState.pendingSubFilter || 'all';
  const pendingStatusEntries = [];
  const incompleteExpiryEntries = [];
  let totalPendingStatusUnits = 0;
  let totalIncompleteExpiryUnits = 0;

  for (const row of scopedRows) {
    const mStatus = filterProductItems(row.prod, store.state.productItems, 'pending_status', { today, nearDays });
    if (mStatus.matchedCount > 0) {
      totalPendingStatusUnits += mStatus.matchedCount;
      pendingStatusEntries.push({ ...row, match: mStatus });
    }
    const mExpiry = filterProductItems(row.prod, store.state.productItems, 'incomplete_expiry', { today, nearDays });
    if (mExpiry.matchedCount > 0) {
      totalIncompleteExpiryUnits += mExpiry.matchedCount;
      incompleteExpiryEntries.push({ ...row, match: mExpiry });
    }
  }

  const totalPendingAll = totalPendingStatusUnits + totalIncompleteExpiryUnits;
  const showStatusSec = subFilter === 'all' || subFilter === 'pending_status';
  const showExpirySec = subFilter === 'all' || subFilter === 'incomplete_expiry';

  const renderSectionItems = (entries, key) => {
    const wrapClass = viewMode === 'grid' ? 'product-grid' : 'product-list';
    return `
      <div class="${wrapClass}">
        ${entries.map((entry) => renderListProductCard(store, entry, { filterKey: key, detailFilterKey: key, viewMode })).join('')}
      </div>
    `;
  };

  return `
    <div class="stack-sm">
      <div class="segmented c1-subseg" id="box-pending-subbar">
        <button type="button" class="seg-btn ${subFilter === 'all' ? 'is-active' : ''}" data-box-pending-sub="all">全部 (${totalPendingAll})</button>
        <button type="button" class="seg-btn ${subFilter === 'pending_status' ? 'is-active' : ''}" data-box-pending-sub="pending_status">待记录使用状态 (${totalPendingStatusUnits})</button>
        <button type="button" class="seg-btn ${subFilter === 'incomplete_expiry' ? 'is-active' : ''}" data-box-pending-sub="incomplete_expiry">有效期信息待完善 (${totalIncompleteExpiryUnits})</button>
      </div>

      ${showStatusSec ? `
        <div class="stack-sm" data-box-pending-section="pending_status">
          <div class="section-header" style="margin-bottom:0;margin-top:4px;">
            <h2 class="section-title">待记录使用状态（${totalPendingStatusUnits} 件）</h2>
            <span class="section-hint">仅统计使用状态为未记录的产品</span>
          </div>
          ${pendingStatusEntries.length === 0
            ? `<div class="card-muted" style="font-size:12px;">当前没有待记录使用状态的产品。</div>`
            : renderSectionItems(pendingStatusEntries, 'pending_status')}
        </div>
      ` : ''}

      ${showExpirySec ? `
        <div class="stack-sm" data-box-pending-section="incomplete_expiry">
          <div class="section-header" style="margin-bottom:0;margin-top:4px;">
            <h2 class="section-title">有效期信息待完善（${totalIncompleteExpiryUnits} 件）</h2>
            <span class="section-hint">状态已明确，尚缺可算或确认到期日</span>
          </div>
          ${incompleteExpiryEntries.length === 0
            ? `<div class="card-muted" style="font-size:12px;">所有已明确状态的产品有效期信息均已完整。</div>`
            : renderSectionItems(incompleteExpiryEntries, 'incomplete_expiry')}
        </div>
      ` : ''}
    </div>
  `;
}

export function renderBoxView({ store, viewState, ctx }) {
  const today = todayStr();

  if (viewState.selectedProductId) {
    const prod = store.state.products.find((p) => p.id === viewState.selectedProductId && !p.deletedAt);
    if (prod) {
      return renderProductDetail({ store, prod, viewState, today, ctx });
    }
    viewState.selectedProductId = null;
  }

  const activeProducts = store.getActiveProducts();
  const activeProdIds = new Set(activeProducts.map((p) => p.id));
  const totalHeld = store.state.productItems.filter(
    (i) => !i.archivedAt && !i.deletedAt && activeProdIds.has(i.productId) && isHeldStatus(i.status),
  ).length;

  ctx.setHeader({
    title: '我的美妆',
    subtitle: `${activeProducts.length} 款产品 · 共持有 ${totalHeld} 件`,
    actionsHtml: `<button type="button" class="btn btn-primary btn-sm" data-box-add-product="1">+ 添加产品</button>`,
  });

  const q = (viewState.search || '').trim().toLowerCase();
  const catFilter = viewState.categoryId || 'all';
  const stFilter = normalizeStatusFilterKey(viewState.statusFilter || 'all');
  const sortBy = viewState.sortBy || 'updated';
  const viewMode = viewState.viewMode || 'list';
  const nearDays = store.state.settings.nearExpiryDays;

  const scopedRows = activeProducts
    .filter((p) => {
      if (catFilter !== 'all' && p.categoryId !== catFilter) return false;
      if (q) {
        const hay = [
          p.name,
          store.getBrandName(p.brandId),
          p.shade,
          p.texture,
          p.finish,
          p.notesPrivate,
          store.getCategoryName(p.categoryId),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .map((prod) => {
      const sum = summarizeProductCounts(prod, store.state.productItems, { today, nearDays });
      const match = filterProductItems(prod, store.state.productItems, stFilter, { today, nearDays });
      return { prod, sum, match };
    });

  const filtered = scopedRows.filter(({ sum, match }) => {
    if (stFilter === 'all') return sum.heldCount > 0 || store.getItemsForProduct(prodIdPlaceholder(match), { includeArchived: true }).length === 0;
    return match.matchedCount > 0;
  });

  function prodIdPlaceholder(m) {
    return m.matchedItems[0]?.productId || '';
  }

  // 允许没有任何单件记录的新建空产品或持有数 > 0 的产品显示在「当前拥有」
  const displayRows =
    stFilter === 'all'
      ? scopedRows.filter(({ prod, sum }) => sum.heldCount > 0 || store.getItemsForProduct(prod.id, { includeArchived: false }).length === 0)
      : filtered;

  displayRows.sort((a, b) => {
    if (sortBy === 'name') return a.prod.name.localeCompare(b.prod.name, 'zh-CN');
    if (sortBy === 'expiry_asc') {
      const earliest = (pid) => {
        const dates = store
          .getItemsForProduct(pid, { includeArchived: false })
          .map((i) => resolveItemExpiryForDisplay(i).date)
          .filter(Boolean)
          .sort();
        return dates[0] || '9999-99-99';
      };
      return earliest(a.prod.id).localeCompare(earliest(b.prod.id));
    }
    return b.prod.updatedAt.localeCompare(a.prod.updatedAt);
  });

  const statusChips = [
    STATUS_FILTER_META.all,
    STATUS_FILTER_META.in_use,
    STATUS_FILTER_META.unopened,
    STATUS_FILTER_META.pending,
    STATUS_FILTER_META.near,
    STATUS_FILTER_META.used_up,
  ];

  const hasAnyProducts = activeProducts.length > 0;

  return `
    <div class="stack">
      <div class="row-between">
        <div class="search-bar" style="flex:1;">
          <span style="color:var(--text-tertiary);">⌕</span>
          <input id="box-search-input" type="search" placeholder="搜索产品名、品牌、分类、色号或备注" value="${esc(viewState.search || '')}" />
        </div>
        <button type="button" class="icon-btn" data-box-toggle-view="1" title="切换列表或网格">
          ${viewMode === 'list' ? '网格' : '列表'}
        </button>
      </div>

      <div class="chips-scroll" id="box-cat-scroll" aria-label="分类筛选">
        <button type="button" class="chip ${catFilter === 'all' ? 'is-active' : ''}" data-box-cat="all">全部分类</button>
        ${store.state.categories
          .map(
            (c) => `<button type="button" class="chip ${catFilter === c.id ? 'is-active' : ''}" data-box-cat="${esc(c.id)}">${esc(c.name)}</button>`,
          )
          .join('')}
      </div>

      <div class="row-between" style="gap:8px;align-items:center;">
        <div class="chips-scroll" id="box-status-scroll" style="flex:1;min-width:0;">
          ${statusChips
            .map(
              (s) => `<button type="button" class="chip ${stFilter === s.key ? 'is-active' : ''}" data-box-status="${esc(s.key)}">${esc(s.label)}</button>`,
            )
            .join('')}
        </div>
        <select id="box-sort-select" class="select select-compact" aria-label="排序方式">
          <option value="updated" ${sortBy === 'updated' ? 'selected' : ''}>最近更新</option>
          <option value="expiry_asc" ${sortBy === 'expiry_asc' ? 'selected' : ''}>到期日由近到远</option>
          <option value="name" ${sortBy === 'name' ? 'selected' : ''}>按名称</option>
        </select>
      </div>

      ${!hasAnyProducts
        ? renderEmptyState({
            icon: '✧',
            title: '还没有记录美妆产品',
            descHtml: '点击右上角 <span class="nowrap">「+ 添加产品」</span>，只填名称或品牌分类即可快速记下一件。',
            actionLabel: '+ 添加第一款产品',
            actionAttr: 'data-box-add-product="1"',
          })
        : stFilter === 'pending'
          ? renderPendingListContent(store, scopedRows, viewState, today, nearDays)
          : displayRows.length === 0
            ? renderEmptyState({
                icon: '⌕',
                title: '没有找到匹配的美妆产品',
                descHtml: '可以尝试切换筛选条件，或点击右上角 <span class="nowrap">「+ 添加产品」</span>。',
                actionLabel: '清除筛选条件',
                actionAttr: 'data-box-clear-filters="1"',
              })
            : `
              <div class="${viewMode === 'grid' ? 'product-grid' : 'product-list'}">
                ${displayRows
                  .map((row) => renderListProductCard(store, row, { filterKey: stFilter, detailFilterKey: stFilter, viewMode }))
                  .join('')}
              </div>
            `}
    </div>
  `;
}

function renderProductDetail({ store, prod, viewState, today, ctx }) {
  const brand = store.getBrandName(prod.brandId);
  const catName = store.getCategoryName(prod.categoryId);
  const { subCategoryName } = findSubCategoryInfo(prod.categoryId, prod.subCategoryId);
  const photos = store.getProductPhotos(prod.id);
  const cover = store.getProductCoverPhoto(prod.id);
  const coverUrl = getProductDisplayImageUrl(store, prod.id).url;
  const nearDays = store.state.settings.nearExpiryDays;
  const sum = summarizeProductCounts(prod, store.state.productItems, { today, nearDays });
  const unit = prod.quantityUnit || '件';

  const expandedSet = viewState.expandedItemIds instanceof Set ? viewState.expandedItemIds : (viewState.expandedItemIds = new Set());
  const detailFilter = normalizeStatusFilterKey(viewState.detailFilter || 'all');
  const isFilteredDetail = detailFilter !== 'all';
  const detailFilterMeta = STATUS_FILTER_META[detailFilter] || STATUS_FILTER_META.all;
  const detailMatch = isFilteredDetail
    ? filterProductItems(prod, store.state.productItems, detailFilter, { today, nearDays })
    : null;

  const heldIdxById = new Map(sum.heldItems.map((it, i) => [it.id, i]));
  const usedIdxById = new Map(sum.usedUpItems.map((it, i) => [it.id, i]));
  const resolveStableIdx = (it) =>
    it.status === 'used_up' ? (usedIdxById.get(it.id) ?? 0) : (heldIdxById.get(it.id) ?? 0);
  const primaryItems = isFilteredDetail ? detailMatch.matchedItems : sum.heldItems;
  const totalItemCount = sum.heldCount + sum.usedUpCount;

  const itemIds = new Set(store.getItemsForProduct(prod.id, { includeArchived: true }).map((i) => i.id));
  const linkedLooks = [];
  const seenLookIds = new Set();
  for (const lpi of store.state.lookProductItems) {
    if (lpi.productItemId && itemIds.has(lpi.productItemId) && !seenLookIds.has(lpi.lookId)) {
      const look = store.state.looks.find((l) => l.id === lpi.lookId && !l.deletedAt);
      if (look) {
        seenLookIds.add(look.id);
        linkedLooks.push(look);
      }
    }
  }

  ctx.setHeader({
    title: prod.name,
    subtitle: [brand, catName, subCategoryName, prod.specification].filter(Boolean).join(' · '),
    backBtnAttr: 'data-box-back="1"',
    actionsHtml: `<button type="button" class="btn btn-secondary btn-sm" data-box-edit-product="${esc(prod.id)}">编辑</button>`,
  });

  const renderItemCard = (item, idx) => {
    const stObj = ITEM_STATUSES[item.status] || ITEM_STATUSES.unrecorded;
    const isExpanded = expandedSet.has(item.id);
    const resolved = resolveItemExpiryForDisplay(item);
    const comp = getItemExpiryCompleteness(item);
    const expSt = expiryStatus(resolved, today, nearDays);
    const priceText =
      item.purchasePriceMinor !== null && item.purchasePriceMinor !== undefined && isSupportedCurrency(item.currencyCode)
        ? formatMinor(item.purchasePriceMinor, item.currencyCode)
        : '';
    const isUsedUp = item.status === 'used_up';
    const usageDur = isUsedUp ? formatUsageDuration(item.openedDate, item.usedUpDate) : null;
    const acqDisplay = getItemAcquisitionDisplay(item);

    let shortExpiry = '待完善';
    if (resolved.date) {
      shortExpiry = resolved.source === 'confirmed' ? `到期 ${resolved.date}` : `参考到期 ${resolved.date}`;
    }

    const compactLeft = isUsedUp
      ? `用完 ${item.usedUpDate || '未填日期'}`
      : (resolved.date ? shortExpiry : '有效期：待完善');
    const compactRight = isUsedUp
      ? `${usageDur?.valid ? `用时 ${usageDur.text}` : '待补开封日计算时长'}${priceText ? ` · ${priceText}` : ''}`
      : `剩余 ${item.remainingPercent}%${priceText ? ` · ${priceText}` : ''}`;

    const statusOptions = [
      { key: 'unopened', label: '未开封' },
      { key: 'in_use', label: '使用中' },
      { key: 'used_up', label: '已用完' },
    ];
    const statusBarItems = statusOptions.map((opt) => ({
      opt,
      ev: evaluateQuickStatusOption(item, opt.key),
    }));
    const hasUnavailableOption = statusBarItems.some((x) => !x.ev.isCurrent && !x.ev.allowed);

    return `
      <div class="card" style="padding:12px 14px;">
        <div class="row-between" style="gap:8px;">
          <div class="row-wrap" style="gap:6px;">
            <strong style="font-size:14px;">第 ${idx + 1} ${esc(unit)}</strong>
            <span class="pill ${esc(stObj.pillClass || (item.status === 'in_use' ? 'pill-accent' : item.status === 'unopened' ? 'pill-sage' : ''))}">${esc(stObj.label)}</span>
            ${comp.conflict.hasConflict ? `<span class="pill pill-danger">数据异常</span>` : ''}
            ${comp.isIncompleteExpiry ? `<span class="pill">有效期待完善</span>` : ''}
            ${!isUsedUp && expSt.key === 'near' ? `<span class="pill pill-amber">${esc(expSt.label)}</span>` : ''}
            ${!isUsedUp && expSt.key === 'expired' ? `<span class="pill pill-danger">${esc(expSt.label)}</span>` : ''}
            ${item.expiryNeedsReconfirm ? `<span class="pill pill-amber">待重新确认</span>` : ''}
          </div>
          <button type="button" class="ghost-mini-btn" data-box-expand-item="${esc(item.id)}">
            ${isExpanded ? '收起 ▴' : '展开详情 ▾'}
          </button>
        </div>

        <div class="row-between" style="margin-top:8px;font-size:12px;color:var(--text-secondary);gap:4px 8px;flex-wrap:wrap;">
          <span style="white-space:nowrap;">${esc(compactLeft)}</span>
          <span style="text-align:right;white-space:nowrap;">${esc(compactRight)}</span>
        </div>

        ${isExpanded ? `
          <div class="divider"></div>
          <div class="stack-sm" style="font-size:12px;color:var(--text-secondary);">
            ${comp.conflict.hasConflict ? `<div class="form-banner-error" style="font-size:12px;">${esc(comp.conflict.message)}</div>` : ''}
            ${comp.isIncompleteExpiry ? `<div class="form-banner-info" style="font-size:12px;">有效期待完善：${esc(comp.missingReason)}</div>` : ''}
            ${isUsedUp ? `
              <div>开封日期：<strong>${esc(item.openedDate || '未填')}</strong> ｜ 用完日期：<strong>${esc(item.usedUpDate || '未填')}</strong></div>
              <div>使用时长：<strong>${esc(usageDur?.valid ? usageDur.text : (usageDur?.error || '未填开封日期，暂无法计算'))}</strong></div>
            ` : ''}
            <div class="row-between" style="gap:8px;">
              <span>到期参考：<strong>${esc(shortExpiry)}</strong></span>
              <button type="button" class="help-icon-btn" data-item-expiry-help="${esc(item.id)}" aria-label="查看有效期计算详情">?</button>
            </div>
            <div>购买记录：${priceText ? esc(priceText) : '未填金额'}${acqDisplay ? ` · ${esc(acqDisplay)}` : ''}</div>
          </div>

          <div class="stack-sm" style="margin-top:10px;">
            <div class="row-between">
              <span style="font-size:12px;color:var(--text-tertiary);">快速改状态</span>
              ${hasUnavailableOption ? '<span style="font-size:11px;color:var(--text-tertiary);">浅色虚线项不可选，点击可看原因</span>' : ''}
            </div>
            <div class="segmented c1-status-bar">
              ${statusBarItems
                .map(({ opt, ev }) => {
                  const cls = ev.isCurrent ? 'is-active' : ev.allowed ? '' : 'is-unavailable';
                  return `<button type="button" class="seg-btn ${cls}" data-box-status-action="${esc(item.id)}:${opt.key}" aria-pressed="${ev.isCurrent}" aria-disabled="${!ev.allowed}">${opt.label}</button>`;
                })
                .join('')}
            </div>
            <div class="row-wrap" style="margin-top:6px;gap:8px;align-items:center;">
              <button type="button" class="btn btn-secondary btn-sm" data-item-edit="${esc(item.id)}">编辑详细信息</button>
              ${item.status === 'unopened'
                ? `<button type="button" class="btn btn-soft btn-sm" data-box-open-today="${esc(item.id)}">今日开封</button>`
                : (!isUsedUp ? `<button type="button" class="btn btn-soft btn-sm" data-item-usage="${esc(item.id)}">+1 记使用</button>` : '')}
              <button type="button" class="ghost-mini-btn" data-box-remove-item="${esc(item.id)}" style="color:var(--danger);border-color:rgba(180,75,75,0.28);margin-left:auto;">删掉这 1 ${esc(unit)}</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  };

  return `
    <div class="stack">
      <!-- 顶部简洁产品概览 + 数量控制 -->
      <div class="card">
        <div class="row" style="gap:12px;align-items:flex-start;">
          <img src="${coverUrl}" alt="${esc(prod.name)}" style="width:76px;height:76px;object-fit:cover;border-radius:14px;flex-shrink:0;" />
          <div style="flex:1;min-width:0;">
            <div style="font-size:17px;font-weight:700;">${esc(prod.name)}</div>
            <div class="muted-note" style="margin-top:3px;">
              ${esc([brand, [catName, subCategoryName].filter(Boolean).join('·'), prod.shade, prod.specification].filter(Boolean).join(' ｜ '))}
            </div>
            ${prod.notesPrivate ? `<div class="muted-note" style="margin-top:4px;">备注：${esc(prod.notesPrivate)}</div>` : ''}
          </div>
        </div>

        <div class="divider"></div>

        <div class="row-between" style="gap:10px;">
          <div>
            <div style="font-weight:700;font-size:15px;">当前拥有：${sum.heldCount} ${esc(unit)}</div>
            <div class="muted-note row-wrap" style="margin-top:2px;gap:2px 6px;">
              ${sum.heldCount > 0
                ? [
                    sum.inUseCount + sum.idleCount > 0 ? `<span style="white-space:nowrap;">使用中 ${sum.inUseCount + sum.idleCount}</span>` : '',
                    sum.unopenedCount ? `<span style="white-space:nowrap;">未开封 ${sum.unopenedCount}</span>` : '',
                    sum.pendingStatusCount ? `<span style="white-space:nowrap;">待记录使用状态 ${sum.pendingStatusCount}</span>` : '',
                  ].filter(Boolean).join('<span>·</span>')
                : '<span style="white-space:nowrap;">当前暂无在手产品</span>'}
              ${sum.usedUpCount > 0 ? `<span style="white-space:nowrap;">（历史用完 ${sum.usedUpCount} ${esc(unit)}）</span>` : ''}
            </div>
          </div>
          <div class="row" style="gap:6px;">
            <button type="button" class="icon-btn" id="box-qty-dec" ${sum.heldCount === 0 ? 'disabled' : ''} aria-label="减少一件">−</button>
            <button type="button" class="btn btn-primary btn-sm" id="box-qty-inc">+ 添加一件</button>
          </div>
        </div>
      </div>

      ${isFilteredDetail ? `
        <div class="card-muted row-between" style="gap:8px;padding:10px 12px;">
          <span style="font-size:12px;color:var(--text-secondary);">
            当前仅看「<strong>${esc(detailFilterMeta.label)}</strong>」（${detailMatch.matchedCount} ${esc(unit)}）
          </span>
          <button type="button" class="ghost-mini-btn" data-box-detail-show-all="1">查看全部（${totalItemCount}）</button>
        </div>
      ` : ''}

      <!-- 每件产品明细区 -->
      <div class="stack-sm">
        <div class="section-header" style="margin-bottom:0;">
          <h2 class="section-title">${isFilteredDetail
            ? `${esc(detailFilterMeta.label)}（${primaryItems.length} ${esc(unit)}）`
            : `我的每件产品（${sum.heldCount} ${esc(unit)}）`}</h2>
          <span class="section-hint">点卡片可展开或修改状态</span>
        </div>
        ${primaryItems.length === 0
          ? (isFilteredDetail
              ? renderEmptyState({
                  icon: '✧',
                  title: `当前「${detailFilterMeta.label}」下暂无产品`,
                  desc: totalItemCount > 0
                    ? `该款产品下还有 ${totalItemCount} ${unit}其他状态记录，可点击下方按钮查看全部。`
                    : '新购入时可点上方「+ 添加一件」。',
                  actionLabel: totalItemCount > 0 ? `查看全部（${totalItemCount}）` : '+ 添加一件',
                  actionAttr: totalItemCount > 0 ? 'data-box-detail-show-all="1"' : 'data-box-detail-add-one="1"',
                })
              : renderEmptyState({
                  icon: '🧴',
                  title: '当前没有正在使用的这一款',
                  desc: '新购入时点上方「+ 添加一件」，已有历史用完记录仍安全保留在下方。',
                  actionLabel: '+ 添加一件',
                  actionAttr: 'data-box-detail-add-one="1"',
                }))
          : primaryItems.map((it) => renderItemCard(it, resolveStableIdx(it))).join('')}
      </div>

      <!-- 历史用完折叠区 -->
      ${(!isFilteredDetail && sum.usedUpCount > 0) ? `
        <div class="card">
          <button type="button" class="me-accordion-trigger" id="box-toggle-usedup" style="padding:0;min-height:32px;">
            <span style="font-weight:700;font-size:14px;">历史用完记录（${sum.usedUpCount} ${esc(unit)}）</span>
            <span class="muted-note">${viewState.showUsedUpHistory ? '收起 ▴' : '展开查看 ▾'}</span>
          </button>
          ${viewState.showUsedUpHistory ? `
            <div class="stack-sm" style="margin-top:12px;">
              ${sum.usedUpItems.map((it, idx) => renderItemCard(it, idx)).join('')}
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- 产品照片与封面管理 -->
      <div class="card">
        <div class="section-header">
          <div>
            <h2 class="section-title">产品照片（${photos.length}）</h2>
            <div class="muted-note">${cover ? (cover.isCover ? '已设主封面' : '无主封面，自动展示第一张图') : '当前未配图，使用分类占位图'}</div>
          </div>
          <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
            + 上传照片
            <input type="file" accept="image/*" id="detail-upload-photo" style="display:none;" />
          </label>
        </div>
        ${photos.length > 0 ? `
          <div class="photo-grid">
            ${photos
              .map((ph) => {
                const url = store.getAssetUrl(ph.assetId);
                return `
                  <div class="photo-tile">
                    <img src="${url || coverUrl}" alt="${esc(prod.name)}" />
                    ${ph.isCover ? `<span class="photo-cover-badge">主封面</span>` : ''}
                    <div class="photo-tile-actions">
                      ${ph.isCover
                        ? `<button type="button" data-clear-cover="${esc(ph.id)}">取消封面</button>`
                        : `<button type="button" data-set-cover="${esc(ph.id)}">设为封面</button>`}
                      <button type="button" data-del-photo="${esc(ph.id)}">删除</button>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        ` : `<div class="muted-note">尚未上传实物照，可随时添加并设为主封面。</div>`}
      </div>

      <!-- 关联历史妆容快照 -->
      <div class="card">
        <div class="section-header" style="margin-bottom:6px;">
          <h2 class="section-title">关联的妆容记录（${linkedLooks.length}）</h2>
          <span class="section-hint">历史快照受保护</span>
        </div>
        ${linkedLooks.length === 0
          ? `<div class="muted-note">这款产品暂未关联妆容记录。</div>`
          : `
            <div class="stack-sm">
              ${linkedLooks
                .map(
                  (lk) => `
                <button type="button" class="list-item-btn" data-box-open-look="${esc(lk.id)}">
                  <div>
                    <div style="font-weight:600;font-size:14px;">${esc(lk.name)}</div>
                    <div class="muted-note">${esc(lk.lookDate)} · ${esc(lk.scene || lk.style || '妆容记录')}</div>
                  </div>
                  <span class="muted-note">查看 ›</span>
                </button>
              `,
                )
                .join('')}
            </div>
          `}
      </div>

      <!-- 整款产品管理（7 天最近删除） -->
      <div class="card">
        <div class="row-between" style="gap:12px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;">整款产品管理</div>
            <div class="muted-note" style="margin-top:2px;">移除整款产品将进入「我的 → 最近删除」保留 7 天（不影响历史妆容）。</div>
          </div>
          <button type="button" class="btn btn-danger btn-sm" data-box-trash-product="${esc(prod.id)}">移除整款产品</button>
        </div>
      </div>
    </div>
  `;
}

/* ---------------- 通用单件草稿块（新建连续页与编辑详情共用） ---------------- */

function createBlankItemDraft(defaultCurrency = 'CNY') {
  return {
    status: '',
    manufactureDate: '',
    unopenedShelfMonths: '',
    openedDate: '',
    usedUpDate: '',
    paoMonths: '',
    confirmedExpiryDate: '',
    remainingPercent: 100,
    purchasePriceInput: '',
    currencyCode: defaultCurrency || 'CNY',
    acquisitionPreset: '',
    acquisitionCustomText: '',
  };
}

function renderItemDraftBlock(idx, draft, { showTitle = false, showCurrency = false } = {}) {
  const isOpenedLocked = !draft.status || draft.status === 'unopened' || draft.status === 'unrecorded';
  const showPlaceholder = !draft.status || draft.status === 'unrecorded';
  return `
    <div class="card-muted" data-draft-idx="${idx}" style="margin-top:8px;">
      ${showTitle ? `<div style="font-weight:700;font-size:13px;margin-bottom:8px;">第 ${idx + 1} 件详细信息（均选填）</div>` : ''}

      <div class="field-row">
        <div class="field">
          <label>使用状态</label>
          <select class="select" data-df="status">
            ${showPlaceholder ? `<option value="" selected>请选择使用状态（选填）</option>` : ''}
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

      <div class="field-row" style="margin-top:8px;">
        <div class="field">
          <label>生产日期</label>
          <input class="input" type="date" data-df="manufactureDate" value="${esc(draft.manufactureDate)}" />
        </div>
        <div class="field">
          <label>未开封保质期（月）</label>
          <input class="input" type="number" min="1" placeholder="例如 36" data-df="unopenedShelfMonths" value="${esc(draft.unopenedShelfMonths)}" />
        </div>
      </div>

      <div class="field-row" style="margin-top:8px;">
        <div class="field">
          <label>开封日期</label>
          <div data-opened-wrap style="position:relative;">
            <input class="input" type="date" data-df="openedDate" min="${esc(draft.manufactureDate || '')}" value="${esc(draft.openedDate)}" ${isOpenedLocked ? 'readonly style="background:var(--bg-subtle);color:var(--text-tertiary);pointer-events:none;"' : ''} />
            <div data-opened-lock-hit style="display:${isOpenedLocked ? 'block' : 'none'};position:absolute;inset:0;cursor:not-allowed;" title="请先切换使用状态后再填写开封日期"></div>
          </div>
        </div>
        <div class="field">
          <label>开封后期限 PAO（月）</label>
          <input class="input" type="number" min="1" placeholder="例如 12" data-df="paoMonths" value="${esc(draft.paoMonths)}" />
        </div>
      </div>

      <div class="field" data-usedup-wrap style="margin-top:8px;display:${draft.status === 'used_up' ? '' : 'none'};">
        <label>用完日期</label>
        <input class="input" type="date" data-df="usedUpDate" min="${esc([draft.manufactureDate, draft.openedDate].filter(Boolean).sort().pop() || '')}" value="${esc(draft.usedUpDate || '')}" />
        <div class="field-help" data-usedup-dur-preview></div>
      </div>

      <div class="field" style="margin-top:8px;">
        <div class="row-between" style="gap:6px;">
          <label style="margin:0;">用户确认到期日（选填）</label>
          <button type="button" class="help-icon-btn" data-toggle-dual-help aria-label="查看推算依据">?</button>
        </div>
        <div class="form-banner-info" data-dual-preview style="display:none;font-size:12px;"></div>
        <input class="input" type="date" data-df="confirmedExpiryDate" value="${esc(draft.confirmedExpiryDate)}" />
        <div class="adopt-btn-row" style="margin-top:6px;">
          <button type="button" class="btn btn-soft btn-sm" data-adopt-unopened>采纳未开封推算</button>
          <button type="button" class="btn btn-soft btn-sm" data-adopt-opened>采纳开封后推算</button>
        </div>
      </div>

      <div class="field-row" style="margin-top:8px;">
        <div class="field">
          <label>购买价格（${esc(CURRENCIES[draft.currencyCode]?.name || draft.currencyCode || '人民币')}）</label>
          <input class="input" inputmode="decimal" placeholder="例如 320.00" data-df="purchasePriceInput" value="${esc(draft.purchasePriceInput)}" />
        </div>
        <div class="field">
          <label>获得方式</label>
          <select class="select" data-df="acquisitionPreset">
            <option value="">不填写</option>
            ${ACQUISITION_PRESETS.map((p) => `<option value="${esc(p)}" ${draft.acquisitionPreset === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}
            <option value="其他" ${draft.acquisitionPreset === '其他' ? 'selected' : ''}>其他（自定义）</option>
          </select>
        </div>
      </div>

      <div class="field" data-acq-custom-wrap style="margin-top:8px;display:${draft.acquisitionPreset === '其他' ? '' : 'none'};">
        <label>自定义获得方式</label>
        <input class="input" data-df="acquisitionCustomText" placeholder="例如：日本药妆店带回" value="${esc(draft.acquisitionCustomText || '')}" />
      </div>

      ${showCurrency ? `
        <div class="field" style="margin-top:8px;">
          <label>购买币种</label>
          <select class="select" data-df="currencyCode">
            ${CURRENCY_ORDER.map((c) => `<option value="${esc(c)}" ${draft.currencyCode === c ? 'selected' : ''}>${esc(CURRENCIES[c].name)} (${esc(c)})</option>`).join('')}
            ${UNCONFIGURED_DEMO_CODES.map((c) => `<option value="${esc(c)}" ${draft.currencyCode === c ? 'selected' : ''}>${esc(c)} (未配置·测拦截)</option>`).join('')}
          </select>
          <div class="field-help" data-df-currency-hint>${esc(describePrecision(draft.currencyCode || 'CNY'))}</div>
        </div>
      ` : ''}
    </div>
  `;
}

function bindDraftExpiryHelpers(box, draft, toast) {
  const previewEl = box.querySelector('[data-dual-preview]');
  const toggleHelpBtn = box.querySelector('[data-toggle-dual-help]');
  const btnUnopened = box.querySelector('[data-adopt-unopened]');
  const btnOpened = box.querySelector('[data-adopt-opened]');
  const confInput = box.querySelector('[data-df="confirmedExpiryDate"]');
  const statusSel = box.querySelector('[data-df="status"]');
  const mfgInput = box.querySelector('[data-df="manufactureDate"]');
  const shelfInput = box.querySelector('[data-df="unopenedShelfMonths"]');
  const openInput = box.querySelector('[data-df="openedDate"]');
  const openLockHit = box.querySelector('[data-opened-lock-hit]');
  const paoInput = box.querySelector('[data-df="paoMonths"]');
  const usedUpWrap = box.querySelector('[data-usedup-wrap]');
  const usedUpInput = box.querySelector('[data-df="usedUpDate"]');
  const usedUpDurEl = box.querySelector('[data-usedup-dur-preview]');
  const acqSel = box.querySelector('[data-df="acquisitionPreset"]');
  const acqCustomWrap = box.querySelector('[data-acq-custom-wrap]');
  const curSel = box.querySelector('[data-df="currencyCode"]');
  const curHint = box.querySelector('[data-df-currency-hint]');

  const syncOpenedLock = () => {
    const curStatus = statusSel ? statusSel.value : draft.status;
    const locked = !curStatus || curStatus === 'unopened' || curStatus === 'unrecorded';
    if (openInput) {
      openInput.readOnly = locked;
      openInput.style.background = locked ? 'var(--bg-subtle)' : '';
      openInput.style.color = locked ? 'var(--text-tertiary)' : '';
      openInput.style.pointerEvents = locked ? 'none' : '';
    }
    if (openLockHit) {
      openLockHit.style.display = locked ? 'block' : 'none';
    }
    return locked;
  };

  openLockHit?.addEventListener('click', () => {
    toast?.('请先将使用状态改为「使用中」或「已用完」，再填写开封日期');
  });

  toggleHelpBtn?.addEventListener('click', () => {
    if (!previewEl) return;
    previewEl.style.display = previewEl.style.display === 'none' ? 'block' : 'none';
  });

  const readVal = (el, fallback) => (el ? String(el.value || '').trim() : String(fallback || '').trim());

  const refresh = () => {
    const locked = syncOpenedLock();
    const curStatus = statusSel ? statusSel.value : draft.status;
    const mfg = readVal(mfgInput, draft.manufactureDate);
    const shelfRaw = readVal(shelfInput, draft.unopenedShelfMonths);
    const opened = locked ? '' : readVal(openInput, draft.openedDate);
    const usedUpVal = curStatus === 'used_up' ? readVal(usedUpInput, draft.usedUpDate) : '';
    const paoRaw = readVal(paoInput, draft.paoMonths);

    draft.manufactureDate = mfg;
    draft.unopenedShelfMonths = shelfRaw;
    if (!locked) draft.openedDate = opened;
    draft.usedUpDate = usedUpVal;
    draft.paoMonths = paoRaw;

    if (openInput) openInput.min = mfg || '';
    if (usedUpInput) usedUpInput.min = [mfg, opened].filter(Boolean).sort().pop() || '';
    const openedBeforeMfg = Boolean(mfg && opened && opened < mfg);

    if (acqCustomWrap && acqSel) {
      acqCustomWrap.style.display = acqSel.value === '其他' ? '' : 'none';
    }
    if (curHint && curSel) {
      curHint.textContent = describePrecision(curSel.value);
    }
    if (usedUpWrap) {
      usedUpWrap.style.display = curStatus === 'used_up' ? '' : 'none';
    }
    if (usedUpDurEl && curStatus === 'used_up') {
      const effectiveUsedUp = usedUpVal || todayStr();
      if (mfg && effectiveUsedUp < mfg) {
        usedUpDurEl.textContent = '使用时长：用完日期不能早于生产日期';
      } else if (!opened) {
        usedUpDurEl.textContent = '使用时长：填写开封日期后自动计算';
      } else if (openedBeforeMfg) {
        usedUpDurEl.textContent = '使用时长：开封日期不能早于生产日期';
      } else {
        const dur = formatUsageDuration(opened, effectiveUsedUp);
        usedUpDurEl.textContent = dur.valid ? `使用时长：${dur.text}` : `使用时长：${dur.error || '无法计算'}`;
      }
    }

    const dual = deriveDualComputedExpiry({
      manufactureDate: mfg || null,
      unopenedShelfMonths: /^\d+$/.test(shelfRaw) ? Number.parseInt(shelfRaw, 10) : null,
      openedDate: openedBeforeMfg ? null : (opened || null),
      paoMonths: /^\d+$/.test(paoRaw) ? Number.parseInt(paoRaw, 10) : null,
    });
    if (previewEl) {
      const lines = [
        dual.unopened.date
          ? `未开封推算：${dual.unopened.date}（${dual.unopened.formula}）`
          : `未开封推算：${dual.unopened.missingHint || '未填写生产日期与未开封保质期'}`,
        openedBeforeMfg
          ? `开封后推算：开封日期（${opened}）不能早于生产日期（${mfg}）`
          : dual.opened.date
            ? `开封后推算：${dual.opened.date}（${dual.opened.formula}）`
            : `开封后推算：${locked ? '未开封状态下不启用开封后推算' : (dual.opened.missingHint || '未填写开封日期与 PAO')}`,
      ];
      previewEl.innerHTML = lines.map((l) => `<div>${esc(l)}</div>`).join('');
    }
    if (btnUnopened) {
      btnUnopened.disabled = !dual.unopened.date;
      btnUnopened.style.display = dual.unopened.date ? '' : 'none';
      btnUnopened.textContent = dual.unopened.date ? `采纳未开封 (${dual.unopened.date})` : '采纳未开封推算';
    }
    if (btnOpened) {
      const showOpenedAdopt = !openedBeforeMfg && Boolean(dual.opened.date) && (curStatus === 'in_use' || curStatus === 'used_up');
      btnOpened.disabled = !showOpenedAdopt;
      btnOpened.style.display = showOpenedAdopt ? '' : 'none';
      btnOpened.textContent = showOpenedAdopt ? `采纳开封后 (${dual.opened.date})` : '采纳开封后推算';
    }
    return dual;
  };

  [mfgInput, shelfInput, openInput, usedUpInput, paoInput].forEach((el) => {
    el?.addEventListener('input', refresh);
    el?.addEventListener('change', refresh);
  });
  statusSel?.addEventListener('change', refresh);
  acqSel?.addEventListener('change', refresh);
  curSel?.addEventListener('change', refresh);

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

/* ---------------- 连续单页表单：+ 添加产品 / 编辑产品 ---------------- */

export function openProductFormSheet({ store, sheet, toast, productId = null, onSaved }) {
  const existing = productId ? store.state.products.find((p) => p.id === productId) : null;
  const isEdit = Boolean(existing);
  const categories = store.state.categories;
  const initPrimaryId = existing?.categoryId || categories[0]?.id || 'cat-base';
  const initSubs = CATEGORY_SUBCATEGORIES[initPrimaryId] || [];
  const initSubId = existing?.subCategoryId ?? (isEdit ? '' : initSubs[0]?.id || '');
  const initUnitInfo = findSubCategoryInfo(initPrimaryId, initSubId);
  const defaultCur = store.state.settings.homeSelectedCurrency || 'CNY';

  const rawSpecParts = existing
    ? {
        value: existing.specificationValue ?? parseSpecificationParts(existing.specification).value,
        unit: existing.specificationUnit ?? parseSpecificationParts(existing.specification).unit,
        customUnit: existing.specificationCustomUnit ?? parseSpecificationParts(existing.specification).customUnit,
      }
    : { value: '', unit: 'ml', customUnit: '' };
  const specParts =
    rawSpecParts.unit && !['ml', 'g', '其他'].includes(rawSpecParts.unit)
      ? { value: rawSpecParts.value, unit: '其他', customUnit: rawSpecParts.customUnit || rawSpecParts.unit }
      : rawSpecParts;

  let selectedCatId = initPrimaryId;
  let selectedSubId = initSubId;
  let quantity = 1;
  let quantityUnit = existing?.quantityUnit || initUnitInfo.defaultUnit || '件';
  let unitManuallyChanged = Boolean(existing?.quantityUnit);
  let detailsExpanded = false;
  let batchMode = 'same';
  let itemDrafts = [createBlankItemDraft(defaultCur)];
  let pendingFile = null;
  let pendingPreviewUrl = '';
  let selectedSampleKey = '';
  const hasExistingPhotos = existing ? store.getProductPhotos(existing.id).length > 0 : false;

  const revokePreview = () => {
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
      pendingPreviewUrl = '';
    }
  };
  const syncDraftCount = () => {
    while (itemDrafts.length < quantity) itemDrafts.push(createBlankItemDraft(defaultCur));
    if (itemDrafts.length > quantity) itemDrafts = itemDrafts.slice(0, quantity);
  };
  const renderSubOptions = (catId, chosenSubId) => {
    const subs = CATEGORY_SUBCATEGORIES[catId] || [];
    if (subs.length === 0) return '<option value="">无细分</option>';
    return [
      '<option value="">不选细分</option>',
      ...subs.map((s) => `<option value="${esc(s.id)}" ${s.id === chosenSubId ? 'selected' : ''}>${esc(s.name)}</option>`),
    ].join('');
  };

  const bodyHtml = `
    <form id="product-form" class="form-stack" novalidate>
      <div id="prod-form-error" class="form-banner-error" style="display:none;"></div>

      <div class="field-row">
        <div class="field">
          <label>一级分类 <span class="req">*</span></label>
          <select class="select" name="categoryId" id="box-f-pri">
            ${categories.map((c) => `<option value="${esc(c.id)}" ${c.id === selectedCatId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>二级分类</label>
          <select class="select" name="subCategoryId" id="box-f-sub">
            ${renderSubOptions(selectedCatId, selectedSubId)}
          </select>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>品牌（选填）</label>
          <input class="input" name="brandName" id="box-f-brand" placeholder="例如：Lancôme" value="${esc(existing ? store.getBrandName(existing.brandId) : '')}" />
        </div>
        <div class="field">
          <label>色号 / 款式（选填）</label>
          <input class="input" name="shade" id="box-f-shade" placeholder="例如：#196" value="${esc(existing?.shade || '')}" />
        </div>
      </div>

      <div class="field">
        <label>产品名称（选填，留空自动按品牌+分类+色号命名）</label>
        <input class="input" name="customName" id="box-f-name" placeholder="不填则自动生成展示名称" value="${esc(existing ? (existing.customName ?? existing.name ?? '') : '')}" />
        <div class="field-help">展示预览：<strong id="box-name-preview"></strong></div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>单件规格（选填）</label>
          <input class="input" name="specificationValue" placeholder="例如：30" value="${esc(specParts.value)}" />
        </div>
        <div class="field">
          <label>规格单位</label>
          <select class="select" name="specificationUnit" id="f-spec-unit">
            <option value="">不填</option>
            ${['ml', 'g'].map((u) => `<option value="${esc(u)}" ${specParts.unit === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}
            <option value="其他" ${specParts.unit === '其他' ? 'selected' : ''}>其他（自定义）</option>
          </select>
        </div>
      </div>

      <div class="field" id="f-spec-custom-wrap" style="${specParts.unit === '其他' ? '' : 'display:none;'}">
        <label>自定义规格单位</label>
        <input class="input" name="specificationCustomUnit" placeholder="例如：片 / 组" value="${esc(specParts.customUnit)}" />
      </div>

      <div class="field">
        <label>产品照片（选填，仅保存在本地 IndexedDB）</label>
        <div class="row-wrap">
          <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
            选择本地照片
            <input type="file" accept="image/*" id="prod-file-input" style="display:none;" />
          </label>
          <span id="prod-file-name" class="muted-note">未选择本地文件</span>
        </div>
        <div id="prod-upload-preview"></div>
        <div class="field-help">或从离线示例图库挑选配图（再点一次可取消）：</div>
        ${renderSamplePickerGrid(selectedSampleKey)}
      </div>

      <div class="field">
        <label>私人备注（默认不分享）</label>
        <textarea class="textarea" name="notesPrivate" placeholder="使用心得、肤质适配笔记...">${esc(existing?.notesPrivate || '')}</textarea>
      </div>

      ${!isEdit ? `
        <div class="divider"></div>
        <div class="row-between" style="gap:10px;">
          <div>
            <div style="font-weight:700;font-size:14px;">拥有数量</div>
            <div class="muted-note">与单件规格分开，默认 1</div>
          </div>
          <div class="row" style="gap:8px;">
            <button type="button" class="icon-btn" id="box-add-qty-dec">−</button>
            <strong id="box-add-qty-val" style="min-width:24px;text-align:center;font-size:16px;">1</strong>
            <button type="button" class="icon-btn" id="box-add-qty-inc">+</button>
            <select class="select" id="box-f-qty-unit" style="width:auto;min-width:74px;">
              ${QUANTITY_UNITS.map((u) => `<option value="${esc(u)}" ${u === quantityUnit ? 'selected' : ''}>${esc(u)}</option>`).join('')}
              <option value="其他" ${!QUANTITY_UNITS.includes(quantityUnit) ? 'selected' : ''}>其他</option>
            </select>
          </div>
        </div>
        <div class="field" id="box-f-qty-custom-wrap" style="${!QUANTITY_UNITS.includes(quantityUnit) ? '' : 'display:none;'}">
          <label>自定义数量单位</label>
          <input class="input" id="box-f-qty-custom" placeholder="例如：对 / 组" value="${esc(!QUANTITY_UNITS.includes(quantityUnit) ? quantityUnit : '')}" />
        </div>

        <div class="card" style="padding:10px 12px;">
          <button type="button" class="me-accordion-trigger" id="box-toggle-details" style="padding:2px 0;min-height:36px;">
            <span style="font-weight:700;font-size:14px;">补充每件详细信息（选填，可跳过）</span>
            <span class="pill" id="box-details-pill">已收起</span>
          </button>
          <div id="box-details-body" style="display:none;margin-top:8px;"></div>
        </div>
      ` : `
        <div class="field">
          <label>数量单位</label>
          <select class="select" id="box-f-qty-unit">
            ${QUANTITY_UNITS.map((u) => `<option value="${esc(u)}" ${u === quantityUnit ? 'selected' : ''}>${esc(u)}</option>`).join('')}
            <option value="其他" ${!QUANTITY_UNITS.includes(quantityUnit) ? 'selected' : ''}>其他</option>
          </select>
        </div>
        <div class="field" id="box-f-qty-custom-wrap" style="${!QUANTITY_UNITS.includes(quantityUnit) ? '' : 'display:none;'}">
          <label>自定义数量单位</label>
          <input class="input" id="box-f-qty-custom" value="${esc(!QUANTITY_UNITS.includes(quantityUnit) ? quantityUnit : '')}" />
        </div>
      `}

      <button type="submit" class="btn btn-primary btn-block">${isEdit ? '保存修改' : '保存并查看产品'}</button>
    </form>
  `;

  sheet.open({
    title: isEdit ? '编辑产品信息' : '添加美妆产品',
    bodyHtml,
    onClose: revokePreview,
    onMount: (body, close) => {
      const form = body.querySelector('#product-form');
      const errBox = body.querySelector('#prod-form-error');
      const priEl = body.querySelector('#box-f-pri');
      const subEl = body.querySelector('#box-f-sub');
      const brandEl = body.querySelector('#box-f-brand');
      const shadeEl = body.querySelector('#box-f-shade');
      const nameEl = body.querySelector('#box-f-name');
      const namePreviewEl = body.querySelector('#box-name-preview');
      const specUnitEl = body.querySelector('#f-spec-unit');
      const specCustomWrap = body.querySelector('#f-spec-custom-wrap');
      const qtyUnitEl = body.querySelector('#box-f-qty-unit');
      const qtyCustomWrap = body.querySelector('#box-f-qty-custom-wrap');
      const qtyCustomEl = body.querySelector('#box-f-qty-custom');
      const qtyValEl = body.querySelector('#box-add-qty-val');
      const detailsBodyEl = body.querySelector('#box-details-body');
      const detailsPillEl = body.querySelector('#box-details-pill');
      const fileInput = body.querySelector('#prod-file-input');
      const fileNameEl = body.querySelector('#prod-file-name');
      const previewWrap = body.querySelector('#prod-upload-preview');
      const sampleOpts = getSampleArtworkOptions();

      const updateNamePreview = () => {
        const catName = store.getCategoryName(priEl.value);
        const { subCategoryName } = findSubCategoryInfo(priEl.value, subEl.value);
        namePreviewEl.textContent = composeProductDisplayName({
          customName: nameEl.value,
          brandName: brandEl.value,
          categoryName: catName,
          subCategoryName,
          shade: shadeEl.value,
        });
      };

      const renderDetailsSection = () => {
        if (!detailsBodyEl) return;
        detailsBodyEl.style.display = detailsExpanded ? 'block' : 'none';
        if (detailsPillEl) detailsPillEl.textContent = detailsExpanded ? '点击收起' : '已收起';
        if (!detailsExpanded) return;

        syncDraftCount();
        const showFx = Boolean(store.state.settings.enableForeignCurrency);
        detailsBodyEl.innerHTML = `
          <div class="muted-note" style="margin-bottom:8px;">
            所有日期、价格与状态均为选填；未填写状态时将记为「未记录」，随时可在详情补充。
          </div>
          ${quantity > 1 ? `
            <div class="segmented" style="margin-bottom:8px;">
              <button type="button" class="seg-btn ${batchMode === 'same' ? 'is-active' : ''}" data-box-batch="same">全部采用同一批信息</button>
              <button type="button" class="seg-btn ${batchMode === 'per_item' ? 'is-active' : ''}" data-box-batch="per_item">逐件分别编辑 (${quantity} 件)</button>
            </div>
          ` : ''}
          ${quantity > 1 && batchMode === 'per_item'
            ? itemDrafts.map((d, idx) => renderItemDraftBlock(idx, d, { showTitle: true, showCurrency: showFx })).join('')
            : renderItemDraftBlock(0, itemDrafts[0], { showTitle: false, showCurrency: showFx })}
        `;

        detailsBodyEl.querySelectorAll('[data-box-batch]').forEach((b) => {
          b.addEventListener('click', () => {
            batchMode = b.dataset.boxBatch;
            renderDetailsSection();
          });
        });

        detailsBodyEl.querySelectorAll('[data-draft-idx]').forEach((box) => {
          const idx = Number.parseInt(box.dataset.draftIdx, 10);
          bindDraftExpiryHelpers(box, itemDrafts[idx], toast);
          const statusSel = box.querySelector('[data-df="status"]');
          const openedInp = box.querySelector('[data-df="openedDate"]');
          const usedUpInp = box.querySelector('[data-df="usedUpDate"]');
          const remInp = box.querySelector('[data-df="remainingPercent"]');
          box.querySelectorAll('[data-df]').forEach((inp) => {
            const eventName = inp.tagName === 'SELECT' ? 'change' : 'input';
            inp.addEventListener(eventName, () => {
              itemDrafts[idx][inp.dataset.df] = inp.value;
              if (inp === statusSel) {
                if (inp.value === 'in_use' && !itemDrafts[idx].openedDate) {
                  const t = todayStr();
                  itemDrafts[idx].openedDate = t;
                  if (openedInp) {
                    openedInp.value = t;
                    openedInp.dispatchEvent(new Event('input'));
                  }
                } else if (inp.value === 'unopened' || inp.value === 'unrecorded') {
                  itemDrafts[idx].openedDate = '';
                  if (openedInp) {
                    openedInp.value = '';
                    openedInp.dispatchEvent(new Event('input'));
                  }
                } else if (inp.value === 'used_up') {
                  itemDrafts[idx].remainingPercent = 0;
                  if (remInp) remInp.value = '0';
                  if (!itemDrafts[idx].usedUpDate) {
                    const t = todayStr();
                    itemDrafts[idx].usedUpDate = t;
                    if (usedUpInp) usedUpInp.value = t;
                  }
                }
                if (inp.value !== 'used_up') {
                  itemDrafts[idx].usedUpDate = '';
                  if (usedUpInp) usedUpInp.value = '';
                }
                usedUpInp?.dispatchEvent(new Event('input'));
              }
            });
          });
        });
      };

      const updateUploadPreview = () => {
        const badgeText = !isEdit || !hasExistingPhotos ? '将设为产品封面' : '将追加产品附图';
        if (pendingFile && pendingPreviewUrl) {
          previewWrap.innerHTML = renderUploadPreview({
            previewUrl: pendingPreviewUrl,
            title: pendingFile.name || '已选择照片',
            badgeText,
            subtitle: `${formatBytes(pendingFile.size)} · 保存后写入 IndexedDB`,
          });
        } else if (selectedSampleKey) {
          const opt = sampleOpts.find((o) => o.key === selectedSampleKey);
          previewWrap.innerHTML = opt
            ? renderUploadPreview({
                previewUrl: opt.url,
                title: opt.title,
                badgeText,
                subtitle: '离线示例图',
              })
            : '';
        } else {
          previewWrap.innerHTML = '';
        }
      };

      priEl.addEventListener('change', () => {
        selectedCatId = priEl.value;
        const subs = CATEGORY_SUBCATEGORIES[selectedCatId] || [];
        selectedSubId = subs[0]?.id || '';
        subEl.innerHTML = renderSubOptions(selectedCatId, selectedSubId);
        if (!unitManuallyChanged) {
          const { defaultUnit } = findSubCategoryInfo(selectedCatId, selectedSubId);
          quantityUnit = defaultUnit || '件';
          if (qtyUnitEl) qtyUnitEl.value = QUANTITY_UNITS.includes(quantityUnit) ? quantityUnit : '其他';
        }
        updateNamePreview();
      });

      subEl.addEventListener('change', () => {
        selectedSubId = subEl.value;
        if (!unitManuallyChanged) {
          const { defaultUnit } = findSubCategoryInfo(selectedCatId, selectedSubId);
          quantityUnit = defaultUnit || '件';
          if (qtyUnitEl) qtyUnitEl.value = QUANTITY_UNITS.includes(quantityUnit) ? quantityUnit : '其他';
        }
        updateNamePreview();
      });

      [brandEl, shadeEl, nameEl].forEach((el) => el.addEventListener('input', updateNamePreview));
      specUnitEl?.addEventListener('change', () => {
        if (specCustomWrap) specCustomWrap.style.display = specUnitEl.value === '其他' ? '' : 'none';
      });
      qtyUnitEl?.addEventListener('change', () => {
        unitManuallyChanged = true;
        if (qtyCustomWrap) qtyCustomWrap.style.display = qtyUnitEl.value === '其他' ? '' : 'none';
      });

      body.querySelector('#box-add-qty-dec')?.addEventListener('click', () => {
        if (quantity <= 1) return;
        quantity -= 1;
        qtyValEl.textContent = String(quantity);
        if (detailsExpanded) renderDetailsSection();
      });
      body.querySelector('#box-add-qty-inc')?.addEventListener('click', () => {
        if (quantity >= 20) return;
        quantity += 1;
        qtyValEl.textContent = String(quantity);
        if (detailsExpanded) renderDetailsSection();
      });
      body.querySelector('#box-toggle-details')?.addEventListener('click', () => {
        detailsExpanded = !detailsExpanded;
        renderDetailsSection();
      });

      fileInput?.addEventListener('change', () => {
        revokePreview();
        const f = fileInput.files?.[0] || null;
        pendingFile = f;
        selectedSampleKey = '';
        body.querySelectorAll('[data-pick-sample]').forEach((b) => b.classList.remove('is-active'));
        if (f) {
          pendingPreviewUrl = URL.createObjectURL(f);
          fileNameEl.textContent = `已选：${f.name}`;
        } else {
          fileNameEl.textContent = '未选择本地文件';
        }
        updateUploadPreview();
      });

      body.querySelectorAll('[data-pick-sample]').forEach((btn) => {
        btn.addEventListener('click', () => {
          revokePreview();
          const key = btn.dataset.pickSample;
          selectedSampleKey = selectedSampleKey === key ? '' : key;
          pendingFile = null;
          if (fileInput) fileInput.value = '';
          fileNameEl.textContent = selectedSampleKey ? '已选离线示例图' : '未选择本地文件';
          body.querySelectorAll('[data-pick-sample]').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.pickSample === selectedSampleKey);
          });
          updateUploadPreview();
        });
      });

      updateNamePreview();
      updateUploadPreview();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.style.display = 'none';
        const fd = new FormData(form);
        const resolvedQtyUnit = qtyUnitEl?.value === '其他' ? (qtyCustomEl?.value || '').trim() || '件' : (qtyUnitEl?.value || quantityUnit);
        let newAssetId = null;

        try {
          if (pendingFile) {
            const asset = await store.addImageFileAsset(pendingFile);
            newAssetId = asset.id;
          } else if (selectedSampleKey) {
            const existingSample = store.state.mediaAssets.find((a) => a.kind === 'sample' && a.sampleKey === selectedSampleKey);
            if (existingSample) {
              newAssetId = existingSample.id;
            } else {
              const id = `asset-${Date.now().toString(36)}`;
              store.state.mediaAssets.push({
                id,
                kind: 'sample',
                sampleKey: selectedSampleKey,
                mimeType: 'image/svg+xml',
                createdAt: new Date().toISOString(),
              });
              newAssetId = id;
            }
          }

          const productPayload = {
            id: existing?.id,
            categoryId: fd.get('categoryId'),
            subCategoryId: fd.get('subCategoryId'),
            brandName: fd.get('brandName'),
            shade: fd.get('shade'),
            customName: fd.get('customName'),
            specificationValue: fd.get('specificationValue'),
            specificationUnit: fd.get('specificationUnit'),
            specificationCustomUnit: fd.get('specificationCustomUnit'),
            quantityUnit: resolvedQtyUnit,
            notesPrivate: fd.get('notesPrivate'),
            newAssetId,
            makeNewPhotoCover: !isEdit,
          };

          if (isEdit) {
            const res = store.saveProduct(productPayload);
            if (!res.ok) {
              showFormError(errBox, res.error, toast);
              return;
            }
            close();
            toast('产品信息已更新（历史妆容快照保持不变）');
            onSaved?.(res.product, { andAddItem: false });
            return;
          }

          syncDraftCount();
          const itemInputs = [];
          for (let i = 0; i < quantity; i++) {
            const src = detailsExpanded ? (batchMode === 'per_item' ? itemDrafts[i] : itemDrafts[0]) : createBlankItemDraft(defaultCur);
            itemInputs.push({
              ...src,
              currencyCode: src.currencyCode || defaultCur,
            });
          }

          const res = store.saveProductWithItems({
            productInput: productPayload,
            quantity,
            batchMode: detailsExpanded ? batchMode : 'same',
            itemInputs,
          });
          if (!res.ok) {
            showFormError(errBox, res.error, toast);
            return;
          }

          close();
          toast(`已保存「${res.product.name}」（${quantity} ${resolvedQtyUnit}）`);
          onSaved?.(res.product, { andAddItem: false });
        } catch (err) {
          if (!err?.stage) {
            recordDiagnostic('unexpected_save_error', err, {
              entityType: 'product',
              action: isEdit ? 'update' : 'create',
              hasFile: Boolean(pendingFile),
              fileSize: pendingFile?.size || 0,
            });
          }
          showFormError(errBox, err?.message || '保存产品失败，请在「我的」查看保存诊断日志', toast);
        }
      });
    },
  });
}

/* ---------------- 单件详情编辑弹窗 ---------------- */

export function openItemFormSheet({ store, sheet, dialog, toast, productId, itemId = null, onSaved }) {
  const existing = itemId ? store.state.productItems.find((i) => i.id === itemId) : null;
  const prod = store.state.products.find((p) => p.id === (existing?.productId || productId));
  if (!prod) return;

  const defaultCur = store.state.settings.homeSelectedCurrency || 'CNY';
  const initPrice =
    existing && existing.purchasePriceMinor !== null && existing.purchasePriceMinor !== undefined && isSupportedCurrency(existing.currencyCode)
      ? minorToDecimalString(existing.purchasePriceMinor, existing.currencyCode)
      : '';
  const acqInit = normalizeAcquisitionMethod(existing?.acquisitionMethod || existing?.purchaseChannel);
  const initCurrency = existing?.currencyCode || defaultCur;
  const showCurrency =
    Boolean(store.state.settings.enableForeignCurrency) ||
    Boolean(existing?.currencyCode && existing.currencyCode !== defaultCur);

  const draft = {
    status: !existing || existing.status === 'unrecorded' ? '' : existing.status,
    manufactureDate: existing?.manufactureDate || '',
    unopenedShelfMonths: existing?.unopenedShelfMonths ?? '',
    openedDate: existing?.openedDate || '',
    usedUpDate: existing?.usedUpDate || '',
    paoMonths: existing?.paoMonths ?? '',
    confirmedExpiryDate: existing?.confirmedExpiryDate || '',
    remainingPercent: existing?.remainingPercent ?? 100,
    purchasePriceInput: initPrice,
    currencyCode: initCurrency,
    acquisitionPreset: acqInit.acquisitionMethod?.preset || '',
    acquisitionCustomText: acqInit.acquisitionMethod?.customText || '',
  };

  sheet.open({
    title: `${existing ? '编辑详情' : '添加一件'} · ${prod.name}`,
    bodyHtml: `
      <form id="item-form" class="form-stack" novalidate>
        <div id="item-form-error" class="form-banner-error" style="display:none;"></div>
        ${renderItemDraftBlock(0, draft, { showTitle: false, showCurrency })}
        <button type="submit" class="btn btn-primary btn-block">${existing ? '保存这 1 件信息' : '保存并加入'}</button>
      </form>
    `,
    onMount: (body, close) => {
      const form = body.querySelector('#item-form');
      const errBox = body.querySelector('#item-form-error');
      const box = body.querySelector('[data-draft-idx="0"]');
      if (box) bindDraftExpiryHelpers(box, draft, toast);
      const statusSel = box?.querySelector('[data-df="status"]');
      const openedInp = box?.querySelector('[data-df="openedDate"]');
      const usedUpInp = box?.querySelector('[data-df="usedUpDate"]');
      const remInp = box?.querySelector('[data-df="remainingPercent"]');
      const confInp = box?.querySelector('[data-df="confirmedExpiryDate"]');

      body.querySelectorAll('[data-df]').forEach((inp) => {
        const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
        inp.addEventListener(ev, async () => {
          if (inp === statusSel) {
            const prevStatus = draft.status;
            const nextVal = inp.value;
            if (nextVal === 'unopened' && draft.openedDate) {
              const ok = dialog
                ? await dialog.confirm({
                    title: '确认恢复为未开封？',
                    message: draft.confirmedExpiryDate
                      ? `切换后将清空原开封日期与原确认到期日（${draft.confirmedExpiryDate}），并重新按照生产日期和未开封保质期计算到期日。`
                      : '切换后将清空原开封日期，并重新按照生产日期和未开封保质期计算到期日。',
                    confirmLabel: '确认恢复未开封',
                    cancelLabel: '取消',
                  })
                : true;
              if (!ok) {
                inp.value = prevStatus;
                inp.dispatchEvent(new Event('change'));
                return;
              }
              draft.openedDate = '';
              draft.confirmedExpiryDate = '';
              if (openedInp) openedInp.value = '';
              if (confInp) confInp.value = '';
            } else if (nextVal === 'in_use' && !draft.openedDate) {
              const t = todayStr();
              draft.openedDate = t;
              if (openedInp) openedInp.value = t;
            } else if (nextVal === 'used_up') {
              draft.remainingPercent = 0;
              if (remInp) remInp.value = '0';
              if (!draft.usedUpDate) {
                const t = todayStr();
                draft.usedUpDate = t;
                if (usedUpInp) usedUpInp.value = t;
              }
            }
            if (nextVal !== 'used_up') {
              draft.usedUpDate = '';
              if (usedUpInp) usedUpInp.value = '';
            }
            draft.status = nextVal;
            openedInp?.dispatchEvent(new Event('input'));
            usedUpInp?.dispatchEvent(new Event('input'));
            return;
          }
          draft[inp.dataset.df] = inp.value;
        });
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.style.display = 'none';
        const check = validateItemTransitionAndFields({
          previousItem: existing,
          nextInput: {
            ...draft,
            currencyCode: draft.currencyCode || defaultCur,
          },
        });
        if (!check.ok) {
          showFormError(errBox, check.error, toast);
          return;
        }

        if (existing?.status === 'used_up' && check.normalized.status === 'in_use' && dialog) {
          const ok = await dialog.confirm({
            title: '确认恢复使用？',
            message: '恢复后，该件产品将重新计入当前拥有数量。确认保持以上剩余比例并恢复使用？',
            confirmLabel: '确认恢复使用',
            cancelLabel: '取消',
          });
          if (!ok) return;
        }

        if (check.normalized.status === 'used_up' && existing?.status !== 'used_up' && dialog) {
          const ok = await dialog.confirm({
            title: '确认产品已用完？',
            message: `标记为已用完（用完日期：${check.normalized.usedUpDate}）后，该件产品将从当前拥有数量中移除，但历史记录和使用信息仍会保留。`,
            confirmLabel: '确认已用完',
            cancelLabel: '取消',
          });
          if (!ok) return;
        }

        const res = store.saveProductItem({
          ...existing,
          id: existing?.id,
          productId: prod.id,
          ...check.normalized,
          purchasePriceInput: draft.purchasePriceInput,
          currencyCode: draft.currencyCode || defaultCur,
          acquisitionPreset: draft.acquisitionPreset,
          acquisitionCustomText: draft.acquisitionCustomText,
        });
        if (!res.ok) {
          showFormError(errBox, res.error, toast);
          return;
        }
        close();
        toast(res.item.confirmedExpiryDate && res.item.status === 'unopened'
          ? '已更新信息；已保留您的确认到期日，请核实是否正确'
          : (existing ? '已更新这 1 件的详细信息' : '已添加这 1 件'));
        onSaved?.(res.item);
      });
    },
  });
}

/* ---------------- 快捷弹窗：标记已用完 / 今日开封 / 恢复使用 ---------------- */

function openMarkUsedUpSheet({ store, item, sheet, toast, viewState, actions }) {
  const defaultDate = item.usedUpDate || todayStr();
  const minUsedUpDate = [item.manufactureDate, item.openedDate].filter(Boolean).sort().pop() || '';
  sheet.open({
    title: '确认产品已用完？',
    bodyHtml: `
      <form id="box-usedup-form" class="form-stack" novalidate>
        <div id="box-uu-err" class="form-banner-error" style="display:none;"></div>
        <div class="form-banner-info">
          标记为已用完后，该件产品将从当前拥有数量中移除，但历史记录和使用信息仍会保留。用完日期默认为今天，您也可以修改。
        </div>
        <div class="field">
          <label>用完日期 <span class="req">*</span></label>
          <input class="input" type="date" name="usedUpDate" min="${esc(minUsedUpDate)}" value="${esc(defaultDate)}" required />
        </div>
        <div class="card-muted" style="padding:9px 11px;font-size:12px;color:var(--text-secondary);" data-uu-duration-box></div>
        <div class="field-row">
          <button type="button" class="btn btn-secondary" data-uu-cancel="1">取消</button>
          <button type="submit" class="btn btn-primary">确认已用完</button>
        </div>
      </form>
    `,
    onMount: (body, close) => {
      const f = body.querySelector('#box-usedup-form');
      const errBox = body.querySelector('#box-uu-err');
      const dateInp = f.querySelector('[name="usedUpDate"]');
      const durBox = f.querySelector('[data-uu-duration-box]');

      const refreshDuration = () => {
        const val = String(dateInp?.value || '').trim();
        if (!item.openedDate) {
          durBox.textContent = '开封日期未填（可在编辑详情补填以计算使用时长）';
          return;
        }
        const dur = formatUsageDuration(item.openedDate, val);
        if (dur.valid) {
          durBox.innerHTML = `<div class="row-between" style="gap:6px;white-space:nowrap;"><span>开封 <strong>${esc(item.openedDate)}</strong></span><span>用时 <strong>${esc(dur.text)}</strong></span></div>`;
        } else {
          durBox.innerHTML = `<span style="color:var(--danger);">${esc(dur.error || '请选择有效的用完日期')}</span>`;
        }
      };

      dateInp?.addEventListener('input', refreshDuration);
      dateInp?.addEventListener('change', refreshDuration);
      body.querySelector('[data-uu-cancel]')?.addEventListener('click', close);
      refreshDuration();

      f.addEventListener('submit', (e) => {
        e.preventDefault();
        errBox.style.display = 'none';
        const usedUpDate = String(dateInp?.value || '').trim();
        const check = validateItemTransitionAndFields({
          previousItem: item,
          nextInput: { ...item, status: 'used_up', remainingPercent: 0, usedUpDate },
        });
        if (!check.ok) {
          showFormError(errBox, check.error, toast);
          return;
        }
        const priceInput =
          item.purchasePriceMinor !== null && item.purchasePriceMinor !== undefined && isSupportedCurrency(item.currencyCode)
            ? minorToDecimalString(item.purchasePriceMinor, item.currencyCode)
            : '';
        const res = store.saveProductItem({
          ...item,
          purchasePriceInput: priceInput,
          status: 'used_up',
          remainingPercent: 0,
          usedUpDate: check.normalized.usedUpDate,
        });
        if (!res.ok) {
          showFormError(errBox, res.error, toast);
          return;
        }
        viewState.expandedItemIds?.delete(item.id);
        close();
        toast(`已标记为已用完（用完日期：${res.item.usedUpDate}）`);
        actions.rerender();
      });
    },
  });
}

function openConfirmOpenTodaySheet({ store, prod, item, sheet, toast, actions }) {
  const dualBefore = deriveDualComputedExpiry(item);
  const initOpened = todayStr();
  sheet.open({
    title: '确认今日开封？',
    bodyHtml: `
      <form id="box-open-today-form" class="form-stack" novalidate>
        <div id="box-ot-err" class="form-banner-error" style="display:none;"></div>
        <div class="form-banner-info">
          确认今日开封后，状态将从「未开封」改为「使用中」。请确认开封日期，并核对到期日期或开封后期限（PAO）是否需要重新编辑。
        </div>
        <div class="card-muted" style="font-size:12px;color:var(--text-secondary);">
          <div>产品：<strong>${esc(prod.name)}</strong></div>
          <div>原未开封推算：${esc(dualBefore.unopened.date || '未填写生产日期/未开封保质期')}</div>
          <div>原确认到期日：${esc(item.confirmedExpiryDate || '未手动确认')}</div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>开封日期 <span class="req">*</span></label>
            <input class="input" type="date" name="openedDate" min="${esc(item.manufactureDate || '')}" value="${esc(initOpened)}" required />
          </div>
          <div class="field">
            <label>开封后期限 PAO（月）</label>
            <input class="input" type="number" min="1" name="paoMonths" placeholder="例如 12" value="${esc(item.paoMonths ?? '')}" />
          </div>
        </div>
        <div class="form-banner-info" style="font-size:12px;" data-ot-preview></div>
        <div class="field">
          <label>确认到期日（如需重新编辑可直接修改）</label>
          <input class="input" type="date" name="confirmedExpiryDate" value="${esc(item.confirmedExpiryDate || '')}" />
          <div class="adopt-btn-row" style="margin-top:6px;">
            <button type="button" class="btn btn-soft btn-sm" data-ot-adopt-opened>采纳开封后推算</button>
            <button type="button" class="btn btn-secondary btn-sm" data-ot-clear-conf style="display:${item.confirmedExpiryDate ? '' : 'none'};">清空原确认（改按推算）</button>
          </div>
        </div>
        <div class="field-row">
          <button type="button" class="btn btn-secondary" data-ot-cancel="1">取消</button>
          <button type="submit" class="btn btn-primary">确认今日开封</button>
        </div>
      </form>
    `,
    onMount: (body, close) => {
      const f = body.querySelector('#box-open-today-form');
      const errBox = body.querySelector('#box-ot-err');
      const openedInp = f.querySelector('[name="openedDate"]');
      const paoInp = f.querySelector('[name="paoMonths"]');
      const confInp = f.querySelector('[name="confirmedExpiryDate"]');
      const previewEl = f.querySelector('[data-ot-preview]');
      const adoptBtn = f.querySelector('[data-ot-adopt-opened]');
      const clearBtn = f.querySelector('[data-ot-clear-conf]');

      const refresh = () => {
        const openedVal = String(openedInp?.value || '').trim();
        const paoRaw = String(paoInp?.value || '').trim();
        const openedBeforeMfg = Boolean(item.manufactureDate && openedVal && openedVal < item.manufactureDate);
        const dual = deriveDualComputedExpiry({
          ...item,
          openedDate: openedBeforeMfg ? null : (openedVal || null),
          paoMonths: /^\d+$/.test(paoRaw) ? Number.parseInt(paoRaw, 10) : null,
        });
        if (previewEl) {
          previewEl.textContent = openedBeforeMfg
            ? `开封日期（${openedVal}）不能早于生产日期（${item.manufactureDate}）。`
            : dual.opened.date
              ? `开封后推算到期：${dual.opened.date}（${dual.opened.formula}）`
              : '尚未填写开封后期限（PAO），如需重算到期日可补充 PAO 或直接修改上方确认到期日。';
        }
        if (adoptBtn) {
          adoptBtn.disabled = openedBeforeMfg || !dual.opened.date;
          adoptBtn.style.display = !openedBeforeMfg && dual.opened.date ? '' : 'none';
          adoptBtn.textContent = dual.opened.date ? `采纳开封后 (${dual.opened.date})` : '采纳开封后推算';
        }
        if (clearBtn) {
          clearBtn.style.display = String(confInp?.value || '').trim() ? '' : 'none';
        }
        return dual;
      };

      [openedInp, paoInp, confInp].forEach((el) => {
        el?.addEventListener('input', refresh);
        el?.addEventListener('change', refresh);
      });
      adoptBtn?.addEventListener('click', () => {
        const dual = refresh();
        if (dual.opened.date && confInp) {
          confInp.value = dual.opened.date;
          refresh();
        }
      });
      clearBtn?.addEventListener('click', () => {
        if (confInp) confInp.value = '';
        refresh();
      });
      body.querySelector('[data-ot-cancel]')?.addEventListener('click', close);
      refresh();

      f.addEventListener('submit', (e) => {
        e.preventDefault();
        errBox.style.display = 'none';
        const openedDate = String(openedInp?.value || '').trim();
        const paoMonths = String(paoInp?.value || '').trim();
        const confirmedExpiryDate = String(confInp?.value || '').trim();
        const check = validateItemTransitionAndFields({
          previousItem: item,
          nextInput: { ...item, status: 'in_use', openedDate, paoMonths, confirmedExpiryDate },
        });
        if (!check.ok) {
          showFormError(errBox, check.error, toast);
          return;
        }
        const priceInput =
          item.purchasePriceMinor !== null && item.purchasePriceMinor !== undefined && isSupportedCurrency(item.currencyCode)
            ? minorToDecimalString(item.purchasePriceMinor, item.currencyCode)
            : '';
        const res = store.saveProductItem({
          ...item,
          purchasePriceInput: priceInput,
          status: 'in_use',
          openedDate: check.normalized.openedDate,
          paoMonths: check.normalized.paoMonths,
          confirmedExpiryDate: check.normalized.confirmedExpiryDate,
          usedUpDate: null,
        });
        if (!res.ok) {
          showFormError(errBox, res.error, toast);
          return;
        }
        close();
        toast('已确认今日开封，状态已更新为「使用中」');
        actions.rerender();
      });
    },
  });
}

/* ---------------- 事件绑定 ---------------- */

export function bindBoxEvents(container, { store, viewState, actions, sheet, dialog, toast }) {
  const catScroll = container.querySelector('#box-cat-scroll');
  const statusScroll = container.querySelector('#box-status-scroll');
  if (catScroll) {
    catScroll.scrollLeft = viewState.catScrollLeft || 0;
    catScroll.addEventListener('scroll', () => { viewState.catScrollLeft = catScroll.scrollLeft; }, { passive: true });
  }
  if (statusScroll) {
    statusScroll.scrollLeft = viewState.statusScrollLeft || 0;
    statusScroll.addEventListener('scroll', () => { viewState.statusScrollLeft = statusScroll.scrollLeft; }, { passive: true });
  }

  container.querySelector('#box-search-input')?.addEventListener('input', (e) => {
    viewState.search = e.target.value;
    actions.rerender({ preserveFocusId: 'box-search-input' });
  });

  container.querySelectorAll('[data-box-cat]').forEach((el) => {
    el.addEventListener('click', () => {
      if (catScroll) viewState.catScrollLeft = catScroll.scrollLeft;
      if (statusScroll) viewState.statusScrollLeft = statusScroll.scrollLeft;
      viewState.categoryId = el.dataset.boxCat;
      actions.rerender();
    });
  });

  container.querySelectorAll('[data-box-status]').forEach((el) => {
    el.addEventListener('click', () => {
      if (catScroll) viewState.catScrollLeft = catScroll.scrollLeft;
      if (statusScroll) viewState.statusScrollLeft = statusScroll.scrollLeft;
      viewState.statusFilter = el.dataset.boxStatus;
      if (viewState.statusFilter === 'pending') viewState.pendingSubFilter = 'all';
      actions.rerender();
    });
  });

  container.querySelectorAll('[data-box-pending-sub]').forEach((el) => {
    el.addEventListener('click', () => {
      if (catScroll) viewState.catScrollLeft = catScroll.scrollLeft;
      if (statusScroll) viewState.statusScrollLeft = statusScroll.scrollLeft;
      viewState.pendingSubFilter = el.dataset.boxPendingSub || 'all';
      actions.rerender();
    });
  });

  container.querySelector('#box-sort-select')?.addEventListener('change', (e) => {
    viewState.sortBy = e.target.value;
    actions.rerender();
  });

  container.querySelector('[data-box-toggle-view]')?.addEventListener('click', () => {
    viewState.viewMode = (viewState.viewMode || 'list') === 'list' ? 'grid' : 'list';
    actions.rerender();
  });

  container.querySelector('[data-box-clear-filters]')?.addEventListener('click', () => {
    viewState.search = '';
    viewState.categoryId = 'all';
    viewState.statusFilter = 'all';
    actions.rerender();
  });

  container.querySelectorAll('[data-box-open-product]').forEach((el) => {
    el.addEventListener('click', () => {
      viewState.selectedProductId = el.dataset.boxOpenProduct;
      viewState.detailFilter = el.dataset.boxOpenFilter || normalizeStatusFilterKey(viewState.statusFilter || 'all');
      viewState.showUsedUpHistory = viewState.detailFilter === 'used_up';
      actions.rerender();
    });
  });

  container.querySelector('[data-box-back]')?.addEventListener('click', () => {
    viewState.selectedProductId = null;
    actions.rerender();
  });

  container.querySelectorAll('[data-box-add-product]').forEach((el) => {
    el.addEventListener('click', () => actions.openNewProduct());
  });

  container.querySelector('[data-box-edit-product]')?.addEventListener('click', (e) => {
    openProductFormSheet({
      store,
      sheet,
      toast,
      productId: e.currentTarget.dataset.boxEditProduct,
      onSaved: () => actions.rerender(),
    });
  });

  const addOneItem = () => {
    const pid = viewState.selectedProductId;
    if (!pid) return;
    const defaultCur = store.state.settings.homeSelectedCurrency || 'CNY';
    const res = store.saveProductItem({
      productId: pid,
      status: 'unrecorded',
      currencyCode: defaultCur,
      remainingPercent: 100,
    });
    if (!res.ok) {
      toast(res.error);
      return;
    }
    const expandedSet = viewState.expandedItemIds instanceof Set ? viewState.expandedItemIds : (viewState.expandedItemIds = new Set());
    expandedSet.add(res.item.id);
    if (viewState.detailFilter !== 'all' && viewState.detailFilter !== 'pending_status' && viewState.detailFilter !== 'pending') {
      viewState.detailFilter = 'all';
    }
    toast('已增加 1 件（默认为未记录，可随时补充详情）');
    actions.rerender();
  };

  container.querySelector('#box-qty-inc')?.addEventListener('click', addOneItem);
  container.querySelector('[data-box-detail-add-one]')?.addEventListener('click', addOneItem);
  container.querySelectorAll('[data-box-detail-show-all]').forEach((btn) => {
    btn.addEventListener('click', () => {
      viewState.detailFilter = 'all';
      viewState.showUsedUpHistory = false;
      actions.rerender();
    });
  });

  container.querySelector('#box-qty-dec')?.addEventListener('click', () => {
    const pid = viewState.selectedProductId;
    const prod = store.state.products.find((p) => p.id === pid);
    if (!prod) return;
    const sum = summarizeProductCounts(prod, store.state.productItems);
    const target = sum.heldItems[sum.heldItems.length - 1];
    if (!target) return;
    const unit = prod.quantityUnit || '件';
    sheet.open({
      title: `减少 1 ${unit}`,
      bodyHtml: `
        <div class="stack">
          <div class="muted-note">请选择减少这 1 ${esc(unit)}的原因，系统会按不同方式保留您的历史记录：</div>
          <button type="button" class="btn btn-primary btn-block" id="box-dec-usedup">标记为已用完（退出当前拥有，保留历史）</button>
          <button type="button" class="btn btn-danger btn-block" id="box-dec-remove">移除这一件（误录或不再保留）</button>
        </div>
      `,
      onMount: (body, close) => {
        body.querySelector('#box-dec-usedup')?.addEventListener('click', () => {
          close();
          openMarkUsedUpSheet({ store, item: target, sheet, toast, viewState, actions });
        });
        body.querySelector('#box-dec-remove')?.addEventListener('click', () => {
          store.softDeleteProductItem(target.id);
          close();
          toast('已移除这 1 件（不影响其他件和历史妆容）');
          actions.rerender();
        });
      },
    });
  });

  container.querySelectorAll('[data-box-expand-item]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const expandedSet = viewState.expandedItemIds instanceof Set ? viewState.expandedItemIds : (viewState.expandedItemIds = new Set());
      const id = btn.dataset.boxExpandItem;
      if (expandedSet.has(id)) expandedSet.delete(id);
      else expandedSet.add(id);
      actions.rerender();
    });
  });

  container.querySelectorAll('[data-box-status-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const [id, nextStatus] = btn.dataset.boxStatusAction.split(':');
      const it = store.state.productItems.find((x) => x.id === id);
      const prod = it ? store.state.products.find((p) => p.id === it.productId) : null;
      if (!it || !prod) return;
      const evalRes = evaluateQuickStatusOption(it, nextStatus);
      if (evalRes.isCurrent) return;
      if (!evalRes.allowed) {
        toast(evalRes.reason || '当前产品状态不支持此操作。');
        return;
      }

      const priceInput =
        it.purchasePriceMinor !== null && it.purchasePriceMinor !== undefined && isSupportedCurrency(it.currencyCode)
          ? minorToDecimalString(it.purchasePriceMinor, it.currencyCode)
          : '';

      if (evalRes.requiresConfirm === 'mark_used_up') {
        openMarkUsedUpSheet({ store, item: it, sheet, toast, viewState, actions });
        return;
      }

      if (evalRes.requiresConfirm === 'open_today') {
        openConfirmOpenTodaySheet({ store, prod, item: it, sheet, toast, actions });
        return;
      }

      if (evalRes.requiresConfirm === 'restore_unopened') {
        const hasConf = Boolean(it.confirmedExpiryDate);
        const ok = await dialog.confirm({
          title: '确认恢复为未开封？',
          message: hasConf
            ? `切换后将清空原开封日期与原确认到期日（${it.confirmedExpiryDate}），并重新按照生产日期和未开封保质期计算到期日。`
            : '切换后将清空原开封日期，并重新按照生产日期和未开封保质期计算到期日。',
          confirmLabel: '确认恢复未开封',
          cancelLabel: '取消',
        });
        if (!ok) return;
        store.saveProductItem({
          ...it,
          purchasePriceInput: priceInput,
          status: 'unopened',
          openedDate: null,
          confirmedExpiryDate: null,
          usedUpDate: null,
        });
        toast('已恢复为未开封，已清空原开封日期并重新计算');
        actions.rerender();
        return;
      }

      if (evalRes.requiresConfirm === 'restore_in_use') {
        sheet.open({
          title: '确认恢复使用？',
          bodyHtml: `
            <form id="box-restore-use-form" class="form-stack" novalidate>
              <div id="box-ru-err" class="form-banner-error" style="display:none;"></div>
              <div class="form-banner-info">
                恢复后，该件产品将重新计入当前拥有数量。请确认产品仍有剩余，并补充当前剩余比例。
              </div>
              <div class="field-row">
                <div class="field">
                  <label>当前剩余比例（1–100%）<span class="req">*</span></label>
                  <input class="input" type="number" min="1" max="100" name="remainingPercent" value="${it.remainingPercent > 0 ? it.remainingPercent : 50}" required />
                </div>
                <div class="field">
                  <label>开封日期 <span class="req">*</span></label>
                  <input class="input" type="date" name="openedDate" min="${esc(it.manufactureDate || '')}" value="${esc(it.openedDate || todayStr())}" required />
                </div>
              </div>
              <div class="field-row">
                <button type="button" class="btn btn-secondary" data-ru-cancel="1">取消</button>
                <button type="submit" class="btn btn-primary">确认恢复使用</button>
              </div>
            </form>
          `,
          onMount: (body, close) => {
            const f = body.querySelector('#box-restore-use-form');
            const errBox = body.querySelector('#box-ru-err');
            body.querySelector('[data-ru-cancel]')?.addEventListener('click', close);
            f.addEventListener('submit', (e) => {
              e.preventDefault();
              errBox.style.display = 'none';
              const fd = new FormData(f);
              const check = validateItemTransitionAndFields({
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
              store.saveProductItem({
                ...it,
                purchasePriceInput: priceInput,
                status: 'in_use',
                remainingPercent: check.normalized.remainingPercent,
                openedDate: check.normalized.openedDate,
                usedUpDate: null,
              });
              viewState.expandedItemIds?.add(it.id);
              close();
              toast('已恢复为使用中，已重新计入当前拥有数量');
              actions.rerender();
            });
          },
        });
        return;
      }

      const nextOpened = nextStatus === 'in_use' ? (it.openedDate || todayStr()) : null;
      const check = validateItemTransitionAndFields({
        previousItem: it,
        nextInput: { ...it, status: nextStatus, openedDate: nextOpened },
      });
      if (!check.ok) {
        toast(check.error);
        return;
      }
      store.saveProductItem({
        ...it,
        purchasePriceInput: priceInput,
        status: check.normalized.status,
        openedDate: check.normalized.openedDate,
        usedUpDate: check.normalized.usedUpDate,
      });
      toast(nextStatus === 'in_use' ? '已设为「使用中」并记录有效开封日期' : `已切换为「${ITEM_STATUSES[nextStatus]?.label || nextStatus}」`);
      actions.rerender();
    });
  });

  container.querySelectorAll('[data-box-open-today]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const it = store.state.productItems.find((x) => x.id === btn.dataset.boxOpenToday);
      const prod = it ? store.state.products.find((p) => p.id === it.productId) : null;
      if (it && prod) openConfirmOpenTodaySheet({ store, prod, item: it, sheet, toast, actions });
    });
  });

  container.querySelectorAll('[data-box-remove-item]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await dialog.confirm({
        title: '移除这一件',
        message: '仅移除当前选中的这一件，不会删除同款其他件，也不会破坏关联的历史妆容快照。确认移除？',
        confirmLabel: '移除这一件',
        danger: true,
      });
      if (!ok) return;
      const res = store.softDeleteProductItem(btn.dataset.boxRemoveItem);
      if (!res.ok) {
        toast(res.error);
        return;
      }
      toast('已移除这 1 件（历史妆容快照保持不变）');
      actions.rerender();
    });
  });

  container.querySelector('#box-toggle-usedup')?.addEventListener('click', () => {
    viewState.showUsedUpHistory = !viewState.showUsedUpHistory;
    actions.rerender();
  });

  container.querySelector('#detail-upload-photo')?.addEventListener('change', async (e) => {
    const inputEl = e.target;
    const file = inputEl.files?.[0];
    if (!file || !viewState.selectedProductId) return;
    try {
      const asset = await store.addImageFileAsset(file);
      const res = store.runPersistMutation('product_photo', () => {
        store.addProductPhoto(viewState.selectedProductId, asset.id);
        return { ok: true };
      });
      if (!res.ok) {
        toast(res.error);
        return;
      }
      toast('照片已保存至 IndexedDB，页面刷新仍可展示');
      actions.rerender();
    } catch (err) {
      if (!err?.stage) {
        recordDiagnostic('unexpected_save_error', err, {
          entityType: 'product_photo',
          hasFile: true,
          fileSize: file?.size || 0,
        });
      }
      toast(err?.message || '图片保存失败，请在「我的」查看保存诊断日志');
    } finally {
      inputEl.value = '';
    }
  });

  container.querySelectorAll('[data-set-cover]').forEach((el) => {
    el.addEventListener('click', () => {
      store.setProductCover(viewState.selectedProductId, el.dataset.setCover);
      toast('已设为主封面');
      actions.rerender();
    });
  });

  container.querySelector('[data-clear-cover]')?.addEventListener('click', () => {
    store.clearProductCover(viewState.selectedProductId);
    toast('已取消封面标记');
    actions.rerender();
  });

  container.querySelectorAll('[data-del-photo]').forEach((el) => {
    el.addEventListener('click', async () => {
      const ok = await dialog.confirm({
        title: '移除照片',
        message: '移除后若无其他记录引用该图片，将同步清理 IndexedDB 中的图片数据。确认移除？',
        confirmLabel: '移除',
        danger: true,
      });
      if (!ok) return;
      await store.removeProductPhoto(viewState.selectedProductId, el.dataset.delPhoto);
      toast('照片已移除');
      actions.rerender();
    });
  });

  container.querySelectorAll('[data-box-trash-product]').forEach((el) => {
    el.addEventListener('click', async () => {
      const prodId = el.dataset.boxTrashProduct;
      const prod = store.state.products.find((p) => p.id === prodId);
      if (!prod) return;
      const ok = await dialog.confirm({
        title: '从我的美妆中移除',
        message: `确定移除「${prod.name}」吗？移除后将进入「我的 → 最近删除」保留 7 天（7 天内可完整恢复，绝不覆盖后来新建的同款产品），历史妆容快照完整保留。`,
        confirmLabel: '移入最近删除',
        danger: true,
      });
      if (!ok) return;
      const res = store.softDeleteProductToTrash(prodId);
      if (!res.ok) {
        toast(res.error || '移除失败');
        return;
      }
      viewState.selectedProductId = null;
      toast('已移入「我的 → 最近删除」（保留 7 天）');
      actions.rerender();
    });
  });

  container.querySelectorAll('[data-item-expiry-help]').forEach((el) => {
    el.addEventListener('click', () => {
      const item = store.state.productItems.find((i) => i.id === el.dataset.itemExpiryHelp);
      if (!item) return;
      const dual = deriveDualComputedExpiry(item);
      sheet.open({
        title: '有效期计算详情',
        bodyHtml: `
          <div class="stack">
            <div class="card">
              <div class="stack-sm" style="font-size:13px;">
                <div><span class="muted-note">购买日期：</span>${esc(item.purchaseDate || '未填')}</div>
                <div><span class="muted-note">生产日期：</span>${esc(item.manufactureDate || '未填')} ｜ <span class="muted-note">未开封保质期：</span>${item.unopenedShelfMonths ? `${item.unopenedShelfMonths} 个月` : '未填'}</div>
                <div><span class="muted-note">开封日期：</span>${esc(item.openedDate || '未填')} ｜ <span class="muted-note">开封后期限：</span>${item.paoMonths ? `${item.paoMonths} 个月` : '未填'}</div>
              </div>
            </div>
            <div class="card">
              <div class="stack-sm" style="font-size:13px;">
                <div>• 未开封推算：${dual.unopened.date ? `<strong>${esc(dual.unopened.date)}</strong>（${esc(dual.unopened.formula)}）` : esc(dual.unopened.missingHint || '未填写生产日期或未开封保质期')}</div>
                <div>• 开封后推算：${dual.opened.date ? `<strong>${esc(dual.opened.date)}</strong>（${esc(dual.opened.formula)}）` : esc(dual.opened.missingHint || '未填写开封日期或 PAO')}</div>
                <div>• 确认到期日：<strong>${item.confirmedExpiryDate ? esc(item.confirmedExpiryDate) : '未手动确认'}</strong></div>
              </div>
            </div>
            <div class="form-banner-info">未开封与开封后分别独立推算、互不覆盖，也不会自动取较早日期。</div>
          </div>
        `,
      });
    });
  });

  container.querySelectorAll('[data-item-edit]').forEach((el) => {
    el.addEventListener('click', () => {
      openItemFormSheet({
        store,
        sheet,
        dialog,
        toast,
        productId: viewState.selectedProductId,
        itemId: el.dataset.itemEdit,
        onSaved: () => actions.rerender(),
      });
    });
  });

  container.querySelectorAll('[data-item-usage]').forEach((el) => {
    el.addEventListener('click', () => {
      const res = store.saveUsageLog({
        productItemId: el.dataset.itemUsage,
        usedDate: todayStr(),
        scene: '日常上妆',
        feeling: '快速记录使用一次',
      });
      if (res.ok) {
        toast('已记录今日使用一次');
        actions.rerender();
      }
    });
  });

  container.querySelectorAll('[data-box-open-look]').forEach((el) => {
    el.addEventListener('click', () => {
      actions.goTab('looks', { selectedLookId: el.dataset.boxOpenLook });
    });
  });
}
