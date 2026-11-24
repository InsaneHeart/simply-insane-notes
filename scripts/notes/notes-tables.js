const DEFAULT_ROWS = 5;
const DEFAULT_COLS = 3;
const RESIZE_EDGE_PX = 5;
const MIN_COL_WIDTH = 44;
const MIN_ROW_HEIGHT = 26;

let lastCopiedTableData = null;

export class EditorTables {
  constructor(editor) {
    this.editor = editor;
    this.body = null;
    this.canEdit = true;
    this._selectedCells = new Set();
    this._anchorCell = null;
    this._dragSelecting = false;
    this._isResizing = false;
  }

  /* ================= CONEXÃO ================= */

  attach(body, { canEdit = true } = {}) {
    this.body = body;
    this.canEdit = canEdit;
    this.clearSelection();

    body.addEventListener("mousedown", (e) => this._onMouseDown(e));
    body.addEventListener("click", (e) => this._onClick(e));
    body.addEventListener("copy", (e) => this._onCopy(e), true);
    if (!canEdit) return;

    body.addEventListener("mousemove", (e) => this._onMouseMoveCursor(e));
    body.addEventListener("keydown", (e) => this._onKeyDown(e));
    body.addEventListener("paste", (e) => this._onPaste(e), true);
  }

  /* ================= SERIALIZAÇÃO E HIDRATAÇÃO ================= */

  hydrate(canEdit = true) {
    if (!this.body) return;
    this.clearSelection();

    this.body.querySelectorAll(".fk-table-block").forEach((block) => {
      block.setAttribute("contenteditable", "false");
      block.removeAttribute("data-clear-squeeze");
      block.classList.remove("is-resizing-col", "is-resizing-row");
      const table = block.querySelector("table.fk-table");
      if (!table) return;

      this._syncColgroup(table);
      table.querySelectorAll("td, th").forEach((cell) => {
        cell.setAttribute("contenteditable", canEdit ? "true" : "false");
        cell.classList.remove("is-cell-selected");
        cell.style.removeProperty("width");
        if (!cell.textContent.replace(/\u200B/g, "").trim() && !cell.querySelector("img")) {
          if (!cell.innerHTML.trim()) cell.innerHTML = "<br>";
        }
      });
    });
  }

  cleanForSave(root) {
    root.querySelectorAll(".fk-table-block").forEach((block) => {
      block.setAttribute("contenteditable", "false");
      block.removeAttribute("data-clear-squeeze");
      block.classList.remove("is-resizing-col", "is-resizing-row");
      const table = block.querySelector("table.fk-table");
      if (!table) return;

      this._syncColgroup(table);
      table.querySelectorAll("td, th").forEach((cell) => {
        cell.removeAttribute("contenteditable");
        cell.classList.remove("is-cell-selected");
        cell.style.removeProperty("width");
        cell.style.removeProperty("cursor");
        if (!cell.getAttribute("style")?.trim()) cell.removeAttribute("style");
        if (!cell.textContent.replace(/\u200B/g, "").trim() && !cell.querySelector("img")) {
          cell.innerHTML = "<br>";
        }
      });
    });
  }

  /* ================= INSERÇÃO E EXCLUSÃO ================= */

  insertQuickTable(range = null, rows = DEFAULT_ROWS, cols = DEFAULT_COLS) {
    if (!this.canEdit || !this.body) return null;
    if (range) this._restoreRange(range);
    else this.body.focus();

    const activeRange = this._getCurrentRange();
    const wrapper = this._buildTableBlock(rows, cols);
    this._insertTableBlockAtRange(wrapper, activeRange);

    const firstCell = wrapper.querySelector("td");
    this.editor.refresh();
    if (firstCell) {
      this.selectCells([firstCell], firstCell);
      this._placeCaretAtStart(firstCell);
    }
    this.editor.notifyChange({ immediate: false });
    return this._getCurrentRange();
  }

  _insertTableBlockAtRange(wrapper, activeRange) {
    const block = activeRange
      ? this._getTopBlock(activeRange.startContainer, activeRange.startOffset)
      : this.body.lastElementChild;

    if (block && block.parentNode === this.body) {
      if (
        !block.classList.contains("fk-box") &&
        !block.classList.contains("fk-divider-block") &&
        !block.classList.contains("fk-img-block") &&
        !block.classList.contains("fk-table-block") &&
        this._isBlockEmpty(block) &&
        !block.dataset.list &&
        block.dataset.quote !== "true"
      ) {
        block.replaceWith(wrapper);
      } else {
        block.after(wrapper);
      }
    } else {
      this.body.appendChild(wrapper);
    }

    let nextLine = wrapper.nextElementSibling;
    if (
      !nextLine ||
      nextLine.classList.contains("fk-box") ||
      nextLine.classList.contains("fk-divider-block") ||
      nextLine.classList.contains("fk-img-block") ||
      nextLine.classList.contains("fk-table-block")
    ) {
      nextLine = document.createElement("div");
      nextLine.appendChild(document.createElement("br"));
      wrapper.after(nextLine);
    }
  }

