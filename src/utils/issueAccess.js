export const ISSUE_CATEGORIES = ["marks", "attendance", "general"];

export function issueCategoryAccess(settings, category, at = Date.now()) {
  const override = settings?.temporaryOverride;
  const now = Number(at);
  const startAt = override?.startAt ? new Date(override.startAt).getTime() : -Infinity;
  const endAt = override?.endAt ? new Date(override.endAt).getTime() : -Infinity;
  if (override && now >= startAt && now < endAt) {
    const selected = (override.categories || []).includes(category);
    if (override.mode === "all_off") return { allowed: false, message: "Issue submission is temporarily closed for this course." };
    if (override.mode === "all_on") return { allowed: true, message: "" };
    if (override.mode === "allow_only") return selected
      ? { allowed: true, message: "" } : { allowed: false, message: `${category} issues are temporarily unavailable.` };
    if (override.mode === "enable_selected" && selected) return { allowed: true, message: "" };
    if (override.mode === "disable_selected" && selected) return { allowed: false, message: `${category} issues are temporarily unavailable.` };
  }
  if (settings?.allowStudentComplaints === false) {
    return { allowed: false, message: settings?.closedMessage || "Issue submission is closed for this course." };
  }
  const rule = settings?.categories?.[category];
  if (rule?.enabled === false) return { allowed: false, message: `${category} issue submission is disabled for this course.` };
  // Compatibility with older category windows, which expire back to the saved defaults.
  if (rule?.endAt && now >= new Date(rule.endAt).getTime()) return { allowed: true, message: "" };
  if (rule?.startAt && now < new Date(rule.startAt).getTime()) {
    return { allowed: false, message: `Submission for ${category} issues is not open yet.` };
  }
  return { allowed: true, message: "" };
}

export function sessionsForTarget(present, total, target) {
  if (total <= 0) return 0;
  return Math.max(0, Math.ceil((Number(target || 50) / 100) * total - present - 1e-9));
}

export function attendanceIssueRefs(issue) {
  if (issue?.attendanceRefs?.length) return issue.attendanceRefs;
  return issue?.attendanceRef?.date ? [issue.attendanceRef] : [];
}
