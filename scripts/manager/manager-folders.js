import { t } from "../shared/shared-i18n.js";

export class FoldersRenderer {
  constructor(managerView) {
    this.view = managerView;
    this.app = managerView.app;
    this.storage = managerView.storage;
  }

  render(body, data) {
    const scrollWrap = document.createElement("div");
    scrollWrap.className = `fk-folders-view-scroll ${data.compactFoldersCards ? "compact" : ""}`;
    body.appendChild(scrollWrap);

    this.view.bindVerticalScrollFade(scrollWrap);

    const sharedNotes = this.storage.getSharedNotesForCurrentUser();
    if (sharedNotes.length) {
      const groupBy = data.sharedGroupBy || "person";
      const toggleLabel =
        groupBy === "person" ? t("SIN.Manager.GroupByPerson") : t("SIN.Manager.GroupByDate");
      const toggleIcon = groupBy === "person" ? "fa-user" : "fa-calendar-alt";

      const sharedBanner = document.createElement("div");
      sharedBanner.className = `fk-shared-folder-banner ${this.view.sharedFolderOpen ? "" : "collapsed"}`;
      sharedBanner.innerHTML = `
        <div class="fk-shared-banner-top" title="${t("SIN.Manager.ToggleSharedTitle")}">
          <div class="fk-shared-banner-title">
            <span class="fk-folder-caret">${this.view.sharedFolderOpen ? "▾" : "▸"}</span>
            <i class="fas fa-users"></i>
            <span>${t("SIN.Manager.SharedCount", { count: sharedNotes.length })}</span>
          </div>
          ${
            this.view.sharedFolderOpen
              ? `<button type="button" class="fk-shared-group-toggle" id="fk-folder-shared-group">
                  <i class="fas ${toggleIcon}"></i> ${toggleLabel}
                </button>`
              : `<span style="font-size:11px; color:#a1a1aa;">${t("SIN.Manager.ClickToExpand")}</span>`
          }
        </div>
        ${this.view.sharedFolderOpen ? `<div class="fk-shared-banner-grid" id="fk-shared-banner-cards"></div>` : ""}
      `;

      sharedBanner.querySelector(".fk-shared-banner-top").addEventListener("click", (e) => {
        if (e.target.closest("#fk-folder-shared-group")) return;
        this.view.sharedFolderOpen = !this.view.sharedFolderOpen;
        this.app.render({ force: true });
      });

      const groupBtn = sharedBanner.querySelector("#fk-folder-shared-group");
      if (groupBtn) {
        groupBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const fresh = this.storage.getData();
          fresh.sharedGroupBy = (fresh.sharedGroupBy || "person") === "person" ? "date" : "person";
          this.storage.saveNow(fresh);
          this.app.render({ force: true });
        });
      }

      if (this.view.sharedFolderOpen) {
        const cardsBox = sharedBanner.querySelector("#fk-shared-banner-cards");
        this.view.renderGroupedSharedCards(cardsBox, sharedNotes, groupBy, true);
      }

