// ============================================================
// Vision Super Assistant - content.js
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

const SEND_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M22 2L11 13" stroke="#374151" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#374151" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const WELCOME = {
  heading: "How can we help?",
  subheading: "Ask your question below and get instant guidance.",
  placeholder: "Ask a question...",
  suggestions: [],
  footer: {
    phone: "",
    phoneHref: "",
    privacyHref: "",
  },
};

function isInlineSite() {
  return false;
}

function getConciergeRoot() {
  return document.getElementById("bc-chat-modal") || document.getElementById("bc-inline-concierge");
}

// Primary Vision Super page target for the inline message text box.
// Use stable live DOM first, then legacy/user-provided fallbacks.
const MESSAGE_BOX_XPATH_CANDIDATES = [
  "/html/body/div[2]/main/div[1]",
  "/html/body/div[1]/main/div[2]",
  "/html/body/div[1]/main/div[1]/div/div[1]",
  "/html/body/div[2]/main/div[2]/div/div[1]/div[1]",
  "//div[@id='main-content']//div[contains(@class,'hero__content')]",
];

let _messageBoxObserver = null;
let _messageBoxReinjectTimer = null;
let _messageBoxInjecting = false;
let _messageBoxFormInView = false;
let _messageBoxFormObserver = null;
let _messageBoxFormObservedEl = null;

function queryByXPath(xpath) {
  try {
    return document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;
  } catch (e) {
    console.warn("[BC] Invalid XPath:", xpath, e);
    return null;
  }
}

