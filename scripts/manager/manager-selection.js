import { t } from "../shared/shared-i18n.js";

export class ManagerSelection {
  constructor(managerView) {
    this.view = managerView;
    this.app = managerView.app;
    this.storage = managerView.storage;

    this.selectionType = null; // "note" | "folder" | null
    this.selectedIds = new Set();
    this._undoTimer = null;
    this._keyBound = false;
    this._deletingInProgress = false;
  }

  isActive(type = null) {
    if (!this.selectionType || this.selectedIds.size === 0) return false;
    return type ? this.selectionType === type : true;
  }

  isSelected(type, id) {
    return this.selectionType === type && this.selectedIds.has(id);
  }

  selectItem(type, id, additive = true) {
    if (!id) return;
    if (this.selectionType !== type || !additive) {
      this.selectionType = type;
      this.selectedIds.clear();
    }

    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
      if (this.selectedIds.size === 0) {
        this.selectionType = null;
      }
    } else {
      this.selectedIds.add(id);
    }

    this.syncSelectionDOM();
  }

  setSelection(type, ids = []) {
    this.selectionType = ids.length ? type : null;
    this.selectedIds = new Set(ids);
    this.syncSelectionDOM();
  }

  clearSelection() {
    if (!this.selectionType && this.selectedIds.size === 0) return;
    this.selectionType = null;
    this.selectedIds.clear();
    this.syncSelectionDOM();
  }

  getSelectedIds() {
    return Array.from(this.selectedIds);
  }

  getOrderedSelectedNoteIds() {
    if (this.selectionType !== "note") return [];
    const body = this.view.getManagerBody();
    if (!body) return this.getSelectedIds();

    const domOrder = [];
    body.querySelectorAll(".fk-postit[data-note-id]").forEach((card) => {
      const id = card.dataset.noteId;
      if (this.selectedIds.has(id)) {
        domOrder.push(id);
      }
    });
    return domOrder.length ? domOrder : this.getSelectedIds();
  }

  getOrderedSelectedFolderIds() {
    if (this.selectionType !== "folder") return [];
    const body = this.view.getManagerBody();
    if (!body) return this.getSelectedIds();

    const domOrder = [];
    body.querySelectorAll("[data-col-id]").forEach((colEl) => {
      const id = colEl.dataset.colId;
      if (this.selectedIds.has(id)) {
        domOrder.push(id);
      }
    });
    return domOrder.length ? domOrder : this.getSelectedIds();
  }

  async deleteSelectedItems() {
    if (!this.isActive() || this._deletingInProgress) return;
    this._deletingInProgress = true;
    this.app.closeMenu();

    try {
      if (this.selectionType === "note") {
        const noteIds = this.getOrderedSelectedNoteIds();
        if (!noteIds.length) return;
        const affectedColIds = await this.storage.bulkDeleteNotesWithConfirm(noteIds);
        if (affectedColIds) {
          const count = noteIds.length;
          this.clearSelection();
          affectedColIds.forEach((colId) => this.view.refreshColumnDOM(colId));
          this.showUndoToast(t("SIN.Manager.ToastNotesDeleted", { count }));
        }
      } else if (this.selectionType === "folder") {
        const colIds = this.getSelectedIds();
        if (!colIds.length) return;
        const data = this.storage.getData();
        const deleted = await this.storage.bulkDeleteColumnsWithConfirm(colIds, data.viewMode);
        if (deleted) {
          const count = colIds.length;
          colIds.forEach((id) => this.view.collapsedFolders.delete(id));
          this.clearSelection();
          this.app.render({ force: true });
          this.showUndoToast(t("SIN.Manager.ToastFoldersDeleted", { count }));
        }
      }
    } finally {
      this._deletingInProgress = false;
    }
  }

  syncSelectionDOM() {
    const wrapper = this.app.element?.querySelector(".fk-manager-wrapper");
    if (!wrapper) return;

    const isNoteMode = this.selectionType === "note" && this.selectedIds.size > 0;
    const isFolderMode = this.selectionType === "folder" && this.selectedIds.size > 0;

    wrapper.classList.toggle("fk-select-mode-notes", isNoteMode);
    wrapper.classList.toggle("fk-select-mode-folders", isFolderMode);

    wrapper.querySelectorAll(".fk-postit[data-note-id]").forEach((card) => {
      const id = card.dataset.noteId;
      const selected = isNoteMode && this.selectedIds.has(id);
      card.classList.toggle("is-selected", selected);
      const checkIcon = card.querySelector(".fk-select-check i");
      if (checkIcon) {
        checkIcon.className = selected ? "fas fa-check-circle" : "far fa-circle";
      }
    });

    wrapper.querySelectorAll("[data-col-id]").forEach((colEl) => {
      const id = colEl.dataset.colId;
      const selected = isFolderMode && this.selectedIds.has(id);
      colEl.classList.toggle("is-selected", selected);
      const headerBox = colEl.querySelector(".fk-col-header-box, .fk-folder-header-box");
      headerBox?.classList.toggle("is-selected", selected);
      const checkIcon = colEl.querySelector(".fk-folder-select-check i");
      if (checkIcon) {
        checkIcon.className = selected ? "fas fa-check-circle" : "far fa-circle";
      }
    });
  }

  /* ================= SELEÇÃO POR ARRASTE DINÂMICA E ATALHOS (ESC / DELETE) ================= */

  bindMarqueeSelection(wrapper) {
    if (!wrapper) return;

    if (!this._keyBound) {
      this._keyBound = true;
      document.addEventListener(
        "keydown",
        (e) => {
          if (!this.isActive() || !this.app.rendered || this.app.mode !== "manager") return;
          if (e.target.closest("input, textarea, select, [contenteditable='true']")) return;
          if (document.querySelector(".application.dialog, dialog[open]")) return;

          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            this.clearSelection();
          } else if (e.key === "Delete") {
            e.preventDefault();
            e.stopPropagation();
            this.deleteSelectedItems();
          }
        },
        true
      );
    }

    wrapper.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;

      if (
        e.target.closest(
          ".fk-postit, .fk-col-header-box, .fk-folder-header-box, .fk-sub-header, .fk-shared-rail, .fk-shared-drawer-header, .fk-shared-banner-top, .fk-undo-toast, button, input"
        )
      ) {
        return;
      }

      const startX = e.clientX;
      const startY = e.clientY;
      let isMarquee = false;
      let marqueeEl = null;

      const initialShift = e.shiftKey;
      const initialCtrl = e.ctrlKey;
      const additive = initialShift || initialCtrl;
      const initialType = this.selectionType;
      const initialIds = new Set(this.selectedIds);

      let lockedType = null;
      let lockedMode = null;

      const distToRect = (px, py, r) => {
        const dx = Math.max(r.left - px, 0, px - r.right);
        const dy = Math.max(r.top - py, 0, py - r.bottom);
        return Math.hypot(dx, dy);
      };

      const updateMarquee = (coords) => {
        if (!isMarquee || !marqueeEl) return;

        const wRect = wrapper.getBoundingClientRect();
        const curX = Math.max(wRect.left, Math.min(wRect.right, coords.clientX));
        const curY = Math.max(wRect.top, Math.min(wRect.bottom, coords.clientY));
        const originX = Math.max(wRect.left, Math.min(wRect.right, startX));
        const originY = Math.max(wRect.top, Math.min(wRect.bottom, startY));

        const left = Math.min(originX, curX);
        const top = Math.min(originY, curY);
        const width = Math.abs(curX - originX);
        const height = Math.abs(curY - originY);

        marqueeEl.style.left = `${left - wRect.left}px`;
        marqueeEl.style.top = `${top - wRect.top}px`;
        marqueeEl.style.width = `${width}px`;
        marqueeEl.style.height = `${height}px`;

        const boxRect = { left, top, right: left + width, bottom: top + height };
        const intersectsBox = (r) =>
          r.left < boxRect.right &&
          r.right > boxRect.left &&
          r.top < boxRect.bottom &&
          r.bottom > boxRect.top;

        const touchedNotes = [];
        wrapper.querySelectorAll(".fk-postit[data-note-id]").forEach((card) => {
          if (card.offsetParent === null) return;
          const r = card.getBoundingClientRect();
          if (intersectsBox(r)) {
            touchedNotes.push({
              id: card.dataset.noteId,
              dist: distToRect(originX, originY, r)
            });
          }
        });

        const touchedFolders = [];
        wrapper.querySelectorAll(".fk-col-header-box, .fk-folder-header-box").forEach((hdr) => {
          if (hdr.offsetParent === null) return;
          const colEl = hdr.closest("[data-col-id]");
          if (!colEl) return;
          const r = hdr.getBoundingClientRect();
          if (intersectsBox(r)) {
            touchedFolders.push({
              id: colEl.dataset.colId,
              dist: distToRect(originX, originY, r)
            });
          }
        });

        if (!lockedType && (touchedNotes.length > 0 || touchedFolders.length > 0)) {
          if (touchedNotes.length > 0 && touchedFolders.length === 0) {
            lockedType = "note";
          } else if (touchedFolders.length > 0 && touchedNotes.length === 0) {
            lockedType = "folder";
          } else {
            const minNoteDist = Math.min(...touchedNotes.map((n) => n.dist));
            const minFolderDist = Math.min(...touchedFolders.map((f) => f.dist));
            lockedType = minFolderDist < minNoteDist ? "folder" : "note";
          }

          const firstList = lockedType === "folder" ? touchedFolders : touchedNotes;
          firstList.sort((a, b) => a.dist - b.dist);
          const firstItem = firstList[0];

          const shiftActive = Boolean(initialShift || coords.shiftKey);
          if (shiftActive && initialType === lockedType && firstItem && initialIds.has(firstItem.id)) {
            lockedMode = "deselect";
          } else {
            lockedMode = "select";
          }
        }

        const visualType = lockedType || initialType || "note";
        marqueeEl.classList.toggle("mode-note", visualType === "note" && lockedMode !== "deselect");
        marqueeEl.classList.toggle("mode-folder", visualType === "folder" && lockedMode !== "deselect");
        marqueeEl.classList.toggle("mode-deselect", lockedMode === "deselect");

        if (!lockedType) {
          if (additive && initialType) {
            this.selectionType = initialIds.size > 0 ? initialType : null;
            this.selectedIds = new Set(initialIds);
          } else {
            this.selectionType = null;
            this.selectedIds = new Set();
          }
          this.syncSelectionDOM();
          return;
        }

        const activeTouchedIds =
          lockedType === "folder" ? touchedFolders.map((f) => f.id) : touchedNotes.map((n) => n.id);

        let nextSelected;
        if (lockedMode === "deselect") {
          nextSelected = new Set(initialIds);
          activeTouchedIds.forEach((id) => nextSelected.delete(id));
        } else {
          nextSelected = additive && initialType === lockedType ? new Set(initialIds) : new Set();
          activeTouchedIds.forEach((id) => nextSelected.add(id));
        }

        this.selectionType = nextSelected.size > 0 ? lockedType : null;
        this.selectedIds = nextSelected;
        this.syncSelectionDOM();
      };

      const onMove = (ev) => {
        if (!isMarquee) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
          isMarquee = true;
          this.app.closeMenu();

          marqueeEl = document.createElement("div");
          marqueeEl.className = `fk-selection-marquee ${initialType === "folder" ? "mode-folder" : "mode-note"}`;
          wrapper.appendChild(marqueeEl);
        }

        updateMarquee({
          clientX: ev.clientX,
          clientY: ev.clientY,
          shiftKey: ev.shiftKey
        });
        this.view.updateDragAutoScroll(
          ev,
          (stepCoords) =>
            updateMarquee({
              clientX: stepCoords.clientX,
              clientY: stepCoords.clientY,
              shiftKey: ev.shiftKey
            }),
          true
        );
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        this.view.stopDragAutoScroll();

        if (!isMarquee) {
          if (!additive && this.isActive()) {
            this.clearSelection();
          }
          return;
        }

        marqueeEl?.remove();
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }

  /* ================= ANIMAÇÃO DE EMPILHAMENTO AO ARRASTAR MÚLTIPLAS NOTAS / PASTAS ================= */

  createAnimatedStackGhost(primaryCard, startX, startY) {
    const body = this.view.getManagerBody();
    const rect = primaryCard.getBoundingClientRect();
    const count = this.selectedIds.size;

    const stackGhost = document.createElement("div");
    stackGhost.className = "fk-drag-ghost fk-drag-stack";
    stackGhost.style.width = `${rect.width}px`;
    stackGhost.style.left = `${startX + 10}px`;
    stackGhost.style.top = `${startY + 10}px`;

    const cloneCard = primaryCard.cloneNode(true);
    cloneCard.classList.remove("is-selected");
    cloneCard.style.opacity = "1";
    cloneCard.style.margin = "0";

    const badge = document.createElement("div");
    badge.className = "fk-stack-count-badge";
    badge.innerHTML = `<i class="fas fa-layer-group"></i> <span>${t("SIN.Manager.StackNotesBadge", { count })}</span>`;

    stackGhost.appendChild(cloneCard);
    stackGhost.appendChild(badge);
    document.body.appendChild(stackGhost);

    if (body) {
      const otherCards = Array.from(body.querySelectorAll(".fk-postit.is-selected")).filter(
        (el) => el !== primaryCard
      );

      otherCards.forEach((otherEl, idx) => {
        const oRect = otherEl.getBoundingClientRect();
        otherEl.classList.add("fk-stack-dragging-source");

        if (idx < 10) {
          const flyer = otherEl.cloneNode(true);
          flyer.className = "fk-postit fk-stack-flyer";
          flyer.style.width = `${oRect.width}px`;
          flyer.style.left = `${oRect.left}px`;
          flyer.style.top = `${oRect.top}px`;
          document.body.appendChild(flyer);

          requestAnimationFrame(() => {
            flyer.style.transform = `translate(${rect.left - oRect.left}px, ${rect.top - oRect.top}px) scale(0.9) rotate(${idx % 2 === 0 ? 4 : -4}deg)`;
            flyer.style.opacity = "0";
          });

          setTimeout(() => flyer.remove(), 220);
        }
      });
    }

    return stackGhost;
  }

  createAnimatedFolderStackGhost(primaryHeader, startX, startY) {
    const body = this.view.getManagerBody();
    const rect = primaryHeader.getBoundingClientRect();
    const count = this.selectedIds.size;

    const stackGhost = document.createElement("div");
    stackGhost.className = "fk-drag-ghost fk-drag-stack";
    stackGhost.style.width = `${rect.width}px`;
    stackGhost.style.left = `${startX - 40}px`;
    stackGhost.style.top = `${startY - 14}px`;

    const cloneHeader = primaryHeader.cloneNode(true);
    cloneHeader.classList.remove("is-selected");
    cloneHeader.style.opacity = "1";
    cloneHeader.style.margin = "0";
    cloneHeader.style.padding = "7px 10px";
    cloneHeader.style.borderRadius = "4px";
    cloneHeader.style.border = "1px solid #7c68ee";

    const badge = document.createElement("div");
    badge.className = "fk-stack-count-badge";
    badge.innerHTML = `<i class="fas fa-layer-group"></i> <span>${t("SIN.Manager.StackFoldersBadge", { count })}</span>`;

    stackGhost.appendChild(cloneHeader);
    stackGhost.appendChild(badge);
    document.body.appendChild(stackGhost);

    if (body) {
      const primaryColEl = primaryHeader.closest("[data-col-id]");
      body.querySelectorAll("[data-col-id].is-selected").forEach((otherEl) => {
        if (otherEl !== primaryColEl) {
          otherEl.classList.add("fk-stack-dragging-source");
        }
      });
    }

    return stackGhost;
  }

  clearStackDragSources() {
    const body = this.view.getManagerBody();
    if (!body) return;
    body.querySelectorAll(".fk-stack-dragging-source").forEach((el) => {
      el.classList.remove("fk-stack-dragging-source");
    });
  }

  /* ================= TOAST DE DESFAZER (CANTO INFERIOR DIREITO) ================= */

  showUndoToast(actionLabel = null) {
    if (!this.storage.hasUndoSnapshot()) return;
    const wrapper = this.app.element?.querySelector(".fk-manager-wrapper");
    if (!wrapper) return;

    const resolvedLabel = actionLabel || t("SIN.Manager.ToastBulkDone");
    clearTimeout(this._undoTimer);
    wrapper.querySelector(".fk-undo-toast")?.remove();

    const toast = document.createElement("div");
    toast.className = "fk-undo-toast";
    toast.innerHTML = `
      <span class="fk-undo-toast-text">${this.storage.escapeHtml(resolvedLabel)}</span>
      <button type="button" class="fk-undo-toast-btn">
        <i class="fas fa-undo"></i> ${t("SIN.Manager.UndoBtn")}
      </button>
      <button type="button" class="fk-undo-toast-close" title="${t("SIN.Info.Close")}">
        <i class="fas fa-times"></i>
      </button>
    `;

    toast.querySelector(".fk-undo-toast-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      clearTimeout(this._undoTimer);
      toast.remove();
      const restored = await this.storage.restoreUndoSnapshot();
      if (restored) {
        this.clearSelection();
        this.app.render({ force: true });
        ui.notifications.info(t("SIN.Manager.ToastBulkUndone"));
      }
    });

    toast.querySelector(".fk-undo-toast-close").addEventListener("click", (e) => {
      e.stopPropagation();
      clearTimeout(this._undoTimer);
      toast.remove();
    });

    wrapper.appendChild(toast);

    this._undoTimer = setTimeout(() => {
      toast.classList.add("hiding");
      setTimeout(() => toast.remove(), 220);
    }, 8000);
  }
}