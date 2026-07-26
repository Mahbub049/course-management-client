import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const DEFAULT_LEVELS = [
  { min: 70, max: 100, level: 4 },
  { min: 60, max: 69.99, level: 3 },
  { min: 50, max: 59.99, level: 2 },
  { min: 40, max: 49.99, level: 1 },
  { min: 0, max: 39.99, level: 0 },
];

const safeText = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

const normalizeSpaces = (value) =>
  safeText(value)
    .replace(/[\u00a0\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stripPageArtifacts = (value) =>
  normalizeSpaces(value)
    .replace(/\b\d+\s*\|\s*Page\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const uniqueBy = (rows = [], keyBuilder) => {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyBuilder(row);
    if (!key || map.has(key)) return;
    map.set(key, row);
  });
  return [...map.values()];
};

const getExistingStatement = (rows = [], code = "") =>
  safeText(
    (Array.isArray(rows) ? rows : []).find(
      (row) => safeText(row?.code).toUpperCase() === safeText(code).toUpperCase()
    )?.statement
  );

const getExistingMappingStrength = (rows = [], coCode = "", targetCode = "") => {
  const found = (Array.isArray(rows) ? rows : []).find(
    (row) =>
      safeText(row?.coCode).toUpperCase() === safeText(coCode).toUpperCase() &&
      safeText(row?.targetCode).toUpperCase() === safeText(targetCode).toUpperCase()
  );
  const numeric = Number(found?.strength);
  return [1, 2, 3].includes(numeric) ? numeric : null;
};

const findSection = (text, startPatterns = [], endPatterns = []) => {
  const source = String(text || "");
  let startMatch = null;

  for (const pattern of startPatterns) {
    const match = source.match(pattern);
    if (!match) continue;
    if (!startMatch || match.index < startMatch.index) startMatch = match;
  }

  if (!startMatch) return "";

  const start = Number(startMatch.index || 0) + startMatch[0].length;
  const rest = source.slice(start);
  let endIndex = rest.length;

  for (const pattern of endPatterns) {
    const match = rest.match(pattern);
    if (match && Number(match.index) < endIndex) endIndex = Number(match.index);
  }

  return rest.slice(0, endIndex);
};

const cleanCoSection = (section) =>
  String(section || "")
    .split(/\r?\n/)
    .map((line) =>
      line.replace(/^\s*(?:Learning|Outcomes|\(CLOs?\))\s{2,}/i, "")
    )
    .join("\n");

const parseCourseOutcomes = (text) => {
  const section = cleanCoSection(
    findSection(
      text,
      [
        /Upon\s+completing\s+this\s+course\s+students\s+will\s+be\s+able\s+to\s*:/i,
        /Course\s+Learning\s+Outcomes\s*\(CLOs?\)/i,
        /Course\s+Outcomes\s*\(COs?\)/i,
      ],
      [
        /\b\d+\s+Mapping\s+of\s+(?:CLO|CO)\s*[–—-]\s*(?:PLO|PO)/i,
        /\bMapping\s+of\s+(?:CLO|CO)\s*[–—-]\s*(?:PLO|PO)/i,
        /\bTeaching[-\s]+Learning\b/i,
      ]
    )
  );

  const rows = [];
  const regex = /\b(?:CLO|CO)\s*(\d+)\s*[:.]\s*([\s\S]*?)(?=\b(?:CLO|CO)\s*\d+\s*[:.]|$)/gi;
  let match;

  while ((match = regex.exec(section))) {
    const code = `CO${Number(match[1])}`;
    let statement = stripPageArtifacts(match[2]);
    statement = statement
      .replace(/^\s*(?:Learning|Outcomes|\(CLOs?\))\s+/i, "")
      .replace(/\s+\(CLOs?\)\s*$/i, "")
      .replace(/\bOutcomes\s+(?=terms\b)/i, "")
      .trim();

    if (!statement) continue;
    rows.push({ code, statement, order: rows.length, isActive: true });
  }

  return uniqueBy(rows, (row) => row.code);
};

const parseMappings = (text, currentSetup = {}) => {
  const mappingText = findSection(
    text,
    [
      /\bMapping\s+of\s+(?:CLO|CO)\s*[–—-]\s*(?:PLO|PO)\b/i,
      /\bMapping\s+of\s+(?:CLO|CO)\s+to\s+(?:PLO|PO)\b/i,
    ],
    [
      /\bCorrelation\s+of\s+(?:CLO|CO)s?\s+to\s+(?:PLO|PO)s?\b/i,
      /\*\s*PPP\s*:/i,
      /\bTeaching[-\s]+Learning\b/i,
    ]
  );

  if (!mappingText) return [];

  const coMatches = [...mappingText.matchAll(/\b(?:CLO|CO)\s*(\d+)\b/gi)];
  const mappings = [];

  coMatches.forEach((coMatch, index) => {
    const coCode = `CO${Number(coMatch[1])}`;
    const position = Number(coMatch.index || 0);
    const nextPosition =
      index + 1 < coMatches.length
        ? Number(coMatches[index + 1].index || mappingText.length)
        : mappingText.length;

    const before = mappingText.slice(Math.max(0, position - 180), position);
    const after = mappingText.slice(position, Math.min(mappingText.length, nextPosition));

    const precedingPoMatches = [
      ...before.matchAll(/\b(?:PLO|PO)\s*(\d+)\b/gi),
    ];
    let poNumber = precedingPoMatches.at(-1)?.[1] || "";

    if (!poNumber) {
      poNumber = after.match(/\b(?:PLO|PO)\s*(\d+)\b/i)?.[1] || "";
    }
    if (!poNumber) return;

    const targetCode = `PO${Number(poNumber)}`;
    const cfMatch =
      after.match(/\bCF\s*=?\s*([0-3])\b/i) ||
      before.slice(-90).match(/\bCF\s*=?\s*([0-3])\b/i);

    const importedStrength = Number(cfMatch?.[1]);
    if (importedStrength === 0) return;

    const existingStrength = getExistingMappingStrength(
      currentSetup.mappings,
      coCode,
      targetCode
    );
    const strength = [1, 2, 3].includes(importedStrength)
      ? importedStrength
      : existingStrength || 1;

    mappings.push({
      coCode,
      targetType: "PO",
      targetCode,
      strength,
    });
  });

  return uniqueBy(
    mappings,
    (row) => `${row.coCode}__${row.targetType}__${row.targetCode}`
  );
};

const parseAllPoStatements = (text) => {
  const section = findSection(
    text,
    [
      /Graduate\s+Attributes\s*\(Program\s+Learning\s+Outcomes\)/i,
      /Program\s+Learning\s+Outcomes\s*\(PLOs?\)/i,
    ],
    [
      /\b\d+\s+Knowledge\s+Profile\s*\(K\)/i,
      /\bKnowledge\s+Profile\s*\(K\)/i,
      /\bRange\s+of\s+Complex\s+Engineering\s+Problem/i,
    ]
  );

  if (!section) return [];

  const rows = [];
  const regex = /\b(?:PLO|PO)\s*(\d+)\s*[.:]\s*([\s\S]*?)(?=\b(?:PLO|PO)\s*\d+\s*[.:]|$)/gi;
  let match;

  while ((match = regex.exec(section))) {
    const code = `PO${Number(match[1])}`;
    const statement = stripPageArtifacts(match[2]);
    if (!statement) continue;
    rows.push({ code, statement, order: rows.length, isActive: true });
  }

  return uniqueBy(rows, (row) => row.code);
};

const parseUsedPoStatements = (text, mappings = [], currentSetup = {}) => {
  const allStatements = parseAllPoStatements(text);
  const statementMap = new Map(allStatements.map((row) => [row.code, row.statement]));
  const usedPoCodes = uniqueBy(
    mappings.map((row) => ({ code: safeText(row.targetCode).toUpperCase() })),
    (row) => row.code
  )
    .map((row) => row.code)
    .filter(Boolean)
    .sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));

  return usedPoCodes.map((code, index) => ({
    code,
    statement:
      statementMap.get(code) ||
      getExistingStatement(currentSetup.poStatements, code) ||
      code,
    order: index,
    isActive: true,
  }));
};

