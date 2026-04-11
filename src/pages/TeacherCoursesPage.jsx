import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchTeacherCourses,
  deleteCourseRequest,
  archiveCourseRequest,
  unarchiveCourseRequest,
} from "../services/courseService";
import Swal from "sweetalert2";

export default function TeacherCoursesPage() {
  const navigate = useNavigate();

  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [courseError, setCourseError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [viewMode, setViewMode] = useState("active"); // "active" | "archived"
  const [archivingId, setArchivingId] = useState(null);
  const [unarchivingId, setUnarchivingId] = useState(null);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all"); // all | theory | lab | hybrid

  useEffect(() => {
    const loadCourses = async () => {
      setLoadingCourses(true);
      setCourseError("");
      try {
        const data = await fetchTeacherCourses({
          archived: viewMode === "archived",
        });
        setCourses(data || []);
      } catch (err) {
        console.error(err);
        setCourseError(err?.response?.data?.message || "Server error");
      } finally {
        setLoadingCourses(false);
      }
    };

    loadCourses();
  }, [viewMode]);

  const openCourse = (course) => {
    if (!course?.id) return;
    navigate(`/teacher/courses/${course.id}`);
  };

  const handleDelete = async (course) => {
    if (!course?.id) return;

    const result = await Swal.fire({
      title: "Delete course?",
      html: `
        <p><strong>${course.code} – ${course.title}</strong></p>
        <p class="text-sm mt-2">
          This will permanently delete:
          <br/>• Students
          <br/>• Assessments
          <br/>• Marks
          <br/>• Complaints
        </p>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      reverseButtons: true,
      background: document.documentElement.classList.contains("dark")
        ? "#0f172a"
        : "#ffffff",
      color: document.documentElement.classList.contains("dark")
        ? "#e2e8f0"
        : "#0f172a",
    });

    if (!result.isConfirmed) return;

    try {
      setDeletingId(course.id);
      await deleteCourseRequest(course.id);
      setCourses((prev) => prev.filter((c) => c.id !== course.id));

      await Swal.fire({
        title: "Deleted!",
        text: "The course and all related data have been removed.",
        icon: "success",
        timer: 1800,
        showConfirmButton: false,
        background: document.documentElement.classList.contains("dark")
          ? "#0f172a"
          : "#ffffff",
        color: document.documentElement.classList.contains("dark")
          ? "#e2e8f0"
          : "#0f172a",
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        title: "Error",
        text:
          err?.response?.data?.message ||
          "Failed to delete course. Please try again.",
        icon: "error",
        background: document.documentElement.classList.contains("dark")
          ? "#0f172a"
          : "#ffffff",
        color: document.documentElement.classList.contains("dark")
          ? "#e2e8f0"
          : "#0f172a",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleArchive = async (course) => {
    const result = await Swal.fire({
      title: "Archive course?",
      text: `${course.code} - ${course.title} will be moved to Archived Courses.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, archive",
      cancelButtonText: "Cancel",
      reverseButtons: true,
      background: document.documentElement.classList.contains("dark")
        ? "#0f172a"
        : "#ffffff",
      color: document.documentElement.classList.contains("dark")
        ? "#e2e8f0"
        : "#0f172a",
    });

    if (!result.isConfirmed) return;

    try {
      setArchivingId(course.id);
      await archiveCourseRequest(course.id);
      setCourses((prev) => prev.filter((c) => c.id !== course.id));
      Swal.fire({
        title: "Archived!",
        text: "Course moved to Archived Courses.",
        icon: "success",
        background: document.documentElement.classList.contains("dark")
          ? "#0f172a"
          : "#ffffff",
        color: document.documentElement.classList.contains("dark")
          ? "#e2e8f0"
          : "#0f172a",
      });
    } catch (err) {
      Swal.fire({
        title: "Error",
        text: err?.response?.data?.message || "Failed to archive course",
        icon: "error",
        background: document.documentElement.classList.contains("dark")
          ? "#0f172a"
          : "#ffffff",
        color: document.documentElement.classList.contains("dark")
          ? "#e2e8f0"
          : "#0f172a",
      });
    } finally {
      setArchivingId(null);
    }
  };

  const handleUnarchive = async (course) => {
    const result = await Swal.fire({
      title: "Unarchive course?",
      text: `${course.code} - ${course.title} will return to My Courses.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, unarchive",
      cancelButtonText: "Cancel",
      reverseButtons: true,
      background: document.documentElement.classList.contains("dark")
        ? "#0f172a"
        : "#ffffff",
      color: document.documentElement.classList.contains("dark")
        ? "#e2e8f0"
        : "#0f172a",
    });

    if (!result.isConfirmed) return;

    try {
      setUnarchivingId(course.id);
      await unarchiveCourseRequest(course.id);
      setCourses((prev) => prev.filter((c) => c.id !== course.id));
      Swal.fire({
        title: "Restored!",
        text: "Course moved back to My Courses.",
        icon: "success",
        background: document.documentElement.classList.contains("dark")
          ? "#0f172a"
          : "#ffffff",
        color: document.documentElement.classList.contains("dark")
          ? "#e2e8f0"
          : "#0f172a",
      });
    } catch (err) {
      Swal.fire({
        title: "Error",
        text: err?.response?.data?.message || "Failed to unarchive course",
        icon: "error",
        background: document.documentElement.classList.contains("dark")
          ? "#0f172a"
          : "#ffffff",
        color: document.documentElement.classList.contains("dark")
          ? "#e2e8f0"
          : "#0f172a",
      });
    } finally {
      setUnarchivingId(null);
    }
  };

  const counts = useMemo(() => {
    const c = { all: courses.length, theory: 0, lab: 0, hybrid: 0 };
    courses.forEach((x) => {
      const t = (x.courseType || "theory").toLowerCase();
      if (t === "lab") c.lab += 1;
      else if (t === "hybrid") c.hybrid += 1;
      else c.theory += 1;
    });
    return c;
  }, [courses]);

  const filteredCourses = useMemo(() => {
    const q = query.trim().toLowerCase();

    return courses.filter((c) => {
      const t = (c.courseType || "theory").toLowerCase();
      const matchesType = typeFilter === "all" ? true : t === typeFilter;

      const matchesQuery =
        !q ||
        (c.code || "").toLowerCase().includes(q) ||
        (c.title || "").toLowerCase().includes(q) ||
        (c.section || "").toLowerCase().includes(q) ||
        (c.semester || "").toLowerCase().includes(q) ||
        String(c.year || "").toLowerCase().includes(q);

      return matchesType && matchesQuery;
    });
  }, [courses, query, typeFilter]);

  return (
    <div className="space-y-5 md:space-y-6 text-slate-900 dark:text-slate-100">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-indigo-50 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-20 top-10 h-44 w-44 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-500/10" />
          <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-violet-200/40 blur-3xl dark:bg-violet-500/10" />
          <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-cyan-200/30 blur-3xl dark:bg-cyan-500/10" />
        </div>

        <div className="relative p-4 sm:p-5 md:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-primary-700 shadow-sm backdrop-blur dark:border-primary-900/50 dark:bg-slate-900/80 dark:text-primary-300">
                <BookIcon />
                Courses
              </div>

              <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight md:text-3xl xl:text-[2rem] text-slate-900 dark:text-white">
                    {viewMode === "archived"
                      ? "Archived Courses"
                      : "Manage Your Courses"}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {viewMode === "archived"
                      ? "Archived courses stay out of the active list, but you can restore them anytime when needed."
                      : "Create courses, search quickly, and manage assessments, students, and marks from one cleaner dashboard."}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/70 p-1.5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/60">
                <button
                  type="button"
                  onClick={() => setViewMode("active")}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    viewMode === "active"
                      ? "bg-slate-900 text-white shadow-sm dark:bg-primary-600"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  My Courses
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("archived")}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    viewMode === "archived"
                      ? "bg-slate-900 text-white shadow-sm dark:bg-primary-600"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  Archived
                </button>
              </div>

              {/* <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Total" value={counts.all} />
                <StatCard label="Theory" value={counts.theory} />
                <StatCard label="Lab" value={counts.lab} />
                <StatCard label="Hybrid" value={counts.hybrid} />
              </div> */}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:w-auto xl:min-w-[300px]">
              <button
                type="button"
                onClick={() => navigate("/teacher/create-course")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 dark:shadow-primary-900/30"
              >
                <PlusIcon />
                Create Course
              </button>

              <button
                type="button"
                onClick={() => navigate("/teacher/dashboard")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <ArrowLeftIcon />
                Dashboard
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <label className="relative block">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                  <SearchIcon />
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by code, title, section, semester, year..."
                  className="w-full rounded-2xl border border-slate-200 bg-white/90 py-3 pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </label>
            </div>

            <div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-100"
              >
                <option value="all">All Types</option>
                <option value="theory">Theory</option>
                <option value="lab">Lab</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {courseError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          <div className="font-semibold">Could not load courses</div>
          <div className="mt-0.5 opacity-90">{courseError}</div>
        </div>
      )}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-5 dark:border-slate-800">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {viewMode === "archived" ? "Archived Courses" : "Your Courses"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing <span className="font-semibold">{filteredCourses.length}</span> of{" "}
                <span className="font-semibold">{courses.length}</span>
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="rounded-full border border-slate-200 px-3 py-1 dark:border-slate-700">
                Desktop table
              </span>
              <span className="rounded-full border border-slate-200 px-3 py-1 dark:border-slate-700">
                Mobile cards
              </span>
            </div>
          </div>
        </div>

        {loadingCourses ? (
          <div className="p-4 sm:p-6">
            <div className="grid gap-3">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="p-8 text-center sm:p-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
              <BookIcon />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">
              No courses found
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Try changing the filters or create a new course.
            </p>

            <button
              onClick={() => navigate("/teacher/create-course")}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-primary-600 dark:hover:bg-primary-700"
            >
              <PlusIcon />
              Create Course
            </button>
          </div>
        ) : (
          <>
            <div className="hidden w-full overflow-x-auto md:block">
              <table className="w-full min-w-[860px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[110px]" />
                  <col className="w-[38%]" />
                  <col className="w-[110px]" />
                  <col className="w-[120px]" />
                  <col className="w-[90px]" />
                  <col className="w-[220px]" />
                </colgroup>

                <thead className="bg-slate-50 dark:bg-slate-900/80">
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-slate-600 dark:text-slate-400">
                      Code
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                      Title
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-slate-600 dark:text-slate-400">
                      Section
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-slate-600 dark:text-slate-400">
                      Semester
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-slate-600 dark:text-slate-400">
                      Year
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-slate-600 dark:text-slate-400">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredCourses.map((c) => (
                    <DesktopCourseRow
                      key={c.id}
                      course={c}
                      viewMode={viewMode}
                      openCourse={openCourse}
                      handleArchive={handleArchive}
                      handleUnarchive={handleUnarchive}
                      handleDelete={handleDelete}
                      deletingId={deletingId}
                      archivingId={archivingId}
                      unarchivingId={unarchivingId}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 p-4 md:hidden">
              {filteredCourses.map((c) => (
                <MobileCourseCard
                  key={c.id}
                  course={c}
                  viewMode={viewMode}
                  openCourse={openCourse}
                  handleArchive={handleArchive}
                  handleUnarchive={handleUnarchive}
                  handleDelete={handleDelete}
                  deletingId={deletingId}
                  archivingId={archivingId}
                  unarchivingId={unarchivingId}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function DesktopCourseRow({
  course,
  viewMode,
  openCourse,
  handleArchive,
  handleUnarchive,
  handleDelete,
  deletingId,
  archivingId,
  unarchivingId,
}) {
  const { badgeClass, label } = getCourseTypeMeta(course.courseType);

  return (
    <tr className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
      <td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-900 dark:text-slate-100">
        {course.code}
      </td>

      <td className="px-4 py-4">
        <button
          type="button"
          onClick={() => openCourse(course)}
          className="block w-full min-w-0 text-left"
          title="Open course"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-slate-900 transition hover:text-primary-700 dark:text-slate-100 dark:hover:text-primary-300">
              {course.title}
            </span>
            <span
              className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}
            >
              {label}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
            {course.semester || "-"} • {course.year || "-"} • Section {course.section || "-"}
          </div>
        </button>
      </td>

      <td className="whitespace-nowrap px-4 py-4 text-slate-600 dark:text-slate-300">
        {course.section || "-"}
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-slate-600 dark:text-slate-300">
        {course.semester || "-"}
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-slate-600 dark:text-slate-300">
        {course.year || "-"}
      </td>

      <td className="px-4 py-4 text-right">
        <div className="flex flex-wrap justify-end gap-1.5">
          <ActionButton
            onClick={() => openCourse(course)}
            className="border-primary-200 text-primary-700 hover:bg-primary-50 dark:border-primary-900/60 dark:text-primary-300 dark:hover:bg-primary-950/40"
          >
            <ArrowRightIcon />
            Open
          </ActionButton>

          {viewMode === "active" ? (
            <ActionButton
              onClick={() => handleArchive(course)}
              disabled={archivingId === course.id}
              className="border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              {archivingId === course.id ? (
                <>
                  <SpinnerIcon />
                  Archiving...
                </>
              ) : (
                <>
                  <ArchiveIcon />
                  Archive
                </>
              )}
            </ActionButton>
          ) : (
            <ActionButton
              onClick={() => handleUnarchive(course)}
              disabled={unarchivingId === course.id}
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
            >
              {unarchivingId === course.id ? (
                <>
                  <SpinnerIcon />
                  Restoring...
                </>
              ) : (
                <>
                  <RestoreIcon />
                  Unarchive
                </>
              )}
            </ActionButton>
          )}

          <ActionButton
            onClick={() => handleDelete(course)}
            disabled={deletingId === course.id}
            className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
          >
            {deletingId === course.id ? (
              <>
                <SpinnerIcon />
                Deleting...
              </>
            ) : (
              <>
                <TrashIcon />
                Delete
              </>
            )}
          </ActionButton>
        </div>
      </td>
    </tr>
  );
}

function MobileCourseCard({
  course,
  viewMode,
  openCourse,
  handleArchive,
  handleUnarchive,
  handleDelete,
  deletingId,
  archivingId,
  unarchivingId,
}) {
  const { badgeClass, label } = getCourseTypeMeta(course.courseType);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {course.code}
          </div>
          <button
            type="button"
            onClick={() => openCourse(course)}
            className="mt-1 block text-left text-base font-semibold leading-6 text-slate-900 dark:text-white"
          >
            {course.title}
          </button>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${badgeClass}`}
        >
          {label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 rounded-2xl bg-slate-50 p-3 text-center dark:bg-slate-950/80">
        <InfoTile label="Section" value={course.section || "-"} />
        <InfoTile label="Semester" value={course.semester || "-"} />
        <InfoTile label="Year" value={course.year || "-"} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => openCourse(course)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
        >
          <ArrowRightIcon />
          Open
        </button>

        {viewMode === "active" ? (
          <button
            type="button"
            onClick={() => handleArchive(course)}
            disabled={archivingId === course.id}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {archivingId === course.id ? (
              <>
                <SpinnerIcon />
                Archiving...
              </>
            ) : (
              <>
                <ArchiveIcon />
                Archive
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleUnarchive(course)}
            disabled={unarchivingId === course.id}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-900/50 dark:bg-slate-950 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
          >
            {unarchivingId === course.id ? (
              <>
                <SpinnerIcon />
                Restoring...
              </>
            ) : (
              <>
                <RestoreIcon />
                Unarchive
              </>
            )}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => handleDelete(course)}
        disabled={deletingId === course.id}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/50 dark:bg-slate-950 dark:text-red-300 dark:hover:bg-red-950/30"
      >
        {deletingId === course.id ? (
          <>
            <SpinnerIcon />
            Deleting...
          </>
        ) : (
          <>
            <TrashIcon />
            Delete Course
          </>
        )}
      </button>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/60">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        {value}
      </div>
    </div>
  );
}

function InfoTile({ label, value }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}

function ActionButton({ children, className = "", ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg border bg-white px-2 py-1.5 text-[11px] font-semibold transition disabled:opacity-60 dark:bg-slate-950 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function getCourseTypeMeta(courseType) {
  const type = (courseType || "theory").toLowerCase();

  if (type === "lab") {
    return {
      label: "Lab",
      badgeClass:
        "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300",
    };
  }

  if (type === "hybrid") {
    return {
      label: "Hybrid",
      badgeClass:
        "border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300",
    };
  }

  return {
    label: "Theory",
    badgeClass:
      "border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300",
  };
}

function SkeletonRow() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-3 h-3 w-64 max-w-full rounded bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

function BookIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19a2 2 0 0 0 2 2h14V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z" />
      <path d="M4 7h16" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 21l-4.3-4.3" />
      <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 8v13H3V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M10 12h4" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 1-15.5 3.5L3 19" />
      <path d="M21 7a9 9 0 0 0-15.5-3.5L3 5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z" />
    </svg>
  );
}