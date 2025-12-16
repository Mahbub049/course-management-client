// client/src/layouts/AppLayout.jsx

import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [role, setRole] = useState(null);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const r = localStorage.getItem("marksPortalRole");
    const n = localStorage.getItem("marksPortalName") || "";
    setRole(r);
    setUserName(n);

    if (!r) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

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
    { to: "/teacher/complaints", label: "Complaints", icon: <AlertIcon /> },
    { to: "/change-password", label: "Account", icon: <UserIcon /> },
  ];

  const studentLinks = [
    { to: "/student/dashboard", label: "My Courses", icon: <BookIcon /> },
    { to: "/student/complaints", label: "Complaints", icon: <AlertIcon /> },
    { to: "/change-password", label: "Account", icon: <UserIcon /> },
  ];

  const links = role === "teacher" ? teacherLinks : studentLinks;

  // Optional: topbar page title (simple)
  const pageTitle = useMemo(() => {
    const found = links.find((l) => location.pathname.startsWith(l.to));
    return found?.label || "BUBT Marks Portal";
  }, [location.pathname, links]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden md:flex md:w-72 flex-col border-r border-slate-200 bg-white relative">
          {/* Decorative gradient */}
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-primary-50 via-purple-50 to-sky-50" />

          {/* Brand */}
          <div className="relative px-6 pt-6 pb-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
                <CapIcon />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900 leading-tight">
                  Course Management
                </div>
                <div className="text-xs text-slate-500">
                  BUBT Marks Portal
                </div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  [
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                    isActive
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

                    <span className="flex-1">{link.label}</span>

                    {/* subtle arrow */}
                    <span
                      className={[
                        "text-slate-400 transition",
                        isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                      ].join(" ")}
                    >
                      <ArrowIcon />
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Profile / Footer */}
          <div className="p-4 border-t border-slate-200">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200">
                  <UserCircleIcon />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {userName || "User"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {role === "teacher" ? "Teacher Account" : "Student Account"}
                  </div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <LogoutIcon />
                Logout
              </button>
            </div>
          </div>
        </aside>

        {/* Main area */}
        <div className="flex-1 flex flex-col">
          {/* Top bar */}
          <header className="h-16 flex items-center justify-between px-4 md:px-8 border-b border-slate-200 bg-white">
            <div className="flex items-center gap-3">
              {/* Mobile brand */}
              <div className="md:hidden flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <CapIcon />
                </div>
                <div className="leading-tight">
                  <div className="text-sm font-semibold text-slate-900">
                    BUBT Marks Portal
                  </div>
                  <div className="text-[11px] text-slate-500">{pageTitle}</div>
                </div>
              </div>

              {/* Desktop title */}
              <div className="hidden md:block">
                <div className="text-xs text-slate-500">Current page</div>
                <div className="text-sm font-semibold text-slate-900">
                  {pageTitle}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {userName && (
                <span className="hidden sm:inline text-sm text-slate-600">
                  Signed in as{" "}
                  <span className="font-semibold text-slate-900">{userName}</span>
                </span>
              )}

              {role && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
                  {role === "teacher" ? "Teacher" : "Student"}
                </span>
              )}

              {/* Topbar logout (still keep) */}
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <LogoutIcon />
                Logout
              </button>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 px-4 md:px-8 py-6">
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
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function CapIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 10L12 4 2 10l10 6 10-6z" />
      <path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 13h6V4H4v9zM14 20h6v-7h-6v7zM14 11h6V4h-6v7zM4 20h6v-5H4v5z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19a2 2 0 0 0 2 2h14V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z" />
      <path d="M4 7h16" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.5h3.4L22 20H2z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <path d="M12 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
    </svg>
  );
}

function UserCircleIcon() {
  return (
    <svg className="h-5 w-5 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <path d="M12 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
      <path d="M12 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h7" />
    </svg>
  );
}
