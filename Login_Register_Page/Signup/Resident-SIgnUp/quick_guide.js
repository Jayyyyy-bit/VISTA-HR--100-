document.addEventListener("DOMContentLoaded", async () => {
    const ok = await AuthGuard.requireResident();
    if (!ok) return;

    document.getElementById("continueBtn")
        ?.addEventListener("click", () => {
            window.location.href = "/Resident/resident_home.html";
        });

    document.getElementById("logoutBtn")
        ?.addEventListener("click", () => {
            AuthGuard.logout();
        });
});




import { requireAuth, clearSession } from "../../../auth/session.js";
// adjust path based on where session.js lives relative to this file

const s = requireAuth({ role: "RESIDENT" });
if (!s) window.location.href = "../../Login/login.html";

document.getElementById("continueBtn").addEventListener("click", () => {
    window.location.href = "./resident_home.html";
});

document.getElementById("logoutBtn").addEventListener("click", () => {
    clearSession();
    window.location.href = "../../Login/login.html";
});

// quick_guide.js
// Requires: /auth/sessionGuard.js loaded before this file

document.addEventListener("DOMContentLoaded", async () => {
    // Guard page
    const ok = await window.AuthGuard.requireResident();
    if (!ok) return;

    const continueBtn = document.getElementById("continueBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    continueBtn?.addEventListener("click", () => {
        // after guide, go to resident home
        window.location.href = "/Resident/resident_home.html";
    });

    logoutBtn?.addEventListener("click", async () => {
        await window.AuthGuard.logout();
    });
});
