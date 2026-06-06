/* Generic slider initializer for carousels and horizontal card galleries */
(function(){
    // Carousel slides (hero) initialization — only run if present
    const slides = document.querySelectorAll('.carousel__slide');
    if(slides.length){
        const dots = document.querySelectorAll('.carousel__indicator');
        const prev = document.querySelector('.carousel__button--prev');
        const next = document.querySelector('.carousel__button--next');
        let currentIndex = 0;

        function setSlide(index) {
            currentIndex = (index + slides.length) % slides.length;
            slides.forEach((slide, i) => slide.classList.toggle('active', i === currentIndex));
            dots.forEach((dot, i) => dot.classList.toggle('active', i === currentIndex));
        }

        if(prev) prev.addEventListener('click', () => setSlide(currentIndex - 1));
        if(next) next.addEventListener('click', () => setSlide(currentIndex + 1));
        dots.forEach((dot, index) => dot.addEventListener('click', () => setSlide(index)));

        let intervalId = setInterval(() => setSlide(currentIndex + 1), 7000);
        const carousel = document.querySelector('.weapon__carousel');
        if(carousel){
            carousel.addEventListener('mouseenter', () => clearInterval(intervalId));
            carousel.addEventListener('mouseleave', () => intervalId = setInterval(() => setSlide(currentIndex + 1), 7000));
        }
    }

    // Make card galleries horizontally scrollable with mouse wheel for convenience
    const galleries = document.querySelectorAll('.card__gallery');
    galleries.forEach(gallery => {
        gallery.style.scrollBehavior = 'smooth';
        gallery.addEventListener('wheel', (e) => {
            if(Math.abs(e.deltaY) < Math.abs(e.deltaX)) return; // let native horizontal scroll pass
            e.preventDefault();
            gallery.scrollBy({ left: e.deltaY, behavior: 'smooth' });
        }, { passive: false });
    });
})();
