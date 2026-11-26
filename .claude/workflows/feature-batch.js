export const meta = {
  name: 'feature-batch',
  description: 'Build up to 10 approved Paradigm specs side by side, each in its own worktree, then merge them into one branch',
  whenToUse: 'Started by the /features skill once Tyson has approved a batch plan and the worktrees exist. Args: {today, main, features: [{slug, spec, item, lanes, integrate?, worktree, branch}], overlaps: [{features, files, why}], merge: {worktree, branch}}.',
  phases: [
    { title: 'Build', detail: 'feature-build per feature, each in its own worktree' },
    { title: 'Merge', detail: 'the merger joins every built branch, in backlog order' },
    { title: 'Re-review', detail: 'conflict and overlap files on the merged branch' },
    { title: 'Re-check', detail: 'browser checks of the features the merge touched' },
    { title: 'Close', detail: 'backlog ticked, merge report, batch ledger' },
  ],
}

const MAX_FEATURES = 10
const MAX_MERGE_FIXES = 2
const { today, main, features } = args
const overlaps = args.overlaps || []
const target = args.merge
if (!features || !features.length) throw new Error('no features given')
if (features.length > MAX_FEATURES) throw new Error(`a batch holds at most ${MAX_FEATURES} features`)
const PY = 'python3 (python on Windows)'
const inMerge = `Work only in the git worktree ${target.worktree} (branch ${target.branch}): read and edit files there ` +
  `by absolute path, and run every command as \`cd ${target.worktree} && ...\`. Never write to the main tree ${main} ` +
  `or to a feature's worktree.\n`

const MERGED = {
  type: 'object',
  properties: {
    merged: { type: 'array', items: { type: 'string' }, description: 'slugs merged, in order' },
    left_out: {
      type: 'array',
      items: { type: 'object', properties: { slug: { type: 'string' }, why: { type: 'string' } }, required: ['slug', 'why'] },
    },
    conflicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' }, features: { type: 'array', items: { type: 'string' } }, resolution: { type: 'string' },
        },
        required: ['file', 'features', 'resolution'],
      },
    },
    renumbered: { type: 'array', items: { type: 'string' }, description: 'migrations renumbered, old -> new, with the feature' },
    gate: { type: 'object', properties: { passed: { type: 'boolean' }, failures: { type: 'array', items: { type: 'string' } } }, required: ['passed', 'failures'] },
    files: { type: 'array', items: { type: 'string' }, description: 'every file you changed by hand (conflicts, renumbering, fixes)' },
  },
  required: ['merged', 'left_out', 'conflicts', 'renumbered', 'gate', 'files'],
}
const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' }, line: { type: 'integer' }, summary: { type: 'string' },
          failure_scenario: { type: 'string' }, severity: { type: 'string', enum: ['important', 'nit'] },
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
const BROWSER = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['browser', 'api'] },
    checked: { type: 'array', items: { type: 'string' } },
    problems: { type: 'array', items: { type: 'string' } },
    not_checked: { type: 'array', items: { type: 'string' } },
  },
  required: ['mode', 'checked', 'problems', 'not_checked'],
}

function batchLedger(command) {
  return agent(`Run exactly this and return its output: cd ${main} && ${PY} tools/pipeline_batch.py ${command}`,
    { label: `batch: ${command.split(' --note')[0]}`, effort: 'low' })
}

// Build: every feature runs the whole single-feature pipeline in its own worktree. They share
// nothing but the machine, so a feature that blocks doesn't hold up the others.
phase('Build')
log(`building ${features.length} feature(s) side by side`)
const built = await pipeline(features,
  f => workflow('feature-build', {
    slug: f.slug, spec: f.spec, today, item: f.item, lanes: f.lanes, integrate: f.integrate,
    root: f.worktree, merge: false,
  }),
  async (result, f) => {
    const done = result && result.status === 'done'
    const why = result ? (result.why || '') : 'feature-build did not finish'
    await batchLedger(`set ${f.slug} ${done ? 'built' : 'blocked'} --note ${JSON.stringify(done ? `${result.fix_rounds} fix round(s)` : `${result && result.phase}: ${why}`)}`)
    return { slug: f.slug, status: done ? 'built' : 'blocked', result }
  })
