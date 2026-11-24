import { EditorImages } from "./notes-images.js";
import { EditorMenus } from "./notes-menus.js";
import { EditorFormatting } from "./notes-formatting.js";
import { EditorLists } from "./notes-lists.js";
import { EditorBlocks } from "./notes-blocks.js";
import { EditorBoxes } from "./notes-boxes.js";
import { EditorTables } from "./notes-tables.js";
import { EditorLinks } from "./notes-links.js";
import { EditorSpellcheck } from "./notes-spellcheck.js";
import { EditorMentions } from "./notes-mentions.js";
import { EditorHistory } from "./notes-history.js";
import { EditorShortcuts } from "./notes-shortcuts.js";

const TEXT_DRAG_THRESHOLD = 5;

export class TextNoteEditor {
  constructor() {
    this.body = null;
    this.canEdit = true;
    this.note = null;
    this.app = null;
    this.storage = null;
    this._onChange = null;
    this._onUploadImage = null;
    this._plainPastePending = false;
    this._plainPasteTimer = null;
    this._isBulkInserting = false;
    this._dropCaretEl = null;
    this.shortcuts = new EditorShortcuts(this);
    this.history = new EditorHistory(this);
    this.images = new EditorImages(this);
    this.menus = new EditorMenus(this);
    this.formatting = new EditorFormatting(this);
    this.blocks = new EditorBlocks(this);
    this.boxes = new EditorBoxes(this);
    this.tables = new EditorTables(this);
    this.links = new EditorLinks(this);
    this.mentions = new EditorMentions(this);
    this.spellcheck = new EditorSpellcheck(this);
    this.lists = new EditorLists(this);
  }

  /* ================= MONTAGEM ================= */

