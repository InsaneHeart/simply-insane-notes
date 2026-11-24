import { EditorMenusBuilders } from "./notes-menus-builders.js";
import { t } from "../shared/shared-i18n.js";

export class EditorMenus {
  constructor(editor) {
    this.editor = editor;
    this.body = null;
    this.canEdit = true;
    this._menuEl = null;
    this._onDocMouseDown = null;
    this._onDocKeyDown = null;
    this._onDocScroll = null;
    this.builders = new EditorMenusBuilders(this);
  }

  attach(body, { canEdit = true } = {}) {
    this.close();
    this.body = body;
    this.canEdit = canEdit;

    body.addEventListener("contextmenu", (e) => this._onContextMenu(e));
  }

  _onContextMenu(e) {
    const imgBlock = e.target.closest?.(".fk-img-block");
    if (imgBlock && this.body.contains(imgBlock)) {
      e.preventDefault();
      e.stopPropagation();
      if (this.canEdit) this.editor.images.selectBlock(imgBlock);
      this._open(e.clientX, e.clientY, { items: this.builders.buildImageItems(imgBlock) });
      return;
    }

    const dividerBlock = e.target.closest?.(".fk-divider-block");
    if (dividerBlock && this.body.contains(dividerBlock)) {
      if (!this.canEdit) return;
      e.preventDefault();
      e.stopPropagation();
      this._open(e.clientX, e.clientY, { items: this.builders.buildDividerItems(dividerBlock) });
      return;
    }

    const noteChip = e.target.closest?.(".fk-note-link");
    if (noteChip && this.body.contains(noteChip)) {
      e.preventDefault();
      e.stopPropagation();
      this._open(e.clientX, e.clientY, { items: this.builders.buildNoteChipItems(noteChip) });
      return;
    }

    const mentionChip = e.target.closest?.(".fk-mention");
    if (mentionChip && this.body.contains(mentionChip)) {
      e.preventDefault();
      e.stopPropagation();
      this._open(e.clientX, e.clientY, { items: this.builders.buildMentionChipItems(mentionChip) });
      return;
    }

    const linkEl = e.target.closest?.("a.fk-link");
    if (linkEl && this.body.contains(linkEl)) {
      e.preventDefault();
      e.stopPropagation();
      this._open(e.clientX, e.clientY, { items: this.builders.buildLinkItems(linkEl) });
      return;
    }

    const tableCell = e.target.closest?.("table.fk-table td, table.fk-table th");
    if (tableCell && this.body.contains(tableCell)) {
      if (!this.canEdit) return;
      const selectionRange = this._getSelectedRangeAtPoint(e.clientX, e.clientY);
      const { formatButtons, items } = this.builders.buildTableMenuConfig(e, tableCell, selectionRange);
      const spellItems = this.builders.buildSpellcheckItems(e.target);
      e.preventDefault();
      e.stopPropagation();
      this._open(e.clientX, e.clientY, { spellItems, formatButtons, items });
      return;
    }

    const boxBlock = e.target.closest?.(".fk-box");
    if (boxBlock && this.body.contains(boxBlock)) {
      const selectionRange = this._getSelectedRangeAtPoint(e.clientX, e.clientY);
      const { formatButtons, items } = this.builders.buildBoxMenuConfig(e, boxBlock, selectionRange);
      const spellItems = this.builders.buildSpellcheckItems(e.target);
      if (!items.length && !formatButtons && !spellItems.length) return;
      e.preventDefault();
      e.stopPropagation();
      this._open(e.clientX, e.clientY, { spellItems, formatButtons, items });
      return;
    }

    if (this.canEdit) {
      const quoteBarBlock = this.editor.blocks?.getQuoteBarAtPoint(e.clientX, e.clientY);
      if (quoteBarBlock) {
        e.preventDefault();
        e.stopPropagation();
        this._open(e.clientX, e.clientY, { items: this.builders.buildQuoteBarItems(quoteBarBlock) });
        return;
      }
    }

    const selectionRange = this._getSelectedRangeAtPoint(e.clientX, e.clientY);
    const caretRange = selectionRange ? null : this._getCaretRangeAtPoint(e.clientX, e.clientY, e.target);
    const { formatButtons, items } = this.builders.buildTextMenuConfig(e, selectionRange, caretRange);
    const spellItems = this.builders.buildSpellcheckItems(e.target);

    if (!items.length && !formatButtons && !spellItems.length) return;

    e.preventDefault();
    e.stopPropagation();
    this._open(e.clientX, e.clientY, { spellItems, formatButtons, items });
  }

