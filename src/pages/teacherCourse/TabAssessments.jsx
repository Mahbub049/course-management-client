import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  fetchAssessments,
  createAssessmentRequest,
  updateAssessmentRequest,
  deleteAssessmentRequest,
} from "../../services/assessmentService";
import { updateCourseRequest } from "../../services/courseService";

function getCourseType(course) {
  return (course?.courseType || "theory").toLowerCase();
}

function normalizeOrders(list) {
  return (list || []).map((a, idx) => ({
    ...a,
    order: Number.isFinite(Number(a.order)) ? Number(a.order) : idx,
  }));
}

function sortByOrder(list) {
  const arr = normalizeOrders(list);
  return [...arr].sort((a, b) => {
    const ao = Number(a.order ?? 0);
    const bo = Number(b.order ?? 0);
    if (ao !== bo) return ao - bo;

    const at = new Date(a.createdAt || 0).getTime();
    const bt = new Date(b.createdAt || 0).getTime();
    return at - bt;
  });
}

function classifyForBadge(assessment, courseType) {
  if (assessment?.structureType === "lab_final") {
    return getStructuredLabPeriod(assessment) === "mid"
      ? "structured_lab_mid"
      : "structured_lab_final";
  }

  const name = String(assessment?.name || "").toLowerCase();

  if (courseType === "lab") {
    if (name.includes("mid")) return "mid";
    if (name.includes("final")) return "final";
    if (name.includes("att") || name.includes("attendance")) return "attendance";
    return "lab";
  }

  if (courseType === "hybrid") {
    if (name.includes("lab") && name.includes("mid")) return "lab_mid";
    if ((name.includes("theory") || name.includes("written")) && name.includes("mid")) return "theory_mid";
    if (name.includes("lab") && name.includes("final")) return "lab_final_regular";
    if ((name.includes("theory") || name.includes("written")) && name.includes("final")) return "theory_final";
  }

  if (name.includes("ct") || name.includes("class test") || name.includes("class-test")) return "ct";
  if (name.includes("mid")) return "mid";
  if (name.includes("final")) return "final";
  if (name.includes("att") || name.includes("attendance")) return "attendance";
  if (name.includes("assign")) return "assignment";
  if (name.includes("pres")) return "presentation";
  return "other";
}

function badgeLabel(type) {
  if (type === "structured_lab_mid") return "Structured Lab Mid";
  if (type === "structured_lab_final") return "Structured Lab Final";
  if (type === "lab_final_regular") return "Lab Final";
  if (type === "theory_final") return "Theory Final";
  if (type === "lab_mid") return "Lab Mid";
  if (type === "theory_mid") return "Theory Mid";
  if (type === "ct") return "CT";
  if (type === "mid") return "Mid";
  if (type === "final") return "Final";
  if (type === "attendance") return "Attendance";
  if (type === "assignment") return "Assignment";
  if (type === "presentation") return "Presentation";
  if (type === "lab") return "Lab";
  return "Other";
}

function badgeClass(type) {
  if (type === "structured_lab_mid" || type === "structured_lab_final") {
    return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-300";
  }
  if (type === "final" || type === "theory_final" || type === "lab_final_regular") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300";
  }
  if (type === "mid" || type === "theory_mid" || type === "lab_mid") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300";
  }
  if (type === "ct") {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300";
  }
  if (type === "attendance") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
  }
  if (type === "assignment" || type === "presentation") {
    return "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-300";
  }
  if (type === "lab") {
    return "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300";
  }
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function reorderArray(arr, fromIndex, toIndex) {
  const copy = [...arr];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy;
}

function getDefaultCtPolicy(course) {
  const raw = course?.classTestPolicy || {};

  return {
    mode: raw.mode || "best_n_average_scaled",
    bestCount:
      Number(raw.bestCount) > 0
        ? Number(raw.bestCount)
        : raw.mode === "best_one_scaled"
          ? 1
          : 2,
    totalWeight:
      Number(raw.totalWeight) >= 0 ? Number(raw.totalWeight) : 15,
    manualSelectedAssessmentIds: Array.isArray(raw.manualSelectedAssessmentIds)
      ? raw.manualSelectedAssessmentIds.map(String)
      : [],
  };
}

function getCtPolicyLabel(policy) {
  const p = policy || {};
  const bestCount = Number(p.bestCount || 2);
  const totalWeight = Number(p.totalWeight || 15);

  if (p.mode === "best_n_individual_scaled") {
    return `Best ${bestCount} CT individually scaled to ${totalWeight}`;
  }
  if (p.mode === "best_one_scaled") {
    return `Best 1 CT scaled to ${totalWeight}`;
  }
  if (p.mode === "manual_average_scaled") {
    return `Average of manually selected CTs scaled to ${totalWeight}`;
  }
  return `Average of best ${bestCount} CT scaled to ${totalWeight}`;
}

function getMaxCtWeight(courseType) {
  return courseType === "hybrid" ? 25 : 15;
}

function getCtWeightLimitMessage(courseType, maxWeight) {
  return courseType === "hybrid"
    ? `CT + Assignment + Attendance cannot cross 30. For hybrid courses, CT weight cannot be more than ${maxWeight}.`
    : `CT + Assignment + Attendance cannot cross 30. For theory courses, CT weight cannot be more than ${maxWeight}.`;
}

function round2(num) {
  return Math.round(Number(num || 0) * 100) / 100;
}

function createKey(prefix = "item") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function sumByMarks(list = []) {
  return round2(list.reduce((sum, item) => sum + Number(item?.marks || 0), 0));
}

function getAssessmentDefaults(type, courseType) {
  const hybridDefaults = {
    ct: { name: 'CT1', fullMarks: '10' },
    mid: { name: 'Mid', fullMarks: '30' },
    final: { name: 'Final', fullMarks: '40' },
    theory_mid: { name: 'Theory Mid', fullMarks: '20' },
    lab_mid: { name: 'Lab Mid', fullMarks: '10' },
    theory_final: { name: 'Theory Final', fullMarks: '30' },
    lab_final: { name: 'Lab Final', fullMarks: '10' },
    assignment: { name: 'Assignment', fullMarks: '10' },
    presentation: { name: 'Presentation', fullMarks: '10' },
    attendance: { name: 'Attendance', fullMarks: '5' },
  };

  const labDefaults = {
    lab: { name: 'Lab Assessment', fullMarks: '10' },
    mid: { name: 'Mid', fullMarks: '30' },
    final: { name: 'Final', fullMarks: '40' },
    attendance: { name: 'Attendance', fullMarks: '5' },
  };

  const theoryDefaults = {
    ct: { name: 'CT1', fullMarks: '10' },
    mid: { name: 'Mid', fullMarks: '30' },
    final: { name: 'Final', fullMarks: '40' },
    assignment: { name: 'Assignment', fullMarks: '10' },
    presentation: { name: 'Presentation', fullMarks: '10' },
    attendance: { name: 'Attendance', fullMarks: '5' },
  };

  if (courseType === 'hybrid') return hybridDefaults[type] || { name: '', fullMarks: '' };
  if (courseType === 'lab') return labDefaults[type] || { name: '', fullMarks: '' };
  return theoryDefaults[type] || { name: '', fullMarks: '' };
}

function getSavedAssessmentList(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.assessments)) return response.assessments;
  if (response?.assessment) return [response.assessment];
  return response ? [response] : [];
}

function getStructuredLabPeriod(assessmentOrForm) {
  const config = assessmentOrForm?.labFinalConfig || assessmentOrForm || {};
  return String(config?.period || "final").toLowerCase() === "mid"
    ? "mid"
    : "final";
}

function getStructuredLabTotal(period = "final") {
  return period === "mid" ? 30 : 40;
}

function createGenericComponent(index = 1, marks = 0) {
  return {
    key: createKey("component"),
    name: `Component ${index}`,
    marks,
    sourceType: "manual",
    linkedAssessmentId: "",
    order: index - 1,
  };
}

