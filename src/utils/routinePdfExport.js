import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

import { DAY_LABELS, SLOT_MAP, getDocumentColumns } from "./routineConfig";

const safeFilePart = (value, fallback = "Routine") =>
  String(value || fallback)
    .trim()
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

  const intakeSection = [entry.intake, entry.section].filter(Boolean).join("-");
  const room = entry.room ? `R: ${entry.room}` : "";

  return [entry.courseCode, intakeSection, room].filter(Boolean).join("\n");
};

export function downloadClassRoutinePdf(routine) {
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

  const head = [
    "Day / Time",
    ...slotColumns.map((column) => SLOT_MAP[column.id]?.label || column.id),
  ];

  const body = classDays.map((day) => [
    DAY_LABELS[day] || day,
    ...slotColumns.map((column) =>
      formatClassCell(getClassEntry(routine, day, column.id))
    ),
  ]);

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
  });

  autoTable(doc, {
    startY: 24,
    head: [head],
    body,
    theme: "grid",
    margin: { top: 24, right: 22, bottom: 24, left: 22 },
    styles: {
      fontSize: 8,
      cellPadding: 5,
      halign: "center",
      valign: "middle",
      overflow: "linebreak",
      lineWidth: 0.5,
    },
    headStyles: {
      fontStyle: "bold",
      minCellHeight: 34,
    },
    bodyStyles: {
      minCellHeight: 44,
    },
    columnStyles: {
      0: {
        fontStyle: "bold",
        cellWidth: 64,
      },
    },
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: 0,
  });

  const filename = [
    "Class_Routine",
    routine.semester ? safeFilePart(routine.semester, "") : "",
    routine.year ? safeFilePart(routine.year, "") : "",
  ]
    .filter(Boolean)
    .join("_");

  doc.save(`${filename || "Class_Routine"}.pdf`);
}
