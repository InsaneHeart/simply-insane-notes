import { ITEM_COLORS } from "../storage/storage.js";
import { t } from "../shared/shared-i18n.js";

function colorLabel(c) {
  return c.labelKey ? t(c.labelKey) : c.label;
}

export class EditorMenusBuilders {
  constructor(menus) {
    this.menus = menus;
    this.editor = menus.editor;
  }

  get body() {
    return this.menus.body;
  }

  get canEdit() {
    return this.menus.canEdit;
  }

  /* ================= ELEMENTOS ESPECÍFICOS ================= */

  buildImageItems(imgBlock) {
    const imgItems = [];

    if (this.canEdit) {
      imgItems.push({
        label: t("SIN.Notes.MenuCropImage"),
        icon: "fas fa-crop-alt",
        action: () => this.editor.images.startCrop(imgBlock)
      });

      if (this.editor.images.hasCrop(imgBlock)) {
        imgItems.push({
          label: t("SIN.Notes.MenuResetCrop"),
          icon: "fas fa-expand",
          action: () => this.editor.images.resetCrop(imgBlock)
        });
      }

      imgItems.push(
        {
          label: t("SIN.Notes.MenuBorderColor"),
          icon: "fas fa-palette",
          submenu: ITEM_COLORS.map((c) => ({
            label: colorLabel(c),
            colorHex: c.hex,
            action: () => this.editor.images.setBorderColor(imgBlock, c.hex)
          }))
        },
        { separator: true },
        {
          label: t("SIN.Notes.MenuCutImage"),
          icon: "fas fa-scissors",
          action: () => this.editor.images.cutImage(imgBlock)
        }
      );
    }

    imgItems.push({
      label: t("SIN.Notes.MenuCopyImage"),
      icon: "fas fa-copy",
      action: () => this.editor.images.copyImage(imgBlock)
    });

    if (this.canEdit) {
      imgItems.push(
        { separator: true },
        {
          label: t("SIN.Notes.MenuDeleteImage"),
          icon: "fas fa-trash",
          danger: true,
          action: () => this.editor.images.deleteImage(imgBlock)
        }
      );
    }

    return imgItems;
  }

  buildDividerItems(dividerBlock) {
    return [
      {
        label: t("SIN.Notes.MenuLineColor"),
        icon: "fas fa-palette",
        submenu: ITEM_COLORS.map((c) => ({
          label: colorLabel(c),
          colorHex: c.hex,
          action: () => this.editor.blocks.setDividerColor(dividerBlock, c.hex)
        }))
      },
      { separator: true },
      {
        label: t("SIN.Notes.MenuDeleteDivider"),
        icon: "fas fa-trash",
        danger: true,
        action: () => this.editor.blocks.deleteDivider(dividerBlock)
      }
    ];
  }

  buildNoteChipItems(noteChip) {
    const chipItems = [
      {
        label: t("SIN.Manager.OpenNote"),
        icon: "fas fa-external-link-alt",
        action: () => this.editor.links.openNoteLink(noteChip)
      }
    ];
    if (this.canEdit) {
      chipItems.push(
        { separator: true },
        {
          label: t("SIN.Notes.MenuDeleteNoteLink"),
          icon: "fas fa-trash",
          danger: true,
          action: () => this.editor.links.deleteNoteLink(noteChip)
        }
      );
    }
    return chipItems;
  }

  buildMentionChipItems(mentionChip) {
    const note = this.editor.note;
    const isOwner = Boolean(note && !note.readOnly);
    const userId = mentionChip.dataset.userId;
    const access = this.editor.storage?.getUserAccessLevel?.(note, userId) || "none";

    const mentionItems = [
      {
        label: t("SIN.MindMap.OpenSheet"),
        icon: "fas fa-id-card",
        action: () => this.editor.mentions.openCharacterSheet(mentionChip)
      }
    ];

    if (isOwner && access !== "creator") {
      mentionItems.push({
        label:
          access === "shared"
            ? t("SIN.MindMap.ManageSharing")
            : t("SIN.MindMap.ShareWithPlayer"),
        icon: "fas fa-share-alt",
        action: () => this.editor.mentions.openShareForMention(mentionChip)
      });
    }

    if (this.canEdit) {
      mentionItems.push(
        { separator: true },
        {
          label: t("SIN.Notes.MenuDeleteMention"),
          icon: "fas fa-trash",
          danger: true,
          action: () => this.editor.mentions.deleteMention(mentionChip)
        }
      );
    }

    return mentionItems;
  }

