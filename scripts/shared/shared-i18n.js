import { MODULE_ID } from "../storage/storage.js";

export const SUPPORTED_UI_LANGS = [
  { code: "auto", labelKey: "SIN.Settings.LangAuto" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" }
];

const _dicts = new Map();
let _activeLang = "en";

export function resolveEffectiveLang(settingValue = "auto") {
  if (settingValue && settingValue !== "auto") {
    return settingValue;
  }
  const foundryLang = String(game.i18n?.lang || "en").toLowerCase();
  if (foundryLang.startsWith("pt")) return "pt-BR";
  if (foundryLang.startsWith("es")) return "es";
  if (foundryLang.startsWith("fr")) return "fr";
  return "en";
}

export function getActiveLang() {
  return _activeLang;
}

function _lookupKey(obj, path) {
  if (!obj || !path) return undefined;
  if (path in obj) return obj[path];
  return path.split(".").reduce((acc, part) => (acc && typeof acc === "object" ? acc[part] : undefined), obj);
}

async function _fetchLangFile(langCode) {
  if (_dicts.has(langCode)) return _dicts.get(langCode);
  try {
    const resp = await fetch(`modules/${MODULE_ID}/lang/${langCode}.json`);
    if (resp.ok) {
      const json = await resp.json();
      _dicts.set(langCode, json);
      return json;
    }
  } catch {
    // Fallback silencioso
  }
  return null;
}

export async function loadModuleLanguage(settingValue = "auto") {
  const target = resolveEffectiveLang(settingValue);
  _activeLang = target;
  await _fetchLangFile(target);
  if (target !== "en") {
    await _fetchLangFile("en");
  }
  return target;
}

export function t(key, vars = null) {
  const primary = _dicts.get(_activeLang);
  const fallback = _dicts.get("en");

  let text = _lookupKey(primary, key);
  if (typeof text !== "string") text = _lookupKey(fallback, key);
  if (typeof text !== "string" && game.i18n?.has?.(key)) {
    text = game.i18n.localize(key);
  }
  if (typeof text !== "string") return key;

  if (vars && typeof vars === "object") {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}