/**
 * VISTA-HR · auth/sessionGuard.js
 * - Validates JWT on every page load (prevents back-button bypass)
 * - Exposes AuthGuard.requireOwner(), requireResident(), getSession(),
 *   fetchMe(), saveSession(), clearSession(), logout()
 */
(function () {
    const KEY = "vista_session_user";
    const API_BASE = "/api";
    const LOGIN = "/auth/login.html";

    // Pages that don't need auth check
    const PUBLIC_PAGES = [
        "/auth/login.html",
        "/auth/verify-email.html",
        "/Landing_Page/",
        "/Login_Register_Page/",
    ];

    function isPublicPage() {
        const path = window.location.pathname;
        return PUBLIC_PAGES.some(p => path.startsWith(p) || path === p);
    }

    function saveSession(session) {
        localStorage.setItem(KEY, JSON.stringify({
            user: session.user,
            role: session.user?.role,
            savedAt: Date.now(),
        }));
    }

    function clearSession() {
        localStorage.removeItem(KEY);
        // Clear auth cookies
        document.cookie.split(";").forEach(c => {
            document.cookie = c.replace(/^ +/, "")
                .replace(/=.*/, "=;expires=" + new Date(0).toUTCString() + ";path=/");
        });
    }

    function getSession() {
        try {
            const raw = localStorage.getItem(KEY);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    async function fetchMe() {
        try {
            const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.user) {
                saveSession(data);
                return { ok: true, data };
            }
            return { ok: false, data };
        } catch (e) {
            return { ok: false, data: {} };
        }
    }

    async function logout() {
        try {
            await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
        } catch { }
        clearSession();
        // Prevent back button from returning to protected page
        history.replaceState(null, "", LOGIN);
        window.location.href = LOGIN;
    }

    // ── Role guards ─────────────────────────────────────────
    async function requireRole(expectedRole) {
        if (isPublicPage()) return true;

        const result = await fetchMe();
        if (!result.ok) {
            clearSession();
            history.replaceState(null, "", LOGIN);
            window.location.href = LOGIN;
            return false;
        }

        const userRole = (result.data?.user?.role || "").toUpperCase();
        if (expectedRole && userRole !== expectedRole.toUpperCase()) {
            // Wrong role — redirect to login
            clearSession();
            history.replaceState(null, "", LOGIN);
            window.location.href = LOGIN;
            return false;
        }

        return true;
    }

    async function requireOwner() {
        return requireRole("OWNER");
    }

    async function requireResident() {
        return requireRole("RESIDENT");
    }

    async function requireAdmin() {
        return requireRole("ADMIN");
    }

    // ── Back-button security ─────────────────────────────────
    // Fired when page is restored from browser cache (back/forward)
    window.addEventListener("pageshow", (e) => {
        if (e.persisted && !isPublicPage()) {
            // Page loaded from back-forward cache — re-validate silently
            fetchMe().then(result => {
                if (!result.ok) {
                    clearSession();
                    history.replaceState(null, "", LOGIN);
                    window.location.href = LOGIN;
                }
            });
        }
    });

    // ── Expose globally ──────────────────────────────────────
    window.AuthGuard = {
        getSession,
        fetchMe,
        saveSession,
        clearSession,
        logout,
        requireOwner,
        requireResident,
        requireAdmin,
        requireRole,
    };
})();