function createDefaultAdvancedLabFinal(period = "final") {
  const totalMarks = getStructuredLabTotal(period);
  return {
    name: period === "mid" ? "Lab Mid" : "Lab Final",
    period,
    totalMarks,
    mode: "components",
    genericComponents: [createGenericComponent(1, totalMarks)],
    projectMarks: 0,
    labExamMarks: period === "final" ? 40 : 0,
    projectComponents: [],
    examQuestions: [],
  };
}

function createProjectComponent(kind = "presentation") {
  if (kind === "proposal") {
    return {
      key: createKey("proposal"),
      name: "Proposal",
      marks: 0,
      entryMode: "phased",
      phases: [
        { key: createKey("phase"), name: "Phase 1", marks: 0, order: 0 },
      ],
      order: 0,
    };
  }

  const labelMap = {
    presentation: "Presentation / Showcase",
    software: "Project Software / Implementation",
    viva: "Viva",
    custom: "Custom Component",
  };

  return {
    key: createKey(kind),
    name: labelMap[kind] || "Component",
    marks: 0,
    entryMode: "single",
    phases: [],
    order: 0,
  };
}

function createExamQuestion(index = 1) {
  return {
    key: createKey("q"),
    label: `Question ${index}`,
    marks: 0,
    order: index - 1,
  };
}

function buildAdvancedLabFinalPayload(advancedForm) {
  const period = getStructuredLabPeriod(advancedForm);
  const mode = advancedForm.mode;
  const totalMarks = getStructuredLabTotal(period);

  const genericComponents =
    mode === "components"
      ? (advancedForm.genericComponents || []).map((component, idx) => ({
        key: component.key,
        name: String(component.name || "").trim(),
        marks: Number(component.marks || 0),
        sourceType: component.sourceType || "manual",
        linkedAssessmentId:
          component.sourceType === "submission"
            ? component.linkedAssessmentId || null
            : null,
        order: idx,
      }))
      : [];

  const projectMarks =
    mode === "project_only"
      ? 40
      : mode === "lab_exam_only" || mode === "components"
        ? 0
        : Number(advancedForm.projectMarks || 0);

  const labExamMarks =
    mode === "project_only" || mode === "components"
      ? 0
      : mode === "lab_exam_only"
        ? 40
        : Number(advancedForm.labExamMarks || 0);

  const projectComponents =
    mode === "lab_exam_only" || mode === "components"
      ? []
      : (advancedForm.projectComponents || []).map((component, idx) => ({
        key: component.key,
        name: component.name,
        marks: Number(component.marks || 0),
        entryMode: component.entryMode || "single",
        phases:
          component.entryMode === "phased"
            ? (component.phases || []).map((phase, phaseIdx) => ({
              key: phase.key,
              name: phase.name,
              marks: Number(phase.marks || 0),
              order: phaseIdx,
            }))
            : [],
        order: idx,
      }));

  const examQuestions =
    mode === "project_only" || mode === "components"
      ? []
      : (advancedForm.examQuestions || []).map((q, idx) => ({
        key: q.key,
        label: q.label,
        marks: Number(q.marks || 0),
        order: idx,
      }));

  return {
    name: (
      advancedForm.name || (period === "mid" ? "Lab Mid" : "Lab Final")
    ).trim(),
    fullMarks: totalMarks,
    structureType: "lab_final",
    labFinalConfig: {
      mode,
      period,
      totalMarks,
      genericComponents,
      projectMarks,
      labExamMarks,
      projectComponents,
      examQuestions,
    },
  };
}

function hydrateAdvancedFormFromAssessment(assessment) {
  const config = assessment?.labFinalConfig || {};
  const period = getStructuredLabPeriod(config);
  const totalMarks = getStructuredLabTotal(period);

  return {
    name: assessment?.name || (period === "mid" ? "Lab Mid" : "Lab Final"),
    period,
    totalMarks,
    mode: config.mode || "lab_exam_only",
    genericComponents: (config.genericComponents || []).map((component, idx) => ({
      key: component.key || createKey("component"),
      name: component.name || `Component ${idx + 1}`,
      marks: Number(component.marks || 0),
      sourceType: component.sourceType || "manual",
      linkedAssessmentId: component.linkedAssessmentId
        ? String(component.linkedAssessmentId)
        : "",
      order: idx,
    })),
    projectMarks: Number(config.projectMarks || 0),
    labExamMarks: Number(config.labExamMarks || (period === "final" ? 40 : 0)),
    projectComponents: (config.projectComponents || []).map((component, idx) => ({
      key: component.key || createKey("component"),
      name: component.name || `Component ${idx + 1}`,
      marks: Number(component.marks || 0),
      entryMode: component.entryMode || "single",
      phases:
        component.entryMode === "phased"
          ? (component.phases || []).map((phase, phaseIdx) => ({
            key: phase.key || createKey("phase"),
            name: phase.name || `Phase ${phaseIdx + 1}`,
            marks: Number(phase.marks || 0),
            order: phaseIdx,
          }))
          : [],
      order: idx,
    })),
    examQuestions: (config.examQuestions || []).map((q, idx) => ({
      key: q.key || createKey("q"),
      label: q.label || `Question ${idx + 1}`,
      marks: Number(q.marks || 0),
      order: idx,
    })),
  };
}

function validateAdvancedLabFinalForm(advancedForm) {
  const name = String(advancedForm.name || "").trim();
  if (!name) return "Please enter a name for the structured lab assessment.";

  const period = getStructuredLabPeriod(advancedForm);
  const totalMarks = getStructuredLabTotal(period);
  const mode = advancedForm.mode;
  const genericComponents = advancedForm.genericComponents || [];
  const projectComponents = advancedForm.projectComponents || [];
  const examQuestions = advancedForm.examQuestions || [];

  if (!["components", "project_only", "lab_exam_only", "mixed"].includes(mode)) {
    return "Invalid structured lab assessment mode.";
  }

  if (period === "mid" && mode !== "components") {
    return "Lab Mid must use Component Breakdown mode.";
  }

  if (mode === "components") {
    if (!genericComponents.length) {
      return "Please add at least one component.";
    }

    for (const component of genericComponents) {
      if (!String(component.name || "").trim()) {
        return "Every component must have a name.";
      }
      if (Number(component.marks || 0) <= 0) {
        return `Component "${component.name}" must have marks greater than 0.`;
      }
    }

    if (round2(sumByMarks(genericComponents)) !== totalMarks) {
      return `Component total must equal ${totalMarks}.`;
    }

    return null;
  }

  const projectMarks =
    mode === "project_only"
      ? 40
      : mode === "lab_exam_only"
        ? 0
        : Number(advancedForm.projectMarks || 0);

  const labExamMarks =
    mode === "project_only"
      ? 0
      : mode === "lab_exam_only"
        ? 40
        : Number(advancedForm.labExamMarks || 0);

  if (mode === "mixed") {
    if (projectMarks <= 0 || labExamMarks <= 0) {
      return "For mixed mode, both Project Marks and Lab Final Marks must be greater than 0.";
    }
    if (round2(projectMarks + labExamMarks) !== 40) {
      return "For mixed mode, Project Marks + Lab Final Marks must equal 40.";
    }
  }

  if (mode !== "lab_exam_only") {
    if (!projectComponents.length) return "Please add at least one project component.";
    if (round2(sumByMarks(projectComponents)) !== round2(projectMarks)) {
      return `Project component total must equal ${projectMarks}.`;
    }

    for (const component of projectComponents) {
      if (!String(component.name || "").trim()) return "Every project component must have a name.";
      if (Number(component.marks || 0) < 0) return `Project component "${component.name}" has invalid marks.`;
      if (component.entryMode === "phased") {
        if (!component.phases?.length) return `Project component "${component.name}" must have at least one phase.`;
        if (round2(sumByMarks(component.phases)) !== round2(component.marks)) {
          return `Sum of phases for "${component.name}" must equal ${component.marks}.`;
        }
        for (const phase of component.phases) {
          if (!String(phase.name || "").trim()) return `Each phase under "${component.name}" must have a name.`;
        }
      }
    }
  }

  if (mode !== "project_only") {
    if (!examQuestions.length) return "Please add at least one lab final question.";
    if (round2(sumByMarks(examQuestions)) !== round2(labExamMarks)) {
      return `Lab final question total must equal ${labExamMarks}.`;
    }
    for (const q of examQuestions) {
      if (!String(q.label || "").trim()) return "Every lab final question must have a label.";
      if (Number(q.marks || 0) < 0) return `Question "${q.label}" has invalid marks.`;
    }
  }

  return null;
}

