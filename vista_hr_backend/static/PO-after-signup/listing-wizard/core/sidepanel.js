// core/sidepanel.js (GLOBAL - matches index.html IDs)
window.SidePanel = (() => {
  function setTips({ selectedLabel = "—", tips = null } = {}) {
    // ── Side panel (existing) ──
    const pill = document.getElementById("selectedPill");
    const ul = document.getElementById("guideTips");
    if (ul) {
      if (pill) pill.textContent = `Selected: ${selectedLabel}`;
      const fallback = [
        "Pick the closest match for faster approval.",
        "Keep details consistent with your photos.",
        "You can edit this later anytime."
      ];
      const arr = Array.isArray(tips) && tips.length ? tips : fallback;
      ul.innerHTML = arr.map(t => `<li>${t}</li>`).join("");
    }

    // ── Bottom tips strip (new) ──
    const strip = document.getElementById("bottomTipsStrip");
    if (!strip) return;
    const arr2 = Array.isArray(tips) && tips.length ? tips : [
      "Pick the closest match for faster approval.",
      "Keep details consistent with your photos.",
      "You can edit this later anytime."
    ];
    // Re-render tip items
    const list = strip.querySelector(".bts-list");
    if (list) {
      list.innerHTML = arr2.map(t => `<span class="bts-item">${t}</span>`).join("");
    }
    // Check per-step dismiss state
    const stepKey = `vista_tips_dismissed_${_getCurrentStepKey()}`;
    let alreadyDismissed = false;
    try { alreadyDismissed = localStorage.getItem(stepKey) === "1"; } catch { }

    if (alreadyDismissed) {
      strip.classList.add("bts-hidden");
      return;
    }

    // Auto-show when new tips come in, then auto-hide after 6s if user hasn't dismissed
    strip.classList.remove("bts-hidden");
    clearTimeout(strip._autoHide);
    strip._autoHide = setTimeout(() => strip.classList.add("bts-hidden"), 6000);
  }

  function _getCurrentStepKey() {
    const raw = (location.hash || "").replace(/^#\/?/, "").split("?")[0].trim();
    return raw || "step-1";
  }

  function dismissTips() {
    const stepKey = `vista_tips_dismissed_${_getCurrentStepKey()}`;
    try { localStorage.setItem(stepKey, "1"); } catch { }
    const strip = document.getElementById("bottomTipsStrip");
    if (strip) {
      strip.classList.add("bts-hidden");
      clearTimeout(strip._autoHide);
    }
  }

  function getActiveStepFromHash() {
    // expects "#/step-3"
    const raw = (location.hash || "");
    const cleaned = raw.replace(/^#\/?/, "");
    const id = cleaned.split("?")[0].trim(); // "step-3"
    const m = id.match(/^step-(\d+)$/);
    const n = m ? Number(m[1]) : 1;
    return Number.isFinite(n) && n >= 1 ? n : 1;
  }

  function refresh(activeStep) {
    const step = Number(activeStep) || getActiveStepFromHash();

    const draft = window.ListingStore?.readDraft?.() || {};
    const prog = window.ListingStore?.computeProgress?.(draft, step) || { percent: 0, steps: [], activeStep: step };

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
      const active = Number(prog.activeStep || step || 1);

      listEl.innerHTML = steps.map(s => {
        // ✅ Blue current, green done, grey pending
        const state = s.done ? "done" : (s.step === active ? "active" : "");
        const right = s.done ? "Done" : (s.step === active ? "Current" : "Pending");

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

  return { refresh, setTips, dismissTips };
})();