import * as XLSX from "xlsx-js-style";

const FONT = "Times New Roman";

const COLORS = {
  peach: "FCE4D6",
  gray: "D9D9D9",
  po: "DDD9C4",
  blue: "0000FF",
  red: "FF0000",
  green: "00B050",
  purple: "7030A0",
  black: "000000",
  separator: "C5E0B4",
};

const thinBorder = {
  top: { style: "thin", color: { rgb: COLORS.black } },
  bottom: { style: "thin", color: { rgb: COLORS.black } },
  left: { style: "thin", color: { rgb: COLORS.black } },
  right: { style: "thin", color: { rgb: COLORS.black } },
};

const mediumBorder = {
  top: { style: "medium", color: { rgb: COLORS.black } },
  bottom: { style: "medium", color: { rgb: COLORS.black } },
  left: { style: "medium", color: { rgb: COLORS.black } },
  right: { style: "medium", color: { rgb: COLORS.black } },
};

const noBorder = {
  top: { style: "none" },
  bottom: { style: "none" },
  left: { style: "none" },
  right: { style: "none" },
};

const style = ({
  bold = false,
  size = 9,
  color = COLORS.black,
  fill,
  center = true,
  wrap = true,
  rotate = 0,
  border = thinBorder,
} = {}) => ({
  font: { name: FONT, sz: size, bold, color: { rgb: color } },
  alignment: {
    horizontal: center ? "center" : "left",
    vertical: "center",
    wrapText: wrap,
    textRotation: rotate,
  },
  border,
  ...(fill ? { fill: { fgColor: { rgb: fill } } } : {}),
});

const sTitle = style({ bold: true, size: 14, border: noBorder });
const sUni = style({ size: 13, border: noBorder });
const sSheetTitle = style({ bold: true, size: 12, border: noBorder });
const sBlue = style({ bold: true, color: COLORS.blue, size: 10, border: noBorder });
const sRightRedTitle = style({ bold: true, color: COLORS.red, size: 10, border: noBorder });
const sRightRedSub = style({ color: COLORS.red, size: 9, border: noBorder });
const sHeader = style({ bold: true, size: 9 });
const sRed = style({ bold: true, color: COLORS.red, size: 9 });
const sPeach = style({ fill: COLORS.peach, size: 9 });
const sPeachBold = style({ bold: true, fill: COLORS.peach, size: 9 });
const sPeachBlue = style({ bold: true, fill: COLORS.peach, color: COLORS.blue, size: 9 });
const sGray = style({ fill: COLORS.gray, size: 9 });
const sPo = style({ fill: COLORS.po, bold: true, size: 9 });
const sBody = style({ size: 9 });
const sGreenName = style({ size: 9, center: false, color: COLORS.green });
const sPurpleName = style({ size: 9, center: false, color: COLORS.purple });
const sTotal = style({ fill: COLORS.peach, color: COLORS.blue, bold: true, size: 9 });
const sFooter = style({ fill: COLORS.peach, bold: true, size: 10 });
const sFooterYes = style({ fill: COLORS.peach, bold: true, color: COLORS.blue, size: 10 });
const sFooterNo = style({ fill: COLORS.peach, bold: true, color: COLORS.red, size: 10 });
const sRotate = style({ bold: true, rotate: 90, size: 9 });
const sTeacherBox = style({ bold: true, size: 10, border: mediumBorder });
const sSeparator = style({ fill: COLORS.separator, border: noBorder });

const n = (v) => Number(v || 0);
const r2 = (v) => Math.round(n(v) * 100) / 100;
const safe = (v, fb = "") => (v === undefined || v === null || v === "" ? fb : v);

const gradeOrder = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "D", "F"];

const getGrade = (mark) => {
  const x = n(mark);
  if (x >= 80) return "A+";
  if (x >= 75) return "A";
  if (x >= 70) return "A-";
  if (x >= 65) return "B+";
  if (x >= 60) return "B";
  if (x >= 55) return "B-";
  if (x >= 50) return "C+";
  if (x >= 45) return "C";
  if (x >= 40) return "D";
  return "F";
};

