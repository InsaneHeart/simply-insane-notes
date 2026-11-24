import { applyImageCrop, cancelActiveImageCrop } from "../shared/shared-image-cropper.js";
import { t } from "../shared/shared-i18n.js";

const ANCHOR_OFFSET = 9;

export class MindMapNodeRenderer {
  constructor(nodesManager) {
    this.nodesManager = nodesManager;
    this.editor = nodesManager.editor;
    this.app = nodesManager.app;
    this.storage = nodesManager.storage;
    this._lastSelectionToggleTime = 0;
  }

  _isSelectionBlockingEdit() {
    if (this.editor.selectedNodeIds.size > 0) return true;
    if (Date.now() - this._lastSelectionToggleTime < 350) return true;
    return false;
  }

  _syncCollapsedIndicator(el, node, detailsText) {
    let iconEl = el.querySelector(".fk-mm-collapsed-icon");
    const cleanText = String(detailsText || "").trim();

    if (node.collapsed && cleanText) {
      el.classList.add("has-collapsed-icon");
      if (!iconEl) {
        iconEl = document.createElement("i");
        iconEl.className = "fas fa-align-left fk-mm-collapsed-icon";
        el.appendChild(iconEl);
      }
      iconEl.removeAttribute("data-tooltip");
      iconEl.setAttribute("title", cleanText);
    } else {
      el.classList.remove("has-collapsed-icon");
      if (iconEl) iconEl.remove();
    }
  }

