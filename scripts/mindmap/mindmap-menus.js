import { CARD_COLORS } from "./mindmap-nodes.js";
import { hasCrop, normalizeCrop } from "../shared/shared-image-cropper.js";
import { t } from "../shared/shared-i18n.js";

export class MindMapMenus {
  constructor(editor) {
    this.editor = editor;
    this.app = editor.app;
    this.storage = editor.storage;
  }

  get selection() {
    return this.editor.selection;
  }

  showNodeContextMenu(x, y, noteId, nodeId, isRootNode, nodeEl, redraw, centerCameraOnPointFn, nodeElements) {
    const cur = this.storage.getData();
    const target = cur.notes.find((n) => n.id === noteId);
    const node = target?.mindmap.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const isNodeSelected = this.selection.selectedNodeIds.has(nodeId);
    const targetIds = isNodeSelected ? new Set(this.selection.selectedNodeIds) : new Set([nodeId]);
    const nType = node.nodeType || "text";
    const hasDetails =
      (nType === "text" && Boolean(node.details?.trim())) ||
      (nType === "link" && Boolean(nodeEl?.querySelector(".fk-mm-node-details")?.textContent?.trim()));

    const hasConnections = (target?.mindmap?.edges || []).some(
      (ed) => targetIds.has(ed.from) || targetIds.has(ed.to)
    );

    const selectNodeHtml = `
      <div class="fk-menu-item" data-act="select-node">
        <i class="fas ${isNodeSelected && this.selection.selectionModeActive ? "fa-check-square" : "fa-check-circle"}" style="color:#a78bfa;"></i>
        ${isNodeSelected && this.selection.selectionModeActive ? t("SIN.MindMap.UnselectNode") : t("SIN.MindMap.SelectNode")}
      </div>
    `;

    const duplicateLabel =
      targetIds.size > 1
        ? t("SIN.MindMap.DuplicateNodes", { count: targetIds.size })
        : t("SIN.MindMap.DuplicateNode");
    const duplicateHtml = `<div class="fk-menu-item" data-act="duplicate-node"><i class="fas fa-copy"></i> ${duplicateLabel}</div>`;

    const textExtraHtml =
      nType === "text"
        ? `<div class="fk-menu-item" data-act="edit-description"><i class="fas fa-align-left"></i> ${node.details?.trim() ? t("SIN.MindMap.EditDescription") : t("SIN.MindMap.AddDescription")}</div>`
        : "";

    const makeMainNoteHtml =
      nType === "text" && !isRootNode
        ? `<div class="fk-menu-item" data-act="make-root-node"><i class="fas fa-crown" style="color:#facc15;"></i> ${t("SIN.MindMap.MakeRootNode")}</div>`
        : "";

    const imageHasCrop = nType === "image" && hasCrop(normalizeCrop(node.crop));
    const imageExtraHtml =
      nType === "image"
        ? `
          <div class="fk-menu-item" data-act="crop-img"><i class="fas fa-crop-alt"></i> ${t("SIN.MindMap.CropImage")}</div>
          ${imageHasCrop ? `<div class="fk-menu-item" data-act="reset-crop-img"><i class="fas fa-expand"></i> ${t("SIN.MindMap.ResetCrop")}</div>` : ""}
          <div class="fk-menu-item" data-act="edit-img-title"><i class="fas fa-heading"></i> ${t("SIN.MindMap.EditImageTitle")}</div>
        `
        : "";

    const linkExtraHtml =
      nType === "link"
        ? `<div class="fk-menu-item" data-act="open-linked"><i class="fas fa-external-link-alt"></i> ${t("SIN.MindMap.OpenLinkedNote")}</div>`
        : "";

    let userExtraHtml = "";
    if (nType === "user") {
      const access = this.storage.getUserAccessLevel?.(target, node.linkedUserId) || "none";
      const shareItem =
        access !== "creator"
          ? `<div class="fk-menu-item" data-act="share-with-user"><i class="fas fa-share-alt"></i> ${access === "shared" ? t("SIN.MindMap.ManageSharing") : t("SIN.MindMap.ShareWithPlayer")}</div>`
          : "";
      userExtraHtml = `
        <div class="fk-menu-item" data-act="open-user-sheet"><i class="fas fa-id-card"></i> ${t("SIN.MindMap.OpenSheet")}</div>
        ${shareItem}
      `;
    }

    const colorSubmenuHtml =
      nType !== "link" && nType !== "user"
        ? `
          <div class="fk-menu-item has-submenu">
            <span style="display:flex; align-items:center; gap:8px;"><i class="fas fa-palette"></i> ${t("SIN.MindMap.CardColorMenu")}</span>
            <i class="fas fa-caret-right" style="opacity:0.6;"></i>
            <div class="fk-submenu">
              <div class="fk-color-row">
                <span class="fk-color-row-label">${t("SIN.MindMap.CardColorLabel")}</span>
                <div class="fk-color-swatches">
                  ${CARD_COLORS.map(
                    (c) =>
                      `<button type="button" class="fk-color-swatch" data-card-color="${c.border}" style="background:${c.border || (isRootNode ? "#d4af37" : "#52525b")};" title="${c.labelKey ? t(c.labelKey) : c.label}"></button>`
                  ).join("")}
                </div>
              </div>
            </div>
          </div>
        `
        : "";

    const toggleLabel = node.collapsed ? t("SIN.MindMap.ShowPreview") : t("SIN.MindMap.HidePreview");
    const toggleIcon = node.collapsed ? "fa-eye" : "fa-eye-slash";

    const rootId = target?.mindmap?.nodes?.[0]?.id;
    const deletableCount = Array.from(targetIds).filter((id) => id !== rootId).length;
    const deleteLabel =
      deletableCount > 1
        ? t("SIN.MindMap.DeleteNodes", { count: deletableCount })
        : t("SIN.MindMap.DeleteNode");

    const html = `
      ${linkExtraHtml}
      ${userExtraHtml}
      ${selectNodeHtml}
      ${duplicateHtml}
      <div class="fk-menu-sep"></div>
      ${textExtraHtml}
      ${makeMainNoteHtml}
      ${imageExtraHtml}
      ${colorSubmenuHtml}
      ${
        hasDetails
          ? `<div class="fk-menu-item" data-act="toggle-details"><i class="fas ${toggleIcon}"></i> ${toggleLabel}</div>`
          : ""
      }
      <div class="fk-menu-sep"></div>
      <div class="fk-menu-item" data-act="bring-to-front"><i class="fas fa-level-up-alt"></i> ${t("SIN.MindMap.BringToFront")}</div>
      <div class="fk-menu-item" data-act="send-to-back"><i class="fas fa-level-down-alt"></i> ${t("SIN.MindMap.SendToBack")}</div>
      ${
        hasConnections
          ? `<div class="fk-menu-item" data-act="clear-node-edges"><i class="fas fa-unlink"></i> ${t("SIN.MindMap.ClearConnections")}</div>`
          : ""
      }
      <div class="fk-menu-item" data-act="center-this-node"><i class="fas fa-bullseye"></i> ${t("SIN.MindMap.CenterThisNode")}</div>
      ${
        deletableCount > 0
          ? `<div class="fk-menu-sep"></div><div class="fk-menu-item danger" data-act="del-node"><i class="fas fa-trash"></i> ${deleteLabel}</div>`
          : ""
      }
    `;

    this.app.openMenu("mm-node-ctx", x, y, html, (menu) => {
      menu.onmousedown = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const colorSwatch = e.target.closest("[data-card-color]");
        if (colorSwatch) {
          this.app.closeMenu();
          this.editor.pushHistorySnapshot(noteId);
          const fresh = this.storage.getData();
          const tNote = fresh.notes.find((n) => n.id === noteId);
          tNote?.mindmap?.nodes?.forEach((n) => {
            if (targetIds.has(n.id) && n.nodeType !== "link" && n.nodeType !== "user") {
              n.color = colorSwatch.dataset.cardColor;
            }
          });
          this.storage.markDirty(fresh);
          redraw();
          return;
        }

        const item = e.target.closest(".fk-menu-item[data-act]");
        if (!item) return;
        this.app.closeMenu();

        const act = item.dataset.act;
        if (act === "select-node") {
          if (!this.selection.selectionModeActive) {
            this.selection.selectedNodeIds.clear();
            this.selection.selectedNodeIds.add(nodeId);
            this.selection.selectionModeActive = true;
            this.selection.syncSelectionDOM();
          } else {
            this.selection.toggleNodeSelection(nodeId, true);
          }
          return;
        }

        if (act === "duplicate-node") {
          this.editor.nodesManager.duplicateNodes(noteId, targetIds, nodeElements, redraw);
          return;
        }

        if (act === "crop-img") {
          this.editor.nodesManager.startCropImageNode(noteId, nodeId, nodeEl, redraw);
          return;
        }

        if (act === "reset-crop-img") {
          this.editor.nodesManager.resetCropImageNode(noteId, nodeId, nodeEl, redraw);
          return;
        }

        const fresh = this.storage.getData();
        const tNote = fresh.notes.find((n) => n.id === noteId);
        const tNode = tNote?.mindmap.nodes.find((n) => n.id === nodeId);
        if (!tNode) return;

        if (act === "open-linked" && tNode.linkedNoteId) {
          this.app.openNote(tNode.linkedNoteId, tNode.linkedOwnerId || null);
        } else if (act === "open-user-sheet" && tNode.linkedUserId) {
          this.editor.nodesManager.openUserSheet(tNode.linkedUserId);
        } else if (act === "share-with-user" && tNode.linkedUserId) {
          await this.editor.nodesManager.openShareForUserNode(noteId, tNode.linkedUserId, redraw);
        } else if (act === "edit-description") {
          this.editor.pushHistorySnapshot(noteId);
          tNode.collapsed = false;
          this.storage.markDirty(fresh);
          const detailsEl = nodeEl?.querySelector(".fk-mm-node-details");
          if (detailsEl) {
            nodeEl.classList.remove("collapsed", "has-collapsed-icon");
            nodeEl.querySelector(".fk-mm-collapsed-icon")?.remove();
            detailsEl.style.display = "block";
            detailsEl.contentEditable = "true";
            detailsEl.focus();
            const r = document.createRange();
            r.selectNodeContents(detailsEl);
            r.collapse(false);
            const s = window.getSelection();
            s.removeAllRanges();
            s.addRange(r);
          }
        } else if (act === "make-root-node" && (tNode.nodeType || "text") === "text") {
          this.editor.pushHistorySnapshot(noteId);
          const allNodes = tNote.mindmap.nodes;
          const orderedByLayer = this.editor.nodesManager.getNodesSortedByLayer(allNodes);
          orderedByLayer.forEach((n, idx) => {
            n.layer = idx;
          });

          const idxInArray = allNodes.findIndex((n) => n.id === nodeId);
          if (idxInArray > 0) {
            const [promoted] = allNodes.splice(idxInArray, 1);
            allNodes.unshift(promoted);

            const rawTitle = (promoted.title || "").trim() || t("SIN.Common.NewNote");
            const uniqueTitle = this.storage.getUniqueNoteTitle(rawTitle, noteId);
            promoted.title = uniqueTitle;
            tNote.title = uniqueTitle;
            tNote.updatedAt = Date.now();

            this.storage.saveNow(fresh);
            this.app.updateWindowTitle(uniqueTitle);
            redraw();
          }
        } else if (act === "bring-to-front" || act === "send-to-back") {
          this.editor.pushHistorySnapshot(noteId);
          const allNodes = tNote.mindmap.nodes || [];
          const orderedByLayer = this.editor.nodesManager.getNodesSortedByLayer(allNodes);
          const stationary = orderedByLayer.filter((n) => !targetIds.has(n.id));
          const moving = orderedByLayer.filter((n) => targetIds.has(n.id));
          const reordered = act === "bring-to-front" ? [...stationary, ...moving] : [...moving, ...stationary];
          reordered.forEach((n, idx) => {
            n.layer = idx;
          });
          this.storage.markDirty(fresh);
          redraw();
        } else if (act === "clear-node-edges") {
          this.editor.pushHistorySnapshot(noteId);
          tNote.mindmap.edges = (tNote.mindmap.edges || []).filter(
            (ed) => !targetIds.has(ed.from) && !targetIds.has(ed.to)
          );
          this.storage.markDirty(fresh);
          redraw();
        } else if (act === "edit-img-title") {
          const titleEl = nodeEl?.querySelector(".fk-mm-node-title");
          if (titleEl) {
            titleEl.style.display = "block";
            titleEl.contentEditable = "true";
            titleEl.focus();
          }
        } else if (act === "toggle-details") {
          this.editor.pushHistorySnapshot(noteId);
          tNode.collapsed = !tNode.collapsed;
          this.storage.markDirty(fresh);
          redraw();
        } else if (act === "center-this-node") {
          this.editor.pushHistorySnapshot(noteId);
          const w = nodeEl?.offsetWidth || tNode.width || 170;
          const h = nodeEl?.offsetHeight || tNode.height || 54;
          tNode.x = Math.round(2000 - w / 2);
          tNode.y = Math.round(2000 - h / 2);
          this.storage.markDirty(fresh);
          redraw();
          centerCameraOnPointFn(2000, 2000);
        } else if (act === "del-node") {
          await this.selection.deleteNodesByIds(noteId, targetIds, redraw);
        }
      };
    });
  }

  showEdgeContextMenu(x, y, noteId, edgeIndex, redraw) {
    const html = `
      <div class="fk-menu-item danger" data-act="del-edge"><i class="fas fa-unlink"></i> ${t("SIN.MindMap.RemoveConnection")}</div>
    `;
    this.app.openMenu("mm-edge-ctx", x, y, html, (menu) => {
      menu.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = e.target.closest(".fk-menu-item");
        if (!item) return;
        this.app.closeMenu();

        this.editor.pushHistorySnapshot(noteId);
        const cur = this.storage.getData();
        const target = cur.notes.find((n) => n.id === noteId);
        if (target) {
          target.mindmap.edges.splice(edgeIndex, 1);
          this.storage.markDirty(cur);
          redraw();
        }
      };
    });
  }

  showCanvasContextMenu(x, y, noteId, wx, wy, nodeElements, redraw, centerCameraFn, getBoundingBoxFn, isLockedOrReadOnly) {
    const clearSelHtml =
      !isLockedOrReadOnly && this.selection.selectionModeActive && this.selection.selectedNodeIds.size > 0
        ? `<div class="fk-menu-sep"></div><div class="fk-menu-item" data-act="clear-sel"><i class="fas fa-times-circle"></i> ${t("SIN.Manager.ClearSelectionCount", { count: this.selection.selectedNodeIds.size })}</div>`
        : "";

    const html = isLockedOrReadOnly
      ? `<div class="fk-menu-item" data-act="center-view"><i class="fas fa-crosshairs"></i> ${t("SIN.MindMap.CenterView")}</div>`
      : `
        <div class="fk-menu-item" data-act="add-node"><i class="fas fa-plus"></i> ${t("SIN.MindMap.CreateNodeHere")}</div>
        <div class="fk-menu-item" data-act="add-image"><i class="fas fa-image"></i> ${t("SIN.MindMap.AddImage")}</div>
        <div class="fk-menu-item" data-act="link-note"><i class="fas fa-link"></i> ${t("SIN.MindMap.MentionNote")}</div>
        <div class="fk-menu-item" data-act="link-user"><i class="fas fa-user-tag"></i> ${t("SIN.MindMap.MentionPlayer")}</div><div class="fk-menu-sep"></div>
        <div class="fk-menu-item" data-act="center-view"><i class="fas fa-crosshairs"></i> ${t("SIN.MindMap.CenterView")}</div>
        <div class="fk-menu-item" data-act="center-nodes"><i class="fas fa-compress-arrows-alt"></i> ${t("SIN.MindMap.CenterNodesOnBoard")}</div>
        ${clearSelHtml}
      `;

    this.app.openMenu("mm-canvas-ctx", x, y, html, (menu) => {
      menu.onmousedown = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = e.target.closest(".fk-menu-item");
        if (!item) return;
        this.app.closeMenu();

        if (item.dataset.act === "add-node") {
          this.editor.nodesManager.createTextNodeAt(noteId, wx, wy, nodeElements, redraw);
        } else if (item.dataset.act === "add-image") {
          this.editor.nodesManager.openNativeImagePicker(noteId, wx, wy, nodeElements, redraw);
        } else if (item.dataset.act === "link-note") {
          this.editor.nodesManager.promptAddLinkedNoteNode(noteId, wx, wy, nodeElements, redraw, { x, y });
        } else if (item.dataset.act === "link-user") {
          this.editor.nodesManager.promptAddUserNode(noteId, wx, wy, nodeElements, redraw, { x, y });
        } else if (item.dataset.act === "center-view") {
          centerCameraFn();
        } else if (item.dataset.act === "center-nodes") {
          const box = getBoundingBoxFn();
          const cur = this.storage.getData();
          const target = cur.notes.find((n) => n.id === noteId);
          const nodes = target?.mindmap?.nodes || [];
          if (nodes.length) {
            this.editor.pushHistorySnapshot(noteId);
            const dx = 2000 - box.centerX;
            const dy = 2000 - box.centerY;
            nodes.forEach((n) => {
              n.x = Math.round(n.x + dx);
              n.y = Math.round(n.y + dy);
            });
            this.storage.markDirty(cur);
            redraw();
            centerCameraFn();
          }
        } else if (item.dataset.act === "clear-sel") {
          this.selection.clearSelection();
        }
      };
    });
  }
}