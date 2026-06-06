const Hamburger = document.getElementById('Hamburger');
const Menu = document.getElementById('Menu');

    Hamburger.addEventListener('click', () => {
        Menu.classList.toggle('Hamburger__HamburgerMenu--open');
        Hamburger.classList.toggle('Active');
    });