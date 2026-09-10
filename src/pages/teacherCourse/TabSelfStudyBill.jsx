import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  downloadSelfStudyBill,
  fetchSelfStudyBill,
  saveSelfStudyStudentIntakes,
} from "../../services/selfStudyBillService";

const inputClass =
  "h-9 w-24 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

const money = (value) => {
  if (value === null || value === undefined) return "—";
  const number = Number(value || 0);
  return `৳${number.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(number) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
};

export default function TabSelfStudyBill({ courseId, course }) {
  const [data, setData] = useState(null);
  const [draftIntakes, setDraftIntakes] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const hydrateDraft = (payload) => {
    setDraftIntakes(
      Object.fromEntries((payload?.students || []).map((row) => [row.studentId, row.intake || ""]))
    );
  };

  const load = async () => {
    setLoading(true);
    try {
      const payload = await fetchSelfStudyBill(courseId);
      setData(payload);
      hydrateDraft(payload);
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Could not load bill details",
        text: err?.response?.data?.message || "Please try again.",
        confirmButtonColor: "#4f46e5",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const mappingPayload = useMemo(
    () =>
      (data?.students || []).map((row) => ({
        studentId: row.studentId,
        intake: String(draftIntakes[row.studentId] || "").trim(),
      })),
    [data?.students, draftIntakes]
  );

  const hasDraftChanges = useMemo(
    () =>
      (data?.students || []).some(
        (row) => String(row.intake || "") !== String(draftIntakes[row.studentId] || "").trim()
      ),
    [data?.students, draftIntakes]
  );

  const saveAndRecalculate = async ({ silent = false } = {}) => {
    try {
      setSaving(true);
      const payload = await saveSelfStudyStudentIntakes(courseId, mappingPayload);
      setData(payload);
      hydrateDraft(payload);
      if (!silent) {
        Swal.fire({
          icon: "success",
          title: "Recalculated",
          text: "Student fees and faculty payment have been updated.",
          timer: 1400,
          showConfirmButton: false,
        });
      }
      return payload;
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Could not recalculate",
        text: err?.response?.data?.message || "Check the intake values and try again.",
        confirmButtonColor: "#4f46e5",
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      let current = data;
      if (hasDraftChanges) {
        current = await saveAndRecalculate({ silent: true });
        if (!current) return;
      }
      if (!current?.readyToGenerate) {
        Swal.fire({
          icon: "warning",
          title: "Bill is not ready",
          text: current?.unresolvedCount
            ? "Set a valid intake for every student so the tuition fee can be matched."
            : "Make sure students, faculty information and credit hours are available.",
          confirmButtonColor: "#4f46e5",
        });
        return;
      }
      await downloadSelfStudyBill(courseId, mappingPayload);
      Swal.fire({
        icon: "success",
        title: "Payment note generated",
        text: "The Word document has been prepared using the official template.",
        timer: 1600,
        showConfirmButton: false,
      });
    } catch (err) {
      let message = "Failed to generate the Word document.";
      if (err?.response?.data instanceof Blob) {
        try {
          const parsed = JSON.parse(await err.response.data.text());
          message = parsed?.message || message;
        } catch {
          // keep fallback
        }
      } else {
        message = err?.response?.data?.message || message;
      }
      Swal.fire({ icon: "error", title: "Generation failed", text: message, confirmButtonColor: "#4f46e5" });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }

  if (!data) return null;

  const semester = `${data.course?.semester || ""} ${data.course?.year || ""}`.trim();

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative border-b border-slate-200 bg-gradient-to-r from-white via-slate-50 to-indigo-50/60 px-4 py-4 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/25 sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-600/20">
                <DocumentIcon />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold tracking-tight text-slate-950 dark:text-white">Self Study Payment Bill</h3>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">Self Study</span>
                </div>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Tuition is matched by programme, shift and intake. The student payment is tuition per credit × course credit hour; faculty payment is 50%.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => saveAndRecalculate()}
                disabled={saving || !hasDraftChanges}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <RefreshIcon />
                {saving ? "Recalculating..." : "Save & Recalculate"}
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || saving || (!data.readyToGenerate && !hasDraftChanges)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <DownloadIcon />
                {generating ? "Generating..." : "Generate Word Document"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
          <Metric label="Enrolled Students" value={data.totals?.students ?? 0} sub={`${data.course?.shift || "Day"} programme`} />
          <Metric label="Credit Hour" value={data.course?.creditHours || "—"} sub={`${data.course?.code || course?.code || "Course"}`} />
          <Metric label="Students Paid" value={money(data.totals?.totalStudentPaid)} sub="Calculated course fees" />
          <Metric label="Faculty Payment" value={money(data.totals?.totalFacultyPayment)} sub="50% of course fees" emphasis />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <h4 className="text-sm font-bold text-slate-950 dark:text-white">Payment Note Details</h4>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <Info label="Faculty" value={data.faculty?.name || "Not available"} />
            <Info label="Shortcode" value={data.faculty?.shortCode || "Not available"} />
            <Info label="Designation" value={data.faculty?.designation || "Lecturer"} />
            <Info label="Semester" value={semester || "—"} />
            <Info label="Programme" value={data.course?.department || "—"} wide />
            <Info label="Course" value={`${data.course?.code || ""} — ${data.course?.title || ""}`} wide />
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
            <span className="font-bold text-slate-800 dark:text-slate-100">Fee source:</span> the supplied B-Tri tuition schedule. Semester charge is kept as reference data but is not added to the self-study bill.
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5 dark:border-slate-800 sm:px-5">
            <div>
              <h4 className="text-sm font-bold text-slate-950 dark:text-white">Credit-wise Fee Summary</h4>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">One row for each matched intake and tuition rate.</p>
            </div>
            {data.unresolvedCount > 0 && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                {data.unresolvedCount} needs intake
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-950/70 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-bold">Programme</th>
                  <th className="px-4 py-3 font-bold">Course Type</th>
                  <th className="px-4 py-3 font-bold">Intake</th>
                  <th className="px-4 py-3 font-bold">Tuition / Credit</th>
                  <th className="px-4 py-3 font-bold">Students Paid</th>
                  <th className="px-4 py-3 font-bold">Faculty 50%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(data.feeDetails || []).map((row) => (
                  <tr key={`${row.intake}-${row.tuitionFeePerCredit}`} className="text-slate-700 dark:text-slate-200">
                    <td className="px-4 py-3 font-medium">{row.program}</td>
                    <td className="px-4 py-3">Theory</td>
                    <td className="px-4 py-3 font-semibold">{row.intake}</td>
                    <td className="px-4 py-3">{money(row.tuitionFeePerCredit)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{Number(row.tuitionFeePerCredit).toLocaleString("en-US")} × {data.course.creditHours} = {money(row.studentPaid)}</td>
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{money(row.facultyPayment)}</td>
                  </tr>
                ))}
                {!data.feeDetails?.length && (
                  <tr><td colSpan="6" className="px-4 py-8 text-center text-sm text-slate-500">Set student intake values below to match the fee schedule.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h4 className="text-sm font-bold text-slate-950 dark:text-white">Student Payment Breakdown</h4>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Intake is editable because a self-study course may contain students from different intakes. Saving rechecks every fee automatically.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{data.students?.length || 0} students</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-950/70 dark:text-slate-400">
              <tr>
                <th className="w-12 px-4 py-3 font-bold">SL</th>
                <th className="px-3 py-3 font-bold">Student ID</th>
                <th className="px-3 py-3 font-bold">Name</th>
                <th className="px-3 py-3 font-bold">Intake</th>
                <th className="px-3 py-3 font-bold">Semester Charge</th>
                <th className="px-3 py-3 font-bold">Tuition / Credit</th>
                <th className="px-3 py-3 font-bold">Students Paid</th>
                <th className="px-3 py-3 font-bold">Faculty Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(data.students || []).map((row, index) => (
                <tr key={row.studentId} className="text-slate-700 dark:text-slate-200">
                  <td className="px-4 py-3 font-bold text-slate-400">{index + 1}</td>
                  <td className="px-3 py-3 font-semibold text-slate-900 dark:text-white">{row.roll}</td>
                  <td className="px-3 py-3 min-w-[190px]">{row.name}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        value={draftIntakes[row.studentId] ?? ""}
                        onChange={(e) => setDraftIntakes((prev) => ({ ...prev, [row.studentId]: e.target.value }))}
                        className={inputClass}
                        list="self-study-intakes"
                        aria-label={`Intake for ${row.roll}`}
                      />
                      {!row.feeResolved && <span title="No matching fee found" className="h-2 w-2 rounded-full bg-amber-500" />}
                    </div>
                  </td>
                  <td className="px-3 py-3">{money(row.semesterCharge)}</td>
                  <td className="px-3 py-3">{money(row.tuitionFeePerCredit)}</td>
                  <td className="px-3 py-3 font-semibold">{money(row.studentPaid)}</td>
                  <td className="px-3 py-3 font-bold text-slate-950 dark:text-white">{money(row.facultyPayment)}</td>
                </tr>
              ))}
              {!data.students?.length && (
                <tr><td colSpan="8" className="px-4 py-10 text-center text-sm text-slate-500">No students are enrolled in this course yet.</td></tr>
              )}
            </tbody>
          </table>
          <datalist id="self-study-intakes">
            {(data.availableIntakes || []).map((intake) => <option value={intake} key={intake} />)}
          </datalist>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, sub, emphasis = false }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/50">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-black tracking-tight ${emphasis ? "text-indigo-600 dark:text-indigo-300" : "text-slate-950 dark:text-white"}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{sub}</div>
    </div>
  );
}

function Info({ label, value, wide = false }) {
  return (
    <div className={wide ? "sm:col-span-2 xl:col-span-1 2xl:col-span-2" : ""}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold leading-5 text-slate-800 dark:text-slate-100">{value}</div>
    </div>
  );
}

function DocumentIcon() {
  return <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5"/><path d="M9 12h6M9 16h6"/></svg>;
}
function DownloadIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>;
}
function RefreshIcon() {
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7h-5V2"/><path d="M4 17h5v5"/><path d="M5.5 8a7 7 0 0 1 11.5-2L20 9M4 15l3 3a7 7 0 0 0 11.5-2"/></svg>;
}
