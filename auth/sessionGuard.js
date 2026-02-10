(function () {
    const KEY = "vista_session_user";

    function getSession() {
        try { return JSON.parse(localStorage.getItem(KEY)); }
        catch { return null; }
    }

    function requireResident() {
        const s = getSession();
        const ok = s && s.token && s.user && s.role === "RESIDENT";
        if (!ok) {
            window.location.href = "../Login_Register_Page/login.html";
            return false;
        }
        return true;
    }

    function requireOwner() {
        const s = getSession();
        const ok = s && s.token && s.user && s.role === "OWNER";
        if (!ok) {
            window.location.href = "../Login_Register_Page/login.html";
            return false;
        }
        return true;
    }

    window.AuthGuard = { getSession, requireResident, requireOwner };
})();
