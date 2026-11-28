// Every diagram type the vendored Mermaid (12.3.0) draws: its keyword, a name and a line about
// it, and a small template that draws as it is. Pure data, plus how Mermaid tells the type from
// a diagram's first keyword line. The words to replace in a template are blanks, ‹like this›;
// they sit only where Mermaid takes free text, so a template left as it is still draws.
//
//   DIAGRAM_TYPES        [{ id, keyword, name, description, template }]
//   MOST_USED            the ids the picker shows first, in its order
//   detectDiagramType(line) -> the type whose detector takes the keyword line, or null
//   diagramFence(type)   the fenced block the picker inserts

// The detectors' order is Mermaid's (the first that matches wins): flowchart-elk before
// flowchart, railroad-beta's never take railroad-ebnf-beta. "info" draws no diagram: left out.
const DETECTORS = [
  ["flowchart-elk", /^\s*flowchart-elk/],
  ["mindmap", /^\s*mindmap/],
  ["architecture-beta", /^\s*architecture/],
  ["agentflow-beta", /^\s*agentflow-beta\b/],
  ["C4Context", /^\s*(C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)/],
  ["kanban", /^\s*kanban/],
  ["classDiagram", /^\s*classDiagram/],
  ["erDiagram", /^\s*erDiagram/],
  ["gantt", /^\s*gantt/],
  ["pie", /^\s*pie/],
  ["requirementDiagram", /^\s*requirement(Diagram)?/],
  ["sequenceDiagram", /^\s*sequenceDiagram/],
  ["swimlane-beta", /^\s*swimlane-beta\b/],
  ["flowchart", /^\s*(graph|flowchart)/],
  ["timeline", /^\s*timeline/],
  ["gitGraph", /^\s*gitGraph/],
  ["stateDiagram-v2", /^\s*stateDiagram/],
  ["journey", /^\s*journey/],
  ["quadrantChart", /^\s*quadrantChart/],
  ["sankey-beta", /^\s*sankey(-beta)?/],
  ["packet-beta", /^\s*packet(-beta)?/],
  ["xychart-beta", /^\s*xychart(-beta)?/],
  ["block-beta", /^\s*block(-beta)?/],
  ["eventmodeling", /^\s*eventmodeling/],
  ["treeView-beta", /^\s*treeView-beta/],
  ["radar-beta", /^\s*radar-beta/],
  ["ishikawa", /^\s*ishikawa(-beta)?\b/i],
  ["treemap-beta", /^\s*treemap/],
  ["railroad-beta", /^\s*railroad-beta/i],
  ["railroad-ebnf-beta", /^\s*railroad-ebnf-beta/i],
  ["railroad-abnf-beta", /^\s*railroad-abnf-beta/i],
  ["railroad-peg-beta", /^\s*railroad-peg-beta/i],
  ["venn-beta", /^\s*venn-beta/],
  ["wardley-beta", /^\s*wardley-beta/i],
  ["cynefin-beta", /^\s*cynefin-beta(?:[\s:]|$)/],
  ["usecase-beta", /^\s*usecase-beta(?:\s|$)/],
];

const lines = (...rows) => rows.join("\n");

