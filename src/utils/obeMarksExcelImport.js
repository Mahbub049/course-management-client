import * as XLSX from "xlsx";

const cleanText = (value) =>
  value === null || value === undefined
    ? ""
    : String(value).replace(/\s+/g, " ").trim();

export const normalizeObeImportLabel = (value) =>
  cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bexamination\b/g, " exam ")
    .replace(/\bterm\b/g, " ")
    .replace(/\bclass\s*test\b/g, " ct ")
    .replace(/\bquiz\b/g, " ct ")
    .replace(/\bclo\b/g, " co ")
    .replace(/\bplo\b/g, " po ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeRoll = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return cleanText(value).replace(/\.0+$/, "");
};

const cellValue = (sheet, row, col) => {
  const cell = sheet?.[XLSX.utils.encode_cell({ r: row, c: col })];
  if (!cell) return null;
  if (cell.t === "s" || cell.t === "str") return cleanText(cell.v);
  return cell.v ?? null;
};

const looksLikeRollHeader = (value) => {
  const normalized = normalizeObeImportLabel(value);
  return [
    "roll",
    "id",
    "id no",
    "student id",
    "student roll",
    "roll no",
    "roll number",
    "student id no",
  ].includes(normalized) || normalized.includes("id no");
};

const looksLikeNameHeader = (value) => {
  const normalized = normalizeObeImportLabel(value);
  return [
    "name",
    "student",
    "student name",
    "name of student",
    "name of students",
  ].includes(normalized) || normalized.includes("name of student");
};

const findStudentHeader = (sheet) => {
  const range = XLSX.utils.decode_range(sheet?.["!ref"] || "A1:A1");
  const lastRow = Math.min(range.e.r, 15);

  for (let row = range.s.r; row <= lastRow; row += 1) {
    let rollCol = -1;
    let nameCol = -1;

    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const value = cleanText(cellValue(sheet, row, col));
      if (rollCol < 0 && looksLikeRollHeader(value)) rollCol = col;
      if (nameCol < 0 && looksLikeNameHeader(value)) nameCol = col;
    }

    if (rollCol >= 0 && nameCol >= 0) {
      return { headerRow: row, rollCol, nameCol };
    }
  }

  return null;
};

const expandMergedHeaderRows = (sheet, rowCount) => {
  const range = XLSX.utils.decode_range(sheet?.["!ref"] || "A1:A1");
  const count = Math.min(Math.max(1, rowCount), range.e.r + 1);
  const matrix = Array.from({ length: count }, () =>
    Array.from({ length: range.e.c + 1 }, () => "")
  );

  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col <= range.e.c; col += 1) {
      matrix[row][col] = cleanText(cellValue(sheet, row, col));
    }
  }

  (sheet?.["!merges"] || []).forEach((merge) => {
    if (merge.s.r >= count) return;
    const value = cleanText(cellValue(sheet, merge.s.r, merge.s.c));
    if (!value) return;

    const lastMergeRow = Math.min(merge.e.r, count - 1);
    for (let row = merge.s.r; row <= lastMergeRow; row += 1) {
      for (let col = merge.s.c; col <= merge.e.c && col <= range.e.c; col += 1) {
        matrix[row][col] = value;
      }
    }
  });

  return matrix;
};

const extractOutcomeCode = (value) => {
  const match = cleanText(value).match(/\b(?:CLO|CO)\s*[-_ ]?0*(\d{1,2})\b/i);
  return match ? `CO${Number(match[1])}` : "";
};

const extractPoCode = (value) => {
  const match = cleanText(value).match(/\b(?:PLO|PO)\s*[-_ ]?0*(\d{1,2})\b/i);
  return match ? `PO${Number(match[1])}` : "";
};

