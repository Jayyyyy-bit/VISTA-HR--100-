/* auth/account-settings.js */
(() => {
    const API = "http://127.0.0.1:5000/api";
    const MAX_FILE = 5 * 1024 * 1024; // 5 MB

    let currentUser = null;
    const uploads = { studentId: null, cor: null };

    // ── Back button routing ───────────────────────────────────
    document.getElementById("backBtn")?.addEventListener("click", () => {
        const ref = document.referrer;
        if (ref && !ref.includes("account-settings")) {
            history.back();
        } else if (currentUser?.role === "OWNER") {
            location.href = "/Property-Owner/dashboard/property-owner-dashboard.html";
        } else if (currentUser?.role === "RESIDENT") {
            location.href = "/Resident/resident_home.html";
        } else {
            location.href = "/auth/login.html";
        }
    });

    // ── Boot ─────────────────────────────────────────────────
    document.addEventListener("DOMContentLoaded", async () => {
        if (!window.AuthGuard) {
            location.href = "/auth/login.html";
            return;
        }

        const me = await window.AuthGuard.fetchMe();
        if (!me.ok) {
            location.href = "/auth/login.html";
            return;
        }

        currentUser = me.data.user;
        const role = currentUser.role;

        // No redirect — unverified users can still access account settings to verify

        fillProfile(currentUser);
        showVerificationSection(currentUser);

        if (window.lucide?.createIcons) lucide.createIcons();
    });

    // ── Fill profile fields ───────────────────────────────────
    function fillProfile(user) {
        const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
        const init = (user.first_name?.[0] || user.email?.[0] || "U").toUpperCase();

        const roleLabel = { OWNER: "Property Owner", RESIDENT: "Resident", ADMIN: "Admin" };

        el("avatarCircle").textContent = init;
        el("avatarName").textContent = name;
        el("avatarRole").textContent = roleLabel[user.role] || user.role;

        el("inputFirstName").value = user.first_name || "";
        el("inputLastName").value = user.last_name || "";
        el("inputEmail").value = user.email || "";
        el("inputPhone").value = user.phone || "";
    }

    // ── Save profile ──────────────────────────────────────────
    document.getElementById("saveProfileBtn")?.addEventListener("click", async () => {
        const btn = el("saveProfileBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");
        const saveMsg = el("saveMsg");

        const first = el("inputFirstName").value.trim();
        const last = el("inputLastName").value.trim();
        const phone = el("inputPhone").value.trim() || null;

        if (!first && !last) {
            showSaveMsg("Please enter at least your first or last name.", true);
            return;
        }

        btn.disabled = true;
        label.hidden = true;
        spinner.hidden = false;
        saveMsg.hidden = true;

        try {
            const res = await fetch(`${API}/auth/me/profile`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ first_name: first, last_name: last, phone }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to save.");

            // Update session cache
            if (data.user && window.AuthGuard?.saveSession) {
                window.AuthGuard.saveSession({ user: data.user });
            }
            fillProfile(data.user || currentUser);
            showSaveMsg("Changes saved!", false);
        } catch (err) {
            showSaveMsg(err.message, true);
        } finally {
            btn.disabled = false;
            label.hidden = false;
            spinner.hidden = true;
        }
    });

    function showSaveMsg(msg, isError) {
        const el2 = el("saveMsg");
        el2.textContent = (isError ? "⚠ " : "✓ ") + msg;
        el2.className = "saveMsg" + (isError ? " error" : "");
        el2.hidden = false;
        setTimeout(() => { el2.hidden = true; }, 4000);
    }

    // ── Verification section (role-aware) ─────────────────────
    function showVerificationSection(user) {
        if (user.role === "OWNER") {
            el("kycCard").hidden = false;
            showKycState(user.kyc_status || "NONE", user.kyc_reject_reason);
        } else if (user.role === "RESIDENT") {
            el("studentCard").hidden = false;
            showStudentState(user.student_status || "NONE", user.student_reject_reason);
        }
    }

    // ── KYC states ────────────────────────────────────────────
    function showKycState(status, reason) {
        el("kycStateNone").hidden = status !== "NONE";
        el("kycStatePending").hidden = status !== "PENDING";
        el("kycStateApproved").hidden = status !== "APPROVED";
        el("kycStateRejected").hidden = status !== "REJECTED";

        if (status === "REJECTED" && reason) {
            el("kycRejectReason").textContent = `Reason: ${reason}`;
        }

        // Update card icon color
        const icon = el("kycCardIcon");
        if (icon) {
            icon.className = "cardIcon " + {
                APPROVED: "cardIcon--green",
                PENDING: "cardIcon--amber",
                REJECTED: "cardIcon--red",
            }[status] || "cardIcon--shield";
        }

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Student verification states ───────────────────────────
    function showStudentState(status, reason) {
        const isForm = status === "NONE" || status === "REJECTED_RESUBMIT";
        el("studentStateForm").hidden = !(status === "NONE");
        el("studentStatePending").hidden = status !== "PENDING";
        el("studentStateApproved").hidden = status !== "APPROVED";
        el("studentStateRejected").hidden = status !== "REJECTED";

        if (status === "REJECTED" && reason) {
            el("studentRejectReason").textContent = `Reason: ${reason}`;
        }

        const icon = el("studentCardIcon");
        if (icon) {
            icon.className = "cardIcon " + {
                APPROVED: "cardIcon--green",
                PENDING: "cardIcon--amber",
                REJECTED: "cardIcon--red",
            }[status] || "cardIcon--green";
        }

        // Re-submit → show form again
        el("studentResubmitBtn")?.addEventListener("click", () => {
            el("studentStateRejected").hidden = true;
            el("studentStateForm").hidden = false;
            setupStudentDropzones();
            if (window.lucide?.createIcons) lucide.createIcons();
        }, { once: true });

        if (status === "NONE") {
            setupStudentDropzones();
        }

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Student dropzones ─────────────────────────────────────
    function setupStudentDropzones() {
        setupDropzone("dropStudentId", "inputStudentId", "dropContentStudentId", "previewStudentId", "previewImgStudentId", "removeStudentId", "errStudentId", "studentId");
        setupDropzone("dropCor", "inputCor", "dropContentCor", "previewCor", "previewImgCor", "removeCor", "errCor", "cor");

        el("submitStudentBtn")?.addEventListener("click", handleStudentSubmit);
    }

    function setupDropzone(dropId, inputId, contentId, previewId, imgId, removeId, errId, slot) {
        const drop = el(dropId);
        const input = el(inputId);
        const content = el(contentId);
        const preview = el(previewId);
        const img = el(imgId);
        const remove = el(removeId);
        const errEl = errId ? el(errId) : null;
        if (!drop || !input) return;

        drop.addEventListener("click", e => {
            if (e.target.closest(".removeBtn")) return;
            input.click();
        });
        drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("dragover"); });
        drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
        drop.addEventListener("drop", e => {
            e.preventDefault(); drop.classList.remove("dragover");
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f, slot, img, content, preview, drop, errEl);
        });
        input.addEventListener("change", () => {
            const f = input.files?.[0];
            if (f) handleFile(f, slot, img, content, preview, drop, errEl);
            input.value = "";
        });
        remove?.addEventListener("click", e => {
            e.stopPropagation();
            uploads[slot] = null;
            if (preview) preview.hidden = true;
            if (content) content.hidden = false;
            drop.classList.remove("hasFile");
            if (img) img.src = "";
            if (errEl) errEl.textContent = "";
            updateStudentBtn();
        });
    }

    function handleFile(file, slot, img, content, preview, drop, errEl) {
        if (errEl) errEl.textContent = "";
        if (!file.type.startsWith("image/")) {
            if (errEl) errEl.textContent = "Only image files accepted (JPG, PNG, WEBP).";
            return;
        }
        if (file.size > MAX_FILE) {
            if (errEl) errEl.textContent = "File too large. Max 5 MB.";
            return;
        }
        const reader = new FileReader();
        reader.onload = e => {
            if (img) img.src = e.target.result;
            if (preview) preview.hidden = false;
            if (content) content.hidden = true;
            drop.classList.add("hasFile");
        };
        reader.readAsDataURL(file);
        uploads[slot] = file;
        updateStudentBtn();
    }

    function updateStudentBtn() {
        const btn = el("submitStudentBtn");
        if (btn) btn.disabled = !uploads.studentId || !uploads.cor;
    }

    // ── Cloudinary upload helper ──────────────────────────────
    async function getSignature(folder) {
        const res = await fetch(`${API}/uploads/sign`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Upload signature failed.");
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
        const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: "POST", body: fd });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error?.message || "Upload failed.");
        return out.secure_url;
    }

    // ── Student submit ────────────────────────────────────────
    async function handleStudentSubmit() {
        const btn = el("submitStudentBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");
        const errEl = el("studentGlobalErr");

        if (!uploads.studentId || !uploads.cor) return;

        errEl.hidden = true;
        btn.disabled = true;
        label.hidden = true;
        spinner.hidden = false;

        try {
            const folder = "vista_hr/student_docs";
            let idUrl, corUrl;

            try {
                idUrl = await uploadToCloudinary(uploads.studentId, folder);
            } catch {
                el("errStudentId").textContent = "School ID upload failed. Try again.";
                throw new Error("upload_failed");
            }

            try {
                corUrl = await uploadToCloudinary(uploads.cor, folder);
            } catch {
                el("errCor").textContent = "CoR upload failed. Try again.";
                throw new Error("upload_failed");
            }

            const res = await fetch(`${API}/student/submit`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ student_id_url: idUrl, cor_url: corUrl }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Submission failed.");

            if (data.user && window.AuthGuard?.saveSession) {
                window.AuthGuard.saveSession({ user: data.user });
            }

            showStudentState("PENDING");
        } catch (err) {
            if (err.message !== "upload_failed") {
                errEl.textContent = err.message;
                errEl.hidden = false;
            }
            btn.disabled = false;
            label.hidden = false;
            spinner.hidden = true;
        }
    }

    // ── Util ──────────────────────────────────────────────────
    function el(id) { return document.getElementById(id); }
})();