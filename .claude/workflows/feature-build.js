export const meta = {
  name: 'feature-build',
  description: 'Build an approved Paradigm feature spec: lanes, integrate, gate, review + docs, fixes, browser check, close',
  whenToUse: 'Started by the /feature skill once Tyson has approved a spec in docs/features/. Args: {slug, spec, today, lanes, item}.',
  phases: [
    { title: 'Implement', detail: 'backend and frontend lanes side by side' },
    { title: 'Integrate', detail: 'join both halves against the API contract' },
    { title: 'Gate', detail: 'tools/pipeline_gate.py' },
    { title: 'Review', detail: 'correctness + rules reviewers, each finding verified; docs alongside' },
    { title: 'Fix', detail: 'owning lane fixes confirmed findings (at most 3 rounds)' },
    { title: 'Browser', detail: 'acceptance checks on generated data' },
    { title: 'Close', detail: 'backlog check-off and the ledger closed' },
  ],
}

const MAX_FIX_ROUNDS = 3
const { slug, spec, today, item } = args
const lanes = args.lanes && args.lanes.length ? args.lanes : ['backend', 'frontend']
const PY = 'python3 (python on Windows)'

const LANE = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    interpretations: { type: 'array', items: { type: 'string' }, description: 'contract points you had to interpret or the other lane must know' },
    tests: { type: 'string', description: 'test command run and its result' },
  },
  required: ['summary', 'files', 'tests'],
}
const GATE = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    failures: { type: 'array', items: { type: 'string' }, description: 'each FAIL line with its detail lines' },
  },
  required: ['passed', 'failures'],
}
const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          summary: { type: 'string' },
          failure_scenario: { type: 'string', description: 'concrete input or state -> what goes wrong, or the rule broken' },
        },
        required: ['file', 'summary', 'failure_scenario'],
      },
    },
  },
  required: ['findings'],
}
const VERDICT = {
  type: 'object',
  properties: { real: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['real', 'reason'],
}
const DOCS = {
  type: 'object',
  properties: { files: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } },
  required: ['files', 'summary'],
}
const BROWSER = {
  type: 'object',
  properties: {
    checked: { type: 'array', items: { type: 'string' }, description: 'each check, how it was checked, what happened' },
    problems: { type: 'array', items: { type: 'string' } },
    not_checked: { type: 'array', items: { type: 'string' }, description: 'left for Tyson, Windows-only behaviour included' },
  },
  required: ['checked', 'problems', 'not_checked'],
}

const specLine = `The feature is "${item}". Its approved spec is ${spec} (slug ${slug}); read it first.`
const report = { slug, spec, lanes: {}, rounds: [], docs: null, browser: null }

function ledger(phase, status, note) {
  return agent(
    `Run exactly this from the repo root and return its output: ` +
    `${PY} tools/pipeline_state.py record ${phase} ${status} --note ${JSON.stringify(note || '')}`,
    { label: `ledger: ${phase} ${status}`, effort: 'low' })
}

async function blocked(phase, why) {
  await ledger(phase, 'blocked', why)
  log(`Blocked at ${phase}: ${why}`)
  return { status: 'blocked', phase, why, ...report }
}

function laneFor(file) {
  if (file.startsWith('static/') || file.startsWith('tests/js/')) return 'frontend'
  if (file.startsWith('paradigm') || file.startsWith('tests/python/')) return 'backend'
  return 'integrator'
}

async function fix(problems, round, source) {
  const byLane = {}
  for (const p of problems) {
    const lane = laneFor(p.file || '')
    ;(byLane[lane] = byLane[lane] || []).push(p)
  }
  const agentType = { backend: 'feature-backend', frontend: 'feature-frontend', integrator: 'feature-integrator' }
  const results = await parallel(Object.entries(byLane).map(([lane, list]) => () =>
    agent(
      `${specLine}\nFix round ${round} (from ${source}). Fix each of these problems in your own files, ` +
      `re-run your tests, and report:\n${JSON.stringify(list, null, 2)}`,
      { agentType: agentType[lane], label: `fix ${round}: ${lane}`, phase: 'Fix', schema: LANE })))
  report.rounds.push({ round, source, problems, fixes: results.filter(Boolean) })
  await ledger('fix', 'pass', `round ${round}: ${problems.length} from ${source}`)
}

