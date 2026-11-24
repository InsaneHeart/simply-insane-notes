import { MODULE_TITLE } from "../storage/storage.js";
import { t } from "../shared/shared-i18n.js";

const SUPPORT_URL = "https://ko-fi.com/insaneheart";

export class AppMenus {
  constructor(app) {
    this.app = app;
    this.storage = app.storage;
    this.activeMenuId = null;
    this._globalListenerBound = false;
  }

  ensureMenuContainer() {
    let menu = document.getElementById("fk-dropdown-menu");
    if (!menu) {
      menu = document.createElement("div");
      menu.id = "fk-dropdown-menu";
      menu.className = "fk-dropdown-menu";
      document.body.appendChild(menu);
    }

    if (!this._globalListenerBound) {
      this._globalListenerBound = true;
      document.addEventListener("mousedown", (e) => {
        const m = document.getElementById("fk-dropdown-menu");
        if (m && m.style.display === "block" && !m.contains(e.target)) {
          this.closeMenu();
        }
        const suggest = document.getElementById("fk-link-suggest");
        if (suggest && suggest.style.display === "block" && !suggest.contains(e.target)) {
          suggest.style.display = "none";
        }
      });
    }
  }

  openMenu(menuId, x, y, html, bindFn) {
    const menu = document.getElementById("fk-dropdown-menu");
    if (!menu) return;

    if (menu.style.display === "block" && this.activeMenuId === menuId) {
      this.closeMenu();
      return;
    }

    this.activeMenuId = menuId;
    menu.onclick = null;
    menu.onmousedown = null;
    menu.innerHTML = html;
    menu.style.display = "block";

    const rect = menu.getBoundingClientRect();
    const clampedLeft = Math.max(8, Math.min(window.innerWidth - rect.width - 8, x));
    const clampedTop = Math.max(8, Math.min(window.innerHeight - rect.height - 8, y));
    menu.style.left = `${clampedLeft}px`;
    menu.style.top = `${clampedTop}px`;

    menu.querySelectorAll(".fk-menu-item.has-submenu").forEach((item) => {
      item.addEventListener("mouseenter", () => {
        const sub = item.querySelector(":scope > .fk-submenu");
        if (!sub) return;

        sub.style.left = "100%";
        sub.style.right = "auto";
        sub.style.top = "-4px";
        sub.style.bottom = "auto";

        const subRect = sub.getBoundingClientRect();
        if (subRect.right > window.innerWidth - 8) {
          sub.style.left = "auto";
          sub.style.right = "100%";
        }
        if (subRect.bottom > window.innerHeight - 8) {
          const overflowY = subRect.bottom - (window.innerHeight - 8);
          sub.style.top = `${Math.round(-4 - overflowY)}px`;
        }
      });
    });

    if (bindFn) bindFn(menu);
  }

  closeMenu() {
    const menu = document.getElementById("fk-dropdown-menu");
    if (menu) {
      menu.style.display = "none";
      menu.onclick = null;
      menu.onmousedown = null;
    }
    this.activeMenuId = null;
  }

