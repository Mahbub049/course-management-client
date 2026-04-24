import { useEffect, useMemo, useState } from "react";
import { saveAs } from "file-saver";

import {
  fetchTeacherProjectSubmissions,
  downloadTeacherProjectPhaseZip,
} from "../../services/projectSubmissionService";

export default function TeacherProjectSubmissions({ course }) {
  const courseId = course?.id || course?._id;

  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState({ totals: null, phases: [] });
  const [error, setError] = useState("");
  const [selectedPhaseId, setSelectedPhaseId] = useState("");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState("");

  useEffect(() => {
    if (!courseId) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchTeacherProjectSubmissions(courseId);
      const phases = Array.isArray(data?.phases) ? data.phases : [];
      setPayload({
        totals: data?.totals || null,
        phases,
      });

      if (phases.length > 0) {
        const firstPhaseId = phases[0]?.phase?.id || "";
        setSelectedPhaseId((prev) =>
          phases.some((item) => item.phase?.id === prev) ? prev : firstPhaseId
        );
      } else {
        setSelectedPhaseId("");
        setSelectedSubmissionId("");
      }
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to load project submissions.");
    } finally {
      setLoading(false);
    }
  };

  const selectedPhase = useMemo(() => {
    return payload.phases.find((item) => item.phase?.id === selectedPhaseId) || null;
  }, [payload.phases, selectedPhaseId]);

  const filteredSubmissions = useMemo(() => {
    const items = Array.isArray(selectedPhase?.submissions) ? selectedPhase.submissions : [];
    const search = searchText.trim().toLowerCase();

    return items.filter((item) => {
      if (statusFilter === "submitted" && !item.hasSubmission) return false;
      if (statusFilter === "pending" && item.hasSubmission) return false;
      if (statusFilter === "with-file" && !item.hasFile) return false;
      if (statusFilter === "link-only" && !(item.hasSubmission && item.hasLink && !item.hasFile)) {
        return false;
      }

      if (!search) return true;

      const bag = [
        item.targetName,
        item.targetSecondary,
        item.group?.groupName,
        item.group?.projectTitle,
        item.student?.name,
        item.student?.roll,
        item.submittedBy?.name,
        item.submittedBy?.roll,
        item.fileName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return bag.includes(search);
    });
  }, [selectedPhase, searchText, statusFilter]);

  useEffect(() => {
    if (!selectedPhase) {
      setSelectedSubmissionId("");
      return;
    }

    const currentItems = Array.isArray(filteredSubmissions) ? filteredSubmissions : [];

    if (currentItems.length === 0) {
      setSelectedSubmissionId("");
      return;
    }

    const stillExists = currentItems.some((item) => item.id === selectedSubmissionId);
    if (!stillExists) {
      setSelectedSubmissionId(currentItems[0].id);
    }
  }, [selectedPhase, filteredSubmissions, selectedSubmissionId]);

  const selectedSubmission = useMemo(() => {
    return filteredSubmissions.find((item) => item.id === selectedSubmissionId) || null;
  }, [filteredSubmissions, selectedSubmissionId]);

  const handleViewFile = (item) => {
    if (!item?.fileUrl) return;
    window.open(item.fileUrl, "_blank", "noopener,noreferrer");
  };

  const handleDownloadFile = async (item) => {
    if (!item?.fileUrl) return;

    try {
      setDownloadingFileId(item.id);
      const response = await fetch(item.fileUrl);
      const blob = await response.blob();
      saveAs(blob, item.fileName || "submission-file");
    } catch (err) {
      console.error(err);
      alert("Failed to download file.");
    } finally {
      setDownloadingFileId("");
    }
  };

  const handleDownloadZip = async () => {
    if (!selectedPhase?.phase?.id) return;

    try {
      setDownloadingZip(true);
      const blob = await downloadTeacherProjectPhaseZip(courseId, selectedPhase.phase.id);
      saveAs(blob, `${safeName(selectedPhase.phase.title || "phase")}_submissions.zip`);
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to download ZIP.");
    } finally {
      setDownloadingZip(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="h-[620px] animate-pulse rounded-[28px] bg-slate-100 dark:bg-slate-800" />
        <div className="h-[620px] animate-pulse rounded-[28px] bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
        {error}
      </div>
    );
  }

  if (!payload.phases.length) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
        No project phases or submissions found yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <MiniMetric
            label="Phases"
            value={payload.totals?.phaseCount ?? 0}
            tone="violet"
          />
          <MiniMetric
            label="Expected"
            value={payload.totals?.expectedCount ?? 0}
            tone="sky"
          />
          <MiniMetric
            label="Submitted"
            value={payload.totals?.submittedCount ?? 0}
            tone="emerald"
          />
          <MiniMetric
            label="Pending"
            value={payload.totals?.pendingCount ?? 0}
            tone="amber"
          />
          <MiniMetric
            label="Files Uploaded"
            value={payload.totals?.withFileCount ?? 0}
            tone="slate"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Phases
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Open one phase at a time to avoid a crowded submission view.
            </p>
          </div>

          <div className="max-h-[720px] space-y-3 overflow-y-auto p-4">
            {payload.phases.map((item) => {
              const active = item.phase.id === selectedPhaseId;
              return (
                <button
                  key={item.phase.id}
                  type="button"
                  onClick={() => {
                    setSelectedPhaseId(item.phase.id);
                    setSelectedSubmissionId("");
                  }}
                  className={[
                    "w-full rounded-3xl border p-4 text-left transition",
                    active
                      ? "border-violet-500 bg-violet-50 shadow-sm dark:border-violet-500/40 dark:bg-violet-500/10"
                      : "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-slate-600",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {item.phase.title}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {item.phase.phaseType === "group" ? "Group" : "Individual"} • {item.phase.totalMarks} Marks
                      </div>
                    </div>

                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {item.overview.submittedCount}/{item.overview.expectedCount}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <SmallCount label="Submitted" value={item.overview.submittedCount} />
                    <SmallCount label="Pending" value={item.overview.pendingCount} />
                    <SmallCount label="Files" value={item.overview.withFileCount} />
                    <SmallCount label="Link Only" value={item.overview.linkOnlyCount} />
                  </div>

                  <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Due: {formatDateTime(item.phase.dueDate)}
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
                      {selectedPhase.phase.phaseType === "group" ? "Group" : "Individual"} submission
                      {" • "}
                      {selectedPhase.phase.totalMarks} marks
                      {" • "}
                      Due: {formatDateTime(selectedPhase.phase.dueDate)}
                    </p>

                    {selectedPhase.phase.instructions ? (
                      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                        {selectedPhase.phase.instructions}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      onClick={handleDownloadZip}
                      disabled={downloadingZip || selectedPhase.overview.submittedCount === 0}
                    >
                      {downloadingZip ? "Preparing ZIP..." : "Download ZIP"}
                    </ActionButton>
                  </div>
                </div>

                {Array.isArray(selectedPhase.phase.resourceLinks) &&
                selectedPhase.phase.resourceLinks.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedPhase.phase.resourceLinks.map((link, index) => (
                      <a
                        key={`${link}-${index}`}
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        Resource {index + 1}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 border-b border-slate-100 px-6 py-5 dark:border-slate-800 md:grid-cols-4">
                <MiniMetric label="Expected" value={selectedPhase.overview.expectedCount} tone="sky" />
                <MiniMetric label="Submitted" value={selectedPhase.overview.submittedCount} tone="emerald" />
                <MiniMetric label="Pending" value={selectedPhase.overview.pendingCount} tone="amber" />
                <MiniMetric label="Files Uploaded" value={selectedPhase.overview.withFileCount} tone="violet" />
              </div>

              <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder={
                      selectedPhase.phase.phaseType === "group"
                        ? "Search group name, title, member roll..."
                        : "Search student name or roll..."
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-violet-500 dark:focus:ring-violet-500/20 lg:max-w-md"
                  />

                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: "all", label: "All" },
                      { key: "submitted", label: "Submitted" },
                      { key: "pending", label: "Pending" },
                      { key: "with-file", label: "With File" },
                      { key: "link-only", label: "Link Only" },
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setStatusFilter(item.key)}
                        className={[
                          "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                          statusFilter === item.key
                            ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
                        ].join(" ")}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 p-6 2xl:grid-cols-[minmax(0,1.15fr)_380px]">
                <div className="space-y-3">
                  {filteredSubmissions.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                      No records matched your current filter.
                    </div>
                  ) : (
                    filteredSubmissions.map((item) => {
                      const active = item.id === selectedSubmissionId;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedSubmissionId(item.id)}
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
                                  {item.targetName}
                                </span>

                                {item.hasSubmission ? (
                                  <StatusBadge tone={item.isLate ? "rose" : "emerald"}>
                                    {item.isLate ? "Late" : "Submitted"}
                                  </StatusBadge>
                                ) : (
                                  <StatusBadge tone="amber">Pending</StatusBadge>
                                )}

                                {item.hasFile ? <StatusBadge tone="sky">File</StatusBadge> : null}
                                {item.hasSubmission && item.hasLink && !item.hasFile ? (
                                  <StatusBadge tone="violet">Link Only</StatusBadge>
                                ) : null}
                              </div>

                              {item.targetSecondary ? (
                                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                  {item.targetSecondary}
                                </div>
                              ) : null}

                              {item.targetType === "group" ? (
                                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  Members: {item.memberCount}
                                </div>
                              ) : null}
                            </div>

                            <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                              {item.hasSubmission
                                ? `Updated: ${formatDateTime(item.lastUpdatedAt)}`
                                : "Not submitted yet"}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div>
                  <div className="sticky top-4 rounded-[28px] border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-800/40">
                    {selectedSubmission ? (
                      <div className="space-y-5">
                        <div>
                          <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            {selectedSubmission.targetName}
                          </h4>
                          {selectedSubmission.targetSecondary ? (
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                              {selectedSubmission.targetSecondary}
                            </p>
                          ) : null}
                        </div>

                        <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
                          <InfoRow
                            label="Status"
                            value={
                              selectedSubmission.hasSubmission
                                ? selectedSubmission.isLate
                                  ? "Late Submission"
                                  : "Submitted On Time"
                                : "Pending"
                            }
                          />
                          <InfoRow
                            label="Submitted By"
                            value={
                              selectedSubmission.submittedBy
                                ? `${selectedSubmission.submittedBy.name}${
                                    selectedSubmission.submittedBy.roll
                                      ? ` (${selectedSubmission.submittedBy.roll})`
                                      : ""
                                  }`
                                : "-"
                            }
                          />
                          <InfoRow
                            label="Submitted At"
                            value={formatDateTime(selectedSubmission.submittedAt)}
                          />
                          <InfoRow
                            label="Last Updated"
                            value={formatDateTime(selectedSubmission.lastUpdatedAt)}
                          />
                          <InfoRow
                            label="File"
                            value={selectedSubmission.fileName || "-"}
                          />
                        </div>

                        {selectedSubmission.hasSubmission ? (
                          <>
                            <div className="flex flex-wrap gap-2">
                              <ActionButton
                                onClick={() => handleViewFile(selectedSubmission)}
                                disabled={!selectedSubmission.hasFile}
                              >
                                View File
                              </ActionButton>

                              <ActionButton
                                onClick={() => handleDownloadFile(selectedSubmission)}
                                disabled={
                                  !selectedSubmission.hasFile ||
                                  downloadingFileId === selectedSubmission.id
                                }
                              >
                                {downloadingFileId === selectedSubmission.id
                                  ? "Downloading..."
                                  : "Download File"}
                              </ActionButton>

                              <ActionButton
                                as="a"
                                href={selectedSubmission.link || "#"}
                                target="_blank"
                                rel="noreferrer"
                                disabled={!selectedSubmission.hasLink}
                              >
                                Open Link
                              </ActionButton>
                            </div>

                            {selectedSubmission.hasLink ? (
                              <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                  Submission Link
                                </div>
                                <a
                                  href={selectedSubmission.link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="break-all text-sm text-violet-600 hover:underline dark:text-violet-300"
                                >
                                  {selectedSubmission.link}
                                </a>
                              </div>
                            ) : null}

                            {selectedSubmission.note ? (
                              <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                  Note
                                </div>
                                <div className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                                  {selectedSubmission.note}
                                </div>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                            This group/student has not submitted yet.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                        Select a row to see full submission details.
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

function MiniMetric({ label, value, tone = "slate" }) {
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
    <div className={`rounded-3xl border p-4 ${toneClass[tone] || toneClass.slate}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}

function SmallCount({ label, value }) {
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

function StatusBadge({ children, tone = "slate" }) {
  const toneClass = {
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    rose:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
    amber:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    violet:
      "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300",
    sky: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300",
    slate:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass[tone] || toneClass.slate}`}
    >
      {children}
    </span>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0 dark:border-slate-800">
      <div className="text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-right font-medium text-slate-900 dark:text-slate-100">
        {value || "-"}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  as = "button",
  href,
  target,
  rel,
}) {
  const className = [
    "inline-flex items-center justify-center rounded-2xl border px-4 py-2.5 text-sm font-semibold transition",
    disabled
      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
  ].join(" ");

  if (as === "a") {
    return (
      <a
        href={disabled ? undefined : href}
        target={disabled ? undefined : target}
        rel={disabled ? undefined : rel}
        className={className}
        onClick={(e) => {
          if (disabled) e.preventDefault();
        }}
      >
        {children}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  );
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function safeName(value) {
  return String(value || "phase")
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase();
}