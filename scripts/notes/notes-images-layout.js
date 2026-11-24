const MIN_IMG_WIDTH = 80;
const SIDE_HYSTERESIS = 12;
const IMG_MARGIN = 16;
const SCROLL_EDGE_ZONE = 54;
const MIN_TEXT_GAP = 100;
const MIN_BOX_GAP = 180;

export class EditorImagesLayout {
  constructor(images) {
    this.images = images;
    this.editor = images.editor;
    this._autoScrollRaf = null;
    this._autoScrollState = null;
    this._updatingLayout = false;
  }

  get body() {
    return this.images.body;
  }

  /* ================= LAYOUT E MARGENS DINÂMICAS ================= */

  updateLayout() {
    if (!this.body || this._updatingLayout) return;
    this._updatingLayout = true;

    try {
      this.body.querySelectorAll("[data-clear-squeeze]").forEach((el) => {
        el.removeAttribute("data-clear-squeeze");
      });

      const blocks = Array.from(this.body.querySelectorAll(".fk-img-block"));
      if (!blocks.length) {
        this.editor.lists?.updateMarkers();
        this.editor.blocks?.updateLayout();
        return;
      }

      blocks.forEach((b) => {
        b.classList.remove("is-flush-top", "is-flush-bottom", "is-wide-block");
        b.style.removeProperty("margin-right");
        b.style.removeProperty("margin-left");
        if (this._isAtTopOrAfterEmptyLine(b)) {
          b.classList.add("is-flush-top");
        }
      });

      const sides = {
        left: blocks.filter((b) => b.dataset.side !== "right"),
        right: blocks.filter((b) => b.dataset.side === "right")
      };

      for (const list of Object.values(sides)) {
        if (list.length < 2) continue;

        list.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

        for (let i = 0; i < list.length - 1; i++) {
          const upper = list[i];
          const lower = list[i + 1];

          const uRect = upper.getBoundingClientRect();
          const lRect = lower.getBoundingClientRect();
          if (!uRect.height || !lRect.height) continue;

          const uBottom = upper.classList.contains("is-flush-bottom") ? 0 : IMG_MARGIN;
          const lTop = lower.classList.contains("is-flush-top") ? 0 : IMG_MARGIN;
          const expectedGap = uBottom + lTop;
          const actualGap = lRect.top - uRect.bottom;

          if (actualGap <= expectedGap + 4) {
            if (uRect.width >= lRect.width) {
              lower.classList.add("is-flush-top");
            } else {
              lower.classList.remove("is-flush-top");
              upper.classList.add("is-flush-bottom");
            }
          }
        }
      }

      this._applyMinTextGapLayout(sides);

      this.editor.lists?.updateMarkers();
      this.editor.blocks?.updateLayout();
    } finally {
      this._updatingLayout = false;
    }
  }

  _measureImageBox(block) {
    const rect = block.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const style = window.getComputedStyle(block);
    const mTop = parseFloat(style.marginTop) || 0;
    const mRight = parseFloat(style.marginRight) || 0;
    const mBottom = parseFloat(style.marginBottom) || 0;
    const mLeft = parseFloat(style.marginLeft) || 0;

    return {
      el: block,
      rect,
      top: rect.top - mTop,
      bottom: rect.bottom + mBottom,
      mRight,
      mLeft
    };
  }

