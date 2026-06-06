function initNavDropdown() {
    const dropdownItem = document.querySelector('.nav-item.has-dropdown');
    if (!dropdownItem) return;

    const dropdownLink = dropdownItem.querySelector('.nav-link');
    const categoryLinks = dropdownItem.querySelectorAll('.nav-dropdown a');

    dropdownItem.addEventListener('mouseenter', () => {
        if (window.matchMedia('(hover: hover)').matches) {
            dropdownItem.classList.add('active');
        }
    });

    dropdownItem.addEventListener('mouseleave', () => {
        if (window.matchMedia('(hover: hover)').matches) {
            dropdownItem.classList.remove('active');
        }
    });

    dropdownLink.addEventListener('click', (e) => {
        if (window.matchMedia('(hover: none)').matches) {
            e.preventDefault();
            e.stopPropagation();
            dropdownItem.classList.toggle('active');
        }
    });

    categoryLinks.forEach((link) => {
        link.addEventListener('click', () => {
            dropdownItem.classList.remove('active');
        });
    });

    document.addEventListener('click', (e) => {
        if (!dropdownItem.contains(e.target)) {
            dropdownItem.classList.remove('active');
        }
    });
}

function initProductCardLinks() {
    document.querySelectorAll('.product-card').forEach((card) => {
        const link = card.querySelector('.card-link');
        const nameEl = card.querySelector('.product-name');
        const priceEl = card.querySelector('.product-price');
        const imgEl = card.querySelector('.product-image');
        if (!link || !nameEl || !priceEl) return;

        const name = nameEl.textContent.trim();
        const price = priceEl.textContent.trim();
        const image = imgEl ? imgEl.getAttribute('src') : '';
        const descEl = card.querySelector('.product-desc');
        const desc = descEl ? descEl.textContent.trim() : '';
        const section = card.closest('section.category');
        const category = section?.id || '';

        const params = new URLSearchParams({ name, price, image, desc });
        if (category) params.set('category', category);
        const href = link.getAttribute('href') || 'product_greenhouse.html';
        const base = href.split('?')[0];
        link.href = `${base}?${params.toString()}`;
    });
}

function initSite() {
    initNavDropdown();
    initProductCardLinks();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSite);
} else {
    initSite();
}
