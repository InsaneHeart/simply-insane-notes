import { MODULE_ID, MODULE_TITLE, NotesStorage } from "../storage/storage.js";
import { TextNoteInterface } from "../notes/notes.js";
import { MindMapEditor } from "../mindmap/mindmap.js";
import { ManagerView } from "../manager/manager.js";
import { loadModuleLanguage, t } from "../shared/shared.js";
import { SearchView } from "./app-search-view.js";
import { InfoModals } from "./app-info-modals.js";
import { SimplyInsaneNotesSettingsApp } from "./app-settings.js";
import { SimplyInsaneNotesSearchApp } from "./app-search-window.js";
import { AppMenus } from "./app-menus.js";

const { ApplicationV2, DialogV2 } = foundry.applications.api;
const SUPPORTED_FIRST_RUN_LANGS = ["pt-BR", "en", "es", "fr"];

export class SimplyInsaneNotesApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "simply-insane-notes-app",
    classes: ["fk-notes-window"],
    window: {
      title: MODULE_TITLE,
      icon: "fas fa-book-open",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 900,
      height: 640
    }
  };

  constructor(options = {}) {
    super(options);
    this.storage = new NotesStorage();
    this.menus = new AppMenus(this);
    this.textEditor = new TextNoteInterface(this);
    this.mindmapEditor = new MindMapEditor(this);
    this.managerView = new ManagerView(this);
    this.searchView = new SearchView(this);
    this.infoModals = new InfoModals(this);
    this.searchWindow = new SimplyInsaneNotesSearchApp(this);

    this.mode = "manager"; // "manager" | "editor"
    this.activeNoteId = null;
    this.activeOwnerId = null;
    this._firstRunLangPromise = null;
  }

  _hasSavedNotesData() {
    return game.user?.getFlag(MODULE_ID, "notesData") !== undefined;
  }

  _getDefaultFirstRunLang() {
    const foundryLang = String(game.i18n?.lang || "").trim();
    if (SUPPORTED_FIRST_RUN_LANGS.includes(foundryLang)) return foundryLang;
    const prefix = foundryLang.split("-")[0]?.toLowerCase();
    const match = SUPPORTED_FIRST_RUN_LANGS.find((code) =>
      code.toLowerCase().startsWith(prefix)
    );
    return match || "en";
  }

  async ensureFirstRunLanguage(onConfirmed = null) {
    if (this._hasSavedNotesData()) {
      return onConfirmed ? onConfirmed() : true;
    }

    if (this._firstRunLangPromise) {
      return this._firstRunLangPromise;
    }

    const suggestedLang = this._getDefaultFirstRunLang();
    const langOptions = [
      {
        value: "pt-BR",
        label: "Português (Brasil)",
        hint: "Escolha o idioma do módulo",
        title: "Selecionar idioma",
        confirm: "Confirmar"
      },
      {
        value: "en",
        label: "English",
        hint: "Choose the module language",
        title: "Select language",
        confirm: "Confirm"
      },
      {
        value: "es",
        label: "Español",
        hint: "Elige el idioma del módulo",
        title: "Seleccionar idioma",
        confirm: "Confirmar"
      },
      {
        value: "fr",
        label: "Français",
        hint: "Choisissez la langue du module",
        title: "Choisir la langue",
        confirm: "Confirmer"
      }
    ];

    const initialOpt =
      langOptions.find((o) => o.value === suggestedLang) || langOptions[1];

    const content = `
      <div class="fk-clean-modal-scroll" style="gap:12px;">
        <div class="fk-modal-top-header">
          <div class="fk-modal-main-title">${MODULE_TITLE}</div>
          <div class="fk-modal-subtitle" id="fk-first-run-subtitle">${initialOpt.hint}</div>
        </div>
        <div class="fk-lang-grid" id="fk-first-run-lang-list">
          ${langOptions
            .map(
              (opt) => `
            <label class="fk-backup-mode-option" style="align-items:flex-start;">
              <input type="radio" name="fkFirstRunLang" value="${opt.value}" ${opt.value === suggestedLang ? "checked" : ""} />
              <div style="display:flex; flex-direction:column; gap:2px;">
                <span>${opt.label}</span>
                <small style="opacity:0.65; font-size:11px; font-weight:normal;">${opt.hint}</small>
              </div>
            </label>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    this._firstRunLangPromise = DialogV2.wait({
      classes: ["fk-notes-window"],
      window: { title: initialOpt.title, icon: "fas fa-language" },
      position: { width: 440 },
      content,
      render: (event, dialog) => {
        const el = dialog.element;
        const subtitleEl = el?.querySelector("#fk-first-run-subtitle");
        const titleEl = el?.querySelector(".window-header .window-title");
        const confirmBtn = el?.querySelector('button[data-action="confirm"]');

        el?.querySelectorAll('input[name="fkFirstRunLang"]').forEach((radio) => {
          radio.addEventListener("change", () => {
            const opt = langOptions.find((o) => o.value === radio.value);
            if (!opt) return;
            if (subtitleEl) subtitleEl.textContent = opt.hint;
            if (titleEl) titleEl.textContent = opt.title;
            if (confirmBtn) {
              confirmBtn.innerHTML = `<i class="fas fa-check"></i> ${opt.confirm}`;
            }
          });
        });
      },
      buttons: [
        {
          action: "confirm",
          label: initialOpt.confirm,
          icon: "fas fa-check",
          default: true,
          callback: (event, button, dialog) => {
            const checked = dialog.element?.querySelector(
              'input[name="fkFirstRunLang"]:checked'
            );
            return checked?.value || null;
          }
        }
      ]
    })
      .then(async (chosenLang) => {
        if (!chosenLang) {
          if (this.rendered) {
            await super.close({ animate: false });
          }
          return false;
        }

        await loadModuleLanguage(chosenLang);
        const data = this.storage.getData();
        data.settings = {
          ...(data.settings || {}),
          uiLanguage: chosenLang
        };
        await this.storage.saveNow(data);
        return onConfirmed ? onConfirmed() : true;
      })
      .finally(() => {
        this._firstRunLangPromise = null;
      });

    return this._firstRunLangPromise;
  }

  render(options = {}, _options = {}) {
    if (typeof options === "boolean") options = { force: options };
    return super.render(options, _options);
  }

  openMenu(menuId, x, y, html, bindFn) {
    return this.menus.openMenu(menuId, x, y, html, bindFn);
  }

  closeMenu() {
    return this.menus.closeMenu();
  }

  updateWindowTitle(title) {
    const titleEl = this.element?.querySelector(".window-header .window-title");
    if (titleEl) titleEl.textContent = title;
  }

  _bindHeaderButton(btn, onLeftClick, onRightClick = null) {
    if (!btn) return;
    btn.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        this.bringToTop?.();
        onLeftClick(e);
      } else if (e.button === 2 && onRightClick) {
        e.preventDefault();
        e.stopPropagation();
        this.bringToTop?.();
        onRightClick(e);
      }
    });
    if (onRightClick) {
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    }
  }

  async _prepareContext() {
    return {};
  }

  async _renderHTML() {
    const root = document.createElement("div");
    root.style.cssText = "display:flex; flex-direction:column; height:100%; overflow:hidden;";
    root.addEventListener("keydown", (e) => e.stopPropagation());

    this.menus.ensureMenuContainer();

    if (!this._hasSavedNotesData()) {
      this.ensureFirstRunLanguage(() => this.render({ force: true }));
      return root;
    }

    if (this.mode === "editor" && this.activeNoteId) {
      const note = this.storage.findAnyNoteById(this.activeNoteId, this.activeOwnerId);
      if (note) {
        if (note.type === "mindmap") {
          this.mindmapEditor.render(root, note);
        } else {
          this.textEditor.render(root, note);
        }
        return root;
      }
    }

    this.mode = "manager";
    this.activeNoteId = null;
    this.activeOwnerId = null;
    this.managerView.render(root);
    return root;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const header = this.element?.querySelector(".window-header");
    if (!header) return;

    header.querySelectorAll(".fk-header-slot").forEach((el) => el.remove());
    if (!this._hasSavedNotesData()) return;

    const closeBtn = header.querySelector('[data-action="close"]');
    const data = this.storage.getData();

    if (this.mode === "editor" && this.activeNoteId) {
      const note = this.storage.findAnyNoteById(this.activeNoteId, this.activeOwnerId);
      const isReadOnly = Boolean(note?.readOnly);
      const isFav = Boolean(note?.favorite);
      const currentColId = !isReadOnly ? note?.columnId || null : null;
      const headerTitle =
        note?.type === "mindmap"
          ? note.mindmap?.nodes?.[0]?.title || note.title || t("SIN.Common.MindMap")
          : note?.title || t("SIN.Common.NewNote");
      this.updateWindowTitle(headerTitle);

      const rightSlot = document.createElement("div");
      rightSlot.className = "fk-header-slot";
      rightSlot.innerHTML = `
        ${
          isReadOnly
            ? `<span class="fk-readonly-badge" title="${this.storage.escapeHtml(t("SIN.App.ReadOnlyTitle", { owner: note.ownerName }))}"><i class="fas fa-eye"></i> ${this.storage.escapeHtml(note.ownerName)}</span>`
            : ""
        }
        <button type="button" class="fk-hdr-btn primary" id="fk-hdr-editor-new" title="${t("SIN.App.NewNoteTooltip")}">
          <i class="fas fa-plus"></i> ${t("SIN.App.NewNoteBtn")}
        </button>
        <button type="button" class="fk-hdr-btn" id="fk-hdr-files" title="${t("SIN.App.FilesBtnTooltip")}">
          <i class="fas fa-folder-open"></i> ${MODULE_TITLE}
        </button>
        ${
          !isReadOnly
            ? `<button type="button" class="fk-hdr-btn icon-only ${isFav ? "fav-active" : ""}" id="fk-hdr-editor-fav" title="${isFav ? t("SIN.App.FavActiveTooltip") : t("SIN.App.FavAddTooltip")}">
                <i class="fas fa-star"></i>
              </button>`
            : ""
        }
        <button type="button" class="fk-hdr-btn icon-only" id="fk-hdr-settings" title="${t("SIN.App.EditorSettingsTooltip")}">
          <i class="fas fa-cog"></i>
        </button>
      `;

      if (closeBtn) header.insertBefore(rightSlot, closeBtn);
      else header.appendChild(rightSlot);

      const newBtn = rightSlot.querySelector("#fk-hdr-editor-new");
      this._bindHeaderButton(
        newBtn,
        () => this.openNewNote(currentColId, "text", null),
        (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          this.menus.showQuickTypeMenu(rect.left, rect.bottom + 6, currentColId);
        }
      );

      const filesBtn = rightSlot.querySelector("#fk-hdr-files");
      this._bindHeaderButton(
        filesBtn,
        (e) => {
          if (e.shiftKey && this.activeNoteId) {
            this.openManagerAndFocusNote(this.activeNoteId, this.activeOwnerId);
          } else {
            this.openManager();
          }
        },
        (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          this.menus.showFilesButtonMenu(
            rect.left,
            rect.bottom + 6,
            this.activeNoteId,
            this.activeOwnerId
          );
        }
      );

      const favBtn = rightSlot.querySelector("#fk-hdr-editor-fav");
      if (favBtn && note) {
        this._bindHeaderButton(favBtn, () => {
          const nowFav = this.storage.toggleFavorite(note.id);
          note.favorite = nowFav;
          favBtn.classList.toggle("fav-active", nowFav);
          favBtn.title = nowFav ? t("SIN.App.FavActiveTooltip") : t("SIN.App.FavAddTooltip");
        });
      }

      const settingsBtn = rightSlot.querySelector("#fk-hdr-settings");
      this._bindHeaderButton(settingsBtn, (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const freshNote = this.storage.findAnyNoteById(this.activeNoteId, this.activeOwnerId);
        this.menus.showNoteSettingsMenu(rect.right - 215, rect.bottom + 6, freshNote || note);
      });
      return;
    }

    this.updateWindowTitle(MODULE_TITLE);

    const controlsSlot = document.createElement("div");
    controlsSlot.className = "fk-header-slot";

    const isList = data.viewMode === "list";
    const viewIcon = isList ? "fa-folder" : "fa-th-large";
    const viewLabel = isList ? t("SIN.App.ViewFolders") : t("SIN.App.ViewBoard");

    controlsSlot.innerHTML = `
      <button type="button" class="fk-hdr-btn primary" id="fk-hdr-new-note" title="${t("SIN.App.NewNoteTooltip")}">
        <i class="fas fa-plus"></i> ${t("SIN.App.NewNoteBtn")}
      </button>
      <button type="button" class="fk-hdr-btn" id="fk-hdr-view-btn" title="${t("SIN.App.SwitchViewTooltip")}">
        <i class="fas ${viewIcon}"></i> <span>${viewLabel}</span> <i class="fas fa-caret-down" style="opacity:0.6;"></i>
      </button>
      <button type="button" class="fk-hdr-btn icon-only" id="fk-hdr-favs" title="${t("SIN.App.FavoritesTooltip")}">
        <i class="fas fa-star"></i>
      </button>
      <button type="button" class="fk-hdr-btn icon-only" id="fk-hdr-search" title="${t("SIN.App.SearchTooltip")}">
        <i class="fas fa-search"></i>
      </button>
      <button type="button" class="fk-hdr-btn icon-only" id="fk-hdr-mgr-settings" title="${t("SIN.App.SettingsTooltip")}">
        <i class="fas fa-cog"></i>
      </button>
    `;

    if (closeBtn) header.insertBefore(controlsSlot, closeBtn);
    else header.appendChild(controlsSlot);

    const newNoteBtn = controlsSlot.querySelector("#fk-hdr-new-note");
    this._bindHeaderButton(
      newNoteBtn,
      () => this.openNewNote(null, "text", null),
      (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        this.menus.showQuickTypeMenu(rect.left, rect.bottom + 6, null);
      }
    );

    const viewBtn = controlsSlot.querySelector("#fk-hdr-view-btn");
    this._bindHeaderButton(viewBtn, (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      this.menus.showViewSwitcherMenu(rect.left, rect.bottom + 6);
    });

    const favsBtn = controlsSlot.querySelector("#fk-hdr-favs");
    this._bindHeaderButton(favsBtn, () => this.openFavorites());

    const searchBtn = controlsSlot.querySelector("#fk-hdr-search");
    this._bindHeaderButton(searchBtn, () => this.openSearch(true));

    const mgrSettingsBtn = controlsSlot.querySelector("#fk-hdr-mgr-settings");
    this._bindHeaderButton(mgrSettingsBtn, (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      this.menus.showManagerSettingsMenu(rect.right - 215, rect.bottom + 6);
    });

    this.managerView.onAfterRender();
  }

  async close(options = {}) {
    if (this._hasSavedNotesData()) {
      this.storage.flush();
    }
    this.closeMenu();
    if (this.searchWindow?.rendered) {
      await this.searchWindow.close({ animate: false });
    }
    return super.close(options);
  }

  async _reopenWindow(width, height) {
    this.closeMenu();
    const left = Math.max(40, Math.round((window.innerWidth - width) / 2));
    const top = Math.max(40, Math.round((window.innerHeight - height) / 2));

    if (this.rendered) {
      await super.close({ animate: false });
    }

    await this.render({
      force: true,
      position: { width, height, left, top }
    });

    if (this.rendered && this.element) {
      this.setPosition({ width, height, left, top });
    }
  }

  async openNewNote(columnId = null, type = "text", subsectionId = null) {
    if (!this._hasSavedNotesData()) {
      return this.ensureFirstRunLanguage(() =>
        this.openNewNote(columnId, type, subsectionId)
      );
    }

    this.storage.flush();
    const newNote = this.storage.createNote(columnId, type, subsectionId);
    this.storage.recordRecentNote(newNote.id, game.user.id);
    this.activeNoteId = newNote.id;
    this.activeOwnerId = game.user.id;
    this.mode = "editor";
    const w = type === "mindmap" ? 940 : 700;
    const h = type === "mindmap" ? 660 : 640;
    return this._reopenWindow(w, h);
  }

  async openNote(noteId, ownerId = null) {
    if (!this._hasSavedNotesData()) {
      return this.ensureFirstRunLanguage(() => this.openNote(noteId, ownerId));
    }

    this.storage.flush();
    const note = this.storage.findAnyNoteById(noteId, ownerId);
    if (!note) return this.openManager();

    this.storage.recordRecentNote(noteId, ownerId || game.user.id);
    this.activeNoteId = noteId;
    this.activeOwnerId = ownerId || game.user.id;
    this.mode = "editor";
    const w = note.type === "mindmap" ? 940 : 700;
    const h = note.type === "mindmap" ? 660 : 640;
    return this._reopenWindow(w, h);
  }

  async openManager() {
    if (!this._hasSavedNotesData()) {
      return this.ensureFirstRunLanguage(() => this.openManager());
    }

    this.storage.flush();
    this.activeNoteId = null;
    this.activeOwnerId = null;
    this.mode = "manager";
    return this._reopenWindow(900, 640);
  }

  async openManagerAndFocusNote(noteId, ownerId = null) {
    if (!this._hasSavedNotesData()) {
      return this.ensureFirstRunLanguage(() =>
        this.openManagerAndFocusNote(noteId, ownerId)
      );
    }

    this.storage.flush();
    const note = this.storage.findAnyNoteById(noteId, ownerId);

    if (note) {
      if (note.readOnly) {
        const data = this.storage.getData();
        if (data.viewMode === "list") {
          this.managerView.sharedFolderOpen = true;
        } else if (!data.sharedDrawerOpen) {
          data.sharedDrawerOpen = true;
          this.storage.saveNow(data);
        }
      } else {
        this.managerView.collapsedFolders.delete(note.columnId);
        if (note.subsectionId) {
          const data = this.storage.getData();
          const sub = data.subsections.find((s) => s.id === note.subsectionId);
          if (sub && sub.collapsed) {
            sub.collapsed = false;
            this.storage.saveNow(data);
          }
        }
      }
      this.managerView.highlightedNoteId = note.id;
    }

    return this.openManager();
  }

  async openSearch(resetQuery = false) {
    if (!this._hasSavedNotesData()) {
      return this.ensureFirstRunLanguage(() => this.openSearch(resetQuery));
    }

    this.closeMenu();
    this.searchView.openNormalSearch(resetQuery);
    const width = 420;
    const height = 640;
    const left = Math.max(40, Math.round((window.innerWidth - width) / 2));
    const top = Math.max(40, Math.round((window.innerHeight - height) / 2));
    await this.searchWindow.render({
      force: true,
      position: { width, height, left, top }
    });
    if (this.searchWindow.rendered) {
      this.searchWindow.setPosition({ width, height, left, top });
    }
  }

  async openFavorites() {
    if (!this._hasSavedNotesData()) {
      return this.ensureFirstRunLanguage(() => this.openFavorites());
    }

    this.closeMenu();
    this.searchView.openFavoritesSearch();
    const width = 420;
    const height = 640;
    const left = Math.max(40, Math.round((window.innerWidth - width) / 2));
    const top = Math.max(40, Math.round((window.innerHeight - height) / 2));
    await this.searchWindow.render({
      force: true,
      position: { width, height, left, top }
    });
    if (this.searchWindow.rendered) {
      this.searchWindow.setPosition({ width, height, left, top });
    }
  }

  openSettingsApp() {
    new SimplyInsaneNotesSettingsApp().render({ force: true });
  }

  openFoundryKeybindingsConfig() {
    try {
      const ControlsApp =
        foundry.applications?.sidebar?.apps?.ControlsConfig ||
        window.ControlsConfig ||
        game.settings?.sheet;
      if (ControlsApp) {
        new ControlsApp().render(true);
      }
    } catch {
      ui.notifications.info(t("SIN.App.ControlsFallbackInfo"));
    }
  }

  async promptSelectNoteModal(excludeNoteId = null, confirmLabel = null) {
    const resolvedConfirmLabel = confirmLabel || t("SIN.App.LinkNoteDefaultConfirm");
    const allNotes = this.storage.getAllAccessibleNotes().filter((n) => n.id !== excludeNoteId);
    if (!allNotes.length) {
      ui.notifications.warn(t("SIN.App.LinkNoteEmptyWarn"));
      return null;
    }

    const data = this.storage.getData();
    let selectedNote = allNotes[0];

    const content = `
      <div style="display:flex; flex-direction:column; height:340px; overflow:hidden; padding:4px 2px;">
        <div class="fk-search-bar-line" style="margin-bottom:10px;">
          <i class="fas fa-search" style="color:#a78bfa; font-size:13px;"></i>
          <input type="search" id="fk-picker-search-input" name="fk-picker-no-autofill" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="${t("SIN.App.LinkNoteSearchPlaceholder")}" />
        </div>
        <div class="fk-search-results" id="fk-picker-results-list" style="flex:1; overflow-y:auto;"></div>
      </div>
    `;

    return DialogV2.wait({
      window: { title: t("SIN.App.LinkNoteTitle"), icon: "fas fa-link" },
      position: { width: 420 },
      content,
      render: (event, dialog) => {
        const el = dialog.element;
        const input = el.querySelector("#fk-picker-search-input");
        const listEl = el.querySelector("#fk-picker-results-list");

        const renderList = () => {
          const q = (input.value || "").trim().toLowerCase();
          listEl.innerHTML = "";

          const filtered = allNotes.filter((n) => {
            const title = (
              n.type === "mindmap" ? n.mindmap?.nodes?.[0]?.title || n.title : n.title || ""
            ).toLowerCase();
            const preview = this.storage.extractNotePreview(n, 200).toLowerCase();
            return !q || title.includes(q) || preview.includes(q);
          });

          if (!filtered.length) {
            selectedNote = null;
            listEl.innerHTML = `<div class="fk-search-empty-msg">${this.storage.escapeHtml(t("SIN.App.LinkNoteNoResults", { query: q }))}</div>`;
            return;
          }

          if (!selectedNote || !filtered.some((n) => n.id === selectedNote.id)) {
            selectedNote = filtered[0];
          }

          filtered.forEach((n) => {
            const displayTitle =
              (n.type === "mindmap" ? n.mindmap?.nodes?.[0]?.title || n.title : n.title) ||
              t("SIN.Common.UntitledNote");
            const preview = this.storage.extractNotePreview(n, 95);
            const icon = n.type === "mindmap" ? "fa-project-diagram" : "fa-align-left";

            let folderLabel = n.readOnly
              ? t("SIN.App.SharedFolderLabel", { owner: n.ownerName })
              : t("SIN.Common.General");
            if (!n.readOnly) {
              folderLabel =
                data.columns.find((c) => c.id === n.columnId)?.title || t("SIN.Common.General");
            }

            const row = document.createElement("div");
            row.className = `fk-search-result-row ${selectedNote?.id === n.id ? "selected" : ""}`;
            row.innerHTML = `
              <div class="fk-search-res-header">
                <div class="fk-search-res-title">
                  <i class="fas ${icon}" style="color:#a78bfa; font-size:11px;"></i>
                  <span>${this.storage.escapeHtml(displayTitle)}</span>
                </div>
                <span class="fk-search-res-meta">${this.storage.escapeHtml(folderLabel)}</span>
              </div>
              ${preview ? `<div class="fk-search-res-snippet">${this.storage.escapeHtml(preview)}</div>` : ""}
            `;

            row.addEventListener("click", () => {
              selectedNote = n;
              listEl.querySelectorAll(".fk-search-result-row").forEach((r) => r.classList.remove("selected"));
              row.classList.add("selected");
            });

            row.addEventListener("dblclick", () => {
              selectedNote = n;
              const okBtn = el.querySelector('button[data-action="confirm"]');
              okBtn?.click();
            });

            listEl.appendChild(row);
          });
        };

        input.addEventListener("input", renderList);
        renderList();
        setTimeout(() => input.focus(), 20);
      },
      buttons: [
        {
          action: "confirm",
          label: resolvedConfirmLabel,
          icon: "fas fa-check",
          default: true,
          callback: () => selectedNote
        },
        {
          action: "cancel",
          label: t("SIN.Common.Cancel"),
          icon: "fas fa-times",
          callback: () => null
        }
      ]
    });
  }

  async switchNoteTypeWithConfirm(noteId, nextType) {
    await this.storage.flush();
    const data = this.storage.getData();
    const note = data.notes.find((n) => n.id === noteId);
    if (!note) return;

    const newNotePrefix = t("SIN.Common.NewNote");
    const hasText =
      note.type === "text" &&
      Boolean(note.content?.replace(/<[^>]*>/g, "").trim() || note.content?.includes("<img"));
    const hasNodes =
      note.type === "mindmap" &&
      (note.mindmap?.nodes?.length > 1 ||
        Boolean(note.mindmap?.nodes?.[0]?.details?.trim()) ||
        (note.mindmap?.nodes?.[0]?.title &&
          !note.mindmap.nodes[0].title.startsWith(newNotePrefix) &&
          !note.mindmap.nodes[0].title.startsWith("Nova Nota")));

    if (hasText || hasNodes) {
      const confirmed = await DialogV2.confirm({
        window: { title: t("SIN.App.SwitchTypeTitle") },
        content: `<p>${t("SIN.App.SwitchTypeConfirm")}</p>`,
        yes: { label: t("SIN.App.SwitchTypeBtn"), icon: "fas fa-exchange-alt" },
        no: { label: t("SIN.Common.Cancel"), default: true }
      });
      if (!confirmed) return;
    }

    const defaultTitle = this.storage.getUniqueNoteTitle(newNotePrefix, note.id);
    note.type = nextType;
    note.content = "";
    note.title = defaultTitle;
    note.mindmap = this.storage.createDefaultMindmap(defaultTitle);
    note.isNewlyCreated = true;
    this.storage.saveNow(data);

    const w = nextType === "mindmap" ? 940 : 700;
    const h = nextType === "mindmap" ? 660 : 640;
    await this._reopenWindow(w, h);
  }

  async deleteNoteWithConfirm(noteId, returnToManager = false) {
    const confirmed = await DialogV2.confirm({
      window: { title: t("SIN.App.DeleteNoteTitle") },
      content: `<p>${t("SIN.App.DeleteNoteConfirm")}</p>`,
      yes: { label: t("SIN.Common.Delete"), icon: "fas fa-trash" },
      no: { label: t("SIN.Common.Cancel"), default: true }
    });
    if (!confirmed) return;

    await this.storage.flush();
    const data = this.storage.getData();
    const note = data.notes.find((n) => n.id === noteId);
    const colId = note?.columnId;
    data.notes = data.notes.filter((n) => n.id !== noteId);
    data.recentNotes = (data.recentNotes || []).filter((r) => r.noteId !== noteId);
    if (colId) {
      this.storage.normalizeColumnRootOrders(colId, data);
    }
    this.storage.saveNow(data);

    if (returnToManager) {
      await this.openManager();
    } else if (colId) {
      this.managerView.refreshColumnDOM(colId);
    }
  }
}