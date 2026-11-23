/**
 * 妆匣 BeautyBox · 浏览器交互原型（TASK02.1-A）
 * 非隐私保存诊断日志与结构化错误类型
 *
 * 严格约束：
 * - 只记录阶段、错误名称、错误信息与脱敏上下文（如 entityType、hasFile、fileSize）
 * - 严禁记录用户图片内容、Base64、私人备注、日记正文、购买价格或购买渠道
 */

export const DIAG_STORAGE_KEY = 'beautybox_prototype_diag_v1';
const MAX_DIAG_ENTRIES = 30;

const ALLOWED_CONTEXT_KEYS = new Set([
  'entityType',
  'action',
  'hasFile',
  'fileCount',
  'fileType',
  'fileSize',
  'field',
  'storageMode',
]);

export const SAVE_STAGE_LABELS = Object.freeze({
  idb_open_failed: 'IndexedDB 数据库打开失败',
  idb_tx_failed: 'IndexedDB 事务失败',
  idb_blob_write_failed: '图片 Blob 写入失败',
  file_read_failed: '本地图片文件读取失败',
  localstorage_write_failed: 'localStorage 数据写入失败',
  form_validation_failed: '表单校验失败',
  unexpected_save_error: '保存过程中发生未预期异常',
});

export class PrototypeSaveError extends Error {
  constructor(stage, originalError, userMessage = '') {
    const rawName = originalError?.name || 'Error';
    const rawMsg = originalError?.message || String(originalError || '未知错误');
    const stageLabel = SAVE_STAGE_LABELS[stage] || stage;
    const msg = userMessage || `${stageLabel}（${rawName}: ${rawMsg}）`;
    super(msg);
    this.name = 'PrototypeSaveError';
    this.stage = stage;
    this.originalName = rawName;
    this.originalMessage = rawMsg;
  }
}

const memoryLogs = [];

function sanitizeContext(ctx = {}) {
  const safe = {};
  if (!ctx || typeof ctx !== 'object') return safe;
  for (const [k, v] of Object.entries(ctx)) {
    if (ALLOWED_CONTEXT_KEYS.has(k) && v !== undefined) {
      safe[k] = v;
    }
  }
  return safe;
}

function loadStoredLogs() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DIAG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-MAX_DIAG_ENTRIES) : [];
  } catch {
    return [];
  }
}

function saveStoredLogs(entries) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DIAG_STORAGE_KEY, JSON.stringify(entries.slice(-MAX_DIAG_ENTRIES)));
  } catch {
    // 诊断日志写入失败绝不能二次阻断主流程
  }
}

export function recordDiagnostic(stage, err, context = {}) {
  const entry = {
    id: `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    stage: stage || 'unexpected_save_error',
    stageLabel: SAVE_STAGE_LABELS[stage] || stage || '未知阶段',
    errorName: err?.originalName || err?.name || 'Error',
    errorMessage: err?.originalMessage || err?.message || String(err || '未知错误'),
    context: sanitizeContext(context),
  };

  memoryLogs.push(entry);
  if (memoryLogs.length > MAX_DIAG_ENTRIES) {
    memoryLogs.splice(0, memoryLogs.length - MAX_DIAG_ENTRIES);
  }

  const stored = loadStoredLogs();
  stored.push(entry);
  saveStoredLogs(stored);
  return entry;
}

export function getDiagnostics() {
  const stored = loadStoredLogs();
  if (stored.length > 0) return [...stored].reverse();
  return [...memoryLogs].reverse();
}

export function clearDiagnostics() {
  memoryLogs.length = 0;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(DIAG_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function formatDiagnosticsText() {
  const list = getDiagnostics();
  if (list.length === 0) return '暂无保存错误诊断记录。';
  return list
    .map(
      (d) =>
        `[${d.timestamp}] 阶段=${d.stage}(${d.stageLabel}) | ${d.errorName}: ${d.errorMessage} | 上下文=${JSON.stringify(d.context)}`,
    )
    .join('\n');
}
