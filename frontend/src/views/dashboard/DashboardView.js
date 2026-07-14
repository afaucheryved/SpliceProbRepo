import { html, useState } from "../../lib/preact.js";
import { SessionBar } from "../../components/shared/SessionBar.js";
import { MutationManager } from "./panels/MutationManager.js";
import { GenomeTrack } from "./panels/GenomeTrack.js";
import { DeltaSummary } from "./panels/DeltaSummary.js";
import { ZonePanel } from "./panels/ZonePanel.js";
import { AlterationToolbox } from "./panels/AlterationToolbox.js";
import { HistoryLog } from "./panels/HistoryLog.js";

// Proposal 2: a dense, IGV/genome-browser-style multi-panel workbench.
// Everything a researcher might want is visible simultaneously instead of
// being staged through a sequential recipe (contrast with Proposal 1).
export function DashboardView() {
  const [zoneHighlights, setZoneHighlights] = useState([]);

  return html`
    <div class="dashboard-view">
      <div class="dashboard-view__session">
        <${SessionBar} compact=${true} />
      </div>
      <div class="dashboard-view__grid">
        <div class="dashboard-view__col dashboard-view__col--left">
          <${MutationManager} />
          <${AlterationToolbox} />
        </div>
        <div class="dashboard-view__col dashboard-view__col--center">
          <${GenomeTrack} highlightRanges=${zoneHighlights} />
          <${ZonePanel} onPositions=${setZoneHighlights} />
        </div>
        <div class="dashboard-view__col dashboard-view__col--right">
          <${DeltaSummary} />
          <${HistoryLog} />
        </div>
      </div>
    </div>
  `;
}
