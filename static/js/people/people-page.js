// The People page: the directory as 1:1 prep, drawn in place of the dashboard: Something open
// (they owe me, I owe them or something to raise; the default) or Everyone; the Hub,
// Organisation and Sort dropdowns and the name box; for each, what they owe me, what I owe
// them, what to raise, when we next meet and what they are on; a footnote naming who has
// nothing open. A ListPage (static/js/pages/list-page.js) told what to show.
//
//   const page = peoplePage(sectionElement, { onOpen(id), onLeave(), onAdd(), today? });
//   page.show(ctx); page.focus();
//   personCounts(ctx, personId, now)   { waiting, late, owe, raise, next, theyOwe, iOwe } (pure;
//                            theyOwe / iOwe: one-on-one.js dueSummary of follow-ups / due days)
//   owedChips(summary, tone, today)    [{ text, tone }] of a They owe me / I owe them cell (pure)
//   newPersonDialog(app, { first?, last?, open? })   New person: first and last name, then
//                            their note opens (open false: it doesn't; resolves to the note)
import { ListPage } from "../pages/list-page.js";
import { formDialog } from "../ui/dialog.js";
import { avatar } from "../ui/avatar.js";
import { chip } from "../ui/chip.js";
import { makePerson } from "./people-commands.js";
import { SORTS, filterOptions, filterPeople, footnoteText, hubLinks, sortPeople } from "./people-model.js";
import { dueSummary, isOneOnOne, nextTogether, owedTo, soonDay, toRaise } from "./one-on-one.js";
import { waitingOn } from "../tasks/tasks-model.js";
import { localDay } from "../meetings/meeting-days.js";
import { shortTitle } from "../meetings/meetings-model.js";
import { dayText } from "../ui/dates.js";

export function personCounts(ctx, personId, now) {
  const day = localDay(now);
  const waiting = ctx.tasks ? waitingOn(ctx.tree, ctx.tasks, personId) : [];
  const owe = ctx.tasks ? owedTo(ctx.tree, ctx.tasks, personId) : [];
  const theyOwe = dueSummary(waiting.map((entry) => entry.task.follow_up || ""), day);
  return {
    waiting: waiting.length,
    late: theyOwe.late,
    owe: owe.length,
    raise: toRaise(ctx, personId).length,
    next: ctx.meetings ? nextTogether(ctx.tree, ctx.meetings, personId, now) : null,
    theyOwe,
    iOwe: dueSummary(owe.map((entry) => entry.task.due || ""), day),
  };
}

/**
 * A count cell's chips: "2 · 1 d late" (danger) or "2 · Mon" (tone: info for They owe me,
 * neutral for I owe them), then "1 soon" (caution) when some are late and others due soon.
 * Nothing owed: no chips.
 */
export function owedChips(summary, tone, today) {
  if (!summary.count) return [];
  const first = summary.late ? { text: `${summary.count} · ${summary.lateDays} d late`, tone: "danger" }
    : { text: summary.earliest ? `${summary.count} · ${soonDay(summary.earliest, today)}` : String(summary.count), tone };
  return summary.late && summary.soon ? [first, { text: `${summary.soon} soon`, tone: "caution" }] : [first];
}

export function newPersonDialog(app, { first = "", last = "", open = true } = {}) {
  return formDialog({
    title: "New person",
    fields: [
      { key: "first", label: "First name", value: first },
      { key: "last", label: "Last name", value: last, optional: true },
    ],
    submit: "Add to People",
    run: ({ first: given, last: family }) => makePerson(app, { first: given.trim(), last: family.trim() }, { strict: true, open }),
    fallbackFocus: () => app.focusNote(),
  });
}

const isOpenFor = (counts) => Boolean(counts.waiting || counts.owe || counts.raise);
const startKey = (next) => (next ? `${next.meeting.day} ${next.meeting.time || "00:00"}` : "");

function chipsCell(className, chips) {
  if (!chips.length) return [className, "—"];
  return [className, chips.map(({ text, tone }) => chip(text, tone))];
}

function nameCell(note, person) {
  const text = document.createElement("span");
  text.className = "people__name-text";
  const title = document.createElement("span");
  title.className = "people__title";
  title.textContent = note.title;
  const work = document.createElement("span");
  work.className = "people__work";
  work.textContent = [person.job, person.org].filter(Boolean).join(" · ");
  text.append(title, work);
  return ["people__name", [avatar(note.title, "people__avatar"), text]];
}

