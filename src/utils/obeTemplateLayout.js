export const OBE_TEMPLATE_LIMITS = {
  students: 71,
  courseOutcomes: 6,
  programOutcomes: 12,
  continuousAssessmentSlots: 5,
  midSlots: 6,
  finalSlots: 6,
};

export const OBE_TEMPLATE_COLUMNS = {
  ca: ["C", "D", "E", "F", "G"],
  mid: ["I", "J", "K", "L", "M", "N"],
  final: ["P", "Q", "R", "S", "T", "U"],
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const safeText = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
};

export const getBlueprintType = (blueprint = {}) =>
  safeText(
    blueprint.assessmentType || blueprint.type || blueprint.category,
    ""
  ).toLowerCase();

const getBlueprintId = (blueprint = {}) =>
  safeText(blueprint._id || blueprint.id || blueprint.blueprintId, "");

const getBlueprintName = (blueprint = {}) =>
  safeText(
    blueprint.assessmentName || blueprint.name || blueprint.title,
    "Assessment"
  );

const normalizeLabel = (value, fallback) =>
  safeText(value, fallback)
    .replace(/\s+/g, " ")
    .slice(0, 12);

const isQuizBlueprint = (blueprintName = "") => {
  const normalized = safeText(blueprintName).toLowerCase();
  return /(^|\s)(quiz|qt)(\s|$)/.test(normalized);
};

const baseLabelForType = (type, blueprintName) => {
  if (type === "attendance") return "AT";
  if (type === "assignment") return "ASM";
  if (type === "presentation") return "PRE";
  if (type === "quiz" || isQuizBlueprint(blueprintName)) return "QT";
  if (type === "ct" || type === "class_test") return "CT";
  return "Q";
};

const getSortOrder = (blueprint = {}) => {
  const type = getBlueprintType(blueprint);
  const name = getBlueprintName(blueprint);

  if (type === "attendance") return 1;
  if (type === "ct" || type === "class_test") return 2;
  if (type === "quiz" || isQuizBlueprint(name)) return 3;
  if (type === "assignment") return 4;
  if (type === "presentation") return 5;
  if (type === "mid" || type === "midterm") return 6;
  if (type === "final") return 7;
  return 999;
};