      scrollWrap.appendChild(sharedBanner);
    }

    const topBar = document.createElement("div");
    topBar.className = "fk-folders-top-bar";
    topBar.innerHTML = `
      <button type="button" class="fk-add-folder-top-btn" id="fk-add-folder-top-btn" title="${t("SIN.Manager.NewFolderTopTitle")}">
        <i class="fas fa-folder-plus"></i> <span>${t("SIN.Manager.NewFolderBtn")}</span>
      </button>
    `;
    topBar.querySelector("#fk-add-folder-top-btn").addEventListener("click", () => {
      const newCol = this.storage.createColumn();
      this.view.collapsedFolders.add(newCol.id);
      this.view.appendNewColumnDOM(newCol.id);
    });
    scrollWrap.appendChild(topBar);

    const twoColsWrap = document.createElement("div");
    twoColsWrap.className = "fk-folders-two-cols";

    const leftColEl = document.createElement("div");
    leftColEl.className = "fk-folders-col";
    leftColEl.dataset.folderColIdx = "0";

    const vDivider = document.createElement("div");
    vDivider.className = "fk-folders-v-divider";

    const rightColEl = document.createElement("div");
    rightColEl.className = "fk-folders-col";
    rightColEl.dataset.folderColIdx = "1";

    twoColsWrap.appendChild(leftColEl);
    twoColsWrap.appendChild(vDivider);
    twoColsWrap.appendChild(rightColEl);
    scrollWrap.appendChild(twoColsWrap);

    this.storage.getFolderColumnsBySide(0, data).forEach((col) => {
      leftColEl.appendChild(this._createFolderUnitElement(col, data, twoColsWrap));
    });

    this.storage.getFolderColumnsBySide(1, data).forEach((col) => {
      rightColEl.appendChild(this._createFolderUnitElement(col, data, twoColsWrap));
    });

    scrollWrap.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".fk-folder-unit, .fk-shared-folder-banner, button, input")) return;
      e.preventDefault();
      e.stopPropagation();

      const colContainer = e.target.closest(".fk-folders-col");
      let preferredCol = null;
      if (colContainer) {
        preferredCol = Number(colContainer.dataset.folderColIdx) || 0;
      } else {
        const wrapRect = twoColsWrap.getBoundingClientRect();
        preferredCol = e.clientX < wrapRect.left + wrapRect.width / 2 ? 0 : 1;
      }

      this.view.showEmptySpaceMenu(e.clientX, e.clientY, preferredCol);
    });
  }

  _createFolderUnitElement(col, data, twoColsWrap) {
    const colNotes = data.notes.filter((n) => n.columnId === col.id);
    const rootItems = this.storage.getColumnRootItems(col.id, data);
    const isCollapsed = this.view.collapsedFolders.has(col.id);
    const isSelected = this.view.selection.isSelected("folder", col.id);

    const folderUnit = document.createElement("div");
    folderUnit.className = `fk-folder-unit ${isSelected ? "is-selected" : ""}`;
    folderUnit.dataset.colId = col.id;
    folderUnit.innerHTML = `
      <div class="fk-folder-header-box ${isSelected ? "is-selected" : ""}" style="${this.view.getFolderHeaderStyle(col.color)}" title="${t("SIN.Manager.FolderHeaderTitle")}">
        <div class="fk-folder-header-left">
          <span class="fk-folder-select-check" title="${t("SIN.Manager.SelectFolder")}">
            <i class="${isSelected ? "fas fa-check-circle" : "far fa-circle"}"></i>
          </span>
          <span class="fk-folder-caret">${isCollapsed ? "▸" : "▾"}</span>
          <i class="fas ${isCollapsed ? "fa-folder" : "fa-folder-open"} fk-folder-icon" style="${col.color ? `color:${col.color};` : ""}"></i>
          <span class="fk-folder-name">${this.storage.escapeHtml(col.title)}</span>
        </div>
        <div class="fk-folder-header-right">
          ${
            col.favorite
              ? `<i class="fas fa-star fk-fav-star" data-col-star="${col.id}" title="${t("SIN.Manager.FavFolderTitle")}"></i>`
              : ""
          }
          <span class="fk-folder-count">${colNotes.length}</span>
          <button type="button" class="fk-folder-inline-add" title="${t("SIN.App.NewNoteTooltip")}">
            <i class="fas fa-plus"></i> ${t("SIN.App.NewNoteBtn")}
          </button>
        </div>
      </div>
      <div class="fk-folder-body-cards" style="${isCollapsed ? "display:none;" : ""}">
        <div class="fk-root-dropzone" data-sub-id=""></div>
      </div>
    `;

    const headerBox = folderUnit.querySelector(".fk-folder-header-box");
    const nameSpan = folderUnit.querySelector(".fk-folder-name");
    const addBtn = folderUnit.querySelector(".fk-folder-inline-add");
    const rootDrop = folderUnit.querySelector(".fk-root-dropzone");

    folderUnit.querySelector(".fk-folder-select-check")?.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.view.selection.selectItem("folder", col.id, true);
    });

    headerBox.addEventListener("dblclick", (e) => {
      if (e.target.closest("button, input, .fk-folder-select-check")) return;
      e.stopPropagation();
      this.view.startInlineColumnRename(nameSpan, col.id);
    });

    headerBox.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.view.showColumnContextMenu(e.clientX, e.clientY, col.id, nameSpan);
    });

    this._bindFolderUnitDrag(headerBox, col.id, folderUnit, twoColsWrap);

    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.view.collapsedFolders.delete(col.id);
      this.app.openNewNote(col.id, "text", null);
    });
    addBtn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.view.showCreateTypeMenu(e.clientX, e.clientY, col.id, null);
    });

    folderUnit.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".fk-postit, .fk-sub-header, .fk-folder-header-box, button, input")) return;
      e.preventDefault();
      e.stopPropagation();
      const subEl = e.target.closest(".fk-subsection");
      this.view.showColumnQuickMenu(e.clientX, e.clientY, col.id, subEl?.dataset.subId || null);
    });

    if (rootItems.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "fk-folder-empty-msg";
      emptyMsg.textContent = t("SIN.Manager.NoNotesHere");
      rootDrop.appendChild(emptyMsg);
    } else {
      rootItems.forEach((entry) => {
        if (entry.itemType === "note") {
          rootDrop.appendChild(this.view.createCardElement(entry.data, col.id, null));
        } else {
          const sub = entry.data;
          const subNotes = this.storage.sortNotes(colNotes.filter((n) => n.subsectionId === sub.id));
          rootDrop.appendChild(this.view.createSubsectionElement(sub, col.id, subNotes, true));
        }
      });
    }

    return folderUnit;
  }

  _bindFolderUnitDrag(headerBox, colId, folderUnit, twoColsWrap) {
    headerBox.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.target.closest("button, input, .fk-folder-select-check")) return;

      const clickedCaret = Boolean(e.target.closest(".fk-folder-caret"));
      const startX = e.clientX;
      const startY = e.clientY;
      let isDragging = false;
      let isBulkFolderDrag = false;
      let ghost = null;
      let indicator = null;
      let targetColContainer = null;
      let targetInsertIndex = 0;

      const updateDropPosition = (coords) => {
        if (!isDragging || !ghost) return;
        ghost.style.left = `${coords.clientX - 40}px`;
        ghost.style.top = `${coords.clientY - 14}px`;

        const clamped = this.view.getClampedPointInManager(coords.clientX, coords.clientY);
        const wrapRect = twoColsWrap.getBoundingClientRect();
        const midX = wrapRect.left + wrapRect.width / 2;
        const chosenIdx = clamped.x < midX ? "0" : "1";
        targetColContainer = twoColsWrap.querySelector(`.fk-folders-col[data-folder-col-idx="${chosenIdx}"]`);

        if (!targetColContainer) return;

        const units = Array.from(targetColContainer.querySelectorAll(":scope > .fk-folder-unit")).filter((el) => {
          if (el === folderUnit) return false;
          if (isBulkFolderDrag && this.view.selection.isSelected("folder", el.dataset.colId)) return false;
          return true;
        });

        let insertBeforeEl = null;
        targetInsertIndex = units.length;

        for (let i = 0; i < units.length; i++) {
          const r = units[i].getBoundingClientRect();
          if (clamped.y < r.top + r.height / 2) {
            insertBeforeEl = units[i];
            targetInsertIndex = i;
            break;
          }
        }

        if (insertBeforeEl) targetColContainer.insertBefore(indicator, insertBeforeEl);
        else targetColContainer.appendChild(indicator);
      };

      const onMove = (ev) => {
        if (!isDragging) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 7) return;
          isDragging = true;
          folderUnit.style.opacity = "0.35";

          isBulkFolderDrag =
            this.view.selection.isSelected("folder", colId) &&
            this.view.selection.selectedIds.size > 1;

          if (isBulkFolderDrag) {
            ghost = this.view.selection.createAnimatedFolderStackGhost(headerBox, ev.clientX, ev.clientY);
          } else {
            const rect = headerBox.getBoundingClientRect();
            ghost = headerBox.cloneNode(true);
            ghost.classList.add("fk-drag-ghost");
            ghost.style.width = `${rect.width}px`;
            document.body.appendChild(ghost);
          }

          indicator = document.createElement("div");
          indicator.className = "fk-drop-indicator";
        }

        updateDropPosition(ev);
        this.view.updateDragAutoScroll(ev, updateDropPosition, false);
      };

      const onUp = (ev) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        this.view.stopDragAutoScroll();

        if (!isDragging) {
          if (!clickedCaret && (this.view.selection.isActive("folder") || ev.ctrlKey || ev.shiftKey)) {
            this.view.selection.selectItem("folder", colId, true);
            return;
          }
          if (!clickedCaret && this.view.selection.isActive("note")) {
            this.view.selection.clearSelection();
          }

          const nowCollapsed = !this.view.collapsedFolders.has(colId);
          if (nowCollapsed) {
            this.view.collapsedFolders.add(colId);
          } else {
            this.view.collapsedFolders.delete(colId);
          }

          const caretEl = headerBox.querySelector(".fk-folder-caret");
          const iconEl = headerBox.querySelector(".fk-folder-icon");
          const bodyCardsEl = folderUnit.querySelector(".fk-folder-body-cards");
          if (caretEl) caretEl.textContent = nowCollapsed ? "▸" : "▾";
          if (iconEl) {
            iconEl.classList.toggle("fa-folder", nowCollapsed);
            iconEl.classList.toggle("fa-folder-open", !nowCollapsed);
          }
          if (bodyCardsEl) {
            bodyCardsEl.style.display = nowCollapsed ? "none" : "";
          }
          requestAnimationFrame(() => this.view.refreshAllScrollFades());
          return;
        }

        ghost?.remove();
        folderUnit.style.opacity = "";
        this.view.selection.clearStackDragSources();

        if (isBulkFolderDrag) {
          if (targetColContainer) {
            const orderedIds = this.view.selection.getOrderedSelectedFolderIds();
            const destColIdx = Number(targetColContainer.dataset.folderColIdx) || 0;
            const moved = this.storage.bulkReorderFolderColumns(orderedIds, destColIdx, targetInsertIndex);

            if (moved) {
              orderedIds.forEach((id) => {
                const unitEl = twoColsWrap.querySelector(`.fk-folder-unit[data-col-id="${id}"]`);
                if (!unitEl) return;
                if (indicator && indicator.parentElement === targetColContainer) {
                  targetColContainer.insertBefore(unitEl, indicator);
                } else {
                  targetColContainer.appendChild(unitEl);
                }
              });
              this.view.selection.clearSelection();
              this.view.selection.showUndoToast(
                t("SIN.Manager.ToastFoldersMoved", { count: orderedIds.length })
              );
              requestAnimationFrame(() => this.view.refreshAllScrollFades());
            }
          }
          indicator?.remove();
          return;
        }

        if (targetColContainer) {
          if (indicator && indicator.parentElement === targetColContainer) {
            targetColContainer.insertBefore(folderUnit, indicator);
          } else {
            targetColContainer.appendChild(folderUnit);
          }
        }
        indicator?.remove();

        if (targetColContainer) {
          const destColIdx = Number(targetColContainer.dataset.folderColIdx) || 0;
          this.storage.reorderFolderColumn(colId, destColIdx, targetInsertIndex);
          requestAnimationFrame(() => this.view.refreshAllScrollFades());
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }
}