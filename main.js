import * as Storage from "./scripts/storage/storage.js";
import * as App from "./scripts/app/app.js";
import * as Shared from "./scripts/shared/shared.js";

/* ================= REGISTRO NATIVO DE ATALHOS E CONFIGURAÇÕES NO FOUNDRY VTT ================= */

Hooks.once("init", () => {
  App.registerModuleSettings();

  if (!game.keybindings) return;

  game.keybindings.register(Storage.MODULE_ID, "openManager", {
    name: "SIN.Keybinds.OpenManager",
    hint: "SIN.Keybinds.OpenManagerHint",
    editable: [{ key: "KeyN", modifiers: ["Alt"] }],
    onDown: () => {
      window.fkNotesApp?.openManager();
      return true;
    }
  });

  game.keybindings.register(Storage.MODULE_ID, "openSearch", {
    name: "SIN.Keybinds.OpenSearch",
    hint: "SIN.Keybinds.OpenSearchHint",
    editable: [{ key: "KeyF", modifiers: ["Alt"] }],
    onDown: () => {
      window.fkNotesApp?.openSearch(true);
      return true;
    }
  });

  game.keybindings.register(Storage.MODULE_ID, "quickNote", {
    name: "SIN.Keybinds.QuickNote",
    hint: "SIN.Keybinds.QuickNoteHint",
    editable: [{ key: "KeyM", modifiers: ["Alt"] }],
    onDown: () => {
      window.fkNotesApp?.openNewNote(null, "text", null);
      return true;
    }
  });
});

/* ================= HOOKS DE INICIALIZAÇÃO ================= */

Hooks.once("ready", async () => {
  const savedLang =
    game.user?.getFlag(Storage.MODULE_ID, "notesData")?.settings?.uiLanguage || "auto";
  await Shared.loadModuleLanguage(savedLang);

  window.fkNotesApp = new App.SimplyInsaneNotesApp();
  App.mountHudControls();
  App.bindPlayersHudObservers();
  window.addEventListener("resize", App.scheduleHudSync);
});

Hooks.on("renderPlayers", () => {
  requestAnimationFrame(App.bindPlayersHudObservers);
});