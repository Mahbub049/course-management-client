import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker } from "tesseract.js";
import {
  OFFICIAL_DAYS,
  OFFICIAL_TIME_SLOTS,
  SLOT_MAP,
  courseKey,
} from "./routineConfig";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const DAY_IDS = OFFICIAL_DAYS.map((item) => item.id);
const DAY_FROM_TEXT = {
  SAT: "Sat",
  SATURDAY: "Sat",
  SUN: "Sun",
  SUNDAY: "Sun",
  MON: "Mon",
  MONDAY: "Mon",
  TUE: "Tue",
  TUES: "Tue",
  TUESDAY: "Tue",
  WED: "Wed",
  WEDNESDAY: "Wed",
  THU: "Thu",
  THUR: "Thu",
  THURS: "Thu",
  THURSDAY: "Thu",
  FRI: "Fri",
  FRIDAY: "Fri",
};

const SLOT_BY_MINUTES = new Map(
  OFFICIAL_TIME_SLOTS.map((slot) => [
    `${timeToMinutes(slot.start)}-${timeToMinutes(slot.end)}`,
    slot,
  ])
);

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/[\u00a0\t\f]+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalCourseCode(value = "") {
  return cleanText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeDigits(value = "") {
  return String(value)
    .toUpperCase()
    .replace(/[OQD]/g, "0")
    .replace(/[IL|]/g, "1")
    .replace(/Z/g, "2")
    .replace(/S/g, "5")
    .replace(/G/g, "6")
    .replace(/B/g, "8")
    .replace(/[^0-9]/g, "");
}

function timeToMinutes(value = "") {
  const match = cleanText(value).match(/(\d{1,2})\s*[:.]\s*(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3].toUpperCase();
  if (hour === 12) hour = 0;
  if (meridiem === "PM") hour += 12;
  return hour * 60 + minute;
}

function closestOfficialSlot(startMinutes, endMinutes, tolerance = 8) {
  const exact = SLOT_BY_MINUTES.get(`${startMinutes}-${endMinutes}`);
  if (exact) return exact;
  let closest = null;
  let bestDistance = Infinity;
  OFFICIAL_TIME_SLOTS.forEach((slot) => {
    const slotStart = timeToMinutes(slot.start);
    const slotEnd = timeToMinutes(slot.end);
    const distance = Math.abs(slotStart - startMinutes) + Math.abs(slotEnd - endMinutes);
    if (distance < bestDistance) {
      closest = slot;
      bestDistance = distance;
    }
  });
  return bestDistance <= tolerance * 2 ? closest : null;
}

function extractTimeTokens(value = "") {
  const normalized = cleanText(value)
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/\bT0\b/g, "TO")
    .replace(/\b0(?=\d\s*[:.])/g, "0");
  const matches = [];
  const pattern = /(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*[A-Z!|]{0,4})?\s*(AM|PM)/g;
  let match;
  while ((match = pattern.exec(normalized))) {
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const meridiem = match[3];
    if (hour > 12 || minute > 59) continue;
    if (hour === 12) hour = 0;
    if (meridiem === "PM") hour += 12;
    matches.push({
      text: `${match[1].padStart(2, "0")}:${match[2]} ${meridiem}`,
      minutes: hour * 60 + minute,
      index: match.index,
    });
  }
  return matches;
}

function findTimeRange(value = "") {
  const tokens = extractTimeTokens(value);
  if (tokens.length < 2) return null;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const start = tokens[index];
    const end = tokens[index + 1];
    const slot = closestOfficialSlot(start.minutes, end.minutes);
    if (!slot) continue;
    return {
      start: start.text,
      end: end.text,
      startMinutes: start.minutes,
      endMinutes: end.minutes,
      slot,
    };
  }
  return null;
}

function centerOf(bbox = {}) {
  return {
    x: (Number(bbox.x0) + Number(bbox.x1)) / 2,
    y: (Number(bbox.y0) + Number(bbox.y1)) / 2,
  };
}

function makeGeometryWord(text, bbox, confidence = 100) {
  const normalized = cleanText(text);
  if (!normalized || !bbox) return null;
  const safeBbox = {
    x0: Number(bbox.x0 || 0),
    y0: Number(bbox.y0 || 0),
    x1: Number(bbox.x1 || 0),
    y1: Number(bbox.y1 || 0),
  };
  return {
    text: normalized,
    confidence: Number(confidence || 0),
    bbox: safeBbox,
    ...centerOf(safeBbox),
  };
}

