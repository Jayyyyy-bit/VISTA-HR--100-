// step7_photos.js — Photos + 360° Pannellum Viewer + Dark Image Detection

window.Step7Init = function Step7Init({ nextBtn }) {
    const { ListingStore, SidePanel } = window;

    // ── Regular photo elements ──
    const uploadZone = document.getElementById("uploadZone");
    const photoInput = document.getElementById("photoInput");
    const uploadBtn = document.getElementById("uploadBtn");
    const thumbGrid = document.getElementById("thumbGrid");
    const photoCountLabel = document.getElementById("photoCountLabel");

    // ── VT elements ──
    const vtToggle = document.getElementById("vtToggle");
    const vtBody = document.getElementById("vtBody");
    const vtUrl = document.getElementById("vtUrl");
    const vtGuideBtn = document.getElementById("vtGuideBtn");
    const vtGuideLink = document.getElementById("vtGuideLink");

    // ── Panorama upload elements ──
    const panoInput = document.getElementById("panoInput");
    const panoChooseBtn = document.getElementById("panoChooseBtn");
    const panoUploadZone = document.getElementById("panoUploadZone");
    const panoUploadInner = document.getElementById("panoUploadInner");
    const panoPreview = document.getElementById("panoPreview");
    const panoPreviewImg = document.getElementById("panoPreviewImg");
    const panoRemoveBtn = document.getElementById("panoRemoveBtn");

    // ── Pannellum viewer elements ──
    const panoViewerWrap = document.getElementById("panoViewerWrap");
    const panoViewerEl = document.getElementById("panoViewer");
    const panoRemoveBtn2 = document.getElementById("panoRemoveBtn2");

    // ── Dark image warning elements ──
    const darkWarning = document.getElementById("darkWarning");
    const darkWarningText = document.getElementById("darkWarningText");
    const darkWarningList = document.getElementById("darkWarningList");
    const darkWarningClose = document.getElementById("darkWarningClose");

    // ── Guide modal elements ──
    const guideOverlay = document.getElementById("guideOverlay");
    const guideModal = document.getElementById("guideModal");
    const gmClose = document.getElementById("gmClose");
    const gmPrev = document.getElementById("gmPrev");
    const gmNext = document.getElementById("gmNext");
    const gmStepCounter = document.getElementById("gmStepCounter");
    const gmProgressBar = document.getElementById("gmProgressBar");

    const MIN_PHOTOS = 5;
    const API_BASE = "";
    let guideStep = 1;
    const GUIDE_TOTAL = 5;

    // Track Pannellum instance so we can destroy/recreate
    let pannellumViewer = null;

    // Track dark image names for the warning banner
    let darkImageNames = [];

    // ────────────────────────────────────────
    //  STORE HELPERS
    // ────────────────────────────────────────
    const uid = () => "ph_" + Math.random().toString(16).slice(2) + Date.now().toString(16);

    function read() {
        const d = ListingStore.readDraft();
        return {
            photos: Array.isArray(d.photos) ? d.photos : [],
            vt: d.virtualTour || { enabled: false, panoUrl: "", panoPublicId: "" },
        };
    }

    function savePhotos(photos) { ListingStore.saveDraft({ photos }); }
    function saveVT(vt) { ListingStore.saveDraft({ virtualTour: vt }); }

    function ensureCover(photos) {
        if (!photos.length) return photos;
        if (photos.some(p => p?.isCover)) return photos;
        return photos.map((p, i) => ({ ...p, isCover: i === 0 }));
    }

    function setCover(id) {
        const { photos } = read();
        savePhotos(photos.map(p => ({ ...p, isCover: p.id === id })));
        render();
    }

    function removePhoto(id) {
        const { photos } = read();
        // Also remove from dark list if present
        const removed = photos.find(p => p.id === id);
        if (removed) {
            darkImageNames = darkImageNames.filter(n => n !== (removed.name || "photo"));
            updateDarkWarning();
        }
        savePhotos(ensureCover(photos.filter(p => p.id !== id)));
        render();
    }

    // ════════════════════════════════════════════════════════════
    //  DARK IMAGE DETECTION
    // ════════════════════════════════════════════════════════════
    //
    //  How it works:
    //  After a photo uploads, we draw it onto a hidden <canvas>,
    //  sample pixel data, and calculate average brightness.
    //  If brightness < threshold, we flag it as "dark".
    //
    //  This runs in the browser — no API, no server, no library.
    //
    //  The brightness formula is the standard luminance formula:
    //    L = 0.299*R + 0.587*G + 0.114*B
    //  Values range 0 (black) to 255 (white).
    //  A threshold of 60 catches genuinely dark/underexposed photos
    //  without false-flagging moody interior shots.
    // ════════════════════════════════════════════════════════════
    const DARK_THRESHOLD = 60; // 0-255 brightness scale

    function analyzeBrightness(imageUrl, fileName) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";

            img.onload = () => {
                try {
                    const canvas = document.createElement("canvas");
                    // Downscale for speed — we don't need full resolution to detect brightness
                    const maxDim = 100;
                    const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
                    canvas.width = Math.round(img.width * scale);
                    canvas.height = Math.round(img.height * scale);

                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data; // [R,G,B,A, R,G,B,A, ...]

                    let totalLuminance = 0;
                    const pixelCount = data.length / 4;

                    for (let i = 0; i < data.length; i += 4) {
                        // Standard luminance formula (perceived brightness)
                        totalLuminance += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    }

                    const avgBrightness = totalLuminance / pixelCount;
                    const isDark = avgBrightness < DARK_THRESHOLD;

                    resolve({ isDark, brightness: Math.round(avgBrightness), fileName });
                } catch (e) {
                    // Canvas tainted or other error — skip detection silently
                    console.warn("[Step7] brightness analysis failed for", fileName, e);
                    resolve({ isDark: false, brightness: -1, fileName });
                }
            };

            img.onerror = () => {
                // CORS or load error — skip
                resolve({ isDark: false, brightness: -1, fileName });
            };

            img.src = imageUrl;
        });
    }

    async function checkDarkPhotos(newPhotos) {
        // newPhotos = array of photo objects just uploaded
        const checks = newPhotos.map(p =>
            analyzeBrightness(p.url, p.name || "photo")
        );

        const results = await Promise.all(checks);
        const darkOnes = results.filter(r => r.isDark);

        if (darkOnes.length > 0) {
            for (const d of darkOnes) {
                if (!darkImageNames.includes(d.fileName)) {
                    darkImageNames.push(d.fileName);
                }
            }
            // Mark dark photos in the store so we can show badge on thumbnails
            const { photos } = read();
            const darkFileNames = new Set(darkOnes.map(d => d.fileName));
            const updated = photos.map(p => {
                if (darkFileNames.has(p.name || "photo")) {
                    return { ...p, _isDark: true };
                }
                return p;
            });
            savePhotos(updated);
            updateDarkWarning();
        }
    }

    function updateDarkWarning() {
        if (!darkWarning) return;

        if (darkImageNames.length === 0) {
            darkWarning.style.display = "none";
            return;
        }

        darkWarning.style.display = "flex";

        if (darkImageNames.length === 1) {
            darkWarningText.textContent = `"${darkImageNames[0]}" appears too dark. Bright, well-lit photos get more inquiries.`;
            darkWarningList.textContent = "";
        } else {
            darkWarningText.textContent =
                `${darkImageNames.length} photos appear too dark. Consider retaking them with better lighting.`;
            darkWarningList.textContent = darkImageNames.join(", ");
        }
    }

    if (darkWarningClose) {
        darkWarningClose.addEventListener("click", () => {
            darkWarning.style.display = "none";
            darkImageNames = [];
        });
    }

    // ────────────────────────────────────────
    //  CLOUDINARY UPLOAD (regular photos)
    // ────────────────────────────────────────
    function setUploading(on) {
        if (uploadBtn) uploadBtn.disabled = !!on;
        if (photoInput) photoInput.disabled = !!on;
        if (nextBtn) nextBtn.disabled = !!on;
        uploadZone?.classList.toggle("isUploading", !!on);
        if (uploadBtn) {
            uploadBtn.dataset._orig = uploadBtn.dataset._orig || uploadBtn.textContent;
            uploadBtn.textContent = on ? "Uploading…" : uploadBtn.dataset._orig;
        }
    }

    async function getUploadSignature() {
        const res = await fetch(`${API_BASE}/uploads/sign`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder: "vista_hr/listings" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw data;
        return data;
    }

    async function uploadOneToCloudinary(file) {
        const sig = await getUploadSignature();
        const fd = new FormData();
        fd.append("file", file);
        fd.append("api_key", sig.apiKey);
        fd.append("timestamp", sig.timestamp);
        fd.append("signature", sig.signature);
        fd.append("folder", sig.folder);

        const res = await fetch(
            `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
            { method: "POST", body: fd }
        );
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw out;

        return {
            id: uid(), url: out.secure_url,
            public_id: out.public_id, name: file.name || "photo",
            isCover: false, width: out.width, height: out.height,
        };
    }

    const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per photo
    const MAX_PHOTOS = 20;

    function showUploadError(msg) {
        let errEl = document.getElementById("photoUploadErr");
        if (!errEl) {
            errEl = document.createElement("p");
            errEl.id = "photoUploadErr";
            errEl.style.cssText = "color:#dc2626;font-size:12px;margin-top:8px;font-weight:500;";
            uploadZone?.insertAdjacentElement("afterend", errEl);
        }
        errEl.textContent = msg;
        errEl.hidden = false;
        setTimeout(() => { if (errEl) errEl.hidden = true; }, 5000);
    }

    function validateFiles(fileList) {
        const { photos } = read();
        const files = Array.from(fileList || []);
        const valid = [];
        const errors = [];

        for (const f of files) {
            if (!ALLOWED_TYPES.has(f.type)) {
                errors.push(`"${f.name}" is not an image. Only JPG, PNG, and WEBP are allowed.`);
                continue;
            }
            if (f.size > MAX_FILE_SIZE) {
                errors.push(`"${f.name}" is too large. Maximum size is 10 MB per photo.`);
                continue;
            }
            if (photos.length + valid.length >= MAX_PHOTOS) {
                errors.push(`Maximum ${MAX_PHOTOS} photos allowed. Extra files were skipped.`);
                break;
            }
            valid.push(f);
        }

        if (errors.length) showUploadError(errors[0]);
        return valid;
    }

    async function addFiles(fileList) {
        const { photos } = read();
        const files = validateFiles(fileList);
        if (!files.length) return;

        setUploading(true);
        try {
            const added = await Promise.all(files.map(f => uploadOneToCloudinary(f)));
            savePhotos(ensureCover([...photos, ...added]));
            render();

            // ── Run dark image detection AFTER upload completes ──
            // This is async and non-blocking — doesn't delay the UI
            checkDarkPhotos(added);
        } catch (e) {
            console.error("[Step7] upload failed", e);
            showUploadError(e?.message || e?.error?.message || "Upload failed. Please try again.");
        } finally {
            setUploading(false);
            updateNextAndSide();
        }
    }

    // ────────────────────────────────────────
    //  PANORAMA UPLOAD
    // ────────────────────────────────────────
    function setPanoUploading(on) {
        if (panoChooseBtn) {
            panoChooseBtn.disabled = !!on;
            panoChooseBtn.textContent = on ? "Uploading 360° image…" : "Choose panorama file";
        }
        panoUploadZone?.classList.toggle("isUploading", !!on);
    }

    const MAX_PANO_SIZE = 50 * 1024 * 1024;

    async function uploadPanorama(file) {
        if (!ALLOWED_TYPES.has(file.type)) {
            showUploadError("Please choose a JPG, PNG, or WEBP image file for the panorama.");
            return;
        }
        if (file.size > MAX_PANO_SIZE) {
            showUploadError("Panorama file is too large. Maximum size is 50 MB.");
            return;
        }

        setPanoUploading(true);
        try {
            const sig = await getUploadSignature();
            const fd = new FormData();
            fd.append("file", file);
            fd.append("api_key", sig.apiKey);
            fd.append("timestamp", sig.timestamp);
            fd.append("signature", sig.signature);
            fd.append("folder", sig.folder + "/panoramas");

            const res = await fetch(
                `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
                { method: "POST", body: fd }
            );
            const out = await res.json().catch(() => ({}));
            if (!res.ok) throw out;

            const { vt } = read();
            saveVT({ ...vt, panoUrl: out.secure_url, panoPublicId: out.public_id });

            // Show flat preview briefly, then init Pannellum viewer
            renderPanoPreview(out.secure_url);
            initPannellumViewer(out.secure_url);

            if (vtUrl) vtUrl.value = "";

        } catch (e) {
            console.error("[Step7] panorama upload failed", e);
            showUploadError("Panorama upload failed. Please try again.");
        } finally {
            setPanoUploading(false);
        }
    }

    function renderPanoPreview(url) {
        if (!url) {
            if (panoUploadInner) panoUploadInner.hidden = false;
            if (panoPreview) panoPreview.hidden = true;
            return;
        }
        if (panoPreviewImg) panoPreviewImg.src = url;
        if (panoUploadInner) panoUploadInner.hidden = true;
        if (panoPreview) panoPreview.hidden = false;
    }

    function removePanorama() {
        const { vt } = read();
        saveVT({ ...vt, panoUrl: "", panoPublicId: "" });
        if (vtUrl) vtUrl.value = "";
        renderPanoPreview("");
        destroyPannellumViewer();
    }

    // ════════════════════════════════════════════════════════════
    //  PANNELLUM — Interactive 360° Viewer
    // ════════════════════════════════════════════════════════════
    //
    //  Pannellum is a free, open-source, lightweight JS library
    //  that renders equirectangular panorama images as interactive
    //  360° viewers. The user can drag to look around, zoom, and
    //  explore — exactly what panelists expect.
    //
    //  CDN loaded in HTML: pannellum@2.5.6
    //  Docs: https://pannellum.org/documentation/overview/
    //
    //  We init the viewer AFTER a panorama is uploaded or when
    //  resuming a draft that already has a panoUrl.
    // ════════════════════════════════════════════════════════════

    function initPannellumViewer(imageUrl) {
        if (!imageUrl || !panoViewerEl) return;

        // If Pannellum library not loaded yet, skip gracefully
        if (typeof pannellum === "undefined") {
            console.warn("[Step7] Pannellum not loaded — showing flat preview only");
            return;
        }

        // Destroy existing instance if any
        destroyPannellumViewer();

        // Hide flat preview, show viewer
        if (panoPreview) panoPreview.hidden = true;
        if (panoUploadInner) panoUploadInner.hidden = true;
        if (panoViewerWrap) panoViewerWrap.style.display = "block";

        // Create Pannellum viewer
        pannellumViewer = pannellum.viewer(panoViewerEl, {
            type: "equirectangular",
            panorama: imageUrl,
            autoLoad: true,         // Load immediately, no click-to-load
            autoRotate: -2,         // Slow auto-rotate to show it's interactive
            compass: false,
            showZoomCtrl: true,
            showFullscreenCtrl: true,
            mouseZoom: true,
            hfov: 100,              // Default horizontal field of view
            minHfov: 50,
            maxHfov: 120,
            friction: 0.15,         // Smooth drag
        });
    }

    function destroyPannellumViewer() {
        if (pannellumViewer) {
            try { pannellumViewer.destroy(); } catch (e) { /* ignore */ }
            pannellumViewer = null;
        }
        if (panoViewerWrap) panoViewerWrap.style.display = "none";
        // Clear the viewer container's inner HTML (Pannellum adds children)
        if (panoViewerEl) panoViewerEl.innerHTML = "";
    }

    // Remove button inside viewer header
    panoRemoveBtn2?.addEventListener("click", removePanorama);

    // ────────────────────────────────────────
    //  RENDER
    // ────────────────────────────────────────
    const TIPS_DISMISS_KEY = "vista_tips_dismissed_step7";

    function isTipsDismissed() {
        try { return localStorage.getItem(TIPS_DISMISS_KEY) === "1"; } catch { return false; }
    }

    function markTipsDismissed() {
        try { localStorage.setItem(TIPS_DISMISS_KEY, "1"); } catch { }
    }

    function updateNextAndSide() {
        const { photos } = read();
        const count = photos.length;
        if (photoCountLabel) photoCountLabel.textContent = `${count} / ${MIN_PHOTOS} minimum`;
        if (nextBtn) nextBtn.disabled = count < MIN_PHOTOS;

        if (!isTipsDismissed()) {
            SidePanel.setTips({
                selectedLabel: "Photos & Virtual Tour",
                tips: [
                    "Use bright photos: living area, bedroom, bathroom, and entrance.",
                    "Set a strong cover photo — this shows in search results.",
                    "A 360° virtual tour increases resident inquiries by up to 40%.",
                    "Use the Google Street View app (free) to capture a 360° panorama.",
                ],
            });
        } else {
            SidePanel.refresh();
        }
    }

    function render() {
        const { photos, vt } = read();

        // ── Thumb grid with dark badge ──
        thumbGrid.innerHTML = photos.map(p => {
            const src = typeof p === "string" ? p : p?.url;
            const name = typeof p === "string" ? "photo" : (p?.name || "photo");
            const cover = (typeof p !== "string" && p?.isCover)
                ? `<div class="coverTag">Cover</div>` : "";
            const pid = typeof p === "string" ? null : p?.id;
            const isDark = (typeof p !== "string" && p?._isDark);
            const darkBadge = isDark
                ? `<div class="darkBadge">⚠ Dark</div>` : "";

            return `
              <div class="thumb">
                ${cover}
                ${darkBadge}
                <img src="${src || ""}" alt="${name}" />
                <div class="thumbBar">
                  ${pid ? `<button class="tBtn" type="button" data-act="cover" data-id="${pid}">Set cover</button>` : ""}
                  ${pid ? `<button class="tBtn danger" type="button" data-act="remove" data-id="${pid}">Remove</button>` : ""}
                </div>
              </div>`;
        }).join("");

        thumbGrid.querySelectorAll("[data-act]").forEach(btn => {
            btn.addEventListener("click", () => {
                if (btn.dataset.act === "cover") setCover(btn.dataset.id);
                if (btn.dataset.act === "remove") removePhoto(btn.dataset.id);
            });
        });

        // ── VT toggle ──
        const on = !!vt.enabled;
        vtToggle?.setAttribute("aria-pressed", on ? "true" : "false");
        vtToggle?.classList.toggle("on", on);
        if (vtBody) vtBody.hidden = !on;

        // ── Panorama: show viewer if URL exists, else show upload zone ──
        const panoUrl = vt.panoUrl || "";
        if (panoUrl && on) {
            renderPanoPreview(""); // hide flat preview
            initPannellumViewer(panoUrl);
        } else if (!panoUrl) {
            destroyPannellumViewer();
            renderPanoPreview("");
        }

        if (vtUrl) vtUrl.value = "";

        window.lucide?.createIcons?.();
        updateNextAndSide();
    }

    // ────────────────────────────────────────
    //  GUIDE MODAL
    // ────────────────────────────────────────
    function openGuide(startStep = 1) {
        guideStep = startStep;
        guideModal?.classList.add("open");
        guideOverlay?.classList.add("open");
        document.body.style.overflow = "hidden";
        renderGuideStep();
        window.lucide?.createIcons?.();
    }

    function closeGuide() {
        guideModal?.classList.remove("open");
        guideOverlay?.classList.remove("open");
        document.body.style.overflow = "";
    }

    function renderGuideStep() {
        document.querySelectorAll(".gm-step").forEach(s => {
            s.classList.toggle("active", parseInt(s.dataset.step) === guideStep);
        });
        document.querySelectorAll(".gm-dot").forEach(d => {
            d.classList.toggle("active", parseInt(d.dataset.step) === guideStep);
        });
        if (gmStepCounter) gmStepCounter.textContent = `Step ${guideStep} of ${GUIDE_TOTAL}`;
        if (gmProgressBar) {
            gmProgressBar.style.width = `${(guideStep / GUIDE_TOTAL) * 100}%`;
        }
        if (gmPrev) gmPrev.disabled = guideStep === 1;
        if (gmNext) {
            if (guideStep === GUIDE_TOTAL) {
                gmNext.innerHTML = `Got it! <i data-lucide="check"></i>`;
                gmNext.classList.add("done");
            } else {
                gmNext.innerHTML = `Next <i data-lucide="arrow-right"></i>`;
                gmNext.classList.remove("done");
            }
        }
        window.lucide?.createIcons?.();
    }

    // ────────────────────────────────────────
    //  EVENT BINDINGS
    // ────────────────────────────────────────

    // Regular photo upload
    uploadBtn?.addEventListener("click", () => photoInput?.click());
    photoInput?.addEventListener("change", async () => {
        await addFiles(photoInput.files);
        photoInput.value = "";
    });

    if (uploadZone) {
        uploadZone.addEventListener("click", (e) => { if (!e.target.closest("#uploadBtn")) photoInput?.click(); });
        uploadZone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") photoInput?.click(); });
        uploadZone.addEventListener("dragover", (e) => { e.preventDefault(); uploadZone.classList.add("drag"); });
        uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("drag"));
        uploadZone.addEventListener("drop", (e) => { e.preventDefault(); uploadZone.classList.remove("drag"); addFiles(e.dataTransfer.files); });
    }

    // VT toggle
    vtToggle?.addEventListener("click", () => {
        const { vt } = read();
        const newEnabled = !vt.enabled;
        saveVT({ ...vt, enabled: newEnabled });

        if (!newEnabled) {
            // Turning off — destroy viewer
            destroyPannellumViewer();
        }
        render();
    });

    // VT URL input — when user pastes a URL, init viewer with it
    vtUrl?.addEventListener("input", () => {
        const { vt } = read();
        const url = vtUrl.value.trim();
        saveVT({ ...vt, panoUrl: url, panoPublicId: "" });

        if (url) {
            renderPanoPreview(""); // hide flat preview
            initPannellumViewer(url);
        } else {
            destroyPannellumViewer();
        }
    });

    // Panorama upload
    panoChooseBtn?.addEventListener("click", () => panoInput?.click());
    panoUploadZone?.addEventListener("click", (e) => {
        if (!e.target.closest("#panoChooseBtn") && !e.target.closest("#panoPreview")) panoInput?.click();
    });
    panoInput?.addEventListener("change", async () => {
        if (panoInput.files[0]) await uploadPanorama(panoInput.files[0]);
        panoInput.value = "";
    });
    panoRemoveBtn?.addEventListener("click", removePanorama);

    // Pano drag & drop
    if (panoUploadZone) {
        panoUploadZone.addEventListener("dragover", (e) => { e.preventDefault(); panoUploadZone.classList.add("drag"); });
        panoUploadZone.addEventListener("dragleave", () => panoUploadZone.classList.remove("drag"));
        panoUploadZone.addEventListener("drop", (e) => {
            e.preventDefault();
            panoUploadZone.classList.remove("drag");
            const file = e.dataTransfer.files[0];
            if (file) uploadPanorama(file);
        });
    }

    // Guide buttons
    vtGuideBtn?.addEventListener("click", () => openGuide(1));
    vtGuideLink?.addEventListener("click", () => { openGuide(1); });
    gmClose?.addEventListener("click", closeGuide);
    guideOverlay?.addEventListener("click", closeGuide);

    gmPrev?.addEventListener("click", () => {
        if (guideStep > 1) { guideStep--; renderGuideStep(); }
    });

    gmNext?.addEventListener("click", () => {
        if (guideStep < GUIDE_TOTAL) {
            guideStep++;
            renderGuideStep();
        } else {
            closeGuide();
            setTimeout(() => panoChooseBtn?.focus(), 300);
        }
    });

    // Dot nav
    document.querySelectorAll(".gm-dot").forEach(dot => {
        dot.addEventListener("click", () => {
            guideStep = parseInt(dot.dataset.step);
            renderGuideStep();
        });
    });

    // Keyboard nav inside modal
    guideModal?.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") gmNext?.click();
        if (e.key === "ArrowLeft") gmPrev?.click();
        if (e.key === "Escape") closeGuide();
    });

    // ────────────────────────────────────────
    //  INIT
    // ────────────────────────────────────────
    const draft = ListingStore.readDraft();
    if (Array.isArray(draft.photos)) ListingStore.saveDraft({ photos: ensureCover(draft.photos) });

    render();
};