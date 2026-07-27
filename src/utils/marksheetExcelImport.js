import * as XLSX from "xlsx";

function text(value) {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
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

  if (/\btotal\s*100\b/.test(n) || n === "total") return "grand_total";
  if (/\battendance\b|\batt\b/.test(n)) return "attendance";
  if (/\bassignment\b|\bassign\b/.test(n)) return "assignment";
  if (/\bfinal\b/.test(n)) return "final";
  if (/\bmid\b/.test(n)) return "mid";
  if (/\blab\s*(evaluation|assessment)\b|\bcontinuous\s*lab\b/.test(n)) {
    return "lab_evaluation";
  }
  if (/\bbest\s*of\b.*\bct\b|\bct\s*(avg|average)\b/.test(n)) {
    return "ct_aggregate";
  }
  if (/\bct\b/.test(n)) return "ct";
  if (/\bpresentation\b|\bviva\b/.test(n)) return "presentation";
  if (/\bproject\b/.test(n)) return "project";
  if (/\blab\b/.test(n)) return "lab_component";

  return "other";
}

function extractFullMarks(...labels) {
  for (const label of labels) {
    const raw = text(label);
    const matches = [...raw.matchAll(/\((\d+(?:\.\d+)?)\)/g)];
    if (matches.length) {
      const n = Number(matches[matches.length - 1][1]);
      if (Number.isFinite(n)) return n;
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
  return (
    n === "roll" ||
    n === "id" ||
    n === "id no" ||
    n === "student id" ||
    n === "student roll" ||
    n === "roll no" ||
    n === "roll number" ||
    n.includes("id no")
  );
}

function looksLikeNameHeader(value) {
  const n = normalizeImportLabel(value);
  return (
    n === "name" ||
    n === "student" ||
    n === "student name" ||
    n === "name of student" ||
    n === "name of students" ||
    n.includes("name of student")
  );
}

function findHeader(ws) {
  const ref = ws?.["!ref"] || "A1:A1";
  const range = XLSX.utils.decode_range(ref);
  const maxScanRow = Math.min(range.e.r, 12);

  for (let r = range.s.r; r <= maxScanRow; r += 1) {
    let rollCol = -1;
    let nameCol = -1;

    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const value = text(ws[XLSX.utils.encode_cell({ r, c })]?.v);
      if (rollCol < 0 && looksLikeRollHeader(value)) rollCol = c;
      if (nameCol < 0 && looksLikeNameHeader(value)) nameCol = c;
    }

    if (rollCol >= 0 && nameCol >= 0) {
      return { headerRow: r, rollCol, nameCol };
    }
  }

  return null;
}

function cellValue(ws, row, col) {
  const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })];
  if (!cell) return null;
  if (cell.t === "s" || cell.t === "str") return text(cell.v);
  return cell.v ?? null;
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

  let useful = 0;
  let checked = 0;
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    if (c === rollCol || c === nameCol) continue;
    const v = text(cellValue(ws, headerRow + 1, c));
    if (!v) continue;
    checked += 1;
    if (/^(co|clo|po|plo)\s*\d+$/i.test(v) || /total/i.test(v)) useful += 1;
  }

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

function canonicalCreateName(column, courseType = "theory") {
  const category = column.category;
  if (category === "attendance") return "Attendance";
  if (category === "assignment") return "Assignment";
  if (category === "mid") return courseType === "lab" ? "Lab Mid" : "Mid Term";
  if (category === "final") return courseType === "lab" ? "Lab Final" : "Final";
  if (category === "lab_evaluation") return "Lab Evaluation";
  if (category === "ct_aggregate") return "Class Test";
  if (category === "presentation") return "Presentation";
  if (category === "project") return "Project";

  const parent = text(column.parentHeader).replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const child = text(column.childHeader);
  if (child && !/^total$/i.test(child)) return `${parent} ${child}`.trim();
  return parent || text(column.sourceLabel) || "Assessment";
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
  if (["ct", "presentation", "project"].includes(category)) return 45;
  if (category === "lab_component") return 35;
  return 20;
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

export function parseMarksSheet(workbook, sheetName, { courseType = "theory" } = {}) {
  const ws = workbook?.Sheets?.[sheetName];
  if (!ws) {
    return { error: "Worksheet not found.", rows: [], columns: [] };
  }

  const header = findHeader(ws);
  if (!header) {
    return {
      error: "Could not detect the student Roll/ID and Name columns in this sheet.",
      rows: [],
      columns: [],
    };
  }

  const { headerRow, rollCol, nameCol } = header;
  const secondaryHeader = secondaryHeaderLooksUseful(
    ws,
    headerRow,
    rollCol,
    nameCol
  );
  const dataStartRow = headerRow + (secondaryHeader ? 2 : 1);
  const ref = ws?.["!ref"] || "A1:A1";
  const range = XLSX.utils.decode_range(ref);
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
    });
  }

  columns.forEach((column) => {
    column.priority = sourcePriority(column, columns);
    column.recommended = column.priority >= 50;

    if (courseType === "lab") {
      column.recommended = [
        "lab_evaluation",
        "mid",
        "final",
        "attendance",
      ].includes(column.category) && column.priority >= 50;
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

  const rows = [];
  const seenRolls = new Set();
  const duplicateRolls = [];

  for (let r = dataStartRow; r <= range.e.r; r += 1) {
    const roll = normalizeRoll(cellValue(ws, r, rollCol));
    const name = text(cellValue(ws, r, nameCol));
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

  return {
    error: "",
    sheetName,
    headerRow: headerRow + 1,
    dataStartRow: dataStartRow + 1,
    rollCol,
    nameCol,
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
