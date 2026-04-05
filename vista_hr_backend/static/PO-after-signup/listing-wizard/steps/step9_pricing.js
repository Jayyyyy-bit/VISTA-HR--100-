// steps/step9_pricing.js — Monthly Rent + Student Discount

window.Step9Init = function Step9Init({ nextBtn }) {
    const { ListingStore, SidePanel } = window;

    const draft = ListingStore.readDraft();

    // ══════════════════════════════════════════════════════════
    //  STATE
    // ══════════════════════════════════════════════════════════
    //
    //  Pricing data is stored in TWO places:
    //    1. capacity.monthly_rent  — the monthly rent (integer)
    //    2. capacity.student_discount_pct — discount % (1-50 or null)
    //
    //  We read from draft.capacity and write back to it.
    //  The backend Step 9 handler will split these into the right
    //  DB columns (monthly_rent stays in capacity JSON,
    //  student_discount goes to the dedicated column).
    // ══════════════════════════════════════════════════════════

    const cap = draft.capacity || {};
    let rent = cap.monthly_rent || null;
    let discountEnabled = (cap.student_discount_pct != null && cap.student_discount_pct > 0);
    let discountPct = cap.student_discount_pct || 10;

    // ── DOM Elements ──
    const rentInput = document.getElementById("prRent");
    const rentError = document.getElementById("prRentError");
    const discountToggle = document.getElementById("prDiscountToggle");
    const discountBody = document.getElementById("prDiscountBody");
    const discountSlider = document.getElementById("prDiscountSlider");
    const discountVal = document.getElementById("prDiscountVal");
    const preview = document.getElementById("prPreview");
    const regularPrice = document.getElementById("prRegularPrice");
    const studentPrice = document.getElementById("prStudentPrice");
    const savings = document.getElementById("prSavings");

    if (!rentInput) return;

    // ══════════════════════════════════════════════════════════
    //  FORMAT HELPERS
    // ══════════════════════════════════════════════════════════
    function formatPeso(amount) {
        if (amount == null || isNaN(amount)) return "₱0";
        return "₱" + Number(amount).toLocaleString("en-PH");
    }

    // ══════════════════════════════════════════════════════════
    //  VALIDATION
    // ══════════════════════════════════════════════════════════
    function validate() {
        let error = "";

        if (rent === null || rent === "" || isNaN(rent)) {
            error = "Monthly rent is required.";
        } else if (Number(rent) < 500) {
            error = "Minimum rent is ₱500.";
        } else if (Number(rent) > 500000) {
            error = "Maximum rent is ₱500,000.";
        }

        if (rentError) rentError.textContent = error;

        const isValid = !error;
        if (nextBtn) nextBtn.disabled = !isValid;
        return isValid;
    }

    // ══════════════════════════════════════════════════════════
    //  PRICE PREVIEW
    // ══════════════════════════════════════════════════════════
    function updatePreview() {
        if (!preview) return;

        if (!discountEnabled || !rent || Number(rent) < 500) {
            preview.style.display = "none";
            return;
        }

        const r = Number(rent);
        const disc = Number(discountPct);
        const discounted = Math.round(r * (1 - disc / 100));
        const saved = r - discounted;

        preview.style.display = "block";
        if (regularPrice) regularPrice.textContent = formatPeso(r);
        if (studentPrice) studentPrice.textContent = formatPeso(discounted);
        if (savings) savings.textContent = "-" + formatPeso(saved);
    }

    // ══════════════════════════════════════════════════════════
    //  SLIDER TRACK COLOR
    // ══════════════════════════════════════════════════════════
    //
    //  CSS range inputs don't natively fill the left side with
    //  color. We use a CSS variable (--pct) + linear-gradient
    //  in the HTML <style> to fake it. This function updates
    //  the --pct value whenever the slider moves.
    // ══════════════════════════════════════════════════════════
    function updateSliderTrack() {
        if (!discountSlider) return;
        const min = Number(discountSlider.min);
        const max = Number(discountSlider.max);
        const val = Number(discountSlider.value);
        const pct = ((val - min) / (max - min)) * 100;
        discountSlider.style.setProperty("--pct", pct + "%");
    }

    // ══════════════════════════════════════════════════════════
    //  SAVE TO STORE
    // ══════════════════════════════════════════════════════════
    function save() {
        const patchCap = { ...cap };
        patchCap.monthly_rent = rent ? Number(rent) : null;
        patchCap.student_discount_pct = discountEnabled ? Number(discountPct) : null;

        ListingStore.saveDraft({ capacity: patchCap });

        validate();
        updatePreview();

        SidePanel.setTips({
            selectedLabel: "Pricing",
            tips: [
                "Set a competitive rent for your area — residents can filter by price.",
                "Student discounts attract more bookings from verified students.",
                "You can change pricing anytime before or after publishing.",
            ],
        });
        SidePanel.refresh();
    }

    // ══════════════════════════════════════════════════════════
    //  EVENT LISTENERS
    // ══════════════════════════════════════════════════════════

    // ── Rent input ──
    if (rent) rentInput.value = rent;

    rentInput.addEventListener("input", () => {
        const raw = rentInput.value.trim();
        rent = raw === "" ? null : parseInt(raw, 10);
        save();
    });

    // Prevent scroll changing the number value
    rentInput.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });

    // ── Discount toggle ──
    function renderToggle() {
        if (!discountToggle) return;
        discountToggle.setAttribute("aria-pressed", discountEnabled ? "true" : "false");
        if (discountBody) discountBody.hidden = !discountEnabled;
    }

    discountToggle?.addEventListener("click", () => {
        discountEnabled = !discountEnabled;
        renderToggle();
        save();
    });

    // ── Discount slider ──
    if (discountSlider) {
        discountSlider.value = discountPct;
        if (discountVal) discountVal.textContent = discountPct;
        updateSliderTrack();

        discountSlider.addEventListener("input", () => {
            discountPct = Number(discountSlider.value);
            if (discountVal) discountVal.textContent = discountPct;
            updateSliderTrack();
            save();
        });
    }

    // ══════════════════════════════════════════════════════════
    //  INIT
    // ══════════════════════════════════════════════════════════
    renderToggle();
    validate();
    updatePreview();
    updateSliderTrack();
    save();
};