  deleteTable(block) {
    if (!this.canEdit || !block || !this.body?.contains(block)) return;
    this.clearSelection();

    const targetFocus = block.nextElementSibling || block.previousElementSibling;
    block.remove();
    this.editor.refresh();

    if (
      targetFocus &&
      targetFocus.isConnected &&
      !targetFocus.classList.contains("fk-box") &&
      !targetFocus.classList.contains("fk-divider-block") &&
      !targetFocus.classList.contains("fk-img-block") &&
      !targetFocus.classList.contains("fk-table-block")
    ) {
      this._placeCaretAtStart(targetFocus);
    }

    this.editor.notifyChange({ immediate: false });
  }

  _buildTableBlock(rows, cols) {
    const wrapper = document.createElement("div");
    wrapper.className = "fk-table-block";
    wrapper.setAttribute("contenteditable", "false");

    const table = document.createElement("table");
    table.className = "fk-table";

    const colgroup = document.createElement("colgroup");
    const pct = (100 / cols).toFixed(4);
    for (let c = 0; c < cols; c++) {
      const col = document.createElement("col");
      col.style.width = `${pct}%`;
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);

    const tbody = document.createElement("tbody");
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement("tr");
      for (let c = 0; c < cols; c++) {
        const td = document.createElement("td");
        td.setAttribute("contenteditable", this.canEdit ? "true" : "false");
        td.innerHTML = "<br>";
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
  }

  /* ================= SELEÇÃO DE CÉLULAS ================= */

  clearSelection() {
    this._selectedCells.forEach((cell) => cell.classList.remove("is-cell-selected"));
    this._selectedCells.clear();
    this._anchorCell = null;
  }

  selectCells(cells, anchor = null) {
    this.clearSelection();
    for (const c of cells) {
      if (c && c.isConnected) {
        c.classList.add("is-cell-selected");
        this._selectedCells.add(c);
      }
    }
    this._anchorCell = anchor || cells[0] || null;
  }

  getSelectedCells(fallbackCell = null) {
    const valid = Array.from(this._selectedCells).filter((c) => c.isConnected);
    if (valid.length) return valid;
    if (fallbackCell && fallbackCell.isConnected) return [fallbackCell];
    return [];
  }

  getSelectionCounts(fallbackCell = null) {
    const cells = this.getSelectedCells(fallbackCell);
    const rows = new Set(cells.map((c) => c.parentElement?.rowIndex).filter((i) => i !== undefined));
    const cols = new Set(cells.map((c) => c.cellIndex).filter((i) => i !== undefined));
    return { cells: cells.length, rows: rows.size, cols: cols.size };
  }

  _selectRectangle(startCell, endCell) {
    const table = startCell?.closest?.("table.fk-table");
    if (!table || table !== endCell?.closest?.("table.fk-table")) return;

    const r1 = startCell.parentElement.rowIndex;
    const c1 = startCell.cellIndex;
    const r2 = endCell.parentElement.rowIndex;
    const c2 = endCell.cellIndex;

    const minR = Math.min(r1, r2);
    const maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2);
    const maxC = Math.max(c1, c2);

    const cells = [];
    for (let r = minR; r <= maxR; r++) {
      const row = table.rows[r];
      if (!row) continue;
      for (let c = minC; c <= maxC; c++) {
        const cell = row.cells[c];
        if (cell) cells.push(cell);
      }
    }

    this._selectedCells.forEach((cell) => cell.classList.remove("is-cell-selected"));
    this._selectedCells.clear();
    for (const cell of cells) {
      cell.classList.add("is-cell-selected");
      this._selectedCells.add(cell);
    }
  }

  _onClick(e) {
    if (this._isResizing || this._dragSelecting) return;

    const cell = e.target.closest?.("table.fk-table td, table.fk-table th");
    if (!cell || !this.body?.contains(cell)) {
      if (this._selectedCells.size) this.clearSelection();
      return;
    }

    if (e.shiftKey && this._anchorCell && this._anchorCell.closest("table") === cell.closest("table")) {
      e.preventDefault();
      this._selectRectangle(this._anchorCell, cell);
      return;
    }

    if (!this._selectedCells.has(cell) || this._selectedCells.size > 1) {
      this._selectedCells.forEach((c) => c.classList.remove("is-cell-selected"));
      this._selectedCells.clear();
      this._selectedCells.add(cell);
      this._anchorCell = cell;
    }
  }

