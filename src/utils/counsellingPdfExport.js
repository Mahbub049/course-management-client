import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

function cleanFilePart(value, fallback = "All") {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function formatDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value || "—";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return value || "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return value || "—";
  let hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  hour %= 12;
  if (hour === 0) hour = 12;
  return `${String(hour).padStart(2, "0")}:${minute} ${suffix}`;
}

function statusLabel(status) {
  return status === "completed" ? "Taken" : "Will Be Taken";
}

function getUniqueLabel(records, key, fallback = "All") {
  const values = [...new Set(records.map((record) => String(record?.[key] || "").trim()).filter(Boolean))];
  return values.length === 1 ? values[0] : fallback;
}

function buildRows(records = [], includeNotes = true) {
  const rows = [];
  let serial = 1;

  records.forEach((record) => {
    const participants = record.participants?.length ? record.participants : [{ roll: "—", name: "—" }];
    participants.forEach((participant, participantIndex) => {
      rows.push([
        serial,
        participantIndex === 0 ? formatDate(record.date) : "",
        participantIndex === 0
          ? [formatTime(record.startTime), record.endTime ? formatTime(record.endTime) : ""].filter(Boolean).join(" – ")
          : "",
        participant.roll || "—",
        participant.name || "—",
        participantIndex === 0 ? `${record.courseCode || "—"}\n${record.courseTitle || ""}`.trim() : "",
        participantIndex === 0
          ? [`Intake ${record.intake || "—"}`, `Section ${record.section || "—"}`].join("\n")
          : "",
        participantIndex === 0 ? record.topic || "—" : "",
        participantIndex === 0 ? statusLabel(record.sessionStatus) : "",
        participantIndex === 0
          ? [record.venue ? `Venue: ${record.venue}` : "", includeNotes ? record.notes || "" : ""]
              .filter(Boolean)
              .join("\n") || "—"
          : "",
      ]);
      serial += 1;
    });
  });

  return rows;
}

function getReportMeta(report = {}, options = {}) {
  const records = report.records || [];
  const filter = report.filters || {};
  const sessionCount = records.length;
  const participantCount = records.reduce(
    (sum, record) => sum + Math.max(record.participants?.length || 0, 1),
    0
  );

  const semester = filter.semester
    ? `${filter.semester}${filter.year ? ` ${filter.year}` : ""}`
    : getUniqueLabel(
        records.map((record) => ({ semester: [record.semester, record.year].filter(Boolean).join(" ") })),
        "semester"
      );

  return {
    title: String(options.reportTitle || "Counselling Register").trim() || "Counselling Register",
    teacherName: report.teacher?.name || "Course Teacher",
    teacherDesignation: report.teacher?.designation || "",
    department:
      report.teacher?.department ||
      getUniqueLabel(records, "department", "Department of Computer Science and Engineering"),
    semester,
    course: filter.courseId
      ? `${getUniqueLabel(records, "courseCode", "Course")} — ${getUniqueLabel(records, "courseTitle", "")}`.replace(/ — $/, "")
      : getUniqueLabel(records, "courseCode", "All Courses"),
    intake: filter.intake || getUniqueLabel(records, "intake", "All"),
    section: filter.section || getUniqueLabel(records, "section", "All"),
    status:
      filter.sessionStatus === "completed"
        ? "Counselling Taken"
        : filter.sessionStatus === "scheduled"
          ? "Will Be Taken"
          : "All Records",
    dateRange:
      filter.dateFrom || filter.dateTo
        ? `${filter.dateFrom ? formatDate(filter.dateFrom) : "Beginning"} to ${filter.dateTo ? formatDate(filter.dateTo) : "Present"}`
        : "All Dates",
    sessionCount,
    participantCount,
  };
}

