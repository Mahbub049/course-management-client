import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { getMyRoutine, saveMyRoutine } from "../services/routineService";

const DEFAULT_DAYS = ["Mon", "Tue", "Wed", "Thu"];

const DEFAULT_TIME_SLOTS = [
  { id: "slot_1", label: "08:15 AM to\n09:45 AM\n(Day)", start: "08:15 AM", end: "09:45 AM", shift: "Day" },
  { id: "slot_2", label: "11:15 AM to\n12:45 PM\n(Day)", start: "11:15 AM", end: "12:45 PM", shift: "Day" },
  { id: "slot_3", label: "01:15 PM to\n02:45 PM\n(Day)", start: "01:15 PM", end: "02:45 PM", shift: "Day" },
  { id: "slot_4", label: "04:15 PM to\n05:45 PM\n(Day)", start: "04:15 PM", end: "05:45 PM", shift: "Day" },
  { id: "slot_5", label: "05:45 PM to\n07:00 PM\n(EVE)", start: "05:45 PM", end: "07:00 PM", shift: "EVE" },
  { id: "slot_6", label: "07:00 PM to\n08:15 PM\n(EVE)", start: "07:00 PM", end: "08:15 PM", shift: "EVE" },
  { id: "slot_7", label: "08:15 PM to\n09:30 PM\n(EVE)", start: "08:15 PM", end: "09:30 PM", shift: "EVE" },
];

const emptyRoutine = () => createRoutineShell();

function createRoutineShell(overrides = {}) {
  const days = Array.isArray(overrides.days) && overrides.days.length ? overrides.days : DEFAULT_DAYS;
  const timeSlots = Array.isArray(overrides.timeSlots) && overrides.timeSlots.length ? overrides.timeSlots : DEFAULT_TIME_SLOTS;

  return {
    title: "Class Routine",
    universityName: "Bangladesh University of Business and Technology (BUBT)",
    facultyName: localStorage.getItem("marksPortalName") || "",
    facultyCode: "",
    department: "",
    buildingNote: "",
    revision: "",
    lastModifiedText: "",
    days,
    timeSlots,
    cells: ensureCells(overrides.cells || {}, days, timeSlots),
    courses: Array.isArray(overrides.courses) ? overrides.courses : [],
    sourceFileName: overrides.sourceFileName || "",
    importedAt: overrides.importedAt || null,
  };
}

function ensureCells(cells = {}, days = DEFAULT_DAYS, timeSlots = DEFAULT_TIME_SLOTS) {
  const next = {};
  days.forEach((day) => {
    next[day] = {};
    timeSlots.forEach((slot) => {
      next[day][slot.id] = String(cells?.[day]?.[slot.id] || "").trim();
    });
  });
  return next;
}

