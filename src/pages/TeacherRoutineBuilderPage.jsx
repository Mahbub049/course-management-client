import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import {
  downloadRoutineDocument,
  getMyRoutine,
  saveMyRoutine,
} from "../services/routineService";
import {
  ACTIVITY_REQUIREMENTS,
  ACTIVITY_TYPES,
  DAY_LABELS,
  OFFICIAL_DAYS,
  OFFICIAL_TIME_SLOTS,
  PRAYER_LUNCH,
  SLOT_MAP,
  calculateRoutineSummary,
  courseKey,
  createRoutineShell,
  entryCourseKey,
  findCourseForEntry,
  getClientValidation,
  getCoursePlacements,
  getNextLabSlot,
  isSlotAvailableForDay,
  normalizeRoom,
  roomKey,
  roomLabel,
} from "../utils/routineConfig";

const SEMESTERS = ["Spring", "Summer", "Fall"];

function entryLabel(entry) {
  if (!entry) return "";
  if (entry.type !== "CLASS") return entry.label || entry.type;
  return [
    entry.courseCode,
    entry.room,
    [entry.intake, entry.section].filter(Boolean).join("/"),
  ]
    .filter(Boolean)
    .join("\n");
}

function TeacherRoutineBuilderPage() {
  const navigate = useNavigate();
  const [routine, setRoutine] = useState(null);
  const [courses, setCourses] = useState([]);
  const [selectedTool, setSelectedTool] = useState("CLASS");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showRuleCheck, setShowRuleCheck] = useState(false);
  const [newRoom, setNewRoom] = useState({ buildingName: "", roomNo: "", roomTitle: "Theory", liftLevel: "" });
  const [roomSearch, setRoomSearch] = useState("");
  const [directoryBuilding, setDirectoryBuilding] = useState("");
  const [directoryRoomType, setDirectoryRoomType] = useState("");
  const [scheduleView, setScheduleView] = useState("All");
  const [classTarget, setClassTarget] = useState(null);
  const [classForm, setClassForm] = useState({ courseId: "", buildingName: "", roomTitle: "", room: "" });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await getMyRoutine();
        if (!active) return;
        const loadedCourses = Array.isArray(data?.courses) ? data.courses : [];
        setCourses(loadedCourses);
        setRoutine(createRoutineShell(data?.routine || {}, data?.defaults || {}, data?.profile || {}, loadedCourses));
      } catch (error) {
        console.error(error);
        Swal.fire("Failed", error?.response?.data?.message || "Could not load routine.", "error");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const matchingCourses = useMemo(() => {
    if (!routine) return [];
    return courses.filter(
      (course) =>
        String(course.semester || "").toLowerCase() === String(routine.semester || "").toLowerCase() &&
        Number(course.year) === Number(routine.year)
    );
  }, [courses, routine]);

  const semesterOptions = useMemo(
    () => [...new Set([...SEMESTERS, ...courses.map((course) => course.semester).filter(Boolean)])],
    [courses]
  );

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const extendedYears = Array.from({ length: current + 10 - 1999 }, (_, index) => current + 10 - index);
    return [...new Set([...extendedYears, ...courses.map((course) => Number(course.year)).filter(Boolean)])]
      .sort((a, b) => b - a);
  }, [courses]);

  const summary = useMemo(() => (routine ? calculateRoutineSummary(routine) : null), [routine]);
  const validation = useMemo(() => (routine ? getClientValidation(routine) : null), [routine]);
  const selectedCourse = useMemo(
    () => matchingCourses.find((course) => courseKey(course) === classForm.courseId) || null,
    [matchingCourses, classForm.courseId]
  );

  const modalCourses = useMemo(() => {
    const slotShift = SLOT_MAP[classTarget?.slotId]?.shift;
    if (!slotShift) return matchingCourses;
    return matchingCourses.filter((course) => !course.shift || String(course.shift).toLowerCase() === slotShift.toLowerCase());
  }, [matchingCourses, classTarget]);

  const buildingOptions = useMemo(
    () => [...new Set((routine?.rooms || []).map((room) => room.buildingName).filter(Boolean))],
    [routine]
  );

  const classRoomTypeOptions = useMemo(() => {
    const rooms = (routine?.rooms || []).filter(
      (room) => !classForm.buildingName || room.buildingName === classForm.buildingName
    );
    return [...new Set(rooms.map((room) => room.roomTitle).filter(Boolean))];
  }, [routine, classForm.buildingName]);

  const roomOptions = useMemo(() => {
    if (!routine) return [];
    return routine.rooms
      .filter((room) => !classForm.buildingName || room.buildingName === classForm.buildingName)
      .filter((room) => !classForm.roomTitle || room.roomTitle === classForm.roomTitle)
      .sort((a, b) => roomKey(a).localeCompare(roomKey(b), undefined, { numeric: true }));
  }, [routine, classForm.buildingName, classForm.roomTitle]);

  const directoryRoomTypes = useMemo(() => {
    const rooms = (routine?.rooms || []).filter(
      (room) => !directoryBuilding || room.buildingName === directoryBuilding
    );
    return [...new Set(rooms.map((room) => room.roomTitle).filter(Boolean))];
  }, [routine, directoryBuilding]);

  const filteredRooms = useMemo(() => {
    if (!routine) return [];
    const query = roomSearch.trim().toLowerCase();
    return routine.rooms
      .filter((room) => !directoryBuilding || room.buildingName === directoryBuilding)
      .filter((room) => !directoryRoomType || room.roomTitle === directoryRoomType)
      .filter((room) => !query || roomLabel(room).toLowerCase().includes(query));
  }, [routine, roomSearch, directoryBuilding, directoryRoomType]);

  const tableColumns = useMemo(() => {
    const daySlots = OFFICIAL_TIME_SLOTS.filter((slot) => slot.shift === "Day");
    const eveningSlots = OFFICIAL_TIME_SLOTS.filter((slot) => slot.shift === "Evening");
    if (scheduleView === "Day") {
      return [
        ...daySlots.filter((slot) => slot.sequenceOrder <= 3).map((slot) => ({ kind: "slot", slot })),
        { kind: "lunch", id: PRAYER_LUNCH.id },
        ...daySlots.filter((slot) => slot.sequenceOrder >= 4).map((slot) => ({ kind: "slot", slot })),
      ];
    }
    if (scheduleView === "Evening") return eveningSlots.map((slot) => ({ kind: "slot", slot }));
    return [
      ...daySlots.filter((slot) => slot.sequenceOrder <= 3).map((slot) => ({ kind: "slot", slot })),
      { kind: "lunch", id: PRAYER_LUNCH.id },
      ...daySlots.filter((slot) => slot.sequenceOrder >= 4).map((slot) => ({ kind: "slot", slot })),
      ...eveningSlots.map((slot) => ({ kind: "slot", slot })),
    ];
  }, [scheduleView]);

  const updateRoutine = (patch) => setRoutine((previous) => ({ ...previous, ...patch }));

  const setEntry = (day, slotId, entry) => {
    setRoutine((previous) => {
      const nextDay = { ...(previous.entries?.[day] || {}) };
      const current = nextDay[slotId];
      if (current?.type === "CLASS" && current.courseType === "lab" && current.linkedGroupId) {
        Object.keys(nextDay).forEach((key) => {
          if (nextDay[key]?.linkedGroupId === current.linkedGroupId) nextDay[key] = null;
        });
      }
      nextDay[slotId] = entry;
      return {
        ...previous,
        entries: { ...previous.entries, [day]: nextDay },
      };
    });
  };

  const clearSlot = (day, slotId) => {
    setRoutine((previous) => {
      const current = previous.entries?.[day]?.[slotId];
      const nextDay = { ...(previous.entries?.[day] || {}) };
      if (current?.type === "CLASS" && current.courseType === "lab" && current.linkedGroupId) {
        Object.keys(nextDay).forEach((key) => {
          if (nextDay[key]?.linkedGroupId === current.linkedGroupId) nextDay[key] = null;
        });
      } else {
        nextDay[slotId] = null;
      }
      return {
        ...previous,
        entries: { ...previous.entries, [day]: nextDay },
      };
    });
  };

  const toggleWorkingDay = (day) => {
    setShowRuleCheck(true);
    setRoutine((previous) => {
      const selected = previous.workingDays.includes(day);
      if (!selected && previous.workingDays.length >= 5) {
        Swal.fire("Five working days", "Remove one working day before selecting another.", "info");
        return previous;
      }
      const workingDays = selected
        ? previous.workingDays.filter((item) => item !== day)
        : [...previous.workingDays, day];
      const entries = { ...previous.entries };
      if (selected) {
        entries[day] = Object.fromEntries(OFFICIAL_TIME_SLOTS.map((slot) => [slot.id, null]));
      }
      return { ...previous, workingDays, entries };
    });
  };

  const openClassModal = (day, slotId) => {
    if (!isSlotAvailableForDay(slotId, day)) {
      Swal.fire(
        "Slot not available",
        "Evening classes use 05:45 PM–09:30 PM on normal days. The additional Evening slots are available on Friday.",
        "info"
      );
      return;
    }

    const existing = routine.entries?.[day]?.[slotId];
    let targetSlotId = slotId;

    if (existing?.type === "CLASS" && existing.courseType === "lab" && existing.linkedGroupId) {
      const firstLinkedSlot = OFFICIAL_TIME_SLOTS.find((slot) =>
        routine.entries?.[day]?.[slot.id]?.linkedGroupId === existing.linkedGroupId
      );
      if (firstLinkedSlot) targetSlotId = firstLinkedSlot.id;
    }

    const targetEntry = routine.entries?.[day]?.[targetSlotId] || existing;
    const matchedCourse = targetEntry?.type === "CLASS"
      ? findCourseForEntry(matchingCourses, targetEntry)
      : null;
    const existingSelectionKey = matchedCourse
      ? courseKey(matchedCourse)
      : (targetEntry?.courseId || "");
    const selectedRoom = routine.rooms.find((room) => roomKey(room) === targetEntry?.room);
    setClassTarget({ day, slotId: targetSlotId });
    setClassForm({
      courseId: existingSelectionKey,
      buildingName: selectedRoom?.buildingName || "",
      roomTitle: selectedRoom?.roomTitle || "",
      room: targetEntry?.room || "",
    });
  };

  const handleCellClick = (day, slotId) => {
    if (!routine.workingDays.includes(day)) return;
    if (!isSlotAvailableForDay(slotId, day)) {
      Swal.fire(
        "Unavailable on this day",
        "This Evening slot is part of the Friday schedule. Use 05:45 PM–09:30 PM for normal Evening-batch days.",
        "info"
      );
      return;
    }
    if (selectedTool === "CLEAR") {
      clearSlot(day, slotId);
      setShowRuleCheck(true);
      return;
    }
    if (selectedTool === "CLASS") {
      openClassModal(day, slotId);
      return;
    }

    const duplicate = Object.entries(routine.entries?.[day] || {}).find(
      ([key, entry]) => key !== slotId && entry?.type === selectedTool
    );
    if (duplicate) {
      Swal.fire(
        "Already used on this day",
        `${ACTIVITY_TYPES.find((item) => item.id === selectedTool)?.label || selectedTool} can be selected only once on ${DAY_LABELS[day]}.`,
        "warning"
      );
      setShowRuleCheck(true);
      return;
    }

    const weeklyLimit = ACTIVITY_REQUIREMENTS[selectedTool]?.required;
    const currentEntry = routine.entries?.[day]?.[slotId];
    const currentCount = summary.counts[selectedTool] || 0;
    const replacingSameType = currentEntry?.type === selectedTool;
    if (weeklyLimit && currentCount >= weeklyLimit && !replacingSameType) {
      Swal.fire(
        "Weekly limit reached",
        `${ACTIVITY_REQUIREMENTS[selectedTool].label} requires ${weeklyLimit} slot${weeklyLimit === 1 ? "" : "s"} per week. Remove an existing slot before adding another.`,
        "warning"
      );
      setShowRuleCheck(true);
      return;
    }

    const activity = ACTIVITY_TYPES.find((item) => item.id === selectedTool);
    setEntry(day, slotId, { type: selectedTool, label: activity?.shortLabel || selectedTool });
    setShowRuleCheck(true);
  };

  const handleCourseSelection = (courseId) => {
    const course = matchingCourses.find((item) => courseKey(item) === courseId);
    const prefersLab = String(course?.courseType || "").toLowerCase() === "lab";
    const preferredType = prefersLab
      ? (routine.rooms.find((room) => /lab/i.test(room.roomTitle || ""))?.roomTitle || "")
      : (routine.rooms.find((room) => room.roomTitle === "Theory")?.roomTitle || "");
    setClassForm((previous) => ({
      ...previous,
      courseId,
      buildingName: "",
      roomTitle: preferredType,
      room: "",
    }));
  };

  const saveClassToGrid = async () => {
    if (!classTarget || !selectedCourse || !classForm.room) {
      Swal.fire("Required", "Select a course, building, room type, and room number.", "warning");
      return;
    }

    const { day, slotId } = classTarget;
    const targetSlot = SLOT_MAP[slotId];
    const courseId = courseKey(selectedCourse);
    const placementKey = entryCourseKey({
      courseId,
      courseCode: selectedCourse.code,
      intake: selectedCourse.intake,
      section: selectedCourse.section,
    });
    const courseType = String(selectedCourse.courseType || "theory").toLowerCase();
    const courseShift = selectedCourse.shift || targetSlot?.shift || "";
    const currentEntry = routine.entries?.[day]?.[slotId];
    const currentGroupId = currentEntry?.type === "CLASS" && currentEntry.courseType === "lab"
      ? currentEntry.linkedGroupId
      : "";

    if (!isSlotAvailableForDay(targetSlot, day)) {
      Swal.fire("Slot not available", "Choose a valid slot for this day.", "warning");
      return;
    }

    if (courseShift && targetSlot?.shift && String(courseShift).toLowerCase() !== String(targetSlot.shift).toLowerCase()) {
      Swal.fire("Shift mismatch", `${selectedCourse.code} is a ${courseShift} course. Choose a ${courseShift} time slot.`, "warning");
      return;
    }

    const allPlacements = getCoursePlacements(routine, placementKey);
    const placements = allPlacements.filter(({ day: placementDay, slot, entry }) => {
      if (placementDay === day && slot.id === slotId) return false;
      if (currentGroupId && entry.linkedGroupId === currentGroupId) return false;
      return true;
    });

    const baseEntry = {
      type: "CLASS",
      courseId,
      courseCode: selectedCourse.code,
      courseTitle: selectedCourse.title,
      intake: selectedCourse.intake,
      section: selectedCourse.section,
      room: classForm.room,
      courseType,
      courseShift,
      linkedGroupId: "",
      secondLabDayConfirmed: false,
      specialSameDayConfirmed: false,
      specialLabSplitConfirmed: false,
    };

    if (courseType !== "lab") {
      if (placements.length >= 2) {
        Swal.fire("Weekly limit reached", "This course already has its two weekly class slots.", "warning");
        setShowRuleCheck(true);
        return;
      }

      const sameDayPlacements = placements.filter((item) => item.day === day);
      let specialSameDayConfirmed = false;
      if (String(courseShift).toLowerCase() === "day" && sameDayPlacements.length >= 1) {
        const result = await Swal.fire({
          icon: "warning",
          title: "Use two Day-batch classes on the same day?",
          text: "A Day-batch theory course normally has one class per day. Continue only for a special condition.",
          showCancelButton: true,
          confirmButtonText: "Yes, special condition",
          cancelButtonText: "Cancel",
        });
        if (!result.isConfirmed) return;
        specialSameDayConfirmed = true;
      }

      setEntry(day, slotId, { ...baseEntry, specialSameDayConfirmed });
      setClassTarget(null);
      setShowRuleCheck(true);
      return;
    }

    if (placements.length > 2) {
      Swal.fire("Weekly limit reached", "A lab course can have only two weekly class slots.", "warning");
      setShowRuleCheck(true);
      return;
    }

    if (placements.length === 2) {
      const days = new Set(placements.map((item) => item.day));
      const linkedGroupIds = new Set(placements.map((item) => item.entry.linkedGroupId).filter(Boolean));
      const normalPair = days.size === 1 && linkedGroupIds.size === 1;
      if (!normalPair || placements[0].day === day) {
        Swal.fire("Weekly limit reached", "This lab already has its two weekly class slots.", "warning");
        setShowRuleCheck(true);
        return;
      }

      const result = await Swal.fire({
        icon: "warning",
        title: "Split this lab across two days?",
        text: "Normally both lab slots are held together on one day. This will keep one existing slot and place the second slot on the selected day.",
        showCancelButton: true,
        confirmButtonText: "Yes, split for special condition",
        cancelButtonText: "Cancel",
      });
      if (!result.isConfirmed) return;

      const sortedExisting = [...placements].sort((a, b) => a.slot.order - b.slot.order);
      const keep = sortedExisting[0];
      const remove = sortedExisting[1];
      setRoutine((previous) => {
        const entries = { ...previous.entries };
        entries[keep.day] = { ...(entries[keep.day] || {}) };
        entries[remove.day] = keep.day === remove.day ? entries[keep.day] : { ...(entries[remove.day] || {}) };
        entries[keep.day][keep.slot.id] = {
          ...keep.entry,
          linkedGroupId: "",
          specialLabSplitConfirmed: true,
        };
        entries[remove.day][remove.slot.id] = null;
        const targetDay = { ...(entries[day] || {}) };
        targetDay[slotId] = { ...baseEntry, courseType: "lab", specialLabSplitConfirmed: true };
        entries[day] = targetDay;
        return { ...previous, entries };
      });
      setClassTarget(null);
      setShowRuleCheck(true);
      return;
    }

    if (placements.length === 1) {
      if (placements[0].day === day) {
        Swal.fire("Choose another day", "A split lab must use one slot on each of two different days.", "warning");
        return;
      }
      const result = placements[0].entry.specialLabSplitConfirmed
        ? { isConfirmed: true }
        : await Swal.fire({
            icon: "warning",
            title: "Complete the special split lab?",
            text: "This will place the second weekly lab slot on another day.",
            showCancelButton: true,
            confirmButtonText: "Continue",
            cancelButtonText: "Cancel",
          });
      if (!result.isConfirmed) return;

      setRoutine((previous) => {
        const entries = { ...previous.entries };
        const firstDay = { ...(entries[placements[0].day] || {}) };
        firstDay[placements[0].slot.id] = {
          ...placements[0].entry,
          linkedGroupId: "",
          specialLabSplitConfirmed: true,
        };
        entries[placements[0].day] = firstDay;
        const targetDay = { ...(entries[day] || {}) };
        targetDay[slotId] = { ...baseEntry, courseType: "lab", specialLabSplitConfirmed: true };
        entries[day] = targetDay;
        return { ...previous, entries };
      });
      setClassTarget(null);
      setShowRuleCheck(true);
      return;
    }

    const nextSlot = getNextLabSlot(slotId, day);
    if (!nextSlot) {
      Swal.fire("No valid next slot", "A normal lab needs two consecutive university slots. Choose an earlier valid slot.", "warning");
      return;
    }

    const nextEntry = routine.entries?.[day]?.[nextSlot.id];
    if (nextEntry && nextEntry.linkedGroupId !== currentGroupId) {
      Swal.fire("Slot unavailable", `The next slot (${nextSlot.label}) is already occupied.`, "warning");
      return;
    }

    const groupId = `lab_${Date.now()}`;
    const pairedEntry = { ...baseEntry, courseType: "lab", linkedGroupId: groupId };
    setRoutine((previous) => {
      const nextDay = { ...(previous.entries?.[day] || {}) };
      if (currentGroupId) {
        Object.keys(nextDay).forEach((key) => {
          if (nextDay[key]?.linkedGroupId === currentGroupId) nextDay[key] = null;
        });
      }
      nextDay[slotId] = pairedEntry;
      nextDay[nextSlot.id] = pairedEntry;
      return { ...previous, entries: { ...previous.entries, [day]: nextDay } };
    });
    setClassTarget(null);
    setShowRuleCheck(true);
  };

  const addRoom = () => {
    const room = normalizeRoom(newRoom);
    if (!room) {
      Swal.fire("Room number required", "Enter at least the room number.", "warning");
      return;
    }
    if (routine.rooms.some((item) => roomKey(item).toLowerCase() === room.roomNo.toLowerCase())) {
      Swal.fire("Already stored", `${room.roomNo} is already in the room directory.`, "info");
      return;
    }
    updateRoutine({
      rooms: [...routine.rooms, room].sort((a, b) => roomKey(a).localeCompare(roomKey(b), undefined, { numeric: true })),
    });
    setNewRoom({ buildingName: "", roomNo: "", roomTitle: "Theory", liftLevel: "" });
  };

  const removeRoom = (room) => {
    const roomNo = roomKey(room);
    const used = routine.days.some((day) =>
      Object.values(routine.entries?.[day] || {}).some((entry) => entry?.type === "CLASS" && entry.room === roomNo)
    );
    if (used) {
      Swal.fire("Room in use", "Clear or move the classes using this room before deleting it.", "warning");
      return;
    }
    updateRoutine({ rooms: routine.rooms.filter((item) => roomKey(item) !== roomNo) });
  };

  const removeDay = (day) => {
    if (routine.workingDays.includes(day)) {
      Swal.fire("Working day", "Turn this day into an off day before removing it from the editor.", "warning");
      return;
    }
    updateRoutine({ days: routine.days.filter((item) => item !== day) });
  };

  const addDay = (day) => {
    const ordered = OFFICIAL_DAYS.map((item) => item.id).filter((item) => routine.days.includes(item) || item === day);
    updateRoutine({
      days: ordered,
      entries: {
        ...routine.entries,
        [day]: Object.fromEntries(OFFICIAL_TIME_SLOTS.map((slot) => [slot.id, null])),
      },
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const data = await saveMyRoutine(routine);
      setRoutine(createRoutineShell(data?.routine || routine, {}, {}, courses));
      Swal.fire(
        "Saved",
        validation.isValid
          ? "Routine and weekly activities saved successfully."
          : "Routine draft saved. Open Weekly Rule Check to complete the remaining requirements before downloading.",
        "success"
      );
    } catch (error) {
      const serverErrors = error?.response?.data?.validation?.blockingErrors || error?.response?.data?.validation?.errors || [];
      Swal.fire({
        icon: "error",
        title: "Could not save",
        html: serverErrors.length
          ? `<div style="text-align:left">${serverErrors.map((item) => `• ${item}`).join("<br>")}</div>`
          : error?.response?.data?.message || "Could not save routine.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (kind) => {
    try {
      setDownloading(kind);
      await downloadRoutineDocument(kind);
    } catch (error) {
      Swal.fire("Download failed", error?.response?.data?.message || "Save a valid routine before downloading.", "error");
    } finally {
      setDownloading("");
    }
  };

  if (loading || !routine) {
    return <div className="flex min-h-[55vh] items-center justify-center text-sm font-semibold text-slate-500">Loading routine...</div>;
  }

  const missingDays = OFFICIAL_DAYS.filter((item) => !routine.days.includes(item.id));

  return (
    <div className="space-y-5 pb-10">
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <span className="rounded-full border border-violet-300/40 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-700 dark:text-violet-300">University Routine Builder</span>
            <h1 className="mt-3 text-2xl font-black text-slate-950 dark:text-white">Class Routine & Weekly Activities</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Choose an activity once, then click the required slot. Classes ask for the course and room; other activities are added instantly.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button type="button" onClick={() => navigate("/teacher/routine")} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold dark:border-slate-700">Back</button>
            <button type="button" onClick={() => window.open("/routine-reference", "_blank", "noopener,noreferrer")} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold dark:border-slate-700">Public Schedule</button>
            <button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save Routine"}</button>
            <button type="button" onClick={() => handleDownload("class-routine")} disabled={Boolean(downloading)} className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 disabled:opacity-60 dark:bg-emerald-500/10 dark:text-emerald-300">{downloading === "class-routine" ? "Preparing..." : "Routine DOCX"}</button>
            <button type="button" onClick={() => handleDownload("faculty-nameplate")} disabled={Boolean(downloading)} className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-bold text-sky-700 disabled:opacity-60 dark:bg-sky-500/10 dark:text-sky-300">{downloading === "faculty-nameplate" ? "Preparing..." : "Nameplate DOCX"}</button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <h2 className="font-black text-slate-950 dark:text-white">Document Information</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SelectField label="Semester" value={routine.semester} onChange={(value) => { updateRoutine({ semester: value }); setShowRuleCheck(true); }} options={semesterOptions} />
            <SelectField label="Year" value={routine.year} onChange={(value) => { updateRoutine({ year: Number(value) }); setShowRuleCheck(true); }} options={yearOptions} />
          </div>
          <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 dark:text-slate-300">
            <p><b>Faculty:</b> {routine.facultyName || "Not set in profile"}</p>
            <p><b>Faculty Code:</b> {routine.facultyCode || "Not set in profile"}</p>
            <p><b>Designation:</b> {routine.designation || "Not set in profile"}</p>
            <p><b>Email:</b> {routine.facultyEmail || "Not set in profile"}</p>
            <p><b>Phone:</b> {routine.facultyPhone || "Not set in profile"}</p>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-black text-slate-950 dark:text-white">Working Days</h2>
              <p className="text-xs text-slate-500">Select exactly five. The others become OFF automatically.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${routine.workingDays.length === 5 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{routine.workingDays.length}/5</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {routine.days.map((day) => {
              const selected = routine.workingDays.includes(day);
              return <button key={day} type="button" onClick={() => toggleWorkingDay(day)} className={`rounded-xl border px-3 py-2 text-sm font-bold ${selected ? "border-violet-400 bg-violet-600 text-white" : "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-900"}`}>{DAY_LABELS[day]}</button>;
            })}
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-black text-slate-950 dark:text-white">What are you filling?</h2>
            <p className="text-xs text-slate-500">Select one tool, then click one or more routine slots.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300">Selected: {ACTIVITY_TYPES.find((item) => item.id === selectedTool)?.label}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {ACTIVITY_TYPES.map((activity) => (
            <button key={activity.id} type="button" onClick={() => setSelectedTool(activity.id)} className={`min-h-16 rounded-xl border px-3 py-2 text-sm font-black transition ${selectedTool === activity.id ? "border-violet-500 bg-violet-600 text-white shadow-md" : activity.id === "CLEAR" ? "border-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}>
              <span className="block">{activity.shortLabel}</span>
              {activity.required && <span className="mt-1 block text-[10px] opacity-75">Weekly {activity.required}</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-black text-slate-950 dark:text-white">Weekly Routine</h2>
            <p className="text-xs text-slate-500">All university Day and Evening schedules are stored. P&L is fixed from 12:45 PM to 01:15 PM.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 p-1 dark:border-slate-700">
              {["All", "Day", "Evening"].map((view) => (
                <button key={view} type="button" onClick={() => setScheduleView(view)} className={`rounded-lg px-3 py-1.5 text-xs font-black ${scheduleView === view ? "bg-violet-600 text-white" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"}`}>{view}</button>
              ))}
            </div>
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">{summary.totalWorkingHours} hours</span>
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-max border-collapse text-center">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-900">
                <th className="sticky left-0 z-20 min-w-32 border-b border-r border-slate-200 bg-slate-100 p-3 text-xs font-black dark:border-slate-700 dark:bg-slate-900">Day</th>
                {tableColumns.map((column) => column.kind === "lunch" ? (
                  <th key={column.id} className="min-w-24 border-b border-r border-slate-200 bg-amber-100 p-3 text-xs font-black text-amber-800 dark:border-slate-700 dark:bg-amber-500/10 dark:text-amber-300">P&L<br /><span className="font-medium">12:45-01:15</span></th>
                ) : <SlotHeader key={column.slot.id} slot={column.slot} />)}
              </tr>
            </thead>
            <tbody>
              {routine.days.map((day) => {
                const working = routine.workingDays.includes(day);
                return (
                  <tr key={day}>
                    <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white p-3 text-sm font-black dark:border-slate-700 dark:bg-slate-950">{DAY_LABELS[day]}</th>
                    {tableColumns.map((column) => column.kind === "lunch" ? (
                      <td key={column.id} className={`border-b border-r border-slate-200 p-2 text-sm font-black dark:border-slate-700 ${working ? "bg-amber-50 text-amber-700 dark:bg-amber-500/5 dark:text-amber-300" : "bg-slate-200 text-slate-500 dark:bg-slate-900"}`}>{working ? "P&L" : "OFF"}</td>
                    ) : (
                      <RoutineButton key={column.slot.id} day={day} slot={column.slot} working={working} available={isSlotAvailableForDay(column.slot, day)} entry={routine.entries?.[day]?.[column.slot.id]} onClick={handleCellClick} />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-black text-slate-950 dark:text-white">Weekly Rule Check</h2>
              <p className="text-xs text-slate-500">Opens automatically when you add or change a slot. Saving keeps incomplete work as a draft.</p>
            </div>
            <button type="button" onClick={() => setShowRuleCheck((value) => !value)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black dark:border-slate-700">
              {showRuleCheck ? "Hide" : validation.isValid ? "View" : `View (${validation.errors.length})`}
            </button>
          </div>
          {showRuleCheck && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <RuleCard label="Working Hours" value={`${summary.totalWorkingHours}/35`} good={summary.totalWorkingHours >= 35} />
                <RuleCard label="Working Days" value={`${routine.workingDays.length}/5`} good={routine.workingDays.length === 5} />
                {Object.entries(ACTIVITY_REQUIREMENTS).map(([type, rule]) => <RuleCard key={type} label={rule.label} value={`${summary.counts[type] || 0}/${rule.required}`} good={(summary.counts[type] || 0) === rule.required} />)}
              </div>
              {validation.errors.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  {validation.errors.slice(0, 8).map((item) => <p key={item}>• {item}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-black text-slate-950 dark:text-white">University Schedule & Room Directory</h2>
              <p className="text-xs text-slate-500">The official directory is shared for every teacher. Custom additions remain available in your saved routine.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => window.open("/routine-reference", "_blank", "noopener,noreferrer")} className="rounded-xl border border-sky-200 px-4 py-2 text-xs font-black text-sky-700 dark:border-sky-500/30 dark:text-sky-300">Public View</button>
              <button type="button" onClick={() => setShowSettings((value) => !value)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black dark:border-slate-700">{showSettings ? "Hide" : "Manage"}</button>
            </div>
          </div>
          {showSettings && (
            <div className="mt-5 space-y-5 border-t border-slate-200 pt-5 dark:border-slate-800">
              <div>
                <div>
                  <h3 className="text-sm font-black">Room Directory <span className="text-slate-400">({routine.rooms.length})</span></h3>
                  <p className="text-xs text-slate-500">Choose the building and room type first, then view the matching room numbers.</p>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <select value={directoryBuilding} onChange={(event) => { setDirectoryBuilding(event.target.value); setDirectoryRoomType(""); }} className="routine-select rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    <option value="">All buildings</option>
                    {buildingOptions.map((building) => <option key={building} value={building}>{building}</option>)}
                  </select>
                  <select value={directoryRoomType} onChange={(event) => setDirectoryRoomType(event.target.value)} className="routine-select rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    <option value="">All room types</option>
                    {directoryRoomTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                  <input value={roomSearch} onChange={(event) => setRoomSearch(event.target.value)} placeholder="Room number or keyword" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  <select value={newRoom.buildingName} onChange={(event) => setNewRoom((previous) => ({ ...previous, buildingName: event.target.value }))} className="routine-select rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    <option value="">Select building</option>
                    {buildingOptions.map((building) => <option key={building} value={building}>{building}</option>)}
                  </select>
                  <input value={newRoom.roomNo} onChange={(event) => setNewRoom((previous) => ({ ...previous, roomNo: event.target.value }))} placeholder="Room number" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
                  <select value={newRoom.roomTitle} onChange={(event) => setNewRoom((previous) => ({ ...previous, roomTitle: event.target.value }))} className="routine-select rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    {["Theory", "Computing Lab", "Hardware Lab", "Engineering Lab", "Science Lab", "Drawing Lab", "Common Lab"].map((title) => <option key={title} value={title}>{title}</option>)}
                  </select>
                  <input type="number" min="0" value={newRoom.liftLevel} onChange={(event) => setNewRoom((previous) => ({ ...previous, liftLevel: event.target.value }))} placeholder="Lift level" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
                  <button type="button" onClick={addRoom} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white dark:bg-white dark:text-slate-950">Add Room</button>
                </div>
                <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900"><tr><th className="p-2">Room</th><th className="p-2">Type</th><th className="p-2">Building</th><th className="p-2">Lift</th><th className="p-2 text-right">Action</th></tr></thead>
                    <tbody>{filteredRooms.length ? filteredRooms.map((room) => <tr key={roomKey(room)} className="border-t border-slate-200 dark:border-slate-800"><td className="p-2 font-black">{room.roomNo}</td><td className="p-2">{room.roomTitle || "—"}</td><td className="p-2">{room.buildingName || "—"}</td><td className="p-2">{room.liftLevel ?? "—"}</td><td className="p-2 text-right"><button type="button" onClick={() => removeRoom(room)} className="rounded-lg border border-rose-200 px-2 py-1 font-black text-rose-600">Delete</button></td></tr>) : <tr><td colSpan="5" className="p-5 text-center text-slate-500">No rooms match the selected building and type.</td></tr>}</tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-black">Displayed Days</h3>
                <div className="mt-2 flex flex-wrap gap-2">{routine.days.map((day) => <span key={day} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-bold dark:border-slate-700">{DAY_LABELS[day]}<button type="button" onClick={() => removeDay(day)} className="text-rose-500">×</button></span>)}{missingDays.map((item) => <button key={item.id} type="button" onClick={() => addDay(item.id)} className="rounded-full border border-dashed border-violet-300 px-3 py-1 text-xs font-bold text-violet-700 dark:text-violet-300">+ {item.label}</button>)}</div>
              </div>
              <div>
                <h3 className="text-sm font-black">Official Time Slots</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">{OFFICIAL_TIME_SLOTS.map((slot) => <div key={slot.id} className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700"><b>{slot.label}</b><span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-900">{slot.shift}</span></div>)}<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"><b>{PRAYER_LUNCH.label}</b> · Fixed P&L</div></div>
              </div>
            </div>
          )}
        </div>
      </section>

      {classTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4" onMouseDown={(event) => event.target === event.currentTarget && setClassTarget(null)}>
          <div className="w-full max-w-xl rounded-[1.5rem] bg-white p-5 shadow-2xl dark:bg-slate-950">
            <h2 className="text-xl font-black text-slate-950 dark:text-white">Add Class</h2>
            <p className="mt-1 text-sm text-slate-500">{DAY_LABELS[classTarget.day]} · {SLOT_MAP[classTarget.slotId]?.label}</p>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-bold">Course
                <select value={classForm.courseId} onChange={(event) => handleCourseSelection(event.target.value)} className="routine-select mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  <option value="">Select course</option>
                  {modalCourses.map((course) => <option key={courseKey(course)} value={courseKey(course)}>{course.code} — {course.title} · {course.intake}/{course.section} · {course.courseType} · {course.shift || "Any shift"}</option>)}
                </select>
              </label>
              {modalCourses.length === 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">No {SLOT_MAP[classTarget.slotId]?.shift} course matches {routine.semester} {routine.year}. Change semester/year, choose another shift slot, or create the course first.</p>}
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm font-bold">Building
                  <select value={classForm.buildingName} onChange={(event) => setClassForm((previous) => ({ ...previous, buildingName: event.target.value, roomTitle: "", room: "" }))} className="routine-select mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    <option value="">Select building</option>
                    {buildingOptions.map((building) => <option key={building} value={building}>{building}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-bold">Room Type
                  <select value={classForm.roomTitle} onChange={(event) => setClassForm((previous) => ({ ...previous, roomTitle: event.target.value, room: "" }))} disabled={!classForm.buildingName} className="routine-select mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    <option value="">Select type</option>
                    {classRoomTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-bold">Room Number
                  <select value={classForm.room} onChange={(event) => setClassForm((previous) => ({ ...previous, room: event.target.value }))} disabled={!classForm.buildingName || !classForm.roomTitle} className="routine-select mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    <option value="">Select room</option>
                    {roomOptions.map((room) => <option key={roomKey(room)} value={roomKey(room)}>{room.roomNo} · Lift {room.liftLevel ?? "—"}</option>)}
                  </select>
                </label>
              </div>
              {selectedCourse?.courseType === "lab" && <p className="rounded-xl bg-violet-50 p-3 text-xs font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">Lab course: the next valid slot is filled automatically. A special split across two days requires confirmation.</p>}
            </div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setClassTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold dark:border-slate-700">Cancel</button><button type="button" onClick={saveClassToGrid} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white">Add Class</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function SlotHeader({ slot }) {
  return <th className="min-w-40 border-b border-r border-slate-200 p-3 text-xs font-black dark:border-slate-700"><span className="block">{slot.label}</span><span className="mt-1 inline-block rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">{slot.shift}</span></th>;
}

function RoutineButton({ day, slot, working, available, entry, onClick }) {
  const enabled = working && available;
  return (
    <td className={`border-b border-r border-slate-200 p-2 dark:border-slate-700 ${enabled ? "bg-white dark:bg-slate-950" : "bg-slate-200 dark:bg-slate-900"}`}>
      <button
        type="button"
        onClick={() => onClick(day, slot.id)}
        disabled={!enabled}
        className={`min-h-20 w-full whitespace-pre-line rounded-xl border px-2 py-2 text-xs font-black transition ${!enabled ? "cursor-not-allowed border-transparent text-slate-500" : entry?.type === "CLASS" ? "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-300" : entry ? "border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300" : "border-dashed border-slate-200 text-slate-300 hover:border-violet-300 hover:text-violet-500 dark:border-slate-700"}`}
      >
        {!working ? "OFF" : !available ? "Not used" : entryLabel(entry) || "+"}
      </button>
    </td>
  );
}

function RuleCard({ label, value, good }) {
  return <div className={`rounded-xl border p-3 ${good ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10" : "border-rose-200 bg-rose-50 dark:bg-rose-500/10"}`}><p className="text-[11px] font-bold text-slate-500">{label}</p><p className={`mt-1 text-lg font-black ${good ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>{value}</p></div>;
}

function SelectField({ label, value, onChange, options }) {
  return <label className="text-xs font-bold text-slate-600 dark:text-slate-300">{label}<select value={value || ""} onChange={(event) => onChange(event.target.value)} className="routine-select mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><option value="">Select</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

export default TeacherRoutineBuilderPage;