function groupWordsIntoLines(inputWords = []) {
  const sorted = [...inputWords].filter(Boolean).sort((a, b) => {
    if (Math.abs(a.y - b.y) > 10) return a.y - b.y;
    return a.x - b.x;
  });
  const rows = [];
  sorted.forEach((word) => {
    const height = Math.max(8, word.bbox.y1 - word.bbox.y0);
    let row = rows.find((candidate) => Math.abs(candidate.y - word.y) <= Math.max(8, height * 0.65));
    if (!row) {
      row = { y: word.y, words: [] };
      rows.push(row);
    }
    row.words.push(word);
    row.y = row.words.reduce((sum, item) => sum + item.y, 0) / row.words.length;
  });
  return rows.map((row) => {
    const lineWords = row.words.sort((a, b) => a.x - b.x);
    const bbox = {
      x0: Math.min(...lineWords.map((word) => word.bbox.x0)),
      y0: Math.min(...lineWords.map((word) => word.bbox.y0)),
      x1: Math.max(...lineWords.map((word) => word.bbox.x1)),
      y1: Math.max(...lineWords.map((word) => word.bbox.y1)),
    };
    const confidence = Math.round(
      lineWords.reduce((sum, word) => sum + Number(word.confidence || 0), 0) / Math.max(1, lineWords.length)
    );
    return {
      text: cleanText(lineWords.map((word) => word.text).join(" ")),
      confidence,
      bbox,
      words: lineWords,
      ...centerOf(bbox),
    };
  });
}

function flattenOcrData(data = {}) {
  const words = [];
  const blockLines = [];
  (Array.isArray(data?.blocks) ? data.blocks : []).forEach((block) => {
    (block?.paragraphs || []).forEach((paragraph) => {
      (paragraph?.lines || []).forEach((line) => {
        const lineWords = (line?.words || [])
          .map((word) => makeGeometryWord(word?.text, word?.bbox, word?.confidence))
          .filter(Boolean);
        if (!lineWords.length) return;
        words.push(...lineWords);
        const bbox = line.bbox || {
          x0: Math.min(...lineWords.map((word) => word.bbox.x0)),
          y0: Math.min(...lineWords.map((word) => word.bbox.y0)),
          x1: Math.max(...lineWords.map((word) => word.bbox.x1)),
          y1: Math.max(...lineWords.map((word) => word.bbox.y1)),
        };
        blockLines.push({
          text: cleanText(line.text || lineWords.map((word) => word.text).join(" ")),
          confidence: Number(line.confidence || 0),
          bbox,
          words: lineWords,
          ...centerOf(bbox),
        });
      });
    });
  });

  if (!words.length && Array.isArray(data?.words)) {
    data.words.forEach((word) => {
      const parsed = makeGeometryWord(word?.text, word?.bbox, word?.confidence);
      if (parsed) words.push(parsed);
    });
  }
  return { words, lines: blockLines.length ? blockLines : groupWordsIntoLines(words) };
}

function nativePdfGeometry(textContent = {}, viewport) {
  const words = [];
  (textContent?.items || []).forEach((item) => {
    const text = cleanText(item?.str);
    if (!text || !Array.isArray(item?.transform)) return;
    const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.max(7, Math.hypot(transform[2], transform[3]));
    const style = textContent?.styles?.[item.fontName] || {};
    const ascent = Number.isFinite(style.ascent)
      ? style.ascent
      : Number.isFinite(style.descent)
        ? 1 + style.descent
        : 0.82;
    const x0 = transform[4];
    const y0 = transform[5] - fontHeight * ascent;
    const width = Math.max(2, Math.abs(Number(item.width || 0) * viewport.scale));
    const word = makeGeometryWord(text, {
      x0,
      y0,
      x1: x0 + width,
      y1: y0 + fontHeight,
    }, 100);
    if (word) words.push(word);
  });
  const lines = groupWordsIntoLines(words);
  return {
    words,
    lines,
    fullText: cleanText(lines.map((line) => line.text).join("\n")),
  };
}

