import * as Localization from "expo-localization";
import * as SecureStore from "expo-secure-store";
import {
  deviceLanguage,
  formatDate,
  formatMoney,
  getLanguage,
  loadLanguageSetting,
  setLanguageSetting,
  t,
} from "@/i18n";
import { en } from "@/i18n/en";
import { ro } from "@/i18n/ro";
import { formatLei, dayLabel } from "@/lib/expense-list";
import { getGreeting } from "@/lib/greeting";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(async () => {}) }));

const getLocalesMock = jest.spyOn(Localization, "getLocales");
const getItemMock = SecureStore.getItemAsync as jest.Mock;
const setItemMock = SecureStore.setItemAsync as jest.Mock;

function phoneIn(languageCode: string) {
  getLocalesMock.mockReturnValue([{ languageCode } as Localization.Locale]);
}

beforeEach(() => {
  jest.clearAllMocks();
  phoneIn("ro");
  setLanguageSetting("auto");
});

/** Every key, with its path, of a dictionary (functions and arrays count as leaves). */
function keys(value: unknown, path = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [path];
  }
  return Object.entries(value).flatMap(([key, child]) => keys(child, path ? `${path}.${key}` : key));
}

describe("CA-17.1: the language of the phone", () => {
  it("is Romanian on a phone in Romanian", () => {
    phoneIn("ro");
    expect(deviceLanguage()).toBe("ro");
    expect(getLanguage()).toBe("ro");
  });

  it.each(["en", "de", "fr", "hu"])("is English on a phone in any other language (%s)", (code) => {
    phoneIn(code);
    expect(getLanguage()).toBe("en");
    expect(t().home.addExpense).toBe("Add an expense");
  });
});

describe("CA-17.2: choosing the language", () => {
  it("Română or English applies at once, whatever the phone's language", () => {
    phoneIn("de");

    setLanguageSetting("ro");
    expect(t().home.addExpense).toBe("Adaugă o cheltuială");

    setLanguageSetting("en");
    expect(t().home.addExpense).toBe("Add an expense");
  });

  it("Automat follows the phone again", () => {
    setLanguageSetting("en");
    setLanguageSetting("auto");

    expect(getLanguage()).toBe("ro");
  });

  it("keeps the choice on the phone and reads it back when the app starts", async () => {
    setLanguageSetting("en");
    expect(setItemMock).toHaveBeenLastCalledWith("ocrinvoice_language", "en");

    setLanguageSetting("auto");
    getItemMock.mockResolvedValueOnce("en");
    await loadLanguageSetting();

    expect(getLanguage()).toBe("en");
  });

  it("follows the phone when nothing valid was saved", async () => {
    getItemMock.mockResolvedValueOnce("klingon");
    await loadLanguageSetting();

    expect(getLanguage()).toBe("ro");
  });
});

describe("CA-17.3: amounts and dates follow the language", () => {
  it("formats amounts as 4.284,37 lei in Romanian and 4,284.37 RON in English", () => {
    expect(formatMoney(428437, "ro")).toBe("4.284,37 lei");
    expect(formatMoney(428437, "en")).toBe("4,284.37 RON");
    expect(formatMoney(-320, "en")).toBe("-3.20 RON");
  });

  it("formats dates as 21.11.2026 in Romanian and 11/21/2026 in English", () => {
    expect(formatDate("2026-11-21", "ro")).toBe("21.11.2026");
    expect(formatDate("2026-11-21", "en")).toBe("11/21/2026");
  });

  it("the list's amounts, days and greeting change with the language", () => {
    setLanguageSetting("en");

    expect(formatLei(1250)).toBe("12.50 RON");
    expect(dayLabel("2026-11-21", "2026-11-21")).toBe("TODAY");
    expect(dayLabel("2026-10-23", "2026-11-21")).toBe("FRIDAY, OCTOBER 23");
    expect(getGreeting(new Date(2026, 10, 21, 9))).toBe("Good morning");

    setLanguageSetting("ro");
    expect(formatLei(1250)).toBe("12,50 lei");
    expect(dayLabel("2026-10-23", "2026-11-21")).toBe("VINERI, 23 OCTOMBRIE");
  });

  it("counts the records in both languages", () => {
    expect(ro.home.recordCount(20)).toBe("20 de înregistrări");
    expect(en.home.recordCount(1)).toBe("1 record");
    expect(en.home.recordCount(20)).toBe("20 records");
  });
});

describe("the dictionaries", () => {
  it("English has exactly the same texts as Romanian", () => {
    expect(keys(en).sort()).toEqual(keys(ro).sort());
  });

  it("English has as many welcome slides, days and months as Romanian", () => {
    expect(en.welcome.slides).toHaveLength(ro.welcome.slides.length);
    expect(en.dates.weekdays).toHaveLength(7);
    expect(en.dates.months).toHaveLength(12);
  });
});