function normalizeSpaces(text = "") {
  return String(text)
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDay(text = "") {
  const value = String(text).replace(/[^a-z]/gi, "").toLowerCase();
  const map = {
    mon: "Mon",
    monday: "Mon",
    tue: "Tue",
    tuesday: "Tue",
    wed: "Wed",
    wednesday: "Wed",
    thu: "Thu",
    thursday: "Thu",
    fri: "Fri",
    friday: "Fri",
    sat: "Sat",
    saturday: "Sat",
    sun: "Sun",
    sunday: "Sun",
  };
  return map[value] || null;
}

function normalizeCourseCode(value = "") {
  return String(value).replace(/\s+/g, " ").trim().toUpperCase();
}

function parseMetaFromText(text = "") {
  const clean = text.replace(/\r/g, "\n");
  const oneLine = normalizeSpaces(clean);

  const getMatch = (regex) => {
    const match = oneLine.match(regex);
    return match?.[1]?.trim() || "";
  };

  return {
    universityName:
      getMatch(/(Bangladesh University of Business and Technology\s*\(BUBT\))/i) ||
      "Bangladesh University of Business and Technology (BUBT)",
    facultyName: getMatch(/Faculty\s*Name\s*:?\s*(.+?)\s+Faculty\s*Code/i),
    facultyCode: getMatch(/Faculty\s*Code\s*:?\s*([A-Z0-9-]+)/i),
    department: getMatch(/Department\s*:?\s*([A-Za-z &]+?)(?:\s+Revision|\s+Last Modified|$)/i),
    buildingNote: getMatch(/(Building\s*[-:]?\s*[^\n]+?)(?:\s+Faculty\s*Name|\s+Class\s*Routine|$)/i),
    revision: getMatch(/Revision\s*:?\s*([0-9.]+)/i),
    lastModifiedText: getMatch(/Last\s*Modified\s*:?\s*(.+?)(?:\s+Faculty\s*Name|\s+Day\/Time|$)/i),
  };
}

function parseTimeSlotsFromText(text = "") {
  const rawText = String(text || "").replace(/\r/g, "\n");
  const looksLikeRoutinePdf = /Day\/?Time|Class\s+Routine|Bangladesh University of Business and Technology/i.test(rawText);

  // BUBT routine OCR often reads the first header row as:
  // "08:15 AM to 11:15 AM to 01:15 PM to ..."
  // and the second header row as:
  // "09:45 AM (Day) 12:45 PM (Day) ..."
  // So we first try to pair the start-time row with the end-time row by position.
  const lines = rawText
    .split("\n")
    .map((line) => normalizeSpaces(line))
    .filter(Boolean);

  for (let i = 0; i < lines.length; i += 1) {
    const startTimes = extractTimes(lines[i]);
    const endTimes = extractTimes(lines[i + 1] || "");
    const shifts = extractShifts(lines[i + 1] || "");

    if (startTimes.length >= 4 && endTimes.length >= 4 && Math.abs(startTimes.length - endTimes.length) <= 1) {
      const paired = startTimes.slice(0, endTimes.length).map((start, index) => {
        const end = endTimes[index];
        const shift = normalizeShift(shifts[index] || (start.includes("PM") ? "EVE" : "Day"));
        return makeTimeSlot(index, start, end, shift);
      });

      const validPaired = paired.filter(isValidTimeSlot);
      if (validPaired.length >= 4) return validPaired.slice(0, 12);
    }
  }

  const matches = [];
  const flat = normalizeSpaces(rawText)
    .replace(/0([1-9]):/g, "0$1:")
    .replace(/\bM\s+to\b/gi, "AM to")
    .replace(/\bP\s+to\b/gi, "PM to");

  const regex = /(\d{1,2}\s*[:.]\s*\d{2}\s*(?:A\s*M|P\s*M|AM|PM))\s*to\s*(\d{1,2}\s*[:.]\s*\d{2}\s*(?:A\s*M|P\s*M|AM|PM))(?:\s*\(?\s*(Day|EVE|Evening)\s*\)?)?/gi;

  let match;
  while ((match = regex.exec(flat)) !== null) {
    const start = normalizeTime(match[1]);
    const end = normalizeTime(match[2]);
    const shift = normalizeShift(match[3] || (start.includes("PM") ? "EVE" : "Day"));
    matches.push(makeTimeSlot(matches.length, start, end, shift));
  }

  // Keep unique and remove impossible pairs like 08:15 AM -> 11:15 AM.
  const seen = new Set();
  const unique = matches.filter((slot) => {
    const key = `${slot.start}-${slot.end}`;
    if (seen.has(key) || !isValidTimeSlot(slot)) return false;
    seen.add(key);
    return true;
  });

  // For BUBT routine PDFs, fewer than 4 detected slots usually means OCR paired wrong values.
  // In that case, use the standard BUBT slot set instead of showing a broken 3-column table.
  if (looksLikeRoutinePdf && unique.length < 4) return DEFAULT_TIME_SLOTS;

  return unique.length >= 2 ? unique.slice(0, 12) : DEFAULT_TIME_SLOTS;
}

function makeTimeSlot(index, start, end, shift) {
  const cleanStart = normalizeTime(start);
  const cleanEnd = normalizeTime(end);
  const cleanShift = normalizeShift(shift);

  return {
    id: `slot_${index + 1}`,
    start: cleanStart,
    end: cleanEnd,
    shift: cleanShift,
    label: `${cleanStart} to\n${cleanEnd}\n(${cleanShift})`,
  };
}

function extractTimes(line = "") {
  const matches = String(line).match(/\d{1,2}\s*[:.]\s*\d{2}\s*(?:A\s*M|P\s*M|AM|PM)/gi) || [];
  return matches.map(normalizeTime);
}

function extractShifts(line = "") {
  const matches = String(line).match(/\(?\s*(Day|EVE|Evening)\s*\)?/gi) || [];
  return matches.map(normalizeShift);
}

function normalizeShift(value = "") {
  const shift = String(value || "")
    .replace(/[()]/g, "")
    .trim()
    .toUpperCase();

  if (shift === "EVENING") return "EVE";
  if (shift === "EVE") return "EVE";
  return "Day";
}

function isValidTimeSlot(slot) {
  const start = timeToMinutes(slot.start);
  const end = timeToMinutes(slot.end);
  if (start == null || end == null) return false;

  const duration = end - start;
  // BUBT class slots are usually 75 or 90 minutes. Keep a safe range,
  // but reject wrong OCR pairs like 180 minutes.
  return duration >= 45 && duration <= 150;
}

function timeToMinutes(value = "") {
  const match = normalizeTime(value).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();

  if (hour === 12) hour = 0;
  if (period === "PM") hour += 12;
  return hour * 60 + minute;
}

function normalizeTime(value = "") {
  return String(value)
    .replace(/\s+/g, "")
    .replace(".", ":")
    .replace(/A\s*M/i, "AM")
    .replace(/P\s*M/i, "PM")
    .replace(/AM/i, " AM")
    .replace(/PM/i, " PM")
    .replace(/^([0-9]):/, "0$1:")
    .trim()
    .toUpperCase();
}

function parseCoursesFromText(text = "") {
  const flat = normalizeSpaces(text);
  const courses = [];
  const regex = /\b((?:CSE|ICT)\s*\d{3,4})\b\s+([A-Za-z][A-Za-z &/.-]{3,80}?)\s+(\d{1,3})\s+(\d{1,2})\s+([A-Z]+(?:\s*\(DH\))?)/gi;
  let match;

  while ((match = regex.exec(flat)) !== null) {
    const title = normalizeSpaces(match[2])
      .replace(/\bCourse\s*Code\b/gi, "")
      .replace(/\bCourse\s*Title\b/gi, "")
      .trim();

    courses.push({
      code: normalizeCourseCode(match[1]),
      title,
      intake: match[3] || "",
      section: match[4] || "",
      program: normalizeSpaces(match[5]),
    });
  }

  const byCode = new Map();
  courses.forEach((course) => {
    if (!byCode.has(course.code)) byCode.set(course.code, course);
  });

  return [...byCode.values()].slice(0, 30);
}

async function extractTextFromPdf(file, setProgress) {
  const pdfjsLib = await import("pdfjs-dist");
  const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  setProgress?.("Checking embedded PDF text...");
  return content.items.map((item) => item.str).join("\n");
}

async function renderFileToCanvas(file) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const pdfjsLib = await import("pdfjs-dist");
    const workerModule = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;

    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 3 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;

    // Many BUBT routine PDFs are stored as portrait pages but the routine table is landscape.
    return canvas.height > canvas.width ? rotateCanvas(canvas, 90) : canvas;
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = imageUrl;
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const scale = Math.min(3, Math.max(1, 2400 / Math.max(img.width, img.height)));
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.height > canvas.width ? rotateCanvas(canvas, 90) : canvas;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function rotateCanvas(source, degrees = 90) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const radians = (degrees * Math.PI) / 180;

  if (Math.abs(degrees) === 90 || Math.abs(degrees) === 270) {
    canvas.width = source.height;
    canvas.height = source.width;
  } else {
    canvas.width = source.width;
    canvas.height = source.height;
  }

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(radians);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

async function runOcr(canvas, setProgress) {
  const Tesseract = await import("tesseract.js");

  const logger = (m) => {
    if (m.status === "recognizing text") {
      setProgress?.(`Reading routine from PDF... ${Math.round((m.progress || 0) * 100)}%`);
    } else if (m.status) {
      setProgress?.(m.status);
    }
  };

  // createWorker gives more stable layout data than only calling Tesseract.recognize().
  // The fallback below still works if the installed tesseract.js version exposes only recognize().
  if (typeof Tesseract.createWorker === "function") {
    const worker = await Tesseract.createWorker("eng", 1, { logger });
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: "11",
        preserve_interword_spaces: "1",
      });
      return await worker.recognize(canvas);
    } finally {
      await worker.terminate();
    }
  }

  const recognize = Tesseract.default?.recognize || Tesseract.recognize;
  return recognize(canvas, "eng", {
    tessedit_pageseg_mode: "11",
    preserve_interword_spaces: "1",
    logger,
  });
}