const parseThresholdPercent = (text, currentSetup = {}) => {
  const source = String(text || "");
  const explicit = source.match(
    /(?:equal\s+(?:to\s+)?or\s+more\s+than|at\s+least)\s*(\d+(?:\.\d+)?)\s*%\s+of\s+(?:course\s+)?outcomes/i
  );

  const numeric = Number(explicit?.[1]);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) return numeric;

  const current = Number(currentSetup.thresholdPercent);
  return Number.isFinite(current) ? current : 40;
};

const parseCourseIdentity = (text) => {
  const compact = String(text || "").replace(/[\t\u00a0]+/g, " ");
  const courseCode =
    compact.match(/\bCourse\s+Code\s+([A-Z]{2,6}\s*[- ]?\s*\d{2,4}[A-Z]?)\b/i)?.[1] || "";
  const courseTitle =
    compact.match(/\bCourse\s+Title\s+([^\n\r]+?)(?=\s+\d+\s+Course\s+Type|\n|$)/i)?.[1] || "";

  return {
    courseCode: normalizeSpaces(courseCode),
    courseTitle: normalizeSpaces(courseTitle),
  };
};

const parseCloAssessmentSection = (text, courseOutcomes = []) => {
  const section = findSection(
    text,
    [
      /\bCLO\s+Assessment\s+Criteria\b/i,
      /\bCO\s+Assessment\s+Criteria\b/i,
      /\bAssessment\s+of\s+CLOs?\b/i,
    ],
    [
      /\bRubrics\b/i,
      /\bAttainment\s+Criteria\b/i,
      /\bFeedback\b/i,
      /\bGrading\s+Policy\b/i,
    ]
  );

  if (!section) return [];

  const compact = normalizeSpaces(section);
  const coCodesFromHeader = [];
  [...compact.matchAll(/\bCLO\s*(\d+)\b/gi)].forEach((match) => {
    const code = `CO${Number(match[1])}`;
    if (!coCodesFromHeader.includes(code)) coCodesFromHeader.push(code);
  });

  const coCodes = coCodesFromHeader.length
    ? coCodesFromHeader
    : (courseOutcomes || []).map((row) => safeText(row.code).toUpperCase()).filter(Boolean);

  if (!coCodes.length) return [];

  const readRow = (startRegex, endRegex) => {
    const startMatch = compact.match(startRegex);
    if (!startMatch) return null;

    const tail = compact.slice(Number(startMatch.index || 0) + startMatch[0].length);
    const endMatch = tail.match(endRegex);
    const rowText = endMatch ? tail.slice(0, Number(endMatch.index || 0)) : tail;
    const numbers = (rowText.match(/\b\d+(?:\.\d+)?\b/g) || []).map(Number);

    if (numbers.length < coCodes.length) return null;
    const allocations = numbers.slice(0, coCodes.length);
    const explicitTotal = numbers[coCodes.length];
    const totalMarks = Number.isFinite(explicitTotal)
      ? explicitTotal
      : allocations.reduce((sum, value) => sum + Number(value || 0), 0);

    return { allocations, totalMarks };
  };

  const definitions = [
    {
      assessmentType: "mid",
      assessmentName: "Mid Term",
      startRegex: /\b(?:Lab\s+)?Mid(?:term)?\s+(?:Exam(?:ination)?|Examination)\b/i,
      endRegex: /\b(?:Lab\s+)?Final\s+(?:Exam(?:ination)?|Examination)\b/i,
    },
    {
      assessmentType: "final",
      assessmentName: "Final",
      startRegex: /\b(?:Lab\s+)?Final\s+(?:Exam(?:ination)?|Examination)\b/i,
      endRegex: /\bTotal\s+Mark\b/i,
    },
  ];

  const blueprints = [];
  definitions.forEach((definition) => {
    const parsed = readRow(definition.startRegex, definition.endRegex);
    if (!parsed) return;

    const items = parsed.allocations
      .map((marks, index) => ({ marks: Number(marks || 0), coCode: coCodes[index] }))
      .filter((row) => row.marks > 0 && row.coCode)
      .map((row, index) => ({
        key: `q${index + 1}`,
        label: row.coCode,
        marks: row.marks,
        coCode: row.coCode,
        order: index,
      }));

    if (!items.length) return;

    const itemTotal = items.reduce((sum, item) => sum + Number(item.marks || 0), 0);
    blueprints.push({
      assessmentName: definition.assessmentName,
      assessmentType: definition.assessmentType,
      totalMarks: parsed.totalMarks > 0 ? parsed.totalMarks : itemTotal,
      notes: "",
      items,
    });
  });

  return blueprints;
};

