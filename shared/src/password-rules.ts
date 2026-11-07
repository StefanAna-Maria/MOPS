export type PasswordRule = {
  id: string;
  label: string;
  test: (password: string) => boolean;
};

export const passwordRules: PasswordRule[] = [
  { id: "length", label: "Cel puțin 8 caractere", test: (password) => password.length >= 8 },
  { id: "digit", label: "Cel puțin o cifră", test: (password) => /\d/.test(password) },
  { id: "uppercase", label: "Cel puțin o literă mare", test: (password) => /\p{Lu}/u.test(password) },
];

export function isStrongPassword(password: string) {
  return passwordRules.every((rule) => rule.test(password));
}
