import { BUBT_ROOM_DIRECTORY, BUBT_TIME_SLOTS } from "../data/bubtRoutineData";

export const OFFICIAL_DAYS = [
  { id: "Sat", label: "Saturday" },
  { id: "Sun", label: "Sunday" },
  { id: "Mon", label: "Monday" },
  { id: "Tue", label: "Tuesday" },
  { id: "Wed", label: "Wednesday" },
  { id: "Thu", label: "Thursday" },
  { id: "Fri", label: "Friday" },
];

export const OFFICIAL_TIME_SLOTS = BUBT_TIME_SLOTS;

export const PRAYER_LUNCH = {
  id: "prayer_lunch",
  start: "12:45 PM",
  end: "01:15 PM",
  label: "12:45 PM - 01:15 PM",
  shortLabel: "P&L",
  durationMinutes: 30,
};

export const ACTIVITY_TYPES = [
  { id: "CLASS", shortLabel: "Class", label: "Normal Class", description: "Choose course and room" },
  { id: "CH", shortLabel: "CH", label: "Counselling Hour", required: 5 },
  { id: "DM", shortLabel: "DM", label: "Departmental Meeting", required: 1 },
  { id: "DCW", shortLabel: "DCW", label: "Departmental Committee Work", required: 3 },
  { id: "IS", shortLabel: "IS", label: "Intake Supervision", required: 3 },
  { id: "OBEI_W", shortLabel: "OBEI-W", label: "OBE Implementation Work", required: 1 },
  { id: "RW", shortLabel: "RW", label: "Research Work", required: 4 },
  { id: "CLEAR", shortLabel: "Clear", label: "Clear Slot" },
];

export const ACTIVITY_REQUIREMENTS = {
  CH: { label: "Counselling", required: 5 },
  DM: { label: "Departmental Meeting", required: 1 },
  DCW: { label: "Committee Work", required: 3 },
  IS: { label: "Intake Supervision", required: 3 },
  OBEI_W: { label: "OBEI Work", required: 1 },
  RW: { label: "Research Work", required: 4 },
};

export const DEFAULT_ROOMS = BUBT_ROOM_DIRECTORY;

export const DAY_LABELS = Object.fromEntries(OFFICIAL_DAYS.map((item) => [item.id, item.label]));
export const SLOT_MAP = Object.fromEntries(OFFICIAL_TIME_SLOTS.map((item) => [item.id, item]));

const LEGACY_SLOT_MAP_9 = {
  slot_1: "day_0815_0945",
  slot_2: "day_0945_1115",
  slot_3: "day_1115_1245",
  slot_4: "day_1315_1445",
  slot_5: "day_1445_1615",
  slot_6: "day_1615_1745",
  slot_7: "eve_1745_1900",
  slot_8: "eve_1900_2015",
  slot_9: "eve_2015_2130",
};

const LEGACY_SLOT_MAP_7 = {
  slot_1: "day_0815_0945",
  slot_2: "day_1115_1245",
  slot_3: "day_1315_1445",
  slot_4: "day_1615_1745",
  slot_5: "eve_1745_1900",
  slot_6: "eve_1900_2015",
  slot_7: "eve_2015_2130",
};

function legacySlotMap(source = {}) {
  const allKeys = Object.values(source || {}).flatMap((day) => Object.keys(day || {}));
  return allKeys.includes("slot_8") || allKeys.includes("slot_9") ? LEGACY_SLOT_MAP_9 : LEGACY_SLOT_MAP_7;
}

export function normalizeRoom(room) {
  if (typeof room === "string") {
    const roomNo = room.trim();
    return roomNo
      ? { buildingName: "Custom / Legacy", roomNo, roomTitle: "", liftLevel: null }
      : null;
  }
  if (!room || typeof room !== "object") return null;
  const roomNo = String(room.roomNo || room.number || room.value || "").trim();
  if (!roomNo) return null;
  const liftValue = room.liftLevel;
  const liftLevel = liftValue === "" || liftValue === null || liftValue === undefined
    ? null
    : Number(liftValue);
  return {
    buildingName: String(room.buildingName || room.building || "Custom").trim() || "Custom",
    roomNo,
    roomTitle: String(room.roomTitle || room.title || "").trim(),
    liftLevel: Number.isFinite(liftLevel) ? liftLevel : null,
  };
}

export function normalizeRoomDirectory(rooms) {
  const source = Array.isArray(rooms) && rooms.length ? rooms : DEFAULT_ROOMS;
  const seen = new Set();
  return source
    .map(normalizeRoom)
    .filter(Boolean)
    .filter((room) => {
      const key = room.roomNo.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }));
}

export function roomKey(room) {
  return normalizeRoom(room)?.roomNo || "";
}

