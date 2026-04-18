// core/router.js
(() => {
    const { $, on } = window.Dom;

    const stepHost = $("#stepHost");
    const backBtn = $("#backBtn");
    const nextBtn = $("#nextBtn");
    const dots = $("#dots");

    const DASHBOARD_URL = "/Property-Owner/dashboard/property-owner-dashboard.html";

    // ── UI helpers — fallback if not defined globally elsewhere ──────────────
    function showError(msg) {
        if (typeof window.showError === "function" && window.showError !== showError) {
            return window.showError(msg);
        }
        // Simple toast fallback
        let toast = document.getElementById("_routerToast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "_routerToast";
            toast.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#dc2626;color:#fff;padding:12px 20px;border-radius:10px;font-size:0.9rem;font-weight:600;z-index:9999;max-width:400px;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.2);";
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.style.display = "block";
        clearTimeout(toast._t);
        toast._t = setTimeout(() => { toast.style.display = "none"; }, 4000);
    }

    function showInfo(msg) {
        if (typeof window.showInfo === "function") return window.showInfo(msg);
        alert(msg);
    }

    const ROUTES = [
        { id: "step-1", file: "steps/step1_unit_category.html", init: window.Step1Init, sync: "syncStep1" },
        { id: "step-2", file: "steps/step2_space_type.html", init: window.Step2Init, sync: "syncStep2" },
        { id: "step-3", file: "steps/step3_location.html", init: window.Step3Init, sync: "syncStep3" },
        { id: "step-4", file: "steps/step4_capacity.html", init: window.Step4Init, sync: "syncStep4" },
        { id: "step-5", file: "steps/step5_amenities.html", init: window.Step5Init, sync: "syncStep5" },
        { id: "step-6", file: "steps/step6_highlights.html", init: window.Step6Init, sync: "syncStep6" },
        { id: "step-7", file: "steps/step7_photos.html", init: window.Step7Init, sync: "syncStep7" },
        { id: "step-8", file: "steps/step8_details.html", init: window.Step8Init, sync: "syncStep8" },
        { id: "step-9", file: "steps/step9_pricing.html", init: window.Step9Init, sync: "syncStep9" },
        { id: "step-10", file: "steps/step10_preview.html", init: window.Step10Init, sync: null },
    ];

    function setHash(id) { location.hash = `#/${id}`; }

    function getRouteFromHash() {
        const raw = (location.hash || "");
        const cleaned = raw.replace(/^#\/?/, "");
        const id = cleaned.split("?")[0].trim();
        return id || "step-1";
    }

    function indexOfRoute(id) { return ROUTES.findIndex(r => r.id === id); }

    function renderDots(activeIndex) {
        if (!dots) return;
        const total = ROUTES.length;
        const pct = Math.round(((activeIndex + 1) / total) * 100);
        dots.innerHTML = `
            <div class="wiz-prog-track">
                <div class="wiz-prog-bar" style="width:${pct}%"></div>
            </div>
            <span class="wiz-prog-label">${activeIndex + 1} / ${total}</span>
        `;
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
        if (!res.ok) throw new Error(`Failed to load step HTML: ${file} (${res.status})`);
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

        const htmlPromise = getStepHTML(route.file);

        if (stepHost?.dataset?.hasStep && window.StepTransition?.fadeOut) {
            await window.StepTransition.fadeOut(stepHost);
        }

        const html = await htmlPromise;
        stepHost.innerHTML = html;
        stepHost.dataset.hasStep = "1";
        stepHost.dataset.step = route.id;

        document.body.className = document.body.className
            .replace(/\bwiz-step-\S+/g, "").trim();
        document.body.classList.add(`wiz-step-${route.id}`);

        updateStepKicker(idx);

        if (typeof route.init === "function") {
            route.init({ stepId: route.id, nextBtn, backBtn });
        }


        if (window.lucide?.createIcons) window.lucide.createIcons();

        renderDots(idx);
        setNextLabel(idx);
        if (backBtn) backBtn.disabled = idx <= 0;

        if (window.SidePanel?.refresh) window.SidePanel.refresh();

        if (window.StepTransition?.fadeIn) {
            await window.StepTransition.fadeIn(stepHost);
        }
    }

    window.loadStep = loadStep;

    on(backBtn, "click", () => {
        const current = getRouteFromHash();
        const idx = indexOfRoute(current);
        const prevId = ROUTES[Math.max(0, idx - 1)].id;
        setHash(prevId);
    });

    on(nextBtn, "click", async () => {
        const current = getRouteFromHash();
        const idx = indexOfRoute(current);
        const route = ROUTES[idx] || ROUTES[0];
        const isLast = idx >= ROUTES.length - 1;

        try {
            nextBtn.disabled = true;

            const fnName = route?.sync;
            const fn = fnName ? window.ListingStore?.[fnName] : null;
            if (typeof fn === "function") await fn();

            if (isLast) {
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
            showError(msg);
            nextBtn.disabled = false;
        }
    });

    on($("#saveExitBtn"), "click", () => {
        window.ListingStore?.saveDraft?.({ status: "DRAFT" });
        location.href = `${DASHBOARD_URL}#/listings`;
    });

    on($("#btsDismiss"), "click", () => {
        window.SidePanel?.dismissTips?.();
    });

    window.addEventListener("hashchange", () => loadStep(getRouteFromHash()));

    // ── Boot ──────────────────────────────────────────────────────────────────
    (async () => {

        // ── Helpers ──────────────────────────────────────────────────────────
        function nukeAllLocalDraftState() {
            // Wipe every localStorage key the wizard owns so no stale IDs
            // can bleed into the new session. Order matters: clear index
            // entries first, then active pointer, then the map.
            try {
                const ids = window.ListingStore?.listDraftIds?.() || [];
                for (const id of ids) window.ListingStore?.clearDraft?.(id);
            } catch { /* silent */ }
            localStorage.removeItem("vista_draft_active");
            localStorage.removeItem("vista_draft_index");
            localStorage.removeItem("vista_listing_map");
        }

        // ── Step 1: purge any draft-pending-* placeholders from prior crashes ─
        // These are created by ensureActiveDraft() when no real draft exists yet.
        // They have no listingId and no data — safe to remove unconditionally.
        try {
            const ids = window.ListingStore?.listDraftIds?.() || [];
            for (const id of ids) {
                if (String(id).startsWith("draft-pending-")) {
                    window.ListingStore?.clearDraft?.(id);
                }
            }
        } catch { /* silent */ }

        // ── Step 2: route on ?new=1 vs resume ────────────────────────────────
        try {
            const params = new URLSearchParams(location.search);
            const isNew = params.get("new") === "1";

            if (isNew) {
                // FIX: wipe ALL local state first so no stale draftId can
                // shadow the new listing we are about to create.
                location.hash = "";
                nukeAllLocalDraftState();

                // FIX: create the server-side listing ROW and bind it to
                // localStorage BEFORE rendering step 1. This guarantees that
                // getListingId() will never return null during the session —
                // which was the root cause of the step-2 "jump back" bug and
                // of duplicate/ghost listings being created by syncStep1().
                try {
                    await window.ListingStore.createNewDraft();
                } catch (createErr) {
                    // If the server call fails (rate-limit, network) show a
                    // friendly message and stay on the current page rather than
                    // rendering a broken wizard.
                    const msg =
                        createErr?.payload?.error ||
                        createErr?.error ||
                        createErr?.message ||
                        "Could not start a new listing. Please try again.";
                    showError(msg);
                    // Redirect back to dashboard so the owner isn't stuck
                    location.href = DASHBOARD_URL;
                    return;
                }

                loadStep("step-1");
                return;
            }

            // ── Resume flow ───────────────────────────────────────────────────
            const listing = window.ListingStore?.resumeDraft
                ? await window.ListingStore.resumeDraft({ allowLatestFallback: true })
                : null;

            if (listing?.current_step && listing.current_step > 1) {
                const targetStep = `step-${listing.current_step}`;
                const targetIdx = indexOfRoute(targetStep);
                if (targetIdx !== -1) {
                    setHash(targetStep);
                    loadStep(targetStep);
                    return;
                }
            }

        } catch (e) {
            console.warn("[router] boot failed", e);
        }

        const id = getRouteFromHash();
        if (indexOfRoute(id) === -1) setHash("step-1");
        else loadStep(id);
    })();
})();