export function createCounsellingReportPdf(report, options = {}) {
  const records = report?.records || [];
  const includeNotes = options.includeNotes !== false;
  const meta = getReportMeta(report, options);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 32;
  const headerBottom = 154;

  const drawPageHeader = () => {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 80, "F");
    doc.setFillColor(124, 58, 237);
    doc.roundedRect(margin, 18, 42, 42, 11, 11, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("BUBT", margin + 21, 44, { align: "center" });

    doc.setFontSize(15);
    doc.text(report.universityName || "Bangladesh University of Business and Technology (BUBT)", margin + 56, 32);
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(203, 213, 225);
    doc.text(meta.department, margin + 56, 49);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text(meta.title, pageWidth - margin, 45, { align: "right" });

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, 92, pageWidth - margin * 2, 50, 10, 10, "F");

    const summary = [
      ["Teacher", `${meta.teacherName}${meta.teacherDesignation ? `, ${meta.teacherDesignation}` : ""}`],
      ["Semester", meta.semester || "All"],
      ["Course", meta.course || "All Courses"],
      ["Intake / Section", `${meta.intake} / ${meta.section}`],
      ["Record Type", meta.status],
      ["Date Range", meta.dateRange],
      ["Sessions / Students", `${meta.sessionCount} / ${meta.participantCount}`],
    ];

    const usableWidth = pageWidth - margin * 2 - 28;
    const cellWidth = usableWidth / summary.length;
    summary.forEach(([label, value], index) => {
      const x = margin + 14 + index * cellWidth;
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text(label.toUpperCase(), x, 108);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.4);
      const clipped = doc.splitTextToSize(String(value || "—"), cellWidth - 10).slice(0, 2);
      doc.text(clipped, x, 123);
    });
  };

  const drawFooter = (pageNumber) => {
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 31, pageWidth - margin, pageHeight - 31);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated from BUBT Marks Portal • ${new Date().toLocaleString("en-GB")}`, margin, pageHeight - 17);
    doc.text(`Page ${pageNumber}`, pageWidth - margin, pageHeight - 17, { align: "right" });
  };

  drawPageHeader();

  autoTable(doc, {
    startY: headerBottom,
    head: [[
      "SL",
      "Date",
      "Time",
      "Student ID",
      "Student Name",
      "Course",
      "Intake / Section",
      "Topic / Purpose",
      "Status",
      "Venue / Remarks",
    ]],
    body: buildRows(records, includeNotes),
    margin: { top: headerBottom, left: margin, right: margin, bottom: 42 },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.2,
      cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.55,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [76, 29, 149],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
      lineColor: [76, 29, 149],
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 25, halign: "center", fontStyle: "bold" },
      1: { cellWidth: 58, halign: "center" },
      2: { cellWidth: 72, halign: "center" },
      3: { cellWidth: 66, fontStyle: "bold" },
      4: { cellWidth: 88 },
      5: { cellWidth: 78 },
      6: { cellWidth: 62, halign: "center" },
      7: { cellWidth: 118 },
      8: { cellWidth: 58, halign: "center", fontStyle: "bold" },
      9: { cellWidth: 96 },
    },
    willDrawPage: (data) => {
      if (data.pageNumber > 1) drawPageHeader();
    },
    didDrawPage: (data) => {
      drawFooter(data.pageNumber);
    },
  });

  let signatureY = (doc.lastAutoTable?.finalY || headerBottom) + 30;
  let addedSignaturePage = false;
  if (signatureY > pageHeight - 78) {
    doc.addPage();
    addedSignaturePage = true;
    drawPageHeader();
    signatureY = 205;
  }

  const signatureWidth = 190;
  const rightX = pageWidth - margin - signatureWidth;
  doc.setDrawColor(148, 163, 184);
  doc.line(margin, signatureY + 24, margin + signatureWidth, signatureY + 24);
  doc.line(rightX, signatureY + 24, rightX + signatureWidth, signatureY + 24);
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("Signature of Course Teacher", margin, signatureY + 39);
  doc.text("Signature of Head / Authorized Person", rightX, signatureY + 39);
  doc.setFont("helvetica", "normal");
  doc.text(meta.teacherName, margin, signatureY + 53);

  if (addedSignaturePage) {
    drawFooter(doc.internal.getNumberOfPages());
  }

  return doc;
}

export function downloadCounsellingReportPdf(report, options = {}) {
  const doc = createCounsellingReportPdf(report, options);
  const records = report?.records || [];
  const semester = report?.filters?.semester
    ? `${report.filters.semester}_${report.filters.year || ""}`
    : getUniqueLabel(records, "semester", "All_Semesters");
  const course = getUniqueLabel(records, "courseCode", "All_Courses");
  doc.save(`Counselling_Register_${cleanFilePart(semester)}_${cleanFilePart(course)}.pdf`);
}

export function printCounsellingReportPdf(report, options = {}) {
  const doc = createCounsellingReportPdf(report, options);
  doc.autoPrint({ variant: "non-conform" });
  const blobUrl = doc.output("bloburl");
  const printWindow = window.open(blobUrl, "_blank", "noopener,noreferrer");
  if (!printWindow) {
    doc.save("Counselling_Register_Print.pdf");
  }
}
