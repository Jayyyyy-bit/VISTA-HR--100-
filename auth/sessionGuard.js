(function () {
    const KEY = "vista_session_user";
    const API_BASE = "http://127.0.0.1:5000/api";

    function saveSession(session) {
        localStorage.setItem(
            KEY,
            JSON.stringify({
                user: session.user,
                role: session.user?.role || session.role,
                createdAt: new Date().toISOString(),
            })
        );
    }

    function getSession() {
        try {
            return JSON.parse(localStorage.getItem(KEY));
        } catch {
            return null;
        }
    }

    function clearSession() {
        localStorage.removeItem(KEY);
    }

    async function fetchMe() {
        try {
            const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });

            // If not authenticated, keep it quiet and clear local cache
            if (res.status === 401 || res.status === 403) {
                clearSession();
                return { ok: false, data: {} };
            }

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                clearSession();
                return { ok: false, data };
            }

            // keep local cache in sync
            if (data?.user) saveSession({ user: data.user });
            return { ok: true, data };
        } catch (err) {
            // network error / server down
            return { ok: false, data: {} };
        }
    }

    async function requireRole(role) {
        const me = await fetchMe();
        if (!me.ok || me.data?.user?.role !== role) {
            window.location.href = "/auth/login.html";
            return false;
        }
        return true;
    }

    async function requireResident() {
        return requireRole("RESIDENT");
    }

    async function requireOwner() {
        return requireRole("OWNER");
    }

    async function logout() {
        await fetch(`${API_BASE}/auth/logout`, {
            method: "POST",
            credentials: "include",
        }).catch(() => { });
        clearSession();
        window.location.href = "/auth/login.html";
    }

    window.AuthGuard = {
        getSession,
        saveSession,
        clearSession,
        requireResident,
        requireOwner,
        fetchMe,
        logout,
    };
})();
