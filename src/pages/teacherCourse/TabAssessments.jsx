// client/src/pages/teacherCourse/TabAssessments.jsx

import { useEffect, useMemo, useState } from "react";
import { fetchAssessments, createAssessmentRequest } from "../../services/assessmentService";

function getCourseType(course) {
  return (course?.courseType || "theory").toLowerCase();
}


function prettyType(t) {
  const x = (t || "").toLowerCase();
  if (x === "ct") return "CT";
  if (x === "mid") return "Mid";
  if (x === "final") return "Final";
  if (x === "attendance") return "Attendance";
  if (x === "assignment") return "Assignment";
  if (x === "presentation") return "Presentation";
  if (x === "lab") return "Lab";
  return x ? x.toUpperCase() : "—";
}

function typeBadgeClass(t) {
  const x = (t || "").toLowerCase();
  if (x === "final") return "bg-rose-50 text-rose-700 border-rose-200";
  if (x === "mid") return "bg-amber-50 text-amber-700 border-amber-200";
  if (x === "ct") return "bg-sky-50 text-sky-700 border-sky-200";
  if (x === "attendance") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (x === "assignment" || x === "presentation") return "bg-purple-50 text-purple-700 border-purple-200";
  if (x === "lab") return "bg-indigo-50 text-indigo-700 border-indigo-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

export default function TabAssessments({ courseId, course }) {
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assessmentError, setAssessmentError] = useState("");

  const [creating, setCreating] = useState(false);

  const [assessmentForm, setAssessmentForm] = useState({
    type: "ct",
    name: "",
    fullMarks: "",
  });

  // UI
  const [query, setQuery] = useState("");

  const courseType = useMemo(() => getCourseType(course), [course]);

  const typeOptions =
    courseType === "lab"
      ? [
        { value: "lab", label: "Lab Assessment" },
        { value: "mid", label: "Mid" },
        { value: "final", label: "Final" },
        { value: "attendance", label: "Attendance" },
      ]
      : [
        { value: "ct", label: "Class Test (CT)" },
        { value: "mid", label: "Mid" },
        { value: "final", label: "Final" },
        { value: "attendance", label: "Attendance" },
        { value: "assignment", label: "Assignment" },
        { value: "presentation", label: "Presentation" },
      ];

  // load assessments
  useEffect(() => {
    const loadAssessments = async () => {
      setLoading(true);
      setAssessmentError("");
      try {
        const data = await fetchAssessments(courseId);
        setAssessments(data || []);
      } catch (err) {
        console.error(err);
        setAssessmentError(err?.response?.data?.message || "Failed to load assessments");
      } finally {
        setLoading(false);
      }
    };

    if (courseId) loadAssessments();
  }, [courseId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setAssessmentForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setAssessmentError("");

    try {
      const trimmedName = assessmentForm.name.trim();
      const fullMarksNumber = Number(assessmentForm.fullMarks);

      if (!trimmedName) {
        setAssessmentError("Please enter a name for the assessment.");
        setCreating(false);
        return;
      }

      if (!fullMarksNumber || Number.isNaN(fullMarksNumber) || fullMarksNumber <= 0) {
        setAssessmentError("Full marks must be a positive number.");
        setCreating(false);
        return;
      }

      const payload = {
        name: trimmedName,
        fullMarks: fullMarksNumber,
      };

      const created = await createAssessmentRequest(courseId, payload);

      setAssessments((prev) => [...prev, created]);

      // reset form but keep same type for convenience
      setAssessmentForm((prev) => ({
        ...prev,
        name: "",
        fullMarks: "",
      }));
    } catch (err) {
      console.error(err);
      setAssessmentError(err?.response?.data?.message || "Failed to create assessment");
    } finally {
      setCreating(false);
    }
  };

  // Quick presets helper: set type, name, and fullMarks
  const quickAdd = (type, name, fullMarks) => {
    setAssessmentForm({
      type,
      name,
      fullMarks: String(fullMarks),
    });
  };

  const filteredAssessments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assessments;

    return assessments.filter((a) => {
      const name = (a?.name || "").toLowerCase();
      const t = (a?.type || "").toLowerCase();
      const fm = String(a?.fullMarks ?? "").toLowerCase();
      return name.includes(q) || t.includes(q) || fm.includes(q);
    });
  }, [assessments, query]);

  const headerHint =
    courseType === "lab"
      ? "Lab assessments (average → 25), Mid (30), Final (40), Attendance (5)."
      : "CT (best two → 15), Mid (30), Final (40), Assignment/Presentation (10), Attendance (5).";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            <ClipboardIcon />
            Assessments
          </div>
          <h3 className="mt-2 text-xl font-bold text-slate-900">Assessment Setup</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-2xl">{headerHint}</p>
        </div>

        <div className="flex gap-2">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 border text-xs font-semibold ${courseType === "lab"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-sky-50 text-sky-700 border-sky-200"
              }`}
          >
            {courseType === "lab" ? "Lab Course" : "Theory Course"}
          </span>
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            Total: {assessments.length}
          </span>
        </div>
      </div>

      {/* Add Assessment */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
            <PlusIcon />
          </div>
          <div>
            <h4 className="text-base font-semibold text-slate-900">Add Assessment</h4>
            <p className="text-xs text-slate-500">Create columns that will appear in marks entry.</p>
          </div>
        </div>

        <div className="p-6">
          {assessmentError && <Alert tone="danger" title="Could not save" message={assessmentError} />}

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Type dropdown */}
              <div className="lg:col-span-3">
                <label className="block text-sm font-semibold text-slate-700">Type</label>
                <select
                  name="type"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  value={assessmentForm.type}
                  onChange={handleChange}
                >
                  {typeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Name input */}
              <div className="lg:col-span-6">
                <label className="block text-sm font-semibold text-slate-700">Name (shown in columns)</label>
                <input
                  type="text"
                  name="name"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                  placeholder={courseType === "lab" ? "Lab Assessment 01" : "CT1 / Mid / Final / Assignment / Presentation"}
                  value={assessmentForm.name}
                  onChange={handleChange}
                />
              </div>

              {/* Full marks */}
              <div className="lg:col-span-3">
                <label className="block text-sm font-semibold text-slate-700">Full Marks</label>
                <input
                  type="number"
                  name="fullMarks"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                  placeholder={courseType === "lab" ? "e.g., 20" : "CT:10, Mid:30, Final:40"}
                  value={assessmentForm.fullMarks}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between pt-1">
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
              >
                {creating ? (
                  <>
                    <SpinnerIcon /> Adding…
                  </>
                ) : (
                  <>
                    <PlusIconSmall /> Add Assessment
                  </>
                )}
              </button>

              {/* Quick presets */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="text-slate-500 mr-1">Quick:</span>

                {courseType === "lab" ? (
                  <>
                    <QuickPill onClick={() => quickAdd("lab", "Lab Assessment 01", 10)} label="Lab Assessment 01 (10)" />
                    <QuickPill onClick={() => quickAdd("mid", "Mid", 30)} label="Mid (30)" />
                    <QuickPill onClick={() => quickAdd("final", "Final", 40)} label="Final (40)" />
                    <QuickPill onClick={() => quickAdd("attendance", "Attendance", 5)} label="Attendance (5)" />
                  </>
                ) : (
                  <>
                    <QuickPill onClick={() => quickAdd("ct", "CT1", 10)} label="CT1 (10)" />
                    <QuickPill onClick={() => quickAdd("ct", "CT2", 10)} label="CT2 (10)" />
                    <QuickPill onClick={() => quickAdd("mid", "Mid", 30)} label="Mid (30)" />
                    <QuickPill onClick={() => quickAdd("final", "Final", 40)} label="Final (40)" />
                    <QuickPill onClick={() => quickAdd("presentation", "Presentation", 10)} label="Presentation (10)" />
                    <QuickPill onClick={() => quickAdd("assignment", "Assignment", 10)} label="Assignment (10)" />
                    <QuickPill onClick={() => quickAdd("attendance", "Attendance", 5)} label="Attendance (5)" />
                  </>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Existing assessments */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h4 className="text-base font-semibold text-slate-900">Existing Assessments</h4>
            <p className="text-xs text-slate-500">
              Showing <span className="font-semibold">{filteredAssessments.length}</span> of{" "}
              <span className="font-semibold">{assessments.length}</span>
            </p>
          </div>

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <SearchIcon />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name / type / marks..."
              className="w-72 max-w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="grid gap-3">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : filteredAssessments.length === 0 ? (
            <div className="text-center py-10">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                <ClipboardIcon />
              </div>
              <h5 className="mt-3 text-sm font-semibold text-slate-900">No assessments found</h5>
              <p className="mt-1 text-sm text-slate-500">Create one above or try another search term.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Assessment</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Type</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Full Marks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAssessments.map((a) => (
                    <tr key={a._id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{a.name}</div>
                        <div className="text-xs text-slate-500">Used in marks entry table</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 border text-xs font-semibold ${typeBadgeClass(
                            a.type
                          )}`}
                        >
                          {prettyType(a.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{a.fullMarks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-slate-500">
                Tip: keep consistent naming (CT1, CT2, Mid, Final) for clean columns.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- UI helpers ---------------- */

function Alert({ tone = "danger", title, message }) {
  const styles =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-800";

  return (
    <div className={`mb-3 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5 opacity-90">{message}</div>
    </div>
  );
}

function QuickPill({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
    >
      {label}
    </button>
  );
}

function SkeletonRow() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="h-3 w-40 rounded bg-slate-200" />
      <div className="mt-2 h-3 w-64 rounded bg-slate-200" />
    </div>
  );
}

/* ---------------- Icons ---------------- */

function ClipboardIcon() {
  return (
    <svg className="h-4 w-4 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 5h6" />
      <path d="M9 3h6v4H9z" />
      <path d="M7 7h10v14H7z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-5 w-5 text-indigo-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 6v12m6-6H6" />
    </svg>
  );
}
function PlusIconSmall() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 6v12m6-6H6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 21l-4.3-4.3" />
      <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" />
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