function runGate() {
  return agent(
    `Run \`${PY} tools/pipeline_gate.py\` from the repo root (it can take a few minutes) and report whether ` +
    `it printed GATE PASS, and every FAIL line with the lines under it. Change nothing.`,
    { label: 'gate', phase: 'Gate', schema: GATE, effort: 'low' })
}

function review() {
  const reviewers = [
    { type: 'reviewer-correctness', what: 'correctness against the spec' },
    { type: 'reviewer-rules', what: "the project's standing rules" },
  ]
  return pipeline(
    reviewers,
    r => agent(`${specLine}\nReview the feature's change for ${r.what}.`,
      { agentType: r.type, label: r.type, phase: 'Review', schema: FINDINGS }),
    (found, r) => parallel((found ? found.findings : []).map((f, i) => () =>
      agent(
        `${specLine}\nA reviewer (${r.type}) reports this problem. Try to refute it: read the code, ` +
        `and check whether the failure scenario really happens or the rule is really broken. ` +
        `real=false if you cannot confirm it.\n${JSON.stringify(f, null, 2)}`,
        { agentType: r.type, label: `verify ${r.type} #${i + 1}`, phase: 'Review', schema: VERDICT })
        .then(v => (v && v.real ? { ...f, reviewer: r.type, why: v.reason } : null)))),
  ).then(rows => rows.flat().filter(Boolean))
}

// Implement: both lanes at once; they own disjoint files.
phase('Implement')
const laneResults = await parallel(lanes.map(lane => () =>
  agent(`${specLine}\nBuild your lane of it.`,
    { agentType: `feature-${lane}`, label: lane, phase: 'Implement', schema: LANE })))
lanes.forEach((lane, i) => { report.lanes[lane] = laneResults[i] })
if (laneResults.some(r => !r)) return await blocked('implement', 'a lane did not finish')

phase('Integrate')
const integration = await agent(
  `${specLine}\nThe lanes reported:\n${JSON.stringify(report.lanes, null, 2)}\nJoin them against the contract.`,
  { agentType: 'feature-integrator', label: 'integrate', phase: 'Integrate' })
report.integration = integration
if (!integration) return await blocked('integrate', 'the integrator did not finish')

// Gate, review and the browser check, with fixes in between, until all pass or rounds run out.
let round = 0
let docsStarted = null
while (true) {
  phase('Gate')
  const gate = await runGate()
  if (!gate || !gate.passed) {
    if (round >= MAX_FIX_ROUNDS) return await blocked('gate', `still failing after ${round} fix rounds`)
    round += 1
    await fix((gate ? gate.failures : ['the gate did not run']).map(f => ({ file: '', summary: f, failure_scenario: f })), round, 'gate')
    continue
  }

  phase('Review')
  if (!docsStarted) {
    docsStarted = agent(`${specLine}\nDocument it. Today is ${today}.`,
      { agentType: 'docs-writer', label: 'docs', phase: 'Review', schema: DOCS })
  }
  const confirmed = await review()
  if (confirmed.length) {
    log(`${confirmed.length} confirmed finding(s)`)
    if (round >= MAX_FIX_ROUNDS) return await blocked('review', `${confirmed.length} finding(s) left after ${round} fix rounds`)
    round += 1
    await fix(confirmed, round, 'review')
    continue
  }
  await ledger('review', 'pass', round ? `clean after ${round} fix round(s)` : 'clean')

  phase('Browser')
  const browser = await agent(`${specLine}\nWalk its acceptance checks in the running app.`,
    { agentType: 'browser-verifier', label: 'browser', phase: 'Browser', schema: BROWSER })
  report.browser = browser
  if (!browser || browser.problems.length) {
    if (round >= MAX_FIX_ROUNDS) return await blocked('browser', 'problems left after the fix rounds')
    round += 1
    await fix((browser ? browser.problems : ['the browser check did not run']).map(p => ({ file: '', summary: p, failure_scenario: p })), round, 'browser')
    continue
  }
  break
}

report.docs = await docsStarted
if (!report.docs) return await blocked('docs', 'the docs step did not finish')

phase('Close')
const close = await agent(
  `In backlog.md, change exactly this item's "- [ ]" to "- [x]" and add " (done ${today})" at the end of its ` +
  `last line, changing nothing else in the file: "${item}". Then run ` +
  `\`${PY} tools/pipeline_state.py record close pass --note "backlog checked off"\` and ` +
  `\`${PY} tools/pipeline_state.py finish\`, and return their output.`,
  { label: 'close', phase: 'Close', effort: 'low' })
report.close = close
return { status: 'done', fix_rounds: round, ...report }