  buildLinkItems(linkEl) {
    const isEmail =
      linkEl.dataset.linkType === "email" || linkEl.classList.contains("fk-link-email");
    const linkItems = isEmail
      ? [
          {
            label: t("SIN.Notes.MenuCopyEmail"),
            icon: "fas fa-copy",
            action: () => this.editor.links.copyEmailLink(linkEl)
          }
        ]
      : [
          {
            label: t("SIN.Notes.MenuOpenLink"),
            icon: "fas fa-external-link-alt",
            action: () => this.editor.links.openWebLink(linkEl)
          },
          {
            label: t("SIN.Notes.MenuCopyLink"),
            icon: "fas fa-copy",
            action: () => this.editor.links.copyWebLink(linkEl)
          }
        ];

    if (this.canEdit) {
      linkItems.push(
        { separator: true },
        {
          label: isEmail ? t("SIN.Notes.MenuRemoveEmail") : t("SIN.Notes.MenuRemoveLink"),
          icon: "fas fa-unlink",
          danger: true,
          action: () => this.editor.links.unwrapLink(linkEl)
        }
      );
    }
    return linkItems;
  }

  buildQuoteBarItems(quoteBarBlock) {
    return [
      {
        label: t("SIN.Notes.MenuBarColor"),
        icon: "fas fa-palette",
        submenu: ITEM_COLORS.map((c) => ({
          label: colorLabel(c),
          colorHex: c.hex,
          action: () => this.editor.blocks.setQuoteColor(quoteBarBlock, c.hex)
        }))
      },
      { separator: true },
      {
        label: t("SIN.Notes.MenuRemoveQuoteBar"),
        icon: "fas fa-trash",
        danger: true,
        action: () => this.editor.blocks.removeQuote(quoteBarBlock)
      }
    ];
  }

  /* ================= CORRETOR ORTOGRÁFICO ================= */

  buildSpellcheckItems(target) {
    if (!this.canEdit) return [];
    const spellSpan = target?.closest?.("span.fk-spell-error");
    if (!spellSpan || !this.body?.contains(spellSpan)) return [];

    const word = spellSpan.dataset.spellWord || spellSpan.textContent || "";
    const suggestions = this.editor.spellcheck?.getSuggestions(word) || [];
    const out = [];

    if (suggestions.length) {
      for (const s of suggestions) {
        out.push({
          label: s,
          icon: "fas fa-spell-check",
          action: () => this.editor.spellcheck.replaceWord(spellSpan, s)
        });
      }
    } else {
      out.push({
        label: t("SIN.Notes.SpellNoSuggestions"),
        icon: "fas fa-spell-check",
        disabled: true,
        action: () => {}
      });
    }

    out.push(
      { separator: true },
      {
        label: t("SIN.Notes.SpellAddDict"),
        icon: "fas fa-book-medical",
        action: () => this.editor.spellcheck.addToDictionary(word)
      },
      {
        label: t("SIN.Notes.SpellIgnore"),
        icon: "fas fa-eye-slash",
        action: () => this.editor.spellcheck.ignoreWord(word)
      }
    );

    return out;
  }

  /* ================= TEXTO NORMAL ================= */

