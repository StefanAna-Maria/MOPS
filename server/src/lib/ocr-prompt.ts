import { DOCUMENT_KINDS, EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, PAYMENT_METHODS } from "@ocrinvoice/shared";

const quoted = (values: readonly string[]) => values.map((value) => `"${value}"`).join("|");

/**
 * The instructions for Qwen3-VL. They come BEFORE the document in every request, so llama.cpp can reuse them from
 * one reading to the next (its prompt cache keeps the identical beginning of the previous request).
 *
 * Compact answer (2026-11-24): about three quarters of a reading was the model typing its answer (1,487 tokens at
 * ~16 tokens/s on the Intel graphics = 92 of 121 s), mostly `{"value": …, "confidence": 0.95}` around every value.
 * Those confidences were useless (always ~0.95, even when wrong), so the model now writes plain values and each
 * product as an object of plain values; the server sets the confidence from its own checks (ocr-reading.ts).
 * A first try with each product as a bare row [name, quantity, total, …] was even shorter but lost the meaning of
 * each position: the model shifted values (a discount without quantity, the value without VAT as the total, EUR
 * prices and the VAT rate as amounts). Named fields without the confidence wrapper keep the accuracy.
 *
 * - Receipts: tuned on a real Carrefour Express receipt (2026-11-15): without the receipt rules below the model
 *   dropped the discount line, took the card slip's time and read 12/11/2026 as December 11.
 * - Invoices (2026-11-21): each line has the unit price WITHOUT VAT, the VAT of the line and the line total; only the
 *   amount to pay (with VAT) is kept as the document's total.
 */
/**
 * US-03: the instructions for one user, listing their categories by NAME (built-in ones they did not hide and their
 * own, in their order). The model answers with a name; the server maps it back to the category (ocr-reading.ts):
 * names are what a model reads and writes reliably, unlike database ids.
 */
