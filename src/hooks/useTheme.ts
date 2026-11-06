import { useCallback, useSyncExternalStore } from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "gran7_theme";
const listeners = new Set<() => void>();

function getStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "light";
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {}
  // Gran7 Help 3.1: tema claro é o padrão quando o usuário ainda não escolheu.
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "light";
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveTheme(preference: ThemePreference): "light" | "dark" {
  return preference === "system" ? (systemPrefersDark() ? "dark" : "light") : preference;
}

function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolveTheme(preference) === "dark");
}

let currentPreference: ThemePreference = getStoredPreference();
applyTheme(currentPreference);

if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (currentPreference === "system") {
      applyTheme(currentPreference);
      listeners.forEach((l) => l());
    }
  });
}

function setPreference(pref: ThemePreference) {
  currentPreference = pref;
  try {
    window.localStorage.setItem(STORAGE_KEY, pref);
  } catch (e) {}
  applyTheme(pref);
  listeners.forEach((l) => l());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): ThemePreference {
  return currentPreference;
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "system" as ThemePreference);
  const setTheme = useCallback((pref: ThemePreference) => setPreference(pref), []);
  return { theme, resolvedTheme: resolveTheme(theme), setTheme };
}
