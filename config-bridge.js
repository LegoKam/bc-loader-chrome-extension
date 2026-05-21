// ============================================================
// config-bridge.js  –  ISOLATED world, document_start
// Reads saved configuration from chrome.storage.local and writes
// it as JSON into data-bc-config on <html>. Both worlds share the
// DOM so this crosses the world boundary without any script
// execution — safe against strict CSP policies like Hyundai's.
// content.js (MAIN world) polls for the attribute at document_end.
// ============================================================

// Inline script injection is blocked by Hyundai's CSP.
// Instead, write config as a JSON attribute on <html> — both worlds
// share the DOM, so the isolated world can write it and the MAIN
// world can read it without any script execution.
chrome.storage.local.get(["alloyConfig", "styleConfig", "bcMainJsUrl", "brandName", "siteDomain"], (result) => {
  const payload = {
    alloyConfig: result.alloyConfig || null,
    styleConfig: result.styleConfig || null,
    bcMainJsUrl: result.bcMainJsUrl || null,
    brandName:   result.brandName   || null,
    siteDomain:  result.siteDomain  || null,
  };
  document.documentElement.setAttribute("data-bc-config", JSON.stringify(payload));
});
