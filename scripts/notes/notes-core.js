import { TextNoteEditor } from "./notes-editor.js";
import { EditorSearch } from "./notes-search.js";
import { t } from "../shared/shared-i18n.js";

const MAX_TITLE_LENGTH = 120;
const TITLE_COMMIT_DELAY = 400;
const SCROLL_SAVE_DELAY = 120;

export class TextNoteInterface {
  constructor(app) {
    this.app = app;
    this.storage = app.storage;
    this.editor = null;
    this.search = null;

    this._titleTimer = null;
    this._scrollSaveTimer = null;
    this._flushAll = null;
    this._flushScroll = null;
    this._scrollFadeObserver = null;
    this._windowKeyCleanup = null;

    this.spellchecker = {
      refreshSpellcheck: () => this.refreshSpellcheck(),
      clearSpellMarks: () => this.editor?.spellcheck?.clearMarks(),
      scheduleSpellcheck: () => this.editor?.spellcheck?.scheduleCheck()
    };
    this.pendingSearchQuery = null;
  }

  refreshSpellcheck() {
    this.editor?.spellcheck?.refresh();
  }

  toggleInNoteSearch(options = {}) {
    this.search?.toggle(options);
  }

  openInNoteSearchWithQuery(query, options = {}) {
    if (this.search) {
      this.search.openWithQuery(query, options);
    } else {
      this.pendingSearchQuery = query || null;
    }
  }

  flushPendingChanges() {
    if (this._titleTimer) {
      clearTimeout(this._titleTimer);
      this._titleTimer = null;
    }
    if (this._scrollSaveTimer) {
      clearTimeout(this._scrollSaveTimer);
      this._scrollSaveTimer = null;
    }
    this._flushScroll?.();
    this._flushAll?.();
  }

  _getScrollStorageKey(note) {
    const worldId = globalThis.game?.world?.id || "default";
    const userId = globalThis.game?.user?.id || "anon";
    const ownerId = note?.ownerId || userId;
    return `sin:text-scroll:${worldId}:${userId}:${ownerId}:${note?.id}`;
  }

  _loadSavedScrollTop(note) {
    if (!note?.id) return 0;
    try {
      const raw = localStorage.getItem(this._getScrollStorageKey(note));
      const val = Number(raw);
      return Number.isFinite(val) && val > 0 ? val : 0;
    } catch {
      return 0;
    }
  }

  _saveScrollTop(note, top) {
    if (!note?.id) return;
    try {
      localStorage.setItem(this._getScrollStorageKey(note), String(Math.max(0, Math.round(top))));
    } catch {
      // Ignora caso o storage do navegador esteja indisponível
    }
  }

  _bindScrollMemory(scrollEl, body, note) {
    if (!scrollEl || !note?.id) return;

    const savedTop = note.isNewlyCreated ? 0 : this._loadSavedScrollTop(note);
    let userInteracted = false;
    let isRestoring = savedTop > 0;

    const saveNow = () => {
      if (!scrollEl.isConnected) return;
      this._saveScrollTop(note, scrollEl.scrollTop);
    };

    const scheduleSave = () => {
      if (this._scrollSaveTimer) clearTimeout(this._scrollSaveTimer);
      this._scrollSaveTimer = setTimeout(() => {
        this._scrollSaveTimer = null;
        saveNow();
      }, SCROLL_SAVE_DELAY);
    };

    this._flushScroll = () => {
      if (!isRestoring) saveNow();
    };

    const markUserInteracted = () => {
      userInteracted = true;
      isRestoring = false;
    };

    scrollEl.addEventListener("wheel", markUserInteracted, { passive: true });
    scrollEl.addEventListener("touchstart", markUserInteracted, { passive: true });
    scrollEl.addEventListener("mousedown", markUserInteracted, { passive: true });
    body.addEventListener("keydown", markUserInteracted);

    scrollEl.addEventListener(
      "scroll",
      () => {
        if (isRestoring) return;
        scheduleSave();
      },
      { passive: true }
    );

    if (savedTop <= 0) return;

    const applySavedScroll = () => {
      if (userInteracted || !scrollEl.isConnected) return;
      isRestoring = true;
      scrollEl.scrollTop = savedTop;
      this._updateVerticalScrollFade(scrollEl);
      requestAnimationFrame(() => {
        isRestoring = false;
      });
    };

    requestAnimationFrame(applySavedScroll);
    setTimeout(applySavedScroll, 40);

    body.querySelectorAll("img").forEach((img) => {
      if (!img.complete) {
        img.addEventListener("load", () => requestAnimationFrame(applySavedScroll), { once: true });
      }
    });
  }

