import { MindMapNodes } from "./mindmap-nodes.js";
import { MindMapHistory } from "./mindmap-history.js";
import { MindMapSelection } from "./mindmap-selection.js";
import { MindMapMenus } from "./mindmap-menus.js";
import { MindMapPickers } from "./mindmap-pickers.js";
import { MindMapSearch } from "./mindmap-search.js";
import { t } from "../shared/shared-i18n.js";

const CAMERA_SAVE_DELAY = 140;

export class MindMapEditor {
  constructor(app) {
    this.app = app;
    this.storage = app.storage;

    this.history = new MindMapHistory(this);
    this.selection = new MindMapSelection(this);
    this.menus = new MindMapMenus(this);
    this.pickers = new MindMapPickers(this);
    this.nodesManager = new MindMapNodes(this);
    this.search = null;

    this.scale = 1;
    this.panX = -1550;
    this.panY = -1720;
    this._suppressContextMenu = false;
    this.pendingSearchQuery = null;
    this.matchedNodeIds = [];
    this.currentMatchIdx = -1;
    this.lastMouseWorld = { x: 1960, y: 1980 };
    this.hoveredNodeId = null;
    this._windowKeyCleanup = null;
    this._cameraSaveTimer = null;
  }

  /* ================= PERSISTÊNCIA DE CÂMERA E ZOOM ================= */

  _getCameraStorageKey(note) {
    const worldId = globalThis.game?.world?.id || "default";
    const userId = globalThis.game?.user?.id || "anon";
    const ownerId = note?.ownerId || userId;
    return `sin:mm-camera:${worldId}:${userId}:${ownerId}:${note?.id}`;
  }

  _loadCameraState(note) {
    if (!note?.id) return null;
    try {
      const raw = localStorage.getItem(this._getCameraStorageKey(note));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const panX = Number(parsed?.panX);
      const panY = Number(parsed?.panY);
      const scale = Number(parsed?.scale);
      if (!Number.isFinite(panX) || !Number.isFinite(panY) || !Number.isFinite(scale)) {
        return null;
      }
      return {
        panX,
        panY,
        scale: Math.max(0.35, Math.min(2.2, scale))
      };
    } catch {
      return null;
    }
  }

  _saveCameraState(note) {
    if (!note?.id) return;
    try {
      localStorage.setItem(
        this._getCameraStorageKey(note),
        JSON.stringify({
          panX: Math.round(this.panX * 100) / 100,
          panY: Math.round(this.panY * 100) / 100,
          scale: Math.round(this.scale * 1000) / 1000
        })
      );
    } catch {
      // Ignora caso o storage do navegador esteja indisponível
    }
  }

  _scheduleCameraSave(note, { immediate = false } = {}) {
    if (this._cameraSaveTimer) {
      clearTimeout(this._cameraSaveTimer);
      this._cameraSaveTimer = null;
    }
    if (immediate) {
      this._saveCameraState(note);
      return;
    }
    this._cameraSaveTimer = setTimeout(() => {
      this._cameraSaveTimer = null;
      this._saveCameraState(note);
    }, CAMERA_SAVE_DELAY);
  }

  /* ================= DELEGAÇÕES PARA SELEÇÃO, HISTÓRICO E MENUS ================= */

  get selectedNodeIds() {
    return this.selection.selectedNodeIds;
  }

  set selectedNodeIds(val) {
    this.selection.selectedNodeIds = val;
  }

  get selectionModeActive() {
    return this.selection.selectionModeActive;
  }

  set selectionModeActive(val) {
    this.selection.selectionModeActive = Boolean(val);
  }

  syncSelectionDOM(world = null, viewport = null) {
    return this.selection.syncSelectionDOM(world, viewport);
  }

  toggleNodeSelection(nodeId, forceModeActive = true) {
    return this.selection.toggleNodeSelection(nodeId, forceModeActive);
  }

  clearSelection() {
    return this.selection.clearSelection();
  }

  deleteNodesByIds(noteId, targetIdsSet, redraw) {
    return this.selection.deleteNodesByIds(noteId, targetIdsSet, redraw);
  }

  _captureNoteState(noteId) {
    return this.history.captureNoteState(noteId);
  }

  pushHistorySnapshot(noteId) {
    return this.history.pushSnapshot(noteId);
  }

  pushCustomSnapshot(noteId, snap) {
    return this.history.pushCustomSnapshot(noteId, snap);
  }

  undo(noteId, redraw) {
    return this.history.undo(noteId, redraw);
  }

  redo(noteId, redraw) {
    return this.history.redo(noteId, redraw);
  }

