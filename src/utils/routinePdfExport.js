import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

import { DAY_LABELS, SLOT_MAP, getDocumentColumns } from "./routineConfig";

const UNIVERSITY_NAME = "Bangladesh University of Business and Technology (BUBT)";
const ROOM_NOTE = "Room/4-digit number, the first digit represents the building.";
const BUILDING_NOTE = "[Building-2: Martyr Sujan Mahmud Building]   [Building-3: Martyr Tahmid Abdullah Building]";

const DAY_SHORT = {
  Sat: "Sat",
  Sun: "Sun",
  Mon: "Mon",
  Tue: "Tue",
  Wed: "Wed",
  Thu: "Thu",
  Fri: "Fri",
};

const safeText = (value, fallback = "") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const safeFilePart = (value, fallback = "Routine") =>
  safeText(value, fallback)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "") || fallback;

const getClassEntry = (routine, day, slotId) => {
  const entry = routine?.entries?.[day]?.[slotId];
  return entry?.type === "CLASS" ? entry : null;
};

const formatClassCell = (entry) => {
  if (!entry) return "";

  const intakeSection = [safeText(entry.intake), safeText(entry.section)]
    .filter(Boolean)
    .join("-");
  const room = entry.room ? `R: ${safeText(entry.room)}` : "";

  return [safeText(entry.courseCode), intakeSection, room]
    .filter(Boolean)
    .join("\n");
};

const formatSlotHeader = (slot = {}) => {
  const start = safeText(slot.start);
  const end = safeText(slot.end);
  const shift = safeText(slot.shift).toLowerCase() === "evening" ? "EVE" : "Day";
  return `${start} to ${end}\n(${shift})`;
};

const normalizeKeyPart = (value) => safeText(value).toLowerCase();

const courseKey = (course = {}) =>
  [course.code || course.courseCode, course.intake, course.section]
    .map(normalizeKeyPart)
    .join("|");

const findCourseMetadata = (routine, entry) => {
  const courses = Array.isArray(routine?.courses) ? routine.courses : [];
  const key = courseKey(entry);

  return (
    courses.find((course) => courseKey(course) === key) ||
    courses.find(
      (course) =>
        normalizeKeyPart(course.id || course._id) ===
        normalizeKeyPart(entry?.courseId)
    ) ||
    courses.find(
      (course) =>
        normalizeKeyPart(course.code) === normalizeKeyPart(entry?.courseCode) &&
        (!entry?.intake || normalizeKeyPart(course.intake) === normalizeKeyPart(entry.intake)) &&
        (!entry?.section || normalizeKeyPart(course.section) === normalizeKeyPart(entry.section))
    ) ||
    null
  );
};

const shortDepartment = (value) => {
  const text = safeText(value);
  const upper = text.toUpperCase();

  if (!text) return "";
  if (/\bCSE\b/.test(upper) || upper.includes("COMPUTER SCIENCE")) return "CSE";
  if (/\bEEE\b/.test(upper) || upper.includes("ELECTRICAL AND ELECTRONIC")) return "EEE";
  if (/\bCE\b/.test(upper) || upper.includes("CIVIL ENGINEERING")) return "CE";
  if (/\bTE\b/.test(upper) || upper.includes("TEXTILE ENGINEERING")) return "TE";
  if (/\bBBA\b/.test(upper) || upper.includes("BUSINESS ADMINISTRATION")) return "BBA";
  if (/\bECO\b/.test(upper) || upper.includes("ECONOMICS")) return "ECO";
  if (/\bENG\b/.test(upper) || upper.includes("ENGLISH")) return "ENG";
  if (/\bLAW\b/.test(upper)) return "LAW";

  const compact = text
    .replace(/^department\s+of\s+/i, "")
    .replace(/^dept\.?\s+of\s+/i, "")
    .trim();

  return compact.length <= 18 ? compact : compact.slice(0, 18);
};

const shortProgram = (course = {}) => {
  const source = safeText(course.department || course.program || course.shift);
  const upper = source.toUpperCase();
  const isEvening =
    upper.includes("(DH)") ||
    upper.includes("EVENING") ||
    safeText(course.shift).toLowerCase() === "evening";

  let code = shortDepartment(source);
  if (!code) code = shortDepartment(course.title);
  if (!code) code = safeText(course.shift);

  if (code === "CSE" && isEvening) return "CSE(DH)";
  return code;
};