function buildRoutineFromOcr(result, canvas, fileName = "") {
  const text = result?.data?.text || "";
  const routine = buildRoutineFromText(text, fileName);

  // This is the important fix: do not depend only on OCR reading order.
  // BUBT routine PDFs are image-based tables. We first detect the table grid lines
  // from the rendered image, then place each OCR word into the correct row/column.
  const words = extractOcrWords(result)
    .filter((word) => String(word?.text || "").trim())
    .map((word) => ({
      ...word,
      text: String(word.text).trim(),
      confidence: Number.isFinite(Number(word.confidence)) ? Number(word.confidence) : 100,
      cx: (Number(word.x0) + Number(word.x1)) / 2,
      cy: (Number(word.y0) + Number(word.y1)) / 2,
    }))
    .filter((word) => word.confidence > 5 && Number.isFinite(word.cx) && Number.isFinite(word.cy));

  const slots = routine.timeSlots?.length >= 4 ? routine.timeSlots : DEFAULT_TIME_SLOTS;
  routine.timeSlots = slots;
  routine.cells = ensureCells(routine.cells, routine.days, routine.timeSlots);

  const grid = detectRoutineGridFromCanvas(canvas, slots.length, routine.days.length);
  if (grid) {
    const gridCells = buildCellsFromGridWords(words, grid, routine.days, slots);
    const hasGridCells = Object.values(gridCells).some((row) => Object.values(row).some(Boolean));
    if (hasGridCells) {
      routine.cells = gridCells;
      return routine;
    }
  }

  // Backup for very low-quality images where grid lines are not detected.
  const positionCells = buildCellsFromDayWordPositions(words, canvas, routine.days, slots);
  const hasPositionCells = Object.values(positionCells).some((row) => Object.values(row).some(Boolean));
  if (hasPositionCells) routine.cells = positionCells;

  return routine;
}

function extractOcrWords(result) {
  const data = result?.data || {};

  if (Array.isArray(data.words) && data.words.length) {
    return data.words.map(normalizeOcrWord).filter(Boolean);
  }

  const nestedWords = [];
  collectNestedOcrWords(data, nestedWords);
  if (nestedWords.length) return nestedWords.map(normalizeOcrWord).filter(Boolean);

  if (typeof data.tsv === "string" && data.tsv.trim()) {
    return parseWordsFromTsv(data.tsv);
  }

  return [];
}

function collectNestedOcrWords(node, output) {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node.words) && node.words.length) {
    node.words.forEach((word) => output.push(word));
  }

  ["blocks", "paragraphs", "lines", "symbols", "choices"].forEach((key) => {
    if (Array.isArray(node[key])) {
      node[key].forEach((child) => collectNestedOcrWords(child, output));
    }
  });
}

function normalizeOcrWord(word) {
  const text = String(word?.text || "").trim();
  if (!text) return null;

  const bbox = word.bbox || {};
  const x0 = Number(bbox.x0 ?? bbox.x ?? word.x0 ?? word.left ?? 0);
  const y0 = Number(bbox.y0 ?? bbox.y ?? word.y0 ?? word.top ?? 0);
  const x1 = Number(bbox.x1 ?? (bbox.x != null && bbox.w != null ? bbox.x + bbox.w : undefined) ?? word.x1 ?? (word.left != null && word.width != null ? word.left + word.width : 0));
  const y1 = Number(bbox.y1 ?? (bbox.y != null && bbox.h != null ? bbox.y + bbox.h : undefined) ?? word.y1 ?? (word.top != null && word.height != null ? word.top + word.height : 0));

  if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) return null;

  return {
    text,
    confidence: Number(word.confidence ?? word.conf ?? 100),
    x0,
    y0,
    x1,
    y1,
  };
}

function parseWordsFromTsv(tsv = "") {
  const lines = String(tsv).split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split("\t");
  const indexOf = (name) => headers.findIndex((header) => header.trim().toLowerCase() === name);
  const idx = {
    level: indexOf("level"),
    left: indexOf("left"),
    top: indexOf("top"),
    width: indexOf("width"),
    height: indexOf("height"),
    conf: indexOf("conf"),
    text: indexOf("text"),
  };

  if (idx.left < 0 || idx.top < 0 || idx.width < 0 || idx.height < 0 || idx.text < 0) return [];

  return lines.slice(1).map((line) => {
    const parts = line.split("\t");
    const text = String(parts[idx.text] || "").trim();
    const left = Number(parts[idx.left]);
    const top = Number(parts[idx.top]);
    const width = Number(parts[idx.width]);
    const height = Number(parts[idx.height]);
    const confidence = Number(parts[idx.conf] ?? 100);

    if (!text || !Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)) {
      return null;
    }

    return {
      text,
      confidence,
      x0: left,
      y0: top,
      x1: left + width,
      y1: top + height,
    };
  }).filter(Boolean);
}

function detectRoutineGridFromCanvas(canvas, expectedSlots = 7, expectedDays = 4) {
  if (!canvas) return null;

  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !width || !height) return null;

  const image = ctx.getImageData(0, 0, width, height).data;
  const verticalCounts = new Uint32Array(width);
  const horizontalCounts = new Uint32Array(height);

  for (let y = 0; y < height; y += 1) {
    let rowCount = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const r = image[offset];
      const g = image[offset + 1];
      const b = image[offset + 2];
      const a = image[offset + 3];
      // Routine grid lines are almost black. This threshold avoids light gray UI/text noise.
      if (a > 30 && r < 95 && g < 95 && b < 95) {
        verticalCounts[x] += 1;
        rowCount += 1;
      }
    }
    horizontalCounts[y] = rowCount;
  }

  const requiredVerticalLines = expectedSlots + 2; // left border + day column border + slot borders
  const requiredHorizontalLines = expectedDays + 2; // top border + header/body border + day row borders

  const verticalLines = pickLineSet(verticalCounts, [0.28, 0.24, 0.20, 0.16], height, requiredVerticalLines, "vertical");
  const horizontalLines = pickLineSet(horizontalCounts, [0.48, 0.42, 0.35, 0.28], width, requiredHorizontalLines, "horizontal");

  if (!verticalLines || !horizontalLines) return null;
  if (verticalLines.length < requiredVerticalLines || horizontalLines.length < requiredHorizontalLines) return null;

  return {
    verticalLines: verticalLines.slice(0, requiredVerticalLines),
    horizontalLines: horizontalLines.slice(0, requiredHorizontalLines),
  };
}

function pickLineSet(counts, thresholdRatios, oppositeSize, required, orientation) {
  for (const ratio of thresholdRatios) {
    const threshold = Math.max(40, oppositeSize * ratio);
    const centers = getLineCenters(counts, threshold);
    const selected = orientation === "vertical"
      ? selectVerticalGridLines(centers, required)
      : selectHorizontalGridLines(centers, required, counts.length);

    if (selected?.length >= required) return selected;
  }

  return null;
}

function getLineCenters(counts, threshold) {
  const centers = [];
  let start = -1;
  let bestIndex = -1;
  let bestCount = -1;

  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] >= threshold) {
      if (start === -1) {
        start = i;
        bestIndex = i;
        bestCount = counts[i];
      }
      if (counts[i] > bestCount) {
        bestIndex = i;
        bestCount = counts[i];
      }
    } else if (start !== -1) {
      centers.push(bestIndex);
      start = -1;
      bestIndex = -1;
      bestCount = -1;
    }
  }

  if (start !== -1) centers.push(bestIndex);

  // Merge near-duplicate line detections caused by anti-aliased table borders.
  const merged = [];
  centers.forEach((center) => {
    const last = merged[merged.length - 1];
    if (last != null && Math.abs(center - last) <= 6) {
      merged[merged.length - 1] = Math.round((last + center) / 2);
    } else {
      merged.push(center);
    }
  });

  return merged;
}

