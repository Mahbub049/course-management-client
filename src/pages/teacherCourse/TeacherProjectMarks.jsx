import { useEffect, useMemo, useState } from "react";
import {
  fetchTeacherProjectEvaluations,
  saveProjectEvaluation,
} from "../../services/projectEvaluationService";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "evaluated", label: "Evaluated" },
];

export default function TeacherProjectMarks({ course }) {
  const courseId = course?.id || course?._id;

  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [payload, setPayload] = useState({ totals: null, phases: [] });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedPhaseId, setSelectedPhaseId] = useState("");
  const [selectedTargetKey, setSelectedTargetKey] = useState("");
  const [markingModes, setMarkingModes] = useState({});
  const [drafts, setDrafts] = useState({});
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (!courseId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const data = await fetchTeacherProjectEvaluations(courseId);
      const nextPayload = {
        totals: data?.totals || null,
        phases: Array.isArray(data?.phases) ? data.phases : [],
      };

      setPayload(nextPayload);

      const nextMarkingModes = {};
      const nextDrafts = {};

      nextPayload.phases.forEach((phaseBlock) => {
        (phaseBlock.items || []).forEach((item) => {
          nextMarkingModes[item.targetKey] =
            phaseBlock.phase.phaseType === "group"
              ? item.suggestedMode || "combined"
              : "combined";

          nextDrafts[buildDraftKey(item.targetKey, "combined")] = {
            marksObtained:
              item.combinedEvaluation?.marksObtained ??
              item.evaluation?.marksObtained ??
              "",
            feedback:
              item.combinedEvaluation?.feedback ||
              item.evaluation?.feedback ||
              "",
          };

          (item.memberEvaluations || []).forEach((memberItem) => {
            nextDrafts[
              buildDraftKey(item.targetKey, "member", memberItem.student.id)
            ] = {
              marksObtained: memberItem.evaluation?.marksObtained ?? "",
              feedback: memberItem.evaluation?.feedback || "",
            };
          });
        });
      });

      setMarkingModes(nextMarkingModes);
      setDrafts(nextDrafts);

      const firstPhaseId = nextPayload.phases[0]?.phase?.id || "";
      setSelectedPhaseId((prev) =>
        nextPayload.phases.some((item) => item.phase.id === prev)
          ? prev
          : firstPhaseId
      );
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load project marks.");
    } finally {
      setLoading(false);
    }
  };

  const selectedPhase = useMemo(() => {
    return payload.phases.find((item) => item.phase.id === selectedPhaseId) || null;
  }, [payload.phases, selectedPhaseId]);

  const filteredItems = useMemo(() => {
    const list = Array.isArray(selectedPhase?.items) ? selectedPhase.items : [];
    const search = searchText.trim().toLowerCase();

    return list.filter((item) => {
      const isEvaluated = getTargetEvaluated(item);

      if (statusFilter === "pending" && isEvaluated) return false;
      if (statusFilter === "evaluated" && !isEvaluated) return false;

      if (!search) return true;

      const bag = [
        item.group?.groupName,
        item.group?.projectTitle,
        ...(item.group?.members || []).map(
          (member) => `${member.name} ${member.roll}`
        ),
        item.student?.name,
        item.student?.roll,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return bag.includes(search);
    });
  }, [selectedPhase, searchText, statusFilter]);

  useEffect(() => {
    if (!selectedPhase) {
      setSelectedTargetKey("");
      return;
    }

    if (!filteredItems.length) {
      setSelectedTargetKey("");
      return;
    }

    const exists = filteredItems.some(
      (item) => item.targetKey === selectedTargetKey
    );

    if (!exists) {
      setSelectedTargetKey(filteredItems[0].targetKey);
    }
  }, [filteredItems, selectedPhase, selectedTargetKey]);

  const selectedTarget = useMemo(() => {
    return filteredItems.find((item) => item.targetKey === selectedTargetKey) || null;
  }, [filteredItems, selectedTargetKey]);

  const activeMode = selectedTarget
    ? markingModes[selectedTarget.targetKey] ||
      selectedTarget.suggestedMode ||
      "combined"
    : "combined";

  const handleDraftChange = (
    targetKey,
    scope,
    field,
    value,
    studentId = ""
  ) => {
    const key = buildDraftKey(targetKey, scope, studentId);
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || { marksObtained: "", feedback: "" }),
        [field]: value,
      },
    }));
  };

  const handleModeChange = (targetKey, mode) => {
    setMarkingModes((prev) => ({
      ...prev,
      [targetKey]: mode,
    }));
    setSuccess("");
    setError("");
  };

  const handleSaveCombined = async (phaseId, phaseTotalMarks, item) => {
    const draftKey = buildDraftKey(item.targetKey, "combined");
    const draft = drafts[draftKey] || { marksObtained: "", feedback: "" };

    try {
      setSavingKey(draftKey);
      setError("");
      setSuccess("");

      validateMarks(draft.marksObtained, phaseTotalMarks);

      await saveProjectEvaluation(courseId, phaseId, {
        submissionId: item.submission.id,
        marksObtained: Number(draft.marksObtained),
        feedback: draft.feedback || "",
        evaluationScope: "combined",
      });

      setSuccess("Marks saved successfully.");
      await loadData();
      setSelectedPhaseId(phaseId);
      setSelectedTargetKey(item.targetKey);
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          err.message ||
          "Failed to save marks."
      );
    } finally {
      setSavingKey("");
    }
  };

  const handleSaveMember = async (
    phaseId,
    phaseTotalMarks,
    item,
    memberItem
  ) => {
    const draftKey = buildDraftKey(
      item.targetKey,
      "member",
      memberItem.student.id
    );
    const draft = drafts[draftKey] || { marksObtained: "", feedback: "" };

    try {
      setSavingKey(draftKey);
      setError("");
      setSuccess("");

      validateMarks(draft.marksObtained, phaseTotalMarks);

      await saveProjectEvaluation(courseId, phaseId, {
        submissionId: item.submission.id,
        marksObtained: Number(draft.marksObtained),
        feedback: draft.feedback || "",
        evaluationScope: "member",
        targetStudentId: memberItem.student.id,
      });

      setSuccess(`${memberItem.student.name} marked successfully.`);
      await loadData();
      setSelectedPhaseId(phaseId);
      setSelectedTargetKey(item.targetKey);
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          err.message ||
          "Failed to save member marks."
      );
    } finally {
      setSavingKey("");
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="h-[680px] animate-pulse rounded-[28px] bg-slate-100 dark:bg-slate-800" />
        <div className="h-[680px] animate-pulse rounded-[28px] bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }

  if (error && !payload.phases.length) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
        {error}
      </div>
    );
  }

  if (!payload.phases.length) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
        No submitted project work found for marking yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard
            label="Phases"
            value={payload.totals?.phaseCount ?? 0}
            tone="violet"
          />
          <MetricCard
            label="Submissions"
            value={payload.totals?.submissionCount ?? 0}
            tone="sky"
          />
          <MetricCard
            label="Evaluated"
            value={payload.totals?.evaluatedCount ?? 0}
            tone="emerald"
          />
          <MetricCard
            label="Pending"
            value={payload.totals?.pendingCount ?? 0}
            tone="amber"
          />
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          {success}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Project Phases
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Open one phase and mark only the selected target to keep the page clean.
            </p>
          </div>

          <div className="max-h-[760px] space-y-3 overflow-y-auto p-4">
            {payload.phases.map((block) => {
              const active = block.phase.id === selectedPhaseId;

              return (
                <button
                  key={block.phase.id}
                  type="button"
                  onClick={() => {
                    setSelectedPhaseId(block.phase.id);
                    setSelectedTargetKey("");
                  }}
                  className={[
                    "w-full rounded-3xl border p-4 text-left transition",
                    active
                      ? "border-violet-500 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/10"
                      : "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-slate-600",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {block.phase.title}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {block.phase.phaseType === "group" ? "Group" : "Individual"} •{" "}
                        {block.phase.totalMarks} Marks
                      </div>
                    </div>

                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {block.summary.evaluatedCount}/{block.summary.submissionCount}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <MiniCount label="Targets" value={block.summary.submissionCount} />
                    <MiniCount label="Evaluated" value={block.summary.evaluatedCount} />
                    <MiniCount label="Pending" value={block.summary.pendingCount} />
                    <MiniCount label="Due" value={formatShortDate(block.phase.dueDate)} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <div className="space-y-6">
          {selectedPhase ? (
            <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {selectedPhase.phase.title}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      {selectedPhase.phase.phaseType === "group" ? "Group" : "Individual"} evaluation •{" "}
                      {selectedPhase.phase.totalMarks} marks
                    </p>
                    {selectedPhase.phase.instructions ? (
                      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                        {selectedPhase.phase.instructions}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-3 gap-3 sm:min-w-[320px]">
                    <MetricCard
                      label="Targets"
                      value={selectedPhase.summary.submissionCount}
                      tone="sky"
                      compact
                    />
                    <MetricCard
                      label="Done"
                      value={selectedPhase.summary.evaluatedCount}
                      tone="emerald"
                      compact
                    />
                    <MetricCard
                      label="Left"
                      value={selectedPhase.summary.pendingCount}
                      tone="amber"
                      compact
                    />
                  </div>
                </div>
              </div>

              <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder={
                      selectedPhase.phase.phaseType === "group"
                        ? "Search group name, project title, member roll..."
                        : "Search student name or roll..."
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-violet-500 dark:focus:ring-violet-500/20 lg:max-w-md"
                  />

                  <div className="flex flex-wrap gap-2">
                    {FILTERS.map((filter) => (
                      <button
                        key={filter.key}
                        type="button"
                        onClick={() => setStatusFilter(filter.key)}
                        className={[
                          "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                          statusFilter === filter.key
                            ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
                        ].join(" ")}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 p-6 2xl:grid-cols-[minmax(0,1.1fr)_420px]">
                <div className="space-y-3">
                  {filteredItems.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                      No target matched your filter.
                    </div>
                  ) : (
                    filteredItems.map((item) => {
                      const active = item.targetKey === selectedTargetKey;
                      const evaluated = getTargetEvaluated(item);

                      return (
                        <button
                          key={item.targetKey}
                          type="button"
                          onClick={() => setSelectedTargetKey(item.targetKey)}
                          className={[
                            "w-full rounded-3xl border p-4 text-left transition",
                            active
                              ? "border-violet-500 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/10"
                              : "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-slate-600",
                          ].join(" ")}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                  {item.group?.groupName || item.student?.name}
                                </span>

                                <StatusBadge tone={evaluated ? "emerald" : "amber"}>
                                  {evaluated ? "Evaluated" : "Pending"}
                                </StatusBadge>

                                {selectedPhase.phase.phaseType === "group" ? (
                                  <StatusBadge tone="sky">
                                    {(item.group?.members || []).length} Members
                                  </StatusBadge>
                                ) : null}
                              </div>

                              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                {item.group?.projectTitle || item.student?.roll || "No subtitle"}
                              </div>

                              {selectedPhase.phase.phaseType === "group" ? (
                                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                  {item.group?.members
                                    ?.map((member) => getMemberChipLabel(member))
                                    .join(", ")}
                                </div>
                              ) : null}
                            </div>

                            <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                              Submitted: {formatDateTime(item.submission?.submittedAt)}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div>
                  <div className="sticky top-4 rounded-[28px] border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-800/40">
                    {selectedTarget ? (
                      <div className="space-y-5">
                        <div>
                          <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            {selectedTarget.group?.groupName || selectedTarget.student?.name}
                          </h4>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {selectedTarget.group?.projectTitle || selectedTarget.student?.roll || ""}
                          </p>
                        </div>

                        <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                          <div className="grid gap-3 text-sm md:grid-cols-2">
                            <ReadOnlyField
                              label="Submitted At"
                              value={formatDateTime(selectedTarget.submission?.submittedAt)}
                            />
                            <ReadOnlyField
                              label="Last Updated"
                              value={formatDateTime(selectedTarget.submission?.lastUpdatedAt)}
                            />
                            <ReadOnlyField
                              label="Submission Link"
                              value={selectedTarget.submission?.link || "-"}
                              isLink={Boolean(selectedTarget.submission?.link)}
                            />
                            <ReadOnlyField
                              label="Note"
                              value={selectedTarget.submission?.note || "-"}
                            />
                          </div>
                        </div>

                        {selectedPhase.phase.phaseType === "group" ? (
                          <>
                            <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    Marking Mode
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    Choose one mode first, then enter marks and feedback.
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <ModeButton
                                  active={activeMode === "combined"}
                                  onClick={() =>
                                    handleModeChange(selectedTarget.targetKey, "combined")
                                  }
                                >
                                  Combined Group Marks
                                </ModeButton>

                                <ModeButton
                                  active={activeMode === "member"}
                                  onClick={() =>
                                    handleModeChange(selectedTarget.targetKey, "member")
                                  }
                                >
                                  Individual Member Marks
                                </ModeButton>
                              </div>
                            </div>

                            {activeMode === "combined" ? (
                              <CombinedMarksCard
                                item={selectedTarget}
                                totalMarks={selectedPhase.phase.totalMarks}
                                draft={
                                  drafts[
                                    buildDraftKey(selectedTarget.targetKey, "combined")
                                  ] || { marksObtained: "", feedback: "" }
                                }
                                saving={
                                  savingKey ===
                                  buildDraftKey(selectedTarget.targetKey, "combined")
                                }
                                onChange={(field, value) =>
                                  handleDraftChange(
                                    selectedTarget.targetKey,
                                    "combined",
                                    field,
                                    value
                                  )
                                }
                                onSave={() =>
                                  handleSaveCombined(
                                    selectedPhase.phase.id,
                                    selectedPhase.phase.totalMarks,
                                    selectedTarget
                                  )
                                }
                              />
                            ) : (
                              <div className="space-y-4">
                                {(selectedTarget.memberEvaluations || []).map(
                                  (memberItem) => {
                                    const memberKey = buildDraftKey(
                                      selectedTarget.targetKey,
                                      "member",
                                      memberItem.student.id
                                    );

                                    return (
                                      <MemberMarksCard
                                        key={memberItem.student.id}
                                        memberItem={memberItem}
                                        totalMarks={selectedPhase.phase.totalMarks}
                                        draft={
                                          drafts[memberKey] || {
                                            marksObtained: "",
                                            feedback: "",
                                          }
                                        }
                                        saving={savingKey === memberKey}
                                        onChange={(field, value) =>
                                          handleDraftChange(
                                            selectedTarget.targetKey,
                                            "member",
                                            field,
                                            value,
                                            memberItem.student.id
                                          )
                                        }
                                        onSave={() =>
                                          handleSaveMember(
                                            selectedPhase.phase.id,
                                            selectedPhase.phase.totalMarks,
                                            selectedTarget,
                                            memberItem
                                          )
                                        }
                                      />
                                    );
                                  }
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <CombinedMarksCard
                            item={selectedTarget}
                            totalMarks={selectedPhase.phase.totalMarks}
                            draft={
                              drafts[
                                buildDraftKey(selectedTarget.targetKey, "combined")
                              ] || { marksObtained: "", feedback: "" }
                            }
                            saving={
                              savingKey ===
                              buildDraftKey(selectedTarget.targetKey, "combined")
                            }
                            onChange={(field, value) =>
                              handleDraftChange(
                                selectedTarget.targetKey,
                                "combined",
                                field,
                                value
                              )
                            }
                            onSave={() =>
                              handleSaveCombined(
                                selectedPhase.phase.id,
                                selectedPhase.phase.totalMarks,
                                selectedTarget
                              )
                            }
                          />
                        )}
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                        Select one target from the list to start marking.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CombinedMarksCard({
  item,
  totalMarks,
  draft,
  saving,
  onChange,
  onSave,
}) {
  const savedEvaluation = item.combinedEvaluation || item.evaluation || null;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Combined Marks
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            One mark and one feedback for the full submission.
          </div>
        </div>

        {savedEvaluation ? (
          <StatusBadge tone="emerald">
            Saved: {savedEvaluation.marksObtained}/{totalMarks}
          </StatusBadge>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        <FieldLabel>Marks Obtained</FieldLabel>
        <input
          type="number"
          min="0"
          max={totalMarks}
          value={draft.marksObtained}
          onChange={(e) => onChange("marksObtained", e.target.value)}
          placeholder={`0 - ${totalMarks}`}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-violet-500 dark:focus:ring-violet-500/20"
        />

        <FieldLabel>Feedback</FieldLabel>
        <textarea
          rows={5}
          value={draft.feedback}
          onChange={(e) => onChange("feedback", e.target.value)}
          placeholder="Write feedback for this submission"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-violet-500 dark:focus:ring-violet-500/20"
        />

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Maximum marks: {totalMarks}
          </div>

          <SaveButton onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Save Marks"}
          </SaveButton>
        </div>
      </div>
    </div>
  );
}

function MemberMarksCard({
  memberItem,
  totalMarks,
  draft,
  saving,
  onChange,
  onSave,
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {memberItem.student.name}
            {memberItem.student.roll ? ` (${memberItem.student.roll})` : ""}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Member-wise mark entry
          </div>
        </div>

        {memberItem.evaluation ? (
          <StatusBadge tone="emerald">
            Saved: {memberItem.evaluation.marksObtained}/{totalMarks}
          </StatusBadge>
        ) : (
          <StatusBadge tone="amber">Not Marked</StatusBadge>
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[180px_minmax(0,1fr)]">
        <div>
          <FieldLabel>Marks Obtained</FieldLabel>
          <input
            type="number"
            min="0"
            max={totalMarks}
            value={draft.marksObtained}
            onChange={(e) => onChange("marksObtained", e.target.value)}
            placeholder={`0 - ${totalMarks}`}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-violet-500 dark:focus:ring-violet-500/20"
          />
        </div>

        <div>
          <FieldLabel>Feedback</FieldLabel>
          <textarea
            rows={4}
            value={draft.feedback}
            onChange={(e) => onChange("feedback", e.target.value)}
            placeholder="Write feedback for this member"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-violet-500 dark:focus:ring-violet-500/20"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end">
        <SaveButton onClick={onSave} disabled={saving}>
          {saving ? "Saving..." : "Save Member Marks"}
        </SaveButton>
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone = "slate", compact = false }) {
  const toneClass = {
    violet:
      "border-violet-200 bg-violet-50 dark:border-violet-500/20 dark:bg-violet-500/10",
    sky: "border-sky-200 bg-sky-50 dark:border-sky-500/20 dark:bg-sky-500/10",
    emerald:
      "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10",
    amber:
      "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10",
    slate:
      "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50",
  };

  return (
    <div
      className={`rounded-3xl border ${compact ? "p-3" : "p-4"} ${
        toneClass[tone] || toneClass.slate
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div
        className={`${
          compact ? "mt-1 text-xl" : "mt-2 text-2xl"
        } font-bold text-slate-900 dark:text-slate-100`}
      >
        {value}
      </div>
    </div>
  );
}

function MiniCount({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-4 py-2 text-sm font-semibold transition",
        active
          ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SaveButton({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function ReadOnlyField({ label, value, isLink = false }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-2 break-all text-sm text-slate-700 dark:text-slate-200">
        {isLink && value && value !== "-" ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="text-violet-600 hover:underline dark:text-violet-300"
          >
            {value}
          </a>
        ) : (
          value || "-"
        )}
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label className="text-sm font-semibold text-slate-900 dark:text-slate-100">
      {children}
    </label>
  );
}

function StatusBadge({ children, tone = "slate" }) {
  const toneClass = {
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    amber:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    sky: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300",
    slate:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
        toneClass[tone] || toneClass.slate
      }`}
    >
      {children}
    </span>
  );
}

function buildDraftKey(targetKey, scope, studentId = "") {
  return `${targetKey}__${scope}__${studentId}`;
}

function getTargetEvaluated(item) {
  if (item.combinedEvaluation || item.evaluation) return true;
  return (item.memberEvaluations || []).some((member) => member.evaluation);
}

function validateMarks(value, totalMarks) {
  if (String(value).trim() === "") {
    throw new Error("Marks cannot be empty");
  }

  const numeric = Number(value);

  if (Number.isNaN(numeric)) {
    throw new Error("Marks must be a number");
  }

  if (numeric < 0 || numeric > Number(totalMarks || 0)) {
    throw new Error(`Marks must be between 0 and ${Number(totalMarks || 0)}`);
  }
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatShortDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function getMemberChipLabel(member) {
  return `${member.name || "Unnamed"}${member.roll ? ` (${member.roll})` : ""}`;
}