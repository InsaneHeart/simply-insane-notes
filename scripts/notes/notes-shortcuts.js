const INLINE_RULES = [
  { regex: /(^|[^*])\*\*([^\s*](?:[^*]*[^\s*])?)\*\*$/, tag: "b" },
  { regex: /(^|[^*])\*([^\s*](?:[^*]*[^\s*])?)\*$/, tag: "i" },
  { regex: /(^|[^~])~~([^\s~](?:[^~]*[^\s~])?)~~$/, tag: "s" },
  { regex: /(^|[^_])__([^\s_](?:[^_]*[^\s_])?)__$/, tag: "u" }
];

export class EditorShortcuts {
  constructor(editor) {
    this.editor = editor;
    this.body = null;
    this.canEdit = true;
    this._lastAutoRevert = null;
  }

  /* ================= CONEXÃO ================= */

  attach(body, { canEdit = true } = {}) {
    this.body = body;
    this.canEdit = canEdit;
    this._lastAutoRevert = null;

    if (!canEdit) return;

    body.addEventListener("keydown", (e) => this._onKeyDown(e), true);
    body.addEventListener("input", (e) => this._onInput(e));
    body.addEventListener("mousedown", () => {
      this._lastAutoRevert = null;
    });
  }

  /* ================= TECLADO (CAPTURA) ================= */

