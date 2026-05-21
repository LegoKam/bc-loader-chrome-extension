# Hyundai HTML Injector — Chrome Extension

Injects custom HTML into any hyundai.com page. Visible only in YOUR browser.

## Install

1. Open Chrome and go to: chrome://extensions
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked**
4. Select this folder (hyundai-injector/)
5. Visit any https://www.hyundai.com page — your banner appears!

## Customize

Edit **content.js** → change the HTML inside the `customHTML` template literal.
Edit **injected.css** → change the styles for your injected elements.

## Notes

- Changes are LOCAL to your browser only
- No one else sees the injected HTML
- The extension auto-runs on every hyundai.com page load
- Click ✕ to dismiss the banner without reloading
