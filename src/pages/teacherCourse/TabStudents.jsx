// client/src/pages/teacherCourse/TabStudents.jsx
import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";
import {
  addStudentToCourseRequest,
  bulkAddStudentsToCourseRequest,
  getCourseStudents,
  deleteStudentFromCourseRequest,
  resetStudentPasswordRequest,
  exportCourseStudentsRequest,
  sendPasswordsByEmailRequest,
} from "../../services/enrollmentService";

export default function TabStudents({ courseId }) {
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [studentError, setStudentError] = useState("");

  const [studentForm, setStudentForm] = useState({
    roll: "",
    name: "",
    email: "",
  });
  const [addingStudent, setAddingStudent] = useState(false);
  const [lastAddedInfo, setLastAddedInfo] = useState(null);

  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkError, setBulkError] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const [regenLoadingId, setRegenLoadingId] = useState(null);

  // UI (premium)
  const [query, setQuery] = useState("");

  // Load students once
  useEffect(() => {
    async function load() {
      setLoadingStudents(true);
      setStudentError("");
      try {
        const data = await getCourseStudents(courseId);
        setStudents(data || []);
      } catch (err) {
        console.error(err);
        setStudentError(err?.response?.data?.message || "Failed to load students");
      } finally {
        setLoadingStudents(false);
      }
    }
    load();
  }, [courseId]);

  // -------- Single student add --------
  const handleStudentFormChange = (e) => {
    const { name, value } = e.target;
    setStudentForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    setAddingStudent(true);
    setStudentError("");
    setLastAddedInfo(null);

    try {
      const payload = {
        roll: studentForm.roll.trim(),
        name: studentForm.name.trim(),
        email: studentForm.email.trim() || undefined,
      };

      const data = await addStudentToCourseRequest(courseId, payload);

      setStudents((prev) => [
        ...prev,
        {
          enrollmentId: data.enrollmentId,
          id: data.student.id,
          roll: data.student.roll,
          name: data.student.name,
          email: data.student.email,
          temporaryPassword: data.temporaryPassword || null,
        },
      ]);

      setLastAddedInfo({
        roll: data.student.roll,
        password: data.temporaryPassword,
        note: data.note,
      });

      setStudentForm({ roll: "", name: "", email: "" });
    } catch (err) {
      console.error(err);
      setStudentError(err?.response?.data?.message || "Failed to add student to course");
    } finally {
      setAddingStudent(false);
    }
  };

  // -------- Bulk add --------
  const parseBulkText = (text) => {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    return lines.map((line) => {
      const parts = line.split(/,|\t/).map((p) => p.trim());
      return {
        roll: parts[0] || "",
        name: parts[1] || "",
        email: parts[2] || "",
      };
    });
  };

  const handleBulkAddStudents = async () => {
    setBulkError("");
    setBulkResult(null);

    const parsed = parseBulkText(bulkText);
    if (parsed.length === 0) {
      setBulkError("Please paste at least one line with Roll and Name.");
      return;
    }
    const invalid = parsed.find((s) => !s.roll || !s.name);
    if (invalid) {
      setBulkError('Each line must have at least "roll, name". Example: 20254101401, Mahbub Sarwar');
      return;
    }

    setBulkLoading(true);
    try {
      const data = await bulkAddStudentsToCourseRequest(courseId, parsed);
      const results = data.results || [];
      setBulkResult(results);

      // Refresh list from server so passwords/enrollmentId are accurate
      const fresh = await getCourseStudents(courseId);
      setStudents(fresh || []);
    } catch (err) {
      console.error(err);
      setBulkError(err?.response?.data?.message || "Failed to bulk add students");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleDeleteStudent = async (enrollmentId, roll, name) => {
    const ok = window.confirm(
      `Remove ${name} (${roll}) from this course?\nThis will also delete their marks for this course.`
    );
    if (!ok) return;

    try {
      await deleteStudentFromCourseRequest(courseId, enrollmentId);
      setStudents((prev) => prev.filter((s) => s.enrollmentId !== enrollmentId));
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to remove student from course");
    }
  };

  const handleRegenerate = async (studentId, enrollmentId) => {
    try {
      setRegenLoadingId(enrollmentId);
      const data = await resetStudentPasswordRequest(courseId, studentId);

      setStudents((prev) =>
        prev.map((s) =>
          s.enrollmentId === enrollmentId ? { ...s, temporaryPassword: data.temporaryPassword } : s
        )
      );
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to regenerate password");
    } finally {
      setRegenLoadingId(null);
    }
  };

  const handleExportExcel = async () => {
    try {
      const rows = await exportCourseStudentsRequest(courseId);

      if (!rows || rows.length === 0) {
        alert("No students to export");
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "Students"
      );

      XLSX.writeFile(
        workbook,
        `Course_${courseId}_Students.xlsx`
      );
    } catch (err) {
      console.error(err);
      alert("Failed to export students");
    }
  };


  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;

    return students.filter((s) => {
      return (
        (s.roll || "").toLowerCase().includes(q) ||
        (s.name || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q)
      );
    });
  }, [students, query]);


