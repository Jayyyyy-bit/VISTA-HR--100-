/* VISTA-HR | Messages
   ------------------------------------------------------------ */
(() => {
    const QUICK_REPLIES = [
        "Thanks for your interest!",
        "I'll get back to you soon.",
        "Would you like to schedule a viewing?",
        "The unit is still available.",
        "Please send your requirements.",
    ];

    const THREADS = [
        {
            id: 1, name: "Angela Cruz", initials: "AC", unread: true,
            time: "10:42 AM", preview: "Hi! Is the unit still available?",
            tag: "new", tagLabel: "New inquiry",
            property: "Condo Unit 1", propertyMeta: "Makati City · ₱18,500/mo",
            propertyStatus: "Ready to publish",
            phone: "+63 912 345 6789", email: "angela.cruz@email.com",
            moveIn: "2026-04-01", moveInLabel: "Apr 1, 2026",
            rating: 4.5, ratingCount: 12,
            notes: "",
            messages: [
                { id: "m1", from: "them", text: "Hi! Is the unit still available?", time: "10:30 AM", read: true, reactions: {}, starred: false },
                { id: "m2", from: "me", text: "Hi Angela! Yes, it's available. Would you like to schedule a viewing?", time: "10:35 AM", read: true, reactions: {}, starred: false },
                { id: "m3", from: "them", text: "That would be great! How about this Saturday?", time: "10:38 AM", read: true, reactions: {}, starred: false },
                { id: "m4", from: "me", text: "Saturday works! Let's say 10AM?", time: "10:40 AM", read: true, reactions: {}, starred: false },
                { id: "m5", from: "them", text: "Hi! Is the unit still available?", time: "10:42 AM", read: false, reactions: {}, starred: false },
            ]
        },
        {
            id: 2, name: "Mark Santos", initials: "MS", unread: true,
            time: "9:15 AM", preview: "When can I move in?",
            tag: "viewing", tagLabel: "Viewing scheduled",
            property: "Studio Apartment A", propertyMeta: "BGC, Taguig · ₱14,000/mo",
            propertyStatus: "Ready to publish",
            phone: "+63 917 234 5678", email: "mark.santos@email.com",
            moveIn: "2026-03-18", moveInLabel: "Mar 18, 2026",
            rating: 3.8, ratingCount: 5,
            notes: "Prefers ground floor. Has a small dog.",
            messages: [
                { id: "m1", from: "them", text: "Hello! I'm interested in the studio.", time: "9:00 AM", read: true, reactions: {}, starred: false },
                { id: "m2", from: "me", text: "Hi Mark! Which unit are you interested in?", time: "9:05 AM", read: true, reactions: {}, starred: false },
                { id: "m3", from: "them", text: "Studio Apartment A. When can I move in?", time: "9:15 AM", read: false, reactions: {}, starred: false },
            ]
        },
        {
            id: 3, name: "Paolo Reyes", initials: "PR", unread: false,
            time: "Yesterday", preview: "Thanks for the info!",
            tag: "negotiating", tagLabel: "Negotiating",
            property: "Room 3B", propertyMeta: "Pasay City · ₱8,500/mo",
            propertyStatus: "Draft",
            phone: "+63 908 765 4321", email: "p.reyes@email.com",
            moveIn: "2026-03-20", moveInLabel: "Mar 20, 2026",
            rating: 5.0, ratingCount: 8,
            notes: "Asking for a discount on the 2nd month.",
            messages: [
                { id: "m1", from: "them", text: "Good morning! I wanted to ask about the parking situation.", time: "Yesterday", read: true, reactions: {}, starred: false },
                { id: "m2", from: "me", text: "Hi Paolo! There's one assigned slot per unit.", time: "Yesterday", read: true, reactions: {}, starred: false },
                { id: "m3", from: "them", text: "Perfect. And utilities are included right?", time: "Yesterday", read: true, reactions: {}, starred: false },
                { id: "m4", from: "me", text: "Water is included. Electricity is metered separately.", time: "Yesterday", read: true, reactions: {}, starred: false },
                { id: "m5", from: "them", text: "Thanks for the info!", time: "Yesterday", read: true, reactions: {}, starred: true },
            ]
        },
        {
            id: 4, name: "Denise Lim", initials: "DL", unread: true,
            time: "Mon", preview: "Can I see it this week?",
            tag: "new", tagLabel: "New inquiry",
            property: "Condo Unit 1", propertyMeta: "Makati City · ₱18,500/mo",
            propertyStatus: "Ready to publish",
            phone: "+63 919 111 2222", email: "denise.lim@email.com",
            moveIn: "2026-03-28", moveInLabel: "Mar 28, 2026",
            rating: 4.2, ratingCount: 3,
            notes: "",
            messages: [
                { id: "m1", from: "them", text: "Hi, I saw your listing online. Can I see it this week?", time: "Mon", read: false, reactions: {}, starred: false },
            ]
        }
    ];

    let activeId = null;
    let searchQuery = "";
    let typingTimer = null;

    function esc(s) {
        return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function starsHtml(rating) {
        let h = "";
        for (let i = 1; i <= 5; i++) {
            h += `<span class="${i <= Math.round(rating) ? 'msgInfoStar' : 'msgInfoStarEmpty'}">★</span>`;
        }
        return h;
    }

    function daysUntil(dateStr) {
        const target = new Date(dateStr + "T00:00:00");
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return Math.max(0, Math.round((target - now) / 86400000));
    }

    // ── Nav badge ──
    function updateNavBadge() {
        const tab = document.querySelector('.dashTab[data-tab="messages"]');
        if (!tab) return;
        let badge = tab.querySelector(".msgNavBadge");
        const hasUnread = THREADS.some(t => t.unread);
        if (hasUnread) {
            if (!badge) { badge = document.createElement("span"); badge.className = "msgNavBadge"; tab.appendChild(badge); }
        } else {
            badge?.remove();
        }
    }

    // ── Thread list ──
    function renderThreadList() {
        const el = document.getElementById("msgThreadList");
        if (!el) return;

        const q = searchQuery.toLowerCase();
        const filtered = THREADS.filter(t =>
            !q || t.name.toLowerCase().includes(q) ||
            t.preview.toLowerCase().includes(q) ||
            t.property.toLowerCase().includes(q)
        );

        if (!filtered.length) {
            el.innerHTML = `<div style="padding:20px 16px;font-size:12px;color:rgba(18,52,88,0.40);text-align:center;">No conversations found</div>`;
            return;
        }

        el.innerHTML = filtered.map(t => `
            <div class="msgThread${t.unread ? ' isUnread' : ''}${t.id === activeId ? ' isActive' : ''}" data-tid="${t.id}">
                <div class="msgThreadAvatar">${esc(t.initials)}</div>
                <div class="msgThreadBody">
                    <div class="msgThreadRow">
                        <span class="msgThreadName">${esc(t.name)}</span>
                        <span class="msgThreadTime">${esc(t.time)}</span>
                    </div>
                    <div class="msgThreadPreview">${esc(t.preview)}</div>
                    <span class="msgThreadTag tag-${esc(t.tag)}">${esc(t.tagLabel)}</span>
                </div>
                ${t.unread ? '<span class="msgUnreadDot"></span>' : ''}
            </div>
        `).join("");

        el.querySelectorAll(".msgThread[data-tid]").forEach(el => {
            el.addEventListener("click", () => openThread(Number(el.dataset.tid)));
        });

        const pill = document.getElementById("msgUnreadPill");
        const count = THREADS.filter(t => t.unread).length;
        if (pill) { pill.textContent = count; pill.style.display = count ? "" : "none"; }

        updateNavBadge();
    }

    // ── Open thread ──
    function openThread(id) {
        const thread = THREADS.find(t => t.id === id);
        if (!thread) return;

        activeId = id;
        thread.unread = false;

        document.getElementById("msgMainEmpty").hidden = true;
        document.getElementById("msgChatWrap").hidden = false;
        document.getElementById("msgInfoPanel").hidden = false;

        renderThreadList();
        renderChatHeader(thread);
        renderBubbles(thread);
        renderQuickReplies();
        renderInfoPanel(thread);
        updateNavBadge();

        if (window.lucide) lucide.createIcons();

        // Simulate typing after 1.5s
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => showTyping(thread), 1500);
    }

    // ── Chat header ──
    function renderChatHeader(thread) {
        const el = document.getElementById("msgChatHeader");
        if (!el) return;
        el.innerHTML = `
            <div class="msgChatHeaderAvatar">${esc(thread.initials)}</div>
            <div class="msgChatHeaderInfo">
                <div class="msgChatHeaderName">${esc(thread.name)}</div>
                <div class="msgChatHeaderSub">${esc(thread.email)}</div>
            </div>
            <div class="msgPropertyChip">
                <i data-lucide="home" style="width:11px;height:11px;stroke-width:2"></i>
                ${esc(thread.property)}
            </div>
        `;
    }

    // ── Bubbles ──
    function renderBubbles(thread) {
        const el = document.getElementById("msgBubbleList");
        if (!el) return;

        const reactionEmojis = ["👍", "❤️", "✓"];

        el.innerHTML = `<div class="msgDateDivider">Today</div>` +
            thread.messages.map((m) => {
                const isOwn = m.from === "me";
                const receipt = isOwn ? `<span class="msgReceipt ${m.read ? 'isRead' : 'isSent'}">${m.read ? '✓✓' : '✓'}</span>` : "";

                const reactionsHtml = Object.entries(m.reactions || {}).length
                    ? `<div class="msgBubbleReactions">${Object.entries(m.reactions).map(([e, c]) =>
                        `<div class="msgReactionChip" data-msgid="${m.id}" data-emoji="${esc(e)}">${esc(e)}<span>${c}</span></div>`
                    ).join("")}</div>` : "";

                return `
                <div class="msgBubbleGroup ${isOwn ? 'isOwn' : 'isOther'}">
                    <div class="msgBubbleWrap">
                        <div class="msgReactBar">
                            ${reactionEmojis.map(e => `<button class="msgReactBtn" data-msgid="${m.id}" data-emoji="${esc(e)}">${e}</button>`).join("")}
                            <button class="msgReactBtn" data-msgid="${m.id}" data-star="1" title="Star message">⭐</button>
                        </div>
                        <div class="msgBubble" data-msgid="${m.id}">${esc(m.text)}</div>
                    </div>
                    ${reactionsHtml}
                    <div class="msgBubbleMeta">${receipt}<span>${esc(m.time)}</span></div>
                </div>`;
            }).join("");

        // Bind reaction buttons
        el.querySelectorAll(".msgReactBtn[data-emoji]").forEach(btn => {
            btn.addEventListener("click", () => {
                if (btn.dataset.star) { toggleStar(thread, btn.dataset.msgid); return; }
                addReaction(thread, btn.dataset.msgid, btn.dataset.emoji);
            });
        });

        // Bind reaction chips (toggle off)
        el.querySelectorAll(".msgReactionChip").forEach(chip => {
            chip.addEventListener("click", () => addReaction(thread, chip.dataset.msgid, chip.dataset.emoji));
        });

        el.scrollTop = el.scrollHeight;
        updateJumpBtn();
    }

    function addReaction(thread, msgId, emoji) {
        const msg = thread.messages.find(m => m.id === msgId);
        if (!msg) return;
        msg.reactions = msg.reactions || {};
        if (msg.reactions[emoji]) {
            msg.reactions[emoji]--;
            if (msg.reactions[emoji] <= 0) delete msg.reactions[emoji];
        } else {
            msg.reactions[emoji] = (msg.reactions[emoji] || 0) + 1;
        }
        renderBubbles(thread);
    }

    function toggleStar(thread, msgId) {
        const msg = thread.messages.find(m => m.id === msgId);
        if (!msg) return;
        msg.starred = !msg.starred;
        renderBubbles(thread);
        renderInfoPanel(thread); // refresh starred section
    }

    // ── Typing indicator ──
    function showTyping(thread) {
        const el = document.getElementById("msgBubbleList");
        if (!el || activeId !== thread.id) return;

        const indicator = document.createElement("div");
        indicator.className = "msgBubbleGroup isOther";
        indicator.id = "msgTyping";
        indicator.innerHTML = `
            <div class="msgBubbleWrap">
                <div class="msgTypingIndicator">
                    <div class="msgTypingDot"></div>
                    <div class="msgTypingDot"></div>
                    <div class="msgTypingDot"></div>
                </div>
            </div>`;
        el.appendChild(indicator);
        el.scrollTop = el.scrollHeight;

        // Remove after 2.5s
        setTimeout(() => { indicator.remove(); }, 2500);
    }

    // ── Jump to unread button ──
    function updateJumpBtn() {
        const btn = document.getElementById("msgJumpBtn");
        if (!btn) return;
        const thread = THREADS.find(t => t.id === activeId);
        const hasUnread = thread?.messages.some(m => !m.read && m.from === "them");
        btn.classList.toggle("isHidden", !hasUnread);
    }

    // ── Quick replies ──
    function renderQuickReplies() {
        const el = document.getElementById("msgQuickReplies");
        if (!el) return;
        el.innerHTML = QUICK_REPLIES.map(r =>
            `<button class="msgQuickReply" type="button">${esc(r)}</button>`
        ).join("");
        el.classList.add("hasReplies");

        el.querySelectorAll(".msgQuickReply").forEach(btn => {
            btn.addEventListener("click", () => {
                const input = document.getElementById("msgInput");
                if (input) {
                    input.value = btn.textContent;
                    input.focus();
                    dismissQuickReplies();
                }
            });
        });
    }

    function dismissQuickReplies() {
        const el = document.getElementById("msgQuickReplies");
        if (!el) return;
        el.style.transition = "opacity 150ms ease, transform 150ms ease";
        el.style.opacity = "0";
        el.style.transform = "translateY(6px)";
        setTimeout(() => {
            el.innerHTML = "";
            el.classList.remove("hasReplies");
            el.style.opacity = "";
            el.style.transform = "";
        }, 150);
    }

    // ── Info panel ──
    function renderInfoPanel(thread) {
        const el = document.getElementById("msgInfoInner");
        if (!el) return;

        const days = daysUntil(thread.moveIn);
        const pct = Math.max(5, Math.min(95, 100 - (days / 90 * 100)));

        const starred = thread.messages.filter(m => m.starred);

        el.innerHTML = `
            <div class="msgInfoAvatar">${esc(thread.initials)}</div>
            <div class="msgInfoName">${esc(thread.name)}</div>
            <div class="msgInfoRole">Prospective tenant</div>
            <div class="msgInfoRating">
                ${starsHtml(thread.rating)}
                <span class="msgInfoRatingText">${thread.rating.toFixed(1)} (${thread.ratingCount} reviews)</span>
            </div>

            <div class="msgInfoSection">
                <div class="msgInfoSectionLabel">Contact</div>
                <div class="msgInfoRow"><span class="msgInfoRowLabel">Phone</span><span class="msgInfoRowValue">${esc(thread.phone)}</span></div>
                <div class="msgInfoRow"><span class="msgInfoRowLabel">Email</span><span class="msgInfoRowValue" style="font-size:11px">${esc(thread.email)}</span></div>
                <div class="msgInfoRow">
                    <span class="msgInfoRowLabel">Move-in</span>
                    <span class="msgInfoRowValue">${esc(thread.moveInLabel)}</span>
                </div>
                <div class="msgMoveInTimeline">
                    <div class="msgMoveInBar"><div class="msgMoveInFill" style="width:${pct}%"></div></div>
                    <div class="msgMoveInLabel"><span>Today</span><span>${days > 0 ? days + ' days away' : 'Today!'}</span></div>
                </div>
            </div>

            <div class="msgInfoSection">
                <div class="msgInfoSectionLabel">Interested in</div>
                <div class="msgPropertyCard">
                    <div class="msgPropertyImg" style="background:linear-gradient(135deg,rgba(212,201,190,0.8),rgba(180,170,155,0.6));display:flex;align-items:center;justify-content:center;">
                        <i data-lucide="home" style="width:26px;height:26px;stroke-width:1.4;color:rgba(18,52,88,0.35)"></i>
                    </div>
                    <div class="msgPropertyBody">
                        <div class="msgPropertyName">${esc(thread.property)}</div>
                        <div class="msgPropertyMeta">${esc(thread.propertyMeta)}</div>
                        <span class="msgPropertyStatus">${esc(thread.propertyStatus)}</span>
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
                <textarea class="msgNotesTextarea" id="msgNotes" placeholder="Add notes about this tenant…">${esc(thread.notes)}</textarea>
            </div>

            ${starred.length ? `
            <div class="msgInfoSection">
                <div class="msgInfoSectionLabel">⭐ Starred messages</div>
                <div class="msgStarredList">
                    ${starred.map(m => `
                        <div class="msgStarredItem">
                            ${esc(m.text)}
                            <div class="msgStarredTime">${esc(m.time)}</div>
                        </div>
                    `).join("")}
                </div>
            </div>` : ""}
        `;

        // Save notes
        document.getElementById("msgNotes")?.addEventListener("input", e => {
            thread.notes = e.target.value;
        });

        // Action buttons (mockup alert for now)
        document.getElementById("msgBtnViewing")?.addEventListener("click", () =>
            alert(`Viewing scheduled with ${thread.name} — connect to backend to implement!`)
        );
        document.getElementById("msgBtnContract")?.addEventListener("click", () =>
            alert(`Contract sent to ${thread.email} — connect to backend to implement!`)
        );
    }

    // ── Send message ──
    function bindSend() {
        const btn = document.getElementById("msgSendBtn");
        const input = document.getElementById("msgInput");

        function sendMessage() {
            if (!activeId || !input) return;
            const text = input.value.trim();
            if (!text) return;

            const thread = THREADS.find(t => t.id === activeId);
            if (!thread) return;

            const msgId = "m" + Date.now();
            thread.messages.push({ id: msgId, from: "me", text, time: "Just now", read: false, reactions: {}, starred: false });
            thread.preview = text;
            thread.time = "Just now";

            input.value = "";
            input.style.height = "";
            renderBubbles(thread);
            renderThreadList();

            // Simulate read receipt after 1.5s
            setTimeout(() => {
                const msg = thread.messages.find(m => m.id === msgId);
                if (msg) { msg.read = true; renderBubbles(thread); }
            }, 1500);
        }

        btn?.addEventListener("click", sendMessage);
        input?.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });
        input?.addEventListener("input", () => {
            input.style.height = "auto";
            input.style.height = Math.min(input.scrollHeight, 120) + "px";
            if (input.value.trim()) dismissQuickReplies();
        });
    }

    // ── Jump button ──
    function bindJumpBtn() {
        const btn = document.getElementById("msgJumpBtn");
        const list = document.getElementById("msgBubbleList");
        btn?.addEventListener("click", () => {
            if (list) { list.scrollTop = list.scrollHeight; }
            btn.classList.add("isHidden");
        });
    }

    // ── Search ──
    function bindSearch() {
        document.getElementById("msgSearchInput")?.addEventListener("input", e => {
            searchQuery = e.target.value;
            renderThreadList();
        });
    }

    // ── Init ──
    function initMessages() {
        renderThreadList();
        renderQuickReplies();
        bindSend();
        bindJumpBtn();
        bindSearch();
        updateNavBadge();
        if (window.lucide) lucide.createIcons();
    }

    document.querySelector('.dashTab[data-tab="messages"]')
        ?.addEventListener("click", () => setTimeout(initMessages, 50));

    document.addEventListener("DOMContentLoaded", () => {
        if (document.getElementById("tab-messages")?.classList.contains("active")) initMessages();
        updateNavBadge();
    });

    window._initMessages = initMessages;
})();