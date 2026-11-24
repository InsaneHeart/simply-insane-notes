import { KanbanRenderer } from "./manager-kanban.js";
import { FoldersRenderer } from "./manager-folders.js";
import { ManagerNavigation } from "./manager-navigation.js";
import { ManagerSelection } from "./manager-selection.js";
import { ManagerMenus } from "./manager-menus.js";
import { ManagerShared } from "./manager-shared.js";
import { ManagerCards } from "./manager-cards.js";
import { t } from "../shared/shared-i18n.js";

export class ManagerView {
  constructor(app) {
    this.app = app;
    this.storage = app.storage;
    this.collapsedFolders = new Set();
    this.highlightedColId = null;
    this.highlightedNoteId = null;
    this.pendingRenameColId = null;
    this.pendingRenameSubId = null;
    this.sharedFolderOpen = false;
    this._locatePulseTimer = null;

    this.navigation = new ManagerNavigation(this);
    this.selection = new ManagerSelection(this);
    this.menus = new ManagerMenus(this);
    this.shared = new ManagerShared(this);
    this.cards = new ManagerCards(this);
    this.kanbanRenderer = new KanbanRenderer(this);
    this.foldersRenderer = new FoldersRenderer(this);
  }

  getFolderHeaderStyle(color) {
    if (!color) return "";
    const clean = color.replace("#", "").trim();
    if (clean.length === 6) {
      const r = parseInt(clean.slice(0, 2), 16);
      const g = parseInt(clean.slice(2, 4), 16);
      const b = parseInt(clean.slice(4, 6), 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        const mixR = Math.round(24 * 0.88 + r * 0.12);
        const mixG = Math.round(24 * 0.88 + g * 0.12);
        const mixB = Math.round(27 * 0.88 + b * 0.12);
        return `background: rgb(${mixR}, ${mixG}, ${mixB}); border-color: ${color};`;
      }
    }
    return `background: color-mix(in srgb, ${color} 12%, #18181b); border-color: ${color};`;
  }

  render(root) {
    this.navigation.initObservers();

    const data = this.storage.getData();
    const wrapper = document.createElement("div");
    wrapper.className = "fk-manager-wrapper";

    if (data.viewMode === "kanban") {
      this.shared.renderSidebar(wrapper, data);
    }

    const body = document.createElement("div");
    body.className = "fk-manager-body";
    wrapper.appendChild(body);
    root.appendChild(wrapper);

    if (data.viewMode === "list") {
      this.foldersRenderer.render(body, data);
    } else {
      this.kanbanRenderer.render(body, data);
    }

    this.navigation.bindManagerPanNavigation(wrapper);
    this.selection.bindMarqueeSelection(wrapper);
    this.selection.syncSelectionDOM();
  }

