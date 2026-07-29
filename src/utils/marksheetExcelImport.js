import * as XLSX from "xlsx";

function text(value) {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function asInteger(value, fallback = -1) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function columnLetter(index) {
  return XLSX.utils.encode_col(Math.max(0, Number(index) || 0));
}

export function normalizeImportLabel(value) {
  return text(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bexamination\b/g, " exam ")
    .replace(/\bterm\b/g, " ")
    .replace(/\bclass\s*test\b/g, " ct ")
    .replace(/\bquiz\b/g, " ct ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function importCategory(value) {
  const n = normalizeImportLabel(value);

  if (/\btotal\s*100\b/.test(n) || n === "total" || n === "grand total") {
    return "grand_total";
  }
  if (/\battendance\b|\batt\b/.test(n)) return "attendance";
  if (/\bassignment\b|\bassign\b|\bhomework\b/.test(n)) return "assignment";
  if (/\bfinal\b/.test(n)) return "final";
  if (/\bmid\b/.test(n)) return "mid";
  if (/\blab\s*(evaluation|assessment)\b|\bcontinuous\s*lab\b/.test(n)) {
    return "lab_evaluation";
  }
  if (/\bbest\s*of\b.*\bct\b|\bct\s*(avg|average)\b/.test(n)) {
    return "ct_aggregate";
  }
  if (/\bct\b|\btest\s*\d+\b/.test(n)) return "ct";
  if (/\bpresentation\b|\bviva\b|\boral\b/.test(n)) return "presentation";
  if (/\bproject\b/.test(n)) return "project";
  if (/\blab\b|\bexperiment\b|\breport\b/.test(n)) return "lab_component";

  return "other";
}

function extractFullMarks(...labels) {
  const patterns = [
    /\((\d+(?:\.\d+)?)\)/g,
    /\[(\d+(?:\.\d+)?)\]/g,
    /(?:\/\s*|out\s+of\s+|max(?:imum)?\s*[:=-]?\s*)(\d+(?:\.\d+)?)/gi,
    /(\d+(?:\.\d+)?)\s*(?:marks?|pts?|points?)\b/gi,
  ];

  for (const label of labels) {
    const raw = text(label);
    for (const pattern of patterns) {
      const matches = [...raw.matchAll(pattern)];
      if (!matches.length) continue;
      const n = Number(matches[matches.length - 1][1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function expandMergedHeaderRows(ws, maxRows = 4) {
  const ref = ws?.["!ref"] || "A1:A1";
  const range = XLSX.utils.decode_range(ref);
  const rowCount = Math.min(maxRows, range.e.r + 1);
  const colCount = range.e.c + 1;
  const matrix = Array.from({ length: rowCount }, () =>
    Array.from({ length: colCount }, () => "")
  );

  for (let r = 0; r < rowCount; r += 1) {
    for (let c = 0; c < colCount; c += 1) {
      matrix[r][c] = text(ws[XLSX.utils.encode_cell({ r, c })]?.v);
    }
  }

  (ws?.["!merges"] || []).forEach((merge) => {
    if (merge.s.r >= rowCount) return;
    const value = text(
      ws[XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c })]?.v
    );
    if (!value) return;
    const endRow = Math.min(merge.e.r, rowCount - 1);
    for (let r = merge.s.r; r <= endRow; r += 1) {
      for (let c = merge.s.c; c <= merge.e.c && c < colCount; c += 1) {
        matrix[r][c] = value;
      }
    }
  });

  return matrix;
}

function looksLikeRollHeader(value) {
  const n = normalizeImportLabel(value);
  if (!n) return false;

  return (
    n === "roll" ||
    n === "id" ||
    n === "id no" ||
    n === "student no" ||
    n === "student id" ||
    n === "student id no" ||
    n === "student code" ||
    n === "student roll" ||
    n === "registration" ||
    n === "registration no" ||
    n === "registration number" ||
    n === "reg no" ||
    n === "roll id" ||
    n === "roll no" ||
    n === "roll number" ||
    /\b(student|roll|registration|reg)\b.*\b(id|no|number|code)\b/.test(n) ||
    /\bid\b.*\b(no|number)\b/.test(n)
  );
}

function looksLikeNameHeader(value) {
  const n = normalizeImportLabel(value);
  return (
    n === "name" ||
    n === "student" ||
    n === "student name" ||
    n === "full name" ||
    n === "name of student" ||
    n === "name of students" ||
    n.includes("student name") ||
    n.includes("name of student")
  );
}

function looksLikeMarksHeader(value) {
  const n = normalizeImportLabel(value);
  if (!n) return false;
  if (importCategory(n) !== "other") return true;
  return /\b(mark|score|assessment|exam|test|quiz|viva|project|report|performance)\b/.test(n);
}

function cellValue(ws, row, col) {
  if (row < 0 || col < 0) return null;
  const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })];
  if (!cell) return null;
  if (cell.t === "s" || cell.t === "str") return text(cell.v);
  return cell.v ?? null;
}

function findHeader(ws) {
  const ref = ws?.["!ref"] || "A1:A1";
  const range = XLSX.utils.decode_range(ref);
  const maxScanRow = Math.min(range.e.r, range.s.r + 39);
  let best = null;

  for (let r = range.s.r; r <= maxScanRow; r += 1) {
    let rollCol = -1;
    let nameCol = -1;
    let nonEmpty = 0;
    let markHeaders = 0;

    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const value = text(cellValue(ws, r, c));
      if (!value) continue;
      nonEmpty += 1;
      if (rollCol < 0 && looksLikeRollHeader(value)) rollCol = c;
      if (nameCol < 0 && looksLikeNameHeader(value)) nameCol = c;
      if (looksLikeMarksHeader(value)) markHeaders += 1;
    }

    if (rollCol < 0) continue;
    const score = 100 + (nameCol >= 0 ? 45 : 0) + markHeaders * 8 + Math.min(nonEmpty, 12);
    if (!best || score > best.score) {
      best = { headerRow: r, rollCol, nameCol, score };
    }
  }

  return best;
}

function normalizeRoll(value) {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return text(value).replace(/\.0+$/, "");
}

function secondaryHeaderLooksUseful(ws, headerRow, rollCol, nameCol) {
  const ref = ws?.["!ref"] || "A1:A1";
  const range = XLSX.utils.decode_range(ref);
  if (headerRow + 1 > range.e.r) return false;

  const nextRoll = rollCol >= 0 ? text(cellValue(ws, headerRow + 1, rollCol)) : "";
  const nextName = nameCol >= 0 ? text(cellValue(ws, headerRow + 1, nameCol)) : "";

  let useful = 0;
  let checked = 0;
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    if (c === rollCol || c === nameCol) continue;
    const v = text(cellValue(ws, headerRow + 1, c));
    if (!v) continue;
    checked += 1;
    if (
      /^(co|clo|po|plo|q|question|part|item|lab|ct|test)\s*[-:]?\s*\d+$/i.test(v) ||
      /^(total|marks?|score|theory|lab|written|viva|project)$/i.test(v)
    ) {
      useful += 1;
    }
  }

  if (!nextRoll && !nextName && checked >= 2) return true;
  return checked > 0 && useful / checked >= 0.5;
}

