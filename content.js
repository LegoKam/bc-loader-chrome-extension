// ============================================================
// Brand Concierge Injector - content.js
// Mirrors the pattern from ao_concierge_demo.html:
//   - Alloy stub + CDN scripts loaded eagerly in background
//   - FAB button → modal dialog on click
//   - BC bootstrapped once on first FAB click
// All brand strings and credentials come from the options page.
// ============================================================

// ── Defaults (used when nothing is stored in options) ─────────
const DEFAULT_ALLOY_CDN = "https://cdn1.adoberesources.net/alloy/2.32.0/alloy.min.js";
const DEFAULT_BC_CDN    = "https://experience.adobe.net/solutions/experience-platform-brand-concierge-web-agent/static-assets/main.js";
const DEFAULT_EDGE_DOMAIN = "edge.adobedc.net";

// Populated by waitForBridgeConfig() before init runs
let _storedConfig = {};

// Read config written by config-bridge.js (isolated world) into the
// data-bc-config attribute on <html>. Both worlds share the DOM so
// no script execution — and no CSP issues — are involved.
function readDomConfig() {
  try {
    const raw = document.documentElement.getAttribute("data-bc-config");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// Poll until the attribute appears (chrome.storage.local.get is async so
// it may not be written yet when document_end fires).
function waitForBridgeConfig(maxWaitMs = 2000) {
  return new Promise((resolve) => {
    const immediate = readDomConfig();
    if (immediate) { resolve(immediate); return; }

    const interval = setInterval(() => {
      const result = readDomConfig();
      if (result !== null) {
        clearInterval(interval);
        clearTimeout(giveUp);
        resolve(result);
      }
    }, 50);

    const giveUp = setTimeout(() => {
      clearInterval(interval);
      console.warn("[Hyundai BC] Config bridge timed out — using empty config.");
      resolve({});
    }, maxWaitMs);
  });
}

const CHAT_ICON_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
  <path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/>
</svg>`;

const SPARKLE_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2L13.5 9.5L21 11L13.5 12.5L12 20L10.5 12.5L3 11L10.5 9.5L12 2Z"
        fill="url(#bc-sparkle-grad)" stroke="url(#bc-sparkle-grad)" stroke-width="0.5"
        stroke-linejoin="round"/>
  <path d="M19 2L19.75 5.25L23 6L19.75 6.75L19 10L18.25 6.75L15 6L18.25 5.25L19 2Z"
        fill="url(#bc-sparkle-grad2)" stroke-linejoin="round"/>
  <defs>
    <linearGradient id="bc-sparkle-grad" x1="3" y1="2" x2="21" y2="20" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#e8445a"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
    <linearGradient id="bc-sparkle-grad2" x1="15" y1="2" x2="23" y2="10" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#e8445a"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
</svg>`;

const ARROW_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M9 18l6-6-6-6" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// ── CDN loading ───────────────────────────────────────────────

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("[BC] Failed to load: " + src));
    document.head.appendChild(s);
  });
}

function initAlloyStub() {
  if (window.__alloyNS) return;
  (function (n, o) {
    o.forEach(function (o) {
      n[o] || (
        (n.__alloyNS = n.__alloyNS || []).push(o),
        (n[o] = function () {
          var u = arguments;
          return new Promise(function (i, l) { n[o].q.push([i, l, u]); });
        }),
        (n[o].q = [])
      );
    });
  })(window, ["alloy"]);
}

