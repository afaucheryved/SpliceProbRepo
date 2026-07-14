import { html, useState } from "./lib/preact.js";
import { SegmentedControl } from "./components/shared/SegmentedControl.js";
import { PipelineView } from "./views/pipeline/PipelineView.js";
import { DashboardView } from "./views/dashboard/DashboardView.js";
import { ComparativeView } from "./views/comparative/ComparativeView.js";
import { useTheme, toggleTheme } from "./lib/theme.js";

const PROPOSALS = [
  { value: "pipeline", label: "Pipeline", hint: "CyberChef-style" },
  { value: "dashboard", label: "Workbench", hint: "Researcher dashboard" },
  { value: "comparative", label: "Compare", hint: "Batch console" },
];

const VIEW_COMPONENTS = {
  pipeline: PipelineView,
  dashboard: DashboardView,
  comparative: ComparativeView,
};

export function App() {
  const [proposal, setProposal] = useState("pipeline");
  const ActiveView = VIEW_COMPONENTS[proposal];
  const theme = useTheme();

  return html`
    <header class="app-header">
      <div class="app-header__brand">
        <span class="app-header__title">SpliceProb</span>
        <span class="app-header__subtitle">Three frontend concepts over the SpliceAI splicing-impact API</span>
      </div>
      <div class="app-header__controls">
        <${SegmentedControl} options=${PROPOSALS} value=${proposal} onChange=${setProposal} />
        <button
          type="button"
          class="btn btn--small theme-toggle"
          title=${theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick=${toggleTheme}
        >
          ${theme === "dark" ? "☀ Light" : "☾ Dark"}
        </button>
      </div>
    </header>
    <main class="app-main">
      <${ActiveView} />
    </main>
  `;
}
