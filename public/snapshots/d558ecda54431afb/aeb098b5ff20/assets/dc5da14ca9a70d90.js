document.addEventListener('DOMContentLoaded', () => {
  const carousel = document.getElementById('sestavyCarousel');

  if (!carousel) return;

  const track = carousel.querySelector('.carousel-track');
  const slides = carousel.querySelectorAll('.carousel-slide');
  const pagination = carousel.querySelector('.carousel-pagination');

  if (slides.length === 0) return;


  track.style.width = `${slides.length * 100}%`;
  slides.forEach(slide => {
    slide.style.width = `${100 / slides.length}%`;
  });


  slides.forEach((_, index) => {
    const dot = document.createElement('div');
    dot.classList.add('carousel-dot');


    if (index === 0) dot.classList.add('active');


    dot.addEventListener('click', () => {
      goToSlide(index);
    });

    pagination.appendChild(dot);
  });

  const dots = pagination.querySelectorAll('.carousel-dot');


  function goToSlide(index) {

    const translateX = -(100 / slides.length) * index;
    track.style.transform = `translateX(${translateX}%)`;


    dots.forEach(dot => dot.classList.remove('active'));
    dots[index].classList.add('active');
  }
});
