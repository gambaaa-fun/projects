

'use strict';


const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];


(function initNav() {
  const header    = $('#nav-header');
  const hamburger = $('#hamburger');
  const mobileMenu = $('#mobile-menu');
  if (!header) return;

  
  const onScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 40);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open');
      hamburger.classList.toggle('open', isOpen);
      hamburger.setAttribute('aria-expanded', isOpen);
      mobileMenu.setAttribute('aria-hidden', !isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    
    $$('.mobile-link').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        mobileMenu.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      });
    });

    
    document.addEventListener('click', e => {
      if (mobileMenu.classList.contains('open') &&
          !mobileMenu.contains(e.target) &&
          !hamburger.contains(e.target)) {
        mobileMenu.classList.remove('open');
        hamburger.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        mobileMenu.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }
    });
  }
})();


(function initSwipers() {
  if (typeof Swiper === 'undefined') return;

  
  if ($('.trending-swiper')) {
    new Swiper('.trending-swiper', {
      slidesPerView: 'auto',
      spaceBetween: 16,
      grabCursor: true,
      pagination: {
        el: '.trending-swiper .swiper-pagination',
        clickable: true,
      },
      breakpoints: {
        640:  { slidesPerView: 2, spaceBetween: 16 },
        1024: { slidesPerView: 3, spaceBetween: 20 },
        1280: { slidesPerView: 4, spaceBetween: 24 },
      },
      a11y: {
        prevSlideMessage: 'Předchozí produkt',
        nextSlideMessage: 'Další produkt',
      },
    });
  }

  
  if ($('.related-swiper')) {
    new Swiper('.related-swiper', {
      slidesPerView: 'auto',
      spaceBetween: 16,
      grabCursor: true,
      pagination: {
        el: '.related-swiper .swiper-pagination',
        clickable: true,
      },
      breakpoints: {
        640:  { slidesPerView: 2, spaceBetween: 16 },
        1024: { slidesPerView: 3, spaceBetween: 20 },
        1280: { slidesPerView: 4, spaceBetween: 24 },
      },
    });
  }
})();


(function initGallery() {
  const galleryEl = document.getElementById('gallery');
  if (!galleryEl || typeof lightGallery === 'undefined') return;

  lightGallery(galleryEl, {
    selector: '.gallery-item',
    speed: 400,
    download: false,
    counter: true,
    mobileSettings: {
      controls: true,
      showCloseIcon: true,
      download: false,
    },
  });
})();


(function initScrollReveal() {
  
  const targets = $$(
    '.product-card, .collection-card, .contact-info-block, .gallery-item, ' +
    '.newsletter-content, .footer-nav, .footer-brand'
  );

  targets.forEach((el, i) => {
    el.classList.add('reveal');
    
    el.style.transitionDelay = `${(i % 4) * 0.07}s`;
  });

  const io = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  targets.forEach(el => io.observe(el));
})();


(function initFilters() {
  const filterPanel  = $('#filter-panel');
  const filterToggle = $('#filter-toggle');
  const grid         = $('#products-grid');
  const countEl      = $('#products-count');
  if (!grid) return;

  
  if (filterToggle && filterPanel) {
    filterToggle.addEventListener('click', () => {
      const isOpen = filterPanel.classList.toggle('open');
      filterToggle.setAttribute('aria-expanded', isOpen);
    });
  }

  let activeCategory = 'all';
  let activeSort     = 'default';

  
  $$('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.filter;
      applyFilters();
    });
  });

  
  $$('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-sort]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSort = btn.dataset.sort;
      applyFilters();
    });
  });

  function applyFilters() {
    const cards = $$('.product-card', grid);

    
    cards.forEach(card => {
      const match = activeCategory === 'all' ||
                    card.dataset.category === activeCategory;
      card.classList.toggle('hidden', !match);
    });

    
    const visible = cards.filter(c => !c.classList.contains('hidden'));

    if (activeSort !== 'default') {
      const sorted = [...visible].sort((a, b) => {
        const pa = parseInt(a.dataset.price, 10);
        const pb = parseInt(b.dataset.price, 10);
        return activeSort === 'price-asc' ? pa - pb : pb - pa;
      });
      sorted.forEach(card => grid.appendChild(card));
    }

    
    const visibleCount = cards.filter(c => !c.classList.contains('hidden')).length;
    if (countEl) countEl.textContent = visibleCount;
  }
})();


