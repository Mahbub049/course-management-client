import { useEffect, useMemo, useState } from "react";
import {
  fetchStudentProjectGroups,
  updateStudentProjectInfo,
} from "../../services/projectGroupService";
import { fetchStudentProjectFormConfig } from "../../services/projectFormService";

const defaultFields = {
  groupName: {
    visibleToStudent: true,
    editableByStudent: false,
    requiredOnGroupCreate: true,
    requiredOnProjectUpdate: false,
  },
  projectTitle: {
    visibleToStudent: true,
    editableByStudent: true,
    requiredOnGroupCreate: false,
    requiredOnProjectUpdate: false,
  },
  projectSummary: {
    visibleToStudent: true,
    editableByStudent: true,
    requiredOnGroupCreate: false,
    requiredOnProjectUpdate: false,
  },
  driveLink: {
    visibleToStudent: true,
    editableByStudent: true,
    requiredOnGroupCreate: false,
    requiredOnProjectUpdate: false,
  },
  repositoryLink: {
    visibleToStudent: true,
    editableByStudent: true,
    requiredOnGroupCreate: false,
    requiredOnProjectUpdate: false,
  },
  contactEmail: {
    visibleToStudent: true,
    editableByStudent: true,
    requiredOnGroupCreate: false,
    requiredOnProjectUpdate: false,
  },
  additionalNote: {
    visibleToStudent: true,
    editableByStudent: true,
    requiredOnGroupCreate: false,
    requiredOnProjectUpdate: false,
  },
};

