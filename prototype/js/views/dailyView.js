/**
 * 妆匣 BeautyBox · 浏览器交互原型（TASK 02）
 * Tab 4：日常（晨间/晚间护肤流程、执行记录、产品使用日志、主观肌肤日记）
 */

import { todayStr } from '../expiry.js';
import { isHeldStatus } from '../store.js';
import { recordDiagnostic } from '../diagnostics.js';
import {
  esc,
  formatBytes,
  renderEmptyState,
  showFormError,
} from '../components/ui.js';

const PERIOD_LABELS = {
  morning: '早间流程',
  evening: '晚间流程',
  weekly: '每周护理',
  custom: '自定义',
};

export function renderDailyView({ store, viewState, ctx }) {
  const selectedDate = viewState.selectedDate || todayStr();
  const subTab = viewState.subTab || 'routine';

  ctx.setHeader({
    title: '日常',
    subtitle: '护肤流程 · 使用日志 · 肌肤日记',
    actionsHtml: `<button type="button" class="btn btn-primary btn-sm" data-daily-quick-add="1">+ 记录</button>`,
  });

  return `
    <div class="stack">
      <!-- 日期切换与分段 -->
      <div class="row-between">
        <span style="font-size:13px;font-weight:600;color:var(--text-secondary);">记录日期</span>
        <input type="date" id="daily-date-picker" class="input" style="width:auto;min-height:38px;padding:4px 10px;" value="${esc(selectedDate)}" />
      </div>

      <div class="segmented" role="tablist">
        <button type="button" class="seg-btn ${subTab === 'routine' ? 'is-active' : ''}" data-daily-sub="routine">护肤流程</button>
        <button type="button" class="seg-btn ${subTab === 'usage' ? 'is-active' : ''}" data-daily-sub="usage">使用记录</button>
        <button type="button" class="seg-btn ${subTab === 'diary' ? 'is-active' : ''}" data-daily-sub="diary">肌肤日记</button>
      </div>

      ${subTab === 'routine' ? renderRoutineSection(store, selectedDate) : ''}
      ${subTab === 'usage' ? renderUsageSection(store) : ''}
      ${subTab === 'diary' ? renderDiarySection(store) : ''}
    </div>
  `;
}

function renderRoutineSection(store, selectedDate) {
  const routines = store.state.routines;
  const logs = store.state.routineLogs;

  return `
    <div class="stack">
      <div class="row-between">
        <h2 class="section-title">护肤流程模板（${routines.length}）</h2>
        <button type="button" class="btn btn-soft btn-sm" data-daily-new-routine="1">+ 新建流程</button>
      </div>

      ${routines.length === 0
        ? renderEmptyState({
            icon: '◐',
            title: '暂无护肤流程',
            desc: '建立晨间保湿或晚间修护流程，一键打卡记录每日执行情况。',
            actionLabel: '+ 新建护肤流程',
            actionAttr: 'data-daily-new-routine="1"',
          })
        : routines
            .map(
              (rt) => `
          <div class="card">
            <div class="row-between" style="margin-bottom:8px;">
              <div>
                <span class="pill pill-sage">${esc(PERIOD_LABELS[rt.periodType] || '流程')}</span>
                <div style="font-weight:700;font-size:15px;margin-top:4px;">${esc(rt.name)}</div>
              </div>
              <button type="button" class="btn btn-primary btn-sm" data-daily-run-routine="${esc(rt.id)}">今日打卡</button>
            </div>
            <div class="stack-sm">
              ${rt.steps
                .map(
                  (st) => `
                <div class="card-muted" style="padding:8px 10px;font-size:13px;">
                  <div><strong>${st.sortOrder}. ${esc(st.name)}</strong></div>
                  ${st.products.length > 0
                    ? `<div class="muted-note" style="margin-top:2px;">关联：${st.products.map((p) => esc([p.brandNameSnapshot, p.productNameSnapshot].filter(Boolean).join(' '))).join('、')}</div>`
                    : ''}
                </div>
              `,
                )
                .join('')}
            </div>
          </div>
        `,
            )
            .join('')}

      <div class="card">
        <div class="section-header">
          <h2 class="section-title">流程执行历史（${logs.length}）</h2>
          <span class="section-hint">按执行时保存产品快照</span>
        </div>
        ${logs.length === 0
          ? `<div class="muted-note">暂无执行记录，点击上方流程的“今日打卡”体验记录（日期：${esc(selectedDate)}）。</div>`
          : `
            <div class="stack-sm">
              ${logs
                .map(
                  (log) => `
                <div class="card-muted" style="padding:10px 12px;">
                  <div class="row-between">
                    <strong style="font-size:14px;">${esc(log.routineNameSnapshot)}</strong>
                    <span class="pill ${log.completed ? 'pill-sage' : 'pill-amber'}">${esc(log.logDate)} · ${log.completed ? '已完成' : '部分完成'}</span>
                  </div>
                  <div class="muted-note" style="margin-top:4px;">
                    ${log.items.map((it) => `${it.completed ? '✓' : '○'} ${esc(it.productNameSnapshot)}`).join(' · ')}
                  </div>
                  ${log.notesPrivate ? `<div class="muted-note" style="margin-top:3px;">备注：${esc(log.notesPrivate)}</div>` : ''}
                </div>
              `,
                )
                .join('')}
            </div>
          `}
      </div>
    </div>
  `;
}

