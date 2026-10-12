import { useEffect, useState } from "react";
import { fetchAttendanceSessions } from "../services/attendanceService";

// One small request per selected course. The effect ignores responses from a
// course that was changed while its request was still in flight.
export default function useAttendanceSessions(courseId, enabled, revision = 0) {
  const [state, setState] = useState({ courseId: "", sessions: [], loading: false, error: "" });

  useEffect(() => {
    if (!enabled || !courseId) return undefined;
    let cancelled = false;
    fetchAttendanceSessions(courseId)
      .then((result) => {
        if (!cancelled) {
          setState({ courseId, sessions: Array.isArray(result.sessions) ? result.sessions : [], loading: false, error: "" });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ courseId, sessions: [], loading: false, error: error?.response?.data?.message || "Could not load recorded attendance dates." });
        }
      });
    return () => { cancelled = true; };
  }, [courseId, enabled, revision]);

  // Never leak the last course's dates into a newly selected course.
  if (!enabled || !courseId) return { sessions: [], loading: false, error: "" };
  if (state.courseId !== courseId) return { sessions: [], loading: true, error: "" };
  return state;
}