function rotateBboxClockwise(bbox, sourceHeight) {
  const points = [
    [bbox.x0, bbox.y0],
    [bbox.x1, bbox.y0],
    [bbox.x0, bbox.y1],
    [bbox.x1, bbox.y1],
  ].map(([x, y]) => [sourceHeight - y, x]);
  return {
    x0: Math.min(...points.map((point) => point[0])),
    y0: Math.min(...points.map((point) => point[1])),
    x1: Math.max(...points.map((point) => point[0])),
    y1: Math.max(...points.map((point) => point[1])),
  };
}

function rotateGeometryClockwise(geometry, sourceHeight) {
  if (!geometry?.words?.length) return geometry;
  const words = geometry.words.map((word) => {
    const bbox = rotateBboxClockwise(word.bbox, sourceHeight);
    return { ...word, bbox, ...centerOf(bbox) };
  });
  const lines = groupWordsIntoLines(words);
  return { ...geometry, words, lines, fullText: cleanText(lines.map((line) => line.text).join("\n")) };
}

function hasUsefulNativePdfText(geometry = {}) {
  const text = cleanText(geometry.fullText).toUpperCase();
  const hasCourse = /\b[A-Z]{2,5}\s*[- ]?\s*\d{3,4}\b/.test(text);
  const hasDay = /(SATURDAY|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|DAY\s*\/\s*TIME)/.test(text);
  return geometry.words?.length >= 18 && hasCourse && hasDay;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not prepare the routine page for reading."))),
      "image/png",
      1
    );
  });
}

function rotateCanvasClockwise(source) {
  const target = document.createElement("canvas");
  target.width = source.height;
  target.height = source.width;
  const context = target.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "white";
  context.fillRect(0, 0, target.width, target.height);
  context.translate(target.width, 0);
  context.rotate(Math.PI / 2);
  context.drawImage(source, 0, 0);
  return target;
}

