#!/usr/bin/env node
/**
 * Apply the Theory-course OBE/CO-PO -> marksheet sync UI changes.
 *
 * Usage:
 *   node apply-client-obe-sync.cjs "C:\\path\\to\\client"
 *
 * Edits:
 * - src/services/markService.js
 * - src/pages/teacherCourse/TabMarks.jsx
 *
 * A .before-obe-sync backup is created for each edited file.
 */

const fs = require("fs");
const path = require("path");

const rootArg = process.argv[2];
if (!rootArg) {
  console.error('Usage: node apply-client-obe-sync.cjs "C:\\path\\to\\client"');
  process.exit(2);
}

const root = path.resolve(rootArg);
const servicePath = path.join(root, "src", "services", "markService.js");
const tabMarksPath = path.join(
  root,
  "src",
  "pages",
  "teacherCourse",
  "TabMarks.jsx"
);

for (const filePath of [servicePath, tabMarksPath]) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing required file: ${filePath}`);
    process.exit(1);
  }
}

function backup(filePath) {
  const backupPath = `${filePath}.before-obe-sync`;
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath);
  }
}

function replaceOnce(text, oldText, newText, label) {
  const first = text.indexOf(oldText);
  const last = text.lastIndexOf(oldText);
  if (first < 0 || first !== last) {
    const count = first < 0 ? 0 : 2;
    throw new Error(
      `Could not safely apply ${label}: expected one anchor, found ${count}.`
    );
  }
  return `${text.slice(0, first)}${newText}${text.slice(first + oldText.length)}`;
}

function updateMarkService() {
  let text = fs.readFileSync(servicePath, "utf8").replace(/\r\n/g, "\n");
  if (text.includes("syncMarksFromObeRequest")) {
    console.log(`Already updated: ${servicePath}`);
    return;
  }

  backup(servicePath);
  text = `${text.trimEnd()}\n\nexport const syncMarksFromObeRequest = async (courseId) => {\n  const res = await api.post(\`/courses/\${courseId}/marks/sync-from-obe\`);\n  return res.data;\n};\n`;
  fs.writeFileSync(servicePath, text, "utf8");
  console.log(`Updated: ${servicePath}`);
}

function updateTabMarks() {
  let text = fs.readFileSync(tabMarksPath, "utf8").replace(/\r\n/g, "\n");
  if (
    text.includes("handleFetchFromObe") &&
    text.includes("syncMarksFromObeRequest")
  ) {
    console.log(`Already updated: ${tabMarksPath}`);
    return;
  }

  backup(tabMarksPath);

  const oldImport = `import {
  fetchMarksForCourse,
  saveMarksForCourseRequest,
} from "../../services/markService";`;
  const newImport = `import {
  fetchMarksForCourse,
  saveMarksForCourseRequest,
  syncMarksFromObeRequest,
} from "../../services/markService";`;
  text = replaceOnce(text, oldImport, newImport, "mark service import");

  const oldState = `  const [saving, setSaving] = useState(false);
  const [publishingAssessmentId, setPublishingAssessmentId] = useState(null);`;
  const newState = `  const [saving, setSaving] = useState(false);
  const [syncingObeMarks, setSyncingObeMarks] = useState(false);
  const [publishingAssessmentId, setPublishingAssessmentId] = useState(null);`;
  text = replaceOnce(text, oldState, newState, "sync loading state");

  const handler = String.raw`

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
        text:
          (result?.message || "Fetch completed.") +
          " Matched assessments: " +
          matched.length +
          ". Skipped: " +
          skipped.length +
          ".",
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
`;

  const saveAnchor = "  const handleSave = async () => {";
  text = replaceOnce(
    text,
    saveAnchor,
    `${handler}\n${saveAnchor}`,
    "OBE fetch handler"
  );

  const headerIndex = text.indexOf("Marks Table");
  if (headerIndex < 0) {
    throw new Error("Could not find the Marks Table header.");
  }

  const badgeStartToken = `            <div
              className={[`;
  const badgeStart = text.indexOf(badgeStartToken, headerIndex);
  if (badgeStart < 0) {
    throw new Error("Could not find the created-total badge after Marks Table.");
  }

  const badgeEndToken = `              Created total: {formatMarksAmount(assessmentPlanSummary.total)} / 100
            </div>`;
  const badgeEndStart = text.indexOf(badgeEndToken, badgeStart);
  if (badgeEndStart < 0) {
    throw new Error("Could not find the end of the created-total badge.");
  }
  const badgeEnd = badgeEndStart + badgeEndToken.length;
  const originalBadge = text.slice(badgeStart, badgeEnd);
  const indentedBadge = originalBadge
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");

  const button = String.raw`
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
`;

  const replacement = `            <div className="flex flex-wrap items-center gap-2">\n${button}${indentedBadge}\n            </div>`;
  text = `${text.slice(0, badgeStart)}${replacement}${text.slice(badgeEnd)}`;

  fs.writeFileSync(tabMarksPath, text, "utf8");
  console.log(`Updated: ${tabMarksPath}`);
}

try {
  updateMarkService();
  updateTabMarks();
  console.log("Client OBE sync feature applied successfully.");
} catch (error) {
  console.error(`Patch failed: ${error.message}`);
  process.exit(1);
}
