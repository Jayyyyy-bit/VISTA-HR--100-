// core/transition.js
window.StepTransition = (() => {
    const D = 450;
    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    async function fadeOut(el) {
        el.classList.remove("fx-in");
        el.classList.add("fx-out");
        await wait(D);
    }

    async function fadeIn(el) {
        el.classList.remove("fx-out");
        el.classList.add("fx-in");
        await wait(D);
        el.classList.remove("fx-in");
    }

    return { fadeOut, fadeIn };
})();
