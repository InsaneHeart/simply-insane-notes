const FONT_SIZES = [12, 14, 15, 18, 21, 24, 28];
const DEFAULT_FONT_SIZE = 15;

export class EditorFormatting {
  constructor(editor) {
    this.editor = editor;
    this.body = null;
    this.canEdit = true;
  }

  /* ================= CONEXÃO E ATALHOS ================= */

  attach(body, { canEdit = true } = {}) {
    this.body = body;
    this.canEdit = canEdit;
    if (!canEdit) return;

    body.addEventListener("keydown", (e) => this._onKeyDown(e));
  }

  _onKeyDown(e) {
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === " " || e.key === "Enter") {
        this._handleLinkExit(e);
        if (e.defaultPrevented) return;
      }
      if (e.key === "Backspace" && !e.shiftKey) {
        this._handleAlignmentBackspace(e);
        return;
      }
    }

    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;

    const key = e.key.toLowerCase();
    if (key === "b" && !e.shiftKey) {
      e.preventDefault();
      this.toggleInline("bold");
    } else if (key === "i" && !e.shiftKey) {
      e.preventDefault();
      this.toggleInline("italic");
    } else if (key === "u" && !e.shiftKey) {
      e.preventDefault();
      this.toggleInline("underline");
    } else if (key === "s" && e.shiftKey) {
      e.preventDefault();
      this.toggleInline("strikeThrough");
    }
  }

  _handleLinkExit(e) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    if (!this.body?.contains(range.startContainer)) return;

    const hostEl =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer;
    const anchor = hostEl?.closest?.("a");
    if (!anchor || !this.body.contains(anchor)) return;

    const after = document.createRange();
    after.setStart(range.startContainer, range.startOffset);
    after.setEnd(anchor, anchor.childNodes.length);
    const isAtEnd = after.toString().replace(/\u200B/g, "").length === 0;
    if (!isAtEnd) return;

    if (e.key === " ") {
      e.preventDefault();
      const spaceNode = document.createTextNode(" ");
      anchor.after(spaceNode);

      const nextRange = document.createRange();
      nextRange.setStartAfter(spaceNode);
      nextRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nextRange);

      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      return;
    }

    if (e.key === "Enter") {
      const outside = document.createRange();
      outside.setStartAfter(anchor);
      outside.collapse(true);
      sel.removeAllRanges();
      sel.addRange(outside);
    }
  }

  _handleAlignmentBackspace(e) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    if (!this.body?.contains(range.startContainer)) return;

    const block = this._getTopBlock(range.startContainer);
    if (!block || block.classList.contains("fk-box")) return;

    const align = block.dataset.align || "";
    if (!align || align === "justify") return;
    if (!this._isCaretAtBlockStart(range, block)) return;

    if (align === "right") {
      e.preventDefault();
      block.dataset.align = "center";
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      return;
    }

    if (align === "center") {
      e.preventDefault();
      block.removeAttribute("data-align");
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      return;
    }

    if (align === "left") {
      block.removeAttribute("data-align");
      if (!block.previousElementSibling) {
        e.preventDefault();
        this.editor.refresh();
        this.editor.notifyChange({ immediate: false });
      }
    }
  }

  _isCaretAtBlockStart(range, block) {
    const before = document.createRange();
    before.setStart(block, 0);
    before.setEnd(range.startContainer, range.startOffset);

    const frag = before.cloneContents();
    if (frag.querySelector(".fk-img-block, br")) return false;
    return frag.textContent.replace(/\u200B/g, "").length === 0;
  }

  /* ================= ESTADO ATUAL ================= */

  getState(range = null) {
    const activeRange = range || this._getCurrentRange();
    if (!activeRange || !this.body?.contains(activeRange.commonAncestorContainer)) {
      return {
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        subtitle: false,
        align: "justify"
      };
    }

    const startBlock = this._getTopBlock(activeRange.startContainer);
    const endBlock = this._getTopBlock(activeRange.endContainer);
    const subtitle =
      Boolean(startBlock && endBlock) &&
      startBlock === endBlock &&
      startBlock.nodeName === "H3";

    const align = this._resolveBlockAlign(startBlock);

    return {
      bold: this._queryCommand("bold"),
      italic: this._queryCommand("italic"),
      underline: this._queryCommand("underline"),
      strike: this._queryCommand("strikeThrough"),
      subtitle,
      align
    };
  }

  _resolveBlockAlign(block) {
    if (!block) return "justify";
    if (block.dataset.align) return block.dataset.align;
    return block.nodeName === "H3" ? "left" : "justify";
  }

  _queryCommand(cmd) {
    try {
      return Boolean(document.queryCommandState?.(cmd));
    } catch {
      return false;
    }
  }

  /* ================= ESTILOS INLINE ================= */

  toggleInline(command, range = null) {
    if (!this.canEdit || !this.body) return null;
    if (range) {
      this._restoreRange(range);
    } else if (!this.body.contains(document.activeElement)) {
      this.body.focus({ preventScroll: true });
    }

    document.execCommand?.(command, false, null);
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
    return this._getCurrentRange();
  }

  /* ================= CORES (FONTE E MARCA-TEXTO) ================= */

  setTextColor(hex, range = null) {
    return this._applySpanStyle({
      className: "fk-text-color",
      styleProp: "color",
      value: hex || "",
      fallbackWhenNested: "#d4d4d8",
      range
    });
  }

  setHighlightColor(hex, range = null) {
    const bg = hex ? this._hexToRgba(hex, 0.3) : "";
    return this._applySpanStyle({
      className: "fk-text-highlight",
      styleProp: "backgroundColor",
      value: bg,
      fallbackWhenNested: "transparent",
      range
    });
  }

  _wrapRangeWithMarkers(range) {
    if (!range || range.collapsed) return [];

    const working = range.cloneRange();
    const sameTextNode =
      working.startContainer === working.endContainer &&
      working.startContainer.nodeType === Node.TEXT_NODE;

    if (
      working.endContainer.nodeType === Node.TEXT_NODE &&
      working.endOffset < working.endContainer.nodeValue.length
    ) {
      working.endContainer.splitText(working.endOffset);
    }

    if (working.startContainer.nodeType === Node.TEXT_NODE && working.startOffset > 0) {
      const split = working.startContainer.splitText(working.startOffset);
      working.setStart(split, 0);
      if (sameTextNode) {
        working.setEnd(split, split.nodeValue.length);
      }
    }

    const textNodes = [];
    if (working.commonAncestorContainer.nodeType === Node.TEXT_NODE) {
      const node = working.commonAncestorContainer;
      if (
        node.nodeValue &&
        !node.parentElement?.closest(".fk-img-block, .fk-divider-block")
      ) {
        textNodes.push(node);
      }
    } else {
      const walker = document.createTreeWalker(
        working.commonAncestorContainer,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
            if (node.parentElement?.closest(".fk-img-block, .fk-divider-block")) {
              return NodeFilter.FILTER_REJECT;
            }
            return working.intersectsNode(node)
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          }
        }
      );

      let current = walker.nextNode();
      while (current) {
        textNodes.push(current);
        current = walker.nextNode();
      }
    }

    const markers = [];
    for (const textNode of textNodes) {
      const marker = document.createElement("span");
      marker.dataset.fkStyleMarker = "1";
      textNode.parentNode?.insertBefore(marker, textNode);
      marker.appendChild(textNode);
      markers.push(marker);
    }
    return markers;
  }

  _applySpanStyle({ className, styleProp, value, fallbackWhenNested, range = null }) {
    if (!this.canEdit || !this.body) return null;
    if (range) {
      this._restoreRange(range);
    } else if (!this.body.contains(document.activeElement)) {
      this.body.focus({ preventScroll: true });
    }

    const activeRange = this._getCurrentRange();
    if (!activeRange || activeRange.collapsed) return activeRange;

    const markers = this._wrapRangeWithMarkers(activeRange);
    if (!markers.length) return this._getCurrentRange();

    const resultingNodes = [];

    for (const markerEl of markers) {
      const outerSpan = markerEl.parentElement?.closest(`span.${className}`);
      const isOnlyChildOfOuter =
        outerSpan &&
        outerSpan.childNodes.length === 1 &&
        outerSpan.firstChild === markerEl;

      if (isOnlyChildOfOuter) {
        if (!value && !outerSpan.parentElement?.closest(`span.${className}`)) {
          const children = Array.from(markerEl.childNodes);
          this._unwrap(markerEl);
          this._unwrap(outerSpan);
          resultingNodes.push(...children);
        } else {
          outerSpan.style[styleProp] = value || fallbackWhenNested;
          this._unwrap(markerEl);
          resultingNodes.push(outerSpan);
        }
        continue;
      }

      if (!value && !outerSpan) {
        const children = Array.from(markerEl.childNodes);
        this._unwrap(markerEl);
        resultingNodes.push(...children);
      } else {
        const span = document.createElement("span");
        span.className = className;
        span.style[styleProp] = value || fallbackWhenNested;
        while (markerEl.firstChild) span.appendChild(markerEl.firstChild);
        markerEl.replaceWith(span);
        resultingNodes.push(span);
      }
    }

    const updatedRange = this._selectNodes(resultingNodes);
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
    return updatedRange;
  }

  _hexToRgba(hex, alpha) {
    const clean = String(hex || "").replace("#", "").trim();
    if (clean.length !== 6) return hex;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /* ================= ALINHAMENTO ================= */

  setAlignment(align, range = null) {
    if (!this.canEdit || !this.body) return null;
    if (range) this._restoreRange(range);
    else if (!this.body.contains(document.activeElement)) {
      this.body.focus({ preventScroll: true });
    }

    const activeRange = this._getCurrentRange();
    if (!activeRange || !this.body.contains(activeRange.commonAncestorContainer)) return null;

    const startBlock = this._getTopBlock(activeRange.startContainer);
    const endBlock = this._getTopBlock(activeRange.endContainer);
    if (!startBlock || !endBlock) return activeRange;

    let cur = startBlock;
    while (cur) {
      if (
        !cur.classList.contains("fk-img-block") &&
        !cur.classList.contains("fk-divider-block") &&
        !cur.classList.contains("fk-box")
      ) {
        if (align === "justify") {
          if (cur.nodeName === "H3") cur.dataset.align = "justify";
          else cur.removeAttribute("data-align");
        } else {
          cur.dataset.align = align;
        }
      }
      if (cur === endBlock) break;
      cur = cur.nextElementSibling;
    }

    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
    return this._getCurrentRange();
  }

  /* ================= TAMANHO DA FONTE ================= */

  stepFontSize(delta, range = null) {
    if (!this.canEdit || !this.body) return null;
    if (range) this._restoreRange(range);
    else if (!this.body.contains(document.activeElement)) {
      this.body.focus({ preventScroll: true });
    }

    const activeRange = this._getCurrentRange();
    if (!activeRange || activeRange.collapsed) return activeRange;

    const currentPx = this._getSelectionFontSize(activeRange);
    const currentIdx = this._nearestSizeIndex(currentPx);
    const nextIdx = Math.max(0, Math.min(FONT_SIZES.length - 1, currentIdx + delta));
    const nextPx = FONT_SIZES[nextIdx];

    if (nextPx === FONT_SIZES[currentIdx] && Math.abs(currentPx - nextPx) < 0.5) {
      return activeRange;
    }

    const markers = this._wrapRangeWithMarkers(activeRange);
    if (!markers.length) return this._getCurrentRange();

    const resultingNodes = [];

    for (const markerEl of markers) {
      const outerSizeSpan = markerEl.parentElement?.closest("span.fk-font-size");
      const isOnlyChildOfOuter =
        outerSizeSpan &&
        outerSizeSpan.childNodes.length === 1 &&
        outerSizeSpan.firstChild === markerEl;

      if (isOnlyChildOfOuter) {
        if (nextPx === DEFAULT_FONT_SIZE && !outerSizeSpan.parentElement?.closest("span.fk-font-size")) {
          const children = Array.from(markerEl.childNodes);
          this._unwrap(markerEl);
          this._unwrap(outerSizeSpan);
          resultingNodes.push(...children);
        } else {
          outerSizeSpan.style.fontSize = `${nextPx}px`;
          this._unwrap(markerEl);
          resultingNodes.push(outerSizeSpan);
        }
        continue;
      }

      if (nextPx === DEFAULT_FONT_SIZE && !outerSizeSpan) {
        const children = Array.from(markerEl.childNodes);
        this._unwrap(markerEl);
        resultingNodes.push(...children);
      } else {
        const span = document.createElement("span");
        span.className = "fk-font-size";
        span.style.fontSize = `${nextPx}px`;
        while (markerEl.firstChild) span.appendChild(markerEl.firstChild);
        markerEl.replaceWith(span);
        resultingNodes.push(span);
      }
    }

    const updatedRange = this._selectNodes(resultingNodes);
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
    return updatedRange;
  }

  _getSelectionFontSize(range) {
    let node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    } else if (node.childNodes[range.startOffset]) {
      const child = node.childNodes[range.startOffset];
      node = child.nodeType === Node.TEXT_NODE ? child.parentElement : child;
    }

    const el = node instanceof Element ? node : this.body;
    const computed = parseFloat(window.getComputedStyle(el).fontSize);
    return Number.isFinite(computed) ? computed : DEFAULT_FONT_SIZE;
  }

  _nearestSizeIndex(px) {
    let bestIdx = 0;
    let bestDiff = Infinity;
    FONT_SIZES.forEach((size, idx) => {
      const diff = Math.abs(size - px);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = idx;
      }
    });
    return bestIdx;
  }

  /* ================= SUBTÍTULO ================= */

  toggleSubtitle(range = null) {
    if (!this.canEdit || !this.body) return null;
    if (range) this._restoreRange(range);
    else if (!this.body.contains(document.activeElement)) {
      this.body.focus({ preventScroll: true });
    }

    const activeRange = this._getCurrentRange();
    if (!activeRange || !this.body.contains(activeRange.commonAncestorContainer)) return null;

    const startBlock = this._getTopBlock(activeRange.startContainer);
    const endBlock = this._getTopBlock(activeRange.endContainer);
    if (!startBlock || !endBlock) return activeRange;
    if (
      startBlock.classList.contains("fk-divider-block") ||
      endBlock.classList.contains("fk-divider-block") ||
      startBlock.classList.contains("fk-box") ||
      endBlock.classList.contains("fk-box")
    ) {
      return activeRange;
    }

    if (startBlock === endBlock && startBlock.nodeName === "H3") {
      const div = document.createElement("div");
      while (startBlock.firstChild) div.appendChild(startBlock.firstChild);
      if (!div.childNodes.length) div.appendChild(document.createElement("br"));
      startBlock.replaceWith(div);

      const newRange = this._selectElementContents(div);
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      return newRange;
    }

    const beforeRange = document.createRange();
    beforeRange.setStart(startBlock, 0);
    beforeRange.setEnd(activeRange.startContainer, activeRange.startOffset);

    const afterRange = document.createRange();
    afterRange.setStart(activeRange.endContainer, activeRange.endOffset);
    afterRange.setEnd(endBlock, endBlock.childNodes.length);

    const beforeFrag = beforeRange.cloneContents();
    const selectedFrag = activeRange.collapsed
      ? this._cloneBlockContents(startBlock)
      : activeRange.cloneContents();
    const afterFrag = afterRange.cloneContents();

    const blocksToRemove = [];
    let cursor = startBlock;
    while (cursor) {
      blocksToRemove.push(cursor);
      if (cursor === endBlock) break;
      cursor = cursor.nextSibling;
    }

    const insertRef = endBlock.nextSibling;
    const beforeHasContent = !activeRange.collapsed && this._fragmentHasContent(beforeFrag);
    const afterHasContent = !activeRange.collapsed && this._fragmentHasContent(afterFrag);

    const h3 = document.createElement("h3");
    this._appendInlineFragment(h3, selectedFrag);
    if (!this._fragmentHasContent(h3)) {
      return activeRange;
    }

    blocksToRemove.forEach((b) => b.remove());

    if (beforeHasContent) {
      const beforeDiv = document.createElement("div");
      beforeDiv.appendChild(beforeFrag);
      this._trimEdgeWhitespace(beforeDiv, { end: true });
      this.body.insertBefore(beforeDiv, insertRef);
    }

    this.body.insertBefore(h3, insertRef);

    if (afterHasContent) {
      const afterDiv = document.createElement("div");
      afterDiv.appendChild(afterFrag);
      this._trimEdgeWhitespace(afterDiv, { start: true });
      this.body.insertBefore(afterDiv, insertRef);
    }

    const prev = h3.previousElementSibling;
    if (prev && !this._isEmptyBlock(prev)) {
      this.body.insertBefore(this._createEmptyLine(), h3);
    }

    const next = h3.nextElementSibling;
    if (!next || !this._isEmptyBlock(next)) {
      this.body.insertBefore(this._createEmptyLine(), next);
    }

    const newRange = this._selectElementContents(h3);
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
    return newRange;
  }

  /* ================= LIMPAR FORMATAÇÃO ================= */

  clearFormatting(range = null) {
    if (!this.canEdit || !this.body) return null;
    if (range) this._restoreRange(range);
    else if (!this.body.contains(document.activeElement)) {
      this.body.focus({ preventScroll: true });
    }

    const activeRange = this._getCurrentRange();
    if (!activeRange || !this.body.contains(activeRange.commonAncestorContainer)) return null;

    const startBlock = this._getTopBlock(activeRange.startContainer);
    const endBlock = this._getTopBlock(activeRange.endContainer);

    const blocks = [];
    let cur = startBlock;
    while (cur) {
      blocks.push(cur);
      if (cur === endBlock) break;
      cur = cur.nextElementSibling;
    }

    document.execCommand?.("removeFormat", false, null);

    const postRange = this._getCurrentRange();
    if (postRange) {
      this.body
        .querySelectorAll("span.fk-font-size, span.fk-text-color, span.fk-text-highlight")
        .forEach((span) => {
          if (span.closest(".fk-img-block, .fk-divider-block")) return;
          if (postRange.intersectsNode(span)) {
            this._unwrap(span);
          }
        });
    }

    for (const block of blocks) {
      if (
        !block.isConnected ||
        block.classList.contains("fk-divider-block") ||
        block.classList.contains("fk-box")
      ) {
        continue;
      }
      if (block.nodeName === "H3") {
        const div = document.createElement("div");
        while (block.firstChild) div.appendChild(block.firstChild);
        if (!div.childNodes.length) div.appendChild(document.createElement("br"));
        block.replaceWith(div);
      } else {
        block.removeAttribute("data-align");
        block.removeAttribute("data-list");
        block.removeAttribute("data-level");
        block.removeAttribute("data-checked");
        block.removeAttribute("data-marker");
        block.removeAttribute("data-quote");
        block.removeAttribute("data-quote-color");
        block.removeAttribute("data-quote-pos");
        block.removeAttribute("data-block-side");
        block.style.removeProperty("--fk-quote-color");
        block.style.removeProperty("--fk-block-float-offset");
        block.style.removeProperty("--fk-block-rail-h");
      }
    }

    this.body.normalize();
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
    return this._getCurrentRange();
  }

  /* ================= UTILITÁRIOS DOM ================= */

  _getCurrentRange() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    return this.body?.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
  }

  _restoreRange(range) {
    if (!this.body) return;
    const hostEl =
      range?.startContainer?.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range?.startContainer;
    const editableHost = hostEl?.closest?.('[contenteditable="true"]') || this.body;
    editableHost.focus({ preventScroll: true });

    if (!range || !this.body.contains(range.startContainer)) return;

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  _getTopBlock(node) {
    if (!node || !this.body?.contains(node)) return null;
    let cur = node;
    while (cur && cur.parentNode !== this.body) {
      cur = cur.parentNode;
    }
    return cur instanceof Element ? cur : null;
  }

  _createEmptyLine() {
    const div = document.createElement("div");
    div.appendChild(document.createElement("br"));
    return div;
  }

  _isEmptyBlock(el) {
    if (!el) return false;
    if (
      el.classList?.contains("fk-img-block") ||
      el.classList?.contains("fk-divider-block") ||
      el.classList?.contains("fk-box") ||
      el.querySelector?.(".fk-img-block")
    ) {
      return false;
    }
    return el.textContent.replace(/\u200B/g, "").trim().length === 0;
  }

  _fragmentHasContent(node) {
    if (!node) return false;
    if (node.querySelector?.(".fk-img-block")) return true;
    return node.textContent.replace(/\u200B/g, "").trim().length > 0;
  }

  _cloneBlockContents(block) {
    const frag = document.createDocumentFragment();
    Array.from(block.childNodes).forEach((child) => {
      if (child.nodeName !== "BR") frag.appendChild(child.cloneNode(true));
    });
    return frag;
  }

  _appendInlineFragment(target, frag) {
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        target.appendChild(node.cloneNode(true));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (
        node.classList.contains("fk-img-block") ||
        node.classList.contains("fk-divider-block") ||
        node.classList.contains("fk-box")
      ) {
        return;
      }

      if (node.nodeName === "DIV" || node.nodeName === "P" || node.nodeName === "H3") {
        if (target.childNodes.length && !target.textContent.endsWith(" ")) {
          target.appendChild(document.createTextNode(" "));
        }
        Array.from(node.childNodes).forEach(walk);
        return;
      }

      if (node.nodeName === "BR") return;

      if (node.classList.contains("fk-font-size")) {
        Array.from(node.childNodes).forEach(walk);
        return;
      }

      target.appendChild(node.cloneNode(true));
    };

    Array.from(frag.childNodes).forEach(walk);
    this._trimEdgeWhitespace(target, { start: true, end: true });
  }

  _trimEdgeWhitespace(el, { start = false, end = false } = {}) {
    if (start) {
      let first = el.firstChild;
      while (first && first.nodeType === Node.TEXT_NODE) {
        first.textContent = first.textContent.replace(/^\s+/, "");
        if (first.textContent.length > 0) break;
        const next = first.nextSibling;
        first.remove();
        first = next;
      }
    }
    if (end) {
      let last = el.lastChild;
      while (last && last.nodeType === Node.TEXT_NODE) {
        last.textContent = last.textContent.replace(/\s+$/, "");
        if (last.textContent.length > 0) break;
        const prev = last.previousSibling;
        last.remove();
        last = prev;
      }
    }
  }

  _unwrap(el) {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    el.remove();
  }

  _selectNodes(nodes) {
    const connected = nodes.filter((n) => n && n.isConnected);
    if (!connected.length) return this._getCurrentRange();

    const range = document.createRange();
    range.setStartBefore(connected[0]);
    range.setEndAfter(connected[connected.length - 1]);

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return range.cloneRange();
  }

  _selectElementContents(el) {
    const range = document.createRange();
    range.selectNodeContents(el);

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return range.cloneRange();
  }
}