function selectVerticalGridLines(centers, required) {
  const filtered = centers.filter((x) => Number.isFinite(x));
  if (filtered.length < required) return null;

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let i = 0; i <= filtered.length - required; i += 1) {
    const window = filtered.slice(i, i + required);
    const gaps = [];
    for (let j = 2; j < window.length; j += 1) gaps.push(window[j] - window[j - 1]);
    const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / Math.max(gaps.length, 1);
    if (avgGap < 35) continue;

    const variance = gaps.reduce((sum, gap) => sum + Math.abs(gap - avgGap), 0);
    const spread = window[window.length - 1] - window[0];
    const dayColumnGap = window[1] - window[0];
    const score = variance - spread * 0.01 + Math.abs(dayColumnGap - avgGap * 0.6) * 0.15;

    if (score < bestScore) {
      bestScore = score;
      best = window;
    }
  }

  return best || filtered.slice(0, required);
}

function selectHorizontalGridLines(centers, required, fullSize) {
  const filtered = centers.filter((y) => Number.isFinite(y) && y > fullSize * 0.18 && y < fullSize * 0.82);
  if (filtered.length < required) return null;

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let i = 0; i <= filtered.length - required; i += 1) {
    const window = filtered.slice(i, i + required);
    const gaps = [];
    for (let j = 1; j < window.length; j += 1) gaps.push(window[j] - window[j - 1]);
    const bodyGaps = gaps.slice(1);
    const avgBodyGap = bodyGaps.reduce((sum, gap) => sum + gap, 0) / Math.max(bodyGaps.length, 1);
    if (avgBodyGap < 30) continue;

    const variance = bodyGaps.reduce((sum, gap) => sum + Math.abs(gap - avgBodyGap), 0);
    // Prefer the first large grid on the page. The course directory table appears below it.
    const score = variance + window[0] * 0.02;
    if (score < bestScore) {
      bestScore = score;
      best = window;
    }
  }

  return best || filtered.slice(0, required);
}

function buildCellsFromGridWords(words, grid, days, slots) {
  const nextCells = ensureCells({}, days, slots);
  const { verticalLines, horizontalLines } = grid;
  const lineHeight = Math.max(16, median(horizontalLines.slice(1).map((line, index, arr) => index ? line - arr[index - 1] : 0).filter(Boolean)) / 5 || 22);
  const buckets = {};

  words.forEach((word) => {
    let textValue = cleanOcrToken(word.text);
    if (!textValue || !/[A-Za-z0-9]/.test(textValue)) return;

    const cx = word.cx;
    const cy = word.cy;

    // Body only: below header row and inside the routine grid.
    if (cy <= horizontalLines[1] + 4 || cy >= horizontalLines[horizontalLines.length - 1] - 4) return;
    if (cx <= verticalLines[1] + 4 || cx >= verticalLines[verticalLines.length - 1] - 4) return;

    const rowCellIndex = findCellIndex(horizontalLines, cy);
    const colCellIndex = findCellIndex(verticalLines, cx);
    const dayIndex = rowCellIndex - 1;
    const slotIndex = colCellIndex - 1;
    const day = days[dayIndex];
    const slot = slots[slotIndex];

    if (!day || !slot) return;

    const lineKey = Math.round(cy / lineHeight);
    const cellKey = `${day}__${slot.id}`;
    if (!buckets[cellKey]) buckets[cellKey] = {};
    if (!buckets[cellKey][lineKey]) buckets[cellKey][lineKey] = [];
    buckets[cellKey][lineKey].push({ text: textValue, x: cx, y: cy });
  });

  Object.entries(buckets).forEach(([cellKey, lines]) => {
    const [day, slotId] = cellKey.split("__");
    const textLines = Object.values(lines)
      .map((lineWords) => ({
        y: lineWords.reduce((sum, item) => sum + item.y, 0) / lineWords.length,
        text: cleanRoutineCellLine(lineWords.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ")),
      }))
      .filter((line) => isMeaningfulRoutineLine(line.text))
      .sort((a, b) => a.y - b.y)
      .map((line) => line.text);

    if (textLines.length) nextCells[day][slotId] = textLines.join("\n");
  });

  return nextCells;
}

function buildCellsFromDayWordPositions(words, canvas, days, slots) {
  const nextCells = ensureCells({}, days, slots);
  const dayWords = [];

  words.forEach((word) => {
    const day = normalizeDay(word.text);
    if (day) dayWords.push({ ...word, day });
  });

  const bestDayByLabel = new Map();
  dayWords.forEach((word) => {
    const current = bestDayByLabel.get(word.day);
    if (!current || word.confidence > current.confidence) bestDayByLabel.set(word.day, word);
  });

  const selectedDays = days.map((day) => bestDayByLabel.get(day)).filter(Boolean).sort((a, b) => a.cy - b.cy);
  if (selectedDays.length < 2) return nextCells;

  const rowCenters = selectedDays.map((item) => ({ day: item.day, y: item.cy }));
  const distances = [];
  for (let i = 1; i < rowCenters.length; i += 1) distances.push(rowCenters[i].y - rowCenters[i - 1].y);
  const rowHeight = distances.length ? median(distances) : canvas.height / 8;
  const firstY = rowCenters[0].y - rowHeight / 2;
  const lastY = rowCenters[rowCenters.length - 1].y + rowHeight / 2;
  const leftDayX = Math.min(...selectedDays.map((word) => word.x0));
  const leftX = Math.max(0, leftDayX - canvas.width * 0.03);
  const rightX = canvas.width * 0.92;
  const columnWidth = (rightX - leftX) / (slots.length + 1);
  const slotStartX = leftX + columnWidth;
  const buckets = {};

  words.forEach((word) => {
    const textValue = cleanOcrToken(word.text);
    if (!textValue || normalizeDay(textValue)) return;
    if (word.cy < firstY || word.cy > lastY || word.cx < slotStartX || word.cx > rightX) return;

    const dayIndex = nearestIndex(rowCenters.map((item) => item.y), word.cy);
    const day = rowCenters[dayIndex]?.day;
    const slotIndex = Math.floor((word.cx - slotStartX) / columnWidth);
    const slot = slots[slotIndex];
    if (!day || !slot || slotIndex < 0 || slotIndex >= slots.length) return;

    const cellKey = `${day}__${slot.id}`;
    const lineKey = Math.round(word.cy / 22);
    if (!buckets[cellKey]) buckets[cellKey] = {};
    if (!buckets[cellKey][lineKey]) buckets[cellKey][lineKey] = [];
    buckets[cellKey][lineKey].push({ text: textValue, x: word.cx, y: word.cy });
  });

  Object.entries(buckets).forEach(([cellKey, lines]) => {
    const [day, slotId] = cellKey.split("__");
    const textLines = Object.values(lines)
      .map((lineWords) => ({
        y: lineWords.reduce((sum, item) => sum + item.y, 0) / lineWords.length,
        text: cleanRoutineCellLine(lineWords.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ")),
      }))
      .filter((line) => isMeaningfulRoutineLine(line.text))
      .sort((a, b) => a.y - b.y)
      .map((line) => line.text);

    if (textLines.length) nextCells[day][slotId] = textLines.join("\n");
  });

  return nextCells;
}

function findCellIndex(lines, position) {
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (position >= lines[i] && position <= lines[i + 1]) return i;
  }
  return -1;
}

function cleanOcrToken(token = "") {
  return String(token)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[|_[\]{}]/g, "")
    .replace(/^[-—–]+|[-—–]+$/g, "")
    .trim();
}

