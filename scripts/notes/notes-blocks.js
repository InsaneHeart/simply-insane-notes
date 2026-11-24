const QUOTE_BAR_HIT_WIDTH = 18;

export class EditorBlocks {
  constructor(editor) {
    this.editor = editor;
    this.body = null;
    this.canEdit = true;
    this._updating = false;
  }

  /* ================= CONEXÃO ================= */

  attach(body, { canEdit = true } = {}) {
    this.body = body;
    this.canEdit = canEdit;
    if (!canEdit) return;

    body.addEventListener("keydown", (e) => this._onKeyDown(e));
  }

  /* ================= SERIALIZAÇÃO E HIDRATAÇÃO ================= */

  hydrate() {
    if (!this.body) return;

    this.body.querySelectorAll(".fk-divider-block, [data-divider='true']").forEach((el) => {
      el.classList.add("fk-divider-block");
      el.dataset.divider = "true";
      el.setAttribute("contenteditable", "false");
      this._applyDividerColorStyle(el);
    });

    this.body.querySelectorAll("[data-quote='true']").forEach((el) => {
      this._applyQuoteColorStyle(el);
    });
  }

  cleanForSave(root) {
    root.querySelectorAll("[data-quote='true']").forEach((el) => {
      el.removeAttribute("data-quote-pos");
      el.removeAttribute("data-block-side");
      el.style.removeProperty("--fk-quote-color");
      el.style.removeProperty("--fk-block-float-offset");
      el.style.removeProperty("--fk-block-rail-h");
      if (!el.getAttribute("style")?.trim()) el.removeAttribute("style");
    });

    root.querySelectorAll(".fk-divider-block").forEach((el) => {
      el.setAttribute("contenteditable", "false");
      el.dataset.divider = "true";
      el.style.removeProperty("--fk-divider-color");
      if (!el.getAttribute("style")?.trim()) el.removeAttribute("style");
    });
  }

  /* ================= RECUO COM BARRA ================= */

  toggleQuote(range = null) {
    if (!this.canEdit || !this.body) return null;
    if (range) this._restoreRange(range);
    else this.body.focus({ preventScroll: true });

    const activeRange = this._getCurrentRange();
    if (!activeRange) return null;

    const blocks = this._getBlocksInRange(activeRange).filter(
      (b) => !b.classList.contains("fk-divider-block")
    );
    if (!blocks.length) return activeRange;

    const allQuoted = blocks.every((b) => b.dataset.quote === "true");

    for (const block of blocks) {
      let target = block;
      if (target.nodeName === "H3" || target.nodeName === "P") {
        const div = document.createElement("div");
        if (target.dataset.align) div.dataset.align = target.dataset.align;
        while (target.firstChild) div.appendChild(target.firstChild);
        if (!div.childNodes.length) div.appendChild(document.createElement("br"));
        target.replaceWith(div);
        target = div;
      }

      if (allQuoted) {
        this._clearQuoteAttrs(target);
      } else {
        this._clearListAttrs(target);
        target.dataset.quote = "true";
        target.removeAttribute("data-quote-color");
        this._applyQuoteColorStyle(target);
      }
    }

    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
    return this._getCurrentRange();
  }

  setQuoteColor(block, hex) {
    if (!this.canEdit || !block || !this.body?.contains(block)) return;

    const group = this._getContiguousQuoteGroup(block);
    for (const el of group) {
      if (hex) el.dataset.quoteColor = hex;
      else el.removeAttribute("data-quote-color");
      this._applyQuoteColorStyle(el);
    }

    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
  }

  removeQuote(block) {
    if (!this.canEdit || !block || !this.body?.contains(block)) return;

    const group = this._getContiguousQuoteGroup(block);
    for (const el of group) {
      this._clearQuoteAttrs(el);
    }

    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
  }

