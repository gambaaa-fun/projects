document.addEventListener('DOMContentLoaded', () => {
    // Safe progressive enhancement class switch
    document.documentElement.classList.remove('no-js');
    document.documentElement.classList.add('js');

    // Centralized Scroll Lock Helpers with Layout-Jump Prevention
    const lockBody = () => {
        if (document.body.classList.contains('body--locked')) return;
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        const scrollY = window.scrollY;
        if (scrollbarWidth > 0) {
            document.body.style.paddingRight = `${scrollbarWidth}px`;
            const header = document.querySelector('.header');
            if (header) {
                header.style.paddingRight = `${scrollbarWidth}px`;
            }
        }
        document.body.style.top = `-${scrollY}px`;
        document.body.classList.add('body--locked');
        document.documentElement.classList.add('body--locked');
    };

    const unlockBody = () => {
        const header = document.querySelector('.header');
        const modalOverlay = document.getElementById('metaModal');
        const imageViewer = document.getElementById('imageViewer');

        const isMobileMenuOpen = header && header.classList.contains('header--open');
        const isModalOpen = modalOverlay && modalOverlay.classList.contains('modal--active');
        const isImageViewerOpen = imageViewer && imageViewer.classList.contains('image-viewer--active');

        if (!isMobileMenuOpen && !isModalOpen && !isImageViewerOpen) {
            const scrollY = parseInt(document.body.style.top || '0', 10) * -1;
            document.body.classList.remove('body--locked');
            document.documentElement.classList.remove('body--locked');
            document.body.style.top = '';
            document.body.style.paddingRight = '';
            if (header) {
                header.style.paddingRight = '';
            }
            window.scrollTo(0, scrollY);
        }
    };
    
    // 1. Sticky Navigation & Scroll Effects
    const header = document.querySelector('.header');

    let isScrolling = false;
    window.addEventListener('scroll', () => {
        if (!isScrolling) {
            window.requestAnimationFrame(() => {
                if (header) {
                    if (window.scrollY > 20) {
                        header.classList.add('header--scrolled');
                    } else {
                        header.classList.remove('header--scrolled');
                    }
                }
                isScrolling = false;
            });
            isScrolling = true;
        }
    }, { passive: true });

    // 2. Mobile Menu Toggle
    const mobileBtn = document.querySelector('.header__mobile-btn');
    const headerOverlay = document.querySelector('.header__overlay');

    const toggleMenu = (forceClose = false) => {
        if (!header || !mobileBtn) return;

        const isOpen = header.classList.contains('header--open');
        const willBeOpen = forceClose ? false : !isOpen;

        if (willBeOpen) {
            header.classList.add('header--open');
            mobileBtn.setAttribute('aria-expanded', 'true');
            if (headerOverlay) headerOverlay.classList.add('header__overlay--active');
            lockBody();
        } else {
            header.classList.remove('header--open');
            mobileBtn.setAttribute('aria-expanded', 'false');
            if (headerOverlay) headerOverlay.classList.remove('header__overlay--active');
            unlockBody();
        }
    };

    if (mobileBtn) {
        mobileBtn.addEventListener('click', () => toggleMenu());
    }

    if (headerOverlay) {
        headerOverlay.addEventListener('click', () => toggleMenu(true));
    }

    // Close mobile menu when clicking a link
    const navItems = document.querySelectorAll('.header__nav-link');
    navItems.forEach(item => {
        item.addEventListener('click', () => toggleMenu(true));
    });

    // Set active link based on current page
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    navItems.forEach(link => {
        // Remove hardcoded active class from HTML setup
        link.classList.remove('header__nav-link--active');
        if (link.getAttribute('href') === currentPage || (currentPage === '' && link.getAttribute('href') === 'index.html')) {
            link.classList.add('header__nav-link--active');
        }
    });

    // 3. Scroll Reveal Animations
    const revealElements = document.querySelectorAll('.reveal');

    // Enhance reveal elements by adding transition prep class dynamically
    revealElements.forEach(el => {
        el.classList.add('reveal--prepared');
    });

    const revealOptions = {
        threshold: 0.15,
        rootMargin: "0px 0px -50px 0px"
    };

    const revealOnScroll = new IntersectionObserver(function (entries, observer) {
        entries.forEach(entry => {
            if (!entry.isIntersecting) {
                return;
            } else {
                entry.target.classList.add('reveal--active');
                observer.unobserve(entry.target);
            }
        });
    }, revealOptions);

    revealElements.forEach(el => {
        revealOnScroll.observe(el);
    });

    // 4. Modal / Lightbox Logic for Guide Page
    const modalOverlay = document.getElementById('metaModal');
    const modalClose = document.getElementById('modalClose');
    const modalTitle = document.getElementById('modalTitle');
    const modalImg = document.getElementById('modalImg');
    const modalRegion = document.getElementById('modalRegion');
    const modalText = document.getElementById('modalText');
    const modalTipText = document.getElementById('modalTipText');
    const modalTipBox = document.querySelector('.modal__tip');

    const openModal = (card, imgSrc) => {
        const titleEl = card.querySelector('.meta-card__title');
        const fullContent = card.querySelector('.meta-card__full-content');

        if (!titleEl || !fullContent) return;

        modalTitle.textContent = titleEl.textContent;
        modalImg.src = imgSrc;

        const regionEl = fullContent.querySelector('.modal__region');
        modalRegion.textContent = regionEl ? regionEl.textContent : '';

        const textEl = fullContent.querySelector('.modal__text');
        modalText.textContent = textEl ? textEl.textContent : '';

        const goodForEl = document.getElementById('modalGoodFor');
        const goodForTextEl = document.getElementById('modalGoodForText');
        const goodForSrc = fullContent.querySelector('.modal__good-for span');

        if (goodForEl && goodForTextEl && goodForSrc) {
            goodForTextEl.textContent = goodForSrc.textContent;
            goodForEl.style.display = 'block';
        } else if (goodForEl) {
            goodForEl.style.display = 'none';
        }

        const tipSrc = fullContent.querySelector('.modal__tip div:nth-child(2)');
        if (tipSrc) {
            modalTipText.innerHTML = tipSrc.innerHTML;
            modalTipBox.style.display = 'block';
        } else {
            modalTipBox.style.display = 'none';
        }

        modalOverlay.classList.add('modal--active');
        lockBody();
    };

    const closeModal = () => {
        if (!modalOverlay) return;
        modalOverlay.classList.remove('modal--active');
        unlockBody();
    };

    // Attach click events to all meta cards
    const metaCards = document.querySelectorAll('.meta-card');

    // Image viewer logic
    const imageViewer = document.getElementById('imageViewer');
    const imageViewerImg = document.getElementById('imageViewerImg');

    const openImageViewer = (imgSrc) => {
        if (!imageViewer || !imageViewerImg) return;
        imageViewerImg.src = imgSrc;
        imageViewer.classList.add('image-viewer--active');
        lockBody();
    };

    const closeImageViewer = () => {
        if (!imageViewer) return;
        imageViewer.classList.remove('image-viewer--active');
        unlockBody();
    };

    if (imageViewer) {
        imageViewer.addEventListener('click', closeImageViewer);
    }

    // Modal images enlarge on click
    if (modalImg) {
        modalImg.addEventListener('click', () => {
            openImageViewer(modalImg.src);
        });
        modalImg.style.cursor = 'zoom-in';
    }

    metaCards.forEach(card => {
        const btn = card.querySelector('.btn');
        const img = card.querySelector('.meta-card__img');

        if (btn && img) {
            const handler = (e) => {
                e.preventDefault();
                openModal(card, img.src);
            };
            btn.addEventListener('click', handler);

            img.addEventListener('click', () => {
                openImageViewer(img.src);
            });
            img.style.cursor = 'zoom-in';
        }
    });

    if (modalClose) {
        modalClose.addEventListener('click', closeModal);
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeModal();
            }
        });
    }

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (imageViewer && imageViewer.classList.contains('image-viewer--active')) {
                closeImageViewer();
            } else if (modalOverlay && modalOverlay.classList.contains('modal--active')) {
                closeModal();
            }
        }
    });

    // 5. Initialize Swiper Carousel
    const swiperEl = document.querySelector('.practical-carousel');
    if (swiperEl && typeof Swiper !== 'undefined') {
        new Swiper('.practical-carousel', {
            slidesPerView: 1,
            spaceBetween: 20,
            loop: true,
            pagination: {
                el: '.swiper-pagination',
                clickable: true,
            },
            navigation: {
                nextEl: '.swiper-button-next',
                prevEl: '.swiper-button-prev',
            }
        });

        // Add image viewer to carousel images
        const carouselImages = document.querySelectorAll('.carousel__img');
        carouselImages.forEach(img => {
            img.addEventListener('click', () => {
                openImageViewer(img.src);
            });
            img.style.cursor = 'zoom-in';
        });
    }
});