function cleanRoutineCellLine(line = "") {
  return normalizeSpaces(line)
    .replace(/\b1CT\b/gi, "ICT")
    .replace(/\bI\s*C\s*T\b/gi, "ICT")
    .replace(/\bC\s*S\s*E\b/gi, "CSE")
    .replace(/\bR\s*[;：.]\s*/gi, "R: ")
    .replace(/\bR\s*:\s*/gi, "R: ")
    .replace(/\b(CSE|ICT)\s+(\d{3,4})\b/gi, (_, prefix, code) => `${prefix.toUpperCase()} ${code}`)
    .replace(/\s+-\s+/g, "-")
    .trim();
}

function isMeaningfulRoutineLine(line = "") {
  const value = String(line || "").trim();
  if (!value) return false;
  if (normalizeDay(value)) return false;
  if (/^(Day\/Time|Course|Intake|Section|Room)$/i.test(value)) return false;
  return /[A-Za-z0-9]/.test(value);
}

function nearestIndex(values, target) {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  values.forEach((value, index) => {
    const distance = Math.abs(value - target);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function median(values) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}


async function buildRoutineUsingCellOcr(canvas, fileName = "", setProgress) {
  const candidates = [canvas, rotateCanvas(canvas, 180)];
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const routine = await buildDayRowRoutineFromGridOcr(candidate, fileName, setProgress);
      if (countFilledRoutineCells(routine) > 0) return routine;
    } catch (err) {
      lastError = err;
      console.warn("Day-row routine OCR attempt failed", err);
    }

    try {
      const routine = await buildAnnexScheduleFromGridOcr(candidate, fileName, setProgress);
      if (countFilledRoutineCells(routine) > 0) return routine;
    } catch (err) {
      lastError = err;
      console.warn("Annex schedule OCR attempt failed", err);
    }
  }

  throw lastError || new Error("Routine OCR failed");
}

function countFilledRoutineCells(routine) {
  if (!routine?.days?.length || !routine?.timeSlots?.length) return 0;
  return routine.days.reduce((count, day) => {
    return count + routine.timeSlots.filter((slot) => String(routine.cells?.[day]?.[slot.id] || "").trim()).length;
  }, 0);
}

async function buildDayRowRoutineFromGridOcr(canvas, fileName = "", setProgress) {
  const grid = detectRoutineGridFromCanvas(canvas, DEFAULT_TIME_SLOTS.length, DEFAULT_DAYS.length);
  if (!grid) throw new Error("Teacher routine grid was not detected");

  const routine = createRoutineShell({
    days: DEFAULT_DAYS,
    timeSlots: DEFAULT_TIME_SLOTS,
    sourceFileName: fileName,
    importedAt: new Date().toISOString(),
  });

  const worker = await createRoutineOcrWorker(setProgress, "6");
  try {
    const { verticalLines, horizontalLines } = grid;
    const total = DEFAULT_DAYS.length * DEFAULT_TIME_SLOTS.length;
    let done = 0;

    for (let rowIndex = 0; rowIndex < DEFAULT_DAYS.length; rowIndex += 1) {
      const day = DEFAULT_DAYS[rowIndex];
      for (let slotIndex = 0; slotIndex < DEFAULT_TIME_SLOTS.length; slotIndex += 1) {
        const slot = DEFAULT_TIME_SLOTS[slotIndex];
        done += 1;
        setProgress?.(`Reading routine cells... ${done}/${total}`);

        const rect = makeCellRect(verticalLines[slotIndex + 1], horizontalLines[rowIndex + 1], verticalLines[slotIndex + 2], horizontalLines[rowIndex + 2]);
        if (!cellHasReadableInk(canvas, rect)) continue;

        const crop = createHighContrastCropCanvas(canvas, rect, 3);
        const text = cleanRoutineCellText(await recognizeWithWorker(worker, crop));
        if (isProbablyRoutineClassText(text)) routine.cells[day][slot.id] = text;
      }
    }
  } finally {
    await terminateRoutineOcrWorker(worker);
  }

  if (countFilledRoutineCells(routine) === 0) throw new Error("No class cells were detected in teacher routine grid");
  return routine;
}

async function buildAnnexScheduleFromGridOcr(canvas, fileName = "", setProgress) {
  const grid = detectAnnexScheduleGridFromCanvas(canvas);
  if (!grid) throw new Error("Annex schedule grid was not detected");

  const worker = await createRoutineOcrWorker(setProgress, "6");
  const entries = [];
  const slotMap = new Map();
  let days = [];

  try {
    const { verticalLines, horizontalLines } = grid;

    setProgress?.("Reading day headers...");
    for (let colIndex = 0; colIndex < verticalLines.length - 1; colIndex += 1) {
      const rect = makeCellRect(verticalLines[colIndex], horizontalLines[0], verticalLines[colIndex + 1], horizontalLines[1], 2);
      const text = cleanRoutineCellText(await recognizeWithWorker(worker, createHighContrastCropCanvas(canvas, rect, 4), "7"));
      const day = normalizeDay(text);
      if (day) days.push({ day, colIndex });
    }

    if (days.length < 3) throw new Error("Day headers were not detected");

    const total = (horizontalLines.length - 2) * days.length;
    let done = 0;

    for (let rowIndex = 1; rowIndex < horizontalLines.length - 1; rowIndex += 1) {
      for (const dayInfo of days) {
        done += 1;
        setProgress?.(`Reading class schedule cells... ${done}/${total}`);

        const rect = makeCellRect(verticalLines[dayInfo.colIndex], horizontalLines[rowIndex], verticalLines[dayInfo.colIndex + 1], horizontalLines[rowIndex + 1]);
        if (!cellHasReadableInk(canvas, rect)) continue;

        const rawText = cleanRoutineCellText(await recognizeWithWorker(worker, createHighContrastCropCanvas(canvas, rect, 2.6)));
        if (!rawText || !/(CSE|ICT)\s*\d{3,4}/i.test(rawText)) continue;

        const slot = extractTimeSlotFromCellText(rawText);
        if (!slot) continue;

        const slotKey = `${slot.start}__${slot.end}`;
        if (!slotMap.has(slotKey)) {
          slotMap.set(slotKey, {
            id: `slot_${slotMap.size + 1}`,
            start: slot.start,
            end: slot.end,
            shift: slot.shift,
            label: `${slot.start} to\n${slot.end}\n(${slot.shift})`,
          });
        }

        const cellText = cleanAnnexCellToRoutineText(rawText);
        if (isProbablyRoutineClassText(cellText)) {
          entries.push({ day: dayInfo.day, slotKey, text: cellText });
        }
      }
    }
  } finally {
    await terminateRoutineOcrWorker(worker);
  }

  if (!entries.length || !slotMap.size) throw new Error("No class cells were detected in annex schedule grid");

  const uniqueDays = days.map((item) => item.day).filter((day, index, array) => array.indexOf(day) === index);
  const timeSlots = [...slotMap.values()].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const oldToNewSlotId = new Map();
  timeSlots.forEach((slot, index) => {
    const oldId = slot.id;
    slot.id = `slot_${index + 1}`;
    slot.label = `${slot.start} to\n${slot.end}\n(${slot.shift})`;
    oldToNewSlotId.set(oldId, slot.id);
  });

  const slotKeyToNewId = new Map();
  [...slotMap.entries()].forEach(([key, slot]) => {
    const sortedSlot = timeSlots.find((item) => item.start === slot.start && item.end === slot.end);
    if (sortedSlot) slotKeyToNewId.set(key, sortedSlot.id);
  });

  const routine = createRoutineShell({
    days: uniqueDays,
    timeSlots,
    sourceFileName: fileName,
    importedAt: new Date().toISOString(),
  });

  entries.forEach((entry) => {
    const slotId = slotKeyToNewId.get(entry.slotKey);
    if (entry.day && slotId) routine.cells[entry.day][slotId] = entry.text;
  });

  return routine;
}

