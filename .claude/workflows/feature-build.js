export const meta = {
  name: 'feature-build',
  description: 'Build an approved Paradigm feature spec: lanes, integrate, gate, review + docs, fixes, browser check, close',
  whenToUse: 'Started by the /feature skill once Tyson has approved a spec in docs/features/. Args: {slug, spec, today, lanes, item, integrate?, startAt?, root?, merge?}. feature-batch passes root (the feature worktree) and merge: false.',
  phases: [
    { title: 'Baseline', detail: 'the gate on the tree before any change' },
    { title: 'Implement', detail: 'backend and frontend lanes side by side' },
    { title: 'Integrate', detail: 'join both halves against the API contract' },
    { title: 'Gate', detail: 'tools/pipeline_gate.py' },
    { title: 'Review', detail: 'correctness + rules reviewers, each finding verified; then re-checks of the fixes only' },
    { title: 'Fix', detail: 'owning lane fixes confirmed findings (at most 3 rounds)' },
    { title: 'Browser', detail: 'acceptance checks on generated data' },
    { title: 'Docs', detail: 'after the last fix, with what the fixes changed' },
    { title: 'Close', detail: 'backlog check-off and the ledger closed' },
  ],
}

const MAX_FIX_ROUNDS = 3
const { slug, spec, today, item } = args
const lanes = args.lanes && args.lanes.length ? args.lanes : ['backend', 'frontend']
// The integrator joins two lanes against the API contract; with one lane, or a contract with no
// new or changed route, there is nothing to join (the /feature skill passes integrate: false).
const integrate = args.integrate === undefined ? lanes.length > 1 : !!args.integrate
// Resume a feature from a phase instead of building it again: implement (default), gate,
// browser, docs or close. The ledger still needs every phase fresh, so the skill picks the
// earliest one the code has moved past.
const STARTS = ['implement', 'gate', 'browser', 'docs', 'close']
const startAt = args.startAt || 'implement'
if (!STARTS.includes(startAt)) throw new Error(`startAt must be one of ${STARTS.join(', ')}`)
const from = p => STARTS.indexOf(startAt) <= STARTS.indexOf(p)
const PY = 'python3 (python on Windows)'
// In a batch, the feature is built in its own git worktree (root), not in the main tree, and
// every agent is told so: their tools start in the main tree. Without root, nothing changes.
const root = args.root ? String(args.root).replace(/[\\/]+$/, '') : ''
const where = root
  ? `Work only in the git worktree ${root}: read and edit files there by absolute path, and run every ` +
    `command as \`cd ${root} && ...\`. Paths below are relative to it. Never read from or write to the ` +
    `main tree: another feature may be building there.\n`
  : ''
const here = root ? `cd ${root} && ` : ''
// merge: false (a batch) commits the feature on its own branch and leaves backlog.md to the
// merger, so ten branches don't all edit the same file.
const merge = args.merge === undefined ? true : !!args.merge

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
          severity: { type: 'string', enum: ['important', 'nit'], description: 'important blocks the feature; nit goes into the report' },
        },
        required: ['file', 'summary', 'failure_scenario', 'severity'],
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
const CLOSED = {
  type: 'object',
  properties: {
    committed: { type: 'boolean' },
    sha: { type: 'string', description: 'the new commit, when committed' },
    output: { type: 'string', description: 'what the commands printed' },
  },
  required: ['committed', 'output'],
}
const BROWSER = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['browser', 'api'], description: 'browser: driven in a real browser; api: no driver, API and modules only' },
    checked: { type: 'array', items: { type: 'string' }, description: 'each check, how it was checked, what happened' },
    problems: { type: 'array', items: { type: 'string' } },
    not_checked: { type: 'array', items: { type: 'string' }, description: 'left for Tyson, Windows-only behaviour included' },
  },
  required: ['mode', 'checked', 'problems', 'not_checked'],
}

const specLine = `${where}The feature is "${item}". Its approved spec is ${spec} (slug ${slug}); read it first.`
const report = { slug, spec, startAt, lanes: {}, rounds: [], nits: [], docs: null, browser: null }
// Fix rounds since the last review (what they were to fix, the files they changed), for the
// re-check; and whether the whole change has had its one full review yet.
let pending = []
let reviewed = false

function ledger(phase, status, note) {
  return agent(
    `${where}Run exactly this from the repo root and return its output: ` +
    `${here}${PY} tools/pipeline_state.py record ${phase} ${status} --note ${JSON.stringify(note || '')}`,
    { label: `ledger: ${phase} ${status}`, effort: 'low' })
}