  getQuoteBarAtPoint(x, y) {
    if (!this.body) return null;

    const quotes = Array.from(this.body.children).filter(
      (el) => el.dataset?.quote === "true"
    );

    for (const el of quotes) {
      const rect = el.getBoundingClientRect();
      if (y < rect.top - 2 || y > rect.bottom + 2) continue;

      const floatOffset =
        el.dataset.blockSide === "wrap-left"
          ? parseFloat(el.style.getPropertyValue("--fk-block-float-offset")) || 0
          : 0;
      const railH =
        el.dataset.blockSide === "wrap-left"
          ? parseFloat(el.style.getPropertyValue("--fk-block-rail-h")) || 0
          : 0;

      const hitLeft =
        el.dataset.blockSide === "wrap-left" && y - rect.top > railH
          ? rect.left
          : rect.left + floatOffset;

      if (x >= hitLeft - 4 && x <= hitLeft + QUOTE_BAR_HIT_WIDTH) {
        return el;
      }
    }

    return null;
  }

  /* ================= LINHA DIVISÓRIA ================= */

  insertDivider(range = null) {
    if (!this.canEdit || !this.body) return null;
    if (range) this._restoreRange(range);
    else this.body.focus({ preventScroll: true });

    const activeRange = this._getCurrentRange();
    const block = activeRange
      ? this._getTopBlock(activeRange.startContainer, activeRange.startOffset)
      : this.body.lastElementChild;

    const divider = document.createElement("div");
    divider.className = "fk-divider-block";
    divider.dataset.divider = "true";
    divider.setAttribute("contenteditable", "false");

    if (block && block.parentNode === this.body) {
      if (
        !block.classList.contains("fk-divider-block") &&
        !block.classList.contains("fk-img-block") &&
        this._isBlockEmpty(block) &&
        !block.dataset.list &&
        block.dataset.quote !== "true"
      ) {
        block.replaceWith(divider);
      } else {
        block.after(divider);
      }
    } else {
      this.body.appendChild(divider);
    }

    let nextLine = divider.nextElementSibling;
    if (
      !nextLine ||
      nextLine.classList.contains("fk-divider-block") ||
      nextLine.classList.contains("fk-img-block")
    ) {
      nextLine = document.createElement("div");
      nextLine.appendChild(document.createElement("br"));
      divider.after(nextLine);
    }

    this._placeCaretAtStart(nextLine);
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
    return this._getCurrentRange();
  }

  setDividerColor(divider, hex) {
    if (!this.canEdit || !divider || !this.body?.contains(divider)) return;
    if (hex) divider.dataset.dividerColor = hex;
    else divider.removeAttribute("data-divider-color");
    this._applyDividerColorStyle(divider);
    this.editor.notifyChange({ immediate: false });
  }

  deleteDivider(divider) {
    if (!this.canEdit || !divider || !this.body?.contains(divider)) return;
    const targetFocus = divider.previousElementSibling || divider.nextElementSibling;
    divider.remove();
    this.editor.refresh();
    if (
      targetFocus &&
      targetFocus.isConnected &&
      !targetFocus.classList.contains("fk-img-block") &&
      !targetFocus.classList.contains("fk-divider-block")
    ) {
      this._placeCaretAtStart(targetFocus);
    }
    this.editor.notifyChange({ immediate: false });
  }

  /* ================= TECLADO ================= */

  _onKeyDown(e) {
    if (!this.canEdit || !this.body) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === "Enter") {
      this._handleEnter(e);
      return;
    }

    if (e.key === "Backspace" && !e.shiftKey) {
      this._handleBackspace(e);
      return;
    }

