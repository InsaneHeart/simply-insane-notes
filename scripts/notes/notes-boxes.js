import { t } from "../shared/shared-i18n.js";

const BOX_LABEL_KEYS = {
  drawer: "SIN.Notes.BoxDrawer",
  quote: "SIN.Notes.BoxQuote",
  note: "SIN.Notes.BoxNote",
  code: "SIN.Notes.BoxCode"
};

export class EditorBoxes {
  constructor(editor) {
    this.editor = editor;
    this.body = null;
    this.canEdit = true;
  }

  attach(body, { canEdit = true } = {}) {
    this.body = body;
    this.canEdit = canEdit;

    body.addEventListener("click", (e) => this._onClick(e));
    body.addEventListener("dblclick", (e) => this._onDoubleClick(e));
    body.addEventListener("focusin", (e) => this._onFocusIn(e));
    body.addEventListener("focusout", (e) => this._onFocusOut(e));

    if (!canEdit) return;

    body.addEventListener("keydown", (e) => this._onKeyDown(e));
    body.addEventListener("input", (e) => this._onInput(e));
    body.addEventListener("paste", (e) => this._onPaste(e), true);
  }

  hydrate(canEdit = true) {
    if (!this.body) return;

    this.body.querySelectorAll(".fk-box").forEach((box) => {
      box.setAttribute("contenteditable", "false");
      box.classList.remove("is-open", "is-editing", "is-editing-title");
      box.removeAttribute("data-clear-squeeze");

      const editableAttr = canEdit ? "true" : "false";
      box
        .querySelectorAll(
          ".fk-box-drawer-body, .fk-box-quote-body, .fk-box-quote-author, .fk-box-note-body, .fk-box-code-body"
        )
        .forEach((slot) => {
          slot.setAttribute("contenteditable", editableAttr);
          if (!slot.classList.contains("fk-box-code-body")) {
            this._normalizeEmptySlot(slot);
          }
        });

      const drawerTitle = box.querySelector(".fk-box-drawer-title");
      if (drawerTitle) {
        drawerTitle.setAttribute("contenteditable", "false");
        this._normalizeEmptySlot(drawerTitle);
      }

      if (box.dataset.box === "quote") {
        this._syncQuoteAuthorState(box);
      }
    });
  }

  cleanForSave(root) {
    root.querySelectorAll(".fk-box").forEach((box) => {
      box.setAttribute("contenteditable", "false");
      box.classList.remove("is-open", "is-editing", "is-editing-title", "has-author");
      box.removeAttribute("data-clear-squeeze");

      box.querySelectorAll(".fk-box-code-copy.is-copied").forEach((btn) => {
        btn.classList.remove("is-copied");
        btn.title = t("SIN.Notes.CopyCode");
        const icon = btn.querySelector("i");
        if (icon) icon.className = "fas fa-copy";
      });

      box
        .querySelectorAll(
          ".fk-box-drawer-title, .fk-box-drawer-body, .fk-box-quote-body, .fk-box-quote-author, .fk-box-note-body, .fk-box-code-body"
        )
        .forEach((slot) => {
          slot.removeAttribute("contenteditable");
          if (!slot.classList.contains("fk-box-code-body")) {
            this._normalizeEmptySlot(slot);
          }
        });
    });
  }

