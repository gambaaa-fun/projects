const updateScrollButton = () => {
  document.body.classList.toggle("scrolled", window.scrollY > 100);
};

updateScrollButton();

window.addEventListener("scroll", updateScrollButton, {
  passive: true,
});
