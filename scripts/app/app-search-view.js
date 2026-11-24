import { t } from "../shared/shared-i18n.js";

export class SearchView {
  constructor(app) {
    this.app = app;
    this.storage = app.storage;
    this.query = "";
    this.filterDrawerOpen = false;
    this.vocabulary = [];
    this.currentSuggestions = [];
    this.selectedSuggestIndex = 0;
    this.selectedResultIndex = -1;
    this.filters = {
      content: true,
      text: true,
      mindmap: true,
      folders: true,
      shared: true,
      favoritesOnly: false
    };
  }

  openNormalSearch(resetQuery = false) {
    if (resetQuery) {
      this.query = "";
    }
    this.filters.favoritesOnly = false;
    this.filterDrawerOpen = false;
    this.selectedSuggestIndex = 0;
    this.selectedResultIndex = -1;
  }

  openFavoritesSearch() {
    this.query = "";
    this.filters.favoritesOnly = true;
    this.filterDrawerOpen = false;
    this.selectedSuggestIndex = 0;
    this.selectedResultIndex = -1;
  }

  _buildLocalVocabulary() {
    const words = new Set();
    const data = this.storage.getData();

    const addTextTokens = (str) => {
      if (!str) return;
      const clean = String(str)
        .replace(/[^\p{L}\p{N}_-]+/gu, " ")
        .trim();
      for (const token of clean.split(/\s+/)) {
        if (token.length >= 3 && token.length <= 28) {
          words.add(token.toLowerCase());
        }
      }
    };

    for (const col of data.columns || []) addTextTokens(col.title);
    for (const sub of data.subsections || []) addTextTokens(sub.title);

    const allNotes = [
      ...(data.notes || []),
      ...this.storage.getSharedNotesForCurrentUser()
    ];

    for (const note of allNotes) {
      addTextTokens(note.title);
      addTextTokens(this._extractPlainTextFromNote(note));
    }

    this.vocabulary = Array.from(words);
  }

  _computeSuggestions(rawQuery) {
    const trimmed = String(rawQuery || "").trim();
    if (!trimmed) return [];

    const parts = trimmed.split(/\s+/);
    const lastWord = parts[parts.length - 1].toLowerCase();
    if (lastWord.length < 2) return [];

    const matches = [];
    for (const candidate of this.vocabulary) {
      if (candidate === lastWord) continue;
      if (candidate.startsWith(lastWord)) {
        matches.push(candidate);
        if (matches.length >= 5) break;
      }
    }

    return matches;
  }

