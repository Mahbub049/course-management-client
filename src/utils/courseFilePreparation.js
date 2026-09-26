import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const BAND_LABEL = { best: "Excellent", mediocre: "Mediocre", poor: "Poor" };

const cleanText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const safeFileName = (value) => cleanText(value || "file").replace(/[\\/:*?"<>|]/g, "-");

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function wordNodeText(node) {
  return Array.from(node?.getElementsByTagName?.("w:t") || []).map((el) => el.textContent || "").join("");
}

function setWordNodeText(documentXml, node, value) {
  const text = String(value ?? "");
  const textNodes = Array.from(node.getElementsByTagName("w:t"));
  if (textNodes.length) {
    textNodes[0].textContent = text;
    textNodes.slice(1).forEach((el) => { el.textContent = ""; });
    return;
  }
  const paragraph = node.tagName === "w:p" ? node : node.getElementsByTagName("w:p")?.[0];
  if (!paragraph) return;
  const run = documentXml.createElementNS(WORD_NS, "w:r");
  const textNode = documentXml.createElementNS(WORD_NS, "w:t");
  textNode.setAttribute("xml:space", "preserve");
  textNode.textContent = text;
  run.appendChild(textNode);
  paragraph.appendChild(run);
}



async function addSignatureImageToWord(zip, documentXml, signatureImage) {
  if (!signatureImage) return;
  const response = await fetch(signatureImage);
  if (!response.ok) throw new Error("Could not load the uploaded faculty signature.");
  const blob = await response.blob();
  const mime = blob.type === "image/jpeg" ? "image/jpeg" : "image/png";
  const ext = mime === "image/jpeg" ? "jpg" : "png";
  const mediaPath = `word/media/course-file-signature.${ext}`;
  zip.file(mediaPath, await blob.arrayBuffer());

  const relsPath = "word/_rels/document.xml.rels";
  const relsText = await zip.file(relsPath)?.async("text");
  if (!relsText) throw new Error("The supplied Answer Script template is missing document relationships.");
  const relParser = new DOMParser();
  const relsXml = relParser.parseFromString(relsText, "application/xml");
  const relRoot = relsXml.documentElement;
  const existingIds = Array.from(relRoot.getElementsByTagName("Relationship")).map((rel) => rel.getAttribute("Id") || "");
  let relNo = 1;
  while (existingIds.includes(`rId${relNo}`)) relNo += 1;
  const relId = `rId${relNo}`;
  const rel = relsXml.createElementNS("http://schemas.openxmlformats.org/package/2006/relationships", "Relationship");
  rel.setAttribute("Id", relId);
  rel.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image");
  rel.setAttribute("Target", `media/course-file-signature.${ext}`);
  relRoot.appendChild(rel);
  zip.file(relsPath, new XMLSerializer().serializeToString(relsXml));

  const contentTypesPath = "[Content_Types].xml";
  const contentText = await zip.file(contentTypesPath)?.async("text");
  if (contentText) {
    const ctXml = relParser.parseFromString(contentText, "application/xml");
    const ctRoot = ctXml.documentElement;
    const already = Array.from(ctRoot.getElementsByTagName("Default")).some((node) => node.getAttribute("Extension") === ext);
    if (!already) {
      const def = ctXml.createElementNS("http://schemas.openxmlformats.org/package/2006/content-types", "Default");
      def.setAttribute("Extension", ext);
      def.setAttribute("ContentType", mime);
      ctRoot.appendChild(def);
      zip.file(contentTypesPath, new XMLSerializer().serializeToString(ctXml));
    }
  }

  const paragraphs = Array.from(documentXml.getElementsByTagName("w:p"));
  const labelIndex = paragraphs.findIndex((paragraph) => cleanText(wordNodeText(paragraph)).toLowerCase().includes("signature of faculty member"));
  if (labelIndex < 0) return;
  const target = paragraphs.slice(0, labelIndex).reverse().find((paragraph) => cleanText(wordNodeText(paragraph)).includes("---")) || paragraphs[labelIndex];
  Array.from(target.childNodes || []).filter((child) => child.nodeType === 1 && child.tagName === "w:r").forEach((run) => target.removeChild(run));

  const drawingXml = `<w:r xmlns:w="${WORD_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1371600" cy="411480"/><wp:docPr id="9001" name="Faculty Signature"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="course-file-signature.${ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1371600" cy="411480"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  const drawingDoc = new DOMParser().parseFromString(`<root>${drawingXml}</root>`, "application/xml");
  target.appendChild(documentXml.importNode(drawingDoc.documentElement.firstChild, true));
}

function tableMatrixFromWordXml(documentXml) {
  return Array.from(documentXml.getElementsByTagName("w:tbl")).map((table) =>
    Array.from(table.getElementsByTagName("w:tr")).map((row) =>
      Array.from(row.getElementsByTagName("w:tc"))
    )
  );
}

async function loadWordTemplate(templateUrl) {
  const response = await fetch(templateUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load course-file template (${response.status}).`);
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const xmlText = await zip.file("word/document.xml")?.async("text");
  if (!xmlText) throw new Error("The supplied Word template is missing word/document.xml.");
  const parser = new DOMParser();
  const documentXml = parser.parseFromString(xmlText, "application/xml");
  return { zip, documentXml };
}

function replaceTemplateParagraph(documentXml, startsWith, replacement) {
  const paragraphs = Array.from(documentXml.getElementsByTagName("w:p"));
  const found = paragraphs.find((p) => cleanText(wordNodeText(p)).toLowerCase().startsWith(String(startsWith).toLowerCase()));
  if (found) setWordNodeText(documentXml, found, replacement);
}

function ensureWordChild(documentXml, parent, tagName, beforeNode = null) {
  let node = Array.from(parent.childNodes || []).find(
    (child) => child.nodeType === 1 && child.tagName === tagName
  );
  if (!node) {
    node = documentXml.createElementNS(WORD_NS, tagName);
    if (beforeNode) parent.insertBefore(node, beforeNode);
    else parent.appendChild(node);
  }
  return node;
}

function centerWordTableCell(documentXml, cell) {
  if (!cell) return;

  const firstParagraph = Array.from(cell.getElementsByTagName("w:p"))[0];
  if (firstParagraph) {
    const firstRun = Array.from(firstParagraph.childNodes || []).find(
      (child) => child.nodeType === 1 && child.tagName === "w:r"
    );
    const pPr = ensureWordChild(documentXml, firstParagraph, "w:pPr", firstRun || firstParagraph.firstChild);
    let jc = Array.from(pPr.childNodes || []).find(
      (child) => child.nodeType === 1 && child.tagName === "w:jc"
    );
    if (!jc) {
      jc = documentXml.createElementNS(WORD_NS, "w:jc");
      const rPr = Array.from(pPr.childNodes || []).find(
        (child) => child.nodeType === 1 && child.tagName === "w:rPr"
      );
      if (rPr) pPr.insertBefore(jc, rPr);
      else pPr.appendChild(jc);
    }
    jc.setAttributeNS(WORD_NS, "w:val", "center");

    // Remove paragraph indentation only from the Checked cell. This prevents
    // the ListParagraph style from visually pulling the tick toward the left.
    let ind = Array.from(pPr.childNodes || []).find(
      (child) => child.nodeType === 1 && child.tagName === "w:ind"
    );
    if (!ind) {
      ind = documentXml.createElementNS(WORD_NS, "w:ind");
      const rPr = Array.from(pPr.childNodes || []).find(
        (child) => child.nodeType === 1 && child.tagName === "w:rPr"
      );
      if (rPr) pPr.insertBefore(ind, rPr);
      else pPr.appendChild(ind);
    }
    ind.setAttributeNS(WORD_NS, "w:left", "0");
    ind.setAttributeNS(WORD_NS, "w:right", "0");
    ind.setAttributeNS(WORD_NS, "w:firstLine", "0");
    ind.setAttributeNS(WORD_NS, "w:hanging", "0");
  }

  const firstParagraphNode = Array.from(cell.childNodes || []).find(
    (child) => child.nodeType === 1 && child.tagName === "w:p"
  );
  const tcPr = ensureWordChild(documentXml, cell, "w:tcPr", firstParagraphNode || cell.firstChild);
  let vAlign = Array.from(tcPr.childNodes || []).find(
    (child) => child.nodeType === 1 && child.tagName === "w:vAlign"
  );
  if (!vAlign) {
    vAlign = documentXml.createElementNS(WORD_NS, "w:vAlign");
    tcPr.appendChild(vAlign);
  }
  vAlign.setAttributeNS(WORD_NS, "w:val", "center");
}

function normalizeChecklistPageLayout(documentXml) {
  const sectPr = Array.from(documentXml.getElementsByTagName("w:sectPr"))[0];
  if (sectPr) {
    let pgMar = Array.from(sectPr.childNodes || []).find(
      (child) => child.nodeType === 1 && child.tagName === "w:pgMar"
    );
    if (pgMar) {
      // Keep the template's normal one-inch left margin and make the right
      // margin the same, so the page is balanced when printed.
      pgMar.setAttributeNS(WORD_NS, "w:left", "1440");
      pgMar.setAttributeNS(WORD_NS, "w:right", "1440");
    }
  }

  const table = Array.from(documentXml.getElementsByTagName("w:tbl"))[0];
  if (!table) return;
  const tblPr = Array.from(table.childNodes || []).find(
    (child) => child.nodeType === 1 && child.tagName === "w:tblPr"
  );
  const tblGrid = Array.from(table.childNodes || []).find(
    (child) => child.nodeType === 1 && child.tagName === "w:tblGrid"
  );
  if (!tblPr || !tblGrid) return;

  const pgSz = Array.from(documentXml.getElementsByTagName("w:pgSz"))[0];
  const pageWidth = Number(pgSz?.getAttributeNS(WORD_NS, "w") || pgSz?.getAttribute("w:w") || 11909);
  const tableWidth = Array.from(tblGrid.getElementsByTagName("w:gridCol")).reduce(
    (sum, col) => sum + Number(col.getAttributeNS(WORD_NS, "w") || col.getAttribute("w:w") || 0),
    0
  );
  const usableWidth = Math.max(0, pageWidth - 1440 - 1440);
  const centeredIndent = Math.max(0, Math.round((usableWidth - tableWidth) / 2));

  let tblInd = Array.from(tblPr.childNodes || []).find(
    (child) => child.nodeType === 1 && child.tagName === "w:tblInd"
  );
  if (!tblInd) {
    tblInd = documentXml.createElementNS(WORD_NS, "w:tblInd");
    tblPr.appendChild(tblInd);
  }
  tblInd.setAttributeNS(WORD_NS, "w:w", String(centeredIndent));
  tblInd.setAttributeNS(WORD_NS, "w:type", "dxa");
}

async function finishWordTemplate(zip, documentXml, options = {}) {
  const serializer = new XMLSerializer();
  let documentText = serializer.serializeToString(documentXml);

  // Apply formatting as conservative XML text edits. This avoids rebuilding Word
  // namespace/property nodes in the browser, which can make LibreOffice reject
  // an otherwise valid DOCX.
  if (options.timesNewRoman) {
    documentText = documentText
      .replace(/w:ascii="[^"]*"/g, 'w:ascii="Times New Roman"')
      .replace(/w:hAnsi="[^"]*"/g, 'w:hAnsi="Times New Roman"')
      .replace(/w:eastAsia="[^"]*"/g, 'w:eastAsia="Times New Roman"')
      .replace(/w:cs="[^"]*"/g, 'w:cs="Times New Roman"');

    const stylesFile = zip.file("word/styles.xml");
    if (stylesFile) {
      let stylesText = await stylesFile.async("text");
      stylesText = stylesText
        .replace(/w:ascii="[^"]*"/g, 'w:ascii="Times New Roman"')
        .replace(/w:hAnsi="[^"]*"/g, 'w:hAnsi="Times New Roman"')
        .replace(/w:eastAsia="[^"]*"/g, 'w:eastAsia="Times New Roman"')
        .replace(/w:cs="[^"]*"/g, 'w:cs="Times New Roman"');
      zip.file("word/styles.xml", stylesText);
    }
  }

  if (options.compactPage) {
    documentText = documentText.replace(/<w:pgMar\b([^>]*)\/>/, (match, attrs) => {
      let next = attrs;
      const setAttr = (name, value) => {
        const re = new RegExp(`\\s+w:${name}="[^"]*"`, "g");
        next = next.replace(re, "");
        next += ` w:${name}="${value}"`;
      };
      setAttr("top", "360");
      setAttr("bottom", "360");
      return `<w:pgMar${next}/>`;
    });
  }

  zip.file("word/document.xml", documentText);
  return new Blob([await zip.generateAsync({ type: "arraybuffer" })], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

const ALL_BANDS_FOR_TEMPLATE = ["best", "mediocre", "poor"];

export async function buildChecklistDocxFromTemplate(state, completion = {}) {
  const isLab = String(state?.course?.courseType || "theory").toLowerCase() === "lab";
  const templateUrl = isLab
    ? "/course-file-templates/Course_File_Checklist_Lab.docx"
    : "/course-file-templates/Course_File_Checklist_Theory.docx";
  const { zip, documentXml } = await loadWordTemplate(templateUrl);
  const c = state?.course || {};
  const t = state?.teacher || {};
  replaceTemplateParagraph(documentXml, "Semester:", `Semester: ${`${c.semester || ""} ${c.year || ""}`.trim()}`);
  replaceTemplateParagraph(documentXml, "Course Code:", `Course Code: ${c.code || ""}`);
  replaceTemplateParagraph(documentXml, "Course Title:", `Course Title: ${c.title || ""}`);
  replaceTemplateParagraph(documentXml, "Name & Designation of the teacher:", `Name & Designation of the teacher: ${`${t.name || ""}${t.designation ? `, ${t.designation}` : ""}`.trim()}`);
  const tables = tableMatrixFromWordXml(documentXml);
  const checklistTable = tables[0] || [];
  (state?.checklist || []).slice(0, 9).forEach((item, index) => {
    const cell = checklistTable[index + 1]?.[2];
    if (cell) {
      const checked = completion[item.key]?.status === "Completed";
      setWordNodeText(documentXml, cell, checked ? "✓" : "");
      if (checked) centerWordTableCell(documentXml, cell);
    }
  });
  normalizeChecklistPageLayout(documentXml);
  return finishWordTemplate(zip, documentXml);
}

export async function buildAnswerScriptRecordDocxFromTemplate(state, period, rows = [], options = {}) {
  const isMid = String(period).toLowerCase() === "mid";
  const templateUrl = isMid ? "/course-file-templates/Answer_Scripts_Mid.docx" : "/course-file-templates/Answer_Scripts_Final.docx";
  const { zip, documentXml } = await loadWordTemplate(templateUrl);
  const c = state?.course || {};
  const t = state?.teacher || {};
  replaceTemplateParagraph(documentXml, "Selected 3 Answer scripts for", `Selected 3 Answer scripts for ${`${c.semester || ""} ${c.year || ""}`.trim()}`);
  const tables = tableMatrixFromWordXml(documentXml);
  const info = tables[0] || [];
  const values = [
    `${c.semester || ""} ${c.year || ""}`.trim(), c.intake || "", c.section || "", c.code || "",
    c.title || "", t.name || "", t.designation || "", t.shortCode || "",
  ];
  values.forEach((value, index) => {
    const cell = info[index]?.[1];
    if (cell) setWordNodeText(documentXml, cell, value);
  });
  const scriptTable = tables[1] || [];
  ALL_BANDS_FOR_TEMPLATE.forEach((band, index) => {
    const row = rows.find((entry) => entry.band === band) || {};
    const target = scriptTable[index + 1] || [];
    // Answer Script Sl. No. is optional and entered by the faculty from the portal.
    if (target[0]) setWordNodeText(documentXml, target[0], row.scriptSerialNo || row.answerScriptSlNo || "");
    if (target[1]) setWordNodeText(documentXml, target[1], row.roll || row.studentRoll || "");
    if (target[2]) setWordNodeText(documentXml, target[2], row.name || row.studentName || "");
    if (target[4]) setWordNodeText(documentXml, target[4], row.scoreDisplay || row.score || "");
    if (target[5]) setWordNodeText(documentXml, target[5], row.remarks || "");
  });
  if (options.includeSignature && state?.teacher?.signatureImage) {
    await addSignatureImageToWord(zip, documentXml, state.teacher.signatureImage);
  }
  return finishWordTemplate(zip, documentXml, { timesNewRoman: true, compactPage: true });
}

export async function readObeWorkbookCourseMeta(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const gradeSheet = workbook.Sheets["GradeSheet"] || workbook.Sheets[workbook.SheetNames[0]];
  const reportSheet = workbook.Sheets["Course Report"] || workbook.Sheets[workbook.SheetNames[1]];
  const g = worksheetMatrix(gradeSheet);
  const r = reportSheet ? worksheetMatrix(reportSheet) : [];
  const val = (matrix, row, col) => cleanText(matrix?.[row - 1]?.[col - 1] ?? "");
  return {
    sheetNames: workbook.SheetNames || [],
    course: {
      semesterText: val(g, 8, 1) || val(r, 2, 2), code: val(g, 14, 2) || val(r, 3, 2),
      title: val(g, 15, 2) || val(r, 4, 2), program: val(g, 16, 2), creditHours: val(r, 5, 2),
      faculty: val(g, 17, 2) || val(r, 6, 2), intake: val(g, 18, 2) || val(r, 7, 2),
      section: val(g, 19, 2) || val(r, 8, 2), shift: val(g, 20, 2) || val(r, 9, 2),
    },
  };
}

export async function detectSectionFromCourseFile(file, knownSections = []) {
  const fileName = file?.name || "";
  const configured = (knownSections || []).map((s) => String(s)).filter(Boolean);

  const fromText = (text) => {
    const normalized = String(text || "").replace(/\u00a0/g, " ");
    const intakeSection = normalized.match(/Intake\s*[- ]?Section\s*[:\-]?\s*\d+\s*[-/]\s*([A-Za-z0-9]+)/i);
    if (intakeSection) return intakeSection[1];
    const sectionOnly = normalized.match(/\bSection\s*[:\-]?\s*([A-Za-z0-9]+)/i);
    if (sectionOnly && configured.includes(sectionOnly[1])) return sectionOnly[1];
    for (const section of configured) {
      const pattern = new RegExp(`(?:^|[^0-9A-Za-z])${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^0-9A-Za-z]|$)`);
      if (pattern.test(normalized)) return section;
    }
    return "";
  };

  const fileMatch = fileName.match(/(?:section|sec)[-_\s]*([A-Za-z0-9]+)/i);
  if (fileMatch && (!configured.length || configured.includes(fileMatch[1]))) return fileMatch[1];
  for (const section of configured) {
    const regex = new RegExp(`(?:^|[-_\s])${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[-_\s.]|$)`, "i");
    if (regex.test(fileName)) return section;
  }

  if (/\.pdf$/i.test(fileName)) {
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      let text = "";
      for (let pageNo = 1; pageNo <= Math.min(pdf.numPages, 2); pageNo += 1) {
        const page = await pdf.getPage(pageNo);
        const content = await page.getTextContent();
        text += " " + content.items.map((item) => item.str || "").join(" ");
      }
      const detected = fromText(text);
      if (detected) return detected;
    } catch (error) {
      console.warn("Course-file section detection failed", error);
    }
  }

  return "";
}

function addHeader(doc, title, subtitle = "") {
  const width = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Bangladesh University of Business & Technology (BUBT)", width / 2, 14, { align: "center" });
  doc.setFontSize(11);
  doc.text("Department of Computer Science and Engineering (CSE)", width / 2, 21, { align: "center" });
  doc.setFontSize(13);
  doc.text(title, width / 2, 30, { align: "center" });
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(subtitle, width / 2, 36, { align: "center" });
  }
}

function courseMetaRows(state) {
  const c = state?.course || {};
  const t = state?.teacher || {};
  return [
    ["Semester", `${c.semester || ""} ${c.year || ""}`.trim()],
    ["Course Code", c.code || ""],
    ["Course Title", c.title || ""],
    ["Name & Designation of the teacher", `${t.name || ""}${t.designation ? `, ${t.designation}` : ""}`],
  ];
}

export function buildChecklistPdf(state, completion = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  addHeader(doc, "Course File Checklist Record", `${state?.course?.semester || ""} ${state?.course?.year || ""}`.trim());

  autoTable(doc, {
    startY: 42,
    body: courseMetaRows(state),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
  });

  const rows = (state?.checklist || []).map((item, index) => [
    index + 1,
    item.title,
    completion[item.key]?.status || "Pending",
  ]);

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 7,
    head: [["Sl.", "Materials Checked", "Status"]],
    body: rows,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.4, valign: "middle" },
    headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 12, halign: "center" }, 2: { cellWidth: 28, halign: "center" } },
  });

  const y = Math.min(275, doc.lastAutoTable.finalY + 18);
  doc.setFontSize(9);
  doc.text("Signature of Faculty Member", 35, y);
  doc.line(25, y - 5, 78, y - 5);
  return doc.output("blob");
}

