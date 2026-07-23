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

export const OBE_FIXED_CONTINUOUS_ASSESSMENT = [
  { continuousKey: "attendance", label: "AT", marks: 5 },
  // The official workbook keeps the second CA column reserved for QT.
  // It stays visually blank when the course has no separate quiz total.
  { continuousKey: "quiz", label: "QT", marks: 0, isPlaceholder: true },
  { continuousKey: "ct", label: "CT", marks: 15 },
  { continuousKey: "assignment", label: "ASM", marks: 10 },
  // The fifth CA column is an unused/reserved slot in the supplied template.
  { continuousKey: "reserved", label: "", marks: 0, isPlaceholder: true },
];

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

const normalizeFixedContinuousAssessmentSlots = (headers = []) => {
  const normalized = (Array.isArray(headers) ? headers : [])
    .filter((header) => header && header.key)
    .slice(0, OBE_TEMPLATE_LIMITS.continuousAssessmentSlots)
    .map((header) => ({
      continuousKey: safeText(header.key, ""),
      label: normalizeLabel(header.label, safeText(header.key, "")),
      marks: toNumber(header.maxMarks ?? header.marks),
      isPlaceholder: false,
    }));

  while (normalized.length < OBE_TEMPLATE_LIMITS.continuousAssessmentSlots) {
    normalized.push({
      continuousKey: `reserved_${normalized.length + 1}`,
      label: "",
      marks: 0,
      isPlaceholder: true,
    });
  }

  return normalized;
};

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
  if (type === "quiz" || isQuizBlueprint(name)) return 2;
  if (type === "ct" || type === "class_test") return 3;
  if (type === "assignment") return 4;
  if (type === "presentation") return 5;
  if (type === "mid" || type === "midterm") return 6;
  if (type === "final") return 7;
  return 999;
};

const buildItemLabel = ({
  type,
  blueprintName,
  item,
  itemIndex,
  blueprintIndex,
  itemCount,
  blueprintCount,
}) => {
  if (type === "mid" || type === "midterm" || type === "final") {
    return normalizeLabel(item.label || item.name, `Q${itemIndex + 1}`);
  }

  const base = baseLabelForType(type, blueprintName);

  if (itemCount > 1) {
    const explicit = safeText(item.label || item.name, "");
    if (explicit && !/^q(?:uestion)?\s*\d+$/i.test(explicit)) {
      return normalizeLabel(explicit, `${base}${itemIndex + 1}`);
    }
    return `${base}${itemIndex + 1}`.slice(0, 12);
  }

  if (blueprintCount > 1) {
    return `${base}${blueprintIndex + 1}`.slice(0, 12);
  }

  return base;
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

export const buildObeTemplateLayout = (blueprints = [], options = {}) => {
  const useFixedContinuousAssessment =
    options?.useFixedContinuousAssessment === true;
  const sorted = sortObeBlueprints(blueprints);

  const semanticCounts = sorted.reduce((acc, blueprint) => {
    const type = getBlueprintType(blueprint);
    if (groupKeyForType(type) !== "ca") return acc;
    const base = baseLabelForType(type, getBlueprintName(blueprint));
    acc[base] = (acc[base] || 0) + 1;
    return acc;
  }, {});

  const slots = { ca: [], mid: [], final: [] };
  const unsupported = [];
  const semanticCounters = {};

  sorted.forEach((blueprint) => {
    const type = getBlueprintType(blueprint);
    const group = groupKeyForType(type);
    const blueprintName = getBlueprintName(blueprint);
    const blueprintId = getBlueprintId(blueprint);

    if (useFixedContinuousAssessment && group === "ca") {
      return;
    }

    if (group === "unsupported") {
      unsupported.push(blueprintName);
      return;
    }

    const items = [...(Array.isArray(blueprint.items) ? blueprint.items : [])].sort(
      (a, b) => toNumber(a.order) - toNumber(b.order)
    );

    const normalizedItems = items.length
      ? items
      : [
          {
            key: "default",
            label: blueprintName,
            marks: blueprint.totalMarks,
            coCode: "",
            order: 0,
          },
        ];

    const semanticBase = baseLabelForType(type, blueprintName);
    const blueprintIndex = semanticCounters[semanticBase] || 0;
    semanticCounters[semanticBase] = blueprintIndex + 1;

    normalizedItems.forEach((item, itemIndex) => {
      slots[group].push({
        group,
        blueprint,
        blueprintId,
        blueprintName,
        type,
        item,
        itemKey: safeText(
          item.key || item.itemKey || item._id || item.id,
          `item_${itemIndex + 1}`
        ),
        itemLabel: safeText(item.label || item.name, `Q${itemIndex + 1}`),
        label: buildItemLabel({
          type,
          blueprintName,
          item,
          itemIndex,
          blueprintIndex,
          itemCount: normalizedItems.length,
          blueprintCount: semanticCounts[semanticBase] || 1,
        }),
        marks: toNumber(item.marks ?? item.maxMarks ?? blueprint.totalMarks),
        coCode: safeText(
          item.coCode || item.co || item.courseOutcome,
          ""
        ).toUpperCase(),
      });
    });
  });

  if (useFixedContinuousAssessment) {
    const fixedContinuousAssessmentSlots =
      Array.isArray(options?.fixedContinuousAssessmentSlots) &&
      options.fixedContinuousAssessmentSlots.length
        ? normalizeFixedContinuousAssessmentSlots(
            options.fixedContinuousAssessmentSlots
          )
        : OBE_FIXED_CONTINUOUS_ASSESSMENT;

    slots.ca = fixedContinuousAssessmentSlots.map((slot) => ({
      ...slot,
      group: "ca",
      source: slot.isPlaceholder
        ? "placeholder"
        : "courseContinuousAssessment",
      blueprint: null,
      blueprintId: "",
      blueprintName: slot.label,
      type: slot.continuousKey,
      item: null,
      itemKey: slot.continuousKey,
      itemLabel: slot.label,
      coCode: "",
    }));
  }

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
        `The official BUBT workbook has ${limit} ${label} item columns, but ${slots[group].length} items are configured.`
      );
    }
  });

  const totals = {
    ca: slots.ca.reduce((sum, slot) => sum + slot.marks, 0),
    mid: slots.mid.reduce((sum, slot) => sum + slot.marks, 0),
    final: slots.final.reduce((sum, slot) => sum + slot.marks, 0),
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
        } items total ${totals[group]} instead of ${expectedTotal}. The official workbook will show its built-in Error indicator until the blueprint is corrected.`
      );
    }
  });

  return {
    slots,
    totals,
    expectedTotals: expected,
    errors,
    warnings,
    allSlots: [...slots.ca, ...slots.mid, ...slots.final],
  };
};
