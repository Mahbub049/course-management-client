// client/src/pages/StudentComplaintsPage.jsx

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createStudentComplaint,
  fetchStudentComplaints,
} from "../services/complaintService";
import { fetchStudentCourses } from "../services/studentService";

const STATUS_BADGE_CLASSES = {
  open:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
  in_review:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  resolved:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  rejected:
    "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const CATEGORY_BADGE_CLASSES = {
  general:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [complaints, setComplaints] = useState([]);

  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState("");
  const [courses, setCourses] = useState([]);

  const [formCourseId, setFormCourseId] = useState("");
  const [message, setMessage] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

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
      const safeCourses = Array.isArray(data) ? data : [];
      setCourses(safeCourses);

      if (!formCourseId && safeCourses.length > 0) {
        setFormCourseId(safeCourses[0]._id || safeCourses[0].id || "");
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
    let open = 0;
    let inReview = 0;
    let resolved = 0;
    let rejected = 0;

    complaints.forEach((c) => {
      if (c.status === "resolved") resolved += 1;
      else if (c.status === "in_review") inReview += 1;
      else if (c.status === "rejected") rejected += 1;
      else open += 1;
    });

    return { total: complaints.length, open, inReview, resolved, rejected };
  }, [complaints]);

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

      await createStudentComplaint({
        courseId: formCourseId,
        category: "general",
        message: message.trim(),
      });

      setSubmitSuccess("Your general complaint has been submitted.");
      setMessage("");
      await loadComplaints();
      setSelected(null);
    } catch (err) {
      console.error(err);
      setSubmitError(err?.response?.data?.message || "Failed to submit complaint.");
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="mx-auto space-y-6 px-4 pb-8 pt-4 sm:px-6 lg:px-0">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-indigo-50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30 sm:p-6">
        <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-600/20" />
        <div className="absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-600/20" />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 backdrop-blur dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200">
              <ChatIcon />
              Complaints
            </div>

            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white md:text-3xl">
              My Complaints
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              Submit general course issues and track teacher replies from one place.
            </p>
          </div>

          <button
            onClick={() => navigate("/student/dashboard")}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeftIcon />
            Back to My Courses
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Raise a General Complaint
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Use this for course-related issues except direct marks or attendance changes.
              </p>
            </div>

            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <ShieldIcon />
              Student Request
            </span>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {(submitError || submitSuccess) && (
            <div
              className={[
                "mb-4 rounded-2xl border px-4 py-4 text-sm",
                submitError
                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
              ].join(" ")}
            >
              <div className="font-semibold">
                {submitError ? "Could not submit" : "Submitted"}
              </div>
              <div className="opacity-90">{submitError || submitSuccess}</div>
            </div>
          )}

          {coursesError && (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              <div className="font-semibold">Could not load courses</div>
              <div className="opacity-90">{coursesError}</div>
            </div>
          )}

          <form onSubmit={handleSubmitGeneralComplaint} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <div className="xl:col-span-4">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Course
                </label>
                <select
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-800"
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
                      <option key={c._id || c.id} value={c._id || c.id}>
                        {c.code} — {c.title}
                      </option>
                    ))
                  )}
                </select>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Select the course related to your issue.
                </p>
              </div>

              <div className="xl:col-span-8">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Your message
                </label>
                <textarea
                  rows={5}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="Example: assessment is not visible yet, classroom notice is unclear, course information mismatch, or another general issue."
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    setSubmitError("");
                    setSubmitSuccess("");
                  }}
                />
                <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">
                    Keep it short, polite, and specific.
                  </span>
                  <span className="font-medium text-slate-400 dark:text-slate-500">
                    {message.trim().length} chars
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitLoading || coursesLoading || !courses.length}
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitLoading ? (
                  <>
                    <SpinnerIcon />
                    Submitting…
                  </>
                ) : (
                  <>
                    <SendIcon />
                    Submit General Complaint
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Open" value={stats.open} />
        <StatCard label="In review" value={stats.inReview} />
        <StatCard label="Resolved" value={stats.resolved} />
        <StatCard label="Rejected" value={stats.rejected} />
      </section>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <div className="font-semibold">Could not load complaints</div>
          <div className="opacity-90">{error}</div>
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="w-full lg:w-56">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
              Status
            </label>
            <select
              className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="in_review">In review</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
              Search
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                <SearchIcon />
              </span>
              <input
                type="text"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
                placeholder="Search by course, message, reply, status…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 lg:pb-3">
            Showing{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{filtered.length}</span>{" "}
            of{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{complaints.length}</span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr),minmax(340px,1fr)]">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Complaints</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select a complaint to view full details and teacher reply.
            </p>
          </div>

          {loading ? (
            <div className="space-y-3 p-5 sm:p-6">
              <ComplaintSkeleton />
              <ComplaintSkeleton />
              <ComplaintSkeleton />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-12 text-center sm:px-6">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                <EmptyIcon />
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                No complaints found
              </div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Try changing the filter or search text.
              </div>
            </div>
          ) : (
            <>
              <div className="hidden lg:block max-h-[650px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                    <tr>
                      <th className="px-5 py-3 sm:px-6">Date</th>
                      <th className="px-5 py-3">Course</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right sm:px-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => {
                      const isSelected = selected?._id === c._id;
                      const badgeClass =
                        STATUS_BADGE_CLASSES[c.status] ||
                        "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300";

                      return (
                        <tr
                          key={c._id}
                          onClick={() => setSelected(c)}
                          className={[
                            "cursor-pointer border-t border-slate-100 align-top transition hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/50",
                            isSelected ? "bg-indigo-50/50 dark:bg-indigo-500/10" : "",
                          ].join(" ")}
                        >
                          <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500 dark:text-slate-400 sm:px-6">
                            {formatDateGB(c.createdAt)}
                          </td>

                          <td className="px-5 py-4">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {c.course?.code || "—"}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {c.course?.title || "—"}
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${CATEGORY_BADGE_CLASSES.general}`}
                            >
                              General
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${badgeClass}`}
                            >
                              {(c.status || "open").replace("_", " ")}
                            </span>
                          </td>

                          <td className="px-5 py-4 text-right sm:px-6">
                            <span className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                              View
                              <ChevronRightIcon />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 p-4 lg:hidden">
                {filtered.map((c) => {
                  const isSelected = selected?._id === c._id;
                  const badgeClass =
                    STATUS_BADGE_CLASSES[c.status] ||
                    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300";

                  return (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => setSelected(c)}
                      className={[
                        "rounded-2xl border p-4 text-left transition",
                        isSelected
                          ? "border-indigo-300 bg-indigo-50/60 dark:border-indigo-500/40 dark:bg-indigo-500/10"
                          : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800/70",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDateGB(c.createdAt)}
                          </div>
                          <div className="mt-1 font-semibold text-slate-900 dark:text-white">
                            {c.course?.code || "—"}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {c.course?.title || "—"}
                          </div>
                        </div>

                        <span
                          className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${badgeClass}`}
                        >
                          {(c.status || "open").replace("_", " ")}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${CATEGORY_BADGE_CLASSES.general}`}
                        >
                          General
                        </span>
                        <span className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                          View details
                          <ChevronRightIcon />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Complaint Details</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Full message, reply, and current status.
            </p>
          </div>

          <div className="p-5 sm:p-6">
            {!selected ? (
              <div className="flex min-h-[320px] items-center justify-center text-center text-sm text-slate-400 dark:text-slate-500">
                Select a complaint from the list to view full details.
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDateGB(selected.createdAt)}
                    </div>

                    <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                      {selected.course?.code || "—"} – {selected.course?.title || "—"}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${CATEGORY_BADGE_CLASSES.general}`}
                      >
                        General
                      </span>

                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${
                          STATUS_BADGE_CLASSES[selected.status] ||
                          "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {(selected.status || "open").replace("_", " ")}
                      </span>
                    </div>
                  </div>
                </div>

                <DetailBlock title="Your message">
                  {selected.message}
                </DetailBlock>

                <DetailBlock title="Teacher reply" emphasis={!selected.reply}>
                  {selected.reply || "No reply yet"}
                </DetailBlock>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-800/80">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Status guide
                  </div>
                  <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Open</span> means it has been submitted.
                    {" "}
                    <span className="font-semibold text-slate-700 dark:text-slate-200">In review</span> means the teacher is checking it.
                    {" "}
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Resolved</span> means the issue has been addressed.
                    {" "}
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Rejected</span> means it was reviewed but not accepted.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => navigate("/student/dashboard")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <ArrowLeftIcon />
                  Back to My Courses
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-extrabold text-slate-900 dark:text-white">{value}</div>
    </div>
  );
}

function DetailBlock({ title, children, emphasis = false }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
        {title}
      </div>
      <div
        className={[
          "rounded-2xl border px-4 py-4 text-sm whitespace-pre-wrap",
          emphasis
            ? "border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
            : "border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}

function ComplaintSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-3 h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-2 h-3 w-48 rounded bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}

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
    <svg className="h-6 w-6 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z" />
    </svg>
  );
}
