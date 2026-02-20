// client/src/layouts/AppLayout.jsx

import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();

  const [role, setRole] = useState(null);
  const [userName, setUserName] = useState("");

  // ✅ NEW: mobile drawer state
  const [mobileOpen, setMobileOpen] = useState(false);
  // ✅ NEW: desktop/tablet sidebar collapse state
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("marksPortalSidebarCollapsed") === "true";
  });

  useEffect(() => {
    const r = localStorage.getItem("marksPortalRole");
    const n = localStorage.getItem("marksPortalName") || "";
    setRole(r);
    setUserName(n);

    if (!r) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  // ✅ Close drawer on route change (nice UX)
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // ✅ ESC to close drawer
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    if (mobileOpen) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  // ✅ Persist desktop collapse state
  useEffect(() => {
    localStorage.setItem("marksPortalSidebarCollapsed", String(collapsed));
  }, [collapsed]);


  const handleLogout = () => {
    localStorage.removeItem("marksPortalToken");
    localStorage.removeItem("marksPortalRole");
    localStorage.removeItem("marksPortalName");
    navigate("/login", { replace: true });
  };

  const teacherLinks = [
    { to: "/teacher/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
    { to: "/teacher/courses", label: "Courses", icon: <BookIcon /> },
    { to: "/teacher/create-course", label: "Create Course", icon: <PlusIcon /> },

    { to: "/teacher/attendance", label: "Attendance", icon: <CalendarIcon /> },
    {
      to: "/teacher/attendance-sheet",
      label: "Attendance Sheet",
      icon: <TableIcon />,
    },
    { to: "/teacher/complaints", label: "Complaints", icon: <AlertIcon /> },

    { to: "/change-password", label: "Account", icon: <UserIcon /> },
  ];

  const studentLinks = [
    { to: "/student/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
    { to: "/student/courses", label: "My Courses", icon: <BookIcon /> },
    { to: "/student/complaints", label: "Complaints", icon: <AlertIcon /> },
    { to: "/student/attendance", label: "Attendance", icon: <CalendarIcon /> },
    { to: "/change-password", label: "Account", icon: <UserIcon /> },
  ];

  const links = useMemo(() => {
    if (!role) return [];
    return role === "teacher" ? teacherLinks : studentLinks;
  }, [role]);

  const pageTitle = useMemo(() => {
    const found = links.find((l) => location.pathname.startsWith(l.to));
    return found?.label || "BUBT Marks Portal";
  }, [location.pathname, links]);

  // ✅ Extracted sidebar so we can reuse for desktop + mobile drawer
  const SidebarContent = ({ isMobile = false, collapsed = false }) => (
    <div className="flex h-full flex-col">
      {/* Decorative gradient */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-primary-50 via-purple-50 to-sky-50" />

      {/* Brand */}
      <div
        className={[
          "relative pt-6 pb-4 border-b border-slate-200 dark:border-slate-800",
          collapsed && !isMobile ? "px-3" : "px-6",
        ].join(" ")}
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
            <CapIcon />
          </div>
          {!(collapsed && !isMobile) && (
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 leading-tight truncate">
                Course Management
              </div>
              <div className="text-xs text-slate-500 truncate">BUBT Marks Portal</div>
            </div>
          )}


          {/* ✅ Close button only in mobile drawer */}
          {isMobile && (
            <button
              onClick={() => setMobileOpen(false)}
              className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              aria-label="Close menu"
              type="button"
            >
              <XIcon />
            </button>
          )}

          {/* ✅ Collapse button only on desktop/tablet */}
          {!isMobile && (
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              type="button"
            >
              <span className="text-lg leading-none">{collapsed ? "»" : "«"}</span>
            </button>
          )}

        </div>
      </div>

      {/* Nav */}
      <nav className="relative flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              [
                [
                  "group relative flex items-center rounded-xl text-sm font-semibold transition",
                  collapsed && !isMobile ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
                ].join(" "), isActive
                  ? "bg-primary-50 text-primary-700"
                  : "text-slate-700 hover:bg-slate-100",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                {/* Left indicator */}
                <span
                  className={[
                    "absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full transition",
                    isActive ? "bg-primary-600" : "bg-transparent",
                  ].join(" ")}
                />
                <span
                  className={[
                    "h-9 w-9 rounded-lg border flex items-center justify-center transition",
                    isActive
                      ? "border-primary-200 bg-white text-primary-700"
                      : "border-slate-200 bg-slate-50 text-slate-700 group-hover:bg-white",
                  ].join(" ")}
                >
                  {link.icon}
                </span>

                {!(collapsed && !isMobile) && <span className="flex-1">{link.label}</span>}


                {!(collapsed && !isMobile) && (
                  <span
                    className={[
                      "text-slate-400 transition",
                      isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    ].join(" ")}
                  >
                    <ArrowIcon />
                  </span>
                )}

              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Profile / Footer */}
      <div className="relative p-4 border-t border-slate-200 dark:border-slate-800">
        <div
          className={[
            "rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm transition-all",
            collapsed && !isMobile ? "p-2" : "p-4",
          ].join(" ")}
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200">
              <UserCircleIcon />
            </div>
            {!(collapsed && !isMobile) && (
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {userName || "User"}
                </div>
                <div className="text-xs text-slate-500">
                  {role === "teacher" ? "Teacher Account" : "Student Account"}
                </div>
              </div>
            )}

          </div>

          <button
            onClick={handleLogout}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            type="button"
          >
            <LogoutIcon />
            Logout
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen">
        {/* ✅ Desktop Sidebar */}
        <aside
          className={[
            "hidden md:flex flex-col border-r border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 relative transition-all duration-300",
            collapsed ? "md:w-20" : "md:w-72",
          ].join(" ")}
        >
          <SidebarContent collapsed={collapsed} />
        </aside>


        {/* ✅ Mobile Drawer */}
        {/* ✅ Mobile Drawer (smooth) */}
        <div
          className={[
            "fixed inset-0 z-50 md:hidden transition",
            mobileOpen ? "pointer-events-auto" : "pointer-events-none",
          ].join(" ")}
          aria-hidden={!mobileOpen}
        >
          {/* overlay */}
          <button
            className={[
              "absolute inset-0 bg-slate-900/40 transition-opacity duration-300",
              mobileOpen ? "opacity-100" : "opacity-0",
            ].join(" ")}
            onClick={() => setMobileOpen(false)}
            aria-label="Close overlay"
            type="button"
          />

          {/* panel */}
          <div
            className={[
              "absolute left-0 top-0 h-full w-[85%] max-w-xs bg-white dark:bg-slate-900 shadow-xl border-r border-slate-200 dark:border-slate-800 relative",
              "transition-transform duration-300 ease-out",
              mobileOpen ? "translate-x-0" : "-translate-x-full",
            ].join(" ")}
          >
            <SidebarContent isMobile />
          </div>
        </div>


        {/* Main area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="h-16 flex items-center justify-between px-4 sm:px-6 md:px-8 border-b border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center gap-3 min-w-0">
              {/* ✅ Mobile menu button */}
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                aria-label="Open menu"
              >
                <MenuIcon />
              </button>

              {/* Mobile brand */}
              <div className="md:hidden flex items-center gap-2 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                  <CapIcon />
                </div>
                <div className="leading-tight min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    BUBT Marks Portal
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {pageTitle}
                  </div>
                </div>
              </div>

              {/* Desktop title */}
              <div className="hidden md:block min-w-0">
                <div className="text-xs text-slate-500">Current page</div>
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {pageTitle}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {userName && (
                <span className="hidden sm:inline text-sm text-slate-600">
                  Signed in as{" "}
                  <span className="font-semibold text-slate-900">{userName}</span>
                </span>
              )}

              {role && (
                <span className="hidden xs:inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
                  {role === "teacher" ? "Teacher" : "Student"}
                </span>
              )}

<button
  onClick={toggleTheme}
  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50
             dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
  type="button"
  title="Toggle theme"
>
  {isDark ? <MoonIcon /> : <SunIcon />}
  <span className="hidden sm:inline">{isDark ? "Dark" : "Light"}</span>
</button>

              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                type="button"
              >
                <LogoutIcon />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 px-4 sm:px-6 md:px-8 py-5 sm:py-6 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

export default AppLayout;

/* ---------------- Icons (inline SVG) ---------------- */

function ArrowIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function CapIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M22 10L12 4 2 10l10 6 10-6z" />
      <path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 13h6V4H4v9zM14 20h6v-7h-6v7zM14 11h6V4h-6v7zM4 20h6v-5H4v5z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 19a2 2 0 0 0 2 2h14V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z" />
      <path d="M4 7h16" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.5h3.4L22 20H2z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M8 2v3M16 2v3" />
      <path d="M3 9h18" />
      <path d="M5 5h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      <path d="M8 13h4M8 17h6" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 5h18v14H3z" />
      <path d="M3 10h18" />
      <path d="M8 5v14" />
      <path d="M14 5v14" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <path d="M12 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
    </svg>
  );
}

function UserCircleIcon() {
  return (
    <svg
      className="h-5 w-5 text-slate-700"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <path d="M12 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
      <path d="M12 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h7" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z" />
    </svg>
  );
}