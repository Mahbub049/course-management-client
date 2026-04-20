import { useEffect, useMemo, useState } from "react";
import {
  fetchStudentProjectGroups,
  createStudentProjectGroup,
  updateStudentProjectInfo,
} from "../../services/projectGroupService";
import { fetchStudentProjectFormConfig } from "../../services/projectFormService";

const DEFAULT_FORM_CONFIG = {
  fields: {
    groupName: { enabled: true, required: true },
    projectTitle: { enabled: true, required: true },
    projectSummary: { enabled: true, required: false },
    driveLink: { enabled: true, required: false },
    repositoryLink: { enabled: false, required: false },
    contactEmail: { enabled: true, required: false },
    note: { enabled: false, required: false },
  },
};

const EMPTY_FORM = {
  groupName: "",
  projectTitle: "",
  projectSummary: "",
  driveLink: "",
  repositoryLink: "",
  contactEmail: "",
  note: "",
};

export default function StudentProjectGroups({ course }) {
  const courseId = course?.id || course?._id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [groups, setGroups] = useState([]);
  const [myGroup, setMyGroup] = useState(null);
  const [availableStudents, setAvailableStudents] = useState([]);
  const [canCreateGroup, setCanCreateGroup] = useState(true);
  const [canEditProjectInfo, setCanEditProjectInfo] = useState(false);

  const [formConfig, setFormConfig] = useState(DEFAULT_FORM_CONFIG);
  const [form, setForm] = useState(EMPTY_FORM);

  const [selectedMembers, setSelectedMembers] = useState([]);
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

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

      const [groupsRes, formRes] = await Promise.allSettled([
        fetchStudentProjectGroups(courseId),
        fetchStudentProjectFormConfig(courseId),
      ]);

      if (groupsRes.status === "fulfilled") {
        const data = groupsRes.value || {};

        setGroups(Array.isArray(data.groups) ? data.groups : []);
        setMyGroup(data.myGroup || null);
        setAvailableStudents(
          Array.isArray(data.availableStudents) ? data.availableStudents : []
        );
        setCanCreateGroup(data.canCreateGroup !== false);
        setCanEditProjectInfo(data.canEditProjectInfo === true);

        if (data.myGroup) {
          setForm({
            groupName: data.myGroup.groupName || "",
            projectTitle: data.myGroup.projectTitle || "",
            projectSummary: data.myGroup.projectSummary || "",
            driveLink: data.myGroup.driveLink || "",
            repositoryLink: data.myGroup.repositoryLink || "",
            contactEmail: data.myGroup.contactEmail || "",
            note: data.myGroup.note || "",
          });
        } else {
          setForm(EMPTY_FORM);
        }
      }

      if (formRes.status === "fulfilled") {
        setFormConfig(
          formRes.value?.fields ? formRes.value : DEFAULT_FORM_CONFIG
        );
      } else {
        setFormConfig(DEFAULT_FORM_CONFIG);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load project information.");
    } finally {
      setLoading(false);
    }
  };

  const enabledFields = useMemo(
    () => formConfig?.fields || DEFAULT_FORM_CONFIG.fields,
    [formConfig]
  );

  const filteredStudents = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return availableStudents;

    return availableStudents.filter((student) => {
      return (
        String(student.name || "").toLowerCase().includes(q) ||
        String(student.roll || "").toLowerCase().includes(q)
      );
    });
  }, [availableStudents, memberSearch]);

  const toggleMember = (student) => {
    const exists = selectedMembers.find((item) => item.id === student.id);

    if (exists) {
      setSelectedMembers((prev) =>
        prev.filter((item) => item.id !== student.id)
      );
      return;
    }

    setSelectedMembers((prev) => [...prev, student]);
  };

  const validateDynamicForm = () => {
    const fieldLabels = {
      groupName: "Group name",
      projectTitle: "Project title",
      projectSummary: "Project summary",
      driveLink: "Drive link",
      repositoryLink: "Repository link",
      contactEmail: "Contact email",
      note: "Additional note",
    };

    for (const key of Object.keys(enabledFields)) {
      if (enabledFields[key]?.required && !String(form[key] || "").trim()) {
        setError(`${fieldLabels[key]} is required.`);
        return false;
      }
    }

    return true;
  };

  const handleCreateGroup = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (!validateDynamicForm()) return;

      if (selectedMembers.length === 0) {
        setError("Please select at least one group member.");
        return;
      }

      const payload = {
        ...form,
        memberIds: selectedMembers.map((m) => m.id),
      };

      await createStudentProjectGroup(courseId, payload);

      setSuccess("Project group created successfully.");
      setSelectedMembers([]);
      setMemberDropdownOpen(false);
      setMemberSearch("");

      await loadAll();
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message || "Failed to create project group."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProjectInfo = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (!validateDynamicForm()) return;

      await updateStudentProjectInfo(courseId, form);

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
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-[28px] bg-slate-100 dark:bg-slate-800" />
        <div className="h-80 animate-pulse rounded-[28px] bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <AlertBox tone="error" message={error} /> : null}
      {success ? <AlertBox tone="success" message={success} /> : null}

      {myGroup ? (
        <>
          <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:px-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    My Project Group
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Group details and saved project information.
                  </p>
                </div>

                <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                  Group Ready
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="xl:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {enabledFields.groupName?.enabled && (
                    <InfoCard label="Group Name" value={myGroup.groupName || "-"} />
                  )}

                  {enabledFields.projectTitle?.enabled && (
                    <InfoCard label="Project Title" value={myGroup.projectTitle || "-"} />
                  )}

                  {enabledFields.contactEmail?.enabled && (
                    <InfoCard
                      label="Contact Email"
                      value={myGroup.contactEmail || "-"}
                    />
                  )}

                  {enabledFields.driveLink?.enabled && (
                    <InfoCard
                      label="Drive Link"
                      value={myGroup.driveLink || "-"}
                      isLink={Boolean(myGroup.driveLink)}
                    />
                  )}

                  {enabledFields.repositoryLink?.enabled && (
                    <InfoCard
                      label="Repository Link"
                      value={myGroup.repositoryLink || "-"}
                      isLink={Boolean(myGroup.repositoryLink)}
                    />
                  )}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Group Leader
                  </div>

                  <div className="mt-4 flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-sm font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                      {getInitials(myGroup.leader?.name)}
                    </div>

                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {myGroup.leader?.name || "-"}
                      </div>
                      <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Roll: {myGroup.leader?.roll || "-"}
                      </div>
                      {myGroup.leader?.email ? (
                        <div className="mt-1 break-all text-sm text-slate-500 dark:text-slate-400">
                          {myGroup.leader.email}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {enabledFields.projectSummary?.enabled && (
                <LongTextCard
                  label="Project Summary"
                  value={myGroup.projectSummary || "No summary added yet."}
                />
              )}

              {enabledFields.note?.enabled && (
                <LongTextCard
                  label="Additional Note"
                  value={myGroup.note || "No note added yet."}
                />
              )}

              <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-800/50">
                <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Group Members
                </div>
                <div className="flex flex-wrap gap-2">
                  {(myGroup.members || []).map((member) => (
                    <span
                      key={member.id}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      {member.name}
                      {member.roll ? ` • ${member.roll}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:px-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Update Project Information
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Only the group leader can update this information.
              </p>
            </div>

            <div className="p-5 sm:p-6 space-y-6">
              {!canEditProjectInfo ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                  Only the group leader can edit project information.
                </div>
              ) : (
                <>
                  <ProjectFormFields
                    enabledFields={enabledFields}
                    form={form}
                    setForm={setForm}
                  />

                  <div>
                    <button
                      type="button"
                      onClick={handleUpdateProjectInfo}
                      disabled={saving}
                      className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? "Saving..." : "Update Project Information"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </>
      ) : canCreateGroup ? (
        <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:px-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Create Project Group
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              You will become the group leader automatically.
            </p>
          </div>

          <div className="p-5 sm:p-6 space-y-6">
            <ProjectFormFields
              enabledFields={enabledFields}
              form={form}
              setForm={setForm}
            />

            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Select Group Members <span className="text-rose-500">*</span>
              </div>

              <MemberPicker
                open={memberDropdownOpen}
                setOpen={setMemberDropdownOpen}
                search={memberSearch}
                setSearch={setMemberSearch}
                options={filteredStudents}
                selectedMembers={selectedMembers}
                onToggle={toggleMember}
              />
            </div>

            <div>
              <button
                type="button"
                onClick={handleCreateGroup}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Create Group"}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
            Group creation is currently disabled for students.
          </div>
        </section>
      )}

      <section className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:px-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Group Directory
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            All groups in this course.
          </p>
        </div>

        <div className="p-5 sm:p-6">
          {groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
              No groups available yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-800/40"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {group.groupName || "Unnamed Group"}
                    </h3>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {group.members?.length || 0} Members
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    {group.projectTitle || "No project title added yet."}
                  </p>

                  <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">Leader:</span>{" "}
                    {group.leader?.name || "-"}
                    {group.leader?.roll ? ` (${group.leader.roll})` : ""}
                  </div>

                  {(group.members || []).length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {group.members.map((member) => (
                        <span
                          key={member.id}
                          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                          {member.name}
                          {member.roll ? ` • ${member.roll}` : ""}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ProjectFormFields({ enabledFields, form, setForm }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {enabledFields.groupName?.enabled && (
        <FieldBlock label="Group Name" required={enabledFields.groupName?.required}>
          <input
            type="text"
            value={form.groupName}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, groupName: e.target.value }))
            }
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Enter group name"
          />
        </FieldBlock>
      )}

      {enabledFields.projectTitle?.enabled && (
        <FieldBlock
          label="Project Title"
          required={enabledFields.projectTitle?.required}
        >
          <input
            type="text"
            value={form.projectTitle}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, projectTitle: e.target.value }))
            }
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Enter project title"
          />
        </FieldBlock>
      )}

      {enabledFields.contactEmail?.enabled && (
        <FieldBlock
          label="Contact Email"
          required={enabledFields.contactEmail?.required}
        >
          <input
            type="email"
            value={form.contactEmail}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, contactEmail: e.target.value }))
            }
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Enter contact email"
          />
        </FieldBlock>
      )}

      {enabledFields.driveLink?.enabled && (
        <FieldBlock label="Drive Link" required={enabledFields.driveLink?.required}>
          <input
            type="url"
            value={form.driveLink}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, driveLink: e.target.value }))
            }
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Paste Google Drive or OneDrive link"
          />
        </FieldBlock>
      )}

      {enabledFields.repositoryLink?.enabled && (
        <FieldBlock
          label="Repository Link"
          required={enabledFields.repositoryLink?.required}
        >
          <input
            type="url"
            value={form.repositoryLink}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, repositoryLink: e.target.value }))
            }
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Paste GitHub or repository link"
          />
        </FieldBlock>
      )}

      {enabledFields.projectSummary?.enabled && (
        <FieldBlock
          label="Project Summary"
          required={enabledFields.projectSummary?.required}
          full
        >
          <textarea
            rows={4}
            value={form.projectSummary}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, projectSummary: e.target.value }))
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Write a short project summary"
          />
        </FieldBlock>
      )}

      {enabledFields.note?.enabled && (
        <FieldBlock label="Additional Note" required={enabledFields.note?.required} full>
          <textarea
            rows={4}
            value={form.note}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, note: e.target.value }))
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Write any extra note"
          />
        </FieldBlock>
      )}
    </div>
  );
}

function MemberPicker({
  open,
  setOpen,
  search,
  setSearch,
  options,
  selectedMembers,
  onToggle,
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-11 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
      >
        <span className="truncate">
          {selectedMembers.length > 0
            ? `${selectedMembers.length} member${selectedMembers.length > 1 ? "s" : ""} selected`
            : "Choose members"}
        </span>
        <span className={`transition ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>

      {selectedMembers.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedMembers.map((student) => (
            <button
              key={student.id}
              type="button"
              onClick={() => onToggle(student)}
              className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300"
            >
              {student.name}
              {student.roll ? ` • ${student.roll}` : ""}
            </button>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="absolute z-20 mt-3 w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-3 dark:border-slate-800">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              placeholder="Search by name or roll"
            />
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {options.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                No available students found.
              </div>
            ) : (
              options.map((student) => {
                const checked = selectedMembers.some((m) => m.id === student.id);
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => onToggle(student)}
                    className="flex w-full items-start justify-between rounded-2xl px-3 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {student.name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Roll: {student.roll || "-"}
                      </div>
                    </div>

                    <div
                      className={`ml-3 mt-1 h-5 w-5 rounded-md border ${
                        checked
                          ? "border-violet-600 bg-violet-600"
                          : "border-slate-300 dark:border-slate-600"
                      }`}
                    />
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FieldBlock({ label, required, children, full = false }) {
  return (
    <div className={full ? "lg:col-span-2" : ""}>
      <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </div>
      {children}
    </div>
  );
}

function InfoCard({ label, value, isLink = false }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-sm text-slate-900 dark:text-slate-100 break-all">
        {isLink && value !== "-" ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="text-violet-600 hover:underline dark:text-violet-300"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function LongTextCard({ label, value }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {label}
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
        {value}
      </p>
    </div>
  );
}

function AlertBox({ tone = "error", message }) {
  const styles =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
      : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300";

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${styles}`}>
      {message}
    </div>
  );
}

function getInitials(name) {
  return String(name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}