function renderUsageSection(store) {
  const logs = store.state.productUsageLogs;
  return `
    <div class="stack">
      <div class="row-between">
        <h2 class="section-title">单品使用日志（${logs.length}）</h2>
        <button type="button" class="btn btn-soft btn-sm" data-daily-new-usage="1">+ 记使用</button>
      </div>
      ${logs.length === 0
        ? renderEmptyState({
            icon: '◷',
            title: '暂无单品使用记录',
            desc: '记录每一次开瓶使用、通勤或试色体验。',
            actionLabel: '+ 记录一次使用',
            actionAttr: 'data-daily-new-usage="1"',
          })
        : logs
            .map((u) => {
              const item = store.state.productItems.find((i) => i.id === u.productItemId);
              const prod = item ? store.state.products.find((p) => p.id === item.productId) : null;
              const brand = prod ? store.getBrandName(prod.brandId) : '';
              return `
                <div class="card">
                  <div class="row-between">
                    <div style="font-weight:700;font-size:14px;">${esc(prod ? prod.name : '已移除产品')}</div>
                    <span class="pill">${esc(u.usedDate)}</span>
                  </div>
                  <div class="muted-note" style="margin-top:4px;">
                    ${esc([brand, prod?.shade, u.scene].filter(Boolean).join(' · '))}
                  </div>
                  ${u.feeling ? `<div style="margin-top:6px;"><span class="pill pill-sage">感受：${esc(u.feeling)}</span></div>` : ''}
                  ${u.notesPrivate ? `<div class="muted-note" style="margin-top:6px;">${esc(u.notesPrivate)}</div>` : ''}
                </div>
              `;
            })
            .join('')}
    </div>
  `;
}

function renderDiarySection(store) {
  const diaries = store.state.skinDiaries;
  return `
    <div class="stack">
      <div class="medical-notice">
        声明：肌肤日记仅用于个人日常记录肤况变化，<strong>不构成医疗诊断或专业治疗建议</strong>，默认不参与任何分享。
      </div>

      <div class="row-between">
        <h2 class="section-title">肌肤日记历史（${diaries.length}）</h2>
        <button type="button" class="btn btn-soft btn-sm" data-daily-new-diary="1">+ 写日记</button>
      </div>

      ${diaries.length === 0
        ? renderEmptyState({
            icon: '✎',
            title: '还没有肌肤日记',
            desc: '记录换季干燥、作息或护肤调整后的主观肤况感受与照片。',
            actionLabel: '+ 写第一篇日记',
            actionAttr: 'data-daily-new-diary="1"',
          })
        : diaries
            .map(
              (d) => `
          <div class="card">
            <div class="row-between" style="margin-bottom:8px;">
              <span class="pill pill-accent">${esc(d.diaryDate)}</span>
              <div class="row-wrap">
                ${(d.moodTags || []).map((t) => `<span class="pill pill-sage">${esc(t)}</span>`).join('')}
              </div>
            </div>
            ${d.notesPrivate ? `<div style="font-size:14px;line-height:1.55;">${esc(d.notesPrivate)}</div>` : ''}
            ${d.photoAssetIds && d.photoAssetIds.length > 0 ? `
              <div class="gallery-strip" style="margin-top:10px;">
                ${d.photoAssetIds
                  .map((aid) => {
                    const url = store.getAssetUrl(aid);
                    return url
                      ? `<img src="${url}" alt="肌肤日记照片" style="width:92px;height:92px;object-fit:cover;border-radius:10px;" />`
                      : '';
                  })
                  .join('')}
              </div>
            ` : ''}
          </div>
        `,
            )
            .join('')}
    </div>
  `;
}

