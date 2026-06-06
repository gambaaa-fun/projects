/**
 * Vůně dálek — main.js
 * Minimální JavaScript: košík feedback + about slider
 */

document.addEventListener('DOMContentLoaded', () => {

  /* =========================================================================
     TLAČÍTKO „Přidat do košíku" — vizuální zpětná vazba (bez e-shop logiky)
     ========================================================================= */
  const addToCartButtons = document.querySelectorAll('.js-add-to-cart');

  addToCartButtons.forEach((button) => {
    button.addEventListener('click', (e) => {
      e.preventDefault();

      const originalText = button.textContent;
      button.textContent = '✓ Přidáno';
      button.style.backgroundColor = '#5a8a3a';
      button.style.borderColor = '#5a8a3a';
      button.disabled = true;

      setTimeout(() => {
        button.textContent = originalText;
        button.style.backgroundColor = '';
        button.style.borderColor = '';
        button.disabled = false;
      }, 2000);
    });
  });

  /* =========================================================================
     ABOUT SLIDER — elegantní fade carousel bez externích knihoven
     ========================================================================= */
  const slider = document.querySelector('.about__slider');
  if (!slider) return; // slider neexistuje na jiných stránkách

  const slides = slider.querySelectorAll('.about__slide');
  const dots   = slider.querySelectorAll('.about__slider-dot');
  const btnPrev = slider.querySelector('.about__slider-btn--prev');
  const btnNext = slider.querySelector('.about__slider-btn--next');

  const TOTAL    = slides.length;
  const INTERVAL = 5000; // ms mezi automatickým přepnutím
  let   current  = 0;
  let   timer    = null;

  /**
   * Přejde na snímek se zadaným indexem.
   * @param {number} index
   */
  function goTo(index) {
    // Skryj aktuální snímek a dot
    slides[current].classList.remove('about__slide--active');
    slides[current].setAttribute('aria-hidden', 'true');
    dots[current].classList.remove('about__slider-dot--active');
    dots[current].setAttribute('aria-selected', 'false');

    // Normalizuj index (cyklický posun)
    current = (index + TOTAL) % TOTAL;

    // Zobraz nový snímek a dot
    slides[current].classList.add('about__slide--active');
    slides[current].setAttribute('aria-hidden', 'false');
    dots[current].classList.add('about__slider-dot--active');
    dots[current].setAttribute('aria-selected', 'true');
  }

  /** Spustí automatický interval. */
  function startAuto() {
    clearInterval(timer);
    timer = setInterval(() => goTo(current + 1), INTERVAL);
  }

  /** Zastaví auto-play a restartuje ho (po manuálním zásahu). */
  function resetAuto() {
    startAuto();
  }

  // Šipka zpět
  btnPrev.addEventListener('click', () => {
    goTo(current - 1);
    resetAuto();
  });

  // Šipka dopředu
  btnNext.addEventListener('click', () => {
    goTo(current + 1);
    resetAuto();
  });

  // Dots — přímý výběr snímku
  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      goTo(Number(dot.dataset.index));
      resetAuto();
    });
  });

  // Pauza auto-play při hoveru (přístupnost + UX)
  slider.addEventListener('mouseenter', () => clearInterval(timer));
  slider.addEventListener('mouseleave', () => startAuto());

  // Podpora swipe na dotykových zařízeních
  let touchStartX = 0;

  slider.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].clientX;
  }, { passive: true });

  slider.addEventListener('touchend', (e) => {
    const delta = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(delta) < 40) return; // ignoruj krátký tap
    goTo(delta < 0 ? current + 1 : current - 1);
    resetAuto();
  }, { passive: true });

  // Spuštění
  startAuto();

});