export function buildAnswerScriptRecordPdf(state, period, rows = []) {
  const isMid = String(period).toLowerCase() === "mid";
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const c = state?.course || {};
  const t = state?.teacher || {};
  const title = `Selected ${Math.max(3, rows.length)} Answer scripts for ${c.semester || ""} ${c.year || ""}`.trim();
  addHeader(doc, title);

  const info = [
    ["Semester", `${c.semester || ""} ${c.year || ""}`.trim(), "Intake", c.intake || ""],
    ["Section", c.section || "", "Course Code", c.code || ""],
    ["Course Title", c.title || "", "Course Teacher Name", t.name || ""],
    ["Designation", t.designation || "", "Short Code", t.shortCode || ""],
  ];
  autoTable(doc, {
    startY: 42,
    body: info,
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold" }, 2: { fontStyle: "bold" } },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 7,
    head: [["Answer Script Sl. No", "Student ID", "Student Name", "Answer Script Type", `${isMid ? "Mid Term" : "Final"} Marks(${isMid ? 30 : 40})`, "Remarks (If Any)"]],
    body: rows.map((row) => [
      row.scriptSerialNo || row.answerScriptSlNo || "",
      row.roll || row.studentRoll || "",
      row.name || row.studentName || "",
      BAND_LABEL[row.band] || row.band || "",
      row.scoreDisplay || row.score || "",
      row.remarks || "",
    ]),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2, valign: "middle" },
    headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0] },
  });

  const y = Math.min(276, doc.lastAutoTable.finalY + 25);
  doc.line(65, y - 5, 145, y - 5);
  doc.setFontSize(9);
  doc.text("Signature of Faculty Member", 105, y, { align: "center" });
  return doc.output("blob");
}

