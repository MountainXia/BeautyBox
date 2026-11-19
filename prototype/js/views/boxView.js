/**
 * 妆匣 BeautyBox · 浏览器交互原型（TASK 02）
 * Tab 2：妆匣（产品主档与持有实例分离管理、多图与唯一封面、搜索筛选、币种精度校验、有效期不猜测）
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
  EXPIRY_BASIS_LABELS,
  computeExpiryCandidates,
  expiryStatus,
  missingExpiryInputs,
  resolveExpiry,
  todayStr,
} from '../expiry.js';
import { getSampleArtworkOptions } from '../assets.js';
import { ITEM_STATUSES, isHeldStatus } from '../store.js';
import {
  esc,
  getProductDisplayImageUrl,
  renderEmptyState,
  renderSamplePickerGrid,
} from '../components/ui.js';

function statusPillClass(key) {
  if (key === 'expired') return 'pill-danger';
  if (key === 'near' || key === 'needs_confirm') return 'pill-amber';
  if (key === 'ok') return 'pill-sage';
  return '';
}

function summarizeProductStatus(store, productId, today) {
  const items = store.getItemsForProduct(productId, { includeArchived: true });
  const held = items.filter((i) => !i.archivedAt && isHeldStatus(i.status));
  const nearDays = store.state.settings.nearExpiryDays;
  let worst = null;
  for (const item of held) {
    const st = expiryStatus(resolveExpiry(item), today, nearDays);
    if (st.key === 'expired') {
      worst = st;
      break;
    }
    if (st.key === 'near' && (!worst || worst.key !== 'near')) worst = st;
    if (st.key === 'needs_confirm' && !worst) worst = st;
  }
  return { totalCount: items.length, heldCount: held.length, worstExpiry: worst, items };
}

export function renderBoxView({ store, viewState, ctx }) {
  const today = todayStr();

  if (viewState.selectedProductId) {
    const prod = store.state.products.find((p) => p.id === viewState.selectedProductId);
    if (prod) {
      return renderProductDetail({ store, prod, today, ctx });
    }
    viewState.selectedProductId = null;
  }

  ctx.setHeader({
    title: '妆匣',
    subtitle: `${store.state.products.filter((p) => !p.archivedAt).length} 款档案 · ${store.state.productItems.filter((i) => !i.archivedAt && isHeldStatus(i.status)).length} 件持有`,
    actionsHtml: `<button type="button" class="btn btn-primary btn-sm" data-box-add-product="1">+ 产品</button>`,
  });

  const q = (viewState.search || '').trim().toLowerCase();
  const catFilter = viewState.categoryId || 'all';
  const stFilter = viewState.statusFilter || 'all';
  const sortBy = viewState.sortBy || 'updated';
  const viewMode = viewState.viewMode || 'grid';
  const nearDays = store.state.settings.nearExpiryDays;

  const filtered = store.state.products.filter((p) => {
    if (stFilter === 'archived') {
      if (!p.archivedAt) return false;
    } else if (p.archivedAt) {
      return false;
    }

    if (catFilter !== 'all' && p.categoryId !== catFilter) return false;

    const items = store.getItemsForProduct(p.id, { includeArchived: true });
    if (stFilter === 'held') {
      if (!items.some((i) => !i.archivedAt && isHeldStatus(i.status))) return false;
    } else if (stFilter === 'used_up') {
      if (!items.some((i) => i.status === 'used_up')) return false;
    } else if (stFilter === 'near') {
      if (!items.some((i) => !i.archivedAt && isHeldStatus(i.status) && expiryStatus(resolveExpiry(i), today, nearDays).key === 'near')) {
        return false;
      }
    } else if (stFilter === 'expired') {
      if (!items.some((i) => !i.archivedAt && isHeldStatus(i.status) && expiryStatus(resolveExpiry(i), today, nearDays).key === 'expired')) {
        return false;
      }
    }

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
  });

  filtered.sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name, 'zh-CN');
    if (sortBy === 'expiry_asc') {
      const earliest = (pid) => {
        const dates = store
          .getItemsForProduct(pid, { includeArchived: false })
          .map((i) => resolveExpiry(i).date)
          .filter(Boolean)
          .sort();
        return dates[0] || '9999-99-99';
      };
      return earliest(a.id).localeCompare(earliest(b.id));
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  const statusChips = [
    { id: 'all', label: '在匣全部' },
    { id: 'held', label: '仍在持有' },
    ...(nearDays ? [{ id: 'near', label: `${nearDays}天临期` }] : []),
    { id: 'expired', label: '已过期' },
    { id: 'used_up', label: '含空瓶' },
    { id: 'archived', label: '已归档' },
  ];

  const hasAnyProducts = store.state.products.length > 0;

  return `
    <div class="stack">
      <!-- 搜索栏 + 视图切换 -->
      <div class="row-between">
        <div class="search-bar" style="flex:1;">
          <span style="color:var(--text-tertiary);">⌕</span>
          <input id="box-search-input" type="search" placeholder="搜索产品名、品牌、色号、备注" value="${esc(viewState.search || '')}" />
        </div>
        <button type="button" class="icon-btn" data-box-toggle-view="1" title="切换网格或列表">
          ${viewMode === 'grid' ? '列表' : '网格'}
        </button>
      </div>

      <!-- 分类 Chips -->
      <div class="chips-scroll" aria-label="分类筛选">
        <button type="button" class="chip ${catFilter === 'all' ? 'is-active' : ''}" data-box-cat="all">全部分类</button>
        ${store.state.categories
          .map(
            (c) => `<button type="button" class="chip ${catFilter === c.id ? 'is-active' : ''}" data-box-cat="${esc(c.id)}">${esc(c.name)}</button>`,
          )
          .join('')}
      </div>

      <!-- 状态筛选与排序 -->
      <div class="row-between" style="gap:8px;">
        <div class="chips-scroll" style="flex:1;">
          ${statusChips
            .map(
              (s) => `<button type="button" class="chip ${stFilter === s.id ? 'is-active' : ''}" data-box-status="${esc(s.id)}">${esc(s.label)}</button>`,
            )
            .join('')}
        </div>
        <select id="box-sort-select" class="select" style="width:auto;min-height:34px;padding:4px 10px;font-size:13px;">
          <option value="updated" ${sortBy === 'updated' ? 'selected' : ''}>最近更新</option>
          <option value="expiry_asc" ${sortBy === 'expiry_asc' ? 'selected' : ''}>到期日由近到远</option>
          <option value="name" ${sortBy === 'name' ? 'selected' : ''}>按名称</option>
        </select>
      </div>

      <!-- 产品集合 / 空状态 -->
      ${!hasAnyProducts
        ? renderEmptyState({
            icon: '✧',
            title: '妆匣暂无产品',
            desc: '先创建一个产品主档案，再添加你实际拥有的每瓶购买与开封实例。',
            actionLabel: '+ 新增第一件产品',
            actionAttr: 'data-box-add-product="1"',
          })
        : filtered.length === 0
          ? renderEmptyState({
              icon: '⌕',
              title: '没有找到匹配的产品',
              desc: '可以尝试更换搜索关键词，或清除当前的分类与状态筛选条件。',
              actionLabel: '清除筛选条件',
              actionAttr: 'data-box-clear-filters="1"',
            })
          : viewMode === 'grid'
            ? `
              <div class="product-grid">
                ${filtered.map((p) => renderProductCard(store, p, today)).join('')}
              </div>
            `
            : `
              <div class="product-list">
                ${filtered.map((p) => renderProductListRow(store, p, today)).join('')}
              </div>
            `}
    </div>
  `;
}

function renderProductCard(store, p, today) {
  const img = getProductDisplayImageUrl(store, p.id);
  const brand = store.getBrandName(p.brandId);
  const sum = summarizeProductStatus(store, p.id, today);
  return `
    <button type="button" class="product-card" data-box-open-product="${esc(p.id)}">
      <img class="product-card-img" src="${img.url}" alt="${esc(p.name)}" />
      <div class="product-card-body">
        <div class="product-brand">${esc(brand || store.getCategoryName(p.categoryId))}</div>
        <div class="product-name">${esc(p.name)}</div>
        ${p.shade ? `<div class="product-meta">${esc(p.shade)}</div>` : ''}
        <div class="row-wrap" style="margin-top:auto;padding-top:4px;">
          <span class="pill ${sum.heldCount > 0 ? 'pill-accent' : ''}">持有 ${sum.heldCount}/${sum.totalCount} 件</span>
          ${sum.worstExpiry
            ? `<span class="pill ${statusPillClass(sum.worstExpiry.key)}">${esc(sum.worstExpiry.short)}</span>`
            : ''}
          ${p.archivedAt ? `<span class="pill">已归档</span>` : ''}
        </div>
      </div>
    </button>
  `;
}

function renderProductListRow(store, p, today) {
  const img = getProductDisplayImageUrl(store, p.id);
  const brand = store.getBrandName(p.brandId);
  const sum = summarizeProductStatus(store, p.id, today);
  return `
    <button type="button" class="product-list-row" data-box-open-product="${esc(p.id)}">
      <img class="product-list-thumb" src="${img.url}" alt="${esc(p.name)}" />
      <div style="flex:1;min-width:0;">
        <div class="product-brand">${esc(brand || store.getCategoryName(p.categoryId))}</div>
        <div style="font-weight:600;font-size:15px;">${esc(p.name)}</div>
        <div class="muted-note">${esc([store.getCategoryName(p.categoryId), p.shade, p.specification].filter(Boolean).join(' · '))}</div>
        <div class="row-wrap" style="margin-top:6px;">
          <span class="pill pill-accent">持有 ${sum.heldCount} 件（共 ${sum.totalCount} 条记录）</span>
          ${sum.worstExpiry ? `<span class="pill ${statusPillClass(sum.worstExpiry.key)}">${esc(sum.worstExpiry.label)}</span>` : ''}
        </div>
      </div>
    </button>
  `;
}

function renderProductDetail({ store, prod, today, ctx }) {
  const brand = store.getBrandName(prod.brandId);
  const cat = store.getCategoryName(prod.categoryId);
  const photos = store.getProductPhotos(prod.id);
  const coverPreview = getProductDisplayImageUrl(store, prod.id);
  const items = store.getItemsForProduct(prod.id, { includeArchived: true });
  const nearDays = store.state.settings.nearExpiryDays;

  // 关联该产品实例的历史妆容
  const itemIds = new Set(items.map((i) => i.id));
  const relatedLookIds = new Set(
    store.state.lookProductItems.filter((lpi) => lpi.productItemId && itemIds.has(lpi.productItemId)).map((lpi) => lpi.lookId),
  );
  const relatedLooks = store.state.looks.filter((l) => relatedLookIds.has(l.id));

  ctx.setHeader({
    title: prod.name,
    subtitle: [brand, cat, prod.shade].filter(Boolean).join(' · '),
    backBtnAttr: 'data-box-back="1"',
    actionsHtml: `<button type="button" class="btn btn-secondary btn-sm" data-box-edit-product="${esc(prod.id)}">编辑</button>`,
  });

  return `
    <div class="stack">
      <!-- 封面与多图管理（productPhotos.isCover 为唯一真相源） -->
      <div class="card">
        <div class="row-between" style="margin-bottom:10px;">
          <div>
            <h2 class="section-title">产品照片（多图与封面唯一真相源）</h2>
            <div class="muted-note">
              ${photos.length === 0
                ? '当前无照片，列表展示品类默认占位图。'
                : coverPreview.isFallback
                  ? '当前未指定封面（isCover），已按顺序兜底显示第一张照片。'
                  : '同一产品最多 1 张封面图（productPhotos.isCover）。'}
            </div>
          </div>
          <label class="btn btn-soft btn-sm" style="cursor:pointer;">
            + 上传照片
            <input type="file" accept="image/*" id="detail-upload-photo" style="display:none;" />
          </label>
        </div>

        ${photos.length === 0
          ? `
            <div class="row-wrap" style="align-items:center;">
              <img src="${coverPreview.url}" alt="占位封面" style="width:96px;height:96px;border-radius:14px;" />
              <div style="flex:1;min-width:160px;">
                <div style="font-size:13px;font-weight:600;">无封面图占位模式</div>
                <div class="muted-note">可点击右上角“上传照片”选择本机图片（将保存 Blob 至浏览器 IndexedDB，刷新仍保留）。</div>
              </div>
            </div>
          `
          : `
            <div class="gallery-strip">
              ${photos
                .map((ph) => {
                  const url = store.getAssetUrl(ph.assetId) || coverPreview.url;
                  return `
                    <div class="gallery-item">
                      <img src="${url}" alt="产品图" />
                      <div class="row-between" style="gap:4px;">
                        ${ph.isCover
                          ? `<span class="pill pill-accent">封面</span>`
                          : `<button type="button" class="ghost-mini-btn" data-set-cover="${esc(ph.id)}">设为封面</button>`}
                        <button type="button" class="ghost-mini-btn" data-del-photo="${esc(ph.id)}" style="color:var(--danger);">删</button>
                      </div>
                      ${ph.isCover
                        ? `<button type="button" class="ghost-mini-btn" data-clear-cover="1" style="width:100%;">取消封面(测兜底)</button>`
                        : ''}
                    </div>
                  `;
                })
                .join('')}
            </div>
          `}
      </div>

      <!-- 主档属性 -->
      <div class="card">
        <div class="row-between" style="margin-bottom:8px;">
          <h2 class="section-title">产品主档案（Product）</h2>
          ${prod.archivedAt ? `<span class="pill pill-amber">已归档</span>` : `<span class="pill pill-sage">正常</span>`}
        </div>
        <div class="stack-sm" style="font-size:13px;">
          <div><span class="muted-note">品牌 / 分类：</span>${esc(brand || '未填品牌')} · ${esc(cat)}</div>
          <div><span class="muted-note">色号 / 规格：</span>${esc(prod.shade || '无')} · ${esc(prod.specification || '未填')}</div>
          <div><span class="muted-note">质地 / 妆效：</span>${esc(prod.texture || '未填')} · ${esc(prod.finish || '未填')}</div>
          ${prod.notesPrivate ? `<div class="card-muted" style="margin-top:4px;"><span class="muted-note">私人备注（默认不分享）：</span>${esc(prod.notesPrivate)}</div>` : ''}
        </div>
        <div class="row-wrap" style="margin-top:12px;">
          <button type="button" class="btn btn-primary btn-sm" data-box-add-item="${esc(prod.id)}">+ 添加持有实例</button>
          <button type="button" class="btn btn-secondary btn-sm" data-box-toggle-archive="${esc(prod.id)}">
            ${prod.archivedAt ? '取消归档' : '归档产品'}
          </button>
        </div>
      </div>

      <!-- 持有实例清单（ProductItem） -->
      <div class="stack-sm">
        <div class="section-header" style="margin-bottom:0;">
          <h2 class="section-title">实际持有实例（ProductItem · 共 ${items.length} 件）</h2>
          <span class="section-hint">批次/开封/金额相互独立</span>
        </div>

        ${items.length === 0
          ? renderEmptyState({
              icon: '🧴',
              title: '尚未添加持有实例',
              desc: '只有主档案没有实例时，不计入“当前持有件数”与“消费统计”。点击上方按钮添加一瓶试试。',
              actionLabel: '+ 添加一件持有实例',
              actionAttr: `data-box-add-item="${esc(prod.id)}"`,
            })
          : items.map((item) => renderItemCard(item, today, nearDays)).join('')}
      </div>

      <!-- 关联历史妆容 -->
      <div class="card">
        <div class="section-header">
          <h2 class="section-title">关联妆容记录（${relatedLooks.length}）</h2>
          <span class="section-hint">快照受保护</span>
        </div>
        ${relatedLooks.length === 0
          ? `<div class="muted-note">该产品下的持有实例暂未关联任何妆容。</div>`
          : `
            <div class="stack-sm">
              ${relatedLooks
                .map(
                  (l) => `
                <button type="button" class="list-item-btn" data-box-open-look="${esc(l.id)}">
                  <div>
                    <div style="font-weight:600;font-size:14px;">${esc(l.name)}</div>
                    <div class="muted-note">${esc(l.lookDate)} · ${esc(l.scene || l.style || '妆容记录')}</div>
                  </div>
                  <span class="pill">查看妆容 →</span>
                </button>
              `,
                )
                .join('')}
            </div>
          `}
      </div>
    </div>
  `;
}

function renderItemCard(item, today, nearDays) {
  const statusObj = ITEM_STATUSES[item.status] || { label: item.status, held: false };
  const resolved = resolveExpiry(item);
  const expSt = expiryStatus(resolved, today, nearDays);
  const candidates = computeExpiryCandidates(item);
  const missingHints = missingExpiryInputs(item);

  return `
    <div class="card">
      <div class="row-between">
        <div class="row-wrap">
          <span class="pill ${statusObj.held && !item.archivedAt ? 'pill-accent' : ''}">${esc(statusObj.label)}</span>
          ${item.archivedAt ? `<span class="pill pill-amber">已归档</span>` : ''}
          <span class="pill ${statusPillClass(expSt.key)}">${esc(expSt.label)}</span>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-item-edit="${esc(item.id)}">编辑</button>
      </div>

      <div class="divider"></div>

      <!-- 金额展示 -->
      <div class="row-between" style="font-size:13px;">
        <span class="muted-note">购买价格 / 渠道</span>
        <span style="font-weight:700;">
          ${item.purchasePriceMinor !== null && item.purchasePriceMinor !== undefined
            ? `${esc(formatMinor(item.purchasePriceMinor, item.currencyCode, { showCode: true }))}`
            : '未填写金额'}
          ${item.purchaseChannel ? ` · ${esc(item.purchaseChannel)}` : ''}
        </span>
      </div>
      ${item.purchasePriceMinor !== null && item.purchasePriceMinor !== undefined
        ? `<div class="muted-note" style="text-align:right;font-family:var(--font-mono);font-size:11px;">存储整数: ${esc(item.purchasePriceMinor)} (${esc(item.currencyCode)})</div>`
        : ''}

      <!-- 剩余比例 -->
      <div style="margin-top:10px;">
        <div class="row-between" style="font-size:12px;margin-bottom:4px;">
          <span class="muted-note">剩余比例</span>
          <span style="font-weight:600;">${item.remainingPercent}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${item.remainingPercent}%;background:${item.remainingPercent === 0 ? 'var(--text-tertiary)' : 'var(--sage)'};"></div>
        </div>
      </div>

      <!-- 完整区分有效期字段 -->
      <div class="card-muted" style="margin-top:10px;font-size:12px;">
        <div style="font-weight:700;margin-bottom:4px;">有效期明细（严格不按品类猜测）</div>
        <div>购买日期：${esc(item.purchaseDate || '未填')}</div>
        <div>生产日期：${esc(item.manufactureDate || '未填')} ｜ 未开封保质期：${item.unopenedShelfMonths ? `${item.unopenedShelfMonths} 个月` : '未填'}</div>
        <div>开封日期：${esc(item.openedDate || '未填')} ｜ 开封后使用期限（PAO）：${item.paoMonths ? `${item.paoMonths} 个月` : '未填'}</div>
        ${candidates.length > 0
          ? `<div style="margin-top:4px;color:var(--text-secondary);">系统推算：${candidates.map((c) => `${c.date}（${c.label}）`).join('；')}</div>`
          : `<div style="margin-top:4px;color:var(--text-tertiary);">系统推算：无（${EXPIRY_BASIS_LABELS.none}）</div>`}
        ${missingHints.length > 0
          ? `<div style="margin-top:3px;color:var(--amber);">${missingHints.map(esc).join('；')}</div>`
          : ''}
        <div style="margin-top:4px;font-weight:600;">
          用户确认到期日：${item.confirmedExpiryDate ? `${esc(item.confirmedExpiryDate)}（确认于 ${esc(item.expiryConfirmedAt?.slice(0, 10) || '')}）` : '尚未人工确认'}
        </div>
        ${resolved.needsReconfirm
          ? `<div style="margin-top:4px;color:var(--danger);font-weight:600;">⚠ 相关日期/保质期输入已变化，系统保留您的原确认值未覆盖，请核对后重新确认。</div>`
          : ''}
      </div>

      <!-- 实例动作 -->
      <div class="row-wrap" style="margin-top:10px;">
        <button type="button" class="btn btn-soft btn-sm" data-item-usage="${esc(item.id)}">记一次使用</button>
        ${item.status !== 'used_up'
          ? `<button type="button" class="btn btn-secondary btn-sm" data-item-empty="${esc(item.id)}">标记已用完</button>`
          : ''}
        <button type="button" class="btn btn-secondary btn-sm" data-item-archive="${esc(item.id)}">${item.archivedAt ? '恢复实例' : '归档实例'}</button>
        <button type="button" class="btn btn-danger btn-sm" data-item-delete="${esc(item.id)}">删除</button>
      </div>
    </div>
  `;
}

/* ---------------- 弹窗表单：添加/编辑产品 ---------------- */

