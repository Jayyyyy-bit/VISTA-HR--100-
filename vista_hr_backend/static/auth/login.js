(() => {
    const LS_SESSION_KEY = "vista_session_user";
    const LS_LAST_USER_ID_KEY = "vista_last_user_id";
    const API_BASE = "/api";

    // ── Failed-login lockout ladder ─────────────────────────
    // Stage 0: 0–4 wrong          → no lock
    // Stage 1: 5th wrong           → lock 3 min   (window attempts 1–5)
    // Stage 2: 10th wrong          → lock 15 min  (window attempts 6–10)
    // Stage 3: 13th wrong          → lock 24 hr   (window attempts 11–13)
    const LOCK_KEY = "vista_login_lockout_v1"; // { [email]: { wrong: N, lockedUntil: ms, stage: 0|1|2|3 } }
    const LOCK_LADDER = [
        { threshold: 5, duration: 3 * 60 * 1000, label: "3 minutes", stage: 1 },
        { threshold: 10, duration: 15 * 60 * 1000, label: "15 minutes", stage: 2 },
        { threshold: 13, duration: 24 * 60 * 60 * 1000, label: "24 hours", stage: 3 },
    ];

    function loadLockMap() {
        try { return JSON.parse(localStorage.getItem(LOCK_KEY) || "{}"); }
        catch { return {}; }
    }
    function saveLockMap(m) { localStorage.setItem(LOCK_KEY, JSON.stringify(m)); }

    function getLockState(email) {
        const map = loadLockMap();
        return map[email] || { wrong: 0, lockedUntil: 0, stage: 0 };
    }
    function setLockState(email, state) {
        const map = loadLockMap();
        map[email] = state;
        saveLockMap(map);
    }
    function clearLockState(email) {
        const map = loadLockMap();
        delete map[email];
        saveLockMap(map);
    }

    function isLocked(email) {
        const s = getLockState(email);
        return s.lockedUntil && s.lockedUntil > Date.now();
    }

    function registerWrongAttempt(email) {
        const s = getLockState(email);
        s.wrong = (s.wrong || 0) + 1;

        // Find the highest ladder step whose threshold we just crossed
        let triggered = null;
        for (const step of LOCK_LADDER) {
            if (s.wrong === step.threshold) { triggered = step; break; }
        }
        if (triggered) {
            s.lockedUntil = Date.now() + triggered.duration;
            s.stage = triggered.stage;
        }
        setLockState(email, s);
        return { state: s, triggered };
    }

    // ── Lockout modal ───────────────────────────────────────
    let _lockTimer = null;

    function openLockModal(email) {
        const s = getLockState(email);
        const overlay = document.getElementById("lockOverlay");
        const modal = document.getElementById("lockModal");
        const title = document.getElementById("lockTitle");
        const sub = document.getElementById("lockSub");
        const info = document.getElementById("lockStageInfo");
        if (!overlay || !modal) return;

        const stageCopy = {
            1: { title: "Too many failed attempts", sub: "You've entered the wrong password 5 times. Take a short break.", info: "Next wrong attempts: 5 more will lock this account for 15 minutes." },
            2: { title: "Account temporarily locked", sub: "You've entered the wrong password 10 times in a row.", info: "Next wrong attempts: 3 more will lock this account for 24 hours." },
            3: { title: "Account locked for 24 hours", sub: "For your security, this account is locked due to repeated failed logins.", info: "If this wasn't you, reset your password now." },
        }[s.stage] || { title: "Too many failed attempts", sub: "", info: "" };

        title.textContent = stageCopy.title;
        sub.textContent = stageCopy.sub;
        info.textContent = stageCopy.info;

        overlay.hidden = false;
        modal.hidden = false;
        if (window.lucide?.createIcons) lucide.createIcons();

        // Start countdown
        const cd = document.getElementById("lockCountdown");
        function tick() {
            const remaining = s.lockedUntil - Date.now();
            if (remaining <= 0) {
                cd.textContent = "0:00";
                clearInterval(_lockTimer); _lockTimer = null;
                closeLockModal();
                // Reset wrong counter for this stage — user gets fresh attempts
                const cur = getLockState(email);
                cur.lockedUntil = 0;
                setLockState(email, cur);
                return;
            }
            const totalSec = Math.ceil(remaining / 1000);
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            const sec = totalSec % 60;
            cd.textContent = h > 0
                ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
                : `${m}:${String(sec).padStart(2, "0")}`;
        }
        tick();
        if (_lockTimer) clearInterval(_lockTimer);
        _lockTimer = setInterval(tick, 1000);
    }

    function closeLockModal() {
        const overlay = document.getElementById("lockOverlay");
        const modal = document.getElementById("lockModal");
        if (overlay) overlay.hidden = true;
        if (modal) modal.hidden = true;
        if (_lockTimer) { clearInterval(_lockTimer); _lockTimer = null; }
    }

    // "Reset password instead" button opens the forgot-password flow
    document.getElementById("lockForgotBtn")?.addEventListener("click", () => {
        closeLockModal();
        document.getElementById("forgotBtn")?.click();
    });

    const ROUTE_ROLES = "/Login_Register_Page/Signup/roles.html";
    const ROUTE_ADMIN_USERS = "/admin/user-management/user-management.html";
    const ROUTE_OWNER_DASHBOARD = "/Property-Owner/dashboard/property-owner-dashboard.html";
    const ROUTE_OWNER_WELCOME = "/PO-after-signup/PO_welcome-page.html";
    const ROUTE_RESIDENT_HOME = "/Resident/resident_home.html";

    const form = document.getElementById("loginForm");
    const emailEl = document.getElementById("email");
    const pwEl = document.getElementById("password");
    const errBox = document.getElementById("errBox");
    const rememberEl = document.getElementById("rememberMe"); // add this

    // Pre-fill email if previously remembered
    const rememberedEmail = localStorage.getItem("vista_remembered_email");
    if (rememberedEmail && emailEl) {
        emailEl.value = rememberedEmail;
        if (rememberEl) rememberEl.checked = true;
    }

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
        let dest = ROUTE_ROLES;
        let msg = "Welcome back!";

        if (role === "ADMIN") {
            dest = ROUTE_ADMIN_USERS;
            msg = "Loading admin panel…";
        } else if (role === "OWNER") {
            const done = Number(user?.has_completed_onboarding) === 1;
            dest = done ? ROUTE_OWNER_DASHBOARD : ROUTE_OWNER_WELCOME;
            msg = "Welcome back, Owner!";
        } else if (role === "RESIDENT") {
            dest = ROUTE_RESIDENT_HOME;
            msg = "Welcome back!";
        }

        sessionStorage.setItem("loadingDest", dest);
        sessionStorage.setItem("loadingMsg", msg);
        window.location.replace("/auth/loading.html");
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

    // Google SSO — default RESIDENT, role can be passed via ?role=OWNER
    document.getElementById("googleLoginBtn")?.addEventListener("click", () => {
        const role = new URLSearchParams(window.location.search).get("role") || "RESIDENT";
        window.location.href = `${API_BASE}/auth/google?role=${role}`;
    });

    // Show Google error if redirected back with error
    const googleError = new URLSearchParams(window.location.search).get("google_error");
    if (googleError) setError(decodeURIComponent(googleError));

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

    forgotBtn?.addEventListener("click", () => {
        const email = (emailEl?.value || "").trim().toLowerCase();
        // Check if this email is a Google account — can't reset via OTP
        // We do a quick lookup to check has_google flag
        fpOpen();
    });
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

        // Gate: still locked?
        if (isLocked(email)) {
            openLockModal(email);
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

                // Register the wrong attempt. Only advance the ladder for credential failures,
                // not for server errors (5xx).
                if (res.status >= 400 && res.status < 500) {
                    const { state, triggered } = registerWrongAttempt(email);
                    if (triggered) {
                        openLockModal(email);
                        return;
                    }
                    // Show remaining attempts before next lockout
                    const nextStep = LOCK_LADDER.find(s => s.threshold > state.wrong);
                    const remaining = nextStep ? (nextStep.threshold - state.wrong) : 0;
                    const base = data?.message || data?.error || "Invalid email/password.";
                    setError(remaining > 0
                        ? `${base} ${remaining} attempt${remaining === 1 ? "" : "s"} left before temporary lockout.`
                        : base);
                } else {
                    setError(data?.message || data?.error || "Server error. Please try again.");
                }
                return;
            }

            // Success → clear lockout state for this email
            clearLockState(email);

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

            // Remember Me
            if (rememberEl?.checked) {
                localStorage.setItem("vista_remembered_email", email);
            } else {
                localStorage.removeItem("vista_remembered_email");
            }

            redirectByRole(data.user);
        } catch (err) {
            console.error(err);
            setError("Server unavailable. Please try again.");
        }
    });
})();