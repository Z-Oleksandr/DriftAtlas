/**
 * Pure derivation of a "diff" between two day reports for one metric.
 *
 * Bridges the gap from "drift spiked on Tuesday" to "which branch is responsible":
 * computes signed deltas for the drift scalar, per-branch conflict mass, and
 * pairwise conflict cells; ranks branches by their contribution to the change;
 * and emits a deterministic, template-based attribution headline + bullets.
 *
 * Determinism (rule §3):
 * - No randomness, no clock, no locale-default formatting.
 * - All output arrays sorted via explicit comparators (primary |Δ| desc, tie-break
 *   name/pair lex with `'en-US'` locale fixed).
 * - Numeric formatting goes through `Intl.NumberFormat('en-US', …)` helpers.
 * - Inputs are 6-dp rounded in source JSON; this layer adds no further rounding.
 */

import type { DayReport, DriftMetric } from '../types';
import { summarizeBranches, type BranchSummary } from './dayReport';

const TOP_N_DEFAULT = 10;
/** Pair-map delimiter: 0x01 is not a valid character in a git ref, so it cannot
 *  appear in any branch name and the composite key is collision-proof. */
const PAIR_DELIM = '';

export type BranchDelta =
  | {
      kind: 'persisted';
      name: string;
      deltaMass: number;
      deltaPartners: number;
      fromMass: number;
      toMass: number;
      fromPartners: number;
      toPartners: number;
    }
  | { kind: 'appeared'; name: string; toMass: number; toPartners: number }
  | { kind: 'disappeared'; name: string; fromMass: number; fromPartners: number };

export type PairDelta =
  | { kind: 'new'; a: string; b: string; toWeight: number; deltaWeight: number }
  | { kind: 'gone'; a: string; b: string; fromWeight: number; deltaWeight: number }
  | {
      kind: 'increased';
      a: string;
      b: string;
      fromWeight: number;
      toWeight: number;
      deltaWeight: number;
    }
  | {
      kind: 'decreased';
      a: string;
      b: string;
      fromWeight: number;
      toWeight: number;
      deltaWeight: number;
    };

export interface DriftDiff {
  repo: string;
  from: string;
  to: string;
  metric: DriftMetric;
  driftFrom: number;
  driftTo: number;
  deltaDrift: number;
  /** null iff driftFrom === 0 (division undefined). Templates fall back to the
   *  absolute form in that case. */
  deltaDriftPct: number | null;
  /** Union of `from.branches` and `to.branches`, lex-sorted (en-US). */
  unionBranches: string[];
  branchDeltas: BranchDelta[];
  pairDeltas: PairDelta[];
  topBranches: BranchDelta[];
  topPairs: PairDelta[];
  attribution: { headline: string; bullets: string[] };
}

export interface DiffOptions {
  topN?: number;
}

const numberFmt2 = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});
const numberFmt3 = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 3,
  minimumFractionDigits: 0,
});
const pctFmt = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 0,
});

function formatNumber(x: number, digits: 2 | 3 = 2): string {
  return digits === 3 ? numberFmt3.format(x) : numberFmt2.format(x);
}

function formatPct(x: number): string {
  return pctFmt.format(x);
}

function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? `${singular}s`);
}

function magnitudeOf(d: BranchDelta): number {
  switch (d.kind) {
    case 'persisted':
      return Math.abs(d.deltaMass);
    case 'appeared':
      return d.toMass;
    case 'disappeared':
      return d.fromMass;
  }
}

function nameOf(d: BranchDelta): string {
  return d.name;
}

function pairTieKey(d: PairDelta): string {
  return `${d.a}${PAIR_DELIM}${d.b}`;
}

/** Stable, non-mutating sort: primary `|key|` desc, secondary `tieBreak` asc. */
function sortByAbsDescThenAsc<T>(
  items: readonly T[],
  key: (t: T) => number,
  tieBreak: (t: T) => string,
): T[] {
  return items.slice().sort((a, b) => {
    const diff = Math.abs(key(b)) - Math.abs(key(a));
    if (diff !== 0) return diff;
    return tieBreak(a).localeCompare(tieBreak(b), 'en-US');
  });
}

