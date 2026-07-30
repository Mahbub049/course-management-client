import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { academicCalendarService } from "../services/academicCalendarService";
import { getAuthItem } from "../utils/authStorage";
import {
  buildMonthDays,
  dateFromIso,
  daysBetween,
  formatClock,
  formatFriendlyDate,
  getMonthLabel,
  getVisibleRange,
  isoFromDate,
  makeLocalDate,
  monthLabel,
  normalizeFacultyType,
  parseAcademicDateRange,
  toDateInput,
  weekDays,
} from "../utils/calendarUtils";

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

const FACULTY_EVENT_TYPES = ["Task", "Exam", "Event"];
const MONTH_CALENDAR_CATEGORIES = new Set([
  "Holiday",
  "Exam",
  "Class",
  "Result",
  "Attendance",
]);
const VISIBILITY_OPTIONS = [
  {
    value: "personal",
    title: "Only me",
    description: "Visible only in your teacher account.",
  },
  {
    value: "university",
    title: "All teachers",
    description: "Publish this as a university-wide teacher event.",
  },
];

const MAX_EVENT_LANES = 3;

const categoryStyles = {
  Holiday:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/40 dark:bg-rose-950/80 dark:text-rose-100",
  Exam:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/40 dark:bg-amber-950/80 dark:text-amber-100",
  Payment:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-950/80 dark:text-emerald-100",
  Registration:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/40 dark:bg-sky-950/80 dark:text-sky-100",
  Class:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/40 dark:bg-violet-950/80 dark:text-violet-100",
  Result:
    "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-950/80 dark:text-indigo-100",
  Event:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/40 dark:bg-blue-950/80 dark:text-blue-100",
  Attendance:
    "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-400/40 dark:bg-cyan-950/80 dark:text-cyan-100",
  Meeting:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/40 dark:bg-blue-950/80 dark:text-blue-100",
  Task:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-950/80 dark:text-emerald-100",
  Reminder:
    "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-400/40 dark:bg-purple-950/80 dark:text-purple-100",
  Deadline:
    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-400/40 dark:bg-orange-950/80 dark:text-orange-100",
  Other:
    "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-500/50 dark:bg-slate-800 dark:text-slate-100",
};

const typeDotStyles = {
  Task: "bg-emerald-500",
  Exam: "bg-amber-500",
  Event: "bg-blue-500",
  Holiday: "bg-rose-500",
  Class: "bg-violet-500",
  Other: "bg-slate-500",
};

function createAcademicCalendarItems(events = []) {
  return events
    .map((event, index) => {
      const range = parseAcademicDateRange(event.dateText);
      if (!range) return null;

      return {
        source: "academic",
        id: `academic-${event._id || index}`,
        originalId: event._id,
        title: event.title,
        type: event.category || "Other",
        details: event.note || "",
        startDate: isoFromDate(range.start),
        endDate: isoFromDate(range.end),
        startTime: "",
        endTime: "",
        visibility: "university",
        canEdit: false,
        dateText: event.dateText,
        dayText: event.dayText,
        isHighlighted: Boolean(event.isHighlighted),
        sortOrder: Number.isFinite(Number(event.sortOrder)) ? Number(event.sortOrder) : index,
        createdAt: event.createdAt || "",
        raw: event,
      };
    })
    .filter(Boolean);
}

function createFacultyCalendarItems(events = []) {
  return events
    .map((event) => {
      const startDate = toDateInput(event.date);
      if (!startDate) return null;

      return {
        source: "faculty",
        id: event._id,
        title: event.title,
        type: normalizeFacultyType(event.type),
        details: event.details || "",
        startDate,
        endDate: toDateInput(event.endDate) || startDate,
        startTime: event.startTime || "",
        endTime: event.endTime || "",
        visibility: event.visibility || "personal",
        canEdit: event.canEdit !== false,
        creatorName: event.creatorName || event.faculty?.name || "",
        sortOrder: Number.isFinite(Number(event.sortOrder)) ? Number(event.sortOrder) : 0,
        createdAt: event.createdAt || "",
        raw: event,
      };
    })
    .filter(Boolean);
}

function getDefaultFacultyForm(date = isoFromDate(new Date())) {
  return {
    title: "",
    type: "Task",
    date,
    endDate: date,
    startTime: "",
    endTime: "",
    details: "",
    visibility: "personal",
  };
}