const mergeTextItemsToLines = (items = []) => {
  const rows = [];
  const positioned = (Array.isArray(items) ? items : [])
    .filter((item) => safeText(item?.str))
    .map((item) => ({
      text: safeText(item.str),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
      width: Number(item.width || 0),
      height: Number(item.height || 0),
    }))
    .sort((a, b) => {
      if (Math.abs(b.y - a.y) > 2.4) return b.y - a.y;
      return a.x - b.x;
    });

  positioned.forEach((item) => {
    let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2.4);
    if (!row) {
      row = { y: item.y, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  });

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      const ordered = row.items.sort((a, b) => a.x - b.x);
      let line = "";
      let previousEnd = null;

      ordered.forEach((item) => {
        if (!line) {
          line = item.text;
          previousEnd = item.x + item.width;
          return;
        }

        const gap = previousEnd === null ? 2 : item.x - previousEnd;
        const separator = gap > Math.max(1.5, item.height * 0.12) ? " " : "";
        line += `${separator}${item.text}`;
        previousEnd = item.x + item.width;
      });

      return line.trim();
    })
    .filter(Boolean);
};

const extractPdfText = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent({ normalizeWhitespace: true });
    const lines = mergeTextItemsToLines(content.items);
    pages.push(lines.join("\n"));
  }

  return pages.join("\n\n");
};