// Kicked off after bridge config is received; awaited before BC bootstrap
let _setupPromise = null;
function ensureSetup() {
  if (!_setupPromise) {
    _setupPromise = (async () => {
      const ac = _storedConfig.alloyConfig || {};

      const alloyCdn = _storedConfig.bcMainJsUrl
        ? DEFAULT_ALLOY_CDN                              // always use stable Alloy CDN
        : DEFAULT_ALLOY_CDN;
      const bcCdn = _storedConfig.bcMainJsUrl || DEFAULT_BC_CDN;

      initAlloyStub();
      await loadScript(alloyCdn);
      await loadScript(bcCdn);

      if (!ac.datastreamId || !ac.orgId) {
        throw new Error(
          "[BC] datastreamId and orgId must be set in the extension options page before use."
        );
      }

      await alloy("configure", {
        defaultConsent:           ac.defaultConsent           ?? "in",
        edgeDomain:               ac.edgeDomain               ?? DEFAULT_EDGE_DOMAIN,
        edgeBasePath:             ac.edgeBasePath             ?? "ee",
        datastreamId:             ac.datastreamId,
        orgId:                    ac.orgId,
        debugEnabled:             ac.debugEnabled             ?? true,
        idMigrationEnabled:       ac.idMigrationEnabled       ?? false,
        thirdPartyCookiesEnabled: ac.thirdPartyCookiesEnabled ?? false,
        prehidingStyle: ".personalization-container { opacity: 0 !important }",
      });

      await alloy("sendEvent", {});
      console.log("[BC] Alloy configured →", ac.edgeDomain ?? DEFAULT_EDGE_DOMAIN);
    })();
  }
  return _setupPromise;
}

// ── HTML injection ────────────────────────────────────────────

function injectUI() {
  if (document.getElementById("bc-fab-button")) return;

  const brandName = _storedConfig.brandName || "AI Concierge";

  // FAB — inserted at the target XPath, falling back to body
  const fab = document.createElement("button");
  fab.id = "bc-fab-button";
  fab.setAttribute("aria-label", `Open ${brandName}`);
  fab.innerHTML = `
    <span class="bc-fab-inner">
      <span class="bc-fab-sparkle">${SPARKLE_SVG}</span>
      <span class="bc-fab-label">Ask a question</span>
      <span class="bc-fab-arrow">${ARROW_SVG}</span>
    </span>
  `;
  document.body.appendChild(fab);

  // Backdrop + modal — always appended to body
  document.body.insertAdjacentHTML("beforeend", `
    <div id="bc-modal-backdrop"></div>

    <div id="bc-chat-modal" role="dialog" aria-modal="true" aria-label="${brandName}">
      <div class="bc-modal-hdr">
        <div class="bc-modal-hdr__left">
          <div class="bc-modal-hdr__icon">${CHAT_ICON_SVG}</div>
          <span class="bc-modal-hdr__title">${brandName}</span>
        </div>
        <div class="bc-modal-hdr__controls">
          <button id="bc-btn-close" class="bc-ctrl-btn" title="Close" aria-label="Close chat">&#x00D7;</button>
        </div>
      </div>
      <div class="bc-modal-body">
        <div id="brand-concierge-mount"></div>
      </div>
    </div>
  `);
}

// ── State machine (fab ↔ chat) ────────────────────────────────

let currentState = "fab";
let bcInitialized = false;

function setState(newState) {
  currentState = newState;
  const fab      = document.getElementById("bc-fab-button");
  const modal    = document.getElementById("bc-chat-modal");
  const backdrop = document.getElementById("bc-modal-backdrop");

  if (newState === "fab") {
    fab.classList.remove("bc-hidden");
    modal.classList.remove("bc-visible");
    backdrop.classList.remove("bc-visible");
  } else {
    fab.classList.add("bc-hidden");
    modal.classList.add("bc-visible");
    backdrop.classList.add("bc-visible");
  }
}

function bootstrapBC() {
  if (bcInitialized) {
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return;
  }

  if (!window.adobe?.concierge?.bootstrap) {
    console.error("[BC] Brand Concierge client not loaded.");
    return;
  }

  const styleConfig = _storedConfig.styleConfig || null;

  window.adobe.concierge.bootstrap({
    instanceName: "alloy",
    stylingConfigurations: styleConfig,
    selector: "#brand-concierge-mount",
    stickySession: false,
  });

  bcInitialized = true;
  console.log("[BC] Brand Concierge bootstrapped");
}

