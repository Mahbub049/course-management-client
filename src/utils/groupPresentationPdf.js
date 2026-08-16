import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const UNIVERSITY_NAME = "Bangladesh University of Business and Technology (BUBT)";

const clean = (value, fallback = "") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const safeFilePart = (value) =>
  clean(value)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");

const normalizeEntryMode = (value, fallback = "group") =>
  String(value || fallback).toLowerCase() === "individual" ? "individual" : "group";
const fieldMode = (field, settings = {}) =>
  normalizeEntryMode(field?.entryMode, settings.groupMarkMode || "group");
const feedbackMode = (settings = {}) =>
  normalizeEntryMode(settings.feedbackEntryMode, settings.groupMarkMode || "group");

const getBlankValue = (row, field) => row?.blankValues?.[field.id] ?? "";
const getMcqValue = (row, field) => row?.selectedOptions?.[field.id] ?? "";
const getCheckboxValue = (row, field) => Boolean(row?.checkboxValues?.[field.id]);

const getEffectiveBlankValue = (group, member, field, settings) =>
  fieldMode(field, settings) === "individual" ? getBlankValue(member, field) : getBlankValue(group, field);
const getEffectiveMcqValue = (group, member, field, settings) =>
  fieldMode(field, settings) === "individual" ? getMcqValue(member, field) : getMcqValue(group, field);
const getEffectiveCheckboxValue = (group, member, field, settings) =>
  fieldMode(field, settings) === "individual" ? getCheckboxValue(member, field) : getCheckboxValue(group, field);
const getEffectiveFeedback = (group, member, settings) =>
  feedbackMode(settings) === "individual" ? member?.feedback || "" : group?.feedback || "";

const calculateTotal = (group, member, fields = [], settings = {}) => {
  const values = fields
    .map((field) => String(getEffectiveBlankValue(group, member, field, settings) ?? "").trim())
    .filter(Boolean);
  if (!values.length) return "";
  const nums = values.map(Number);
  if (nums.some(Number.isNaN)) return "-";
  const total = nums.reduce((sum, value) => sum + value, 0);
  return Number.isInteger(total) ? String(total) : String(Number(total.toFixed(2)));
};

const courseLabel = (course = {}) => {
  const code = clean(course.code, "Course");
  const title = clean(course.title);
  const section = clean(course.section);
  return `${code}${title ? ` - ${title}` : ""}${section ? ` (Section ${section})` : ""}`;
};

const scopeLabel = (mode) => normalizeEntryMode(mode) === "individual" ? "Individual" : "Group";

const buildPdfTable = ({ settings, groups, blankFields, mcqFields, checkboxFields }) => {
  const head = [
    "Group",
    "Roll",
    "Student Name",
    ...blankFields.map((field, index) => `${clean(field.label, `Marks ${index + 1}`)}\n[${scopeLabel(fieldMode(field, settings))}]`),
    ...mcqFields.map((field, index) => `${clean(field.label, `Category ${index + 1}`)}\n[${scopeLabel(fieldMode(field, settings))}]`),
    ...checkboxFields.map((field, index) => `${clean(field.label, `Check ${index + 1}`)}\n[${scopeLabel(fieldMode(field, settings))}]`),
    ...(settings.includeTotal ? ["Total"] : []),
    ...(settings.includeFeedback ? [`Feedback / Comments\n[${scopeLabel(feedbackMode(settings))}]`] : []),
  ];

  const body = groups.flatMap((group, groupIndex) => {
    const members = Array.isArray(group.members) && group.members.length ? group.members : [null];
    return members.map((member) => [
      clean(group.groupName, `Group ${groupIndex + 1}`),
      member ? clean(member.roll) : "",
      member ? clean(member.name) : "No members selected",
      ...blankFields.map((field) => clean(getEffectiveBlankValue(group, member, field, settings))),
      ...mcqFields.map((field) => clean(getEffectiveMcqValue(group, member, field, settings))),
      ...checkboxFields.map((field) => getEffectiveCheckboxValue(group, member, field, settings) ? "Yes" : "No"),
      ...(settings.includeTotal ? [calculateTotal(group, member, blankFields, settings)] : []),
      ...(settings.includeFeedback ? [clean(getEffectiveFeedback(group, member, settings))] : []),
    ]);
  });

  return { head, body };
};