export const sortObeBlueprints = (blueprints = []) =>
  [...(Array.isArray(blueprints) ? blueprints : [])].sort((a, b) => {
    const orderA = getSortOrder(a);
    const orderB = getSortOrder(b);

    if (orderA !== orderB) return orderA - orderB;

    const displayA = toNumber(a.order ?? a.displayOrder);
    const displayB = toNumber(b.order ?? b.displayOrder);
    if (displayA !== displayB) return displayA - displayB;

    return getBlueprintName(a).localeCompare(getBlueprintName(b), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

const groupKeyForType = (type) => {
  if (["mid", "midterm"].includes(type)) return "mid";
  if (type === "final") return "final";
  if (
    [
      "attendance",
      "ct",
      "class_test",
      "quiz",
      "assignment",
      "presentation",
    ].includes(type)
  ) {
    return "ca";
  }
  return "unsupported";
};

const normalizeBlueprintItems = (blueprint = {}) => {
  const items = [...(Array.isArray(blueprint.items) ? blueprint.items : [])].sort(
    (a, b) => toNumber(a.order) - toNumber(b.order)
  );

  if (items.length) return items;
  return [
    {
      key: "default",
      label: getBlueprintName(blueprint),
      marks: blueprint.totalMarks,
      coCode: "",
      order: 0,
    },
  ];
};

const normalizeCoCode = (value) => safeText(value, "").toUpperCase();

const buildTheoryContinuousSlots = (sortedBlueprints = []) => {
  const groups = [];
  const groupMap = new Map();

  sortedBlueprints.forEach((blueprint) => {
    const type = getBlueprintType(blueprint);
    if (groupKeyForType(type) !== "ca") return;

    const blueprintId = getBlueprintId(blueprint);
    const blueprintName = getBlueprintName(blueprint);
    const baseLabel = baseLabelForType(type, blueprintName);

    normalizeBlueprintItems(blueprint).forEach((item, itemIndex) => {
      const itemKey = safeText(
        item.key || item.itemKey || item._id || item.id,
        `item_${itemIndex + 1}`
      );
      const coCode = normalizeCoCode(
        item.coCode || item.co || item.courseOutcome
      );
      const groupKey = `${baseLabel}__${coCode || "UNMAPPED"}`;

      if (!groupMap.has(groupKey)) {
        const slot = {
          group: "ca",
          source: "blueprintAggregate",
          slotKey: `ca:${groupKey}`,
          continuousKey: "",
          blueprint: null,
          blueprintId: "",
          blueprintName: baseLabel,
          type,
          item: null,
          itemKey: groupKey,
          itemLabel: baseLabel,
          label: baseLabel,
          marks: 0,
          coCode,
          sources: [],
        };
        groupMap.set(groupKey, slot);
        groups.push(slot);
      }

      const slot = groupMap.get(groupKey);
      slot.marks += toNumber(item.marks ?? item.maxMarks ?? blueprint.totalMarks);
      slot.sources.push({
        blueprintId,
        itemKey,
      });
    });
  });

  return groups.map((slot) => ({ ...slot, marks: toNumber(slot.marks) }));
};

const buildLabContinuousSlots = (continuousAssessment = null) => {
  const headers = Array.isArray(continuousAssessment?.headers)
    ? continuousAssessment.headers
    : [];

  return headers
    .filter((header) => header && header.key)
    .map((header, index) => {
      const key = safeText(header.key, `ca_${index + 1}`);
      return {
        group: "ca",
        source: "labContinuous",
        slotKey: `lab-ca:${key}`,
        continuousKey: key,
        blueprint: null,
        blueprintId: "",
        blueprintName: safeText(header.assessmentName || header.label, "CLP"),
        type: key,
        item: null,
        itemKey: key,
        itemLabel: safeText(header.label, key),
        label: normalizeLabel(header.label, key),
        marks: toNumber(header.maxMarks ?? header.marks),
        coCode: normalizeCoCode(header.coCode),
        sources: [],
      };
    });
};

const buildExamSlots = (sortedBlueprints = [], targetGroup) => {
  const slots = [];

  sortedBlueprints.forEach((blueprint) => {
    const type = getBlueprintType(blueprint);
    const group = groupKeyForType(type);
    if (group !== targetGroup) return;

    const blueprintId = getBlueprintId(blueprint);
    const blueprintName = getBlueprintName(blueprint);
    const items = normalizeBlueprintItems(blueprint);

    items.forEach((item, itemIndex) => {
      const itemKey = safeText(
        item.key || item.itemKey || item._id || item.id,
        `item_${itemIndex + 1}`
      );
      slots.push({
        group,
        source: "blueprintItem",
        slotKey: `bp:${blueprintId}:${itemKey}`,
        blueprint,
        blueprintId,
        blueprintName,
        type,
        item,
        itemKey,
        itemLabel: safeText(item.label || item.name, `Q${itemIndex + 1}`),
        label: normalizeLabel(item.label || item.name, `Q${itemIndex + 1}`),
        marks: toNumber(item.marks ?? item.maxMarks ?? blueprint.totalMarks),
        coCode: normalizeCoCode(
          item.coCode || item.co || item.courseOutcome
        ),
        sources: [{ blueprintId, itemKey }],
      });
    });
  });

  return slots;
};

export const buildObeTemplateLayout = (blueprints = [], options = {}) => {
  const sorted = sortObeBlueprints(blueprints);
  const courseType = safeText(options?.courseType, "theory").toLowerCase();
  const isLabCourse = courseType.includes("lab");
  const continuousAssessment =
    options?.continuousAssessment ||
    (Array.isArray(options?.fixedContinuousAssessmentSlots)
      ? { headers: options.fixedContinuousAssessmentSlots }
      : null);

  const unsupported = sorted
    .filter((blueprint) => groupKeyForType(getBlueprintType(blueprint)) === "unsupported")
    .map(getBlueprintName);

  const slots = {
    ca: isLabCourse
      ? buildLabContinuousSlots(continuousAssessment)
      : buildTheoryContinuousSlots(sorted),
    mid: buildExamSlots(sorted, "mid"),
    final: buildExamSlots(sorted, "final"),
  };

  Object.entries(OBE_TEMPLATE_COLUMNS).forEach(([group, columns]) => {
    slots[group] = slots[group].map((slot, index) => ({
      ...slot,
      column: columns[index] || null,
      columnIndex: index,
    }));
  });

  const errors = [];
  const warnings = [];

  if (unsupported.length) {
    errors.push(`Unsupported assessment type found: ${unsupported.join(", ")}.`);
  }

  const capacityChecks = [
    ["ca", OBE_TEMPLATE_LIMITS.continuousAssessmentSlots, "continuous-assessment"],
    ["mid", OBE_TEMPLATE_LIMITS.midSlots, "mid-term"],
    ["final", OBE_TEMPLATE_LIMITS.finalSlots, "final-exam"],
  ];

  capacityChecks.forEach(([group, limit, label]) => {
    if (slots[group].length > limit) {
      errors.push(
        `The official BUBT workbook has ${limit} ${label} item columns, but ${slots[group].length} columns are required after CO grouping.`
      );
    }
  });

  const totals = {
    ca: slots.ca.reduce((sum, slot) => sum + toNumber(slot.marks), 0),
    mid: slots.mid.reduce((sum, slot) => sum + toNumber(slot.marks), 0),
    final: slots.final.reduce((sum, slot) => sum + toNumber(slot.marks), 0),
  };

  const expected = { ca: 30, mid: 30, final: 40 };
  Object.entries(expected).forEach(([group, expectedTotal]) => {
    if (Math.abs(totals[group] - expectedTotal) > 0.001) {
      warnings.push(
        `${
          group === "ca"
            ? "Continuous assessment"
            : group === "mid"
              ? "Mid term"
              : "Final exam"
        } items total ${totals[group]} instead of ${expectedTotal}. The official workbook will show its built-in Error indicator until the configuration is corrected.`
      );
    }
  });

  return {
    courseType,
    slots,
    totals,
    expectedTotals: expected,
    errors,
    warnings,
    allSlots: [...slots.ca, ...slots.mid, ...slots.final],
  };
};
