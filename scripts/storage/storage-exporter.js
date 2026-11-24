import { CARD_COLORS } from "../mindmap/mindmap-nodes.js";
import { StorageBackup } from "./storage-backup.js";
import { t } from "../shared/shared-i18n.js";

const ANCHOR_OFFSET = 9;

const FA_CROWN_SVG = `<svg class="fk-mm-root-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" width="11" height="9.5" style="position:absolute; top:6px; right:6px; color:#fbbf24; opacity:0.95; z-index:4;"><path fill="currentColor" d="M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6H426.6c30.9 0 57.4-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z"/></svg>`;

const FA_COLLAPSED_SVG = (isRoot) =>
  `<svg class="fk-mm-collapsed-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="10" height="10" style="position:absolute; top:${isRoot ? "19px" : "6px"}; right:6px; color:#a1a1aa; opacity:0.78; z-index:4;"><path fill="currentColor" d="M0 96C0 78.3 14.3 64 32 64H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 128 0 113.7 0 96zM0 256c0-17.7 14.3-32 32-32H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32zM448 416c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32s14.3-32 32-32H288c17.7 0 32 14.3 32 32z"/></svg>`;

const FA_LINK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" width="12.5" height="10.5" style="color:#d8b4fe; margin-right:4px; vertical-align:-1px; display:inline-block;"><path fill="currentColor" d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/></svg>`;

const EXPORT_MINDMAP_CSS = `
  * {
    box-sizing: border-box;
  }
  .fk-export-stage {
    position: relative;
    background-color: #121215;
    background-image: radial-gradient(rgba(255, 255, 255, 0.09) 1px, transparent 1px);
    background-size: 24px 24px;
    overflow: hidden;
  }
  .fk-mindmap-svg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: visible;
    z-index: 1;
  }
  .fk-mindmap-svg line {
    stroke: #71717a;
    stroke-width: 2;
  }
  .fk-mm-node {
    position: absolute;
    min-width: 150px;
    max-width: 260px;
    background: #1f1f24;
    border: 1px solid #3f3f46;
    border-radius: 5px;
    padding: 8px 10px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 2;
  }
  .fk-mm-node.root-node {
    border-color: #f59e0b;
    background: linear-gradient(145deg, #2e1c08 0%, #1c1206 100%);
    box-shadow: 0 0 15px rgba(245, 158, 11, 0.26), inset 0 0 8px rgba(251, 191, 36, 0.08), 0 6px 18px rgba(0, 0, 0, 0.45);
  }
  .fk-mm-node.link-node {
    border-color: #c084fc;
    background: #2a1638 !important;
  }
  .fk-mm-node.link-node .fk-mm-node-details {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-align: left;
  }
  .fk-mm-node.image-node {
    padding: 6px;
    max-width: none;
    min-width: 90px;
  }
  .fk-mm-node.image-node img {
    width: 100%;
    height: auto;
    display: block;
    border-radius: 3px;
  }
  .fk-mm-node.root-node.has-collapsed-icon {
    min-height: 32px;
  }
  .fk-mm-node.root-node .fk-mm-node-title,
  .fk-mm-node.has-collapsed-icon .fk-mm-node-title {
    padding-left: 14px;
    padding-right: 14px;
  }
  .fk-mm-node-title {
    font-size: 13.5px;
    font-weight: 600;
    color: #fafafa;
    text-align: center;
    min-height: 18px;
    padding: 0 4px;
    line-height: 1.3;
    word-break: break-word;
  }
  .fk-mm-node-details {
    font-size: 11.5px;
    line-height: 1.45;
    color: #a1a1aa;
    text-align: justify;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 5px;
    margin-top: 2px;
    min-height: 16px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .fk-mm-node.collapsed .fk-mm-node-details {
    display: none !important;
  }
`;

export class NotesExporter {
  constructor(storage) {
    this.storage = storage;
    this.backup = new StorageBackup(this);
  }

