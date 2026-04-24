import { useEffect, useMemo, useState } from "react";
import {
  fetchTeacherProjectFormConfig,
  updateTeacherProjectFormConfig,
} from "../../services/projectFormService";

const DEFAULT_FIELDS = {
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
    requiredOnProjectUpdate: true,
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

const FIELD_META = [
  {
    key: "groupName",
    title: "Group Name",
    desc: "Basic group identity shown on teacher and student side.",
    supportedNow: true,
  },
  {
    key: "projectTitle",
    title: "Project Title",
    desc: "Main title of the selected project.",
    supportedNow: true,
  },
  {
    key: "projectSummary",
    title: "Project Summary",
    desc: "Short description of the project idea or scope.",
    supportedNow: true,
  },
  {
    key: "driveLink",
    title: "Drive Link",
    desc: "Google Drive or OneDrive folder link for later modules.",
    supportedNow: false,
  },
  {
    key: "repositoryLink",
    title: "Repository Link",
    desc: "GitHub or other code repository link for later modules.",
    supportedNow: false,
  },
  {
    key: "contactEmail",
    title: "Contact Email",
    desc: "Shared group email or contact address for later modules.",
    supportedNow: false,
  },
  {
    key: "additionalNote",
    title: "Additional Note",
    desc: "Extra remarks or supporting note for later modules.",
    supportedNow: false,
  },
];

function mergeFields(rawFields = {}) {
  const merged = {};

  Object.keys(DEFAULT_FIELDS).forEach((key) => {
    merged[key] = {
      visibleToStudent:
        rawFields?.[key]?.visibleToStudent ??
        DEFAULT_FIELDS[key].visibleToStudent,

      editableByStudent:
        rawFields?.[key]?.editableByStudent ??
        DEFAULT_FIELDS[key].editableByStudent,

      requiredOnGroupCreate:
        rawFields?.[key]?.requiredOnGroupCreate ??
        DEFAULT_FIELDS[key].requiredOnGroupCreate,

      requiredOnProjectUpdate:
        rawFields?.[key]?.requiredOnProjectUpdate ??
        DEFAULT_FIELDS[key].requiredOnProjectUpdate,
    };
  });

  return merged;
}

export default function TeacherProjectForm({ course }) {
  const courseId = course?.id || course?._id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fields, setFields] = useState(DEFAULT_FIELDS);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!courseId) return;
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const data = await fetchTeacherProjectFormConfig(courseId);
      setFields(mergeFields(data?.fields || {}));
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          "Failed to load project form configuration."
      );
    } finally {
      setLoading(false);
    }
  };

  const enabledCount = useMemo(
    () => Object.values(fields).filter((item) => item.visibleToStudent).length,
    [fields]
  );

  const handleFieldChange = (key, fieldName) => {
    setFields((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [fieldName]: !prev[key][fieldName],
      },
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = { fields };

      await updateTeacherProjectFormConfig(courseId, payload);
      setSuccess("Project form configuration saved successfully.");
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          "Failed to save project form configuration."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-80 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Project Form Configuration
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Choose which fields students can see, edit, and must complete
                during group creation or project update.
              </p>
            </div>

            <div className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
              {enabledCount} field{enabledCount === 1 ? "" : "s"} visible
            </div>
          </div>
        </div>

        <div className="p-6">
          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
              {success}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {FIELD_META.map((item) => {
              const state = fields[item.key] || {
                visibleToStudent: true,
                editableByStudent: false,
                requiredOnGroupCreate: false,
                requiredOnProjectUpdate: false,
              };

              return (
                <div
                  key={item.key}
                  className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-800/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {item.title}
                        </h4>

                        {item.supportedNow ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                            Supported now
                          </span>
                        ) : (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                            Next modules
                          </span>
                        )}
                      </div>

                      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        {item.desc}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <ToggleRow
                      label="Visible to Student"
                      checked={state.visibleToStudent}
                      onChange={() =>
                        handleFieldChange(item.key, "visibleToStudent")
                      }
                    />

                    <ToggleRow
                      label="Editable by Student"
                      checked={state.editableByStudent}
                      onChange={() =>
                        handleFieldChange(item.key, "editableByStudent")
                      }
                    />

                    <ToggleRow
                      label="Required on Group Create"
                      checked={state.requiredOnGroupCreate}
                      onChange={() =>
                        handleFieldChange(item.key, "requiredOnGroupCreate")
                      }
                    />

                    <ToggleRow
                      label="Required on Project Update"
                      checked={state.requiredOnProjectUpdate}
                      onChange={() =>
                        handleFieldChange(item.key, "requiredOnProjectUpdate")
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={loadConfig}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Reload
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Form Configuration"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={[
        "relative inline-flex h-7 w-12 items-center rounded-full transition",
        checked ? "bg-violet-600" : "bg-slate-300 dark:bg-slate-600",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-5 w-5 transform rounded-full bg-white transition",
          checked ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </span>

      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  );
}