  _onMouseDown(e) {
    if (e.button === 2) {
      const cell = e.target.closest?.("table.fk-table td, table.fk-table th");
      if (cell && this.body?.contains(cell)) {
        if (!this._selectedCells.has(cell)) {
          this.selectCells([cell], cell);
        }
      }
      return;
    }

    if (e.button !== 0) return;

    const cell = e.target.closest?.("table.fk-table td, table.fk-table th");
    if (!cell || !this.body?.contains(cell)) {
      if (this._selectedCells.size) this.clearSelection();
      return;
    }

    if (this.canEdit) {
      const hit = this._detectResizeHit(cell, e.clientX, e.clientY);
      if (hit?.type === "col") {
        this._startColumnResize(e, hit.table, hit.colIndex);
        return;
      }
      if (hit?.type === "row") {
        this._startRowResize(e, hit.table, hit.row);
        return;
      }
    }

    if (e.shiftKey) return;

    const startCell = cell;
    this._anchorCell = startCell;
    this._dragSelecting = false;

    const onMove = (ev) => {
      const overEl = document.elementFromPoint(ev.clientX, ev.clientY);
      const overCell = overEl?.closest?.("table.fk-table td, table.fk-table th");
      if (!overCell || overCell.closest("table") !== startCell.closest("table")) return;

      if (overCell !== startCell) {
        this._dragSelecting = true;
        window.getSelection()?.removeAllRanges();
        this._selectRectangle(startCell, overCell);
      } else if (this._dragSelecting) {
        this._selectRectangle(startCell, startCell);
      }
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      if (this._dragSelecting) {
        this.body?.focus?.({ preventScroll: true });
        setTimeout(() => {
          this._dragSelecting = false;
        }, 60);
      }
    };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
  }

  /* ================= REDIMENSIONAMENTO DE COLUNAS E LINHAS ================= */

  _detectResizeHit(cell, clientX, clientY) {
    const table = cell.closest("table.fk-table");
    if (!table) return null;

    const rect = cell.getBoundingClientRect();
    const colCount = this._getColCount(table);
    const colIdx = cell.cellIndex;

    if (colIdx < colCount - 1 && Math.abs(rect.right - clientX) <= RESIZE_EDGE_PX) {
      return { type: "col", table, colIndex: colIdx };
    }
    if (colIdx > 0 && Math.abs(clientX - rect.left) <= RESIZE_EDGE_PX) {
      return { type: "col", table, colIndex: colIdx - 1 };
    }
    if (Math.abs(rect.bottom - clientY) <= RESIZE_EDGE_PX) {
      return { type: "row", table, row: cell.parentElement };
    }

    return null;
  }

  _onMouseMoveCursor(e) {
    if (!this.canEdit || this._isResizing) return;

    const cell = e.target.closest?.("table.fk-table td, table.fk-table th");
    if (!cell || !this.body?.contains(cell)) return;

    const hit = this._detectResizeHit(cell, e.clientX, e.clientY);
    if (hit?.type === "col") cell.style.cursor = "col-resize";
    else if (hit?.type === "row") cell.style.cursor = "row-resize";
    else cell.style.removeProperty("cursor");
  }

  _ensureColPercentWidths(table) {
    const colgroup = this._syncColgroup(table);
    const cols = Array.from(colgroup.children);
    const tableW = table.getBoundingClientRect().width || 1;
    const firstRow = table.rows[0];

    const widths = cols.map((col, idx) => {
      const parsed = parseFloat(col.style.width);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
      const cellW = firstRow?.cells[idx]?.getBoundingClientRect().width;
      return cellW ? (cellW / tableW) * 100 : 100 / cols.length;
    });

    const sum = widths.reduce((acc, v) => acc + v, 0) || 100;
    const normalized = widths.map((w) => (w / sum) * 100);

    cols.forEach((col, idx) => {
      col.style.width = `${normalized[idx].toFixed(4)}%`;
    });

    table.querySelectorAll("td, th").forEach((td) => td.style.removeProperty("width"));
    return { cols, widths: normalized, tableW };
  }