  render(root) {
    this._buildLocalVocabulary();

    const filterItems = [
      { key: "content", label: t("SIN.Search.FilterContent") },
      { key: "text", label: t("SIN.Search.FilterText") },
      { key: "mindmap", label: t("SIN.Search.FilterMindmap") },
      { key: "folders", label: t("SIN.Search.FilterFolders") },
      { key: "shared", label: t("SIN.Search.FilterShared") },
      { key: "favoritesOnly", label: t("SIN.Search.FilterFavoritesOnly") }
    ];

    const view = document.createElement("div");
    view.className = "fk-search-view";
    view.innerHTML = `
      <div class="fk-search-inner">
        <div class="fk-search-bar-wrapper">
          <div class="fk-search-bar-line">
            <i class="fas fa-search" style="color:#a78bfa; font-size:13.5px;"></i>
            <input
              type="text"
              id="fk-global-search-input"
              name="fk-search-no-autofill"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              placeholder="${this.filters.favoritesOnly ? t("SIN.Search.PlaceholderFavorites") : t("SIN.Search.PlaceholderDefault")}"
              value="${this.storage.escapeHtml(this.query)}"
            />
            <div class="fk-search-icon-action" id="fk-global-search-clear" title="${t("SIN.Search.ClearTitle")}" style="${this.query ? "" : "display:none;"}">
              <i class="fas fa-times"></i>
            </div>
            <div class="fk-search-icon-action ${this.filterDrawerOpen ? "active" : ""}" id="fk-toggle-filters-btn" title="${t("SIN.Search.FiltersTitle")}">
              <i class="fas fa-sliders-h"></i>
            </div>
          </div>

          <div class="fk-search-autocomplete-dropdown" id="fk-search-suggestions"></div>
        </div>

        <div class="fk-search-filter-drawer ${this.filterDrawerOpen ? "open" : ""}" id="fk-search-filter-drawer">
          ${filterItems
            .map(
              (f) => `
              <div class="fk-filter-toggle ${this.filters[f.key] ? "active" : ""}" data-filter="${f.key}">
                <span class="fk-filter-box"><i class="fas fa-check"></i></span>
                <span>${f.label}</span>
              </div>
            `
            )
            .join("")}
        </div>

        <div class="fk-search-results" id="fk-global-search-results" tabindex="0"></div>
      </div>
    `;
    root.appendChild(view);

    const input = view.querySelector("#fk-global-search-input");
    const clearBtn = view.querySelector("#fk-global-search-clear");
    const filterBtn = view.querySelector("#fk-toggle-filters-btn");
    const filterDrawer = view.querySelector("#fk-search-filter-drawer");
    const suggestBox = view.querySelector("#fk-search-suggestions");
    const resultsBox = view.querySelector("#fk-global-search-results");

    const applySuggestionWord = (word) => {
      const parts = this.query.trimEnd().split(/\s+/);
      parts[parts.length - 1] = word.toLowerCase();
      this.query = `${parts.join(" ")} `;
      input.value = this.query;
      input.focus();
      updateResults();
    };

    const paintSuggestionSelection = () => {
      suggestBox.querySelectorAll(".fk-autocomplete-row").forEach((row, idx) => {
        const isSel = idx === this.selectedSuggestIndex;
        row.classList.toggle("selected", isSel);
        const hint = row.querySelector(".fk-autocomplete-hint");
        if (hint) hint.textContent = isSel ? "Tab" : "";
      });
    };

    const paintResultSelection = () => {
      const rows = Array.from(resultsBox.querySelectorAll(".fk-search-result-row"));
      rows.forEach((row, idx) => {
        const isSel = idx === this.selectedResultIndex;
        row.classList.toggle("selected", isSel);
        if (isSel) {
          row.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      });
    };

    const renderSuggestions = () => {
      this.currentSuggestions = this._computeSuggestions(this.query);
      this.selectedSuggestIndex = 0;

      if (!this.currentSuggestions.length) {
        suggestBox.innerHTML = "";
        return;
      }

      suggestBox.innerHTML = this.currentSuggestions
        .map(
          (w, idx) => `
          <div class="fk-autocomplete-row ${idx === 0 ? "selected" : ""}" data-suggest="${this.storage.escapeHtml(w)}">
            <span class="fk-autocomplete-word">
              <i class="fas fa-search" style="font-size:10.5px; opacity:0.55;"></i>
              <span>${this.storage.escapeHtml(w)}</span>
            </span>
            <span class="fk-autocomplete-hint">${idx === 0 ? "Tab" : ""}</span>
          </div>
        `
        )
        .join("");

      suggestBox.querySelectorAll("[data-suggest]").forEach((row) => {
        row.addEventListener("mousedown", (e) => {
          e.preventDefault();
          applySuggestionWord(row.dataset.suggest);
        });
      });
    };

    const updateResults = () => {
      this.selectedResultIndex = -1;
      clearBtn.style.display = this.query ? "inline-flex" : "none";
      input.placeholder = this.filters.favoritesOnly
        ? t("SIN.Search.PlaceholderFavorites")
        : t("SIN.Search.PlaceholderDefault");
      renderSuggestions();
      this._renderResults(resultsBox);
    };

    input.addEventListener("input", () => {
      this.query = input.value;
      updateResults();
    });

    input.addEventListener("blur", () => {
      setTimeout(() => {
        if (suggestBox) {
          suggestBox.innerHTML = "";
          this.currentSuggestions = [];
        }
      }, 120);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        if (this.currentSuggestions.length > 0) {
          e.preventDefault();
          this.selectedSuggestIndex = (this.selectedSuggestIndex + 1) % this.currentSuggestions.length;
          paintSuggestionSelection();
        } else {
          const rows = resultsBox.querySelectorAll(".fk-search-result-row");
          if (rows.length > 0) {
            e.preventDefault();
            this.selectedResultIndex = 0;
            paintResultSelection();
            resultsBox.focus();
          }
        }
      } else if (e.key === "ArrowUp" && this.currentSuggestions.length > 0) {
        e.preventDefault();
        this.selectedSuggestIndex =
          (this.selectedSuggestIndex - 1 + this.currentSuggestions.length) % this.currentSuggestions.length;
        paintSuggestionSelection();
      } else if (e.key === "Tab" && this.currentSuggestions.length > 0) {
        e.preventDefault();
        const chosen = this.currentSuggestions[this.selectedSuggestIndex] || this.currentSuggestions[0];
        applySuggestionWord(chosen);
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.currentSuggestions = [];
        suggestBox.innerHTML = "";
        this._renderResults(resultsBox);

        const rows = resultsBox.querySelectorAll(".fk-search-result-row");
        if (rows.length > 0) {
          this.selectedResultIndex = 0;
          paintResultSelection();
          resultsBox.focus();
        }
      } else if (e.key === "Escape") {
        this.currentSuggestions = [];
        suggestBox.innerHTML = "";
      }
    });

    resultsBox.addEventListener("keydown", (e) => {
      const rows = Array.from(resultsBox.querySelectorAll(".fk-search-result-row"));
      if (e.key === "Tab") {
        e.preventDefault();
        this.selectedResultIndex = -1;
        paintResultSelection();
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        return;
      }

      if (!rows.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.selectedResultIndex = (this.selectedResultIndex + 1) % rows.length;
        paintResultSelection();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (this.selectedResultIndex <= 0) {
          this.selectedResultIndex = -1;
          paintResultSelection();
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        } else {
          this.selectedResultIndex -= 1;
          paintResultSelection();
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        const targetRow = rows[this.selectedResultIndex] || rows[0];
        targetRow?.click();
      }
    });

    clearBtn.addEventListener("click", () => {
      this.query = "";
      input.value = "";
      input.focus();
      updateResults();
    });

    filterBtn.addEventListener("click", () => {
      this.filterDrawerOpen = !this.filterDrawerOpen;
      filterBtn.classList.toggle("active", this.filterDrawerOpen);
      filterDrawer.classList.toggle("open", this.filterDrawerOpen);
    });

    view.querySelectorAll(".fk-filter-toggle[data-filter]").forEach((toggleEl) => {
      toggleEl.addEventListener("click", () => {
        const key = toggleEl.dataset.filter;
        this.filters[key] = !this.filters[key];
        toggleEl.classList.toggle("active", this.filters[key]);
        updateResults();
      });
    });

    updateResults();
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 15);
  }

