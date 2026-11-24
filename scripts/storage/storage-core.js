import { NotesExporter } from "./storage-exporter.js";
import { StorageMedia } from "./storage-media.js";
import { StorageSharing } from "./storage-sharing.js";
import { StorageOrganization } from "./storage-organization.js";
import { StorageBulk } from "./storage-bulk.js";
import { t } from "../shared/shared-i18n.js";

export const MODULE_ID = "simply-insane-notes";
export const MODULE_TITLE = "Simply Insane Notes";
export const MODULE_VERSION = "1.0.0 Alpha";

const FLAG_KEY = "notesData";
const SAVE_DEBOUNCE_MS = 650;
const SAVE_MAX_WAIT_MS = 5000;

export const DEFAULT_SETTINGS = {
  uiLanguage: "auto",
  spellcheckEnabled: true,
  spellcheckIgnoreUppercase: false,
  spellcheckLanguages: ["pt-BR", "en-US"],
  customDictionary: []
};

export const ITEM_COLORS = [
  { label: "Padrão", labelKey: "SIN.Colors.Default", hex: "" },
  { label: "Amarelo", labelKey: "SIN.Colors.Yellow", hex: "#eab308" },
  { label: "Azul", labelKey: "SIN.Colors.Blue", hex: "#38bdf8" },
  { label: "Roxo", labelKey: "SIN.Colors.Purple", hex: "#9b87f5" },
  { label: "Verde", labelKey: "SIN.Colors.Green", hex: "#22c55e" },
  { label: "Laranja", labelKey: "SIN.Colors.Orange", hex: "#f97316" },
  { label: "Vermelho", labelKey: "SIN.Colors.Red", hex: "#f43f5e" }
];

export class NotesStorage {
  constructor() {
    this.moduleId = MODULE_ID;
    this.moduleTitle = MODULE_TITLE;
    this.flagKey = FLAG_KEY;

    this._cache = null;
    this._saveTimer = null;
    this._maxWaitTimer = null;
    this._dirty = false;
    this._saving = false;
    this._pendingSave = false;
    this._savePromise = null;
    this._lastUndoSnapshot = null;

    this.media = new StorageMedia(this);
    this.sharing = new StorageSharing(this);
    this.organization = new StorageOrganization(this);
    this.bulk = new StorageBulk(this);
    this.exporter = new NotesExporter(this);
  }

  escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  _buildGmWelcomeNote(defaultColId) {
    const title = t("SIN.GmReadme.Title");
    const content = t("SIN.GmReadme.Body");
    const now = Date.now();
    return {
      id: `note-${foundry.utils.randomID()}`,
      type: "text",
      columnId: defaultColId,
      subsectionId: null,
      order: 0,
      title,
      content,
      mindmap: this.organization.createDefaultMindmap(title),
      color: "#9b87f5",
      favorite: true,
      locked: false,
      ignoredWords: [],
      sharing: {
        isPublic: false,
        sharedWith: [],
        sharedAt: {}
      },
      createdAt: now,
      updatedAt: now,
      isNewlyCreated: false
    };
  }

  _buildDefaultData() {
    const defaultColId = `col-${foundry.utils.randomID()}`;
    const notes = [];

    if (game.user?.isGM) {
      notes.push(this._buildGmWelcomeNote(defaultColId));
    }

    return {
      viewMode: "kanban",
      compactCards: false,
      compactFoldersCards: false,
      sharedDrawerOpen: false,
      sharedGroupBy: "person",
      columns: [
        {
          id: defaultColId,
          title: t("SIN.Common.General"),
          color: "",
          favorite: false,
          kanbanOrder: 0,
          folderCol: 0,
          folderOrder: 0
        }
      ],
      subsections: [],
      notes,
      recentNotes: [],
      settings: { ...DEFAULT_SETTINGS, customDictionary: [] }
    };
  }

