import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import Swal from "sweetalert2";
import { saveAs } from "file-saver";

import { getCourseStudents } from "../../services/enrollmentService";
import {
  fetchMarksForCourse,
  saveMarksForCourseRequest,
} from "../../services/markService";
import {
  fetchAssessmentsForCourse,
  publishAssessmentRequest,
} from "../../services/assessmentService";
import { fetchAttendanceSummary } from "../../services/attendanceSummaryService";

function getCourseType(course) {
  const t = (course?.courseType || course?.type || "").toLowerCase();
  if (t.includes("lab")) return "lab";
  return "theory";
}

function gradeFromTotal(total) {
  const t = Number(total || 0);
  if (t >= 80) return "A+";
  if (t >= 75) return "A";
  if (t >= 70) return "A-";
  if (t >= 65) return "B+";
  if (t >= 60) return "B";
  if (t >= 55) return "B-";
  if (t >= 50) return "C+";
  if (t >= 45) return "C";
  if (t >= 40) return "D";
  return "F";
}

function clamp(n, min, max) {
  const x = Number(n ?? 0);
  return Math.max(min, Math.min(max, x));
}

function pct(obt, full) {
  const o = Number(obt ?? 0);
  const f = Number(full ?? 0);
  if (f <= 0) return 0;
  return clamp(o, 0, f) / f;
}

function normalizeCtPolicy(course) {
  const raw = course?.classTestPolicy || {};

  return {
    mode: raw.mode || "best_n_average_scaled",
    bestCount:
      Number(raw.bestCount) > 0
        ? Number(raw.bestCount)
        : raw.mode === "best_one_scaled"
          ? 1
          : 2,
    totalWeight:
      Number(raw.totalWeight) >= 0 ? Number(raw.totalWeight) : 15,
    manualSelectedAssessmentIds: Array.isArray(raw.manualSelectedAssessmentIds)
      ? raw.manualSelectedAssessmentIds.map(String)
      : [],
  };
}

function isCtAssessment(nameRaw) {
  const n = String(nameRaw || "").toLowerCase().trim();

  if (n.includes("mid") || n.includes("final") || n.includes("att")) return false;
  if (n.includes("assign") || n.includes("present")) return false;

  const compact = n.replace(/[\s\-_]+/g, "");

  if (compact.startsWith("ct")) return true;
  if (compact.includes("classtest")) return true;
  if (n.includes("class test")) return true;
  if (n.includes("quiz")) return true;
  if (n.includes("test")) return true;

  return false;
}

function roundPolicyTotal(total) {
  return total % 1 === 0
    ? total
    : total % 1 <= 0.5
      ? Math.floor(total) + 0.5
      : Math.ceil(total);
}

function computeCtScore(course, assessments, rowMarks) {
  const policy = normalizeCtPolicy(course);
  const totalWeight = Number(policy.totalWeight || 15);

  const ctRows = (assessments || [])
    .filter((a) => isCtAssessment(a?.name))
    .map((a) => ({
      assessment: a,
      id: String(a._id),
      percent: pct(rowMarks?.[a._id], a.fullMarks),
    }));

  if (!ctRows.length || totalWeight <= 0) return 0;

  if (policy.mode === "manual_average_scaled") {
    const selected = ctRows.filter((r) =>
      policy.manualSelectedAssessmentIds.includes(r.id)
    );

    if (!selected.length) return 0;

    const avg =
      selected.reduce((sum, item) => sum + item.percent, 0) / selected.length;

    return avg * totalWeight;
  }

  const sorted = [...ctRows].sort((a, b) => b.percent - a.percent);

  if (policy.mode === "best_one_scaled") {
    return (sorted[0]?.percent || 0) * totalWeight;
  }

  const count = Math.max(1, Number(policy.bestCount || 2));
  const chosen = sorted.slice(0, count);

  if (!chosen.length) return 0;

  if (policy.mode === "best_n_individual_scaled") {
    const eachWeight = totalWeight / chosen.length;
    return chosen.reduce((sum, item) => sum + item.percent * eachWeight, 0);
  }

  const avg =
    chosen.reduce((sum, item) => sum + item.percent, 0) / chosen.length;

  return avg * totalWeight;
}

