import { t } from "../shared/shared-i18n.js";

export class StorageOrganization {
  constructor(storage) {
    this.storage = storage;
  }

  getUniqueNoteTitle(desiredTitle, excludeNoteId = null) {
    const data = this.storage.getData();
    const fallback = t("SIN.Common.NewNote");
    const raw = String(desiredTitle || "").trim() || fallback;
    const existingLower = new Set(
      data.notes
        .filter((n) => n.id !== excludeNoteId)
        .map((n) => {
          const title =
            n.type === "mindmap" ? n.mindmap?.nodes?.[0]?.title || n.title : n.title;
          return String(title || "")
            .trim()
            .toLowerCase();
        })
    );

    if (!existingLower.has(raw.toLowerCase())) {
      return raw;
    }

    const base = raw.replace(/\s*\(\d+\)$/, "").trim() || fallback;
    let counter = 1;
    while (existingLower.has(`${base} (${counter})`.toLowerCase())) {
      counter++;
    }
    return `${base} (${counter})`;
  }

  getUniqueColumnTitle(desiredTitle, excludeColId = null) {
    const data = this.storage.getData();
    const fallback = t("SIN.Storage.NewFolder");
    const raw = String(desiredTitle || "").trim() || fallback;
    const existingLower = new Set(
      data.columns
        .filter((c) => c.id !== excludeColId)
        .map((c) =>
          String(c.title || "")
            .trim()
            .toLowerCase()
        )
    );

    if (!existingLower.has(raw.toLowerCase())) {
      return raw;
    }

    const base = raw.replace(/\s*\(\d+\)$/, "").trim() || fallback;
    let counter = 1;
    while (existingLower.has(`${base} (${counter})`.toLowerCase())) {
      counter++;
    }
    return `${base} (${counter})`;
  }

  getUniqueSubsectionTitle(columnId, desiredTitle, excludeSubId = null, customData = null) {
    const data = customData || this.storage.getData();
    const fallback = t("SIN.Storage.NewSubsection");
    const raw = String(desiredTitle || "").trim() || fallback;
    const existingLower = new Set(
      (data.subsections || [])
        .filter((s) => s.columnId === columnId && s.id !== excludeSubId)
        .map((s) =>
          String(s.title || "")
            .trim()
            .toLowerCase()
        )
    );

    if (!existingLower.has(raw.toLowerCase())) {
      return raw;
    }

    const base = raw.replace(/\s*\(\d+\)$/, "").trim() || fallback;
    let counter = 1;
    while (existingLower.has(`${base} (${counter})`.toLowerCase())) {
      counter++;
    }
    return `${base} (${counter})`;
  }

  getDefaultNoteTitle() {
    return this.getUniqueNoteTitle(t("SIN.Common.NewNote"));
  }

  getKanbanColumns(customData = null) {
    const data = customData || this.storage.getData();
    return [...data.columns].sort((a, b) => (a.kanbanOrder ?? 0) - (b.kanbanOrder ?? 0));
  }

  getFolderColumnsBySide(sideIdx, customData = null) {
    const data = customData || this.storage.getData();
    return data.columns
      .filter((c, i) => (c.folderCol === 0 || c.folderCol === 1 ? c.folderCol : i % 2) === sideIdx)
      .sort((a, b) => (a.folderOrder ?? 0) - (b.folderOrder ?? 0));
  }

  reorderKanbanColumn(colId, targetColId) {
    if (!colId || !targetColId || colId === targetColId) return null;
    const data = this.storage.getData();
    const ordered = this.getKanbanColumns(data);
    const fromIdx = ordered.findIndex((c) => c.id === colId);
    const toIdx = ordered.findIndex((c) => c.id === targetColId);
    if (fromIdx < 0 || toIdx < 0) return null;

    const [moved] = ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, moved);
    ordered.forEach((c, idx) => {
      c.kanbanOrder = idx;
    });

