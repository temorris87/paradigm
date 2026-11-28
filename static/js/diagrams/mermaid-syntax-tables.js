// What can be typed in each diagram type: one table per type, and how the names a block uses
// (participants, nodes, states...) are read from its lines. Pure data and small helpers;
// mermaid-syntax.js reads the cursor's place and picks the rows from here.
//
//   syntaxFor(type, body) -> { nameWord, names(body), header, starts, after(name, names),
//       afterNode(before) -> { name, token } | null, afterNodeRows(name, names),
//       inline(before), inlineRows(names) } (each optional), for the block's other lines body
//
// Rows are written with blanks, ‹like this› (static/js/editor/blanks.js).

const row = (insert, detail = "") => ({ insert, detail });
const lines = (...parts) => parts.join("\n");
const others = (names, name) => names.filter((each) => each !== name);
const firstOther = (names, name) => others(names, name)[0] ?? "‹other›";

// ---- names in a block --------------------------------------------------------------------------

function matchesIn(body, pattern, groups = [1]) {
  const found = [];
  for (const line of body) {
    if (/^\s*%%/.test(line)) continue;
    for (const match of line.matchAll(pattern)) for (const group of groups) if (match[group]) found.push(match[group]);
  }
  return found;
}

const sequenceNames = (body) => [
  ...matchesIn(body, /^\s*(?:create\s+)?(?:participant|actor)\s+(.+?)(?:\s+as\s+.*)?\s*$/g),
  ...matchesIn(body, /^\s*([^\s:+-][^:]*?)\s*<?<?-{1,2}(?:>>|>|x|\))[+-]?\s*([^\s:+-][^:]*?)\s*:/g, [1, 2]),
].map((name) => name.trim()).filter((name) => !/\s/.test(name) && !/^(Note|note|loop|alt|else|opt|par|and|rect|end|critical|break|box)$/.test(name));

const FLOW_KEYWORDS = /^\s*(subgraph|end|classDef|class|style|linkStyle|click|direction|%%)\b/;
const flowNames = (body) => {
  const ids = [];
  for (const line of body) {
    if (FLOW_KEYWORDS.test(line)) continue;
    // Labels out first ([...], (...), {...}, |...|, "..."), then split at the edges. A flag's
    // ">" follows its id straight on: the ">" ending an edge (-->, ==>, -.->) is not one.
    const bare = line.replace(/"[^"]*"/g, "").replace(/\|[^|]*\|/g, " ").replace(/(\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|(?<=\w)>[^\]]*\])/g, " ")
      .replace(/:::\S+/g, " ");
    for (const part of bare.split(/<?(?:-{2,}|={2,}|-\.+-?)[>ox]?|~~~|&|;|\s+/)) {
      const id = part.trim();
      if (/^[A-Za-z_][\w-]*$/.test(id) && !/^(TD|TB|LR|RL|BT|end)$/.test(id)) ids.push(id);
    }
  }
  return ids;
};