function waitForInjectionTarget(selector = ".root.responsivegrid", maxWaitMs = 10000) {
  return new Promise((resolve) => {
    const check = () => document.querySelector(selector);
    const found = check();
    if (found) {
      resolve(found);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = check();
      if (el) {
        observer.disconnect();
        clearTimeout(giveUp);
        resolve(el);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    const giveUp = setTimeout(() => {
      observer.disconnect();
      console.warn("[BC] Injection target not found:", selector);
      resolve(null);
    }, maxWaitMs);
  });
}

function waitForXPathTarget(xpath, maxWaitMs = 10000) {
  return new Promise((resolve) => {
    const check = () => queryByXPath(xpath);
    const found = check();
    if (found) {
      resolve(found);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = check();
      if (el) {
        observer.disconnect();
        clearTimeout(giveUp);
        resolve(el);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    const giveUp = setTimeout(() => {
      observer.disconnect();
      console.warn("[BC] XPath injection target not found:", xpath);
      resolve(null);
    }, maxWaitMs);
  });
}

function getMessageBoxTargetImmediate() {
  for (const xpath of MESSAGE_BOX_XPATH_CANDIDATES) {
    const el = queryByXPath(xpath);
    if (!el) continue;

    // User-requested hero banner anchor: place textbox right after hero.
    if (xpath === "/html/body/div[2]/main/div[1]") {
      return { el, source: `xpath:${xpath}`, position: "afterend" };
    }

    // On live Vision Super home page fallback, inject before Quick links block.
    if (xpath === "/html/body/div[1]/main/div[2]") {
      return { el, source: `xpath:${xpath}`, position: "beforebegin" };
    }

    return { el, source: `xpath:${xpath}`, position: "afterbegin" };
  }

  const selectorFallbacks = [
    "#main-content .hero__content",
    "main .hero__content",
    "main .hero__inner",
    "main",
  ];

  for (const selector of selectorFallbacks) {
    const el = document.querySelector(selector);
    if (el) return { el, source: `selector:${selector}`, position: "afterbegin" };
  }

  return null;
}

function waitForMessageBoxTarget(maxWaitMs = 10000) {
  return new Promise((resolve) => {
    const immediate = getMessageBoxTargetImmediate();
    if (immediate) {
      resolve(immediate);
      return;
    }

    const observer = new MutationObserver(() => {
      const found = getMessageBoxTargetImmediate();
      if (found) {
        observer.disconnect();
        clearTimeout(giveUp);
        resolve(found);
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    const giveUp = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, maxWaitMs);
  });
}

function updateFloatingPillVisibilityForMessageBox() {
  const fab = document.getElementById("bc-fab-button");
  if (!fab || isInlineSite()) return;

  // Hide right-side pill while the inline form is visible.
  const shouldShow = currentState === "fab" && !_messageBoxFormInView;
  fab.classList.toggle("bc-hidden", !shouldShow);
}

function initMessageBoxVisibilityObserver() {
  if (isInlineSite()) return;

  const target = document.querySelector(".vs-message-box__form");
  if (!target) {
    _messageBoxFormInView = false;
    updateFloatingPillVisibilityForMessageBox();
    return;
  }

  // Already observing this exact element.
  if (_messageBoxFormObserver && _messageBoxFormObservedEl === target) {
    updateFloatingPillVisibilityForMessageBox();
    return;
  }

  if (_messageBoxFormObserver) {
    _messageBoxFormObserver.disconnect();
  }

  _messageBoxFormObservedEl = target;
  _messageBoxFormObserver = new IntersectionObserver(
    ([entry]) => {
      _messageBoxFormInView = !!entry?.isIntersecting;
      updateFloatingPillVisibilityForMessageBox();
    },
    { threshold: 0.15 }
  );

  _messageBoxFormObserver.observe(target);
  updateFloatingPillVisibilityForMessageBox();
}

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

function buildWelcomeHtml({ inline = false } = {}) {
  const suggestionsHtml = WELCOME.suggestions.map((item) => {
    const text = typeof item === "string" ? item : item.text;
    const icon = typeof item === "object" && item.icon === "phone"
      ? `<span class="bc-welcome-chip__icon">${SEND_SVG}</span>`
      : `<span class="bc-welcome-chip__icon">${SPARKLE_SVG}</span>`;
    return `<button type="button" class="bc-welcome-chip" data-message="${text.replace(/"/g, "&quot;")}">${icon}<span>${text}</span></button>`;
  }).join("");

  const closeBtn = inline
    ? ""
    : `<button id="bc-welcome-close" class="bc-welcome-close" title="Close" aria-label="Close">&#x00D7;</button>`;

  return `
    <div id="bc-welcome-launcher" role="region" aria-label="Vision Super welcome">
      ${closeBtn}
      <div class="bc-welcome-inner">
        <div class="bc-welcome-intro">
          <h1 class="bc-welcome-heading">${WELCOME.heading}</h1>
          <p class="bc-welcome-sub">${WELCOME.subheading}</p>
        </div>

        <form id="bc-welcome-form" class="bc-welcome-form">
          <div class="bc-welcome-input-wrap">
            <span class="bc-welcome-input__sparkle">${SPARKLE_SVG}</span>
            <input
              id="bc-welcome-input"
              type="text"
              autocomplete="off"
              placeholder="${WELCOME.placeholder}"
              aria-label="${WELCOME.placeholder}"
            />
            <button type="submit" class="bc-welcome-send" aria-label="Send message">${SEND_SVG}</button>
          </div>
        </form>

        <div class="bc-welcome-suggestions">
          ${suggestionsHtml}
        </div>

        <p class="bc-welcome-footer">
          Vision Super uses AI to help guide you — human care is always our priority.
          For urgent support, please visit our support page.
          See our <a href="${WELCOME.footer.privacyHref}" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
        </p>
      </div>
    </div>
  `;
}

function buildChatModalHtml(brandName) {
  return `
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
  `;
}

function buildFabButtonHtml(label) {
  return `
    <span class="bc-fab-inner">
      <span class="bc-fab-sparkle">${SPARKLE_SVG}</span>
      <span class="bc-fab-label">${label}</span>
      <span class="bc-fab-arrow">${ARROW_SVG}</span>
    </span>
  `;
}

function injectFloatingBar({ label, hidden = false } = {}) {
  if (document.getElementById("bc-fab-button")) return null;

  const brandName = _storedConfig.brandName || "Vision Super";
  const fab = document.createElement("button");
  fab.id = "bc-fab-button";
  fab.setAttribute("aria-label", label || `Ask ${brandName} a question`);
  if (hidden) fab.classList.add("bc-hidden");
  fab.innerHTML = buildFabButtonHtml(label || `Ask ${brandName} a question`);
  document.body.appendChild(fab);
  return fab;
}

function injectInlineConcierge(target) {
  if (document.getElementById("bc-inline-concierge")) return;

  const brandName = _storedConfig.brandName || "Vision Super";

  target.insertAdjacentHTML("afterbegin", `
    <div id="bc-inline-concierge">
      ${buildWelcomeHtml({ inline: true })}
    </div>
  `);

  document.body.insertAdjacentHTML("beforeend", buildChatModalHtml(brandName));
  injectFloatingBar({ label: `Ask ${brandName} a question`, hidden: true });
}

function injectOverlayUI() {
  if (document.getElementById("bc-fab-button")) return;

  const brandName = _storedConfig.brandName || "AI Concierge";
  injectFloatingBar({ label: "Ask a question" });
  const fab = document.getElementById("bc-fab-button");
  fab?.setAttribute("aria-label", `Open ${brandName}`);

  document.body.insertAdjacentHTML("beforeend", buildChatModalHtml(brandName));
}

function buildMessageTextBoxHtml() {
  const styleConfig = _storedConfig.styleConfig || {};
  const inputPlaceholder =
    styleConfig.text?.["input.placeholder"] || "Write your message...";
  const headingLabel =
    styleConfig.text?.["welcome.heading"] || "Style Config JSON >> welcome.heading";

  return `
    <div class="vs-message-box" id="vs-hero-section" role="search" aria-label="Ask Vision Super">
      <h2 class="vs-message-box-title">${headingLabel}</h2>
      <form class="vs-message-box__form" id="vs-message-box-form">
        <div class="vs-hero-input-wrapper">
          <span class="vs-hero-input__sparkle" aria-hidden="true">${SPARKLE_SVG}</span>
          <input
            type="text"
            class="vs-hero-input"
            placeholder="${inputPlaceholder}"
            aria-label="${inputPlaceholder}"
            autocomplete="off"
          />
          <button type="submit" class="vs-hero-submit" aria-label="Send message">
            ${SEND_SVG}
          </button>
        </div>
      </form>
    </div>
  `;
}

function bindMessageTextBoxEvents(root) {
  const form = root.querySelector("#vs-message-box-form") || root.querySelector(".vs-message-box__form");
  const input = root.querySelector(".vs-hero-input");
  const submitBtn = root.querySelector(".vs-hero-submit");

  const sendMessage = (text) => {
    if (!text.trim()) return;
    console.log("[VS Message Box] Message:", text);
    const fab = document.getElementById("bc-fab-button");
    if (fab) {
      _pendingMessage = text;
      fab.click();
    }
  };

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage(input?.value || "");
    if (input) input.value = "";
  });

  input?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage(input.value);
      input.value = "";
    }
  });

  submitBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    sendMessage(input?.value || "");
    if (input) input.value = "";
  });
}

