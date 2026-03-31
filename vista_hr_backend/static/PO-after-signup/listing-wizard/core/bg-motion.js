// core/bg_motion.js
(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return;

    const g1 = document.querySelector(".bg .g1");
    const g2 = document.querySelector(".bg .g2");
    if (!g1 || !g2) return;

    const state = {
        t: 0,
        mx: 0,
        my: 0,
        tx: 0,
        ty: 0,
        w: window.innerWidth,
        h: window.innerHeight
    };

    // subtle parallax target
    window.addEventListener("mousemove", (e) => {
        const nx = (e.clientX / state.w) * 2 - 1; // -1..1
        const ny = (e.clientY / state.h) * 2 - 1; // -1..1
        state.tx = nx;
        state.ty = ny;
    }, { passive: true });

    window.addEventListener("resize", () => {
        state.w = window.innerWidth;
        state.h = window.innerHeight;
    }, { passive: true });

    // deterministic smooth wobble
    const sin = Math.sin;
    const cos = Math.cos;

    function tick() {
        state.t += 0.008; // speed

        // ease parallax
        state.mx += (state.tx - state.mx) * 0.05;
        state.my += (state.ty - state.my) * 0.05;

        // "noise-like" drift (layered sines)
        const n1x = sin(state.t) * 60 + sin(state.t * 0.7) * 28 + cos(state.t * 1.3) * 18;
        const n1y = cos(state.t * 0.9) * 55 + sin(state.t * 1.1) * 22 + cos(state.t * 1.5) * 14;

        const n2x = cos(state.t * 0.85) * 70 + sin(state.t * 0.6) * 26 + sin(state.t * 1.4) * 16;
        const n2y = sin(state.t * 0.95) * 62 + cos(state.t * 1.2) * 24 + sin(state.t * 1.6) * 12;

        // parallax (tiny)
        const px = state.mx * 18;
        const py = state.my * 12;

        // gentle scale breathing
        const s1 = 1 + sin(state.t * 1.1) * 0.03;
        const s2 = 1 + cos(state.t * 1.0) * 0.035;

        // apply transforms
        g1.style.transform = `translate3d(${n1x + px}px, ${n1y + py}px, 0) scale(${s1})`;
        g2.style.transform = `translate3d(${n2x - px}px, ${n2y - py}px, 0) scale(${s2})`;

        requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
})();
