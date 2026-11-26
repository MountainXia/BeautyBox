/**
 * 妆匣 BeautyBox · 浏览器交互原型（TASK 02）
 * Tab 1：首页（资产概览、独立计数、分币种历史消费、临期提醒、近期妆容与日常）
 */

import { CURRENCIES, formatMinor } from '../currency.js';
import { todayStr } from '../expiry.js';
import { buildCategoryPlaceholderUrl } from '../assets.js';
import { esc, renderEmptyState, renderStars } from '../components/ui.js';

function greetingText() {
  const h = new Date().getHours();
  if (h < 11) return '早安';
  if (h < 14) return '午安';
  if (h < 19) return '下午好';
  return '晚安';
}

export function renderHomeView({ store, ctx, actions }) {
  const today = todayStr();
  const summary = store.getHomeSummary(today);
  const isCompletelyEmpty =
    summary.productCount === 0 &&
    summary.totalItemCount === 0 &&
    store.state.looks.length === 0 &&
    store.state.routineLogs.length === 0 &&
    store.state.skinDiaries.length === 0;

  ctx.setHeader({
    title: '妆匣 BeautyBox',
    subtitle: `${greetingText()} · ${today}`,
    actionsHtml: `<span class="pill pill-sage">纯本地 · 无账号</span>`,
  });

  if (isCompletelyEmpty) {
    return `
      <div class="stack">
        <div class="card">
          <div class="row-between">
            <div>
              <div style="font-weight:700;font-size:16px;">准备开始整理你的妆匣</div>
              <div class="muted-note" style="margin-top:4px;">默认本地存储，无需注册或登录即可随时记录。</div>
            </div>
          </div>
          <div class="row-wrap" style="margin-top:12px;">
            <button type="button" class="btn btn-primary btn-sm" data-home-add-product="1">+ 添加第一件产品</button>
            <button type="button" class="btn btn-secondary btn-sm" data-home-go-me="1">恢复演示数据</button>
          </div>
        </div>
        ${renderEmptyState({
          icon: '✦',
          title: '妆匣还是空的',
          desc: '先添加一件正在使用的粉底液或唇膏，再为它登记具体购买批次与开封日期。',
          actionLabel: '添加第一件产品',
          actionAttr: 'data-home-add-product="1"',
        })}
      </div>
    `;
  }

  const maxHeldInCat = Math.max(1, ...summary.categoryStats.map((c) => c.heldCount));

  return `
    <div class="stack" style="padding-bottom:68px;">
      <!-- 资产概览：纯中文简洁计数 + 小问号解释 -->
      <div class="card">
        <div class="section-header">
          <div class="row" style="gap:6px;">
            <h2 class="section-title">资产概览</h2>
            <button type="button" class="help-icon-btn" id="home-overview-help" aria-label="查看资产概览说明">?</button>
          </div>
          <span class="section-hint">款式与件数分开统计</span>
        </div>
        <div class="kpi-grid">
          <button type="button" class="kpi-box" data-home-go-box="all">
            <div class="kpi-num">${summary.productCount}</div>
            <div class="kpi-label">产品款式</div>
          </button>
          <button type="button" class="kpi-box" data-home-go-box="held">
            <div class="kpi-num">${summary.heldItemCount}</div>
            <div class="kpi-label">当前持有件数</div>
          </button>
        </div>

        <div class="divider"></div>

        ${summary.nearExpiryConfigured ? `
          <div class="row-between" style="gap:8px;">
            <div class="row-wrap">
              <span class="pill ${summary.nearExpiryItems.length > 0 ? 'pill-amber' : 'pill-sage'}">
                ${summary.nearDays} 天内临期：${summary.nearExpiryItems.length} 件
              </span>
              ${summary.expiredItems.length > 0
                ? `<span class="pill pill-danger">已过期：${summary.expiredItems.length} 件</span>`
                : ''}
              ${summary.pendingStatusCount + summary.incompleteExpiryCount > 0
                ? `<span class="pill">待补充 ${summary.pendingStatusCount + summary.incompleteExpiryCount} 件</span>`
                : ''}
            </div>
            <button type="button" class="btn btn-secondary btn-sm" data-home-go-box="${summary.nearExpiryItems.length > 0 || summary.expiredItems.length > 0 ? 'near' : 'pending'}">
              查看详情
            </button>
          </div>
        ` : `
          <div class="row-between" style="gap:8px;">
            <div>
              <div style="font-size:13px;font-weight:600;">临期提醒阈值：未设置</div>
              <div class="muted-note">文档未默认规定临期天数，需您在设置中自行指定${summary.expiredItems.length > 0 ? `（当前已有 ${summary.expiredItems.length} 件已过期）` : ''}。</div>
            </div>
            <button type="button" class="btn btn-soft btn-sm" data-home-set-near="1">去设置</button>
          </div>
        `}
        ${summary.pendingStatusCount + summary.incompleteExpiryCount > 0 ? `
          <div class="divider"></div>
          <div class="row-between" style="gap:8px;">
            <div class="muted-note">
              ${[
                summary.pendingStatusCount > 0 ? `待记录使用状态 ${summary.pendingStatusCount} 件` : '',
                summary.incompleteExpiryCount > 0 ? `有效期信息待完善 ${summary.incompleteExpiryCount} 件` : '',
              ].filter(Boolean).join(' · ')}
            </div>
            <button type="button" class="ghost-mini-btn" data-home-go-box="pending">去补充 ›</button>
          </div>
        ` : ''}
      </div>

      <!-- 资产总额（极简 1~2 行；币种切换在「我的」设置） -->
      <div class="card">
        <div class="row-between" style="gap:10px;">
          <div>
            <div class="section-title">资产总额</div>
            <div class="muted-note" style="margin-top:2px;">
              ${esc(CURRENCIES[summary.selectedCurrency]?.name || summary.selectedCurrency)} · ${summary.selectedCurrencyTotal.count} 条记录
            </div>
          </div>
          <div style="text-align:right;">
            <div class="currency-amount">${esc(formatMinor(summary.selectedCurrencyTotal.minor, summary.selectedCurrencyTotal.currencyCode, { showCode: false }))}</div>
            <button type="button" class="ghost-mini-btn" id="home-all-currencies-btn" style="margin-top:4px;">各币种明细 ›</button>
          </div>
        </div>
      </div>

      <!-- 分类持有分布 -->
      <div class="card">
        <div class="section-header">
          <h2 class="section-title">分类分布</h2>
          <span class="section-hint">按当前持有件数</span>
        </div>
        ${summary.categoryStats.length === 0
          ? `<div class="muted-note">暂无分类分布数据。</div>`
          : `
            <div class="stack-sm">
              ${summary.categoryStats
                .map((row) => {
                  const pct = Math.round((row.heldCount / maxHeldInCat) * 100);
                  return `
                    <button type="button" class="list-item-btn" data-home-cat="${esc(row.category.id)}" style="padding:8px 0;">
                      <div style="flex:1;">
                        <div class="row-between" style="margin-bottom:5px;">
                          <span style="font-weight:600;font-size:13px;">${esc(row.category.name)}</span>
                          <span class="muted-note">${row.productCount} 款资料 · ${row.heldCount} 件持有</span>
                        </div>
                        <div class="progress-track">
                          <div class="progress-fill" style="width:${pct}%;"></div>
                        </div>
                      </div>
                    </button>
                  `;
                })
                .join('')}
            </div>
          `}
      </div>

      <!-- 近期妆容 -->
      <div>
        <div class="section-header">
          <h2 class="section-title">近期妆容</h2>
          <button type="button" class="ghost-mini-btn" data-home-go-looks="1">全部妆容</button>
        </div>
        ${summary.recentLooks.length === 0
          ? renderEmptyState({
              icon: '✧',
              title: '还没有妆容记录',
              desc: '记录今天用的粉底、眼影与唇膏，生成可追溯的妆容档案。',
              actionLabel: '记录第一次妆容',
              actionAttr: 'data-home-add-look="1"',
            })
          : `
            <div class="h-scroll">
              ${summary.recentLooks
                .map((look) => {
                  const coverUrl = (look.coverAssetId && store.getAssetUrl(look.coverAssetId)) || buildCategoryPlaceholderUrl('妆容');
                  const itemCount = store.state.lookProductItems.filter((lpi) => lpi.lookId === look.id).length;
                  return `
                    <button type="button" class="look-mini-card" data-home-look="${esc(look.id)}">
                      <img src="${coverUrl}" alt="${esc(look.name)}" />
                      <div style="padding:9px 10px;">
                        <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(look.name)}</div>
                        <div class="muted-note" style="margin-top:2px;">${esc(look.lookDate)} · ${itemCount} 件</div>
                        <div style="font-size:11px;color:var(--accent);margin-top:3px;">${renderStars(look.selfRating)}</div>
                      </div>
                    </button>
                  `;
                })
                .join('')}
            </div>
          `}
      </div>

      <!-- 近期日常记录 -->
      <div class="card">
        <div class="section-header">
          <h2 class="section-title">近期日常记录</h2>
          <button type="button" class="ghost-mini-btn" data-home-go-daily="1">进入日常</button>
        </div>
        ${summary.recentDaily.length === 0
          ? `<div class="muted-note">暂无日常打卡、单品使用或肌肤日记记录。</div>`
          : `
            <div class="stack-sm">
              ${summary.recentDaily
                .map(
                  (entry) => `
                <button type="button" class="list-item-btn" data-home-daily-kind="${esc(entry.kind)}">
                  <div style="min-width:0;flex:1;">
                    <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(entry.title)}</div>
                    <div class="muted-note" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(entry.subtitle)}</div>
                  </div>
                  <span class="pill">${esc(entry.date)}</span>
                </button>
              `,
                )
                .join('')}
            </div>
          `}
      </div>
    </div>

    <!-- 首页悬浮快速记录按钮（FAB） -->
    <div id="home-fab-backdrop" class="fab-backdrop" style="display:none;"></div>
    <div class="fab-wrap">
      <div id="home-fab-menu" class="fab-menu" style="display:none;">
        <button type="button" class="fab-menu-item" data-home-add-product="1">＋ 添加产品</button>
        <button type="button" class="fab-menu-item" data-home-add-look="1">✦ 记妆容</button>
        <button type="button" class="fab-menu-item" data-home-add-daily="1">◷ 记日常</button>
      </div>
      <button type="button" class="fab-btn" id="home-fab-btn" aria-label="快速记录" aria-expanded="false">+</button>
    </div>
  `;
}

