/**
 * 妆匣 BeautyBox · 浏览器交互原型
 * 白名单分享卡片生成器（纯本地 Canvas 导出 PNG，绝不上传服务器，绝不包含敏感字段）
 */

import { recordDiagnostic } from './diagnostics.js';
import { renderStars } from './components/ui.js';

export const SHARE_CARD_LABELS = Object.freeze({
  look: '妆容展示卡',
  wear: '持妆实测卡',
  list: '产品清单卡',
});

/**
 * 严格按白名单提取公开展示字段。
 * 强制排除：purchasePriceMinor、currencyCode、acquisitionMethod、purchaseChannel、notesPrivate、skinDiaries。
 */
export function buildShareCardPayload({ look, items = [], wearList = [], shareOpts = {} }) {
  const cardType = SHARE_CARD_LABELS[shareOpts.cardType] ? shareOpts.cardType : 'look';
  const titlePrefix = SHARE_CARD_LABELS[cardType];
  const opts = {
    showPhoto: shareOpts.showPhoto !== false,
    showStyle: shareOpts.showStyle !== false,
    showDuration: shareOpts.showDuration !== false,
    showProducts: shareOpts.showProducts !== false,
    showRating: shareOpts.showRating !== false,
    showWear: Boolean(shareOpts.showWear),
  };

  const chips = [];
  if (opts.showStyle && look?.style) chips.push({ text: String(look.style), tone: 'neutral' });
  if (opts.showStyle && look?.scene) chips.push({ text: String(look.scene), tone: 'neutral' });
  if (opts.showDuration && Number.isInteger(look?.durationMinutes) && look.durationMinutes > 0) {
    chips.push({ text: `${look.durationMinutes} min`, tone: 'neutral' });
  }
  if (opts.showRating && look?.selfRating) {
    chips.push({ text: renderStars(look.selfRating), tone: 'sage' });
  }

  const productLines = opts.showProducts
    ? items
        .map((i) => [i.brandNameSnapshot, i.productNameSnapshot, i.shadeSnapshot].filter(Boolean).join(' '))
        .filter(Boolean)
    : [];

  const wearSummary =
    opts.showWear && wearList.length > 0
      ? `持妆实测：${wearList.map((w) => `${w.timepointKey}(${w.overallRating}★)`).join(' → ')}`
      : '';

  return {
    cardType,
    titlePrefix,
    lookDate: String(look?.lookDate || ''),
    name: String(look?.name || '未命名妆容'),
    showPhoto: opts.showPhoto && cardType !== 'list',
    chips,
    productLines,
    wearSummary,
    footerLeft: '妆匣 BeautyBox · 本地生成',
    footerRight: '价格/获得方式/私人备注已隐藏',
  };
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapTextLines(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const ch of String(text || '')) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line.length > 0) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = src;
  });
}

