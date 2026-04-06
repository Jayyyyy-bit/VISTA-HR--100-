/* PO-after-signup/PO_welcome-page.js */
(() => {
    const API = "/api";
    const DASH_URL = "/Property-Owner/dashboard/property-owner-dashboard.html";
    const WIZARD_URL = "/PO-after-signup/listing-wizard/index.html?new=1";
    const VERIFY_URL = "/Property-Owner/verification/verify.html";

    async function init() {
        // Fetch current user from backend
        let user = null;
        try {
            const res = await fetch(`${API}/auth/me`, { credentials: "include" });
            if (!res.ok) { location.replace("/auth/login.html"); return; }
            const data = await res.json().catch(() => ({}));
            user = data?.user || null;
        } catch {
            location.replace("/auth/login.html");
            return;
        }

        if (!user || user.role !== "OWNER") {
            location.replace("/auth/login.html");
            return;
        }

        // ── Key logic: skip welcome for returning owners ──
        // has_completed_onboarding is set to true after they first visit dashboard
        if (user.has_completed_onboarding) {
            location.replace(DASH_URL);
            return;
        }

        // Personalise UI
        const firstName = user.first_name || user.email?.split("@")[0] || "Property Owner";
        const el = id => document.getElementById(id);

        el("ownerName").textContent = firstName;

        const verified = user.kyc_status === "APPROVED" || user.is_verified;

        // Status chip
        const chip = el("statusChip");
        el("statusText").textContent = verified ? "Verified" : "Unverified";
        if (verified) chip.classList.add("verified");

        // Mini panel values
        const pubEl = el("publishValue");
        pubEl.textContent = verified ? "Unlocked" : "Locked";
        pubEl.className = "mini-value " + (verified ? "unlocked" : "locked");

        el("verifyValue").textContent = verified ? "Done ✓" : "Required";

        // Verify button — hide if already verified
        const verifyBtn = el("verifyNowBtn");
        if (verified) {
            verifyBtn.classList.add("done");
            el("verifyBtnText").textContent = "Verified ✓";
            verifyBtn.style.pointerEvents = "none";
        }

        // Mark onboarding as started when they land here
        // (we mark it complete when they click through to dashboard/wizard)
        markOnboardingComplete();

        if (window.lucide?.createIcons) lucide.createIcons();

        // Wire buttons
        el("startWizardBtn")?.addEventListener("click", () => location.href = WIZARD_URL);
        el("openDashboardBtn")?.addEventListener("click", () => location.href = DASH_URL);

        // Card click (non-button areas)
        el("createCard")?.addEventListener("click", e => {
            if (!e.target.closest("button") && !e.target.closest("a")) location.href = WIZARD_URL;
        });
        el("dashCard")?.addEventListener("click", e => {
            if (!e.target.closest("button")) location.href = DASH_URL;
        });
    }

    // Mark has_completed_onboarding = true via backend
    // This ensures next login skips this page
    async function markOnboardingComplete() {
        try {
            await fetch(`${API}/auth/me/onboarding`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
            });
        } catch {
            // Non-fatal — worst case they see this page again next login
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();