/* ---------------- 日常交互弹窗 ---------------- */

function openRoutineExecutionSheet({ store, sheet, toast, routineId, logDate, onSaved }) {
  const rt = store.state.routines.find((r) => r.id === routineId);
  if (!rt) return;
  sheet.open({
    title: `打卡：${rt.name}`,
    bodyHtml: `
      <form id="rt-exec-form" class="form-stack">
        <div class="form-banner-info">日期：<strong>${esc(logDate)}</strong> · 勾选今日完成步骤，提交后自动记录产品快照。</div>
        <div class="stack-sm">
          ${rt.steps
            .map(
              (st) => `
            <label class="card" style="display:flex;align-items:center;gap:10px;padding:12px;cursor:pointer;">
              <input type="checkbox" name="steps" value="${esc(st.id)}" checked style="width:18px;height:18px;" />
              <div>
                <div style="font-weight:600;font-size:14px;">${esc(st.name)}</div>
                ${st.products.length > 0 ? `<div class="muted-note">${st.products.map((p) => esc(p.productNameSnapshot)).join('、')}</div>` : ''}
              </div>
            </label>
          `,
            )
            .join('')}
        </div>
        <div class="field">
          <label>今日肤感备注</label>
          <textarea class="textarea" name="notesPrivate" placeholder="记录吸收速度或搭配感受..."></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">完成并保存打卡记录</button>
      </form>
    `,
    onMount: (body, close) => {
      body.querySelector('#rt-exec-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const checked = [...body.querySelectorAll('input[name="steps"]:checked')].map((el) => el.value);
        const notes = body.querySelector('textarea[name="notesPrivate"]')?.value || '';
        const res = store.recordRoutineExecution({
          routineId: rt.id,
          logDate,
          completedStepIds: checked,
          notesPrivate: notes,
        });
        if (res.ok) {
          close();
          toast('护肤流程打卡已保存');
          onSaved?.();
        }
      });
    },
  });
}

function openNewRoutineSheet({ store, sheet, toast, onSaved }) {
  const activeProdIds = new Set(store.getActiveProducts().map((p) => p.id));
  const heldItems = store.state.productItems.filter(
    (i) => !i.archivedAt && !i.deletedAt && activeProdIds.has(i.productId) && isHeldStatus(i.status),
  );
  sheet.open({
    title: '新建护肤流程',
    bodyHtml: `
      <form id="new-rt-form" class="form-stack" novalidate>
        <div id="rt-err" class="form-banner-error" style="display:none;"></div>
        <div class="field-row">
          <div class="field">
            <label>流程名称 <span class="req">*</span></label>
            <input class="input" name="name" placeholder="例如：周末深层补水流程" required />
          </div>
          <div class="field">
            <label>周期类型</label>
            <select class="select" name="periodType">
              <option value="morning">早间</option>
              <option value="evening">晚间</option>
              <option value="weekly">每周</option>
              <option value="custom" selected>自定义</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>步骤 1 名称 <span class="req">*</span></label>
          <input class="input" name="step1" placeholder="例如：涂抹修护精华" required />
        </div>
        <div class="field">
          <label>步骤 1 关联持有产品（可选）</label>
          <select class="select" name="item1">
            <option value="">不关联具体产品</option>
            ${heldItems
              .map((i) => {
                const p = store.state.products.find((pr) => pr.id === i.productId);
                return p ? `<option value="${esc(i.id)}">${esc(p.name)}</option>` : '';
              })
              .join('')}
          </select>
        </div>
        <div class="field">
          <label>步骤 2 名称（可选）</label>
          <input class="input" name="step2" placeholder="例如：叠加保湿面霜" />
        </div>
        <button type="submit" class="btn btn-primary btn-block">保存流程</button>
      </form>
    `,
    onMount: (body, close) => {
      body.querySelector('#new-rt-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const errBox = body.querySelector('#rt-err');
        const fd = new FormData(e.target);
        const steps = [
          { name: fd.get('step1'), productItemId: fd.get('item1') || null },
          { name: fd.get('step2'), productItemId: null },
        ];
        const res = store.saveRoutine({
          name: fd.get('name'),
          periodType: fd.get('periodType'),
          steps,
        });
        if (!res.ok) {
          showFormError(errBox, res.error, toast);
          return;
        }
        close();
        toast('新护肤流程已创建');
        onSaved?.();
      });
    },
  });
}