// The picker's order: Most used first (MOST_USED), then the rest as listed here.
export const DIAGRAM_TYPES = [
  { id: "flowchart", keyword: "flowchart", name: "Flowchart",
    description: "Boxes joined by arrows: a process, a decision, how things connect.",
    template: lines("flowchart TD", "    A[‹Start›] --> B{‹Question›}", "    B -->|‹yes›| C[‹Do this›]", "    B -->|‹no›| D[‹Do that›]") },
  { id: "sequenceDiagram", keyword: "sequenceDiagram", name: "Sequence",
    description: "Messages between participants, in the order they happen.",
    template: lines("sequenceDiagram", "    participant A as ‹Alice›", "    participant B as ‹Bob›", "    A->>B: ‹Hello›", "    B-->>A: ‹Reply›") },
  { id: "gantt", keyword: "gantt", name: "Gantt",
    description: "Tasks as bars on a calendar, in sections, one after another.",
    template: lines("gantt", "    title ‹Plan›", "    dateFormat YYYY-MM-DD", "    section ‹Phase one›",
      "    ‹First task› :a1, 2026-01-05, 5d", "    ‹Second task› :after a1, 3d") },
  { id: "stateDiagram-v2", keyword: "stateDiagram-v2", name: "State",
    description: "The states something goes through and what moves it on.",
    template: lines("stateDiagram-v2", "    [*] --> Draft", "    Draft --> Review : ‹submit›", "    Review --> Done : ‹approve›", "    Done --> [*]") },
  { id: "erDiagram", keyword: "erDiagram", name: "Entity relationship",
    description: "Entities, their fields and how many of one go with the other.",
    template: lines("erDiagram", "    CUSTOMER ||--o{ ORDER : \"‹places›\"", "    ORDER ||--|{ LINE_ITEM : \"‹contains›\"",
      "    CUSTOMER {", "        string name", "    }") },
  { id: "mindmap", keyword: "mindmap", name: "Mindmap",
    description: "One topic in the middle, ideas branching out by indent.",
    template: lines("mindmap", "  root((‹Topic›))", "    ‹Idea one›", "      ‹Detail›", "    ‹Idea two›") },
  { id: "timeline", keyword: "timeline", name: "Timeline",
    description: "Events by period along a line.",
    template: lines("timeline", "    title ‹History›", "    2025 : ‹Started›", "    2026 : ‹Grew› : ‹Moved›") },
  { id: "classDiagram", keyword: "classDiagram", name: "Class",
    description: "Classes with their fields and methods, and how they relate.",
    template: lines("classDiagram", "    class Animal {", "        +String name", "        +move() void", "    }", "    class Dog",
      "    Animal <|-- Dog : ‹is a›") },
  { id: "journey", keyword: "journey", name: "User journey",
    description: "Steps of a journey in sections, each scored 1 to 5, with who takes part.",
    template: lines("journey", "    title ‹My day›", "    section ‹Morning›", "      ‹Make coffee›: 5: Me", "      ‹Commute›: 2: Me, Colleague") },
  { id: "pie", keyword: "pie", name: "Pie",
    description: "Parts of a whole as slices.",
    template: lines("pie title ‹Time spent›", "    \"‹Meetings›\" : 40", "    \"‹Focus›\" : 45", "    \"‹Email›\" : 15") },
  { id: "quadrantChart", keyword: "quadrantChart", name: "Quadrant",
    description: "Points on two axes, in four quadrants.",
    template: lines("quadrantChart", "    title ‹Effort and impact›", "    x-axis Low effort --> High effort", "    y-axis Low impact --> High impact",
      "    quadrant-1 ‹Plan›", "    quadrant-2 ‹Do now›", "    quadrant-3 ‹Drop›", "    quadrant-4 ‹Delegate›", "    Item A: [0.3, 0.8]") },
  { id: "requirementDiagram", keyword: "requirementDiagram", name: "Requirement",
    description: "Requirements, the elements that meet them, and how they trace.",
    template: lines("requirementDiagram", "    requirement login {", "        id: 1", "        text: \"‹Users sign in›\"", "        risk: medium",
      "        verifymethod: test", "    }", "    element portal {", "        type: \"‹web app›\"", "    }", "    portal - satisfies -> login") },
  { id: "gitGraph", keyword: "gitGraph", name: "Git graph",
    description: "Commits on branches, merged back.",
    template: lines("gitGraph", "    commit", "    branch feature", "    checkout feature", "    commit id: \"‹work›\"", "    checkout main", "    merge feature") },
  { id: "C4Context", keyword: "C4Context", name: "C4 context",
    description: "People and systems and how they use each other (C4 model).",
    template: lines("C4Context", "    title ‹System context›", "    Person(user, \"‹User›\", \"‹Who uses it›\")",
      "    System(app, \"‹App›\", \"‹What it does›\")", "    Rel(user, app, \"‹Uses›\")") },
  { id: "sankey-beta", keyword: "sankey-beta", name: "Sankey",
    description: "Flows from sources to targets, as wide as their amount (CSV lines).",
    template: lines("sankey-beta", "Budget,Salaries,60", "Budget,Tools,25", "Budget,Travel,15") },
  { id: "xychart-beta", keyword: "xychart-beta", name: "XY chart",
    description: "Bars and lines over an x axis.",
    template: lines("xychart-beta", "    title \"‹Sales›\"", "    x-axis [Jan, Feb, Mar]", "    y-axis \"‹Revenue›\" 0 --> 100",
      "    bar [30, 60, 45]", "    line [30, 60, 45]") },
  { id: "block-beta", keyword: "block-beta", name: "Block",
    description: "Blocks laid out in columns, joined by arrows.",
    template: lines("block-beta", "    columns 3", "    a[\"‹One›\"] b[\"‹Two›\"] c[\"‹Three›\"]", "    a --> b") },
  { id: "packet-beta", keyword: "packet-beta", name: "Packet",
    description: "The fields of a network packet by bit.",
    template: lines("packet-beta", "    0-15: \"‹Source port›\"", "    16-31: \"‹Destination port›\"", "    32-63: \"‹Sequence number›\"") },
  { id: "kanban", keyword: "kanban", name: "Kanban",
    description: "Columns of cards.",
    template: lines("kanban", "    todo[‹To do›]", "        t1[‹A task›]", "    doing[‹Doing›]", "        t2[‹Another task›]", "    done[‹Done›]") },
  { id: "architecture-beta", keyword: "architecture-beta", name: "Architecture",
    description: "Services in groups and the lines between them.",
    template: lines("architecture-beta", "    group api(cloud)[‹API›]", "    service db(database)[Database] in api",
      "    service server(server)[Server] in api", "    db:L -- R:server") },
  { id: "treemap-beta", keyword: "treemap-beta", name: "Treemap",
    description: "Nested rectangles, as big as their values.",
    template: lines("treemap-beta", "\"‹Category›\"", "    \"‹Item A›\": 30", "    \"‹Item B›\": 20") },
  { id: "radar-beta", keyword: "radar-beta", name: "Radar",
    description: "Scores on several axes, one curve per option.",
    template: lines("radar-beta", "    axis a[\"‹Speed›\"], b[\"‹Cost›\"], c[\"‹Quality›\"]", "    curve x[\"‹Option›\"]{4, 3, 5}", "    max 5") },
  { id: "flowchart-elk", keyword: "flowchart-elk", name: "Flowchart (ELK layout)",
    description: "A flowchart laid out by ELK, for big graphs.",
    template: lines("flowchart-elk TD", "    A[‹Start›] --> B[‹Next›]", "    B --> C[‹End›]") },
  { id: "agentflow-beta", keyword: "agentflow-beta", name: "Agent flow",
    description: "Steps of an agent's work joined by arrows.",
    template: lines("agentflow-beta", "    A[‹Ask›] --> B[‹Answer›]") },
  { id: "swimlane-beta", keyword: "swimlane-beta", name: "Swimlane",
    description: "A flow split into lanes, one per actor.",
    template: lines("swimlane-beta LR", "    subgraph one[‹Team A›]", "        A[‹Start›]", "    end", "    subgraph two[‹Team B›]",
      "        B[‹Finish›]", "    end", "    A --> B") },
  { id: "eventmodeling", keyword: "eventmodeling", name: "Event modeling",
    description: "Screens, commands and events along a timeline.",
    template: lines("eventmodeling", "tf 01 ui Screen", "tf 02 cmd Submit", "tf 03 evt Submitted") },
  { id: "treeView-beta", keyword: "treeView-beta", name: "Tree view",
    description: "A folder tree by indent.",
    template: lines("treeView-beta", "    ‹project›", "        ‹src›", "            ‹main.js›", "        ‹README.md›") },
  { id: "ishikawa", keyword: "ishikawa", name: "Ishikawa",
    description: "A problem and its causes, as a fishbone.",
    template: lines("ishikawa", "    ‹Problem›", "        ‹People›", "            ‹Training›", "        ‹Process›") },
  { id: "venn-beta", keyword: "venn-beta", name: "Venn",
    description: "Sets that overlap.",
    template: lines("venn-beta", "    set A[\"‹Set A›\"]", "    set B[\"‹Set B›\"]", "    union A,B[\"‹Both›\"]") },
  { id: "wardley-beta", keyword: "wardley-beta", name: "Wardley map",
    description: "Components by how visible and how evolved they are.",
    template: lines("wardley-beta", "    title ‹Value chain›", "    anchor User [0.95, 0.50]", "    component App [0.80, 0.60]",
      "    component Database [0.40, 0.80]", "    User -> App", "    App -> Database") },
  { id: "cynefin-beta", keyword: "cynefin-beta", name: "Cynefin",
    description: "The Cynefin domains with what is in each.",
    template: lines("cynefin-beta", "    title ‹Where we are›", "    complex", "        \"‹Probe, sense, respond›\"", "    clear",
      "        \"‹Best practice›\"", "    complex --> complicated : \"‹Learned›\"") },
  { id: "usecase-beta", keyword: "usecase-beta", name: "Use case",
    description: "Actors and the use cases they take part in.",
    template: lines("usecase-beta", "    actor User", "    User --> \"‹Log in›\"", "    User --> \"‹Order›\"") },
  { id: "railroad-beta", keyword: "railroad-beta", name: "Railroad",
    description: "A grammar drawn as tracks, written as rules of sequence, choice, optional.",
    template: lines("railroad-beta", "    greeting = sequence(terminal(\"‹hello›\"), optional(nonterminal(\"name\")));") },
  { id: "railroad-ebnf-beta", keyword: "railroad-ebnf-beta", name: "Railroad (EBNF)",
    description: "A grammar drawn as tracks, written in EBNF.",
    template: lines("railroad-ebnf-beta", "    greeting = \"hello\" , [ name ] ;", "    name = \"‹world›\" ;") },
  { id: "railroad-abnf-beta", keyword: "railroad-abnf-beta", name: "Railroad (ABNF)",
    description: "A grammar drawn as tracks, written in ABNF.",
    template: lines("railroad-abnf-beta", "    greeting = \"hello\" [name] ;", "    name = \"‹world›\" ;") },
  { id: "railroad-peg-beta", keyword: "railroad-peg-beta", name: "Railroad (PEG)",
    description: "A grammar drawn as tracks, written as a PEG.",
    template: lines("railroad-peg-beta", "    greeting <- \"hello\" name? ;", "    name <- \"‹world›\" ;") },
];

