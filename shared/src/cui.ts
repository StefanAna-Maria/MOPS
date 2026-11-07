const CONTROL_KEY = "753217532";

export function normalizeCui(value: string) {
  return value.replace(/\s+/g, "").toUpperCase().replace(/^RO/, "");
}

export function isValidCui(value: string) {
  const cui = normalizeCui(value);
  if (!/^\d{2,10}$/.test(cui)) {
    return false;
  }
  const digits = cui.slice(0, -1).padStart(9, "0");
  const controlDigit = Number(cui.slice(-1));
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * Number(CONTROL_KEY[i]);
  }
  const expected = ((sum * 10) % 11) % 10;
  return expected === controlDigit;
}