const extractFullMarks = (...labels) => {
  for (const label of labels) {
    const raw = cleanText(label);
    const matches = [...raw.matchAll(/\((\d+(?:\.\d+)?)\)/g)];
    if (!matches.length) continue;
    const numeric = Number(matches[matches.length - 1][1]);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
};

const stripMarks = (value) =>
  cleanText(value)
    .replace(/\s*\(\s*\d+(?:\.\d+)?\s*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const classifyObeAssessment = (value, { courseType = "theory" } = {}) => {
  const normalized = normalizeObeImportLabel(value);

  if (/\btotal\s*100\b/.test(normalized) || normalized === "total") return "grand_total";
  if (/\battendance\b|\batt\b/.test(normalized)) return "attendance";
  if (/\bassignment\b|\bassign\b/.test(normalized)) return "assignment";
  if (/\bfinal\b/.test(normalized)) return "final";
  if (/\bmid\b/.test(normalized)) return "mid";
  if (/\bct\b|\bclass test\b|\bquiz\b/.test(normalized)) return "ct";
  if (/\blab\s*(evaluation|assessment|performance)\b|\bcontinuous\s*lab\b/.test(normalized)) {
    return courseType === "lab" ? "unsupported" : "assignment";
  }
  if (/\bproject\b|\bpresentation\b|\bviva\b/.test(normalized)) {
    return courseType === "lab" ? "unsupported" : "assignment";
  }

  return "other";
};

const hasUsefulSecondaryHeader = (sheet, headerRow, rollCol, nameCol) => {
  const range = XLSX.utils.decode_range(sheet?.["!ref"] || "A1:A1");
  if (headerRow + 1 > range.e.r) return false;

  let checked = 0;
  let useful = 0;
  for (let col = range.s.c; col <= range.e.c; col += 1) {
    if (col === rollCol || col === nameCol) continue;
    const value = cleanText(cellValue(sheet, headerRow + 1, col));
    if (!value) continue;
    checked += 1;
    if (
      extractOutcomeCode(value) ||
      extractPoCode(value) ||
      /^total$/i.test(value) ||
      /^q\d+[a-z]?$/i.test(value)
    ) {
      useful += 1;
    }
  }

  return checked > 0 && useful / checked >= 0.45;
};

const isTruthyMappingCell = (value) => {
  if (value === true || value === 1) return true;
  const normalized = cleanText(value).toLowerCase();
  return ["1", "x", "yes", "y", "true", "checked", "✓", "✔"].includes(normalized);
};

const addUniqueMapping = (list, mapping) => {
  if (!mapping.coCode || !mapping.poCode) return;
  if (
    list.some(
      (row) => row.coCode === mapping.coCode && row.poCode === mapping.poCode
    )
  ) {
    return;
  }
  list.push(mapping);
};

const scanMetadata = (workbook) => {
  const coStatements = {};
  const poStatements = {};
  const coPoMappings = [];
  const coCodes = new Set();
  const poCodes = new Set();

  (workbook?.SheetNames || []).forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.["!ref"]) return;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const lastRow = Math.min(range.e.r, 160);
    const lastCol = Math.min(range.e.c, 40);

    for (let row = range.s.r; row <= lastRow; row += 1) {
      for (let col = range.s.c; col <= lastCol; col += 1) {
        const raw = cleanText(cellValue(sheet, row, col));
        if (!raw) continue;

        const coCode = extractOutcomeCode(raw);
        const poCode = extractPoCode(raw);
        if (coCode) coCodes.add(coCode);
        if (poCode) poCodes.add(poCode);

        const directMatches = [
          ...raw.matchAll(
            /\b(?:CLO|CO)\s*[-_ ]?0*(\d{1,2})\b[^\n\r]{0,35}?\b(?:PLO|PO)\s*[-_ ]?0*(\d{1,2})\b/gi
          ),
        ];
        directMatches.forEach((match) => {
          const mappedCo = `CO${Number(match[1])}`;
          const mappedPo = `PO${Number(match[2])}`;
          coCodes.add(mappedCo);
          poCodes.add(mappedPo);
          addUniqueMapping(coPoMappings, { coCode: mappedCo, poCode: mappedPo });
        });

        const reverseMatches = [
          ...raw.matchAll(
            /\b(?:PLO|PO)\s*[-_ ]?0*(\d{1,2})\b[^\n\r]{0,35}?\b(?:CLO|CO)\s*[-_ ]?0*(\d{1,2})\b/gi
          ),
        ];
        reverseMatches.forEach((match) => {
          const mappedPo = `PO${Number(match[1])}`;
          const mappedCo = `CO${Number(match[2])}`;
          coCodes.add(mappedCo);
          poCodes.add(mappedPo);
          addUniqueMapping(coPoMappings, { coCode: mappedCo, poCode: mappedPo });
        });

        const coStatementMatch = raw.match(
          /^\s*(?:CLO|CO)\s*[-_ ]?0*(\d{1,2})\s*[:.\-–—]\s*(.{4,})$/i
        );
        if (coStatementMatch) {
          const code = `CO${Number(coStatementMatch[1])}`;
          coCodes.add(code);
          coStatements[code] = cleanText(coStatementMatch[2]);
        }

        const poStatementMatch = raw.match(
          /^\s*(?:PLO|PO)\s*[-_ ]?0*(\d{1,2})\s*[:.\-–—]\s*(.{4,})$/i
        );
        if (poStatementMatch) {
          const code = `PO${Number(poStatementMatch[1])}`;
          poCodes.add(code);
          poStatements[code] = cleanText(poStatementMatch[2]);
        }

        if (/^(?:CLO|CO)\s*[-_ ]?0*\d{1,2}$/i.test(raw) && col + 1 <= lastCol) {
          const next = cleanText(cellValue(sheet, row, col + 1));
          const code = extractOutcomeCode(raw);
          if (code && next && !extractPoCode(next) && next.length >= 4) {
            coStatements[code] = next;
          }
        }
        if (/^(?:PLO|PO)\s*[-_ ]?0*\d{1,2}$/i.test(raw) && col + 1 <= lastCol) {
          const next = cleanText(cellValue(sheet, row, col + 1));
          const code = extractPoCode(raw);
          if (code && next && !extractOutcomeCode(next) && next.length >= 4) {
            poStatements[code] = next;
          }
        }
      }
    }

    // Also support a common CO x PO matrix: CO codes down the first columns,
    // PO codes across a header row, and X/1/Yes values at intersections.
    for (let headerRow = range.s.r; headerRow <= Math.min(lastRow, range.s.r + 25); headerRow += 1) {
      const poByColumn = new Map();
      for (let col = range.s.c; col <= lastCol; col += 1) {
        const code = extractPoCode(cellValue(sheet, headerRow, col));
        if (code) poByColumn.set(col, code);
      }
      if (!poByColumn.size) continue;

      for (let row = headerRow + 1; row <= Math.min(lastRow, headerRow + 30); row += 1) {
        let rowCo = "";
        for (let col = range.s.c; col <= Math.min(lastCol, range.s.c + 4); col += 1) {
          rowCo = extractOutcomeCode(cellValue(sheet, row, col));
          if (rowCo) break;
        }
        if (!rowCo) continue;
        coCodes.add(rowCo);
        poByColumn.forEach((poCode, col) => {
          if (isTruthyMappingCell(cellValue(sheet, row, col))) {
            poCodes.add(poCode);
            addUniqueMapping(coPoMappings, { coCode: rowCo, poCode });
          }
        });
      }
    }
  });

  return {
    coCodes: [...coCodes].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2))),
    poCodes: [...poCodes].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2))),
    coStatements,
    poStatements,
    coPoMappings,
  };
};

