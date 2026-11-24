const MAX_LIST_LEVEL = 2;
const CHECKBOX_HIT_WIDTH = 26;

export class EditorLists {
  constructor(editor) {
    this.editor = editor;
    this.body = null;
    this.canEdit = true;
    this._resizeObserver = null;
    this._updating = false;
  }

  /* ================= CONEXÃO ================= */

  attach(body, { canEdit = true } = {}) {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;

    this.body = body;
    this.canEdit = canEdit;

    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this.updateMarkers());
      this._resizeObserver.observe(body);
    }

    if (!canEdit) return;

    body.addEventListener("mousedown", (e) => this._onMouseDown(e));
    body.addEventListener("keydown", (e) => this._onKeyDown(e));
  }

  /* ================= INTERAÇÃO COM CHECKBOX ================= */

  _onMouseDown(e) {
    if (e.button !== 0 || !this.canEdit) return;
    if (e.target.closest?.(".fk-img-block")) return;

    const block = this._getTopBlock(e.target);
    if (!block || block.dataset.list !== "check") return;

    const rect = block.getBoundingClientRect();
    const floatOffset =
      block.dataset.listSide === "wrap-left"
        ? parseFloat(block.style.getPropertyValue("--fk-float-offset")) || 0
        : 0;
    const hitLeft = rect.left + floatOffset;

    if (
      e.clientX < hitLeft ||
      e.clientX > hitLeft + CHECKBOX_HIT_WIDTH ||
      e.clientY < rect.top ||
      e.clientY > rect.top + 26
    ) {
      return;
    }

    e.preventDefault();
    const isChecked = block.dataset.checked === "true";
    block.dataset.checked = isChecked ? "false" : "true";
    this.updateMarkers();
    this.editor.notifyChange({ immediate: false });
  }

  /* ================= TECLADO (ENTER, SHIFT+ENTER, TAB, BACKSPACE) ================= */

  _onKeyDown(e) {
    if (!this.canEdit || !this.body) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === "Tab") {
      this._handleTab(e);
      return;
    }

    if (e.key === "Enter") {
      this._handleEnter(e);
      return;
    }

    if (e.key === "Backspace" && !e.shiftKey) {
      this._handleBackspace(e);
    }
  }

  _handleTab(e) {
    const range = this._getCurrentRange();
    if (!range) return;

    const blocks = this._getBlocksInRange(range);
    const listBlocks = blocks.filter(
      (b) => b.dataset.list === "bullet" || b.dataset.list === "number"
    );
    if (!listBlocks.length) return;

    e.preventDefault();
    const delta = e.shiftKey ? -1 : 1;

    for (const block of listBlocks) {
      const current = Number(block.dataset.level) || 0;
      const next = Math.max(0, Math.min(MAX_LIST_LEVEL, current + delta));
      block.dataset.level = String(next);
    }

    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
  }

  _handleEnter(e) {
    const range = this._getCurrentRange();
    if (!range) return;

    const block = this._getTopBlock(range.startContainer, range.startOffset);
    if (!block) return;

    const listType = block.dataset.list;
    if (!listType) {
      if (!e.shiftKey) return;
      this._handleNormalShiftEnter(e, range, block);
      return;
    }

    e.preventDefault();

    if (!range.collapsed) {
      range.deleteContents();
    }

    const isEmpty = this._isBlockEmpty(block);

    if (isEmpty) {
      this._clearBlockList(block);
      if (!block.childNodes.length) block.appendChild(document.createElement("br"));
      this._placeCaretAtStart(block);
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      return;
    }

    const afterRange = document.createRange();
    afterRange.setStart(range.startContainer, range.startOffset);
    afterRange.setEnd(block, block.childNodes.length);
    const tailFrag = afterRange.extractContents();

    if (this._isBlockEmpty(block) && !block.querySelector("br")) {
      block.appendChild(document.createElement("br"));
    }

    const nextBlock = document.createElement("div");
    nextBlock.appendChild(tailFrag);
    if (this._isBlockEmpty(nextBlock) && !nextBlock.querySelector("br")) {
      nextBlock.appendChild(document.createElement("br"));
    }

    if (listType === "bullet" || listType === "number") {
      const currentLevel = Number(block.dataset.level) || 0;
      const nextLevel = e.shiftKey
        ? Math.min(MAX_LIST_LEVEL, currentLevel + 1)
        : currentLevel;
      nextBlock.dataset.list = listType;
      nextBlock.dataset.level = String(nextLevel);
    } else if (listType === "check" || listType === "check-sub") {
      if (e.shiftKey) {
        nextBlock.dataset.list = "check-sub";
        nextBlock.dataset.checked = block.dataset.checked === "true" ? "true" : "false";
      } else {
        nextBlock.dataset.list = "check";
        nextBlock.dataset.checked = "false";
      }
    }

    block.after(nextBlock);
    this._placeCaretAtStart(nextBlock);
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
  }

  _handleNormalShiftEnter(e, range, block) {
    e.preventDefault();

    if (!range.collapsed) {
      range.deleteContents();
    }

    const afterRange = document.createRange();
    afterRange.setStart(range.startContainer, range.startOffset);
    afterRange.setEnd(block, block.childNodes.length);
    const tailFrag = afterRange.extractContents();

    if (this._isBlockEmpty(block) && !block.querySelector("br")) {
      block.appendChild(document.createElement("br"));
    }

    const nextBlock = document.createElement("div");
    if (block.nodeName !== "H3" && block.dataset.align) {
      nextBlock.dataset.align = block.dataset.align;
    }
    nextBlock.appendChild(tailFrag);
    if (this._isBlockEmpty(nextBlock) && !nextBlock.querySelector("br")) {
      nextBlock.appendChild(document.createElement("br"));
    }

    block.after(nextBlock);
    this._placeCaretAtStart(nextBlock);
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
  }

  _handleBackspace(e) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    if (!this.body.contains(range.startContainer)) return;

    const block = this._getTopBlock(range.startContainer);
    if (!block || !block.dataset.list) return;
    if (!this._isCaretAtBlockStart(range, block)) return;

    const listType = block.dataset.list;

    if (listType === "bullet" || listType === "number") {
      e.preventDefault();
      const level = Number(block.dataset.level) || 0;
      if (level > 0) {
        block.dataset.level = String(level - 1);
      } else {
        this._clearBlockList(block);
      }
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      return;
    }

    if (listType === "check") {
      e.preventDefault();
      this._clearBlockList(block);
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      return;
    }

    if (listType === "check-sub") {
      const prev = block.previousElementSibling;
      if (!prev || (prev.dataset.list !== "check" && prev.dataset.list !== "check-sub")) {
        e.preventDefault();
        this._clearBlockList(block);
        this.editor.refresh();
        this.editor.notifyChange({ immediate: false });
      }
    }
  }

  /* ================= ALTERNAR LISTAS PELO MENU ================= */

  toggleList(type, range = null) {
    if (!this.canEdit || !this.body) return null;
    if (range) this._restoreRange(range);
    else this.body.focus();

    let activeRange = this._getCurrentRange();
    if (!activeRange) return null;

    activeRange = this._normalizeBlocksForRange(activeRange);
    if (!activeRange) return null;

    const blocks = this._getBlocksInRange(activeRange);
    if (!blocks.length) return activeRange;

    const allSame = blocks.every((b) => {
      if (type === "check") return b.dataset.list === "check" || b.dataset.list === "check-sub";
      return b.dataset.list === type;
    });

    for (const block of blocks) {
      let target = block;
      if (target.nodeName === "H3") {
        const div = document.createElement("div");
        while (target.firstChild) div.appendChild(target.firstChild);
        if (!div.childNodes.length) div.appendChild(document.createElement("br"));
        target.replaceWith(div);
        target = div;
      }

      if (allSame) {
        this._clearBlockList(target);
      } else {
        this._clearBlockList(target);
        target.dataset.list = type;
        if (type === "bullet" || type === "number") {
          target.dataset.level = "0";
        } else if (type === "check") {
          target.dataset.checked = "false";
        }
      }
    }

    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
    return this._getCurrentRange();
  }

  getActiveListType(range = null) {
    const activeRange = range || this._getCurrentRange();
    if (!activeRange) return null;

    const block = this._getTopBlock(activeRange.startContainer, activeRange.startOffset);
    const type = block?.dataset?.list || null;
    if (type === "check-sub") return "check";
    return type;
  }

  /* ================= NORMALIZAÇÃO DE BLOCOS E QUEBRAS ================= */

  _normalizeBlocksForRange(range) {
    const startBm = document.createElement("span");
    startBm.dataset.fkBm = "start";
    const endBm = range.collapsed ? null : document.createElement("span");
    if (endBm) endBm.dataset.fkBm = "end";

    if (endBm) {
      const endRange = range.cloneRange();
      endRange.collapse(false);
      endRange.insertNode(endBm);
    }

    const startRange = range.cloneRange();
    startRange.collapse(true);
    startRange.insertNode(startBm);

    this._wrapLooseInlineChildren();

    const children = Array.from(this.body.children);
    for (const child of children) {
      if (child.classList.contains("fk-img-block")) continue;
      if (child.nodeName === "DIV" || child.nodeName === "P") {
        this._expandNewlinesToBrs(child);
        this._flattenNestedBrs(child);
        this._splitBlockOnDirectBrs(child);
      }
    }

    const restored = document.createRange();
    if (startBm.isConnected) {
      restored.setStartBefore(startBm);
      if (endBm && endBm.isConnected) {
        restored.setEndAfter(endBm);
      } else {
        restored.collapse(true);
      }
    }

    startBm.remove();
    endBm?.remove();

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(restored);
    return restored.cloneRange();
  }

  _expandNewlinesToBrs(block) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let current;
    while ((current = walker.nextNode())) {
      if (current.parentElement?.closest(".fk-img-block")) continue;
      if (/[\r\n]/.test(current.nodeValue || "")) {
        textNodes.push(current);
      }
    }

    for (const textNode of textNodes) {
      const parts = textNode.nodeValue.replace(/\r\n?/g, "\n").split("\n");
      const frag = document.createDocumentFragment();
      parts.forEach((part, idx) => {
        if (idx > 0) frag.appendChild(document.createElement("br"));
        if (part.length > 0) frag.appendChild(document.createTextNode(part));
      });
      textNode.replaceWith(frag);
    }
  }

  _flattenNestedBrs(block) {
    let br;
    while (
      (br = Array.from(block.querySelectorAll("br")).find(
        (el) => el.parentNode !== block && !el.closest(".fk-img-block")
      ))
    ) {
      const parent = br.parentNode;
      const rightClone = parent.cloneNode(false);
      while (br.nextSibling) {
        rightClone.appendChild(br.nextSibling);
      }
      parent.after(br);
      if (rightClone.childNodes.length > 0) {
        br.after(rightClone);
      }
      if (parent.childNodes.length === 0) {
        parent.remove();
      }
    }
  }

  _wrapLooseInlineChildren() {
    const nodes = Array.from(this.body.childNodes);
    let buffer = [];

    const flush = (refNode) => {
      if (!buffer.length) return;
      const div = document.createElement("div");
      buffer.forEach((n) => div.appendChild(n));
      if (!div.childNodes.length) div.appendChild(document.createElement("br"));
      this.body.insertBefore(div, refNode);
      buffer = [];
    };

    for (const node of nodes) {
      const isTopBlock =
        node.nodeType === Node.ELEMENT_NODE &&
        (node.nodeName === "DIV" ||
          node.nodeName === "P" ||
          node.nodeName === "H3" ||
          node.classList.contains("fk-img-block"));

      if (isTopBlock) {
        flush(node);
      } else {
        buffer.push(node);
      }
    }
    flush(null);
  }

  _splitBlockOnDirectBrs(block) {
    const directChildren = Array.from(block.childNodes);
    const brCount = directChildren.filter((n) => n.nodeName === "BR").length;
    if (brCount === 0) return;

    const nonBmNonBr = directChildren.filter(
      (n) => n.nodeName !== "BR" && !(n.nodeType === Node.ELEMENT_NODE && n.dataset.fkBm)
    );
    if (brCount === 1 && nonBmNonBr.length === 0) return;

    const segments = [];
    let current = [];

    for (const child of directChildren) {
      if (child.nodeName === "BR") {
        segments.push(current);
        current = [];
      } else {
        current.push(child);
      }
    }
    segments.push(current);

    if (segments.length > 1) {
      const last = segments[segments.length - 1];
      const lastHasReal = last.some(
        (n) =>
          (n.nodeType === Node.ELEMENT_NODE && !n.dataset.fkBm) ||
          (n.nodeType === Node.TEXT_NODE && n.textContent.length > 0)
      );
      if (!lastHasReal) {
        const lastBms = last.filter((n) => n.nodeType === Node.ELEMENT_NODE && n.dataset.fkBm);
        segments.pop();
        if (lastBms.length && segments.length) {
          segments[segments.length - 1].push(...lastBms);
        }
      }
    }

    if (segments.length <= 1) return;

    const frag = document.createDocumentFragment();
    for (const seg of segments) {
      const div = document.createElement("div");
      if (block.dataset.align) div.dataset.align = block.dataset.align;
      if (block.dataset.list) div.dataset.list = block.dataset.list;
      if (block.dataset.level) div.dataset.level = block.dataset.level;
      if (block.dataset.checked) div.dataset.checked = block.dataset.checked;

      seg.forEach((n) => div.appendChild(n));

      const hasVisible = seg.some(
        (n) =>
          (n.nodeType === Node.ELEMENT_NODE && !n.dataset.fkBm) ||
          (n.nodeType === Node.TEXT_NODE && n.textContent.length > 0)
      );
      if (!hasVisible) div.appendChild(document.createElement("br"));

      frag.appendChild(div);
    }

    block.replaceWith(frag);
  }

  /* ================= ATUALIZAÇÃO DE MARCADORES E LAYOUT HÍBRIDO ================= */

  updateMarkers() {
    if (!this.body || this._updating) return;
    this._updating = true;

    try {
      const counters = [];
      let lastCheckState = false;
      const children = Array.from(this.body.children);
      const leftImages = Array.from(
        this.body.querySelectorAll('.fk-img-block:not([data-side="right"])')
      );
      const bodyRect = this.body.getBoundingClientRect();

      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.classList.contains("fk-img-block")) continue;

        const listType = child.dataset.list;

        if (!listType) {
          counters.length = 0;
          lastCheckState = false;
          this._clearRuntimeAttrs(child);
          continue;
        }

        if (listType === "number") {
          const level = Math.max(0, Math.min(MAX_LIST_LEVEL, Number(child.dataset.level) || 0));
          child.dataset.level = String(level);

          if (counters.length > level + 1) {
            counters.length = level + 1;
          }
          while (counters.length < level) {
            counters.push(1);
          }
          counters[level] = (counters[level] || 0) + 1;

          const marker = `${counters.join(".")}.`;
          child.dataset.marker = marker;
          const pad = Math.max(24, Math.ceil(marker.length * 8.5) + 8);
          child.style.setProperty("--fk-marker-pad", `${pad}px`);

          child.removeAttribute("data-has-line");
          child.removeAttribute("data-has-sub");
          lastCheckState = false;
        } else {
          counters.length = 0;
          child.removeAttribute("data-marker");
          child.style.removeProperty("--fk-marker-pad");

          if (listType === "bullet") {
            const level = Math.max(0, Math.min(MAX_LIST_LEVEL, Number(child.dataset.level) || 0));
            child.dataset.level = String(level);
            child.removeAttribute("data-has-line");
            child.removeAttribute("data-has-sub");
            lastCheckState = false;
          } else if (listType === "check") {
            lastCheckState = child.dataset.checked === "true";
            child.dataset.checked = lastCheckState ? "true" : "false";
          } else if (listType === "check-sub") {
            child.dataset.checked = lastCheckState ? "true" : "false";
            child.removeAttribute("data-has-line");
            child.removeAttribute("data-has-sub");
          }
        }

        this._applyHybridFloatMode(child, leftImages, bodyRect);
      }

      for (const child of children) {
        if (child.dataset.list !== "check") continue;

        const nextEl = child.nextElementSibling;
        const isSubNext = Boolean(nextEl && nextEl.dataset.list === "check-sub");
        const childRect = child.getBoundingClientRect();
        const alignedSub =
          isSubNext && Math.abs(childRect.left - nextEl.getBoundingClientRect().left) < 4;
        const lineHeight = parseFloat(window.getComputedStyle(child).lineHeight) || 23.25;
        const isMultiline = childRect.height > lineHeight * 1.45;

        if (alignedSub || isMultiline) child.dataset.hasLine = "true";
        else child.removeAttribute("data-has-line");

        if (alignedSub) child.dataset.hasSub = "true";
        else child.removeAttribute("data-has-sub");
      }
    } finally {
      this._updating = false;
    }
  }

  _applyHybridFloatMode(el, leftImages, bodyRect) {
    if (!leftImages.length) {
      el.removeAttribute("data-list-side");
      el.style.removeProperty("--fk-float-offset");
      el.style.removeProperty("--fk-wrap-rail-h");
      return;
    }

    const elRect = el.getBoundingClientRect();
    let maxRight = bodyRect.left;
    let maxBottom = -Infinity;
    let hasInsideImg = false;

    for (const img of leftImages) {
      const imgRect = img.getBoundingClientRect();
      if (!imgRect.height || !imgRect.width) continue;

      const style = window.getComputedStyle(img);
      const mTop = parseFloat(style.marginTop) || 0;
      const mRight = parseFloat(style.marginRight) || 0;
      const mBottom = parseFloat(style.marginBottom) || 0;

      const floatTop = imgRect.top - mTop;
      const floatBottom = imgRect.bottom + mBottom;

      if (floatTop <= elRect.top + 12 && floatBottom > elRect.top + 2) {
        maxRight = Math.max(maxRight, imgRect.right + mRight);
        maxBottom = Math.max(maxBottom, floatBottom);
        if (el.contains(img)) hasInsideImg = true;
      }
    }

    const offset = Math.max(0, Math.round(maxRight - bodyRect.left));
    if (offset <= 0) {
      el.removeAttribute("data-list-side");
      el.style.removeProperty("--fk-float-offset");
      el.style.removeProperty("--fk-wrap-rail-h");
      return;
    }

    const lineHeight = parseFloat(window.getComputedStyle(el).lineHeight) || 23.25;
    const fitsBeside = (rect) => rect.bottom - lineHeight * 0.65 <= maxBottom;
    const calcClampedRailH = (rect) => {
      const maxBlockH = Math.max(1, Math.floor(rect.height - 1));
      return Math.max(1, Math.min(maxBlockH, Math.ceil(maxBottom - rect.top)));
    };

    if (!hasInsideImg && fitsBeside(elRect)) {
      el.dataset.listSide = "beside-left";
      el.style.removeProperty("--fk-float-offset");
      el.style.removeProperty("--fk-wrap-rail-h");

      const afterRect = el.getBoundingClientRect();
      if (!fitsBeside(afterRect)) {
        el.dataset.listSide = "wrap-left";
        el.style.setProperty("--fk-float-offset", `${offset}px`);
        el.style.setProperty("--fk-wrap-rail-h", `${calcClampedRailH(afterRect)}px`);
      }
      return;
    }

    el.dataset.listSide = "wrap-left";
    el.style.setProperty("--fk-float-offset", `${offset}px`);
    el.style.setProperty("--fk-wrap-rail-h", `${calcClampedRailH(elRect)}px`);
  }

  cleanForSave(root) {
    root
      .querySelectorAll("[data-marker], [data-has-line], [data-has-sub], [data-list-side], [data-list]")
      .forEach((el) => {
        el.removeAttribute("data-marker");
        el.removeAttribute("data-has-line");
        el.removeAttribute("data-has-sub");
        el.removeAttribute("data-list-side");
        el.style.removeProperty("--fk-float-offset");
        el.style.removeProperty("--fk-wrap-rail-h");
        el.style.removeProperty("--fk-marker-pad");
        if (!el.getAttribute("style")?.trim()) el.removeAttribute("style");
      });
  }

  /* ================= UTILITÁRIOS ================= */

  _clearRuntimeAttrs(el) {
    el.removeAttribute("data-marker");
    el.removeAttribute("data-has-line");
    el.removeAttribute("data-has-sub");
    el.removeAttribute("data-list-side");
    el.style.removeProperty("--fk-float-offset");
    el.style.removeProperty("--fk-wrap-rail-h");
    el.style.removeProperty("--fk-marker-pad");
    if (!el.getAttribute("style")?.trim()) el.removeAttribute("style");
  }

  _clearBlockList(el) {
    el.removeAttribute("data-list");
    el.removeAttribute("data-level");
    el.removeAttribute("data-checked");
    this._clearRuntimeAttrs(el);
  }

  _getCurrentRange() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    return this.body?.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
  }

  _restoreRange(range) {
    if (!this.body) return;
    this.body.focus();
    if (!range || !this.body.contains(range.startContainer)) return;

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  _getTopBlock(node, offset = 0) {
    if (!node || !this.body) return null;

    if (node === this.body) {
      const child =
        this.body.childNodes[offset] ||
        this.body.childNodes[Math.max(0, offset - 1)] ||
        null;
      return child instanceof Element && !child.classList.contains("fk-img-block") ? child : null;
    }

    if (!this.body.contains(node)) return null;

    let cur = node;
    while (cur && cur.parentNode !== this.body) {
      cur = cur.parentNode;
    }
    return cur instanceof Element && !cur.classList.contains("fk-img-block") ? cur : null;
  }

  _getBlocksInRange(range) {
    const startBlock = this._getTopBlock(range.startContainer, range.startOffset);
    let endBlock = this._getTopBlock(range.endContainer, range.endOffset);
    if (!startBlock) return [];
    if (!endBlock) endBlock = startBlock;

    if (
      !range.collapsed &&
      endBlock !== startBlock &&
      range.endOffset === 0 &&
      this._isAtStartOfBlock(range.endContainer, endBlock)
    ) {
      const prev = endBlock.previousElementSibling;
      if (prev) endBlock = prev;
    }

    const result = [];
    let cur = startBlock;
    while (cur) {
      if (!cur.classList.contains("fk-img-block")) result.push(cur);
      if (cur === endBlock) break;
      cur = cur.nextElementSibling;
    }
    return result;
  }

  _isAtStartOfBlock(node, block) {
    if (node === block) return true;
    let cur = node;
    while (cur && cur !== block) {
      if (cur.previousSibling) return false;
      cur = cur.parentNode;
    }
    return cur === block;
  }

  _isBlockEmpty(block) {
    if (!block) return true;
    if (block.querySelector(".fk-img-block")) return false;
    return block.textContent.replace(/\u200B/g, "").trim().length === 0;
  }

  _isCaretAtBlockStart(range, block) {
    const before = document.createRange();
    before.setStart(block, 0);
    before.setEnd(range.startContainer, range.startOffset);

    const frag = before.cloneContents();
    if (frag.querySelector(".fk-img-block, br")) return false;
    return frag.textContent.replace(/\u200B/g, "").length === 0;
  }

  _placeCaretAtStart(el) {
    const range = document.createRange();
    range.setStart(el, 0);
    range.collapse(true);

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}