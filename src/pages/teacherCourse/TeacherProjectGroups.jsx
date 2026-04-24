import { useEffect, useMemo, useState } from "react";
import {
  createTeacherProjectGroup,
  deleteTeacherProjectGroup,
  fetchTeacherProjectGroups,
  updateTeacherProjectGroup,
} from "../../services/projectGroupService";

const initialForm = {
  groupName: "",
  projectTitle: "",
  leaderId: "",
  memberIds: [],
  note: "",
};

export default function TeacherProjectGroups({ course }) {
  const courseId = course?.id || course?._id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [availableStudents, setAvailableStudents] = useState([]);

  const [editingGroupId, setEditingGroupId] = useState(null);
  const [form, setForm] = useState(initialForm);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [groupSearch, setGroupSearch] = useState("");

  useEffect(() => {
    if (!courseId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const loadData = async () => {
    try {
      if (!courseId) return;

      setLoading(true);
      setError("");

      const data = await fetchTeacherProjectGroups(courseId);

      setGroups(Array.isArray(data?.groups) ? data.groups : []);
      setStudents(Array.isArray(data?.students) ? data.students : []);
      setAvailableStudents(
        Array.isArray(data?.availableStudents) ? data.availableStudents : []
      );
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message || "Failed to load project group data."
      );
    } finally {
      setLoading(false);
    }
  };

  const formSelectableStudents = useMemo(() => {
    if (!editingGroupId) return availableStudents;

    const editingGroup = groups.find(
      (group) => String(group._id || group.id) === String(editingGroupId)
    );

    const currentMemberIds = new Set(
      (editingGroup?.members || []).map((member) => String(member._id || member.id))
    );

    return students.filter((student) => {
      const id = String(student._id || student.id);
      const isAvailable = availableStudents.some(
        (availableStudent) => String(availableStudent._id || availableStudent.id) === id
      );
      return isAvailable || currentMemberIds.has(id);
    });
  }, [availableStudents, editingGroupId, groups, students]);

  const selectedMemberIds = useMemo(() => {
    return Array.from(
      new Set([
        ...form.memberIds.map(String),
        ...(form.leaderId ? [String(form.leaderId)] : []),
      ])
    );
  }, [form.memberIds, form.leaderId]);

  const filteredGroups = useMemo(() => {
    const term = groupSearch.trim().toLowerCase();
    if (!term) return groups;

    return groups.filter((group) => {
      const groupName = (group.groupName || "").toLowerCase();
      const projectTitle = (group.projectTitle || "").toLowerCase();
      const leaderName = (group.leader?.name || "").toLowerCase();
      const leaderRoll = String(group.leader?.roll || "").toLowerCase();

      const memberText = (group.members || [])
        .map((member) => `${member.name || ""} ${member.roll || ""}`.toLowerCase())
        .join(" ");

      return (
        groupName.includes(term) ||
        projectTitle.includes(term) ||
        leaderName.includes(term) ||
        leaderRoll.includes(term) ||
        memberText.includes(term)
      );
    });
  }, [groupSearch, groups]);

  const stats = useMemo(() => {
    const assignedCount = students.length - availableStudents.length;
    const avgMembers =
      groups.length > 0
        ? (groups.reduce((sum, group) => sum + (group.members?.length || 0), 0) / groups.length).toFixed(1)
        : "0.0";

    return [
      {
        label: "Total Groups",
        value: String(groups.length),
        helper: "Created groups",
        tone: "violet",
      },
      {
        label: "Assigned Students",
        value: String(assignedCount),
        helper: "Already in a group",
        tone: "emerald",
      },
      {
        label: "Available Students",
        value: String(availableStudents.length),
        helper: "Still unassigned",
        tone: "amber",
      },
      {
        label: "Average Size",
        value: avgMembers,
        helper: "Members per group",
        tone: "sky",
      },
    ];
  }, [availableStudents.length, groups, students.length]);

  const handleToggleMember = (studentId) => {
    const id = String(studentId);

    setForm((prev) => {
      const exists = prev.memberIds.some((memberId) => String(memberId) === id);

      return {
        ...prev,
        memberIds: exists
          ? prev.memberIds.filter((memberId) => String(memberId) !== id)
          : [...prev.memberIds, id],
      };
    });
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingGroupId(null);
    setError("");
    setSuccess("");
  };

  const handleEdit = (group) => {
    setEditingGroupId(group._id || group.id);
    setForm({
      groupName: group.groupName || "",
      projectTitle: group.projectTitle || "",
      leaderId: group.leader?._id || group.leader?.id || "",
      memberIds: Array.isArray(group.members)
        ? group.members.map((member) => member._id || member.id)
        : [],
      note: group.note || "",
    });
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!courseId) return;

    if (!form.groupName.trim()) {
      setError("Group name is required.");
      return;
    }

    if (!form.leaderId) {
      setError("Please select a group leader.");
      return;
    }

    const memberIds = Array.from(
      new Set([String(form.leaderId), ...form.memberIds.map(String)])
    );

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = {
        groupName: form.groupName.trim(),
        projectTitle: form.projectTitle.trim(),
        leaderId: String(form.leaderId),
        memberIds,
        note: form.note.trim(),
      };

      if (editingGroupId) {
        await updateTeacherProjectGroup(courseId, editingGroupId, payload);
        setSuccess("Project group updated successfully.");
      } else {
        await createTeacherProjectGroup(courseId, payload);
        setSuccess("Project group created successfully.");
      }

      resetForm();
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to save group.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (groupId) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this group?"
    );

    if (!confirmed) return;

    try {
      setError("");
      setSuccess("");

      await deleteTeacherProjectGroup(courseId, groupId);
      setSuccess("Project group deleted successfully.");

      if (String(editingGroupId) === String(groupId)) {
        resetForm();
      }

      await loadData();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to delete group.");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-[24px] bg-slate-100 dark:bg-slate-800"
            />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="h-[680px] animate-pulse rounded-[28px] bg-slate-100 dark:bg-slate-800" />
          <div className="h-[680px] animate-pulse rounded-[28px] bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-6 dark:border-slate-800">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                <UsersIcon className="h-4 w-4" />
                Teacher Group Management
              </div>

              <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Organize groups with a cleaner and more controlled workflow
              </h3>

              <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-400">
                Create groups, assign leaders, manage members, and quickly see
                which students are already grouped or still available.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:w-[520px]">
              {stats.map((item) => (
                <TopMetricCard
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  helper={item.helper}
                  tone={item.tone}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 p-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {editingGroupId ? "Edit Project Group" : "Create Project Group"}
                  </h4>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Teacher can create, fix, or reorganize groups manually.
                  </p>
                </div>

                {editingGroupId ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                    Editing
                  </span>
                ) : (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                    New Group
                  </span>
                )}
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

              <form onSubmit={handleSubmit} className="space-y-5">
                <Field label="Group Name" required>
                  <input
                    type="text"
                    value={form.groupName}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, groupName: e.target.value }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    placeholder="Example: Team Alpha"
                  />
                </Field>

                <Field label="Project Title">
                  <input
                    type="text"
                    value={form.projectTitle}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, projectTitle: e.target.value }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    placeholder="Enter project title"
                  />
                </Field>

                <Field label="Leader" required>
                  <select
                    value={form.leaderId}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, leaderId: e.target.value }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="">Select group leader</option>
                    {formSelectableStudents.map((student) => (
                      <option
                        key={student._id || student.id}
                        value={student._id || student.id}
                      >
                        {student.name} {student.roll ? `(${student.roll})` : ""}
                      </option>
                    ))}
                  </select>
                </Field>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Members
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {selectedMemberIds.length} selected
                    </div>
                  </div>

                  {formSelectableStudents.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                      No available students found.
                    </div>
                  ) : (
                    <CompactMemberSelect
                      options={formSelectableStudents}
                      selectedValues={selectedMemberIds}
                      leaderId={form.leaderId}
                      onToggle={handleToggleMember}
                    />
                  )}
                </div>

                <Field label="Note">
                  <textarea
                    rows={4}
                    value={form.note}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, note: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    placeholder="Optional teacher note"
                  />
                </Field>

                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving
                      ? editingGroupId
                        ? "Updating..."
                        : "Creating..."
                      : editingGroupId
                      ? "Update Group"
                      : "Create Group"}
                  </button>

                  {editingGroupId ? (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Cancel Edit
                    </button>
                  ) : null}
                </div>
              </form>
            </div>
          </section>

          <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Existing Groups
                  </h4>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Search groups, review members, and edit or delete instantly.
                  </p>
                </div>

                <div className="w-full lg:w-[320px]">
                  <input
                    type="text"
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    placeholder="Search by group, student, roll, or project"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {filteredGroups.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/70 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                  {groups.length === 0
                    ? "No project groups have been created yet."
                    : "No groups matched your search."}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredGroups.map((group) => {
                    const groupId = group._id || group.id;
                    const members = Array.isArray(group.members) ? group.members : [];
                    const leaderId = String(group.leader?._id || group.leader?.id || "");

                    return (
                      <div
                        key={groupId}
                        className="rounded-[26px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm transition hover:shadow-md dark:border-slate-700 dark:from-slate-900 dark:to-slate-950"
                      >
                        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h5 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                                {group.groupName}
                              </h5>

                              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
                                {members.length} Member{members.length > 1 ? "s" : ""}
                              </span>

                              {group.projectTitle ? (
                                <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                                  Project Added
                                </span>
                              ) : (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                                  Title Missing
                                </span>
                              )}
                            </div>

                            <div className="mt-3 grid gap-3 md:grid-cols-3">
                              <InfoMiniCard
                                label="Project Title"
                                value={group.projectTitle || "Not added yet"}
                              />
                              <InfoMiniCard
                                label="Leader"
                                value={
                                  group.leader?.name
                                    ? `${group.leader.name}${
                                        group.leader?.roll ? ` (${group.leader.roll})` : ""
                                      }`
                                    : "-"
                                }
                              />
                              <InfoMiniCard
                                label="Internal Note"
                                value={group.note || "No note added"}
                              />
                            </div>

                            {(group.projectSummary ||
                              group.contactEmail ||
                              group.driveLink ||
                              group.repositoryLink) && (
                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                {group.projectSummary ? (
                                  <DetailBlock
                                    title="Project Summary"
                                    value={group.projectSummary}
                                    wide
                                  />
                                ) : null}

                                {group.contactEmail ? (
                                  <DetailBlock
                                    title="Contact Email"
                                    value={group.contactEmail}
                                  />
                                ) : null}

                                {group.driveLink ? (
                                  <DetailBlock
                                    title="Drive Link"
                                    value={group.driveLink}
                                    isLink
                                  />
                                ) : null}

                                {group.repositoryLink ? (
                                  <DetailBlock
                                    title="Repository Link"
                                    value={group.repositoryLink}
                                    isLink
                                  />
                                ) : null}
                              </div>
                            )}

                            <div className="mt-5">
                              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                                Group Members
                              </div>

                              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {members.map((member) => {
                                  const memberId = String(member._id || member.id);
                                  const isLeader = memberId === leaderId;

                                  return (
                                    <div
                                      key={memberId}
                                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                            {member.name || "Unnamed Student"}
                                          </div>
                                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            Roll: {member.roll || "-"}
                                          </div>
                                        </div>

                                        {isLeader ? (
                                          <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                                            Leader
                                          </span>
                                        ) : (
                                          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                            Member
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 xl:w-[170px] xl:flex-col">
                            <button
                              type="button"
                              onClick={() => handleEdit(group)}
                              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              Edit Group
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(groupId)}
                              className="inline-flex items-center justify-center rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/20 transition hover:bg-rose-700"
                            >
                              Delete Group
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="rounded-[26px] border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-900/40">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      Available Students
                    </h4>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      These students are currently not assigned to any group.
                    </p>
                  </div>

                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                    {availableStudents.length} Unassigned
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {availableStudents.length === 0 ? (
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      No unassigned students left.
                    </span>
                  ) : (
                    availableStudents.map((student) => (
                      <span
                        key={student._id || student.id}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                      >
                        {student.name}
                        {student.roll ? ` • ${student.roll}` : ""}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </div>
      {children}
    </label>
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
    sky:
      "border-sky-200 bg-sky-50 dark:border-sky-500/20 dark:bg-sky-500/10",
  };

  return (
    <div
      className={[
        "rounded-2xl border px-4 py-3",
        toneMap[tone] || toneMap.violet,
      ].join(" ")}
    >
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

function InfoMiniCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}

function DetailBlock({ title, value, isLink = false, wide = false }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 ${
        wide ? "md:col-span-2" : ""
      }`}
    >
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        {title}
      </div>

      {isLink ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="break-all text-sm text-violet-600 hover:underline dark:text-violet-300"
        >
          {value}
        </a>
      ) : (
        <div className="text-sm leading-6 text-slate-700 dark:text-slate-300">
          {value}
        </div>
      )}
    </div>
  );
}

function CompactMemberSelect({
  options = [],
  selectedValues = [],
  leaderId = "",
  onToggle,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredOptions = options.filter((student) => {
    const term = search.toLowerCase();
    const name = (student.name || "").toLowerCase();
    const roll = String(student.roll || "").toLowerCase();
    return name.includes(term) || roll.includes(term);
  });

  const selectedStudents = options.filter((student) =>
    selectedValues.includes(String(student._id || student.id))
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-12 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
      >
        <span className="truncate">
          {selectedStudents.length > 0
            ? `${selectedStudents.length} member${
                selectedStudents.length > 1 ? "s" : ""
              } selected`
            : "Choose members"}
        </span>

        <svg
          className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {selectedStudents.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedStudents.map((student) => {
            const studentId = String(student._id || student.id);
            const isLeader = String(leaderId) === studentId;

            return (
              <span
                key={studentId}
                className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300"
              >
                <span className="truncate max-w-[170px]">
                  {student.name}
                  {student.roll ? ` • ${student.roll}` : ""}
                  {isLeader ? " • Leader" : ""}
                </span>

                {!isLeader ? (
                  <button
                    type="button"
                    onClick={() => onToggle(studentId)}
                    className="rounded-full leading-none text-violet-700 hover:text-rose-600 dark:text-violet-300 dark:hover:text-rose-300"
                  >
                    ×
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : null}

      {open ? (
        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-3 dark:border-slate-800">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or roll"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                No students found.
              </div>
            ) : (
              filteredOptions.map((student) => {
                const id = String(student._id || student.id);
                const checked = selectedValues.includes(id);
                const isLeader = String(leaderId) === id;

                return (
                  <label
                    key={id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                      checked
                        ? "bg-violet-50 dark:bg-violet-500/10"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isLeader}
                      onChange={() => onToggle(id)}
                      className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 disabled:opacity-60"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {student.name}
                        {student.roll ? (
                          <span className="text-slate-500 dark:text-slate-400">
                            {" "}
                            • {student.roll}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {isLeader ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                        Leader
                      </span>
                    ) : null}
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UsersIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path
        d="M16 19a4 4 0 0 0-8 0"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11" r="3" />
      <path
        d="M19 19a3 3 0 0 0-2.2-2.88M5 19a3 3 0 0 1 2.2-2.88M17 8.5a2.5 2.5 0 1 1 0 5M7 8.5a2.5 2.5 0 1 0 0 5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}