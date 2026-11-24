import { MODULE_ID, MODULE_VERSION } from "./storage.js";
import { getActiveLang, t } from "../shared/shared-i18n.js";

const FLAG_KEY = "notesData";

export class StorageBackup {
  constructor(exporter) {
    this.exporter = exporter;
    this.storage = exporter.storage;
  }

  /* ================= EXPORTAÇÃO COMPLETA (.ZIP COM IMAGENS) ================= */

  async exportBackupZip() {
    if (!game.user?.isGM) return;
    await this.storage.flush();

    const usersSnapshot = {};
    for (const u of game.users || []) {
      const uFlag = u.getFlag(MODULE_ID, FLAG_KEY);
      if (uFlag) {
        usersSnapshot[u.id] = {
          id: u.id,
          name: u.name,
          isGM: Boolean(u.isGM),
          characterName: u.character?.name || "",
          data: foundry.utils.deepClone(uFlag)
        };
      }
    }

    const imageSources = this._collectAllImageSourcesFromUsers(usersSnapshot);
    const zipFiles = [];
    const imagesManifest = {};
    const usedZipNames = new Set();
    let bundledCount = 0;
    let skippedCount = 0;

    if (imageSources.length > 0) {
      ui.notifications.info(t("SIN.Backup.PackingImages", { count: imageSources.length }));
    }

    for (const src of imageSources) {
      try {
        const resp = await fetch(src);
        if (!resp.ok) {
          skippedCount++;
          continue;
        }
        const buf = await resp.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const mimeType = resp.headers.get("content-type")?.split(";")[0]?.trim() || this._guessMimeFromPath(src);
        const fileName = this._buildUniqueImageFilename(src, mimeType, usedZipNames);
        const zipPath = `images/${fileName}`;

        zipFiles.push({ name: zipPath, data: bytes });
        imagesManifest[src] = { zipPath, fileName, mimeType };
        bundledCount++;
      } catch {
        skippedCount++;
      }
    }

    const payload = {
      format: "simply-insane-notes-backup-v2",
      module: MODULE_ID,
      version: MODULE_VERSION,
      exportedAt: new Date().toISOString(),
      worldId: game.world?.id || "",
      worldTitle: game.world?.title || "",
      gmSettings: foundry.utils.deepClone(this.storage.getSettings()),
      images: imagesManifest,
      users: usersSnapshot
    };

    const encoder = new TextEncoder();
    const jsonBytes = encoder.encode(JSON.stringify(payload, null, 2));
    zipFiles.unshift({ name: "backup.json", data: jsonBytes });

    const zipBlob = this.exporter._buildZipBlob(zipFiles);
    const dateStamp = new Date().toISOString().slice(0, 10);
    this.exporter._triggerFileDownload(zipBlob, `simply-insane-notes-backup-${dateStamp}.zip`);

    const profileCount = Object.keys(usersSnapshot).length;
    if (skippedCount > 0) {
      ui.notifications.warn(
        t("SIN.Backup.ExportedWarn", {
          profiles: profileCount,
          images: bundledCount,
          skipped: skippedCount
        })
      );
    } else {
      ui.notifications.info(
        t("SIN.Backup.ExportedOk", {
          profiles: profileCount,
          images: bundledCount
        })
      );
    }
  }

  /* ================= RESTAURAÇÃO (.ZIP OU .JSON COM VÍNCULO DE PERFIS) ================= */

