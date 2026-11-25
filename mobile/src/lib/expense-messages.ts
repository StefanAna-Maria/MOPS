import { t } from "@/i18n";

/**
 * US-17: the message groups used across the app, now read from the current language (see `src/i18n`). Each group
 * keeps its original keys, so existing screens and tests work unchanged; new code uses `useT()` directly.
 */
function live<T extends object>(build: () => T): T {
  return new Proxy({} as T, {
    get: (_target, key) => (build() as Record<PropertyKey, unknown>)[key],
    has: (_target, key) => key in build(),
    ownKeys: () => Reflect.ownKeys(build()),
    getOwnPropertyDescriptor: (_target, key) => {
      const value = (build() as Record<PropertyKey, unknown>)[key];
      return value === undefined ? undefined : { value, enumerable: true, configurable: true };
    },
  });
}

export const HOME_MESSAGES = {
  empty: t().home.empty,
  emptyByFilter: {
    ALL: "Nu ai cheltuieli în luna aceasta",
    RECEIPTS: "Nu ai bonuri în luna aceasta",
    INVOICES: "Nu ai facturi în luna aceasta",
    MANUAL: "Nu ai cheltuieli manuale în luna aceasta",
  },
  loadError: t().home.loadError,
  retry: t().common.retry,
};

// US-05: monthly total and variation against the previous month on Acasă.
export const SUMMARY_MESSAGES = {
  spentInPrefix: "Cheltuit în ",
  spentIn: (monthName: string) => `Cheltuit în ${monthName}`,
  vsPreviousMonth: (monthName: string) => `față de ${monthName}`,
  spentMoreDiff: (diff: string, monthName: string) => `+${diff} mai mult față de ${monthName}`,
  spentLessDiff: (diff: string, monthName: string) => `${diff} economisiți față de ${monthName}`,
  spentSameDiff: (monthName: string) => `Același total ca în ${monthName}`,
  thisMonth: "Luna aceasta",
  noStatsTitle: (monthName: string) => `Încă nu există statistici pentru ${monthName}`,
  noStatsSubtitle: "Nu ai încă bonuri, facturi sau cheltuieli manuale înregistrate luna aceasta.",
  showCategories: "Vezi pe categorii",
  hideCategories: "Ascunde categoriile",
  categoryBreakdown: "Distribuție pe categorii",
  currentMonthCategories: (monthName: string) => `Luna curentă · ${monthName}`,
  previousMonthCategories: (monthName: string) => `Luna anterioară · ${monthName}`,
  statExpenses: "Cheltuieli",
  statCategories: "Categorii",
  statTopCategory: "Top categorie",
  openFullStatistics: "Statistici pe categorii",
};

// US-16: monthly expenses by category screen.
export const STATISTICS_MESSAGES = {
  title: "Statistici",
  back: "Acasă",
  subtitlePrefix: "Cheltuieli în ",
  subtitle: (monthName: string) => `Cheltuieli în ${monthName}`,
  topShareInsight: (name: string, percent: number) => `Cea mai mare pondere: ${name} (${percent}% din total)`,
  allCategories: "TOATE CATEGORIILE",
  resetSelection: "Toate categoriile",
  totalMonth: (monthName: string) => `Total ${monthName}`,
  categoryCount: (count: number) => (count === 1 ? "1 înregistrare" : `${count} înregistrări`),
  emptyTitle: (monthName: string) => `Nu ai cheltuieli în ${monthName}`,
  emptySubtitle: "Nu ai încă bonuri, facturi sau cheltuieli manuale înregistrate luna aceasta.",
  addExpense: "Adaugă o cheltuială",
};

export const DOCUMENT_MESSAGES = {
  notFound: t().document.notFound,
  delete: t().document.delete,
  confirmTitle: t().document.confirmTitle,
  confirmText: t().document.confirmText,
  confirm: t().document.confirmDelete,
  cancel: t().common.cancel,
  deleteFailedTitle: t().document.deleteFailedTitle,
  deleteFailed: t().common.tryAgain,
};

export const EXPENSE_MESSAGES = live(() => t().expense.errors);

// US-13: correcting a saved document.
export const EDIT_MESSAGES = live(() => ({
  ...t().edit,
  cancel: t().common.cancel,
  saveFailed: t().common.checkDataAndRetry,
}));

export const SCAN_MESSAGES = live(() => ({
  title: t().scan.title,
  doneTitle: t().scan.doneTitle,
  reading: t().scan.stages.READING,
  stages: t().scan.stages,
  readingHint: t().scan.readingHint,
  failed: t().scan.failed,
  failedReasons: t().scan.failedReasons,
  retry: t().common.retry,
  retake: t().scan.retake,
  home: t().scan.home,
  uploadFailedTitle: t().scan.uploadFailedTitle,
  uploadFailed: t().common.checkConnectionAndRetry,
}));

// US-11: checking the values read and saving the document.
export const REVIEW_MESSAGES = live(() => ({
  ...t().review,
  saveFailed: t().common.checkDataAndRetry,
  photoClose: t().common.close,
  done: t().common.done,
}));

// US-14: importing a picture or a PDF that is already on the phone.
export const IMPORT_MESSAGES = live(() => ({
  ...t().import,
  failed: t().common.checkConnectionAndRetry,
}));

/** US-03: the user's own categories. */
export const CATEGORY_MESSAGES = live(() => ({
  ...t().categoryManager,
  cancel: t().common.cancel,
  done: t().common.done,
  orderFailed: t().common.tryAgain,
}));
