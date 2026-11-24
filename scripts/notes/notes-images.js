import {
  applyImageCrop,
  parseCrop,
  serializeCrop,
  startInlineImageCrop,
  cancelActiveImageCrop
} from "../shared/shared-image-cropper.js";
import { t } from "../shared/shared-i18n.js";
import { EditorImagesLayout } from "./notes-images-layout.js";

const MIN_IMG_WIDTH = 80;
const DEFAULT_IMG_RATIO = 0.45;
const DRAG_THRESHOLD = 5;
const VERTICAL_DEADZONE = 6;
const IMAGE_CLIPBOARD_TOKEN = "\u200B";

export class EditorImages {
  constructor(editor) {
    this.editor = editor;
    this.body = null;
    this.selectedBlock = null;
    this._resizeObserver = null;
    this._lastBodyWidth = 0;
    this.layout = new EditorImagesLayout(this);
  }

  attach(body, { canEdit = true } = {}) {
    cancelActiveImageCrop();
    this.layout.stopAutoScroll();
    this.body = body;
    this.selectedBlock = null;

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    this._lastBodyWidth = body.clientWidth || 0;
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => {
        const w = this.body?.clientWidth || 0;
        if (!w || w === this._lastBodyWidth) return;
        this._lastBodyWidth = w;
        this.updateLayout();
      });
      this._resizeObserver.observe(body);
    }

    body.addEventListener("mousedown", (e) => {
      const clickedImg = e.target.closest?.(".fk-img-block");
      if (!clickedImg || !this.body?.contains(clickedImg)) {
        this.clearSelection();
      }
    });

    if (!canEdit) return;

    body.addEventListener("dragover", (e) => {
      if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
    });
    body.addEventListener("drop", (e) => this._onDrop(e));
    body.addEventListener("mousedown", (e) => this._onMouseDown(e));
  }

  updateLayout() {
    return this.layout.updateLayout();
  }

  selectBlock(block) {
    if (!block || !this.body?.contains(block)) {
      this.clearSelection();
      return;
    }

    if (this.selectedBlock && this.selectedBlock !== block) {
      this.selectedBlock.classList.remove("is-selected");
    }

    this.selectedBlock = block;
    block.classList.add("is-selected");

    this.body.focus({ preventScroll: true });
    try {
      const range = document.createRange();
      range.setStartAfter(block);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      // Ignora caso o bloco não permita range adjacente
    }
  }

  clearSelection() {
    if (this.selectedBlock) {
      this.selectedBlock.classList.remove("is-selected");
      this.selectedBlock = null;
    }
    this.body?.querySelectorAll(".fk-img-block.is-selected").forEach((el) => {
      el.classList.remove("is-selected");
    });
  }

  getSelectedBlock() {
    if (this.selectedBlock && this.body?.contains(this.selectedBlock)) {
      return this.selectedBlock;
    }
    this.selectedBlock = null;
    return null;
  }

  _ensureCropFrame(block) {
    let frame = block.querySelector(".fk-img-crop-frame");
    const img = block.querySelector("img");
    if (!img) return { frame: null, img: null };

    if (!frame) {
      frame = document.createElement("span");
      frame.className = "fk-img-crop-frame";
      frame.style.display = "block";
      img.before(frame);
      frame.appendChild(img);
    }
    return { frame, img };
  }

  _applyBorderVisual(block) {
    const color = (block?.dataset?.borderColor || "").trim();
    if (color) {
      block.classList.add("has-border");
      block.style.setProperty("--fk-img-border-color", color);
    } else {
      block.classList.remove("has-border");
      block.style.removeProperty("--fk-img-border-color");
      delete block.dataset.borderColor;
    }
  }

  hydrate(canEdit = true) {
    if (!this.body) return;
    this.selectedBlock = null;

    this.body.querySelectorAll("[data-clear-squeeze]").forEach((el) => {
      el.removeAttribute("data-clear-squeeze");
    });

    this.body.querySelectorAll(".fk-img-block").forEach((block) => {
      block.setAttribute("contenteditable", "false");
      block.classList.remove(
        "is-dragging",
        "is-resizing",
        "is-selected",
        "is-flush-top",
        "is-flush-bottom",
        "is-wide-block"
      );
      block.style.removeProperty("margin-right");
      block.style.removeProperty("margin-left");

      if (block.dataset.side !== "right") {
        block.dataset.side = "left";
      }

      this._applyBorderVisual(block);

      const { frame, img } = this._ensureCropFrame(block);
      const crop = parseCrop(block.dataset.crop);

      if (img) {
        img.draggable = false;
        if (!img.hasAttribute("alt")) img.alt = "";
        if (!img.complete) {
          img.addEventListener(
            "load",
            () => {
              if (frame) applyImageCrop(frame, img, parseCrop(block.dataset.crop));
              this.updateLayout();
            },
            { once: true }
          );
        }
      }

      if (frame && img) {
        frame.style.removeProperty("visibility");
        if (crop) block.dataset.crop = serializeCrop(crop);
        else delete block.dataset.crop;
        applyImageCrop(frame, img, crop);
      }

      block.querySelectorAll(".fk-img-resize").forEach((el) => el.remove());

      if (canEdit) {
        const handle = document.createElement("span");
        handle.className = "fk-img-resize";
        handle.title = t("SIN.MindMap.ResizeDrag");
        block.append(handle);
      }
    });
  }

  cleanForSave(root) {
    root.querySelectorAll("[data-clear-squeeze]").forEach((el) => {
      el.removeAttribute("data-clear-squeeze");
    });

    root.querySelectorAll(".fk-img-block").forEach((block) => {
      block.classList.remove(
        "is-dragging",
        "is-resizing",
        "is-selected",
        "is-flush-top",
        "is-flush-bottom",
        "is-wide-block"
      );
      block.style.removeProperty("margin-right");
      block.style.removeProperty("margin-left");
      block.setAttribute("contenteditable", "false");
      block.querySelectorAll(".fk-img-resize").forEach((el) => el.remove());

      const frame = block.querySelector(".fk-img-crop-frame");
      if (frame) frame.style.removeProperty("visibility");

      const borderColor = (block.dataset.borderColor || "").trim();
      if (borderColor) {
        block.classList.add("has-border");
        block.style.setProperty("--fk-img-border-color", borderColor);
      } else {
        block.classList.remove("has-border");
        block.style.removeProperty("--fk-img-border-color");
        delete block.dataset.borderColor;
      }

      const crop = parseCrop(block.dataset.crop);
      if (crop) block.dataset.crop = serializeCrop(crop);
      else delete block.dataset.crop;

      const img = block.querySelector("img");
      if (img) img.draggable = false;
    });
  }

  setBorderColor(block, hex) {
    if (!this.editor.canEdit || !block || !this.body?.contains(block)) return;
    const clean = String(hex || "").trim();
    if (clean) block.dataset.borderColor = clean;
    else delete block.dataset.borderColor;

    this._applyBorderVisual(block);
    this.updateLayout();
    this.editor.notifyChange({ immediate: false });
  }

  hasCopiedImage() {
    return Boolean(globalThis.__fkCopiedEditorImage?.src);
  }

  _legacyCopyText(text) {
    const scrollEl = this.body?.closest?.(".fk-editor-scroll");
    const prevScrollTop = scrollEl ? scrollEl.scrollTop : null;
    const sel = window.getSelection();
    const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;

    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;";
    document.body.appendChild(ta);
    ta.select();

    let ok = false;
    try {
      ok = Boolean(document.execCommand?.("copy"));
    } catch {
      ok = false;
    }

    ta.remove();

    if (this.body?.isConnected) {
      this.body.focus({ preventScroll: true });
      if (savedRange && this.body.contains(savedRange.startContainer)) {
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
    }
    if (scrollEl && prevScrollTop !== null) {
      scrollEl.scrollTop = prevScrollTop;
    }

    return ok;
  }

  _writeClipboardToken(token) {
    if (!window.isSecureContext || !navigator.clipboard?.writeText) {
      return this._legacyCopyText(token);
    }

    navigator.clipboard.writeText(token).catch(() => {
      this._legacyCopyText(token);
    });
    return true;
  }

  copyImage(block, { notify = true } = {}) {
    if (!block || !this.body?.contains(block)) return false;
    const img = block.querySelector("img");
    const src = img?.getAttribute("src") || img?.src || "";
    if (!src) return false;

    const width = Math.round(
      block.getBoundingClientRect().width || parseFloat(block.style.width) || 240
    );
    const side = block.dataset.side === "right" ? "right" : "left";
    const crop = serializeCrop(parseCrop(block.dataset.crop));
    const borderColor = (block.dataset.borderColor || "").trim();

    globalThis.__fkCopiedEditorImage = {
      src,
      width,
      side,
      crop,
      borderColor,
      prevClipboardText: IMAGE_CLIPBOARD_TOKEN,
      copiedAt: Date.now()
    };

    this._writeClipboardToken(IMAGE_CLIPBOARD_TOKEN);

    if (notify) {
      globalThis.ui?.notifications?.info(t("SIN.Notes.ImageCopied"));
    }
    return true;
  }

  cutImage(block) {
    if (!this.editor.canEdit || !block || !this.body?.contains(block)) return false;
    const ok = this.copyImage(block, { notify: false });
    if (!ok) return false;

    this.deleteImage(block);
    globalThis.ui?.notifications?.info(t("SIN.Notes.ImageCut"));
    return true;
  }

  deleteImage(block) {
    if (!this.editor.canEdit || !block || !this.body?.contains(block)) return;
    if (this.selectedBlock === block) {
      this.selectedBlock = null;
    }

    const prevParent = block.parentNode;
    block.remove();
    if (prevParent && prevParent.isConnected) {
      prevParent.normalize();
    }
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
  }

  pasteCopiedImage(range = null) {
    if (!this.editor.canEdit || !this.body) return false;
    const copied = globalThis.__fkCopiedEditorImage;
    if (!copied?.src) return false;

    const selected = this.getSelectedBlock();
    let targetRange = null;

    if (range && this.body.contains(range.startContainer)) {
      targetRange = range.cloneRange();
    } else if (selected) {
      targetRange = document.createRange();
      targetRange.setStartAfter(selected);
      targetRange.collapse(true);
    } else {
      targetRange = this._getCurrentRange() || this.layout.endOfBodyRange();
    }

    if (!targetRange.collapsed) {
      targetRange.deleteContents();
    }

    const safeRange = this.layout.adjustAnchorForBlockStart(targetRange);
    const bodyW = this.body.clientWidth || 620;
    const width = Math.max(MIN_IMG_WIDTH, Math.min(Math.floor(bodyW), copied.width || 240));
    const block = this._buildBlock(copied.src, width, copied.side || "left", {
      crop: copied.crop || "",
      borderColor: copied.borderColor || ""
    });

    safeRange.insertNode(block);

    const { frame, img } = this._ensureCropFrame(block);
    if (frame && img && copied.crop) {
      applyImageCrop(frame, img, parseCrop(copied.crop));
    }

    this._placeCaretAfterBlock(block);
    if (selected) {
      this.selectBlock(block);
    }

    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
    return true;
  }

  async insertImageFile(file, range = null) {
    if (!this.editor.canEdit || !this.body || !file) return false;

    globalThis.__fkCopiedEditorImage = null;

    const selected = this.getSelectedBlock();
    let savedRange = null;
    if (range && this.body.contains(range.startContainer)) {
      savedRange = range.cloneRange();
    } else if (selected) {
      savedRange = document.createRange();
      savedRange.setStartAfter(selected);
      savedRange.collapse(true);
    } else {
      savedRange = this._getCurrentRange() || this.layout.endOfBodyRange();
    }

    const uploadedPath = await this.editor.uploadImage(file);
    if (!uploadedPath) return false;

    this._insertFromSrc(uploadedPath, savedRange, "left");
    return true;
  }

  _placeCaretAfterBlock(block) {
    if (!block?.parentNode) return;
    try {
      const after = document.createRange();
      after.setStartAfter(block);
      after.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(after);
    } catch {
      // Ignora se não for possível posicionar o cursor
    }
  }

  hasCrop(block) {
    return Boolean(parseCrop(block?.dataset?.crop));
  }

  startCrop(block) {
    if (!this.editor.canEdit || !block || !this.body?.contains(block)) return;
    this.clearSelection();

    const { frame, img } = this._ensureCropFrame(block);
    if (!frame || !img) return;

    const scrollEl = this.body.closest(".fk-editor-scroll");
    const currentCrop = parseCrop(block.dataset.crop);
    const startW = block.getBoundingClientRect().width || parseFloat(block.style.width) || 200;

    startInlineImageCrop({
      frameEl: frame,
      imgEl: img,
      initialCrop: currentCrop,
      scrollContainer: scrollEl,
      onCommit: ({ crop, metrics }) => {
        if (!block.isConnected) return;

        const serialized = serializeCrop(crop);
        const prevSerialized = serializeCrop(currentCrop);
        if (serialized === prevSerialized) return;

        if (serialized) block.dataset.crop = serialized;
        else delete block.dataset.crop;

        const maxW = this.layout.getMaxResizeWidth(block);
        const nextW = Math.max(
          MIN_IMG_WIDTH,
          Math.min(maxW, Math.round(startW * (metrics?.widthRatio || 1)))
        );
        block.style.width = `${nextW}px`;

        applyImageCrop(frame, img, crop);
        this.editor.refresh();
        this.editor.notifyChange({ immediate: false });
      }
    });
  }

  resetCrop(block) {
    if (!this.editor.canEdit || !block || !this.body?.contains(block)) return;
    const currentCrop = parseCrop(block.dataset.crop);
    if (!currentCrop) return;

    const { frame, img } = this._ensureCropFrame(block);
    if (!frame || !img) return;

    const startW = block.getBoundingClientRect().width || parseFloat(block.style.width) || 200;
    const oldVisW = Math.max(0.08, 1 - currentCrop.left - currentCrop.right);
    const maxW = this.layout.getMaxResizeWidth(block);
    const nextW = Math.max(MIN_IMG_WIDTH, Math.min(maxW, Math.round(startW / oldVisW)));

    delete block.dataset.crop;
    block.style.width = `${nextW}px`;
    applyImageCrop(frame, img, null);

    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
  }

  openImagePicker(range = null) {
    if (!this.body || !this.editor.canEdit) return;
    const savedRange =
      range && this.body.contains(range.startContainer)
        ? range.cloneRange()
        : this.layout.endOfBodyRange();

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;

      const uploadedPath = await this.editor.uploadImage(file);
      if (!uploadedPath) return;

      this._insertFromSrc(uploadedPath, savedRange, "left");
    });

    input.addEventListener("cancel", () => input.remove());
    input.click();
  }

  async _onDrop(e) {
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;

    e.preventDefault();
    e.stopPropagation();

    const file = files.find((f) => f.type.startsWith("image/"));
    if (!file) return;

    const side = this.layout.sideFromX(e.clientX);
    const range =
      this.layout.anchorFromPoint(e.clientX, e.clientY) || this.layout.endOfBodyRange();

    const uploadedPath = await this.editor.uploadImage(file);
    if (!uploadedPath) return;

    this._insertFromSrc(uploadedPath, range, side);
  }

  _insertFromSrc(src, range, side) {
    const probe = new Image();
    probe.onload = () => {
      const bodyW = this.body.clientWidth || 620;
      const width = Math.max(
        MIN_IMG_WIDTH,
        Math.min(probe.naturalWidth || 240, Math.round(bodyW * DEFAULT_IMG_RATIO))
      );

      const safeRange = this.layout.adjustAnchorForBlockStart(
        range && this.body.contains(range.startContainer) ? range : this.layout.endOfBodyRange()
      );

      const block = this._buildBlock(src, width, side);
      safeRange.insertNode(block);
      this._placeCaretAfterBlock(block);
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
    };
    probe.onerror = () => globalThis.ui?.notifications?.warn(t("SIN.Notes.ImageLoadError"));
    probe.src = src;
  }

  _buildBlock(src, width, side, { crop = "", borderColor = "" } = {}) {
    const block = document.createElement("span");
    block.className = "fk-img-block";
    block.setAttribute("contenteditable", "false");
    block.dataset.side = side;
    block.style.width = `${width}px`;

    if (crop) block.dataset.crop = crop;
    if (borderColor) block.dataset.borderColor = borderColor;
    this._applyBorderVisual(block);

    const frame = document.createElement("span");
    frame.className = "fk-img-crop-frame";
    frame.style.display = "block";

    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.draggable = false;
    frame.appendChild(img);

    const handle = document.createElement("span");
    handle.className = "fk-img-resize";
    handle.title = t("SIN.MindMap.ResizeDrag");

    block.append(frame, handle);
    return block;
  }

  _onMouseDown(e) {
    if (e.button !== 0) return;
    const block = e.target.closest?.(".fk-img-block");
    if (!block || !this.body.contains(block)) return;

    e.preventDefault();
    e.stopPropagation();
    this.selectBlock(block);

    if (e.target.closest(".fk-img-resize")) this._startResize(e, block);
    else this._startMove(e, block);
  }

  _track(onMove, onEnd, cursor) {
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = cursor;

    const up = (ev) => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", up, true);
      document.body.style.cursor = prevCursor;
      onEnd(ev);
    };
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", up, true);
  }

  _startResize(e, block) {
    const startX = e.clientX;
    const startW = block.getBoundingClientRect().width;
    const dir = block.dataset.side === "right" ? -1 : 1;
    const scrollEl = this.body.closest(".fk-editor-scroll");
    const lockedScrollTop = scrollEl ? scrollEl.scrollTop : null;
    let changed = false;

    const keepScrollLocked = () => {
      if (scrollEl && lockedScrollTop !== null && scrollEl.scrollTop !== lockedScrollTop) {
        scrollEl.scrollTop = lockedScrollTop;
      }
    };

    if (scrollEl) {
      scrollEl.addEventListener("scroll", keepScrollLocked, { passive: true });
    }

    block.classList.add("is-resizing");
    requestAnimationFrame(keepScrollLocked);

    this._track(
      (ev) => {
        const maxW = this.layout.getMaxResizeWidth(block);
        const w = Math.max(MIN_IMG_WIDTH, Math.min(maxW, startW + (ev.clientX - startX) * dir));
        const rounded = `${Math.round(w)}px`;
        if (block.style.width !== rounded) {
          block.style.width = rounded;
          changed = true;
          this.updateLayout();
          keepScrollLocked();
        }
      },
      () => {
        block.classList.remove("is-resizing");
        this.updateLayout();
        keepScrollLocked();
        if (scrollEl) {
          requestAnimationFrame(() => {
            keepScrollLocked();
            scrollEl.removeEventListener("scroll", keepScrollLocked);
          });
        }
        if (changed) this.editor.notifyChange({ immediate: false });
      },
      block.dataset.side === "right" ? "nesw-resize" : "nwse-resize"
    );
  }

  _startMove(e, block) {
    const startX = e.clientX;
    const startY = e.clientY;
    const grabOffsetY = e.clientY - block.getBoundingClientRect().top;
    const scrollEl = this.body.closest(".fk-editor-scroll");

    const initialEdges = this.layout.getScrollEdgeState(scrollEl, startY, grabOffsetY, block);
    const edgeLock = {
      top: initialEdges.nearTop,
      bottom: initialEdges.nearBottom
    };

    let started = false;
    let changed = false;
    let rafId = null;
    let lastEvent = null;

    const begin = () => {
      started = true;
      block.classList.add("is-dragging");
      this.body.classList.add("is-dragging-img");
    };

    const applyMove = (force = false) => {
      rafId = null;
      if (!lastEvent || !started) return;

      const ev = lastEvent;
      const currentSide = block.dataset.side || "left";
      const nextSide = this.layout.sideFromXWithHysteresis(ev.clientX, currentSide);
      const sideChanged = nextSide !== currentSide;

      if (sideChanged) {
        block.dataset.side = nextSide;
        changed = true;
      }

      let targetY = ev.clientY - grabOffsetY;
      if (scrollEl) {
        const sRect = scrollEl.getBoundingClientRect();
        targetY = Math.max(sRect.top + 4, Math.min(sRect.bottom - 4, targetY));
      }

      const currentTop = block.getBoundingClientRect().top;

      if (!force && !sideChanged && Math.abs(targetY - currentTop) < VERTICAL_DEADZONE) return;

      const rawRange = this.layout.findLiveAnchor(targetY, nextSide, block, scrollEl);
      const targetRange = this.layout.adjustAnchorForBlockStart(rawRange);
      if (!targetRange || this.layout.isSamePosition(targetRange, block)) {
        if (sideChanged) this.updateLayout();
        return;
      }

      const prevParent = block.parentNode;
      targetRange.insertNode(block);
      changed = true;

      if (prevParent && prevParent.isConnected) {
        prevParent.normalize();
      }

      this.updateLayout();
    };

    const onMove = (ev) => {
      if (!started) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
        begin();
      }

      lastEvent = ev;
      this.layout.updateAutoScroll(scrollEl, ev, grabOffsetY, block, edgeLock, () => applyMove(true));

      if (!rafId) {
        rafId = requestAnimationFrame(() => applyMove(false));
      }
    };

    const onEnd = () => {
      this.layout.stopAutoScroll();
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      block.classList.remove("is-dragging");
      this.body.classList.remove("is-dragging-img");

      if (started) {
        this.editor.refresh();
        if (changed) this.editor.notifyChange({ immediate: false });
      }
    };

    this._track(onMove, onEnd, "grabbing");
  }

  _getCurrentRange() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    return this.body?.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
  }
}