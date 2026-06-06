
import Swiper from 'swiper/bundle';

// import styles bundle
import 'swiper/css/bundle';




const swiper = new Swiper('.swiper', {
  slidesPerView: 2,
  speed: 200,
  centeredSlides: true,
  loop: true,
  effect: "flip",
  navigation: {
    nextEl: ".swiper-button-next",
    prevEl: ".swiper-button-prev"
  }
});