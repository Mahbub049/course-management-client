// client/src/pages/StudentAttendanceSheetPage.jsx
import { useEffect, useMemo, useState } from "react";
import { fetchStudentCourses } from "../services/studentCourseService";
import { fetchStudentAttendanceSheet } from "../services/attendanceService";
import { createStudentComplaint } from "../services/complaintService";

export default function StudentAttendanceSheetPage() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");

  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loading, setLoading] = useState(false);

  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  // ✅ Complaint modal states
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueRow, setIssueRow] = useState(null); // {date, period, status}
  const [issueMessage, setIssueMessage] = useState("");
  const [submittingIssue, setSubmittingIssue] = useState(false);
  const [issueSuccess, setIssueSuccess] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoadingCourses(true);
        const list = await fetchStudentCourses();
        setCourses(list || []);
      } catch (e) {
        setErr(e?.response?.data?.message || "Failed to load courses");
      } finally {
        setLoadingCourses(false);
      }
    })();
  }, []);

  const handleView = async () => {
    if (!courseId) return setErr("Please select a course");
    setErr("");
    setData(null);

    try {
      setLoading(true);
      const res = await fetchStudentAttendanceSheet(courseId);
      setData(res);
    } catch (e) {
      setErr(e?.response?.data?.message || "Failed to fetch attendance");
    } finally {
      setLoading(false);
    }
  };

  const computed = useMemo(() => {
    if (!data) return null;

    const rows = Array.isArray(data.rows) ? data.rows : [];
    const totalClasses = Number(data.totalClasses || rows.length || 0);
    const totalPresent = Number(data.totalPresent || 0);
    const percentage = Number(data.percentage || 0);

    return { rows, totalClasses, totalPresent, percentage };
  }, [data]);

  const openIssueModal = (row) => {
    setIssueSuccess("");
    setErr("");
    setIssueRow(row);
    // small helpful default text
    setIssueMessage(
      `I have an attendance issue for ${row.date} (Period ${row.period}). Please review it.`
    );
    setIssueOpen(true);
  };

  const closeIssueModal = () => {
    if (submittingIssue) return;
    setIssueOpen(false);
    setIssueRow(null);
    setIssueMessage("");
  };

  const handleSubmitIssue = async () => {
    if (!courseId) return setErr("Please select a course first");
    if (!issueRow) return setErr("Please select an attendance row");
    if (!issueMessage.trim()) return setErr("Please write your issue message");

    setSubmittingIssue(true);
    setErr("");
    setIssueSuccess("");

    try {
      await createStudentComplaint({
        courseId,
        category: "attendance",
        attendanceRef: {
          date: issueRow.date, // "YYYY-MM-DD" from backend response
          period: Number(issueRow.period),
        },
        message: issueMessage.trim(),
      });

      setIssueSuccess("Attendance issue submitted successfully.");
      // keep modal open a bit so user sees success; you can auto-close too
      // closeIssueModal(); // (optional) uncomment if you want auto close
    } catch (e) {
      setErr(e?.response?.data?.message || "Failed to submit attendance issue");
    } finally {
      setSubmittingIssue(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h1 className="text-xl font-semibold text-slate-800 mb-1">Attendance</h1>
      <p className="text-sm text-slate-500 mb-6">
        Select a course to view your attendance (period-wise). You can also report attendance issues per class.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="min-w-[320px]">
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Course
          </label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            disabled={loadingCourses}
          >
            <option value="">Select course</option>
            {courses.map((c) => (
              <option key={c._id || c.id} value={c._id || c.id}>
                {c.code} – {c.title} (Sec {c.section}) – {c.semester} {c.year}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleView}
          disabled={loading || loadingCourses}
          className="h-10 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? "Loading..." : "View Attendance"}
        </button>
      </div>

      {err && <p className="text-sm text-red-600 mb-4">{err}</p>}

      {data && computed && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="text-sm font-semibold text-slate-700">
              {data.course.code} – {data.course.title} (Sec {data.course.section}) –{" "}
              {data.course.semester} {data.course.year}
            </div>

            <div className="text-sm text-slate-700">
              <span className="font-semibold">Present:</span> {computed.totalPresent} /{" "}
              {computed.totalClasses}{" "}
              <span className="ml-2 font-semibold">({computed.percentage}%)</span>
            </div>
          </div>

          {!computed.rows.length ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              No attendance has been taken yet for this course.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">
                      Date
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-slate-600">
                      Period
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-slate-600">
                      Status
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {computed.rows.map((r) => (
                    <tr
                      key={`${r.date}-P${r.period}`}
                      className="border-b last:border-0 border-slate-100"
                    >
                      <td className="px-3 py-2">{r.date}</td>
                      <td className="px-3 py-2 text-center">{r.period}</td>
                      <td className="px-3 py-2 text-center font-semibold">
                        {r.status}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => openIssueModal(r)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <FlagIcon />
                          Report Issue
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ✅ Issue Modal */}
      {issueOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* overlay */}
          <button
            type="button"
            onClick={closeIssueModal}
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Close"
          />

          {/* modal */}
          <div className="relative w-[92%] max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-slate-900">
                  Report Attendance Issue
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  This will be sent to the teacher in the Complaints Center.
                </div>
              </div>

              <button
                type="button"
                onClick={closeIssueModal}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                disabled={submittingIssue}
                aria-label="Close modal"
              >
                <XIcon />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <div className="font-semibold">Selected Class</div>
              <div className="mt-1 text-sm">
                Date: <span className="font-semibold">{issueRow?.date}</span>{" "}
                | Period: <span className="font-semibold">{issueRow?.period}</span>{" "}
                | Your Status:{" "}
                <span className="font-semibold">{issueRow?.status}</span>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Your message
              </label>
              <textarea
                value={issueMessage}
                onChange={(e) => setIssueMessage(e.target.value)}
                className="w-full min-h-[120px] rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="Explain what went wrong (e.g., I was present, but shows absent)."
                disabled={submittingIssue}
              />
              <div className="mt-1 text-xs text-slate-500">
                Tip: mention any proof (photo, screenshot, witness) if needed.
              </div>
            </div>

            {issueSuccess && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {issueSuccess}
              </div>
            )}

            {err && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {err}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closeIssueModal}
                disabled={submittingIssue}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSubmitIssue}
                disabled={submittingIssue}
                className="flex-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {submittingIssue ? "Submitting..." : "Submit Issue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Icons ---------------- */

function FlagIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 22V4" />
      <path d="M4 4h12l-1 4 3 4H4" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
