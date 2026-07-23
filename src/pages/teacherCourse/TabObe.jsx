import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { saveAs } from "file-saver";

import {
  getObeSetup,
  saveObeSetup,
  getObeBlueprints,
  createObeBlueprint,
  updateObeBlueprint,
  deleteObeBlueprint,
  getObeMarks,
  saveObeMarks,
  getObeOutput,
  getObeExportPayload,
  downloadObeCrr,
  reuseObeData,
} from "../../services/obeService";
import { fetchTeacherCourses } from "../../services/courseService";

import { exportObeWorkbook } from "../../utils/obeWorkbookExport";
import { parseObeImportedMarkWorkbook } from "../../utils/obeWorkbookImport";
import { getAuthItem } from "../../utils/authStorage";

const defaultLevels = [
  { min: 70, max: 100, level: 4 },
  { min: 60, max: 69.99, level: 3 },
  { min: 50, max: 59.99, level: 2 },
  { min: 40, max: 49.99, level: 1 },
  { min: 0, max: 39.99, level: 0 },
];

const emptySetup = {
  thresholdPercent: 40,
  courseOutcomes: [{ code: "CO1", statement: "", order: 0 }],
  poStatements: [{ code: "PO1", statement: "", order: 0 }],
  psoStatements: [],
  mappings: [],
  attainmentLevels: defaultLevels,
  notes: "",
};

const emptyBlueprint = {
  assessmentName: "",
  assessmentType: "ct",
  totalMarks: 0,
  // order: 0,
  notes: "",
  items: [{ key: "q1", label: "Q1", marks: 0, coCode: "", order: 0 }],
};

const toast = (icon, title) =>
  Swal.fire({
    toast: true,
    position: "top-end",
    icon,
    title,
    showConfirmButton: false,
    timer: 1800,
  });

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;


const getCourseType = (course = {}) => {
  const type = String(course.courseType || course.type || "").toLowerCase();
  if (type === "hybrid") return "hybrid";
  if (type.includes("lab")) return "lab";
  return "theory";
};

const assessmentTypeOrder = {
  ct: 1,
  assignment: 2,
  mid: 3,
  final: 4,
  attendance: 5,
};

const assessmentTypeLabel = {
  ct: "CT",
  assignment: "Assignment",
  mid: "Mid Term",
  final: "Final",
  attendance: "Attendance",
};


const labAssessmentTypeLabel = {
  mid: "Lab Mid",
  final: "Lab Final",
};

const getAssessmentTypeLabel = (type, isLabCourse = false) =>
  (isLabCourse ? labAssessmentTypeLabel[type] : null) ||
  assessmentTypeLabel[type] ||
  String(type || "").toUpperCase();

const getExpectedLabAssessmentMarks = (type) => {
  if (type === "mid") return 30;
  if (type === "final") return 40;
  return 0;
};

const createEmptyBlueprintForm = (isLabCourse, coCode = "") => {
  const assessmentType = isLabCourse ? "mid" : "ct";
  const totalMarks = isLabCourse
    ? getExpectedLabAssessmentMarks(assessmentType)
    : 0;

  return {
    ...emptyBlueprint,
    assessmentType,
    totalMarks,
    items: [
      {
        ...emptyBlueprint.items[0],
        marks: totalMarks,
        coCode,
      },
    ],
  };
};

const sortBlueprints = (list = []) =>
  [...list].sort((a, b) => {
    const orderA = assessmentTypeOrder[a.assessmentType] || 999;
    const orderB = assessmentTypeOrder[b.assessmentType] || 999;

    if (orderA !== orderB) return orderA - orderB;

    return String(a.assessmentName || "").localeCompare(
      String(b.assessmentName || ""),
      undefined,
      { numeric: true }
    );
  });

const formatReuseCourseLabel = (courseItem = {}) => {
  const parts = [
    courseItem.code || "Course",
    courseItem.intake ? `Intake ${courseItem.intake}` : "",
    courseItem.section ? `Section ${courseItem.section}` : "",
    [courseItem.semester, courseItem.year].filter(Boolean).join(" "),
    courseItem.shift || "",
  ].filter(Boolean);

  return `${parts.join(" · ")}${courseItem.archived ? " · Archived" : ""}`;
};

const getReuseSemesterKey = (courseItem = {}) => {
  const semester = String(courseItem.semester || "").trim().toLowerCase();
  const year = String(courseItem.year || "").trim();

  if (!semester && !year) return "unspecified";
  return `${semester}__${year}`;
};

const formatReuseSemesterLabel = (courseItem = {}) =>
  [courseItem.semester, courseItem.year].filter(Boolean).join(" ") ||
  "Semester not specified";

const reuseSemesterRank = {
  spring: 1,
  summer: 2,
  fall: 3,
};

