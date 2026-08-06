import { html } from "./lib/preact.js";
import { PipelineView } from "./views/pipeline/PipelineView.js";
import { useTheme, toggleTheme } from "./lib/theme.js";
import { workspace } from "./lib/workspace.js";

const DEFAULT_SAMPLE = "acgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgtacgt";

export function App() {
  const theme = useTheme();

  return html`
    <header class="app-header">
      <div class="app-header__brand">
        <span class="app-header__title">SpliceProb</span>
      </div>
      <div class="app-header__controls">
        <button
          type="button"
          class="btn btn--small"
          title="Create a brand-new session with the default sample sequence"
          onClick=${() => workspace.initSession(DEFAULT_SAMPLE)}
        >
          New session
        </button>
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
      <${PipelineView} />
    </main>
  `;
}
