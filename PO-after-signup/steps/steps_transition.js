/* transition.js
   Cross-page morph/slide using FLIP-style clones + sessionStorage handshake.
   Works best when both pages keep same data-transition-key elements.
*/

(function () {
  const PAYLOAD_KEY = "__vista_transition_payload__";
  const OVERLAY_ID = "transition-overlay";

  function ensureOverlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = OVERLAY_ID;
      el.className = "transition-overlay";
      document.body.appendChild(el);
    }
    return el;
  }

  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }

  function createClone(el) {
    const clone = el.cloneNode(true);
    clone.classList.add("transition-clone");
    clone.style.position = "fixed";
    clone.style.margin = "0";
    clone.style.top = "0";
    clone.style.left = "0";
    clone.style.transformOrigin = "top left";
    clone.style.zIndex = "9999";
    clone.style.pointerEvents = "none";
    return clone;
  }

  function setCloneToRect(clone, rect) {
    clone.style.transform =
      `translate(${rect.left}px, ${rect.top}px) scale(${rect.width / clone.__baseW}, ${rect.height / clone.__baseH})`;
  }

  function lockScroll() {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    document.documentElement.dataset.__scrollY = String(y);
    document.body.style.position = "fixed";
    document.body.style.top = `-${y}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  }

  function unlockScroll() {
    const y = Number(document.documentElement.dataset.__scrollY || "0");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, y);
    delete document.documentElement.dataset.__scrollY;
  }

  function capture(keys = ["main", "side"]) {
    const captured = [];
    keys.forEach((k) => {
      const el = document.querySelector(`[data-transition-key="${k}"]`);
      if (!el) return;
      const r = rectOf(el);
      captured.push({
        key: k,
        rect: r,
        html: el.outerHTML
      });
    });
    return captured;
  }

  function hideTargets(keys = ["main", "side"]) {
    keys.forEach((k) => {
      const el = document.querySelector(`[data-transition-key="${k}"]`);
      if (el) el.style.visibility = "hidden";
    });
  }

  function showTargets(keys = ["main", "side"]) {
    keys.forEach((k) => {
      const el = document.querySelector(`[data-transition-key="${k}"]`);
      if (el) el.style.visibility = "";
    });
  }

  function playEnter() {
    const payloadRaw = sessionStorage.getItem(PAYLOAD_KEY);
    if (!payloadRaw) return;

    let payload;
    try { payload = JSON.parse(payloadRaw); } catch { return; }

    sessionStorage.removeItem(PAYLOAD_KEY);

    const overlay = ensureOverlay();
    overlay.classList.add("is-on", "is-entering");
    overlay.innerHTML = ""; // reset

    const keys = payload.items.map(i => i.key);
    hideTargets(keys);

    // Build clones from previous page HTML, positioned at previous rects.
    const clones = payload.items.map((item) => {
      const wrap = document.createElement("div");
      wrap.innerHTML = item.html.trim();
      const prevEl = wrap.firstElementChild;

      const clone = createClone(prevEl);
      // Determine base size for scaling math
      clone.__baseW = item.rect.width;
      clone.__baseH = item.rect.height;

      // We'll set clone at 1:1 scale at its base size, then transform to match rect.
      clone.style.width = `${item.rect.width}px`;
      clone.style.height = `${item.rect.height}px`;
      clone.style.transform = `translate(${item.rect.left}px, ${item.rect.top}px) scale(1,1)`;

      overlay.appendChild(clone);

      return { key: item.key, clone, from: item.rect };
    });

    // Next rects on the new page
    const toRects = {};
    clones.forEach(({ key }) => {
      const target = document.querySelector(`[data-transition-key="${key}"]`);
      if (target) toRects[key] = rectOf(target);
    });

    // Animate: clones move/scale to new rects; overlay also fades
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        clones.forEach(({ key, clone, from }) => {
          const to = toRects[key] || from;

          // Set base dimensions to "from" so scale math stays stable
          clone.__baseW = from.width;
          clone.__baseH = from.height;
          clone.style.width = `${from.width}px`;
          clone.style.height = `${from.height}px`;

          clone.style.transition =
            "transform 520ms cubic-bezier(.2,.9,.2,1), filter 520ms cubic-bezier(.2,.9,.2,1), opacity 520ms cubic-bezier(.2,.9,.2,1)";
          clone.style.filter = "blur(0px)";
          clone.style.opacity = "1";

          // animate transform to new rect
          const sx = to.width / from.width;
          const sy = to.height / from.height;
          clone.style.transform = `translate(${to.left}px, ${to.top}px) scale(${sx}, ${sy})`;
        });

        overlay.style.transition = "opacity 520ms cubic-bezier(.2,.9,.2,1)";
        overlay.style.opacity = "1";
      });
    });

    // End cleanup
    window.setTimeout(() => {
      showTargets(keys);
      overlay.classList.remove("is-on", "is-entering");
      overlay.style.opacity = "";
      overlay.innerHTML = "";
      unlockScroll();
    }, 560);
  }

  function go(url, opts = {}) {
    const keys = opts.keys || ["main", "side"];
    const overlay = ensureOverlay();

    lockScroll();

    // Capture elements + their rects + html
    const items = capture(keys);

    // Save payload so next page can animate in
    sessionStorage.setItem(PAYLOAD_KEY, JSON.stringify({
      t: Date.now(),
      items
    }));

    // Outgoing overlay effect (simple glass + slight slide)
    overlay.classList.add("is-on", "is-leaving");
    overlay.style.opacity = "0";
    overlay.innerHTML = "";

    // Optional: show outgoing clones for smoother feel
    const clones = [];
    items.forEach((item) => {
      const el = document.querySelector(`[data-transition-key="${item.key}"]`);
      if (!el) return;
      const r = rectOf(el);

      const clone = createClone(el);
      clone.__baseW = r.width;
      clone.__baseH = r.height;
      clone.style.width = `${r.width}px`;
      clone.style.height = `${r.height}px`;
      clone.style.transform = `translate(${r.left}px, ${r.top}px) scale(1,1)`;
      overlay.appendChild(clone);
      clones.push(clone);
    });

    // Animate out
    requestAnimationFrame(() => {
      overlay.style.transition = "opacity 260ms ease";
      overlay.style.opacity = "1";
      clones.forEach((c) => {
        c.style.transition = "transform 380ms cubic-bezier(.2,.9,.2,1), opacity 260ms ease";
        c.style.opacity = "0.98";
        // tiny drift feels like PPT slide
        c.style.transform += " translateY(-6px)";
      });
    });

    // Navigate quickly (no “wait”)
    window.setTimeout(() => {
      window.location.href = url;
    }, 140);
  }

  // Expose global
  window.Transition = { go, playEnter };

  document.addEventListener("DOMContentLoaded", () => {
    // Run enter animation if coming from previous step
    playEnter();
  });
})();
