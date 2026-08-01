// Lazy-loading shim for apple-home-dashboard. This is a hand-maintained
// artifact deployed in place of dist/apple-home-dashboard.js as the public
// Lovelace resource (see deploy notes) — it is NOT part of the webpack build.
//
// HA's dashboard strategy resolution already tolerates async registration:
// static generateDashboard() may return a Promise, and HA looks up the
// strategy element synchronously by tag (ll-strategy-dashboard-<type>) before
// calling it — the comment in src/apple-home-strategy.ts documents this same
// behavior ("Timeout waiting for strategy element..." implies a wait, not an
// immediate failure). That means registering these tags immediately (this
// stub is tiny — no fetch needed to do that) and deferring the real ~209KB
// gzipped bundle to the first call of generateDashboard() is safe: it only
// fires when a dashboard actually using this strategy is opened, whether
// that's a cold page load or client-side SPA navigation (HA reruns
// generateDashboard on every navigation to a strategy-backed dashboard, not
// just once), and it never fires at all on dashboards that don't reference
// this strategy (cats/security/energy/blink-gallery).
const IMPL_URL = "/local/community/apple-home-dashboard/apple-home-dashboard-impl.js?v=__V__";

let implPromise = null;
function loadImpl() {
  if (!implPromise) {
    implPromise = import(IMPL_URL);
  }
  return implPromise;
}

class AppleHomeStrategyLoader extends HTMLElement {
  static async generateDashboard(info) {
    await loadImpl();
    const RealStrategy = customElements.get("ll-strategy-dashboard-apple-home-strategy-impl");
    return RealStrategy.generateDashboard(info);
  }
}

if (!customElements.get("ll-strategy-dashboard-apple-home-strategy")) {
  customElements.define("ll-strategy-dashboard-apple-home-strategy", AppleHomeStrategyLoader);
}
if (!customElements.get("ll-strategy-apple-home-strategy")) {
  customElements.define("ll-strategy-apple-home-strategy", class extends AppleHomeStrategyLoader {});
}

if (window.customCards) {
  window.customCards.push({
    type: "custom:apple-home-strategy",
    name: "Apple Home Strategy",
    description: "Apple Home-style dashboard strategy with stateless architecture",
    preview: false,
  });
}

window.customStrategies = window.customStrategies || [];
window.customStrategies.push({
  type: "apple-home-strategy",
  strategyType: "dashboard",
  name: "Apple Home Dashboard",
  description: "Apple Home-style dashboard auto-generated from your Home Assistant entities.",
  documentationURL: "https://github.com/nitaybz/apple-home-dashboard",
});
