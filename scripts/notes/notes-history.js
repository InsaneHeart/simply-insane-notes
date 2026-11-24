const MAX_HISTORY_STEPS = 80;
const TYPING_IDLE_MS = 450;
const WORD_BOUNDARY_RE = /[\s.,;:!?()[\]{}"'\/\\-]/;

export class EditorHistory {
  constructor(editor) {
    this.editor = editor;
    this.body = null;
    this.canEdit = true;

    this._stack = [];
    this._index = -1;
    this._isRestoring = false;
    this._pendingTimer = null;
    this._pendingDirty = false;
    this._lastInputGroup = null; // "insert" | "delete" | null
  }

  get isRestoring() {
    return this._isRestoring;
  }

  /* ================= CONEXÃO ================= */

  attach(body, { canEdit = true } = {}) {
    this._clearPendingTimer();
    this.body = body;
    this.canEdit = canEdit;
    this._stack = [];
    this._index = -1;
    this._pendingDirty = false;
    this._lastInputGroup = null;

    if (!canEdit) return;

    body.addEventListener("keydown", (e) => this._onKeyDown(e), true);
    body.addEventListener("beforeinput", (e) => this._onBeforeInput(e), true);
    body.addEventListener("mousedown", () => this.flushPending(), true);
    body.addEventListener("contextmenu", () => this.flushPending(), true);
  }

  reset() {
    this._clearPendingTimer();
    this._pendingDirty = false;
    this._lastInputGroup = null;
    if (!this.body) return;

    const snap = this._captureSnapshot();
    this._stack = [snap];
    this._index = 0;
  }

  /* ================= REGISTRO DE PASSOS ================= */

  handleInput(inputEvent = null) {
    if (!this.canEdit || !this.body || this._isRestoring) return;

    const inputType = inputEvent?.inputType || "";
    const data = inputEvent?.data ?? "";

    // Inserção de texto simples: agrupa por palavra
    if (inputType === "insertText" || inputType === "insertCompositionText") {
      if (this._lastInputGroup === "delete") {
        this.flushPending();
      }

      if (data && WORD_BOUNDARY_RE.test(data)) {
        this._commitCurrentState();
        this._lastInputGroup = null;
        return;
      }

      this._lastInputGroup = "insert";
      this._schedulePendingCommit();
      return;
    }

    // Deleção contínua (Backspace / Delete): agrupa em blocos curtos
    if (inputType === "deleteContentBackward" || inputType === "deleteContentForward") {
      if (this._lastInputGroup === "insert") {
        this.flushPending();
      }
      this._lastInputGroup = "delete";
      this._schedulePendingCommit();
      return;
    }

    // Qualquer outra entrada (Enter, colar, recortar, etc.): passo imediato
    this._commitCurrentState();
    this._lastInputGroup = null;
  }

  recordImmediate() {
    if (!this.canEdit || !this.body || this._isRestoring) return;
    this._clearPendingTimer();
    this._pendingDirty = false;
    this._lastInputGroup = null;
    this._commitCurrentState();
  }

  flushPending() {
    if (!this.canEdit || !this.body || this._isRestoring) return;
    if (!this._pendingDirty && !this._pendingTimer) return;
    this._clearPendingTimer();
    this._pendingDirty = false;
    this._lastInputGroup = null;
    this._commitCurrentState();
  }

  /* ================= UNDO / REDO ================= */

  undo() {
    if (!this.canEdit || !this.body) return false;
    this.flushPending();

    if (this._index <= 0) return false;
    this._index -= 1;
    this._restoreSnapshot(this._stack[this._index]);
    return true;
  }

  redo() {
    if (!this.canEdit || !this.body) return false;
    this._clearPendingTimer();
    this._pendingDirty = false;
    this._lastInputGroup = null;

    if (this._index >= this._stack.length - 1) return false;
    this._index += 1;
    this._restoreSnapshot(this._stack[this._index]);
    return true;
  }

  /* ================= EVENTOS ================= */

  _onKeyDown(e) {
    if (!this.canEdit || e.altKey) return;
    if (!(e.ctrlKey || e.metaKey)) return;

    const key = e.key.toLowerCase();

    if (key === "z") {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }

    if (key === "y" && !e.shiftKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.redo();
      return;
    }

    // Antes de atalhos de edição (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+V, Ctrl+X, etc.), fecha a palavra pendente
    if (["b", "i", "u", "v", "x", "k"].includes(key)) {
      this.flushPending();
    }
  }

  _onBeforeInput(e) {
    if (!this.canEdit) return;
    if (e.inputType === "historyUndo") {
      e.preventDefault();
      this.undo();
    } else if (e.inputType === "historyRedo") {
      e.preventDefault();
      this.redo();
    }
  }

  /* ================= SNAPSHOTS ================= */

  _schedulePendingCommit() {
    this._pendingDirty = true;
    this._clearPendingTimer();
    this._pendingTimer = setTimeout(() => {
      this._pendingTimer = null;
      this._pendingDirty = false;
      this._lastInputGroup = null;
      this._commitCurrentState();
    }, TYPING_IDLE_MS);
  }

  _clearPendingTimer() {
    if (this._pendingTimer) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = null;
    }
  }

  _commitCurrentState() {
    const snap = this._captureSnapshot();
    const current = this._stack[this._index];

    if (current && current.html === snap.html) {
      // Atualiza apenas a posição do cursor no topo sem duplicar o passo
      current.selection = snap.selection;
      return;
    }

    if (this._index < this._stack.length - 1) {
      this._stack = this._stack.slice(0, this._index + 1);
    }

    this._stack.push(snap);
    if (this._stack.length > MAX_HISTORY_STEPS) {
      this._stack.shift();
    }
    this._index = this._stack.length - 1;
  }

  _captureSnapshot() {
    return {
      html: this.editor.getContent(),
      selection: this._captureSelection()
    };
  }

  _restoreSnapshot(snap) {
    if (!snap || !this.body) return;

    this._isRestoring = true;
    try {
      this.editor.mentions?.closePicker?.();
      this.editor.links?.closeNotePicker?.();
      this.editor.setContent(snap.html);
      this._restoreSelection(snap.selection);
    } finally {
      this._isRestoring = false;
    }

    this.editor.notifyChange({ immediate: false, source: "history" });
  }

  /* ================= SERIALIZAÇÃO DE CURSOR / SELEÇÃO ================= */

  _getEditableContainers() {
    if (!this.body) return [];
    const list = [];

    for (const child of Array.from(this.body.children)) {
      if (child.classList.contains("fk-box")) {
        child
          .querySelectorAll(
            ".fk-box-drawer-title, .fk-box-drawer-body, .fk-box-quote-body, .fk-box-quote-author, .fk-box-note-body, .fk-box-code-body"
          )
          .forEach((slot) => list.push(slot));
      } else if (child.classList.contains("fk-table-block")) {
        child.querySelectorAll("td, th").forEach((cell) => list.push(cell));
      } else if (
        !child.classList.contains("fk-img-block") &&
        !child.classList.contains("fk-divider-block")
      ) {
        list.push(child);
      }
    }

    return list;
  }

  _captureSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0);
    if (!this.body.contains(range.startContainer) || !this.body.contains(range.endContainer)) {
      return null;
    }

    const containers = this._getEditableContainers();
    const start = this._locateEndpoint(containers, range.startContainer, range.startOffset);
    const end = range.collapsed
      ? start
      : this._locateEndpoint(containers, range.endContainer, range.endOffset);

    if (!start || !end) return null;
    return { start, end };
  }

  _locateEndpoint(containers, node, offset) {
    const targetEl = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!targetEl) return null;

    let containerIdx = -1;
    let containerEl = null;

    for (let i = 0; i < containers.length; i++) {
      if (containers[i] === targetEl || containers[i].contains(targetEl)) {
        containerIdx = i;
        containerEl = containers[i];
        break;
      }
    }

    if (!containerEl) return null;

    try {
      const r = document.createRange();
      r.selectNodeContents(containerEl);
      r.setEnd(node, offset);
      const charOffset = r.toString().replace(/\u200B/g, "").length;
      return { containerIdx, charOffset };
    } catch {
      return { containerIdx, charOffset: 0 };
    }
  }

  _restoreSelection(saved) {
    if (!saved || !this.body) {
      this.editor.focusStart();
      return;
    }

    const containers = this._getEditableContainers();
    if (!containers.length) {
      this.editor.focusStart();
      return;
    }

    const startPoint = this._resolveEndpoint(containers, saved.start);
    const endPoint = this._resolveEndpoint(containers, saved.end);
    if (!startPoint || !endPoint) {
      this.editor.focusStart();
      return;
    }

    // Garante que gaveta/citação fiquem visíveis caso o cursor esteja dentro delas
    const startEl =
      startPoint.node.nodeType === Node.TEXT_NODE
        ? startPoint.node.parentElement
        : startPoint.node;
    const drawer = startEl?.closest?.(".fk-box-drawer");
    if (drawer && startEl?.closest?.(".fk-box-drawer-body")) {
      drawer.classList.add("is-open");
    }
    const quote = startEl?.closest?.(".fk-box-quote");
    if (quote && startEl?.closest?.(".fk-box-quote-author")) {
      quote.classList.add("is-editing");
    }

    const focusHost =
      startEl?.closest?.('[contenteditable="true"]') || this.body;
    focusHost.focus();

    try {
      const range = document.createRange();
      range.setStart(startPoint.node, startPoint.offset);
      range.setEnd(endPoint.node, endPoint.offset);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      this.editor.focusStart();
    }
  }

  _resolveEndpoint(containers, point) {
    if (!point) return null;
    const idx = Math.max(0, Math.min(containers.length - 1, point.containerIdx));
    const container = containers[idx];
    if (!container) return null;

    const targetOffset = Math.max(0, point.charOffset || 0);
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let remaining = targetOffset;
    let lastTextNode = null;

    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      lastTextNode = textNode;
      const len = textNode.textContent.length;
      if (remaining <= len) {
        return { node: textNode, offset: remaining };
      }
      remaining -= len;
    }

    if (lastTextNode) {
      return { node: lastTextNode, offset: lastTextNode.textContent.length };
    }
    return { node: container, offset: 0 };
  }
}