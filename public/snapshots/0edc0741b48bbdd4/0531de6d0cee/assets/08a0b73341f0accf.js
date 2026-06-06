
(function() {
    const header = document.querySelector('.header');
    if (!header) return;
    let lastScroll = window.scrollY || 0;
    let ticking = false;
    const threshold = 10;

    function onScroll() {
        const current = window.scrollY || 0;
        if (!ticking) {
            window.requestAnimationFrame(() => {
                if (Math.abs(current - lastScroll) > threshold) {
                    if (current > lastScroll && current > 60) {
                        header.classList.add('header--hidden');
                    } else {
                        header.classList.remove('header--hidden');
                    }
                    lastScroll = current;
                }
                ticking = false;
            });
            ticking = true;
        }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
})();


(function () {
    const lightbox = document.getElementById('lightbox');
    if (!lightbox) return;

    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const closeBtn = document.getElementById('lightbox-close');
    const prevBtn = document.getElementById('lightbox-prev');
    const nextBtn = document.getElementById('lightbox-next');

    let currentIndex = 0;

    function visibleItems() {
        return Array.from(document.querySelectorAll('.gallery-item:not(.hidden)'));
    }

    function openAt(index) {
        const items = visibleItems();
        if (!items.length) return;
        currentIndex = (index + items.length) % items.length;
        const img = items[currentIndex].querySelector('img');
        lightboxImg.src = img.src;
        lightboxImg.alt = img.alt;
        lightboxCaption.textContent = img.alt;
        lightbox.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function close() {
        lightbox.classList.remove('open');
        document.body.style.overflow = '';
        lightboxImg.src = '';
    }

    document.querySelectorAll('.gallery-item').forEach(item => {
        item.addEventListener('click', () => {
            const items = visibleItems();
            const i = items.indexOf(item);
            if (i !== -1) openAt(i);
        });
    });

    closeBtn.addEventListener('click', close);
    prevBtn.addEventListener('click', e => { e.stopPropagation(); openAt(currentIndex - 1); });
    nextBtn.addEventListener('click', e => { e.stopPropagation(); openAt(currentIndex + 1); });
    lightbox.addEventListener('click', e => { if (e.target === lightbox) close(); });

    document.addEventListener('keydown', e => {
        if (!lightbox.classList.contains('open')) return;
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowLeft') openAt(currentIndex - 1);
        if (e.key === 'ArrowRight') openAt(currentIndex + 1);
    });
})();


(function() {
    const buttons = document.querySelectorAll('.btn-filter');
    if (!buttons.length) return;
    const items = document.querySelectorAll('.gallery-item');
    const spanPattern = [4, 3, 2, 3, 2];

    function applySpans() {
        let vi = 0;
        items.forEach(item => {
            if (item.classList.contains('hidden')) {
                item.removeAttribute('data-span');
            } else {
                item.dataset.span = spanPattern[vi % spanPattern.length];
                vi++;
            }
        });
    }

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.dataset.filter;
            items.forEach(item => {
                if (filter === 'all' || item.dataset.category === filter) {
                    item.classList.remove('hidden');
                } else {
                    item.classList.add('hidden');
                }
            });
            applySpans();
        });
    });

    applySpans();
})();


(function () {
    const overlay = document.querySelector('.gallery-more-overlay');
    if (!overlay) return;
    const total = document.querySelectorAll('.event-gallery .gallery-item').length;
    const hidden = total - 4;
    if (hidden <= 0) {
        overlay.style.display = 'none';
    } else {
        overlay.querySelector('span').textContent = '+' + hidden;
    }
})();

const revealEls = document.querySelectorAll('.reveal:not(.reveal--early)');
if (revealEls.length) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal--visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  revealEls.forEach(el => revealObserver.observe(el));
}

const revealEarlyEls = document.querySelectorAll('.reveal--early');
if (revealEarlyEls.length) {
  const earlyObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal--visible');
        earlyObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.02 });

  revealEarlyEls.forEach(el => earlyObserver.observe(el));
}



(function () {
    document.querySelectorAll('.faq-item').forEach(item => {
        const btn = item.querySelector('.faq-question');
        const body = item.querySelector('.faq-body');
        if (!btn || !body) return;

        btn.addEventListener('click', () => {
            const isOpen = item.classList.toggle('faq-item--open');
            body.style.maxHeight = isOpen ? body.scrollHeight + 'px' : '0';
            btn.setAttribute('aria-expanded', isOpen);
        });
    });
})();


(function () {
  const track = document.querySelector('.skating__track');
  if (!track) return;

  const slides = Array.from(track.querySelectorAll('.skating__slide'));
  const prevBtn = document.querySelector('.skating__arrow--prev');
  const nextBtn = document.querySelector('.skating__arrow--next');
  let current = 0;

  function goTo(index) {
    slides[current].classList.remove('skating__slide--active');
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('skating__slide--active');
    if (prevBtn) prevBtn.disabled = current === 0;
    if (nextBtn) nextBtn.disabled = current === slides.length - 1;
  }

  if (prevBtn) prevBtn.addEventListener('click', () => goTo(current - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => goTo(current + 1));

  goTo(0);
})();