const handleSendEmails = async () => {
  const ok = window.confirm(
    "Send login credentials to all enrolled students who have email?\nStudents without email will be skipped."
  );
  if (!ok) return;

  try {
    const payload = {
      subject: "BUBT Marks Portal Login Credentials",
      message:
        "Assalamu Alaikum. Here are your login credentials for BUBT Marks Portal. Please login and change your password immediately.",
    };

    const result = await sendPasswordsByEmailRequest(courseId, payload);

    alert(
      `Done!\nSent: ${result.sent}\nSkipped (No Email): ${result.skippedNoEmail}\nSkipped (No Password): ${result.skippedNoPassword}\nFailed: ${result.failed}`
    );
  } catch (err) {
    console.error(err);
    alert(err?.response?.data?.message || "Failed to send emails");
  }
};


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            <UsersIcon />
            Students
          </div>
          <h3 className="mt-2 text-xl font-bold text-slate-900">Manage Enrollments</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-2xl">
            Add students in bulk or individually. You can regenerate temporary passwords and remove students anytime.
          </p>
        </div>

        <div className="flex gap-2">
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            Total: {students.length}
          </span>
        </div>
      </div>

      {/* Top: Bulk + Single */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Bulk Add Card */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
              <UploadIcon />
            </div>
            <div>
              <h4 className="text-base font-semibold text-slate-900">Bulk Add Students</h4>
              <p className="text-xs text-slate-500">
                Paste one student per line: <span className="font-mono">Roll, Name, Email(optional)</span>
              </p>
            </div>
          </div>

          <div className="p-6">
            <textarea
              rows={7}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"20254101401, Mahbub Sarwar\n20254101402, Mirza, mirza@example.com"}
            />

            {bulkError && <Alert tone="danger" title="Invalid input" message={bulkError} />}

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleBulkAddStudents}
                disabled={bulkLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
              >
                {bulkLoading ? (
                  <>
                    <SpinnerIcon /> Processing…
                  </>
                ) : (
                  <>
                    <UploadIconSmall /> Bulk Add
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setBulkText("");
                  setBulkError("");
                  setBulkResult(null);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Clear
              </button>
            </div>

            {/* Bulk result */}
            {bulkResult && bulkResult.length > 0 && (
              <div className="mt-5 rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Bulk Add Result</div>
                  <div className="text-xs text-slate-500">
                    Rows: <span className="font-semibold">{bulkResult.length}</span>
                  </div>
                </div>

                <div className="max-h-56 overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-white sticky top-0">
                      <tr className="border-b border-slate-100">
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Roll</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Name</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Email</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Temp Password</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bulkResult.map((r) => (
                        <tr key={`${r.roll}-${r.status}`} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-semibold text-slate-900">{r.roll}</td>
                          <td className="px-3 py-2 text-slate-700">{r.name}</td>
                          <td className="px-3 py-2 text-slate-700">{r.email || "—"}</td>
                          <td className="px-3 py-2">
                            <span
                              className={[
                                "inline-flex items-center rounded-full px-2 py-0.5 border text-[11px] font-semibold",
                                r.status === "created"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-slate-50 text-slate-700 border-slate-200",
                              ].join(" ")}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {r.temporaryPassword ? (
                              <PasswordChip value={r.temporaryPassword} />
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{r.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="px-4 py-3 bg-white text-[11px] text-slate-500">
                  Share passwords only with newly created students.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Single Add Card */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center">
              <UserPlusIcon />
            </div>
            <div>
              <h4 className="text-base font-semibold text-slate-900">Add Single Student</h4>
              <p className="text-xs text-slate-500">Quickly add one student to this course.</p>
            </div>
          </div>

          <div className="p-6">
            {studentError && <Alert tone="danger" title="Could not add" message={studentError} />}

            <form onSubmit={handleAddStudent} className="space-y-4">
              <Field label="Roll (Username)">
                <input
                  type="text"
                  name="roll"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                  value={studentForm.roll}
                  onChange={handleStudentFormChange}
                  required
                />
              </Field>

              <Field label="Name">
                <input
                  type="text"
                  name="name"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                  value={studentForm.name}
                  onChange={handleStudentFormChange}
                  required
                />
              </Field>

              <Field label="Email (optional)">
                <input
                  type="email"
                  name="email"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                  value={studentForm.email}
                  onChange={handleStudentFormChange}
                />
              </Field>

              <button
                type="submit"
                disabled={addingStudent}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
              >
                {addingStudent ? (
                  <>
                    <SpinnerIcon /> Adding…
                  </>
                ) : (
                  <>
                    <UserPlusIconSmall /> Add Student
                  </>
                )}
              </button>
            </form>

            {lastAddedInfo && (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="font-semibold text-slate-900">Student added</div>
                <div className="mt-1 text-slate-700">
                  Roll: <span className="font-semibold">{lastAddedInfo.roll}</span>
                </div>

                {lastAddedInfo.password ? (
                  <div className="mt-2 text-slate-700">
                    Temporary password: <PasswordChip value={lastAddedInfo.password} />{" "}
                    <span className="text-xs text-slate-500">(share with student)</span>
                  </div>
                ) : (
                  <div className="mt-2 text-slate-600">{lastAddedInfo.note}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enrolled Students */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h4 className="text-base font-semibold text-slate-900">Enrolled Students</h4>
            <p className="text-xs text-slate-500">
              Showing <span className="font-semibold">{filteredStudents.length}</span> of{" "}
              <span className="font-semibold">{students.length}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <SearchIcon />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search roll, name, email..."
                className="w-72 max-w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* ✅ EXPORT BUTTON */}
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              Export to Excel
            </button>
            {/* <button
              onClick={handleSendEmails}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              Send Email
            </button> */}

          </div>
        </div>

        <div className="p-6">
          {loadingStudents ? (
            <div className="grid gap-3">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center py-10">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                <UsersIcon />
              </div>
              <h5 className="mt-3 text-sm font-semibold text-slate-900">No students found</h5>
              <p className="mt-1 text-sm text-slate-500">
                Add students above or try another search term.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Roll</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Password</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map((s) => (
                    <tr key={s.enrollmentId} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-semibold text-slate-900">{s.roll}</td>
                      <td className="px-4 py-3 text-slate-700">{s.name}</td>
                      <td className="px-4 py-3 text-slate-700">{s.email || "—"}</td>
                      <td className="px-4 py-3">
                        {s.temporaryPassword ? (
                          <PasswordChip value={s.temporaryPassword} />
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => handleRegenerate(s.id, s.enrollmentId)}
                            disabled={regenLoadingId === s.enrollmentId}
                            className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                          >
                            {regenLoadingId === s.enrollmentId ? (
                              <>
                                <SpinnerIcon /> Working…
                              </>
                            ) : (
                              <>
                                <RefreshIcon /> Regenerate
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleDeleteStudent(s.enrollmentId, s.roll, s.name)}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            <TrashIcon />
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="mt-3 text-xs text-slate-500">
                Password column shows the latest temporary password (if generated).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Small UI helpers ---------------- */

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Alert({ tone = "danger", title, message }) {
  const styles =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-800";

  return (
    <div className={`mt-3 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5 opacity-90">{message}</div>
    </div>
  );
}

function PasswordChip({ value }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800">
      <code className="font-mono">{value}</code>
    </span>
  );
}

function SkeletonRow() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="h-3 w-28 rounded bg-slate-200" />
      <div className="mt-2 h-3 w-64 rounded bg-slate-200" />
    </div>
  );
}

/* ---------------- Icons (inline SVG) ---------------- */

function UsersIcon() {
  return (
    <svg className="h-4 w-4 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21a7 7 0 0 0-14 0" />
      <path d="M10 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
      <path d="M21 21a6 6 0 0 0-9-5" />
      <path d="M17 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="h-5 w-5 text-indigo-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </svg>
  );
}
function UploadIconSmall() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg className="h-5 w-5 text-sky-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <path d="M12 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
      <path d="M19 8h4" />
      <path d="M21 6v4" />
    </svg>
  );
}
function UserPlusIconSmall() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <path d="M12 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
      <path d="M19 8h4" />
      <path d="M21 6v4" />
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

function RefreshIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v6h-6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
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
