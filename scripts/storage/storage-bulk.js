import { t } from "../shared/shared-i18n.js";

export class StorageBulk {
  constructor(storage) {
    this.storage = storage;
  }

  /* ================= MOVIMENTAÇÃO E EDIÇÃO EM GRUPO ================= */

  bulkMoveNotesToPosition(noteIds, targetColId, targetSubId, targetIndex) {
    const idSet = new Set(noteIds);
    if (!idSet.size) return [];

    this.storage.createUndoSnapshot(t("SIN.Storage.UndoMoveNotes"));
    const data = this.storage.getData();
    const affectedColIds = new Set([targetColId]);

    const movingNotes = [];
    for (const id of noteIds) {
      const found = data.notes.find((n) => n.id === id);
      if (found) {
        affectedColIds.add(found.columnId);
        movingNotes.push(found);
      }
    }

    if (!movingNotes.length) return [];

    movingNotes.forEach((n) => {
      n.columnId = targetColId;
      n.subsectionId = targetSubId || null;
    });

    const favMoving = movingNotes.filter((n) => n.favorite);
    const nonFavMoving = movingNotes.filter((n) => !n.favorite);

    if (targetSubId) {
      const targetSub = data.subsections.find((s) => s.id === targetSubId);
      if (targetSub) targetSub.collapsed = false;

      const remaining = this.storage.sortNotes(
        data.notes.filter(
          (n) =>
            n.columnId === targetColId &&
            n.subsectionId === targetSubId &&
            !idSet.has(n.id)
        )
      );
      const remFav = remaining.filter((n) => n.favorite);
      const remNonFav = remaining.filter((n) => !n.favorite);

      const favInsertIdx = Math.max(0, Math.min(remFav.length, targetIndex));
      remFav.splice(favInsertIdx, 0, ...favMoving);

      const nonFavInsertIdx = Math.max(
        0,
        Math.min(remNonFav.length, targetIndex - remFav.length)
      );
      remNonFav.splice(nonFavInsertIdx, 0, ...nonFavMoving);

      [...remFav, ...remNonFav].forEach((n, idx) => {
        n.order = idx;
      });
    } else {
      const remainingRoot = this.storage
        .getColumnRootItems(targetColId, data)
        .filter((entry) => !(entry.itemType === "note" && idSet.has(entry.data.id)));

      const remFav = remainingRoot.filter(
        (e) => e.itemType === "note" && e.data.favorite
      );
      const remRest = remainingRoot.filter(
        (e) => !(e.itemType === "note" && e.data.favorite)
      );

      const favEntries = favMoving.map((n) => ({ itemType: "note", data: n }));
      const nonFavEntries = nonFavMoving.map((n) => ({
        itemType: "note",
        data: n
      }));

      const favInsertIdx = Math.max(0, Math.min(remFav.length, targetIndex));
      remFav.splice(favInsertIdx, 0, ...favEntries);

      const restInsertIdx = Math.max(
        0,
        Math.min(remRest.length, targetIndex - remFav.length)
      );
      remRest.splice(restInsertIdx, 0, ...nonFavEntries);

      [...remFav, ...remRest].forEach((entry, idx) => {
        entry.data.order = idx;
      });
    }

    affectedColIds.forEach((colId) => {
      if (colId !== targetColId) {
        this.storage.normalizeColumnRootOrders(colId, data);
      }
      const subs = data.subsections.filter((s) => s.columnId === colId);
      subs.forEach((s) => {
        if (s.id !== targetSubId) {
          const sNotes = this.storage.sortNotes(
            data.notes.filter((n) => n.subsectionId === s.id)
          );
          sNotes.forEach((n, idx) => {
            n.order = idx;
          });
        }
      });
    });

    this.storage.saveNow(data);
    return Array.from(affectedColIds);
  }

  bulkSetFavorite(selectionType, ids, favValue) {
    if (!Array.isArray(ids) || !ids.length) return [];
    this.storage.createUndoSnapshot(
      favValue ? t("SIN.Storage.UndoFavSelected") : t("SIN.Storage.UndoUnfavSelected")
    );

    const data = this.storage.getData();
    const idSet = new Set(ids);
    const affectedColIds = new Set();

    if (selectionType === "folder") {
      data.columns.forEach((c) => {
        if (idSet.has(c.id)) {
          c.favorite = Boolean(favValue);
          affectedColIds.add(c.id);
        }
      });
    } else {
      data.notes.forEach((n) => {
        if (idSet.has(n.id)) {
          n.favorite = Boolean(favValue);
          affectedColIds.add(n.columnId);
        }
      });
      affectedColIds.forEach((colId) => {
        this.storage.normalizeColumnRootOrders(colId, data);
        data.subsections
          .filter((s) => s.columnId === colId)
          .forEach((sub) => {
            const subNotes = this.storage.sortNotes(
              data.notes.filter((n) => n.subsectionId === sub.id)
            );
            subNotes.forEach((n, idx) => {
              n.order = idx;
            });
          });
      });
    }

    this.storage.saveNow(data);
    return Array.from(affectedColIds);
  }