function calendarSourceRank(item) {
  if (item.source === "faculty" && item.canEdit) return 0;
  if (item.source === "faculty") return 1;
  return 2;
}

function sortCalendarItems(a, b) {
  if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);

  const sourceDifference = calendarSourceRank(a) - calendarSourceRank(b);
  if (sourceDifference !== 0) return sourceDifference;

  if (a.source === "faculty" && b.source === "faculty") {
    const orderDifference = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
    if (orderDifference !== 0) return orderDifference;

    const aCreated = Date.parse(a.createdAt || "") || 0;
    const bCreated = Date.parse(b.createdAt || "") || 0;
    if (aCreated !== bCreated) return bCreated - aCreated;
  }

  const aTime = a.startTime || "99:99";
  const bTime = b.startTime || "99:99";
  if (aTime !== bTime) return aTime.localeCompare(bTime);

  const aDuration = daysBetween(dateFromIso(a.startDate), dateFromIso(a.endDate));
  const bDuration = daysBetween(dateFromIso(b.startDate), dateFromIso(b.endDate));
  if (aDuration !== bDuration) return bDuration - aDuration;

  const orderDifference = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
  if (orderDifference !== 0) return orderDifference;

  return String(a.title || "").localeCompare(String(b.title || ""));
}

function itemCoversDate(item, iso) {
  return item.startDate <= iso && item.endDate >= iso;
}

function getWeekLayout(days, items) {
  const weekStart = days[0].date;
  const weekEnd = days[6].date;
  const weekStartIso = days[0].iso;
  const weekEndIso = days[6].iso;

  const segments = items
    .filter((item) => item.startDate <= weekEndIso && item.endDate >= weekStartIso)
    .map((item) => {
      const itemStart = dateFromIso(item.startDate);
      const itemEnd = dateFromIso(item.endDate);
      if (!itemStart || !itemEnd) return null;

      const segmentStart = itemStart < weekStart ? weekStart : itemStart;
      const segmentEnd = itemEnd > weekEnd ? weekEnd : itemEnd;
      const startColumn = Math.max(0, daysBetween(weekStart, segmentStart));
      const endColumn = Math.min(6, daysBetween(weekStart, segmentEnd));

      return {
        ...item,
        startColumn,
        endColumn,
        span: endColumn - startColumn + 1,
        startsBeforeWeek: itemStart < weekStart,
        endsAfterWeek: itemEnd > weekEnd,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.startColumn !== b.startColumn) return a.startColumn - b.startColumn;
      const itemOrder = sortCalendarItems(a, b);
      if (itemOrder !== 0) return itemOrder;
      return b.span - a.span;
    });

  const occupiedLanes = [];
  const laidOutSegments = segments.map((segment) => {
    let lane = 0;

    while (true) {
      if (!occupiedLanes[lane]) occupiedLanes[lane] = Array(7).fill(false);

      const isFree = occupiedLanes[lane]
        .slice(segment.startColumn, segment.endColumn + 1)
        .every((occupied) => !occupied);

      if (isFree) {
        for (let column = segment.startColumn; column <= segment.endColumn; column += 1) {
          occupiedLanes[lane][column] = true;
        }
        break;
      }

      lane += 1;
    }

    return { ...segment, lane };
  });

  const hiddenByDate = {};
  laidOutSegments
    .filter((segment) => segment.lane >= MAX_EVENT_LANES)
    .forEach((segment) => {
      for (let column = segment.startColumn; column <= segment.endColumn; column += 1) {
        const iso = days[column].iso;
        hiddenByDate[iso] = (hiddenByDate[iso] || 0) + 1;
      }
    });

  return {
    visibleSegments: laidOutSegments.filter((segment) => segment.lane < MAX_EVENT_LANES),
    hiddenByDate,
  };
}

function formatRange(item) {
  const start = formatFriendlyDate(item.startDate, { includeYear: true });
  const end = formatFriendlyDate(item.endDate, { includeYear: true });
  const dateText = item.startDate === item.endDate ? start : `${start} – ${end}`;
  const timeText = item.startTime
    ? `${formatClock(item.startTime)}${item.endTime ? ` – ${formatClock(item.endTime)}` : ""}`
    : "All day";
  return `${dateText} · ${timeText}`;
}

