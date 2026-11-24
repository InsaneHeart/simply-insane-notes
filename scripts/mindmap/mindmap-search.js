import { InNoteSearchBar } from "../shared/shared-in-note-search-bar.js";
import { t } from "../shared/shared-i18n.js";

function normalizeForSearch(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function buildNormalizedIndex(rawText) {
  let norm = "";
  const map = [];

  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];
    const clean = ch
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    for (let j = 0; j < clean.length; j++) {
      norm += clean[j];
      map.push(i);
    }
  }

  return { norm, map };
}

export class MindMapSearch {
  constructor(
    editor,
    { note, wrapper, nodeElements, getNoteData, canEdit = true, redraw, centerCameraOnPoint } = {}
  ) {
    this.editor = editor;
    this.app = editor.app;
    this.storage = editor.storage;
    this.note = note;
    this.wrapper = wrapper;
    this.nodeElements = nodeElements;
    this.getNoteData = getNoteData;
    this.canEdit = Boolean(canEdit);
    this.redraw = redraw;
    this.centerCameraOnPoint = centerCameraOnPoint;

    this.matches = [];
    this.currentIdx = -1;

    this.bar = new InNoteSearchBar(wrapper, {
      canReplace: this.canEdit,
      onSearch: (q) => this.search(q, { centerActive: true }),
      onNext: () => this.next(),
      onPrev: () => this.prev(),
      onReplace: (rep) => this.replaceCurrent(rep),
      onReplaceAll: (rep) => this.replaceAll(rep),
      onClose: () => this.clearHighlights()
    });
  }

  toggle({ showReplace = false } = {}) {
    this.bar.toggle({ showReplace });
  }

  openWithQuery(query = "", { showReplace = false } = {}) {
    this.bar.open({ query: String(query || ""), showReplace });
  }

  close() {
    this.bar.close();
  }

  destroy() {
    this.clearHighlights();
    this.bar.destroy();
  }

  /* ================= BUSCA ================= */

  search(rawQuery, { centerActive = true, preserveIdx = false } = {}) {
    this.clearHighlights();
    this.matches = [];

    const normQuery = normalizeForSearch(rawQuery).trim();
    if (!normQuery) {
      this.currentIdx = -1;
      this.bar.setCounter(-1, 0);
      return;
    }

    const target = this.getNoteData?.();
    const nodes = target?.mindmap?.nodes || [];

    const scanField = (node, field, rawText, replaceable) => {
      if (!rawText) return;
      const { norm, map } = buildNormalizedIndex(rawText);
      if (!norm) return;

      let pos = 0;
      while ((pos = norm.indexOf(normQuery, pos)) !== -1) {
        const startOrig = map[pos];
        const lastNormIdx = pos + normQuery.length - 1;
        let endOrig = map[lastNormIdx] + 1;
        while (endOrig < rawText.length && /[\u0300-\u036f]/.test(rawText[endOrig])) {
          endOrig++;
        }

        this.matches.push({
          nodeId: node.id,
          field,
          start: startOrig,
          end: endOrig,
          replaceable
        });
        pos += normQuery.length;
      }
    };

    for (const node of nodes) {
      const nType = node.nodeType || "text";
      if (nType === "text") {
        scanField(node, "title", node.title || "", true);
        scanField(node, "details", node.details || "", true);
      } else if (nType === "image") {
        scanField(node, "title", node.title || "", true);
      } else if (nType === "link" || nType === "user") {
        const elTitle = this.nodeElements?.get(node.id)?.querySelector(".fk-mm-node-title")?.textContent || node.title || "";
        scanField(node, "title", elTitle, false);
      }
    }

    if (!this.matches.length) {
      this.currentIdx = -1;
      this.bar.setCounter(-1, 0);
      return;
    }

    if (preserveIdx && this.currentIdx >= 0) {
      this.currentIdx = Math.min(this.currentIdx, this.matches.length - 1);
    } else {
      this.currentIdx = 0;
    }

    this.syncHighlights();
    this.bar.setCounter(this.currentIdx, this.matches.length);

    if (centerActive) {
      this._focusActiveNode();
    }
  }

  next() {
    if (!this.matches.length) return;
    this.currentIdx = (this.currentIdx + 1) % this.matches.length;
    this.syncHighlights();
    this.bar.setCounter(this.currentIdx, this.matches.length);
    this._focusActiveNode();
  }

  prev() {
    if (!this.matches.length) return;
    this.currentIdx = (this.currentIdx - 1 + this.matches.length) % this.matches.length;
    this.syncHighlights();
    this.bar.setCounter(this.currentIdx, this.matches.length);
    this._focusActiveNode();
  }

  /* ================= SUBSTITUIR ================= */

