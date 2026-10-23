/**
 * BUBT faculty examination schedule reader.
 * PDF text layer first; Tesseract OCR is used for image-only pages. No original
 * PDF is uploaded: only recognized, reviewable rows are sent to the backend.
 * Supports Day / BBA / Evening / MBA-EMBA sample layouts (including rotated
 * date/time labels, merged program blocks and multi-room continuations).
 */
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createWorker } from 'tesseract.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const modes = {
  day: { columns: [88, 128, 187, 230, 266, 339, 405, 495], program: 'Day' },
  bba: { columns: [112, 149, 197, 236, 269, 331, 385, 470], program: 'BBA' },
  evening: { columns: [111, 159, 227, 280, 321, 376, 436, 519], program: 'Evening' },
  mba: { columns: [125, 194, 194, 266, 305, 368, 422, 498], program: 'MBA & EMBA' },
};
const fields = ['date','time','program','intake','section','course','courseTeacher','invigilators','room'];

function asISO(text) {
  const m = clean(text).match(/\b(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(20\d{2}|\d{2})\b/);
  if (!m) return '';
  const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  const date = new Date(Date.UTC(year, +m[2] - 1, +m[1]));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== +m[2] - 1 || date.getUTCDate() !== +m[1]) return '';
  return `${year}-${String(+m[2]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`;
}
function dayOf(iso) { return iso ? DAY_NAMES[new Date(`${iso}T00:00:00Z`).getUTCDay()] : ''; }
function columnOf(x, mode) {
  const boundaries = modes[mode].columns;
  const index = boundaries.findIndex(limit => x < limit);
  return fields[index < 0 ? fields.length - 1 : index];
}
function detectMode(filename, rawText) {
  const text = `${filename} ${rawText}`.toLowerCase();
  if (/mba\s*&\s*emba|emba program/.test(text)) return 'mba';
  if (/bba program|\bbba\s*\(faculty\)/.test(text)) return 'bba';
  if (/evening program|evening\s*\(faculty\)/.test(text)) return 'evening';
  return 'day';
}
function collectLines(words, mode) {
  const groups = [];
  // Text-layer items can be whole cells, OCR gives individual words.
  for (const word of [...words].filter(w => w.y > 197).sort((a,b) => a.y - b.y || a.x - b.x)) {
    let group = groups.find(g => Math.abs(g.y - word.y) <= 4.1);
    if (!group) { group = { y: word.y, words: [] }; groups.push(group); }
    group.words.push(word);
    group.y = group.words.reduce((s,w) => s+w.y, 0)/group.words.length;
  }
  return groups.sort((a,b) => a.y-b.y).map(g => {
    const cells = {};
    for (const w of g.words.sort((a,b)=>a.x-b.x)) {
      const key = columnOf(w.x, mode);
      cells[key] = clean(`${cells[key] || ''} ${w.text}`);
    }
    return { y: g.y, cells };
  });
}
function timeRange(rawText, mode, pageIndex, groupProgram = '') {
  if (mode === 'evening' && /M\.\s*Sc\.?\s*in\s*Eco/i.test(groupProgram)) return ['7:00 PM','8:00 PM'];
  const tokens = [...rawText.matchAll(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/gi)].map(m => `${Number(m[1])}:${m[2]} ${m[3].toUpperCase()}`);
  // Page-specific labels may occur multiple times; choose the first complete interval.
  if (tokens.length >= 2) return [tokens[0], tokens[1]];
  if (mode === 'evening') return groupProgram === 'M.Sc. in Eco.' || /M\.\s*Sc\.\s*in\s*Eco/i.test(groupProgram) ? ['7:00 PM','8:00 PM'] : ['7:00 PM','8:30 PM'];
  if (mode === 'mba') return ['7:00 PM','8:00 PM'];
  // Standard BUBT tri-semester three-slot pattern, only when PDF labels unreadable.
  return [['10:00 AM','11:30 AM'], ['12:00 PM','1:30 PM'], ['3:00 PM','4:30 PM']][pageIndex % 3];
}
function extractDateMarkers(words, mode, height) {
  const maxX = mode === 'evening' || mode === 'mba' ? 125 : 115;
  const matches = words.filter(w => w.x < maxX && w.y > 199 && w.y < height-80).map(w => ({ ...w, date: asISO(w.text) })).filter(w => w.date);
  // For a rotated label the baseline can be above/below its visual centre;
  // markers only determine the relative vertical ordering, not a row position.
  return matches.sort((a,b)=>a.y-b.y);
}
function programMarkers(lines, mode) {
  if (mode === 'bba') return [{ y: 400, name: 'BBA' }];
  if (mode === 'mba') return [{ y: 400, name: 'MBA & EMBA' }];
  const candidates = lines.filter(l => l.cells.program && /(?:B\.Sc|B\.A|M\.Sc|MA\s+in|Engineering|Textile|Economics|English|CSE|EEE|Civil|ELT|DSE)/i.test(l.cells.program));
  const groups = [];
  for (const line of candidates) {
    const previous = groups.at(-1);
    const isNewLabel = /^(?:B\.\s*Sc\.|B\.\s*A\.|M\.\s*Sc\.?|MA\s+in)/i.test(clean(line.cells.program));
    if (previous && !isNewLabel && line.y - previous.lastY <= 31) {
      previous.parts.push(line.cells.program); previous.lastY = line.y; previous.ys.push(line.y);
    } else groups.push({ parts: [line.cells.program], ys: [line.y], lastY: line.y });
  }
  return groups.map(g => ({ name: clean(g.parts.join(' ')), y: g.ys.reduce((a,b)=>a+b,0)/g.ys.length }));
}
function closestProgram(y, markers, mode) {
  const marker = markers.reduce((best, value) => !best || Math.abs(y-value.y) < Math.abs(y-best.y) ? value : best, null);
  let name = marker?.name || modes[mode].program;
  name = name.replace(/B\.Sc\.\s*in\s*Civil\s*Engg\.?/i, 'B.Sc. in Civil Engineering').replace(/\s+/g,' ').trim();
  return name;
}
function assignedDate(y, markers) {
  if (!markers.length) return '';
  // Multi-date MBA pages use vertically stacked, separately dated blocks.
  // Each date is printed within the corresponding block, which typically
  // begins some distance before the rotated date word's centre.
  return markers.reduce((best, v) => Math.abs(y-v.y) < Math.abs(y-best.y) ? v : best, markers[0]).date;
}
function startRow(cell) {
  const value = clean(cell).replace(/\s*\/\s*/g, '/');
  // Course codes: MAT 103, CSE 207, CE 2231, MCSE 5248, ECO 5105/507.
  return /\b[A-Z]{2,6}\s*\d{2,5}[A-Z]?\b/i.test(value);
}
function normalizeCodes(s) { return clean(s).replace(/\s*,\s*/g, ', ').replace(/\s*&\s*/g, ' & '); }
function trueCodes(s) { return normalizeCodes(s).replace(/[-–—]{2,}/g,'').replace(/^[,\s]+|[,\s]+$/g, '').trim(); }
function extractRows(words, filename, pageIndex, mode, fullText, height) {
  const lines = collectLines(words, mode);
  const dateMarkers = extractDateMarkers(words, mode, height);
  const sourceDate = ''; // Never substitute the document issue date for a missing exam date.
  const programs = programMarkers(lines, mode);
  const main = lines.filter(l => l.y < height-51 && l.y > 211);
  const rows = [];
  const sourceAnchors = new Map();
  let current = null;
  let lastMainY = -100;
  let lastGroupProgram = '';
  for (const line of main) {
    const cells = line.cells;
    const isCourse = startRow(cells.course);
    const isReserved = /R\s*E\s*S\s*E\s*R\s*V\s*E\s*D/i.test(Object.values(cells).join(' ')) && !isCourse;
    const isSupport = /IT\s*SUPPORT/i.test(Object.values(cells).join(' ')) && !isCourse;
    if (isCourse && current && current.category === 'exam' &&
        /\/$/.test(current.course) && line.y - lastMainY < 22 &&
        (!cells.intake || /^[-–]+$/.test(cells.intake)) &&
        (!cells.section || /^[-–]+$/.test(cells.section)) &&
        (!current.room || !cells.room || current.room === cells.room)) {
      // A combined-course exam can wrap the second course code onto a new
      // visual line with blank Intake/Sec; it is ONE invigilation assignment.
      current.course = clean(`${current.course}${clean(cells.course)}`);
      if (cells.invigilators) current.invigilators = trueCodes(`${current.invigilators} ${cells.invigilators}`);
      if (cells.room) current.room = clean(cells.room);
      lastMainY = line.y;
      continue;
    }
    if (isCourse || isReserved || isSupport) {
      const program = isReserved ? 'Reserved' : isSupport ? 'IT Support' : closestProgram(line.y, programs, mode);
      const date = assignedDate(line.y, dateMarkers) || sourceDate;
      const [startTime, endTime] = timeRange(fullText, mode, pageIndex, program);
      current = {
        date, day: dayOf(date), startTime, endTime, time: `${startTime} – ${endTime}`,
        program, intake: isCourse ? clean(cells.intake) : '', section: isCourse ? clean(cells.section) : '', course: isReserved ? 'RESERVED' : isSupport ? 'IT SUPPORT' : clean(cells.course),
        courseTeacher: isCourse ? clean(cells.courseTeacher) : '', invigilators: trueCodes(cells.invigilators), room: clean(cells.room),
        category: isReserved ? 'reserved' : isSupport ? 'support' : 'exam', sourceFile: filename, sourcePage: pageIndex+1,
      };
      rows.push(current);
      sourceAnchors.set(current, line.y);
      lastMainY = line.y;
      lastGroupProgram = program;
      continue;
    }
    // Continuation lines in invigilator/room columns belong to the previous
    // course row, including BBA's second room in a shared multi-room exam.
    if (current && line.y-lastMainY < 40 && line.y >= lastMainY-1) {
      if (cells.invigilators && /^[A-Z0-9,.;:&\/\s\-]+$/.test(cells.invigilators) && !/^(to|am|pm)$/i.test(cells.invigilators)) current.invigilators = trueCodes(`${current.invigilators}, ${cells.invigilators}`);
      if (cells.room && /\d{3,4}/.test(cells.room)) current.room = clean(`${current.room} ${cells.room}`);
      if (cells.course && !startRow(cells.course) && /\d{2,5}/.test(cells.course)) current.course = clean(`${current.course} ${cells.course}`);
    }
  }
  // RESERVED and IT SUPPORT labels are horizontally merged cells. Their
  // invigilator names can sit *above* the label baseline and wrap onto two
  // lines, so appending only subsequent lines silently drops the first half.
  // Resolve the entire column within each labelled block geometrically.
  for (const row of rows.filter(r => r.category !== 'exam')) {
    const anchorY = sourceAnchors.get(row);
    const marker = main.find(l => Math.abs(l.y - anchorY) < 0.1);
    if (!marker) continue;
    const neighbors = main.filter(l => Math.abs(l.y - marker.y) <= 19);
    const people = neighbors.map(l => clean(l.cells.invigilators))
      .filter(s => s && /[A-Z]{2}/i.test(s) && /^[A-Z0-9,.;:&\/\s\-]+$/i.test(s));
    if (people.length) row.invigilators = trueCodes(people.join(', '));
    const room = neighbors.map(l => clean(l.cells.room)).find(v => /^\d{3,4}$/.test(v));
    if (room) row.room = room;
  }
  return rows.filter(r => r.date && r.startTime).map(r => ({ ...r, program: r.program || lastGroupProgram, invigilators: trueCodes(r.invigilators), room: clean(r.room) }));
}
function nativeWords(text, viewport) {
  // PDF.js viewport.transform ALREADY converts PDF's bottom-left origin into
  // top-left (canvas) coordinates. Reversing Y a second time misplaced rows,
  // particularly the last (Economics / RESERVED) blocks on BUBT schedules.
  // Split long text-layer items into word centres so merged PDF text spans do
  // not accidentally cross an adjacent column boundary.
  return (text.items || []).flatMap(item => {
    if (!clean(item.str) || !Array.isArray(item.transform)) return [];
    const tr = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const unit = Math.hypot(tr[0], tr[1]) || 1;
    const dx = tr[0] / unit, dy = tr[1] / unit;
    const width = Math.abs(Number(item.width) || 0);
    const input = String(item.str);
    const tokens = [...input.matchAll(/\S+/g)];
    if (!tokens.length) return [];
    // Rotated date/time labels must remain one piece: otherwise their date
    // fragment is far from the centre of the date cell on multi-day pages.
    if (Math.abs(dy) > 0.55) return [{
      x: (tr[4] + dx * width / 2) / viewport.scale,
      y: (tr[5] + dy * width / 2) / viewport.scale,
      text: clean(input),
    }];
    const widthPerChar = width / Math.max(1, input.length);
    return tokens.map(match => ({
      x: (tr[4] + dx * widthPerChar * (match.index + match[0].length / 2)) / viewport.scale,
      y: (tr[5] + dy * widthPerChar * (match.index + match[0].length / 2)) / viewport.scale,
      text: clean(match[0]),
    }));
  });
}
function ocrWords(data, scale) {
  const out = [];
  const add = w => {
    if (w?.bbox && clean(w.text)) out.push({ text: clean(w.text), x: (w.bbox.x0+w.bbox.x1)/2/scale, y:(w.bbox.y0+w.bbox.y1)/2/scale });
  };
  (data.blocks || []).forEach(b => (b.paragraphs||[]).forEach(p=>(p.lines||[]).forEach(l=>(l.words||[]).forEach(add))));
  if (!out.length) (data.words || []).forEach(add);
  return out;
}
function unassignedInvigilatorCodes(words, rows, mode, height) {
  const bounds = modes[mode].columns;
  const left = bounds[6];
  const right = bounds[7];
  const printed = new Set();
  for (const word of words) {
    if (word.y < 219 || word.y > height - 90 || word.x < left + 4 || word.x > right - 3) continue;
    // Column headings and the placeholders in the routine are not faculty.
    for (const match of clean(word.text).toUpperCase().matchAll(/\b[A-Z]{2,8}(?:[0-9]{1,2})?\b/g)) {
      if (!['INVIGILATOR','TEACHER','ROOM','RESERVED','SUPPORT','PAGE','DATE'].includes(match[0])) printed.add(match[0]);
    }
  }
  const captured = new Set(rows.flatMap(r => clean(r.invigilators).toUpperCase().split(/[^A-Z0-9_-]+/).filter(Boolean)));
  return [...printed].filter(code => !captured.has(code)).sort();
}

