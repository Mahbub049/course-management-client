import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker } from "tesseract.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
  october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/[\u00a0\t\f]+/g, " ")
    .replace(/[–—−]/g, "–")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlElements(root, localName) {
  if (!root?.getElementsByTagName) return [];
  return Array.from(root.getElementsByTagName("*")).filter(
    (node) => node.localName === localName
  );
}

function parseDate(value = "") {
  const original = cleanText(value);
  const text = original.replace(/,\s*(Sun|Mon|Tue|Wed|Thu|Fri|Sat)(day)?\.?$/i, "");
  if (!text) return null;

  let match = text.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return {
        iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        day: DAY_NAMES[date.getUTCDay()],
      };
    }
  }

  match = text.match(/^(\d{1,2})[\s\/-]+([A-Za-z]{3,9}|\d{1,2})[\s\/-]+(20\d{2})$/);
  if (!match) return null;
  const monthToken = String(match[2]).toLowerCase();
  const month = /^\d+$/.test(monthToken) ? Number(monthToken) : MONTHS[monthToken];
  const day = Number(match[1]);
  const year = Number(match[3]);
  if (!month) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return {
    iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    day: DAY_NAMES[date.getUTCDay()],
  };
}

function parseTimeRange(value = "") {
  const text = cleanText(value).replace(/\bTO\b/gi, "–");
  const matches = [...text.matchAll(/(\d{1,2})\s*[:.]\s*(\d{2})\s*(AM|PM)/gi)];
  if (matches.length < 2) return { startTime: "", endTime: "" };
  const format = (match) => `${Number(match[1])}:${match[2]} ${match[3].toUpperCase()}`;
  return { startTime: format(matches[0]), endTime: format(matches[1]) };
}

function timeToMinutes(value = "") {
  const match = cleanText(value)
    .toUpperCase()
    .replace(/\./g, ":")
    .match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 12 || minute > 59) return null;
  if (hour === 12) hour = 0;
  if (match[3] === "PM") hour += 12;
  return hour * 60 + minute;
}

export function classifyDutyEntry(entry = {}) {
  const parsedDate = parseDate(entry.date || entry.dateText);
  const day = parsedDate?.day || cleanText(entry.day) || "";
  if (/^Fri(day)?$/i.test(day) || /^Sat(urday)?$/i.test(day)) return "evening";
  const range = parseTimeRange(entry.time || "");
  const startMinutes = timeToMinutes(entry.startTime || range.startTime || entry.time);
  return startMinutes !== null && startMinutes >= 18 * 60 ? "evening" : "day";
}

function normalizeDuty(row = {}) {
  const parsedDate = parseDate(row.date || row.dateText);
  const range = parseTimeRange(row.time || "");
  const normalized = {
    date: parsedDate?.iso || cleanText(row.date || row.dateText),
    day: parsedDate?.day || cleanText(row.day),
    startTime: cleanText(row.startTime || range.startTime),
    endTime: cleanText(row.endTime || range.endTime),
    time: "",
    program: cleanText(row.program),
    intake: cleanText(row.intake),
    section: cleanText(row.section || row.sec),
    course: cleanText(row.course),
    courseTeacher: cleanText(row.courseTeacher),
    invigilators: cleanText(row.invigilators),
    room: cleanText(row.room),
  };
  normalized.time = normalized.startTime && normalized.endTime
    ? `${normalized.startTime}–${normalized.endTime}`
    : cleanText(row.time);
  normalized.dutyType = classifyDutyEntry(normalized);
  return normalized;
}

function isValidDuty(row) {
  return Boolean(row?.date && (row?.time || row?.startTime));
}

