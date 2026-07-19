export function formatBaht(amount: number, locale = "th-TH"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: Date | string, locale = "th-TH"): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}
