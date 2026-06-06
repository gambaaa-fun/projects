const grids = Array.from(document.querySelectorAll(".grid-script"));

if (grids.length) {
  const updateAloneGridItems = () => {
    grids.forEach((grid) => {
      const cards = Array.from(grid.children);
      const lastCard = cards.at(-1);

      cards.forEach((card) => card.classList.remove("is-alone-row"));

      if (!lastCard) {
        return;
      }

      const lastCardTop = lastCard.offsetTop;
      const cardsInLastRow = cards.filter(
        (card) => card.offsetTop === lastCardTop,
      );

      if (cardsInLastRow.length === 1) {
        lastCard.classList.add("is-alone-row");
      }
    });
  };

  updateAloneGridItems();
  window.addEventListener("resize", updateAloneGridItems);
  window.addEventListener("load", updateAloneGridItems);

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(updateAloneGridItems);
    grids.forEach((grid) => resizeObserver.observe(grid));
  }
}