async function blocked(phase, why) {
  await ledger(phase, 'blocked', why)
  log(`Blocked at ${phase}: ${why}`)
  return { status: 'blocked', phase, why, ...report }
}

function laneFor(path) {
  const file = root && path.startsWith(root + '/') ? path.slice(root.length + 1) : path
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
  const fixes = results.filter(Boolean)
  report.rounds.push({ round, source, problems, fixes })
  pending.push({ round, source, problems, files: [...new Set(fixes.flatMap(f => f.files || []))] })
  await ledger('fix', 'pass', `round ${round}: ${problems.length} from ${source}`)
}

function runGate() {
  return agent(
    `${where}Run \`${here}${PY} tools/pipeline_gate.py\` from the repo root (it can take a few minutes) and report whether ` +
    `it printed GATE PASS, and every FAIL line with the lines under it. Change nothing.`,
    { label: 'gate', phase: 'Gate', schema: GATE, effort: 'low' })
}

// The first review reads the whole change and reports everything at once; after a fix round it
// is a re-check: those findings fixed, and nothing new and important in the files the fix touched.
function review() {
  const reviewers = [
    { type: 'reviewer-correctness', what: 'correctness against the spec' },
    { type: 'reviewer-rules', what: "the project's standing rules" },
  ]
  const recheck = reviewed && pending.length > 0
  const problems = pending.flatMap(f => f.problems)
  const files = [...new Set(pending.flatMap(f => f.files))]
  const ask = r => recheck
    ? `${specLine}\nThis is a re-check after fix round(s) ${pending.map(f => f.round).join(', ')}, for ${r.what}. ` +
      `The findings they were to fix:\n${JSON.stringify(problems, null, 2)}\n` +
      `The files they changed: ${JSON.stringify(files)}. Check only that each is fixed and the fixes bring no new important problem.`
    : `${specLine}\nReview the feature's change for ${r.what}. Report every problem in this one pass, each with its severity.`
  reviewed = true
  pending = []
  return pipeline(
    reviewers,
    r => agent(ask(r),
      { agentType: r.type, label: recheck ? `${r.type} (re-check)` : r.type, phase: 'Review', schema: FINDINGS }),
    (found, r) => parallel((found ? found.findings : []).map((f, i) => () =>
      agent(
        `${specLine}\nA reviewer (${r.type}) reports this problem. Try to refute it: read the code, ` +
        `and check whether the failure scenario really happens or the rule is really broken. ` +
        `real=false if you cannot confirm it.\n${JSON.stringify(f, null, 2)}`,
        { agentType: r.type, label: `verify ${r.type} #${i + 1}`, phase: 'Review', schema: VERDICT })
        .then(v => (v && v.real ? { ...f, reviewer: r.type, why: v.reason } : null)))),
  ).then(rows => rows.flat().filter(Boolean))
}

if (from('implement')) {
  // Baseline: a gate that already fails before any change is not this feature's to fix in its
  // rounds. One fix outside the round count; if it is still red, Tyson decides.
  phase('Baseline')
  let base = await runGate()
  if (!base || !base.passed) {
    log('the tree fails the gate before the feature: one fix outside the rounds')
    await fix((base ? base.failures : ['the gate did not run']).map(f =>
      ({ file: '', summary: `already failing before this feature: ${f}`, failure_scenario: f, severity: 'important' })), 0, 'baseline')
    pending = []
    base = await runGate()
    if (!base || !base.passed) return await blocked('implement', 'the gate fails before any change, and one fix did not clear it: ' +
      (base ? base.failures.slice(0, 3).join(' | ') : 'the gate did not run'))
  }

  // Implement: both lanes at once; they own disjoint files.
  phase('Implement')
  const laneResults = await parallel(lanes.map(lane => () =>
    agent(`${specLine}\nBuild your lane of it.`,
      { agentType: `feature-${lane}`, label: lane, phase: 'Implement', schema: LANE })))
  lanes.forEach((lane, i) => { report.lanes[lane] = laneResults[i] })
  if (laneResults.some(r => !r)) return await blocked('implement', 'a lane did not finish')

  phase('Integrate')
  if (integrate) {
    const integration = await agent(
      `${specLine}\nThe lanes reported:\n${JSON.stringify(report.lanes, null, 2)}\nJoin them against the contract.`,
      { agentType: 'feature-integrator', label: 'integrate', phase: 'Integrate' })
    report.integration = integration
    if (!integration) return await blocked('integrate', 'the integrator did not finish')
  } else {
    await ledger('implement', 'pass', `${lanes.join(' + ')} built`)
    await ledger('integrate', 'pass', 'nothing to join: one lane, or no new or changed route')
  }
}

let round = 0