  _triggerFileDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  _sanitizeFilename(name) {
    return (name || t("SIN.Storage.DefaultNoteFilename"))
      .replace(/[<>:"/\\|?*]+/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 60);
  }

  exportBackupJson() {
    return this.backup.exportBackupZip();
  }

  promptRestoreBackupJson(onComplete) {
    return this.backup.promptRestoreBackup(onComplete);
  }

  async downloadNote(noteId, ownerId = null, format = "md") {
    const note = this.storage.findAnyNoteById(noteId, ownerId);
    if (!note) return;

    const title =
      (note.type === "mindmap" ? note.mindmap?.nodes?.[0]?.title || note.title : note.title) ||
      t("SIN.Storage.DefaultNoteFilename");
    const safeName = this._sanitizeFilename(title);

    if (note.type === "mindmap") {
      const canvas = await this._renderMindmapToCanvas(note);
      if (format === "png") {
        canvas.toBlob((blob) => {
          if (blob) this._triggerFileDownload(blob, `${safeName}.png`);
        }, "image/png");
      } else if (format === "jpg" || format === "jpeg") {
        canvas.toBlob((blob) => {
          if (blob) this._triggerFileDownload(blob, `${safeName}.jpg`);
        }, "image/jpeg", 0.95);
      } else if (format === "pdf") {
        const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.94);
        const pdfBlob = this._buildSingleImagePdfBlob(jpegDataUrl, canvas.width, canvas.height);
        this._triggerFileDownload(pdfBlob, `${safeName}.pdf`);
      }
      return;
    }

    const tmp = document.createElement("div");
    tmp.innerHTML = note.content || "";
    tmp.querySelectorAll(".fk-img-toolbar, .fk-code-copy-btn").forEach((el) => el.remove());
    const plainText = `${title}\n${"=".repeat(title.length)}\n\n${tmp.innerText.trim()}`;

    if (format === "txt") {
      const blob = new Blob([plainText], { type: "text/plain;charset=utf-8" });
      this._triggerFileDownload(blob, `${safeName}.txt`);
    } else if (format === "md") {
      const mdText = `# ${title}\n\n${this._htmlToMarkdown(tmp)}`;
      const blob = new Blob([mdText], { type: "text/markdown;charset=utf-8" });
      this._triggerFileDownload(blob, `${safeName}.md`);
    } else if (format === "pdf") {
      const pdfBlob = this._buildTextPdfBlob(title, tmp.innerText.trim());
      this._triggerFileDownload(pdfBlob, `${safeName}.pdf`);
    }
  }

  async downloadNotesAsZip(noteIds = []) {
    if (!Array.isArray(noteIds) || !noteIds.length) return;

    const files = [];
    const usedNames = new Set();
    const encoder = new TextEncoder();

    const getUniqueFileName = (base, ext) => {
      let candidate = `${base}.${ext}`;
      let counter = 1;
      while (usedNames.has(candidate.toLowerCase())) {
        candidate = `${base}_${counter}.${ext}`;
        counter++;
      }
      usedNames.add(candidate.toLowerCase());
      return candidate;
    };

    for (const id of noteIds) {
      const note = this.storage.findAnyNoteById(id, game.user?.id);
      if (!note) continue;

      const title =
        (note.type === "mindmap" ? note.mindmap?.nodes?.[0]?.title || note.title : note.title) ||
        t("SIN.Storage.DefaultNoteFilename");
      const safeBase = this._sanitizeFilename(title);

      if (note.type === "mindmap") {
        const canvas = await this._renderMindmapToCanvas(note);
        const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.95);
        const base64 = jpegDataUrl.split(",")[1] || "";
        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        files.push({
          name: getUniqueFileName(safeBase, "jpg"),
          data: bytes
        });
      } else {
        const tmp = document.createElement("div");
        tmp.innerHTML = note.content || "";
        tmp.querySelectorAll(".fk-img-toolbar, .fk-code-copy-btn").forEach((el) => el.remove());
        const mdText = `# ${title}\n\n${this._htmlToMarkdown(tmp)}`;
        files.push({
          name: getUniqueFileName(safeBase, "md"),
          data: encoder.encode(mdText)
        });
      }
    }

    if (!files.length) return;

    if (files.length === 1) {
      const single = files[0];
      const mime = single.name.endsWith(".jpg") ? "image/jpeg" : "text/markdown;charset=utf-8";
      this._triggerFileDownload(new Blob([single.data], { type: mime }), single.name);
      return;
    }

    const zipBlob = this._buildZipBlob(files);
    const dateStamp = new Date().toISOString().slice(0, 10);
    this._triggerFileDownload(zipBlob, `simply-insane-notes-${dateStamp}.zip`);
    ui.notifications.info(t("SIN.Storage.ZipExported", { count: files.length }));
  }

  _buildZipBlob(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const dataBytes = file.data;
      const crc = this._crc32(dataBytes);
      const size = dataBytes.length;

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHeader.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(centralHeader.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);

      localParts.push(localHeader, dataBytes);
      centralParts.push(centralHeader);
      offset += localHeader.length + size;
    }

