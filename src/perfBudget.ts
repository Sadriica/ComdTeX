/**
 * Time budget for performance tests, by kind of run:
 * - `npm run test:perf` (CI step): timing tests alone, one file at a time and
 *   uninstrumented, so the strict number applies;
 * - a normal parallel `vitest run`: test files share the CPU, so the budget is
 *   tripled to catch gross regressions without flaking;
 * - under coverage every line is instrumented and timings mean nothing: the
 *   code still runs, the timing check is waived.
 */
export function perfBudget(ms: number): number {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env
  if (env?.COMDTEX_TEST_RUN === "coverage") return Number.POSITIVE_INFINITY
  if (env?.COMDTEX_TEST_RUN === "perf") return ms
  return ms * 3
}
