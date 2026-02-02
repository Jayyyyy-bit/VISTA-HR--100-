lucide.createIcons();

const LS_USERS_KEY = "vista_users";
const LS_SESSION_KEY = "vista_session_user";

// Uses transition.js goTo() if present, else fallback
function safeGoTo(url) {
    if (typeof goTo === "function") goTo(url);
    else window.location.href = url;
}

function readUsers() {
    try { return JSON.parse(localStorage.getItem(LS_USERS_KEY)) || []; }
    catch { return []; }
}
function readSession() {
    try { return JSON.parse(localStorage.getItem(LS_SESSION_KEY)) || null; }
    catch { return null; }
}
function getCurrentOwner() {
    const session = readSession();
    if (!session?.userId) return null;
    const users = readUsers();
    return users.find(u => u.id === session.userId) || null;
}

// Elements
const ownerName = document.getElementById("ownerName");
const statusText = document.getElementById("statusText");
const publishValue = document.getElementById("publishValue");
const verifyValue = document.getElementById("verifyValue");

const backBtn = document.getElementById("backBtn");
const verifyNowBtn = document.getElementById("verifyNowBtn");
const startWizardBtn = document.getElementById("startWizardBtn");
const openDashboardBtn = document.getElementById("openDashboardBtn");

const createCard = document.getElementById("createCard");
const dashCard = document.getElementById("dashCard");

// Init user info
const owner = getCurrentOwner();
const verified = owner?.verificationStatus === "VERIFIED";

ownerName.textContent = owner?.firstName || owner?.fullName || "Property Owner";
statusText.textContent = verified ? "Verified" : "Unverified";
publishValue.textContent = verified ? "Unlocked" : "Locked";
verifyValue.textContent = verified ? "Done" : "Required";

// Routes (adjust these to your actual files)
function goRoles() {
    safeGoTo("../../Login_Register_Page/Signup/roles.html");
}

function goVerify() {
    // Later: safeGoTo("../../../Property-Owner/verification/verify.html");
    alert("Verification page is coming soon.");
}

function goWizard() {
    safeGoTo("../../../PO-after-signup/listing-wizard/index.html");
}


function goDashboard() {
    // Later: safeGoTo("../../../Property-Owner/dashboard.html");
    alert("Owner dashboard is coming next.");
}

// Events
backBtn?.addEventListener("click", goRoles);
verifyNowBtn?.addEventListener("click", goVerify);
startWizardBtn?.addEventListener("click", goWizard);
openDashboardBtn?.addEventListener("click", goDashboard);

// Card click + keyboard
function makeCardClickable(card, fn) {
    if (!card) return;
    card.addEventListener("click", (e) => {
        const isButton = e.target.closest("button");
        if (!isButton) fn();
    });
    card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fn();
        }
    });
}
makeCardClickable(createCard, goWizard);
makeCardClickable(dashCard, goDashboard);
