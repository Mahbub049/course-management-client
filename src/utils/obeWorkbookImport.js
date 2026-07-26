import * as XLSX from "xlsx";
import {
  OBE_TEMPLATE_LIMITS,
  buildObeTemplateLayout,
} from "./obeTemplateLayout";

const STUDENT_START_ROW = 30;
const STUDENT_END_ROW = 100;
const DEFAULT_LEVELS = [
  { min: 70, max: 100, level: 4 },
  { min: 60, max: 69.99, level: 3 },
  { min: 50, max: 59.99, level: 2 },
  { min: 40, max: 49.99, level: 1 },
  { min: 0, max: 39.99, level: 0 },
];

const safeText = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

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

const isCheckedCell = (value) => {
  if (value === true || value === 1) return true;
  const normalized = safeText(value).toLowerCase();
  return ["true", "yes", "y", "1", "checked"].includes(normalized);
};

const readWorkbook = async (file) => {
  if (!file) throw new Error("Please select an OBE workbook.");

  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, {
    type: "array",
    cellFormula: true,
    cellNF: true,
  });
};

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

const getExistingOutcomeStatement = (rows = [], code = "") =>
  safeText(
    (Array.isArray(rows) ? rows : []).find(
      (row) => safeText(row?.code).toUpperCase() === safeText(code).toUpperCase()
    )?.statement
  );

const parseImportedSetup = (workbook, currentSetup = {}) => {
  const mappingSheet = workbook.Sheets["CO-PO Mapping"];
  const gradeSheet = workbook.Sheets.GradeSheet;
  const reportSheet = workbook.Sheets["Course Report"];

  if (!mappingSheet || !gradeSheet) return null;

  const courseOutcomes = [];
  for (let index = 0; index < OBE_TEMPLATE_LIMITS.courseOutcomes; index += 1) {
    const row = index + 2;
    const code = safeText(readCellValue(mappingSheet, `A${row}`)).toUpperCase();
    if (!code) continue;

    const importedStatement = safeText(readCellValue(mappingSheet, `B${row}`));
    const existingStatement = getExistingOutcomeStatement(
      currentSetup.courseOutcomes,
      code
    );

    courseOutcomes.push({
      code,
      statement: importedStatement || existingStatement || code,
      order: index,
      isActive: true,
    });
  }

  const allPoStatements = [];
  const poColumns = ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];
  poColumns.forEach((column, index) => {
    const code = safeText(readCellValue(mappingSheet, `${column}1`)).toUpperCase();
    if (!code) return;

    allPoStatements.push({
      code,
      statement:
        getExistingOutcomeStatement(currentSetup.poStatements, code) || code,
      order: index,
      isActive: true,
    });
  });

  const getExistingStrength = (coCode, targetCode) => {
    const existing = (currentSetup.mappings || []).find(
      (row) =>
        safeText(row?.coCode).toUpperCase() === safeText(coCode).toUpperCase() &&
        safeText(row?.targetCode).toUpperCase() === safeText(targetCode).toUpperCase()
    );
    const strength = Number(existing?.strength);
    return [1, 2, 3].includes(strength) ? strength : 1;
  };

  const importedMappings = [];
  const linkedPoColumns = ["O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
  courseOutcomes.forEach((co, coIndex) => {
    linkedPoColumns.forEach((column, poIndex) => {
      const po = allPoStatements[poIndex];
      if (!po) return;
      if (!isCheckedCell(readCellValue(mappingSheet, `${column}${coIndex + 2}`))) return;

      importedMappings.push({
        coCode: co.code,
        targetType: "PO",
        targetCode: po.code,
        strength: getExistingStrength(co.code, po.code),
      });
    });
  });

  // Keep only POs that are actually used by the imported CO-PO mapping.
  // If an older workbook has no mapping flags at all, preserve the current
  // mapping/PO setup instead of wiping it accidentally.
  const mappings = importedMappings.length
    ? importedMappings
    : currentSetup.mappings || [];
  const usedPoCodes = new Set(
    mappings
      .filter((row) => safeText(row?.targetType).toUpperCase() !== "PSO")
      .map((row) => safeText(row?.targetCode).toUpperCase())
      .filter(Boolean)
  );
  const poStatements = allPoStatements
    .filter((row) => usedPoCodes.has(row.code))
    .map((row, index) => ({ ...row, order: index }));

  if (!poStatements.length && currentSetup.poStatements?.length) {
    currentSetup.poStatements.forEach((row, index) => {
      const code = safeText(row?.code).toUpperCase();
      if (!code || (usedPoCodes.size && !usedPoCodes.has(code))) return;
      poStatements.push({
        code,
        statement: safeText(row?.statement) || code,
        order: index,
        isActive: row?.isActive !== false,
      });
    });
  }

  const thresholdCandidate = safeNumber(
    readCellValue(gradeSheet, "AQ27"),
    safeNumber(readCellValue(gradeSheet, "AW27"), currentSetup.thresholdPercent ?? 40)
  );
  const thresholdPercent =
    thresholdCandidate >= 0 && thresholdCandidate <= 100
      ? thresholdCandidate
      : safeNumber(currentSetup.thresholdPercent, 40);

  return {
    thresholdPercent,
    courseOutcomes: courseOutcomes.length
      ? courseOutcomes
      : currentSetup.courseOutcomes || [],
    poStatements: poStatements.length
      ? poStatements
      : currentSetup.poStatements || [],
    psoStatements: currentSetup.psoStatements || [],
    mappings,
    attainmentLevels:
      currentSetup.attainmentLevels?.length
        ? currentSetup.attainmentLevels
        : DEFAULT_LEVELS,
    notes: currentSetup.notes || "",
    courseReportComment1: safeText(readCellValue(reportSheet, "B56")),
    courseReportComment2: safeText(readCellValue(reportSheet, "B62")),
    courseReportGeneralComment: safeText(readCellValue(reportSheet, "B67")),
  };
};