export const createGroupPresentationPdf = ({ note }) => {
  if (!note) throw new Error("Group presentation sheet is not ready.");

  const settings = note.settings || {};
  const groups = Array.isArray(note.groupRows) ? note.groupRows : [];
  const blankFields = settings.includeBlankFields && Array.isArray(settings.blankFields) ? settings.blankFields : [];
  const mcqFields = settings.includeMcq && Array.isArray(settings.mcqFields) ? settings.mcqFields : [];
  const checkboxFields = settings.includeCheckbox && Array.isArray(settings.checkboxFields) ? settings.checkboxFields : [];
  const { head, body } = buildPdfTable({ settings, groups, blankFields, mcqFields, checkboxFields });

  const orientation = head.length > 6 ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation, unit: "pt", format: "a4", compress: true, putOnlyUsedFonts: true });
  const width = doc.internal.pageSize.getWidth();

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(UNIVERSITY_NAME, width / 2, 28, { align: "center" });

  doc.setFontSize(13);
  doc.text(clean(note.title, "Group Presentation Evaluation Sheet"), width / 2, 48, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(courseLabel(note.course || {}), width / 2, 65, { align: "center" });

  const sharedCount = [...blankFields, ...mcqFields, ...checkboxFields].filter((field) => fieldMode(field, settings) === "group").length + (settings.includeFeedback && feedbackMode(settings) === "group" ? 1 : 0);
  const individualCount = [...blankFields, ...mcqFields, ...checkboxFields].filter((field) => fieldMode(field, settings) === "individual").length + (settings.includeFeedback && feedbackMode(settings) === "individual" ? 1 : 0);
  const meta = [
    `${sharedCount} group-shared field${sharedCount === 1 ? "" : "s"}`,
    `${individualCount} individual field${individualCount === 1 ? "" : "s"}`,
    note?.course?.semester && note?.course?.year ? `${note.course.semester} ${note.course.year}` : "",
    note.date ? `Date: ${note.date}` : "",
  ].filter(Boolean).join("   |   ");
  doc.setFontSize(8.5);
  if (meta) doc.text(meta, width / 2, 80, { align: "center" });

  doc.setDrawColor(203, 213, 225);
  doc.line(28, 91, width - 28, 91);

  autoTable(doc, {
    startY: 103,
    head: [head],
    body: body.length ? body : [["No groups added", ...head.slice(1).map(() => "")]],
    theme: "grid",
    margin: { left: 20, right: 20, bottom: 34 },
    styles: {
      font: "helvetica",
      fontSize: head.length > 9 ? 6.2 : 7.2,
      cellPadding: 3.5,
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
      lineWidth: 0.45,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 72, fontStyle: "bold" },
      1: { cellWidth: 82, fontStyle: "bold" },
      2: { cellWidth: orientation === "landscape" ? 130 : 115 },
    },
    didDrawPage: ({ pageNumber }) => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Page ${pageNumber}`, width - 26, pageHeight - 16, { align: "right" });
    },
  });

  const filename = `${safeFilePart(note?.course?.code || "Course")}_${safeFilePart(note.title || "Group-Presentation")}_Mixed-Marks.pdf`;
  return { doc, filename };
};

export const exportGroupPresentationPdf = (args) => {
  const { doc, filename } = createGroupPresentationPdf(args);
  doc.save(filename);
};

export const printGroupPresentationPdf = (args) => {
  const { doc } = createGroupPresentationPdf(args);
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.src = url;
  frame.onload = () => {
    setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } finally {
        setTimeout(() => {
          URL.revokeObjectURL(url);
          frame.remove();
        }, 1500);
      }
    }, 250);
  };
  document.body.appendChild(frame);
};
