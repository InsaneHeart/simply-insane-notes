import { getActiveLang, t } from "../shared/shared-i18n.js";

export class MindMapPickers {
  constructor(editor) {
    this.editor = editor;
    this.storage = editor.storage;
    this._pickerEl = null;
    this._cleanup = null;
  }

  close() {
    if (this._cleanup) {
      this._cleanup();
      this._cleanup = null;
    }
    if (this._pickerEl) {
      this._pickerEl.remove();
      this._pickerEl = null;
    }
  }

  /* ================= POPOVER: VINCULAR NOTA ================= */

  openNotePicker({ excludeNoteId = null, anchorPoint = null, onSelect = null } = {}) {
    this.close();

    const candidates = this._collectLinkableNotes(excludeNoteId);
    const pop = document.createElement("div");
    pop.className = "fk-note-link-picker";
    pop.innerHTML = `
      <div class="fk-note-link-picker-search">
        <i class="fas fa-link"></i>
        <input type="text" autocomplete="off" spellcheck="false" placeholder="${t("SIN.MindMap.PickerNotePlaceholder")}" />
      </div>
      <div class="fk-note-link-picker-list"></div>
    `;

    this._mountPicker(pop, anchorPoint);

    const input = pop.querySelector("input");
    const listEl = pop.querySelector(".fk-note-link-picker-list");

    let filtered = [];
    let selectedIdx = 0;

    const commit = (chosen) => {
      this.close();
      onSelect?.(chosen);
    };

    const paintSelection = () => {
      listEl.querySelectorAll(".fk-note-link-picker-item").forEach((row, idx) => {
        const active = idx === selectedIdx;
        row.classList.toggle("selected", active);
        if (active) row.scrollIntoView({ block: "nearest" });
      });
    };

    const renderList = () => {
      const q = input.value.trim().toLowerCase();
      filtered = q
        ? candidates.filter(
            (n) =>
              n.title.toLowerCase().includes(q) || n.location.toLowerCase().includes(q)
          )
        : candidates.slice(0, 35);

      selectedIdx = 0;

      if (!filtered.length) {
        listEl.innerHTML = `<div class="fk-note-link-picker-empty">${t("SIN.MindMap.PickerNoNotes")}</div>`;
        return;
      }

      listEl.innerHTML = filtered
        .map(
          (n, idx) => `
          <div class="fk-note-link-picker-item ${idx === 0 ? "selected" : ""}" data-idx="${idx}">
            <i class="fas ${n.type === "mindmap" ? "fa-project-diagram" : "fa-align-left"}"></i>
            <span class="fk-note-link-picker-title">${this.storage.escapeHtml(n.title)}</span>
            <span class="fk-note-link-picker-meta">${this.storage.escapeHtml(n.location)}</span>
          </div>
        `
        )
        .join("");

      listEl.querySelectorAll(".fk-note-link-picker-item").forEach((row) => {
        row.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          const chosen = filtered[Number(row.dataset.idx)];
          if (chosen) commit(chosen);
        });
      });
    };

    input.addEventListener("input", renderList);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "ArrowDown") {
        if (!filtered.length) return;
        e.preventDefault();
        selectedIdx = (selectedIdx + 1) % filtered.length;
        paintSelection();
      } else if (e.key === "ArrowUp") {
        if (!filtered.length) return;
        e.preventDefault();
        selectedIdx = (selectedIdx - 1 + filtered.length) % filtered.length;
        paintSelection();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const chosen = filtered[selectedIdx] || filtered[0];
        if (chosen) commit(chosen);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    });

    renderList();
    this._clampPosition(pop, anchorPoint);
    setTimeout(() => input.focus(), 10);
  }

  /* ================= POPOVER: VINCULAR JOGADOR ================= */

  openUserPicker({ note = null, anchorPoint = null, onSelect = null } = {}) {
    this.close();

    const candidates = this._collectUsers(note);
    const pop = document.createElement("div");
    pop.className = "fk-note-link-picker";
    pop.innerHTML = `
      <div class="fk-note-link-picker-search">
        <i class="fas fa-user-tag"></i>
        <input type="text" autocomplete="off" spellcheck="false" placeholder="${t("SIN.MindMap.PickerUserPlaceholder")}" />
      </div>
      <div class="fk-note-link-picker-list"></div>
    `;

    this._mountPicker(pop, anchorPoint);

    const input = pop.querySelector("input");
    const listEl = pop.querySelector(".fk-note-link-picker-list");

    let filtered = [];
    let selectedIdx = 0;

    const commit = (chosen) => {
      this.close();
      onSelect?.(chosen);
    };

    const paintSelection = () => {
      listEl.querySelectorAll(".fk-mention-picker-item").forEach((row, idx) => {
        const active = idx === selectedIdx;
        row.classList.toggle("selected", active);
        if (active) row.scrollIntoView({ block: "nearest" });
      });
    };

    const renderList = () => {
      const q = input.value.trim().toLowerCase();
      filtered = q
        ? candidates.filter(
            (u) =>
              u.displayName.toLowerCase().includes(q) ||
              u.userName.toLowerCase().includes(q)
          )
        : candidates;

      selectedIdx = 0;

      if (!filtered.length) {
        listEl.innerHTML = `<div class="fk-note-link-picker-empty">${t("SIN.MindMap.PickerNoUsers")}</div>`;
        return;
      }

      listEl.innerHTML = filtered
        .map((u, idx) => {
          const subLabel =
            u.charName && u.charName !== u.userName
              ? `<span class="fk-mention-picker-meta">${this.storage.escapeHtml(u.userName)}</span>`
              : u.isGM
                ? `<span class="fk-mention-picker-meta">GM</span>`
                : "";
          return `
            <div class="fk-mention-picker-item ${idx === 0 ? "selected" : ""}" data-idx="${idx}" data-access="${u.access}">
              <span class="fk-mention-picker-dot"></span>
              <i class="fas ${u.icon}"></i>
              <span class="fk-mention-picker-name">${this.storage.escapeHtml(u.displayName)}</span>
              ${subLabel}
            </div>
          `;
        })
        .join("");

      listEl.querySelectorAll(".fk-mention-picker-item").forEach((row) => {
        row.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          const chosen = filtered[Number(row.dataset.idx)];
          if (chosen) commit(chosen);
        });
      });
    };

    input.addEventListener("input", renderList);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "ArrowDown") {
        if (!filtered.length) return;
        e.preventDefault();
        selectedIdx = (selectedIdx + 1) % filtered.length;
        paintSelection();
      } else if (e.key === "ArrowUp") {
        if (!filtered.length) return;
        e.preventDefault();
        selectedIdx = (selectedIdx - 1 + filtered.length) % filtered.length;
        paintSelection();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const chosen = filtered[selectedIdx] || filtered[0];
        if (chosen) commit(chosen);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    });

    renderList();
    this._clampPosition(pop, anchorPoint);
    setTimeout(() => input.focus(), 10);
  }

  /* ================= UTILITÁRIOS ================= */

  _mountPicker(pop, anchorPoint) {
    document.body.appendChild(pop);
    this._pickerEl = pop;

    const baseX = anchorPoint?.x ?? Math.round(window.innerWidth / 2 - 145);
    const baseY = (anchorPoint?.y ?? Math.round(window.innerHeight / 2 - 120)) + 6;
    pop.style.left = `${baseX}px`;
    pop.style.top = `${baseY}px`;

    const onDocMouseDown = (ev) => {
      if (!pop.contains(ev.target)) this.close();
    };
    document.addEventListener("mousedown", onDocMouseDown, true);
    this._cleanup = () => {
      document.removeEventListener("mousedown", onDocMouseDown, true);
    };
  }

  _clampPosition(pop, anchorPoint) {
    const baseX = anchorPoint?.x ?? Math.round(window.innerWidth / 2 - 145);
    const baseY = (anchorPoint?.y ?? Math.round(window.innerHeight / 2 - 120)) + 6;
    const rect = pop.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
    pop.style.left = `${Math.min(Math.max(8, baseX), maxLeft)}px`;
    pop.style.top = `${Math.min(Math.max(8, baseY), maxTop)}px`;
  }

  _collectLinkableNotes(excludeNoteId) {
    const data = this.storage.getData();
    const currentUserId = globalThis.game?.user?.id || "";
    const result = [];

    for (const note of data.notes || []) {
      if (note.id === excludeNoteId) continue;
      const title =
        (note.type === "mindmap" ? note.mindmap?.nodes?.[0]?.title || note.title : note.title) ||
        t("SIN.Common.UntitledNote");
      const colName = data.columns?.find((c) => c.id === note.columnId)?.title || t("SIN.Common.General");
      const subName = note.subsectionId
        ? data.subsections?.find((s) => s.id === note.subsectionId)?.title
        : null;

      result.push({
        id: note.id,
        ownerId: currentUserId,
        type: note.type || "text",
        title,
        location: subName ? `${colName} › ${subName}` : colName,
        rawNote: note
      });
    }

    for (const shared of this.storage.getSharedNotesForCurrentUser?.() || []) {
      if (shared.id === excludeNoteId) continue;
      const title =
        (shared.type === "mindmap"
          ? shared.mindmap?.nodes?.[0]?.title || shared.title
          : shared.title) || t("SIN.Common.UntitledNote");

      result.push({
        id: shared.id,
        ownerId: shared.ownerId,
        type: shared.type || "text",
        title,
        location: shared.ownerName || t("SIN.Info.Shared"),
        rawNote: shared
      });
    }

    return result;
  }

  _collectUsers(note) {
    const users = Array.from(globalThis.game?.users || []);
    const locale = getActiveLang() || "en";
    return users
      .map((u) => {
        const charName = u.character?.name?.trim() || "";
        const displayName = charName || u.name || t("SIN.MindMap.UserFallback");
        const access = this.storage?.getUserAccessLevel?.(note, u.id) || "none";
        return {
          id: u.id,
          userName: u.name || "",
          charName,
          displayName,
          isGM: Boolean(u.isGM),
          icon: u.isGM ? "fa-crown" : "fa-user",
          access
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, locale));
  }
}