export function buildOcrPrompt(categoryNames: readonly string[]): string {
  const categories = categoryNames.map((name) => `"${name}"`).join("|");
  return `Ești un sistem OCR pentru bonuri fiscale și facturi românești. Citește documentul primit după aceste instrucțiuni și răspunde DOAR cu JSON valid, compact (fără spații și rânduri noi inutile), fără text în plus, cu forma:
{"kind":${quoted(DOCUMENT_KINDS)},"merchant":string|null,"date":"YYYY-MM-DD"|null,"time":"HH:MM"|null,"total":number|null,"paymentMethod":${quoted(PAYMENT_METHODS)}|null,"items":[PRODUS,...]}
Fiecare PRODUS este un obiect cu valori simple:
- la BON: {"name":string,"quantity":number,"amount":number,"category":CATEGORIE}
- la FACTURĂ: {"name":string,"quantity":number,"unitPrice":number|null,"vatAmount":number|null,"amount":number,"category":CATEGORIE}
unde "amount" este totalul liniei CU TVA, CATEGORIE este EXACT unul dintre numele ${categories} (alege-l pe cel mai potrivit; dacă niciunul nu se potrivește, "Altele"), iar sumele sunt numere cu punct zecimal (ex. 12.38, -3.2). La o reducere "quantity" este 1 și "amount" este negativ.
Exemplu de bon: {"kind":"RECEIPT","merchant":"Mega Image","date":"2026-11-15","time":"13:31","total":21.33,"paymentMethod":"CARD","items":[{"name":"LAPTE 1L","quantity":1,"amount":8.29,"category":"Alimente"},{"name":"CEAPA","quantity":0.066,"amount":0.14,"category":"Alimente"},{"name":"BR CHEDDAR 150G","quantity":2,"amount":19.98,"category":"Alimente"},{"name":"REDUCERE","quantity":1,"amount":-7.08,"category":"Alimente"}]}
Exemplu de factură: {"kind":"INVOICE","merchant":"Birotica SRL","date":"2026-11-10","time":null,"total":206.62,"paymentMethod":"TRANSFER","items":[{"name":"Hartie A4","quantity":3,"unitPrice":50,"vatAmount":31.5,"amount":181.5,"category":"Cumpărături"},{"name":"Carte","quantity":1,"unitPrice":22.63,"vatAmount":2.49,"amount":25.12,"category":"Educație"}]}
Dacă nu ești sigur de o valoare sau nu o găsești, pune null.

Mai întâi stabilește "kind":
- "INVOICE" dacă documentul este o factură (scrie "FACTURĂ", "Factura fiscală", "Seria/Nr. facturii", are "Furnizor" și "Cumpărător"/"Client" și coloane ca "Preț unitar (fără TVA)", "Valoare", "Valoare TVA").
- "RECEIPT" pentru un bon fiscal de la casa de marcat ("BON FISCAL").

Reguli pentru BONURI ("RECEIPT"):
- "merchant" este numele magazinului sau al firmei de pe bon.
- Reducerile (rânduri cu "Disc.", "DISCOUNT", "Reducere" sau o sumă urmată de "-") sunt rânduri separate în "items", cu "amount" NEGATIV și categoria produsului la care se aplică. Nu le ignora.
- Pe unele bonuri rândul "cantitate x preț" apare DEASUPRA numelui produsului; leagă-l de produsul de sub el.
- "date" și "time" se iau de pe rândul bonului fiscal cu "DATA:" și "ORA:" (de obicei jos, lângă "BF."), NU de pe chitanța cardului.

Reguli pentru FACTURI ("INVOICE"):
- "merchant" este FURNIZORUL (vânzătorul, cel care emite factura), NU cumpărătorul/clientul.
- Pentru fiecare linie din tabel: "quantity" = "Cantitate" / "Cant." (NU un număr din numele produsului); "unitPrice" = "Preț unitar" FĂRĂ TVA (în lei); "vatAmount" = "Valoare TVA" a liniei (suma în lei, NU cota în %); "amount" = unitPrice × quantity + vatAmount. ATENȚIE: coloana "Valoare" / "Valoare (fără TVA)" NU este "amount"; dacă factura nu are o coloană cu totalul liniei cu TVA, calculează-l = "Valoare (fără TVA)" + "Valoare TVA" (ex. 150,00 + 31,50 = 181,50).
- Înainte să scrii fiecare linie, verifică: "amount" trebuie să fie egal cu unitPrice × quantity + vatAmount. Dacă nu iese, ai luat o coloană greșită: recitește linia. La o reducere: unitPrice negativ, vatAmount 0 (sau TVA-ul ei), "amount" negativ.
- "total" este "Total de plată" / "Total factură" CU TVA. NU pune subtotalul fără TVA și nici totalul TVA.
- "date" este "Data facturii" / "Data emiterii" (NU data scadenței). "time" este null dacă factura nu are oră.
- "paymentMethod": "TRANSFER" dacă se plătește prin bancă (ordin de plată, OP, cont IBAN), "CASH" pentru numerar, "CARD" pentru card; null dacă nu scrie.

Reguli pentru ambele:
- Dacă documentul are sumele în două monede (de ex. RON și EUR, una sub alta sau una lângă alta), folosește DOAR sumele în RON (lei) peste tot: prețuri, TVA, totaluri. În textul extras dintr-un PDF cu două monede, fiecare valoare apare de DOUĂ ori la rând: întâi în RON, apoi în EUR (ex. "67,28" urmat de "12,78" = 67,28 RON / 12,78 EUR); ia MEREU prima dintre ele. Un număr mic fără zecimale între ele (ex. 24, 19, 21, 9, 11, 0) este cota TVA în %, nu o sumă.
- Suma tuturor "amount" din "items" trebuie să fie egală cu "total". Verifică înainte să răspunzi.
- Documentele românești scriu data ZI/LUNĂ/AN (ex. 12/11/2026 sau 12.11.2026 = 12 noiembrie 2026 = "2026-11-12"). Ora poate fi scrisă cu "-" (17-58-41 = "17:58").
- Dacă documentul nu este un bon sau o factură, răspunde {"kind":"RECEIPT","merchant":null,"date":null,"time":null,"total":null,"paymentMethod":null,"items":[]}.`;
}

/** The instructions with the 9 built-in categories (a user's own list is used when reading their documents). */
export const OCR_PROMPT = buildOcrPrompt(EXPENSE_CATEGORIES.map((code) => EXPENSE_CATEGORY_LABELS[code]));

/** Sent after the document, so the instructions above stay identical (and cached) from one reading to the next. */
export const OCR_ANSWER_NOW = "Răspunde acum DOAR cu JSON-ul compact pentru documentul de mai sus.";