  _onKeyDown(e) {
    if (!this.canEdit || !this.body) return;

    // 1. Reverter imediatamente o último atalho de digitação (Esc, Backspace ou Ctrl+Z)
    if (this._lastAutoRevert) {
      const isMod = e.ctrlKey || e.metaKey;
      const isRevertKey =
        (!isMod && !e.altKey && !e.shiftKey && (e.key === "Escape" || e.key === "Backspace")) ||
        (isMod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "z");

      if (isRevertKey) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this._performRevert();
        return;
      }

      if (!["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
        this._lastAutoRevert = null;
      }
    }

    const isMod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    // 2. Atalhos de teclado Ctrl / Alt
    if (e.altKey && !isMod && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      if (this._moveCurrentBlock(e.key === "ArrowUp" ? -1 : 1)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
      return;
    }

    if (isMod && !e.altKey && !e.shiftKey && e.key === "Enter") {
      if (this._toggleChecklistAtCaret()) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
      return;
    }

    if (isMod && e.altKey && !e.shiftKey && (e.code === "Digit1" || e.key === "1")) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.editor.formatting.toggleSubtitle();
      return;
    }

    if (isMod && e.shiftKey && !e.altKey) {
      if (key === "h") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.editor.formatting.toggleSubtitle();
        return;
      }
      if (e.code === "Period" || e.key === ">" || e.key === ".") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.editor.formatting.stepFontSize(1);
        return;
      }
      if (e.code === "Comma" || e.key === "<" || e.key === ",") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.editor.formatting.stepFontSize(-1);
        return;
      }
      if (key === "l" || key === "e" || key === "r" || key === "j") {
        const alignMap = { l: "left", e: "center", r: "right", j: "justify" };
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.editor.formatting.setAlignment(alignMap[key]);
        return;
      }
      if (key === "d") {
        if (this._duplicateCurrentBlock()) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
        return;
      }
    }

    if (isMod || e.altKey) return;

    // 3. Backspace na linha logo abaixo de uma caixa → entra no final do conteúdo dela
    if (e.key === "Backspace" && !e.shiftKey) {
      if (this._handleBackspaceAfterBox(e)) return;
      if (this._handleSubtitleBackspace(e)) return;
    }

    // 4. Atalhos de digitação em linha vazia (Espaço / Enter)
    if (!e.shiftKey && (e.key === " " || e.key === "Enter")) {
      if (this._tryBlockAutoShortcut(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    }
  }

  /* ================= INPUT ([[ E FORMATAÇÃO INLINE) ================= */

  _onInput(e) {
    if (!this.canEdit || !this.body || this.editor._isBulkInserting) return;
    if (e.inputType && !e.inputType.startsWith("insert")) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    if (!this.body.contains(range.startContainer)) return;
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return;

    const hostEl = range.startContainer.parentElement;
    if (hostEl?.closest?.(".fk-box-code, .fk-link, .fk-note-link, .fk-mention")) return;

    const textNode = range.startContainer;
    const offset = range.startOffset;
    const before = textNode.textContent.slice(0, offset);

    // 1. [[ para linkar nota
    if (before.endsWith("[[")) {
      this._triggerNoteLinkBracket(textNode, offset);
      return;
    }

    // 2. Formatação inline ao fechar o par (**negrito**, *itálico*, ~~riscado~~, __sublinhado__)
    if (hostEl?.closest?.(".fk-box-drawer-title, .fk-box-quote-author")) return;
    const lastChar = before.slice(-1);
    if (lastChar === "*" || lastChar === "~" || lastChar === "_") {
      this._tryInlineFormat(textNode, offset);
    }
  }

  /* ================= AUTO-CONVERSÃO DE BLOCOS EM LINHA VAZIA ================= */

  _tryBlockAutoShortcut(triggerKey) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;

    const range = sel.getRangeAt(0);
    if (!this.body.contains(range.startContainer)) return false;

    const hostEl =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer;
    if (hostEl?.closest?.(".fk-box, .fk-table-block")) return false;

    const block = this._getTopBlock(range.startContainer, range.startOffset);
    if (!block || block.parentNode !== this.body) return false;
    if (
      block.classList.contains("fk-box") ||
      block.classList.contains("fk-divider-block") ||
      block.classList.contains("fk-img-block") ||
      block.classList.contains("fk-table-block") ||
      block.nodeName === "H3" ||
      block.dataset.list ||
      block.dataset.quote === "true"
    ) {
      return false;
    }

    if (!this._isCaretAtBlockEnd(range, block)) return false;
    if (block.querySelector(".fk-img-block, .fk-note-link, .fk-mention")) return false;

    const raw = block.textContent.replace(/\u200B/g, "").replace(/\u00A0/g, " ");
    const isEnter = triggerKey === "Enter";
    const isSpace = triggerKey === " ";
    const revertText = isSpace ? `${raw} ` : raw;

    // Atalhos exclusivos de Enter (// gaveta, ! nota)
    if (isEnter && raw === "//") {
      return this._convertEmptyBlockToBox(block, "drawer", revertText);
    }
    if (isEnter && raw === "!") {
      return this._convertEmptyBlockToBox(block, "note", revertText);
    }

    // Atalhos de Espaço ou Enter
    if (raw === ">") {
      this._clearBlockContent(block);
      block.dataset.quote = "true";
      this._placeCaretAtStart(block);
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      this._lastAutoRevert = { kind: "block-attr", block, rawText: revertText };
      return true;
    }

    if (raw === '"""') {
      return this._convertEmptyBlockToBox(block, "quote", revertText);
    }

    if (raw === "```") {
      return this._convertEmptyBlockToBox(block, "code", revertText);
    }

    if (raw === "---") {
      this._clearBlockContent(block);
      const nextSibBefore = block.nextElementSibling;
      this.editor.blocks.insertDivider(this._collapsedStartRange(block));
      const divider = nextSibBefore
        ? nextSibBefore.previousElementSibling?.classList.contains("fk-divider-block")
          ? nextSibBefore.previousElementSibling
          : this.body.querySelector(".fk-divider-block:last-of-type")
        : this.body.querySelector(".fk-divider-block:last-of-type");
      this._lastAutoRevert = { kind: "divider", divider, rawText: revertText };
      return true;
    }

    if (raw === "##") {
      const h3 = document.createElement("h3");
      h3.appendChild(document.createElement("br"));
      block.replaceWith(h3);
      this._placeCaretAtStart(h3);
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      this._lastAutoRevert = { kind: "subtitle", block: h3, rawText: revertText };
      return true;
    }

    if (raw === "1.") {
      this._clearBlockContent(block);
      block.dataset.list = "number";
      block.dataset.level = "0";
      this._placeCaretAtStart(block);
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      this._lastAutoRevert = { kind: "block-attr", block, rawText: revertText };
      return true;
    }

    if (raw === "-" || raw === "*" || raw === ".") {
      this._clearBlockContent(block);
      block.dataset.list = "bullet";
      block.dataset.level = "0";
      this._placeCaretAtStart(block);
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      this._lastAutoRevert = { kind: "block-attr", block, rawText: revertText };
      return true;
    }

    if (raw === "[]" || raw === "[ ]" || raw === "[]-" || raw === "[x]" || raw === "[X]") {
      const checked = raw === "[x]" || raw === "[X]";
      this._clearBlockContent(block);
      block.dataset.list = "check";
      block.dataset.checked = checked ? "true" : "false";
      this._placeCaretAtStart(block);
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      this._lastAutoRevert = { kind: "block-attr", block, rawText: revertText };
      return true;
    }

    return false;
  }

  _convertEmptyBlockToBox(block, type, revertText) {
    this._clearBlockContent(block);
    const prevSib = block.previousElementSibling;
    this.editor.boxes.insertBox(type, this._collapsedStartRange(block));

    const insertedBox = prevSib
      ? prevSib.nextElementSibling?.classList.contains("fk-box")
        ? prevSib.nextElementSibling
        : this.body.querySelector(`.fk-box[data-box="${type}"]`)
      : this.body.firstElementChild?.classList.contains("fk-box")
        ? this.body.firstElementChild
        : this.body.querySelector(`.fk-box[data-box="${type}"]`);

    this._lastAutoRevert = { kind: "box", box: insertedBox, rawText: revertText };
    return true;
  }

  /* ================= LINKAR NOTA ([[) ================= */

  _triggerNoteLinkBracket(textNode, offset) {
    const start = offset - 2;

    let anchorPoint = null;
    try {
      const tokenRange = document.createRange();
      tokenRange.setStart(textNode, start);
      tokenRange.setEnd(textNode, offset);
      const rect = tokenRange.getBoundingClientRect();
      if (rect && (rect.width || rect.height)) {
        anchorPoint = { x: rect.left, y: rect.bottom, top: rect.top };
      }
    } catch {
      anchorPoint = null;
    }

    const raw = textNode.textContent;
    textNode.textContent = raw.slice(0, start) + raw.slice(offset);

    const range = document.createRange();
    range.setStart(textNode, start);
    range.collapse(true);

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    this.editor.links.openNoteLinkPicker(range, anchorPoint);
  }

  /* ================= FORMATAÇÃO INLINE ================= */

  _tryInlineFormat(textNode, offset) {
    const before = textNode.textContent.slice(0, offset);

    for (const rule of INLINE_RULES) {
      const match = before.match(rule.regex);
      if (!match) continue;

      const prefix = match[1] || "";
      const innerText = match[2];
      const fullToken = match[0].slice(prefix.length);
      const tokenStart = offset - fullToken.length;

      const afterText = textNode.textContent.slice(offset);
      const beforeText = textNode.textContent.slice(0, tokenStart);

      const el = document.createElement(rule.tag);
      el.textContent = innerText;

      const spacer = document.createTextNode("\u200B");
      const frag = document.createDocumentFragment();
      if (beforeText) frag.appendChild(document.createTextNode(beforeText));
      frag.appendChild(el);
      frag.appendChild(spacer);
      if (afterText) frag.appendChild(document.createTextNode(afterText));

      textNode.replaceWith(frag);

      const newRange = document.createRange();
      newRange.setStart(spacer, 1);
      newRange.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(newRange);

      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      this._lastAutoRevert = { kind: "inline", el, spacer, rawText: fullToken };
      return true;
    }

    return false;
  }

  /* ================= REVERT IMEDIATO ================= */

  _performRevert() {
    const rev = this._lastAutoRevert;
    this._lastAutoRevert = null;
    if (!rev) return;

    if (rev.kind === "inline") {
      if (!rev.el?.isConnected) return;
      const textNode = document.createTextNode(rev.rawText);
      rev.el.replaceWith(textNode);
      if (rev.spacer?.isConnected && rev.spacer.textContent === "\u200B") {
        rev.spacer.remove();
      }
      this._placeCaretAtEndOfTextNode(textNode);
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      return;
    }

    if (rev.kind === "block-attr" && rev.block?.isConnected) {
      const b = rev.block;
      b.removeAttribute("data-list");
      b.removeAttribute("data-level");
      b.removeAttribute("data-checked");
      b.removeAttribute("data-marker");
      b.removeAttribute("data-has-line");
      b.removeAttribute("data-has-sub");
      b.removeAttribute("data-list-side");
      b.removeAttribute("data-quote");
      b.removeAttribute("data-quote-color");
      b.removeAttribute("data-quote-pos");
      b.removeAttribute("data-block-side");
      b.innerHTML = "";
      const textNode = document.createTextNode(rev.rawText);
      b.appendChild(textNode);
      this._placeCaretAtEndOfTextNode(textNode);
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      return;
    }

    if (rev.kind === "subtitle" && rev.block?.isConnected) {
      const div = document.createElement("div");
      const textNode = document.createTextNode(rev.rawText);
      div.appendChild(textNode);
      rev.block.replaceWith(div);
      this._placeCaretAtEndOfTextNode(textNode);
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      return;
    }

    if (rev.kind === "divider" && rev.divider?.isConnected) {
      const div = document.createElement("div");
      const textNode = document.createTextNode(rev.rawText);
      div.appendChild(textNode);
      rev.divider.replaceWith(div);
      this._placeCaretAtEndOfTextNode(textNode);
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      return;
    }

    if (rev.kind === "box" && rev.box?.isConnected) {
      const div = document.createElement("div");
      const textNode = document.createTextNode(rev.rawText);
      div.appendChild(textNode);
      rev.box.replaceWith(div);
      this._placeCaretAtEndOfTextNode(textNode);
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
    }
  }

  /* ================= BACKSPACE ABAIXO DE CAIXA / SUBTÍTULO ================= */

  _handleBackspaceAfterBox(e) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;

    const range = sel.getRangeAt(0);
    if (!this.body.contains(range.startContainer)) return false;

    const hostEl =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer;
    if (hostEl?.closest?.(".fk-box, .fk-table-block")) return false;

    const block = this._getTopBlock(range.startContainer, range.startOffset);
    if (!block || block.dataset.list || block.dataset.quote === "true") return false;
    if (!this._isCaretAtBlockStart(range, block)) return false;

    const prev = block.previousElementSibling;
    if (!prev?.classList?.contains("fk-box")) return false;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    this.editor.boxes.focusBoxEnd(prev);
    return true;
  }

  _handleSubtitleBackspace(e) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;

    const range = sel.getRangeAt(0);
    if (!this.body.contains(range.startContainer)) return false;

    const block = this._getTopBlock(range.startContainer, range.startOffset);
    if (!block || block.nodeName !== "H3") return false;
    if (!this._isCaretAtBlockStart(range, block)) return false;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const div = document.createElement("div");
    while (block.firstChild) div.appendChild(block.firstChild);
    if (!div.childNodes.length) div.appendChild(document.createElement("br"));
    block.replaceWith(div);

    this._placeCaretAtStart(div);
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
    return true;
  }

  /* ================= CHECKLIST PELO TECLADO (CTRL+ENTER) ================= */

  _toggleChecklistAtCaret() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!this.body.contains(range.startContainer)) return false;

    let block = this._getTopBlock(range.startContainer, range.startOffset);
    if (!block) return false;

    if (block.dataset.list === "check-sub") {
      let cur = block.previousElementSibling;
      while (cur && cur.dataset.list === "check-sub") {
        cur = cur.previousElementSibling;
      }
      if (cur?.dataset.list === "check") block = cur;
      else return false;
    }

    if (block.dataset.list !== "check") return false;

    const isChecked = block.dataset.checked === "true";
    block.dataset.checked = isChecked ? "false" : "true";
    this.editor.lists.updateMarkers();
    this.editor.notifyChange({ immediate: false });
    return true;
  }

  /* ================= MOVER (ALT+↑/↓) E DUPLICAR (CTRL+SHIFT+D) LINHA ================= */

  _moveCurrentBlock(direction) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;

    const range = sel.getRangeAt(0);
    if (!this.body.contains(range.startContainer)) return false;

    const hostEl =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer;
    if (hostEl?.closest?.(".fk-box, .fk-table-block")) return false;

    const block = this._getTopBlock(range.startContainer, range.startOffset);
    if (!block || block.parentNode !== this.body) return false;

    const sibling = direction < 0 ? block.previousElementSibling : block.nextElementSibling;
    if (!sibling) return false;

    const saved = range.cloneRange();
    if (direction < 0) {
      sibling.before(block);
    } else {
      sibling.after(block);
    }

    sel.removeAllRanges();
    sel.addRange(saved);
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
    return true;
  }

  _duplicateCurrentBlock() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;

    const range = sel.getRangeAt(0);
    if (!this.body.contains(range.startContainer)) return false;

    const hostEl =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer;
    if (hostEl?.closest?.(".fk-box, .fk-table-block")) return false;

    const block = this._getTopBlock(range.startContainer, range.startOffset);
    if (
      !block ||
      block.parentNode !== this.body ||
      block.classList.contains("fk-box") ||
      block.classList.contains("fk-table-block") ||
      block.classList.contains("fk-img-block")
    ) {
      return false;
    }

    const clone = block.cloneNode(true);
    block.after(clone);

    const newRange = document.createRange();
    newRange.selectNodeContents(clone);
    newRange.collapse(false);
    sel.removeAllRanges();
    sel.addRange(newRange);

    this.editor.refresh();
    this.editor.spellcheck?.scheduleCheck?.();
    this.editor.notifyChange({ immediate: false });
    return true;
  }

  /* ================= UTILITÁRIOS ================= */

  _clearBlockContent(block) {
    block.innerHTML = "";
    block.appendChild(document.createElement("br"));
  }

  _collapsedStartRange(el) {
    const r = document.createRange();
    r.setStart(el, 0);
    r.collapse(true);
    return r;
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

  _isCaretAtBlockStart(range, block) {
    const before = document.createRange();
    before.setStart(block, 0);
    before.setEnd(range.startContainer, range.startOffset);

    const frag = before.cloneContents();
    if (frag.querySelector(".fk-img-block, br, .fk-note-link, .fk-mention")) return false;
    return frag.textContent.replace(/\u200B/g, "").length === 0;
  }

  _isCaretAtBlockEnd(range, block) {
    const after = document.createRange();
    after.setStart(range.endContainer, range.endOffset);
    after.setEnd(block, block.childNodes.length);

    const frag = after.cloneContents();
    if (frag.querySelector(".fk-img-block, .fk-note-link, .fk-mention")) return false;
    return frag.textContent.replace(/\u200B/g, "").length === 0;
  }

  _placeCaretAtStart(el) {
    el.focus({ preventScroll: true });
    const range = document.createRange();
    range.setStart(el, 0);
    range.collapse(true);

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  _placeCaretAtEndOfTextNode(textNode) {
    const range = document.createRange();
    range.setStart(textNode, textNode.length);
    range.collapse(true);

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}