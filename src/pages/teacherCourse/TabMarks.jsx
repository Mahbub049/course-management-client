import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import Swal from "sweetalert2";
import { saveAs } from "file-saver";

import { getCourseStudents } from "../../services/enrollmentService";
import {
  fetchMarksForCourse,
  saveMarksForCourseRequest,
} from "../../services/markService";
import { fetchAssessmentsForCourse } from "../../services/assessmentService";
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
  return clamp(o, 0, f) / f; // 0..1
}

/**
 * ✅ Total /100:
 *  - THEORY:
 *      CT: best 2 -> average -> /15
 *      Mid: /30
 *      Final: /40
 *      Presentation/Assignment:
 *        if both exist -> 5 + 5
 *        else whichever exists -> /10
 *      Attendance: /5 from attendance summary
 *  - LAB:
 *      All non-mid/final/att assessments: avg -> /25
 *      Mid: /30
 *      Final: /40
 *      Attendance: /5 from attendance summary
 */
function computeTotal100(courseType, assessments, rowMarks, attendanceMarks5 = 0) {
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

    const total = labScore25 + midScore30 + finalScore40 + attScore5;
    return Math.round(total * 100) / 100;
  }

  const ctList = list.filter((a) => name(a).includes("ct"));
  const mid = list.find((a) => name(a).includes("mid"));
  const final = list.find((a) => name(a).includes("final"));
  const presentation = list.find((a) => name(a).includes("present"));
  const assignment = list.find((a) => name(a).includes("assign"));

  const ctPercents = ctList
    .map((a) => pct(rowMarks?.[a._id], a.fullMarks))
    .sort((x, y) => y - x);

  const bestTwo = ctPercents.slice(0, 2);
  const ctAvg = bestTwo.length
    ? bestTwo.reduce((s, v) => s + v, 0) / bestTwo.length
    : 0;
  const ctScore15 = ctAvg * 15;

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

  const total = ctScore15 + midScore30 + finalScore40 + paScore10 + attScore5;
  return Math.round(total * 100) / 100;
}