  getData() {
    if (!this._cache) {
      const raw = game.user?.getFlag(MODULE_ID, FLAG_KEY);
      if (raw && typeof raw === "object") {
        this._cache = foundry.utils.deepClone(raw);
      } else {
        this._cache = this._buildDefaultData();
      }
      this._normalizeData(this._cache);
    }
    return this._cache;
  }

  _normalizeData(data) {
    if (!Array.isArray(data.columns) || !data.columns.length) {
      data.columns = [
        {
          id: `col-${foundry.utils.randomID()}`,
          title: t("SIN.Common.General"),
          color: "",
          favorite: false,
          kanbanOrder: 0,
          folderCol: 0,
          folderOrder: 0
        }
      ];
    }

    const sideCounters = [0, 0];
    data.columns.forEach((c, idx) => {
      if (typeof c.favorite !== "boolean") c.favorite = false;
      if (typeof c.color !== "string") c.color = "";
      if (typeof c.kanbanOrder !== "number" || Number.isNaN(c.kanbanOrder)) {
        c.kanbanOrder = idx;
      }
      if (c.folderCol !== 0 && c.folderCol !== 1) {
        c.folderCol = idx % 2;
      }
      if (typeof c.folderOrder !== "number" || Number.isNaN(c.folderOrder)) {
        c.folderOrder = sideCounters[c.folderCol]++;
      } else {
        sideCounters[c.folderCol] = Math.max(
          sideCounters[c.folderCol],
          c.folderOrder + 1
        );
      }
    });

    if (!Array.isArray(data.subsections)) data.subsections = [];
    if (!Array.isArray(data.notes)) data.notes = [];
    if (!Array.isArray(data.recentNotes)) data.recentNotes = [];
    if (!data.viewMode) data.viewMode = "kanban";
    if (typeof data.compactCards !== "boolean") data.compactCards = false;
    if (typeof data.compactFoldersCards !== "boolean") {
      data.compactFoldersCards = false;
    }
    if (!data.sharedGroupBy) data.sharedGroupBy = "person";

    if (!data.settings || typeof data.settings !== "object") {
      data.settings = { ...DEFAULT_SETTINGS, customDictionary: [] };
    } else {
      if (typeof data.settings.uiLanguage !== "string") {
        data.settings.uiLanguage = "auto";
      }
      if (typeof data.settings.spellcheckEnabled !== "boolean") {
        data.settings.spellcheckEnabled = true;
      }
      if (typeof data.settings.spellcheckIgnoreUppercase !== "boolean") {
        data.settings.spellcheckIgnoreUppercase = false;
      }
      if (
        !Array.isArray(data.settings.spellcheckLanguages) ||
        !data.settings.spellcheckLanguages.length
      ) {
        data.settings.spellcheckLanguages = ["pt-BR", "en-US"];
      }
      if (!Array.isArray(data.settings.customDictionary)) {
        data.settings.customDictionary = [];
      }
    }

    data.notes.forEach((n) => {
      if (typeof n.locked !== "boolean") n.locked = false;
      if (typeof n.color !== "string") n.color = "";
      if (!Array.isArray(n.ignoredWords)) n.ignoredWords = [];
    });
  }

  /* ================= PERSISTÊNCIA E FILA SEGURA ================= */

