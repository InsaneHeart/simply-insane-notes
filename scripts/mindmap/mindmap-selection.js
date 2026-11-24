import { t } from "../shared/shared-i18n.js";

export class MindMapSelection {
  constructor(editor) {
    this.editor = editor;
    this.app = editor.app;
    this.storage = editor.storage;
    this.selectedNodeIds = new Set();
    this.selectionModeActive = false;
    this._deletingNodes = false;
  }

  syncSelectionDOM(world = null, viewport = null) {
    const vp = viewport || this.app.element?.querySelector(".fk-mindmap-viewport");
    const wd = world || vp?.querySelector(".fk-mindmap-world");
    if (!vp || !wd) return;

    if (this.selectedNodeIds.size === 0) {
      this.selectionModeActive = false;
    }

    vp.classList.toggle("select-mode-active", Boolean(this.selectionModeActive && this.selectedNodeIds.size > 0));

    wd.querySelectorAll(".fk-mm-node").forEach((nodeEl) => {
      const id = nodeEl.dataset.nodeId;
      const isSel = this.selectedNodeIds.has(id);
      nodeEl.classList.toggle("selected", isSel);
    });
  }

  toggleNodeSelection(nodeId, forceModeActive = true) {
    if (!nodeId) return;
    if (this.selectedNodeIds.has(nodeId)) {
      this.selectedNodeIds.delete(nodeId);
    } else {
      this.selectedNodeIds.add(nodeId);
    }
    this.selectionModeActive = forceModeActive && this.selectedNodeIds.size > 0;
    this.syncSelectionDOM();
  }

  selectAll(nodeIds = [], world = null, viewport = null) {
    this.selectedNodeIds = new Set(nodeIds);
    this.selectionModeActive = this.selectedNodeIds.size > 0;
    this.syncSelectionDOM(world, viewport);
  }

  clearSelection() {
    this.selectedNodeIds.clear();
    this.selectionModeActive = false;
    this.syncSelectionDOM();
  }

  startMarquee(e, viewport, world) {
    const vpRect = viewport.getBoundingClientRect();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startWorldX = (e.clientX - vpRect.left - this.editor.panX) / this.editor.scale;
    const startWorldY = (e.clientY - vpRect.top - this.editor.panY) / this.editor.scale;

    const initialShift = e.shiftKey;
    const initialCtrl = e.ctrlKey;
    const additive = initialShift || initialCtrl;
    const initialIds = new Set(this.selectedNodeIds);

    let isMarquee = false;
    let marquee = null;
    let lockedMode = null;

    const distToRect = (px, py, rx, ry, rw, rh) => {
      const dx = Math.max(rx - px, 0, px - (rx + rw));
      const dy = Math.max(ry - py, 0, py - (ry + rh));
      return Math.hypot(dx, dy);
    };

    const onMove = (ev) => {
      if (!isMarquee) {
        if (Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) < 4) return;
        isMarquee = true;
        this.app.closeMenu();

        marquee = document.createElement("div");
        marquee.className = "fk-selection-marquee";
        marquee.style.left = `${startWorldX}px`;
        marquee.style.top = `${startWorldY}px`;
        marquee.style.width = "0px";
        marquee.style.height = "0px";
        world.appendChild(marquee);
      }

      const curWorldX = (ev.clientX - vpRect.left - this.editor.panX) / this.editor.scale;
      const curWorldY = (ev.clientY - vpRect.top - this.editor.panY) / this.editor.scale;

      const minX = Math.min(startWorldX, curWorldX);
      const minY = Math.min(startWorldY, curWorldY);
      const maxX = Math.max(startWorldX, curWorldX);
      const maxY = Math.max(startWorldY, curWorldY);

      marquee.style.left = `${minX}px`;
      marquee.style.top = `${minY}px`;
      marquee.style.width = `${maxX - minX}px`;
      marquee.style.height = `${maxY - minY}px`;

      const touched = [];
      world.querySelectorAll(".fk-mm-node").forEach((nodeEl) => {
        const nx = parseFloat(nodeEl.style.left) || 0;
        const ny = parseFloat(nodeEl.style.top) || 0;
        const nw = nodeEl.offsetWidth;
        const nh = nodeEl.offsetHeight;

        if (nx < maxX && nx + nw > minX && ny < maxY && ny + nh > minY) {
          touched.push({
            id: nodeEl.dataset.nodeId,
            dist: distToRect(startWorldX, startWorldY, nx, ny, nw, nh)
          });
        }
      });

      if (!lockedMode && touched.length > 0) {
        touched.sort((a, b) => a.dist - b.dist);
        const firstItem = touched[0];
        const shiftActive = Boolean(initialShift || ev.shiftKey);
        if (shiftActive && firstItem && initialIds.has(firstItem.id)) {
          lockedMode = "deselect";
        } else {
          lockedMode = "select";
        }
      }

      marquee.classList.toggle("mode-deselect", lockedMode === "deselect");

      let nextSelected;
      if (!lockedMode) {
        nextSelected = additive ? new Set(initialIds) : new Set();
      } else if (lockedMode === "deselect") {
        nextSelected = new Set(initialIds);
        touched.forEach((item) => nextSelected.delete(item.id));
      } else {
        nextSelected = additive ? new Set(initialIds) : new Set();
        touched.forEach((item) => nextSelected.add(item.id));
      }

      this.selectedNodeIds = nextSelected;
      this.selectionModeActive = nextSelected.size > 0;
      this.syncSelectionDOM(world, viewport);
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);

      if (!isMarquee) {
        if (!additive) {
          this.clearSelection();
        }
        return;
      }

      marquee?.remove();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  async deleteNodesByIds(noteId, targetIdsSet, redraw) {
    if (this._deletingNodes) return;
    const cur = this.storage.getData();
    const tNote = cur.notes.find((n) => n.id === noteId);
    if (!tNote?.mindmap?.nodes?.length) return;

    const rootId = tNote.mindmap.nodes[0]?.id;
    const toDelete = new Set(targetIdsSet);
    toDelete.delete(rootId);

    if (toDelete.size === 0) return;

    this._deletingNodes = true;
    try {
      if (toDelete.size > 1) {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: t("SIN.MindMap.DeleteSelectedTitle") },
          content: `<p>${t("SIN.MindMap.DeleteSelectedConfirm", { count: toDelete.size })}</p>`,
          yes: { label: t("SIN.Common.Delete"), icon: "fas fa-trash" },
          no: { label: t("SIN.Common.Cancel"), default: true }
        });
        if (!confirmed) return;
      }

      this.editor.pushHistorySnapshot(noteId);

      const fresh = this.storage.getData();
      const freshNote = fresh.notes.find((n) => n.id === noteId);
      if (!freshNote) return;

      const freshRootId = freshNote.mindmap.nodes[0]?.id;
      toDelete.delete(freshRootId);

      freshNote.mindmap.nodes = freshNote.mindmap.nodes.filter((n) => !toDelete.has(n.id));
      freshNote.mindmap.edges = (freshNote.mindmap.edges || []).filter(
        (ed) => !toDelete.has(ed.from) && !toDelete.has(ed.to)
      );

      toDelete.forEach((id) => this.selectedNodeIds.delete(id));
      if (this.selectedNodeIds.size === 0) {
        this.selectionModeActive = false;
      }
      await this.storage.saveNow(fresh);
      redraw();
    } finally {
      this._deletingNodes = false;
    }
  }
}