  bulkSetColor(selectionType, ids, colorHex) {
    if (!Array.isArray(ids) || !ids.length) return [];
    this.storage.createUndoSnapshot(t("SIN.Storage.UndoColorBulk"));

    const data = this.storage.getData();
    const idSet = new Set(ids);
    const affectedColIds = new Set();

    if (selectionType === "folder") {
      data.columns.forEach((c) => {
        if (idSet.has(c.id)) {
          c.color = colorHex || "";
          affectedColIds.add(c.id);
        }
      });
    } else {
      data.notes.forEach((n) => {
        if (idSet.has(n.id)) {
          n.color = colorHex || "";
          affectedColIds.add(n.columnId);
        }
      });
    }

    this.storage.saveNow(data);
    return Array.from(affectedColIds);
  }

  /* ================= EXCLUSÕES EM GRUPO E INDIVIDUAIS COM TRANSFERÊNCIA ================= */

  async bulkDeleteNotesWithConfirm(noteIds) {
    if (!Array.isArray(noteIds) || !noteIds.length) return null;
    const count = noteIds.length;
    const noteWord = count === 1 ? t("SIN.Storage.NoteSingular") : t("SIN.Storage.NotePlural");

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("SIN.Storage.DeleteSelectedNotesTitle") },
      content: `<p>${t("SIN.Storage.DeleteSelectedNotesConfirm", { count, word: noteWord })}</p>`,
      yes: { label: t("SIN.Common.Delete"), icon: "fas fa-trash" },
      no: { label: t("SIN.Common.Cancel"), default: true }
    });
    if (!confirmed) return null;

    this.storage.createUndoSnapshot(t("SIN.Storage.UndoDeleteNotes", { count, word: noteWord }));
    const data = this.storage.getData();
    const idSet = new Set(noteIds);
    const affectedColIds = new Set();

    data.notes.forEach((n) => {
      if (idSet.has(n.id)) affectedColIds.add(n.columnId);
    });

    data.notes = data.notes.filter((n) => !idSet.has(n.id));
    data.recentNotes = (data.recentNotes || []).filter(
      (r) => !idSet.has(r.noteId)
    );

    affectedColIds.forEach((colId) =>
      this.storage.normalizeColumnRootOrders(colId, data)
    );
    await this.storage.saveNow(data);
    return Array.from(affectedColIds);
  }

  _transferColumnContentToFallback(data, sourceColId, fallbackColId) {
    const existingTargetItems = this.storage.getColumnRootItems(fallbackColId, data);
    const sourceRootItems = this.storage.getColumnRootItems(sourceColId, data);
    const baseOffset = existingTargetItems.length;

    data.subsections.forEach((s) => {
      if (s.columnId === sourceColId) {
        s.title = this.storage.getUniqueSubsectionTitle(
          fallbackColId,
          s.title,
          s.id,
          data
        );
        s.columnId = fallbackColId;
      }
    });

    data.notes.forEach((n) => {
      if (n.columnId === sourceColId) {
        n.columnId = fallbackColId;
      }
    });

    sourceRootItems.forEach((entry, idx) => {
      entry.data.order = baseOffset + idx;
    });

    this.storage.normalizeColumnRootOrders(fallbackColId, data);
  }

  _getNearestColumn(data, colId, viewMode = "kanban") {
    const targetCol = data.columns.find((c) => c.id === colId);
    if (!targetCol) return data.columns.find((c) => c.id !== colId) || null;

    if (viewMode === "list") {
      const targetSide = targetCol.folderCol === 1 ? 1 : 0;
      const sameSide = this.storage.getFolderColumnsBySide(targetSide, data);
      const sideIdx = sameSide.findIndex((c) => c.id === colId);
      const nearestSameSide = sameSide[sideIdx - 1] || sameSide[sideIdx + 1];
      if (nearestSameSide) return nearestSameSide;

      const otherSide = this.storage.getFolderColumnsBySide(
        targetSide === 0 ? 1 : 0,
        data
      );
      if (otherSide.length) {
        return otherSide[Math.min(sideIdx, otherSide.length - 1)] || otherSide[0];
      }
    }

    const kanbanCols = this.storage.getKanbanColumns(data);
    const kIdx = kanbanCols.findIndex((c) => c.id === colId);
    return (
      kanbanCols[kIdx - 1] ||
      kanbanCols[kIdx + 1] ||
      kanbanCols.find((c) => c.id !== colId) ||
      null
    );
  }

  async bulkDeleteColumnsWithConfirm(colIds, viewMode = "kanban") {
    const data = this.storage.getData();
    const idSet = new Set(colIds);
    let remainingCols = data.columns.filter((c) => !idSet.has(c.id));

    if (remainingCols.length === 0) {
      const keepFirst = data.columns[0];
      if (!keepFirst) return false;
      idSet.delete(keepFirst.id);
      remainingCols = [keepFirst];
      if (idSet.size === 0) {
        ui.notifications.warn(t("SIN.Storage.KeepAtLeastOneFolder"));
        return false;
      }
    }

    const affectedNotes = data.notes.filter((n) => idSet.has(n.columnId));
    const affectedSubs = data.subsections.filter((s) => idSet.has(s.columnId));
    const foldersCount = idSet.size;
    const folderWord =
      foldersCount === 1 ? t("SIN.Storage.FolderSingular") : t("SIN.Storage.FolderPlural");

    if (affectedNotes.length === 0 && affectedSubs.length === 0) {
      this.storage.createUndoSnapshot(
        t("SIN.Storage.UndoDeleteFolders", { count: foldersCount, word: folderWord })
      );
      data.columns = data.columns.filter((c) => !idSet.has(c.id));
      await this.storage.saveNow(data);
      return true;
    }

    const fallbackCol = remainingCols[0];
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: t("SIN.Storage.DeleteSelectedFoldersTitle"), icon: "fas fa-trash" },
      position: { width: 460 },
      content: `
        <div style="display:flex; flex-direction:column; gap:8px; padding:2px 0;">
          <p style="margin:0;">${t("SIN.Storage.DeleteSelectedFoldersPrompt", {
            folders: foldersCount,
            notes: affectedNotes.length,
            subs: affectedSubs.length
          })}</p>
          <ul style="margin:4px 0 2px 18px; font-size:12.5px; color:#d4d4d8; line-height:1.5;">
            <li>${t("SIN.Storage.DeleteFoldersKeepDesc", { target: this.storage.escapeHtml(fallbackCol.title) })}</li>
            <li>${t("SIN.Storage.DeleteFoldersAllDesc")}</li>
          </ul>
        </div>
      `,
      buttons: [
        {
          action: "keep",
          label: t("SIN.Storage.KeepFilesBtn"),
          icon: "fas fa-folder-open",
          callback: () => "keep"
        },
        {
          action: "delete-all",
          label: t("SIN.Storage.DeleteAllBtn"),
          icon: "fas fa-trash",
          callback: () => "delete-all"
        },
        {
          action: "cancel",
          label: t("SIN.Common.Cancel"),
          icon: "fas fa-times",
          default: true,
          callback: () => null
        }
      ],
      rejectClose: false
    });

    if (!choice || choice === "cancel") return false;

    this.storage.createUndoSnapshot(
      t("SIN.Storage.UndoDeleteFolders", { count: foldersCount, word: folderWord })
    );
    const fresh = this.storage.getData();

    if (choice === "delete-all") {
      const removedNoteIds = new Set(
        fresh.notes.filter((n) => idSet.has(n.columnId)).map((n) => n.id)
      );
      fresh.notes = fresh.notes.filter((n) => !idSet.has(n.columnId));
      fresh.recentNotes = (fresh.recentNotes || []).filter(
        (r) => !removedNoteIds.has(r.noteId)
      );
      fresh.subsections = fresh.subsections.filter((s) => !idSet.has(s.columnId));
    } else {
      for (const sourceColId of idSet) {
        this._transferColumnContentToFallback(fresh, sourceColId, fallbackCol.id);
      }
    }

    fresh.columns = fresh.columns.filter((c) => !idSet.has(c.id));
    await this.storage.saveNow(fresh);
    return true;
  }

  async deleteColumnWithConfirm(colId, viewMode = "kanban") {
    const data = this.storage.getData();
    if (data.columns.length <= 1) return false;

    const col = data.columns.find((c) => c.id === colId);
    if (!col) return false;

    const colNotes = data.notes.filter((n) => n.columnId === colId);
    const colSubs = data.subsections.filter((s) => s.columnId === colId);

    if (colNotes.length === 0 && colSubs.length === 0) {
      data.columns = data.columns.filter((c) => c.id !== colId);
      await this.storage.saveNow(data);
      return true;
    }

    const nearestCol = this._getNearestColumn(data, colId, viewMode);
    if (!nearestCol) return false;

    const noteWord = colNotes.length === 1 ? t("SIN.Storage.NoteSingular") : t("SIN.Storage.NotePlural");
    const subWord = colSubs.length === 1 ? t("SIN.Storage.SubSingular") : t("SIN.Storage.SubPlural");
    const summary = colSubs.length
      ? `${colNotes.length} ${noteWord}, ${colSubs.length} ${subWord}`
      : `${colNotes.length} ${noteWord}`;

    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: t("SIN.Storage.DeleteFolderTitle"), icon: "fas fa-trash" },
      position: { width: 460 },
      content: `
        <div style="display:flex; flex-direction:column; gap:8px; padding:2px 0;">
          <p style="margin:0;">${t("SIN.Storage.DeleteFolderPrompt", {
            title: this.storage.escapeHtml(col.title),
            summary
          })}</p>
          <ul style="margin:4px 0 2px 18px; font-size:12.5px; color:#d4d4d8; line-height:1.5;">
            <li>${t("SIN.Storage.DeleteFolderKeepDesc", { target: this.storage.escapeHtml(nearestCol.title) })}</li>
            <li>${t("SIN.Storage.DeleteFolderAllDesc")}</li>
          </ul>
        </div>
      `,
      buttons: [
        {
          action: "keep",
          label: t("SIN.Storage.KeepFilesBtn"),
          icon: "fas fa-folder-open",
          callback: () => "keep"
        },
        {
          action: "delete-all",
          label: t("SIN.Storage.DeleteAllBtn"),
          icon: "fas fa-trash",
          callback: () => "delete-all"
        },
        {
          action: "cancel",
          label: t("SIN.Common.Cancel"),
          icon: "fas fa-times",
          default: true,
          callback: () => null
        }
      ],
      rejectClose: false
    });

    if (!choice || choice === "cancel") return false;

    const fresh = this.storage.getData();
    if (fresh.columns.length <= 1) return false;
    const fallbackCol = this._getNearestColumn(fresh, colId, viewMode);
    if (!fallbackCol) return false;

    if (choice === "delete-all") {
      const removedIds = new Set(
        fresh.notes.filter((n) => n.columnId === colId).map((n) => n.id)
      );
      fresh.notes = fresh.notes.filter((n) => n.columnId !== colId);
      fresh.recentNotes = (fresh.recentNotes || []).filter(
        (r) => !removedIds.has(r.noteId)
      );
      fresh.subsections = fresh.subsections.filter((s) => s.columnId !== colId);
    } else {
      this._transferColumnContentToFallback(fresh, colId, fallbackCol.id);
    }

    fresh.columns = fresh.columns.filter((c) => c.id !== colId);
    await this.storage.saveNow(fresh);
    return true;
  }

  async deleteSubsectionWithConfirm(subId) {
    const data = this.storage.getData();
    const sub = data.subsections.find((s) => s.id === subId);
    if (!sub) return false;

    const subNotes = data.notes.filter((n) => n.subsectionId === subId);

    if (subNotes.length === 0) {
      const parentColId = sub.columnId;
      data.subsections = data.subsections.filter((s) => s.id !== subId);
      this.storage.normalizeColumnRootOrders(parentColId, data);
      await this.storage.saveNow(data);
      return true;
    }

    const parentCol = data.columns.find((c) => c.id === sub.columnId);
    const noteWord = subNotes.length === 1 ? t("SIN.Storage.NoteSingular") : t("SIN.Storage.NotePlural");
    const summary = `${subNotes.length} ${noteWord}`;

    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: t("SIN.Storage.DeleteSubTitle"), icon: "fas fa-trash" },
      position: { width: 460 },
      content: `
        <div style="display:flex; flex-direction:column; gap:8px; padding:2px 0;">
          <p style="margin:0;">${t("SIN.Storage.DeleteSubPrompt", {
            title: this.storage.escapeHtml(sub.title),
            summary
          })}</p>
          <ul style="margin:4px 0 2px 18px; font-size:12.5px; color:#d4d4d8; line-height:1.5;">
            <li>${t("SIN.Storage.DeleteSubKeepDesc", {
              target: this.storage.escapeHtml(parentCol?.title || t("SIN.Storage.CurrentFolderFallback"))
            })}</li>
            <li>${t("SIN.Storage.DeleteSubAllDesc")}</li>
          </ul>
        </div>
      `,
      buttons: [
        {
          action: "keep",
          label: t("SIN.Storage.KeepFilesBtn"),
          icon: "fas fa-folder-open",
          callback: () => "keep"
        },
        {
          action: "delete-all",
          label: t("SIN.Storage.DeleteAllBtn"),
          icon: "fas fa-trash",
          callback: () => "delete-all"
        },
        {
          action: "cancel",
          label: t("SIN.Common.Cancel"),
          icon: "fas fa-times",
          default: true,
          callback: () => null
        }
      ],
      rejectClose: false
    });

    if (!choice || choice === "cancel") return false;

    const fresh = this.storage.getData();
    const targetSub = fresh.subsections.find((s) => s.id === subId);
    if (!targetSub) return false;
    const parentColId = targetSub.columnId;

    if (choice === "delete-all") {
      const removedIds = new Set(
        fresh.notes.filter((n) => n.subsectionId === subId).map((n) => n.id)
      );
      fresh.notes = fresh.notes.filter((n) => n.subsectionId !== subId);
      fresh.recentNotes = (fresh.recentNotes || []).filter(
        (r) => !removedIds.has(r.noteId)
      );
      fresh.subsections = fresh.subsections.filter((s) => s.id !== subId);
      this.storage.normalizeColumnRootOrders(parentColId, fresh);
    } else {
      const movedNotes = this.storage.sortNotes(
        fresh.notes.filter((n) => n.subsectionId === subId)
      );
      movedNotes.forEach((n) => {
        n.subsectionId = null;
        n.order = targetSub.order ?? 0;
      });
      fresh.subsections = fresh.subsections.filter((s) => s.id !== subId);
      this.storage.normalizeColumnRootOrders(parentColId, fresh);
    }

    await this.storage.saveNow(fresh);
    return true;
  }

  /* ================= REORDENAÇÃO DE PASTAS EM GRUPO ================= */

  bulkReorderKanbanColumns(colIds, targetColId) {
    if (!Array.isArray(colIds) || !colIds.length || !targetColId) return null;
    const idSet = new Set(colIds);
    if (idSet.has(targetColId)) return null;

    this.storage.createUndoSnapshot(t("SIN.Storage.UndoReorderFolders"));
    const data = this.storage.getData();
    const ordered = this.storage.getKanbanColumns(data);

    const moving = [];
    const remaining = [];
    for (const col of ordered) {
      if (idSet.has(col.id)) moving.push(col);
      else remaining.push(col);
    }

    const targetIdx = remaining.findIndex((c) => c.id === targetColId);
    if (targetIdx < 0) return null;

    const origFirstMovingIdx = ordered.findIndex((c) => idSet.has(c.id));
    const origTargetIdx = ordered.findIndex((c) => c.id === targetColId);
    const insertIdx = origFirstMovingIdx < origTargetIdx ? targetIdx + 1 : targetIdx;

    remaining.splice(insertIdx, 0, ...moving);
    remaining.forEach((c, idx) => {
      c.kanbanOrder = idx;
    });

    this.storage.saveNow(data);
    return remaining;
  }

  bulkReorderFolderColumns(colIds, destSideIdx, targetInsertIndex) {
    if (!Array.isArray(colIds) || !colIds.length) return false;
    const idSet = new Set(colIds);

    this.storage.createUndoSnapshot(t("SIN.Storage.UndoMoveFolders"));
    const data = this.storage.getData();
    const normalizedDest = destSideIdx === 1 ? 1 : 0;

    const movingCols = colIds
      .map((id) => data.columns.find((c) => c.id === id))
      .filter(Boolean);
    if (!movingCols.length) return false;

    const destList = this.storage
      .getFolderColumnsBySide(normalizedDest, data)
      .filter((c) => !idSet.has(c.id));

    const clampedIndex = Math.max(0, Math.min(destList.length, targetInsertIndex));
    movingCols.forEach((c) => {
      c.folderCol = normalizedDest;
    });
    destList.splice(clampedIndex, 0, ...movingCols);
    destList.forEach((c, idx) => {
      c.folderOrder = idx;
    });

    const otherSide = normalizedDest === 0 ? 1 : 0;
    const otherList = this.storage
      .getFolderColumnsBySide(otherSide, data)
      .filter((c) => !idSet.has(c.id));
    otherList.forEach((c, idx) => {
      c.folderOrder = idx;
    });

    this.storage.saveNow(data);
    return true;
  }
}