  _startColumnResize(e, table, colIndex) {
    e.preventDefault();
    e.stopPropagation();

    const block = table.closest(".fk-table-block");
    const { cols, widths, tableW } = this._ensureColPercentWidths(table);
    const leftCol = cols[colIndex];
    const rightCol = cols[colIndex + 1];
    if (!leftCol || !rightCol) return;

    const startX = e.clientX;
    const origLeftPct = widths[colIndex];
    const origRightPct = widths[colIndex + 1];
    const pairPct = origLeftPct + origRightPct;
    const minPct = Math.min(pairPct / 2, (MIN_COL_WIDTH / tableW) * 100);

    this._isResizing = true;
    block?.classList.add("is-resizing-col");
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "col-resize";
    let changed = false;

    const onMove = (ev) => {
      const dxPct = ((ev.clientX - startX) / tableW) * 100;
      const nextLeft = Math.max(minPct, Math.min(pairPct - minPct, origLeftPct + dxPct));
      const nextRight = pairPct - nextLeft;

      leftCol.style.width = `${nextLeft.toFixed(4)}%`;
      rightCol.style.width = `${nextRight.toFixed(4)}%`;
      changed = true;
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      document.body.style.cursor = prevCursor;
      block?.classList.remove("is-resizing-col");
      setTimeout(() => {
        this._isResizing = false;
      }, 20);
      if (changed) {
        this.editor.refresh();
        this.editor.notifyChange({ immediate: false });
      }
    };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
  }

  _startRowResize(e, table, row) {
    e.preventDefault();
    e.stopPropagation();

    const block = table.closest(".fk-table-block");
    const startY = e.clientY;
    const startH = row.getBoundingClientRect().height || MIN_ROW_HEIGHT;

    this._isResizing = true;
    block?.classList.add("is-resizing-row");
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "row-resize";
    let changed = false;

    const onMove = (ev) => {
      const nextH = Math.max(MIN_ROW_HEIGHT, Math.round(startH + (ev.clientY - startY)));
      row.style.height = `${nextH}px`;
      changed = true;
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      document.body.style.cursor = prevCursor;
      block?.classList.remove("is-resizing-row");
      setTimeout(() => {
        this._isResizing = false;
      }, 20);
      if (changed) {
        this.editor.refresh();
        this.editor.notifyChange({ immediate: false });
      }
    };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
  }

  /* ================= CÓPIA E COLA DE TABELA ================= */

  hasCopiedGrid() {
    return Boolean(lastCopiedTableData?.rows?.length);
  }

  _serializeCell(cell) {
    const clone = cell.cloneNode(true);
    clone.querySelectorAll(".fk-img-resize").forEach((el) => el.remove());
    const text = cell.innerText.replace(/\r\n?/g, "\n").replace(/\u200B/g, "").trim();
    const html = text ? clone.innerHTML : "<br>";
    const cellColor = cell.dataset.cellColor || null;
    return { html, text, cellColor };
  }

  _buildCopiedDataFromCells(cells) {
    const valid = cells.filter((c) => c && c.isConnected);
    if (!valid.length) return null;

    const table = valid[0].closest("table.fk-table");
    if (!table) return null;

    const rowIndices = valid.map((c) => c.parentElement.rowIndex);
    const colIndices = valid.map((c) => c.cellIndex);
    const minR = Math.min(...rowIndices);
    const maxR = Math.max(...rowIndices);
    const minC = Math.min(...colIndices);
    const maxC = Math.max(...colIndices);

    const rows = [];
    const tsvLines = [];

    for (let r = minR; r <= maxR; r++) {
      const tr = table.rows[r];
      const rowData = [];
      const tsvCols = [];
      for (let c = minC; c <= maxC; c++) {
        const td = tr?.cells[c];
        const item = td ? this._serializeCell(td) : { html: "<br>", text: "", cellColor: null };
        rowData.push(item);
        tsvCols.push(item.text.replace(/\t/g, " ").replace(/\n/g, " "));
      }
      rows.push(rowData);
      tsvLines.push(tsvCols.join("\t"));
    }

    return {
      plainText: tsvLines.join("\n"),
      rows
    };
  }

  async copyCells(cells) {
    const data = this._buildCopiedDataFromCells(cells);
    if (!data) return false;
    lastCopiedTableData = data;

    try {
      await navigator.clipboard.writeText(data.plainText);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = data.plainText;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand?.("copy");
      ta.remove();
    }
    return true;
  }

  _onCopy(e) {
    const selected = this.getSelectedCells();
    if (selected.length <= 1) return;

    const data = this._buildCopiedDataFromCells(selected);
    if (!data) return;

    lastCopiedTableData = data;
    e.preventDefault();
    e.stopImmediatePropagation();
    e.clipboardData?.setData("text/plain", data.plainText);
  }

  _matchesCopiedGrid(clipboardText) {
    if (!lastCopiedTableData?.rows?.length) return false;
    if (clipboardText == null) return true;
    const normalized = String(clipboardText).replace(/\r\n?/g, "\n");
    return normalized === lastCopiedTableData.plainText;
  }

