// client/src/pages/teacherCourse/TabAssessments.jsx

import { useEffect, useMemo, useState } from "react";
import {
  fetchAssessments,
  createAssessmentRequest,
  updateAssessmentRequest,
  deleteAssessmentRequest,
} from "../../services/assessmentService";

function getCourseType(course) {
  // ✅ STRICT: never guess from title/code
  return (course?.courseType || "theory").toLowerCase();
}

function normalizeOrders(list) {
  // if order missing, fallback to index for stable UI
  return (list || []).map((a, idx) => ({
    ...a,
    order: Number.isFinite(Number(a.order)) ? Number(a.order) : idx,
  }));
}

function sortByOrder(list) {
  const arr = normalizeOrders(list);
  return [...arr].sort((a, b) => {
    const ao = Number(a.order ?? 0);
    const bo = Number(b.order ?? 0);
    if (ao !== bo) return ao - bo;
    // tie-breaker
    const at = new Date(a.createdAt || 0).getTime();
    const bt = new Date(b.createdAt || 0).getTime();
    return at - bt;
  });
}

function classifyForBadge(nameRaw, courseType) {
  const name = String(nameRaw || "").toLowerCase();

  if (courseType === "lab") {
    if (name.includes("mid")) return "mid";
    if (name.includes("final")) return "final";
    if (name.includes("att") || name.includes("attendance")) return "attendance";
    return "lab"; // everything else => lab assessment
  }

  // theory
  if (name.includes("ct") || name.includes("class test") || name.includes("class-test")) return "ct";
  if (name.includes("mid")) return "mid";
  if (name.includes("final")) return "final";
  if (name.includes("att") || name.includes("attendance")) return "attendance";
  if (name.includes("assign")) return "assignment";
  if (name.includes("pres")) return "presentation";
  return "other";
}

function badgeLabel(type) {
  if (type === "ct") return "CT";
  if (type === "mid") return "Mid";
  if (type === "final") return "Final";
  if (type === "attendance") return "Attendance";
  if (type === "assignment") return "Assignment";
  if (type === "presentation") return "Presentation";
  if (type === "lab") return "Lab";
  return "Other";
}

function badgeClass(type) {
  if (type === "final") return "bg-rose-50 text-rose-700 border-rose-200";
  if (type === "mid") return "bg-amber-50 text-amber-700 border-amber-200";
  if (type === "ct") return "bg-sky-50 text-sky-700 border-sky-200";
  if (type === "attendance") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (type === "assignment" || type === "presentation")
    return "bg-purple-50 text-purple-700 border-purple-200";
  if (type === "lab") return "bg-indigo-50 text-indigo-700 border-indigo-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function reorderArray(arr, fromIndex, toIndex) {
  const copy = [...arr];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy;
}