const setCell = (ws, r, c, v = "", st = sBody) => {
  const ref = XLSX.utils.encode_cell({ r, c });
  ws[ref] = {
    v,
    t: typeof v === "number" ? "n" : "s",
    s: st,
  };
};

const styleRange = (ws, r1, c1, r2, c2, st) => {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { v: "", t: "s" };
      ws[ref].s = st;
    }
  }
};

const merge = (ws, r1, c1, r2, c2) => {
  if (r1 === r2 && c1 === c2) return;
  ws["!merges"] = ws["!merges"] || [];
  ws["!merges"].push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
};

const mergeStyled = (ws, r1, c1, r2, c2, value, st) => {
  styleRange(ws, r1, c1, r2, c2, st);
  merge(ws, r1, c1, r2, c2);
  setCell(ws, r1, c1, value, st);
};

const getStudentKeys = (st) =>
  [st?._id, st?.id, st?.student, st?.studentId, st?.roll].filter(Boolean).map(String);

const buildMarkMap = (marks = []) => {
  const map = new Map();

  marks.forEach((m) => {
    const studentKeys = [
      m.student,
      m.studentId,
      m.student?._id,
      m.student?.id,
      m.student?.studentId,
      m.student?.roll,
    ].filter(Boolean).map(String);

    const blueprintKeys = [
      m.blueprint,
      m.blueprintId,
      m.blueprint?._id,
      m.blueprint?.id,
    ].filter(Boolean).map(String);

    const entries = {};
    (m.entries || []).forEach((e) => {
      const key = e.itemKey || e.key || e.label || e.name || e._id || e.id;
      entries[key] = n(e.obtainedMarks ?? e.marks ?? e.value);
    });

    studentKeys.forEach((sk) => {
      blueprintKeys.forEach((bk) => map.set(`${sk}__${bk}`, entries));
    });
  });

  return map;
};

const findEntries = (marksMap, st, bp) => {
  const studentKeys = getStudentKeys(st);
  const blueprintKeys = [bp?._id, bp?.id].filter(Boolean).map(String);

  for (const sk of studentKeys) {
    for (const bk of blueprintKeys) {
      const found = marksMap.get(`${sk}__${bk}`);
      if (found) return found;
    }
  }
  return {};
};

const getEntryValue = (entries, item) => {
  const keys = [item?.key, item?.itemKey, item?.label, item?.name, item?._id, item?.id].filter(Boolean);
  for (const k of keys) {
    if (entries[k] !== undefined) return n(entries[k]);
  }
  return 0;
};

const getBpType = (bp) =>
  String(bp.assessmentType || bp.type || bp.category || "").toLowerCase();

const getBpName = (bp) =>
  safe(bp.assessmentName || bp.name || bp.title, "Assessment");

const sortBlueprints = (blueprints = []) => {
  const order = {
    ct: 1,
    class_test: 1,
    quiz: 1,
    mid: 2,
    midterm: 2,
    final: 3,
    assignment: 4,
    presentation: 5,
    attendance: 6,
  };

  return [...blueprints].sort((a, b) => {
    const oa = order[getBpType(a)] || 99;
    const ob = order[getBpType(b)] || 99;
    if (oa !== ob) return oa - ob;
    return n(a.order ?? a.displayOrder) - n(b.order ?? b.displayOrder);
  });
};

