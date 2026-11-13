export function getGreeting(date: Date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) {
    return "Bună dimineața";
  }
  if (hour >= 12 && hour < 18) {
    return "Bună ziua";
  }
  return "Bună seara";
}