export function roomLabel(room, compact = false) {
  const normalized = normalizeRoom(room);
  if (!normalized) return "";
  if (compact) return normalized.roomNo;
  const details = [normalized.roomTitle, normalized.buildingName].filter(Boolean).join(" · ");
  return details ? `${normalized.roomNo} — ${details}` : normalized.roomNo;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function extractPrefixedRoom(value) {
  const match = cleanText(value).match(/^R(?:OOM)?\s*[:#-]\s*(.+)$/i);
  return match ? cleanText(match[1]) : "";
}

function parseIntakeSection(value) {
  const match = cleanText(value).match(/^([^\s\/-]+)\s*[\/-]\s*([^\s\/-]+)$/);
  return match ? { intake: cleanText(match[1]), section: cleanText(match[2]) } : null;
}

function repairLegacyClassFields(entry = {}) {
  const repaired = { ...entry };
  let room = cleanText(entry.room);
  let intake = cleanText(entry.intake);
  let section = cleanText(entry.section);

  const prefixedRoom = extractPrefixedRoom(room);
  if (prefixedRoom) room = prefixedRoom;

  const roomFromMetadata = extractPrefixedRoom(intake) || extractPrefixedRoom(section);
  const intakeSectionFromRoom = parseIntakeSection(room);
  if (roomFromMetadata && intakeSectionFromRoom) {
    room = roomFromMetadata;
    intake = intakeSectionFromRoom.intake;
    section = intakeSectionFromRoom.section;
  } else if (!section) {
    const combined = parseIntakeSection(intake);
    if (combined) {
      intake = combined.intake;
      section = combined.section;
    }
  }

  return { ...repaired, room, intake, section };
}

function courseSnapshotKey(course = {}) {
  return [course.code || course.courseCode, course.intake, course.section]
    .map((value) => cleanText(value).toLowerCase())
    .join("|");
}

export function findCourseForEntry(courses = [], rawEntry = {}) {
  const entry = repairLegacyClassFields(rawEntry);
  const exactSnapshot = courses.find((course) => courseSnapshotKey(course) === courseSnapshotKey(entry));
  if (exactSnapshot) return exactSnapshot;

  const exactId = courses.find((course) => cleanText(course.id || course._id) === cleanText(entry.courseId));
  if (exactId) return exactId;

  const sameCode = courses.filter(
    (course) => cleanText(course.code).toLowerCase() === cleanText(entry.courseCode).toLowerCase()
  );
  const partial = sameCode.find((course) => {
    const intakeMatches = !entry.intake || !course.intake || cleanText(course.intake).toLowerCase() === cleanText(entry.intake).toLowerCase();
    const sectionMatches = !entry.section || !course.section || cleanText(course.section).toLowerCase() === cleanText(entry.section).toLowerCase();
    return intakeMatches && sectionMatches;
  });
  return partial || (sameCode.length === 1 ? sameCode[0] : null);
}

function normalizeRoutineEntry(rawEntry, courses = []) {
  if (!rawEntry || typeof rawEntry !== "object") return null;
  if (String(rawEntry.type || "").toUpperCase() !== "CLASS") return rawEntry;

  const repaired = repairLegacyClassFields(rawEntry);
  const course = findCourseForEntry(courses, repaired);
  if (!course) return repaired;

  return {
    ...repaired,
    courseId: cleanText(course.id || course._id) || cleanText(repaired.courseId),
    courseCode: cleanText(course.code) || cleanText(repaired.courseCode),
    courseTitle: cleanText(course.title) || cleanText(repaired.courseTitle),
    intake: cleanText(course.intake) || cleanText(repaired.intake),
    section: cleanText(course.section) || cleanText(repaired.section),
    courseType: cleanText(course.courseType).toLowerCase() || cleanText(repaired.courseType).toLowerCase() || "theory",
    courseShift: cleanText(course.shift) || cleanText(repaired.courseShift),
  };
}

export function createEntries(days = OFFICIAL_DAYS.map((item) => item.id), source = {}, courses = []) {
  const entries = {};
  const oldMap = legacySlotMap(source);
  const reverseLegacy = Object.fromEntries(Object.entries(oldMap).map(([oldId, newId]) => [newId, oldId]));
  days.forEach((day) => {
    entries[day] = {};
    OFFICIAL_TIME_SLOTS.forEach((slot) => {
      const oldId = reverseLegacy[slot.id];
      const rawEntry = source?.[day]?.[slot.id] || (oldId ? source?.[day]?.[oldId] : null) || null;
      entries[day][slot.id] = normalizeRoutineEntry(rawEntry, courses);
    });
  });
  return entries;
}

export function createRoutineShell(overrides = {}, defaults = {}, profile = {}, courses = []) {
  const days = Array.isArray(overrides.days) && overrides.days.length
    ? overrides.days
    : defaults.days || OFFICIAL_DAYS.map((item) => item.id);
  const workingDays = Array.isArray(overrides.workingDays) && overrides.workingDays.length
    ? overrides.workingDays
    : defaults.workingDays || ["Sun", "Mon", "Tue", "Wed", "Thu"];

  return {
    title: "Class Routine and Weekly Activities",
    universityName: "Bangladesh University of Business and Technology (BUBT)",
    facultyName: overrides.facultyName || profile.name || "",
    facultyCode: overrides.facultyCode || profile.shortCode || "",
    designation: overrides.designation || profile.designation || "",
    department: overrides.department || profile.department || "Department of Computer Science and Engineering",
    facultyEmail: overrides.facultyEmail || profile.email || "",
    facultyPhone: overrides.facultyPhone || profile.phone || "",
    facultyProfileImage: overrides.facultyProfileImage || profile.profileImage || "",
    semester: overrides.semester || defaults.semester || "",
    year: Number(overrides.year || defaults.year || new Date().getFullYear()),
    days,
    workingDays,
    timeSlots: OFFICIAL_TIME_SLOTS,
    rooms: normalizeRoomDirectory(overrides.rooms?.length ? overrides.rooms : defaults.rooms),
    entries: createEntries(days, overrides.entries || {}, courses),
    courses: Array.isArray(courses) ? courses : [],
    validation: overrides.validation || null,
    totalWorkingHours: Number(overrides.totalWorkingHours || 0),
  };
}

export function courseKey(course = {}) {
  return course.id || course._id || [course.code, course.intake, course.section].filter(Boolean).join("|");
}

export function entryCourseKey(entry = {}) {
  const snapshot = [entry.courseCode, entry.intake, entry.section]
    .map((value) => cleanText(value))
    .join("|");
  return snapshot.replace(/\|/g, "") ? snapshot.toLowerCase() : cleanText(entry.courseId).toLowerCase();
}

export function getNextLabSlot(slotId, day = "") {
  const slot = SLOT_MAP[slotId];
  const next = slot?.nextSlotId ? SLOT_MAP[slot.nextSlotId] || null : null;
  if (!next) return null;
  return !day || isSlotAvailableForDay(next, day) ? next : null;
}

export function isSlotAvailableForDay(slotOrId, day) {
  const slot = typeof slotOrId === "string" ? SLOT_MAP[slotOrId] : slotOrId;
  if (!slot) return false;
  if (slot.shift !== "Evening") return true;
  if (day === "Fri") return true;
  return Number(slot.sequenceOrder) >= 7;
}

export function getCoursePlacements(routine, key) {
  const placements = [];
  (routine.workingDays || []).forEach((day) => {
    OFFICIAL_TIME_SLOTS.forEach((slot) => {
      const entry = routine.entries?.[day]?.[slot.id];
      if (entry?.type === "CLASS" && entryCourseKey(entry) === key) {
        placements.push({ day, slot, entry });
      }
    });
  });
  return placements;
}

export function calculateRoutineSummary(routine) {
  const counts = { CH: 0, DM: 0, DCW: 0, IS: 0, OBEI_W: 0, RW: 0 };
  let occupiedMinutes = 0;
  let classSlots = 0;
  const workingSet = new Set(routine.workingDays || []);

  (routine.days || []).forEach((day) => {
    if (!workingSet.has(day)) return;
    OFFICIAL_TIME_SLOTS.forEach((slot) => {
      const entry = routine.entries?.[day]?.[slot.id];
      if (!entry) return;
      occupiedMinutes += slot.durationMinutes;
      if (entry.type === "CLASS") classSlots += 1;
      else if (counts[entry.type] !== undefined) counts[entry.type] += 1;
    });
  });

  const prayerLunchMinutes = workingSet.size * PRAYER_LUNCH.durationMinutes;
  const totalMinutes = occupiedMinutes + prayerLunchMinutes;

  return {
    counts,
    classSlots,
    occupiedMinutes,
    prayerLunchMinutes,
    totalMinutes,
    totalWorkingHours: Number((totalMinutes / 60).toFixed(2)),
  };
}

export function getClientValidation(routine) {
  const summary = calculateRoutineSummary(routine);
  const blockingErrors = [];
  const completionErrors = [];

  if (!routine.semester) completionErrors.push("Select semester.");
  if (!routine.year) completionErrors.push("Select year.");
  if ((routine.workingDays || []).length !== 5) completionErrors.push("Select exactly five working days.");

  const workingSet = new Set(routine.workingDays || []);
  (routine.days || []).forEach((day) => {
    const dayEntries = Object.entries(routine.entries?.[day] || {}).filter(([, entry]) => Boolean(entry));
    if (!workingSet.has(day) && dayEntries.length) blockingErrors.push(`${DAY_LABELS[day] || day} is an off day and cannot contain entries.`);

    const chCount = dayEntries.filter(([, entry]) => entry.type === "CH").length;
    if (workingSet.has(day) && chCount !== 1) completionErrors.push(`${DAY_LABELS[day] || day} requires exactly one Counselling Hour.`);

    Object.keys(ACTIVITY_REQUIREMENTS).forEach((type) => {
      if (dayEntries.filter(([, entry]) => entry.type === type).length > 1) {
        blockingErrors.push(`${ACTIVITY_REQUIREMENTS[type].label} can be used only once on ${DAY_LABELS[day] || day}.`);
      }
    });

    dayEntries.forEach(([slotId, entry]) => {
      if (!isSlotAvailableForDay(slotId, day)) {
        blockingErrors.push(`${SLOT_MAP[slotId]?.label || slotId} is not an available Evening slot on ${DAY_LABELS[day] || day}.`);
      }
    });
  });

  Object.entries(ACTIVITY_REQUIREMENTS).forEach(([type, rule]) => {
    if ((summary.counts[type] || 0) !== rule.required) {
      completionErrors.push(`${rule.label}: ${summary.counts[type] || 0}/${rule.required}.`);
    }
  });
  if (summary.totalWorkingHours < 35) completionErrors.push(`Working hours: ${summary.totalWorkingHours}/35.`);

  const courseGroups = new Map();
  (routine.workingDays || []).forEach((day) => {
    OFFICIAL_TIME_SLOTS.forEach((slot) => {
      const entry = routine.entries?.[day]?.[slot.id];
      if (!entry || entry.type !== "CLASS") return;
      const key = entryCourseKey(entry);
      if (!courseGroups.has(key)) courseGroups.set(key, []);
      courseGroups.get(key).push({ day, slot, entry });
    });
  });

  courseGroups.forEach((placements) => {
    const sample = placements[0]?.entry || {};
    const label = [sample.courseCode, sample.intake, sample.section].filter(Boolean).join(" · ") || "Course";
    if (placements.length > 2) blockingErrors.push(`${label} can have only two class slots in a week.`);
    if (placements.length < 2) completionErrors.push(`${label}: ${placements.length}/2 weekly class slots.`);

    const byDay = new Map();
    placements.forEach((item) => {
      if (!byDay.has(item.day)) byDay.set(item.day, []);
      byDay.get(item.day).push(item);
    });

    const shift = String(sample.courseShift || "").toLowerCase();
    if (sample.courseType === "lab") {
      if (placements.length === 2 && byDay.size === 1) {
        const values = [...byDay.values()][0].sort((a, b) => a.slot.order - b.slot.order);
        if (getNextLabSlot(values[0]?.slot?.id, values[0]?.day)?.id !== values[1]?.slot?.id) {
          blockingErrors.push(`${label} lab must use two valid consecutive slots when held on one day.`);
        }
      }
      if (placements.length === 2 && byDay.size === 2) {
        const confirmed = placements.every(({ entry }) => Boolean(entry.specialLabSplitConfirmed));
        if (!confirmed) blockingErrors.push(`${label} lab is split across two days without special-condition confirmation.`);
      }
    } else if (shift === "day") {
      byDay.forEach((values, day) => {
        if (values.length > 1 && !values.some(({ entry }) => entry.specialSameDayConfirmed)) {
          blockingErrors.push(`${label} has two Day-batch classes on ${DAY_LABELS[day] || day} without confirmation.`);
        }
      });
    }
  });

  const errors = [...new Set([...blockingErrors, ...completionErrors])];
  return {
    canSave: blockingErrors.length === 0,
    isValid: errors.length === 0,
    blockingErrors: [...new Set(blockingErrors)],
    completionErrors: [...new Set(completionErrors)],
    errors,
    summary,
  };
}

export function visibleSlotIds(routine) {
  return OFFICIAL_TIME_SLOTS.filter((slot) =>
    (routine.workingDays || []).some((day) => Boolean(routine.entries?.[day]?.[slot.id]))
  ).map((slot) => slot.id);
}

export function getDocumentColumns(routine) {
  const visible = visibleSlotIds(routine);
  const daySlots = visible.filter((id) => SLOT_MAP[id]?.shift === "Day");
  const eveningSlots = visible.filter((id) => SLOT_MAP[id]?.shift === "Evening");
  return [
    ...daySlots.filter((id) => SLOT_MAP[id].sequenceOrder <= 3).map((id) => ({ kind: "slot", id })),
    ...(daySlots.length ? [{ kind: "lunch", id: PRAYER_LUNCH.id }] : []),
    ...daySlots.filter((id) => SLOT_MAP[id].sequenceOrder >= 4).map((id) => ({ kind: "slot", id })),
    ...eveningSlots.map((id) => ({ kind: "slot", id })),
  ];
}
