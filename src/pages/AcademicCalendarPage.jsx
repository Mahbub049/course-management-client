import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { academicCalendarService } from "../services/academicCalendarService";
import { getAuthItem } from "../utils/authStorage";

const CATEGORIES = [
  "All",
  "Holiday",
  "Exam",
  "Payment",
  "Registration",
  "Class",
  "Result",
  "Event",
  "Attendance",
  "Other",
];

const FACULTY_CALENDAR_HIDDEN_OFFICIAL_CATEGORIES = new Set([
  "Payment",
  "Registration",
  "Event",
]);

const FACULTY_EVENT_TYPES = [
  "Class",
  "Exam",
  "Meeting",
  "Task",
  "Reminder",
  "Deadline",
  "Payment",
  "Registration",
  "Holiday",
  "Event",
  "Other",
];

const PRIORITIES = ["Low", "Normal", "High"];

const categoryStyles = {
  Holiday:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
  Exam:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
  Payment:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
  Registration:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20",
  Class:
    "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20",
  Result:
    "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20",
  Event:
    "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:border-fuchsia-500/20",
  Attendance:
    "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/20",
  Meeting:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20",
  Task:
    "bg-lime-50 text-lime-700 border-lime-200 dark:bg-lime-500/10 dark:text-lime-300 dark:border-lime-500/20",
  Reminder:
    "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20",
  Deadline:
    "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/20",
  Other:
    "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

const monthShort = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const monthLong = [
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

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toDateInput(date) {
  if (!date) return "";

  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    return date.slice(0, 10);
  }

  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";

  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function makeLocalDate(year, monthIndex, day) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

function isoFromDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`;
}

function addDays(date, amount) {
  return makeLocalDate(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function monthLabel(date) {
  return `${monthLong[date.getMonth()]} ${date.getFullYear()}`;
}

function getMonthLabel(dateText = "") {
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

function parseAcademicDateRange(dateText = "") {
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

function buildMonthDays(currentMonth) {
  const firstDay = makeLocalDate(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1
  );
  const gridStart = addDays(firstDay, -firstDay.getDay());
  const days = [];

  for (let i = 0; i < 42; i += 1) {
    const date = addDays(gridStart, i);
    days.push({
      date,
      iso: isoFromDate(date),
      inCurrentMonth: date.getMonth() === currentMonth.getMonth(),
      isToday: isoFromDate(date) === isoFromDate(new Date()),
    });
  }

  return days;
}

function getVisibleRange(currentMonth) {
  const days = buildMonthDays(currentMonth);

  return {
    startDate: days[0]?.iso,
    endDate: days[days.length - 1]?.iso,
  };
}

function createAcademicInstances(events = [], range) {
  const startLimit = range?.startDate ? new Date(`${range.startDate}T12:00:00`) : null;
  const endLimit = range?.endDate ? new Date(`${range.endDate}T12:00:00`) : null;
  const result = [];

  events.forEach((event, index) => {
    const parsed = parseAcademicDateRange(event.dateText);
    if (!parsed) return;

    let cursor = parsed.start;
    let safety = 0;

    while (cursor <= parsed.end && safety < 70) {
      const iso = isoFromDate(cursor);
      const insideStart = !startLimit || cursor >= startLimit;
      const insideEnd = !endLimit || cursor <= endLimit;

      if (insideStart && insideEnd) {
        result.push({
          source: "academic",
          id: `academic-${event._id || index}-${iso}`,
          originalId: event._id,
          date: iso,
          title: event.title,
          type: event.category || "Other",
          details: event.note || "",
          dateText: event.dateText,
          dayText: event.dayText,
          isHighlighted: Boolean(event.isHighlighted),
        });
      }

      cursor = addDays(cursor, 1);
      safety += 1;
    }
  });

  return result;
}

function getDefaultFacultyForm(date = isoFromDate(new Date())) {
  return {
    title: "",
    type: "Task",
    date,
    startTime: "",
    endTime: "",
    details: "",
    priority: "Normal",
    completed: false,
  };
}

function sortCalendarItems(a, b) {
  const aTime = a.startTime || "99:99";
  const bTime = b.startTime || "99:99";

  if (aTime !== bTime) return aTime.localeCompare(bTime);
  return String(a.title || "").localeCompare(String(b.title || ""));
}

export default function AcademicCalendarPage() {
  const navigate = useNavigate();

  const [role] = useState(() => getAuthItem("marksPortalRole"));
  const isTeacher = role === "teacher";

  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState(() =>
    isTeacher ? "calendar" : "serial"
  );

  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return makeLocalDate(today.getFullYear(), today.getMonth(), 1);
  });

  const [facultyEvents, setFacultyEvents] = useState([]);
  const [facultyEventsLoading, setFacultyEventsLoading] = useState(false);

  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventForm, setEventForm] = useState(getDefaultFacultyForm());
  const [savingEvent, setSavingEvent] = useState(false);

  const dateInputRef = useRef(null);
  const startTimeInputRef = useRef(null);
  const endTimeInputRef = useRef(null);

  const visibleRange = useMemo(() => getVisibleRange(currentMonth), [currentMonth]);

  useEffect(() => {
    loadCalendar();
  }, []);

  useEffect(() => {
    if (!isTeacher) return;
    loadFacultyEvents();
  }, [isTeacher, visibleRange.startDate, visibleRange.endDate]);

  useEffect(() => {
    if (!isTeacher && viewMode === "calendar") {
      setViewMode("serial");
    }
  }, [isTeacher, viewMode]);

  const loadCalendar = async () => {
    try {
      setLoading(true);
      const data = await academicCalendarService.getLatest();
      setCalendar(data.calendar);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadFacultyEvents = async () => {
    try {
      setFacultyEventsLoading(true);
      const data = await academicCalendarService.getFacultyEvents(visibleRange);
      setFacultyEvents(data.events || []);
    } catch (error) {
      console.error(error);
      setFacultyEvents([]);
    } finally {
      setFacultyEventsLoading(false);
    }
  };

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();

    return (calendar?.events || []).filter((event) => {
      const matchCategory =
        activeCategory === "All" || event.category === activeCategory;

      const matchSearch =
        !q ||
        event.title?.toLowerCase().includes(q) ||
        event.dateText?.toLowerCase().includes(q) ||
        event.dayText?.toLowerCase().includes(q) ||
        event.note?.toLowerCase().includes(q);

      return matchCategory && matchSearch;
    });
  }, [calendar, activeCategory, search]);

  const groupedEvents = useMemo(() => {
    return filteredEvents.reduce((acc, event) => {
      const month = getMonthLabel(event.dateText);
      if (!acc[month]) acc[month] = [];
      acc[month].push(event);
      return acc;
    }, {});
  }, [filteredEvents]);

  const counts = useMemo(() => {
    const result = {};
    for (const c of CATEGORIES) result[c] = 0;
    result.All = calendar?.events?.length || 0;

    for (const event of calendar?.events || []) {
      result[event.category] = (result[event.category] || 0) + 1;
    }

    return result;
  }, [calendar]);

  const calendarDays = useMemo(() => buildMonthDays(currentMonth), [currentMonth]);

  const calendarItemsByDate = useMemo(() => {
    const q = search.trim().toLowerCase();
    const officialItems = createAcademicInstances(calendar?.events || [], visibleRange).filter(
      (item) => !FACULTY_CALENDAR_HIDDEN_OFFICIAL_CATEGORIES.has(item.type)
    );
    const personalItems = (facultyEvents || []).map((item) => ({
      source: "faculty",
      id: item._id,
      date: toDateInput(item.date),
      title: item.title,
      type: item.type || "Task",
      details: item.details || "",
      startTime: item.startTime || "",
      endTime: item.endTime || "",
      priority: item.priority || "Normal",
      completed: Boolean(item.completed),
      raw: item,
    }));

    return [...officialItems, ...personalItems].reduce((acc, item) => {
      const searchable = [
        item.title,
        item.type,
        item.details,
        item.dateText,
        item.dayText,
        item.startTime,
        item.endTime,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (q && !searchable.includes(q)) return acc;

      if (!acc[item.date]) acc[item.date] = [];
      acc[item.date].push(item);
      acc[item.date].sort(sortCalendarItems);
      return acc;
    }, {});
  }, [calendar, facultyEvents, search, visibleRange]);

  const openCreateModal = (date) => {
    if (!isTeacher) return;
    setEditingEvent(null);
    setEventForm(getDefaultFacultyForm(date));
    setEventModalOpen(true);
  };

  const openEditModal = (item) => {
    if (!isTeacher || item.source !== "faculty") return;

    const raw = item.raw || item;
    setEditingEvent(raw);
    setEventForm({
      title: raw.title || "",
      type: raw.type || "Task",
      date: toDateInput(raw.date),
      startTime: raw.startTime || "",
      endTime: raw.endTime || "",
      details: raw.details || "",
      priority: raw.priority || "Normal",
      completed: Boolean(raw.completed),
    });
    setEventModalOpen(true);
  };

  const closeEventModal = () => {
    if (savingEvent) return;
    setEventModalOpen(false);
    setEditingEvent(null);
    setEventForm(getDefaultFacultyForm());
  };

  const updateEventForm = (field, value) => {
    setEventForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveFacultyEvent = async (e) => {
    e.preventDefault();

    if (!eventForm.title.trim()) {
      Swal.fire("Title required", "Please write a title for this calendar item.", "warning");
      return;
    }

    if (!eventForm.date) {
      Swal.fire("Date required", "Please select a date for this calendar item.", "warning");
      return;
    }

    try {
      setSavingEvent(true);

      if (editingEvent?._id) {
        await academicCalendarService.updateFacultyEvent(editingEvent._id, eventForm);
      } else {
        await academicCalendarService.createFacultyEvent(eventForm);
      }

      await loadFacultyEvents();
      closeEventModal();

      Swal.fire({
        icon: "success",
        title: editingEvent?._id ? "Calendar item updated" : "Calendar item created",
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error(error);
      Swal.fire(
        "Save failed",
        error?.response?.data?.message || "Could not save this calendar item.",
        "error"
      );
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDeleteFacultyEvent = async () => {
    if (!editingEvent?._id) return;

    const result = await Swal.fire({
      title: "Delete this calendar item?",
      text: "This will remove it from your personal faculty calendar only.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) return;

    try {
      setSavingEvent(true);
      await academicCalendarService.deleteFacultyEvent(editingEvent._id);
      await loadFacultyEvents();
      closeEventModal();

      Swal.fire({
        icon: "success",
        title: "Calendar item deleted",
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error(error);
      Swal.fire(
        "Delete failed",
        error?.response?.data?.message || "Could not delete this calendar item.",
        "error"
      );
    } finally {
      setSavingEvent(false);
    }
  };

  const openNativePicker = (inputRef) => {
    const input = inputRef?.current;
    if (!input) return;

    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
        return;
      } catch (error) {
        // Some browsers may block showPicker in a few edge cases.
      }
    }

    input.focus();
    input.click();
  };

  const goToPreviousMonth = () => {
    setCurrentMonth((prev) => makeLocalDate(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth((prev) => makeLocalDate(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(makeLocalDate(today.getFullYear(), today.getMonth(), 1));
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-600 dark:text-slate-300">
        Loading academic calendar...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
              Academic Timeline
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">
              {calendar?.title || "Academic Calendar"}
            </h1>
            {/* {isTeacher && viewMode === "calendar" && (
              <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                Monthly calendar view shows the official academic events and your own personal faculty tasks. Your personal calendar items are private to your account.
              </p>
            )} */}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {isTeacher && (
              <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950">
                <button
                  type="button"
                  onClick={() => setViewMode("serial")}
                  className={[
                    "rounded-xl px-4 py-2 text-sm font-semibold transition",
                    viewMode === "serial"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800",
                  ].join(" ")}
                >
                  Serial View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("calendar")}
                  className={[
                    "rounded-xl px-4 py-2 text-sm font-semibold transition",
                    viewMode === "calendar"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800",
                  ].join(" ")}
                >
                  Calendar View
                </button>
              </div>
            )}

            {isTeacher && (
              <button
                type="button"
                onClick={() => navigate("/teacher/academic-calendar/manage")}
                className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
              >
                Create / Update Academic Calendar
              </button>
            )}
          </div>
        </div>

        {/* <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Total Events
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">
              {calendar?.events?.length || 0}
            </p>
          </div>

          <div className="rounded-2xl bg-amber-50 p-4 dark:bg-amber-500/10">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              Exam Related
            </p>
            <p className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-200">
              {counts.Exam || 0}
            </p>
          </div>

          <div className="rounded-2xl bg-rose-50 p-4 dark:bg-rose-500/10">
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
              Holidays
            </p>
            <p className="mt-1 text-2xl font-bold text-rose-800 dark:text-rose-200">
              {counts.Holiday || 0}
            </p>
          </div>

          {isTeacher && (
            <div className="rounded-2xl bg-violet-50 p-4 dark:bg-violet-500/10">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                My Items This Month
              </p>
              <p className="mt-1 text-2xl font-bold text-violet-800 dark:text-violet-200">
                {facultyEvents.length || 0}
              </p>
            </div>
          )}
        </div> */}
      </section>

      {viewMode === "serial" && (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={[
                    "rounded-full border px-4 py-2 text-sm font-semibold transition",
                    activeCategory === category
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
                  ].join(" ")}
                >
                  {category} ({counts[category] || 0})
                </button>
              ))}
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search calendar..."
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white lg:w-72"
            />
          </div>

          <div className="mt-6 space-y-6">
            {Object.keys(groupedEvents).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No academic calendar events found.
              </div>
            ) : (
              Object.entries(groupedEvents).map(([month, events]) => (
                <div key={month}>
                  <h2 className="mb-3 text-lg font-bold text-slate-950 dark:text-white">
                    {month}
                  </h2>

                  <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                    <div className="hidden grid-cols-[180px_150px_160px_1fr] bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400 md:grid">
                      <div>Date</div>
                      <div>Day</div>
                      <div>Category</div>
                      <div>Activity / Holiday</div>
                    </div>

                    {events.map((event) => (
                      <div
                        key={event._id}
                        className={[
                          "grid gap-2 border-t border-slate-200 px-4 py-4 dark:border-slate-800 md:grid-cols-[180px_150px_160px_1fr]",
                          event.isHighlighted
                            ? "bg-amber-50/70 dark:bg-amber-500/10"
                            : "bg-white dark:bg-slate-900",
                        ].join(" ")}
                      >
                        <div className="text-sm font-semibold text-slate-950 dark:text-white">
                          {event.dateText}
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">
                          {event.dayText || "-"}
                        </div>
                        <div>
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                              categoryStyles[event.category] || categoryStyles.Other
                            }`}
                          >
                            {event.category}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                            {event.title}
                          </p>
                          {event.note && (
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {event.note}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {isTeacher && viewMode === "calendar" && (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950 dark:text-white">
                {monthLabel(currentMonth)}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Click any date to add your own event, task, reminder, or deadline.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search calendar..."
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white sm:w-72"
              />

              <div className="flex rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950">
                <button
                  type="button"
                  onClick={goToPreviousMonth}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={goToToday}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={goToNextMonth}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            {/* <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              Academic events are read-only
            </span>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
              My personal items are editable
            </span> */}
            {facultyEventsLoading && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                Loading your items...
              </span>
            )}
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="grid min-w-[980px] grid-cols-7 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {weekDays.map((day) => (
                <div key={day} className="border-r border-slate-200 px-3 py-3 last:border-r-0 dark:border-slate-700">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid min-w-[980px] grid-cols-7 bg-white dark:bg-slate-950">
              {calendarDays.map((day) => {
                const dayItems = calendarItemsByDate[day.iso] || [];
                const visibleItems = dayItems.slice(0, 5);
                const hiddenCount = dayItems.length - visibleItems.length;

                return (
                  <button
                    key={day.iso}
                    type="button"
                    onClick={() => openCreateModal(day.iso)}
                    className={[
                      "min-h-[155px] border-r border-t border-slate-200 p-3 text-left align-top transition hover:bg-violet-50/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-500 dark:border-slate-800 dark:hover:bg-violet-500/10",
                      !day.inCurrentMonth
                        ? "bg-slate-50/70 text-slate-400 dark:bg-slate-900/50 dark:text-slate-600"
                        : "bg-white text-slate-900 dark:bg-slate-950 dark:text-white",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={[
                          "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold",
                          day.isToday
                            ? "bg-violet-600 text-white"
                            : day.inCurrentMonth
                            ? "text-slate-900 dark:text-white"
                            : "text-slate-400 dark:text-slate-600",
                        ].join(" ")}
                      >
                        {day.date.getDate()}
                      </span>
                      {dayItems.length > 0 && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {dayItems.length}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 space-y-1.5">
                      {visibleItems.map((item) => {
                        const style = categoryStyles[item.type] || categoryStyles.Other;
                        const isPersonal = item.source === "faculty";

                        return (
                          <div
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isPersonal) openEditModal(item);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.stopPropagation();
                                if (isPersonal) openEditModal(item);
                              }
                            }}
                            className={[
                              "rounded-xl border px-2 py-1.5 text-xs leading-snug",
                              style,
                              isPersonal
                                ? "cursor-pointer ring-1 ring-violet-500/10 hover:ring-violet-500/40"
                                : "cursor-default opacity-90",
                              item.completed ? "line-through opacity-70" : "",
                            ].join(" ")}
                            title={item.details || item.title}
                          >
                            <div className="flex items-center gap-1">
                              <span className="shrink-0 font-bold">
                                {isPersonal ? "My" : "Academic"}
                              </span>
                              {item.startTime && (
                                <span className="shrink-0 opacity-80">{item.startTime}</span>
                              )}
                            </div>
                            <div className="line-clamp-2 font-semibold">{item.title}</div>
                          </div>
                        );
                      })}

                      {hiddenCount > 0 && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                          +{hiddenCount} more
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {eventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <form onSubmit={handleSaveFacultyEvent}>
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                    Personal Faculty Calendar
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">
                    {editingEvent?._id ? "Update Calendar Item" : "Create Calendar Item"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    This item will be visible only in your teacher account.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeEventModal}
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Close
                </button>
              </div>

              <div className="grid gap-4 p-5 md:grid-cols-2">
                <label className="md:col-span-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Title
                  </span>
                  <input
                    value={eventForm.title}
                    onChange={(e) => updateEventForm("title", e.target.value)}
                    placeholder="Example: Check CT scripts / Meeting / Class task"
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </label>

                <label>
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Type
                  </span>
                  <select
                    value={eventForm.type}
                    onChange={(e) => updateEventForm("type", e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    {FACULTY_EVENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Date
                  </span>
                  <div className="relative mt-1">
                    <input
                      ref={dateInputRef}
                      type="date"
                      value={eventForm.date}
                      onChange={(e) => updateEventForm("date", e.target.value)}
                      onClick={() => openNativePicker(dateInputRef)}
                      className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => openNativePicker(dateInputRef)}
                      className="absolute inset-y-0 right-3 flex items-center text-violet-500"
                      aria-label="Open date picker"
                    >
                      📅
                    </button>
                  </div>
                </label>

                <label>
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Start Time
                  </span>
                  <div className="relative mt-1">
                    <input
                      ref={startTimeInputRef}
                      type="time"
                      value={eventForm.startTime}
                      onChange={(e) => updateEventForm("startTime", e.target.value)}
                      onClick={() => openNativePicker(startTimeInputRef)}
                      className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => openNativePicker(startTimeInputRef)}
                      className="absolute inset-y-0 right-3 flex items-center text-violet-500"
                      aria-label="Open start time picker"
                    >
                      🕒
                    </button>
                  </div>
                </label>

                <label>
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    End Time
                  </span>
                  <div className="relative mt-1">
                    <input
                      ref={endTimeInputRef}
                      type="time"
                      value={eventForm.endTime}
                      onChange={(e) => updateEventForm("endTime", e.target.value)}
                      onClick={() => openNativePicker(endTimeInputRef)}
                      className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => openNativePicker(endTimeInputRef)}
                      className="absolute inset-y-0 right-3 flex items-center text-violet-500"
                      aria-label="Open end time picker"
                    >
                      🕒
                    </button>
                  </div>
                </label>

                <label>
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Priority
                  </span>
                  <select
                    value={eventForm.priority}
                    onChange={(e) => updateEventForm("priority", e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
                  <input
                    type="checkbox"
                    checked={eventForm.completed}
                    onChange={(e) => updateEventForm("completed", e.target.checked)}
                    className="h-4 w-4 accent-violet-600"
                  />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Mark as completed
                  </span>
                </label>

                <label className="md:col-span-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Details
                  </span>
                  <textarea
                    value={eventForm.details}
                    onChange={(e) => updateEventForm("details", e.target.value)}
                    placeholder="Write details, task notes, room number, reminder note, or any instruction..."
                    rows={5}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </label>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 p-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {editingEvent?._id && (
                    <button
                      type="button"
                      onClick={handleDeleteFacultyEvent}
                      disabled={savingEvent}
                      className="rounded-2xl border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                    >
                      Delete
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={closeEventModal}
                    disabled={savingEvent}
                    className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEvent}
                    className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingEvent
                      ? "Saving..."
                      : editingEvent?._id
                      ? "Update Item"
                      : "Create Item"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
