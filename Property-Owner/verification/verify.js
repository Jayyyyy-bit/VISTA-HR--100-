/* Property-Owner/verification/verify.js */
(() => {
    const API_BASE = "http://127.0.0.1:5000/api";
    const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

    // ── Auth guard ────────────────────────────────────────────
    async function init() {
        if (!window.AuthGuard) {
            console.error("AuthGuard missing");
            return;
        }
        const ok = await window.AuthGuard.requireOwner();
        if (!ok) return;

        // Check existing KYC status before showing form
        try {
            const res = await fetch(`${API_BASE}/kyc/status`, { credentials: "include" });
            const data = await res.json().catch(() => ({}));
            const status = data.kyc_status || "NONE";

            if (status === "PENDING") {
                showState("pending");
                return;
            }
            if (status === "REJECTED") {
                const reason = data.kyc_reject_reason || "";
                const el = document.getElementById("rejectReasonText");
                if (el && reason) {
                    el.textContent = `Your documents could not be verified. Reason: ${reason}`;
                }
                showState("rejected");
                return;
            }
            if (status === "APPROVED") {
                // Already verified — go to dashboard
                location.replace("/Property-Owner/dashboard/property-owner-dashboard.html");
                return;
            }
        } catch (e) {
            console.warn("Could not fetch KYC status", e);
        }

        showState("form");
        setupForm();
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function showState(state) {
        document.getElementById("kycFormCard").hidden = state !== "form";
        document.getElementById("kycPendingCard").hidden = state !== "pending";
        document.getElementById("kycRejectedCard").hidden = state !== "rejected";
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // Re-submit button on rejected card
    document.getElementById("resubmitBtn")?.addEventListener("click", () => {
        showState("form");
        setupForm();
        if (window.lucide?.createIcons) lucide.createIcons();
    });

    // ── Upload state ──────────────────────────────────────────
    const uploads = { front: null, back: null, selfie: null };

    // ── Setup dropzones ───────────────────────────────────────
    function setupForm() {
        setupDropzone("dropFront", "inputFront", "dropContentFront", "previewFront", "previewImgFront", "removeFront", "errFront", "front");
        setupDropzone("dropBack", "inputBack", "dropContentBack", "previewBack", "previewImgBack", "removeBack", "errBack", "back");
        setupDropzone("dropSelfie", "inputSelfie", "dropContentSelfie", "previewSelfie", "previewImgSelfie", "removeSelfie", null, "selfie");

        document.getElementById("submitBtn")?.addEventListener("click", handleSubmit);
    }

    function setupDropzone(dropId, inputId, contentId, previewId, imgId, removeId, errId, slot) {
        const drop = document.getElementById(dropId);
        const input = document.getElementById(inputId);
        const content = document.getElementById(contentId);
        const preview = document.getElementById(previewId);
        const img = document.getElementById(imgId);
        const remove = document.getElementById(removeId);
        const errEl = errId ? document.getElementById(errId) : null;

        if (!drop || !input) return;

        // Click to open file picker
        drop.addEventListener("click", e => {
            if (e.target.closest(".removeBtn")) return;
            input.click();
        });

        // Drag events
        drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("dragover"); });
        drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
        drop.addEventListener("drop", e => {
            e.preventDefault();
            drop.classList.remove("dragover");
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file, slot, img, content, preview, drop, errEl);
        });

        // File input change
        input.addEventListener("change", () => {
            const file = input.files?.[0];
            if (file) handleFile(file, slot, img, content, preview, drop, errEl);
            input.value = "";
        });

        // Remove button
        remove?.addEventListener("click", e => {
            e.stopPropagation();
            uploads[slot] = null;
            if (preview) preview.hidden = true;
            if (content) content.hidden = false;
            drop.classList.remove("hasFile");
            if (img) img.src = "";
            if (errEl) errEl.textContent = "";
            updateSubmitBtn();
        });
    }

    function handleFile(file, slot, img, content, preview, drop, errEl) {
        if (errEl) errEl.textContent = "";

        if (!file.type.startsWith("image/")) {
            if (errEl) errEl.textContent = "Only image files are accepted (JPG, PNG, WEBP).";
            return;
        }
        if (file.size > MAX_FILE_BYTES) {
            if (errEl) errEl.textContent = "File is too large. Maximum size is 5 MB.";
            return;
        }

        // Show local preview immediately
        const reader = new FileReader();
        reader.onload = e => {
            if (img) img.src = e.target.result;
            if (preview) preview.hidden = false;
            if (content) content.hidden = true;
            drop.classList.add("hasFile");
        };
        reader.readAsDataURL(file);

        // Store file for upload
        uploads[slot] = file;
        updateSubmitBtn();
    }

    function updateSubmitBtn() {
        const btn = document.getElementById("submitBtn");
        if (btn) btn.disabled = !uploads.front || !uploads.back;
    }

    // ── Cloudinary upload ─────────────────────────────────────
    async function getSignature(folder) {
        const res = await fetch(`${API_BASE}/uploads/sign`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not get upload signature.");
        return data;
    }

    async function uploadToCloudinary(file, folder) {
        const sig = await getSignature(folder);
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
        if (!res.ok) throw new Error(out.error?.message || "Upload failed.");
        return out.secure_url;
    }

    // ── Submit ────────────────────────────────────────────────
    async function handleSubmit() {
        const btn = document.getElementById("submitBtn");
        const label = btn?.querySelector(".btnLabel");
        const spinner = btn?.querySelector(".btnSpinner");
        const globalErr = document.getElementById("globalErr");

        if (!uploads.front || !uploads.back) return;

        // Clear errors
        if (globalErr) { globalErr.hidden = true; globalErr.textContent = ""; }
        document.getElementById("errFront").textContent = "";
        document.getElementById("errBack").textContent = "";

        btn.disabled = true;
        if (label) label.hidden = true;
        if (spinner) spinner.hidden = false;

        try {
            const folder = "vista_hr/kyc";

            // Upload all files (front required, back required, selfie optional)
            let frontUrl, backUrl, selfieUrl = null;

            try {
                frontUrl = await uploadToCloudinary(uploads.front, folder);
            } catch {
                document.getElementById("errFront").textContent = "Front upload failed. Try again.";
                throw new Error("front_upload_failed");
            }

            try {
                backUrl = await uploadToCloudinary(uploads.back, folder);
            } catch {
                document.getElementById("errBack").textContent = "Back upload failed. Try again.";
                throw new Error("back_upload_failed");
            }

            if (uploads.selfie) {
                selfieUrl = await uploadToCloudinary(uploads.selfie, folder).catch(() => null);
            }

            // Submit to backend
            const res = await fetch(`${API_BASE}/kyc/submit`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id_front_url: frontUrl,
                    id_back_url: backUrl,
                    selfie_url: selfieUrl,
                }),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) throw new Error(data.error || "Submission failed.");

            // Update session cache
            if (data.user && window.AuthGuard?.saveSession) {
                window.AuthGuard.saveSession({ user: data.user });
            }

            showState("pending");

        } catch (err) {
            if (err.message !== "front_upload_failed" && err.message !== "back_upload_failed") {
                if (globalErr) {
                    globalErr.textContent = err.message || "Something went wrong. Please try again.";
                    globalErr.hidden = false;
                }
            }
            btn.disabled = false;
            if (label) label.hidden = false;
            if (spinner) spinner.hidden = true;
        }
    }

    // Boot
    document.addEventListener("DOMContentLoaded", init);
})();