// The gate, then the review: true when both pass; false after a fix round (go round again).
async function gateAndReview() {
  phase('Gate')
  const gate = await runGate()
  if (!gate || !gate.passed) {
    if (round >= MAX_FIX_ROUNDS) throw await blocked('gate', `still failing after ${round} fix rounds`)
    round += 1
    await fix((gate ? gate.failures : ['the gate did not run']).map(f => ({ file: '', summary: f, failure_scenario: f, severity: 'important' })), round, 'gate')
    return false
  }

  phase('Review')
  const confirmed = await review()
  const important = confirmed.filter(f => f.severity !== 'nit')
  if (important.length) {
    log(`${important.length} important finding(s), ${confirmed.length - important.length} nit(s)`)
    if (round >= MAX_FIX_ROUNDS) throw await blocked('review', `${important.length} important finding(s) left after ${round} fix rounds`)
    round += 1
    // Nits found beside important findings ride along in the same round, at no extra cost.
    await fix(confirmed, round, 'review')
    return false
  }
  report.nits.push(...confirmed)
  await ledger('review', 'pass', (round ? `clean after ${round} fix round(s)` : 'clean') +
    (confirmed.length ? `; ${confirmed.length} nit(s) left for Tyson` : ''))
  return true
}

// Gate, review and the browser check, with fixes in between, until all pass or rounds run out.
// A block is thrown as the workflow's answer, so it comes back from here as one.
try {
  let skipToBrowser = startAt === 'browser'
  while (from('browser')) {
    if (!skipToBrowser && !(await gateAndReview())) continue
    skipToBrowser = false

    phase('Browser')
    const browser = await agent(`${specLine}\nWalk its acceptance checks in the running app.`,
      { agentType: 'browser-verifier', label: 'browser', phase: 'Browser', schema: BROWSER })
    report.browser = browser
    if (!browser || browser.problems.length) {
      if (round >= MAX_FIX_ROUNDS) throw await blocked('browser', 'problems left after the fix rounds')
      round += 1
      await fix((browser ? browser.problems : ['the browser check did not run']).map(p => ({ file: '', summary: p, failure_scenario: p, severity: 'important' })), round, 'browser')
      continue
    }
    break
  }
} catch (stop) {
  if (stop && stop.status === 'blocked') return stop
  throw stop
}

// Docs last, so they describe the code after every fix (a fix can change the contract).
if (from('docs')) {
  phase('Docs')
  const changes = report.rounds.map(r => ({ round: r.round, from: r.source,
    fixed: r.problems.map(p => p.summary), changed: r.fixes.map(f => f.summary) }))
  report.docs = await agent(
    `${specLine}\nDocument it as built. Today is ${today}.\n` +
    (changes.length ? `What the fix rounds changed after the lanes:\n${JSON.stringify(changes, null, 2)}` : 'There were no fix rounds.'),
    { agentType: 'docs-writer', label: 'docs', phase: 'Docs', schema: DOCS })
  if (!report.docs) return await blocked('docs', 'the docs step did not finish')
}

phase('Close')
const close = await agent(merge
  ? `In backlog.md, change exactly this item's "- [ ]" to "- [x]" and add " (done ${today})" at the end of its ` +
    `last line, changing nothing else in the file: "${item}". Then run ` +
    `\`${PY} tools/pipeline_state.py record close pass --note "backlog checked off"\` and ` +
    `\`${PY} tools/pipeline_state.py finish\`, and return their output.`
  : `${where}This feature is part of a batch: leave backlog.md alone (the merger ticks it). Run these in order ` +
    `and return their output:\n` +
    `1. \`${here}${PY} tools/pipeline_state.py record close pass --note "built on its branch"\`\n` +
    `2. \`${here}git add -A\`, then commit with \`git -C ${root} commit -F <a message file in your scratchpad>\`. ` +
    `Write the message in the style of \`git log --oneline -5\`: a short subject saying what the feature does, ` +
    `a blank line, a line or two of detail, and the commit attribution lines your instructions give. Never name ` +
    `the employer. The commit hook runs the gate on the worktree.\n` +
    `3. \`${here}${PY} tools/pipeline_state.py finish\`\n` +
    `If the commit is refused, stop there: don't run finish, and return committed=false with the hook's message.`,
  merge ? { label: 'close', phase: 'Close', effort: 'low' }
    : { label: 'close', phase: 'Close', effort: 'low', schema: CLOSED })
report.close = close
if (!merge && (!close || !close.committed)) return await blocked('close', 'the commit on the feature branch was refused: ' +
  (close ? close.output.slice(0, 400) : 'the close step did not finish'))
return { status: 'done', fix_rounds: round, ...report }
