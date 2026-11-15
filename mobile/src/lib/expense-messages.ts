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
  title: "Citim documentul",
  doneTitle: "Ce am citit",
  reading: "Citim documentul…",
  readingHint: "Poate dura până la două minute pentru bonurile lungi.",
  failed: "Documentul nu a putut fi citit.",
  failedReasons: {
    OCR_UNAVAILABLE: "Serviciul de citire nu răspunde. Încearcă din nou puțin mai târziu.",
    OCR_TIMEOUT: "Citirea a durat prea mult. Încearcă din nou.",
    UNREADABLE: "Nu am găsit un bon în poză. Încadrează bonul întreg și fă o poză clară.",
    NOT_FOUND: "Documentul nu a fost găsit.",
    NETWORK: "Serverul nu răspunde. Verifică conexiunea la internet.",
  },
  retake: "Fotografiază din nou",
  home: "Înapoi la Acasă",
  totalMatches: "Produsele se potrivesc cu totalul de pe bon.",
  totalDiffers: "Produsele nu se potrivesc cu totalul de pe bon",
  uploadFailedTitle: "Nu am putut trimite poza",
  uploadFailed: "Verifică conexiunea și încearcă din nou.",
};