  showNodeContextMenu(x, y, noteId, nodeId, isRootNode, nodeEl, redraw, centerCameraOnPointFn, nodeElements) {
    return this.menus.showNodeContextMenu(
      x,
      y,
      noteId,
      nodeId,
      isRootNode,
      nodeEl,
      redraw,
      centerCameraOnPointFn,
      nodeElements
    );
  }

  showEdgeContextMenu(x, y, noteId, edgeIndex, redraw) {
    return this.menus.showEdgeContextMenu(x, y, noteId, edgeIndex, redraw);
  }

  showCanvasContextMenu(x, y, noteId, wx, wy, nodeElements, redraw, centerCameraFn, getBoundingBoxFn, isLockedOrReadOnly) {
    return this.menus.showCanvasContextMenu(
      x,
      y,
      noteId,
      wx,
      wy,
      nodeElements,
      redraw,
      centerCameraFn,
      getBoundingBoxFn,
      isLockedOrReadOnly
    );
  }

  /* ================= BOTÃO DE INFORMAÇÕES E STATUS DA NOTA ================= */

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

  /* ================= RENDERIZAÇÃO E EVENTOS DO CANVAS ================= */

  render(root, note) {
    const isReadOnly = Boolean(note.readOnly);
    const isLocked = Boolean(note.locked);
    const canEdit = !isReadOnly && !isLocked;

    this.pickers.close();
    this.search?.destroy();
    this.search = null;

    if (this._cameraSaveTimer) {
      clearTimeout(this._cameraSaveTimer);
      this._cameraSaveTimer = null;
    }

    if (this._windowKeyCleanup) {
      this._windowKeyCleanup();
      this._windowKeyCleanup = null;
    }

    this.selection.selectedNodeIds.clear();
    this.selection.selectionModeActive = false;
    this.hoveredNodeId = null;
    this.history.ensureHistoryForNote(note.id);

    const wrapper = document.createElement("div");
    wrapper.className = "fk-editor-wrapper-rel";
    wrapper.innerHTML = `
      <div class="fk-mindmap-viewport ${!canEdit ? "is-locked" : ""}" tabindex="0">
        <div class="fk-mindmap-world">
          <svg class="fk-mindmap-svg"></svg>
        </div>
      </div>
      ${this._buildStatusFabHtml(note)}
    `;
    root.appendChild(wrapper);

    const viewport = wrapper.querySelector(".fk-mindmap-viewport");
    const world = wrapper.querySelector(".fk-mindmap-world");
    const svg = wrapper.querySelector(".fk-mindmap-svg");

    wrapper.querySelector("#fk-note-info-btn").addEventListener("click", () => {
      this.app.infoModals?.openNoteInfoModal(note.id, note.ownerId);
    });

    const getNoteData = () => {
      if (isReadOnly) {
        return this.storage.findAnyNoteById(note.id, note.ownerId) || note;
      }
      return this.storage.getData().notes.find((n) => n.id === note.id) || note;
    };

    const applyTransform = ({ save = true, immediate = false } = {}) => {
      world.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
      if (save) {
        this._scheduleCameraSave(note, { immediate });
      }
    };

    const centerCameraOnPoint = (wx, wy) => {
      const vpRect = viewport.getBoundingClientRect();
      const vpW = vpRect.width || 880;
      const vpH = vpRect.height || 560;
      this.panX = vpW / 2 - wx * this.scale;
      this.panY = vpH / 2 - wy * this.scale;
      applyTransform({ save: true, immediate: true });
    };

    const nodeElements = new Map();

    const getNodesBoundingBox = () => {
      return this.nodesManager.getNodesBoundingBox(getNoteData(), nodeElements);
    };

    const centerCameraOnNodes = () => {
      const box = getNodesBoundingBox();
      centerCameraOnPoint(box.centerX, box.centerY);
    };

    const savedCam = note.isNewlyCreated ? null : this._loadCameraState(note);
    if (savedCam) {
      this.scale = savedCam.scale;
      this.panX = savedCam.panX;
      this.panY = savedCam.panY;
      applyTransform({ save: false });
    } else {
      this.scale = 1;
      setTimeout(centerCameraOnNodes, 25);
    }

    const redraw = () => {
      this.nodesManager.redraw({
        note,
        getNoteData,
        world,
        svg,
        viewport,
        nodeElements,
        canEdit,
        centerCameraOnPoint
      });
      this.search?.syncHighlights();
    };

    this.search = new MindMapSearch(this, {
      note,
      wrapper,
      nodeElements,
      getNoteData,
      canEdit,
      redraw,
      centerCameraOnPoint
    });

    if (canEdit) {
      const syncCtrlState = (ev) => {
        if (!viewport.isConnected) return;
        const isCtrl = Boolean(ev.ctrlKey || ev.metaKey);
        viewport.classList.toggle("ctrl-pressed", isCtrl);
      };
      const clearCtrlState = () => {
        viewport.classList.remove("ctrl-pressed", "ctrl-duplicating");
      };

      window.addEventListener("keydown", syncCtrlState, true);
      window.addEventListener("keyup", syncCtrlState, true);
      window.addEventListener("blur", clearCtrlState);

      this._windowKeyCleanup = () => {
        window.removeEventListener("keydown", syncCtrlState, true);
        window.removeEventListener("keyup", syncCtrlState, true);
        window.removeEventListener("blur", clearCtrlState);
      };
    }

    viewport.addEventListener("mousemove", (e) => {
      if (canEdit) {
        viewport.classList.toggle("ctrl-pressed", Boolean(e.ctrlKey || e.metaKey));
      }
      const vpRect = viewport.getBoundingClientRect();
      this.lastMouseWorld = {
        x: Math.round((e.clientX - vpRect.left - this.panX) / this.scale - 90),
        y: Math.round((e.clientY - vpRect.top - this.panY) / this.scale - 60)
      };

      const nodeUnder = e.target.closest?.(".fk-mm-node");
      this.hoveredNodeId = nodeUnder?.dataset?.nodeId || null;
    });

    viewport.addEventListener("mouseleave", () => {
      this.hoveredNodeId = null;
      viewport.classList.remove("ctrl-pressed");
    });

    wrapper.addEventListener("keydown", async (e) => {
      const keyLower = e.key.toLowerCase();

      if ((e.ctrlKey || e.metaKey) && keyLower === "f") {
        e.preventDefault();
        e.stopPropagation();
        this.toggleInNoteSearch({ showReplace: false });
        return;
      }

      if ((e.ctrlKey || e.metaKey) && keyLower === "h") {
        e.preventDefault();
        e.stopPropagation();
        this.toggleInNoteSearch({ showReplace: true });
        return;
      }

      if (!canEdit) return;

      const isEditingText = Boolean(e.target.closest("input, textarea, [contenteditable='true']"));

      if (!isEditingText && (e.ctrlKey || e.metaKey) && keyLower === "a") {
        e.preventDefault();
        e.stopPropagation();
        const curNote = getNoteData();
        const allIds = (curNote?.mindmap?.nodes || []).map((n) => n.id);
        this.selection.selectAll(allIds, world, viewport);
        return;
      }

      if (!isEditingText && e.key === "Escape" && this.selectedNodeIds.size > 0) {
        e.preventDefault();
        e.stopPropagation();
        this.clearSelection();
        return;
      }

      if (!isEditingText && (e.ctrlKey || e.metaKey) && keyLower === "z") {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          this.redo(note.id, redraw);
        } else {
          this.undo(note.id, redraw);
        }
        return;
      }

      if (!isEditingText && (e.ctrlKey || e.metaKey) && keyLower === "y") {
        e.preventDefault();
        e.stopPropagation();
        this.redo(note.id, redraw);
        return;
      }

      if (e.key === "Delete") {
        if (isEditingText) return;
        if (document.querySelector(".application.dialog, dialog[open]")) return;

        if (this.selectedNodeIds.size > 0) {
          e.preventDefault();
          e.stopPropagation();
          await this.deleteNodesByIds(note.id, this.selectedNodeIds, redraw);
          return;
        }

        if (this.hoveredNodeId) {
          e.preventDefault();
          e.stopPropagation();
          await this.deleteNodesByIds(note.id, new Set([this.hoveredNodeId]), redraw);
        }
      }
    });

