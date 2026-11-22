"""The weekly timesheet: hours per time code for Monday to Friday. Pure. (worknotes' method,
"off the clock": what is on the calendar is what was worked.)

Each weekday is exactly the working day (8.00 h by default) in quarter hours:
  1. A holiday, or time off or sick time, takes its own code first (a whole day, or its hours).
  2. Meetings and task blocks that day count inside the working hours only (not at lunch).
     Where blocks overlap, each minute is shared evenly between them.
  3. The minutes per code are rounded to quarter hours by largest remainder, never past what
     is left of the day.
  4. The rest of the day goes to the Default code.
Time on a hub with no code, and meetings with no time, are listed as not counted."""
from collections import defaultdict
from datetime import date, timedelta
from typing import Dict, List, NamedTuple, Optional, Tuple

QUARTER = 15
WEEKDAYS = 5
FALLBACK_CODES = {"holiday": "HOLIDAY", "time_off": "TIME OFF", "sick": "SICK"}
PTO_LABELS = {"holiday": "Holiday", "time_off": "Time off", "sick": "Sick"}


class Item(NamedTuple):
    day: date
    start: int          # minutes after midnight
    end: int
    code: str           # '' when its hub has none
    label: str          # what it was: a meeting's or task's title
    hub: str            # its hub's title ('' for none)
    kind: str           # 'meeting' or 'task'


class Off(NamedTuple):
    kind: str           # 'holiday', 'time_off' or 'sick'
    minutes: int        # 0: the whole day
    name: str


class Settings(NamedTuple):
    default_code: str
    codes: Dict[str, str]                   # kind -> code for holiday, time_off, sick
    spans: List[Tuple[int, int]]            # the working hours, lunch left out, in minutes


def working_spans(day_start: int, day_end: int, lunch_start: Optional[int], lunch_end: Optional[int]) -> List[Tuple[int, int]]:
    if lunch_start is None or lunch_end is None or not (day_start <= lunch_start < lunch_end <= day_end):
        return [(day_start, day_end)]
    return [span for span in ((day_start, lunch_start), (lunch_end, day_end)) if span[0] < span[1]]


def clip(item: Item, spans: List[Tuple[int, int]]) -> List[Item]:
    """The parts of an item inside the working hours."""
    parts = []
    for first, last in spans:
        start, end = max(item.start, first), min(item.end, last)
        if start < end:
            parts.append(item._replace(start=start, end=end))
    return parts


def split_day(items: List[Item]) -> Dict[str, float]:
    """{code: minutes}: every minute covered is shared evenly between the items covering it."""
    cuts = sorted({item.start for item in items} | {item.end for item in items})
    mix: Dict[str, float] = defaultdict(float)
    for first, last in zip(cuts, cuts[1:]):
        covering = [item for item in items if item.start <= first and item.end >= last]
        for item in covering:
            mix[item.code] += (last - first) / len(covering)
    return dict(mix)


def scale(mix: Dict[str, float], quarters: int) -> Dict[str, int]:
    """Shares quarters among the codes in proportion to their minutes, by largest remainder
    (ties to the code that sorts first). Codes with none are left out."""
    total = sum(mix.values())
    if total <= 0 or quarters <= 0:
        return {}
    raw = {code: minutes / total * quarters for code, minutes in mix.items()}
    shares = {code: int(value) for code, value in raw.items()}
    order = sorted(raw, key=lambda code: (-(raw[code] - shares[code]), code))
    for index in range(quarters - sum(shares.values())):
        shares[order[index % len(order)]] += 1
    return {code: share for code, share in shares.items() if share}


def week_report(monday: date, items: List[Item], untimed: List[Tuple[date, str, str]], off: Dict[date, Off],
                settings: Settings) -> Dict:
    """The week's grid and what went into it. untimed: (day, title, hub) of meetings with no time."""
    day_quarters = round(sum(last - first for first, last in settings.spans) / QUARTER)
    days = [monday + timedelta(days=offset) for offset in range(WEEKDAYS)]
    default = settings.default_code or "DEFAULT"
    warnings: List[str] = []
    if not settings.default_code:
        warnings.append("Set a Default code in Settings: the hours nothing is booked to are shown as DEFAULT.")
    grid: Dict[str, List[int]] = defaultdict(lambda: [0] * WEEKDAYS)
    details: Dict[str, List[Dict]] = defaultdict(list)
    not_counted: List[Dict] = []
    pto: List[Dict] = []
    unbooked = 0
    missing_pto_codes = set()
    for index, day in enumerate(days):
        fixed: Dict[str, int] = {}
        if day in off:
            entry = off[day]
            code = settings.codes.get(entry.kind) or FALLBACK_CODES[entry.kind]
            if not settings.codes.get(entry.kind):
                missing_pto_codes.add(entry.kind)
            fixed[code] = day_quarters if entry.minutes <= 0 else min(day_quarters, round(entry.minutes / QUARTER))
            pto.append({"day": day.isoformat(), "kind": entry.kind, "name": entry.name,
                        "hours": fixed[code] / 4})
        free = day_quarters - sum(fixed.values())
        counted: List[Item] = []
        for item in (each for each in items if each.day == day):
            if not item.code:
                not_counted.append({"day": day.isoformat(), "label": item.label, "hub": item.hub,
                                    "minutes": item.end - item.start,
                                    "reason": "no time code" if item.hub else "not in a project or area"})
                continue
            parts = clip(item, settings.spans)
            counted.extend(parts)
            if parts:
                details[item.code].append({"day": day.isoformat(), "label": item.label, "hub": item.hub,
                                           "kind": item.kind, "minutes": sum(part.end - part.start for part in parts)})
        mix = split_day(counted)
        quarters = min(free, round(sum(mix.values()) / QUARTER))
        shares = scale(mix, quarters)
        shares[default] = shares.get(default, 0) + free - quarters
        unbooked += free - quarters
        for code, share in list(shares.items()) + list(fixed.items()):
            if share:
                grid[code][index] += share
    for day, title, hub in untimed:
        if monday <= day < monday + timedelta(days=WEEKDAYS):
            not_counted.append({"day": day.isoformat(), "label": title, "hub": hub, "minutes": 0, "reason": "no time"})
    for kind in sorted(missing_pto_codes):
        warnings.append("Set a {} code in Settings: shown as {} for now.".format(PTO_LABELS[kind], FALLBACK_CODES[kind]))
    hubs_without = sorted({entry["hub"] for entry in not_counted if entry["reason"] == "no time code"})
    if hubs_without:
        warnings.append("No time code: {}.".format(", ".join(hubs_without)))
    rows = [{"code": code, "hours": [quarters / 4 for quarters in grid[code]], "total": sum(grid[code]) / 4}
            for code in sorted(grid)]
    totals = [sum(grid[code][index] for code in grid) / 4 for index in range(WEEKDAYS)]
    return {
        "monday": monday.isoformat(),
        "days": [day.isoformat() for day in days],
        "rows": rows,
        "totals": totals,
        "total": sum(totals),
        "unbooked_hours": unbooked / 4,
        "default_code": default,
        "warnings": warnings,
        "not_counted": sorted(not_counted, key=lambda entry: (entry["day"], entry["label"])),
        "pto": pto,
        "details": {code: sorted(entries, key=lambda entry: (entry["day"], entry["label"]))
                    for code, entries in sorted(details.items())},
    }