const collectCourseRows = (routine, classDays, slotColumns) => {
  const seen = new Set();
  const rows = [];

  classDays.forEach((day) => {
    slotColumns.forEach((column) => {
      const entry = getClassEntry(routine, day, column.id);
      if (!entry) return;

      const metadata = findCourseMetadata(routine, entry) || {};
      const merged = { ...metadata, ...entry };
      const key = courseKey(merged);
      if (seen.has(key)) return;
      seen.add(key);

      rows.push([
        safeText(merged.courseCode || merged.code),
        safeText(merged.courseTitle || merged.title),
        safeText(merged.intake),
        safeText(merged.section),
        shortProgram(merged),
      ]);
    });
  });

  return rows.sort((a, b) => {
    const codeCompare = String(a[0]).localeCompare(String(b[0]), undefined, {
      numeric: true,
    });
    if (codeCompare) return codeCompare;
    const intakeCompare = String(a[2]).localeCompare(String(b[2]), undefined, {
      numeric: true,
    });
    if (intakeCompare) return intakeCompare;
    return String(a[3]).localeCompare(String(b[3]), undefined, { numeric: true });
  });
};

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read logo."));
    reader.readAsDataURL(blob);
  });

const loadLogoDataUrl = async () => {
  try {
    const response = await fetch("/logo.png", { cache: "force-cache" });
    if (!response.ok) return null;
    return await blobToDataUrl(await response.blob());
  } catch {
    return null;
  }
};

const formatModifiedDate = (value) => {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  return safeDate.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const fitSingleLine = (doc, text, maxWidth, preferredSize, minimumSize = 6) => {
  let size = preferredSize;
  doc.setFontSize(size);

  while (size > minimumSize && doc.getTextWidth(text) > maxWidth) {
    size -= 0.25;
    doc.setFontSize(size);
  }

  return size;
};

const drawHeader = async (doc, routine) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 28;
  const logo = await loadLogoDataUrl();

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);

  const titleWidth = doc.getTextWidth(UNIVERSITY_NAME);
  const logoWidth = logo ? 31 : 0;
  const gap = logo ? 8 : 0;
  const groupWidth = logoWidth + gap + titleWidth;
  const groupX = Math.max(margin, (pageWidth - groupWidth) / 2);

  if (logo) {
    doc.addImage(logo, "PNG", groupX, 10, logoWidth, 31);
  }

  doc.text(UNIVERSITY_NAME, groupX + logoWidth + gap, 31);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.8);
  doc.text(ROOM_NOTE, pageWidth / 2, 49, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.6);
  doc.text(BUILDING_NOTE, pageWidth / 2, 61, { align: "center" });

  const facultyName = safeText(routine.facultyName, "-").toUpperCase();
  const facultyCode = safeText(routine.facultyCode, "-").toUpperCase();
  const semesterYear = [safeText(routine.semester), safeText(routine.year)]
    .filter(Boolean)
    .join(" ");
  const department = shortDepartment(routine.department) || "-";

  doc.setFontSize(9.4);
  doc.setFont("helvetica", "bold");
  doc.text("Faculty Name:", margin, 78);
  doc.text("Faculty Code:", margin, 91);

  doc.setFont("helvetica", "normal");
  const leftValueX = margin + 67;
  fitSingleLine(doc, facultyName, pageWidth * 0.34 - leftValueX, 9.4, 7);
  doc.text(facultyName, leftValueX, 78);
  doc.setFontSize(9.4);
  doc.text(facultyCode, leftValueX, 91);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.4);
  doc.text(`Class Routine (${semesterYear})`, pageWidth / 2, 78, { align: "center" });
  doc.setFontSize(9.4);
  doc.text(`Department: ${department}`, pageWidth / 2, 91, { align: "center" });

  doc.setFontSize(9.2);
  doc.text("Revision: 1.0", pageWidth - margin, 78, { align: "right" });
  doc.text(
    `Last Modified: ${formatModifiedDate(routine.updatedAt || routine.importedAt)}`,
    pageWidth - margin,
    91,
    { align: "right" }
  );
};

