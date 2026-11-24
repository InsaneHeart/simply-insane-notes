import {
  normalizeCrop,
  hasCrop,
  serializeCrop,
  startInlineImageCrop
} from "../shared/shared-image-cropper.js";
import { t } from "../shared/shared-i18n.js";
import { MindMapNodeRenderer } from "./mindmap-node-renderer.js";

export const CARD_COLORS = [
  { label: "Padrão", labelKey: "SIN.Colors.Default", border: "", bg: "" },
  { label: "Amarelo", labelKey: "SIN.Colors.Yellow", border: "#fef08a", bg: "#232512" },
  { label: "Azul", labelKey: "SIN.Colors.Blue", border: "#38bdf8", bg: "#162028" },
  { label: "Roxo", labelKey: "SIN.Colors.Purple", border: "#9b87f5", bg: "#1e1a29" },
  { label: "Verde", labelKey: "SIN.Colors.Green", border: "#22c55e", bg: "#15231b" },
  { label: "Laranja", labelKey: "SIN.Colors.Orange", border: "#f97316", bg: "#261b15" },
  { label: "Vermelho", labelKey: "SIN.Colors.Red", border: "#f43f5e", bg: "#26161b" }
];

const ANCHOR_OFFSET = 9;

export class MindMapNodes {
  constructor(editor) {
    this.editor = editor;
    this.app = editor.app;
    this.storage = editor.storage;
    this.renderer = new MindMapNodeRenderer(this);
  }

  getNodesSortedByLayer(nodes = []) {
    return nodes
      .map((node, index) => ({
        node,
        layer: typeof node.layer === "number" && !Number.isNaN(node.layer) ? node.layer : index,
        index
      }))
      .sort((a, b) => (a.layer !== b.layer ? a.layer - b.layer : a.index - b.index))
      .map((entry) => entry.node);
  }

  _getNextTopLayer(nodes = []) {
    if (!nodes.length) return 0;
    return (
      nodes.reduce((max, n, idx) => {
        const l = typeof n.layer === "number" && !Number.isNaN(n.layer) ? n.layer : idx;
        return Math.max(max, l);
      }, 0) + 1
    );
  }