function syncMessageHeadingWithQuickLinks(root, attemptsLeft = 20) {
  const title = root?.querySelector(".vs-message-box-title");
  if (!title) return;

  const quickLinksTitle = document.querySelector(".card-block-icon__title");
  if (!quickLinksTitle) {
    if (attemptsLeft > 0) {
      setTimeout(() => syncMessageHeadingWithQuickLinks(root, attemptsLeft - 1), 150);
    }
    return;
  }

  const computed = window.getComputedStyle(quickLinksTitle);
  title.style.fontFamily = computed.fontFamily;
  title.style.fontSize = computed.fontSize;
  title.style.fontWeight = computed.fontWeight;
  title.style.lineHeight = computed.lineHeight;
  title.style.letterSpacing = computed.letterSpacing;
  title.style.color = computed.color;
}

async function injectHeroSection() {
  // Check if already injected
  if (document.getElementById("vs-hero-section")) return;

  const boxHtml = buildMessageTextBoxHtml();

  // 1. Preferred: inject into requested/live target
  const targetInfo = await waitForMessageBoxTarget(10000);
  if (targetInfo?.el) {
    const position = targetInfo.position || "afterbegin";
    targetInfo.el.insertAdjacentHTML(position, boxHtml);
    console.log("[VS Message Box] Injected into", targetInfo.source, "at", position);
  } else {
    // Fallbacks if the page structure differs
    let injected = false;
    const main = document.querySelector("main");
    if (main) {
      main.insertAdjacentHTML("afterbegin", boxHtml);
      injected = true;
      console.log("[VS Message Box] Injected at start of <main> (XPath fallback)");
    }

    if (!injected) {
      const header = document.querySelector("header");
      if (header) {
        header.insertAdjacentHTML("afterend", boxHtml);
        injected = true;
        console.log("[VS Message Box] Injected after <header> (XPath fallback)");
      }
    }

    if (!injected) {
      document.body.insertAdjacentHTML("afterbegin", boxHtml);
      console.log("[VS Message Box] Injected at start of <body> (XPath fallback)");
    }
  }

  const messageBox = document.getElementById("vs-hero-section");
  if (!messageBox) {
    console.warn("[VS Message Box] Failed to locate injected text box");
    return;
  }

  bindMessageTextBoxEvents(messageBox);
  syncMessageHeadingWithQuickLinks(messageBox);
  initMessageBoxVisibilityObserver();
}

