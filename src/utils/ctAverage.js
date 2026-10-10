// Shared with the regular marksheet and OBE fetch modal so CT Avg always uses
// the same CT selection policy and the same marksheet rounding rule.
function clamp(n, min, max) {
  const x = Number(n ?? 0);
  return Math.max(min, Math.min(max, x));
}

function pct(obt, full) {
  const o = Number(obt ?? 0);
  const f = Number(full ?? 0);
  if (f <= 0) return 0;
  return clamp(o, 0, f) / f;
}

function getMainMarkValue(cellValue) {
  if (cellValue == null) return 0;
  if (typeof cellValue === "object") {
    if (["absent", "incomplete"].includes(String(cellValue.status || "present").toLowerCase())) return 0;
    return Number(cellValue.obtainedMarks || 0);
  }
  if (String(cellValue).trim().toUpperCase() === "A") return 0;
  const numeric = Number(cellValue || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function normalizeCtPolicy(course) {
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

export function isCtAssessment(nameRaw) {
  const n = String(nameRaw || "").toLowerCase().trim();

  if (n.includes("mid") || n.includes("final") || n.includes("att")) return false;
  if (n.includes("assign") || n.includes("present")) return false;

  const compact = n.replace(/[\s\-_]+/g, "");

  if (compact.startsWith("ct")) return true;
  if (compact.includes("classtest")) return true;
  if (n.includes("class test")) return true;
  if (n.includes("quiz")) return true;
  if (n.includes("test")) return true;

  return false;
}

export function computeCtScore(course, assessments, rowMarks) {
  const policy = normalizeCtPolicy(course);
  const totalWeight = Number(policy.totalWeight || 15);

  const ctRows = (assessments || [])
    .filter((a) => a?.structureType !== "lab_final")
    .filter((a) => isCtAssessment(a?.name))
    .map((a) => ({
      id: String(a._id),
      percent: pct(getMainMarkValue(rowMarks?.[a._id]), a.fullMarks),
    }));

  if (!ctRows.length || totalWeight <= 0) return 0;

  if (policy.mode === "manual_average_scaled") {
    const selected = ctRows.filter((r) =>
      policy.manualSelectedAssessmentIds.includes(r.id)
    );

    if (!selected.length) return 0;

    const avg =
      selected.reduce((sum, item) => sum + item.percent, 0) / selected.length;

    return avg * totalWeight;
  }

  const sorted = [...ctRows].sort((a, b) => b.percent - a.percent);

  if (policy.mode === "best_one_scaled") {
    return (sorted[0]?.percent || 0) * totalWeight;
  }

  const count = Math.max(1, Number(policy.bestCount || 2));
  const chosen = sorted.slice(0, count);

  if (!chosen.length) return 0;

  const avg =
    chosen.reduce((sum, item) => sum + item.percent, 0) / chosen.length;

  return avg * totalWeight;
}

// The normal marksheet displays CT Avg rounded UP to the nearest half mark.
export function roundCtAverage(score) {
  const n = Number(score || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil((n - 1e-9) * 2) / 2;
}
