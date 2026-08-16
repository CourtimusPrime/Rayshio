/**
 * React Scan, wired for development only.
 *
 * This module is never imported by application code. `reactScanDev()` in
 * `vite.config.ts` injects it as its own module script ahead of `main.tsx`, and
 * only when Vite is running as a dev server — so there is no import for Rollup
 * to follow when building `web/dist`, and no `import.meta.env.DEV` branch to
 * trust. React Scan cannot reach production because production never references
 * it.
 *
 * The load order matters and is the reason this is a separate script rather
 * than a few lines at the top of `main.tsx`. React Scan instruments React
 * through the DevTools global hook, which has to exist before `react-dom`
 * initialises. Module scripts evaluate in document order, so a script tag
 * placed above the entry point runs first; a dynamic `import()` inside
 * `main.tsx` would resolve a microtask too late and silently instrument
 * nothing.
 *
 * Beyond the on-screen toolbar, every render is aggregated per component and
 * left on `window.__reactScan` so a headless Playwright run can read the same
 * numbers a human reads off the overlay. Screenshots of the overlay prove what
 * a frame looked like; this proves what React actually did.
 */
import { scan } from 'react-scan';

interface ChangeStat {
  /** How many renders carried a change to this prop/state/context entry. */
  count: number;
  /**
   * Of those, how many changed by identity only — a new object, array or
   * function that is equal to the last one in every way that matters. This is
   * the number that names a bug rather than describing normal work.
   */
  unstable: number;
}

interface ComponentStat {
  name: string;
  mounts: number;
  updates: number;
  /** Renders that left the component's DOM subtree byte-identical. */
  unnecessary: number;
  /** Summed self-time in ms; React Scan reports null when it cannot time one. */
  selfTimeMs: number;
  /** Slowest single render, to separate "often" from "expensive". */
  slowestMs: number;
  changes: Record<string, ChangeStat>;
}

interface ScanRender {
  phase: number;
  componentName: string | null;
  time: number | null;
  count: number;
  unnecessary: boolean | null;
  changes?: Array<{ name?: unknown; unstable?: unknown }>;
}

/** RenderPhase.Mount from react-scan's enum — 2 is Update, 4 is Unmount. */
const PHASE_MOUNT = 1;

const stats = new Map<string, ComponentStat>();

function statFor(name: string): ComponentStat {
  let stat = stats.get(name);
  if (!stat) {
    stat = {
      name,
      mounts: 0,
      updates: 0,
      unnecessary: 0,
      selfTimeMs: 0,
      slowestMs: 0,
      changes: {},
    };
    stats.set(name, stat);
  }
  return stat;
}

function record(render: ScanRender): void {
  // An unnamed fiber is a host element or a fragment, not a component anyone
  // can go and fix — folding them all into one "anonymous" bucket would be the
  // largest row in the report and the least actionable.
  const name = render.componentName;
  if (!name) return;

  const stat = statFor(name);
  // `count` is how many renders this entry stands for; React Scan coalesces
  // repeats within a commit, so treating each entry as one render undercounts.
  const times = Math.max(1, render.count || 1);

  if (render.phase === PHASE_MOUNT) stat.mounts += times;
  else stat.updates += times;

  if (render.unnecessary) stat.unnecessary += times;

  const time = render.time ?? 0;
  stat.selfTimeMs += time;
  if (time > stat.slowestMs) stat.slowestMs = time;

  for (const change of render.changes ?? []) {
    const key = typeof change.name === 'string' ? change.name : '(unnamed)';
    const entry = stat.changes[key] ?? { count: 0, unstable: 0 };
    entry.count += 1;
    if (change.unstable) entry.unstable += 1;
    stat.changes[key] = entry;
  }
}

let commits = 0;

scan({
  enabled: true,
  showToolbar: true,
  // The point of this run is finding renders that changed nothing. React Scan
  // does not track them by default because the diff costs real time; here that
  // cost is the deliverable.
  trackUnnecessaryRenders: true,
  onCommitFinish: () => {
    commits += 1;
  },
  onRender: (_fiber, renders) => {
    for (const render of renders) record(render as unknown as ScanRender);
  },
});

interface ScanReport {
  commits: number;
  components: ComponentStat[];
}

declare global {
  interface Window {
    __reactScan?: {
      /** Everything seen so far, worst offender first. */
      report: (sortBy?: 'renders' | 'time') => ScanReport;
      /** Zero the counters — call this between measured interactions. */
      reset: () => void;
    };
  }
}

window.__reactScan = {
  report: (sortBy = 'renders') => ({
    commits,
    components: [...stats.values()].sort((a, b) =>
      sortBy === 'time' ? b.selfTimeMs - a.selfTimeMs : b.updates + b.mounts - (a.updates + a.mounts),
    ),
  }),
  reset: () => {
    stats.clear();
    commits = 0;
  },
};

console.info('[react-scan] instrumented — window.__reactScan.report() for aggregates');
