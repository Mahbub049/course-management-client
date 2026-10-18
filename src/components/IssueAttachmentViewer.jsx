import { useEffect, useState } from "react";
import JSZip from "jszip";

const extensionOf = (name = "") => String(name).split(".").pop().toLowerCase();

/** Scoped in-portal evidence preview; DOCX is read locally without a third-party viewer. */
export default function IssueAttachmentViewer({ file, onClose }) {
  const [paragraphs, setParagraphs] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [enableOfficeViewer, setEnableOfficeViewer] = useState(false);
  const ext = extensionOf(file?.name);
  useEffect(() => {
    if (!file) return undefined;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEscape = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onEscape);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", onEscape); };
  }, [file, onClose]);
  useEffect(() => {
    if (!file?.url || ext !== "docx") return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const response = await fetch(file.url);
        if (!response.ok) throw new Error("The file link has expired. Reopen this issue and try again.");
        const zip = await JSZip.loadAsync(await response.arrayBuffer());
        const content = await zip.file("word/document.xml")?.async("string");
        if (!content) throw new Error("Unable to read this Word document.");
        const xml = new DOMParser().parseFromString(content, "application/xml");
        if (xml.querySelector("parsererror")) throw new Error("Invalid Word document.");
        // textContent is rendered as React text, never interpreted as uploaded HTML.
        const nodes = [...xml.getElementsByTagName("w:p")];
        const output = nodes.map((p) => [...p.getElementsByTagName("w:t")]
          .map((node) => node.textContent).join(""));
        if (!cancelled) setParagraphs(output);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not preview this document.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [file, ext]);
  if (!file?.url) return null;
  const image = ["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(ext);
  const pdf = ext === "pdf";
  const wordDoc = ext === "docx";
  const legacyDoc = ext === "doc";
  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/80 p-2 backdrop-blur-sm sm:p-5"
      role="dialog" aria-modal="true" aria-label={`Preview ${file.name}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{file.name}</p>
            <p className="mt-1 text-xs text-slate-400">Student supporting document · {ext.toUpperCase()}</p>
          </div>
          <button onClick={onClose} type="button" aria-label="Close viewer"
            className="shrink-0 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800">Close ✕</button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-900">
          {pdf && <iframe title={file.name} src={file.url} className="h-full w-full border-0 bg-white" />}
          {image && <div className="flex h-full items-center justify-center p-4"><img alt={file.name} src={file.url} className="max-h-full max-w-full object-contain" /></div>}
          {wordDoc && (enableOfficeViewer ? (
            <iframe title={file.name} className="h-full w-full border-0 bg-white"
              src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(file.url)}`} />
          ) : <div className="mx-auto min-h-full max-w-4xl bg-white px-6 py-8 text-slate-900 shadow sm:px-12">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-3 text-xs text-slate-500">
              <span>Word document · Private read-only text preview (formatting and images may differ)</span>
              <button type="button" onClick={() => setEnableOfficeViewer(true)}
                title="Microsoft Office Online receives temporary access to this file"
                className="rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 font-bold text-violet-700">Rich preview via Office Online</button>
            </div>
            {loading && <p className="text-sm">Preparing document preview…</p>}
            {error && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{error}</p>}
            {!loading && !error && paragraphs.map((para, index) => <p key={index} className="mb-3 min-h-3 whitespace-pre-wrap break-words text-sm leading-7">{para}</p>)}
          </div>)}
          {legacyDoc && (enableOfficeViewer ? (
            <iframe title={file.name} className="h-full w-full border-0 bg-white"
              src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(file.url)}`} />
          ) : (
            <div className="flex h-full items-center justify-center p-6"><div className="max-w-xl rounded-2xl border border-slate-700 bg-slate-950 p-6 text-center text-slate-200">
              <h3 className="font-bold">Preview legacy Word document</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">Legacy .doc files need Microsoft Office Online for browser preview. Continuing shares temporary access to this document with Microsoft; PDF, images and DOCX can be previewed without this service.</p>
              <button type="button" onClick={() => setEnableOfficeViewer(true)}
                className="mt-4 inline-flex rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white">Use Office Online Viewer</button>
            </div></div>
          ))}
        </div>
      </div>
    </div>
  );
}