  buildTextMenuConfig(e, selectionRange, caretRange) {
    const hasSelection = Boolean(selectionRange);
    let activeRange = selectionRange || caretRange;

    const items = [];
    let formatButtons = null;

    const buildListsSubmenu = () => {
      const activeList = this.editor.lists.getActiveListType(activeRange);
      return {
        label: t("SIN.Notes.MenuLists"),
        icon: "fas fa-list-ul",
        submenu: [
          {
            label: t("SIN.Notes.MenuBulletList"),
            icon: "fas fa-list-ul",
            active: activeList === "bullet",
            action: () => {
              activeRange = this.editor.lists.toggleList("bullet", activeRange);
            }
          },
          {
            label: t("SIN.Notes.MenuNumberList"),
            icon: "fas fa-list-ol",
            active: activeList === "number",
            action: () => {
              activeRange = this.editor.lists.toggleList("number", activeRange);
            }
          },
          {
            label: t("SIN.Notes.MenuChecklist"),
            icon: "fas fa-check-square",
            active: activeList === "check",
            action: () => {
              activeRange = this.editor.lists.toggleList("check", activeRange);
            }
          }
        ]
      };
    };

    const buildInsertSubmenu = () => ({
      label: t("SIN.Notes.MenuInsert"),
      icon: "fas fa-plus-circle",
      submenu: [
        {
          label: t("SIN.Notes.MenuInsertImage"),
          icon: "fas fa-image",
          action: () => this.editor.images.openImagePicker(activeRange)
        },
        {
          label: t("SIN.Notes.MenuLinkToNote"),
          icon: "fas fa-link",
          action: () =>
            this.editor.links.openNoteLinkPicker(activeRange, { x: e.clientX, y: e.clientY })
        },
        {
          label: t("SIN.Notes.MenuQuickTable"),
          icon: "fas fa-table",
          action: () => {
            activeRange = this.editor.tables.insertQuickTable(activeRange);
          }
        },
        {
          label: t("SIN.Notes.MenuQuoteBar"),
          icon: "fas fa-quote-left",
          action: () => {
            activeRange = this.editor.blocks.toggleQuote(activeRange);
          }
        },
        {
          label: t("SIN.Notes.MenuDivider"),
          icon: "fas fa-minus",
          action: () => {
            activeRange = this.editor.blocks.insertDivider(activeRange);
          }
        }
      ]
    });

    const buildBoxesSubmenu = () => ({
      label: t("SIN.Notes.MenuBoxes"),
      icon: "fas fa-box-open",
      submenu: [
        {
          label: t("SIN.Notes.MenuBoxDrawer"),
          icon: "fas fa-caret-square-down",
          action: () => {
            activeRange = this.editor.boxes.insertBox("drawer", activeRange);
          }
        },
        {
          label: t("SIN.Notes.MenuBoxQuote"),
          icon: "fas fa-quote-right",
          action: () => {
            activeRange = this.editor.boxes.insertBox("quote", activeRange);
          }
        },
        {
          label: t("SIN.Notes.MenuBoxNote"),
          icon: "fas fa-sticky-note",
          action: () => {
            activeRange = this.editor.boxes.insertBox("note", activeRange);
          }
        },
        {
          label: t("SIN.Notes.MenuBoxCode"),
          icon: "fas fa-code",
          action: () => {
            activeRange = this.editor.boxes.insertBox("code", activeRange);
          }
        }
      ]
    });

    const selectAllItem = {
      label: t("SIN.Notes.MenuSelectAll"),
      icon: "fas fa-check-double",
      action: () => this.editor.selectAll()
    };

    if (hasSelection) {
      if (this.canEdit) {
        const state = this.editor.formatting.getState(activeRange);
        formatButtons = [
          {
            title: t("SIN.Notes.FmtBold"),
            html: `<i class="fas fa-bold"></i>`,
            active: state.bold,
            keepOpen: false,
            action: () => {
              activeRange = this.editor.formatting.toggleInline("bold", activeRange);
            }
          },
          {
            title: t("SIN.Notes.FmtItalic"),
            html: `<i class="fas fa-italic"></i>`,
            active: state.italic,
            keepOpen: false,
            action: () => {
              activeRange = this.editor.formatting.toggleInline("italic", activeRange);
            }
          },
          {
            title: t("SIN.Notes.FmtUnderline"),
            html: `<i class="fas fa-underline"></i>`,
            active: state.underline,
            keepOpen: false,
            action: () => {
              activeRange = this.editor.formatting.toggleInline("underline", activeRange);
            }
          },
          {
            title: t("SIN.Notes.FmtStrike"),
            html: `<i class="fas fa-strikethrough"></i>`,
            active: state.strike,
            keepOpen: false,
            action: () => {
              activeRange = this.editor.formatting.toggleInline("strikeThrough", activeRange);
            }
          },
          {
            title: t("SIN.Notes.FmtSubtitle"),
            html: `<i class="fas fa-heading"></i>`,
            active: state.subtitle,
            keepOpen: false,
            action: () => {
              activeRange = this.editor.formatting.toggleSubtitle(activeRange);
            }
          },
          {
            title: t("SIN.Notes.FmtFontDown"),
            html: `A-`,
            active: false,
            keepOpen: true,
            action: () => {
              activeRange = this.editor.formatting.stepFontSize(-1, activeRange);
            }
          },
          {
            title: t("SIN.Notes.FmtFontUp"),
            html: `A+`,
            active: false,
            keepOpen: true,
            action: () => {
              activeRange = this.editor.formatting.stepFontSize(1, activeRange);
            }
          }
        ];

        items.push(
          {
            label: t("SIN.Notes.MenuTextColor"),
            icon: "fas fa-font",
            submenu: ITEM_COLORS.map((c) => ({
              label: colorLabel(c),
              colorHex: c.hex,
              action: () => {
                activeRange = this.editor.formatting.setTextColor(c.hex, activeRange);
              }
            }))
          },
          {
            label: t("SIN.Notes.MenuHighlight"),
            icon: "fas fa-highlighter",
            submenu: ITEM_COLORS.map((c) => ({
              label: colorLabel(c),
              colorHex: c.hex,
              action: () => {
                activeRange = this.editor.formatting.setHighlightColor(c.hex, activeRange);
              }
            }))
          },
          {
            label: t("SIN.Notes.MenuAlign"),
            icon: "fas fa-align-justify",
            submenu: [
              {
                label: t("SIN.Notes.AlignJustify"),
                icon: "fas fa-align-justify",
                active: state.align === "justify",
                action: () => {
                  activeRange = this.editor.formatting.setAlignment("justify", activeRange);
                }
              },
              {
                label: t("SIN.Notes.AlignLeft"),
                icon: "fas fa-align-left",
                active: state.align === "left",
                action: () => {
                  activeRange = this.editor.formatting.setAlignment("left", activeRange);
                }
              },
              {
                label: t("SIN.Notes.AlignCenter"),
                icon: "fas fa-align-center",
                active: state.align === "center",
                action: () => {
                  activeRange = this.editor.formatting.setAlignment("center", activeRange);
                }
              },
              {
                label: t("SIN.Notes.AlignRight"),
                icon: "fas fa-align-right",
                active: state.align === "right",
                action: () => {
                  activeRange = this.editor.formatting.setAlignment("right", activeRange);
                }
              }
            ]
          },
          { separator: true },
          {
            label: t("SIN.Notes.MenuCut"),
            icon: "fas fa-scissors",
            action: () => this.menus._cut(activeRange)
          }
        );
      }

      items.push({
        label: t("SIN.Notes.MenuCopy"),
        icon: "fas fa-copy",
        action: () => this.menus._copy(activeRange)
      });

      if (this.canEdit) {
        items.push({
          label: t("SIN.Notes.MenuPaste"),
          icon: "fas fa-paste",
          action: () => this.menus._paste(activeRange)
        });
      }

      items.push(selectAllItem);

      if (this.canEdit) {
        items.push(
          { separator: true },
          buildInsertSubmenu(),
          buildBoxesSubmenu(),
          buildListsSubmenu(),
          { separator: true },
          {
            label: t("SIN.Notes.MenuClearFormat"),
            icon: "fas fa-remove-format",
            action: () => {
              activeRange = this.editor.formatting.clearFormatting(activeRange);
            }
          }
        );
      }
    } else if (this.canEdit) {
      items.push({
        label: t("SIN.Notes.MenuPaste"),
        icon: "fas fa-paste",
        action: () => this.menus._paste(activeRange)
      });

      if (this.editor.images.hasCopiedImage()) {
        items.push({
          label: t("SIN.Notes.MenuPasteImage"),
          icon: "fas fa-image",
          action: () => this.editor.images.pasteCopiedImage(activeRange)
        });
      }

      items.push(
        selectAllItem,
        { separator: true },
        buildInsertSubmenu(),
        buildBoxesSubmenu(),
        buildListsSubmenu()
      );
    } else {
      items.push(selectAllItem);
    }

    return { formatButtons, items };
  }

