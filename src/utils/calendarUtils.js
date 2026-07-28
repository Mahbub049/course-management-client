const monthMap = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export const monthLong = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function pad2(value) {
  return String(value).padStart(2, "0");
}

export function makeLocalDate(year, monthIndex, day) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

export function isoFromDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`;
}

export function dateFromIso(value) {
  const text = String(value || "").slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = makeLocalDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateInput(date) {
  if (!date) return "";

  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    return date.slice(0, 10);
  }

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";

  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(
    parsed.getDate()
  )}`;
}

export function addDays(date, amount) {
  return makeLocalDate(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

export function daysBetween(start, end) {
  const startNoon = makeLocalDate(start.getFullYear(), start.getMonth(), start.getDate());
  const endNoon = makeLocalDate(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endNoon.getTime() - startNoon.getTime()) / 86400000);
}

export function monthLabel(date) {
  return `${monthLong[date.getMonth()]} ${date.getFullYear()}`;
}

export function getMonthLabel(dateText = "") {
  const text = String(dateText);
  const match = text.match(
    /(Jan|Feb|Mar|Apr|May|Jun|June|Jul|July|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}/i
  );
  if (match) return match[0];

  const monthOnly = text.match(
    /(Jan|Feb|Mar|Apr|May|Jun|June|Jul|July|Aug|Sep|Sept|Oct|Nov|Dec)/i
  );
  return monthOnly ? monthOnly[0] : "Other Dates";
}

function parseDatePart(part = "", defaults = {}) {
  const cleaned = String(part)
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const match = cleaned.match(/(\d{1,2})(?:\s+([A-Za-z]+))?(?:\s+(\d{4}))?/);
  if (!match) return null;

  const day = Number(match[1]);
  const monthText = match[2]?.toLowerCase();
  const monthIndex = monthText ? monthMap[monthText] : defaults.monthIndex;
  const year = match[3] ? Number(match[3]) : defaults.year;

  if (!day || monthIndex === undefined || !year) return null;

  const date = makeLocalDate(year, monthIndex, day);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

export function parseAcademicDateRange(dateText = "") {
  const normalized = String(dateText)
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return null;

  const pieces = normalized.split(/\s*-\s*/);

  if (pieces.length >= 2) {
    const end = parseDatePart(pieces.slice(1).join(" - "));
    const start = parseDatePart(pieces[0], {
      monthIndex: end?.getMonth(),
      year: end?.getFullYear(),
    });

    if (start && end) {
      return start <= end ? { start, end } : { start, end: start };
    }
  }

  const single = parseDatePart(normalized);
  return single ? { start: single, end: single } : null;
}

export function buildMonthDays(currentMonth) {
  const firstDay = makeLocalDate(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const gridStart = addDays(firstDay, -firstDay.getDay());
  const days = [];
  const todayIso = isoFromDate(new Date());

  for (let index = 0; index < 42; index += 1) {
    const date = addDays(gridStart, index);
    const iso = isoFromDate(date);
    days.push({
      date,
      iso,
      inCurrentMonth: date.getMonth() === currentMonth.getMonth(),
      isToday: iso === todayIso,
    });
  }

  return days;
}

export function getVisibleRange(currentMonth) {
  const days = buildMonthDays(currentMonth);
  return {
    startDate: days[0]?.iso,
    endDate: days[days.length - 1]?.iso,
  };
}

export function formatClock(value = "") {
  const match = String(value).match(/^(\d{2}):(\d{2})$/);
  if (!match) return value;

  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

export function formatFriendlyDate(value, options = {}) {
  const date = typeof value === "string" ? dateFromIso(value) : value;
  if (!date || Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-GB", {
    weekday: options.weekday || "short",
    day: "numeric",
    month: "short",
    year: options.includeYear ? "numeric" : undefined,
  }).format(date);
}

export function relativeDayLabel(value, now = new Date()) {
  const date = typeof value === "string" ? dateFromIso(value) : value;
  if (!date || Number.isNaN(date.getTime())) return "";

  const today = makeLocalDate(now.getFullYear(), now.getMonth(), now.getDate());
  const difference = daysBetween(today, date);

  if (difference === 0) return "Today";
  if (difference === 1) return "Tomorrow";
  if (difference === -1) return "Yesterday";
  if (difference > 1 && difference <= 6) return `In ${difference} days`;
  return formatFriendlyDate(date, { includeYear: date.getFullYear() !== today.getFullYear() });
}

export function normalizeFacultyType(value) {
  if (value === "Exam") return "Exam";
  if (value === "Event" || value === "Class" || value === "Meeting" || value === "Holiday") {
    return "Event";
  }
  return "Task";
}
