import { t } from "./shared-i18n.js";

export class InNoteSearchBar {
  constructor(
    container,
    {
      canReplace = true,
      onSearch = null,
      onNext = null,
      onPrev = null,
      onReplace = null,
      onReplaceAll = null,
      onClose = null
    } = {}
  ) {
    this.container = container;
    this.canReplace = Boolean(canReplace);
    this._onSearch = onSearch;
    this._onNext = onNext;
    this._onPrev = onPrev;
    this._onReplace = onReplace;
    this._onReplaceAll = onReplaceAll;
    this._onClose = onClose;

    this.el = null;
    this.findInput = null;
    this.replaceInput = null;
    this.countEl = null;
    this.replaceRow = null;
    this.toggleBtn = null;
    this.isOpen = false;
    this.isReplaceOpen = false;
  }

  _ensureElement() {
    if (this.el && this.el.isConnected) return;

    const bar = document.createElement("div");
    bar.className = "fk-in-note-find-bar";
    bar.innerHTML = `
      <div class="fk-find-row">
        ${
          this.canReplace
            ? `<button type="button" class="fk-find-btn fk-find-toggle-replace" title="${t("SIN.Shared.FindToggleReplaceTitle")}">
                <i class="fas fa-chevron-right"></i>
              </button>`
            : ""
        }
        <div class="fk-find-input-wrap">
          <input type="text" class="fk-find-input" autocomplete="off" spellcheck="false" placeholder="${t("SIN.Shared.FindPlaceholder")}" />
          <span class="fk-find-count">0/0</span>
        </div>
        <button type="button" class="fk-find-btn" data-act="prev" title="${t("SIN.Shared.FindPrevTitle")}">
          <i class="fas fa-arrow-up"></i>
        </button>
        <button type="button" class="fk-find-btn" data-act="next" title="${t("SIN.Shared.FindNextTitle")}">
          <i class="fas fa-arrow-down"></i>
        </button>
        <button type="button" class="fk-find-btn" data-act="close" title="${t("SIN.Shared.FindCloseTitle")}">
          <i class="fas fa-times"></i>
        </button>
      </div>
      ${
        this.canReplace
          ? `
        <div class="fk-replace-row">
          <div class="fk-find-input-wrap">
            <input type="text" class="fk-replace-input" autocomplete="off" spellcheck="false" placeholder="${t("SIN.Shared.ReplacePlaceholder")}" />
          </div>
          <button type="button" class="fk-find-btn fk-find-text-btn" data-act="replace" title="${t("SIN.Shared.ReplaceOneTitle")}">
            ${t("SIN.Shared.ReplaceOne")}
          </button>
          <button type="button" class="fk-find-btn fk-find-text-btn" data-act="replace-all" title="${t("SIN.Shared.ReplaceAllTitle")}">
            ${t("SIN.Shared.ReplaceAll")}
          </button>
        </div>
      `
          : ""
      }
    `;

    bar.addEventListener("mousedown", (e) => e.stopPropagation());
    bar.addEventListener("click", (e) => e.stopPropagation());
    bar.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        e.stopPropagation();
        this.findInput?.focus();
        this.findInput?.select();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
        e.preventDefault();
        e.stopPropagation();
        if (this.canReplace) {
          this.setReplaceExpanded(true);
          this.replaceInput?.focus();
          this.replaceInput?.select();
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.close();
        return;
      }
      e.stopPropagation();
    });

    this.findInput = bar.querySelector(".fk-find-input");
    this.replaceInput = bar.querySelector(".fk-replace-input");
    this.countEl = bar.querySelector(".fk-find-count");
    this.replaceRow = bar.querySelector(".fk-replace-row");
    this.toggleBtn = bar.querySelector(".fk-find-toggle-replace");

    this.findInput.addEventListener("input", () => {
      this._onSearch?.(this.findInput.value);
    });

    this.findInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) this._onPrev?.();
        else this._onNext?.();
      }
    });

    this.replaceInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          this._onReplaceAll?.(this.replaceInput.value);
        } else {
          this._onReplace?.(this.replaceInput.value);
        }
      }
    });

    this.toggleBtn?.addEventListener("click", () => {
      this.setReplaceExpanded(!this.isReplaceOpen);
      if (this.isReplaceOpen) {
        this.replaceInput?.focus();
      } else {
        this.findInput?.focus();
      }
    });

    bar.querySelector('[data-act="prev"]')?.addEventListener("click", () => this._onPrev?.());
    bar.querySelector('[data-act="next"]')?.addEventListener("click", () => this._onNext?.());
    bar.querySelector('[data-act="close"]')?.addEventListener("click", () => this.close());
    bar.querySelector('[data-act="replace"]')?.addEventListener("click", () => {
      this._onReplace?.(this.replaceInput?.value ?? "");
    });
    bar.querySelector('[data-act="replace-all"]')?.addEventListener("click", () => {
      this._onReplaceAll?.(this.replaceInput?.value ?? "");
    });

    this.container.appendChild(bar);
    this.el = bar;
  }

  getQuery() {
    return this.findInput?.value ?? "";
  }

  getReplacement() {
    return this.replaceInput?.value ?? "";
  }

  setReplaceExpanded(expanded) {
    if (!this.canReplace || !this.el) return;
    this.isReplaceOpen = Boolean(expanded);
    this.el.classList.toggle("replace-open", this.isReplaceOpen);
  }

  setCounter(currentIndex, total) {
    if (!this.countEl) return;
    const hasQuery = Boolean(this.getQuery().trim());
    if (!hasQuery) {
      this.countEl.textContent = "";
      this.countEl.classList.remove("is-empty");
      return;
    }
    if (total <= 0) {
      this.countEl.textContent = "0/0";
      this.countEl.classList.add("is-empty");
      return;
    }
    this.countEl.textContent = `${currentIndex + 1}/${total}`;
    this.countEl.classList.remove("is-empty");
  }

  open({ query = null, showReplace = false } = {}) {
    this._ensureElement();
    this.isOpen = true;
    this.el.classList.add("is-open");

    if (this.canReplace) {
      this.setReplaceExpanded(showReplace);
    }

    if (typeof query === "string") {
      this.findInput.value = query;
    }

    this._onSearch?.(this.findInput.value);

    setTimeout(() => {
      if (showReplace && this.canReplace && this.findInput.value) {
        this.replaceInput?.focus();
        this.replaceInput?.select();
      } else {
        this.findInput?.focus();
        this.findInput?.select();
      }
    }, 10);
  }

  toggle({ showReplace = false, initialQuery = null } = {}) {
    if (this.isOpen) {
      if (showReplace && this.canReplace && !this.isReplaceOpen) {
        this.setReplaceExpanded(true);
        this.replaceInput?.focus();
        this.replaceInput?.select();
        return;
      }
      if (!showReplace && document.activeElement !== this.findInput) {
        this.findInput?.focus();
        this.findInput?.select();
        return;
      }
      this.close();
      return;
    }

    this.open({ query: initialQuery, showReplace });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el?.classList.remove("is-open");
    this._onClose?.();
  }

  destroy() {
    this.close();
    this.el?.remove();
    this.el = null;
  }
}