  getNodesBoundingBox(target, nodeElements) {
    const nodes = target?.mindmap?.nodes || [];
    if (!nodes.length) {
      return { minX: 1920, minY: 1975, maxX: 2080, maxY: 2035, centerX: 2000, centerY: 2005 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach((n) => {
      const el = nodeElements.get(n.id);
      const w = el?.offsetWidth || n.renderedW || n.width || 170;
      const h = el?.offsetHeight || n.renderedH || (n.nodeType === "image" ? n.height || 210 : 54);

      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + w > maxX) maxX = n.x + w;
      if (n.y + h > maxY) maxY = n.y + h;
    });

    return {
      minX,
      minY,
      maxX,
      maxY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    };
  }

  findFreePosition(nodes, desiredX, desiredY, width = 175, height = 56, nodeElements = null) {
    let x = Math.max(50, Math.min(3800, Math.round(desiredX)));
    let y = Math.max(50, Math.min(3800, Math.round(desiredY)));
    const pad = 16;

    const overlapsAny = (cx, cy) => {
      for (const n of nodes) {
        const el = nodeElements?.get(n.id);
        const nw = el?.offsetWidth || n.renderedW || n.width || 175;
        const nh = el?.offsetHeight || n.renderedH || (n.nodeType === "image" ? n.height || 160 : 56);

        if (
          cx < n.x + nw + pad &&
          cx + width + pad > n.x &&
          cy < n.y + nh + pad &&
          cy + height + pad > n.y
        ) {
          return true;
        }
      }
      return false;
    };

    if (!overlapsAny(x, y)) {
      return { x, y };
    }

    const stepX = width + 28;
    const stepY = height + 24;
    for (let ring = 1; ring <= 8; ring++) {
      const candidates = [
        { x: x + stepX * ring, y },
        { x, y: y + stepY * ring },
        { x: x - stepX * ring, y },
        { x, y: y - stepY * ring },
        { x: x + stepX * ring, y: y + stepY * ring },
        { x: x - stepX * ring, y: y + stepY * ring }
      ];
      for (const cand of candidates) {
        const cx = Math.max(50, Math.min(3800, Math.round(cand.x)));
        const cy = Math.max(50, Math.min(3800, Math.round(cand.y)));
        if (!overlapsAny(cx, cy)) {
          return { x: cx, y: cy };
        }
      }
    }

    return { x: x + 36, y: y + 36 };
  }

  duplicateNodes(noteId, targetIdsSet, nodeElements, redraw) {
    if (!targetIdsSet || !targetIdsSet.size) return;
    this.editor.pushHistorySnapshot(noteId);

    const cur = this.storage.getData();
    const target = cur.notes.find((n) => n.id === noteId);
    if (!target?.mindmap?.nodes) return;

    const wasSelectedBefore = Array.from(targetIdsSet).some((id) => this.editor.selectedNodeIds.has(id));
    const newIds = new Set();
    let nextLayer = this._getNextTopLayer(target.mindmap.nodes);

    for (const id of targetIdsSet) {
      const orig = target.mindmap.nodes.find((n) => n.id === id);
      if (!orig) continue;

      const el = nodeElements?.get(id);
      const w = el?.offsetWidth || orig.renderedW || orig.width || 175;
      const h = el?.offsetHeight || orig.renderedH || (orig.nodeType === "image" ? orig.height || 160 : 56);
      const freePos = this.findFreePosition(target.mindmap.nodes, orig.x + 28, orig.y + 28, w, h, nodeElements);

      const copy = foundry.utils.deepClone(orig);
      copy.id = `node-${foundry.utils.randomID()}`;
      copy.x = freePos.x;
      copy.y = freePos.y;
      copy.layer = nextLayer++;

      target.mindmap.nodes.push(copy);
      newIds.add(copy.id);
    }

    if (newIds.size > 0) {
      if (wasSelectedBefore) {
        this.editor.selectedNodeIds = newIds;
        this.editor.selectionModeActive = true;
      }
      this.storage.markDirty(cur);
      redraw();
    }
  }

  createTextNodeAt(noteId, wx, wy, nodeElements, redraw) {
    this.editor.pushHistorySnapshot(noteId);
    const cur = this.storage.getData();
    const target = cur.notes.find((n) => n.id === noteId);
    if (!target) return;

    const pos = this.findFreePosition(target.mindmap.nodes, wx, wy, 170, 52, nodeElements);
    target.mindmap.nodes.push({
      id: `node-${foundry.utils.randomID()}`,
      nodeType: "text",
      x: pos.x,
      y: pos.y,
      title: t("SIN.MindMap.NewNodeTitle"),
      details: "",
      color: "",
      collapsed: false,
      layer: this._getNextTopLayer(target.mindmap.nodes)
    });
    this.storage.markDirty(cur);
    redraw();
  }

  openNativeImagePicker(noteId, wx, wy, nodeElements, redraw) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          this.addImageNodeToCanvas(noteId, ev.target.result, wx, wy, nodeElements, redraw);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  addImageNodeToCanvas(noteId, imageUrl, wx, wy, nodeElements, redraw, w = 210, h = 150, title = "") {
    this.editor.pushHistorySnapshot(noteId);
    const cur = this.storage.getData();
    const target = cur.notes.find((n) => n.id === noteId);
    if (!target) return;

    const pos = this.findFreePosition(target.mindmap.nodes, wx, wy, w, h, nodeElements);
    target.mindmap.nodes.push({
      id: `node-${foundry.utils.randomID()}`,
      nodeType: "image",
      imageUrl,
      width: w,
      height: h,
      x: pos.x,
      y: pos.y,
      title,
      details: "",
      color: "",
      collapsed: false,
      layer: this._getNextTopLayer(target.mindmap.nodes)
    });
    this.storage.markDirty(cur);
    redraw();
  }

  startCropImageNode(noteId, nodeId, nodeEl, redraw) {
    if (!nodeEl) return;

    const cur = this.storage.getData();
    const target = cur.notes.find((n) => n.id === noteId);
    const node = target?.mindmap?.nodes?.find((n) => n.id === nodeId);
    if (!node || node.nodeType !== "image") return;

    const frameEl = nodeEl.querySelector(".fk-img-crop-frame");
    const imgEl = nodeEl.querySelector("img");
    if (!frameEl || !imgEl) return;

    const initialCrop = normalizeCrop(node.crop);
    const oldFrameW = frameEl.offsetWidth || Math.max(78, (node.width || 210) - 14);
    const oldFrameH = frameEl.offsetHeight || 150;
    const padX = Math.max(0, (nodeEl.offsetWidth || node.width || 210) - oldFrameW);

    startInlineImageCrop({
      frameEl,
      imgEl,
      initialCrop,
      onCommit: ({ crop, metrics }) => {
        if (serializeCrop(crop) === serializeCrop(initialCrop)) return;

        this.editor.pushHistorySnapshot(noteId);
        const fresh = this.storage.getData();
        const tNote = fresh.notes.find((n) => n.id === noteId);
        const tNode = tNote?.mindmap?.nodes?.find((n) => n.id === nodeId);
        if (!tNode) return;

        if (crop) tNode.crop = crop;
        else delete tNode.crop;

        const nextFrameW = oldFrameW * (metrics?.widthRatio || 1);
        const nextWidth = Math.max(90, Math.min(600, Math.round(nextFrameW + padX)));
        const dxWorld = Math.round(oldFrameW * (metrics?.shiftXRatio || 0));
        const dyWorld = Math.round(oldFrameH * (metrics?.shiftYRatio || 0));

        tNode.x = Math.max(50, Math.min(3800, Math.round(tNode.x + dxWorld)));
        tNode.y = Math.max(50, Math.min(3800, Math.round(tNode.y + dyWorld)));
        tNode.width = nextWidth;

        this.storage.markDirty(fresh);
        redraw?.();
      }
    });
  }

  resetCropImageNode(noteId, nodeId, nodeEl, redraw) {
    const cur = this.storage.getData();
    const target = cur.notes.find((n) => n.id === noteId);
    const node = target?.mindmap?.nodes?.find((n) => n.id === nodeId);
    if (!node || node.nodeType !== "image") return;

    const oldCrop = normalizeCrop(node.crop);
    if (!hasCrop(oldCrop)) return;

    this.editor.pushHistorySnapshot(noteId);

    const frameEl = nodeEl?.querySelector(".fk-img-crop-frame");
    const oldFrameW = frameEl?.offsetWidth || Math.max(78, (node.width || 210) - 14);
    const oldFrameH = frameEl?.offsetHeight || 150;
    const padX = Math.max(0, (nodeEl?.offsetWidth || node.width || 210) - oldFrameW);

    const oldVisW = Math.max(0.08, 1 - oldCrop.left - oldCrop.right);
    const oldVisH = Math.max(0.08, 1 - oldCrop.top - oldCrop.bottom);

    const nextWidth = Math.max(90, Math.min(600, Math.round(oldFrameW / oldVisW + padX)));
    const dxWorld = Math.round(-(oldCrop.left / oldVisW) * oldFrameW);
    const dyWorld = Math.round(-(oldCrop.top / oldVisH) * oldFrameH);

    node.x = Math.max(50, Math.min(3800, Math.round(node.x + dxWorld)));
    node.y = Math.max(50, Math.min(3800, Math.round(node.y + dyWorld)));
    node.width = nextWidth;
    delete node.crop;

    this.storage.markDirty(cur);
    redraw?.();
  }

  promptAddLinkedNoteNode(noteId, wx, wy, nodeElements, redraw, anchorPoint = null) {
    this.editor.pickers.openNotePicker({
      excludeNoteId: noteId,
      anchorPoint,
      onSelect: (chosen) => {
        if (!chosen) return;

        const preview = this.storage.extractNotePreview(chosen.rawNote, 130);
        this.editor.pushHistorySnapshot(noteId);

        const cur = this.storage.getData();
        const currentNote = cur.notes.find((n) => n.id === noteId);
        if (!currentNote) return;

        const pos = this.findFreePosition(currentNote.mindmap.nodes, wx, wy, 190, 68, nodeElements);
        currentNote.mindmap.nodes.push({
          id: `node-${foundry.utils.randomID()}`,
          nodeType: "link",
          linkedNoteId: chosen.id,
          linkedOwnerId: chosen.ownerId || game.user.id,
          x: pos.x,
          y: pos.y,
          title: chosen.title,
          details: preview,
          collapsed: false,
          layer: this._getNextTopLayer(currentNote.mindmap.nodes)
        });
        this.storage.markDirty(cur);
        redraw();
      }
    });
  }

  promptAddUserNode(noteId, wx, wy, nodeElements, redraw, anchorPoint = null) {
    const curNote = this.storage.findAnyNoteById(noteId);
    this.editor.pickers.openUserPicker({
      note: curNote,
      anchorPoint,
      onSelect: (chosen) => {
        if (!chosen) return;

        this.editor.pushHistorySnapshot(noteId);
        const cur = this.storage.getData();
        const currentNote = cur.notes.find((n) => n.id === noteId);
        if (!currentNote) return;

        const pos = this.findFreePosition(currentNote.mindmap.nodes, wx, wy, 175, 44, nodeElements);
        currentNote.mindmap.nodes.push({
          id: `node-${foundry.utils.randomID()}`,
          nodeType: "user",
          linkedUserId: chosen.id,
          x: pos.x,
          y: pos.y,
          title: chosen.displayName,
          details: "",
          color: "",
          collapsed: false,
          layer: this._getNextTopLayer(currentNote.mindmap.nodes)
        });
        this.storage.markDirty(cur);
        redraw();
      }
    });
  }

  openUserSheet(userId) {
    const user = globalThis.game?.users?.get(userId);
    if (!user) {
      globalThis.ui?.notifications?.warn(t("SIN.MindMap.UserNotFound"));
      return;
    }

    const actor = user.character;
    if (!actor) {
      globalThis.ui?.notifications?.warn(t("SIN.MindMap.UserNoCharacter", { name: user.name }));
      return;
    }

    actor.sheet?.render(true);
  }

  async openShareForUserNode(noteId, userId, redraw) {
    const data = this.storage.getData();
    const ownNote = data.notes.find((n) => n.id === noteId);
    if (!ownNote) {
      globalThis.ui?.notifications?.warn(t("SIN.MindMap.OnlyOwnerCanShare"));
      return;
    }

    const saved = await this.storage.openShareSettingsDialog(noteId, {
      preselectUserId: userId
    });
    if (saved) {
      redraw?.();
    }
  }

  renderEdges(getNoteData, svg, nodeElements, canEdit, noteId, redraw) {
    const target = getNoteData();
    if (!target) return;

    svg.innerHTML = "";
    const nodes = target.mindmap?.nodes || [];
    const edges = target.mindmap?.edges || [];

    const connectedIds = new Set();

    edges.forEach((edge, idx) => {
      const from = nodes.find((n) => n.id === edge.from);
      const to = nodes.find((n) => n.id === edge.to);
      if (!from || !to) return;

      connectedIds.add(from.id);
      connectedIds.add(to.id);

      const x1 = from.x + ANCHOR_OFFSET;
      const y1 = from.y + ANCHOR_OFFSET;
      const x2 = to.x + ANCHOR_OFFSET;
      const y2 = to.y + ANCHOR_OFFSET;

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.dataset.from = edge.from;
      line.dataset.to = edge.to;
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);

      if (canEdit) {
        line.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.editor.showEdgeContextMenu(e.clientX, e.clientY, noteId, idx, redraw);
        });
      }

      svg.appendChild(line);
    });

    nodeElements.forEach((el, id) => {
      if (connectedIds.has(id)) el.classList.add("connected");
      else el.classList.remove("connected");
    });
  }

  _convertMissingLinkNode(node) {
    const deletedSuffix = t("SIN.Storage.DeletedNoteSuffix");
    node.nodeType = "text";
    delete node.linkedNoteId;
    delete node.linkedOwnerId;

    const rawTitle = String(node.title || t("SIN.Common.UntitledNote")).trim();
    if (!rawTitle.startsWith("#")) {
      node.title = `#${rawTitle}`;
    }

    const baseDetails = String(node.details || "").trim();
    if (!baseDetails) {
      node.details = deletedSuffix;
    } else if (!baseDetails.endsWith(deletedSuffix)) {
      node.details = `${baseDetails}\n\n${deletedSuffix}`;
    }
  }

  redraw(ctx) {
    return this.renderer.redraw(ctx, CARD_COLORS);
  }
}