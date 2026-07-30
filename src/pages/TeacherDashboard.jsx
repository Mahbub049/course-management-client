import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchTeacherCourses } from "../services/courseService";
import { fetchTeacherComplaints } from "../services/complaintService";
import { getTeacherCounsellingBookings } from "../services/routineService";
import { getAuthItem } from "../utils/authStorage";
import { academicCalendarService } from "../services/academicCalendarService";
import {
  addDays,
  formatClock,
  formatFriendlyDate,
  isoFromDate,
  normalizeFacultyType,
  parseAcademicDateRange,
  relativeDayLabel,
  toDateInput,
} from "../utils/calendarUtils";

const DASHBOARD_ACADEMIC_CATEGORIES = new Set([
  "Holiday",
  "Exam",
  "Class",
  "Result",
  "Attendance",
]);

function getDashboardAcademicCategory(event = {}) {
  const category = String(event.category || "").trim();
  if (DASHBOARD_ACADEMIC_CATEGORIES.has(category)) return category;

  const normalizedCategory = category.toLowerCase();
  if (/attendance/.test(normalizedCategory)) return "Attendance";
  if (/holiday/.test(normalizedCategory)) return "Holiday";
  if (/exam|examination/.test(normalizedCategory)) return "Exam";
  if (/class/.test(normalizedCategory)) return "Class";
  if (/result|grade/.test(normalizedCategory)) return "Result";

  // Do not reinterpret explicit excluded categories such as Payment or Registration.
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

function getCounsellingRequestText(request = {}) {
  const course = request.course || request.student?.course || {};
  const intake = request.intake || request.student?.intake || course.intake || "";
  const section = request.section || request.student?.section || course.section || "";
  const academicText = [
    intake ? `Intake ${intake}` : "",
    section ? `Section ${section}` : "",
    course.code || request.courseCode || "",
  ].filter(Boolean).join(" · ");

  const studentText = request.student?.name
    ? `${request.student.name}${request.student.roll ? ` (${request.student.roll})` : ""}`
    : "A student";
  const timeText = request.start || request.end
    ? ` · ${request.start || ""}${request.end ? ` - ${request.end}` : ""}`
    : "";

  return `${studentText}${academicText ? ` · ${academicText}` : ""} requested ${request.date || "a counselling date"}${timeText}.`;
}

function buildUpcomingSchedule(calendar, facultyEvents, startDate, endDate) {
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
        source: "academic",
        title: event.title,
        type: category,
        startDate: rangeStart,
        endDate: rangeEnd,
        displayDate: rangeStart < startDate ? startDate : rangeStart,
        startTime: "",
        visibility: "university",
        canEdit: false,
        sortOrder: Number.isFinite(Number(event.sortOrder)) ? Number(event.sortOrder) : index,
        createdAt: event.createdAt || "",
      };
    })
    .filter(Boolean);

  const teacherItems = (facultyEvents || [])
    .map((event) => {
      const eventStart = toDateInput(event.date);
      if (!eventStart) return null;
      const eventEnd = toDateInput(event.endDate) || eventStart;

      return {
        id: event._id,
        source: "faculty",
        title: event.title,
        type: normalizeFacultyType(event.type),
        startDate: eventStart,
        endDate: eventEnd,
        displayDate: eventStart < startDate ? startDate : eventStart,
        startTime: event.startTime || "",
        visibility: event.visibility || "personal",
        canEdit: event.canEdit !== false,
        sortOrder: Number.isFinite(Number(event.sortOrder)) ? Number(event.sortOrder) : 0,
        createdAt: event.createdAt || "",
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
    .slice(0, 5);
}

function getScheduleTimingLabel(item, now = new Date()) {
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

export default function TeacherDashboard() {
  const navigate = useNavigate();

const role = getAuthItem("marksPortalRole");

useEffect(() => {
  if (role !== "teacher") {
    navigate("/login", { replace: true });
  }
}, [role, navigate]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const teacherName = getAuthItem("marksPortalName") || "Teacher";

  const [statsLoading, setStatsLoading] = useState(true);
  const [coursesCount, setCoursesCount] = useState(0);
  const [pendingComplaintsCount, setPendingComplaintsCount] = useState(0);
  const [pendingCounsellingCount, setPendingCounsellingCount] = useState(0);
  const [latestCounsellingRequest, setLatestCounsellingRequest] = useState(null);
  const [upcomingSchedule, setUpcomingSchedule] = useState([]);

  useEffect(() => {
if (role !== "teacher") return;

    const loadStats = async () => {
      setStatsLoading(true);
      try {
        const today = new Date();
        const upcomingStartDate = isoFromDate(today);
        const upcomingEndDate = isoFromDate(addDays(today, 3));

        const [courses, complaints, counsellingData, facultyCalendarData, academicCalendarData] = await Promise.all([
          fetchTeacherCourses(),
          fetchTeacherComplaints(),
          getTeacherCounsellingBookings(),
          academicCalendarService.getFacultyEvents({
            startDate: upcomingStartDate,
            endDate: upcomingEndDate,
          }),
          academicCalendarService.getLatest(),
        ]);

        setCoursesCount(Array.isArray(courses) ? courses.length : 0);

        const complaintList = Array.isArray(complaints) ? complaints : [];
        const pendingComplaints = complaintList.filter(
          (c) => c.status === "open" || c.status === "in_review"
        ).length;

        const counsellingList = Array.isArray(counsellingData?.bookings)
          ? counsellingData.bookings
          : [];
        const pendingCounselling = counsellingList.filter(
          (booking) => booking.status === "pending"
        );

        setPendingComplaintsCount(pendingComplaints);
        setPendingCounsellingCount(pendingCounselling.length);
        setLatestCounsellingRequest(pendingCounselling[0] || null);
        setUpcomingSchedule(
          buildUpcomingSchedule(
            academicCalendarData?.calendar,
            facultyCalendarData?.events || [],
            upcomingStartDate,
            upcomingEndDate
          )
        );
      } catch (err) {
        console.error("Dashboard stats error:", err);
        setCoursesCount(0);
        setPendingComplaintsCount(0);
        setPendingCounsellingCount(0);
        setLatestCounsellingRequest(null);
        setUpcomingSchedule([]);
      } finally {
        setStatsLoading(false);
      }
    };

    loadStats();
  }, [role]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="space-y-4 md:hidden">
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-violet-50/70 to-sky-50/70 p-4 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">
            {greeting}
          </p>
          <h1 className="mt-2 break-words text-xl font-bold tracking-tight text-slate-950 dark:text-white">
            {teacherName}
          </h1>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MobileCountCard
            title="Pending Complaints"
            value={statsLoading ? "..." : String(pendingComplaintsCount)}
            icon={<AlertIcon />}
            accent="amber"
          />
          <MobileCountCard
            title="Counselling"
            value={statsLoading ? "..." : String(pendingCounsellingCount)}
            icon={<MessageIcon />}
            accent="emerald"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MobileActionButton
            title="Attendance"
            icon={<CheckIcon />}
            onClick={() => navigate("/teacher/attendance")}
            accent="emerald"
          />
          <MobileActionButton
            title="Notebook"
            icon={<SheetIcon />}
            onClick={() => navigate("/teacher/notebook")}
            accent="violet"
          />
          <MobileActionButton
            title="Counselling"
            icon={<MessageIcon />}
            onClick={() => navigate("/teacher/counselling")}
            accent="sky"
          />
          <MobileActionButton
            title="Courses"
            icon={<BookIcon />}
            onClick={() => navigate("/teacher/courses")}
            accent="indigo"
          />
        </div>

        <UpcomingScheduleCard
          items={upcomingSchedule}
          loading={statsLoading}
          compact
          onOpenCalendar={() => navigate("/academic-calendar")}
        />
      </section>

      <div className="hidden space-y-5 md:block">
      {/* Top intro + quick actions */}
      <section className="rounded-[28px] border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/85 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-slate-500 dark:text-slate-400">
              {greeting},{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {teacherName}
              </span>
            </p>

            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Teacher Dashboard
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              Manage courses, attendance, marks and complaints from one clean
              workspace designed for both desktop and mobile use.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:w-auto xl:min-w-[540px]">
            <QuickButton
              icon={<CheckIcon />}
              label="Take Attendance"
              onClick={() => navigate("/teacher/attendance")}
            />
            <QuickButton
              icon={<SheetIcon />}
              label="Attendance Sheet"
              onClick={() => navigate("/teacher/attendance-sheet")}
            />
            <QuickButton
              icon={<MessageIcon />}
              label="Counselling"
              onClick={() => navigate("/teacher/counselling")}
            />
            <QuickButton
              icon={<GridIcon />}
              label="View Courses"
              onClick={() => navigate("/teacher/courses")}
            />
          </div>
        </div>
      </section>

      {pendingCounsellingCount > 0 && (
        <section className="overflow-hidden rounded-[28px] border border-emerald-200 bg-emerald-50/90 p-4 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="rounded-2xl border border-emerald-200 bg-white p-3 text-emerald-700 shadow-sm dark:border-emerald-500/20 dark:bg-slate-900/70 dark:text-emerald-300">
                <MessageIcon />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  New counselling request
                </p>
                <h2 className="mt-1 text-base font-bold text-slate-900 dark:text-white sm:text-lg">
                  {pendingCounsellingCount} pending counselling {pendingCounsellingCount === 1 ? "request" : "requests"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {latestCounsellingRequest
                    ? getCounsellingRequestText(latestCounsellingRequest)
                    : "A student has requested a counselling appointment."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/teacher/counselling")}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              Review Request
              <ArrowIcon />
            </button>
          </div>
        </section>
      )}

      {/* Upcoming tasks and events */}
      <UpcomingScheduleCard
        items={upcomingSchedule}
        loading={statsLoading}
        onOpenCalendar={() => navigate("/academic-calendar")}
      />

      {/* Stats */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Courses"
          value={statsLoading ? "..." : String(coursesCount)}
          hint="Total courses you created"
          icon={<BookIcon />}
          accent="violet"
        />

        <StatCard
          title="Pending Complaints"
          value={statsLoading ? "..." : String(pendingComplaintsCount)}
          hint="Open + In-review complaints"
          icon={<AlertIcon />}
          accent="amber"
        />

        <StatCard
          title="Pending Counselling"
          value={statsLoading ? "..." : String(pendingCounsellingCount)}
          hint="Student requests waiting for response"
          icon={<MessageIcon />}
          accent="emerald"
        />

        <StatCard
          title="Attendance"
          value={statsLoading ? "..." : "Ready"}
          hint="Daily attendance & sheet generation"
          icon={<CheckIcon />}
          accent="emerald"
        />
      </section>

      {/* Main action cards */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-4 md:grid-cols-2">
        <ActionCard
          title="Courses"
          desc="Create courses, manage students, open marks tabs and keep course tasks organized."
          onClick={() => navigate("/teacher/courses")}
          icon={<BookIcon />}
          accent="from-sky-500/10 via-indigo-500/10 to-violet-500/10 dark:from-sky-500/10 dark:via-indigo-500/5 dark:to-violet-500/10"
        />

        <ActionCard
          title="Attendance"
          desc="Take attendance, update previous records and generate attendance sheets easily."
          onClick={() => navigate("/teacher/attendance")}
          icon={<CheckIcon />}
          accent="from-emerald-500/10 via-cyan-500/10 to-sky-500/10 dark:from-emerald-500/10 dark:via-cyan-500/5 dark:to-sky-500/10"
        />

        <ActionCard
          title="Complaints"
          desc="Review attendance and marks complaints, reply quickly and keep issue tracking clean."
          onClick={() => navigate("/teacher/complaints")}
          icon={<AlertIcon />}
          accent="from-amber-500/10 via-orange-500/10 to-rose-500/10 dark:from-amber-500/10 dark:via-orange-500/5 dark:to-rose-500/10"
        />

        <ActionCard
          title="Counselling"
          desc="Review student counselling requests, approve appointments, suggest alternate time slots or decline with a note."
          onClick={() => navigate("/teacher/counselling")}
          icon={<MessageIcon />}
          accent="from-emerald-500/10 via-teal-500/10 to-cyan-500/10 dark:from-emerald-500/10 dark:via-teal-500/5 dark:to-cyan-500/10"
        />
      </section>
      </div>
    </div>
  );
}

function UpcomingScheduleCard({ items, loading, onOpenCalendar, compact = false }) {
  const typeStyles = {
    Task: "bg-emerald-500",
    Exam: "bg-amber-500",
    Event: "bg-blue-500",
    Holiday: "bg-rose-500",
    Class: "bg-violet-500",
    Result: "bg-indigo-500",
    Attendance: "bg-cyan-500",
    Other: "bg-slate-500",
  };

  return (
    <section className={`relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${compact ? "p-4" : "p-5 sm:p-6"}`}>
      <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-violet-200/35 blur-3xl dark:bg-violet-500/10" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-300">
              <CalendarIcon />
              Upcoming schedule
            </div>
            <h2 className={`${compact ? "mt-1 text-lg" : "mt-2 text-xl sm:text-2xl"} font-bold tracking-tight text-slate-950 dark:text-white`}>
              Tasks and events near you
            </h2>
            {!compact && (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Items scheduled for today and the next three days.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenCalendar}
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-violet-500/40 dark:hover:bg-violet-500/10"
          >
            Calendar
            <ArrowIcon />
          </button>
        </div>

        <div className={`${compact ? "mt-4" : "mt-5"} grid gap-2 ${compact ? "grid-cols-1" : "lg:grid-cols-2"}`}>
          {loading ? (
            Array.from({ length: compact ? 2 : 4 }, (_, index) => (
              <div key={index} className="h-[74px] animate-pulse rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950" />
            ))
          ) : items.length === 0 ? (
            <div className={`${compact ? "" : "lg:col-span-2"} rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-center dark:border-slate-700 dark:bg-slate-950/60`}>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No urgent calendar items</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Your next three days are currently clear.
              </p>
            </div>
          ) : (
            items.slice(0, compact ? 3 : 4).map((item) => {
              const relativeDate = getScheduleTimingLabel(item);
              const isRange = item.startDate !== item.endDate;
              const type = item.type || "Other";

              return (
                <button
                  key={`${item.source}-${item.id}`}
                  type="button"
                  onClick={onOpenCalendar}
                  className="group flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-violet-300 hover:bg-violet-50/45 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-violet-500/40 dark:hover:bg-violet-500/5"
                  title={`${formatFriendlyDate(item.startDate, { includeYear: true })}${isRange ? ` – ${formatFriendlyDate(item.endDate, { includeYear: true })}` : ""}`}
                >
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${typeStyles[type] || typeStyles.Other}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {item.title}
                      </span>
                      {item.visibility === "university" && item.source === "faculty" && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-200">
                          All teachers
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{relativeDate}</span>
                      {item.startTime ? ` · ${formatClock(item.startTime)}` : " · All day"}
                      {isRange ? ` · Until ${formatFriendlyDate(item.endDate)}` : ""}
                    </span>
                  </span>
                  <span className="mt-1 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500 dark:text-slate-600">
                    <ArrowIcon />
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

function MobileCountCard({ title, value, icon, accent = "violet" }) {
  const accentMap = {
    violet: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  };

  return (
    <div className="min-w-0 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className={`inline-flex rounded-2xl border p-2.5 ${accentMap[accent] || accentMap.violet}`}>
        {icon}
      </div>
      <div className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">{value}</div>
      <div className="mt-1 break-words text-[11px] font-semibold leading-4 text-slate-500 dark:text-slate-400">
        {title}
      </div>
    </div>
  );
}

function MobileActionButton({ title, icon, onClick, accent = "violet" }) {
  const accentMap = {
    violet: "bg-violet-600 hover:bg-violet-700",
    emerald: "bg-emerald-600 hover:bg-emerald-700",
    sky: "bg-sky-600 hover:bg-sky-700",
    indigo: "bg-indigo-600 hover:bg-indigo-700",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-24 flex-col items-center justify-center gap-2 rounded-3xl px-3 py-4 text-sm font-bold text-white shadow-sm transition ${accentMap[accent] || accentMap.violet}`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">{icon}</span>
      <span>{title}</span>
    </button>
  );
}

/* ---------- UI Components ---------- */

function QuickButton({ label, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-violet-500/40",
        "border border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:hover:border-violet-500/40 dark:hover:bg-violet-500/10",
      ].join(" ")}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function StatCard({ title, value, hint, icon, accent = "violet" }) {
  const accentMap = {
    violet:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20",
    amber:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
    emerald:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
  };

  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {title}
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {value}
          </div>
          <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {hint}
          </div>
        </div>

        <div
          className={`rounded-2xl border p-3 ${accentMap[accent] || accentMap.violet}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function ActionCard({ title, desc, onClick, icon, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${title}`}
      className="group relative min-h-[136px] w-full overflow-hidden rounded-[24px] border border-slate-200/80 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-500/35 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-violet-500/40"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${accent}`} />
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/40 blur-2xl dark:bg-white/5" />

      <div className="relative p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="rounded-xl border border-slate-200 bg-white/80 p-2.5 text-slate-800 backdrop-blur dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100">
            {icon}
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-semibold text-slate-500 backdrop-blur transition group-hover:text-violet-700 dark:bg-slate-800/80 dark:text-slate-400 dark:group-hover:text-violet-300">
            Open
            <span className="transition-transform group-hover:translate-x-0.5"><ArrowIcon /></span>
          </span>
        </div>

        <h3 className="mt-3 min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>

        <p className="mt-1.5 truncate text-xs leading-5 text-slate-600 dark:text-slate-400" title={desc}>
          {desc}
        </p>
      </div>
    </button>
  );
}

/* ---------- Icons ---------- */

function CalendarIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 19a2 2 0 0 0 2 2h14V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z" />
      <path d="M4 7h16" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.5h3.4L22 20H2z" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function SheetIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h8M8 9h4" />
    </svg>
  );
}