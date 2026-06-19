import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { getMyRoutine, saveMyRoutine } from "../services/routineService";

const DEFAULT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

const DEFAULT_TIME_SLOTS = [
  { id: "slot_1", label: "08:15 AM to\n09:45 AM\n(Day)", start: "08:15 AM", end: "09:45 AM", shift: "Day" },
  { id: "slot_2", label: "09:45 AM to\n11:15 AM\n(Day)", start: "09:45 AM", end: "11:15 AM", shift: "Day" },
  { id: "slot_3", label: "11:15 AM to\n12:45 PM\n(Day)", start: "11:15 AM", end: "12:45 PM", shift: "Day" },
  { id: "slot_4", label: "01:15 PM to\n02:45 PM\n(Day)", start: "01:15 PM", end: "02:45 PM", shift: "Day" },
  { id: "slot_5", label: "02:45 PM to\n04:15 PM\n(Day)", start: "02:45 PM", end: "04:15 PM", shift: "Day" },
  { id: "slot_6", label: "04:15 PM to\n05:45 PM\n(Day)", start: "04:15 PM", end: "05:45 PM", shift: "Day" },
  { id: "slot_7", label: "05:45 PM to\n07:00 PM\n(EVE)", start: "05:45 PM", end: "07:00 PM", shift: "EVE" },
  { id: "slot_8", label: "07:00 PM to\n08:15 PM\n(EVE)", start: "07:00 PM", end: "08:15 PM", shift: "EVE" },
  { id: "slot_9", label: "08:15 PM to\n09:30 PM\n(EVE)", start: "08:15 PM", end: "09:30 PM", shift: "EVE" },
];

function emptyRoutine() {
  return createRoutineShell();
}

