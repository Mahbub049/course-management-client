import {
  formatClock,
  isoFromDate,
  normalizeFacultyType,
  parseAcademicDateRange,
  relativeDayLabel,
  toDateInput,
} from "./calendarUtils";

export const DASHBOARD_ACADEMIC_CATEGORIES = new Set([
  "Holiday",
  "Exam",
  "Class",
  "Result",
  "Attendance",
]);

export function getDashboardAcademicCategory(event = {}) {
  const category = String(event.category || "").trim();
  if (DASHBOARD_ACADEMIC_CATEGORIES.has(category)) return category;

  const normalizedCategory = category.toLowerCase();
  if (/attendance/.test(normalizedCategory)) return "Attendance";
  if (/holiday/.test(normalizedCategory)) return "Holiday";
  if (/exam|examination/.test(normalizedCategory)) return "Exam";
  if (/class/.test(normalizedCategory)) return "Class";
  if (/result|grade/.test(normalizedCategory)) return "Result";

  if (category && !["other", "event"].includes(normalizedCategory)) return "";

  const text = String(event.title || "").toLowerCase();
  if (/attendance|student attendance report/.test(text)) return "Attendance";
  if (/holiday|eid|ashura|janmashtami|miladunnabi|closed|semester break/.test(text)) return "Holiday";
  if (/exam|examination|midterm|mid-term|final|supplementary|viva/.test(text)) return "Exam";
  if (/class|classes|teaching|orientation/.test(text)) return "Class";
  if (/result|grade|publication/.test(text)) return "Result";
  return "";
}

function dashboardSourceRank(item = {}) {
  if (item.source === "faculty" && item.canEdit) return 0;
  if (item.source === "faculty") return 1;
  return 2;
}

export function buildUpcomingSchedule(
  calendar,
  facultyEvents,
  startDate,
  endDate,
  options = {}
) {
  const limit = Number.isFinite(Number(options.limit))
    ? Math.max(1, Number(options.limit))
    : 5;

  const officialItems = (calendar?.events || [])
    .map((event, index) => {
      const category = getDashboardAcademicCategory(event);
      if (!category) return null;

      const range = parseAcademicDateRange(event.dateText);
      if (!range) return null;

      const rangeStart = isoFromDate(range.start);
      const rangeEnd = isoFromDate(range.end);
      if (rangeEnd < startDate || rangeStart > endDate) return null;

      return {
        id: `academic-${event._id || index}`,
        sourceKey: `academic:${event._id || `${event.dateText}:${event.title}`}`,
        source: "academic",
        title: event.title,
        type: category,
        startDate: rangeStart,
        endDate: rangeEnd,
        displayDate: rangeStart < startDate ? startDate : rangeStart,
        startTime: "",
        endTime: "",
        details: event.note || "",
        dateText: event.dateText || "",
        dayText: event.dayText || "",
        visibility: "university",
        creatorName: "BUBT Academic Calendar",
        canEdit: false,
        canMarkDone: false,
        sortOrder: Number.isFinite(Number(event.sortOrder)) ? Number(event.sortOrder) : index,
        createdAt: event.createdAt || "",
        route: "/academic-calendar",
      };
    })
    .filter(Boolean);

  const teacherItems = (facultyEvents || [])
    .map((event) => {
      const eventStart = toDateInput(event.date);
      if (!eventStart) return null;
      const eventEnd = toDateInput(event.endDate) || eventStart;
      const normalizedType = normalizeFacultyType(event.type);

      return {
        id: event._id,
        sourceKey: `faculty:${event._id}`,
        source: "faculty",
        title: event.title,
        type: normalizedType,
        startDate: eventStart,
        endDate: eventEnd,
        displayDate: eventStart < startDate ? startDate : eventStart,
        startTime: event.startTime || "",
        endTime: event.endTime || "",
        details: event.details || "",
        visibility: event.visibility || "personal",
        creatorName: event.creatorName || event.faculty?.name || "",
        canEdit: event.canEdit !== false,
        canMarkDone: normalizedType === "Task" && event.canEdit !== false,
        sortOrder: Number.isFinite(Number(event.sortOrder)) ? Number(event.sortOrder) : 0,
        createdAt: event.createdAt || "",
        route: "/academic-calendar",
      };
    })
    .filter(Boolean);

  return [...officialItems, ...teacherItems]
    .sort((a, b) => {
      if (a.displayDate !== b.displayDate) return a.displayDate.localeCompare(b.displayDate);

      const sourceDifference = dashboardSourceRank(a) - dashboardSourceRank(b);
      if (sourceDifference !== 0) return sourceDifference;

      if (a.source === "faculty" && b.source === "faculty") {
        const orderDifference = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
        if (orderDifference !== 0) return orderDifference;

        const createdDifference = String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
        if (createdDifference !== 0) return createdDifference;
      }

      const aTime = a.startTime || "99:99";
      const bTime = b.startTime || "99:99";
      if (aTime !== bTime) return aTime.localeCompare(bTime);
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
}

export function getScheduleTimingLabel(item, now = new Date()) {
  const fallback = relativeDayLabel(item.displayDate, now);
  if (item.displayDate !== isoFromDate(now) || !item.startTime) return fallback;

  const [startHour, startMinute] = item.startTime.split(":").map(Number);
  if (!Number.isFinite(startHour) || !Number.isFinite(startMinute)) return fallback;

  const start = new Date(now);
  start.setHours(startHour, startMinute, 0, 0);
  const minutesUntil = Math.round((start.getTime() - now.getTime()) / 60000);

  if (item.endTime) {
    const [endHour, endMinute] = item.endTime.split(":").map(Number);
    const end = new Date(now);
    end.setHours(endHour, endMinute, 0, 0);
    if (now >= start && now <= end) return "Happening now";
  }

  if (minutesUntil >= 0 && minutesUntil < 60) {
    return minutesUntil <= 1 ? "Starting now" : `In ${minutesUntil} min`;
  }

  if (minutesUntil >= 60 && minutesUntil <= 360) {
    const hours = Math.round(minutesUntil / 60);
    return `In ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  return fallback;
}

export function formatScheduleTime(item = {}) {
  if (!item.startTime) return "";
  return `${formatClock(item.startTime)}${item.endTime ? ` - ${formatClock(item.endTime)}` : ""}`;
}