function getHeaderValue(headerMatrix, rowOffset, col, ws, absoluteRow) {
  return (
    text(headerMatrix?.[rowOffset]?.[col]) ||
    text(cellValue(ws, absoluteRow, col))
  );
}

function buildColumnLabel(parent, child) {
  if (!child || normalizeImportLabel(child) === normalizeImportLabel(parent)) {
    return parent;
  }
  if (/^total$/i.test(child)) return `${parent} / Total`;
  return `${parent} / ${child}`;
}

function cleanAssessmentName(value) {
  return text(value)
    .replace(/\s*\((?:max\s*)?\d+(?:\.\d+)?(?:\s*marks?)?\)\s*/gi, " ")
    .replace(/\s*\[(?:max\s*)?\d+(?:\.\d+)?(?:\s*marks?)?\]\s*/gi, " ")
    .replace(/\s*(?:\/|out\s+of\s+)\s*\d+(?:\.\d+)?\s*$/gi, "")
    .replace(/\s*[-–—:]?\s*max(?:imum)?\s*[:=-]?\s*\d+(?:\.\d+)?\s*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalCreateName(column, courseType = "theory") {
  const category = column.category;
  const sourceName = cleanAssessmentName(column.sourceLabel).replace(/\s*\/\s*Total\s*$/i, "");
  const isSpecificExcelName =
    /\d/.test(sourceName) ||
    /\b(theory|lab|written|oral|report|phase|part|question|project|presentation|viva)\b/i.test(sourceName);

  // Keep descriptive/numbered Excel headers as the first suggestion. The
  // teacher can still edit the name before the assessment is created.
  if (sourceName && isSpecificExcelName && category !== "grand_total") {
    return sourceName;
  }

  if (category === "attendance") return "Attendance";
  if (category === "assignment") return "Assignment";
  if (category === "mid") return courseType === "lab" ? "Lab Mid" : "Mid Term";
  if (category === "final") return courseType === "lab" ? "Lab Final" : "Final";
  if (category === "lab_evaluation") return "Lab Evaluation";
  if (category === "ct_aggregate") return "Class Test";
  if (category === "presentation") return "Presentation";
  if (category === "project") return "Project";

  const parent = cleanAssessmentName(column.parentHeader);
  const child = cleanAssessmentName(column.childHeader);
  if (child && !/^total$/i.test(child)) return `${parent} ${child}`.trim();
  return parent || sourceName || "Assessment";
}

function isAggregateColumn(column) {
  const child = text(column.childHeader);
  return /^total$/i.test(child);
}

function sourcePriority(column, allColumns = []) {
  const category = column.category;
  if (category === "grand_total") return -100;
  if (isAggregateColumn(column)) return 100;

  const hasAggregateSameParent = allColumns.some(
    (other) =>
      other.index !== column.index &&
      normalizeImportLabel(other.parentHeader) ===
        normalizeImportLabel(column.parentHeader) &&
      isAggregateColumn(other)
  );
  if (hasAggregateSameParent) return 10;

  if (category === "ct" && allColumns.some((other) => other.category === "ct_aggregate")) {
    return 30;
  }
  if (
    category === "lab_component" &&
    allColumns.some((other) => other.category === "lab_evaluation")
  ) {
    return 25;
  }
  if (["mid", "final"].includes(category)) {
    const currentMarks = Number(column.maxMarks || 0);
    const strongerSameCategory = allColumns.some(
      (other) =>
        other.index !== column.index &&
        other.category === category &&
        Number(other.maxMarks || 0) > currentMarks
    );
    if (strongerSameCategory) return 35;
  }

  if (["attendance", "assignment", "mid", "final", "lab_evaluation", "ct_aggregate"].includes(category)) {
    return 80;
  }
  if (["ct", "presentation", "project"].includes(category)) return 55;
  if (category === "lab_component") return 45;
  return 20;
}

function isLikelyMetadataHeader(value) {
  const n = normalizeImportLabel(value);
  if (!n) return true;
  return /^(sl|serial|serial no|no|email|email address|phone|mobile|department|dept|section|batch|intake|semester|programme|program|grade|letter grade|gpa|cgpa|status|remarks|remark|comments|comment|rank|position|percentage|percent|date|time|gender|signature)$/.test(n);
}

function inferFullMarksFromObserved(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const common = [1, 2, 3, 5, 7.5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80, 100];
  const found = common.find((item) => item >= n - 1e-9);
  if (found != null) return found;
  return Math.ceil(n / 10) * 10;
}

export function inspectMarksSheet(workbook, sheetName, { headerRow = null } = {}) {
  const ws = workbook?.Sheets?.[sheetName];
  if (!ws) {
    return {
      error: "Worksheet not found.",
      headerRows: [],
      columns: [],
      suggested: { headerRow: 0, rollCol: -1, nameCol: -1 },
    };
  }

  const ref = ws?.["!ref"] || "A1:A1";
  const range = XLSX.utils.decode_range(ref);
  const auto = findHeader(ws);
  const selectedHeaderRow = Math.min(
    range.e.r,
    Math.max(range.s.r, asInteger(headerRow, auto?.headerRow ?? range.s.r))
  );
  const maxPreviewRow = Math.min(range.e.r, range.s.r + 39);

  const headerRows = [];
  for (let r = range.s.r; r <= maxPreviewRow; r += 1) {
    const values = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const value = text(cellValue(ws, r, c));
      if (value) values.push(value);
      if (values.length >= 6) break;
    }
    if (!values.length && r !== selectedHeaderRow) continue;
    headerRows.push({
      value: r,
      label: `Row ${r + 1}${values.length ? ` — ${values.join(" | ")}` : " — blank"}`,
    });
  }

  const headerMatrix = expandMergedHeaderRows(ws, selectedHeaderRow + 1);
  const columns = [];
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const header =
      getHeaderValue(headerMatrix, selectedHeaderRow, c, ws, selectedHeaderRow) ||
      `Column ${columnLetter(c)}`;
    columns.push({
      value: c,
      letter: columnLetter(c),
      header,
      label: `${columnLetter(c)} — ${header}`,
    });
  }

  return {
    error: "",
    headerRows,
    columns,
    suggested: {
      headerRow: auto?.headerRow ?? selectedHeaderRow,
      rollCol: auto?.rollCol ?? -1,
      nameCol: auto?.nameCol ?? -1,
    },
    selectedHeaderRow,
  };
}