function dedupeDuties(rows = []) {
  const seen = new Set();
  return rows.filter(isValidDuty).filter((row) => {
    const key = [row.date, row.startTime, row.endTime, row.room, row.course]
      .map((part) => cleanText(part).toLowerCase())
      .join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function facultyMatches(invigilators, facultyCode) {
  const code = cleanText(facultyCode).toUpperCase();
  if (!code) return false;
  const tokens = cleanText(invigilators)
    .toUpperCase()
    .split(/[^A-Z0-9_-]+/)
    .filter(Boolean);
  return tokens.includes(code);
}

function filterForFaculty(rows, facultyCode) {
  const code = cleanText(facultyCode);
  if (!code) return { rows, filteredOut: 0, facultyFilterApplied: false };
  const matching = rows.filter((row) => facultyMatches(row.invigilators, code));
  if (!matching.length) {
    return { rows, filteredOut: 0, facultyFilterApplied: false };
  }
  return {
    rows: matching,
    filteredOut: Math.max(0, rows.length - matching.length),
    facultyFilterApplied: true,
  };
}

function normalizedHeader(value = "") {
  return cleanText(value)
    .toLowerCase()
    .replace(/[.#:_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveHeaderIndexes(row = []) {
  const headers = row.map(normalizedHeader);
  const find = (...tests) => headers.findIndex((header) => tests.some((test) => test.test(header)));
  const indexes = {
    date: find(/^date$/, /^exam date$/),
    time: find(/^time$/, /^exam time$/),
    program: find(/^program$/, /^programme$/),
    intake: find(/^intake$/),
    section: find(/^sec$/, /^section$/),
    course: find(/^course$/, /^course code$/),
    courseTeacher: find(/^course teacher$/, /^teacher$/, /^course faculty$/),
    invigilators: find(/^invigilators?$/, /^invigilation$/),
    room: find(/^room$/, /^room no/, /^venue$/),
  };
  return indexes.date >= 0 && indexes.time >= 0 ? indexes : null;
}

function rowFromCells(cells, indexes) {
  const pick = (key) => indexes[key] >= 0 ? cells[indexes[key]] || "" : "";
  return normalizeDuty({
    date: pick("date"),
    time: pick("time"),
    program: pick("program"),
    intake: pick("intake"),
    section: pick("section"),
    course: pick("course"),
    courseTeacher: pick("courseTeacher"),
    invigilators: pick("invigilators"),
    room: pick("room"),
  });
}

function docxCellText(cell) {
  const paragraphs = xmlElements(cell, "p");
  if (!paragraphs.length) {
    return cleanText(xmlElements(cell, "t").map((node) => node.textContent || "").join(" "));
  }
  return cleanText(
    paragraphs
      .map((paragraph) => xmlElements(paragraph, "t").map((node) => node.textContent || "").join(" "))
      .filter(Boolean)
      .join(" ")
  );
}

async function extractDocxRows(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) throw new Error("The DOCX does not contain a readable Word document.");
  const xml = new DOMParser().parseFromString(documentXml, "application/xml");
  const tables = xmlElements(xml, "tbl");
  const duties = [];

  tables.forEach((table) => {
    const tableRows = xmlElements(table, "tr").map((row) =>
      xmlElements(row, "tc").map(docxCellText)
    );
    const headerPosition = tableRows.findIndex((row) => resolveHeaderIndexes(row));
    if (headerPosition < 0) return;
    const indexes = resolveHeaderIndexes(tableRows[headerPosition]);
    tableRows.slice(headerPosition + 1).forEach((cells) => {
      const duty = rowFromCells(cells, indexes);
      if (isValidDuty(duty)) duties.push(duty);
    });
  });

  if (!duties.length) {
    throw new Error("No Date/Time duty table could be detected in the DOCX.");
  }
  return duties;
}

function geometryLineGroups(words = [], tolerance = 6) {
  const sorted = [...words].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const groups = [];
  sorted.forEach((word) => {
    let group = groups.find((candidate) => Math.abs(candidate.y - word.y) <= tolerance);
    if (!group) {
      group = { y: word.y, words: [] };
      groups.push(group);
    }
    group.words.push(word);
    group.y = group.words.reduce((sum, item) => sum + item.y, 0) / group.words.length;
  });
  return groups.sort((a, b) => a.y - b.y).map((group) => ({
    ...group,
    words: group.words.sort((a, b) => a.x - b.x),
  }));
}

function headerAnchors(words = []) {
  const candidates = words.filter((word) => word.y < Math.max(...words.map((item) => item.y), 1) * 0.45);
  const byText = (regex) => candidates.filter((word) => regex.test(cleanText(word.text).toLowerCase()));
  const first = (regex) => byText(regex).sort((a, b) => a.x - b.x)[0];
  const last = (regex) => byText(regex).sort((a, b) => b.x - a.x)[0];
  const date = first(/^date$/);
  const time = first(/^time$/);
  const program = first(/^program(me)?$/);
  const intake = first(/^intake$/);
  const section = first(/^sec\.?$|^section$/);
  const invigilators = first(/^invigilators?$/);
  const room = first(/^room$/);
  const teacher = first(/^teacher$/);
  const courseWords = byText(/^course$/).sort((a, b) => a.x - b.x);
  const course = courseWords.find((word) => !teacher || word.x < teacher.x) || courseWords[0];
  const courseTeacher = teacher || (courseWords.length > 1 ? courseWords.at(-1) : null);
  const anchors = { date, time, program, intake, section, course, courseTeacher, invigilators, room };
  const ordered = Object.entries(anchors)
    .filter(([, word]) => word)
    .sort((a, b) => a[1].x - b[1].x);
  if (!date || !time || ordered.length < 6) return null;
  return { anchors, ordered };
}

function assignmentForX(x, ordered) {
  if (!ordered.length) return null;
  for (let index = 0; index < ordered.length; index += 1) {
    const left = index === 0 ? -Infinity : (ordered[index - 1][1].x + ordered[index][1].x) / 2;
    const right = index === ordered.length - 1 ? Infinity : (ordered[index][1].x + ordered[index + 1][1].x) / 2;
    if (x >= left && x < right) return ordered[index][0];
  }
  return ordered.at(-1)[0];
}

function geometryRows(words = []) {
  if (!words.length) return [];
  const header = headerAnchors(words);
  if (!header) return [];
  const headerY = Math.max(...Object.values(header.anchors).filter(Boolean).map((word) => word.y));
  const groups = geometryLineGroups(words).filter((group) => group.y > headerY + 4);
  const logicalLines = groups.map((group) => {
    const cells = {};
    group.words.forEach((word) => {
      const key = assignmentForX(word.x, header.ordered);
      if (!key) return;
      cells[key] = cleanText(`${cells[key] || ""} ${word.text}`);
    });
    return { y: group.y, cells };
  });

  const rowBlocks = [];
  logicalLines.forEach((line) => {
    const isStart = /\b\d{1,2}\s+[A-Za-z]{3,9}\s+20\d{2}\b|\b20\d{2}-\d{1,2}-\d{1,2}\b/.test(
      line.cells.date || ""
    );
    if (isStart || !rowBlocks.length) {
      if (isStart) rowBlocks.push({ ...line.cells });
      return;
    }
    const current = rowBlocks.at(-1);
    Object.entries(line.cells).forEach(([key, value]) => {
      current[key] = cleanText(`${current[key] || ""} ${value}`);
    });
  });

  return rowBlocks.map(normalizeDuty).filter(isValidDuty);
}

function nativePdfWords(textContent, viewport) {
  return (textContent?.items || [])
    .map((item) => {
      const text = cleanText(item?.str);
      if (!text || !Array.isArray(item?.transform)) return null;
      const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const x = transform[4] + Math.max(0, Number(item.width || 0) * viewport.scale) / 2;
      const y = viewport.height - transform[5];
      return { text, x, y };
    })
    .filter(Boolean);
}

async function renderPdfPage(page, scale = 2.25) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return { canvas, viewport };
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not prepare the PDF page for OCR."))),
      "image/png",
      1
    );
  });
}