  /* ================= TABELAS ================= */

  buildTableMenuConfig(e, cell, selectionRange) {
    const tableBlock = cell.closest(".fk-table-block");
    const table = cell.closest("table.fk-table");
    const targetCells = this.editor.tables.getSelectedCells(cell);
    const counts = this.editor.tables.getSelectionCounts(cell);

    const hasTextSelection = Boolean(
      selectionRange && cell.contains(selectionRange.commonAncestorContainer) && targetCells.length === 1
    );
    let activeRange = hasTextSelection ? selectionRange : null;

    const items = [];
    let formatButtons = null;

    if (hasTextSelection) {
      const state = this.editor.formatting.getState(activeRange);
      formatButtons = [
        {
          title: t("SIN.Notes.FmtBold"),
          html: `<i class="fas fa-bold"></i>`,
          active: state.bold,
          keepOpen: false,
          action: () => {
            activeRange = this.editor.formatting.toggleInline("bold", activeRange);
          }
        },
        {
          title: t("SIN.Notes.FmtItalic"),
          html: `<i class="fas fa-italic"></i>`,
          active: state.italic,
          keepOpen: false,
          action: () => {
            activeRange = this.editor.formatting.toggleInline("italic", activeRange);
          }
        },
        {
          title: t("SIN.Notes.FmtUnderline"),
          html: `<i class="fas fa-underline"></i>`,
          active: state.underline,
          keepOpen: false,
          action: () => {
            activeRange = this.editor.formatting.toggleInline("underline", activeRange);
          }
        },
        {
          title: t("SIN.Notes.FmtStrike"),
          html: `<i class="fas fa-strikethrough"></i>`,
          active: state.strike,
          keepOpen: false,
          action: () => {
            activeRange = this.editor.formatting.toggleInline("strikeThrough", activeRange);
          }
        }
      ];

      items.push(
        {
          label: t("SIN.Notes.MenuTextColor"),
          icon: "fas fa-font",
          submenu: ITEM_COLORS.map((c) => ({
            label: colorLabel(c),
            colorHex: c.hex,
            action: () => {
              activeRange = this.editor.formatting.setTextColor(c.hex, activeRange);
            }
          }))
        },
        {
          label: t("SIN.Notes.MenuHighlight"),
          icon: "fas fa-highlighter",
          submenu: ITEM_COLORS.map((c) => ({
            label: colorLabel(c),
            colorHex: c.hex,
            action: () => {
              activeRange = this.editor.formatting.setHighlightColor(c.hex, activeRange);
            }
          }))
        },
        { separator: true }
      );
    }

    const clearLabel =
      targetCells.length > 1
        ? t("SIN.Notes.TblClearCells", { count: targetCells.length })
        : t("SIN.Notes.TblClearCell");
    const colorLabelText =
      targetCells.length > 1
        ? t("SIN.Notes.TblColorCells", { count: targetCells.length })
        : t("SIN.Notes.TblColorCell");

    items.push(
      {
        label: t("SIN.Notes.MenuCopy"),
        icon: "fas fa-copy",
        action: () => this.editor.tables.copyCells(targetCells)
      },
      {
        label: t("SIN.Notes.MenuPaste"),
        icon: "fas fa-paste",
        action: () => this.menus._pasteIntoTableCell(cell, { plainOnly: false })
      },
      {
        label: t("SIN.Notes.MenuSelectAll"),
        icon: "fas fa-check-double",
        action: () => this.editor.selectAll()
      }
    );

    if (this.editor.tables.hasCopiedGrid()) {
      items.push({
        label: t("SIN.Notes.TblInsertCopiedRows"),
        icon: "fas fa-level-down-alt",
        action: () => this.editor.tables.insertCopiedRowsBelow(cell)
      });
    }

    items.push(
      {
        label: clearLabel,
        icon: "fas fa-eraser",
        action: () => this.editor.tables.clearCellsContent(targetCells)
      },
      { separator: true },
      {
        label: colorLabelText,
        icon: "fas fa-fill-drip",
        submenu: ITEM_COLORS.map((c) => ({
          label: colorLabel(c),
          colorHex: c.hex,
          action: () => this.editor.tables.colorCells(targetCells, c.hex)
        }))
      },
      {
        iconRow: true,
        label: t("SIN.Notes.TblDistribute"),
        buttons: [
          {
            text: t("SIN.Notes.TblColumns"),
            title:
              counts.cols > 1
                ? t("SIN.Notes.TblDistributeSelCols", { count: counts.cols })
                : t("SIN.Notes.TblDistributeAllCols"),
            action: () =>
              this.editor.tables.distributeColumnsEvenly(table, { cells: targetCells })
          },
          {
            text: t("SIN.Notes.TblRows"),
            title:
              counts.rows > 1
                ? t("SIN.Notes.TblDistributeSelRows", { count: counts.rows })
                : t("SIN.Notes.TblDistributeAllRows"),
            action: () =>
              this.editor.tables.distributeRowsEvenly(table, { cells: targetCells })
          }
        ]
      },
      { separator: true },
      {
        iconRow: true,
        label: t("SIN.Notes.TblRowLabel"),
        buttons: [
          {
            title: t("SIN.Notes.TblInsertRowAbove"),
            html: `<i class="fas fa-plus fk-ico-sub"></i><i class="fas fa-arrow-up"></i>`,
            action: () => this.editor.tables.insertRowAbove(cell)
          },
          {
            title: t("SIN.Notes.TblInsertRowBelow"),
            html: `<i class="fas fa-plus fk-ico-sub"></i><i class="fas fa-arrow-down"></i>`,
            action: () => this.editor.tables.insertRowBelow(cell)
          },
          {
            title:
              counts.rows > 1
                ? t("SIN.Notes.TblDeleteRows", { count: counts.rows })
                : t("SIN.Notes.TblDeleteRow"),
            html: `<i class="fas fa-trash"></i>`,
            danger: true,
            action: () => this.editor.tables.deleteRows(targetCells)
          }
        ]
      },
      {
        iconRow: true,
        label: t("SIN.Notes.TblColLabel"),
        buttons: [
          {
            title: t("SIN.Notes.TblInsertColLeft"),
            html: `<i class="fas fa-plus fk-ico-sub"></i><i class="fas fa-arrow-left"></i>`,
            action: () => this.editor.tables.insertColLeft(cell)
          },
          {
            title: t("SIN.Notes.TblInsertColRight"),
            html: `<i class="fas fa-plus fk-ico-sub"></i><i class="fas fa-arrow-right"></i>`,
            action: () => this.editor.tables.insertColRight(cell)
          },
          {
            title:
              counts.cols > 1
                ? t("SIN.Notes.TblDeleteCols", { count: counts.cols })
                : t("SIN.Notes.TblDeleteCol"),
            html: `<i class="fas fa-trash"></i>`,
            danger: true,
            action: () => this.editor.tables.deleteCols(targetCells)
          }
        ]
      },
      { separator: true },
      {
        label: t("SIN.Notes.TblDeleteTable"),
        icon: "fas fa-trash",
        danger: true,
        action: () => this.editor.tables.deleteTable(tableBlock || table)
      }
    );

    return { formatButtons, items };
  }