const outcomes = features.map((f, i) => built[i] || { slug: f.slug, status: 'blocked', result: null })
const ready = features.filter((f, i) => outcomes[i].status === 'built')
const report = { features: outcomes, merge: null, review: [], nits: [], browser: [], close: null }
if (!ready.length) {
  log('no feature was built: nothing to merge')
  await batchLedger(`merge blocked --note "no feature was built"`)
  return { status: 'blocked', why: 'no feature was built', ...report }
}

// Merge: one agent joins the built branches in backlog order, with every spec to hand.
phase('Merge')
await batchLedger('merge running --note "merging"')
const merged = await agent(
  `${inMerge}Merge these feature branches into ${target.branch}, in this order (backlog order). Each one ` +
  `was built and checked on its own, from the same main.\n` +
  JSON.stringify(ready.map(f => ({ slug: f.slug, branch: f.branch, spec: f.spec, worktree: f.worktree, item: f.item })), null, 2) +
  `\nThe plan expected these overlaps between them:\n${JSON.stringify(overlaps, null, 2)}\n` +
  `Up to ${MAX_MERGE_FIXES} fix rounds per merge for a red gate.`,
  { agentType: 'feature-merger', label: 'merge', phase: 'Merge', schema: MERGED })
report.merge = merged
if (!merged) {
  await batchLedger('merge blocked --note "the merger did not finish"')
  return { status: 'blocked', why: 'the merger did not finish', ...report }
}
for (const out of merged.left_out) {
  await batchLedger(`set ${out.slug} blocked --note ${JSON.stringify('left out of the merge: ' + out.why)}`)
}
if (!merged.gate.passed || !merged.merged.length) {
  const why = merged.merged.length ? 'the gate fails on the merged branch: ' + merged.gate.failures.slice(0, 3).join(' | ') : 'nothing could be merged'
  await batchLedger(`merge blocked --note ${JSON.stringify(why)}`)
  return { status: 'blocked', why, ...report }
}

// Re-review only what the merge could have broken: files with a resolved conflict, files the
// merger changed, and the files the plan said two features share. The rest passed on its branch.
const touched = [...new Set([
  ...merged.conflicts.map(c => c.file), ...merged.files,
  ...overlaps.flatMap(o => o.files || []),
])]
const hit = new Set([
  ...merged.conflicts.flatMap(c => c.features),
  ...overlaps.flatMap(o => o.features || []),
].filter(slug => merged.merged.includes(slug)))

async function rereview(round) {
  const reviewers = ['reviewer-correctness', 'reviewer-rules']
  const specs = ready.filter(f => hit.has(f.slug)).map(f => `${f.slug}: ${f.spec}`).join('; ')
  const rows = await pipeline(reviewers,
    type => agent(
      `${inMerge}This is a merge re-check (round ${round}) of a batch of features, each already reviewed on its own ` +
      `branch. Review only these files on the merged branch, for what joining the features could break (a key ` +
      `table, a registration, a migration or a doc that now holds both): ${JSON.stringify(touched)}.\n` +
      `The specs of the features they belong to: ${specs || 'see docs/features/'}. How the conflicts were ` +
      `resolved:\n${JSON.stringify(merged.conflicts, null, 2)}`,
      { agentType: type, label: `${type} (merge ${round})`, phase: 'Re-review', schema: FINDINGS }),
    (found, type) => parallel((found ? found.findings : []).map((f, i) => () =>
      agent(`${inMerge}A reviewer (${type}) reports this problem on the merged branch. Try to refute it: real=false ` +
        `if you cannot confirm it.\n${JSON.stringify(f, null, 2)}`,
        { agentType: type, label: `verify merge #${i + 1}`, phase: 'Re-review', schema: VERDICT })
        .then(v => (v && v.real ? { ...f, reviewer: type, why: v.reason } : null)))))
  return rows.flat().filter(Boolean)
}

