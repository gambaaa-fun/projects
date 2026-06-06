document.addEventListener('DOMContentLoaded', () => {

    const mobileToggle = document.querySelector('.mobile-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (mobileToggle && navLinks) {
        mobileToggle.addEventListener('click', () => {
            navLinks.classList.toggle('nav-active');
            mobileToggle.classList.toggle('open');
        });
    }

    let path = window.location.pathname.split('/').pop();
    if (path === '') {
        path = 'index.html';
    }

    const navItems = document.querySelectorAll('.nav-links a');
    navItems.forEach(link => {

        link.classList.remove('active');

        if (link.getAttribute('href') === path) {
            link.classList.add('active');
        }
    });

    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.dot');
    
    if (slides.length > 0) {
        let currentSlide = 0;
        let slideInterval;
        const intervalTime = 5000; // 5 seconds

        const nextBtn = document.querySelector('.slider-next');
        const prevBtn = document.querySelector('.slider-prev');

        const goToSlide = (n) => {

            slides[currentSlide].classList.remove('active');
            if (dots.length > 0) dots[currentSlide].classList.remove('active');

            currentSlide = (n + slides.length) % slides.length;

            slides[currentSlide].classList.add('active');
            if (dots.length > 0) dots[currentSlide].classList.add('active');
        };

        const nextSlide = () => {
            goToSlide(currentSlide + 1);
        };

        const prevSlide = () => {
            goToSlide(currentSlide - 1);
        };

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                nextSlide();
                resetInterval();
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                prevSlide();
                resetInterval();
            });
        }

        dots.forEach((dot, index) => {
            dot.addEventListener('click', () => {
                goToSlide(index);
                resetInterval();
            });
        });

        const startInterval = () => {
            slideInterval = setInterval(nextSlide, intervalTime);
        };

        const resetInterval = () => {
            clearInterval(slideInterval);
            startInterval();
        };

        startInterval();
    }
});

