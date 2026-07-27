import Swal from "sweetalert2";

let styleReady = false;

const ensurePremiumDialogStyle = () => {
  if (styleReady || typeof document === "undefined") return;
  styleReady = true;

  const style = document.createElement("style");
  style.id = "marks-portal-premium-dialog-style";
  style.textContent = `
    .portal-premium-swal {
      width: min(760px, calc(100vw - 28px));
      max-width: calc(100vw - 28px) !important;
      padding: 0 !important;
      overflow: hidden !important;
      border: 1px solid rgb(226 232 240) !important;
      border-radius: 22px !important;
      background: #ffffff !important;
      color: #0f172a !important;
      box-shadow: 0 24px 60px rgba(15, 23, 42, .18) !important;
      font-family: inherit !important;
    }
    html.dark .portal-premium-swal {
      border-color: rgb(51 65 85) !important;
      background: #0f172a !important;
      color: #e2e8f0 !important;
      box-shadow: 0 24px 70px rgba(2, 6, 23, .58) !important;
    }
    .portal-premium-swal .swal2-title {
      margin: 0 !important;
      padding: 24px 26px 5px !important;
      color: #0f172a !important;
      font-size: 1.28rem !important;
      line-height: 1.3 !important;
      font-weight: 800 !important;
      letter-spacing: -.018em !important;
      text-align: left !important;
    }
    html.dark .portal-premium-swal .swal2-title { color: #f8fafc !important; }
    .portal-premium-swal .swal2-html-container {
      margin: 0 !important;
      padding: 12px 26px 6px !important;
      color: #475569 !important;
      font-size: 13px !important;
      line-height: 1.58 !important;
      text-align: left !important;
    }
    html.dark .portal-premium-swal .swal2-html-container { color: #cbd5e1 !important; }
    .portal-premium-swal .swal2-icon {
      margin: 22px auto 0 !important;
      transform: scale(.78);
    }
    .portal-premium-swal .swal2-actions {
      width: 100% !important;
      margin: 18px 0 0 !important;
      padding: 16px 26px 22px !important;
      border-top: 1px solid rgb(226 232 240) !important;
      background: #f8fafc !important;
      justify-content: flex-end !important;
      gap: 9px !important;
    }
    html.dark .portal-premium-swal .swal2-actions {
      border-top-color: rgb(30 41 59) !important;
      background: rgba(2, 6, 23, .35) !important;
    }
    .portal-premium-swal .portal-swal-confirm,
    .portal-premium-swal .portal-swal-cancel,
    .portal-premium-swal .portal-swal-deny {
      min-height: 40px !important;
      border-radius: 11px !important;
      padding: 0 16px !important;
      font: inherit !important;
      font-size: 12.5px !important;
      font-weight: 750 !important;
      cursor: pointer !important;
      transition: background-color .15s ease, border-color .15s ease, color .15s ease !important;
    }
    .portal-premium-swal .portal-swal-confirm {
      border: 1px solid #4f46e5 !important;
      background: #4f46e5 !important;
      color: #fff !important;
      box-shadow: none !important;
    }
    .portal-premium-swal .portal-swal-confirm:hover { background: #4338ca !important; border-color: #4338ca !important; }
    .portal-premium-swal .portal-swal-cancel {
      border: 1px solid rgb(203 213 225) !important;
      background: #ffffff !important;
      color: #334155 !important;
    }
    .portal-premium-swal .portal-swal-cancel:hover { background: #f1f5f9 !important; }
    html.dark .portal-premium-swal .portal-swal-cancel {
      border-color: rgb(71 85 105) !important;
      background: rgb(30 41 59) !important;
      color: #e2e8f0 !important;
    }
    html.dark .portal-premium-swal .portal-swal-cancel:hover { background: rgb(51 65 85) !important; }
    .portal-premium-swal .portal-swal-deny {
      border: 1px solid rgb(186 230 253) !important;
      background: rgb(240 249 255) !important;
      color: #0369a1 !important;
    }
    html.dark .portal-premium-swal .portal-swal-deny {
      border-color: rgba(14,165,233,.30) !important;
      background: rgba(14,165,233,.10) !important;
      color: #7dd3fc !important;
    }
    .portal-premium-swal .swal2-validation-message {
      margin: 12px 26px 0 !important;
      border: 1px solid rgb(254 205 211) !important;
      border-radius: 12px !important;
      background: rgb(255 241 242) !important;
      color: #be123c !important;
      font-size: 12px !important;
      font-weight: 700 !important;
    }
    html.dark .portal-premium-swal .swal2-validation-message {
      border-color: rgba(244,63,94,.26) !important;
      background: rgba(244,63,94,.10) !important;
      color: #fda4af !important;
    }

    .portal-premium-swal select,
    .portal-premium-swal input[type="text"],
    .portal-premium-swal input[type="number"],
    .portal-premium-swal input[type="email"],
    .portal-premium-swal input[type="file"],
    .portal-premium-swal textarea,
    .portal-premium-swal .premium-dialog-field {
      box-sizing: border-box !important;
      min-height: 42px !important;
      border: 1px solid rgb(203 213 225) !important;
      border-radius: 11px !important;
      background: #f8fafc !important;
      color: #0f172a !important;
      padding: 9px 11px !important;
      font-family: inherit !important;
      font-size: 12.5px !important;
      font-weight: 600 !important;
      outline: none !important;
      box-shadow: none !important;
      transition: border-color .15s ease, background-color .15s ease, box-shadow .15s ease !important;
    }
    .portal-premium-swal textarea { min-height: 86px !important; resize: vertical !important; }
    html.dark .portal-premium-swal select,
    html.dark .portal-premium-swal input[type="text"],
    html.dark .portal-premium-swal input[type="number"],
    html.dark .portal-premium-swal input[type="email"],
    html.dark .portal-premium-swal input[type="file"],
    html.dark .portal-premium-swal textarea,
    html.dark .portal-premium-swal .premium-dialog-field {
      border-color: rgb(71 85 105) !important;
      background: rgb(15 23 42) !important;
      color: #f8fafc !important;
    }
    .portal-premium-swal select:focus,
    .portal-premium-swal input:focus,
    .portal-premium-swal textarea:focus,
    .portal-premium-swal .premium-dialog-field:focus {
      border-color: #6366f1 !important;
      background: #ffffff !important;
      box-shadow: 0 0 0 3px rgba(99,102,241,.11) !important;
    }
    html.dark .portal-premium-swal select:focus,
    html.dark .portal-premium-swal input:focus,
    html.dark .portal-premium-swal textarea:focus,
    html.dark .portal-premium-swal .premium-dialog-field:focus {
      border-color: #818cf8 !important;
      background: rgb(15 23 42) !important;
      box-shadow: 0 0 0 3px rgba(129,140,248,.12) !important;
    }
    .portal-premium-swal input::placeholder,
    .portal-premium-swal textarea::placeholder { color: #94a3b8 !important; font-weight: 500 !important; }
    .portal-premium-swal select { color-scheme: light; }
    html.dark .portal-premium-swal select { color-scheme: dark; }
    .portal-premium-swal select option { background: #ffffff; color: #0f172a; }
    html.dark .portal-premium-swal select option { background: #0f172a; color: #f8fafc; }
    .portal-premium-swal input[type="file"] { padding: 5px !important; }
    .portal-premium-swal input[type="file"]::file-selector-button {
      margin-right: 10px;
      border: 0;
      border-right: 1px solid rgb(203 213 225);
      background: #eef2ff;
      color: #4338ca;
      padding: 7px 11px;
      border-radius: 8px;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    html.dark .portal-premium-swal input[type="file"]::file-selector-button {
      border-right-color: rgb(71 85 105);
      background: rgba(99,102,241,.14);
      color: #c7d2fe;
    }
    .portal-premium-swal input[type="checkbox"],
    .portal-premium-swal input[type="radio"] { accent-color: #4f46e5; }

    .portal-premium-swal .premium-dialog-label {
      display: block;
      margin-bottom: 5px;
      color: #64748b !important;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    html.dark .portal-premium-swal .premium-dialog-label { color: #94a3b8 !important; }
    .portal-premium-swal .premium-dialog-card {
      border: 1px solid rgb(226 232 240);
      border-radius: 15px;
      background: #ffffff;
      box-shadow: none;
    }
    html.dark .portal-premium-swal .premium-dialog-card {
      border-color: rgb(51 65 85);
      background: rgba(15,23,42,.78);
    }
    .portal-premium-swal .premium-dialog-soft-indigo {
      border: 1px solid rgb(224 231 255);
      border-radius: 15px;
      background: rgb(248 250 252);
    }
    html.dark .portal-premium-swal .premium-dialog-soft-indigo {
      border-color: rgba(99,102,241,.25);
      background: rgba(99,102,241,.07);
    }
    .portal-premium-swal .premium-dialog-soft-sky {
      border: 1px solid rgb(224 242 254);
      border-radius: 15px;
      background: rgb(248 250 252);
    }
    html.dark .portal-premium-swal .premium-dialog-soft-sky {
      border-color: rgba(14,165,233,.23);
      background: rgba(14,165,233,.07);
    }
    .portal-premium-swal .premium-dialog-warning {
      border: 1px solid rgb(253 230 138);
      border-radius: 13px;
      background: rgb(255 251 235);
      color: #92400e !important;
    }
    html.dark .portal-premium-swal .premium-dialog-warning {
      border-color: rgba(245,158,11,.25);
      background: rgba(245,158,11,.08);
      color: #fde68a !important;
    }
    .portal-premium-swal .premium-dialog-muted { color: #64748b !important; }
    html.dark .portal-premium-swal .premium-dialog-muted { color: #94a3b8 !important; }
    .portal-premium-swal .premium-dialog-strong { color: #0f172a !important; }
    html.dark .portal-premium-swal .premium-dialog-strong { color: #f8fafc !important; }
    .portal-premium-swal .premium-dialog-accent { color: #4f46e5 !important; }
    html.dark .portal-premium-swal .premium-dialog-accent { color: #a5b4fc !important; }
    .portal-premium-swal .premium-dialog-sky { color: #0369a1 !important; }
    html.dark .portal-premium-swal .premium-dialog-sky { color: #7dd3fc !important; }
    .portal-premium-swal .premium-dialog-success { color: #047857 !important; }
    html.dark .portal-premium-swal .premium-dialog-success { color: #6ee7b7 !important; }
    .portal-premium-swal .premium-dialog-danger { color: #be123c !important; }
    html.dark .portal-premium-swal .premium-dialog-danger { color: #fda4af !important; }
    .portal-premium-swal .premium-dialog-badge {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      border: 1px solid rgb(226 232 240);
      border-radius: 999px;
      background: #f8fafc;
      color: #475569;
      padding: 3px 8px;
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    html.dark .portal-premium-swal .premium-dialog-badge {
      border-color: rgb(51 65 85);
      background: rgb(30 41 59);
      color: #cbd5e1;
    }
  `;
  document.head.appendChild(style);
};

export const premiumSwal = (options = {}) => {
  ensurePremiumDialogStyle();
  const customClass = options.customClass || {};
  const userDidOpen = options.didOpen;

  return Swal.fire({
    buttonsStyling: false,
    ...options,
    customClass: {
      popup: `portal-premium-swal ${customClass.popup || ""}`.trim(),
      title: customClass.title || "portal-swal-title",
      htmlContainer: customClass.htmlContainer || "portal-swal-html",
      confirmButton: `portal-swal-confirm ${customClass.confirmButton || ""}`.trim(),
      cancelButton: `portal-swal-cancel ${customClass.cancelButton || ""}`.trim(),
      denyButton: `portal-swal-deny ${customClass.denyButton || ""}`.trim(),
      validationMessage: customClass.validationMessage || "portal-swal-validation",
    },
    didOpen: (popup) => {
      userDidOpen?.(popup);
    },
  });
};

export default premiumSwal;