  _applyMinTextGapLayout(sides) {
    const bodyW = this.body.clientWidth;
    if (!bodyW) return;

    const leftBoxes = sides.left.map((b) => this._measureImageBox(b)).filter(Boolean);
    const rightBoxes = sides.right.map((b) => this._measureImageBox(b)).filter(Boolean);

    const singleBoxSqueezeZones = [];
    const applyWideSingle = (box, oppBoxes, side) => {
      const hasOppOverlap = oppBoxes.some(
        (opp) => opp.bottom > box.top + 2 && opp.top < box.bottom - 2
      );
      if (hasOppOverlap) return;

      const remaining = bodyW - box.rect.width - IMG_MARGIN;
      if (remaining < MIN_TEXT_GAP) {
        const fillMargin = Math.max(0, Math.floor(bodyW - box.rect.width));
        box.el.classList.add("is-wide-block");
        if (side === "left") box.el.style.marginRight = `${fillMargin}px`;
        else box.el.style.marginLeft = `${fillMargin}px`;
      } else if (remaining < MIN_BOX_GAP) {
        singleBoxSqueezeZones.push({ top: box.top, bottom: box.bottom, clearSide: side });
      }
    };

    leftBoxes.forEach((box) => applyWideSingle(box, rightBoxes, "left"));
    rightBoxes.forEach((box) => applyWideSingle(box, leftBoxes, "right"));

    const textNarrowBands = [];
    const boxNarrowBands = [];

    for (const l of leftBoxes) {
      for (const r of rightBoxes) {
        const overlapTop = Math.max(l.top, r.top);
        const overlapBottom = Math.min(l.bottom, r.bottom);
        if (overlapBottom <= overlapTop + 2) continue;

        const gap = r.rect.left - r.mLeft - (l.rect.right + l.mRight);
        const pickClearSide = (minGap) => {
          let clearSide = l.bottom <= r.bottom ? "left" : "right";
          if (clearSide === "left" && bodyW - r.rect.width - IMG_MARGIN < minGap) {
            clearSide = "both";
          } else if (clearSide === "right" && bodyW - l.rect.width - IMG_MARGIN < minGap) {
            clearSide = "both";
          }
          return clearSide;
        };

        if (gap < MIN_TEXT_GAP) {
          textNarrowBands.push({
            top: overlapTop,
            bottom: overlapBottom,
            clearSide: pickClearSide(MIN_TEXT_GAP)
          });
        }

        if (gap < MIN_BOX_GAP) {
          boxNarrowBands.push({
            top: overlapTop,
            bottom: overlapBottom,
            clearSide: pickClearSide(MIN_BOX_GAP)
          });
        }
      }
    }

    if (!textNarrowBands.length && !boxNarrowBands.length && !singleBoxSqueezeZones.length) return;

    const children = Array.from(this.body.children);
    for (const child of children) {
      if (child.classList.contains("fk-img-block")) continue;
      if (child.querySelector(".fk-img-block")) continue;

      const cRect = child.getBoundingClientRect();
      if (!cRect.height) continue;

      const isBox = child.classList.contains("fk-box");
      const bands = isBox ? [...boxNarrowBands, ...singleBoxSqueezeZones] : textNarrowBands;

      for (const band of bands) {
        if (cRect.bottom > band.top + 2 && cRect.top < band.bottom - 2) {
          child.dataset.clearSqueeze = band.clearSide;
          break;
        }
      }
    }
  }

  getMaxResizeWidth(block) {
    const bodyW = this.body.clientWidth || 620;
    const side = block.dataset.side === "right" ? "right" : "left";
    const oppSide = side === "right" ? "left" : "right";

    const box = this._measureImageBox(block);
    if (!box) return Math.max(MIN_IMG_WIDTH, Math.floor(bodyW));

    let maxOppWidth = 0;
    const allBlocks = Array.from(this.body.querySelectorAll(".fk-img-block"));

    for (const other of allBlocks) {
      if (other === block) continue;
      const otherSide = other.dataset.side === "right" ? "right" : "left";
      if (otherSide !== oppSide) continue;

      const oBox = this._measureImageBox(other);
      if (!oBox) continue;

      if (oBox.bottom > box.top + 2 && oBox.top < box.bottom - 2) {
        maxOppWidth = Math.max(maxOppWidth, oBox.rect.width);
      }
    }

    if (maxOppWidth > 0) {
      const available = Math.floor(bodyW - maxOppWidth - IMG_MARGIN * 2);
      return Math.max(MIN_IMG_WIDTH, available);
    }

    return Math.max(MIN_IMG_WIDTH, Math.floor(bodyW));
  }

