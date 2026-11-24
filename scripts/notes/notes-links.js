import { t } from "../shared/shared-i18n.js";

const URL_REGEX = /(^|[\s(>])((?:https?:\/\/|www\.)[^\s<>"'`)\]]+)/gi;
const EMAIL_REGEX = /(^|[\s(<])([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?=$|[\s.,;:!?)\]>])/gi;
const COMBINED_TOKEN_REGEX =
  /((?:https?:\/\/|www\.)[^\s<>"'`)\]]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

export class EditorLinks {
  constructor(editor) {
    this.editor = editor;
    this.body = null;
    this.canEdit = true;
    this._pickerEl = null;
    this._pickerCleanup = null;
  }

  attach(body, { canEdit = true } = {}) {
    this.closeNotePicker();
    this.body = body;
    this.canEdit = canEdit;

    body.addEventListener("dblclick", (e) => this._onDoubleClick(e));
    body.addEventListener("click", (e) => {
      const link = e.target.closest?.("a.fk-link");
      if (link && this.body.contains(link)) {
        e.preventDefault();
      }
    });

    if (!canEdit) return;

    body.addEventListener("keydown", (e) => this._onKeyDown(e));
  }

  hydrate() {
    if (!this.body) return;

    this.body.querySelectorAll("a.fk-link").forEach((a) => {
      if (a.dataset.linkType === "email" || a.classList.contains("fk-link-email")) {
        a.classList.add("fk-link", "fk-link-email");
        a.dataset.linkType = "email";
        a.removeAttribute("target");
        a.removeAttribute("rel");
        a.title = t("SIN.Notes.DblClickCopyEmail");
      } else {
        a.classList.add("fk-link", "fk-link-web");
        a.dataset.linkType = "web";
        a.title = t("SIN.Notes.DblClickOpenLink");
      }
    });

    const storage = this.editor.storage;
    const allAccessible = storage?.getAllAccessibleNotes?.() || null;
    let convertedAny = false;

    this.body.querySelectorAll(".fk-note-link").forEach((chip) => {
      const noteId = chip.dataset.noteId;
      const ownerId = chip.dataset.ownerId || null;

      if (noteId && allAccessible) {
        const linkedNote =
          allAccessible.find((n) => n.id === noteId && (!ownerId || n.ownerId === ownerId)) ||
          allAccessible.find((n) => n.id === noteId);

        if (!linkedNote) {
          const rawLabel = (
            chip.querySelector("span")?.textContent ||
            chip.textContent ||
            t("SIN.Notes.NoteBoxHeader")
          )
            .replace(/\u200B/g, "")
            .trim();
          const finalText = rawLabel.startsWith("#") ? rawLabel : `#${rawLabel}`;
          chip.replaceWith(document.createTextNode(finalText));
          convertedAny = true;
          return;
        }
      }

      chip.setAttribute("contenteditable", "false");
      chip.title = t("SIN.MindMap.DblClickOpenNote");
    });

    if (convertedAny) {
      this.body.normalize();
      if (this.canEdit && !this.editor.history?.isRestoring) {
        queueMicrotask(() => {
          if (this.body?.isConnected) {
            this.editor.notifyChange({ immediate: false, source: "history" });
          }
        });
      }
    }
  }

  cleanForSave(root) {
    root.querySelectorAll(".fk-note-link").forEach((chip) => {
      chip.setAttribute("contenteditable", "false");
    });
    root.querySelectorAll("a.fk-link").forEach((a) => {
      a.removeAttribute("contenteditable");
    });
  }

  _onDoubleClick(e) {
    const noteChip = e.target.closest?.(".fk-note-link");
    if (noteChip && this.body?.contains(noteChip)) {
      e.preventDefault();
      e.stopPropagation();
      this.openNoteLink(noteChip);
      return;
    }

    const link = e.target.closest?.("a.fk-link");
    if (!link || !this.body?.contains(link)) return;

    e.preventDefault();
    e.stopPropagation();

    if (link.dataset.linkType === "email" || link.classList.contains("fk-link-email")) {
      this.copyEmailLink(link);
    } else {
      this.openWebLink(link);
    }
  }

  openWebLink(linkEl) {
    const href = this._normalizeWebHref(linkEl?.getAttribute("href") || linkEl?.textContent || "");
    if (!href) return;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  openNoteLink(chipEl) {
    const noteId = chipEl?.dataset?.noteId;
    const ownerId = chipEl?.dataset?.ownerId || globalThis.game?.user?.id;
    if (!noteId) return;

    const app = this.editor.app;
    if (!app?.openNote) return;

    const exists = this.editor.storage?.findAnyNoteById?.(noteId, ownerId);
    if (!exists) {
      globalThis.ui?.notifications?.warn(t("SIN.Notes.LinkedNoteNotFound"));
      return;
    }
    app.openNote(noteId, ownerId);
  }

  async copyWebLink(linkEl) {
    const href = this._normalizeWebHref(linkEl?.getAttribute("href") || linkEl?.textContent || "");
    if (!href) return;
    await this._copyToClipboard(href);
    globalThis.ui?.notifications?.info(t("SIN.Notes.LinkCopied"));
  }

  async copyEmailLink(linkEl) {
    const email = (linkEl?.dataset?.email || linkEl?.textContent || "").trim();
    if (!email) return;
    await this._copyToClipboard(email);
    globalThis.ui?.notifications?.info(t("SIN.Notes.EmailCopied", { email }));
  }

  unwrapLink(linkEl) {
    if (!this.canEdit || !linkEl || !this.body?.contains(linkEl)) return;
    const textNode = document.createTextNode(linkEl.textContent || "");
    linkEl.replaceWith(textNode);
    this.body.normalize();
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
  }

  deleteNoteLink(chipEl) {
    if (!this.canEdit || !chipEl || !this.body?.contains(chipEl)) return;
    chipEl.remove();
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
  }

  _onKeyDown(e) {
    if (!this.canEdit || !this.body) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== " " && e.key !== "Enter") return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    if (!this.body.contains(range.startContainer)) return;

    const hostEl =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer;
    if (hostEl?.closest?.(".fk-box-code, .fk-link, .fk-note-link")) return;

    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      this._linkifyTokenBeforeCaret(range.startContainer, range.startOffset);
    }
  }

  _linkifyTokenBeforeCaret(textNode, offset) {
    const before = textNode.textContent.slice(0, offset);
    const match = before.match(/([^\s<>"'`]+)$/);
    if (!match) return false;

    const rawToken = match[1];
    const cleanToken = rawToken.replace(/[.,;:!?)\]]+$/, "");
    if (!cleanToken) return false;

    const kind = this._classifyToken(cleanToken);
    if (!kind) return false;

    const tokenStart = offset - rawToken.length;
    const tokenEnd = tokenStart + cleanToken.length;

    const afterClean = textNode.splitText(tokenEnd);
    const tokenNode = textNode.splitText(tokenStart);
    const linkEl = this._createLinkElement(kind, cleanToken);
    tokenNode.replaceWith(linkEl);

    const newRange = document.createRange();
    newRange.setStart(afterClean, rawToken.length - cleanToken.length);
    newRange.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(newRange);

    this.editor.notifyChange({ immediate: false });
    return true;
  }

  linkifyText(text) {
    const frag = document.createDocumentFragment();
    let lastIndex = 0;

    COMBINED_TOKEN_REGEX.lastIndex = 0;
    let m;
    while ((m = COMBINED_TOKEN_REGEX.exec(text)) !== null) {
      const full = m[0];
      const clean = full.replace(/[.,;:!?)\]]+$/, "");
      const kind = this._classifyToken(clean);
      if (!kind) continue;

      if (m.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
      }

      frag.appendChild(this._createLinkElement(kind, clean));

      const trailing = full.slice(clean.length);
      if (trailing) frag.appendChild(document.createTextNode(trailing));

      lastIndex = m.index + full.length;
    }

    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    return frag;
  }

  hasAutoLinkableToken(text) {
    if (!text) return false;
    URL_REGEX.lastIndex = 0;
    EMAIL_REGEX.lastIndex = 0;
    return URL_REGEX.test(text) || EMAIL_REGEX.test(text);
  }

  _classifyToken(token) {
    if (/^(?:https?:\/\/|www\.)[^\s<>"'`)\]]+$/i.test(token)) return "web";
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/i.test(token)) return "email";
    return null;
  }

  _createLinkElement(kind, value) {
    const a = document.createElement("a");
    if (kind === "email") {
      a.className = "fk-link fk-link-email";
      a.dataset.linkType = "email";
      a.dataset.email = value;
      a.href = `mailto:${value}`;
      a.textContent = value;
      a.title = t("SIN.Notes.DblClickCopyEmail");
      return a;
    }

    a.className = "fk-link fk-link-web";
    a.dataset.linkType = "web";
    a.href = this._normalizeWebHref(value);
    a.textContent = value;
    a.title = t("SIN.Notes.DblClickOpenLink");
    return a;
  }

  _normalizeWebHref(raw) {
    const clean = String(raw || "").trim();
    if (!clean) return "";
    if (/^https?:\/\//i.test(clean)) return clean;
    if (/^www\./i.test(clean)) return `https://${clean}`;
    return clean;
  }

  openNoteLinkPicker(range = null, anchorPoint = null) {
    if (!this.canEdit || !this.body) return;
    this.closeNotePicker();

    const savedRange =
      range && this.body.contains(range.startContainer) ? range.cloneRange() : this._getCurrentRange();
    const initialQuery = savedRange && !savedRange.collapsed ? savedRange.toString().trim() : "";

    const candidates = this._collectLinkableNotes();

    const pop = document.createElement("div");
    pop.className = "fk-note-link-picker";
    pop.innerHTML = `
      <div class="fk-note-link-picker-search">
        <i class="fas fa-link"></i>
        <input type="text" autocomplete="off" spellcheck="false" placeholder="${t("SIN.MindMap.PickerNotePlaceholder")}" />
      </div>
      <div class="fk-note-link-picker-list"></div>
    `;

    document.body.appendChild(pop);
    this._pickerEl = pop;

    const input = pop.querySelector("input");
    const listEl = pop.querySelector(".fk-note-link-picker-list");
    input.value = initialQuery;

    const pos = this._computePickerPosition(savedRange, anchorPoint);
    pop.style.left = `${Math.max(8, pos.x)}px`;
    pop.style.top = `${Math.max(8, pos.y)}px`;

    let filtered = [];
    let selectedIdx = 0;

    const renderList = () => {
      const q = input.value.trim().toLowerCase();
      filtered = q
        ? candidates.filter(
            (n) =>
              n.title.toLowerCase().includes(q) || n.location.toLowerCase().includes(q)
          )
        : candidates.slice(0, 30);

      selectedIdx = 0;

      if (!filtered.length) {
        listEl.innerHTML = `<div class="fk-note-link-picker-empty">${t("SIN.MindMap.PickerNoNotes")}</div>`;
        return;
      }

      listEl.innerHTML = filtered
        .map(
          (n, idx) => `
          <div class="fk-note-link-picker-item ${idx === 0 ? "selected" : ""}" data-idx="${idx}">
            <i class="fas ${n.type === "mindmap" ? "fa-project-diagram" : "fa-align-left"}"></i>
            <span class="fk-note-link-picker-title">${this._escapeHtml(n.title)}</span>
            <span class="fk-note-link-picker-meta">${this._escapeHtml(n.location)}</span>
          </div>
        `
        )
        .join("");

      listEl.querySelectorAll(".fk-note-link-picker-item").forEach((row) => {
        row.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          const chosen = filtered[Number(row.dataset.idx)];
          if (chosen) commitNote(chosen);
        });
      });
    };

    const paintSelection = () => {
      listEl.querySelectorAll(".fk-note-link-picker-item").forEach((row, idx) => {
        const active = idx === selectedIdx;
        row.classList.toggle("selected", active);
        if (active) row.scrollIntoView({ block: "nearest" });
      });
    };

    const commitNote = (chosen) => {
      this.closeNotePicker();
      this._insertNoteChip(chosen, savedRange);
    };

    input.addEventListener("input", renderList);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "ArrowDown") {
        if (!filtered.length) return;
        e.preventDefault();
        selectedIdx = (selectedIdx + 1) % filtered.length;
        paintSelection();
      } else if (e.key === "ArrowUp") {
        if (!filtered.length) return;
        e.preventDefault();
        selectedIdx = (selectedIdx - 1 + filtered.length) % filtered.length;
        paintSelection();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const chosen = filtered[selectedIdx] || filtered[0];
        if (chosen) commitNote(chosen);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.closeNotePicker();
        this._restoreRange(savedRange);
      }
    });

    const onDocMouseDown = (ev) => {
      if (!pop.contains(ev.target)) {
        this.closeNotePicker();
      }
    };
    document.addEventListener("mousedown", onDocMouseDown, true);
    this._pickerCleanup = () => {
      document.removeEventListener("mousedown", onDocMouseDown, true);
    };

    renderList();

    const rect = pop.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8);

    let finalTop = pos.y;
    if (finalTop > maxTop && Number.isFinite(pos.top)) {
      const aboveTop = pos.top - rect.height - 6;
      if (aboveTop >= 8) finalTop = aboveTop;
    }

    pop.style.left = `${Math.max(8, Math.min(pos.x, maxLeft))}px`;
    pop.style.top = `${Math.max(8, Math.min(finalTop, maxTop))}px`;

    setTimeout(() => {
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    }, 10);
  }

  closeNotePicker() {
    if (this._pickerCleanup) {
      this._pickerCleanup();
      this._pickerCleanup = null;
    }
    if (this._pickerEl) {
      this._pickerEl.remove();
      this._pickerEl = null;
    }
  }

  _collectLinkableNotes() {
    const storage = this.editor.storage;
    if (!storage) return [];

    const data = storage.getData();
    const currentUserId = globalThis.game?.user?.id || "";
    const result = [];

    for (const note of data.notes || []) {
      const title =
        (note.type === "mindmap" ? note.mindmap?.nodes?.[0]?.title || note.title : note.title) ||
        t("SIN.Common.UntitledNote");
      const colName = data.columns?.find((c) => c.id === note.columnId)?.title || t("SIN.Common.General");
      const subName = note.subsectionId
        ? data.subsections?.find((s) => s.id === note.subsectionId)?.title
        : null;

      result.push({
        id: note.id,
        ownerId: currentUserId,
        type: note.type || "text",
        title,
        location: subName ? `${colName} › ${subName}` : colName
      });
    }

    for (const shared of storage.getSharedNotesForCurrentUser?.() || []) {
      const title =
        (shared.type === "mindmap"
          ? shared.mindmap?.nodes?.[0]?.title || shared.title
          : shared.title) || t("SIN.Common.UntitledNote");

      result.push({
        id: shared.id,
        ownerId: shared.ownerId,
        type: shared.type || "text",
        title,
        location: shared.ownerName || t("SIN.Info.Shared")
      });
    }

    return result;
  }

  _insertNoteChip(noteInfo, savedRange) {
    const scrollEl = this.body?.closest?.(".fk-editor-scroll");
    const prevScrollTop = scrollEl ? scrollEl.scrollTop : null;

    this._restoreRange(savedRange);

    const range = this._getCurrentRange();
    if (!range) return;

    if (!range.collapsed) {
      range.deleteContents();
    }

    const chip = document.createElement("span");
    chip.className = "fk-note-link";
    chip.setAttribute("contenteditable", "false");
    chip.dataset.noteId = noteInfo.id;
    chip.dataset.ownerId = noteInfo.ownerId || "";
    chip.dataset.noteType = noteInfo.type || "text";
    chip.title = t("SIN.MindMap.DblClickOpenNote");

    const iconClass = noteInfo.type === "mindmap" ? "fa-project-diagram" : "fa-file-alt";
    chip.innerHTML = `<i class="fas ${iconClass}"></i><span>${this._escapeHtml(noteInfo.title)}</span>`;

    const spacer = document.createTextNode("\u00A0");
    range.insertNode(spacer);
    range.insertNode(chip);

    const after = document.createRange();
    after.setStartAfter(spacer);
    after.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(after);

    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });

    if (scrollEl && prevScrollTop !== null) {
      scrollEl.scrollTop = prevScrollTop;
      requestAnimationFrame(() => {
        if (scrollEl.isConnected) scrollEl.scrollTop = prevScrollTop;
      });
    }
  }

  _computePickerPosition(range, anchorPoint) {
    if (anchorPoint && Number.isFinite(anchorPoint.x) && Number.isFinite(anchorPoint.y)) {
      return {
        x: anchorPoint.x,
        y: anchorPoint.y + 6,
        top: Number.isFinite(anchorPoint.top) ? anchorPoint.top : anchorPoint.y
      };
    }

    if (range) {
      const rect = range.getBoundingClientRect();
      if (rect && (rect.width || rect.height)) {
        return { x: rect.left, y: rect.bottom + 6, top: rect.top };
      }

      const hostEl =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? range.startContainer.parentElement
          : range.startContainer;
      if (hostEl && hostEl !== this.body && this.body.contains(hostEl)) {
        const hRect = hostEl.getBoundingClientRect();
        if (hRect && (hRect.width || hRect.height)) {
          return { x: hRect.left, y: hRect.bottom + 6, top: hRect.top };
        }
      }
    }

    const container = this.body.closest?.(".fk-editor-scroll") || this.body;
    const cRect = container.getBoundingClientRect();
    const safeTop = Math.max(8, cRect.top) + 40;
    return { x: Math.max(8, cRect.left) + 40, y: safeTop, top: safeTop };
  }

  _getCurrentRange() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    return this.body?.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
  }

  _restoreRange(range) {
    if (!this.body) return;
    const scrollEl = this.body.closest?.(".fk-editor-scroll");
    const prevScrollTop = scrollEl ? scrollEl.scrollTop : null;

    const hostEl =
      range && this.body.contains(range.startContainer)
        ? (range.startContainer.nodeType === Node.TEXT_NODE
            ? range.startContainer.parentElement
            : range.startContainer
          )?.closest?.('[contenteditable="true"]') || this.body
        : this.body;

    hostEl.focus({ preventScroll: true });

    if (range && this.body.contains(range.startContainer)) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    if (scrollEl && prevScrollTop !== null) {
      scrollEl.scrollTop = prevScrollTop;
    }
  }

  async _copyToClipboard(text) {
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
  }

  _escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}