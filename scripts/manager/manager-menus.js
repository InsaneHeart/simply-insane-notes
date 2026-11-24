import { ITEM_COLORS } from "../storage/storage.js";
import { t } from "../shared/shared-i18n.js";

export class ManagerMenus {
  constructor(managerView) {
    this.view = managerView;
    this.app = managerView.app;
    this.storage = managerView.storage;
  }

  get selection() {
    return this.view.selection;
  }

  /* ================= MENUS DE CRIAÇÃO RÁPIDA E ESPAÇO VAZIO ================= */

  showEmptySpaceMenu(x, y, preferredFolderCol = null) {
    const hasSelection = this.selection.isActive();
    const html = `
      <div class="fk-menu-item" data-empty-act="new-folder"><i class="fas fa-folder-plus"></i> ${t("SIN.Manager.NewFolderBtn")}</div>
      ${
        hasSelection
          ? `<div class="fk-menu-sep"></div>
             <div class="fk-menu-item" data-empty-act="clear-sel"><i class="fas fa-times-circle"></i> ${t("SIN.Manager.ClearSelectionCount", { count: this.selection.selectedIds.size })}</div>`
          : ""
      }
    `;
    this.app.openMenu("mgr-empty-space", x, y, html, (menu) => {
      menu.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = e.target.closest("[data-empty-act]");
        if (!item) return;
        this.app.closeMenu();

        if (item.dataset.emptyAct === "clear-sel") {
          this.selection.clearSelection();
          return;
        }

        const newCol = this.storage.createColumn(null, preferredFolderCol);
        this.view.collapsedFolders.add(newCol.id);
        this.view.appendNewColumnDOM(newCol.id);
      };
    });
  }

  showCreateTypeMenu(x, y, colId, subId = null) {
    const html = `
      <div class="fk-menu-item" data-create="text"><i class="fas fa-align-left"></i> ${t("SIN.Menus.TextBlock")}</div>
      <div class="fk-menu-item" data-create="mindmap"><i class="fas fa-project-diagram"></i> ${t("SIN.Common.MindMap")}</div>
    `;
    this.app.openMenu("mgr-create", x, y, html, (menu) => {
      menu.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = e.target.closest("[data-create]");
        if (!item) return;
        this.app.closeMenu();
        this.view.collapsedFolders.delete(colId);
        this.app.openNewNote(colId, item.dataset.create, subId);
      };
    });
  }

  showColumnQuickMenu(x, y, colId, subId = null) {
    const html = `
      <div class="fk-menu-item" data-quick-act="text"><i class="fas fa-align-left"></i> ${t("SIN.Menus.TextBlock")}</div>
      <div class="fk-menu-item" data-quick-act="mindmap"><i class="fas fa-project-diagram"></i> ${t("SIN.Common.MindMap")}</div>
      <div class="fk-menu-sep"></div>
      <div class="fk-menu-item" data-quick-act="add-sub"><i class="fas fa-folder-plus"></i> ${t("SIN.Manager.AddSubsection")}</div>
    `;
    this.app.openMenu("mgr-col-quick", x, y, html, (menu) => {
      menu.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = e.target.closest("[data-quick-act]");
        if (!item) return;
        this.app.closeMenu();

        const act = item.dataset.quickAct;
        if (act === "text" || act === "mindmap") {
          this.view.collapsedFolders.delete(colId);
          this.app.openNewNote(colId, act, subId);
        } else if (act === "add-sub") {
          this.view.collapsedFolders.delete(colId);
          const newSub = this.storage.createSubsection(colId);
          this.view.refreshColumnDOM(colId);
          this.view.focusSubsectionRename(newSub.id);
        }
      };
    });
  }

  /* ================= MENU DE CONTEXTO DA PASTA (INDIVIDUAL E EM LOTE) ================= */

  showColumnContextMenu(x, y, colId, titleLabelEl) {
    if (this.selection.isSelected("folder", colId) && this.selection.selectedIds.size > 1) {
      return this.showBulkFoldersContextMenu(x, y);
    }

    const data = this.storage.getData();
    const col = data.columns.find((c) => c.id === colId);
    const canDelete = data.columns.length > 1;
    const isFav = Boolean(col?.favorite);
    const isSelected = this.selection.isSelected("folder", colId);

    const html = `
      <div class="fk-menu-item" data-col-act="select">
        <i class="fas ${isSelected ? "fa-check-square" : "fa-check-circle"}" style="color:#a78bfa;"></i>
        ${isSelected ? t("SIN.Manager.UnselectFolder") : t("SIN.Manager.SelectFolder")}
      </div>
      <div class="fk-menu-sep"></div>
      <div class="fk-menu-item" data-col-act="fav">
        <i class="fas fa-star" style="color:${isFav ? "#facc15" : "inherit"};"></i>
        ${isFav ? t("SIN.Manager.UnfavFolder") : t("SIN.Manager.FavFolder")}
      </div>
      <div class="fk-menu-item has-submenu">
        <span style="display:flex; align-items:center; gap:8px;"><i class="fas fa-palette"></i> ${t("SIN.Manager.FolderColorMenu")}</span>
        <i class="fas fa-caret-right" style="opacity:0.6;"></i>
        <div class="fk-submenu">
          <div class="fk-color-row">
            <span class="fk-color-row-label">${t("SIN.Manager.AccentColorLabel")}</span>
            <div class="fk-color-swatches">
              ${ITEM_COLORS.map(
                (c) =>
                  `<button type="button" class="fk-color-swatch" data-col-color="${c.hex}" style="background:${c.hex || "#52525b"};" title="${c.labelKey ? t(c.labelKey) : c.label}"></button>`
              ).join("")}
            </div>
          </div>
        </div>
      </div>
      <div class="fk-menu-item" data-col-act="add-sub"><i class="fas fa-folder-plus"></i> ${t("SIN.Manager.AddSubsection")}</div>
      <div class="fk-menu-item" data-col-act="rename"><i class="fas fa-edit"></i> ${t("SIN.Manager.Rename")}</div>
      ${canDelete ? `<div class="fk-menu-sep"></div><div class="fk-menu-item danger" data-col-act="delete"><i class="fas fa-trash"></i> ${t("SIN.Common.Delete")}</div>` : ""}
    `;

    this.app.openMenu("mgr-col", x, y, html, (menu) => {
      menu.onmousedown = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const colorSwatch = e.target.closest("[data-col-color]");
        if (colorSwatch) {
          this.app.closeMenu();
          const newColor = colorSwatch.dataset.colColor;
          this.storage.setColumnColor(colId, newColor);
          this.view.updateColumnColorDOM(colId, newColor);
          return;
        }

        const item = e.target.closest("[data-col-act]");
        if (!item) return;
        this.app.closeMenu();

        const act = item.dataset.colAct;
        if (act === "select") {
          this.selection.selectItem("folder", colId, true);
        } else if (act === "fav") {
          const nowFav = this.storage.toggleColumnFavorite(colId);
          this.view.updateColumnFavoriteDOM(colId, nowFav);
        } else if (act === "add-sub") {
          this.view.collapsedFolders.delete(colId);
          const newSub = this.storage.createSubsection(colId);
          this.view.refreshColumnDOM(colId);
          this.view.focusSubsectionRename(newSub.id);
        } else if (act === "rename") {
          this.view.startInlineColumnRename(titleLabelEl, colId);
        } else if (act === "delete") {
          const nearestCol = this.storage._getNearestColumn(data, colId, data.viewMode);
          const deleted = await this.storage.deleteColumnWithConfirm(colId, data.viewMode);
          if (deleted) {
            this.view.collapsedFolders.delete(colId);
            this.view.removeColumnFromDOM(colId);
            if (nearestCol?.id) {
              this.view.refreshColumnDOM(nearestCol.id);
            }
          }
        }
      };
    });
  }

  showBulkFoldersContextMenu(x, y) {
    const colIds = this.selection.getSelectedIds();
    if (!colIds.length) return;

    const data = this.storage.getData();
    const selectedCols = data.columns.filter((c) => colIds.includes(c.id));
    const allFav = selectedCols.length > 0 && selectedCols.every((c) => c.favorite);
    const favLabel = allFav ? t("SIN.Manager.UnfavFolders") : t("SIN.Manager.FavFolders");
    const countLabel = t("SIN.Manager.SelectedFoldersCount", { count: colIds.length });

    const html = `
      <div class="fk-menu-item" style="pointer-events:none; opacity:0.75; font-size:11.5px; font-weight:600; color:#c4b5fd;">
        <i class="fas fa-check-double"></i> ${countLabel}
      </div>
      <div class="fk-menu-sep"></div>
      <div class="fk-menu-item" data-bulk-col="fav">
        <i class="fas fa-star" style="color:#facc15;"></i> ${favLabel}
      </div>
      <div class="fk-menu-item has-submenu">
        <span style="display:flex; align-items:center; gap:8px;"><i class="fas fa-palette"></i> ${t("SIN.Manager.FoldersColorMenu")}</span>
        <i class="fas fa-caret-right" style="opacity:0.6;"></i>
        <div class="fk-submenu">
          <div class="fk-color-row">
            <span class="fk-color-row-label">${t("SIN.Manager.AccentColorLabel")}</span>
            <div class="fk-color-swatches">
              ${ITEM_COLORS.map(
                (c) =>
                  `<button type="button" class="fk-color-swatch" data-bulk-col-color="${c.hex}" style="background:${c.hex || "#52525b"};" title="${c.labelKey ? t(c.labelKey) : c.label}"></button>`
              ).join("")}
            </div>
          </div>
        </div>
      </div>
      <div class="fk-menu-item" data-bulk-col="clear">
        <i class="fas fa-times-circle"></i> ${t("SIN.Manager.ClearSelection")}
      </div>
      <div class="fk-menu-sep"></div>
      <div class="fk-menu-item danger" data-bulk-col="delete">
        <i class="fas fa-trash"></i> ${t("SIN.Manager.DeleteFolders")}
      </div>
    `;

    this.app.openMenu("mgr-bulk-cols", x, y, html, (menu) => {
      menu.onmousedown = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const colorSwatch = e.target.closest("[data-bulk-col-color]");
        if (colorSwatch) {
          this.app.closeMenu();
          const newColor = colorSwatch.dataset.bulkColColor;
          const updatedIds = this.storage.bulkSetColor("folder", colIds, newColor);
          updatedIds.forEach((id) => this.view.updateColumnColorDOM(id, newColor));
          this.selection.clearSelection();
          this.selection.showUndoToast(t("SIN.Manager.ToastFoldersColorChanged", { count: updatedIds.length }));
          return;
        }

        const item = e.target.closest("[data-bulk-col]");
        if (!item) return;
        this.app.closeMenu();

        const act = item.dataset.bulkCol;
        if (act === "fav") {
          const targetFav = !allFav;
          const updatedIds = this.storage.bulkSetFavorite("folder", colIds, targetFav);
          updatedIds.forEach((id) => this.view.updateColumnFavoriteDOM(id, targetFav));
          this.selection.clearSelection();
          this.selection.showUndoToast(
            targetFav
              ? t("SIN.Manager.ToastFoldersFav", { count: updatedIds.length })
              : t("SIN.Manager.ToastFoldersUnfav", { count: updatedIds.length })
          );
        } else if (act === "clear") {
          this.selection.clearSelection();
        } else if (act === "delete") {
          const deleted = await this.storage.bulkDeleteColumnsWithConfirm(colIds, data.viewMode);
          if (deleted) {
            colIds.forEach((id) => this.view.collapsedFolders.delete(id));
            this.selection.clearSelection();
            this.app.render({ force: true });
            this.selection.showUndoToast(t("SIN.Manager.ToastFoldersDeleted", { count: colIds.length }));
          }
        }
      };
    });
  }

  /* ================= MENU DE CONTEXTO DE SUBSEÇÃO ================= */

  showSubsectionContextMenu(x, y, subId, titleLabelEl) {
    const html = `
      <div class="fk-menu-item" data-sub-act="rename"><i class="fas fa-edit"></i> ${t("SIN.Manager.RenameSubsection")}</div>
      <div class="fk-menu-sep"></div>
      <div class="fk-menu-item danger" data-sub-act="delete"><i class="fas fa-trash"></i> ${t("SIN.Manager.DeleteSubsection")}</div>
    `;
    this.app.openMenu("mgr-sub", x, y, html, (menu) => {
      menu.onmousedown = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = e.target.closest("[data-sub-act]");
        if (!item) return;
        this.app.closeMenu();

        if (item.dataset.subAct === "rename") {
          this.view.startInlineSubsectionRename(titleLabelEl, subId);
        } else if (item.dataset.subAct === "delete") {
          const sub = this.storage.getData().subsections.find((s) => s.id === subId);
          const parentColId = sub?.columnId;
          const deleted = await this.storage.deleteSubsectionWithConfirm(subId);
          if (deleted && parentColId) {
            this.view.refreshColumnDOM(parentColId);
          }
        }
      };
    });
  }

  /* ================= MENU DE CONTEXTO DA NOTA (INDIVIDUAL E EM LOTE) ================= */

  showNoteContextMenu(x, y, note, titleLabelEl) {
    if (this.selection.isSelected("note", note.id) && this.selection.selectedIds.size > 1) {
      return this.showBulkNotesContextMenu(x, y);
    }

    const favLabel = note.favorite ? t("SIN.Manager.Unfav") : t("SIN.Manager.Fav");
    const isSelected = this.selection.isSelected("note", note.id);

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

    const html = `
      <div class="fk-menu-item" data-act="open"><i class="fas fa-folder-open"></i> ${t("SIN.Manager.OpenNote")}</div>
      <div class="fk-menu-item" data-act="select">
        <i class="fas ${isSelected ? "fa-check-square" : "fa-check-circle"}" style="color:#a78bfa;"></i>
        ${isSelected ? t("SIN.Manager.UnselectNote") : t("SIN.Manager.SelectNote")}
      </div>
      <div class="fk-menu-sep"></div>
      <div class="fk-menu-item" data-act="fav"><i class="fas fa-star" style="color:#facc15;"></i> ${favLabel}</div>
      <div class="fk-menu-item has-submenu">
        <span style="display:flex; align-items:center; gap:8px;"><i class="fas fa-palette"></i> ${t("SIN.Manager.NoteColorMenu")}</span>
        <i class="fas fa-caret-right" style="opacity:0.6;"></i>
        <div class="fk-submenu">
          <div class="fk-color-row">
            <span class="fk-color-row-label">${t("SIN.Manager.SideBarColorLabel")}</span>
            <div class="fk-color-swatches">
              ${ITEM_COLORS.map(
                (c) =>
                  `<button type="button" class="fk-color-swatch" data-note-color="${c.hex}" style="background:${c.hex || "#52525b"};" title="${c.labelKey ? t(c.labelKey) : c.label}"></button>`
              ).join("")}
            </div>
          </div>
        </div>
      </div>
      <div class="fk-menu-item" data-act="rename"><i class="fas fa-edit"></i> ${t("SIN.Manager.Rename")}</div>
      <div class="fk-menu-item" data-act="duplicate"><i class="fas fa-copy"></i> ${t("SIN.Menus.DuplicateNote")}</div>
      ${downloadSubmenuHtml}
      <div class="fk-menu-item" data-act="share"><i class="fas fa-share-alt"></i> ${t("SIN.Menus.ShareNote")}</div>
      <div class="fk-menu-sep"></div>
      <div class="fk-menu-item danger" data-act="delete"><i class="fas fa-trash"></i> ${t("SIN.Menus.DeleteNote")}</div>
    `;

    this.app.openMenu("mgr-note", x, y, html, (menu) => {
      menu.onmousedown = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const colorSwatch = e.target.closest("[data-note-color]");
        if (colorSwatch) {
          this.app.closeMenu();
          const newColor = colorSwatch.dataset.noteColor;
          this.storage.setNoteColor(note.id, newColor);
          note.color = newColor || "";
          this.view.updateNoteColorDOM(note.id, newColor);
          return;
        }

        const dlItem = e.target.closest("[data-dl-fmt]");
        if (dlItem) {
          this.app.closeMenu();
          await this.storage.downloadNote(note.id, game.user.id, dlItem.dataset.dlFmt);
          return;
        }

        const item = e.target.closest(".fk-menu-item[data-act]");
        if (!item) return;
        this.app.closeMenu();

        const act = item.dataset.act;
        if (act === "open") {
          this.app.openNote(note.id, game.user.id);
        } else if (act === "select") {
          this.selection.selectItem("note", note.id, true);
        } else if (act === "fav") {
          this.storage.toggleFavorite(note.id);
          this.view.refreshColumnDOM(note.columnId);
        } else if (act === "rename") {
          this.view.startInlineNoteRename(titleLabelEl, note.id);
        } else if (act === "duplicate") {
          const copy = this.storage.duplicateNote(note.id);
          if (copy) {
            ui.notifications.info(t("SIN.Menus.NoteDuplicated"));
            this.view.refreshColumnDOM(note.columnId);
          }
        } else if (act === "share") {
          await this.storage.openShareSettingsDialog(note.id);
          this.view.updateNoteSharedDOM(note.id);
        } else if (act === "delete") {
          const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: t("SIN.App.DeleteNoteTitle") },
            content: `<p>${t("SIN.App.DeleteNoteConfirm")}</p>`,
            yes: { label: t("SIN.Common.Delete"), icon: "fas fa-trash" },
            no: { label: t("SIN.Common.Cancel"), default: true }
          });
          if (confirmed) {
            const targetColId = note.columnId;
            await this.storage.flush();
            const fresh = this.storage.getData();
            fresh.notes = fresh.notes.filter((n) => n.id !== note.id);
            fresh.recentNotes = (fresh.recentNotes || []).filter((r) => r.noteId !== note.id);
            this.storage.normalizeColumnRootOrders(targetColId, fresh);
            await this.storage.saveNow(fresh);
            const cardEl = this.view.getManagerBody()?.querySelector(`.fk-postit[data-note-id="${note.id}"]`);
            cardEl?.remove();
            this.view.syncColumnStateDOM(targetColId);
          }
        }
      };
    });
  }

  showBulkNotesContextMenu(x, y) {
    const noteIds = this.selection.getOrderedSelectedNoteIds();
    if (!noteIds.length) return;

    const data = this.storage.getData();
    const selectedNotes = data.notes.filter((n) => noteIds.includes(n.id));
    const allFav = selectedNotes.length > 0 && selectedNotes.every((n) => n.favorite);
    const favLabel = allFav ? t("SIN.Manager.UnfavNotes") : t("SIN.Manager.FavNotes");
    const countLabel = t("SIN.Manager.SelectedNotesCount", { count: noteIds.length });

    const html = `
      <div class="fk-menu-item" style="pointer-events:none; opacity:0.75; font-size:11.5px; font-weight:600; color:#c4b5fd;">
        <i class="fas fa-check-double"></i> ${countLabel}
      </div>
      <div class="fk-menu-sep"></div>
      <div class="fk-menu-item" data-bulk-note="fav">
        <i class="fas fa-star" style="color:#facc15;"></i> ${favLabel}
      </div>
      <div class="fk-menu-item has-submenu">
        <span style="display:flex; align-items:center; gap:8px;"><i class="fas fa-palette"></i> ${t("SIN.Manager.NotesColorMenu")}</span>
        <i class="fas fa-caret-right" style="opacity:0.6;"></i>
        <div class="fk-submenu">
          <div class="fk-color-row">
            <span class="fk-color-row-label">${t("SIN.Manager.SideBarColorLabel")}</span>
            <div class="fk-color-swatches">
              ${ITEM_COLORS.map(
                (c) =>
                  `<button type="button" class="fk-color-swatch" data-bulk-note-color="${c.hex}" style="background:${c.hex || "#52525b"};" title="${c.labelKey ? t(c.labelKey) : c.label}"></button>`
              ).join("")}
            </div>
          </div>
        </div>
      </div>
      <div class="fk-menu-item" data-bulk-note="share">
        <i class="fas fa-share-alt"></i> ${t("SIN.Manager.ShareNotes")}
      </div>
      <div class="fk-menu-item" data-bulk-note="download-zip">
        <i class="fas fa-file-archive"></i> ${t("SIN.Manager.DownloadZipPack")}
      </div>
      <div class="fk-menu-item" data-bulk-note="clear">
        <i class="fas fa-times-circle"></i> ${t("SIN.Manager.ClearSelection")}
      </div>
      <div class="fk-menu-sep"></div>
      <div class="fk-menu-item danger" data-bulk-note="delete">
        <i class="fas fa-trash"></i> ${t("SIN.Manager.DeleteNotes")}
      </div>
    `;

    this.app.openMenu("mgr-bulk-notes", x, y, html, (menu) => {
      menu.onmousedown = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const colorSwatch = e.target.closest("[data-bulk-note-color]");
        if (colorSwatch) {
          this.app.closeMenu();
          const newColor = colorSwatch.dataset.bulkNoteColor;
          this.storage.bulkSetColor("note", noteIds, newColor);
          noteIds.forEach((id) => this.view.updateNoteColorDOM(id, newColor));
          this.selection.clearSelection();
          this.selection.showUndoToast(t("SIN.Manager.ToastNotesColorChanged", { count: noteIds.length }));
          return;
        }

        const item = e.target.closest("[data-bulk-note]");
        if (!item) return;
        this.app.closeMenu();

        const act = item.dataset.bulkNote;
        if (act === "fav") {
          const targetFav = !allFav;
          const affectedColIds = this.storage.bulkSetFavorite("note", noteIds, targetFav);
          affectedColIds.forEach((colId) => this.view.refreshColumnDOM(colId));
          this.selection.clearSelection();
          this.selection.showUndoToast(
            targetFav
              ? t("SIN.Manager.ToastNotesFav", { count: noteIds.length })
              : t("SIN.Manager.ToastNotesUnfav", { count: noteIds.length })
          );
        } else if (act === "share") {
          const shared = await this.storage.openBulkShareSettingsDialog(noteIds);
          if (shared) {
            noteIds.forEach((id) => this.view.updateNoteSharedDOM(id));
            this.selection.clearSelection();
            this.selection.showUndoToast(t("SIN.Manager.ToastNotesShareUpdated", { count: noteIds.length }));
          }
        } else if (act === "download-zip") {
          await this.storage.downloadNotesAsZip(noteIds);
          this.selection.clearSelection();
        } else if (act === "clear") {
          this.selection.clearSelection();
        } else if (act === "delete") {
          const affectedColIds = await this.storage.bulkDeleteNotesWithConfirm(noteIds);
          if (affectedColIds) {
            this.selection.clearSelection();
            affectedColIds.forEach((colId) => this.view.refreshColumnDOM(colId));
            this.selection.showUndoToast(t("SIN.Manager.ToastNotesDeleted", { count: noteIds.length }));
          }
        }
      };
    });
  }
}