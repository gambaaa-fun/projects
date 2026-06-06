// Detekuje jazyk ze <html lang="...">
const LANG = document.documentElement.lang === 'en' ? 'en' : 'cs';
const CUR  = LANG === 'en' ? 'CZK' : 'Kč';

// ── LED pásky ──────────────────────────────────────────────
let currentLength = 1, currentPrice = 490, currentQty = 1;
let cartItems = [];

function refreshPrice() {
    const el = document.getElementById('strip-price-value');
    if (el) el.textContent = currentPrice + ' ' + CUR;
}

window.selectLength = function(btn) {
    btn.closest('.length-options').querySelectorAll('.length-btn')
       .forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentLength = +btn.dataset.meters;
    currentPrice  = +btn.dataset.price;
    refreshPrice();
};

window.changeQty = function(delta) {
    currentQty = Math.max(1, currentQty + delta);
    const el = document.getElementById('qty-display');
    if (el) el.textContent = currentQty;
};

window.addToCart = function() {
    cartItems.push({ length: currentLength, price: currentPrice, qty: currentQty });
    updateCartDisplay();
    currentQty = 1;
    const el = document.getElementById('qty-display');
    if (el) el.textContent = currentQty;
};

function updateCartDisplay() {
    const summary = document.getElementById('cart-summary');
    const text    = document.getElementById('cart-text');
    if (!summary || !text) return;
    if (cartItems.length === 0) { summary.style.display = 'none'; return; }
    const total = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
    const desc  = cartItems.map(i => i.qty + 'x ' + i.length + 'm').join(', ');
    text.textContent = desc + ' (' + total + ' ' + CUR + ')';
    summary.style.display = 'block';
}

window.checkout = function() {
    if (!cartItems.length) return;
    alert(LANG === 'en'
        ? 'Thank you for your order! We will contact you soon.'
        : 'Děkujeme za objednávku! Brzy vás budeme kontaktovat.');
    cartItems = [];
    updateCartDisplay();
};

// ── Galerie ────────────────────────────────────────────────
function initGalleries() {
    document.querySelectorAll('.gallery').forEach(gallery => {
        const slides  = gallery.querySelectorAll('.gallery-slide');
        const counter = gallery.querySelector('.gallery-counter');
        let current = 0;

        function showSlide(n) {
            slides[current].classList.remove('active');
            current = (n + slides.length) % slides.length;
            slides[current].classList.add('active');
            if (counter) counter.textContent = (current + 1) + ' / ' + slides.length;
        }

        gallery.querySelector('.gallery-prev').addEventListener('click', () => showSlide(current - 1));
        gallery.querySelector('.gallery-next').addEventListener('click', () => showSlide(current + 1));
        slides.forEach((slide, i) => {
            slide.querySelector('img').addEventListener('click', () => openLightbox(gallery, i));
        });
    });
}

// ── Lightbox ───────────────────────────────────────────────
function openLightbox(gallery, startIndex) {
    const imgs = Array.from(gallery.querySelectorAll('.gallery-slide img'));
    let idx = startIndex;

    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `
        <div class="lightbox-overlay"></div>
        <div class="lightbox-content">
            <button class="lightbox-close">✕</button>
            <button class="lightbox-prev">&#8592;</button>
            <img class="lightbox-img" src="" alt="">
            <button class="lightbox-next">&#8594;</button>
            <div class="lightbox-counter"></div>
        </div>`;
    document.body.appendChild(lb);

    const lbImg     = lb.querySelector('.lightbox-img');
    const lbCounter = lb.querySelector('.lightbox-counter');

    function show(n) {
        idx = (n + imgs.length) % imgs.length;
        lbImg.src = imgs[idx].src;
        lbImg.alt = imgs[idx].alt;
        lbCounter.textContent = (idx + 1) + ' / ' + imgs.length;
    }

    lb.querySelector('.lightbox-prev').addEventListener('click', () => show(idx - 1));
    lb.querySelector('.lightbox-next').addEventListener('click', () => show(idx + 1));
    lb.querySelector('.lightbox-close').addEventListener('click', () => lb.remove());
    lb.querySelector('.lightbox-overlay').addEventListener('click', () => lb.remove());
    document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'ArrowLeft')  show(idx - 1);
        if (e.key === 'ArrowRight') show(idx + 1);
        if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', onKey); }
    });

    show(idx);
    requestAnimationFrame(() => lb.classList.add('active'));
}

document.addEventListener('DOMContentLoaded', () => {
    refreshPrice();
    initGalleries();
});