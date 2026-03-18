// step7_photos.js — Photos + 360° Panorama Upload + Guide Modal

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

    // ── Guide modal elements ──
    const guideOverlay = document.getElementById("guideOverlay");
    const guideModal = document.getElementById("guideModal");
    const gmClose = document.getElementById("gmClose");
    const gmPrev = document.getElementById("gmPrev");
    const gmNext = document.getElementById("gmNext");
    const gmStepCounter = document.getElementById("gmStepCounter");
    const gmProgressBar = document.getElementById("gmProgressBar");

    const MIN_PHOTOS = 5;
    const API_BASE = "http://127.0.0.1:5000/api";
    let guideStep = 1;
    const GUIDE_TOTAL = 5;

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
        savePhotos(ensureCover(photos.filter(p => p.id !== id)));
        render();
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

    async function addFiles(fileList) {
        const { photos } = read();
        const files = Array.from(fileList || []).filter(f => f.type.startsWith("image/"));
        setUploading(true);
        try {
            const added = [];
            for (const f of files) added.push(await uploadOneToCloudinary(f));
            savePhotos(ensureCover([...photos, ...added]));
            render();
        } catch (e) {
            console.error("[Step7] upload failed", e);
            alert(e?.message || e?.error?.message || "Upload failed. Please try again.");
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

    async function uploadPanorama(file) {
        if (!file.type.startsWith("image/")) {
            alert("Please choose a JPG or PNG image file.");
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

            // Show preview
            renderPanoPreview(out.secure_url);

            // Clear URL input if set
            if (vtUrl) vtUrl.value = "";

        } catch (e) {
            console.error("[Step7] panorama upload failed", e);
            alert("Panorama upload failed. Please try again.");
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
    }

    // ────────────────────────────────────────
    //  RENDER
    // ────────────────────────────────────────
    function updateNextAndSide() {
        const { photos } = read();
        const count = photos.length;
        if (photoCountLabel) photoCountLabel.textContent = `${count} / ${MIN_PHOTOS} minimum`;
        if (nextBtn) nextBtn.disabled = count < MIN_PHOTOS;

        SidePanel.setTips({
            selectedLabel: "Photos & Virtual Tour",
            tips: [
                "Use bright photos: living area, bedroom, bathroom, and entrance.",
                "Set a strong cover photo — this shows in search results.",
                "A 360° virtual tour increases resident inquiries by up to 40%.",
                "Use the Google Street View app (free) to capture a 360° panorama.",
            ],
        });
        SidePanel.refresh();
    }

    function render() {
        const { photos, vt } = read();

        // ── Thumb grid ──
        thumbGrid.innerHTML = photos.map(p => {
            const src = typeof p === "string" ? p : p?.url;
            const name = typeof p === "string" ? "photo" : (p?.name || "photo");
            const cover = (typeof p !== "string" && p?.isCover)
                ? `<div class="coverTag">Cover</div>` : "";
            const pid = typeof p === "string" ? null : p?.id;

            return `
              <div class="thumb">
                ${cover}
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

        // ── Panorama preview ──
        renderPanoPreview(vt.panoUrl || "");
        if (vtUrl) vtUrl.value = (!vt.panoUrl && vt.panoUrl !== undefined) ? "" : "";

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
        // Show/hide steps
        document.querySelectorAll(".gm-step").forEach(s => {
            s.classList.toggle("active", parseInt(s.dataset.step) === guideStep);
        });

        // Update dots
        document.querySelectorAll(".gm-dot").forEach(d => {
            d.classList.toggle("active", parseInt(d.dataset.step) === guideStep);
        });

        // Update counter
        if (gmStepCounter) gmStepCounter.textContent = `Step ${guideStep} of ${GUIDE_TOTAL}`;

        // Update progress bar
        if (gmProgressBar) {
            gmProgressBar.style.width = `${(guideStep / GUIDE_TOTAL) * 100}%`;
        }

        // Prev/Next buttons
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
        saveVT({ ...vt, enabled: !vt.enabled });
        render();
    });

    // VT URL input
    vtUrl?.addEventListener("input", () => {
        const { vt } = read();
        // If URL is typed, clear uploaded panorama to avoid conflict
        if (vtUrl.value.trim() && vt.panoUrl && vt.panoUrl !== vtUrl.value.trim()) {
            saveVT({ ...vt, panoUrl: vtUrl.value.trim(), panoPublicId: "" });
            renderPanoPreview(vtUrl.value.trim());
        } else {
            saveVT({ ...vt, panoUrl: vtUrl.value.trim() });
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
            // After guide, focus the upload button
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