export default function TabAssessments({ courseId, course }) {
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assessmentError, setAssessmentError] = useState("");

  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const [dragId, setDragId] = useState(null);

  const [query, setQuery] = useState("");

  const courseType = useMemo(() => getCourseType(course), [course]);

  const [form, setForm] = useState({
    type: courseType === "lab" ? "lab" : "ct",
    name: "",
    fullMarks: "",
  });

  // keep default type in sync if user switches courseType
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      type: courseType === "lab" ? "lab" : "ct",
    }));
  }, [courseType]);

  const canReorder = query.trim() === "";

  // load
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setAssessmentError("");
      try {
        const data = await fetchAssessments(courseId);
        setAssessments(sortByOrder(data || []));
      } catch (err) {
        console.error(err);
        setAssessmentError(err?.response?.data?.message || "Failed to load assessments");
      } finally {
        setLoading(false);
      }
    };

    if (courseId) load();
  }, [courseId]);

  const orderedAssessments = useMemo(() => sortByOrder(assessments), [assessments]);

  const filteredAssessments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orderedAssessments;

    return orderedAssessments.filter((a) => {
      const n = String(a?.name || "").toLowerCase();
      const fm = String(a?.fullMarks ?? "").toLowerCase();
      const t = classifyForBadge(a?.name, courseType);
      return n.includes(q) || fm.includes(q) || t.includes(q);
    });
  }, [orderedAssessments, query, courseType]);

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

  const headerHint =
    courseType === "lab"
      ? "Lab Assessments (average → 25), Mid (30), Final (40), Attendance (5)."
      : "CT (best two → 15), Mid (30), Final (40), Assignment/Presentation (10), Attendance (5).";

  const onCreate = async (e) => {
    e.preventDefault();
    setAssessmentError("");
    setCreating(true);

    try {
      const name = form.name.trim();
      const fullMarks = Number(form.fullMarks);

      if (!name) {
        setAssessmentError("Please enter a name.");
        setCreating(false);
        return;
      }

      if (!fullMarks || Number.isNaN(fullMarks) || fullMarks <= 0) {
        setAssessmentError("Full marks must be a positive number.");
        setCreating(false);
        return;
      }

      const created = await createAssessmentRequest(courseId, {
        name,
        fullMarks,
      });

      // append with new order at bottom
      setAssessments((prev) => {
        const list = sortByOrder(prev);
        const nextOrder = list.length ? Number(list[list.length - 1].order ?? list.length - 1) + 1 : 0;
        return sortByOrder([...list, { ...created, order: nextOrder }]);
      });

      setForm((prev) => ({ ...prev, name: "", fullMarks: "" }));
    } catch (err) {
      console.error(err);
      setAssessmentError(err?.response?.data?.message || "Failed to create assessment");
    } finally {
      setCreating(false);
    }
  };

  const quickAdd = (name, fullMarks) => {
    setForm((prev) => ({ ...prev, name, fullMarks: String(fullMarks) }));
  };

  const removeAssessment = async (assessmentId) => {
    const ok = window.confirm("Delete this assessment? All related marks will also be deleted.");
    if (!ok) return;

    try {
      setBusyId(assessmentId);
      await deleteAssessmentRequest(assessmentId);
      setAssessments((prev) => prev.filter((a) => String(a._id) !== String(assessmentId)));
    } catch (err) {
      console.error(err);
      setAssessmentError(err?.response?.data?.message || "Failed to delete assessment.");
    } finally {
      setBusyId(null);
    }
  };

  const persistOrders = async (nextList) => {
    // order = 0..n-1
    const ops = nextList.map((a, idx) => updateAssessmentRequest(a._id, { order: idx }));
    await Promise.all(ops);
  };

  const handleDrop = async (toId) => {
    const fromId = dragId;
    if (!fromId || fromId === toId) return;

    const full = orderedAssessments; // reorder based on full list
    const fromIndex = full.findIndex((x) => String(x._id) === String(fromId));
    const toIndex = full.findIndex((x) => String(x._id) === String(toId));
    if (fromIndex < 0 || toIndex < 0) return;

    const next = reorderArray(full, fromIndex, toIndex).map((x, i) => ({ ...x, order: i }));

    // optimistic UI
    setAssessments(next);

    try {
      setBusyId(fromId);
      await persistOrders(next);
    } catch (err) {
      console.error(err);
      setAssessmentError(err?.response?.data?.message || "Failed to save new order.");
    } finally {
      setBusyId(null);
      setDragId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-6 py-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Assessment Setup</h3>
            <p className="text-sm text-slate-500 mt-1">{headerHint}</p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 border text-xs font-semibold ${
                courseType === "lab"
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

        {assessmentError && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {assessmentError}
          </div>
        )}
      </div>

      {/* Add Assessment */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-6 py-5">
        <h4 className="font-semibold text-slate-900 mb-3">Add Assessment</h4>

        <form onSubmit={onCreate} className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-3">
            <label className="block text-sm font-semibold text-slate-700">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              {typeOptions.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-6">
            <label className="block text-sm font-semibold text-slate-700">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder={courseType === "lab" ? "Lab Assessment 01 / Experiment 01" : "CT1 / Mid / Final"}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-sm font-semibold text-slate-700">Full Marks</label>
            <input
              value={form.fullMarks}
              onChange={(e) => setForm((p) => ({ ...p, fullMarks: e.target.value }))}
              placeholder={courseType === "lab" ? "10 / 30 / 40" : "10 / 30 / 40"}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            />
          </div>

          <div className="lg:col-span-1 flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {creating ? "Adding..." : "Add"}
            </button>
          </div>
        </form>

        {/* Quick */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 mr-1 font-semibold">Quick:</span>

          {courseType === "lab" ? (
            <>
              <QuickPill label="Lab Assessment (10)" onClick={() => quickAdd("Lab Assessment", 10)} />
              <QuickPill label="Mid (30)" onClick={() => quickAdd("Mid", 30)} />
              <QuickPill label="Final (40)" onClick={() => quickAdd("Final", 40)} />
              <QuickPill label="Attendance (5)" onClick={() => quickAdd("Attendance", 5)} />
            </>
          ) : (
            <>
              <QuickPill label="CT1 (10)" onClick={() => quickAdd("CT1", 10)} />
              <QuickPill label="CT2 (10)" onClick={() => quickAdd("CT2", 10)} />
              <QuickPill label="Mid (30)" onClick={() => quickAdd("Mid", 30)} />
              <QuickPill label="Final (40)" onClick={() => quickAdd("Final", 40)} />
              <QuickPill label="Presentation (10)" onClick={() => quickAdd("Presentation", 10)} />
              <QuickPill label="Assignment (10)" onClick={() => quickAdd("Assignment", 10)} />
              <QuickPill label="Attendance (5)" onClick={() => quickAdd("Attendance", 5)} />
            </>
          )}
        </div>
      </div>

      {/* Existing Assessments */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-slate-900">Existing Assessments</div>
            <div className="text-xs text-slate-500">
              Showing {filteredAssessments.length} of {assessments.length}
              {!canReorder && (
                <span className="ml-2 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  Clear search to reorder
                </span>
              )}
            </div>
          </div>

          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name / type / marks..."
              className="w-[280px] rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm"
            />
            <span className="absolute left-3 top-2.5 text-slate-400">
              <SearchIcon />
            </span>
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-6 text-sm text-slate-500">Loading assessments…</div>
        ) : filteredAssessments.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">No assessments found.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredAssessments.map((a) => {
              const type = classifyForBadge(a?.name, courseType);

              return (
                <li
                  key={a._id}
                  draggable={canReorder}
                  onDragStart={() => setDragId(String(a._id))}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => {
                    if (!canReorder) return;
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (!canReorder) return;
                    e.preventDefault();
                    handleDrop(String(a._id));
                  }}
                  className={[
                    "px-6 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between",
                    canReorder ? "cursor-move" : "cursor-default",
                    dragId === String(a._id) ? "bg-indigo-50/40" : "",
                  ].join(" ")}
                  title={canReorder ? "Drag to reorder" : "Clear search to reorder"}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-slate-900 truncate">{a.name}</div>

                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass(
                          type
                        )}`}
                      >
                        {badgeLabel(type)}
                      </span>

                      {canReorder && (
                        <span className="ml-1 text-slate-400" title="Drag handle">
                          <GripIcon />
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">Used in marks entry table</div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-sm text-slate-700">
                      Full Marks: <span className="font-semibold">{a.fullMarks}</span>
                    </div>

                    <button
                      type="button"
                      disabled={busyId === a._id}
                      onClick={() => removeAssessment(a._id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      title="Delete"
                    >
                      <XIcon />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="px-6 py-3 border-t border-slate-100 text-xs text-slate-500">
          Tip: drag & drop to sort (clear search to enable).
        </div>
      </div>
    </div>
  );
}

/* ------------ small components & icons ------------ */

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

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 6h.01M10 12h.01M10 18h.01" />
      <path d="M14 6h.01M14 12h.01M14 18h.01" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}