export function parseMarksWorkbook(buffer) {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    cellText: true,
    raw: true,
  });

  return {
    workbook,
    sheetNames: [...(workbook.SheetNames || [])],
  };
}

export function parseMarksSheet(
  workbook,
  sheetName,
  {
    courseType = "theory",
    headerRow: manualHeaderRow = null,
    rollCol: manualRollCol = null,
    nameCol: manualNameCol = null,
  } = {}
) {
  const ws = workbook?.Sheets?.[sheetName];
  if (!ws) {
    return { error: "Worksheet not found.", rows: [], columns: [] };
  }

  const ref = ws?.["!ref"] || "A1:A1";
  const range = XLSX.utils.decode_range(ref);
  const autoHeader = findHeader(ws);
  const hasManualHeader = manualHeaderRow != null && manualHeaderRow !== "";
  const hasManualRoll = manualRollCol != null && manualRollCol !== "";

  const headerRow = hasManualHeader
    ? asInteger(manualHeaderRow, -1)
    : autoHeader?.headerRow ?? -1;
  const rollCol = hasManualRoll
    ? asInteger(manualRollCol, -1)
    : autoHeader?.rollCol ?? -1;
  const nameCol = manualNameCol != null && manualNameCol !== ""
    ? asInteger(manualNameCol, -1)
    : autoHeader?.nameCol ?? -1;

  if (headerRow < range.s.r || headerRow > range.e.r || rollCol < range.s.c || rollCol > range.e.c) {
    return {
      error: "Could not detect the student Roll/ID column. Open Sheet structure and choose the header row and Roll/ID column manually.",
      rows: [],
      columns: [],
      headerRow: Math.max(0, headerRow) + 1,
      rollCol,
      nameCol,
    };
  }

  const secondaryHeader = secondaryHeaderLooksUseful(
    ws,
    headerRow,
    rollCol,
    nameCol
  );
  const dataStartRow = headerRow + (secondaryHeader ? 2 : 1);
  const headerMatrix = expandMergedHeaderRows(ws, headerRow + 2);

  const columns = [];
  let carriedParentHeader = "";
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    if (c === rollCol || c === nameCol) continue;

    let parentHeader = getHeaderValue(
      headerMatrix,
      headerRow,
      c,
      ws,
      headerRow
    );
    const childHeader = secondaryHeader
      ? text(cellValue(ws, headerRow + 1, c))
      : "";

    if (parentHeader) {
      carriedParentHeader = parentHeader;
    } else if (secondaryHeader && childHeader && carriedParentHeader) {
      parentHeader = carriedParentHeader;
    }

    if (!parentHeader && !childHeader) continue;

    const sourceLabel = buildColumnLabel(parentHeader || childHeader, childHeader);
    const category = importCategory(sourceLabel);
    const maxMarks = extractFullMarks(parentHeader, childHeader, sourceLabel);

    columns.push({
      index: c,
      letter: columnLetter(c),
      key: `col_${c}`,
      parentHeader: parentHeader || childHeader,
      childHeader,
      sourceLabel,
      normalizedLabel: normalizeImportLabel(sourceLabel),
      category,
      maxMarks,
      isAggregate: /^total$/i.test(childHeader),
      createName: "",
      priority: 0,
      sampleValues: [],
      nonEmptyCount: 0,
      numericCount: 0,
      observedMax: null,
      suggestedFullMarks: null,
    });
  }

  const rows = [];
  const seenRolls = new Set();
  const duplicateRolls = [];

  for (let r = dataStartRow; r <= range.e.r; r += 1) {
    const roll = normalizeRoll(cellValue(ws, r, rollCol));
    const name = nameCol >= 0 ? text(cellValue(ws, r, nameCol)) : "";
    if (!roll && !name) continue;
    if (!roll) continue;

    if (seenRolls.has(roll)) {
      duplicateRolls.push(roll);
      continue;
    }
    seenRolls.add(roll);

    const values = {};
    columns.forEach((column) => {
      values[column.key] = cellValue(ws, r, column.index);
    });

    rows.push({
      rowNumber: r + 1,
      roll,
      name,
      values,
    });
  }

  columns.forEach((column) => {
    const rawValues = rows
      .map((row) => row.values[column.key])
      .filter((value) => text(value) !== "");
    const numericValues = rawValues
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0);

    column.sampleValues = rawValues.slice(0, 4).map((value) => text(value));
    column.nonEmptyCount = rawValues.length;
    column.numericCount = numericValues.length;
    column.observedMax = numericValues.length ? Math.max(...numericValues) : null;
    column.suggestedFullMarks =
      column.maxMarks || inferFullMarksFromObserved(column.observedMax);
    column.priority = sourcePriority(column, columns);

    const numericRatio = rawValues.length ? numericValues.length / rawValues.length : 0;
    const genericNumericMarks =
      column.category === "other" &&
      rawValues.length >= 2 &&
      numericRatio >= 0.6 &&
      !isLikelyMetadataHeader(column.sourceLabel);

    column.recommended =
      column.category !== "grand_total" &&
      (column.priority >= 45 || genericNumericMarks);

    if (courseType === "lab") {
      const knownLabCategory = [
        "lab_evaluation",
        "lab_component",
        "mid",
        "final",
        "attendance",
        "presentation",
        "project",
      ].includes(column.category);
      column.recommended =
        column.category !== "grand_total" &&
        ((knownLabCategory && column.priority >= 35) || genericNumericMarks);
    } else if (courseType === "theory") {
      if (["lab_evaluation", "lab_component"].includes(column.category)) {
        column.recommended = false;
      }
    }

    column.createName = canonicalCreateName(column, courseType);
  });

  if (courseType === "theory") {
    const detailedCtColumns = columns.filter((column) => {
      if (column.category !== "ct") return false;
      const parent = normalizeImportLabel(column.parentHeader || "");
      const child = normalizeImportLabel(column.childHeader || "");
      return column.isAggregate || (!child && /\bct\s*\d+\b/.test(parent));
    });

    if (detailedCtColumns.length) {
      const detailedKeys = new Set(detailedCtColumns.map((column) => column.key));
      columns.forEach((column) => {
        if (column.category === "ct_aggregate") column.recommended = false;
        if (detailedKeys.has(column.key)) column.recommended = true;
      });
    }
  }

  if (courseType === "lab") {
    const detailedLabColumns = columns.filter((column) => {
      if (column.category !== "lab_component") return false;
      const parent = normalizeImportLabel(column.parentHeader || "");
      const child = normalizeImportLabel(column.childHeader || "");
      return !child && /\blab\s*\d+\b/.test(parent);
    });

    if (detailedLabColumns.length) {
      const detailedKeys = new Set(detailedLabColumns.map((column) => column.key));
      columns.forEach((column) => {
        if (column.category === "lab_evaluation") column.recommended = false;
        if (detailedKeys.has(column.key)) column.recommended = true;
      });
    }
  }

  return {
    error: "",
    sheetName,
    headerRow: headerRow + 1,
    headerRowIndex: headerRow,
    dataStartRow: dataStartRow + 1,
    rollCol,
    nameCol,
    secondaryHeader,
    columns,
    rows,
    duplicateRolls,
  };
}

export function chooseDefaultMarksSheet(sheetNames = [], course = {}) {
  const code = normalizeImportLabel(course?.code || "").replace(/\s+/g, "");
  if (code) {
    const exact = sheetNames.find(
      (name) => normalizeImportLabel(name).replace(/\s+/g, "") === code
    );
    if (exact) return exact;

    const contains = sheetNames.find((name) =>
      normalizeImportLabel(name).replace(/\s+/g, "").includes(code)
    );
    if (contains) return contains;
  }
  return sheetNames[0] || "";
}
