import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import {
  fetchStudentCourseSubmissionAssessments,
  getPublicFileUrl,
  submitStudentLabAssessmentFile,
} from "../../services/labSubmissionService";

function formatDateTime(value) {
  if (!value) return "No deadline set";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "No deadline set";
  return d.toLocaleString();
}

export default function StudentLabSubmissions({ courseId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchStudentCourseSubmissionAssessments(courseId);
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not load submission tasks.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (courseId) {
      load();
    }
  }, [courseId]);

  const handleFileChange = async (assessmentId, file) => {
    if (!file) return;

    setUploadingId(assessmentId);
    try {
      const res = await submitStudentLabAssessmentFile(assessmentId, file);
      await Swal.fire(
        "Submitted",
        res?.message || "File submitted successfully.",
        "success"
      );
      await load();
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Upload failed",
        err?.response?.data?.message || "Could not submit file.",
        "error"
      );
    } finally {
      setUploadingId("");
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Loading submission tasks...
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
        No file submission assessments are available for this course yet.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {items.map((item) => {
        const submitted = !!item.submission;
        const open = item.submissionsOpen !== false;
        const canUpload =
          open && (!submitted || item.allowResubmission !== false);

        return (
          <div
            key={item.id}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-lg font-semibold text-slate-900 dark:text-white">
                  {item.name}
                </div>

                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                    Max {item.maxFileSizeMB || 10} MB
                  </span>

                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {(item.allowedExtensions || []).join(", ")}
                  </span>

                  <span
                    className={`rounded-full border px-3 py-1 ${
                      submitted
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                    }`}
                  >
                    {submitted ? "Submitted" : "Not Submitted"}
                  </span>

                  <span
                    className={`rounded-full border px-3 py-1 ${
                      open
                        ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300"
                        : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
                    }`}
                  >
                    {open ? "Submission Open" : "Submission Closed"}
                  </span>
                </div>

                {item.instructions ? (
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
                    {item.instructions}
                  </p>
                ) : null}

                <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  Due: {formatDateTime(item.dueDate)}
                </div>

                {submitted ? (
                  <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                    <div className="font-semibold">
                      Current file: {item.submission.originalFileName}
                    </div>

                    <div className="mt-1 text-xs">
                      Submitted at: {formatDateTime(item.submission.submittedAt)}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-3">
                      <a
                        href={getPublicFileUrl(item.submission.downloadUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        View
                      </a>

                      <a
                        href={getPublicFileUrl(item.submission.downloadUrl)}
                        download
                        className="underline"
                      >
                        Download
                      </a>
                    </div>

                    {item.submission.teacherNote ? (
                      <div className="mt-2">
                        Teacher note: {item.submission.teacherNote}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="w-full lg:w-auto">
                {canUpload ? (
                  <label className="flex cursor-pointer items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700">
                    {uploadingId === item.id
                      ? "Uploading..."
                      : submitted
                      ? "Replace File"
                      : "Upload File"}

                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.zip,.xls,.xlsx,.ppt,.pptx,.txt"
                      disabled={uploadingId === item.id}
                      onChange={(e) =>
                        handleFileChange(item.id, e.target.files?.[0])
                      }
                    />
                  </label>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {!open
                      ? "Submission is closed"
                      : "Resubmission is disabled"}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}