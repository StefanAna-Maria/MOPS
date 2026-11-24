import { SCAN_STAGE_LABELS } from "@ocrinvoice/shared";

export const EXPENSE_MESSAGES = {
  description: "Scrie magazinul sau o scurtă descriere a plății.",
  amount: "Introdu o sumă mai mare decât 0, cu cel mult două zecimale.",
  date: "Introdu o dată validă în format ZZ.LL.AAAA, cel târziu astăzi.",
};

export const HOME_MESSAGES = {
  empty: "Nicio înregistrare de acest tip în istoric.",
  loadError: "Nu am putut încărca datele.",
  retry: "Încearcă din nou",
};

export const DOCUMENT_MESSAGES = {
  notFound: "Documentul nu a fost găsit.",
};

export const SCAN_MESSAGES = {
  title: "Citirea bonului",
  doneTitle: "Ce am citit",
  reading: SCAN_STAGE_LABELS.READING,
  stages: SCAN_STAGE_LABELS,
  readingHint: "Poate dura până la două minute pentru bonurile lungi.",
  failed: "Documentul nu a putut fi citit.",
  failedReasons: {
    OCR_UNAVAILABLE: "Serviciul de citire nu răspunde. Încearcă din nou puțin mai târziu.",
    OCR_TIMEOUT: "Citirea a durat prea mult. Încearcă din nou.",
    UNREADABLE: "Nu am găsit un bon în poză. Încadrează bonul întreg și fă o poză clară.",
    NOT_FOUND: "Documentul nu a fost găsit.",
    NETWORK: "Serverul nu răspunde. Verifică conexiunea la internet.",
  },
  retry: "Încearcă din nou",
  retake: "Fotografiază din nou",
  home: "Înapoi la Acasă",
  uploadFailedTitle: "Nu am putut trimite poza",
  uploadFailed: "Verifică conexiunea și încearcă din nou.",
};

// US-11: checking the values read and saving the document.
export const REVIEW_MESSAGES = {
  /** US-09: "Factură" or "Bon fiscal", shown above what was read. */
  documentKind: (label: string) => `Document citit: ${label}`,
  /** US-09, invoices: "3 × 50,00 lei fără TVA + TVA 31,50 lei", under the line total with VAT. */
  invoiceLine: (quantity: string, unitPrice: string, vatAmount: string) =>
    `${quantity} × ${unitPrice} fără TVA + TVA ${vatAmount}`,
  verify: "Verifică",
  corrected: "Corectat",
  confirm: "E corect",
  products: "PRODUSE",
  addProduct: "Adaugă un produs",
  deleteProduct: "Șterge",
  itemsTotal: (amount: string) => `Suma produselor: ${amount}`,
  totalMatches: "Se potrivește cu totalul de pe bon",
  totalDiffers: (amount: string) => `Diferență de ${amount} față de total`,
  save: "Salvează documentul",
  saveFailedTitle: "Nu am putut salva documentul",
  saveFailed: "Verifică datele și încearcă din nou.",
  photo: "Poza documentului",
  photoOpen: "Atinge poza ca s-o vezi mare",
  photoClose: "Închide",
  photoUnavailable: "Poza nu a putut fi încărcată.",
  futureDate: "Data nu poate fi în viitor.",
  futureTime: "Ora nu poate fi în viitor.",
  invalidAmount: "Introdu o sumă cu cel mult două zecimale.",
  blockedToCheck: (count: number) =>
    count === 1 ? "Mai ai o valoare de verificat." : `Mai ai ${count} valori de verificat.`,
  blockedNoProducts: "Adaugă cel puțin un produs.",
  blockedAmount: "Suma unui produs nu este validă.",
  blockedTotal: "Produsele nu se potrivesc cu totalul de pe bon.",
  blockedFields: (fields: string) => `Completează corect: ${fields}.`,
  done: "Gata",
};

// US-14: importing a picture or a PDF that is already on the phone.
export const IMPORT_MESSAGES = {
  gallery: "Din galerie",
  files: "Din fișiere",
  failedTitle: "Nu am putut trimite documentul",
  failed: "Verifică conexiunea și încearcă din nou.",
  failedReasons: {
    FILE_TOO_LARGE: "Fișierul este prea mare. Alege unul de cel mult 10 MB.",
    UNREADABLE_PDF: "PDF-ul nu a putut fi deschis. Alege alt fișier.",
    UNSUPPORTED_FILE_TYPE: "Alege o poză sau un PDF.",
  } as Record<string, string>,
  unsupportedTitle: "Fișier nepotrivit",
  unsupported: "Alege o poză sau un PDF.",
};

/** US-03: the user's own categories. */
export const CATEGORY_MESSAGES = {
  title: "Categorie",
  newLabel: "Categorie nouă",
  newPlaceholder: "ex. Sală de sport",
  add: "Adaugă categoria",
  delete: (name: string) => `Șterge categoria ${name}`,
  confirmTitle: "Ștergi categoria?",
  confirmText: (name: string) => `„${name}” nu va mai apărea în listă.`,
  confirmDelete: "Șterge",
  cancel: "Renunță",
  inUseTitle: "Categoria este folosită",
  inUse: (count?: number) =>
    count === 1
      ? "O cheltuială are această categorie, așa că nu poate fi ștearsă."
      : `${count ?? "Unele"} cheltuieli au această categorie, așa că nu poate fi ștearsă.`,
  exists: "Există deja o categorie cu acest nume.",
  invalid: "Scrie un nume de cel mult 30 de caractere.",
  failedTitle: "Nu am putut salva categoria",
  reorder: "Schimbă ordinea",
  reorderHint: "Mută categoriile cu săgețile, apoi apasă Gata.",
  done: "Gata",
  moveUp: (name: string) => `Mută mai sus ${name}`,
  moveDown: (name: string) => `Mută mai jos ${name}`,
  orderFailedTitle: "Nu am putut salva ordinea",
  orderFailed: "Încearcă din nou.",
};
