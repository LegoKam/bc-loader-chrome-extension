# Invocare-Grace — Chrome Extension

Injects the Adobe Experience Platform **Brand Concierge** chat experience into any website via a floating "Ask a question" button. All configuration is managed through the extension's built-in Options page — no code changes required.

---

## Install

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked** and select this folder
4. The extension is now active — open the Options page to configure it before visiting your target site

---

## Configuration (Options Page)

Right-click the extension icon → **Options**, or go to `chrome://extensions` → **Details** → **Extension options**.

### Required fields

| Field | Description | Example |
|---|---|---|
| **Brand Name** | Display name shown in the modal header, FAB aria-label, and toast notification | `Hyundai AI Concierge` |
| **Site Domain** | Hostname suffix the extension activates on. Matching uses `endsWith` so subdomains are included automatically | `hyundai.com` |
| **Datastream ID** | Adobe Experience Platform datastream UUID. Found in your `index.html` inside `alloy("configure", {…})` | `3af08e25-7383-…` |
| **Org ID** | Adobe IMS Organisation ID | `XXXXXXXX@AdobeOrg` |

### Optional fields

| Field | Description | Default |
|---|---|---|
| **Edge Domain** | Adobe Edge Network domain | `edge.adobedc.net` |
| **BC Main JS URL** | Override the Brand Concierge `main.js` CDN URL (e.g. stage build) | Adobe production CDN |
| **Style Config JSON** | Paste the full contents of your `style-config-*.json` file to apply brand colours, fonts, welcome copy, and prompt suggestions | Brand Concierge client defaults |

### Style Config JSON

The style config is a JSON object with the following top-level sections:

```jsonc
{
  "metadata": {
    "brandName": "...",        // internal brand identifier
    "version": "1.0.0",
    "language": "en-US",
    "namespace": "brand-concierge"
  },
  "behavior": {
    "input": { ... },          // voice, multiline, AI chat icon
    "chat": { ... },           // message alignment / width
    "privacyNotice": { ... },  // title, body text, links
    "meetingForm": { ... },    // schedule meeting form layout
    "calendarWidget": { ... }, // calendar booking widget
    "productCard": { ... }     // card action button size
  },
  "disclaimer": { "text": "...", "links": [...] },
  "text": {                    // all UI strings / ARIA labels
    "welcome.heading": "...",
    "welcome.subheading": "...",
    "input.placeholder": "...",
    ...
  },
  "arrays": {
    "welcome.examples": [      // prompt suggestion cards
      { "text": "...", "imageUrl": "...", "image": "..." }
    ],
    "feedback.positive.options": [...],
    "feedback.negative.options": [...]
  },
  "assets": {
    "icons": { "company": "" } // base64 or URL for brand logo
  },
  "theme": {                   // CSS custom properties
    "--color-primary": "#007bff",
    "--color-button-submit": "#002C5F",
    "--font-family": "'Adobe Clean', sans-serif",
    "--main-container-background": "#F6F6F2",
    ...
  }
}
```

The `theme` section is used to automatically style the modal header, FAB label, and toast to match your brand — no CSS edits needed.

---

## How it works

```
Page load
  └─ config-bridge.js (isolated world, document_start)
       Reads chrome.storage.local → writes data-bc-config attribute on <html>

  └─ content.js (MAIN world, document_end)
       Reads data-bc-config → checks site domain → injects FAB + modal
       Applies theme CSS variables from styleConfig.theme
       Pre-loads Alloy + BC main.js from CDN in background

User clicks "Ask a question"
  └─ Modal opens → Alloy configured → Brand Concierge bootstrapped
       window.adobe.concierge.bootstrap({
         instanceName: "alloy",
         stylingConfigurations: <stored style config>,
         selector: "#brand-concierge-mount"
       })
```

### CSP compatibility

The extension avoids inline `<script>` injection (blocked by strict `script-src` policies). Configuration data crosses the isolated/MAIN world boundary via a DOM attribute (`data-bc-config` on `<html>`), which is CSP-safe.

---

## File reference

| File | Purpose |
|---|---|
| `manifest.json` | MV3 extension manifest — permissions, content script registration |
| `content.js` | MAIN world content script — UI injection, Alloy init, BC bootstrap |
| `config-bridge.js` | Isolated world bridge — reads storage, writes DOM attribute |
| `injected.css` | Styles for the FAB button, modal, backdrop, and toast |
| `options.html` | Configuration UI |
| `options.js` | Options page logic — save/load/reset `chrome.storage.local` |

---

## Notes

- All configuration is local to your browser profile — nothing is sent anywhere except to Adobe Edge Network
- The extension injects on every page matching the configured **Site Domain**; it silently exits on all other pages
- Reload the target tab after saving options for changes to take effect
- The Brand Concierge chat widget is loaded lazily from Adobe CDN on the first button click
