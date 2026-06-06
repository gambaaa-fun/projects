const skillBars = document.querySelectorAll(".skill-slider__bar");

const skillObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      requestAnimationFrame(() => {
        entry.target.classList.add("is-filled");
      });

      skillObserver.unobserve(entry.target);
    });
  },
  {
    threshold: 0.35,
  },
);

document.querySelectorAll(".skill-slider-group-list").forEach((group) => {
  group.querySelectorAll(".skill-slider__bar").forEach((bar, index) => {
    bar.style.setProperty("--skill-fill-delay", `${index * 0.15}s`);
  });
});

window.addEventListener("load", () => {
  skillBars.forEach((bar) => {
    skillObserver.observe(bar);
  });
});