async function ocrPage(page, worker) {
  const scale = 2.5;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const result = await worker.recognize(canvas, {}, { blocks: true });
  canvas.width=0; canvas.height=0;
  return { words: ocrWords(result.data || {}, scale), text: result.data?.text || '' };
}
// Do not include the visual program label in the identity: the same exam
// is sometimes identified as "Engineering Textile" or "B.Sc. in Textile".
function keyOf(r) { return [r.date,r.startTime,r.endTime,r.intake,r.section,r.course,r.room,r.category||'exam'].map(v=>clean(v).toUpperCase().replace(/\s+/g,'')).join('|'); }

export async function extractExamDutyPdfs(files, onProgress) {
  const all = [];
  const documents = [];
  let worker = null;
  try {
    for (let fi=0;fi<files.length;fi++) {
      const file = files[fi];
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw Error(`${file.name}: Only PDF files are supported.`);
      const pdf = await pdfjsLib.getDocument({ data:new Uint8Array(await file.arrayBuffer()) }).promise;
      let count=0, ocrPages=0;
      const missingPages=[];
      const warnings=[];
      for (let p=1;p<=pdf.numPages;p++) {
        onProgress?.(`Reading ${file.name} · page ${p}/${pdf.numPages} (${fi+1}/${files.length} files)`);
        const page = await pdf.getPage(p);
        const viewport=page.getViewport({ scale: 1 });
        const text=await page.getTextContent({ normalizeWhitespace:true });
        let content=(text.items||[]).map(i=>i.str).join(' ');
        let words=nativeWords(text, viewport);
        let mode=detectMode(file.name, content);
        let extracted=extractRows(words,file.name,p-1,mode,content,viewport.height);
        // A nearly empty result from a page full of content is a failed text
        // layout extraction, not evidence that the timetable is empty.
        if (words.length < 18 || (extracted.length === 0 && words.length >= 18)) {
          if (!worker) worker=await createWorker('eng');
          onProgress?.(`OCR processing ${file.name} · page ${p}/${pdf.numPages}`);
          const ocr=await ocrPage(page, worker);
          const ocrMode=detectMode(file.name, ocr.text);
          const ocrRows=extractRows(ocr.words,file.name,p-1,ocrMode,ocr.text,viewport.height);
          ocrPages++;
          if (ocrRows.length > extracted.length) {
            words=ocr.words;content=ocr.text;mode=ocrMode;extracted=ocrRows;
          }
        }
        if (!extracted.length) missingPages.push(p);
        const uncaptured=unassignedInvigilatorCodes(words,extracted,mode,viewport.height);
        if (uncaptured.length) warnings.push({ page:p, codes:uncaptured });
        all.push(...extracted); count+=extracted.length;
        page.cleanup();
      }
      documents.push({ name:file.name, rows:count, pages:pdf.numPages, ocrPages, missingPages, warnings });
      await pdf.destroy();
    }
  } finally { if(worker) await worker.terminate(); }
  const minutes = v => { const m=clean(v).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i); return m ? (+m[1]%12+(m[3].toUpperCase()==='PM'?12:0))*60+(+m[2]) : 9999; };
  const unique=new Map();
  all.forEach(r => { const k=keyOf(r); if(!unique.has(k)) unique.set(k,r); });
  return { rows:[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)||minutes(a.startTime)-minutes(b.startTime)), documents, duplicates:all.length-unique.size };
}

export const facultyCodeMatches=(text,code) => Boolean(clean(code)) && clean(text).toUpperCase().split(/[^A-Z0-9_-]+/).includes(clean(code).toUpperCase());
