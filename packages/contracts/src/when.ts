/**
 * Finds the day a chat message talks about ("rehearsal Friday", "tomorrow 7pm", "Nov 20"), so
 * the room can offer to put it on the call sheet. Returns "YYYY-MM-DD", or null when the message
 * names no day. Only what is said plainly counts: no guessing from "soon" or "next week".
 */
const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const day = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plus = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function findWhen(text: string, today: Date): string | null {
  const t = ` ${text.toLowerCase().replace(/[.,!?;:()]/g, " ")} `;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (/\b(today|tonight)\b/.test(t)) return day(start);
  if (/\b(tomorrow|tmrw|tmr)\b/.test(t)) return day(plus(start, 1));
  // "Nov 20", "November 20th", "20 Nov"
  const monthWord = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";
  const md =
    t.match(new RegExp(`\\b${monthWord} (\\d{1,2})(?:st|nd|rd|th)?\\b`)) ??
    t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? ${monthWord}\\b`));
  if (md) {
    const [a, b] = [md[1]!, md[2]!];
    const month = months.indexOf((/\d/.test(a) ? b : a).slice(0, 3));
    const date = Number(/\d/.test(a) ? a : b);
    // "may 5" is a month; "may" alone is a verb and never reaches here.
    if (month >= 0 && date >= 1 && date <= 31) {
      let when = new Date(start.getFullYear(), month, date);
      if (when.getMonth() !== month) return null;
      if (when < start) when = new Date(start.getFullYear() + 1, month, date);
      return day(when);
    }
  }
  // "Friday", "this Friday", "next Friday", "fri". Not "sat" or "sun": too often other words.
  const wd = t.match(
    /\b(next |this )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|mon|tue|tues|wed|thu|thur|thurs|fri)\b/,
  );
  if (wd) {
    const target = weekdays.findIndex((w) => w.startsWith(wd[2]!.slice(0, 3)));
    let ahead = (target - start.getDay() + 7) % 7;
    if (wd[1] === "next " && ahead === 0) ahead = 7;
    return day(plus(start, ahead));
  }
  return null;
}