const buildGradeBlocks = (blueprints = []) => {
  const sorted = sortBlueprints(blueprints);

  const isCt = (b) => ["ct", "class_test", "quiz"].includes(getBpType(b));
  const isMid = (b) => ["mid", "midterm"].includes(getBpType(b));
  const isFinal = (b) => getBpType(b) === "final";
  const isAp = (b) => ["assignment", "presentation"].includes(getBpType(b));

  const blocks = [];

const ctBps = sorted.filter(isCt);

if (ctBps.length) {
  const coItems = [];
  const ctItems = [];

  ctBps.forEach((bp, bpIndex) => {
    const bpItems = bp.items || [];

    bpItems.forEach((it) => {
      coItems.push({
        bp,
        item: it,
        type: "co",
        coCode: safe(it.coCode || it.co || it.courseOutcome, ""),
        label: "",
        marks: n(it.marks ?? it.maxMarks),
      });
    });

    ctItems.push({
      bp,
      itemList: bpItems,
      type: "ct",
      coCode: `CT${bpIndex + 1}`,
      label: `CT${bpIndex + 1}`,
      marks: n(bp.totalMarks ?? bp.marks),
    });
  });

  blocks.push({
    kind: "ct",
    title: "CLASS TEST",
    totalLabel: "CT",
    subLabel: "Total CT",
    totalSubLabel: "Total CT",
    totalMarks: 15,
    coColumnCount: coItems.length,
    ctColumnCount: ctItems.length,
    items: [...coItems, ...ctItems],
  });
}
  const midBp = sorted.find(isMid);
  if (midBp) {
    blocks.push({
      kind: "normal",
      title: "MID TERM",
      totalLabel: "MT",
      subLabel: "All the Questions",
      totalSubLabel: "",
      totalMarks: n(midBp.totalMarks ?? midBp.marks),
      items: (midBp.items || []).map((it) => ({
        bp: midBp,
        item: it,
        coCode: safe(it.coCode || it.co || it.courseOutcome, ""),
        label: "",
        marks: n(it.marks ?? it.maxMarks),
      })),
    });
  }

  const finalBp = sorted.find(isFinal);
  if (finalBp) {
    blocks.push({
      kind: "normal",
      title: "FINAL EXAM",
      totalLabel: "FE",
      subLabel: "All the Questions",
      totalSubLabel: "",
      totalMarks: n(finalBp.totalMarks ?? finalBp.marks),
      items: (finalBp.items || []).map((it) => ({
        bp: finalBp,
        item: it,
        coCode: safe(it.coCode || it.co || it.courseOutcome, ""),
        label: "",
        marks: n(it.marks ?? it.maxMarks),
      })),
    });
  }

  const apBps = sorted.filter(isAp);
  if (apBps.length) {
    const items = [];
    apBps.forEach((bp, i) => {
      const list = bp.items?.length
        ? bp.items
        : [{ key: "default", label: getBpName(bp), marks: bp.totalMarks }];

      list.forEach((it) => {
        items.push({
          bp,
          item: it,
          coCode: safe(it.coCode || it.co || it.courseOutcome, ""),
          label: safe(it.label || it.name || `AP${i + 1}`),
          marks: n(it.marks ?? it.maxMarks ?? bp.totalMarks),
        });
      });
    });

    blocks.push({
      kind: "ap",
      title: "Assign+Pres (AP)",
      totalLabel: "AP",
      subLabel: "",
      totalSubLabel: "",
      totalMarks: apBps.reduce((s, bp) => s + n(bp.totalMarks ?? bp.marks), 0),
      items,
    });
  }

  return blocks;
};

const getCos = (payload, blocks) => {
  if (payload.output?.coAttainment?.length) return payload.output.coAttainment;

  const fromSetup = payload.setup?.cos || payload.setup?.courseOutcomes || [];
  if (fromSetup.length) {
    return fromSetup.map((co, i) => ({
      code: safe(co.code || co.coCode || `CO${i + 1}`),
      maxMarks: n(co.maxMarks),
      attainmentPercent: n(co.attainmentPercent),
    }));
  }

  const unique = [];
  blocks.forEach((b) => {
    b.items.forEach((it) => {
      if (it.coCode && !unique.includes(it.coCode)) unique.push(it.coCode);
    });
  });

  return unique.map((code) => ({ code, maxMarks: 0, attainmentPercent: 0 }));
};

