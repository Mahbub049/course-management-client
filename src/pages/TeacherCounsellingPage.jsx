import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  deleteTeacherCounsellingBooking,
  getTeacherCounsellingBookings,
  updateTeacherCounsellingBooking,
} from "../services/routineService";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "alternate_suggested", label: "Alternate Suggested" },
  { value: "declined", label: "Declined" },
];

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function getDateDayName(dateString) {
  const match = String(dateString || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return "";
  return DAY_NAMES[date.getUTCDay()] || "";
}

function formatSlotTime(slot = {}) {
  const startEnd = [slot.start, slot.end].filter(Boolean).join(" - ");
  return startEnd || String(slot.slotLabel || slot.label || "").replace(/\n/g, " ") || "Time slot";
}

function getSlotDisplayId(slot = {}) {
  const rawId = slot.slotId || slot.id;
  if (rawId) return String(rawId);

  const fallback = [slot.day, slot.start, slot.end, slot.label, slot.slotLabel]
    .filter(Boolean)
    .join("_");

  return fallback.replace(/\s+/g, "_") || "";
}

function formatDate(dateString) {
  const match = String(dateString || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateString || "—";

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return dateString || "—";

  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function statusLabel(status) {
  const map = {
    pending: "Pending",
    approved: "Approved",
    alternate_suggested: "Alternate Suggested",
    declined: "Declined",
  };
  return map[status] || "Pending";
}

function statusBadgeClass(status) {
  if (status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
  }
  if (status === "alternate_suggested") {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300";
  }
  if (status === "declined") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300";
  }
  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300";
}

function getInitials(name = "") {
  const parts = String(name || "Student")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  const initials = parts.map((part) => part[0]).join("").toUpperCase();
  return initials || "ST";
}

function getBookingAcademicInfo(booking = {}) {
  const course = booking.course || booking.student?.course || {};
  const intake = booking.intake || booking.student?.intake || course.intake || "";
  const section = booking.section || booking.student?.section || course.section || "";
  const courseCode = course.code || booking.courseCode || "";

  return {
    intake,
    section,
    courseCode,
    text: [
      intake ? `Intake ${intake}` : "",
      section ? `Section ${section}` : "",
      courseCode,
    ].filter(Boolean).join(" · "),
  };
}

function groupCounsellingSlots(slots = []) {
  const groups = DAY_NAMES.reduce((acc, day) => ({ ...acc, [day]: [] }), {});

  slots.forEach((slot) => {
    const day = slot.day;
    if (!groups[day]) groups[day] = [];
    groups[day].push(slot);
  });

  return DAY_NAMES.map((day) => ({ day, slots: groups[day] || [] }));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function getNextDateForDay(dayName, fromDateString = todayString()) {
  const from = new Date(`${fromDateString}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime())) return todayString();

  const targetIndex = DAY_NAMES.indexOf(dayName);
  if (targetIndex < 0) return todayString();

  const diff = (targetIndex - from.getUTCDay() + 7) % 7;
  return toDateInputValue(addDays(from, diff));
}

function getFirstAvailableAlternate(slots = []) {
  const first = slots[0];
  if (!first) return { alternateDate: todayString(), alternateSlotId: "" };

  return {
    alternateDate: first.day ? getNextDateForDay(first.day) : todayString(),
    alternateSlotId: getSlotDisplayId(first),
  };
}

function RoutineCounsellingTabs() {
  const linkClass = ({ isActive }) =>
    [
      "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold transition",
      isActive
        ? "bg-violet-600 text-white shadow-sm shadow-violet-500/20"
        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/80",
    ].join(" ");

  return (
    <div className="flex w-fit rounded-[1.4rem] border border-slate-200 bg-white/85 p-1 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <NavLink to="/teacher/routine" className={linkClass} end>
        Routine
      </NavLink>
      <NavLink to="/teacher/counselling" className={linkClass}>
        Counselling
      </NavLink>
    </div>
  );
}

function StatCard({ title, value, subtitle, tone = "violet", icon }) {
  const toneClasses = {
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
  };

  return (
    <div className="rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
      <div className="flex items-center gap-3">
        <div className={["flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", toneClasses[tone]].join(" ")}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {title}
          </p>
          <p className="mt-0.5 text-2xl font-bold leading-none text-slate-900 dark:text-white">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function TeacherCounsellingPage() {
  const navigate = useNavigate();
  const [data, setData] = useState({ counsellingSlots: [], timeSlots: [], bookings: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bookingForms, setBookingForms] = useState({});
  const [updatingBookingId, setUpdatingBookingId] = useState("");

  const counsellingSlots = data.counsellingSlots || [];
  const timeSlots = data.timeSlots || [];
  const bookings = data.bookings || [];

  const groupedSlots = useMemo(() => groupCounsellingSlots(counsellingSlots), [counsellingSlots]);

  const stats = useMemo(() => {
    const pending = bookings.filter((booking) => booking.status === "pending").length;
    const approved = bookings.filter((booking) => booking.status === "approved").length;
    const alternate = bookings.filter((booking) => booking.status === "alternate_suggested").length;

    return {
      totalSlots: counsellingSlots.length,
      pending,
      approved,
      alternate,
    };
  }, [bookings, counsellingSlots.length]);

  const filteredBookings = useMemo(() => {
    if (statusFilter === "all") return bookings;
    return bookings.filter((booking) => booking.status === statusFilter);
  }, [bookings, statusFilter]);

  const loadData = async () => {
    const result = await getTeacherCounsellingBookings();
    setData({
      counsellingSlots: result?.counsellingSlots || [],
      timeSlots: result?.timeSlots || [],
      bookings: result?.bookings || [],
    });
  };

  useEffect(() => {
    let ignore = false;

    const run = async () => {
      try {
        setLoading(true);
        setError("");
        const result = await getTeacherCounsellingBookings();
        if (ignore) return;
        setData({
          counsellingSlots: result?.counsellingSlots || [],
          timeSlots: result?.timeSlots || [],
          bookings: result?.bookings || [],
        });
      } catch (err) {
        console.error(err);
        if (!ignore) setError(err?.response?.data?.message || "Could not load counselling data.");
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    run();

    return () => {
      ignore = true;
    };
  }, []);

  const updateBookingForm = (bookingId, field, value) => {
    setBookingForms((prev) => ({
      ...prev,
      [bookingId]: {
        ...(prev[bookingId] || {}),
        [field]: value,
      },
    }));
  };

  const alternateTimeSlots = useMemo(() => {
    const source = timeSlots.length ? timeSlots : counsellingSlots;
    const seen = new Set();

    return source
      .map((slot) => {
        const id = getSlotDisplayId(slot);
        if (!id || seen.has(id)) return null;
        seen.add(id);
        return {
          ...slot,
          id,
          slotId: id,
          label: slot.label || slot.slotLabel || formatSlotTime(slot),
          slotLabel: slot.slotLabel || slot.label || formatSlotTime(slot),
        };
      })
      .filter(Boolean);
  }, [counsellingSlots, timeSlots]);

  const getAlternateSlots = () => alternateTimeSlots;

  const openAlternateFields = (bookingId) => {
    const initial = getFirstAvailableAlternate(alternateTimeSlots);
    setBookingForms((prev) => ({
      ...prev,
      [bookingId]: {
        ...(prev[bookingId] || {}),
        alternateOpen: true,
        alternateDate: prev[bookingId]?.alternateDate || initial.alternateDate,
        alternateSlotId: prev[bookingId]?.alternateSlotId || initial.alternateSlotId,
      },
    }));
  };

  const handleBookingAction = async (booking, action) => {
    const form = bookingForms[booking.id] || {};

    if (action === "alternate_suggested" && !form.alternateOpen) {
      openAlternateFields(booking.id);
      return;
    }

    if (action === "alternate_suggested" && (!form.alternateDate || !form.alternateSlotId)) {
      setError("Please select an alternate date and time slot.");
      return;
    }

    try {
      setUpdatingBookingId(booking.id);
      setError("");

      await updateTeacherCounsellingBooking(booking.id, {
        action,
        teacherMessage: form.teacherMessage || "",
        alternateDate: form.alternateDate || "",
        alternateSlotId: form.alternateSlotId || "",
      });

      await loadData();
      setBookingForms((prev) => ({ ...prev, [booking.id]: {} }));
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Could not update counselling booking.");
    } finally {
      setUpdatingBookingId("");
    }
  };


  const handleDeleteBooking = async (booking) => {
    const confirmed = window.confirm(
      `Delete this counselling request from ${booking.student?.name || "this student"}?`
    );

    if (!confirmed) return;

    try {
      setUpdatingBookingId(booking.id);
      setError("");
      await deleteTeacherCounsellingBooking(booking.id);
      await loadData();
      setBookingForms((prev) => {
        const next = { ...prev };
        delete next[booking.id];
        return next;
      });
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Could not delete counselling booking.");
    } finally {
      setUpdatingBookingId("");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center text-sm font-semibold text-slate-500 dark:text-slate-400">
        Loading counselling management...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <RoutineCounsellingTabs />

      <section className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-4 bg-gradient-to-r from-violet-600/10 via-fuchsia-500/10 to-sky-500/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Counselling
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Manage your weekly counselling slots and student booking requests from one place.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/teacher/routine/manage")}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
          >
            <CalendarIcon />
            Manage Weekly Schedule
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-rose-300/40 bg-rose-500/10 p-4 text-sm font-semibold text-rose-600 dark:text-rose-300">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Weekly Slots"
          value={stats.totalSlots}
          subtitle="Across all days"
          tone="violet"
          icon={<CalendarIcon />}
        />
        <StatCard
          title="Pending"
          value={stats.pending}
          subtitle="Needs your action"
          tone="amber"
          icon={<ClockIcon />}
        />
        <StatCard
          title="Approved"
          value={stats.approved}
          subtitle="Confirmed bookings"
          tone="emerald"
          icon={<CheckIcon />}
        />
        <StatCard
          title="Alternate"
          value={stats.alternate}
          subtitle="Suggested by you"
          tone="blue"
          icon={<SwapIcon />}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.82fr_1.65fr]">
        <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Weekly Counselling Hours
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Compact view of slots selected from free routine periods.
              </p>
            </div>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
              {stats.totalSlots} slots
            </span>
          </div>

          {stats.totalSlots === 0 ? (
            <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                No counselling hour selected yet.
              </p>
              <button
                type="button"
                onClick={() => navigate("/teacher/routine/manage")}
                className="mt-4 rounded-2xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-700"
              >
                Select Free Slots
              </button>
            </div>
          ) : (
            <div className="mt-5 divide-y divide-slate-200 overflow-hidden rounded-3xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {groupedSlots.map((group) => (
                <div
                  key={group.day}
                  className="grid gap-3 bg-slate-50/70 px-4 py-3 dark:bg-slate-900/50 sm:grid-cols-[4.5rem_1fr]"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{group.day}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {group.slots.length} {group.slots.length === 1 ? "slot" : "slots"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {group.slots.length ? (
                      group.slots.map((slot) => (
                        <span
                          key={`${slot.day}-${slot.slotId}`}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                        >
                          {formatSlotTime(slot)}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-400 dark:border-slate-700">
                        No slots added
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Student Booking Requests
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Review requests with student name, roll, time, topic and message.
              </p>
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:ring-violet-500/20"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {!filteredBookings.length ? (
            <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                No counselling booking request found.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {filteredBookings.map((booking) => {
                const form = bookingForms[booking.id] || {};
                const alternateDate = form.alternateDate || "";
                const alternateSlots = getAlternateSlots(alternateDate);
                const isPending = booking.status === "pending";
                const isUpdating = updatingBookingId === booking.id;
                const academicInfo = getBookingAcademicInfo(booking);

                return (
                  <article
                    key={booking.id}
                    className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/45"
                  >
                    <div className="grid gap-4 p-4 xl:grid-cols-[1.1fr_1fr_1fr_auto] xl:items-start">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-violet-600 text-sm font-bold text-white shadow-sm shadow-violet-500/20">
                          {booking.student?.profileImage ? (
                            <img
                              src={booking.student.profileImage}
                              alt={booking.student?.name || "Student"}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            getInitials(booking.student?.name)
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                            {booking.student?.name || "Student"}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Roll: {booking.student?.roll || "—"}
                          </p>
                          {academicInfo.text && (
                            <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                              {academicInfo.text}
                            </p>
                          )}
                          <span className={["mt-2 inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold", statusBadgeClass(booking.status)].join(" ")}>
                            {statusLabel(booking.status)}
                          </span>
                        </div>
                      </div>

                      <div className="min-w-0 text-sm">
                        <p className="font-semibold text-slate-900 dark:text-white">{formatDate(booking.date)}</p>
                        <p className="mt-1 text-slate-500 dark:text-slate-400">{booking.day || getDateDayName(booking.date)}</p>
                        <p className="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                          {formatSlotTime(booking)}
                        </p>
                      </div>

                      <div className="min-w-0 text-sm">
                        <p className="font-semibold text-slate-900 dark:text-white">{booking.topic || "Untitled topic"}</p>
                        {booking.message ? (
                          <p className="mt-2 line-clamp-3 leading-6 text-slate-500 dark:text-slate-400">
                            {booking.message}
                          </p>
                        ) : (
                          <p className="mt-2 text-slate-400 dark:text-slate-500">No student message.</p>
                        )}
                      </div>

                      {isPending ? (
                        <div className="flex flex-wrap gap-2 xl:justify-end">
                          <button
                            type="button"
                            onClick={() => handleBookingAction(booking, "approved")}
                            disabled={isUpdating}
                            className="rounded-2xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBookingAction(booking, "alternate_suggested")}
                            disabled={isUpdating}
                            className="rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300"
                          >
                            Suggest Alternate
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBookingAction(booking, "declined")}
                            disabled={isUpdating}
                            className="rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBooking(booking)}
                            disabled={isUpdating}
                            className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-200 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-rose-300 dark:hover:border-rose-500/30 dark:hover:bg-rose-500/10"
                          >
                            Delete
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2 xl:text-right">
                          {booking.status === "alternate_suggested" && (
                            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                              Alternate: {formatDate(booking.alternateDate)} · {booking.alternateStart || ""}
                              {booking.alternateEnd ? ` - ${booking.alternateEnd}` : ""}
                            </div>
                          )}
                          {booking.teacherMessage && (
                            <p className="rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                              <span className="font-bold text-slate-800 dark:text-slate-100">Your message: </span>
                              {booking.teacherMessage}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteBooking(booking)}
                            disabled={isUpdating}
                            className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
                          >
                            Delete Request
                          </button>
                        </div>
                      )}
                    </div>

                    {isPending && (
                      <div className="border-t border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-950/55">
                        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Message to student <span className="font-medium text-slate-400">(optional)</span>
                            <textarea
                              value={form.teacherMessage || ""}
                              onChange={(e) => updateBookingForm(booking.id, "teacherMessage", e.target.value)}
                              rows={form.alternateOpen ? 3 : 2}
                              placeholder="Write a confirmation note or reason for alternate date."
                              className="mt-1 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-violet-500/20"
                            />
                          </label>

                          {form.alternateOpen && (
                            <>
                              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                Alternate Date
                                <input
                                  type="date"
                                  min={todayString()}
                                  value={form.alternateDate || todayString()}
                                  onClick={(e) => e.currentTarget.showPicker?.()}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    const slots = getAlternateSlots(value);
                                    updateBookingForm(booking.id, "alternateDate", value);
                                    updateBookingForm(booking.id, "alternateSlotId", form.alternateSlotId || slots[0]?.slotId || "");
                                  }}
                                  className="mt-1 w-full cursor-pointer rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-violet-500/20"
                                />
                              </label>

                              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                Alternate Time
                                <select
                                  value={form.alternateSlotId || ""}
                                  onChange={(e) => updateBookingForm(booking.id, "alternateSlotId", e.target.value)}
                                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-violet-500/20"
                                >
                                  {alternateSlots.length === 0 ? (
                                    <option value="">No routine time slots found</option>
                                  ) : (
                                    alternateSlots.map((slot) => (
                                      <option key={`${slot.day}-${slot.slotId}`} value={slot.slotId}>
                                        {formatSlotTime(slot)}
                                      </option>
                                    ))
                                  )}
                                </select>
                              </label>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 2v3M16 2v3" />
      <path d="M3 9h18" />
      <path d="M5 5h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 8v5l3 2" />
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 3h5v5" />
      <path d="M21 3 14 10" />
      <path d="M8 21H3v-5" />
      <path d="M3 21l7-7" />
    </svg>
  );
}

export default TeacherCounsellingPage;
