/* auth/account-settings.js */
(() => {
    const API = "/api";
    const MAX_FILE = 5 * 1024 * 1024;

    let currentUser = null;
    const uploads = { studentId: null, cor: null, kycFront: null, kycBack: null, kycSelfie: null };

    function el(id) { return document.getElementById(id); }

    // ── Safe localStorage wrapper (blocks in some privacy modes) ──
    const store = {
        get(key) { try { return localStorage.getItem(key); } catch { return null; } },
        set(key, val) { try { localStorage.setItem(key, val); } catch { } },
    };

    // ── Sidebar navigation ──────────────────────────────────────
    function navigateTo(section) {
        if (!section) return;
        document.querySelectorAll(".sidebarNavItem").forEach(b => b.classList.remove("active"));
        const btn = document.querySelector(`.sidebarNavItem[data-section="${section}"]`);
        if (btn) btn.classList.add("active");
        document.querySelectorAll(".settingsPanel").forEach(p => p.classList.remove("active"));
        const panel = el(`panel-${section}`);
        if (panel) panel.classList.add("active");
        if (window.lucide?.createIcons) lucide.createIcons();
        // Update hash so URL reflects current section
        history.replaceState(null, "", `#${section}`);
    }

    document.querySelectorAll(".sidebarNavItem").forEach(btn => {
        btn.addEventListener("click", () => navigateTo(btn.dataset.section));
    });

    // ── Hash-based deep link on load ─────────────────────────────
    // Allows toast CTAs from the dashboard to land on the right section.
    // e.g. /auth/account-settings.html#verification → opens KYC panel
    //      /auth/account-settings.html#email        → opens email panel
    (function checkHash() {
        const hash = location.hash.replace(/^#/, "").trim();
        const valid = ["profile", "security", "verification"];
        // "email" deep-link still works — redirects into the verification panel
        const resolved = hash === "email" ? "verification" : hash;
        if (resolved && valid.includes(resolved)) {
            setTimeout(() => navigateTo(resolved), 80);
        }
    })();

    // ── Back button ─────────────────────────────────────────────
    el("backBtn")?.addEventListener("click", () => {
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



    // ── Boot — runs after DOM is ready ──────────────────────────
    async function init() {
        // Fetch current user directly — don't rely on AuthGuard being present
        // (defer load order isn't guaranteed across browsers)
        let user = null;
        try {
            const res = await fetch(`${API}/auth/me`, { credentials: "include" });
            if (res.status === 401 || res.status === 403) {
                location.href = "/auth/login.html";
                return;
            }
            const data = await res.json().catch(() => ({}));
            user = data?.user || null;
        } catch {
            location.href = "/auth/login.html";
            return;
        }

        if (!user) { location.href = "/auth/login.html"; return; }

        currentUser = user;

        // Keep local cache in sync if AuthGuard is available
        if (window.AuthGuard?.saveSession) window.AuthGuard.saveSession({ user });

        fillProfile(user);
        showVerificationSection(user);
        showEmailVerificationState(user);

        // Show verification badge if action is needed
        if (
            (user.role === "OWNER" && user.kyc_status === "REJECTED") ||
            (user.role === "RESIDENT" && user.student_status === "REJECTED")
        ) {
            el("verifBadge").hidden = false;
        }

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    (async function loadCitySuggestions() {
        try {
            const res = await fetch(`${API}/locations/cities`, { credentials: "include" });
            if (!res.ok) return;
            const data = await res.json().catch(() => ({}));
            const cities = data.cities || [];
            const datalist = document.getElementById("citySuggestions");
            if (!datalist || !cities.length) return;
            datalist.innerHTML = cities
                .map(c => `<option value="${c}">`)
                .join("");
        } catch {
            // Non-fatal — field still works as plain text input
        }
    })();

    // ── Fill profile ────────────────────────────────────────────
    function fillProfile(user) {
        const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
        const init = (user.first_name?.[0] || user.email?.[0] || "U").toUpperCase();
        const roleLabel = { OWNER: "Property Owner", RESIDENT: "Resident", ADMIN: "Admin" };

        if (el("emailChangeSection")) el("emailChangeSection").hidden = true;
        // Topbar + sidebar
        if (el("sidebarAvatar")) el("sidebarAvatar").textContent = init;
        if (el("sidebarUserName")) el("sidebarUserName").textContent = name;
        if (el("sidebarUserRole")) el("sidebarUserRole").textContent = roleLabel[user.role] || user.role;

        // Profile panel
        if (el("avatarCircle")) el("avatarCircle").textContent = init;
        if (el("avatarName")) el("avatarName").textContent = name;
        if (el("avatarRole")) el("avatarRole").textContent = roleLabel[user.role] || user.role;

        // Avatar image — show photo if set, otherwise show initials circle
        const avatarImg = el("avatarImg");
        const avatarCircle = el("avatarCircle");
        const avatarRemoveBtn = el("avatarRemoveBtn");
        if (avatarImg && avatarCircle) {
            if (user.avatar_url) {
                avatarImg.src = user.avatar_url;
                avatarImg.hidden = false;
                avatarCircle.hidden = true;
                if (avatarRemoveBtn) avatarRemoveBtn.hidden = false;
            } else {
                avatarImg.hidden = true;
                avatarCircle.hidden = false;
                if (avatarRemoveBtn) avatarRemoveBtn.hidden = true;
            }
        }

        // Status badges in avatar row
        const badgesEl = el("avatarBadges");
        if (badgesEl) {
            const badges = [];
            if (user.email_verified)
                badges.push(`<span class="statusPill statusPill--verified"><i data-lucide="mail-check"></i>Email verified</span>`);
            else
                badges.push(`<span class="statusPill statusPill--unverified"><i data-lucide="mail-warning"></i>Email unverified</span>`);
            if (user.role === "OWNER") {
                const kyc = user.kyc_status || "NONE";
                if (kyc === "APPROVED")
                    badges.push(`<span class="statusPill statusPill--verified"><i data-lucide="shield-check"></i>KYC verified</span>`);
                else if (kyc === "PENDING")
                    badges.push(`<span class="statusPill statusPill--pending"><i data-lucide="clock"></i>KYC pending</span>`);
            }
            if (user.role === "RESIDENT" && user.student_verified)
                badges.push(`<span class="statusPill statusPill--student"><i data-lucide="graduation-cap"></i>Student verified</span>`);
            badgesEl.innerHTML = badges.join("");
            if (window.lucide?.createIcons) lucide.createIcons();
        }

        if (el("inputFirstName")) el("inputFirstName").value = user.first_name || "";
        if (el("inputLastName")) el("inputLastName").value = user.last_name || "";
        if (el("inputEmail")) el("inputEmail").value = user.email || "";
        if (el("inputPhone")) el("inputPhone").value = user.phone || "";
        if (el("inputBasedIn")) el("inputBasedIn").value = user.based_in || "";

        // Phone lock: OWNER with KYC PENDING or APPROVED
        const phoneInput = el("inputPhone");
        const phoneLockNote = el("phoneLockNote");
        if (phoneInput && user.role === "OWNER" && ["PENDING", "APPROVED"].includes(user.kyc_status)) {
            phoneInput.disabled = true;
            phoneInput.classList.add("fieldInput--locked");
            if (phoneLockNote) phoneLockNote.hidden = false;
        } else if (phoneInput) {
            phoneInput.disabled = false;
            phoneInput.classList.remove("fieldInput--locked");
            if (phoneLockNote) phoneLockNote.hidden = true;
        }

        // Last login display (Security panel)
        if (el("lastLoginAt") && user.last_login_at) {
            const d = new Date(user.last_login_at);
            el("lastLoginAt").textContent = d.toLocaleString("en-PH", {
                dateStyle: "medium", timeStyle: "short"
            });
        }

        // ── Right panel population ──────────────────────────────


        // Account status pill
        const rpStatusPill = el("rpStatusPill");
        if (rpStatusPill) {
            if (user.is_suspended) {
                rpStatusPill.className = "statusPill statusPill--unverified";
                rpStatusPill.innerHTML = `<i data-lucide="ban"></i>Suspended`;
            } else {
                rpStatusPill.className = "statusPill statusPill--verified";
                rpStatusPill.innerHTML = `<i data-lucide="circle-check"></i>Active`;
            }
        }

        if (el("rpRole")) el("rpRole").textContent = roleLabel[user.role] || user.role;

        if (el("rpMemberSince") && user.created_at) {
            const d = new Date(user.created_at);
            el("rpMemberSince").textContent = d.toLocaleDateString("en-PH", { month: "short", year: "numeric" });
        }

        if (el("rpLastLogin")) {
            if (user.last_login_at) {
                const d = new Date(user.last_login_at);
                el("rpLastLogin").textContent = d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
            } else {
                el("rpLastLogin").textContent = "—";
            }
        }

        // Strikes — show only if > 0
        const strikes = parseInt(user.strike_count || 0);
        const rpStrikeRow = el("rpStrikeRow");
        if (rpStrikeRow) {
            rpStrikeRow.hidden = strikes === 0;
            if (el("rpStrikes")) el("rpStrikes").textContent = `${strikes} / 5`;
        }

        // Verification rows
        const rpVerifRows = el("rpVerifRows");
        if (rpVerifRows) {
            const emailPill = user.email_verified
                ? `<span class="statusPill statusPill--verified"><i data-lucide="mail-check"></i>Verified</span>`
                : `<span class="statusPill statusPill--unverified"><i data-lucide="mail-warning"></i>Unverified</span>`;

            let verifRow2 = "";
            if (user.role === "OWNER") {
                const kyc = user.kyc_status || "NONE";
                const kycPill = kyc === "APPROVED"
                    ? `<span class="statusPill statusPill--verified"><i data-lucide="shield-check"></i>Approved</span>`
                    : kyc === "PENDING"
                        ? `<span class="statusPill statusPill--pending"><i data-lucide="clock"></i>Pending</span>`
                        : kyc === "REJECTED"
                            ? `<span class="statusPill statusPill--unverified"><i data-lucide="x-circle"></i>Rejected</span>`
                            : `<span class="statusPill" style="background:rgba(3,3,3,0.05);color:var(--muted);">Not started</span>`;
                verifRow2 = `<div class="rpRow"><span class="rpKey">Identity (KYC)</span>${kycPill}</div>`;
            } else if (user.role === "RESIDENT") {
                const stu = user.student_status || "NONE";
                const stuPill = stu === "APPROVED"
                    ? `<span class="statusPill statusPill--student"><i data-lucide="graduation-cap"></i>Approved</span>`
                    : stu === "PENDING"
                        ? `<span class="statusPill statusPill--pending"><i data-lucide="clock"></i>Pending</span>`
                        : stu === "REJECTED"
                            ? `<span class="statusPill statusPill--unverified"><i data-lucide="x-circle"></i>Rejected</span>`
                            : `<span class="statusPill" style="background:rgba(3,3,3,0.05);color:var(--muted);">Not started</span>`;
                verifRow2 = `<div class="rpRow"><span class="rpKey">Student status</span>${stuPill}</div>`;
            }

            rpVerifRows.innerHTML = `<div class="rpRow"><span class="rpKey">Email</span>${emailPill}</div>${verifRow2}`;
        }

        // Verif link label
        if (el("rpVerifLinkLabel")) {
            el("rpVerifLinkLabel").textContent = user.role === "OWNER" ? "Check KYC status" : "Verify student status";
        }

        // Tip text
        if (el("rpTipText")) {
            el("rpTipText").innerHTML = user.role === "OWNER"
                ? "<strong>Tip:</strong> Complete your KYC to publish listings to all residents."
                : "<strong>Tip:</strong> Verified students get exclusive discounts on eligible listings.";
        }

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Brand link — navigates to dashboard based on role ───────
    el("brandLink")?.addEventListener("click", (e) => {
        e.preventDefault();
        if (currentUser?.role === "OWNER") {
            location.href = "/Property-Owner/dashboard/property-owner-dashboard.html";
        } else if (currentUser?.role === "RESIDENT") {
            location.href = "/Resident/resident_home.html";
        } else {
            location.href = "/auth/login.html";
        }
    });

    // ── Right panel quick action buttons ────────────────────────
    el("rpGoSecurity")?.addEventListener("click", () => {
        document.querySelector('.sidebarNavItem[data-section="security"]')?.click();
    });
    el("rpGoVerification")?.addEventListener("click", () => {
        document.querySelector('.sidebarNavItem[data-section="verification"]')?.click();
    });
    el("rpGoLogoutAll")?.addEventListener("click", () => {
        el("logoutAllBtn")?.click();
    });

    // ── Email change toggle ─────────────────────────────────────
    // Only show the OTP + new-email fields when "Change email" is clicked
    el("changeEmailBtn")?.addEventListener("click", async () => {
        const section = el("emailChangeSection");
        if (!section) return;
        const isHidden = section.hidden;
        section.hidden = !isHidden;
        if (isHidden) {
            // Send OTP automatically when opening
            try {
                await fetch(`${API}/auth/send-otp`, {
                    method: "POST", credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: currentUser.email }),
                });
            } catch { /* non-fatal */ }
            el("inputNewEmail")?.focus();
        }
    });

    // ── Phone number validation (numbers only, PH format) ───────
    el("inputPhone")?.addEventListener("input", () => {
        const input = el("inputPhone");
        // Strip non-numeric except leading +
        let val = input.value;
        const hasPlus = val.startsWith("+");
        val = val.replace(/[^0-9]/g, "");
        if (hasPlus) val = "+" + val;
        input.value = val;

        const errEl = el("errPhone");
        if (!errEl) return;
        const digits = val.replace(/\D/g, "");
        if (digits.length > 0 && (digits.length < 10 || digits.length > 12)) {
            errEl.textContent = "Phone number must be 10–12 digits (e.g. +639XXXXXXXXX)";
        } else {
            errEl.textContent = "";
        }
    });

    // ── Avatar upload ───────────────────────────────────────────
    el("avatarUploadBtn")?.addEventListener("click", () => el("avatarFileInput")?.click());

    el("avatarFileInput")?.addEventListener("change", async () => {
        const file = el("avatarFileInput").files?.[0];
        if (!file) return;
        el("avatarFileInput").value = "";

        if (!file.type.startsWith("image/")) {
            showToast?.("Only image files accepted.", "error");
            return;
        }
        if (file.size > MAX_FILE) {
            showToast?.("Image too large. Max 5 MB.", "error");
            return;
        }

        const btn = el("avatarUploadBtn");
        const origLabel = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader"></i> Uploading…`;
        if (window.lucide?.createIcons) lucide.createIcons();

        try {
            // 1) Get Cloudinary signature for avatars folder
            const sigRes = await fetch(`${API}/uploads/sign`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folder: "vista_hr/avatars" }),
            });
            const sig = await sigRes.json().catch(() => ({}));
            if (!sigRes.ok) throw new Error(sig.error || "Signature failed.");

            // 2) Upload directly to Cloudinary
            const fd = new FormData();
            fd.append("file", file);
            fd.append("api_key", sig.apiKey);
            fd.append("timestamp", sig.timestamp);
            fd.append("signature", sig.signature);
            fd.append("folder", sig.folder);

            const upRes = await fetch(
                `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
                { method: "POST", body: fd }
            );
            const upData = await upRes.json().catch(() => ({}));
            if (!upRes.ok) throw new Error(upData.error?.message || "Upload failed.");

            const avatarUrl = upData.secure_url;

            // 3) Save URL to backend
            const saveRes = await fetch(`${API}/users/me/avatar`, {
                method: "PATCH", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ avatar_url: avatarUrl }),
            });
            const saveData = await saveRes.json().catch(() => ({}));
            if (!saveRes.ok) throw new Error(saveData.error || "Failed to save avatar.");

            // 4) Update local state + UI
            currentUser = saveData.user || currentUser;
            if (window.AuthGuard?.saveSession) window.AuthGuard.saveSession({ user: currentUser });
            fillProfile(currentUser);
            if (window.lucide?.createIcons) lucide.createIcons();

        } catch (err) {
            showMsg("saveMsg", err.message, true);
        } finally {
            btn.disabled = false;
            btn.innerHTML = origLabel;
            if (window.lucide?.createIcons) lucide.createIcons();
        }
    });

    // ── Avatar remove ───────────────────────────────────────────
    el("avatarRemoveBtn")?.addEventListener("click", async () => {
        const btn = el("avatarRemoveBtn");
        btn.disabled = true;

        try {
            const res = await fetch(`${API}/users/me/avatar`, {
                method: "PATCH", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ avatar_url: null }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to remove avatar.");

            currentUser = data.user || currentUser;
            if (window.AuthGuard?.saveSession) window.AuthGuard.saveSession({ user: currentUser });
            fillProfile(currentUser);
            if (window.lucide?.createIcons) lucide.createIcons();

        } catch (err) {
            showMsg("saveMsg", err.message, true);
        } finally {
            btn.disabled = false;
        }
    });

    // ── Save profile ────────────────────────────────────────────
    el("saveProfileBtn")?.addEventListener("click", async () => {
        const btn = el("saveProfileBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");

        const first = el("inputFirstName").value.trim();
        const last = el("inputLastName").value.trim();
        const phone = el("inputPhone").value.trim() || null;
        const basedIn = el("inputBasedIn") ? (el("inputBasedIn").value.trim() || null) : null;

        if (!first && !last) {
            showMsg("saveMsg", "Please enter at least your first or last name.", true);
            return;
        }

        // Phone validation: numbers only (with optional leading +), 10-12 digits
        if (phone) {
            const digits = phone.replace(/\D/g, "");
            if (digits.length < 10 || digits.length > 12) {
                const errEl = el("errPhone");
                if (errEl) errEl.textContent = "Phone number must be 10–12 digits (e.g. +639XXXXXXXXX)";
                return;
            }
        }

        btn.disabled = true; label.hidden = true; spinner.hidden = false;

        try {
            const res = await fetch(`${API}/users/me/profile`, {
                method: "PATCH", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ first_name: first, last_name: last, phone, based_in: basedIn }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to save.");
            currentUser = data.user || currentUser;
            if (window.AuthGuard?.saveSession) window.AuthGuard.saveSession({ user: currentUser });
            fillProfile(currentUser);
            showMsg("saveMsg", "Changes saved!", false);
        } catch (err) {
            showMsg("saveMsg", err.message, true);
        } finally {
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
        }
    });

    // ── Password toggles ────────────────────────────────────────
    document.querySelectorAll(".pwToggle").forEach(btn => {
        btn.addEventListener("click", () => {
            const input = el(btn.dataset.target);
            if (!input) return;
            const isText = input.type === "text";
            input.type = isText ? "password" : "text";
            btn.innerHTML = isText ? `<i data-lucide="eye"></i>` : `<i data-lucide="eye-off"></i>`;
            if (window.lucide?.createIcons) lucide.createIcons();
        });
    });

    // ── Password strength ───────────────────────────────────────
    el("inputNewPw")?.addEventListener("input", () => {
        const val = el("inputNewPw").value;
        const wrap = el("pwStrengthWrap");
        const fill = el("pwStrengthFill");
        const lbl = el("pwStrengthLabel");
        if (!val) { wrap.hidden = true; return; }
        wrap.hidden = false;

        let score = 0;
        if (val.length >= 8) score++;
        if (val.length >= 12) score++;
        if (/[A-Z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        const levels = [
            { pct: "20%", color: "#ef4444", label: "Weak" },
            { pct: "40%", color: "#f97316", label: "Fair" },
            { pct: "60%", color: "#eab308", label: "Okay" },
            { pct: "80%", color: "#22c55e", label: "Good" },
            { pct: "100%", color: "#15803d", label: "Strong" },
        ];
        const lvl = levels[Math.max(0, Math.min(score - 1, 4))];
        fill.style.width = lvl.pct;
        fill.style.background = lvl.color;
        lbl.textContent = lvl.label;
        lbl.style.color = lvl.color;
    });

    // ── Change password ─────────────────────────────────────────
    el("changePasswordBtn")?.addEventListener("click", async () => {
        const btn = el("changePasswordBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");

        ["errCurrentPw", "errNewPw", "errConfirmPw"].forEach(id => { el(id).textContent = ""; });
        el("pwSaveMsg").hidden = true;

        const current = el("inputCurrentPw").value;
        const newPw = el("inputNewPw").value;
        const confirm = el("inputConfirmPw").value;

        let hasErr = false;
        if (!current) { el("errCurrentPw").textContent = "Current password is required."; hasErr = true; }
        if (!newPw) { el("errNewPw").textContent = "New password is required."; hasErr = true; }
        else if (newPw.length < 8) { el("errNewPw").textContent = "At least 8 characters."; hasErr = true; }
        if (newPw && confirm !== newPw) { el("errConfirmPw").textContent = "Passwords do not match."; hasErr = true; }
        if (hasErr) return;

        btn.disabled = true; label.hidden = true; spinner.hidden = false;

        try {
            const res = await fetch(`${API}/auth/me/password`, {
                method: "PATCH", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ current_password: current, new_password: newPw, confirm_password: confirm }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const fields = data.fields || {};
                if (fields.current_password) el("errCurrentPw").textContent = fields.current_password;
                if (fields.new_password) el("errNewPw").textContent = fields.new_password;
                if (fields.confirm_password) el("errConfirmPw").textContent = fields.confirm_password;
                if (!Object.keys(fields).length) throw new Error(data.error || "Failed to update password.");
                return;
            }
            el("inputCurrentPw").value = "";
            el("inputNewPw").value = "";
            el("inputConfirmPw").value = "";
            el("pwStrengthWrap").hidden = true;
            showMsg("pwSaveMsg", "Password updated successfully!", false);
        } catch (err) {
            showMsg("pwSaveMsg", err.message, true);
        } finally {
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
        }
    });

    // ── Verification section ────────────────────────────────────
    function showVerificationSection(user) {
        if (user.role === "OWNER") {
            el("kycCard").hidden = false;
            showKycState(user.kyc_status || "NONE", user.kyc_reject_reason);
        } else if (user.role === "RESIDENT") {
            el("studentCard").hidden = false;
            showStudentState(user.student_status || "NONE", user.student_reject_reason);
        }
        // Admin: show placeholder, keep nav item for consistency
        if (user.role === "ADMIN") {
            const ph = el("adminVerifPlaceholder");
            if (ph) ph.hidden = false;
        }
    }

    function showKycState(status, reason) {
        el("kycStateNone").hidden = status !== "NONE";
        el("kycStatePending").hidden = status !== "PENDING";
        el("kycStateApproved").hidden = status !== "APPROVED";
        el("kycStateRejected").hidden = status !== "REJECTED";
        el("kycStateForm").hidden = true;
        if (status === "REJECTED" && reason) el("kycRejectReason").textContent = `Reason: ${reason}`;

        // "Verify my identity" button in NONE state
        el("kycStartBtn")?.addEventListener("click", () => {
            el("kycStateNone").hidden = true;
            el("kycStateForm").hidden = false;
            setupKycDropzones();
            if (window.lucide?.createIcons) lucide.createIcons();
        }, { once: true });

        // "Re-submit documents" button in REJECTED state
        el("kycResubmitBtn")?.addEventListener("click", () => {
            el("kycStateRejected").hidden = true;
            el("kycStateForm").hidden = false;
            setupKycDropzones();
            if (window.lucide?.createIcons) lucide.createIcons();
        }, { once: true });

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function showStudentState(status, reason) {
        el("studentStateForm").hidden = status !== "NONE" && status !== "REJECTED_RESUBMIT";
        el("studentStatePending").hidden = status !== "PENDING";
        el("studentStateApproved").hidden = status !== "APPROVED";
        el("studentStateRejected").hidden = status !== "REJECTED";

        if (status === "REJECTED" && reason) el("studentRejectReason").textContent = `Reason: ${reason}`;

        el("studentResubmitBtn")?.addEventListener("click", () => {
            el("studentStateRejected").hidden = true;
            el("studentStateForm").hidden = false;
            setupStudentDropzones();
            if (window.lucide?.createIcons) lucide.createIcons();
        }, { once: true });

        if (status === "NONE") setupStudentDropzones();
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Email verification ──────────────────────────────────────
    function showEmailVerificationState(user) {
        const verified = !!user.email_verified;
        el("emailVerifiedState").hidden = !verified;
        el("emailUnverifiedState").hidden = verified;
        if (verified && el("emailVerifiedAddress")) {
            el("emailVerifiedAddress").textContent = user.email;
        } else if (!verified) {
            // email tab removed — surface warning on the Verification nav badge instead
            if (el("verifBadge")) el("verifBadge").hidden = false;
        }
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── OTP send helper (shared by both send + resend buttons) ─────────────
    async function sendOtpCode() {
        const errEl = el("resendErr");
        errEl.hidden = true;
        el("resendMsg").hidden = true;

        const res = await fetch(`${API}/auth/send-otp`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: currentUser.email }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to send code.");
        return data;
    }

    function startResendCooldown() {
        const resendAgainBtn = el("resendOtpAgainBtn");
        const cooldownEl = el("resendCooldown");
        const secsEl = el("cooldownSecs");
        if (!resendAgainBtn || !cooldownEl) return;

        resendAgainBtn.hidden = true;
        cooldownEl.hidden = false;
        let secs = 60;
        secsEl.textContent = secs;
        const t = setInterval(() => {
            secs--;
            secsEl.textContent = secs;
            if (secs <= 0) {
                clearInterval(t);
                cooldownEl.hidden = true;
                resendAgainBtn.hidden = false;
            }
        }, 1000);
    }

    // ── Send code button (Step 1) ────────────────────────────────────────────
    el("resendOtpBtn")?.addEventListener("click", async () => {
        const btn = el("resendOtpBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");
        const errEl = el("resendErr");

        btn.disabled = true; label.hidden = true; spinner.hidden = false;

        try {
            await sendOtpCode();
            // Transition to Step 2: show OTP input, hide send button
            el("otpSendStep").hidden = true;
            el("otpEnterStep").hidden = false;
            el("otpCodeInput")?.focus();
            showMsg("resendMsg", "Code sent! Check your inbox.", false);
            startResendCooldown();
        } catch (err) {
            errEl.textContent = err.message; errEl.hidden = false;
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
        }
    });

    // ── OTP input: enable verify button when 6 digits entered ───────────────
    el("otpCodeInput")?.addEventListener("input", () => {
        const val = (el("otpCodeInput").value || "").replace(/\D/g, "").slice(0, 6);
        el("otpCodeInput").value = val;
        if (el("verifyOtpBtn")) el("verifyOtpBtn").disabled = val.length !== 6;
    });

    // ── Verify button (Step 2) ───────────────────────────────────────────────
    el("verifyOtpBtn")?.addEventListener("click", async () => {
        const btn = el("verifyOtpBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");
        const errEl = el("resendErr");
        const otp = (el("otpCodeInput")?.value || "").trim();

        if (otp.length !== 6) return;

        btn.disabled = true; label.hidden = true; spinner.hidden = false;
        errEl.hidden = true;

        try {
            const res = await fetch(`${API}/auth/verify-email`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: currentUser.email, otp }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Incorrect code. Please try again.");

            // Update local session with fresh user data
            if (data.user && window.AuthGuard?.saveSession) {
                window.AuthGuard.saveSession({ user: data.user });
                currentUser = data.user;
            }
            // Hide badge + switch to verified state
            if (el("verifBadge") && currentUser.email_verified) el("verifBadge").hidden = true;
            showMsg("resendMsg", "Email verified successfully!", false);
            if (window.lucide?.createIcons) lucide.createIcons();
        } catch (err) {
            errEl.textContent = err.message; errEl.hidden = false;
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
        }
    });

    // ── Resend code (Step 2 — inside OTP entry view) ─────────────────────────
    el("resendOtpAgainBtn")?.addEventListener("click", async () => {
        const errEl = el("resendErr");
        errEl.hidden = true;
        el("resendMsg").hidden = true;
        el("otpCodeInput").value = "";
        if (el("verifyOtpBtn")) el("verifyOtpBtn").disabled = true;

        try {
            await sendOtpCode();
            showMsg("resendMsg", "New code sent!", false);
            startResendCooldown();
        } catch (err) {
            errEl.textContent = err.message; errEl.hidden = false;
        }
    });

    // ── KYC dropzones ────────────────────────────────────────────
    function setupKycDropzones() {
        setupDropzone("dropKycFront", "inputKycFront", "dropContentKycFront", "previewKycFront", "previewImgKycFront", "removeKycFront", "errKycFront", "kycFront");
        setupDropzone("dropKycBack", "inputKycBack", "dropContentKycBack", "previewKycBack", "previewImgKycBack", "removeKycBack", "errKycBack", "kycBack");
        setupDropzone("dropKycSelfie", "inputKycSelfie", "dropContentKycSelfie", "previewKycSelfie", "previewImgKycSelfie", "removeKycSelfie", "errKycSelfie", "kycSelfie");
        el("submitKycBtn")?.addEventListener("click", handleKycSubmit, { once: true });
    }

    function updateKycBtn() {
        const btn = el("submitKycBtn");
        if (btn) btn.disabled = !uploads.kycFront || !uploads.kycBack;
    }

    async function handleKycSubmit() {
        const btn = el("submitKycBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");
        const errEl = el("kycGlobalErr");

        if (!uploads.kycFront || !uploads.kycBack) return;
        errEl.hidden = true; btn.disabled = true; label.hidden = true; spinner.hidden = false;

        try {
            let frontUrl, backUrl, selfieUrl = null;

            try { frontUrl = await uploadToCloudinary(uploads.kycFront, "vista_hr/kyc"); }
            catch { el("errKycFront").textContent = "ID front upload failed."; throw new Error("upload_failed"); }

            try { backUrl = await uploadToCloudinary(uploads.kycBack, "vista_hr/kyc"); }
            catch { el("errKycBack").textContent = "ID back upload failed."; throw new Error("upload_failed"); }

            if (uploads.kycSelfie) {
                try { selfieUrl = await uploadToCloudinary(uploads.kycSelfie, "vista_hr/kyc"); }
                catch { el("errKycSelfie").textContent = "Selfie upload failed."; throw new Error("upload_failed"); }
            }

            const res = await fetch(`${API}/kyc/submit`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id_front_url: frontUrl, id_back_url: backUrl, selfie_url: selfieUrl }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Submission failed.");

            currentUser = data.user || currentUser;
            if (window.AuthGuard?.saveSession) window.AuthGuard.saveSession({ user: currentUser });
            // Reset KYC upload state
            uploads.kycFront = null; uploads.kycBack = null; uploads.kycSelfie = null;
            el("kycStateForm").hidden = true;
            showKycState("PENDING");
            fillProfile(currentUser);
        } catch (err) {
            if (err.message !== "upload_failed") { errEl.textContent = err.message; errEl.hidden = false; }
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
            btn.addEventListener("click", handleKycSubmit, { once: true });
        }
    }

    // ── Student dropzones ───────────────────────────────────────
    function setupStudentDropzones() {
        setupDropzone("dropStudentId", "inputStudentId", "dropContentStudentId", "previewStudentId", "previewImgStudentId", "removeStudentId", "errStudentId", "studentId");
        setupDropzone("dropCor", "inputCor", "dropContentCor", "previewCor", "previewImgCor", "removeCor", "errCor", "cor");
        el("submitStudentBtn")?.addEventListener("click", handleStudentSubmit, { once: true });
    }

    function setupDropzone(dropId, inputId, contentId, previewId, imgId, removeId, errId, slot) {
        const drop = el(dropId), input = el(inputId),
            content = el(contentId), preview = el(previewId),
            img = el(imgId), remove = el(removeId),
            errEl = errId ? el(errId) : null;
        if (!drop || !input) return;

        drop.addEventListener("click", e => { if (e.target.closest(".removeBtn")) return; input.click(); });
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
            if (slot.startsWith("kyc")) updateKycBtn();
            else updateStudentBtn();
        });
    }

    function handleFile(file, slot, img, content, preview, drop, errEl) {
        if (errEl) errEl.textContent = "";
        if (!file.type.startsWith("image/")) { if (errEl) errEl.textContent = "Only image files accepted."; return; }
        if (file.size > MAX_FILE) { if (errEl) errEl.textContent = "File too large. Max 5 MB."; return; }
        const reader = new FileReader();
        reader.onload = e => {
            if (img) img.src = e.target.result;
            if (preview) preview.hidden = false;
            if (content) content.hidden = true;
            drop.classList.add("hasFile");
        };
        reader.readAsDataURL(file);
        uploads[slot] = file;
        if (slot.startsWith("kyc")) updateKycBtn();
        else updateStudentBtn();
    }

    function updateStudentBtn() {
        const btn = el("submitStudentBtn");
        if (btn) btn.disabled = !uploads.studentId || !uploads.cor;
    }

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

    async function handleStudentSubmit() {
        const btn = el("submitStudentBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");
        const errEl = el("studentGlobalErr");

        if (!uploads.studentId || !uploads.cor) return;
        errEl.hidden = true; btn.disabled = true; label.hidden = true; spinner.hidden = false;

        try {
            let idUrl, corUrl;
            try { idUrl = await uploadToCloudinary(uploads.studentId, "vista_hr/student_docs"); }
            catch { el("errStudentId").textContent = "School ID upload failed."; throw new Error("upload_failed"); }

            try { corUrl = await uploadToCloudinary(uploads.cor, "vista_hr/student_docs"); }
            catch { el("errCor").textContent = "CoR upload failed."; throw new Error("upload_failed"); }

            const res = await fetch(`${API}/student/submit`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ student_id_url: idUrl, cor_url: corUrl }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Submission failed.");

            currentUser = data.user || currentUser;
            if (window.AuthGuard?.saveSession) window.AuthGuard.saveSession({ user: currentUser });
            showStudentState("PENDING");
        } catch (err) {
            if (err.message !== "upload_failed") { errEl.textContent = err.message; errEl.hidden = false; }
            btn.disabled = false; label.hidden = false; spinner.hidden = true;
            // Re-attach handler since { once: true } consumed it
            btn.addEventListener("click", handleStudentSubmit, { once: true });
        }
    }

    // ── Logout from all devices (modal) ────────────────────────
    el("logoutAllBtn")?.addEventListener("click", () => {
        el("logoutAllOverlay").hidden = false;
        if (window.lucide?.createIcons) lucide.createIcons();
    });
    el("logoutAllCancelBtn")?.addEventListener("click", () => {
        el("logoutAllOverlay").hidden = true;
    });
    el("logoutAllOverlay")?.addEventListener("click", (e) => {
        if (e.target === el("logoutAllOverlay")) el("logoutAllOverlay").hidden = true;
    });
    el("logoutAllConfirmBtn")?.addEventListener("click", async () => {
        const btn = el("logoutAllConfirmBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");
        btn.disabled = true; if (label) label.hidden = true; if (spinner) spinner.hidden = false;
        try {
            const res = await fetch(`${API}/users/me/logout-all`, {
                method: "POST", credentials: "include",
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed.");
            location.href = "/auth/login.html";
        } catch (err) {
            el("logoutAllOverlay").hidden = true;
            showMsg("pwSaveMsg", err.message, true);
            btn.disabled = false; if (label) label.hidden = false; if (spinner) spinner.hidden = true;
        }
    });

    // ── Deactivate account ─────────────────────────────────────
    el("deactivateBtn")?.addEventListener("click", async () => {
        const blockedMsg = el("deactivateBlockedMsg");
        const confirmBtn = el("deactivateConfirmBtn");
        if (blockedMsg) { blockedMsg.hidden = true; blockedMsg.textContent = ""; }
        if (el("deactivateErr")) el("deactivateErr").textContent = "";
        if (el("deactivatePw")) el("deactivatePw").value = "";
        if (confirmBtn) confirmBtn.disabled = false;

        // Check for active bookings that would block deactivation
        try {
            const res = await fetch(`${API}/bookings`, { credentials: "include" });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                const bookings = data.bookings || [];
                const active = bookings.filter(b =>
                    ["PENDING", "APPROVED", "ACTIVE"].includes(b.status)
                );
                if (active.length > 0) {
                    const counts = {};
                    active.forEach(b => { counts[b.status] = (counts[b.status] || 0) + 1; });
                    const parts = [];
                    if (counts.PENDING) parts.push(`${counts.PENDING} pending`);
                    if (counts.APPROVED) parts.push(`${counts.APPROVED} approved`);
                    if (counts.ACTIVE) parts.push(`${counts.ACTIVE} active`);
                    if (blockedMsg) {
                        blockedMsg.innerHTML = `<strong>Cannot deactivate:</strong> You have ${parts.join(", ")} booking(s) that must be resolved first. Please cancel or complete them before deactivating.`;
                        blockedMsg.hidden = false;
                    }
                    if (confirmBtn) confirmBtn.disabled = true;
                }
            }
        } catch { /* non-fatal — allow modal to open, backend will also guard */ }

        el("deactivateOverlay").hidden = false;
        if (window.lucide?.createIcons) lucide.createIcons();
    });

    el("deactivateCancelBtn")?.addEventListener("click", () => {
        el("deactivateOverlay").hidden = true;
    });
    el("deactivateOverlay")?.addEventListener("click", (e) => {
        if (e.target === el("deactivateOverlay")) el("deactivateOverlay").hidden = true;
    });

    el("deactivateConfirmBtn")?.addEventListener("click", async () => {
        const pw = el("deactivatePw")?.value || "";
        const errEl = el("deactivateErr");
        if (!pw) { errEl.textContent = "Password is required."; return; }

        const btn = el("deactivateConfirmBtn");
        const label = btn.querySelector(".btnLabel");
        const spinner = btn.querySelector(".btnSpinner");
        btn.disabled = true; if (label) label.hidden = true; if (spinner) spinner.hidden = false;
        errEl.textContent = "";

        try {
            // Verify password first
            const verifyRes = await fetch(`${API}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: currentUser.email, password: pw }),
                credentials: "include",
            });
            if (!verifyRes.ok) {
                errEl.textContent = "Incorrect password.";
                btn.disabled = false; if (label) label.hidden = false; if (spinner) spinner.hidden = true;
                return;
            }

            // Self-service deactivation (checks for active bookings on backend)
            const res = await fetch(`${API}/users/me/deactivate`, {
                method: "POST", credentials: "include",
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to deactivate.");
            location.href = "/auth/login.html";
        } catch (err) {
            errEl.textContent = err.message;
            btn.disabled = false; if (label) label.hidden = false; if (spinner) spinner.hidden = true;
        }
    });

    // ── Util ────────────────────────────────────────────────────
    function showMsg(id, msg, isError) {
        const msgEl = el(id);
        if (!msgEl) return;
        msgEl.textContent = (isError ? "⚠ " : "✓ ") + msg;
        msgEl.className = "saveMsg" + (isError ? " error" : "");
        msgEl.hidden = false;
        setTimeout(() => { msgEl.hidden = true; }, 4000);
    }
})();