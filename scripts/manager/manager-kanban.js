import { t } from "../shared/shared-i18n.js";

export class KanbanRenderer {
  constructor(managerView) {
    this.view = managerView;
    this.app = managerView.app;
    this.storage = managerView.storage;
  }

  render(body, data) {
    const board = document.createElement("div");
    board.className = `fk-kanban-board ${data.compactCards ? "compact" : ""}`;
    body.appendChild(board);

    this.view.bindHorizontalScrollFade(board);

    board.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".fk-column, button, input")) return;
      e.preventDefault();
      e.stopPropagation();
      this.view.showEmptySpaceMenu(e.clientX, e.clientY, null);
    });

    const orderedColumns = this.storage.getKanbanColumns(data);
    orderedColumns.forEach((col) => {
      const colEl = this.createColumnElement(col, data, board);
      board.appendChild(colEl);

      const divider = document.createElement("div");
      divider.className = "fk-col-divider";
      board.appendChild(divider);
    });

    const addRail = document.createElement("div");
    addRail.className = "fk-add-col-rail";
    addRail.innerHTML = `
      <button type="button" class="fk-add-col-btn" id="fk-add-column-btn" title="${t("SIN.Manager.NewFolderKanbanTitle")}">
        <i class="fas fa-plus"></i> ${t("SIN.Manager.NewFolderBtn")}
      </button>
    `;
    addRail.querySelector("#fk-add-column-btn").addEventListener("click", () => {
      const newCol = this.storage.createColumn();
      this.view.collapsedFolders.add(newCol.id);
      this.view.appendNewColumnDOM(newCol.id);
    });
    board.appendChild(addRail);
  }

  createColumnElement(col, data, board) {
    const colNotes = data.notes.filter((n) => n.columnId === col.id);
    const rootItems = this.storage.getColumnRootItems(col.id, data);
    const isSelected = this.view.selection.isSelected("folder", col.id);

    const colEl = document.createElement("div");
    colEl.className = `fk-column ${isSelected ? "is-selected" : ""}`;
    colEl.dataset.colId = col.id;
    colEl.innerHTML = `
      <div class="fk-col-header-box ${isSelected ? "is-selected" : ""}" style="${this.view.getFolderHeaderStyle(col.color)}">
        <div class="fk-col-top-row" title="${t("SIN.Manager.KanbanHeaderTitle")}">
          <span class="fk-folder-select-check" title="${t("SIN.Manager.SelectFolder")}">
            <i class="${isSelected ? "fas fa-check-circle" : "far fa-circle"}"></i>
          </span>
          <span class="fk-col-title-label">${this.storage.escapeHtml(col.title)}</span>
          ${
            col.favorite
              ? `<i class="fas fa-star fk-fav-star" data-col-star="${col.id}" title="${t("SIN.Manager.FavFolderTitle")}"></i>`
              : ""
          }
          <span class="fk-col-count">${colNotes.length}</span>
        </div>
        <button type="button" class="fk-col-add-note" title="${t("SIN.App.NewNoteTooltip")}">
          <i class="fas fa-plus"></i> ${t("SIN.App.NewNoteBtn")}
        </button>
      </div>
      <div class="fk-col-cards">
        <div class="fk-root-dropzone" data-sub-id=""></div>
      </div>
    `;

    const topRow = colEl.querySelector(".fk-col-top-row");
    const titleLabel = colEl.querySelector(".fk-col-title-label");

    colEl.querySelector(".fk-folder-select-check")?.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.view.selection.selectItem("folder", col.id, true);
    });

    this._bindColumnHeaderDrag(topRow, col.id, colEl, board);

    topRow.addEventListener("dblclick", (e) => {
      if (e.target.closest("input, .fk-folder-select-check")) return;
      e.stopPropagation();
      this.view.startInlineColumnRename(titleLabel, col.id);
    });

    topRow.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.view.showColumnContextMenu(e.clientX, e.clientY, col.id, titleLabel);
    });

    const addNoteBtn = colEl.querySelector(".fk-col-add-note");
    addNoteBtn.addEventListener("click", () => {
      this.view.collapsedFolders.delete(col.id);
      this.app.openNewNote(col.id, "text", null);
    });
    addNoteBtn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.view.showCreateTypeMenu(e.clientX, e.clientY, col.id, null);
    });

    colEl.addEventListener("contextmenu", (e) => {
      if (e.target.closest(".fk-postit, .fk-sub-header, .fk-col-top-row, button, input")) return;
      e.preventDefault();
      e.stopPropagation();
      const subEl = e.target.closest(".fk-subsection");
      this.view.showColumnQuickMenu(e.clientX, e.clientY, col.id, subEl?.dataset.subId || null);
    });

    const cardsWrap = colEl.querySelector(".fk-col-cards");
    const rootDropzone = colEl.querySelector(".fk-root-dropzone");

    rootItems.forEach((entry) => {
      if (entry.itemType === "note") {
        rootDropzone.appendChild(this.view.createCardElement(entry.data, col.id, null));
      } else {
        const sub = entry.data;
        const subNotes = this.storage.sortNotes(colNotes.filter((n) => n.subsectionId === sub.id));
        rootDropzone.appendChild(this.view.createSubsectionElement(sub, col.id, subNotes, false));
      }
    });

    this.view.bindVerticalScrollFade(cardsWrap);

    return colEl;
  }

  _bindColumnHeaderDrag(topRow, colId, colEl, board) {
    topRow.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.target.closest("button, input, .fk-folder-select-check")) return;

      const startX = e.clientX;
      const startY = e.clientY;
      let isDragging = false;
      let isBulkFolderDrag = false;
      let ghost = null;
      let targetColId = null;

      const updateDropPosition = (coords) => {
        if (!isDragging || !ghost) return;
        ghost.style.left = `${coords.clientX - 40}px`;
        ghost.style.top = `${coords.clientY - 14}px`;

        board.querySelectorAll(".fk-column").forEach((c) => c.classList.remove("drag-over"));
        const clamped = this.view.getClampedPointInManager(coords.clientX, coords.clientY);
        const under = document.elementFromPoint(clamped.x, clamped.y)?.closest(".fk-column");
        const underId = under?.dataset.colId || null;

        const isIgnored =
          !underId ||
          underId === colId ||
          (isBulkFolderDrag && this.view.selection.isSelected("folder", underId));

        if (!isIgnored) {
          under.classList.add("drag-over");
          targetColId = underId;
        } else {
          targetColId = null;
        }
      };

      const onMove = (ev) => {
        if (!isDragging) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 7) return;
          isDragging = true;
          colEl.style.opacity = "0.4";

          isBulkFolderDrag =
            this.view.selection.isSelected("folder", colId) &&
            this.view.selection.selectedIds.size > 1;

          if (isBulkFolderDrag) {
            ghost = this.view.selection.createAnimatedFolderStackGhost(topRow, ev.clientX, ev.clientY);
          } else {
            const rect = topRow.getBoundingClientRect();
            ghost = topRow.cloneNode(true);
            ghost.classList.add("fk-drag-ghost");
            ghost.style.width = `${rect.width}px`;
            ghost.style.padding = "7px 10px";
            ghost.style.borderRadius = "4px";
            ghost.style.border = "1px solid #7c68ee";
            document.body.appendChild(ghost);
          }
        }

        updateDropPosition(ev);
        this.view.updateDragAutoScroll(ev, updateDropPosition, false);
      };

      const onUp = (ev) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        this.view.stopDragAutoScroll();

        if (!isDragging) {
          if (this.view.selection.isActive("folder") || ev.ctrlKey || ev.shiftKey) {
            this.view.selection.selectItem("folder", colId, true);
          } else if (this.view.selection.isActive("note")) {
            this.view.selection.clearSelection();
          }
          return;
        }

        ghost?.remove();
        colEl.style.opacity = "";
        this.view.selection.clearStackDragSources();
        board.querySelectorAll(".fk-column").forEach((c) => c.classList.remove("drag-over"));

        const applyDOMOrder = (ordered) => {
          const addRail = board.querySelector(".fk-add-col-rail");
          ordered.forEach((c) => {
            const cNode = board.querySelector(`.fk-column[data-col-id="${c.id}"]`);
            const divNode = cNode?.nextElementSibling;
            if (cNode && addRail) {
              board.insertBefore(cNode, addRail);
              if (divNode && divNode.classList.contains("fk-col-divider")) {
                board.insertBefore(divNode, addRail);
              }
            }
          });
          requestAnimationFrame(() => this.view.updateHorizontalScrollFade(board));
        };

        if (isBulkFolderDrag) {
          if (targetColId) {
            const orderedIds = this.view.selection.getOrderedSelectedFolderIds();
            const ordered = this.storage.bulkReorderKanbanColumns(orderedIds, targetColId);
            if (ordered) {
              applyDOMOrder(ordered);
              this.view.selection.clearSelection();
              this.view.selection.showUndoToast(
                t("SIN.Manager.ToastFoldersReordered", { count: orderedIds.length })
              );
            }
          }
          return;
        }

        if (targetColId && targetColId !== colId) {
          const ordered = this.storage.reorderKanbanColumn(colId, targetColId);
          if (ordered) {
            applyDOMOrder(ordered);
          }
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }
}