  showViewSwitcherMenu(x, y) {
    const html = `
      <div class="fk-menu-item" data-view="kanban"><i class="fas fa-th-large"></i> ${t("SIN.App.ViewBoard")}</div>
      <div class="fk-menu-item" data-view="list"><i class="fas fa-folder"></i> ${t("SIN.App.ViewFolders")}</div>
    `;
    this.openMenu("hdr-view", x, y, html, (menu) => {
      menu.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = e.target.closest("[data-view]");
        if (!item) return;
        this.closeMenu();
        const fresh = this.storage.getData();
        fresh.viewMode = item.dataset.view;
        this.storage.saveNow(fresh);
        this.app.render({ force: true });
      };
    });
  }

  showQuickTypeMenu(x, y, targetColId = null) {
    const html = `
      <div class="fk-menu-item" data-create-type="text">
        <i class="fas fa-align-left"></i> ${t("SIN.Menus.TextBlock")}
      </div>
      <div class="fk-menu-item" data-create-type="mindmap">
        <i class="fas fa-project-diagram"></i> ${t("SIN.Common.MindMap")}
      </div>
    `;

    this.openMenu("hdr-quick-type", x, y, html, (menu) => {
      menu.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = e.target.closest("[data-create-type]");
        if (!item) return;
        this.closeMenu();
        this.app.openNewNote(targetColId, item.dataset.createType, null);
      };
    });
  }

  showFilesButtonMenu(x, y, noteId, ownerId = null) {
    const html = `
      <div class="fk-menu-item" data-files-act="open-manager">
        <i class="fas fa-folder-open"></i> ${t("SIN.Menus.OpenManager")}
      </div>
      <div class="fk-menu-item" data-files-act="locate-note">
        <i class="fas fa-crosshairs"></i> ${t("SIN.Menus.LocateNote")}
      </div>
    `;

    this.openMenu("hdr-files-ctx", x, y, html, (menu) => {
      menu.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = e.target.closest("[data-files-act]");
        if (!item) return;
        this.closeMenu();

        if (item.dataset.filesAct === "locate-note" && noteId) {
          this.app.openManagerAndFocusNote(noteId, ownerId);
        } else {
          this.app.openManager();
        }
      };
    });
  }

  showManagerSettingsMenu(x, y) {
    const data = this.storage.getData();
    const isList = data.viewMode === "list";
    const isCompact = isList ? Boolean(data.compactFoldersCards) : Boolean(data.compactCards);
    const compactIcon = isCompact ? "fa-expand-alt" : "fa-compress-alt";
    const compactLabel = isCompact ? t("SIN.Menus.DetailedMode") : t("SIN.Menus.CompactMode");

    const gmBackupSubmenu = game.user.isGM
      ? `
        <div class="fk-menu-item has-submenu">
          <span style="display:flex; align-items:center; gap:8px;"><i class="fas fa-database"></i> ${t("SIN.Menus.GmBackup")}</span>
          <i class="fas fa-caret-right" style="opacity:0.6;"></i>
          <div class="fk-submenu">
            <div class="fk-menu-item" data-act="backup-export">
              <i class="fas fa-download"></i> ${t("SIN.Menus.DownloadBackup")}
            </div>
            <div class="fk-menu-item" data-act="backup-restore">
              <i class="fas fa-upload"></i> ${t("SIN.Menus.RestoreBackup")}
            </div>
          </div>
        </div>
        <div class="fk-menu-sep"></div>
      `
      : "";

    const html = `
      ${
        this.app.mode === "manager"
          ? `<div class="fk-menu-item" data-act="toggle-compact">
              <i class="fas ${compactIcon}"></i> ${compactLabel}
            </div>
            <div class="fk-menu-sep"></div>`
          : ""
      }
      ${gmBackupSubmenu}
      <div class="fk-menu-item" data-act="module-settings">
        <i class="fas fa-sliders-h"></i> ${t("SIN.Menus.ModuleSettings")}
      </div>
      <div class="fk-menu-item" data-act="app-info">
        <i class="fas fa-info-circle"></i> ${t("SIN.Menus.AboutModule", { title: MODULE_TITLE })}
      </div>
      <div class="fk-menu-sep"></div>
      <div class="fk-menu-item fk-menu-item-support" data-act="support-project">
        <i class="fas fa-mug-hot"></i> ${t("SIN.Menus.SupportProject")}
      </div>
    `;

    this.openMenu("hdr-mgr-settings", x, y, html, (menu) => {
      menu.onmousedown = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = e.target.closest(".fk-menu-item[data-act]");
        if (!item) return;
        this.closeMenu();

        const act = item.dataset.act;
        if (act === "toggle-compact") {
          const fresh = this.storage.getData();
          if (fresh.viewMode === "list") {
            fresh.compactFoldersCards = !fresh.compactFoldersCards;
            this.storage.saveNow(fresh);
            this.app.managerView.toggleCompactModeDOM(fresh.compactFoldersCards, "list");
          } else {
            fresh.compactCards = !fresh.compactCards;
            this.storage.saveNow(fresh);
            this.app.managerView.toggleCompactModeDOM(fresh.compactCards, "kanban");
          }
        } else if (act === "backup-export") {
          await this.storage.exportBackupJson();
        } else if (act === "backup-restore") {
          this.storage.promptRestoreBackupJson(() => {
            this.app.render({ force: true });
          });
        } else if (act === "module-settings") {
          this.app.openSettingsApp();
        } else if (act === "app-info") {
          await this.app.infoModals.openAppInfoModal();
        } else if (act === "support-project") {
          window.open(SUPPORT_URL, "_blank", "noopener,noreferrer");
        }
      };
    });
  }

  showNoteSettingsMenu(x, y, note) {
    if (!note) return;

    const isReadOnly = Boolean(note.readOnly);
    const isLocked = Boolean(note.locked);
    const nextLabel = note.type === "text" ? t("SIN.Common.MindMap") : t("SIN.Menus.TextBlock");
    const nextType = note.type === "text" ? "mindmap" : "text";

    const downloadSubmenuHtml =
      note.type === "mindmap"
        ? `
          <div class="fk-menu-item has-submenu">
            <span style="display:flex; align-items:center; gap:8px;"><i class="fas fa-download"></i> ${t("SIN.Menus.DownloadAs")}</span>
            <i class="fas fa-caret-right" style="opacity:0.6;"></i>
            <div class="fk-submenu">
              <div class="fk-menu-item" data-dl-fmt="png"><i class="fas fa-image"></i> ${t("SIN.Menus.FormatPng")}</div>
              <div class="fk-menu-item" data-dl-fmt="jpg"><i class="fas fa-file-image"></i> ${t("SIN.Menus.FormatJpeg")}</div>
              <div class="fk-menu-item" data-dl-fmt="pdf"><i class="fas fa-file-pdf"></i> ${t("SIN.Menus.FormatPdfImage")}</div>
            </div>
          </div>
        `
        : `
          <div class="fk-menu-item has-submenu">
            <span style="display:flex; align-items:center; gap:8px;"><i class="fas fa-download"></i> ${t("SIN.Menus.DownloadAs")}</span>
            <i class="fas fa-caret-right" style="opacity:0.6;"></i>
            <div class="fk-submenu">
              <div class="fk-menu-item" data-dl-fmt="md"><i class="fab fa-markdown"></i> ${t("SIN.Menus.FormatMarkdown")}</div>
              <div class="fk-menu-item" data-dl-fmt="pdf"><i class="fas fa-file-pdf"></i> ${t("SIN.Menus.FormatPdfDoc")}</div>
              <div class="fk-menu-item" data-dl-fmt="txt"><i class="fas fa-file-alt"></i> ${t("SIN.Menus.FormatTxt")}</div>
            </div>
          </div>
        `;

    const editOptionsHtml = !isReadOnly
      ? `
        <div class="fk-menu-sep"></div>
        <div class="fk-menu-item" data-act="toggle-lock">
          <i class="fas ${isLocked ? "fa-unlock" : "fa-lock"}" style="color:${isLocked ? "#facc15" : "inherit"};"></i>
          ${isLocked ? t("SIN.Menus.UnlockEdit") : t("SIN.Menus.LockEdit")}
        </div>
        <div class="fk-menu-item" data-act="duplicate">
          <i class="fas fa-copy"></i> ${t("SIN.Menus.DuplicateNote")}
        </div>
        <div class="fk-menu-item" data-act="share">
          <i class="fas fa-share-alt"></i> ${t("SIN.Menus.ShareNote")}
        </div>
        <div class="fk-menu-item" data-act="switch-type">
          <i class="fas fa-exchange-alt"></i> ${t("SIN.Menus.SwitchTo", { type: nextLabel })}
        </div>
      `
      : "";

    const deleteOptionHtml = !isReadOnly
      ? `
        <div class="fk-menu-sep"></div>
        <div class="fk-menu-item danger" data-act="delete">
          <i class="fas fa-trash"></i> ${t("SIN.Menus.DeleteNote")}
        </div>
      `
      : "";

    const html = `
      <div class="fk-menu-item" data-act="in-search">
        <i class="fas fa-search"></i> ${t("SIN.Menus.FindInNote")}
      </div>
      <div class="fk-menu-item" data-act="global-search">
        <i class="fas fa-compass"></i> ${t("SIN.Menus.GlobalSearch")}
      </div>
      ${downloadSubmenuHtml}
      ${editOptionsHtml}
      <div class="fk-menu-sep"></div>
      <div class="fk-menu-item" data-act="note-info">
        <i class="fas fa-info-circle"></i> ${t("SIN.Menus.NoteInfo")}
      </div>
      <div class="fk-menu-item" data-act="module-settings">
        <i class="fas fa-sliders-h"></i> ${t("SIN.Menus.ModuleSettings")}
      </div>
      <div class="fk-menu-item" data-act="app-info">
        <i class="fas fa-book-open"></i> ${t("SIN.Menus.AboutModule", { title: MODULE_TITLE })}
      </div>
      <div class="fk-menu-sep"></div>
      <div class="fk-menu-item fk-menu-item-support" data-act="support-project">
        <i class="fas fa-mug-hot"></i> ${t("SIN.Menus.SupportProject")}
      </div>
      ${deleteOptionHtml}
    `;

    this.openMenu("hdr-settings", x, y, html, (menu) => {
      menu.onmousedown = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dlItem = e.target.closest("[data-dl-fmt]");
        if (dlItem) {
          this.closeMenu();
          await this.storage.downloadNote(note.id, note.ownerId, dlItem.dataset.dlFmt);
          return;
        }

        const item = e.target.closest(".fk-menu-item[data-act]");
        if (!item) return;
        this.closeMenu();

        const act = item.dataset.act;
        if (act === "in-search") {
          if (note.type === "mindmap") this.app.mindmapEditor.toggleInNoteSearch();
          else this.app.textEditor.toggleInNoteSearch();
        } else if (act === "global-search") {
          this.app.openSearch(true);
        } else if (act === "toggle-lock") {
          this.storage.toggleNoteLock(note.id);
          this.app.render({ force: true });
        } else if (act === "duplicate") {
          const copy = this.storage.duplicateNote(note.id);
          if (copy) {
            ui.notifications.info(t("SIN.Menus.NoteDuplicated"));
            this.app.openNote(copy.id);
          }
        } else if (act === "switch-type") {
          await this.app.switchNoteTypeWithConfirm(note.id, nextType);
        } else if (act === "share") {
          await this.storage.openShareSettingsDialog(note.id);
          this.app.render({ force: true });
        } else if (act === "note-info") {
          await this.app.infoModals.openNoteInfoModal(note.id, note.ownerId);
        } else if (act === "module-settings") {
          this.app.openSettingsApp();
        } else if (act === "app-info") {
          await this.app.infoModals.openAppInfoModal();
        } else if (act === "support-project") {
          window.open(SUPPORT_URL, "_blank", "noopener,noreferrer");
        } else if (act === "delete") {
          await this.app.deleteNoteWithConfirm(note.id, true);
        }
      };
    });
  }
}