function createRoutineShell(overrides = {}) {
  const days =
    Array.isArray(overrides.days) && overrides.days.length
      ? overrides.days
      : DEFAULT_DAYS;

  const timeSlots =
    Array.isArray(overrides.timeSlots) && overrides.timeSlots.length
      ? overrides.timeSlots
      : DEFAULT_TIME_SLOTS;

  return {
    title: overrides.title || "Class Routine",
    universityName:
      overrides.universityName ||
      "Bangladesh University of Business and Technology (BUBT)",
    facultyName:
      overrides.facultyName || localStorage.getItem("marksPortalName") || "",
    facultyCode: overrides.facultyCode || "",
    department: overrides.department || "",
    buildingNote: overrides.buildingNote || "",
    revision: overrides.revision || "",
    lastModifiedText: overrides.lastModifiedText || "",
    days,
    timeSlots,
    cells: ensureCells(overrides.cells || {}, days, timeSlots),
    courses: Array.isArray(overrides.courses) ? overrides.courses : [],
    counsellingSlots: normalizeCounsellingSlots(
      overrides.counsellingSlots || [],
      days,
      timeSlots,
      ensureCells(overrides.cells || {}, days, timeSlots)
    ),
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

function makeCounsellingKey(day, slotId) {
  return `${day}__${slotId}`;
}

function normalizeCounsellingSlots(counsellingSlots = [], days = DEFAULT_DAYS, timeSlots = DEFAULT_TIME_SLOTS, cells = {}) {
  const daySet = new Set(days);
  const slotSet = new Set(timeSlots.map((slot) => slot.id));
  const seen = new Set();

  return (Array.isArray(counsellingSlots) ? counsellingSlots : [])
    .map((item) => ({
      day: String(item?.day || "").trim(),
      slotId: String(item?.slotId || item?.id || "").trim(),
    }))
    .filter((item) => {
      const key = makeCounsellingKey(item.day, item.slotId);
      if (!daySet.has(item.day) || !slotSet.has(item.slotId) || seen.has(key)) return false;
      if (String(cells?.[item.day]?.[item.slotId] || "").trim()) return false;
      seen.add(key);
      return true;
    });
}

function getCounsellingSlotDetails(routine) {
  const selected = normalizeCounsellingSlots(
    routine?.counsellingSlots || [],
    routine?.days || [],
    routine?.timeSlots || [],
    routine?.cells || {}
  );

  return selected.map((item) => {
    const slot = (routine?.timeSlots || []).find((s) => s.id === item.slotId) || {};
    return {
      ...item,
      label: slot.label || "",
      start: slot.start || "",
      end: slot.end || "",
    };
  });
}

function formatSlotTime(slot = {}) {
  const startEnd = [slot.start, slot.end].filter(Boolean).join(" - ");
  return startEnd || String(slot.label || "").replace(/\n/g, " ") || "Time slot";
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
    sun: "Sun",
    sunday: "Sun",
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
  };

  return map[value] || null;
}

function normalizeCourseCode(value = "") {
  return String(value).replace(/\s+/g, " ").trim().toUpperCase();
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

function extractTimes(text = "") {
  const matches =
    String(text).match(
      /\d{1,2}\s*[:.]\s*\d{2}\s*(?:A\s*M|P\s*M|AM|PM)/gi
    ) || [];

  return matches.map(normalizeTime);
}

function parseTimeSlotFromHeader(text = "", index = 0) {
  const clean = normalizeSpaces(text);
  const times = extractTimes(clean);

  if (times.length >= 2) {
    const shiftMatch = clean.match(/\b(Day|EVE|Evening)\b/i);
    const shift = normalizeShift(
      shiftMatch?.[1] || (times[0].includes("PM") ? "EVE" : "Day")
    );

    return makeTimeSlot(index, times[0], times[1], shift);
  }

  return {
    id: `slot_${index + 1}`,
    label: clean || `Slot ${index + 1}`,
    start: "",
    end: "",
    shift: "",
  };
}

function isProbablyRoutineClassText(text = "") {
  const value = String(text || "").trim();
  if (!value) return false;

  return (
    /(CSE|ICT|EEE|ENG|MAT|PHY|CHE|ACC|BUS|BBA|GED)\s*\d{2,4}/i.test(value) ||
    /\bR\s*:\s*\d{2,4}\b/i.test(value) ||
    /\b\d{2,3}\s*[-/]\s*\d{1,2}\b/.test(value)
  );
}

function cleanRoutineCellLine(line = "") {
  return normalizeSpaces(line)
    .replace(/\b1CT\b/gi, "ICT")
    .replace(/\bI\s*C\s*T\b/gi, "ICT")
    .replace(/\bC\s*S\s*E\b/gi, "CSE")
    .replace(/\bE\s*E\s*E\b/gi, "EEE")
    .replace(/\bR\s*[;：.]\s*/gi, "R: ")
    .replace(/\bR\s*:?\s*(\d{2,4})\b/gi, "R: $1")
    .replace(/\b(CSE|ICT|EEE|ENG|MAT|PHY|CHE|ACC|BUS|GED)\s*(\d{2,4})\b/gi, (_, prefix, code) => `${prefix.toUpperCase()} ${code}`)
    .replace(/\b(\d{2,3})\s*\/\s*(\d{1,2})\b/g, "$1-$2")
    .replace(/\s+-\s+/g, "-")
    .trim();
}

function cleanRoutineCellText(text = "") {
  const lines = String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(cleanRoutineCellLine)
    .filter(Boolean)
    .filter((line) => !/^(Course|Intake|Section|Program|Day\/Time|Room)$/i.test(line));

  return lines.join("\n").trim();
}

function countFilledRoutineCells(routine) {
  if (!routine?.days?.length || !routine?.timeSlots?.length) return 0;

  return routine.days.reduce((count, day) => {
    return (
      count +
      routine.timeSlots.filter((slot) =>
        String(routine.cells?.[day]?.[slot.id] || "").trim()
      ).length
    );
  }, 0);
}

function reorderItems(items = [], sourceIndex, targetIndex) {
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
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

function detectGridLines(canvas) {
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

      if (a > 30 && r < 110 && g < 110 && b < 110) {
        verticalCounts[x] += 1;
        rowCount += 1;
      }
    }

    horizontalCounts[y] = rowCount;
  }

  const verticalLines = pickBestLines(verticalCounts, height, "vertical");
  const horizontalLines = pickBestLines(horizontalCounts, width, "horizontal");

  if (!verticalLines.length || !horizontalLines.length) return null;

  return {
    verticalLines,
    horizontalLines,
  };
}

function pickBestLines(counts, oppositeSize, type) {
  const ratios =
    type === "vertical"
      ? [0.45, 0.38, 0.3, 0.24, 0.18, 0.12, 0.08]
      : [0.45, 0.38, 0.3, 0.24, 0.18, 0.12, 0.08];

  for (const ratio of ratios) {
    const threshold = Math.max(35, oppositeSize * ratio);
    const lines = getLineCenters(counts, threshold);

    if (lines.length >= 3) {
      return lines;
    }
  }

  return [];
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

  const merged = [];

  centers.forEach((center) => {
    const last = merged[merged.length - 1];

    if (last != null && Math.abs(center - last) <= 8) {
      merged[merged.length - 1] = Math.round((last + center) / 2);
    } else {
      merged.push(center);
    }
  });

  return merged;
}

function makeCellRect(x0, y0, x1, y1, padding = 6) {
  return {
    left: Math.round(Math.min(x0, x1) + padding),
    top: Math.round(Math.min(y0, y1) + padding),
    width: Math.max(1, Math.round(Math.abs(x1 - x0) - padding * 2)),
    height: Math.max(1, Math.round(Math.abs(y1 - y0) - padding * 2)),
  };
}

function cropCanvas(sourceCanvas, rect, scale = 3) {
  const canvas = document.createElement("canvas");
  const width = Math.max(1, Math.round(rect.width * scale));
  const height = Math.max(1, Math.round(rect.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.drawImage(
    sourceCanvas,
    rect.left,
    rect.top,
    rect.width,
    rect.height,
    0,
    0,
    width,
    height
  );

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

  return darkPixels > Math.max(30, total * 0.0008);
}

async function createOcrWorker(setProgress, psm = "6") {
  const Tesseract = await import("tesseract.js");

  const logger = (m) => {
    if (m.status === "recognizing text") {
      setProgress?.(`OCR processing... ${Math.round((m.progress || 0) * 100)}%`);
    }
  };

  const createWorker = Tesseract.createWorker || Tesseract.default?.createWorker;

  if (typeof createWorker === "function") {
    const worker = await createWorker("eng", 1, { logger });

    try {
      await worker.setParameters({
        tessedit_pageseg_mode: String(psm),
        preserve_interword_spaces: "1",
      });
    } catch (err) {
      console.warn("Could not set OCR parameters", err);
    }

    return { type: "worker", worker };
  }

  const recognize = Tesseract.recognize || Tesseract.default?.recognize;

  if (typeof recognize !== "function") {
    throw new Error("Tesseract recognize function was not found");
  }

  return { type: "single", recognize, logger };
}

async function recognizeWithWorker(ocr, canvas, psm = "6") {
  if (ocr?.type === "worker") {
    try {
      await ocr.worker.setParameters({ tessedit_pageseg_mode: String(psm) });
    } catch (err) {
      console.warn("Could not update OCR PSM", err);
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

async function terminateOcrWorker(ocr) {
  if (ocr?.type === "worker" && typeof ocr.worker.terminate === "function") {
    await ocr.worker.terminate();
  }
}

function inferRoutineTable(verticalLines, horizontalLines, canvas) {
  const width = canvas.width;
  const height = canvas.height;

  const filteredVertical = verticalLines.filter(
    (x) => x > width * 0.03 && x < width * 0.97
  );

  const filteredHorizontal = horizontalLines.filter(
    (y) => y > height * 0.08 && y < height * 0.9
  );

  let best = null;
  let bestScore = -Infinity;

  for (let vi = 0; vi < filteredVertical.length - 2; vi += 1) {
    for (let vj = vi + 2; vj < filteredVertical.length; vj += 1) {
      const vLines = filteredVertical.slice(vi, vj + 1);
      if (vLines.length < 3 || vLines.length > 18) continue;

      const tableWidth = vLines[vLines.length - 1] - vLines[0];
      if (tableWidth < width * 0.35) continue;

      for (let hi = 0; hi < filteredHorizontal.length - 2; hi += 1) {
        for (let hj = hi + 2; hj < filteredHorizontal.length; hj += 1) {
          const hLines = filteredHorizontal.slice(hi, hj + 1);
          if (hLines.length < 3 || hLines.length > 12) continue;

          const tableHeight = hLines[hLines.length - 1] - hLines[0];
          if (tableHeight < height * 0.12) continue;

          const slots = vLines.length - 2;
          const days = hLines.length - 2;

          if (slots < 1 || days < 1) continue;

          const slotScore = Math.min(slots, 13) * 8;
          const dayScore = Math.min(days, 6) * 10;
          const sizeScore = (tableWidth / width) * 40 + (tableHeight / height) * 25;
          const topPenalty = hLines[0] * 0.005;

          const score = slotScore + dayScore + sizeScore - topPenalty;

          if (score > bestScore) {
            bestScore = score;
            best = {
              verticalLines: vLines,
              horizontalLines: hLines,
              slots,
              days,
            };
          }
        }
      }
    }
  }

  return best;
}

async function buildRoutineUsingDynamicGridOcr(canvas, fileName = "", setProgress) {
  const candidates = [
    canvas,
    rotateCanvas(canvas, 90),
    rotateCanvas(canvas, -90),
    rotateCanvas(canvas, 180),
  ];

  let bestRoutine = null;
  let bestCount = 0;

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = candidates[candidateIndex];

    try {
      setProgress?.(`Detecting table layout... ${candidateIndex + 1}/${candidates.length}`);

      const gridLines = detectGridLines(candidate);
      if (!gridLines) continue;

      const table = inferRoutineTable(
        gridLines.verticalLines,
        gridLines.horizontalLines,
        candidate
      );

      if (!table) continue;

      const routine = await readRoutineFromDynamicTable(
        candidate,
        table,
        fileName,
        setProgress
      );

      const filled = countFilledRoutineCells(routine);

      if (filled > bestCount) {
        bestCount = filled;
        bestRoutine = routine;
      }

      if (filled > 0) return routine;
    } catch (err) {
      console.warn("Dynamic routine OCR attempt failed", err);
    }
  }

  if (bestRoutine) return bestRoutine;

  return createRoutineShell({
    sourceFileName: fileName,
    importedAt: new Date().toISOString(),
  });
}

async function readRoutineFromDynamicTable(canvas, table, fileName = "", setProgress) {
  const { verticalLines, horizontalLines, slots, days } = table;

  const worker = await createOcrWorker(setProgress, "6");

  try {
    const detectedDays = [];
    const detectedSlots = [];
    const cells = {};

    setProgress?.("Reading day names...");

    for (let rowIndex = 0; rowIndex < days; rowIndex += 1) {
      const rect = makeCellRect(
        verticalLines[0],
        horizontalLines[rowIndex + 1],
        verticalLines[1],
        horizontalLines[rowIndex + 2],
        4
      );

      const text = cleanRoutineCellText(
        await recognizeWithWorker(worker, cropCanvas(canvas, rect, 4), "7")
      );

      const day = normalizeDay(text) || `Day ${rowIndex + 1}`;
      detectedDays.push(day);
    }

    setProgress?.("Reading time slots...");

    for (let slotIndex = 0; slotIndex < slots; slotIndex += 1) {
      const rect = makeCellRect(
        verticalLines[slotIndex + 1],
        horizontalLines[0],
        verticalLines[slotIndex + 2],
        horizontalLines[1],
        4
      );

      const text = cleanRoutineCellText(
        await recognizeWithWorker(worker, cropCanvas(canvas, rect, 4), "6")
      );

      detectedSlots.push(parseTimeSlotFromHeader(text, slotIndex));
    }

    detectedDays.forEach((day) => {
      cells[day] = {};
      detectedSlots.forEach((slot) => {
        cells[day][slot.id] = "";
      });
    });

    const total = days * slots;
    let done = 0;

    for (let rowIndex = 0; rowIndex < days; rowIndex += 1) {
      const day = detectedDays[rowIndex];

      for (let slotIndex = 0; slotIndex < slots; slotIndex += 1) {
        const slot = detectedSlots[slotIndex];

        done += 1;
        setProgress?.(`Reading routine cells... ${done}/${total}`);

        const rect = makeCellRect(
          verticalLines[slotIndex + 1],
          horizontalLines[rowIndex + 1],
          verticalLines[slotIndex + 2],
          horizontalLines[rowIndex + 2],
          5
        );

        if (!cellHasReadableInk(canvas, rect)) continue;

        const text = cleanRoutineCellText(
          await recognizeWithWorker(worker, cropCanvas(canvas, rect, 3), "6")
        );

        if (isProbablyRoutineClassText(text)) {
          cells[day][slot.id] = text;
        }
      }
    }

    const routine = createRoutineShell({
      days: detectedDays,
      timeSlots: detectedSlots,
      cells,
      sourceFileName: fileName,
      importedAt: new Date().toISOString(),
    });

    return routine;
  } finally {
    await terminateOcrWorker(worker);
  }
}

function TeacherRoutineBuilderPage() {
  const fileInputRef = useRef(null);
  const [routine, setRoutine] = useState(emptyRoutine);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState("");
  const [draggingDay, setDraggingDay] = useState(null);
  const [draggingSlotId, setDraggingSlotId] = useState(null);

  const filledCells = useMemo(() => {
    return countFilledRoutineCells(routine);
  }, [routine]);

  const counsellingSlotDetails = useMemo(() => {
    return getCounsellingSlotDetails(routine);
  }, [routine]);

  const counsellingKeySet = useMemo(() => {
    return new Set(counsellingSlotDetails.map((item) => makeCounsellingKey(item.day, item.slotId)));
  }, [counsellingSlotDetails]);

  useEffect(() => {
    let ignore = false;

    const loadRoutine = async () => {
      try {
        setLoading(true);
        const data = await getMyRoutine();

        if (ignore) return;

        if (data?.routine) {
          setRoutine(createRoutineShell(data.routine));
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

  const toggleCounsellingSlot = (day, slotId) => {
    setRoutine((prev) => {
      const classCell = String(prev.cells?.[day]?.[slotId] || "").trim();
      if (classCell) return prev;

      const key = makeCounsellingKey(day, slotId);
      const current = normalizeCounsellingSlots(
        prev.counsellingSlots || [],
        prev.days,
        prev.timeSlots,
        prev.cells
      );
      const isSelected = current.some((item) => makeCounsellingKey(item.day, item.slotId) === key);
      const counsellingSlots = isSelected
        ? current.filter((item) => makeCounsellingKey(item.day, item.slotId) !== key)
        : [...current, { day, slotId }];

      return {
        ...prev,
        counsellingSlots,
      };
    });
  };

  const updateSlot = (slotId, field, value) => {
    setRoutine((prev) => {
      const timeSlots = prev.timeSlots.map((slot) => {
        if (slot.id !== slotId) return slot;

        const next = { ...slot, [field]: value };

        if (field !== "label") {
          const start = next.start || "Start";
          const end = next.end || "End";
          const shift = next.shift || "";
          next.label = `${start} to\n${end}${shift ? `\n(${shift})` : ""}`;
        }

        return next;
      });

      return {
        ...prev,
        timeSlots,
        cells: ensureCells(prev.cells, prev.days, timeSlots),
      };
    });
  };

  const addTimeSlot = () => {
    setRoutine((prev) => {
      const id = `slot_${Date.now()}`;
      const timeSlots = [
        ...prev.timeSlots,
        {
          id,
          label: "New Time Slot",
          start: "",
          end: "",
          shift: "",
        },
      ];

      return {
        ...prev,
        timeSlots,
        cells: ensureCells(prev.cells, prev.days, timeSlots),
      };
    });
  };

  const removeTimeSlot = (slotId) => {
    setRoutine((prev) => {
      const timeSlots = prev.timeSlots.filter((slot) => slot.id !== slotId);
      const cells = {};

      prev.days.forEach((day) => {
        cells[day] = {};
        timeSlots.forEach((slot) => {
          cells[day][slot.id] = prev.cells?.[day]?.[slot.id] || "";
        });
      });

      return {
        ...prev,
        timeSlots,
        cells,
      };
    });
  };

  const addDay = () => {
    setRoutine((prev) => {
      const nextDay = `Day ${prev.days.length + 1}`;
      const days = [...prev.days, nextDay];

      return {
        ...prev,
        days,
        cells: ensureCells(prev.cells, days, prev.timeSlots),
      };
    });
  };

  const updateDayName = (oldDay, newDay) => {
    const cleanNewDay = newDay.trim() || oldDay;

    setRoutine((prev) => {
      const days = prev.days.map((day) => (day === oldDay ? cleanNewDay : day));
      const cells = {};

      days.forEach((day) => {
        const sourceDay = day === cleanNewDay ? oldDay : day;
        cells[day] = {};
        prev.timeSlots.forEach((slot) => {
          cells[day][slot.id] = prev.cells?.[sourceDay]?.[slot.id] || "";
        });
      });

      return {
        ...prev,
        days,
        cells,
      };
    });
  };

  const removeDay = (dayToRemove) => {
    setRoutine((prev) => {
      if (prev.days.length <= 1) return prev;

      const days = prev.days.filter((day) => day !== dayToRemove);
      const cells = {};

      days.forEach((day) => {
        cells[day] = prev.cells?.[day] || {};
      });

      return {
        ...prev,
        days,
        cells: ensureCells(cells, days, prev.timeSlots),
      };
    });
  };

  const reorderDays = (sourceDay, targetDay) => {
    if (!sourceDay || !targetDay || sourceDay === targetDay) return;

    setRoutine((prev) => {
      const sourceIndex = prev.days.indexOf(sourceDay);
      const targetIndex = prev.days.indexOf(targetDay);
      const days = reorderItems(prev.days, sourceIndex, targetIndex);

      return {
        ...prev,
        days,
        cells: ensureCells(prev.cells, days, prev.timeSlots),
        counsellingSlots: normalizeCounsellingSlots(
          prev.counsellingSlots,
          days,
          prev.timeSlots,
          prev.cells
        ),
      };
    });
  };

  const reorderTimeSlots = (sourceSlotId, targetSlotId) => {
    if (!sourceSlotId || !targetSlotId || sourceSlotId === targetSlotId) return;

    setRoutine((prev) => {
      const sourceIndex = prev.timeSlots.findIndex((slot) => slot.id === sourceSlotId);
      const targetIndex = prev.timeSlots.findIndex((slot) => slot.id === targetSlotId);
      const timeSlots = reorderItems(prev.timeSlots, sourceIndex, targetIndex);
      const cells = ensureCells(prev.cells, prev.days, timeSlots);

      return {
        ...prev,
        timeSlots,
        cells,
        counsellingSlots: normalizeCounsellingSlots(
          prev.counsellingSlots,
          prev.days,
          timeSlots,
          cells
        ),
      };
    });
  };

  const handleDayDragStart = (event, day) => {
    setDraggingDay(day);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", day);
  };

  const handleSlotDragStart = (event, slotId) => {
    setDraggingSlotId(slotId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", slotId);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleFileImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setExtracting(true);
      setProgress("Rendering routine page...");

      const canvas = await renderFileToCanvas(file);
      const parsedRoutine = await buildRoutineUsingDynamicGridOcr(
        canvas,
        file.name,
        setProgress
      );

      setRoutine(parsedRoutine);

      const detectedCells = countFilledRoutineCells(parsedRoutine);

      if (detectedCells > 0) {
        Swal.fire({
          icon: "success",
          title: "Routine imported",
          text: `Detected ${detectedCells} class cells. Please review once, then click Save Routine.`,
        });
      } else {
        Swal.fire({
          icon: "info",
          title: "Editable routine created",
          text: "The file was loaded, but class cells were not detected clearly. You can still edit the table manually and save it.",
        });
      }
    } catch (err) {
      console.error("Routine import failed", err);

      const fallback = createRoutineShell({
        sourceFileName: file.name,
        importedAt: new Date().toISOString(),
      });

      setRoutine(fallback);

      Swal.fire({
        icon: "info",
        title: "Editable routine created",
        text: "Auto-read could not detect the table clearly, but the page will not stop. You can enter the routine manually and save it.",
      });
    } finally {
      setExtracting(false);
      setProgress("");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const cells = ensureCells(routine.cells, routine.days, routine.timeSlots);
      const payload = {
        ...routine,
        cells,
        counsellingSlots: normalizeCounsellingSlots(
          routine.counsellingSlots,
          routine.days,
          routine.timeSlots,
          cells
        ),
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
                Upload any routine PDF/image. The system will try to detect the
                table dynamically. If detection is not perfect, the editable
                table will still open so you can correct it manually.
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
        <SummaryCard label="Counselling Hours" value={counsellingSlotDetails.length} />
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">
              Routine Information
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              These fields are saved with the routine.
            </p>
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
            <h2 className="text-lg font-black text-slate-900 dark:text-white">
              Days
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Rename, add, remove or drag days to reorder the routine rows.
            </p>
          </div>

          <button
            type="button"
            onClick={addDay}
            className="rounded-2xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Add Day
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {routine.days.map((day, index) => (
            <div
              key={day}
              onDragOver={handleDragOver}
              onDrop={(event) => {
                event.preventDefault();
                reorderDays(draggingDay || event.dataTransfer.getData("text/plain"), day);
                setDraggingDay(null);
              }}
              className={[
                "rounded-2xl border bg-slate-50 p-3 transition dark:bg-slate-900",
                draggingDay === day
                  ? "border-violet-400 ring-2 ring-violet-200 dark:border-violet-400 dark:ring-violet-500/20"
                  : "border-slate-200 dark:border-slate-700",
              ].join(" ")}
            >
              <div
                draggable
                onDragStart={(event) => handleDayDragStart(event, day)}
                onDragEnd={() => setDraggingDay(null)}
                className="mb-3 flex cursor-grab items-center justify-between rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-500 active:cursor-grabbing dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400"
                title="Drag to reorder"
              >
                <span>☰ Day {index + 1}</span>
                <span className="text-[10px] uppercase tracking-wide">Drag</span>
              </div>

              <TextInput
                small
                label="Day"
                value={day}
                onChange={(value) => updateDayName(day, value)}
              />

              {routine.days.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDay(day)}
                  className="mt-2 text-xs font-bold text-rose-600 dark:text-rose-300"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">
              Time Slots
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Edit the slot headers or drag slots to reorder the routine columns.
            </p>
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
            <div
              key={slot.id}
              onDragOver={handleDragOver}
              onDrop={(event) => {
                event.preventDefault();
                reorderTimeSlots(draggingSlotId || event.dataTransfer.getData("text/plain"), slot.id);
                setDraggingSlotId(null);
              }}
              className={[
                "rounded-3xl border bg-slate-50 p-4 transition dark:bg-slate-900/70",
                draggingSlotId === slot.id
                  ? "border-violet-400 ring-2 ring-violet-200 dark:border-violet-400 dark:ring-violet-500/20"
                  : "border-slate-200 dark:border-slate-700",
              ].join(" ")}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div
                  draggable
                  onDragStart={(event) => handleSlotDragStart(event, slot.id)}
                  onDragEnd={() => setDraggingSlotId(null)}
                  className="inline-flex cursor-grab items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-500 active:cursor-grabbing dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400"
                  title="Drag to reorder"
                >
                  <span>☰</span>
                  <span>Slot {index + 1}</span>
                </div>

                {routine.timeSlots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTimeSlot(slot.id)}
                    className="text-xs font-bold text-rose-600 dark:text-rose-300"
                  >
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

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">
              Counselling Hour Management
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Choose free routine slots as counselling hours. Slots with classes are locked automatically.
            </p>
          </div>

          <div className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-black text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
            {counsellingSlotDetails.length} selected
          </div>
        </div>

        {counsellingSlotDetails.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {counsellingSlotDetails.map((item) => (
              <span
                key={makeCounsellingKey(item.day, item.slotId)}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
              >
                {item.day} · {formatSlotTime(item)}
              </span>
            ))}
          </div>
        )}

        <div className="overflow-x-auto rounded-3xl border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900">
                <th className="w-32 border-b border-r border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Day
                </th>
                {routine.timeSlots.map((slot) => (
                  <th
                    key={slot.id}
                    className="border-b border-r border-slate-200 px-3 py-3 text-xs font-black text-slate-600 dark:border-slate-700 dark:text-slate-300"
                  >
                    <span className="whitespace-pre-line">{slot.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routine.days.map((day) => (
                <tr key={day}>
                  <th className="border-r border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    {day}
                  </th>

                  {routine.timeSlots.map((slot) => {
                    const busy = Boolean(String(routine.cells?.[day]?.[slot.id] || "").trim());
                    const selected = counsellingKeySet.has(makeCounsellingKey(day, slot.id));

                    return (
                      <td key={`${day}-${slot.id}`} className="border-r border-t border-slate-200 p-2 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => toggleCounsellingSlot(day, slot.id)}
                          disabled={busy}
                          className={[
                            "min-h-14 w-full rounded-2xl border px-3 py-2 text-xs font-black transition",
                            busy
                              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-600"
                              : selected
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                                : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-violet-500/30 dark:hover:bg-violet-500/10 dark:hover:text-violet-300",
                          ].join(" ")}
                        >
                          {busy ? "Class" : selected ? "Counselling" : "Free Slot"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 print:border-0 print:bg-white print:p-0 print:shadow-none">
        <div className="routine-print-area overflow-x-auto rounded-3xl bg-white p-4 text-slate-950 print:overflow-visible print:p-0">
          <table className="min-w-[1100px] border-collapse text-center text-slate-950 print:min-w-full">
            <thead>
              <tr>
                <th className="w-32 border border-black bg-slate-100 px-3 py-4 text-xl font-black">
                  Day/Time
                </th>

                {routine.timeSlots.map((slot) => (
                  <th
                    key={slot.id}
                    className="w-44 whitespace-pre-line border border-black bg-slate-100 px-3 py-3 align-middle text-lg font-black leading-tight"
                  >
                    {slot.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {routine.days.map((day) => (
                <tr key={day}>
                  <th className="border border-black bg-slate-50 px-3 py-8 text-2xl font-black">
                    {day}
                  </th>

                  {routine.timeSlots.map((slot) => (
                    <td
                      key={`${day}-${slot.id}`}
                      className="h-28 border border-black align-middle"
                    >
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

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">
        {value}
      </p>
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