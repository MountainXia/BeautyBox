/**
 * 妆匣 BeautyBox · 浏览器交互原型（TASK 02）
 * 离线币种精度配置与金额精确转换
 *
 * 规则来源：docs/adr/0001-architecture-decisions.md 第 5.1 / 5.2 节
 * - 金额以「整数最小货币单位」存储（十进制整数字符串），并绑定 ISO 4217 currencyCode
 * - 全程只使用字符串与 BigInt 运算，不使用浮点数换算金额
 * - 未配置币种、超出币种标准精度的输入一律拦截，不静默截断、不隐式舍入
 * - 不同币种金额绝不直接相加，统计时始终按币种分组
 * - 配置完全离线，不依赖任何在线汇率接口
 *
 * 说明：本文件刻意不使用任何浮点转换 API，tests/run-tests.mjs 会对源码做静态检查。
 */

/** 集中式离线币种精度配置（minor unit exponent = 标准小数位数） */
export const CURRENCIES = Object.freeze({
  CNY: Object.freeze({ code: 'CNY', name: '人民币', symbol: '¥', exponent: 2 }),
  HKD: Object.freeze({ code: 'HKD', name: '港币', symbol: 'HK$', exponent: 2 }),
  USD: Object.freeze({ code: 'USD', name: '美元', symbol: 'US$', exponent: 2 }),
  GBP: Object.freeze({ code: 'GBP', name: '英镑', symbol: '£', exponent: 2 }),
});

export const CURRENCY_ORDER = Object.freeze(Object.keys(CURRENCIES));

/** 仅用于在原型中演示「未配置币种拦截」，这些币种不在精度配置中，不可保存金额 */
export const UNCONFIGURED_DEMO_CODES = Object.freeze(['EUR', 'KRW']);

/** 最小货币单位整数的最大位数（防止异常超长输入） */
export const MAX_MINOR_DIGITS = 15;

export const UNSUPPORTED_MESSAGE = '该币种暂不支持';

export function getCurrency(code) {
  if (typeof code !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(CURRENCIES, code) ? CURRENCIES[code] : null;
}

export function isSupportedCurrency(code) {
  return getCurrency(code) !== null;
}

const AMOUNT_RE = /^(\d+)(?:\.(\d+))?$/;
const MINOR_RE = /^\d+$/;

/**
 * 将用户输入的十进制金额字符串精确转换为最小货币单位整数字符串。
 * @returns {{ok:true, minor:string, currencyCode:string} | {ok:false, code:string, error:string}}
 */
export function parseAmountToMinor(input, currencyCode) {
  const cur = getCurrency(currencyCode);
  if (!cur) return { ok: false, code: 'UNSUPPORTED_CURRENCY', error: UNSUPPORTED_MESSAGE };
  if (typeof input !== 'string') return { ok: false, code: 'INVALID', error: '金额格式不正确' };

  const s = input.trim();
  if (s === '') return { ok: false, code: 'EMPTY', error: '请输入金额' };

  const m = AMOUNT_RE.exec(s);
  if (!m) {
    return { ok: false, code: 'INVALID', error: '请输入不带符号、不带千分位的数字，例如 12.34' };
  }

  const intPart = m[1];
  const fracPart = m[2] || '';
  if (fracPart.length > cur.exponent) {
    return {
      ok: false,
      code: 'PRECISION',
      error: cur.exponent === 0
        ? `${cur.code} 没有小数单位，请输入整数金额（不会自动舍入）`
        : `${cur.code} 最多 ${cur.exponent} 位小数，请修正后再保存（不会自动截断或舍入）`,
    };
  }

  const raw = intPart + fracPart.padEnd(cur.exponent, '0');
  const minor = raw.replace(/^0+(?=\d)/, '');
  if (minor.length > MAX_MINOR_DIGITS) {
    return { ok: false, code: 'TOO_LARGE', error: '金额超出允许范围' };
  }
  return { ok: true, minor, currencyCode: cur.code };
}

export function isValidMinor(minor) {
  return typeof minor === 'string' && MINOR_RE.test(minor);
}

/** 最小货币单位 → 十进制字符串（按币种精度补齐小数位），例如 CNY "5" → "0.05" */
export function minorToDecimalString(minor, currencyCode) {
  const cur = getCurrency(currencyCode);
  if (!cur) throw new Error(UNSUPPORTED_MESSAGE);
  if (!isValidMinor(minor)) throw new Error('无效的最小货币单位金额');
  const digits = minor.replace(/^0+(?=\d)/, '');
  if (cur.exponent === 0) return digits;
  const padded = digits.padStart(cur.exponent + 1, '0');
  return `${padded.slice(0, -cur.exponent)}.${padded.slice(-cur.exponent)}`;
}

function groupThousands(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 按币种代码 + 币种精度格式化展示，不凭整数猜测小数位 */
export function formatMinor(minor, currencyCode, { showCode = false } = {}) {
  const cur = getCurrency(currencyCode);
  if (!cur) return `${currencyCode || '未知币种'} ${minor}（未配置精度，无法格式化）`;
  const dec = minorToDecimalString(minor, currencyCode);
  const [i, f] = dec.split('.');
  const body = f === undefined ? groupThousands(i) : `${groupThousands(i)}.${f}`;
  return `${cur.symbol} ${body}${showCode ? ` ${cur.code}` : ''}`;
}

/** 同币种最小货币单位整数相加（BigInt，精确） */
export function addMinor(a, b) {
  if (!isValidMinor(a) || !isValidMinor(b)) throw new Error('无效的最小货币单位金额');
  return (BigInt(a) + BigInt(b)).toString();
}

/** 带币种的金额相加：币种不同直接抛错，禁止跨币种相加 */
export function addMoney(a, b) {
  if (!a || !b || a.currencyCode !== b.currencyCode) {
    throw new Error('不同币种金额不能直接相加');
  }
  return { currencyCode: a.currencyCode, minor: addMinor(a.minor, b.minor) };
}

/**
 * 按币种分组汇总：[{minor, currencyCode}] → [{currencyCode, minor, count, supported}]
 * 不做汇率换算，不同币种永远是独立的行。
 */
export function sumByCurrency(entries) {
  const totals = new Map();
  for (const e of entries) {
    if (!e || e.minor === null || e.minor === undefined || e.minor === '') continue;
    const code = e.currencyCode;
    const prev = totals.get(code) || { currencyCode: code, minor: '0', count: 0, supported: isSupportedCurrency(code) };
    totals.set(code, { ...prev, minor: addMinor(prev.minor, e.minor), count: prev.count + 1 });
  }
  const rank = (code) => {
    const i = CURRENCY_ORDER.indexOf(code);
    return i === -1 ? CURRENCY_ORDER.length : i;
  };
  return [...totals.values()].sort(
    (a, b) => rank(a.currencyCode) - rank(b.currencyCode) || String(a.currencyCode).localeCompare(String(b.currencyCode)),
  );
}

/** 表单提示：说明该币种精度与存储方式 */
export function describePrecision(code) {
  const cur = getCurrency(code);
  if (!cur) return `${UNSUPPORTED_MESSAGE}，原型不会按 2 位小数默认处理，也不会保存金额。`;
  if (cur.exponent === 0) return `${cur.code} 无小数位：输入 1234 → 存储 1234（最小货币单位）`;
  const sample = `12.${'345'.slice(0, cur.exponent)}`;
  const stored = `12${'345'.slice(0, cur.exponent)}`;
  return `${cur.code} 标准 ${cur.exponent} 位小数：输入 ${sample} → 存储 ${stored}（最小货币单位）`;
}