  _parsePlainTsvToGrid(text) {
    const normalized = String(text || "").replace(/\r\n?/g, "\n");
    if (!normalized.includes("\t") && !normalized.includes("\n")) return null;
    const lines = normalized.split("\n");
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    return lines.map((line) =>
      line.split("\t").map((val) => ({
        html: val ? this._escapeHtml(val) : "<br>",
        text: val,
        cellColor: null
      }))
    );
  }

  _applyItemToCell(cell, item, { plainOnly = false } = {}) {
    if (!cell) return;
    if (plainOnly) {
      cell.textContent = item.text || "";
      if (!cell.textContent.trim()) cell.innerHTML = "<br>";
      return;
    }

    cell.innerHTML = item.html || "<br>";
    if (item.cellColor) {
      cell.style.backgroundColor = this._hexToCellBg(item.cellColor);
      cell.dataset.cellColor = item.cellColor;
    } else {
      cell.style.removeProperty("background-color");
      cell.removeAttribute("data-cell-color");
      if (!cell.getAttribute("style")?.trim()) cell.removeAttribute("style");
    }
  }

  _ensureTableSize(table, targetRows, targetCols) {
    let currentCols = this._getColCount(table);
    const tbody = table.tBodies[0] || table;

    if (targetCols > currentCols) {
      const added = targetCols - currentCols;
      const { cols, widths } = this._ensureColPercentWidths(table);
      const colgroup = table.querySelector("colgroup");

      Array.from(table.rows).forEach((row) => {
        for (let i = 0; i < added; i++) {
          const td = document.createElement("td");
          td.setAttribute("contenteditable", this.canEdit ? "true" : "false");
          td.innerHTML = "<br>";
          row.appendChild(td);
        }
      });

      const newColPct = 100 / targetCols;
      const remainingPct = 100 - newColPct * added;
      const scale = remainingPct / 100;

      cols.forEach((col, idx) => {
        col.style.width = `${(widths[idx] * scale).toFixed(4)}%`;
      });
      for (let i = 0; i < added; i++) {
        const col = document.createElement("col");
        col.style.width = `${newColPct.toFixed(4)}%`;
        colgroup.appendChild(col);
      }

      currentCols = targetCols;
    }

    while (table.rows.length < targetRows) {
      tbody.appendChild(this._createRow(currentCols));
    }
  }