export default function TabObe({ courseId, course }) {
  const courseType = getCourseType(course);
  const isLabCourse = courseType === "lab";
  const availableAssessmentTypes = isLabCourse
    ? ["mid", "final"]
    : ["ct", "assignment", "mid", "final", "attendance"];

  const [activeSubtab, setActiveSubtab] = useState("setup");

  const [setup, setSetup] = useState(emptySetup);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupSaving, setSetupSaving] = useState(false);

  const [blueprints, setBlueprints] = useState([]);
  const [blueprintsLoading, setBlueprintsLoading] = useState(true);
  const [blueprintForm, setBlueprintForm] = useState(() =>
    createEmptyBlueprintForm(isLabCourse)
  );
  const [editingBlueprintId, setEditingBlueprintId] = useState(null);
  const [blueprintSaving, setBlueprintSaving] = useState(false);

  const [markStudents, setMarkStudents] = useState([]);
  const [markBlueprints, setMarkBlueprints] = useState([]);
  const [markDraft, setMarkDraft] = useState({});
  const [markLoading, setMarkLoading] = useState(true);
  const [markSaving, setMarkSaving] = useState(false);
  const [obeTabMode, setObeTabMode] = useState("row");
  const [obeSortMode, setObeSortMode] = useState("entered");
  const [obeStudentSearch, setObeStudentSearch] = useState("");

  const obeInputRefs = useRef([]);

  const [outputData, setOutputData] = useState(null);
  const [outputLoading, setOutputLoading] = useState(false);

  const [reusePanelOpen, setReusePanelOpen] = useState(false);
  const [reuseCourses, setReuseCourses] = useState([]);
  const [reuseCoursesLoading, setReuseCoursesLoading] = useState(false);
  const [reuseSemesterFilter, setReuseSemesterFilter] = useState("all");
  const [reuseSourceCourseId, setReuseSourceCourseId] = useState("");
  const [reuseCopySetup, setReuseCopySetup] = useState(true);
  const [reuseCopyBlueprints, setReuseCopyBlueprints] = useState(true);
  const [reuseBlueprintMode, setReuseBlueprintMode] = useState("skip_duplicates");
  const [reuseSaving, setReuseSaving] = useState(false);

  const coOptions = useMemo(
    () => (setup.courseOutcomes || []).filter((row) => row.code?.trim()),
    [setup.courseOutcomes]
  );

  const reuseSemesterOptions = useMemo(() => {
    const uniqueSemesters = new Map();

    for (const item of reuseCourses) {
      const key = getReuseSemesterKey(item);
      if (!uniqueSemesters.has(key)) {
        uniqueSemesters.set(key, {
          key,
          label: formatReuseSemesterLabel(item),
          semester: String(item.semester || "").trim(),
          year: Number(item.year || 0),
        });
      }
    }

    return [...uniqueSemesters.values()].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;

      const aRank = reuseSemesterRank[a.semester.toLowerCase()] || 0;
      const bRank = reuseSemesterRank[b.semester.toLowerCase()] || 0;
      if (aRank !== bRank) return bRank - aRank;

      return a.label.localeCompare(b.label, undefined, { numeric: true });
    });
  }, [reuseCourses]);

  const filteredReuseCourses = useMemo(
    () =>
      reuseSemesterFilter === "all"
        ? reuseCourses
        : reuseCourses.filter(
            (item) => getReuseSemesterKey(item) === reuseSemesterFilter
          ),
    [reuseCourses, reuseSemesterFilter]
  );

  useEffect(() => {
    setEditingBlueprintId(null);
    setBlueprintForm(createEmptyBlueprintForm(isLabCourse));
  }, [courseId, isLabCourse]);

  useEffect(() => {
    loadSetup();
    loadBlueprints();
    loadMarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => {
    loadReuseCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, course?.code, course?.semester, course?.year]);

  useEffect(() => {
    if (activeSubtab === "output") {
      loadOutput();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubtab]);

  useEffect(() => {
    setReuseSourceCourseId((previous) =>
      filteredReuseCourses.some((item) => item.id === previous)
        ? previous
        : filteredReuseCourses[0]?.id || ""
    );
  }, [filteredReuseCourses]);

  const loadSetup = async () => {
    try {
      setSetupLoading(true);
      const data = await getObeSetup(courseId);

      setSetup({
        thresholdPercent: data?.thresholdPercent ?? 40,
        courseOutcomes: data?.courseOutcomes?.length
          ? data.courseOutcomes
          : emptySetup.courseOutcomes,
        poStatements: data?.poStatements?.length
          ? data.poStatements
          : emptySetup.poStatements,
        psoStatements: data?.psoStatements || [],
        mappings: data?.mappings || [],
        attainmentLevels: data?.attainmentLevels?.length
          ? data.attainmentLevels
          : defaultLevels,
        notes: data?.notes || "",
      });
    } catch (error) {
      console.error(error);
      toast("error", error?.response?.data?.message || "Failed to load OBE setup.");
    } finally {
      setSetupLoading(false);
    }
  };

  const loadBlueprints = async () => {
    try {
      setBlueprintsLoading(true);
      const data = await getObeBlueprints(courseId);
      setBlueprints(sortBlueprints(Array.isArray(data) ? data : []));
    } catch (error) {
      console.error(error);
      toast("error", error?.response?.data?.message || "Failed to load OBE blueprints.");
    } finally {
      setBlueprintsLoading(false);
    }
  };

  const loadMarks = async () => {
    try {
      setMarkLoading(true);
      const data = await getObeMarks(courseId);

      const students = Array.isArray(data?.students) ? data.students : [];
      const loadedBlueprints = sortBlueprints(
        Array.isArray(data?.blueprints) ? data.blueprints : []
      );
      const marks = Array.isArray(data?.marks) ? data.marks : [];

      const draft = {};

      for (const student of students) {
        for (const blueprint of loadedBlueprints) {
          const key = `${student.studentId}__${blueprint._id}`;
          draft[key] = {};

          for (const item of blueprint.items || []) {
            draft[key][item.key] = "";
          }
        }
      }

      for (const mark of marks) {
        const key = `${mark.student}__${mark.blueprint}`;
        if (!draft[key]) draft[key] = {};

        for (const entry of mark.entries || []) {
          draft[key][entry.itemKey] = entry.obtainedMarks;
        }
      }

      setMarkStudents(students);
      setMarkBlueprints(loadedBlueprints);
      setMarkDraft(draft);
    } catch (error) {
      console.error(error);
      toast("error", error?.response?.data?.message || "Failed to load OBE marks.");
    } finally {
      setMarkLoading(false);
    }
  };

  const loadOutput = async () => {
    try {
      setOutputLoading(true);
      const data = await getObeOutput(courseId);
      setOutputData(data);
    } catch (error) {
      console.error(error);
      toast("error", error?.response?.data?.message || "Failed to load OBE output.");
    } finally {
      setOutputLoading(false);
    }
  };

  const loadReuseCourses = async () => {
    try {
      setReuseCoursesLoading(true);

      const [activeCourses, archivedCourses] = await Promise.all([
        fetchTeacherCourses(),
        fetchTeacherCourses({ archived: true }),
      ]);

      const uniqueCourses = new Map();

      [...(activeCourses || []), ...(archivedCourses || [])].forEach((item) => {
        const itemId = String(item?.id || item?._id || "");
        if (!itemId || itemId === String(courseId)) return;
        uniqueCourses.set(itemId, { ...item, id: itemId });
      });

      const targetCode = String(course?.code || "").trim().toUpperCase();
      const candidates = [...uniqueCourses.values()].sort((a, b) => {
        const aSameCode = String(a.code || "").trim().toUpperCase() === targetCode ? 1 : 0;
        const bSameCode = String(b.code || "").trim().toUpperCase() === targetCode ? 1 : 0;

        if (aSameCode !== bSameCode) return bSameCode - aSameCode;

        const yearDifference = Number(b.year || 0) - Number(a.year || 0);
        if (yearDifference !== 0) return yearDifference;

        return formatReuseCourseLabel(a).localeCompare(
          formatReuseCourseLabel(b),
          undefined,
          { numeric: true }
        );
      });

      setReuseCourses(candidates);
      setReuseSemesterFilter((previous) => {
        const availableSemesterKeys = new Set(
          candidates.map((item) => getReuseSemesterKey(item))
        );

        if (previous !== "all" && availableSemesterKeys.has(previous)) {
          return previous;
        }

        const targetSemesterKey = getReuseSemesterKey(course || {});
        return availableSemesterKeys.has(targetSemesterKey)
          ? targetSemesterKey
          : "all";
      });
    } catch (error) {
      console.error(error);
      toast(
        "error",
        error?.response?.data?.message || "Failed to load courses for OBE reuse."
      );
    } finally {
      setReuseCoursesLoading(false);
    }
  };

  const handleReuseObeData = async () => {
    if (!reuseSourceCourseId) {
      toast("error", "Please select a source course.");
      return;
    }

    if (!reuseCopySetup && !reuseCopyBlueprints) {
      toast("error", "Select OBE setup, assessment blueprints, or both.");
      return;
    }

    const sourceCourse = reuseCourses.find(
      (item) => String(item.id) === String(reuseSourceCourseId)
    );

    const selectedParts = [
      reuseCopySetup ? "OBE setup" : "",
      reuseCopyBlueprints ? "assessment blueprints" : "",
    ].filter(Boolean);

    const replacementWarning =
      reuseCopyBlueprints && reuseBlueprintMode === "replace"
        ? " Existing target blueprints and all current OBE marks will be cleared first."
        : " Existing blueprint names will be kept and matching names will be skipped.";

    const confirmation = await Swal.fire({
      title: "Reuse OBE data?",
      text: `Copy ${selectedParts.join(" and ")} from ${
        sourceCourse ? formatReuseCourseLabel(sourceCourse) : "the selected course"
      }.${reuseCopyBlueprints ? replacementWarning : " The current setup will be replaced."}`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Copy selected data",
      confirmButtonColor: "#4f46e5",
    });

    if (!confirmation.isConfirmed) return;

    try {
      setReuseSaving(true);

      const response = await reuseObeData(courseId, {
        sourceCourseId: reuseSourceCourseId,
        copySetup: reuseCopySetup,
        copyBlueprints: reuseCopyBlueprints,
        blueprintMode: reuseBlueprintMode,
      });

      const result = response?.result || {};
      const summary = [];

      if (result.copiedSetup) summary.push("OBE setup copied.");
      if (reuseCopyBlueprints) {
        summary.push(`${result.copiedBlueprintCount || 0} blueprint(s) copied.`);
      }
      if (result.skippedBlueprintCount) {
        summary.push(`${result.skippedBlueprintCount} duplicate blueprint(s) skipped.`);
      }
      if (result.clearedMarkCount) {
        summary.push(`${result.clearedMarkCount} old OBE mark record(s) cleared.`);
      }

      await Promise.all([loadSetup(), loadBlueprints(), loadMarks()]);
      setOutputData(null);
      setEditingBlueprintId(null);
      setBlueprintForm(createEmptyBlueprintForm(isLabCourse));
      setReusePanelOpen(false);

      Swal.fire(
        "OBE data reused",
        summary.join(" ") || "Selected OBE data copied successfully.",
        "success"
      );
    } catch (error) {
      console.error(error);
      Swal.fire(
        "Unable to reuse OBE data",
        error?.response?.data?.message || "Failed to copy the selected OBE data.",
        "error"
      );
    } finally {
      setReuseSaving(false);
    }
  };

  const updateArrayRow = (field, index, key, value) => {
    setSetup((prev) => ({
      ...prev,
      [field]: (prev[field] || []).map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row
      ),
    }));
  };

  const addArrayRow = (field, prefix) => {
    setSetup((prev) => ({
      ...prev,
      [field]: [
        ...(prev[field] || []),
        {
          code: `${prefix}${(prev[field] || []).length + 1}`,
          statement: "",
          order: (prev[field] || []).length,
        },
      ],
    }));
  };

  const removeArrayRow = (field, index) => {
    setSetup((prev) => ({
      ...prev,
      [field]: (prev[field] || []).filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  // const addMappingRow = () => {
  //   setSetup((prev) => ({
  //     ...prev,
  //     mappings: [
  //       ...(prev.mappings || []),
  //       { coCode: "", targetType: "PO", targetCode: "", strength: 1 },
  //     ],
  //   }));
  // };

const addMappingRow = () => {
  setSetup((prev) => ({
    ...prev,
    mappings: [
      ...(prev.mappings || []),
      {
        coCode: "",
        targetType: "PO",
        targetCode: "",
        strength: 1,
      },
    ],
  }));
};

  const updateMappingRow = (index, key, value) => {
    setSetup((prev) => ({
      ...prev,
      mappings: (prev.mappings || []).map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row
      ),
    }));
  };

  const removeMappingRow = (index) => {
    setSetup((prev) => ({
      ...prev,
      mappings: (prev.mappings || []).filter((_, rowIndex) => rowIndex !== index),
    }));
  };

const saveSetup = async () => {
  try {
    setSetupSaving(true);

    const cleanedMappings = (setup.mappings || [])
      .map((row) => ({
        coCode: String(row.coCode || "").trim().toUpperCase(),
        targetType: "PO",
        targetCode: String(row.targetCode || "").trim().toUpperCase(),
        strength: Number(row.strength || 1),
      }))
      .filter((row) => row.coCode && row.targetCode);

    const payload = {
      ...setup,
      mappings: cleanedMappings,
    };

    await saveObeSetup(courseId, payload);

    toast("success", "OBE setup saved successfully.");
    await Promise.all([loadSetup(), loadMarks()]);
  } catch (error) {
    console.error(error);
    toast("error", error?.response?.data?.message || "Failed to save OBE setup.");
  } finally {
    setSetupSaving(false);
  }
};

  const updateBlueprintRow = (index, key, value) => {
    setBlueprintForm((prev) => ({
      ...prev,
      items: prev.items.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row
      ),
    }));
  };

  const addBlueprintRow = () => {
    setBlueprintForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          key: `q${prev.items.length + 1}`,
          label: `Q${prev.items.length + 1}`,
          marks: 0,
          coCode: coOptions[0]?.code || "",
          order: prev.items.length,
        },
      ],
    }));
  };

  const removeBlueprintRow = (index) => {
    setBlueprintForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const resetBlueprintForm = () => {
    setEditingBlueprintId(null);
    setBlueprintForm(
      createEmptyBlueprintForm(isLabCourse, coOptions[0]?.code || "")
    );
  };

  const saveBlueprint = async () => {
    try {
      setBlueprintSaving(true);

      if (editingBlueprintId) {
        await updateObeBlueprint(courseId, editingBlueprintId, blueprintForm);
        toast("success", "Blueprint updated successfully.");
      } else {
        await createObeBlueprint(courseId, blueprintForm);
        toast("success", "Blueprint created successfully.");
      }

      resetBlueprintForm();
      await Promise.all([loadBlueprints(), loadMarks()]);
    } catch (error) {
      console.error(error);
      toast("error", error?.response?.data?.message || "Failed to save blueprint.");
    } finally {
      setBlueprintSaving(false);
    }
  };

  const startEditBlueprint = (blueprint) => {
    const expectedLabMarks = isLabCourse
      ? getExpectedLabAssessmentMarks(blueprint.assessmentType)
      : 0;
    const blueprintItems = (blueprint.items || []).map((item, index) => ({
      key: item.key,
      label: item.label,
      marks:
        isLabCourse &&
        expectedLabMarks &&
        (blueprint.items || []).length === 1 &&
        Number(item.marks || 0) === Number(blueprint.totalMarks || 0)
          ? expectedLabMarks
          : item.marks,
      coCode: item.coCode,
      order: item.order ?? index,
    }));

    setEditingBlueprintId(blueprint._id);
    setBlueprintForm({
      assessmentName: blueprint.assessmentName,
      assessmentType: blueprint.assessmentType,
      totalMarks: expectedLabMarks || blueprint.totalMarks,
      // order: blueprint.order || 0,
      notes: blueprint.notes || "",
      items: blueprintItems,
    });
    setActiveSubtab("blueprint");
  };

  const deleteBlueprint = async (blueprintId) => {
    const result = await Swal.fire({
      title: "Delete blueprint?",
      text: "This will remove the saved assessment blueprint.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) return;

    try {
      await deleteObeBlueprint(courseId, blueprintId);
      toast("success", "Blueprint deleted successfully.");
      await Promise.all([loadBlueprints(), loadMarks()]);

      if (editingBlueprintId === blueprintId) resetBlueprintForm();
    } catch (error) {
      console.error(error);
      toast("error", error?.response?.data?.message || "Failed to delete blueprint.");
    }
  };

  const handleDraftChange = (studentId, blueprintId, itemKey, rawValue, maxMarks) => {
    if (rawValue === "") {
      setMarkDraft((prev) => ({
        ...prev,
        [`${studentId}__${blueprintId}`]: {
          ...(prev[`${studentId}__${blueprintId}`] || {}),
          [itemKey]: "",
        },
      }));
      return;
    }

    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric)) return;

    const clamped = Math.max(0, Math.min(numeric, Number(maxMarks || 0)));

    setMarkDraft((prev) => ({
      ...prev,
      [`${studentId}__${blueprintId}`]: {
        ...(prev[`${studentId}__${blueprintId}`] || {}),
        [itemKey]: clamped,
      },
    }));
  };

  const getDraftValue = (studentId, blueprintId, itemKey) => {
    const key = `${studentId}__${blueprintId}`;
    return markDraft[key]?.[itemKey] ?? "";
  };

  const getAssessmentDraftTotal = (studentId, blueprint) => {
    return round2(
      (blueprint.items || []).reduce((sum, item) => {
        const val = Number(getDraftValue(studentId, blueprint._id, item.key) || 0);
        return sum + val;
      }, 0)
    );
  };

    const sortedMarkStudents = useMemo(() => {
    const base = [...markStudents];

    if (obeSortMode === "roll_asc") {
      return base.sort((a, b) =>
        String(a.roll || "").localeCompare(String(b.roll || ""), undefined, {
          numeric: true,
        })
      );
    }

    if (obeSortMode === "roll_desc") {
      return base.sort((a, b) =>
        String(b.roll || "").localeCompare(String(a.roll || ""), undefined, {
          numeric: true,
        })
      );
    }

    return base;
  }, [markStudents, obeSortMode]);

  const visibleMarkStudents = useMemo(() => {
    const query = obeStudentSearch.trim().toLowerCase();

    if (!query) return sortedMarkStudents;

    return sortedMarkStudents.filter((student) => {
      const roll = String(student.roll || "").toLowerCase();
      const name = String(student.name || "").toLowerCase();
      const email = String(student.email || "").toLowerCase();

      return roll.includes(query) || name.includes(query) || email.includes(query);
    });
  }, [sortedMarkStudents, obeStudentSearch]);

  const obeInputColumns = useMemo(() => {
    return markBlueprints.flatMap((blueprint) =>
      (blueprint.items || []).map((item) => ({
        blueprintId: blueprint._id,
        itemKey: item.key,
      }))
    );
  }, [markBlueprints]);

  const getObeInputColIndex = (blueprintId, itemKey) => {
    return obeInputColumns.findIndex(
      (column) =>
        String(column.blueprintId) === String(blueprintId) &&
        String(column.itemKey) === String(itemKey)
    );
  };

  const getObeFocusableCells = () => {
    const cells = [];

    obeInputRefs.current.forEach((rowRefs, rowIndex) => {
      if (!Array.isArray(rowRefs)) return;

      rowRefs.forEach((el, colIndex) => {
        if (!el || el.disabled) return;
        cells.push({ row: rowIndex, col: colIndex, el });
      });
    });

    return cells;
  };

  const focusObeCellByPosition = (row, col) => {
    const target = obeInputRefs.current?.[row]?.[col];

    if (!target || target.disabled) return false;

    target.focus();
    target.select?.();

    return true;
  };

  const moveObeTabFocus = (row, col, reverse = false) => {
    const focusableCells = getObeFocusableCells();

    if (!focusableCells.length) return;

    const orderedCells = [...focusableCells].sort((a, b) => {
      if (obeTabMode === "column") {
        if (a.col !== b.col) return a.col - b.col;
        return a.row - b.row;
      }

      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });

    const currentIndex = orderedCells.findIndex(
      (cell) => cell.row === row && cell.col === col
    );

    if (currentIndex === -1) return;

    const nextIndex = reverse ? currentIndex - 1 : currentIndex + 1;
    const nextCell = orderedCells[nextIndex];

    if (!nextCell) return;

    nextCell.el.focus();
    nextCell.el.select?.();
  };

  const handleObeKeyDown = (event) => {
    const row = Number(event.currentTarget.dataset.row);
    const col = Number(event.currentTarget.dataset.col);

    if (Number.isNaN(row) || Number.isNaN(col)) return;

    if (event.key === "Tab") {
      event.preventDefault();
      moveObeTabFocus(row, col, event.shiftKey);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      moveObeTabFocus(row, col, event.shiftKey);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusObeCellByPosition(row, col + 1);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusObeCellByPosition(row, col - 1);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusObeCellByPosition(row + 1, col);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusObeCellByPosition(row - 1, col);
    }
  };

  const saveMarks = async () => {
    try {
      setMarkSaving(true);

      const records = [];

      for (const student of markStudents) {
        for (const blueprint of markBlueprints) {
          records.push({
            studentId: student.studentId,
            blueprintId: blueprint._id,
            entries: (blueprint.items || []).map((item) => ({
              itemKey: item.key,
              obtainedMarks: Number(
                getDraftValue(student.studentId, blueprint._id, item.key) || 0
              ),
            })),
          });
        }
      }

      await saveObeMarks(courseId, { records });
      toast("success", "OBE marks saved successfully.");
      await loadOutput();
    } catch (error) {
      console.error(error);
      toast("error", error?.response?.data?.message || "Failed to save OBE marks.");
    } finally {
      setMarkSaving(false);
    }
  };

  const handleDownloadExcel = async () => {
    try {
      const payload = await getObeExportPayload(courseId);
      const safePart = (value, fallback) =>
        String(value || fallback)
          .trim()
          .replace(/[\\/:*?"<>|]+/g, "-")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^[-_.]+|[-_.]+$/g, "");

      const facultyShortCode =
        payload.course?.createdBy?.shortCode ||
        getAuthItem("marksPortalShortCode");

      const fileName =
        [
          safePart(payload.course?.code, "Course"),
          safePart(payload.course?.intake, "Intake"),
          safePart(payload.course?.section, "Section"),
          safePart(facultyShortCode, "Faculty"),
        ].join("_") + ".xlsm";

      const { blob, warnings = [] } = await exportObeWorkbook(payload);
      saveAs(blob, fileName);

      Swal.fire(
        warnings.length ? "Exported with warning" : "Done",
        warnings.length
          ? `The official BUBT workbook was exported. ${warnings.join(" ")}`
          : "The official BUBT OBE workbook was exported successfully.",
        warnings.length ? "warning" : "success"
      );
    } catch (error) {
      console.error(error);
      Swal.fire(
        "Error",
        error?.message ||
          error?.response?.data?.message ||
          "Failed to export the BUBT OBE workbook.",
        "error"
      );
    }
  };

  const handleImportExcel = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const records = await parseObeImportedMarkWorkbook(
        file,
        markStudents || [],
        markBlueprints || []
      );

      await saveObeMarks(courseId, { records });

      Swal.fire("Done", "OBE marks imported successfully.", "success");

      await loadMarks();

      if (activeSubtab === "output") {
        await loadOutput();
      }
    } catch (error) {
      console.error(error);
      Swal.fire(
        "Error",
        error?.message ||
        error?.response?.data?.message ||
        "Failed to import OBE workbook.",
        "error"
      );
    } finally {
      event.target.value = "";
    }
  };

  const handleDownloadCrr = async () => {
    try {
      const blob = await downloadObeCrr(courseId);
      saveAs(
        blob,
        `CRR_${course?.code || "Course"}_${course?.semester || "Semester"}_${course?.year || "Year"
        }.docx`
      );
      Swal.fire("Done", "Course Review Report downloaded.", "success");
    } catch (error) {
      console.error(error);
      Swal.fire(
        "Error",
        error?.response?.data?.message || "Failed to download CRR.",
        "error"
      );
    }
  };

  const targetCodeOptions = () => setup.poStatements || [];

  const groupedBlueprints = useMemo(() => {
    const groups = {};

    sortBlueprints(blueprints).forEach((blueprint) => {
      const type = blueprint.assessmentType || "custom";
      const label = getAssessmentTypeLabel(type, isLabCourse);

      if (!groups[type]) {
        groups[type] = {
          label,
          items: [],
        };
      }

      groups[type].items.push(blueprint);
    });

    return Object.entries(groups).sort(([typeA], [typeB]) => {
      return (assessmentTypeOrder[typeA] || 999) - (assessmentTypeOrder[typeB] || 999);
    });
  }, [blueprints, isLabCourse]);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-indigo-50/60 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              OBE / CO-PO Module
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Standalone OBE workspace for {course?.code} — setup, blueprint, mark entry, output, Excel, and CRR.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              ["setup", "Setup"],
              ["blueprint", "Assessment Blueprint"],
              ["marks", "OBE Mark Entry"],
              ["output", "OBE Output"],
              ["crr", "Excel / CRR"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSubtab(id)}
                className={[
                  "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
                  activeSubtab === id
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-indigo-200 bg-indigo-50/70 p-5 shadow-sm dark:border-indigo-500/20 dark:bg-indigo-500/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Reuse OBE Data from Another Course
            </h4>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Copy a previously saved setup, assessment breakdowns, or both. Marks from the source course are never copied.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setReusePanelOpen((previous) => !previous)}
            className={secondaryButtonClass}
          >
            {reusePanelOpen ? "Close" : "Reuse Data"}
          </button>
        </div>

        {reusePanelOpen && (
          <div className="mt-5 space-y-5 border-t border-indigo-200 pt-5 dark:border-indigo-500/20">
            <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.65fr)_minmax(0,1.35fr)]">
              <FormField label="Semester">
                <select
                  value={reuseSemesterFilter}
                  onChange={(event) => setReuseSemesterFilter(event.target.value)}
                  disabled={reuseCoursesLoading || reuseSaving || !reuseCourses.length}
                  className={inputClass}
                >
                  {!reuseCourses.length ? (
                    <option value="all">
                      {reuseCoursesLoading
                        ? "Loading semesters..."
                        : "No semester is available"}
                    </option>
                  ) : (
                    <>
                      <option value="all">All Semesters</option>
                      {reuseSemesterOptions.map((semesterOption) => (
                        <option key={semesterOption.key} value={semesterOption.key}>
                          {semesterOption.label}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </FormField>

              <FormField label="Source Course">
                <select
                  value={reuseSourceCourseId}
                  onChange={(event) => setReuseSourceCourseId(event.target.value)}
                  disabled={
                    reuseCoursesLoading ||
                    reuseSaving ||
                    !filteredReuseCourses.length
                  }
                  className={inputClass}
                >
                  {!filteredReuseCourses.length && (
                    <option value="">
                      {reuseCoursesLoading
                        ? "Loading your courses..."
                        : "No course is available for this semester"}
                    </option>
                  )}

                  {filteredReuseCourses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {formatReuseCourseLabel(item)}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <input
                  type="checkbox"
                  checked={reuseCopySetup}
                  onChange={(event) => setReuseCopySetup(event.target.checked)}
                  disabled={reuseSaving}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">
                    Copy OBE Setup
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                    Replaces COs, POs, CO-PO mappings, threshold, attainment rules, and setup notes.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <input
                  type="checkbox"
                  checked={reuseCopyBlueprints}
                  onChange={(event) => setReuseCopyBlueprints(event.target.checked)}
                  disabled={reuseSaving}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">
                    Copy Assessment Blueprints
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                    Copies assessment names, types, total marks, question items, and their CO mappings.
                  </span>
                </span>
              </label>
            </div>

            {reuseCopyBlueprints && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Existing Blueprint Handling
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <input
                      type="radio"
                      name="reuse-blueprint-mode"
                      value="skip_duplicates"
                      checked={reuseBlueprintMode === "skip_duplicates"}
                      onChange={(event) => setReuseBlueprintMode(event.target.value)}
                      disabled={reuseSaving}
                      className="mt-1 h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Keep current blueprints
                      </span>
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                        Copy only new assessment names and skip duplicates. This is the safer option.
                      </span>
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-rose-200 p-3 dark:border-rose-500/30">
                    <input
                      type="radio"
                      name="reuse-blueprint-mode"
                      value="replace"
                      checked={reuseBlueprintMode === "replace"}
                      onChange={(event) => setReuseBlueprintMode(event.target.value)}
                      disabled={reuseSaving}
                      className="mt-1 h-4 w-4 border-slate-300 text-rose-600 focus:ring-rose-500"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-rose-700 dark:text-rose-300">
                        Replace all target blueprints
                      </span>
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                        Clears existing target blueprints and their OBE mark records before copying.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-2xl bg-slate-100 p-4 text-xs leading-5 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Only OBE structure is reused. Enrolled students, regular assessment marks, and OBE marks are not copied from the source course.
              </span>

              <button
                type="button"
                onClick={handleReuseObeData}
                disabled={
                  reuseSaving ||
                  reuseCoursesLoading ||
                  !reuseSourceCourseId ||
                  (!reuseCopySetup && !reuseCopyBlueprints)
                }
                className={`${primaryButtonClass} shrink-0`}
              >
                {reuseSaving ? "Copying..." : "Copy Selected Data"}
              </button>
            </div>
          </div>
        )}
      </div>

      {activeSubtab === "setup" && (
        <div className="space-y-6">
          <SectionCard
            title="Threshold and Attainment Rules"
            subtitle="Store threshold percent and level rules used later in output and CRR."
          >
            {setupLoading ? (
              <div className="text-sm text-slate-500">Loading setup...</div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <FormField label="Threshold Percent">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={setup.thresholdPercent}
                    onChange={(e) =>
                      setSetup((prev) => ({
                        ...prev,
                        thresholdPercent: e.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </FormField>

                <FormField label="Notes">
                  <input
                    value={setup.notes}
                    onChange={(e) =>
                      setSetup((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    className={inputClass}
                    placeholder="Optional notes for this course OBE setup"
                  />
                </FormField>

                {/* <div className="lg:col-span-2">
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800/80">
                        <tr>
                          <HeaderCell>Min %</HeaderCell>
                          <HeaderCell>Max %</HeaderCell>
                          <HeaderCell>Level</HeaderCell>
                        </tr>
                      </thead>
                      <tbody>
                        {(setup.attainmentLevels || []).map((row, index) => (
                          <tr
                            key={`level-${index}`}
                            className="border-t border-slate-200 dark:border-slate-800"
                          >
                            <BodyCell>
                              <input
                                type="number"
                                value={row.min}
                                onChange={(e) => {
                                  const next = [...setup.attainmentLevels];
                                  next[index] = {
                                    ...next[index],
                                    min: e.target.value,
                                  };
                                  setSetup((prev) => ({
                                    ...prev,
                                    attainmentLevels: next,
                                  }));
                                }}
                                className={inputClass}
                              />
                            </BodyCell>

                            <BodyCell>
                              <input
                                type="number"
                                value={row.max}
                                onChange={(e) => {
                                  const next = [...setup.attainmentLevels];
                                  next[index] = {
                                    ...next[index],
                                    max: e.target.value,
                                  };
                                  setSetup((prev) => ({
                                    ...prev,
                                    attainmentLevels: next,
                                  }));
                                }}
                                className={inputClass}
                              />
                            </BodyCell>

                            <BodyCell>
                              <input
                                type="number"
                                value={row.level}
                                onChange={(e) => {
                                  const next = [...setup.attainmentLevels];
                                  next[index] = {
                                    ...next[index],
                                    level: e.target.value,
                                  };
                                  setSetup((prev) => ({
                                    ...prev,
                                    attainmentLevels: next,
                                  }));
                                }}
                                className={inputClass}
                              />
                            </BodyCell>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div> */}
              </div>
            )}
          </SectionCard>

          <OutcomeBlock
            title="Course Outcomes (CO)"
            rows={setup.courseOutcomes}
            onAdd={() => addArrayRow("courseOutcomes", "CO")}
            onRemove={(index) => removeArrayRow("courseOutcomes", index)}
            onChange={(index, key, value) =>
              updateArrayRow("courseOutcomes", index, key, value)
            }
          />

          <OutcomeBlock
            title="Program Outcomes (PO)"
            rows={setup.poStatements}
            onAdd={() => addArrayRow("poStatements", "PO")}
            onRemove={(index) => removeArrayRow("poStatements", index)}
            onChange={(index, key, value) =>
              updateArrayRow("poStatements", index, key, value)
            }
          />
          {/*          <OutcomeBlock
            title="Program Specific Outcomes (PSO)"
            rows={setup.psoStatements}
            onAdd={() => addArrayRow("psoStatements", "PSO")}
            onRemove={(index) => removeArrayRow("psoStatements", index)}
            onChange={(index, key, value) =>
              updateArrayRow("psoStatements", index, key, value)
            }
          /> */}

          <SectionCard
            title="CO to PO Mapping"
            subtitle="Map each Course Outcome with Program Outcomes."
          >
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={addMappingRow}
                  className={secondaryButtonClass}
                >
                  Add Mapping
                </button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/80">
                    <tr>
                      <HeaderCell>CO</HeaderCell>
                      {/* <HeaderCell>Target Type</HeaderCell> */}
                      <HeaderCell>Target Code</HeaderCell>
                      {/* <HeaderCell>Strength</HeaderCell> */}
                      <HeaderCell>Action</HeaderCell>
                    </tr>
                  </thead>

                  <tbody>
                    {(setup.mappings || []).map((row, index) => (
                      <tr
                        key={`mapping-${index}`}
                        className="border-t border-slate-200 dark:border-slate-800"
                      >
                        <BodyCell>
                          <select
                            value={row.coCode}
                            onChange={(e) =>
                              updateMappingRow(index, "coCode", e.target.value)
                            }
                            className={inputClass}
                          >
                            <option value="">Select CO</option>
                            {coOptions.map((co) => (
                              <option key={co.code} value={co.code}>
                                {co.code}
                              </option>
                            ))}
                          </select>
                        </BodyCell>

                        {/* <BodyCell>
                          <select
                            value={row.targetType}
                            onChange={(e) =>
                              updateMappingRow(index, "targetType", e.target.value)
                            }
                            className={inputClass}
                          >
                            <option value="PO">PO</option>
                            <option value="PSO">PSO</option>
                          </select>
                        </BodyCell> */}

                        <BodyCell>
                          <select
                            value={row.targetCode}
                            onChange={(e) =>
                              updateMappingRow(index, "targetCode", e.target.value)
                            }
                            className={inputClass}
                          >
                            <option value="">Select Target</option>
                            {targetCodeOptions().map((target) => (
                              <option key={target.code} value={target.code}>
                                {target.code}
                              </option>
                            ))}
                          </select>
                        </BodyCell>

                        {/* <BodyCell>
                          <select
                            value={row.strength}
                            onChange={(e) =>
                              updateMappingRow(index, "strength", Number(e.target.value))
                            }
                            className={inputClass}
                          >
<option value={1}>1 - Low</option>
<option value={2}>2 - Medium</option>
<option value={3}>3 - High</option>
                          </select>
                        </BodyCell> */}

                        <BodyCell>
                          <button
                            type="button"
                            onClick={() => removeMappingRow(index)}
                            className={dangerButtonClass}
                          >
                            Remove
                          </button>
                        </BodyCell>
                      </tr>
                    ))}

                    {!setup.mappings?.length && (
                      <tr>
                        <BodyCell colSpan={3} className="text-center text-slate-500">
                          No mappings added yet.
                        </BodyCell>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </SectionCard>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveSetup}
              disabled={setupSaving}
              className={primaryButtonClass}
            >
              {setupSaving ? "Saving..." : "Save OBE Setup"}
            </button>
          </div>
        </div>
      )}

      {activeSubtab === "blueprint" && (
        <div className="space-y-6">
          <SectionCard
            title={isLabCourse ? "Lab Mid and Lab Final Blueprint" : "Assessment Blueprint"}
            subtitle={
              isLabCourse
                ? "Create CO-mapped question/item breakdowns for Lab Mid and Lab Final. Attendance and Lab Evaluation are fetched automatically."
                : "Create assessment-wise question/item mapping with Course Outcomes."
            }
          >
            {isLabCourse && (
              <div className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                <strong>Automatic Continuous Evaluation:</strong> AT (5) is taken from this lab course attendance, and Lab E (25) is taken from the normal marksheet’s Lab Assessment (Main). Only Lab Mid (30) and Lab Final (40) need CO–PO blueprints and mark entry here.
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <FormField label="Assessment Name">
                <input
                  value={blueprintForm.assessmentName}
                  onChange={(e) =>
                    setBlueprintForm((prev) => ({
                      ...prev,
                      assessmentName: e.target.value,
                    }))
                  }
                  className={inputClass}
                  placeholder={isLabCourse ? "Lab Mid / Lab Final" : "CT 1 / Mid / Final"}
                />
              </FormField>

              <FormField label="Assessment Type">
                <select
                  value={blueprintForm.assessmentType}
                  onChange={(e) => {
                    const assessmentType = e.target.value;
                    const expectedMarks = isLabCourse
                      ? getExpectedLabAssessmentMarks(assessmentType)
                      : 0;

                    setBlueprintForm((prev) => {
                      const previousExpectedMarks = isLabCourse
                        ? getExpectedLabAssessmentMarks(prev.assessmentType)
                        : 0;
                      const shouldUpdateSingleItem =
                        isLabCourse &&
                        prev.items.length === 1 &&
                        [0, previousExpectedMarks].includes(
                          Number(prev.items[0]?.marks || 0)
                        );

                      return {
                        ...prev,
                        assessmentType,
                        totalMarks: isLabCourse
                          ? expectedMarks
                          : prev.totalMarks,
                        items: shouldUpdateSingleItem
                          ? [{ ...prev.items[0], marks: expectedMarks }]
                          : prev.items,
                      };
                    });
                  }}
                  className={inputClass}
                >
                  {availableAssessmentTypes.map((type) => (
                    <option key={type} value={type}>
                      {getAssessmentTypeLabel(type, isLabCourse)}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField
                label={
                  isLabCourse
                    ? `Total Marks (${
                        blueprintForm.assessmentType === "final" ? 40 : 30
                      } required)`
                    : "Total Marks"
                }
              >
                <input
                  type="number"
                  value={blueprintForm.totalMarks}
                  onChange={(e) =>
                    setBlueprintForm((prev) => ({
                      ...prev,
                      totalMarks: e.target.value,
                    }))
                  }
                  readOnly={isLabCourse}
                  className={`${inputClass} ${
                    isLabCourse
                      ? "cursor-not-allowed bg-slate-100 dark:bg-slate-800"
                      : ""
                  }`}
                />
              </FormField>

              {/* <FormField label="Display Order">
                <input
                  type="number"
                  value={blueprintForm.order}
                  onChange={(e) =>
                    setBlueprintForm((prev) => ({
                      ...prev,
                      order: e.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </FormField> */}

              <div className="lg:col-span-2">
                <FormField label="Notes">
                  <textarea
                    value={blueprintForm.notes}
                    onChange={(e) =>
                      setBlueprintForm((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    className={`${inputClass} min-h-24`}
                  />
                </FormField>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Blueprint Items
                </h4>
                <button
                  type="button"
                  onClick={addBlueprintRow}
                  className={secondaryButtonClass}
                >
                  Add Item
                </button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/80">
                    <tr>
                      <HeaderCell>Key</HeaderCell>
                      <HeaderCell>Label</HeaderCell>
                      <HeaderCell>Marks</HeaderCell>
                      <HeaderCell>CO</HeaderCell>
                      <HeaderCell>Action</HeaderCell>
                    </tr>
                  </thead>

                  <tbody>
                    {blueprintForm.items.map((item, index) => (
                      <tr
                        key={`item-${index}`}
                        className="border-t border-slate-200 dark:border-slate-800"
                      >
                        <BodyCell>
                          <input
                            value={item.key}
                            onChange={(e) =>
                              updateBlueprintRow(index, "key", e.target.value)
                            }
                            className={inputClass}
                          />
                        </BodyCell>

                        <BodyCell>
                          <input
                            value={item.label}
                            onChange={(e) =>
                              updateBlueprintRow(index, "label", e.target.value)
                            }
                            className={inputClass}
                          />
                        </BodyCell>

                        <BodyCell>
                          <input
                            type="number"
                            value={item.marks}
                            onChange={(e) =>
                              updateBlueprintRow(index, "marks", e.target.value)
                            }
                            className={inputClass}
                          />
                        </BodyCell>

                        <BodyCell>
                          <select
                            value={item.coCode}
                            onChange={(e) =>
                              updateBlueprintRow(index, "coCode", e.target.value)
                            }
                            className={inputClass}
                          >
                            <option value="">Select CO</option>
                            {coOptions.map((co) => (
                              <option key={co.code} value={co.code}>
                                {co.code}
                              </option>
                            ))}
                          </select>
                        </BodyCell>

                        <BodyCell>
                          <button
                            type="button"
                            onClick={() => removeBlueprintRow(index)}
                            className={dangerButtonClass}
                          >
                            Remove
                          </button>
                        </BodyCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              {editingBlueprintId && (
                <button
                  type="button"
                  onClick={resetBlueprintForm}
                  className={secondaryButtonClass}
                >
                  Cancel Edit
                </button>
              )}

              <button
                type="button"
                onClick={saveBlueprint}
                disabled={blueprintSaving}
                className={primaryButtonClass}
              >
                {blueprintSaving
                  ? "Saving..."
                  : editingBlueprintId
                    ? "Update Blueprint"
                    : "Create Blueprint"}
              </button>
            </div>
          </SectionCard>

          <SectionCard
            title="Saved Assessment Blueprints"
            subtitle="These blueprints are used in OBE Mark Entry and OBE Output."
          >
            {blueprintsLoading ? (
              <div className="text-sm text-slate-500">Loading blueprints...</div>
            ) : !blueprints.length ? (
              <div className="text-sm text-slate-500">
                No blueprints created yet.
              </div>
            ) : (
              <div className="space-y-6">
                {groupedBlueprints.map(([type, group]) => (
                  <div key={type} className="space-y-3">
                    <h3 className="text-lg font-bold text-slate-100">
                      {group.label}
                    </h3>

                    {group.items.map((blueprint) => (
                      <div
                        key={blueprint._id}
                        className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                              {blueprint.assessmentName}
                            </h4>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                              Total Marks: {blueprint.totalMarks}
                            </p>
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEditBlueprint(blueprint)}
                              className={secondaryButtonClass}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteBlueprint(blueprint._id)}
                              className={dangerButtonClass}
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                          <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-800/80">
                              <tr>
                                <HeaderCell>Label</HeaderCell>
                                <HeaderCell>Marks</HeaderCell>
                                <HeaderCell>CO</HeaderCell>
                              </tr>
                            </thead>

                            <tbody>
                              {(blueprint.items || []).map((item) => (
                                <tr
                                  key={item.key}
                                  className="border-t border-slate-200 dark:border-slate-800"
                                >
                                  <BodyCell>{item.label}</BodyCell>
                                  <BodyCell>{item.marks}</BodyCell>
                                  <BodyCell>{item.coCode}</BodyCell>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {activeSubtab === "marks" && (
        <div className="space-y-6">
          <SectionCard
            title="OBE Mark Entry"
            subtitle="Enter marks question-wise. The system will calculate CO totals and attainment automatically."
          >
            {markLoading ? (
              <div className="text-sm text-slate-500">Loading mark entry data...</div>
            ) : !markStudents.length ? (
              <div className="text-sm text-slate-500">
                No students found in this course.
              </div>
            ) : !markBlueprints.length ? (
              <div className="text-sm text-slate-500">
                No OBE blueprints created yet. Create a blueprint first.
              </div>
            ) : (
              <>
                <div className="mb-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      Students: <strong>{markStudents.length}</strong> · Assessments:{" "}
                      <strong>{markBlueprints.length}</strong>
                    </div>

                    <button
                      type="button"
                      onClick={saveMarks}
                      disabled={markSaving}
                      className={primaryButtonClass}
                    >
                      {markSaving ? "Saving..." : "Save OBE Marks"}
                    </button>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Tab Mode
                        </span>
                        <select
                          value={obeTabMode}
                          onChange={(e) => setObeTabMode(e.target.value)}
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          <option value="row">Row-wise Entry</option>
                          <option value="column">Column-wise Entry</option>
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Student Sort
                        </span>
                        <select
                          value={obeSortMode}
                          onChange={(e) => setObeSortMode(e.target.value)}
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          <option value="entered">Default / Entered Order</option>
                          <option value="roll_asc">Roll Ascending</option>
                          <option value="roll_desc">Roll Descending</option>
                        </select>
                      </label>

                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                          Search Student
                        </label>
                        <input
                          type="text"
                          value={obeStudentSearch}
                          onChange={(e) => setObeStudentSearch(e.target.value)}
                          placeholder="Search by roll, name, or email"
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />

                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Showing {visibleMarkStudents.length} of {sortedMarkStudents.length} students
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
                  <div className="max-h-[68vh] overflow-auto">
                    <table className="w-full min-w-[980px] border-separate border-spacing-0 text-xs sm:text-sm">
                      <thead className="sticky top-0 z-30">
                        <tr>
                          <th className="sticky left-0 z-40 w-[170px] min-w-[150px] max-w-[210px] border-b border-r border-slate-300 bg-slate-100 px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:w-[200px] sm:px-4">
                            Student
                          </th>

                          {markBlueprints.map((blueprint) => (
                            <th
                              key={blueprint._id}
                              colSpan={(blueprint.items || []).length + 1}
                              className="border-b border-r border-slate-300 bg-slate-100 px-2 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:px-3"
                            >
                              {blueprint.assessmentName} ({blueprint.totalMarks})
                            </th>
                          ))}
                        </tr>

                        <tr>
                          <th className="sticky left-0 z-40 w-[170px] min-w-[150px] max-w-[210px] border-b border-r border-slate-300 bg-slate-50 px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:w-[200px] sm:px-4">
                            Roll / Name
                          </th>

                          {markBlueprints.flatMap((blueprint) => [
                            ...(blueprint.items || []).map((item) => (
                              <th
                                key={`${blueprint._id}-${item.key}`}
                                className="w-[70px] min-w-[64px] border-b border-r border-slate-300 bg-slate-50 px-2 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:w-[82px] sm:min-w-[76px]"
                              >
                                <div>{item.label}</div>
                                <div className="mt-1 text-[10px] font-medium normal-case text-slate-500 dark:text-slate-400">
                                  {item.coCode} · {item.marks}
                                </div>
                              </th>
                            )),
                            <th
                              key={`${blueprint._id}-total`}
                              className="w-[58px] min-w-[54px] border-b border-r border-slate-300 bg-indigo-50 px-2 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-indigo-700 dark:border-slate-700 dark:bg-indigo-500/10 dark:text-indigo-300 sm:w-[70px] sm:min-w-[64px]"
                            >
                              Total
                            </th>,
                          ])}
                        </tr>
                      </thead>

                      <tbody>
                        {visibleMarkStudents.map((student, rowIndex) => (
                          <tr
                            key={student.studentId}
                            className="group hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          >
                            <td className="sticky left-0 z-20 w-[170px] min-w-[150px] max-w-[210px] border-b border-r border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 sm:w-[200px] sm:px-4">
                              <div className="font-bold text-slate-900 dark:text-slate-100">
                                {student.roll}
                              </div>
                              <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                                {student.name}
                              </div>
                            </td>

                            {markBlueprints.flatMap((blueprint) => [
                              ...(blueprint.items || []).map((item) => (
                                <td
                                  key={`${student.studentId}-${blueprint._id}-${item.key}`}
                                  className="border-b border-r border-slate-200 px-1.5 py-2 text-center dark:border-slate-800 sm:px-2"
                                >
                                  <input
                                    type="number"
                                    min="0"
                                    max={item.marks}
                                    step="0.01"
                                    value={getDraftValue(
                                      student.studentId,
                                      blueprint._id,
                                      item.key
                                    )}
                                    onChange={(e) =>
                                      handleDraftChange(
                                        student.studentId,
                                        blueprint._id,
                                        item.key,
                                        e.target.value,
                                        item.marks
                                      )
                                    }
                                    onKeyDown={handleObeKeyDown}
                                    data-row={rowIndex}
                                    data-col={getObeInputColIndex(blueprint._id, item.key)}
                                    ref={(el) => {
                                      const colIndex = getObeInputColIndex(
                                        blueprint._id,
                                        item.key
                                      );

                                      if (colIndex < 0) return;

                                      if (!obeInputRefs.current[rowIndex]) {
                                        obeInputRefs.current[rowIndex] = [];
                                      }

                                      obeInputRefs.current[rowIndex][colIndex] = el;
                                    }}
                                    className="h-8 w-full min-w-[48px] max-w-[64px] rounded-lg border border-slate-300 bg-white px-1.5 text-center text-xs font-semibold text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20 sm:h-9 sm:max-w-[72px] sm:text-sm"
                                  />
                                </td>
                              )),
                              <td
                                key={`${student.studentId}-${blueprint._id}-total`}
                                className="border-b border-r border-slate-200 bg-indigo-50/60 px-2 py-2 text-center text-xs font-bold text-indigo-700 dark:border-slate-800 dark:bg-indigo-500/10 dark:text-indigo-300 sm:text-sm"
                              >
                                {getAssessmentDraftTotal(student.studentId, blueprint)}
                              </td>,
                            ])}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </SectionCard>
        </div>
      )}

      {activeSubtab === "output" && (
        <div className="space-y-6">
          <SectionCard
            title="OBE Output"
            subtitle="CO-wise student achievement, class attainment, PO attainment, and grade distribution."
          >
            {outputLoading ? (
              <div className="text-sm text-slate-500">Loading output...</div>
            ) : !outputData ? (
              <div className="text-sm text-slate-500">No output available yet.</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Threshold" value={`${outputData.thresholdPercent || 40}%`} />
                <MetricCard label="Students" value={outputData.totalStudents || 0} />
                <MetricCard label="Assessments" value={outputData.blueprints?.length || 0} />
                <MetricCard label="Total Possible Marks" value={outputData.totalPossibleMarks || 0} />
              </div>
            )}
          </SectionCard>

          {outputData && (
            <>
              <SectionCard
                title="Student CO Achievement"
                subtitle="Shows obtained marks, CO percentage, and achieved status per student."
              >
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
                  <div className="max-h-[68vh] overflow-auto">
                    <table className="w-full min-w-[980px] border-separate border-spacing-0 text-xs sm:text-sm">
                      <thead className="sticky top-0 z-30">
                        <tr>
                          <HeaderCell>Roll</HeaderCell>
                          <HeaderCell>Name</HeaderCell>
                          {isLabCourse &&
                            (outputData.continuousAssessment?.headers || []).map(
                              (header) => (
                                <HeaderCell
                                  key={`continuous-${header.key}`}
                                  className="text-center"
                                >
                                  {header.label} ({header.maxMarks})
                                </HeaderCell>
                              )
                            )}
                          <HeaderCell>Total</HeaderCell>
                          <HeaderCell>%</HeaderCell>
                          <HeaderCell>Grade</HeaderCell>

                          {(outputData.coAttainment || []).flatMap((co) => [
                            <HeaderCell key={`${co.code}-obt`} className="text-center">
                              {co.code} Obt
                            </HeaderCell>,
                            <HeaderCell key={`${co.code}-pct`} className="text-center">
                              {co.code} %
                            </HeaderCell>,
                            <HeaderCell key={`${co.code}-yn`} className="text-center">
                              {co.code} Y/N
                            </HeaderCell>,
                          ])}
                        </tr>
                      </thead>

                      <tbody>
                        {(outputData.students || []).map((student) => (
                          <tr
                            key={student.studentId}
                            className="border-t border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                          >
                            <BodyCell>{student.roll}</BodyCell>
                            <BodyCell className="min-w-[180px] font-medium">
                              {student.name}
                            </BodyCell>
                            {isLabCourse &&
                              (outputData.continuousAssessment?.headers || []).map(
                                (header) => (
                                  <BodyCell
                                    key={`${student.studentId}-continuous-${header.key}`}
                                    className="text-center"
                                  >
                                    {student.continuousAssessment?.[header.key] ?? 0}
                                  </BodyCell>
                                )
                              )}
                            <BodyCell>{student.courseObtained} / {student.courseMaxMarks}</BodyCell>
                            <BodyCell>{student.totalPercent}</BodyCell>
                            <BodyCell>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                {student.grade}
                              </span>
                            </BodyCell>

                            {(student.coRows || []).flatMap((co) => [
                              <BodyCell key={`${student.studentId}-${co.code}-obt`} className="text-center">
                                {co.obtainedMarks}/{co.maxMarks}
                              </BodyCell>,
                              <BodyCell key={`${student.studentId}-${co.code}-pct`} className="text-center">
                                {co.percent}
                              </BodyCell>,
                              <BodyCell key={`${student.studentId}-${co.code}-yn`} className="text-center">
                                <span className={co.achieved ? successBadgeClass : failBadgeClass}>
                                  {co.achieved ? "Yes" : "No"}
                                </span>
                              </BodyCell>,
                            ])}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </SectionCard>

              <div className="grid gap-6 xl:grid-cols-2">
                <SectionCard
                  title="CO Attainment Summary"
                  subtitle="Calculated from threshold-based student achievement count."
                >
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800/80">
                        <tr>
                          <HeaderCell>CO</HeaderCell>
                          <HeaderCell>Max</HeaderCell>
                          <HeaderCell>Threshold</HeaderCell>
                          <HeaderCell>Attained</HeaderCell>
                          <HeaderCell>Attainment %</HeaderCell>
                          <HeaderCell>Level</HeaderCell>
                        </tr>
                      </thead>

                      <tbody>
                        {(outputData.coAttainment || []).map((row) => (
                          <tr
                            key={row.code}
                            className="border-t border-slate-200 dark:border-slate-800"
                          >
                            <BodyCell>{row.code}</BodyCell>
                            <BodyCell>{row.maxMarks}</BodyCell>
                            <BodyCell>{row.thresholdMarks}</BodyCell>
                            <BodyCell>
                              {row.attainedCount}/{row.totalStudents}
                            </BodyCell>
                            <BodyCell>{row.attainmentPercent}</BodyCell>
                            <BodyCell>{row.level}</BodyCell>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>

                <SectionCard
                  title="PO Attainment Summary"
                  subtitle="Calculated from CO attainment using CO to PO mapping."
                >
                  <div className="space-y-4">
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800/80">
                          <tr>
                            <HeaderCell>PO</HeaderCell>
                            <HeaderCell>Attainment %</HeaderCell>
                            <HeaderCell>Level</HeaderCell>
                          </tr>
                        </thead>

                        <tbody>
                          {(outputData.poAttainment || []).map((row) => (
                            <tr
                              key={row.code}
                              className="border-t border-slate-200 dark:border-slate-800"
                            >
                              <BodyCell>{row.code}</BodyCell>
                              <BodyCell>{row.attainmentPercent}</BodyCell>
                              <BodyCell>{row.level}</BodyCell>
                            </tr>
                          ))}

                          {!outputData.poAttainment?.length && (
                            <tr>
                              <BodyCell
                                colSpan={3}
                                className="text-center text-slate-500"
                              >
                                No PO rows found.
                              </BodyCell>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {!!outputData.psoAttainment?.length && (
                      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50 dark:bg-slate-800/80">
                            <tr>
                              <HeaderCell>PSO</HeaderCell>
                              <HeaderCell>Attainment %</HeaderCell>
                              <HeaderCell>Level</HeaderCell>
                            </tr>
                          </thead>

                          <tbody>
                            {(outputData.psoAttainment || []).map((row) => (
                              <tr
                                key={row.code}
                                className="border-t border-slate-200 dark:border-slate-800"
                              >
                                <BodyCell>{row.code}</BodyCell>
                                <BodyCell>{row.attainmentPercent}</BodyCell>
                                <BodyCell>{row.level}</BodyCell>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </SectionCard>
              </div>

              <SectionCard
                title="Grade Distribution"
                subtitle="Based on total obtained marks scaled to percentage."
              >
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/80">
                      <tr>
                        <HeaderCell>Grade</HeaderCell>
                        <HeaderCell>Count</HeaderCell>
                        <HeaderCell>Percent</HeaderCell>
                      </tr>
                    </thead>

                    <tbody>
                      {(outputData.gradeDistribution || []).map((row) => (
                        <tr
                          key={row.grade}
                          className="border-t border-slate-200 dark:border-slate-800"
                        >
                          <BodyCell>{row.grade}</BodyCell>
                          <BodyCell>{row.count}</BodyCell>
                          <BodyCell>{row.percent}%</BodyCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </>
          )}
        </div>
      )}

      {activeSubtab === "crr" && (
        <SectionCard
          title="Course Review Report and Excel Export"
          subtitle="Download OBE Excel workbook, import edited marks, or generate Course Review Report."
        >
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleDownloadExcel}
              className={primaryButtonClass}
            >
              Download OBE Excel
            </button>

            <label className={secondaryButtonClass}>
              Import OBE Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImportExcel}
              />
            </label>

            <button
              type="button"
              onClick={handleDownloadCrr}
              className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Download CRR
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4">
        <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          {title}
        </h4>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function OutcomeBlock({ title, rows, onAdd, onRemove, onChange }) {
  return (
    <SectionCard
      title={title}
      subtitle="Use clear code and full statement so the same data can later be shown in output and CRR."
    >
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={onAdd} className={secondaryButtonClass}>
          Add Row
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/80">
            <tr>
              <HeaderCell>Code</HeaderCell>
              <HeaderCell>Statement</HeaderCell>
              <HeaderCell>Action</HeaderCell>
            </tr>
          </thead>

          <tbody>
            {(rows || []).map((row, index) => (
              <tr
                key={`${title}-${index}`}
                className="border-t border-slate-200 dark:border-slate-800"
              >
                <BodyCell>
                  <input
                    value={row.code}
                    onChange={(e) => onChange(index, "code", e.target.value)}
                    className={inputClass}
                  />
                </BodyCell>

                <BodyCell>
                  <textarea
                    value={row.statement}
                    onChange={(e) => onChange(index, "statement", e.target.value)}
                    className={`${inputClass} min-h-24`}
                  />
                </BodyCell>

                <BodyCell>
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    className={dangerButtonClass}
                  >
                    Remove
                  </button>
                </BodyCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </span>
      {children}
    </label>
  );
}

function HeaderCell({ children, className = "", colSpan }) {
  return (
    <th
      colSpan={colSpan}
      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 ${className}`}
    >
      {children}
    </th>
  );
}

function BodyCell({ children, className = "", colSpan }) {
  return (
    <td
      colSpan={colSpan}
      className={`px-4 py-3 align-top text-slate-700 dark:text-slate-200 ${className}`}
    >
      {children}
    </td>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20";

const primaryButtonClass =
  "rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60";

const secondaryButtonClass =
  "cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";

const dangerButtonClass =
  "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20";

const successBadgeClass =
  "inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";

const failBadgeClass =
  "inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300";