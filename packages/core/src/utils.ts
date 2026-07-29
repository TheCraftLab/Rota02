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
    throw new Error('Heure invalide: ${value}');
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  return hours * 60 + minutes;
}

export function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  return '${pad(hours)}:${pad(minutes)}';
}

export function compareIsoDate(a: string, b: string): number {
  return a.localeCompare(b);
}

export function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");

  return '${day}/${month}/${year}';
}

export function formatWeekday(isoDate: string, locale = "fr-FR"): string {
  const date = new Date('${isoDate}T12:00:00');
  const label = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);

  return label ? '${label.charAt(0).toUpperCase()}${label.slice(1)}' : isoDate;
}

export function getIsoWeekday(isoDate: string): number {
  const date = new Date('${isoDate}T12:00:00');
  const weekday = date.getDay();

  return weekday === 0 ? 7 : weekday;
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

  return '${year}-${pad(month)}-${pad(day)}';
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

export interface RotationSlot {
  start: string;
  end: string;
}

export function buildRotationSlots(startTime: string, endTime: string, step: number): RotationSlot[] {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);

  if (start >= end) {
    return [];
  }

  const slots: RotationSlot[] = [];

  for (let cursor = start; cursor < end; cursor += step) {
    slots.push({
      start: minutesToTime(cursor),
      end: minutesToTime(Math.min(cursor + step, end))
    });
  }

  return slots;
}

function computeEasterSunday(year: number): Date {
  const century = Math.floor(year / 100);
  const yearInCentury = year % 100;
  const leapCorrection = Math.floor(century / 4);
  const leapRemainder = century % 4;
  const correction = Math.floor((century + 8) / 25);
  const moonCorrection = Math.floor((century - correction + 1) / 3);
  const moonPhase = (19 * yearInCentury + century - leapCorrection - moonCorrection + 15) % 30;
  const yearLeap = Math.floor(yearInCentury / 4);
  const yearRemainder = yearInCentury % 4;
  const weekdayOffset = (32 + 2 * leapRemainder + 2 * yearLeap - moonPhase - yearRemainder) % 7;
  const monthFactor = Math.floor((yearInCentury + 11 * moonPhase + 22 * weekdayOffset) / 451);
  const month = Math.floor((moonPhase + weekdayOffset - 7 * monthFactor + 114) / 31);
  const day = ((moonPhase + weekdayOffset - 7 * monthFactor + 114) % 31) + 1;

  return new Date(Date.UTC(year, month - 1, day));
}

function addUtcDays(date: Date, days: number): Date {
  const copy = new Date(date);

  copy.setUTCDate(copy.getUTCDate() + days);

  return copy;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getFrenchPublicHolidayLabel(isoDate: string): string | null {
  const [yearPart] = isoDate.split("-");
  const year = Number(yearPart);

  if (!Number.isInteger(year)) {
    return null;
  }

  const easterSunday = computeEasterSunday(year);

  const mobileHolidays = new Map<string, string>([
    [toIsoDate(addUtcDays(easterSunday, 1)), "Lundi de Paques"],
    [toIsoDate(addUtcDays(easterSunday, 39)), "Ascension"],
    [toIsoDate(addUtcDays(easterSunday, 50)), "Lundi de Pentecote"]
  ]);

  if (mobileHolidays.has(isoDate)) {
    return mobileHolidays.get(isoDate) ?? null;
  }

  const fixedHolidays = new Map<string, string>([
    ['${year}-01-01', "Jour de l'an"],
    ['${year}-05-01', "Fete du Travail"],
    ['${year}-05-08', "Victoire 1945"],
    ['${year}-07-14', "Fete nationale"],
    ['${year}-08-15', "Assomption"],
    ['${year}-11-01', "Toussaint"],
    ['${year}-11-11', "Armistice"],
    ['${year}-12-25', "Noel"]
  ]);

  return fixedHolidays.get(isoDate) ?? null;
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