interface PairEntry {
  a: string;
  b: string;
  weight: number;
}

function buildPairMap(report: DayReport, metric: DriftMetric): Map<string, PairEntry> {
  const map = new Map<string, PairEntry>();
  for (const e of report.edges[metric]) {
    const [a, b] = e.a < e.b ? [e.a, e.b] : [e.b, e.a];
    map.set(`${a}${PAIR_DELIM}${b}`, { a, b, weight: e.weight });
  }
  return map;
}

function buildBranchSummaryMap(
  report: DayReport,
  metric: DriftMetric,
): Map<string, BranchSummary> {
  const map = new Map<string, BranchSummary>();
  for (const s of summarizeBranches(report, metric)) map.set(s.name, s);
  return map;
}

function directionWord(deltaDrift: number): string {
  if (deltaDrift > 0) return 'rose';
  if (deltaDrift < 0) return 'fell';
  return 'held flat';
}

function magnitudeClause(deltaDrift: number, deltaDriftPct: number | null): string {
  if (deltaDriftPct === null) return `by ${formatNumber(Math.abs(deltaDrift), 3)}`;
  return `by ${formatPct(Math.abs(deltaDriftPct))}`;
}

function bulletFor(d: BranchDelta): string {
  switch (d.kind) {
    case 'appeared':
      return `${d.name} — appeared (+${formatNumber(d.toMass)} mass)`;
    case 'disappeared':
      return `${d.name} — disappeared (−${formatNumber(d.fromMass)} mass)`;
    case 'persisted': {
      const sign = d.deltaMass > 0 ? '+' : '−';
      const partners = d.deltaPartners >= 0 ? `+${d.deltaPartners}` : `${d.deltaPartners}`;
      return `${d.name} — ${sign}${formatNumber(Math.abs(d.deltaMass))} mass, ${partners} partners`;
    }
  }
}

function buildAttribution(
  fromDate: string,
  toDate: string,
  metric: DriftMetric,
  deltaDrift: number,
  deltaDriftPct: number | null,
  branchDeltas: readonly BranchDelta[],
): { headline: string; bullets: string[] } {
  const dir = directionWord(deltaDrift);
  const clause = magnitudeClause(deltaDrift, deltaDriftPct);

  const top = branchDeltas[0];
  const topMag = top ? magnitudeOf(top) : 0;

  if (!top || topMag === 0) {
    return {
      headline: `No branches changed between ${fromDate} and ${toDate} on the ${metric} metric.`,
      bullets: [],
    };
  }

  let headline: string;
  if (top.kind === 'appeared') {
    headline =
      top.toPartners > 0
        ? `Drift ${dir} ${clause}: ${top.name} appeared and conflicts with ${top.toPartners} ${pluralize(top.toPartners, 'branch', 'branches')}.`
        : `Drift ${dir} ${clause}: ${top.name} appeared and has no measured conflicts yet.`;
  } else if (top.kind === 'disappeared') {
    headline = `Drift ${dir} ${clause}: ${top.name} disappeared, removing ${top.fromPartners} ${pluralize(top.fromPartners, 'conflict')}.`;
  } else if (top.deltaMass > 0) {
    const newPairs = Math.max(0, top.deltaPartners);
    headline = `Drift ${dir} ${clause}: ${top.name} diverged further (+${formatNumber(top.deltaMass)} conflict mass across ${newPairs} new ${pluralize(newPairs, 'pair')}).`;
  } else {
    headline = `Drift ${dir} ${clause}: ${top.name} converged (−${formatNumber(Math.abs(top.deltaMass))} conflict mass).`;
  }

  const bullets: string[] = [];
  for (let i = 1; i <= 3 && i < branchDeltas.length; i += 1) {
    const d = branchDeltas[i];
    if (!d) continue;
    if (magnitudeOf(d) === 0) break;
    bullets.push(bulletFor(d));
  }
  return { headline, bullets };
}

