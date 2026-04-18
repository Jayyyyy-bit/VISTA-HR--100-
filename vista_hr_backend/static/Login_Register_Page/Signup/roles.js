const API = "api";

lucide.createIcons();

/* ── Navigation ── */
function safeGoTo(url) {
    if (typeof goTo === "function") goTo(url);
    else window.location.href = url;
}

const _urlParams = new URLSearchParams(window.location.search);
const isGoogleMode = _urlParams.get("mode") === "google";
const _googlePendingToken = _urlParams.get("gpt") || "";

async function handleRoleSelect(role) {
    if (isGoogleMode) {
        try {
            const res = await fetch("/api/auth/google/complete", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role, pending_token: _googlePendingToken }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed.");
            const dest = role === "OWNER"
                ? (Number(data.user?.has_completed_onboarding) === 1
                    ? "/Property-Owner/dashboard/property-owner-dashboard.html"
                    : "/PO-after-signup/PO_welcome-page.html")
                : "/Resident/resident_home.html";
            sessionStorage.setItem("loadingDest", dest);
            sessionStorage.setItem("loadingMsg", "Setting up your account…");
            window.location.href = "/auth/loading.html";
        } catch (err) {
            alert(err.message);
        }
        return;
    }
    // Normal registration flow
    if (role === "OWNER") safeGoTo("/Login_Register_Page/Signup/property-owner/owner_signup.html");
    else safeGoTo("/Login_Register_Page/Signup/Resident-SIgnUp/resident.html");
}

document.getElementById("btnOwner")?.addEventListener("click", () => handleRoleSelect("OWNER"));
document.getElementById("btnResident")?.addEventListener("click", () => handleRoleSelect("RESIDENT"));

// Google SSO buttons — normal signup flow (not google mode)
document.querySelectorAll(".google-sso-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const role = btn.dataset.role?.toUpperCase() || "RESIDENT";
        window.location.href = `/api/auth/google?role=${role}`;
    });
});
document.getElementById("backBtn")?.addEventListener("click", () => {
    safeGoTo("/Landing_Page/ASSETS/front_index.html");
});

/* ── Hover blur effect ── */
// When you hover one card, the other blurs slightly
// Implemented by adding a class to .cards container
const cardsEl = document.querySelector(".cards");
const ownerCard = document.getElementById("btnOwner");
const resCard = document.getElementById("btnResident");

function addHoverClass(cls) {
    cardsEl?.classList.remove("hover-owner", "hover-resident");
    if (cls) cardsEl?.classList.add(cls);
}

ownerCard?.addEventListener("mouseenter", () => addHoverClass("hover-owner"));
ownerCard?.addEventListener("mouseleave", () => addHoverClass(""));
resCard?.addEventListener("mouseenter", () => addHoverClass("hover-resident"));
resCard?.addEventListener("mouseleave", () => addHoverClass(""));

/* ── 3D tilt on hover ── */
[ownerCard, resCard].forEach(card => {
    if (!card) return;
    card.addEventListener("mousemove", e => {
        const r = card.getBoundingClientRect();
        const dx = (e.clientX - r.left - r.width / 2) / r.width * 10;
        const dy = (e.clientY - r.top - r.height / 2) / r.height * 7;
        card.style.transform = `translateY(-10px) scale(1.04) rotateX(${-dy}deg) rotateY(${dx}deg)`;
    });
    card.addEventListener("mouseleave", () => {
        card.style.transform = "";
    });
});

/* ── Live stats ── */
function fmtCount(n) {
    if (n == null) return "—";
    if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
    return String(n);
}
function fmtPrice(p) {
    if (p == null) return "—";
    if (p >= 1000) return "₱" + (p / 1000).toFixed(p % 1000 === 0 ? 0 : 1) + "k";
    return "₱" + p.toLocaleString();
}
function countUp(el, target, formatter, duration) {
    if (!el || target == null) return;
    const start = performance.now();
    function step(now) {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = formatter(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = formatter(target);
    }
    requestAnimationFrame(step);
}

async function loadStats() {
    try {
        const res = await fetch(`${API}/public/stats`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        countUp(document.getElementById("statOwnerListings"), data.total_listings, fmtCount, 1000);
        countUp(document.getElementById("statOwnerEarn"), data.total_owners, n => fmtCount(n) + " owners", 1000);
        countUp(document.getElementById("statResListings"), data.total_listings, n => fmtCount(n) + "+ listings", 1000);
        countUp(document.getElementById("statResMinPrice"), data.min_price, fmtPrice, 1000);
    } catch { /* keep placeholder dashes */ }
}

setTimeout(loadStats, 400);

// Show banner if google mode
if (isGoogleMode) {
    const banner = document.getElementById("googleModeBanner");
    if (banner) { banner.hidden = false; if (window.lucide?.createIcons) lucide.createIcons(); }
}

if (isGoogleMode) {
    document.querySelectorAll(".google-sso-btn").forEach(btn => btn.hidden = true);
}