let mergeRound = 0
if (touched.length) {
  phase('Re-review')
  while (true) {
    const confirmed = await rereview(mergeRound + 1)
    const important = confirmed.filter(f => f.severity !== 'nit')
    report.review.push({ round: mergeRound + 1, confirmed })
    if (!important.length) { report.nits.push(...confirmed); break }
    if (mergeRound >= MAX_MERGE_FIXES) {
      const why = `${important.length} important finding(s) left on the merged branch after ${mergeRound} fix round(s)`
      await batchLedger(`merge blocked --note ${JSON.stringify(why)}`)
      return { status: 'blocked', why, ...report }
    }
    mergeRound += 1
    const fixed = await agent(
      `${inMerge}Fix round ${mergeRound} on the merged branch. Fix each of these, run the gate ` +
      `(\`${PY} tools/pipeline_gate.py\`), and commit the fix on ${target.branch} (the commit hook runs the gate):\n` +
      JSON.stringify(important, null, 2),
      { agentType: 'feature-merger', label: `merge fix ${mergeRound}`, phase: 'Re-review', schema: MERGED })
    if (!fixed || !fixed.gate.passed) {
      const why = 'a merge fix left the gate red' + (fixed ? ': ' + fixed.gate.failures.slice(0, 3).join(' | ') : '')
      await batchLedger(`merge blocked --note ${JSON.stringify(why)}`)
      return { status: 'blocked', why, ...report }
    }
    touched.push(...fixed.files.filter(f => !touched.includes(f)))
  }
}

// Browser re-check, only for the features the merge touched: the others passed on their branch
// and nothing of theirs changed. Each check runs on its own port and temporary data.
if (hit.size) {
  phase('Re-check')
  const checks = await pipeline(ready.filter(f => hit.has(f.slug)),
    f => agent(
      `${inMerge}This is a re-check of "${f.item}" after it was merged with other features; its spec is ${f.spec}. ` +
      `Walk its acceptance checks in the running app. Don't record a phase in pipeline_state.py: the merged ` +
      `branch has no feature in progress. Report as usual.`,
      { agentType: 'browser-verifier', label: `browser: ${f.slug}`, phase: 'Re-check', schema: BROWSER })
      .then(b => ({ slug: f.slug, ...(b || { mode: 'api', checked: [], problems: ['the browser check did not finish'], not_checked: [] }) })))
  report.browser = checks.filter(Boolean)
  const failing = report.browser.filter(b => b.problems.length)
  if (failing.length) {
    const why = 'browser re-check found problems in ' + failing.map(b => b.slug).join(', ')
    await batchLedger(`merge blocked --note ${JSON.stringify(why)}`)
    return { status: 'blocked', why, ...report }
  }
}

// Close: the backlog is ticked once, on the merged branch, for every feature on it.
phase('Close')
report.close = await agent(
  `${inMerge}The batch is merged and checked. Do these in order and return what each printed:\n` +
  `1. In backlog.md, for each of these items, change its "- [ ]" to "- [x]" and add " (done ${today})" at the end ` +
  `of its last line. Change nothing else in the file: no rewording, no reordering.\n` +
  JSON.stringify(ready.filter(f => merged.merged.includes(f.slug)).map(f => f.item), null, 2) + `\n` +
  `2. Write docs/features/batch-${today}.md: what went in (slug, spec, one line each), what was left out and why, ` +
  `each conflict and how it was resolved, migrations renumbered, and the nits left for Tyson. The facts:\n` +
  JSON.stringify({ merged: merged.merged, left_out: merged.left_out, conflicts: merged.conflicts,
    renumbered: merged.renumbered, nits: report.nits }, null, 2) + `\n` +
  `3. Commit both on ${target.branch} (\`git -C ${target.worktree} commit -F <message file in your scratchpad>\`, ` +
  `subject "Batch ${today}: <n> features merged", ending with the commit attribution lines your instructions give).\n` +
  `4. For each merged slug: \`cd ${main} && ${PY} tools/pipeline_batch.py set <slug> merged\`; then ` +
  `\`cd ${main} && ${PY} tools/pipeline_batch.py merge pass --note "<n> merged, <m> left out"\`.`,
  { label: 'close', phase: 'Close', effort: 'low' })
// partial: the merged ones are ready for main; the rest wait on Tyson (blocked in the batch ledger).
const all = merged.merged.length === features.length
return { status: all ? 'done' : 'partial', merge_fix_rounds: mergeRound, ...report }
