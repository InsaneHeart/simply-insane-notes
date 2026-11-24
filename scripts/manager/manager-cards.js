import { t } from "../shared/shared-i18n.js";

export class ManagerCards {
  constructor(managerView) {
    this.view = managerView;
    this.app = managerView.app;
    this.storage = managerView.storage;
  }

  get selection() {
    return this.view.selection;
  }

  /* ================= RENOMEAR INLINE ================= */

  startInlineColumnRename(labelEl, colId) {
    if (!labelEl) return;
    const oldText = labelEl.textContent.trim();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "fk-inline-rename-input";
    input.value = oldText;

    input.addEventListener("mousedown", (e) => e.stopPropagation());
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("dblclick", (e) => e.stopPropagation());

    labelEl.replaceWith(input);
    input.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    input.focus();
    input.select();

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const rawVal = input.value.trim();
      const fresh = this.storage.getData();
      const col = fresh.columns.find((c) => c.id === colId);
      if (col && rawVal) {
        col.title = this.storage.getUniqueColumnTitle(rawVal, colId);
        this.storage.saveNow(fresh);
        labelEl.textContent = col.title;
      } else {
        labelEl.textContent = col?.title || oldText;
      }
      input.replaceWith(labelEl);
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      } else if (e.key === "Escape") {
        input.value = oldText;
        input.blur();
      }
    });
  }

  startInlineSubsectionRename(labelEl, subId) {
    if (!labelEl) return;
    const oldText = labelEl.textContent.trim();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "fk-inline-rename-input";
    input.value = oldText;

    input.addEventListener("mousedown", (e) => e.stopPropagation());
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("dblclick", (e) => e.stopPropagation());

    labelEl.replaceWith(input);
    input.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    input.focus();
    input.select();

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const val = input.value.trim();
      const fresh = this.storage.getData();
      const sub = fresh.subsections.find((s) => s.id === subId);
      if (sub && val) {
        sub.title = this.storage.getUniqueSubsectionTitle(sub.columnId, val, subId, fresh);
        this.storage.saveNow(fresh);
        labelEl.textContent = sub.title;
      } else {
        labelEl.textContent = sub?.title || oldText;
      }
      input.replaceWith(labelEl);
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      } else if (e.key === "Escape") {
        input.value = oldText;
        input.blur();
      }
    });
  }

  startInlineNoteRename(titleEl, noteId) {
    if (!titleEl) return;
    const oldText = titleEl.textContent.trim();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "fk-inline-rename-input";
    input.value = oldText;

    input.addEventListener("mousedown", (e) => e.stopPropagation());
    input.addEventListener("click", (e) => e.stopPropagation());

    titleEl.replaceWith(input);
    input.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    input.focus();
    input.select();

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const rawVal = input.value.trim();
      const fresh = this.storage.getData();
      const note = fresh.notes.find((n) => n.id === noteId);
      if (note && rawVal) {
        const uniqueTitle = this.storage.getUniqueNoteTitle(rawVal, noteId);
        note.title = uniqueTitle;
        if (note.type === "mindmap" && note.mindmap?.nodes?.[0]) {
          note.mindmap.nodes[0].title = uniqueTitle;
        }
        note.updatedAt = Date.now();
        this.storage.saveNow(fresh);
        titleEl.textContent = uniqueTitle;
      } else {
        titleEl.textContent = note?.title || oldText;
      }
      input.replaceWith(titleEl);
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      } else if (e.key === "Escape") {
        input.value = oldText;
        input.blur();
      }
    });
  }

  /* ================= SUBSEÇÃO & DRAG-AND-DROP ================= */

  createSubsectionElement(sub, colId, subNotes, isFolderView = false) {
    const subEl = document.createElement("div");
    subEl.className = `fk-subsection ${subNotes.length === 0 ? "is-empty" : ""}`;
    subEl.dataset.subId = sub.id;

    const cardsClass = isFolderView ? "fk-folder-sub-cards" : "fk-sub-cards";
    subEl.innerHTML = `
      <div class="fk-sub-header" title="${t("SIN.Manager.SubHeaderTitle")}">
        <span class="fk-sub-caret">${sub.collapsed ? "▸" : "▾"}</span>
        <span class="fk-sub-title">${this.storage.escapeHtml(sub.title)}</span>
        <span class="fk-sub-count">${subNotes.length}</span>
        <button type="button" class="fk-sub-add-btn" title="${t("SIN.Manager.NewNoteInSubTitle")}"><i class="fas fa-plus"></i></button>
      </div>
      <div class="${cardsClass}" data-sub-id="${sub.id}" style="${sub.collapsed ? "display:none;" : ""}"></div>
    `;

    const subHeader = subEl.querySelector(".fk-sub-header");
    const subTitleEl = subEl.querySelector(".fk-sub-title");
    const subCardsEl = subEl.querySelector(`.${cardsClass}`);

    subHeader.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.view.showSubsectionContextMenu(e.clientX, e.clientY, sub.id, subTitleEl);
    });

    const subAddBtn = subEl.querySelector(".fk-sub-add-btn");
    subAddBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const parentColId = subEl.closest("[data-col-id]")?.dataset.colId || colId;
      this.view.collapsedFolders.delete(parentColId);
      this.app.openNewNote(parentColId, "text", sub.id);
    });
    subAddBtn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const parentColId = subEl.closest("[data-col-id]")?.dataset.colId || colId;
      this.view.showCreateTypeMenu(e.clientX, e.clientY, parentColId, sub.id);
    });

    if (subNotes.length === 0 && isFolderView) {
      const subEmptyMsg = document.createElement("div");
      subEmptyMsg.className = "fk-folder-empty-msg";
      subEmptyMsg.textContent = t("SIN.Manager.NoNotesHere");
      subCardsEl.appendChild(subEmptyMsg);
    } else {
      subNotes.forEach((note) => {
        subCardsEl.appendChild(this.createCardElement(note, colId, sub.id));
      });
    }

    this._bindSubsectionDrag(subHeader, subEl, sub.id, subCardsEl);

    return subEl;
  }

  _bindSubsectionDrag(subHeader, subEl, subId, subCardsEl) {
    subHeader.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.target.closest(".fk-sub-add-btn, button, input")) return;
      e.stopPropagation();

      const originColId = subEl.closest("[data-col-id]")?.dataset.colId;
      const startX = e.clientX;
      const startY = e.clientY;
      let isDragging = false;
      let ghost = null;
      let indicator = null;
      let targetColId = originColId;
      let targetIndex = 0;
      let createNewColOnDrop = false;
      const tempExpandedFolderBodies = new Set();

      const restoreTempExpanded = () => {
        tempExpandedFolderBodies.forEach((el) => {
          el.style.display = "none";
        });
        tempExpandedFolderBodies.clear();
      };

      const updateDropPosition = (coords) => {
        if (!isDragging || !ghost) return;
        ghost.style.left = `${coords.clientX + 10}px`;
        ghost.style.top = `${coords.clientY + 10}px`;

        document.querySelectorAll(".fk-column, .fk-folder-unit").forEach((c) => c.classList.remove("drag-over"));
        restoreTempExpanded();

        const addColBtn = document.getElementById("fk-add-column-btn");
        const addFolderTopBtn = document.getElementById("fk-add-folder-top-btn");
        addColBtn?.classList.remove("drag-over");
        addFolderTopBtn?.classList.remove("drag-over");

        const rawElemUnder = document.elementFromPoint(coords.clientX, coords.clientY);
        if (
          (addColBtn && rawElemUnder?.closest("#fk-add-column-btn")) ||
          (addFolderTopBtn && rawElemUnder?.closest("#fk-add-folder-top-btn"))
        ) {
          addColBtn?.classList.add("drag-over");
          addFolderTopBtn?.classList.add("drag-over");
          createNewColOnDrop = true;
          indicator?.remove();
          return;
        }
        createNewColOnDrop = false;

        const clamped = this.view.getClampedPointInManager(coords.clientX, coords.clientY);
        const elemUnder = rawElemUnder?.closest(".fk-column, .fk-folder-unit")
          ? rawElemUnder
          : document.elementFromPoint(clamped.x, clamped.y);

        const containerUnder = elemUnder?.closest(".fk-column, .fk-folder-unit");
        if (!containerUnder) return;

        containerUnder.classList.add("drag-over");
        targetColId = containerUnder.dataset.colId;

        const folderBodyCards = containerUnder.querySelector(".fk-folder-body-cards");
        if (folderBodyCards && folderBodyCards.style.display === "none") {
          folderBodyCards.style.display = "flex";
          tempExpandedFolderBodies.add(folderBodyCards);
        }

        const dropContainer = containerUnder.querySelector(".fk-root-dropzone");
        if (!dropContainer) return;

        const siblings = Array.from(dropContainer.children).filter(
          (el) => (el.classList.contains("fk-postit") || el.classList.contains("fk-subsection")) && el !== subEl
        );

        const favCount = siblings.filter(
          (el) => el.classList.contains("fk-postit") && Boolean(el.querySelector(".fk-fav-star"))
        ).length;

        let insertBeforeEl = null;
        targetIndex = siblings.length;

        for (let i = favCount; i < siblings.length; i++) {
          const r = siblings[i].getBoundingClientRect();
          if (clamped.y < r.top + r.height / 2) {
            insertBeforeEl = siblings[i];
            targetIndex = i;
            break;
          }
        }

        if (targetIndex < favCount) {
          targetIndex = favCount;
          insertBeforeEl = siblings[favCount] || null;
        }

        if (insertBeforeEl) dropContainer.insertBefore(indicator, insertBeforeEl);
        else dropContainer.appendChild(indicator);
      };

      const onMove = (ev) => {
        if (!isDragging) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
          isDragging = true;
          subEl.style.opacity = "0.35";

          const rect = subHeader.getBoundingClientRect();
          ghost = subHeader.cloneNode(true);
          ghost.classList.add("fk-drag-ghost");
          ghost.style.width = `${rect.width}px`;
          ghost.style.padding = "5px 8px";
          ghost.style.borderRadius = "5px";
          ghost.style.border = "1px dashed #9b87f5";
          document.body.appendChild(ghost);

          indicator = document.createElement("div");
          indicator.className = "fk-drop-indicator";
        }

        updateDropPosition(ev);
        this.view.updateDragAutoScroll(ev, updateDropPosition, true);
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        this.view.stopDragAutoScroll();

        if (!isDragging) {
          const fresh = this.storage.getData();
          const s = fresh.subsections.find((x) => x.id === subId);
          if (s) {
            s.collapsed = !s.collapsed;
            this.storage.saveNow(fresh);
            const caretEl = subHeader.querySelector(".fk-sub-caret");
            if (caretEl) caretEl.textContent = s.collapsed ? "▸" : "▾";
            subCardsEl.style.display = s.collapsed ? "none" : "flex";
            requestAnimationFrame(() => this.view.refreshAllScrollFades());
          }
          return;
        }

        ghost?.remove();
        subEl.style.opacity = "";
        restoreTempExpanded();
        document.querySelectorAll(".fk-column, .fk-folder-unit").forEach((c) => c.classList.remove("drag-over"));
        document.getElementById("fk-add-column-btn")?.classList.remove("drag-over");
        document.getElementById("fk-add-folder-top-btn")?.classList.remove("drag-over");

        if (createNewColOnDrop) {
          indicator?.remove();
          const newCol = this.storage.createColumn();
          this.view.collapsedFolders.delete(newCol.id);
          this.storage.moveSubsectionToPosition(subId, originColId, newCol.id, 0);
          const updatedSub = this.storage.getData().subsections.find((s) => s.id === subId);
          if (updatedSub) {
            const titleEl = subEl.querySelector(".fk-sub-title");
            if (titleEl) titleEl.textContent = updatedSub.title;
          }
          subEl.remove();
          this.view.syncColumnStateDOM(originColId);
          this.view.appendNewColumnDOM(newCol.id);
          return;
        }

        this.view.collapsedFolders.delete(targetColId);
        this.storage.moveSubsectionToPosition(subId, originColId, targetColId, targetIndex);

        const updatedSub = this.storage.getData().subsections.find((s) => s.id === subId);
        if (updatedSub) {
          const titleEl = subEl.querySelector(".fk-sub-title");
          if (titleEl) titleEl.textContent = updatedSub.title;
        }

        if (indicator && indicator.parentElement) {
          indicator.parentElement.insertBefore(subEl, indicator);
        }
        indicator?.remove();

        this.view.syncColumnStateDOM(targetColId);
        if (originColId && originColId !== targetColId) {
          this.view.syncColumnStateDOM(originColId);
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }

  /* ================= CARD DE NOTA & DRAG-AND-DROP (INDIVIDUAL E PILHA EM GRUPO) ================= */

  createCardElement(note, currentColId, currentSubId) {
    const isSelected = this.selection.isSelected("note", note.id);
    const isShared = Boolean(this.storage.isNoteShared?.(note));
    const card = document.createElement("div");
    card.className = `fk-postit ${note.type === "mindmap" ? "mindmap" : ""} ${isSelected ? "is-selected" : ""}`;
    card.dataset.noteId = note.id;

    if (note.color) {
      card.style.borderLeftColor = note.color;
    }

    const iconClass = note.type === "mindmap" ? "fa-project-diagram" : "fa-align-left";
    const displayTitle =
      (note.type === "mindmap"
        ? note.mindmap?.nodes?.[0]?.title || note.title
        : note.title) || t("SIN.Common.UntitledNote");
    const preview = this.storage.extractNotePreview(note);

    card.innerHTML = `
      <div class="fk-postit-top">
        <span class="fk-select-check" title="${t("SIN.Manager.SelectNote")}">
          <i class="${isSelected ? "fas fa-check-circle" : "far fa-circle"}"></i>
        </span>
        <i class="fas ${iconClass} fk-type-icon" style="${note.color ? `color:${note.color};` : ""}"></i>
        <div class="fk-postit-title">${this.storage.escapeHtml(displayTitle)}</div>
        ${isShared ? `<i class="fas fa-share-alt fk-shared-icon" data-note-shared="${note.id}" title="${t("SIN.Manager.SharedNoteTitle")}"></i>` : ""}
        ${note.favorite ? `<i class="fas fa-star fk-fav-star" data-note-star="${note.id}" title="${t("SIN.Manager.FavNoteTitle")}"></i>` : ""}
      </div>
      ${preview ? `<div class="fk-postit-preview">${this.storage.escapeHtml(preview)}</div>` : ""}
    `;

    card.querySelector(".fk-select-check")?.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.selection.selectItem("note", note.id, true);
    });

    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const titleEl = card.querySelector(".fk-postit-title");
      const freshNote = this.storage.getData().notes.find((n) => n.id === note.id) || note;
      this.view.showNoteContextMenu(e.clientX, e.clientY, freshNote, titleEl);
    });

    card.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.target.closest("input, .fk-select-check")) return;

      const originColId = card.closest("[data-col-id]")?.dataset.colId || currentColId;
      const originSubId = card.closest(".fk-subsection")?.dataset.subId || null;
      const startX = e.clientX;
      const startY = e.clientY;
      let isDragging = false;
      let isBulkStackDrag = false;
      let ghost = null;
      let indicator = null;
      let targetColId = originColId;
      let targetSubId = originSubId;
      let targetIndex = 0;
      let createNewColOnDrop = false;
      const tempExpandedFolderBodies = new Set();
      const tempExpandedSubLists = new Set();

      const restoreTempExpanded = () => {
        tempExpandedFolderBodies.forEach((el) => {
          el.style.display = "none";
        });
        tempExpandedFolderBodies.clear();
        tempExpandedSubLists.forEach((el) => {
          el.style.display = "none";
        });
        tempExpandedSubLists.clear();
      };

      const updateDropPosition = (coords) => {
        if (!isDragging || !ghost) return;
        ghost.style.left = `${coords.clientX + 10}px`;
        ghost.style.top = `${coords.clientY + 10}px`;

        document.querySelectorAll(".fk-column, .fk-folder-unit").forEach((c) => c.classList.remove("drag-over"));
        document.querySelectorAll(".fk-subsection").forEach((s) => s.classList.remove("drag-hover"));
        restoreTempExpanded();

        const addColBtn = document.getElementById("fk-add-column-btn");
        const addFolderTopBtn = document.getElementById("fk-add-folder-top-btn");
        addColBtn?.classList.remove("drag-over");
        addFolderTopBtn?.classList.remove("drag-over");

        const rawElemUnder = document.elementFromPoint(coords.clientX, coords.clientY);

        if (
          (addColBtn && rawElemUnder?.closest("#fk-add-column-btn")) ||
          (addFolderTopBtn && rawElemUnder?.closest("#fk-add-folder-top-btn"))
        ) {
          addColBtn?.classList.add("drag-over");
          addFolderTopBtn?.classList.add("drag-over");
          createNewColOnDrop = true;
          indicator?.remove();
          return;
        }
        createNewColOnDrop = false;

        const clamped = this.view.getClampedPointInManager(coords.clientX, coords.clientY);
        const elemUnder = rawElemUnder?.closest(".fk-column, .fk-folder-unit")
          ? rawElemUnder
          : document.elementFromPoint(clamped.x, clamped.y);

        const containerUnder = elemUnder?.closest(".fk-column, .fk-folder-unit");
        if (!containerUnder) return;

        containerUnder.classList.add("drag-over");
        targetColId = containerUnder.dataset.colId;

        const folderBodyCards = containerUnder.querySelector(".fk-folder-body-cards");
        if (folderBodyCards && folderBodyCards.style.display === "none") {
          folderBodyCards.style.display = "flex";
          tempExpandedFolderBodies.add(folderBodyCards);
        }

        const subUnder = elemUnder?.closest(".fk-subsection");
        let dropContainer = containerUnder.querySelector(".fk-root-dropzone");
        targetSubId = null;

        if (subUnder) {
          const subRect = subUnder.getBoundingClientRect();
          const innerList = subUnder.querySelector(".fk-sub-cards, .fk-folder-sub-cards");
          const isCollapsedSub = innerList && innerList.style.display === "none";

          const nearTopEdge = clamped.y < subRect.top + 6;
          const nearBottomEdge = isCollapsedSub && clamped.y > subRect.bottom - 6;

          if (!nearTopEdge && !nearBottomEdge) {
            subUnder.classList.add("drag-hover");
            targetSubId = subUnder.dataset.subId;
            if (innerList) {
              if (innerList.style.display === "none") {
                innerList.style.display = "flex";
                tempExpandedSubLists.add(innerList);
              }
              dropContainer = innerList;
            }
          }
        }

        if (!dropContainer) return;

        const isFavNote = Boolean(card.querySelector(".fk-fav-star"));
        const isExcludedSibling = (el) => {
          if (el === card) return true;
          if (isBulkStackDrag && el.classList.contains("fk-postit") && this.selection.isSelected("note", el.dataset.noteId)) {
            return true;
          }
          return false;
        };

        if (targetSubId) {
          const siblings = Array.from(dropContainer.children).filter(
            (el) => el.classList.contains("fk-postit") && !isExcludedSibling(el)
          );

          const favCount = siblings.filter((el) => Boolean(el.querySelector(".fk-fav-star"))).length;
          const minIdx = isBulkStackDrag ? 0 : isFavNote ? 0 : favCount;
          const maxIdx = isBulkStackDrag ? siblings.length : isFavNote ? favCount : siblings.length;

          let insertBeforeEl = siblings[maxIdx] || null;
          targetIndex = maxIdx;

          for (let i = minIdx; i < maxIdx; i++) {
            const r = siblings[i].getBoundingClientRect();
            if (clamped.y < r.top + r.height / 2) {
              insertBeforeEl = siblings[i];
              targetIndex = i;
              break;
            }
          }

          if (insertBeforeEl) dropContainer.insertBefore(indicator, insertBeforeEl);
          else dropContainer.appendChild(indicator);
        } else {
          const siblings = Array.from(dropContainer.children).filter(
            (el) => (el.classList.contains("fk-postit") || el.classList.contains("fk-subsection")) && !isExcludedSibling(el)
          );

          const favCount = siblings.filter(
            (el) => el.classList.contains("fk-postit") && Boolean(el.querySelector(".fk-fav-star"))
          ).length;

          const minIdx = isBulkStackDrag ? 0 : isFavNote ? 0 : favCount;
          const maxIdx = isBulkStackDrag ? siblings.length : isFavNote ? favCount : siblings.length;

          let insertBeforeEl = siblings[maxIdx] || null;
          targetIndex = maxIdx;

          for (let i = minIdx; i < maxIdx; i++) {
            const r = siblings[i].getBoundingClientRect();
            if (clamped.y < r.top + r.height / 2) {
              insertBeforeEl = siblings[i];
              targetIndex = i;
              break;
            }
          }

          if (insertBeforeEl) dropContainer.insertBefore(indicator, insertBeforeEl);
          else dropContainer.appendChild(indicator);
        }
      };

      const onMove = (ev) => {
        if (!isDragging) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
          isDragging = true;
          card.style.opacity = "0.35";

          isBulkStackDrag =
            this.selection.isSelected("note", note.id) && this.selection.selectedIds.size > 1;

          if (isBulkStackDrag) {
            ghost = this.selection.createAnimatedStackGhost(card, ev.clientX, ev.clientY);
          } else {
            const rect = card.getBoundingClientRect();
            ghost = card.cloneNode(true);
            ghost.classList.add("fk-drag-ghost");
            ghost.style.width = `${rect.width}px`;
            document.body.appendChild(ghost);
          }

          indicator = document.createElement("div");
          indicator.className = "fk-drop-indicator";
        }

        updateDropPosition(ev);
        this.view.updateDragAutoScroll(ev, updateDropPosition, true);
      };

      const onUp = (ev) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        this.view.stopDragAutoScroll();

        if (!isDragging) {
          if (this.selection.isActive("note") || ev.ctrlKey || ev.shiftKey) {
            this.selection.selectItem("note", note.id, true);
            return;
          }
          if (this.selection.isActive("folder")) {
            this.selection.clearSelection();
          }
          this.app.openNote(note.id, game.user.id);
          return;
        }

        ghost?.remove();
        card.style.opacity = "";
        this.selection.clearStackDragSources();
        restoreTempExpanded();
        document.querySelectorAll(".fk-column, .fk-folder-unit").forEach((c) => c.classList.remove("drag-over"));
        document.querySelectorAll(".fk-subsection").forEach((s) => s.classList.remove("drag-hover"));
        document.getElementById("fk-add-column-btn")?.classList.remove("drag-over");
        document.getElementById("fk-add-folder-top-btn")?.classList.remove("drag-over");

        if (isBulkStackDrag) {
          indicator?.remove();
          const orderedIds = this.selection.getOrderedSelectedNoteIds();
          if (createNewColOnDrop) {
            const newCol = this.storage.createColumn();
            this.view.collapsedFolders.delete(newCol.id);
            const affected = this.storage.bulkMoveNotesToPosition(orderedIds, newCol.id, null, 0);
            this.selection.clearSelection();
            affected.forEach((colId) => {
              if (colId !== newCol.id) this.view.refreshColumnDOM(colId);
            });
            this.view.appendNewColumnDOM(newCol.id);
            this.selection.showUndoToast(t("SIN.Manager.ToastNotesMovedNewFolder", { count: orderedIds.length }));
            return;
          }

          this.view.collapsedFolders.delete(targetColId);
          const affectedCols = this.storage.bulkMoveNotesToPosition(
            orderedIds,
            targetColId,
            targetSubId,
            targetIndex
          );
          this.selection.clearSelection();
          affectedCols.forEach((colId) => this.view.refreshColumnDOM(colId));
          this.selection.showUndoToast(t("SIN.Manager.ToastNotesMoved", { count: orderedIds.length }));
          return;
        }

        if (createNewColOnDrop) {
          indicator?.remove();
          const newCol = this.storage.createColumn();
          this.view.collapsedFolders.delete(newCol.id);
          this.storage.moveNoteToPosition(note.id, originColId, originSubId, newCol.id, null, 0);
          card.remove();
          this.view.syncColumnStateDOM(originColId);
          this.view.appendNewColumnDOM(newCol.id);
          return;
        }

        this.view.collapsedFolders.delete(targetColId);
        this.storage.moveNoteToPosition(
          note.id,
          originColId,
          originSubId,
          targetColId,
          targetSubId,
          targetIndex
        );

        if (indicator && indicator.parentElement) {
          indicator.parentElement.insertBefore(card, indicator);
        }
        indicator?.remove();

        this.view.syncColumnStateDOM(targetColId);
        if (originColId && originColId !== targetColId) {
          this.view.syncColumnStateDOM(originColId);
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });

    return card;
  }
}