function openNewUsageSheet({ store, sheet, toast, defaultDate, onSaved }) {
  const activeProdIds = new Set(store.getActiveProducts().map((p) => p.id));
  const heldItems = store.state.productItems.filter(
    (i) => !i.archivedAt && !i.deletedAt && activeProdIds.has(i.productId) && isHeldStatus(i.status),
  );
  sheet.open({
    title: '添加单品使用记录',
    bodyHtml: `
      <form id="usage-form" class="form-stack" novalidate>
        <div id="usage-err" class="form-banner-error" style="display:none;"></div>
        <div class="field">
          <label>使用产品 <span class="req">*</span></label>
          <select class="select" name="productItemId" required>
            <option value="">请选择在手产品</option>
            ${heldItems
              .map((i) => {
                const p = store.state.products.find((pr) => pr.id === i.productId);
                return p ? `<option value="${esc(i.id)}">${esc(p.name)}（${esc(p.shade || store.getCategoryName(p.categoryId))}）</option>` : '';
              })
              .join('')}
          </select>
        </div>
        <div class="field-row">
          <div class="field">
            <label>使用日期 <span class="req">*</span></label>
            <input class="input" type="date" name="usedDate" value="${esc(defaultDate)}" required />
          </div>
          <div class="field">
            <label>使用场景</label>
            <input class="input" name="scene" placeholder="例如：早八通勤" value="日常使用" />
          </div>
        </div>
        <div class="field">
          <label>使用感受</label>
          <input class="input" name="feeling" placeholder="例如：不卡粉、颜色自然" />
        </div>
        <div class="field">
          <label>私人备注</label>
          <textarea class="textarea" name="notesPrivate" placeholder="补充记录搭配方法或用量..."></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">保存使用记录</button>
      </form>
    `,
    onMount: (body, close) => {
      body.querySelector('#usage-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const errBox = body.querySelector('#usage-err');
        const fd = new FormData(e.target);
        const res = store.saveUsageLog({
          productItemId: fd.get('productItemId'),
          usedDate: fd.get('usedDate'),
          scene: fd.get('scene'),
          feeling: fd.get('feeling'),
          notesPrivate: fd.get('notesPrivate'),
        });
        if (!res.ok) {
          showFormError(errBox, res.error, toast);
          return;
        }
        close();
        toast('使用记录已保存');
        onSaved?.();
      });
    },
  });
}

