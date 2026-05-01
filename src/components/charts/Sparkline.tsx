/**
 * Tiny line sparkline. Numeric range is provided externally so callers can decide
 * whether to normalize per-row (Portfolio default) or share a domain across rows.
 */

import { useMemo } from 'react';
import * as d3 from 'd3';

interface Props {
  values: ReadonlyArray<number | null>;
  width: number;
  height: number;
  color: string;
  domain?: [number, number];
}

export default function Sparkline({ values, width, height, color, domain }: Props) {
  const path = useMemo(() => {
    if (values.length === 0) return '';
    const positives = values.filter((v): v is number => v !== null);
    if (positives.length === 0) return '';
    const [lo, hi] = domain ?? [Math.min(...positives), Math.max(...positives)];
    const span = hi - lo || 1;

    const x = d3
      .scaleLinear()
      .domain([0, values.length - 1])
      .range([1, width - 1]);
    const y = d3
      .scaleLinear()
      .domain([lo, hi === lo ? lo + span : hi])
      .range([height - 1, 1]);

    return (
      d3
        .line<number | null>()
        .defined((v): v is number => v !== null)
        .x((_, i) => x(i))
        .y((v) => y(v as number))(values as Array<number | null>) ?? ''
    );
  }, [values, width, height, domain]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth={1.25} />
    </svg>
  );
}
