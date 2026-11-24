import { t } from "../shared/shared-i18n.js";

export class ManagerShared {
  constructor(managerView) {
    this.view = managerView;
    this.app = managerView.app;
    this.storage = managerView.storage;
  }

  /* ================= BARRA LATERAL RETRÁTIL DE NOTAS COMPARTILHADAS (KANBAN) ================= */

  renderSidebar(wrapper, data) {
    const sharedNotes = this.storage.getSharedNotesForCurrentUser();
    if (!sharedNotes.length) return;

    if (!data.sharedDrawerOpen) {
      const rail = document.createElement("div");
      rail.className = "fk-shared-rail";
      rail.title = t("SIN.Manager.OpenSharedTitle", { count: sharedNotes.length });
      rail.innerHTML = `
        <i class="fas fa-users"></i>
        <span class="fk-shared-rail-text">${t("SIN.Manager.SharedCount", { count: sharedNotes.length })}</span>
      `;
      rail.addEventListener("click", () => {
        const fresh = this.storage.getData();
        fresh.sharedDrawerOpen = true;
        this.storage.saveNow(fresh);
        this.app.render({ force: true });
      });
      wrapper.appendChild(rail);
      return;
    }

    const drawer = document.createElement("div");
    drawer.className = "fk-shared-drawer";

    const groupBy = data.sharedGroupBy || "person";
    const toggleLabel =
      groupBy === "person" ? t("SIN.Manager.GroupByPerson") : t("SIN.Manager.GroupByDate");
    const toggleIcon = groupBy === "person" ? "fa-user" : "fa-calendar-alt";

    drawer.innerHTML = `
      <div class="fk-shared-drawer-header">
        <span id="fk-close-shared-drawer" style="display:flex; align-items:center; gap:6px; flex:1;" title="${t("SIN.Manager.CollapseSidebarTitle")}">
          <i class="fas fa-chevron-left" style="font-size:10px;"></i>
          <span>${t("SIN.Manager.SharedCount", { count: sharedNotes.length })}</span>
        </span>
        <button type="button" class="fk-shared-group-toggle" id="fk-toggle-shared-group" title="${t("SIN.Manager.ToggleGroupTitle")}">
          <i class="fas ${toggleIcon}"></i> ${toggleLabel}
        </button>
      </div>
      <div class="fk-col-cards" id="fk-shared-cards-list"></div>
    `;

    drawer.querySelector("#fk-close-shared-drawer").addEventListener("click", () => {
      const fresh = this.storage.getData();
      fresh.sharedDrawerOpen = false;
      this.storage.saveNow(fresh);
      this.app.render({ force: true });
    });

    drawer.querySelector("#fk-toggle-shared-group").addEventListener("click", (e) => {
      e.stopPropagation();
      const fresh = this.storage.getData();
      fresh.sharedGroupBy = (fresh.sharedGroupBy || "person") === "person" ? "date" : "person";
      this.storage.saveNow(fresh);
      const listContainer = drawer.querySelector("#fk-shared-cards-list");
      if (listContainer) {
        listContainer.innerHTML = "";
        const newGroupBy = fresh.sharedGroupBy;
        const btn = drawer.querySelector("#fk-toggle-shared-group");
        if (btn) {
          btn.innerHTML = `<i class="fas ${newGroupBy === "person" ? "fa-user" : "fa-calendar-alt"}"></i> ${newGroupBy === "person" ? t("SIN.Manager.GroupByPerson") : t("SIN.Manager.GroupByDate")}`;
        }
        this.renderGroupedCards(listContainer, sharedNotes, newGroupBy, false);
        requestAnimationFrame(() => this.view.updateVerticalScrollFade(listContainer));
      }
    });

    const listEl = drawer.querySelector("#fk-shared-cards-list");
    this.renderGroupedCards(listEl, sharedNotes, groupBy, false);
    this.view.bindVerticalScrollFade(listEl);
    wrapper.appendChild(drawer);
  }

  _getDateBucketLabel(ts) {
    const now = new Date();
    const d = new Date(ts || Date.now());
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startItem = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.floor((startToday - startItem) / 86400000);

    if (diffDays <= 0) return t("SIN.Manager.BucketToday");
    if (diffDays === 1) return t("SIN.Manager.BucketYesterday");
    if (diffDays <= 7) return t("SIN.Manager.BucketLast7Days");
    return t("SIN.Manager.BucketOlder");
  }

  renderGroupedCards(container, sharedNotes, groupBy, showAuthorBadge = false) {
    const groups = new Map();

    if (groupBy === "date") {
      const sorted = [...sharedNotes].sort((a, b) => (b.sharedTimestamp || 0) - (a.sharedTimestamp || 0));
      for (const note of sorted) {
        const bucket = this._getDateBucketLabel(note.sharedTimestamp);
        if (!groups.has(bucket)) groups.set(bucket, []);
        groups.get(bucket).push(note);
      }
    } else {
      for (const note of sharedNotes) {
        const owner = note.ownerName || t("SIN.Sharing.Player");
        if (!groups.has(owner)) groups.set(owner, []);
        groups.get(owner).push(note);
      }
    }

    for (const [groupTitle, notes] of groups.entries()) {
      const sec = document.createElement("div");
      sec.className = "fk-subsection";
      sec.innerHTML = `
        <div class="fk-sub-header">
          <span class="fk-sub-caret">▾</span>
          <span class="fk-sub-title">${this.storage.escapeHtml(groupTitle)}</span>
          <span class="fk-sub-count">${notes.length}</span>
        </div>
        <div class="fk-sub-cards"></div>
      `;

      const cardsContainer = sec.querySelector(".fk-sub-cards");
      const caret = sec.querySelector(".fk-sub-caret");
      sec.querySelector(".fk-sub-header").addEventListener("click", () => {
        const hidden = cardsContainer.style.display === "none";
        cardsContainer.style.display = hidden ? "flex" : "none";
        caret.textContent = hidden ? "▾" : "▸";
        this.view.updateVerticalScrollFade(container);
      });

      for (const note of notes) {
        cardsContainer.appendChild(this._createSharedCardElement(note, showAuthorBadge || groupBy === "date"));
      }

      container.appendChild(sec);
    }
  }

  _createSharedCardElement(note, showAuthorBadge) {
    const card = document.createElement("div");
    card.className = `fk-postit shared ${note.type === "mindmap" ? "mindmap" : ""}`;
    card.dataset.noteId = note.id;
    if (note.color) {
      card.style.borderLeftColor = note.color;
    }

    const iconClass = note.type === "mindmap" ? "fa-project-diagram" : "fa-align-left";
    const displayTitle =
      (note.type === "mindmap"
        ? note.mindmap?.nodes?.[0]?.title || note.title
        : note.title) || t("SIN.Common.UntitledNote");
    const preview = this.storage.extractNotePreview(note);

    card.innerHTML = `
      <div class="fk-postit-top">
        <i class="fas ${iconClass} fk-type-icon"></i>
        <div class="fk-postit-title">${this.storage.escapeHtml(displayTitle)}</div>
      </div>
      ${showAuthorBadge ? `<div class="fk-postit-meta"><i class="fas fa-user" style="font-size:9px;"></i> ${this.storage.escapeHtml(note.ownerName)}</div>` : ""}
      ${preview ? `<div class="fk-postit-preview">${this.storage.escapeHtml(preview)}</div>` : ""}
    `;

    card.addEventListener("click", () => {
      this.app.openNote(note.id, note.ownerId);
    });

    return card;
  }
}