async function ensureMessageBoxVisible() {
  if (document.getElementById("vs-hero-section")) return;
  if (_messageBoxInjecting) return;

  _messageBoxInjecting = true;
  try {
    await injectHeroSection();
  } finally {
    _messageBoxInjecting = false;
  }
}

function startMessageBoxPersistence() {
  if (_messageBoxObserver) return;

  _messageBoxObserver = new MutationObserver(() => {
    if (document.getElementById("vs-hero-section")) return;

    if (_messageBoxReinjectTimer) clearTimeout(_messageBoxReinjectTimer);
    _messageBoxReinjectTimer = setTimeout(() => {
      _messageBoxReinjectTimer = null;
      ensureMessageBoxVisible();
      initMessageBoxVisibilityObserver();
    }, 150);
  });

  _messageBoxObserver.observe(document.body, { childList: true, subtree: true });
}

async function injectUI() {
  if (isInlineSite()) {
    const target = await waitForInjectionTarget(".root.responsivegrid");
    if (!target) {
      console.error("[BC] Could not find .root.responsivegrid — inline injection skipped.");
      return;
    }
    injectInlineConcierge(target);
    // Still inject message text box for inline sites
    await injectHeroSection();
    return;
  }

  injectOverlayUI();
  // Inject the pill message text box into the page XPath target
  await injectHeroSection();
  startMessageBoxPersistence();
}

// ── State machine (fab ↔ welcome ↔ chat) ────────────────────────

let currentState = "fab";
let bcInitialized = false;
let _pendingMessage = null;
let _whiteLadyChatStarted = false;

// ── URL query parameter handler ───────────────────────────────

function extractBcQueryParam() {
  try {
    const url = new URL(window.location.href);
    const query = url.searchParams.get("_bc_q");
    if (query) {
      const decoded = decodeURIComponent(query);
      console.log("[BC] Detected _bc_q parameter:", decoded);
      return decoded;
    }
  } catch (e) {
    console.warn("[BC] Failed to parse URL query:", e);
  }
  return null;
}

function setState(newState) {
  currentState = newState;

  if (isInlineSite()) {
    const welcome = document.getElementById("bc-welcome-launcher");
    const modal = document.getElementById("bc-chat-modal");
    const backdrop = document.getElementById("bc-modal-backdrop");
    welcome?.classList.toggle("bc-visible", newState === "welcome" || newState === "chat");
    modal?.classList.toggle("bc-visible", newState === "chat");
    backdrop?.classList.toggle("bc-visible", newState === "chat");
    document.body.classList.toggle("bc-chat-open", newState === "chat");
    updateInlineFloatingBar();
    return;
  }

  const modal    = document.getElementById("bc-chat-modal");
  const backdrop = document.getElementById("bc-modal-backdrop");
  const welcome  = document.getElementById("bc-welcome-launcher");

  updateFloatingPillVisibilityForMessageBox();
  modal?.classList.toggle("bc-visible", newState === "chat");
  backdrop?.classList.toggle("bc-visible", newState === "chat");
  welcome?.classList.toggle("bc-visible", newState === "welcome");
  document.body.classList.toggle("bc-welcome-open", newState === "welcome");
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
  observeModalCustomizations();
}