const getAssessmentDisplayName = (parentHeader, type, courseType) => {
  const cleaned = stripMarks(parentHeader);
  if (cleaned) return cleaned;
  if (type === "mid") return courseType === "lab" ? "Lab Mid" : "Mid Term";
  if (type === "final") return courseType === "lab" ? "Lab Final" : "Final";
  if (type === "ct") return "Class Test";
  if (type === "assignment") return "Assignment";
  if (type === "attendance") return "Attendance";
  return "Assessment";
};

const isDetailedColumn = (column) =>
  !!column.coCode || !!column.poCode || (!!column.childHeader && !column.isTotalColumn);

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const roundToHalf = (value) => Math.ceil((Number(value) || 0) * 2) / 2;

export const parseObeMarksWorkbook = (buffer) => {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    cellText: true,
    raw: true,
    cellFormula: true,
  });

  return {
    workbook,
    sheetNames: [...(workbook.SheetNames || [])],
    metadata: scanMetadata(workbook),
  };
};

export const chooseDefaultObeMarksSheet = (sheetNames = [], course = {}) => {
  const courseCode = normalizeObeImportLabel(course?.code || "").replace(/\s+/g, "");
  if (courseCode) {
    const exact = sheetNames.find(
      (name) => normalizeObeImportLabel(name).replace(/\s+/g, "") === courseCode
    );
    if (exact) return exact;

    const contains = sheetNames.find((name) =>
      normalizeObeImportLabel(name).replace(/\s+/g, "").includes(courseCode)
    );
    if (contains) return contains;
  }
  return sheetNames[0] || "";
};

