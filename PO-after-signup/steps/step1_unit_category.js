/* step1_unit_category.js
   Step 1 (Unit Category) — separate-page flow with morph transition.
   Requires transition.js loaded BEFORE this file.
*/

(() => {
    "use strict";

    // Icons
    if (window.lucide?.createIcons) lucide.createIcons();

    /* =========================
       Config / Constants
    ========================== */
    const LS_DRAFT_KEY = "vista_listing_draft";

    const ROUTES = {
        step2: "step2_space_type.html",
        dashboard: "#", // replace later
    };

    const PLACE_TYPES = [
        { key: "CONDO", label: "Condominium", icon: "building-2" },
        { key: "APARTMENT", label: "Apartment", icon: "building" },
        { key: "DORM", label: "Dormitory", icon: "bed-double" },
        { key: "BEDSPACE", label: "Bedspace", icon: "bed" },
        { key: "STUDIO", label: "Studio unit", icon: "layout-grid" },
        { key: "HOUSE", label: "House", icon: "home" },
        { key: "TOWNHOUSE", label: "Townhouse", icon: "rows-3" },
        { key: "ROOM", label: "Private room", icon: "door-closed" },
        { key: "GUESTHOUSE", label: "Guesthouse", icon: "hotel" },
    ];

    const GUIDANCE = {
        CONDO: {
            title: "Condominium",
            tips: [
                "Add building name/tower if applicable.",
                "Mention visitor/ID policy and quiet hours.",
                "Best photos: living area + bedroom + bathroom.",
            ],
        },
        APARTMENT: {
            title: "Apartment",
            tips: [
                "Clarify if walk-up or with elevator.",
                "Mention utilities included/excluded.",
                "Add a nearby landmark (LRT / school).",
            ],
        },
        DORM: {
            title: "Dormitory",
            tips: [
                "State curfew/visitor rules clearly.",
                "Specify bed type + storage/locker.",
                "Highlight shared areas (kitchen/bath).",
            ],
        },
        BEDSPACE: {
            title: "Bedspace",
            tips: [
                "Specify # beds per room + privacy level.",
                "Include inclusions (wifi/water/electricity).",
                "Add schedule rules (lights-out/visitors).",
            ],
        },
        STUDIO: {
            title: "Studio unit",
            tips: [
                "Show layout: bed + kitchenette + bath.",
                "Mention furnished/semi-furnished status.",
                "Best photos: wide shot + bathroom.",
            ],
        },
        HOUSE: {
            title: "House",
            tips: [
                "Specify rooms/floors included in booking.",
                "Clarify parking availability.",
                "Mention neighborhood landmark/safety.",
            ],
        },
        TOWNHOUSE: {
            title: "Townhouse",
            tips: [
                "Mention number of floors + stairs.",
                "Include gate/guard/parking details.",
                "Clarify noise rules (shared walls).",
            ],
        },
        ROOM: {
            title: "Private room",
            tips: [
                "Clarify bathroom: private or shared.",
                "Mention access: kitchen/laundry/living.",
                "House rules are important—keep clear.",
            ],
        },
        GUESTHOUSE: {
            title: "Guesthouse",
            tips: [
                "Mention caretaker/front desk availability.",
                "Highlight check-in/out rules.",
                "Best photos: room + entrance + bathroom.",
            ],
        },
    };

    const PROGRESS_SCHEMA = [
        { step: 1, label: "Place type", weight: 15, isDone: (d) => !!d.placeType },
        { step: 2, label: "Guest space", weight: 15, isDone: (d) => !!d.spaceType },
        { step: 3, label: "Location", weight: 20, isDone: (d) => !!d.location?.lat && !!d.location?.lng },
        { step: 4, label: "Photos & amenities", weight: 25, isDone: (d) => (d.photos?.length >= 5) && (d.amenities?.length >= 1) },
        { step: 5, label: "Pricing & rules", weight: 20, isDone: (d) => !!d.pricing?.nightly && !!d.rules },
        { step: 6, label: "Review & publish", weight: 5, isDone: () => false },
    ];

    /* =========================
       DOM refs
    ========================== */
    const $ = (sel) => document.querySelector(sel);

    const els = {
        typeGrid: $("#typeGrid"),
        nextBtn: $("#nextBtn"),
        backBtn: $("#backBtn"),
        progressBar: $("#progressBar"),
        selectedPill: $("#selectedPill"),
        guideTips: $("#guideTips"),
        sideChecklist: $("#sideChecklist"),
        percentLabel: $("#percentLabel"),
        saveExitBtn: $("#saveExitBtn"),
        questionsBtn: $("#questionsBtn"),
    };

    /* =========================
       Draft store
    ========================== */
    function readDraft() {
        try {
            return JSON.parse(localStorage.getItem(LS_DRAFT_KEY)) || {};
        } catch {
            return {};
        }
    }

    function saveDraft(patch) {
        const draft = readDraft();
        const next = {
            id: draft.id || ("draft-" + Date.now()),
            status: "DRAFT",
            placeType: draft.placeType ?? null,
            spaceType: draft.spaceType ?? null,
            location: draft.location ?? { lat: null, lng: null, city: null, barangay: null, street: null, zip: null },
            amenities: draft.amenities ?? [],
            photos: draft.photos ?? [],
            pricing: draft.pricing ?? { nightly: null, downpayment: null },
            rules: draft.rules ?? null,
            ...draft,
            ...patch,
            updatedAt: new Date().toISOString(),
        };

        localStorage.setItem(LS_DRAFT_KEY, JSON.stringify(next));
        return next;
    }

    /* =========================
       Progress engine
    ========================== */
    function computeProgress(draft, opts = { verified: false }) {
        const verified = !!opts.verified;

        const steps = PROGRESS_SCHEMA.map((s) => {
            const done = s.step === 6 ? false : !!s.isDone(draft);
            return { ...s, done, locked: false };
        });

        const ready = steps.slice(0, 5).every((s) => s.done);
        const publishAllowed = verified && ready;

        const step6 = steps.find((s) => s.step === 6);
        step6.locked = !verified;
        step6.done = publishAllowed;

        let percent = 0;
        for (const s of steps) {
            if (s.step === 6) {
                if (publishAllowed) percent += s.weight;
            } else if (s.done) {
                percent += s.weight;
            }
        }

        const nextStep = steps.find((s) => !s.done && !s.locked)?.step ?? 6;
        return { percent, steps, nextStep, publishAllowed };
    }

    /* =========================
       UI render
    ========================== */
    function renderPlaceCards() {
        const draft = readDraft();
        const selected = draft.placeType;

        if (!els.typeGrid) return;

        els.typeGrid.innerHTML = PLACE_TYPES.map((t) => {
            const isSel = selected === t.key ? "selected" : "";
            return `
        <button class="card ${isSel}" type="button" data-key="${t.key}" aria-pressed="${isSel ? "true" : "false"}">
          <i class="icon" data-lucide="${t.icon}"></i>
          <div class="label">${t.label}</div>
        </button>
      `;
        }).join("");

        // refresh icons for newly injected nodes
        if (window.lucide?.createIcons) lucide.createIcons();

        // attach events
        els.typeGrid.querySelectorAll(".card").forEach((btn) => {
            btn.addEventListener("click", () => {
                const key = btn.dataset.key;

                saveDraft({ placeType: key });

                // update selection states
                els.typeGrid.querySelectorAll(".card").forEach((b) => {
                    b.classList.remove("selected");
                    b.setAttribute("aria-pressed", "false");
                });
                btn.classList.add("selected");
                btn.setAttribute("aria-pressed", "true");

                // enable next
                if (els.nextBtn) els.nextBtn.disabled = false;

                // update side panel
                refreshSidePanel();

                // small polish: micro “nudge” for Next
                pulseNext();
            });
        });

        if (els.nextBtn) els.nextBtn.disabled = !selected;
    }

    function renderQuickTips(draft) {
        if (!els.selectedPill || !els.guideTips) return;

        if (draft.placeType && GUIDANCE[draft.placeType]) {
            const g = GUIDANCE[draft.placeType];
            els.selectedPill.textContent = `Selected: ${g.title}`;
            els.guideTips.innerHTML = g.tips.map((t) => `<li>${t}</li>`).join("");
            return;
        }

        els.selectedPill.textContent = "Selected: —";
        els.guideTips.innerHTML = `
      <li>Choose the closest match for faster approval.</li>
      <li>Keep details consistent with your photos.</li>
      <li>You can edit this later anytime.</li>
    `;
    }

    function renderReadiness(draft) {
        const verified = false; // later: real verification

        const progress = computeProgress(draft, { verified });

        if (els.percentLabel) els.percentLabel.textContent = `${progress.percent}%`;
        if (els.progressBar) els.progressBar.style.width = `${progress.percent}%`;

        if (!els.sideChecklist) return;

        els.sideChecklist.innerHTML = progress.steps.map((s) => {
            const state = s.done ? "done" : s.locked ? "locked" : (s.step === progress.nextStep ? "active" : "");
            const right = s.done ? "Done" : s.locked ? "Locked" : (s.step === progress.nextStep ? "Next" : "Pending");

            return `
        <div class="cl-item ${state}">
          <div class="cl-left">
            <span class="cl-dot"></span>
            <div class="cl-text">
              <div class="cl-t">Step ${s.step}</div>
              <div class="cl-s">${s.label}</div>
            </div>
          </div>
          <div class="cl-state">${right}</div>
        </div>
      `;
        }).join("");
    }

    function refreshSidePanel() {
        const draft = readDraft();
        renderQuickTips(draft);
        renderReadiness(draft);
    }

    /* =========================
       UX polish helpers
    ========================== */
    function pulseNext() {
        if (!els.nextBtn) return;
        els.nextBtn.classList.remove("pulse");
        // force reflow
        void els.nextBtn.offsetWidth;
        els.nextBtn.classList.add("pulse");
        window.setTimeout(() => els.nextBtn && els.nextBtn.classList.remove("pulse"), 420);
    }

    /* =========================
       Navigation / Events
    ========================== */
    function bindEvents() {
        if (els.backBtn) {
            // Step 1 back typically goes to previous page (e.g. roles/dashboard)
            els.backBtn.addEventListener("click", () => {
                // You can route this later:
                // Transition.go("welcome.html");
                history.back();
            });
        }

        if (els.nextBtn) {
            els.nextBtn.addEventListener("click", () => {
                const draft = readDraft();
                if (!draft.placeType) return; // safety

                // Morph to Step 2 page
                if (window.Transition?.go) Transition.go(ROUTES.step2);
                else window.location.href = ROUTES.step2;
            });
        }

        if (els.saveExitBtn) {
            els.saveExitBtn.addEventListener("click", () => {
                // later: redirect dashboard
                alert("Saved as draft. (Redirect later to dashboard)");
            });
        }

        if (els.questionsBtn) {
            els.questionsBtn.addEventListener("click", () => {
                alert("FAQ coming soon.");
            });
        }
    }

    /* =========================
       Init
    ========================== */
    function init() {
        // Make sure overlay enter animation runs (if coming from prev step)
        // transition.js already calls Transition.playEnter() on DOMContentLoaded.
        // This file just assumes it's present.

        renderPlaceCards();
        refreshSidePanel();
        bindEvents();
    }

    // Start
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
