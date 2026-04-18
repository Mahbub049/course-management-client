import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchStudentCourseMarks } from "../services/studentService";
import { createStudentComplaint } from "../services/complaintService";
import { fetchStudentAttendanceSheet } from "../services/attendanceService";
import { fetchStudentCourseMaterials } from "../services/materialService";

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

function getCourseType(course) {
  return (course?.courseType || "theory").toLowerCase();
}

function round2(num) {
  return Math.round(Number(num || 0) * 100) / 100;
}

function buildSubMarksMap(subMarks = []) {
  const map = {};
  (subMarks || []).forEach((item) => {
    if (!item?.key) return;
    map[String(item.key)] = Number(item.obtainedMarks || 0);
  });
  return map;
}

function buildAdvancedBreakdown(assessment) {
  if (assessment?.structureType !== "lab_final") return [];

  const config = assessment?.labFinalConfig || {};
  const subMarksMap = buildSubMarksMap(assessment?.subMarks || []);
  const items = [];

  if (config.mode === "project_only" || config.mode === "mixed") {
    (config.projectComponents || []).forEach((component) => {
      if (component.entryMode === "phased") {
        (component.phases || []).forEach((phase) => {
          items.push({
            key: phase.key,
            group: component.name || "Project",
            label: `${component.name} - ${phase.name}`,
            fullMarks: Number(phase.marks || 0),
            obtainedMarks: Number(subMarksMap[phase.key] || 0),
          });
        });
      } else {
        items.push({
          key: component.key,
          group: "Project",
          label: component.name,
          fullMarks: Number(component.marks || 0),
          obtainedMarks: Number(subMarksMap[component.key] || 0),
        });
      }
    });
  }

  if (config.mode === "lab_exam_only" || config.mode === "mixed") {
    (config.examQuestions || []).forEach((q) => {
      items.push({
        key: q.key,
        group: "Lab Final",
        label: q.label,
        fullMarks: Number(q.marks || 0),
        obtainedMarks: Number(subMarksMap[q.key] || 0),
      });
    });
  }

  return items;
}