function flattenOcrWords(data = {}) {
  const words = [];
  const add = (word) => {
    const text = cleanText(word?.text);
    const bbox = word?.bbox;
    if (!text || !bbox) return;
    words.push({
      text,
      x: (Number(bbox.x0) + Number(bbox.x1)) / 2,
      y: (Number(bbox.y0) + Number(bbox.y1)) / 2,
    });
  };
  (data?.blocks || []).forEach((block) =>
    (block?.paragraphs || []).forEach((paragraph) =>
      (paragraph?.lines || []).forEach((line) =>
        (line?.words || []).forEach(add)
      )
    )
  );
  if (!words.length) (data?.words || []).forEach(add);
  return words;
}

async function extractPdfRows(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const nativeRows = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    onProgress?.(`Reading PDF page ${pageNo} of ${pdf.numPages}…`);
    const page = await pdf.getPage(pageNo);
    const viewport = page.getViewport({ scale: 1.6 });
    const textContent = await page.getTextContent({ normalizeWhitespace: true }).catch(() => ({ items: [] }));
    nativeRows.push(...geometryRows(nativePdfWords(textContent, viewport)));
  }
  if (nativeRows.length) return { rows: dedupeDuties(nativeRows), usedOcr: false };

  let worker = null;
  const ocrRows = [];
  try {
    worker = await createWorker("eng");
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      onProgress?.(`OCR reading page ${pageNo} of ${pdf.numPages}…`);
      const page = await pdf.getPage(pageNo);
      const { canvas } = await renderPdfPage(page);
      const blob = await canvasToBlob(canvas);
      const result = await worker.recognize(blob, {}, { blocks: true });
      ocrRows.push(...geometryRows(flattenOcrWords(result?.data || {})));
    }
  } finally {
    if (worker) await worker.terminate();
  }
  return { rows: dedupeDuties(ocrRows), usedOcr: true };
}

export function suggestSemesterFromText(value = "") {
  const match = cleanText(value).match(/\b(Spring|Summer|Fall)\s+(20\d{2})\b/i);
  if (!match) return "";
  return `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${match[2]}`;
}

export async function extractDutyDocument(file, { facultyCode = "", onProgress } = {}) {
  if (!file) throw new Error("Choose a DOCX or PDF duty list first.");
  const isDocx = /\.docx$/i.test(file.name || "") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isPdf = /\.pdf$/i.test(file.name || "") || file.type === "application/pdf";
  if (!isDocx && !isPdf) throw new Error("Only DOCX and PDF duty lists are supported.");

  onProgress?.(isDocx ? "Reading the DOCX duty table…" : "Reading the PDF duty table…");
  const extracted = isDocx
    ? { rows: dedupeDuties(await extractDocxRows(file)), usedOcr: false }
    : await extractPdfRows(file, onProgress);

  if (!extracted.rows.length) {
    throw new Error("The file was read, but no valid duty rows could be detected. Please use a clearer table or edit the source file and try again.");
  }
  const filtered = filterForFaculty(extracted.rows, facultyCode);
  return {
    duties: filtered.rows.map((row) => ({ ...row, dutyType: classifyDutyEntry(row) })),
    detectedRows: extracted.rows.length,
    filteredOut: filtered.filteredOut,
    facultyFilterApplied: filtered.facultyFilterApplied,
    usedOcr: extracted.usedOcr,
    suggestedSemester: suggestSemesterFromText(file.name),
  };
}
