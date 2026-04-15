/**
 * /auth/loading.js
 * Post-login / post-logout transition page.
 *
 * Usage — set before redirecting to this page:
 *   sessionStorage.setItem("loadingDest", "/Resident/resident_home.html");
 *   sessionStorage.setItem("loadingMsg",  "Welcome back!");   // optional
 *   location.href = "/auth/loading.html";
 *
 * After ~1.5s the page reads sessionStorage and redirects.
 */
(function () {
    const DURATION_MS  = 1500;   // total display time
    const TICK_MS      = 30;     // progress bar update interval

    const bar     = document.getElementById("loadingBar");
    const msgEl   = document.getElementById("loadingMsg");

    // Read destination + optional message from sessionStorage
    const dest    = sessionStorage.getItem("loadingDest") || "/auth/login.html";
    const msg     = sessionStorage.getItem("loadingMsg")  || _defaultMsg(dest);

    // Clear immediately so a back-navigation doesn't re-trigger
    sessionStorage.removeItem("loadingDest");
    sessionStorage.removeItem("loadingMsg");

    if (msgEl) msgEl.textContent = msg;

    // Animate progress bar from 0 → 95% over DURATION_MS, then snap to 100%
    let elapsed = 0;
    const interval = setInterval(function () {
        elapsed += TICK_MS;
        const pct = Math.min(95, (elapsed / DURATION_MS) * 100);
        if (bar) bar.style.width = pct + "%";

        if (elapsed >= DURATION_MS) {
            clearInterval(interval);
            if (bar) bar.style.width = "100%";
            // Small delay so the bar visually completes before redirect
            setTimeout(function () {
                location.replace(dest);
            }, 150);
        }
    }, TICK_MS);

    // ── Helpers ──────────────────────────────────────────────
    function _defaultMsg(url) {
        if (!url) return "Please wait…";
        if (url.includes("login"))    return "Logging you out…";
        if (url.includes("OWNER") || url.includes("Property-Owner")) return "Welcome back, Owner!";
        if (url.includes("Resident")) return "Welcome back!";
        if (url.includes("admin"))    return "Loading admin panel…";
        return "Please wait…";
    }
}());