/** Compute a deterministic diff between two day reports for one metric. */
export function diffDayReports(
  from: DayReport,
  to: DayReport,
  metric: DriftMetric,
  opts?: DiffOptions,
): DriftDiff {
  const topN = opts?.topN ?? TOP_N_DEFAULT;

  const fromMap = buildBranchSummaryMap(from, metric);
  const toMap = buildBranchSummaryMap(to, metric);

  const allNames = new Set<string>();
  for (const n of from.branches) allNames.add(n);
  for (const n of to.branches) allNames.add(n);
  const unionBranches = Array.from(allNames).sort((a, b) => a.localeCompare(b, 'en-US'));

  const branchDeltasUnsorted: BranchDelta[] = [];
  for (const name of unionBranches) {
    const f = fromMap.get(name);
    const t = toMap.get(name);
    if (f && t) {
      branchDeltasUnsorted.push({
        kind: 'persisted',
        name,
        deltaMass: t.conflictMass - f.conflictMass,
        deltaPartners: t.partnerCount - f.partnerCount,
        fromMass: f.conflictMass,
        toMass: t.conflictMass,
        fromPartners: f.partnerCount,
        toPartners: t.partnerCount,
      });
    } else if (t) {
      branchDeltasUnsorted.push({
        kind: 'appeared',
        name,
        toMass: t.conflictMass,
        toPartners: t.partnerCount,
      });
    } else if (f) {
      branchDeltasUnsorted.push({
        kind: 'disappeared',
        name,
        fromMass: f.conflictMass,
        fromPartners: f.partnerCount,
      });
    }
    // else: impossible — name comes from the union of from/to branches.
  }
  const branchDeltas = sortByAbsDescThenAsc(branchDeltasUnsorted, magnitudeOf, nameOf);

  const fromPairs = buildPairMap(from, metric);
  const toPairs = buildPairMap(to, metric);

  const allKeys = new Set<string>();
  for (const k of fromPairs.keys()) allKeys.add(k);
  for (const k of toPairs.keys()) allKeys.add(k);
  const sortedKeys = Array.from(allKeys).sort();

  const pairDeltasUnsorted: PairDelta[] = [];
  for (const k of sortedKeys) {
    const f = fromPairs.get(k);
    const t = toPairs.get(k);
    const fromW = f?.weight ?? 0;
    const toW = t?.weight ?? 0;
    const delta = toW - fromW;
    if (delta === 0) continue;
    const entry = t ?? f;
    if (!entry) continue; // unreachable: at least one side has the key
    const a = entry.a;
    const b = entry.b;
    if (f === undefined) {
      pairDeltasUnsorted.push({ kind: 'new', a, b, toWeight: toW, deltaWeight: delta });
    } else if (t === undefined) {
      pairDeltasUnsorted.push({ kind: 'gone', a, b, fromWeight: fromW, deltaWeight: delta });
    } else if (delta > 0) {
      pairDeltasUnsorted.push({
        kind: 'increased',
        a,
        b,
        fromWeight: fromW,
        toWeight: toW,
        deltaWeight: delta,
      });
    } else {
      pairDeltasUnsorted.push({
        kind: 'decreased',
        a,
        b,
        fromWeight: fromW,
        toWeight: toW,
        deltaWeight: delta,
      });
    }
  }
  const pairDeltas = sortByAbsDescThenAsc(pairDeltasUnsorted, (d) => d.deltaWeight, pairTieKey);

  const driftFrom = from.drift[metric];
  const driftTo = to.drift[metric];
  const deltaDrift = driftTo - driftFrom;
  const deltaDriftPct = driftFrom === 0 ? null : deltaDrift / driftFrom;

  const topBranches = branchDeltas.slice(0, topN);
  const topPairs = pairDeltas.slice(0, topN);

  const attribution = buildAttribution(
    from.date,
    to.date,
    metric,
    deltaDrift,
    deltaDriftPct,
    branchDeltas,
  );

  return {
    repo: from.repo,
    from: from.date,
    to: to.date,
    metric,
    driftFrom,
    driftTo,
    deltaDrift,
    deltaDriftPct,
    unionBranches,
    branchDeltas,
    pairDeltas,
    topBranches,
    topPairs,
    attribution,
  };
}
