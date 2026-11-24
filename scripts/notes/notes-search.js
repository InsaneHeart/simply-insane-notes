import { InNoteSearchBar } from "../shared/shared-in-note-search-bar.js";
import { t } from "../shared/shared-i18n.js";

const HIGHLIGHT_ALL_KEY = "fk-find-all";
const HIGHLIGHT_ACTIVE_KEY = "fk-find-active";

const EXCLUDED_ANCESTORS =
  ".fk-note-link, .fk-mention, .fk-img-block, .fk-divider-block, .fk-box-note-header, .fk-box-drawer-toggle, .fk-box-quote-mark, .fk-box-quote-dash, .fk-box-code-copy";

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

export class EditorSearch {
  constructor(editor, { wrapper, scrollEl, canEdit = true } = {}) {
    this.editor = editor;
    this.wrapper = wrapper;
    this.scrollEl = scrollEl;
    this.canEdit = Boolean(canEdit);

    this.matches = [];
    this.currentIdx = -1;
    this._recheckTimer = null;

    this.bar = new InNoteSearchBar(wrapper, {
      canReplace: this.canEdit,
      onSearch: (q) => this.search(q, { scrollToFirst: true }),
      onNext: () => this.next(),
      onPrev: () => this.prev(),
      onReplace: (rep) => this.replaceCurrent(rep),
      onReplaceAll: (rep) => this.replaceAll(rep),
      onClose: () => this.clearHighlights()
    });

    this._onBodyInput = () => {
      if (!this.bar.isOpen) return;
      if (this._recheckTimer) clearTimeout(this._recheckTimer);
      this._recheckTimer = setTimeout(() => {
        this._recheckTimer = null;
        if (this.bar.isOpen) {
          this.search(this.bar.getQuery(), { scrollToFirst: false, preserveIdx: true });
        }
      }, 120);
    };

    this.editor?.body?.addEventListener("input", this._onBodyInput);
  }

  toggle({ showReplace = false } = {}) {
    const selectedText = this._getSelectedSearchSeed();
    this.bar.toggle({
      showReplace,
      initialQuery: selectedText
    });
  }

  openWithQuery(query = "", { showReplace = false } = {}) {
    this.bar.open({ query: String(query || ""), showReplace });
  }

  close() {
    this.bar.close();
  }

  destroy() {
    if (this._recheckTimer) {
      clearTimeout(this._recheckTimer);
      this._recheckTimer = null;
    }
    this.editor?.body?.removeEventListener("input", this._onBodyInput);
    this.clearHighlights();
    this.bar.destroy();
  }

