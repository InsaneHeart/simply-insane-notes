import { t } from "../shared/shared-i18n.js";

const MAX_HISTORY_STEPS = 50;

export class MindMapHistory {
  constructor(editor) {
    this.editor = editor;
    this.app = editor.app;
    this.storage = editor.storage;
    this._historyNoteId = null;
    this.undoStack = [];
    this.redoStack = [];
  }

  ensureHistoryForNote(noteId) {
    if (this._historyNoteId !== noteId) {
      this._historyNoteId = noteId;
      this.undoStack = [];
      this.redoStack = [];
    }
  }

  captureNoteState(noteId) {
    const cur = this.storage.getData();
    const tNote = cur.notes.find((n) => n.id === noteId);
    if (!tNote || !tNote.mindmap) return null;
    return {
      title: tNote.title,
      mindmap: foundry.utils.deepClone(tNote.mindmap)
    };
  }

  pushSnapshot(noteId) {
    this.ensureHistoryForNote(noteId);
    const snap = this.captureNoteState(noteId);
    if (!snap) return;

    const last = this.undoStack[this.undoStack.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(snap)) {
      return;
    }

    this.undoStack.push(snap);
    if (this.undoStack.length > MAX_HISTORY_STEPS) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  pushCustomSnapshot(noteId, snap) {
    if (!snap) return;
    this.ensureHistoryForNote(noteId);
    const last = this.undoStack[this.undoStack.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(snap)) {
      return;
    }

    this.undoStack.push(foundry.utils.deepClone(snap));
    if (this.undoStack.length > MAX_HISTORY_STEPS) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(noteId, redraw) {
    this.ensureHistoryForNote(noteId);
    if (!this.undoStack.length) return;

    const currentSnap = this.captureNoteState(noteId);
    const prevSnap = this.undoStack.pop();
    if (!prevSnap) return;

    if (currentSnap) {
      this.redoStack.push(currentSnap);
    }

    this._applySnapshotToNote(noteId, prevSnap, redraw);
  }

  redo(noteId, redraw) {
    this.ensureHistoryForNote(noteId);
    if (!this.redoStack.length) return;

    const currentSnap = this.captureNoteState(noteId);
    const nextSnap = this.redoStack.pop();
    if (!nextSnap) return;

    if (currentSnap) {
      this.undoStack.push(currentSnap);
    }

    this._applySnapshotToNote(noteId, nextSnap, redraw);
  }

  _applySnapshotToNote(noteId, snap, redraw) {
    const cur = this.storage.getData();
    const tNote = cur.notes.find((n) => n.id === noteId);
    if (!tNote) return;

    tNote.title = snap.title;
    tNote.mindmap = foundry.utils.deepClone(snap.mindmap);
    tNote.updatedAt = Date.now();

    const validIds = new Set((tNote.mindmap?.nodes || []).map((n) => n.id));
    for (const id of Array.from(this.editor.selection.selectedNodeIds)) {
      if (!validIds.has(id)) {
        this.editor.selection.selectedNodeIds.delete(id);
      }
    }
    if (this.editor.selection.selectedNodeIds.size === 0) {
      this.editor.selection.selectionModeActive = false;
    }

    this.storage.markDirty(cur);
    this.app.updateWindowTitle(
      tNote.mindmap?.nodes?.[0]?.title || tNote.title || t("SIN.Common.MindMap")
    );
    redraw();
  }
}