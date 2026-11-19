/**
 * 妆匣 BeautyBox · 浏览器交互原型（TASK 02）
 * Tab 5：我的（本地数据说明、临期阈值设置、导出与模拟备份恢复、iCloud 边界说明、PRO 订阅模拟、隐私说明）
 */

import { esc, formatBytes } from '../components/ui.js';

function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const SUB_LABELS = {
  free: { label: '免费版（默认）', pill: 'pill-sage', desc: '全部核心记账、拍照、导出与备份能力完整可用。' },
  pro: { label: 'PRO 订阅中（仅交互模拟）', pill: 'pill-accent', desc: '商业化定价与额度尚待确认，当前为界面状态模拟，不涉及 StoreKit 2 真实扣款。' },
  expired: { label: 'PRO 已过期（仅交互模拟）', pill: 'pill-amber', desc: '订阅过期后，您仍可永久查看、搜索、导出及恢复全部已有数据，绝不锁死历史记录。' },
};

export function renderMeView({ store, ctx }) {
  const mediaStats = store.getMediaStats();
  const sub = SUB_LABELS[store.state.settings.simulatedSubscription] || SUB_LABELS.free;
  const nearDays = store.state.settings.nearExpiryDays;

  ctx.setHeader({
    title: '我的',
    subtitle: '本地模式 · 数据与隐私设置',
    actionsHtml: `<span class="pill">无账号</span>`,
  });

  return `
    <div class="stack">
      <!-- 本地模式声明 -->
      <div class="card">
        <div class="row-between" style="margin-bottom:6px;">
          <strong style="font-size:16px;">本地模式，数据保存在本机</strong>
          <span class="pill pill-sage">100% 离线</span>
        </div>
        <div class="muted-note" style="line-height:1.6;">
          无注册、无登录、无云端用户账号。当前浏览器原型将业务模拟数据保存在 <code>localStorage</code>，将您实际选择的图片以 <code>Blob</code> 保存在浏览器 <code>IndexedDB</code>（不存 Base64）。正式 iOS 版将保存在 iPhone App 私有沙盒（SQLite + GRDB）。
        </div>
      </div>

      <!-- 订阅状态模拟（明确标注非 StoreKit 2） -->
      <div class="card">
        <div class="row-between" style="margin-bottom:8px;">
          <h2 class="section-title">会员状态（交互模拟 · 非 StoreKit 2）</h2>
          <span class="pill ${sub.pill}">${esc(sub.label)}</span>
        </div>
        <div class="muted-note" style="margin-bottom:10px;">${esc(sub.desc)}</div>
        <div class="segmented" style="margin-bottom:10px;">
          <button type="button" class="seg-btn ${store.state.settings.simulatedSubscription === 'free' ? 'is-active' : ''}" data-me-sub="free">免费版</button>
          <button type="button" class="seg-btn ${store.state.settings.simulatedSubscription === 'pro' ? 'is-active' : ''}" data-me-sub="pro">PRO 激活</button>
          <button type="button" class="seg-btn ${store.state.settings.simulatedSubscription === 'expired' ? 'is-active' : ''}" data-me-sub="expired">订阅过期</button>
        </div>
        <div class="muted-note">提示：切换到“订阅过期”后，下方所有查看与导出按钮依然保持完全可用。</div>
      </div>

      <!-- 临期阈值设置 -->
      <div class="card">
        <div class="row-between" style="margin-bottom:8px;">
          <h2 class="section-title">临期提醒阈值</h2>
          <span class="pill ${nearDays ? 'pill-amber' : ''}">${nearDays ? `${nearDays} 天内临期` : '未设置'}</span>
        </div>
        <div class="muted-note" style="margin-bottom:10px;">
          正式文档未擅自规定默认临期天数，因此原型默认“未设置”。您可以手动选择阈值以在首页和妆匣预览临期筛选效果：
        </div>
        <div class="row-wrap">
          <button type="button" class="chip ${nearDays === 30 ? 'is-active' : ''}" data-me-near="30">30 天内</button>
          <button type="button" class="chip ${nearDays === 60 ? 'is-active' : ''}" data-me-near="60">60 天内</button>
          <button type="button" class="chip ${nearDays === 90 ? 'is-active' : ''}" data-me-near="90">90 天内</button>
          <button type="button" class="chip ${!nearDays ? 'is-active' : ''}" data-me-near="">不设置</button>
        </div>
      </div>

      <!-- 数据统计、导出与模拟备份 -->
      <div class="card">
        <div class="section-header">
          <h2 class="section-title">数据管理、导出与备份</h2>
          <span class="section-hint">免费开放</span>
        </div>
        <div class="card-muted" style="font-size:13px;margin-bottom:12px;">
          <div>产品主档：${store.state.products.length} 款 ｜ 持有实例：${store.state.productItems.length} 件 ｜ 妆容：${store.state.looks.length} 篇</div>
          <div style="margin-top:4px;">IndexedDB 实选图片：${mediaStats.idbCount} 张（${formatBytes(mediaStats.totalBytes)}）｜ 内置离线示例图：${mediaStats.sampleCount} 张</div>
          <div style="margin-top:4px;">最近模拟备份：${store.state.settings.lastMockBackupAt ? esc(store.state.settings.lastMockBackupAt.slice(0, 19).replace('T', ' ')) : '尚未生成'}</div>
        </div>

        <div class="stack-sm">
          <div class="field-row">
            <button type="button" class="btn btn-secondary btn-sm" id="me-export-json">导出 JSON</button>
            <button type="button" class="btn btn-secondary btn-sm" id="me-export-csv">导出实例 CSV</button>
          </div>
          <button type="button" class="btn btn-soft btn-block" id="me-mock-backup">生成模拟 .beautyboxbackup 清单包</button>
          <button type="button" class="btn btn-secondary btn-block" id="me-mock-restore">从备份文件恢复（交互模拟）</button>
          <button type="button" class="btn btn-secondary btn-block" id="me-icloud-info">iCloud 与整机备份边界说明（默认关闭）</button>
        </div>
      </div>

      <!-- 隐私与原生边界说明 -->
      <div class="card">
        <div class="section-header">
          <h2 class="section-title">隐私说明与原型能力边界</h2>
        </div>
        <div class="stack-sm" style="font-size:13px;color:var(--text-secondary);line-height:1.6;">
          <div>• <strong>无默认上传</strong>：不接入任何服务器、无埋点采集、不连接在线汇率或外部 API。</div>
          <div>• <strong>白名单分享</strong>：分享卡片预览默认排除价格、购买渠道、私人备注与肌肤日记。</div>
          <div>• <strong>原生 iOS 能力未在本原型实现（需 Mac/Xcode 与真机实测）</strong>：SQLite + GRDB、<code>isExcludedFromBackup</code> 系统备份排除、PHPicker/相机权限、<code>UIDocumentPicker</code> 与 iCloud Drive、StoreKit 2 沙盒购买与本地通知。</div>
        </div>
      </div>

      <!-- 重置与清空模拟数据 -->
      <div class="card">
        <div class="section-header">
          <h2 class="section-title">原型数据重置与清空</h2>
          <span class="section-hint">同步清理 IndexedDB</span>
        </div>
        <div class="field-row">
          <button type="button" class="btn btn-secondary btn-sm" id="me-reset-seed">恢复演示数据</button>
          <button type="button" class="btn btn-danger btn-sm" id="me-clear-all">清空全部模拟数据</button>
        </div>
      </div>
    </div>
  `;
}

