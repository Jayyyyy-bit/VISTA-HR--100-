// core/router.js
(() => {
    const { $, on } = window.Dom;

    const stepHost = $("#stepHost");
    const backBtn = $("#backBtn");
    const nextBtn = $("#nextBtn");
    const dots = $("#dots");

    const DASHBOARD_URL = "/Property-Owner/dashboard/property-owner-dashboard.html";

    const ROUTES = [
        { id: "step-1", file: "steps/step1_unit_category.html", init: window.Step1Init, sync: "syncStep1" },
        { id: "step-2", file: "steps/step2_space_type.html", init: window.Step2Init, sync: "syncStep2" },
        { id: "step-3", file: "steps/step3_location.html", init: window.Step3Init, sync: "syncStep3" },
        { id: "step-4", file: "steps/step4_capacity.html", init: window.Step4Init, sync: "syncStep4" },
        { id: "step-5", file: "steps/step5_amenities.html", init: window.Step5Init, sync: "syncStep5" },
        { id: "step-6", file: "steps/step6_highlights.html", init: window.Step6Init, sync: "syncStep6" },
        { id: "step-7", file: "steps/step7_photos.html", init: window.Step7Init, sync: "syncStep7" },
        { id: "step-8", file: "steps/step8_details.html", init: window.Step8Init, sync: "syncStep8" },
    ];

    function setHash(id) {
        location.hash = `#/${id}`;
    }

    function getRouteFromHash() {
        const h = (location.hash || "").replace("#/", "").replace("#", "").trim();
        return h || "step-1";
    }

    function indexOfRoute(id) {
        return ROUTES.findIndex((r) => r.id === id);
    }

    function renderDots(activeIndex) {
        if (!dots) return;
        dots.innerHTML = ROUTES.map((_, i) =>
            `<span class="dot ${i <= activeIndex ? "active" : ""}"></span>`
        ).join("");
    }

    function setNextLabel(idx) {
        if (!nextBtn) return;
        const isLast = idx === ROUTES.length - 1;
        nextBtn.textContent = isLast ? "Finish" : "Next";
    }

    function updateStepKicker(idx) {
        const kicker = stepHost?.querySelector(".step-kicker");
        if (kicker) kicker.textContent = `Create listing • Step ${idx + 1} of ${ROUTES.length}`;
    }

    const STEP_CACHE = new Map();
    async function getStepHTML(file) {
        if (STEP_CACHE.has(file)) return STEP_CACHE.get(file);
        const res = await fetch(file, { cache: "no-store" });
        const html = await res.text();
        STEP_CACHE.set(file, html);
        return html;
    }

    async function loadStep(id) {
        const route = ROUTES.find((r) => r.id === id) || ROUTES[0];
        const idx = indexOfRoute(route.id);

        // ✅ Guard: prevent jumping to step 2+ without server listing_id
        if (idx > 0) {
            const draft = window.ListingStore?.readDraft?.() || {};
            if (!draft.listing_id) {
                setHash("step-1");
                return;
            }
        }


        const htmlPromise = getStepHTML(route.file);

        if (stepHost?.dataset?.hasStep) {
            await window.StepTransition.fadeOut(stepHost);
        }

        const html = await htmlPromise;
        stepHost.innerHTML = html;
        stepHost.dataset.hasStep = "1";

        updateStepKicker(idx);

        if (typeof route.init === "function") {
            route.init({ stepId: route.id, nextBtn, backBtn });
        }

        if (window.lucide?.createIcons) window.lucide.createIcons();

        renderDots(idx);
        setNextLabel(idx);
        if (backBtn) backBtn.disabled = idx <= 0;

        if (window.SidePanel?.refresh) window.SidePanel.refresh();

        await window.StepTransition.fadeIn(stepHost);
    }

    window.loadStep = loadStep;

    // Back
    on(backBtn, "click", () => {
        const current = getRouteFromHash();
        const idx = indexOfRoute(current);
        const prevId = ROUTES[Math.max(0, idx - 1)].id;
        setHash(prevId);
    });

    // ✅ Next: sync current step first, then navigate
    on(nextBtn, "click", async () => {
        const current = getRouteFromHash();
        const idx = indexOfRoute(current);
        const route = ROUTES[idx];
        const isLast = idx >= ROUTES.length - 1;

        try {
            nextBtn.disabled = true;

            // sync if defined
            const fnName = route?.sync;
            const fn = fnName ? window.ListingStore?.[fnName] : null;
            if (typeof fn === "function") {
                await fn();
            }

            if (isLast) {
                // optional submit-for-verification later
                // await window.ListingStore?.submitForVerification?.();
                location.href = DASHBOARD_URL;
                return;
            }

            setHash(ROUTES[idx + 1].id);
        } catch (e) {
            console.error("[router] next sync failed", e);

            const msg =
                e?.payload?.error ||
                e?.error ||
                e?.message ||
                "Failed to save this step. Please try again.";

            alert(msg);
            nextBtn.disabled = false;
        }
    });

    // Header buttons
    on($("#saveExitBtn"), "click", () => {
        window.ListingStore?.saveDraft?.({ status: "DRAFT" });
        location.href = `${DASHBOARD_URL}#/listings`;
    });

    on($("#questionsBtn"), "click", () => alert("FAQ coming soon."));

    window.addEventListener("hashchange", () => {
        loadStep(getRouteFromHash());
    });

    // ✅ Initial boot: resume + auto-jump to next incomplete step
    (async () => {
        try {
            // if you later add resumeDraft() to store.js, safe call
            if (window.ListingStore?.resumeDraft) await window.ListingStore.resumeDraft();
        } catch (e) {
            console.warn("[router] resumeDraft failed", e);
        }

        const hasMeaningfulHash =
            !!(location.hash && location.hash.startsWith("#/") && location.hash.length > 2);

        if (!hasMeaningfulHash) {
            const draft = window.ListingStore?.readDraft?.() || {};
            const prog = window.ListingStore?.computeProgress?.(draft);
            const nextStepNum = prog?.nextStep || 1;
            const target = `step-${nextStepNum}`;
            setHash(target);
            loadStep(target);
            return;

        }

        loadStep(getRouteFromHash());
    })();
})();