  promptRestoreBackup(onComplete) {
    if (!game.user?.isGM) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,.json,application/zip,application/json";

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        const { parsed, zipEntries } = await this._readBackupFile(file);
        if (!parsed || parsed.module !== MODULE_ID || !parsed.users || typeof parsed.users !== "object") {
          ui.notifications.error(t("SIN.Backup.InvalidFile"));
          return;
        }

        const config = await this._openRestoreMappingDialog(parsed, Boolean(zipEntries));
        if (!config) return;

        await this._executeRestore(parsed, zipEntries, config);
        if (onComplete) onComplete();
      } catch (err) {
        console.error(`${this.storage.moduleTitle} | Backup restore failed:`, err);
        ui.notifications.error(t("SIN.Backup.RestoreFailed"));
      }
    };

    input.click();
  }

  async _readBackupFile(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const isZip =
      file.name.toLowerCase().endsWith(".zip") ||
      (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04);

    if (!isZip) {
      const text = new TextDecoder("utf-8").decode(bytes);
      return { parsed: JSON.parse(text), zipEntries: null };
    }

    const zipEntries = await this._parseZipBuffer(buffer);
    const jsonBytes =
      zipEntries.get("backup.json") ||
      Array.from(zipEntries.entries()).find(([name]) => name.toLowerCase().endsWith(".json"))?.[1];

    if (!jsonBytes) {
      throw new Error("backup.json not found inside .zip archive.");
    }

    const text = new TextDecoder("utf-8").decode(jsonBytes);
    return { parsed: JSON.parse(text), zipEntries };
  }

  async _openRestoreMappingDialog(parsed, isZipArchive) {
    const backupEntries = Object.entries(parsed.users || {});
    if (!backupEntries.length) {
      ui.notifications.warn(t("SIN.Backup.NoProfiles"));
      return null;
    }

    const currentUsers = Array.from(game.users || []);
    const autoAssignedTargets = new Set();

    const guessTargetUserId = (oldUid, entry) => {
      const exactId = currentUsers.find((u) => u.id === oldUid && !autoAssignedTargets.has(u.id));
      if (exactId) {
        autoAssignedTargets.add(exactId.id);
        return exactId.id;
      }

      const normName = String(entry?.name || "").trim().toLowerCase();
      if (normName) {
        const sameName = currentUsers.find(
          (u) => u.name.trim().toLowerCase() === normName && !autoAssignedTargets.has(u.id)
        );
        if (sameName) {
          autoAssignedTargets.add(sameName.id);
          return sameName.id;
        }
      }

      if (entry?.isGM && !autoAssignedTargets.has(game.user.id)) {
        autoAssignedTargets.add(game.user.id);
        return game.user.id;
      }

      return "";
    };

    const locale = getActiveLang() || "en";
    const imageCount = Object.keys(parsed.images || {}).length;
    const exportedLabel = parsed.exportedAt
      ? new Date(parsed.exportedAt).toLocaleString(locale)
      : t("SIN.Backup.UnknownDate");
    const worldLabel = parsed.worldTitle || parsed.worldId || t("SIN.Backup.PreviousWorld");

    const rowsHtml = backupEntries
      .map(([oldUid, entry]) => {
        const suggestedId = guessTargetUserId(oldUid, entry);
        const noteCount = Array.isArray(entry?.data?.notes) ? entry.data.notes.length : 0;
        const folderCount = Array.isArray(entry?.data?.columns) ? entry.data.columns.length : 0;
        const gmBadge = entry?.isGM ? `<span class="fk-backup-gm-badge">GM</span>` : "";

        const noteWord = noteCount === 1 ? t("SIN.Storage.NoteSingular") : t("SIN.Storage.NotePlural");
        const folderWord = folderCount === 1 ? t("SIN.Storage.FolderSingular") : t("SIN.Storage.FolderPlural");

        const optionsHtml = [
          `<option value="">${t("SIN.Backup.IgnoreOption")}</option>`,
          ...currentUsers.map((u) => {
            const extra = u.isGM
              ? ` (${t("SIN.Backup.GmSuffix")})`
              : u.character?.name
                ? ` (${u.character.name})`
                : "";
            const selected = u.id === suggestedId ? "selected" : "";
            return `<option value="${this.storage.escapeHtml(u.id)}" ${selected}>${this.storage.escapeHtml(u.name + extra)}</option>`;
          })
        ].join("");

        return `
          <div class="fk-clean-meta-row">
            <div class="fk-settings-label-col">
              <div class="fk-settings-title">
                ${this.storage.escapeHtml(entry?.name || oldUid)}${gmBadge}
              </div>
              <div class="fk-settings-desc">
                ${noteCount} ${noteWord} • ${folderCount} ${folderWord}
              </div>
            </div>
            <select class="fk-backup-user-map" data-old-uid="${this.storage.escapeHtml(oldUid)}">
              ${optionsHtml}
            </select>
          </div>
        `;
      })
      .join("");

    const legacyWarnHtml = !isZipArchive
      ? `<div class="fk-backup-legacy-warn">
          <i class="fas fa-exclamation-triangle"></i>
          <span>${t("SIN.Backup.LegacyWarn")}</span>
        </div>`
      : "";

    const subtitleImages = isZipArchive
      ? ` • ${imageCount === 1 ? t("SIN.Backup.ImageIncludedSingular", { count: imageCount }) : t("SIN.Backup.ImageIncludedPlural", { count: imageCount })}`
      : "";

    const content = `
      <div class="fk-clean-modal-scroll">
        <div class="fk-modal-top-header">
          <div class="fk-modal-main-title">${t("SIN.Backup.ModalTitle")}</div>
          <div class="fk-modal-subtitle">
            <span>${this.storage.escapeHtml(worldLabel)} • ${this.storage.escapeHtml(exportedLabel)}${subtitleImages}</span>
          </div>
        </div>

        ${legacyWarnHtml}

        <div>
          <div class="fk-clean-section-title">${t("SIN.Backup.ModeSection")}</div>
          <div class="fk-backup-mode-row">
            <label class="fk-backup-mode-option">
              <input type="radio" name="fk-restore-mode" value="replace" checked />
              <span>${t("SIN.Backup.ModeReplace")} <small>(${t("SIN.Backup.ModeReplaceHint")})</small></span>
            </label>
            <label class="fk-backup-mode-option">
              <input type="radio" name="fk-restore-mode" value="merge" />
              <span>${t("SIN.Backup.ModeMerge")} <small>(${t("SIN.Backup.ModeMergeHint")})</small></span>
            </label>
          </div>
        </div>

        <div>
          <div class="fk-clean-section-title">${t("SIN.Backup.MappingSection")}</div>
          <div class="fk-clean-meta-list">${rowsHtml}</div>
        </div>

        ${
          parsed.gmSettings
            ? `<label class="fk-backup-checkbox">
                <input type="checkbox" id="fk-restore-gm-settings" checked />
                <span>${t("SIN.Backup.RestoreGmSettings")}</span>
              </label>`
            : ""
        }

        <div id="fk-restore-validation-msg" class="fk-backup-error"></div>
      </div>
    `;

    return foundry.applications.api.DialogV2.wait({
      classes: ["fk-notes-window", "fk-backup-restore-dialog"],
      window: { title: t("SIN.Backup.WindowTitle"), icon: "fas fa-upload" },
      position: { width: 520 },
      content,
      render: (event, dialog) => {
        const el = dialog.element;
        const selects = Array.from(el.querySelectorAll(".fk-backup-user-map"));
        const modeRadios = Array.from(el.querySelectorAll('input[name="fk-restore-mode"]'));
        const warnEl = el.querySelector("#fk-restore-validation-msg");
        const restoreBtn = el.querySelector('button[data-action="restore"]');

        const validate = () => {
          const mode = el.querySelector('input[name="fk-restore-mode"]:checked')?.value || "replace";
          const chosen = selects.map((s) => s.value).filter(Boolean);

          if (!chosen.length) {
            warnEl.textContent = t("SIN.Backup.ErrSelectOne");
            warnEl.classList.add("is-visible");
            if (restoreBtn) restoreBtn.disabled = true;
            return;
          }

          if (mode === "replace") {
            const seen = new Set();
            let hasDup = false;
            for (const id of chosen) {
              if (seen.has(id)) {
                hasDup = true;
                break;
              }
              seen.add(id);
            }
            if (hasDup) {
              warnEl.textContent = t("SIN.Backup.ErrDuplicateTarget");
              warnEl.classList.add("is-visible");
              if (restoreBtn) restoreBtn.disabled = true;
              return;
            }
          }

          warnEl.classList.remove("is-visible");
          if (restoreBtn) restoreBtn.disabled = false;
        };

        selects.forEach((s) => s.addEventListener("change", validate));
        modeRadios.forEach((r) => r.addEventListener("change", validate));
        validate();
      },
      buttons: [
        {
          action: "restore",
          label: t("SIN.Backup.RestoreBtn"),
          icon: "fas fa-upload",
          default: true,
          callback: (event, button, dialog) => {
            const el = dialog.element;
            const mode = el.querySelector('input[name="fk-restore-mode"]:checked')?.value || "replace";
            const restoreSettings = Boolean(el.querySelector("#fk-restore-gm-settings")?.checked);
            const mapping = {};
            el.querySelectorAll(".fk-backup-user-map").forEach((sel) => {
              if (sel.value) {
                mapping[sel.dataset.oldUid] = sel.value;
              }
            });
            return { mode, restoreSettings, mapping };
          }
        },
        {
          action: "cancel",
          label: t("SIN.Common.Cancel"),
          icon: "fas fa-times",
          callback: () => null
        }
      ],
      rejectClose: false
    });
  }

  async _executeRestore(parsed, zipEntries, { mode, restoreSettings, mapping }) {
    const userIdMap = new Map(Object.entries(mapping));
    const selectedOldIds = Array.from(userIdMap.keys());
    if (!selectedOldIds.length) return;

    const imagePathMap = new Map();
    if (zipEntries && parsed.images && Object.keys(parsed.images).length > 0) {
      const selectedUsersObj = {};
      for (const oldUid of selectedOldIds) {
        if (parsed.users[oldUid]) selectedUsersObj[oldUid] = parsed.users[oldUid];
      }
      const neededSources = this._collectAllImageSourcesFromUsers(selectedUsersObj).filter(
        (src) => Boolean(parsed.images[src])
      );

      if (neededSources.length > 0) {
        ui.notifications.info(t("SIN.Backup.RestoringImages", { count: neededSources.length }));
      }

      for (const oldSrc of neededSources) {
        const meta = parsed.images[oldSrc];
        const bytes = zipEntries.get(meta.zipPath);
        if (!bytes) continue;
        try {
          const imgFile = new File([bytes], meta.fileName || "image.png", {
            type: meta.mimeType || "image/png"
          });
          const uploadedPath = await this.storage.media.uploadNoteImage(imgFile);
          if (uploadedPath) {
            imagePathMap.set(oldSrc, uploadedPath);
          }
        } catch (err) {
          console.warn(`${this.storage.moduleTitle} | Failed to restore image ${meta.fileName}:`, err);
        }
      }
    }

    const groupedByTarget = new Map();
    for (const [oldUid, targetUid] of userIdMap.entries()) {
      const entry = parsed.users[oldUid];
      if (!entry?.data) continue;
      if (!groupedByTarget.has(targetUid)) groupedByTarget.set(targetUid, []);
      groupedByTarget.get(targetUid).push(foundry.utils.deepClone(entry.data));
    }

    let restoredProfiles = 0;
    for (const [targetUid, incomingList] of groupedByTarget.entries()) {
      const targetUser = game.users.get(targetUid);
      if (!targetUser) continue;

      let finalData = null;

      if (mode === "merge") {
        const existingFlag = targetUser.getFlag(MODULE_ID, FLAG_KEY);
        finalData = existingFlag
          ? foundry.utils.deepClone(existingFlag)
          : this.storage._buildDefaultData();
        this.storage._normalizeData(finalData);

        for (const incoming of incomingList) {
          this._remapDataReferences(incoming, userIdMap, imagePathMap);
          this.storage._normalizeData(incoming);
          this._mergeIntoData(finalData, incoming);
        }
      } else {
        finalData = incomingList[0];
        this._remapDataReferences(finalData, userIdMap, imagePathMap);
        this.storage._normalizeData(finalData);
      }

      await targetUser.setFlag(MODULE_ID, FLAG_KEY, finalData);
      restoredProfiles++;

      if (targetUid === game.user.id) {
        this.storage._cache = foundry.utils.deepClone(finalData);
        this.storage._normalizeData(this.storage._cache);
      }
    }

    if (restoreSettings && parsed.gmSettings) {
      this.storage.saveSettings(parsed.gmSettings);
    }

    this.storage.media.syncUsedImagesManifest().catch(() => {});

    if (imagePathMap.size > 0) {
      ui.notifications.info(
        t("SIN.Backup.RestoredSuccessWithImages", {
          profiles: restoredProfiles,
          images: imagePathMap.size
        })
      );
    } else {
      ui.notifications.info(t("SIN.Backup.RestoredSuccess", { profiles: restoredProfiles }));
    }
  }

  /* ================= REMAPEAMENTO DE IDS E IMAGENS ================= */

  _remapDataReferences(data, userIdMap, imagePathMap) {
    const remapUserId = (uid) => (uid && userIdMap.has(uid) ? userIdMap.get(uid) : uid);

    const remapUserIdArray = (arr) => {
      if (!Array.isArray(arr)) return arr;
      const out = [];
      for (const uid of arr) {
        if (uid === "all") {
          out.push(uid);
        } else if (userIdMap.has(uid)) {
          const mapped = userIdMap.get(uid);
          if (!out.includes(mapped)) out.push(mapped);
        }
      }
      return out;
    };

    for (const note of data.notes || []) {
      if (Array.isArray(note.sharedWith)) note.sharedWith = remapUserIdArray(note.sharedWith);
      if (Array.isArray(note.sharedUsers)) note.sharedUsers = remapUserIdArray(note.sharedUsers);
      if (note.sharing && typeof note.sharing === "object") {
        if (Array.isArray(note.sharing.users)) note.sharing.users = remapUserIdArray(note.sharing.users);
        if (Array.isArray(note.sharing.userIds)) note.sharing.userIds = remapUserIdArray(note.sharing.userIds);
        if (Array.isArray(note.sharing.specificUsers)) {
          note.sharing.specificUsers = remapUserIdArray(note.sharing.specificUsers);
        }
      }

      if (typeof note.content === "string" && note.content) {
        const tmp = document.createElement("div");
        tmp.innerHTML = note.content;
        let mutated = false;

        if (imagePathMap.size > 0) {
          tmp.querySelectorAll("img").forEach((img) => {
            const rawSrc = img.getAttribute("src");
            if (rawSrc && imagePathMap.has(rawSrc)) {
              img.setAttribute("src", imagePathMap.get(rawSrc));
              mutated = true;
            }
          });
        }

        tmp.querySelectorAll(".fk-mention[data-user-id]").forEach((chip) => {
          const oldId = chip.dataset.userId;
          if (oldId && userIdMap.has(oldId)) {
            chip.dataset.userId = userIdMap.get(oldId);
            mutated = true;
          }
        });

        tmp.querySelectorAll(".fk-note-link").forEach((chip) => {
          for (const attr of ["data-owner-id", "data-note-owner", "data-open-owner"]) {
            const oldOwner = chip.getAttribute(attr);
            if (oldOwner && userIdMap.has(oldOwner)) {
              chip.setAttribute(attr, userIdMap.get(oldOwner));
              mutated = true;
            }
          }
        });

        if (mutated) {
          note.content = tmp.innerHTML;
        }
      }

      if (Array.isArray(note.mindmap?.nodes)) {
        for (const node of note.mindmap.nodes) {
          if (node.nodeType === "image" && node.imageUrl && imagePathMap.has(node.imageUrl)) {
            node.imageUrl = imagePathMap.get(node.imageUrl);
          }
          if (node.nodeType === "user" && node.linkedUserId) {
            node.linkedUserId = remapUserId(node.linkedUserId);
          }
          if (node.nodeType === "link" && node.linkedOwnerId) {
            node.linkedOwnerId = remapUserId(node.linkedOwnerId);
          }
        }
      }
    }

    if (Array.isArray(data.recentNotes)) {
      for (const rec of data.recentNotes) {
        if (rec?.ownerId && userIdMap.has(rec.ownerId)) {
          rec.ownerId = userIdMap.get(rec.ownerId);
        }
      }
    }
  }

  _mergeIntoData(targetData, incomingData) {
    const existingColIds = new Set(targetData.columns.map((c) => c.id));
    const existingSubIds = new Set(targetData.subsections.map((s) => s.id));
    const existingNoteIds = new Set(targetData.notes.map((n) => n.id));

    const colIdMap = new Map();
    const subIdMap = new Map();

    let nextKanbanOrder = targetData.columns.length;
    const nextFolderOrder = [
      targetData.columns.filter((c) => c.folderCol !== 1).length,
      targetData.columns.filter((c) => c.folderCol === 1).length
    ];

    for (const col of incomingData.columns || []) {
      const oldColId = col.id;
      const newCol = foundry.utils.deepClone(col);
      if (existingColIds.has(newCol.id)) {
        newCol.id = `col-${foundry.utils.randomID()}`;
      }
      existingColIds.add(newCol.id);
      colIdMap.set(oldColId, newCol.id);

      const side = newCol.folderCol === 1 ? 1 : 0;
      newCol.kanbanOrder = nextKanbanOrder++;
      newCol.folderOrder = nextFolderOrder[side]++;
      targetData.columns.push(newCol);
    }

    for (const sub of incomingData.subsections || []) {
      const oldSubId = sub.id;
      const newSub = foundry.utils.deepClone(sub);
      if (existingSubIds.has(newSub.id)) {
        newSub.id = `sub-${foundry.utils.randomID()}`;
      }
      existingSubIds.add(newSub.id);
      subIdMap.set(oldSubId, newSub.id);

      newSub.columnId = colIdMap.get(newSub.columnId) || targetData.columns[0]?.id;
      targetData.subsections.push(newSub);
    }

    for (const note of incomingData.notes || []) {
      const newNote = foundry.utils.deepClone(note);
      if (existingNoteIds.has(newNote.id)) {
        newNote.id = `note-${foundry.utils.randomID()}`;
      }
      existingNoteIds.add(newNote.id);

      newNote.columnId = colIdMap.get(newNote.columnId) || targetData.columns[0]?.id;
      newNote.subsectionId = newNote.subsectionId ? subIdMap.get(newNote.subsectionId) || null : null;
      targetData.notes.push(newNote);
    }
  }

  /* ================= COLETA DE IMAGENS & LEITOR DE ZIP ================= */

  _collectAllImageSourcesFromUsers(usersSnapshot) {
    const sources = new Set();

    const addIfValid = (src) => {
      if (typeof src !== "string") return;
      const clean = src.trim();
      if (!clean || clean.startsWith("data:") || clean.startsWith("blob:")) return;
      sources.add(clean);
    };

    for (const entry of Object.values(usersSnapshot || {})) {
      const notes = entry?.data?.notes;
      if (!Array.isArray(notes)) continue;

      for (const note of notes) {
        if (typeof note?.content === "string" && note.content.includes("<img")) {
          const tmp = document.createElement("div");
          tmp.innerHTML = note.content;
          tmp.querySelectorAll("img").forEach((img) => addIfValid(img.getAttribute("src")));
        }
        if (Array.isArray(note?.mindmap?.nodes)) {
          for (const node of note.mindmap.nodes) {
            if (node?.nodeType === "image") addIfValid(node.imageUrl);
          }
        }
      }
    }

    return Array.from(sources);
  }

  _guessMimeFromPath(src) {
    const ext = String(src || "").split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
    const map = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      svg: "image/svg+xml",
      avif: "image/avif"
    };
    return map[ext] || "image/png";
  }

  _buildUniqueImageFilename(src, mimeType, usedSet) {
    const cleanPath = String(src || "").split("?")[0].split("#")[0];
    let rawName = cleanPath.split("/").pop() || "image";
    try {
      rawName = decodeURIComponent(rawName);
    } catch {}

    rawName = rawName.replace(/[<>:"/\\|?*]+/g, "_");
    const hasExt = /\.[a-z0-9]{2,5}$/i.test(rawName);
    const fallbackExt = (mimeType.split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
    if (!hasExt) rawName = `${rawName}.${fallbackExt}`;

    const dotIdx = rawName.lastIndexOf(".");
    const base = rawName.slice(0, dotIdx).slice(0, 48) || "image";
    const ext = rawName.slice(dotIdx + 1) || fallbackExt;

    let candidate = `${base}.${ext}`;
    let counter = 1;
    while (usedSet.has(candidate.toLowerCase())) {
      candidate = `${base}_${counter}.${ext}`;
      counter++;
    }
    usedSet.add(candidate.toLowerCase());
    return candidate;
  }

  async _parseZipBuffer(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const decoder = new TextDecoder("utf-8");

    let eocdOffset = -1;
    const minOffset = Math.max(0, bytes.length - 65557);
    for (let i = bytes.length - 22; i >= minOffset; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset < 0) {
      throw new Error("ZIP signature (EOCD) not found.");
    }

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);

    const entries = new Map();
    let pos = cdOffset;

    for (let i = 0; i < totalEntries; i++) {
      if (view.getUint32(pos, true) !== 0x02014b50) break;

      const method = view.getUint16(pos + 10, true);
      const compSize = view.getUint32(pos + 20, true);
      const nameLen = view.getUint16(pos + 28, true);
      const extraLen = view.getUint16(pos + 30, true);
      const commentLen = view.getUint16(pos + 32, true);
      const localOffset = view.getUint32(pos + 42, true);

      const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
      pos += 46 + nameLen + extraLen + commentLen;

      if (name.endsWith("/")) continue;
      if (view.getUint32(localOffset, true) !== 0x04034b50) continue;

      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const compressedBytes = bytes.subarray(dataStart, dataStart + compSize);

      if (method === 0) {
        entries.set(name, compressedBytes);
      } else if (method === 8 && typeof DecompressionStream !== "undefined") {
        const ds = new DecompressionStream("deflate-raw");
        const decompressed = await new Response(new Blob([compressedBytes]).stream().pipeThrough(ds)).arrayBuffer();
        entries.set(name, new Uint8Array(decompressed));
      }
    }

    return entries;
  }
}