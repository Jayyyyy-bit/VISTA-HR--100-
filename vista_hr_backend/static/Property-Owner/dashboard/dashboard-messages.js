/* VISTA-HR | Messages — real API
   ------------------------------------------------------------ */
(() => {
    const QUICK_REPLIES = [
        "Thanks for your interest!",
        "I'll get back to you soon.",
        "Would you like to schedule a viewing?",
        "The unit is still available.",
        "Please send your requirements.",
    ];

    const state = {
        conversations: [],
        activeThread: null,
        messages: [],
        searchQuery: "",
        localReactions: {},
        localStarred: {},
        localNotes: {},
    };

    let pollTimer = null;

    function esc(s) {
        return String(s || "")
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function fmtTime(isoStr) {
        if (!isoStr) return "";
        const d = new Date(isoStr);
        const now = new Date();
        const diffDays = Math.floor((now - d) / 86400000);
        if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        if (diffDays === 1) return "Yesterday";
        if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
        return d.toLocaleDateString([], { month: "short", day: "numeric" });
    }

    function initials(name) {
        const parts = (name || "").trim().split(" ");
        return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
    }

    function threadKey(t) { return `${t.listing_id}_${t.other_user_id}`; }

    const API_BASE = "http://127.0.0.1:5000/api";

    async function apiFetch(path, opts = {}) {
        const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
        const res = await fetch(url, {
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            ...opts,
        });
        const data = await res.json();
        if (!res.ok) throw data;
        return data;
    }

    async function loadConversations() {
        try {
            const data = await apiFetch("/messages/conversations");
            state.conversations = data.conversations || [];
        } catch (e) {
            console.error("[messages] loadConversations failed", e);
            state.conversations = [];
        }
    }

    async function loadThread(listing_id, other_user_id) {
        try {
            const data = await apiFetch(`/messages/conversations/${listing_id}/${other_user_id}`);
            state.messages = data.messages || [];
        } catch (e) {
            console.error("[messages] loadThread failed", e);
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
            state.messages.push(data.data);
            renderBubbles();
            await loadConversations();
            renderThreadList();
        } catch (e) {
            console.error("[messages] sendMessage failed", e);
            showError("Failed to send message. Please try again.");
        }
    }

    async function loadUnreadBadge() {
        try {
            const data = await apiFetch("/messages/unread-count");
            updateNavBadge(data.unread || 0);
        } catch { /* silent */ }
    }

    function updateNavBadge(count) {
        const tab = document.querySelector('.dashTab[data-tab="messages"]');
        if (!tab) return;
        let badge = tab.querySelector(".msgNavBadge");
        if (count > 0) {
            if (!badge) { badge = document.createElement("span"); badge.className = "msgNavBadge"; tab.appendChild(badge); }
        } else {
            badge?.remove();
        }
    }

    function renderThreadList() {
        const el = document.getElementById("msgThreadList");
        if (!el) return;

        const q = state.searchQuery.toLowerCase();
        const filtered = state.conversations.filter(t =>
            !q ||
            t.other_name.toLowerCase().includes(q) ||
            t.last_message.toLowerCase().includes(q) ||
            t.listing_title.toLowerCase().includes(q)
        );

        if (!filtered.length) {
            el.innerHTML = `<div style="padding:20px 16px;font-size:12px;color:rgba(18,52,88,0.40);text-align:center;">${state.conversations.length ? "No conversations found" : "No messages yet"}</div>`;
            return;
        }

        const activeKey = state.activeThread ? threadKey(state.activeThread) : null;

        el.innerHTML = filtered.map(t => {
            const key = threadKey(t);
            const ini = t.initials || initials(t.other_name);
            return `
            <div class="msgThread${t.unread ? " isUnread" : ""}${key === activeKey ? " isActive" : ""}" data-listing="${t.listing_id}" data-other="${t.other_user_id}">
                <div class="msgThreadAvatar">${esc(ini)}</div>
                <div class="msgThreadBody">
                    <div class="msgThreadRow">
                        <span class="msgThreadName">${esc(t.other_name)}</span>
                        <span class="msgThreadTime">${esc(fmtTime(t.last_time))}</span>
                    </div>
                    <div class="msgThreadPreview">${esc(t.last_message)}</div>
                    <span class="msgThreadTag tag-listing">${esc(t.listing_title)}</span>
                </div>
                ${t.unread ? '<span class="msgUnreadDot"></span>' : ""}
            </div>`;
        }).join("");

        el.querySelectorAll(".msgThread[data-listing]").forEach(row => {
            row.addEventListener("click", () =>
                openThread(Number(row.dataset.listing), Number(row.dataset.other))
            );
        });

        const pill = document.getElementById("msgUnreadPill");
        const count = state.conversations.filter(t => t.unread).length;
        if (pill) { pill.textContent = count; pill.style.display = count ? "" : "none"; }
    }

    async function openThread(listing_id, other_user_id) {
        const meta = state.conversations.find(t => t.listing_id === listing_id && t.other_user_id === other_user_id);
        state.activeThread = meta || { listing_id, other_user_id };

        document.getElementById("msgMainEmpty").hidden = true;
        document.getElementById("msgChatWrap").hidden = false;
        document.getElementById("msgInfoPanel").hidden = false;

        if (meta) meta.unread = 0;
        renderThreadList();
        renderChatHeader();
        renderInfoPanel();

        await loadThread(listing_id, other_user_id);
        renderBubbles();
        renderQuickReplies();
        loadUnreadBadge();

        if (window.lucide) lucide.createIcons();

        clearInterval(pollTimer);
        pollTimer = setInterval(async () => {
            if (!state.activeThread) return;
            const prev = state.messages.length;
            await loadThread(state.activeThread.listing_id, state.activeThread.other_user_id);
            if (state.messages.length !== prev) {
                renderBubbles();
                await loadConversations();
                renderThreadList();
                loadUnreadBadge();
            }
        }, 1500);
    }

    function renderChatHeader() {
        const el = document.getElementById("msgChatHeader");
        const t = state.activeThread;
        if (!el || !t) return;
        const ini = t.initials || initials(t.other_name || "");
        el.innerHTML = `
            <div class="msgChatHeaderAvatar">${esc(ini)}</div>
            <div class="msgChatHeaderInfo">
                <div class="msgChatHeaderName">${esc(t.other_name || "")}</div>
                <div class="msgChatHeaderSub">${esc(t.other_email || "")}</div>
            </div>
            <div class="msgPropertyChip">
                <i data-lucide="home" style="width:11px;height:11px;stroke-width:2"></i>
                ${esc(t.listing_title || "")}
            </div>`;
        if (window.lucide) lucide.createIcons();
    }

    function renderBubbles() {
        const el = document.getElementById("msgBubbleList");
        if (!el) return;

        const reactionEmojis = ["👍", "❤️", "✓"];

        if (!state.messages.length) {
            el.innerHTML = `<div style="padding:32px;text-align:center;font-size:13px;color:rgba(18,52,88,0.35);font-weight:600;">No messages yet. Say hello! 👋</div>`;
            return;
        }

        let lastDate = null;
        el.innerHTML = state.messages.map(m => {
            const isOwn = m.from === "me";
            const msgDate = m.created_at ? new Date(m.created_at).toDateString() : null;
            let dateDivider = "";
            if (msgDate && msgDate !== lastDate) {
                lastDate = msgDate;
                const today = new Date().toDateString();
                const yesterday = new Date(Date.now() - 86400000).toDateString();
                const label = msgDate === today ? "Today"
                    : msgDate === yesterday ? "Yesterday"
                        : new Date(m.created_at).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
                dateDivider = `<div class="msgDateDivider">${label}</div>`;
            }

            const receipt = isOwn
                ? `<span class="msgReceipt ${m.is_read ? "isRead" : "isSent"}">${m.is_read ? "✓✓" : "✓"}</span>`
                : "";

            const reactions = state.localReactions[m.id] || {};
            const reactionsHtml = Object.entries(reactions).length
                ? `<div class="msgBubbleReactions">${Object.entries(reactions).map(([e, c]) =>
                    `<div class="msgReactionChip" data-msgid="${m.id}" data-emoji="${esc(e)}">${esc(e)}<span>${c}</span></div>`
                ).join("")}</div>` : "";

            const isStarred = !!state.localStarred[m.id];

            return `${dateDivider}
            <div class="msgBubbleGroup ${isOwn ? "isOwn" : "isOther"}">
                <div class="msgBubbleWrap">
                    <div class="msgReactBar">
                        ${reactionEmojis.map(e => `<button class="msgReactBtn" data-msgid="${m.id}" data-emoji="${esc(e)}">${e}</button>`).join("")}
                        <button class="msgReactBtn${isStarred ? " isStarred" : ""}" data-msgid="${m.id}" data-star="1" title="Star">⭐</button>
                    </div>
                    <div class="msgBubble" data-msgid="${m.id}">${esc(m.text)}</div>
                </div>
                ${reactionsHtml}
                <div class="msgBubbleMeta">${receipt}<span>${esc(fmtTime(m.created_at))}</span></div>
            </div>`;
        }).join("");

        el.querySelectorAll(".msgReactBtn").forEach(btn => {
            btn.addEventListener("click", () => {
                if (btn.dataset.star) { toggleStar(btn.dataset.msgid); return; }
                addReaction(btn.dataset.msgid, btn.dataset.emoji);
            });
        });

        el.querySelectorAll(".msgReactionChip").forEach(chip => {
            chip.addEventListener("click", () => addReaction(chip.dataset.msgid, chip.dataset.emoji));
        });

        el.scrollTop = el.scrollHeight;
        updateJumpBtn();
    }

    function addReaction(msgId, emoji) {
        if (!state.localReactions[msgId]) state.localReactions[msgId] = {};
        if (state.localReactions[msgId][emoji]) {
            delete state.localReactions[msgId][emoji];
        } else {
            state.localReactions[msgId][emoji] = 1;
        }
        renderBubbles();
    }

    function toggleStar(msgId) {
        state.localStarred[msgId] = !state.localStarred[msgId];
        if (!state.localStarred[msgId]) delete state.localStarred[msgId];
        renderBubbles();
        renderInfoPanel();
    }

    function updateJumpBtn() {
        const btn = document.getElementById("msgJumpBtn");
        if (!btn) return;
        const hasUnread = state.messages.some(m => !m.is_read && m.from === "them");
        btn.classList.toggle("isHidden", !hasUnread);
    }

    function renderQuickReplies() {
        const el = document.getElementById("msgQuickReplies");
        if (!el) return;
        el.innerHTML = QUICK_REPLIES.map(r => `<button class="msgQuickReply" type="button">${esc(r)}</button>`).join("");
        el.classList.add("hasReplies");
        el.querySelectorAll(".msgQuickReply").forEach(btn => {
            btn.addEventListener("click", () => {
                const input = document.getElementById("msgInput");
                if (input) { input.value = btn.textContent; input.focus(); dismissQuickReplies(); }
            });
        });
    }

    function dismissQuickReplies() {
        const el = document.getElementById("msgQuickReplies");
        if (!el) return;
        el.style.transition = "opacity 150ms ease, transform 150ms ease";
        el.style.opacity = "0"; el.style.transform = "translateY(6px)";
        setTimeout(() => { el.innerHTML = ""; el.classList.remove("hasReplies"); el.style.opacity = ""; el.style.transform = ""; }, 150);
    }

    function renderInfoPanel() {
        const el = document.getElementById("msgInfoInner");
        const t = state.activeThread;
        if (!el || !t) return;

        const key = threadKey(t);
        const notes = state.localNotes[key] || "";
        const starred = state.messages.filter(m => state.localStarred[m.id]);
        const ini = t.initials || initials(t.other_name || "");

        el.innerHTML = `
            <div class="msgInfoAvatar">${esc(ini)}</div>
            <div class="msgInfoName">${esc(t.other_name || "")}</div>
            <div class="msgInfoRole">${esc(t.other_role === "RESIDENT" ? "Prospective tenant" : "Property owner")}</div>

            <div class="msgInfoSection">
                <div class="msgInfoSectionLabel">Contact</div>
                <div class="msgInfoRow"><span class="msgInfoRowLabel">Email</span><span class="msgInfoRowValue" style="font-size:11px">${esc(t.other_email || "—")}</span></div>
                <div class="msgInfoRow"><span class="msgInfoRowLabel">Phone</span><span class="msgInfoRowValue">${esc(t.other_phone || "—")}</span></div>
            </div>

            <div class="msgInfoSection">
                <div class="msgInfoSectionLabel">Listing</div>
                <div class="msgPropertyCard">
                    <div class="msgPropertyImg" style="background:linear-gradient(135deg,rgba(212,201,190,0.8),rgba(180,170,155,0.6));display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:8px;">
                        ${t.listing_cover
                ? `<img src="${esc(t.listing_cover)}" style="width:100%;height:100%;object-fit:cover;">`
                : `<i data-lucide="home" style="width:26px;height:26px;stroke-width:1.4;color:rgba(18,52,88,0.35)"></i>`}
                    </div>
                    <div class="msgPropertyBody">
                        <div class="msgPropertyName">${esc(t.listing_title || "")}</div>
                        <div class="msgPropertyMeta">${esc(t.listing_meta || "")}</div>
                        <span class="msgPropertyStatus">${esc(t.listing_status || "")}</span>
                    </div>
                </div>
            </div>

            <div class="msgInfoSection">
                <div class="msgInfoSectionLabel">Actions</div>
                <div class="msgActionBtns">
                    <button class="msgActionBtn isPrimary" type="button" id="msgBtnViewing">
                        <i data-lucide="calendar" style="width:13px;height:13px;stroke-width:2"></i>
                        Schedule viewing
                    </button>
                    <button class="msgActionBtn" type="button" id="msgBtnContract">
                        <i data-lucide="file-text" style="width:13px;height:13px;stroke-width:2"></i>
                        Send contract
                    </button>
                </div>
            </div>

            <div class="msgInfoSection">
                <div class="msgInfoSectionLabel">Private notes</div>
                <textarea class="msgNotesTextarea" id="msgNotes" placeholder="Add private notes about this tenant…">${esc(notes)}</textarea>
            </div>

            ${starred.length ? `
            <div class="msgInfoSection">
                <div class="msgInfoSectionLabel">⭐ Starred messages</div>
                <div class="msgStarredList">
                    ${starred.map(m => `<div class="msgStarredItem">${esc(m.text)}<div class="msgStarredTime">${esc(fmtTime(m.created_at))}</div></div>`).join("")}
                </div>
            </div>` : ""}
        `;

        document.getElementById("msgNotes")?.addEventListener("input", e => { state.localNotes[key] = e.target.value; });
        document.getElementById("msgBtnViewing")?.addEventListener("click", () => showInfo(`Schedule viewing with ${t.other_name} — coming soon!`));
        document.getElementById("msgBtnContract")?.addEventListener("click", () => showInfo(`Send contract to ${t.other_email} — coming soon!`));

        if (window.lucide) lucide.createIcons();
    }

    function bindSend() {
        const btn = document.getElementById("msgSendBtn");
        const input = document.getElementById("msgInput");

        async function doSend() {
            if (!input) return;
            const text = input.value.trim();
            if (!text) return;
            input.value = ""; input.style.height = "";
            dismissQuickReplies();
            await sendMessage(text);
        }

        btn?.addEventListener("click", doSend);
        input?.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); } });
        input?.addEventListener("input", () => {
            input.style.height = "auto";
            input.style.height = Math.min(input.scrollHeight, 120) + "px";
            if (input.value.trim()) dismissQuickReplies();
        });
    }

    function bindJumpBtn() {
        const btn = document.getElementById("msgJumpBtn");
        const list = document.getElementById("msgBubbleList");
        btn?.addEventListener("click", () => { if (list) list.scrollTop = list.scrollHeight; btn.classList.add("isHidden"); });
    }

    function bindSearch() {
        document.getElementById("msgSearchInput")?.addEventListener("input", e => { state.searchQuery = e.target.value; renderThreadList(); });
    }

    async function initMessages() {
        if (!initMessages._bound) {
            bindSend();
            bindJumpBtn();
            bindSearch();
            initMessages._bound = true;
        }
        await loadConversations();
        renderThreadList();
        loadUnreadBadge();
        if (window.lucide) lucide.createIcons();
    }

    document.querySelector('.dashTab[data-tab="messages"]')?.addEventListener("click", () => setTimeout(initMessages, 50));
    document.addEventListener("DOMContentLoaded", () => {
        if (document.getElementById("tab-messages")?.classList.contains("active")) initMessages();
        loadUnreadBadge();
    });

    window.MessagesPanel = { init: initMessages, openThread };
})();