(function initProductDetail() {

  
  const thumbs    = $$('.product-thumb');
  const mainImgEl = $('#product-main-img-inner');
  const mainPhoto = $('#product-main-photo');

  if (thumbs.length && mainImgEl && mainPhoto) {
    thumbs.forEach((thumb, idx) => {
      thumb.addEventListener('click', () => {
        thumbs.forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-pressed', 'false');
        });
        thumb.classList.add('active');
        thumb.setAttribute('aria-pressed', 'true');

        const imageSrc = thumb.dataset.image;
        if (imageSrc) {
          mainImgEl.style.opacity = '0';
          mainImgEl.style.transform = 'scale(0.97)';
          setTimeout(() => {
            mainPhoto.src = imageSrc;
            mainImgEl.style.opacity = '1';
            mainImgEl.style.transform = 'scale(1)';
          }, 220);
        }
      });
    });
    mainImgEl.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
  }

  
  const sizeBtns   = $$('.size-btn');
  const selectedSz = $('#selected-size');

  sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sizeBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');
      if (selectedSz) selectedSz.textContent = btn.textContent.trim();
    });
  });

  
  const swatches = $$('.color-swatch');
  swatches.forEach(sw => {
    sw.addEventListener('click', () => {
      swatches.forEach(s => {
        s.classList.remove('active');
        s.setAttribute('aria-checked', 'false');
      });
      sw.classList.add('active');
      sw.setAttribute('aria-checked', 'true');

      
      const label = $('.product-option-label strong');
      if (label) label.textContent = sw.getAttribute('title') || '—';
    });
  });

  
  const qtyMinus = $('#qty-minus');
  const qtyPlus  = $('#qty-plus');
  const qtyValue = $('#qty-value');

  if (qtyMinus && qtyPlus && qtyValue) {
    let qty = 1;
    const update = () => { qtyValue.textContent = qty; };

    qtyMinus.addEventListener('click', () => {
      if (qty > 1) { qty--; update(); }
    });
    qtyPlus.addEventListener('click', () => {
      if (qty < 99) { qty++; update(); }
    });
  }

  
  const addBtn = $('#add-to-cart');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      
      const hasSize = $$('.size-btn').some(b => b.classList.contains('active'));
      if (!hasSize) {
        showToast('Vyberte prosím velikost.', 'error');
        return;
      }
      
      addBtn.textContent = '✓ Přidáno do košíku';
      addBtn.style.background = '#2a6a3a';
      setTimeout(() => {
        addBtn.textContent = 'Přidat do košíku';
        addBtn.style.background = '';
      }, 2200);
      showToast('Produkt přidán do košíku!');
    });
  }

  
  $$('.accordion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const isOpen    = btn.getAttribute('aria-expanded') === 'true';
      const contentId = btn.getAttribute('aria-controls');
      const content   = document.getElementById(contentId);
      if (!content) return;

      
      $$('.accordion-btn').forEach(b => {
        b.setAttribute('aria-expanded', 'false');
        const c = document.getElementById(b.getAttribute('aria-controls'));
        if (c) c.classList.add('accordion-content--closed');
      });

      
      if (!isOpen) {
        btn.setAttribute('aria-expanded', 'true');
        content.classList.remove('accordion-content--closed');
      }
    });
  });
})();


(function initNewsletter() {
  const form     = $('#newsletter-form');
  const emailIn  = $('#email-input');
  const errorEl  = $('#email-error');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    clearError(emailIn, errorEl);

    const val = emailIn.value.trim();
    if (!val) {
      setError(emailIn, errorEl, 'Zadejte e-mailovou adresu.');
      return;
    }
    if (!isValidEmail(val)) {
      setError(emailIn, errorEl, 'Zadejte platnou e-mailovou adresu.');
      return;
    }

    
    emailIn.value = '';
    showToast('Přihlášení k odběru bylo úspěšné! 🎉');
  });
})();


(function initContactForm() {
  const form = $('#contact-form');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    let valid = true;

    
    const name    = $('#contact-name');
    const nameErr = $('#name-error');
    clearError(name, nameErr);
    if (!name.value.trim()) {
      setError(name, nameErr, 'Zadejte své jméno.');
      valid = false;
    }

    
    const email    = $('#contact-email');
    const emailErr = $('#contact-email-error');
    clearError(email, emailErr);
    if (!email.value.trim()) {
      setError(email, emailErr, 'Zadejte e-mailovou adresu.');
      valid = false;
    } else if (!isValidEmail(email.value.trim())) {
      setError(email, emailErr, 'Zadejte platnou e-mailovou adresu.');
      valid = false;
    }

    
    const subject    = $('#contact-subject');
    const subjectErr = $('#subject-error');
    clearError(subject, subjectErr);
    if (!subject.value) {
      setError(subject, subjectErr, 'Vyberte předmět zprávy.');
      valid = false;
    }

    
    const message    = $('#contact-message');
    const messageErr = $('#message-error');
    clearError(message, messageErr);
    if (!message.value.trim()) {
      setError(message, messageErr, 'Napište svou zprávu.');
      valid = false;
    } else if (message.value.trim().length < 10) {
      setError(message, messageErr, 'Zpráva je příliš krátká (min. 10 znaků).');
      valid = false;
    }

    
    const gdpr    = $('#contact-gdpr');
    const gdprErr = $('#gdpr-error');
    clearError(null, gdprErr);
    if (!gdpr.checked) {
      setError(null, gdprErr, 'Souhlas se zpracováním osobních údajů je povinný.');
      valid = false;
    }

    if (!valid) return;

    
    const successEl = $('#form-success');
    if (successEl) {
      successEl.hidden = false;
      successEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    form.reset();
    showToast('Zpráva odeslána! Ozveme se do 24 hodin.');
  });

  
  $$('.form-input', form).forEach(input => {
    input.addEventListener('blur', () => {
      if (input.required && !input.value.trim()) {
        input.classList.add('error');
      } else {
        input.classList.remove('error');
      }
    });
    input.addEventListener('input', () => {
      input.classList.remove('error');
    });
  });
})();


function showToast(msg, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.style.borderColor = type === 'error' ? '#e05c5c' : 'var(--clr-gold)';
  toast.classList.add('show');

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}


function setError(input, errorEl, msg) {
  if (input)   input.classList.add('error');
  if (errorEl) errorEl.textContent = msg;
}

function clearError(input, errorEl) {
  if (input)   input.classList.remove('error');
  if (errorEl) errorEl.textContent = '';
}

function isValidEmail(val) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}


document.addEventListener('click', e => {
  const link = e.target.closest('a[href^="#"]');
  if (!link) return;
  const target = document.querySelector(link.getAttribute('href'));
  if (target) {
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