// ── Modal DOM customizations ──────────────────────────────────
// Brand Concierge renders dynamic form/content inside the mount.
// Watch for elements that need adjustment after render.

const PRODUCT_OF_INTEREST_OPTIONS = [
  "General information",
  "Learn more",
  "Plan ahead",
  "Other",
];

function findAssociatedLabel(field) {
  if (!field) return null;

  if (field.id) {
    const byFor = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
    if (byFor) return byFor;
  }

  if (field.closest("label")) return field.closest("label");

  const container = field.closest(".guideFieldNode, .form-group, [class*='field'], [class*='Field']");
  return container?.querySelector("label, .guideFieldLabel") || null;
}

function customizeProductOfInterestField() {
  const root = getConciergeRoot();
  if (!root) return false;

  const field = root.querySelector("#mktoAemFormsProductOfInterestStatus");
  if (!field) return false;

  const select = field.tagName === "SELECT" ? field : field.querySelector("select");
  if (!select) return false;

  let changed = false;

  const label = findAssociatedLabel(select);
  if (label) {
    const labelText = label.textContent.trim();
    if (/drop\s*down|populated\s*to|product\s*of\s*interest\s*status/i.test(labelText)) {
      label.textContent = "How can we help you?";
      changed = true;
    }
  }

  const optionTexts = Array.from(select.options)
    .filter((o) => o.value !== "" && !o.disabled)
    .map((o) => o.text.trim());

  const needsOptions =
    optionTexts.length !== PRODUCT_OF_INTEREST_OPTIONS.length ||
    !PRODUCT_OF_INTEREST_OPTIONS.every((text, i) => optionTexts[i] === text);

  if (needsOptions) {
    const placeholder = select.querySelector('option[value=""], option[disabled]');

    select.innerHTML = "";

    if (placeholder) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = placeholder.textContent.trim() || "Please select";
      opt.disabled = true;
      opt.selected = true;
      select.appendChild(opt);
    }

    PRODUCT_OF_INTEREST_OPTIONS.forEach((text) => {
      const opt = document.createElement("option");
      opt.value = text;
      opt.textContent = text;
      select.appendChild(opt);
    });

    changed = true;
  }

  if (changed) console.log("[BC] Updated Product of Interest dropdown label/options");
  return changed;
}

function removeCompanyElementFromModal() {
  const root = getConciergeRoot();
  if (!root) return false;

  const company = root.querySelector("#company");
  if (!company) return false;

  const parent = company.parentElement;
  if (parent?.tagName === "DIV") {
    parent.remove();
    console.log("[BC] Removed #company parent container from modal");
    return true;
  }

  return false;
}

const UI_TEXT_REPLACEMENTS = [
  { pattern: /tennis-australia-demo\s*\(\s*VA7\s*\)/gi, replace: "KR Demo instance" },
];

function rewriteUiText(value) {
  if (!value || typeof value !== "string") return value;
  let next = value;
  for (const { pattern, replace } of UI_TEXT_REPLACEMENTS) {
    next = next.replace(new RegExp(pattern.source, pattern.flags), replace);
  }
  return next;
}

function applyUiTextReplacements(root) {
  if (!root) return false;

  let changed = false;

  const visit = (nodeRoot) => {
    if (!nodeRoot) return;

    const walker = document.createTreeWalker(nodeRoot, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const next = rewriteUiText(node.nodeValue);
      if (next !== node.nodeValue) {
        node.nodeValue = next;
        changed = true;
      }
    }

    if (nodeRoot.querySelectorAll) {
      nodeRoot.querySelectorAll("[placeholder], [aria-label], [title], [alt]").forEach((el) => {
        ["placeholder", "aria-label", "title", "alt"].forEach((attr) => {
          const current = el.getAttribute(attr);
          const next = rewriteUiText(current);
          if (next !== current) {
            el.setAttribute(attr, next);
            changed = true;
          }
        });
      });

      nodeRoot.querySelectorAll("input, textarea").forEach((el) => {
        if (typeof el.value !== "string") return;
        const next = rewriteUiText(el.value);
        if (next !== el.value) {
          el.value = next;
          changed = true;
        }
      });

      nodeRoot.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) visit(el.shadowRoot);
      });
    }
  };

  visit(root);
  return changed;
}

