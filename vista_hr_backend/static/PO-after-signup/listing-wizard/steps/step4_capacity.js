// steps/step4.js — Capacity with smart suggestions + logical validations
window.Step4Init = function Step4Init({ nextBtn }) {
    const { ListingStore, SidePanel } = window;

    const draft = ListingStore.readDraft();
    const cap = draft.capacity || { guests: 1, bedrooms: 0, beds: 1, bathrooms: 1 };

    // ── Remove any leftover monthly_rent from old Step 4 ──
    // Price is now handled in a separate Pricing step.
    // We keep it in the object for backward compat but don't show UI for it.
    // (If you want to fully strip it: delete cap.monthly_rent;)

    const guestInput = document.getElementById("capGuests");
    const guestVal = document.getElementById("capGuestsVal");
    const guestLabel = document.getElementById("capGuestsLabel");

    // Suggestion banner elements
    const banner = document.getElementById("capSuggestionBanner");
    const bannerText = document.getElementById("capSuggestionText");
    const bannerApply = document.getElementById("capSuggestionApply");
    const bannerClose = document.getElementById("capSuggestionClose");

    if (!guestInput || !guestVal) return;

    // Track whether user dismissed the suggestion (don't re-show until slider moves)
    let suggestionDismissed = false;
    // Store the current suggestion so "Apply" knows what to set
    let pendingSuggestion = null;

    // ══════════════════════════════════════════════════════════
    // SMART SUGGESTION ENGINE
    // ══════════════════════════════════════════════════════════
    // These ratios are based on common PH boarding house / apartment patterns:
    //   - 1 bed per guest (minimum)
    //   - ~1 bedroom per 2 guests (rounded up)
    //   - ~1 bathroom per 3 guests (rounded up, min 1)
    //
    // The suggestion is just a recommendation — the PO can ignore it.
    // ══════════════════════════════════════════════════════════
    function computeSuggestion(guests) {
        return {
            beds: Math.max(1, guests),                    // 1 bed per guest
            bedrooms: Math.max(1, Math.ceil(guests / 2)),     // 1 bedroom per 2 guests
            bathrooms: Math.max(1, Math.ceil(guests / 3)),     // 1 bathroom per 3 guests
        };
    }

    function showSuggestion(guests) {
        if (suggestionDismissed || !banner) return;

        const s = computeSuggestion(guests);
        pendingSuggestion = s;

        // Only show if current values differ from suggestion
        const isDifferent = (
            cap.beds !== s.beds ||
            cap.bedrooms !== s.bedrooms ||
            cap.bathrooms !== s.bathrooms
        );

        if (!isDifferent) {
            banner.style.display = "none";
            return;
        }

        bannerText.textContent =
            `For ${guests} guest${guests > 1 ? "s" : ""}, we recommend ` +
            `${s.beds} bed${s.beds > 1 ? "s" : ""}, ` +
            `${s.bedrooms} bedroom${s.bedrooms > 1 ? "s" : ""}, ` +
            `and ${s.bathrooms} bathroom${s.bathrooms > 1 ? "s" : ""}.`;

        banner.style.display = "flex";
    }

    function applySuggestion() {
        if (!pendingSuggestion) return;

        cap.beds = pendingSuggestion.beds;
        cap.bedrooms = pendingSuggestion.bedrooms;
        cap.bathrooms = pendingSuggestion.bathrooms;

        // Update stepper displays
        updateStepperDisplay("beds", cap.beds);
        updateStepperDisplay("bedrooms", cap.bedrooms);
        updateStepperDisplay("bathrooms", cap.bathrooms);

        banner.style.display = "none";
        pendingSuggestion = null;
        save();
    }

    if (bannerApply) bannerApply.addEventListener("click", applySuggestion);
    if (bannerClose) {
        bannerClose.addEventListener("click", () => {
            banner.style.display = "none";
            suggestionDismissed = true;
        });
    }

    // ══════════════════════════════════════════════════════════
    // LOGICAL VALIDATIONS
    // ══════════════════════════════════════════════════════════
    // Rules:
    //   1. If guests ≥ 1, beds must be ≥ 1
    //   2. If guests ≥ 2, bedrooms must be ≥ 1
    //   3. If guests ≥ 1, bathrooms must be ≥ 0.5
    //   4. beds should be ≥ guests (warning, not blocking)
    //
    // Errors block the Next button. Warnings are just informational.
    // ══════════════════════════════════════════════════════════
    function validate() {
        const guests = Number(cap.guests) || 0;
        const beds = Number(cap.beds) || 0;
        const bedrooms = Number(cap.bedrooms) || 0;
        const bathrooms = Number(cap.bathrooms) || 0;

        const errors = {};

        if (guests < 1) {
            // Shouldn't happen (slider min is 1) but just in case
            errors._global = "At least 1 guest is required.";
        }

        if (guests >= 1 && beds < 1) {
            errors.beds = "At least 1 bed is required when you have guests.";
        }

        if (guests >= 2 && bedrooms < 1) {
            errors.bedrooms = "At least 1 bedroom is needed for 2 or more guests.";
        }

        if (guests >= 1 && bathrooms < 0.5) {
            errors.bathrooms = "At least 1 bathroom (or half-bath) is required.";
        }

        // Show/clear error messages in the DOM
        document.querySelectorAll(".cap-error").forEach((el) => {
            const field = el.dataset.errorFor;
            el.textContent = errors[field] || "";
        });

        const hasErrors = Object.keys(errors).length > 0;
        return !hasErrors;
    }

    // ══════════════════════════════════════════════════════════
    // SAVE + NEXT BUTTON STATE
    // ══════════════════════════════════════════════════════════
    function setNextState() {
        const isValid = validate();
        if (nextBtn) nextBtn.disabled = !isValid;
    }

    function save() {
        ListingStore.saveDraft({ capacity: cap });
        setNextState();

        SidePanel.setTips({
            selectedLabel: "Capacity",
            tips: [
                "We suggest sleeping arrangements based on your guest count — feel free to adjust.",
                "Bathrooms can be set in halves (0.5 = toilet + sink, no shower).",
                "You can always update capacity later before publishing.",
            ],
        });
        SidePanel.refresh();
    }

    // ══════════════════════════════════════════════════════════
    // GUEST SLIDER
    // ══════════════════════════════════════════════════════════
    guestInput.value = cap.guests;
    guestVal.textContent = cap.guests;
    if (guestLabel) guestLabel.textContent = cap.guests === 1 ? "guest" : "guests";

    guestInput.addEventListener("input", () => {
        cap.guests = Number(guestInput.value);
        guestVal.textContent = cap.guests;
        if (guestLabel) guestLabel.textContent = cap.guests === 1 ? "guest" : "guests";

        // Reset dismissed state when slider moves — user might want new suggestions
        suggestionDismissed = false;
        showSuggestion(cap.guests);

        save();
    });

    // ══════════════════════════════════════════════════════════
    // STEPPERS (bedrooms, beds, bathrooms)
    // ══════════════════════════════════════════════════════════
    // Keep references so we can update displays from applySuggestion()
    const stepperDisplays = {};

    function updateStepperDisplay(key, value) {
        const el = stepperDisplays[key];
        if (el) el.textContent = value;
    }

    document.querySelectorAll(".cap-stepper").forEach((wrap) => {
        const key = wrap.dataset.key;                // "bedrooms" | "beds" | "bathrooms"
        const step = Number(wrap.dataset.step || 1);  // 1 for beds/bedrooms, 0.5 for bathrooms

        let value = cap[key] ?? 0;

        wrap.innerHTML = `
            <button class="step-btn qtyBtn minus" type="button" aria-label="Decrease ${key}">−</button>
            <div class="step-val">${value}</div>
            <button class="step-btn qtyBtn plus" type="button" aria-label="Increase ${key}">+</button>
        `;

        const valEl = wrap.querySelector(".step-val");
        const minusBtn = wrap.querySelector(".minus");
        const plusBtn = wrap.querySelector(".plus");

        // Store reference for external updates
        stepperDisplays[key] = valEl;

        minusBtn.onclick = () => {
            value = Math.max(0, value - step);
            // Round to avoid floating-point drift (e.g., 1.0000000001)
            value = Math.round(value * 10) / 10;
            valEl.textContent = value;
            cap[key] = value;
            save();
        };

        plusBtn.onclick = () => {
            value += step;
            value = Math.round(value * 10) / 10;
            valEl.textContent = value;
            cap[key] = value;
            save();
        };
    });

    // ══════════════════════════════════════════════════════════
    // INIT — show suggestion if first visit with default values
    // ══════════════════════════════════════════════════════════
    setNextState();
    save();

    // Show suggestion on load if values are still at defaults and guests > 1
    if (cap.guests > 1) {
        showSuggestion(cap.guests);
    }
};