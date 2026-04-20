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
        if (!editingGroupId) {
            return availableStudents;
        }

        const editingGroup = groups.find(
            (group) => String(group._id || group.id) === String(editingGroupId)
        );

        const currentMemberIds = new Set(
            (editingGroup?.members || []).map((member) => String(member._id || member.id))
        );

        return students.filter((student) => {
            const id = String(student._id || student.id);
            const isAvailable = availableStudents.some(
                (availableStudent) =>
                    String(availableStudent._id || availableStudent.id) === id
            );
            return isAvailable || currentMemberIds.has(id);
        });
    }, [availableStudents, editingGroupId, groups, students]);

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
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
                <div className="h-[620px] animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
                <div className="h-[620px] animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
            <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        {editingGroupId ? "Edit Project Group" : "Create Project Group"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Teacher can create, fix, or reorganize groups manually.
                    </p>
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

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Field label="Group Name" required>
                            <input
                                type="text"
                                value={form.groupName}
                                onChange={(e) =>
                                    setForm((prev) => ({ ...prev, groupName: e.target.value }))
                                }
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                placeholder="Enter group name"
                            />
                        </Field>

                        <Field label="Project Title">
                            <input
                                type="text"
                                value={form.projectTitle}
                                onChange={(e) =>
                                    setForm((prev) => ({ ...prev, projectTitle: e.target.value }))
                                }
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                placeholder="Enter project title"
                            />
                        </Field>

                        <Field label="Leader" required>
                            <select
                                value={form.leaderId}
                                onChange={(e) =>
                                    setForm((prev) => ({ ...prev, leaderId: e.target.value }))
                                }
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                            <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                Members
                            </div>

                            {formSelectableStudents.length === 0 ? (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                                    No available students found.
                                </div>
                            ) : (
                                <CompactMemberSelect
                                    options={formSelectableStudents}
                                    selectedValues={Array.from(
                                        new Set([
                                            ...form.memberIds.map(String),
                                            ...(form.leaderId ? [String(form.leaderId)] : []),
                                        ])
                                    )}
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
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                placeholder="Optional internal note"
                            />
                        </Field>

                        <div className="flex flex-wrap gap-3">
                            <button
                                type="submit"
                                disabled={saving}
                                className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
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

            <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Existing Groups
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Available students update automatically when a group is created or deleted.
                    </p>
                </div>

                <div className="p-6">
                    {groups.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                            No project groups have been created yet.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {groups.map((group) => (
                                <div
                                    key={group._id || group.id}
                                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                                >
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                                    {group.groupName}
                                                </h4>
                                                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                    {group.members?.length || 0} Members
                                                </span>
                                            </div>

                                            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                                {group.projectTitle || "No project title added yet"}
                                            </p>

                                            <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                                                <span className="font-semibold">Leader:</span>{" "}
                                                {group.leader?.name || "-"}{" "}
                                                {group.leader?.roll ? `(${group.leader.roll})` : ""}
                                            </div>

                                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                {group.projectSummary ? (
                                                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300 sm:col-span-2">
                                                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                            Project Summary
                                                        </div>
                                                        {group.projectSummary}
                                                    </div>
                                                ) : null}

                                                {group.contactEmail ? (
                                                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                                                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                            Contact Email
                                                        </div>
                                                        {group.contactEmail}
                                                    </div>
                                                ) : null}

                                                {group.driveLink ? (
                                                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                                                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                            Drive Link
                                                        </div>
                                                        <a
                                                            href={group.driveLink}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="break-all text-violet-600 hover:underline dark:text-violet-300"
                                                        >
                                                            {group.driveLink}
                                                        </a>
                                                    </div>
                                                ) : null}

                                                {group.repositoryLink ? (
                                                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                                                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                            Repository Link
                                                        </div>
                                                        <a
                                                            href={group.repositoryLink}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="break-all text-violet-600 hover:underline dark:text-violet-300"
                                                        >
                                                            {group.repositoryLink}
                                                        </a>
                                                    </div>
                                                ) : null}

                                                {group.note ? (
                                                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300 sm:col-span-2">
                                                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                            Additional Note
                                                        </div>
                                                        {group.note}
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div className="mt-4">
                                                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                    Members
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {(group.members || []).map((member) => (
                                                        <span
                                                            key={member._id || member.id}
                                                            className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                                        >
                                                            {member.name}
                                                            {member.roll ? ` • ${member.roll}` : ""}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2 lg:justify-end">
                                            <button
                                                type="button"
                                                onClick={() => handleEdit(group)}
                                                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(group._id || group.id)}
                                                className="inline-flex items-center justify-center rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-600/20 transition hover:bg-rose-700"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50/60 p-5 dark:border-slate-700 dark:bg-slate-800/40">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Available Students
                        </h4>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            These students are currently not assigned to any group.
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                            {availableStudents.length === 0 ? (
                                <span className="text-sm text-slate-500 dark:text-slate-400">
                                    No unassigned students left.
                                </span>
                            ) : (
                                availableStudents.map((student) => (
                                    <span
                                        key={student._id || student.id}
                                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
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

function CompactMemberSelect({
    options = [],
    selectedValues = [],
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
            {/* <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {label}
            </div> */}

            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className="flex h-11 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
            >
                <span className="truncate">
                    {selectedStudents.length > 0
                        ? `${selectedStudents.length} member${selectedStudents.length > 1 ? "s" : ""
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
                    {selectedStudents.map((student) => (
                        <span
                            key={student._id || student.id}
                            className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
                        >
                            <span className="truncate max-w-[160px]">
                                {student.name}
                                {student.roll ? ` • ${student.roll}` : ""}
                            </span>
                            <button
                                type="button"
                                onClick={() => onToggle(student._id || student.id)}
                                className="rounded-full leading-none text-indigo-700 hover:text-rose-600 dark:text-indigo-300 dark:hover:text-rose-300"
                            >
                                ×
                            </button>
                        </span>
                    ))}
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
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                    </div>

                    <div className="max-h-64 overflow-y-auto p-2">
                        {filteredOptions.length === 0 ? (
                            <div className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                                No students found.
                            </div>
                        ) : (
                            filteredOptions.map((student) => {
                                const id = String(student._id || student.id);
                                const checked = selectedValues.includes(id);

                                return (
                                    <label
                                        key={id}
                                        className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition ${checked
                                            ? "bg-indigo-50 dark:bg-indigo-500/10"
                                            : "hover:bg-slate-50 dark:hover:bg-slate-800"
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => onToggle(id)}
                                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
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