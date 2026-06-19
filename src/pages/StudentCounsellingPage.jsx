import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import {
  createStudentCounsellingBooking,
  deleteStudentCounsellingBooking,
  getStudentCounsellingInfo,
} from "../services/routineService";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function addDaysString(dateString, daysToAdd) {
  const match = String(dateString || todayString()).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const baseDate = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : new Date();

  baseDate.setUTCDate(baseDate.getUTCDate() + daysToAdd);
  return baseDate.toISOString().slice(0, 10);
}

function hasSlotForDate(slots = [], dateString) {
  const day = getDateDayName(dateString);
  return slots.some((slot) => slot.day === day);
}

function getNextAvailableDate(slots = [], fromDate = todayString()) {
  if (!slots.length) return "";

  for (let i = 0; i < 35; i += 1) {
    const candidate = addDaysString(fromDate, i);
    if (hasSlotForDate(slots, candidate)) return candidate;
  }

  return "";
}

function formatDisplayDate(dateString) {
  if (!dateString) return "—";
  const match = String(dateString).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateString;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatSlot(slot) {
  const startEnd = [slot?.start, slot?.end].filter(Boolean).join(" - ");
  if (startEnd) return startEnd;
  return String(slot?.slotLabel || "").replace(/\n/g, " ");
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

function statusClass(status) {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
  if (status === "alternate_suggested") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300";
  if (status === "declined") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300";
  return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300";
}

function groupSlotsByDay(slots = []) {
  const groups = {};
  slots.forEach((slot) => {
    if (!groups[slot.day]) groups[slot.day] = [];
    groups[slot.day].push(slot);
  });
  return DAY_NAMES.filter((day) => groups[day]?.length).map((day) => ({
    day,
    slots: groups[day],
  }));
}

function StudentCounsellingPage() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    date: todayString(),
    slotId: "",
    topic: "",
    message: "",
  });
  const dateInputRef = useRef(null);
  const weeklyHoursRef = useRef(null);
  const requestBookingRef = useRef(null);
  const myRequestsRef = useRef(null);

  const counsellingSlots = info?.counsellingSlots || [];
  const bookings = info?.bookings || [];

  const selectedDay = useMemo(() => getDateDayName(form.date), [form.date]);

  const availableSlotsForDate = useMemo(() => {
    return counsellingSlots.filter((slot) => slot.day === selectedDay);
  }, [counsellingSlots, selectedDay]);

  const weeklyGroups = useMemo(
    () => groupSlotsByDay(counsellingSlots),
    [counsellingSlots]
  );

  const nextAvailableDate = useMemo(
    () => getNextAvailableDate(counsellingSlots, todayString()),
    [counsellingSlots]
  );

  const nextAvailableDay = nextAvailableDate ? getDateDayName(nextAvailableDate) : "";
  const nextAvailableSlot = counsellingSlots.find((slot) => slot.day === nextAvailableDay);
  const isSelectedDateAvailable = availableSlotsForDate.length > 0;

  const requestCounts = useMemo(() => {
    return bookings.reduce(
      (acc, booking) => {
        acc.total += 1;
        acc[booking.status] = (acc[booking.status] || 0) + 1;
        return acc;
      },
      { total: 0, pending: 0, approved: 0, alternate_suggested: 0, declined: 0 }
    );
  }, [bookings]);

  const loadInfo = async () => {
    try {
      setLoading(true);
      const data = await getStudentCounsellingInfo();
      const slots = data?.counsellingSlots || [];
      const currentDate = form.date || todayString();
      const targetDate = hasSlotForDate(slots, currentDate)
        ? currentDate
        : getNextAvailableDate(slots, currentDate) || currentDate;
      const targetDay = getDateDayName(targetDate);
      const firstSlot = slots.find((slot) => slot.day === targetDay);

      setInfo(data);
      setForm((prev) => ({
        ...prev,
        date: targetDate,
        slotId: firstSlot?.slotId || "",
      }));
    } catch (err) {
      console.error(err);
      Swal.fire("Failed", err?.response?.data?.message || "Could not load counselling information", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!availableSlotsForDate.some((slot) => slot.slotId === form.slotId)) {
      setForm((prev) => ({
        ...prev,
        slotId: availableSlotsForDate[0]?.slotId || "",
      }));
    }
  }, [availableSlotsForDate, form.slotId]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const openDatePicker = () => {
    const picker = dateInputRef.current;
    if (!picker) return;

    try {
      if (typeof picker.showPicker === "function") {
        picker.showPicker();
      } else {
        picker.focus();
      }
    } catch (err) {
      picker.focus();
    }
  };

  const scrollToSection = (sectionRef) => {
    sectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const selectNextAvailableDate = () => {
    if (!nextAvailableDate) return;
    const day = getDateDayName(nextAvailableDate);
    const firstSlot = counsellingSlots.find((slot) => slot.day === day);
    setForm((prev) => ({
      ...prev,
      date: nextAvailableDate,
      slotId: firstSlot?.slotId || "",
    }));
  };

  const handleDeleteBooking = async (booking) => {
    if (!booking?.id || booking.status !== "pending") return;

    const result = await Swal.fire({
      title: "Delete pending request?",
      text: "This counselling request will be removed from your list.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) return;

    try {
      await deleteStudentCounsellingBooking(booking.id);
      Swal.fire("Deleted", "Your pending counselling request has been deleted.", "success");
      await loadInfo();
    } catch (err) {
      console.error(err);
      Swal.fire("Failed", err?.response?.data?.message || "Could not delete this request", "error");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.date || !form.slotId || !form.topic.trim()) {
      Swal.fire("Missing Information", "Please select date, time slot and write a topic.", "warning");
      return;
    }

    try {
      setSubmitting(true);
      await createStudentCounsellingBooking({
        date: form.date,
        slotId: form.slotId,
        topic: form.topic,
        message: form.message,
      });

      Swal.fire("Submitted", "Your counselling request has been submitted.", "success");
      setForm((prev) => ({ ...prev, topic: "", message: "" }));
      await loadInfo();
    } catch (err) {
      console.error(err);
      Swal.fire("Failed", err?.response?.data?.message || "Could not submit counselling request", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-base font-bold text-slate-500 dark:text-slate-400">
        Loading counselling hours...
      </div>
    );
  }

  if (!info?.teacher) {
    return (
      <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-950">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">
          No course teacher found
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
          You need to be enrolled in a course before counselling hours can be shown here.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="relative px-5 py-4 sm:px-6">
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-sky-500/10" />

          <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  Counselling
                </h1>
                <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                  {counsellingSlots.length} weekly slot{counsellingSlots.length === 1 ? "" : "s"}
                </span>
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-black text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
                  {bookings.length} request{bookings.length === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-1 hidden text-sm leading-6 text-slate-600 dark:text-slate-400 md:block">
                Choose a date from your teacher’s available weekly hours and submit your topic.
              </p>
            </div>

            <div className="hidden flex-col gap-3 md:flex md:flex-row md:items-center xl:justify-end">
              {nextAvailableDate && nextAvailableSlot && (
                <button
                  type="button"
                  onClick={selectNextAvailableDate}
                  className="rounded-2xl border border-violet-200 bg-white/85 px-4 py-3 text-left shadow-sm transition hover:border-violet-300 hover:bg-violet-50 dark:border-violet-500/20 dark:bg-slate-900/80 dark:hover:bg-violet-500/10"
                >
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Next available
                  </p>
                  <p className="text-sm font-black text-slate-900 dark:text-white">
                    {formatDisplayDate(nextAvailableDate)} · {nextAvailableDay} · {formatSlot(nextAvailableSlot)}
                  </p>
                </button>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white/85 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 sm:min-w-[18rem]">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-lg font-black text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {info.teacher.profileImage ? (
                      <img src={info.teacher.profileImage} alt="Teacher" className="h-full w-full object-cover" />
                    ) : (
                      info.teacher.name?.charAt(0) || "T"
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                      {info.teacher.name || "Course Teacher"}
                    </p>
                    <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {info.teacher.designation || "Teacher"}{info.teacher.department ? ` · ${info.teacher.department}` : ""}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 md:hidden">
              <button
                type="button"
                onClick={() => scrollToSection(weeklyHoursRef)}
                className="rounded-2xl border border-violet-500/20 bg-violet-500/10 px-2 py-3 text-center text-[11px] font-black text-violet-700 transition hover:bg-violet-500/15 dark:text-violet-200"
              >
                Weekly Hours
              </button>
              <button
                type="button"
                onClick={() => scrollToSection(requestBookingRef)}
                className="rounded-2xl border border-sky-500/20 bg-sky-500/10 px-2 py-3 text-center text-[11px] font-black text-sky-700 transition hover:bg-sky-500/15 dark:text-sky-200"
              >
                Request Booking
              </button>
              <button
                type="button"
                onClick={() => scrollToSection(myRequestsRef)}
                className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-2 py-3 text-center text-[11px] font-black text-emerald-700 transition hover:bg-emerald-500/15 dark:text-emerald-200"
              >
                My Requests
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.12fr_1fr]">
        <div
          ref={weeklyHoursRef}
          className="scroll-mt-24 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                Weekly hours
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Set by your course teacher.
              </p>
            </div>
            <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-black text-slate-600 dark:border-slate-700 dark:text-slate-300">
              {weeklyGroups.length} day{weeklyGroups.length === 1 ? "" : "s"}
            </span>
          </div>

          {weeklyGroups.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-5 text-center dark:border-slate-700">
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                Counselling hours have not been set yet.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {weeklyGroups.map((group) => (
                <div
                  key={group.day}
                  className={["rounded-2xl border p-3 transition", group.day === selectedDay
                    ? "border-violet-300 bg-violet-50 dark:border-violet-500/30 dark:bg-violet-500/10"
                    : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-black text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white">
                      {group.day}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      {group.slots.map((slot) => (
                        <button
                          type="button"
                          key={`${slot.day}-${slot.slotId}`}
                          onClick={() => {
                            const chosenDate = getNextAvailableDate([slot], todayString());
                            setForm((prev) => ({
                              ...prev,
                              date: chosenDate || prev.date,
                              slotId: slot.slotId,
                            }));
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-black text-slate-700 transition hover:border-violet-300 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-violet-500/50 dark:hover:text-violet-200"
                        >
                          {formatSlot(slot)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <form
          ref={requestBookingRef}
          onSubmit={handleSubmit}
          className="scroll-mt-24 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                Request booking
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Select date, slot and topic.
              </p>
            </div>
            <span className={["rounded-full border px-3 py-1 text-xs font-black", isSelectedDateAvailable
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
            ].join(" ")}
            >
              {isSelectedDateAvailable ? `${selectedDay} available` : `${selectedDay || "Date"} unavailable`}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="block text-xs font-bold text-slate-600 dark:text-slate-300">
              Date
              <div
                role="button"
                tabIndex={0}
                onClick={openDatePicker}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openDatePicker();
                  }
                }}
                className="mt-1 flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 transition focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 hover:border-violet-300 dark:border-slate-700 dark:bg-slate-950 dark:focus-within:ring-violet-500/20 dark:hover:border-violet-500/50"
              >
                <input
                  ref={dateInputRef}
                  type="date"
                  min={todayString()}
                  value={form.date}
                  onClick={openDatePicker}
                  onChange={(e) => updateField("date", e.target.value)}
                  className="w-full cursor-pointer bg-transparent text-sm font-semibold text-slate-800 outline-none dark:text-slate-100"
                />
              </div>
            </div>

            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
              Time Slot
              <select
                value={form.slotId}
                onChange={(e) => updateField("slotId", e.target.value)}
                disabled={availableSlotsForDate.length === 0}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-violet-500/20"
              >
                {availableSlotsForDate.length === 0 ? (
                  <option value="">No slot on this date</option>
                ) : (
                  availableSlotsForDate.map((slot) => (
                    <option key={`${slot.day}-${slot.slotId}`} value={slot.slotId}>
                      {formatSlot(slot)}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          {!isSelectedDateAvailable && nextAvailableDate && (
            <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
              <span>
                No slot on {selectedDay}. Next available: {formatDisplayDate(nextAvailableDate)} ({nextAvailableDay}).
              </span>
              <button
                type="button"
                onClick={selectNextAvailableDate}
                className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-black text-white transition hover:bg-amber-700"
              >
                Use it
              </button>
            </div>
          )}

          <label className="mt-3 block text-xs font-bold text-slate-600 dark:text-slate-300">
            Topic
            <input
              value={form.topic}
              onChange={(e) => updateField("topic", e.target.value)}
              maxLength={160}
              placeholder="Example: marks discussion, project issue, academic guidance"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-violet-500/20"
            />
          </label>

          <label className="mt-3 block text-xs font-bold text-slate-600 dark:text-slate-300">
            Message <span className="font-semibold text-slate-400">(optional)</span>
            <textarea
              value={form.message}
              onChange={(e) => updateField("message", e.target.value)}
              rows={3}
              maxLength={1200}
              placeholder="Add any detail the teacher should know."
              className="mt-1 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-violet-500/20"
            />
          </label>

          <button
            type="submit"
            disabled={submitting || availableSlotsForDate.length === 0}
            className="mt-4 w-full rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit Request"}
          </button>
        </form>

        <div
          ref={myRequestsRef}
          className="scroll-mt-24 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                My requests
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Status and teacher response.
              </p>
            </div>
            <div className="flex gap-1.5">
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-black text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
                P {requestCounts.pending || 0}
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                A {requestCounts.approved || 0}
              </span>
            </div>
          </div>

          {!bookings.length ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-5 text-center dark:border-slate-700">
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                No counselling request yet.
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                Submit a request from the form.
              </p>
            </div>
          ) : (
            <div className="mt-4 max-h-[31rem] space-y-3 overflow-y-auto pr-1">
              {bookings.map((booking) => (
                <div key={booking.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/70">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                        {booking.topic}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                        {formatDisplayDate(booking.date)} · {booking.day} · {formatSlot(booking)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className={["rounded-full border px-2.5 py-1 text-[10px] font-black", statusClass(booking.status)].join(" ")}>{statusLabel(booking.status)}</span>
                      {booking.status === "pending" && (
                        <button
                          type="button"
                          onClick={() => handleDeleteBooking(booking)}
                          className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-black text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                          title="Delete pending request"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>

                  {booking.message && (
                    <p className="mt-2 line-clamp-2 rounded-xl border border-slate-200 bg-white p-2 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                      {booking.message}
                    </p>
                  )}

                  {booking.status === "alternate_suggested" && (
                    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                      Alternate: {formatDisplayDate(booking.alternateDate)} ({booking.alternateDay}) · {booking.alternateStart || formatSlot({ slotLabel: booking.alternateSlotLabel })}{booking.alternateEnd ? ` - ${booking.alternateEnd}` : ""}
                    </div>
                  )}

                  {booking.teacherMessage && (
                    <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                      <span className="font-black text-slate-800 dark:text-slate-100">Teacher: </span>
                      {booking.teacherMessage}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default StudentCounsellingPage;
