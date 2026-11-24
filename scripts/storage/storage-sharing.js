import { bindCloseOnOutsideClick } from "../shared/shared-ui-utils.js";
import { t } from "../shared/shared-i18n.js";

export class StorageSharing {
  constructor(storage) {
    this.storage = storage;
  }

  isNoteShared(note) {
    if (!note) return false;
    if (note.readOnly) return true;
    return Boolean(
      note.sharing?.isPublic ||
        (Array.isArray(note.sharing?.sharedWith) && note.sharing.sharedWith.length > 0)
    );
  }

  getUserAccessLevel(note, userId) {
    if (!note || !userId) return "none";
    const ownerId = note.ownerId || game.user?.id;
    if (userId === ownerId) return "creator";
    if (note.sharing?.isPublic) return "shared";
    if (Array.isArray(note.sharing?.sharedWith) && note.sharing.sharedWith.includes(userId)) {
      return "shared";
    }
    return "none";
  }

  getNoteSharingSummary(note) {
    if (!note) return t("SIN.Sharing.PrivateShort");
    if (note.readOnly) {
      return t("SIN.Sharing.SharedBy", { owner: note.ownerName || t("SIN.Sharing.Player") });
    }
    if (note.sharing?.isPublic) {
      return t("SIN.Sharing.PublicAll");
    }
    const ids = note.sharing?.sharedWith || [];
    if (ids.length > 0) {
      const names = ids.map((id) => game.users?.get(id)?.name).filter(Boolean);
      return names.length
        ? t("SIN.Sharing.PlayersList", { list: names.join(", ") })
        : t("SIN.Sharing.PlayersCount", { count: ids.length });
    }
    return t("SIN.Sharing.PrivateOnlyYou");
  }

  getSharedNotesForCurrentUser() {
    if (!game.user || !game.users) return [];
    const me = game.user.id;
    const shared = [];

    for (const user of game.users) {
      if (user.id === me) continue;
      const uData = user.getFlag(this.storage.moduleId, this.storage.flagKey);
      if (!uData || !Array.isArray(uData.notes)) continue;

      for (const note of uData.notes) {
        const isPublic = Boolean(note.sharing?.isPublic);
        const sharedWithMe =
          Array.isArray(note.sharing?.sharedWith) && note.sharing.sharedWith.includes(me);
        if (isPublic || sharedWithMe) {
          shared.push({
            ...foundry.utils.deepClone(note),
            ownerId: user.id,
            ownerName: user.name,
            readOnly: true,
            sharedTimestamp:
              note.sharing?.sharedAt?.[me] || note.updatedAt || note.createdAt || Date.now()
          });
        }
      }
    }

    return shared;
  }

  getAllAccessibleNotes() {
    const data = this.storage.getData();
    const own = data.notes.map((n) => ({
      ...n,
      ownerId: game.user?.id,
      ownerName: game.user?.name || t("SIN.Sharing.You"),
      readOnly: false
    }));
    return [...own, ...this.getSharedNotesForCurrentUser()];
  }

  findAnyNoteById(noteId, ownerId = null) {
    if (!noteId) return null;
    const data = this.storage.getData();
    if (!ownerId || ownerId === game.user?.id) {
      const own = data.notes.find((n) => n.id === noteId);
      if (own) {
        return {
          ...own,
          ownerId: game.user?.id,
          ownerName: game.user?.name || t("SIN.Sharing.You"),
          readOnly: false
        };
      }
    }

    const shared = this.getSharedNotesForCurrentUser();
    return shared.find((n) => n.id === noteId && (!ownerId || n.ownerId === ownerId)) || null;
  }

  _buildShareDialogContent({ subtitleHtml = "", isPublic = false, selectedSet = new Set(), preselectUserId = null }) {
    const otherUsers = (game.users || []).filter((u) => u.id !== game.user.id);
    const usersHtml = otherUsers.length
      ? otherUsers
          .map((u) => {
            const isPreselected = Boolean(preselectUserId && u.id === preselectUserId);
            const active = selectedSet.has(u.id) || isPreselected;
            const charName = u.character?.name?.trim() || "";
            const subMeta =
              charName && charName !== u.name
                ? `<span class="fk-share-user-meta">${this.storage.escapeHtml(charName)}</span>`
                : u.isGM
                  ? `<span class="fk-share-user-meta">GM</span>`
                  : "";
            return `
              <div class="fk-filter-toggle fk-share-user-row ${active ? "active" : ""} ${isPreselected ? "is-preselected" : ""}" data-share-user="${u.id}">
                <span class="fk-filter-box"><i class="fas fa-check"></i></span>
                <span class="fk-share-user-name">${this.storage.escapeHtml(u.name)}</span>
                ${subMeta}
              </div>
            `;
          })
          .join("")
      : `<div class="fk-share-empty">${t("SIN.Sharing.NoOtherPlayers")}</div>`;

    return `
      <div class="fk-share-body">
        ${subtitleHtml}
        <div class="fk-filter-toggle fk-share-public-row ${isPublic ? "active" : ""}" data-share-public="1">
          <span class="fk-filter-box"><i class="fas fa-check"></i></span>
          <span>${t("SIN.Sharing.ShareWithAll")}</span>
        </div>
        <div class="fk-share-section-label">${t("SIN.Sharing.OrSelectPlayers")}</div>
        <div class="fk-share-users-list">
          ${usersHtml}
        </div>
      </div>
    `;
  }

