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
    .replace(/[\u00a0\t\f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stripPageArtifacts = (value) =>
  normalizeSpaces(value)
    .replace(/\b\d+\s*\|\s*Page\b/gi, " ")
    .replace(/\bPage\s*\|?\s*\d+\b/gi, " ")
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

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

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
    if (!startMatch || Number(match.index) < Number(startMatch.index)) startMatch = match;
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
      line.replace(/^\s*(?:Learning|Outcomes|\(CLOs?\)|\(COs?\))\s{2,}/i, "")
    )
    .join("\n");

const parseCourseOutcomes = (text) => {
  const section = cleanCoSection(
    findSection(
      text,
      [
        /Upon\s+completing\s+this\s+course\s*,?\s*students?\s+will\s+be\s+able\s+to\s*:/i,
        /Course\s+Learning\s+Outcomes\s*\(CLOs?\)/i,
        /Course\s+Learning\s+Outcomes\s*\(COs?\)/i,
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
  const regex =
    /\b(?:CLO|CO)\s*(\d+)\s*(?::|\.|-|–|—)\s*([\s\S]*?)(?=\b(?:CLO|CO)\s*\d+\s*(?::|\.|-|–|—)|$)/gi;
  let match;

  while ((match = regex.exec(section))) {
    const code = `CO${Number(match[1])}`;
    let statement = stripPageArtifacts(match[2]);
    statement = statement
      .replace(/^\s*(?:Learning|Outcomes|\(CLOs?\)|\(COs?\))\s+/i, "")
      .replace(/\s+\((?:CLO|CO)s?\)\s*$/i, "")
      .replace(/\bOutcomes\s+(?=terms\b)/i, "")
      .trim();

    if (!statement) continue;
    rows.push({ code, statement, order: rows.length, isActive: true });
  }

  return uniqueBy(rows, (row) => row.code);
};

const parseMappingsFromText = (text, currentSetup = {}) => {
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

    const precedingPoMatches = [...before.matchAll(/\b(?:PLO|PO)\s*(\d+)\b/gi)];
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
  const regex =
    /\b(?:PLO|PO)\s*(\d+)\s*[.:]\s*([\s\S]*?)(?=\b(?:PLO|PO)\s*\d+\s*[.:]|$)/gi;
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

const positionItemsToRows = (items = []) => {
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

      return {
        y: row.y,
        items: ordered,
        text: line.trim(),
      };
    })
    .filter((row) => row.text);
};

const extractPdfDocument = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages = [];
  const textPages = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent({ normalizeWhitespace: true });
    const rows = positionItemsToRows(content.items);
    pages.push({ pageNo, rows });
    textPages.push(rows.map((row) => row.text).join("\n"));
  }

  return {
    text: textPages.join("\n\n"),
    pages,
  };
};

const codeFromToken = (value, type = "co") => {
  const normalized = safeText(value).replace(/[.:]/g, "").toUpperCase();
  const regex = type === "po" ? /^(?:PLO|PO)\s*(\d+)$/ : /^(?:CLO|CO)\s*(\d+)$/;
  const match = normalized.match(regex);
  if (!match) return "";
  return `${type === "po" ? "PO" : "CO"}${Number(match[1])}`;
};

const parseMappingsFromPages = (pages = [], currentSetup = {}) => {
  const mappings = [];

  for (const page of pages || []) {
    const rows = page?.rows || [];
    const headingIndex = rows.findIndex((row) =>
      /\bMapping\s+of\s+(?:CLO|CO)\s*[–—-]\s*(?:PLO|PO)\b/i.test(row.text)
    );
    if (headingIndex < 0) continue;

    let endIndex = rows.findIndex(
      (row, index) =>
        index > headingIndex &&
        /\bCorrelation\s+of\s+(?:CLO|CO)s?\s+to\s+(?:PLO|PO)s?\b/i.test(row.text)
    );
    if (endIndex < 0) endIndex = rows.length;

    const sectionRows = rows.slice(headingIndex + 1, endIndex);
    const poCandidates = [];

    sectionRows.forEach((row) => {
      row.items.forEach((item) => {
        const code = codeFromToken(item.text, "po");
        if (code) poCandidates.push({ code, y: row.y, x: item.x });
      });
    });

    sectionRows.forEach((row) => {
      row.items.forEach((item) => {
        const coCode = codeFromToken(item.text, "co");
        if (!coCode) return;

        const nearestPo = poCandidates
          .map((candidate) => ({
            ...candidate,
            distance: Math.abs(candidate.y - row.y),
          }))
          .filter((candidate) => candidate.distance <= 18)
          .sort((a, b) => a.distance - b.distance)[0];

        if (!nearestPo) return;

        const cfRows = sectionRows
          .map((candidate) => ({
            row: candidate,
            distance: Math.abs(candidate.y - row.y),
          }))
          .filter((candidate) => candidate.distance <= 18)
          .sort((a, b) => a.distance - b.distance);

        let importedStrength = null;
        for (const candidate of cfRows) {
          const match = normalizeSpaces(candidate.row.text).match(/\bCF\s*=?\s*([0-3])\b/i);
          if (match) {
            importedStrength = Number(match[1]);
            break;
          }
        }

        if (importedStrength === 0) return;
        const existingStrength = getExistingMappingStrength(
          currentSetup.mappings,
          coCode,
          nearestPo.code
        );
        const strength = [1, 2, 3].includes(importedStrength)
          ? importedStrength
          : existingStrength || 1;

        mappings.push({
          coCode,
          targetType: "PO",
          targetCode: nearestPo.code,
          strength,
        });
      });
    });
  }

  return uniqueBy(
    mappings,
    (row) => `${row.coCode}__${row.targetType}__${row.targetCode}`
  );
};

const classifyAssessmentRow = (value) => {
  const text = normalizeSpaces(value);
  if (
    /\b(?:Lab\s+)?Mid(?:term|\s*Term)?\s*(?:Lab\s*)?(?:Exam(?:ination)?)\b/i.test(text)
  ) {
    return { assessmentType: "mid", assessmentName: "Mid Term" };
  }

  if (
    /\bFinal\b[\s\S]*\b(?:Exam(?:ination)?|Project(?:\s+Evaluation)?|Evaluation(?:\s*&\s*Report)?)\b/i.test(
      text
    )
  ) {
    return { assessmentType: "final", assessmentName: "Final" };
  }

  return null;
};

const numericCellValue = (value) => {
  const text = safeText(value).replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseCloAssessmentFromPages = (pages = [], courseOutcomes = []) => {
  const blueprints = [];
  const warnings = [];
  const validCoCodes = new Set(
    (courseOutcomes || []).map((row) => safeText(row?.code).toUpperCase()).filter(Boolean)
  );

  for (const page of pages || []) {
    const rows = page?.rows || [];
    const startIndex = rows.findIndex(
      (row) =>
        /\bCLO\s+Assessment\b/i.test(row.text) ||
        /\bCO\s+Assessment\b/i.test(row.text) ||
        /\bAssessment\s+of\s+(?:CLO|CO)s?\b/i.test(row.text)
    );
    if (startIndex < 0) continue;

    let endIndex = rows.findIndex(
      (row, index) => index > startIndex && /\bRubrics\b/i.test(row.text)
    );
    if (endIndex < 0) endIndex = rows.length;

    const sectionRows = rows.slice(startIndex, endIndex);
    const assessmentRows = sectionRows
      .map((row, index) => ({ row, index, type: classifyAssessmentRow(row.text) }))
      .filter((entry) => entry.type);

    if (!assessmentRows.length) continue;

    const firstAssessmentIndex = Math.min(...assessmentRows.map((entry) => entry.index));
    const headerRows = sectionRows.slice(0, firstAssessmentIndex);
    const headerMap = new Map();

    headerRows.forEach((row) => {
      row.items.forEach((item) => {
        const code = codeFromToken(item.text, "co");
        if (!code || headerMap.has(code)) return;
        headerMap.set(code, { code, x: item.x });
      });
    });

    const coHeaders = [...headerMap.values()].sort((a, b) => a.x - b.x);
    if (!coHeaders.length) continue;

    const gaps = [];
    for (let index = 1; index < coHeaders.length; index += 1) {
      gaps.push(coHeaders[index].x - coHeaders[index - 1].x);
    }
    const minGap = gaps.length ? Math.min(...gaps.filter((gap) => gap > 0)) : 60;
    const xTolerance = Math.max(18, Math.min(38, minGap * 0.45));
    const lastHeaderX = coHeaders.at(-1)?.x || 0;

    assessmentRows.forEach(({ row, type }) => {
      const numericItems = row.items
        .map((item) => ({ item, value: numericCellValue(item.text) }))
        .filter((entry) => entry.value !== null);

      if (!numericItems.length) return;

      const allocations = coHeaders.map((header) => {
        const nearest = numericItems
          .map((entry) => ({
            ...entry,
            distance: Math.abs(entry.item.x - header.x),
          }))
          .filter((entry) => entry.distance <= xTolerance)
          .sort((a, b) => a.distance - b.distance)[0];
        return nearest ? Number(nearest.value) : 0;
      });

      const totalCandidates = numericItems
        .filter((entry) => entry.item.x > lastHeaderX + xTolerance)
        .sort((a, b) => b.item.x - a.item.x);
      const explicitTotal = totalCandidates.length ? Number(totalCandidates[0].value) : null;
      const itemTotal = round2(allocations.reduce((sum, marks) => sum + Number(marks || 0), 0));
      const totalMarks = Number.isFinite(explicitTotal) ? round2(explicitTotal) : itemTotal;

      const positiveUnknownCodes = coHeaders
        .map((header, index) => ({ code: header.code, marks: Number(allocations[index] || 0) }))
        .filter((entry) => entry.marks > 0 && validCoCodes.size && !validCoCodes.has(entry.code));

      if (positiveUnknownCodes.length) {
        warnings.push(
          `${type.assessmentName} was not imported because the CLO assessment table uses ${positiveUnknownCodes
            .map((entry) => entry.code)
            .join(", ")}, but those outcomes are not defined in the Course Learning Outcomes section.`
        );
        return;
      }

      if (totalMarks > 0 && Math.abs(totalMarks - itemTotal) > 0.01) {
        warnings.push(
          `${type.assessmentName} was not imported because its CLO allocations add up to ${itemTotal}, while the outline lists ${totalMarks} as the assessment total. Please correct that allocation in the outline or create the blueprint manually.`
        );
        return;
      }

      const items = coHeaders
        .map((header, index) => ({
          marks: round2(allocations[index]),
          coCode: header.code,
        }))
        .filter((entry) => entry.marks > 0 && entry.coCode)
        .map((entry, index) => ({
          key: `q${index + 1}`,
          label: entry.coCode,
          marks: entry.marks,
          coCode: entry.coCode,
          order: index,
        }));

      if (!items.length || totalMarks <= 0) return;

      blueprints.push({
        assessmentName: type.assessmentName,
        assessmentType: type.assessmentType,
        totalMarks,
        notes: "",
        items,
      });
    });
  }

  return {
    blueprints: uniqueBy(blueprints, (row) => row.assessmentType),
    warnings,
  };
};

const parseCloAssessmentFromText = (text, courseOutcomes = []) => {
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

  if (!section) return { blueprints: [], warnings: [] };

  const compact = normalizeSpaces(section);
  const coCodesFromHeader = [];
  [...compact.matchAll(/\bCLO\s*(\d+)\b/gi)].forEach((match) => {
    const code = `CO${Number(match[1])}`;
    if (!coCodesFromHeader.includes(code)) coCodesFromHeader.push(code);
  });

  const coCodes = coCodesFromHeader.length
    ? coCodesFromHeader
    : (courseOutcomes || []).map((row) => safeText(row.code).toUpperCase()).filter(Boolean);

  if (!coCodes.length) return { blueprints: [], warnings: [] };

  const definitions = [
    {
      assessmentType: "mid",
      assessmentName: "Mid Term",
      startRegex: /\b(?:Lab\s+)?Mid(?:term|\s*Term)?\s*(?:Lab\s*)?(?:Exam(?:ination)?)\b/i,
      endRegex: /\bFinal\b[\s\S]*?\b(?:Exam(?:ination)?|Project|Evaluation)\b/i,
    },
    {
      assessmentType: "final",
      assessmentName: "Final",
      startRegex: /\bFinal\b[\s\S]*?\b(?:Exam(?:ination)?|Project(?:\s+Evaluation)?|Evaluation(?:\s*&\s*Report)?)\b/i,
      endRegex: /\bTotal\s+Marks?\b/i,
    },
  ];

  const blueprints = [];
  const warnings = [];

  definitions.forEach((definition) => {
    const startMatch = compact.match(definition.startRegex);
    if (!startMatch) return;

    const tail = compact.slice(Number(startMatch.index || 0) + startMatch[0].length);
    const endMatch = tail.match(definition.endRegex);
    const rowText = endMatch ? tail.slice(0, Number(endMatch.index || 0)) : tail;
    const numbers = (rowText.match(/\b\d+(?:\.\d+)?\b/g) || []).map(Number);

    // Text-only parsing cannot know where blank CLO cells were. Only use it when
    // every CLO cell plus the total is explicitly represented in the extracted text.
    if (numbers.length < coCodes.length + 1) return;

    const allocations = numbers.slice(0, coCodes.length);
    const totalMarks = round2(numbers[coCodes.length]);
    const itemTotal = round2(allocations.reduce((sum, value) => sum + Number(value || 0), 0));

    if (totalMarks > 0 && Math.abs(totalMarks - itemTotal) > 0.01) {
      warnings.push(
        `${definition.assessmentName} was not imported because its CLO allocations add up to ${itemTotal}, while the outline lists ${totalMarks} as the assessment total.`
      );
      return;
    }

    const items = allocations
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
    blueprints.push({
      assessmentName: definition.assessmentName,
      assessmentType: definition.assessmentType,
      totalMarks: totalMarks || itemTotal,
      notes: "",
      items,
    });
  });

  return { blueprints, warnings };
};

export const parseObeCourseOutlinePdf = async (file, currentSetup = {}) => {
  if (!file) throw new Error("Please select a course outline PDF.");
  if (!/\.pdf$/i.test(file.name || "")) {
    throw new Error("Course outline import currently supports PDF files.");
  }

  const extracted = await extractPdfDocument(file);
  const text = extracted.text;
  if (!normalizeSpaces(text)) {
    throw new Error("No readable text was found in this PDF.");
  }

  const courseOutcomes = parseCourseOutcomes(text);
  const spatialMappings = parseMappingsFromPages(extracted.pages, currentSetup);
  const textMappings = spatialMappings.length
    ? []
    : parseMappingsFromText(text, currentSetup);
  const rawMappings = spatialMappings.length ? spatialMappings : textMappings;

  const knownCoCodes = new Set(courseOutcomes.map((row) => safeText(row.code).toUpperCase()));
  const invalidMappingCoCodes = uniqueBy(
    rawMappings
      .filter((row) => knownCoCodes.size && !knownCoCodes.has(safeText(row.coCode).toUpperCase()))
      .map((row) => ({ code: safeText(row.coCode).toUpperCase() })),
    (row) => row.code
  ).map((row) => row.code);

  const mappings = rawMappings.filter(
    (row) => !knownCoCodes.size || knownCoCodes.has(safeText(row.coCode).toUpperCase())
  );
  const poStatements = parseUsedPoStatements(text, mappings, currentSetup);

  const spatialAssessments = parseCloAssessmentFromPages(extracted.pages, courseOutcomes);
  const textAssessments = spatialAssessments.blueprints.length
    ? { blueprints: [], warnings: [] }
    : parseCloAssessmentFromText(text, courseOutcomes);
  const blueprints = spatialAssessments.blueprints.length
    ? spatialAssessments.blueprints
    : textAssessments.blueprints;

  const identity = parseCourseIdentity(text);
  const warnings = [
    ...spatialAssessments.warnings,
    ...textAssessments.warnings,
  ];

  if (!courseOutcomes.length) {
    warnings.push("No CO/CLO statements were detected.");
  }
  if (!mappings.length) {
    warnings.push("No CO-PO mapping rows were detected.");
  }
  if (invalidMappingCoCodes.length) {
    warnings.push(
      `Mapping rows for ${invalidMappingCoCodes.join(", ")} were ignored because those outcomes were not defined in the Course Learning Outcomes section.`
    );
  }
  if (mappings.length && !poStatements.length) {
    warnings.push("Mapped PO statements could not be read from the outline.");
  }
  if (!blueprints.length) {
    warnings.push(
      "No valid Mid/Final CLO assessment allocation could be imported. Blank CLO cells are now handled by their actual table positions; inconsistent allocation totals are left for manual correction instead of causing a 400 error."
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
    warnings: uniqueBy(warnings.map((message) => ({ message })), (row) => row.message).map(
      (row) => row.message
    ),
    detected: {
      ...identity,
      courseOutcomeCount: courseOutcomes.length,
      poCount: poStatements.length,
      mappingCount: mappings.length,
      assessmentCount: blueprints.length,
      usedPoCodes: poStatements.map((row) => row.code),
      mappingParser: spatialMappings.length ? "table-position" : "text-fallback",
      assessmentParser: spatialAssessments.blueprints.length ? "table-position" : "text-fallback",
    },
  };
};
