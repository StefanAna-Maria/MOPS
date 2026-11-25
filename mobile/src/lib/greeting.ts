import { t } from "@/i18n";

export function getGreeting(date: Date = new Date()) {
  const { greeting } = t();
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) {
    return greeting.morning;
  }
  if (hour >= 12 && hour < 18) {
    return greeting.afternoon;
  }
  return greeting.evening;
}
