import JSZip from "jszip";
import {
  OBE_TEMPLATE_COLUMNS,
  OBE_TEMPLATE_LIMITS,
  buildObeTemplateLayout,
} from "./obeTemplateLayout";

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const CHART_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const SPREADSHEET_DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CORE_NS = "http://purl.org/dc/terms/";
const XML_NS = "http://www.w3.org/XML/1998/namespace";

const TEMPLATE_FILE = "OBE_BUBT_Template.xlsm";
const STUDENT_START_ROW = 30;
const STUDENT_END_ROW = 100;

const safeText = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
};

const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value) => Math.round(numberValue(value) * 100) / 100;
const round6 = (value) => Math.round(numberValue(value) * 1000000) / 1000000;

const columnNumber = (letters) => {
  let result = 0;
  for (const char of String(letters || "").toUpperCase()) {
    result = result * 26 + char.charCodeAt(0) - 64;
  }
  return result;
};

const splitCellRef = (ref) => {
  const match = /^([A-Z]+)(\d+)$/i.exec(ref);
  if (!match) throw new Error(`Invalid cell reference: ${ref}`);
  return { column: match[1].toUpperCase(), row: Number(match[2]) };
};

const parseXml = (text, path) => {
  const document = new DOMParser().parseFromString(text, "application/xml");
  const parserError = document.getElementsByTagName("parsererror")[0];
  if (parserError) {
    throw new Error(`Unable to parse ${path}: ${parserError.textContent || "XML error"}`);
  }
  return document;
};

const serializeXml = (document) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${new XMLSerializer().serializeToString(
    document.documentElement
  )}`;

const childByLocalName = (parent, localName) =>
  Array.from(parent?.childNodes || []).find(
    (node) => node.nodeType === 1 && node.localName === localName
  ) || null;

const removeChildren = (parent, localNames) => {
  Array.from(parent?.childNodes || []).forEach((node) => {
    if (node.nodeType === 1 && localNames.includes(node.localName)) {
      parent.removeChild(node);
    }
  });
};

const getSheetCellMap = (document) => {
  const map = new Map();
  Array.from(document.getElementsByTagNameNS(MAIN_NS, "c")).forEach((cell) => {
    const ref = cell.getAttribute("r");
    if (ref) map.set(ref.toUpperCase(), cell);
  });
  return map;
};

const ensureRow = (document, rowNumber) => {
  const sheetData = document.getElementsByTagNameNS(MAIN_NS, "sheetData")[0];
  if (!sheetData) throw new Error("The template worksheet has no sheetData element.");

  const existing = Array.from(sheetData.getElementsByTagNameNS(MAIN_NS, "row")).find(
    (row) => Number(row.getAttribute("r")) === rowNumber
  );
  if (existing) return existing;

  const row = document.createElementNS(MAIN_NS, "row");
  row.setAttribute("r", String(rowNumber));

  const next = Array.from(sheetData.childNodes).find(
    (node) =>
      node.nodeType === 1 &&
      node.localName === "row" &&
      Number(node.getAttribute("r")) > rowNumber
  );
  sheetData.insertBefore(row, next || null);
  return row;
};

const ensureCell = (document, cellMap, ref) => {
  const normalizedRef = ref.toUpperCase();
  if (cellMap.has(normalizedRef)) return cellMap.get(normalizedRef);

  const { row, column } = splitCellRef(normalizedRef);
  const rowNode = ensureRow(document, row);
  const cell = document.createElementNS(MAIN_NS, "c");
  cell.setAttribute("r", normalizedRef);

  const targetColumn = columnNumber(column);
  const next = Array.from(rowNode.childNodes).find((node) => {
    if (node.nodeType !== 1 || node.localName !== "c") return false;
    const nodeRef = node.getAttribute("r");
    if (!nodeRef) return false;
    return columnNumber(splitCellRef(nodeRef).column) > targetColumn;
  });

  rowNode.insertBefore(cell, next || null);
  cellMap.set(normalizedRef, cell);
  return cell;
};

const appendValueNode = (document, cell, value) => {
  const valueNode = document.createElementNS(MAIN_NS, "v");
  valueNode.textContent = value;
  cell.appendChild(valueNode);
};

const writeCellValue = (document, cellMap, ref, value, { preserveFormula = true } = {}) => {
  const cell = ensureCell(document, cellMap, ref);
  const formula = childByLocalName(cell, "f");
  const hasFormula = !!formula;

  removeChildren(cell, ["v", "is"]);

  if (!preserveFormula && hasFormula) {
    cell.removeChild(formula);
  }

  if (value === null || value === undefined || value === "") {
    if (!hasFormula || !preserveFormula) cell.removeAttribute("t");
    else cell.setAttribute("t", "str");
    return;
  }

  if (typeof value === "boolean") {
    cell.setAttribute("t", "b");
    appendValueNode(document, cell, value ? "1" : "0");
    return;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    cell.removeAttribute("t");
    appendValueNode(document, cell, String(value));
    return;
  }

  const text = String(value);

  if (hasFormula && preserveFormula) {
    cell.setAttribute("t", "str");
    appendValueNode(document, cell, text);
    return;
  }

  cell.setAttribute("t", "inlineStr");
  const inlineString = document.createElementNS(MAIN_NS, "is");
  const textNode = document.createElementNS(MAIN_NS, "t");
  if (/^\s|\s$|\n/.test(text)) textNode.setAttributeNS(XML_NS, "xml:space", "preserve");
  textNode.textContent = text;
  inlineString.appendChild(textNode);
  cell.appendChild(inlineString);
};

const clearInputCell = (document, cellMap, ref) =>
  writeCellValue(document, cellMap, ref, "", { preserveFormula: false });

const getTemplateUrl = () => {
  const base = safeText(import.meta.env.BASE_URL, "/");
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}templates/${TEMPLATE_FILE}`;
};

const resolveWorksheetPaths = async (zip) => {
  const workbookPath = "xl/workbook.xml";
  const relationshipsPath = "xl/_rels/workbook.xml.rels";
  const [workbookText, relationshipsText] = await Promise.all([
    zip.file(workbookPath)?.async("text"),
    zip.file(relationshipsPath)?.async("text"),
  ]);

  if (!workbookText || !relationshipsText) {
    throw new Error("The BUBT workbook template is incomplete.");
  }

  const workbookDocument = parseXml(workbookText, workbookPath);
  const relationshipsDocument = parseXml(relationshipsText, relationshipsPath);

  const relationshipMap = new Map();
  Array.from(
    relationshipsDocument.getElementsByTagNameNS(PACKAGE_REL_NS, "Relationship")
  ).forEach((relationship) => {
    relationshipMap.set(relationship.getAttribute("Id"), relationship.getAttribute("Target"));
  });

  const sheetMap = new Map();
  Array.from(workbookDocument.getElementsByTagNameNS(MAIN_NS, "sheet")).forEach(
    (sheet) => {
      const name = sheet.getAttribute("name");
      const relationshipId = sheet.getAttributeNS(REL_NS, "id");
      let target = relationshipMap.get(relationshipId);
      if (!name || !target) return;

      target = target.replace(/^\//, "");
      if (!target.startsWith("xl/")) target = `xl/${target.replace(/^\.\//, "")}`;
      sheetMap.set(name, target);
    }
  );

  return { workbookDocument, workbookPath, sheetMap };
};

const relationshipPathForPart = (partPath) => {
  const segments = String(partPath || "").split("/");
  const fileName = segments.pop();
  return `${segments.join("/")}/_rels/${fileName}.rels`;
};

const resolvePackageTarget = (sourcePartPath, target) => {
  const parts = String(sourcePartPath || "").split("/").slice(0, -1);
  String(target || "")
    .replace(/^\//, "")
    .split("/")
    .forEach((part) => {
      if (!part || part === ".") return;
      if (part === "..") parts.pop();
      else parts.push(part);
    });
  return parts.join("/");
};

const decodeDataUri = (source) => {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(source || "");
  if (!match) return null;

  const mimeType = safeText(match[1], "image/png").toLowerCase();
  const encoded = match[3] || "";
  const binary = match[2]
    ? atob(encoded)
    : decodeURIComponent(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, mimeType };
};

const imageExtensionForMime = (mimeType = "") => {
  const normalized = safeText(mimeType, "").toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  return "png";
};

const imageContentTypeForExtension = (extension = "png") =>
  ({
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  }[String(extension).toLowerCase()] || "image/png");

const convertBlobToPng = async (blob) => {
  const type = safeText(blob?.type, "").toLowerCase();
  if (type === "image/png" || type === "image/jpeg" || type === "image/jpg") {
    return blob;
  }

  if (
    typeof createImageBitmap !== "function" ||
    typeof document === "undefined" ||
    !document.createElement
  ) {
    return blob;
  }

  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, bitmap.width || 1);
    canvas.height = Math.max(1, bitmap.height || 1);
    const context = canvas.getContext("2d");
    if (!context) return blob;
    context.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const pngBlob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    return pngBlob || blob;
  } catch (error) {
    console.warn("Unable to convert faculty signature to PNG", error);
    return blob;
  }
};

