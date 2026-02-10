// login.js
(() => {
    // Same keys as your PO_welcome-page.js

    const LS_SESSION_KEY = "vista_session_user";


    const ROUTE_ROLES = "../../Login_Register_Page/Signup/roles.html";
    const ROUTE_OWNER_WELCOME = "../../PO-after-signup/PO_welcome-page/PO_welcome-page.html";
    const ROUTE_RESIDENT_HOME = "../../Resident/resident_home.html";


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
            const res = await fetch("http://127.0.0.1:5000/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password, role: activeRole }) // 👈 IMPORTANT
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data?.message || "Login failed");
                return;
            }

            // ✅ store token + user (keep same key name)
            localStorage.setItem("vista_session_user", JSON.stringify({
                user: data.user,
                token: data.access_token,
                role: data.user.role,
                createdAt: new Date().toISOString()
            }));

            // redirect
            if (data.user.role === "OWNER") window.location.href = ROUTE_OWNER_WELCOME;
            else window.location.href = ROUTE_RESIDENT_HOME;

        } catch (err) {
            console.error(err);
            setError("Server unavailable. Please try again.");
        }
    });

})();