async function imageFileToSource(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("The uploaded image could not be opened."));
      element.src = url;
    });
    const scale = Math.min(2.2, Math.max(1, 2600 / Math.max(image.width, image.height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      canvas: canvas.height > canvas.width * 1.12 ? rotateCanvasClockwise(canvas) : canvas,
      nativeGeometry: null,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function pdfFileToSource(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  if (!pdf.numPages) throw new Error("The uploaded PDF does not contain a page.");
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.7 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const [textContent] = await Promise.all([
    page.getTextContent({ normalizeWhitespace: true }).catch(() => ({ items: [], styles: {} })),
    page.render({ canvasContext: context, viewport }).promise,
  ]);
  let nativeGeometry = nativePdfGeometry(textContent, viewport);
  if (canvas.height > canvas.width * 1.12) {
    const sourceHeight = canvas.height;
    const rotatedCanvas = rotateCanvasClockwise(canvas);
    nativeGeometry = rotateGeometryClockwise(nativeGeometry, sourceHeight);
    return { canvas: rotatedCanvas, nativeGeometry };
  }
  return { canvas, nativeGeometry };
}

async function renderRoutineSource(file) {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  return isPdf ? pdfFileToSource(file) : imageFileToSource(file);
}

function scanLinePositions(canvas, direction, start, end, crossStart, crossEnd, ratio) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width } = image;
  const positions = [];
  const mainLength = Math.max(1, end - start);
  const crossLength = Math.max(1, crossEnd - crossStart);

  for (let position = start; position <= end; position += 1) {
    let dark = 0;
    for (let cross = crossStart; cross <= crossEnd; cross += 1) {
      const x = direction === "vertical" ? position : cross;
      const y = direction === "vertical" ? cross : position;
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (luminance < 125) dark += 1;
    }
    if (dark >= crossLength * ratio) positions.push({ position, dark });
  }

  const groups = [];
  positions.forEach((item) => {
    const current = groups.at(-1);
    if (!current || item.position - current.at(-1).position > 3) groups.push([item]);
    else current.push(item);
  });

  return groups.map((group) => {
    const total = group.reduce((sum, item) => sum + item.dark, 0);
    const weighted = group.reduce((sum, item) => sum + item.position * item.dark, 0);
    return {
      position: total ? weighted / total : group[Math.floor(group.length / 2)].position,
      strength: Math.max(...group.map((item) => item.dark)) / Math.max(1, crossLength),
      width: group.at(-1).position - group[0].position + 1,
      scanLength: mainLength,
    };
  });
}

function chooseLineSequence(candidates, expectedCount, canvasWidth) {
  if (!expectedCount || candidates.length <= expectedCount) return candidates;
  let chosen = candidates.slice(0, expectedCount);
  let chosenScore = -Infinity;
  for (let start = 0; start <= candidates.length - expectedCount; start += 1) {
    const sequence = candidates.slice(start, start + expectedCount);
    const coverage = sequence.at(-1).position - sequence[0].position;
    const strength = sequence.reduce((sum, item) => sum + item.strength, 0);
    const gaps = sequence.slice(1).map((item, index) => item.position - sequence[index].position);
    const meanGap = gaps.reduce((sum, gap) => sum + gap, 0) / Math.max(1, gaps.length);
    const variance = gaps.reduce((sum, gap) => sum + (gap - meanGap) ** 2, 0) / Math.max(1, gaps.length);
    const score = coverage + strength * canvasWidth * 0.12 - Math.sqrt(variance) * 0.3;
    if (score > chosenScore) {
      chosen = sequence;
      chosenScore = score;
    }
  }
  return chosen;
}

function detectVerticalLines(canvas, y0, y1, expectedCount = null) {
  const attempts = [0.78, 0.68, 0.58, 0.48, 0.36];
  let best = [];
  for (const ratio of attempts) {
    const candidates = scanLinePositions(
      canvas,
      "vertical",
      0,
      canvas.width - 1,
      Math.max(0, Math.floor(y0)),
      Math.min(canvas.height - 1, Math.ceil(y1)),
      ratio
    ).sort((a, b) => a.position - b.position);
    if (expectedCount && candidates.length >= expectedCount) {
      return chooseLineSequence(candidates, expectedCount, canvas.width).map((item) => item.position);
    }
    if (!expectedCount && candidates.length >= 4) return candidates.map((item) => item.position);
    if (candidates.length > best.length) best = candidates;
  }
  const selected = expectedCount ? chooseLineSequence(best, expectedCount, canvas.width) : best;
  return selected.map((item) => item.position);
}

function detectHorizontalLines(canvas, x0, x1, y0, y1) {
  const attempts = [0.82, 0.72, 0.6, 0.48];
  let best = [];
  for (const ratio of attempts) {
    const candidates = scanLinePositions(
      canvas,
      "horizontal",
      Math.max(0, Math.floor(y0)),
      Math.min(canvas.height - 1, Math.ceil(y1)),
      Math.max(0, Math.floor(x0)),
      Math.min(canvas.width - 1, Math.ceil(x1)),
      ratio
    ).sort((a, b) => a.position - b.position);
    if (candidates.length >= 3) return candidates.map((item) => item.position);
    if (candidates.length > best.length) best = candidates;
  }
  return best.map((item) => item.position);
}

function wordsInside(words, x0, x1, y0, y1) {
  return words.filter((word) => word.x > x0 && word.x < x1 && word.y > y0 && word.y < y1);
}

function cellText(words = []) {
  const sorted = [...words].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 12) return a.y - b.y;
    return a.x - b.x;
  });
  const rows = [];
  sorted.forEach((word) => {
    let row = rows.find((candidate) => Math.abs(candidate.y - word.y) <= 12);
    if (!row) {
      row = { y: word.y, words: [] };
      rows.push(row);
    }
    row.words.push(word);
  });
  return rows
    .sort((a, b) => a.y - b.y)
    .map((row) => row.words.sort((a, b) => a.x - b.x).map((word) => word.text).join(" "))
    .join("\n")
    .trim();
}

function parseCourseCode(value = "") {
  const source = cleanText(value).toUpperCase();
  const matches = [...source.matchAll(/\b([A-Z]{2,5})\s*[- ]?\s*([0-9OQDIL|ZSGB]{3,4})\b/g)];
  for (const match of matches) {
    const prefix = match[1];
    if (["DAY", "EVE", "ROOM", "CODE"].includes(prefix)) continue;
    const numeric = normalizeDigits(match[2]);
    if (numeric.length < 3) continue;
    return `${prefix} ${numeric}`;
  }
  return "";
}

