import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { academicCalendarService } from "../services/academicCalendarService";

const CATEGORIES = [
  "All",
  "Holiday",
  "Exam",
  "Payment",
  "Registration",
  "Class",
  "Result",
  "Event",
  "Other",
];

const categoryStyles = {
  Holiday: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
  Exam: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
  Payment: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
  Registration: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20",
  Class: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20",
  Result: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20",
  Event: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:border-fuchsia-500/20",
  Other: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

function getMonthLabel(dateText = "") {
  const text = String(dateText);
  const match = text.match(/(Jan|Feb|Mar|Apr|May|Jun|June|Jul|July|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/i);
  if (match) return match[0];

  const monthOnly = text.match(/(Jan|Feb|Mar|Apr|May|Jun|June|Jul|July|Aug|Sep|Oct|Nov|Dec)/i);
  return monthOnly ? monthOnly[0] : "Other Dates";
}

export default function AcademicCalendarPage() {
  const navigate = useNavigate();

  const [role] = useState(getAuthItem("marksPortalRole"));
  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadCalendar();
  }, []);

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

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();

    return (calendar?.events || []).filter((event) => {
      const matchCategory =
        activeCategory === "All" || event.category === activeCategory;

      const matchSearch =
        !q ||
        event.title?.toLowerCase().includes(q) ||
        event.dateText?.toLowerCase().includes(q) ||
        event.dayText?.toLowerCase().includes(q);

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
            {/* <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {calendar?.semester || "Semester"} {calendar?.academicYear ? `• ${calendar.academicYear}` : ""}
            </p> */}
          </div>

          {role === "teacher" && (
            <button
              type="button"
              onClick={() => navigate("/teacher/academic-calendar/manage")}
              className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
            >
              Create / Update Academic Calendar
            </button>
          )}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
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
        </div>
      </section>

      {/* {calendar?.summaries?.length > 0 && (
        <section className="grid gap-4 lg:grid-cols-3">
          {calendar.summaries.map((item) => (
            <div
              key={item._id}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                  categoryStyles[item.type] || categoryStyles.Other
                }`}
              >
                {item.type}
              </span>
              <h3 className="mt-3 text-base font-bold text-slate-950 dark:text-white">
                {item.title}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {item.dateText || "Date not specified"}
              </p>
            </div>
          ))}
        </section>
      )} */}

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
    </div>
  );
}