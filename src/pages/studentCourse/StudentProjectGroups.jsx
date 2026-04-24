import { useEffect, useMemo, useState } from "react";
import {
  fetchStudentProjectGroups,
  createStudentProjectGroup,
} from "../../services/projectGroupService";

export default function StudentProjectGroups({ course }) {
  const courseId = course?.id || course?._id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [groups, setGroups] = useState([]);
  const [myGroup, setMyGroup] = useState(null);
  const [availableStudents, setAvailableStudents] = useState([]);
  const [canCreateGroup, setCanCreateGroup] = useState(true);

  const [form, setForm] = useState({
    groupName: "",
    projectTitle: "",
  });

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

      const data = await fetchStudentProjectGroups(courseId);

      setGroups(Array.isArray(data?.groups) ? data.groups : []);
      setMyGroup(data?.myGroup || null);
      setAvailableStudents(
        Array.isArray(data?.availableStudents) ? data.availableStudents : []
      );
      setCanCreateGroup(data?.canCreateGroup !== false);

      if (data?.myGroup) {
        setForm({
          groupName: data.myGroup.groupName || "",
          projectTitle: data.myGroup.projectTitle || "",
        });
      } else {
        setForm({
          groupName: "",
          projectTitle: "",
        });
      }
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message || "Failed to load group information."
      );
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return availableStudents;

    return availableStudents.filter((student) => {
      return (
        String(student.name || "")
          .toLowerCase()
          .includes(q) ||
        String(student.roll || "")
          .toLowerCase()
          .includes(q)
      );
    });
  }, [availableStudents, memberSearch]);

  const selectedCount = selectedMembers.length + 1;

  const toggleMember = (student) => {
    const studentId = String(student.id || student._id);
    const exists = selectedMembers.find(
      (item) => String(item.id || item._id) === studentId
    );

    if (exists) {
      setSelectedMembers((prev) =>
        prev.filter((item) => String(item.id || item._id) !== studentId)
      );
      return;
    }

    setSelectedMembers((prev) => [...prev, student]);
  };

  const handleCreateGroup = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (!String(form.groupName || "").trim()) {
        setError("Group name is required.");
        return;
      }

      if (selectedMembers.length === 0) {
        setError("Please select at least one group member.");
        return;
      }

      const payload = {
        groupName: form.groupName.trim(),
        projectTitle: form.projectTitle.trim(),
        memberIds: selectedMembers.map((m) => m.id || m._id),
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

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="h-[420px] animate-pulse rounded-[28px] bg-slate-100 dark:bg-slate-800" />
          <div className="h-[420px] animate-pulse rounded-[28px] bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
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
                <UsersIcon className="h-4 w-4" />
                My Group
              </div>

              <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Create and manage your project group from one clean section
              </h3>

              <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-400">
                This section is only for group formation. Project details like
                summary, links, and contact information should be updated from
                the Project Info tab.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:w-[520px]">
              <TopMetricCard
                label="My Status"
                value={myGroup ? "Grouped" : "Pending"}
                helper="Current group state"
                tone={myGroup ? "emerald" : "amber"}
              />
              <TopMetricCard
                label="My Role"
                value={myGroup ? getRoleText(myGroup) : "Not Set"}
                helper="Leader or member"
                tone="violet"
              />
              <TopMetricCard
                label="Members"
                value={myGroup ? String(myGroup.members?.length || 0) : "0"}
                helper="Current team size"
                tone="sky"
              />
              <TopMetricCard
                label="Open Seats"
                value={String(availableStudents.length)}
                helper="Ungrouped students"
                tone="amber"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            {myGroup ? (
              <>
                <section className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        Current Group
                      </div>
                      <h4 className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100">
                        {myGroup.groupName || "Unnamed Group"}
                      </h4>
                      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        Your group is already created. Use the Project Info tab
                        to update summary, links, and other project details.
                      </p>
                    </div>

                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                      Group Ready
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <InfoCard label="Group Name" value={myGroup.groupName || "-"} />
                    <InfoCard
                      label="Initial Project Title"
                      value={myGroup.projectTitle || "Not added yet"}
                    />
                    <InfoCard
                      label="Group Leader"
                      value={
                        myGroup.leader?.name
                          ? `${myGroup.leader.name}${
                              myGroup.leader?.roll
                                ? ` (${myGroup.leader.roll})`
                                : ""
                            }`
                          : "-"
                      }
                    />
                    <InfoCard
                      label="Your Role"
                      value={getRoleText(myGroup)}
                    />
                  </div>
                </section>

                <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Group Members
                      </h4>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Leader and members of your current project group.
                      </p>
                    </div>

                    <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
                      {myGroup.members?.length || 0} Members
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {(myGroup.members || []).map((member) => {
                      const memberId = String(member.id || member._id);
                      const leaderId = String(
                        myGroup.leader?.id || myGroup.leader?._id || ""
                      );
                      const isLeader = memberId === leaderId;

                      return (
                        <div
                          key={memberId}
                          className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 dark:border-slate-700 dark:bg-slate-900"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {member.name || "Unnamed Student"}
                              </div>
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Roll: {member.roll || "-"}
                              </div>
                              {member.email ? (
                                <div className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">
                                  {member.email}
                                </div>
                              ) : null}
                            </div>

                            <span
                              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                                isLeader
                                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                                  : "border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              }`}
                            >
                              {isLeader ? "Leader" : "Member"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            ) : canCreateGroup ? (
              <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Create Project Group
                      </h4>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        You will become the group leader automatically after
                        creating the group.
                      </p>
                    </div>

                    <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                      Leader Mode
                    </span>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  <FieldBlock label="Group Name" required>
                    <input
                      type="text"
                      value={form.groupName}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          groupName: e.target.value,
                        }))
                      }
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      placeholder="Example: Team Alpha"
                    />
                  </FieldBlock>

                  <FieldBlock label="Initial Project Title">
                    <input
                      type="text"
                      value={form.projectTitle}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          projectTitle: e.target.value,
                        }))
                      }
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      placeholder="Optional for now"
                    />
                  </FieldBlock>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Select Group Members <span className="text-rose-500">*</span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {selectedCount} total including you
                      </div>
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

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 dark:border-slate-700 dark:bg-slate-900">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Group creation note
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      After the group is created, complete summary, links, and
                      other project details from the Project Info tab.
                    </p>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={handleCreateGroup}
                      disabled={saving}
                      className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? "Creating..." : "Create Group"}
                    </button>
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                  Group creation is currently disabled for students. Please
                  contact your course teacher if you need help with group
                  formation.
                </div>
              </section>
            )}

            <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      Group Directory
                    </h4>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      All created groups for this course.
                    </p>
                  </div>

                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    {groups.length} Group{groups.length > 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              <div className="p-6">
                {groups.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                    No groups available yet.
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {groups.map((group) => (
                      <div
                        key={group.id || group._id}
                        className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 dark:border-slate-700 dark:from-slate-900 dark:to-slate-950"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <h5 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            {group.groupName || "Unnamed Group"}
                          </h5>
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
                                key={member.id || member._id}
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

          <div className="space-y-6">
            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Group Workflow
              </div>
              <h4 className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                What to do here
              </h4>

              <div className="mt-4 space-y-3">
                <GuideRow
                  title="Step 1"
                  text="Create your group with group name and members."
                />
                <GuideRow
                  title="Step 2"
                  text="Once the group is created, move to Project Info."
                />
                <GuideRow
                  title="Step 3"
                  text="Complete title, summary, links, and contact fields there."
                />
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Deadline & Rules
              </div>
              <h4 className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                Group formation guidance
              </h4>

              <div className="mt-4 space-y-3">
                <RuleCard
                  tone="amber"
                  title="Group editing"
                  text="This page is for group formation only. Project details should not be edited here."
                />
                <RuleCard
                  tone="sky"
                  title="Leader responsibility"
                  text="The student who creates the group becomes the group leader automatically."
                />
                <RuleCard
                  tone="violet"
                  title="Next step"
                  text="After group creation, continue from Project Info, then Phases, then Submissions."
                />
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Available Students
              </div>
              <h4 className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                Students not yet grouped
              </h4>

              <div className="mt-4 flex flex-wrap gap-2">
                {availableStudents.length === 0 ? (
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    No unassigned students left.
                  </span>
                ) : (
                  availableStudents.map((student) => (
                    <span
                      key={student.id || student._id}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      {student.name}
                      {student.roll ? ` • ${student.roll}` : ""}
                    </span>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </section>
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
        className="flex h-12 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
      >
        <span className="truncate">
          {selectedMembers.length > 0
            ? `${selectedMembers.length} member${
                selectedMembers.length > 1 ? "s" : ""
              } selected`
            : "Choose members"}
        </span>
        <span className={`transition ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>

      {selectedMembers.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedMembers.map((student) => (
            <button
              key={student.id || student._id}
              type="button"
              onClick={() => onToggle(student)}
              className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300"
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
                const studentId = String(student.id || student._id);
                const checked = selectedMembers.some(
                  (m) => String(m.id || m._id) === studentId
                );

                return (
                  <button
                    key={studentId}
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

function FieldBlock({ label, required, children }) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </div>
      {children}
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

function InfoCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-2 break-words text-sm font-medium text-slate-900 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}

function GuideRow({ title, text }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </div>
      <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
        {text}
      </div>
    </div>
  );
}

function RuleCard({ tone = "amber", title, text }) {
  const toneMap = {
    amber:
      "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10",
    sky:
      "border-sky-200 bg-sky-50 dark:border-sky-500/20 dark:bg-sky-500/10",
    violet:
      "border-violet-200 bg-violet-50 dark:border-violet-500/20 dark:bg-violet-500/10",
  };

  return (
    <div
      className={`rounded-2xl border px-4 py-4 ${
        toneMap[tone] || toneMap.amber
      }`}
    >
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

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${styles}`}>
      {message}
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

function getRoleText(myGroup) {
  if (!myGroup) return "Not Set";

  const leaderId = String(myGroup.leader?.id || myGroup.leader?._id || "");
  const memberIdFromSelf = String(myGroup.myStudentId || "");
  const leaderEmail = String(myGroup.leader?.email || "").toLowerCase();

  if (memberIdFromSelf && leaderId && memberIdFromSelf === leaderId) {
    return "Leader";
  }

  if (myGroup.isLeader === true) {
    return "Leader";
  }

  if (leaderEmail && myGroup.myEmail) {
    return leaderEmail === String(myGroup.myEmail).toLowerCase()
      ? "Leader"
      : "Member";
  }

  return "Member";
}