function detectAnnexScheduleGridFromCanvas(canvas) {
  if (!canvas) return null;

  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !width || !height) return null;

  const image = ctx.getImageData(0, 0, width, height).data;
  const verticalCounts = new Uint32Array(width);
  const horizontalCounts = new Uint32Array(height);

  for (let y = 0; y < height; y += 1) {
    let rowCount = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const r = image[offset];
      const g = image[offset + 1];
      const b = image[offset + 2];
      const a = image[offset + 3];
      if (a > 30 && r < 95 && g < 95 && b < 95) {
        verticalCounts[x] += 1;
        rowCount += 1;
      }
    }
    horizontalCounts[y] = rowCount;
  }

  const verticalLines = pickLineSet(verticalCounts, [0.48, 0.4, 0.3, 0.2, 0.12], height, 8, "vertical");
  const horizontalLines = pickLineSet(horizontalCounts, [0.48, 0.4, 0.3, 0.2, 0.12], width, 9, "horizontal");

  if (!verticalLines || !horizontalLines || verticalLines.length < 7 || horizontalLines.length < 6) return null;

  return {
    verticalLines: verticalLines.slice(0, Math.min(verticalLines.length, 10)),
    horizontalLines: horizontalLines.slice(0, Math.min(horizontalLines.length, 14)),
  };
}

function makeCellRect(x0, y0, x1, y1, padding = 6) {
  return {
    left: Math.round(Math.min(x0, x1) + padding),
    top: Math.round(Math.min(y0, y1) + padding),
    width: Math.max(1, Math.round(Math.abs(x1 - x0) - padding * 2)),
    height: Math.max(1, Math.round(Math.abs(y1 - y0) - padding * 2)),
  };
}

function cellHasReadableInk(canvas, rect) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || rect.width < 8 || rect.height < 8) return false;

  const image = ctx.getImageData(rect.left, rect.top, rect.width, rect.height).data;
  let darkPixels = 0;
  const total = rect.width * rect.height;

  for (let i = 0; i < image.length; i += 4) {
    const r = image[i];
    const g = image[i + 1];
    const b = image[i + 2];
    const a = image[i + 3];
    const lightness = (r + g + b) / 3;
    if (a > 30 && lightness < 165) darkPixels += 1;
  }

  return darkPixels > Math.max(45, total * 0.0012);
}

function createHighContrastCropCanvas(sourceCanvas, rect, scale = 3) {
  const canvas = document.createElement("canvas");
  const width = Math.max(1, Math.round(rect.width * scale));
  const height = Math.max(1, Math.round(rect.height * scale));
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(sourceCanvas, rect.left, rect.top, rect.width, rect.height, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const value = gray < 185 ? 0 : 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function createRoutineOcrWorker(setProgress, psm = "6") {
  const Tesseract = await import("tesseract.js");
  const logger = (m) => {
    if (m.status === "recognizing text") {
      setProgress?.(`OCR processing... ${Math.round((m.progress || 0) * 100)}%`);
    }
  };

  const createWorker = Tesseract.createWorker || Tesseract.default?.createWorker;
  if (typeof createWorker === "function") {
    const worker = await createWorker("eng", 1, { logger });
    if (typeof worker.setParameters === "function") {
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: String(psm),
          preserve_interword_spaces: "1",
        });
      } catch (err) {
        console.warn("Could not set OCR parameters. Continuing with defaults.", err);
      }
    }
    return { type: "worker", worker };
  }

  const recognize = Tesseract.recognize || Tesseract.default?.recognize;
  if (typeof recognize !== "function") throw new Error("Tesseract recognize function was not found");
  return { type: "single", recognize, logger };
}

async function recognizeWithWorker(ocr, canvas, psm = "6") {
  if (ocr?.type === "worker") {
    if (typeof ocr.worker.setParameters === "function") {
      try {
        await ocr.worker.setParameters({ tessedit_pageseg_mode: String(psm) });
      } catch (err) {
        console.warn("Could not update OCR PSM", err);
      }
    }
    const result = await ocr.worker.recognize(canvas);
    return result?.data?.text || "";
  }

  const result = await ocr.recognize(canvas, "eng", {
    logger: ocr.logger,
    tessedit_pageseg_mode: String(psm),
    preserve_interword_spaces: "1",
  });
  return result?.data?.text || "";
}

async function terminateRoutineOcrWorker(ocr) {
  if (ocr?.type === "worker" && typeof ocr.worker.terminate === "function") {
    await ocr.worker.terminate();
  }
}

function cleanRoutineCellText(text = "") {
  const lines = String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => cleanRoutineCellLine(line))
    .map((line) => line
      .replace(/\b1CT\b/gi, "ICT")
      .replace(/\bI\s*C\s*T\b/gi, "ICT")
      .replace(/\bC\s*S\s*E\b/gi, "CSE")
      .replace(/\bR\s*[;：.]\s*/gi, "R: ")
      .replace(/\bR\s*:?\s*(\d{3,4})\b/gi, "R: $1")
      .replace(/\b(CSE|ICT)\s*(\d{3,4})\b/gi, (_, prefix, code) => `${prefix.toUpperCase()} ${code}`)
      .replace(/\b(\d{2,3})\s*\/\s*(\d{1,2})\b/g, "$1-$2")
      .replace(/\s+/g, " ")
      .trim())
    .filter(Boolean)
    .filter((line) => !/^(Course|Intake|Section|Program|Day\/Time)$/i.test(line));

  return lines.join("\n").trim();
}

