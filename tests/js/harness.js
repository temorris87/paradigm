// A tiny test harness: register tests, run them, show the results on the page.
// document.title becomes "PASS n" or "FAIL n/m" so a headless run can read the outcome.

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assertEqual(actual, expected, message = "") {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`.trim());
  }
}

export function assertTrue(value, message = "expected true") {
  if (!value) throw new Error(message);
}

export async function run(output) {
  let failed = 0;
  for (const { name, fn } of tests) {
    const row = document.createElement("li");
    try {
      await fn();
      row.className = "pass";
      row.textContent = `ok   ${name}`;
    } catch (error) {
      failed += 1;
      row.className = "fail";
      row.textContent = `FAIL ${name}: ${error.message}`;
    }
    output.append(row);
  }
  const summary = failed ? `FAIL ${failed}/${tests.length}` : `PASS ${tests.length}`;
  document.title = summary;
  output.before(Object.assign(document.createElement("h2"), { textContent: summary }));
}
