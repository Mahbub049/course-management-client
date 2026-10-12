import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ymd = (year, month, day) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const monthIndex = (value) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
const readable = (value) => {
  if (!value) return "Select recorded date";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
};

/** Native date inputs cannot disable or style arbitrary, nonconsecutive dates. */
export default function AttendanceSessionDatePicker({ value, onChange, sessions = [], disabled, placeholder = "Select recorded date" }) {
  const anchorRef = useRef(null);
  const pickerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const dates = useMemo(() => {
    const map = new Map();
    sessions.forEach((s) => {
      if (!s.date) return;
      if (!map.has(s.date)) map.set(s.date, new Set());
      map.get(s.date).add(Number(s.period));
    });
    return map;
  }, [sessions]);
  const sortedDates = useMemo(() => [...dates.keys()].sort(), [dates]);
  const latestDate = sortedDates[sortedDates.length - 1] || "";
  const [month, setMonth] = useState(() => monthIndex(new Date().toISOString().slice(0, 10)));
  const lowerMonth = sortedDates.length ? monthIndex(sortedDates[0]) : month;
  const upperMonth = sortedDates.length ? monthIndex(latestDate) : month;

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(326, window.innerWidth - 24);
      const height = 367;
      setPosition({
        top: rect.bottom + 8 + height > window.innerHeight && rect.top > height
          ? rect.top - height - 8 : Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - height - 8)),
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      });
    };
    const handleOutside = (event) => {
      if (!anchorRef.current?.contains(event.target) && !pickerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKey = (event) => { if (event.key === "Escape") setOpen(false); };
    const handleScroll = (event) => {
      if (!pickerRef.current?.contains(event.target)) setOpen(false);
    };
    place();
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  const year = Math.floor(month / 12);
  const monthNumber = month % 12;
  const firstWeekday = new Date(Date.UTC(year, monthNumber, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber + 1, 0)).getUTCDate();
  const days = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, i) => {
    const day = i - firstWeekday + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  const monthLabel = new Date(Date.UTC(year, monthNumber, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const monthCount = days.filter((day) => day && dates.has(ymd(year, monthNumber, day))).length;

  return (
    <>
      <button ref={anchorRef} type="button" disabled={disabled || !dates.size} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => {
          if (!open) setMonth(monthIndex((value && dates.has(value) ? value : latestDate) || new Date().toISOString().slice(0, 10)));
          setOpen((wasOpen) => !wasOpen);
        }}
        className="flex min-h-[42px] w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-left text-sm text-slate-800 outline-none transition hover:border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-indigo-500">
        <span className={value ? "font-medium" : "text-slate-400 dark:text-slate-500"}>{value ? readable(value) : placeholder}</span>
        <svg className="h-4 w-4 shrink-0 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>
      </button>
      {open && createPortal(
        <div ref={pickerRef} role="dialog" aria-label="Recorded attendance dates" style={{ top: position.top, left: position.left, width: "min(326px, calc(100vw - 24px))" }}
          className="fixed z-[300] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xl shadow-slate-950/20 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/50">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button type="button" title="Previous month" aria-label="Previous month" disabled={month <= lowerMonth} onClick={() => setMonth((m) => m - 1)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-25 dark:text-slate-300 dark:hover:bg-slate-800">‹</button>
            <div className="text-center"><div className="text-sm font-bold text-slate-900 dark:text-white">{monthLabel}</div><div className="text-[11px] text-slate-500 dark:text-slate-400">{monthCount} recorded {monthCount === 1 ? "day" : "days"}</div></div>
            <button type="button" title="Next month" aria-label="Next month" disabled={month >= upperMonth} onClick={() => setMonth((m) => m + 1)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-25 dark:text-slate-300 dark:hover:bg-slate-800">›</button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <span key={d} className="py-1">{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              const key = day ? ymd(year, monthNumber, day) : "";
              const enabled = day && dates.has(key);
              const selected = key && key === value;
              return <button key={`${index}-${key}`} type="button" disabled={!enabled} title={enabled ? `${dates.get(key).size} recorded ${dates.get(key).size === 1 ? "period" : "periods"}` : day ? "No attendance recorded" : undefined}
                onClick={() => { onChange(key); setOpen(false); }}
                className={`relative flex h-9 items-center justify-center rounded-lg text-xs font-semibold transition ${selected ? "bg-indigo-600 text-white shadow-sm" : enabled ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-200 dark:hover:bg-indigo-500/25" : "cursor-not-allowed text-slate-300 dark:text-slate-600"}`}>
                {day || ""}
                {enabled && !selected && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-indigo-500 dark:bg-indigo-300" />}
              </button>;
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] dark:border-slate-800">
            <span className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300"><span className="h-2 w-2 rounded bg-indigo-500"/> Recorded</span>
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span className="h-2 w-2 rounded bg-slate-300 dark:bg-slate-600"/> Not recorded · disabled</span>
          </div>
        </div>, document.body)}
    </>
  );
}
