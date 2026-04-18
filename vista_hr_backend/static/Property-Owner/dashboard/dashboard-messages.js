/* VISTA-HR | Property Owner Dashboard — Messages
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
        showArchived: false,
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
        const raw = isoStr.includes("+") || isoStr.endsWith("Z") ? isoStr : isoStr + "Z";
        const d = new Date(raw);
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

    function linkify(text) {
        return esc(text).replace(
            /(https?:\/\/[^\s<>"]+)/g,
            '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;word-break:break-all;">$1</a>'
        );
    }

    const API_BASE = "/api";

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
            const url = state.showArchived
                ? "/messages/conversations?archived=true"
                : "/messages/conversations";
            const data = await apiFetch(url);
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

    async function sendMessage(text, image_url = null) {
        if (!state.activeThread) return;
        const { listing_id, other_user_id } = state.activeThread;
        try {
            const body = { receiver_id: other_user_id, listing_id };
            if (text) body.text = text.trim();
            if (image_url) body.image_url = image_url;
            const data = await apiFetch("/messages", { method: "POST", body: JSON.stringify(body) });
            state.messages.push(data.data);
            renderBubbles();
            await loadConversations();
            renderThreadList();
        } catch (e) {
            console.error("[messages] sendMessage failed", e);
        }
    }

    // ── Typing indicator ──────────────────────────────────
    let _typingTimer = null;
    let _typingPoll = null;

    function startTyping() {
        if (!state.activeThread) return;
        if (_typingTimer) return;
        apiFetch("/messages/typing", {
            method: "POST",
            body: JSON.stringify({ other_user_id: state.activeThread.other_user_id }),
        }).catch(() => { });
        _typingTimer = setTimeout(() => { _typingTimer = null; }, 3000);
    }

    function startTypingPoll() {
        stopTypingPoll();
        if (!state.activeThread) return;
        const { other_user_id } = state.activeThread;
        _typingPoll = setInterval(async () => {
            try {
                const d = await apiFetch(`/messages/typing/${other_user_id}`);
                const el = document.getElementById("msgTypingIndicator");
                if (el) el.hidden = !d.is_typing;
            } catch { }
        }, 2000);
    }

    function stopTypingPoll() {
        if (_typingPoll) { clearInterval(_typingPoll); _typingPoll = null; }
    }

    // ── Photo upload ──────────────────────────────────────
    async function uploadPhoto(file) {
        try {
            const sigRes = await apiFetch("/uploads/sign", {
                method: "POST",
                body: JSON.stringify({ folder: "messages" }),
            });
            const { signature, timestamp, cloud_name, api_key, upload_preset } = sigRes;
            const fd = new FormData();
            fd.append("file", file);
            fd.append("signature", signature);
            fd.append("timestamp", timestamp);
            fd.append("api_key", api_key);
            if (upload_preset) fd.append("upload_preset", upload_preset);
            const up = await fetch(
                `https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`,
                { method: "POST", body: fd }
            );
            const upData = await up.json();
            return upData.secure_url || null;
        } catch (e) {
            console.error("Photo upload failed", e);
            return null;
        }
    }

    async function loadUnreadBadge() {
        try {
            const data = await apiFetch("/messages/unread-count");
            updateNavBadge(data.unread || 0);
        } catch { }
    }

    function updateNavBadge(count) {
        const tab = document.querySelector('.dashTab[data-tab="messages"]');
        if (!tab) return;
        let badge = tab.querySelector(".msgNavBadge");
        if (count > 0) {
            if (!badge) { badge = document.createElement("span"); badge.className = "msgNavBadge"; tab.appendChild(badge); }
            badge.textContent = count > 9 ? "9+" : count;
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
            (t.other_name || "").toLowerCase().includes(q) ||
            (t.last_message || "").toLowerCase().includes(q) ||
            (t.listing_title || "").toLowerCase().includes(q)
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
                    <div class="msgThreadPreview">${esc(t.last_message || "")}</div>
                    <span class="msgThreadTag">${esc(t.listing_title)}</span>
                </div>
                ${t.unread ? '<span class="msgUnreadDot"></span>' : ""}
                <div class="msgThreadActions">
                    <button class="msgThreadActionBtn msgArchiveBtn"
                        data-listing="${t.listing_id}" data-other="${t.other_user_id}"
                        data-archived="${t.is_archived ? 'true' : 'false'}"
                        title="${t.is_archived ? 'Unarchive' : 'Archive'}">
                        <i data-lucide="${t.is_archived ? 'inbox' : 'archive'}"></i>
                    </button>
                    <button class="msgThreadActionBtn msgDeleteBtn"
                        data-listing="${t.listing_id}" data-other="${t.other_user_id}"
                        title="Delete conversation">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>`;
        }).join("");

        el.querySelectorAll(".msgThread[data-listing]").forEach(row => {
            row.addEventListener("click", e => {
                if (e.target.closest(".msgThreadActions")) return;
                openThread(Number(row.dataset.listing), Number(row.dataset.other));
            });
        });

        el.querySelectorAll(".msgArchiveBtn").forEach(btn => {
            btn.addEventListener("click", async e => {
                e.stopPropagation();
                const lid = Number(btn.dataset.listing);
                const oid = Number(btn.dataset.other);
                const isArchived = btn.dataset.archived === "true";
                try {
                    await apiFetch(`/messages/conversations/${lid}/${oid}/archive`,
                        { method: isArchived ? "DELETE" : "POST" });
                    if (state.activeThread?.listing_id === lid && state.activeThread?.other_user_id === oid) {
                        state.activeThread = null;
                        clearInterval(pollTimer);
                        stopTypingPoll();
                        document.getElementById("msgChatWrap").hidden = true;
                        document.getElementById("msgMainEmpty").hidden = false;
                        document.getElementById("msgInfoPanel").hidden = true;
                    }
                    await loadConversations();
                    renderThreadList();
                } catch (err) { console.error("Archive failed", err); }
            });
        });

        el.querySelectorAll(".msgDeleteBtn").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                openDashDeleteModal(Number(btn.dataset.listing), Number(btn.dataset.other));
            });
        });

        const pill = document.getElementById("msgUnreadPill");
        const count = state.conversations.filter(t => t.unread).length;
        if (pill) { pill.textContent = count; pill.style.display = count ? "" : "none"; }

        if (window.lucide) lucide.createIcons();
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

        startTypingPoll();
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
                loadUnreadBadge();
            }
        }, 8000);
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

        // Filter deleted messages
        const visible = state.messages.filter(m => !m.is_deleted);

        if (!visible.length) {
            el.innerHTML = `<div style="padding:32px;text-align:center;font-size:13px;color:rgba(18,52,88,0.35);font-weight:600;">No messages yet. Say hello! 👋</div>`;
            return;
        }

        let lastDate = null;

        el.innerHTML = visible.map(m => {
            const isOwn = m.from === "me";
            const msgDate = m.created_at ? new Date(
                m.created_at.includes("+") || m.created_at.endsWith("Z") ? m.created_at : m.created_at + "Z"
            ).toDateString() : null;

            let dateDivider = "";
            if (msgDate && msgDate !== lastDate) {
                lastDate = msgDate;
                const today = new Date().toDateString();
                const yesterday = new Date(Date.now() - 86400000).toDateString();
                const label = msgDate === today ? "Today"
                    : msgDate === yesterday ? "Yesterday"
                        : new Date(m.created_at.includes("+") || m.created_at.endsWith("Z") ? m.created_at : m.created_at + "Z")
                            .toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
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
            const msgText = m.text || m.body || "";

            return `${dateDivider}
            <div class="msgBubbleGroup ${isOwn ? "isOwn" : "isOther"}">
                <div class="msgBubbleWrap">
                    <div class="msgReactBar">
                        ${reactionEmojis.map(e => `<button class="msgReactBtn" data-msgid="${m.id}" data-emoji="${esc(e)}">${e}</button>`).join("")}
                        <button class="msgReactBtn${isStarred ? " isStarred" : ""}" data-msgid="${m.id}" data-star="1" title="Star">⭐</button>
                    </div>
                    <div class="msgBubble" data-msgid="${m.id}">
                        ${m.image_url ? `<img src="${esc(m.image_url)}" style="max-width:220px;max-height:200px;border-radius:10px;display:block;${msgText ? 'margin-bottom:6px;' : ''}">` : ""}
                        ${msgText ? `<span style="white-space:pre-wrap;">${linkify(msgText)}</span>` : ""}
                    </div>
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

        const heroHtml = t.listing_cover
            ? `<img class="msgInfoHero" src="${esc(t.listing_cover)}" alt="">`
            : `<div class="msgInfoHeroPlaceholder"><i data-lucide="home" style="width:28px;height:28px;stroke-width:1.4;color:rgba(18,52,88,0.35)"></i></div>`;

        const avatarHtml = t.other_avatar
            ? `<img src="${esc(t.other_avatar)}" alt="">`
            : esc(ini);

        el.innerHTML = `
            ${heroHtml}
            <div class="msgInfoBody">
                <div class="msgInfoAvatar">${avatarHtml}</div>
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
                        <div class="msgPropertyImg" style="display:flex;align-items:center;justify-content:center;">
                            ${t.listing_cover
                ? `<img src="${esc(t.listing_cover)}" style="width:100%;height:100%;object-fit:cover;">`
                : `<i data-lucide="home" style="width:22px;height:22px;stroke-width:1.4;color:rgba(18,52,88,0.35)"></i>`}
                        </div>
                        <div class="msgPropertyBody">
                            <div class="msgPropertyName">${esc(t.listing_title || "")}</div>
                            <div class="msgPropertyMeta">${esc(t.listing_meta || "")}</div>
                            <span class="msgPropertyStatus">${esc(t.listing_status || "")}</span>
                        </div>
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
                        ${starred.map(m => `<div class="msgStarredItem">${esc(m.text || "")}<div class="msgStarredTime">${esc(fmtTime(m.created_at))}</div></div>`).join("")}
                    </div>
                </div>` : ""}
            </div>`;

        document.getElementById("msgNotes")?.addEventListener("input", e => { state.localNotes[key] = e.target.value; });
        if (window.lucide) lucide.createIcons();
    }

    // ── Bind send at top level ────────────────────────────
    const _sendBtn = document.getElementById("msgSendBtn");
    const _sendInput = document.getElementById("msgInput");
    const _photoBtn = document.getElementById("msgPhotoBtn");
    const _photoInput = document.getElementById("msgPhotoInput");

    async function doSend() {
        const text = _sendInput?.value?.trim();
        if (!text) return;
        if (_sendInput) { _sendInput.value = ""; _sendInput.style.height = "auto"; }
        if (_sendBtn) _sendBtn.disabled = true;
        dismissQuickReplies();
        await sendMessage(text);
        if (_sendBtn) _sendBtn.disabled = false;
    }

    _photoBtn?.addEventListener("click", () => _photoInput?.click());
    _photoInput?.addEventListener("change", async () => {
        const file = _photoInput.files?.[0];
        if (!file) return;
        _photoInput.value = "";
        if (_sendBtn) _sendBtn.disabled = true;
        const url = await uploadPhoto(file);
        if (url) await sendMessage("", url);
        if (_sendBtn) _sendBtn.disabled = false;
    });

    _sendInput?.addEventListener("input", () => {
        const hasText = _sendInput.value.trim().length > 0;
        if (_sendBtn) _sendBtn.disabled = !hasText;
        _sendInput.style.height = "auto";
        _sendInput.style.height = Math.min(_sendInput.scrollHeight, 120) + "px";
        if (hasText) { dismissQuickReplies(); startTyping(); }
    });

    _sendInput?.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!_sendBtn?.disabled) doSend(); }
    });

    _sendBtn?.addEventListener("click", doSend);

    // ── Jump button ───────────────────────────────────────
    document.getElementById("msgJumpBtn")?.addEventListener("click", () => {
        const list = document.getElementById("msgBubbleList");
        if (list) list.scrollTop = list.scrollHeight;
        document.getElementById("msgJumpBtn").classList.add("isHidden");
    });

    // ── Search ────────────────────────────────────────────
    document.getElementById("msgSearchInput")?.addEventListener("input", e => {
        state.searchQuery = e.target.value;
        renderThreadList();
    });

    // ── Delete modal ──────────────────────────────────────
    let _dashDeleteTarget = null;

    function openDashDeleteModal(lid, oid) {
        _dashDeleteTarget = { lid, oid };
        const overlay = document.getElementById("msgDeleteOverlay");
        if (overlay) overlay.hidden = false;
        if (window.lucide?.createIcons) lucide.createIcons();
    }

    function closeDashDeleteModal() {
        _dashDeleteTarget = null;
        const overlay = document.getElementById("msgDeleteOverlay");
        if (overlay) overlay.hidden = true;
    }

    document.getElementById("msgDeleteCancel")?.addEventListener("click", closeDashDeleteModal);
    document.getElementById("msgDeleteOverlay")?.addEventListener("click", e => {
        if (e.target === document.getElementById("msgDeleteOverlay")) closeDashDeleteModal();
    });
    document.getElementById("msgDeleteConfirm")?.addEventListener("click", async () => {
        if (!_dashDeleteTarget) return;
        const { lid, oid } = _dashDeleteTarget;
        const btn = document.getElementById("msgDeleteConfirm");
        btn.textContent = "Deleting…"; btn.disabled = true;
        try {
            await apiFetch(`/messages/conversations/${lid}/${oid}`, { method: "DELETE" });
            if (state.activeThread?.listing_id === lid && state.activeThread?.other_user_id === oid) {
                state.activeThread = null;
                clearInterval(pollTimer);
                stopTypingPoll();
                document.getElementById("msgChatWrap").hidden = true;
                document.getElementById("msgMainEmpty").hidden = false;
                document.getElementById("msgInfoPanel").hidden = true;
            }
            closeDashDeleteModal();
            await loadConversations();
            renderThreadList();
        } catch (err) { console.error("Delete failed", err); }
        finally { btn.textContent = "Delete"; btn.disabled = false; }
    });

    // ── Tab toggle ────────────────────────────────────────
    document.getElementById("msgInboxTab")?.addEventListener("click", async () => {
        state.showArchived = false;
        document.getElementById("msgInboxTab")?.classList.add("active");
        document.getElementById("msgArchiveTab")?.classList.remove("active");
        await loadConversations();
        renderThreadList();
    });
    document.getElementById("msgArchiveTab")?.addEventListener("click", async () => {
        state.showArchived = true;
        document.getElementById("msgArchiveTab")?.classList.add("active");
        document.getElementById("msgInboxTab")?.classList.remove("active");
        await loadConversations();
        renderThreadList();
    });

    // ── Init ──────────────────────────────────────────────
    async function initMessages() {
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