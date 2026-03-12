(() => {
    const LS_SESSION_KEY = "vista_session_user";
    const LS_LAST_USER_ID_KEY = "vista_last_user_id";
    const API_BASE = "http://127.0.0.1:5000/api";

    const ROUTE_ROLES = "/Login_Register_Page/Signup/roles.html";
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

        if (role === "OWNER") {
            const done = Number(user?.has_completed_onboarding) === 1;
            window.location.href = done ? ROUTE_OWNER_DASHBOARD : ROUTE_OWNER_WELCOME;
            return;
        }

        window.location.href = ROUTE_RESIDENT_HOME;
    }

    // ✅ Clears listing wizard drafts that may belong to a different user
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

    // ✅ Auto-redirect if already logged in (cookie/session via /auth/me)
    document.addEventListener("DOMContentLoaded", async () => {
        try {
            const me = await AuthGuard.fetchMe();
            if (me.ok && me.data?.user?.role) {
                redirectByRole(me.data.user); // ✅ user object
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
    forgotBtn?.addEventListener("click", () => alert("Password reset is coming soon."));

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
                body: JSON.stringify({ email, password }), // ✅ no role
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data?.message || "Invalid email/password.");
                return;
            }

            // ✅ If user changed, clear stale wizard drafts (fixes “Listing not found”)
            const newUserId = String(data.user?.id ?? "");
            const lastUserId = localStorage.getItem(LS_LAST_USER_ID_KEY);

            if (lastUserId && newUserId && lastUserId !== newUserId) {
                clearWizardDraftCache();
            }

            // Save session (optional)
            localStorage.setItem(
                LS_SESSION_KEY,
                JSON.stringify({
                    user: data.user,
                    role: data.user?.role,
                    createdAt: new Date().toISOString(),
                })
            );

            // Remember who logged in last (used for draft clearing)
            localStorage.setItem(LS_LAST_USER_ID_KEY, newUserId);

            redirectByRole(data.user);
        } catch (err) {
            console.error(err);
            setError("Server unavailable. Please try again.");
        }
    });
})();