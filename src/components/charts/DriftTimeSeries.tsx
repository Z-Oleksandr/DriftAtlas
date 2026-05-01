/**
 * Triple-drift time series with activity overlay (commit bars + release event lines).
 *
 * - Three drift metrics (line / conflict / file) plotted on dual y-axis.
 * - Solid lines break at null values (weekends, non-analysis days); a dotted connector
 *   bridges the gap so the eye can follow the trend without claiming measured data
 *   in the gap (rule §14.6).
 * - Default y-scale is log per rule §10.3, with a linear toggle.
 * - Commits rendered as a thin bar strip below the drift area, sharing the x-axis.
 * - Releases rendered as vertical event lines spanning both areas.
 * - Click on an analyzed day fires `onDayClick` so the parent route can navigate.
 */

import { useMemo, useState, type MouseEvent } from 'react';
import * as d3 from 'd3';
import type { DayPoint, RepoTimeseries } from '../../data/types';
import styles from './DriftTimeSeries.module.css';

interface Props {
  series: RepoTimeseries;
  onDayClick?: (date: string) => void;
  isDayAnalyzed?: (date: string) => boolean;
}

const W = 920;
const H = 440;
const margin = { top: 22, right: 60, bottom: 30, left: 50 };
const innerW = W - margin.left - margin.right;
const innerH = H - margin.top - margin.bottom;
const COMMITS_H = 60;
const GAP_H = 14;
const DRIFT_H = innerH - COMMITS_H - GAP_H;

interface Parsed extends DayPoint {
  dateObj: Date;
}

type DriftKey = 'lineDrift' | 'conflictDrift' | 'fileDrift';
type ScaleMode = 'log' | 'linear';

function makeYScale(
  mode: ScaleMode,
  values: number[],
  range: [number, number],
): d3.ScaleContinuousNumeric<number, number> {
  const positive = values.filter((v) => v > 0);
  if (positive.length === 0) {
    return d3.scaleLinear().domain([0, 1]).range(range);
  }
  if (mode === 'log') {
    const min = Math.min(...positive);
    const max = Math.max(...positive);
    return d3
      .scaleLog()
      .domain([Math.max(min * 0.9, 1e-3), max * 1.1])
      .range(range);
  }
  const max = Math.max(...positive);
  return d3
    .scaleLinear()
    .domain([0, max * 1.05])
    .nice()
    .range(range);
}

