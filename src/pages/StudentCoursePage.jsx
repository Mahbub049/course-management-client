// client/src/pages/StudentCoursePage.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchStudentCourseMarks } from "../services/studentService";
import { createStudentComplaint } from "../services/complaintService";

const STATUS_COLORS = {
  APlus: "text-emerald-700",
  danger: "text-rose-700",
};

function formatYear(y) {
  return y ? String(y) : "—";
}

function safeNum(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

export default function StudentCoursePage() {
  const { courseId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [course, setCourse] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [baseTotal, setBaseTotal] = useState(0);
  const [baseGrade, setBaseGrade] = useState("-");
  const [baseAPlusInfo, setBaseAPlusInfo] = useState(null);

  // Complaint form
  const [complaintLoading, setComplaintLoading] = useState(false);
  const [complaintError, setComplaintError] = useState("");
  const [complaintSuccess, setComplaintSuccess] = useState("");
  const [relatedTo, setRelatedTo] = useState("overall"); // "overall" or assessmentId
  const [message, setMessage] = useState("");

  const complaintRef = useRef(null);

  // -------- Load data --------
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const data = await fetchStudentCourseMarks(courseId);

        setCourse(data.course || null);
        setAssessments(data.assessments || []);

        if (data.summary) {
          setSummary(data.summary);
          setBaseTotal(data.summary.currentTotal ?? data.summary.totalObtained ?? 0);
          setBaseGrade(data.summary.grade ?? "-");
          setBaseAPlusInfo(data.summary.aPlusInfo || null);
        } else {
          const total = data.totalObtained ?? 0;
          setBaseTotal(total);
          setBaseGrade(data.grade ?? "-");
          setBaseAPlusInfo(data.aPlusInfo || null);
        }
      } catch (err) {
        console.error(err);
        const msg =
          err?.response?.data?.message ||
          "Failed to load course marks. Please try again.";
        setLoadError(msg);
      } finally {
        setLoading(false);
      }
    };

    if (courseId) load();
  }, [courseId]);

  // -------- Derived values for header --------
  const { displayTotal, displayGrade, neededForAPlusText, statusColor, totalTone } = useMemo(() => {
    const total = summary?.currentTotal ?? summary?.totalObtained ?? baseTotal ?? 0;
    const grade = summary?.grade ?? baseGrade ?? "-";

    const maxPossible = summary?.maxPossible ?? baseAPlusInfo?.maxPossible ?? 100;
    const needed =
      summary?.aPlusInfo?.needed ??
      summary?.aPlusNeeded ??
      (safeNum(total) >= 80 ? 0 : Math.max(0, 80 - safeNum(total)));

    const safeTotal = safeNum(total, 0);
    const safeMaxPossible = safeNum(maxPossible, 100);
    const safeNeeded = safeNum(needed, 0);

    let text;
    if (safeNeeded <= 0 || safeTotal >= 80) {
      text = "You already meet the A+ threshold (80/100).";
    } else {
      if (safeMaxPossible < 80) {
        text = `Even with full marks in remaining items, maximum possible is ${safeMaxPossible.toFixed(
          1
        )}/100 — so A+ is not reachable.`;
      } else {
        text = `To reach A+, you need ${safeNeeded.toFixed(
          1
        )} marks in the remaining assessments (max possible: ${safeMaxPossible.toFixed(1)}/100).`;
      }
    }

    let color = "";
    let tone = "neutral";
    if (safeTotal >= 80) {
      color = STATUS_COLORS.APlus;
      tone = "good";
    } else if (safeTotal < 40) {
      color = STATUS_COLORS.danger;
      tone = "danger";
    }

    return {
      displayTotal: safeTotal.toFixed(1),
      displayGrade: grade,
      neededForAPlusText: text,
      statusColor: color,
      totalTone: tone,
    };
  }, [summary, baseTotal, baseGrade, baseAPlusInfo]);

  // -------- Complaint submit --------
  const handleSubmitComplaint = async (e) => {
    e.preventDefault();
    setComplaintError("");
    setComplaintSuccess("");

    if (!message.trim()) {
      setComplaintError("Please write a short description of the issue.");
      return;
    }

    try {
      setComplaintLoading(true);

      const payload = {
        courseId,
        assessmentId: relatedTo === "overall" ? null : relatedTo,
        message: message.trim(),
      };

      await createStudentComplaint(payload);

      setComplaintSuccess("Your complaint has been submitted.");
      setMessage("");
      setRelatedTo("overall");
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.message || "Failed to submit complaint.";
      setComplaintError(msg);
    } finally {
      setComplaintLoading(false);
    }
  };

  const scrollToComplaint = () => {
    setTimeout(() => {
      complaintRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  // -------- Render --------
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-10 px-4 text-sm text-slate-500">
        Loading course details…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-6xl mx-auto py-10 px-4 space-y-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          <div className="font-semibold">Could not load</div>
          <div className="opacity-90">{loadError}</div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => navigate("/student/dashboard")}
        >
          <ArrowLeftIcon />
          Back to My Courses
        </button>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="max-w-6xl mx-auto py-10 px-4 text-sm text-slate-500">
        Course not found.
      </div>
    );
  }

  return (
    <div className="mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-800"
            onClick={() => navigate("/student/dashboard")}
          >
            <ArrowLeftIcon /> Back to My Courses
          </button>

          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            <BookIcon />
            Course Details
          </div>

          <h1 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
            {course.code} – {course.title}
          </h1>

          <div className="mt-2 flex flex-wrap gap-2">
            <Pill label={`Section: ${course.section || "—"}`} />
            <Pill label={`Semester: ${course.semester || "—"}`} />
            <Pill label={`Year: ${formatYear(course.year)}`} />
          </div>
        </div>

        {/* Summary card */}
        <div
          className={[
            "rounded-2xl border bg-white shadow-sm overflow-hidden w-full md:w-[360px]",
            totalTone === "good"
              ? "border-emerald-200"
              : totalTone === "danger"
              ? "border-rose-200"
              : "border-slate-200",
          ].join(" ")}
        >
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Summary</div>
            <span
              className={[
                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                totalTone === "good"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : totalTone === "danger"
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : "bg-slate-50 text-slate-700 border-slate-200",
              ].join(" ")}
            >
              Grade: {displayGrade || "-"}
            </span>
          </div>

          <div className="px-5 py-4">
            <div className="text-xs font-semibold text-slate-500">CURRENT TOTAL</div>
            <div className={`mt-1 text-3xl font-extrabold ${statusColor || "text-slate-900"}`}>
              {displayTotal}
              <span className="text-slate-400 text-sm font-semibold">/100</span>
            </div>

            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {neededForAPlusText}
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => navigate("/student/complaints")}
              >
                View My Complaints <ChevronIcon />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Assessment breakdown */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Assessment Breakdown</h2>
            <p className="text-xs text-slate-500">Total is calculated out of 100 as per course rules.</p>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => {
              setRelatedTo("overall");
              setComplaintError("");
              setComplaintSuccess("");
              scrollToComplaint();
            }}
          >
            Raise Overall Complaint <ChatIcon />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
              <tr className="border-b border-slate-200">
                <th className="px-6 py-3">Component</th>
                <th className="px-6 py-3">Full Marks</th>
                <th className="px-6 py-3">Your Marks</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {assessments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-slate-400">
                    No assessments have been published yet.
                  </td>
                </tr>
              ) : (
                assessments.map((a) => {
                  const key = a.id || a._id;
                  const missing = a.obtainedMarks == null;

                  return (
                    <tr key={key} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{a.name}</div>
                        <div className="text-xs text-slate-500">Assessment component</div>
                      </td>

                      <td className="px-6 py-4 font-semibold text-slate-900">{a.fullMarks}</td>

                      <td className="px-6 py-4">
                        {missing ? (
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            Not published
                          </span>
                        ) : (
                          <span className="font-bold text-slate-900">{a.obtainedMarks}</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                          onClick={() => {
                            setRelatedTo(key);
                            setComplaintError("");
                            setComplaintSuccess("");
                            scrollToComplaint();
                          }}
                        >
                          Raise Complaint <ChevronIcon />
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

      {/* Complaint section */}
      <div ref={complaintRef} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Raise a Complaint</h2>
            <p className="text-xs text-slate-500">
              Write clearly. The teacher will see this in the complaints panel and reply from there.
            </p>
          </div>

          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            <ShieldIcon /> Student Request
          </span>
        </div>

        <div className="p-6 space-y-4">
          {(complaintError || complaintSuccess) && (
            <div
              className={[
                "rounded-xl border px-4 py-3 text-sm",
                complaintError
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700",
              ].join(" ")}
            >
              <div className="font-semibold">{complaintError ? "Could not submit" : "Submitted"}</div>
              <div className="opacity-90">{complaintError || complaintSuccess}</div>
            </div>
          )}

          <form onSubmit={handleSubmitComplaint} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Related to */}
              <div className="lg:col-span-5">
                <label className="block text-sm font-semibold text-slate-700">Related to</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  value={relatedTo}
                  onChange={(e) => setRelatedTo(e.target.value)}
                >
                  <option value="overall">Whole course / overall marks</option>
                  {assessments.map((a) => {
                    const key = a.id || a._id;
                    return (
                      <option key={key} value={key}>
                        {a.name} ({a.fullMarks})
                      </option>
                    );
                  })}
                </select>

                <p className="mt-2 text-xs text-slate-500">
                  Selected:{" "}
                  <span className="font-semibold text-slate-700">
                    {relatedTo === "overall"
                      ? "Whole course"
                      : assessments.find((a) => (a.id || a._id) === relatedTo)?.name || "Assessment"}
                  </span>
                </p>
              </div>

              {/* Message */}
              <div className="lg:col-span-7">
                <label className="block text-sm font-semibold text-slate-700">Your message</label>
                <textarea
                  rows={4}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Example: My Mid mark seems missing / attendance not counted / wrong total. Please review."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Keep it short and specific (mention component and expected marks if possible).
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={complaintLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
              >
                {complaintLoading ? (
                  <>
                    <SpinnerIcon /> Submitting…
                  </>
                ) : (
                  <>
                    <SendIcon /> Submit Complaint
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ---------------- UI helpers ---------------- */

function Pill({ label }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
      {label}
    </span>
  );
}

/* ---------------- Icons ---------------- */

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

function BookIcon() {
  return (
    <svg className="h-4 w-4 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19a2 2 0 0 0 2 2h12" />
      <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="h-4 w-4 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