  _bindShareDialogToggles(el) {
    el.querySelectorAll(".fk-share-public-row, .fk-share-user-row").forEach((row) => {
      row.addEventListener("click", () => {
        row.classList.toggle("active");
      });
    });
  }

  _readShareDialogState(el) {
    const isPublic = Boolean(el.querySelector(".fk-share-public-row")?.classList.contains("active"));
    const selectedIds = Array.from(el.querySelectorAll(".fk-share-user-row.active")).map(
      (row) => row.dataset.shareUser
    );
    return { isPublic, selectedIds };
  }

  async openShareSettingsDialog(noteId, { preselectUserId = null } = {}) {
    const data = this.storage.getData();
    const note = data.notes.find((n) => n.id === noteId);
    if (!note) return false;

    if (!note.sharing) {
      note.sharing = { isPublic: false, sharedWith: [], sharedAt: {} };
    }

    const content = this._buildShareDialogContent({
      isPublic: Boolean(note.sharing.isPublic),
      selectedSet: new Set(note.sharing.sharedWith || []),
      preselectUserId
    });

    let saved = false;
    let unbindOutside = null;

    await foundry.applications.api.DialogV2.wait({
      classes: ["fk-notes-window", "fk-share-dialog"],
      window: { title: t("SIN.Sharing.DialogTitle"), icon: "fas fa-share-alt" },
      position: { width: 390 },
      content,
      render: (event, dialog) => {
        this._bindShareDialogToggles(dialog.element);
        unbindOutside = bindCloseOnOutsideClick(dialog.element, () => dialog.close());
      },
      buttons: [
        {
          action: "save",
          label: t("SIN.Sharing.Save"),
          icon: "fas fa-check",
          default: true,
          callback: (event, button, dialog) => {
            const { isPublic, selectedIds } = this._readShareDialogState(dialog.element);
            const fresh = this.storage.getData();
            const target = fresh.notes.find((n) => n.id === noteId);
            if (target) {
              const prevAt = target.sharing?.sharedAt || {};
              const nextAt = {};
              const now = Date.now();
              selectedIds.forEach((uid) => {
                nextAt[uid] = prevAt[uid] || now;
              });
              target.sharing = {
                isPublic,
                sharedWith: selectedIds,
                sharedAt: nextAt
              };
              this.storage.saveNow(fresh);
              saved = true;
              ui.notifications.info(t("SIN.Sharing.Updated"));
            }
          }
        },
        {
          action: "cancel",
          label: t("SIN.Common.Cancel"),
          icon: "fas fa-times"
        }
      ],
      rejectClose: false
    });

    unbindOutside?.();
    return saved;
  }

  async openBulkShareSettingsDialog(noteIds) {
    if (!Array.isArray(noteIds) || !noteIds.length) return false;

    const noteWord = noteIds.length === 1 ? t("SIN.Storage.NoteSingular") : t("SIN.Storage.NotePlural");
    const subtitleHtml = `<div class="fk-share-subtitle">${t("SIN.Sharing.BulkSubtitle", { count: noteIds.length, word: noteWord })}</div>`;
    const content = this._buildShareDialogContent({ subtitleHtml });

    let saved = false;
    let unbindOutside = null;

    await foundry.applications.api.DialogV2.wait({
      classes: ["fk-notes-window", "fk-share-dialog"],
      window: {
        title: t("SIN.Sharing.BulkDialogTitle"),
        icon: "fas fa-share-alt"
      },
      position: { width: 400 },
      content,
      render: (event, dialog) => {
        this._bindShareDialogToggles(dialog.element);
        unbindOutside = bindCloseOnOutsideClick(dialog.element, () => dialog.close());
      },
      buttons: [
        {
          action: "save",
          label: t("SIN.Sharing.Save"),
          icon: "fas fa-check",
          default: true,
          callback: (event, button, dialog) => {
            const { isPublic, selectedIds } = this._readShareDialogState(dialog.element);
            this.storage.createUndoSnapshot(t("SIN.Sharing.UndoBulkShare"));
            const fresh = this.storage.getData();
            const idSet = new Set(noteIds);
            const now = Date.now();

            fresh.notes.forEach((target) => {
              if (!idSet.has(target.id)) return;
              const prevAt = target.sharing?.sharedAt || {};
              const nextAt = {};
              selectedIds.forEach((uid) => {
                nextAt[uid] = prevAt[uid] || now;
              });
              target.sharing = {
                isPublic,
                sharedWith: selectedIds,
                sharedAt: nextAt
              };
            });

            this.storage.saveNow(fresh);
            saved = true;
            ui.notifications.info(t("SIN.Sharing.BulkUpdated"));
          }
        },
        {
          action: "cancel",
          label: t("SIN.Common.Cancel"),
          icon: "fas fa-times"
        }
      ],
      rejectClose: false
    });

    unbindOutside?.();
    return saved;
  }
}