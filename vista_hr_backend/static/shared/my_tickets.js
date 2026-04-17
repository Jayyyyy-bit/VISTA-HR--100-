(() => {
    const API = "/api";
    let currentUser = null;
    let tickets = [];

    function el(id) { return document.getElementById(id); }

    async function init() {
        try {
            const res = await fetch(`${API}/auth/me`, { credentials: "include" });
            if (!res.ok) { location.href = "/auth/login.html"; return; }
            const data = await res.json();
            currentUser = data?.user;
            if (!currentUser) { location.href = "/auth/login.html"; return; }
        } catch { location.href = "/auth/login.html"; return; }

        await loadTickets();
        setupNewTicket();
        setupDetailModal();
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    async function loadTickets() {
        try {
            const res = await fetch(`${API}/tickets`, { credentials: "include" });
            if (!res.ok) throw new Error();
            const data = await res.json();
            tickets = data.tickets || [];
        } catch { tickets = []; }
        renderTickets();
    }

    function renderTickets() {
        const list = el("ticketsList");
        const empty = el("emptyState");

        if (!tickets.length) {
            list.innerHTML = "";
            empty.hidden = false;
            if (window.lucide?.createIcons) lucide.createIcons();
            return;
        }

        empty.hidden = true;
        list.innerHTML = tickets.map(t => {
            const sts = (t.status || "OPEN").toLowerCase();
            const date = t.created_at ? new Date(t.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "";
            const hasReply = !!t.admin_reply;
            return `<div class="ticket-card" data-id="${t.id}">
                <div class="ticket-top">
                    <div class="ticket-subject">${esc(t.subject)}</div>
                    <span class="badge badge-${sts}">${t.status.replace("_", " ")}</span>
                </div>
                <div class="ticket-bottom">
                    <span>${t.category}</span>
                    <span>·</span>
                    <span>${date}</span>
                    ${hasReply ? `<span>· <strong>Reply received</strong></span>` : ""}
                </div>
            </div>`;
        }).join("");

        list.querySelectorAll(".ticket-card").forEach(card => {
            card.addEventListener("click", () => openDetail(parseInt(card.dataset.id)));
        });
    }

    // ── New ticket modal ────────────────────────────────
    function setupNewTicket() {
        const open = () => { el("newTicketOverlay").hidden = false; if (window.lucide?.createIcons) lucide.createIcons(); };
        const close = () => { el("newTicketOverlay").hidden = true; el("ticketErr").textContent = ""; };

        el("newTicketBtn")?.addEventListener("click", open);
        el("emptyNewBtn")?.addEventListener("click", open);
        el("newTicketClose")?.addEventListener("click", close);
        el("ticketCancelBtn")?.addEventListener("click", close);
        el("newTicketOverlay")?.addEventListener("click", e => { if (e.target === el("newTicketOverlay")) close(); });

        el("ticketSubmitBtn")?.addEventListener("click", async () => {
            const subject = el("ticketSubject").value.trim();
            const body = el("ticketBody").value.trim();
            const category = el("ticketCategory").value;
            const errEl = el("ticketErr");

            if (!subject || !body) { errEl.textContent = "Subject and description are required."; return; }

            const btn = el("ticketSubmitBtn");
            const label = btn.querySelector(".btn-label");
            const spinner = btn.querySelector(".btn-spinner");
            btn.disabled = true; if (label) label.hidden = true; if (spinner) spinner.hidden = false;
            errEl.textContent = "";

            try {
                const res = await fetch(`${API}/tickets`, {
                    method: "POST", credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ subject, body, category }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || "Failed to submit.");

                el("ticketSubject").value = "";
                el("ticketBody").value = "";
                close();
                await loadTickets();
                if (window.showSuccess) showSuccess("Ticket submitted!"); else if (window.showToast) showToast("Ticket submitted!");
            } catch (err) {
                errEl.textContent = err.message;
            } finally {
                btn.disabled = false; if (label) label.hidden = false; if (spinner) spinner.hidden = true;
            }
        });
    }

    // ── Detail modal ────────────────────────────────────
    function setupDetailModal() {
        el("detailClose")?.addEventListener("click", () => { el("detailOverlay").hidden = true; });
        el("detailOverlay")?.addEventListener("click", e => { if (e.target === el("detailOverlay")) el("detailOverlay").hidden = true; });
    }

    function openDetail(id) {
        const t = tickets.find(x => x.id === id);
        if (!t) return;

        el("detailTitle").textContent = `Ticket #${t.id} — ${t.subject}`;
        el("detailStatus").textContent = t.status.replace("_", " ");
        el("detailStatus").className = `badge badge-${(t.status || "open").toLowerCase()}`;
        el("detailCat").textContent = t.category;
        el("detailCat").className = `badge`;
        el("detailDate").textContent = t.created_at ? new Date(t.created_at).toLocaleString("en-PH") : "";
        el("detailBody").textContent = t.body;

        if (t.admin_reply) {
            el("replySection").hidden = false;
            el("detailReply").textContent = t.admin_reply;
            el("replyDate").textContent = t.replied_at ? `Replied ${new Date(t.replied_at).toLocaleString("en-PH")}` : "";
        } else {
            el("replySection").hidden = true;
        }

        el("detailOverlay").hidden = false;
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function esc(s) { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();