function parseIntakeSection(value = "") {
  const source = cleanText(value).toUpperCase();
  const afterIntake = source.match(/INTAKE\s*[:.-]?\s*([0-9OQDIL|ZSGB]{1,3})\s*[\/-]\s*([0-9OQDIL|ZSGB]{1,2})/i);
  const generic = source.match(/\b([0-9OQDIL|ZSGB]{1,3})\s*[\/-]\s*([0-9OQDIL|ZSGB]{1,2})\b/i);
  const match = afterIntake || generic;
  if (!match) return { intake: "", section: "" };
  return { intake: normalizeDigits(match[1]), section: normalizeDigits(match[2]) };
}

function parseRoom(value = "") {
  const source = cleanText(value).toUpperCase().replace(/[⇒→]/g, ">");
  const withBuilding = source.match(
    /B(?:UILDING)?\s*[:.#-]?\s*([0-9OQDIL|])\s*(?:=>|=?>|>|-)?\s*R(?:OOM)?\s*[:.#-]?\s*([0-9OQDIL|ZSGB]{3,4})/i
  );
  if (withBuilding) {
    const building = normalizeDigits(withBuilding[1]);
    let room = normalizeDigits(withBuilding[2]);
    if (room.length === 3 && building) room = `${building}${room}`;
    return { room, buildingNo: building };
  }
  const roomMatch = source.match(/R(?:OOM)?\s*[:.#-]?\s*([0-9OQDIL|ZSGB]{3,4})/i);
  const room = roomMatch ? normalizeDigits(roomMatch[1]) : "";
  return { room, buildingNo: room.length === 4 ? room[0] : "" };
}

function inferBuildingName(room = "", buildingNo = "") {
  const digit = buildingNo || String(room || "").charAt(0);
  const map = {
    1: "Building-1",
    2: "Martyr Sujan Mahmud Building",
    3: "Martyr Tahmid Abdullah Building",
    4: "Building-4",
    5: "Building-5",
  };
  return map[digit] || (digit ? `Building-${digit}` : "Imported Room");
}

function parseClassCell(text = "", words = []) {
  const courseCode = parseCourseCode(text);
  if (!courseCode) return null;
  const { intake, section } = parseIntakeSection(text);
  const { room, buildingNo } = parseRoom(text);
  if (!room) return null;
  const confidences = words.map((word) => Number(word.confidence || 0)).filter(Number.isFinite);
  const confidence = confidences.length
    ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
    : 0;
  return {
    courseCode,
    courseTitle: "",
    intake,
    section,
    room,
    buildingNo,
    buildingName: inferBuildingName(room, buildingNo),
    confidence,
    sourceText: text,
  };
}

function parseSemesterYear(text = "") {
  const source = cleanText(text);
  const match = source.match(/(?:CLASS\s+SCHEDULE\s*[:.-]?\s*)?(SPRING|SUMMER|FALL)\s*[,\/-]?\s*(20\d{2})/i);
  return match
    ? { semester: `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}`, year: Number(match[2]) }
    : { semester: "", year: null };
}

function mapDayText(value = "") {
  const token = cleanText(value).toUpperCase().replace(/[^A-Z]/g, "");
  return DAY_FROM_TEXT[token] || "";
}

function findBoundaryHints(lines, canvas, format) {
  const courseHeadingY = lines
    .filter((line) => /COURSE\s+CODE/i.test(line.text))
    .map((line) => line.bbox.y0)
    .sort((a, b) => a - b)[0];
  const timeLines = lines.filter((line) => findTimeRange(line.text));
  const firstTimeY = timeLines.length ? Math.min(...timeLines.map((line) => line.bbox.y0)) : null;
  const dayTimeLine = lines.find((line) => /DAY\s*\/\s*TIME/i.test(line.text));

  const top = format === "matrix"
    ? Math.max(0, (dayTimeLine?.bbox?.y0 ?? firstTimeY ?? canvas.height * 0.3) - canvas.height * 0.05)
    : Math.max(0, (firstTimeY ?? canvas.height * 0.25) - canvas.height * 0.12);
  const bottom = Math.min(
    canvas.height - 1,
    courseHeadingY ? courseHeadingY - 15 : canvas.height * (format === "matrix" ? 0.69 : 0.76)
  );
  return { top, bottom };
}

function trimMatrixVerticals(verticals = [], canvasWidth = 1) {
  if (verticals.length < 4) return verticals;
  const gaps = verticals.slice(1).map((item, index) => item - verticals[index]);
  const plausible = gaps.filter((gap) => gap > canvasWidth * 0.035);
  if (!plausible.length) return verticals;
  const sorted = [...plausible].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  let start = 0;
  let end = verticals.length - 1;
  while (start < end - 2 && verticals[start + 1] - verticals[start] < median * 0.25) start += 1;
  while (end > start + 2 && verticals[end] - verticals[end - 1] < median * 0.25) end -= 1;
  return verticals.slice(start, end + 1);
}

function parseMatrixFormat({ canvas, words, lines, fullText }) {
  const { top, bottom } = findBoundaryHints(lines, canvas, "matrix");
  const verticals = trimMatrixVerticals(detectVerticalLines(canvas, top, bottom), canvas.width);
  if (verticals.length < 4) {
    throw new Error("The time-column routine table could not be located clearly.");
  }
  const horizontals = detectHorizontalLines(canvas, verticals[0], verticals.at(-1), top, bottom);
  if (horizontals.length < 3) throw new Error("The routine rows could not be located clearly.");

  const headerTop = horizontals[0];
  const headerBottom = horizontals[1];
  const slots = [];
  for (let index = 1; index < verticals.length - 1; index += 1) {
    const headerWords = wordsInside(words, verticals[index], verticals[index + 1], headerTop, headerBottom);
    const headerText = cellText(headerWords);
    const range = findTimeRange(headerText);
    slots.push(range?.slot || null);
  }
  if (!slots.some(Boolean)) throw new Error("The class time headings could not be read from the routine.");

  const records = [];
  for (let rowIndex = 1; rowIndex < horizontals.length - 1; rowIndex += 1) {
    const y0 = horizontals[rowIndex];
    const y1 = horizontals[rowIndex + 1];
    const dayWords = wordsInside(words, verticals[0], verticals[1], y0, y1);
    const day = mapDayText(cellText(dayWords));
    if (!day) continue;
    for (let columnIndex = 1; columnIndex < verticals.length - 1; columnIndex += 1) {
      const slot = slots[columnIndex - 1];
      if (!slot) continue;
      const currentWords = wordsInside(words, verticals[columnIndex], verticals[columnIndex + 1], y0, y1);
      const parsed = parseClassCell(cellText(currentWords), currentWords);
      if (!parsed) continue;
      records.push({ ...parsed, day, slotId: slot.id, slotLabel: slot.label });
    }
  }
  return {
    format: "matrix",
    formatLabel: "BUBT time-column class routine",
    ...parseSemesterYear(fullText),
    records,
  };
}

function parseWeeklyGridFormat({ canvas, words, lines, fullText }) {
  const { top, bottom } = findBoundaryHints(lines, canvas, "weekly-grid");
  const verticals = detectVerticalLines(canvas, top, bottom, 8);
  if (verticals.length < 8) throw new Error("The seven-day routine table could not be located clearly.");
  const horizontals = detectHorizontalLines(canvas, verticals[0], verticals.at(-1), top, bottom);
  if (horizontals.length < 3) throw new Error("The routine rows could not be located clearly.");

  const headerTop = horizontals[0];
  const headerBottom = horizontals[1];
  const columnDays = [];
  for (let columnIndex = 0; columnIndex < 7; columnIndex += 1) {
    const headerWords = wordsInside(words, verticals[columnIndex], verticals[columnIndex + 1], headerTop, headerBottom);
    columnDays.push(mapDayText(cellText(headerWords)) || DAY_IDS[columnIndex]);
  }

  const rowSlots = new Map();
  for (let rowIndex = 1; rowIndex < horizontals.length - 1; rowIndex += 1) {
    const rowWords = wordsInside(words, verticals[0], verticals.at(-1), horizontals[rowIndex], horizontals[rowIndex + 1]);
    const ranges = [];
    for (let columnIndex = 0; columnIndex < 7; columnIndex += 1) {
      const currentWords = wordsInside(words, verticals[columnIndex], verticals[columnIndex + 1], horizontals[rowIndex], horizontals[rowIndex + 1]);
      const range = findTimeRange(cellText(currentWords));
      if (range?.slot) ranges.push(range.slot);
    }
    if (!ranges.length) {
      const range = findTimeRange(cellText(rowWords));
      if (range?.slot) ranges.push(range.slot);
    }
    if (ranges.length) rowSlots.set(rowIndex, ranges[0]);
  }

  const records = [];
  for (let columnIndex = 0; columnIndex < 7; columnIndex += 1) {
    const day = columnDays[columnIndex];
    for (let rowIndex = 1; rowIndex < horizontals.length - 1; rowIndex += 1) {
      const currentWords = wordsInside(words, verticals[columnIndex], verticals[columnIndex + 1], horizontals[rowIndex], horizontals[rowIndex + 1]);
      if (!currentWords.length) continue;
      const text = cellText(currentWords);
      const range = findTimeRange(text);
      const slot = range?.slot || rowSlots.get(rowIndex) || null;
      if (!slot) continue;
      const parsed = parseClassCell(text, currentWords);
      if (!parsed) continue;
      records.push({ ...parsed, day, slotId: slot.id, slotLabel: slot.label });
    }
  }
  return {
    format: "weekly-grid",
    formatLabel: "BUBT seven-day class schedule",
    ...parseSemesterYear(fullText),
    records,
  };
}

function findMatchingCourse(record, courses = [], preferredSemester = "", preferredYear = null) {
  const code = canonicalCourseCode(record.courseCode);
  const intake = cleanText(record.intake).toLowerCase();
  const section = cleanText(record.section).toLowerCase();
  const semester = cleanText(preferredSemester).toLowerCase();
  const year = Number(preferredYear);

  const sameCode = (Array.isArray(courses) ? courses : []).filter(
    (course) => canonicalCourseCode(course.code) === code
  );
  const exact = sameCode.find(
    (course) =>
      (!intake || cleanText(course.intake).toLowerCase() === intake) &&
      (!section || cleanText(course.section).toLowerCase() === section)
  );
  if (exact) return exact;

  const sameSemester = sameCode.filter(
    (course) =>
      (!semester || cleanText(course.semester).toLowerCase() === semester) &&
      (!year || Number(course.year) === year)
  );
  if (sameSemester.length === 1) return sameSemester[0];
  return sameCode.length === 1 ? sameCode[0] : null;
}

function enrichRecords(records, courses, semester, year) {
  const warnings = [];
  const seen = new Set();
  const enriched = [];

  records.forEach((record, index) => {
    const key = `${record.day}|${record.slotId}`;
    if (seen.has(key)) {
      warnings.push(`${record.day} ${record.slotLabel}: more than one class was detected; only the first one is kept.`);
      return;
    }
    seen.add(key);
    const matchedCourse = findMatchingCourse(record, courses, semester, year);
    const courseId = matchedCourse ? courseKey(matchedCourse) : "";
    enriched.push({
      id: `import_${index}_${record.day}_${record.slotId}`,
      ...record,
      courseId,
      courseTitle: matchedCourse?.title || record.courseTitle || "",
      courseType: cleanText(matchedCourse?.courseType).toLowerCase() || "theory",
      courseShift: SLOT_MAP[record.slotId]?.shift || matchedCourse?.shift || "",
      matched: Boolean(matchedCourse),
    });
    if (!matchedCourse) {
      warnings.push(
        `${record.courseCode} ${record.intake && record.section ? `${record.intake}/${record.section}` : ""}`.trim() +
          " could not be matched automatically with a portal course."
      );
    }
  });

  return { records: enriched, warnings };
}

function detectFormat(fullText = "") {
  const text = cleanText(fullText).toUpperCase();
  if (/DAY\s*\/\s*TIME/.test(text) || /CLASS\s+ROUTINE/.test(text)) return "matrix";
  if (/CLASS\s+SCHEDULE/.test(text) || /(SATURDAY.*SUNDAY.*MONDAY.*TUESDAY)/.test(text)) return "weekly-grid";
  return "";
}

function parseBestSupportedFormat(payload) {
  const preferred = detectFormat(payload.fullText);
  const order = preferred === "matrix"
    ? [parseMatrixFormat, parseWeeklyGridFormat]
    : preferred === "weekly-grid"
      ? [parseWeeklyGridFormat, parseMatrixFormat]
      : [parseMatrixFormat, parseWeeklyGridFormat];
  const successes = [];
  const errors = [];
  order.forEach((parser) => {
    try {
      const parsed = parser(payload);
      if (parsed.records?.length) successes.push(parsed);
      else errors.push(`${parsed.formatLabel}: no complete class cells found.`);
    } catch (error) {
      errors.push(error?.message || "Routine layout could not be parsed.");
    }
  });
  if (!successes.length) {
    throw new Error([...new Set(errors)].join(" ") || "This routine layout could not be read.");
  }
  return successes.sort((a, b) => b.records.length - a.records.length)[0];
}

async function readWithTesseract(canvas, onProgress) {
  const imageBlob = await canvasToBlob(canvas);
  let worker;
  try {
    worker = await createWorker("eng", undefined, {
      logger: (message) => {
        const progress = Number(message?.progress || 0);
        onProgress({
          progress: Math.min(0.9, 0.12 + progress * 0.74),
          status: message?.status ? `Reading routine: ${message.status}...` : "Reading routine...",
        });
      },
    });
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "11",
      user_defined_dpi: "300",
    });
    const result = await worker.recognize(imageBlob, {}, { blocks: true });
    const geometry = flattenOcrData(result?.data || {});
    return {
      ...geometry,
      fullText: cleanText(result?.data?.text || geometry.lines.map((line) => line.text).join("\n")),
      readingMethod: "OCR",
    };
  } finally {
    if (worker) await worker.terminate();
  }
}

export async function readRoutineFile(file, options = {}) {
  if (!file) throw new Error("Choose a routine PDF or image first.");
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  onProgress({ progress: 0.05, status: "Opening routine file..." });
  const source = await renderRoutineSource(file);
  let geometry;
  if (hasUsefulNativePdfText(source.nativeGeometry)) {
    geometry = { ...source.nativeGeometry, readingMethod: "PDF text" };
    onProgress({ progress: 0.72, status: "Reading the PDF text and table positions..." });
  } else {
    geometry = await readWithTesseract(source.canvas, onProgress);
  }
  if (!geometry.words?.length || !geometry.fullText) {
    throw new Error("No readable routine information was found in the uploaded file.");
  }

  onProgress({ progress: 0.93, status: "Mapping classes to days and exact time slots..." });
  const parsed = parseBestSupportedFormat({
    canvas: source.canvas,
    words: geometry.words,
    lines: geometry.lines,
    fullText: geometry.fullText,
  });
  const preferredSemester = parsed.semester || options.currentSemester || "";
  const preferredYear = parsed.year || options.currentYear || null;
  const enriched = enrichRecords(parsed.records, options.courses || [], preferredSemester, preferredYear);
  if (!enriched.records.length) {
    throw new Error("The routine was read, but no complete class row with course, time, intake/section, and room was found.");
  }

  onProgress({ progress: 1, status: "Routine ready for review." });
  return {
    ...parsed,
    sourceFileName: file.name || "Imported routine",
    records: enriched.records,
    warnings: [...new Set(enriched.warnings)],
    rawText: geometry.fullText,
    readingMethod: geometry.readingMethod,
  };
}

export function applyCourseSelection(record, courseId, courses = []) {
  if (!courseId) {
    return { ...record, courseId: "", matched: false };
  }
  const course = courses.find((item) => courseKey(item) === courseId);
  if (!course) return record;
  return {
    ...record,
    courseId,
    courseCode: course.code || record.courseCode,
    courseTitle: course.title || record.courseTitle,
    intake: course.intake || record.intake,
    section: course.section || record.section,
    courseType: cleanText(course.courseType).toLowerCase() || record.courseType || "theory",
    matched: true,
  };
}

export function importedRoomDirectoryEntry(record = {}) {
  const room = cleanText(record.room);
  if (!room) return null;
  return {
    buildingName: record.buildingName || inferBuildingName(room, record.buildingNo),
    roomNo: room,
    roomTitle: record.courseType === "lab" ? "Computing Lab" : "Theory",
    liftLevel: room.length === 4 && /^\d+$/.test(room) ? Math.max(0, Number(room[1]) - 1) : null,
  };
}