function replaceUiTextInModal() {
  const root = document.getElementById("bc-chat-modal") || getConciergeRoot();
  if (!root) return false;
  const changed = applyUiTextReplacements(root);
  if (changed) console.log("[BC] Applied UI text replacements in Brand Concierge modal");
  return changed;
}

function isAdobeExperienceUi() {
  return window.location.hostname === "experience.adobe.com";
}

function initAdobeExperienceTextOverrides() {
  if (document.documentElement.dataset.bcAdobeTextOverrides) return;
  document.documentElement.dataset.bcAdobeTextOverrides = "1";

  let timer = null;
  const run = () => {
    const changed = applyUiTextReplacements(document.body || document.documentElement);
    if (changed) console.log('[BC] Replaced "tennis-australia-demo (VA7)" → "KR Demo instance" on Adobe Experience UI');
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(run, 50);
  };

  run();
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Hash SPA navigations on experience.adobe.com
  window.addEventListener("hashchange", schedule);
  console.log("[BC] Adobe Experience UI text overrides active");
}

function observeModalCustomizations() {
  const mount = document.getElementById("brand-concierge-mount");
  if (!mount || mount.dataset.bcModalCustomizations) return;
  mount.dataset.bcModalCustomizations = "1";

  const run = () => {
    removeCompanyElementFromModal();
    customizeProductOfInterestField();
    replaceUiTextInModal();
    trySendPendingMessage();
  };

  run();

  new MutationObserver(run).observe(mount, { childList: true, subtree: true });
}

function queueInitialMessage(message) {
  const trimmed = message?.trim();
  if (!trimmed) return;
  _pendingMessage = trimmed;
  trySendPendingMessage();
}

function trySendPendingMessage() {
  if (!_pendingMessage) return;

  const mount = document.getElementById("brand-concierge-mount");
  if (!mount) return;

  const input = mount.querySelector(
    'textarea:not([disabled]), input[type="text"]:not([disabled]), [contenteditable="true"]'
  );
  if (!input) return;

  if (input.isContentEditable) {
    input.textContent = _pendingMessage;
  } else {
    input.value = _pendingMessage;
  }

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.focus();

  const sendBtn = mount.querySelector(
    'button[type="submit"], button[aria-label*="Send" i], button[aria-label*="send" i]'
  );

  if (sendBtn) {
    sendBtn.click();
  } else {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
  }

  _pendingMessage = null;
  console.log("[BC] Initial message sent to Brand Concierge");
}

async function launchChatWithMessage(message) {
  setState("chat");
  _whiteLadyChatStarted = true;

  try {
    await ensureSetup();
    bootstrapBC();
    queueInitialMessage(message);

  } catch (err) {
    console.error("[BC] Setup failed:", err);
  }
}

async function handleFabClick() {
  await launchChatWithMessage(null);
}

function handleClose() {
  setState(isInlineSite() ? "welcome" : "fab");
}

function handleWelcomeClose() {
  setState("fab");
}

function initWelcomeListeners() {
  const welcome = document.getElementById("bc-welcome-launcher");
  if (!welcome || welcome.dataset.bcListeners) return;
  welcome.dataset.bcListeners = "1";

  const closeBtn = document.getElementById("bc-welcome-close");
  closeBtn?.addEventListener("click", handleWelcomeClose);

  document.getElementById("bc-welcome-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("bc-welcome-input");
    const message = input.value.trim();
    if (!message) return;
    input.value = "";
    launchChatWithMessage(message);
  });

  welcome.querySelectorAll(".bc-welcome-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      launchChatWithMessage(chip.dataset.message);
    });
  });

  if (!isInlineSite()) {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && currentState === "welcome") handleWelcomeClose();
    });
  }
}