export const analyzeObeMarksSheet = (
  workbook,
  sheetName,
  { courseType = "theory", metadata = null } = {}
) => {
  const sheet = workbook?.Sheets?.[sheetName];
  if (!sheet) {
    return { error: "Worksheet not found.", rows: [], columns: [], groups: [] };
  }

  const header = findStudentHeader(sheet);
  if (!header) {
    return {
      error: "Could not detect the student Roll/ID and Name columns in this worksheet.",
      rows: [],
      columns: [],
      groups: [],
    };
  }

  const { headerRow, rollCol, nameCol } = header;
  const hasSecondaryHeader = hasUsefulSecondaryHeader(
    sheet,
    headerRow,
    rollCol,
    nameCol
  );
  const dataStartRow = headerRow + (hasSecondaryHeader ? 2 : 1);
  const range = XLSX.utils.decode_range(sheet?.["!ref"] || "A1:A1");
  const expandedHeaders = expandMergedHeaderRows(sheet, headerRow + 2);
  const columns = [];
  let carriedParent = "";

  for (let col = range.s.c; col <= range.e.c; col += 1) {
    if (col === rollCol || col === nameCol) continue;

    let parentHeader =
      cleanText(expandedHeaders?.[headerRow]?.[col]) ||
      cleanText(cellValue(sheet, headerRow, col));
    const childHeader = hasSecondaryHeader
      ? cleanText(cellValue(sheet, headerRow + 1, col))
      : "";

    if (parentHeader) carriedParent = parentHeader;
    else if (hasSecondaryHeader && childHeader && carriedParent) parentHeader = carriedParent;

    if (!parentHeader && !childHeader) continue;

    const sourceLabel = childHeader
      ? `${parentHeader || childHeader} / ${childHeader}`
      : parentHeader;
    const assessmentType = classifyObeAssessment(parentHeader || sourceLabel, {
      courseType,
    });
    const assessmentTotal = extractFullMarks(parentHeader);
    const itemMax = extractFullMarks(childHeader);
    const coCode = extractOutcomeCode(childHeader || sourceLabel);
    const poCode = extractPoCode(childHeader || sourceLabel);
    const isTotalColumn = /^\s*total\s*$/i.test(childHeader) ||
      (!childHeader && /^\s*total(?:\s*\(\s*\d+(?:\.\d+)?\s*\))?\s*$/i.test(parentHeader));

    columns.push({
      key: `col_${col}`,
      index: col,
      parentHeader,
      childHeader,
      sourceLabel,
      assessmentName: getAssessmentDisplayName(parentHeader, assessmentType, courseType),
      assessmentKey: `${assessmentType}__${normalizeObeImportLabel(parentHeader) || col}`,
      assessmentType,
      assessmentTotal,
      itemMax,
      coCode,
      poCode,
      isTotalColumn,
      observedMax: 0,
      suggestedMaxMarks: itemMax,
    });
  }

  const rows = [];
  const duplicateRolls = [];
  const seenRolls = new Set();
  for (let row = dataStartRow; row <= range.e.r; row += 1) {
    const roll = normalizeRoll(cellValue(sheet, row, rollCol));
    const name = cleanText(cellValue(sheet, row, nameCol));
    if (!roll && !name) continue;
    if (!roll) continue;
    if (seenRolls.has(roll)) {
      duplicateRolls.push(roll);
      continue;
    }
    seenRolls.add(roll);

    const values = {};
    columns.forEach((column) => {
      values[column.key] = cellValue(sheet, row, column.index);
      const raw = values[column.key];
      const numeric = Number(raw);
      if (raw !== "" && raw !== null && raw !== undefined && Number.isFinite(numeric) && numeric >= 0) {
        column.observedMax = Math.max(column.observedMax, numeric);
      }
    });

    rows.push({ rowNumber: row + 1, roll, name, values });
  }

  const grouped = new Map();
  columns.forEach((column) => {
    if (!grouped.has(column.assessmentKey)) {
      grouped.set(column.assessmentKey, {
        key: column.assessmentKey,
        assessmentName: column.assessmentName,
        assessmentType: column.assessmentType,
        totalMarks: column.assessmentTotal,
        columns: [],
      });
    }
    grouped.get(column.assessmentKey).columns.push(column);
  });

  const groups = [...grouped.values()];
  groups.forEach((group) => {
    const detailed = group.columns.filter((column) => isDetailedColumn(column) && !column.isTotalColumn);
    const chosen = detailed.length
      ? detailed
      : group.columns.filter((column) => !column.isTotalColumn || group.columns.length === 1);

    group.columns.forEach((column) => {
      column.recommended = chosen.some((row) => row.key === column.key);
    });

    const unresolved = chosen.filter((column) => !Number.isFinite(Number(column.itemMax)) || Number(column.itemMax) <= 0);
    if (unresolved.length) {
      const total = Number(group.totalMarks || 0);
      const equalSplit = total > 0 ? total / chosen.length : 0;
      const cleanEqualSplit = equalSplit > 0 && Math.abs(equalSplit * 2 - Math.round(equalSplit * 2)) < 0.0001
        ? round2(equalSplit)
        : 0;

      unresolved.forEach((column) => {
        if (cleanEqualSplit) {
          column.suggestedMaxMarks = cleanEqualSplit;
        } else if (column.observedMax > 0) {
          column.suggestedMaxMarks = roundToHalf(column.observedMax);
        } else {
          column.suggestedMaxMarks = null;
        }
      });
    }
  });

  const hasDetailedCtGroups = groups.some(
    (group) =>
      group.assessmentType === "ct" &&
      !/\b(best|average|avg)\b/i.test(group.assessmentName) &&
      group.columns.some((column) => column.recommended && column.coCode)
  );
  if (hasDetailedCtGroups) {
    groups.forEach((group) => {
      if (
        group.assessmentType === "ct" &&
        /\b(best|average|avg)\b/i.test(group.assessmentName)
      ) {
        group.columns.forEach((column) => {
          column.recommended = false;
        });
      }
    });
  }

  const selectedColumns = groups.flatMap((group) =>
    group.columns.filter((column) => column.recommended)
  );

  const detectedCoCodes = new Set(metadata?.coCodes || []);
  const detectedPoCodes = new Set(metadata?.poCodes || []);
  selectedColumns.forEach((column) => {
    if (column.coCode) detectedCoCodes.add(column.coCode);
    if (column.poCode) detectedPoCodes.add(column.poCode);
  });

  return {
    error: "",
    sheetName,
    headerRow: headerRow + 1,
    dataStartRow: dataStartRow + 1,
    rollCol,
    nameCol,
    rows,
    columns,
    groups,
    selectedColumns,
    duplicateRolls,
    metadata: metadata || scanMetadata(workbook),
    detectedCoCodes: [...detectedCoCodes].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2))),
    detectedPoCodes: [...detectedPoCodes].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2))),
  };
};

