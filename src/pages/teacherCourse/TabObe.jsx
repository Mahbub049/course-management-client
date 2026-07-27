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
  reuseObeData,
} from "../../services/obeService";
import { fetchTeacherCourses } from "../../services/courseService";

import { exportObeWorkbook } from "../../utils/obeWorkbookExport";
import {
  parseObeImportedMarkWorkbook,
  parseObeImportedWorkbookStructure,
} from "../../utils/obeWorkbookImport";
import { parseObeCourseOutlinePdf } from "../../utils/obeCourseOutlineImport";
import {
  analyzeObeMarksSheet,
  chooseDefaultObeMarksSheet,
  findMatchingBlueprintForGroup,
  normalizeImportedMarkValue,
  normalizeObeImportLabel,
  parseObeMarksWorkbook,
  suggestBlueprintItemForColumn,
} from "../../utils/obeMarksExcelImport";
import { getAuthItem } from "../../utils/authStorage";
import { premiumSwal } from "../../utils/premiumDialog";

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
  courseReportComment1: "",
  courseReportComment2: "",
  courseReportGeneralComment: "",
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

const withSwalValidation = (fn) => () => {
  try {
    return fn();
  } catch (error) {
    Swal.showValidationMessage(error?.message || "Please review the highlighted import settings.");
    return false;
  }
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const cleanImportedBlueprintLabel = (label, coCode = "") => {
  const value = String(label || "").trim();
  if (/^CO\d+\s+Allocation$/i.test(value)) {
    return String(coCode || value.replace(/\s+Allocation$/i, "")).trim();
  }
  return value;
};

const normalizeBlueprintLabels = (blueprint = {}) => ({
  ...blueprint,
  items: (blueprint.items || []).map((item) => ({
    ...item,
    label: cleanImportedBlueprintLabel(item.label, item.coCode),
  })),
});

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");


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

const normalizeStudentNameForImport = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildMarkEntryState = (data = {}) => {
  const students = Array.isArray(data?.students) ? data.students : [];
  const loadedBlueprints = sortBlueprints(
    (Array.isArray(data?.blueprints) ? data.blueprints : []).map(
      normalizeBlueprintLabels
    )
  );
  const marks = Array.isArray(data?.marks) ? data.marks : [];
  const draft = {};

  for (const student of students) {
    for (const blueprint of loadedBlueprints) {
      const key = `${student.studentId}__${blueprint._id}`;
      draft[key] = {};
      for (const item of blueprint.items || []) draft[key][item.key] = "";
    }
  }

  for (const mark of marks) {
    const key = `${mark.student}__${mark.blueprint}`;
    if (!draft[key]) draft[key] = {};
    for (const entry of mark.entries || []) {
      draft[key][entry.itemKey] = entry.obtainedMarks;
    }
  }

  return { students, blueprints: loadedBlueprints, draft };
};

const isPersistedSetupData = (data = {}) =>
  Boolean(
    data?.courseOutcomes?.length ||
      data?.poStatements?.length ||
      data?.mappings?.length
  );

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
  const [hasPersistedSetup, setHasPersistedSetup] = useState(false);

  const [blueprints, setBlueprints] = useState([]);
  const [blueprintsLoading, setBlueprintsLoading] = useState(true);
  const [blueprintForm, setBlueprintForm] = useState(() =>
    createEmptyBlueprintForm(isLabCourse)
  );
  const [editingBlueprintId, setEditingBlueprintId] = useState(null);
  const [blueprintSaving, setBlueprintSaving] = useState(false);
  const [draggedBlueprintItemIndex, setDraggedBlueprintItemIndex] = useState(null);
  const [dragOverBlueprintItemIndex, setDragOverBlueprintItemIndex] = useState(null);

  const [markStudents, setMarkStudents] = useState([]);
  const [markBlueprints, setMarkBlueprints] = useState([]);
  const [markDraft, setMarkDraft] = useState({});
  const [markLoading, setMarkLoading] = useState(true);
  const [markSaving, setMarkSaving] = useState(false);
  const [obeTabMode, setObeTabMode] = useState("row");
  const [obeSortMode, setObeSortMode] = useState("entered");
  const [obeStudentSearch, setObeStudentSearch] = useState("");

  const obeInputRefs = useRef([]);
  const obeMarksImportInputRef = useRef(null);

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
      setHasPersistedSetup(isPersistedSetupData(data));

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
        courseReportComment1: data?.courseReportComment1 || "",
        courseReportComment2: data?.courseReportComment2 || "",
        courseReportGeneralComment: data?.courseReportGeneralComment || "",
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
      const normalizedBlueprints = (Array.isArray(data) ? data : []).map(
        normalizeBlueprintLabels
      );
      setBlueprints(sortBlueprints(normalizedBlueprints));
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
      const { students, blueprints: loadedBlueprints, draft } =
        buildMarkEntryState(data);

      setMarkStudents(students);
      setMarkBlueprints(loadedBlueprints);
      setMarkDraft(draft);
      return { students, blueprints: loadedBlueprints, draft };
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

  const getMappedPoCodes = (coCode, sourceSetup = setup) =>
    (sourceSetup?.mappings || [])
      .filter(
        (row) =>
          String(row?.coCode || "").trim().toUpperCase() ===
            String(coCode || "").trim().toUpperCase() &&
          String(row?.targetType || "PO").trim().toUpperCase() !== "PSO"
      )
      .map((row) => String(row?.targetCode || "").trim().toUpperCase())
      .filter(Boolean)
      .filter((code, index, values) => values.indexOf(code) === index);

  const toggleCoPoMapping = (coCode, poCode) => {
    const normalizedCo = String(coCode || "").trim().toUpperCase();
    const normalizedPo = String(poCode || "").trim().toUpperCase();
    if (!normalizedCo || !normalizedPo) return;

    setSetup((prev) => {
      const mappings = Array.isArray(prev.mappings) ? prev.mappings : [];
      const existing = mappings.find(
        (row) =>
          String(row?.coCode || "").trim().toUpperCase() === normalizedCo &&
          String(row?.targetType || "PO").trim().toUpperCase() !== "PSO" &&
          String(row?.targetCode || "").trim().toUpperCase() === normalizedPo
      );

      if (existing) {
        return {
          ...prev,
          mappings: mappings.filter(
            (row) =>
              !(
                String(row?.coCode || "").trim().toUpperCase() === normalizedCo &&
                String(row?.targetType || "PO").trim().toUpperCase() !== "PSO" &&
                String(row?.targetCode || "").trim().toUpperCase() === normalizedPo
              )
          ),
        };
      }

      return {
        ...prev,
        mappings: [
          ...mappings,
          {
            coCode: normalizedCo,
            targetType: "PO",
            targetCode: normalizedPo,
            strength: 1,
          },
        ],
      };
    });
  };

  const clearCoPoMappings = (coCode) => {
    const normalizedCo = String(coCode || "").trim().toUpperCase();
    setSetup((prev) => ({
      ...prev,
      mappings: (prev.mappings || []).filter(
        (row) =>
          !(
            String(row?.coCode || "").trim().toUpperCase() === normalizedCo &&
            String(row?.targetType || "PO").trim().toUpperCase() !== "PSO"
          )
      ),
    }));
  };

const saveSetup = async () => {
  try {
    setSetupSaving(true);

    const mappingMap = new Map();
    (setup.mappings || [])
      .map((row) => ({
        coCode: String(row.coCode || "").trim().toUpperCase(),
        targetType: "PO",
        targetCode: String(row.targetCode || "").trim().toUpperCase(),
        strength: [1, 2, 3].includes(Number(row.strength)) ? Number(row.strength) : 1,
      }))
      .filter((row) => row.coCode && row.targetCode)
      .forEach((row) => {
        const key = `${row.coCode}__${row.targetCode}`;
        if (!mappingMap.has(key)) mappingMap.set(key, row);
      });
    const cleanedMappings = [...mappingMap.values()];

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
      items: prev.items
        .filter((_, rowIndex) => rowIndex !== index)
        .map((row, rowIndex) => ({ ...row, order: rowIndex })),
    }));
  };

  const reorderBlueprintItems = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;

    setBlueprintForm((prev) => {
      if (fromIndex >= prev.items.length || toIndex >= prev.items.length) return prev;

      const items = [...prev.items];
      const [movedItem] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, movedItem);

      return {
        ...prev,
        items: items.map((row, rowIndex) => ({ ...row, order: rowIndex })),
      };
    });
  };

  const handleBlueprintItemDragStart = (event, index) => {
    setDraggedBlueprintItemIndex(index);
    setDragOverBlueprintItemIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleBlueprintItemDragOver = (event, index) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOverBlueprintItemIndex !== index) setDragOverBlueprintItemIndex(index);
  };

  const handleBlueprintItemDrop = (event, index) => {
    event.preventDefault();
    const transferredValue = event.dataTransfer.getData("text/plain");
    const transferredIndex = transferredValue === "" ? null : Number(transferredValue);
    const fromIndex = Number.isInteger(transferredIndex)
      ? transferredIndex
      : draggedBlueprintItemIndex;

    if (Number.isInteger(fromIndex)) reorderBlueprintItems(fromIndex, index);
    setDraggedBlueprintItemIndex(null);
    setDragOverBlueprintItemIndex(null);
  };

  const handleBlueprintItemDragEnd = () => {
    setDraggedBlueprintItemIndex(null);
    setDragOverBlueprintItemIndex(null);
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

      const normalizedBlueprintForm = {
        ...blueprintForm,
        items: (blueprintForm.items || []).map((item, index) => ({
          ...item,
          order: index,
        })),
      };

      if (editingBlueprintId) {
        await updateObeBlueprint(courseId, editingBlueprintId, normalizedBlueprintForm);
        toast("success", "Blueprint updated successfully.");
      } else {
        await createObeBlueprint(courseId, normalizedBlueprintForm);
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
      label: cleanImportedBlueprintLabel(item.label, item.coCode),
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

      const normalizedPayload = {
        ...payload,
        blueprints: (payload.blueprints || []).map(normalizeBlueprintLabels),
      };

      const { blob, warnings = [] } = await exportObeWorkbook(normalizedPayload);
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

  const handleImportCourseOutline = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const structure = await parseObeCourseOutlinePdf(file, setup);
      const canImportSetup = Boolean(structure.setup);
      const canImportAssessments = Boolean(structure.blueprints?.length);

      if (!canImportSetup && !canImportAssessments) {
        throw new Error(
          "The course outline was read, but no usable OBE Setup or Assessment Blueprint data was detected."
        );
      }

      const detected = structure.detected || {};
      const identity = [detected.courseCode, detected.courseTitle]
        .filter(Boolean)
        .join(" — ");
      const warningHtml = (structure.warnings || []).length
        ? `<div class="premium-dialog-warning" style="margin-top:12px;padding:11px 12px;font-size:12px;line-height:1.5">${structure.warnings
            .map((warning) => `• ${escapeHtml(warning)}`)
            .join("<br>")}</div>`
        : "";

      const result = await premiumSwal({
        title: "Import Course Outline",
        width: 660,
        html: `
          <div style="text-align:left">
            <div class="premium-dialog-soft-indigo" style="margin:0 0 14px;padding:12px 14px">
              <strong class="premium-dialog-accent" style="display:block;font-size:13px">${escapeHtml(identity || file.name)}</strong>
              <span class="premium-dialog-muted" style="display:block;margin-top:4px;font-size:12px">Detected ${Number(detected.courseOutcomeCount || 0)} CO(s), ${Number(detected.poCount || 0)} mapped PO(s), ${Number(detected.mappingCount || 0)} mapping(s), and ${Number(detected.assessmentCount || 0)} assessment blueprint(s).</span>
            </div>
            <p class="premium-dialog-muted" style="margin:0 0 14px;font-size:13px;line-height:1.55">
              Choose what should be filled from this course outline. Only the selected sections will be changed.
            </p>
            <label class="premium-dialog-card" style="display:flex;gap:12px;align-items:flex-start;padding:13px 14px;margin-bottom:10px;${canImportSetup ? "cursor:pointer" : "opacity:.55;cursor:not-allowed"}">
              <input id="outline-import-setup" type="checkbox" ${canImportSetup ? "checked" : "disabled"} style="margin-top:3px;width:17px;height:17px" />
              <span><strong class="premium-dialog-strong" style="display:block">OBE Setup</strong><span class="premium-dialog-muted" style="display:block;margin-top:3px;font-size:12px">CO statements, only the POs used in the mapping, PO statements, CO-PO correlation factors, and attainment threshold.</span></span>
            </label>
            <label class="premium-dialog-card" style="display:flex;gap:12px;align-items:flex-start;padding:13px 14px;${canImportAssessments ? "cursor:pointer" : "opacity:.55;cursor:not-allowed"}">
              <input id="outline-import-assessments" type="checkbox" ${canImportAssessments ? "checked" : "disabled"} style="margin-top:3px;width:17px;height:17px" />
              <span><strong class="premium-dialog-strong" style="display:block">Assessment Blueprint</strong><span class="premium-dialog-muted" style="display:block;margin-top:3px;font-size:12px">Build Mid/Final CO allocations from the CLO Assessment Criteria table. Only successfully detected assessment types will be replaced; inconsistent rows are left unchanged.</span></span>
            </label>
            ${warningHtml}
          </div>
        `,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Import Selected",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#4f46e5",
        focusConfirm: false,
        preConfirm: () => {
          const setupChoice =
            document.getElementById("outline-import-setup")?.checked === true;
          const assessments =
            document.getElementById("outline-import-assessments")?.checked === true;

          if (!setupChoice && !assessments) {
            Swal.showValidationMessage("Select at least one item to import.");
            return false;
          }

          return { setup: setupChoice, assessments };
        },
      });

      if (!result.isConfirmed) return;
      const choices = result.value || {};
      const imported = [];

      if (choices.setup) {
        if (!structure.setup) {
          throw new Error("OBE Setup data could not be read from this course outline.");
        }

        await saveObeSetup(courseId, {
          ...setup,
          ...structure.setup,
        });
        imported.push("OBE setup");
      }

      if (choices.assessments) {
        if (!structure.blueprints?.length) {
          throw new Error(
            "No Mid/Final CLO assessment allocation could be read from this course outline."
          );
        }

        const availableCoCodes = new Set(
          (
            choices.setup
              ? structure.setup?.courseOutcomes || []
              : setup.courseOutcomes || []
          ).map((row) => String(row.code || "").trim().toUpperCase())
        );
        const missingCoCodes = [
          ...new Set(
            structure.blueprints
              .flatMap((blueprint) => blueprint.items || [])
              .map((item) => String(item.coCode || "").trim().toUpperCase())
              .filter((code) => code && !availableCoCodes.has(code))
          ),
        ];

        if (missingCoCodes.length) {
          throw new Error(
            `The outline assessment uses ${missingCoCodes.join(", ")}, which is not in the current setup. Import OBE Setup together with Assessment Blueprint.`
          );
        }

        const importedBlueprints = structure.blueprints.map((blueprint) => ({
          ...blueprint,
          assessmentName: isLabCourse
            ? blueprint.assessmentType === "final"
              ? "Lab Final"
              : "Lab Mid"
            : blueprint.assessmentName,
        }));

        // Validate everything before deleting any saved blueprint. This prevents a
        // malformed outline row from partially replacing a teacher's existing setup.
        importedBlueprints.forEach((blueprint) => {
          const itemTotal = round2(
            (blueprint.items || []).reduce(
              (sum, item) => sum + Number(item.marks || 0),
              0
            )
          );
          const assessmentTotal = round2(blueprint.totalMarks);
          if (!blueprint.items?.length || assessmentTotal <= 0) {
            throw new Error(
              `${blueprint.assessmentName || "Assessment"} does not contain a usable CO allocation.`
            );
          }
          if (Math.abs(itemTotal - assessmentTotal) > 0.01) {
            throw new Error(
              `${blueprint.assessmentName || "Assessment"} allocation totals ${itemTotal}, but the outline lists ${assessmentTotal}. It was not imported.`
            );
          }
          if (
            isLabCourse &&
            ((blueprint.assessmentType === "mid" && assessmentTotal !== 30) ||
              (blueprint.assessmentType === "final" && assessmentTotal !== 40))
          ) {
            throw new Error(
              `${blueprint.assessmentName} has ${assessmentTotal} marks in the detected table. Lab Mid must be 30 and Lab Final must be 40.`
            );
          }
        });

        const currentBlueprints = await getObeBlueprints(courseId);
        const importedTypes = new Set(
          importedBlueprints.map((blueprint) => blueprint.assessmentType)
        );

        // Replace only the assessment types that were successfully detected. If an
        // outline has an inconsistent Final row, a valid existing Final blueprint is
        // left untouched instead of being deleted together with the valid Mid row.
        for (const blueprint of currentBlueprints || []) {
          if (!importedTypes.has(String(blueprint.assessmentType || "").toLowerCase())) {
            continue;
          }
          await deleteObeBlueprint(courseId, blueprint._id || blueprint.id);
        }
        for (const blueprint of importedBlueprints) {
          await createObeBlueprint(courseId, blueprint);
        }
        imported.push("assessment blueprint");
      }

      await Promise.all([loadSetup(), loadBlueprints(), loadMarks()]);
      setOutputData(null);
      setEditingBlueprintId(null);
      setBlueprintForm(createEmptyBlueprintForm(isLabCourse));

      premiumSwal({
        icon: "success",
        title: "Course outline imported",
        text: `${imported.join(" and ")} filled successfully from ${file.name}.`,
        confirmButtonText: "Done",
      });
    } catch (error) {
      console.error(error);
      premiumSwal({
        icon: "error",
        title: "Course outline import failed",
        text:
          error?.response?.data?.message ||
          error?.message ||
          "Failed to read the course outline PDF.",
        confirmButtonText: "Close",
      });
    } finally {
      input.value = "";
    }
  };

  const handleImportExcel = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const structure = await parseObeImportedWorkbookStructure(file, setup);
      const canImportStructure = structure.official === true;

      const result = await Swal.fire({
        title: "Import OBE Excel",
        width: 620,
        html: `
          <div style="text-align:left">
            <p style="margin:0 0 14px;color:#64748b;font-size:13px;line-height:1.55">
              Select the parts you want to bring into this course. Only the checked items will be imported.
            </p>
            <label style="display:flex;gap:12px;align-items:flex-start;padding:13px 14px;margin-bottom:10px;border:1px solid #dbe3ef;border-radius:14px;cursor:pointer">
              <input id="obe-import-marks" type="checkbox" checked style="margin-top:3px;width:17px;height:17px" />
              <span><strong style="display:block;color:#0f172a">Marks</strong><span style="display:block;margin-top:3px;color:#64748b;font-size:12px">Import the question-wise Mid/Final OBE marks for matching students. Synced CT/ASM/AT values continue to come from the marksheet.</span></span>
            </label>
            <label style="display:flex;gap:12px;align-items:flex-start;padding:13px 14px;margin-bottom:10px;border:1px solid #dbe3ef;border-radius:14px;${canImportStructure ? 'cursor:pointer' : 'opacity:.55;cursor:not-allowed'}">
              <input id="obe-import-setup" type="checkbox" ${canImportStructure ? '' : 'disabled'} style="margin-top:3px;width:17px;height:17px" />
              <span><strong style="display:block;color:#0f172a">OBE Setup</strong><span style="display:block;margin-top:3px;color:#64748b;font-size:12px">Import threshold, COs, only POs used by the CO-PO mapping, mapping links, and Course Report comments.</span></span>
            </label>
            <label style="display:flex;gap:12px;align-items:flex-start;padding:13px 14px;border:1px solid #dbe3ef;border-radius:14px;${canImportStructure ? 'cursor:pointer' : 'opacity:.55;cursor:not-allowed'}">
              <input id="obe-import-assessments" type="checkbox" ${canImportStructure ? '' : 'disabled'} style="margin-top:3px;width:17px;height:17px" />
              <span><strong style="display:block;color:#0f172a">Assessment Blueprint</strong><span style="display:block;margin-top:3px;color:#64748b;font-size:12px">Import Mid/Final question breakdowns and CO mappings. Existing OBE blueprints will be replaced.</span></span>
            </label>
            ${canImportStructure ? '' : '<p style="margin:12px 2px 0;color:#b45309;font-size:12px">This is not the official BUBT OBE workbook, so only compatible mark data can be imported.</p>'}
          </div>
        `,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Import Selected",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#4f46e5",
        focusConfirm: false,
        preConfirm: () => {
          const marks = document.getElementById("obe-import-marks")?.checked === true;
          const setupChoice =
            document.getElementById("obe-import-setup")?.checked === true;
          const assessments =
            document.getElementById("obe-import-assessments")?.checked === true;

          if (!marks && !setupChoice && !assessments) {
            Swal.showValidationMessage("Select at least one item to import.");
            return false;
          }

          return { marks, setup: setupChoice, assessments };
        },
      });

      if (!result.isConfirmed) return;
      const choices = result.value || {};
      const imported = [];

      if (choices.setup) {
        if (!structure.setup) {
          throw new Error("Setup data could not be read from this workbook.");
        }
        await saveObeSetup(courseId, {
          ...setup,
          ...structure.setup,
        });
        imported.push("OBE setup");
      }

      if (choices.assessments) {
        if (!structure.blueprints?.length) {
          throw new Error(
            "No Mid/Final assessment blueprint could be read from the workbook."
          );
        }

        const availableCoCodes = new Set(
          (
            choices.setup
              ? structure.setup?.courseOutcomes || []
              : setup.courseOutcomes || []
          ).map((row) => String(row.code || "").trim().toUpperCase())
        );
        const missingCoCodes = [
          ...new Set(
            structure.blueprints
              .flatMap((blueprint) => blueprint.items || [])
              .map((item) => String(item.coCode || "").trim().toUpperCase())
              .filter((code) => code && !availableCoCodes.has(code))
          ),
        ];

        if (missingCoCodes.length) {
          throw new Error(
            `The imported assessment uses ${missingCoCodes.join(", ")}, which is not in the current setup. Import Setup together with Assessment Blueprint or add those COs first.`
          );
        }

        const importedBlueprints = structure.blueprints.map((blueprint) => ({
          ...blueprint,
          assessmentName: isLabCourse
            ? blueprint.assessmentType === "final"
              ? "Lab Final"
              : "Lab Mid"
            : blueprint.assessmentName,
        }));

        // Validate everything before deleting any saved blueprint. This prevents a
        // malformed outline row from partially replacing a teacher's existing setup.
        importedBlueprints.forEach((blueprint) => {
          const itemTotal = round2(
            (blueprint.items || []).reduce(
              (sum, item) => sum + Number(item.marks || 0),
              0
            )
          );
          const assessmentTotal = round2(blueprint.totalMarks);
          if (!blueprint.items?.length || assessmentTotal <= 0) {
            throw new Error(
              `${blueprint.assessmentName || "Assessment"} does not contain a usable CO allocation.`
            );
          }
          if (Math.abs(itemTotal - assessmentTotal) > 0.01) {
            throw new Error(
              `${blueprint.assessmentName || "Assessment"} allocation totals ${itemTotal}, but the outline lists ${assessmentTotal}. It was not imported.`
            );
          }
          if (
            isLabCourse &&
            ((blueprint.assessmentType === "mid" && assessmentTotal !== 30) ||
              (blueprint.assessmentType === "final" && assessmentTotal !== 40))
          ) {
            throw new Error(
              `${blueprint.assessmentName} has ${assessmentTotal} marks in the detected table. Lab Mid must be 30 and Lab Final must be 40.`
            );
          }
        });

        const currentBlueprints = await getObeBlueprints(courseId);
        const importedTypes = new Set(
          importedBlueprints.map((blueprint) => blueprint.assessmentType)
        );

        // Replace only the assessment types that were successfully detected. If an
        // outline has an inconsistent Final row, a valid existing Final blueprint is
        // left untouched instead of being deleted together with the valid Mid row.
        for (const blueprint of currentBlueprints || []) {
          if (!importedTypes.has(String(blueprint.assessmentType || "").toLowerCase())) {
            continue;
          }
          await deleteObeBlueprint(courseId, blueprint._id || blueprint.id);
        }
        for (const blueprint of importedBlueprints) {
          await createObeBlueprint(courseId, blueprint);
        }
        imported.push("assessment blueprint");
      }

      if (choices.marks) {
        const latestMarkData = await getObeMarks(courseId);
        const latestStudents = Array.isArray(latestMarkData?.students)
          ? latestMarkData.students
          : [];
        const latestBlueprints = Array.isArray(latestMarkData?.blueprints)
          ? latestMarkData.blueprints
          : [];

        const records = await parseObeImportedMarkWorkbook(
          file,
          latestStudents,
          latestBlueprints
        );
        await saveObeMarks(courseId, { records });
        imported.push("marks");
      }

      await Promise.all([loadSetup(), loadBlueprints(), loadMarks()]);
      setOutputData(null);
      if (activeSubtab === "output") await loadOutput();

      Swal.fire(
        "Imported",
        `${imported.join(", ")} imported successfully from the OBE workbook.`,
        "success"
      );
    } catch (error) {
      console.error(error);
      Swal.fire(
        "Import failed",
        error?.message ||
          error?.response?.data?.message ||
          "Failed to import OBE workbook.",
        "error"
      );
    } finally {
      event.target.value = "";
    }
  };


  const handleObeMarksExcelImport = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    const allowedTypes = new Set(
      isLabCourse ? ["mid", "final"] : ["ct", "assignment", "mid", "final", "attendance"]
    );

    try {
      const buffer = await file.arrayBuffer();
      const parsedWorkbook = parseObeMarksWorkbook(buffer);
      const { workbook, sheetNames, metadata } = parsedWorkbook;
      if (!sheetNames.length) throw new Error("No worksheet was found in this Excel file.");

      let sheetName = chooseDefaultObeMarksSheet(sheetNames, course);
      if (sheetNames.length > 1) {
        const sheetResult = await premiumSwal({
          title: "Choose Excel worksheet",
          width: 560,
          html: `
            <div style="text-align:left">
              <p class="premium-dialog-muted" style="margin:0 0 12px;font-size:13px;line-height:1.55">
                The workbook contains multiple sheets. Select the sheet that contains the student OBE marks.
              </p>
              <select id="obe-generic-sheet" class="swal2-select" style="display:block;width:100%;margin:0">
                ${sheetNames
                  .map(
                    (name) =>
                      `<option value="${escapeHtml(name)}" ${name === sheetName ? "selected" : ""}>${escapeHtml(name)}</option>`
                  )
                  .join("")}
              </select>
            </div>
          `,
          showCancelButton: true,
          confirmButtonText: "Analyse Sheet",
          confirmButtonColor: "#4f46e5",
          preConfirm: () => document.getElementById("obe-generic-sheet")?.value || "",
        });
        if (!sheetResult.isConfirmed) return;
        sheetName = sheetResult.value;
      }

      const analysis = analyzeObeMarksSheet(workbook, sheetName, {
        courseType,
        metadata,
      });
      if (analysis.error) throw new Error(analysis.error);
      if (!analysis.rows.length) throw new Error("No student rows were detected in the selected worksheet.");

      const supportedGroups = analysis.groups
        .filter(
          (group) =>
            (allowedTypes.has(group.assessmentType) || group.assessmentType === "other") &&
            group.columns.some((column) => column.recommended)
        )
        .map((group) => ({
          ...group,
          columns: group.columns.filter((column) => column.recommended),
        }));

      const ignoredGroups = analysis.groups.filter(
        (group) =>
          group.columns.some((column) => column.recommended) &&
          !allowedTypes.has(group.assessmentType) &&
          group.assessmentType !== "other"
      );

      if (!supportedGroups.length) {
        throw new Error(
          isLabCourse
            ? "No Lab Mid or Lab Final mark columns could be detected. Lab Evaluation/Attendance are not entered through Lab OBE Mark Entry."
            : "No supported OBE assessment columns could be detected in this worksheet."
        );
      }

      let workingSetup = setup;
      let workingBlueprints = Array.isArray(markBlueprints) ? [...markBlueprints] : [];
      let workingHasPersistedSetup = hasPersistedSetup;

      const initialHasMappings =
        Array.isArray(workingSetup?.mappings) && workingSetup.mappings.length > 0;
      if (!workingHasPersistedSetup || !initialHasMappings || !workingBlueprints.length) {
        const missingParts = [
          !workingHasPersistedSetup
            ? "OBE setup"
            : !initialHasMappings
              ? "CO-PO mappings"
              : "",
          !workingBlueprints.length ? "assessment blueprints" : "",
        ].filter(Boolean);

        const continueResult = await premiumSwal({
          title: "Complete the OBE configuration first",
          width: 760,
          html: `
            <div class="premium-dialog-soft-indigo" style="padding:15px 16px;margin-bottom:14px">
              <div class="premium-dialog-strong" style="font-size:13px;font-weight:900">Missing: ${escapeHtml(missingParts.join(" · "))}</div>
              <div class="premium-dialog-muted" style="margin-top:5px;font-size:12px">Choose how the importer should obtain the missing CO, PO, mapping and assessment information.</div>
            </div>

            <label class="premium-dialog-card" style="display:flex;gap:12px;align-items:flex-start;padding:14px 15px;margin-bottom:10px;cursor:pointer">
              <input type="radio" name="obe-config-source" value="excel" checked style="margin-top:3px;width:17px;height:17px" />
              <span>
                <strong class="premium-dialog-strong" style="display:block">Use this Excel workbook</strong>
                <span class="premium-dialog-muted" style="display:block;margin-top:4px;font-size:12px">Detect CO/CLO and PO/PLO wording from the mark sheet. Anything still missing will be asked in the next step.</span>
              </span>
            </label>

            <label class="premium-dialog-soft-sky" style="display:flex;gap:12px;align-items:flex-start;padding:14px 15px;cursor:pointer">
              <input type="radio" name="obe-config-source" value="pdf" style="margin-top:3px;width:17px;height:17px" />
              <span style="min-width:0;flex:1">
                <strong class="premium-dialog-strong" style="display:block">Use Course Outline PDF</strong>
                <span class="premium-dialog-muted" style="display:block;margin-top:4px;font-size:12px">Recommended when the mark workbook does not contain CO-PO statements or mappings. The same PDF parser used in Setup / Assessment Blueprint will be used here.</span>
                <input id="obe-config-outline-pdf" type="file" accept=".pdf,application/pdf" style="display:block;width:100%;margin-top:10px;padding:9px 10px" />
              </span>
            </label>
          `,
          showCancelButton: true,
          confirmButtonText: "Continue Import",
          cancelButtonText: "Cancel",
          focusConfirm: false,
          preConfirm: withSwalValidation(() => {
            const source =
              document.querySelector('input[name="obe-config-source"]:checked')?.value || "excel";
            const outlineFile = document.getElementById("obe-config-outline-pdf")?.files?.[0] || null;
            if (source === "pdf" && !outlineFile) {
              throw new Error("Choose the Course Outline PDF first.");
            }
            return { source, outlineFile };
          }),
        });
        if (!continueResult.isConfirmed) return;

        if (continueResult.value?.source === "pdf") {
          const outlineFile = continueResult.value.outlineFile;
          const outlineStructure = await parseObeCourseOutlinePdf(
            outlineFile,
            workingSetup || {}
          );

          if (!outlineStructure.setup && !outlineStructure.blueprints?.length) {
            throw new Error(
              "The selected Course Outline PDF did not contain usable CO-PO setup or assessment allocation data."
            );
          }

          if (outlineStructure.setup) {
            workingSetup = {
              ...(workingSetup || {}),
              ...outlineStructure.setup,
            };
            await saveObeSetup(courseId, workingSetup);
            workingHasPersistedSetup = true;
          }

          const outlineBlueprints = (outlineStructure.blueprints || []).map((blueprint) => ({
            ...blueprint,
            assessmentName: isLabCourse
              ? blueprint.assessmentType === "final"
                ? "Lab Final"
                : "Lab Mid"
              : blueprint.assessmentName,
          }));

          for (const blueprint of outlineBlueprints) {
            const sameType = workingBlueprints.find(
              (row) =>
                String(row.assessmentType || "").toLowerCase() ===
                  String(blueprint.assessmentType || "").toLowerCase() &&
                Math.abs(Number(row.totalMarks || 0) - Number(blueprint.totalMarks || 0)) < 0.01
            );
            if (sameType) continue;

            const itemTotal = round2(
              (blueprint.items || []).reduce(
                (sum, item) => sum + Number(item.marks || 0),
                0
              )
            );
            if (
              !blueprint.items?.length ||
              Number(blueprint.totalMarks || 0) <= 0 ||
              Math.abs(itemTotal - Number(blueprint.totalMarks || 0)) > 0.01
            ) {
              continue;
            }

            const created = normalizeBlueprintLabels(
              await createObeBlueprint(courseId, blueprint)
            );
            workingBlueprints.push(created);
          }

          const remainingMissing = [];
          if (!workingHasPersistedSetup) remainingMissing.push("OBE setup");
          if (!Array.isArray(workingSetup?.mappings) || !workingSetup.mappings.length) {
            remainingMissing.push("CO-PO mappings");
          }
          if (!workingBlueprints.length) remainingMissing.push("assessment blueprints");

          await premiumSwal({
            icon: remainingMissing.length ? "warning" : "success",
            title: remainingMissing.length
              ? "PDF imported with some missing information"
              : "Course Outline mapping loaded",
            html: `
              <div class="premium-dialog-card" style="padding:14px 15px">
                <div><strong class="premium-dialog-strong">Detected:</strong> ${Number(outlineStructure.detected?.courseOutcomeCount || 0)} CO(s), ${Number(outlineStructure.detected?.poCount || 0)} used PO(s), ${Number(outlineStructure.detected?.mappingCount || 0)} mapping(s), ${Number(outlineStructure.detected?.assessmentCount || 0)} blueprint(s).</div>
                ${remainingMissing.length ? `<div class="premium-dialog-warning" style="margin-top:10px;padding:10px 12px">Still missing: ${escapeHtml(remainingMissing.join(", "))}. The next step will ask only for those details.</div>` : `<div class="premium-dialog-success" style="margin-top:8px;font-weight:800">The Excel marks can now be matched against the imported OBE structure.</div>`}
              </div>
            `,
            confirmButtonText: "Continue",
          });
        }
      }

      const sourceTypeCounts = supportedGroups.reduce((map, group) => {
        map.set(group.assessmentType, (map.get(group.assessmentType) || 0) + 1);
        return map;
      }, new Map());
      const claimedBlueprintIds = new Set();
      let groupPlans = supportedGroups.map((group) => {
        const sourceName = normalizeObeImportLabel(group.assessmentName);
        const sameTypeBlueprints = workingBlueprints.filter(
          (blueprint) =>
            String(blueprint.assessmentType || "").toLowerCase() ===
            String(group.assessmentType || "").toLowerCase()
        );
        let existingBlueprint = sameTypeBlueprints.find((blueprint) => {
          const targetName = normalizeObeImportLabel(blueprint.assessmentName);
          return (
            targetName === sourceName ||
            (targetName && sourceName && (targetName.includes(sourceName) || sourceName.includes(targetName)))
          );
        }) || null;

        if (
          !existingBlueprint &&
          group.assessmentType !== "other" &&
          sourceTypeCounts.get(group.assessmentType) === 1
        ) {
          existingBlueprint = findMatchingBlueprintForGroup(group, workingBlueprints);
        }
        if (!existingBlueprint && group.assessmentType === "other") {
          existingBlueprint = workingBlueprints.find(
            (blueprint) => normalizeObeImportLabel(blueprint.assessmentName) === sourceName
          ) || null;
        }
        if (
          existingBlueprint &&
          claimedBlueprintIds.has(String(existingBlueprint._id))
        ) {
          existingBlueprint = null;
        }
        if (existingBlueprint) {
          claimedBlueprintIds.add(String(existingBlueprint._id));
        }

        if (!existingBlueprint) {
          return {
            mode: "create",
            group,
            assessmentName: group.assessmentName,
            assessmentType: allowedTypes.has(group.assessmentType)
              ? group.assessmentType
              : "",
            totalMarks: Number(group.totalMarks || 0),
            columnPlans: group.columns.map((column, index) => ({
              column,
              include: true,
              coCode: column.coCode || "",
              maxMarks: Number(column.suggestedMaxMarks || 0),
              itemLabel:
                column.coCode ||
                String(column.childHeader || "").trim() ||
                `Q${index + 1}`,
            })),
          };
        }

        const usedItemKeys = new Set();
        const columnPlans = group.columns.map((column) => {
          let item = suggestBlueprintItemForColumn(column, existingBlueprint);
          if (item && usedItemKeys.has(String(item.key))) item = null;
          if (item) usedItemKeys.add(String(item.key));
          return {
            column,
            targetItemKey: item?.key || "",
          };
        });

        return {
          mode: "existing",
          group,
          existingBlueprint,
          columnPlans,
        };
      });

      const needsAssessmentReview = groupPlans.some(
        (plan) =>
          plan.mode === "create" ||
          plan.columnPlans.some((columnPlan) => !columnPlan.targetItemKey)
      );

      if (needsAssessmentReview) {
        const assessmentHtml = groupPlans
          .map((plan, groupIndex) => {
            const group = plan.group;
            if (plan.mode === "existing") {
              const itemOptions = (plan.existingBlueprint.items || [])
                .map(
                  (item) =>
                    `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)} · ${escapeHtml(item.coCode)} · ${Number(item.marks || 0)}</option>`
                )
                .join("");

              const rows = plan.columnPlans
                .map(
                  (columnPlan, columnIndex) => `
                    <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,1fr);gap:10px;align-items:center;margin-top:9px">
                      <div class="premium-dialog-strong" style="font-size:12px;font-weight:700">${escapeHtml(columnPlan.column.sourceLabel)}</div>
                      <select id="obe-map-${groupIndex}-${columnIndex}" class="premium-dialog-field" style="width:100%">
                        <option value="">Skip this column</option>
                        ${(plan.existingBlueprint.items || [])
                          .map(
                            (item) =>
                              `<option value="${escapeHtml(item.key)}" ${String(item.key) === String(columnPlan.targetItemKey) ? "selected" : ""}>${escapeHtml(item.label)} · ${escapeHtml(item.coCode)} · ${Number(item.marks || 0)}</option>`
                          )
                          .join("")}
                      </select>
                    </div>
                  `
                )
                .join("");

              return `
                <div class="premium-dialog-card" style="padding:14px;margin-bottom:12px">
                  <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
                    <div>
                      <div class="premium-dialog-strong" style="font-weight:800">${escapeHtml(group.assessmentName)}</div>
                      <div class="premium-dialog-muted" style="font-size:11px;margin-top:2px">Excel assessment matched to existing “${escapeHtml(plan.existingBlueprint.assessmentName)}”.</div>
                    </div>
                    <span class="premium-dialog-badge premium-dialog-success">EXISTING</span>
                  </div>
                  ${rows}
                </div>
              `;
            }

            return `
              <div class="premium-dialog-soft-indigo" style="padding:14px;margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px">
                  <div>
                    <div class="premium-dialog-strong" style="font-weight:800">New assessment from Excel</div>
                    <div class="premium-dialog-muted" style="font-size:11px;margin-top:2px">No matching blueprint exists. Confirm the assessment and question/CO full marks.</div>
                  </div>
                  <span class="premium-dialog-badge premium-dialog-accent">CREATE</span>
                </div>
                <div style="display:grid;grid-template-columns:minmax(0,1fr) 150px 120px;gap:10px">
                  <label class="premium-dialog-label">Assessment name
                    <input id="obe-create-name-${groupIndex}" value="${escapeHtml(plan.assessmentName)}" class="premium-dialog-field" style="display:block;width:100%;margin-top:4px" />
                  </label>
                  <label class="premium-dialog-label">Assessment type
                    <select id="obe-create-type-${groupIndex}" class="premium-dialog-field" style="display:block;width:100%;margin-top:4px">
                      <option value="">Select type</option>
                      ${(isLabCourse ? ["mid", "final"] : ["ct", "assignment", "mid", "final", "attendance"])
                        .map(
                          (type) =>
                            `<option value="${type}" ${type === plan.assessmentType ? "selected" : ""}>${escapeHtml(getAssessmentTypeLabel(type, isLabCourse))}</option>`
                        )
                        .join("")}
                    </select>
                  </label>
                  <label class="premium-dialog-label">Total marks
                    <input id="obe-create-total-${groupIndex}" type="number" min="0" step="0.5" value="${plan.totalMarks || ""}" class="premium-dialog-field" style="display:block;width:100%;margin-top:4px" />
                  </label>
                </div>
                <div class="premium-dialog-muted" style="margin-top:10px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em">Excel column → CO / full marks</div>
                ${plan.columnPlans
                  .map(
                    (columnPlan, columnIndex) => `
                      <div style="display:grid;grid-template-columns:30px minmax(0,1fr) 95px 95px;gap:8px;align-items:center;margin-top:8px">
                        <input id="obe-create-use-${groupIndex}-${columnIndex}" type="checkbox" checked />
                        <div class="premium-dialog-strong" style="font-size:12px;font-weight:700">${escapeHtml(columnPlan.column.sourceLabel)}</div>
                        <input id="obe-create-co-${groupIndex}-${columnIndex}" value="${escapeHtml(columnPlan.coCode)}" placeholder="CO1" class="premium-dialog-field" style="width:100%" />
                        <input id="obe-create-max-${groupIndex}-${columnIndex}" type="number" min="0" step="0.5" value="${columnPlan.maxMarks || ""}" placeholder="Marks" class="premium-dialog-field" style="width:100%" />
                      </div>
                    `
                  )
                  .join("")}
              </div>
            `;
          })
          .join("");

        const assessmentResult = await premiumSwal({
          title: "Review assessment mapping",
          width: 900,
          html: `
            <div style="text-align:left;max-height:62vh;overflow:auto;padding-right:4px">
              <p class="premium-dialog-muted" style="margin:0 0 12px;font-size:13px;line-height:1.55">
                Existing assessments are mapped by wording and CO where possible. Missing assessments can be created directly from this Excel file.
              </p>
              ${assessmentHtml}
            </div>
          `,
          showCancelButton: true,
          confirmButtonText: "Continue",
          cancelButtonText: "Cancel",
          confirmButtonColor: "#4f46e5",
          focusConfirm: false,
          preConfirm: withSwalValidation(() => {
            const nextPlans = groupPlans.map((plan, groupIndex) => {
              if (plan.mode === "existing") {
                const usedTargets = new Set();
                const columnPlans = plan.columnPlans.map((columnPlan, columnIndex) => {
                  const targetItemKey = document.getElementById(
                    `obe-map-${groupIndex}-${columnIndex}`
                  )?.value || "";
                  if (targetItemKey) {
                    if (usedTargets.has(targetItemKey)) {
                      throw new Error(
                        `${plan.existingBlueprint.assessmentName}: two Excel columns cannot map to the same OBE item.`
                      );
                    }
                    usedTargets.add(targetItemKey);
                  }
                  return { ...columnPlan, targetItemKey };
                });
                return { ...plan, columnPlans };
              }

              const assessmentName = String(
                document.getElementById(`obe-create-name-${groupIndex}`)?.value || ""
              ).trim();
              const assessmentType = String(
                document.getElementById(`obe-create-type-${groupIndex}`)?.value || ""
              ).trim().toLowerCase();
              let totalMarks = Number(
                document.getElementById(`obe-create-total-${groupIndex}`)?.value || 0
              );
              if (!assessmentName) {
                throw new Error("Every new assessment needs a name.");
              }
              if (!allowedTypes.has(assessmentType)) {
                throw new Error(`${assessmentName}: select a valid assessment type.`);
              }

              const columnPlans = plan.columnPlans.map((columnPlan, columnIndex) => {
                const include = document.getElementById(
                  `obe-create-use-${groupIndex}-${columnIndex}`
                )?.checked === true;
                const coCode = String(
                  document.getElementById(`obe-create-co-${groupIndex}-${columnIndex}`)?.value || ""
                )
                  .trim()
                  .toUpperCase()
                  .replace(/^CLO/, "CO");
                const maxMarks = Number(
                  document.getElementById(`obe-create-max-${groupIndex}-${columnIndex}`)?.value || 0
                );

                if (include && !/^CO\d{1,2}$/.test(coCode)) {
                  throw new Error(`${columnPlan.column.sourceLabel}: enter a valid CO such as CO1.`);
                }
                if (include && (!Number.isFinite(maxMarks) || maxMarks <= 0)) {
                  throw new Error(`${columnPlan.column.sourceLabel}: enter its full marks.`);
                }

                return {
                  ...columnPlan,
                  include,
                  coCode,
                  maxMarks: round2(maxMarks),
                  itemLabel:
                    columnPlan.column.coCode ||
                    String(columnPlan.column.childHeader || "").trim() ||
                    coCode,
                };
              });

              const included = columnPlans.filter((row) => row.include);
              if (!included.length) {
                return { ...plan, mode: "skip", assessmentName, assessmentType, totalMarks: 0, columnPlans };
              }

              const itemTotal = round2(
                included.reduce((sum, row) => sum + Number(row.maxMarks || 0), 0)
              );
              if (!totalMarks) totalMarks = itemTotal;
              totalMarks = round2(totalMarks);
              if (Math.abs(itemTotal - totalMarks) > 0.01) {
                throw new Error(
                  `${assessmentName}: question/CO full marks add up to ${itemTotal}, but assessment total is ${totalMarks}.`
                );
              }
              if (
                isLabCourse &&
                ((assessmentType === "mid" && totalMarks !== 30) ||
                  (assessmentType === "final" && totalMarks !== 40))
              ) {
                throw new Error(
                  `${assessmentName}: Lab Mid must total 30 and Lab Final must total 40.`
                );
              }

              return {
                ...plan,
                assessmentName,
                assessmentType,
                totalMarks,
                columnPlans,
              };
            });

            return nextPlans;
          }),
        });

        if (!assessmentResult?.isConfirmed) return;
        groupPlans = assessmentResult.value;
      }

      const activePlans = groupPlans.filter((plan) => plan.mode !== "skip");
      if (!activePlans.length) throw new Error("No Excel mark columns were selected for import.");

      const requiredCoCodes = new Set();
      activePlans.forEach((plan) => {
        if (plan.mode === "existing") {
          plan.columnPlans.forEach((columnPlan) => {
            if (!columnPlan.targetItemKey) return;
            const item = (plan.existingBlueprint.items || []).find(
              (row) => String(row.key) === String(columnPlan.targetItemKey)
            );
            if (item?.coCode) requiredCoCodes.add(String(item.coCode).toUpperCase());
          });
        } else {
          plan.columnPlans
            .filter((row) => row.include)
            .forEach((row) => requiredCoCodes.add(String(row.coCode).toUpperCase()));
        }
      });

      const currentCoRows = (workingSetup.courseOutcomes || []).filter(
        (row) => String(row?.code || "").trim() && String(row?.statement || "").trim()
      );
      const currentPoRows = (workingSetup.poStatements || []).filter(
        (row) => String(row?.code || "").trim() && String(row?.statement || "").trim()
      );
      const currentMappings = (workingSetup.mappings || []).filter(
        (row) => String(row?.coCode || "").trim() && String(row?.targetCode || "").trim()
      );

      const coMap = new Map(
        currentCoRows.map((row) => [String(row.code).trim().toUpperCase(), { ...row }])
      );
      const poMap = new Map(
        currentPoRows.map((row) => [String(row.code).trim().toUpperCase(), { ...row }])
      );
      const nextMappings = [...currentMappings];
      const directMappingMap = new Map();

      (analysis.metadata?.coPoMappings || []).forEach((mapping) => {
        const coCode = String(mapping.coCode || "").toUpperCase();
        const poCode = String(mapping.poCode || "").toUpperCase();
        if (!coCode || !poCode) return;
        if (!directMappingMap.has(coCode)) directMappingMap.set(coCode, []);
        if (!directMappingMap.get(coCode).includes(poCode)) {
          directMappingMap.get(coCode).push(poCode);
        }
      });
      analysis.selectedColumns.forEach((column) => {
        if (!column.coCode || !column.poCode) return;
        if (!directMappingMap.has(column.coCode)) directMappingMap.set(column.coCode, []);
        if (!directMappingMap.get(column.coCode).includes(column.poCode)) {
          directMappingMap.get(column.coCode).push(column.poCode);
        }
      });

      const setupQuestions = [];
      requiredCoCodes.forEach((coCode) => {
        const hasCo = coMap.has(coCode);
        const existingPoMappings = nextMappings.filter(
          (row) =>
            String(row.coCode || "").toUpperCase() === coCode &&
            String(row.targetType || "PO").toUpperCase() !== "PSO"
        );
        const detectedPoMappings = directMappingMap.get(coCode) || [];

        if (!hasCo) {
          coMap.set(coCode, {
            code: coCode,
            statement: analysis.metadata?.coStatements?.[coCode] || "",
            order: coMap.size,
            isActive: true,
          });
        }

        if (!existingPoMappings.length && detectedPoMappings.length) {
          detectedPoMappings.forEach((poCode) => {
            if (!poMap.has(poCode)) {
              poMap.set(poCode, {
                code: poCode,
                statement: analysis.metadata?.poStatements?.[poCode] || poCode,
                order: poMap.size,
                isActive: true,
              });
            }
            if (
              !nextMappings.some(
                (row) =>
                  String(row.coCode || "").toUpperCase() === coCode &&
                  String(row.targetCode || "").toUpperCase() === poCode
              )
            ) {
              nextMappings.push({
                coCode,
                targetType: "PO",
                targetCode: poCode,
                strength: 1,
              });
            }
          });
        }

        const stillNoMapping = !nextMappings.some(
          (row) =>
            String(row.coCode || "").toUpperCase() === coCode &&
            String(row.targetType || "PO").toUpperCase() !== "PSO"
        );
        const missingStatement = !String(coMap.get(coCode)?.statement || "").trim();
        if (missingStatement || stillNoMapping) {
          setupQuestions.push({ coCode, missingStatement, missingMapping: stillNoMapping });
        }
      });

      if (setupQuestions.length) {
        const knownPoCodes = new Set([
          ...analysis.detectedPoCodes,
          ...poMap.keys(),
          ...Array.from({ length: 12 }, (_, index) => `PO${index + 1}`),
        ]);
        const orderedPoCodes = [...knownPoCodes].sort(
          (a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, ""))
        );

        const setupResult = await premiumSwal({
          title: "Complete missing CO-PO information",
          width: 860,
          html: `
            <div style="text-align:left;max-height:60vh;overflow:auto;padding-right:4px">
              <p class="premium-dialog-muted" style="margin:0 0 12px;font-size:13px;line-height:1.55">
                Some information required by OBE is not present in the current setup or could not be detected from Excel. Complete only the missing fields below.
              </p>
              <div class="premium-dialog-soft-sky" style="padding:12px 13px;margin-bottom:12px">
                <strong class="premium-dialog-strong" style="display:block;font-size:12px">Optional: fill missing mapping from Course Outline PDF</strong>
                <span class="premium-dialog-muted" style="display:block;margin-top:3px;font-size:11px">Select the outline and the importer will use its CO statements, PO statements and CO→PO rows wherever the fields below are still blank.</span>
                <input id="obe-missing-outline-pdf" type="file" accept=".pdf,application/pdf" style="display:block;width:100%;margin-top:9px;padding:8px 9px" />
                <div id="obe-missing-outline-status" class="premium-dialog-muted" style="margin-top:7px;font-size:11px">Choose a PDF to read its CO statements and every CO→PO relationship automatically.</div>
              </div>
              ${setupQuestions
                .map((question, index) => {
                  const row = coMap.get(question.coCode) || {};
                  const defaultPos = directMappingMap.get(question.coCode) ||
                    (analysis.detectedPoCodes.length === 1 ? [analysis.detectedPoCodes[0]] : []);
                  return `
                    <div class="premium-dialog-card" style="padding:12px;margin-bottom:10px">
                      <div class="premium-dialog-strong" style="font-weight:800;margin-bottom:8px">${escapeHtml(question.coCode)}</div>
                      ${question.missingStatement ? `
                        <label class="premium-dialog-label" style="display:block">CO statement
                          <input id="obe-setup-co-statement-${index}" value="${escapeHtml(row.statement || "")}" placeholder="Enter the ${escapeHtml(question.coCode)} statement" class="premium-dialog-field" style="display:block;width:100%;margin-top:4px" />
                        </label>
                      ` : ""}
                      ${question.missingMapping ? `
                        <div class="premium-dialog-label" style="display:block;margin-top:10px">Map ${escapeHtml(question.coCode)} to one or more Program Outcomes</div>
                        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:7px">
                          ${orderedPoCodes
                            .map(
                              (poCode) => `
                                <label style="display:flex;align-items:center;gap:7px;padding:8px 9px;border:1px solid var(--premium-border,#dbe3ef);border-radius:10px;cursor:pointer">
                                  <input type="checkbox" name="obe-setup-po-${index}" value="${poCode}" ${defaultPos.includes(poCode) ? "checked" : ""} />
                                  <span class="premium-dialog-strong" style="font-size:12px">${poCode}</span>
                                </label>`
                            )
                            .join("")}
                        </div>
                        <div class="premium-dialog-muted" style="margin-top:6px;font-size:11px">If a Course Outline PDF is attached above, every PO mapped to ${escapeHtml(question.coCode)} in that outline will also be added automatically.</div>
                      ` : ""}
                    </div>
                  `;
                })
                .join("")}
            </div>
          `,
          showCancelButton: true,
          confirmButtonText: "Use This Setup",
          cancelButtonText: "Cancel",
          confirmButtonColor: "#4f46e5",
          focusConfirm: false,
          didOpen: () => {
            const input = document.getElementById("obe-missing-outline-pdf");
            const status = document.getElementById("obe-missing-outline-status");
            input?.addEventListener("change", async () => {
              const outlineFile = input.files?.[0] || null;
              input._obeParsedOutline = null;
              if (!outlineFile) {
                if (status) status.textContent = "Choose a PDF to read its CO statements and every CO→PO relationship automatically.";
                return;
              }
              if (status) status.textContent = "Reading Course Outline PDF…";
              try {
                const parsedOutline = await parseObeCourseOutlinePdf(outlineFile, workingSetup || {});
                input._obeParsedOutline = parsedOutline;
                const outlineSetup = parsedOutline.setup || {};

                setupQuestions.forEach((question, index) => {
                  const pdfCo = (outlineSetup.courseOutcomes || []).find(
                    (item) => String(item.code || "").toUpperCase() === question.coCode
                  );
                  const statementInput = document.getElementById(`obe-setup-co-statement-${index}`);
                  if (statementInput && !String(statementInput.value || "").trim() && pdfCo?.statement) {
                    statementInput.value = pdfCo.statement;
                  }

                  const mappedPos = (outlineSetup.mappings || [])
                    .filter(
                      (item) =>
                        String(item.coCode || "").toUpperCase() === question.coCode &&
                        String(item.targetType || "PO").toUpperCase() !== "PSO"
                    )
                    .map((item) => String(item.targetCode || "").toUpperCase());
                  mappedPos.forEach((poCode) => {
                    const checkbox = document.querySelector(
                      `input[name="obe-setup-po-${index}"][value="${poCode}"]`
                    );
                    if (checkbox) checkbox.checked = true;
                  });
                });

                if (status) {
                  const mappingCount = Number(parsedOutline.detected?.mappingCount || 0);
                  const poCount = Number(parsedOutline.detected?.poCount || 0);
                  status.innerHTML = mappingCount
                    ? `<span style="color:#059669;font-weight:800">Loaded ${mappingCount} CO→PO mapping${mappingCount === 1 ? "" : "s"} across ${poCount} used PO${poCount === 1 ? "" : "s"}.</span> Review the checked POs below, then continue.`
                    : `<span style="color:#b45309;font-weight:800">The PDF was read, but no CO→PO mapping was detected.</span> You can select the POs manually below.`;
                }
              } catch (error) {
                if (status) status.innerHTML = `<span style="color:#be123c;font-weight:800">${escapeHtml(error?.message || "Could not read this Course Outline PDF.")}</span>`;
              }
            });
          },
          preConfirm: async () => {
            try {
              const outlineInput = document.getElementById("obe-missing-outline-pdf");
              const outlineFile = outlineInput?.files?.[0] || null;
              let outlineSetup = outlineInput?._obeParsedOutline?.setup || null;
              if (outlineFile && !outlineSetup) {
                const parsedOutline = await parseObeCourseOutlinePdf(outlineFile, workingSetup || {});
                outlineSetup = parsedOutline.setup || null;
              }

              setupQuestions.forEach((question, index) => {
                const row = coMap.get(question.coCode) || {
                  code: question.coCode,
                  order: coMap.size,
                  isActive: true,
                };
                if (question.missingStatement) {
                  const manualStatement = String(
                    document.getElementById(`obe-setup-co-statement-${index}`)?.value || ""
                  ).trim();
                  const pdfStatement = String(
                    (outlineSetup?.courseOutcomes || []).find(
                      (item) => String(item.code || "").toUpperCase() === question.coCode
                    )?.statement || ""
                  ).trim();
                  const statement = manualStatement || pdfStatement;
                  if (!statement) {
                    throw new Error(`${question.coCode}: enter the Course Outcome statement or attach a Course Outline PDF containing it.`);
                  }
                  row.statement = statement;
                  coMap.set(question.coCode, row);
                }

                if (question.missingMapping) {
                  const manualPos = Array.from(
                    document.querySelectorAll(`input[name="obe-setup-po-${index}"]:checked`)
                  )
                    .map((input) => String(input.value || "").trim().toUpperCase())
                    .filter((code) => /^PO\d{1,2}$/.test(code));

                  const pdfMappings = (outlineSetup?.mappings || []).filter(
                    (item) =>
                      String(item.coCode || "").toUpperCase() === question.coCode &&
                      String(item.targetType || "PO").toUpperCase() !== "PSO" &&
                      /^PO\d{1,2}$/.test(String(item.targetCode || "").toUpperCase())
                  );
                  const poCodes = [
                    ...new Set([
                      ...manualPos,
                      ...pdfMappings.map((item) => String(item.targetCode || "").toUpperCase()),
                    ]),
                  ];

                  if (!poCodes.length) {
                    throw new Error(`${question.coCode}: select at least one mapped PO or attach a Course Outline PDF containing the mapping.`);
                  }

                  poCodes.forEach((poCode) => {
                    const pdfMapping = pdfMappings.find(
                      (item) => String(item.targetCode || "").toUpperCase() === poCode
                    );
                    if (!poMap.has(poCode)) {
                      const pdfPoStatement = String(
                        (outlineSetup?.poStatements || []).find(
                          (item) => String(item.code || "").toUpperCase() === poCode
                        )?.statement || ""
                      ).trim();
                      poMap.set(poCode, {
                        code: poCode,
                        statement:
                          pdfPoStatement ||
                          analysis.metadata?.poStatements?.[poCode] ||
                          poCode,
                        order: poMap.size,
                        isActive: true,
                      });
                    }
                    if (
                      !nextMappings.some(
                        (item) =>
                          String(item.coCode || "").toUpperCase() === question.coCode &&
                          String(item.targetType || "PO").toUpperCase() !== "PSO" &&
                          String(item.targetCode || "").toUpperCase() === poCode
                      )
                    ) {
                      nextMappings.push({
                        coCode: question.coCode,
                        targetType: "PO",
                        targetCode: poCode,
                        strength: Number(pdfMapping?.strength || 1) || 1,
                      });
                    }
                  });
                }
              });
              return true;
            } catch (error) {
              Swal.showValidationMessage(error?.message || "Complete the missing CO-PO information.");
              return false;
            }
          },
        });
        if (!setupResult?.isConfirmed) return;
      }

      const nextCourseOutcomes = [...coMap.values()].map((row, index) => ({
        ...row,
        order: index,
        isActive: row.isActive !== false,
      }));
      const usedPoCodes = new Set(
        nextMappings
          .filter((row) => String(row.targetType || "PO").toUpperCase() !== "PSO")
          .map((row) => String(row.targetCode || "").toUpperCase())
          .filter(Boolean)
      );
      const nextPoStatements = [...poMap.values()]
        .filter((row) => usedPoCodes.has(String(row.code || "").toUpperCase()))
        .map((row, index) => ({ ...row, order: index, isActive: row.isActive !== false }));

      const setupNeedsSave =
        !workingHasPersistedSetup ||
        nextCourseOutcomes.length !== currentCoRows.length ||
        nextPoStatements.length !== currentPoRows.length ||
        nextMappings.length !== currentMappings.length ||
        nextCourseOutcomes.some((row) => {
          const current = currentCoRows.find(
            (old) => String(old.code || "").toUpperCase() === String(row.code || "").toUpperCase()
          );
          return !current || String(current.statement || "").trim() !== String(row.statement || "").trim();
        });

      const studentLookup = new Map(
        markStudents.map((student) => [String(student.roll || "").trim().toLowerCase(), student])
      );
      let matchedStudents = 0;
      let unmatchedStudents = 0;
      let nameMismatches = 0;
      analysis.rows.forEach((row) => {
        const student = studentLookup.get(String(row.roll || "").trim().toLowerCase());
        if (!student) {
          unmatchedStudents += 1;
          return;
        }
        matchedStudents += 1;
        if (
          row.name &&
          student.name &&
          normalizeStudentNameForImport(row.name) !== normalizeStudentNameForImport(student.name)
        ) {
          nameMismatches += 1;
        }
      });

      const mappedExistingGroups = activePlans.filter((plan) => plan.mode === "existing").length;
      const newGroups = activePlans.filter((plan) => plan.mode === "create").length;
      const mappedColumnCount = activePlans.reduce(
        (sum, plan) =>
          sum +
          plan.columnPlans.filter((row) =>
            plan.mode === "existing" ? Boolean(row.targetItemKey) : row.include
          ).length,
        0
      );

      const confirmResult = await premiumSwal({
        title: "Confirm OBE Excel Import",
        width: 720,
        html: `
          <div style="text-align:left">
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px">
              <div class="premium-dialog-card" style="padding:12px"><div class="premium-dialog-muted" style="font-size:10px;font-weight:800;text-transform:uppercase">Students matched</div><div class="premium-dialog-strong" style="font-size:20px;font-weight:900;margin-top:3px">${matchedStudents}</div></div>
              <div class="premium-dialog-card" style="padding:12px"><div class="premium-dialog-muted" style="font-size:10px;font-weight:800;text-transform:uppercase">Excel columns mapped</div><div class="premium-dialog-strong" style="font-size:20px;font-weight:900;margin-top:3px">${mappedColumnCount}</div></div>
            </div>
            <div class="premium-dialog-strong" style="font-size:13px;line-height:1.7">
              <div><strong>Worksheet:</strong> ${escapeHtml(sheetName)}</div>
              <div><strong>Existing assessments used:</strong> ${mappedExistingGroups}</div>
              <div><strong>New assessments to create:</strong> ${newGroups}</div>
              <div><strong>OBE setup update:</strong> ${setupNeedsSave ? "Yes" : "No"}</div>
              ${unmatchedStudents ? `<div style="color:#b45309"><strong>Students not enrolled:</strong> ${unmatchedStudents} (skipped)</div>` : ""}
              ${nameMismatches ? `<div style="color:#b45309"><strong>Name differences:</strong> ${nameMismatches} (roll number remains the primary match)</div>` : ""}
              ${analysis.duplicateRolls.length ? `<div style="color:#b45309"><strong>Duplicate Excel rolls:</strong> ${analysis.duplicateRolls.length} (later duplicates skipped)</div>` : ""}
              ${ignoredGroups.length ? `<div style="color:#b45309"><strong>Unsupported groups ignored:</strong> ${ignoredGroups.map((group) => escapeHtml(group.assessmentName)).join(", ")}</div>` : ""}
            </div>
            <div style="margin-top:15px;padding-top:13px;border-top:1px solid #e2e8f0">
              <div class="premium-dialog-muted" style="font-size:11px;font-weight:800;text-transform:uppercase;margin-bottom:8px">Existing OBE mark cells</div>
              <label style="display:flex;align-items:center;gap:8px;margin-bottom:7px;cursor:pointer"><input type="radio" name="obe-import-mode" value="blank" checked /> Fill blank cells only (recommended)</label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="radio" name="obe-import-mode" value="replace" /> Replace existing OBE marks with Excel values</label>
            </div>
            <p class="premium-dialog-muted" style="margin:14px 0 0;font-size:12px;line-height:1.55">After confirmation, required setup/assessments will be created first and the imported OBE marks will be saved.</p>
          </div>
        `,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Import & Save",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#4f46e5",
        focusConfirm: false,
        preConfirm: () => ({
          overwrite:
            document.querySelector('input[name="obe-import-mode"]:checked')?.value === "replace",
        }),
      });
      if (!confirmResult.isConfirmed) return;
      const overwrite = confirmResult.value?.overwrite === true;

      const preliminaryTargets = new Map();
      activePlans.forEach((plan) => {
        if (plan.mode === "existing") {
          plan.columnPlans.forEach((columnPlan) => {
            if (!columnPlan.targetItemKey) return;
            const item = (plan.existingBlueprint.items || []).find(
              (row) => String(row.key) === String(columnPlan.targetItemKey)
            );
            if (!item) return;
            preliminaryTargets.set(columnPlan.column.key, {
              mode: "existing",
              blueprintId: String(plan.existingBlueprint._id),
              itemKey: item.key,
              maxMarks: Number(item.marks || 0),
            });
          });
        } else {
          plan.columnPlans
            .filter((row) => row.include)
            .forEach((row) => {
              preliminaryTargets.set(row.column.key, {
                mode: "create",
                maxMarks: Number(row.maxMarks || 0),
              });
            });
        }
      });

      let potentialChanges = 0;
      analysis.rows.forEach((row) => {
        const student = studentLookup.get(String(row.roll || "").trim().toLowerCase());
        if (!student) return;
        preliminaryTargets.forEach((target, columnKey) => {
          const normalized = normalizeImportedMarkValue(row.values[columnKey]);
          if (
            normalized.kind !== "number" ||
            normalized.value < 0 ||
            normalized.value > Number(target.maxMarks || 0)
          ) {
            return;
          }
          if (!overwrite && target.mode === "existing") {
            const recordKey = `${student.studentId}__${target.blueprintId}`;
            const currentValue = markDraft[recordKey]?.[target.itemKey];
            if (currentValue !== "" && currentValue !== null && currentValue !== undefined) {
              return;
            }
          }
          potentialChanges += 1;
        });
      });

      if (!potentialChanges) {
        throw new Error(
          overwrite
            ? "No valid Excel mark values matched the selected OBE columns and enrolled students."
            : "No blank OBE cells can be filled from this Excel file. Choose Replace Existing OBE Marks if you intend to overwrite saved values."
        );
      }

      if (setupNeedsSave) {
        await saveObeSetup(courseId, {
          ...workingSetup,
          courseOutcomes: nextCourseOutcomes,
          poStatements: nextPoStatements,
          mappings: nextMappings,
        });
      }

      const targetByColumnKey = new Map();
      activePlans.forEach((plan) => {
        if (plan.mode !== "existing") return;
        plan.columnPlans.forEach((columnPlan) => {
          if (!columnPlan.targetItemKey) return;
          const item = (plan.existingBlueprint.items || []).find(
            (row) => String(row.key) === String(columnPlan.targetItemKey)
          );
          if (!item) return;
          targetByColumnKey.set(columnPlan.column.key, {
            blueprintId: plan.existingBlueprint._id,
            itemKey: item.key,
            maxMarks: Number(item.marks || 0),
          });
        });
      });

      for (const plan of activePlans) {
        if (plan.mode !== "create") continue;
        const included = plan.columnPlans.filter((row) => row.include);
        if (!included.length) continue;
        const payload = {
          assessmentName: plan.assessmentName,
          assessmentType: plan.assessmentType || plan.group.assessmentType,
          totalMarks: plan.totalMarks,
          notes: "",
          items: included.map((row, index) => ({
            key: `q${index + 1}`,
            label: row.itemLabel || row.coCode || `Q${index + 1}`,
            marks: row.maxMarks,
            coCode: row.coCode,
            order: index,
          })),
        };
        const created = normalizeBlueprintLabels(
          await createObeBlueprint(courseId, payload)
        );
        included.forEach((row, index) => {
          const item = created.items?.[index] || payload.items[index];
          targetByColumnKey.set(row.column.key, {
            blueprintId: created._id || created.id,
            itemKey: item.key,
            maxMarks: Number(item.marks || row.maxMarks || 0),
          });
        });
      }

      const latestData = await getObeMarks(courseId);
      const latestState = buildMarkEntryState(latestData);
      const latestStudentLookup = new Map(
        latestState.students.map((student) => [
          String(student.roll || "").trim().toLowerCase(),
          student,
        ])
      );
      const blueprintById = new Map(
        latestState.blueprints.map((blueprint) => [String(blueprint._id), blueprint])
      );
      const nextDraft = { ...latestState.draft };
      const touchedRecordKeys = new Set();
      let importedCells = 0;
      let skippedExisting = 0;
      let skippedInvalid = 0;
      let skippedBlank = 0;

      analysis.rows.forEach((row) => {
        const student = latestStudentLookup.get(String(row.roll || "").trim().toLowerCase());
        if (!student) return;

        targetByColumnKey.forEach((target, columnKey) => {
          const normalized = normalizeImportedMarkValue(row.values[columnKey]);
          if (normalized.kind === "blank") {
            skippedBlank += 1;
            return;
          }
          if (
            normalized.kind !== "number" ||
            normalized.value < 0 ||
            normalized.value > Number(target.maxMarks || 0)
          ) {
            skippedInvalid += 1;
            return;
          }

          const recordKey = `${student.studentId}__${target.blueprintId}`;
          if (!nextDraft[recordKey]) nextDraft[recordKey] = {};
          const currentValue = nextDraft[recordKey][target.itemKey];
          const hasExistingValue = currentValue !== "" && currentValue !== null && currentValue !== undefined;
          if (!overwrite && hasExistingValue) {
            skippedExisting += 1;
            return;
          }

          nextDraft[recordKey] = {
            ...nextDraft[recordKey],
            [target.itemKey]: normalized.value,
          };
          touchedRecordKeys.add(recordKey);
          importedCells += 1;
        });
      });

      if (!importedCells) {
        throw new Error(
          skippedExisting
            ? "No marks were changed because all matching OBE cells already contain values. Choose Replace Existing Marks to overwrite them."
            : "No valid OBE mark values could be imported from the selected worksheet."
        );
      }

      const records = [...touchedRecordKeys].map((recordKey) => {
        const [studentId, blueprintId] = recordKey.split("__");
        const blueprint = blueprintById.get(String(blueprintId));
        return {
          studentId,
          blueprintId,
          entries: (blueprint?.items || []).map((item) => ({
            itemKey: item.key,
            obtainedMarks: Number(nextDraft[recordKey]?.[item.key] || 0),
          })),
        };
      });

      await saveObeMarks(courseId, { records });
      setMarkStudents(latestState.students);
      setMarkBlueprints(latestState.blueprints);
      setMarkDraft(nextDraft);
      setHasPersistedSetup(true);
      setOutputData(null);
      await Promise.all([loadSetup(), loadBlueprints(), loadMarks()]);
      if (activeSubtab === "output") await loadOutput();

      await premiumSwal({
        title: "OBE marks imported",
        icon: "success",
        html: `
          <div class="premium-dialog-strong" style="text-align:left;font-size:13px;line-height:1.7">
            <div><strong>Imported mark cells:</strong> ${importedCells}</div>
            ${skippedExisting ? `<div><strong>Existing cells kept:</strong> ${skippedExisting}</div>` : ""}
            ${skippedBlank ? `<div><strong>Blank Excel cells skipped:</strong> ${skippedBlank}</div>` : ""}
            ${skippedInvalid ? `<div style="color:#b45309"><strong>Invalid / over-maximum values skipped:</strong> ${skippedInvalid}</div>` : ""}
            <div style="margin-top:8px">The OBE Mark Entry table has been refreshed with the saved values.</div>
          </div>
        `,
        confirmButtonColor: "#4f46e5",
      });
    } catch (error) {
      console.error(error);
      premiumSwal({
        icon: "error",
        title: "OBE Excel import failed",
        text: error?.response?.data?.message || error?.message || "Failed to import the Excel file.",
        confirmButtonText: "Close",
      });
    } finally {
      input.value = "";
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
      <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="inline-flex w-fit items-center gap-2 rounded-2xl bg-indigo-50 px-3 py-2 text-xs font-black uppercase tracking-[0.13em] text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
            <ObeIcon name="chart" className="h-4 w-4" />
            OBE / CO-PO
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              ["setup", "Setup", "setup"],
              ["blueprint", "Assessment Blueprint", "blueprint"],
              ["marks", "OBE Mark Entry", "marks"],
              ["output", "Output & Excel", "chart"],
            ].map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSubtab(id)}
                className={[
                  "rounded-2xl border px-4 py-2.5 text-sm font-semibold transition",
                  activeSubtab === id
                    ? "border-indigo-600 bg-indigo-600 text-white shadow-sm shadow-indigo-500/20"
                    : "border-slate-200 bg-slate-50/70 text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-500/10",
                ].join(" ")}
              >
                <span className="inline-flex items-center gap-2">
                  <ObeIcon name={icon} className="h-4 w-4" />
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {["setup", "blueprint"].includes(activeSubtab) && (
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
                    Replaces COs, POs, CO-PO mappings, threshold, attainment rules, and course report comments.
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

      )}
      {activeSubtab === "setup" && (
        <div className="space-y-6">
          <SectionCard
            title="Threshold and Attainment Rules"
            subtitle="Set the achievement threshold used throughout CO and PO attainment."
            actions={
              <label className={`${secondaryButtonClass} inline-flex items-center gap-2`}>
                <ObeIcon name="upload" className="h-4 w-4" />
                Import Course Outline
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleImportCourseOutline}
                />
              </label>
            }
          >
            {setupLoading ? (
              <div className="text-sm text-slate-500">Loading setup...</div>
            ) : (
              <div className="max-w-md">
                <FormField label="Threshold Percent">
                  <input
                    type="text"
                    inputMode="decimal"
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
            subtitle="A Course Outcome can contribute to one or several Program Outcomes. Select every PO that applies."
          >
            <div className="space-y-3">
              {!coOptions.length ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
                  Add at least one Course Outcome before creating CO-PO mappings.
                </div>
              ) : !targetCodeOptions().length ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                  Add the Program Outcomes used by this course first. You can also import them from the Course Outline PDF.
                </div>
              ) : (
                coOptions.map((co, index) => {
                  const selectedCodes = getMappedPoCodes(co.code);
                  return (
                    <div
                      key={`co-po-group-${co.code}-${index}`}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/40"
                    >
                      <div className="grid gap-4 lg:grid-cols-[minmax(180px,0.7fr)_minmax(0,1.3fr)] lg:items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-9 min-w-14 items-center justify-center rounded-xl bg-indigo-50 px-3 text-sm font-black text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                              {co.code}
                            </span>
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                              {selectedCodes.length
                                ? `${selectedCodes.length} PO${selectedCodes.length > 1 ? "s" : ""} selected`
                                : "No PO selected"}
                            </span>
                          </div>
                          {co.statement ? (
                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                              {co.statement}
                            </p>
                          ) : null}
                        </div>

                        <div>
                          <details className="group relative">
                            <summary className={`${inputClass} flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 select-none`}>
                              <span className={selectedCodes.length ? "font-semibold text-slate-800 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}>
                                {selectedCodes.length
                                  ? selectedCodes.join(", ")
                                  : "Select one or more Program Outcomes"}
                              </span>
                              <ObeIcon name="chevronDown" className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
                            </summary>
                            <div className="absolute z-30 mt-2 w-full min-w-[280px] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                              <div className="max-h-64 overflow-auto p-1">
                                {targetCodeOptions().map((target) => {
                                  const checked = selectedCodes.includes(String(target.code || "").toUpperCase());
                                  return (
                                    <label
                                      key={`${co.code}-${target.code}`}
                                      className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleCoPoMapping(co.code, target.code)}
                                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900"
                                      />
                                      <span className="min-w-0">
                                        <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">
                                          {target.code}
                                        </span>
                                        {target.statement ? (
                                          <span className="mt-0.5 block line-clamp-2 text-xs leading-4 text-slate-500 dark:text-slate-400">
                                            {target.statement}
                                          </span>
                                        ) : null}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                              {selectedCodes.length ? (
                                <div className="border-t border-slate-200 p-2 dark:border-slate-700">
                                  <button
                                    type="button"
                                    onClick={() => clearCoPoMappings(co.code)}
                                    className="w-full rounded-xl px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                                  >
                                    Clear selections for {co.code}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </details>

                          {selectedCodes.length ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {selectedCodes.map((poCode) => (
                                <button
                                  type="button"
                                  key={`${co.code}-${poCode}-chip`}
                                  onClick={() => toggleCoPoMapping(co.code, poCode)}
                                  className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:border-rose-500/20 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                                  title={`Remove ${co.code} → ${poCode}`}
                                >
                                  {poCode}
                                  <span aria-hidden="true">×</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                Example: CO2 can be mapped to both PO1 and PO2. The same relationships are used automatically in OBE Output, PO attainment, Course Report, and Excel export.
              </div>
            </div>
          </SectionCard>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveSetup}
              disabled={setupSaving}
              className={`${primaryButtonClass} inline-flex items-center gap-2`}
            >
              <ObeIcon name="save" className="h-4 w-4" />
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
            actions={
              <label className={`${secondaryButtonClass} inline-flex items-center gap-2`}>
                <ObeIcon name="upload" className="h-4 w-4" />
                Import Course Outline
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleImportCourseOutline}
                />
              </label>
            }
          >
            {isLabCourse && (
              <div className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                <strong>Automatic Continuous Evaluation:</strong> AT (5) is taken from this lab course attendance, and Lab E (25) is taken from the normal marksheet’s Lab Assessment (Main). Only Lab Mid (30) and Lab Final (40) need CO–PO blueprints and mark entry here.
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
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
                  type="text"
                  inputMode="decimal"
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

            </div>

            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Blueprint Items
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Drag the handle beside an item to change the question order.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addBlueprintRow}
                  className={`${addButtonClass} inline-flex items-center gap-2`}
                >
                  <ObeIcon name="plus" className="h-4 w-4" />
                  Add Item
                </button>
              </div>

              <div className="grid gap-3">
                {blueprintForm.items.map((item, index) => (
                  <div
                    key={`item-${index}`}
                    onDragOver={(event) => handleBlueprintItemDragOver(event, index)}
                    onDrop={(event) => handleBlueprintItemDrop(event, index)}
                    className={[
                      "grid gap-3 rounded-2xl border bg-gradient-to-r from-slate-50/90 to-white p-3 shadow-sm transition dark:from-slate-950/60 dark:to-slate-900 lg:grid-cols-[76px_110px_minmax(190px,1.2fr)_120px_minmax(150px,.7fr)_auto] lg:items-end",
                      dragOverBlueprintItemIndex === index && draggedBlueprintItemIndex !== index
                        ? "border-indigo-400 ring-2 ring-indigo-200 dark:border-indigo-400 dark:ring-indigo-500/20"
                        : "border-slate-200 hover:border-indigo-200 dark:border-slate-800 dark:hover:border-indigo-500/30",
                      draggedBlueprintItemIndex === index ? "opacity-60" : "",
                    ].join(" ")}
                  >
                    <div className="hidden h-11 items-center gap-1.5 rounded-xl bg-violet-100 px-2 text-sm font-black text-violet-700 dark:bg-violet-500/10 dark:text-violet-300 lg:flex">
                      <button
                        type="button"
                        draggable
                        onDragStart={(event) => handleBlueprintItemDragStart(event, index)}
                        onDragEnd={handleBlueprintItemDragEnd}
                        className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-lg text-violet-600 transition hover:bg-violet-200 active:cursor-grabbing dark:text-violet-300 dark:hover:bg-violet-500/20"
                        title="Drag to reorder"
                        aria-label={`Drag item ${index + 1} to reorder`}
                      >
                        <ObeIcon name="drag" className="h-4 w-4" />
                      </button>
                      <span>{index + 1}</span>
                    </div>

                    <FormField label="Key">
                      <input
                        value={item.key}
                        onChange={(e) =>
                          updateBlueprintRow(index, "key", e.target.value)
                        }
                        className={inputClass}
                      />
                    </FormField>

                    <FormField label="Question / Item Label">
                      <input
                        value={item.label}
                        onChange={(e) =>
                          updateBlueprintRow(index, "label", e.target.value)
                        }
                        className={inputClass}
                      />
                    </FormField>

                    <FormField label="Marks">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.marks}
                        onChange={(e) =>
                          updateBlueprintRow(index, "marks", e.target.value)
                        }
                        className={inputClass}
                      />
                    </FormField>

                    <FormField label="Course Outcome">
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
                    </FormField>

                    <button
                      type="button"
                      onClick={() => removeBlueprintRow(index)}
                      className={`${iconDangerButtonClass} h-11 w-11 self-end`}
                      title="Remove item"
                      aria-label="Remove item"
                    >
                      <ObeIcon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                ))}
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
                className={`${primaryButtonClass} inline-flex items-center gap-2`}
              >
                <ObeIcon name="save" className="h-4 w-4" />
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
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                        <ObeIcon name="blueprint" className="h-4 w-4" />
                      </span>
                      <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
                        {group.label}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {group.items.length} saved
                      </span>
                    </div>

                    {group.items.map((blueprint) => (
                      <div
                        key={blueprint._id}
                        className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm transition hover:border-indigo-200 hover:shadow-md dark:border-slate-700 dark:from-slate-900 dark:to-slate-950/60 dark:hover:border-indigo-500/30"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-base font-black text-slate-900 dark:text-slate-100">
                                {blueprint.assessmentName}
                              </h4>
                              <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                                {getAssessmentTypeLabel(blueprint.assessmentType, isLabCourse)}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                              {blueprint.items?.length || 0} mapped item(s) · {blueprint.totalMarks} total marks
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
            title="Mark Entry Grid"
            subtitle="Use Tab, Enter, or arrow keys to move between cells. Values are limited to each question's configured full mark."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={obeMarksImportInputRef}
                  type="file"
                  accept=".xlsx,.xls,.xlsm"
                  className="hidden"
                  onChange={handleObeMarksExcelImport}
                />
                <button
                  type="button"
                  onClick={() => obeMarksImportInputRef.current?.click()}
                  disabled={markSaving || markLoading || !markStudents.length}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
                >
                  <ObeIcon name="upload" className="h-4 w-4" />
                  Smart Import Excel
                </button>
                <button
                  type="button"
                  onClick={saveMarks}
                  disabled={markSaving || markLoading || !markBlueprints.length}
                  className={`${primaryButtonClass} inline-flex items-center gap-2`}
                >
                  <ObeIcon name="save" className="h-4 w-4" />
                  {markSaving ? "Saving..." : "Save OBE Marks"}
                </button>
              </div>
            }
          >
            {markLoading ? (
              <div className="text-sm text-slate-500">Loading mark entry data...</div>
            ) : !markStudents.length ? (
              <div className="text-sm text-slate-500">
                No students found in this course.
              </div>
            ) : !markBlueprints.length ? (
              <div className="text-sm text-slate-500">
                No OBE blueprints created yet. Use <strong>Import Excel</strong> to create the required setup/assessment mapping from a compatible sheet, or create a blueprint manually first.
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white to-slate-50/80 p-4 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-950/50">
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
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
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
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={handleDownloadExcel}
              className={`${primaryButtonClass} inline-flex items-center gap-2`}
            >
              <ObeIcon name="excel" className="h-4 w-4" />
              Export Excel
            </button>
            <label className={`${secondaryButtonClass} inline-flex items-center gap-2`}>
              <ObeIcon name="upload" className="h-4 w-4" />
              Import Excel
              <input
                type="file"
                accept=".xlsm,.xlsx,.xls"
                className="hidden"
                onChange={handleImportExcel}
              />
            </label>
          </div>

          {outputLoading && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-sm font-semibold text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
              Refreshing CO, PO, grade, and student achievement data...
            </div>
          )}

          {!outputLoading && !outputData && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              No OBE output is available yet. Complete the setup, blueprint, and mark entry first.
            </div>
          )}

          {outputData && (
            <>
              <div className="grid gap-6 xl:grid-cols-2">
                <SectionCard
                  title="CO Attainment"
                  subtitle="Class achievement against the configured threshold for each Course Outcome."
                >
                  <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.25fr)_minmax(240px,.75fr)]">
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800/80">
                          <tr>
                            <HeaderCell>CO</HeaderCell>
                            <HeaderCell>Max</HeaderCell>
                            <HeaderCell>Attained</HeaderCell>
                            <HeaderCell>Attainment %</HeaderCell>
                            <HeaderCell>Level</HeaderCell>
                          </tr>
                        </thead>
                        <tbody>
                          {(outputData.coAttainment || []).map((row) => (
                            <tr key={row.code} className="border-t border-slate-200 dark:border-slate-800">
                              <BodyCell>{row.code}</BodyCell>
                              <BodyCell>{row.maxMarks}</BodyCell>
                              <BodyCell>{row.attainedCount}/{row.totalStudents}</BodyCell>
                              <BodyCell>{row.attainmentPercent}%</BodyCell>
                              <BodyCell>{row.level}</BodyCell>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <MiniBarChart
                      title="CO Achievement"
                      rows={outputData.coAttainment || []}
                      labelKey="code"
                      valueKey="attainmentPercent"
                      maxValue={100}
                      suffix="%"
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="PO Attainment"
                  subtitle="PO achievement calculated from the mapped Course Outcomes."
                >
                  <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(220px,.8fr)]">
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
                              <tr key={row.code} className="border-t border-slate-200 dark:border-slate-800">
                                <BodyCell>{row.code}</BodyCell>
                                <BodyCell>{row.attainmentPercent}%</BodyCell>
                                <BodyCell>{row.level}</BodyCell>
                              </tr>
                            ))}
                            {!outputData.poAttainment?.length && (
                              <tr>
                                <BodyCell colSpan={3} className="text-center text-slate-500">
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
                                <tr key={row.code} className="border-t border-slate-200 dark:border-slate-800">
                                  <BodyCell>{row.code}</BodyCell>
                                  <BodyCell>{row.attainmentPercent}%</BodyCell>
                                  <BodyCell>{row.level}</BodyCell>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                    <MiniBarChart
                      title="PO Achievement"
                      rows={outputData.poAttainment || []}
                      labelKey="code"
                      valueKey="attainmentPercent"
                      maxValue={100}
                      suffix="%"
                    />
                  </div>
                </SectionCard>
              </div>

              <SectionCard
                title="Grade Distribution"
                subtitle="Grade counts and percentage distribution for the course."
              >
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)]">
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
                          <tr key={row.grade} className="border-t border-slate-200 dark:border-slate-800">
                            <BodyCell>{row.grade}</BodyCell>
                            <BodyCell>{row.count}</BodyCell>
                            <BodyCell>{row.percent}%</BodyCell>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <MiniBarChart
                    title="Grade Overview"
                    rows={outputData.gradeDistribution || []}
                    labelKey="grade"
                    valueKey="count"
                    maxValue={Math.max(1, ...(outputData.gradeDistribution || []).map((row) => Number(row.count || 0)))}
                  />
                </div>
              </SectionCard>

              <SectionCard
                title="Student CO Achievement"
                subtitle="Detailed student-wise marks, CO percentage, and achievement status."
              >
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
                  <div className="max-h-[68vh] overflow-auto">
                    <table className="w-full min-w-[980px] border-separate border-spacing-0 text-xs sm:text-sm">
                      <thead className="sticky top-0 z-30">
                        <tr>
                          <HeaderCell>Roll</HeaderCell>
                          <HeaderCell>Name</HeaderCell>
                          {isLabCourse &&
                            (outputData.continuousAssessment?.headers || []).map((header) => (
                              <HeaderCell key={`continuous-${header.key}`} className="text-center">
                                {header.label} ({header.maxMarks})
                              </HeaderCell>
                            ))}
                          <HeaderCell>Total</HeaderCell>
                          <HeaderCell>%</HeaderCell>
                          <HeaderCell>Grade</HeaderCell>
                          {(outputData.coAttainment || []).flatMap((co) => [
                            <HeaderCell key={`${co.code}-obt`} className="text-center">{co.code} Obt</HeaderCell>,
                            <HeaderCell key={`${co.code}-pct`} className="text-center">{co.code} %</HeaderCell>,
                            <HeaderCell key={`${co.code}-yn`} className="text-center">{co.code} Y/N</HeaderCell>,
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
                            <BodyCell className="min-w-[180px] font-medium">{student.name}</BodyCell>
                            {isLabCourse &&
                              (outputData.continuousAssessment?.headers || []).map((header) => (
                                <BodyCell key={`${student.studentId}-continuous-${header.key}`} className="text-center">
                                  {student.continuousAssessment?.[header.key] ?? 0}
                                </BodyCell>
                              ))}
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

              <SectionCard
                title="Course Report Comments"
                subtitle="These are kept at the end of the OBE workflow and written to the final comment section of the Excel Course Report sheet."
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40">
                    <FormField label="Comment 1">
                      <p className="mb-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        State your suggestions for improving CO-PO achievement of this course.
                      </p>
                      <textarea
                        rows={5}
                        value={setup.courseReportComment1}
                        onChange={(e) => setSetup((prev) => ({ ...prev, courseReportComment1: e.target.value }))}
                        className={`${inputClass} min-h-28 resize-y`}
                        placeholder="Suggestions for improving CO-PO achievement..."
                      />
                    </FormField>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40">
                    <FormField label="Comment 2">
                      <p className="mb-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        State your suggestions for improving teaching methodology of this course.
                      </p>
                      <textarea
                        rows={5}
                        value={setup.courseReportComment2}
                        onChange={(e) => setSetup((prev) => ({ ...prev, courseReportComment2: e.target.value }))}
                        className={`${inputClass} min-h-28 resize-y`}
                        placeholder="Suggestions for improving teaching methodology..."
                      />
                    </FormField>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40 lg:col-span-2">
                    <FormField label="General Comment">
                      <textarea
                        rows={5}
                        value={setup.courseReportGeneralComment}
                        onChange={(e) => setSetup((prev) => ({ ...prev, courseReportGeneralComment: e.target.value }))}
                        className={`${inputClass} min-h-28 resize-y`}
                        placeholder="General Course Report comment..."
                      />
                    </FormField>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={saveSetup}
                    disabled={setupSaving}
                    className={`${primaryButtonClass} inline-flex items-center gap-2`}
                  >
                    <ObeIcon name="save" className="h-4 w-4" />
                    {setupSaving ? "Saving..." : "Save Report Comments"}
                  </button>
                </div>
              </SectionCard>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SectionCard({ title, subtitle, actions, children }) {
  return (
    <div className="rounded-[28px] border border-slate-200/90 bg-white p-5 shadow-[0_12px_34px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {title}
          </h4>
          {subtitle && (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

function MiniBarChart({
  title,
  rows = [],
  labelKey,
  valueKey,
  maxValue = 100,
  suffix = "",
}) {
  const safeMax = Math.max(1, Number(maxValue) || 1);
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-indigo-50/50 p-4 dark:border-slate-700 dark:from-slate-950 dark:to-indigo-950/20">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
        <ObeIcon name="chart" className="h-4 w-4 text-indigo-500" />
        {title}
      </div>
      <div className="space-y-3">
        {rows.map((row, index) => {
          const rawValue = Number(row?.[valueKey] || 0);
          const width = Math.max(0, Math.min(100, (rawValue / safeMax) * 100));
          return (
            <div key={`${row?.[labelKey] || "row"}-${index}`}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  {row?.[labelKey] || "-"}
                </span>
                <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {round2(rawValue)}{suffix}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
        {!rows.length && (
          <div className="py-5 text-center text-xs text-slate-500">No data available.</div>
        )}
      </div>
    </div>
  );
}

function ObeIcon({ name, className = "h-4 w-4" }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  switch (name) {
    case "setup":
      return <svg {...common}><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="4"/><path d="m5.6 5.6 2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/></svg>;
    case "blueprint":
      return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>;
    case "marks":
      return <svg {...common}><path d="M4 19h16M6 16l3-3 3 2 6-7"/><path d="M15 8h3v3"/></svg>;
    case "chart":
      return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>;
    case "excel":
      return <svg {...common}><path d="M14 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-3"/><path d="M14 3v5h5M3 8l6 8M9 8l-6 8"/></svg>;
    case "upload":
      return <svg {...common}><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 14v5h14v-5"/></svg>;
    case "save":
      return <svg {...common}><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>;
    case "plus":
      return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case "trash":
      return <svg {...common}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/><path d="M10 11v5M14 11v5"/></svg>;
    case "drag":
      return <svg {...common}><circle cx="8" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="17" r="1" fill="currentColor" stroke="none"/></svg>;
    case "chevronDown":
      return <svg {...common}><path d="m6 9 6 6 6-6"/></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="8"/><path d="M9 12h6"/></svg>;
  }
}

function OutcomeBlock({ title, rows, onAdd, onRemove, onChange }) {
  return (
    <SectionCard
      title={title}
      subtitle="Keep the code short and the statement complete. These definitions flow into attainment analysis and the official Course Excel."
      actions={
        <button
          type="button"
          onClick={onAdd}
          className={`${addButtonClass} inline-flex items-center gap-2`}
        >
          <ObeIcon name="plus" className="h-4 w-4" />
          Add Outcome
        </button>
      }
    >
      <div className="space-y-3">
        {(rows || []).map((row, index) => (
          <div
            key={`${title}-${index}`}
            className="group grid gap-3 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50/90 to-white p-3 transition hover:border-indigo-200 hover:shadow-sm dark:border-slate-800 dark:from-slate-950/60 dark:to-slate-900 dark:hover:border-indigo-500/30 lg:grid-cols-[140px_minmax(0,1fr)_auto] lg:items-start"
          >
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-2.5 dark:border-indigo-500/20 dark:bg-indigo-500/10">
              <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-300">
                Outcome {index + 1}
              </div>
              <input
                value={row.code}
                onChange={(e) => onChange(index, "code", e.target.value)}
                className={`${inputClass} bg-white font-bold uppercase dark:bg-slate-900`}
              />
            </div>

            <div>
              <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Statement
              </div>
              <textarea
                value={row.statement}
                onChange={(e) => onChange(index, "statement", e.target.value)}
                className={`${inputClass} min-h-20 resize-y leading-6`}
                placeholder="Enter the complete outcome statement"
              />
            </div>

            <button
              type="button"
              onClick={() => onRemove(index)}
              className={`${iconDangerButtonClass} h-11 w-11 lg:mt-6`}
              title="Remove outcome"
              aria-label="Remove outcome"
            >
              <ObeIcon name="trash" className="h-4 w-4" />
            </button>
          </div>
        ))}

        {!rows?.length && (
          <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No outcomes added yet.
          </div>
        )}
      </div>
    </SectionCard>
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

const addButtonClass =
  "cursor-pointer rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-600/15 transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-500 dark:hover:bg-sky-400";

const dangerButtonClass =
  "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20";

const iconDangerButtonClass =
  "inline-flex shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 p-0 text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-200 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20 dark:focus:ring-rose-500/20";

const successBadgeClass =
  "inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";

const failBadgeClass =
  "inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300";