const getPos = (payload) => {
  if (payload.output?.poAttainment?.length) return payload.output.poAttainment;

  const fromSetup = payload.setup?.pos || payload.setup?.programOutcomes || [];
  if (fromSetup.length) {
    return fromSetup.map((po, i) => ({
      code: safe(po.code || po.poCode || `PO${i + 1}`),
      attainmentPercent: n(po.attainmentPercent),
    }));
  }

  const mappings = payload.setup?.mappings || [];
  const unique = [];
  mappings.forEach((m) => {
    const code = m.targetType === "PO" ? m.targetCode : m.poCode;
    if (code && !unique.includes(code)) unique.push(code);
  });

  return unique.map((code) => ({ code, attainmentPercent: 0 }));
};

const calculateCoRowsFromMarks = (student, coList, blocks, marksMap) => {
  return coList.map((co) => {
    let obtained = 0;
    let max = 0;

    blocks.forEach((block) => {
      block.items.forEach((it) => {
        if (it.coCode === co.code) {
          const entries = findEntries(marksMap, student, it.bp);
          obtained += getEntryValue(entries, it.item);
          max += n(it.marks);
        }
      });
    });

    const percent = max > 0 ? (obtained / max) * 100 : 0;

    return {
      code: co.code,
      obtainedMarks: r2(obtained),
      maxMarks: r2(max || co.maxMarks),
      percent: r2(percent),
      achieved: percent >= 40,
    };
  });
};

const makeNameStyle = (i) => (i % 12 === 0 ? sPurpleName : sGreenName);

