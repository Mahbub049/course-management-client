export const ISSUE_CATEGORIES = ["marks", "attendance", "general"];

export function issueCategoryAccess(settings, category) {
  if (settings?.allowStudentComplaints === false) {
    return { allowed: false, message: settings?.closedMessage || "Issue submission is closed for this course." };
  }
  const rule = settings?.categories?.[category];
  if (rule?.enabled === false) return { allowed: false, message: `${category} issue submission is disabled for this course.` };
  const now = Date.now();
  if (rule?.startAt && now < new Date(rule.startAt).getTime()) {
    return { allowed: false, message: `Submission for ${category} issues is not open yet.` };
  }
  if (rule?.endAt && now >= new Date(rule.endAt).getTime()) {
    return { allowed: false, message: `Submission for ${category} issues has closed.` };
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