function drawBarChart(doc, x, y, w, h, labels, values, title, maxValue = 100) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(title, x + w / 2, y + 5, { align: "center" });
  const plotY = y + 9;
  const plotH = h - 18;
  const plotX = x + 9;
  const plotW = w - 13;
  doc.setDrawColor(210);
  for (let i = 0; i <= 5; i += 1) {
    const yy = plotY + plotH - (i / 5) * plotH;
    doc.line(plotX, yy, plotX + plotW, yy);
  }
  const gap = plotW / Math.max(1, labels.length);
  const bw = Math.min(7, gap * 0.55);
  labels.forEach((label, i) => {
    const value = Math.max(0, Number(values[i]) || 0);
    const barH = Math.min(plotH, (value / maxValue) * plotH);
    const bx = plotX + gap * i + gap / 2 - bw / 2;
    doc.setFillColor(75, 120, 180);
    doc.rect(bx, plotY + plotH - barH, bw, barH, "F");
    doc.setFontSize(5.5);
    doc.text(String(label), bx + bw / 2, plotY + plotH + 4, { align: "center", angle: labels.length > 7 ? 45 : 0 });
  });
  doc.setDrawColor(80);
  doc.rect(x, y, w, h);
}

function gradeCountsFromOutput(output = {}) {
  if (Array.isArray(output.gradeDistribution)) return output.gradeDistribution;
  const order = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "D", "F"];
  const map = Object.fromEntries(order.map((g) => [g, 0]));
  (output.students || []).forEach((s) => { if (map[s.grade] !== undefined) map[s.grade] += 1; });
  return order.map((grade) => ({ grade, count: map[grade] }));
}

