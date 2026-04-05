/* Resident/my-bookings.js */
(() => {
    const API = "http://127.0.0.1:5000/api";

    let _all = [];
    let _status = "ALL";
    let _cancelTarget = null; // booking id pending cancel confirm

    const STATUS_MAP = {
        PENDING: { label: "Pending", cls: "bc-status--pending" },
        APPROVED: { label: "Approved", cls: "bc-status--approved" },
        ACTIVE: { label: "Active", cls: "bc-status--active" },
        COMPLETED: { label: "Completed", cls: "bc-status--completed" },
        REJECTED: { label: "Rejected", cls: "bc-status--rejected" },
        CANCELLED: { label: "Cancelled", cls: "bc-status--cancelled" },
    };

    // ── Boot ─────────────────────────────────────────────────
    document.addEventListener("DOMContentLoaded", async () => {
        if (!window.AuthGuard) { location.href = "/auth/login.html"; return; }
        const me = await window.AuthGuard.fetchMe();
        if (!me.ok || me.data?.user?.role !== "RESIDENT") {
            location.href = "/auth/login.html"; return;
        }

        const user = me.data.user;
        const init = (user.first_name?.[0] || user.email?.[0] || "R").toUpperCase();
        const el = id => document.getElementById(id);
        if (el("avatarCircle")) el("avatarCircle").textContent = init;
        el("profileBtn")?.addEventListener("click", () => {
            location.href = "/auth/account-settings.html";
        });

        setupFilterTabs();
        setupModal();
        await loadBookings();
    });

    // ── Load bookings ─────────────────────────────────────────
    async function loadBookings() {
        showSkeleton();
        try {
            const res = await fetch(`${API}/bookings/mine`, { credentials: "include" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to load bookings.");
            _all = data.bookings || [];
        } catch (err) {
            showError(err.message);
            return;
        }

        updatePageSub();
        updatePendingBadge();
        renderList();
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function updatePageSub() {
        const el = document.getElementById("pageSub");
        if (!el) return;
        const total = _all.length;
        const pending = _all.filter(b => b.status === "PENDING").length;
        if (!total) { el.textContent = "No move-in requests yet."; return; }
        el.textContent = `${total} move-in request${total !== 1 ? "s" : ""}${pending ? ` · ${pending} pending` : ""}`;
    }

    function updatePendingBadge() {
        const count = _all.filter(b => b.status === "PENDING").length;
        const badge = document.getElementById("countPending");
        if (!badge) return;
        badge.textContent = count;
        badge.hidden = count === 0;
    }

    // ── Filter tabs ───────────────────────────────────────────
    function setupFilterTabs() {
        document.querySelectorAll(".filterTab").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".filterTab").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                _status = btn.dataset.status;
                renderList();
            });
        });
    }

    // ── Render list ───────────────────────────────────────────
    function renderList() {
        const list = document.getElementById("bookingList");
        if (!list) return;

        const filtered = _status === "ALL"
            ? _all
            : _all.filter(b => b.status === _status);

        if (!filtered.length) {
            list.innerHTML = emptyStateHTML(_status);
            if (window.lucide?.createIcons) lucide.createIcons();
            return;
        }

        list.innerHTML = filtered.map((b, i) => bookingCardHTML(b, i)).join("");

        // Bind cancel buttons
        list.querySelectorAll("[data-cancel-id]").forEach(btn => {
            btn.addEventListener("click", () => openCancelModal(Number(btn.dataset.cancelId), btn.dataset.cancelTitle));
        });

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Card HTML ─────────────────────────────────────────────
    function bookingCardHTML(b, idx) {
        const listing = b.listing || {};
        const status = b.status || "PENDING";
        const { label, cls } = STATUS_MAP[status] || STATUS_MAP.PENDING;
        const isPending = status === "PENDING";

        const thumbEl = listing.cover
            ? `<img class="bc-thumb" src="${esc(listing.cover)}" alt="${esc(listing.title || "Listing")}">`
            : `<div class="bc-thumb-placeholder"><i data-lucide="home"></i></div>`;

        const loc = [listing.barangay, listing.city].filter(Boolean).join(", ") || "—";
        const price = listing.price
            ? `<div class="bc-price">₱${Number(listing.price).toLocaleString()}<span>/mo</span></div>`
            : "";

        const moveIn = b.move_in_date
            ? `<span class="bc-meta-item"><i data-lucide="calendar"></i>${fmtDate(b.move_in_date)}</span>`
            : "";

        const messageBlock = b.message
            ? `<div class="bc-message">"${esc(b.message)}"</div>`
            : "";

        let noteBlock = "";
        if (b.owner_note) {
            const isRejected = status === "REJECTED";
            noteBlock = `
                <div class="bc-owner-note ${isRejected ? "rejected" : ""}">
                    <i data-lucide="${isRejected ? "x-circle" : "message-square"}"></i>
                    <span><strong>Owner:</strong> ${esc(b.owner_note)}</span>
                </div>`;
        }

        const cancelBtn = isPending
            ? `<button class="bc-cancel-btn" data-cancel-id="${b.id}" data-cancel-title="${esc(listing.title || "this listing")}">
                    <i data-lucide="x"></i> Cancel request
               </button>`
            : "";

        return `
        <div class="booking-card" style="animation-delay:${idx * 40}ms">
            <div class="bc-main">
                ${thumbEl}
                <div class="bc-body">
                    <div class="bc-top">
                        <div class="bc-title">${esc(listing.title || "Untitled listing")}</div>
                        <span class="bc-status ${cls}">${label}</span>
                    </div>
                    <div class="bc-loc">
                        <i data-lucide="map-pin"></i>
                        ${esc(listing.place_type || "Room")} · ${esc(loc)}
                    </div>
                    <div class="bc-meta">
                        ${moveIn}
                        <span class="bc-meta-item"><i data-lucide="clock-3"></i>${relTime(b.created_at)}</span>
                    </div>
                </div>
                ${price}
            </div>
            ${messageBlock}
            ${noteBlock}
            <div class="bc-actions">
                <span class="bc-timestamp">Requested ${fmtDate(b.created_at)}</span>
                ${cancelBtn}
            </div>
        </div>`;
    }

    // ── Empty states ──────────────────────────────────────────
    function emptyStateHTML(status) {
        const msgs = {
            ALL: { icon: "calendar-x-2", title: "No bookings yet", sub: "Browse listings and submit your first move-in request." },
            PENDING: { icon: "clock", title: "No pending move-in requests", sub: "Move-in requests waiting for owner approval." },
            APPROVED: { icon: "check-circle-2", title: "No approved requests", sub: "Approved bookings will appear here." },
            ACTIVE: { icon: "home", title: "No active stays", sub: "Confirmed and ongoing stays will show here." },
            COMPLETED: { icon: "badge-check", title: "No completed stays", sub: "Past completed stays will appear here." },
            REJECTED: { icon: "x-circle", title: "No rejected requests", sub: "" },
            CANCELLED: { icon: "ban", title: "No cancelled requests", sub: "" },
        };
        const { icon, title, sub } = msgs[status] || msgs.ALL;
        const cta = status === "ALL"
            ? `<a class="empty-cta" href="./resident_home.html"><i data-lucide="search"></i> Browse listings</a>`
            : "";
        return `
        <div class="empty-state">
            <div class="empty-icon"><i data-lucide="${icon}"></i></div>
            <div class="empty-title">${title}</div>
            ${sub ? `<p class="empty-sub">${sub}</p>` : ""}
            ${cta}
        </div>`;
    }

    // ── Cancel modal ──────────────────────────────────────────
    function setupModal() {
        document.getElementById("modalCancel")?.addEventListener("click", closeModal);
        document.getElementById("modalConfirm")?.addEventListener("click", confirmCancel);
        document.getElementById("modalOverlay")?.addEventListener("click", e => {
            if (e.target === e.currentTarget) closeModal();
        });
        document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
    }

    function openCancelModal(id, title) {
        _cancelTarget = id;
        const sub = document.getElementById("modalSub");
        if (sub) sub.textContent = `Cancel your request for "${title}"?`;
        document.getElementById("modalOverlay").hidden = false;
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function closeModal() {
        _cancelTarget = null;
        document.getElementById("modalOverlay").hidden = true;
    }

    async function confirmCancel() {
        if (!_cancelTarget) return;
        const btn = document.getElementById("modalConfirm");
        btn.textContent = "Cancelling…";
        btn.disabled = true;

        try {
            const res = await fetch(`${API}/bookings/${_cancelTarget}/cancel`, {
                method: "POST", credentials: "include",
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Cancel failed.");

            // Update local state
            const idx = _all.findIndex(b => b.id === _cancelTarget);
            if (idx !== -1) _all[idx].status = "CANCELLED";

            closeModal();
            updatePageSub();
            updatePendingBadge();
            renderList();
        } catch (err) {
            showError(err.message);
        } finally {
            btn.textContent = "Yes, cancel";
            btn.disabled = false;
        }
    }

    // ── Skeleton ──────────────────────────────────────────────
    function showSkeleton() {
        const list = document.getElementById("bookingList");
        if (!list) return;
        list.innerHTML = `<div class="skeleton-list">${Array(3).fill(`
            <div class="skeleton-card">
                <div class="sk-img"></div>
                <div class="sk-body">
                    <div class="sk-line w60"></div>
                    <div class="sk-line w40"></div>
                    <div class="sk-line w30"></div>
                </div>
            </div>`).join("")}</div>`;
    }

    function showError(msg) {
        const list = document.getElementById("bookingList");
        if (list) list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i data-lucide="wifi-off"></i></div>
                <div class="empty-title">Could not load move-in requests</div>
                <p class="empty-sub">${esc(msg)}</p>
            </div>`;
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Utils ─────────────────────────────────────────────────
    function esc(s) {
        return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function fmtDate(dt) {
        if (!dt) return "—";
        try {
            return new Date(dt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
        } catch { return "—"; }
    }

    function relTime(dt) {
        if (!dt) return "—";
        try {
            const diff = Date.now() - new Date(dt).getTime();
            const mins = Math.floor(diff / 60000);
            const hours = Math.floor(mins / 60);
            const days = Math.floor(hours / 24);
            if (mins < 1) return "just now";
            if (mins < 60) return `${mins}m ago`;
            if (hours < 24) return `${hours}h ago`;
            if (days < 7) return `${days}d ago`;
            return fmtDate(dt);
        } catch { return "—"; }
    }
})();