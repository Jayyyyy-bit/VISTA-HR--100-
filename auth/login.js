// login.js
(() => {
    // Same keys as your PO_welcome-page.js
    const LS_USERS_KEY = "vista_users";
    const LS_SESSION_KEY = "vista_session_user";

    // Update these if your paths differ
    const ROUTE_ROLES = "../../Login_Register_Page/Signup/roles.html";
    const ROUTE_OWNER_WELCOME = "../../PO-after-signup/PO_welcome-page/PO_welcome-page.html";
    const ROUTE_RESIDENT_HOME = "../../Resident-SIgnUp/resident_home.html"; // change later to your actual resident homepage

    const tabOwner = document.getElementById("tabOwner");
    const tabResident = document.getElementById("tabResident");
    const indicator = document.getElementById("tabIndicator");

    const form = document.getElementById("loginForm");
    const emailEl = document.getElementById("email");
    const pwEl = document.getElementById("password");
    const rememberEl = document.getElementById("remember");
    const errBox = document.getElementById("errBox");

    const togglePw = document.getElementById("togglePw");
    const goRolesBtn = document.getElementById("goRolesBtn");
    const goSignupBtn = document.getElementById("goSignupBtn");
    const forgotBtn = document.getElementById("forgotBtn");

    let activeRole = "OWNER";

    function readUsers() {
        try { return JSON.parse(localStorage.getItem(LS_USERS_KEY)) || []; }
        catch { return []; }
    }

    function writeSession(user) {
        // minimal session (same style as your welcome page expects: userId)
        const payload = {
            userId: user.id,
            role: user.role || activeRole,
            email: user.email,
            createdAt: new Date().toISOString()
        };
        localStorage.setItem(LS_SESSION_KEY, JSON.stringify(payload));
    }

    function setError(msg) {
        if (!errBox) return;
        errBox.textContent = msg || "";
        if (msg) {
            const card = document.querySelector(".card");
            card?.classList.remove("shake");
            // reflow to restart animation
            void card?.offsetWidth;
            card?.classList.add("shake");
        }
    }

    function moveIndicatorTo(btn) {
        if (!indicator || !btn) return;
        const isOwner = btn === tabOwner;
        indicator.style.transform = isOwner ? "translateX(0)" : "translateX(calc(100% + 10px))";
    }

    function setRole(role) {
        activeRole = role;

        const ownerOn = role === "OWNER";
        tabOwner?.classList.toggle("isActive", ownerOn);
        tabResident?.classList.toggle("isActive", !ownerOn);

        tabOwner?.setAttribute("aria-selected", ownerOn ? "true" : "false");
        tabResident?.setAttribute("aria-selected", !ownerOn ? "true" : "false");

        moveIndicatorTo(ownerOn ? tabOwner : tabResident);
        setError("");
    }

    tabOwner?.addEventListener("click", () => setRole("OWNER"));
    tabResident?.addEventListener("click", () => setRole("RESIDENT"));

    // Password eye toggle
    togglePw?.addEventListener("click", () => {
        const isPw = pwEl.type === "password";
        pwEl.type = isPw ? "text" : "password";
        togglePw.setAttribute("aria-label", isPw ? "Hide password" : "Show password");

        // swap icon quickly (optional)
        const ic = togglePw.querySelector("[data-lucide]");
        if (ic) ic.setAttribute("data-lucide", isPw ? "eye-off" : "eye");
        window.lucide?.createIcons?.();
    });

    // Signup links
    goRolesBtn?.addEventListener("click", () => (window.location.href = ROUTE_ROLES));
    goSignupBtn?.addEventListener("click", () => (window.location.href = ROUTE_ROLES));

    // Forgot password (future)
    forgotBtn?.addEventListener("click", () => {
        alert("Password reset is coming soon. For now, use the account you created in signup.");
    });

    // Submit
    form?.addEventListener("submit", (e) => {
        e.preventDefault();
        setError("");

        const email = (emailEl?.value || "").trim().toLowerCase();
        const pw = (pwEl?.value || "").trim();

        if (!email || !pw) {
            setError("Please enter your email and password.");
            return;
        }

        const users = readUsers();

        // match user by email + role (case-insensitive)
        const user = users.find(u =>
            (u.email || "").toLowerCase() === email &&
            ((u.role || "").toUpperCase() === activeRole)
        );

        // NOTE: local demo only. Later replace with backend hash check.
        if (!user) {
            setError(`No ${activeRole.toLowerCase()} account found for this email.`);
            return;
        }

        const ok =
            (user.password && user.password === pw) ||
            (user.passwordPlain && user.passwordPlain === pw);

        if (!ok) {
            setError("Incorrect password.");
            return;
        }

        writeSession(user);

        // redirect based on role
        if (activeRole === "OWNER") {
            window.location.href = ROUTE_OWNER_WELCOME;
        } else {
            window.location.href = ROUTE_RESIDENT_HOME;
        }
    });

    // init
    setRole("OWNER");
    window.lucide?.createIcons?.();
})();