export function buildObeCourseReportPdfFromPayload(payload) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const course = payload?.course || {};
  const setup = payload?.setup || {};
  const output = payload?.output || {};
  const teacher = course.createdBy || {};
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Course Report", 105, 16, { align: "center" });

  const info = [
    ["Semester:", `${course.semester || ""} Semester, ${course.year || ""}`],
    ["Course No:", course.code || ""],
    ["Course Title:", course.title || ""],
    ["Cr. Hr.:", course.creditHours || ""],
    ["Faculty:", teacher.name || ""],
    ["Intake:", course.intake || ""],
    ["Section:", course.section || ""],
    ["Shift:", course.shift || ""],
  ];
  autoTable(doc, {
    startY: 20,
    body: info,
    theme: "grid",
    tableWidth: 120,
    margin: { left: 28 },
    styles: { fontSize: 8.5, cellPadding: 1.3 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 34 }, 1: { cellWidth: 86 } },
    headStyles: { fillColor: [245, 245, 245], textColor: 0 },
  });

  const co = (output.coAttainment || []).slice(0, 6);
  const po = (output.poAttainment || []).slice(0, 12);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [["CO Achievement (%)", ...co.map((r) => r.code)]],
    body: [["", ...co.map((r) => Number(r.attainmentPercent || 0).toFixed(2))]],
    theme: "grid",
    styles: { fontSize: 8, halign: "center", cellPadding: 1.5 },
    headStyles: { fillColor: [245, 245, 245], textColor: 0 },
  });

  const poHead = po.slice(0, 6);
  const poTail = po.slice(6, 12);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 5,
    head: [["PO Achievement (%)", ...poHead.map((r) => r.code)]],
    body: [
      ["", ...poHead.map((r) => Number(r.attainmentPercent || 0).toFixed(2))],
      ["", ...poTail.map((r) => r.code), ...Array(Math.max(0, 6 - poTail.length)).fill("")],
      ["", ...poTail.map((r) => Number(r.attainmentPercent || 0).toFixed(2)), ...Array(Math.max(0, 6 - poTail.length)).fill("")],
    ],
    theme: "grid",
    styles: { fontSize: 8, halign: "center", cellPadding: 1.5 },
    headStyles: { fillColor: [245, 245, 245], textColor: 0 },
  });

  drawBarChart(doc, 28, 104, 72, 50, co.map((r) => r.code), co.map((r) => r.attainmentPercent), "CO Achievement Graph");
  drawBarChart(doc, 102, 104, 80, 50, po.map((r) => r.code), po.map((r) => r.attainmentPercent), "PO Achievement Graph");
  const grades = gradeCountsFromOutput(output);
  const maxCount = Math.max(1, ...grades.map((g) => Number(g.count || 0)));
  drawBarChart(doc, 28, 158, 154, 70, grades.map((g) => g.grade), grades.map((g) => g.count), "Result Chart", maxCount);

  doc.addPage();
  doc.setFontSize(8.5);
  const comments = [
    ["Comment 1:", "State your suggestions for improving CO-PO achievement of this course.", setup.courseReportComment1 || ""],
    ["Comment 2:", "State your suggestions for improving teaching methodology of this course.", setup.courseReportComment2 || ""],
    ["General Comment:", "", setup.courseReportGeneralComment || ""],
  ];
  autoTable(doc, {
    startY: 28,
    body: comments,
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: 3, overflow: "linebreak" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 30 }, 1: { cellWidth: 65 }, 2: { cellWidth: 90 } },
  });
  const y = Math.max(125, doc.lastAutoTable.finalY + 20);
  doc.line(55, y, 120, y);
  doc.text("Signature of the Reporting Faculty", 87.5, y + 5, { align: "center" });
  return doc.output("blob");
}

export function buildObeGradeSheetPdfFromPayload(payload) {
  const course = payload?.course || {};
  const output = payload?.output || {};
  const setup = payload?.setup || {};
  const teacher = course.createdBy || {};
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const width = doc.internal.pageSize.getWidth();

  const gradeLabel = (grade) => ({
    "A+": "A (Plus)", A: "A", "A-": "A (Minus)",
    "B+": "B (Plus)", B: "B", "B-": "B (Minus)",
    "C+": "C (Plus)", C: "C", D: "D", F: "F (Fail)",
  }[String(grade || "")] || String(grade || ""));

  const addGradeHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text("Department of Computer Science and Engineering", width / 2, 9, { align: "center" });
    doc.text("Bangladesh University of Business and Technology (BUBT)", width / 2, 15, { align: "center" });
    doc.setFontSize(12);
    doc.text("GRADE SHEET (OBE)", width / 2, 22, { align: "center" });
    doc.setFontSize(8.5);
    doc.text(`${course.semester || ""} Semester, ${course.year || ""}`, width / 2, 28, { align: "center" });
  };
  addGradeHeader();

  autoTable(doc, {
    startY: 32,
    body: [
      ["Course Code", course.code || "", "Course Title", course.title || "", "Program", course.department || ""],
      ["Faculty", teacher.name || "", "Intake", course.intake || "", "Section / Shift", `${course.section || ""} / ${course.shift || ""}`],
    ],
    theme: "grid",
    styles: { fontSize: 6.5, cellPadding: 1.1 },
    columnStyles: { 0: { fontStyle: "bold" }, 2: { fontStyle: "bold" }, 4: { fontStyle: "bold" } },
  });

  const continuous = output?.continuousAssessment || payload?.continuousAssessment || {};
  const continuousHeaders = continuous?.enabled && Array.isArray(continuous.headers) ? continuous.headers : [];
  const blueprints = Array.isArray(output?.blueprints) && output.blueprints.length
    ? output.blueprints
    : (Array.isArray(payload?.blueprints) ? payload.blueprints : []);

  const markMap = new Map();
  (payload?.marks || []).forEach((mark) => {
    const sid = String(mark?.student?._id || mark?.student || "");
    const bid = String(mark?.blueprint?._id || mark?.blueprint || "");
    const entries = new Map((mark?.entries || []).map((entry) => [String(entry.itemKey), Number(entry.obtainedMarks || 0)]));
    markMap.set(`${sid}__${bid}`, entries);
  });

  const detailColumns = [];
  continuousHeaders.forEach((header) => {
    detailColumns.push({
      key: `ca:${header.key}`,
      label: `${header.label || header.assessmentName || header.key}\n(${Number(header.maxMarks || 0)})`,
      value: (student) => student?.continuousAssessment?.[header.key] ?? "",
    });
  });
  if (continuousHeaders.length) {
    detailColumns.push({
      key: "ca:total",
      label: `CA\n(${Number(continuous.totalMarks || 30)})`,
      value: (student) => student?.continuousAssessment?.total ?? "",
    });
  }

  blueprints.forEach((bp) => {
    const bpId = String(bp?._id || bp?.id || "");
    const shortName = String(bp.assessmentName || bp.assessmentType || "Assessment").replace(/\s+/g, " ");
    (bp.items || []).forEach((item) => {
      detailColumns.push({
        key: `${bpId}:${item.key}`,
        label: `${shortName}\n${item.label || item.key}\n${item.coCode || ""} (${Number(item.marks || 0)})`,
        value: (student) => markMap.get(`${student.studentId}__${bpId}`)?.get(String(item.key)) ?? 0,
      });
    });
    detailColumns.push({
      key: `${bpId}:total`,
      label: `${shortName}\nTotal (${Number(bp.totalMarks || 0)})`,
      value: (student) => {
        const found = (student.assessmentTotals || []).find((row) => String(row.blueprintId) === bpId);
        return found?.totalMarks ?? "";
      },
    });
  });

  const head = ["ID No", "Name", ...detailColumns.map((column) => column.label), "Total", "Letter Grade"];
  const body = (output.students || []).map((student) => [
    student.roll || "",
    student.name || "",
    ...detailColumns.map((column) => column.value(student)),
    Number(student.courseObtained ?? student.scaledTotal ?? 0).toFixed(2),
    gradeLabel(student.grade),
  ]);

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 3,
    head: [head],
    body,
    theme: "grid",
    styles: {
      fontSize: detailColumns.length > 14 ? 4.3 : detailColumns.length > 9 ? 4.9 : 5.8,
      cellPadding: 0.55,
      halign: "center",
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: { fillColor: [230, 235, 240], textColor: 0, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 40, halign: "left" } },
    margin: { left: 6, right: 6 },
    showHead: "everyPage",
  });

  // Result Summary - mirrors the summary portion of the official grade sheet.
  doc.addPage("a4", "landscape");
  const distribution = gradeCountsFromOutput(output);
  const totalStudents = Number(output.totalStudents || (output.students || []).length || 0);
  autoTable(doc, {
    startY: 15,
    head: [["Result Summary", "No. of Students", "Percentage (%)"]],
    body: distribution.map((row) => [gradeLabel(row.grade), Number(row.count || 0), Number(row.percent ?? (totalStudents ? (Number(row.count || 0) / totalStudents) * 100 : 0)).toFixed(2)]),
    theme: "grid",
    tableWidth: 115,
    margin: { left: 18 },
    styles: { fontSize: 7.5, cellPadding: 1.5, halign: "center" },
    headStyles: { fillColor: [235, 235, 235], textColor: 0 },
  });
  const maxCount = Math.max(1, ...distribution.map((row) => Number(row.count || 0)));
  drawBarChart(doc, 145, 15, 125, 85, distribution.map((row) => row.grade), distribution.map((row) => row.count), "Result Chart", maxCount);

  const cos = (output.coAttainment || []).slice(0, 6);
  if (cos.length) {
    autoTable(doc, {
      startY: Math.max(doc.lastAutoTable.finalY + 9, 108),
      head: [["CO", "Max Mark", `Threshold (${Number(output.thresholdPercent ?? setup.thresholdPercent ?? 40)}%)`, "Students Attained", "CO Achievement (%)", "Level"]],
      body: cos.map((row) => [row.code, Number(row.maxMarks || 0).toFixed(2), Number(row.thresholdMarks || 0).toFixed(2), `${row.attainedCount || 0}/${row.totalStudents || totalStudents}`, Number(row.attainmentPercent || 0).toFixed(2), row.level ?? ""]),
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 1.2, halign: "center" },
      headStyles: { fillColor: [220, 240, 245], textColor: 0 },
      tableWidth: 135,
      margin: { left: 18 },
    });
  }
  const pos = (output.poAttainment || []).slice(0, 12);
  if (pos.length) {
    autoTable(doc, {
      startY: cos.length ? doc.lastAutoTable.finalY + 6 : 110,
      head: [["PO", "PO Achievement (%)", "Level"]],
      body: pos.map((row) => [row.code, Number(row.attainmentPercent || 0).toFixed(2), row.level ?? ""]),
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 1.2, halign: "center" },
      headStyles: { fillColor: [220, 240, 245], textColor: 0 },
      tableWidth: 95,
      margin: { left: 18 },
    });
  }

  // Per-student CO achievement analysis, as shown after the Grade Sheet in the supplied sample PDF.
  if (cos.length && (output.students || []).length) {
    doc.addPage("a4", "landscape");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("CO & PO ACHIEVEMENT ANALYSIS", width / 2, 11, { align: "center" });
    const coHead = ["Student ID", "Student Name", ...cos.map((co) => `${co.code}\nObt / % / Y-N`)];
    const coBody = (output.students || []).map((student) => {
      const byCode = new Map((student.coRows || []).map((row) => [row.code, row]));
      return [
        student.roll || "",
        student.name || "",
        ...cos.map((co) => {
          const row = byCode.get(co.code) || {};
          return `${Number(row.obtainedMarks || 0).toFixed(2)} / ${Number(row.percent || 0).toFixed(2)} / ${row.achieved ? "Y" : "N"}`;
        }),
      ];
    });
    autoTable(doc, {
      startY: 15,
      head: [coHead],
      body: coBody,
      theme: "grid",
      styles: { fontSize: 5.8, cellPadding: 0.85, halign: "center" },
      headStyles: { fillColor: [190, 225, 235], textColor: 0 },
      columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 46, halign: "left" } },
      margin: { left: 6, right: 6 },
      showHead: "everyPage",
    });
  }

  return doc.output("blob");
}