export function bindMeEvents(container, { store, actions, sheet, dialog, toast }) {
  container.querySelectorAll('[data-me-sub]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.updateSettings({ simulatedSubscription: btn.dataset.meSub });
      toast('已切换模拟会员状态（仅用于验证订阅过期不锁数据）');
      actions.rerender();
    });
  });

  container.querySelectorAll('[data-me-near]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.meNear;
      store.updateSettings({ nearExpiryDays: val ? Number.parseInt(val, 10) : null });
      toast(val ? `已设置临期阈值为 ${val} 天` : '已清除临期阈值（恢复未设置状态）');
      actions.rerender();
    });
  });

  container.querySelector('#me-export-json')?.addEventListener('click', () => {
    const json = store.buildExportJson();
    triggerDownload(`beautybox-prototype-${Date.now()}.json`, json, 'application/json;charset=utf-8');
    toast('已导出模拟业务数据 JSON');
  });

  container.querySelector('#me-export-csv')?.addEventListener('click', () => {
    const csv = store.buildProductItemsCsv();
    triggerDownload(`beautybox-items-${Date.now()}.csv`, csv, 'text/csv;charset=utf-8');
    toast('已导出产品实例 CSV（含币种与最小货币单位）');
  });

  container.querySelector('#me-mock-backup')?.addEventListener('click', () => {
    const pkg = store.buildMockBackupPackageJson();
    triggerDownload(`beautybox-mock-${Date.now()}.beautyboxbackup.json`, pkg, 'application/json;charset=utf-8');
    toast('已生成模拟备份清单（正式版为含 SQLite+Media 的 ZIP 包）');
    actions.rerender();
  });

  container.querySelector('#me-mock-restore')?.addEventListener('click', () => {
    sheet.open({
      title: '从备份恢复（交互模拟 · 非原生文件选择器）',
      bodyHtml: `
        <div class="stack">
          <div class="form-banner-info">
            此弹窗仅演示正式 iOS 版恢复流程的交互步骤，浏览器原型不挂载原生 <code>UIDocumentPickerViewController</code> 或安全点目录。
          </div>
          <div class="card">
            <div style="font-weight:700;margin-bottom:6px;">正式原生恢复安全流程（ADR-0001）</div>
            <div class="muted-note" style="line-height:1.65;">
              1. 用户通过系统文件选择器主动选取 <code>.beautyboxbackup</code> 文件；<br/>
              2. 校验 <code>manifest.json</code> 格式版本与 <code>schema_version</code>（拒绝不兼容降级）；<br/>
              3. 校验数据库与媒体文件 SHA-256 完整性及剩余磁盘空间；<br/>
              4. <strong>自动创建本地安全点（Safepoint）</strong>；<br/>
              5. 执行原子替换；若失败则立即从安全点回滚，绝不损坏原数据。
            </div>
          </div>
          <button type="button" class="btn btn-primary btn-block" id="mock-restore-ok">模拟校验并完成演示</button>
        </div>
      `,
      onMount: (body, close) => {
        body.querySelector('#mock-restore-ok')?.addEventListener('click', () => {
          close();
          toast('已完成恢复流程交互演示（实际文件恢复需 Mac/Xcode 真机实测）');
        });
      },
    });
  });

  container.querySelector('#me-icloud-info')?.addEventListener('click', () => {
    sheet.open({
      title: 'iCloud 与整机备份边界（仅交互说明）',
      bodyHtml: `
        <div class="stack">
          <div class="card">
            <div class="row-between" style="margin-bottom:6px;">
              <strong>App 内 iCloud 备份开关</strong>
              <span class="pill">默认关闭</span>
            </div>
            <div class="muted-note" style="line-height:1.65;">
              • V1 <strong>不做 CloudKit</strong>，也不做自动多设备实时同步。<br/>
              • 采用用户主动生成 <code>.beautyboxbackup</code> 备份包，并通过系统文件选择器自行决定是否保存到 iCloud Drive 或本机位置。<br/>
              • 若保存到 iCloud Drive，文件在多设备间的传输由苹果 iCloud Drive 机制决定，不得将其宣传为单纯的“手动备份”。
            </div>
          </div>
          <div class="card">
            <div class="row-between" style="margin-bottom:6px;">
              <strong>iOS 整机自动备份排除策略</strong>
              <span class="pill pill-amber">待 Mac/真机实测</span>
            </div>
            <div class="muted-note" style="line-height:1.65;">
              为遵守“默认纯本地不上传”，正式原生工程必须对本地数据库、媒体目录及安全点设置 <code>URLResourceValues.isExcludedFromBackup = true</code> 并上真机验证。当前浏览器原型无法模拟该系统行为。
            </div>
          </div>
        </div>
      `,
    });
  });

  container.querySelector('#me-reset-seed')?.addEventListener('click', async () => {
    const ok = await dialog.confirm({
      title: '恢复初始演示数据？',
      message: '这将替换当前的模拟改动并清理浏览器 IndexedDB 中您额外上传的图片，恢复到包含多币种、多实例、无封面与历史快照的演示数据。',
      confirmLabel: '恢复演示数据',
    });
    if (!ok) return;
    await store.resetToSeedData();
    toast('已恢复初始演示数据并清理旧上传图片');
    actions.rerender();
  });

  container.querySelector('#me-clear-all')?.addEventListener('click', async () => {
    const ok = await dialog.confirm({
      title: '清空全部模拟数据？',
      message: '确认后将同时清空 localStorage 中的所有模拟产品/妆容/日常记录，以及 IndexedDB 中保存的所有图片 Blob，方便您测试空状态。',
      confirmLabel: '彻底清空',
      danger: true,
    });
    if (!ok) return;
    await store.clearAllData();
    toast('已清空模拟数据与 IndexedDB 图片缓存');
    actions.goTab('home');
  });
}
