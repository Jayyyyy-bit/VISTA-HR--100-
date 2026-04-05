(() => {
    const LS_SESSION_KEY = "vista_session_user";
    const LS_LAST_USER_ID_KEY = "vista_last_user_id";
    const API_BASE = "/api";

    const ROUTE_ROLES = "/Login_Register_Page/Signup/roles.html";
    const ROUTE_ADMIN_USERS = "/admin/user-management/user-management.html";
    const ROUTE_OWNER_DASHBOARD = "/Property-Owner/dashboard/property-owner-dashboard.html";
    const ROUTE_OWNER_WELCOME = "/PO-after-signup/PO_welcome-page.html";
    const ROUTE_RESIDENT_HOME = "/Resident/resident_home.html";

    const form = document.getElementById("loginForm");
    const emailEl = document.getElementById("email");
    const pwEl = document.getElementById("password");
    const errBox = document.getElementById("errBox");

    const togglePw = document.getElementById("togglePw");
    const goRolesBtn = document.getElementById("goRolesBtn");
    const goSignupBtn = document.getElementById("goSignupBtn");
    const forgotBtn = document.getElementById("forgotBtn");

    function setError(msg) {
        if (!errBox) return;
        errBox.textContent = msg || "";
        if (msg) {
            const card = document.querySelector(".card");
            card?.classList.remove("shake");
            void card?.offsetWidth;
            card?.classList.add("shake");
        }
    }

    function redirectByRole(user) {
        const role = String(user?.role || "").toUpperCase();

        if (role === "ADMIN") {
            window.location.replace(ROUTE_ADMIN_USERS);
            return;
        }

        if (role === "OWNER") {
            const done = Number(user?.has_completed_onboarding) === 1;
            window.location.replace(done ? ROUTE_OWNER_DASHBOARD : ROUTE_OWNER_WELCOME);
            return;
        }

        if (role === "RESIDENT") {
            window.location.replace(ROUTE_RESIDENT_HOME);
            return;
        }

        window.location.replace(ROUTE_ROLES);
    }

    function clearWizardDraftCache() {
        localStorage.removeItem("vista_draft_index");
        localStorage.removeItem("vista_draft_active");
        localStorage.removeItem("vista_listing_map");

        Object.keys(localStorage)
            .filter(
                (k) =>
                    k.startsWith("vista_listing_draft:") ||
                    k.startsWith("listing_id:")
            )
            .forEach((k) => localStorage.removeItem(k));
    }

    document.addEventListener("DOMContentLoaded", async () => {
        try {
            const me = await AuthGuard.fetchMe();
            if (me.ok && me.data?.user?.role) {
                redirectByRole(me.data.user);
                return;
            }
        } catch (e) {
            // ignore
        }
    });

    togglePw?.addEventListener("click", () => {
        const isPw = pwEl.type === "password";
        pwEl.type = isPw ? "text" : "password";
        togglePw.setAttribute("aria-label", isPw ? "Hide password" : "Show password");

        const ic = togglePw.querySelector("[data-lucide]");
        if (ic) ic.setAttribute("data-lucide", isPw ? "eye-off" : "eye");
        window.lucide?.createIcons?.();
    });

    goRolesBtn?.addEventListener("click", () => (window.location.href = ROUTE_ROLES));
    goSignupBtn?.addEventListener("click", () => (window.location.href = ROUTE_ROLES));
    // ── FORGOT PASSWORD FLOW (Meta-style) ────────────────
    const API_FP = "/api";
    let _fpEmail = "";
    let _fpResetToken = "";
    let _fpCountdownTimer = null;

    const fpSteps = ["fpStep1", "fpStep2", "fpStep3", "fpStep4", "fpStep5"];
    function fpShow(id) {
        fpSteps.forEach(s => {
            const el = document.getElementById(s);
            if (el) el.hidden = (s !== id);
        });
        if (window.lucide?.createIcons) lucide.createIcons();
    }
    function fpOpen() {
        _fpEmail = ""; _fpResetToken = "";
        const em = document.getElementById("fpEmail");
        if (em) em.value = "";
        clearOtp(); hideAllErrs();
        fpShow("fpStep1");
        document.getElementById("fpOverlay").hidden = false;
        document.getElementById("fpModal").hidden = false;
        document.body.style.overflow = "hidden";
        document.getElementById("fpEmail")?.focus();
    }
    function fpClose() {
        document.getElementById("fpOverlay").hidden = true;
        document.getElementById("fpModal").hidden = true;
        document.body.style.overflow = "";
        clearCountdown();
    }
    function showFpErr(id, msg) { const e = document.getElementById(id); if (e) { e.textContent = msg; e.hidden = false; } }
    function hideFpErr(id) { const e = document.getElementById(id); if (e) e.hidden = true; }
    function hideAllErrs() { ["fpErr1", "fpErr3", "fpErr4"].forEach(hideFpErr); }
    function setLoading(btnId, spinId, lblId, on) {
        const b = document.getElementById(btnId), s = document.getElementById(spinId), l = document.getElementById(lblId);
        if (b) b.disabled = on; if (s) s.hidden = !on; if (l) l.hidden = on;
    }
    function clearOtp() {
        document.querySelectorAll(".fp-otp-box").forEach(b => b.value = "");
        const v = document.getElementById("fpVerify"); if (v) v.disabled = true;
    }
    function getOtp() { return [...document.querySelectorAll(".fp-otp-box")].map(b => b.value).join(""); }
    document.querySelectorAll(".fp-otp-box").forEach((box, i, arr) => {
        box.addEventListener("input", () => {
            box.value = box.value.replace(/[^0-9]/g, "").slice(-1);
            if (box.value && i < arr.length - 1) arr[i + 1].focus();
            const v = document.getElementById("fpVerify"); if (v) v.disabled = getOtp().length < 6;
        });
        box.addEventListener("keydown", e => {
            if (e.key === "Backspace" && !box.value && i > 0) arr[i - 1].focus();
        });
        box.addEventListener("paste", e => {
            e.preventDefault();
            const digits = (e.clipboardData.getData("text") || "").replace(/[^0-9]/g, "").slice(0, 6);
            arr.forEach((b, j) => { b.value = digits[j] || ""; });
            const v = document.getElementById("fpVerify"); if (v) v.disabled = digits.length < 6;
            if (digits.length > 0) arr[Math.min(digits.length, 5)].focus();
        });
    });
    function startCountdown(sec = 60) {
        clearCountdown();
        const cEl = document.getElementById("fpCountdown");
        const rBtn = document.getElementById("fpResend");
        const rLbl = document.getElementById("fpResendLabel");
        if (rBtn) rBtn.hidden = true; if (rLbl) rLbl.hidden = true;
        let left = sec;
        function tick() {
            if (cEl) cEl.textContent = `Resend in ${left}s`;
            if (left <= 0) { if (cEl) cEl.textContent = ""; if (rBtn) rBtn.hidden = false; if (rLbl) rLbl.hidden = false; return; }
            left--; _fpCountdownTimer = setTimeout(tick, 1000);
        }
        tick();
    }
    function clearCountdown() { clearTimeout(_fpCountdownTimer); const c = document.getElementById("fpCountdown"); if (c) c.textContent = ""; }

    forgotBtn?.addEventListener("click", fpOpen);
    ["fpClose1", "fpCancel1", "fpCancel2", "fpCancel3", "fpCancel4"].forEach(id => {
        document.getElementById(id)?.addEventListener("click", fpClose);
    });
    document.getElementById("fpOverlay")?.addEventListener("click", fpClose);

    // Step 1: Search account
    document.getElementById("fpSearch")?.addEventListener("click", async () => {
        const email = (document.getElementById("fpEmail")?.value || "").trim().toLowerCase();
        if (!email) { showFpErr("fpErr1", "Please enter your email address."); return; }
        hideFpErr("fpErr1");
        setLoading("fpSearch", "fpSpin1", "fpSearchLabel", true);
        try {
            const res = await fetch(`${API_FP}/auth/forgot-password`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed.");
            if (!data.found) { showFpErr("fpErr1", "No account found with that email address."); return; }
            _fpEmail = email;
            const name = data.masked_name || "Account holder";
            document.getElementById("fpAccountName").textContent = name;
            document.getElementById("fpAccountRole").textContent = data.role || "";
            document.getElementById("fpAccountAv").textContent = name[0]?.toUpperCase() || "?";
            document.getElementById("fpMaskedEmail").textContent = data.masked_email || email;
            fpShow("fpStep2");
        } catch (err) { showFpErr("fpErr1", err.message); }
        finally { setLoading("fpSearch", "fpSpin1", "fpSearchLabel", false); }
    });

    document.getElementById("fpNotYou")?.addEventListener("click", () => fpShow("fpStep1"));
    document.getElementById("fpBack2")?.addEventListener("click", () => fpShow("fpStep1"));
    document.getElementById("fpBack3")?.addEventListener("click", () => fpShow("fpStep2"));

    // Step 2: Send OTP
    document.getElementById("fpSendOtp")?.addEventListener("click", async () => {
        setLoading("fpSendOtp", "fpSpin2", "fpSendOtpLabel", true);
        try {
            const res = await fetch(`${API_FP}/auth/forgot-password/send-otp`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: _fpEmail }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to send code."); }
            clearOtp();
            const sub = document.getElementById("fpStep3Sub");
            if (sub) sub.textContent = `We sent a 6-digit code to ${document.getElementById("fpMaskedEmail")?.textContent || _fpEmail}.`;
            fpShow("fpStep3");
            startCountdown(60);
            document.querySelector(".fp-otp-box")?.focus();
        } catch (err) { showError(err.message); }
        finally { setLoading("fpSendOtp", "fpSpin2", "fpSendOtpLabel", false); }
    });

    document.getElementById("fpResend")?.addEventListener("click", async () => {
        try {
            await fetch(`${API_FP}/auth/forgot-password/send-otp`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: _fpEmail }),
            });
            clearOtp(); startCountdown(60); hideFpErr("fpErr3");
        } catch { /* silent */ }
    });

    // Step 3: Verify OTP
    document.getElementById("fpVerify")?.addEventListener("click", async () => {
        const otp = getOtp(); if (otp.length < 6) return;
        hideFpErr("fpErr3");
        setLoading("fpVerify", "fpSpin3", "fpVerifyLabel", true);
        try {
            const res = await fetch(`${API_FP}/auth/verify-reset-otp`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: _fpEmail, otp }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Invalid code.");
            _fpResetToken = data.reset_token;
            clearCountdown(); fpShow("fpStep4");
            document.getElementById("fpNewPw")?.focus();
        } catch (err) { showFpErr("fpErr3", err.message); }
        finally { setLoading("fpVerify", "fpSpin3", "fpVerifyLabel", false); }
    });

    document.getElementById("fpEye")?.addEventListener("click", () => {
        const pw = document.getElementById("fpNewPw");
        if (!pw) return;
        pw.type = pw.type === "password" ? "text" : "password";
        if (window.lucide?.createIcons) lucide.createIcons();
    });

    // Step 4: Reset password
    document.getElementById("fpReset")?.addEventListener("click", async () => {
        const newPw = (document.getElementById("fpNewPw")?.value || "").trim();
        const confPw = (document.getElementById("fpConfirmPw")?.value || "").trim();
        hideFpErr("fpErr4");
        if (newPw.length < 8) { showFpErr("fpErr4", "Password must be at least 8 characters."); return; }
        if (newPw !== confPw) { showFpErr("fpErr4", "Passwords do not match."); return; }
        if (!_fpResetToken) { showFpErr("fpErr4", "Session expired. Please start again."); return; }
        setLoading("fpReset", "fpSpin4", "fpResetLabel", true);
        try {
            const res = await fetch(`${API_FP}/auth/reset-password`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: _fpEmail, reset_token: _fpResetToken, new_password: newPw }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Reset failed.");
            fpShow("fpStep5");
            if (window.lucide?.createIcons) lucide.createIcons();
        } catch (err) { showFpErr("fpErr4", err.message); }
        finally { setLoading("fpReset", "fpSpin4", "fpResetLabel", false); }
    });

    // Step 5: Done
    document.getElementById("fpDone")?.addEventListener("click", () => {
        fpClose();
        const em = document.getElementById("email");
        if (em && _fpEmail) em.value = _fpEmail;
        document.getElementById("password")?.focus();
    });

    form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        setError("");

        const email = (emailEl?.value || "").trim().toLowerCase();
        const password = (pwEl?.value || "").trim();

        if (!email || !password) {
            setError("Please enter your email and password.");
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                // EMAIL_NOT_VERIFIED no longer blocks login — soft-gated per action
                if (false && data?.code === "EMAIL_NOT_VERIFIED") {
                    location.href = `/auth/verify-email.html?email=${encodeURIComponent(email)}`;
                    return;
                }
                setError(data?.message || data?.error || "Invalid email/password.");
                return;
            }

            const newUserId = String(data.user?.id ?? "");
            const lastUserId = localStorage.getItem(LS_LAST_USER_ID_KEY);

            if (lastUserId && newUserId && lastUserId !== newUserId) {
                clearWizardDraftCache();
            }

            localStorage.setItem(
                LS_SESSION_KEY,
                JSON.stringify({
                    user: data.user,
                    role: data.user?.role,
                    createdAt: new Date().toISOString(),
                })
            );

            localStorage.setItem(LS_LAST_USER_ID_KEY, newUserId);

            redirectByRole(data.user);
        } catch (err) {
            console.error(err);
            setError("Server unavailable. Please try again.");
        }
    });
})();