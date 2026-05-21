// ============================================================
// options.js – Brand Concierge Configuration Page
// ============================================================

function $(id) { return document.getElementById(id); }

// ── JSON validation ───────────────────────────────────────────

function validateJson(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: false, empty: true, obj: null };
  try {
    return { valid: true, empty: false, obj: JSON.parse(trimmed) };
  } catch (e) {
    return { valid: false, empty: false, obj: null, error: e.message };
  }
}

function updateJsonStatus(raw) {
  const el = $("json-status");
  const result = validateJson(raw);
  if (result.empty) {
    el.className   = "empty";
    el.textContent = "Paste JSON above to validate";
  } else if (result.valid) {
    el.className   = "valid";
    el.textContent = "✓ Valid JSON";
  } else {
    el.className   = "invalid";
    el.textContent = "✗ " + result.error;
  }
  return result;
}

// ── Status banner ─────────────────────────────────────────────

function showStatus(msg, type) {
  const el = $("save-status");
  el.textContent = msg;
  el.className   = type;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = ""; }, 5000);
}

// ── Load saved values on page open ───────────────────────────

function loadSaved() {
  chrome.storage.local.get(["alloyConfig", "styleConfig", "bcMainJsUrl", "brandName", "siteDomain"], (result) => {
    const ac = result.alloyConfig || {};
    $("f-brandName").value    = result.brandName    || "";
    $("f-siteDomain").value   = result.siteDomain   || "";
    $("f-datastreamId").value = ac.datastreamId     || "";
    $("f-orgId").value        = ac.orgId            || "";
    $("f-edgeDomain").value   = ac.edgeDomain       || "";
    $("f-bcUrl").value        = result.bcMainJsUrl  || "";

    if (result.styleConfig) {
      $("json-input").value = JSON.stringify(result.styleConfig, null, 2);
      updateJsonStatus($("json-input").value);
    }
  });
}

// ── Events ────────────────────────────────────────────────────

$("json-input").addEventListener("input", () => updateJsonStatus($("json-input").value));

$("save-btn").addEventListener("click", () => {
  const brandName    = $("f-brandName").value.trim();
  const siteDomain   = $("f-siteDomain").value.trim();
  const datastreamId = $("f-datastreamId").value.trim();
  const orgId        = $("f-orgId").value.trim();

  if (!brandName || !siteDomain || !datastreamId || !orgId) {
    showStatus("Brand Name, Site Domain, Datastream ID, and Org ID are required.", "error");
    return;
  }

  const jsonResult = validateJson($("json-input").value);
  if (!jsonResult.empty && !jsonResult.valid) {
    showStatus("Style config JSON is invalid — fix the errors and try again.", "error");
    return;
  }

  const payload = {
    brandName,
    siteDomain,
    alloyConfig: {
      datastreamId,
      orgId,
      edgeDomain:               $("f-edgeDomain").value.trim() || "edge.adobedc.net",
      edgeBasePath:             "ee",
      defaultConsent:           "in",
      debugEnabled:             true,
      idMigrationEnabled:       false,
      thirdPartyCookiesEnabled: false,
    },
    bcMainJsUrl: $("f-bcUrl").value.trim(),
  };

  if (jsonResult.valid) payload.styleConfig = jsonResult.obj;

  chrome.storage.local.set(payload, () => {
    showStatus("✓ Saved — reload the tab to apply.", "success");
  });
});

$("reset-btn").addEventListener("click", () => {
  if (!confirm("Reset to bundled defaults? This clears all saved configuration.")) return;
  chrome.storage.local.remove(["alloyConfig", "styleConfig", "bcMainJsUrl", "brandName", "siteDomain"], () => {
    ["f-brandName", "f-siteDomain", "f-datastreamId", "f-orgId", "f-edgeDomain", "f-bcUrl"].forEach((id) => $(id).value = "");
    $("json-input").value = "";
    updateJsonStatus("");
    showStatus("↺ Reset — reload the tab to apply.", "success");
  });
});

// ── Init ──────────────────────────────────────────────────────

loadSaved();
