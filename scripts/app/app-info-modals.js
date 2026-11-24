import { MODULE_ID, MODULE_TITLE, MODULE_VERSION } from "../storage/storage.js";
import { getActiveLang, t } from "../shared/shared-i18n.js";

const { DialogV2 } = foundry.applications.api;
const EASTER_EGG_COOLDOWN_MS = 30000;

export class InfoModals {
  constructor(app) {
    this.app = app;
    this.storage = app.storage;
    this._lastEasterEggRollAt = 0;
  }

  _bindOutsideClick(parentEl, getChildEls, onClose) {
    if (!parentEl) return () => {};
    let armed = false;
    const armTimer = setTimeout(() => {
      armed = true;
    }, 50);

    const onPointerDown = (e) => {
      if (!armed) return;
      if (!parentEl.isConnected) {
        cleanup();
        return;
      }

      const target = e.target;
      if (parentEl.contains(target)) return;

      const children = typeof getChildEls === "function" ? getChildEls() : [];
      for (const childEl of children) {
        if (childEl && childEl.isConnected && childEl.contains(target)) {
          return;
        }
      }

      onClose(e);
    };

    const cleanup = () => {
      clearTimeout(armTimer);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return cleanup;
  }

  _getEasterEggRemainingSeconds() {
    if (!this._lastEasterEggRollAt) return 0;
    const remainingMs = EASTER_EGG_COOLDOWN_MS - (Date.now() - this._lastEasterEggRollAt);
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  }

  _formatTimestamp(ts) {
    if (!ts) return t("SIN.Info.UnknownDate");
    const d = new Date(ts);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return t("SIN.Info.DateAt", { date: `${dd}/${mm}/${yyyy}`, time: `${hh}:${min}` });
  }

  _countWordsAndChars(note) {
    if (!note) return { words: 0, chars: 0 };

    let rawText = "";
    if (note.type === "mindmap") {
      rawText = (note.mindmap?.nodes || [])
        .map((n) => `${n.title || ""} ${n.details || ""}`.trim())
        .filter(Boolean)
        .join(" ");
    } else {
      const tmp = document.createElement("div");
      tmp.innerHTML = `${note.title || ""} ${note.content || ""}`;
      tmp.querySelectorAll(".fk-img-toolbar, .fk-code-copy-btn").forEach((el) => el.remove());
      rawText = tmp.textContent || "";
    }

    const normalized = rawText.replace(/\u200B/g, "").trim();
    const chars = normalized.length;
    const words = normalized ? normalized.split(/\s+/).filter(Boolean).length : 0;
    return { words, chars };
  }

  _extractLinksFromNote(note) {
    const internalIds = new Set();
    const externalUrls = new Set();

    if (note.type === "mindmap") {
      for (const node of note.mindmap?.nodes || []) {
        if (node.nodeType === "link" && node.linkedNoteId) {
          internalIds.add(node.linkedNoteId);
        }
        const combined = `${node.title || ""} ${node.details || ""}`;
        const urlMatches = combined.match(/https?:\/\/[^\s"'<>]+/gi) || [];
        urlMatches.forEach((u) => externalUrls.add(u));
      }
    } else {
      const tmp = document.createElement("div");
      tmp.innerHTML = note.content || "";
      tmp.querySelectorAll("a.fk-note-link[data-note-link-id], span.fk-note-link[data-note-id]").forEach((el) => {
        const id = el.dataset.noteLinkId || el.dataset.noteId;
        if (id) internalIds.add(id);
      });
      tmp.querySelectorAll("a.fk-ext-link[href], a.fk-link-web[href]").forEach((a) => {
        if (a.href && !a.href.startsWith("mailto:")) externalUrls.add(a.href);
      });
    }

    return {
      internalIds: Array.from(internalIds),
      externalUrls: Array.from(externalUrls)
    };
  }

  _findBacklinks(targetNoteId) {
    const allNotes = this.storage.getAllAccessibleNotes();
    const backlinks = [];

    for (const candidate of allNotes) {
      if (candidate.id === targetNoteId) continue;
      const { internalIds } = this._extractLinksFromNote(candidate);
      if (internalIds.includes(targetNoteId)) {
        backlinks.push(candidate);
      }
    }

    return backlinks;
  }

  /* ================= MODAL: INFORMAÇÕES DA NOTA ================= */

  async openNoteInfoModal(noteId, ownerId = null) {
    const note = this.storage.findAnyNoteById(noteId, ownerId);
    if (!note) return;

    const isReadOnly = Boolean(note.readOnly);
    const isLocked = Boolean(note.locked);
    const isShared = this.storage.isNoteShared(note);
    const sharingSummary = this.storage.getNoteSharingSummary(note);

    const data = this.storage.getData();
    const allAccessible = this.storage.getAllAccessibleNotes();
    const displayTitle =
      (note.type === "mindmap"
        ? note.mindmap?.nodes?.[0]?.title || note.title
        : note.title) || t("SIN.Common.UntitledNote");

    let locationLabel = isReadOnly
      ? t("SIN.App.SharedFolderLabel", { owner: note.ownerName })
      : t("SIN.Common.General");
    if (!isReadOnly) {
      const colName = data.columns.find((c) => c.id === note.columnId)?.title || t("SIN.Common.General");
      const subName = note.subsectionId
        ? data.subsections.find((s) => s.id === note.subsectionId)?.title
        : null;
      locationLabel = subName ? `${colName} › ${subName}` : colName;
    }

    const { words, chars } = this._countWordsAndChars(note);
    const { internalIds, externalUrls } = this._extractLinksFromNote(note);
    const linkedNotes = internalIds
      .map((id) => allAccessible.find((n) => n.id === id))
      .filter(Boolean);
    const backlinks = this._findBacklinks(noteId);

    const outgoingHtml = linkedNotes.length
      ? linkedNotes
          .map((n) => {
            const label =
              (n.type === "mindmap" ? n.mindmap?.nodes?.[0]?.title || n.title : n.title) ||
              t("SIN.Common.UntitledNote");
            const icon = n.type === "mindmap" ? "fa-project-diagram" : "fa-align-left";
            return `<span class="fk-link-chip" data-open-note="${n.id}" data-open-owner="${n.ownerId || ""}"><i class="fas ${icon}"></i> ${this.storage.escapeHtml(label)}</span>`;
          })
          .join("")
      : `<span style="font-size:12px; color:#71717a;">${t("SIN.Info.NoInternalLinks")}</span>`;

    const backlinksHtml = backlinks.length
      ? backlinks
          .map((n) => {
            const label =
              (n.type === "mindmap" ? n.mindmap?.nodes?.[0]?.title || n.title : n.title) ||
              t("SIN.Common.UntitledNote");
            const icon = n.type === "mindmap" ? "fa-project-diagram" : "fa-align-left";
            return `<span class="fk-link-chip" data-open-note="${n.id}" data-open-owner="${n.ownerId || ""}"><i class="fas ${icon}"></i> ${this.storage.escapeHtml(label)}</span>`;
          })
          .join("")
      : `<span style="font-size:12px; color:#71717a;">${t("SIN.Info.NoBacklinks")}</span>`;

    const extHtml = externalUrls.length
      ? externalUrls
          .map(
            (url) =>
              `<a class="fk-link-chip" href="${this.storage.escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-external-link-alt"></i> ${this.storage.escapeHtml(url)}</a>`
          )
          .join("")
      : `<span style="font-size:12px; color:#71717a;">${t("SIN.Info.NoExternalLinks")}</span>`;

    const typeLabel = note.type === "mindmap" ? t("SIN.Common.MindMap") : t("SIN.Menus.TextBlock");

    const content = `
      <div class="fk-clean-modal-scroll">
        <div class="fk-modal-top-header">
          <div class="fk-modal-main-title">${this.storage.escapeHtml(displayTitle)}</div>
          <div class="fk-modal-subtitle">
            <span>${typeLabel} • ${this.storage.escapeHtml(locationLabel)}</span>
            ${isLocked ? `<span>• <i class="fas fa-lock" style="color:#facc15;"></i> ${t("SIN.Info.EditLocked")}</span>` : ""}
            <span id="fk-info-shared-badge" style="${isShared ? "" : "display:none;"}">• <i class="fas fa-share-alt" style="color:#a78bfa;"></i> ${t("SIN.Info.Shared")}</span>
          </div>
        </div>

        <div class="fk-clean-meta-list">
          <div class="fk-clean-meta-row">
            <span class="fk-clean-meta-key">${t("SIN.Info.CreatedBy")}</span>
            <span class="fk-clean-meta-val">${this.storage.escapeHtml(note.ownerName || game.user.name)}</span>
          </div>
          <div class="fk-clean-meta-row">
            <span class="fk-clean-meta-key">${t("SIN.Info.Sharing")}</span>
            <span class="fk-clean-meta-val" style="display:flex; align-items:center; gap:8px;">
              <span id="fk-info-sharing-summary">${this.storage.escapeHtml(sharingSummary)}</span>
              ${
                !isReadOnly
                  ? `<button type="button" class="fk-hdr-btn" id="fk-info-edit-share-btn" style="height:22px; font-size:11px; padding:0 7px;">
                      <i class="fas fa-share-alt"></i> ${t("SIN.Info.Change")}
                    </button>`
                  : ""
              }
            </span>
          </div>
          <div class="fk-clean-meta-row">
            <span class="fk-clean-meta-key">${t("SIN.Info.CreatedAt")}</span>
            <span class="fk-clean-meta-val">${this._formatTimestamp(note.createdAt)}</span>
          </div>
          <div class="fk-clean-meta-row">
            <span class="fk-clean-meta-key">${t("SIN.Info.UpdatedAt")}</span>
            <span class="fk-clean-meta-val">${this._formatTimestamp(note.updatedAt)}</span>
          </div>
          <div class="fk-clean-meta-row">
            <span class="fk-clean-meta-key">${t("SIN.Info.Words")}</span>
            <span class="fk-clean-meta-val">${words}</span>
          </div>
          <div class="fk-clean-meta-row">
            <span class="fk-clean-meta-key">${t("SIN.Info.Characters")}</span>
            <span class="fk-clean-meta-val">${chars}</span>
          </div>
        </div>

        <div>
          <div class="fk-clean-section-title">${t("SIN.Info.OutgoingLinks", { count: linkedNotes.length })}</div>
          <div class="fk-clean-links-list">${outgoingHtml}</div>
        </div>

        <div>
          <div class="fk-clean-section-title">${t("SIN.Info.Backlinks", { count: backlinks.length })}</div>
          <div class="fk-clean-links-list">${backlinksHtml}</div>
        </div>

        <div>
          <div class="fk-clean-section-title">${t("SIN.Info.ExternalLinks", { count: externalUrls.length })}</div>
          <div class="fk-clean-links-list">${extHtml}</div>
        </div>
      </div>
    `;

    const buttons = [];
    if (!isReadOnly) {
      buttons.push({
        action: "toggle-lock",
        label: isLocked ? t("SIN.Menus.UnlockEdit") : t("SIN.Menus.LockEdit"),
        icon: isLocked ? "fas fa-unlock" : "fas fa-lock",
        callback: () => {
          this.storage.toggleNoteLock(noteId);
          this.app.render({ force: true });
        }
      });
    }
    buttons.push({
      action: "close",
      label: t("SIN.Info.Close"),
      icon: "fas fa-check",
      default: true
    });

    let unbindOutside = null;
    let isShareOpen = false;

    const getOpenShareDialogs = (parentEl) => {
      if (!isShareOpen) return [];
      return Array.from(document.querySelectorAll("dialog.application, .application.dialog")).filter(
        (el) => el !== parentEl && el.isConnected
      );
    };

    await DialogV2.wait({
      classes: ["fk-notes-window"],
      window: { title: t("SIN.Info.NoteInfoTitle"), icon: "fas fa-info-circle" },
      position: { width: 460 },
      content,
      render: (event, dialog) => {
        unbindOutside = this._bindOutsideClick(
          dialog.element,
          () => getOpenShareDialogs(dialog.element),
          () => {
            getOpenShareDialogs(dialog.element).forEach((childEl) => {
              childEl.querySelector('[data-action="close"]')?.click();
            });
            dialog.close();
          }
        );

        const shareBtn = dialog.element.querySelector("#fk-info-edit-share-btn");
        if (shareBtn) {
          shareBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isShareOpen) return;
            isShareOpen = true;
            try {
              await this.storage.openShareSettingsDialog(noteId);
            } finally {
              isShareOpen = false;
            }

            this.app.render({ force: true });
            if (!dialog.element?.isConnected) return;

            const updatedNote = this.storage.findAnyNoteById(noteId, ownerId);
            if (updatedNote) {
              const summaryEl = dialog.element.querySelector("#fk-info-sharing-summary");
              if (summaryEl) {
                summaryEl.textContent = this.storage.getNoteSharingSummary(updatedNote);
              }
              const badgeEl = dialog.element.querySelector("#fk-info-shared-badge");
              if (badgeEl) {
                badgeEl.style.display = this.storage.isNoteShared(updatedNote) ? "" : "none";
              }
            }
          });
        }

        dialog.element.querySelectorAll("[data-open-note]").forEach((chip) => {
          chip.addEventListener("click", () => {
            const targetId = chip.dataset.openNote;
            const targetOwner = chip.dataset.openOwner || null;
            unbindOutside?.();
            dialog.close();
            this.app.openNote(targetId, targetOwner);
          });
        });
      },
      buttons
    });

    unbindOutside?.();
  }