function worksheetMatrix(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
}

export async function buildObePdfsFromWorkbook(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const gradeSheet = workbook.Sheets["GradeSheet"] || workbook.Sheets[workbook.SheetNames[0]];
  const reportSheet = workbook.Sheets["Course Report"];
  const g = worksheetMatrix(gradeSheet);
  const r = reportSheet ? worksheetMatrix(reportSheet) : [];

  const val = (matrix, row, col) => cleanText(matrix?.[row - 1]?.[col - 1] ?? "");
  const course = {
    semesterText: val(g, 8, 1) || val(r, 2, 2),
    code: val(g, 14, 2) || val(r, 3, 2),
    title: val(g, 15, 2) || val(r, 4, 2),
    program: val(g, 16, 2),
    creditHours: val(r, 5, 2),
    faculty: val(g, 17, 2) || val(r, 6, 2),
    intake: val(g, 18, 2) || val(r, 7, 2),
    section: val(g, 19, 2) || val(r, 8, 2),
    shift: val(g, 20, 2) || val(r, 9, 2),
  };

  const reportDoc = new jsPDF({ unit: "mm", format: "a4" });
  reportDoc.setFont("helvetica", "bold"); reportDoc.setFontSize(13); reportDoc.text("Course Report", 105, 16, { align: "center" });
  autoTable(reportDoc, {
    startY: 20,
    body: [
      ["Semester:", course.semesterText], ["Course No:", course.code], ["Course Title:", course.title], ["Cr. Hr.:", course.creditHours], ["Faculty:", course.faculty], ["Intake:", course.intake], ["Section:", course.section], ["Shift:", course.shift],
    ],
    theme: "grid", tableWidth: 120, margin: { left: 28 }, styles: { fontSize: 8.5, cellPadding: 1.3 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 34 }, 1: { cellWidth: 86 } },
  });
  const coLabels = Array.from({ length: 6 }, (_, i) => val(r, 13, 3 + i)).filter(Boolean);
  const coValues = coLabels.map((_, i) => Number(val(r, 14, 3 + i)) || 0);
  const poTopLabels = Array.from({ length: 6 }, (_, i) => val(r, 16, 3 + i)).filter(Boolean);
  const poTopValues = poTopLabels.map((_, i) => Number(val(r, 17, 3 + i)) || 0);
  const poBottomLabels = Array.from({ length: 6 }, (_, i) => val(r, 18, 3 + i)).filter(Boolean);
  const poBottomValues = poBottomLabels.map((_, i) => Number(val(r, 19, 3 + i)) || 0);
  const poLabels = [...poTopLabels, ...poBottomLabels];
  const poValues = [...poTopValues, ...poBottomValues];

  autoTable(reportDoc, {
    startY: reportDoc.lastAutoTable.finalY + 7,
    head: [["CO Achievement (%)", ...coLabels]],
    body: [["", ...coValues.map((value) => Number(value).toFixed(2))]],
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 1.2, halign: "center" },
    headStyles: { fillColor: [160, 160, 160], textColor: [0, 0, 0] },
  });
  autoTable(reportDoc, {
    startY: reportDoc.lastAutoTable.finalY + 4,
    head: [["PO Achievement (%)", ...poTopLabels, ...Array(Math.max(0, 6 - poTopLabels.length)).fill("")]],
    body: [
      ["", ...poTopValues.map((value) => Number(value).toFixed(2)), ...Array(Math.max(0, 6 - poTopValues.length)).fill("")],
      ["", ...poBottomLabels, ...Array(Math.max(0, 6 - poBottomLabels.length)).fill("")],
      ["", ...poBottomValues.map((value) => Number(value).toFixed(2)), ...Array(Math.max(0, 6 - poBottomValues.length)).fill("")],
    ],
    theme: "grid",
    styles: { fontSize: 7.2, cellPadding: 1.1, halign: "center" },
    headStyles: { fillColor: [160, 160, 160], textColor: [0, 0, 0] },
  });

  const chartY = Math.max(110, reportDoc.lastAutoTable.finalY + 7);
  drawBarChart(reportDoc, 28, chartY, 72, 48, coLabels, coValues, "CO Achievement Graph");
  drawBarChart(reportDoc, 102, chartY, 80, 48, poLabels, poValues, "PO Achievement Graph");

  const gradeOrder = ["A (Plus)", "A", "A (Minus)", "B (Plus)", "B", "B (Minus)", "C (Plus)", "C", "D", "F (Fail)"];
  const gradeCountMap = Object.fromEntries(gradeOrder.map((grade) => [grade, 0]));
  for (let rowNo = 30; rowNo <= g.length; rowNo += 1) {
    const roll = val(g, rowNo, 1);
    if (!roll || !/^\d{6,20}$/.test(roll)) continue;
    const grade = val(g, rowNo, 24);
    if (Object.prototype.hasOwnProperty.call(gradeCountMap, grade)) gradeCountMap[grade] += 1;
  }
  const gradeCounts = gradeOrder.map((grade) => gradeCountMap[grade]);
  drawBarChart(reportDoc, 28, chartY + 53, 154, 63, gradeOrder, gradeCounts, "Result Chart", Math.max(1, ...gradeCounts));
  reportDoc.addPage();
  autoTable(reportDoc, {
    startY: 25,
    body: [
      ["Comment 1:", val(r, 55, 2), val(r, 56, 2)],
      ["Comment 2:", val(r, 61, 2), val(r, 62, 2)],
      ["General Comment:", "", val(r, 67, 2)],
    ],
    theme: "plain", styles: { fontSize: 8.5, cellPadding: 3 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 30 }, 1: { cellWidth: 65 }, 2: { cellWidth: 90 } },
  });
  reportDoc.line(55, 130, 120, 130); reportDoc.text("Signature of the Reporting Faculty", 87.5, 135, { align: "center" });

  const gradeDoc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const gw = gradeDoc.internal.pageSize.getWidth();
  gradeDoc.setFont("helvetica", "bold"); gradeDoc.setFontSize(11); gradeDoc.text("Department of Computer Science and Engineering", gw / 2, 10, { align: "center" });
  gradeDoc.text("Bangladesh University of Business and Technology (BUBT)", gw / 2, 16, { align: "center" }); gradeDoc.setFontSize(12); gradeDoc.text("GRADE SHEET (OBE)", gw / 2, 23, { align: "center" });
  autoTable(gradeDoc, { startY: 29, body: [["Course", `${course.code} - ${course.title}`, "Faculty", course.faculty, "Intake-Section", `${course.intake}-${course.section}`], ["Program", course.program || "", "Shift", course.shift || "", "Semester", course.semesterText || ""]], theme: "grid", styles: { fontSize: 6.8, cellPadding: 1.1 }, columnStyles: { 0: { fontStyle: "bold" }, 2: { fontStyle: "bold" }, 4: { fontStyle: "bold" } } });

  // Official BUBT GradeSheet uses C:G for continuous items, H for CA total,
  // I:N for Mid questions, O for Mid total, P:U for Final questions,
  // V for Final total, W for course total and X for letter grade.
  const colNo = (letters) => {
    let value = 0;
    for (const ch of letters) value = value * 26 + (ch.charCodeAt(0) - 64);
    return value;
  };
  const detailLetters = ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X"];
  const specialLabels = { H: "CA", O: "MT", V: "FE", W: "Total", X: "Letter Grade" };
  const detailHeader = detailLetters.map((letter) => {
    if (specialLabels[letter]) return specialLabels[letter];
    const c = colNo(letter);
    const label = val(g, 27, c) || val(g, 26, c) || letter;
    const coCode = val(g, 28, c);
    const marks = val(g, 29, c);
    return [label, coCode, marks ? `(${marks})` : ""].filter(Boolean).join("\n");
  });
  const students = [];
  for (let row = 30; row <= Math.min(g.length, 220); row += 1) {
    const roll = val(g, row, 1); const name = val(g, row, 2);
    if (!roll || !/^\d{6,20}$/.test(roll)) continue;
    students.push([roll, name, ...detailLetters.map((letter) => val(g, row, colNo(letter)))]);
  }
  autoTable(gradeDoc, {
    startY: gradeDoc.lastAutoTable.finalY + 4,
    head: [["ID No", "Name", ...detailHeader]],
    body: students,
    theme: "grid",
    styles: { fontSize: 4.7, cellPadding: 0.55, halign: "center", valign: "middle", overflow: "linebreak" },
    headStyles: { fillColor: [235, 235, 235], textColor: 0 },
    columnStyles: { 0: { cellWidth: 23 }, 1: { cellWidth: 41, halign: "left" } },
    margin: { left: 6, right: 6 },
    showHead: "everyPage",
  });

  gradeDoc.addPage("a4", "landscape");
  const workbookGradeOrder = ["A (Plus)", "A", "A (Minus)", "B (Plus)", "B", "B (Minus)", "C (Plus)", "C", "D", "F (Fail)"];
  const summaryCounts = Object.fromEntries(workbookGradeOrder.map((grade) => [grade, 0]));
  students.forEach((row) => { const grade = String(row[row.length - 1] || ""); if (summaryCounts[grade] !== undefined) summaryCounts[grade] += 1; });
  const studentTotal = students.length || 1;
  autoTable(gradeDoc, {
    startY: 14,
    head: [["Result Summary", "No. of Students", "Percentage (%)"]],
    body: workbookGradeOrder.map((grade) => [grade, summaryCounts[grade], ((summaryCounts[grade] / studentTotal) * 100).toFixed(2)]),
    theme: "grid", tableWidth: 115, margin: { left: 18 },
    styles: { fontSize: 7.5, cellPadding: 1.4, halign: "center" },
    headStyles: { fillColor: [235, 235, 235], textColor: 0 },
  });
  const maxWorkbookCount = Math.max(1, ...Object.values(summaryCounts));
  drawBarChart(gradeDoc, 145, 14, 125, 85, workbookGradeOrder, workbookGradeOrder.map((grade) => summaryCounts[grade]), "Result Chart", maxWorkbookCount);
  if (coLabels.length || poLabels.length) {
    autoTable(gradeDoc, {
      startY: 108,
      head: [["Outcome", "Achievement (%)"]],
      body: [...coLabels.map((label, i) => [label, Number(coValues[i] || 0).toFixed(2)]), ...poLabels.map((label, i) => [label, Number(poValues[i] || 0).toFixed(2)])],
      theme: "grid", tableWidth: 90, margin: { left: 18 }, styles: { fontSize: 7, cellPadding: 1.2, halign: "center" },
      headStyles: { fillColor: [220, 240, 245], textColor: 0 },
    });
  }

  return {
    course,
    courseReportBlob: reportDoc.output("blob"),
    gradeSheetBlob: gradeDoc.output("blob"),
    courseReportName: safeFileName(`Course_Report_${course.intake}-${course.section}_${course.code}.pdf`),
    gradeSheetName: safeFileName(`GradeSheet_${course.intake}-${course.section}_${course.code}.pdf`),
  };
}

