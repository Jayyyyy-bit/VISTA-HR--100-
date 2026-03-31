/* Property-Owner/verification/verify.js */
(() => {
    const API = "http://127.0.0.1:5000/api";
    const MAX_SIZE = 5 * 1024 * 1024;
    const uploads = { front: null, back: null, selfie: null };

    function el(id) { return document.getElementById(id); }

    /* ── Show one state, hide others ── */
    function showState(s) {
        el("kycFormCard").hidden = s !== "form";
        el("kycPendingCard").hidden = s !== "pending";
        el("kycRejectedCard").hidden = s !== "rejected";
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    /* ── Boot ── */
    async function init() {
        let user = null;
        try {
            const r = await fetch(`${API}/auth/me`, { credentials: "include" });
            if (!r.ok) { location.replace("/auth/login.html"); return; }
            user = (await r.json().catch(() => ({}))).user;
        } catch { location.replace("/auth/login.html"); return; }

        if (!user || user.role !== "OWNER") { location.replace("/auth/login.html"); return; }
        if (user.kyc_status === "APPROVED") {
            location.replace("/Property-Owner/dashboard/property-owner-dashboard.html"); return;
        }

        /* Live status check */
        try {
            const r = await fetch(`${API}/kyc/status`, { credentials: "include" });
            const data = await r.json().catch(() => ({}));
            const st = data.kyc_status || user.kyc_status || "NONE";

            if (st === "PENDING") { showState("pending"); bindResubmit(); return; }
            if (st === "REJECTED") {
                const reason = data.kyc_reject_reason || user.kyc_reject_reason || "";
                if (reason) el("rejectReasonText").textContent =
                    `Your documents could not be verified. Reason: ${reason}`;
                showState("rejected"); bindResubmit(); return;
            }
        } catch (e) { console.warn("KYC status fetch failed, showing form:", e); }

        showState("form");
        setupDropzones();
        el("submitBtn").addEventListener("click", handleSubmit, { once: true });
        lucide.createIcons();
    }

    function bindResubmit() {
        el("resubmitBtn")?.addEventListener("click", () => {
            showState("form");
            setupDropzones();
            el("submitBtn").addEventListener("click", handleSubmit, { once: true });
            lucide.createIcons();
        }, { once: true });
    }

    /* ── Dropzones ── */
    function setupDropzones() {
        uploads.front = uploads.back = uploads.selfie = null;
        updateBtn();
        wire("dropFront", "inputFront", "dropContentFront", "previewFront", "previewImgFront", "removeFront", "errFront", "front");
        wire("dropBack", "inputBack", "dropContentBack", "previewBack", "previewImgBack", "removeBack", "errBack", "back");
        wire("dropSelfie", "inputSelfie", "dropContentSelfie", "previewSelfie", "previewImgSelfie", "removeSelfie", null, "selfie");
    }

    function wire(dropId, inputId, contentId, previewId, imgId, removeId, errId, slot) {
        const drop = el(dropId), input = el(inputId),
            content = el(contentId), preview = el(previewId),
            img = el(imgId), remove = el(removeId),
            errEl = errId ? el(errId) : null;
        if (!drop || !input) return;

        drop.addEventListener("click", e => { if (!e.target.closest(".remove-btn")) input.click(); });
        drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("dragover"); });
        drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
        drop.addEventListener("drop", e => {
            e.preventDefault(); drop.classList.remove("dragover");
            const f = e.dataTransfer.files?.[0]; if (f) onFile(f, slot, img, content, preview, drop, errEl);
        });
        input.addEventListener("change", () => {
            const f = input.files?.[0]; if (f) onFile(f, slot, img, content, preview, drop, errEl);
            input.value = "";
        });
        remove?.addEventListener("click", e => {
            e.stopPropagation();
            uploads[slot] = null;
            if (preview) preview.hidden = true;
            if (content) content.hidden = false;
            drop.classList.remove("has-file");
            if (img) img.src = "";
            if (errEl) errEl.textContent = "";
            updateBtn();
        });
    }

    function onFile(file, slot, img, content, preview, drop, errEl) {
        if (errEl) errEl.textContent = "";
        if (!file.type.startsWith("image/")) { if (errEl) errEl.textContent = "Only image files (JPG, PNG, WEBP)."; return; }
        if (file.size > MAX_SIZE) { if (errEl) errEl.textContent = "File too large — max 5 MB."; return; }
        const reader = new FileReader();
        reader.onload = e => {
            if (img) img.src = e.target.result;
            if (preview) preview.hidden = false;
            if (content) content.hidden = true;
            drop.classList.add("has-file");
        };
        reader.readAsDataURL(file);
        uploads[slot] = file;
        updateBtn();
    }

    function updateBtn() {
        const btn = el("submitBtn");
        if (btn) btn.disabled = !uploads.front || !uploads.back;
    }

    /* ── Cloudinary ── */
    async function getSig(folder) {
        const r = await fetch(`${API}/uploads/sign`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Signature failed.");
        return d;
    }

    async function upload(file, folder) {
        const sig = await getSig(folder);
        const fd = new FormData();
        fd.append("file", file); fd.append("api_key", sig.apiKey);
        fd.append("timestamp", sig.timestamp); fd.append("signature", sig.signature);
        fd.append("folder", sig.folder);
        const r = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: "POST", body: fd });
        const out = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(out.error?.message || "Upload failed.");
        return out.secure_url;
    }

    /* ── Submit ── */
    async function handleSubmit() {
        const btn = el("submitBtn"), label = btn.querySelector(".btn-label"), spinner = btn.querySelector(".btn-spinner");
        const errEl = el("globalErr");
        if (!uploads.front || !uploads.back) return;

        errEl.hidden = true; errEl.textContent = "";
        el("errFront").textContent = ""; el("errBack").textContent = "";
        btn.disabled = true; label.hidden = true; spinner.hidden = false;

        try {
            const folder = "vista_hr/kyc";
            let frontUrl, backUrl, selfieUrl = null;

            try { frontUrl = await upload(uploads.front, folder); }
            catch { el("errFront").textContent = "Front upload failed. Try again."; throw new Error("u"); }

            try { backUrl = await upload(uploads.back, folder); }
            catch { el("errBack").textContent = "Back upload failed. Try again."; throw new Error("u"); }

            if (uploads.selfie) selfieUrl = await upload(uploads.selfie, folder).catch(() => null);

            const r = await fetch(`${API}/kyc/submit`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id_front_url: frontUrl, id_back_url: backUrl, selfie_url: selfieUrl }),
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error || "Submission failed.");

            if (data.user && window.AuthGuard?.saveSession) window.AuthGuard.saveSession({ user: data.user });
            showState("pending");
        } catch (err) {
            if (err.message !== "u") { errEl.textContent = err.message || "Something went wrong."; errEl.hidden = false; }
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
            btn.addEventListener("click", handleSubmit, { once: true });
        }
    }

    /* ── Boot ── */
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();