export function openProductFormSheet({ store, sheet, toast, productId = null, onSaved }) {
  const existing = productId ? store.state.products.find((p) => p.id === productId) : null;
  let pendingFile = null;
  let selectedSampleKey = '';

  const bodyHtml = `
    <form id="product-form" class="form-stack" novalidate>
      <div id="prod-form-error" class="form-banner-error" style="display:none;"></div>
      <div class="field">
        <label>产品名称 <span class="req">*</span></label>
        <input class="input" name="name" required placeholder="例如：柔亮自然粉底液" value="${esc(existing?.name || '')}" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>分类 <span class="req">*</span></label>
          <select class="select" name="categoryId" required>
            <option value="">请选择分类</option>
            ${store.state.categories
              .map(
                (c) => `<option value="${esc(c.id)}" ${existing?.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`,
              )
              .join('')}
          </select>
        </div>
        <div class="field">
          <label>品牌</label>
          <input class="input" name="brandName" placeholder="例如：Lancôme" value="${esc(existing ? store.getBrandName(existing.brandId) : '')}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>色号 / 款式</label>
          <input class="input" name="shade" placeholder="例如：#196 朱砂橘" value="${esc(existing?.shade || '')}" />
        </div>
        <div class="field">
          <label>规格</label>
          <input class="input" name="specification" placeholder="例如：30ml / 3.4g" value="${esc(existing?.specification || '')}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>质地</label>
          <input class="input" name="texture" placeholder="例如：丝绒哑光" value="${esc(existing?.texture || '')}" />
        </div>
        <div class="field">
          <label>妆效</label>
          <input class="input" name="finish" placeholder="例如：柔雾" value="${esc(existing?.finish || '')}" />
        </div>
      </div>

      <div class="field">
        <label>${existing ? '追加产品照片（可选）' : '产品主图 / 封面（可选，不上传则显示占位图）'}</label>
        <div class="row-wrap">
          <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
            选择手机/电脑照片（存 IndexedDB）
            <input type="file" accept="image/*" id="prod-file-input" style="display:none;" />
          </label>
          <span id="prod-file-name" class="muted-note">未选择本地文件</span>
        </div>
        <div class="muted-note" style="margin-top:4px;">或点选一张本地离线示例图：</div>
        ${renderSamplePickerGrid('')}
      </div>

      <div class="field">
        <label>私人备注（默认不分享）</label>
        <textarea class="textarea" name="notesPrivate" placeholder="使用心得、肤质适配笔记...">${esc(existing?.notesPrivate || '')}</textarea>
      </div>

      ${existing
        ? `<button type="submit" class="btn btn-primary btn-block">保存修改</button>`
        : `
          <div class="field-row">
            <button type="button" id="save-prod-only" class="btn btn-secondary">仅保存产品</button>
            <button type="submit" class="btn btn-primary">保存并添加实例</button>
          </div>
        `}
    </form>
  `;

  sheet.open({
    title: existing ? '编辑产品主档' : '新增产品主档',
    bodyHtml,
    onMount: (body, close) => {
      const form = body.querySelector('#product-form');
      const errBox = body.querySelector('#prod-form-error');
      const fileInput = body.querySelector('#prod-file-input');
      const fileNameEl = body.querySelector('#prod-file-name');

      fileInput?.addEventListener('change', () => {
        const f = fileInput.files?.[0] || null;
        pendingFile = f;
        selectedSampleKey = '';
        body.querySelectorAll('[data-pick-sample]').forEach((b) => b.classList.remove('is-active'));
        fileNameEl.textContent = f ? `已选：${f.name}` : '未选择本地文件';
      });

      body.querySelectorAll('[data-pick-sample]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.pickSample;
          selectedSampleKey = selectedSampleKey === key ? '' : key;
          pendingFile = null;
          if (fileInput) fileInput.value = '';
          fileNameEl.textContent = selectedSampleKey ? '已选离线示例图' : '未选择本地文件';
          body.querySelectorAll('[data-pick-sample]').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.pickSample === selectedSampleKey);
          });
        });
      });

      const handleSave = async (andAddItem) => {
        errBox.style.display = 'none';
        const fd = new FormData(form);
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
        } catch (err) {
          errBox.textContent = err.message || '图片处理失败';
          errBox.style.display = 'block';
          return;
        }

        const res = store.saveProduct({
          id: existing?.id,
          name: fd.get('name'),
          categoryId: fd.get('categoryId'),
          brandName: fd.get('brandName'),
          shade: fd.get('shade'),
          specification: fd.get('specification'),
          texture: fd.get('texture'),
          finish: fd.get('finish'),
          notesPrivate: fd.get('notesPrivate'),
          newAssetId,
          makeNewPhotoCover: !existing,
        });

        if (!res.ok) {
          errBox.textContent = res.error;
          errBox.style.display = 'block';
          return;
        }

        close();
        toast(existing ? '产品修改已保存（历史妆容快照保持不变）' : '产品主档已保存');
        onSaved?.(res.product, { andAddItem });
      };

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSave(!existing);
      });

      body.querySelector('#save-prod-only')?.addEventListener('click', () => handleSave(false));
    },
  });
}

