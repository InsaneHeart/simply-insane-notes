import { t } from "./shared-i18n.js";

const MIN_VISIBLE_RATIO = 0.08;
const EPSILON = 0.001;

let activeCropSession = null;

/* ================= NORMALIZAÇÃO E SERIALIZAÇÃO ================= */

export function normalizeCrop(raw) {
  if (!raw) return null;

  let top = 0;
  let right = 0;
  let bottom = 0;
  let left = 0;

  if (typeof raw === "string") {
    const parts = raw.split(",").map((v) => Number(v.trim()));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
    [top, right, bottom, left] = parts;
  } else if (typeof raw === "object") {
    top = Number(raw.top ?? 0);
    right = Number(raw.right ?? 0);
    bottom = Number(raw.bottom ?? 0);
    left = Number(raw.left ?? 0);
    if (![top, right, bottom, left].every(Number.isFinite)) return null;
  } else {
    return null;
  }

  top = Math.max(0, Math.min(1 - MIN_VISIBLE_RATIO, top));
  right = Math.max(0, Math.min(1 - MIN_VISIBLE_RATIO, right));
  bottom = Math.max(0, Math.min(1 - MIN_VISIBLE_RATIO, bottom));
  left = Math.max(0, Math.min(1 - MIN_VISIBLE_RATIO, left));

  if (left + right > 1 - MIN_VISIBLE_RATIO) {
    const scale = (1 - MIN_VISIBLE_RATIO) / (left + right);
    left *= scale;
    right *= scale;
  }
  if (top + bottom > 1 - MIN_VISIBLE_RATIO) {
    const scale = (1 - MIN_VISIBLE_RATIO) / (top + bottom);
    top *= scale;
    bottom *= scale;
  }

  const crop = {
    top: Math.round(top * 10000) / 10000,
    right: Math.round(right * 10000) / 10000,
    bottom: Math.round(bottom * 10000) / 10000,
    left: Math.round(left * 10000) / 10000
  };

  return hasCrop(crop) ? crop : null;
}

export function hasCrop(crop) {
  if (!crop) return false;
  return (
    crop.top > EPSILON ||
    crop.right > EPSILON ||
    crop.bottom > EPSILON ||
    crop.left > EPSILON
  );
}

export function serializeCrop(crop) {
  const norm = normalizeCrop(crop);
  if (!norm) return "";
  return `${norm.top},${norm.right},${norm.bottom},${norm.left}`;
}

export function parseCrop(str) {
  return normalizeCrop(str);
}

/* ================= APLICAÇÃO VISUAL NA MOLDURA ================= */

export function applyImageCrop(frameEl, imgEl, rawCrop) {
  if (!frameEl || !imgEl) return;

  frameEl.style.removeProperty("visibility");

  const crop = normalizeCrop(rawCrop);
  if (!crop) {
    frameEl.classList.remove("has-crop");
    frameEl.style.aspectRatio = "";
    imgEl.style.position = "";
    imgEl.style.width = "";
    imgEl.style.height = "";
    imgEl.style.maxWidth = "";
    imgEl.style.maxHeight = "";
    imgEl.style.left = "";
    imgEl.style.top = "";
    return;
  }

  const visW = Math.max(MIN_VISIBLE_RATIO, 1 - crop.left - crop.right);
  const visH = Math.max(MIN_VISIBLE_RATIO, 1 - crop.top - crop.bottom);

  const paint = () => {
    const natW = imgEl.naturalWidth || 0;
    const natH = imgEl.naturalHeight || 0;
    if (!natW || !natH) return;

    const aspect = (natW * visW) / (natH * visH);

    frameEl.classList.add("has-crop");
    frameEl.style.aspectRatio = String(aspect);

    imgEl.style.position = "absolute";
    imgEl.style.width = `${(100 / visW).toFixed(4)}%`;
    imgEl.style.height = `${(100 / visH).toFixed(4)}%`;
    imgEl.style.maxWidth = "none";
    imgEl.style.maxHeight = "none";
    imgEl.style.left = `${((-crop.left / visW) * 100).toFixed(4)}%`;
    imgEl.style.top = `${((-crop.top / visH) * 100).toFixed(4)}%`;
  };

  if (imgEl.complete && imgEl.naturalWidth > 0) {
    paint();
  } else {
    imgEl.addEventListener("load", paint, { once: true });
  }
}

/* ================= SESSÃO DE RECORTE INLINE (ESTILO WORD) ================= */

export function cancelActiveImageCrop() {
  if (activeCropSession) {
    activeCropSession.cancel();
  }
}

