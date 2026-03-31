// steps/step4.js
window.Step4Init = function Step4Init({ nextBtn }) {
    const { ListingStore, SidePanel } = window;

    const draft = ListingStore.readDraft();
    const cap = draft.capacity || { guests: 1, bedrooms: 0, beds: 1, bathrooms: 1 };

    const guestInput = document.getElementById("capGuests");
    const guestVal = document.getElementById("capGuestsVal");
    const rentInput = document.getElementById("capRent");

    if (!guestInput || !guestVal) return;

    function setNextState() {
        if (nextBtn) nextBtn.disabled = Number(cap.guests) < 1;
    }

    function save() {
        ListingStore.saveDraft({ capacity: cap });
        setNextState();

        SidePanel.setTips({
            selectedLabel: "Capacity",
            tips: [
                "Setting a monthly rent helps residents filter by budget.",
                "Bathrooms can be set in halves (e.g. 1.5).",
                "You can adjust this later.",
            ],
        });
        SidePanel.refresh();
    }

    // Guests slider
    guestInput.value = cap.guests;
    guestVal.textContent = cap.guests;

    guestInput.addEventListener("input", () => {
        cap.guests = Number(guestInput.value);
        guestVal.textContent = cap.guests;
        save();
    });

    // Monthly rent
    if (rentInput) {
        if (cap.monthly_rent) rentInput.value = cap.monthly_rent;

        rentInput.addEventListener("input", () => {
            const val = parseInt(rentInput.value) || null;
            cap.monthly_rent = val;
            save();
        });
    }

    // Steppers
    document.querySelectorAll(".cap-stepper").forEach((wrap) => {
        const key = wrap.dataset.key;
        const step = Number(wrap.dataset.step || 1);

        let value = cap[key] ?? 0;

        wrap.innerHTML = `
      <button class="step-btn qtyBtn minus" type="button" aria-label="Decrease">−</button>
      <div class="step-val">${value}</div>
      <button class="step-btn qtyBtn plus" type="button" aria-label="Increase">+</button>
    `;

        const valEl = wrap.querySelector(".step-val");
        const minusBtn = wrap.querySelector(".minus");
        const plusBtn = wrap.querySelector(".plus");

        minusBtn.onclick = () => {
            value = Math.max(0, value - step);
            valEl.textContent = value;
            cap[key] = value;
            save();
        };

        plusBtn.onclick = () => {
            value += step;
            valEl.textContent = value;
            cap[key] = value;
            save();
        };
    });

    // init
    setNextState();
    save();
};