function isProbablyRoutineClassText(text = "") {
  const value = String(text || "").trim();
  if (!value) return false;
  return /(CSE|ICT)\s*\d{3,4}/i.test(value) || /\bR\s*:\s*\d{3,4}\b/i.test(value);
}

function extractTimeSlotFromCellText(text = "") {
  const flat = normalizeSpaces(text);
  const match = flat.match(/(\d{1,2}\s*[:.]\s*\d{2}\s*(?:A\s*M|P\s*M|AM|PM))\s*to\s*(\d{1,2}\s*[:.]\s*\d{2}\s*(?:A\s*M|P\s*M|AM|PM))/i);
  if (!match) return null;
  const start = normalizeTime(match[1]);
  const end = normalizeTime(match[2]);
  const shift = normalizeShift(start.includes("PM") ? "EVE" : "Day");
  return { start, end, shift };
}

function cleanAnnexCellToRoutineText(text = "") {
  const flat = normalizeSpaces(text)
    .replace(/=>/g, ">")
    .replace(/\bR\s*[;：.]\s*/gi, "R: ");

  const courseMatch = flat.match(/\b((?:CSE|ICT)\s*\d{3,4})\b/i);
  const intakeMatch = flat.match(/Intake\s*:?\s*(\d{1,3})\s*[\/-]\s*(\d{1,2})/i);
  const roomMatch = flat.match(/B\s*:?\s*(\d+)\s*>?\s*R\s*:?\s*(\d{2,4})/i) || flat.match(/R\s*:?\s*(\d{3,4})/i);

  const lines = [];
  if (courseMatch) lines.push(normalizeCourseCode(courseMatch[1]));
  if (intakeMatch) lines.push(`${intakeMatch[1]}-${intakeMatch[2]}`);
  if (roomMatch) {
    if (roomMatch[2]) lines.push(`R: ${roomMatch[1]}${roomMatch[2]}`);
    else lines.push(`R: ${roomMatch[1]}`);
  }

  if (lines.length) return lines.join("\n");

  return cleanRoutineCellText(
    text.replace(/\d{1,2}\s*[:.]\s*\d{2}\s*(?:A\s*M|P\s*M|AM|PM)\s*to\s*\d{1,2}\s*[:.]\s*\d{2}\s*(?:A\s*M|P\s*M|AM|PM)/gi, "")
  );
}

