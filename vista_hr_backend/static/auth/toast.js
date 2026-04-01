/* ============================================================
   VISTA-HR · toast.js
   Global toast notification system — replaces all alert() calls
   
   Usage (available everywhere after including this script):
     showToast("Message sent!")                        // success (default)
     showToast("Something went wrong", "error")        // error
     showToast("Are you sure?", "warning")             // warning
     showToast("Loaded 5 listings", "info")            // info
     showToast("Deleted!", "success", 2000)            // custom duration
============================================================ */

(function () {
    // Inject container once
    function getContainer() {
        let c = document.getElementById("toastContainer");
        if (!c) {
            c = document.createElement("div");
            c.id = "toastContainer";
            c.style.cssText = [
                "position:fixed",
                "bottom:24px",
                "right:24px",
                "z-index:99999",
                "display:flex",
                "flex-direction:column-reverse",
                "gap:10px",
                "pointer-events:none",
                "max-width:360px",
                "width:calc(100vw - 48px)",
            ].join(";");
            document.body.appendChild(c);
        }
        return c;
    }

    const ICONS = {
        success: "check-circle-2",
        error: "x-circle",
        warning: "alert-triangle",
        info: "info",
    };

    const COLORS = {
        success: { bg: "#f0fdf4", border: "#bbf7d0", icon: "#16a34a", text: "#166534" },
        error: { bg: "#fef2f2", border: "#fecaca", icon: "#dc2626", text: "#991b1b" },
        warning: { bg: "#fffbeb", border: "#fde68a", icon: "#d97706", text: "#92400e" },
        info: { bg: "#eff6ff", border: "#bfdbfe", icon: "#2563eb", text: "#1e40af" },
    };

    window.showToast = function (message, type = "success", duration = 3500) {
        const container = getContainer();
        const c = COLORS[type] || COLORS.info;
        const icon = ICONS[type] || ICONS.info;

        const toast = document.createElement("div");
        toast.style.cssText = [
            "display:flex",
            "align-items:flex-start",
            "gap:10px",
            "padding:13px 16px",
            `background:${c.bg}`,
            `border:1.5px solid ${c.border}`,
            "border-radius:12px",
            "box-shadow:0 4px 20px rgba(0,0,0,.10)",
            "pointer-events:auto",
            "cursor:pointer",
            "opacity:0",
            "transform:translateY(12px)",
            "transition:opacity 220ms ease, transform 220ms ease",
            "max-width:360px",
            "width:100%",
        ].join(";");

        toast.innerHTML = `
            <div style="flex-shrink:0;margin-top:1px">
                <i data-lucide="${icon}" style="width:17px;height:17px;color:${c.icon}"></i>
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;color:${c.text};line-height:1.4;
                    font-family:'DM Sans',system-ui,sans-serif;word-break:break-word">
                    ${message}
                </div>
            </div>
            <button style="flex-shrink:0;background:none;border:none;cursor:pointer;
                padding:0;color:${c.icon};opacity:.6;margin-top:1px" aria-label="Dismiss">
                <i data-lucide="x" style="width:14px;height:14px"></i>
            </button>`;

        container.appendChild(toast);

        // Render lucide icons
        if (window.lucide?.createIcons) lucide.createIcons({ el: toast });

        // Animate in
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.style.opacity = "1";
                toast.style.transform = "translateY(0)";
            });
        });

        // Dismiss function
        function dismiss() {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(8px)";
            setTimeout(() => toast.remove(), 220);
        }

        // Click to dismiss
        toast.addEventListener("click", dismiss);

        // Auto dismiss
        const timer = setTimeout(dismiss, duration);

        // Cancel auto-dismiss on hover
        toast.addEventListener("mouseenter", () => clearTimeout(timer));
        toast.addEventListener("mouseleave", () => setTimeout(dismiss, 1500));
    };

    // Convenience aliases
    window.showSuccess = (msg, dur) => showToast(msg, "success", dur);
    window.showError = (msg, dur) => showToast(msg, "error", dur || 5000);
    window.showWarning = (msg, dur) => showToast(msg, "warning", dur);
    window.showInfo = (msg, dur) => showToast(msg, "info", dur);

})();