  search(rawQuery, { scrollToFirst = true, preserveIdx = false } = {}) {
    this.clearHighlights();
    this.matches = [];

    const normQuery = normalizeForSearch(rawQuery).trim();
    if (!normQuery || !this.editor?.body) {
      this.currentIdx = -1;
      this.bar.setCounter(-1, 0);
      return;
    }

    const textNodes = this._collectSearchableTextNodes();
    for (const node of textNodes) {
      const raw = node.textContent || "";
      if (!raw) continue;

      const { norm, map } = buildNormalizedIndex(raw);
      if (!norm) continue;

      let pos = 0;
      while ((pos = norm.indexOf(normQuery, pos)) !== -1) {
        const startOrig = map[pos];
        const lastNormIdx = pos + normQuery.length - 1;
        let endOrig = map[lastNormIdx] + 1;
        while (endOrig < raw.length && /[\u0300-\u036f]/.test(raw[endOrig])) {
          endOrig++;
        }

        const range = document.createRange();
        range.setStart(node, startOrig);
        range.setEnd(node, endOrig);

        this.matches.push({ node, start: startOrig, end: endOrig, range });
        pos += normQuery.length;
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

    this._paintHighlights();
    this.bar.setCounter(this.currentIdx, this.matches.length);

    if (scrollToFirst) {
      this._revealMatch(this.matches[this.currentIdx]);
    }
  }

  next() {
    if (!this.matches.length) return;
    this.currentIdx = (this.currentIdx + 1) % this.matches.length;
    this._paintHighlights();
    this.bar.setCounter(this.currentIdx, this.matches.length);
    this._revealMatch(this.matches[this.currentIdx]);
  }

  prev() {
    if (!this.matches.length) return;
    this.currentIdx = (this.currentIdx - 1 + this.matches.length) % this.matches.length;
    this._paintHighlights();
    this.bar.setCounter(this.currentIdx, this.matches.length);
    this._revealMatch(this.matches[this.currentIdx]);
  }

  replaceCurrent(replacement) {
    if (!this.canEdit || !this.matches.length || this.currentIdx < 0) return;

    const match = this.matches[this.currentIdx];
    if (!match?.node?.isConnected) {
      this.search(this.bar.getQuery(), { scrollToFirst: false, preserveIdx: true });
      return;
    }

    const rep = String(replacement ?? "");
    const raw = match.node.textContent || "";
    match.node.textContent = raw.slice(0, match.start) + rep + raw.slice(match.end);

    this.editor.refresh();
    this.editor.spellcheck?.scheduleCheck?.();
    this.editor.notifyChange({ immediate: false });

    const prevIdx = this.currentIdx;
    this.search(this.bar.getQuery(), { scrollToFirst: false });

    if (this.matches.length) {
      this.currentIdx = prevIdx % this.matches.length;
      this._paintHighlights();
      this.bar.setCounter(this.currentIdx, this.matches.length);
      this._revealMatch(this.matches[this.currentIdx]);
    }
  }

  replaceAll(replacement) {
    if (!this.canEdit || !this.matches.length) return;

    const rep = String(replacement ?? "");
    const count = this.matches.length;

    for (let i = this.matches.length - 1; i >= 0; i--) {
      const m = this.matches[i];
      if (!m?.node?.isConnected) continue;
      const raw = m.node.textContent || "";
      m.node.textContent = raw.slice(0, m.start) + rep + raw.slice(m.end);
    }

    this.editor.refresh();
    this.editor.spellcheck?.scheduleCheck?.();
    this.editor.notifyChange({ immediate: false });

    this.search(this.bar.getQuery(), { scrollToFirst: false });
    globalThis.ui?.notifications?.info(t("SIN.MindMap.ReplacedCount", { count }));
  }

  clearHighlights() {
    if (typeof CSS !== "undefined" && CSS.highlights) {
      CSS.highlights.delete(HIGHLIGHT_ALL_KEY);
      CSS.highlights.delete(HIGHLIGHT_ACTIVE_KEY);
    }
  }

  _paintHighlights() {
    if (typeof CSS === "undefined" || !CSS.highlights || typeof Highlight === "undefined") {
      return;
    }

    const allRanges = [];
    let activeRange = null;

    this.matches.forEach((m, idx) => {
      if (!m?.node?.isConnected) return;
      if (idx === this.currentIdx) activeRange = m.range;
      else allRanges.push(m.range);
    });

    if (allRanges.length) {
      CSS.highlights.set(HIGHLIGHT_ALL_KEY, new Highlight(...allRanges));
    } else {
      CSS.highlights.delete(HIGHLIGHT_ALL_KEY);
    }

    if (activeRange) {
      CSS.highlights.set(HIGHLIGHT_ACTIVE_KEY, new Highlight(activeRange));
    } else {
      CSS.highlights.delete(HIGHLIGHT_ACTIVE_KEY);
    }
  }

  _revealMatch(match) {
    if (!match?.node?.isConnected) return;

    const parentEl = match.node.parentElement;

    const drawer = parentEl?.closest?.(".fk-box-drawer");
    if (drawer && !drawer.classList.contains("is-open") && parentEl.closest(".fk-box-drawer-body")) {
      drawer.classList.add("is-open");
      this.editor.images?.updateLayout?.();
    }

    const quote = parentEl?.closest?.(".fk-box-quote");
    if (quote && parentEl.closest(".fk-box-quote-author")) {
      quote.classList.add("is-editing");
    }

    if (!this.scrollEl) return;

    const rangeRect = match.range.getBoundingClientRect();
    const scrollRect = this.scrollEl.getBoundingClientRect();
    if (!rangeRect || (!rangeRect.width && !rangeRect.height)) return;

    const topOffset = rangeRect.top - scrollRect.top;
    const margin = 72;

    if (topOffset < margin || topOffset > scrollRect.height - margin) {
      const targetTop =
        this.scrollEl.scrollTop + topOffset - scrollRect.height / 2 + rangeRect.height / 2;
      this.scrollEl.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth"
      });
    }
  }

  _collectSearchableTextNodes() {
    const body = this.editor?.body;
    if (!body) return [];

    const nodes = [];
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest(EXCLUDED_ANCESTORS)) return NodeFilter.FILTER_REJECT;
        if (!node.textContent || !node.textContent.replace(/\u200B/g, "").length) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    return nodes;
  }

  _getSelectedSearchSeed() {
    const body = this.editor?.body;
    const sel = window.getSelection();
    if (!body || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

    const range = sel.getRangeAt(0);
    if (!body.contains(range.commonAncestorContainer)) return null;

    const text = sel.toString().trim();
    if (!text || text.length > 60 || /[\r\n]/.test(text)) return null;
    return text;
  }
}