    viewport.addEventListener("mousedown", (e) => {
      const isEmptyCanvas = e.target === viewport || e.target === world || e.target === svg;

      if (isEmptyCanvas) {
        viewport.focus();
      }

      if (e.button === 1) {
        e.preventDefault();
        viewport.classList.add("panning");
        const startX = e.clientX - this.panX;
        const startY = e.clientY - this.panY;

        const onMove = (ev) => {
          this.panX = ev.clientX - startX;
          this.panY = ev.clientY - startY;
          applyTransform({ save: true });
        };
        const onUp = () => {
          viewport.classList.remove("panning");
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
          this._scheduleCameraSave(note, { immediate: true });
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return;
      }

      if (e.button === 2 && isEmptyCanvas) {
        const startX = e.clientX;
        const startY = e.clientY;
        const origPanX = this.panX;
        const origPanY = this.panY;
        let hasPanned = false;

        const onMove = (ev) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (!hasPanned && Math.hypot(dx, dy) >= 5) {
            hasPanned = true;
            this._suppressContextMenu = true;
            viewport.classList.add("panning");
            this.app.closeMenu();
          }
          if (hasPanned) {
            this.panX = origPanX + dx;
            this.panY = origPanY + dy;
            applyTransform({ save: true });
          }
        };

        const onUp = () => {
          viewport.classList.remove("panning");
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
          if (hasPanned) {
            this._scheduleCameraSave(note, { immediate: true });
            setTimeout(() => {
              this._suppressContextMenu = false;
            }, 40);
          }
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return;
      }

      if (e.button === 0 && isEmptyCanvas && canEdit) {
        this.selection.startMarquee(e, viewport, world);
      }
    });

    viewport.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = (mouseX - this.panX) / this.scale;
        const worldY = (mouseY - this.panY) / this.scale;

        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        this.scale = Math.max(0.35, Math.min(2.2, this.scale * factor));

        this.panX = mouseX - worldX * this.scale;
        this.panY = mouseY - worldY * this.scale;
        applyTransform({ save: true });
      },
      { passive: false }
    );

    if (canEdit) {
      viewport.addEventListener("dblclick", (e) => {
        if (e.target !== viewport && e.target !== world && e.target !== svg) return;
        const vpRect = viewport.getBoundingClientRect();
        const wx = Math.round((e.clientX - vpRect.left - this.panX) / this.scale - 75);
        const wy = Math.round((e.clientY - vpRect.top - this.panY) / this.scale - 20);
        this.nodesManager.createTextNodeAt(note.id, wx, wy, nodeElements, redraw);
      });

      viewport.addEventListener("dragover", (e) => {
        e.preventDefault();
      });

      viewport.addEventListener("drop", (e) => {
        e.preventDefault();
        const files = e.dataTransfer?.files;
        if (!files || !files.length) return;
        const file = Array.from(files).find((f) => f.type.startsWith("image/"));
        if (!file) return;

        const vpRect = viewport.getBoundingClientRect();
        const wx = Math.round((e.clientX - vpRect.left - this.panX) / this.scale - 90);
        const wy = Math.round((e.clientY - vpRect.top - this.panY) / this.scale - 60);

        const reader = new FileReader();
        reader.onload = (ev) => {
          this.nodesManager.addImageNodeToCanvas(note.id, ev.target.result, wx, wy, nodeElements, redraw);
        };
        reader.readAsDataURL(file);
      });

      wrapper.addEventListener("paste", (e) => {
        const items = e.clipboardData?.items;
        if (items) {
          for (const item of items) {
            if (item.type.startsWith("image/")) {
              e.preventDefault();
              const file = item.getAsFile();
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                this.nodesManager.addImageNodeToCanvas(
                  note.id,
                  ev.target.result,
                  this.lastMouseWorld.x,
                  this.lastMouseWorld.y,
                  nodeElements,
                  redraw
                );
              };
              reader.readAsDataURL(file);
              return;
            }
          }
        }
      });
    }

    viewport.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (this._suppressContextMenu) return;
      const vpRect = viewport.getBoundingClientRect();
      const wx = Math.round((e.clientX - vpRect.left - this.panX) / this.scale - 75);
      const wy = Math.round((e.clientY - vpRect.top - this.panY) / this.scale - 20);
      this.showCanvasContextMenu(
        e.clientX,
        e.clientY,
        note.id,
        wx,
        wy,
        nodeElements,
        redraw,
        centerCameraOnNodes,
        getNodesBoundingBox,
        !canEdit
      );
    });

    redraw();

    setTimeout(() => {
      if (canEdit && note.isNewlyCreated) {
        const fresh = this.storage.getData();
        const targetNote = fresh.notes.find((n) => n.id === note.id);
        if (targetNote) {
          delete targetNote.isNewlyCreated;
          this.storage.saveNow(fresh);
        }
        const rootTitleEl = world.querySelector(".fk-mm-node.root-node .fk-mm-node-title");
        if (rootTitleEl) {
          rootTitleEl.contentEditable = "true";
          rootTitleEl.focus();
          const range = document.createRange();
          range.selectNodeContents(rootTitleEl);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } else if (this.pendingSearchQuery) {
        const q = this.pendingSearchQuery;
        this.pendingSearchQuery = null;
        this.openInNoteSearchWithQuery(q);
      } else {
        viewport.focus();
      }
    }, 20);
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
}