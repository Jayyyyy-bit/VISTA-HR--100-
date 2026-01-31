lucide.createIcons();

const btnOwner = document.getElementById("btnOwner");
const btnResident = document.getElementById("btnResident");
const backBtn = document.getElementById("backBtn");

function safeGoTo(url) {
    if (typeof goTo === "function") goTo(url);
    else window.location.href = url;
}

btnOwner.addEventListener("click", () => {
    safeGoTo("./property-owner/owner_signup.html");
});

btnResident.addEventListener("click", () => {
    safeGoTo("./Resident-SignUp/resident.html");
});

backBtn.addEventListener("click", () => {
    safeGoTo("../../Landing_Page/ASSETS/front_index.html");
});
