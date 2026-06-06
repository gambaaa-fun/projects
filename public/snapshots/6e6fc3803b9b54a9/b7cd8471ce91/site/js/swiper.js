

document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.curses-swiper')) {
        const swiper = new Swiper('.curses-swiper', {
            slidesPerView: 1,
            spaceBetween: 0, // Pro mobilní zobrazení s jedním slidem nastavíme mezeru na 0
            centeredSlides: true,
            loop: true,
            grabCursor: true,
            pagination: {
                el: '.swiper-pagination',
                clickable: true,
            },
            navigation: {
                nextEl: '.swiper-button-next',
                prevEl: '.swiper-button-prev',
            },
            breakpoints: {
                // Pro obrazovky větší než 640px
                640: {
                    slidesPerView: 2,
                    centeredSlides: false,
                    spaceBetween: 24, // Znovu zavedeme mezeru pro více slidů
                },
                900: {
                    slidesPerView: 3,
                    centeredSlides: false,
                    spaceBetween: 24,
                },
                1200: {
                    slidesPerView: 4,
                    centeredSlides: false,
                    spaceBetween: 24,
                },
            },
        });
    }
});