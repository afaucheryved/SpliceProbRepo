import { html } from "../../lib/preact.js";

export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return html`
    <div class="error-banner" role="alert">
      <span>⚠ ${message}</span>
      ${onDismiss ? html`<button type="button" class="error-banner__dismiss" onClick=${onDismiss}>&times;</button>` : null}
    </div>
  `;
}

export function Spinner({ label = "Working…" }) {
  return html`<div class="spinner"><span class="spinner__dot"></span>${label}</div>`;
}

export function StatTile({ label, value, sublabel, tone = "neutral" }) {
  return html`
    <div class="stat-tile stat-tile--${tone}">
      <div class="stat-tile__value">${value}</div>
      <div class="stat-tile__label">${label}</div>
      ${sublabel ? html`<div class="stat-tile__sublabel">${sublabel}</div>` : null}
    </div>
  `;
}

export function Badge({ children, tone = "neutral" }) {
  return html`<span class="badge badge--${tone}">${children}</span>`;
}