  _extractPlainTextFromNote(note) {
    if (note.type === "mindmap") {
      return (note.mindmap?.nodes || [])
        .map((n) => `${n.title || ""} ${n.details || ""}`.trim())
        .filter(Boolean)
        .join(" • ");
    }
    const tmp = document.createElement("div");
    tmp.innerHTML = note.content || "";
    return tmp.textContent.replace(/\s+/g, " ").trim();
  }

  _buildHighlightedSnippet(text, query) {
    if (!text) return "";
    if (!query) {
      const clipped = text.slice(0, 95);
      return this.storage.escapeHtml(clipped) + (text.length > 95 ? "..." : "");
    }

    const lowerText = text.toLowerCase();
    const lowerQ = query.toLowerCase();
    const idx = lowerText.indexOf(lowerQ);

    if (idx === -1) {
      const clipped = text.slice(0, 95);
      return this.storage.escapeHtml(clipped) + (text.length > 95 ? "..." : "");
    }

    const start = Math.max(0, idx - 32);
    const end = Math.min(text.length, idx + query.length + 48);
    const prefix = (start > 0 ? "..." : "") + this.storage.escapeHtml(text.slice(start, idx));
    const matchStr = this.storage.escapeHtml(text.slice(idx, idx + query.length));
    const suffix = this.storage.escapeHtml(text.slice(idx + query.length, end)) + (end < text.length ? "..." : "");

    return `${prefix}<mark class="fk-search-hit current">${matchStr}</mark>${suffix}`;
  }

