// core/router.js
(() => {
    const { $, on } = window.Dom;

    const stepHost = $("#stepHost");
    const backBtn = $("#backBtn");
    const nextBtn = $("#nextBtn");
    const dots = $("#dots");

    const ROUTES = [
        { id: "step-1", file: "steps/step1_unit_category.html", init: window.Step1Init },
        { id: "step-2", file: "steps/step2_space_type.html", init: window.Step2Init },
        { id: "step-3", file: "steps/step3_location.html", init: window.Step3Init },

        // Add later as you create the files:
        // { id: "step-4", file: "steps/step4_capacity_rooms.html", init: window.Step4Init },
        // { id: "step-5", file: "steps/step5_amenities.html", init: window.Step5Init },
        // { id: "step-6", file: "steps/step6_highlights.html", init: window.Step6Init },
        // { id: "step-7", file: "steps/step7_photos_virtualtour.html", init: window.Step7Init },
        // { id: "step-8", file: "steps/step8_title_description_review.html", init: window.Step8Init }
    ];


    function setHash(id) {
        location.hash = `#/${id}`;
    }

    function getRouteFromHash() {
        const h = (location.hash || "").replace("#/", "").trim();
        return h || "step-1";
    }

    function indexOfRoute(id) {
        return ROUTES.findIndex(r => r.id === id);
    }

    function renderDots(activeIndex) {
        if (!dots) return;
        dots.innerHTML = ROUTES.map((_, i) =>
            `<span class="dot ${i <= activeIndex ? "active" : ""}"></span>`
        ).join("");
    }
    const STEP_CACHE = new Map();

    async function getStepHTML(file) {
        if (STEP_CACHE.has(file)) return STEP_CACHE.get(file);
        const res = await fetch(file, { cache: "no-store" });
        const html = await res.text();
        STEP_CACHE.set(file, html);
        return html;
    }

    async function loadStep(id, { pushHash = true } = {}) {
        const route = ROUTES.find(r => r.id === id) || ROUTES[0];
        const idx = indexOfRoute(route.id);

        // Start fetching ASAP (cached)
        const htmlPromise = getStepHTML(route.file);

        // Fade out immediately (no pause)
        if (stepHost.dataset.hasStep) {
            await window.StepTransition.fadeOut(stepHost);
        }

        // Wait for HTML
        const html = await htmlPromise;

        // Inject while hidden
        stepHost.innerHTML = html;
        stepHost.dataset.hasStep = "1";

        // Init step content (renders cards)
        const initFn =
            route.id === "step-1" ? window.Step1Init :
                route.id === "step-2" ? window.Step2Init :
                    route.init;

        if (typeof initFn === "function") {
            initFn({ stepId: route.id, nextBtn, backBtn });
        }

        // Convert lucide icons AFTER cards exist
        if (window.lucide?.createIcons) lucide.createIcons();

        // UI states
        renderDots(idx);
        if (backBtn) backBtn.disabled = idx <= 0;
        window.SidePanel.refresh();

        // Fade in
        await window.StepTransition.fadeIn(stepHost);
    }


    // Expose for steps (optional)
    window.loadStep = (id) => loadStep(id);


    // Footer navigation (FIXED: no direct loadStep)
    on(backBtn, "click", () => {
        const current = getRouteFromHash();
        const idx = indexOfRoute(current);
        const prev = ROUTES[Math.max(0, idx - 1)].id;
        setHash(prev); // ✅ only change hash
    });

    on(nextBtn, "click", () => {
        const current = getRouteFromHash();
        const idx = indexOfRoute(current);
        const next = ROUTES[Math.min(ROUTES.length - 1, idx + 1)].id;
        setHash(next); // ✅ only change hash
    });



    // Header buttons
    on($("#saveExitBtn"), "click", () =>
        alert("Saved as draft. (Redirect later to dashboard)")
    );
    on($("#questionsBtn"), "click", () =>
        alert("FAQ coming soon.")
    );

    // Browser back / forward
    window.addEventListener("hashchange", () => {
        loadStep(getRouteFromHash(), { pushHash: false });
    });


    // Initial load
    loadStep(getRouteFromHash(), { pushHash: false });
})();


