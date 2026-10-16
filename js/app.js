/* FarmerQR-Alcala — RSBSA QR Validator (web version of the Android app v1.1)
 *
 * Scans a farmer's RSBSA QR code and opens the matching LGU-RSBSA
 * validation profile page in the browser:
 *
 *   QR text:  02-015-02-003-21LOBB
 *   Link:     https://lgu-rsbsa.da.gov.ph/validate-rsbsa-profile/02-015-02-003-21LOBB
 *
 * Scan success is confirmed with a beep + vibration, then the link opens
 * automatically (with an on-screen button fallback).
 */
(function () {
  "use strict";

  var BASE_URL = "https://lgu-rsbsa.da.gov.ph/validate-rsbsa-profile/";
  var RESCAN_COOLDOWN_MS = 2500;
  var SAME_CODE_TTL_MS = 8000;

  var els = {
    splash: document.getElementById("splash"),
    reader: document.getElementById("reader"),
    overlay: document.getElementById("scanOverlay"),
    hint: document.getElementById("hint"),
    zoomWrap: document.getElementById("zoomWrap"),
    zoomSlider: document.getElementById("zoomSlider"),
    zoomVal: document.getElementById("zoomVal"),
    zoomInBtn: document.getElementById("zoomInBtn"),
    zoomOutBtn: document.getElementById("zoomOutBtn"),
    switchCameraBtn: document.getElementById("switchCameraBtn"),
    torchBtn: document.getElementById("torchBtn"),
    result: document.getElementById("result"),
    scannedCode: document.getElementById("scannedCode"),
    profileLink: document.getElementById("profileLink"),
    openBtn: document.getElementById("openBtn"),
    copyBtn: document.getElementById("copyBtn"),
    nextBtn: document.getElementById("nextBtn"),
  };

  var html5Qrcode = null;
  var scanning = false;
  var torchOn = false;
  var lastCode = null;
  var lastCodeAt = 0;
  var lastOpenAt = 0;
  var copyResetTimer = null;

  // Camera state & features
  var currentFacingMode = "environment"; // "environment" or "user"
  var currentZoom = 1;
  var minZoom = 1;
  var maxZoom = 5;
  var zoomStep = 0.1;
  var hasHardwareZoom = false;

  // Video freeze watchdog
  var lastFrameTime = 0;
  var freezeCheckTimer = null;
  var isRecoveringFreeze = false;

  /* ---------- Screenshot / demo mode (?screen=splash|scan|result) ---------- */

  var screenMode = null;
  try {
    screenMode = new URLSearchParams(window.location.search).get("screen");
  } catch (e) {}
  var isDemo = screenMode === "scan" || screenMode === "result";

  /* ---------- Splash ---------- */

  if (screenMode !== "splash") {
    window.setTimeout(function () {
      if (els.splash) els.splash.classList.add("hide");
    }, isDemo ? 0 : 700);
  }

  if (isDemo) {
    // Simulated camera scene for screenshots (no real camera needed).
    document.getElementById("reader-wrap").classList.add("demo-camera");
    els.torchBtn.hidden = false; // show the flashlight control in screenshots
  }

  /* ---------- Link building (same logic as the Android app) ---------- */

  function buildProfileUrl(scanned) {
    var text = (scanned || "").trim();
    // If the QR already contains a full URL, open it as-is.
    if (/^https?:\/\//i.test(text)) return text;
    return BASE_URL + encodeURIComponent(text);
  }

  /* ---------- Scan feedback (beep + vibration, like the app) ---------- */

  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 1440;
      gain.gain.value = 0.12;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
      window.setTimeout(function () {
        try { ctx.close(); } catch (e) {}
      }, 400);
    } catch (e) {}
  }

  function vibrate() {
    try {
      if (navigator.vibrate) navigator.vibrate(180);
    } catch (e) {}
  }

  function playSuccessFeedback() {
    beep();
    vibrate();
  }

  /* ---------- UI helpers ---------- */

  function setHint(msg) {
    els.hint.textContent = msg;
  }

  function showResult(code, url) {
    els.scannedCode.textContent = code;
    els.profileLink.textContent = url;
    els.profileLink.href = url;
    els.openBtn.href = url;
    els.result.hidden = false;
  }

  function hideResult() {
    els.result.hidden = true;
    els.scannedCode.textContent = "";
    els.profileLink.textContent = "";
    els.profileLink.removeAttribute("href");
    els.openBtn.removeAttribute("href");
  }

  /* ---------- Scan handling ---------- */

  function onScanSuccess(decodedText) {
    var now = Date.now();
    // Debounce: ignore re-reads of the same code and rapid repeats.
    if (decodedText === lastCode && now - lastCodeAt < SAME_CODE_TTL_MS) return;
    if (now - lastOpenAt < RESCAN_COOLDOWN_MS) return;
    lastCode = decodedText;
    lastCodeAt = now;
    lastOpenAt = now;

    var url = buildProfileUrl(decodedText);
    playSuccessFeedback();
    showResult(decodedText, url);
    setHint("QR detected — opening profile…");

    try {
      if (html5Qrcode) html5Qrcode.pause(true);
    } catch (e) {}

    // Best-effort immediate open (a browser may block pop-ups that are not
    // triggered by a tap — the "Open Farmer Profile" button always works).
    var win = null;
    try {
      win = window.open(url, "_blank", "noopener");
    } catch (e) {}
    if (!win) {
      setHint("Your browser blocked the automatic pop-up — tap “Open Farmer Profile” below.");
    }
  }

  /* ---------- Scanner control ---------- */

  function updateMirrorMode() {
    if (!els.reader) return;
    if (currentFacingMode === "user") {
      els.reader.classList.add("mirrored");
    } else {
      els.reader.classList.remove("mirrored");
    }
  }

  function ensureScanner() {
    if (html5Qrcode) return;
    html5Qrcode = new Html5Qrcode("reader", {
      verbose: false,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    });
  }

  function startScanner() {
    if (scanning) return;
    if (typeof Html5Qrcode === "undefined") {
      setHint("Scanner library failed to load. Check that lib/html5-qrcode.min.js is present.");
      return;
    }
    ensureScanner();
    setHint("Starting camera…");
    updateMirrorMode();

    html5Qrcode
      .start(
        { facingMode: currentFacingMode },
        {
          fps: 15,
          qrbox: function (viewfinderWidth, viewfinderHeight) {
            var size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.7);
            return { width: size, height: size };
          },
        },
        onScanSuccess,
        function () {} // per-frame "no QR found" errors are expected — ignore
      )
      .then(function () {
        scanning = true;
        els.overlay.hidden = false;
        updateMirrorMode();
        detectTorch();
        detectZoom();
        startFreezeWatchdog();
        setHint("Point the camera at the farmer's QR code");
      })
      .catch(function (err) {
        scanning = false;
        stopFreezeWatchdog();
        els.overlay.hidden = true;
        var reason = err && err.message ? err.message : String(err);
        setHint(
          "Could not start the camera (" + reason + "). " +
          "Allow camera access and make sure the page is opened over HTTPS."
        );
      });
  }

  function stopScanner() {
    stopFreezeWatchdog();
    if (!html5Qrcode || !scanning) return;
    html5Qrcode
      .stop()
      .then(function () {
        scanning = false;
        torchOn = false;
        els.overlay.hidden = true;
        els.torchBtn.hidden = true;
        els.zoomWrap.hidden = true;
        setHint("Scanner stopped. Tap the page to scan again.");
      })
      .catch(function () {});
  }

  function resumeScanner() {
    hideResult();
    if (html5Qrcode && scanning) {
      try {
        html5Qrcode.resume();
        startFreezeWatchdog();
        setHint("Point the camera at the farmer's QR code");
        return;
      } catch (e) {}
    }
    startScanner();
  }

  function switchCamera() {
    currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
    updateMirrorMode();

    if (scanning && html5Qrcode) {
      stopFreezeWatchdog();
      html5Qrcode
        .stop()
        .then(function () {
          scanning = false;
          torchOn = false;
          els.torchBtn.classList.remove("on");
          els.torchBtn.hidden = true;
          startScanner();
        })
        .catch(function () {
          scanning = false;
          startScanner();
        });
    }
  }

  /* ---------- Anti-Freeze Watchdog ---------- */

  function startFreezeWatchdog() {
    stopFreezeWatchdog();
    lastFrameTime = 0;
    var consecutiveStalls = 0;

    freezeCheckTimer = setInterval(function () {
      if (!scanning || isRecoveringFreeze || !els.result.hidden) return;

      var video = document.querySelector("#reader video");
      if (!video) return;

      // Check if video is paused, ended, or playback time is frozen
      if (video.paused || video.ended) {
        try { video.play(); } catch (e) {}
        return;
      }

      var curTime = video.currentTime;
      if (curTime > 0 && curTime === lastFrameTime) {
        consecutiveStalls++;
        if (consecutiveStalls >= 3) { // 3 seconds stuck
          console.warn("Camera video stream freeze detected. Recovering…");
          consecutiveStalls = 0;
          recoverFrozenCamera();
        }
      } else {
        consecutiveStalls = 0;
        lastFrameTime = curTime;
      }
    }, 1000);
  }

  function stopFreezeWatchdog() {
    if (freezeCheckTimer) {
      clearInterval(freezeCheckTimer);
      freezeCheckTimer = null;
    }
  }

  function recoverFrozenCamera() {
    if (isRecoveringFreeze || !scanning) return;
    isRecoveringFreeze = true;
    setHint("Re-aligning camera feed…");

    var video = document.querySelector("#reader video");
    if (video) {
      try { video.play(); } catch (e) {}
    }

    if (html5Qrcode) {
      html5Qrcode
        .stop()
        .catch(function () {})
        .finally(function () {
          scanning = false;
          isRecoveringFreeze = false;
          startScanner();
        });
    } else {
      isRecoveringFreeze = false;
      startScanner();
    }
  }

  /* ---------- Zoom Feature (Hardware + CSS fallback) ---------- */

  function detectZoom() {
    hasHardwareZoom = false;
    minZoom = 1;
    maxZoom = 5;
    zoomStep = 0.1;

    try {
      if (typeof html5Qrcode.getRunningTrackCameraCapabilities === "function") {
        var caps = html5Qrcode.getRunningTrackCameraCapabilities();
        if (caps && typeof caps.zoomFeature === "function" && caps.zoomFeature().isSupported()) {
          var zf = caps.zoomFeature();
          minZoom = zf.min();
          maxZoom = zf.max();
          zoomStep = zf.step() || 0.1;
          hasHardwareZoom = true;
        }
      }
    } catch (e) {}

    // Configure slider
    els.zoomSlider.min = minZoom;
    els.zoomSlider.max = maxZoom;
    els.zoomSlider.step = zoomStep;
    currentZoom = Math.max(minZoom, Math.min(currentZoom, maxZoom));
    els.zoomSlider.value = currentZoom;
    els.zoomVal.textContent = Number(currentZoom).toFixed(1) + "×";
    els.zoomWrap.hidden = false;

    applyZoom(currentZoom);
  }

  function applyZoom(zoomVal) {
    zoomVal = Math.max(minZoom, Math.min(Number(zoomVal), maxZoom));
    currentZoom = zoomVal;
    els.zoomSlider.value = zoomVal;
    els.zoomVal.textContent = Number(zoomVal).toFixed(1) + "×";

    var appliedHardware = false;
    if (hasHardwareZoom) {
      try {
        var caps = html5Qrcode.getRunningTrackCameraCapabilities();
        if (caps && typeof caps.zoomFeature === "function") {
          caps.zoomFeature().apply(zoomVal);
          appliedHardware = true;
        }
      } catch (e) {}
    }

    // If hardware zoom is not supported or failed, use smooth CSS video scaling
    var video = document.querySelector("#reader video");
    if (video) {
      if (appliedHardware) {
        video.style.transformOrigin = "";
        // Keep mirror transform if front-facing
        video.style.transform = "";
      } else {
        video.style.transformOrigin = "center center";
        var mirrorScale = currentFacingMode === "user" ? -1 : 1;
        video.style.transform = "scaleX(" + (zoomVal * mirrorScale) + ") scaleY(" + zoomVal + ")";
      }
    }
  }

  function stepZoom(direction) {
    var delta = (maxZoom - minZoom) * 0.15;
    var target = currentZoom + (direction * delta);
    applyZoom(target);
  }

  /* ---------- Flashlight (torch) ---------- */

  function detectTorch() {
    var supported = false;
    try {
      if (typeof html5Qrcode.getRunningTrackCameraCapabilities === "function") {
        var caps = html5Qrcode.getRunningTrackCameraCapabilities();
        if (caps && typeof caps.torchFeature === "function") {
          supported = caps.torchFeature().isSupported();
        }
      }
    } catch (e) {}
    els.torchBtn.hidden = !supported;
  }

  function toggleTorch() {
    if (!html5Qrcode || !scanning) return;
    var target = !torchOn;
    var applied = false;

    try {
      if (typeof html5Qrcode.getRunningTrackCameraCapabilities === "function") {
        var caps = html5Qrcode.getRunningTrackCameraCapabilities();
        if (caps && typeof caps.torchFeature === "function" && caps.torchFeature().isSupported()) {
          caps.torchFeature().apply(target);
          applied = true;
        }
      }
    } catch (e) {}

    if (!applied) {
      try {
        html5Qrcode.applyVideoConstraints({ advanced: [{ torch: target }] });
        applied = true;
      } catch (e) {}
    }

    if (applied) {
      torchOn = target;
      els.torchBtn.classList.toggle("on", torchOn);
      els.torchBtn.setAttribute("aria-pressed", torchOn ? "true" : "false");
    } else {
      els.torchBtn.hidden = true;
      setHint("Flashlight is not available on this device.");
    }
  }

  /* ---------- Copy link ---------- */

  function copyLink() {
    var url = els.profileLink.href;
    if (!url) return;

    function done() {
      els.copyBtn.textContent = "Copied ✓";
      clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(function () {
        els.copyBtn.textContent = "Copy Link";
      }, 1500);
    }

    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        done();
      } catch (e) {
        setHint("Copy is not supported — long-press the link above to copy it.");
      }
      document.body.removeChild(ta);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, fallback);
    } else {
      fallback();
    }
  }

  /* ---------- Wire up events ---------- */

  els.switchCameraBtn.addEventListener("click", switchCamera);
  els.zoomSlider.addEventListener("input", function (e) {
    applyZoom(Number(e.target.value));
  });
  els.zoomInBtn.addEventListener("click", function () {
    stepZoom(1);
  });
  els.zoomOutBtn.addEventListener("click", function () {
    stepZoom(-1);
  });

  els.torchBtn.addEventListener("click", toggleTorch);
  els.copyBtn.addEventListener("click", copyLink);
  els.nextBtn.addEventListener("click", resumeScanner);
  document.getElementById("reader-wrap").addEventListener("click", function () {
    if (!scanning && els.result.hidden) resumeScanner();
  });

  // Handle tab/screen switching to avoid camera feed getting stuck or frozen
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stopFreezeWatchdog();
    } else {
      if (scanning && els.result.hidden) {
        startFreezeWatchdog();
        // If camera stream paused during app switch or screen lock, resume it
        var video = document.querySelector("#reader video");
        if (video && video.paused) {
          try { video.play(); } catch (e) {}
        }
      }
    }
  });

  /* ---------- PWA: service worker + install prompt ---------- */

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  var deferredInstall = null;
  var installBtn = document.getElementById("installBtn");

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredInstall = e;
    if (installBtn) installBtn.hidden = false;
  });

  if (installBtn) {
    installBtn.addEventListener("click", function () {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      deferredInstall.userChoice.finally(function () {
        deferredInstall = null;
        installBtn.hidden = true;
      });
    });
  }

  window.addEventListener("appinstalled", function () {
    if (installBtn) installBtn.hidden = true;
  });

  /* Demo / screenshot mode: pinned UI states, no camera. */
  if (isDemo) {
    els.overlay.hidden = false;
    if (screenMode === "scan") {
      setHint("Point the camera at the farmer's QR code");
    } else {
      var demoCode = "02-015-02-003-21LOBB";
      showResult(demoCode, buildProfileUrl(demoCode));
      setHint("QR detected — opening profile…");
      try {
        els.result.scrollIntoView({ block: "end" });
      } catch (e) {}
    }
  } else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    /* Auto-start the scanner on page load. */
    startScanner();
  } else {
    setHint("Camera API is not available in this browser. Open the page in Chrome, Edge, or Safari on a phone.");
  }
})();