export function openNewDiarySheet({ store, sheet, toast, defaultDate = todayStr(), onSaved }) {
  let selectedFiles = [];
  let previewUrls = [];
  const tagsPool = ['状态稳定', '干燥紧绷', 'T区微油', '轻微泛红', '起皮卡粉', '熬夜暗沉'];

  const revokePreviews = () => {
    for (const u of previewUrls) URL.revokeObjectURL(u);
    previewUrls = [];
  };

  sheet.open({
    title: '写一篇肌肤日记',
    onClose: revokePreviews,
    bodyHtml: `
      <form id="diary-form" class="form-stack" novalidate>
        <div class="medical-notice">本记录仅用于个人主观追踪，不构成医疗诊断。默认不会在分享中公开。</div>
        <div id="diary-err" class="form-banner-error" style="display:none;"></div>
        <div class="field">
          <label>日期 <span class="req">*</span></label>
          <input class="input" type="date" name="diaryDate" value="${esc(defaultDate)}" required />
        </div>
        <div class="field">
          <label>主观肤况标签</label>
          <div class="row-wrap">
            ${tagsPool
              .map(
                (t) => `<label class="chip" style="display:inline-flex;align-items:center;gap:5px;"><input type="checkbox" name="moodTags" value="${esc(t)}" /> ${esc(t)}</label>`,
              )
              .join('')}
          </div>
        </div>
        <div class="field">
          <label>记录正文</label>
          <textarea class="textarea" name="notesPrivate" placeholder="记录今天皮肤触感、作息、气候与护肤反应..."></textarea>
        </div>
        <div class="field">
          <label>附加照片（支持多张，保存至浏览器 IndexedDB）</label>
          <div class="row-wrap">
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
              选择照片（可多选）
              <input type="file" accept="image/*" multiple id="diary-files" style="display:none;" />
            </label>
            <span id="diary-files-hint" class="muted-note">未选择照片</span>
          </div>
          <div id="diary-upload-preview" class="upload-preview-strip"></div>
        </div>
        <button type="submit" class="btn btn-primary btn-block">保存肌肤日记</button>
      </form>
    `,
    onMount: (body, close) => {
      const filesEl = body.querySelector('#diary-files');
      const previewEl = body.querySelector('#diary-upload-preview');
      filesEl?.addEventListener('change', () => {
        revokePreviews();
        selectedFiles = [...(filesEl.files || [])];
        const totalSize = selectedFiles.reduce((s, f) => s + (f.size || 0), 0);
        body.querySelector('#diary-files-hint').textContent =
          selectedFiles.length > 0 ? `已选 ${selectedFiles.length} 张（${formatBytes(totalSize)}）` : '未选择照片';
        previewUrls = selectedFiles.map((f) => URL.createObjectURL(f));
        previewEl.innerHTML = previewUrls
          .map(
            (u, idx) => `<div class="upload-preview-chip"><img src="${esc(u)}" alt="日记附图 ${idx + 1}" /></div>`,
          )
          .join('');
      });

      body.querySelector('#diary-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errBox = body.querySelector('#diary-err');
        errBox.style.display = 'none';
        const fd = new FormData(e.target);
        const photoAssetIds = [];
        try {
          for (const f of selectedFiles) {
            const asset = await store.addImageFileAsset(f);
            photoAssetIds.push(asset.id);
          }
          const tags = [...body.querySelectorAll('input[name="moodTags"]:checked')].map((el) => el.value);
          const res = store.saveSkinDiary({
            diaryDate: fd.get('diaryDate'),
            moodTags: tags,
            notesPrivate: fd.get('notesPrivate'),
            photoAssetIds,
          });
          if (!res.ok) {
            showFormError(errBox, res.error, toast);
            return;
          }
          close();
          toast('肌肤日记已保存');
          onSaved?.();
        } catch (err) {
          if (!err?.stage) {
            recordDiagnostic('unexpected_save_error', err, {
              entityType: 'skin_diary',
              fileCount: selectedFiles.length,
            });
          }
          showFormError(errBox, err?.message || '保存日记失败，请在「我的」查看保存诊断日志', toast);
        }
      });
    },
  });
}

export function bindDailyEvents(container, { store, viewState, actions, sheet, toast }) {
  const selectedDate = viewState.selectedDate || todayStr();

  container.querySelector('#daily-date-picker')?.addEventListener('change', (e) => {
    viewState.selectedDate = e.target.value || todayStr();
    actions.rerender();
  });

  container.querySelectorAll('[data-daily-sub]').forEach((el) => {
    el.addEventListener('click', () => {
      viewState.subTab = el.dataset.dailySub;
      actions.rerender();
    });
  });

  container.querySelector('[data-daily-quick-add]')?.addEventListener('click', () => {
    if (viewState.subTab === 'usage') {
      openNewUsageSheet({ store, sheet, toast, defaultDate: selectedDate, onSaved: () => actions.rerender() });
    } else if (viewState.subTab === 'diary') {
      openNewDiarySheet({ store, sheet, toast, defaultDate: selectedDate, onSaved: () => actions.rerender() });
    } else {
      openNewRoutineSheet({ store, sheet, toast, onSaved: () => actions.rerender() });
    }
  });

  container.querySelectorAll('[data-daily-run-routine]').forEach((el) => {
    el.addEventListener('click', () => {
      openRoutineExecutionSheet({
        store,
        sheet,
        toast,
        routineId: el.dataset.dailyRunRoutine,
        logDate: selectedDate,
        onSaved: () => actions.rerender(),
      });
    });
  });

  container.querySelectorAll('[data-daily-new-routine]').forEach((el) => {
    el.addEventListener('click', () => {
      openNewRoutineSheet({ store, sheet, toast, onSaved: () => actions.rerender() });
    });
  });

  container.querySelectorAll('[data-daily-new-usage]').forEach((el) => {
    el.addEventListener('click', () => {
      openNewUsageSheet({ store, sheet, toast, defaultDate: selectedDate, onSaved: () => actions.rerender() });
    });
  });

  container.querySelectorAll('[data-daily-new-diary]').forEach((el) => {
    el.addEventListener('click', () => {
      openNewDiarySheet({ store, sheet, toast, defaultDate: selectedDate, onSaved: () => actions.rerender() });
    });
  });
}
