// client/src/pages/StudentComplaintsPage.jsx

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createStudentComplaint,
  fetchStudentComplaints,
} from "../services/complaintService";
import { fetchStudentCourses } from "../services/studentService";

const STATUS_BADGE_CLASSES = {
  open: "bg-red-50 text-red-700 border-red-200",
  in_review: "bg-amber-50 text-amber-700 border-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

// ✅ General-only category badge
const CATEGORY_BADGE_CLASSES = {
  general: "bg-slate-50 text-slate-700 border-slate-200",
};

function formatDateGB(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function StudentComplaintsPage() {
  const navigate = useNavigate();
  const role = localStorage.getItem("marksPortalRole");

  // complaints
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [complaints, setComplaints] = useState([]);

  // course list for form
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState("");
  const [courses, setCourses] = useState([]);

  // general complaint form state
  const [formCourseId, setFormCourseId] = useState("");
  const [message, setMessage] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  // filters + selection
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (role !== "student") navigate("/login");
  }, [role, navigate]);

  const loadComplaints = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchStudentComplaints();
      setComplaints(data || []);
      // keep selection valid (if list changed)
      setSelected((prev) => {
        if (!prev) return null;
        const stillExists = (data || []).find((c) => c._id === prev._id);
        return stillExists || null;
      });
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load your complaints");
    } finally {
      setLoading(false);
    }
  };

  const loadCourses = async () => {
    setCoursesLoading(true);
    setCoursesError("");
    try {
      const data = await fetchStudentCourses();
      setCourses(Array.isArray(data) ? data : []);

      // auto-select first course if none selected
      if (!formCourseId && Array.isArray(data) && data.length > 0) {
        setFormCourseId(data[0]._id);
      }
    } catch (err) {
      console.error(err);
      setCoursesError(err?.response?.data?.message || "Failed to load your courses");
    } finally {
      setCoursesLoading(false);
    }
  };

  useEffect(() => {
    if (role !== "student") return;
    loadComplaints();
    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const stats = useMemo(() => {
    let open = 0,
      inReview = 0,
      resolved = 0;

    complaints.forEach((c) => {
      if (c.status === "resolved") resolved += 1;
      else if (c.status === "in_review") inReview += 1;
      else open += 1;
    });

    return { total: complaints.length, open, inReview, resolved };
  }, [complaints]);

  // ✅ Simplified search: general-only, but still search course/title/message/reply/status
  const filtered = useMemo(() => {
    return complaints.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const blob = [
          c.category,
          c.course?.code,
          c.course?.title,
          c.message,
          c.reply,
          c.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!blob.includes(q)) return false;
      }

      return true;
    });
  }, [complaints, statusFilter, search]);

  const handleSubmitGeneralComplaint = async (e) => {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    if (!formCourseId) {
      setSubmitError("Please select a course.");
      return;
    }

    if (!message.trim()) {
      setSubmitError("Please write a short description of the issue.");
      return;
    }

    try {
      setSubmitLoading(true);

      const payload = {
        courseId: formCourseId,
        category: "general",
        message: message.trim(),
      };

      await createStudentComplaint(payload);

      setSubmitSuccess("Your general complaint has been submitted.");
      setMessage("");

      // refresh list
      await loadComplaints();

      // optional: show latest complaint in details automatically
      setSelected(null);
    } catch (err) {
      console.error(err);
      setSubmitError(err?.response?.data?.message || "Failed to submit complaint.");
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            <ChatIcon />
            Complaints
          </div>

          <h1 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
            My Complaints
          </h1>
          <p className="mt-1 text-sm text-slate-500 max-w-2xl">
            Submit a general issue and track teacher replies here.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => navigate("/student/dashboard")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeftIcon />
            Back to My Courses
          </button>
        </div>
      </div>

      {/* ✅ NEW: General Complaint Form */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Raise a General Complaint</h2>
            <p className="text-xs text-slate-500">
              Use this for any general course-related issue (not marks/attendance).
            </p>
          </div>

          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            <ShieldIcon /> Student Request
          </span>
        </div>

        <div className="p-5 space-y-4">
          {(submitError || submitSuccess) && (
            <div
              className={[
                "rounded-2xl border px-5 py-4 text-sm",
                submitError
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700",
              ].join(" ")}
            >
              <div className="font-semibold">
                {submitError ? "Could not submit" : "Submitted"}
              </div>
              <div className="opacity-90">{submitError || submitSuccess}</div>
            </div>
          )}

          {coursesError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
              <div className="font-semibold">Could not load courses</div>
              <div className="opacity-90">{coursesError}</div>
            </div>
          )}

          <form onSubmit={handleSubmitGeneralComplaint} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Course */}
              <div className="lg:col-span-4">
                <label className="block text-sm font-semibold text-slate-700">Course</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50"
                  value={formCourseId}
                  onChange={(e) => {
                    setFormCourseId(e.target.value);
                    setSubmitError("");
                    setSubmitSuccess("");
                  }}
                  disabled={coursesLoading || !courses.length}
                >
                  {coursesLoading ? (
                    <option value="">Loading courses…</option>
                  ) : courses.length === 0 ? (
                    <option value="">No courses found</option>
                  ) : (
                    courses.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.code} — {c.title}
                      </option>
                    ))
                  )}
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  Select the course related to your issue.
                </p>
              </div>

              {/* Message */}
              <div className="lg:col-span-8">
                <label className="block text-sm font-semibold text-slate-700">Your message</label>
                <textarea
                  rows={4}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Example: Assessment not visible yet / marks policy unclear / any general course issue."
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    setSubmitError("");
                    setSubmitSuccess("");
                  }}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Keep it short and specific.
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitLoading || coursesLoading || !courses.length}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
              >
                {submitLoading ? (
                  <>
                    <SpinnerIcon /> Submitting…
                  </>
                ) : (
                  <>
                    <SendIcon /> Submit General Complaint
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Open" value={stats.open} />
        <StatCard label="In review" value={stats.inReview} />
        <StatCard label="Resolved" value={stats.resolved} />
      </div>

      {/* Error / Loading */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          <div className="font-semibold">Could not load complaints</div>
          <div className="opacity-90">{error}</div>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="w-full md:w-56">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Status
            </label>
            <select
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="in_review">In review</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Search
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <SearchIcon />
              </span>
              <input
                type="text"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-800 outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="Search by course, message, reply, status…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="md:pl-2">
            <div className="text-xs text-slate-500">
              Showing{" "}
              <span className="font-semibold text-slate-700">{filtered.length}</span>{" "}
              of{" "}
              <span className="font-semibold text-slate-700">{complaints.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main layout: list + details */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr),minmax(0,1.3fr)] gap-6">
        {/* List */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Complaints</h2>
              <p className="text-xs text-slate-500">
                Tap a row to see details and the teacher reply.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="px-5 py-6 text-sm text-slate-500">Loading complaints…</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                <EmptyIcon />
              </div>
              <div className="text-sm font-semibold text-slate-900">
                No complaints found
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Try changing filters or search text.
              </div>
            </div>
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Course</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const badgeClass =
                      STATUS_BADGE_CLASSES[c.status] ||
                      "bg-slate-50 text-slate-700 border-slate-200";

                    const catBadge =
                      CATEGORY_BADGE_CLASSES.general ||
                      "bg-slate-50 text-slate-700 border-slate-200";

                    const isSelected = selected?._id === c._id;

                    return (
                      <tr
                        key={c._id}
                        className={[
                          "border-t border-slate-100 align-top hover:bg-slate-50/60 cursor-pointer",
                          isSelected ? "bg-indigo-50/40" : "",
                        ].join(" ")}
                        onClick={() => setSelected(c)}
                      >
                        <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {formatDateGB(c.createdAt)}
                        </td>

                        <td className="px-5 py-3">
                          <div className="font-semibold text-slate-900">
                            {c.course?.code || "—"}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {c.course?.title || "—"}
                          </div>
                        </td>

                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${catBadge}`}
                          >
                            General
                          </span>
                        </td>

                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${badgeClass}`}
                          >
                            {c.status || "open"}
                          </span>
                        </td>

                        <td className="px-5 py-3 text-right">
                          <span className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700">
                            View <ChevronRightIcon />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-center text-sm text-slate-400">
              Select a complaint from the left list to view full details.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">
                    {formatDateGB(selected.createdAt)}
                  </div>

                  <div className="mt-1 text-sm font-bold text-slate-900 truncate">
                    {selected.course?.code || "—"} – {selected.course?.title || "—"}
                  </div>

                  <div className="mt-1 text-xs text-slate-600">
                    Type:{" "}
                    <span className="font-semibold text-slate-800">General</span>
                  </div>
                </div>

                <span
                  className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${
                    STATUS_BADGE_CLASSES[selected.status] ||
                    "bg-slate-50 text-slate-700 border-slate-200"
                  }`}
                >
                  {selected.status || "open"}
                </span>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">
                  Your message
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 whitespace-pre-wrap">
                  {selected.message}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">
                  Teacher reply
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 whitespace-pre-wrap">
                  {selected.reply ? (
                    selected.reply
                  ) : (
                    <span className="text-slate-400">No reply yet</span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold text-slate-600">Tip</div>
                <div className="mt-1 text-xs text-slate-500">
                  If your complaint is marked <b>In review</b>, it means the teacher is checking.
                  When marked <b>Resolved</b>, the final decision has been updated.
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate("/student/dashboard")}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeftIcon />
                Back to My Courses
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Small UI pieces ---------------- */

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-extrabold text-slate-900">{value}</div>
    </div>
  );
}

/* ---------------- Icons ---------------- */

function ChatIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg className="h-6 w-6 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      className="h-4 w-4 text-slate-700"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
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
