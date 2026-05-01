import * as XLSX from "xlsx";

export const parseObeImportedMarkWorkbook = async (file, students = [], blueprints = []) => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const ws = workbook.Sheets["Mark Entry"];
  if (!ws) {
    throw new Error("Mark Entry sheet not found.");
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!rows.length) {
    throw new Error("Mark Entry sheet is empty.");
  }

  const headers = rows[0];
  const studentIdCol = headers.findIndex((h) => h === "Student ID");
  if (studentIdCol === -1) {
    throw new Error("Student ID column not found in Mark Entry sheet.");
  }

  const headerMeta = [];
  headers.forEach((header, index) => {
    if (typeof header !== "string") return;
    if (!header.includes(" | ")) return;
    const [assessmentName, itemLabel] = header.split(" | ").map((x) => x.trim());
    const blueprint = blueprints.find((bp) => bp.assessmentName === assessmentName);
    const item = blueprint?.items?.find((it) => it.label === itemLabel);
    if (blueprint && item) {
      headerMeta.push({
        colIndex: index,
        blueprintId: String(blueprint._id),
        itemKey: item.key,
      });
    }
  });

  const recordMap = new Map();

  rows.slice(1).forEach((row) => {
    const studentId = String(row[studentIdCol] || "").trim();
    if (!studentId) return;
    if (!students.some((s) => String(s.studentId) === studentId)) return;

    headerMeta.forEach((meta) => {
      const value = row[meta.colIndex];
      const numeric = value === "" ? 0 : Number(value || 0);
      const recordKey = `${studentId}__${meta.blueprintId}`;
      if (!recordMap.has(recordKey)) {
        recordMap.set(recordKey, {
          studentId,
          blueprintId: meta.blueprintId,
          entries: [],
        });
      }
      recordMap.get(recordKey).entries.push({
        itemKey: meta.itemKey,
        obtainedMarks: Number.isFinite(numeric) ? numeric : 0,
      });
    });
  });

  return Array.from(recordMap.values());
};