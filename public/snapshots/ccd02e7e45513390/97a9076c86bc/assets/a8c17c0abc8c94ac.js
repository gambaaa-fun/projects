const hamburger = document.querySelector('.nav__hamburger');
const menu = document.querySelector('.nav__menu'); // tvůj menu element

hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('is-open');
    menu.classList.toggle('is-open');
});