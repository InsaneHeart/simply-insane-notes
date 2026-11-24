import { getActiveLang, t } from "../shared/shared-i18n.js";

export class EditorMentions {
  constructor(editor) {
    this.editor = editor;
    this.body = null;
    this.canEdit = true;
    this._pickerEl = null;
    this._pickerCleanup = null;
    this._activeTrigger = null; // { textNode, atOffset }
    this._filtered = [];
    this._selectedIdx = 0;
  }

  /* ================= CONEXÃO ================= */

  attach(body, { canEdit = true } = {}) {
    this.closePicker();
    this.body = body;
    this.canEdit = canEdit;

    body.addEventListener("dblclick", (e) => this._onDoubleClick(e));

    if (!canEdit) return;

    body.addEventListener("input", () => this._onInput());
    body.addEventListener("keydown", (e) => this._onKeyDown(e), true);
  }

  /* ================= SERIALIZAÇÃO E HIDRATAÇÃO ================= */

  hydrate() {
    if (!this.body) return;
    this.refreshAccessStates();
  }

  cleanForSave(root) {
    root.querySelectorAll(".fk-mention").forEach((chip) => {
      chip.setAttribute("contenteditable", "false");
    });
  }

  refreshAccessStates() {
    if (!this.body) return;
    const note = this._getFreshNote();
    const isOwner = Boolean(note && !note.readOnly);

    this.body.querySelectorAll(".fk-mention").forEach((chip) => {
      chip.setAttribute("contenteditable", "false");
      const userId = chip.dataset.userId;
      const user = globalThis.game?.users?.get(userId);
      const access = this.editor.storage?.getUserAccessLevel?.(note, userId) || "none";
      chip.dataset.access = access;

      if (user) {
        const displayName = this._getDisplayName(user);
        const labelSpan = chip.querySelector("span");
        if (labelSpan) labelSpan.textContent = `@${displayName}`;
        const icon = chip.querySelector("i");
        if (icon) icon.className = `fas ${this._getUserIcon(user)}`;
      }

      if (access === "creator") {
        chip.title = t("SIN.MindMap.UserTooltipCreator");
      } else if (access === "shared") {
        chip.title = t("SIN.MindMap.UserTooltipShared");
      } else {
        chip.title = isOwner
          ? t("SIN.MindMap.UserTooltipNoneOwner")
          : t("SIN.MindMap.UserTooltipNone");
      }
    });
  }

  /* ================= INTERAÇÕES (CLIQUE DUPLO E AÇÕES) ================= */

  _onDoubleClick(e) {
    const chip = e.target.closest?.(".fk-mention");
    if (!chip || !this.body?.contains(chip)) return;

    e.preventDefault();
    e.stopPropagation();

    const note = this._getFreshNote();
    const userId = chip.dataset.userId;
    const access = this.editor.storage?.getUserAccessLevel?.(note, userId) || "none";
    const isOwner = Boolean(note && !note.readOnly);

    if (access === "none" && isOwner) {
      this.openShareForMention(chip);
    } else {
      this.openCharacterSheet(chip);
    }
  }

  openCharacterSheet(chip) {
    const userId = chip?.dataset?.userId;
    const user = globalThis.game?.users?.get(userId);
    if (!user) {
      globalThis.ui?.notifications?.warn(t("SIN.MindMap.UserNotFound"));
      return;
    }

    const actor = user.character;
    if (!actor) {
      globalThis.ui?.notifications?.warn(
        t("SIN.MindMap.UserNoCharacter", { name: user.name })
      );
      return;
    }

    if (actor.sheet) {
      actor.sheet.render(true);
    }
  }

  async openShareForMention(chip) {
    const note = this._getFreshNote();
    if (!note || note.readOnly) {
      globalThis.ui?.notifications?.warn(t("SIN.MindMap.OnlyOwnerCanShare"));
      return;
    }

    const userId = chip?.dataset?.userId || null;
    const saved = await this.editor.storage?.openShareSettingsDialog?.(note.id, {
      preselectUserId: userId
    });

    if (saved) {
      this.refreshAccessStates();
      this.editor.notifyChange({ immediate: false });
    }
  }