  mount(
    body,
    {
      canEdit = true,
      initialContent = "",
      note = null,
      app = null,
      storage = null,
      onChange = null,
      onUploadImage = null
    } = {}
  ) {
    this.body = body;
    this.canEdit = canEdit;
    this.note = note;
    this.app = app;
    this.storage = storage;
    this._onChange = onChange;
    this._onUploadImage = onUploadImage;
    body.lang = "pt-BR";

    this.shortcuts.attach(body, { canEdit });
    this.history.attach(body, { canEdit });
    this.images.attach(body, { canEdit });
    this.menus.attach(body, { canEdit });
    this.formatting.attach(body, { canEdit });
    this.blocks.attach(body, { canEdit });
    this.boxes.attach(body, { canEdit });
    this.tables.attach(body, { canEdit });
    this.links.attach(body, { canEdit });
    this.mentions.attach(body, { canEdit });
    this.spellcheck.attach(body, { canEdit });
    this.lists.attach(body, { canEdit });
    this.setContent(initialContent);
    this.history.reset();
    if (!canEdit) return;

    document.execCommand?.("defaultParagraphSeparator", false, "div");

    this._bindInternalTextDrag(body);

    body.addEventListener("copy", () => {
      if (!this.images.getSelectedBlock()) {
        globalThis.__fkCopiedEditorImage = null;
      }
    });

    body.addEventListener("cut", () => {
      if (!this.images.getSelectedBlock()) {
        globalThis.__fkCopiedEditorImage = null;
      }
    });

    body.addEventListener(
      "keydown",
      (e) => {
        const key = e.key.toLowerCase();
        const isMod = e.ctrlKey || e.metaKey;

        if (isMod && e.shiftKey && key === "v") {
          this._plainPastePending = true;
          if (this._plainPasteTimer) clearTimeout(this._plainPasteTimer);
          this._plainPasteTimer = setTimeout(() => {
            this._plainPastePending = false;
            this._plainPasteTimer = null;
          }, 250);
        }

        const selectedImg = this.images.getSelectedBlock();
        if (!selectedImg) return;

        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          this.images.clearSelection();
          return;
        }

        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          e.stopPropagation();
          this.images.deleteImage(selectedImg);
          return;
        }

        if (isMod && !e.altKey && key === "c") {
          e.preventDefault();
          e.stopPropagation();
          this.images.copyImage(selectedImg);
          return;
        }

        if (isMod && !e.altKey && key === "x") {
          e.preventDefault();
          e.stopPropagation();
          this.images.cutImage(selectedImg);
          return;
        }

        if (!isMod && !e.altKey && e.key.length === 1) {
          this.images.clearSelection();
        }
      },
      true
    );

    body.addEventListener("input", (e) => {
      if (this._isBulkInserting) return;
      this.refresh();
      this.spellcheck.scheduleCheck();
      this.notifyChange({ immediate: false, source: "input", inputEvent: e });
    });

    body.addEventListener("blur", () => {
      this.history.flushPending();
      this.notifyChange({ immediate: true, source: "blur" });
    });

    body.addEventListener("paste", async (e) => {
      e.preventDefault();
      this.history.flushPending();
      const plainOnly = this.consumePlainPasteFlag();

      const clipItems = Array.from(e.clipboardData?.items || []);
      const imgItem = clipItems.find((it) => it.kind === "file" && it.type.startsWith("image/"));
      const imgFile =
        imgItem?.getAsFile() ||
        Array.from(e.clipboardData?.files || []).find((f) => f.type.startsWith("image/"));

      if (imgFile) {
        await this.images.insertImageFile(imgFile);
        return;
      }

      const text = e.clipboardData?.getData("text/plain") || "";

      const copiedImg = globalThis.__fkCopiedEditorImage;
      if (copiedImg?.src) {
        const unchangedPrev =
          copiedImg.prevClipboardText !== null && text === copiedImg.prevClipboardText;
        if (!text || unchangedPrev) {
          if (this.images.pasteCopiedImage()) return;
        } else {
          globalThis.__fkCopiedEditorImage = null;
        }
      }

      const selectedImg = this.images.getSelectedBlock();
      if (selectedImg) {
        this.images.clearSelection();
      }

      if (!plainOnly && this.tables.tryPasteAsNewTable(text)) {
        return;
      }
      if (text) {
        this.insertPlainText(text, { autoLink: !plainOnly });
        this.refresh();
        this.spellcheck.scheduleCheck();
        this.notifyChange({ immediate: false });
      }
    });
  }

  consumePlainPasteFlag() {
    const val = this._plainPastePending;
    this._plainPastePending = false;
    if (this._plainPasteTimer) {
      clearTimeout(this._plainPasteTimer);
      this._plainPasteTimer = null;
    }
    return val;
  }

  /* ================= ARRASTAR TEXTO SELECIONADO ================= */

  _bindInternalTextDrag(body) {
    const clearDropCaret = () => {
      if (this._dropCaretEl) {
        this._dropCaretEl.remove();
        this._dropCaretEl = null;
      }
    };

    const showDropCaret = (range) => {
      if (!range) {
        clearDropCaret();
        return;
      }
      let rect = range.getBoundingClientRect();
      if (!rect || (!rect.height && !rect.width)) {
        const el =
          range.startContainer.nodeType === Node.TEXT_NODE
            ? range.startContainer.parentElement
            : range.startContainer;
        rect = el?.getBoundingClientRect?.();
      }
      if (!rect || !rect.height) {
        clearDropCaret();
        return;
      }

      if (!this._dropCaretEl) {
        this._dropCaretEl = document.createElement("div");
        this._dropCaretEl.className = "fk-text-drop-caret";
        document.body.appendChild(this._dropCaretEl);
      }
      const h = Math.min(28, Math.max(14, rect.height));
      this._dropCaretEl.style.left = `${Math.round(rect.left)}px`;
      this._dropCaretEl.style.top = `${Math.round(rect.top)}px`;
      this._dropCaretEl.style.height = `${Math.round(h)}px`;
    };

    body.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.detail > 1) return;

      const targetEl =
        e.target.nodeType === Node.TEXT_NODE ? e.target.parentElement : e.target;
      if (
        targetEl?.closest?.(
          ".fk-img-block, .fk-divider-block, .fk-box-drawer-toggle, .fk-box-code-copy, button, input"
        )
      ) {
        return;
      }

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

      const range = sel.getRangeAt(0);
      if (!body.contains(range.commonAncestorContainer)) return;
      if (!this._isPointInRange(e.clientX, e.clientY, range)) return;

      e.preventDefault();

      const sourceRange = range.cloneRange();
      const startX = e.clientX;
      const startY = e.clientY;
      const prevCursor = document.body.style.cursor;

      let dragging = false;
      let lastDropRange = null;

      const cleanup = () => {
        window.removeEventListener("mousemove", onMove, true);
        window.removeEventListener("mouseup", onUp, true);
        window.removeEventListener("keydown", onKeyDown, true);
        document.body.style.cursor = prevCursor;
        clearDropCaret();
      };

      const onKeyDown = (ev) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          cleanup();
        }
      };

      const onMove = (ev) => {
        if (!dragging) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < TEXT_DRAG_THRESHOLD) {
            return;
          }
          dragging = true;
        }

        document.body.style.cursor = ev.ctrlKey ? "copy" : "grabbing";
        const dropRange = this._caretRangeFromPoint(ev.clientX, ev.clientY);

        if (dropRange && !this._isRangeInsideRange(dropRange, sourceRange)) {
          lastDropRange = dropRange;
          showDropCaret(dropRange);
        } else {
          lastDropRange = null;
          clearDropCaret();
        }
      };

      const onUp = (ev) => {
        cleanup();

        if (!dragging) {
          body.focus({ preventScroll: true });
          const clickRange = this._caretRangeFromPoint(ev.clientX, ev.clientY);
          if (clickRange) {
            const s = window.getSelection();
            s.removeAllRanges();
            s.addRange(clickRange);
          }
          return;
        }

        const finalDrop = lastDropRange || this._caretRangeFromPoint(ev.clientX, ev.clientY);
        if (!finalDrop || !body.contains(finalDrop.startContainer)) return;
        if (this._isRangeInsideRange(finalDrop, sourceRange)) return;

        this._performTextDrop(sourceRange, finalDrop, { copy: Boolean(ev.ctrlKey) });
      };

      window.addEventListener("mousemove", onMove, true);
      window.addEventListener("mouseup", onUp, true);
      window.addEventListener("keydown", onKeyDown, true);
    });
  }

  _isPointInRange(x, y, range) {
    const rects = Array.from(range.getClientRects());
    const pad = 2;
    return rects.some(
      (r) =>
        r.width > 0 &&
        r.height > 0 &&
        x >= r.left - pad &&
        x <= r.right + pad &&
        y >= r.top - pad &&
        y <= r.bottom + pad
    );
  }

  _caretRangeFromPoint(x, y) {
    let range = null;
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    } else if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    }

    if (!range || !this.body?.contains(range.startContainer)) return null;

    const hostEl =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer;

    const nonEditable = hostEl?.closest?.(".fk-note-link, .fk-mention, .fk-img-block, .fk-divider-block");
    if (nonEditable && this.body.contains(nonEditable)) {
      const rect = nonEditable.getBoundingClientRect();
      const adjusted = document.createRange();
      if (x < rect.left + rect.width / 2) adjusted.setStartBefore(nonEditable);
      else adjusted.setStartAfter(nonEditable);
      adjusted.collapse(true);
      return adjusted;
    }

    return range;
  }

  _isRangeInsideRange(inner, outer) {
    try {
      const startsAfterOrAt =
        outer.compareBoundaryPoints(Range.START_TO_START, inner) <= 0;
      const endsBeforeOrAt =
        outer.compareBoundaryPoints(Range.END_TO_END, inner) >= 0;
      return startsAfterOrAt && endsBeforeOrAt;
    } catch {
      return false;
    }
  }

  _performTextDrop(sourceRange, dropRange, { copy = false } = {}) {
    this.history.flushPending();

    const dropHostEl =
      dropRange.startContainer.nodeType === Node.TEXT_NODE
        ? dropRange.startContainer.parentElement
        : dropRange.startContainer;

    const inCode = Boolean(dropHostEl?.closest?.(".fk-box-code"));
    const inSingleLine = Boolean(
      dropHostEl?.closest?.(".fk-box-drawer-title, .fk-box-quote-author")
    );

    const marker = document.createElement("span");
    marker.dataset.fkDropMarker = "1";

    let frag;
    if (copy) {
      frag = sourceRange.cloneContents();
      dropRange.insertNode(marker);
    } else {
      const dropIsBeforeSource =
        dropRange.compareBoundaryPoints(Range.START_TO_START, sourceRange) <= 0;

      if (dropIsBeforeSource) {
        frag = sourceRange.extractContents();
        dropRange.insertNode(marker);
      } else {
        dropRange.insertNode(marker);
        frag = sourceRange.extractContents();
      }
    }

    frag.querySelectorAll?.("span.fk-spell-error").forEach((sp) => {
      const p = sp.parentNode;
      if (!p) return;
      while (sp.firstChild) p.insertBefore(sp.firstChild, sp);
      sp.remove();
    });

    let insertNodes = [];

    if (inCode || inSingleLine) {
      let plain = frag.textContent.replace(/\u200B/g, "");
      if (inSingleLine) plain = plain.replace(/[\r\n]+/g, " ");
      if (plain) insertNodes = [document.createTextNode(plain)];
    } else {
      if (
        frag.childNodes.length === 1 &&
        frag.firstChild.nodeType === Node.ELEMENT_NODE &&
        (frag.firstChild.nodeName === "DIV" || frag.firstChild.nodeName === "P")
      ) {
        const only = frag.firstChild;
        insertNodes = Array.from(only.childNodes);
      } else {
        insertNodes = Array.from(frag.childNodes);
      }
    }

    if (!insertNodes.length) {
      marker.remove();
      return;
    }

    const firstInserted = insertNodes[0];
    const lastInserted = insertNodes[insertNodes.length - 1];
    const outFrag = document.createDocumentFragment();
    insertNodes.forEach((n) => outFrag.appendChild(n));

    if (marker.isConnected && marker.parentNode) {
      marker.parentNode.insertBefore(outFrag, marker);
      marker.remove();
    }

    if (!copy) {
      Array.from(this.body.children).forEach((child) => {
        if (
          (child.nodeName === "DIV" || child.nodeName === "P") &&
          !child.classList.contains("fk-box") &&
          !child.classList.contains("fk-divider-block") &&
          !child.classList.contains("fk-table-block") &&
          !child.classList.contains("fk-img-block") &&
          !child.querySelector(".fk-img-block, .fk-note-link, .fk-mention") &&
          child.textContent.replace(/\u200B/g, "").length === 0 &&
          !child.querySelector("br")
        ) {
          if (this.body.children.length > 1) child.remove();
          else child.appendChild(document.createElement("br"));
        }
      });
    }

    try {
      const selRange = document.createRange();
      selRange.setStartBefore(firstInserted);
      selRange.setEndAfter(lastInserted);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(selRange);
    } catch {
      // Ignora se algum nó tiver sido normalizado
    }

    this.body.normalize();
    this.refresh();
    this.spellcheck.scheduleCheck();
    this.notifyChange({ immediate: false });
  }

  /* ================= CONTEÚDO ================= */

  setContent(html) {
    if (!this.body) return;
    this.body.innerHTML = html || "";
    this.images.hydrate(this.canEdit);
    this.blocks.hydrate(this.canEdit);
    this.boxes.hydrate(this.canEdit);
    this.tables.hydrate(this.canEdit);
    this.links.hydrate(this.canEdit);
    this.mentions.hydrate(this.canEdit);
    this._ensureStructure();
    this._updatePlaceholder();
    this.images.updateLayout();
    this.lists.updateMarkers();
    this.blocks.updateLayout();
    this.spellcheck.scheduleCheck();
  }

  getContent() {
    if (!this.body) return "";
    const clone = this.body.cloneNode(true);
    this.spellcheck.cleanForSave(clone);
    this.images.cleanForSave(clone);
    this.lists.cleanForSave(clone);
    this.blocks.cleanForSave(clone);
    this.boxes.cleanForSave(clone);
    this.tables.cleanForSave(clone);
    this.links.cleanForSave(clone);
    this.mentions.cleanForSave(clone);

    const hasText = clone.textContent.replace(/\u200B/g, "").trim().length > 0;
    const hasMedia = Boolean(
      clone.querySelector(
        ".fk-img-block, .fk-divider-block, .fk-box, .fk-table-block, .fk-note-link, .fk-mention"
      )
    );
    if (!hasText && !hasMedia) return "";

    return clone.innerHTML;
  }

  notifyChange({ immediate = false, source = "action", inputEvent = null } = {}) {
    if (!this.canEdit) return;

    if (!this.history.isRestoring && source !== "history" && source !== "blur") {
      if (source === "input") {
        this.history.handleInput(inputEvent);
      } else {
        this.history.recordImmediate();
      }
    }

    this._onChange?.({ immediate });
  }

  async uploadImage(file) {
    if (!this.canEdit || !this._onUploadImage) return null;
    return this._onUploadImage(file);
  }

  /* ================= CONTROLE DO EDITOR ================= */

  focusStart() {
    if (!this.body) return;
    this.body.focus();

    const first = this.body.firstChild;
    if (!first) return;
    const range = document.createRange();
    range.setStart(first, 0);
    range.collapse(true);

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  selectAll() {
    if (!this.body) return;
    this.images.clearSelection();
    this.body.focus({ preventScroll: true });

    const range = document.createRange();
    range.selectNodeContents(this.body);

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  refresh() {
    this._ensureStructure();
    this._updatePlaceholder();
    this.images.updateLayout();
    this.lists.updateMarkers();
    this.blocks.updateLayout();
  }

  insertPlainText(text, { autoLink = true } = {}) {
    const normalized = String(text ?? "").replace(/\r\n?/g, "\n");
    if (!normalized) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (!this.body?.contains(range.commonAncestorContainer)) return;

    const hostEl =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer;

    const inCode = Boolean(hostEl?.closest?.(".fk-box-code"));
    const inSingleLine = Boolean(
      hostEl?.closest?.(".fk-box-drawer-title, .fk-box-quote-author")
    );
    const inTableOrBoxSlot = Boolean(
      hostEl?.closest?.(
        "table.fk-table td, table.fk-table th, .fk-box-drawer-body, .fk-box-quote-body, .fk-box-note-body"
      )
    );

    const buildLineContent = (line) => {
      if (!line) return null;
      if (autoLink && !inCode && this.links.hasAutoLinkableToken(line)) {
        return this.links.linkifyText(line);
      }
      return document.createTextNode(line);
    };

    this._isBulkInserting = true;
    try {
      if (!range.collapsed) {
        range.deleteContents();
      }

      if (inSingleLine) {
        const clean = normalized.replace(/\n+/g, " ");
        const node = document.createTextNode(clean);
        range.insertNode(node);
        const after = document.createRange();
        after.setStartAfter(node);
        after.collapse(true);
        sel.removeAllRanges();
        sel.addRange(after);
        return;
      }

      const lines = normalized.split("\n");

      if (lines.length === 1) {
        const content = buildLineContent(lines[0]);
        if (!content) return;
        const lastInserted =
          content.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? content.lastChild : content;
        range.insertNode(content);
        if (lastInserted) {
          const after = document.createRange();
          after.setStartAfter(lastInserted);
          after.collapse(true);
          sel.removeAllRanges();
          sel.addRange(after);
        }
        return;
      }

      if (inCode || inTableOrBoxSlot) {
        const frag = document.createDocumentFragment();
        let lastInserted = null;
        lines.forEach((line, idx) => {
          if (idx > 0) {
            const br = document.createElement("br");
            frag.appendChild(br);
            lastInserted = br;
          }
          const content = buildLineContent(line);
          if (content) {
            lastInserted =
              content.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? content.lastChild : content;
            frag.appendChild(content);
          }
        });
        range.insertNode(frag);
        if (lastInserted) {
          const after = document.createRange();
          after.setStartAfter(lastInserted);
          after.collapse(true);
          sel.removeAllRanges();
          sel.addRange(after);
        }
        return;
      }

      let blockEl = hostEl;
      while (blockEl && blockEl !== this.body && blockEl.parentNode !== this.body) {
        blockEl = blockEl.parentNode;
      }

      const canSplitBlock =
        blockEl &&
        blockEl !== this.body &&
        !blockEl.classList.contains("fk-img-block") &&
        !blockEl.classList.contains("fk-divider-block") &&
        !blockEl.classList.contains("fk-box") &&
        !blockEl.classList.contains("fk-table-block");

      let trailingFrag = null;
      if (canSplitBlock) {
        const tailRange = document.createRange();
        tailRange.setStart(range.startContainer, range.startOffset);
        tailRange.setEnd(blockEl, blockEl.childNodes.length);
        trailingFrag = tailRange.extractContents();

        const firstContent = buildLineContent(lines[0]);
        if (firstContent) {
          range.insertNode(firstContent);
        }
        if (
          !blockEl.textContent &&
          !blockEl.querySelector("br, .fk-img-block, .fk-note-link, .fk-mention")
        ) {
          blockEl.appendChild(document.createElement("br"));
        }
      }

      const startIdx = canSplitBlock ? 1 : 0;
      const outFrag = document.createDocumentFragment();
      let lastDiv = null;
      let caretTarget = null;

      for (let i = startIdx; i < lines.length; i++) {
        const div = document.createElement("div");
        const content = buildLineContent(lines[i]);
        if (content) {
          caretTarget =
            content.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? content.lastChild : content;
          div.appendChild(content);
        } else {
          const br = document.createElement("br");
          div.appendChild(br);
          caretTarget = null;
        }
        outFrag.appendChild(div);
        lastDiv = div;
      }

      if (lastDiv && trailingFrag) {
        const hasTrailing =
          trailingFrag.textContent.length > 0 ||
          Boolean(trailingFrag.querySelector?.("img, .fk-img-block, .fk-note-link, .fk-mention"));
        if (hasTrailing) {
          if (lastDiv.childNodes.length === 1 && lastDiv.firstChild.nodeName === "BR") {
            lastDiv.firstChild.remove();
          }
          lastDiv.appendChild(trailingFrag);
        }
      }

      if (canSplitBlock) {
        blockEl.after(outFrag);
      } else {
        range.insertNode(outFrag);
      }

      if (lastDiv) {
        const after = document.createRange();
        if (caretTarget && lastDiv.contains(caretTarget)) {
          after.setStartAfter(caretTarget);
        } else {
          after.setStart(lastDiv, 0);
        }
        after.collapse(true);
        sel.removeAllRanges();
        sel.addRange(after);
      }
    } finally {
      this._isBulkInserting = false;
    }
  }

  _ensureStructure() {
    const b = this.body;
    const empty = b.childNodes.length === 0;
    const onlyBr = b.childNodes.length === 1 && b.firstChild.nodeName === "BR";
    if (!empty && !onlyBr) return;

    b.innerHTML = "<div><br></div>";
    if (document.activeElement === b) {
      const range = document.createRange();
      range.setStart(b.firstChild, 0);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  _updatePlaceholder() {
    const b = this.body;
    const hasText = b.textContent.replace(/\u200B/g, "").trim().length > 0;
    const hasMedia = Boolean(
      b.querySelector(
        ".fk-img-block, .fk-divider-block, .fk-box, .fk-table-block, .fk-note-link, .fk-mention"
      )
    );
    b.classList.toggle("is-text-empty", !hasText && !hasMedia);
  }
}