export const parseObeCourseOutlinePdf = async (file, currentSetup = {}) => {
  if (!file) throw new Error("Please select a course outline PDF.");
  if (!/\.pdf$/i.test(file.name || "")) {
    throw new Error("Course outline import currently supports PDF files.");
  }

  const text = await extractPdfText(file);
  if (!normalizeSpaces(text)) {
    throw new Error("No readable text was found in this PDF.");
  }

  const courseOutcomes = parseCourseOutcomes(text);
  const mappings = parseMappings(text, currentSetup);
  const poStatements = parseUsedPoStatements(text, mappings, currentSetup);
  const blueprints = parseCloAssessmentSection(text, courseOutcomes);
  const identity = parseCourseIdentity(text);
  const warnings = [];

  if (!courseOutcomes.length) {
    warnings.push("No CO/CLO statements were detected.");
  }
  if (!mappings.length) {
    warnings.push("No CO-PO mapping rows were detected.");
  }
  if (mappings.length && !poStatements.length) {
    warnings.push("Mapped PO statements could not be read from the outline.");
  }
  if (!blueprints.length) {
    warnings.push(
      "No Mid/Final CLO assessment allocation table was detected, so Assessment Blueprint cannot be auto-filled from this outline."
    );
  }

  const setup = courseOutcomes.length
    ? {
        thresholdPercent: parseThresholdPercent(text, currentSetup),
        courseOutcomes,
        poStatements,
        psoStatements: currentSetup.psoStatements || [],
        mappings,
        attainmentLevels:
          currentSetup.attainmentLevels?.length
            ? currentSetup.attainmentLevels
            : DEFAULT_LEVELS,
        notes: currentSetup.notes || "",
        courseReportComment1: currentSetup.courseReportComment1 || "",
        courseReportComment2: currentSetup.courseReportComment2 || "",
        courseReportGeneralComment: currentSetup.courseReportGeneralComment || "",
      }
    : null;

  return {
    sourceType: "course-outline-pdf",
    setup,
    blueprints,
    warnings,
    detected: {
      ...identity,
      courseOutcomeCount: courseOutcomes.length,
      poCount: poStatements.length,
      mappingCount: mappings.length,
      assessmentCount: blueprints.length,
      usedPoCodes: poStatements.map((row) => row.code),
    },
  };
};
