/* VISTA-HR | Messages
   Companion to dashboard-messages.css
   ------------------------------------------------------------ */

// ============================================================
//  MESSAGES MODULE
// ============================================================
(() => {
    const THREADS = [
        {
            id: 1, name: "Angela Cruz", initials: "AC", unread: true,
            time: "10:42 AM", preview: "Hi! Is the unit still available?",
            property: "Condo Unit 1", propertyMeta: "Makati City · ₱18,500/mo",
            propertyStatus: "Ready to publish",
            phone: "+63 912 345 6789", email: "angela.cruz@email.com",
            moveIn: "Apr 1, 2026", rating: 4.5, ratingCount: 12,
            messages: [
                { from: "them", text: "Hi! Is the unit still available?", time: "10:30 AM", read: true },
                { from: "me", text: "Hi Angela! Yes, it's available. Would you like to schedule a viewing?", time: "10:35 AM", read: true },
                { from: "them", text: "That would be great! How about this Saturday?", time: "10:38 AM", read: true },
                { from: "me", text: "Saturday works! Let's say 10AM?", time: "10:40 AM", read: true },
                { from: "them", text: "Hi! Is the unit still available?", time: "10:42 AM", read: false },
            ]
        },
        {
            id: 2, name: "Mark Santos", initials: "MS", unread: true,
            time: "9:15 AM", preview: "When can I move in?",
            property: "Studio Apartment A", propertyMeta: "BGC, Taguig · ₱14,000/mo",
            propertyStatus: "Ready to publish",
            phone: "+63 917 234 5678", email: "mark.santos@email.com",
            moveIn: "Mar 18, 2026", rating: 3.8, ratingCount: 5,
            messages: [
                { from: "them", text: "Hello! I'm interested in the studio.", time: "9:00 AM", read: true },
                { from: "me", text: "Hi Mark! Which unit are you interested in?", time: "9:05 AM", read: true },
                { from: "them", text: "Studio Apartment A. When can I move in?", time: "9:15 AM", read: false },
            ]
        },
        {
            id: 3, name: "Paolo Reyes", initials: "PR", unread: false,
            time: "Yesterday", preview: "Thanks for the info!",
            property: "Room 3B", propertyMeta: "Pasay City · ₱8,500/mo",
            propertyStatus: "Draft",
            phone: "+63 908 765 4321", email: "p.reyes@email.com",
            moveIn: "Mar 20, 2026", rating: 5.0, ratingCount: 8,
            messages: [
                { from: "them", text: "Good morning! I wanted to ask about the parking situation.", time: "Yesterday", read: true },
                { from: "me", text: "Hi Paolo! There's one assigned slot per unit.", time: "Yesterday", read: true },
                { from: "them", text: "Perfect. And utilities are included right?", time: "Yesterday", read: true },
                { from: "me", text: "Water is included. Electricity is metered separately.", time: "Yesterday", read: true },
                { from: "them", text: "Thanks for the info!", time: "Yesterday", read: true },
            ]
        },
        {
            id: 4, name: "Denise Lim", initials: "DL", unread: true,
            time: "Mon", preview: "Can I see it this week?",
            property: "Condo Unit 1", propertyMeta: "Makati City · ₱18,500/mo",
            propertyStatus: "Ready to publish",
            phone: "+63 919 111 2222", email: "denise.lim@email.com",
            moveIn: "Mar 28, 2026", rating: 4.2, ratingCount: 3,
            messages: [
                { from: "them", text: "Hi, I saw your listing online. Can I see it this week?", time: "Mon", read: false },
            ]
        }
    ];

    let activeId = null;
    let searchQuery = "";

    function escHtml(s) {
        return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function starsHtml(rating) {
        let html = "";
        for (let i = 1; i <= 5; i++) {
            const full = i <= Math.floor(rating);
            const half = !full && i === Math.ceil(rating) && rating % 1 >= 0.5;
            html += `<span class="msgInfoStar${full || half ? '' : 'Empty'}">★</span>`;
        }
        return html;
    }

    function renderThreadList() {
        const el = document.getElementById("msgThreadList");
        if (!el) return;

        const q = searchQuery.toLowerCase();
        const filtered = THREADS.filter(t =>
            !q || t.name.toLowerCase().includes(q) || t.preview.toLowerCase().includes(q) || t.property.toLowerCase().includes(q)
        );

        if (!filtered.length) {
            el.innerHTML = `<div style="padding:20px 16px;font-size:12px;color:rgba(18,52,88,0.40);text-align:center;">No conversations found</div>`;
            return;
        }

        el.innerHTML = filtered.map(t => `
            <div class="msgThread${t.unread ? ' isUnread' : ''}${t.id === activeId ? ' isActive' : ''}" data-tid="${t.id}">
                <div class="msgThreadAvatar">${escHtml(t.initials)}</div>
                <div class="msgThreadBody">
                    <div class="msgThreadRow">
                        <span class="msgThreadName">${escHtml(t.name)}</span>
                        <span class="msgThreadTime">${escHtml(t.time)}</span>
                    </div>
                    <div class="msgThreadPreview">${escHtml(t.preview)}</div>
                </div>
                ${t.unread ? '<span class="msgUnreadDot"></span>' : ''}
            </div>
        `).join("");

        el.querySelectorAll(".msgThread[data-tid]").forEach(el => {
            el.addEventListener("click", () => openThread(Number(el.dataset.tid)));
        });

        // update unread pill
        const pill = document.getElementById("msgUnreadPill");
        const unreadCount = THREADS.filter(t => t.unread).length;
        if (pill) {
            pill.textContent = unreadCount;
            pill.style.display = unreadCount ? "" : "none";
        }
    }

    function openThread(id) {
        const thread = THREADS.find(t => t.id === id);
        if (!thread) return;

        activeId = id;
        thread.unread = false;

        // show/hide panels
        document.getElementById("msgMainEmpty").hidden = true;
        document.getElementById("msgChatWrap").hidden = false;
        document.getElementById("msgInfoPanel").hidden = false;

        renderThreadList();
        renderChatHeader(thread);
        renderBubbles(thread);
        renderInfoPanel(thread);

        // re-init lucide icons
        if (window.lucide) lucide.createIcons();
    }

    function renderChatHeader(thread) {
        const el = document.getElementById("msgChatHeader");
        if (!el) return;
        el.innerHTML = `
            <div class="msgChatHeaderAvatar">${escHtml(thread.initials)}</div>
            <div class="msgChatHeaderInfo">
                <div class="msgChatHeaderName">${escHtml(thread.name)}</div>
                <div class="msgChatHeaderSub">${escHtml(thread.email)}</div>
            </div>
            <div class="msgPropertyChip">
                <i data-lucide="home" style="width:11px;height:11px;stroke-width:2"></i>
                ${escHtml(thread.property)}
            </div>
        `;
    }

    function renderBubbles(thread) {
        const el = document.getElementById("msgBubbleList");
        if (!el) return;

        el.innerHTML = `<div class="msgDateDivider">Today</div>` +
            thread.messages.map((m, i) => {
                const isOwn = m.from === "me";
                const isLast = i === thread.messages.length - 1;
                const receipt = isOwn ? `<span class="msgReceipt ${m.read ? 'isRead' : 'isSent'}">${m.read ? '✓✓' : '✓'}</span>` : "";
                return `
                <div class="msgBubbleGroup ${isOwn ? 'isOwn' : 'isOther'}">
                    <div class="msgBubble">${escHtml(m.text)}</div>
                    <div class="msgBubbleMeta">${receipt}<span>${escHtml(m.time)}</span></div>
                </div>`;
            }).join("");

        // scroll to bottom
        el.scrollTop = el.scrollHeight;
    }

    function renderInfoPanel(thread) {
        const el = document.getElementById("msgInfoInner");
        if (!el) return;

        el.innerHTML = `
            <div class="msgInfoAvatar">${escHtml(thread.initials)}</div>
            <div class="msgInfoName">${escHtml(thread.name)}</div>
            <div class="msgInfoRole">Prospective tenant</div>
            <div class="msgInfoRating">
                ${starsHtml(thread.rating)}
                <span class="msgInfoRatingText">${thread.rating.toFixed(1)} (${thread.ratingCount} reviews)</span>
            </div>

            <div class="msgInfoSection">
                <div class="msgInfoSectionLabel">Contact</div>
                <div class="msgInfoRow"><span class="msgInfoRowLabel">Phone</span><span class="msgInfoRowValue">${escHtml(thread.phone)}</span></div>
                <div class="msgInfoRow"><span class="msgInfoRowLabel">Email</span><span class="msgInfoRowValue" style="font-size:11px">${escHtml(thread.email)}</span></div>
                <div class="msgInfoRow"><span class="msgInfoRowLabel">Move-in</span><span class="msgInfoRowValue">${escHtml(thread.moveIn)}</span></div>
            </div>

            <div class="msgInfoSection">
                <div class="msgInfoSectionLabel">Interested in</div>
                <div class="msgPropertyCard">
                    <div class="msgPropertyImg" style="background:linear-gradient(135deg,rgba(212,201,190,0.8),rgba(180,170,155,0.6));display:flex;align-items:center;justify-content:center;">
                        <i data-lucide="home" style="width:28px;height:28px;stroke-width:1.4;color:rgba(18,52,88,0.35)"></i>
                    </div>
                    <div class="msgPropertyBody">
                        <div class="msgPropertyName">${escHtml(thread.property)}</div>
                        <div class="msgPropertyMeta">${escHtml(thread.propertyMeta)}</div>
                        <span class="msgPropertyStatus">${escHtml(thread.propertyStatus)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function bindSend() {
        const btn = document.getElementById("msgSendBtn");
        const input = document.getElementById("msgInput");

        function sendMessage() {
            if (!activeId || !input) return;
            const text = input.value.trim();
            if (!text) return;

            const thread = THREADS.find(t => t.id === activeId);
            if (!thread) return;

            thread.messages.push({ from: "me", text, time: "Just now", read: false });
            thread.preview = text;
            thread.time = "Just now";

            input.value = "";
            input.style.height = "";
            renderBubbles(thread);
            renderThreadList();
        }

        btn?.addEventListener("click", sendMessage);
        input?.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });

        // auto-resize textarea
        input?.addEventListener("input", () => {
            input.style.height = "auto";
            input.style.height = Math.min(input.scrollHeight, 120) + "px";
        });
    }

    function bindSearch() {
        document.getElementById("msgSearchInput")?.addEventListener("input", e => {
            searchQuery = e.target.value;
            renderThreadList();
        });
    }

    function initMessages() {
        renderThreadList();
        bindSend();
        bindSearch();
        if (window.lucide) lucide.createIcons();
    }

    // Init when tab becomes active
    const calTab = document.querySelector('.dashTab[data-tab="messages"]');
    calTab?.addEventListener("click", () => {
        setTimeout(initMessages, 50);
    });

    // Also init on DOMContentLoaded in case messages tab is default
    document.addEventListener("DOMContentLoaded", () => {
        if (document.getElementById("tab-messages")?.classList.contains("active")) {
            initMessages();
        }
    });

    window._initMessages = initMessages;
})();