const normalizeBlueprintName = (value) =>
  normalizeObeImportLabel(stripMarks(value));

export const findMatchingBlueprintForGroup = (group, blueprints = []) => {
  const eligible = (Array.isArray(blueprints) ? blueprints : []).filter(
    (blueprint) => String(blueprint?.assessmentType || "").toLowerCase() === group.assessmentType
  );
  if (!eligible.length) return null;

  const groupName = normalizeBlueprintName(group.assessmentName);
  const exact = eligible.find(
    (blueprint) => normalizeBlueprintName(blueprint.assessmentName) === groupName
  );
  if (exact) return exact;

  const containing = eligible.find((blueprint) => {
    const name = normalizeBlueprintName(blueprint.assessmentName);
    return name && groupName && (name.includes(groupName) || groupName.includes(name));
  });
  if (containing) return containing;

  return eligible.length === 1 ? eligible[0] : null;
};

export const suggestBlueprintItemForColumn = (column, blueprint) => {
  const items = Array.isArray(blueprint?.items) ? blueprint.items : [];
  if (!items.length) return null;

  const sourceLabel = normalizeObeImportLabel(column.childHeader || column.sourceLabel);
  const coCode = String(column.coCode || "").toUpperCase();
  let best = null;
  let bestScore = -1;
  let secondScore = -1;

  items.forEach((item) => {
    let score = 0;
    const itemLabel = normalizeObeImportLabel(item.label);
    const itemCo = String(item.coCode || "").toUpperCase();

    if (coCode && itemCo === coCode) score += 60;
    if (sourceLabel && itemLabel && sourceLabel === itemLabel) score += 45;
    else if (
      sourceLabel &&
      itemLabel &&
      (sourceLabel.includes(itemLabel) || itemLabel.includes(sourceLabel))
    ) {
      score += 25;
    }

    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      best = item;
    } else if (score > secondScore) {
      secondScore = score;
    }
  });

  if (bestScore < 25) return null;
  if (secondScore >= 0 && bestScore - secondScore < 15) return null;
  return best;
};

export const normalizeImportedMarkValue = (value) => {
  if (value === null || value === undefined || cleanText(value) === "") {
    return { kind: "blank", value: null };
  }
  if (cleanText(value).toUpperCase() === "A") {
    return { kind: "number", value: 0, absent: true };
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return { kind: "invalid", value: null };
  return { kind: "number", value: round2(numeric) };
};