  markDirty(data) {
    this._cache = data;
    this._dirty = true;

    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this.flush();
    }, SAVE_DEBOUNCE_MS);

    if (!this._maxWaitTimer) {
      this._maxWaitTimer = setTimeout(() => {
        this._maxWaitTimer = null;
        this.flush();
      }, SAVE_MAX_WAIT_MS);
    }
  }

  async saveNow(data) {
    this._cache = data;
    this._dirty = true;
    this._clearSaveTimers();
    return this._enqueueSave();
  }

  async flush() {
    this._clearSaveTimers();
    if (!this._dirty || !this._cache || !game.user) {
      return this._savePromise;
    }
    return this._enqueueSave();
  }

  _clearSaveTimers() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (this._maxWaitTimer) {
      clearTimeout(this._maxWaitTimer);
      this._maxWaitTimer = null;
    }
  }

  _enqueueSave() {
    if (!game.user || !this._cache) return Promise.resolve();

    if (this._saving) {
      this._pendingSave = true;
      return this._savePromise;
    }

    this._saving = true;
    this._savePromise = (async () => {
      try {
        do {
          this._pendingSave = false;
          this._dirty = false;
          const snapshot = foundry.utils.deepClone(this._cache);
          await game.user.setFlag(MODULE_ID, FLAG_KEY, snapshot);
        } while ((this._pendingSave || this._dirty) && this._cache && game.user);

        this.media.syncUsedImagesManifest().catch(() => {});
      } finally {
        this._saving = false;
        this._savePromise = null;
      }
    })();

    return this._savePromise;
  }

  updateTextNote(noteId, patch, { immediate = false } = {}) {
    if (!noteId || !patch) return false;
    const data = this.getData();
    const target = data.notes.find((n) => n.id === noteId);
    if (!target) return false;

    if (typeof patch.title === "string") target.title = patch.title;
    if (typeof patch.content === "string") target.content = patch.content;
    target.updatedAt = Date.now();

    if (immediate) {
      this.saveNow(data);
    } else {
      this.markDirty(data);
    }
    return true;
  }

  /* ================= SNAPSHOT DE DESFAZER (UNDO) ================= */

  createUndoSnapshot(label = null) {
    this._lastUndoSnapshot = {
      label: label || t("SIN.Storage.UndoBulkAction"),
      data: foundry.utils.deepClone(this.getData()),
      createdAt: Date.now()
    };
    return this._lastUndoSnapshot;
  }

  hasUndoSnapshot() {
    return Boolean(this._lastUndoSnapshot?.data);
  }

  async restoreUndoSnapshot() {
    if (!this._lastUndoSnapshot?.data) return false;
    const restored = foundry.utils.deepClone(this._lastUndoSnapshot.data);
    this._normalizeData(restored);
    this._lastUndoSnapshot = null;
    await this.saveNow(restored);
    return true;
  }

  clearUndoSnapshot() {
    this._lastUndoSnapshot = null;
  }

  /* ================= CONFIGURAÇÕES & DICIONÁRIO PERSONALIZADO ================= */

  getSettings() {
    return this.getData().settings;
  }

  saveSettings(newSettings) {
    const data = this.getData();
    data.settings = {
      ...DEFAULT_SETTINGS,
      ...newSettings,
      customDictionary: Array.isArray(newSettings.customDictionary)
        ? Array.from(
            new Set(
              newSettings.customDictionary
                .map((w) => String(w).trim())
                .filter(Boolean)
            )
          )
        : []
    };
    this.saveNow(data);
  }

  addWordToDictionary(word) {
    const clean = String(word || "").trim();
    if (!clean) return;
    const data = this.getData();
    const exists = data.settings.customDictionary.some(
      (w) => w.toLowerCase() === clean.toLowerCase()
    );
    if (!exists) {
      data.settings.customDictionary.push(clean);
      this.saveNow(data);
    }
  }

  removeWordFromDictionary(word) {
    const clean = String(word || "").trim().toLowerCase();
    const data = this.getData();
    data.settings.customDictionary = data.settings.customDictionary.filter(
      (w) => w.toLowerCase() !== clean
    );
    this.saveNow(data);
  }

  ignoreWordInNote(noteId, word) {
    const clean = String(word || "").trim().toLowerCase();
    if (!clean) return;
    const data = this.getData();
    const note = data.notes.find((n) => n.id === noteId);
    if (!note) return;
    if (!Array.isArray(note.ignoredWords)) note.ignoredWords = [];
    if (!note.ignoredWords.includes(clean)) {
      note.ignoredWords.push(clean);
      this.saveNow(data);
    }
  }

  /* ================= HISTÓRICO DE RECOMENDAÇÕES ================= */

  recordRecentNote(noteId, ownerId = null) {
    if (!noteId) return;
    const resolvedOwner = ownerId || game.user?.id;
    const data = this.getData();
    const filtered = (data.recentNotes || []).filter(
      (item) => item.noteId !== noteId
    );
    filtered.unshift({
      noteId,
      ownerId: resolvedOwner,
      openedAt: Date.now()
    });
    data.recentNotes = filtered.slice(0, 3);
    this.markDirty(data);
  }

  getRecentNotes() {
    const data = this.getData();
    const accessible = this.getAllAccessibleNotes();
    const resolved = [];

    for (const entry of data.recentNotes || []) {
      const found = accessible.find((n) => n.id === entry.noteId);
      if (found) resolved.push(found);
      if (resolved.length >= 3) break;
    }

    return resolved;
  }

  /* ================= DELEGAÇÕES ================= */

  uploadNoteImage(file) {
    return this.media.uploadNoteImage(file);
  }

  _syncUsedImagesManifest() {
    return this.media.syncUsedImagesManifest();
  }

  isNoteShared(note) {
    return this.sharing.isNoteShared(note);
  }

  getUserAccessLevel(note, userId) {
    return this.sharing.getUserAccessLevel(note, userId);
  }

  getNoteSharingSummary(note) {
    return this.sharing.getNoteSharingSummary(note);
  }

  getSharedNotesForCurrentUser() {
    return this.sharing.getSharedNotesForCurrentUser();
  }

  getAllAccessibleNotes() {
    return this.sharing.getAllAccessibleNotes();
  }

  findAnyNoteById(noteId, ownerId = null) {
    return this.sharing.findAnyNoteById(noteId, ownerId);
  }

  openShareSettingsDialog(noteId, options = {}) {
    return this.sharing.openShareSettingsDialog(noteId, options);
  }

  openBulkShareSettingsDialog(noteIds) {
    return this.sharing.openBulkShareSettingsDialog(noteIds);
  }

  getUniqueNoteTitle(desiredTitle, excludeNoteId = null) {
    return this.organization.getUniqueNoteTitle(desiredTitle, excludeNoteId);
  }

  getUniqueColumnTitle(desiredTitle, excludeColId = null) {
    return this.organization.getUniqueColumnTitle(desiredTitle, excludeColId);
  }

  getUniqueSubsectionTitle(columnId, desiredTitle, excludeSubId = null, customData = null) {
    return this.organization.getUniqueSubsectionTitle(
      columnId,
      desiredTitle,
      excludeSubId,
      customData
    );
  }

  getDefaultNoteTitle() {
    return this.organization.getDefaultNoteTitle();
  }

  getKanbanColumns(customData = null) {
    return this.organization.getKanbanColumns(customData);
  }

  getFolderColumnsBySide(sideIdx, customData = null) {
    return this.organization.getFolderColumnsBySide(sideIdx, customData);
  }

  reorderKanbanColumn(colId, targetColId) {
    return this.organization.reorderKanbanColumn(colId, targetColId);
  }

  reorderFolderColumn(colId, destSideIdx, targetInsertIndex) {
    return this.organization.reorderFolderColumn(colId, destSideIdx, targetInsertIndex);
  }

  getColumnRootItems(columnId, customData = null) {
    return this.organization.getColumnRootItems(columnId, customData);
  }

  normalizeColumnRootOrders(columnId, customData = null) {
    return this.organization.normalizeColumnRootOrders(columnId, customData);
  }

  moveSubsectionToPosition(subId, currentColId, targetColId, targetIndex) {
    return this.organization.moveSubsectionToPosition(
      subId,
      currentColId,
      targetColId,
      targetIndex
    );
  }

  moveNoteToPosition(noteId, currentColId, currentSubId, targetColId, targetSubId, targetIndex) {
    return this.organization.moveNoteToPosition(
      noteId,
      currentColId,
      currentSubId,
      targetColId,
      targetSubId,
      targetIndex
    );
  }

  createDefaultMindmap(rootTitle = null) {
    return this.organization.createDefaultMindmap(rootTitle);
  }

  createNote(columnId = null, type = "text", subsectionId = null) {
    return this.organization.createNote(columnId, type, subsectionId);
  }

  createColumn(desiredTitle = null, preferredFolderCol = null) {
    return this.organization.createColumn(desiredTitle, preferredFolderCol);
  }

  createSubsection(columnId, title = null) {
    return this.organization.createSubsection(columnId, title);
  }

  setColumnColor(colId, colorHex) {
    return this.organization.setColumnColor(colId, colorHex);
  }

  setNoteColor(noteId, colorHex) {
    return this.organization.setNoteColor(noteId, colorHex);
  }

  toggleColumnFavorite(colId) {
    return this.organization.toggleColumnFavorite(colId);
  }

  toggleFavorite(noteId) {
    return this.organization.toggleFavorite(noteId);
  }

  toggleNoteLock(noteId) {
    return this.organization.toggleNoteLock(noteId);
  }

  duplicateNote(noteId) {
    return this.organization.duplicateNote(noteId);
  }

  sortNotes(notes) {
    return this.organization.sortNotes(notes);
  }

  extractNotePreview(note, maxLen = 140) {
    return this.organization.extractNotePreview(note, maxLen);
  }

  bulkMoveNotesToPosition(noteIds, targetColId, targetSubId, targetIndex) {
    return this.bulk.bulkMoveNotesToPosition(noteIds, targetColId, targetSubId, targetIndex);
  }

  bulkSetFavorite(selectionType, ids, favValue) {
    return this.bulk.bulkSetFavorite(selectionType, ids, favValue);
  }

  bulkSetColor(selectionType, ids, colorHex) {
    return this.bulk.bulkSetColor(selectionType, ids, colorHex);
  }

  bulkDeleteNotesWithConfirm(noteIds) {
    return this.bulk.bulkDeleteNotesWithConfirm(noteIds);
  }

  bulkDeleteColumnsWithConfirm(colIds, viewMode = "kanban") {
    return this.bulk.bulkDeleteColumnsWithConfirm(colIds, viewMode);
  }

  bulkReorderKanbanColumns(colIds, targetColId) {
    return this.bulk.bulkReorderKanbanColumns(colIds, targetColId);
  }

  bulkReorderFolderColumns(colIds, destSideIdx, targetInsertIndex) {
    return this.bulk.bulkReorderFolderColumns(colIds, destSideIdx, targetInsertIndex);
  }

  deleteColumnWithConfirm(colId, viewMode = "kanban") {
    return this.bulk.deleteColumnWithConfirm(colId, viewMode);
  }

  deleteSubsectionWithConfirm(subId) {
    return this.bulk.deleteSubsectionWithConfirm(subId);
  }

  exportBackupJson() {
    return this.exporter.exportBackupJson();
  }

  promptRestoreBackupJson(onComplete) {
    return this.exporter.promptRestoreBackupJson(onComplete);
  }

  downloadNote(noteId, ownerId = null, format = "md") {
    return this.exporter.downloadNote(noteId, ownerId, format);
  }

  downloadNotesAsZip(noteIds = []) {
    return this.exporter.downloadNotesAsZip(noteIds);
  }

  _getNearestColumn(data, colId, viewMode = "kanban") {
    return this.bulk._getNearestColumn(data, colId, viewMode);
  }

  _transferColumnContentToFallback(data, sourceColId, fallbackColId) {
    return this.bulk._transferColumnContentToFallback(data, sourceColId, fallbackColId);
  }
}