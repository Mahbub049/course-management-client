import { useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import * as XLSX from "xlsx-js-style";
import {
  exportGroupPresentationPdf,
  printGroupPresentationPdf,
} from "../../utils/groupPresentationPdf";

const clean = (value) => String(value ?? "").trim();
const normalizedKey = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normalizeEntryMode = (value, fallback = "group") =>
  String(value || fallback).toLowerCase() === "individual" ? "individual" : "group";

const makeId = () => `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const getBlankValue = (row, field) => row?.blankValues?.[field.id] ?? "";
const getMcqValue = (row, field) => row?.selectedOptions?.[field.id] ?? "";
const getCheckboxValue = (row, field) => Boolean(row?.checkboxValues?.[field.id]);
const fieldMode = (field, settings = {}) =>
  normalizeEntryMode(field?.entryMode, settings.groupMarkMode || "group");
const feedbackMode = (settings = {}) =>
  normalizeEntryMode(settings.feedbackEntryMode, settings.groupMarkMode || "group");

const getEffectiveBlankValue = (group, member, field, settings) =>
  fieldMode(field, settings) === "individual"
    ? getBlankValue(member, field)
    : getBlankValue(group, field);

const getEffectiveMcqValue = (group, member, field, settings) =>
  fieldMode(field, settings) === "individual"
    ? getMcqValue(member, field)
    : getMcqValue(group, field);

const getEffectiveCheckboxValue = (group, member, field, settings) =>
  fieldMode(field, settings) === "individual"
    ? getCheckboxValue(member, field)
    : getCheckboxValue(group, field);

const getEffectiveFeedback = (group, member, settings) =>
  feedbackMode(settings) === "individual" ? member?.feedback || "" : group?.feedback || "";

const calculateEffectiveTotal = (group, member, fields = [], settings = {}) => {
  const raw = fields
    .map((field) => clean(getEffectiveBlankValue(group, member, field, settings)))
    .filter(Boolean);
  if (!raw.length) return { value: "", error: false };
  const nums = raw.map(Number);
  if (nums.some(Number.isNaN)) return { value: "Please input number", error: true };
  const total = nums.reduce((sum, value) => sum + value, 0);
  return {
    value: Number.isInteger(total) ? String(total) : String(Number(total.toFixed(2))),
    error: false,
  };
};

const resolveStudentId = (student) =>
  String(student?.student?._id || student?.student || student?._id || student?.id || "");

const memberKey = (member) => {
  const student = clean(member?.student);
  const roll = clean(member?.roll).toLowerCase();
  const name = clean(member?.name).toLowerCase();
  if (student) return `student:${student}`;
  if (roll) return `roll:${roll}`;
  if (name) return `name:${name}`;
  return "";
};

const normalizeMember = (member, roster = []) => {
  const roll = clean(member?.roll);
  const name = clean(member?.name);
  const studentId = clean(member?.student);
  const rosterMatch = studentId
    ? roster.find((item) => resolveStudentId(item) === studentId)
    : roll
      ? roster.find((item) => clean(item.roll).toLowerCase() === roll.toLowerCase())
      : name
        ? roster.find((item) => clean(item.name).toLowerCase() === name.toLowerCase())
        : null;

  return {
    student: resolveStudentId(rosterMatch) || studentId || null,
    roll: clean(rosterMatch?.roll) || roll,
    name: clean(rosterMatch?.name) || name,
    selectedOptions: { ...(member?.selectedOptions || {}) },
    checkboxValues: { ...(member?.checkboxValues || {}) },
    blankValues: { ...(member?.blankValues || {}) },
    feedback: typeof member?.feedback === "string" ? member.feedback : "",
  };
};

const mergeMember = (existing, incoming, roster = []) => {
  const a = normalizeMember(existing || {}, roster);
  const b = normalizeMember(incoming || {}, roster);
  return {
    ...a,
    ...b,
    student: b.student || a.student || null,
    roll: b.roll || a.roll,
    name: b.name || a.name,
    selectedOptions: { ...(a.selectedOptions || {}), ...(b.selectedOptions || {}) },
    checkboxValues: { ...(a.checkboxValues || {}), ...(b.checkboxValues || {}) },
    blankValues: { ...(a.blankValues || {}), ...(b.blankValues || {}) },
    feedback: b.feedback || a.feedback || "",
  };
};

const dedupeMembers = (members = [], roster = []) => {
  const byKey = new Map();
  (Array.isArray(members) ? members : []).forEach((raw) => {
    const member = normalizeMember(raw, roster);
    const key = memberKey(member);
    if (!key) return;
    byKey.set(key, byKey.has(key) ? mergeMember(byKey.get(key), member, roster) : member);
  });
  return [...byKey.values()];
};

const normalizeUniqueAssignments = (groups = [], roster = []) => {
  const assigned = new Set();
  return (Array.isArray(groups) ? groups : []).map((group, index) => ({
    ...group,
    id: group?.id || makeId(),
    groupName: group?.groupName ?? `Group ${index + 1}`,
    members: dedupeMembers(group?.members || [], roster).filter((member) => {
      const key = memberKey(member);
      if (!key || assigned.has(key)) return false;
      assigned.add(key);
      return true;
    }),
    selectedOptions: { ...(group?.selectedOptions || {}) },
    checkboxValues: { ...(group?.checkboxValues || {}) },
    blankValues: { ...(group?.blankValues || {}) },
    feedback: typeof group?.feedback === "string" ? group.feedback : "",
  }));
};

const aliases = {
  group: new Set(["group", "group name", "team", "team name", "presentation group", "group no", "group number"]),
  memberRoll: new Set(["roll", "roll no", "roll number", "student id", "student id no", "student id number", "student roll", "student roll no", "member id", "member roll", "member roll no", "id", "id no"]),
  memberName: new Set(["name", "student name", "member name", "student"]),
  members: new Set(["members", "group members", "members roll", "members rolls", "member rolls", "member roll numbers", "member ids", "student ids", "student rolls", "student roll numbers", "rolls", "roll numbers", "ids"]),
  memberNames: new Set(["member names", "student names", "names"]),
  feedback: new Set(["feedback", "comment", "comments", "feedback comments", "remarks", "remark"]),
};

const scopeWords = new Set([
  "group",
  "shared",
  "group shared",
  "group wise",
  "individual",
  "per student",
  "student wise",
]);

const stripScopeSuffix = (value) => {
  let key = normalizedKey(value);
  for (const suffix of scopeWords) {
    if (key.endsWith(` ${suffix}`)) {
      key = key.slice(0, -(suffix.length + 1)).trim();
      break;
    }
  }
  return key;
};

const findHeaderRow = (matrix, customKeys) => {
  let best = { index: 0, score: -1 };
  matrix.slice(0, 25).forEach((row, index) => {
    const keys = (Array.isArray(row) ? row : []).map(normalizedKey);
    let score = 0;
    keys.forEach((key) => {
      const stripped = stripScopeSuffix(key);
      if (aliases.group.has(key)) score += 6;
      if (aliases.memberRoll.has(key) || aliases.members.has(key)) score += 3;
      if (aliases.memberName.has(key) || aliases.memberNames.has(key)) score += 2;
      if (aliases.feedback.has(key)) score += 1;
      if (customKeys.has(key) || customKeys.has(stripped)) score += 2;
    });
    if (score > best.score) best = { index, score };
  });
  return best;
};

const indexFor = (headers, set) => headers.findIndex((header) => set.has(header));

const isTruthyExcelValue = (value) => /^(1|y|yes|true|checked|done|present)$/i.test(clean(value));

function Toggle({ checked, label, onChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-violet-600"
      />
      {label}
    </label>
  );
}

function ScopeSelect({ value, onChange, compact = false }) {
  return (
    <select
      value={normalizeEntryMode(value)}
      onChange={(event) => onChange(event.target.value)}
      className={`${compact ? "h-9 text-[11px]" : "h-10 text-xs"} rounded-xl border border-slate-200 bg-white px-2.5 font-black text-slate-700 outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200`}
      title="Choose whether this field is shared by the whole group or entered separately for each student"
    >
      <option value="group">Group-shared</option>
      <option value="individual">Individual</option>
    </select>
  );
}

function ScopeBadge({ mode }) {
  const individual = normalizeEntryMode(mode) === "individual";
  return (
    <span
      className={`ml-1 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-black normal-case tracking-normal ${
        individual
          ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
          : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
      }`}
    >
      {individual ? "Individual" : "Group"}
    </span>
  );
}

function FieldSettings({ title, fields, onAdd, onRemove, onUpdate }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Set the marking scope independently for every column.</div>
        </div>
        <button type="button" onClick={onAdd} className="rounded-xl border border-violet-200 px-3 py-1.5 text-xs font-black text-violet-700 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-300 dark:hover:bg-violet-500/10">+ Add Column</button>
      </div>
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.id || index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
            <input value={field.label || ""} onChange={(event) => onUpdate(field.id, { label: event.target.value })} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
            <ScopeSelect value={field.entryMode} onChange={(entryMode) => onUpdate(field.id, { entryMode })} />
            <button type="button" onClick={() => onRemove(field.id)} disabled={fields.length <= 1} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-black text-red-600 disabled:cursor-not-allowed disabled:opacity-30 dark:border-red-500/30 dark:text-red-300">Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function McqFieldSettings({ fields, onAdd, onRemove, onUpdate }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Category Columns</div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">A category can also be shared by the group or selected separately per student.</div>
        </div>
        <button type="button" onClick={onAdd} className="rounded-xl border border-violet-200 px-3 py-1.5 text-xs font-black text-violet-700 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-300">+ Add Column</button>
      </div>
      <div className="space-y-3">
        {fields.map((field, fieldIndex) => (
          <div key={field.id || fieldIndex} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
              <input value={field.label || ""} onChange={(event) => onUpdate(field.id, { label: event.target.value })} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
              <ScopeSelect value={field.entryMode} onChange={(entryMode) => onUpdate(field.id, { entryMode })} />
              <button type="button" onClick={() => onRemove(field.id)} disabled={fields.length <= 1} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-black text-red-600 disabled:opacity-30 dark:border-red-500/30 dark:text-red-300">Remove</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(field.options || []).map((option, optionIndex) => (
                <div key={`${field.id}-${optionIndex}`} className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-950">
                  <input value={option} onChange={(event) => onUpdate(field.id, { options: (field.options || []).map((item, index) => index === optionIndex ? event.target.value : item) })} className="w-28 bg-transparent px-2 py-1 text-xs outline-none dark:text-white" />
                  <button type="button" disabled={(field.options || []).length <= 1} onClick={() => onUpdate(field.id, { options: (field.options || []).filter((_, index) => index !== optionIndex) })} className="rounded-lg px-2 py-1 text-xs font-black text-red-500 disabled:opacity-25">×</button>
                </div>
              ))}
              <button type="button" onClick={() => onUpdate(field.id, { options: [...(field.options || []), `Option ${(field.options || []).length + 1}`] })} className="rounded-xl border border-violet-200 px-2.5 py-1.5 text-xs font-black text-violet-700 dark:border-violet-500/30 dark:text-violet-300">+ Option</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupInput({ value, onChange, type = "text", placeholder = "Value" }) {
  return (
    <input
      value={value}
      onChange={onChange}
      inputMode={type === "number" ? "decimal" : undefined}
      placeholder={placeholder}
      className="w-full rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-2 text-center outline-none focus:border-sky-400 dark:border-sky-500/30 dark:bg-sky-500/5 dark:text-white"
    />
  );
}

function MemberInput({ value, onChange, type = "text", placeholder = "Value" }) {
  return (
    <input
      value={value}
      onChange={onChange}
      inputMode={type === "number" ? "decimal" : undefined}
      placeholder={placeholder}
      className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-center outline-none focus:border-violet-400 dark:border-violet-500/30 dark:bg-slate-950 dark:text-white"
    />
  );
}

export default function GroupPresentationEditor({ note, onChange, marksSyncPanel = null }) {
  const settings = note?.settings || {};
  const groups = Array.isArray(note?.groupRows) ? note.groupRows : [];
  const roster = Array.isArray(note?.evaluationRows) ? note.evaluationRows : [];
  const allBlankFields = Array.isArray(settings.blankFields) ? settings.blankFields : [];
  const allMcqFields = Array.isArray(settings.mcqFields) ? settings.mcqFields : [];
  const allCheckboxFields = Array.isArray(settings.checkboxFields) ? settings.checkboxFields : [];
  const blankFields = settings.includeBlankFields ? allBlankFields : [];
  const mcqFields = settings.includeMcq ? allMcqFields : [];
  const checkboxFields = settings.includeCheckbox ? allCheckboxFields : [];
  const sharedBlankFields = blankFields.filter((field) => fieldMode(field, settings) === "group");
  const individualBlankFields = blankFields.filter((field) => fieldMode(field, settings) === "individual");
  const sharedMcqFields = mcqFields.filter((field) => fieldMode(field, settings) === "group");
  const individualMcqFields = mcqFields.filter((field) => fieldMode(field, settings) === "individual");
  const sharedCheckboxFields = checkboxFields.filter((field) => fieldMode(field, settings) === "group");
  const individualCheckboxFields = checkboxFields.filter((field) => fieldMode(field, settings) === "individual");
  const isFeedbackIndividual = feedbackMode(settings) === "individual";

  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerGroupId, setPickerGroupId] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const fileRef = useRef(null);

  const updateSettings = (patch) => onChange({ settings: { ...settings, ...patch } });
  const updateField = (kind, fieldId, patch) => {
    const key = kind === "blank" ? "blankFields" : kind === "mcq" ? "mcqFields" : "checkboxFields";
    const fields = Array.isArray(settings[key]) ? settings[key] : [];
    updateSettings({ [key]: fields.map((field) => field.id === fieldId ? { ...field, ...patch } : field) });
  };
  const addField = (kind) => {
    const key = kind === "blank" ? "blankFields" : kind === "mcq" ? "mcqFields" : "checkboxFields";
    const fields = Array.isArray(settings[key]) ? settings[key] : [];
    const index = fields.length + 1;
    const field = kind === "blank"
      ? { id: `blank_${Date.now()}_${index}`, label: index === 1 ? "Presentation Marks" : `Marks ${index}`, entryMode: "group" }
      : kind === "mcq"
        ? { id: `mcq_${Date.now()}_${index}`, label: index === 1 ? "Category" : `Category ${index}`, options: ["High", "Medium", "Low"], entryMode: "group" }
        : { id: `checkbox_${Date.now()}_${index}`, label: index === 1 ? "Completed" : `Checkbox ${index}`, entryMode: "group" };
    updateSettings({ [key]: [...fields, field] });
  };
  const removeField = (kind, fieldId) => {
    const key = kind === "blank" ? "blankFields" : kind === "mcq" ? "mcqFields" : "checkboxFields";
    const fields = Array.isArray(settings[key]) ? settings[key] : [];
    if (fields.length <= 1) return;

    const nextGroups = groups.map((group) => {
      const deleteFromTarget = (target) => {
        const copy = { ...target };
        if (kind === "blank") {
          const values = { ...(copy.blankValues || {}) };
          delete values[fieldId];
          copy.blankValues = values;
        } else if (kind === "mcq") {
          const values = { ...(copy.selectedOptions || {}) };
          delete values[fieldId];
          copy.selectedOptions = values;
        } else {
          const values = { ...(copy.checkboxValues || {}) };
          delete values[fieldId];
          copy.checkboxValues = values;
        }
        return copy;
      };
      const cleanedGroup = deleteFromTarget(group);
      cleanedGroup.members = (group.members || []).map(deleteFromTarget);
      return cleanedGroup;
    });

    onChange({
      settings: { ...settings, [key]: fields.filter((field) => field.id !== fieldId) },
      groupRows: nextGroups,
    });
  };

  const assignedMap = useMemo(() => {
    const map = new Map();
    groups.forEach((group) => {
      (group.members || []).forEach((member) => {
        const key = memberKey(member);
        if (key) map.set(key, group.id);
        const roll = clean(member.roll).toLowerCase();
        if (roll) map.set(`roll:${roll}`, group.id);
      });
    });
    return map;
  }, [groups]);

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return groups.map((group, index) => ({ group, index }));

    return groups
      .map((group, index) => ({ group, index }))
      .filter(({ group }) => {
        const groupValues = [
          group.groupName,
          ...sharedBlankFields.map((field) => getBlankValue(group, field)),
          ...sharedMcqFields.map((field) => getMcqValue(group, field)),
          ...sharedCheckboxFields.map((field) => getCheckboxValue(group, field) ? field.label : ""),
          !isFeedbackIndividual ? group.feedback : "",
        ].join(" ");
        const memberText = (group.members || []).map((member) => [
          member.roll,
          member.name,
          ...individualBlankFields.map((field) => getBlankValue(member, field)),
          ...individualMcqFields.map((field) => getMcqValue(member, field)),
          ...individualCheckboxFields.map((field) => getCheckboxValue(member, field) ? field.label : ""),
          isFeedbackIndividual ? member.feedback : "",
          calculateEffectiveTotal(group, member, blankFields, settings).value,
        ].join(" ")).join(" ");
        return `${groupValues} ${memberText}`.toLowerCase().includes(term);
      });
  }, [
    groups,
    search,
    sharedBlankFields,
    sharedMcqFields,
    sharedCheckboxFields,
    individualBlankFields,
    individualMcqFields,
    individualCheckboxFields,
    blankFields,
    settings,
    isFeedbackIndividual,
  ]);

  const commitGroups = (nextGroups) => onChange({ groupRows: normalizeUniqueAssignments(nextGroups, roster) });
  const updateGroup = (index, patch) => {
    commitGroups(groups.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const updateMember = (groupIndex, memberIndex, patch) => {
    const next = groups.map((group, index) => {
      if (index !== groupIndex) return group;
      return {
        ...group,
        members: (group.members || []).map((member, i) => i === memberIndex ? { ...member, ...patch } : member),
      };
    });
    commitGroups(next);
  };

  const addGroup = () => {
    const nextNumber = groups.length + 1;
    commitGroups([
      ...groups,
      {
        id: makeId(),
        groupName: `Group ${nextNumber}`,
        members: [],
        selectedOptions: {},
        checkboxValues: {},
        blankValues: {},
        feedback: "",
      },
    ]);
  };

  const removeGroup = async (index) => {
    const result = await Swal.fire({
      title: "Remove this group?",
      text: "The group, member assignments, and marks stored under it will be removed from this sheet.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remove",
      confirmButtonColor: "#dc2626",
    });
    if (!result.isConfirmed) return;
    commitGroups(groups.filter((_, i) => i !== index));
  };

  const moveGroup = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= groups.length) return;
    const next = [...groups];
    [next[index], next[target]] = [next[target], next[index]];
    commitGroups(next);
  };

  const updateGroupBlank = (index, field, value) => {
    const row = groups[index] || {};
    updateGroup(index, { blankValues: { ...(row.blankValues || {}), [field.id]: value } });
  };
  const updateGroupMcq = (index, field, value) => {
    const row = groups[index] || {};
    updateGroup(index, { selectedOptions: { ...(row.selectedOptions || {}), [field.id]: value } });
  };
  const updateGroupCheckbox = (index, field, value) => {
    const row = groups[index] || {};
    updateGroup(index, { checkboxValues: { ...(row.checkboxValues || {}), [field.id]: Boolean(value) } });
  };
  const updateMemberBlank = (groupIndex, memberIndex, field, value) => {
    const member = groups[groupIndex]?.members?.[memberIndex] || {};
    updateMember(groupIndex, memberIndex, { blankValues: { ...(member.blankValues || {}), [field.id]: value } });
  };
  const updateMemberMcq = (groupIndex, memberIndex, field, value) => {
    const member = groups[groupIndex]?.members?.[memberIndex] || {};
    updateMember(groupIndex, memberIndex, { selectedOptions: { ...(member.selectedOptions || {}), [field.id]: value } });
  };
  const updateMemberCheckbox = (groupIndex, memberIndex, field, value) => {
    const member = groups[groupIndex]?.members?.[memberIndex] || {};
    updateMember(groupIndex, memberIndex, { checkboxValues: { ...(member.checkboxValues || {}), [field.id]: Boolean(value) } });
  };

  const toggleMember = (groupId, rosterRow) => {
    const rosterMember = normalizeMember(
      { student: resolveStudentId(rosterRow), roll: rosterRow.roll, name: rosterRow.name },
      roster
    );
    const key = memberKey(rosterMember);
    if (!key) return;

    let previousMember = null;
    groups.forEach((group) => {
      const found = (group.members || []).find((member) =>
        memberKey(member) === key ||
        (clean(rosterMember.roll) && clean(member.roll).toLowerCase() === clean(rosterMember.roll).toLowerCase())
      );
      if (found) previousMember = found;
    });
    const memberToUse = previousMember ? mergeMember(previousMember, rosterMember, roster) : rosterMember;

    const currentOwner = assignedMap.get(key) || assignedMap.get(`roll:${clean(rosterMember.roll).toLowerCase()}`);
    const isCurrent = currentOwner === groupId;

    const next = groups.map((group) => {
      const withoutMember = (group.members || []).filter((member) => {
        const sameKey = memberKey(member) === key;
        const sameRoll = clean(rosterMember.roll) && clean(member.roll).toLowerCase() === clean(rosterMember.roll).toLowerCase();
        return !sameKey && !sameRoll;
      });
      if (group.id === groupId && !isCurrent) return { ...group, members: [...withoutMember, memberToUse] };
      if (withoutMember.length !== (group.members || []).length) return { ...group, members: withoutMember };
      return group;
    });
    commitGroups(next);
  };

  const exportFieldHeader = (field) =>
    `${clean(field.label) || "Field"} (${fieldMode(field, settings) === "individual" ? "Individual" : "Group"})`;

  const makeExcelRows = () => {
    const header = [
      "Group Name",
      "Roll",
      "Student Name",
      ...blankFields.map(exportFieldHeader),
      ...mcqFields.map(exportFieldHeader),
      ...checkboxFields.map(exportFieldHeader),
      ...(settings.includeTotal ? ["Total"] : []),
      ...(settings.includeFeedback ? [`Feedback / Comments (${isFeedbackIndividual ? "Individual" : "Group"})`] : []),
    ];

    const body = groups.flatMap((group, groupIndex) => {
      const members = Array.isArray(group.members) && group.members.length ? group.members : [null];
      return members.map((member) => [
        clean(group.groupName) || `Group ${groupIndex + 1}`,
        member ? clean(member.roll) : "",
        member ? clean(member.name) : "",
        ...blankFields.map((field) => clean(getEffectiveBlankValue(group, member, field, settings))),
        ...mcqFields.map((field) => clean(getEffectiveMcqValue(group, member, field, settings))),
        ...checkboxFields.map((field) => getEffectiveCheckboxValue(group, member, field, settings) ? "Yes" : "No"),
        ...(settings.includeTotal ? [calculateEffectiveTotal(group, member, blankFields, settings).value] : []),
        ...(settings.includeFeedback ? [clean(getEffectiveFeedback(group, member, settings))] : []),
      ]);
    });

    return { header, body };
  };

  const exportExcel = () => {
    const { header, body } = makeExcelRows();
    const ws = XLSX.utils.aoa_to_sheet([
      [note.title || "Group Presentation Evaluation Sheet"],
      [[note?.course?.code, note?.course?.title, note?.course?.section ? `Section ${note.course.section}` : ""].filter(Boolean).join(" - ")],
      ["Field scope: (Group) = one shared value for all members; (Individual) = separate value for each student"],
      [],
      header,
      ...body,
    ]);

    if (ws.A1) ws.A1.s = { font: { bold: true, sz: 14 }, alignment: { vertical: "center" } };
    header.forEach((_, col) => {
      const address = XLSX.utils.encode_cell({ r: 4, c: col });
      if (!ws[address]) return;
      ws[address].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "1E293B" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "CBD5E1" } },
          bottom: { style: "thin", color: { rgb: "CBD5E1" } },
          left: { style: "thin", color: { rgb: "CBD5E1" } },
          right: { style: "thin", color: { rgb: "CBD5E1" } },
        },
      };
    });
    body.forEach((_, r) => {
      header.forEach((__, c) => {
        const address = XLSX.utils.encode_cell({ r: r + 5, c });
        if (!ws[address]) return;
        ws[address].s = {
          fill: { fgColor: { rgb: r % 2 === 0 ? "F8FAFC" : "FFFFFF" } },
          alignment: { vertical: "top", wrapText: true },
          border: {
            top: { style: "thin", color: { rgb: "E2E8F0" } },
            bottom: { style: "thin", color: { rgb: "E2E8F0" } },
            left: { style: "thin", color: { rgb: "E2E8F0" } },
            right: { style: "thin", color: { rgb: "E2E8F0" } },
          },
        };
      });
    });
    ws["!cols"] = header.map((_, index) => ({ wch: index === 0 ? 20 : index <= 2 ? 25 : 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Presentation Marks");
    const code = clean(note?.course?.code) || "Course";
    XLSX.writeFile(wb, `${code}_Group_Presentation_Mixed_Marks.xlsx`);
  };

  const parseMemberDescriptor = (rawValue) => {
    const text = clean(rawValue);
    if (!text) return null;

    const textLower = text.toLowerCase();
    const rosterMatches = roster
      .map((item) => ({ item, roll: clean(item.roll) }))
      .filter(({ roll }) => roll && textLower.includes(roll.toLowerCase()))
      .sort((a, b) => b.roll.length - a.roll.length);
    if (rosterMatches.length) {
      const { item, roll } = rosterMatches[0];
      return { student: resolveStudentId(item), roll, name: clean(item.name) };
    }

    const rollMatch = text.match(/\b[0-9]{5,}\b/);
    if (rollMatch) {
      const roll = rollMatch[0];
      const name = clean(text.replace(roll, "").replace(/^[\s\-–—:|,;/()]+|[\s\-–—:|,;/()]+$/g, ""));
      return { roll, name };
    }

    const nameMatch = roster.find((item) => clean(item.name).toLowerCase() === textLower);
    if (nameMatch) return { student: resolveStudentId(nameMatch), roll: clean(nameMatch.roll), name: clean(nameMatch.name) };
    return { roll: "", name: text };
  };

  const parseMemberCell = (value) => {
    const text = clean(value);
    if (!text) return [];

    const rosterRollsFound = roster
      .map((item) => clean(item.roll))
      .filter(Boolean)
      .filter((roll) => text.toLowerCase().includes(roll.toLowerCase()));
    if (rosterRollsFound.length > 1) {
      return [...new Set(rosterRollsFound)].map((roll) => parseMemberDescriptor(roll)).filter(Boolean);
    }

    const delimited = text.split(/[\n,;|]+/).map(clean).filter(Boolean);
    if (delimited.length > 1) return delimited.map(parseMemberDescriptor).filter(Boolean);

    const numericIds = text.match(/\b[0-9]{5,}\b/g) || [];
    if (numericIds.length > 1) return [...new Set(numericIds)].map(parseMemberDescriptor).filter(Boolean);

    const single = parseMemberDescriptor(text);
    return single ? [single] : [];
  };

  const importExcel = async (file) => {
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("No worksheet was found in this file.");
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: "",
        raw: false,
      });
      if (!matrix.length) throw new Error("The worksheet is empty.");

      const customFields = [
        ...blankFields.map((field) => ({ ...field, kind: "blank" })),
        ...mcqFields.map((field) => ({ ...field, kind: "mcq" })),
        ...checkboxFields.map((field) => ({ ...field, kind: "checkbox" })),
      ];
      const customByKey = new Map();
      customFields.forEach((field) => {
        const key = normalizedKey(field.label);
        if (key) customByKey.set(key, field);
      });
      const { index: headerIndex, score } = findHeaderRow(matrix, new Set(customByKey.keys()));
      if (score < 5) throw new Error("Could not detect the group/member header row in this Excel sheet.");

      const headers = (matrix[headerIndex] || []).map(normalizedKey);
      const groupCol = indexFor(headers, aliases.group);
      const rollCol = indexFor(headers, aliases.memberRoll);
      const nameCol = indexFor(headers, aliases.memberName);
      const membersCol = indexFor(headers, aliases.members);
      const memberNamesCol = indexFor(headers, aliases.memberNames);
      const feedbackCol = headers.findIndex((header) => aliases.feedback.has(stripScopeSuffix(header)));
      if (groupCol < 0) throw new Error("Group Name column is required.");

      const customCols = headers
        .map((key, col) => ({ key, col, field: customByKey.get(key) || customByKey.get(stripScopeSuffix(key)) }))
        .filter((item) => item.field);

      const indexedMemberCols = headers
        .map((key, col) => {
          if (key.includes("name")) return null;
          const patterns = [
            /^(?:member|student)\s*(\d+)$/,
            /^(?:member|student)\s*(\d+)\s*(?:roll|id)$/,
            /^(?:member|student)\s*(?:roll|id)\s*(\d+)$/,
            /^(?:roll|id)\s*(\d+)$/,
          ];
          const match = patterns.map((pattern) => key.match(pattern)).find(Boolean);
          return match ? { col, index: Number(match[1]) } : null;
        })
        .filter(Boolean);
      const indexedNameCols = new Map(
        headers
          .map((key, col) => {
            const patterns = [
              /^(?:member|student)\s*(\d+)\s*name$/,
              /^(?:member|student)\s*name\s*(\d+)$/,
              /^name\s*(\d+)$/,
            ];
            const match = patterns.map((pattern) => key.match(pattern)).find(Boolean);
            return match ? [Number(match[1]), col] : null;
          })
          .filter(Boolean)
      );

      const hasCustomData = (row) => customCols.some(({ col }) => clean(row[col]));
      const importedMap = new Map();
      let currentGroupName = "";
      let detectedMemberRows = 0;
      let matchedRosterMembers = 0;
      const unmatchedLabels = new Set();

      const applyFieldValue = (target, field, kind, value) => {
        const next = {
          ...target,
          blankValues: { ...(target?.blankValues || {}) },
          selectedOptions: { ...(target?.selectedOptions || {}) },
          checkboxValues: { ...(target?.checkboxValues || {}) },
        };
        if (kind === "blank") next.blankValues[field.id] = value;
        if (kind === "mcq") next.selectedOptions[field.id] = value;
        if (kind === "checkbox") next.checkboxValues[field.id] = isTruthyExcelValue(value);
        return next;
      };

      matrix.slice(headerIndex + 1).forEach((row) => {
        if (!Array.isArray(row)) return;

        const candidateMembers = [];
        if (rollCol >= 0 && clean(row[rollCol])) {
          const rollCandidate = parseMemberDescriptor(row[rollCol]) || { roll: clean(row[rollCol]), name: "" };
          if (nameCol >= 0 && clean(row[nameCol]) && !rollCandidate.name) rollCandidate.name = clean(row[nameCol]);
          candidateMembers.push(rollCandidate);
        } else if (nameCol >= 0 && clean(row[nameCol])) {
          candidateMembers.push(parseMemberDescriptor(row[nameCol]) || { roll: "", name: clean(row[nameCol]) });
        }

        if (membersCol >= 0 && clean(row[membersCol])) {
          const parsed = parseMemberCell(row[membersCol]);
          const names = memberNamesCol >= 0 ? clean(row[memberNamesCol]).split(/[\n,;|]+/).map(clean).filter(Boolean) : [];
          parsed.forEach((candidate, index) => {
            if (!candidate.name && names[index]) candidate.name = names[index];
            candidateMembers.push(candidate);
          });
        } else if (memberNamesCol >= 0 && clean(row[memberNamesCol])) {
          clean(row[memberNamesCol]).split(/[\n,;|]+/).map(clean).filter(Boolean).forEach((name) => {
            candidateMembers.push(parseMemberDescriptor(name) || { roll: "", name });
          });
        }

        indexedMemberCols.forEach(({ col, index: memberIndex }) => {
          const value = clean(row[col]);
          const nameColumn = indexedNameCols.get(memberIndex);
          const name = nameColumn === undefined ? "" : clean(row[nameColumn]);
          if (!value && !name) return;
          const candidate = parseMemberDescriptor(value || name) || { roll: value, name };
          if (!candidate.name && name) candidate.name = name;
          candidateMembers.push(candidate);
        });

        const explicitGroupName = clean(row[groupCol]);
        const rowHasRecognizedData = candidateMembers.length > 0 || hasCustomData(row) || (feedbackCol >= 0 && clean(row[feedbackCol]));
        if (explicitGroupName) currentGroupName = explicitGroupName;
        const groupName = explicitGroupName || (rowHasRecognizedData ? currentGroupName : "");
        if (!groupName) return;

        const mapKey = groupName.toLowerCase();
        let group = importedMap.get(mapKey);
        if (!group) {
          group = {
            id: makeId(),
            groupName,
            members: [],
            selectedOptions: {},
            checkboxValues: {},
            blankValues: {},
            feedback: "",
          };
          importedMap.set(mapKey, group);
        }

        // Shared fields are written once to the group. If repeated on every student row,
        // the latest non-empty cell simply keeps the same shared value.
        customCols.forEach(({ col, field }) => {
          const value = clean(row[col]);
          if (!value || fieldMode(field, settings) !== "group") return;
          group = applyFieldValue(group, field, field.kind, value);
          importedMap.set(mapKey, group);
        });
        if (feedbackCol >= 0 && clean(row[feedbackCol]) && !isFeedbackIndividual) {
          group.feedback = clean(row[feedbackCol]);
        }

        const uniqueCandidates = dedupeMembers(candidateMembers, roster);
        if (uniqueCandidates.length) detectedMemberRows += uniqueCandidates.length;
        uniqueCandidates.forEach((candidate) => {
          let incoming = normalizeMember(candidate, roster);
          if (incoming.student || (incoming.roll && roster.some((r) => clean(r.roll).toLowerCase() === incoming.roll.toLowerCase()))) {
            matchedRosterMembers += 1;
          } else if (incoming.roll || incoming.name) {
            unmatchedLabels.add(incoming.roll || incoming.name);
          }

          customCols.forEach(({ col, field }) => {
            const value = clean(row[col]);
            if (!value || fieldMode(field, settings) !== "individual") return;
            incoming = applyFieldValue(incoming, field, field.kind, value);
          });
          if (feedbackCol >= 0 && clean(row[feedbackCol]) && isFeedbackIndividual) {
            incoming.feedback = clean(row[feedbackCol]);
          }

          const key = memberKey(incoming);
          if (!key) return;
          const existingIndex = (group.members || []).findIndex((member) => memberKey(member) === key);
          if (existingIndex >= 0) group.members[existingIndex] = mergeMember(group.members[existingIndex], incoming, roster);
          else group.members.push(incoming);
        });

        group.members = dedupeMembers(group.members, roster);
        importedMap.set(mapKey, group);
      });

      const imported = [...importedMap.values()];
      if (!imported.length) throw new Error("No group data was found below the detected header row.");

      const decision = groups.length
        ? await Swal.fire({
            title: `Import ${imported.length} group${imported.length === 1 ? "" : "s"}?`,
            text: "Group names are matched case-insensitively. Roll/member rows under merged or blank group cells are automatically carried into the correct group.",
            icon: "question",
            showDenyButton: true,
            showCancelButton: true,
            confirmButtonText: "Replace",
            denyButtonText: "Merge",
          })
        : { isConfirmed: true };
      if (!decision.isConfirmed && !decision.isDenied) return;

      if (decision.isDenied) {
        const merged = [...groups];
        imported.forEach((incoming) => {
          const existingIndex = merged.findIndex((item) => clean(item.groupName).toLowerCase() === clean(incoming.groupName).toLowerCase());
          if (existingIndex < 0) {
            merged.push(incoming);
            return;
          }
          const existing = merged[existingIndex];
          const memberMap = new Map();
          [...(existing.members || []), ...(incoming.members || [])].forEach((member) => {
            const normalized = normalizeMember(member, roster);
            const key = memberKey(normalized);
            if (!key) return;
            memberMap.set(key, memberMap.has(key) ? mergeMember(memberMap.get(key), normalized, roster) : normalized);
          });
          merged[existingIndex] = {
            ...existing,
            ...incoming,
            id: existing.id || incoming.id,
            members: [...memberMap.values()],
            blankValues: { ...(existing.blankValues || {}), ...(incoming.blankValues || {}) },
            selectedOptions: { ...(existing.selectedOptions || {}), ...(incoming.selectedOptions || {}) },
            checkboxValues: { ...(existing.checkboxValues || {}), ...(incoming.checkboxValues || {}) },
            feedback: incoming.feedback || existing.feedback || "",
          };
        });
        commitGroups(merged);
      } else {
        commitGroups(imported);
      }

      const unmatchedText = unmatchedLabels.size
        ? ` ${unmatchedLabels.size} member value${unmatchedLabels.size === 1 ? "" : "s"} could not be matched to the enrolled roster and were kept using the Excel text.`
        : "";
      Swal.fire({
        icon: "success",
        title: "Excel imported",
        text: `${imported.length} group${imported.length === 1 ? "" : "s"} and ${detectedMemberRows} member entr${detectedMemberRows === 1 ? "y" : "ies"} detected. ${matchedRosterMembers} matched directly to the enrolled roster.${unmatchedText}`,
        timer: 3200,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Could not import Excel",
        text: error?.message || "Please check the Excel structure and try again.",
      });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const pickerGroupIndex = groups.findIndex((group) => group.id === pickerGroupId);
  const pickerGroup = pickerGroupIndex >= 0 ? groups[pickerGroupIndex] : null;
  const memberPool = roster.filter((student) => {
    const term = memberSearch.trim().toLowerCase();
    if (!term) return true;
    return `${student.roll || ""} ${student.name || ""}`.toLowerCase().includes(term);
  });

  const renderGroupControl = (group, index, mobile = false) => (
    <div className="space-y-2">
      <input
        value={group.groupName || ""}
        onChange={(event) => updateGroup(index, { groupName: event.target.value })}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-bold outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{(group.members || []).length} member{(group.members || []).length === 1 ? "" : "s"}</div>
        <button type="button" onClick={() => { setPickerGroupId(group.id); setMemberSearch(""); }} className="rounded-xl border border-violet-200 px-2.5 py-1.5 text-xs font-black text-violet-700 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-300 dark:hover:bg-violet-500/10">Manage Members</button>
      </div>
      <div className={`flex gap-1.5 ${mobile ? "pt-1" : ""}`}>
        <button type="button" onClick={() => moveGroup(index, -1)} disabled={index === 0} className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-600 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300">↑</button>
        <button type="button" onClick={() => moveGroup(index, 1)} disabled={index === groups.length - 1} className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-600 disabled:opacity-30 dark:border-slate-700 dark:text-slate-300">↓</button>
        <button type="button" onClick={() => removeGroup(index)} className="rounded-xl border border-red-200 px-2.5 py-1.5 text-xs font-black text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10">Remove</button>
      </div>
    </div>
  );

  const renderSharedFieldControl = (group, index, field, kind) => {
    if (kind === "blank") {
      return <GroupInput value={getBlankValue(group, field)} onChange={(event) => updateGroupBlank(index, field, event.target.value)} type="number" />;
    }
    if (kind === "mcq") {
      return (
        <select value={getMcqValue(group, field)} onChange={(event) => updateGroupMcq(index, field, event.target.value)} className="w-full rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-2 outline-none focus:border-sky-400 dark:border-sky-500/30 dark:bg-sky-500/5 dark:text-white">
          <option value="">Select</option>
          {(field.options || []).map((option, optionIndex) => <option key={`${field.id}-${optionIndex}`} value={option}>{option || `Option ${optionIndex + 1}`}</option>)}
        </select>
      );
    }
    return <input type="checkbox" checked={getCheckboxValue(group, field)} onChange={(event) => updateGroupCheckbox(index, field, event.target.checked)} className="h-5 w-5 accent-sky-600" />;
  };

  const renderIndividualFieldControl = (groupIndex, memberIndex, member, field, kind) => {
    if (!member) return <span className="text-xs text-slate-400">Add member</span>;
    if (kind === "blank") {
      return <MemberInput value={getBlankValue(member, field)} onChange={(event) => updateMemberBlank(groupIndex, memberIndex, field, event.target.value)} type="number" />;
    }
    if (kind === "mcq") {
      return (
        <select value={getMcqValue(member, field)} onChange={(event) => updateMemberMcq(groupIndex, memberIndex, field, event.target.value)} className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 outline-none focus:border-violet-400 dark:border-violet-500/30 dark:bg-slate-950 dark:text-white">
          <option value="">Select</option>
          {(field.options || []).map((option, optionIndex) => <option key={`${field.id}-${optionIndex}`} value={option}>{option || `Option ${optionIndex + 1}`}</option>)}
        </select>
      );
    }
    return <input type="checkbox" checked={getCheckboxValue(member, field)} onChange={(event) => updateMemberCheckbox(groupIndex, memberIndex, field, event.target.checked)} className="h-5 w-5 accent-violet-600" />;
  };

  const scopeCounts = {
    group: [...blankFields, ...mcqFields, ...checkboxFields].filter((field) => fieldMode(field, settings) === "group").length + (settings.includeFeedback && !isFeedbackIndividual ? 1 : 0),
    individual: [...blankFields, ...mcqFields, ...checkboxFields].filter((field) => fieldMode(field, settings) === "individual").length + (settings.includeFeedback && isFeedbackIndividual ? 1 : 0),
  };

  return (
    <div className="space-y-4 p-3 sm:p-5">
      <div className="rounded-3xl border border-violet-200 bg-violet-50/70 p-3 dark:border-violet-500/20 dark:bg-violet-500/5 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-black text-slate-950 dark:text-white">Group Presentation Evaluation</div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">
              Keep group membership fixed while mixing shared group marks and individual student marks in the same sheet.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:justify-end">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm" className="hidden" onChange={(event) => importExcel(event.target.files?.[0])} />
            <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-black text-sky-700 hover:bg-sky-50 dark:border-sky-500/30 dark:bg-slate-950 dark:text-sky-300">Import Excel</button>
            <button type="button" onClick={exportExcel} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-300">Export Excel</button>
            <button type="button" onClick={() => exportGroupPresentationPdf({ note })} className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-950 dark:text-rose-300">Download PDF</button>
            <button type="button" onClick={() => printGroupPresentationPdf({ note })} className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-50 dark:border-violet-500/30 dark:bg-slate-950 dark:text-violet-300">Print</button>
            <button type="button" onClick={addGroup} className="col-span-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white hover:bg-violet-700 sm:col-span-1">+ Add Group</button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60">
        <button type="button" onClick={() => setSettingsOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 p-3 text-left sm:p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-black text-slate-950 dark:text-white">Tools & Sheet Settings</div>
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">{scopeCounts.group} group-shared</span>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">{scopeCounts.individual} individual</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Field setup and Marks Sync stay hidden here so the marksheet remains near the top of the page.</p>
          </div>
          <span className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">{settingsOpen ? "Hide" : "Show"}</span>
        </button>
        {settingsOpen && (
          <div className="space-y-4 border-t border-slate-200 p-3 dark:border-slate-800 sm:p-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Toggle checked={Boolean(settings.includeBlankFields)} label="Marks / Text" onChange={(value) => updateSettings({ includeBlankFields: value })} />
              <Toggle checked={Boolean(settings.includeMcq)} label="Category" onChange={(value) => updateSettings({ includeMcq: value })} />
              <Toggle checked={Boolean(settings.includeCheckbox)} label="Checkbox" onChange={(value) => updateSettings({ includeCheckbox: value })} />
              <Toggle checked={Boolean(settings.includeFeedback)} label="Feedback" onChange={(value) => updateSettings({ includeFeedback: value })} />
              <Toggle checked={Boolean(settings.includeTotal)} label="Total" onChange={(value) => updateSettings({ includeTotal: value })} />
            </div>

            {settings.includeBlankFields && (
              <FieldSettings title="Marks / Text Columns" fields={allBlankFields} onAdd={() => addField("blank")} onRemove={(id) => removeField("blank", id)} onUpdate={(id, patch) => updateField("blank", id, patch)} />
            )}
            {settings.includeMcq && (
              <McqFieldSettings fields={allMcqFields} onAdd={() => addField("mcq")} onRemove={(id) => removeField("mcq", id)} onUpdate={(id, patch) => updateField("mcq", id, patch)} />
            )}
            {settings.includeCheckbox && (
              <FieldSettings title="Checkbox Columns" fields={allCheckboxFields} onAdd={() => addField("checkbox")} onRemove={(id) => removeField("checkbox", id)} onUpdate={(id, patch) => updateField("checkbox", id, patch)} />
            )}
            {settings.includeFeedback && (
              <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center">
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Feedback / Comments</div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Choose one comment per group or separate comments for every member.</div>
                  </div>
                  <ScopeSelect value={settings.feedbackEntryMode} onChange={(entryMode) => updateSettings({ feedbackEntryMode: entryMode })} />
                </div>
              </div>
            )}

            {marksSyncPanel}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-3xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search group, member, roll, marks or feedback..." className="w-full flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-violet-400 dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
        <div className="shrink-0 text-xs font-bold text-slate-500 dark:text-slate-400">{filteredGroups.length}/{groups.length} groups · {roster.length} students</div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/60 sm:p-10">
          <div className="text-base font-black text-slate-900 dark:text-white">No presentation group yet</div>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">Add groups manually or import Excel. Group names in merged cells and member rows underneath are supported.</p>
          <button type="button" onClick={addGroup} className="mt-5 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-black text-white hover:bg-violet-700">Create First Group</button>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-900/80">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="min-w-52 px-4 py-3 font-black">Group</th>
                    <th className="min-w-36 px-4 py-3 font-black">Roll</th>
                    <th className="min-w-56 px-4 py-3 font-black">Student Name</th>
                    {blankFields.map((field, index) => <th key={field.id} className="min-w-40 px-4 py-3 text-center font-black">{clean(field.label) || `Marks ${index + 1}`}<ScopeBadge mode={fieldMode(field, settings)} /></th>)}
                    {mcqFields.map((field, index) => <th key={field.id} className="min-w-44 px-4 py-3 text-center font-black">{clean(field.label) || `Category ${index + 1}`}<ScopeBadge mode={fieldMode(field, settings)} /></th>)}
                    {checkboxFields.map((field, index) => <th key={field.id} className="min-w-32 px-4 py-3 text-center font-black">{clean(field.label) || `Check ${index + 1}`}<ScopeBadge mode={fieldMode(field, settings)} /></th>)}
                    {settings.includeTotal && <th className="min-w-28 px-4 py-3 text-center font-black">Total</th>}
                    {settings.includeFeedback && <th className="min-w-[260px] px-4 py-3 font-black">Feedback<ScopeBadge mode={feedbackMode(settings)} /></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredGroups.flatMap(({ group, index }) => {
                    const members = Array.isArray(group.members) && group.members.length ? group.members : [null];
                    return members.map((member, memberIndex) => {
                      const total = calculateEffectiveTotal(group, member, blankFields, settings);
                      return (
                        <tr key={`${group.id || index}-${member ? memberKey(member) || memberIndex : "empty"}`} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-900/50">
                          {memberIndex === 0 && <td rowSpan={members.length} className="border-r border-slate-200 px-4 py-3 align-top dark:border-slate-800">{renderGroupControl(group, index)}</td>}
                          {member ? (
                            <>
                              <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100">{member.roll || "-"}</td>
                              <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{member.name || "-"}</td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-xs text-slate-400">No member</td>
                              <td className="px-4 py-3 text-xs text-slate-400">Use Manage Members</td>
                            </>
                          )}

                          {blankFields.map((field) => fieldMode(field, settings) === "group"
                            ? memberIndex === 0 && <td key={field.id} rowSpan={members.length} className="bg-sky-50/30 px-4 py-3 align-middle dark:bg-sky-500/[0.03]">{renderSharedFieldControl(group, index, field, "blank")}</td>
                            : <td key={field.id} className="px-4 py-3">{renderIndividualFieldControl(index, memberIndex, member, field, "blank")}</td>
                          )}
                          {mcqFields.map((field) => fieldMode(field, settings) === "group"
                            ? memberIndex === 0 && <td key={field.id} rowSpan={members.length} className="bg-sky-50/30 px-4 py-3 align-middle dark:bg-sky-500/[0.03]">{renderSharedFieldControl(group, index, field, "mcq")}</td>
                            : <td key={field.id} className="px-4 py-3">{renderIndividualFieldControl(index, memberIndex, member, field, "mcq")}</td>
                          )}
                          {checkboxFields.map((field) => fieldMode(field, settings) === "group"
                            ? memberIndex === 0 && <td key={field.id} rowSpan={members.length} className="bg-sky-50/30 px-4 py-3 text-center align-middle dark:bg-sky-500/[0.03]">{renderSharedFieldControl(group, index, field, "checkbox")}</td>
                            : <td key={field.id} className="px-4 py-3 text-center">{renderIndividualFieldControl(index, memberIndex, member, field, "checkbox")}</td>
                          )}
                          {settings.includeTotal && <td className="px-4 py-3 text-center"><span className={`inline-flex min-w-20 justify-center rounded-xl border px-3 py-2 font-black ${total.error ? "border-red-200 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300" : "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"}`}>{total.value || "-"}</span></td>}
                          {settings.includeFeedback && (isFeedbackIndividual
                            ? <td className="px-4 py-3">{member ? <textarea value={member.feedback || ""} onChange={(event) => updateMember(index, memberIndex, { feedback: event.target.value })} rows={2} placeholder="Individual feedback..." className="min-h-12 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 outline-none focus:border-violet-400 dark:border-violet-500/30 dark:bg-slate-950 dark:text-white" /> : <span className="text-xs text-slate-400">Add member</span>}</td>
                            : memberIndex === 0 && <td rowSpan={members.length} className="bg-sky-50/30 px-4 py-3 align-middle dark:bg-sky-500/[0.03]"><textarea value={group.feedback || ""} onChange={(event) => updateGroup(index, { feedback: event.target.value })} rows={3} placeholder="Group feedback..." className="min-h-16 w-full rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-2 outline-none focus:border-sky-400 dark:border-sky-500/30 dark:bg-sky-500/5 dark:text-white" /></td>
                          )}
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {filteredGroups.map(({ group, index }) => {
              const members = Array.isArray(group.members) ? group.members : [];
              return (
                <div key={group.id || index} className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                  <div className="border-b border-slate-200 p-3 dark:border-slate-800">{renderGroupControl(group, index, true)}</div>

                  {(sharedBlankFields.length || sharedMcqFields.length || sharedCheckboxFields.length || (settings.includeFeedback && !isFeedbackIndividual)) ? (
                    <div className="space-y-3 border-b border-slate-200 bg-sky-50/30 p-3 dark:border-slate-800 dark:bg-sky-500/[0.03]">
                      <div className="text-[10px] font-black uppercase tracking-wide text-sky-700 dark:text-sky-300">Shared by whole group</div>
                      {sharedBlankFields.map((field) => <div key={field.id}><div className="mb-1.5 text-xs font-black text-slate-600 dark:text-slate-300">{field.label}</div>{renderSharedFieldControl(group, index, field, "blank")}</div>)}
                      {sharedMcqFields.map((field) => <div key={field.id}><div className="mb-1.5 text-xs font-black text-slate-600 dark:text-slate-300">{field.label}</div>{renderSharedFieldControl(group, index, field, "mcq")}</div>)}
                      {sharedCheckboxFields.map((field) => <label key={field.id} className="flex items-center justify-between rounded-xl border border-sky-200 bg-white/60 px-3 py-2 text-xs font-black text-slate-600 dark:border-sky-500/30 dark:bg-slate-950/40 dark:text-slate-300"><span>{field.label}</span>{renderSharedFieldControl(group, index, field, "checkbox")}</label>)}
                      {settings.includeFeedback && !isFeedbackIndividual && <div><div className="mb-1.5 text-xs font-black text-slate-600 dark:text-slate-300">Feedback / Comments</div><textarea value={group.feedback || ""} onChange={(event) => updateGroup(index, { feedback: event.target.value })} rows={2} placeholder="Group feedback..." className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 dark:border-sky-500/30 dark:bg-slate-950 dark:text-white" /></div>}
                    </div>
                  ) : null}

                  <div className="space-y-2 p-3">
                    <div className="text-[10px] font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">Members</div>
                    {members.length === 0 ? (
                      <button type="button" onClick={() => { setPickerGroupId(group.id); setMemberSearch(""); }} className="w-full rounded-2xl border border-dashed border-violet-300 bg-violet-50/40 p-5 text-center text-xs font-black text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/5 dark:text-violet-300">Add group members</button>
                    ) : members.map((member, memberIndex) => {
                      const total = calculateEffectiveTotal(group, member, blankFields, settings);
                      return (
                        <div key={`${memberKey(member)}-${memberIndex}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0"><div className="font-black text-slate-900 dark:text-white">{member.roll || "No roll"}</div><div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{member.name || "No name"}</div></div>
                            {settings.includeTotal && <span className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-xs font-black ${total.error ? "border-red-200 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300" : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"}`}>Total: {total.value || "-"}</span>}
                          </div>
                          {(individualBlankFields.length || individualMcqFields.length || individualCheckboxFields.length || (settings.includeFeedback && isFeedbackIndividual)) && (
                            <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                              {individualBlankFields.map((field) => <div key={field.id}><div className="mb-1.5 text-xs font-black text-slate-600 dark:text-slate-300">{field.label}</div>{renderIndividualFieldControl(index, memberIndex, member, field, "blank")}</div>)}
                              {individualMcqFields.map((field) => <div key={field.id}><div className="mb-1.5 text-xs font-black text-slate-600 dark:text-slate-300">{field.label}</div>{renderIndividualFieldControl(index, memberIndex, member, field, "mcq")}</div>)}
                              {individualCheckboxFields.map((field) => <label key={field.id} className="flex items-center justify-between rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-slate-600 dark:border-violet-500/30 dark:bg-slate-950 dark:text-slate-300"><span>{field.label}</span>{renderIndividualFieldControl(index, memberIndex, member, field, "checkbox")}</label>)}
                              {settings.includeFeedback && isFeedbackIndividual && <div><div className="mb-1.5 text-xs font-black text-slate-600 dark:text-slate-300">Feedback / Comments</div><textarea value={member.feedback || ""} onChange={(event) => updateMember(index, memberIndex, { feedback: event.target.value })} rows={2} placeholder="Individual feedback..." className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 dark:border-violet-500/30 dark:bg-slate-950 dark:text-white" /></div>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {pickerGroup && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
              <div className="min-w-0">
                <div className="truncate text-base font-black text-slate-950 dark:text-white">Members · {pickerGroup.groupName || "Group"}</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">A student can belong to only one group. Moving a student keeps existing individual values.</div>
              </div>
              <button type="button" onClick={() => setPickerGroupId("")} className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 dark:border-slate-700 dark:text-slate-300">Done</button>
            </div>
            <div className="p-3 sm:p-4">
              <input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search roll or student name..." className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-violet-400 dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
              <div className="mt-3 max-h-[62vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                {memberPool.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">No matching enrolled student.</div>
                ) : memberPool.map((student) => {
                  const normalized = normalizeMember({ student: resolveStudentId(student), roll: student.roll, name: student.name }, roster);
                  const key = memberKey(normalized);
                  const owner = assignedMap.get(key) || assignedMap.get(`roll:${clean(student.roll).toLowerCase()}`);
                  const checked = owner === pickerGroup.id;
                  const ownerGroup = owner ? groups.find((group) => group.id === owner) : null;
                  return (
                    <label key={`${student.roll}-${resolveStudentId(student)}`} className="flex cursor-pointer items-center gap-3 border-b border-slate-200 px-3 py-3 last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/70 sm:px-4">
                      <input type="checkbox" checked={checked} onChange={() => toggleMember(pickerGroup.id, student)} className="h-5 w-5 shrink-0 accent-violet-600" />
                      <div className="min-w-0 flex-1"><div className="font-bold text-slate-800 dark:text-slate-100">{student.roll || "No roll"}</div><div className="truncate text-xs text-slate-500 dark:text-slate-400">{student.name || "No name"}</div></div>
                      {ownerGroup && ownerGroup.id !== pickerGroup.id && <span className="max-w-[35%] truncate rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{ownerGroup.groupName || "Another group"}</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
