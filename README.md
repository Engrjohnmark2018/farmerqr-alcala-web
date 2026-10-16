# FarmerQR-Alcala — RSBSA QR Validator (Web App)

**Developed by: ENGR JOHN MARK C. CONTILLO**

A static web app that scans a farmer's **RSBSA QR code** with the phone camera
and — instead of showing the raw text — builds and opens the matching
LGU-RSBSA validation profile link:

| QR code text | Opened link |
|---|---|
| `02-015-02-003-21LOBB` | `https://lgu-rsbsa.da.gov.ph/validate-rsbsa-profile/02-015-02-003-21LOBB` |

## Features

- 📱 Camera QR scanning (works offline — library is vendored, no CDN needed)
- 🟢 Branded launch splash + animated scan frame (corner brackets + sweep line)
- 📳 **Beep + vibration** feedback on every successful scan
- 🔗 Link **opens automatically** in the browser, with an on-screen
  **Open Farmer Profile** button fallback (for browsers that block pop-ups)
- 🔦 Flashlight toggle for field use
- 📋 Copy Link / Scan Next for batch scanning
- 📲 "Add to Home Screen" support (PWA manifest + icons)

> Web version of the **FarmerQR-Alcala** Android app (v1.1) — identical
> QR → link logic.

---

## 📁 Files

```
farmerqr-alcala-web/
├── index.html                 # App page
├── css/style.css              # Styling (matches the Android app's green theme)
├── js/app.js                  # Scanner + link + feedback logic
├── lib/html5-qrcode.min.js    # QR scanner library (vendored)
├── icons/                     # App icons (favicon + PWA)
├── manifest.json              # "Add to Home Screen" support
├── .nojekyll                  # Tell GitHub Pages not to process with Jekyll
└── README.md
```

No build step. No server code. Everything is static.

---

## 🚀 Deploy on GitHub Pages

1. **Create a repository** on GitHub (e.g. `farmerqr-alcala-web`).
2. **Upload the contents** of this folder:
   - *Easy:* drag-and-drop all files/folders into the GitHub web UI
     ("Add file" → "Upload files"), or upload `farmerqr-alcala-web.zip`
     and extract it in the repo.
   - *Git:*
     ```bash
     cd farmerqr-alcala-web
     git init
     git add .
     git commit -m "FarmerQR-Alcala web app"
     git branch -M main
     git remote add origin https://github.com/<your-username>/farmerqr-alcala-web.git
     git push -u origin main
     ```
3. **Enable Pages:** repository **Settings → Pages → Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **main**, folder: **/ (root)** → **Save**
4. After ~1 minute your app is live at:
   `https://<your-username>.github.io/farmerqr-alcala-web/`

### 📱 Add to Home Screen (recommended for field staff)

On an Android phone, open the site in Chrome → menu (⋮) → **Add to Home screen**.
It then launches full-screen like a native app.

---

## 💻 Test locally

```bash
cd farmerqr-alcala-web
python3 -m http.server 8080
# open http://localhost:8080
```

**Note:** browsers only allow camera access on **HTTPS** sites or
**localhost**. GitHub Pages is HTTPS, so cameras work there out of the box.

---

## 🔧 How the link is built

```text
"https://lgu-rsbsa.da.gov.ph/validate-rsbsa-profile/" + encodeURIComponent(scannedText)
```

- If the scanned QR already contains a full `http(s)://` URL, it is opened as-is.
- Same debounce rules as the Android app (one scan → one page open).
