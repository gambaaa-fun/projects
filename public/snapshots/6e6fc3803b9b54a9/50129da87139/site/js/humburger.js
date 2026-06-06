      const hamburger = document.querySelector('.hamburger');
      const nav = document.querySelector('.header__nav');
      hamburger.addEventListener('click', () => {
        const isOpen = nav.classList.toggle('nav--open');
        hamburger.setAttribute('aria-expanded', isOpen);
      });