export default function TabAssessments({ courseId, course, onCourseUpdated }) {
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assessmentError, setAssessmentError] = useState("");

  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [componentDragKey, setComponentDragKey] = useState(null);
  const [query, setQuery] = useState("");

  const [policyForm, setPolicyForm] = useState(getDefaultCtPolicy(course));
  const [savingPolicy, setSavingPolicy] = useState(false);

  const courseType = useMemo(() => getCourseType(course), [course]);

  const [form, setForm] = useState({
    type: courseType === "lab" ? "lab" : "ct",
    name: "",
    fullMarks: "",
  });

  const [labAssessmentMode, setLabAssessmentMode] = useState("regular");
  const [advancedForm, setAdvancedForm] = useState(createDefaultAdvancedLabFinal());

  const [editingAssessmentId, setEditingAssessmentId] = useState(null);
  const [editingKind, setEditingKind] = useState(null);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      type: courseType === "lab" ? "lab" : "ct",
    }));
  }, [courseType]);

  const canReorder = query.trim() === "" && !editingAssessmentId;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setAssessmentError("");
      try {
        const data = await fetchAssessments(courseId);
        setAssessments(sortByOrder(data || []));
      } catch (err) {
        console.error(err);
        setAssessmentError(err?.response?.data?.message || "Failed to load assessments");
      } finally {
        setLoading(false);
      }
    };

    if (courseId) load();
  }, [courseId]);

  useEffect(() => {
    setPolicyForm(getDefaultCtPolicy(course));
  }, [course]);

  const orderedAssessments = useMemo(() => sortByOrder(assessments), [assessments]);

  const submissionAssessments = useMemo(
    () => orderedAssessments.filter((a) => a?.structureType === "lab_submission"),
    [orderedAssessments]
  );

  const markEntryAssessments = useMemo(
    () => orderedAssessments.filter((a) => a?.structureType !== "lab_submission"),
    [orderedAssessments]
  );

  const filteredAssessments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return markEntryAssessments;

    return markEntryAssessments.filter((a) => {
      const n = String(a?.name || "").toLowerCase();
      const fm = String(a?.fullMarks ?? "").toLowerCase();
      const t = classifyForBadge(a, courseType);
      const labMode = String(a?.labFinalConfig?.mode || "").toLowerCase();
      const period = getStructuredLabPeriod(a);
      return (
        n.includes(q) ||
        fm.includes(q) ||
        t.includes(q) ||
        labMode.includes(q) ||
        period.includes(q)
      );
    });
  }, [markEntryAssessments, query, courseType]);

  const ctAssessments = useMemo(() => {
    return markEntryAssessments.filter(
      (a) => classifyForBadge(a, courseType) === "ct"
    );
  }, [markEntryAssessments, courseType]);

  const structuredPeriodExists = useMemo(() => {
    const result = { mid: false, final: false };
    markEntryAssessments.forEach((assessment) => {
      if (assessment?.structureType !== "lab_final") return;
      result[getStructuredLabPeriod(assessment)] = true;
    });
    return result;
  }, [markEntryAssessments]);

  const periodOccupied = useMemo(() => {
    const result = { mid: false, final: false };
    markEntryAssessments.forEach((assessment) => {
      if (assessment?.structureType === "lab_final") {
        result[getStructuredLabPeriod(assessment)] = true;
        return;
      }

      const name = String(assessment?.name || "").toLowerCase();
      if (name.includes("mid")) result.mid = true;
      if (name.includes("final")) result.final = true;
    });
    return result;
  }, [markEntryAssessments]);

  const bothStructuredPeriodsExist = periodOccupied.mid && periodOccupied.final;

  const selectedStructuredPeriod = getStructuredLabPeriod(advancedForm);
  const selectedStructuredPeriodUnavailable =
    !editingAssessmentId && periodOccupied[selectedStructuredPeriod];

  const typeOptions =
    courseType === "lab"
      ? [
        { value: "lab", label: "Lab Assessment" },
        { value: "mid", label: "Mid" },
        { value: "final", label: "Final" },
        { value: "attendance", label: "Attendance" },
      ]
      : courseType === "hybrid"
        ? [
          { value: "ct", label: "Class Test (Theory)" },
          { value: "mid", label: "Mid (auto: Theory 20 + Lab 10)" },
          { value: "final", label: "Final (auto: Theory 30 + Lab 10)" },
          { value: "theory_mid", label: "Theory Mid only" },
          { value: "lab_mid", label: "Lab Mid only" },
          { value: "theory_final", label: "Theory Final only" },
          { value: "lab_final", label: "Lab Final only" },
          { value: "assignment", label: "Assignment" },
          { value: "presentation", label: "Presentation" },
          { value: "attendance", label: "Attendance" },
        ]
        : [
          { value: "ct", label: "Class Test (CT)" },
          { value: "mid", label: "Mid" },
          { value: "final", label: "Final" },
          { value: "attendance", label: "Attendance" },
          { value: "assignment", label: "Assignment" },
          { value: "presentation", label: "Presentation" },
        ];

  const headerHint =
    courseType === "lab"
      ? "Lab Assessments (average → 25), Attendance (5), and reusable Structured Lab Mid (30) / Lab Final (40) breakdowns."
      : courseType === "hybrid"
        ? `${getCtPolicyLabel(policyForm)}, Theory Mid (20), Lab Mid (10), Theory Final (30), Lab Final (10), Assignment/Presentation (one combined Assignment category), Attendance (5).`
        : `${getCtPolicyLabel(policyForm)}, Mid (30), Final (40), Assignment/Presentation (10), Attendance (5).`;

  const genericComponentTotal = useMemo(
    () => sumByMarks(advancedForm.genericComponents || []),
    [advancedForm.genericComponents]
  );

  const projectComponentTotal = useMemo(
    () => sumByMarks(advancedForm.projectComponents || []),
    [advancedForm.projectComponents]
  );

  const examQuestionTotal = useMemo(
    () => sumByMarks(advancedForm.examQuestions || []),
    [advancedForm.examQuestions]
  );

  const targetProjectMarks =
    advancedForm.mode === "project_only"
      ? 40
      : advancedForm.mode === "lab_exam_only"
        ? 0
        : Number(advancedForm.projectMarks || 0);

  const targetExamMarks =
    advancedForm.mode === "project_only"
      ? 0
      : advancedForm.mode === "lab_exam_only"
        ? 40
        : Number(advancedForm.labExamMarks || 0);

  const resetFormState = () => {
    setEditingAssessmentId(null);
    setEditingKind(null);
    setLabAssessmentMode("regular");
    setForm({
      type: courseType === "lab" ? "lab" : "ct",
      name: "",
      fullMarks: "",
    });
    const nextPeriod = !periodOccupied.mid ? "mid" : "final";
    setAdvancedForm(createDefaultAdvancedLabFinal(nextPeriod));
    setAssessmentError("");
  };

  const onCreateOrUpdate = async (e) => {
    e.preventDefault();
    setAssessmentError("");
    setCreating(true);

    try {
      const isEditing = !!editingAssessmentId;

      if (courseType === "lab" && labAssessmentMode === "advanced_lab_final") {
        const period = getStructuredLabPeriod(advancedForm);
        const periodLabel = period === "mid" ? "Lab Mid" : "Lab Final";

        if (!isEditing && periodOccupied[period]) {
          setAssessmentError(`A structured ${periodLabel} already exists for this course.`);
          setCreating(false);
          return;
        }

        const validationError = validateAdvancedLabFinalForm(advancedForm);
        if (validationError) {
          setAssessmentError(validationError);
          setCreating(false);
          return;
        }

        const payload = buildAdvancedLabFinalPayload(advancedForm);

        let saved;
        if (isEditing) {
          saved = await updateAssessmentRequest(editingAssessmentId, payload);
          setAssessments((prev) =>
            sortByOrder(
              prev.map((item) =>
                String(item._id) === String(editingAssessmentId) ? saved : item
              )
            )
          );
        } else {
          saved = await createAssessmentRequest(courseId, payload);
          setAssessments((prev) => {
            const list = sortByOrder(prev);
            const nextOrder = list.length
              ? Number(list[list.length - 1].order ?? list.length - 1) + 1
              : 0;
            return sortByOrder([...list, { ...saved, order: nextOrder }]);
          });
        }

        Swal.fire({
          icon: "success",
          title: isEditing
            ? `Structured ${periodLabel} updated`
            : `Structured ${periodLabel} added`,
          text: isEditing
            ? `The structured ${periodLabel} breakdown has been updated successfully.`
            : `The structured ${periodLabel} breakdown has been created successfully.`,
          timer: 1600,
          showConfirmButton: false,
        });

        resetFormState();
        setCreating(false);
        return;
      }

      const name = form.name.trim();
      const fullMarks = Number(form.fullMarks);

      if (!name) {
        setAssessmentError("Please enter a name.");
        setCreating(false);
        return;
      }

      if (!fullMarks || Number.isNaN(fullMarks) || fullMarks <= 0) {
        setAssessmentError("Full marks must be a positive number.");
        setCreating(false);
        return;
      }

      let saved;
      if (isEditing) {
        saved = await updateAssessmentRequest(editingAssessmentId, {
          name,
          fullMarks,
          structureType: "regular",
        });

        setAssessments((prev) =>
          sortByOrder(
            prev.map((item) =>
              String(item._id) === String(editingAssessmentId) ? saved : item
            )
          )
        );
      } else {
        saved = await createAssessmentRequest(courseId, {
          name,
          fullMarks,
        });

        const savedItems = getSavedAssessmentList(saved);

        setAssessments((prev) => {
          const list = sortByOrder(prev);
          const nextOrder = list.length
            ? Number(list[list.length - 1].order ?? list.length - 1) + 1
            : 0;
          const nextItems = savedItems.map((item, idx) => ({
            ...item,
            order: Number.isFinite(Number(item?.order))
              ? Number(item.order)
              : nextOrder + idx,
          }));

          return sortByOrder([...list, ...nextItems]);
        });
      }

      const createdCount = getSavedAssessmentList(saved).length;

      Swal.fire({
        icon: "success",
        title: isEditing ? "Assessment updated" : "Assessment added",
        text: isEditing
          ? "The assessment has been updated successfully."
          : createdCount > 1
            ? `${createdCount} assessment fields have been created successfully.`
            : "The assessment has been created successfully.",
        timer: 1400,
        showConfirmButton: false,
      });

      resetFormState();
    } catch (err) {
      console.error(err);
      setAssessmentError(err?.response?.data?.message || "Failed to save assessment");
    } finally {
      setCreating(false);
    }
  };

  const handleAssessmentTypeChange = (e) => {
    const nextType = e.target.value;

    setForm((prev) => {
      const prevDefaults = getAssessmentDefaults(prev.type, courseType);
      const nextDefaults = getAssessmentDefaults(nextType, courseType);
      const shouldReplaceName =
        !String(prev.name || '').trim() || prev.name === prevDefaults.name;
      const shouldReplaceMarks =
        !String(prev.fullMarks || '').trim() || prev.fullMarks === prevDefaults.fullMarks;

      return {
        ...prev,
        type: nextType,
        name: shouldReplaceName ? nextDefaults.name : prev.name,
        fullMarks: shouldReplaceMarks ? nextDefaults.fullMarks : prev.fullMarks,
      };
    });
  };

  const quickAdd = (name, fullMarks, typeValue) => {
    setForm((prev) => ({
      ...prev,
      type: typeValue || prev.type,
      name,
      fullMarks: String(fullMarks),
    }));
  };

  const startEditRegularAssessment = (assessment) => {
    setEditingAssessmentId(assessment._id);
    setEditingKind("regular");
    setLabAssessmentMode("regular");
    setForm({
      type: classifyForBadge(assessment, courseType),
      name: assessment.name || "",
      fullMarks: String(assessment.fullMarks || ""),
    });
    setAssessmentError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startEditAdvancedAssessment = (assessment) => {
    setEditingAssessmentId(assessment._id);
    setEditingKind("advanced_lab_final");
    setLabAssessmentMode("advanced_lab_final");
    setAdvancedForm(hydrateAdvancedFormFromAssessment(assessment));
    setAssessmentError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeAssessment = async (assessmentId) => {
    const result = await Swal.fire({
      title: "Delete this assessment?",
      text: "All related marks for this assessment will also be deleted.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#e11d48",
    });

    if (!result.isConfirmed) return;

    try {
      setBusyId(assessmentId);
      await deleteAssessmentRequest(assessmentId);
      setAssessments((prev) => prev.filter((a) => String(a._id) !== String(assessmentId)));

      if (String(editingAssessmentId) === String(assessmentId)) {
        resetFormState();
      }

      Swal.fire({
        icon: "success",
        title: "Deleted",
        text: "Assessment removed successfully.",
        timer: 1300,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      setAssessmentError(err?.response?.data?.message || "Failed to delete assessment.");
    } finally {
      setBusyId(null);
    }
  };

  const persistOrders = async (nextList) => {
    const ops = nextList.map((a, idx) => updateAssessmentRequest(a._id, { order: idx }));
    await Promise.all(ops);
  };

  const handleDrop = async (toId) => {
    const fromId = dragId;
    if (!fromId || fromId === toId) return;

    const full = markEntryAssessments;
    const fromIndex = full.findIndex((x) => String(x._id) === String(fromId));
    const toIndex = full.findIndex((x) => String(x._id) === String(toId));
    if (fromIndex < 0 || toIndex < 0) return;

    const next = reorderArray(full, fromIndex, toIndex).map((x, i) => ({
      ...x,
      order: i,
    }));

    setAssessments(sortByOrder([...next, ...submissionAssessments]));

    try {
      setBusyId(fromId);
      await persistOrders(next);
    } catch (err) {
      console.error(err);
      setAssessmentError(err?.response?.data?.message || "Failed to save new order.");
    } finally {
      setBusyId(null);
      setDragId(null);
    }
  };

  const handlePolicySave = async () => {
    if (courseType === "lab") return;

    const totalWeight = Math.max(0, Number(policyForm.totalWeight ?? 15));
    const maxCtWeight = getMaxCtWeight(courseType);

    if (totalWeight > maxCtWeight) {
      const message = getCtWeightLimitMessage(courseType, maxCtWeight);
      Swal.fire({
        icon: "warning",
        title: "CT weight limit exceeded",
        text: message,
      });
      return;
    }

    const payload = {
      classTestPolicy: {
        mode: policyForm.mode,
        bestCount:
          policyForm.mode === "best_one_scaled"
            ? 1
            : Math.max(1, Number(policyForm.bestCount || 2)),
        totalWeight,
        manualSelectedAssessmentIds:
          policyForm.mode === "manual_average_scaled"
            ? (policyForm.manualSelectedAssessmentIds || []).map(String)
            : [],
      },
    };

    try {
      setSavingPolicy(true);

      const updated = await updateCourseRequest(courseId, payload);

      if (typeof onCourseUpdated === "function") {
        onCourseUpdated(updated);
      }

      Swal.fire({
        icon: "success",
        title: "CT policy updated",
        text: "The class test calculation rule has been updated.",
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Update failed",
        text: err?.response?.data?.message || "Failed to update CT policy.",
      });
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleStructuredPeriodChange = (period) => {
    setAdvancedForm((prev) => {
      const previousPeriod = getStructuredLabPeriod(prev);
      const previousTotal = getStructuredLabTotal(previousPeriod);
      const nextTotal = getStructuredLabTotal(period);
      const previousDefaultName = previousPeriod === "mid" ? "Lab Mid" : "Lab Final";
      const nextDefaultName = period === "mid" ? "Lab Mid" : "Lab Final";
      let genericComponents = prev.genericComponents || [];

      if (
        genericComponents.length === 1 &&
        round2(sumByMarks(genericComponents)) === previousTotal
      ) {
        genericComponents = [{ ...genericComponents[0], marks: nextTotal }];
      }

      return {
        ...prev,
        period,
        totalMarks: nextTotal,
        name:
          !String(prev.name || "").trim() || prev.name === previousDefaultName
            ? nextDefaultName
            : prev.name,
        mode: period === "mid" ? "components" : prev.mode,
        genericComponents:
          genericComponents.length > 0
            ? genericComponents
            : [createGenericComponent(1, nextTotal)],
        projectMarks: period === "final" ? prev.projectMarks : 0,
        labExamMarks: period === "final" ? prev.labExamMarks : 0,
      };
    });
  };

  const handleStructuredModeChange = (mode) => {
    setAdvancedForm((prev) => {
      const totalMarks = getStructuredLabTotal(getStructuredLabPeriod(prev));
      return {
        ...prev,
        mode,
        genericComponents:
          mode === "components" && !(prev.genericComponents || []).length
            ? [createGenericComponent(1, totalMarks)]
            : prev.genericComponents,
        projectMarks:
          mode === "mixed"
            ? prev.projectMarks || 20
            : mode === "project_only"
              ? 40
              : 0,
        labExamMarks:
          mode === "mixed"
            ? prev.labExamMarks || 20
            : mode === "lab_exam_only"
              ? 40
              : 0,
      };
    });
  };

  const addGenericComponent = () => {
    setAdvancedForm((prev) => {
      const list = prev.genericComponents || [];
      return {
        ...prev,
        genericComponents: [
          ...list,
          createGenericComponent(list.length + 1, 0),
        ].map((component, idx) => ({ ...component, order: idx })),
      };
    });
  };

  const reorderGenericComponents = (fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;

    setAdvancedForm((prev) => {
      const components = [...(prev.genericComponents || [])];
      const fromIndex = components.findIndex((item) => item.key === fromKey);
      const toIndex = components.findIndex((item) => item.key === toKey);

      if (fromIndex < 0 || toIndex < 0) return prev;

      const [moved] = components.splice(fromIndex, 1);
      components.splice(toIndex, 0, moved);

      return {
        ...prev,
        genericComponents: components.map((item, index) => ({
          ...item,
          order: index,
        })),
      };
    });
  };

  const moveGenericComponent = (key, direction) => {
    setAdvancedForm((prev) => {
      const components = [...(prev.genericComponents || [])];
      const currentIndex = components.findIndex((item) => item.key === key);
      const nextIndex = currentIndex + direction;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= components.length) {
        return prev;
      }

      const [moved] = components.splice(currentIndex, 1);
      components.splice(nextIndex, 0, moved);

      return {
        ...prev,
        genericComponents: components.map((item, index) => ({
          ...item,
          order: index,
        })),
      };
    });
  };

  const updateGenericComponent = (key, patch) => {
    setAdvancedForm((prev) => ({
      ...prev,
      genericComponents: (prev.genericComponents || []).map((component) =>
        component.key === key ? { ...component, ...patch } : component
      ),
    }));
  };

  const removeGenericComponent = (key) => {
    setAdvancedForm((prev) => ({
      ...prev,
      genericComponents: (prev.genericComponents || [])
        .filter((component) => component.key !== key)
        .map((component, idx) => ({ ...component, order: idx })),
    }));
  };

  const addProjectComponent = (kind) => {
    setAdvancedForm((prev) => {
      const next = [...(prev.projectComponents || []), createProjectComponent(kind)];
      return {
        ...prev,
        projectComponents: next.map((item, idx) => ({ ...item, order: idx })),
      };
    });
  };

  const updateProjectComponent = (key, patch) => {
    setAdvancedForm((prev) => ({
      ...prev,
      projectComponents: (prev.projectComponents || []).map((item) =>
        item.key === key ? { ...item, ...patch } : item
      ),
    }));
  };

  const removeProjectComponent = (key) => {
    setAdvancedForm((prev) => ({
      ...prev,
      projectComponents: (prev.projectComponents || [])
        .filter((item) => item.key !== key)
        .map((item, idx) => ({ ...item, order: idx })),
    }));
  };

  const addPhase = (componentKey) => {
    setAdvancedForm((prev) => ({
      ...prev,
      projectComponents: (prev.projectComponents || []).map((component) => {
        if (component.key !== componentKey) return component;
        const phases = component.phases || [];
        const nextPhases = [
          ...phases,
          {
            key: createKey("phase"),
            name: `Phase ${phases.length + 1}`,
            marks: 0,
            order: phases.length,
          },
        ];
        return {
          ...component,
          phases: nextPhases,
        };
      }),
    }));
  };

  const updatePhase = (componentKey, phaseKey, patch) => {
    setAdvancedForm((prev) => ({
      ...prev,
      projectComponents: (prev.projectComponents || []).map((component) => {
        if (component.key !== componentKey) return component;
        return {
          ...component,
          phases: (component.phases || []).map((phase) =>
            phase.key === phaseKey ? { ...phase, ...patch } : phase
          ),
        };
      }),
    }));
  };

  const removePhase = (componentKey, phaseKey) => {
    setAdvancedForm((prev) => ({
      ...prev,
      projectComponents: (prev.projectComponents || []).map((component) => {
        if (component.key !== componentKey) return component;
        return {
          ...component,
          phases: (component.phases || [])
            .filter((phase) => phase.key !== phaseKey)
            .map((phase, idx) => ({ ...phase, order: idx })),
        };
      }),
    }));
  };

  const addExamQuestion = () => {
    setAdvancedForm((prev) => {
      const list = prev.examQuestions || [];
      return {
        ...prev,
        examQuestions: [...list, createExamQuestion(list.length + 1)].map((q, idx) => ({
          ...q,
          order: idx,
        })),
      };
    });
  };

  const updateExamQuestion = (key, patch) => {
    setAdvancedForm((prev) => ({
      ...prev,
      examQuestions: (prev.examQuestions || []).map((q) =>
        q.key === key ? { ...q, ...patch } : q
      ),
    }));
  };

  const removeExamQuestion = (key) => {
    setAdvancedForm((prev) => ({
      ...prev,
      examQuestions: (prev.examQuestions || [])
        .filter((q) => q.key !== key)
        .map((q, idx) => ({ ...q, order: idx })),
    }));
  };

  const isEditing = !!editingAssessmentId;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="bg-gradient-to-r from-slate-50 via-white to-indigo-50/70 px-6 py-5 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Assessment Setup
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {headerHint}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isEditing && (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                  Editing mode
                </span>
              )}

              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${courseType === "lab"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : courseType === "hybrid"
                      ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300"
                      : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300"
                  }`}
              >
                {courseType === "lab" ? "Lab Course" : courseType === "hybrid" ? "Hybrid Course" : "Theory Course"}
              </span>

              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Total: {markEntryAssessments.length}
              </span>
            </div>
          </div>

          {assessmentError && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              {assessmentError}
            </div>
          )}
        </div>
      </div>

      {courseType !== "lab" && (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Class Test Policy
            </h4>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Choose how CT marks will be counted in the final total.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                CT Calculation Method
              </label>
              <select
                value={policyForm.mode}
                onChange={(e) =>
                  setPolicyForm((prev) => ({
                    ...prev,
                    mode: e.target.value,
                    bestCount: e.target.value === "best_one_scaled" ? 1 : prev.bestCount,
                  }))
                }
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="best_n_average_scaled">Average of best N CTs</option>
                <option value="best_n_individual_scaled">Best N CTs individually scaled</option>
                <option value="best_one_scaled">Best 1 CT only</option>
                <option value="manual_average_scaled">Average of manually selected CTs</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Number of CTs to count
              </label>
              <input
                type="number"
                min="1"
                disabled={policyForm.mode === "best_one_scaled" || policyForm.mode === "manual_average_scaled"}
                value={policyForm.mode === "best_one_scaled" ? 1 : policyForm.bestCount}
                onChange={(e) =>
                  setPolicyForm((prev) => ({
                    ...prev,
                    bestCount: Math.max(1, Number(e.target.value || 1)),
                  }))
                }
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Total CT Weight
              </label>
              <input
                type="number"
                min="0"
                max={getMaxCtWeight(courseType)}
                step="0.5"
                value={policyForm.totalWeight}
                onChange={(e) =>
                  setPolicyForm((prev) => ({
                    ...prev,
                    totalWeight: Number(e.target.value || 0),
                  }))
                }
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Maximum allowed: {getMaxCtWeight(courseType)} marks.
              </p>
            </div>
          </div>

          {policyForm.mode === "manual_average_scaled" && (
            <div className="border-t border-slate-100 px-6 py-5 dark:border-slate-800">
              <div className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                Select which CTs will count
              </div>

              {ctAssessments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No CT assessments found yet. Create CTs first, then select them here.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {ctAssessments.map((a) => {
                    const checked = policyForm.manualSelectedAssessmentIds.includes(String(a._id));

                    return (
                      <label
                        key={a._id}
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 shadow-sm dark:border-slate-700 dark:text-slate-200"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const id = String(a._id);

                            setPolicyForm((prev) => {
                              const prevIds = prev.manualSelectedAssessmentIds || [];

                              return {
                                ...prev,
                                manualSelectedAssessmentIds: e.target.checked
                                  ? [...prevIds, id]
                                  : prevIds.filter((x) => x !== id),
                              };
                            });
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-medium">{a.name}</span>
                        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                          {a.fullMarks}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Current rule: <span className="font-semibold text-slate-700 dark:text-slate-200">{getCtPolicyLabel(policyForm)}</span>
            </p>

            <button
              type="button"
              onClick={handlePolicySave}
              disabled={savingPolicy}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingPolicy ? "Saving..." : "Save CT Policy"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {isEditing ? "Edit Assessment" : "Add Assessment"}
              </h4>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {isEditing
                  ? "Update the selected assessment structure carefully."
                  : "Create new assessment items for this course."}
              </p>
            </div>

            {isEditing && (
              <button
                type="button"
                onClick={resetFormState}
                className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Cancel Edit
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-5">
          {courseType === "lab" && (
            <div className="mb-5">
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Lab Assessment Creation Mode
              </label>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setLabAssessmentMode("regular");
                    if (editingKind === "advanced_lab_final") {
                      setEditingAssessmentId(null);
                      setEditingKind(null);
                      setAdvancedForm(createDefaultAdvancedLabFinal());
                    }
                  }}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${labAssessmentMode === "regular"
                      ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/10"
                      : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
                    }`}
                >
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Regular Assessment
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Use the old way for Lab Assessment, Mid, Final, Attendance.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLabAssessmentMode("advanced_lab_final");
                    if (!isEditing) {
                      const nextPeriod = !periodOccupied.mid ? "mid" : "final";
                      setAdvancedForm(createDefaultAdvancedLabFinal(nextPeriod));
                    }
                  }}
                  disabled={!isEditing && bothStructuredPeriodsExist}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${labAssessmentMode === "advanced_lab_final"
                      ? "border-fuchsia-500 bg-fuchsia-50 dark:border-fuchsia-400 dark:bg-fuchsia-500/10"
                      : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Structured Lab Assessment
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Build either Lab Mid or Lab Final from reusable components
                  </div>
                </button>
              </div>

              {!isEditing && (structuredPeriodExists.mid || structuredPeriodExists.final) && (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                  Existing structured setup: {[
                    structuredPeriodExists.mid ? "Lab Mid" : null,
                    structuredPeriodExists.final ? "Lab Final" : null,
                  ].filter(Boolean).join(" and ")}. You can still create the other period or edit the existing one below.
                </div>
              )}
            </div>
          )}

          {courseType === "lab" && labAssessmentMode === "advanced_lab_final" ? (
            <form onSubmit={onCreateOrUpdate} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="lg:col-span-3">
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Assessment Period
                  </label>
                  <select
                    value={advancedForm.period}
                    disabled={isEditing}
                    onChange={(e) => handleStructuredPeriodChange(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="mid" disabled={!isEditing && periodOccupied.mid}>
                      Lab Mid (30){!isEditing && periodOccupied.mid ? " — Already created" : ""}
                    </option>
                    <option value="final" disabled={!isEditing && periodOccupied.final}>
                      Lab Final (40){!isEditing && periodOccupied.final ? " — Already created" : ""}
                    </option>
                  </select>
                  {isEditing && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      The period is locked while editing to protect existing marks.
                    </p>
                  )}
                </div>

                <div className="lg:col-span-5">
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Assessment Name
                  </label>
                  <input
                    value={advancedForm.name}
                    onChange={(e) =>
                      setAdvancedForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder={advancedForm.period === "mid" ? "Lab Mid" : "Lab Final"}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div className="lg:col-span-4">
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Breakdown Mode
                  </label>
                  <select
                    value={advancedForm.mode}
                    onChange={(e) => handleStructuredModeChange(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="components">Component Breakdown</option>
                    {advancedForm.period === "final" && (
                      <>
                        <option value="project_only">Legacy: Project Only</option>
                        <option value="lab_exam_only">Legacy: Lab Final Only</option>
                        <option value="mixed">Legacy: Project + Lab Final</option>
                      </>
                    )}
                  </select>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Component Breakdown supports manual marks, submissions, project, exam, and viva.
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50/60 p-5 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Marks Allocation Summary
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Structured {advancedForm.period === "mid" ? "Lab Mid" : "Lab Final"} is fixed at {getStructuredLabTotal(advancedForm.period)} marks.
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {advancedForm.mode === "components" && (
                      <span className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                        round2(genericComponentTotal) === getStructuredLabTotal(advancedForm.period)
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                      }`}>
                        Allocated: {genericComponentTotal} / {getStructuredLabTotal(advancedForm.period)}
                      </span>
                    )}
                    <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      Total: {getStructuredLabTotal(advancedForm.period)}
                    </div>
                  </div>
                </div>

                {advancedForm.mode === "mixed" ? (
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Project Marks
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={advancedForm.projectMarks}
                        onChange={(e) =>
                          setAdvancedForm((prev) => ({
                            ...prev,
                            projectMarks: Number(e.target.value || 0),
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Lab Final Marks
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={advancedForm.labExamMarks}
                        onChange={(e) =>
                          setAdvancedForm((prev) => ({
                            ...prev,
                            labExamMarks: Number(e.target.value || 0),
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                  </div>
                ) : advancedForm.mode !== "components" ? (
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      Project Marks:{" "}
                      <span className="font-semibold">
                        {advancedForm.mode === "project_only" ? 40 : 0}
                      </span>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      Lab Final Marks:{" "}
                      <span className="font-semibold">
                        {advancedForm.mode === "lab_exam_only" ? 40 : 0}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-fuchsia-200 bg-fuchsia-50/70 px-4 py-3 text-sm text-fuchsia-800 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-200">
                    Submission-linked components are synchronized from the Submissions tab. Other components are entered from Marks Entry.
                  </div>
                )}
              </div>

              {advancedForm.mode === "components" && (
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Breakdown Components
                      </div>
                      <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Current: {genericComponentTotal} / Target: {getStructuredLabTotal(advancedForm.period)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={addGenericComponent}
                      className="inline-flex items-center gap-2 rounded-2xl bg-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-fuchsia-700"
                    >
                      + Add Component
                    </button>
                  </div>

                  <div className="mt-4 space-y-4">
                    {(advancedForm.genericComponents || []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        No component added yet. Add components until the total reaches {getStructuredLabTotal(advancedForm.period)}.
                      </div>
                    ) : (
                      (advancedForm.genericComponents || []).map((component, idx) => (
                        <div
                          key={component.key}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            reorderGenericComponents(componentDragKey, component.key);
                            setComponentDragKey(null);
                          }}
                          className={`rounded-2xl border bg-slate-50/70 p-4 transition dark:bg-slate-950/40 ${
                            componentDragKey === component.key
                              ? "border-fuchsia-400 shadow-lg shadow-fuchsia-500/10 dark:border-fuchsia-500/60"
                              : "border-slate-200 dark:border-slate-800"
                          }`}
                        >
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <button
                              type="button"
                              draggable
                              onDragStart={(event) => {
                                setComponentDragKey(component.key);
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", component.key);
                              }}
                              onDragEnd={() => setComponentDragKey(null)}
                              className="inline-flex cursor-grab items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-fuchsia-300 hover:text-fuchsia-700 active:cursor-grabbing dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-fuchsia-500/40 dark:hover:text-fuchsia-300"
                              title="Drag this component to change its position"
                            >
                              <GripIcon />
                              Drag to reorder
                            </button>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => moveGenericComponent(component.key, -1)}
                                disabled={idx === 0}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-fuchsia-300 hover:text-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                title="Move component up"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() => moveGenericComponent(component.key, 1)}
                                disabled={idx === (advancedForm.genericComponents || []).length - 1}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-fuchsia-300 hover:text-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                title="Move component down"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() => removeGenericComponent(component.key)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                                title="Remove component"
                              >
                                <XIcon />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                            <div>
                              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Component Name
                              </label>
                              <input
                                value={component.name}
                                onChange={(e) =>
                                  updateGenericComponent(component.key, { name: e.target.value })
                                }
                                placeholder={`Component ${idx + 1}`}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                              />
                            </div>

                            <div>
                              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Marks
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={component.marks}
                                onChange={(e) =>
                                  updateGenericComponent(component.key, {
                                    marks: Number(e.target.value || 0),
                                  })
                                }
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {["project_only", "mixed"].includes(advancedForm.mode) && (
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Project Section
                      </div>
                      <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Target: {targetProjectMarks} | Current: {projectComponentTotal}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <QuickPill label="Add Proposal" onClick={() => addProjectComponent("proposal")} />
                      <QuickPill label="Add Presentation" onClick={() => addProjectComponent("presentation")} />
                      <QuickPill label="Add Software" onClick={() => addProjectComponent("software")} />
                      <QuickPill label="Add Viva" onClick={() => addProjectComponent("viva")} />
                      <QuickPill label="Add Custom" onClick={() => addProjectComponent("custom")} />
                    </div>
                  </div>

                  <div className="mt-4 space-y-4">
                    {(advancedForm.projectComponents || []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        No project component added yet.
                      </div>
                    ) : (
                      (advancedForm.projectComponents || []).map((component, idx) => {
                        const phaseTotal = sumByMarks(component.phases || []);
                        return (
                          <div
                            key={component.key}
                            className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40"
                          >
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                              <div className="lg:col-span-5">
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                  Component Name
                                </label>
                                <input
                                  value={component.name}
                                  onChange={(e) =>
                                    updateProjectComponent(component.key, { name: e.target.value })
                                  }
                                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                />
                              </div>

                              <div className="lg:col-span-3">
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                  Marks
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  value={component.marks}
                                  onChange={(e) =>
                                    updateProjectComponent(component.key, {
                                      marks: Number(e.target.value || 0),
                                    })
                                  }
                                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                />
                              </div>

                              <div className="lg:col-span-3">
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                  Entry Type
                                </label>
                                <select
                                  value={component.entryMode}
                                  onChange={(e) =>
                                    updateProjectComponent(component.key, {
                                      entryMode: e.target.value,
                                      phases: e.target.value === "phased"
                                        ? component.phases?.length
                                          ? component.phases
                                          : [{ key: createKey("phase"), name: "Phase 1", marks: 0, order: 0 }]
                                        : [],
                                    })
                                  }
                                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                >
                                  <option value="single">Single</option>
                                  <option value="phased">Phased</option>
                                </select>
                              </div>

                              <div className="lg:col-span-1">
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-transparent">
                                  Remove
                                </label>
                                <button
                                  type="button"
                                  onClick={() => removeProjectComponent(component.key)}
                                  className="inline-flex h-[46px] w-full items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                                  title="Remove component"
                                >
                                  <XIcon />
                                </button>
                              </div>
                            </div>

                            {component.entryMode === "phased" && (
                              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                      Phases
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                      Current phase total: {phaseTotal} / Component total: {component.marks}
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => addPhase(component.key)}
                                    className="inline-flex items-center gap-2 rounded-2xl bg-fuchsia-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-fuchsia-700"
                                  >
                                    + Add Phase
                                  </button>
                                </div>

                                <div className="space-y-3">
                                  {(component.phases || []).map((phase) => (
                                    <div
                                      key={phase.key}
                                      className="grid grid-cols-1 gap-3 md:grid-cols-12"
                                    >
                                      <div className="md:col-span-7">
                                        <input
                                          value={phase.name}
                                          onChange={(e) =>
                                            updatePhase(component.key, phase.key, {
                                              name: e.target.value,
                                            })
                                          }
                                          placeholder="Phase name"
                                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                        />
                                      </div>

                                      <div className="md:col-span-4">
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.5"
                                          value={phase.marks}
                                          onChange={(e) =>
                                            updatePhase(component.key, phase.key, {
                                              marks: Number(e.target.value || 0),
                                            })
                                          }
                                          placeholder="Marks"
                                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                        />
                                      </div>

                                      <div className="md:col-span-1">
                                        <button
                                          type="button"
                                          onClick={() => removePhase(component.key, phase.key)}
                                          className="inline-flex h-[46px] w-full items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                                        >
                                          <XIcon />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                              Component #{idx + 1}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {["lab_exam_only", "mixed"].includes(advancedForm.mode) && (
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Lab Final Question Section
                      </div>
                      <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Target: {targetExamMarks} | Current: {examQuestionTotal}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={addExamQuestion}
                      className="inline-flex items-center gap-2 rounded-2xl bg-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-fuchsia-700"
                    >
                      + Add Question
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {(advancedForm.examQuestions || []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        No lab final question added yet.
                      </div>
                    ) : (
                      (advancedForm.examQuestions || []).map((q, idx) => (
                        <div
                          key={q.key}
                          className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-12 dark:border-slate-800 dark:bg-slate-950/40"
                        >
                          <div className="md:col-span-7">
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Question Label
                            </label>
                            <input
                              value={q.label}
                              onChange={(e) =>
                                updateExamQuestion(q.key, { label: e.target.value })
                              }
                              placeholder={`Question ${idx + 1}`}
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            />
                          </div>

                          <div className="md:col-span-4">
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Marks
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={q.marks}
                              onChange={(e) =>
                                updateExamQuestion(q.key, {
                                  marks: Number(e.target.value || 0),
                                })
                              }
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            />
                          </div>

                          <div className="md:col-span-1">
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-transparent">
                              Remove
                            </label>
                            <button
                              type="button"
                              onClick={() => removeExamQuestion(q.key)}
                              className="inline-flex h-[46px] w-full items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                            >
                              <XIcon />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-3">
                {isEditing && (
                  <button
                    type="button"
                    onClick={resetFormState}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                )}

                <button
                  type="submit"
                  disabled={creating || selectedStructuredPeriodUnavailable}
                  className="inline-flex items-center justify-center rounded-2xl bg-fuchsia-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating
                    ? isEditing
                      ? "Updating..."
                      : "Creating..."
                    : isEditing
                      ? `Update Structured ${advancedForm.period === "mid" ? "Lab Mid" : "Lab Final"}`
                      : `Create Structured ${advancedForm.period === "mid" ? "Lab Mid" : "Lab Final"}`}
                </button>
              </div>
            </form>
          ) : (
            <>
              <form onSubmit={onCreateOrUpdate} className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-end">
                <div className="lg:col-span-3">
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Type
                  </label>
                  <select
                    value={form.type}
                    onChange={handleAssessmentTypeChange}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {typeOptions.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-6">
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Name
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder={
                      courseType === "lab"
                        ? "Lab Assessment 01 / Experiment 01"
                        : courseType === "hybrid"
                          ? "CT1 / Theory Mid / Lab Mid / Theory Final / Lab Final"
                          : "CT1 / Mid / Final"
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Full Marks
                  </label>
                  <input
                    value={form.fullMarks}
                    onChange={(e) => setForm((p) => ({ ...p, fullMarks: e.target.value }))}
                    placeholder="10 / 30 / 40"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div className="lg:col-span-1">
                  <button
                    type="submit"
                    disabled={creating}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creating
                      ? isEditing
                        ? "Updating..."
                        : "Adding..."
                      : isEditing
                        ? "Update"
                        : "Add"}
                  </button>
                </div>
              </form>

              {!isEditing && (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Quick add
                  </span>

                  {courseType === "lab" ? (
                    <>
                      <QuickPill label="Lab Assessment (10)" onClick={() => quickAdd("Lab Assessment", 10, "lab")} />
                      <QuickPill label="Mid (30)" onClick={() => quickAdd("Mid", 30, "mid")} />
                      <QuickPill label="Final (40)" onClick={() => quickAdd("Final", 40, "final")} />
                      <QuickPill label="Attendance (5)" onClick={() => quickAdd("Attendance", 5, "attendance")} />
                    </>
                  ) : (
                    courseType === "hybrid" ? (
                      <>
                        <QuickPill label="CT1 (10)" onClick={() => quickAdd("CT1", 10, "ct")} />
                        <QuickPill label="CT2 (10)" onClick={() => quickAdd("CT2", 10, "ct")} />
                        <QuickPill label="Mid (30 → Theory 20 + Lab 10)" onClick={() => quickAdd("Mid", 30, "mid")} />
                        <QuickPill label="Final (40 → Theory 30 + Lab 10)" onClick={() => quickAdd("Final", 40, "final")} />
                        <QuickPill label="Theory Mid only (20)" onClick={() => quickAdd("Theory Mid", 20, "theory_mid")} />
                        <QuickPill label="Lab Mid only (10)" onClick={() => quickAdd("Lab Mid", 10, "lab_mid")} />
                        <QuickPill label="Theory Final only (30)" onClick={() => quickAdd("Theory Final", 30, "theory_final")} />
                        <QuickPill label="Lab Final only (10)" onClick={() => quickAdd("Lab Final", 10, "lab_final")} />
                        <QuickPill label="Presentation (10)" onClick={() => quickAdd("Presentation", 10, "presentation")} />
                        <QuickPill label="Assignment (10)" onClick={() => quickAdd("Assignment", 10, "assignment")} />
                        <QuickPill label="Assignment (15)" onClick={() => quickAdd("Assignment", 15, "assignment")} />
                        <QuickPill label="Attendance (5)" onClick={() => quickAdd("Attendance", 5, "attendance")} />
                      </>
                    ) : (
                      <>
                        <QuickPill label="CT1 (10)" onClick={() => quickAdd("CT1", 10, "ct")} />
                        <QuickPill label="CT2 (10)" onClick={() => quickAdd("CT2", 10, "ct")} />
                        <QuickPill label="Mid (30)" onClick={() => quickAdd("Mid", 30, "mid")} />
                        <QuickPill label="Final (40)" onClick={() => quickAdd("Final", 40, "final")} />
                        <QuickPill label="Presentation (10)" onClick={() => quickAdd("Presentation", 10, "presentation")} />
                        <QuickPill label="Assignment (10)" onClick={() => quickAdd("Assignment", 10, "assignment")} />
                        <QuickPill label="Attendance (5)" onClick={() => quickAdd("Attendance", 5, "attendance")} />
                      </>
                    )
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-4 md:flex-row md:items-center md:justify-between dark:border-slate-800">
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              Existing Assessments
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Showing {filteredAssessments.length} of {markEntryAssessments.length}
              {!canReorder && !isEditing && (
                <span className="ml-2 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                  Clear search to reorder
                </span>
              )}
            </div>
          </div>

          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name / type / mode / marks..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 md:w-[320px] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <span className="absolute left-3 top-3.5 text-slate-400 dark:text-slate-500">
              <SearchIcon />
            </span>
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-6 text-sm text-slate-500 dark:text-slate-400">
            Loading assessments...
          </div>
        ) : filteredAssessments.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            No assessments found.
          </div>
        ) : (
          <ul className="space-y-3 p-4">
            {filteredAssessments.map((a) => {
              const type = classifyForBadge(a, courseType);

              return (
                <li
                  key={a._id}
                  draggable={canReorder}
                  onDragStart={() => setDragId(String(a._id))}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => {
                    if (!canReorder) return;
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (!canReorder) return;
                    e.preventDefault();
                    handleDrop(String(a._id));
                  }}
                  className={[
                    "rounded-2xl border px-4 py-4 transition",
                    "flex flex-col gap-3 md:flex-row md:items-center md:justify-between",
                    canReorder
                      ? "cursor-move border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
                      : "cursor-default border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
                    dragId === String(a._id)
                      ? "border-indigo-300 bg-indigo-50/60 dark:border-indigo-500/30 dark:bg-indigo-500/10"
                      : "",
                    String(editingAssessmentId) === String(a._id)
                      ? "ring-2 ring-amber-400/60"
                      : "",
                  ].join(" ")}
                  title={canReorder ? "Drag to reorder" : "Clear search / finish editing to reorder"}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                        {a.name}
                      </div>

                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass(
                          type
                        )}`}
                      >
                        {badgeLabel(type)}
                      </span>

                      {a?.structureType === "lab_final" && (
                        <span className="inline-flex items-center rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-700 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-300">
                          Mode: {String(a?.labFinalConfig?.mode || "").replaceAll("_", " ")}
                        </span>
                      )}

                      {canReorder && (
                        <span className="ml-1 text-slate-400 dark:text-slate-500" title="Drag handle">
                          <GripIcon />
                        </span>
                      )}
                    </div>

                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {a?.structureType === "lab_final"
                        ? `${getStructuredLabPeriod(a) === "mid" ? "Lab Mid" : "Lab Final"} breakdown used in marks entry${a?.labFinalConfig?.mode === "components" ? ` • ${(a?.labFinalConfig?.genericComponents || []).length} component(s)` : ""}`
                        : "Used in marks entry table"}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      Full Marks: <span className="font-semibold">{a.fullMarks}</span>
                    </div>

                    <button
                      type="button"
                      disabled={busyId === a._id}
                      onClick={() =>
                        a?.structureType === "lab_final"
                          ? startEditAdvancedAssessment(a)
                          : startEditRegularAssessment(a)
                      }
                      className="inline-flex h-10 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                      title="Edit"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      disabled={busyId === a._id}
                      onClick={() => removeAssessment(a._id)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                      title="Delete"
                    >
                      <XIcon />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Tip: drag and drop to sort. Clear search and finish editing first to enable reordering.
        </div>
      </div>
    </div>
  );
}

function QuickPill({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      {label}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 6h.01M10 12h.01M10 18h.01" />
      <path d="M14 6h.01M14 12h.01M14 18h.01" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}