  deleteMention(chip) {
    if (!this.canEdit || !chip || !this.body?.contains(chip)) return;
    chip.remove();
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
  }

  /* ================= DETECÇÃO DE @ E POPUP ================= */

  _onInput() {
    if (!this.canEdit || !this.body) return;

    const trigger = this._detectAtTrigger();
    if (!trigger) {
      this.closePicker();
      return;
    }

    this._activeTrigger = trigger;
    this._openOrUpdatePicker(trigger.query, trigger.rect);
  }

  _onKeyDown(e) {
    if (!this._pickerEl) return;

    if (e.key === "ArrowDown") {
      if (!this._filtered.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this._selectedIdx = (this._selectedIdx + 1) % this._filtered.length;
      this._paintSelection();
    } else if (e.key === "ArrowUp") {
      if (!this._filtered.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this._selectedIdx =
        (this._selectedIdx - 1 + this._filtered.length) % this._filtered.length;
      this._paintSelection();
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (!this._filtered.length) {
        this.closePicker();
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      const chosen = this._filtered[this._selectedIdx] || this._filtered[0];
      if (chosen) this._commitMention(chosen);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.closePicker();
    }
  }

  _detectAtTrigger() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;

    const range = sel.getRangeAt(0);
    if (!this.body.contains(range.startContainer)) return null;
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;

    const parentEl = range.startContainer.parentElement;
    if (parentEl?.closest?.(".fk-box-code, .fk-link, .fk-note-link, .fk-mention")) {
      return null;
    }

    const textNode = range.startContainer;
    const caretOffset = range.startOffset;
    const before = textNode.textContent.slice(0, caretOffset);

    const atIdx = before.lastIndexOf("@");
    if (atIdx === -1) return null;

    if (atIdx > 0 && !/[\s([{"'“‘\u00A0]/.test(before[atIdx - 1])) {
      return null;
    }

    const query = before.slice(atIdx + 1);
    if (query.length > 28 || /\n/.test(query)) return null;

    const atRange = document.createRange();
    atRange.setStart(textNode, atIdx);
    atRange.setEnd(textNode, caretOffset);
    const rect = atRange.getBoundingClientRect();

    return { textNode, atOffset: atIdx, caretOffset, query, rect };
  }

  _collectUsers() {
    const users = Array.from(globalThis.game?.users || []);
    const note = this._getFreshNote();
    const locale = getActiveLang() || "en";

    return users
      .map((u) => {
        const charName = u.character?.name?.trim() || "";
        const displayName = charName || u.name || t("SIN.MindMap.UserFallback");
        const access = this.editor.storage?.getUserAccessLevel?.(note, u.id) || "none";
        return {
          id: u.id,
          userName: u.name || "",
          charName,
          displayName,
          isGM: Boolean(u.isGM),
          icon: this._getUserIcon(u),
          access
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, locale));
  }

  _openOrUpdatePicker(query, rect) {
    const q = String(query || "").trim().toLowerCase();
    const allUsers = this._collectUsers();

    this._filtered = q
      ? allUsers.filter(
          (u) =>
            u.displayName.toLowerCase().includes(q) ||
            u.userName.toLowerCase().includes(q)
        )
      : allUsers;

    if (!this._filtered.length && q.includes(" ")) {
      this.closePicker();
      return;
    }

    this._selectedIdx = 0;

    if (!this._pickerEl) {
      const pop = document.createElement("div");
      pop.className = "fk-mention-picker";
      document.body.appendChild(pop);
      this._pickerEl = pop;

      const onDocMouseDown = (ev) => {
        if (!pop.contains(ev.target)) this.closePicker();
      };
      document.addEventListener("mousedown", onDocMouseDown, true);
      this._pickerCleanup = () => {
        document.removeEventListener("mousedown", onDocMouseDown, true);
      };
    }

    if (!this._filtered.length) {
      this._pickerEl.innerHTML = `<div class="fk-mention-picker-empty">${t("SIN.MindMap.PickerNoUsers")}</div>`;
    } else {
      this._pickerEl.innerHTML = this._filtered
        .map((u, idx) => {
          const subLabel =
            u.charName && u.charName !== u.userName
              ? `<span class="fk-mention-picker-meta">${this._escapeHtml(u.userName)}</span>`
              : u.isGM
                ? `<span class="fk-mention-picker-meta">GM</span>`
                : "";
          return `
            <div class="fk-mention-picker-item ${idx === 0 ? "selected" : ""}" data-idx="${idx}" data-access="${u.access}">
              <span class="fk-mention-picker-dot"></span>
              <i class="fas ${u.icon}"></i>
              <span class="fk-mention-picker-name">${this._escapeHtml(u.displayName)}</span>
              ${subLabel}
            </div>
          `;
        })
        .join("");

      this._pickerEl.querySelectorAll(".fk-mention-picker-item").forEach((row) => {
        row.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          const chosen = this._filtered[Number(row.dataset.idx)];
          if (chosen) this._commitMention(chosen);
        });
      });
    }

    const popRect = this._pickerEl.getBoundingClientRect();
    const baseX = rect?.left || this.body.getBoundingClientRect().left + 20;
    const baseY = (rect?.bottom || this.body.getBoundingClientRect().top + 40) + 4;
    const maxLeft = Math.max(8, window.innerWidth - popRect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - popRect.height - 8);

    this._pickerEl.style.left = `${Math.min(Math.max(8, baseX), maxLeft)}px`;
    this._pickerEl.style.top = `${Math.min(Math.max(8, baseY), maxTop)}px`;
  }

  _paintSelection() {
    if (!this._pickerEl) return;
    this._pickerEl.querySelectorAll(".fk-mention-picker-item").forEach((row, idx) => {
      const active = idx === this._selectedIdx;
      row.classList.toggle("selected", active);
      if (active) row.scrollIntoView({ block: "nearest" });
    });
  }

  _commitMention(userInfo) {
    const trigger = this._activeTrigger;
    this.closePicker();

    if (!trigger?.textNode || !this.body?.contains(trigger.textNode)) return;

    const sel = window.getSelection();
    const curOffset =
      sel?.rangeCount && sel.getRangeAt(0).startContainer === trigger.textNode
        ? sel.getRangeAt(0).startOffset
        : trigger.caretOffset;

    const range = document.createRange();
    range.setStart(trigger.textNode, trigger.atOffset);
    range.setEnd(trigger.textNode, Math.max(trigger.atOffset, curOffset));
    range.deleteContents();

    const chip = document.createElement("span");
    chip.className = "fk-mention";
    chip.setAttribute("contenteditable", "false");
    chip.dataset.userId = userInfo.id;
    chip.dataset.access = userInfo.access;
    chip.innerHTML = `<i class="fas ${userInfo.icon}"></i><span>@${this._escapeHtml(userInfo.displayName)}</span>`;

    const spacer = document.createTextNode("\u00A0");
    range.insertNode(spacer);
    range.insertNode(chip);

    const after = document.createRange();
    after.setStartAfter(spacer);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);

    this.refreshAccessStates();
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
  }

  closePicker() {
    if (this._pickerCleanup) {
      this._pickerCleanup();
      this._pickerCleanup = null;
    }
    if (this._pickerEl) {
      this._pickerEl.remove();
      this._pickerEl = null;
    }
    this._activeTrigger = null;
    this._filtered = [];
    this._selectedIdx = 0;
  }

  /* ================= UTILITÁRIOS ================= */

  _getFreshNote() {
    const base = this.editor.note;
    if (!base?.id) return base || null;
    return this.editor.storage?.findAnyNoteById?.(base.id, base.ownerId) || base;
  }

  _getDisplayName(user) {
    return user?.character?.name?.trim() || user?.name || t("SIN.MindMap.UserFallback");
  }

  _getUserIcon(user) {
    return user?.isGM ? "fa-crown" : "fa-user";
  }

  _escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}