    if (e.key === "Delete" && !e.shiftKey) {
      this._handleDelete(e);
    }
  }

  _handleEnter(e) {
    const range = this._getCurrentRange();
    if (!range) return;

    let block = this._getTopBlock(range.startContainer, range.startOffset);
    if (!block || block.dataset.quote !== "true") return;

    e.preventDefault();
    e.stopImmediatePropagation();

    if (!range.collapsed) {
      range.deleteContents();
    }

    if (this._isBlockEmpty(block)) {
      this._clearQuoteAttrs(block);
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

    if (block.nodeName === "P") {
      const div = document.createElement("div");
      div.dataset.quote = "true";
      if (block.dataset.quoteColor) div.dataset.quoteColor = block.dataset.quoteColor;
      if (block.dataset.align) div.dataset.align = block.dataset.align;
      while (block.firstChild) div.appendChild(block.firstChild);
      this._applyQuoteColorStyle(div);
      block.replaceWith(div);
      block = div;
    }

    if (this._isBlockEmpty(block) && !block.querySelector("br")) {
      block.appendChild(document.createElement("br"));
    }

    const nextBlock = document.createElement("div");
    if (block.dataset.align) nextBlock.dataset.align = block.dataset.align;

    if (!e.shiftKey) {
      nextBlock.dataset.quote = "true";
      if (block.dataset.quoteColor) {
        nextBlock.dataset.quoteColor = block.dataset.quoteColor;
      }
      this._applyQuoteColorStyle(nextBlock);
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

    const block = this._getTopBlock(range.startContainer, range.startOffset);
    if (!block || !this._isCaretAtBlockStart(range, block)) return;

    if (block.dataset.quote === "true") {
      e.preventDefault();
      e.stopImmediatePropagation();
      this._clearQuoteAttrs(block);
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      return;
    }

    const prev = block.previousElementSibling;
    if (prev?.classList.contains("fk-divider-block")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      prev.remove();
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
    }
  }

  _handleDelete(e) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    if (!this.body.contains(range.startContainer)) return;

    const block = this._getTopBlock(range.startContainer, range.startOffset);
    if (!block || !this._isCaretAtBlockEnd(range, block)) return;

    const next = block.nextElementSibling;
    if (next?.classList.contains("fk-divider-block")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      next.remove();
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
    }
  }

  /* ================= LAYOUT HÍBRIDO E AGRUPAMENTO ================= */

  updateLayout() {
    if (!this.body || this._updating) return;
    this._updating = true;

    try {
      const children = Array.from(this.body.children);
      const leftImages = Array.from(
        this.body.querySelectorAll('.fk-img-block:not([data-side="right"])')
      );
      const bodyRect = this.body.getBoundingClientRect();

      for (const child of children) {
        if (child.classList.contains("fk-divider-block")) {
          this._applyDividerColorStyle(child);
          continue;
        }

        if (child.dataset.quote !== "true") {
          child.removeAttribute("data-quote-pos");
          child.removeAttribute("data-block-side");
          child.style.removeProperty("--fk-block-float-offset");
          child.style.removeProperty("--fk-block-rail-h");
          continue;
        }

        this._applyQuoteColorStyle(child);
        this._applyHybridFloatMode(child, leftImages, bodyRect);
      }

      for (let i = 0; i < children.length; i++) {
        const cur = children[i];
        if (cur.dataset.quote !== "true") continue;

        const prev = cur.previousElementSibling;
        const next = cur.nextElementSibling;
        const curColor = cur.dataset.quoteColor || "";
        const curLeft = cur.getBoundingClientRect().left;

        const samePrev =
          prev?.dataset.quote === "true" &&
          (prev.dataset.quoteColor || "") === curColor &&
          Math.abs(prev.getBoundingClientRect().left - curLeft) < 4;

        const sameNext =
          next?.dataset.quote === "true" &&
          (next.dataset.quoteColor || "") === curColor &&
          Math.abs(next.getBoundingClientRect().left - curLeft) < 4;

        if (samePrev && sameNext) cur.dataset.quotePos = "middle";
        else if (samePrev) cur.dataset.quotePos = "end";
        else if (sameNext) cur.dataset.quotePos = "start";
        else cur.dataset.quotePos = "single";
      }
    } finally {
      this._updating = false;
    }
  }

  _applyHybridFloatMode(el, leftImages, bodyRect) {
    if (!leftImages.length) {
      el.removeAttribute("data-block-side");
      el.style.removeProperty("--fk-block-float-offset");
      el.style.removeProperty("--fk-block-rail-h");
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
      el.removeAttribute("data-block-side");
      el.style.removeProperty("--fk-block-float-offset");
      el.style.removeProperty("--fk-block-rail-h");
      return;
    }

    const lineHeight = parseFloat(window.getComputedStyle(el).lineHeight) || 23.25;
    const fitsBeside = (rect) => rect.bottom - lineHeight * 0.65 <= maxBottom;
    const calcClampedRailH = (rect) => {
      const maxBlockH = Math.max(1, Math.floor(rect.height - 1));
      return Math.max(1, Math.min(maxBlockH, Math.ceil(maxBottom - rect.top)));
    };

    if (!hasInsideImg && fitsBeside(elRect)) {
      el.dataset.blockSide = "beside-left";
      el.style.removeProperty("--fk-block-float-offset");
      el.style.removeProperty("--fk-block-rail-h");

      const afterRect = el.getBoundingClientRect();
      if (!fitsBeside(afterRect)) {
        el.dataset.blockSide = "wrap-left";
        el.style.setProperty("--fk-block-float-offset", `${offset}px`);
        el.style.setProperty("--fk-block-rail-h", `${calcClampedRailH(afterRect)}px`);
      }
      return;
    }

    el.dataset.blockSide = "wrap-left";
    el.style.setProperty("--fk-block-float-offset", `${offset}px`);
    el.style.setProperty("--fk-block-rail-h", `${calcClampedRailH(elRect)}px`);
  }

  /* ================= UTILITÁRIOS ================= */

  _getContiguousQuoteGroup(block) {
    const color = block.dataset.quoteColor || "";
    const group = [block];

    let prev = block.previousElementSibling;
    while (prev && prev.dataset.quote === "true" && (prev.dataset.quoteColor || "") === color) {
      group.unshift(prev);
      prev = prev.previousElementSibling;
    }

    let next = block.nextElementSibling;
    while (next && next.dataset.quote === "true" && (next.dataset.quoteColor || "") === color) {
      group.push(next);
      next = next.nextElementSibling;
    }

    return group;
  }

  _applyQuoteColorStyle(el) {
    if (el.dataset.quoteColor) {
      el.style.setProperty("--fk-quote-color", el.dataset.quoteColor);
    } else {
      el.style.removeProperty("--fk-quote-color");
    }
  }

  _applyDividerColorStyle(el) {
    if (el.dataset.dividerColor) {
      el.style.setProperty("--fk-divider-color", el.dataset.dividerColor);
    } else {
      el.style.removeProperty("--fk-divider-color");
    }
  }

  _clearQuoteAttrs(el) {
    el.removeAttribute("data-quote");
    el.removeAttribute("data-quote-color");
    el.removeAttribute("data-quote-pos");
    el.removeAttribute("data-block-side");
    el.style.removeProperty("--fk-quote-color");
    el.style.removeProperty("--fk-block-float-offset");
    el.style.removeProperty("--fk-block-rail-h");
    if (!el.getAttribute("style")?.trim()) el.removeAttribute("style");
  }

  _clearListAttrs(el) {
    el.removeAttribute("data-list");
    el.removeAttribute("data-level");
    el.removeAttribute("data-checked");
    el.removeAttribute("data-marker");
    el.removeAttribute("data-has-line");
    el.removeAttribute("data-has-sub");
    el.removeAttribute("data-list-side");
    el.style.removeProperty("--fk-float-offset");
    el.style.removeProperty("--fk-wrap-rail-h");
    el.style.removeProperty("--fk-marker-pad");
  }

  _getCurrentRange() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    return this.body?.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
  }

  _restoreRange(range) {
    if (!this.body) return;
    this.body.focus({ preventScroll: true });
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

    const result = [];
    let cur = startBlock;
    while (cur) {
      if (!cur.classList.contains("fk-img-block")) result.push(cur);
      if (cur === endBlock) break;
      cur = cur.nextElementSibling;
    }
    return result;
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

  _isCaretAtBlockEnd(range, block) {
    const after = document.createRange();
    after.setStart(range.endContainer, range.endOffset);
    after.setEnd(block, block.childNodes.length);

    const frag = after.cloneContents();
    if (frag.querySelector(".fk-img-block")) return false;
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