  insertBox(type, range = null) {
    if (!this.canEdit || !this.body) return null;
    if (range) this._restoreRange(range);
    else this.body.focus({ preventScroll: true });

    const activeRange = this._getCurrentRange();
    const block = activeRange
      ? this._getTopBlock(activeRange.startContainer, activeRange.startOffset)
      : this.body.lastElementChild;
    const endBlock =
      activeRange && !activeRange.collapsed
        ? this._getTopBlock(activeRange.endContainer, activeRange.endOffset)
        : null;

    const insertAnchor =
      block && block.parentNode === this.body ? block.nextSibling : null;

    const extracted = this._extractSelectionForBox(activeRange);

    const box = this._buildBox(type);
    if (!box) return activeRange;

    if (extracted) {
      this._populateBoxWithSelection(box, type, extracted);
    }

    if (
      endBlock &&
      endBlock !== block &&
      endBlock.parentNode === this.body &&
      !this._isSpecialBlock(endBlock) &&
      this._isBlockEmpty(endBlock)
    ) {
      endBlock.remove();
    }

    if (block && block.parentNode === this.body) {
      if (
        !this._isSpecialBlock(block) &&
        this._isBlockEmpty(block) &&
        !block.dataset.list &&
        block.dataset.quote !== "true"
      ) {
        block.replaceWith(box);
      } else {
        block.after(box);
      }
    } else if (insertAnchor && insertAnchor.parentNode === this.body) {
      this.body.insertBefore(box, insertAnchor);
    } else {
      this.body.appendChild(box);
    }

    let nextLine = box.nextElementSibling;
    if (!nextLine || this._isSpecialBlock(nextLine)) {
      nextLine = document.createElement("div");
      nextLine.appendChild(document.createElement("br"));
      box.after(nextLine);
    }

    const focusTarget =
      type === "drawer"
        ? box.querySelector(".fk-box-drawer-title")
        : type === "quote"
          ? box.querySelector(".fk-box-quote-body")
          : type === "code"
            ? box.querySelector(".fk-box-code-body")
            : box.querySelector(".fk-box-note-body");

    if (type === "drawer") {
      box.classList.add("is-open", "is-editing-title");
      focusTarget?.setAttribute("contenteditable", "true");
    }
    if (type === "quote") {
      box.classList.add("is-editing");
    }

    this.editor.refresh();
    if (focusTarget) {
      if (extracted && type !== "drawer") {
        this._placeCaretAtEnd(focusTarget);
      } else {
        this._placeCaretAtStart(focusTarget);
      }
    }
    this.editor.spellcheck?.scheduleCheck?.();
    this.editor.notifyChange({ immediate: false });
    return this._getCurrentRange();
  }

  deleteBox(box, { keepEmptyLine = false } = {}) {
    if (!this.canEdit || !box || !this.body?.contains(box)) return;

    const restoredBlocks = this._extractBoxContentToBlocks(box);
    const fallbackFocus = box.nextElementSibling || box.previousElementSibling;

    if (restoredBlocks.length > 0) {
      box.replaceWith(...restoredBlocks);
      this.editor.refresh();
      this._placeCaretAtStart(restoredBlocks[0]);
    } else if (keepEmptyLine) {
      const emptyDiv = document.createElement("div");
      emptyDiv.appendChild(document.createElement("br"));
      box.replaceWith(emptyDiv);
      this.editor.refresh();
      this._placeCaretAtStart(emptyDiv);
    } else {
      box.remove();
      this.editor.refresh();

      if (fallbackFocus && fallbackFocus.isConnected && !this._isSpecialBlock(fallbackFocus)) {
        this._placeCaretAtStart(fallbackFocus);
      }
    }

    this.editor.spellcheck?.scheduleCheck?.();
    this.editor.notifyChange({ immediate: false });
  }

  focusBoxEnd(box) {
    if (!box || !this.body?.contains(box)) return;
    const type = box.dataset.box;

    if (type === "drawer") {
      box.classList.add("is-open");
      this.editor.images?.updateLayout();
      const drawerBody = box.querySelector(".fk-box-drawer-body");
      if (drawerBody) this._placeCaretAtEnd(drawerBody);
      return;
    }

    if (type === "quote") {
      box.classList.add("is-editing");
      const author = box.querySelector(".fk-box-quote-author");
      const quoteBody = box.querySelector(".fk-box-quote-body");
      const hasAuthor = Boolean(author?.textContent.replace(/\u200B/g, "").trim());
      if (hasAuthor && author) this._placeCaretAtEnd(author);
      else if (quoteBody) this._placeCaretAtEnd(quoteBody);
      return;
    }

    if (type === "code") {
      const codeBody = box.querySelector(".fk-box-code-body");
      if (codeBody) this._placeCaretAtEnd(codeBody);
      return;
    }

    const noteBody = box.querySelector(".fk-box-note-body");
    if (noteBody) this._placeCaretAtEnd(noteBody);
  }