const stateNames = (body) => [
  ...matchesIn(body, /^\s*state\s+(?:"[^"]*"\s+as\s+)?([\w-]+)/g),
  ...matchesIn(body, /^\s*([\w-]+)\s*-->\s*([\w-]+)/g, [1, 2]),
  ...matchesIn(body, /^\s*([\w-]+)\s*:/g),
].filter((name) => !/^(state|note|direction|classDef|class)$/.test(name));

const ER_LINK = /[|}o][|o](?:--|\.\.)[|o][|{o]/;
const erNames = (body) => [
  ...matchesIn(body, /^\s*([\w-]+)\s*(?:\[[^\]]*\]\s*)?\{/g),
  ...matchesIn(body, new RegExp(`^\\s*([\\w-]+)\\s*${ER_LINK.source}\\s*([\\w-]+)`, "g"), [1, 2]),
];

const CLASS_LINK = /<\|--|--\|>|\*--|--\*|o--|--o|-->|<--|\.\.>|<\.\.|\.\.\|>|<\|\.\.|--|\.\./;
const classNames = (body) => [
  ...matchesIn(body, /^\s*class\s+([\w-]+)/g),
  ...matchesIn(body, new RegExp(`^\\s*([\\w-]+)\\s*(?:"[^"]*"\\s*)?(?:${CLASS_LINK.source})\\s*(?:"[^"]*"\\s*)?([\\w-]+)`, "g"), [1, 2]),
];

const ganttIds = (body) => matchesIn(body, /:\s*(?:(?:active|done|crit|milestone)\s*,\s*)*([A-Za-z_][\w-]*)\s*,/g)
  .filter((id) => !/^(after|until|active|done|crit|milestone)$/.test(id));

// ---- the tables, one per type ----------------------------------------------------------------

const DIRECTIONS = [row("TD", "top down"), row("LR", "left to right"), row("BT", "bottom up"), row("RL", "right to left"), row("TB", "top to bottom")];

function nextId(names) {
  for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") if (!names.includes(letter)) return letter;
  return "N1";
}

const FLOW_EDGES = [["-->", "arrow"], ["---", "line"], ["-.->", "dotted arrow"], ["==>", "thick arrow"], ["--o", "circle end"], ["--x", "cross end"], ["<-->", "both ways"]];
const flowShapes = (id) => [
  row(`${id}[‹text›]`, "box"), row(`${id}(‹text›)`, "rounded box"), row(`${id}{‹text›}`, "decision"),
  row(`${id}((‹text›))`, "circle"), row(`${id}[(‹db›)]`, "database"), row(`${id}([‹text›])`, "stadium"),
  row(`${id}[[‹text›]]`, "subroutine"), row(`${id}{{‹text›}}`, "hexagon"), row(`${id}>‹text›]`, "flag"),
];

// A line that is one node written with its shape, then a space ("A[Again] "), and what was
// typed after that space. A shape's text holds none of its own closing brackets.
const SHAPED_NODE = new RegExp(String.raw`^\s*([A-Za-z_][\w-]*)(?:\(\([^)]*\)\)|\[\([^)]*\)\]|\(\[[^\]]*\]\)|\[\[[^\]]*\]\]|`
  + String.raw`\{\{[^}]*\}\}|\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|>[^\]]*\])(\s+\S*)$`);

const FLOWCHART = {
  nameWord: "node",
  names: flowNames,
  header: DIRECTIONS,
  starts: (token, names) => {
    // "end" closes a subgraph: never a node's id, so Enter after it is a new line.
    const reserved = FLOW_KEYWORDS.test(token) && /^[a-zA-Z]+$/.test(token);
    const id = /^[A-Za-z_][\w-]*$/.test(token) ? token : nextId(names);
    return [
      ...(reserved ? [] : [...flowShapes(id), row(`${id} --> ‹node›`, "arrow to a node"), row(`${id} -->|‹label›| ‹node›`, "arrow with a label")]),
      row(lines("subgraph ‹title›", "    ‹node›", "end"), "a group of nodes"), row("end", "closes a subgraph"),
      row("classDef ‹name› fill:‹colour›", "a style class"), row("class ‹ids› ‹className›", "nodes take a class"),
      row("style ‹id› fill:‹colour›", "one node's style"), row("linkStyle ‹n› stroke:‹colour›", "an arrow's style"),
      row("click ‹id› \"‹url›\"", "a node links somewhere"), row("direction ‹LR›", "inside a subgraph"),
    ];
  },
  after: (name, names) => [
    ...others(names, name).map((other) => row(`${name} --> ${other}`, "arrow")),
    ...FLOW_EDGES.map(([edge, words]) => row(`${name} ${edge} ‹node›`, words)),
    row(`${name} -->|‹label›| ‹node›`, "arrow with a label"),
    ...flowShapes(name), row(`${name}:::‹class›`, "takes a class"),
  ],
  afterNode: (before) => {
    const found = SHAPED_NODE.exec(before);
    return found ? { name: found[1], token: found[2] } : null;
  },
  // After a node with its shape: its edges, without the node (it is written already); the
  // shapes and the class need the bare id, so they are not offered there.
  afterNodeRows: (name, names) => FLOWCHART.after(name, names)
    .filter((each) => each.insert.startsWith(`${name} `))
    .map((each) => row(each.insert.slice(name.length), each.detail)),
};

const SEQUENCE = {
  nameWord: "participant",
  names: sequenceNames,
  starts: [
    row("participant ‹Name›", "a box"), row("participant ‹A› as ‹Alias›", "a box with a longer name"), row("actor ‹Name›", "a person"),
    row(lines("loop ‹every minute›", "    ‹message›", "end"), "repeats"), row(lines("alt ‹case›", "    ‹message›", "else ‹other case›", "    ‹message›", "end"), "one or the other"),
    row(lines("opt ‹if›", "    ‹message›", "end"), "maybe"), row(lines("par ‹first›", "    ‹message›", "and ‹second›", "    ‹message›", "end"), "at the same time"),
    row(lines("critical ‹action›", "    ‹message›", "option ‹failure›", "    ‹message›", "end"), "must happen"),
    row(lines("break ‹when›", "    ‹message›", "end"), "stops the flow"), row(lines("rect rgb(‹230, 240, 255›)", "    ‹message›", "end"), "a shaded band"),
    row(lines("box ‹label›", "    participant ‹Name›", "end"), "a box round participants"),
    row("activate ‹Name›", "a bar starts"), row("deactivate ‹Name›", "the bar ends"), row("autonumber", "number the messages"),
    row("Note right of ‹Name›: ‹text›", "a note"), row("Note over ‹A›,‹B›: ‹text›", "a note across"), row("title ‹text›", "a title"),
  ],
  after: (name, names) => [
    ...others(names, name).map((other) => row(`${name}->>${other}: ‹message›`, "message")),
    ...[["-->>", "reply (dashed)"], ["-)", "async"], ["-x", "lost (cross)"], ["->>+", "call, activates"], ["-->>-", "return, deactivates"], ["->", "line, no arrowhead"]]
      .map(([arrow, words]) => row(`${name}${arrow}${firstOther(names, name)}: ‹message›`, words)),
    row(`Note right of ${name}: ‹text›`, "note"), row(`Note left of ${name}: ‹text›`, "note"),
    row(`Note over ${name},${firstOther(names, name)}: ‹text›`, "note across"),
  ],
};

const GANTT_DATE = "‹YYYY-MM-DD›";
const ganttTasks = (ids) => [
  row(`‹Task› :‹id›, ${GANTT_DATE}, ‹3d›`, "a task"), row(`‹Task› :active, ‹id›, ${GANTT_DATE}, ‹3d›`, "in progress"),
  row(`‹Task› :done, ‹id›, ${GANTT_DATE}, ‹3d›`, "done"), row(`‹Task› :crit, ‹id›, ${GANTT_DATE}, ‹3d›`, "critical"),
  row(`‹Milestone› :milestone, ‹id›, ${GANTT_DATE}, 0d`, "a milestone"),
  ...(ids.length ? ids : ["‹id›"]).map((id) => row(`‹Task› :after ${id}, ‹3d›`, "starts after a task")),
];
const GANTT = {
  nameWord: "task",
  names: ganttIds,
  starts: (token, ids) => [
    row("title ‹text›", "the chart's title"), row("dateFormat YYYY-MM-DD", "how dates are written"), row("section ‹name›", "a group of tasks"),
    ...ganttTasks(ids),
    row("axisFormat %d %b", "dates on the axis"), row("excludes weekends", "skip weekends"), row("tickInterval 1week", "the axis' ticks"),
    row("weekday monday", "weeks start"), row("todayMarker off", "no today line"),
  ],
  // In a task, after ":" or ",": its tags, a task to start after, a duration.
  inline: (before) => {
    const found = /^[^:]+:(?:[^:]*,)?\s*(\S*)$/.exec(before);
    if (!found || /^\s*(title|section|dateFormat|axisFormat|excludes|tickInterval|weekday|todayMarker)\b/.test(before)) return null;
    return { token: found[1], label: "in a task" };
  },
  inlineRows: (ids) => [
    row("active, ", "in progress"), row("done, ", "done"), row("crit, ", "critical"), row("milestone, ", "a milestone"),
    ...(ids.length ? ids : ["‹id›"]).map((id) => row(`after ${id}`, "starts after a task")),
    row("1d", "a day"), row("3d", "three days"), row("1w", "a week"), row("2w", "two weeks"), row("12h", "hours"),
  ],
};

const STATE = {
  nameWord: "state",
  names: stateNames,
  header: [],
  starts: [
    row("[*] --> ‹State›", "the start"), row(lines("state ‹Name› {", "    [*] --> ‹Inner›", "}"), "a state with states inside"),
    row("state \"‹description›\" as ‹Name›", "a state with a longer name"), row("state ‹Name› <<choice>>", "a choice"),
    row("state ‹Name› <<fork>>", "a fork"), row("state ‹Name› <<join>>", "a join"),
    row(lines("note right of ‹State›", "    ‹text›", "end note"), "a note"), row("direction LR", "left to right"), row("--", "concurrent parts"),
    row("classDef ‹name› fill:‹colour›", "a style class"),
  ],
  after: (name, names) => [
    ...others(names, name).map((other) => row(`${name} --> ${other}`, "moves on")),
    row(`${name} --> ‹State› : ‹event›`, "moves on, with why"), row(`${name} --> [*]`, "the end"),
    row(`${name} : ‹description›`, "what it is"), row(`note right of ${name} : ‹text›`, "a note"),
  ],
};

const ER_LINKS = [["||--o{", "one to zero or more"], ["||--|{", "one to one or more"], ["||--||", "one to one"], ["}o--o{", "many to many"], ["|o--o|", "zero or one each"], ["||..o{", "not identifying"]];
const ER = {
  nameWord: "entity",
  names: erNames,
  starts: [
    row(lines("‹ENTITY› {", "    string ‹field›", "}"), "an entity with fields"),
    row("‹A› ||--o{ ‹B› : \"‹has›\"", "a relationship"), row("direction LR", "left to right"),
  ],
  after: (name, names) => [
    ...others(names, name).map((other) => row(`${name} ||--o{ ${other} : "‹has›"`, "one to zero or more")),
    ...ER_LINKS.map(([link, words]) => row(`${name} ${link} ‹OTHER› : "‹has›"`, words)),
    row(lines(`${name} {`, "    string ‹field›", "}"), "its fields"),
  ],
};

const CLASS_RELATIONS = [["<|--", "inherits"], ["*--", "composition"], ["o--", "aggregation"], ["-->", "association"], ["..>", "dependency"], ["..|>", "realisation"], ["--", "link"]];
const CLASS = {
  nameWord: "class",
  names: classNames,
  starts: [
    row(lines("class ‹Name› {", "    +‹field›", "    +‹method›()", "}"), "a class with members"), row("class ‹Name›", "a class"),
    row("‹A› <|-- ‹B›", "inheritance"), row("note \"‹text›\"", "a note"), row("note for ‹Name› \"‹text›\"", "a note on a class"),
    row("direction LR", "left to right"), row("classDef ‹name› fill:‹colour›", "a style class"),
  ],
  after: (name, names) => [
    ...others(names, name).map((other) => row(`${name} <|-- ${other}`, "inherits")),
    ...CLASS_RELATIONS.map(([link, words]) => row(`${name} ${link} ‹Other›`, words)),
    row(`${name} : +‹field›`, "a field"), row(`${name} : +‹method›()`, "a method"),
  ],
};

const MINDMAP = {
  starts: [
    row("root((‹Topic›))", "the centre"), row("‹Idea›", "a node (indent: under the one above)"), row("(‹rounded›)", "rounded"),
    row("[‹square›]", "square"), row("((‹circle›))", "circle"), row(")‹cloud›(", "cloud"), row("))‹bang›((", "bang"),
    row("{{‹hexagon›}}", "hexagon"), row("::icon(‹fa fa-book›)", "an icon on the node above"), row(":::‹class›", "a class on the node above"),
  ],
};

const TIMELINE = {
  starts: [row("title ‹text›", "a title"), row("section ‹period›", "a group of periods"), row("‹2026› : ‹event›", "a period and its event"),
    row(": ‹another event›", "one more event in the period")],
};

const JOURNEY = {
  starts: [row("title ‹text›", "a title"), row("section ‹name›", "a stage"), row("‹Task›: ‹5›: ‹Me›", "a step, scored 1 to 5, with who")],
};

const PIE = {
  header: [row("showData", "values beside the labels"), row("title ‹text›", "a title")],
  starts: [row("title ‹text›", "a title"), row("\"‹Label›\" : ‹42›", "a slice")],
};

const QUADRANT = {
  starts: [
    row("title ‹text›", "a title"), row("x-axis ‹Low› --> ‹High›", "the x axis"), row("y-axis ‹Low› --> ‹High›", "the y axis"),
    row("quadrant-1 ‹text›", "top right"), row("quadrant-2 ‹text›", "top left"), row("quadrant-3 ‹text›", "bottom left"),
    row("quadrant-4 ‹text›", "bottom right"), row("‹Point›: [‹0.5›, ‹0.5›]", "a point (0 to 1)"), row("classDef ‹name› color: ‹colour›", "a style class"),
  ],
};

const REQUIREMENT_KINDS = ["requirement", "functionalRequirement", "interfaceRequirement", "performanceRequirement", "physicalRequirement", "designConstraint"];
const REQUIREMENT_LINKS = ["satisfies", "contains", "copies", "derives", "verifies", "refines", "traces"];
const REQUIREMENT = {
  nameWord: "requirement",
  names: (body) => matchesIn(body, /^\s*(?:requirement|functionalRequirement|interfaceRequirement|performanceRequirement|physicalRequirement|designConstraint|element)\s+([\w-]+)/g),
  starts: [
    ...REQUIREMENT_KINDS.map((kind) => row(lines(`${kind} ‹name› {`, "    id: ‹1›", "    text: \"‹what it must do›\"", "    risk: ‹medium›", "    verifymethod: ‹test›", "}"), kind === "requirement" ? "a requirement" : kind)),
    row(lines("element ‹name› {", "    type: \"‹kind›\"", "}"), "what meets requirements"),
  ],
  after: (name, names) => [
    ...others(names, name).map((other) => row(`${name} - satisfies -> ${other}`, "satisfies")),
    ...REQUIREMENT_LINKS.map((link) => row(`${name} - ${link} -> ‹other›`, link)),
  ],
};

const GITGRAPH = {
  nameWord: "branch",
  names: (body) => ["main", ...matchesIn(body, /^\s*branch\s+([\w./-]+)/g)],
  starts: (token, branches) => [
    row("commit", "a commit"), row("commit id: \"‹id›\"", "a named commit"), row("commit tag: \"‹v1.0›\"", "a tagged commit"),
    row("commit type: HIGHLIGHT", "a highlighted commit"), row("branch ‹name›", "a new branch"),
    ...branches.map((branch) => row(`checkout ${branch}`, "go to the branch")), ...branches.map((branch) => row(`merge ${branch}`, "merge it in")),
    row("cherry-pick id: \"‹id›\"", "copy a commit"),
  ],
};

const C4_ELEMENTS = ["Person", "Person_Ext", "System", "System_Ext", "SystemDb", "SystemQueue"];
const C4_CONTAINERS = ["Container", "ContainerDb", "Component"];
const C4 = {
  nameWord: "element",
  names: (body) => matchesIn(body, /^\s*(?:Person|System|Container|Component|Boundary|Enterprise_Boundary|System_Boundary|Container_Boundary|Node|Deployment_Node)\w*\(\s*([\w-]+)/g),
  starts: (token, names) => [
    row("title ‹text›", "a title"),
    ...C4_ELEMENTS.map((kind) => row(`${kind}(‹alias›, "‹label›", "‹description›")`, kind)),
    ...C4_CONTAINERS.map((kind) => row(`${kind}(‹alias›, "‹label›", "‹technology›", "‹description›")`, kind)),
    ...["Boundary", "Enterprise_Boundary", "System_Boundary"].map((kind) => row(lines(`${kind}(‹alias›, "‹label›") {`, "    ‹element›", "}"), kind)),
    ...(names.length > 1 ? [row(`Rel(${names[0]}, ${names[1]}, "‹label›")`, "a relationship")] : []),
    row("Rel(‹from›, ‹to›, \"‹label›\")", "a relationship"), row("BiRel(‹from›, ‹to›, \"‹label›\")", "both ways"),
    ...["Rel_U", "Rel_D", "Rel_L", "Rel_R"].map((kind) => row(`${kind}(‹from›, ‹to›, "‹label›")`, `${kind}: a relationship that way`)),
    row("UpdateLayoutConfig($c4ShapeInRow=\"‹3›\", $c4BoundaryInRow=\"‹1›\")", "how many in a row"),
  ],
};

const SANKEY = {
  nameWord: "node",
  names: (body) => matchesIn(body, /^\s*([^,]+),([^,]+),/g, [1, 2]).map((name) => name.trim()),
  starts: (token, names) => [...names.map((name) => row(`${name},‹target›,‹value›`, "a flow from it")), row("‹source›,‹target›,‹value›", "a flow")],
};

const XYCHART = {
  header: [row("horizontal", "bars across")],
  starts: [
    row("title \"‹text›\"", "a title"), row("x-axis [‹a›, ‹b›, ‹c›]", "categories"), row("x-axis \"‹title›\" ‹0› --> ‹100›", "a number range"),
    row("y-axis \"‹title›\" ‹0› --> ‹100›", "the y axis"), row("bar [‹1›, ‹2›, ‹3›]", "bars"), row("line [‹1›, ‹2›, ‹3›]", "a line"),
  ],
};

const BLOCK = {
  nameWord: "block",
  names: (body) => matchesIn(body, /(?:^|\s)([A-Za-z_][\w-]*)(?=\s*(?:\[|\(|\{|$|\s))/g).filter((id) => !/^(columns|block|end|space|classDef|class|style)$/.test(id)),
  starts: [
    row("columns ‹3›", "blocks per row"), row("‹id›[\"‹label›\"]", "a block"), row("‹id›(\"‹label›\")", "rounded"), row("‹id›((\"‹label›\"))", "circle"),
    row(lines("block:‹id›", "    ‹inner›", "end"), "blocks inside a block"), row("space", "an empty cell"), row("‹id›<[\"‹label›\"]>(right)", "an arrow block"),
    row("‹a› --> ‹b›", "an arrow"), row("classDef ‹name› fill:‹colour›", "a style class"), row("style ‹id› fill:‹colour›", "one block's style"),
  ],
  after: (name, names) => [
    ...others(names, name).map((other) => row(`${name} --> ${other}`, "arrow")),
    row(`${name} --> ‹block›`, "arrow"), row(`${name} -- "‹label›" --> ‹block›`, "arrow with a label"), row(`${name}:‹2›`, "takes two columns"),
  ],
};

function packetNext(body) {
  let next = 0;
  for (const line of body) {
    const range = /^\s*(\d+)(?:-(\d+))?\s*:/.exec(line);
    const plus = /^\s*\+(\d+)\s*:/.exec(line);
    if (range) next = Number(range[2] ?? range[1]) + 1;
    else if (plus) next += Number(plus[1]);
  }
  return next;
}
const PACKET = {};

const KANBAN = {
  starts: [
    row("‹column›[‹Title›]", "a column"), row("    ‹id›[‹Card›]", "a card (indented under its column)"),
    row("‹id›[‹Card›]@{ assigned: '‹name›', priority: '‹High›' }", "a card with details"),
  ],
};

const ARCH_ICONS = ["cloud", "database", "disk", "internet", "server"];
const ARCHITECTURE = {
  nameWord: "service",
  names: (body) => matchesIn(body, /^\s*(?:service|group|junction)\s+([\w-]+)/g),
  starts: [
    row("group ‹id›(cloud)[‹Title›]", "a group"),
    ...ARCH_ICONS.map((icon) => row(`service ‹id›(${icon})[‹Title›]`, `a service: ${icon}`)),
    row("service ‹id›(server)[‹Title›] in ‹group›", "a service in a group"), row("junction ‹id›", "a junction"),
    row("‹a›:R -- L:‹b›", "a line"), row("‹a›:B --> T:‹b›", "an arrow"),
  ],
  after: (name, names) => [
    ...others(names, name).map((other) => row(`${name}:R -- L:${other}`, "a line, right to left")),
    row(`${name}:R --> L:‹other›`, "an arrow"), row(`${name}:B -- T:‹other›`, "a line, bottom to top"),
    row(`${name}:L -- R:‹other›`, "a line, left to right"), row(`${name}:T -- B:‹other›`, "a line, top to bottom"),
  ],
};

const TREEMAP = {
  starts: [row("\"‹Section›\"", "a section (indent: inside the one above)"), row("\"‹Leaf›\": ‹10›", "a leaf and its value"),
    row("classDef ‹name› fill:‹colour›", "a style class"), row("\"‹Leaf›\": ‹10›:::‹class›", "a leaf with a class")],
};

const RADAR = {
  starts: [
    row("title ‹text›", "a title"), row("axis ‹a›[\"‹Label›\"], ‹b›[\"‹Label›\"], ‹c›[\"‹Label›\"]", "the axes"),
    row("curve ‹id›[\"‹Label›\"]{‹1›, ‹2›, ‹3›}", "one option's scores"), row("max ‹5›", "the top of the scale"), row("min ‹0›", "the bottom"),
    row("graticule polygon", "straight rings"), row("ticks ‹5›", "how many rings"), row("showLegend true", "the legend"),
  ],
};

function nextFrame(body) {
  const numbers = matchesIn(body, /^\s*(?:tf|timeframe|rf|resetframe)\s+(\d+)/g).map(Number);
  return String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(2, "0");
}
const EVENTMODELING = {};

const TREEVIEW = {
  starts: [row("‹name›", "a folder or file (indent: inside the one above)"), row("‹name› ## ‹description›", "with a description"),
    row("‹name› icon(‹folder›)", "with an icon"), row("‹name› :::‹class›", "with a class"), row("title ‹text›", "a title")],
};

const ISHIKAWA = {
  starts: [row("‹Problem›", "the problem (first line), or a cause indented under it"), row("    ‹Cause›", "a cause"),
    row("        ‹Sub-cause›", "a cause of the cause")],
};

const VENN = {
  nameWord: "set",
  names: (body) => matchesIn(body, /^\s*set\s+([\w-]+)/g),
  starts: (token, names) => [
    row("set ‹A›[\"‹Label›\"]", "a set"), row("set ‹A›[\"‹Label›\"]:‹10›", "a set with a size"),
    ...(names.length > 1 ? [row(`union ${names[0]},${names[1]}["‹Label›"]`, "where they overlap")] : []),
    row("union ‹A›,‹B›[\"‹Label›\"]", "where sets overlap"), row("text ‹A›[\"‹text›\"]", "text in a set"),
    row("style ‹A› fill:‹colour›", "a set's style"), row("title ‹text›", "a title"),
  ],
};

const WARDLEY = {
  nameWord: "component",
  names: (body) => matchesIn(body, /^\s*(?:anchor|component)\s+([A-Za-z][\w-]*)\s*\[/g),
  starts: [
    row("title ‹text›", "a title"), row("size [‹1000›, ‹800›]", "the map's size"),
    row("evolution ‹Genesis› -> ‹Custom› -> ‹Product› -> ‹Commodity›", "the stages"),
    row("anchor ‹Name› [‹0.95›, ‹0.50›]", "a user or need [visibility, evolution]"), row("component ‹Name› [‹0.50›, ‹0.50›]", "a component"),
    row("component ‹Name› [‹0.50›, ‹0.50›] (build)", "with a strategy: build, buy, outsource, market"),
    row("evolve ‹Name› ‹0.80›", "where it is going"), row(lines("pipeline ‹Name› {", "    component ‹Part› [‹0.50›]", "}"), "a pipeline"),
    row("note \"‹text›\" [‹0.50›, ‹0.50›]", "a note"), row("annotation ‹1›, [‹0.50›, ‹0.50›] \"‹text›\"", "a numbered annotation"),
    row("annotations [‹0.05›, ‹0.95›]", "where the annotations list goes"), row("accelerator ‹Name› [‹0.50›, ‹0.50›]", "an accelerator"),
    row("deaccelerator ‹Name› [‹0.50›, ‹0.50›]", "a deaccelerator"),
  ],
  after: (name, names) => [
    ...others(names, name).map((other) => row(`${name} -> ${other}`, "depends on")),
    row(`${name} -> ‹Other›`, "depends on"), row(`${name} -.-> ‹Other›`, "dotted"), row(`${name} -> ‹Other› ;‹label›`, "with a label"),
  ],
};

const CYNEFIN_DOMAINS = ["complex", "complicated", "clear", "chaotic", "confusion"];
const CYNEFIN = {
  nameWord: "domain",
  names: () => CYNEFIN_DOMAINS,
  starts: [row("title ‹text›", "a title"), ...CYNEFIN_DOMAINS.map((domain) => row(lines(domain, "    \"‹item›\""), `the ${domain} domain`)),
    row("    \"‹item›\"", "an item in the domain above")],
  after: (name, names) => [
    ...others(names, name).map((other) => row(`${name} --> ${other} : "‹why›"`, "a move")),
    row(lines(name, "    \"‹item›\""), "with an item"),
  ],
};

const USECASE = {
  nameWord: "actor",
  names: (body) => matchesIn(body, /^\s*actor\s+(.+)$/g).flatMap((list) => list.split(",")).map((name) => name.trim()),
  starts: [
    row("actor ‹Name›", "an actor"), row("‹Actor› --> \"‹use case›\"", "takes part in"),
    row(lines("systemBoundary ‹Name›", "    \"‹use case›\"", "end"), "the system's edge"), row("direction LR", "left to right"),
    row("classDef ‹name› fill:‹colour›", "a style class"), row("style ‹id› fill:‹colour›", "one element's style"),
  ],
  after: (name, names) => [
    row(`${name} --> "‹use case›"`, "takes part in"), ...others(names, name).map((other) => row(`${name} --|> ${other}`, "is a kind of")),
    row(`${name} ..> "‹use case›"`, "depends on"), row(`${name} -- "‹use case›"`, "a plain line"),
  ],
};

const ruleNames = (assign) => (body) => matchesIn(body, new RegExp(`^\\s*([A-Za-z_][\\w-]*)\\s*${assign}`, "g"));
const RAILROAD_FORMS = [
  row("sequence(‹a›, ‹b›)", "one after the other"), row("choice(‹a›, ‹b›)", "one of"), row("optional(‹a›)", "maybe"),
  row("oneOrMore(‹a›)", "one or more"), row("zeroOrMore(‹a›)", "any number"), row("terminal(\"‹text›\")", "literal text"),
  row("nonterminal(\"‹rule›\")", "another rule"), row("special(\"‹text›\")", "a special part"),
];
// After "=", "(" or ",": the expression being written.
const afterOperator = (pattern, label) => (before) => {
  const found = pattern.exec(before);
  return found ? { token: found[1], label } : null;
};
const RAILROAD = {
  names: ruleNames("="),
  starts: [row("‹rule› = sequence(‹a›, ‹b›);", "a rule"), row("title ‹text›", "a title")],
  inline: afterOperator(/[=(,]\s*([A-Za-z]*)$/, "in an expression"),
  inlineRows: () => RAILROAD_FORMS,
};
const EBNF = {
  names: ruleNames("(?:=|::=)"),
  starts: [row("‹rule› = ‹definition› ;", "a rule"), row("title ‹text›", "a title")],
  inline: afterOperator(/(?:=|::=|[|,([{])\s*([A-Za-z"]*)$/, "in a definition"),
  inlineRows: (names) => [
    row("\"‹text›\"", "literal text"), row("[ ‹optional› ]", "maybe"), row("{ ‹repeated› }", "any number"), row("( ‹group› )", "a group"),
    row("‹a› | ‹b›", "one of"), row("? ‹special› ?", "a special sequence"), ...names.map((name) => row(name, "a rule")),
  ],
};
const ABNF = {
  names: ruleNames("="),
  starts: [row("‹rule› = ‹definition› ;", "a rule"), row("title ‹text›", "a title")],
  inline: afterOperator(/(?:=|[/(\[]|\s)\s*([A-Za-z"%*0-9]*)$/, "in a definition"),
  inlineRows: (names) => [
    row("\"‹text›\"", "literal text"), row("[ ‹optional› ]", "maybe"), row("*‹element›", "any number"), row("1*‹element›", "one or more"),
    row("( ‹group› )", "a group"), row("%x‹41›", "a character by number"), row("‹a› / ‹b›", "one of"), ...names.map((name) => row(name, "a rule")),
  ],
};
const PEG = {
  names: ruleNames("<-"),
  starts: [row("‹rule› <- ‹definition› ;", "a rule"), row("title ‹text›", "a title")],
  inline: afterOperator(/(?:<-|[/(]|\s)\s*([A-Za-z"&!.]*)$/, "in a definition"),
  inlineRows: (names) => [
    row("\"‹text›\"", "literal text"), row("‹e›?", "maybe"), row("‹e›*", "any number"), row("‹e›+", "one or more"),
    row("&‹e›", "followed by"), row("!‹e›", "not followed by"), row("( ‹group› )", "a group"), row(".", "any character"),
    row("‹a› / ‹b›", "the first that fits"), ...names.map((name) => row(name, "a rule")),
  ],
};

// Tables needing the block's lines (the next free bit, the next frame number) are made here.
export function syntaxFor(type, body) {
  const syntax = SYNTAX[type?.id] ?? {};
  if (syntax === PACKET) {
    const next = packetNext(body);
    return { ...PACKET, starts: [row(`${next}-${next + 15}: "‹field›"`, "the next 16 bits"), row(`${next}: "‹flag›"`, "the next bit"),
      row("+‹8›: \"‹field›\"", "the next bits, by count"), row("title ‹text›", "a title")] };
  }
  if (syntax === EVENTMODELING) {
    const frame = nextFrame(body);
    return { ...EVENTMODELING, starts: [
      ...[["ui", "a screen"], ["cmd", "a command"], ["evt", "an event"], ["rmo", "a read model"], ["pcr", "a processor"]]
        .map(([kind, words]) => row(`tf ${frame} ${kind} ‹Name›`, `${words} in the next time frame`)),
      row(`rf ${frame} evt ‹Name›`, "a reset frame"), row("entity ‹Name›", "an entity"),
      row(lines("data ‹Name› {", "    ‹fields›", "}"), "data"), row(lines("note ‹frame› {", "    ‹text›", "}"), "a note on a frame"),
      row("gwt ‹frame› given evt ‹Entity› then evt ‹Entity›", "given, when, then"), row("title ‹text›", "a title"),
    ] };
  }
  return syntax;
}

const SYNTAX = {
  flowchart: FLOWCHART, "flowchart-elk": FLOWCHART, "swimlane-beta": FLOWCHART, "agentflow-beta": FLOWCHART,
  sequenceDiagram: SEQUENCE, gantt: GANTT, "stateDiagram-v2": STATE, erDiagram: ER, classDiagram: CLASS, mindmap: MINDMAP,
  timeline: TIMELINE, journey: JOURNEY, pie: PIE, quadrantChart: QUADRANT, requirementDiagram: REQUIREMENT, gitGraph: GITGRAPH,
  C4Context: C4, "sankey-beta": SANKEY, "xychart-beta": XYCHART, "block-beta": BLOCK, "packet-beta": PACKET, kanban: KANBAN,
  "architecture-beta": ARCHITECTURE, "treemap-beta": TREEMAP, "radar-beta": RADAR, eventmodeling: EVENTMODELING,
  "treeView-beta": TREEVIEW, ishikawa: ISHIKAWA, "venn-beta": VENN, "wardley-beta": WARDLEY, "cynefin-beta": CYNEFIN,
  "usecase-beta": USECASE, "railroad-beta": RAILROAD, "railroad-ebnf-beta": EBNF, "railroad-abnf-beta": ABNF, "railroad-peg-beta": PEG,
};