/* ---------------- 弹窗表单：添加/编辑 ProductItem ---------------- */

export function openItemFormSheet({ store, sheet, toast, productId, itemId = null, onSaved }) {
  const existing = itemId ? store.state.productItems.find((i) => i.id === itemId) : null;
  const prod = store.state.products.find((p) => p.id === (existing?.productId || productId));
  if (!prod) return;

  const initialPrice =
    existing && existing.purchasePriceMinor !== null && existing.purchasePriceMinor !== undefined && isSupportedCurrency(existing.currencyCode)
      ? minorToDecimalString(existing.purchasePriceMinor, existing.currencyCode)
      : '';
  const initialCurrency = existing?.currencyCode || 'CNY';

  const bodyHtml = `
    <form id="item-form" class="form-stack" novalidate>
      <div class="form-banner-info">产品主档：<strong>${esc(prod.name)}</strong>（每条持有实例独立记录购买、金额与开封日期）</div>
      <div id="item-form-error" class="form-banner-error" style="display:none;"></div>

      <div class="field-row">
        <div class="field">
          <label>持有状态 <span class="req">*</span></label>
          <select class="select" name="status">
            ${Object.values(ITEM_STATUSES)
              .map((s) => `<option value="${esc(s.key)}" ${(existing?.status || 'in_use') === s.key ? 'selected' : ''}>${esc(s.label)}</option>`)
              .join('')}
          </select>
        </div>
        <div class="field">
          <label>剩余比例（0–100%）</label>
          <input class="input" type="number" min="0" max="100" name="remainingPercent" value="${esc(existing?.remainingPercent ?? 100)}" />
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>购买币种（ISO 4217）</label>
          <select class="select" name="currencyCode" id="item-currency-select">
            ${CURRENCY_ORDER.map((c) => {
              const info = CURRENCIES[c];
              return `<option value="${esc(c)}" ${initialCurrency === c ? 'selected' : ''}>${esc(c)} · ${esc(info.name)}（${info.exponent}位）</option>`;
            }).join('')}
            ${UNCONFIGURED_DEMO_CODES.map(
              (c) => `<option value="${esc(c)}" ${initialCurrency === c ? 'selected' : ''}>${esc(c)}（未配置精度·测试拦截）</option>`,
            ).join('')}
          </select>
        </div>
        <div class="field">
          <label>购买价格（精确录入）</label>
          <input class="input" type="text" inputmode="decimal" name="purchasePriceInput" placeholder="例如 320.00 或 7700" value="${esc(initialPrice)}" />
        </div>
      </div>
      <div id="item-currency-hint" class="field-help">${esc(describePrecision(initialCurrency))}</div>

      <div class="field-row">
        <div class="field">
          <label>购买日期</label>
          <input class="input" type="date" name="purchaseDate" value="${esc(existing?.purchaseDate || '')}" />
        </div>
        <div class="field">
          <label>购买渠道（默认不分享）</label>
          <input class="input" name="purchaseChannel" placeholder="例如：专柜 / 免税店" value="${esc(existing?.purchaseChannel || '')}" />
        </div>
      </div>

      <div class="divider"></div>
      <div style="font-size:13px;font-weight:700;">有效期要素（缺少必要项绝不猜测）</div>

      <div class="field-row">
        <div class="field">
          <label>生产日期</label>
          <input class="input" type="date" name="manufactureDate" id="f-mfg" value="${esc(existing?.manufactureDate || '')}" />
        </div>
        <div class="field">
          <label>未开封保质期（月）</label>
          <input class="input" type="number" min="1" name="unopenedShelfMonths" id="f-shelf" placeholder="例如 36" value="${esc(existing?.unopenedShelfMonths ?? '')}" />
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>开封日期</label>
          <input class="input" type="date" name="openedDate" id="f-opened" value="${esc(existing?.openedDate || '')}" />
        </div>
        <div class="field">
          <label>开封后期限 PAO（月）</label>
          <input class="input" type="number" min="1" name="paoMonths" id="f-pao" placeholder="例如 12" value="${esc(existing?.paoMonths ?? '')}" />
        </div>
      </div>

      <div id="item-expiry-preview" class="form-banner-info"></div>

      <div class="field">
        <label>用户确认到期日（保存后不会被系统推算覆盖）</label>
        <div class="row-wrap">
          <input class="input" style="flex:1;" type="date" name="confirmedExpiryDate" id="f-confirmed" value="${esc(existing?.confirmedExpiryDate || '')}" />
          <button type="button" class="btn btn-soft btn-sm" id="btn-adopt-computed">采纳推算日</button>
        </div>
      </div>

      <button type="submit" class="btn btn-primary btn-block">${existing ? '保存实例修改' : '确认添加实例'}</button>
    </form>
  `;

  sheet.open({
    title: existing ? '编辑持有实例' : '添加持有实例',
    bodyHtml,
    onMount: (body, close) => {
      const form = body.querySelector('#item-form');
      const errBox = body.querySelector('#item-form-error');
      const curSelect = body.querySelector('#item-currency-select');
      const curHint = body.querySelector('#item-currency-hint');
      const previewEl = body.querySelector('#item-expiry-preview');
      const mfgEl = body.querySelector('#f-mfg');
      const shelfEl = body.querySelector('#f-shelf');
      const openEl = body.querySelector('#f-opened');
      const paoEl = body.querySelector('#f-pao');
      const confEl = body.querySelector('#f-confirmed');

      const updateCurrencyHint = () => {
        curHint.textContent = describePrecision(curSelect.value);
      };
      curSelect.addEventListener('change', updateCurrencyHint);

      const getDraftDates = () => ({
        manufactureDate: mfgEl.value || null,
        unopenedShelfMonths: /^\d+$/.test(shelfEl.value) ? Number.parseInt(shelfEl.value, 10) : null,
        openedDate: openEl.value || null,
        paoMonths: /^\d+$/.test(paoEl.value) ? Number.parseInt(paoEl.value, 10) : null,
      });

      let latestSingleComputed = null;
      const updateExpiryPreview = () => {
        const draft = getDraftDates();
        const cands = computeExpiryCandidates(draft);
        const missing = missingExpiryInputs(draft);
        latestSingleComputed = cands.length === 1 ? cands[0].date : (cands.length === 2 && cands[0].date === cands[1].date ? cands[0].date : null);
        const lines = [];
        if (cands.length > 0) {
          lines.push(`系统推算：${cands.map((c) => `${c.date}（${c.label}）`).join('；')}`);
        } else {
          lines.push('系统推算：当前输入不足，不进行推算或猜测。');
        }
        if (cands.length === 2 && cands[0].date !== cands[1].date) {
          lines.push('注意：未开封与开封后两个推算日期不一致，请由您手动确认最终到期日。');
        }
        if (missing.length > 0) lines.push(...missing);
        previewEl.innerHTML = lines.map((l) => `<div>${esc(l)}</div>`).join('');
      };
      [mfgEl, shelfEl, openEl, paoEl].forEach((el) => el.addEventListener('input', updateExpiryPreview));
      updateExpiryPreview();

      body.querySelector('#btn-adopt-computed')?.addEventListener('click', () => {
        if (latestSingleComputed) {
          confEl.value = latestSingleComputed;
          toast(`已填入推算到期日 ${latestSingleComputed}`);
        } else {
          const cands = computeExpiryCandidates(getDraftDates());
          if (cands.length > 0) {
            confEl.value = cands[0].date;
            toast(`存在多个推算日，已暂填 ${cands[0].date}，请按实际标签确认`);
          } else {
            toast('当前缺少推算要素，无法自动填充');
          }
        }
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        errBox.style.display = 'none';
        const fd = new FormData(form);
        const res = store.saveProductItem({
          id: existing?.id,
          productId: prod.id,
          status: fd.get('status'),
          remainingPercent: fd.get('remainingPercent'),
          currencyCode: fd.get('currencyCode'),
          purchasePriceInput: fd.get('purchasePriceInput'),
          purchaseDate: fd.get('purchaseDate'),
          purchaseChannel: fd.get('purchaseChannel'),
          manufactureDate: fd.get('manufactureDate'),
          unopenedShelfMonths: fd.get('unopenedShelfMonths'),
          openedDate: fd.get('openedDate'),
          paoMonths: fd.get('paoMonths'),
          confirmedExpiryDate: fd.get('confirmedExpiryDate'),
        });

        if (!res.ok) {
          errBox.textContent = res.error;
          errBox.style.display = 'block';
          return;
        }
        close();
        toast(existing ? '持有实例已更新' : '新持有实例已添加');
        onSaved?.(res.item);
      });
    },
  });
}

