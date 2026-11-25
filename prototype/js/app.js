/**
 * 妆匣 BeautyBox · 浏览器交互原型（TASK 02）
 * 应用主控：路由、五 Tab 切换、首次启动本地引导、Sheet/Dialog/Toast 协调
 */

import { PrototypeStore } from './store.js';
import {
  TAB_ICONS,
  createDialogManager,
  createSheetManager,
  createToastManager,
  esc,
} from './components/ui.js';
import { bindHomeEvents, renderHomeView } from './views/homeView.js';
import {
  bindBoxEvents,
  openItemFormSheet,
  openProductFormSheet,
  renderBoxView,
} from './views/boxView.js';
import {
  bindLooksEvents,
  openLookFormSheet,
  renderLooksView,
} from './views/looksView.js';
import {
  bindDailyEvents,
  openNewDiarySheet,
  renderDailyView,
} from './views/dailyView.js';
import { bindMeEvents, renderMeView } from './views/meView.js';

const TABS = [
  { id: 'home', label: '首页', icon: TAB_ICONS.home },
  { id: 'box', label: '妆匣', icon: TAB_ICONS.box },
  { id: 'looks', label: '妆容', icon: TAB_ICONS.looks },
  { id: 'daily', label: '日常', icon: TAB_ICONS.daily },
  { id: 'me', label: '我的', icon: TAB_ICONS.me },
];

const store = new PrototypeStore();

const headerEl = document.getElementById('app-header');
const mainEl = document.getElementById('app-main');
const tabBarEl = document.getElementById('tab-bar');
const sheet = createSheetManager(document.getElementById('sheet-root'));
const dialog = createDialogManager(document.getElementById('dialog-root'));
const toast = createToastManager(document.getElementById('toast-root'));
const shellEl = document.getElementById('app-shell');

document.getElementById('toggle-wide-btn')?.addEventListener('click', (e) => {
  const isWide = shellEl.classList.toggle('is-wide');
  e.currentTarget.textContent = isWide ? '切回手机视口' : '切换宽屏浏览';
});

const uiState = {
  activeTab: 'home',
  box: {
    search: '',
    categoryId: 'all',
    statusFilter: 'all',
    sortBy: 'updated',
    viewMode: 'grid',
    selectedProductId: null,
  },
  looks: {
    search: '',
    styleFilter: 'all',
    selectedLookId: null,
    showTrash: false,
  },
  daily: {
    subTab: 'routine',
    selectedDate: '',
  },
};

function setHeader({ title, subtitle = '', backBtnAttr = '', actionsHtml = '' }) {
  headerEl.innerHTML = `
    <div class="header-left">
      ${backBtnAttr ? `<button type="button" class="icon-btn" ${backBtnAttr} aria-label="返回">← 返回</button>` : ''}
      <div class="header-title-wrap">
        <h1 class="header-title">${esc(title)}</h1>
        ${subtitle ? `<div class="header-subtitle">${esc(subtitle)}</div>` : ''}
      </div>
    </div>
    <div class="header-actions">${actionsHtml}</div>
  `;
}

function renderTabBar() {
  tabBarEl.innerHTML = TABS.map(
    (t) => `
    <button type="button" class="tab-btn ${uiState.activeTab === t.id ? 'is-active' : ''}" data-tab="${t.id}">
      ${t.icon}
      <span>${t.label}</span>
    </button>
  `,
  ).join('');

  tabBarEl.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.tab;
      if (uiState.activeTab === next) {
        if (next === 'box') uiState.box.selectedProductId = null;
        if (next === 'looks') {
          uiState.looks.selectedLookId = null;
          uiState.looks.showTrash = false;
        }
      }
      uiState.activeTab = next;
      render();
    });
  });
}

