document.addEventListener('DOMContentLoaded', () => {
    const hamburger = document.querySelector('.header__hamburger');
    const nav = document.querySelector('.nav');

    if (hamburger && nav) {
        hamburger.addEventListener('click', () => {
            nav.classList.toggle('nav--open');
        });
    }
    // Accordion for product detail
    const accordions = document.querySelectorAll('.product-detail__section--accordion');

    accordions.forEach(acc => {
        const title = acc.querySelector('.product-detail__section-title');
        title.addEventListener('click', () => {
            acc.classList.toggle('product-detail__section--open');
        });
    });
    // LightGallery initialization
    const gallery = document.getElementById('lightgallery');
    if (gallery) {
        lightGallery(gallery, {
            speed: 500,
            plugins: [lgThumbnail],
            licenseKey: '0000-0000-000-0000' // Using default/no key for open source
        });
    }
});
