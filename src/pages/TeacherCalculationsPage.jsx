import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { getAuthItem } from "../utils/authStorage";
import {
  createDutyCalculation,
  getCalculationBootstrap,
  getDutyCalculation,
  getDutyCalculations,
  markDutyBillReceived,
  updateCalculationSettings,
  updateDutyCalculation,
} from "../services/calculationService";
import {
  classifyDutyEntry,
  extractDutyDocument,
  suggestSemesterFromText,
} from "../utils/dutyImport";

const EMPTY_SETTINGS = { dayDutyRate: 0, eveningDutyRate: 0, taxRate: 0 };

function money(value) {
  const number = Number(value || 0);
  return `৳${number.toLocaleString("en-BD", {
    minimumFractionDigits: Number.isInteger(number) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function apiMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function formatDate(value) {
  if (!value) return "—";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function TeacherCalculationsPage() {
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 10 });
  const [counts, setCounts] = useState({ pendingCount: 0, receivedCount: 0 });
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewId, setViewId] = useState("");

  const refresh = useCallback(async (targetPage = page, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [listData, bootstrap] = await Promise.all([
        getDutyCalculations(targetPage),
        getCalculationBootstrap(),
      ]);
      setItems(listData.items || []);
      setPagination(listData.pagination || { page: targetPage, pages: 1, total: 0, limit: 10 });
      setSettings(listData.settings || bootstrap.settings || EMPTY_SETTINGS);
      setCounts({
        pendingCount: Number(bootstrap.pendingCount || 0),
        receivedCount: Number(bootstrap.receivedCount || 0),
      });
      if (Number(listData.pagination?.page || targetPage) !== page) {
        setPage(Number(listData.pagination?.page || targetPage));
      }
    } catch (error) {
      console.error(error);
      Swal.fire("Could not load calculations", apiMessage(error, "Please try again."), "error");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    refresh(page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const semesterCount = pagination.total || 0;
  const totalPending = useMemo(
    () => items.filter((item) => item.status !== "received").reduce((sum, item) => sum + Number(item.billing?.total || 0), 0),
    [items]
  );

  const handleReceived = async (item) => {
    if (item.status === "received") return;
    const result = await Swal.fire({
      icon: "question",
      title: "Mark this bill as received?",
      text: `${item.semester} · ${item.examType}`,
      showCancelButton: true,
      confirmButtonText: "Yes, received",
      confirmButtonColor: "#7c3aed",
    });
    if (!result.isConfirmed) return;
    try {
      await markDutyBillReceived(item._id, true);
      await refresh(page, true);
      Swal.fire({ icon: "success", title: "Bill marked received", timer: 1300, showConfirmButton: false });
    } catch (error) {
      Swal.fire("Update failed", apiMessage(error, "Could not update bill status."), "error");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-5 pb-8">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-violet-500/10 via-indigo-500/5 to-transparent" />
        <div className="relative flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-600/20">
              <CalculatorIcon />
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Faculty Duty Calculations</h1>
                <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
                  OCR assisted
                </span>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Import invigilation duty lists, automatically classify day and evening duties, calculate tax-adjusted bills, and keep the editable recognized data without storing the original document.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <SettingsIcon /> Billing Settings
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-500"
            >
              <UploadIcon /> Import Duty List
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Saved Calculations" value={semesterCount} sub="10 records per page" icon={<StackIcon />} />
        <SummaryCard label="Pending Bills" value={counts.pendingCount} sub={`${money(totalPending)} on this page`} icon={<ClockIcon />} />
        <SummaryCard label="Received Bills" value={counts.receivedCount} sub="Marked after payment" icon={<CheckIcon />} />
        <SummaryCard
          label="Current Duty Rates"
          value={`${money(settings.dayDutyRate)} / ${money(settings.eveningDutyRate)}`}
          sub={`Day / Evening · Tax ${Number(settings.taxRate || 0)}%`}
          icon={<RateIcon />}
          compact
        />
      </section>

      <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-950 dark:text-white">Duty Billing History</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Latest semester first. Billing values use your current calculation settings.</p>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {pagination.total || 0} saved
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-500 dark:text-slate-400">
              <Spinner /> Loading calculations…
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-[340px] flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-violet-200 bg-violet-50 text-violet-600 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
              <CalculatorIcon />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">No duty calculation saved yet</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Import a faculty duty DOCX or PDF. The recognized rows will be stored as editable data, and the original file will not be uploaded to the server.
            </p>
            <button onClick={() => setImportOpen(true)} type="button" className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500">
              <UploadIcon /> Import First Duty List
            </button>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-[1320px] w-full text-left">
                <thead className="bg-slate-50/90 text-[11px] uppercase tracking-[0.08em] text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
                  <tr>
                    <Th>Semester</Th>
                    <Th>Exam Type</Th>
                    <Th>Day Duties</Th>
                    <Th>Day Duty Bill</Th>
                    <Th>Evening Duties</Th>
                    <Th>Evening Duty Bill</Th>
                    <Th>Total</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {items.map((item) => (
                    <tr key={item._id} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-900/40">
                      <Td><div className="font-bold text-slate-900 dark:text-white">{item.semester}</div><div className="mt-1 text-xs text-slate-500">{item.sourceFileName || "Recognized duty data"}</div></Td>
                      <Td><span className="font-semibold text-slate-800 dark:text-slate-200">{item.examType}</span></Td>
                      <Td><CountBadge type="day" value={item.billing?.dayDuties || 0} /></Td>
                      <Td><BillCell rate={item.billing?.dayDutyRate} amount={item.billing?.dayAmount} /></Td>
                      <Td><CountBadge type="evening" value={item.billing?.eveningDuties || 0} /></Td>
                      <Td><BillCell rate={item.billing?.eveningDutyRate} amount={item.billing?.eveningAmount} /></Td>
                      <Td>
                        <div className="font-extrabold text-slate-950 dark:text-white">{money(item.billing?.total)}</div>
                        <div className="mt-1 whitespace-nowrap text-[11px] text-slate-500">Gross {money(item.billing?.gross)} · Tax {item.billing?.taxRate || 0}% ({money(item.billing?.taxAmount)})</div>
                      </Td>
                      <Td><StatusBadge status={item.status} /></Td>
                      <Td>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={item.status === "received"}
                            onClick={() => handleReceived(item)}
                            className={item.status === "received"
                              ? "inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                              : "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-500/20 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"}
                          >
                            <CheckIcon small /> {item.status === "received" ? "Received" : "Bill Received"}
                          </button>
                          <button type="button" onClick={() => setViewId(item._id)} className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/15">
                            <EyeIcon /> View Duty List
                          </button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-4 lg:hidden">
              {items.map((item) => (
                <article key={item._id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="font-bold text-slate-950 dark:text-white">{item.semester}</h3><p className="mt-0.5 text-xs text-slate-500">{item.examType}</p></div>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <MiniMetric label="Day" value={`${item.billing?.dayDuties || 0} · ${money(item.billing?.dayAmount)}`} />
                    <MiniMetric label="Evening" value={`${item.billing?.eveningDuties || 0} · ${money(item.billing?.eveningAmount)}`} />
                    <MiniMetric label="Tax" value={`${item.billing?.taxRate || 0}% · ${money(item.billing?.taxAmount)}`} />
                    <MiniMetric label="Total" value={money(item.billing?.total)} strong />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button disabled={item.status === "received"} onClick={() => handleReceived(item)} type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:disabled:border-emerald-500/20 dark:disabled:bg-emerald-500/10 dark:disabled:text-emerald-300">
                      {item.status === "received" ? "Received" : "Bill Received"}
                    </button>
                    <button onClick={() => setViewId(item._id)} type="button" className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white">View Duties</button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {!loading && pagination.pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 dark:border-slate-800">
            <p className="text-xs text-slate-500">Page {pagination.page} of {pagination.pages} · maximum 10 calculations per page</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Previous</button>
              <button disabled={page >= pagination.pages} onClick={() => setPage((value) => Math.min(pagination.pages, value + 1))} type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Next</button>
            </div>
          </div>
        )}
      </section>

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={async () => { setSettingsOpen(false); await refresh(page, true); }}
        />
      )}
      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onSaved={async () => { setImportOpen(false); setPage(1); await refresh(1, true); }}
        />
      )}
      {viewId && (
        <DutyListModal
          id={viewId}
          onClose={() => setViewId("")}
          onSaved={async () => { await refresh(page, true); }}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, icon, compact = false }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
          <p className={`${compact ? "text-base" : "text-2xl"} mt-1 truncate font-extrabold text-slate-950 dark:text-white`}>{value}</p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{sub}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-600 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">{icon}</div>
      </div>
    </div>
  );
}

function Th({ children, className = "" }) { return <th className={`px-4 py-3 font-bold ${className}`}>{children}</th>; }
function Td({ children }) { return <td className="px-4 py-4 align-middle text-sm text-slate-700 dark:text-slate-300">{children}</td>; }

function CountBadge({ type, value }) {
  const evening = type === "evening";
  return <span className={evening
    ? "inline-flex min-w-9 items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
    : "inline-flex min-w-9 items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-extrabold text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300"}>{value}</span>;
}

function BillCell({ rate, amount }) {
  return <div><div className="font-bold text-slate-900 dark:text-white">{money(amount)}</div><div className="mt-1 text-[11px] text-slate-500">{money(rate)} / duty</div></div>;
}

function StatusBadge({ status }) {
  const received = status === "received";
  return <span className={received
    ? "inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
    : "inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"}>
    <span className={`h-1.5 w-1.5 rounded-full ${received ? "bg-emerald-500" : "bg-slate-400"}`} />{received ? "Received" : "Pending"}
  </span>;
}

function MiniMetric({ label, value, strong = false }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className={`${strong ? "text-violet-700 dark:text-violet-300" : "text-slate-800 dark:text-slate-200"} mt-1 text-sm font-extrabold`}>{value}</div></div>;
}

function ModalShell({ children, onClose, width = "max-w-4xl" }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`max-h-[92vh] w-full ${width} overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950`}>{children}</div>
    </div>
  );
}

function ModalHeader({ title, subtitle, onClose, icon }) {
  return <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-6"><div className="flex min-w-0 items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white">{icon}</div><div><h2 className="text-lg font-bold text-slate-950 dark:text-white">{title}</h2><p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{subtitle}</p></div></div><button onClick={onClose} type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"><CloseIcon /></button></div>;
}

function SettingsModal({ settings, onClose, onSaved }) {
  const [form, setForm] = useState({ ...EMPTY_SETTINGS, ...settings });
  const [saving, setSaving] = useState(false);
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await updateCalculationSettings({
        dayDutyRate: Number(form.dayDutyRate || 0),
        eveningDutyRate: Number(form.eveningDutyRate || 0),
        taxRate: Number(form.taxRate || 0),
      });
      await onSaved();
      Swal.fire({ icon: "success", title: "Billing settings saved", timer: 1300, showConfirmButton: false });
    } catch (error) {
      Swal.fire("Save failed", apiMessage(error, "Could not save settings."), "error");
    } finally { setSaving(false); }
  };
  return <ModalShell onClose={onClose} width="max-w-xl"><ModalHeader title="Billing Settings" subtitle="Set the per-duty rates and tax percentage used for all saved calculations." onClose={onClose} icon={<SettingsIcon />} /><form onSubmit={save}><div className="space-y-4 p-5 sm:p-6"><RateInput label="Day duty bill" value={form.dayDutyRate} onChange={(value) => setForm((old) => ({ ...old, dayDutyRate: value }))} prefix="৳" hint="Applied to Sun–Thu duties starting before 6:00 PM." /><RateInput label="Evening duty bill" value={form.eveningDutyRate} onChange={(value) => setForm((old) => ({ ...old, eveningDutyRate: value }))} prefix="৳" hint="All Friday and Saturday duties, plus Sun–Thu duties starting at or after 6:00 PM." /><RateInput label="Tax rate" value={form.taxRate} onChange={(value) => setForm((old) => ({ ...old, taxRate: value }))} suffix="%" max="100" hint="Tax is deducted from the gross duty bill to calculate the total receivable amount." /><div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-xs leading-5 text-violet-800 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200"><strong>Classification rule:</strong> Friday and Saturday are always evening duties. On other days, a duty starting at 6:00 PM or later is an evening duty.</div></div><div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Cancel</button><button disabled={saving} type="submit" className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save Settings"}</button></div></form></ModalShell>;
}

function RateInput({ label, value, onChange, prefix, suffix, hint, max }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">{label}</span><div className="flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-500/10 dark:border-slate-700 dark:bg-slate-900">{prefix && <span className="px-4 text-sm font-bold text-slate-500">{prefix}</span>}<input type="number" min="0" max={max} step="0.01" value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm font-semibold text-slate-900 outline-none dark:text-white" />{suffix && <span className="px-4 text-sm font-bold text-slate-500">{suffix}</span>}</div><span className="mt-1.5 block text-[11px] leading-4 text-slate-500">{hint}</span></label>;
}

function ImportModal({ onClose, onSaved }) {
  const [file, setFile] = useState(null);
  const [semester, setSemester] = useState("");
  const [examType, setExamType] = useState("Final Examination");
  const [duties, setDuties] = useState([]);
  const [summary, setSummary] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState("");
  const [saving, setSaving] = useState(false);
  const facultyCode = getAuthItem("marksPortalShortCode") || "";

  const chooseFile = (selected) => {
    if (!selected) return;
    setFile(selected);
    setDuties([]);
    setSummary(null);
    const suggested = suggestSemesterFromText(selected.name);
    if (suggested) setSemester((current) => current || suggested);
  };

  const analyze = async () => {
    if (!file) return Swal.fire("Choose a file", "Select a DOCX or PDF duty list first.", "info");
    setProcessing(true);
    setProgress("Preparing document recognition…");
    try {
      const result = await extractDutyDocument(file, { facultyCode, onProgress: setProgress });
      setDuties(result.duties || []);
      setSummary(result);
      if (!semester && result.suggestedSemester) setSemester(result.suggestedSemester);
    } catch (error) {
      console.error(error);
      Swal.fire("Recognition failed", apiMessage(error, "Could not read this duty list."), "error");
    } finally {
      setProcessing(false);
      setProgress("");
    }
  };

  const save = async () => {
    if (!semester.trim() || !examType.trim()) return Swal.fire("Missing information", "Enter semester and exam type before saving.", "warning");
    if (!duties.length) return Swal.fire("No recognized duties", "Analyze the document before saving.", "warning");
    setSaving(true);
    try {
      await createDutyCalculation({ semester: semester.trim(), examType: examType.trim(), sourceFileName: file?.name || "", duties });
      await onSaved();
      Swal.fire({ icon: "success", title: "Duty calculation saved", text: `${duties.length} duty rows were stored as editable recognized data.`, timer: 1800, showConfirmButton: false });
    } catch (error) {
      Swal.fire("Save failed", apiMessage(error, "Could not save duty calculation."), "error");
    } finally { setSaving(false); }
  };

  const counts = useMemo(() => ({ day: duties.filter((d) => d.dutyType === "day").length, evening: duties.filter((d) => d.dutyType === "evening").length }), [duties]);

  return <ModalShell onClose={onClose} width="max-w-6xl"><ModalHeader title="Import Duty List" subtitle="DOCX tables are read directly. PDFs use text extraction first and OCR automatically when needed. The original file stays on your device." onClose={onClose} icon={<UploadIcon />} /><div className="max-h-[calc(92vh-132px)] overflow-y-auto p-5 sm:p-6"><div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"><div className="space-y-4"><label className="block cursor-pointer rounded-[24px] border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition hover:border-violet-400 hover:bg-violet-50/40 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-violet-500/50"><input type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0])} /><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm dark:bg-slate-800 dark:text-violet-300"><DocumentIcon /></div><div className="text-sm font-bold text-slate-900 dark:text-white">{file ? file.name : "Choose DOCX or PDF duty list"}</div><div className="mt-1 text-xs text-slate-500">The document itself is not uploaded or stored.</div></label><div className="grid gap-3 sm:grid-cols-2"><Field label="Semester"><input value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="Summer 2026" className="field-input" /></Field><Field label="Exam Type"><input list="exam-types" value={examType} onChange={(e) => setExamType(e.target.value)} placeholder="Final Examination" className="field-input" /><datalist id="exam-types"><option value="Midterm Examination" /><option value="Final Examination" /><option value="Supplementary Examination" /><option value="Improvement Examination" /></datalist></Field></div><button disabled={!file || processing} onClick={analyze} type="button" className="flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">{processing ? <><Spinner /> {progress || "Reading…"}</> : <><ScanIcon /> Analyze Duty List</>}</button>{facultyCode && <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">Faculty shortcode <strong className="text-slate-900 dark:text-white">{facultyCode}</strong> will be used to keep matching invigilation rows when the document contains duties for multiple faculty members.</div>}{summary && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"><div className="font-bold">Recognition completed</div><div className="mt-1">Detected {summary.detectedRows} row{summary.detectedRows === 1 ? "" : "s"}; keeping {duties.length}. {summary.usedOcr ? "OCR was used for this PDF." : "Structured text/table data was available."}</div>{facultyCode && !summary.facultyFilterApplied && <div className="mt-1 font-semibold">No reliable shortcode filter was applied, so please review the recognized rows.</div>}</div>}</div><div className="min-w-0 rounded-[24px] border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800"><div><div className="text-sm font-bold text-slate-900 dark:text-white">Recognition Preview</div><div className="mt-0.5 text-[11px] text-slate-500">Review all details after saving from View Duty List.</div></div>{duties.length > 0 && <div className="flex gap-1.5"><CountBadge type="day" value={counts.day} /><CountBadge type="evening" value={counts.evening} /></div>}</div>{duties.length ? <div className="max-h-[430px] overflow-auto"><table className="min-w-[760px] w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-900"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Time</th><th className="px-3 py-2">Course / Program</th><th className="px-3 py-2">Invigilators</th><th className="px-3 py-2">Room</th><th className="px-3 py-2">Type</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{duties.map((duty, index) => <tr key={`${duty.date}-${duty.time}-${index}`}><td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200">{formatDate(duty.date)}<div className="text-[10px] text-slate-500">{duty.day}</div></td><td className="px-3 py-2.5 whitespace-nowrap">{duty.time}</td><td className="px-3 py-2.5"><div className="font-semibold text-slate-800 dark:text-slate-200">{duty.course || "—"}</div><div className="text-[10px] text-slate-500">{duty.program || "—"}</div></td><td className="px-3 py-2.5 max-w-[200px] truncate">{duty.invigilators || "—"}</td><td className="px-3 py-2.5">{duty.room || "—"}</td><td className="px-3 py-2.5"><TypeBadge type={duty.dutyType} /></td></tr>)}</tbody></table></div> : <div className="flex min-h-[300px] items-center justify-center p-8 text-center text-sm text-slate-500">Choose a file and click Analyze Duty List to preview recognized duties.</div>}</div></div></div><div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Cancel</button><button disabled={saving || !duties.length} onClick={save} type="button" className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : `Save ${duties.length || ""} Duties`}</button></div></ModalShell>;
}

function DutyListModal({ id, onClose, onSaved }) {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftDuties, setDraftDuties] = useState([]);
  const [draftMeta, setDraftMeta] = useState({ semester: "", examType: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDutyCalculation(id);
      setItem(data.item);
      setDraftDuties((data.item?.duties || []).map((duty) => ({ ...duty })));
      setDraftMeta({ semester: data.item?.semester || "", examType: data.item?.examType || "" });
    } catch (error) {
      Swal.fire("Could not load duties", apiMessage(error, "Please try again."), "error");
      onClose();
    } finally { setLoading(false); }
  }, [id, onClose]);
  useEffect(() => { load(); }, [load]);

  const updateRow = (index, field, value) => {
    setDraftDuties((rows) => rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const updated = { ...row, [field]: value };
      if (field === "startTime" || field === "endTime") updated.time = `${updated.startTime || ""}${updated.startTime && updated.endTime ? "–" : ""}${updated.endTime || ""}`;
      updated.dutyType = classifyDutyEntry(updated);
      return updated;
    }));
  };

  const save = async () => {
    if (!draftMeta.semester.trim() || !draftMeta.examType.trim()) return Swal.fire("Missing information", "Semester and exam type are required.", "warning");
    if (!draftDuties.length) return Swal.fire("No duties", "At least one duty must remain in the list.", "warning");
    setSaving(true);
    try {
      const data = await updateDutyCalculation(id, { ...draftMeta, duties: draftDuties });
      setItem(data.item);
      setDraftDuties((data.item?.duties || []).map((duty) => ({ ...duty })));
      setEditing(false);
      await onSaved();
      Swal.fire({ icon: "success", title: "Duty data updated", timer: 1300, showConfirmButton: false });
    } catch (error) {
      Swal.fire("Update failed", apiMessage(error, "Could not update duty data."), "error");
    } finally { setSaving(false); }
  };

  const editBilling = useMemo(() => {
    if (!item?.billing) return null;
    const dayDuties = draftDuties.filter((duty) => classifyDutyEntry(duty) === "day").length;
    const eveningDuties = draftDuties.filter((duty) => classifyDutyEntry(duty) === "evening").length;
    const dayAmount = dayDuties * Number(item.billing.dayDutyRate || 0);
    const eveningAmount = eveningDuties * Number(item.billing.eveningDutyRate || 0);
    const gross = dayAmount + eveningAmount;
    const taxAmount = gross * Number(item.billing.taxRate || 0) / 100;
    return { ...item.billing, dayDuties, eveningDuties, dayAmount, eveningAmount, gross, taxAmount, total: gross - taxAmount };
  }, [draftDuties, item]);
  const billing = editing ? editBilling : item?.billing;

  return <ModalShell onClose={onClose} width="max-w-[1500px]"><ModalHeader title="Duty List" subtitle="Recognized rows are stored as editable data. Changing date or time automatically re-checks day/evening classification." onClose={onClose} icon={<DocumentIcon />} />{loading ? <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500"><Spinner /> <span className="ml-2">Loading duty list…</span></div> : item && <><div className="max-h-[calc(92vh-150px)] overflow-y-auto"><div className="border-b border-slate-200 p-5 dark:border-slate-800 sm:p-6"><div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div className="grid flex-1 gap-3 sm:grid-cols-2 xl:max-w-2xl">{editing ? <><Field label="Semester"><input value={draftMeta.semester} onChange={(e) => setDraftMeta((old) => ({ ...old, semester: e.target.value }))} className="field-input" /></Field><Field label="Exam Type"><input value={draftMeta.examType} onChange={(e) => setDraftMeta((old) => ({ ...old, examType: e.target.value }))} className="field-input" /></Field></> : <><div><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Semester</div><div className="mt-1 text-lg font-extrabold text-slate-950 dark:text-white">{item.semester}</div></div><div><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Exam Type</div><div className="mt-1 text-lg font-extrabold text-slate-950 dark:text-white">{item.examType}</div></div></>}</div><div className="flex flex-wrap gap-2">{editing ? <><button onClick={() => { setEditing(false); setDraftDuties((item.duties || []).map((duty) => ({ ...duty }))); setDraftMeta({ semester: item.semester, examType: item.examType }); }} type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">Cancel Edit</button><button disabled={saving} onClick={save} type="button" className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save & Recalculate"}</button></> : <button onClick={() => setEditing(true)} type="button" className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-bold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300"><EditIcon /> Edit OCR Data</button>}</div></div><div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-5"><MiniMetric label="Day Duties" value={`${billing?.dayDuties || 0} · ${money(billing?.dayAmount)}`} /><MiniMetric label="Evening Duties" value={`${billing?.eveningDuties || 0} · ${money(billing?.eveningAmount)}`} /><MiniMetric label="Gross Bill" value={money(billing?.gross)} /><MiniMetric label={`Tax (${billing?.taxRate || 0}%)`} value={money(billing?.taxAmount)} /><MiniMetric label="Net Total" value={money(billing?.total)} strong /></div></div><div className="overflow-x-auto"><table className="min-w-[1450px] w-full text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase tracking-wide text-slate-500 shadow-sm dark:bg-slate-900"><tr><th className="px-3 py-3">#</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Time</th><th className="px-3 py-3">Program</th><th className="px-3 py-3">Intake</th><th className="px-3 py-3">Sec.</th><th className="px-3 py-3">Course</th><th className="px-3 py-3">Course Teacher</th><th className="px-3 py-3">Invigilators</th><th className="px-3 py-3">Room</th><th className="px-3 py-3">Type</th>{editing && <th className="px-3 py-3 text-right">Remove</th>}</tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{draftDuties.map((duty, index) => { const type = classifyDutyEntry(duty); return <tr key={duty._id || `${index}-${duty.date}-${duty.time}`} className="align-top"><td className="px-3 py-3 font-bold text-slate-400">{index + 1}</td><EditCell editing={editing} value={duty.date} onChange={(value) => updateRow(index, "date", value)} type="date" display={<><div className="font-semibold text-slate-800 dark:text-slate-200">{formatDate(duty.date)}</div><div className="mt-0.5 text-[10px] text-slate-500">{duty.day}</div></>} /><td className="px-3 py-3">{editing ? <div className="flex min-w-[205px] items-center gap-1"><TinyInput value={duty.startTime} onChange={(value) => updateRow(index, "startTime", value)} placeholder="9:30 AM" /><span className="text-slate-400">–</span><TinyInput value={duty.endTime} onChange={(value) => updateRow(index, "endTime", value)} placeholder="11:30 AM" /></div> : <span className="whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">{duty.time}</span>}</td><EditCell editing={editing} value={duty.program} onChange={(value) => updateRow(index, "program", value)} wide /><EditCell editing={editing} value={duty.intake} onChange={(value) => updateRow(index, "intake", value)} /><EditCell editing={editing} value={duty.section} onChange={(value) => updateRow(index, "section", value)} /><EditCell editing={editing} value={duty.course} onChange={(value) => updateRow(index, "course", value)} /><EditCell editing={editing} value={duty.courseTeacher} onChange={(value) => updateRow(index, "courseTeacher", value)} /><EditCell editing={editing} value={duty.invigilators} onChange={(value) => updateRow(index, "invigilators", value)} wide /><EditCell editing={editing} value={duty.room} onChange={(value) => updateRow(index, "room", value)} /><td className="px-3 py-3"><TypeBadge type={type} /></td>{editing && <td className="px-3 py-3 text-right"><button onClick={() => setDraftDuties((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} type="button" className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">Remove</button></td>}</tr>; })}</tbody></table></div>{editing && <div className="border-t border-slate-200 p-4 dark:border-slate-800"><button type="button" onClick={() => setDraftDuties((rows) => [...rows, { date: "", day: "", startTime: "", endTime: "", time: "", program: "", intake: "", section: "", course: "", courseTeacher: "", invigilators: "", room: "", dutyType: "day" }])} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-violet-300 bg-violet-50 px-4 py-2 text-xs font-bold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300"><PlusIcon /> Add Duty Row</button></div>}</div><div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800"><div className="text-[11px] text-slate-500">Source: {item.sourceFileName || "Recognized duty data"}</div><button onClick={onClose} type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Close</button></div></>}</ModalShell>;
}

function EditCell({ editing, value, onChange, display, type = "text", wide = false }) {
  return <td className="px-3 py-3">{editing ? <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} className={`${wide ? "min-w-[190px]" : "min-w-[100px]"} w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-900 outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white`} /> : display || <span className={`${wide ? "inline-block max-w-[220px]" : ""} text-slate-700 dark:text-slate-300`}>{value || "—"}</span>}</td>;
}
function TinyInput({ value, onChange, placeholder }) { return <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-[92px] rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />; }
function Field({ label, children }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">{label}</span>{children}</label>; }
function TypeBadge({ type }) { const evening = type === "evening"; return <span className={evening ? "inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300" : "inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300"}>{evening ? "Evening" : "Day"}</span>; }

function Spinner() { return <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".2"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>; }
function CalculatorIcon() { return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="5" y="2.5" width="14" height="19" rx="3"/><path d="M8 6.5h8v3H8zM8 13h1M12 13h1M16 13h1M8 17h1M12 17h1M16 17h1"/></svg>; }
function SettingsIcon() { return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.3.34.52.75.6 1.2H21v4h-.1c-.45.08-.86.3-1.5.8Z"/></svg>; }
function UploadIcon() { return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4m0 0-4 4m4-4 4 4M5 14v5h14v-5"/></svg>; }
function StackIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>; }
function ClockIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>; }
function CheckIcon({ small = false }) { return <svg viewBox="0 0 24 24" className={small ? "h-3.5 w-3.5" : "h-5 w-5"} fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 12 4 4L19 6"/></svg>; }
function RateIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M4 17h16M8 4v6M16 14v6"/><circle cx="8" cy="7" r="2"/><circle cx="16" cy="17" r="2"/></svg>; }
function EyeIcon() { return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>; }
function CloseIcon() { return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18"/></svg>; }
function DocumentIcon() { return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></svg>; }
function ScanIcon() { return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 12h10"/></svg>; }
function EditIcon() { return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z"/><path d="m13.5 6.5 3.5 3.5"/></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>; }

export default TeacherCalculationsPage;