function getCtMain(course, assessments, rowMarks) {
  const ctScore = computeCtScore(course, assessments, rowMarks);
  return roundPolicyTotal(ctScore);
}

function getLabMain(assessments, rowMarks) {
  const list = Array.isArray(assessments) ? assessments : [];

  const regularLabAssessments = list.filter((a) => {
    const n = String(a?.name || "").toLowerCase();
    return !n.includes("mid") && !n.includes("final") && !n.includes("att");
  });

  if (!regularLabAssessments.length) return 0;

  const avgPercent =
    regularLabAssessments.reduce(
      (sum, a) => sum + pct(rowMarks?.[a._id], a.fullMarks),
      0
    ) / regularLabAssessments.length;

  return roundPolicyTotal(avgPercent * 25);
}

function computeTotal100(course, assessments, rowMarks, attendanceMarks5 = 0) {
  const courseType = getCourseType(course);
  const list = Array.isArray(assessments) ? assessments : [];
  const name = (a) => String(a?.name || "").toLowerCase();

  const attScore5 = clamp(attendanceMarks5, 0, 5);

  if (courseType === "lab") {
    const labList = list.filter((a) => {
      const n = name(a);
      return !n.includes("mid") && !n.includes("final") && !n.includes("att");
    });

    const mid = list.find((a) => name(a).includes("mid"));
    const final = list.find((a) => name(a).includes("final"));

    const labPercents = labList.map((a) => pct(rowMarks?.[a._id], a.fullMarks));
    const avgLab = labPercents.length
      ? labPercents.reduce((s, v) => s + v, 0) / labPercents.length
      : 0;

    const labScore25 = avgLab * 25;
    const midScore30 = mid ? pct(rowMarks?.[mid._id], mid.fullMarks) * 30 : 0;
    const finalScore40 = final ? pct(rowMarks?.[final._id], final.fullMarks) * 40 : 0;

    return roundPolicyTotal(labScore25 + midScore30 + finalScore40 + attScore5);
  }

  const mid = list.find((a) => name(a).includes("mid"));
  const final = list.find((a) => name(a).includes("final"));
  const presentation = list.find((a) => name(a).includes("present"));
  const assignment = list.find((a) => name(a).includes("assign"));

  const ctScore = computeCtScore(course, list, rowMarks);

  const midScore30 = mid ? pct(rowMarks?.[mid._id], mid.fullMarks) * 30 : 0;
  const finalScore40 = final ? pct(rowMarks?.[final._id], final.fullMarks) * 40 : 0;

  let paScore10 = 0;
  const hasP = !!presentation;
  const hasA = !!assignment;

  if (hasP && hasA) {
    const p5 = pct(rowMarks?.[presentation._id], presentation.fullMarks) * 5;
    const a5 = pct(rowMarks?.[assignment._id], assignment.fullMarks) * 5;
    paScore10 = p5 + a5;
  } else if (hasP) {
    paScore10 = pct(rowMarks?.[presentation._id], presentation.fullMarks) * 10;
  } else if (hasA) {
    paScore10 = pct(rowMarks?.[assignment._id], assignment.fullMarks) * 10;
  }

  return roundPolicyTotal(ctScore + midScore30 + finalScore40 + paScore10 + attScore5);
}