export default function StudentProjectInfo({ course }) {
  const courseId = course?.id || course?._id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [myGroup, setMyGroup] = useState(null);
  const [fieldConfig, setFieldConfig] = useState(defaultFields);

  const [form, setForm] = useState({
    groupName: "",
    projectTitle: "",
    projectSummary: "",
    driveLink: "",
    repositoryLink: "",
    contactEmail: "",
    additionalNote: "",
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!courseId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const [groupData, configData] = await Promise.allSettled([
        fetchStudentProjectGroups(courseId),
        fetchStudentProjectFormConfig(courseId),
      ]);

      let groupPayload = null;
      let configPayload = null;

      if (groupData.status === "fulfilled") {
        groupPayload = groupData.value;
      }

      if (configData.status === "fulfilled") {
        configPayload = configData.value;
      }

      const currentGroup = groupPayload?.myGroup || null;
      setMyGroup(currentGroup);

      const mergedConfig = {
        ...defaultFields,
        ...(configPayload?.fields || {}),
      };

      setFieldConfig(mergedConfig);

      setForm({
        groupName: currentGroup?.groupName || "",
        projectTitle: currentGroup?.projectTitle || "",
        projectSummary: currentGroup?.projectSummary || "",
        driveLink: currentGroup?.driveLink || "",
        repositoryLink: currentGroup?.repositoryLink || "",
        contactEmail: currentGroup?.contactEmail || "",
        additionalNote: currentGroup?.additionalNote || currentGroup?.note || "",
      });
    } catch (err) {
      console.error(err);
      setError("Failed to load project information.");
    } finally {
      setLoading(false);
    }
  };

  const visibleFields = useMemo(() => {
    return [
      {
        key: "groupName",
        label: "Group Name",
        type: "text",
      },
      {
        key: "projectTitle",
        label: "Project Title",
        type: "text",
      },
      {
        key: "projectSummary",
        label: "Project Summary",
        type: "textarea",
      },
      {
        key: "driveLink",
        label: "Drive Link",
        type: "text",
      },
      {
        key: "repositoryLink",
        label: "Repository Link",
        type: "text",
      },
      {
        key: "contactEmail",
        label: "Contact Email",
        type: "email",
      },
      {
        key: "additionalNote",
        label: "Additional Note",
        type: "textarea",
      },
    ].filter((field) => fieldConfig?.[field.key]?.visibleToStudent !== false);
  }, [fieldConfig]);

  const editableCount = visibleFields.filter(
    (field) => fieldConfig?.[field.key]?.editableByStudent !== false
  ).length;

  const readOnlyCount = visibleFields.length - editableCount;

  const handleChange = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const validateForm = () => {
    for (const field of visibleFields) {
      const config = fieldConfig?.[field.key];
      if (config?.requiredOnProjectUpdate) {
        const value = String(form[field.key] || "").trim();
        if (!value) {
          return `${field.label} is required.`;
        }
      }
    }
    return "";
  };

  const handleSave = async () => {
    if (!myGroup) {
      setError("No project group found.");
      return;
    }

    const validationMessage = validateForm();
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = {};

      Object.keys(form).forEach((key) => {
        if (fieldConfig?.[key]?.editableByStudent !== false) {
          payload[key] = form[key];
        }
      });

      await updateStudentProjectInfo(courseId, payload);

      setSuccess("Project information updated successfully.");
      await loadAll();
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message || "Failed to update project information."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-[24px] bg-slate-100 dark:bg-slate-800"
            />
          ))}
        </div>

        <div className="h-[500px] animate-pulse rounded-[28px] bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }

  if (!myGroup) {
    return (
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Project Info
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            You need to create a project group first before managing project information.
          </p>
        </div>

        <div className="p-6">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
            No group found. Please go to <span className="font-semibold">My Group</span> and create your group first.
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <AlertBox tone="error" message={error} /> : null}
      {success ? <AlertBox tone="success" message={success} /> : null}

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-6 dark:border-slate-800">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                <InfoIcon className="h-4 w-4" />
                Project Info
              </div>

              <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                View and update your project details here
              </h3>

              <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-400">
                Teacher controls which fields are editable. Locked fields are still visible here as read-only.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 xl:w-[420px]">
              <TopMetricCard
                label="Visible Fields"
                value={String(visibleFields.length)}
                helper="Shown to student"
                tone="violet"
              />
              <TopMetricCard
                label="Editable"
                value={String(editableCount)}
                helper="Can be changed"
                tone="emerald"
              />
              <TopMetricCard
                label="Read Only"
                value={String(readOnlyCount)}
                helper="Teacher locked"
                tone="amber"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      Project Information Form
                    </h4>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Update only the fields your teacher has allowed.
                    </p>
                  </div>

                  <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
                    Group: {myGroup.groupName || "Unnamed"}
                  </span>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {visibleFields.map((field) => {
                  const config = fieldConfig?.[field.key] || {};
                  const editable = config.editableByStudent !== false;
                  const required = !!config.requiredOnProjectUpdate;
                  const value = form[field.key] || "";

                  return (
                    <div key={field.key}>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <label className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {field.label} {required ? <span className="text-rose-500">*</span> : null}
                        </label>

                        {editable ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                            Editable
                          </span>
                        ) : (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                            Read Only
                          </span>
                        )}
                      </div>

                      {field.type === "textarea" ? (
                        <textarea
                          rows={5}
                          value={value}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          disabled={!editable}
                          className={`w-full rounded-2xl border px-4 py-3 text-sm shadow-sm outline-none transition ${
                            editable
                              ? "border-slate-200 bg-white text-slate-800 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                              : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                          }`}
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                        />
                      ) : (
                        <input
                          type={field.type}
                          value={value}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          disabled={!editable}
                          className={`h-12 w-full rounded-2xl border px-4 text-sm shadow-sm outline-none transition ${
                            editable
                              ? "border-slate-200 bg-white text-slate-800 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                              : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                          }`}
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                        />
                      )}
                    </div>
                  );
                })}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || editableCount === 0}
                    className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Updating..." : "Update Project Information"}
                  </button>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Current Group
              </div>
              <h4 className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                Project info belongs to this group
              </h4>

              <div className="mt-4 space-y-3">
                <InfoLine label="Group Name" value={myGroup.groupName || "-"} />
                <InfoLine
                  label="Leader"
                  value={
                    myGroup.leader?.name
                      ? `${myGroup.leader.name}${
                          myGroup.leader?.roll ? ` (${myGroup.leader.roll})` : ""
                        }`
                      : "-"
                  }
                />
                <InfoLine
                  label="Members"
                  value={String(myGroup.members?.length || 0)}
                />
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Field Rule
              </div>
              <h4 className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                How this page works
              </h4>

              <div className="mt-4 space-y-3">
                <RuleCard
                  tone="emerald"
                  title="Editable fields"
                  text="These fields can be updated by students."
                />
                <RuleCard
                  tone="amber"
                  title="Read-only fields"
                  text="These fields stay visible but cannot be changed by students."
                />
                <RuleCard
                  tone="violet"
                  title="Required fields"
                  text="If teacher marks a field required for project update, you must fill it before saving."
                />
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}

function TopMetricCard({ label, value, helper, tone = "violet" }) {
  const toneMap = {
    violet:
      "border-violet-200 bg-violet-50 dark:border-violet-500/20 dark:bg-violet-500/10",
    emerald:
      "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10",
    amber:
      "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneMap[tone] || toneMap.violet}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
        {value}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{helper}</div>
    </div>
  );
}

function InfoLine({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}

function RuleCard({ tone = "amber", title, text }) {
  const toneMap = {
    emerald:
      "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10",
    amber:
      "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10",
    violet:
      "border-violet-200 bg-violet-50 dark:border-violet-500/20 dark:bg-violet-500/10",
  };

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneMap[tone] || toneMap.amber}`}>
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </div>
      <div className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
        {text}
      </div>
    </div>
  );
}

function AlertBox({ tone = "error", message }) {
  const styles =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
      : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300";

  return <div className={`rounded-2xl border px-4 py-3 text-sm ${styles}`}>{message}</div>;
}

function InfoIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" strokeLinecap="round" />
      <circle cx="12" cy="7.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}