const actions = {
  rerender: (opts) => render(opts),
  goTab: (tabId, patch = {}) => {
    uiState.activeTab = tabId;
    if (tabId === 'box') Object.assign(uiState.box, patch);
    if (tabId === 'looks') Object.assign(uiState.looks, patch);
    if (tabId === 'daily') {
      const { openQuickAdd, ...rest } = patch;
      Object.assign(uiState.daily, rest);
      render();
      if (openQuickAdd) {
        openNewDiarySheet({ store, sheet, toast, onSaved: () => render() });
      }
      return;
    }
    render();
  },
  openNewProduct: () => {
    openProductFormSheet({
      store,
      sheet,
      toast,
      onSaved: (product, { andAddItem }) => {
        uiState.activeTab = 'box';
        uiState.box.selectedProductId = product.id;
        render();
        if (andAddItem) {
          openItemFormSheet({
            store,
            sheet,
            toast,
            productId: product.id,
            onSaved: () => render(),
          });
        }
      },
    });
  },
  openNewLook: () => {
    openLookFormSheet({
      store,
      sheet,
      dialog,
      toast,
      onSaved: (look) => {
        uiState.activeTab = 'looks';
        uiState.looks.selectedLookId = look.id;
        render();
      },
    });
  },
};

function render({ preserveFocusId = null } = {}) {
  const ctx = { setHeader };
  let html = '';
  let bindFn = null;

  if (uiState.activeTab === 'home') {
    html = renderHomeView({ store, ctx, actions });
    bindFn = (el) => bindHomeEvents(el, { store, actions, sheet });
  } else if (uiState.activeTab === 'box') {
    html = renderBoxView({ store, viewState: uiState.box, ctx });
    bindFn = (el) => bindBoxEvents(el, { store, viewState: uiState.box, actions, sheet, dialog, toast });
  } else if (uiState.activeTab === 'looks') {
    html = renderLooksView({ store, viewState: uiState.looks, ctx });
    bindFn = (el) => bindLooksEvents(el, { store, viewState: uiState.looks, actions, sheet, dialog, toast });
  } else if (uiState.activeTab === 'daily') {
    html = renderDailyView({ store, viewState: uiState.daily, ctx });
    bindFn = (el) => bindDailyEvents(el, { store, viewState: uiState.daily, actions, sheet, toast });
  } else {
    html = renderMeView({ store, ctx });
    bindFn = (el) => bindMeEvents(el, { store, actions, sheet, dialog, toast });
  }

  mainEl.innerHTML = html;
  renderTabBar();

  // 头部返回按钮与动作按钮绑定也包含进来
  if (bindFn) {
    bindFn(mainEl);
    bindFn(headerEl);
  }

  if (preserveFocusId) {
    const el = document.getElementById(preserveFocusId);
    if (el) {
      el.focus();
      const len = el.value.length;
      if (typeof el.setSelectionRange === 'function') {
        el.setSelectionRange(len, len);
      }
    }
  } else {
    mainEl.scrollTop = 0;
  }
}

function showOnboardingIfNeeded() {
  if (store.state.settings.onboardingDismissed) return;
  sheet.open({
    title: '欢迎体验 · 妆匣 BeautyBox',
    bodyHtml: `
      <div class="stack">
        <div class="card">
          <div style="font-weight:700;font-size:15px;margin-bottom:6px;">本地优先 · 无需登录 · 隐私自主</div>
          <div class="muted-note" style="line-height:1.65;">
            • 所有产品档案、购买批次、开封日期、妆容与日常记录默认保存在本地，无登录墙。<br/>
            • 本网页为 <strong>TASK 02 浏览器交互原型</strong>：模拟数据保存在 <code>localStorage</code>，您选中的照片保存在 <code>IndexedDB</code>，与正式 iOS 原生工程隔离。
          </div>
        </div>
        <button type="button" class="btn btn-primary btn-block" id="btn-start-prototype">开始使用</button>
      </div>
    `,
    onMount: (body, close) => {
      body.querySelector('#btn-start-prototype')?.addEventListener('click', () => {
        store.updateSettings({ onboardingDismissed: true });
        close();
      });
    },
    onClose: () => {
      if (!store.state.settings.onboardingDismissed) {
        store.updateSettings({ onboardingDismissed: true });
      }
    },
  });
}

// 启动时检查回收站过期妆容（>= 7 天自动永久删除），再渲染并异步恢复 IndexedDB 图片 Blob
const startupPurgePromise = store.purgeExpiredLooks();
render();
showOnboardingIfNeeded();
startupPurgePromise.then(({ purgedCount }) => {
  if (purgedCount > 0) {
    render();
    toast(`启动检查：已自动永久清理 ${purgedCount} 条到期回收站妆容`);
  }
});
store.hydrateMedia().then(({ restored, missingIds }) => {
  if (restored > 0) render();
  if (missingIds.length > 0) {
    toast(`有 ${missingIds.length} 张本地图片缓存未能恢复`);
  }
});
