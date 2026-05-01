import { useMemo, useState, type MouseEvent } from 'react';
import * as d3 from 'd3';
import type { DayPoint, RepoTimeSeries } from '../../data/types';
import styles from './DriftTimeSeries.module.css';

interface Props {
  series: RepoTimeSeries;
}

const W = 900;
const H = 360;
const margin = { top: 20, right: 56, bottom: 28, left: 48 };
const innerW = W - margin.left - margin.right;
const innerH = H - margin.top - margin.bottom;

interface Parsed extends DayPoint {
  dateObj: Date;
}

export default function DriftTimeSeries({ series }: Props) {
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

    const lineMax = d3.max(parsed, (d) => d.lineDrift ?? 0) ?? 1;
    const otherMax =
      Math.max(
        d3.max(parsed, (d) => d.conflictDrift ?? 0) ?? 0,
        d3.max(parsed, (d) => d.fileDrift ?? 0) ?? 0,
      ) || 1;

    const yLeft = d3.scaleLinear().domain([0, lineMax * 1.05]).nice().range([innerH, 0]);
    const yRight = d3.scaleLinear().domain([0, otherMax * 1.05]).nice().range([innerH, 0]);

    const lineFor = (
      key: 'lineDrift' | 'conflictDrift' | 'fileDrift',
      y: d3.ScaleLinear<number, number>,
    ) =>
      d3
        .line<Parsed>()
        .defined((d) => d[key] !== null)
        .x((d) => x(d.dateObj))
        .y((d) => y(d[key] as number))(parsed) ?? '';

    // Connector path: a continuous line through only the days that have a value.
    // Drawn behind the solid line; visible only across gaps where the solid path
    // breaks (weekends, missing days). Same endpoints as the solid line, so adjacent
    // weekday segments are covered.
    const connectorFor = (
      key: 'lineDrift' | 'conflictDrift' | 'fileDrift',
      y: d3.ScaleLinear<number, number>,
    ) => {
      const defined = parsed.filter((d) => d[key] !== null);
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
      pathLine: lineFor('lineDrift', yLeft),
      pathConflict: lineFor('conflictDrift', yRight),
      pathFile: lineFor('fileDrift', yRight),
      gapLine: connectorFor('lineDrift', yLeft),
      gapConflict: connectorFor('conflictDrift', yRight),
      gapFile: connectorFor('fileDrift', yRight),
      ticksX: x.ticks(8),
      ticksLeft: yLeft.ticks(5),
      ticksRight: yRight.ticks(5),
    };
  }, [parsed]);

  const [hover, setHover] = useState<Parsed | null>(null);
  const fmtTick = d3.timeFormat('%b %d');

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

  const hoverX = hover ? scales.x(hover.dateObj) : null;

  return (
    <div className={styles.wrap}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg}>
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
                  {t}
                </text>
              </g>
            ))}
            <line y1={0} y2={innerH} />
          </g>

          <g className={styles.axis} transform={`translate(${innerW},0)`}>
            {scales.ticksRight.map((t, i) => (
              <g key={i} transform={`translate(0,${scales.yRight(t)})`}>
                <line x2={6} />
                <text x={10} dy="0.32em" textAnchor="start">
                  {t}
                </text>
              </g>
            ))}
            <line y1={0} y2={innerH} />
          </g>

          <g className={styles.axis} transform={`translate(0,${innerH})`}>
            <line x1={0} x2={innerW} />
            {scales.ticksX.map((t, i) => (
              <g key={i} transform={`translate(${scales.x(t)},0)`}>
                <line y2={6} />
                <text y={18} textAnchor="middle">
                  {fmtTick(t)}
                </text>
              </g>
            ))}
          </g>

          <path d={scales.gapLine} className={styles.lineDriftGap} />
          <path d={scales.gapConflict} className={styles.conflictDriftGap} />
          <path d={scales.gapFile} className={styles.fileDriftGap} />
          <path d={scales.pathLine} className={styles.lineDrift} />
          <path d={scales.pathConflict} className={styles.conflictDrift} />
          <path d={scales.pathFile} className={styles.fileDrift} />

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
        <span className={styles.legendItem} title="Driftool runs on working days only; dotted segments bridge weekend / non-analyzed gaps and are not measured values.">
          <span className={`${styles.swatch} ${styles.gapSwatch}`} /> dotted = gap (e.g. no data on weekends)
        </span>
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
