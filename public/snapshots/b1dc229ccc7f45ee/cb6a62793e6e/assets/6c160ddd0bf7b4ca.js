document.getElementById("hamburger").addEventListener("click", () => {
    document.querySelector(".navhamburger").classList.toggle("navopen")
})

function goBack() {
    window.history.back()
}