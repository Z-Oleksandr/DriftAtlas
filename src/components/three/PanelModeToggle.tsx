/**
 * Tab-style switch between the three left-column visualisations on the Day view:
 * MDS · FDG-2D · FDG-3D. Mirrors the MetricToggle pattern in Day.tsx; reuses
 * the same CSS so the two toolbar widgets line up visually.
 */

import { ALL_PANEL_MODES } from '../../data/types';
import type { PanelMode } from '../../data/types';
import { useDayView } from '../../hooks/useDayView';
import dayStyles from '../../routes/Day.module.css';

const LABEL: Record<PanelMode, string> = {
  mds: 'MDS',
  fdg2d: 'FDG 2D',
  fdg3d: 'FDG 3D',
};

export default function PanelModeToggle() {
  const { panelMode, setPanelMode } = useDayView();
  return (
    <div className={dayStyles.metricGroup} role="tablist" aria-label="Panel view">
      {ALL_PANEL_MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={m === panelMode}
          className={
            m === panelMode
              ? `${dayStyles.metricBtn} ${dayStyles.metricBtnActive}`
              : dayStyles.metricBtn
          }
          onClick={() => setPanelMode(m)}
        >
          {LABEL[m]}
        </button>
      ))}
    </div>
  );
}