export async function downloadClassRoutinePdf(routine) {
  if (!routine) {
    throw new Error("Create and save a routine first.");
  }

  const slotColumns = getDocumentColumns(routine)
    .filter((column) => column.kind === "slot")
    .filter((column) =>
      (routine.days || []).some((day) => getClassEntry(routine, day, column.id))
    );

  const classDays = (routine.days || []).filter((day) =>
    slotColumns.some((column) => getClassEntry(routine, day, column.id))
  );

  if (!slotColumns.length || !classDays.length) {
    throw new Error("No classes are available in the saved routine.");
  }

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
  });

  await drawHeader(doc, routine);

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 28;
  const usableWidth = pageWidth - margin * 2;
  const dayWidth = 54;
  const slotWidth = (usableWidth - dayWidth) / slotColumns.length;

  const head = [
    "Day/Time",
    ...slotColumns.map((column) => formatSlotHeader(SLOT_MAP[column.id] || {})),
  ];

  const body = classDays.map((day) => [
    DAY_SHORT[day] || DAY_LABELS[day] || day,
    ...slotColumns.map((column) =>
      formatClassCell(getClassEntry(routine, day, column.id))
    ),
  ]);

  const routineColumnStyles = {
    0: { cellWidth: dayWidth, fontStyle: "bold" },
  };
  slotColumns.forEach((_, index) => {
    routineColumnStyles[index + 1] = { cellWidth: slotWidth };
  });

  autoTable(doc, {
    startY: 101,
    head: [head],
    body,
    theme: "grid",
    margin: { left: margin, right: margin },
    tableWidth: usableWidth,
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 3.2,
      halign: "center",
      valign: "middle",
      overflow: "linebreak",
      lineColor: [0, 0, 0],
      lineWidth: 0.45,
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
      minCellHeight: 38,
    },
    headStyles: {
      fontStyle: "bold",
      fontSize: slotColumns.length > 9 ? 6.4 : 7.1,
      fillColor: [247, 247, 247],
      textColor: [0, 0, 0],
      minCellHeight: 36,
    },
    bodyStyles: {
      fontSize: slotColumns.length > 9 ? 7.1 : 8,
      minCellHeight: 40,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles: routineColumnStyles,
    pageBreak: "avoid",
    rowPageBreak: "avoid",
  });

  const courseRows = collectCourseRows(routine, classDays, slotColumns);
  if (courseRows.length) {
    const courseStartY = (doc.lastAutoTable?.finalY || 300) + 12;
    const courseTableWidth = Math.min(540, usableWidth * 0.72);

    autoTable(doc, {
      startY: courseStartY,
      head: [["Course Code", "Course Title", "Intake", "Section", "Program"]],
      body: courseRows,
      theme: "grid",
      margin: { left: margin, right: pageWidth - margin - courseTableWidth },
      tableWidth: courseTableWidth,
      styles: {
        font: "helvetica",
        fontSize: 7.5,
        cellPadding: 2.5,
        halign: "center",
        valign: "middle",
        lineColor: [0, 0, 0],
        lineWidth: 0.4,
        textColor: [0, 0, 0],
        fillColor: [255, 255, 255],
        minCellHeight: 15,
      },
      headStyles: {
        fontStyle: "bold",
        fillColor: [244, 244, 244],
        textColor: [0, 0, 0],
      },
      alternateRowStyles: {
        fillColor: [255, 255, 255],
      },
      columnStyles: {
        0: { cellWidth: 82 },
        1: { cellWidth: 225, halign: "center" },
        2: { cellWidth: 55 },
        3: { cellWidth: 55 },
        4: { cellWidth: courseTableWidth - 417 },
      },
      pageBreak: "auto",
      rowPageBreak: "avoid",
    });
  }

  const filename = [
    "Class_Routine",
    routine.semester ? safeFilePart(routine.semester, "") : "",
    routine.year ? safeFilePart(routine.year, "") : "",
  ]
    .filter(Boolean)
    .join("_");

  doc.save(`${filename || "Class_Routine"}.pdf`);
}
