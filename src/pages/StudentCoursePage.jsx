import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchStudentCourseMarks } from "../services/studentService";
import { createStudentComplaint } from "../services/complaintService";
import { fetchStudentAttendanceSheet } from "../services/attendanceService";
import { Listbox } from "@headlessui/react";

const STATUS_COLORS = {
  APlus: "text-emerald-700 dark:text-emerald-300",
  danger: "text-rose-700 dark:text-rose-300",
};

function formatYear(y) {
  return y ? String(y) : "—";
}

function safeNum(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function isCtAssessment(nameRaw) {
  const n = String(nameRaw || "").toLowerCase().trim();

  if (n.includes("mid") || n.includes("final") || n.includes("att")) return false;
  if (n.includes("assign") || n.includes("pres")) return false;

  const compact = n.replace(/[\s\-_]+/g, "");

  if (compact.startsWith("ct")) return true;
  if (compact.includes("classtest")) return true;
  if (n.includes("class test")) return true;
  if (n.includes("quiz")) return true;
  if (n.includes("test")) return true;

  return false;
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

  const [attLoading, setAttLoading] = useState(true);
  const [attError, setAttError] = useState("");
  const [attData, setAttData] = useState(null);

  const [complaintLoading, setComplaintLoading] = useState(false);
  const [complaintError, setComplaintError] = useState("");
  const [complaintSuccess, setComplaintSuccess] = useState("");

  const [complaintCategory, setComplaintCategory] = useState("marks");
  const [relatedTo, setRelatedTo] = useState("overall");
  const [complaintAttDate, setComplaintAttDate] = useState("");
  const [complaintAttPeriod, setComplaintAttPeriod] = useState(1);
  const [message, setMessage] = useState("");

  const complaintRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError("");

      setAttLoading(true);
      setAttError("");
      setAttData(null);

      try {
        const [marksRes, attendanceRes] = await Promise.allSettled([
          fetchStudentCourseMarks(courseId),
          fetchStudentAttendanceSheet(courseId),
        ]);

        if (marksRes.status === "fulfilled") {
          const data = marksRes.value;

          setCourse(data.course || null);
          setAssessments(data.assessments || []);

          if (data.summary) {
            setSummary(data.summary);
            setBaseTotal(
              data.summary.currentTotal ?? data.summary.totalObtained ?? 0
            );
            setBaseGrade(data.summary.grade ?? "-");
            setBaseAPlusInfo(data.summary.aPlusInfo || null);
          } else {
            const total = data.totalObtained ?? 0;
            setBaseTotal(total);
            setBaseGrade(data.grade ?? "-");
            setBaseAPlusInfo(data.aPlusInfo || null);
          }
        } else {
          throw marksRes.reason;
        }

        if (attendanceRes.status === "fulfilled") {
          setAttData(attendanceRes.value);
        } else {
          setAttError(
            attendanceRes.reason?.response?.data?.message ||
            "Attendance data is not available yet."
          );
        }
      } catch (err) {
        console.error(err);
        const msg =
          err?.response?.data?.message ||
          "Failed to load course marks. Please try again.";
        setLoadError(msg);
      } finally {
        setLoading(false);
        setAttLoading(false);
      }
    };

    if (courseId) load();
  }, [courseId]);

  const {
    displayTotal,
    displayGrade,
    displayCtMain,
    neededForAPlusText,
    statusColor,
    totalTone,
  } = useMemo(() => {
    const total = summary?.currentTotal ?? summary?.totalObtained ?? baseTotal ?? 0;
    const grade = summary?.grade ?? baseGrade ?? "-";
    const ctMain = safeNum(summary?.ctMain, 0);

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
        )} marks in the remaining assessments (max possible: ${safeMaxPossible.toFixed(
          1
        )}/100).`;
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
      displayCtMain: ctMain % 1 === 0 ? String(ctMain) : ctMain.toFixed(1),
      neededForAPlusText: text,
      statusColor: color,
      totalTone: tone,
    };
  }, [summary, baseTotal, baseGrade, baseAPlusInfo]);

  const attComputed = useMemo(() => {
    if (!attData) return null;

    const rows = Array.isArray(attData.rows) ? attData.rows : [];
    const totalClasses = Number(attData.totalClasses || rows.length || 0);
    const totalPresent = Number(attData.totalPresent || 0);
    const percentage = Number(attData.percentage || 0);
    const latest = [...rows].slice(-10).reverse();

    return { rows, latest, totalClasses, totalPresent, percentage };
  }, [attData]);

  const ctAssessments = useMemo(() => {
    return assessments.filter((a) => isCtAssessment(a?.name));
  }, [assessments]);

  const nonCtAssessments = useMemo(() => {
    return assessments.filter((a) => !isCtAssessment(a?.name));
  }, [assessments]);

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
        category: complaintCategory,
        message: message.trim(),
      };

      if (complaintCategory === "marks") {
        payload.assessmentId = relatedTo === "overall" ? null : relatedTo;
      }

      if (complaintCategory === "attendance") {
        if (!complaintAttDate || !/^\d{4}-\d{2}-\d{2}$/.test(complaintAttDate)) {
          setComplaintError("Please select a valid attendance date (YYYY-MM-DD).");
          setComplaintLoading(false);
          return;
        }

        const p = Number(complaintAttPeriod);
        if (!p || p < 1) {
          setComplaintError("Please provide a valid period (>=1).");
          setComplaintLoading(false);
          return;
        }

        payload.attendanceRef = { date: complaintAttDate, period: p };
      }

      await createStudentComplaint(payload);

      setComplaintSuccess("Your complaint has been submitted.");
      setMessage("");
      setRelatedTo("overall");
      setComplaintAttDate("");
      setComplaintAttPeriod(1);
      setComplaintCategory("marks");
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

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 flex items-center justify-center gap-3 text-sm text-slate-500 dark:text-slate-400">
        <div className="h-5 w-5 rounded-full border-2 border-slate-300 border-t-indigo-600 dark:border-slate-600 dark:border-t-indigo-400 animate-spin" />

        <span className="font-medium">
          Loading course details…
        </span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-10">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
          <div className="font-semibold">Could not load</div>
          <div className="opacity-90">{loadError}</div>
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
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
      <div className="mx-auto max-w-7xl px-4 py-10 text-sm text-slate-500 dark:text-slate-400">
        Course not found.
      </div>
    );
  }

  return (
    <div className="mx-auto space-y-6">
      {/* Top hero */}
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-white via-violet-50/60 to-sky-50/70 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
        <div className="pointer-events-none absolute -top-16 right-0 h-44 w-44 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-500/10" />
        <div className="pointer-events-none absolute -bottom-16 left-0 h-44 w-44 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-500/10" />

        <div className="relative p-4 sm:p-6 lg:p-8">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.45fr_0.85fr]">
            {/* Left */}
            <div className="min-w-0">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-transparent text-sm font-semibold text-violet-700 transition hover:text-violet-800 dark:text-violet-300 dark:hover:text-violet-200"
                onClick={() => navigate("/student/dashboard")}
              >
                <ArrowLeftIcon />
                Back to My Courses
              </button>

              <div className="ml-2 mt-4 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                <BookIcon />
                Course Details
              </div>

              <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl lg:text-4xl">
                {course.code} — {course.title}
              </h1>

              <div className="mt-4 flex flex-wrap gap-2">
                <Pill label={`Section: ${course.section || "—"}`} />
                <Pill label={`Semester: ${course.semester || "—"}`} />
                <Pill label={`Year: ${formatYear(course.year)}`} />
              </div>

              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                View your marks, track overall performance, review attendance,
                and submit course-specific complaints from one page.
              </p>
            </div>

            {/* Right big summary */}
            <div
              className={[
                "rounded-[28px] border bg-white/90 p-5 shadow-sm backdrop-blur-sm dark:bg-slate-950/80",
                totalTone === "good"
                  ? "border-emerald-200 dark:border-emerald-500/20"
                  : totalTone === "danger"
                    ? "border-rose-200 dark:border-rose-500/20"
                    : "border-slate-200/80 dark:border-slate-800",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Current Result
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">
                    Out of 100
                  </div>
                </div>

                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  onClick={() => navigate("/student/complaints")}
                >
                  My Complaints
                  <ChevronIcon />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Grade
                  </div>
                  <div
                    className={[
                      "mt-2 text-5xl font-black tracking-tight sm:text-6xl",
                      statusColor || "text-slate-900 dark:text-white",
                    ].join(" ")}
                  >
                    {displayGrade || "-"}
                  </div>
                </div>

                <div className="sm:text-right">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Marks
                  </div>
                  <div
                    className={[
                      "mt-2 text-4xl font-black tracking-tight sm:text-5xl",
                      statusColor || "text-slate-900 dark:text-white",
                    ].join(" ")}
                  >
                    {displayTotal}
                    <span className="ml-1 text-base font-bold text-slate-400 dark:text-slate-500 sm:text-lg">
                      /100
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                {neededForAPlusText}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <ActionMiniCard
                  label="Assessments"
                  value={String(assessments.length)}
                />
                <ActionMiniCard
                  label="CT Main"
                  value={`${displayCtMain}/15`}
                />
                <ActionMiniCard
                  label="Attendance"
                  value={
                    attComputed ? `${attComputed.percentage}%` : attLoading ? "..." : "—"
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Assessments */}
      <section className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Assessment Breakdown
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Individual component marks published for this course.
            </p>
          </div>

          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
            onClick={() => {
              setComplaintCategory("marks");
              setRelatedTo("overall");
              setComplaintError("");
              setComplaintSuccess("");
              scrollToComplaint();
            }}
          >
            Raise Overall Complaint
            <ChatIcon />
          </button>
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="px-6 py-4">Component</th>
                <th className="px-6 py-4">Full Marks</th>
                <th className="px-6 py-4">Your Marks</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {assessments.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-12 text-center text-sm text-slate-400 dark:text-slate-500"
                  >
                    No assessments have been published yet.
                  </td>
                </tr>
              ) : (
                <>
                  {ctAssessments.map((a) => {
                    const key = a.id || a._id;
                    const missing = a.obtainedMarks == null;

                    return (
                      <tr
                        key={key}
                        className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-6 py-5">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {a.name}
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Assessment component
                          </div>
                        </td>

                        <td className="px-6 py-5 font-semibold text-slate-900 dark:text-white">
                          {a.fullMarks}
                        </td>

                        <td className="px-6 py-5">
                          {missing ? (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              Not published
                            </span>
                          ) : (
                            <span className="text-lg font-bold text-slate-900 dark:text-white">
                              {a.obtainedMarks}
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-5 text-right">
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/15"
                            onClick={() => {
                              setComplaintCategory("marks");
                              setRelatedTo(key);
                              setComplaintError("");
                              setComplaintSuccess("");
                              scrollToComplaint();
                            }}
                          >
                            Raise Complaint
                            <ChevronIcon />
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  <tr className="bg-violet-50/40 dark:bg-violet-500/5">
                    <td className="px-6 py-5">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        CT (Main)
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Auto calculated from selected CT policy
                      </div>
                    </td>

                    <td className="px-6 py-5 font-semibold text-slate-900 dark:text-white">
                      15
                    </td>

                    <td className="px-6 py-5">
                      <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-sm font-bold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                        {displayCtMain}
                      </span>
                    </td>

                    <td className="px-6 py-5 text-right">
                      <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                        Auto calculated
                      </span>
                    </td>
                  </tr>

                  {nonCtAssessments.map((a) => {
                    const key = a.id || a._id;
                    const missing = a.obtainedMarks == null;

                    return (
                      <tr
                        key={key}
                        className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-6 py-5">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {a.name}
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Assessment component
                          </div>
                        </td>

                        <td className="px-6 py-5 font-semibold text-slate-900 dark:text-white">
                          {a.fullMarks}
                        </td>

                        <td className="px-6 py-5">
                          {missing ? (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              Not published
                            </span>
                          ) : (
                            <span className="text-lg font-bold text-slate-900 dark:text-white">
                              {a.obtainedMarks}
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-5 text-right">
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/15"
                            onClick={() => {
                              setComplaintCategory("marks");
                              setRelatedTo(key);
                              setComplaintError("");
                              setComplaintSuccess("");
                              scrollToComplaint();
                            }}
                          >
                            Raise Complaint
                            <ChevronIcon />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="space-y-3 p-4 lg:hidden sm:p-5">
          {assessments.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              No assessments have been published yet.
            </div>
          ) : (
            <>
              <>
                {ctAssessments.map((a) => {
                  const key = a.id || a._id;
                  const missing = a.obtainedMarks == null;

                  return (
                    <div key={key}>
                      {/* your existing card UI unchanged */}
                    </div>
                  );
                })}

                {/* CT MAIN */}
                <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 shadow-sm dark:border-violet-500/20 dark:bg-violet-500/10">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    CT (Main)
                  </div>

                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Auto calculated from selected CT policy
                  </div>

                  <div className="mt-3 text-2xl font-bold text-violet-700 dark:text-violet-300">
                    {displayCtMain}
                  </div>
                </div>

                {nonCtAssessments.map((a) => {
                  const key = a.id || a._id;
                  const missing = a.obtainedMarks == null;

                  return (
                    <div key={key}>
                      {/* your existing card UI unchanged */}
                    </div>
                  );
                })}
              </>

              <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 shadow-sm dark:border-violet-500/20 dark:bg-violet-500/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      CT (Main)
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Auto calculated from selected CT policy
                    </div>
                  </div>

                  <div className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-violet-700 dark:border-violet-500/20 dark:bg-slate-900 dark:text-violet-300">
                    15
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Your Marks
                    </div>
                    <div className="mt-1 text-2xl font-black text-violet-700 dark:text-violet-300">
                      {displayCtMain}
                    </div>
                  </div>

                  <span className="inline-flex items-center rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-violet-700 dark:border-violet-500/20 dark:bg-slate-900 dark:text-violet-300">
                    Auto calculated
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Complaint + Attendance grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        {/* Complaint section */}
        <section
          ref={complaintRef}
          className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Raise a Complaint
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Send a clear issue report to the teacher for marks, attendance, or
                general course issues.
              </p>
            </div>

            <span className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <ShieldIcon />
              Student Request
            </span>
          </div>

          <div className="p-5 sm:p-6">
            {(complaintError || complaintSuccess) && (
              <div
                className={[
                  "mb-5 rounded-2xl border px-4 py-3 text-sm",
                  complaintError
                    ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
                ].join(" ")}
              >
                <div className="font-semibold">
                  {complaintError ? "Could not submit" : "Submitted"}
                </div>
                <div className="opacity-90">{complaintError || complaintSuccess}</div>
              </div>
            )}

            <form onSubmit={handleSubmitComplaint} className="space-y-5">
              {/* Main form area */}
              <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40 sm:p-5">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <TopControlCard
                    label="Category"
                    hint="Choose what kind of issue you want to report."
                  >
                    <CustomSelect
                      value={complaintCategory}
                      onChange={(v) => {
                        setComplaintCategory(v);
                        setComplaintError("");
                        setComplaintSuccess("");

                        if (v !== "marks") setRelatedTo("overall");
                        if (v !== "attendance") {
                          setComplaintAttDate("");
                          setComplaintAttPeriod(1);
                        }
                      }}
                      options={[
                        { value: "marks", label: "Marks Issue" },
                        { value: "attendance", label: "Attendance Issue" },
                        { value: "general", label: "General Issue" },
                      ]}
                    />
                  </TopControlCard>

                  {complaintCategory === "marks" ? (
                    <TopControlCard
                      label="Related to"
                      hint="Choose whether the complaint is for the whole course or a specific assessment."
                    >
                      <CustomSelect
                        value={relatedTo}
                        onChange={setRelatedTo}
                        options={[
                          { value: "overall", label: "Whole course / overall marks" },
                          ...assessments.map((a) => {
                            const key = a.id || a._id;
                            return {
                              value: key,
                              label: `${a.name} (${a.fullMarks})`,
                            };
                          }),
                        ]}
                      />
                    </TopControlCard>
                  ) : complaintCategory === "general" ? (
                    <TopControlCard
                      label="Related to"
                      hint="General complaints usually apply to the full course."
                    >
                      <div className="flex h-12 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        Whole course / general issue
                      </div>
                    </TopControlCard>
                  ) : (
                    <TopControlCard
                      label="Related to"
                      hint="Attendance issues require session date and period below."
                    >
                      <div className="flex h-12 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                        Attendance session
                      </div>
                    </TopControlCard>
                  )}

                  {complaintCategory === "attendance" && (
                    <>
                      <TopControlCard
                        label="Attendance Date"
                        hint="Select the exact class date for the complaint."
                      >
                        <input
                          type="date"
                          className="form-control h-12"
                          value={complaintAttDate}
                          onChange={(e) => setComplaintAttDate(e.target.value)}
                        />
                      </TopControlCard>

                      <TopControlCard
                        label="Period"
                        hint="Enter the class period number."
                      >
                        <input
                          type="number"
                          min={1}
                          max={20}
                          className="form-control h-12"
                          value={complaintAttPeriod}
                          onChange={(e) => setComplaintAttPeriod(e.target.value)}
                        />
                      </TopControlCard>
                    </>
                  )}
                </div>

                {/* Message block */}
                <div className="mt-5">
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Your message
                  </label>

                  <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <textarea
                      rows={7}
                      className="min-h-[180px] w-full resize-y border-0 bg-transparent p-0 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                      placeholder={
                        complaintCategory === "marks"
                          ? "Example: My Mid mark seems missing or the total looks wrong. Please review."
                          : complaintCategory === "attendance"
                            ? "Example: I was present but marked absent. Please check this class session."
                            : "Example: Assessment missing, marks not visible, or another course-related issue."
                      }
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </div>

                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Write the issue clearly and briefly. Mention exact component, date,
                    or period where relevant.
                  </p>
                </div>
              </div>

              {/* Bottom action bar */}
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900/80 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Your teacher will review this complaint from the complaints panel and
                  may respond there.
                </div>

                <button
                  type="submit"
                  disabled={complaintLoading}
                  className="inline-flex min-w-[210px] items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
                >
                  {complaintLoading ? (
                    <>
                      <SpinnerIcon />
                      Submitting…
                    </>
                  ) : (
                    <>
                      <SendIcon />
                      Submit Complaint
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* Attendance */}
        <section className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Attendance
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Period-wise attendance summary for this course.
              </p>
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              onClick={() => navigate("/student/attendance")}
            >
              View Full Attendance
              <ChevronIcon />
            </button>
          </div>

          <div className="p-5 sm:p-6">
            {attLoading ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Loading attendance…
              </div>
            ) : attError && !attComputed ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                {attError}
              </div>
            ) : attComputed ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <ActionMiniCard
                    label="Present"
                    value={String(attComputed.totalPresent)}
                  />
                  <ActionMiniCard
                    label="Percentage"
                    value={`${attComputed.percentage}%`}
                  />
                </div>

                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/15"
                  onClick={() => {
                    setComplaintCategory("attendance");
                    setComplaintError("");
                    setComplaintSuccess("");
                    scrollToComplaint();
                  }}
                >
                  Report Attendance Issue
                  <ChatIcon />
                </button>

                {!attComputed.rows.length ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                    No attendance has been taken yet for this course.
                  </div>
                ) : (
                  <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                          <tr>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3 text-center">Period</th>
                            <th className="px-4 py-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {attComputed.latest.map((r) => (
                            <tr key={`${r.date}-P${r.period}`}>
                              <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                {r.date}
                              </td>
                              <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-200">
                                {r.period}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={[
                                    "inline-flex rounded-full px-2.5 py-1 text-xs font-bold",
                                    String(r.status).toLowerCase() === "present"
                                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                      : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
                                  ].join(" ")}
                                >
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {attComputed.rows.length > 10 && (
                  <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Showing latest 10 sessions. Click “View Full Attendance” to
                    see all.
                  </div>
                )}
              </>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------------- UI helpers ---------------- */

function Pill({ label }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
      {label}
    </span>
  );
}

function ActionMiniCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
        {value}
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </span>
      {children}
    </label>
  );
}

function CustomSelect({ value, onChange, options, placeholder = "Select" }) {
  const selected = options.find((o) => o.value === value);

  return (
    <Listbox value={value} onChange={onChange}>
      <div className="relative">
        <Listbox.Button className="flex h-12 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-left text-sm font-medium text-slate-800 shadow-sm transition hover:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <span className="truncate">{selected?.label || placeholder}</span>
          <span className="ml-3 shrink-0 text-slate-400 dark:text-slate-500">
            <ChevronUpDownIcon />
          </span>
        </Listbox.Button>

        <Listbox.Options className="absolute z-50 mt-2 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl focus:outline-none dark:border-slate-700 dark:bg-slate-800">
          {options.map((option) => (
            <Listbox.Option key={option.value} value={option.value} as={Fragment}>
              {({ active, selected }) => (
                <li
                  className={[
                    "flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition",
                    active
                      ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                      : "text-slate-700 dark:text-slate-200",
                  ].join(" ")}
                >
                  <span className={selected ? "font-semibold" : "font-medium"}>
                    {option.label}
                  </span>
                  {selected ? (
                    <span className="ml-3 shrink-0 text-violet-600 dark:text-violet-300">
                      <CheckSmallIcon />
                    </span>
                  ) : null}
                </li>
              )}
            </Listbox.Option>
          ))}
        </Listbox.Options>
      </div>
    </Listbox>
  );
}

function TopControlCard({ label, hint, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </div>
      {children}
      {hint ? (
        <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {hint}
        </div>
      ) : null}
    </div>
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
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
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
    <svg
      className="h-4 w-4"
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

function CheckSmallIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 0 1 .006 1.414l-8 8a1 1 0 0 1-1.42-.007l-4-4a1 1 0 1 1 1.414-1.414l3.295 3.296 7.296-7.29a1 1 0 0 1 1.409 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevronUpDownIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" />
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