  /* ================= MODAL: SOBRE O APLICATIVO & EASTER EGG D20 ================= */

  _formatInlineMarkdown(text) {
    return this.storage
      .escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, `<code style="background:rgba(255,255,255,0.08); padding:1px 5px; border-radius:3px; font-size:12px;">$1</code>`);
  }

  _pickLocalized(field, lang) {
    if (!field) return "";
    if (typeof field === "string") return field;
    return field[lang] || field.en || field["pt-BR"] || Object.values(field)[0] || "";
  }

  _renderChangelogJson(data, lang) {
    const releases = Array.isArray(data?.releases) ? data.releases : [];
    if (!releases.length) return "";

    return releases
      .map((rel) => {
        const title = this._pickLocalized(rel.title, lang);
        const intro = this._pickLocalized(rel.intro, lang);
        const headingText = title ? `${rel.version} — ${title}` : rel.version;

        const sectionsHtml = (rel.sections || [])
          .map((sec) => {
            const secTitle = this._pickLocalized(sec.heading, lang);
            const items = this._pickLocalized(sec.items, lang);
            const listHtml = Array.isArray(items)
              ? `<ul>${items.map((item) => `<li>${this._formatInlineMarkdown(item)}</li>`).join("")}</ul>`
              : "";
            return `${secTitle ? `<h3>${this._formatInlineMarkdown(secTitle)}</h3>` : ""}${listHtml}`;
          })
          .join("");

        return `
          <h3>${this._formatInlineMarkdown(headingText)}</h3>
          ${intro ? `<p style="margin:6px 0;">${this._formatInlineMarkdown(intro)}</p>` : ""}
          ${sectionsHtml}
        `;
      })
      .join("");
  }

  async openAppInfoModal() {
    const lang = getActiveLang();
    let changelogHtml = "";

    try {
      const resp = await fetch(`modules/${MODULE_ID}/changelog.json?v=${Date.now()}`);
      if (resp.ok) {
        const json = await resp.json();
        changelogHtml = this._renderChangelogJson(json, lang);
      }
    } catch {
      changelogHtml = "";
    }

    if (!changelogHtml) {
      changelogHtml = `<p style="color:#9ca3af;">${t("SIN.Info.ChangelogUnavailable")}</p>`;
    }

    const content = `
      <div class="fk-clean-modal-scroll">
        <div class="fk-modal-top-header">
          <div class="fk-modal-main-title">${MODULE_TITLE}</div>
          <div class="fk-modal-subtitle">
            <i class="fas fa-dice-d20 fk-secret-trigger" id="fk-secret-branch-btn" title="${t("SIN.Info.SecretD20Title")}"></i>
            <span>${t("SIN.Common.Version")} ${MODULE_VERSION} • Foundry VTT v14</span>
            <span class="fk-easter-cooldown-inline" id="fk-about-d20-cooldown"></span>
          </div>
        </div>

        <div class="fk-clean-meta-list">
          <div class="fk-clean-meta-row">
            <span class="fk-clean-meta-key">${t("SIN.Info.Author")}</span>
            <span class="fk-clean-meta-val">InsaneHeart</span>
          </div>
          <div class="fk-clean-meta-row">
            <span class="fk-clean-meta-key">${t("SIN.Info.Project")}</span>
            <span class="fk-clean-meta-val">Fallen Kingdom</span>
          </div>
        </div>

        <div>
          <div class="fk-clean-section-title">${t("SIN.Info.ReleaseNotes")}</div>
          <div class="fk-clean-changelog">${changelogHtml}</div>
        </div>
      </div>
    `;

    let unbindOutside = null;
    let cooldownTimer = null;
    let activeEasterDialog = null;

    await DialogV2.wait({
      classes: ["fk-notes-window"],
      window: { title: t("SIN.Info.AboutTitle", { title: MODULE_TITLE }), icon: "fas fa-book-open" },
      position: { width: 510 },
      content,
      render: (event, dialog) => {
        unbindOutside = this._bindOutsideClick(
          dialog.element,
          () => (activeEasterDialog?.element ? [activeEasterDialog.element] : []),
          () => {
            if (activeEasterDialog) {
              activeEasterDialog.close();
              activeEasterDialog = null;
            }
            dialog.close();
          }
        );

        const secretIcon = dialog.element.querySelector("#fk-secret-branch-btn");
        const cooldownEl = dialog.element.querySelector("#fk-about-d20-cooldown");

        const syncCooldown = () => {
          if (!dialog.element?.isConnected) {
            clearInterval(cooldownTimer);
            cooldownTimer = null;
            return;
          }
          const remaining = this._getEasterEggRemainingSeconds();
          if (cooldownEl) {
            cooldownEl.textContent = remaining > 0 ? `• ${remaining}s` : "";
          }
          secretIcon?.classList.toggle("is-cooldown", remaining > 0);
        };

        syncCooldown();
        cooldownTimer = setInterval(syncCooldown, 250);

        if (secretIcon) {
          secretIcon.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (activeEasterDialog) return;
            await this._openSecretEasterEggModal({
              onMount: (childDialog) => {
                activeEasterDialog = childDialog;
              },
              onUnmount: () => {
                activeEasterDialog = null;
                syncCooldown();
              }
            });
          });
        }
      },
      buttons: [
        {
          action: "close",
          label: t("SIN.Info.Close"),
          icon: "fas fa-check",
          default: true
        }
      ]
    });

    if (cooldownTimer) clearInterval(cooldownTimer);
    unbindOutside?.();
  }

  _buildEasterEggRollContent(roll) {
    let badgeColor = "#c4b5fd";
    let titleText = t("SIN.Info.EasterRollTitle", { roll });
    let storyHtml = "";

    if (roll === 1) {
      badgeColor = "#f87171";
      titleText = t("SIN.Info.EasterCritFailTitle");
      storyHtml = `
        <p style="margin:0 0 8px 0; color:#fca5a5; font-weight:600;">${t("SIN.Info.EasterCritFailLead")}</p>
        <p style="margin:0; font-size:12.5px; color:#d4d4d8;">${t("SIN.Info.EasterCritFailBody")}</p>
      `;
    } else if (roll === 20) {
      badgeColor = "#facc15";
      titleText = t("SIN.Info.EasterCritSuccessTitle");
      storyHtml = `
        <p style="margin:0 0 8px 0; color:#fde047; font-weight:600;">${t("SIN.Info.EasterCritSuccessLead")}</p>
        <p style="margin:0; font-size:12.5px; color:#d4d4d8;">${t("SIN.Info.EasterCritSuccessBody")}</p>
      `;
    } else {
      storyHtml = `
        <p style="margin:0 0 8px 0; color:#e4e4e7; font-weight:500;">${t("SIN.Info.EasterNormalLead")}</p>
        <p style="margin:0; font-size:12px; color:#9ca3af;">${t("SIN.Info.EasterNormalBody", { roll })}</p>
      `;
    }

    return `
      <div class="fk-d20-easter-box">
        <div class="fk-d20-badge" style="color:${badgeColor}; border-color:${badgeColor};">
          <i class="fas fa-dice-d20"></i> <span>${roll}</span>
        </div>
        <div class="fk-d20-title" style="color:${badgeColor};">${titleText}</div>
        ${storyHtml}
        <div class="fk-d20-cooldown" id="fk-easter-egg-cooldown"></div>
      </div>
    `;
  }

  async _openSecretEasterEggModal({ onMount = null, onUnmount = null } = {}) {
    const remaining = this._getEasterEggRemainingSeconds();

    if (remaining > 0) {
      ui.notifications?.info(t("SIN.Info.EasterCooldown", { seconds: remaining }));
      return;
    }

    this._lastEasterEggRollAt = Date.now();
    const roll = Math.floor(Math.random() * 20) + 1;
    let cooldownTimer = null;

    try {
      await DialogV2.wait({
        classes: ["fk-notes-window"],
        window: { title: t("SIN.Info.EasterTitle"), icon: "fas fa-dice-d20" },
        position: { width: 420 },
        content: `<div id="fk-easter-egg-container">${this._buildEasterEggRollContent(roll)}</div>`,
        render: (event, dialog) => {
          onMount?.(dialog);

          const cooldownEl = dialog.element.querySelector("#fk-easter-egg-cooldown");
          const syncCooldown = () => {
            if (!dialog.element?.isConnected) {
              clearInterval(cooldownTimer);
              cooldownTimer = null;
              return;
            }
            const sec = this._getEasterEggRemainingSeconds();
            if (cooldownEl) {
              cooldownEl.textContent = sec > 0 ? t("SIN.Info.EasterCooldown", { seconds: sec }) : "";
            }
            if (sec <= 0) {
              clearInterval(cooldownTimer);
              cooldownTimer = null;
            }
          };

          syncCooldown();
          cooldownTimer = setInterval(syncCooldown, 250);
        },
        buttons: [
          {
            action: "ok",
            label: t("SIN.Info.Close"),
            icon: "fas fa-check",
            default: true
          }
        ]
      });
    } finally {
      if (cooldownTimer) clearInterval(cooldownTimer);
      onUnmount?.();
    }
  }
}