  redraw(ctx, cardColors = []) {
    const {
      note,
      getNoteData,
      world,
      svg,
      viewport,
      nodeElements,
      canEdit,
      centerCameraOnPoint
    } = ctx;

    cancelActiveImageCrop();

    const target = getNoteData();
    if (!target) return;

    world.querySelectorAll(".fk-mm-node").forEach((el) => el.remove());
    nodeElements.clear();

    const rawNodes = target.mindmap?.nodes || [];
    const allAccessibleNotes = this.storage.getAllAccessibleNotes();

    let convertedAnyMissingLink = false;
    rawNodes.forEach((n) => {
      if (n.nodeType === "link" && n.linkedNoteId) {
        const exists = allAccessibleNotes.some((acc) => acc.id === n.linkedNoteId);
        if (!exists) {
          this.nodesManager._convertMissingLinkNode(n);
          convertedAnyMissingLink = true;
        }
      }
    });

    if (convertedAnyMissingLink && canEdit) {
      const cur = this.storage.getData();
      const storedNote = cur.notes.find((x) => x.id === note.id);
      if (storedNote?.mindmap?.nodes) {
        storedNote.mindmap.nodes.forEach((sn) => {
          if (sn.nodeType === "link" && sn.linkedNoteId) {
            const exists = allAccessibleNotes.some((acc) => acc.id === sn.linkedNoteId);
            if (!exists) {
              this.nodesManager._convertMissingLinkNode(sn);
            }
          }
        });
        this.storage.markDirty(cur);
      }
    }

    const rootNodeId = rawNodes[0]?.id || null;
    const sortedByLayer = this.nodesManager.getNodesSortedByLayer(rawNodes);
    const redrawFn = () => this.nodesManager.redraw(ctx);

    viewport.classList.toggle(
      "select-mode-active",
      Boolean(canEdit && this.editor.selectionModeActive && this.editor.selectedNodeIds.size > 0)
    );

    sortedByLayer.forEach((node, layerIdx) => {
      const isRootNode = node.id === rootNodeId;
      const nType = node.nodeType || "text";
      const isSelected = canEdit && this.editor.selectedNodeIds.has(node.id);
      const rootIconHtml = isRootNode
        ? `<i class="fas fa-crown fk-mm-root-icon" title="${t("SIN.MindMap.RootNodeTitle")}"></i>`
        : "";

      const el = document.createElement("div");
      el.className = [
        "fk-mm-node",
        isRootNode ? "root-node" : "",
        nType === "image" ? "image-node" : "",
        nType === "link" ? "link-node" : "",
        nType === "user" ? "user-node" : "",
        node.collapsed ? "collapsed" : "",
        isSelected ? "selected" : ""
      ]
        .filter(Boolean)
        .join(" ");

      el.dataset.nodeId = node.id;
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      el.style.zIndex = String(2 + layerIdx);

      if (node.color && nType !== "link" && nType !== "user") {
        const colorSpec = cardColors.find((c) => c.border === node.color);
        el.style.borderColor = node.color;
        if (colorSpec?.bg) el.style.background = colorSpec.bg;
      }

      if (nType === "image") {
        el.style.width = `${node.width || 210}px`;
        const hasTitle = Boolean(node.title?.trim());
        el.innerHTML = `
          <span class="fk-node-anchor" title="${!canEdit ? t("SIN.MindMap.AnchorReadOnly") : t("SIN.MindMap.AnchorDrag")}"></span>
          ${rootIconHtml}
          <div class="fk-mm-node-title" contenteditable="false" style="${hasTitle ? "" : "display:none;"} margin-bottom:4px;">${this.storage.escapeHtml(node.title || "")}</div>
          <div class="fk-img-crop-frame"><img src="${node.imageUrl || ""}" draggable="false" /></div>
          ${!canEdit ? "" : `<span class="fk-img-resize" title="${t("SIN.MindMap.ResizeDrag")}"></span>`}
        `;

        const frameEl = el.querySelector(".fk-img-crop-frame");
        const imgEl = el.querySelector("img");
        if (frameEl && imgEl) {
          applyImageCrop(frameEl, imgEl, node.crop);
        }

        imgEl?.addEventListener("load", () => {
          if (frameEl) applyImageCrop(frameEl, imgEl, node.crop);
          if (canEdit && el.offsetHeight > 0) {
            const cur = this.storage.getData();
            const sn = cur.notes.find((x) => x.id === note.id)?.mindmap?.nodes?.find((x) => x.id === node.id);
            if (sn) {
              sn.width = el.offsetWidth || node.width || 210;
              sn.height = el.offsetHeight;
              sn.renderedW = sn.width;
              sn.renderedH = sn.height;
              this.storage.markDirty(cur);
            }
          }
        });
      } else if (nType === "link") {
        const linkedNote = allAccessibleNotes.find((x) => x.id === node.linkedNoteId);
        const displayTitle = linkedNote
          ? (linkedNote.type === "mindmap"
              ? linkedNote.mindmap?.nodes?.[0]?.title || linkedNote.title
              : linkedNote.title) || t("SIN.Common.UntitledNote")
          : node.title || t("SIN.Storage.LinkedNoteFallback");

        const previewText = linkedNote
          ? this.storage.extractNotePreview(linkedNote, 130)
          : node.details || "";

        el.innerHTML = `
          <span class="fk-node-anchor" title="${!canEdit ? t("SIN.MindMap.AnchorReadOnly") : t("SIN.MindMap.AnchorDrag")}"></span>
          ${rootIconHtml}
          <div class="fk-mm-node-title" contenteditable="false" title="${t("SIN.MindMap.DblClickOpenNote")}">
            <i class="fas fa-link" style="font-size:11px; color:#d8b4fe; margin-right:4px;"></i>${this.storage.escapeHtml(displayTitle)}
          </div>
          ${
            previewText
              ? `<div class="fk-mm-node-details" contenteditable="false" title="${t("SIN.MindMap.DblClickOpenNote")}">${this.storage.escapeHtml(previewText)}</div>`
              : ""
          }
        `;

        this._syncCollapsedIndicator(el, node, previewText);

        el.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          if (this._isSelectionBlockingEdit()) return;
          if (node.linkedNoteId) {
            this.app.openNote(node.linkedNoteId, node.linkedOwnerId || null);
          }
        });
      } else if (nType === "user") {
        const user = globalThis.game?.users?.get(node.linkedUserId);
        const displayName = user?.character?.name?.trim() || user?.name || node.title || t("SIN.Sharing.Player");
        const iconClass = user?.isGM ? "fa-crown" : "fa-user";
        const access = this.storage.getUserAccessLevel?.(target, node.linkedUserId) || "none";
        const isOwner = Boolean(target && !target.readOnly);

        el.dataset.access = access;

        let tooltipText = t("SIN.MindMap.UserTooltipCreator");
        if (access === "shared") {
          tooltipText = t("SIN.MindMap.UserTooltipShared");
        } else if (access === "none") {
          tooltipText = isOwner
            ? t("SIN.MindMap.UserTooltipNoneOwner")
            : t("SIN.MindMap.UserTooltipNone");
        }

        el.innerHTML = `
          <span class="fk-node-anchor" title="${!canEdit ? t("SIN.MindMap.AnchorReadOnly") : t("SIN.MindMap.AnchorDrag")}"></span>
          ${rootIconHtml}
          <div class="fk-mm-node-title" contenteditable="false" title="${tooltipText}">
            <i class="fas ${iconClass} fk-mm-user-icon"></i>${this.storage.escapeHtml(displayName)}
          </div>
        `;

        el.addEventListener("dblclick", async (e) => {
          e.stopPropagation();
          if (this._isSelectionBlockingEdit()) return;
          if (!node.linkedUserId) return;

          if (access === "none" && isOwner) {
            await this.nodesManager.openShareForUserNode(note.id, node.linkedUserId, redrawFn);
          } else {
            this.nodesManager.openUserSheet(node.linkedUserId);
          }
        });
      } else {
        el.innerHTML = `
          <span class="fk-node-anchor" title="${!canEdit ? t("SIN.MindMap.AnchorReadOnly") : t("SIN.MindMap.AnchorDragNote")}"></span>
          ${rootIconHtml}
          <div class="fk-mm-node-title" contenteditable="false">${this.storage.escapeHtml(node.title || "")}</div>
          <div class="fk-mm-node-details" contenteditable="${canEdit ? "true" : "false"}">${this.storage.escapeHtml(node.details || "")}</div>
        `;
        this._syncCollapsedIndicator(el, node, node.details);
      }

      const titleEl = el.querySelector(".fk-mm-node-title");
      const detailsEl = el.querySelector(".fk-mm-node-details");
      const anchorEl = el.querySelector(".fk-node-anchor");
      const resizeHandle = el.querySelector(".fk-img-resize");

      if (nType === "text" && detailsEl && !node.details?.trim()) {
        detailsEl.style.display = "none";
      }

      el.addEventListener("mouseenter", () => {
        this.editor.hoveredNodeId = node.id;
      });
      el.addEventListener("mouseleave", () => {
        if (this.editor.hoveredNodeId === node.id) {
          this.editor.hoveredNodeId = null;
        }
      });

      if (canEdit) {
        this._bindEditableNodeEvents({
          el,
          node,
          nType,
          isRootNode,
          titleEl,
          detailsEl,
          anchorEl,
          resizeHandle,
          note,
          getNoteData,
          world,
          svg,
          viewport,
          nodeElements,
          canEdit,
          centerCameraOnPoint,
          redrawFn
        });
      }

      world.appendChild(el);
      nodeElements.set(node.id, el);
    });

    if (canEdit) {
      requestAnimationFrame(() => {
        const cur = this.storage.getData();
        const storedNote = cur.notes.find((x) => x.id === note.id);
        if (!storedNote?.mindmap?.nodes) return;
        let updatedDims = false;
        storedNote.mindmap.nodes.forEach((sn) => {
          const domEl = nodeElements.get(sn.id);
          if (domEl && domEl.offsetWidth > 0 && domEl.offsetHeight > 0) {
            if (sn.renderedW !== domEl.offsetWidth || sn.renderedH !== domEl.offsetHeight) {
              sn.renderedW = domEl.offsetWidth;
              sn.renderedH = domEl.offsetHeight;
              updatedDims = true;
            }
          }
        });
        if (updatedDims) {
          this.storage.markDirty(cur);
        }
      });
    }

    this.nodesManager.renderEdges(getNoteData, svg, nodeElements, canEdit, note.id, redrawFn);
  }

  _bindEditableNodeEvents({
    el,
    node,
    nType,
    isRootNode,
    titleEl,
    detailsEl,
    anchorEl,
    resizeHandle,
    note,
    getNoteData,
    world,
    svg,
    viewport,
    nodeElements,
    canEdit,
    centerCameraOnPoint,
    redrawFn
  }) {
    let preEditSnap = null;
    let preEditTitle = node.title || "";
    let preEditDetails = node.details || "";

    const capturePreEditState = () => {
      if (!preEditSnap) {
        preEditSnap = this.editor._captureNoteState(note.id);
        preEditTitle = titleEl?.innerText || "";
        preEditDetails = detailsEl?.innerText || "";
      }
    };

    const commitEditHistoryIfChanged = () => {
      if (!preEditSnap) return;
      const nowTitle = titleEl?.innerText || "";
      const nowDetails = detailsEl?.innerText || "";
      if (nowTitle !== preEditTitle || nowDetails !== preEditDetails) {
        this.editor.pushCustomSnapshot(note.id, preEditSnap);
      }
      preEditSnap = null;
    };

    const startEditingNode = () => {
      if (this._isSelectionBlockingEdit()) return;
      capturePreEditState();
      if (nType === "text" && node.collapsed && detailsEl && detailsEl.innerText.trim()) {
        el.classList.add("editing-expanded");
        detailsEl.style.display = "block";
      }
      if (titleEl) {
        titleEl.style.display = "block";
        titleEl.contentEditable = "true";
        titleEl.focus();
        const range = document.createRange();
        range.selectNodeContents(titleEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    };

    el.addEventListener("focusout", () => {
      setTimeout(() => {
        if (!el.contains(document.activeElement)) {
          commitEditHistoryIfChanged();
          el.classList.remove("editing-expanded");
          if (nType === "text") {
            const cur = this.storage.getData();
            const latestNode = cur.notes
              .find((x) => x.id === note.id)
              ?.mindmap?.nodes?.find((x) => x.id === node.id);
            if (latestNode) {
              this._syncCollapsedIndicator(el, latestNode, detailsEl?.innerText || latestNode.details);
              latestNode.renderedW = el.offsetWidth;
              latestNode.renderedH = el.offsetHeight;
              this.storage.markDirty(cur);
            }
          }
        }
      }, 15);
    });

    if (nType === "text") {
      el.addEventListener("dblclick", (e) => {
        if (this._isSelectionBlockingEdit()) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (e.target === detailsEl) return;
        e.stopPropagation();
        startEditingNode();
      });
    }

    if (nType === "text" && detailsEl) {
      detailsEl.addEventListener("focus", () => {
        if (this._isSelectionBlockingEdit()) {
          detailsEl.blur();
          return;
        }
        capturePreEditState();
      });
      detailsEl.addEventListener("mousedown", (e) => {
        if (this._isSelectionBlockingEdit()) {
          e.preventDefault();
          return;
        }
        e.stopPropagation();
      });
      detailsEl.addEventListener("blur", () => {
        if (!detailsEl.innerText.trim()) {
          detailsEl.style.display = "none";
        }
      });
    }

    if (nType !== "link" && nType !== "user" && titleEl) {
      titleEl.addEventListener("focus", () => capturePreEditState());
      titleEl.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        if (this._isSelectionBlockingEdit()) {
          e.preventDefault();
          return;
        }
        startEditingNode();
      });

      titleEl.addEventListener("mousedown", (e) => {
        if (titleEl.isContentEditable) {
          e.stopPropagation();
        }
      });

      titleEl.addEventListener("blur", () => {
        titleEl.contentEditable = "false";
        if (nType === "image" && !titleEl.innerText.trim()) {
          titleEl.style.display = "none";
        }
        if (isRootNode) {
          const cur = this.storage.getData();
          const tNote = cur.notes.find((x) => x.id === note.id);
          if (tNote) {
            const uniqueTitle = this.storage.getUniqueNoteTitle(titleEl.innerText.trim(), note.id);
            titleEl.innerText = uniqueTitle;
            tNote.title = uniqueTitle;
            if (tNote.mindmap?.nodes?.[0]) tNote.mindmap.nodes[0].title = uniqueTitle;
            this.storage.saveNow(cur);
            this.app.updateWindowTitle(uniqueTitle);
          }
        }
      });

      titleEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          titleEl.contentEditable = "false";
          if (detailsEl) {
            if (node.collapsed) {
              el.classList.add("editing-expanded");
            }
            detailsEl.style.display = "block";
            detailsEl.focus();
          } else {
            titleEl.blur();
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          titleEl.blur();
        }
      });

      titleEl.addEventListener("input", () => {
        const cur = this.storage.getData();
        const tNote = cur.notes.find((x) => x.id === note.id);
        const n = tNote?.mindmap.nodes.find((x) => x.id === node.id);
        if (n) {
          const newText = titleEl.innerText.replace(/\n/g, " ");
          n.title = newText;
          n.renderedW = el.offsetWidth;
          n.renderedH = el.offsetHeight;
          if (isRootNode && tNote) {
            tNote.title = newText;
            this.app.updateWindowTitle(newText || t("SIN.Common.MindMap"));
          }
          this.storage.markDirty(cur);
        }
      });
    }

    if (nType === "text" && detailsEl) {
      detailsEl.addEventListener("input", () => {
        const cur = this.storage.getData();
        const n = cur.notes.find((x) => x.id === note.id)?.mindmap.nodes.find((x) => x.id === node.id);
        if (n) {
          n.details = detailsEl.innerText;
          node.details = n.details;
          n.renderedW = el.offsetWidth;
          n.renderedH = el.offsetHeight;
          this._syncCollapsedIndicator(el, n, n.details);
          this.storage.markDirty(cur);
        }
      });
    }

    if (resizeHandle && nType === "image") {
      resizeHandle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const preResizeSnap = this.editor._captureNoteState(note.id);
        const startX = e.clientX;
        const startW = el.offsetWidth;

        const onMove = (ev) => {
          const dx = (ev.clientX - startX) / this.editor.scale;
          const newW = Math.max(90, Math.min(600, Math.round(startW + dx)));
          el.style.width = `${newW}px`;
        };

        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
          if (el.offsetWidth !== startW) {
            this.editor.pushCustomSnapshot(note.id, preResizeSnap);
          }
          const cur = this.storage.getData();
          const n = cur.notes.find((x) => x.id === note.id)?.mindmap.nodes.find((x) => x.id === node.id);
          if (n) {
            n.width = el.offsetWidth;
            n.height = el.offsetHeight || 150;
            n.renderedW = n.width;
            n.renderedH = n.height;
            this.storage.markDirty(cur);
          }
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      });
    }

    el.addEventListener("mousedown", (e) => {
      if (
        e.button !== 0 ||
        e.target.classList.contains("fk-node-anchor") ||
        e.target.classList.contains("fk-img-resize") ||
        titleEl?.isContentEditable
      ) {
        return;
      }

      viewport.focus();

      const hadSelectionBefore = this.editor.selectedNodeIds.size > 0;
      const isNodeAlreadySelected = this.editor.selectedNodeIds.has(node.id);
      let addedByShiftOnDown = false;

      if (e.shiftKey && !isNodeAlreadySelected) {
        this._lastSelectionToggleTime = Date.now();
        this.editor.toggleNodeSelection(node.id, true);
        addedByShiftOnDown = true;
      }

      const movingIds = this.editor.selectedNodeIds.has(node.id)
        ? Array.from(this.editor.selectedNodeIds)
        : [node.id];

      const startClientX = e.clientX;
      const startClientY = e.clientY;
      let hasMoved = false;
      let isCtrlDuplicateDrag = false;
      const clonedDragElements = new Map();
      const preMoveSnap = this.editor._captureNoteState(note.id);

      const initialPositions = new Map();
      movingIds.forEach((id) => {
        const nEl = nodeElements.get(id);
        if (nEl) {
          initialPositions.set(id, {
            x: parseFloat(nEl.style.left) || 0,
            y: parseFloat(nEl.style.top) || 0
          });
        }
      });

      const onMove = (ev) => {
        const dx = (ev.clientX - startClientX) / this.editor.scale;
        const dy = (ev.clientY - startClientY) / this.editor.scale;

        if (!hasMoved && Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) > 3) {
          hasMoved = true;
          isCtrlDuplicateDrag = Boolean(e.ctrlKey || e.metaKey || ev.ctrlKey || ev.metaKey);

          if (isCtrlDuplicateDrag) {
            viewport.classList.add("ctrl-duplicating");
            movingIds.forEach((id) => {
              const origEl = nodeElements.get(id);
              if (!origEl) return;
              const wasSelected = origEl.classList.contains("selected");
              origEl.classList.remove("selected");
              const ghostClone = origEl.cloneNode(true);
              ghostClone.classList.remove("root-node", "connected");
              if (wasSelected) {
                ghostClone.classList.add("selected");
              }
              ghostClone.querySelector(".fk-mm-root-icon")?.remove();
              ghostClone.style.zIndex = "28";
              world.appendChild(ghostClone);
              clonedDragElements.set(id, ghostClone);
            });
          } else {
            const movingSet = new Set(movingIds);
            svg.querySelectorAll("line").forEach((line) => {
              const f = line.dataset.from;
              const to = line.dataset.to;
              if (movingSet.has(f) || movingSet.has(to)) {
                line.style.display = "none";
                nodeElements.get(f)?.classList.add("pending-link");
                nodeElements.get(to)?.classList.add("pending-link");
              }
            });
          }
        }

        if (!hasMoved) return;

        movingIds.forEach((id) => {
          const orig = initialPositions.get(id);
          const targetEl = isCtrlDuplicateDrag ? clonedDragElements.get(id) : nodeElements.get(id);
          if (orig && targetEl) {
            const nx = Math.max(50, Math.min(3800, Math.round(orig.x + dx)));
            const ny = Math.max(50, Math.min(3800, Math.round(orig.y + dy)));
            targetEl.style.left = `${nx}px`;
            targetEl.style.top = `${ny}px`;
          }
        });
      };

      const onUp = (ev) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        viewport.classList.remove("ctrl-duplicating");
        viewport.classList.toggle("ctrl-pressed", Boolean(ev.ctrlKey || ev.metaKey));

        world.querySelectorAll(".fk-mm-node.pending-link").forEach((nEl) => nEl.classList.remove("pending-link"));

        if (!hasMoved) {
          if (e.shiftKey) {
            if (isNodeAlreadySelected && !addedByShiftOnDown) {
              this._lastSelectionToggleTime = Date.now();
              this.editor.toggleNodeSelection(node.id, true);
            }
          } else if (hadSelectionBefore) {
            this._lastSelectionToggleTime = Date.now();
            this.editor.toggleNodeSelection(node.id, true);
          }
          return;
        }

        if (isCtrlDuplicateDrag) {
          this.editor.pushCustomSnapshot(note.id, preMoveSnap);
          const cur = this.storage.getData();
          const targetNote = cur.notes.find((x) => x.id === note.id);
          const wasAnyMovedSelected = movingIds.some((id) => this.editor.selectedNodeIds.has(id));
          const newSelected = new Set();
          let nextLayer = this.nodesManager._getNextTopLayer(targetNote?.mindmap?.nodes || []);

          movingIds.forEach((id) => {
            const cloneEl = clonedDragElements.get(id);
            const origData = targetNote?.mindmap.nodes.find((x) => x.id === id);
            if (cloneEl && origData) {
              const newCopy = foundry.utils.deepClone(origData);
              newCopy.id = `node-${foundry.utils.randomID()}`;
              newCopy.x = parseFloat(cloneEl.style.left) || origData.x;
              newCopy.y = parseFloat(cloneEl.style.top) || origData.y;
              newCopy.layer = nextLayer++;
              targetNote.mindmap.nodes.push(newCopy);
              newSelected.add(newCopy.id);
            }
            cloneEl?.remove();
          });

          if (wasAnyMovedSelected) {
            this.editor.selectedNodeIds = newSelected;
            this.editor.selectionModeActive = true;
          }
          this.storage.markDirty(cur);
          redrawFn();
          return;
        }

        this.editor.pushCustomSnapshot(note.id, preMoveSnap);
        const cur = this.storage.getData();
        const targetNote = cur.notes.find((x) => x.id === note.id);
        movingIds.forEach((id) => {
          const nEl = nodeElements.get(id);
          const nData = targetNote?.mindmap.nodes.find((x) => x.id === id);
          if (nEl && nData) {
            nData.x = parseFloat(nEl.style.left) || nData.x;
            nData.y = parseFloat(nEl.style.top) || nData.y;
          }
        });
        this.storage.markDirty(cur);

        this.nodesManager.renderEdges(getNoteData, svg, nodeElements, canEdit, note.id, redrawFn);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });

    anchorEl.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = (parseFloat(el.style.left) || node.x) + ANCHOR_OFFSET;
      const startY = (parseFloat(el.style.top) || node.y) + ANCHOR_OFFSET;

      const preview = document.createElementNS("http://www.w3.org/2000/svg", "line");
      preview.classList.add("preview-line");
      preview.setAttribute("x1", startX);
      preview.setAttribute("y1", startY);
      preview.setAttribute("x2", startX);
      preview.setAttribute("y2", startY);
      svg.appendChild(preview);

      const onMove = (ev) => {
        const vpRect = viewport.getBoundingClientRect();
        const wx = (ev.clientX - vpRect.left - this.editor.panX) / this.editor.scale;
        const wy = (ev.clientY - vpRect.top - this.editor.panY) / this.editor.scale;
        preview.setAttribute("x2", wx);
        preview.setAttribute("y2", wy);
      };

      const onUp = (ev) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        preview.remove();

        const targetNodeEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".fk-mm-node");
        const targetNodeId = targetNodeEl?.dataset.nodeId;
        if (targetNodeId && targetNodeId !== node.id) {
          const cur = this.storage.getData();
          const targetNote = cur.notes.find((x) => x.id === note.id);
          const exists = targetNote.mindmap.edges.some(
            (ed) =>
              (ed.from === node.id && ed.to === targetNodeId) ||
              (ed.from === targetNodeId && ed.to === node.id)
          );
          if (!exists) {
            this.editor.pushHistorySnapshot(note.id);
            targetNote.mindmap.edges.push({ from: node.id, to: targetNodeId });
            this.storage.markDirty(cur);
            this.nodesManager.renderEdges(getNoteData, svg, nodeElements, canEdit, note.id, redrawFn);
          }
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });

    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.editor.showNodeContextMenu(
        e.clientX,
        e.clientY,
        note.id,
        node.id,
        isRootNode,
        el,
        redrawFn,
        centerCameraOnPoint,
        nodeElements
      );
    });
  }
}