  _bindVerticalScrollFade(scrollEl, contentEl) {
    if (!scrollEl) return;

    this._scrollFadeObserver?.disconnect();
    this._scrollFadeObserver = null;

    const update = () => this._updateVerticalScrollFade(scrollEl);
    scrollEl.addEventListener("scroll", update, { passive: true });

    if (typeof ResizeObserver !== "undefined") {
      this._scrollFadeObserver = new ResizeObserver(update);
      this._scrollFadeObserver.observe(scrollEl);
      if (contentEl) this._scrollFadeObserver.observe(contentEl);
    }

    requestAnimationFrame(update);
  }

  _updateVerticalScrollFade(el) {
    if (!el) return;
    const maxFade = 28;
    const scrollTop = Math.max(0, el.scrollTop);
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    const remainingBottom = Math.max(0, maxScroll - scrollTop);

    if (maxScroll <= 1) {
      el.style.webkitMaskImage = "none";
      el.style.maskImage = "none";
      return;
    }

    const tTop = Math.min(1, scrollTop / maxFade);
    const tBottom = Math.min(1, remainingBottom / maxFade);

    const topStopPx = (tTop * maxFade).toFixed(1);
    const bottomStopPx = (tBottom * maxFade).toFixed(1);
    const topEdgeAlpha = (1 - tTop).toFixed(3);
    const bottomEdgeAlpha = (1 - tBottom).toFixed(3);

    const mask = `linear-gradient(to bottom, rgba(0,0,0,${topEdgeAlpha}) 0px, #000 ${topStopPx}px, #000 calc(100% - ${bottomStopPx}px), rgba(0,0,0,${bottomEdgeAlpha}) 100%)`;
    el.style.webkitMaskImage = mask;
    el.style.maskImage = mask;
  }

  _sanitizeTitle(raw, { trim = false } = {}) {
    let clean = String(raw ?? "").replace(/[\r\n]+/g, " ");
    if (trim) clean = clean.trim();
    return clean.slice(0, MAX_TITLE_LENGTH);
  }

  _buildStatusFabHtml(note) {
    const isReadOnly = Boolean(note.readOnly);
    const isLocked = Boolean(note.locked) && !isReadOnly;
    const isShared = this.storage.isNoteShared(note);

    let fabClass = "fk-note-info-fab";
    let iconsHtml = `<i class="fas fa-info"></i>`;
    let titleText = t("SIN.MindMap.StatusInfo");

    if (isLocked && isShared) {
      fabClass += " locked shared dual-icons";
      iconsHtml = `<i class="fas fa-share-alt"></i><i class="fas fa-lock"></i>`;
      titleText = t("SIN.MindMap.StatusSharedLocked");
    } else if (isLocked) {
      fabClass += " locked";
      iconsHtml = `<i class="fas fa-lock"></i>`;
      titleText = t("SIN.MindMap.StatusLocked");
    } else if (isShared) {
      fabClass += " shared";
      iconsHtml = `<i class="fas fa-share-alt"></i>`;
      titleText = t("SIN.MindMap.StatusShared");
    }

    return `<button type="button" class="${fabClass}" id="fk-note-info-btn" title="${titleText}">${iconsHtml}</button>`;
  }

