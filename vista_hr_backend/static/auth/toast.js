/* ============================================================
   VISTA-HR · toast.js
   Global toast notification system — replaces all alert() calls

   Usage:
     showToast("Message sent!")                        // success (default)
     showToast("Something went wrong", "error")        // error
     showToast("Are you sure?", "warning")             // warning
     showToast("Loaded 5 listings", "info")            // info
     showToast("Deleted!", "success", 2000)            // custom duration
     showToast("Verify email", "info", 0, "Verify →", "/auth/account-settings.html#email")
============================================================ */

(function () {

    function getContainer() {
        let c = document.getElementById("toastContainer");
        if (!c) {
            c = document.createElement("div");
            c.id = "toastContainer";
            c.style.cssText = [
                "position:fixed",
                "bottom:28px",
                "right:28px",
                "z-index:99999",
                "display:flex",
                "flex-direction:column",
                "gap:10px",
                "align-items:flex-end",
                "pointer-events:none",
                "width:340px",
            ].join(";");
            document.body.appendChild(c);
        }
        return c;
    }

    const ICONS = {
        success: "check-circle-2",
        error: "x-circle",
        warning: "alert-triangle",
        info: "bell",
    };

    const STYLES = {
        success: { iconBg: "#dcfce7", iconColor: "#16a34a", ctaColor: "#16a34a" },
        error: { iconBg: "#fee2e2", iconColor: "#dc2626", ctaColor: "#dc2626" },
        warning: { iconBg: "#fef9c3", iconColor: "#d97706", ctaColor: "#d97706" },
        info: { iconBg: "#dbeafe", iconColor: "#2563eb", ctaColor: "#2563eb" },
    };

    window.showToast = function (message, type = "success", duration = 3500, ctaLabel = "", ctaHref = "") {
        const container = getContainer();
        const s = STYLES[type] || STYLES.info;
        const icon = ICONS[type] || ICONS.info;

        const toast = document.createElement("div");
        toast.style.cssText = [
            "display:flex",
            "align-items:flex-start",
            "gap:14px",
            "padding:16px 16px 14px 16px",
            "background:#ffffff",
            "border-radius:18px",
            "box-shadow:0 4px 6px rgba(0,0,0,0.05),0 10px 30px rgba(0,0,0,0.12),0 1px 2px rgba(0,0,0,0.04)",
            "pointer-events:auto",
            "width:340px",
            "opacity:0",
            "transform:translateX(20px) scale(0.95)",
            "transition:opacity 260ms cubic-bezier(0.34,1.3,0.64,1),transform 260ms cubic-bezier(0.34,1.3,0.64,1)",
        ].join(";");

        const ctaHTML = ctaLabel
            ? `<a href="${ctaHref || '#'}" style="display:inline-flex;align-items:center;gap:3px;margin-top:6px;
                font-size:13px;font-weight:700;color:${s.ctaColor};text-decoration:none;
                font-family:'DM Sans',system-ui,sans-serif;"
                onclick="event.stopPropagation()">${ctaLabel}</a>`
            : "";

        toast.innerHTML = `
            <div style="width:46px;height:46px;border-radius:50%;background:${s.iconBg};
                flex-shrink:0;display:flex;align-items:center;justify-content:center;">
                <i data-lucide="${icon}" style="width:22px;height:22px;color:${s.iconColor};stroke-width:2"></i>
            </div>
            <div style="flex:1;min-width:0;padding-top:2px;">
                <div style="font-size:13.5px;font-weight:600;color:#111827;line-height:1.4;
                    font-family:'DM Sans',system-ui,sans-serif;word-break:break-word;">
                    ${message}
                </div>
                ${ctaHTML}
            </div>
            <button style="flex-shrink:0;background:none;border:none;cursor:pointer;
                padding:2px;color:#9ca3af;margin-top:1px;line-height:1;font-size:16px;
                font-family:inherit;" aria-label="Dismiss">✕</button>`;

        container.appendChild(toast);

        if (window.lucide?.createIcons) lucide.createIcons({ el: toast });

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.style.opacity = "1";
                toast.style.transform = "translateX(0) scale(1)";
            });
        });

        function dismiss() {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(16px) scale(0.95)";
            setTimeout(() => toast.remove(), 260);
        }

        // Close button — stopPropagation so it doesn't also trigger toast click dismiss
        toast.querySelector("button").addEventListener("click", (e) => {
            e.stopPropagation();
            dismiss();
        });

        // Click anywhere on toast also dismisses
        toast.addEventListener("click", dismiss);

        // Auto dismiss — 0 = persistent until user clicks X
        let timer = null;
        if (duration > 0) {
            timer = setTimeout(dismiss, duration);
            toast.addEventListener("mouseenter", () => clearTimeout(timer));
            toast.addEventListener("mouseleave", () => { timer = setTimeout(dismiss, 1500); });
        }
    };

    window.showSuccess = (msg, dur, cta, href) => showToast(msg, "success", dur ?? 3500, cta, href);
    window.showError = (msg, dur, cta, href) => showToast(msg, "error", dur ?? 5000, cta, href);
    window.showWarning = (msg, dur, cta, href) => showToast(msg, "warning", dur ?? 4000, cta, href);
    window.showInfo = (msg, dur, cta, href) => showToast(msg, "info", dur ?? 4000, cta, href);

})();