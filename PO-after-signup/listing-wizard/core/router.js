// core/router.js
(() => {
    const { $, on } = window.Dom;

    const stepHost = $("#stepHost");
    const backBtn = $("#backBtn");
    const nextBtn = $("#nextBtn");
    const dots = $("#dots");

    const DASHBOARD_URL = "/Property-Owner/dashboard/property-owner-dashboard.html";

    // ✅ Correct route table (ALL entries must have id + file)
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
        // supports "#/step-1" or "#/step-1?x=y"
        const raw = (location.hash || "");
        const cleaned = raw.replace(/^#\/?/, "");
        const id = cleaned.split("?")[0].trim();
        return id || "step-1";
    }

    function indexOfRoute(id) {
        return ROUTES.findIndex(r => r.id === id);
    }

    function renderDots(activeIndex) {
        if (!dots) return;
        dots.innerHTML = ROUTES
            .map((_, i) => `<span class="dot ${i <= activeIndex ? "active" : ""}"></span>`)
            .join("");
    }

    function setNextLabel(idx) {
        if (!nextBtn) return;
        nextBtn.textContent = (idx === ROUTES.length - 1) ? "Finish" : "Next";
    }

    function updateStepKicker(idx) {
        const kicker = stepHost?.querySelector(".step-kicker");
        if (kicker) kicker.textContent = `Create listing • Step ${idx + 1} of ${ROUTES.length}`;
    }

    const STEP_CACHE = new Map();
    async function getStepHTML(file) {
        if (STEP_CACHE.has(file)) return STEP_CACHE.get(file);

        const res = await fetch(file, { cache: "no-store" });
        if (!res.ok) {
            throw new Error(`Failed to load step HTML: ${file} (${res.status})`);
        }
        const html = await res.text();
        STEP_CACHE.set(file, html);
        return html;
    }

    async function loadStep(id) {
        const route = ROUTES.find(r => r.id === id) || ROUTES[0];
        const idx = indexOfRoute(route.id);

        if (!route?.file) {
            console.error("[router] route file missing for", id, route);
            setHash("step-1");
            return;
        }

        // prefetch HTML
        const htmlPromise = getStepHTML(route.file);

        // fade out old content
        if (stepHost?.dataset?.hasStep && window.StepTransition?.fadeOut) {
            await window.StepTransition.fadeOut(stepHost);
        }

        // inject new HTML
        const html = await htmlPromise;
        stepHost.innerHTML = html;
        stepHost.dataset.hasStep = "1";

        // header updates
        updateStepKicker(idx);

        // init step JS
        if (typeof route.init === "function") {
            route.init({ stepId: route.id, nextBtn, backBtn });
        }

        // icons
        if (window.lucide?.createIcons) window.lucide.createIcons();

        // buttons / dots
        renderDots(idx);
        setNextLabel(idx);
        if (backBtn) backBtn.disabled = idx <= 0;

        if (window.SidePanel?.refresh) window.SidePanel.refresh();

        // fade in
        if (window.StepTransition?.fadeIn) {
            await window.StepTransition.fadeIn(stepHost);
        }
    }

    window.loadStep = loadStep;

    // Back button
    on(backBtn, "click", () => {
        const current = getRouteFromHash();
        const idx = indexOfRoute(current);
        const prevId = ROUTES[Math.max(0, idx - 1)].id;
        setHash(prevId);
    });

    // Next button: sync then navigate
    on(nextBtn, "click", async () => {
        const current = getRouteFromHash();
        const idx = indexOfRoute(current);
        const route = ROUTES[idx] || ROUTES[0];
        const isLast = idx >= ROUTES.length - 1;

        try {
            nextBtn.disabled = true;

            // ✅ call store sync if exists
            const fnName = route?.sync;
            const fn = fnName ? window.ListingStore?.[fnName] : null;
            if (typeof fn === "function") await fn();

            if (isLast) {
                // optional: submitForVerification
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

    // Hash change
    window.addEventListener("hashchange", () => loadStep(getRouteFromHash()));

    // Boot
    (async () => {
        try {
            const token = localStorage.getItem("access_token");
            if (token && window.ListingStore?.resumeDraft) {
                await window.ListingStore.resumeDraft();
            }
        } catch (e) {
            console.warn("[router] resumeDraft failed", e);
        }

        const id = getRouteFromHash();
        // if invalid hash -> force step-1
        if (indexOfRoute(id) === -1) setHash("step-1");
        else loadStep(id);
    })();
})();