export const MOST_USED = ["flowchart", "sequenceDiagram", "gantt", "stateDiagram-v2", "erDiagram", "mindmap", "timeline"];

const BY_ID = new Map(DIAGRAM_TYPES.map((type) => [type.id, type]));

export function diagramType(id) {
  return BY_ID.get(id) ?? null;
}

/** The type Mermaid reads from a diagram's keyword line, or null. */
export function detectDiagramType(line) {
  const found = DETECTORS.find(([, pattern]) => pattern.test(line ?? ""));
  return found ? BY_ID.get(found[0]) : null;
}

/** The ```mermaid block for a type, its template inside. */
export function diagramFence(type) {
  return `\`\`\`mermaid\n${type.template}\n\`\`\``;
}

/** The picker's rows: Most used, then All, each narrowed to what was typed (a name or a
 * keyword, every word somewhere in it, ignoring case). Pure. */
export function diagramGroups(query = "") {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const fits = (type) => words.every((word) => `${type.name} ${type.keyword}`.toLowerCase().includes(word));
  const most = MOST_USED.map((id) => BY_ID.get(id)).filter(fits);
  const all = DIAGRAM_TYPES.filter((type) => !MOST_USED.includes(type.id) && fits(type));
  return [{ label: "Most used", types: most }, { label: "All", types: all }].filter((group) => group.types.length);
}
