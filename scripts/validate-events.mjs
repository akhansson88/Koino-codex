import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const source = await readFile(new URL("../state/events.ts", import.meta.url), "utf8");
const compiled = await transform(source, { loader: "ts", format: "esm" });
const eventsUrl = `data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`;
const {
  eventAttendees,
  eventDraftProblem,
  eventDurationMinutes,
  eventIsPast,
  eventRsvpCounts,
  eventRsvpFor,
  formatEventTimeRange,
  googleCalendarUrl,
  nextUpcomingEvent,
  normalizeEventReminderMinutes,
  sortGroupEvents,
} = await import(eventsUrl);

const start = "2026-11-26T18:00:00.000Z";
const end = "2026-11-26T19:30:00.000Z";
const draft = {
  kind: "prayer_meeting",
  title: "Thursday prayer",
  startAt: start,
  endAt: end,
  reminderMinutes: [60, 1440],
};
assert.equal(eventDraftProblem(draft, Date.parse("2026-11-24T10:00:00Z")), null);
assert.equal(eventDraftProblem({ ...draft, title: " " }), "title");
assert.equal(eventDraftProblem({ ...draft, endAt: start }), "time");
assert.equal(eventDraftProblem({ ...draft, endAt: "2026-11-26T18:10:00.000Z" }), "duration");
assert.equal(eventDraftProblem({ ...draft, meetingUrl: "not a link" }), "link");
assert.equal(eventDraftProblem({ ...draft, title: "x".repeat(121) }), "title");

assert.deepEqual(normalizeEventReminderMinutes([60, 60, 45, 1440, 15]), [1440, 60, 15]);
assert.deepEqual(normalizeEventReminderMinutes("bad"), [1440, 60]);

const events = [
  { id: "later", title: "Later", startAt: "2026-11-27T18:00:00.000Z", endAt: "2026-11-27T19:00:00.000Z", reminderMinutes: [] },
  { id: "next", title: "Next", startAt: start, endAt: end, reminderMinutes: [] },
  { id: "past", title: "Past", startAt: "2026-11-20T18:00:00.000Z", endAt: "2026-11-20T19:00:00.000Z", reminderMinutes: [] },
];
assert.deepEqual(sortGroupEvents(events).map((event) => event.id), ["past", "next", "later"]);
assert.equal(eventIsPast(events[2]), true);
assert.equal(eventDurationMinutes(events[1]), 90);
assert.equal(nextUpcomingEvent(events, Date.parse("2026-11-24T10:00:00Z"))?.id, "next");
assert.equal(nextUpcomingEvent([events[0]], Date.parse("2026-11-24T10:00:00Z"), 1), undefined);

const rsvps = [
  { id: "a", eventId: "next", userId: "a", status: "going" },
  { id: "b", eventId: "next", userId: "b", status: "maybe" },
  { id: "c", eventId: "next", userId: "c", status: "declined" },
  { id: "d", eventId: "other", userId: "a", status: "going" },
];
assert.equal(eventRsvpFor(rsvps, "next", "b")?.status, "maybe");
assert.equal(eventAttendees(rsvps, "next").length, 3);
assert.deepEqual(eventRsvpCounts(rsvps, "next"), { going: 1, maybe: 1, declined: 1 });

const google = googleCalendarUrl({
  title: "Bön & fika",
  description: "Ta med en vän",
  startAt: "2026-11-26T18:00:00.000Z",
  endAt: "2026-11-26T19:30:00.000Z",
  location: "Köpmansgatan 20",
  meetingUrl: "https://meet.example.com/room",
});
assert.match(google, /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
assert.match(google, /dates=20261126T180000Z%2F20261126T193000Z/);
assert.match(google, /text=B%C3%B6n%20%26%20fika/);
assert.match(google, /location=K%C3%B6pmansgatan%2020/);

const range = formatEventTimeRange(events[1], "en");
assert.match(range, /^\d{1,2}:\d{2}(\s?[AP]M)?–\d{1,2}:\d{2}(\s?[AP]M)?$/);

console.log("Event helpers validated.");
