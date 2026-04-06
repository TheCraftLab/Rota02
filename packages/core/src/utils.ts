export function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\r/g, "");
}

export function normalizeText(value: string): string {
  return normalizeWhitespace(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function normalizeActivityLabel(value: string): string {
  return normalizeText(value).toLowerCase();
}

export function normalizeName(value: string): string {
  return normalizeText(value).replace(/\s+/g, " ").toLowerCase();
}

export function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

export function parseTimeToMinutes(value: string): number {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Heure invalide: ${value}`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

export function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${pad(hours)}:${pad(minutes)}`;
}

export function compareIsoDate(a: string, b: string): number {
  return a.localeCompare(b);
}

export function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export function inferIsoDate(raw: string, defaultYear: number): string | null {
  const match = raw.match(/(\d{2})\/(\d{2})(?:\/(\d{4}|\d{2}))?/);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = match[3] ? Number(match[3]) : defaultYear;
  if (year < 100) {
    year += 2000;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return `${year}-${pad(month)}-${pad(day)}`;
}

export function expandSlots(startTime: string, endTime: string, step: number): string[] {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  const slots: string[] = [];

  for (let cursor = start; cursor < end; cursor += step) {
    slots.push(minutesToTime(cursor));
  }

  return slots;
}

export function intersectRange(
  outerStart: string,
  outerEnd: string,
  innerStart: string,
  innerEnd: string
): boolean {
  const aStart = parseTimeToMinutes(outerStart);
  const aEnd = parseTimeToMinutes(outerEnd);
  const bStart = parseTimeToMinutes(innerStart);
  const bEnd = parseTimeToMinutes(innerEnd);

  return aStart < bEnd && bStart < aEnd;
}

export function rangeContains(
  outerStart: string,
  outerEnd: string,
  innerStart: string,
  innerEnd: string
): boolean {
  const aStart = parseTimeToMinutes(outerStart);
  const aEnd = parseTimeToMinutes(outerEnd);
  const bStart = parseTimeToMinutes(innerStart);
  const bEnd = parseTimeToMinutes(innerEnd);

  return aStart <= bStart && aEnd >= bEnd;
}

export function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const avg = average(values);
  const variance = average(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}
