// client/src/pages/teacherCourse/TabSettings.jsx

export default function TabSettings({ course }) {
  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <h3 className="font-semibold text-slate-800 mb-2">
          Course Information
        </h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-slate-500">Course Code</dt>
            <dd className="font-medium text-slate-800">{course.code}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Title</dt>
            <dd className="font-medium text-slate-800">{course.title}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Section</dt>
            <dd className="font-medium text-slate-800">
              {course.section || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Semester</dt>
            <dd className="font-medium text-slate-800">
              {course.semester || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Year</dt>
            <dd className="font-medium text-slate-800">
              {course.year || "—"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="bg-white border border-dashed border-slate-300 rounded-lg p-4 text-sm text-slate-500">
        <h4 className="font-semibold text-slate-700 mb-1">
          Future Settings (optional)
        </h4>
        <p>
          Here later you can add options like editing course title/section,
          locking marks, exporting PDFs, etc. For now this tab just shows the
          course details in a clean way.
        </p>
      </div>
    </div>
  );
}
