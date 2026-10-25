// Calculate in university local time, independent of the teacher's browser timezone.
// The first active, ongoing duty wins; otherwise the earliest upcoming duty wins.
const toMinutes = value => {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  return m ? (+m[1] % 12 + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + +m[2] : null;
};
export function dhakaClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return {date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute)};
}
export function nextDuty(rows, clock = dhakaClock()) {
  const eligible = (rows || []).filter(x => !['exchanged_out','transferred_out'].includes(x.assignment))
    .filter(x => x.date && toMinutes(x.startTime) !== null && toMinutes(x.endTime) !== null)
    .sort((a,b) => a.date.localeCompare(b.date) || toMinutes(a.startTime) - toMinutes(b.startTime));
  const current = eligible.find(x => x.date === clock.date && toMinutes(x.startTime) <= clock.minutes && clock.minutes < toMinutes(x.endTime));
  if (current) return {key: String(current._id), status: 'current'};
  const next = eligible.find(x => x.date > clock.date || (x.date === clock.date && toMinutes(x.startTime) > clock.minutes));
  return next ? {key: String(next._id), status: 'next'} : null;
}

// Time-based filtering uses the end of the exam rather than its start.
// Reassigned-out records remain separately accessible for history and revert.
export function dutyProgress(row, clock = dhakaClock()) {
  if (['exchanged_out','transferred_out'].includes(row?.assignment) || row?.changeSide === 'outgoing') return 'reassigned';
  if (!row?.date) return 'remaining'; // Incomplete OCR must not vanish silently.
  if (row.date < clock.date) return 'completed';
  if (row.date > clock.date) return 'remaining';
  const end = toMinutes(row.endTime);
  return end !== null && end <= clock.minutes ? 'completed' : 'remaining';
}
const dutyCount = count => count === 1 ? 'a duty' : `${count} duties`;
export function proxyConflictText(count) {
  return count > 0 ? `You already have ${dutyCount(count)} at this time.` : '';
}
export function exchangeConflictText(yourCount, theirCount, facultyCode) {
  const messages = [];
  if (yourCount > 0) messages.push(`You already have ${dutyCount(yourCount)} at the time of ${facultyCode}'s selected duty.`);
  if (theirCount > 0) messages.push(`${facultyCode} already has ${dutyCount(theirCount)} at the time of your selected duty.`);
  return messages.join(' ');
}