  _open(x, y, { spellItems = null, formatButtons = null, items = [] } = {}) {
    this.close();

    const menu = document.createElement("div");
    menu.className = "fk-dropdown-menu";
    menu.style.display = "block";

    if (formatButtons?.length) {
      const bar = document.createElement("div");
      bar.className = "fk-ctx-icon-bar";

      for (const fmt of formatButtons) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = fmt.title;
        btn.innerHTML = fmt.html;
        if (fmt.active) btn.classList.add("is-active");

        btn.addEventListener("mousedown", (ev) => ev.preventDefault());
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          fmt.action();
          if (!fmt.keepOpen) this.close();
        });
        bar.appendChild(btn);
      }

      menu.appendChild(bar);

      if (items.length) {
        const sep = document.createElement("div");
        sep.className = "fk-menu-sep";
        menu.appendChild(sep);
      }
    }

    for (const item of items) {
      menu.appendChild(this._buildMenuItem(item));
    }

    const hasSpellDock = Boolean(spellItems?.length);
    let containerEl = menu;
    let dockOffset = 0;

    if (hasSpellDock) {
      const stack = document.createElement("div");
      stack.className = "fk-ctx-menu-stack";

      const dock = document.createElement("div");
      dock.className = "fk-menu-spell-dock";
      for (const sItem of spellItems) {
        dock.appendChild(this._buildMenuItem(sItem));
      }

      menu.classList.add("is-in-stack");
      stack.appendChild(dock);
      stack.appendChild(menu);
      document.body.appendChild(stack);

      dockOffset = Math.max(0, dock.offsetHeight - 6);
      containerEl = stack;
    } else {
      document.body.appendChild(menu);
    }

    this._menuEl = containerEl;

    const rect = containerEl.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
    const desiredTop = y - dockOffset;

    containerEl.style.left = `${Math.min(Math.max(8, x), maxLeft)}px`;
    containerEl.style.top = `${Math.max(8, Math.min(desiredTop, maxTop))}px`;

    this._onDocMouseDown = (ev) => {
      if (!this._menuEl?.contains(ev.target)) this.close();
    };
    this._onDocKeyDown = (ev) => {
      if (ev.key === "Escape") this.close();
    };
    this._onDocScroll = () => this.close();

    document.addEventListener("mousedown", this._onDocMouseDown, true);
    document.addEventListener("keydown", this._onDocKeyDown, true);
    window.addEventListener("scroll", this._onDocScroll, true);
  }

  _buildMenuItem(item) {
    if (item.separator) {
      const sep = document.createElement("div");
      sep.className = "fk-menu-sep";
      return sep;
    }

    if (item.iconRow) {
      const row = document.createElement("div");
      row.className = "fk-menu-icon-row";

      const label = document.createElement("span");
      label.className = "fk-menu-icon-row-label";
      label.textContent = item.label;
      row.appendChild(label);

      const group = document.createElement("div");
      group.className = "fk-menu-icon-row-btns";

      for (const b of item.buttons || []) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = [
          b.text ? "fk-menu-pill-btn" : "fk-menu-icon-btn",
          b.danger ? "danger" : ""
        ]
          .filter(Boolean)
          .join(" ");
        btn.title = b.title || "";
        if (b.text) btn.textContent = b.text;
        else btn.innerHTML = b.html;

        btn.addEventListener("mousedown", (ev) => ev.preventDefault());
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          this.close();
          b.action();
        });
        group.appendChild(btn);
      }

      row.appendChild(group);
      return row;
    }

    if (item.submenu?.length) {
      const parent = document.createElement("div");
      parent.className = "fk-menu-item has-submenu";
      parent.innerHTML = `
        <span style="display:inline-flex; align-items:center; gap:8px;">
          <i class="${item.icon}"></i>
          <span>${item.label}</span>
        </span>
        <i class="fas fa-chevron-right" style="font-size:10px; opacity:0.65;"></i>
      `;

      const sub = document.createElement("div");
      sub.className = "fk-submenu";

      for (const subItem of item.submenu) {
        sub.appendChild(this._buildMenuItem(subItem));
      }

      parent.appendChild(sub);
      parent.addEventListener("mouseenter", () => this._positionSubmenu(parent, sub));
      return parent;
    }

    const btn = document.createElement("div");
    btn.className = [
      "fk-menu-item",
      item.danger ? "danger" : "",
      item.active ? "is-active" : "",
      item.disabled ? "is-disabled" : ""
    ]
      .filter(Boolean)
      .join(" ");

    if ("colorHex" in item) {
      const dotClass = item.colorHex ? "fk-menu-color-dot" : "fk-menu-color-dot is-default";
      const dotStyle = item.colorHex ? `style="background:${item.colorHex};"` : "";
      btn.innerHTML = `<span class="${dotClass}" ${dotStyle}></span><span>${item.label}</span>`;
    } else {
      btn.innerHTML = `<i class="${item.icon}"></i><span>${item.label}</span>`;
    }

    if (item.disabled) return btn;

    btn.addEventListener("mousedown", (ev) => ev.preventDefault());
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.close();
      item.action();
    });
    return btn;
  }

  _positionSubmenu(parentEl, subEl) {
    subEl.style.left = "100%";
    subEl.style.right = "auto";
    subEl.style.top = "-4px";

    const subRect = subEl.getBoundingClientRect();
    if (subRect.right > window.innerWidth - 8) {
      subEl.style.left = "auto";
      subEl.style.right = "100%";
    }
    if (subRect.bottom > window.innerHeight - 8) {
      const overflow = subRect.bottom - (window.innerHeight - 8);
      subEl.style.top = `${-4 - overflow}px`;
    }
  }

  close() {
    if (this._menuEl) {
      this._menuEl.remove();
      this._menuEl = null;
    }
    if (this._onDocMouseDown) {
      document.removeEventListener("mousedown", this._onDocMouseDown, true);
      this._onDocMouseDown = null;
    }
    if (this._onDocKeyDown) {
      document.removeEventListener("keydown", this._onDocKeyDown, true);
      this._onDocKeyDown = null;
    }
    if (this._onDocScroll) {
      window.removeEventListener("scroll", this._onDocScroll, true);
      this._onDocScroll = null;
    }
  }

  _getSelectedRangeAtPoint(x, y) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

    const range = sel.getRangeAt(0);
    if (!this.body.contains(range.commonAncestorContainer)) return null;

    const rects = Array.from(range.getClientRects());
    const pad = 4;
    const hit = rects.some(
      (r) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad
    );

    return hit ? range.cloneRange() : null;
  }

  _getEmptyBlockAtPoint(y, target) {
    if (target && target !== this.body && this.body.contains(target)) {
      let cur = target;
      while (cur && cur.parentNode !== this.body) cur = cur.parentNode;
      if (
        cur instanceof Element &&
        !cur.classList.contains("fk-img-block") &&
        !cur.classList.contains("fk-divider-block") &&
        !cur.classList.contains("fk-box") &&
        !cur.classList.contains("fk-table-block") &&
        cur.textContent.replace(/\u200B/g, "").trim().length === 0
      ) {
        return cur;
      }
    }

    for (const child of Array.from(this.body.children)) {
      if (
        child.classList.contains("fk-img-block") ||
        child.classList.contains("fk-divider-block") ||
        child.classList.contains("fk-box") ||
        child.classList.contains("fk-table-block")
      ) {
        continue;
      }
      const r = child.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) {
        if (child.textContent.replace(/\u200B/g, "").trim().length === 0) {
          return child;
        }
        return null;
      }
    }

    return null;
  }

  _getCaretRangeAtPoint(x, y, target = null) {
    const emptyBlock = this._getEmptyBlockAtPoint(y, target);
    if (emptyBlock) {
      const range = document.createRange();
      range.setStart(emptyBlock, 0);
      range.collapse(true);
      return range;
    }

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

    if (range && this.body.contains(range.startContainer)) {
      const el =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? range.startContainer.parentElement
          : range.startContainer;
      if (!el?.closest?.(".fk-img-block, .fk-divider-block")) {
        return range.cloneRange();
      }
    }

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const current = sel.getRangeAt(0);
      if (this.body.contains(current.commonAncestorContainer)) {
        return current.cloneRange();
      }
    }

    return null;
  }

  _restoreRange(range) {
    if (!this.body) return;
    this.body.focus({ preventScroll: true });
    if (!range || !this.body.contains(range.startContainer)) return;

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  async _copy(range) {
    if (!range) return;
    const text = range.toString();
    if (!text) return;

    globalThis.__fkCopiedEditorImage = null;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      this._restoreRange(range);
      document.execCommand?.("copy");
    }
  }

  async _cut(range) {
    if (!range || !this.canEdit) return;
    const text = range.toString();
    if (!text) return;

    globalThis.__fkCopiedEditorImage = null;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      this._restoreRange(range);
      document.execCommand?.("copy");
    }

    this._restoreRange(range);
    document.execCommand?.("delete");
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
  }

  async _paste(range) {
    if (!this.canEdit) return;

    if (navigator.clipboard?.read) {
      try {
        const clipItems = await navigator.clipboard.read();
        for (const item of clipItems) {
          const imgType = item.types.find((type) => type.startsWith("image/"));
          if (imgType) {
            const blob = await item.getType(imgType);
            const ext = imgType.split("/")[1] || "png";
            const file = new File([blob], `pasted.${ext}`, { type: imgType });
            await this.editor.images.insertImageFile(file, range);
            return;
          }
        }
      } catch {
        // Segue para leitura de texto / fallback interno
      }
    }

    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      if (this.editor.images.hasCopiedImage()) {
        if (this.editor.images.pasteCopiedImage(range)) return;
      }
      if (this.editor.tables.tryPasteAsNewTable(null, range)) return;
      globalThis.ui?.notifications?.warn(t("SIN.Notes.ClipboardBlocked"));
      return;
    }

    const copiedImg = globalThis.__fkCopiedEditorImage;
    if (copiedImg?.src) {
      const unchangedPrev =
        copiedImg.prevClipboardText !== null && text === copiedImg.prevClipboardText;
      if (!text || unchangedPrev) {
        if (this.editor.images.pasteCopiedImage(range)) return;
      } else {
        globalThis.__fkCopiedEditorImage = null;
      }
    }

    if (this.editor.tables.tryPasteAsNewTable(text, range)) return;

    if (!text) return;
    this._restoreRange(range);
    this.editor.insertPlainText(text);
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
  }

  async _pasteIntoTableCell(cell, { plainOnly = false } = {}) {
    if (!this.canEdit || !cell) return;

    let text = null;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      if (!this.editor.tables.hasCopiedGrid()) {
        globalThis.ui?.notifications?.warn(t("SIN.Notes.ClipboardBlocked"));
        return;
      }
    }

    this.editor.tables.pasteIntoCell(cell, { clipboardText: text, plainOnly });
  }
}