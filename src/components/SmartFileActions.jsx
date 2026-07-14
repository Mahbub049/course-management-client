import { useEffect, useMemo, useState } from "react";

const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;

const OFFICE_PREVIEW_EXTENSIONS = new Set([
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
]);

const TEXT_PREVIEW_EXTENSIONS = new Set([
  "txt",
  "csv",
  "json",
  "md",
  "xml",
  "c",
  "cpp",
  "h",
  "hpp",
  "java",
  "sql",
  "py",
  "js",
  "jsx",
  "ts",
  "tsx",
  "html",
  "css",
  "php",
  "sh",
  "bash",
  "yml",
  "yaml",
]);

const IMAGE_PREVIEW_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
]);

function getFileExtension(fileName = "") {
  const value = String(fileName || "");
  const dotIndex = value.lastIndexOf(".");
  return dotIndex >= 0 ? value.slice(dotIndex + 1).toLowerCase() : "";
}

function normalizeFile(file = {}) {
  return {
    url: String(file.downloadUrl || file.fileUrl || file.url || ""),
    name: String(
      file.originalFileName || file.fileName || file.name || "Uploaded file"
    ),
    size: Number(file.fileSize || file.size || 0),
    mimeType: String(file.mimeType || file.type || "").toLowerCase(),
  };
}

function getPreviewType(file = {}) {
  const normalized = normalizeFile(file);
  const extension = getFileExtension(normalized.name);

  if (extension === "pdf" || normalized.mimeType === "application/pdf") {
    return "pdf";
  }

  if (OFFICE_PREVIEW_EXTENSIONS.has(extension)) return "office";

  if (
    IMAGE_PREVIEW_EXTENSIONS.has(extension) ||
    normalized.mimeType.startsWith("image/")
  ) {
    return "image";
  }

  if (
    TEXT_PREVIEW_EXTENSIONS.has(extension) ||
    normalized.mimeType.startsWith("text/")
  ) {
    return "text";
  }

  return "unsupported";
}

function buildOfficeViewerUrl(fileUrl = "") {
  if (!fileUrl) return "";
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
    fileUrl
  )}`;
}

function formatFileSize(size = 0) {
  const bytes = Number(size || 0);
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function SmartFileActions({
  file,
  className = "",
  compact = false,
  fullWidth = false,
}) {
  const normalizedFile = useMemo(() => normalizeFile(file), [file]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const previewType = useMemo(() => getPreviewType(file), [file]);

  useEffect(() => {
    if (!previewOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewOpen]);

  const openPreview = async () => {
    if (!normalizedFile.url) return;

    setPreviewOpen(true);
    setPreviewText("");
    setPreviewError("");
    setPreviewLoading(previewType === "text");

    if (previewType !== "text") return;

    if (normalizedFile.size > MAX_TEXT_PREVIEW_BYTES) {
      setPreviewLoading(false);
      setPreviewError(
        "Text and code preview is limited to 2 MB. Download the file to view the complete content."
      );
      return;
    }

    try {
      const response = await fetch(normalizedFile.url);
      if (!response.ok) {
        throw new Error(`Preview request failed (${response.status}).`);
      }

      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > MAX_TEXT_PREVIEW_BYTES) {
        setPreviewError(
          "Text and code preview is limited to 2 MB. Download the file to view the complete content."
        );
        return;
      }

      setPreviewText(await response.text());
    } catch (error) {
      console.error(error);
      setPreviewError(
        "The browser could not load this preview. You can still open or download the file."
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  if (!normalizedFile.url) return null;

  const buttonSize = compact
    ? "min-h-9 px-3 py-2 text-xs"
    : "min-h-10 px-4 py-2.5 text-sm";

  return (
    <>
      <div
        className={`flex flex-wrap gap-2 ${fullWidth ? "w-full" : ""} ${className}`}
      >
        <button
          type="button"
          onClick={openPreview}
          className={`inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 font-semibold text-white shadow-sm transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-400/60 ${buttonSize} ${
            fullWidth ? "flex-1" : ""
          }`}
          title={`Preview ${normalizedFile.name}`}
        >
          <EyeIcon />
          Preview File
        </button>

        <a
          href={normalizedFile.url}
          download
          className={`inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 ${buttonSize} ${
            fullWidth ? "flex-1" : ""
          }`}
          title={`Download ${normalizedFile.name}`}
        >
          <DownloadIcon />
          Download
        </a>
      </div>

      {previewOpen ? (
        <FilePreviewModal
          file={normalizedFile}
          previewType={previewType}
          text={previewText}
          loading={previewLoading}
          error={previewError}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </>
  );
}

function FilePreviewModal({ file, previewType, text, loading, error, onClose }) {
  const officeViewerUrl =
    previewType === "office" ? buildOfficeViewerUrl(file.url) : "";
  const extension = getFileExtension(file.name).toUpperCase() || "FILE";
  const formattedSize = formatFileSize(file.size);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-2 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${file.name}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl sm:rounded-3xl">
        <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white sm:text-base" title={file.name}>
              {file.name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>{extension}</span>
              {formattedSize ? (
                <>
                  <span>•</span>
                  <span>{formattedSize}</span>
                </>
              ) : null}
              {previewType === "office" ? (
                <>
                  <span>•</span>
                  <span>Microsoft Office Online</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-800"
            >
              <ExternalLinkIcon /> Open in New Tab
            </a>
            <a
              href={file.url}
              download
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-800"
            >
              <DownloadIcon /> Download
            </a>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/20"
              aria-label="Close preview"
              title="Close preview"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-slate-900">
          {previewType === "pdf" ? (
            <iframe
              title={file.name}
              src={file.url}
              className="h-full w-full border-0 bg-white"
            />
          ) : null}

          {previewType === "office" ? (
            <iframe
              title={file.name}
              src={officeViewerUrl}
              className="h-full w-full border-0 bg-white"
              allowFullScreen
            />
          ) : null}

          {previewType === "image" ? (
            <div className="flex h-full items-center justify-center overflow-auto p-4 sm:p-8">
              <img
                src={file.url}
                alt={file.name}
                className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
              />
            </div>
          ) : null}

          {previewType === "text" ? (
            <div className="h-full overflow-auto p-4 sm:p-6">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-300">
                  <span className="inline-flex items-center gap-2">
                    <SpinnerIcon /> Loading preview…
                  </span>
                </div>
              ) : error ? (
                <PreviewUnavailable message={error} />
              ) : (
                <pre className="min-h-full whitespace-pre-wrap break-words rounded-2xl border border-slate-700 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100 sm:p-5 sm:text-sm">
                  {text || "This file is empty."}
                </pre>
              )}
            </div>
          ) : null}

          {previewType === "unsupported" ? (
            <PreviewUnavailable message="This file type cannot be previewed safely inside the portal. Open it in a compatible application or download it." />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PreviewUnavailable({ message }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-lg rounded-2xl border border-slate-700 bg-slate-950 p-6 text-center shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-slate-300">
          <FileIcon />
        </div>
        <div className="mt-4 text-base font-bold text-white">Preview unavailable</div>
        <p className="mt-2 text-sm leading-6 text-slate-400">{message}</p>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3h7v7" />
      <path d="M10 14 21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
