(function () {
    // ── Content ────────────────────────────────────────────────
    const SECTIONS = {
        terms: {
            title: "Terms & Conditions",
            lastUpdated: "April 2026",
            content: [
                {
                    heading: "1. Acceptance of Terms",
                    body: `By creating an account on VISTA-HR, you confirm that you have read, understood, and agree to be bound by these Terms & Conditions. If you do not agree, you may not use the platform. These terms apply to all users — Property Owners, Residents, and Administrators. VISTA-HR reserves the right to update these terms at any time. Continued use of the platform after changes constitutes acceptance of the revised terms.`
                },
                {
                    heading: "2. Platform Description",
                    body: `VISTA-HR is a property management platform operating in the National Capital Region (NCR), Philippines. It connects Property Owners (POs) with Residents seeking accommodation. VISTA-HR facilitates listings, bookings, messaging, and payment verification but is not itself a party to any rental agreement between POs and Residents. VISTA-HR does not collect, hold, or transfer rental payments — all financial transactions occur directly between the parties.`
                },
                {
                    heading: "3. User Accounts & Eligibility",
                    body: `You must be at least 18 years old to create an account. You agree to provide accurate, complete, and current information during registration and to keep it updated. You are solely responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account. Each person may hold only one account per role type. Accounts are non-transferable. VISTA-HR reserves the right to suspend or terminate accounts that violate these terms.`
                },
                {
                    heading: "4. KYC & Identity Verification",
                    body: `All Property Owners must complete KYC (Know Your Customer) verification before publishing any listing. Residents must complete KYC before making a booking request. KYC requires submission of a valid government-issued ID (front and back) and a selfie. Student verification is optional and requires a valid school ID and Certificate of Registration (CoR) — approval unlocks applicable student discounts. Submitted documents are reviewed by VISTA-HR administrators. Rejected applications may be resubmitted after addressing the stated reason. VISTA-HR stores KYC documents securely and uses them solely for identity verification purposes.`
                },
                {
                    heading: "5. Property Owner Obligations",
                    body: `Property Owners must complete KYC verification before any listing is visible to Residents. Listings must accurately represent the property — misleading descriptions, photos, pricing, or amenities are strictly prohibited and may result in immediate listing removal and account strikes. POs are solely responsible for the legality, safety, and habitability of their listed properties. POs must respond to booking requests within 3 days; failure to do so results in automatic cancellation. POs must schedule a viewing within 3 days of approving a booking request. POs must not request payment outside of the platform's payment proof flow.`
                },
                {
                    heading: "6. Resident Obligations",
                    body: `Residents agree to use listings only for lawful residential purposes. Residents must not sublease, assign, or transfer any booking without prior written consent from the Property Owner. Residents are responsible for maintaining the property in good condition during their stay and for any damages caused. Residents may hold only one active booking at a time. Payment proof must be submitted through the platform after a viewing is scheduled — off-platform payment arrangements are discouraged and not supported by VISTA-HR.`
                },
                {
                    heading: "7. Bookings & Payments",
                    body: `Booking requests follow this flow: Pending → Approved → Viewing Scheduled → Active → Completed. Residents submit payment proof via the platform after a viewing is confirmed. Property Owners verify the proof before confirming move-in. VISTA-HR does not process, hold, or guarantee any payments. All financial disputes are between the Resident and Property Owner. Auto-cancellation rules apply: Pending bookings cancel after 3 days with no owner response; Approved bookings cancel if no viewing is scheduled within 3 days of approval.`
                },
                {
                    heading: "8. Cancellations",
                    body: `Residents may cancel a booking while it is in PENDING or APPROVED status. Once a booking is ACTIVE (move-in confirmed), residents may initiate a move-out request which sets the booking to CANCELLED with a recorded move-out date. Property Owners may cancel reservations in PENDING or APPROVED status with an optional reason provided to the Resident. VISTA-HR does not mediate refund disputes — any refund arrangements are solely between the Resident and Property Owner.`
                },
                {
                    heading: "9. Messaging & Communication",
                    body: `VISTA-HR provides an in-platform messaging system for communication between Property Owners and Residents. Users agree not to use the messaging system to solicit off-platform transactions, share personal financial information, send spam or harassing content, or conduct any activity that violates these terms. VISTA-HR reserves the right to review messages in the event of a reported dispute or policy violation.`
                },
                {
                    heading: "10. Strikes & Suspension",
                    body: `VISTA-HR operates a strike system for policy violations. Examples of violations that result in strikes include: submitting fraudulent KYC documents, posting a misleading listing, harassing another user via messages, failing to honor an approved booking without valid reason, and requesting or accepting payments outside the platform. Each verified violation adds one strike to the offending account. Accumulating 5 strikes results in permanent account suspension with no right to appeal. Temporary suspensions may be issued at administrator discretion for serious single violations.`
                },
                {
                    heading: "11. Limitation of Liability",
                    body: `VISTA-HR serves solely as a platform intermediary and is not liable for: disputes between Property Owners and Residents, the condition or safety of any listed property, any financial loss arising from off-platform transactions, or interruptions in service due to technical issues beyond our control. VISTA-HR's total liability to any user for any claim arising from use of the platform shall not exceed the amount of any fees paid to VISTA-HR by that user in the three months preceding the claim.`
                },
                {
                    heading: "12. Termination",
                    body: `VISTA-HR reserves the right to suspend or permanently terminate any account that violates these terms, with or without prior notice. Upon termination, your right to access the platform ceases immediately. Data associated with terminated accounts may be retained as required by applicable law or for dispute resolution purposes.`
                },
                {
                    heading: "13. Governing Law",
                    body: `These Terms & Conditions are governed by the laws of the Republic of the Philippines, including the Data Privacy Act of 2012 (RA 10173) and the Electronic Commerce Act of 2000 (RA 8792). Any disputes arising from use of the platform shall be subject to the exclusive jurisdiction of the courts of Metro Manila, Philippines.`
                }
            ]
        },
        privacy: {
            title: "Privacy Policy",
            lastUpdated: "April 2026",
            content: [
                {
                    heading: "1. Information We Collect",
                    body: `We collect information you provide directly during registration and platform use, including: full name, email address, and phone number; government-issued ID documents and selfie (for KYC verification); school ID and Certificate of Registration (for student verification); profile photo; listing details including photos, location, and pricing; booking and payment proof records; and messages sent through the platform.`
                },
                {
                    heading: "2. How We Use Your Information",
                    body: `Your information is used to: operate, maintain, and improve the VISTA-HR platform; verify your identity through KYC and student verification processes; process and manage booking requests; facilitate communication between Property Owners and Residents; send notifications related to your account activity; enforce our Terms & Conditions and platform policies; and comply with the Data Privacy Act of 2012 (RA 10173) and other applicable Philippine laws.`
                },
                {
                    heading: "3. Data Sharing",
                    body: `VISTA-HR does not sell your personal data to third parties. We share data only with: Cloudinary (media storage for photos, KYC documents, and payment proofs); Google (SMTP email delivery via Gmail); and platform administrators for KYC review and dispute resolution. All third-party services are bound by their own privacy policies and are used solely to operate the platform.`
                },
                {
                    heading: "4. Media & Document Storage",
                    body: `All uploaded images — including profile photos, KYC documents, student verification documents, listing photos, and payment proofs — are stored securely on Cloudinary. Upload URLs are signed by the VISTA-HR backend. Direct access to documents is restricted to authorized administrators and the uploading user.`
                },
                {
                    heading: "5. Data Retention",
                    body: `Your personal data is retained for as long as your account is active. Deactivated accounts are soft-deleted — data is retained for a minimum of 90 days for dispute resolution and legal compliance before permanent deletion upon request. KYC and booking records may be retained longer as required by applicable Philippine law.`
                },
                {
                    heading: "6. Your Rights",
                    body: `Under the Data Privacy Act of 2012 (RA 10173), you have the right to: access the personal data we hold about you; request correction of inaccurate data; request deletion of your data subject to legal retention requirements; withdraw consent for data processing where consent is the legal basis; and lodge a complaint with the National Privacy Commission (NPC) if you believe your rights have been violated.`
                },
                {
                    heading: "7. Security",
                    body: `VISTA-HR implements industry-standard security measures including: bcrypt password hashing, HTTPS encryption for all data in transit, HttpOnly JWT cookies for session management, signed Cloudinary upload URLs to prevent unauthorized uploads, and role-based access controls limiting data visibility by user type. You are responsible for keeping your login credentials confidential and for logging out of shared devices.`
                },
                {
                    heading: "8. Cookies & Session Data",
                    body: `VISTA-HR uses HttpOnly cookies to maintain authenticated sessions. These cookies are not accessible to client-side JavaScript and expire based on your session settings. We do not use third-party advertising cookies or tracking pixels.`
                },
                {
                    heading: "9. Changes to This Policy",
                    body: `We may update this Privacy Policy from time to time. We will notify registered users of material changes via email or in-platform notification. Continued use of VISTA-HR after changes are posted constitutes acceptance of the revised policy.`
                },
                {
                    heading: "10. Contact",
                    body: `For privacy-related inquiries, data access requests, or complaints, contact our Data Protection Officer at privacy@vista-hr.ph. For general support, submit a ticket through the platform's Help Center.`
                }
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