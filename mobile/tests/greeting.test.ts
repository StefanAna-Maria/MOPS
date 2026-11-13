import { getGreeting } from "@/lib/greeting";

function at(hour: number, minute = 0) {
  return new Date(2026, 10, 7, hour, minute);
}

describe("getGreeting", () => {
  it.each([
    [5, 0],
    [9, 30],
    [11, 59],
  ])("CA-01.18: says good morning at %i:%i", (hour, minute) => {
    expect(getGreeting(at(hour, minute))).toBe("Bună dimineața");
  });

  it.each([
    [12, 0],
    [15, 0],
    [17, 59],
  ])("CA-01.18: says good afternoon at %i:%i", (hour, minute) => {
    expect(getGreeting(at(hour, minute))).toBe("Bună ziua");
  });

  it.each([
    [18, 0],
    [23, 59],
    [0, 0],
    [4, 59],
  ])("CA-01.18: says good evening at %i:%i", (hour, minute) => {
    expect(getGreeting(at(hour, minute))).toBe("Bună seara");
  });
});
