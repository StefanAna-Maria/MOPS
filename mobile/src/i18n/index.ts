import { useSyncExternalStore } from "react";
import * as Localization from "expo-localization";
import * as SecureStore from "expo-secure-store";
import { en } from "./en";
import { ro, type Messages } from "./ro";

export type { Messages } from "./ro";

export const LANGUAGES = ["ro", "en"] as const;

export type Language = (typeof LANGUAGES)[number];

/** CA-17.2: "auto" follows the phone; the other two are a fixed choice. */
export const LANGUAGE_SETTINGS = ["auto", "ro", "en"] as const;

export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

const STORAGE_KEY = "ocrinvoice_language";

const MESSAGES: Record<Language, Messages> = { ro, en };

let setting: LanguageSetting = "auto";
const listeners = new Set<() => void>();

function isLanguageSetting(value: unknown): value is LanguageSetting {
  return typeof value === "string" && (LANGUAGE_SETTINGS as readonly string[]).includes(value);
}

/** CA-17.1: the phone's language when it is Romanian, English otherwise. */
export function deviceLanguage(): Language {
  try {
    return Localization.getLocales()[0]?.languageCode === "ro" ? "ro" : "en";
  } catch {
    return "en";
  }
}

export function getLanguageSetting(): LanguageSetting {
  return setting;
}

export function getLanguage(): Language {
  return setting === "auto" ? deviceLanguage() : setting;
}

/** The texts in the current language, for code that is not a component (alerts, labels, formatting). */
export function t(): Messages {
  return MESSAGES[getLanguage()];
}

function notify() {
  listeners.forEach((listener) => listener());
}

/** CA-17.2: applies the choice at once and keeps it on the phone. */
export function setLanguageSetting(next: LanguageSetting) {
  setting = next;
  notify();
  SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
}

/** Reads the choice saved on the phone; until it is read (or when it cannot be), the app follows the phone. */
export async function loadLanguageSetting() {
  try {
    const saved = await SecureStore.getItemAsync(STORAGE_KEY);
    if (isLanguageSetting(saved) && saved !== setting) {
      setting = saved;
      notify();
    }
  } catch {
    // Nothing saved yet, or the store is unavailable: keep following the phone.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current language and the saved choice; the component re-renders when either changes. */
export function useLanguage() {
  const language = useSyncExternalStore(subscribe, getLanguage, getLanguage);
  const current = useSyncExternalStore(subscribe, getLanguageSetting, getLanguageSetting);
  return { language, setting: current, setSetting: setLanguageSetting };
}

/** The texts in the current language; the component re-renders when the language changes. */
export function useT(): Messages {
  return MESSAGES[useLanguage().language];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** CA-17.3: "4.284,37 lei" in Romanian, "4,284.37 RON" in English. */
export function formatMoney(cents: number, language: Language = getLanguage()): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const units = Math.floor(abs / 100).toString();
  const decimals = pad(abs % 100);
  if (language === "en") {
    return `${sign}${units.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decimals} RON`;
  }
  return `${sign}${units.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimals} lei`;
}

/** CA-17.3: "2026-11-21" → "21.11.2026" in Romanian, "11/21/2026" in English. */
export function formatDate(isoDate: string, language: Language = getLanguage()): string {
  const [year, month, day] = isoDate.split("-");
  return language === "en" ? `${month}/${day}/${year}` : `${day}.${month}.${year}`;
}
