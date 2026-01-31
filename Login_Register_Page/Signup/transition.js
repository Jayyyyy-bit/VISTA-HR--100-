// Universal slideshow-like transition for all pages

(function () {
    // 1) On page load: play enter animation quickly
    document.body.classList.add("page-enter");
    window.addEventListener("load", () => {
        setTimeout(() => document.body.classList.remove("page-enter"), 260);
    });

    // 2) Intercept clicks on links/buttons with data-nav
    // Use: <a data-nav href="..."> or button that calls goTo(url)
    window.goTo = function (url) {
        document.body.classList.add("page-exit");
        setTimeout(() => {
            window.location.href = url;
        }, 350);
    };

    // For normal <a> tags
    document.addEventListener("click", (e) => {
        const a = e.target.closest("a[data-nav]");
        if (!a) return;

        const url = a.getAttribute("href");
        if (!url || url.startsWith("#")) return;

        e.preventDefault();
        window.goTo(url);
    });
})();
