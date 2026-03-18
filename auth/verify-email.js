/* auth/verify-email.js */
(() => {
    const API_BASE = "http://127.0.0.1:5000/api";

    // Read email + role + next destination from query string
    // e.g. /auth/verify-email.html?email=foo@bar.com&role=OWNER&next=/Property-Owner/verification/verify.html
    const params = new URLSearchParams(location.search);
    const email = decodeURIComponent(params.get("email") || "");
    const role = (params.get("role") || "").toUpperCase();
    const next = params.get("next") || null;

    if (!email) {
        // Nothing to verify — go home
        location.replace("/auth/login.html");
        return;
    }

    // ── DOM refs ──────────────────────────────────────────────
    const emailDisplay = document.getElementById("emailDisplay");
    const otpBoxes = Array.from(document.querySelectorAll(".otpBox"));
    const verifyBtn = document.getElementById("verifyBtn");
    const btnLabel = verifyBtn.querySelector(".btnLabel");
    const btnSpinner = verifyBtn.querySelector(".btnSpinner");
    const errMsg = document.getElementById("errMsg");
    const resendBtn = document.getElementById("resendBtn");
    const resendTimer = document.getElementById("resendTimer");
    const verifyCard = document.getElementById("verifyCard");
    const successCard = document.getElementById("successCard");
    const successSub = document.getElementById("successSub");
    const continueBtn = document.getElementById("continueBtn");

    if (emailDisplay) emailDisplay.textContent = email;

    // ── OTP input wiring ──────────────────────────────────────
    otpBoxes.forEach((box, i) => {
        box.addEventListener("input", e => {
            const val = e.target.value.replace(/\D/g, "").slice(-1);
            box.value = val;
            box.classList.toggle("filled", !!val);
            clearErr();
            if (val && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
            updateVerifyBtn();
        });

        box.addEventListener("keydown", e => {
            if (e.key === "Backspace" && !box.value && i > 0) {
                otpBoxes[i - 1].value = "";
                otpBoxes[i - 1].classList.remove("filled");
                otpBoxes[i - 1].focus();
                updateVerifyBtn();
            }
            // Allow paste on first box
            if (e.key === "v" && (e.ctrlKey || e.metaKey)) return;
        });

        box.addEventListener("paste", e => {
            e.preventDefault();
            const pasted = (e.clipboardData || window.clipboardData)
                .getData("text").replace(/\D/g, "").slice(0, 6);
            pasted.split("").forEach((ch, j) => {
                if (otpBoxes[j]) {
                    otpBoxes[j].value = ch;
                    otpBoxes[j].classList.add("filled");
                }
            });
            const nextEmpty = otpBoxes.find(b => !b.value);
            (nextEmpty || otpBoxes[otpBoxes.length - 1]).focus();
            clearErr();
            updateVerifyBtn();
        });

        // Mobile: select all on focus for easy replacement
        box.addEventListener("focus", () => box.select());
    });

    function getOtp() {
        return otpBoxes.map(b => b.value).join("");
    }

    function updateVerifyBtn() {
        verifyBtn.disabled = getOtp().length < 6;
    }

    function clearErr() {
        errMsg.hidden = true;
        errMsg.textContent = "";
        otpBoxes.forEach(b => b.classList.remove("error"));
    }

    function showErr(msg) {
        errMsg.textContent = msg;
        errMsg.hidden = false;
        otpBoxes.forEach(b => b.classList.add("error"));
        // Shake animation re-trigger
        otpBoxes.forEach(b => {
            b.classList.remove("error");
            void b.offsetWidth;
            b.classList.add("error");
        });
    }

    function setLoading(on) {
        verifyBtn.disabled = on;
        btnLabel.hidden = on;
        btnSpinner.hidden = !on;
    }

    // ── Verify ────────────────────────────────────────────────
    verifyBtn.addEventListener("click", async () => {
        const otp = getOtp();
        if (otp.length < 6) return;

        clearErr();
        setLoading(true);

        try {
            const res = await fetch(`${API_BASE}/auth/verify-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email, otp }),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                showErr(data.error || "Incorrect code. Please try again.");
                setLoading(false);
                return;
            }

            // Update session cache
            if (data.user && window.AuthGuard?.saveSession) {
                window.AuthGuard.saveSession({ user: data.user });
            }

            showSuccess(data.user);

        } catch {
            showErr("Network error. Please check your connection.");
            setLoading(false);
        }
    });

    // Allow Enter to submit
    document.addEventListener("keydown", e => {
        if (e.key === "Enter" && !verifyBtn.disabled) verifyBtn.click();
    });

    // ── Success ───────────────────────────────────────────────
    function showSuccess(user) {
        verifyCard.hidden = true;
        successCard.hidden = false;

        const userRole = (user?.role || role || "").toUpperCase();

        if (userRole === "OWNER") {
            successSub.textContent =
                "Email confirmed. Next, verify your identity so your listings can go live.";
            continueBtn.textContent = "Start identity verification →";
        } else {
            successSub.textContent =
                "Your account is ready. Welcome to VISTA-HR!";
            continueBtn.textContent = "Go to my account →";
        }

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    continueBtn.addEventListener("click", () => {
        if (next) {
            location.href = next;
            return;
        }
        const userRole = role || "RESIDENT";
        if (userRole === "OWNER") {
            location.href = "/Property-Owner/verification/verify.html";
        } else {
            location.href = "/Resident/resident_home.html";
        }
    });

    // ── Resend with 60-second cooldown ───────────────────────
    let cooldown = 0;
    let cooldownTimer = null;

    function startCooldown(seconds = 60) {
        cooldown = seconds;
        resendBtn.disabled = true;
        tick();
    }

    function tick() {
        if (cooldown <= 0) {
            resendBtn.disabled = false;
            resendTimer.textContent = "";
            return;
        }
        resendTimer.textContent = `(${cooldown}s)`;
        cooldown--;
        cooldownTimer = setTimeout(tick, 1000);
    }

    resendBtn.addEventListener("click", async () => {
        resendBtn.disabled = true;
        clearErr();

        try {
            const res = await fetch(`${API_BASE}/auth/send-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email }),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                errMsg.textContent = data.error || "Could not resend. Try again.";
                errMsg.hidden = false;
                resendBtn.disabled = false;
                return;
            }

            // Clear inputs
            otpBoxes.forEach(b => { b.value = ""; b.classList.remove("filled"); });
            otpBoxes[0].focus();
            updateVerifyBtn();
            startCooldown(60);

        } catch {
            errMsg.textContent = "Network error.";
            errMsg.hidden = false;
            resendBtn.disabled = false;
        }
    });

    // Start with a 60s cooldown (just registered, code was just sent)
    startCooldown(60);

    // Focus first box
    otpBoxes[0]?.focus();

    if (window.lucide?.createIcons) lucide.createIcons();
})();