function drawCoverFallbackArtwork(ctx, x, y, w, h) {
  ctx.save();
  drawRoundedRect(ctx, x, y, w, h, 24);
  ctx.clip();
  ctx.fillStyle = '#F2ECE6';
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = '#E8DFD6';
  ctx.beginPath();
  ctx.arc(x + w * 0.85, y + h * 0.22, 92, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w * 0.14, y + h * 0.82, 74, 0, Math.PI * 2);
  ctx.fill();

  const cx = x + w / 2;
  const cy = y + h * 0.48;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx, cy, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, cy + 92, 76, 38, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#DCC4B8';
  ctx.beginPath();
  ctx.arc(cx - 22, cy - 4, 11, 0, Math.PI * 2);
  ctx.arc(cx + 22, cy - 4, 11, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#735F56';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy + 12, 18, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

/**
 * 在本地浏览器 Canvas 上绘制白名单分享图并导出 PNG Blob 与 File。
 */
export async function renderShareCardToPng({ payload, coverAsset = null, coverUrl = null }) {
  try {
    if (typeof document === 'undefined') {
      throw new Error('当前非浏览器环境，无法创建 Canvas');
    }

    const width = 750;
    const outerPad = 36;
    const cardPad = 32;
    const cardW = width - outerPad * 2;
    const contentW = cardW - cardPad * 2;

    const measureCanvas = document.createElement('canvas');
    const mCtx = measureCanvas.getContext('2d');
    if (!mCtx) throw new Error('无法获取 Canvas 2D 上下文');

    const fontSans = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", sans-serif';

    mCtx.font = `700 34px ${fontSans}`;
    const titleLines = wrapTextLines(mCtx, payload.name, contentW);

    mCtx.font = `400 23px ${fontSans}`;
    const wrappedProducts = payload.productLines.map((line) => wrapTextLines(mCtx, `· ${line}`, contentW));
    const wearLines = payload.wearSummary ? wrapTextLines(mCtx, payload.wearSummary, contentW) : [];

    // 动态计算卡片总高度，保证短图紧凑、长清单不裁切
    let cursorH = outerPad + cardPad;
    cursorH += 42; // 顶部标签 + 日期行
    if (payload.showPhoto) {
      cursorH += 22 + 300; // 封面图
    }
    cursorH += 22 + titleLines.length * 44; // 标题
    if (payload.chips.length > 0) {
      cursorH += 16 + 44; // 属性标签行（支持自动折行估算）
      mCtx.font = `600 22px ${fontSans}`;
      let chipRowW = 0;
      for (const chip of payload.chips) {
        const w = mCtx.measureText(chip.text).width + 28;
        if (chipRowW > 0 && chipRowW + 12 + w > contentW) {
          cursorH += 46;
          chipRowW = w;
        } else {
          chipRowW += (chipRowW > 0 ? 12 : 0) + w;
        }
      }
    }
    if (wrappedProducts.length > 0) {
      cursorH += 24 + 34; // 分隔线 + 标题
      for (const lines of wrappedProducts) {
        cursorH += lines.length * 32 + 6;
      }
    }
    if (wearLines.length > 0) {
      cursorH += 20 + wearLines.length * 32;
    }
    cursorH += 28 + 34 + cardPad + outerPad; // 页脚

    const height = Math.max(420, cursorH);
    const dpr = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法初始化绘制画布');
    ctx.scale(dpr, dpr);

    // 背景与白色主卡
    ctx.fillStyle = '#F6F1EB';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.shadowColor = 'rgba(65, 48, 38, 0.08)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#FFFFFF';
    drawRoundedRect(ctx, outerPad, outerPad, cardW, height - outerPad * 2, 28);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#ECE4DC';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, outerPad, outerPad, cardW, height - outerPad * 2, 28);
    ctx.stroke();

    const leftX = outerPad + cardPad;
    let y = outerPad + cardPad;

    // 顶部角标 + 日期
    ctx.font = `600 21px ${fontSans}`;
    const badgeW = ctx.measureText(payload.titlePrefix).width + 28;
    ctx.fillStyle = '#F6E8E7';
    drawRoundedRect(ctx, leftX, y, badgeW, 38, 19);
    ctx.fill();
    ctx.fillStyle = '#9C5C58';
    ctx.textBaseline = 'middle';
    ctx.fillText(payload.titlePrefix, leftX + 14, y + 19);

    ctx.fillStyle = '#8B817B';
    ctx.font = `500 22px ${fontSans}`;
    ctx.textAlign = 'right';
    ctx.fillText(payload.lookDate, leftX + contentW, y + 19);
    ctx.textAlign = 'left';
    y += 42;

    // 封面照片（仅从本地 Blob 绘制；示例占位图由 Canvas 直接绘制以避免 WebKit SVG 污染画布）
    if (payload.showPhoto) {
      y += 22;
      const photoH = 300;
      let drewRealPhoto = false;
      if (coverAsset?.kind === 'idb' && coverUrl) {
        try {
          const img = await loadImage(coverUrl);
          ctx.save();
          drawRoundedRect(ctx, leftX, y, contentW, photoH, 22);
          ctx.clip();
          const scale = Math.max(contentW / img.naturalWidth, photoH / img.naturalHeight);
          const dw = img.naturalWidth * scale;
          const dh = img.naturalHeight * scale;
          ctx.drawImage(img, leftX + (contentW - dw) / 2, y + (photoH - dh) / 2, dw, dh);
          ctx.restore();
          drewRealPhoto = true;
        } catch {
          drewRealPhoto = false;
        }
      }
      if (!drewRealPhoto) {
        drawCoverFallbackArtwork(ctx, leftX, y, contentW, photoH);
      }
      y += photoH;
    }

    // 妆容名称
    y += 22;
    ctx.fillStyle = '#2F2824';
    ctx.font = `700 34px ${fontSans}`;
    ctx.textBaseline = 'top';
    for (const line of titleLines) {
      ctx.fillText(line, leftX, y);
      y += 44;
    }

    // 风格/场景/耗时/评分标签
    if (payload.chips.length > 0) {
      y += 14;
      ctx.font = `600 22px ${fontSans}`;
      ctx.textBaseline = 'middle';
      let cx = leftX;
      for (const chip of payload.chips) {
        const w = ctx.measureText(chip.text).width + 28;
        if (cx > leftX && cx + w > leftX + contentW) {
          cx = leftX;
          y += 46;
        }
        ctx.fillStyle = chip.tone === 'sage' ? '#E9F2EC' : '#F3EFEA';
        drawRoundedRect(ctx, cx, y, w, 36, 18);
        ctx.fill();
        ctx.fillStyle = chip.tone === 'sage' ? '#4F7760' : '#5E554F';
        ctx.fillText(chip.text, cx + 14, y + 18);
        cx += w + 12;
      }
      y += 44;
    }

    // 产品清单
    if (wrappedProducts.length > 0) {
      y += 16;
      ctx.strokeStyle = '#EFE9E2';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(leftX, y);
      ctx.lineTo(leftX + contentW, y);
      ctx.stroke();

      y += 16;
      ctx.fillStyle = '#6B625D';
      ctx.font = `700 22px ${fontSans}`;
      ctx.textBaseline = 'top';
      ctx.fillText('使用产品清单（仅公开名称/品牌/色号）', leftX, y);
      y += 32;

      ctx.fillStyle = '#3B332E';
      ctx.font = `400 23px ${fontSans}`;
      for (const lines of wrappedProducts) {
        for (const l of lines) {
          ctx.fillText(l, leftX, y);
          y += 32;
        }
        y += 6;
      }
    }

    // 持妆实测简报
    if (wearLines.length > 0) {
      y += 8;
      ctx.strokeStyle = '#EFE9E2';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(leftX, y);
      ctx.lineTo(leftX + contentW, y);
      ctx.stroke();

      y += 14;
      ctx.fillStyle = '#6B625D';
      ctx.font = `400 22px ${fontSans}`;
      ctx.textBaseline = 'top';
      for (const l of wearLines) {
        ctx.fillText(l, leftX, y);
        y += 32;
      }
    }

    // 隐私白名单页脚
    y += 18;
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = '#E6DDD4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(leftX, y);
    ctx.lineTo(leftX + contentW, y);
    ctx.stroke();
    ctx.restore();

    y += 18;
    ctx.fillStyle = '#998E87';
    ctx.font = `500 20px ${fontSans}`;
    ctx.textBaseline = 'top';
    ctx.fillText(payload.footerLeft, leftX, y);
    ctx.textAlign = 'right';
    ctx.fillText(payload.footerRight, leftX + contentW, y);
    ctx.textAlign = 'left';

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('浏览器未能生成 PNG 图片数据');

    const safeName = (payload.name || 'look').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 24);
    const fileName = `BeautyBox-${safeName}-${payload.lookDate || 'share'}.png`;
    const file = typeof File !== 'undefined' ? new File([blob], fileName, { type: 'image/png' }) : null;
    return { ok: true, blob, file, fileName };
  } catch (err) {
    recordDiagnostic('share_card_export_failed', err, {
      entityType: 'look_share_card',
      cardType: payload?.cardType || 'look',
    });
    return {
      ok: false,
      error: `分享图片生成失败：${err?.name || 'CanvasError'}: ${err?.message || '请检查浏览环境'}`,
    };
  }
}
