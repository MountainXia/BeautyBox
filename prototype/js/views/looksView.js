/**
 * 妆匣 BeautyBox · 浏览器交互原型（TASK 02）
 * Tab 3：妆容（妆容记录列表、详情、照片、关联产品实例快照、持妆时间线、白名单分享卡预览）
 */

import { buildCategoryPlaceholderUrl, getSampleArtworkOptions } from '../assets.js';
import { todayStr } from '../expiry.js';
import { isHeldStatus } from '../store.js';
import { recordDiagnostic } from '../diagnostics.js';
import { buildShareCardPayload, renderShareCardToPng } from '../shareCard.js';
import {
  esc,
  formatBytes,
  renderEmptyState,
  renderSamplePickerGrid,
  renderStars,
  renderUploadPreview,
  showFormError,
} from '../components/ui.js';

export function renderLooksView({ store, viewState, ctx }) {
  if (viewState.showTrash) {
    return renderLookTrashView({ store, ctx });
  }

  if (viewState.selectedLookId) {
    const look = store.state.looks.find((l) => l.id === viewState.selectedLookId && !l.deletedAt);
    if (look) return renderLookDetail({ store, look, ctx });
    viewState.selectedLookId = null;
  }

  const activeLooks = store.getActiveLooks();
  const trashCount = store.getTrashLooks().length;

  ctx.setHeader({
    title: '妆容',
    subtitle: `${activeLooks.length} 篇妆容记录${trashCount > 0 ? ` · 回收站 ${trashCount}` : ''}`,
    actionsHtml: `
      <button type="button" class="btn btn-secondary btn-sm" data-looks-open-trash="1">回收站${trashCount > 0 ? ` (${trashCount})` : ''}</button>
      <button type="button" class="btn btn-primary btn-sm" data-looks-add="1">+ 记妆容</button>
    `,
  });

  const q = (viewState.search || '').trim().toLowerCase();
  const styleFilter = viewState.styleFilter || 'all';
  const styles = [...new Set(activeLooks.map((l) => l.style).filter(Boolean))];

  const filtered = activeLooks
    .filter((l) => {
      if (styleFilter !== 'all' && l.style !== styleFilter) return false;
      if (q) {
        const hay = [l.name, l.style, l.scene, ...(l.tags || [])].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.lookDate.localeCompare(a.lookDate) || b.createdAt.localeCompare(a.createdAt));

  return `
    <div class="stack">
      <div class="search-bar">
        <span style="color:var(--text-tertiary);">⌕</span>
        <input id="looks-search-input" type="search" placeholder="搜索妆容名称、风格、场景或标签" value="${esc(viewState.search || '')}" />
      </div>

      ${styles.length > 0 ? `
        <div class="chips-scroll">
          <button type="button" class="chip ${styleFilter === 'all' ? 'is-active' : ''}" data-looks-style="all">全部风格</button>
          ${styles
            .map(
              (st) => `<button type="button" class="chip ${styleFilter === st ? 'is-active' : ''}" data-looks-style="${esc(st)}">${esc(st)}</button>`,
            )
            .join('')}
        </div>
      ` : ''}

      ${activeLooks.length === 0
        ? renderEmptyState({
            icon: '✨',
            title: '还没有妆容记录',
            desc: '拍下今日完成照，关联你实际用到的每一支产品实例并追踪持妆状态。',
            actionLabel: '+ 记录第一篇妆容',
            actionAttr: 'data-looks-add="1"',
          })
        : filtered.length === 0
          ? renderEmptyState({
              icon: '⌕',
              title: '没有找到匹配的妆容',
              desc: '尝试清空搜索关键词或切换其他风格筛选。',
              actionLabel: '清除筛选',
              actionAttr: 'data-looks-clear="1"',
            })
          : `
            <div class="look-grid">
              ${filtered
                .map((l) => {
                  const coverUrl = (l.coverAssetId && store.getAssetUrl(l.coverAssetId)) || buildCategoryPlaceholderUrl('妆容');
                  const itemCount = store.state.lookProductItems.filter((x) => x.lookId === l.id).length;
                  const wearCount = store.state.wearReviews.filter((w) => w.lookId === l.id).length;
                  return `
                    <button type="button" class="product-card" data-looks-open="${esc(l.id)}">
                      <img class="product-card-img" src="${coverUrl}" alt="${esc(l.name)}" />
                      <div class="product-card-body">
                        <div class="product-brand">${esc(l.lookDate)}${l.style ? ` · ${esc(l.style)}` : ''}</div>
                        <div class="product-name">${esc(l.name)}</div>
                        <div class="row-wrap" style="margin-top:auto;padding-top:4px;">
                          <span class="pill pill-accent">${itemCount} 件产品</span>
                          ${wearCount > 0 ? `<span class="pill pill-sage">持妆 ${wearCount} 条</span>` : ''}
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
}

function renderLookTrashView({ store, ctx }) {
  const trashRows = store.getTrashLooks();
  ctx.setHeader({
    title: '妆容回收站',
    subtitle: `${trashRows.length} 篇待清理 · 默认保留 7 天`,
    backBtnAttr: 'data-looks-trash-back="1"',
  });

  return `
    <div class="stack">
      <div class="form-banner-info">
        删除的妆容默认保留 7 天，7 天内可随时恢复；到期后会在应用启动时自动永久删除。删除妆容不会连带删除美妆产品或其他历史记录，关联照片仅在无其他引用时清理。
      </div>

      ${trashRows.length === 0
        ? renderEmptyState({
            icon: '🗑',
            title: '回收站是空的',
            desc: '删除的妆容会暂存这里 7 天，期间可以恢复，也可以提前永久删除。',
            actionLabel: '返回妆容列表',
            actionAttr: 'data-looks-trash-back="1"',
          })
        : trashRows
            .map(({ look, remainingDays }) => {
              const coverUrl = (look.coverAssetId && store.getAssetUrl(look.coverAssetId)) || buildCategoryPlaceholderUrl('妆容');
              return `
                <div class="card">
                  <div class="row" style="gap:12px;align-items:flex-start;">
                    <img src="${coverUrl}" alt="${esc(look.name)}" style="width:68px;height:68px;object-fit:cover;border-radius:12px;flex-shrink:0;" />
                    <div style="flex:1;min-width:0;">
                      <div style="font-weight:700;font-size:15px;">${esc(look.name)}</div>
                      <div class="muted-note" style="margin-top:2px;">妆容日期：${esc(look.lookDate)} ｜ 删除于 ${esc((look.deletedAt || '').slice(0, 10))}</div>
                      <div style="margin-top:6px;">
                        <span class="pill pill-amber">剩余 ${remainingDays} 天自动清理</span>
                      </div>
                    </div>
                  </div>
                  <div class="row-wrap" style="margin-top:10px;justify-content:flex-end;">
                    <button type="button" class="btn btn-soft btn-sm" data-look-restore="${esc(look.id)}">恢复妆容</button>
                    <button type="button" class="btn btn-danger btn-sm" data-look-purge="${esc(look.id)}">永久删除</button>
                  </div>
                </div>
              `;
            })
            .join('')}
    </div>
  `;
}

function renderLookDetail({ store, look, ctx }) {
  const photos = store.state.lookPhotos
    .filter((lp) => lp.lookId === look.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const usedItems = store.state.lookProductItems
    .filter((lpi) => lpi.lookId === look.id)
    .sort((a, b) => a.stepOrder - b.stepOrder);
  const wearList = store.state.wearReviews
    .filter((w) => w.lookId === look.id)
    .sort((a, b) => a.wearMinutes - b.wearMinutes || a.capturedAt.localeCompare(b.capturedAt));

  ctx.setHeader({
    title: look.name,
    subtitle: `${look.lookDate}${look.scene ? ` · ${look.scene}` : ''}`,
    backBtnAttr: 'data-looks-back="1"',
    actionsHtml: `
      <button type="button" class="btn btn-secondary btn-sm" data-looks-edit="${esc(look.id)}">编辑</button>
      <button type="button" class="btn btn-soft btn-sm" data-looks-share="${esc(look.id)}">生成分享图</button>
    `,
  });

  const mainCover = (look.coverAssetId && store.getAssetUrl(look.coverAssetId)) || buildCategoryPlaceholderUrl('妆容');

  return `
    <div class="stack">
      <!-- 照片画廊 -->
      <div class="card">
        <div class="section-header">
          <h2 class="section-title">妆容照片</h2>
          <span class="section-hint">${photos.length || 1} 张</span>
        </div>
        ${photos.length === 0
          ? `<img src="${mainCover}" alt="${esc(look.name)}" style="width:100%;max-height:240px;object-fit:cover;border-radius:12px;" />`
          : `
            <div class="gallery-strip">
              ${photos
                .map((lp) => {
                  const url = store.getAssetUrl(lp.assetId) || mainCover;
                  return `
                    <div class="gallery-item" style="width:156px;">
                      <img src="${url}" alt="妆容照" style="height:132px;" />
                      <span class="pill">${lp.photoRole === 'finished' ? '完成照' : '局部照'}</span>
                    </div>
                  `;
                })
                .join('')}
            </div>
          `}
      </div>

      <!-- 基本参数与自评 -->
      <div class="card">
        <div class="row-between" style="margin-bottom:8px;">
          <h2 class="section-title">妆容概况与自评</h2>
          <span class="pill pill-accent">${renderStars(look.selfRating)}</span>
        </div>
        <div class="row-wrap" style="margin-bottom:10px;">
          ${look.style ? `<span class="pill">风格：${esc(look.style)}</span>` : ''}
          ${look.scene ? `<span class="pill">场景：${esc(look.scene)}</span>` : ''}
          ${look.durationMinutes !== null && look.durationMinutes !== undefined ? `<span class="pill">耗时：${look.durationMinutes} 分钟</span>` : ''}
          ${(look.tags || []).map((t) => `<span class="pill pill-sage">#${esc(t)}</span>`).join('')}
        </div>
        <div class="field-row" style="font-size:12px;color:var(--text-secondary);">
          <div>整体协调：${renderStars(look.coordinationRating)}</div>
          <div>色彩搭配：${renderStars(look.colorRating)}</div>
          <div>持妆表现：${renderStars(look.wearRating)}</div>
        </div>
        ${look.notesPrivate
          ? `<div class="card-muted" style="margin-top:10px;font-size:13px;"><span class="muted-note">私人备注（默认不分享）：</span>${esc(look.notesPrivate)}</div>`
          : ''}
      </div>

      <!-- 关联产品实例快照（核心业务验证点） -->
      <div class="card">
        <div class="section-header">
          <h2 class="section-title">使用产品快照（${usedItems.length} 件）</h2>
          <span class="section-hint">产品修改/移除后快照不失真</span>
        </div>
        ${usedItems.length === 0
          ? `<div class="muted-note">本篇妆容未关联具体产品。</div>`
          : `
            <div class="stack-sm">
              ${usedItems
                .map((lpi) => {
                  const liveItem = lpi.productItemId ? store.state.productItems.find((i) => i.id === lpi.productItemId) : null;
                  const liveProd = liveItem ? store.state.products.find((p) => p.id === liveItem.productId) : null;
                  const archivedOrGone = !liveItem || !liveProd || liveItem.archivedAt || liveItem.deletedAt || liveProd.archivedAt || liveProd.deletedAt;
                  const renamed = liveProd && liveProd.name !== lpi.productNameSnapshot;
                  return `
                    <div class="card-muted" style="padding:10px 12px;">
                      <div class="row-between">
                        <div style="font-weight:600;font-size:14px;">
                          ${esc(lpi.stepOrder)}. ${esc(lpi.productNameSnapshot)}
                        </div>
                        <span class="pill">${esc(lpi.stepKey || lpi.categorySnapshot)}</span>
                      </div>
                      <div class="muted-note" style="margin-top:3px;">
                        ${esc([lpi.brandNameSnapshot, lpi.shadeSnapshot, lpi.categorySnapshot].filter(Boolean).join(' · '))}
                      </div>
                      ${archivedOrGone || renamed
                        ? `<div style="font-size:11px;color:var(--amber);margin-top:4px;">已通过历史快照保留当时信息${renamed ? `（现已改名为“${esc(liveProd.name)}”）` : '（原产品已用完或已移除）'}</div>`
                        : ''}
                    </div>
                  `;
                })
                .join('')}
            </div>
          `}
      </div>

      <!-- 持妆实测时间线 -->
      <div class="card">
        <div class="row-between" style="margin-bottom:12px;">
          <div>
            <h2 class="section-title">持妆实测时间线（${wearList.length}）</h2>
            <div class="muted-note">追踪不同时间点的氧化、出油、卡粉等表现</div>
          </div>
          <button type="button" class="btn btn-soft btn-sm" data-looks-add-wear="${esc(look.id)}">+ 补充持妆</button>
        </div>

        ${wearList.length === 0
          ? `<div class="muted-note">暂无持妆节点记录，可在带妆 2/4/6/8 小时后补充照片与感受。</div>`
          : `
            <div>
              ${wearList
                .map((w) => {
                  const wUrl = w.assetId ? store.getAssetUrl(w.assetId) : null;
                  return `
                    <div class="timeline-item">
                      <span class="timeline-dot"></span>
                      <div class="row-between">
                        <strong style="font-size:14px;">${esc(w.timepointKey)}（${w.wearMinutes} 分钟）</strong>
                        <span style="font-size:12px;color:var(--accent);">${renderStars(w.overallRating)}</span>
                      </div>
                      <div class="row-wrap" style="margin:6px 0;">
                        <span class="pill">出油：${esc(w.oilLevel)}</span>
                        <span class="pill">暗沉：${esc(w.oxidationLevel)}</span>
                        <span class="pill">脱妆：${esc(w.makeupLossLevel)}</span>
                        <span class="pill">晕妆：${esc(w.smudgeLevel)}</span>
                        <span class="pill">卡粉：${esc(w.cakingLevel)}</span>
                      </div>
                      ${wUrl ? `<img src="${wUrl}" alt="持妆照" style="width:120px;height:96px;object-fit:cover;border-radius:10px;margin:6px 0;" />` : ''}
                      ${w.notesPrivate ? `<div class="muted-note">${esc(w.notesPrivate)}</div>` : ''}
                    </div>
                  `;
                })
                .join('')}
            </div>
          `}
      </div>

      <!-- 删除进入回收站 -->
      <div class="card">
        <div class="row-between" style="gap:10px;">
          <div style="flex:1;">
            <div style="font-weight:700;font-size:14px;">删除这篇妆容</div>
            <div class="muted-note">删除后将移入回收站保留 7 天，不会影响关联的美妆产品。</div>
          </div>
          <button type="button" class="btn btn-danger btn-sm" data-looks-soft-delete="${esc(look.id)}">移入回收站</button>
        </div>
      </div>
    </div>
  `;
}

/* ---------------- 弹窗：新增妆容记录 ---------------- */

export function openLookFormSheet({ store, sheet, dialog, toast, lookId = null, onSaved }) {
  const existing = lookId ? store.state.looks.find((l) => l.id === lookId) : null;
  const existingItemIds = new Set(
    existing
      ? store.state.lookProductItems.filter((lpi) => lpi.lookId === existing.id).map((lpi) => lpi.productItemId).filter(Boolean)
      : [],
  );
  const existingCoverAsset = existing?.coverAssetId
    ? store.state.mediaAssets.find((a) => a.id === existing.coverAssetId) || null
    : null;

  const activeProdIds = new Set(store.getActiveProducts().map((p) => p.id));
  const heldItems = store.state.productItems.filter(
    (i) => !i.archivedAt && !i.deletedAt && activeProdIds.has(i.productId) && isHeldStatus(i.status),
  );
  let pendingFile = null;
  let pendingPreviewUrl = '';
  let selectedSampleKey = existingCoverAsset
    ? (existingCoverAsset.kind === 'sample' ? existingCoverAsset.sampleKey : '')
    : 'sample-look-commute';
  let preserveExistingAssetId = existingCoverAsset && existingCoverAsset.kind === 'idb' ? existingCoverAsset.id : null;
  let isDirty = false;
  const sampleOpts = getSampleArtworkOptions();

  const revokePreview = () => {
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
      pendingPreviewUrl = '';
    }
  };

  const bodyHtml = `
    <form id="look-form" class="form-stack" novalidate>
      <div id="look-form-error" class="form-banner-error" style="display:none;"></div>

      <div class="field">
        <label>妆容名称 <span class="req">*</span></label>
        <input class="input" name="name" required placeholder="例如：周末低饱和茶棕妆" value="${esc(existing?.name || '')}" />
      </div>

      <div class="field-row field-row-mobile-stack">
        <div class="field">
          <label>日期 <span class="req">*</span></label>
          <input class="input" type="date" name="lookDate" value="${esc(existing?.lookDate || todayStr())}" required />
        </div>
        <div class="field">
          <label>耗时（分钟）</label>
          <input class="input" type="number" min="0" name="durationMinutes" placeholder="例如 20" value="${esc(existing?.durationMinutes ?? 20)}" />
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>风格</label>
          <input class="input" name="style" placeholder="例如：清透通勤" value="${esc(existing?.style || '')}" />
        </div>
        <div class="field">
          <label>场景</label>
          <input class="input" name="scene" placeholder="例如：上班 / 约会" value="${esc(existing?.scene || '')}" />
        </div>
      </div>

      <div class="field">
        <label>妆容照片（选择本地照片存 IndexedDB，或选本地示例图）</label>
        <div class="row-wrap">
          <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
            上传照片（存 IndexedDB）
            <input type="file" accept="image/*" id="look-file-input" style="display:none;" />
          </label>
          <span id="look-file-name" class="muted-note">${preserveExistingAssetId ? '已保留当前妆容照片' : selectedSampleKey ? '已选本地示例图' : '未选择图片'}</span>
        </div>
        <div id="look-upload-preview"></div>
        ${renderSamplePickerGrid(selectedSampleKey)}
      </div>

      <div class="field">
        <label>关联实际使用的产品实例（自动保存当时产品快照）</label>
        ${heldItems.length === 0
          ? `<div class="form-banner-info">当前暂无“仍在持有”的实例，可先在妆匣添加产品实例后再关联，也可先保存纯妆容记录。</div>`
          : `
            <div class="stack-sm" style="max-height:190px;overflow-y:auto;border:1px solid var(--border-subtle);padding:8px 10px;border-radius:12px;background:var(--bg-card);">
              ${heldItems
                .map((item) => {
                  const prod = store.state.products.find((p) => p.id === item.productId);
                  if (!prod) return '';
                  const brand = store.getBrandName(prod.brandId);
                  return `
                    <label style="display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 0;cursor:pointer;">
                      <input type="checkbox" name="itemIds" value="${esc(item.id)}" ${existingItemIds.has(item.id) ? 'checked' : ''} style="width:18px;height:18px;" />
                      <span>
                        <strong>${esc(prod.name)}</strong>
                        <span class="muted-note">${esc([brand, prod.shade].filter(Boolean).join(' · '))}</span>
                      </span>
                    </label>
                  `;
                })
                .join('')}
            </div>
          `}
      </div>

      <div class="field-row">
        <div class="field">
          <label>综合自评（1–5 星）</label>
          <select class="select" name="selfRating">
            ${[5, 4, 3, 2, 1]
              .map((r) => {
                const labels = { 5: '5 星 · 非常满意', 4: '4 星 · 良好', 3: '3 星 · 一般', 2: '2 星 · 需调整', 1: '1 星 · 不太合适' };
                return `<option value="${r}" ${(existing?.selfRating ?? 5) === r ? 'selected' : ''}>${labels[r]}</option>`;
              })
              .join('')}
          </select>
        </div>
        <div class="field">
          <label>标签（逗号分隔）</label>
          <input class="input" name="tags" placeholder="例如：通勤, 低饱和" value="${esc((existing?.tags || []).join(', '))}" />
        </div>
      </div>

      <div class="field">
        <label>私人备注（默认不分享）</label>
        <textarea class="textarea" name="notesPrivate" placeholder="记录手法、搭配感受...">${esc(existing?.notesPrivate || '')}</textarea>
      </div>

      <button type="submit" class="btn btn-primary btn-block">${existing ? '保存修改' : '保存妆容记录'}</button>
    </form>
  `;

  sheet.open({
    title: existing ? '编辑妆容记录' : '新增妆容记录',
    bodyHtml,
    onClose: revokePreview,
    beforeClose: () => {
      if (!isDirty) return true;
      dialog
        .confirm({
          title: '放弃未保存的妆容草稿？',
          message: '您已填写部分内容，直接关闭将丢失本次编辑。',
          confirmLabel: '继续放弃',
          cancelLabel: '留在此页',
          danger: true,
        })
        .then((ok) => {
          if (ok) {
            isDirty = false;
            sheet.close();
          }
        });
      return false;
    },
    onMount: (body, close) => {
      const form = body.querySelector('#look-form');
      const errBox = body.querySelector('#look-form-error');
      const fileInput = body.querySelector('#look-file-input');
      const fileNameEl = body.querySelector('#look-file-name');
      const previewWrap = body.querySelector('#look-upload-preview');

      const updateUploadPreview = () => {
        if (pendingFile && pendingPreviewUrl) {
          previewWrap.innerHTML = renderUploadPreview({
            previewUrl: pendingPreviewUrl,
            title: pendingFile.name || '已选择妆容照片',
            badgeText: '将作为妆容封面',
            subtitle: `${formatBytes(pendingFile.size)} · 保存后写入 IndexedDB`,
          });
        } else if (selectedSampleKey) {
          const opt = sampleOpts.find((o) => o.key === selectedSampleKey);
          previewWrap.innerHTML = opt
            ? renderUploadPreview({
                previewUrl: opt.url,
                title: opt.title,
                badgeText: '将作为妆容封面',
                subtitle: '离线示例图',
              })
            : '';
        } else if (preserveExistingAssetId) {
          const url = store.getAssetUrl(preserveExistingAssetId);
          previewWrap.innerHTML = url
            ? renderUploadPreview({
                previewUrl: url,
                title: '当前妆容照片',
                badgeText: '已保存封面',
                subtitle: '保留原图（可重新上传或改选示例图）',
              })
            : '';
        } else {
          previewWrap.innerHTML = '';
        }
      };

      updateUploadPreview();

      form.addEventListener('input', () => {
        isDirty = true;
      });

      fileInput?.addEventListener('change', () => {
        revokePreview();
        pendingFile = fileInput.files?.[0] || null;
        if (pendingFile) {
          selectedSampleKey = '';
          pendingPreviewUrl = URL.createObjectURL(pendingFile);
          body.querySelectorAll('[data-pick-sample]').forEach((b) => b.classList.remove('is-active'));
          fileNameEl.textContent = `已选：${pendingFile.name}`;
        }
        updateUploadPreview();
        isDirty = true;
      });

      body.querySelectorAll('[data-pick-sample]').forEach((btn) => {
        btn.addEventListener('click', () => {
          revokePreview();
          const key = btn.dataset.pickSample;
          selectedSampleKey = selectedSampleKey === key ? '' : key;
          preserveExistingAssetId = null;
          pendingFile = null;
          if (fileInput) fileInput.value = '';
          fileNameEl.textContent = selectedSampleKey ? `已选示例图：${btn.title}` : '不添加照片';
          body.querySelectorAll('[data-pick-sample]').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.pickSample === selectedSampleKey);
          });
          updateUploadPreview();
          isDirty = true;
        });
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errBox.style.display = 'none';
        const fd = new FormData(form);
        const assetIds = [];

        try {
          if (pendingFile) {
            const asset = await store.addImageFileAsset(pendingFile);
            assetIds.push(asset.id);
          } else if (selectedSampleKey) {
            const existingSample = store.state.mediaAssets.find((a) => a.kind === 'sample' && a.sampleKey === selectedSampleKey);
            if (existingSample) {
              assetIds.push(existingSample.id);
            } else {
              const id = `asset-${Date.now().toString(36)}`;
              store.state.mediaAssets.push({
                id,
                kind: 'sample',
                sampleKey: selectedSampleKey,
                mimeType: 'image/svg+xml',
                createdAt: new Date().toISOString(),
              });
              assetIds.push(id);
            }
          } else if (preserveExistingAssetId) {
            assetIds.push(preserveExistingAssetId);
          }

          const checkedItems = [...body.querySelectorAll('input[name="itemIds"]:checked')].map((el) => el.value);
          const tags = String(fd.get('tags') || '')
            .split(/[,，]/)
            .map((t) => t.trim())
            .filter(Boolean);

          const res = store.saveLook({
            id: existing?.id,
            name: fd.get('name'),
            lookDate: fd.get('lookDate'),
            durationMinutes: fd.get('durationMinutes'),
            style: fd.get('style'),
            scene: fd.get('scene'),
            selfRating: fd.get('selfRating'),
            coordinationRating: fd.get('selfRating'),
            colorRating: fd.get('selfRating'),
            wearRating: fd.get('selfRating'),
            tags,
            notesPrivate: fd.get('notesPrivate'),
            assetIds,
            selectedItems: checkedItems,
          });

          if (!res.ok) {
            showFormError(errBox, res.error, toast);
            return;
          }

          isDirty = false;
          close();
          toast(existing ? '妆容修改已保存' : '妆容记录已保存（关联产品已生成快照）');
          onSaved?.(res.look);
        } catch (err) {
          if (!err?.stage) {
            recordDiagnostic('unexpected_save_error', err, {
              entityType: 'look',
              hasFile: Boolean(pendingFile),
              fileSize: pendingFile?.size || 0,
            });
          }
          showFormError(errBox, err?.message || '保存妆容失败，请在「我的」查看保存诊断日志', toast);
        }
      });
    },
  });
}

/* ---------------- 弹窗：补充持妆实测 ---------------- */

function openWearReviewSheet({ store, sheet, toast, lookId, onSaved }) {
  let pendingFile = null;
  let pendingPreviewUrl = '';
  const revokePreview = () => {
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
      pendingPreviewUrl = '';
    }
  };
  const bodyHtml = `
    <form id="wear-form" class="form-stack" novalidate>
      <div id="wear-form-error" class="form-banner-error" style="display:none;"></div>
      <div class="field-row">
        <div class="field">
          <label>时间节点 <span class="req">*</span></label>
          <select class="select" name="timepointKey" id="wear-tp">
            <option value="刚完成">刚完成（0小时）</option>
            <option value="2小时">2小时</option>
            <option value="4小时" selected>4小时</option>
            <option value="6小时">6小时</option>
            <option value="8小时">8小时</option>
            <option value="自定义节点">自定义节点</option>
          </select>
        </div>
        <div class="field">
          <label>带妆分钟数</label>
          <input class="input" type="number" min="0" name="wearMinutes" id="wear-mins" value="240" />
        </div>
      </div>

      <div class="field">
        <label>持妆星级</label>
        <select class="select" name="overallRating">
          <option value="5">5 星 · 完整贴合</option>
          <option value="4" selected>4 星 · 轻微出油自然</option>
          <option value="3">3 星 · 局部脱妆</option>
          <option value="2">2 星 · 明显斑驳暗沉</option>
          <option value="1">1 星 · 严重脱妆</option>
        </select>
      </div>

      <div class="field-row">
        <div class="field">
          <label>出油状况</label>
          <select class="select" name="oilLevel">
            <option value="清爽">清爽</option>
            <option value="T区微油" selected>T区微油</option>
            <option value="全脸泛油">全脸泛油</option>
          </select>
        </div>
        <div class="field">
          <label>暗沉氧化</label>
          <select class="select" name="oxidationLevel">
            <option value="无">无</option>
            <option value="轻微" selected>轻微</option>
            <option value="明显">明显</option>
          </select>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>脱妆程度</label>
          <select class="select" name="makeupLossLevel">
            <option value="无">无</option>
            <option value="轻微" selected>轻微</option>
            <option value="明显">明显</option>
          </select>
        </div>
        <div class="field">
          <label>卡粉 / 浮粉</label>
          <select class="select" name="cakingLevel">
            <option value="无" selected>无</option>
            <option value="鼻翼/眼下轻微">鼻翼/眼下轻微</option>
            <option value="明显">明显</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label>实测照片（可选，上传后存 IndexedDB）</label>
        <div class="row-wrap">
          <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
            选择照片
            <input type="file" accept="image/*" id="wear-file" style="display:none;" />
          </label>
          <span id="wear-file-name" class="muted-note">未选择照片</span>
        </div>
        <div id="wear-upload-preview"></div>
      </div>

      <div class="field">
        <label>补充笔记（默认不分享）</label>
        <textarea class="textarea" name="notesPrivate" placeholder="例如：午后T区用吸油纸轻按后恢复自然光泽..."></textarea>
      </div>

      <button type="submit" class="btn btn-primary btn-block">保存持妆记录</button>
    </form>
  `;

  sheet.open({
    title: '补充持妆实测',
    bodyHtml,
    onClose: revokePreview,
    onMount: (body, close) => {
      const tp = body.querySelector('#wear-tp');
      const mins = body.querySelector('#wear-mins');
      tp?.addEventListener('change', () => {
        const map = { '刚完成': 0, '2小时': 120, '4小时': 240, '6小时': 360, '8小时': 480 };
        if (tp.value in map) mins.value = String(map[tp.value]);
      });

      const fileEl = body.querySelector('#wear-file');
      const previewWrap = body.querySelector('#wear-upload-preview');
      fileEl?.addEventListener('change', () => {
        revokePreview();
        pendingFile = fileEl.files?.[0] || null;
        body.querySelector('#wear-file-name').textContent = pendingFile ? pendingFile.name : '未选择照片';
        if (pendingFile) {
          pendingPreviewUrl = URL.createObjectURL(pendingFile);
          previewWrap.innerHTML = renderUploadPreview({
            previewUrl: pendingPreviewUrl,
            title: pendingFile.name || '实测照片',
            badgeText: '节点实测图',
            subtitle: `${formatBytes(pendingFile.size)} · 保存后写入 IndexedDB`,
          });
        } else if (preserveExistingAssetId) {
          const url = store.getAssetUrl(preserveExistingAssetId);
          previewWrap.innerHTML = url
            ? renderUploadPreview({
                previewUrl: url,
                title: '当前妆容照片',
                badgeText: '已保存封面',
                subtitle: '保留原图（可重新上传或改选示例图）',
              })
            : '';
        } else {
          previewWrap.innerHTML = '';
        }
      });

      body.querySelector('#wear-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errBox = body.querySelector('#wear-form-error');
        errBox.style.display = 'none';
        try {
          let assetId = null;
          if (pendingFile) {
            const asset = await store.addImageFileAsset(pendingFile);
            assetId = asset.id;
          }
          const fd = new FormData(e.target);
          const res = store.addWearReview(lookId, {
            timepointKey: fd.get('timepointKey'),
            wearMinutes: fd.get('wearMinutes'),
            overallRating: fd.get('overallRating'),
            oilLevel: fd.get('oilLevel'),
            oxidationLevel: fd.get('oxidationLevel'),
            makeupLossLevel: fd.get('makeupLossLevel'),
            cakingLevel: fd.get('cakingLevel'),
            notesPrivate: fd.get('notesPrivate'),
            assetId,
          });
          if (!res.ok) {
            showFormError(errBox, res.error, toast);
            return;
          }
          close();
          toast('持妆实测节点已保存');
          onSaved?.();
        } catch (err) {
          if (!err?.stage) {
            recordDiagnostic('unexpected_save_error', err, {
              entityType: 'wear_review',
              hasFile: Boolean(pendingFile),
              fileSize: pendingFile?.size || 0,
            });
          }
          showFormError(errBox, err?.message || '保存持妆记录失败，请在「我的」查看诊断日志', toast);
        }
      });
    },
  });
}

/* ---------------- 弹窗：白名单分享图片预览（严格脱敏） ---------------- */

function openSharePreviewSheet({ store, sheet, toast, lookId }) {
  const look = store.state.looks.find((l) => l.id === lookId);
  if (!look) return;
  const items = store.state.lookProductItems.filter((x) => x.lookId === look.id);
  const wearList = store.state.wearReviews.filter((w) => w.lookId === look.id);

  const shareOpts = {
    cardType: 'look', // 'look' | 'wear' | 'list'
    showPhoto: true,
    showStyle: true,
    showDuration: true,
    showProducts: true,
    showRating: true,
    showWear: wearList.length > 0,
  };

  const renderPreview = () => {
    const coverUrl = (look.coverAssetId && store.getAssetUrl(look.coverAssetId)) || buildCategoryPlaceholderUrl('妆容');
    const titlePrefix =
      shareOpts.cardType === 'wear' ? '持妆实测卡' : shareOpts.cardType === 'list' ? '产品清单卡' : '妆容展示卡';

    return `
      <div class="share-card-preview">
        <div class="row-between" style="margin-bottom:10px;">
          <span class="pill pill-accent">${titlePrefix}</span>
          <span class="muted-note">${esc(look.lookDate)}</span>
        </div>
        ${shareOpts.showPhoto && shareOpts.cardType !== 'list'
          ? `<img src="${coverUrl}" alt="分享封面" style="width:100%;height:164px;object-fit:cover;border-radius:14px;margin-bottom:12px;" />`
          : ''}
        <div style="font-size:17px;font-weight:700;">${esc(look.name)}</div>
        <div class="row-wrap" style="margin-top:6px;">
          ${shareOpts.showStyle && look.style ? `<span class="pill">${esc(look.style)}</span>` : ''}
          ${shareOpts.showStyle && look.scene ? `<span class="pill">${esc(look.scene)}</span>` : ''}
          ${shareOpts.showDuration && look.durationMinutes ? `<span class="pill">${look.durationMinutes} min</span>` : ''}
          ${shareOpts.showRating ? `<span class="pill pill-sage">${renderStars(look.selfRating)}</span>` : ''}
        </div>

        ${shareOpts.showProducts && items.length > 0 ? `
          <div style="margin-top:12px;border-top:1px solid var(--border-subtle);padding-top:10px;">
            <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:6px;">使用产品清单（仅公开名称/品牌/色号）</div>
            ${items
              .map(
                (i) => `<div style="font-size:12px;margin-bottom:3px;">· ${esc([i.brandNameSnapshot, i.productNameSnapshot, i.shadeSnapshot].filter(Boolean).join(' '))}</div>`,
              )
              .join('')}
          </div>
        ` : ''}

        ${shareOpts.showWear && wearList.length > 0 ? `
          <div style="margin-top:10px;border-top:1px solid var(--border-subtle);padding-top:8px;font-size:12px;color:var(--text-secondary);">
            持妆实测：${wearList.map((w) => `${w.timepointKey}(${w.overallRating}★)`).join(' → ')}
          </div>
        ` : ''}

        <div class="share-card-footer">
          <span>妆匣 BeautyBox · 本地生成</span>
          <span>价格/获得方式/私人备注已隐藏</span>
        </div>
      </div>
    `;
  };

  const coverAsset = look.coverAssetId
    ? store.state.mediaAssets.find((a) => a.id === look.coverAssetId) || null
    : null;
  let generatedBlobUrl = '';
  let generatedFile = null;
  let generatedFileName = 'beautybox-share.png';
  let renderSeq = 0;

  const revokeGeneratedUrl = () => {
    if (generatedBlobUrl) {
      URL.revokeObjectURL(generatedBlobUrl);
      generatedBlobUrl = '';
    }
  };

  sheet.open({
    title: '生成分享图片',
    bodyHtml: `
      <div class="stack">
        <div class="segmented">
          <button type="button" class="seg-btn is-active" data-share-type="look">妆容展示卡</button>
          <button type="button" class="seg-btn" data-share-type="wear">持妆实测卡</button>
          <button type="button" class="seg-btn" data-share-type="list">产品清单卡</button>
        </div>

        <div class="card">
          <div style="font-size:13px;font-weight:700;margin-bottom:8px;">公开内容勾选</div>
          <div class="row-wrap" style="font-size:13px;">
            <label><input type="checkbox" data-share-opt="showPhoto" checked /> 妆容照片</label>
            <label><input type="checkbox" data-share-opt="showStyle" checked /> 风格/场景</label>
            <label><input type="checkbox" data-share-opt="showDuration" checked /> 耗时</label>
            <label><input type="checkbox" data-share-opt="showProducts" checked /> 产品名/品牌/色号</label>
            <label><input type="checkbox" data-share-opt="showRating" checked /> 星级</label>
            <label><input type="checkbox" data-share-opt="showWear" ${wearList.length > 0 ? 'checked' : ''} /> 持妆简报</label>
          </div>
        </div>

        <div id="share-save-error" class="form-banner-error" style="display:none;"></div>

        <div class="card" id="share-png-card">
          <div class="section-header" style="margin-bottom:8px;">
            <h3 class="section-title" style="font-size:14px;">分享图片（PNG）</h3>
            <span class="pill pill-sage" id="share-png-status">生成中...</span>
          </div>
          <div id="share-png-result" class="muted-note">正在本地渲染高清 PNG 分享卡...</div>
        </div>

        <div class="stack-sm">
          <button type="button" class="btn btn-primary btn-block" id="btn-save-share-card" disabled>保存 / 分享图片到相册</button>
          <button type="button" class="btn btn-secondary btn-block" id="btn-download-share-png" disabled>下载 PNG 图片</button>
        </div>
        <div class="muted-note" style="text-align:center;">iPhone Safari 可点击「保存 / 分享图片到相册」呼出系统“存储图像”，或直接长按上方图片存储到「照片」。</div>
      </div>
    `,
    onClose: revokeGeneratedUrl,
    onMount: (body) => {
      const errBox = body.querySelector('#share-save-error');
      const pngStatus = body.querySelector('#share-png-status');
      const pngResult = body.querySelector('#share-png-result');
      const shareBtn = body.querySelector('#btn-save-share-card');
      const downloadBtn = body.querySelector('#btn-download-share-png');

      const triggerDownload = () => {
        if (!generatedBlobUrl) return false;
        const a = document.createElement('a');
        a.href = generatedBlobUrl;
        a.download = generatedFileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return true;
      };

      const rebuildPng = async () => {
        const mySeq = ++renderSeq;
        errBox.style.display = 'none';
        shareBtn.disabled = true;
        downloadBtn.disabled = true;
        pngStatus.textContent = '生成中...';
        pngStatus.className = 'pill';

        const payload = buildShareCardPayload({ look, items, wearList, shareOpts });
        const coverUrl = look.coverAssetId ? store.getAssetUrl(look.coverAssetId) : null;
        const res = await renderShareCardToPng({ payload, coverAsset, coverUrl });
        if (mySeq !== renderSeq) return;

        if (!res.ok) {
          pngStatus.textContent = '生成失败';
          pngStatus.className = 'pill pill-danger';
          pngResult.innerHTML = `<div style="color:var(--danger);">${esc(res.error)}</div>`;
          showFormError(errBox, res.error, toast);
          return;
        }

        revokeGeneratedUrl();
        generatedBlobUrl = URL.createObjectURL(res.blob);
        generatedFile = res.file;
        generatedFileName = res.fileName;

        pngStatus.textContent = `已就绪 · ${formatBytes(res.blob.size)}`;
        pngStatus.className = 'pill pill-sage';
        pngResult.innerHTML = `
          <img id="share-generated-png" src="${generatedBlobUrl}" alt="生成的分享图" style="width:100%;height:auto;border-radius:14px;display:block;border:1px solid var(--border-subtle);" />
          <div class="muted-note" style="margin-top:6px;text-align:center;">长按上方图片可直接在 iPhone Safari 选择“存储到照片”</div>
        `;
        shareBtn.disabled = false;
        downloadBtn.disabled = false;
      };

      body.querySelectorAll('[data-share-type]').forEach((btn) => {
        btn.addEventListener('click', () => {
          shareOpts.cardType = btn.dataset.shareType;
          body.querySelectorAll('[data-share-type]').forEach((b) => b.classList.toggle('is-active', b === btn));
          rebuildPng();
        });
      });
      body.querySelectorAll('[data-share-opt]').forEach((cb) => {
        cb.addEventListener('change', () => {
          shareOpts[cb.dataset.shareOpt] = cb.checked;
          rebuildPng();
        });
      });

      shareBtn?.addEventListener('click', () => {
        errBox.style.display = 'none';
        if (!generatedBlobUrl) {
          toast('分享图片尚未生成完成，请稍候');
          return;
        }
        const canNativeFileShare =
          generatedFile &&
          typeof navigator !== 'undefined' &&
          typeof navigator.share === 'function' &&
          (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [generatedFile] }));

        if (canNativeFileShare) {
          // 同步在点击手势内发起 navigator.share，避免 iOS Safari 判定丢失用户手势
          navigator
            .share({
              files: [generatedFile],
              title: `${look.name} · 妆匣 BeautyBox`,
            })
            .then(() => {
              toast('已呼出系统分享面板（可选择“存储图像”保存到相册）');
            })
            .catch((err) => {
              if (err?.name === 'AbortError') {
                toast('已取消分享；您仍可长按上方 PNG 图片保存到相册');
                return;
              }
              recordDiagnostic('share_card_native_share_failed', err, {
                entityType: 'look_share_card',
                cardType: shareOpts.cardType,
              });
              triggerDownload();
              toast('系统分享未调起，已改为下载 PNG，也可直接长按上方图片存储');
            });
          return;
        }

        triggerDownload();
        pngResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast('已生成并下载白名单分享 PNG（iPhone Safari 也可长按上方图片存储到照片）');
      });

      downloadBtn?.addEventListener('click', () => {
        if (triggerDownload()) {
          toast(`已下载 ${generatedFileName}`);
        }
      });

      rebuildPng();
    },
  });
}

export function bindLooksEvents(container, { store, viewState, actions, sheet, dialog, toast }) {
  container.querySelector('#looks-search-input')?.addEventListener('input', (e) => {
    viewState.search = e.target.value;
    actions.rerender({ preserveFocusId: 'looks-search-input' });
  });

  container.querySelectorAll('[data-looks-style]').forEach((el) => {
    el.addEventListener('click', () => {
      viewState.styleFilter = el.dataset.looksStyle;
      actions.rerender();
    });
  });

  container.querySelector('[data-looks-clear]')?.addEventListener('click', () => {
    viewState.search = '';
    viewState.styleFilter = 'all';
    actions.rerender();
  });

  container.querySelectorAll('[data-looks-open]').forEach((el) => {
    el.addEventListener('click', () => {
      viewState.selectedLookId = el.dataset.looksOpen;
      actions.rerender();
    });
  });

  container.querySelector('[data-looks-back]')?.addEventListener('click', () => {
    viewState.selectedLookId = null;
    actions.rerender();
  });

  container.querySelectorAll('[data-looks-add]').forEach((el) => {
    el.addEventListener('click', () => {
      openLookFormSheet({
        store,
        sheet,
        dialog,
        toast,
        onSaved: (look) => {
          viewState.selectedLookId = look.id;
          actions.rerender();
        },
      });
    });
  });

  container.querySelector('[data-looks-edit]')?.addEventListener('click', (e) => {
    openLookFormSheet({
      store,
      sheet,
      dialog,
      toast,
      lookId: e.currentTarget.dataset.looksEdit,
      onSaved: () => actions.rerender(),
    });
  });

  container.querySelector('[data-looks-add-wear]')?.addEventListener('click', (e) => {
    openWearReviewSheet({
      store,
      sheet,
      toast,
      lookId: e.currentTarget.dataset.looksAddWear,
      onSaved: () => actions.rerender(),
    });
  });

  container.querySelector('[data-looks-share]')?.addEventListener('click', (e) => {
    openSharePreviewSheet({
      store,
      sheet,
      toast,
      lookId: e.currentTarget.dataset.looksShare,
    });
  });

  container.querySelector('[data-looks-open-trash]')?.addEventListener('click', () => {
    viewState.showTrash = true;
    viewState.selectedLookId = null;
    actions.rerender();
  });

  container.querySelector('[data-looks-trash-back]')?.addEventListener('click', () => {
    viewState.showTrash = false;
    actions.rerender();
  });

  container.querySelector('[data-looks-soft-delete]')?.addEventListener('click', async (e) => {
    const lookId = e.currentTarget.dataset.looksSoftDelete;
    const look = store.state.looks.find((l) => l.id === lookId);
    if (!look) return;
    const ok = await dialog.confirm({
      title: '移入回收站',
      message: `确定要删除妆容「${look.name}」吗？删除后将移入回收站保留 7 天，7 天内可恢复，不会删除关联产品。`,
      confirmLabel: '移入回收站',
      danger: true,
    });
    if (!ok) return;
    const res = store.softDeleteLook(lookId);
    if (!res.ok) {
      toast(res.error || '删除失败');
      return;
    }
    viewState.selectedLookId = null;
    toast('已移入妆容回收站（保留 7 天）');
    actions.rerender();
  });

  container.querySelectorAll('[data-look-restore]').forEach((el) => {
    el.addEventListener('click', () => {
      const res = store.restoreLookFromTrash(el.dataset.lookRestore);
      if (res.ok) {
        toast('已恢复该妆容记录');
        actions.rerender();
      }
    });
  });

  container.querySelectorAll('[data-look-purge]').forEach((el) => {
    el.addEventListener('click', async () => {
      const lookId = el.dataset.lookPurge;
      const look = store.state.looks.find((l) => l.id === lookId);
      if (!look) return;
      const firstOk = await dialog.confirm({
        title: '提前永久删除（第 1 步确认）',
        message: `确定要提前永久删除妆容「${look.name}」吗？永久删除后将无法恢复。`,
        confirmLabel: '继续确认',
        danger: true,
      });
      if (!firstOk) return;
      const secondOk = await dialog.confirm({
        title: '不可撤销操作（第 2 次确认）',
        message: `二次确认：即将永久清除「${look.name}」及关联持妆节点。关联产品仍会保留；图片仅在无其他记录引用时才会清理。确认永久删除？`,
        confirmLabel: '确认永久删除',
        danger: true,
      });
      if (!secondOk) return;
      const res = await store.permanentlyDeleteLook(lookId);
      if (!res.ok) {
        toast(res.error || '永久删除失败');
        return;
      }
      toast('已永久删除该妆容');
      actions.rerender();
    });
  });
}
