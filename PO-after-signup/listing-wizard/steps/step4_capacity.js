// steps/step4.js

window.Step4Init = function Step4Init({ nextBtn }) {
    const { ListingStore, SidePanel } = window;

    const draft = ListingStore.readDraft();
    const cap = draft.capacity || {
        guests: 1,
        bedrooms: 0,
        beds: 1,
        bathrooms: 1,
    };

    /* =========================
       Guests slider
       ========================= */
    const guestInput = document.getElementById("capGuests");
    const guestVal = document.getElementById("capGuestsVal");

    if (!guestInput || !guestVal) {
        console.error("[Step4] capGuests/capGuestsVal not found.");
        return;
    }

    guestInput.value = cap.guests;
    guestVal.textContent = cap.guests;

    guestInput.addEventListener("input", () => {
        cap.guests = Number(guestInput.value);
        guestVal.textContent = cap.guests;
        save();
    });

    /* =========================
       Steppers
       ========================= */
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

        wrap.querySelector(".minus").onclick = () => {
            value = Math.max(0, value - step);
            valEl.textContent = value;
            cap[key] = value;
            save();
        };

        wrap.querySelector(".plus").onclick = () => {
            value += step;
            valEl.textContent = value;
            cap[key] = value;
            save();
        };
    });

    function save() {
        ListingStore.saveDraft({ capacity: cap });
        SidePanel.refresh();
        nextBtn.disabled = cap.guests < 1;
    }

    /* Tips */
    SidePanel.setTips({
        selectedLabel: "Capacity",
        tips: [
            "Guest count affects pricing and search visibility.",
            "Bathrooms can be set in halves (e.g. 1.5).",
            "You can adjust this later.",
        ],
    });
    SidePanel.refresh();

    // initial state
    nextBtn.disabled = cap.guests < 1;

    // ✅ Sync Step 4 to backend on Next

};