function TeacherRoutineBuilderPage() {
  const fileInputRef = useRef(null);
  const [routine, setRoutine] = useState(emptyRoutine);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState("");

  const filledCells = useMemo(() => {
    return routine.days.reduce((count, day) => {
      return count + routine.timeSlots.filter((slot) => routine.cells?.[day]?.[slot.id]).length;
    }, 0);
  }, [routine]);

  useEffect(() => {
    let ignore = false;

    const loadRoutine = async () => {
      try {
        setLoading(true);
        const data = await getMyRoutine();
        if (ignore) return;

        if (data?.routine) {
          const days = data.routine.days?.length ? data.routine.days : DEFAULT_DAYS;
          const timeSlots = data.routine.timeSlots?.length ? data.routine.timeSlots : DEFAULT_TIME_SLOTS;
          setRoutine(createRoutineShell({ ...data.routine, days, timeSlots }));
        } else {
          setRoutine(emptyRoutine());
        }
      } catch (err) {
        console.error(err);
        Swal.fire("Failed", err?.response?.data?.message || "Could not load routine", "error");
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    loadRoutine();
    return () => {
      ignore = true;
    };
  }, []);

  const updateMeta = (field, value) => {
    setRoutine((prev) => ({ ...prev, [field]: value }));
  };

  const updateCell = (day, slotId, value) => {
    setRoutine((prev) => ({
      ...prev,
      cells: {
        ...prev.cells,
        [day]: {
          ...(prev.cells?.[day] || {}),
          [slotId]: value,
        },
      },
    }));
  };

  const updateSlot = (slotId, field, value) => {
    setRoutine((prev) => {
      const timeSlots = prev.timeSlots.map((slot) => {
        if (slot.id !== slotId) return slot;
        const next = { ...slot, [field]: value };
        if (field !== "label") {
          next.label = `${next.start || "Start"} to\n${next.end || "End"}\n(${next.shift || ""})`;
        }
        return next;
      });
      return { ...prev, timeSlots, cells: ensureCells(prev.cells, prev.days, timeSlots) };
    });
  };

  const addTimeSlot = () => {
    setRoutine((prev) => {
      const id = `slot_${Date.now()}`;
      const timeSlots = [...prev.timeSlots, { id, label: "New Time Slot", start: "", end: "", shift: "" }];
      return { ...prev, timeSlots, cells: ensureCells(prev.cells, prev.days, timeSlots) };
    });
  };

  const removeTimeSlot = (slotId) => {
    setRoutine((prev) => {
      const timeSlots = prev.timeSlots.filter((slot) => slot.id !== slotId);
      return { ...prev, timeSlots, cells: ensureCells(prev.cells, prev.days, timeSlots) };
    });
  };

  const handleFileImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setExtracting(true);
      setProgress("Rendering routine page...");

      const canvas = await renderFileToCanvas(file);
      const parsedRoutine = await buildRoutineUsingCellOcr(canvas, file.name, setProgress);

      setRoutine(parsedRoutine);
      Swal.fire({
        icon: "success",
        title: "Routine imported",
        text: `Detected ${countFilledRoutineCells(parsedRoutine)} class cells. Please review once, then click Save Routine.`,
      });
    } catch (err) {
      console.error("Routine import failed", err);
      Swal.fire(
        "Import failed",
        err?.message || "Could not read this routine automatically. Try a clearer PDF/image, or enter the table manually.",
        "error"
      );
    } finally {
      setExtracting(false);
      setProgress("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        ...routine,
        cells: ensureCells(routine.cells, routine.days, routine.timeSlots),
        importedAt: routine.importedAt || new Date().toISOString(),
      };
      const data = await saveMyRoutine(payload);
      const saved = data?.routine || payload;
      setRoutine(createRoutineShell(saved));
      Swal.fire("Saved", "Routine saved successfully.", "success");
    } catch (err) {
      console.error(err);
      Swal.fire("Failed", err?.response?.data?.message || "Could not save routine", "error");
    } finally {
      setSaving(false);
    }
  };

  const resetRoutine = () => {
    setRoutine(emptyRoutine());
  };

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center text-slate-500 dark:text-slate-400">
        Loading routine...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="relative p-6 sm:p-8">
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-sky-500/10" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                BUBT Marks Portal · Routine
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Create / Update Routine
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Upload the routine PDF/image to auto-detect days, time slots and class cells. This is the editing page; after saving, the sidebar Routine page will show only the final routine.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[28rem]">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={extracting}
                className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {extracting ? "Reading PDF..." : "Upload / Update Routine PDF"}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || extracting}
                className="rounded-2xl border border-slate-200 bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {saving ? "Saving..." : "Save Routine"}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Print Routine
              </button>
              <button
                type="button"
                onClick={resetRoutine}
                className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-bold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
              >
                Reset Draft
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={handleFileImport}
          />

          {extracting && (
            <div className="relative mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm font-semibold text-violet-800 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200">
              {progress || "Reading routine..."}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Days" value={routine.days.length} />
        <SummaryCard label="Time Slots" value={routine.timeSlots.length} />
        <SummaryCard label="Class Cells" value={filledCells} />
        <SummaryCard label="Courses" value={routine.courses.length} />
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Routine Information</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">These fields appear above the printable routine.</p>
          </div>
          {routine.sourceFileName && (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              Source: {routine.sourceFileName}
            </span>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TextInput label="University Name" value={routine.universityName} onChange={(v) => updateMeta("universityName", v)} />
          <TextInput label="Faculty Name" value={routine.facultyName} onChange={(v) => updateMeta("facultyName", v)} />
          <TextInput label="Faculty Code" value={routine.facultyCode} onChange={(v) => updateMeta("facultyCode", v)} />
          <TextInput label="Department" value={routine.department} onChange={(v) => updateMeta("department", v)} />
          <TextInput label="Building / Room Note" value={routine.buildingNote} onChange={(v) => updateMeta("buildingNote", v)} />
          <TextInput label="Revision" value={routine.revision} onChange={(v) => updateMeta("revision", v)} />
          <TextInput label="Last Modified Text" value={routine.lastModifiedText} onChange={(v) => updateMeta("lastModifiedText", v)} />
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Time Slots</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Edit the slot headers if OCR reads any time incorrectly.</p>
          </div>
          <button
            type="button"
            onClick={addTimeSlot}
            className="rounded-2xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Add Slot
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {routine.timeSlots.map((slot, index) => (
            <div key={slot.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/70">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Slot {index + 1}</span>
                {routine.timeSlots.length > 1 && (
                  <button type="button" onClick={() => removeTimeSlot(slot.id)} className="text-xs font-bold text-rose-600 dark:text-rose-300">
                    Remove
                  </button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <TextInput small label="Start" value={slot.start} onChange={(v) => updateSlot(slot.id, "start", v)} />
                <TextInput small label="End" value={slot.end} onChange={(v) => updateSlot(slot.id, "end", v)} />
                <TextInput small label="Shift" value={slot.shift} onChange={(v) => updateSlot(slot.id, "shift", v)} />
              </div>
              <label className="mt-3 block text-xs font-bold text-slate-600 dark:text-slate-300">
                Header Label
                <textarea
                  value={slot.label}
                  onChange={(e) => updateSlot(slot.id, "label", e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-violet-500/20"
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 print:border-0 print:bg-white print:p-0 print:shadow-none">
        <div className="routine-print-area overflow-x-auto rounded-3xl bg-white p-4 text-slate-950 print:overflow-visible print:p-0">
          <RoutineHeader routine={routine} />

          <table className="min-w-[980px] border-collapse text-center text-slate-950 print:min-w-full">
            <thead>
              <tr>
                <th className="w-32 border border-black bg-slate-100 px-3 py-4 text-xl font-black">Day/Time</th>
                {routine.timeSlots.map((slot) => (
                  <th key={slot.id} className="w-44 border border-black bg-slate-100 px-3 py-3 align-middle text-lg font-black leading-tight whitespace-pre-line">
                    {slot.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routine.days.map((day) => (
                <tr key={day}>
                  <th className="border border-black bg-slate-50 px-3 py-8 text-2xl font-black">{day}</th>
                  {routine.timeSlots.map((slot) => (
                    <td key={`${day}-${slot.id}`} className="h-28 border border-black align-middle">
                      <textarea
                        value={routine.cells?.[day]?.[slot.id] || ""}
                        onChange={(e) => updateCell(day, slot.id, e.target.value)}
                        placeholder={"Course\nIntake-Section\nR: Room"}
                        className="min-h-24 w-full resize-none border-0 bg-transparent px-2 py-2 text-center text-lg font-semibold leading-snug text-slate-950 outline-none placeholder:text-slate-300 print:placeholder:text-transparent"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {routine.courses.length > 0 && (
            <div className="mt-8 flex justify-center">
              <table className="w-full max-w-2xl border-collapse text-sm text-slate-950">
                <thead>
                  <tr>
                    <th className="border border-black px-2 py-2 font-black">Course Code</th>
                    <th className="border border-black px-2 py-2 font-black">Course Title</th>
                    <th className="border border-black px-2 py-2 font-black">Intake</th>
                    <th className="border border-black px-2 py-2 font-black">Section</th>
                    <th className="border border-black px-2 py-2 font-black">Program</th>
                  </tr>
                </thead>
                <tbody>
                  {routine.courses.map((course, index) => (
                    <tr key={`${course.code}-${index}`}>
                      <td className="border border-black px-2 py-2">{course.code}</td>
                      <td className="border border-black px-2 py-2">{course.title}</td>
                      <td className="border border-black px-2 py-2">{course.intake}</td>
                      <td className="border border-black px-2 py-2">{course.section}</td>
                      <td className="border border-black px-2 py-2">{course.program}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .routine-print-area, .routine-print-area * { visibility: visible; }
          .routine-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          textarea { overflow: hidden; }
        }
      `}</style>
    </div>
  );
}

function RoutineHeader({ routine }) {
  return (
    <div className="mb-4 flex items-start gap-4 text-slate-950">
      <img src="/logo.png" alt="BUBT logo" className="mt-1 h-14 w-14 object-contain" />
      <div className="flex-1 text-center">
        <h2 className="text-xl font-bold leading-tight">{routine.universityName}</h2>
        {routine.buildingNote && <p className="text-sm font-semibold">{routine.buildingNote}</p>}
        <h3 className="mt-2 text-lg font-black">{routine.title || "Class Routine"}</h3>
        {routine.department && <p className="text-sm font-semibold">Department: {routine.department}</p>}
        <p className="mt-1 text-sm font-semibold">
          Faculty Name: {routine.facultyName || "—"} {routine.facultyCode ? `| Faculty Code: ${routine.facultyCode}` : ""}
        </p>
      </div>
      <div className="min-w-40 text-right text-xs font-semibold leading-5">
        {routine.revision && <div>Revision: {routine.revision}</div>}
        {routine.lastModifiedText && <div>Last Modified: {routine.lastModifiedText}</div>}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function TextInput({ label, value, onChange, small = false }) {
  return (
    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
      {label}
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className={[
          "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-violet-500/20",
          small ? "py-2" : "py-3",
        ].join(" ")}
      />
    </label>
  );
}

export default TeacherRoutineBuilderPage;
