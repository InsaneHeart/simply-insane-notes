import { MODULE_ID, MODULE_TITLE, MODULE_VERSION } from "../storage/storage.js";
import { bindCloseOnOutsideClick } from "../shared/shared.js";
import { SUPPORTED_UI_LANGS, loadModuleLanguage, t } from "../shared/shared-i18n.js";

const { ApplicationV2 } = foundry.applications.api;

const AVAILABLE_SPELL_LANGUAGES = [
  { code: "pt-BR", labelKey: "SIN.Settings.SpellLangPtBR" },
  { code: "en-US", labelKey: "SIN.Settings.SpellLangEnUS" },
  { code: "es", labelKey: "SIN.Settings.SpellLangEs" },
  { code: "fr", labelKey: "SIN.Settings.SpellLangFr" }
];

const KEYBINDING_ACTIONS = [
  { action: "openManager", labelKey: "SIN.Keybinds.OpenManager" },
  { action: "openSearch", labelKey: "SIN.Keybinds.OpenSearch" },
  { action: "quickNote", labelKey: "SIN.Keybinds.QuickNote" }
];

function formatKeyCombo(binding) {
  if (!binding || !binding.key) return t("SIN.Settings.KeyNotSet");
  const mods = Array.isArray(binding.modifiers) ? binding.modifiers : [];
  const cleanKey = binding.key.replace(/^Key/, "").replace(/^Digit/, "");
  return [...mods, cleanKey].join(" + ");
}

export class SimplyInsaneNotesSettingsApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "simply-insane-notes-settings",
    classes: ["fk-notes-window"],
    window: {
      title: MODULE_TITLE,
      icon: "fas fa-cog",
      resizable: false,
      minimizable: false
    },
    position: {
      width: 480,
      height: "auto"
    }
  };

  constructor(options = {}) {
    super(options);
    this._outsideCleanup = null;
  }

  async _prepareContext() {
    return {};
  }

  async _renderHTML() {
    const app = window.fkNotesApp;
    const storage = app?.storage;
    const settings = storage
      ? storage.getSettings()
      : {
          uiLanguage: "auto",
          spellcheckEnabled: true,
          spellcheckIgnoreUppercase: false,
          spellcheckLanguages: ["pt-BR", "en-US"],
          customDictionary: []
        };

    const root = document.createElement("div");
    root.className = "fk-clean-modal-scroll";
    root.addEventListener("keydown", (e) => e.stopPropagation());

    const currentUiLang = settings.uiLanguage || "auto";
    const uiLangOptionsHtml = SUPPORTED_UI_LANGS.map((item) => {
      const label = item.labelKey ? t(item.labelKey) : item.label;
      const selected = item.code === currentUiLang ? "selected" : "";
      return `<option value="${item.code}" ${selected}>${label}</option>`;
    }).join("");

    const keybindsHtml = KEYBINDING_ACTIONS.map((kb) => {
      let currentDisplay = t("SIN.Settings.KeyNotSet");
      try {
        const list = game.keybindings?.get(MODULE_ID, kb.action) || [];
        if (list[0]) currentDisplay = formatKeyCombo(list[0]);
      } catch {
        // Fallback silencioso
      }
      return `
        <div class="fk-clean-meta-row">
          <span class="fk-settings-title">${t(kb.labelKey)}</span>
          <button type="button" class="fk-keybind-capture-btn" data-kb-action="${kb.action}" title="${t("SIN.Settings.KeyCaptureTitle")}">
            ${currentDisplay}
          </button>
        </div>
      `;
    }).join("");

    const langsHtml = AVAILABLE_SPELL_LANGUAGES.map((lang) => {
      const active = (settings.spellcheckLanguages || []).includes(lang.code);
      return `
        <div class="fk-filter-toggle ${active ? "active" : ""}" data-lang-code="${lang.code}">
          <span class="fk-filter-box"><i class="fas fa-check"></i></span>
          <span>${t(lang.labelKey)}</span>
        </div>
      `;
    }).join("");

    root.innerHTML = `
      <div class="fk-modal-top-header">
        <div class="fk-modal-main-title">${t("SIN.Settings.Title")}</div>
        <div class="fk-modal-subtitle">
          <span>${MODULE_TITLE} • ${t("SIN.Common.Version")} ${MODULE_VERSION}</span>
        </div>
      </div>

      <!-- 1. IDIOMA DA INTERFACE -->
      <div>
        <div class="fk-clean-section-title">${t("SIN.Settings.InterfaceSection")}</div>
        <div class="fk-clean-meta-list">
          <div class="fk-clean-meta-row">
            <div class="fk-settings-label-col">
              <span class="fk-settings-title">${t("SIN.Settings.UiLanguageTitle")}</span>
              <span class="fk-settings-desc">${t("SIN.Settings.UiLanguageDesc")}</span>
            </div>
            <select id="fk-cfg-ui-lang" class="fk-backup-user-map" style="width:185px;">
              ${uiLangOptionsHtml}
            </select>
          </div>
        </div>
      </div>

      <!-- 2. VERIFICAÇÃO ORTOGRÁFICA -->
      <div>
        <div class="fk-clean-section-title">${t("SIN.Settings.SpellcheckSection")}</div>
        <div class="fk-clean-meta-list">
          <div class="fk-clean-meta-row">
            <div class="fk-settings-label-col">
              <span class="fk-settings-title">${t("SIN.Settings.SpellEnabledTitle")}</span>
              <span class="fk-settings-desc">${t("SIN.Settings.SpellEnabledDesc")}</span>
            </div>
            <div class="fk-filter-toggle ${settings.spellcheckEnabled ? "active" : ""}" id="fk-cfg-spell-enabled">
              <span class="fk-filter-box"><i class="fas fa-check"></i></span>
            </div>
          </div>

          <div class="fk-clean-meta-row">
            <div class="fk-settings-label-col">
              <span class="fk-settings-title">${t("SIN.Settings.SpellUpperTitle")}</span>
              <span class="fk-settings-desc">${t("SIN.Settings.SpellUpperDesc")}</span>
            </div>
            <div class="fk-filter-toggle ${settings.spellcheckIgnoreUppercase ? "active" : ""}" id="fk-cfg-spell-upper">
              <span class="fk-filter-box"><i class="fas fa-check"></i></span>
            </div>
          </div>

          <div class="fk-clean-meta-row" style="flex-direction:column; align-items:stretch; gap:6px;">
            <span class="fk-clean-meta-key">${t("SIN.Settings.AcceptedLanguages")}</span>
            <div class="fk-lang-grid" id="fk-cfg-langs">${langsHtml}</div>
          </div>
        </div>
      </div>

      <!-- 3. DICIONÁRIO PERSONALIZADO -->
      <div>
        <div class="fk-clean-section-title">${t("SIN.Settings.DictionarySection", { count: (settings.customDictionary || []).length })}</div>
        <span class="fk-settings-desc">${t("SIN.Settings.DictionaryDesc")}</span>

        <div class="fk-dict-input-row">
          <input type="text" id="fk-cfg-dict-input" autocomplete="off" spellcheck="false" placeholder="${t("SIN.Settings.DictionaryPlaceholder")}" />
          <button type="button" class="fk-hdr-btn primary" id="fk-cfg-dict-add" style="height:26px;">
            <i class="fas fa-plus"></i> ${t("SIN.Common.Add")}
          </button>
        </div>

        <div class="fk-dict-chips" id="fk-cfg-dict-chips"></div>
      </div>

      <!-- 4. ATALHOS DE TECLADO -->
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
          <div class="fk-clean-section-title" style="margin:0;">${t("SIN.Settings.KeybindsSection")}</div>
          <button type="button" class="fk-hdr-btn" id="fk-cfg-open-native-controls" title="${t("SIN.Settings.NativeControlsTitle")}">
            <i class="fas fa-external-link-alt"></i> ${t("SIN.Settings.NativeControlsBtn")}
          </button>
        </div>
        <div class="fk-clean-meta-list">
          ${keybindsHtml}
        </div>
      </div>
    `;

    root.querySelector("#fk-cfg-ui-lang")?.addEventListener("change", async (e) => {
      if (!storage) return;
      const newLang = e.target.value || "auto";
      const s = storage.getSettings();
      s.uiLanguage = newLang;
      storage.saveSettings(s);
      await loadModuleLanguage(newLang);
      this.render({ force: true });
      if (app?.rendered) app.render({ force: true });
      if (app?.searchWindow?.rendered) app.searchWindow.render({ force: true });
    });

    const chipsContainer = root.querySelector("#fk-cfg-dict-chips");
    const renderChips = () => {
      const currentDict = storage ? storage.getSettings().customDictionary || [] : [];
      if (!currentDict.length) {
        chipsContainer.innerHTML = `<span style="font-size:12px; color:#71717a;">${t("SIN.Settings.DictionaryEmpty")}</span>`;
        return;
      }
      chipsContainer.innerHTML = currentDict
        .map(
          (word) => `
          <span class="fk-dict-chip">
            <span>${storage.escapeHtml(word)}</span>
            <i class="fas fa-times" data-del-word="${storage.escapeHtml(word)}" title="${t("SIN.Common.Remove")}"></i>
          </span>
        `
        )
        .join("");

      chipsContainer.querySelectorAll("[data-del-word]").forEach((icon) => {
        icon.addEventListener("click", () => {
          storage?.removeWordFromDictionary(icon.dataset.delWord);
          renderChips();
          app?.textEditor?.refreshSpellcheck?.();
        });
      });
    };
    renderChips();

    const toggleSpellEl = root.querySelector("#fk-cfg-spell-enabled");
    toggleSpellEl?.addEventListener("click", () => {
      if (!storage) return;
      const s = storage.getSettings();
      s.spellcheckEnabled = !s.spellcheckEnabled;
      storage.saveSettings(s);
      toggleSpellEl.classList.toggle("active", s.spellcheckEnabled);
      app?.textEditor?.refreshSpellcheck?.();
    });

    const toggleUpperEl = root.querySelector("#fk-cfg-spell-upper");
    toggleUpperEl?.addEventListener("click", () => {
      if (!storage) return;
      const s = storage.getSettings();
      s.spellcheckIgnoreUppercase = !s.spellcheckIgnoreUppercase;
      storage.saveSettings(s);
      toggleUpperEl.classList.toggle("active", s.spellcheckIgnoreUppercase);
      app?.textEditor?.refreshSpellcheck?.();
    });

    root.querySelectorAll("[data-lang-code]").forEach((langEl) => {
      langEl.addEventListener("click", () => {
        if (!storage) return;
        const code = langEl.dataset.langCode;
        const s = storage.getSettings();
        const set = new Set(s.spellcheckLanguages || []);
        if (set.has(code)) {
          if (set.size > 1) set.delete(code);
        } else {
          set.add(code);
        }
        s.spellcheckLanguages = Array.from(set);
        storage.saveSettings(s);
        langEl.classList.toggle("active", set.has(code));
        app?.textEditor?.refreshSpellcheck?.();
      });
    });

    const dictInput = root.querySelector("#fk-cfg-dict-input");
    const addDictWord = () => {
      const val = (dictInput.value || "").trim();
      if (!val || !storage) return;
      storage.addWordToDictionary(val);
      dictInput.value = "";
      renderChips();
      app?.textEditor?.refreshSpellcheck?.();
    };

    root.querySelector("#fk-cfg-dict-add")?.addEventListener("click", addDictWord);
    dictInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addDictWord();
      }
    });

    root.querySelectorAll("[data-kb-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.kbAction;
        btn.classList.add("listening");
        btn.textContent = t("SIN.Settings.PressKeys");

        const onKeyDown = async (ev) => {
          if (["Control", "Shift", "Alt", "Meta"].includes(ev.key)) return;
          ev.preventDefault();
          ev.stopPropagation();
          window.removeEventListener("keydown", onKeyDown, true);
          btn.classList.remove("listening");

          if (ev.key === "Escape") {
            const list = game.keybindings?.get(MODULE_ID, action) || [];
            btn.textContent = list[0] ? formatKeyCombo(list[0]) : t("SIN.Settings.KeyNotSet");
            return;
          }

          const modifiers = [];
          if (ev.ctrlKey) modifiers.push("Control");
          if (ev.altKey) modifiers.push("Alt");
          if (ev.shiftKey) modifiers.push("Shift");

          const newBinding = [{ key: ev.code, modifiers }];
          try {
            await game.keybindings.set(MODULE_ID, action, newBinding);
            btn.textContent = formatKeyCombo(newBinding[0]);
            ui.notifications.info(t("SIN.Settings.KeyUpdated"));
          } catch (err) {
            console.error(err);
            ui.notifications.warn(t("SIN.Settings.KeySaveError"));
          }
        };

        window.addEventListener("keydown", onKeyDown, true);
      });
    });

    root.querySelector("#fk-cfg-open-native-controls")?.addEventListener("click", () => {
      app?.openFoundryKeybindingsConfig?.();
    });

    return root;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const titleEl = this.element?.querySelector(".window-header .window-title");
    if (titleEl) {
      titleEl.textContent = `${t("SIN.Settings.Title")} — ${MODULE_TITLE}`;
    }

    this._outsideCleanup?.();
    this._outsideCleanup = null;
    if (this.element) {
      this._outsideCleanup = bindCloseOnOutsideClick(this.element, () => {
        this.close({ animate: false });
      });
    }
  }

  async close(options = {}) {
    this._outsideCleanup?.();
    this._outsideCleanup = null;
    return super.close(options);
  }
}

export function registerModuleSettings() {
  if (!game.settings) return;

  game.settings.registerMenu(MODULE_ID, "settingsMenu", {
    name: `${MODULE_TITLE}`,
    label: t("SIN.Settings.OpenMenuLabel"),
    hint: t("SIN.Settings.OpenMenuHint"),
    icon: "fas fa-cog",
    type: SimplyInsaneNotesSettingsApp,
    restricted: false
  });
}