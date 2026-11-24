const LT_API_URL = "https://api.languagetool.org/v2/check";
const SPELL_DEBOUNCE_MS = 850;
const WORD_REGEX = /\p{L}+(?:['’-]\p{L}+)*/gu;

// Cache global em memória entre notas da mesma sessão: key = `${langKey}|${wordLower}`
const wordCache = new Map();

export class EditorSpellcheck {
  constructor(editor) {
    this.editor = editor;
    this.body = null;
    this.canEdit = true;
    this._timer = null;
    this._runToken = 0;
    this._ignoredSessionWords = new Set();
  }

  /* ================= CONEXÃO ================= */

  attach(body, { canEdit = true } = {}) {
    this.cancelPending();
    this.body = body;
    this.canEdit = canEdit;
  }

  cancelPending() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._runToken += 1;
  }

  scheduleCheck() {
    if (!this.canEdit || !this.body) return;
    const settings = this._getSettings();
    if (!settings.spellcheckEnabled) {
      this.clearMarks();
      return;
    }

    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._timer = null;
      this.runCheck();
    }, SPELL_DEBOUNCE_MS);
  }

  refresh() {
    this.cancelPending();
    if (!this.body || !this.canEdit) return;

    const settings = this._getSettings();
    if (!settings.spellcheckEnabled) {
      this.clearMarks();
      return;
    }

    this.runCheck();
  }

  /* ================= LIMPEZA PARA SALVAMENTO ================= */

  clearMarks(root = this.body) {
    if (!root) return;
    const caret = root === this.body ? this._saveCaret() : null;

    root.querySelectorAll("span.fk-spell-error").forEach((span) => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      span.remove();
      parent.normalize();
    });

    if (caret) this._restoreCaret(caret);
  }

  cleanForSave(root) {
    this.clearMarks(root);
  }

  /* ================= AÇÕES DO MENU DE CONTEXTO ================= */

  getSuggestions(word) {
    const settings = this._getSettings();
    const langKey = this._getLangKey(settings.spellcheckLanguages);
    const entry = wordCache.get(`${langKey}|${String(word || "").toLowerCase()}`);
    return entry?.suggestions || [];
  }

  replaceWord(spanEl, replacement) {
    if (!this.canEdit || !spanEl || !this.body?.contains(spanEl)) return;
    const textNode = document.createTextNode(replacement);
    spanEl.replaceWith(textNode);

    const range = document.createRange();
    range.setStartAfter(textNode);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    this.body.normalize();
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
    this.scheduleCheck();
  }

  addToDictionary(word) {
    const clean = String(word || "").trim();
    if (!clean) return;
    this.editor.storage?.addWordToDictionary?.(clean);
    this.refresh();
  }

  ignoreWord(word) {
    const clean = String(word || "").trim().toLowerCase();
    if (!clean) return;
    this._ignoredSessionWords.add(clean);
    this.refresh();
  }

  /* ================= EXECUÇÃO DA VERIFICAÇÃO ================= */

  async runCheck() {
    if (!this.canEdit || !this.body || !this.body.isConnected) return;

    const settings = this._getSettings();
    if (!settings.spellcheckEnabled) {
      this.clearMarks();
      return;
    }

    const token = ++this._runToken;
    const langs =
      Array.isArray(settings.spellcheckLanguages) && settings.spellcheckLanguages.length
        ? settings.spellcheckLanguages
        : ["pt-BR"];
    const langKey = this._getLangKey(langs);
    const customSet = this._buildCustomWordSet(settings.customDictionary || []);

    const textNodes = this._collectEligibleTextNodes();
    const unknownWords = new Set();

    for (const node of textNodes) {
      const content = node.textContent || "";
      WORD_REGEX.lastIndex = 0;
      let m;
      while ((m = WORD_REGEX.exec(content)) !== null) {
        const word = m[0];
        if (!this._shouldCheckWord(word, settings, customSet)) continue;
        const lower = word.toLowerCase();
        if (!wordCache.has(`${langKey}|${lower}`)) {
          unknownWords.add(word);
        }
      }
    }

    if (unknownWords.size > 0) {
      await this._validateWordsWithApi(Array.from(unknownWords), langs, langKey);
    }

    if (token !== this._runToken || !this.body?.isConnected) return;

    this._applyMarks(langs, langKey, settings, customSet);
  }

  async _validateWordsWithApi(words, langs, langKey) {
    const BATCH_SIZE = 45;

    for (let i = 0; i < words.length; i += BATCH_SIZE) {
      const batch = words.slice(i, i + BATCH_SIZE);
      let remaining = batch;
      const suggestionsMap = new Map();

      for (let langIdx = 0; langIdx < langs.length && remaining.length > 0; langIdx++) {
        const lang = langs[langIdx];
        const flagged = await this._queryLanguageTool(remaining, lang);
        if (!flagged) {
          // Falha de rede: não marca em cache para permitir nova tentativa depois
          return;
        }

        const nextRemaining = [];
        for (const w of remaining) {
          const lower = w.toLowerCase();
          if (flagged.has(lower)) {
            if (!suggestionsMap.has(lower)) {
              suggestionsMap.set(lower, flagged.get(lower));
            }
            nextRemaining.push(w);
          } else {
            wordCache.set(`${langKey}|${lower}`, { valid: true, suggestions: [] });
          }
        }
        remaining = nextRemaining;
      }

      for (const w of remaining) {
        const lower = w.toLowerCase();
        wordCache.set(`${langKey}|${lower}`, {
          valid: false,
          suggestions: (suggestionsMap.get(lower) || []).slice(0, 5)
        });
      }
    }
  }

  async _queryLanguageTool(words, language) {
    try {
      const text = words.join("\n").trim();
      if (!text) return new Map();

      const params = new URLSearchParams();
      params.set("text", text);
      params.set("language", language || "pt-BR");

      const res = await fetch(LT_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: params.toString()
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        if (res.status === 400 && errText.includes("too many errors")) {
          const allFlagged = new Map();
          for (const w of words) {
            allFlagged.set(w.toLowerCase(), []);
          }
          return allFlagged;
        }
        return null;
      }

      const json = await res.json();
      const flagged = new Map();

      for (const match of json?.matches || []) {
        const issueType = match?.rule?.issueType || "";
        const categoryId = match?.rule?.category?.id || "";
        if (issueType !== "misspelling" && categoryId !== "TYPOS") continue;

        const slice = text.slice(match.offset, match.offset + match.length).trim();
        if (!slice) continue;
        const lower = slice.toLowerCase();
        const reps = (match.replacements || []).map((r) => r.value).filter(Boolean).slice(0, 5);
        flagged.set(lower, reps);
      }

      return flagged;
    } catch {
      return null;
    }
  }

  _applyMarks(langs, langKey, settings, customSet) {
    const caret = this._saveCaret();
    const activeWordRange = this._getWordAtCaret();

    this.body.querySelectorAll("span.fk-spell-error").forEach((span) => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      span.remove();
      parent.normalize();
    });

    const textNodes = this._collectEligibleTextNodes();

    for (const node of textNodes) {
      const text = node.textContent || "";
      if (!text.trim()) continue;

      WORD_REGEX.lastIndex = 0;
      const matches = [];
      let m;
      while ((m = WORD_REGEX.exec(text)) !== null) {
        const word = m[0];
        if (!this._shouldCheckWord(word, settings, customSet)) continue;

        const entry = wordCache.get(`${langKey}|${word.toLowerCase()}`);
        if (!entry || entry.valid) continue;

        if (
          activeWordRange &&
          activeWordRange.node === node &&
          activeWordRange.offset >= m.index &&
          activeWordRange.offset <= m.index + word.length
        ) {
          continue;
        }

        matches.push({ start: m.index, end: m.index + word.length, word });
      }

      if (!matches.length) continue;

      const frag = document.createDocumentFragment();
      let cursor = 0;

      for (const hit of matches) {
        if (hit.start > cursor) {
          frag.appendChild(document.createTextNode(text.slice(cursor, hit.start)));
        }
        const span = document.createElement("span");
        span.className = "fk-spell-error";
        span.dataset.spellWord = hit.word;
        span.textContent = hit.word;
        frag.appendChild(span);
        cursor = hit.end;
      }

      if (cursor < text.length) {
        frag.appendChild(document.createTextNode(text.slice(cursor)));
      }

      node.replaceWith(frag);
    }

    if (caret) this._restoreCaret(caret);
  }

  /* ================= FILTROS E UTILITÁRIOS ================= */

  _getSettings() {
    const s = this.editor.storage?.getSettings?.();
    return (
      s || {
        spellcheckEnabled: true,
        spellcheckIgnoreUppercase: false,
        spellcheckLanguages: ["pt-BR", "en-US"],
        customDictionary: []
      }
    );
  }

  _getLangKey(langs) {
    return (langs || ["pt-BR"]).slice().sort().join(",");
  }

  _buildCustomWordSet(dict) {
    const set = new Set();
    for (const entry of dict) {
      const trimmed = String(entry || "").trim().toLowerCase();
      if (!trimmed) continue;
      set.add(trimmed);
      for (const part of trimmed.split(/\s+/)) {
        if (part.length >= 2) set.add(part);
      }
    }
    return set;
  }

  _shouldCheckWord(word, settings, customSet) {
    if (!word || word.length < 2) return false;
    if (/\d/.test(word)) return false;
    if (settings.spellcheckIgnoreUppercase && word === word.toUpperCase() && word !== word.toLowerCase()) {
      return false;
    }
    const lower = word.toLowerCase();
    if (customSet.has(lower) || this._ignoredSessionWords.has(lower)) return false;
    return true;
  }

  _collectEligibleTextNodes() {
    const nodes = [];
    const walker = document.createTreeWalker(this.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (
          parent.closest(
            ".fk-box-code, .fk-link, .fk-note-link, .fk-mention, .fk-img-block, .fk-divider-block, .fk-box-note-header, .fk-box-drawer-toggle, .fk-box-quote-mark, .fk-box-quote-dash"
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let current;
    while ((current = walker.nextNode())) {
      nodes.push(current);
    }
    return nodes;
  }

  _getWordAtCaret() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!this.body?.contains(range.startContainer)) return null;
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;
    return { node: range.startContainer, offset: range.startOffset };
  }

  _saveCaret() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!this.body?.contains(range.startContainer)) return null;
    if (!sel.isCollapsed) return null;

    let container = range.startContainer;
    if (container.nodeType === Node.TEXT_NODE) container = container.parentElement;
    const scope =
      container?.closest?.(
        "td, th, .fk-box-drawer-title, .fk-box-drawer-body, .fk-box-quote-body, .fk-box-quote-author, .fk-box-note-body"
      ) || this._getTopBlock(range.startContainer);

    if (!scope || !this.body.contains(scope)) return null;

    try {
      const pre = document.createRange();
      pre.setStart(scope, 0);
      pre.setEnd(range.startContainer, range.startOffset);
      return { scope, offset: pre.toString().length };
    } catch {
      return null;
    }
  }

  _restoreCaret(saved) {
    if (!saved?.scope || !saved.scope.isConnected) return;
    const walker = document.createTreeWalker(saved.scope, NodeFilter.SHOW_TEXT);
    let remaining = saved.offset;
    let node;
    let lastNode = null;

    while ((node = walker.nextNode())) {
      lastNode = node;
      const len = node.textContent.length;
      if (remaining <= len) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      remaining -= len;
    }

    if (lastNode) {
      const range = document.createRange();
      range.setStart(lastNode, lastNode.textContent.length);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  _getTopBlock(node) {
    if (!node || !this.body?.contains(node)) return null;
    let cur = node;
    while (cur && cur.parentNode !== this.body) {
      cur = cur.parentNode;
    }
    return cur instanceof Element ? cur : null;
  }
}