  startEditDrawerTitle(drawer, { selectAll = false, caretAtEnd = false } = {}) {
    if (!this.canEdit || !drawer) return;
    const titleSlot = drawer.querySelector(".fk-box-drawer-title");
    if (!titleSlot) return;

    drawer.classList.add("is-open", "is-editing-title");
    titleSlot.setAttribute("contenteditable", "true");
    this.editor.images?.updateLayout();

    if (selectAll) {
      titleSlot.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(titleSlot);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } else if (caretAtEnd) {
      this._placeCaretAtEnd(titleSlot);
    } else {
      this._placeCaretAtStart(titleSlot);
    }
  }

  _finishEditDrawerTitle(drawer) {
    if (!drawer) return;
    const titleSlot = drawer.querySelector(".fk-box-drawer-title");
    if (titleSlot) {
      titleSlot.setAttribute("contenteditable", "false");
      this._normalizeEmptySlot(titleSlot);
    }
    drawer.classList.remove("is-editing-title");
  }

  getBoxLabel(box) {
    const key = BOX_LABEL_KEYS[box?.dataset?.box];
    return key ? t(key) : t("SIN.Notes.BoxFallback");
  }

  _extractSelectionForBox(range) {
    if (!range || range.collapsed) return null;

    const ancestorEl =
      range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentElement
        : range.commonAncestorContainer;

    if (ancestorEl?.closest?.(".fk-box, .fk-table-block")) {
      return null;
    }

    const frag = range.extractContents();
    this._unwrapSpellErrors(frag);

    const hasText = frag.textContent.replace(/\u200B/g, "").trim().length > 0;
    const hasChips = Boolean(frag.querySelector?.(".fk-note-link, .fk-mention"));
    if (!hasText && !hasChips) return null;

    const plainText = this._fragmentToPlainText(frag);
    return { fragment: frag, plainText };
  }

  _populateBoxWithSelection(box, type, extracted) {
    if (type === "code") {
      const codeSlot = box.querySelector(".fk-box-code-body");
      if (codeSlot) {
        codeSlot.textContent = extracted.plainText;
      }
      return;
    }

    const bodySlot =
      type === "drawer"
        ? box.querySelector(".fk-box-drawer-body")
        : type === "quote"
          ? box.querySelector(".fk-box-quote-body")
          : box.querySelector(".fk-box-note-body");

    if (!bodySlot) return;

    const normalized = this._normalizeFragmentForSlot(extracted.fragment);
    bodySlot.innerHTML = "";
    bodySlot.appendChild(normalized);
    this._normalizeEmptySlot(bodySlot);
  }

  _normalizeFragmentForSlot(frag) {
    const out = document.createDocumentFragment();

    frag.querySelectorAll?.("div, p, h3").forEach((el) => {
      el.removeAttribute("data-list");
      el.removeAttribute("data-level");
      el.removeAttribute("data-marker");
      el.removeAttribute("data-checked");
      el.removeAttribute("data-has-line");
      el.removeAttribute("data-has-sub");
      el.removeAttribute("data-list-side");
      el.removeAttribute("data-quote");
      el.removeAttribute("data-quote-pos");
      el.removeAttribute("data-block-side");
      el.removeAttribute("data-clear-squeeze");
    });

    while (
      frag.firstChild &&
      frag.firstChild.nodeType === Node.ELEMENT_NODE &&
      (frag.firstChild.nodeName === "DIV" || frag.firstChild.nodeName === "P") &&
      this._isBlockEmpty(frag.firstChild)
    ) {
      frag.firstChild.remove();
    }
    while (
      frag.lastChild &&
      frag.lastChild.nodeType === Node.ELEMENT_NODE &&
      (frag.lastChild.nodeName === "DIV" || frag.lastChild.nodeName === "P") &&
      this._isBlockEmpty(frag.lastChild)
    ) {
      frag.lastChild.remove();
    }

    if (
      frag.childNodes.length === 1 &&
      frag.firstChild.nodeType === Node.ELEMENT_NODE &&
      (frag.firstChild.nodeName === "DIV" || frag.firstChild.nodeName === "P")
    ) {
      const only = frag.firstChild;
      while (only.firstChild) {
        out.appendChild(only.firstChild);
      }
      return out;
    }

    while (frag.firstChild) {
      out.appendChild(frag.firstChild);
    }
    return out;
  }

