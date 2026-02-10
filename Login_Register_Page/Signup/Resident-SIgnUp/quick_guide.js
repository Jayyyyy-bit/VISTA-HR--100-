const LS_SESSION_KEY = "vista_session_user";

document.getElementById("continueBtn").addEventListener("click", () => {
    const session = JSON.parse(localStorage.getItem(LS_SESSION_KEY));

    if (!session?.token) {
        // safety guard
        window.location.href = "../../Login/login.html";
        return;
    }

    // Mark guide as seen (important later)
    localStorage.setItem("vista_resident_guide_seen", "true");

    window.location.href = "./resident_home.html";
});