  render(root, note) {
    this.flushPendingChanges();
    this._windowKeyCleanup?.();
    this._windowKeyCleanup = null;
    this.search?.destroy();
    this.search = null;

    const canEdit = !note.readOnly && !note.locked;

    const wrapper = document.createElement("div");
    wrapper.className = "fk-editor-wrapper-rel";
    wrapper.tabIndex = -1;
    wrapper.innerHTML = `
      <div class="fk-editor-scroll">
        <div class="fk-editor-container">
          <textarea rows="1" class="fk-title-input" placeholder="${t("SIN.Notes.TitlePlaceholder")}" maxlength="${MAX_TITLE_LENGTH}" ${canEdit ? "" : "readonly"}>${this.storage.escapeHtml(note.title)}</textarea>
          <div class="fk-text-body" contenteditable="${canEdit}" spellcheck="false" data-placeholder="${t("SIN.Notes.BodyPlaceholder")}"></div>
        </div>
      </div>
      ${this._buildStatusFabHtml(note)}
    `;
    root.appendChild(wrapper);

    const scrollEl = wrapper.querySelector(".fk-editor-scroll");
    const containerEl = wrapper.querySelector(".fk-editor-container");
    const titleArea = wrapper.querySelector(".fk-title-input");
    const body = wrapper.querySelector(".fk-text-body");

    let lastCommittedTitle = note.title || "";
    let lastCommittedContent = note.content || "";

    const persistBody = ({ immediate = false } = {}) => {
      if (!canEdit || !this.editor) return;
      const html = this.editor.getContent();
      if (html === lastCommittedContent) {
        if (immediate) this.storage.flush();
        return;
      }

      lastCommittedContent = html;
      note.content = html;
      this.storage.updateTextNote(note.id, { content: html }, { immediate });
    };

    this.editor = new TextNoteEditor();
    this.editor.mount(body, {
      canEdit,
      initialContent: note.content || "",
      note,
      app: this.app,
      storage: this.storage,
      onChange: ({ immediate }) => {
        persistBody({ immediate });
        this._updateVerticalScrollFade(scrollEl);
      },
      onUploadImage: (file) => this.storage.uploadNoteImage(file)
    });

    this.search = new EditorSearch(this.editor, { wrapper, scrollEl, canEdit });

    const onWindowKeyDown = (e) => {
      if (!wrapper.isConnected) {
        this._windowKeyCleanup?.();
        this._windowKeyCleanup = null;
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key !== "f" && key !== "h") return;

      const appEl = this.app?.element;
      if (appEl?.classList?.contains("minimized")) return;

      const active = document.activeElement;
      const insideApp = Boolean(appEl?.contains(active));
      const isNeutralFocus =
        !active || active === document.body || active === document.documentElement;
      const hasDialogOnTop = Boolean(document.querySelector(".application.dialog, dialog[open]"));

      if (!insideApp && !(isNeutralFocus && !hasDialogOnTop)) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.toggleInNoteSearch({ showReplace: key === "h" });
    };

    window.addEventListener("keydown", onWindowKeyDown, true);
    this._windowKeyCleanup = () => {
      window.removeEventListener("keydown", onWindowKeyDown, true);
    };

    this._bindVerticalScrollFade(scrollEl, containerEl);
    this._bindScrollMemory(scrollEl, body, note);

    wrapper.querySelector("#fk-note-info-btn").addEventListener("click", () => {
      this.app.infoModals?.openNoteInfoModal(note.id, note.ownerId);
    });

    const resizeTitle = () => {
      titleArea.style.height = "auto";
      titleArea.style.height = `${Math.max(48, titleArea.scrollHeight)}px`;
      this._updateVerticalScrollFade(scrollEl);
    };

    setTimeout(() => {
      resizeTitle();

      if (canEdit && note.isNewlyCreated) {
        const data = this.storage.getData();
        const stored = data.notes.find((n) => n.id === note.id);
        if (stored && stored.isNewlyCreated) {
          delete stored.isNewlyCreated;
          this.storage.markDirty(data);
        }
        titleArea.focus();
        titleArea.select();
      } else if (this.pendingSearchQuery) {
        const q = this.pendingSearchQuery;
        this.pendingSearchQuery = null;
        this.openInNoteSearchWithQuery(q);
      } else {
        wrapper.focus({ preventScroll: true });
      }
    }, 25);

    if (!canEdit) return;

    const commitTitle = ({ finalize = false } = {}) => {
      if (this._titleTimer) {
        clearTimeout(this._titleTimer);
        this._titleTimer = null;
      }

      const base = this._sanitizeTitle(titleArea.value, { trim: finalize });
      const nextTitle = finalize
        ? this.storage.getUniqueNoteTitle(base, note.id)
        : base || t("SIN.Common.NewNote");

      if (finalize && titleArea.value !== nextTitle) {
        titleArea.value = nextTitle;
        resizeTitle();
      }

      this.app.updateWindowTitle(nextTitle);

      if (nextTitle === lastCommittedTitle) {
        if (finalize) this.storage.flush();
        return;
      }

      lastCommittedTitle = nextTitle;
      note.title = nextTitle;
      this.storage.updateTextNote(note.id, { title: nextTitle }, { immediate: finalize });
    };

    this._flushAll = () => {
      commitTitle({ finalize: true });
      persistBody({ immediate: true });
    };

    titleArea.addEventListener("paste", (e) => {
      e.preventDefault();
      const pasted = this._sanitizeTitle(e.clipboardData?.getData("text/plain") || "");
      const start = titleArea.selectionStart;
      const end = titleArea.selectionEnd;
      const merged = this._sanitizeTitle(
        titleArea.value.slice(0, start) + pasted + titleArea.value.slice(end)
      );
      titleArea.value = merged;
      const caret = Math.min(start + pasted.length, merged.length);
      titleArea.setSelectionRange(caret, caret);
      titleArea.dispatchEvent(new Event("input"));
    });

    titleArea.addEventListener("input", () => {
      if (/[\r\n]/.test(titleArea.value)) {
        const pos = titleArea.selectionStart;
        titleArea.value = this._sanitizeTitle(titleArea.value);
        titleArea.setSelectionRange(pos, pos);
      }

      resizeTitle();
      const preview = this._sanitizeTitle(titleArea.value) || t("SIN.Common.NewNote");
      this.app.updateWindowTitle(preview);

      if (this._titleTimer) clearTimeout(this._titleTimer);
      this._titleTimer = setTimeout(() => commitTitle({ finalize: false }), TITLE_COMMIT_DELAY);
    });

    titleArea.addEventListener("blur", () => {
      commitTitle({ finalize: true });
    });

    titleArea.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitTitle({ finalize: true });
        this.editor.focusStart();
      }
    });
  }
}