export function bindHomeEvents(container, { store, actions, sheet }) {
  const fabBtn = container.querySelector('#home-fab-btn');
  const fabMenu = container.querySelector('#home-fab-menu');
  const fabBackdrop = container.querySelector('#home-fab-backdrop');

  const setFabOpen = (open) => {
    if (!fabBtn || !fabMenu || !fabBackdrop) return;
    fabMenu.style.display = open ? 'flex' : 'none';
    fabBackdrop.style.display = open ? 'block' : 'none';
    fabBtn.classList.toggle('is-open', open);
    fabBtn.setAttribute('aria-expanded', String(open));
  };

  fabBtn?.addEventListener('click', () => {
    const isOpen = fabBtn.classList.contains('is-open');
    setFabOpen(!isOpen);
  });
  fabBackdrop?.addEventListener('click', () => setFabOpen(false));

  container.querySelector('#home-overview-help')?.addEventListener('click', () => {
    sheet?.open({
      title: '产品款式与持有件数说明',
      bodyHtml: `
        <div class="stack">
          <div class="card">
            <div style="font-weight:700;margin-bottom:4px;">产品款式</div>
            <div class="muted-note" style="line-height:1.6;">统计您当前拥有的美妆产品款式数量（同一款口红只算 1 款）。</div>
          </div>
          <div class="card">
            <div style="font-weight:700;margin-bottom:4px;">当前持有件数</div>
            <div class="muted-note" style="line-height:1.6;">统计您手头实际持有的件数总和（含未记录、未开封、使用中；已用完或已移除不再计入）。</div>
          </div>
        </div>
      `,
    });
  });

  container.querySelector('#home-all-currencies-btn')?.addEventListener('click', () => {
    const summary = store.getHomeSummary(todayStr());
    if (!sheet) return;
    sheet.open({
      title: '各币种资产明细',
      bodyHtml: `
        <div class="stack">
          <div class="form-banner-info">
            不同币种分别独立统计，不做汇率换算，也不跨币种相加。首页默认展示币种可在「我的 → 首页资产币种」中切换。
          </div>
          ${summary.currencyTotals.length === 0
            ? `<div class="muted-note">暂无已记录有效金额的产品记录。</div>`
            : `
              <div class="currency-list">
                ${summary.currencyTotals
                  .map(
                    (row) => `
                  <div class="currency-row">
                    <div>
                      <div style="font-weight:700;font-size:14px;">${esc(row.currencyCode)} · ${esc(CURRENCIES[row.currencyCode]?.name || row.currencyCode)}</div>
                      <div class="muted-note">${row.count} 条记录</div>
                    </div>
                    <div class="currency-amount">${esc(formatMinor(row.minor, row.currencyCode, { showCode: false }))}</div>
                  </div>
                `,
                  )
                  .join('')}
              </div>
            `}
        </div>
      `,
    });
  });
  container.querySelectorAll('[data-home-add-product]').forEach((el) => {
    el.addEventListener('click', () => {
      setFabOpen(false);
      actions.openNewProduct();
    });
  });
  container.querySelectorAll('[data-home-add-look]').forEach((el) => {
    el.addEventListener('click', () => {
      setFabOpen(false);
      actions.openNewLook();
    });
  });
  container.querySelectorAll('[data-home-add-daily]').forEach((el) => {
    el.addEventListener('click', () => {
      setFabOpen(false);
      actions.goTab('daily', { openQuickAdd: true });
    });
  });
  container.querySelectorAll('[data-home-go-box]').forEach((el) => {
    el.addEventListener('click', () => {
      const f = el.dataset.homeGoBox;
      actions.goTab('box', { statusFilter: f, categoryId: 'all', selectedProductId: null });
    });
  });
  container.querySelectorAll('[data-home-cat]').forEach((el) => {
    el.addEventListener('click', () => {
      actions.goTab('box', { categoryId: el.dataset.homeCat, statusFilter: 'all', selectedProductId: null });
    });
  });
  container.querySelectorAll('[data-home-look]').forEach((el) => {
    el.addEventListener('click', () => {
      actions.goTab('looks', { selectedLookId: el.dataset.homeLook });
    });
  });
  container.querySelectorAll('[data-home-go-looks]').forEach((el) => {
    el.addEventListener('click', () => actions.goTab('looks', { selectedLookId: null }));
  });
  container.querySelectorAll('[data-home-go-daily]').forEach((el) => {
    el.addEventListener('click', () => actions.goTab('daily'));
  });
  container.querySelectorAll('[data-home-daily-kind]').forEach((el) => {
    el.addEventListener('click', () => {
      const kind = el.dataset.homeDailyKind;
      const subTab = kind === 'usage' ? 'usage' : kind === 'diary' ? 'diary' : 'routine';
      actions.goTab('daily', { subTab });
    });
  });
  container.querySelectorAll('[data-home-go-me], [data-home-set-near]').forEach((el) => {
    el.addEventListener('click', () => actions.goTab('me'));
  });
}
