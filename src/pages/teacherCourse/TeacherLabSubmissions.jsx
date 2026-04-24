import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import {
  createTeacherSubmissionAssessment,
  deleteTeacherSubmissionAssessment,
  downloadAllTeacherSubmissions,
  fetchTeacherAssessmentSubmissions,
  fetchTeacherSubmissionAssessments,
  getPublicFileUrl,
  saveAllSubmissionMarks,
  syncAllSubmissionMarks,
  updateLabSubmissionStatus,
  updateTeacherSubmissionAssessment,
} from "../../services/labSubmissionService";

const initialForm = {
  name: "Lab Assessment Submission",
  fullMarks: 10,
  instructions: "",
  dueDate: "",
  dueTime: "",
  allowResubmission: true,
  maxFileSizeMB: 10,
};

function formatDateTime(value) {
  if (!value) return "No deadline set";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "No deadline set";
  return d.toLocaleString();
}

function toDateInputValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const hour = String(d.getHours()).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function combineDateTime(date, time) {
  if (!date) return null;
  return `${date}T${time || "23:59"}`;
}

function formatFileSize(size = 0) {
  if (!size) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function getSubmissionStatusMeta(item) {
  if (item?.closedReason === "due_date_passed" || item?.dueDatePassed) {
    return {
      label: "Deadline Passed",
      tone: "rose",
    };
  }

  if (item?.submissionsOpen) {
    return {
      label: "Open",
      tone: "sky",
    };
  }

  return {
    label: "Closed",
    tone: "rose",
  };
}

function Badge({ children, tone = "slate" }) {
  const tones = {
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    amber:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    sky: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300",
    rose: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
    indigo:
      "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300",
    slate:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tones[tone] || tones.slate}`}
    >
      {children}
    </span>
  );
}

export default function TeacherLabSubmissions({ courseId }) {
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState("");
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedData, setSelectedData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingForm, setSavingForm] = useState(false);
  const [actionLoading, setActionLoading] = useState("");

  const dateInputRef = useRef(null);
  const timeInputRef = useRef(null);

  const selectedAssessment = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId]
  );

  const selectedStatusMeta = getSubmissionStatusMeta(selectedAssessment);

  const loadAssessments = async (preferredId = null) => {
    setLoading(true);
    try {
      const data = await fetchTeacherSubmissionAssessments(courseId);
      const rows = Array.isArray(data) ? data : [];
      setItems(rows);

      const nextSelected =
        preferredId && rows.find((r) => r.id === preferredId)
          ? preferredId
          : selectedId && rows.find((r) => r.id === selectedId)
            ? selectedId
            : rows[0]?.id || "";

      setSelectedId(nextSelected);
      return rows;
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message ||
          "Could not load submission assessments.",
        "error"
      );
      return [];
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedSubmissions = async (assessmentId) => {
    if (!assessmentId) {
      setSelectedData(null);
      return;
    }

    try {
      const data = await fetchTeacherAssessmentSubmissions(
        courseId,
        assessmentId
      );
      const withDraftMarks = {
        ...data,
        submissions: (data?.submissions || []).map((row) => ({
          ...row,
          draftMarks:
            row.awardedMarks === null || row.awardedMarks === undefined
              ? ""
              : String(row.awardedMarks),
        })),
      };
      setSelectedData(withDraftMarks);
    } catch (err) {
      console.error(err);
      setSelectedData(null);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not load submissions.",
        "error"
      );
    }
  };

  useEffect(() => {
    if (courseId) {
      loadAssessments();
    }
  }, [courseId]);

  useEffect(() => {
    if (selectedId) {
      loadSelectedSubmissions(selectedId);
    } else {
      setSelectedData(null);
    }
  }, [selectedId, courseId]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId("");
  };

  const handleCreateOrUpdate = async (e) => {
    e.preventDefault();
    setSavingForm(true);

    try {
      const payload = {
        name: form.name,
        fullMarks: Number(form.fullMarks || 0),
        submissionConfig: {
          instructions: form.instructions,
          dueDate: combineDateTime(form.dueDate, form.dueTime),
          maxFileSizeMB: Number(form.maxFileSizeMB || 10),
          allowResubmission: !!form.allowResubmission,
          allowedExtensions: [
            "pdf",
            "doc",
            "docx",
            "zip",
            "xls",
            "xlsx",
            "ppt",
            "pptx",
            "txt",
          ],
        },
      };

      if (editingId) {
        await updateTeacherSubmissionAssessment(courseId, editingId, {
          action: "update",
          payload: {
            name: payload.name,
            fullMarks: payload.fullMarks,
            instructions: payload.submissionConfig.instructions,
            dueDate: payload.submissionConfig.dueDate,
            maxFileSizeMB: payload.submissionConfig.maxFileSizeMB,
            allowResubmission: payload.submissionConfig.allowResubmission,
          },
        });

        await Swal.fire(
          "Updated",
          "Submission assessment updated successfully.",
          "success"
        );

        await loadAssessments(editingId);
        await loadSelectedSubmissions(editingId);
      } else {
        const res = await createTeacherSubmissionAssessment(courseId, payload);

        await Swal.fire(
          "Created",
          "Submission assessment created successfully.",
          "success"
        );

        const createdId = res?.assessment?.id || "";
        await loadAssessments(createdId || null);
      }

      resetForm();
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message ||
          "Could not save submission assessment.",
        "error"
      );
    } finally {
      setSavingForm(false);
    }
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name || "",
      fullMarks: item.fullMarks || 10,
      instructions: item.instructions || "",
      dueDate: toDateInputValue(item.dueDate),
      dueTime: toTimeInputValue(item.dueDate),
      allowResubmission: item.allowResubmission !== false,
      maxFileSizeMB: item.maxFileSizeMB || 10,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (assessmentId, name) => {
    const result = await Swal.fire({
      title: "Delete assessment?",
      text: `This will delete "${name}" and its submissions.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) return;

    setActionLoading(`delete-${assessmentId}`);
    try {
      await deleteTeacherSubmissionAssessment(courseId, assessmentId);
      await Swal.fire("Deleted", "Assessment deleted successfully.", "success");

      if (editingId === assessmentId) {
        resetForm();
      }

      await loadAssessments();
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not delete assessment.",
        "error"
      );
    } finally {
      setActionLoading("");
    }
  };

  const handleAssessmentAction = async (assessmentId, action) => {
    setActionLoading(`${assessmentId}-${action}`);
    try {
      await updateTeacherSubmissionAssessment(courseId, assessmentId, {
        action,
      });
      await loadAssessments(assessmentId);
      await loadSelectedSubmissions(assessmentId);
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not update assessment.",
        "error"
      );
    } finally {
      setActionLoading("");
    }
  };

  const handleDownloadAll = async () => {
    if (!selectedId) return;
    setActionLoading(`download-${selectedId}`);
    try {
      await downloadAllTeacherSubmissions(courseId, selectedId);
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not download all files.",
        "error"
      );
    } finally {
      setActionLoading("");
    }
  };

  const updateDraftMarks = (submissionId, value) => {
    setSelectedData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        submissions: prev.submissions.map((row) =>
          row.id === submissionId ? { ...row, draftMarks: value } : row
        ),
      };
    });
  };

  const handleSaveMarks = async (row) => {
    setActionLoading(`save-marks-${row.id}`);
    try {
      await updateLabSubmissionStatus(row.id, {
        status: row.status === "checked" ? "checked" : "submitted",
        awardedMarks: row.draftMarks,
      });

      await loadSelectedSubmissions(selectedId);
      await loadAssessments(selectedId);
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not save marks.",
        "error"
      );
    } finally {
      setActionLoading("");
    }
  };

  const handleMarkChecked = async (row) => {
    setActionLoading(`checked-${row.id}`);
    try {
      await updateLabSubmissionStatus(row.id, {
        status: "checked",
        awardedMarks: row.draftMarks,
      });

      await loadSelectedSubmissions(selectedId);
      await loadAssessments(selectedId);
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not update submission.",
        "error"
      );
    } finally {
      setActionLoading("");
    }
  };

  const handleSaveAllMarks = async () => {
    if (!selectedId || !selectedData?.submissions?.length) return;

    setActionLoading(`save-all-${selectedId}`);
    try {
      await saveAllSubmissionMarks(
        courseId,
        selectedId,
        selectedData.submissions.map((row) => ({
          submissionId: row.id,
          awardedMarks: row.draftMarks,
        }))
      );

      await Swal.fire("Saved", "All marks saved successfully.", "success");
      await loadSelectedSubmissions(selectedId);
      await loadAssessments(selectedId);
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not save all marks.",
        "error"
      );
    } finally {
      setActionLoading("");
    }
  };

  const handleSyncAllMarks = async () => {
    if (!selectedId) return;

    setActionLoading(`sync-all-${selectedId}`);
    try {
      const res = await syncAllSubmissionMarks(courseId, selectedId);

      await Swal.fire(
        "Synced",
        res?.message || "All saved marks synced successfully.",
        "success"
      );

      await loadSelectedSubmissions(selectedId);
      await loadAssessments(selectedId);
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Failed",
        err?.response?.data?.message || "Could not sync all marks.",
        "error"
      );
    } finally {
      setActionLoading("");
    }
  };

  const isDeadlinePassed = !!selectedAssessment?.dueDatePassed;
  const submissionToggleAction = selectedAssessment?.submissionsOpen
    ? "close"
    : "open";

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleCreateOrUpdate}
        className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
              {editingId
                ? "Edit File Submission Assessment"
                : "Create File Submission Assessment"}
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Create, edit, publish, close, and manage student files from this
              tab.
            </p>
          </div>

          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Cancel Edit
            </button>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            placeholder="Assessment title"
            required
          />

          <input
            type="number"
            min="0"
            value={form.fullMarks}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, fullMarks: e.target.value }))
            }
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            placeholder="Full marks"
            required
          />

          <input
            type="number"
            min="1"
            max="10"
            value={form.maxFileSizeMB}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, maxFileSizeMB: e.target.value }))
            }
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            placeholder="Max file size in MB"
          />

          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => {
                if (dateInputRef.current?.showPicker) {
                  dateInputRef.current.showPicker();
                } else {
                  dateInputRef.current?.focus();
                }
              }}
              className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-900 transition hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <input
                ref={dateInputRef}
                type="date"
                value={form.dueDate}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, dueDate: e.target.value }))
                }
                className="absolute inset-0 opacity-0"
              />
              <div className="flex items-center justify-between gap-2">
                <span>{form.dueDate || "Pick date"}</span>
                <CalendarIcon />
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                if (timeInputRef.current?.showPicker) {
                  timeInputRef.current.showPicker();
                } else {
                  timeInputRef.current?.focus();
                }
              }}
              className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-900 transition hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <input
                ref={timeInputRef}
                type="time"
                value={form.dueTime}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, dueTime: e.target.value }))
                }
                className="absolute inset-0 opacity-0"
              />
              <div className="flex items-center justify-between gap-2">
                <span>{form.dueTime || "Pick time"}</span>
                <ClockIcon />
              </div>
            </button>
          </div>
        </div>

        <div className="mt-4">
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <input
              type="checkbox"
              checked={form.allowResubmission}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  allowResubmission: e.target.checked,
                }))
              }
            />
            Allow resubmission
          </label>
        </div>

        <textarea
          value={form.instructions}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, instructions: e.target.value }))
          }
          rows={4}
          className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          placeholder="Instructions for students"
        />

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={savingForm}
            className="inline-flex items-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingForm
              ? editingId
                ? "Updating..."
                : "Creating..."
              : editingId
                ? "Update Submission Assessment"
                : "Create Submission Assessment"}
          </button>

          {editingId ? (
            <button
              type="button"
              onClick={() => handleDelete(editingId, form.name)}
              disabled={actionLoading === `delete-${editingId}`}
              className="inline-flex items-center rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
            >
              Delete This Assessment
            </button>
          ) : null}
        </div>
      </form>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4">
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
              Submission Assessments
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Select one assessment to manage files, visibility, and marks.
            </p>
          </div>

          {loading ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              No submission assessments created yet.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const isSelected = item.id === selectedId;
                const statusMeta = getSubmissionStatusMeta(item);

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border p-4 transition ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-50 dark:border-indigo-500/40 dark:bg-indigo-500/10"
                        : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className="w-full text-left"
                    >
                      <div className="text-base font-semibold text-slate-900 dark:text-white">
                        {item.name}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge tone={item.isVisibleToStudents ? "emerald" : "amber"}>
                          {item.isVisibleToStudents ? "Published" : "Unpublished"}
                        </Badge>

                        <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                      </div>

                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {item.submissionCount || 0} submission(s) • Full marks:{" "}
                        {item.fullMarks || 0}
                      </div>
                    </button>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(item)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(item.id, item.name)}
                        disabled={actionLoading === `delete-${item.id}`}
                        className="rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                Student Submissions
              </h3>

              {selectedAssessment ? (
                <div className="mt-2 space-y-2 text-sm text-slate-500 dark:text-slate-400">
                  <div>Assessment: {selectedAssessment.name}</div>
                  <div>Due: {formatDateTime(selectedAssessment.dueDate)}</div>
                  <div>Full Marks: {selectedAssessment.fullMarks || 0}</div>

                  <div className="flex flex-wrap gap-2">
                    <Badge
                      tone={selectedAssessment.isVisibleToStudents ? "emerald" : "amber"}
                    >
                      Visibility:{" "}
                      {selectedAssessment.isVisibleToStudents
                        ? "Published"
                        : "Unpublished"}
                    </Badge>

                    <Badge tone={selectedStatusMeta.tone}>
                      Submission: {selectedStatusMeta.label}
                    </Badge>
                  </div>

                  {selectedAssessment?.dueDatePassed ? (
                    <div className="text-xs font-medium text-rose-600 dark:text-rose-300">
                      This submission is auto-closed because the due date has
                      passed. Update the due date first if you want to reopen it.
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Select an assessment first.
                </div>
              )}
            </div>

            {selectedAssessment ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleAssessmentAction(
                      selectedAssessment.id,
                      selectedAssessment.isVisibleToStudents ? "unpublish" : "publish"
                    )
                  }
                  disabled={
                    actionLoading ===
                    `${selectedAssessment.id}-${
                      selectedAssessment.isVisibleToStudents
                        ? "unpublish"
                        : "publish"
                    }`
                  }
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
                >
                  {selectedAssessment.isVisibleToStudents ? "Unpublish" : "Publish"}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleAssessmentAction(
                      selectedAssessment.id,
                      submissionToggleAction
                    )
                  }
                  disabled={
                    isDeadlinePassed ||
                    actionLoading ===
                      `${selectedAssessment.id}-${submissionToggleAction}`
                  }
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {isDeadlinePassed
                    ? "Deadline Passed"
                    : selectedAssessment.submissionsOpen
                      ? "Turn Off Submission"
                      : "Turn On Submission"}
                </button>

                <button
                  type="button"
                  onClick={handleSaveAllMarks}
                  disabled={actionLoading === `save-all-${selectedAssessment.id}`}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Save All Marks
                </button>

                <button
                  type="button"
                  onClick={handleSyncAllMarks}
                  disabled={actionLoading === `sync-all-${selectedAssessment.id}`}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  Sync Marks
                </button>

                <button
                  type="button"
                  onClick={handleDownloadAll}
                  disabled={actionLoading === `download-${selectedAssessment.id}`}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Download All
                </button>
              </div>
            ) : null}
          </div>

          {!selectedId ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              No assessment selected.
            </div>
          ) : !selectedData?.submissions?.length ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              No student has submitted yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th className="px-3 py-3">Student</th>
                    <th className="px-3 py-3">File</th>
                    <th className="px-3 py-3">Submitted</th>
                    <th className="px-3 py-3">Marks</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedData.submissions.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-slate-100 align-top dark:border-slate-800"
                    >
                      <td className="px-3 py-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {row.studentName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {row.roll}
                        </div>
                      </td>

                      <td className="px-3 py-4">
                        <div className="max-w-[260px]">
                          <div className="truncate text-sm font-medium text-slate-900 dark:text-white">
                            {row.originalFileName}
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {formatFileSize(row.fileSize)}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <a
                              href={getPublicFileUrl(row.downloadUrl)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                            >
                              <EyeIcon />
                              View
                            </a>

                            <a
                              href={getPublicFileUrl(row.downloadUrl)}
                              download
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              <DownloadIcon />
                              Download
                            </a>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-4 text-slate-600 dark:text-slate-300">
                        {formatDateTime(row.submittedAt)}
                      </td>

                      <td className="px-3 py-4">
                        <div className="flex min-w-[180px] flex-col gap-2">
                          <input
                            type="number"
                            min="0"
                            max={selectedAssessment?.fullMarks || 0}
                            value={row.draftMarks}
                            onChange={(e) => updateDraftMarks(row.id, e.target.value)}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            placeholder="Enter marks"
                          />

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveMarks(row)}
                              disabled={actionLoading === `save-marks-${row.id}`}
                              className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-700 dark:hover:bg-slate-600"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-4">
                        <Badge tone={row.status === "checked" ? "emerald" : "amber"}>
                          {row.status}
                        </Badge>
                      </td>

                      <td className="px-3 py-4">
                        {row.status === "checked" ? (
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                            Checked
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleMarkChecked(row)}
                            disabled={actionLoading === `checked-${row.id}`}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                          >
                            Mark Checked
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}