  _isAtTopOrAfterEmptyLine(block) {
    const side = block.dataset.side === "right" ? "right" : "left";
    let container = block;
    while (container.parentNode && container.parentNode !== this.body) {
      container = container.parentNode;
    }

    if (container !== block) {
      let node = block.previousSibling;
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) {
          if (node.textContent.replace(/\u200B/g, "").trim().length > 0) return false;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.classList.contains("fk-img-block")) {
            const nodeSide = node.dataset.side === "right" ? "right" : "left";
            if (nodeSide === side) return false;
          } else if (node.nodeName === "BR") {
            return false;
          } else if (node.textContent.replace(/\u200B/g, "").trim().length > 0) {
            return false;
          }
        }
        node = node.previousSibling;
      }
    }

    let prev = container.previousElementSibling;
    while (
      prev &&
      prev.classList.contains("fk-img-block") &&
      (prev.dataset.side === "right" ? "right" : "left") !== side
    ) {
      prev = prev.previousElementSibling;
    }

    if (!prev) return true;
    if (prev.classList.contains("fk-divider-block") || prev.classList.contains("fk-box")) {
      return false;
    }

    const prevHasSameSideImg =
      (prev.classList.contains("fk-img-block") &&
        (prev.dataset.side === "right" ? "right" : "left") === side) ||
      Array.from(prev.querySelectorAll(".fk-img-block")).some(
        (img) => (img.dataset.side === "right" ? "right" : "left") === side
      );
    const prevText = prev.textContent.replace(/\u200B/g, "").trim();

    return !prevHasSameSideImg && prevText.length === 0;
  }

  /* ================= AUTO-SCROLL DURANTE ARRASTE ================= */

  getScrollEdgeState(scrollEl, clientY, grabOffsetY, block) {
    if (!scrollEl) {
      return { sRect: null, topRef: clientY, bottomRef: clientY, nearTop: false, nearBottom: false };
    }

    const sRect = scrollEl.getBoundingClientRect();
    const imgH = block.getBoundingClientRect().height || 0;
    const imgTop = clientY - grabOffsetY;
    const imgBottom = imgTop + imgH;

    const isLargeImage = imgH > sRect.height * 0.5;
    const bothEdgesActive =
      imgTop < sRect.top + SCROLL_EDGE_ZONE && imgBottom > sRect.bottom - SCROLL_EDGE_ZONE;

    const useMouseRef = isLargeImage || bothEdgesActive;
    const topRef = useMouseRef ? clientY : imgTop;
    const bottomRef = useMouseRef ? clientY : imgBottom;

    return {
      sRect,
      topRef,
      bottomRef,
      nearTop: topRef < sRect.top + SCROLL_EDGE_ZONE,
      nearBottom: bottomRef > sRect.bottom - SCROLL_EDGE_ZONE
    };
  }

  updateAutoScroll(scrollEl, ev, grabOffsetY, block, edgeLock, onScrollStep) {
    if (!scrollEl) return;

    this._autoScrollState = {
      scrollEl,
      clientX: ev.clientX,
      clientY: ev.clientY,
      grabOffsetY,
      block,
      edgeLock,
      onScrollStep
    };

    if (!this._autoScrollRaf) {
      const tick = () => {
        if (!this._autoScrollState) {
          this._autoScrollRaf = null;
          return;
        }
        const didScroll = this._performAutoScrollStep(this._autoScrollState);
        if (didScroll && typeof this._autoScrollState.onScrollStep === "function") {
          this._autoScrollState.onScrollStep();
        }
        this._autoScrollRaf = requestAnimationFrame(tick);
      };
      this._autoScrollRaf = requestAnimationFrame(tick);
    }
  }

  stopAutoScroll() {
    if (this._autoScrollRaf) {
      cancelAnimationFrame(this._autoScrollRaf);
      this._autoScrollRaf = null;
    }
    this._autoScrollState = null;
  }

  _performAutoScrollStep({ scrollEl, clientY, grabOffsetY, block, edgeLock }) {
    const { sRect, topRef, bottomRef, nearTop, nearBottom } = this.getScrollEdgeState(
      scrollEl,
      clientY,
      grabOffsetY,
      block
    );
    if (!sRect) return false;

    if (edgeLock) {
      if (!nearTop) edgeLock.top = false;
      if (!nearBottom) edgeLock.bottom = false;
    }

    const canScrollTop = nearTop && !nearBottom && !edgeLock?.top;
    const canScrollBottom = nearBottom && !nearTop && !edgeLock?.bottom;

    const winEl = scrollEl.closest(".window-app, .application") || scrollEl;
    const winRect = winEl.getBoundingClientRect();

    let delta = 0;

    if (canScrollTop) {
      const insideDepth = Math.min(SCROLL_EDGE_ZONE, Math.max(0, sRect.top + SCROLL_EDGE_ZONE - topRef));
      const baseSpeed = (insideDepth / SCROLL_EDGE_ZONE) * 6;
      const outsideContainer = Math.max(0, sRect.top - clientY);
      const outsideWindow = Math.max(0, winRect.top - clientY);
      const boost = outsideContainer * 0.1 + outsideWindow * 0.18;
      delta = -Math.min(24, Math.max(1, baseSpeed + boost));
    } else if (canScrollBottom) {
      const insideDepth = Math.min(SCROLL_EDGE_ZONE, Math.max(0, bottomRef - (sRect.bottom - SCROLL_EDGE_ZONE)));
      const baseSpeed = (insideDepth / SCROLL_EDGE_ZONE) * 6;
      const outsideContainer = Math.max(0, clientY - sRect.bottom);
      const outsideWindow = Math.max(0, clientY - winRect.bottom);
      const boost = outsideContainer * 0.1 + outsideWindow * 0.18;
      delta = Math.min(24, Math.max(1, baseSpeed + boost));
    }

    const step = Math.round(delta);
    if (step === 0) return false;

    const prevTop = scrollEl.scrollTop;
    scrollEl.scrollTop += step;
    return scrollEl.scrollTop !== prevTop;
  }

  /* ================= ÂNCORA AO VIVO & NORMALIZAÇÃO ================= */

  sideFromX(clientX) {
    const r = this.body.getBoundingClientRect();
    return clientX - r.left < r.width / 2 ? "left" : "right";
  }

  sideFromXWithHysteresis(clientX, currentSide) {
    const r = this.body.getBoundingClientRect();
    const centerX = r.left + r.width / 2;
    if (clientX < centerX - SIDE_HYSTERESIS) return "left";
    if (clientX > centerX + SIDE_HYSTERESIS) return "right";
    return currentSide;
  }

  findLiveAnchor(targetY, side, block, scrollEl = null) {
    const paragraphs = Array.from(this.body.children).filter(
      (el) => !el.classList.contains("fk-img-block")
    );
    if (!paragraphs.length) return this.endOfBodyRange();

    const firstRect = paragraphs[0].getBoundingClientRect();
    if (targetY <= firstRect.top + 4) {
      return this.boundaryOf(paragraphs[0], false);
    }

    const lastPara = paragraphs[paragraphs.length - 1];
    const lastRect = lastPara.getBoundingClientRect();
    if (targetY >= lastRect.bottom - 4) {
      return this.boundaryOf(lastPara, true);
    }

    let para = paragraphs[0];
    let minDist = Infinity;

    for (const p of paragraphs) {
      const r = p.getBoundingClientRect();
      if (targetY >= r.top && targetY <= r.bottom) {
        para = p;
        break;
      }
      const dist = Math.min(Math.abs(targetY - r.top), Math.abs(targetY - r.bottom));
      if (dist < minDist) {
        minDist = dist;
        para = p;
      }
    }

    if (para.classList.contains("fk-divider-block") || para.classList.contains("fk-box")) {
      const r = para.getBoundingClientRect();
      return this.boundaryOf(para, targetY > r.top + r.height / 2);
    }

    if (!para.textContent.trim()) {
      return this.boundaryOf(para, false);
    }

    const bodyRect = this.body.getBoundingClientRect();
    const paraRect = para.getBoundingClientRect();
    let minProbeY = paraRect.top + 6;
    let maxProbeY = paraRect.bottom - 6;

    if (scrollEl) {
      const sRect = scrollEl.getBoundingClientRect();
      minProbeY = Math.max(minProbeY, sRect.top + 6);
      maxProbeY = Math.min(maxProbeY, sRect.bottom - 6);
    }

    const probeY =
      minProbeY <= maxProbeY
        ? Math.max(minProbeY, Math.min(maxProbeY, targetY + 10))
        : (paraRect.top + paraRect.bottom) / 2;

    const steps = 11;
    const pad = 12;
    const span = Math.max(1, bodyRect.width - pad * 2);
    const probeXs = [];

    for (let i = 0; i < steps; i++) {
      const ratio = i / (steps - 1);
      const x =
        side === "left"
          ? bodyRect.right - pad - ratio * span
          : bodyRect.left + pad + ratio * span;
      probeXs.push(x);
    }

    let bestRange = null;
    let bestDist = Infinity;

    for (const px of probeXs) {
      const hitEl = document.elementFromPoint(px, probeY);
      if (hitEl?.closest?.(".fk-img-block, .fk-divider-block, .fk-box")) continue;

      const raw = this.caretAtPoint(px, probeY);
      const normalized = this.normalizeAnchor(raw, block, { skipAllImages: true });
      if (!normalized || !para.contains(normalized.startContainer)) continue;

      const snapped = this._snapToLineStart(normalized, para);
      const lineTop = this._rangeTop(snapped);
      const dist = lineTop === null ? Infinity : Math.abs(lineTop - targetY);

      if (dist < bestDist) {
        bestDist = dist;
        bestRange = snapped;
        if (dist <= 12) break;
      }
    }

    if (bestRange) return bestRange;

    const midY = paraRect.top + paraRect.height / 2;
    return this.boundaryOf(para, targetY > midY);
  }

  _rangeTop(range) {
    const node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE && node.length > 0) {
      const probe = document.createRange();
      const idx = Math.min(range.startOffset, node.length - 1);
      probe.setStart(node, idx);
      probe.setEnd(node, Math.min(idx + 1, node.length));
      const rect = probe.getBoundingClientRect();
      return rect.height ? rect.top : null;
    }

    const rect = range.getBoundingClientRect();
    return rect.height ? rect.top : null;
  }

  _snapToLineStart(range, para) {
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return range;

    const textNode = range.startContainer;
    const len = textNode.length;
    if (!len) return range;

    let offset = Math.min(range.startOffset, len - 1);
    const probe = document.createRange();

    const getCharTop = (idx) => {
      probe.setStart(textNode, idx);
      probe.setEnd(textNode, Math.min(idx + 1, len));
      const rect = probe.getBoundingClientRect();
      return rect.height ? rect.top : null;
    };

    const baseTop = getCharTop(offset);
    if (baseTop === null) return range;

    const STEP = 8;
    while (offset >= STEP) {
      const prevTop = getCharTop(offset - STEP);
      if (prevTop !== null && Math.abs(prevTop - baseTop) > 5) break;
      offset -= STEP;
    }

    while (offset > 0) {
      const prevTop = getCharTop(offset - 1);
      if (prevTop !== null && Math.abs(prevTop - baseTop) > 5) break;
      offset -= 1;
    }

    const snapped = document.createRange();
    snapped.setStart(textNode, offset);
    snapped.collapse(true);
    return para.contains(snapped.startContainer) ? snapped : range;
  }

  isSamePosition(range, block) {
    const { startContainer, startOffset } = range;

    if (startContainer === block.parentNode) {
      const atOffset = startContainer.childNodes[startOffset];
      const beforeOffset = startContainer.childNodes[startOffset - 1];
      return atOffset === block || beforeOffset === block;
    }

    if (startContainer.nodeType === Node.TEXT_NODE) {
      if (startOffset === 0 && startContainer.previousSibling === block) return true;
      if (startOffset === startContainer.length && startContainer.nextSibling === block) return true;
    }

    return false;
  }

  adjustAnchorForBlockStart(range) {
    if (!range || !this.body.contains(range.startContainer)) return range;

    const node = range.startContainer;
    if (node === this.body) return range;

    let cur = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (cur && cur !== this.body && cur.parentNode !== this.body) {
      cur = cur.parentNode;
    }

    if (
      !cur ||
      cur === this.body ||
      cur.classList.contains("fk-img-block") ||
      cur.classList.contains("fk-divider-block")
    ) {
      return range;
    }

    if (cur.classList.contains("fk-box")) {
      const promoted = document.createRange();
      promoted.setStartBefore(cur);
      promoted.collapse(true);
      return promoted;
    }

    if (!this._isAtBlockStart(range, cur)) return range;

    const promoted = document.createRange();
    promoted.setStartBefore(cur);
    promoted.collapse(true);
    return promoted;
  }

  _isAtBlockStart(range, block) {
    const before = document.createRange();
    before.setStart(block, 0);
    before.setEnd(range.startContainer, range.startOffset);

    const frag = before.cloneContents();
    if (frag.querySelector("br")) return false;
    return frag.textContent.replace(/\u200B/g, "").trim().length === 0;
  }

  caretAtPoint(x, y) {
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        const range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
        return range;
      }
    } else if (document.caretRangeFromPoint) {
      return document.caretRangeFromPoint(x, y);
    }
    return null;
  }

  anchorFromPoint(x, y, ignoreBlock = null) {
    const range = this.caretAtPoint(x, y);
    return this.normalizeAnchor(range, ignoreBlock);
  }

  normalizeAnchor(range, ignoreBlock = null, { skipAllImages = false } = {}) {
    if (!range || !this.body.contains(range.startContainer)) return null;

    const node = range.startContainer;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const img = el?.closest?.(".fk-img-block");

    if (img) {
      if (skipAllImages || img === ignoreBlock) return null;
      const r = document.createRange();
      r.setStartAfter(img);
      r.collapse(true);
      return r;
    }

    const staticBlock = el?.closest?.(".fk-divider-block, .fk-box");
    if (staticBlock) {
      const r = document.createRange();
      r.setStartAfter(staticBlock);
      r.collapse(true);
      return r;
    }

    if (node === this.body) {
      const children = this.body.childNodes;
      if (!children.length) return null;
      const atEnd = range.startOffset >= children.length;
      const child = children[Math.min(range.startOffset, children.length - 1)];
      if (child.nodeType === Node.ELEMENT_NODE && child.classList.contains("fk-img-block")) {
        if (skipAllImages) return null;
        const r = document.createRange();
        r.setStartAfter(child);
        r.collapse(true);
        return r;
      }
      return this.boundaryOf(child, atEnd);
    }

    return range;
  }

  boundaryOf(el, atEnd) {
    const r = document.createRange();
    if (el.classList?.contains("fk-divider-block") || el.classList?.contains("fk-box")) {
      if (atEnd) r.setStartAfter(el);
      else r.setStartBefore(el);
      r.collapse(true);
      return r;
    }
    if (atEnd && el.lastChild?.nodeName === "BR") {
      r.setStartBefore(el.lastChild);
    } else {
      r.selectNodeContents(el);
      r.collapse(!atEnd);
      return r;
    }
    r.collapse(true);
    return r;
  }

  endOfBodyRange() {
    const last = this.body.lastElementChild;
    if (last && !last.classList.contains("fk-img-block")) return this.boundaryOf(last, true);
    const r = document.createRange();
    r.selectNodeContents(this.body);
    r.collapse(false);
    return r;
  }
}