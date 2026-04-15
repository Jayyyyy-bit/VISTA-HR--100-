(function () {
    // ── Content ────────────────────────────────────────────────
    const SECTIONS = {
        terms: {
            title: "Terms & Conditions",
            lastUpdated: "April 2026",
            content: [
                { heading: "1. Acceptance of Terms", body: `By creating an account on VISTA-HR, you confirm that you have read, understood, and agree to be bound by these Terms & Conditions. If you do not agree, you may not use the platform. These terms apply to all users — Property Owners, Residents, and Administrators.` },
                { heading: "2. Platform Description", body: `VISTA-HR is a property management platform operating in the National Capital Region (NCR), Philippines. It connects Property Owners (POs) with Residents seeking accommodation. VISTA-HR facilitates listings, bookings, messaging, and payments but is not itself a party to any rental agreement between POs and Residents.` },
                { heading: "3. User Accounts & Eligibility", body: `You must be at least 18 years old to create an account. You agree to provide accurate, complete, and current information during registration and to update it as needed. You are responsible for maintaining the confidentiality of your login credentials. Each person may hold only one account per role type. Accounts are non-transferable.` },
                { heading: "4. Property Owner Obligations", body: `Property Owners must complete KYC (Know Your Customer) verification before publishing any listing. Listings must accurately represent the property — misleading descriptions, photos, or pricing are prohibited. POs are solely responsible for the legality, safety, and habitability of their listed properties.` },
                { heading: "5. Resident Obligations", body: `Residents agree to use listings only for lawful residential purposes. Residents must not sublease, assign, or transfer any booking without prior written consent from the Property Owner. Residents are responsible for maintaining the property in good condition during their stay.` },
                { heading: "10. Strikes & Suspension", body: `VISTA-HR operates a strike system. Verified violations of these terms result in strikes on your account. Accumulating 5 strikes results in permanent account suspension with no right to appeal.` },
                { heading: "13. Governing Law", body: `These Terms & Conditions are governed by the laws of the Republic of the Philippines. Any disputes shall be subject to the exclusive jurisdiction of the courts of Metro Manila, Philippines.` }
            ]
        },
        privacy: {
            title: "Privacy Policy",
            lastUpdated: "April 2026",
            content: [
                { heading: "1. Information We Collect", body: `We collect information you provide directly: name, email, phone number, government-issued ID (for KYC), student documents (for student verification), profile photo, and listing details.` },
                { heading: "2. How We Use Your Information", body: `Your information is used to operate and improve VISTA-HR, verify your identity (KYC/student verification), process bookings and facilitate communication, and comply with the Data Privacy Act of 2012 (RA 10173).` },
                { heading: "6. Security", body: `We implement industry-standard security measures including password hashing, HTTPS encryption, and access controls. You are responsible for keeping your login credentials confidential.` },
                { heading: "10. Contact", body: `For privacy-related inquiries, contact our Data Protection Officer at privacy@vista-hr.ph.` }
            ]
        }
    };

    function injectModal() {
        if (document.getElementById("tcModal")) return;

        // Overlay - Defaulted to DISPLAY NONE
        const overlay = document.createElement("div");
        overlay.id = "tcOverlay";
        overlay.style.cssText = `
            display:none; position:fixed; inset:0; z-index:9998;
            background:rgba(12,19,34,.55); backdrop-filter:blur(6px);
            -webkit-backdrop-filter:blur(6px); animation:tcFadeIn .18s ease;
        `;

        // Modal - Defaulted to DISPLAY NONE
        const modal = document.createElement("div");
        modal.id = "tcModal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.style.cssText = `
            display:none; position:fixed;
            top:50%; left:50%; transform:translate(-50%,-50%);
            z-index:9999; width:min(680px,94vw); max-height:82vh;
            background:#fff; border-radius:22px;
            box-shadow:0 28px 80px rgba(12,19,34,.22);
            flex-direction:column; overflow:hidden;
        `;

        modal.innerHTML = `
            <div id="tcModalHead" style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;border-bottom:1px solid rgba(12,19,34,.08);flex-shrink:0;">
                <div>
                    <div id="tcModalTitle" style="font-family:'Plus Jakarta Sans',sans-serif;font-size:18px;font-weight:800;color:#0c1322;">Terms & Conditions</div>
                    <div id="tcModalSub" style="font-size:12px;color:rgba(12,19,34,.5);font-weight:500;margin-top:2px;">Last updated: April 2026</div>
                </div>
                <button id="tcModalClose" style="width:36px;height:36px;border-radius:50%;border:1px solid rgba(12,19,34,.10);background:rgba(12,19,34,.04);cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div id="tcTabs" style="display:flex;border-bottom:1px solid rgba(12,19,34,.08);padding:0 24px;background:#fafafa;">
                <button class="tc-tab" data-tab="terms" style="padding:12px 18px;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:700;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;">Terms & Conditions</button>
                <button class="tc-tab" data-tab="privacy" style="padding:12px 18px;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:700;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;">Privacy Policy</button>
            </div>
            <div id="tcModalBody" style="overflow-y:auto;padding:24px;flex:1;min-height:0;"></div>
            <div style="padding:16px 24px;border-top:1px solid rgba(12,19,34,.08);display:flex;align-items:center;justify-content:space-between;background:#fff;">
                <p style="font-size:12px;color:rgba(12,19,34,.45);font-weight:500;">By signing up, you agree to both documents.</p>
                <button id="tcModalAccept" style="padding:10px 22px;background:#C8882A;color:#fff;border:none;border-radius:999px;font-weight:800;cursor:pointer;">I Understand</button>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(modal);

        // Inject Styles
        const style = document.createElement("style");
        style.textContent = `
            @keyframes tcFadeIn { from { opacity:0 } to { opacity:1 } }
            .tc-tab--active { color:#C8882A !important; border-bottom-color:#C8882A !important; }
        `;
        document.head.appendChild(style);
    }

    function renderTab(tabKey) {
        const section = SECTIONS[tabKey];
        const body = document.getElementById("tcModalBody");
        const title = document.getElementById("tcModalTitle");
        const sub = document.getElementById("tcModalSub");

        title.textContent = section.title;
        sub.textContent = `Last updated: ${section.lastUpdated}`;
        body.innerHTML = section.content.map(s => `
            <div style="margin-bottom:20px;">
                <div style="font-size:13px;font-weight:800;color:#0c1322;margin-bottom:6px;">${s.heading}</div>
                <p style="font-size:13px;line-height:1.7;color:rgba(12,19,34,.68);margin:0;">${s.body}</p>
            </div>
        `).join('<hr style="border:none;border-top:1px solid rgba(12,19,34,.06);margin:0 0 20px;">');
        body.scrollTop = 0;
    }

    function openModal(startTab = "terms") {
        document.getElementById("tcOverlay").style.display = "block";
        document.getElementById("tcModal").style.display = "flex";
        document.body.style.overflow = "hidden";

        document.querySelectorAll(".tc-tab").forEach(btn => {
            const isActive = btn.dataset.tab === startTab;
            btn.classList.toggle("tc-tab--active", isActive);
        });
        renderTab(startTab);
    }

    function closeModal() {
        document.getElementById("tcOverlay").style.display = "none";
        document.getElementById("tcModal").style.display = "none";
        document.body.style.overflow = "";
    }

    function init() {
        injectModal();

        // Link binding
        document.querySelectorAll('a').forEach(link => {
            if (link.id === 'termsLink' || link.textContent.toLowerCase().includes('terms')) {
                link.onclick = (e) => { e.preventDefault(); openModal('terms'); };
            }
            if (link.id === 'privacyLink' || link.textContent.toLowerCase().includes('privacy')) {
                link.onclick = (e) => { e.preventDefault(); openModal('privacy'); };
            }
        });

        document.getElementById("tcModalClose").onclick = closeModal;
        document.getElementById("tcOverlay").onclick = closeModal;
        document.getElementById("tcModalAccept").onclick = () => {
            const cb = document.getElementById("agree");
            if (cb) cb.checked = true;
            closeModal();
        };

        document.querySelectorAll(".tc-tab").forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll(".tc-tab").forEach(b => b.classList.remove("tc-tab--active"));
                btn.classList.add("tc-tab--active");
                renderTab(btn.dataset.tab);
            };
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();