import { MODULE_TITLE } from "../storage/storage.js";
import { bindCloseOnOutsideClick } from "../shared/shared-ui-utils.js";
import { t } from "../shared/shared-i18n.js";

const { ApplicationV2 } = foundry.applications.api;

export class SimplyInsaneNotesSearchApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "simply-insane-notes-search-app",
    classes: ["fk-notes-window", "fk-floating-search-window"],
    window: {
      title: MODULE_TITLE,
      icon: "fas fa-search",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 420,
      height: 640
    }
  };

  constructor(mainApp, options = {}) {
    super(options);
    this.mainApp = mainApp;
    this._outsideCleanup = null;
  }

  async _prepareContext() {
    return {};
  }

  async _renderHTML() {
    const root = document.createElement("div");
    root.style.cssText = "display:flex; flex-direction:column; height:100%; overflow:hidden;";
    root.addEventListener("keydown", (e) => e.stopPropagation());
    this.mainApp.searchView.render(root);
    return root;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const header = this.element?.querySelector(".window-header");
    if (!header) return;

    header.querySelectorAll(".fk-header-slot").forEach((el) => el.remove());

    const isFavMode = Boolean(
      this.mainApp.searchView.filters.favoritesOnly && !this.mainApp.searchView.query
    );
    const titleEl = header.querySelector(".window-title");
    if (titleEl) {
      titleEl.textContent = isFavMode ? t("SIN.Search.FavoritesTitle") : t("SIN.Search.WindowTitle");
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