// ── Inline floating bar (show when #bc-inline-concierge is off-screen) ──

let _inlineConciergeInView = true;

function updateInlineFloatingBar() {
  const fab = document.getElementById("bc-fab-button");
  if (!fab || !isInlineSite()) return;
  const shouldShow = !_inlineConciergeInView && currentState !== "chat";
  fab.classList.toggle("bc-hidden", !shouldShow);
}

function handleInlineFloatingBarClick() {
  // Open Brand Concierge chat modal (styled by styleConfig JSON)
  launchChatWithMessage(null);
}

function initInlineFloatingBar() {
  const fab = document.getElementById("bc-fab-button");
  const target = document.getElementById("bc-inline-concierge");
  if (!fab || !target || fab.dataset.bcInlineObserver) return;
  fab.dataset.bcInlineObserver = "1";

  const observer = new IntersectionObserver(
    ([entry]) => {
      _inlineConciergeInView = entry.isIntersecting;
      updateInlineFloatingBar();
    },
    { threshold: 0.15 }
  );
  observer.observe(target);

  fab.addEventListener("click", handleInlineFloatingBarClick);
  updateInlineFloatingBar();
}

// ── Event wiring ──────────────────────────────────────────────

function initEventListeners() {
  if (isInlineSite()) {
    initWelcomeListeners();
    initInlineFloatingBar();
    document.getElementById("bc-btn-close")?.addEventListener("click", handleClose);
    document.getElementById("bc-modal-backdrop")?.addEventListener("click", handleClose);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && currentState === "chat") handleClose();
    });
    return;
  }

  document.getElementById("bc-fab-button").addEventListener("click", handleFabClick);
  document.getElementById("bc-btn-close").addEventListener("click", handleClose);
  document.getElementById("bc-modal-backdrop").addEventListener("click", handleClose);
  initMessageBoxVisibilityObserver();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && currentState === "chat") handleClose();
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
  const hdr       = q("#bc-chat-modal .bc-modal-hdr, #bc-chat-panel .bc-modal-hdr");
  const hdrIcon   = q("#bc-chat-modal .bc-modal-hdr__icon, #bc-chat-panel .bc-modal-hdr__icon");
  const hdrTitle  = q("#bc-chat-modal .bc-modal-hdr__title, #bc-chat-panel .bc-modal-hdr__title");
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

  // Adobe Experience Brand Concierge console (instance switcher label rewrite)
  if (isAdobeExperienceUi()) {
    initAdobeExperienceTextOverrides();
    return;
  }

  // Only inject on the configured site domain
  const siteDomain = _storedConfig.siteDomain;
  if (siteDomain && !window.location.hostname.endsWith(siteDomain)) return;

  // Check for _bc_q query parameter to auto-launch with a question
  const bcQuery = extractBcQueryParam();
  if (bcQuery) {
    _pendingMessage = bcQuery;
  }

  await injectUI();
  startMessageBoxPersistence();

  // Next.js hydration can replace nodes shortly after DOMContentLoaded.
  // Re-check once the full page load settles.
  window.addEventListener(
    "load",
    () => {
      setTimeout(() => {
        ensureMessageBoxVisible();
      }, 300);
    },
    { once: true }
  );
  applyTheme();
  initEventListeners();

  if (isInlineSite()) {
    if (document.getElementById("bc-inline-concierge")) {
      setState("welcome");
    }
  } else {
    setState("fab");
    showStatusToast();
  }

  // Pre-load Alloy + BC scripts in background so the first click is instant
  ensureSetup().catch((err) =>
    console.warn("[BC] Background pre-load failed:", err)
  );

  // Auto-launch chatbot if _bc_q parameter was detected
  if (bcQuery) {
    // Give the UI a moment to settle, then trigger FAB click
    setTimeout(() => {
      const fab = document.getElementById("bc-fab-button");
      if (fab) {
        console.log("[BC] Auto-launching chatbot with question:", bcQuery);
        fab.click();
      }
    }, 500);
  }

  console.log("[BC] UI injected and ready", _storedConfig);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