export default function AcademicCalendarPage() {
  const navigate = useNavigate();
  const [role] = useState(() => getAuthItem("marksPortalRole"));
  const isTeacher = role === "teacher";

  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState(() => (isTeacher ? "calendar" : "serial"));
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return makeLocalDate(today.getFullYear(), today.getMonth(), 1);
  });

  const [facultyEvents, setFacultyEvents] = useState([]);
  const [facultyEventsLoading, setFacultyEventsLoading] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventForm, setEventForm] = useState(getDefaultFacultyForm());
  const [savingEvent, setSavingEvent] = useState(false);
  const [agendaDate, setAgendaDate] = useState("");

  const dateInputRef = useRef(null);
  const endDateInputRef = useRef(null);
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
    if (!isTeacher && viewMode === "calendar") setViewMode("serial");
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
    const query = search.trim().toLowerCase();

    return (calendar?.events || []).filter((event) => {
      const matchesCategory = activeCategory === "All" || event.category === activeCategory;
      const matchesSearch =
        !query ||
        [event.title, event.dateText, event.dayText, event.note]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [calendar, activeCategory, search]);

  const groupedEvents = useMemo(() => {
    return filteredEvents.reduce((result, event) => {
      const month = getMonthLabel(event.dateText);
      if (!result[month]) result[month] = [];
      result[month].push(event);
      return result;
    }, {});
  }, [filteredEvents]);

  const counts = useMemo(() => {
    const result = {};
    CATEGORIES.forEach((category) => {
      result[category] = 0;
    });
    result.All = calendar?.events?.length || 0;
    (calendar?.events || []).forEach((event) => {
      result[event.category] = (result[event.category] || 0) + 1;
    });
    return result;
  }, [calendar]);

  const calendarDays = useMemo(() => buildMonthDays(currentMonth), [currentMonth]);
  const calendarWeeks = useMemo(() => {
    return Array.from({ length: 6 }, (_, index) =>
      calendarDays.slice(index * 7, index * 7 + 7)
    );
  }, [calendarDays]);

  const calendarItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const officialItems = createAcademicCalendarItems(calendar?.events || []).filter((item) =>
      MONTH_CALENDAR_CATEGORIES.has(item.type)
    );
    const teacherItems = createFacultyCalendarItems(facultyEvents || []);

    return [...officialItems, ...teacherItems]
      .filter((item) => {
        if (!query) return true;
        return [
          item.title,
          item.type,
          item.details,
          item.startDate,
          item.endDate,
          item.startTime,
          item.creatorName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort(sortCalendarItems);
  }, [calendar, facultyEvents, search]);

  const agendaItems = useMemo(() => {
    if (!agendaDate) return [];
    return calendarItems.filter((item) => itemCoversDate(item, agendaDate));
  }, [agendaDate, calendarItems]);

  const handleReorderFacultyEvents = async (draggedItem, targetItem) => {
    if (
      !draggedItem?.id ||
      !targetItem?.id ||
      draggedItem.id === targetItem.id ||
      draggedItem.source !== "faculty" ||
      targetItem.source !== "faculty" ||
      !draggedItem.canEdit ||
      !targetItem.canEdit ||
      draggedItem.startDate !== targetItem.startDate
    ) {
      return;
    }

    const orderedItems = createFacultyCalendarItems(facultyEvents)
      .filter((item) => item.canEdit && item.startDate === draggedItem.startDate)
      .sort(sortCalendarItems);

    const draggedIndex = orderedItems.findIndex((item) => item.id === draggedItem.id);
    const targetIndex = orderedItems.findIndex((item) => item.id === targetItem.id);
    if (draggedIndex < 0 || targetIndex < 0) return;

    const nextOrder = [...orderedItems];
    const [movedItem] = nextOrder.splice(draggedIndex, 1);
    nextOrder.splice(targetIndex, 0, movedItem);

    const orderedEventIds = nextOrder.map((item) => item.id);
    const orderById = new Map(orderedEventIds.map((id, index) => [String(id), index]));

    setFacultyEvents((previous) =>
      previous.map((event) =>
        orderById.has(String(event._id))
          ? { ...event, sortOrder: orderById.get(String(event._id)) }
          : event
      )
    );

    try {
      await academicCalendarService.reorderFacultyEvents(orderedEventIds);
    } catch (error) {
      console.error(error);
      await loadFacultyEvents();
      Swal.fire(
        "Reorder failed",
        error?.response?.data?.message || "Could not save the new calendar order.",
        "error"
      );
    }
  };

  const openCreateModal = (date = isoFromDate(new Date())) => {
    if (!isTeacher) return;
    setAgendaDate("");
    setModalMode("create");
    setEditingEvent(null);
    setEventForm(getDefaultFacultyForm(date));
    setEventModalOpen(true);
  };

  const openCalendarItem = (item) => {
    setAgendaDate("");
    setEditingEvent(item);
    setModalMode(item.source === "faculty" && item.canEdit ? "edit" : "view");
    setEventForm({
      title: item.title || "",
      type: normalizeFacultyType(item.type),
      date: item.startDate || isoFromDate(new Date()),
      endDate: item.endDate || item.startDate || isoFromDate(new Date()),
      startTime: item.startTime || "",
      endTime: item.endTime || "",
      details: item.details || "",
      visibility: item.visibility || "personal",
    });
    setEventModalOpen(true);
  };

  const closeEventModal = () => {
    if (savingEvent) return;
    setEventModalOpen(false);
    setModalMode("create");
    setEditingEvent(null);
    setEventForm(getDefaultFacultyForm());
  };

  const updateEventForm = (field, value) => {
    setEventForm((previous) => {
      const next = { ...previous, [field]: value };

      if (field === "date" && (!previous.endDate || previous.endDate < value)) {
        next.endDate = value;
      }

      return next;
    });
  };

  const handleSaveFacultyEvent = async (event) => {
    event.preventDefault();
    if (modalMode === "view") return;

    if (!eventForm.title.trim()) {
      Swal.fire("Title required", "Please write a title for this calendar item.", "warning");
      return;
    }

    if (!eventForm.date || !eventForm.endDate) {
      Swal.fire("Date required", "Please select the start and end date.", "warning");
      return;
    }

    if (eventForm.endDate < eventForm.date) {
      Swal.fire("Invalid date range", "The end date cannot be before the start date.", "warning");
      return;
    }

    if (
      eventForm.date === eventForm.endDate &&
      eventForm.startTime &&
      eventForm.endTime &&
      eventForm.endTime < eventForm.startTime
    ) {
      Swal.fire("Invalid time", "The end time cannot be before the start time.", "warning");
      return;
    }

    try {
      setSavingEvent(true);

      if (modalMode === "edit" && editingEvent?.id) {
        await academicCalendarService.updateFacultyEvent(editingEvent.id, eventForm);
      } else {
        await academicCalendarService.createFacultyEvent(eventForm);
      }

      await loadFacultyEvents();
      setEventModalOpen(false);
      setEditingEvent(null);
      setModalMode("create");

      Swal.fire({
        icon: "success",
        title: modalMode === "edit" ? "Calendar item updated" : "Calendar item created",
        timer: 1300,
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
    if (modalMode !== "edit" || !editingEvent?.id) return;

    const result = await Swal.fire({
      title: "Delete this calendar item?",
      text:
        editingEvent.visibility === "university"
          ? "It will be removed from every teacher's calendar."
          : "It will be removed from your calendar.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete item",
      cancelButtonText: "Keep item",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) return;

    try {
      setSavingEvent(true);
      await academicCalendarService.deleteFacultyEvent(editingEvent.id);
      await loadFacultyEvents();
      setEventModalOpen(false);
      setEditingEvent(null);
      setModalMode("create");

      Swal.fire({
        icon: "success",
        title: "Calendar item deleted",
        timer: 1100,
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
        // Browser fallback below.
      }
    }

    input.focus();
    input.click();
  };

  const goToPreviousMonth = () => {
    setCurrentMonth((previous) =>
      makeLocalDate(previous.getFullYear(), previous.getMonth() - 1, 1)
    );
  };

  const goToNextMonth = () => {
    setCurrentMonth((previous) =>
      makeLocalDate(previous.getFullYear(), previous.getMonth() + 1, 1)
    );
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(makeLocalDate(today.getFullYear(), today.getMonth(), 1));
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          Loading academic calendar...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-violet-200/45 blur-3xl dark:bg-violet-500/10" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">
              <CalendarSmallIcon />
              Academic timeline
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              {calendar?.title || "Academic Calendar"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Official academic dates, personal tasks and university-wide teacher events in one organised calendar.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {isTeacher && (
              <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-100/80 p-1 dark:border-slate-700 dark:bg-slate-950">
                <button
                  type="button"
                  onClick={() => setViewMode("serial")}
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    viewMode === "serial"
                      ? "bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  List
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("calendar")}
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    viewMode === "calendar"
                      ? "bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  Month
                </button>
              </div>
            )}

            {isTeacher && (
              <button
                type="button"
                onClick={() => navigate("/teacher/academic-calendar/manage")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/15"
              >
                <SettingsIcon />
                Manage academic dates
              </button>
            )}
          </div>
        </div>
      </section>

      {viewMode === "serial" && (
        <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
                    activeCategory === category
                      ? "border-slate-900 bg-slate-900 text-white dark:border-violet-500 dark:bg-violet-600"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {category} <span className="opacity-65">{counts[category] || 0}</span>
                </button>
              ))}
            </div>

            <SearchField value={search} onChange={setSearch} />
          </div>

          <div className="mt-6 space-y-7">
            {Object.keys(groupedEvents).length === 0 ? (
              <EmptyState text="No academic calendar events match your search." />
            ) : (
              Object.entries(groupedEvents).map(([month, events]) => (
                <div key={month}>
                  <h2 className="mb-3 text-lg font-bold text-slate-950 dark:text-white">
                    {month}
                  </h2>
                  <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                    <div className="hidden grid-cols-[190px_140px_150px_1fr] bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 md:grid">
                      <div>Date</div>
                      <div>Day</div>
                      <div>Type</div>
                      <div>Academic activity</div>
                    </div>

                    {events.map((event) => (
                      <div
                        key={event._id}
                        className={`grid gap-3 border-t border-slate-200 px-4 py-4 first:border-t-0 dark:border-slate-800 md:grid-cols-[190px_140px_150px_1fr] ${
                          event.isHighlighted
                            ? "bg-amber-50/45 dark:bg-amber-500/5"
                            : "bg-white dark:bg-slate-900"
                        }`}
                      >
                        <div className="text-sm font-semibold text-slate-950 dark:text-white">
                          {event.dateText}
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {event.dayText || "—"}
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
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {event.title}
                          </p>
                          {event.note && (
                            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
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
        <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/70 dark:bg-[#0b1220] dark:shadow-[0_18px_55px_rgba(0,0,0,0.28)]">
          <div className="border-b border-slate-200 p-4 dark:border-slate-700/70 dark:bg-[#0d1626] sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-2xl">
                    {monthLabel(currentMonth)}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Click a date to add an item. Your own items appear first and can be dragged to reorder on the same date.
                  </p>
                </div>
                {facultyEventsLoading && (
                  <span className="hidden h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent sm:block" />
                )}
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <SearchField value={search} onChange={setSearch} compact />

                <div className="inline-flex items-center rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-950">
                  <button
                    type="button"
                    onClick={goToPreviousMonth}
                    className="rounded-xl p-2.5 text-slate-600 transition hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    aria-label="Previous month"
                  >
                    <ChevronLeftIcon />
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
                    className="rounded-xl p-2.5 text-slate-600 transition hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    aria-label="Next month"
                  >
                    <ChevronRightIcon />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => openCreateModal()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
                >
                  <PlusIcon />
                  New item
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <LegendItem type="Task" label="Task" />
              <LegendItem type="Exam" label="Exam" />
              <LegendItem type="Event" label="Event" />
              <span className="inline-flex items-center gap-1.5">
                <UniversityIcon className="h-3.5 w-3.5" /> All teachers
              </span>
              <span className="ml-auto hidden text-slate-400 dark:text-slate-500 lg:inline">
                {calendarItems.length} visible items
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[1050px]">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/90 text-[11px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:border-slate-700/70 dark:bg-[#182235] dark:text-slate-300">
                {weekDays.map((day, index) => (
                  <div
                    key={day}
                    className={`px-3 py-3.5 ${index < 6 ? "border-r border-slate-200 dark:border-slate-700/70" : ""}`}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {calendarWeeks.map((week, index) => (
                <CalendarWeek
                  key={week[0].iso}
                  days={week}
                  items={calendarItems}
                  isLast={index === calendarWeeks.length - 1}
                  onCreate={openCreateModal}
                  onOpenItem={openCalendarItem}
                  onOpenAgenda={setAgendaDate}
                  onReorder={handleReorderFacultyEvents}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {agendaDate && (
        <DayAgendaModal
          date={agendaDate}
          items={agendaItems}
          onClose={() => setAgendaDate("")}
          onCreate={() => openCreateModal(agendaDate)}
          onOpenItem={openCalendarItem}
        />
      )}

      {eventModalOpen && (
        <CalendarItemModal
          mode={modalMode}
          item={editingEvent}
          form={eventForm}
          saving={savingEvent}
          dateInputRef={dateInputRef}
          endDateInputRef={endDateInputRef}
          startTimeInputRef={startTimeInputRef}
          endTimeInputRef={endTimeInputRef}
          onChange={updateEventForm}
          onOpenPicker={openNativePicker}
          onClose={closeEventModal}
          onSubmit={handleSaveFacultyEvent}
          onDelete={handleDeleteFacultyEvent}
        />
      )}
    </div>
  );
}

function CalendarWeek({ days, items, isLast, onCreate, onOpenItem, onOpenAgenda, onReorder }) {
  const [draggedId, setDraggedId] = useState("");
  const [dragTargetId, setDragTargetId] = useState("");
  const suppressClickRef = useRef(false);

  const { visibleSegments, hiddenByDate } = useMemo(
    () => getWeekLayout(days, items),
    [days, items]
  );

  return (
    <div
      className={`relative h-[170px] bg-white dark:bg-[#08111f] ${
        isLast ? "" : "border-b border-slate-200 dark:border-slate-700/70"
      }`}
    >
      <div className="absolute inset-0 grid grid-cols-7">
        {days.map((day, index) => {
          const hiddenCount = hiddenByDate[day.iso] || 0;

          return (
            <button
              key={day.iso}
              type="button"
              onClick={() => onCreate(day.iso)}
              className={`relative block p-2.5 text-left transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-500 ${
                index < 6 ? "border-r border-slate-200 dark:border-slate-700/70" : ""
              } ${
                day.inCurrentMonth
                  ? "bg-white hover:bg-violet-50/45 dark:bg-[#08111f] dark:hover:bg-[#101b2e]"
                  : "bg-slate-50/65 hover:bg-slate-100 dark:bg-[#060d18] dark:hover:bg-[#0b1424]"
              }`}
            >
              <span
                className={`absolute left-2.5 top-2.5 z-30 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                  day.isToday
                    ? "bg-violet-600 text-white shadow-sm"
                    : day.inCurrentMonth
                    ? "text-slate-800 dark:text-slate-100"
                    : "text-slate-400 dark:text-slate-600"
                }`}
              >
                {day.date.getDate()}
              </span>

              {hiddenCount > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenAgenda(day.iso);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.stopPropagation();
                      onOpenAgenda(day.iso);
                    }
                  }}
                  className="absolute bottom-2 left-2 right-2 rounded-lg border border-transparent px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800/80 dark:hover:text-white"
                >
                  +{hiddenCount} more
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 z-20 grid grid-cols-7 auto-rows-[27px] gap-y-1"
        style={{ top: "44px" }}
      >
        {visibleSegments.map((segment) => {
          const style = categoryStyles[segment.type] || categoryStyles.Other;
          const showTime = segment.startColumn === segment.endColumn && segment.startTime;

          return (
            <button
              key={`${segment.id}-${days[0].iso}`}
              type="button"
              draggable={segment.source === "faculty" && segment.canEdit}
              onDragStart={(event) => {
                if (segment.source !== "faculty" || !segment.canEdit) return;
                suppressClickRef.current = true;
                setDraggedId(segment.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", segment.id);
              }}
              onDragOver={(event) => {
                const draggedSegment = visibleSegments.find((item) => item.id === draggedId);
                if (
                  !draggedSegment ||
                  segment.id === draggedId ||
                  segment.source !== "faculty" ||
                  !segment.canEdit ||
                  draggedSegment.startDate !== segment.startDate
                ) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragTargetId(segment.id);
              }}
              onDragLeave={() => {
                if (dragTargetId === segment.id) setDragTargetId("");
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const draggedSegment = visibleSegments.find((item) => item.id === draggedId);
                if (draggedSegment) onReorder?.(draggedSegment, segment);
                setDraggedId("");
                setDragTargetId("");
                window.setTimeout(() => {
                  suppressClickRef.current = false;
                }, 0);
              }}
              onDragEnd={() => {
                setDraggedId("");
                setDragTargetId("");
                window.setTimeout(() => {
                  suppressClickRef.current = false;
                }, 0);
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (suppressClickRef.current) return;
                onOpenItem(segment);
              }}
              className={`pointer-events-auto mx-1 flex min-w-0 items-center gap-1.5 overflow-hidden border px-2 py-1 text-left text-[11px] font-semibold leading-none shadow-[0_1px_1px_rgba(15,23,42,0.04)] transition hover:-translate-y-px hover:brightness-[1.04] hover:shadow-sm dark:shadow-[0_5px_16px_rgba(0,0,0,0.22)] dark:hover:brightness-110 ${style} ${
                segment.source === "faculty" && segment.canEdit ? "cursor-grab active:cursor-grabbing" : ""
              } ${draggedId === segment.id ? "opacity-45" : ""} ${
                dragTargetId === segment.id ? "ring-2 ring-violet-500 ring-offset-1 dark:ring-offset-slate-950" : ""
              } ${segment.startsBeforeWeek ? "rounded-l-sm" : "rounded-l-lg"} ${
                segment.endsAfterWeek ? "rounded-r-sm" : "rounded-r-lg"
              }`}
              style={{
                gridColumn: `${segment.startColumn + 1} / span ${segment.span}`,
                gridRow: segment.lane + 1,
              }}
              title={`${segment.title}\n${formatRange(segment)}${
                segment.details ? `\n${segment.details}` : ""
              }${segment.source === "faculty" && segment.canEdit ? "\nDrag to reorder your items on this date." : ""}`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  typeDotStyles[segment.type] || typeDotStyles.Other
                }`}
              />
              {showTime && (
                <span className="shrink-0 font-medium opacity-75">
                  {formatClock(segment.startTime)}
                </span>
              )}
              <span className="truncate">{segment.title}</span>
              {segment.visibility === "university" && segment.source === "faculty" && (
                <UniversityIcon className="ml-auto h-3 w-3 shrink-0 opacity-70" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayAgendaModal({ date, items, onClose, onCreate, onOpenItem }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="max-h-[88vh] w-full max-w-xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-300">
              Day schedule
            </p>
            <h3 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">
              {formatFriendlyDate(date, { includeYear: true })}
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {items.length} {items.length === 1 ? "item" : "items"}
            </p>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-5">
          {items.length === 0 ? (
            <EmptyState text="Nothing is scheduled for this day." />
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenItem(item)}
                className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-violet-300 hover:bg-violet-50/40 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-violet-500/40 dark:hover:bg-violet-500/5"
              >
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                    typeDotStyles[item.type] || typeDotStyles.Other
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {item.title}
                    </span>
                    {item.visibility === "university" && item.source === "faculty" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">
                        <UniversityIcon className="h-3 w-3" /> All teachers
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                    {item.startTime ? formatClock(item.startTime) : "All day"} · {item.type}
                  </span>
                  {item.details && (
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {item.details}
                    </span>
                  )}
                </span>
                <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
              </button>
            ))
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 p-5 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            <PlusIcon /> Add item
          </button>
        </div>
      </div>
    </div>
  );
}

function CalendarItemModal({
  mode,
  item,
  form,
  saving,
  dateInputRef,
  endDateInputRef,
  startTimeInputRef,
  endTimeInputRef,
  onChange,
  onOpenPicker,
  onClose,
  onSubmit,
  onDelete,
}) {
  const readOnly = mode === "view";
  const isOfficial = item?.source === "academic";
  const heading =
    mode === "create"
      ? "Create calendar item"
      : mode === "edit"
      ? "Update calendar item"
      : "Calendar item details";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[30px] border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <form onSubmit={onSubmit}>
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800 sm:p-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-300">
                  {isOfficial
                    ? "Official academic calendar"
                    : form.visibility === "university"
                    ? "University teacher calendar"
                    : "Personal teacher calendar"}
                </p>
                {readOnly && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    Read only
                  </span>
                )}
              </div>
              <h3 className="mt-1 text-xl font-bold text-slate-950 dark:text-white sm:text-2xl">
                {heading}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {readOnly
                  ? item?.creatorName
                    ? `Created by ${item.creatorName}`
                    : "Review the schedule details below."
                  : "Add a task, examination or event with an optional date range and time."}
              </p>
            </div>
            <IconButton label="Close" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            <label className="block">
              <FieldLabel>Title</FieldLabel>
              <input
                value={form.title}
                onChange={(event) => onChange("title", event.target.value)}
                disabled={readOnly}
                placeholder="Example: Submit question paper / Department meeting"
                className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-950 dark:disabled:text-slate-200"
              />
            </label>

            <div>
              <FieldLabel>Type</FieldLabel>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {FACULTY_EVENT_TYPES.map((type) => {
                  const selected = form.type === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={readOnly}
                      onClick={() => onChange("type", type)}
                      className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition disabled:cursor-default ${
                        selected
                          ? categoryStyles[type]
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${typeDotStyles[type]}`} />
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <PickerField
                label="Start date"
                type="date"
                value={form.date}
                inputRef={dateInputRef}
                disabled={readOnly}
                onChange={(value) => onChange("date", value)}
                onOpen={() => onOpenPicker(dateInputRef)}
                icon={<CalendarSmallIcon />}
              />
              <PickerField
                label="End date"
                type="date"
                value={form.endDate}
                min={form.date}
                inputRef={endDateInputRef}
                disabled={readOnly}
                onChange={(value) => onChange("endDate", value)}
                onOpen={() => onOpenPicker(endDateInputRef)}
                icon={<CalendarSmallIcon />}
              />
              <PickerField
                label="Start time (optional)"
                type="time"
                value={form.startTime}
                inputRef={startTimeInputRef}
                disabled={readOnly}
                onChange={(value) => onChange("startTime", value)}
                onOpen={() => onOpenPicker(startTimeInputRef)}
                icon={<ClockIcon />}
              />
              <PickerField
                label="End time (optional)"
                type="time"
                value={form.endTime}
                inputRef={endTimeInputRef}
                disabled={readOnly}
                onChange={(value) => onChange("endTime", value)}
                onOpen={() => onOpenPicker(endTimeInputRef)}
                icon={<ClockIcon />}
              />
            </div>

            {!isOfficial && (
              <div>
                <FieldLabel>Visibility</FieldLabel>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {VISIBILITY_OPTIONS.map((option) => {
                    const selected = form.visibility === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={readOnly}
                        onClick={() => onChange("visibility", option.value)}
                        className={`rounded-2xl border p-4 text-left transition disabled:cursor-default ${
                          selected
                            ? "border-violet-300 bg-violet-50 ring-4 ring-violet-500/5 dark:border-violet-500/40 dark:bg-violet-500/10"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800"
                        }`}
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                          {option.value === "university" ? <UniversityIcon /> : <LockIcon />}
                          {option.title}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                          {option.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <label className="block">
              <FieldLabel>Details</FieldLabel>
              <textarea
                value={form.details}
                onChange={(event) => onChange("details", event.target.value)}
                disabled={readOnly}
                placeholder="Add room number, instructions, preparation notes or other useful details..."
                rows={4}
                className="mt-1.5 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-950 dark:disabled:text-slate-200"
              />
            </label>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 p-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              {mode === "edit" && (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={saving}
                  className="rounded-2xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                >
                  Delete item
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {readOnly ? "Close" : "Cancel"}
              </button>
              {!readOnly && (
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving && (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  )}
                  {saving ? "Saving..." : mode === "edit" ? "Save changes" : "Create item"}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function PickerField({
  label,
  type,
  value,
  min,
  inputRef,
  disabled,
  onChange,
  onOpen,
  icon,
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative mt-1.5">
        <input
          ref={inputRef}
          type={type}
          min={min}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onClick={() => !disabled && onOpen()}
          className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-11 text-sm font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:[color-scheme:dark] dark:disabled:bg-slate-950 dark:disabled:text-slate-200"
        />
        {!disabled && (
          <button
            type="button"
            onClick={onOpen}
            className="absolute inset-y-0 right-3 flex items-center text-slate-400 transition hover:text-violet-600 dark:hover:text-violet-300"
            aria-label={`Open ${label.toLowerCase()} picker`}
          >
            {icon}
          </button>
        )}
      </div>
    </label>
  );
}

function SearchField({ value, onChange, compact = false }) {
  return (
    <label className={`relative block w-full ${compact ? "md:w-64" : "xl:w-72"}`}>
      <SearchIcon />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search calendar..."
        className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
      />
    </label>
  );
}

function LegendItem({ type, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${typeDotStyles[type]}`} />
      {label}
    </span>
  );
}

function FieldLabel({ children }) {
  return (
    <span className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
      {children}
    </span>
  );
}

function EmptyState({ text }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-400">
      <CalendarSmallIcon className="mx-auto mb-3 h-6 w-6 text-slate-400" />
      {text}
    </div>
  );
}

function IconButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function CalendarSmallIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.97 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 10 3.01V3h4v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 7l-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.96 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ChevronLeftIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function UniversityIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m3 10 9-5 9 5-9 5-9-5z" />
      <path d="M5 12v6M9 14v4M15 14v4M19 12v6M3 20h18" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
