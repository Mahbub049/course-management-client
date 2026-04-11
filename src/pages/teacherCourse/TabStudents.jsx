// client/src/pages/teacherCourse/TabStudents.jsx
import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  addStudentToCourseRequest,
  bulkAddStudentsToCourseRequest,
  getCourseStudents,
  deleteStudentFromCourseRequest,
  resetStudentPasswordRequest,
  exportCourseStudentsRequest,
  sendPasswordsByEmailRequest,
  removeAllStudentsFromCourseRequest,
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
  const [removingAll, setRemovingAll] = useState(false);
  const [query, setQuery] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

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

      await Swal.fire({
        icon: "success",
        title: "Student added",
        text: `${data.student.name} has been enrolled successfully.`,
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      setStudentError(err?.response?.data?.message || "Failed to add student to course");
    } finally {
      setAddingStudent(false);
    }
  };

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

      const fresh = await getCourseStudents(courseId);
      setStudents(fresh || []);

      await Swal.fire({
        icon: "success",
        title: "Bulk add completed",
        text: "Student list has been updated.",
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      setBulkError(err?.response?.data?.message || "Failed to bulk add students");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleDeleteStudent = async (enrollmentId, roll, name) => {
    const result = await Swal.fire({
      title: "Remove student?",
      text: `Remove ${name} (${roll}) from this course? Related marks for this course will also be deleted.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remove",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) return;

    try {
      await deleteStudentFromCourseRequest(courseId, enrollmentId);
      setStudents((prev) => prev.filter((s) => s.enrollmentId !== enrollmentId));

      await Swal.fire({
        icon: "success",
        title: "Removed",
        text: "Student removed from course.",
        timer: 1300,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      await Swal.fire({
        icon: "error",
        title: "Failed",
        text: err?.response?.data?.message || "Failed to remove student from course",
      });
    }
  };

  const handleRemoveAllStudents = async () => {
    if (students.length === 0) {
      await Swal.fire({
        icon: "info",
        title: "No students",
        text: "There are no students to remove.",
      });
      return;
    }

    const result = await Swal.fire({
      title: "Remove all students?",
      html: `
        <div style="text-align:left">
          <p>This will:</p>
          <ul style="margin-top:8px;padding-left:18px">
            <li>Unenroll <b>${students.length}</b> students</li>
            <li>Delete their marks for this course</li>
          </ul>
          <p style="margin-top:10px"><b>This cannot be undone.</b></p>
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remove All",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) return;

    setRemovingAll(true);
    try {
      const response = await removeAllStudentsFromCourseRequest(courseId);
      const fresh = await getCourseStudents(courseId);
      setStudents(fresh || []);

      await Swal.fire({
        icon: "success",
        title: "Completed",
        html: `
          <div style="text-align:left">
            <p>Removed Enrollments: <b>${response.removedEnrollments}</b></p>
            <p>Deleted Marks: <b>${response.deletedMarks}</b></p>
          </div>
        `,
      });
    } catch (err) {
      console.error(err);
      await Swal.fire({
        icon: "error",
        title: "Failed",
        text: err?.response?.data?.message || "Failed to remove all students",
      });
    } finally {
      setRemovingAll(false);
    }
  };

  const handleRegenerate = async (studentId, enrollmentId) => {
    try {
      setRegenLoadingId(enrollmentId);
      const data = await resetStudentPasswordRequest(courseId, studentId);

      setStudents((prev) =>
        prev.map((s) =>
          s.enrollmentId === enrollmentId
            ? { ...s, temporaryPassword: data.temporaryPassword }
            : s
        )
      );

      await Swal.fire({
        icon: "success",
        title: "Password regenerated",
        text: "Temporary password updated successfully.",
        timer: 1300,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      await Swal.fire({
        icon: "error",
        title: "Failed",
        text: err?.response?.data?.message || "Failed to regenerate password",
      });
    } finally {
      setRegenLoadingId(null);
    }
  };

  const handleExportExcel = async () => {
    try {
      const rows = await exportCourseStudentsRequest(courseId);

      if (!rows || rows.length === 0) {
        await Swal.fire({
          icon: "info",
          title: "No students",
          text: "There are no students to export.",
        });
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Students");
      XLSX.writeFile(workbook, `Course_${courseId}_Students.xlsx`);
    } catch (err) {
      console.error(err);
      await Swal.fire({
        icon: "error",
        title: "Export failed",
        text: "Failed to export students.",
      });
    }
  };

  const handleSendEmails = async () => {
    const result = await Swal.fire({
      title: "Send credentials by email?",
      text: "Students without email or password will be skipped.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Send Emails",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#4f46e5",
    });

    if (!result.isConfirmed) return;

    try {
      setEmailLoading(true);

      const payload = {
        subject: "BUBT Marks Portal Login Credentials",
        message:
          "Assalamu Alaikum. Here are your login credentials for BUBT Marks Portal. Please login and change your password immediately.",
      };

      const response = await sendPasswordsByEmailRequest(courseId, payload);

      await Swal.fire({
        icon: "success",
        title: "Email sending completed",
        html: `
          <div style="text-align:left">
            <p>Sent: <b>${response.sent}</b></p>
            <p>Skipped (No Email): <b>${response.skippedNoEmail}</b></p>
            <p>Skipped (No Password): <b>${response.skippedNoPassword}</b></p>
            <p>Failed: <b>${response.failed}</b></p>
          </div>
        `,
      });
    } catch (err) {
      console.error(err);
      await Swal.fire({
        icon: "error",
        title: "Failed",
        text: err?.response?.data?.message || "Failed to send emails",
      });
    } finally {
      setEmailLoading(false);
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

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="bg-gradient-to-r from-slate-50 via-white to-indigo-50/70 px-6 py-5 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <UsersIcon />
                Students
              </div>

              <h3 className="mt-3 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Manage Enrollments
              </h3>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Add students individually or in bulk, regenerate temporary passwords,
                export lists, and manage enrollments from one place.
              </p>
            </div>

            <div className="flex gap-2">
              <StatPill label="Total" value={students.length} />
              <StatPill label="Visible" value={filteredStudents.length} />
            </div>
          </div>

          {studentError && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              {studentError}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 dark:border-indigo-500/20 dark:bg-indigo-500/10">
              <UploadIcon />
            </div>
            <div>
              <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Bulk Add Students
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                One per line: <span className="font-mono">Roll, Name, Email(optional)</span>
              </p>
            </div>
          </div>

          <div className="p-6">
            <textarea
              rows={8}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"20254101401, Mahbub Sarwar\n20254101402, Mirza, mirza@example.com"}
            />

            {bulkError && <Alert tone="danger" title="Invalid input" message={bulkError} />}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={handleBulkAddStudents}
                disabled={bulkLoading}
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {bulkLoading ? (
                  <>
                    <SpinnerIcon /> Processing...
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
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Clear
              </button>
            </div>

            {bulkResult && bulkResult.length > 0 && (
              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Bulk Add Result
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Rows: <span className="font-semibold">{bulkResult.length}</span>
                  </div>
                </div>

                <div className="max-h-64 overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-white dark:bg-slate-900">
                      <tr className="border-b border-slate-100 dark:border-slate-800">
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
                          Roll
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
                          Name
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
                          Email
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
                          Status
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
                          Temp Password
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
                          Note
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {bulkResult.map((r) => (
                        <tr
                          key={`${r.roll}-${r.status}`}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        >
                          <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">
                            {r.roll}
                          </td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                            {r.name}
                          </td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                            {r.email || "—"}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={[
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                                r.status === "created"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                                  : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                              ].join(" ")}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {r.temporaryPassword ? (
                              <PasswordChip value={r.temporaryPassword} />
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                            {r.note}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-white px-4 py-3 text-[11px] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  Share passwords only with newly created students.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 dark:border-sky-500/20 dark:bg-sky-500/10">
              <UserPlusIcon />
            </div>
            <div>
              <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Add Single Student
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Quickly add one student to this course.
              </p>
            </div>
          </div>

          <div className="p-6">
            <form onSubmit={handleAddStudent} className="space-y-4">
              <Field label="Roll (Username)">
                <input
                  type="text"
                  name="roll"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={studentForm.roll}
                  onChange={handleStudentFormChange}
                  required
                />
              </Field>

              <Field label="Name">
                <input
                  type="text"
                  name="name"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={studentForm.name}
                  onChange={handleStudentFormChange}
                  required
                />
              </Field>

              <Field label="Email (optional)">
                <input
                  type="email"
                  name="email"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={studentForm.email}
                  onChange={handleStudentFormChange}
                />
              </Field>

              <button
                type="submit"
                disabled={addingStudent}
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {addingStudent ? (
                  <>
                    <SpinnerIcon /> Adding...
                  </>
                ) : (
                  <>
                    <UserPlusIconSmall /> Add Student
                  </>
                )}
              </button>
            </form>

            {lastAddedInfo && (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/60">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Student added
                </div>
                <div className="mt-1 text-slate-700 dark:text-slate-300">
                  Roll: <span className="font-semibold">{lastAddedInfo.roll}</span>
                </div>

                {lastAddedInfo.password ? (
                  <div className="mt-2 text-slate-700 dark:text-slate-300">
                    Temporary password: <PasswordChip value={lastAddedInfo.password} />{" "}
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      (share with student)
                    </span>
                  </div>
                ) : (
                  <div className="mt-2 text-slate-600 dark:text-slate-400">
                    {lastAddedInfo.note}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-4 xl:flex-row xl:items-center xl:justify-between dark:border-slate-800">
          <div>
            <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Enrolled Students
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Showing <span className="font-semibold">{filteredStudents.length}</span> of{" "}
              <span className="font-semibold">{students.length}</span>
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                <SearchIcon />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search roll, name, email..."
                className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 lg:w-80 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {/* <button
                onClick={handleSendEmails}
                disabled={emailLoading}
                className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
              >
                {emailLoading ? (
                  <>
                    <SpinnerIcon /> Sending...
                  </>
                ) : (
                  <>
                    <MailIcon /> Send Email
                  </>
                )}
              </button> */}

              <button
                onClick={handleExportExcel}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <DownloadIcon />
                Export Excel
              </button>

              <button
                onClick={handleRemoveAllStudents}
                disabled={removingAll || students.length === 0}
                className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
                title="Remove all students from this course"
              >
                {removingAll ? (
                  <>
                    <SpinnerIcon /> Removing...
                  </>
                ) : (
                  <>
                    <TrashIcon /> Remove All
                  </>
                )}
              </button>
            </div>
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
            <div className="py-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                <UsersIcon />
              </div>
              <h5 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                No students found
              </h5>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Add students above or try another search term.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Roll
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Password
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredStudents.map((s) => (
                    <tr
                      key={s.enrollmentId}
                      className="transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {s.roll}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {s.name}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                        {s.email || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {s.temporaryPassword ? (
                          <PasswordChip value={s.temporaryPassword} />
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-2">
                          <button
                            onClick={() => handleRegenerate(s.id, s.enrollmentId)}
                            disabled={regenLoadingId === s.enrollmentId}
                            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-60 dark:border-indigo-500/20 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                          >
                            {regenLoadingId === s.enrollmentId ? (
                              <>
                                <SpinnerIcon /> Working...
                              </>
                            ) : (
                              <>
                                <RefreshIcon /> Regenerate
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleDeleteStudent(s.enrollmentId, s.roll, s.name)}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/20 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
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

              <p className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                Password column shows the latest temporary password if one has been generated.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Alert({ tone = "danger", title, message }) {
  const styles =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
      : "border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300";

  return (
    <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${styles}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5 opacity-90">{message}</div>
    </div>
  );
}

function PasswordChip({ value }) {
  return (
    <span className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      <code className="font-mono">{value}</code>
    </span>
  );
}

function SkeletonRow() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-2 h-3 w-64 rounded bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

function StatPill({ label, value }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
      <span className="text-slate-500 dark:text-slate-400">{label}:</span>
      <span>{value}</span>
    </span>
  );
}

function UsersIcon() {
  return (
    <svg
      className="h-4 w-4 text-slate-700 dark:text-slate-200"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M17 21a7 7 0 0 0-14 0" />
      <path d="M10 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
      <path d="M21 21a6 6 0 0 0-9-5" />
      <path d="M17 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      className="h-5 w-5 text-indigo-700 dark:text-indigo-300"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
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
    <svg
      className="h-5 w-5 text-sky-700 dark:text-sky-300"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
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

function MailIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16v12H4z" />
      <path d="m22 7-10 7L2 7" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 21h16" />
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