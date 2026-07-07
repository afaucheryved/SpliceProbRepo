import { render, html } from "./lib/preact.js";
import { App } from "./App.js";

render(html`<${App} />`, document.getElementById("app"));
