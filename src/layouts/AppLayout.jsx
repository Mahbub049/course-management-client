import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();

  const [role, setRole] = useState(null);
  const [userName, setUserName] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("marksPortalSidebarCollapsed") === "true";
  });

  const [profileImage, setProfileImage] = useState("");

  useEffect(() => {
    const r = localStorage.getItem("marksPortalRole");
    const n = localStorage.getItem("marksPortalName") || "";
    setRole(r);
    setUserName(n);

    const img = localStorage.getItem("marksPortalProfileImage") || "";
    setProfileImage(img);

    if (!r) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const syncProfileData = () => {
      const n = localStorage.getItem("marksPortalName") || "";
      const img = localStorage.getItem("marksPortalProfileImage") || "";

      setUserName(n);
      setProfileImage(img);
    };

    window.addEventListener("marksPortalProfileUpdated", syncProfileData);

    return () => {
      window.removeEventListener("marksPortalProfileUpdated", syncProfileData);
    };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    if (mobileOpen) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    localStorage.setItem("marksPortalSidebarCollapsed", String(collapsed));
  }, [collapsed]);

  const handleLogout = () => {
    localStorage.removeItem("marksPortalToken");
    localStorage.removeItem("marksPortalRole");
    localStorage.removeItem("marksPortalName");
    localStorage.removeItem("marksPortalProfileImage");
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

  const SidebarContent = ({ isMobile = false, collapsed = false }) => (
    <div className="flex h-full flex-col">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-violet-100 via-fuchsia-50 to-sky-100 dark:from-violet-500/10 dark:via-fuchsia-500/5 dark:to-sky-500/10" />

      <div
        className={[
          "relative border-b border-slate-200/80 px-4 pb-4 pt-5 dark:border-slate-800",
          collapsed && !isMobile ? "px-3" : "sm:px-5",
        ].join(" ")}
      >
        <div
          className={[
            "flex gap-3",
            collapsed && !isMobile
              ? "flex-col items-center"
              : "items-center",
          ].join(" ")}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm dark:bg-violet-600">
            <CapIcon />
          </div>
          {!(collapsed && !isMobile) && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                Course Management
              </div>
              <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                BUBT Marks Portal
              </div>
            </div>
          )}

          {isMobile && (
            <button
              onClick={() => setMobileOpen(false)}
              className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              aria-label="Close menu"
              type="button"
            >
              <XIcon />
            </button>
          )}

          {!isMobile && (
            <button
              onClick={() => setCollapsed((v) => !v)}
              className={[
                "hidden h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 md:inline-flex",
                collapsed && !isMobile ? "ml-0" : "ml-auto",
              ].join(" ")}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              type="button"
            >
              <span className="text-lg leading-none">{collapsed ? "»" : "«"}</span>
            </button>
          )}
        </div>
      </div>

      <nav className="relative flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              [
                "group relative flex rounded-2xl text-sm font-semibold transition-all duration-200",
                collapsed && !isMobile
                  ? "justify-center px-2 py-2.5"
                  : "items-center gap-3 px-3 py-3",
                isActive
                  ? "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={[
                    "absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full transition",
                    isActive ? "bg-violet-600" : "bg-transparent",
                  ].join(" ")}
                />

                <span
                  className={[
                    "flex h-10 w-10 items-center justify-center rounded-xl border transition",
                    isActive
                      ? "border-violet-200 bg-white text-violet-700 dark:border-violet-500/20 dark:bg-slate-800 dark:text-violet-300"
                      : "border-slate-200 bg-slate-50 text-slate-700 group-hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-slate-700",
                  ].join(" ")}
                >
                  {link.icon}
                </span>

                {!(collapsed && !isMobile) && (
                  <span className="flex-1 truncate">{link.label}</span>
                )}

                {!(collapsed && !isMobile) && (
                  <span
                    className={[
                      "text-slate-400 transition dark:text-slate-500",
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

      <div className="relative border-t border-slate-200/80 p-4 dark:border-slate-800">
        <div
          className={[
            "rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/90",
            collapsed && !isMobile
              ? "flex flex-col items-center rounded-2xl p-2"
              : "",
          ].join(" ")}
        >
          <div
            className={[
              "flex items-center gap-3",
              collapsed && !isMobile ? "justify-center" : "",
            ].join(" ")}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              {profileImage ? (
                <img
                  src={profileImage}
                  alt="User"
                  className="h-full w-full shrink-0 object-cover"
                />
              ) : (
                <UserCircleIcon />
              )}
            </div>

            {!(collapsed && !isMobile) && (
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {userName || "User"}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {role === "teacher" ? "Teacher Account" : "Student Account"}
                </div>
              </div>
            )}
          </div>

          {!(collapsed && !isMobile) && (
            <button
              onClick={handleLogout}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              type="button"
            >
              <LogoutIcon />
              <span>Logout</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 transition-colors duration-300 dark:bg-[#020617] dark:text-slate-100">
      <div className="flex min-h-screen">
        <aside
          className={[
            "relative hidden border-r border-slate-200/80 bg-white/90 backdrop-blur-sm transition-all duration-300 dark:border-slate-800 dark:bg-slate-950/80 md:flex md:flex-col",
            collapsed ? "md:w-20" : "md:w-72",
          ].join(" ")}
        >
          <SidebarContent collapsed={collapsed} />
        </aside>

        <div
          className={[
            "fixed inset-0 z-50 md:hidden transition",
            mobileOpen ? "pointer-events-auto" : "pointer-events-none",
          ].join(" ")}
          aria-hidden={!mobileOpen}
        >
          <button
            className={[
              "absolute inset-0 bg-slate-900/50 transition-opacity duration-300",
              mobileOpen ? "opacity-100" : "opacity-0",
            ].join(" ")}
            onClick={() => setMobileOpen(false)}
            aria-label="Close overlay"
            type="button"
          />

          <div
            className={[
              "absolute left-0 top-0 h-full w-[86%] max-w-xs border-r border-slate-200 bg-white shadow-xl transition-transform duration-300 ease-out dark:border-slate-800 dark:bg-slate-950",
              mobileOpen ? "translate-x-0" : "-translate-x-full",
            ].join(" ")}
          >
            <SidebarContent isMobile />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/75 sm:px-6 md:px-8">
            <div className="flex h-16 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 md:hidden"
                  aria-label="Open menu"
                >
                  <MenuIcon />
                </button>

                <div className="flex min-w-0 items-center gap-2 md:hidden">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm dark:bg-violet-600">
                    <CapIcon />
                  </div>
                  <div className="min-w-0 leading-tight">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      BUBT Marks Portal
                    </div>
                    <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {pageTitle}
                    </div>
                  </div>
                </div>

                <div className="hidden min-w-0 md:block">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Current page
                  </div>
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {pageTitle}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                {userName && (
                  <span className="hidden text-sm text-slate-600 dark:text-slate-300 lg:inline">
                    Signed in as{" "}
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {userName}
                    </span>
                  </span>
                )}

                {role && (
                  <span className="hidden items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:inline-flex">
                    {role === "teacher" ? "Teacher" : "Student"}
                  </span>
                )}

                <button
                  onClick={toggleTheme}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  type="button"
                  title="Toggle theme"
                >
                  {isDark ? <MoonIcon /> : <SunIcon />}
                  <span className="hidden sm:inline">
                    {isDark ? "Dark" : "Light"}
                  </span>
                </button>

                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  type="button"
                >
                  <LogoutIcon />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 min-w-0 px-4 py-5 sm:px-6 sm:py-6 md:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

export default AppLayout;

/* ---------------- Icons ---------------- */

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
      className="h-6 w-6 text-slate-700 dark:text-slate-200"
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
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z" />
    </svg>
  );
}