  tryPasteAsNewTable(clipboardText, range = null, { plainOnly = false } = {}) {
    if (!this.canEdit || !this.body || plainOnly) return false;
    if (!this._matchesCopiedGrid(clipboardText)) return false;

    const grid = lastCopiedTableData.rows;
    const rowCount = grid.length;
    const colCount = Math.max(1, ...grid.map((r) => r.length));

    if (range) this._restoreRange(range);
    const activeRange = this._getCurrentRange();

    const wrapper = this._buildTableBlock(rowCount, colCount);
    const table = wrapper.querySelector("table.fk-table");

    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        this._applyItemToCell(table.rows[r]?.cells[c], grid[r][c], { plainOnly: false });
      }
    }

    this._insertTableBlockAtRange(wrapper, activeRange);
    this.editor.refresh();
    const firstCell = table.rows[0]?.cells[0];
    if (firstCell) this._placeCaretAtStart(firstCell);
    this.editor.notifyChange({ immediate: false });
    return true;
  }

  pasteIntoCell(cell, { clipboardText = null, plainOnly = false } = {}) {
    if (!this.canEdit || !cell || !this.body?.contains(cell)) return;
    const table = cell.closest("table.fk-table");
    if (!table) return;

    let grid = null;
    if (this._matchesCopiedGrid(clipboardText)) {
      grid = lastCopiedTableData.rows;
    } else if (clipboardText) {
      grid = this._parsePlainTsvToGrid(clipboardText);
    }

    if (grid?.length) {
      const startRow = cell.parentElement.rowIndex;
      const startCol = cell.cellIndex;
      const maxCols = Math.max(1, ...grid.map((r) => r.length));

      this._ensureTableSize(table, startRow + grid.length, startCol + maxCols);

      const pastedCells = [];
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const targetCell = table.rows[startRow + r]?.cells[startCol + c];
          if (!targetCell) continue;
          this._applyItemToCell(targetCell, grid[r][c], { plainOnly });
          pastedCells.push(targetCell);
        }
      }

      if (pastedCells.length > 1) {
        this.selectCells(pastedCells, pastedCells[0]);
      }
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
      return;
    }

    const raw = String(clipboardText || "").replace(/\r\n?/g, "\n").replace(/\n+/g, " ");
    if (!raw) return;
    cell.focus();
    document.execCommand?.("insertText", false, raw);
    this.editor.notifyChange({ immediate: false });
  }

  insertCopiedRowsBelow(cell) {
    if (!this.canEdit || !cell || !this.hasCopiedGrid()) return;
    const tr = cell.parentElement;
    const table = tr?.closest("table.fk-table");
    if (!tr || !table) return;

    const grid = lastCopiedTableData.rows;
    const startCol = cell.cellIndex;
    const maxCols = Math.max(1, ...grid.map((r) => r.length));

    this._ensureTableSize(table, table.rows.length, startCol + maxCols);
    const totalCols = this._getColCount(table);

    let anchorRow = tr;
    const insertedCells = [];

    for (let r = 0; r < grid.length; r++) {
      const newRow = this._createRow(totalCols);
      for (let c = 0; c < grid[r].length; c++) {
        const td = newRow.cells[startCol + c];
        if (!td) continue;
        this._applyItemToCell(td, grid[r][c], { plainOnly: false });
        insertedCells.push(td);
      }
      anchorRow.after(newRow);
      anchorRow = newRow;
    }

    if (insertedCells.length) {
      this.selectCells(insertedCells, insertedCells[0]);
      this._placeCaretAtStart(insertedCells[0]);
    }
    this.editor.refresh();
    this.editor.notifyChange({ immediate: false });
  }

  /* ================= AÇÕES DE TABELA ================= */

  colorCells(cells, hex) {
    if (!this.canEdit || !cells?.length) return;
    for (const cell of cells) {
      if (!cell || !cell.isConnected) continue;
      if (hex) {
        cell.style.backgroundColor = this._hexToCellBg(hex);
        cell.dataset.cellColor = hex;
      } else {
        cell.style.removeProperty("background-color");
        cell.removeAttribute("data-cell-color");
      }
      if (!cell.getAttribute("style")?.trim()) cell.removeAttribute("style");
    }
    this.editor.notifyChange({ immediate: false });
  }

  clearCellsContent(cells) {
    if (!this.canEdit || !cells?.length) return;
    for (const cell of cells) {
      if (!cell || !cell.isConnected) continue;
      cell.innerHTML = "<br>";
    }
    this.editor.notifyChange({ immediate: false });
  }

  insertRowAbove(cell) {
    if (!this.canEdit || !cell) return;
    const tr = cell.parentElement;
    const table = tr?.closest("table.fk-table");
    if (!tr || !table) return;

    const colCount = this._getColCount(table);
    const newRow = this._createRow(colCount);
    tr.before(newRow);
    this.editor.refresh();
    this._placeCaretAtStart(newRow.cells[Math.min(cell.cellIndex, colCount - 1)]);
    this.editor.notifyChange({ immediate: false });
  }

  insertRowBelow(cell) {
    if (!this.canEdit || !cell) return;
    const tr = cell.parentElement;
    const table = tr?.closest("table.fk-table");
    if (!tr || !table) return;

    const colCount = this._getColCount(table);
    const newRow = this._createRow(colCount);
    tr.after(newRow);
    this.editor.refresh();
    this._placeCaretAtStart(newRow.cells[Math.min(cell.cellIndex, colCount - 1)]);
    this.editor.notifyChange({ immediate: false });
  }

  deleteRows(cells) {
    if (!this.canEdit || !cells?.length) return;
    const firstCell = cells.find((c) => c?.isConnected);
    const table = firstCell?.closest("table.fk-table");
    if (!table) return;

    const uniqueRows = Array.from(
      new Set(cells.map((c) => c?.parentElement).filter((tr) => tr && tr.closest("table") === table))
    ).sort((a, b) => a.rowIndex - b.rowIndex);

    if (!uniqueRows.length) return;
    if (uniqueRows.length >= table.rows.length) {
      this.deleteTable(table.closest(".fk-table-block") || table);
      return;
    }

    const focusRowIdx = uniqueRows[0].rowIndex;
    const focusColIdx = firstCell.cellIndex;
    this.clearSelection();
    uniqueRows.forEach((tr) => tr.remove());

    const focusRow = table.rows[Math.min(focusRowIdx, table.rows.length - 1)];
    const focusCell = focusRow?.cells[Math.min(focusColIdx, focusRow.cells.length - 1)];
    this.editor.refresh();
    if (focusCell) this._placeCaretAtStart(focusCell);
    this.editor.notifyChange({ immediate: false });
  }

  insertColLeft(cell) {
    if (!this.canEdit || !cell) return;
    const table = cell.closest("table.fk-table");
    if (!table) return;

    const idx = cell.cellIndex;
    Array.from(table.rows).forEach((row) => {
      const td = document.createElement("td");
      td.setAttribute("contenteditable", "true");
      td.innerHTML = "<br>";
      const ref = row.cells[idx] || null;
      row.insertBefore(td, ref);
    });

    this.distributeColumnsEvenly(table, { silentSave: true });
    this.editor.refresh();
    const sameRowCell = cell.parentElement?.cells[idx];
    if (sameRowCell) this._placeCaretAtStart(sameRowCell);
    this.editor.notifyChange({ immediate: false });
  }

  insertColRight(cell) {
    if (!this.canEdit || !cell) return;
    const table = cell.closest("table.fk-table");
    if (!table) return;

    const idx = cell.cellIndex + 1;
    Array.from(table.rows).forEach((row) => {
      const td = document.createElement("td");
      td.setAttribute("contenteditable", "true");
      td.innerHTML = "<br>";
      const ref = row.cells[idx] || null;
      row.insertBefore(td, ref);
    });

    this.distributeColumnsEvenly(table, { silentSave: true });
    this.editor.refresh();
    const sameRowCell = cell.parentElement?.cells[idx];
    if (sameRowCell) this._placeCaretAtStart(sameRowCell);
    this.editor.notifyChange({ immediate: false });
  }

  deleteCols(cells) {
    if (!this.canEdit || !cells?.length) return;
    const firstCell = cells.find((c) => c?.isConnected);
    const table = firstCell?.closest("table.fk-table");
    if (!table) return;

    const colCount = this._getColCount(table);
    const uniqueCols = Array.from(
      new Set(cells.filter((c) => c?.closest("table") === table).map((c) => c.cellIndex))
    ).sort((a, b) => b - a);

    if (!uniqueCols.length) return;
    if (uniqueCols.length >= colCount) {
      this.deleteTable(table.closest(".fk-table-block") || table);
      return;
    }

    const rowIdx = firstCell.parentElement.rowIndex;
    const minColIdx = uniqueCols[uniqueCols.length - 1];
    const { cols, widths } = this._ensureColPercentWidths(table);

    this.clearSelection();
    for (const idx of uniqueCols) {
      Array.from(table.rows).forEach((row) => {
        if (row.cells[idx]) row.cells[idx].remove();
      });
      if (cols[idx]) cols[idx].remove();
      widths.splice(idx, 1);
    }

    const sum = widths.reduce((acc, v) => acc + v, 0) || 100;
    const remainingCols = Array.from(table.querySelector("colgroup")?.children || []);
    remainingCols.forEach((col, i) => {
      const pct = ((widths[i] || 100 / remainingCols.length) / sum) * 100;
      col.style.width = `${pct.toFixed(4)}%`;
    });

    this.editor.refresh();
    const nextRow = table.rows[rowIdx];
    const nextCell = nextRow?.cells[Math.min(minColIdx, nextRow.cells.length - 1)];
    if (nextCell) this._placeCaretAtStart(nextCell);
    this.editor.notifyChange({ immediate: false });
  }

  distributeColumnsEvenly(table, { cells = null, silentSave = false } = {}) {
    if (!table) return;
    const totalCols = this._getColCount(table);
    if (!totalCols) return;

    const selectedCols = Array.from(
      new Set(
        (cells || [])
          .filter((c) => c?.closest("table") === table)
          .map((c) => c.cellIndex)
      )
    );

    if (selectedCols.length >= 2 && selectedCols.length < totalCols) {
      const { cols, widths } = this._ensureColPercentWidths(table);
      const selectedSum = selectedCols.reduce((acc, idx) => acc + (widths[idx] || 0), 0);
      const share = selectedSum / selectedCols.length;
      for (const idx of selectedCols) {
        if (cols[idx]) cols[idx].style.width = `${share.toFixed(4)}%`;
      }
    } else {
      const pct = (100 / totalCols).toFixed(4);
      const colgroup = this._syncColgroup(table);
      Array.from(colgroup.children).forEach((col) => {
        col.style.width = `${pct}%`;
      });
    }

    table.querySelectorAll("td, th").forEach((cell) => {
      cell.style.removeProperty("width");
      if (!cell.getAttribute("style")?.trim()) cell.removeAttribute("style");
    });

    if (!silentSave) {
      this.editor.notifyChange({ immediate: false });
    }
  }

  distributeRowsEvenly(table, { cells = null, silentSave = false } = {}) {
    if (!table || !table.rows.length) return;

    const selectedRows = Array.from(
      new Set(
        (cells || [])
          .map((c) => c?.parentElement)
          .filter((tr) => tr && tr.closest("table") === table)
      )
    );

    const targetRows = selectedRows.length >= 2 ? selectedRows : Array.from(table.rows);
    if (!targetRows.length) return;

    const totalH = targetRows.reduce(
      (acc, tr) => acc + (tr.getBoundingClientRect().height || MIN_ROW_HEIGHT),
      0
    );
    const avgH = Math.max(MIN_ROW_HEIGHT, Math.round(totalH / targetRows.length));

    targetRows.forEach((tr) => {
      tr.style.height = `${avgH}px`;
    });

    if (!silentSave) {
      this.editor.refresh();
      this.editor.notifyChange({ immediate: false });
    }
  }

  /* ================= TECLADO E COLAGEM ================= */

  _onKeyDown(e) {
    if (!this.canEdit || !this.body) return;

    const cell = e.target.closest?.("table.fk-table td, table.fk-table th");
    const activeCells = this.getSelectedCells();

    if ((e.key === "Backspace" || e.key === "Delete") && activeCells.length > 1) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.clearCellsContent(activeCells);
      return;
    }

    if (!cell || !this.body.contains(cell)) return;

    const table = cell.closest("table.fk-table");
    if (!table) return;

    if (e.key === "Tab" && !e.altKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this._navigateTab(table, cell, e.shiftKey);
    }
  }

  _navigateTab(table, currentCell, reverse = false) {
    const allCells = Array.from(table.querySelectorAll("td, th"));
    const idx = allCells.indexOf(currentCell);
    if (idx === -1) return;

    const nextIdx = reverse ? idx - 1 : idx + 1;

    if (nextIdx >= 0 && nextIdx < allCells.length) {
      const target = allCells[nextIdx];
      this.selectCells([target], target);
      this._placeCaretAtStart(target);
      return;
    }

    if (!reverse && nextIdx >= allCells.length) {
      const colCount = this._getColCount(table);
      const newRow = this._createRow(colCount);
      table.tBodies[0]?.appendChild(newRow) || table.appendChild(newRow);
      this.editor.refresh();
      const firstNew = newRow.cells[0];
      if (firstNew) {
        this.selectCells([firstNew], firstNew);
        this._placeCaretAtStart(firstNew);
      }
      this.editor.notifyChange({ immediate: false });
    }
  }

  _onPaste(e) {
    const cell = e.target.closest?.("table.fk-table td, table.fk-table th");
    if (!cell || !this.body?.contains(cell)) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const plainOnly = this.editor.consumePlainPasteFlag();
    const raw = e.clipboardData?.getData("text/plain") || "";
    this.pasteIntoCell(cell, { clipboardText: raw, plainOnly });
  }

  /* ================= UTILITÁRIOS ================= */

  _createRow(cols) {
    const tr = document.createElement("tr");
    for (let c = 0; c < cols; c++) {
      const td = document.createElement("td");
      td.setAttribute("contenteditable", this.canEdit ? "true" : "false");
      td.innerHTML = "<br>";
      tr.appendChild(td);
    }
    return tr;
  }

  _getColCount(table) {
    let maxCols = 0;
    Array.from(table.rows).forEach((row) => {
      if (row.cells.length > maxCols) maxCols = row.cells.length;
    });
    return Math.max(1, maxCols);
  }

  _syncColgroup(table) {
    const cols = this._getColCount(table);
    let colgroup = table.querySelector("colgroup");
    if (!colgroup) {
      colgroup = document.createElement("colgroup");
      table.prepend(colgroup);
    }
    while (colgroup.children.length < cols) {
      colgroup.appendChild(document.createElement("col"));
    }
    while (colgroup.children.length > cols) {
      colgroup.lastElementChild.remove();
    }
    return colgroup;
  }

  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  _hexToCellBg(hex) {
    const clean = String(hex || "").replace("#", "").trim();
    if (clean.length !== 6) return "";
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return "";
    return `rgba(${r}, ${g}, ${b}, 0.24)`;
  }

  _getCurrentRange() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    return this.body?.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
  }

  _restoreRange(range) {
    if (!this.body) return;
    this.body.focus();
    if (!range || !this.body.contains(range.startContainer)) return;

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  _getTopBlock(node, offset = 0) {
    if (!node || !this.body) return null;

    if (node === this.body) {
      const child =
        this.body.childNodes[offset] ||
        this.body.childNodes[Math.max(0, offset - 1)] ||
        null;
      return child instanceof Element && !child.classList.contains("fk-img-block") ? child : null;
    }

    if (!this.body.contains(node)) return null;

    let cur = node;
    while (cur && cur.parentNode !== this.body) {
      cur = cur.parentNode;
    }
    return cur instanceof Element && !cur.classList.contains("fk-img-block") ? cur : null;
  }

  _isBlockEmpty(block) {
    if (!block) return true;
    if (block.querySelector(".fk-img-block")) return false;
    return block.textContent.replace(/\u200B/g, "").trim().length === 0;
  }

  _placeCaretAtStart(el) {
    el.focus();
    const range = document.createRange();
    range.setStart(el, 0);
    range.collapse(true);

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}