function nextCell(next, personId, today) {
  if (!next) return ["people__next", "—"];
  const when = document.createElement("span");
  when.className = "people__next-when";
  when.textContent = `${dayText(next.meeting.day, { today: localDay(today) })}${next.meeting.time ? ` ${next.meeting.time}` : ""}`;
  const what = document.createElement("span");
  what.className = "people__next-title";
  what.textContent = isOneOnOne(next, personId) ? "1:1" : shortTitle(next.note, next.meeting);
  return ["people__next", [when, what]];
}

export function peoplePage(section, { onOpen, onLeave, onAdd = () => {}, today = () => new Date() }) {
  // One draw reads each person's counts once.
  let cache = new Map();
  let cacheCtx = null;
  const countsOf = (ctx, note) => {
    if (cacheCtx !== ctx) {
      cache = new Map();
      cacheCtx = ctx;
    }
    if (!cache.has(note.id)) cache.set(note.id, personCounts(ctx, note.id, today()));
    return cache.get(note.id);
  };
  const listed = (ctx, { hubId = "", org = "", name = "" }) => filterPeople(ctx.tree, ctx.people,
    { hubId: hubId === "" ? null : Number(hubId), org, name });
  return new ListPage(section, {
    name: "people",
    heading: "People",
    pills: {
      key: "view",
      choices: (ctx) => {
        const all = filterPeople(ctx.tree, ctx.people);
        return [["open", `Something open · ${all.filter((note) => isOpenFor(countsOf(ctx, note))).length}`],
          ["everyone", `Everyone · ${all.length}`]];
      },
    },
    filters: [
      { key: "hubId", label: "Hub", inline: true },
      { key: "org", label: "Organisation", inline: true },
      { key: "sort", label: "Sort", any: null, fit: true, inline: true },
    ],
    search: { key: "name", label: "Filter by name", cap: "/", inline: true },
    options: ({ tree, people }) => {
      const { hubs, orgs } = filterOptions(tree, people);
      return {
        hubId: hubs.map((hub) => [String(hub.id), hub.title]),
        org: orgs.map((org) => [org, org]),
        sort: SORTS,
      };
    },
    rows: (ctx, values) => {
      const shown = listed(ctx, values).filter((note) => values.view === "everyone" || isOpenFor(countsOf(ctx, note)));
      return sortPeople(shown.map((note) => {
        const counts = countsOf(ctx, note);
        const earliest = [counts.theyOwe.earliest, counts.iOwe.earliest].filter(Boolean).sort()[0] ?? "";
        return { note, lateDays: Math.max(counts.theyOwe.lateDays, counts.iOwe.lateDays), earliest, next: startKey(counts.next) };
      }), values.sort || "overdue").map((entry) => entry.note);
    },
    columns: ["Name", "They owe me", "I owe them", "To raise", "Next together", "On"],
    cells: (note, ctx) => {
      const { tree, people } = ctx;
      const now = today();
      const links = hubLinks(tree, people, note.id).filter((link) => !link.archived);
      const counts = countsOf(ctx, note);
      return [
        nameCell(note, people.get(note.id)),
        chipsCell("people__owed", owedChips(counts.theyOwe, "info", now)),
        chipsCell("people__owe", owedChips(counts.iOwe, "neutral", now)),
        ["people__count", counts.raise ? String(counts.raise) : "—"],
        nextCell(counts.next, note.id, now),
        ["people__hubs", links.map(({ hub }) => hub.title).join(", ")],
      ];
    },
    footnote: (ctx, values) => {
      const idle = values.view === "everyone" ? []
        : listed(ctx, values).filter((note) => !isOpenFor(countsOf(ctx, note))).map((note) => note.title);
      return footnoteText({ view: values.view || "open", sort: values.sort || "overdue", idle });
    },
    onAction: (action, values) => {
      if (action !== "openOnly") return false;
      values.view = values.view === "everyone" ? "open" : "everyone";
      return true;
    },
    empty: "No one matches",
    add: { label: "New person", run: onAdd, key: "n" },
    onOpen,
    onLeave,
  });
}
