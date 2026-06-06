import Swiper from 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.mjs';

const swiper = new Swiper('.swiper', {
  loop: true,
  slidesPerView: 1,
  spaceBetween: 20,
  centeredSlides: false,
  navigation: {
    nextEl: '.swiper-button-next',
    prevEl: '.swiper-button-prev',
  },
  breakpoints: {
    600: { slidesPerView: 2 },
  },
});

const hamburgerBtn = document.querySelector('.hamburger');

hamburgerBtn.addEventListener('click', () => {
    hamburgerBtn.classList.toggle('active');
});

window.addEventListener('resize', () => {
    if (window.innerWidth >= 960) {
        hamburgerBtn.classList.remove('active');
        
    }
});





