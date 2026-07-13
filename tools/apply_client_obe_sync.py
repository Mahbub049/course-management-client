#!/usr/bin/env python3
"""Apply the Theory-course OBE/CO-PO -> marksheet sync UI changes.

Usage:
    python apply_client_obe_sync.py /path/to/client

The script edits:
- src/services/markService.js
- src/pages/teacherCourse/TabMarks.jsx

It creates .before-obe-sync backup files before changing anything.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path


SERVICE_FUNCTION = '''\n\nexport const syncMarksFromObeRequest = async (courseId) => {\n  const res = await api.post(`/courses/${courseId}/marks/sync-from-obe`);\n  return res.data;\n};\n'''

HANDLER = r'''

  const handleFetchFromObe = async () => {
    const confirmation = await Swal.fire({
      icon: "question",
      title: "Fetch marks from OBE/CO-PO?",
      text:
        "Question-wise OBE totals will be copied into matching marksheet fields. Existing values in matched fields will be replaced, and unsaved marksheet edits will be reloaded.",
      showCancelButton: true,
      confirmButtonText: "Fetch marks",
      cancelButtonText: "Cancel",
      reverseButtons: true,
      focusCancel: true,
    });

    if (!confirmation.isConfirmed) return;

    try {
      setSyncingObeMarks(true);
      setMarksError("");

      const result = await syncMarksFromObeRequest(courseId);
      await loadAllData();

      const matched = Array.isArray(result?.matchedAssessments)
        ? result.matchedAssessments
        : [];
      const skipped = Array.isArray(result?.skippedBlueprints)
        ? result.skippedBlueprints
        : [];
      const importedRecords = Number(result?.importedRecords || 0);

      await Swal.fire({
        icon: importedRecords > 0 ? "success" : "info",
        title: importedRecords > 0 ? "OBE marks fetched" : "Nothing imported",
        text: `${result?.message || "Fetch completed."} Matched assessments: ${matched.length}. Skipped: ${skipped.length}.`,
      });
    } catch (error) {
      console.error(error);
      const message =
        error?.response?.data?.message ||
        "Failed to fetch marks from OBE/CO-PO.";

      setMarksError(message);
      Swal.fire({
        icon: "error",
        title: "Fetch failed",
        text: message,
      });
    } finally {
      setSyncingObeMarks(false);
    }
  };
'''

BUTTON = r'''
              {courseType === "theory" && (
                <button
                  type="button"
                  onClick={handleFetchFromObe}
                  disabled={loading || saving || syncingObeMarks}
                  className="inline-flex items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                  title="Copy saved OBE assessment totals into matching marksheet fields"
                >
                  {syncingObeMarks
                    ? "Fetching OBE marks..."
                    : "Fetch from OBE/CO-PO"}
                </button>
              )}
'''


def backup(path: Path) -> None:
    backup_path = path.with_name(path.name + ".before-obe-sync")
    if not backup_path.exists():
        shutil.copy2(path, backup_path)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(
            f"Could not safely apply {label}: expected exactly one anchor, found {count}."
        )
    return text.replace(old, new, 1)


def update_mark_service(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "syncMarksFromObeRequest" in text:
        print(f"Already updated: {path}")
        return

    backup(path)
    text = text.rstrip() + SERVICE_FUNCTION
    path.write_text(text, encoding="utf-8", newline="\n")
    print(f"Updated: {path}")


def update_tab_marks(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "handleFetchFromObe" in text and "syncMarksFromObeRequest" in text:
        print(f"Already updated: {path}")
        return

    backup(path)

    old_import = '''import {\n  fetchMarksForCourse,\n  saveMarksForCourseRequest,\n} from "../../services/markService";'''
    new_import = '''import {\n  fetchMarksForCourse,\n  saveMarksForCourseRequest,\n  syncMarksFromObeRequest,\n} from "../../services/markService";'''
    text = replace_once(text, old_import, new_import, "mark service import")

    old_state = '''  const [saving, setSaving] = useState(false);\n  const [publishingAssessmentId, setPublishingAssessmentId] = useState(null);'''
    new_state = '''  const [saving, setSaving] = useState(false);\n  const [syncingObeMarks, setSyncingObeMarks] = useState(false);\n  const [publishingAssessmentId, setPublishingAssessmentId] = useState(null);'''
    text = replace_once(text, old_state, new_state, "sync loading state")

    save_anchor = "  const handleSave = async () => {"
    text = replace_once(
        text,
        save_anchor,
        HANDLER + "\n" + save_anchor,
        "OBE fetch handler",
    )

    header_marker = "Marks Table"
    header_index = text.find(header_marker)
    if header_index < 0:
        raise RuntimeError("Could not find the Marks Table header.")

    badge_start = text.find('            <div\n              className={[', header_index)
    if badge_start < 0:
        raise RuntimeError("Could not find the created-total badge after Marks Table.")

    badge_end_marker = '''              Created total: {formatMarksAmount(assessmentPlanSummary.total)} / 100\n            </div>'''
    badge_end = text.find(badge_end_marker, badge_start)
    if badge_end < 0:
        raise RuntimeError("Could not find the end of the created-total badge.")
    badge_end += len(badge_end_marker)

    original_badge = text[badge_start:badge_end]
    indented_badge = "\n".join(
        ("  " + line if line else line) for line in original_badge.split("\n")
    )
    replacement = (
        '            <div className="flex flex-wrap items-center gap-2">\n'
        + BUTTON
        + indented_badge
        + "\n            </div>"
    )
    text = text[:badge_start] + replacement + text[badge_end:]

    path.write_text(text, encoding="utf-8", newline="\n")
    print(f"Updated: {path}")


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python apply_client_obe_sync.py /path/to/client", file=sys.stderr)
        return 2

    root = Path(sys.argv[1]).expanduser().resolve()
    service = root / "src" / "services" / "markService.js"
    tab_marks = root / "src" / "pages" / "teacherCourse" / "TabMarks.jsx"

    missing = [str(path) for path in (service, tab_marks) if not path.is_file()]
    if missing:
        print("Missing required file(s):", file=sys.stderr)
        for item in missing:
            print(f"  - {item}", file=sys.stderr)
        return 1

    try:
        update_mark_service(service)
        update_tab_marks(tab_marks)
    except Exception as exc:
        print(f"Patch failed: {exc}", file=sys.stderr)
        return 1

    print("Client OBE sync feature applied successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