  /* ================= CAIXAS ================= */

  buildBoxMenuConfig(e, boxBlock, selectionRange) {
    const hasSelection = Boolean(selectionRange && boxBlock.contains(selectionRange.commonAncestorContainer));
    let activeRange = hasSelection ? selectionRange : null;

    const editableSlot = e.target.closest?.(
      ".fk-box-drawer-title, .fk-box-drawer-body, .fk-box-quote-body, .fk-box-quote-author, .fk-box-note-body, .fk-box-code-body"
    );

    const items = [];
    let formatButtons = null;

    if (hasSelection) {
      if (this.canEdit) {
        const state = this.editor.formatting.getState(activeRange);
        formatButtons = [
          {
            title: t("SIN.Notes.FmtBold"),
            html: `<i class="fas fa-bold"></i>`,
            active: state.bold,
            keepOpen: false,
            action: () => {
              activeRange = this.editor.formatting.toggleInline("bold", activeRange);
            }
          },
          {
            title: t("SIN.Notes.FmtItalic"),
            html: `<i class="fas fa-italic"></i>`,
            active: state.italic,
            keepOpen: false,
            action: () => {
              activeRange = this.editor.formatting.toggleInline("italic", activeRange);
            }
          },
          {
            title: t("SIN.Notes.FmtUnderline"),
            html: `<i class="fas fa-underline"></i>`,
            active: state.underline,
            keepOpen: false,
            action: () => {
              activeRange = this.editor.formatting.toggleInline("underline", activeRange);
            }
          },
          {
            title: t("SIN.Notes.FmtStrike"),
            html: `<i class="fas fa-strikethrough"></i>`,
            active: state.strike,
            keepOpen: false,
            action: () => {
              activeRange = this.editor.formatting.toggleInline("strikeThrough", activeRange);
            }
          },
          {
            title: t("SIN.Notes.FmtFontDown"),
            html: `A-`,
            active: false,
            keepOpen: true,
            action: () => {
              activeRange = this.editor.formatting.stepFontSize(-1, activeRange);
            }
          },
          {
            title: t("SIN.Notes.FmtFontUp"),
            html: `A+`,
            active: false,
            keepOpen: true,
            action: () => {
              activeRange = this.editor.formatting.stepFontSize(1, activeRange);
            }
          }
        ];

        items.push(
          {
            label: t("SIN.Notes.MenuTextColor"),
            icon: "fas fa-font",
            submenu: ITEM_COLORS.map((c) => ({
              label: colorLabel(c),
              colorHex: c.hex,
              action: () => {
                activeRange = this.editor.formatting.setTextColor(c.hex, activeRange);
              }
            }))
          },
          {
            label: t("SIN.Notes.MenuHighlight"),
            icon: "fas fa-highlighter",
            submenu: ITEM_COLORS.map((c) => ({
              label: colorLabel(c),
              colorHex: c.hex,
              action: () => {
                activeRange = this.editor.formatting.setHighlightColor(c.hex, activeRange);
              }
            }))
          },
          { separator: true },
          {
            label: t("SIN.Notes.MenuCut"),
            icon: "fas fa-scissors",
            action: () => this.menus._cut(activeRange)
          }
        );
      }

      items.push({
        label: t("SIN.Notes.MenuCopy"),
        icon: "fas fa-copy",
        action: () => this.menus._copy(activeRange)
      });

      if (this.canEdit) {
        items.push({
          label: t("SIN.Notes.MenuPaste"),
          icon: "fas fa-paste",
          action: () => this.menus._paste(activeRange)
        });
      }

      items.push({
        label: t("SIN.Notes.MenuSelectAll"),
        icon: "fas fa-check-double",
        action: () => this.editor.selectAll()
      });

      if (this.canEdit) {
        items.push(
          { separator: true },
          {
            label: t("SIN.Notes.MenuClearFormat"),
            icon: "fas fa-remove-format",
            action: () => {
              activeRange = this.editor.formatting.clearFormatting(activeRange);
            }
          }
        );
      }
    } else {
      if (this.canEdit && editableSlot) {
        const caret = this.menus._getCaretRangeAtPoint(e.clientX, e.clientY, e.target);
        if (caret && editableSlot.contains(caret.startContainer)) {
          items.push({
            label: t("SIN.Notes.MenuPaste"),
            icon: "fas fa-paste",
            action: () => this.menus._paste(caret)
          });
        }
      }

      items.push({
        label: t("SIN.Notes.MenuSelectAll"),
        icon: "fas fa-check-double",
        action: () => this.editor.selectAll()
      });

      if (this.canEdit) {
        items.push({ separator: true });
      }
    }

    if (this.canEdit) {
      if (hasSelection && items.length) items.push({ separator: true });
      const label = this.editor.boxes.getBoxLabel(boxBlock);
      items.push({
        label: t("SIN.Notes.MenuDeleteBox", { label }),
        icon: "fas fa-trash",
        danger: true,
        action: () => this.editor.boxes.deleteBox(boxBlock)
      });
    }

    return { formatButtons, items };
  }
}