export function isImageCropActive() {
  return Boolean(activeCropSession);
}

export function startInlineImageCrop({
  frameEl,
  imgEl,
  initialCrop = null,
  scrollContainer = null,
  onCommit = null,
  onCancel = null
} = {}) {
  if (!frameEl || !imgEl) return null;

  cancelActiveImageCrop();

  const startCrop = normalizeCrop(initialCrop) || { top: 0, right: 0, bottom: 0, left: 0 };
  let crop = { ...startCrop };

  const computeFullRect = () => {
    const rect = frameEl.getBoundingClientRect();
    const oldVisW = Math.max(MIN_VISIBLE_RATIO, 1 - startCrop.left - startCrop.right);
    const oldVisH = Math.max(MIN_VISIBLE_RATIO, 1 - startCrop.top - startCrop.bottom);

    const fullW = Math.max(20, rect.width / oldVisW);
    const fullH = Math.max(20, rect.height / oldVisH);
    const fullLeft = rect.left - startCrop.left * fullW;
    const fullTop = rect.top - startCrop.top * fullH;

    return { left: fullLeft, top: fullTop, width: fullW, height: fullH };
  };

  let fullRect = computeFullRect();
  const dragHint = t("SIN.Shared.CropDragHint");

  const overlay = document.createElement("div");
  overlay.className = "fk-crop-overlay";
  overlay.innerHTML = `
    <img class="fk-crop-ghost-img" src="${imgEl.currentSrc || imgEl.src}" draggable="false" alt="" />
    <div class="fk-crop-mask fk-crop-mask-top"></div>
    <div class="fk-crop-mask fk-crop-mask-bottom"></div>
    <div class="fk-crop-mask fk-crop-mask-left"></div>
    <div class="fk-crop-mask fk-crop-mask-right"></div>
    <div class="fk-crop-box">
      <div class="fk-crop-grid">
        <span></span><span></span><span></span><span></span>
      </div>
      <div class="fk-crop-handle handle-nw" data-handle="nw" title="${dragHint}"></div>
      <div class="fk-crop-handle handle-n" data-handle="n"></div>
      <div class="fk-crop-handle handle-ne" data-handle="ne" title="${dragHint}"></div>
      <div class="fk-crop-handle handle-e" data-handle="e"></div>
      <div class="fk-crop-handle handle-se" data-handle="se" title="${dragHint}"></div>
      <div class="fk-crop-handle handle-s" data-handle="s"></div>
      <div class="fk-crop-handle handle-sw" data-handle="sw" title="${dragHint}"></div>
      <div class="fk-crop-handle handle-w" data-handle="w"></div>
    </div>
  `;

  const toolbar = document.createElement("div");
  toolbar.className = "fk-crop-toolbar";
  toolbar.innerHTML = `
    <button type="button" class="fk-crop-btn primary" data-crop-act="apply" title="${t("SIN.Shared.CropApplyTitle")}">
      <i class="fas fa-check"></i> ${t("SIN.Shared.CropApply")}
    </button>
    <button type="button" class="fk-crop-btn" data-crop-act="reset" title="${t("SIN.Shared.CropResetTitle")}">
      <i class="fas fa-expand"></i> ${t("SIN.Shared.CropReset")}
    </button>
    <button type="button" class="fk-crop-btn" data-crop-act="cancel" title="${t("SIN.Shared.CropCancelTitle")}">
      <i class="fas fa-times"></i>
    </button>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(toolbar);

  const prevVisibility = frameEl.style.visibility;
  frameEl.style.visibility = "hidden";

  const maskTop = overlay.querySelector(".fk-crop-mask-top");
  const maskBottom = overlay.querySelector(".fk-crop-mask-bottom");
  const maskLeft = overlay.querySelector(".fk-crop-mask-left");
  const maskRight = overlay.querySelector(".fk-crop-mask-right");
  const cropBox = overlay.querySelector(".fk-crop-box");

  const updateLayout = () => {
    overlay.style.left = `${fullRect.left}px`;
    overlay.style.top = `${fullRect.top}px`;
    overlay.style.width = `${fullRect.width}px`;
    overlay.style.height = `${fullRect.height}px`;

    const leftPx = crop.left * fullRect.width;
    const rightPx = crop.right * fullRect.width;
    const topPx = crop.top * fullRect.height;
    const bottomPx = crop.bottom * fullRect.height;
    const boxW = Math.max(1, fullRect.width - leftPx - rightPx);
    const boxH = Math.max(1, fullRect.height - topPx - bottomPx);

    maskTop.style.cssText = `top:0; left:0; right:0; height:${topPx}px;`;
    maskBottom.style.cssText = `bottom:0; left:0; right:0; height:${bottomPx}px;`;
    maskLeft.style.cssText = `top:${topPx}px; bottom:${bottomPx}px; left:0; width:${leftPx}px;`;
    maskRight.style.cssText = `top:${topPx}px; bottom:${bottomPx}px; right:0; width:${rightPx}px;`;

    cropBox.style.left = `${leftPx}px`;
    cropBox.style.top = `${topPx}px`;
    cropBox.style.width = `${boxW}px`;
    cropBox.style.height = `${boxH}px`;

    const tbRect = toolbar.getBoundingClientRect();
    const tbW = tbRect.width || 190;
    const tbH = tbRect.height || 32;
    const boxScreenLeft = fullRect.left + leftPx;
    const boxScreenTop = fullRect.top + topPx;
    const boxScreenBottom = boxScreenTop + boxH;

    let tbLeft = boxScreenLeft + boxW / 2 - tbW / 2;
    tbLeft = Math.max(8, Math.min(window.innerWidth - tbW - 8, tbLeft));

    let tbTop = boxScreenBottom + 10;
    if (tbTop + tbH > window.innerHeight - 8) {
      tbTop = Math.max(8, boxScreenTop - tbH - 10);
    }

    toolbar.style.left = `${tbLeft}px`;
    toolbar.style.top = `${tbTop}px`;
  };

  updateLayout();

  /* ================= ARRASTE DAS ALÇAS E DA CAIXA ================= */

  let dragState = null;

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const handleEl = e.target.closest?.(".fk-crop-handle");
    const isBoxMove = !handleEl && e.target.closest?.(".fk-crop-box");
    if (!handleEl && !isBoxMove) return;

    e.preventDefault();
    e.stopPropagation();

    const mode = handleEl ? handleEl.dataset.handle : "move";
    const startBoxW = (1 - crop.left - crop.right) * fullRect.width;
    const startBoxH = (1 - crop.top - crop.bottom) * fullRect.height;

    dragState = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origin: { ...crop },
      aspect: startBoxW / Math.max(1, startBoxH)
    };

    overlay.classList.add("is-dragging");
    window.addEventListener("mousemove", onPointerMove, true);
    window.addEventListener("mouseup", onPointerUp, true);
  };

  const onPointerMove = (e) => {
    if (!dragState) return;
    e.preventDefault();

    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const dxNorm = dx / fullRect.width;
    const dyNorm = dy / fullRect.height;

    const { mode, origin, aspect } = dragState;
    let next = { ...origin };

    if (mode === "move") {
      const boxW = 1 - origin.left - origin.right;
      const boxH = 1 - origin.top - origin.bottom;
      const newLeft = Math.max(0, Math.min(1 - boxW, origin.left + dxNorm));
      const newTop = Math.max(0, Math.min(1 - boxH, origin.top + dyNorm));
      next = {
        left: newLeft,
        right: 1 - newLeft - boxW,
        top: newTop,
        bottom: 1 - newTop - boxH
      };
    } else {
      const hasL = mode.includes("w");
      const hasR = mode.includes("e");
      const hasT = mode.includes("n");
      const hasB = mode.includes("s");
      const isCorner = (hasL || hasR) && (hasT || hasB);

      if (hasL) next.left = Math.max(0, Math.min(1 - origin.right - MIN_VISIBLE_RATIO, origin.left + dxNorm));
      if (hasR) next.right = Math.max(0, Math.min(1 - origin.left - MIN_VISIBLE_RATIO, origin.right - dxNorm));
      if (hasT) next.top = Math.max(0, Math.min(1 - origin.bottom - MIN_VISIBLE_RATIO, origin.top + dyNorm));
      if (hasB) next.bottom = Math.max(0, Math.min(1 - origin.top - MIN_VISIBLE_RATIO, origin.bottom - dyNorm));

      if (isCorner && e.shiftKey) {
        const anchorX = hasL ? 1 - origin.right : origin.left;
        const anchorY = hasT ? 1 - origin.bottom : origin.top;

        const maxW = (hasL ? anchorX : 1 - anchorX) * fullRect.width;
        const maxH = (hasT ? anchorY : 1 - anchorY) * fullRect.height;
        const minW = MIN_VISIBLE_RATIO * fullRect.width;
        const minH = MIN_VISIBLE_RATIO * fullRect.height;

        const rawW = (1 - next.left - next.right) * fullRect.width;
        const rawH = (1 - next.top - next.bottom) * fullRect.height;

        let targetW = rawW;
        let targetH = rawW / aspect;
        if (Math.abs(dy) > Math.abs(dx)) {
          targetH = rawH;
          targetW = rawH * aspect;
        }

        if (targetW > maxW) {
          targetW = maxW;
          targetH = targetW / aspect;
        }
        if (targetH > maxH) {
          targetH = maxH;
          targetW = targetH * aspect;
        }
        if (targetW < minW) {
          targetW = minW;
          targetH = targetW / aspect;
        }
        if (targetH < minH) {
          targetH = minH;
          targetW = targetH * aspect;
        }

        const normW = Math.min(1, targetW / fullRect.width);
        const normH = Math.min(1, targetH / fullRect.height);

        if (hasL) {
          next.left = Math.max(0, anchorX - normW);
          next.right = 1 - anchorX;
        } else {
          next.left = anchorX;
          next.right = Math.max(0, 1 - (anchorX + normW));
        }

        if (hasT) {
          next.top = Math.max(0, anchorY - normH);
          next.bottom = 1 - anchorY;
        } else {
          next.top = anchorY;
          next.bottom = Math.max(0, 1 - (anchorY + normH));
        }
      }
    }

    crop = next;
    updateLayout();
  };

  const onPointerUp = () => {
    dragState = null;
    overlay.classList.remove("is-dragging");
    window.removeEventListener("mousemove", onPointerMove, true);
    window.removeEventListener("mouseup", onPointerUp, true);
  };

  overlay.addEventListener("mousedown", onPointerDown);

  /* ================= AÇÕES (APLICAR / RESTAURAR / CANCELAR) ================= */

  let finished = false;
  let armed = false;

  const cleanup = () => {
    if (finished) return;
    finished = true;
    activeCropSession = null;

    window.removeEventListener("mousemove", onPointerMove, true);
    window.removeEventListener("mouseup", onPointerUp, true);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("resize", onReposition);
    document.removeEventListener("mousedown", onDocMouseDown, true);
    scrollContainer?.removeEventListener("scroll", onReposition);

    overlay.remove();
    toolbar.remove();
    frameEl.style.visibility = prevVisibility;
  };

  const commit = () => {
    const finalCrop = normalizeCrop(crop);
    const oldVisW = Math.max(MIN_VISIBLE_RATIO, 1 - startCrop.left - startCrop.right);
    const oldVisH = Math.max(MIN_VISIBLE_RATIO, 1 - startCrop.top - startCrop.bottom);
    const newLeft = finalCrop ? finalCrop.left : 0;
    const newRight = finalCrop ? finalCrop.right : 0;
    const newTop = finalCrop ? finalCrop.top : 0;
    const newBottom = finalCrop ? finalCrop.bottom : 0;
    const newVisW = Math.max(MIN_VISIBLE_RATIO, 1 - newLeft - newRight);
    const newVisH = Math.max(MIN_VISIBLE_RATIO, 1 - newTop - newBottom);

    const metrics = {
      widthRatio: newVisW / oldVisW,
      heightRatio: newVisH / oldVisH,
      shiftXRatio: (newLeft - startCrop.left) / oldVisW,
      shiftYRatio: (newTop - startCrop.top) / oldVisH
    };

    cleanup();
    onCommit?.({ crop: finalCrop, metrics });
  };

  const cancel = () => {
    cleanup();
    onCancel?.();
  };

  toolbar.addEventListener("mousedown", (e) => e.stopPropagation());
  toolbar.querySelector('[data-crop-act="apply"]')?.addEventListener("click", (e) => {
    e.stopPropagation();
    commit();
  });
  toolbar.querySelector('[data-crop-act="reset"]')?.addEventListener("click", (e) => {
    e.stopPropagation();
    crop = { top: 0, right: 0, bottom: 0, left: 0 };
    updateLayout();
  });
  toolbar.querySelector('[data-crop-act="cancel"]')?.addEventListener("click", (e) => {
    e.stopPropagation();
    cancel();
  });

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      cancel();
    }
  };

  const onDocMouseDown = (e) => {
    if (!armed) return;
    if (overlay.contains(e.target) || toolbar.contains(e.target)) return;
    commit();
  };

  const onReposition = () => {
    if (!frameEl.isConnected) {
      cancel();
      return;
    }
    fullRect = computeFullRect();
    updateLayout();
  };

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("resize", onReposition);
  document.addEventListener("mousedown", onDocMouseDown, true);
  scrollContainer?.addEventListener("scroll", onReposition, { passive: true });

  setTimeout(() => {
    armed = true;
  }, 50);

  activeCropSession = { commit, cancel };
  return activeCropSession;
}