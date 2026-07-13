import * as XLSX from "xlsx";
import {
  OBE_TEMPLATE_LIMITS,
  buildObeTemplateLayout,
} from "./obeTemplateLayout";

const STUDENT_START_ROW = 30;
const STUDENT_END_ROW = 100;

const safeText = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

const getStudentId = (student = {}) =>
  safeText(student.studentId || student._id || student.id || student.student);

const getStudentKeys = (student = {}) =>
  [
    student.roll,
    student.username,
    student.studentId,
    student._id,
    student.id,
    student.student,
  ]
    .map(safeText)
    .filter(Boolean);

const buildStudentLookup = (students = []) => {
  const lookup = new Map();

  (Array.isArray(students) ? students : []).forEach((student) => {
    const studentId = getStudentId(student);
    if (!studentId) return;

    getStudentKeys(student).forEach((key) => {
      lookup.set(key.toLowerCase(), studentId);
    });
  });

  return lookup;
};

const readCellValue = (sheet, reference) => sheet?.[reference]?.v ?? "";

const parseNumericMark = ({ rawValue, maxMarks, roll, label }) => {
  const text = safeText(rawValue);
  if (!text) return 0;

  if (text.toUpperCase() === "A") {
    throw new Error(
      `Roll ${roll}: “A” was entered for ${label}. The portal currently stores numeric OBE marks only; use 0 or enter the mark from the portal.`
    );
  }

  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Roll ${roll}: ${label} must contain a numeric mark.`);
  }
  if (numeric < 0) {
    throw new Error(`Roll ${roll}: ${label} cannot contain a negative mark.`);
  }
  if (numeric > Number(maxMarks || 0)) {
    throw new Error(
      `Roll ${roll}: ${label} contains ${numeric}, which exceeds the configured maximum of ${maxMarks}.`
    );
  }

  return Math.round(numeric * 100) / 100;
};

const parseOfficialBubtWorkbook = (workbook, students, blueprints) => {
  const sheet = workbook.Sheets.GradeSheet;
  const layout = buildObeTemplateLayout(blueprints);

  if (layout.errors.length) {
    throw new Error(layout.errors.join("\n"));
  }
  if (!layout.allSlots.length) {
    throw new Error("No OBE assessment blueprint items are available for import.");
  }

  const studentLookup = buildStudentLookup(students);
  const recordMap = new Map();
  const unknownRolls = [];
  const duplicateRolls = [];
  const seenStudents = new Set();

  for (let row = STUDENT_START_ROW; row <= STUDENT_END_ROW; row += 1) {
    const roll = safeText(readCellValue(sheet, `A${row}`));
    if (!roll) continue;

    const studentId = studentLookup.get(roll.toLowerCase());
    if (!studentId) {
      unknownRolls.push(roll);
      continue;
    }
    if (seenStudents.has(studentId)) {
      duplicateRolls.push(roll);
      continue;
    }
    seenStudents.add(studentId);

    layout.allSlots.forEach((slot) => {
      const rawValue = readCellValue(sheet, `${slot.column}${row}`);
      const obtainedMarks = parseNumericMark({
        rawValue,
        maxMarks: slot.marks,
        roll,
        label: `${slot.blueprintName} - ${slot.itemLabel}`,
      });

      const recordKey = `${studentId}__${slot.blueprintId}`;
      if (!recordMap.has(recordKey)) {
        recordMap.set(recordKey, {
          studentId,
          blueprintId: slot.blueprintId,
          entries: [],
        });
      }

      recordMap.get(recordKey).entries.push({
        itemKey: slot.itemKey,
        obtainedMarks,
      });
    });
  }

  if (unknownRolls.length) {
    throw new Error(
      `These roll numbers are not enrolled in the current course: ${[
        ...new Set(unknownRolls),
      ].join(", ")}.`
    );
  }
  if (duplicateRolls.length) {
    throw new Error(
      `Duplicate student rows were found for: ${[...new Set(duplicateRolls)].join(", ")}.`
    );
  }

  const records = Array.from(recordMap.values());
  if (!records.length) {
    throw new Error(
      `No matching student marks were found in GradeSheet rows ${STUDENT_START_ROW}-${STUDENT_END_ROW}.`
    );
  }

  return records;
};

const parseLegacyMarkEntryWorkbook = (workbook, students, blueprints) => {
  const sheet = workbook.Sheets["Mark Entry"];
  if (!sheet) {
    throw new Error("Neither GradeSheet nor the legacy Mark Entry sheet was found.");
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!rows.length) {
    throw new Error("Mark Entry sheet is empty.");
  }

  const headers = rows[0];
  const studentIdCol = headers.findIndex((header) => header === "Student ID");
  if (studentIdCol === -1) {
    throw new Error("Student ID column not found in Mark Entry sheet.");
  }

  const headerMeta = [];
  headers.forEach((header, index) => {
    if (typeof header !== "string" || !header.includes(" | ")) return;

    const [assessmentName, itemLabel] = header.split(" | ").map((part) => part.trim());
    const blueprint = blueprints.find(
      (row) => safeText(row.assessmentName) === assessmentName
    );
    const item = blueprint?.items?.find(
      (row) => safeText(row.label) === itemLabel
    );

    if (blueprint && item) {
      headerMeta.push({
        colIndex: index,
        blueprintId: safeText(blueprint._id || blueprint.id),
        itemKey: item.key,
        maxMarks: Number(item.marks || 0),
        label: `${assessmentName} - ${itemLabel}`,
      });
    }
  });

  if (!headerMeta.length) {
    throw new Error(
      "The legacy Mark Entry columns do not match the current OBE blueprints."
    );
  }

  const studentLookup = buildStudentLookup(students);
  const recordMap = new Map();

  rows.slice(1).forEach((row) => {
    const workbookStudentKey = safeText(row[studentIdCol]);
    if (!workbookStudentKey) return;

    const studentId = studentLookup.get(workbookStudentKey.toLowerCase());
    if (!studentId) return;

    headerMeta.forEach((meta) => {
      const obtainedMarks = parseNumericMark({
        rawValue: row[meta.colIndex],
        maxMarks: meta.maxMarks,
        roll: workbookStudentKey,
        label: meta.label,
      });
      const recordKey = `${studentId}__${meta.blueprintId}`;

      if (!recordMap.has(recordKey)) {
        recordMap.set(recordKey, {
          studentId,
          blueprintId: meta.blueprintId,
          entries: [],
        });
      }

      recordMap.get(recordKey).entries.push({
        itemKey: meta.itemKey,
        obtainedMarks,
      });
    });
  });

  const records = Array.from(recordMap.values());
  if (!records.length) {
    throw new Error("No matching student marks were found in Mark Entry.");
  }
  return records;
};

export const parseObeImportedMarkWorkbook = async (
  file,
  students = [],
  blueprints = []
) => {
  if (!file) throw new Error("Please select an OBE workbook.");
  if ((students || []).length > OBE_TEMPLATE_LIMITS.students) {
    throw new Error(
      `The official BUBT template supports up to ${OBE_TEMPLATE_LIMITS.students} students.`
    );
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellFormula: true,
    cellNF: true,
  });

  if (workbook.Sheets.GradeSheet) {
    return parseOfficialBubtWorkbook(workbook, students, blueprints);
  }

  return parseLegacyMarkEntryWorkbook(workbook, students, blueprints);
};
