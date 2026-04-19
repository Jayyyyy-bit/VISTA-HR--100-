(() => {
    const API = "/api";
    const PAGE_SIZE = 5;
    let _all = [];
    let _page = 1;

    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function fmtDate(iso) {
        if (!iso) return "—";
        try {
            return new Date(iso).toLocaleDateString("en-PH", {
                month: "short", day: "numeric", year: "numeric"
            });
        } catch { return "—"; }
    }

    async function init() {
        try {
            const meRes = await fetch(`${API}/auth/me`, { credentials: "include" });
            if (!meRes.ok) { window.location.href = "/auth/login.html"; return; }
            const { user } = await meRes.json();
            if (!user || user.role !== "OWNER") {
                window.location.href = "/auth/login.html";
                return;
            }

            const res = await fetch(`${API}/reviews/user/${user.id}?type=OWNER&per_page=50`, {
                credentials: "include"
            });
            const data = await res.json().catch(() => ({}));
            _all = data.reviews || [];

            // Stats
            const total = data.total || _all.length;
            const avg = data.avg_rating || null;
            const fiveStar = _all.filter(r => r.rating === 5).length;

            document.getElementById("mrAvg").textContent = avg ? `${avg} ★` : "—";
            document.getElementById("mrTotal").textContent = total;
            document.getElementById("mrFive").textContent = fiveStar;

            render();
        } catch (err) {
            document.getElementById("mrGrid").innerHTML = `
                <div class="mr-empty">
                    <i data-lucide="alert-circle"></i>
                    <div>Failed to load reviews.</div>
                </div>`;
            if (window.lucide?.createIcons) lucide.createIcons();
        }
    }

    function getFiltered() {
        const star = parseInt(document.getElementById("mrFilterStar")?.value) || 0;
        if (!star) return _all;
        return _all.filter(r => r.rating === star);
    }

    function render() {
        const grid = document.getElementById("mrGrid");
        const pager = document.getElementById("mrPager");
        const filtered = getFiltered();

        if (!filtered.length) {
            grid.innerHTML = `
                <div class="mr-empty">
                    <i data-lucide="message-square"></i>
                    <div>No reviews yet.</div>
                    <div style="font-size:12px;margin-top:6px;">Reviews from your residents will appear here after their move-in is confirmed.</div>
                </div>`;
            pager.innerHTML = "";
            if (window.lucide?.createIcons) lucide.createIcons();
            return;
        }

        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        if (_page > totalPages) _page = totalPages;
        const start = (_page - 1) * PAGE_SIZE;
        const pageItems = filtered.slice(start, start + PAGE_SIZE);

        grid.innerHTML = pageItems.map(rv => {
            const stars = Array.from({ length: 5 }, (_, i) =>
                `<i data-lucide="star" class="${i < rv.rating ? "filled" : "empty"}"
                    style="${i < rv.rating ? "color:#f59e0b;fill:#f59e0b;" : "color:#e5e7eb;"}"></i>`
            ).join("");

            const name = rv.reviewer_name || "Resident";
            const init = (name[0] || "R").toUpperCase();
            const avatarHtml = rv.reviewer_avatar_url
                ? `<img src="${esc(rv.reviewer_avatar_url)}" alt="">`
                : esc(init);

            const date = fmtDate(rv.created_at);

            return `
                <div class="mr-card">
                    <div class="mr-card-top">
                        <div class="mr-av">${avatarHtml}</div>
                        <div class="mr-card-info">
                            <div class="mr-card-name">${esc(name)}</div>
                            <div class="mr-card-meta">Resident</div>
                        </div>
                        <div class="mr-stars">${stars}</div>
                    </div>
                    ${rv.comment ? `<p class="mr-comment">"${esc(rv.comment)}"</p>` : `<p class="mr-comment" style="color:#9ca3af;font-style:normal;">No written feedback.</p>`}
                    <div class="mr-footer">${date}</div>
                </div>`;
        }).join("");

        // Pager
        if (totalPages <= 1) {
            pager.innerHTML = "";
        } else {
            const btn = (label, page, disabled, active) => `
                <button type="button" data-page="${page}" ${disabled ? "disabled" : ""}
                    class="mr-pg-btn ${active ? "active" : ""}">${label}</button>`;
            const pages = [];
            for (let i = 1; i <= totalPages; i++) pages.push(btn(String(i), i, false, i === _page));
            pager.innerHTML = `
                <div class="mr-pager">
                    <span class="mr-pager-info">
                        Showing ${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length}
                    </span>
                    <div class="mr-pager-btns">
                        ${btn("‹", _page - 1, _page === 1, false)}
                        ${pages.join("")}
                        ${btn("›", _page + 1, _page === totalPages, false)}
                    </div>
                </div>`;
        }

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // Filter change
    document.getElementById("mrFilterStar")?.addEventListener("change", () => {
        _page = 1;
        render();
    });

    // Pager delegation
    document.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-page]");
        if (!btn || btn.disabled) return;
        const p = parseInt(btn.dataset.page);
        if (!isNaN(p)) { _page = p; render(); }
    });

    init();
})();