const loadSignatureImage = async (source) => {
  if (!source) return null;

  const decoded = decodeDataUri(source);
  if (decoded) {
    return {
      bytes: decoded.bytes,
      extension: imageExtensionForMime(decoded.mimeType),
      contentType: decoded.mimeType,
    };
  }

  const response = await fetch(source, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Signature image could not be loaded (${response.status}).`);
  }

  const originalBlob = await response.blob();
  const blob = await convertBlobToPng(originalBlob);
  const extension = imageExtensionForMime(blob.type || originalBlob.type);
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    extension,
    contentType: imageContentTypeForExtension(extension),
  };
};

const ensureContentTypeDefault = async (zip, extension, contentType) => {
  const path = "[Content_Types].xml";
  const text = await zip.file(path)?.async("text");
  if (!text) return;

  const document = parseXml(text, path);
  const root = document.documentElement;
  const exists = Array.from(root.childNodes).some(
    (node) =>
      node.nodeType === 1 &&
      node.localName === "Default" &&
      safeText(node.getAttribute("Extension"), "").toLowerCase() ===
        safeText(extension, "").toLowerCase()
  );
  if (!exists) {
    const node = document.createElementNS(
      "http://schemas.openxmlformats.org/package/2006/content-types",
      "Default"
    );
    node.setAttribute("Extension", extension);
    node.setAttribute("ContentType", contentType);
    root.insertBefore(node, root.firstChild);
    zip.file(path, serializeXml(document));
  }
};

const appendTextElement = (document, parent, namespace, qualifiedName, value) => {
  const node = document.createElementNS(namespace, qualifiedName);
  node.textContent = String(value);
  parent.appendChild(node);
  return node;
};

const addFacultySignatureToCourseReport = async (
  zip,
  worksheetPath,
  signatureSource
) => {
  const signature = await loadSignatureImage(signatureSource);
  if (!signature) return false;

  const worksheetRelationshipPath = relationshipPathForPart(worksheetPath);
  const worksheetRelationshipsText = await zip
    .file(worksheetRelationshipPath)
    ?.async("text");
  if (!worksheetRelationshipsText) {
    throw new Error("Course Report drawing relationships are missing.");
  }

  const worksheetRelationships = parseXml(
    worksheetRelationshipsText,
    worksheetRelationshipPath
  );
  const drawingRelationship = Array.from(
    worksheetRelationships.getElementsByTagNameNS(
      PACKAGE_REL_NS,
      "Relationship"
    )
  ).find((relationship) =>
    safeText(relationship.getAttribute("Type"), "").endsWith("/drawing")
  );
  if (!drawingRelationship) {
    throw new Error("Course Report drawing is missing from the workbook template.");
  }

  const drawingPath = resolvePackageTarget(
    worksheetPath,
    drawingRelationship.getAttribute("Target")
  );
  const drawingText = await zip.file(drawingPath)?.async("text");
  if (!drawingText) throw new Error("Course Report drawing could not be read.");

  const drawingDocument = parseXml(drawingText, drawingPath);
  const drawingRelationshipsPath = relationshipPathForPart(drawingPath);
  const drawingRelationshipsText = await zip
    .file(drawingRelationshipsPath)
    ?.async("text");
  if (!drawingRelationshipsText) {
    throw new Error("Course Report chart relationships are missing.");
  }
  const drawingRelationships = parseXml(
    drawingRelationshipsText,
    drawingRelationshipsPath
  );

  const existingRelationshipIds = Array.from(
    drawingRelationships.getElementsByTagNameNS(PACKAGE_REL_NS, "Relationship")
  ).map((relationship) => relationship.getAttribute("Id"));
  let relationshipIndex = 1;
  while (existingRelationshipIds.includes(`rId${relationshipIndex}`)) {
    relationshipIndex += 1;
  }
  const relationshipId = `rId${relationshipIndex}`;

  const mediaIndexes = zip
    .file(/^xl\/media\/obe_faculty_signature_\d+\.[a-z0-9]+$/i)
    .map((file) => {
      const match = /_(\d+)\./.exec(file.name);
      return match ? Number(match[1]) : 0;
    });
  const mediaIndex = Math.max(0, ...mediaIndexes) + 1;
  const mediaFileName = `obe_faculty_signature_${mediaIndex}.${signature.extension}`;
  const mediaPath = `xl/media/${mediaFileName}`;
  zip.file(mediaPath, signature.bytes);
  await ensureContentTypeDefault(
    zip,
    signature.extension,
    signature.contentType
  );

  const relationshipNode = drawingRelationships.createElementNS(
    PACKAGE_REL_NS,
    "Relationship"
  );
  relationshipNode.setAttribute("Id", relationshipId);
  relationshipNode.setAttribute(
    "Type",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
  );
  relationshipNode.setAttribute("Target", `../media/${mediaFileName}`);
  drawingRelationships.documentElement.appendChild(relationshipNode);

  const existingIds = Array.from(
    drawingDocument.getElementsByTagNameNS(SPREADSHEET_DRAWING_NS, "cNvPr")
  )
    .map((node) => Number(node.getAttribute("id")))
    .filter(Number.isFinite);
  const pictureId = Math.max(10, ...existingIds) + 1;

  const anchor = drawingDocument.createElementNS(
    SPREADSHEET_DRAWING_NS,
    "xdr:twoCellAnchor"
  );
  anchor.setAttribute("editAs", "oneCell");

  const from = drawingDocument.createElementNS(
    SPREADSHEET_DRAWING_NS,
    "xdr:from"
  );
  appendTextElement(drawingDocument, from, SPREADSHEET_DRAWING_NS, "xdr:col", 1);
  appendTextElement(drawingDocument, from, SPREADSHEET_DRAWING_NS, "xdr:colOff", 76200);
  appendTextElement(drawingDocument, from, SPREADSHEET_DRAWING_NS, "xdr:row", 70);
  appendTextElement(drawingDocument, from, SPREADSHEET_DRAWING_NS, "xdr:rowOff", 19050);
  anchor.appendChild(from);

  const to = drawingDocument.createElementNS(
    SPREADSHEET_DRAWING_NS,
    "xdr:to"
  );
  appendTextElement(drawingDocument, to, SPREADSHEET_DRAWING_NS, "xdr:col", 4);
  appendTextElement(drawingDocument, to, SPREADSHEET_DRAWING_NS, "xdr:colOff", 0);
  appendTextElement(drawingDocument, to, SPREADSHEET_DRAWING_NS, "xdr:row", 74);
  appendTextElement(drawingDocument, to, SPREADSHEET_DRAWING_NS, "xdr:rowOff", 0);
  anchor.appendChild(to);

  const picture = drawingDocument.createElementNS(
    SPREADSHEET_DRAWING_NS,
    "xdr:pic"
  );
  const nonVisual = drawingDocument.createElementNS(
    SPREADSHEET_DRAWING_NS,
    "xdr:nvPicPr"
  );
  const cNvPr = drawingDocument.createElementNS(
    SPREADSHEET_DRAWING_NS,
    "xdr:cNvPr"
  );
  cNvPr.setAttribute("id", String(pictureId));
  cNvPr.setAttribute("name", "Faculty Signature");
  cNvPr.setAttribute("descr", "Reporting faculty signature");
  nonVisual.appendChild(cNvPr);
  const cNvPicPr = drawingDocument.createElementNS(
    SPREADSHEET_DRAWING_NS,
    "xdr:cNvPicPr"
  );
  const picLocks = drawingDocument.createElementNS(
    DRAWING_NS,
    "a:picLocks"
  );
  picLocks.setAttribute("noChangeAspect", "1");
  cNvPicPr.appendChild(picLocks);
  nonVisual.appendChild(cNvPicPr);
  picture.appendChild(nonVisual);

  const blipFill = drawingDocument.createElementNS(
    SPREADSHEET_DRAWING_NS,
    "xdr:blipFill"
  );
  const blip = drawingDocument.createElementNS(DRAWING_NS, "a:blip");
  blip.setAttributeNS(REL_NS, "r:embed", relationshipId);
  blipFill.appendChild(blip);
  const stretch = drawingDocument.createElementNS(DRAWING_NS, "a:stretch");
  stretch.appendChild(
    drawingDocument.createElementNS(DRAWING_NS, "a:fillRect")
  );
  blipFill.appendChild(stretch);
  picture.appendChild(blipFill);

  const shapeProperties = drawingDocument.createElementNS(
    SPREADSHEET_DRAWING_NS,
    "xdr:spPr"
  );
  const transform = drawingDocument.createElementNS(DRAWING_NS, "a:xfrm");
  const offset = drawingDocument.createElementNS(DRAWING_NS, "a:off");
  offset.setAttribute("x", "0");
  offset.setAttribute("y", "0");
  transform.appendChild(offset);
  const extent = drawingDocument.createElementNS(DRAWING_NS, "a:ext");
  extent.setAttribute("cx", "1828800");
  extent.setAttribute("cy", "685800");
  transform.appendChild(extent);
  shapeProperties.appendChild(transform);
  const geometry = drawingDocument.createElementNS(DRAWING_NS, "a:prstGeom");
  geometry.setAttribute("prst", "rect");
  geometry.appendChild(
    drawingDocument.createElementNS(DRAWING_NS, "a:avLst")
  );
  shapeProperties.appendChild(geometry);
  const line = drawingDocument.createElementNS(DRAWING_NS, "a:ln");
  line.setAttribute("w", "0");
  line.appendChild(drawingDocument.createElementNS(DRAWING_NS, "a:noFill"));
  shapeProperties.appendChild(line);
  picture.appendChild(shapeProperties);

  anchor.appendChild(picture);
  anchor.appendChild(
    drawingDocument.createElementNS(
      SPREADSHEET_DRAWING_NS,
      "xdr:clientData"
    )
  );
  drawingDocument.documentElement.appendChild(anchor);

  zip.file(drawingPath, serializeXml(drawingDocument));
  zip.file(
    drawingRelationshipsPath,
    serializeXml(drawingRelationships)
  );
  return true;
};

const getCourseOutcomes = (payload = {}) => {
  const outputRows = payload.output?.coAttainment;
  if (Array.isArray(outputRows) && outputRows.length) {
    return outputRows.map((row, index) => ({
      code: safeText(row.code, `CO${index + 1}`).toUpperCase(),
      statement: safeText(row.statement, ""),
      maxMarks: round2(row.maxMarks),
      attainmentPercent: round2(row.attainmentPercent),
    }));
  }

  const setupRows = payload.setup?.courseOutcomes || payload.setup?.cos || [];
  return setupRows.map((row, index) => ({
    code: safeText(row.code || row.coCode, `CO${index + 1}`).toUpperCase(),
    statement: safeText(row.statement, ""),
    maxMarks: round2(row.maxMarks),
    attainmentPercent: round2(row.attainmentPercent),
  }));
};

const getProgramOutcomes = (payload = {}) => {
  const outputRows = payload.output?.poAttainment;
  if (Array.isArray(outputRows) && outputRows.length) {
    return outputRows.map((row, index) => ({
      code: safeText(row.code, `PO${index + 1}`).toUpperCase(),
      statement: safeText(row.statement, ""),
      attainmentPercent: round2(row.attainmentPercent),
    }));
  }

  const setupRows = payload.setup?.poStatements || payload.setup?.programOutcomes || [];
  return setupRows.map((row, index) => ({
    code: safeText(row.code || row.poCode, `PO${index + 1}`).toUpperCase(),
    statement: safeText(row.statement, ""),
    attainmentPercent: round2(row.attainmentPercent),
  }));
};

const buildMarkMap = (marks = []) => {
  const map = new Map();

  (Array.isArray(marks) ? marks : []).forEach((record) => {
    const studentIds = [
      record.student,
      record.studentId,
      record.student?._id,
      record.student?.id,
    ]
      .filter(Boolean)
      .map(String);
    const blueprintIds = [
      record.blueprint,
      record.blueprintId,
      record.blueprint?._id,
      record.blueprint?.id,
    ]
      .filter(Boolean)
      .map(String);

    const entries = new Map();
    (record.entries || []).forEach((entry) => {
      const key = safeText(entry.itemKey || entry.key || entry._id || entry.id, "");
      if (key) entries.set(key, round2(entry.obtainedMarks ?? entry.marks ?? entry.value));
    });

    studentIds.forEach((studentId) => {
      blueprintIds.forEach((blueprintId) => {
        map.set(`${studentId}__${blueprintId}`, entries);
      });
    });
  });

  return map;
};

const getStudentIdKeys = (student = {}) =>
  [student.studentId, student._id, student.id, student.student]
    .filter(Boolean)
    .map(String);

const getContinuousAssessmentData = (payload = {}) =>
  payload.continuousAssessment || payload.output?.continuousAssessment || null;

const buildContinuousMarkMap = (continuousAssessment) => {
  const map = new Map();
  (continuousAssessment?.students || []).forEach((row) => {
    const studentId = safeText(row.studentId || row.student || row._id, "");
    if (studentId) map.set(String(studentId), row);
  });
  return map;
};

const getSlotMark = (markMap, continuousMarkMap, student, slot) => {
  if (slot?.isPlaceholder || slot?.source === "placeholder") return null;

  if (slot?.source === "courseContinuousAssessment") {
    for (const studentId of getStudentIdKeys(student)) {
      const row = continuousMarkMap.get(studentId);
      if (row) return round2(row[slot.continuousKey]);
    }
    return 0;
  }

  for (const studentId of getStudentIdKeys(student)) {
    const entries = markMap.get(`${studentId}__${slot.blueprintId}`);
    if (entries?.has(slot.itemKey)) return round2(entries.get(slot.itemKey));
  }
  return 0;
};

const gradeCode = (mark) => {
  const value = numberValue(mark);
  if (value >= 80) return "A+";
  if (value >= 75) return "A";
  if (value >= 70) return "A-";
  if (value >= 65) return "B+";
  if (value >= 60) return "B";
  if (value >= 55) return "B-";
  if (value >= 50) return "C+";
  if (value >= 45) return "C";
  if (value >= 40) return "D";
  return "F";
};

const gradeLabel = (grade) =>
  ({
    "A+": "A (Plus)",
    A: "A",
    "A-": "A (Minus)",
    "B+": "B (Plus)",
    B: "B",
    "B-": "B (Minus)",
    "C+": "C (Plus)",
    C: "C",
    D: "D",
    F: "F (Fail)",
  }[grade] || "F (Fail)");

const naturalStudentSort = (a, b) =>
  safeText(a.roll || a.username || a.studentId).localeCompare(
    safeText(b.roll || b.username || b.studentId),
    undefined,
    { numeric: true, sensitivity: "base" }
  );

const formatSemester = (course = {}) => {
  const semester = safeText(course.semester, "");
  const year = safeText(course.year, "");
  if (!semester && !year) return "";
  if (/semester/i.test(semester)) return `${semester}${year ? `, ${year}` : ""}`;
  return `${semester}${semester ? " Semester" : ""}${year ? `, ${year}` : ""}`;
};

const inferProgram = (course = {}, setup = {}) => {
  const explicit = safeText(course.program || setup.program || setup.programName, "");
  if (explicit) return explicit;

  const department = safeText(
    course.department || course.createdBy?.department || setup.department,
    "Computer Science and Engineering"
  );
  const upper = department.toUpperCase();

  if (upper.includes("COMPUTER SCIENCE") || /\bCSE\b/.test(upper)) return "B.Sc. In CSE";
  if (upper.includes("ELECTRICAL") || /\bEEE\b/.test(upper)) return "B.Sc. In EEE";
  if (upper.includes("INFORMATION") && upper.includes("COMMUNICATION")) return "B.Sc. In ICE";
  return department;
};

const normalizeDepartmentName = (value = "") => {
  const raw = safeText(value, "")
    .replace(/^department\s+of\s+/i, "")
    .replace(/,?\s*BUBT\s*$/i, "")
    .trim();

  if (!raw) return "Computer Science and Engineering";

  const upper = raw.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

  if (
    upper === "CSE" ||
    /\bCSE\b/.test(upper) ||
    upper.includes("COMPUTER SCIENCE AND ENGINEERING") ||
    upper.includes("COMPUTER SCIENCE ENGINEERING")
  ) {
    return "Computer Science and Engineering";
  }

  if (
    upper === "EEE" ||
    /\bEEE\b/.test(upper) ||
    upper.includes("ELECTRICAL AND ELECTRONIC ENGINEERING") ||
    upper.includes("ELECTRICAL ELECTRONIC ENGINEERING")
  ) {
    return "Electrical and Electronic Engineering";
  }

  if (
    upper === "ICE" ||
    /\bICE\b/.test(upper) ||
    upper.includes("INFORMATION AND COMMUNICATION ENGINEERING")
  ) {
    return "Information and Communication Engineering";
  }

  if (
    upper === "DSE" ||
    upper.includes("DATA SCIENCE AND ENGINEERING") ||
    upper.includes("DATA SCIENCE ENGINEERING")
  ) {
    return "Data Science and Engineering";
  }

  return raw.replace(/\s*&\s*/g, " and ").replace(/\s+/g, " ").trim();
};

const formatDepartment = (course = {}, setup = {}) => {
  const department = safeText(
    course.department || course.createdBy?.department || setup.department,
    "Computer Science and Engineering"
  );
  return `Department of ${normalizeDepartmentName(department)}`;
};

const getTeacherName = (payload = {}) =>
  safeText(
    payload.teacherName ||
      payload.teacher?.name ||
      payload.course?.teacherName ||
      payload.course?.teacher?.name ||
      payload.course?.createdBy?.name,
    ""
  );

const getTeacherSignature = (payload = {}) =>
  safeText(
    payload.teacherSignature ||
      payload.teacher?.signatureImage ||
      payload.course?.teacher?.signatureImage ||
      payload.course?.createdBy?.signatureImage,
    ""
  );

const ABBREVIATION_LABELS = {
  AT: "Attendance",
  CT: "Class Test",
  ASM: "Assignment",
  QT: "Quiz Test",
  PRE: "Presentation",
  VIV: "Viva Voce",
  "LAB E": "Lab Evaluation",
  LAB: "Lab Test",
  CP: "Class Participation",
  MT: "Mid Term",
  FE: "Final Exam",
};

const normalizeAbbreviation = (value = "") =>
  safeText(value, "").replace(/\s+/g, " ").toUpperCase();

const buildRelevantAbbreviations = (payload = {}, layout = {}) => {
  const rows = [];
  const seen = new Set();
  const add = (code, label, best = "") => {
    const normalized = normalizeAbbreviation(code);
    if (!normalized || seen.has(normalized) || rows.length >= 10) return;
    seen.add(normalized);
    rows.push({
      code: safeText(code, ""),
      label: safeText(label, ABBREVIATION_LABELS[normalized] || normalized),
      best,
    });
  };

  const continuous = Array.isArray(payload.continuousAssessment?.headers)
    ? payload.continuousAssessment.headers
    : Array.isArray(payload.output?.continuousAssessment?.headers)
      ? payload.output.continuousAssessment.headers
      : [];

  continuous.forEach((header) => {
    const code = safeText(header.label || header.key, "");
    if (!code || numberValue(header.maxMarks) <= 0) return;
    const normalized = normalizeAbbreviation(code);
    const best = ["CT", "ASM", "QT", "PRE", "VIV", "LAB E", "LAB"].includes(normalized)
      ? 1
      : "";
    add(code, header.assessmentName || ABBREVIATION_LABELS[normalized], best);
  });

  if (numberValue(layout?.totals?.mid) > 0) add("MT", "Mid Term", 1);
  if (numberValue(layout?.totals?.final) > 0) add("FE", "Final Exam", 1);

  if (!continuous.length) {
    (layout?.slots?.ca || []).forEach((slot) => {
      if (slot?.isPlaceholder || numberValue(slot?.marks) <= 0) return;
      const normalized = normalizeAbbreviation(slot.label);
      add(slot.label, ABBREVIATION_LABELS[normalized] || slot.blueprintName, 1);
    });
  }

  return rows;
};

const calculateWorkbookData = (payload, layout, courseOutcomes, programOutcomes) => {
  const markMap = buildMarkMap(payload.marks || []);
  const continuousMarkMap = buildContinuousMarkMap(
    getContinuousAssessmentData(payload)
  );
  // The top-level students array is built directly from current enrollments.
  // Prefer it over any calculated output snapshot so removed students cannot
  // reappear in the generated workbook.
  const rawStudents = Array.isArray(payload.students)
    ? payload.students
    : payload.output?.students || [];
  const students = [...rawStudents].sort(naturalStudentSort);
  const threshold = numberValue(
    payload.output?.thresholdPercent ?? payload.setup?.thresholdPercent ?? 40
  );
  const mappings = Array.isArray(payload.setup?.mappings) ? payload.setup.mappings : [];

  const coMax = new Map(courseOutcomes.map((co) => [co.code, 0]));
  layout.allSlots.forEach((slot) => {
    if (coMax.has(slot.coCode)) coMax.set(slot.coCode, round2(coMax.get(slot.coCode) + slot.marks));
  });

  const studentRows = students.map((student) => {
    const slotMarks = new Map();
    layout.allSlots.forEach((slot) => {
      slotMarks.set(
        `${slot.blueprintId}__${slot.itemKey}`,
        getSlotMark(markMap, continuousMarkMap, student, slot)
      );
    });

    const sumGroup = (slots) =>
      round2(
        slots.reduce(
          (sum, slot) => sum + numberValue(slotMarks.get(`${slot.blueprintId}__${slot.itemKey}`)),
          0
        )
      );

    const caTotal = sumGroup(layout.slots.ca);
    const midTotal = sumGroup(layout.slots.mid);
    const finalTotal = sumGroup(layout.slots.final);
    const total = round2(caTotal + midTotal + finalTotal);
    const grade = gradeCode(total);

    const coRows = courseOutcomes.map((co) => {
      const obtained = round2(
        layout.allSlots.reduce((sum, slot) => {
          if (slot.coCode !== co.code) return sum;
          return sum + numberValue(slotMarks.get(`${slot.blueprintId}__${slot.itemKey}`));
        }, 0)
      );
      const maxMarks = round2(coMax.get(co.code));
      const percent = maxMarks > 0 ? round6((obtained * 100) / maxMarks) : 0;
      return {
        ...co,
        obtained,
        maxMarks,
        percent,
        achieved: maxMarks > 0 && percent >= threshold,
      };
    });

    const poRows = programOutcomes.map((po) => {
      const relatedCodes = mappings
        .filter(
          (mapping) =>
            safeText(mapping.targetType, "PO").toUpperCase() === "PO" &&
            safeText(mapping.targetCode || mapping.poCode, "").toUpperCase() === po.code &&
            numberValue(mapping.strength || 1) > 0
        )
        .map((mapping) => safeText(mapping.coCode || mapping.sourceCode, "").toUpperCase());

      const relatedRows = coRows.filter((row) => relatedCodes.includes(row.code) && row.maxMarks > 0);
      const denominator = relatedRows.reduce((sum, row) => sum + row.maxMarks, 0);
      const weightedPercent = denominator
        ? round6(
            relatedRows.reduce((sum, row) => sum + row.percent * row.maxMarks, 0) /
              denominator
          )
        : 0;

      return {
        ...po,
        mapped: relatedRows.length > 0,
        percent: weightedPercent,
        achieved: relatedRows.length > 0 && weightedPercent >= threshold,
      };
    });

    return {
      student,
      slotMarks,
      caTotal,
      midTotal,
      finalTotal,
      total,
      grade,
      gradeLabel: gradeLabel(grade),
      coRows,
      poRows,
    };
  });

  const totalStudents = studentRows.length;
  const coAttainment = courseOutcomes.map((co) => {
    const rows = studentRows.map((student) => student.coRows.find((row) => row.code === co.code));
    const validRows = rows.filter(Boolean);
    const attainedCount = validRows.filter((row) => row.achieved).length;
    return {
      ...co,
      maxMarks: round2(coMax.get(co.code)),
      attainedCount,
      attainmentPercent: totalStudents ? round6((attainedCount * 100) / totalStudents) : 0,
    };
  });

  const poAttainment = programOutcomes.map((po) => {
    const rows = studentRows.map((student) => student.poRows.find((row) => row.code === po.code));
    const mappedRows = rows.filter((row) => row?.mapped);
    const attainedCount = mappedRows.filter((row) => row.achieved).length;
    return {
      ...po,
      mapped: mappedRows.length > 0,
      attainedCount,
      attainmentPercent:
        mappedRows.length && totalStudents
          ? round6((attainedCount * 100) / totalStudents)
          : null,
    };
  });

  const summaryLabels = [
    "A (Plus)",
    "A",
    "A (Minus)",
    "B (Plus)",
    "B",
    "B (Minus)",
    "C (Plus)",
    "C",
    "D",
    "F (Fail)",
    "Error",
  ];
  const gradeCounts = Object.fromEntries(summaryLabels.map((label) => [label, 0]));
  studentRows.forEach((row) => {
    gradeCounts[row.gradeLabel] = (gradeCounts[row.gradeLabel] || 0) + 1;
  });

  return {
    threshold,
    students: studentRows,
    totalStudents,
    totalStudentsPresent: studentRows.filter((row) => row.total > 0).length,
    coAttainment,
    poAttainment,
    gradeCounts,
    summaryLabels,
  };
};

const populateGradeSheet = (document, payload, layout, workbookData, courseOutcomes, programOutcomes) => {
  const cells = getSheetCellMap(document);
  const course = payload.course || {};
  const setup = payload.setup || {};

  writeCellValue(document, cells, "A2", formatDepartment(course, setup));
  writeCellValue(document, cells, "A8", formatSemester(course));
  writeCellValue(document, cells, "B14", safeText(course.code, ""));
  writeCellValue(document, cells, "B15", safeText(course.title, ""));
  writeCellValue(document, cells, "B16", inferProgram(course, setup));
  writeCellValue(document, cells, "B17", getTeacherName(payload));
  writeCellValue(document, cells, "B18", safeText(course.intake, ""));
  writeCellValue(document, cells, "B19", safeText(course.section, ""));
  writeCellValue(document, cells, "B20", course.shift ?? setup.shift ?? 0);

  const abbreviations = buildRelevantAbbreviations(payload, layout);
  for (let index = 0; index < 10; index += 1) {
    const row = 14 + index;
    const item = abbreviations[index];
    writeCellValue(document, cells, `E${row}`, item?.code || "", { preserveFormula: false });
    writeCellValue(document, cells, `F${row}`, item?.label || "", { preserveFormula: false });
    writeCellValue(document, cells, `I${row}`, item?.best ?? "", { preserveFormula: false });
  }

  const groups = [
    ["ca", OBE_TEMPLATE_COLUMNS.ca],
    ["mid", OBE_TEMPLATE_COLUMNS.mid],
    ["final", OBE_TEMPLATE_COLUMNS.final],
  ];

  groups.forEach(([group, columns]) => {
    columns.forEach((column, index) => {
      const slot = layout.slots[group][index];
      writeCellValue(document, cells, `${column}27`, slot?.label || "");
      writeCellValue(document, cells, `${column}28`, slot?.coCode || "");
      writeCellValue(
        document,
        cells,
        `${column}29`,
        slot && !slot.isPlaceholder ? round2(slot.marks) : ""
      );
    });
  });

  writeCellValue(document, cells, "H29", round2(layout.totals.ca));
  writeCellValue(
    document,
    cells,
    "O29",
    Math.abs(layout.totals.mid - 30) < 0.001 ? 30 : "Error"
  );
  writeCellValue(
    document,
    cells,
    "V29",
    Math.abs(layout.totals.final - 40) < 0.001 ? 40 : "Error"
  );
  const validTotal =
    Math.abs(layout.totals.ca - 30) < 0.001 &&
    Math.abs(layout.totals.mid - 30) < 0.001 &&
    Math.abs(layout.totals.final - 40) < 0.001;
  writeCellValue(document, cells, "W29", validTotal ? 100 : "Error");
  writeCellValue(document, cells, "W28", validTotal ? 100 : "Error");

  for (let index = 0; index < OBE_TEMPLATE_LIMITS.courseOutcomes; index += 1) {
    const co = courseOutcomes[index];
    const code = co?.code || `CO${index + 1}`;
    const obtainedColumn = ["AB", "AC", "AD", "AE", "AF", "AG"][index];
    const percentColumn = ["AH", "AI", "AJ", "AK", "AL", "AM"][index];
    const achievedColumn = ["AN", "AO", "AP", "AQ", "AR", "AS"][index];

    writeCellValue(document, cells, `${obtainedColumn}28`, `[${code}]`);
    writeCellValue(document, cells, `${percentColumn}28`, code);
    writeCellValue(document, cells, `${achievedColumn}28`, code);
    writeCellValue(document, cells, `${obtainedColumn}29`, co ? co.maxMarks : 0);
    writeCellValue(document, cells, `${percentColumn}29`, "%");
  }

  const poColumns = ["AT", "AU", "AV", "AW", "AX", "AY", "AZ", "BA", "BB", "BC", "BD", "BE"];
  poColumns.forEach((column, index) => {
    writeCellValue(document, cells, `${column}28`, programOutcomes[index]?.code || `PO${index + 1}`);
  });

  writeCellValue(document, cells, "AQ27", workbookData.threshold);
  writeCellValue(document, cells, "AW27", workbookData.threshold);

  for (let row = STUDENT_START_ROW; row <= STUDENT_END_ROW; row += 1) {
    const studentData = workbookData.students[row - STUDENT_START_ROW];

    if (!studentData) {
      ["A", "B", ...OBE_TEMPLATE_COLUMNS.ca, ...OBE_TEMPLATE_COLUMNS.mid, ...OBE_TEMPLATE_COLUMNS.final].forEach(
        (column) => clearInputCell(document, cells, `${column}${row}`)
      );
      writeCellValue(document, cells, `H${row}`, "-");
      writeCellValue(document, cells, `O${row}`, "-");
      writeCellValue(document, cells, `V${row}`, "-");
      writeCellValue(document, cells, `W${row}`, "-");
      writeCellValue(document, cells, `X${row}`, "-");
      writeCellValue(document, cells, `Z${row}`, "");
      writeCellValue(document, cells, `AA${row}`, "");

      for (const column of ["AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK", "AL", "AM"]) {
        writeCellValue(document, cells, `${column}${row}`, 0);
      }
      for (const column of ["AN", "AO", "AP", "AQ", "AR", "AS", ...poColumns]) {
        writeCellValue(document, cells, `${column}${row}`, "-");
      }
      continue;
    }

    const { student } = studentData;
    const roll = safeText(student.roll || student.username || student.studentId, "");
    const name = safeText(student.name, "");
    writeCellValue(document, cells, `A${row}`, roll);
    writeCellValue(document, cells, `B${row}`, name);

    groups.forEach(([group, columns]) => {
      columns.forEach((column, index) => {
        const slot = layout.slots[group][index];
        const mark = slot
          ? studentData.slotMarks.get(`${slot.blueprintId}__${slot.itemKey}`)
          : null;
        writeCellValue(
          document,
          cells,
          `${column}${row}`,
          slot && !slot.isPlaceholder ? round2(mark) : ""
        );
      });
    });

    writeCellValue(document, cells, `H${row}`, studentData.caTotal);
    writeCellValue(document, cells, `O${row}`, studentData.midTotal);
    writeCellValue(document, cells, `V${row}`, studentData.finalTotal);
    writeCellValue(document, cells, `W${row}`, studentData.total);
    writeCellValue(document, cells, `X${row}`, studentData.gradeLabel);
    writeCellValue(document, cells, `Z${row}`, roll);
    writeCellValue(document, cells, `AA${row}`, name);

    for (let index = 0; index < OBE_TEMPLATE_LIMITS.courseOutcomes; index += 1) {
      const coRow = studentData.coRows[index];
      const obtainedColumn = ["AB", "AC", "AD", "AE", "AF", "AG"][index];
      const percentColumn = ["AH", "AI", "AJ", "AK", "AL", "AM"][index];
      const achievedColumn = ["AN", "AO", "AP", "AQ", "AR", "AS"][index];
      writeCellValue(document, cells, `${obtainedColumn}${row}`, coRow?.obtained || 0);
      writeCellValue(document, cells, `${percentColumn}${row}`, coRow?.percent || 0);
      writeCellValue(
        document,
        cells,
        `${achievedColumn}${row}`,
        coRow ? (coRow.achieved ? "Y" : "N") : "N"
      );
    }

    poColumns.forEach((column, index) => {
      const poRow = studentData.poRows[index];
      writeCellValue(
        document,
        cells,
        `${column}${row}`,
        poRow?.mapped ? (poRow.achieved ? "Y" : "N") : "-"
      );
    });
  }

  writeCellValue(document, cells, "D102", workbookData.totalStudents);
  writeCellValue(document, cells, "E105", workbookData.totalStudentsPresent);

  workbookData.summaryLabels.forEach((label, index) => {
    const row = 108 + index;
    const count = workbookData.gradeCounts[label] || 0;
    writeCellValue(document, cells, `D${row}`, count);
    writeCellValue(
      document,
      cells,
      `H${row}`,
      workbookData.totalStudents ? round6((count * 100) / workbookData.totalStudents) : 0
    );
  });
  writeCellValue(document, cells, "D119", workbookData.totalStudents);
  writeCellValue(document, cells, "H119", workbookData.totalStudents ? 100 : 0);

  for (let index = 0; index < OBE_TEMPLATE_LIMITS.courseOutcomes; index += 1) {
    const attainment = workbookData.coAttainment[index];
    const totalColumn = ["AN", "AO", "AP", "AQ", "AR", "AS"][index];
    const hasAttainedStudent = !!(attainment && attainment.attainedCount > 0);
    writeCellValue(
      document,
      cells,
      `${totalColumn}102`,
      hasAttainedStudent
        ? attainment.attainedCount >
          (workbookData.totalStudentsPresent * workbookData.threshold) / 100
          ? "YES"
          : "NO"
        : "-"
    );
    writeCellValue(
      document,
      cells,
      `${totalColumn}103`,
      hasAttainedStudent ? attainment.attainmentPercent : "-"
    );
  }

  poColumns.forEach((column, index) => {
    const attainment = workbookData.poAttainment[index];
    writeCellValue(
      document,
      cells,
      `${column}102`,
      attainment?.mapped && attainment.attainedCount > 0
        ? attainment.attainedCount >
          (workbookData.totalStudentsPresent * workbookData.threshold) / 100
          ? "YES"
          : "NO"
        : "-"
    );
    writeCellValue(
      document,
      cells,
      `${column}103`,
      attainment?.mapped && attainment.attainedCount > 0
        ? attainment.attainmentPercent
        : "-"
    );
  });
};

const removeCheckboxMacroAssignments = (mappingDocument) => {
  Array.from(mappingDocument.getElementsByTagName("*")).forEach((node) => {
    if (node.localName !== "control") return;

    const controlName = safeText(node.getAttribute("name"), "");
    if (!/^check\s*box/i.test(controlName)) return;

    const controlProperties = childByLocalName(node, "controlPr");
    if (controlProperties?.hasAttribute("macro")) {
      controlProperties.removeAttribute("macro");
    }
  });
};

const removeCheckboxVmlMacros = async (zip) => {
  const vmlFiles = zip.file(/^xl\/drawings\/vmlDrawing\d+\.vml$/i);

  await Promise.all(
    vmlFiles.map(async (vmlFile) => {
      const vmlText = await vmlFile.async("text");
      const vmlDocument = parseXml(vmlText, vmlFile.name);
      let changed = false;

      Array.from(vmlDocument.getElementsByTagName("*")).forEach((node) => {
        if (node.localName !== "ClientData") return;
        if (safeText(node.getAttribute("ObjectType"), "").toLowerCase() !== "checkbox") {
          return;
        }

        Array.from(node.childNodes).forEach((child) => {
          if (child.nodeType === 1 && child.localName === "FmlaMacro") {
            node.removeChild(child);
            changed = true;
          }
        });
      });

      if (changed) zip.file(vmlFile.name, serializeXml(vmlDocument));
    })
  );
};

const populateMappingSheet = (document, payload, courseOutcomes, programOutcomes) => {
  const cells = getSheetCellMap(document);
  const mappings = Array.isArray(payload.setup?.mappings) ? payload.setup.mappings : [];
  const visiblePoColumns = ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];
  const linkedPoColumns = ["O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

  visiblePoColumns.forEach((column, index) => {
    writeCellValue(document, cells, `${column}1`, programOutcomes[index]?.code || `PO${index + 1}`);
  });

  for (let coIndex = 0; coIndex < OBE_TEMPLATE_LIMITS.courseOutcomes; coIndex += 1) {
    const co = courseOutcomes[coIndex];
    const row = coIndex + 2;
    writeCellValue(document, cells, `A${row}`, co?.code || `CO${coIndex + 1}`);
    writeCellValue(document, cells, `B${row}`, co?.statement || "");

    linkedPoColumns.forEach((column, poIndex) => {
      const po = programOutcomes[poIndex];
      const mapped = !!(
        co &&
        po &&
        mappings.some(
          (mapping) =>
            safeText(mapping.coCode || mapping.sourceCode, "").toUpperCase() === co.code &&
            safeText(mapping.targetType, "PO").toUpperCase() === "PO" &&
            safeText(mapping.targetCode || mapping.poCode, "").toUpperCase() === po.code &&
            numberValue(mapping.strength || 1) > 0
        )
      );
      writeCellValue(document, cells, `${column}${row}`, mapped);
    });
  }
};

const populateCourseReport = (document, payload, workbookData, courseOutcomes, programOutcomes) => {
  const cells = getSheetCellMap(document);
  const course = payload.course || {};
  const setup = payload.setup || {};

  writeCellValue(document, cells, "B2", formatSemester(course));
  writeCellValue(document, cells, "B3", safeText(course.code, ""));
  writeCellValue(document, cells, "B4", safeText(course.title, ""));
  writeCellValue(document, cells, "B5", inferProgram(course, setup));
  writeCellValue(document, cells, "B6", getTeacherName(payload));
  writeCellValue(document, cells, "B7", safeText(course.intake, ""));
  writeCellValue(document, cells, "B8", safeText(course.section, ""));
  writeCellValue(document, cells, "B9", course.shift ?? setup.shift ?? 0);

  const coColumns = ["C", "D", "E", "F", "G", "H"];
  coColumns.forEach((column, index) => {
    writeCellValue(document, cells, `${column}13`, courseOutcomes[index]?.code || `CO${index + 1}`);
    writeCellValue(
      document,
      cells,
      `${column}14`,
      workbookData.coAttainment[index]?.attainedCount > 0
        ? workbookData.coAttainment[index].attainmentPercent
        : "-"
    );
  });

  const firstPoColumns = ["C", "D", "E", "F", "G", "H"];
  firstPoColumns.forEach((column, index) => {
    writeCellValue(document, cells, `${column}16`, programOutcomes[index]?.code || `PO${index + 1}`);
    const attainment = workbookData.poAttainment[index];
    writeCellValue(
      document,
      cells,
      `${column}17`,
      attainment?.mapped && attainment.attainedCount > 0
        ? attainment.attainmentPercent
        : "-"
    );
  });
  firstPoColumns.forEach((column, index) => {
    const poIndex = index + 6;
    writeCellValue(document, cells, `${column}18`, programOutcomes[poIndex]?.code || `PO${poIndex + 1}`);
    const attainment = workbookData.poAttainment[poIndex];
    writeCellValue(
      document,
      cells,
      `${column}19`,
      attainment?.mapped && attainment.attainedCount > 0
        ? attainment.attainmentPercent
        : "-"
    );
  });

  writeCellValue(
    document,
    cells,
    "B56",
    safeText(setup.courseReportComment1, ""),
    { preserveFormula: false }
  );
  writeCellValue(
    document,
    cells,
    "B62",
    safeText(setup.courseReportComment2, ""),
    { preserveFormula: false }
  );
  writeCellValue(
    document,
    cells,
    "B67",
    safeText(setup.courseReportGeneralComment, ""),
    { preserveFormula: false }
  );
};

const normalizeChartFormula = (formula) =>
  safeText(formula, "")
    .replace(/[\s']/g, "")
    .toUpperCase();

const createChartElement = (document, localName) =>
  document.createElementNS(CHART_NS, `c:${localName}`);

const replaceChartCachePoints = (document, cache, values, { numeric = false } = {}) => {
  if (!cache) return;

  Array.from(cache.childNodes).forEach((node) => {
    if (node.nodeType === 1 && ["ptCount", "pt"].includes(node.localName)) {
      cache.removeChild(node);
    }
  });

  const extList = childByLocalName(cache, "extLst");
  const pointCount = createChartElement(document, "ptCount");
  pointCount.setAttribute("val", String(values.length));
  cache.insertBefore(pointCount, extList || null);

  values.forEach((rawValue, index) => {
    const point = createChartElement(document, "pt");
    point.setAttribute("idx", String(index));

    const value = createChartElement(document, "v");
    value.textContent = numeric
      ? String(round6(numberValue(rawValue)))
      : safeText(rawValue, "");

    point.appendChild(value);
    cache.insertBefore(point, extList || null);
  });
};

const updateChartReferenceCache = (document, reference, values, { numeric = false } = {}) => {
  const cache = childByLocalName(reference, numeric ? "numCache" : "strCache");
  replaceChartCachePoints(document, cache, values, { numeric });
};

const chartCacheValues = (formula, workbookData, courseOutcomes, programOutcomes) => {
  const normalized = normalizeChartFormula(formula);
  const gradeLabels = workbookData.summaryLabels.slice(0, 10);

  if (normalized.includes("GRADESHEET!$B$108:$B$117")) {
    return { numeric: false, values: gradeLabels };
  }

  if (normalized.includes("GRADESHEET!$D$108:$D$117")) {
    return {
      numeric: true,
      values: gradeLabels.map((label) => workbookData.gradeCounts[label] || 0),
    };
  }

  if (normalized.includes("GRADESHEET!$H$108:$H$117")) {
    return {
      numeric: true,
      values: gradeLabels.map((label) => {
        const count = workbookData.gradeCounts[label] || 0;
        return workbookData.totalStudents
          ? round6((count * 100) / workbookData.totalStudents)
          : 0;
      }),
    };
  }

  if (normalized.includes("COURSEREPORT!$C$13:$F$13")) {
    return {
      numeric: false,
      values: Array.from(
        { length: 4 },
        (_, index) => courseOutcomes[index]?.code || `CO${index + 1}`
      ),
    };
  }

  if (normalized.includes("COURSEREPORT!$C$14:$F$14")) {
    return {
      numeric: true,
      values: Array.from(
        { length: 4 },
        (_, index) => workbookData.coAttainment[index]?.attainmentPercent || 0
      ),
    };
  }

  const isPoCategoryRange =
    normalized.includes("COURSEREPORT!$C$16:$H$16") &&
    normalized.includes("COURSEREPORT!$C$18:$H$18");
  if (isPoCategoryRange) {
    return {
      numeric: false,
      values: Array.from(
        { length: 12 },
        (_, index) => programOutcomes[index]?.code || `PO${index + 1}`
      ),
    };
  }

  const isPoValueRange =
    normalized.includes("COURSEREPORT!$C$17:$H$17") &&
    normalized.includes("COURSEREPORT!$C$19:$H$19");
  if (isPoValueRange) {
    return {
      numeric: true,
      values: Array.from({ length: 12 }, (_, index) => {
        const attainment = workbookData.poAttainment[index];
        return attainment?.mapped ? attainment.attainmentPercent : 0;
      }),
    };
  }

  return null;
};

const refreshChartCaches = async (zip, workbookData, courseOutcomes, programOutcomes) => {
  const chartFiles = zip.file(/^xl\/charts\/chart\d+\.xml$/i);

  await Promise.all(
    chartFiles.map(async (chartFile) => {
      const chartText = await chartFile.async("text");
      const chartDocument = parseXml(chartText, chartFile.name);
      let changed = false;

      [
        ["strRef", false],
        ["numRef", true],
      ].forEach(([referenceName, numeric]) => {
        Array.from(
          chartDocument.getElementsByTagNameNS(CHART_NS, referenceName)
        ).forEach((reference) => {
          const formulaNode = childByLocalName(reference, "f");
          const cacheData = chartCacheValues(
            formulaNode?.textContent,
            workbookData,
            courseOutcomes,
            programOutcomes
          );

          if (!cacheData || cacheData.numeric !== numeric) return;
          updateChartReferenceCache(chartDocument, reference, cacheData.values, {
            numeric,
          });
          changed = true;
        });
      });

      if (changed) {
        zip.file(chartFile.name, serializeXml(chartDocument));
      }
    })
  );
};

const setWorkbookRecalculation = (workbookDocument) => {
  let calcProperties = workbookDocument.getElementsByTagNameNS(MAIN_NS, "calcPr")[0];
  if (!calcProperties) {
    calcProperties = workbookDocument.createElementNS(MAIN_NS, "calcPr");
    workbookDocument.documentElement.appendChild(calcProperties);
  }
  calcProperties.setAttribute("calcMode", "auto");
  calcProperties.setAttribute("fullCalcOnLoad", "1");
  calcProperties.setAttribute("forceFullCalc", "1");
  calcProperties.setAttribute("calcOnSave", "1");
};

const updateModifiedDate = async (zip) => {
  const path = "docProps/core.xml";
  const text = await zip.file(path)?.async("text");
  if (!text) return;

  const document = parseXml(text, path);
  const modified = document.getElementsByTagNameNS(CORE_NS, "modified")[0];
  if (modified) modified.textContent = new Date().toISOString();
  zip.file(path, serializeXml(document));
};

export const exportObeWorkbook = async (payload = {}) => {
  const courseOutcomes = getCourseOutcomes(payload);
  const programOutcomes = getProgramOutcomes(payload);
  const blueprints = payload.blueprints || payload.output?.blueprints || [];
  const continuousAssessment = getContinuousAssessmentData(payload);
  const courseType = safeText(
    payload.course?.courseType || payload.course?.type,
    "theory"
  ).toLowerCase();
  const needsFixedContinuousAssessment = ["theory", "hybrid", "lab"].includes(
    courseType
  );
  const useFixedContinuousAssessment =
    continuousAssessment?.enabled === true;
  const layout = buildObeTemplateLayout(blueprints, {
    useFixedContinuousAssessment,
    fixedContinuousAssessmentSlots: continuousAssessment?.headers || [],
  });

  const errors = [...layout.errors];
  const warnings = [...layout.warnings];
  const rawStudents = Array.isArray(payload.students)
    ? payload.students
    : payload.output?.students || [];

  if (needsFixedContinuousAssessment && !useFixedContinuousAssessment) {
    errors.push(
      courseType === "lab"
        ? "Continuous-assessment data is missing from the export response. Update the supplied server files so AT (5) and Lab E (25) can be fetched from the lab attendance and normal marksheet."
        : "Continuous-assessment data is missing from the export response. Update the supplied server files so AT (5), CT (15), and ASM (10) can be fetched from the course marks."
    );
  }

  if (!courseOutcomes.length) errors.push("No course outcomes were found in the OBE setup.");
  if (courseOutcomes.length > OBE_TEMPLATE_LIMITS.courseOutcomes) {
    errors.push(
      `The official BUBT template supports ${OBE_TEMPLATE_LIMITS.courseOutcomes} COs, but ${courseOutcomes.length} are configured.`
    );
  }
  if (programOutcomes.length > OBE_TEMPLATE_LIMITS.programOutcomes) {
    errors.push(
      `The official BUBT template supports ${OBE_TEMPLATE_LIMITS.programOutcomes} POs, but ${programOutcomes.length} are configured.`
    );
  }
  if (rawStudents.length > OBE_TEMPLATE_LIMITS.students) {
    errors.push(
      `The official BUBT template supports ${OBE_TEMPLATE_LIMITS.students} students, but this course has ${rawStudents.length}.`
    );
  }
  if (!layout.allSlots.length) errors.push("No assessment blueprint items were found.");

  if (errors.length) {
    throw new Error(errors.join("\n"));
  }

  const response = await fetch(getTemplateUrl(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `Could not load the BUBT Excel template (${response.status}). Make sure public/templates/${TEMPLATE_FILE} is deployed.`
    );
  }

  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const { workbookDocument, workbookPath, sheetMap } = await resolveWorksheetPaths(zip);

  const requiredSheets = ["GradeSheet", "Course Report", "CO-PO Mapping"];
  requiredSheets.forEach((name) => {
    if (!sheetMap.has(name)) throw new Error(`The template sheet “${name}” is missing.`);
  });

  const workbookData = calculateWorkbookData(
    payload,
    layout,
    courseOutcomes.slice(0, OBE_TEMPLATE_LIMITS.courseOutcomes),
    programOutcomes.slice(0, OBE_TEMPLATE_LIMITS.programOutcomes)
  );

  const [gradeText, reportText, mappingText] = await Promise.all([
    zip.file(sheetMap.get("GradeSheet"))?.async("text"),
    zip.file(sheetMap.get("Course Report"))?.async("text"),
    zip.file(sheetMap.get("CO-PO Mapping"))?.async("text"),
  ]);

  if (!gradeText || !reportText || !mappingText) {
    throw new Error("One or more BUBT template worksheets could not be read.");
  }

  const gradeDocument = parseXml(gradeText, sheetMap.get("GradeSheet"));
  const reportDocument = parseXml(reportText, sheetMap.get("Course Report"));
  const mappingDocument = parseXml(mappingText, sheetMap.get("CO-PO Mapping"));

  populateGradeSheet(
    gradeDocument,
    payload,
    layout,
    workbookData,
    courseOutcomes.slice(0, OBE_TEMPLATE_LIMITS.courseOutcomes),
    programOutcomes.slice(0, OBE_TEMPLATE_LIMITS.programOutcomes)
  );
  populateCourseReport(
    reportDocument,
    payload,
    workbookData,
    courseOutcomes.slice(0, OBE_TEMPLATE_LIMITS.courseOutcomes),
    programOutcomes.slice(0, OBE_TEMPLATE_LIMITS.programOutcomes)
  );
  populateMappingSheet(
    mappingDocument,
    payload,
    courseOutcomes.slice(0, OBE_TEMPLATE_LIMITS.courseOutcomes),
    programOutcomes.slice(0, OBE_TEMPLATE_LIMITS.programOutcomes)
  );
  removeCheckboxMacroAssignments(mappingDocument);

  const teacherSignature = getTeacherSignature(payload);
  if (teacherSignature) {
    try {
      await addFacultySignatureToCourseReport(
        zip,
        sheetMap.get("Course Report"),
        teacherSignature
      );
    } catch (error) {
      console.warn("Unable to add faculty signature to Course Report", error);
      warnings.push(
        "The faculty signature could not be embedded in the Course Report sheet."
      );
    }
  } else {
    warnings.push(
      "No faculty signature is saved in the teacher profile, so the Course Report signature area is blank."
    );
  }

  setWorkbookRecalculation(workbookDocument);

  zip.file(sheetMap.get("GradeSheet"), serializeXml(gradeDocument));
  zip.file(sheetMap.get("Course Report"), serializeXml(reportDocument));
  zip.file(sheetMap.get("CO-PO Mapping"), serializeXml(mappingDocument));
  zip.file(workbookPath, serializeXml(workbookDocument));
  await removeCheckboxVmlMacros(zip);
  await refreshChartCaches(
    zip,
    workbookData,
    courseOutcomes.slice(0, OBE_TEMPLATE_LIMITS.courseOutcomes),
    programOutcomes.slice(0, OBE_TEMPLATE_LIMITS.programOutcomes)
  );
  await updateModifiedDate(zip);

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return { blob, warnings };
};