function getAssessmentHint(assessment, courseType) {
  if (assessment?.structureType === "lab_final") {
    const mode = String(assessment?.labFinalConfig?.mode || "")
      .replaceAll("_", " ")
      .trim();
    return mode ? `Advanced Lab Final • ${mode}` : "Advanced Lab Final";
  }

  const name = String(assessment?.name || "").toLowerCase();

  if (courseType === "lab") {
    if (name.includes("mid")) return "Lab Mid Component";
    if (name.includes("final")) return "Regular Lab Final";
    if (name.includes("att")) return "Attendance Component";
    return "Regular Lab Assessment";
  }

  if (isCtAssessment(assessment?.name)) return "Class Test Component";
  if (name.includes("mid")) return "Mid Component";
  if (name.includes("final")) return "Final Component";
  if (name.includes("att")) return "Attendance Component";
  if (name.includes("assign")) return "Assignment Component";
  if (name.includes("pres")) return "Presentation Component";

  return "Assessment Component";
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

  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [materialsError, setMaterialsError] = useState("");
  const [materials, setMaterials] = useState([]);

  const [activeTab, setActiveTab] = useState("assessment");

  const complaintRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError("");

      setAttLoading(true);
      setAttError("");
      setAttData(null);

      try {
        const [marksRes, attendanceRes, materialsRes] = await Promise.allSettled([
          fetchStudentCourseMarks(courseId),
          fetchStudentAttendanceSheet(courseId),
          fetchStudentCourseMaterials(courseId),
        ]);

        if (marksRes.status === "fulfilled") {
          const data = marksRes.value;

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

        if (materialsRes.status === "fulfilled") {
          setMaterials(Array.isArray(materialsRes.value) ? materialsRes.value : []);
        } else {
          setMaterialsError(
            materialsRes.reason?.response?.data?.message ||
            "Course materials are not available yet."
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
        setMaterialsLoading(false);
      }
    };

    if (courseId) load();
  }, [courseId]);

  const courseType = useMemo(() => getCourseType(course), [course]);

  const {
    displayTotal,
    displayGrade,
    displayCtMain,
    displayLabMain,
    neededForAPlusText,
    statusColor,
    totalTone,
  } = useMemo(() => {
    const total = summary?.currentTotal ?? summary?.totalObtained ?? baseTotal ?? 0;
    const grade = summary?.grade ?? baseGrade ?? "-";
    const ctMain = safeNum(summary?.ctMain, 0);
    const labMain = safeNum(summary?.labMain, 0);

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
      displayLabMain: labMain % 1 === 0 ? String(labMain) : labMain.toFixed(1),
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

  const regularLabAssessments = useMemo(() => {
    if (courseType !== "lab") return [];

    return assessments.filter((a) => {
      const n = String(a?.name || "").toLowerCase();
      return (
        a?.structureType !== "lab_final" &&
        !n.includes("mid") &&
        !n.includes("final") &&
        !n.includes("att")
      );
    });
  }, [assessments, courseType]);

  const nonCtAssessments = useMemo(() => {
    if (courseType === "lab") {
      return assessments.filter((a) => {
        const n = String(a?.name || "").toLowerCase();
        return (
          a?.structureType === "lab_final" ||
          n.includes("mid") ||
          n.includes("final") ||
          n.includes("att")
        );
      });
    }

    return assessments.filter((a) => !isCtAssessment(a?.name));
  }, [assessments, courseType]);

  const breakdownMap = useMemo(() => {
    const map = {};
    (assessments || []).forEach((a) => {
      const key = a.id || a._id;
      map[key] = buildAdvancedBreakdown(a);
    });
    return map;
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

  const openComplaintTab = () => {
    setActiveTab("complaint");
    setTimeout(() => {
      complaintRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const courseTabs = [
    { key: "assessment", label: "Assessment" },
    { key: "attendance", label: "Attendance" },
    { key: "materials", label: "Materials" },
    { key: "complaint", label: "Raise Complaint" },
  ];

  if (loading) {
    return (
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-3 px-4 py-10 text-sm text-slate-500 dark:text-slate-400">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 dark:border-slate-600 dark:border-t-indigo-400" />
        <span className="font-medium">Loading course details…</span>
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
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-white via-violet-50/60 to-sky-50/70 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
        <div className="pointer-events-none absolute -top-16 right-0 h-44 w-44 rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-500/10" />
        <div className="pointer-events-none absolute -bottom-16 left-0 h-44 w-44 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-500/10" />

        <div className="relative p-4 sm:p-6 lg:p-8">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.45fr_0.85fr]">
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
                <Pill label={`Type: ${courseType === "lab" ? "Lab" : "Theory"}`} />
              </div>

              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                View your marks, track your overall performance, check advanced lab final
                breakdowns, review attendance, and submit course-specific complaints from one page.
              </p>
            </div>

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
                  label={courseType === "lab" ? "Lab Main" : "CT Main"}
                  value={courseType === "lab" ? `${displayLabMain}/25` : `${displayCtMain}/15`}
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

      <CourseSectionTabs
        tabs={courseTabs}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "assessment" && (
        <section className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Assessment Breakdown
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Published marks for this course. Advanced lab final now shows detailed breakdown.
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
                openComplaintTab();
              }}
            >
              Raise Overall Complaint
              <ChatIcon />
            </button>
          </div>

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
                    {courseType === "theory" &&
                      ctAssessments.map((a) => {
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
                                {getAssessmentHint(a, courseType)}
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
                                  openComplaintTab();
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
                          {courseType === "lab" ? "Lab Assessment (Main)" : "CT (Main)"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {courseType === "lab"
                            ? "Auto calculated from average of regular lab assessments"
                            : "Auto calculated from selected CT policy"}
                        </div>
                      </td>

                      <td className="px-6 py-5 font-semibold text-slate-900 dark:text-white">
                        {courseType === "lab" ? 25 : 15}
                      </td>

                      <td className="px-6 py-5">
                        <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-sm font-bold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                          {courseType === "lab" ? displayLabMain : displayCtMain}
                        </span>
                      </td>

                      <td className="px-6 py-5 text-right">
                        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                          Auto calculated
                        </span>
                      </td>
                    </tr>

                    {courseType === "lab" && regularLabAssessments.length > 0 && (
                      <tr className="bg-indigo-50/30 dark:bg-indigo-500/5">
                        <td colSpan={4} className="px-6 py-4">
                          <div className="rounded-2xl border border-indigo-200 bg-white p-4 dark:border-indigo-500/20 dark:bg-slate-950/60">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  Regular Lab Assessment Breakdown
                                </div>
                                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  Individual lab assessments used to calculate Lab Assessment (Main)
                                </div>
                              </div>
                              <div className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                                {regularLabAssessments.length} item{regularLabAssessments.length > 1 ? "s" : ""}
                              </div>
                            </div>

                            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                              <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-800/70">
                                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    <th className="px-4 py-3">Assessment</th>
                                    <th className="px-4 py-3">Full</th>
                                    <th className="px-4 py-3">Obtained</th>
                                    <th className="px-4 py-3 text-right">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {regularLabAssessments.map((a) => {
                                    const key = a.id || a._id;
                                    const missing = a.obtainedMarks == null;

                                    return (
                                      <tr key={key}>
                                        <td className="px-4 py-3">
                                          <div className="font-medium text-slate-900 dark:text-slate-100">
                                            {a.name}
                                          </div>
                                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            Regular Lab Assessment
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                          {a.fullMarks}
                                        </td>
                                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                                          {missing ? "—" : a.obtainedMarks}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                          <button
                                            type="button"
                                            className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/15"
                                            onClick={() => {
                                              setComplaintCategory("marks");
                                              setRelatedTo(key);
                                              setComplaintError("");
                                              setComplaintSuccess("");
                                              openComplaintTab();
                                            }}
                                          >
                                            Raise Complaint
                                            <ChevronIcon />
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {nonCtAssessments.map((a) => {
                      const key = a.id || a._id;
                      const missing = a.obtainedMarks == null;
                      const advancedRows = breakdownMap[key] || [];

                      return (
                        <ReactFragment key={key}>
                          <tr className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="px-6 py-5">
                              <div className="font-semibold text-slate-900 dark:text-white">
                                {a.name}
                              </div>
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {getAssessmentHint(a, courseType)}
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
                                  openComplaintTab();
                                }}
                              >
                                Raise Complaint
                                <ChevronIcon />
                              </button>
                            </td>
                          </tr>

                          {a?.structureType === "lab_final" && advancedRows.length > 0 && (
                            <tr className="bg-fuchsia-50/40 dark:bg-fuchsia-500/5">
                              <td colSpan={4} className="px-6 py-4">
                                <div className="rounded-2xl border border-fuchsia-200 bg-white p-4 dark:border-fuchsia-500/20 dark:bg-slate-950/60">
                                  <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                        Advanced Lab Final Breakdown
                                      </div>
                                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        Project phases, project components, and lab final questions
                                      </div>
                                    </div>
                                    <div className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-xs font-bold text-fuchsia-700 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-300">
                                      Total: {round2(a.obtainedMarks || 0)} / {a.fullMarks}
                                    </div>
                                  </div>

                                  <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                                    <table className="min-w-full text-sm">
                                      <thead className="bg-slate-50 dark:bg-slate-800/70">
                                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                          <th className="px-4 py-3">Group</th>
                                          <th className="px-4 py-3">Item</th>
                                          <th className="px-4 py-3">Full</th>
                                          <th className="px-4 py-3">Obtained</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {advancedRows.map((row) => (
                                          <tr key={row.key}>
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                              {row.group}
                                            </td>
                                            <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                                              {row.label}
                                            </td>
                                            <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                              {row.fullMarks}
                                            </td>
                                            <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                                              {round2(row.obtainedMarks)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </ReactFragment>
                      );
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-4 lg:hidden sm:p-5">
            {assessments.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                No assessments have been published yet.
              </div>
            ) : (
              <>
                {ctAssessments.map((a) => {
                  const key = a.id || a._id;
                  return (
                    <AssessmentCard
                      key={key}
                      assessment={a}
                      courseType={courseType}
                      onComplaint={() => {
                        setComplaintCategory("marks");
                        setRelatedTo(key);
                        setComplaintError("");
                        setComplaintSuccess("");
                        openComplaintTab();
                      }}
                    />
                  );
                })}

                <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 shadow-sm dark:border-violet-500/20 dark:bg-violet-500/10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {courseType === "lab" ? "Lab Assessment (Main)" : "CT (Main)"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {courseType === "lab"
                          ? "Auto calculated from average of regular lab assessments"
                          : "Auto calculated from selected CT policy"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-violet-700 dark:border-violet-500/20 dark:bg-slate-900 dark:text-violet-300">
                      {courseType === "lab" ? 25 : 15}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Your Marks
                      </div>
                      <div className="mt-1 text-2xl font-black text-violet-700 dark:text-violet-300">
                        {courseType === "lab" ? displayLabMain : displayCtMain}
                      </div>
                    </div>

                    <span className="inline-flex items-center rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-violet-700 dark:border-violet-500/20 dark:bg-slate-900 dark:text-violet-300">
                      Auto calculated
                    </span>
                  </div>
                </div>

                {nonCtAssessments.map((a) => {
                  const key = a.id || a._id;
                  return (
                    <AssessmentCard
                      key={key}
                      assessment={a}
                      courseType={courseType}
                      advancedRows={breakdownMap[key] || []}
                      onComplaint={() => {
                        setComplaintCategory("marks");
                        setRelatedTo(key);
                        setComplaintError("");
                        setComplaintSuccess("");
                        openComplaintTab();
                      }}
                    />
                  );
                })}
              </>
            )}
          </div>
        </section>
      )}

      {activeTab === "materials" && (
        <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">
                  Course Materials
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Slides and shared files uploaded by your teacher.
                </div>
              </div>

              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {materials.length} item{materials.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          <div className="p-5">
            {materialsLoading ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Loading course materials...
              </div>
            ) : materialsError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                {materialsError}
              </div>
            ) : materials.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No course materials have been shared yet.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {materials.map((item) => (
                  <div
                    key={item._id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                            {item.fileType || "file"}
                          </span>

                          {item.topic ? (
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                              {item.topic}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 text-base font-bold text-slate-900 dark:text-white">
                          {item.title}
                        </div>

                        {item.description ? (
                          <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                            {item.description}
                          </div>
                        ) : null}
                      </div>

                      <a
                        href={item.driveLink}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                      >
                        Open
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "complaint" && (
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
          </div>

          <div className="p-5 sm:p-6">
            {complaintError && (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                {complaintError}
              </div>
            )}

            {complaintSuccess && (
              <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                {complaintSuccess}
              </div>
            )}

            <form onSubmit={handleSubmitComplaint} className="space-y-5">
              <div
                className={[
                  "grid grid-cols-1 gap-4",
                  complaintCategory === "attendance" ? "md:grid-cols-3" : "md:grid-cols-2",
                ].join(" ")}
              >
                <TopControlCard label="Category" hint="Choose complaint type.">
                  <div className="relative">
                    <select
                      className="form-control h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-violet-500"
                      value={complaintCategory}
                      onChange={(e) => setComplaintCategory(e.target.value)}
                    >
                      <option value="marks">Marks</option>
                      <option value="attendance">Attendance</option>
                      <option value="general">General</option>
                    </select>

                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400 dark:text-slate-500">
                      <SelectChevronIcon />
                    </span>
                  </div>
                </TopControlCard>

                {complaintCategory === "marks" ? (
                  <TopControlCard
                    label="Related To"
                    hint="Choose overall or a specific assessment."
                  >
                    <div className="relative">
                      <select
                        className="form-control h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-violet-500"
                        value={relatedTo}
                        onChange={(e) => setRelatedTo(e.target.value)}
                      >
                        <option value="overall">Overall Result</option>
                        {assessments.map((a) => {
                          const key = a.id || a._id;
                          return (
                            <option key={key} value={key}>
                              {a.name}
                            </option>
                          );
                        })}
                      </select>

                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400 dark:text-slate-500">
                        <SelectChevronIcon />
                      </span>
                    </div>
                  </TopControlCard>
                ) : complaintCategory === "attendance" ? (
                  <>
                    <TopControlCard
                      label="Date"
                      hint="Select the attendance session date."
                    >
                      <DatePickerField
                        value={complaintAttDate}
                        onChange={setComplaintAttDate}
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
                        className="form-control h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-violet-500"
                        value={complaintAttPeriod}
                        onChange={(e) => setComplaintAttPeriod(e.target.value)}
                      />
                    </TopControlCard>
                  </>
                ) : null}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Your message
                </label>

                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <textarea
                    rows={7}
                    className="min-h-[180px] w-full resize-y border-0 bg-transparent p-0 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
                    placeholder={
                      complaintCategory === "marks"
                        ? "Example: My Mid mark seems missing, breakdown is wrong, or the total looks incorrect. Please review."
                        : complaintCategory === "attendance"
                          ? "Example: I was present but marked absent. Please check this class session."
                          : "Example: Assessment missing, marks not visible, or another course-related issue."
                    }
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>

                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Write the issue clearly and briefly. Mention exact component, phase,
                  question, date, or period where relevant.
                </p>
              </div>

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
      )}

      {activeTab === "attendance" && (
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
                    openComplaintTab();
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
                    Showing latest 10 sessions. Click “View Full Attendance” to see all.
                  </div>
                )}
              </>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}

function CourseSectionTabs({ tabs, activeTab, onChange }) {
  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2 p-3 sm:p-4">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onChange(tab.key)}
                className={[
                  "inline-flex items-center justify-center whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-semibold transition",
                  isActive
                    ? "bg-violet-600 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AssessmentCard({ assessment, courseType, advancedRows = [], onComplaint }) {
  const missing = assessment?.obtainedMarks == null;
  const hint = getAssessmentHint(assessment, courseType);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 dark:text-white">
            {assessment.name}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {hint}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {assessment.fullMarks}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Your Marks
          </div>
          <div className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
            {missing ? "—" : round2(assessment.obtainedMarks)}
          </div>
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/15"
          onClick={onComplaint}
        >
          Raise Complaint
          <ChevronIcon />
        </button>
      </div>

      {assessment?.structureType === "lab_final" && advancedRows.length > 0 && (
        <div className="mt-4 rounded-2xl border border-fuchsia-200 bg-fuchsia-50/40 p-4 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10">
          <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
            Breakdown
          </div>

          <div className="space-y-2">
            {advancedRows.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/80 bg-white/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {row.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {row.group}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {round2(row.obtainedMarks)} / {row.fullMarks}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ label }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
      {label}
    </span>
  );
}

function ActionMiniCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/80">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}

function DatePickerField({ value, onChange }) {
  const inputRef = useRef(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;

    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
      } else {
        input.focus();
        input.click();
      }
    } catch {
      input.focus();
      input.click();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseDown={(e) => {
        e.preventDefault();
        openPicker();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPicker();
        }
      }}
      className="flex h-12 w-full cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:border-violet-300 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-violet-500/50 dark:focus-within:border-violet-500"
    >
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={openPicker}
        className="form-control h-full w-full cursor-pointer border-0 bg-transparent p-0 text-sm font-medium text-slate-700 outline-none focus:ring-0 dark:text-slate-100"
      />
    </div>
  );
}
function TopControlCard({ label, hint, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
      <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </label>
      {hint && (
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      )}
      {children}
    </div>
  );
}

function ReactFragment({ children }) {
  return <>{children}</>;
}

function SelectChevronIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8l4 4 4-4" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2z" />
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

function ChatIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22l-4-9-9-4 20-7z" />
    </svg>
  );
}