export function bindBoxEvents(container, { store, viewState, actions, sheet, dialog, toast }) {
  container.querySelector('#box-search-input')?.addEventListener('input', (e) => {
    viewState.search = e.target.value;
    actions.rerender({ preserveFocusId: 'box-search-input' });
  });

  container.querySelector('[data-box-toggle-view]')?.addEventListener('click', () => {
    viewState.viewMode = viewState.viewMode === 'grid' ? 'list' : 'grid';
    actions.rerender();
  });

  container.querySelectorAll('[data-box-cat]').forEach((el) => {
    el.addEventListener('click', () => {
      viewState.categoryId = el.dataset.boxCat;
      actions.rerender();
    });
  });

  container.querySelectorAll('[data-box-status]').forEach((el) => {
    el.addEventListener('click', () => {
      viewState.statusFilter = el.dataset.boxStatus;
      actions.rerender();
    });
  });

  container.querySelector('#box-sort-select')?.addEventListener('change', (e) => {
    viewState.sortBy = e.target.value;
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
    const pid = e.currentTarget.dataset.boxEditProduct;
    openProductFormSheet({
      store,
      sheet,
      toast,
      productId: pid,
      onSaved: () => actions.rerender(),
    });
  });

  container.querySelector('[data-box-toggle-archive]')?.addEventListener('click', async (e) => {
    const pid = e.currentTarget.dataset.boxToggleArchive;
    const prod = store.state.products.find((p) => p.id === pid);
    if (!prod) return;
    if (!prod.archivedAt) {
      const ok = await dialog.confirm({
        title: '归档产品',
        message: '归档后将从正常妆匣列表隐藏；已记录的历史妆容仍通过产品快照保留当时名称与色号，图片文件不会丢失。确认归档？',
        confirmLabel: '确认归档',
      });
      if (!ok) return;
    }
    store.toggleArchiveProduct(pid);
    toast(prod.archivedAt ? '产品已归档（历史快照完整保留）' : '产品已恢复到妆匣');
    actions.rerender();
  });

  container.querySelector('#detail-upload-photo')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file || !viewState.selectedProductId) return;
    try {
      const asset = await store.addImageFileAsset(file);
      store.addProductPhoto(viewState.selectedProductId, asset.id);
      toast('照片已保存至 IndexedDB，页面刷新仍可展示');
      actions.rerender();
    } catch (err) {
      toast(err.message || '图片保存失败');
    }
  });

  container.querySelectorAll('[data-set-cover]').forEach((el) => {
    el.addEventListener('click', () => {
      store.setProductCover(viewState.selectedProductId, el.dataset.setCover);
      toast('已设为主封面（productPhotos.isCover = true）');
      actions.rerender();
    });
  });

  container.querySelector('[data-clear-cover]')?.addEventListener('click', () => {
    store.clearProductCover(viewState.selectedProductId);
    toast('已取消封面标记，进入兜底展示模式');
    actions.rerender();
  });

  container.querySelectorAll('[data-del-photo]').forEach((el) => {
    el.addEventListener('click', async () => {
      const ok = await dialog.confirm({
        title: '移除照片',
        message: '移除后若无其他记录引用该图片，原型将同步清理 IndexedDB 中的图片 Blob。确认移除？',
        confirmLabel: '移除',
        danger: true,
      });
      if (!ok) return;
      await store.removeProductPhoto(viewState.selectedProductId, el.dataset.delPhoto);
      toast('照片已移除');
      actions.rerender();
    });
  });

  container.querySelectorAll('[data-box-add-item]').forEach((el) => {
    el.addEventListener('click', () => {
      openItemFormSheet({
        store,
        sheet,
        toast,
        productId: el.dataset.boxAddItem,
        onSaved: () => actions.rerender(),
      });
    });
  });

  container.querySelectorAll('[data-item-edit]').forEach((el) => {
    el.addEventListener('click', () => {
      openItemFormSheet({
        store,
        sheet,
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

  container.querySelectorAll('[data-item-empty]').forEach((el) => {
    el.addEventListener('click', () => {
      const item = store.state.productItems.find((i) => i.id === el.dataset.itemEmpty);
      if (!item) return;
      store.saveProductItem({
        ...item,
        purchasePriceInput:
          item.purchasePriceMinor !== null && item.purchasePriceMinor !== undefined && isSupportedCurrency(item.currencyCode)
            ? minorToDecimalString(item.purchasePriceMinor, item.currencyCode)
            : '',
        status: 'used_up',
        remainingPercent: 0,
      });
      toast('已标记为已用完（历史消费仍计入分币种累计购买金额）');
      actions.rerender();
    });
  });

  container.querySelectorAll('[data-item-archive]').forEach((el) => {
    el.addEventListener('click', () => {
      const res = store.archiveProductItem(el.dataset.itemArchive);
      if (res.ok) {
        toast(res.item.archivedAt ? '实例已归档（消费统计与妆容快照不受影响）' : '实例已恢复');
        actions.rerender();
      }
    });
  });

  container.querySelectorAll('[data-item-delete]').forEach((el) => {
    el.addEventListener('click', async () => {
      const ok = await dialog.confirm({
        title: '删除持有实例',
        message: '若该实例存在使用记录，系统将阻止直接删除并建议改用“归档”；若允许删除，历史妆容中的产品快照仍会完整保留。',
        confirmLabel: '继续删除',
        danger: true,
      });
      if (!ok) return;
      const res = store.deleteProductItemSafe(el.dataset.itemDelete);
      if (!res.ok) {
        toast(res.error);
        return;
      }
      toast('实例已删除（历史妆容快照保持不变）');
      actions.rerender();
    });
  });

  container.querySelectorAll('[data-box-open-look]').forEach((el) => {
    el.addEventListener('click', () => {
      actions.goTab('looks', { selectedLookId: el.dataset.boxOpenLook });
    });
  });
}
