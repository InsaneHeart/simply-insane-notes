import { t } from "../shared/shared-i18n.js";

const IMAGE_MANIFEST_FILE = "used-images.txt";
const IMAGE_MANIFEST_HEADER = "# SIMPLY-INSANE-NOTES-MANIFEST";

export class StorageMedia {
  constructor(storage) {
    this.storage = storage;
    this._lastImageManifest = null;
  }

  _getFilePicker() {
    return (
      foundry.applications?.apps?.FilePicker?.implementation ??
      globalThis.FilePicker ??
      null
    );
  }

  _getWorldBaseDir() {
    const worldId = game.world?.id || "default";
    return `worlds/${worldId}/${this.storage.moduleId}`;
  }

  _getWorldImagesDir() {
    return `${this._getWorldBaseDir()}/images`;
  }

  _canUploadFiles() {
    if (!game.user) return false;
    if (game.user.isGM) return true;
    if (typeof game.user.hasPermission === "function") {
      return game.user.hasPermission("FILES_UPLOAD");
    }
    if (typeof game.user.can === "function") {
      return game.user.can("FILES_UPLOAD");
    }
    return false;
  }

  async _ensureDirectory(FP, dirPath) {
    const parts = dirPath.split("/").filter(Boolean);
    let current = "";

    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      try {
        await FP.browse("data", current);
      } catch {
        try {
          await FP.createDirectory("data", current);
        } catch {}
      }
    }
  }

  async _hashFile(file) {
    const buffer = await file.arrayBuffer();
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 24);
    }

    const bytes = new Uint8Array(buffer);
    let h1 = 0x811c9dc5;
    let h2 = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      h1 ^= bytes[i];
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= bytes[bytes.length - 1 - i];
      h2 = Math.imul(h2, 0x01000193);
    }
    return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}${bytes.length.toString(16)}`;
  }

  _collectUsedImageFilenames() {
    const names = new Set();
    const regex = new RegExp(`${this.storage.moduleId}/images/([^"'?\\s<>#]+)`, "gi");

    const scanText = (text) => {
      if (typeof text !== "string" || !text) return;
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        try {
          names.add(decodeURIComponent(match[1]));
        } catch {
          names.add(match[1]);
        }
      }
    };

    const scanNotes = (notes) => {
      if (!Array.isArray(notes)) return;
      for (const note of notes) {
        scanText(note?.content);
        if (Array.isArray(note?.mindmap?.nodes)) {
          for (const node of note.mindmap.nodes) {
            if (node?.nodeType === "image") scanText(node.imageUrl);
          }
        }
      }
    };

    const me = game.user?.id;
    scanNotes(this.storage._cache?.notes);

    if (game.users) {
      for (const user of game.users) {
        if (user.id === me) continue;
        const uData = user.getFlag(this.storage.moduleId, this.storage.flagKey);
        scanNotes(uData?.notes);
      }
    }

    return Array.from(names).sort();
  }

  async syncUsedImagesManifest() {
    if (!this._canUploadFiles()) return;
    const FP = this._getFilePicker();
    if (!FP) return;

    const files = this._collectUsedImageFilenames();
    const manifestContent = [IMAGE_MANIFEST_HEADER, ...files].join("\r\n") + "\r\n";

    if (manifestContent === this._lastImageManifest) return;

    const baseDir = this._getWorldBaseDir();
    try {
      await this._ensureDirectory(FP, baseDir);
      const manifestFile = new File([manifestContent], IMAGE_MANIFEST_FILE, {
        type: "text/plain"
      });
      await FP.upload("data", baseDir, manifestFile, {}, { notify: false });
      this._lastImageManifest = manifestContent;
    } catch (err) {
      console.error(`${this.storage.moduleTitle} | Error updating image manifest:`, err);
    }
  }

  async uploadNoteImage(file) {
    if (!file) return null;

    if (!this._canUploadFiles()) {
      globalThis.ui?.notifications?.warn(t("SIN.Storage.MediaNoPermission"));
      return null;
    }

    const FP = this._getFilePicker();
    if (!FP) {
      globalThis.ui?.notifications?.error(t("SIN.Storage.MediaPickerUnavailable"));
      return null;
    }

    const targetDir = this._getWorldImagesDir();

    try {
      await this._ensureDirectory(FP, targetDir);

      const rawExt = (file.name?.split(".").pop() || file.type?.split("/").pop() || "png")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const ext = rawExt === "jpeg" ? "jpg" : rawExt || "png";
      const hash = await this._hashFile(file);
      const fileName = `img-${hash}.${ext}`;

      const listing = await FP.browse("data", targetDir);
      const existing = (listing?.files || []).find(
        (p) => p === `${targetDir}/${fileName}` || p.endsWith(`/${fileName}`)
      );
      if (existing) return existing;

      const renamedFile = new File([file], fileName, { type: file.type || "image/png" });
      const response = await FP.upload("data", targetDir, renamedFile, {}, { notify: false });
      return response?.path || null;
    } catch (err) {
      console.error(`${this.storage.moduleTitle} | Error uploading image:`, err);
      globalThis.ui?.notifications?.warn(t("SIN.Storage.MediaUploadError"));
      return null;
    }
  }
}