let playing = false
document.getElementById("playBtn").addEventListener("click", () => {
    playing = !playing
    document.querySelector(".icon-play").style.display = playing ? "none" : "block"
    document.querySelector(".icon-pause").style.display = playing ? "block" : "none"
})

const sampleBtns = document.querySelector(".sample__buttons")
for (const btn of sampleBtns.children) {
    btn.addEventListener("click", () => {
        for (const btn2 of sampleBtns.children) {
            btn2.classList.remove("selected")
        }
        btn.classList.add("selected")
    })
}