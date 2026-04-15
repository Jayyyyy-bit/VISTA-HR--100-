/* ============================================================
   VISTA-HR · Resident Messages
   resident_messages.js
============================================================ */

(() => {
    const API = "/api";

    const state = {
        conversations: [],
        activeThread: null,
        messages: [],
        searchQuery: "",
        meId: null,
        showArchived: false,  // toggle between inbox and archived
    };

    let pollTimer = null;

    // ── Helpers ────────────────────────────────────────────
    const esc = s => String(s || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const el = id => document.getElementById(id);

    function fmtTime(iso) {
        if (!iso) return "";
        const raw = iso.includes("+") || iso.endsWith("Z") ? iso : iso + "Z";
        const d = new Date(raw);
        const now = new Date();
        const diffDays = Math.floor((now - d) / 86400000);
        if (diffDays === 0) return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
        if (diffDays === 1) return "Yesterday";
        if (diffDays < 7) return d.toLocaleDateString("en-PH", { weekday: "short" });
        return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
    }

    function fmtDateLabel(iso) {
        if (!iso) return "";
        const raw = iso.includes("+") || iso.endsWith("Z") ? iso : iso + "Z";
        const d = new Date(raw);
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        if (d.toDateString() === today) return "Today";
        if (d.toDateString() === yesterday) return "Yesterday";
        return d.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
    }

    function initials(name) {
        const p = (name || "").trim().split(" ");
        return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?";
    }

    function threadKey(t) { return `${t.listing_id}_${t.other_user_id}`; }

    // ── API ────────────────────────────────────────────────
    async function apiFetch(path, opts = {}) {
        const res = await fetch(`${API}${path}`, {
            headers: { "Content-Type": "application/json" },
            credentials: "include", ...opts,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw data;
        return data;
    }

    async function loadConversations(archived = false) {
        try {
            const url = archived ? "/messages/conversations?archived=true" : "/messages/conversations";
            const data = await apiFetch(url);
            state.conversations = data.conversations || [];
        } catch (e) {
            console.warn("[Messages] loadConversations failed", e);
        }
    }

    async function loadThread(listing_id, other_user_id) {
        try {
            const data = await apiFetch(`/messages/conversations/${listing_id}/${other_user_id}`);
            state.messages = data.messages || [];
        } catch (e) {
            console.warn("[Messages] loadThread failed", e);
            state.messages = [];
        }
    }

    async function sendMessage(text) {
        if (!state.activeThread || !text.trim()) return;
        const { listing_id, other_user_id } = state.activeThread;
        try {
            const data = await apiFetch("/messages", {
                method: "POST",
                body: JSON.stringify({ receiver_id: other_user_id, listing_id, text: text.trim() }),
            });
            const sent = data.data || data.message_obj || data;
            if (sent && (sent.id || sent.text || sent.body)) state.messages.push(sent);
            renderBubbles();
            scrollToBottom();
            await loadConversations();
            renderThreadList();
        } catch (e) {
            console.error("[Messages] sendMessage failed", e);
            if (window.showError) showError("Failed to send. Please try again.");
            else console.error("[Messages] sendMessage failed", e);
        }
    }

    // ── Render: Thread list ────────────────────────────────
    function renderThreadList() {
        const listEl = el("rmThreadList");
        if (!listEl) return;

        const q = state.searchQuery.toLowerCase();
        const filtered = state.conversations.filter(t =>
            !q ||
            (t.other_name || "").toLowerCase().includes(q) ||
            (t.last_message || "").toLowerCase().includes(q) ||
            (t.listing_title || "").toLowerCase().includes(q)
        );

        // Unread pill
        const unreadCount = state.conversations.filter(t => t.unread).length;
        const pill = el("rmUnreadPill");
        if (pill) { pill.textContent = unreadCount; pill.hidden = unreadCount === 0; }

        if (!filtered.length) {
            listEl.innerHTML = `<div class="rm-empty-threads">${state.conversations.length ? "No conversations match your search." : "No messages yet."
                }</div>`;
            return;
        }

        const activeKey = state.activeThread ? threadKey(state.activeThread) : null;

        listEl.innerHTML = filtered.map(t => {
            const key = threadKey(t);
            const ini = t.initials || initials(t.other_name);
            return `<div class="rm-thread${t.unread ? " unread" : ""}${key === activeKey ? " active" : ""}"
                data-listing="${t.listing_id}" data-other="${t.other_user_id}">
                <div class="rm-thread-av">${esc(ini)}</div>
                <div class="rm-thread-body">
                    <div class="rm-thread-row">
                        <span class="rm-thread-name">${esc(t.other_name)}</span>
                        <span class="rm-thread-time">${esc(fmtTime(t.last_time))}</span>
                    </div>
                    <div class="rm-thread-listing">${esc(t.listing_title)}</div>
                    <div class="rm-thread-preview">${esc(t.last_message || "")}</div>
                </div>
                ${t.unread ? '<span class="rm-unread-dot"></span>' : ""}
                <div class="rm-thread-actions">
                    ${t.is_archived
                    ? `<button class="rm-thread-action rm-thread-unarchive" data-listing="${t.listing_id}" data-other="${t.other_user_id}" title="Unarchive">
                            <i data-lucide="inbox"></i>
                           </button>`
                    : `<button class="rm-thread-action rm-thread-archive" data-listing="${t.listing_id}" data-other="${t.other_user_id}" title="Archive">
                            <i data-lucide="archive"></i>
                           </button>`
                }
                    <button class="rm-thread-action rm-thread-delete" data-listing="${t.listing_id}" data-other="${t.other_user_id}" title="Delete conversation">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>`;
        }).join("");

        listEl.querySelectorAll(".rm-thread[data-listing]").forEach(row => {
            row.addEventListener("click", e => {
                // Don't open thread if clicking action buttons
                if (e.target.closest(".rm-thread-actions")) return;
                openThread(Number(row.dataset.listing), Number(row.dataset.other));
            });
        });

        // Archive buttons
        listEl.querySelectorAll(".rm-thread-archive").forEach(btn => {
            btn.addEventListener("click", async e => {
                e.stopPropagation();
                const lid = Number(btn.dataset.listing);
                const oid = Number(btn.dataset.other);
                try {
                    await apiFetch(`/messages/conversations/${lid}/${oid}/archive`, { method: "POST" });
                    await loadConversations(state.showArchived);
                    renderThreadList();
                    if (state.activeThread?.listing_id === lid && state.activeThread?.other_user_id === oid) {
                        el("rmEmpty").hidden = false;
                        el("rmChat").hidden = true;
                        state.activeThread = null;
                    }
                    if (window.showSuccess) showSuccess("Conversation archived.");
                } catch (err) { if (window.showError) showError(err.error || "Failed."); }
            });
        });

        // Unarchive buttons
        listEl.querySelectorAll(".rm-thread-unarchive").forEach(btn => {
            btn.addEventListener("click", async e => {
                e.stopPropagation();
                const lid = Number(btn.dataset.listing);
                const oid = Number(btn.dataset.other);
                try {
                    await apiFetch(`/messages/conversations/${lid}/${oid}/archive`, { method: "DELETE" });
                    await loadConversations(state.showArchived);
                    renderThreadList();
                    if (window.showSuccess) showSuccess("Moved back to inbox.");
                } catch (err) { if (window.showError) showError(err.error || "Failed."); }
            });
        });

        // Delete buttons
        listEl.querySelectorAll(".rm-thread-delete").forEach(btn => {
            btn.addEventListener("click", async e => {
                e.stopPropagation();
                const lid = Number(btn.dataset.listing);
                const oid = Number(btn.dataset.other);
                openDeleteModal(lid, oid);
            });
        });

        if (window.lucide?.createIcons) lucide.createIcons();
    }

    // ── Render: Chat bubbles ───────────────────────────────
    function renderBubbles() {
        const bubblesEl = el("rmBubbles");
        if (!bubblesEl) return;

        if (!state.messages.length) {
            bubblesEl.innerHTML = `<div style="text-align:center;padding:32px;font-size:13px;color:rgba(34,34,34,.35);">
                No messages yet. Send a message to start the conversation! 👋
            </div>`;
            return;
        }

        let lastDate = null;
        bubblesEl.innerHTML = state.messages.map(m => {
            const isOwn = m.sender_id === state.meId || m.from === "me";  // support both field shapes
            const msgDateStr = m.created_at ? new Date(
                m.created_at.includes("+") || m.created_at.endsWith("Z") ? m.created_at : m.created_at + "Z"
            ).toDateString() : null;

            let divider = "";
            if (msgDateStr && msgDateStr !== lastDate) {
                lastDate = msgDateStr;
                divider = `<div class="rm-date-divider">${esc(fmtDateLabel(m.created_at))}</div>`;
            }

            const receipt = isOwn
                ? `<span class="rm-receipt ${m.is_read ? "read" : "sent"}">${m.is_read ? "✓✓" : "✓"}</span>`
                : "";

            return `${divider}
            <div class="rm-bubble-group ${isOwn ? "is-own" : "is-other"}">
                <div class="rm-bubble">${esc(m.text || m.body || "")}</div>
                <div class="rm-bubble-meta">
                    ${receipt}
                    <span>${esc(fmtTime(m.created_at))}</span>
                </div>
            </div>`;
        }).join("");

        scrollToBottom();
    }

    function scrollToBottom() {
        const b = el("rmBubbles");
        if (b) b.scrollTop = b.scrollHeight;
    }

    // ── Open thread ────────────────────────────────────────
    async function openThread(listing_id, other_user_id) {
        const meta = state.conversations.find(
            t => t.listing_id === listing_id && t.other_user_id === other_user_id
        );
        state.activeThread = meta || { listing_id, other_user_id };

        // Show chat, hide empty
        el("rmEmpty").hidden = true;
        el("rmChat").hidden = false;

        // Mobile: show main panel
        document.querySelector(".rm-shell")?.classList.add("chat-open");

        // Mark thread as read locally
        if (meta) meta.unread = 0;
        renderThreadList();

        // Populate header
        const t = state.activeThread;
        const ini = t.initials || initials(t.other_name || "");
        if (el("rmChatAv")) el("rmChatAv").textContent = ini;
        if (el("rmChatName")) el("rmChatName").textContent = t.other_name || "Property Owner";
        if (el("rmChatSub")) el("rmChatSub").textContent = t.other_email || "Property Owner";
        if (el("rmListingChipTitle")) el("rmListingChipTitle").textContent = t.listing_title || "—";

        // Listing info bar
        if (el("rmListingBarTitle")) el("rmListingBarTitle").textContent = t.listing_title || "—";
        if (el("rmListingBarMeta")) el("rmListingBarMeta").textContent = t.listing_meta || "";
        if (el("rmListingBarLink")) el("rmListingBarLink").href = `/Resident/listing_detail.html?id=${listing_id}`;

        const thumb = el("rmListingThumb");
        const ph = el("rmListingPh");
        if (t.listing_cover && thumb) {
            thumb.src = t.listing_cover; thumb.hidden = false;
            if (ph) ph.hidden = true;
        } else {
            if (thumb) thumb.hidden = true;
            if (ph) ph.hidden = false;
        }

        // Load messages
        el("rmBubbles").innerHTML = `<div class="rm-bubble-loading"><i data-lucide="loader-2" class="rm-spin"></i> Loading…</div>`;
        if (window.lucide?.createIcons) lucide.createIcons();

        await loadThread(listing_id, other_user_id);
        renderBubbles();

        // Poll for new messages every 8 seconds
        clearInterval(pollTimer);
        pollTimer = setInterval(async () => {
            if (!state.activeThread) return;
            const prev = state.messages.length;
            const prevRead = state.messages.filter(m => m.is_read).length;
            await loadThread(state.activeThread.listing_id, state.activeThread.other_user_id);
            if (state.messages.length !== prev || state.messages.filter(m => m.is_read).length !== prevRead) {
                renderBubbles();
                await loadConversations();
                renderThreadList();
            }
        }, 8000);  // 8s — avoid hammering the server

        if (window.lucide?.createIcons) lucide.createIcons();
        el("rmInput")?.focus();
    }

    // ── Back button (mobile) ───────────────────────────────
    el("rmChatBack")?.addEventListener("click", () => {
        document.querySelector(".rm-shell")?.classList.remove("chat-open");
        el("rmEmpty").hidden = false;
        el("rmChat").hidden = true;
        state.activeThread = null;
        clearInterval(pollTimer);
    });

    // ── Search ─────────────────────────────────────────────
    el("rmSearchInput")?.addEventListener("input", e => {
        state.searchQuery = e.target.value;
        renderThreadList();
    });

    // ── Send message ───────────────────────────────────────
    const input = el("rmInput");
    const sendBtn = el("rmSendBtn");

    input?.addEventListener("input", () => {
        const hasText = input.value.trim().length > 0;
        if (sendBtn) sendBtn.disabled = !hasText;
        // Auto-grow textarea
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });

    input?.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn?.disabled) doSend();
        }
    });

    sendBtn?.addEventListener("click", doSend);

    async function doSend() {
        const text = input?.value?.trim();
        if (!text) return;
        if (input) { input.value = ""; input.style.height = "auto"; }
        if (sendBtn) sendBtn.disabled = true;
        await sendMessage(text);
    }

    // ── Delete confirmation modal ────────────────────────────
    let _deleteTarget = null; // { lid, oid }

    function openDeleteModal(lid, oid) {
        _deleteTarget = { lid, oid };
        el("rmDeleteOverlay").hidden = false;
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function closeDeleteModal() {
        _deleteTarget = null;
        el("rmDeleteOverlay").hidden = true;
    }

    el("rmDeleteCancel")?.addEventListener("click", closeDeleteModal);
    el("rmDeleteOverlay")?.addEventListener("click", e => {
        if (e.target === el("rmDeleteOverlay")) closeDeleteModal();
    });
    el("rmDeleteConfirm")?.addEventListener("click", async () => {
        if (!_deleteTarget) return;
        const { lid, oid } = _deleteTarget;
        const btn = el("rmDeleteConfirm");
        btn.textContent = "Deleting…";
        btn.disabled = true;
        try {
            await apiFetch(`/messages/conversations/${lid}/${oid}`, { method: "DELETE" });
            await loadConversations(state.showArchived);
            renderThreadList();
            if (state.activeThread?.listing_id === lid && state.activeThread?.other_user_id === oid) {
                el("rmEmpty").hidden = false;
                el("rmChat").hidden = true;
                state.activeThread = null;
                clearInterval(pollTimer);
            }
            closeDeleteModal();
            if (window.showSuccess) showSuccess("Conversation deleted.");
        } catch (err) {
            if (window.showError) showError(err.error || "Failed to delete.");
        } finally {
            btn.textContent = "Delete";
            btn.disabled = false;
        }
    });

    // ── Boot ───────────────────────────────────────────────
    document.addEventListener("DOMContentLoaded", async () => {
        // Auth guard
        if (!window.AuthGuard) { location.href = "/auth/login.html"; return; }
        const me = await window.AuthGuard.fetchMe();
        if (!me.ok || !me.data?.user) { location.href = "/auth/login.html"; return; }

        const user = me.data.user;
        if (user.role !== "RESIDENT") { location.href = "/auth/login.html"; return; }

        state.meId = user.id;

        // Propagate avatar photo or initials
        if (window.UserAvatar) {
            UserAvatar.apply(user);
        } else {
            const init = (user.first_name?.[0] || user.email?.[0] || "R").toUpperCase();
            if (el("rmAvatar")) el("rmAvatar").textContent = init;
        }

        // Load conversations
        await loadConversations(state.showArchived);
        renderThreadList();

        // Inbox / Archived tab toggle
        const archiveTab = el("rmArchiveTab");
        const inboxTab = el("rmInboxTab");
        archiveTab?.addEventListener("click", async () => {
            state.showArchived = true;
            archiveTab.classList.add("active");
            inboxTab?.classList.remove("active");
            state.activeThread = null;
            el("rmEmpty").hidden = false;
            el("rmChat").hidden = true;
            clearInterval(pollTimer);
            await loadConversations(true);
            renderThreadList();
        });
        inboxTab?.addEventListener("click", async () => {
            state.showArchived = false;
            inboxTab.classList.add("active");
            archiveTab?.classList.remove("active");
            state.activeThread = null;
            el("rmEmpty").hidden = false;
            el("rmChat").hidden = true;
            clearInterval(pollTimer);
            await loadConversations(false);
            renderThreadList();
        });

        // Check for ?listing=X&owner=Y in URL (open thread directly from listing detail)
        const params = new URLSearchParams(location.search);
        const lid = params.get("listing");
        const oid = params.get("owner");
        if (lid && oid) {
            await openThread(Number(lid), Number(oid));
        }

        if (window.lucide?.createIcons) lucide.createIcons();
    });

})();