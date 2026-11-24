import { MODULE_TITLE } from "../storage/storage.js";
import { t } from "../shared/shared-i18n.js";

let _playersResizeObs = null;
let _playersMutObs = null;
let _observedPlayersEl = null;
let _hudSyncRaf = null;

export function scheduleHudSync() {
  if (_hudSyncRaf) return;
  _hudSyncRaf = requestAnimationFrame(() => {
    _hudSyncRaf = null;
    syncHudAbovePlayers();
  });
}

export function syncHudAbovePlayers() {
  const hud = document.getElementById("fk-hud-controls");
  if (!hud) return;

  const players = document.getElementById("players");
  if (!players) {
    hud.style.bottom = "82px";
    hud.style.left = "16px";
    return;
  }

  const pRect = players.getBoundingClientRect();
  if (pRect.width === 0 && pRect.height === 0) {
    hud.style.bottom = "82px";
    hud.style.left = "16px";
    return;
  }

  let minTop = pRect.top;

  players.querySelectorAll("*").forEach((el) => {
    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      parseFloat(style.opacity) === 0
    ) {
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.width > 0 && r.top > 40 && r.top < minTop) {
      minTop = r.top;
    }
  });

  if (minTop > 40 && minTop < window.innerHeight) {
    const rawBottom = Math.round(window.innerHeight - minTop + 8);
    const safeBottom = Math.max(16, Math.min(window.innerHeight - 90, rawBottom));
    hud.style.bottom = `${safeBottom}px`;
    if (pRect.left > 0 && pRect.left < 300) {
      hud.style.left = `${Math.round(pRect.left)}px`;
    }
  }
}

export function bindPlayersHudObservers() {
  const playersEl = document.getElementById("players");
  if (!playersEl) {
    syncHudAbovePlayers();
    return;
  }

  if (_observedPlayersEl === playersEl) {
    scheduleHudSync();
    return;
  }

  _playersResizeObs?.disconnect();
  _playersMutObs?.disconnect();
  _observedPlayersEl = playersEl;

  const observeChildren = () => {
    _playersResizeObs.observe(playersEl);
    playersEl
      .querySelectorAll("aside, section, div, ol, ul, menu")
      .forEach((child) => _playersResizeObs.observe(child));
  };

  _playersResizeObs = new ResizeObserver(() => scheduleHudSync());
  observeChildren();

  _playersMutObs = new MutationObserver(() => {
    observeChildren();
    scheduleHudSync();
    setTimeout(syncHudAbovePlayers, 180);
  });
  _playersMutObs.observe(playersEl, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "open"]
  });

  playersEl.addEventListener("transitionend", scheduleHudSync, true);
  playersEl.addEventListener(
    "click",
    () => {
      scheduleHudSync();
      setTimeout(syncHudAbovePlayers, 180);
    },
    true
  );

  scheduleHudSync();
}

export function mountHudControls() {
  if (document.getElementById("fk-hud-controls")) return;

  const hud = document.createElement("div");
  hud.id = "fk-hud-controls";
  hud.innerHTML = `
    <button type="button" class="fk-hud-btn" id="fk-btn-new" data-tooltip="${t("SIN.Common.NewNote")}">
      <i class="fas fa-plus"></i>
    </button>
    <button type="button" class="fk-hud-btn" id="fk-btn-files" data-tooltip="${MODULE_TITLE}">
      <i class="fas fa-folder-open"></i>
    </button>
  `;
  document.body.appendChild(hud);

  document.getElementById("fk-btn-new").addEventListener("click", () => {
    window.fkNotesApp?.openNewNote(null, "text", null);
  });

  document.getElementById("fk-btn-files").addEventListener("click", () => {
    window.fkNotesApp?.openManager();
  });

  syncHudAbovePlayers();
  setTimeout(syncHudAbovePlayers, 250);
}