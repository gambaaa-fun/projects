import Swiper from 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.mjs';
//import { Navigation } from 'swiper/modules';
/*import 'swiper/css';
import 'swiper/css/navigation';*/

document.addEventListener("DOMContentLoaded", () => {
  let hamelmnts = document.querySelectorAll(".hamburger-zone");
  for (const btn of document.querySelectorAll(".hamburger")) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      for (const element of hamelmnts) {
        element.classList.toggle("active");
      }
    });
  }
});


const swiper = new Swiper('.swiper', {
  loop: true,
  navigation: {
    nextEl: '.swiper-button-next',
    prevEl: '.swiper-button-prev',
  },
});