  replaceCurrent(replacement) {
    if (!this.canEdit || !this.matches.length || this.currentIdx < 0) return;

    const match = this.matches[this.currentIdx];
    if (!match.replaceable) {
      const nextIdx = this._findNextReplaceableIndex(this.currentIdx);
      if (nextIdx === -1) {
        globalThis.ui?.notifications?.info(t("SIN.MindMap.ReplaceReadOnlyOnly"));
        return;
      }
      this.currentIdx = nextIdx;
      this.syncHighlights();
      this.bar.setCounter(this.currentIdx, this.matches.length);
      this._focusActiveNode();
      return;
    }

    const rep = String(replacement ?? "");
    const cur = this.storage.getData();
    const tNote = cur.notes.find((n) => n.id === this.note.id);
    const tNode = tNote?.mindmap?.nodes?.find((n) => n.id === match.nodeId);
    if (!tNode) return;

    this.editor.pushHistorySnapshot(this.note.id);

    const raw = String(tNode[match.field] || "");
    tNode[match.field] = raw.slice(0, match.start) + rep + raw.slice(match.end);

    const isRoot = tNote.mindmap.nodes[0]?.id === tNode.id;
    if (isRoot && match.field === "title") {
      const uniqueTitle = this.storage.getUniqueNoteTitle(tNode.title.trim(), this.note.id);
      tNode.title = uniqueTitle;
      tNote.title = uniqueTitle;
      this.app.updateWindowTitle(uniqueTitle);
    }

    tNote.updatedAt = Date.now();
    this.storage.markDirty(cur);
    this.redraw?.();

    const prevIdx = this.currentIdx;
    this.search(this.bar.getQuery(), { centerActive: false });
    if (this.matches.length) {
      this.currentIdx = prevIdx % this.matches.length;
      this.syncHighlights();
      this.bar.setCounter(this.currentIdx, this.matches.length);
      this._focusActiveNode();
    }
  }

  replaceAll(replacement) {
    if (!this.canEdit || !this.matches.length) return;

    const replaceable = this.matches.filter((m) => m.replaceable);
    if (!replaceable.length) {
      globalThis.ui?.notifications?.info(t("SIN.MindMap.ReplaceNoneEditable"));
      return;
    }

    const rep = String(replacement ?? "");
    const cur = this.storage.getData();
    const tNote = cur.notes.find((n) => n.id === this.note.id);
    if (!tNote?.mindmap?.nodes) return;

    this.editor.pushHistorySnapshot(this.note.id);

    let rootTitleChanged = false;
    const rootId = tNote.mindmap.nodes[0]?.id;

    for (let i = replaceable.length - 1; i >= 0; i--) {
      const m = replaceable[i];
      const tNode = tNote.mindmap.nodes.find((n) => n.id === m.nodeId);
      if (!tNode) continue;
      const raw = String(tNode[m.field] || "");
      tNode[m.field] = raw.slice(0, m.start) + rep + raw.slice(m.end);
      if (m.nodeId === rootId && m.field === "title") {
        rootTitleChanged = true;
      }
    }

    if (rootTitleChanged && tNote.mindmap.nodes[0]) {
      const uniqueTitle = this.storage.getUniqueNoteTitle(
        tNote.mindmap.nodes[0].title.trim(),
        this.note.id
      );
      tNote.mindmap.nodes[0].title = uniqueTitle;
      tNote.title = uniqueTitle;
      this.app.updateWindowTitle(uniqueTitle);
    }

    tNote.updatedAt = Date.now();
    this.storage.markDirty(cur);
    this.redraw?.();

    this.search(this.bar.getQuery(), { centerActive: false });
    globalThis.ui?.notifications?.info(t("SIN.MindMap.ReplacedCount", { count: replaceable.length }));
  }

  /* ================= DESTAQUE E CÂMERA ================= */

  clearHighlights() {
    this.nodeElements?.forEach((el) => {
      el.classList.remove("fk-mm-find-match", "fk-mm-find-active");
    });
  }

  syncHighlights() {
    this.clearHighlights();
    if (!this.bar.isOpen || !this.matches.length) return;

    const matchedIds = new Set(this.matches.map((m) => m.nodeId));
    const activeId = this.matches[this.currentIdx]?.nodeId || null;

    matchedIds.forEach((id) => {
      const el = this.nodeElements?.get(id);
      if (!el) return;
      el.classList.add("fk-mm-find-match");
      if (id === activeId) el.classList.add("fk-mm-find-active");
    });
  }

  _focusActiveNode() {
    const active = this.matches[this.currentIdx];
    if (!active) return;

    const target = this.getNoteData?.();
    const node = target?.mindmap?.nodes?.find((n) => n.id === active.nodeId);
    if (!node) return;

    const el = this.nodeElements?.get(node.id);
    const w = el?.offsetWidth || node.renderedW || node.width || 170;
    const h = el?.offsetHeight || node.renderedH || 54;
    this.centerCameraOnPoint?.(node.x + w / 2, node.y + h / 2);
  }

  _findNextReplaceableIndex(fromIdx) {
    for (let step = 1; step <= this.matches.length; step++) {
      const idx = (fromIdx + step) % this.matches.length;
      if (this.matches[idx].replaceable) return idx;
    }
    return -1;
  }
}