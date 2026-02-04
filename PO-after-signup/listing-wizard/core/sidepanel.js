// core/sidepanel.js (GLOBAL - matches index.html IDs)
window.SidePanel = (() => {
  /**
   * Accepts:
   *  setTips({ selectedLabel: "Condominium", tips: ["...", "..."] })
   */
  function setTips({ selectedLabel = "—", tips = null } = {}) {
    const pill = document.getElementById("selectedPill");
    const ul = document.getElementById("guideTips");
    if (!ul) return;

    if (pill) pill.textContent = `Selected: ${selectedLabel}`;

    const fallback = [
      "Pick the closest match for faster approval.",
      "Keep details consistent with your photos.",
      "You can edit this later anytime."
    ];

    const arr = Array.isArray(tips) && tips.length ? tips : fallback;
    ul.innerHTML = arr.map(t => `<li>${t}</li>`).join("");
  }

  function refresh() {
    const draft = window.ListingStore?.readDraft?.() || {};
    const prog = window.ListingStore?.computeProgress?.(draft) || { percent: 0, steps: [] };

    // percent
    const pctEl = document.getElementById("percentLabel");
    if (pctEl) pctEl.textContent = `${prog.percent || 0}%`;

    // bar
    const barEl = document.getElementById("progressBar");
    if (barEl) barEl.style.width = `${prog.percent || 0}%`;

    // checklist
    const listEl = document.getElementById("sideChecklist");
    if (listEl) {
      const steps = Array.isArray(prog.steps) ? prog.steps : [];
      const nextStep =
        steps.find(s => !s.done && !s.locked)?.step ??
        steps[steps.length - 1]?.step ??
        1;

      listEl.innerHTML = steps.map(s => {
        const state =
          s.done ? "done" :
            s.locked ? "locked" :
              (s.step === nextStep ? "active" : "");

        const right =
          s.done ? "Done" :
            s.locked ? "Locked" :
              (s.step === nextStep ? "Next" : "Pending");

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
  }

  return { refresh, setTips };
})();