export function buildContinuousLabFiles({ state, students = [], marks = [], assessmentIds = [] }) {
  const assessments = new Map((state?.assessments || []).map((a) => [String(a.id), a]));
  const selected = (assessmentIds || []).map(String).filter((id) => assessments.has(id));
  const markMap = new Map();
  marks.forEach((mark) => {
    if (mark.status !== "present") return;
    markMap.set(`${mark.student}__${mark.assessment}`, Number(mark.obtainedMarks || 0));
  });
  const rows = students.map((s) => {
    const scores = selected.map((aid) => markMap.get(`${s.id}__${aid}`) ?? "");
    const numeric = scores.filter((v) => typeof v === "number" && Number.isFinite(v));
    const total = numeric.reduce((sum, v) => sum + v, 0);
    return [s.roll || "", s.name || "", ...scores, Math.round(total * 100) / 100];
  });
  const headers = ["Student ID", "Student Name", ...selected.map((id) => assessments.get(id)?.name || id), "Total"];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Bangladesh University of Business & Technology (BUBT)"],
    ["Department of Computer Science and Engineering (CSE)"],
    ["Continuous Lab Performance"],
    [`${state?.course?.code || ""} - ${state?.course?.title || ""} | Intake-Section: ${state?.course?.intake || ""}-${state?.course?.section || ""}`],
    [], headers, ...rows,
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Continuous Lab Performance");
  const excelArray = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const excelBlob = new Blob([excelArray], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  addHeader(pdf, "Continuous Lab Performance", `${state?.course?.code || ""} - ${state?.course?.title || ""}`);
  autoTable(pdf, { startY: 42, head: [headers], body: rows, theme: "grid", styles: { fontSize: selected.length > 6 ? 5.5 : 7, cellPadding: 1 }, headStyles: { fillColor: [235, 235, 235], textColor: 0 }, columnStyles: { 1: { cellWidth: 48, halign: "left" } } });
  return { excelBlob, pdfBlob: pdf.output("blob"), headers, rows };
}

async function blobToDataUrl(blob) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function addTextPages(doc, text, title, pageState) {
  const addPage = () => {
    if (pageState.used) doc.addPage(); else pageState.used = true;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(title || "Document", 15, 16);
  };
  addPage();
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  const lines = doc.splitTextToSize(String(text || ""), 180);
  let y = 24;
  lines.forEach((line) => {
    if (y > 282) { addPage(); y = 24; }
    doc.text(line, 15, y); y += 4.2;
  });
}

function xmlNodeText(node) {
  if (!node) return "";
  const texts = Array.from(node.getElementsByTagName("w:t")).map((el) => el.textContent || "");
  return cleanText(texts.join(" "));
}

async function extractDocxBlocks(blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file("word/document.xml")?.async("text");
  if (!xml) return [];
  const parser = new DOMParser();
  const documentXml = parser.parseFromString(xml, "application/xml");
  const body = documentXml.getElementsByTagName("w:body")?.[0];
  if (!body) return [];

  const relMap = new Map();
  const relXml = await zip.file("word/_rels/document.xml.rels")?.async("text");
  if (relXml) {
    const relDoc = parser.parseFromString(relXml, "application/xml");
    Array.from(relDoc.getElementsByTagName("Relationship")).forEach((rel) => {
      const id = rel.getAttribute("Id");
      const target = rel.getAttribute("Target");
      if (id && target) relMap.set(id, target.replace(/^\.\//, ""));
    });
  }

  const blocks = [];
  for (const child of Array.from(body.children || [])) {
    const tag = child.tagName || "";
    if (tag.endsWith(":p") || tag === "w:p") {
      const text = xmlNodeText(child);
      if (text) blocks.push({ type: "text", text });
      const blips = Array.from(child.getElementsByTagName("a:blip"));
      for (const blip of blips) {
        const rid = blip.getAttribute("r:embed") || blip.getAttribute("embed");
        const target = relMap.get(rid);
        if (!target) continue;
        const path = target.startsWith("word/") ? target : `word/${target.replace(/^\.\.\//, "")}`;
        const file = zip.file(path);
        if (!file) continue;
        const imageBlob = await file.async("blob");
        blocks.push({ type: "image", blob: imageBlob, name: path.split("/").pop() || "image" });
      }
    } else if (tag.endsWith(":tbl") || tag === "w:tbl") {
      const rows = Array.from(child.getElementsByTagName("w:tr")).map((tr) =>
        Array.from(tr.getElementsByTagName("w:tc")).map((tc) => xmlNodeText(tc))
      );
      if (rows.length) blocks.push({ type: "table", rows });
    }
  }
  return blocks;
}

async function appendDocxBlob(doc, blob, title, pageState) {
  const blocks = await extractDocxBlocks(blob);
  const newPage = () => {
    if (pageState.used) doc.addPage("a4", "portrait"); else pageState.used = true;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(title || "Document", 15, 14);
    return 21;
  };
  let y = newPage();
  for (const block of blocks) {
    if (block.type === "text") {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      const lines = doc.splitTextToSize(block.text || "", 180);
      for (const line of lines) {
        if (y > 282) y = newPage();
        doc.text(line, 15, y);
        y += 4.2;
      }
      y += 1.5;
    } else if (block.type === "table") {
      if (y > 258) y = newPage();
      autoTable(doc, {
        startY: y,
        body: block.rows,
        theme: "grid",
        styles: { fontSize: 7, cellPadding: 1.1, overflow: "linebreak", valign: "middle" },
        margin: { left: 15, right: 15 },
      });
      y = Math.min(282, (doc.lastAutoTable?.finalY || y) + 4);
    } else if (block.type === "image" && block.blob) {
      if (y > 235) y = newPage();
      const dataUrl = await blobToDataUrl(block.blob);
      const format = /\.png$/i.test(block.name || "") ? "PNG" : "JPEG";
      const maxW = 150;
      const maxH = 55;
      try {
        const props = doc.getImageProperties(dataUrl);
        const ratio = Math.min(maxW / props.width, maxH / props.height, 1);
        const w = props.width * ratio;
        const h = props.height * ratio;
        if (y + h > 285) y = newPage();
        doc.addImage(dataUrl, format, 15, y, w, h, undefined, "FAST");
        y += h + 4;
      } catch (_error) {
        // Unsupported embedded image formats are kept in the original DOCX in the ZIP.
      }
    }
  }
  if (!blocks.length) addTextPages(doc, "The DOCX did not contain readable document blocks.", title, pageState);
}

function canvasHasVisibleContent(canvas, ctx) {
  try {
    const width = Number(canvas?.width || 0);
    const height = Number(canvas?.height || 0);
    if (!width || !height || !ctx) return true;

    const imageData = ctx.getImageData(0, 0, width, height).data;
    // Sample at most roughly 180k pixels. A normal text-only document easily
    // exceeds the visible-pixel threshold, while a failed pdf.js render is
    // essentially pure white.
    const totalPixels = width * height;
    const step = Math.max(1, Math.floor(Math.sqrt(totalPixels / 180000)));
    let sampled = 0;
    let visible = 0;

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4;
        const r = imageData[i];
        const g = imageData[i + 1];
        const b = imageData[i + 2];
        const a = imageData[i + 3];
        sampled += 1;
        if (a > 16 && (r < 246 || g < 246 || b < 246) && (r + g + b) < 730) visible += 1;
      }
    }

    if (!sampled) return true;
    return (visible / sampled) >= 0.00035;
  } catch (_error) {
    // Do not reject a page merely because browser security/memory prevented
    // pixel inspection; the normal PDF rendering path can still be used.
    return true;
  }
}

async function pdfPageAppearsToContainContent(page) {
  try {
    const ops = await page.getOperatorList();
    return Number(ops?.fnArray?.length || 0) > 6;
  } catch (_error) {
    return true;
  }
}

async function renderPdfPageToImage(page) {
  const baseViewport = page.getViewport({ scale: 1 });
  const baseWidth = Math.max(1, Number(baseViewport.width || 1));
  const baseHeight = Math.max(1, Number(baseViewport.height || 1));

  // Some uploaded PDFs contain very large media boxes. Rendering those at a
  // fixed 2x scale can exceed the browser canvas limit and previously caused
  // the whole file to be replaced by the "included separately" placeholder.
  // Cap the raster size while keeping enough resolution for normal printing.
  const maxSide = 2400;
  const maxPixels = 5_500_000;
  const sideScale = maxSide / Math.max(baseWidth, baseHeight);
  const pixelScale = Math.sqrt(maxPixels / (baseWidth * baseHeight));
  const preferred = Math.max(0.72, Math.min(2, sideScale, pixelScale));
  const attempts = Array.from(new Set([preferred, Math.min(preferred, 1.35), 1, 0.72].map((v) => Number(v.toFixed(3)))));

  let lastError = null;
  for (const scale of attempts) {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) continue;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    try {
      await page.render({ canvasContext: ctx, viewport, background: "white", intent: "display" }).promise;

      let hasVisibleContent = canvasHasVisibleContent(canvas, ctx);
      if (!hasVisibleContent && await pdfPageAppearsToContainContent(page)) {
        // Some PDFs technically render without an exception but pdf.js produces
        // a white canvas. Retry once using the print rendering intent; if that is
        // still white, throw so the caller can normalize the PDF server-side.
        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        await page.render({ canvasContext: ctx, viewport, background: "white", intent: "print" }).promise;
        hasVisibleContent = canvasHasVisibleContent(canvas, ctx);
        if (!hasVisibleContent) {
          throw new Error("The PDF page opened but rendered blank in the browser.");
        }
      }

      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      if (!dataUrl || dataUrl === "data:,") throw new Error("The PDF page could not be rasterized.");
      return dataUrl;
    } catch (error) {
      lastError = error;
      try { page.cleanup(); } catch (_cleanupError) { /* ignore */ }
    }
  }
  throw lastError || new Error("The PDF page could not be rendered.");
}

