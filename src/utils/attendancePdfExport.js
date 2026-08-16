import { jsPDF } from "jspdf";
import { getDepartmentLineForProgram } from "../constants/bubtAcademicPrograms";

const UNIVERSITY_NAME = "Bangladesh University of Business and Technology (BUBT)";
const REPORT_TITLE = "Attendance Report";
const DEFAULT_PROGRAM = "B.Sc. Engg. in CSE";
const DEFAULT_DESIGNATION = "Assistant Professor";
const DEFAULT_DEPARTMENT = "Department of Computer Science & Engineering, BUBT";

const safeText = (value, fallback = "") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const formatDate = (value) => {
  const raw = safeText(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  return `${match[3]}-${match[2]}-${match[1].slice(-2)}`;
};

const inferProgram = (course = {}) => {
  const explicit = safeText(course.department || course.program);
  if (explicit) return explicit;

  const searchable = `${safeText(course.code)} ${safeText(course.title)}`.toUpperCase();
  if (searchable.includes("BBA") || searchable.includes("BUSINESS")) {
    return "Bachelor of Business Administration (BBA)";
  }
  if (searchable.includes("ECONOMICS")) return "B.Sc. (Hons.) in Economics";
  if (searchable.includes("EEE")) return "B.Sc. Engg. in EEE";
  if (searchable.includes("ICE")) return "B.Sc. Engg. in ICE";
  if (searchable.includes("CSE")) return "B.Sc. Engg. in CSE";
  return DEFAULT_PROGRAM;
};

const normalizeDepartment = (value) => {
  const text = safeText(value);
  if (!text) return DEFAULT_DEPARTMENT;

  const withoutUniversity = text.replace(/,?\s*BUBT\s*$/i, "").trim();
  if (/^CSE$/i.test(withoutUniversity)) return DEFAULT_DEPARTMENT;
  if (/^Department\s+of\s+/i.test(withoutUniversity)) return `${withoutUniversity}, BUBT`;
  return `Department of ${withoutUniversity}, BUBT`;
};

const safeFilePart = (value) =>
  safeText(value)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");

const makeFileName = ({ course = {}, teacher = {}, filterLabel = "" }) => {
  const parts = [
    safeFilePart(course.intake),
    safeFilePart(course.section),
    safeFilePart(course.code),
    safeFilePart(teacher.shortCode),
    filterLabel ? "Filtered" : "",
  ].filter(Boolean);
  return `${parts.length ? parts.join("-") : "Attendance-Report"}.pdf`;
};

const fitText = (doc, text, maxWidth, preferredSize, minSize = 5.5) => {
  const normalized = safeText(text);
  let size = preferredSize;
  doc.setFontSize(size);
  while (size > minSize && doc.getTextWidth(normalized) > maxWidth) {
    size -= 0.25;
    doc.setFontSize(size);
  }
  if (doc.getTextWidth(normalized) <= maxWidth) return { text: normalized, size };

  let shortened = normalized;
  while (shortened.length > 1 && doc.getTextWidth(`${shortened}...`) > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return { text: `${shortened}...`, size };
};

const drawCenteredLabelValue = (doc, pageWidth, label, value, y, size = 11.5) => {
  doc.setFont("times", "bold");
  doc.setFontSize(size);
  const labelWidth = doc.getTextWidth(label);
  doc.setFont("times", "normal");
  const valueWidth = doc.getTextWidth(value);
  const startX = (pageWidth - labelWidth - valueWidth) / 2;
  doc.setFont("times", "bold");
  doc.text(label, startX, y);
  doc.setFont("times", "normal");
  doc.text(value, startX + labelWidth, y);
};

const groupSessionsByDate = (sessions = []) => {
  const groups = [];
  const groupByDate = new Map();
  sessions.forEach((session, index) => {
    const rawDate = safeText(session.date, `Session ${index + 1}`);
    if (!groupByDate.has(rawDate)) {
      const group = { key: rawDate, date: rawDate, label: formatDate(rawDate), sessions: [] };
      groupByDate.set(rawDate, group);
      groups.push(group);
    }
    groupByDate.get(rawDate).sessions.push(session);
  });
  return groups;
};

const buildStudentRows = ({ sessions, dateGroups, students, matrix, rows }) => {
  const rowMeta = new Map(rows.map((row) => [String(row.roll), row]));
  return students.map((student) => {
    const roll = String(student.roll);
    let calculatedPresent = 0;
    const attendance = dateGroups.map((dateGroup) => {
      const presentOnDate = dateGroup.sessions.reduce(
        (count, session) => count + (Boolean(matrix?.[roll]?.[session.key]) ? 1 : 0),
        0
      );
      calculatedPresent += presentOnDate;
      return presentOnDate > 0 ? String(presentOnDate) : "A";
    });
    const meta = rowMeta.get(roll);
    const totalPresent = Number(meta?.presentCount ?? calculatedPresent);
    const totalClasses = Number(meta?.totalClasses ?? sessions.length);
    const savedPercentage = Number(meta?.percentage);
    const percentage = Number.isFinite(savedPercentage)
      ? savedPercentage
      : totalClasses > 0
        ? Number(((totalPresent / totalClasses) * 100).toFixed(2))
        : 0;
    return {
      roll,
      name: safeText(student.name),
      attendance,
      totalPresent,
      totalClasses,
      percentage,
      remarks: "",
    };
  });
};

export const createAttendancePdf = ({
  data,
  computed,
  teacherFallback = {},
  filterLabel = "",
}) => {
  if (!data?.course || !computed) {
    throw new Error("Attendance data is not ready for PDF export.");
  }

  const sessions = computed.sessions || [];
  const students = computed.students || [];
  const matrix = computed.matrix || {};
  const rows = computed.rows || [];
  const dateGroups = groupSessionsByDate(sessions);
  const studentRows = buildStudentRows({ sessions, dateGroups, students, matrix, rows });

  const orientation = dateGroups.length <= 8 ? "portrait" : "landscape";
  const doc = new jsPDF({
    orientation,
    unit: "pt",
    format: "letter",
    compress: true,
    putOnlyUsedFonts: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const isLandscape = orientation === "landscape";
  const hasFilter = Boolean(safeText(filterLabel));

  const course = data.course || {};
  const courseDepartmentLine = getDepartmentLineForProgram(course.department || course.program);
  const teacher = {
    name: safeText(data.teacher?.name, safeText(teacherFallback.name, "Course Teacher")),
    shortCode: safeText(data.teacher?.shortCode, safeText(teacherFallback.shortCode)),
    designation: safeText(
      data.teacher?.designation,
      safeText(teacherFallback.designation, DEFAULT_DESIGNATION)
    ),
    department:
      courseDepartmentLine ||
      normalizeDepartment(data.teacher?.department || teacherFallback.department),
  };

  const tableX = 0.5;
  const tableWidth = pageWidth - 1;
  const tableTop = hasFilter ? 139 : 120;
  const headerHeight = 45;
  const notesHeight = isLandscape ? 72 : 90;
  const rowHeight = isLandscape ? 18 : 20.5;
  const bottomMargin = 7;

  const idWidth = 92;
  const nameWidth = isLandscape ? 145 : 135;
  const summaryWidth = isLandscape ? 39 : 36;
  const remarksWidth = isLandscape ? 70 : 59;
  const fixedWidth = idWidth + nameWidth + summaryWidth * 3 + remarksWidth;
  const dateWidth = dateGroups.length
    ? Math.max(1, (tableWidth - fixedWidth) / dateGroups.length)
    : 0;

  const columns = [
    { key: "roll", width: idWidth, type: "id" },
    { key: "name", width: nameWidth, type: "name" },
    ...dateGroups.map((dateGroup, index) => ({
      key: dateGroup.key,
      width: dateWidth,
      type: "date",
      label: dateGroup.label,
      dateIndex: index,
    })),
    { key: "totalPresent", width: summaryWidth, type: "summary", label: "T. Attn." },
    { key: "totalClasses", width: summaryWidth, type: "summary", label: "T. Class" },
    { key: "percentage", width: summaryWidth, type: "summary", label: "Per. (%)" },
    { key: "remarks", width: remarksWidth, type: "remarks", label: "Remarks" },
  ];

  const drawPageHeading = () => {
    doc.setTextColor(0, 0, 0);
    doc.setFont("times", "bold");
    doc.setFontSize(isLandscape ? 14.5 : 15.5);
    doc.text(UNIVERSITY_NAME, pageWidth / 2, 22, { align: "center" });
    doc.setFontSize(isLandscape ? 14 : 15);
    doc.text(REPORT_TITLE, pageWidth / 2, 43, { align: "center" });
    drawCenteredLabelValue(doc, pageWidth, "Program: ", inferProgram(course), 69, 11.5);
    drawCenteredLabelValue(
      doc,
      pageWidth,
      "Semester: ",
      `${safeText(course.semester)}, ${safeText(course.year)}`,
      94,
      11.5
    );

    if (hasFilter) {
      doc.setFont("times", "bold");
      doc.setFontSize(9.5);
      doc.text(`Filtered Students: ${safeText(filterLabel)}`, pageWidth / 2, 113, {
        align: "center",
      });
    }

    const courseY = hasFilter ? 132 : 113;
    doc.setFontSize(9.5);
    doc.setFont("times", "bold");
    doc.text("Course: ", 2, courseY);
    const courseLabelStart = 2 + doc.getTextWidth("Course: ");

    const intakeSection = [safeText(course.intake), safeText(course.section)]
      .filter(Boolean)
      .join("-");
    const rightLabel = `Intake-Section: ${intakeSection || safeText(course.section, "-")}`;
    doc.setFont("times", "bold");
    const rightWidth = doc.getTextWidth(rightLabel);
    doc.text(rightLabel, pageWidth - 2, courseY, { align: "right" });

    doc.setFont("times", "normal");
    const label = `${safeText(course.title)} (${safeText(course.code)})`;
    const maxCourseWidth = Math.max(40, pageWidth - courseLabelStart - rightWidth - 18);
    const fitted = fitText(doc, label, maxCourseWidth, 9.5, 7);
    doc.setFontSize(fitted.size);
    doc.text(fitted.text, courseLabelStart, courseY);
  };

  const drawTableHeader = (y) => {
    doc.setLineWidth(0.8);
    doc.setDrawColor(0, 0, 0);
    doc.setTextColor(0, 0, 0);
    let x = tableX;
    columns.forEach((column) => {
      doc.rect(x, y, column.width, headerHeight);
      doc.setFont("times", "bold");
      doc.setFontSize(column.type === "date" && dateGroups.length > 12 ? 6.4 : 8.5);
      if (column.type === "id") {
        doc.setFontSize(8.5);
        doc.text("Date", x + column.width - 3, y + 9, { align: "right" });
        doc.text("ID", x + column.width / 2, y + 31, { align: "center" });
      } else if (column.type === "name") {
        doc.text("Name", x + column.width / 2, y + 27, { align: "center" });
      } else {
        const fontSize = column.type === "date" && dateGroups.length > 12 ? 6.4 : 8.2;
        doc.setFontSize(fontSize);
        doc.text(column.label || "", x + column.width / 2 + 2.5, y + headerHeight - 3, {
          align: "left",
          angle: 90,
        });
      }
      x += column.width;
    });
  };

  const drawNotesRow = (y) => {
    let x = tableX;
    columns.forEach((column) => {
      doc.rect(x, y, column.width, notesHeight);
      if (column.type === "id") {
        doc.setFont("times", "bold");
        doc.setFontSize(8.5);
        doc.text("Notes", x + column.width / 2, y + notesHeight / 2 + 3, { align: "center" });
      }
      x += column.width;
    });
  };

  const drawStudentRow = (row, y) => {
    let x = tableX;
    columns.forEach((column) => {
      doc.rect(x, y, column.width, rowHeight);
      doc.setTextColor(0, 0, 0);
      let value = "";
      if (column.type === "id") value = row.roll;
      if (column.type === "name") value = row.name;
      if (column.type === "date") value = row.attendance[column.dateIndex];
      if (column.type === "summary" || column.type === "remarks") {
        value = String(row[column.key] ?? "");
      }

      if (column.type === "id") {
        doc.setFont("times", "bold");
        const fitted = fitText(doc, value, column.width - 6, 8, 6.5);
        doc.setFontSize(fitted.size);
        doc.text(fitted.text, x + column.width / 2, y + rowHeight / 2 + 2.7, { align: "center" });
      } else if (column.type === "name") {
        doc.setFont("times", "normal");
        const fitted = fitText(doc, value, column.width - 7, 8, 6.2);
        doc.setFontSize(fitted.size);
        doc.text(fitted.text, x + 4, y + rowHeight / 2 + 2.7);
      } else {
        doc.setFont("times", "normal");
        doc.setFontSize(column.type === "date" && dateGroups.length > 16 ? 6.5 : 7.8);
        doc.text(value, x + column.width / 2, y + rowHeight / 2 + 2.5, { align: "center" });
      }
      x += column.width;
    });
  };

  const firstPageCapacity = Math.max(
    1,
    Math.floor((pageHeight - tableTop - headerHeight - notesHeight - bottomMargin) / rowHeight)
  );
  const regularPageCapacity = Math.max(
    1,
    Math.floor((pageHeight - tableTop - headerHeight - bottomMargin) / rowHeight)
  );

  const pageChunks = [];
  if (!studentRows.length) {
    pageChunks.push([]);
  } else {
    pageChunks.push(studentRows.slice(0, firstPageCapacity));
    let cursor = firstPageCapacity;
    while (cursor < studentRows.length) {
      pageChunks.push(studentRows.slice(cursor, cursor + regularPageCapacity));
      cursor += regularPageCapacity;
    }
  }

  let lastTableBottom = tableTop + headerHeight;
  pageChunks.forEach((chunk, pageIndex) => {
    if (pageIndex > 0) doc.addPage("letter", orientation);
    drawPageHeading();
    drawTableHeader(tableTop);
    let y = tableTop + headerHeight;
    if (pageIndex === 0) {
      drawNotesRow(y);
      y += notesHeight;
    }
    chunk.forEach((row) => {
      drawStudentRow(row, y);
      y += rowHeight;
    });
    lastTableBottom = y;
  });

  const signatureHeight = 39;
  let signatureY = lastTableBottom + 52;
  if (signatureY + signatureHeight > pageHeight - 10) {
    doc.addPage("letter", orientation);
    drawPageHeading();
    signatureY = tableTop + 35;
  }

  const signatureName = teacher.shortCode ? `${teacher.name} (${teacher.shortCode})` : teacher.name;
  doc.setTextColor(0, 0, 0);
  doc.setFont("times", "bold");
  doc.setFontSize(10);
  doc.text(signatureName, 1, signatureY);
  doc.setFont("times", "normal");
  doc.setFontSize(9.5);
  doc.text(teacher.designation, 1, signatureY + 14);
  doc.text(teacher.department, 1, signatureY + 28);

  return {
    doc,
    filename: makeFileName({ course, teacher, filterLabel }),
  };
};

export const exportAttendancePdf = (args) => {
  const { doc, filename } = createAttendancePdf(args);
  doc.save(filename);
};