    this.storage.saveNow(data);
    return ordered;
  }

  reorderFolderColumn(colId, destSideIdx, targetInsertIndex) {
    const data = this.storage.getData();
    const movedCol = data.columns.find((c) => c.id === colId);
    if (!movedCol) return false;

    const prevSideIdx = movedCol.folderCol === 1 ? 1 : 0;
    const normalizedDest = destSideIdx === 1 ? 1 : 0;

    const destList = this.getFolderColumnsBySide(normalizedDest, data).filter(
      (c) => c.id !== colId
    );
    const clampedIndex = Math.max(0, Math.min(destList.length, targetInsertIndex));

    movedCol.folderCol = normalizedDest;
    destList.splice(clampedIndex, 0, movedCol);
    destList.forEach((c, idx) => {
      c.folderOrder = idx;
    });

    if (prevSideIdx !== normalizedDest) {
      const prevList = this.getFolderColumnsBySide(prevSideIdx, data).filter(
        (c) => c.id !== colId
      );
      prevList.forEach((c, idx) => {
        c.folderOrder = idx;
      });
    }

    this.storage.saveNow(data);
    return true;
  }

  getColumnRootItems(columnId, customData = null) {
    const data = customData || this.storage.getData();
    const rootNotes = data.notes.filter((n) => n.columnId === columnId && !n.subsectionId);
    const colSubsections = (data.subsections || []).filter((s) => s.columnId === columnId);

    const favNotes = rootNotes
      .filter((n) => n.favorite)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((n) => ({ itemType: "note", data: n }));

    const restItems = [
      ...rootNotes.filter((n) => !n.favorite).map((n) => ({ itemType: "note", data: n })),
      ...colSubsections.map((s) => ({ itemType: "subsection", data: s }))
    ].sort((a, b) => {
      const diff = (a.data.order ?? 0) - (b.data.order ?? 0);
      if (diff !== 0) return diff;
      if (a.itemType !== b.itemType) return a.itemType === "note" ? -1 : 1;
      return 0;
    });

    return [...favNotes, ...restItems];
  }

  normalizeColumnRootOrders(columnId, customData = null) {
    const data = customData || this.storage.getData();
    const items = this.getColumnRootItems(columnId, data);
    items.forEach((entry, idx) => {
      entry.data.order = idx;
    });
  }

  moveSubsectionToPosition(subId, currentColId, targetColId, targetIndex) {
    const data = this.storage.getData();
    const movedSub = data.subsections.find((s) => s.id === subId);
    if (!movedSub) return false;

    if (currentColId !== targetColId) {
      movedSub.title = this.getUniqueSubsectionTitle(targetColId, movedSub.title, subId, data);
    }
    movedSub.columnId = targetColId;
    data.notes.forEach((n) => {
      if (n.subsectionId === subId) {
        n.columnId = targetColId;
      }
    });

    const destRootItems = this.getColumnRootItems(targetColId, data).filter(
      (entry) => !(entry.itemType === "subsection" && entry.data.id === subId)
    );

    const favCount = destRootItems.filter(
      (entry) => entry.itemType === "note" && entry.data.favorite
    ).length;
    const clampedIdx = Math.max(favCount, Math.min(destRootItems.length, targetIndex));

    destRootItems.splice(clampedIdx, 0, {
      itemType: "subsection",
      data: movedSub
    });
    destRootItems.forEach((entry, idx) => {
      entry.data.order = idx;
    });

    if (currentColId && currentColId !== targetColId) {
      this.normalizeColumnRootOrders(currentColId, data);
    }

    this.storage.saveNow(data);
    return true;
  }

  moveNoteToPosition(
    noteId,
    currentColId,
    currentSubId,
    targetColId,
    targetSubId,
    targetIndex
  ) {
    const data = this.storage.getData();
    const movedNote = data.notes.find((n) => n.id === noteId);
    if (!movedNote) return false;

    movedNote.columnId = targetColId;
    movedNote.subsectionId = targetSubId || null;

    if (targetSubId) {
      const targetSub = data.subsections.find((s) => s.id === targetSubId);
      if (targetSub) targetSub.collapsed = false;

      const destList = this.sortNotes(
        data.notes.filter(
          (n) => n.columnId === targetColId && n.subsectionId === targetSubId && n.id !== noteId
        )
      );
      const favCount = destList.filter((n) => n.favorite).length;
      const clampedIdx = movedNote.favorite
        ? Math.min(favCount, Math.max(0, targetIndex))
        : Math.max(favCount, Math.min(destList.length, targetIndex));

      destList.splice(clampedIdx, 0, movedNote);
      destList.forEach((n, idx) => {
        n.order = idx;
      });
    } else {
      const destRootItems = this.getColumnRootItems(targetColId, data).filter(
        (entry) => !(entry.itemType === "note" && entry.data.id === noteId)
      );

      const favCount = destRootItems.filter(
        (entry) => entry.itemType === "note" && entry.data.favorite
      ).length;

      const clampedIdx = movedNote.favorite
        ? Math.min(favCount, Math.max(0, targetIndex))
        : Math.max(favCount, Math.min(destRootItems.length, targetIndex));

      destRootItems.splice(clampedIdx, 0, {
        itemType: "note",
        data: movedNote
      });
      destRootItems.forEach((entry, idx) => {
        entry.data.order = idx;
      });
    }

    if (currentColId && currentColId !== targetColId) {
      this.normalizeColumnRootOrders(currentColId, data);
    } else if (currentSubId && !targetSubId) {
      const oldSubNotes = this.sortNotes(
        data.notes.filter((n) => n.columnId === currentColId && n.subsectionId === currentSubId)
      );
      oldSubNotes.forEach((n, idx) => {
        n.order = idx;
      });
    } else if (!currentSubId && targetSubId) {
      this.normalizeColumnRootOrders(currentColId, data);
    }

    this.storage.saveNow(data);
    return true;
  }

  createDefaultMindmap(rootTitle = null) {
    return {
      nodes: [
        {
          id: `node-${foundry.utils.randomID()}`,
          nodeType: "text",
          x: 1920,
          y: 1975,
          title: rootTitle || t("SIN.Common.NewNote"),
          details: "",
          color: "",
          collapsed: false
        }
      ],
      edges: []
    };
  }

  createNote(columnId = null, type = "text", subsectionId = null) {
    const data = this.storage.getData();
    const firstOrderedCol =
      data.viewMode === "list"
        ? this.getFolderColumnsBySide(0, data)[0] || this.getFolderColumnsBySide(1, data)[0]
        : this.getKanbanColumns(data)[0];

    const targetColId =
      columnId && data.columns.some((c) => c.id === columnId)
        ? columnId
        : firstOrderedCol?.id || data.columns[0]?.id;

    const title = this.getUniqueNoteTitle(t("SIN.Common.NewNote"));
    let newNoteOrder = 0;

    if (!subsectionId) {
      const rootItems = this.getColumnRootItems(targetColId, data);
      const favItems = rootItems.filter(
        (item) => item.itemType === "note" && item.data.favorite
      );
      const nonFavItems = rootItems.filter(
        (item) => !(item.itemType === "note" && item.data.favorite)
      );

      favItems.forEach((item, idx) => {
        item.data.order = idx;
      });
      newNoteOrder = favItems.length;
      nonFavItems.forEach((item, idx) => {
        item.data.order = favItems.length + 1 + idx;
      });
    } else {
      const siblings = this.sortNotes(
        data.notes.filter((n) => n.columnId === targetColId && n.subsectionId === subsectionId)
      );
      const favSiblings = siblings.filter((n) => n.favorite);
      const nonFavSiblings = siblings.filter((n) => !n.favorite);

      favSiblings.forEach((n, idx) => {
        n.order = idx;
      });
      newNoteOrder = favSiblings.length;
      nonFavSiblings.forEach((n, idx) => {
        n.order = favSiblings.length + 1 + idx;
      });
    }

    const newNote = {
      id: `note-${foundry.utils.randomID()}`,
      type,
      columnId: targetColId,
      subsectionId: subsectionId || null,
      order: newNoteOrder,
      title,
      content: "",
      mindmap: this.createDefaultMindmap(title),
      color: "",
      favorite: false,
      locked: false,
      ignoredWords: [],
      sharing: {
        isPublic: false,
        sharedWith: [],
        sharedAt: {}
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isNewlyCreated: true
    };

    data.notes.push(newNote);
    this.storage.saveNow(data);
    return newNote;
  }

  createColumn(desiredTitle = null, preferredFolderCol = null) {
    const data = this.storage.getData();
    const title = this.getUniqueColumnTitle(desiredTitle || t("SIN.Storage.NewFolder"));
    const col0List = this.getFolderColumnsBySide(0, data);
    const col1List = this.getFolderColumnsBySide(1, data);
    const folderCol =
      preferredFolderCol === 0 || preferredFolderCol === 1
        ? preferredFolderCol
        : col0List.length <= col1List.length
          ? 0
          : 1;

    const targetSideList = folderCol === 0 ? col0List : col1List;
    const maxKanbanOrder = data.columns.reduce((max, c) => Math.max(max, c.kanbanOrder ?? 0), -1);

    const col = {
      id: `col-${foundry.utils.randomID()}`,
      title,
      color: "",
      favorite: false,
      kanbanOrder: maxKanbanOrder + 1,
      folderCol,
      folderOrder: targetSideList.length
    };
    data.columns.push(col);
    this.storage.saveNow(data);
    return col;
  }

  createSubsection(columnId, title = null) {
    const data = this.storage.getData();
    const uniqueTitle = this.getUniqueSubsectionTitle(
      columnId,
      title || t("SIN.Storage.NewSubsection"),
      null,
      data
    );
    const rootItems = this.getColumnRootItems(columnId, data);
    rootItems.forEach((item, idx) => {
      item.data.order = idx;
    });

    const created = {
      id: `sub-${foundry.utils.randomID()}`,
      columnId,
      title: uniqueTitle,
      order: rootItems.length,
      collapsed: true
    };
    data.subsections.push(created);
    this.storage.saveNow(data);
    return created;
  }

  setColumnColor(colId, colorHex) {
    const data = this.storage.getData();
    const col = data.columns.find((c) => c.id === colId);
    if (!col) return;
    col.color = colorHex || "";
    this.storage.saveNow(data);
  }

  setNoteColor(noteId, colorHex) {
    const data = this.storage.getData();
    const note = data.notes.find((n) => n.id === noteId);
    if (!note) return;
    note.color = colorHex || "";
    this.storage.saveNow(data);
  }

  toggleColumnFavorite(colId) {
    const data = this.storage.getData();
    const col = data.columns.find((c) => c.id === colId);
    if (!col) return false;
    col.favorite = !col.favorite;
    this.storage.saveNow(data);
    return col.favorite;
  }

  toggleFavorite(noteId) {
    const data = this.storage.getData();
    const note = data.notes.find((n) => n.id === noteId);
    if (!note) return false;
    note.favorite = !note.favorite;

    if (!note.subsectionId) {
      this.normalizeColumnRootOrders(note.columnId, data);
    } else {
      const siblings = this.sortNotes(
        data.notes.filter((n) => n.columnId === note.columnId && n.subsectionId === note.subsectionId)
      );
      siblings.forEach((n, idx) => {
        n.order = idx;
      });
    }

    this.storage.saveNow(data);
    return note.favorite;
  }

  toggleNoteLock(noteId) {
    const data = this.storage.getData();
    const note = data.notes.find((n) => n.id === noteId);
    if (!note) return false;
    note.locked = !note.locked;
    this.storage.saveNow(data);
    return note.locked;
  }

  duplicateNote(noteId) {
    const data = this.storage.getData();
    const original = data.notes.find((n) => n.id === noteId);
    if (!original) return null;

    const copy = foundry.utils.deepClone(original);
    copy.id = `note-${foundry.utils.randomID()}`;
    copy.title = this.getUniqueNoteTitle(original.title || t("SIN.Common.NewNote"));
    if (copy.type === "mindmap" && copy.mindmap?.nodes?.[0]) {
      copy.mindmap.nodes[0].title = copy.title;
    }
    copy.favorite = false;
    copy.locked = false;
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();

    if (!copy.subsectionId) {
      const rootItems = this.getColumnRootItems(copy.columnId, data);
      const favCount = rootItems.filter(
        (item) => item.itemType === "note" && item.data.favorite
      ).length;
      rootItems.forEach((item, idx) => {
        item.data.order = idx >= favCount ? idx + 1 : idx;
      });
      copy.order = favCount;
    } else {
      const siblings = this.sortNotes(
        data.notes.filter((n) => n.columnId === copy.columnId && n.subsectionId === copy.subsectionId)
      );
      const favCount = siblings.filter((n) => n.favorite).length;
      siblings.forEach((n, idx) => {
        n.order = idx >= favCount ? idx + 1 : idx;
      });
      copy.order = favCount;
    }

    data.notes.push(copy);
    this.storage.saveNow(data);
    return copy;
  }

  sortNotes(notes) {
    return [...notes].sort((a, b) => {
      const favDiff = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
      if (favDiff !== 0) return favDiff;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }

  extractNotePreview(note, maxLen = 140) {
    if (!note) return "";
    if (note.type === "mindmap") {
      const texts = (note.mindmap?.nodes || [])
        .slice(1)
        .map((n) => n.title || n.details || "")
        .map((s) => s.trim())
        .filter(Boolean);
      const joined = texts.join(" • ");
      return joined.length > maxLen ? `${joined.slice(0, maxLen)}...` : joined;
    }

    const tmp = document.createElement("div");
    tmp.innerHTML = note.content || "";
    tmp.querySelectorAll(".fk-img-toolbar, .fk-code-copy-btn").forEach((el) => el.remove());
    const clean = tmp.textContent.replace(/\s+/g, " ").trim();
    return clean.length > maxLen ? `${clean.slice(0, maxLen)}...` : clean;
  }
}