async function appendPdfBlob(doc, blob, title, pageState) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!bytes.length) throw new Error(`${title || "PDF"} is empty.`);

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({
      data: bytes,
      useSystemFonts: true,
      isEvalSupported: false,
      stopAtErrors: false,
      disableFontFace: false,
    }).promise;
  } catch (firstError) {
    // A small number of older/hand-generated PDFs are more tolerant with font
    // faces disabled. Retry before giving up on the document.
    pdf = await pdfjsLib.getDocument({
      data: bytes,
      useSystemFonts: true,
      isEvalSupported: false,
      stopAtErrors: false,
      disableFontFace: true,
    }).promise.catch(() => { throw firstError; });
  }

  // Render the complete source PDF before touching the destination PDF. If one
  // source page is malformed/unsupported, a fallback normalization can retry
  // the file without leaving duplicate or half-appended pages behind.
  const renderedPages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const sourceViewport = page.getViewport({ scale: 1 });
    let pageWidthMm = (Number(sourceViewport.width || 0) * 25.4) / 72;
    let pageHeightMm = (Number(sourceViewport.height || 0) * 25.4) / 72;
    if (!Number.isFinite(pageWidthMm) || pageWidthMm <= 0 || !Number.isFinite(pageHeightMm) || pageHeightMm <= 0) {
      pageWidthMm = 210;
      pageHeightMm = 297;
    }

    const maxMm = 500;
    if (Math.max(pageWidthMm, pageHeightMm) > maxMm) {
      const ratio = maxMm / Math.max(pageWidthMm, pageHeightMm);
      pageWidthMm *= ratio;
      pageHeightMm *= ratio;
    }

    const image = await renderPdfPageToImage(page);
    renderedPages.push({
      image,
      pageWidthMm,
      pageHeightMm,
      orientation: pageWidthMm > pageHeightMm ? "landscape" : "portrait",
    });
    try { page.cleanup(); } catch (_cleanupError) { /* ignore */ }
  }

  for (const rendered of renderedPages) {
    if (!pageState.used) {
      doc.addPage([rendered.pageWidthMm, rendered.pageHeightMm], rendered.orientation);
      doc.deletePage(1);
      doc.setPage(1);
      pageState.used = true;
    } else {
      doc.addPage([rendered.pageWidthMm, rendered.pageHeightMm], rendered.orientation);
    }
    doc.addImage(rendered.image, "JPEG", 0, 0, rendered.pageWidthMm, rendered.pageHeightMm, undefined, "FAST");
  }
}


async function copyPdfBlobIntoDocument(outputPdf, blob, title = "PDF") {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!bytes.length) throw new Error(`${title} is empty.`);

  const sourcePdf = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const pageIndices = sourcePdf.getPageIndices();
  const copiedPages = await outputPdf.copyPages(sourcePdf, pageIndices);
  copiedPages.forEach((page) => outputPdf.addPage(page));
}

async function rgbaBitmapToPng({ data, width, height }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("The browser could not create a canvas for PDF rendering.");

  // @hyzyla/pdfium renders with PDFium's REVERSE_BYTE_ORDER flag, so the
  // returned four-channel bitmap can be placed in ImageData directly.
  const source = data instanceof Uint8Array ? data : new Uint8Array(data);
  const rgba = new Uint8ClampedArray(source.byteLength);
  rgba.set(source);
  context.putImageData(new ImageData(rgba, width, height), 0, 0);

  const pngBlob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error("The browser could not encode the rendered PDF page."));
    }, "image/png");
  });

  return new Uint8Array(await pngBlob.arrayBuffer());
}