const parseBlueprintGroup = (sheet, { type, name, columns }) => {
  const items = [];

  columns.forEach((column, index) => {
    const marks = safeNumber(readCellValue(sheet, `${column}29`), 0);
    const coCode = safeText(readCellValue(sheet, `${column}28`)).toUpperCase();
    const label = safeText(readCellValue(sheet, `${column}27`)) || `Q${index + 1}`;

    if (marks <= 0 && !coCode) return;
    if (marks <= 0 || !coCode) return;

    items.push({
      key: `q${items.length + 1}`,
      label,
      marks: Math.round(marks * 100) / 100,
      coCode,
      order: items.length,
    });
  });

  if (!items.length) return null;

  return {
    assessmentName: name,
    assessmentType: type,
    totalMarks: Math.round(
      items.reduce((sum, item) => sum + Number(item.marks || 0), 0) * 100
    ) / 100,
    notes: "",
    items,
  };
};

const parseImportedBlueprints = (workbook) => {
  const sheet = workbook.Sheets.GradeSheet;
  if (!sheet) return [];

  return [
    parseBlueprintGroup(sheet, {
      type: "mid",
      name: "Mid Term",
      columns: ["I", "J", "K", "L", "M", "N"],
    }),
    parseBlueprintGroup(sheet, {
      type: "final",
      name: "Final",
      columns: ["P", "Q", "R", "S", "T", "U"],
    }),
  ].filter(Boolean);
};

export const parseObeImportedWorkbookStructure = async (
  file,
  currentSetup = {}
) => {
  const workbook = await readWorkbook(file);
  const official = !!workbook.Sheets.GradeSheet;

  if (!official) {
    return {
      official: false,
      setup: null,
      blueprints: [],
    };
  }

  return {
    official: true,
    setup: parseImportedSetup(workbook, currentSetup),
    blueprints: parseImportedBlueprints(workbook),
  };
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

  const workbook = await readWorkbook(file);

  if (workbook.Sheets.GradeSheet) {
    return parseOfficialBubtWorkbook(workbook, students, blueprints);
  }

  return parseLegacyMarkEntryWorkbook(workbook, students, blueprints);
};