export default function DriftTimeSeries({ series, onDayClick, isDayAnalyzed }: Props) {
  const [scaleMode, setScaleMode] = useState<ScaleMode>('log');

  const parsed = useMemo<Parsed[]>(
    () =>
      series.days.map((d) => ({
        ...d,
        dateObj: new Date(`${d.date}T00:00:00`),
      })),
    [series],
  );

  const scales = useMemo(() => {
    const x = d3
      .scaleTime()
      .domain(d3.extent(parsed, (d) => d.dateObj) as [Date, Date])
      .range([0, innerW]);

    const lineValues = parsed.map((d) => d.lineDrift).filter((v): v is number => v !== null);
    const otherValues = parsed
      .flatMap((d) => [d.conflictDrift, d.fileDrift])
      .filter((v): v is number => v !== null);

    const yLeft = makeYScale(scaleMode, lineValues, [DRIFT_H, 0]);
    const yRight = makeYScale(scaleMode, otherValues, [DRIFT_H, 0]);

    const maxCommits = Math.max(0, ...parsed.map((d) => d.commits ?? 0));
    const yCommits = d3
      .scaleLinear()
      .domain([0, Math.max(maxCommits, 1)])
      .range([0, COMMITS_H]);

    const lineFor = (key: DriftKey, y: typeof yLeft) =>
      d3
        .line<Parsed>()
        .defined((d) => d[key] !== null && (scaleMode !== 'log' || (d[key] as number) > 0))
        .x((d) => x(d.dateObj))
        .y((d) => y(d[key] as number))(parsed) ?? '';

    const connectorFor = (key: DriftKey, y: typeof yLeft) => {
      const defined = parsed.filter(
        (d) => d[key] !== null && (scaleMode !== 'log' || (d[key] as number) > 0),
      );
      return (
        d3
          .line<Parsed>()
          .x((d) => x(d.dateObj))
          .y((d) => y(d[key] as number))(defined) ?? ''
      );
    };

    return {
      x,
      yLeft,
      yRight,
      yCommits,
      maxCommits,
      pathLine: lineFor('lineDrift', yLeft),
      pathConflict: lineFor('conflictDrift', yRight),
      pathFile: lineFor('fileDrift', yRight),
      gapLine: connectorFor('lineDrift', yLeft),
      gapConflict: connectorFor('conflictDrift', yRight),
      gapFile: connectorFor('fileDrift', yRight),
      ticksX: x.ticks(8),
      ticksLeft: yLeft.ticks(scaleMode === 'log' ? 4 : 5),
      ticksRight: yRight.ticks(scaleMode === 'log' ? 4 : 5),
    };
  }, [parsed, scaleMode]);

  const [hover, setHover] = useState<Parsed | null>(null);
  const fmtTick = d3.timeFormat('%b %d');
  const fmtY = d3.format('~g');

  function handleMove(e: MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const px = ratio * innerW;
    const t = scales.x.invert(px);
    let nearest: Parsed | null = null;
    let best = Infinity;
    for (const d of parsed) {
      const diff = Math.abs(d.dateObj.getTime() - t.getTime());
      if (diff < best) {
        best = diff;
        nearest = d;
      }
    }
    setHover(nearest);
  }

  function handleClick() {
    if (!hover || !onDayClick) return;
    if (isDayAnalyzed && !isDayAnalyzed(hover.date)) return;
    onDayClick(hover.date);
  }

  const hoverX = hover ? scales.x(hover.dateObj) : null;
  const hoverIsAnalyzed = hover && (!isDayAnalyzed || isDayAnalyzed(hover.date));
  const cursorClass = hoverIsAnalyzed && onDayClick ? styles.cursorClickable : '';

  const driftBottom = DRIFT_H;
  const commitsTop = DRIFT_H + GAP_H;

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <div className={styles.scaleToggle} role="group" aria-label="Y-axis scale">
          {(['log', 'linear'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={
                m === scaleMode ? `${styles.scaleBtn} ${styles.scaleBtnActive}` : styles.scaleBtn
              }
              onClick={() => setScaleMode(m)}
              aria-pressed={m === scaleMode}
            >
              {m}
            </button>
          ))}
        </div>
        {onDayClick && hoverIsAnalyzed && (
          <span className={styles.clickHint}>click a day to open the day view</span>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className={`${styles.svg} ${cursorClass}`}>
        <text x={margin.left} y={14} className={styles.axisLabel}>
          line drift
        </text>
        <text x={W - margin.right} y={14} textAnchor="end" className={styles.axisLabel}>
          conflict / file drift
        </text>

        <g transform={`translate(${margin.left},${margin.top})`}>
          <g className={styles.axis}>
            {scales.ticksLeft.map((t, i) => (
              <g key={i} transform={`translate(0,${scales.yLeft(t)})`}>
                <line className={styles.gridline} x1={0} x2={innerW} />
                <line x2={-6} />
                <text x={-10} dy="0.32em" textAnchor="end">
                  {fmtY(t)}
                </text>
              </g>
            ))}
            <line y1={0} y2={driftBottom} />
          </g>

          <g className={styles.axis} transform={`translate(${innerW},0)`}>
            {scales.ticksRight.map((t, i) => (
              <g key={i} transform={`translate(0,${scales.yRight(t)})`}>
                <line x2={6} />
                <text x={10} dy="0.32em" textAnchor="start">
                  {fmtY(t)}
                </text>
              </g>
            ))}
            <line y1={0} y2={driftBottom} />
          </g>

          {/* Release event lines, behind the drift paths */}
          {(() => {
            const [d0, d1] = scales.x.domain();
            if (!d0 || !d1) return null;
            const t0 = d0.getTime();
            const t1 = d1.getTime();
            return series.releases.map((r, i) => {
              const t = new Date(`${r.date}T00:00:00`).getTime();
              if (t < t0 || t > t1) return null;
              const xPos = scales.x(new Date(t));
              return (
                <g key={`rel-${i}`} className={styles.release}>
                  <line x1={xPos} x2={xPos} y1={0} y2={innerH} />
                  <title>
                    release {r.tag} on {r.date}
                  </title>
                </g>
              );
            });
          })()}

          {/* drift paths */}
          <path d={scales.gapLine} className={styles.lineDriftGap} />
          <path d={scales.gapConflict} className={styles.conflictDriftGap} />
          <path d={scales.gapFile} className={styles.fileDriftGap} />
          <path d={scales.pathLine} className={styles.lineDrift} />
          <path d={scales.pathConflict} className={styles.conflictDrift} />
          <path d={scales.pathFile} className={styles.fileDrift} />

          {/* x-axis between drift area and commits area */}
          <g className={styles.axis} transform={`translate(0,${driftBottom})`}>
            <line x1={0} x2={innerW} />
            {scales.ticksX.map((t, i) => (
              <g key={i} transform={`translate(${scales.x(t)},0)`}>
                <line y2={4} />
                <text y={16} textAnchor="middle">
                  {fmtTick(t)}
                </text>
              </g>
            ))}
          </g>

          {/* commit bars */}
          <g transform={`translate(0,${commitsTop})`}>
            <text x={-6} y={10} textAnchor="end" className={styles.axisLabel}>
              commits
            </text>
            {parsed.map((d, i) => {
              const c = d.commits ?? 0;
              if (c <= 0) return null;
              const barH = scales.yCommits(c);
              const cx = scales.x(d.dateObj);
              return (
                <rect
                  key={`c-${i}`}
                  x={cx - 1.5}
                  y={COMMITS_H - barH}
                  width={3}
                  height={barH}
                  className={styles.commitBar}
                />
              );
            })}
            <line x1={0} x2={innerW} y1={COMMITS_H} y2={COMMITS_H} className={styles.axis} />
          </g>

          {hoverX !== null && (
            <line x1={hoverX} x2={hoverX} y1={0} y2={innerH} className={styles.guide} />
          )}

          <rect
            x={0}
            y={0}
            width={innerW}
            height={innerH}
            fill="transparent"
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
            onClick={handleClick}
          />
        </g>
      </svg>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.lineDrift}`} /> line drift (left axis)
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.conflictDrift}`} /> conflict drift
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.fileDrift}`} /> file drift
        </span>
        <span
          className={styles.legendItem}
          title="Driftool runs on working days only; dotted segments bridge weekend / non-analyzed gaps and are not measured values."
        >
          <span className={`${styles.swatch} ${styles.gapSwatch}`} /> dotted = gap (no data)
        </span>
        {series.releases.length > 0 && (
          <span
            className={styles.legendItem}
            title={`${series.releases.length} releases marked as vertical event lines.`}
          >
            <span className={`${styles.swatch} ${styles.releaseSwatch}`} /> release
          </span>
        )}
      </div>

      {hover && (
        <div className={styles.tooltip}>
          <div className={styles.tooltipDate}>{hover.date}</div>
          <div>
            <span className={styles.lineDrift}>●</span> line:{' '}
            {hover.lineDrift !== null ? hover.lineDrift.toFixed(2) : '—'}
          </div>
          <div>
            <span className={styles.conflictDrift}>●</span> conflict:{' '}
            {hover.conflictDrift !== null ? hover.conflictDrift.toFixed(3) : '—'}
          </div>
          <div>
            <span className={styles.fileDrift}>●</span> file:{' '}
            {hover.fileDrift !== null ? hover.fileDrift.toFixed(3) : '—'}
          </div>
          <div className={styles.tooltipMeta}>
            commits: {hover.commits ?? 0} · branches: {hover.branchesAnalyzed ?? '—'}
          </div>
        </div>
      )}
    </div>
  );
}
