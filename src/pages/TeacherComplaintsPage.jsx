// client/src/pages/TeacherComplaintsPage.jsx

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchTeacherComplaints, replyTeacherComplaint } from "../services/complaintService";

const STATUS_BADGE_CLASSES = {
  open: "bg-rose-50 text-rose-700 border-rose-200",
  in_review: "bg-amber-50 text-amber-700 border-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const STATUS_LABEL = {
  open: "Open",
  in_review: "In Review",
  resolved: "Resolved",
};

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function safeLower(x) {
  return (x || "").toString().toLowerCase();
}

export default function TeacherComplaintsPage() {
  const navigate = useNavigate();
  const role = localStorage.getItem("marksPortalRole");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [complaints, setComplaints] = useState([]);

  const [statusFilter, setStatusFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // redirect if not teacher
  useEffect(() => {
    if (role !== "teacher") navigate("/login");
  }, [role, navigate]);

  // load complaints
  useEffect(() => {
    if (role !== "teacher") return;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchTeacherComplaints();
        setComplaints(data || []);
      } catch (err) {
        console.error(err);
        setError(err?.response?.data?.message || "Failed to load complaints");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [role]);

  // build course filter options
  const courseOptions = useMemo(() => {
    const map = new Map();
    complaints.forEach((c) => {
      if (c.course) {
        const key = c.course._id || c.course.code;
        const label = `${c.course.code || ""}${c.course.title ? " – " + c.course.title : ""}`;
        if (!map.has(key)) map.set(key, label);
      }
    });
    return Array.from(map.entries());
  }, [complaints]);

  // filter list
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;

      if (courseFilter !== "all" && c.course) {
        const key = c.course._id || c.course.code;
        if (key !== courseFilter) return false;
      }

      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const text = [
          c.student?.name,
          c.student?.roll,
          c.course?.code,
          c.course?.title,
          c.category,
          c.assessment?.name,
          c.message,
          c.reply,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!text.includes(q)) return false;
      }

      return true;
    });
  }, [complaints, statusFilter, courseFilter, search]);

  // stats chips
  const stats = useMemo(() => {
    const total = complaints.length;
    const open = complaints.filter((c) => c.status === "open").length;
    const inReview = complaints.filter((c) => c.status === "in_review").length;
    const resolved = complaints.filter((c) => c.status === "resolved").length;
    return { total, open, inReview, resolved };
  }, [complaints]);

  const handleSelectComplaint = (c) => {
    setSelected(c);
    setReplyDraft(c.reply || "");
  };

  const handleSaveReplyOnly = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await replyTeacherComplaint(selected._id, replyDraft, selected.status);
      setComplaints((prev) => prev.map((c) => (c._id === updated._id ? updated : c)));
      setSelected(updated);
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to save reply. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await replyTeacherComplaint(selected._id, replyDraft, newStatus);
      setComplaints((prev) => prev.map((c) => (c._id === updated._id ? updated : c)));
      setSelected(updated);
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to update complaint. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const selectedBadge =
    STATUS_BADGE_CLASSES[selected?.status] || "bg-slate-50 text-slate-700 border-slate-200";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            <ChatIcon />
            Complaints Center
          </div>
          <h1 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
            Review & Reply
          </h1>
          <p className="mt-1 text-sm text-slate-500 max-w-2xl">
            Track student complaints by course and component, reply clearly, and update status.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatChip label="Total" value={stats.total} />
          <StatChip label="Open" value={stats.open} tone="open" />
          <StatChip label="In Review" value={stats.inReview} tone="in_review" />
          <StatChip label="Resolved" value={stats.resolved} tone="resolved" />

          <button
            onClick={() => navigate("/teacher/dashboard")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeftIcon />
            Dashboard
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Filters</div>
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setCourseFilter("all");
              setSearch("");
            }}
            className="text-xs font-semibold text-slate-600 hover:text-slate-800"
          >
            Reset
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-3">
            <label className="block text-sm font-semibold text-slate-700">Status</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="in_review">In review</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div className="md:col-span-5">
            <label className="block text-sm font-semibold text-slate-700">Course</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
            >
              <option value="all">All courses</option>
              {courseOptions.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-sm font-semibold text-slate-700">Search</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <SearchIcon />
              </span>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="Student, roll, course, component, message..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="font-semibold">Could not load</div>
          <div className="opacity-90">{error}</div>
        </div>
      )}

      {/* Main layout: list + details */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr),minmax(0,1.4fr)] gap-6">
        {/* List */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Complaints</div>
              <div className="text-xs text-slate-500">
                Showing <span className="font-semibold">{filteredComplaints.length}</span> results
              </div>
            </div>
          </div>

          <div className="max-h-[520px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600 sticky top-0">
                <tr className="border-b border-slate-200">
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Course</th>
                  <th className="px-6 py-3">Student</th>
                  <th className="px-6 py-3">Component</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right"></th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredComplaints.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                      No complaints found for the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredComplaints.map((c) => {
                    const badgeClass =
                      STATUS_BADGE_CLASSES[c.status] || "bg-slate-50 text-slate-700 border-slate-200";

                    const isActive = selected?._id === c._id;

                    return (
                      <tr
                        key={c._id}
                        className={[
                          "hover:bg-slate-50 transition",
                          isActive ? "bg-indigo-50/60" : "",
                        ].join(" ")}
                      >
                        <td className="px-6 py-4 text-xs text-slate-500">{formatDate(c.createdAt)}</td>

                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900">{c.course?.code || "—"}</div>
                          <div className="text-xs text-slate-500 line-clamp-1">{c.course?.title || ""}</div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900">{c.student?.name || "Unknown"}</div>
                          <div className="text-xs text-slate-500">{c.student?.roll || ""}</div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="text-sm font-semibold text-slate-800">
                            {c.assessment?.name || c.category || "General"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {c.category ? `Category: ${c.category}` : "—"}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
                            {STATUS_LABEL[c.status] || c.status || "Open"}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleSelectComplaint(c)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            View <ChevronIcon />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Details panel */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Details</div>
            {selected ? (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${selectedBadge}`}>
                {STATUS_LABEL[selected.status] || selected.status || "Open"}
              </span>
            ) : (
              <span className="text-xs text-slate-400">Select a complaint</span>
            )}
          </div>

          <div className="p-6">
            {!selected ? (
              <div className="py-12 text-center">
                <div className="mx-auto h-12 w-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                  <ChatIcon />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-slate-900">No complaint selected</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Choose an item from the list to read the message and reply.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-bold text-slate-900">
                      {selected.course?.code} – {selected.course?.title}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      <span className="font-semibold">{selected.student?.name}</span>{" "}
                      <span className="text-slate-500">({selected.student?.roll})</span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <Pill label={`Section: ${selected.course?.section || "—"}`} />
                      <Pill label={`Component: ${selected.assessment?.name || selected.category || "General"}`} />
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="text-xs font-semibold text-slate-600 mb-2">Student message</div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 whitespace-pre-wrap">
                    {selected.message}
                  </div>
                </div>

                <div className="mt-5">
                  <div className="text-xs font-semibold text-slate-600 mb-2">Your reply (visible to student)</div>
                  <textarea
                    className="w-full min-h-[130px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="Write a clear response about the marks / decision."
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                  />
                  <div className="mt-2 text-xs text-slate-500">
                    Tip: mention the assessment component, marks rule (if any), and your final decision.
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3">
                  <button
                    onClick={handleSaveReplyOnly}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {saving ? (
                      <>
                        <SpinnerIcon /> Saving…
                      </>
                    ) : (
                      <>
                        <SaveIcon /> Save Reply
                      </>
                    )}
                  </button>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                      onClick={() => handleUpdateStatus("in_review")}
                      disabled={saving || selected.status === "in_review"}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                    >
                      <EyeIcon /> Mark In Review
                    </button>

                    <button
                      onClick={() => handleUpdateStatus("resolved")}
                      disabled={saving || selected.status === "resolved"}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      <CheckIcon /> Mark Resolved
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- UI bits ---------------- */

function Pill({ label }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
      {label}
    </span>
  );
}

function StatChip({ label, value, tone }) {
  const cls =
    tone === "open"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : tone === "in_review"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : tone === "resolved"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-slate-50 text-slate-700 border-slate-200";

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${cls}`}>
      <span className="opacity-80">{label}</span>
      <span className="font-bold">{value}</span>
    </span>
  );
}

/* ---------------- Icons ---------------- */

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 21l-4.3-4.3" />
      <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg className="h-4 w-4 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z"
      />
    </svg>
  );
}