async function handleFabClick() {
  setState("chat");
  try {
    await ensureSetup();
    bootstrapBC();
  } catch (err) {
    console.error("[BC] Setup failed:", err);
  }
}

function handleClose() {
  setState("fab");
}

// ── Event wiring ──────────────────────────────────────────────

function initEventListeners() {
  document.getElementById("bc-fab-button").addEventListener("click", handleFabClick);
  document.getElementById("bc-btn-close").addEventListener("click", handleClose);
  document.getElementById("bc-modal-backdrop").addEventListener("click", handleClose);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && currentState !== "fab") handleClose();
  });
}

// ── Theme application ─────────────────────────────────────────
// Called AFTER injectUI() so elements exist.
// Two-pronged: sets CSS custom properties on :root (for var()
// references in injected.css) AND applies inline styles directly
// via element.style — the latter is always CSP-safe and wins
// regardless of any host-page CSS variable conflicts.

function applyTheme() {
  const theme = _storedConfig.styleConfig?.theme;
  if (!theme) return;

  const primary     = theme["--color-button-submit"]       || theme["--color-primary"];
  const primaryDark = theme["--color-button-submit-hover"] || primary;
  const font        = theme["--font-family"]               || "'Trebuchet MS', Arial, sans-serif";
  const text        = theme["--color-text"]                || "#1f2937";

  // 1. CSS custom properties on :root (drives var() in injected.css)
  const root = document.documentElement;
  root.style.setProperty("--bc-primary",      primary);
  root.style.setProperty("--bc-primary-dark", primaryDark);
  root.style.setProperty("--bc-font",         font);
  root.style.setProperty("--bc-text",         text);

  // 2. Direct element styles — definitive, CSP-safe, never overridden
  const q = (sel) => document.querySelector(sel);
  const hdr       = q("#bc-chat-modal .bc-modal-hdr");
  const hdrIcon   = q("#bc-chat-modal .bc-modal-hdr__icon");
  const hdrTitle  = q("#bc-chat-modal .bc-modal-hdr__title");
  const fabLabel  = q("#bc-fab-button .bc-fab-label");
  const toast     = document.getElementById("bc-status-toast");

  if (hdr)      { hdr.style.background   = primary; }
  if (hdrIcon)  { hdrIcon.style.background = primaryDark; }
  if (hdrTitle) { hdrTitle.style.fontFamily = font; }
  if (fabLabel) { fabLabel.style.fontFamily = font; fabLabel.style.color = text; }
  if (toast)    { toast.style.background = primary; }

  console.log("[BC] Theme applied →", { primary, primaryDark, font });
}

// ── Toast notification ────────────────────────────────────────

function showStatusToast() {
  const brandName = _storedConfig.brandName || "AI Concierge";
  const theme     = _storedConfig.styleConfig?.theme;
  const primary   = theme?.["--color-button-submit"] || theme?.["--color-primary"] || null;

  const toast = document.createElement("div");
  toast.id = "bc-status-toast";
  toast.textContent = `✓ ${brandName} extension loaded`;
  if (primary) toast.style.background = primary;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ── Bootstrap ─────────────────────────────────────────────────

async function init() {
  // Receive stored config from the isolated-world bridge before doing anything
  _storedConfig = await waitForBridgeConfig();

  // Only inject on the configured site domain
  const siteDomain = _storedConfig.siteDomain;
  if (siteDomain && !window.location.hostname.endsWith(siteDomain)) return;

  injectUI();        // create DOM elements first
  applyTheme();      // then style them from stored theme config
  initEventListeners();
  setState("fab");
  showStatusToast();

  // Pre-load Alloy + BC scripts in background so the first click is instant
  ensureSetup().catch((err) =>
    console.warn("[BC] Background pre-load failed:", err)
  );

  console.log("[BC] UI injected and ready", _storedConfig);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