  _highlightTitle(title, query) {
    const safeTitle = title || t("SIN.Common.UntitledNote");
    if (!query) return this.storage.escapeHtml(safeTitle);
    const lowerTitle = safeTitle.toLowerCase();
    const lowerQ = query.toLowerCase();
    const idx = lowerTitle.indexOf(lowerQ);
    if (idx === -1) return this.storage.escapeHtml(safeTitle);

    const before = this.storage.escapeHtml(safeTitle.slice(0, idx));
    const middle = this.storage.escapeHtml(safeTitle.slice(idx, idx + query.length));
    const after = this.storage.escapeHtml(safeTitle.slice(idx + query.length));
    return `${before}<mark class="fk-search-hit current">${middle}</mark>${after}`;
  }

  _renderResults(container) {
    container.innerHTML = "";
    const q = this.query.trim().toLowerCase();
    const data = this.storage.getData();

    if (!q && !this.filters.favoritesOnly) {
      const recents = this.storage.getRecentNotes();
      if (!recents.length) {
        container.innerHTML = `<div class="fk-search-empty-msg">${t("SIN.Search.EmptyInitial")}</div>`;
        return;
      }

      const recHeader = document.createElement("div");
      recHeader.className = "fk-search-rec-header";
      recHeader.innerHTML = `<i class="fas fa-history"></i> ${t("SIN.Search.Recommendations")}`;
      container.appendChild(recHeader);

      recents.forEach((note) => {
        const displayTitle =
          (note.type === "mindmap"
            ? note.mindmap?.nodes?.[0]?.title || note.title
            : note.title) || t("SIN.Common.UntitledNote");
        const preview = this._buildHighlightedSnippet(this._extractPlainTextFromNote(note), "");
        const icon = note.type === "mindmap" ? "fa-project-diagram" : "fa-align-left";

        let locationLabel = note.readOnly ? `${note.ownerName}` : t("SIN.Common.General");
        if (!note.readOnly) {
          const colName = data.columns.find((c) => c.id === note.columnId)?.title || t("SIN.Common.General");
          const subName = note.subsectionId
            ? data.subsections.find((s) => s.id === note.subsectionId)?.title
            : null;
          locationLabel = subName ? `${colName} › ${subName}` : colName;
        }

        const row = document.createElement("div");
        row.className = "fk-search-result-row";
        row.innerHTML = `
          <div class="fk-search-res-header">
            <div class="fk-search-res-title">
              <i class="fas ${icon}" style="color:#71717a; font-size:11px;"></i>
              <span>${this.storage.escapeHtml(displayTitle)}</span>
              ${note.favorite ? `<i class="fas fa-star fk-fav-star" style="margin-left:2px;"></i>` : ""}
            </div>
            <span class="fk-search-res-meta">${this.storage.escapeHtml(locationLabel)}</span>
          </div>
          ${preview ? `<div class="fk-search-res-snippet">${preview}</div>` : ""}
        `;

        row.addEventListener("click", async () => {
          this.query = "";
          this.filterDrawerOpen = false;
          this.filters.favoritesOnly = false;
          if (this.app.searchWindow?.rendered) {
            await this.app.searchWindow.close({ animate: false });
          }
          this.app.openNote(note.id, note.ownerId);
        });

        container.appendChild(row);
      });
      return;
    }

    const results = [];

    if (this.filters.folders) {
      for (const col of data.columns) {
        if (this.filters.favoritesOnly && !col.favorite) continue;
        if (q && !(col.title || "").toLowerCase().includes(q)) continue;
        const count = data.notes.filter((n) => n.columnId === col.id).length;
        results.push({
          kind: "column",
          colId: col.id,
          favorite: Boolean(col.favorite),
          title: col.title,
          meta: `${data.viewMode === "list" ? t("SIN.Search.Folder") : t("SIN.Search.Column")} • ${count}`,
          icon: "fa-folder",
          snippet: ""
        });
      }

      if (!this.filters.favoritesOnly && q) {
        for (const sub of data.subsections || []) {
          if ((sub.title || "").toLowerCase().includes(q)) {
            const parentCol = data.columns.find((c) => c.id === sub.columnId);
            results.push({
              kind: "subsection",
              colId: sub.columnId,
              subId: sub.id,
              title: sub.title,
              meta: `${t("SIN.Search.Subsection")} • ${parentCol?.title || t("SIN.Common.General")}`,
              icon: "fa-folder-open",
              snippet: ""
            });
          }
        }
      }
    }

    const candidateNotes = [
      ...data.notes.map((n) => ({ ...n, ownerId: game.user.id, ownerName: game.user.name, isShared: false })),
      ...(this.filters.shared
        ? this.storage.getSharedNotesForCurrentUser().map((n) => ({ ...n, isShared: true }))
        : [])
    ];

    for (const note of candidateNotes) {
      if (this.filters.favoritesOnly && !note.favorite) continue;
      if (note.type === "text" && !this.filters.text) continue;
      if (note.type === "mindmap" && !this.filters.mindmap) continue;

      const displayTitle =
        (note.type === "mindmap"
          ? note.mindmap?.nodes?.[0]?.title || note.title
          : note.title) || t("SIN.Common.UntitledNote");

      const plainContent = this._extractPlainTextFromNote(note);

      let titleMatch = true;
      let contentMatch = false;

      if (q) {
        titleMatch = displayTitle.toLowerCase().includes(q);
        contentMatch = this.filters.content ? plainContent.toLowerCase().includes(q) : false;
        if (!titleMatch && !contentMatch) continue;
      }

      let locationLabel = note.isShared ? `${note.ownerName}` : t("SIN.Common.General");
      if (!note.isShared) {
        const colName = data.columns.find((c) => c.id === note.columnId)?.title || t("SIN.Common.General");
        const subName = note.subsectionId
          ? data.subsections.find((s) => s.id === note.subsectionId)?.title
          : null;
        locationLabel = subName ? `${colName} › ${subName}` : colName;
      }

      results.push({
        kind: "note",
        noteId: note.id,
        ownerId: note.ownerId,
        noteType: note.type,
        favorite: Boolean(note.favorite),
        title: displayTitle,
        matchedByContent: Boolean(q && contentMatch && !titleMatch),
        matchedByTitleOnly: Boolean(q && titleMatch && !contentMatch),
        meta: locationLabel,
        icon: note.type === "mindmap" ? "fa-project-diagram" : "fa-align-left",
        snippetHtml:
          q && contentMatch
            ? this._buildHighlightedSnippet(plainContent, this.query.trim())
            : this._buildHighlightedSnippet(plainContent, "")
      });
    }

    if (!results.length) {
      const emptyText =
        this.filters.favoritesOnly && !q
          ? t("SIN.Search.EmptyFavorites")
          : this.storage.escapeHtml(t("SIN.Search.NoResults", { query: this.query.trim() }));
      container.innerHTML = `<div class="fk-search-empty-msg">${emptyText}</div>`;
      return;
    }

    results.forEach((res) => {
      const row = document.createElement("div");
      row.className = "fk-search-result-row";
      row.innerHTML = `
        <div class="fk-search-res-header">
          <div class="fk-search-res-title">
            <i class="fas ${res.icon}" style="color:#71717a; font-size:11px;"></i>
            <span>${this._highlightTitle(res.title, this.query.trim())}</span>
            ${res.favorite ? `<i class="fas fa-star fk-fav-star" style="margin-left:2px;"></i>` : ""}
          </div>
          <span class="fk-search-res-meta">${this.storage.escapeHtml(res.meta)}</span>
        </div>
        ${res.snippetHtml || res.snippet ? `<div class="fk-search-res-snippet">${res.snippetHtml || this.storage.escapeHtml(res.snippet)}</div>` : ""}
      `;

      row.addEventListener("click", async () => {
        const matchedQuery = this.query.trim();

        this.query = "";
        this.filterDrawerOpen = false;
        this.filters.favoritesOnly = false;

        if (this.app.searchWindow?.rendered) {
          await this.app.searchWindow.close({ animate: false });
        }

        if (res.kind === "column" || res.kind === "subsection") {
          this.app.managerView.collapsedFolders.delete(res.colId);
          this.app.managerView.highlightedColId = res.colId;
          this.app.openManager();
          return;
        }

        if (matchedQuery && res.matchedByContent && !res.matchedByTitleOnly) {
          if (res.noteType === "mindmap") {
            this.app.mindmapEditor.pendingSearchQuery = matchedQuery;
          } else {
            this.app.textEditor.pendingSearchQuery = matchedQuery;
          }
        } else {
          this.app.textEditor.pendingSearchQuery = null;
          this.app.mindmapEditor.pendingSearchQuery = null;
        }

        this.app.openNote(res.noteId, res.ownerId);
      });

      container.appendChild(row);
    });
  }
}