  onAfterRender() {
    const wrapper = this.app.element?.querySelector(".fk-manager-wrapper");
    const body = wrapper?.querySelector(".fk-manager-body");
    if (!wrapper || !body) return;

    requestAnimationFrame(() => {
      this.refreshAllScrollFades(wrapper);

      if (this.highlightedColId) {
        const targetId = this.highlightedColId;
        this.highlightedColId = null;
        const el = body.querySelector(`[data-col-id="${targetId}"]`);
        if (el) {
          clearTimeout(this._locatePulseTimer);
          wrapper.querySelectorAll(".fk-locate-pulse").forEach((n) => n.classList.remove("fk-locate-pulse"));
          el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
          el.classList.add("fk-locate-pulse");
          this._locatePulseTimer = setTimeout(() => {
            el.classList.remove("fk-locate-pulse");
          }, 2200);
        }
      }

      if (this.highlightedNoteId) {
        const targetNoteId = this.highlightedNoteId;
        this.highlightedNoteId = null;
        const el = wrapper.querySelector(`.fk-postit[data-note-id="${targetNoteId}"]`);
        if (el) {
          clearTimeout(this._locatePulseTimer);
          wrapper.querySelectorAll(".fk-locate-pulse").forEach((n) => n.classList.remove("fk-locate-pulse"));

          const parentCol = el.closest("[data-col-id]");
          parentCol?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
          el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });

          const prevOutline = el.style.outline;
          const prevShadow = el.style.boxShadow;
          el.classList.add("fk-locate-pulse");
          el.style.outline = "2px solid #a78bfa";
          el.style.boxShadow = "0 0 0 4px rgba(167, 139, 250, 0.28)";

          this._locatePulseTimer = setTimeout(() => {
            el.classList.remove("fk-locate-pulse");
            el.style.outline = prevOutline;
            el.style.boxShadow = prevShadow;
          }, 2200);
        }
      }

      if (this.pendingRenameColId) {
        const renameColId = this.pendingRenameColId;
        this.pendingRenameColId = null;
        this.focusColumnRename(renameColId);
      }

      if (this.pendingRenameSubId) {
        const renameSubId = this.pendingRenameSubId;
        this.pendingRenameSubId = null;
        this.focusSubsectionRename(renameSubId);
      }
    });
  }

  /* ================= DELEGAÇÕES ================= */

  bindVerticalScrollFade(el) {
    return this.navigation.bindVerticalScrollFade(el);
  }

  bindHorizontalScrollFade(el) {
    return this.navigation.bindHorizontalScrollFade(el);
  }

  updateVerticalScrollFade(el) {
    return this.navigation.updateVerticalScrollFade(el);
  }

  updateHorizontalScrollFade(el) {
    return this.navigation.updateHorizontalScrollFade(el);
  }

  refreshAllScrollFades(rootEl = null) {
    return this.navigation.refreshAllScrollFades(rootEl);
  }

  updateDragAutoScroll(ev, onScrollStep = null, allowVerticalColumnScroll = true) {
    return this.navigation.updateDragAutoScroll(ev, onScrollStep, allowVerticalColumnScroll);
  }

  stopDragAutoScroll() {
    return this.navigation.stopDragAutoScroll();
  }

  getClampedPointInManager(clientX, clientY) {
    return this.navigation.getClampedPointInManager(clientX, clientY);
  }

  showEmptySpaceMenu(x, y, preferredFolderCol = null) {
    return this.menus.showEmptySpaceMenu(x, y, preferredFolderCol);
  }

  showCreateTypeMenu(x, y, colId, subId = null) {
    return this.menus.showCreateTypeMenu(x, y, colId, subId);
  }

  showColumnQuickMenu(x, y, colId, subId = null) {
    return this.menus.showColumnQuickMenu(x, y, colId, subId);
  }

  showColumnContextMenu(x, y, colId, titleLabelEl) {
    return this.menus.showColumnContextMenu(x, y, colId, titleLabelEl);
  }

  showSubsectionContextMenu(x, y, subId, titleLabelEl) {
    return this.menus.showSubsectionContextMenu(x, y, subId, titleLabelEl);
  }

  showNoteContextMenu(x, y, note, titleLabelEl) {
    return this.menus.showNoteContextMenu(x, y, note, titleLabelEl);
  }

  renderGroupedSharedCards(container, sharedNotes, groupBy, showAuthorBadge = false) {
    return this.shared.renderGroupedCards(container, sharedNotes, groupBy, showAuthorBadge);
  }

  startInlineColumnRename(labelEl, colId) {
    return this.cards.startInlineColumnRename(labelEl, colId);
  }

  startInlineSubsectionRename(labelEl, subId) {
    return this.cards.startInlineSubsectionRename(labelEl, subId);
  }

  startInlineNoteRename(titleEl, noteId) {
    return this.cards.startInlineNoteRename(titleEl, noteId);
  }

  createSubsectionElement(sub, colId, subNotes, isFolderView = false) {
    return this.cards.createSubsectionElement(sub, colId, subNotes, isFolderView);
  }

  createCardElement(note, currentColId, currentSubId) {
    return this.cards.createCardElement(note, currentColId, currentSubId);
  }

  /* ================= ATUALIZAÇÕES CIRÚRGICAS DO DOM ================= */

  getManagerBody() {
    return this.app.element?.querySelector(".fk-manager-body") || null;
  }

  toggleCompactModeDOM(isCompact, viewMode = "kanban") {
    const body = this.getManagerBody();
    if (!body) return;

    const target =
      viewMode === "list"
        ? body.querySelector(".fk-folders-view-scroll")
        : body.querySelector(".fk-kanban-board");

    if (target) {
      target.classList.toggle("compact", Boolean(isCompact));
      requestAnimationFrame(() => this.refreshAllScrollFades());
    }
  }

  syncColumnStateDOM(colId) {
    if (!colId) return;
    const body = this.getManagerBody();
    if (!body) return;

    const colEl = body.querySelector(`[data-col-id="${colId}"]`);
    if (!colEl) return;

    const data = this.storage.getData();
    const isFolderView = data.viewMode === "list";
    const colNotes = data.notes.filter((n) => n.columnId === colId);

    const countEl = colEl.querySelector(".fk-col-count, .fk-folder-count");
    if (countEl) countEl.textContent = String(colNotes.length);

    if (isFolderView) {
      const isCollapsed = this.collapsedFolders.has(colId);
      const caretEl = colEl.querySelector(".fk-folder-caret");
      const iconEl = colEl.querySelector(".fk-folder-icon");
      const bodyCardsEl = colEl.querySelector(".fk-folder-body-cards");
      if (caretEl) caretEl.textContent = isCollapsed ? "▸" : "▾";
      if (iconEl) {
        iconEl.classList.toggle("fa-folder", isCollapsed);
        iconEl.classList.toggle("fa-folder-open", !isCollapsed);
      }
      if (bodyCardsEl) {
        bodyCardsEl.style.display = isCollapsed ? "none" : "";
      }
    }

    const rootDrop = colEl.querySelector(".fk-root-dropzone");
    if (rootDrop) {
      const hasRealItems = Boolean(rootDrop.querySelector(":scope > .fk-postit, :scope > .fk-subsection"));
      const existingEmpty = rootDrop.querySelector(":scope > .fk-folder-empty-msg");

      if (isFolderView && !hasRealItems) {
        if (!existingEmpty) {
          const emptyMsg = document.createElement("div");
          emptyMsg.className = "fk-folder-empty-msg";
          emptyMsg.textContent = t("SIN.Manager.NoNotesHere");
          rootDrop.appendChild(emptyMsg);
        }
      } else if (existingEmpty) {
        existingEmpty.remove();
      }
    }

    colEl.querySelectorAll(".fk-subsection").forEach((subEl) => {
      const subId = subEl.dataset.subId;
      const subData = data.subsections.find((s) => s.id === subId);
      const subCardsBox = subEl.querySelector(".fk-sub-cards, .fk-folder-sub-cards");
      if (!subCardsBox) return;

      const subNoteCards = subCardsBox.querySelectorAll(":scope > .fk-postit");
      const noteCount = subNoteCards.length;

      const subCountEl = subEl.querySelector(".fk-sub-count");
      if (subCountEl) subCountEl.textContent = String(noteCount);

      subEl.classList.toggle("is-empty", noteCount === 0);

      if (subData) {
        const subCaret = subEl.querySelector(".fk-sub-caret");
        if (subCaret) subCaret.textContent = subData.collapsed ? "▸" : "▾";
        subCardsBox.style.display = subData.collapsed ? "none" : "flex";
      }

      const existingSubEmpty = subCardsBox.querySelector(":scope > .fk-folder-empty-msg");
      if (isFolderView && noteCount === 0) {
        if (!existingSubEmpty) {
          const subEmptyMsg = document.createElement("div");
          subEmptyMsg.className = "fk-folder-empty-msg";
          subEmptyMsg.textContent = t("SIN.Manager.NoNotesHere");
          subCardsBox.appendChild(subEmptyMsg);
        }
      } else if (existingSubEmpty) {
        existingSubEmpty.remove();
      }
    });

    this.selection.syncSelectionDOM();
    requestAnimationFrame(() => this.refreshAllScrollFades());
  }

  refreshColumnDOM(colId) {
    if (!colId) return;
    const body = this.getManagerBody();
    if (!body) return;

    const data = this.storage.getData();
    const col = data.columns.find((c) => c.id === colId);
    if (!col) return;

    if (data.viewMode === "list") {
      const twoColsWrap = body.querySelector(".fk-folders-two-cols");
      const oldUnit = body.querySelector(`.fk-folder-unit[data-col-id="${colId}"]`);
      if (twoColsWrap && oldUnit) {
        const newUnit = this.foldersRenderer._createFolderUnitElement(col, data, twoColsWrap);
        oldUnit.replaceWith(newUnit);
      }
      const foldersScroll = body.querySelector(".fk-folders-view-scroll");
      if (foldersScroll) {
        requestAnimationFrame(() => this.updateVerticalScrollFade(foldersScroll));
      }
    } else {
      const board = body.querySelector(".fk-kanban-board");
      const oldColEl = body.querySelector(`.fk-column[data-col-id="${colId}"]`);
      if (board && oldColEl) {
        const prevScrollTop = oldColEl.querySelector(".fk-col-cards")?.scrollTop || 0;
        const newColEl = this.kanbanRenderer.createColumnElement(col, data, board);
        oldColEl.replaceWith(newColEl);
        const newCardsWrap = newColEl.querySelector(".fk-col-cards");
        if (newCardsWrap) {
          newCardsWrap.scrollTop = prevScrollTop;
          requestAnimationFrame(() => this.updateVerticalScrollFade(newCardsWrap));
        }
      }
    }

    this.selection.syncSelectionDOM();
  }

  appendNewColumnDOM(colId) {
    const body = this.getManagerBody();
    if (!body) return;

    const data = this.storage.getData();
    const col = data.columns.find((c) => c.id === colId);
    if (!col) return;

    if (data.viewMode === "list") {
      const twoColsWrap = body.querySelector(".fk-folders-two-cols");
      if (!twoColsWrap) return;
      const targetColIdx = col.folderCol === 0 || col.folderCol === 1 ? col.folderCol : 0;
      const targetColEl = twoColsWrap.querySelector(`.fk-folders-col[data-folder-col-idx="${targetColIdx}"]`);
      if (targetColEl) {
        const folderUnit = this.foldersRenderer._createFolderUnitElement(col, data, twoColsWrap);
        targetColEl.appendChild(folderUnit);
      }
      const foldersScroll = body.querySelector(".fk-folders-view-scroll");
      if (foldersScroll) {
        requestAnimationFrame(() => this.updateVerticalScrollFade(foldersScroll));
      }
    } else {
      const board = body.querySelector(".fk-kanban-board");
      if (!board) return;
      const colEl = this.kanbanRenderer.createColumnElement(col, data, board);
      const divider = document.createElement("div");
      divider.className = "fk-col-divider";
      const addRail = board.querySelector(".fk-add-col-rail");
      if (addRail) {
        board.insertBefore(colEl, addRail);
        board.insertBefore(divider, addRail);
      } else {
        board.appendChild(colEl);
        board.appendChild(divider);
      }
      requestAnimationFrame(() => this.updateHorizontalScrollFade(board));
    }

    this.selection.syncSelectionDOM();
    this.focusColumnRename(colId);
  }

  removeColumnFromDOM(colId) {
    const body = this.getManagerBody();
    if (!body) return;
    const colEl = body.querySelector(`[data-col-id="${colId}"]`);
    if (!colEl) return;

    if (colEl.classList.contains("fk-column")) {
      const nextEl = colEl.nextElementSibling;
      if (nextEl && nextEl.classList.contains("fk-col-divider")) {
        nextEl.remove();
      }
    }
    colEl.remove();
    requestAnimationFrame(() => this.refreshAllScrollFades());
  }

  updateColumnColorDOM(colId, colorHex) {
    const body = this.getManagerBody();
    if (!body) return;
    const colEl = body.querySelector(`[data-col-id="${colId}"]`);
    if (!colEl) return;

    const headerBox = colEl.querySelector(".fk-col-header-box, .fk-folder-header-box");
    if (headerBox) {
      headerBox.setAttribute("style", this.getFolderHeaderStyle(colorHex));
    }
    const folderIcon = colEl.querySelector(".fk-folder-icon");
    if (folderIcon) {
      folderIcon.style.color = colorHex || "";
    }
  }

  updateColumnFavoriteDOM(colId, isFav) {
    const body = this.getManagerBody();
    if (!body) return;
    const colEl = body.querySelector(`[data-col-id="${colId}"]`);
    if (!colEl) return;

    const existingStar = colEl.querySelector(`[data-col-star="${colId}"]`);
    if (!isFav) {
      existingStar?.remove();
      return;
    }

    if (existingStar) return;

    const star = document.createElement("i");
    star.className = "fas fa-star fk-fav-star";
    star.dataset.colStar = colId;
    star.title = t("SIN.Manager.FavFolderTitle");

    const countEl = colEl.querySelector(".fk-col-count, .fk-folder-count");
    if (countEl && countEl.parentElement) {
      countEl.parentElement.insertBefore(star, countEl);
    }
  }

  updateNoteColorDOM(noteId, colorHex) {
    const body = this.getManagerBody();
    if (!body) return;
    const card = body.querySelector(`.fk-postit[data-note-id="${noteId}"]`);
    if (!card) return;

    card.style.borderLeftColor = colorHex || "";
    const icon = card.querySelector(".fk-type-icon");
    if (icon) {
      icon.style.color = colorHex || "";
    }
  }

  updateNoteSharedDOM(noteId) {
    const body = this.getManagerBody();
    if (!body) return;
    const card = body.querySelector(`.fk-postit[data-note-id="${noteId}"]`);
    if (!card) return;

    const freshNote = this.storage.getData().notes.find((n) => n.id === noteId);
    const isShared = Boolean(freshNote && this.storage.isNoteShared?.(freshNote));
    const existingIcon = card.querySelector(`[data-note-shared="${noteId}"]`);

    if (!isShared) {
      existingIcon?.remove();
      return;
    }

    if (existingIcon) return;

    const topRow = card.querySelector(".fk-postit-top");
    if (!topRow) return;

    const icon = document.createElement("i");
    icon.className = "fas fa-share-alt fk-shared-icon";
    icon.dataset.noteShared = noteId;
    icon.title = t("SIN.Manager.SharedNoteTitle");

    const favStar = topRow.querySelector(".fk-fav-star");
    if (favStar) {
      topRow.insertBefore(icon, favStar);
    } else {
      topRow.appendChild(icon);
    }
  }

  focusColumnRename(colId) {
    const body = this.getManagerBody();
    if (!body) return;
    const colEl = body.querySelector(`[data-col-id="${colId}"]`);
    if (!colEl) return;
    colEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    const labelEl = colEl.querySelector(".fk-col-title-label, .fk-folder-name");
    if (labelEl) {
      this.startInlineColumnRename(labelEl, colId);
    }
  }

  focusSubsectionRename(subId) {
    const body = this.getManagerBody();
    if (!body) return;
    const subEl = body.querySelector(`[data-sub-id="${subId}"]`);
    if (!subEl) return;
    subEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    const labelEl = subEl.querySelector(".fk-sub-title");
    if (labelEl) {
      this.startInlineSubsectionRename(labelEl, subId);
    }
  }
}