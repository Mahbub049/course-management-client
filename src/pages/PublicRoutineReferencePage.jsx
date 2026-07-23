import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getRoutineReferenceData } from "../services/routineService";

function PublicRoutineReferencePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [building, setBuilding] = useState("");
  const [roomType, setRoomType] = useState("");
  const [roomNo, setRoomNo] = useState("");

  useEffect(() => {
    let active = true;
    getRoutineReferenceData()
      .then((response) => active && setData(response))
      .catch((requestError) => {
        if (active) setError(requestError?.response?.data?.message || "Could not load the university schedule directory.");
      });
    return () => {
      active = false;
    };
  }, []);

  const roomTypes = useMemo(() => {
    const rooms = (data?.rooms || []).filter((room) => !building || room.buildingName === building);
    return [...new Set(rooms.map((room) => room.roomTitle).filter(Boolean))];
  }, [data, building]);

  const roomNumbers = useMemo(() => {
    return (data?.rooms || [])
      .filter((room) => !building || room.buildingName === building)
      .filter((room) => !roomType || room.roomTitle === roomType)
      .sort((a, b) => a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }));
  }, [data, building, roomType]);

  const selectedRoom = roomNumbers.find((room) => room.roomNo === roomNo) || null;
  const daySlots = (data?.timeSlots || []).filter((slot) => slot.shift === "Day");
  const eveningNormal = (data?.timeSlots || []).filter((slot) => slot.shift === "Evening" && Number(slot.sequenceOrder) >= 7);
  const eveningFriday = (data?.timeSlots || []).filter((slot) => slot.shift === "Evening");

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">Public University Reference</span>
              <h1 className="mt-3 text-2xl font-black">BUBT Schedule & Room Directory</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Shared days, official class times, fixed P&amp;L, and room information for all teachers.</p>
            </div>
            <Link to="/login" className="rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-bold dark:border-slate-700">Portal Login</Link>
          </div>
        </section>

        {error ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">{error}</section>
        ) : !data ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900">Loading university reference data...</section>
        ) : (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-black">Official Days and Time Slots</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {data.days.map((day) => <span key={day.id} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold dark:border-slate-700">{day.label}</span>)}
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <TimeGroup title="Day Batch" subtitle="08:15 AM–05:45 PM" slots={daySlots} />
                <TimeGroup title="Evening Batch — Normal Days" subtitle="05:45 PM–09:30 PM" slots={eveningNormal} />
                <TimeGroup title="Evening Batch — Friday" subtitle="Friday uses the extended schedule" slots={eveningFriday} />
              </div>
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                P&amp;L is fixed: {data.prayerLunch.label}. No class or activity can be placed in this period.
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div>
                <h2 className="text-lg font-black">Room Directory</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Select building, room type, and then the room number.</p>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="text-xs font-bold">Building
                  <select value={building} onChange={(event) => { setBuilding(event.target.value); setRoomType(""); setRoomNo(""); }} className="routine-select mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    <option value="">Select building</option>
                    {data.buildings.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold">Room Type
                  <select value={roomType} onChange={(event) => { setRoomType(event.target.value); setRoomNo(""); }} disabled={!building} className="routine-select mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    <option value="">Select room type</option>
                    {roomTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold">Room Number
                  <select value={roomNo} onChange={(event) => setRoomNo(event.target.value)} disabled={!building || !roomType} className="routine-select mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    <option value="">Select room number</option>
                    {roomNumbers.map((room) => <option key={room.roomNo} value={room.roomNo}>{room.roomNo}</option>)}
                  </select>
                </label>
              </div>
              {selectedRoom && (
                <div className="mt-4 grid gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm dark:border-sky-500/30 dark:bg-sky-500/10 sm:grid-cols-4">
                  <Info label="Room" value={selectedRoom.roomNo} />
                  <Info label="Building" value={selectedRoom.buildingName} />
                  <Info label="Type" value={selectedRoom.roomTitle} />
                  <Info label="Lift Level" value={String(selectedRoom.liftLevel ?? "—")} />
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function TimeGroup({ title, subtitle, slots }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
      <h3 className="font-black">{title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      <div className="mt-3 space-y-2">
        {slots.map((slot) => <div key={slot.id} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold dark:bg-slate-800">{slot.label}</div>)}
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return <div><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 font-black">{value}</p></div>;
}

export default PublicRoutineReferencePage;