    const centralSize = centralParts.reduce((acc, part) => acc + part.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, eocd], { type: "application/zip" });
  }

  _crc32(bytes) {
    if (!this._crcTable) {
      this._crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        this._crcTable[n] = c >>> 0;
      }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = this._crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  _htmlToMarkdown(container) {
    let out = "";
    for (const node of container.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.nodeValue;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName;
        if (tag === "H2") out += `\n## ${node.innerText.trim()}\n`;
        else if (tag === "HR") out += `\n---\n`;
        else if (tag === "BR") out += `\n`;
        else if (node.classList.contains("fk-drawer-block")) {
          const title = node.querySelector(".fk-drawer-title")?.innerText?.trim() || t("SIN.Storage.DrawerFallback");
          const b = node.querySelector(".fk-drawer-body")?.innerText?.trim() || "";
          out += `\n### ${title}\n${b}\n`;
        } else if (node.classList.contains("fk-quote-block")) {
          const b = node.querySelector(".fk-quote-body")?.innerText?.trim() || "";
          const a = node.querySelector(".fk-quote-author")?.innerText?.trim() || "";
          out += `\n> "${b}"${a ? ` — ${a}` : ""}\n`;
        } else if (node.classList.contains("fk-note-callout")) {
          const b = node.querySelector(".fk-note-callout-body")?.innerText?.trim() || "";
          out += `\n> **[Note]** ${b}\n`;
        } else if (node.classList.contains("fk-code-block")) {
          const b = node.querySelector(".fk-code-body")?.innerText || "";
          out += `\n\`\`\`\n${b}\n\`\`\`\n`;
        } else if (tag === "UL") {
          const isCheck = node.classList.contains("fk-checklist");
          node.querySelectorAll(":scope > li").forEach((li) => {
            const prefix = isCheck ? (li.dataset.checked === "true" ? "- [x] " : "- [ ] ") : "- ";
            out += `${prefix}${li.innerText.trim()}\n`;
          });
        } else {
          out += `${this._htmlToMarkdown(node)}\n`;
        }
      }
    }
    return out.replace(/\n{3,}/g, "\n\n").trim();
  }

  _loadImageElement(src) {
    return new Promise((resolve) => {
      if (!src) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async _ensureDataUrl(src) {
    if (!src || src.startsWith("data:")) return src || "";
    const img = await this._loadImageElement(src);
    if (!img) return src;
    try {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth || img.width || 210;
      c.height = img.naturalHeight || img.height || 150;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return c.toDataURL("image/png");
    } catch {
      return src;
    }
  }

  async _renderMindmapToCanvas(note) {
    const rawNodes = foundry.utils.deepClone(note.mindmap?.nodes || []);
    const rootNodeId = rawNodes[0]?.id || null;
    const allAccessibleNotes = this.storage.getAllAccessibleNotes();
    const deletedSuffix = t("SIN.Storage.DeletedNoteSuffix");

    rawNodes.forEach((n) => {
      if (n.nodeType === "link" && n.linkedNoteId) {
        const found = allAccessibleNotes.find((acc) => acc.id === n.linkedNoteId);
        if (!found) {
          n.nodeType = "text";
          delete n.linkedNoteId;
          delete n.linkedOwnerId;
          const rawTitle = String(n.title || t("SIN.Common.UntitledNote")).trim();
          if (!rawTitle.startsWith("Link: ")) {
            n.title = `Link: ${rawTitle}`;
          }
          const baseDetails = String(n.details || "").trim();
          if (!baseDetails) n.details = deletedSuffix;
          else if (!baseDetails.endsWith(deletedSuffix)) {
            n.details = `${baseDetails}\n\n${deletedSuffix}`;
          }
        }
      }
    });

    const sortedByLayer = rawNodes
      .map((node, index) => ({
        node,
        layer: typeof node.layer === "number" && !Number.isNaN(node.layer) ? node.layer : index,
        index
      }))
      .sort((a, b) => (a.layer !== b.layer ? a.layer - b.layer : a.index - b.index))
      .map((entry) => entry.node);

    const edges = note.mindmap?.edges || [];

    const imageMap = new Map();
    await Promise.all(
      sortedByLayer.map(async (n) => {
        if (n.nodeType === "image" && n.imageUrl) {
          const dataUrl = await this._ensureDataUrl(n.imageUrl);
          imageMap.set(n.id, dataUrl);
        }
      })
    );

    const activeWindowEl = document.getElementById("simply-insane-notes-app");
    const computedFont = activeWindowEl
      ? window.getComputedStyle(activeWindowEl).fontFamily
      : '"Signika", "Segoe UI", Roboto, sans-serif';

    const offscreenHost = document.createElement("div");
    offscreenHost.className = "fk-notes-window";
    offscreenHost.style.cssText = `
      position: fixed;
      left: -99999px;
      top: 0;
      width: 4000px;
      height: 4000px;
      pointer-events: none;
      z-index: -9999;
      font-family: ${computedFont};
    `;

    const stage = document.createElement("div");
    stage.className = "fk-export-stage";
    stage.style.width = "4000px";
    stage.style.height = "4000px";

    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("class", "fk-mindmap-svg");
    stage.appendChild(svgEl);

    const domNodesMap = new Map();

    for (let layerIdx = 0; layerIdx < sortedByLayer.length; layerIdx++) {
      const node = sortedByLayer[layerIdx];
      const isRootNode = node.id === rootNodeId;
      const nType = node.nodeType || "text";

      let displayTitle = node.title || "";
      let detailsText = node.details || "";

      if (nType === "link") {
        const linkedNote = allAccessibleNotes.find((x) => x.id === node.linkedNoteId);
        displayTitle = linkedNote
          ? (linkedNote.type === "mindmap"
              ? linkedNote.mindmap?.nodes?.[0]?.title || linkedNote.title
              : linkedNote.title) || t("SIN.Common.UntitledNote")
          : node.title || t("SIN.Storage.LinkedNoteFallback");
        detailsText = linkedNote
          ? this.storage.extractNotePreview(linkedNote, 130)
          : node.details || "";
      }

      const cleanDetails = String(detailsText || "").trim();
      const hasCollapsedIcon = Boolean(nType !== "image" && node.collapsed && cleanDetails);

      const el = document.createElement("div");
      el.className = [
        "fk-mm-node",
        isRootNode ? "root-node" : "",
        nType === "image" ? "image-node" : "",
        nType === "link" ? "link-node" : "",
        node.collapsed ? "collapsed" : "",
        hasCollapsedIcon ? "has-collapsed-icon" : ""
      ]
        .filter(Boolean)
        .join(" ");

      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      el.style.zIndex = String(2 + layerIdx);

      if (node.color && nType !== "link") {
        const colorSpec = CARD_COLORS.find((c) => c.border === node.color);
        el.style.borderColor = node.color;
        if (colorSpec?.bg) el.style.background = colorSpec.bg;
      }

      const rootSvgHtml = isRootNode ? FA_CROWN_SVG : "";
      const collapsedSvgHtml = hasCollapsedIcon ? FA_COLLAPSED_SVG(isRootNode) : "";

      if (nType === "image") {
        el.style.width = `${node.width || 210}px`;
        const hasTitle = Boolean(node.title?.trim());
        const imgSrc = imageMap.get(node.id) || node.imageUrl || "";
        el.innerHTML = `
          ${rootSvgHtml}
          <div class="fk-mm-node-title" style="${hasTitle ? "" : "display:none;"} margin-bottom:4px;">${this.storage.escapeHtml(node.title || "")}</div>
          <img src="${imgSrc}" />
        `;
      } else if (nType === "link") {
        el.innerHTML = `
          ${rootSvgHtml}
          ${collapsedSvgHtml}
          <div class="fk-mm-node-title">${FA_LINK_SVG}${this.storage.escapeHtml(displayTitle)}</div>
          ${
            cleanDetails
              ? `<div class="fk-mm-node-details">${this.storage.escapeHtml(cleanDetails)}</div>`
              : ""
          }
        `;
      } else {
        el.innerHTML = `
          ${rootSvgHtml}
          ${collapsedSvgHtml}
          <div class="fk-mm-node-title">${this.storage.escapeHtml(displayTitle)}</div>
          <div class="fk-mm-node-details" style="${cleanDetails ? "" : "display:none;"}">${this.storage.escapeHtml(cleanDetails)}</div>
        `;
      }

      stage.appendChild(el);
      domNodesMap.set(node.id, el);
    }

    offscreenHost.appendChild(stage);
    document.body.appendChild(offscreenHost);

    const imgs = Array.from(stage.querySelectorAll("img"));
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) resolve();
            else {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }
          })
      )
    );

    const pad = 60;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of sortedByLayer) {
      const domEl = domNodesMap.get(node.id);
      const w = domEl?.offsetWidth || node.renderedW || node.width || 170;
      const h = domEl?.offsetHeight || node.renderedH || node.height || 54;
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + w);
      maxY = Math.max(maxY, node.y + h);
    }

    if (!sortedByLayer.length) {
      minX = 0;
      minY = 0;
      maxX = 480;
      maxY = 320;
    }

    const exportW = Math.max(400, Math.ceil(maxX - minX + pad * 2));
    const exportH = Math.max(280, Math.ceil(maxY - minY + pad * 2));
    const offsetX = -minX + pad;
    const offsetY = -minY + pad;

    stage.style.width = `${exportW}px`;
    stage.style.height = `${exportH}px`;
    stage.style.backgroundPosition = `${((offsetX % 24) + 24) % 24}px ${((offsetY % 24) + 24) % 24}px`;

    svgEl.setAttribute("width", String(exportW));
    svgEl.setAttribute("height", String(exportH));
    svgEl.setAttribute("viewBox", `0 0 ${exportW} ${exportH}`);

    edges.forEach((ed) => {
      const fromNode = rawNodes.find((n) => n.id === ed.from);
      const toNode = rawNodes.find((n) => n.id === ed.to);
      if (!fromNode || !toNode) return;

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(fromNode.x + offsetX + ANCHOR_OFFSET));
      line.setAttribute("y1", String(fromNode.y + offsetY + ANCHOR_OFFSET));
      line.setAttribute("x2", String(toNode.x + offsetX + ANCHOR_OFFSET));
      line.setAttribute("y2", String(toNode.y + offsetY + ANCHOR_OFFSET));
      svgEl.appendChild(line);
    });

    for (const node of sortedByLayer) {
      const domEl = domNodesMap.get(node.id);
      if (domEl) {
        domEl.style.left = `${node.x + offsetX}px`;
        domEl.style.top = `${node.y + offsetY}px`;
      }
    }

    const scaleFactor = 2;
    stage.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    const serializedStage = new XMLSerializer().serializeToString(stage);
    offscreenHost.remove();

    const svgWrapper = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${exportW * scaleFactor}" height="${exportH * scaleFactor}" viewBox="0 0 ${exportW} ${exportH}">
        <style>
          .fk-export-stage { font-family: ${computedFont.replace(/"/g, "'")}; }
          ${EXPORT_MINDMAP_CSS}
        </style>
        <foreignObject x="0" y="0" width="${exportW}" height="${exportH}">
          ${serializedStage}
        </foreignObject>
      </svg>
    `;

    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgWrapper)}`;
    const renderedImg = await this._loadImageElement(svgDataUrl);

    const canvas = document.createElement("canvas");
    canvas.width = exportW * scaleFactor;
    canvas.height = exportH * scaleFactor;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#121215";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (renderedImg) {
      ctx.drawImage(renderedImg, 0, 0, canvas.width, canvas.height);
    }

    return canvas;
  }

  _buildSingleImagePdfBlob(jpegDataUrl, imgW, imgH) {
    const base64 = jpegDataUrl.split(",")[1];
    const binaryStr = atob(base64);
    const imgBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) imgBytes[i] = binaryStr.charCodeAt(i);

    const enc = new TextEncoder();
    const header = enc.encode("%PDF-1.4\n");
    const obj1 = enc.encode("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
    const obj2 = enc.encode("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n");
    const obj3 = enc.encode(
      `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${imgW} ${imgH}] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >> endobj\n`
    );
    const streamCmd = `q ${imgW} 0 0 ${imgH} 0 0 cm /Im1 Do Q`;
    const obj4 = enc.encode(`4 0 obj << /Length ${streamCmd.length} >> stream\n${streamCmd}\nendstream endobj\n`);
    const obj5Head = enc.encode(
      `5 0 obj << /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >> stream\n`
    );
    const obj5Tail = enc.encode("\nendstream endobj\n");
    const trailer = enc.encode("trailer << /Root 1 0 R /Size 6 >>\n%%EOF");

    return new Blob([header, obj1, obj2, obj3, obj4, obj5Head, imgBytes, obj5Tail, trailer], {
      type: "application/pdf"
    });
  }

  _buildTextPdfBlob(title, bodyText) {
    const sanitize = (s) =>
      String(s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[()\\]/g, " ");

    const lines = [sanitize(title), "", ...sanitize(bodyText).split(/\r?\n/)].slice(0, 48);
    let contentOps = "BT /F1 12 Tf 48 790 Td 16 TL ";
    lines.forEach((line, i) => {
      const clipped = line.slice(0, 82);
      contentOps += i === 0 ? `(${clipped}) Tj ` : `T* (${clipped}) Tj `;
    });
    contentOps += "ET";

    const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${contentOps.length} >> stream
${contentOps}
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R /Size 6 >>
%%EOF`;

    return new Blob([pdf], { type: "application/pdf" });
  }
}