export const exportObeWorkbook = (payload, fileName = "CO-PO_Assessment.xlsx") => {
  const wb = XLSX.utils.book_new();
  const ws = { "!merges": [] };

  const course = payload.course || {};
  const setup = payload.setup || {};
  const output = payload.output || {};
  const students = output.students?.length ? output.students : payload.students || [];
  const blueprints = payload.blueprints || output.blueprints || [];
  const blocks = buildGradeBlocks(blueprints);
  const marksMap = buildMarkMap(payload.marks || []);
  const coList = getCos(payload, blocks);
  const poList = getPos(payload);
  const mappings = setup.mappings || [];
  const threshold = n(output.thresholdPercent || setup.thresholdPercent || 40);

  const department = safe(course.department || setup.department, "Department of Computer Science and Engineering");
  const teacherName = safe(payload.teacherName || payload.teacher?.name || course.teacherName || course.teacher?.name, "-");

  const dataStart = 8;

  let leftCol = 0;
  const studentIdCol = leftCol++;
  const studentNameCol = leftCol++;

  const blockPositions = [];

  blocks.forEach((block) => {
    const start = leftCol;
    const itemStart = leftCol;
    leftCol += block.items.length;
    const totalCol = leftCol++;
    blockPositions.push({ ...block, start, itemStart, totalCol, end: totalCol });
  });

  const attendanceCol = leftCol++;
  const totalCol = leftCol++;
  const gradeCol = leftCol++;
  const leftEnd = gradeCol;

  const gapCol = leftEnd + 1;
  const rightStart = gapCol + 1;

  const rightStudentIdCol = rightStart;
  const rightStudentNameCol = rightStart + 1;

  const coObtStart = rightStart + 2;
  const coPercentStart = coObtStart + coList.length;
  const coAchStart = coPercentStart + coList.length;
  const poAchStart = coAchStart + coList.length;
  const rightEnd = poAchStart + poList.length - 1;

  const totalRow = dataStart + students.length;
  const overallRow = totalRow + 1;

  const teacherTop = totalRow + 4;
  const teacherBottom = teacherTop + 2;

  const cohortTop = overallRow + 3;

  const lastRow = Math.max(teacherBottom, cohortTop + 1);
  const lastCol = Math.max(leftEnd, rightEnd);

  mergeStyled(ws, 0, 0, 0, leftEnd, department, sTitle);
  mergeStyled(ws, 1, 0, 1, leftEnd, "Bangladesh University of Business and Technology", sUni);
  mergeStyled(ws, 2, 0, 2, leftEnd, `GRADE SHEET [${safe(course.semester, "-")} ${safe(course.year, "-")}]`, sSheetTitle);

  mergeStyled(ws, 3, 0, 3, Math.floor(leftEnd / 2), `Course Code: ${safe(course.code, "-")} (${safe(course.section, "-")})`, sBlue);
  mergeStyled(ws, 3, Math.floor(leftEnd / 2) + 1, 3, leftEnd, `Course Title: ${safe(course.title, "-")}`, sBlue);

  mergeStyled(ws, 4, studentIdCol, 6, studentIdCol, "Student ID", sHeader);
  mergeStyled(ws, 4, studentNameCol, 6, studentNameCol, "Student Name", sHeader);

  blockPositions.forEach((block) => {
    mergeStyled(ws, 4, block.start, 4, block.end, block.title, sHeader);

    block.items.forEach((it, i) => {
      setCell(ws, 5, block.itemStart + i, it.coCode, sRed);

      if (block.kind === "ct") {
        setCell(ws, 6, block.itemStart + i, it.label, sBody);
      } else if (block.kind === "normal") {
        setCell(ws, 6, block.itemStart + i, "", sBody);
      } else {
        setCell(ws, 6, block.itemStart + i, it.label, sBody);
      }

      setCell(ws, 7, block.itemStart + i, r2(it.marks), sRed);
    });

    setCell(ws, 5, block.totalCol, block.totalLabel, sPeachBlue);
    setCell(ws, 6, block.totalCol, block.totalSubLabel || block.subLabel || "", sBody);
    setCell(ws, 7, block.totalCol, r2(block.totalMarks), sPeachBlue);

    if (block.kind === "normal") {
      mergeStyled(ws, 6, block.itemStart, 6, block.totalCol - 1, "All the Questions", sBody);
    }

if (block.kind === "ct") {
  const coStart = block.itemStart;
  const coEnd = block.itemStart + block.coColumnCount - 1;

  const ctStart = coEnd + 1;
  const ctEnd = block.totalCol - 1;

  if (block.coColumnCount > 0) {
    mergeStyled(ws, 6, coStart, 6, coEnd, "CT1+CT2", sBody);
  }

  if (block.ctColumnCount > 0) {
    mergeStyled(ws, 6, ctStart, 6, ctEnd, "Total CT", sBody);
  }

  setCell(ws, 6, block.totalCol, "", sBody);
}
  });

  mergeStyled(ws, 4, attendanceCol, 6, attendanceCol, "Attendance", sRotate);
  setCell(ws, 7, attendanceCol, 5, sPeachBlue);

  mergeStyled(ws, 4, totalCol, 6, totalCol, "Total", sPeachBlue);
  setCell(ws, 7, totalCol, 100, sPeachBlue);

  mergeStyled(ws, 4, gradeCol, 6, gradeCol, "Letter\nGrade", sHeader);

  mergeStyled(ws, 0, rightStart, 0, rightEnd, department, sRightRedTitle);
  mergeStyled(ws, 1, rightStart, 1, rightEnd, "Bangladesh University of Business and Technology", sRightRedSub);
  mergeStyled(ws, 2, rightStart, 2, rightEnd, `CO Achievement  [${safe(course.semester, "-")} ${safe(course.year, "-")}]`, sRightRedTitle);

  mergeStyled(ws, 3, rightStart, 3, rightStart + Math.floor((rightEnd - rightStart) / 2), `Course Code: ${safe(course.code, "-")} (${safe(course.section, "-")})`, sBlue);
  mergeStyled(ws, 3, rightStart + Math.floor((rightEnd - rightStart) / 2) + 1, 3, rightEnd, `Course Title: ${safe(course.title, "-")}`, sBlue);

  mergeStyled(ws, 4, rightStudentIdCol, 6, rightStudentIdCol, "Student ID", sHeader);
  mergeStyled(ws, 4, rightStudentNameCol, 6, rightStudentNameCol, "Student Name", sHeader);

  mergeStyled(ws, 4, coObtStart, 4, coObtStart + coList.length - 1, "CO Marks Obtained", sHeader);
  mergeStyled(ws, 4, coPercentStart, 4, coPercentStart + coList.length - 1, "CO Marks [%]", sHeader);
  mergeStyled(ws, 4, coAchStart, 4, coAchStart + coList.length - 1, `CO Achievement (>=${threshold}%)`, sHeader);
  mergeStyled(ws, 4, poAchStart, 4, poAchStart + poList.length - 1, `PO Achievement (>=${threshold}%)`, sHeader);

  coList.forEach((co, i) => {
    setCell(ws, 5, coObtStart + i, co.code, sPeachBold);
    setCell(ws, 6, coObtStart + i, r2(co.maxMarks), sRed);

    setCell(ws, 5, coPercentStart + i, co.code, sPeachBold);
    setCell(ws, 6, coPercentStart + i, "%", sRed);

    setCell(ws, 5, coAchStart + i, co.code, sPeachBold);
    setCell(ws, 6, coAchStart + i, "", sPeachBold);
  });

  poList.forEach((po, i) => {
    setCell(ws, 5, poAchStart + i, po.code, sPeachBold);
    setCell(ws, 6, poAchStart + i, "", sPeachBold);
  });

  students.forEach((student, i) => {
    const row = dataStart + i;
    const id = safe(student.roll || student.studentId || student.id, "-");
    const name = safe(student.name, "-");

    setCell(ws, row, studentIdCol, id, sBody);
    setCell(ws, row, studentNameCol, name, makeNameStyle(i));

    let computedTotal = 0;

    blockPositions.forEach((block) => {
      let blockTotal = 0;

block.items.forEach((it, j) => {
  const entries = findEntries(marksMap, student, it.bp);

  let val = 0;

if (block.kind === "ct" && it.type === "ct") {
  (it.itemList || []).forEach((ctItem) => {
    val += getEntryValue(entries, ctItem);
  });
} else {
  val = getEntryValue(entries, it.item);
}

  blockTotal += val;
  setCell(ws, row, block.itemStart + j, val || "", sBody);
});

      computedTotal += blockTotal;
      setCell(ws, row, block.totalCol, r2(blockTotal), sPeach);
    });

    const attendance = n(student.attendanceMarks ?? student.attendance ?? 0);
    computedTotal += attendance;

    const total = r2(student.scaledTotal ?? student.totalPercent ?? student.courseObtained ?? student.total ?? computedTotal);

    setCell(ws, row, attendanceCol, attendance || "", sBody);
    setCell(ws, row, totalCol, total, sTotal);
    setCell(ws, row, gradeCol, safe(student.grade, getGrade(total)), sBody);

    setCell(ws, row, rightStudentIdCol, id, sBody);
    setCell(ws, row, rightStudentNameCol, name, makeNameStyle(i));

    const studentCoRows = student.coRows?.length
      ? student.coRows
      : calculateCoRowsFromMarks(student, coList, blockPositions, marksMap);

    coList.forEach((co, j) => {
      const cr = studentCoRows.find((x) => x.code === co.code) || {};
      setCell(ws, row, coObtStart + j, r2(cr.obtainedMarks), sGray);
      setCell(ws, row, coPercentStart + j, r2(cr.percent), sGray);
      setCell(ws, row, coAchStart + j, cr.achieved ? "Y" : "N", sGray);
    });

    poList.forEach((po, j) => {
      const related = mappings.filter(
        (m) => (m.targetType === "PO" && m.targetCode === po.code) || m.poCode === po.code
      );

      const vals = related.map((m) => {
        const code = m.coCode || m.sourceCode;
        const cr = studentCoRows.find((x) => x.code === code);
        return n(cr?.percent);
      });

      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      setCell(ws, row, poAchStart + j, avg >= threshold ? "Y" : "N", sPo);
    });
  });

  mergeStyled(ws, totalRow, rightStudentIdCol, totalRow, coPercentStart - 1, "Total Number of Students", sFooter);
  setCell(ws, totalRow, coPercentStart, students.length, sFooter);

  mergeStyled(ws, overallRow, rightStudentIdCol, overallRow, coPercentStart - 1, "Overall CO - PO Achievements (%)", sFooter);

  coList.forEach((co, i) => {
    const yesNo = n(co.attainmentPercent) >= threshold ? "YES" : "NO";
    setCell(ws, totalRow, coAchStart + i, yesNo, yesNo === "YES" ? sFooterYes : sFooterNo);
    setCell(ws, overallRow, coAchStart + i, r2(co.attainmentPercent), yesNo === "YES" ? sFooterYes : sFooterNo);
  });

  poList.forEach((po, i) => {
    const yesNo = n(po.attainmentPercent) >= threshold ? "YES" : "NO";
    setCell(ws, totalRow, poAchStart + i, yesNo, yesNo === "YES" ? sFooterYes : sFooterNo);
    setCell(ws, overallRow, poAchStart + i, r2(po.attainmentPercent), yesNo === "YES" ? sFooterYes : sFooterNo);
  });

  const teacherStart = Math.max(2, Math.floor(leftEnd / 3));
  const teacherEnd = Math.min(leftEnd - 2, teacherStart + 10);
  mergeStyled(ws, teacherTop, teacherStart, teacherBottom, teacherEnd, `Course Teacher: ${teacherName}`, sTeacherBox);

  const cohortStart = Math.max(poAchStart, rightEnd - 5);
  mergeStyled(ws, cohortTop, cohortStart, cohortTop + 1, rightEnd, `(Cohort Achievement => ${threshold}%)`, sHeader);

  for (let r = 0; r <= overallRow; r++) {
    setCell(ws, r, gapCol, "", sSeparator);
  }

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: lastRow, c: lastCol },
  });

  ws["!cols"] = Array.from({ length: lastCol + 1 }, (_, c) => {
    if (c === gapCol) return { wch: 2 };
    if (c === studentIdCol || c === rightStudentIdCol) return { wch: 14 };
    if (c === studentNameCol || c === rightStudentNameCol) return { wch: 22 };
    if (c === attendanceCol) return { wch: 5 };
    if (c === totalCol || c === gradeCol) return { wch: 7 };
    return { wch: 7 };
  });

  ws["!rows"] = Array.from({ length: lastRow + 1 }, (_, r) => {
    if (r === 0) return { hpt: 21 };
    if (r === 1) return { hpt: 20 };
    if (r === 2) return { hpt: 19 };
    if (r >= 4 && r <= 7) return { hpt: 22 };
    return { hpt: 18 };
  });

  ws["!pageSetup"] = {
    orientation: "landscape",
    fitToWidth: 1,
    fitToHeight: 1,
    paperSize: 9,
  };

  XLSX.utils.book_append_sheet(wb, ws, "Grade_OBE");

  const ws2 = { "!merges": [] };

  mergeStyled(ws2, 0, 0, 0, 2, "Grade Distribution", sTitle);
  setCell(ws2, 2, 0, "Grade", sPeachBold);
  setCell(ws2, 2, 1, "Count", sPeachBold);

  const gradeCount = Object.fromEntries(gradeOrder.map((g) => [g, 0]));

  students.forEach((student) => {
    const total = r2(student.scaledTotal ?? student.totalPercent ?? student.courseObtained ?? student.total ?? 0);
    const grade = safe(student.grade, getGrade(total));
    if (gradeCount[grade] !== undefined) gradeCount[grade]++;
  });

  gradeOrder.forEach((g, i) => {
    setCell(ws2, 3 + i, 0, g, sBody);
    setCell(ws2, 3 + i, 1, gradeCount[g], sBody);
  });

  setCell(ws2, 14, 0, "Total Students", sPeachBold);
  setCell(ws2, 14, 1, students.length, sPeachBold);

  ws2["!ref"] = "A1:C15";
  ws2["!cols"] = [{ wch: 18 }, { wch: 15 }, { wch: 10 }];

  XLSX.utils.book_append_sheet(wb, ws2, "Grade Distribution");

  XLSX.writeFile(
    wb,
    fileName ||
      `CO-PO_Assessment_${safe(course.code, "Course")}_${safe(course.section, "-")}_${safe(course.semester, "-")}_${safe(course.year, "-")}.xlsx`
  );
};