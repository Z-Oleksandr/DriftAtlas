import type { EdgeEncoding } from '../../data/selectors/forceGraphEdges';
import styles from './ForceGraph.module.css';

interface Props {
  /** Min/max weight in the current metric — drives slider bounds. */
  range: { min: number; max: number };
  threshold: number;
  setThreshold: (v: number) => void;
  encoding: EdgeEncoding;
  setEncoding: (e: EdgeEncoding) => void;
  repulsion: number;
  setRepulsion: (v: number) => void;
  hasPins: boolean;
  clearPins: () => void;
}

const REPULSION_MIN = -300;
const REPULSION_MAX = -20;

function formatNumber(v: number): string {
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export default function ForceGraphControls({
  range,
  threshold,
  setThreshold,
  encoding,
  setEncoding,
  repulsion,
  setRepulsion,
  hasPins,
  clearPins,
}: Props) {
  const sliderDisabled = encoding === 'all-weighted' || range.max <= 0;

  return (
    <div className={styles.controls}>
      <div className={styles.controlGroup}>
        <span>edges:</span>
        <div className={styles.encodingGroup} role="tablist" aria-label="Edge encoding">
          <button
            type="button"
            role="tab"
            aria-selected={encoding === 'mergeable'}
            className={
              encoding === 'mergeable'
                ? `${styles.encodingBtn} ${styles.encodingBtnActive}`
                : styles.encodingBtn
            }
            onClick={() => setEncoding('mergeable')}
          >
            mergeable
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={encoding === 'all-weighted'}
            className={
              encoding === 'all-weighted'
                ? `${styles.encodingBtn} ${styles.encodingBtnActive}`
                : styles.encodingBtn
            }
            onClick={() => setEncoding('all-weighted')}
          >
            all-weighted
          </button>
        </div>
      </div>

      <div className={styles.controlGroup}>
        <label htmlFor="fdg-threshold">threshold:</label>
        <input
          id="fdg-threshold"
          type="range"
          min={0}
          max={range.max > 0 ? range.max : 1}
          step={range.max > 10 ? 1 : 0.1}
          value={threshold}
          disabled={sliderDisabled}
          onChange={(e) => setThreshold(Number(e.target.value))}
        />
        <span className={styles.reading}>{formatNumber(threshold)}</span>
      </div>

      <div className={styles.controlGroup}>
        <label htmlFor="fdg-repulsion">repulsion:</label>
        <input
          id="fdg-repulsion"
          type="range"
          min={REPULSION_MIN}
          max={REPULSION_MAX}
          step={5}
          value={repulsion}
          onChange={(e) => setRepulsion(Number(e.target.value))}
        />
        <span className={styles.reading}>{repulsion}</span>
      </div>

      {hasPins && (
        <button
          type="button"
          className={styles.encodingBtn}
          style={{ borderRadius: 4, border: '1px solid var(--border)' }}
          onClick={clearPins}
        >
          clear pins
        </button>
      )}
      <span className={styles.pinHint}>drag a node to pin it</span>
    </div>
  );
}