export default function TabMarks({ courseId, course }) {
  const [students, setStudents] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [marksMap, setMarksMap] = useState({});
  const [attMarksMap, setAttMarksMap] = useState({}); // { [studentId]: marksOutOf5 }

  const [loading, setLoading] = useState(true);
  const [marksError, setMarksError] = useState("");
  const [saving, setSaving] = useState(false);

  const [tabMode, setTabMode] = useState("row"); // row | col
  const inputRefs = useRef([]);

  // ✅ NEW: Sort modes
  const [sortMode, setSortMode] = useState("entered"); // entered | roll-asc | roll-desc
  const originalStudentsRef = useRef([]); // preserve entered order

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      setMarksError("");

      let studentsData = [];
      let assessmentsData = [];

      // ✅ Load students + assessments first
      try {
        const res = await Promise.all([
          getCourseStudents(courseId),
          fetchAssessmentsForCourse(courseId),
        ]);
        studentsData = res[0] || [];
        assessmentsData = res[1] || [];

        setStudents(studentsData);
        originalStudentsRef.current = studentsData; // ✅ keep original order
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

      // ✅ Load marks + attendance summary (optional)
      try {
        const [marksData, attSummary] = await Promise.allSettled([
          fetchMarksForCourse(courseId),
          fetchAttendanceSummary(courseId),
        ]);

        const map = {};

        // ---- marks (non-attendance) from Mark collection ----
        if (marksData.status === "fulfilled") {
          (marksData.value || []).forEach((m) => {
            const sid = m.student;
            if (!map[sid]) map[sid] = {};
            map[sid][m.assessment] = m.obtainedMarks;
          });
        } else {
          console.warn("Marks load failed:", marksData.reason);
        }

        // ---- attendance summary (/5) ----
        if (attSummary.status === "fulfilled") {
          const attRows = attSummary.value || [];

          const newAttMap = {};
          attRows.forEach((r) => {
            newAttMap[r.student] = Number(r.marks ?? 0); // already /5
          });
          setAttMarksMap(newAttMap);

          // also show in Attendance column if an Attendance assessment exists
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
    }

    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

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

    const maxR = sortedStudents.length - 1; // ✅ use sorted list
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

      // ✅ payload order does not matter, but use sortedStudents for consistency
      sortedStudents.forEach((s) => {
        const row = marksMap[s.id] || {};
        assessments.forEach((a) => {
          // ✅ attendance is saved in Attendance tab, not here
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

  const courseType = getCourseType(course);

  const totalsPerStudent = useMemo(() => {
    const totals = {};
    students.forEach((s) => {
      const row = marksMap[s.id] || {};
      const att5 = Number(attMarksMap?.[s.id] ?? 0);
      totals[s.id] = computeTotal100(courseType, assessments, row, att5);
    });
    return totals;
  }, [courseType, students, assessments, marksMap, attMarksMap]);

  // ✅ NEW: Sorting result list
  const sortedStudents = useMemo(() => {
    if (sortMode === "entered") {
      return originalStudentsRef.current || [];
    }

    const copy = [...students];

    copy.sort((a, b) => {
      const ra = String(a.roll ?? "");
      const rb = String(b.roll ?? "");
      if (sortMode === "roll-asc")
        return ra.localeCompare(rb, undefined, { numeric: true });
      if (sortMode === "roll-desc")
        return rb.localeCompare(ra, undefined, { numeric: true });
      return 0;
    });

    return copy;
  }, [students, sortMode]);

  const handleExportExcel = () => {
    if (!sortedStudents.length || !assessments.length) {
      alert("Nothing to export.");
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
      { wch: 22 },
      ...assessments.map(() => ({ wch: 14 })),
      { wch: 12 },
      { wch: 8 },
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
    const safeYear = (course?.year || "").toString().replace(/[^\w-]+/g, "_");

    const fileName = `${safeCode}_Sec${safeSection}_${safeSemester}_${safeYear}_Marksheet.xlsx`;

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(blob, fileName);
  };

  const courseTypeLabel = courseType === "lab" ? "Lab Course" : "Theory Course";

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

  const badgeClass =
    courseType === "lab"
      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
      : "bg-sky-50 text-sky-700 border border-sky-200";

  return (
    <div className="space-y-6">
      {/* Header / Summary */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  Marks Entry
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}
                >
                  {courseTypeLabel}
                </span>
              </div>

              <h3 className="mt-2 text-lg font-semibold text-slate-900">
                Enter marks quickly and export a clean Excel marksheet
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Attendance is read from the Attendance tab (out of 5) and included in total /100.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                  Students:{" "}
                  <span className="ml-1 font-semibold">{sortedStudents.length}</span>
                </span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                  Assessments:{" "}
                  <span className="ml-1 font-semibold">{assessments.length}</span>
                </span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                  Avg:{" "}
                  <span className="ml-1 font-semibold">{stats.avg.toFixed(1)}</span>
                </span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                  Top:{" "}
                  <span className="ml-1 font-semibold">{stats.top.toFixed(1)}</span>
                </span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                  Pass: <span className="ml-1 font-semibold">{stats.pass}</span>
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:items-end">
              {/* ✅ Controls row */}
              <div className="flex flex-wrap items-center gap-3 justify-end">
                {/* Sort */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">Sort by</span>
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  >
                    <option value="entered">Entered order</option>
                    <option value="roll-asc">Roll (Ascending)</option>
                    <option value="roll-desc">Roll (Descending)</option>
                  </select>
                </div>

                {/* Tab navigation */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">
                    Tab navigation
                  </span>
                  <select
                    value={tabMode}
                    onChange={(e) => setTabMode(e.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  >
                    <option value="row">Row-wise (CT1 → CT2)</option>
                    <option value="col">Column-wise (downwards)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Marks"}
                </button>

                <button
                  onClick={handleExportExcel}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  Export Excel
                </button>
              </div>
            </div>
          </div>
        </div>

        {marksError && (
          <div className="px-6 py-3 bg-red-50 border-t border-red-100 text-sm text-red-700">
            {marksError}
          </div>
        )}
      </div>

      {/* Table Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Marks Grid</h4>
            <p className="text-xs text-slate-500">
              Tip: press <span className="font-semibold">Tab</span> to jump across cells.
            </p>
          </div>

          <span className="hidden sm:inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
            Total is auto-calculated /100
          </span>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300 animate-pulse" />
              Loading marks data...
            </div>
          ) : sortedStudents.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              No students enrolled. Add students first.
            </div>
          ) : assessments.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              No assessments yet. Add CT/Mid/Final/Attendance in the Assessments tab.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 sticky left-0 bg-slate-50 z-10">
                      Roll
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 sticky left-24 bg-slate-50 z-10">
                      Name
                    </th>

                    {assessments.map((a) => (
                      <th
                        key={a._id}
                        className="px-3 py-3 text-left text-xs font-semibold text-slate-600"
                      >
                        <div className="leading-tight">{a.name}</div>
                        <div className="text-[11px] text-slate-400">/{a.fullMarks}</div>
                      </th>
                    ))}

                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600">
                      Total /100
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600">
                      Grade
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {sortedStudents.map((s, rowIndex) => {
                    const row = marksMap[s.id] || {};
                    const total = totalsPerStudent[s.id] ?? 0;

                    return (
                      <tr
                        key={s.enrollmentId}
                        className="border-b border-slate-100 hover:bg-slate-50/60"
                      >
                        <td className="px-3 py-2 whitespace-nowrap sticky left-0 bg-white z-10">
                          <span className="text-slate-800 font-medium">{s.roll}</span>
                        </td>

                        <td className="px-3 py-2 whitespace-nowrap sticky left-24 bg-white z-10">
                          <span className="text-slate-800">{s.name}</span>
                        </td>

                        {assessments.map((a, colIndex) => {
                          const isAttendanceCol = String(a.name || "")
                            .toLowerCase()
                            .includes("att");

                          return (
                            <td key={a._id} className="px-3 py-2">
                              <input
                                type="number"
                                disabled={isAttendanceCol}
                                className={[
                                  "w-24 h-9 rounded-lg border px-2 text-sm shadow-sm",
                                  "focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500",
                                  isAttendanceCol
                                    ? "bg-slate-100 cursor-not-allowed border-slate-200 text-slate-500"
                                    : "bg-white border-slate-200 text-slate-900 hover:border-slate-300",
                                ].join(" ")}
                                value={row[a._id] ?? ""}
                                onChange={(e) =>
                                  handleMarkChange(s.id, a._id, e.target.value)
                                }
                                onKeyDown={handleKeyDown}
                                data-row={rowIndex}
                                data-col={colIndex}
                                ref={(el) => {
                                  if (!inputRefs.current[rowIndex])
                                    inputRefs.current[rowIndex] = [];
                                  inputRefs.current[rowIndex][colIndex] = el;
                                }}
                              />
                            </td>
                          );
                        })}

                        <td className="px-3 py-2">
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                            {Number(total).toFixed(1)}
                          </span>
                        </td>

                        <td className="px-3 py-2">
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                            {gradeFromTotal(total)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && sortedStudents.length > 0 && assessments.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Marks"}
              </button>

              <button
                onClick={handleExportExcel}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
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