async function renderPdfWithPdfiumIntoDocument(outputPdf, blob, title = "PDF") {
  // Chrome can display some PDFs that pdf.js/LibreOffice/pdf-lib cannot faithfully
  // reproduce (for example, PDFs with restrictive encryption or catalog-level
  // resources). For the Course Outline only, render with PDFium WASM and embed the
  // visible result page-for-page. The original upload remains untouched in storage
  // and in the ZIP package.
  // Use the package's browser/base64 entrypoint so the PDFium WASM binary is
  // loaded with the module itself. The generic browser entrypoint requires an
  // explicit wasmUrl/wasmBinary and fails at runtime if neither is supplied.
  // Because this is a dynamic import, the larger WASM payload is loaded only
  // when a Course Outline actually needs the PDFium fallback.
  const { PDFiumLibrary } = await import("@hyzyla/pdfium/browser/base64");
  const library = await PDFiumLibrary.init({ disableBase64Warning: true });
  let pdfDocument = null;

  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!bytes.length) throw new Error(`${title} is empty.`);
    pdfDocument = await library.loadDocument(bytes);

    let renderedCount = 0;
    for (const page of pdfDocument.pages()) {
      const rendered = await page.render({
        scale: 2.5, // 180 DPI: clear enough for normal printed text while keeping file size reasonable.
        renderFormFields: true,
        render: rgbaBitmapToPng,
      });

      if (!rendered?.data?.length || !rendered?.originalWidth || !rendered?.originalHeight) {
        throw new Error(`PDFium returned an empty page while rendering ${title}.`);
      }

      const embedded = await outputPdf.embedPng(rendered.data);
      const targetPage = outputPdf.addPage([rendered.originalWidth, rendered.originalHeight]);
      targetPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: rendered.originalWidth,
        height: rendered.originalHeight,
      });
      renderedCount += 1;
    }

    if (!renderedCount) throw new Error(`${title} has no printable pages.`);
  } finally {
    try { pdfDocument?.destroy?.(); } catch (_) {}
    try { library?.destroy?.(); } catch (_) {}
  }
}

async function browserEntryToStandalonePdf(entry) {
  const blob = entry?.blob;
  const name = entry?.name || "Document";
  if (!blob) throw new Error(`${name} is empty.`);

  const type = String(blob.type || "").toLowerCase();
  const lower = name.toLowerCase();
  const tempDoc = new jsPDF({ unit: "mm", format: "a4" });
  const pageState = { used: false };

  if (type.startsWith("image/") || /\.(png|jpe?g)$/i.test(lower)) {
    const dataUrl = await blobToDataUrl(blob);
    const isPng = lower.endsWith(".png") || type.includes("png");
    const imageProps = tempDoc.getImageProperties(dataUrl);
    const pxW = Math.max(1, Number(imageProps?.width || 1));
    const pxH = Math.max(1, Number(imageProps?.height || 1));
    const landscape = pxW > pxH;
    const pageW = landscape ? 297 : 210;
    const pageH = landscape ? 210 : 297;
    tempDoc.setPage(1);
    if (landscape) {
      // Recreate page 1 in landscape so the image is not squeezed into portrait.
      tempDoc.addPage("a4", "landscape");
      tempDoc.deletePage(1);
      tempDoc.setPage(1);
    }
    const margin = 10;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const scale = Math.min(maxW / pxW, maxH / pxH);
    const drawW = pxW * scale;
    const drawH = pxH * scale;
    tempDoc.addImage(
      dataUrl,
      isPng ? "PNG" : "JPEG",
      (pageW - drawW) / 2,
      (pageH - drawH) / 2,
      drawW,
      drawH,
      undefined,
      "FAST"
    );
    pageState.used = true;
  } else if (lower.endsWith(".docx")) {
    await appendDocxBlob(tempDoc, blob, name, pageState);
  } else if (/\.(xlsx|xlsm|xls|csv)$/i.test(lower)) {
    const wb = XLSX.read(await blob.arrayBuffer(), { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const matrix = worksheetMatrix(sheet).slice(0, 150);
    tempDoc.addPage("a4", "landscape");
    tempDoc.deletePage(1);
    tempDoc.setPage(1);
    tempDoc.setFontSize(10);
    tempDoc.text(name, 10, 10);
    autoTable(tempDoc, {
      startY: 14,
      body: matrix,
      theme: "grid",
      styles: { fontSize: 5, cellPadding: 0.6, overflow: "linebreak" },
    });
    pageState.used = true;
  } else {
    addTextPages(
      tempDoc,
      `The original file '${name}' is included in the ZIP package. This file type cannot be reliably converted into the combined PDF in the browser.`,
      name,
      pageState
    );
  }

  if (!pageState.used) {
    addTextPages(tempDoc, `No printable content was found in '${name}'.`, name, pageState);
  }
  return tempDoc.output("blob");
}

export async function combineCourseFileBlobs(entries = [], options = {}) {
  // Do NOT rasterize uploaded PDFs with pdf.js. Rasterization was the reason
  // some perfectly valid Course Outline PDFs became a white page. pdf-lib
  // copies each original PDF page directly into the destination document, so
  // fonts, vectors, images, orientation and the source page size are retained.
  const outputPdf = await PDFDocument.create();

  for (const entry of entries) {
    const blob = entry?.blob;
    if (!blob) continue;
    const name = entry.name || "Document";
    const type = String(blob.type || "").toLowerCase();
    const lower = name.toLowerCase();

    try {
      if (type.includes("pdf") || lower.endsWith(".pdf")) {
        const isCourseOutline = entry?.doc?.itemKey === "outline";

        if (isCourseOutline) {
          // The Course Outline is the one document we have repeatedly seen open
          // correctly in Chrome but become blank when processed by pdf.js,
          // LibreOffice or page-copy merging. Render it with PDFium (Chromium's
          // PDF engine) so the combined course file contains the pages the user
          // actually sees. Do not use the old direct-copy path first.
          try {
            await renderPdfWithPdfiumIntoDocument(outputPdf, blob, name);
          } catch (pdfiumError) {
            const normalizePdf = options?.normalizePdf;
            if (typeof normalizePdf !== "function") throw pdfiumError;
            const normalizedBlob = await normalizePdf({ entry, blob, name, error: pdfiumError });
            if (!normalizedBlob) throw pdfiumError;
            await renderPdfWithPdfiumIntoDocument(outputPdf, normalizedBlob, name);
          }
        } else {
          try {
            await copyPdfBlobIntoDocument(outputPdf, blob, name);
          } catch (firstError) {
            // A malformed/encrypted PDF can still be normalized by the existing
            // backend LibreOffice endpoint. After normalization we again COPY its
            // pages directly; pdf.js is never used for the combined PDF.
            const normalizePdf = options?.normalizePdf;
            if (typeof normalizePdf !== "function") throw firstError;
            const normalizedBlob = await normalizePdf({ entry, blob, name, error: firstError });
            if (!normalizedBlob) throw firstError;
            await copyPdfBlobIntoDocument(outputPdf, normalizedBlob, name);
          }
        }
      } else {
        const standalonePdf = await browserEntryToStandalonePdf(entry);
        await copyPdfBlobIntoDocument(outputPdf, standalonePdf, name);
      }
    } catch (error) {
      console.warn("Failed to add course-file entry", name, error);
      throw new Error(`Could not add "${name}" to the combined course file. ${error?.message || "PDF merge failed."}`);
    }
  }

  if (outputPdf.getPageCount() === 0) {
    const fallbackDoc = new jsPDF({ unit: "mm", format: "a4" });
    fallbackDoc.setFontSize(14);
    fallbackDoc.text("No completed course-file documents were selected.", 15, 25);
    await copyPdfBlobIntoDocument(outputPdf, fallbackDoc.output("blob"), "Course File");
  }

  const mergedBytes = await outputPdf.save({
    useObjectStreams: false,
    addDefaultPage: false,
  });
  return new Blob([mergedBytes], { type: "application/pdf" });
}

export async function buildCourseFileZip(entries = [], folderResolver = null) {
  const zip = new JSZip();
  for (const entry of entries) {
    if (!entry?.blob || entry?.zipInclude === false) continue;
    const folder = folderResolver ? folderResolver(entry) : (entry.folder || "Course File");
    zip.folder(safeFileName(folder || "Course File")).file(safeFileName(entry.name || "document"), entry.blob);
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export function getSelectedCandidate(state, suggestion, band) {
  const override = (state?.config?.selections || []).find((row) => row.scopeKey === suggestion.scopeKey && row.band === band);
  const candidates = suggestion?.bands?.[band] || [];
  if (override) {
    const found = candidates.find((candidate) => String(candidate.studentId) === String(override.studentId));
    if (found) return found;
  }
  return candidates[0] || null;
}

export { BAND_LABEL, safeFileName };