  _fragmentToPlainText(frag) {
    const tmp = document.createElement("div");
    tmp.appendChild(frag.cloneNode(true));

    const lines = [];
    let current = "";

    const flush = () => {
      lines.push(current);
      current = "";
    };

    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        current += node.textContent.replace(/\u200B/g, "");
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.nodeName;
      if (tag === "BR") {
        flush();
        return;
      }

      const isBlock = tag === "DIV" || tag === "P" || tag === "LI" || /^H[1-6]$/.test(tag);
      if (isBlock && current.length > 0) {
        flush();
      }
      node.childNodes.forEach(walk);
      if (isBlock) {
        flush();
      }
    };

    tmp.childNodes.forEach(walk);
    if (current.length > 0) lines.push(current);

    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

    return lines.join("\n").replace(/\r\n?/g, "\n");
  }

  _extractBoxContentToBlocks(box) {
    const type = box.dataset.box;

    if (type === "code") {
      const codeEl = box.querySelector(".fk-box-code-body");
      const raw = (codeEl?.textContent || "").replace(/\u200B/g, "").replace(/\r\n?/g, "\n");
      if (!raw.trim()) return [];
      return raw.split("\n").map((line) => {
        const div = document.createElement("div");
        if (line.length) div.textContent = line;
        else div.appendChild(document.createElement("br"));
        return div;
      });
    }

    const blocks = [];

    if (type === "drawer") {
      const titleSlot = box.querySelector(".fk-box-drawer-title");
      const bodySlot = box.querySelector(".fk-box-drawer-body");
      blocks.push(...this._slotToEditorBlocks(titleSlot));
      blocks.push(...this._slotToEditorBlocks(bodySlot));
    } else if (type === "quote") {
      const bodySlot = box.querySelector(".fk-box-quote-body");
      const authorSlot = box.querySelector(".fk-box-quote-author");
      blocks.push(...this._slotToEditorBlocks(bodySlot));
      blocks.push(...this._slotToEditorBlocks(authorSlot));
    } else {
      const bodySlot = box.querySelector(".fk-box-note-body");
      blocks.push(...this._slotToEditorBlocks(bodySlot));
    }

    return blocks;
  }

  _slotToEditorBlocks(slot) {
    if (!slot) return [];

    const clone = slot.cloneNode(true);
    this._unwrapSpellErrors(clone);

    const hasText = clone.textContent.replace(/\u200B/g, "").trim().length > 0;
    const hasChips = Boolean(clone.querySelector(".fk-note-link, .fk-mention, img"));
    if (!hasText && !hasChips) return [];

    const blocks = [];
    let inlineBuf = [];

    const flushInline = () => {
      if (!inlineBuf.length) return;
      const div = document.createElement("div");
      inlineBuf.forEach((n) => div.appendChild(n));
      inlineBuf = [];
      if (
        !div.textContent.replace(/\u200B/g, "").length &&
        !div.querySelector(".fk-note-link, .fk-mention, img, br")
      ) {
        div.appendChild(document.createElement("br"));
      }
      blocks.push(div);
    };

    Array.from(clone.childNodes).forEach((child, idx, arr) => {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        (child.nodeName === "DIV" || child.nodeName === "P")
      ) {
        flushInline();
        const div = document.createElement("div");
        while (child.firstChild) div.appendChild(child.firstChild);
        if (!div.childNodes.length) div.appendChild(document.createElement("br"));
        blocks.push(div);
      } else if (child.nodeType === Node.ELEMENT_NODE && child.nodeName === "BR") {
        const isLast = idx === arr.length - 1;
        if (inlineBuf.length) {
          flushInline();
        } else if (!isLast) {
          const div = document.createElement("div");
          div.appendChild(document.createElement("br"));
          blocks.push(div);
        }
      } else if (child.nodeType === Node.TEXT_NODE && child.textContent.includes("\n")) {
        const parts = child.textContent.replace(/\r\n?/g, "\n").split("\n");
        parts.forEach((part, pIdx) => {
          if (pIdx > 0) flushInline();
          if (part) inlineBuf.push(document.createTextNode(part));
          else if (pIdx > 0 && pIdx < parts.length - 1) {
            const div = document.createElement("div");
            div.appendChild(document.createElement("br"));
            blocks.push(div);
          }
        });
      } else {
        inlineBuf.push(child);
      }
    });

    flushInline();
    return blocks;
  }

  _unwrapSpellErrors(root) {
    root.querySelectorAll?.("span.fk-spell-error").forEach((span) => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      span.remove();
    });
  }

  _buildBox(type) {
    if (type === "drawer") {
      const box = document.createElement("div");
      box.className = "fk-box fk-box-drawer";
      box.dataset.box = "drawer";
      box.setAttribute("contenteditable", "false");
      box.innerHTML = [
        '<div class="fk-box-drawer-header">',
        `<span class="fk-box-drawer-toggle" title="${t("SIN.Notes.ToggleDrawerTitle")}"><i class="fas fa-chevron-right"></i></span>`,
        `<div class="fk-box-drawer-title" contenteditable="false" data-placeholder="${t("SIN.Notes.DrawerTitlePlaceholder")}"></div>`,
        "</div>",
        `<div class="fk-box-drawer-body" contenteditable="true" data-placeholder="${t("SIN.Notes.DrawerBodyPlaceholder")}"></div>`
      ].join("");
      return box;
    }

    if (type === "quote") {
      const box = document.createElement("div");
      box.className = "fk-box fk-box-quote";
      box.dataset.box = "quote";
      box.setAttribute("contenteditable", "false");
      box.innerHTML = [
        '<span class="fk-box-quote-mark" aria-hidden="true">“</span>',
        `<div class="fk-box-quote-body" contenteditable="true" data-placeholder="${t("SIN.Notes.QuoteBodyPlaceholder")}"></div>`,
        '<div class="fk-box-quote-author-wrap">',
        '<span class="fk-box-quote-dash" aria-hidden="true">—</span>',
        `<div class="fk-box-quote-author" contenteditable="true" data-placeholder="${t("SIN.Notes.QuoteAuthorPlaceholder")}"></div>`,
        "</div>"
      ].join("");
      return box;
    }

    if (type === "note") {
      const box = document.createElement("div");
      box.className = "fk-box fk-box-note";
      box.dataset.box = "note";
      box.setAttribute("contenteditable", "false");
      box.innerHTML = [
        '<div class="fk-box-note-header">',
        '<i class="fas fa-sticky-note"></i>',
        `<span>${t("SIN.Notes.NoteBoxHeader")}</span>`,
        "</div>",
        `<div class="fk-box-note-body" contenteditable="true" data-placeholder="${t("SIN.Notes.NoteBodyPlaceholder")}"></div>`
      ].join("");
      return box;
    }

    if (type === "code") {
      const box = document.createElement("div");
      box.className = "fk-box fk-box-code";
      box.dataset.box = "code";
      box.setAttribute("contenteditable", "false");
      box.innerHTML = [
        `<button type="button" class="fk-box-code-copy" contenteditable="false" title="${t("SIN.Notes.CopyCode")}" aria-label="${t("SIN.Notes.CopyCode")}">`,
        '<i class="fas fa-copy"></i>',
        "</button>",
        `<pre class="fk-box-code-body" contenteditable="true" spellcheck="false" data-placeholder="${t("SIN.Notes.CodePlaceholder")}"></pre>`
      ].join("");
      return box;
    }

    return null;
  }

  _onClick(e) {
    const copyBtn = e.target.closest?.(".fk-box-code-copy");
    if (copyBtn && this.body?.contains(copyBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const box = copyBtn.closest(".fk-box-code");
      const codeEl = box?.querySelector(".fk-box-code-body");
      this._copyCodeText(codeEl?.innerText ?? "", copyBtn);
      return;
    }

    const drawer = e.target.closest?.(".fk-box-drawer");
    if (!drawer || !this.body?.contains(drawer)) return;

    const header = e.target.closest(".fk-box-drawer-header");
    if (!header) return;

    const titleSlot = drawer.querySelector(".fk-box-drawer-title");
    const isEditingTitle = titleSlot?.getAttribute("contenteditable") === "true";

    if (isEditingTitle) {
      if (e.target.closest(".fk-box-drawer-title")) return;
      drawer.classList.add("is-open");
      return;
    }

    e.preventDefault();
    drawer.classList.toggle("is-open");
    this.editor.images?.updateLayout();
  }

  _onDoubleClick(e) {
    if (!this.canEdit) return;
    const titleSlot = e.target.closest?.(".fk-box-drawer-title");
    if (!titleSlot || !this.body?.contains(titleSlot)) return;

    const drawer = titleSlot.closest(".fk-box-drawer");
    if (!drawer) return;

    e.preventDefault();
    e.stopPropagation();
    this.startEditDrawerTitle(drawer, { selectAll: true });
  }

  async _copyCodeText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand?.("copy");
      ta.remove();
    }

    if (!btn) return;
    btn.classList.add("is-copied");
    btn.title = t("SIN.Notes.Copied");
    const icon = btn.querySelector("i");
    const prevClass = icon?.className;
    if (icon) icon.className = "fas fa-check";

    setTimeout(() => {
      if (!btn.isConnected) return;
      btn.classList.remove("is-copied");
      btn.title = t("SIN.Notes.CopyCode");
      if (icon && prevClass) icon.className = prevClass;
    }, 1400);
  }

  _onFocusIn(e) {
    if (!this.canEdit) return;
    const quote = e.target.closest?.(".fk-box-quote");
    if (quote && this.body?.contains(quote)) {
      quote.classList.add("is-editing");
    }
  }

  _onFocusOut(e) {
    const drawerTitle = e.target.closest?.(".fk-box-drawer-title");
    if (drawerTitle && this.body?.contains(drawerTitle)) {
      const drawer = drawerTitle.closest(".fk-box-drawer");
      if (drawer) this._finishEditDrawerTitle(drawer);
    }

    const quote = e.target.closest?.(".fk-box-quote");
    if (!quote || !this.body?.contains(quote)) return;

    const nextTarget = e.relatedTarget;
    if (nextTarget && quote.contains(nextTarget)) return;

    quote.classList.remove("is-editing");
    this._syncQuoteAuthorState(quote);
  }

  _onInput(e) {
    const slot = e.target.closest?.(
      ".fk-box-drawer-title, .fk-box-drawer-body, .fk-box-quote-body, .fk-box-quote-author, .fk-box-note-body, .fk-box-code-body"
    );
    if (!slot || !this.body?.contains(slot)) return;

    if (slot.classList.contains("fk-box-code-body")) {
      if (!slot.textContent.replace(/\u200B/g, "").length && slot.innerHTML !== "") {
        slot.innerHTML = "";
      }
      return;
    }

    this._normalizeEmptySlot(slot);

    const quote = slot.closest(".fk-box-quote");
    if (quote) {
      this._syncQuoteAuthorState(quote);
    }
  }

  _onPaste(e) {
    const singleLine = e.target.closest?.(".fk-box-drawer-title, .fk-box-quote-author");
    if (singleLine && this.body?.contains(singleLine)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const raw = e.clipboardData?.getData("text/plain") || "";
      const clean = raw.replace(/[\r\n]+/g, " ");
      if (clean) {
        document.execCommand?.("insertText", false, clean);
        this.editor.refresh();
        this.editor.notifyChange({ immediate: false });
      }
      return;
    }

    const codeSlot = e.target.closest?.(".fk-box-code-body");
    if (codeSlot && this.body?.contains(codeSlot)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const raw = (e.clipboardData?.getData("text/plain") || "").replace(/\r\n?/g, "\n");
      if (raw) {
        document.execCommand?.("insertText", false, raw);
        this.editor.notifyChange({ immediate: false });
      }
    }
  }

  _onKeyDown(e) {
    const box = e.target.closest?.(".fk-box");
    if (!box || !this.body?.contains(box)) return;

    if (e.key === "Backspace" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      if (this._handleBoxBackspace(e, box)) return;
    }

    const codeSlot = e.target.closest?.(".fk-box-code-body");
    if (codeSlot) {
      if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        document.execCommand?.("insertText", false, "  ");
        this.editor.notifyChange({ immediate: false });
        return;
      }

      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const indent = this._getCurrentCodeLineIndent(codeSlot);
        e.preventDefault();
        e.stopImmediatePropagation();
        document.execCommand?.("insertText", false, `\n${indent}`);
        this.editor.notifyChange({ immediate: false });
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        this._focusAfterBox(box);
      }
      return;
    }

    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const titleSlot = e.target.closest(".fk-box-drawer-title");
      if (titleSlot) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this._finishEditDrawerTitle(box);
        box.classList.add("is-open");
        const drawerBody = box.querySelector(".fk-box-drawer-body");
        if (drawerBody) this._placeCaretAtEnd(drawerBody);
        this.editor.images?.updateLayout();
        return;
      }

      const authorSlot = e.target.closest(".fk-box-quote-author");
      if (authorSlot) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this._focusAfterBox(box);
        return;
      }
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (box.dataset.box === "drawer") {
        this._finishEditDrawerTitle(box);
      }
      this._focusAfterBox(box);
    }
  }

  _handleBoxBackspace(e, box) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    if (!box.contains(range.startContainer)) return false;

    const slot = e.target.closest?.(
      ".fk-box-drawer-title, .fk-box-drawer-body, .fk-box-quote-body, .fk-box-quote-author, .fk-box-note-body, .fk-box-code-body"
    );
    if (!slot || !this._isCaretAtSlotStart(range, slot)) return false;

    if (slot.classList.contains("fk-box-drawer-body")) {
      const isEmptyBody =
        !slot.textContent.replace(/\u200B/g, "").trim() &&
        !slot.querySelector("img, .fk-note-link, .fk-mention");
      if (isEmptyBody) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.startEditDrawerTitle(box, { caretAtEnd: true });
        return true;
      }
      return false;
    }

    if (slot.classList.contains("fk-box-quote-author")) {
      const quoteBody = box.querySelector(".fk-box-quote-body");
      if (quoteBody) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this._placeCaretAtEnd(quoteBody);
        return true;
      }
      return false;
    }

    e.preventDefault();
    e.stopImmediatePropagation();
    this.deleteBox(box, { keepEmptyLine: true });
    return true;
  }

  _isCaretAtSlotStart(range, slot) {
    try {
      const before = document.createRange();
      before.setStart(slot, 0);
      before.setEnd(range.startContainer, range.startOffset);
      const frag = before.cloneContents();
      if (frag.querySelector("br, .fk-note-link, .fk-mention, img")) return false;
      return frag.textContent.replace(/\u200B/g, "").length === 0;
    } catch {
      return false;
    }
  }

  _isSpecialBlock(el) {
    return Boolean(
      el?.classList?.contains("fk-box") ||
        el?.classList?.contains("fk-divider-block") ||
        el?.classList?.contains("fk-img-block") ||
        el?.classList?.contains("fk-table-block")
    );
  }

  _getCurrentCodeLineIndent(codeSlot) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return "";
    const range = sel.getRangeAt(0);
    if (!codeSlot.contains(range.startContainer)) return "";

    try {
      const prefixRange = document.createRange();
      prefixRange.setStart(codeSlot, 0);
      prefixRange.setEnd(range.startContainer, range.startOffset);
      const textBefore = prefixRange.toString().replace(/\r\n?/g, "\n");
      const lastLine = textBefore.split("\n").pop() || "";
      const match = lastLine.match(/^[ \t]+/);
      return match ? match[0] : "";
    } catch {
      return "";
    }
  }

  _syncQuoteAuthorState(quote) {
    const author = quote.querySelector(".fk-box-quote-author");
    if (!author) return;
    this._normalizeEmptySlot(author);
    const hasText = author.textContent.replace(/\u200B/g, "").trim().length > 0;
    quote.classList.toggle("has-author", hasText);
  }

  _normalizeEmptySlot(slot) {
    const text = slot.textContent.replace(/\u200B/g, "").trim();
    if (!text && !slot.querySelector("img, .fk-note-link, .fk-mention")) {
      if (slot.innerHTML !== "") slot.innerHTML = "";
    }
  }

  _focusAfterBox(box) {
    let next = box.nextElementSibling;
    if (!next || this._isSpecialBlock(next)) {
      next = document.createElement("div");
      next.appendChild(document.createElement("br"));
      box.after(next);
    }
    this._placeCaretAtStart(next);
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

  _isBlockEmpty(block) {
    if (!block) return true;
    if (block.querySelector(".fk-img-block, .fk-note-link, .fk-mention")) return false;
    return block.textContent.replace(/\u200B/g, "").trim().length === 0;
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

  _placeCaretAtEnd(el) {
    el.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}