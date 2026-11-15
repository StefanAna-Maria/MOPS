import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@ocrinvoice/shared";

/**
 * The instructions for Qwen3-VL. Tuned on a real Carrefour Express receipt (2026-11-15): without the rules below
 * the model dropped the discount line, took the card slip's time and read 12/11/2026 as December 11.
 */
export const OCR_PROMPT = `Ești un sistem OCR pentru bonuri fiscale românești. Citește bonul din imagine și răspunde DOAR cu JSON valid, fără text în plus, cu forma:
{
  "merchant": {"value": string|null, "confidence": number},
  "date": {"value": "YYYY-MM-DD"|null, "confidence": number},
  "time": {"value": "HH:MM"|null, "confidence": number},
  "total": {"value": number|null, "confidence": number},
  "paymentMethod": {"value": ${PAYMENT_METHODS.map((m) => `"${m}"`).join("|")}|null, "confidence": number},
  "items": [{"name": {"value": string, "confidence": number}, "quantity": {"value": number, "confidence": number}, "amount": {"value": number, "confidence": number}, "category": {"value": ${EXPENSE_CATEGORIES.map((c) => `"${c}"`).join("|")}, "confidence": number}}]
}
"confidence" este între 0 și 1 și arată cât de sigur ești de valoare. "amount" este prețul total al liniei.
Reguli:
- "merchant" este numele magazinului sau al firmei de pe bon.
- Reducerile (rânduri cu "Disc.", "DISCOUNT", "Reducere" sau o sumă urmată de "-") sunt linii separate în "items", cu "amount" NEGATIV și categoria produsului la care se aplică. Nu le ignora.
- Pe unele bonuri rândul "cantitate x preț" apare DEASUPRA numelui produsului; leagă-l de produsul de sub el.
- Suma tuturor "amount" din "items" trebuie să fie egală cu "total". Verifică înainte să răspunzi.
- "date" și "time" se iau de pe rândul bonului fiscal cu "DATA:" și "ORA:" (de obicei jos, lângă "BF."), NU de pe chitanța cardului.
- Bonurile românești scriu data ZI/LUNĂ/AN (ex. 12/11/2026 = 12 noiembrie 2026 = "2026-11-12"). Ora poate fi scrisă cu "-" (17-58-41 = "17:58").
- Dacă imaginea nu este un bon sau o factură, răspunde {"merchant": {"value": null, "confidence": 0}, "date": {"value": null, "confidence": 0}, "time": {"value": null, "confidence": 0}, "total": {"value": null, "confidence": 0}, "paymentMethod": {"value": null, "confidence": 0}, "items": []}.`;
