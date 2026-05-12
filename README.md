# EOS Focus — Chrome Extension

Browser time tracker for [EOS Hub](https://eos-update2.pages.dev). Tracks your web activity and syncs it automatically to the Time Tracking module.

## How it works

- Detects which site is active using the Chrome `tabs` API (no page content is read)
- Sends events to a Supabase Edge Function (`track-extension-activity`) after ≥30 seconds on a site
- Injects `window.__EOS_EXTENSION__` into EOS Hub pages so the app can detect and connect to it

---

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Build the extension
npm run build
# → outputs to /dist

# 3. Load in Chrome
# Open chrome://extensions → Enable Developer Mode → Load unpacked → select /dist
```

To rebuild on every change:
```bash
npm run dev
```

After any code change, go to `chrome://extensions` and click the **↺ refresh** button on the EOS Focus card.

---

## Adding icons

Place PNG icons in `/icons/`:
- `icon16.png`  — 16×16 px
- `icon32.png`  — 32×32 px
- `icon48.png`  — 48×48 px
- `icon128.png` — 128×128 px

You can generate them from a single SVG using [RealFaviconGenerator](https://realfavicongenerator.net) or Figma.

---

## Publishing to Chrome Web Store

1. Run `npm run build`
2. Zip the `/dist` folder: `cd dist && zip -r ../eos-focus.zip .`
3. Go to [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole)
4. Pay the one-time $5 USD developer registration (if not done)
5. Click **"New item"** → upload `eos-focus.zip`
6. Fill in title, description, screenshots, and privacy policy
7. Submit for review (~3 business days)

Once published, replace `EXTENSION_CHROME_STORE_URL` in `useChromeExtensionStatus.ts` with the real URL.

---

## Environment

The extension targets:
- `https://eos-update2.pages.dev/*`
- `https://colma.odoo.com/*`

To add more domains, update `host_permissions` and `content_scripts.matches` in `manifest.json`, rebuild, and reload.