export default function TabMarks({ courseId, course }) {
  const [students, setStudents] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [marksMap, setMarksMap] = useState({});
  const [attMarksMap, setAttMarksMap] = useState({});

  const [loading, setLoading] = useState(true);
  const [marksError, setMarksError] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishingAssessmentId, setPublishingAssessmentId] = useState(null);

  const [tabMode, setTabMode] = useState("row");
  const [sortMode, setSortMode] = useState("entered");

  const inputRefs = useRef([]);
  const originalStudentsRef = useRef([]);

  const loadAllData = async () => {
    setLoading(true);
    setMarksError("");

    let studentsData = [];
    let assessmentsData = [];

    try {
      const res = await Promise.all([
        getCourseStudents(courseId),
        fetchAssessmentsForCourse(courseId),
      ]);

      studentsData = res[0] || [];
      assessmentsData = res[1] || [];

      setStudents(studentsData);
      originalStudentsRef.current = studentsData;
      setAssessments(assessmentsData);
    } catch (e) {
      console.error(e);
      setMarksError(
        e?.response?.data?.message || "Failed to load students/assessments"
      );
      setStudents([]);
      originalStudentsRef.current = [];
      setAssessments([]);
      setMarksMap({});
      setAttMarksMap({});
      setLoading(false);
      return;
    }

    try {
      const [marksData, attSummary] = await Promise.allSettled([
        fetchMarksForCourse(courseId),
        fetchAttendanceSummary(courseId),
      ]);

      const map = {};

      if (marksData.status === "fulfilled") {
        (marksData.value || []).forEach((m) => {
          const sid = m.student;
          if (!map[sid]) map[sid] = {};
          map[sid][m.assessment] = m.obtainedMarks;
        });
      } else {
        console.warn("Marks load failed:", marksData.reason);
      }

      if (attSummary.status === "fulfilled") {
        const attRows = attSummary.value || [];

        const newAttMap = {};
        attRows.forEach((r) => {
          newAttMap[r.student] = Number(r.marks ?? 0);
        });
        setAttMarksMap(newAttMap);

        const attendanceAssessment = (assessmentsData || []).find((a) =>
          String(a.name || "").toLowerCase().includes("att")
        );

        if (attendanceAssessment) {
          attRows.forEach((r) => {
            const sid = r.student;
            if (!map[sid]) map[sid] = {};
            map[sid][attendanceAssessment._id] = r.marks ?? 0;
          });
        }
      } else {
        console.warn("Attendance summary load failed:", attSummary.reason);
        setAttMarksMap({});
      }

      setMarksMap(map);
    } catch (e) {
      console.error(e);
      setMarksError("Failed to load marks/attendance summary");
      setMarksMap({});
      setAttMarksMap({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const sortedStudents = useMemo(() => {
    if (sortMode === "entered") return originalStudentsRef.current || [];

    const copy = [...students];
    copy.sort((a, b) => {
      const ra = String(a.roll ?? "");
      const rb = String(b.roll ?? "");
      if (sortMode === "roll-asc") {
        return ra.localeCompare(rb, undefined, { numeric: true });
      }
      if (sortMode === "roll-desc") {
        return rb.localeCompare(ra, undefined, { numeric: true });
      }
      return 0;
    });
    return copy;
  }, [students, sortMode]);

  const totalsPerStudent = useMemo(() => {
    const totals = {};
    students.forEach((s) => {
      const row = marksMap[s.id] || {};
      const att5 = Number(attMarksMap?.[s.id] ?? 0);
      totals[s.id] = computeTotal100(
        course,
        assessments,
        row,
        att5
      );
    });
    return totals;
  }, [students, marksMap, attMarksMap, assessments, course]);

  const courseType = getCourseType(course);
  const courseTypeLabel = courseType === "lab" ? "Lab Course" : "Theory Course";

  const ctAssessments = useMemo(() => {
    return assessments.filter((a) => isCtAssessment(a?.name));
  }, [assessments]);

  const labRegularAssessments = useMemo(() => {
    if (courseType !== "lab") return [];
    return assessments.filter((a) => {
      const n = String(a?.name || "").toLowerCase();
      return !n.includes("mid") && !n.includes("final") && !n.includes("att");
    });
  }, [assessments, courseType]);

  const nonCtAssessments = useMemo(() => {
    if (courseType === "lab") {
      return assessments.filter((a) => {
        const n = String(a?.name || "").toLowerCase();
        return n.includes("mid") || n.includes("final") || n.includes("att");
      });
    }

    return assessments.filter((a) => !isCtAssessment(a?.name));
  }, [assessments, courseType]);

  const currentCtPolicyText =
    courseType === "lab"
      ? ""
      : (() => {
        const p = normalizeCtPolicy(course);
        if (p.mode === "best_n_individual_scaled") {
          return `Best ${p.bestCount} CT individually scaled to ${p.totalWeight}`;
        }
        if (p.mode === "best_one_scaled") {
          return `Best 1 CT scaled to ${p.totalWeight}`;
        }
        if (p.mode === "manual_average_scaled") {
          return `Average of selected CTs scaled to ${p.totalWeight}`;
        }
        return `Average of best ${p.bestCount} CT scaled to ${p.totalWeight}`;
      })();

  const stats = useMemo(() => {
    const n = sortedStudents.length;
    if (!n) return { avg: 0, top: 0, pass: 0 };

    const totals = sortedStudents.map((s) => Number(totalsPerStudent[s.id] ?? 0));
    const sum = totals.reduce((a, b) => a + b, 0);
    const avg = sum / n;
    const top = Math.max(...totals);
    const pass = totals.filter((t) => t >= 40).length;

    return { avg, top, pass };
  }, [sortedStudents, totalsPerStudent]);

  const handleMarkChange = (studentId, assessmentId, value) => {
    setMarksMap((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [assessmentId]: value,
      },
    }));
  };

  const focusCell = (r, c) => {
    const el = inputRefs.current?.[r]?.[c];
    if (el && typeof el.focus === "function") el.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key !== "Tab") return;

    const r = Number(e.currentTarget.dataset.row);
    const c = Number(e.currentTarget.dataset.col);
    if (Number.isNaN(r) || Number.isNaN(c)) return;

    e.preventDefault();

    const maxR = sortedStudents.length - 1;
    const maxC = assessments.length - 1;

    let nextR = r;
    let nextC = c;

    if (tabMode === "row") {
      if (c < maxC) nextC = c + 1;
      else if (r < maxR) {
        nextR = r + 1;
        nextC = 0;
      }
    } else {
      if (r < maxR) nextR = r + 1;
      else if (c < maxC) {
        nextR = 0;
        nextC = c + 1;
      }
    }

    focusCell(nextR, nextC);
  };

  const handleSave = async () => {
    setSaving(true);
    setMarksError("");

    try {
      const payload = [];

      sortedStudents.forEach((s) => {
        const row = marksMap[s.id] || {};
        assessments.forEach((a) => {
          if (String(a.name || "").toLowerCase().includes("att")) return;

          const raw = row[a._id];
          if (raw === "" || raw == null) return;

          const num = Number(raw);
          if (Number.isNaN(num)) return;

          payload.push({
            studentId: s.id,
            assessmentId: a._id,
            obtainedMarks: num,
          });
        });
      });

      await saveMarksForCourseRequest(courseId, payload);

      Swal.fire({
        title: "Marks Saved!",
        text: "Marks saved successfully!",
        icon: "success",
      });
    } catch (err) {
      console.error(err);
      setMarksError(err?.response?.data?.message || "Failed to save marks");
    } finally {
      setSaving(false);
    }
  };

  const handlePublishAssessment = async (assessment) => {
    const assessmentName = assessment?.name || "This assessment";

    const result = await Swal.fire({
      title: `Publish ${assessmentName}?`,
      text: "Students will be able to see marks for this assessment.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, publish",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#4f46e5",
    });

    if (!result.isConfirmed) return;

    try {
      setPublishingAssessmentId(assessment._id);
      setMarksError("");

      await publishAssessmentRequest(courseId, assessment._id);

      await Swal.fire({
        title: "Published!",
        text: `${assessmentName} is now visible to students.`,
        icon: "success",
        timer: 1500,
        showConfirmButton: false,
      });

      await loadAllData();
    } catch (err) {
      console.error(err);
      Swal.fire({
        title: "Publish failed",
        text: err?.response?.data?.message || "Failed to publish assessment",
        icon: "error",
      });
    } finally {
      setPublishingAssessmentId(null);
    }
  };

  const handleExportExcel = () => {
    if (!sortedStudents.length || !assessments.length) {
      Swal.fire({
        icon: "info",
        title: "Nothing to export",
        text: "There are no students or assessments to export.",
      });
      return;
    }

    const rows = sortedStudents.map((s) => {
      const rowMarks = marksMap[s.id] || {};
      const total = totalsPerStudent[s.id] ?? 0;

      const obj = { Roll: s.roll, Name: s.name };

      assessments.forEach((a) => {
        const colName = `${a.name} (${a.fullMarks})`;
        obj[colName] = rowMarks[a._id] ?? "";
      });

      obj["Total (100)"] = total;
      obj["Grade"] = gradeFromTotal(total);

      return obj;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 14 },
      { wch: 24 },
      ...assessments.map(() => ({ wch: 14 })),
      { wch: 12 },
      { wch: 10 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Marksheet");

    const safeCode = (course?.code || "Course").replace(/[^\w-]+/g, "_");
    const safeSection = (course?.section || "")
      .toString()
      .replace(/[^\w-]+/g, "_");
    const safeSemester = (course?.semester || "")
      .toString()
      .replace(/[^\w-]+/g, "_");
    const safeYear = (course?.year || "")
      .toString()
      .replace(/[^\w-]+/g, "_");

    const fileName = `${safeCode}_Sec${safeSection}_${safeSemester}_${safeYear}_Marksheet.xlsx`;

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(blob, fileName);
  };

  const courseBadgeClass =
    courseType === "lab"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
      : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300";

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-indigo-50/70 px-6 py-6 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Marks Entry
                </span>

                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${courseBadgeClass}`}
                >
                  {courseTypeLabel}
                </span>
              </div>

              <h3 className="mt-3 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Enter, review, publish, and export marks in one place
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Attendance marks are pulled automatically from the Attendance tab
                and included in the final total out of 100.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                <MiniStat label="Students" value={sortedStudents.length} />
                <MiniStat label="Assessments" value={assessments.length} />
                <MiniStat label="Average" value={stats.avg.toFixed(1)} />
                <MiniStat label="Top" value={stats.top.toFixed(1)} />
                <MiniStat label="Pass" value={stats.pass} />
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[420px]">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <ControlSelect
                  label="Sort students"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value)}
                  options={[
                    { value: "entered", label: "Entered order" },
                    { value: "roll-asc", label: "Roll ascending" },
                    { value: "roll-desc", label: "Roll descending" },
                  ]}
                />

                <ControlSelect
                  label="Tab navigation"
                  value={tabMode}
                  onChange={(e) => setTabMode(e.target.value)}
                  options={[
                    { value: "row", label: "Row-wise" },
                    { value: "col", label: "Column-wise" },
                  ]}
                />
              </div>

              <div className="flex flex-wrap gap-3 xl:justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Marks"}
                </button>

                <button
                  onClick={handleExportExcel}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  Export Excel
                </button>
              </div>
            </div>
          </div>
        </div>

        {marksError && (
          <div className="border-t border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            {marksError}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Marks Grid
            </h4>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Use Tab to move quickly through cells. Totals and grades are calculated automatically.
            </p>
          </div>

          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Total is auto-calculated /100
          </span>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-indigo-400" />
              Loading marks data...
            </div>
          ) : sortedStudents.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              No students enrolled. Add students first.
            </div>
          ) : assessments.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              No assessments yet. Add CT, Mid, Final, Attendance, or other assessments first.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800">
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="sticky left-0 z-30 min-w-[110px] bg-slate-50 px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      Roll
                    </th>

                    <th className="sticky left-[110px] z-30 min-w-[220px] bg-slate-50 px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      Student
                    </th>

                    {courseType === "lab"
                      ? labRegularAssessments.map((a) => (
                        <th
                          key={a._id}
                          className="min-w-[180px] px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                        >
                          <div className="space-y-2">
                            <div>
                              <div className="text-sm font-semibold normal-case text-slate-800 dark:text-slate-100">
                                {a.name}
                              </div>
                              <div className="mt-0.5 text-[11px] font-medium normal-case text-slate-400 dark:text-slate-500">
                                Full marks: {a.fullMarks}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${a.isPublished
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                                  : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                                  }`}
                              >
                                {a.isPublished ? "Published" : "Draft"}
                              </span>

                              <button
                                type="button"
                                onClick={() => handlePublishAssessment(a)}
                                disabled={publishingAssessmentId === a._id}
                                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                {publishingAssessmentId === a._id
                                  ? "Publishing..."
                                  : a.isPublished
                                    ? "Republish"
                                    : "Publish"}
                              </button>
                            </div>
                          </div>
                        </th>
                      ))
                      : ctAssessments.map((a) => (
                        <th
                          key={a._id}
                          className="min-w-[180px] px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                        >
                          <div className="space-y-2">
                            <div>
                              <div className="text-sm font-semibold normal-case text-slate-800 dark:text-slate-100">
                                {a.name}
                              </div>
                              <div className="mt-0.5 text-[11px] font-medium normal-case text-slate-400 dark:text-slate-500">
                                Full marks: {a.fullMarks}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${a.isPublished
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                                  : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                                  }`}
                              >
                                {a.isPublished ? "Published" : "Draft"}
                              </span>

                              <button
                                type="button"
                                onClick={() => handlePublishAssessment(a)}
                                disabled={publishingAssessmentId === a._id}
                                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                {publishingAssessmentId === a._id
                                  ? "Publishing..."
                                  : a.isPublished
                                    ? "Republish"
                                    : "Publish"}
                              </button>
                            </div>
                          </div>
                        </th>
                      ))}

                    <th className="min-w-[150px] px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      <div className="space-y-1">
                        <div>{courseType === "lab" ? "Lab Assessment (Main)" : "CT (Main)"}</div>
                        <div className="text-[11px] font-medium normal-case text-slate-400 dark:text-slate-500">
                          {courseType === "lab" ? "Auto /25" : "Auto /15"}
                        </div>
                      </div>
                    </th>

                    {nonCtAssessments.map((a) => (
                      <th
                        key={a._id}
                        className="min-w-[180px] px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                      >
                        <div className="space-y-2">
                          <div>
                            <div className="text-sm font-semibold normal-case text-slate-800 dark:text-slate-100">
                              {a.name}
                            </div>
                            <div className="mt-0.5 text-[11px] font-medium normal-case text-slate-400 dark:text-slate-500">
                              Full marks: {a.fullMarks}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${a.isPublished
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                                : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                                }`}
                            >
                              {a.isPublished ? "Published" : "Draft"}
                            </span>

                            <button
                              type="button"
                              onClick={() => handlePublishAssessment(a)}
                              disabled={publishingAssessmentId === a._id}
                              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              {publishingAssessmentId === a._id
                                ? "Publishing..."
                                : a.isPublished
                                  ? "Republish"
                                  : "Publish"}
                            </button>
                          </div>
                        </div>
                      </th>
                    ))}

                    <th className="min-w-[130px] px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Total /100
                    </th>

                    <th className="min-w-[110px] px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Grade
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sortedStudents.map((s, rowIndex) => {
                    const row = marksMap[s.id] || {};
                    const total = totalsPerStudent[s.id] ?? 0;

                    return (
                      <tr
                        key={s.enrollmentId || s.id}
                        className="group hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                      >
                        <td className="sticky left-0 z-10 whitespace-nowrap border-r border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">
                            {s.roll}
                          </span>
                        </td>

                        <td className="sticky left-[110px] z-10 whitespace-nowrap border-r border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                          <div className="max-w-[220px] truncate font-medium text-slate-800 dark:text-slate-100">
                            {s.name}
                          </div>
                        </td>

                        {(courseType === "lab" ? labRegularAssessments : ctAssessments).map(
                          (a, colIndex) => {
                            const isAttendanceCol = String(a.name || "")
                              .toLowerCase()
                              .includes("att");

                            return (
                              <td key={a._id} className="px-4 py-3">
                                <input
                                  type="number"
                                  disabled={isAttendanceCol}
                                  className={[
                                    "h-11 w-24 rounded-xl border px-3 text-sm shadow-sm transition",
                                    "focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500",
                                    isAttendanceCol
                                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                                      : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-slate-500",
                                  ].join(" ")}
                                  value={row[a._id] ?? ""}
                                  onChange={(e) =>
                                    handleMarkChange(s.id, a._id, e.target.value)
                                  }
                                  onKeyDown={handleKeyDown}
                                  data-row={rowIndex}
                                  data-col={colIndex}
                                  ref={(el) => {
                                    if (!inputRefs.current[rowIndex]) {
                                      inputRefs.current[rowIndex] = [];
                                    }
                                    inputRefs.current[rowIndex][colIndex] = el;
                                  }}
                                />
                              </td>
                            );
                          }
                        )}

                        <td className="px-4 py-3">
                          <div
                            title={
                              courseType === "lab"
                                ? "Calculated from average of all lab assessments and converted to 25"
                                : "Calculated from selected CT policy"
                            }
                            className="inline-flex min-w-[72px] items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
                          >
                            {courseType === "lab"
                              ? getLabMain(assessments, row)
                              : getCtMain(course, assessments, row)}
                          </div>
                        </td>

                        {nonCtAssessments.map((a, index) => {
                          const firstPartCount =
                            courseType === "lab"
                              ? labRegularAssessments.length
                              : ctAssessments.length;

                          const actualColIndex = firstPartCount + index;

                          const isAttendanceCol = String(a.name || "")
                            .toLowerCase()
                            .includes("att");

                          return (
                            <td key={a._id} className="px-4 py-3">
                              <input
                                type="number"
                                disabled={isAttendanceCol}
                                className={[
                                  "h-11 w-24 rounded-xl border px-3 text-sm shadow-sm transition",
                                  "focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500",
                                  isAttendanceCol
                                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                                    : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-slate-500",
                                ].join(" ")}
                                value={row[a._id] ?? ""}
                                onChange={(e) =>
                                  handleMarkChange(s.id, a._id, e.target.value)
                                }
                                onKeyDown={handleKeyDown}
                                data-row={rowIndex}
                                data-col={actualColIndex + 1}
                                ref={(el) => {
                                  if (!inputRefs.current[rowIndex]) {
                                    inputRefs.current[rowIndex] = [];
                                  }
                                  inputRefs.current[rowIndex][actualColIndex + 1] = el;
                                }}
                              />
                            </td>
                          );
                        })}

                        {/* <td className="px-4 py-3">
                          <div
                            title="Calculated from selected CT policy"
                            className="inline-flex min-w-[72px] items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
                          >
                            {getCtMain(course, assessments, row)}
                          </div>
                        </td> */}

                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                            {Number(total).toFixed(1)}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <GradeBadge grade={gradeFromTotal(total)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && sortedStudents.length > 0 && assessments.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Marks"}
              </button>

              <button
                onClick={handleExportExcel}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Export Excel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}

function ControlSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={onChange}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function GradeBadge({ grade }) {
  const cls =
    grade === "A+"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
      : grade === "A" || grade === "A-"
        ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300"
        : grade === "B+" || grade === "B" || grade === "B-"
          ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
          : grade === "C+" || grade === "C"
            ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
            : grade === "D"
              ? "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300"
              : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold ${cls}`}
    >
      {grade}
    </span>
  );
}