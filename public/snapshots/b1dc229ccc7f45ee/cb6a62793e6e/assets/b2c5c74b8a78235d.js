const mq = window.matchMedia("(min-width: 900px)")

function applyBullet(e) {
    document.querySelectorAll(".aboutus__figure p").forEach(p => {
        p.classList.toggle("bullet", e.matches)
    })

    document.querySelectorAll(".aboutus__figure-reversed div").forEach(p => {
        p.classList.toggle("bullet-after", e.matches)
    })
}

mq.addEventListener("change", applyBullet)
applyBullet(mq)