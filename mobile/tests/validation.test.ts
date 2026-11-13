import { isValidEmail } from "@/lib/validation";

describe("isValidEmail", () => {
  it.each(["ana@example.com", "ana.popescu@student.unibuc.ro", "  ana@example.com  "])("accepts %s", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(["", "ana", "ana@", "ana@example", "@example.com", "ana @example.com"])("CA-01.2: rejects %s", (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});
