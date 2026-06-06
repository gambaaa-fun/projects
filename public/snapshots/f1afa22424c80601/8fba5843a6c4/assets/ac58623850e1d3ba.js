document.addEventListener('DOMContentLoaded', () => {
    // 1. Mobilní menu (Hamburger toggle)
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const nav = document.querySelector('.nav');
    if (mobileMenuBtn && nav) {
        mobileMenuBtn.addEventListener('click', () => {
            nav.classList.toggle('active');
            mobileMenuBtn.classList.toggle('open');
        });
    }

    // 3. Filtrování portfolia (Galerie)
    const filterButtons = document.querySelectorAll('.filter-btn');
    const portfolioCards = document.querySelectorAll('.portfolio-card');

    if (filterButtons.length > 0 && portfolioCards.length > 0) {
        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Odstranit aktivní třídu ze všech tlačítek a přidat na aktuální
                filterButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                const filterValue = button.getAttribute('data-filter');

                portfolioCards.forEach(card => {
                    // Resetovat animace
                    card.style.animation = 'none';
                    card.offsetHeight; // force reflow

                    const cardCategory = card.getAttribute('data-category');

                    if (filterValue === 'all' || cardCategory === filterValue) {
                        card.style.display = 'block';
                        card.style.animation = 'cardFadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards';
                    } else {
                        card.style.display = 'none';
                    }
                });
            });
        });

        // Automatické filtrování podle URL parametru ?filter=hodiny apod.
        const urlParams = new URLSearchParams(window.location.search);
        const urlFilter = urlParams.get('filter');
        if (urlFilter) {
            const targetButton = Array.from(filterButtons).find(btn => btn.getAttribute('data-filter') === urlFilter);
            if (targetButton) {
                targetButton.click();
            }
        }
    }

    // 4. Prémiové odeslání kontaktního a objednávkového formuláře
    const cleanForms = document.querySelectorAll('.clean-form');
    cleanForms.forEach(form => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();

            const submitBtn = form.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;

            // Efekt načítání na tlačítku
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.7';
            submitBtn.innerHTML = `
                <span style="display: inline-flex; align-items: center; gap: 0.5rem; justify-content: center; width: 100%;">
                    <svg class="spinner" viewBox="0 0 50 50" style="width: 18px; height: 18px; animation: rotate 2s linear infinite; stroke: currentColor; fill: none; display: inline-block;">
                        <circle cx="25" cy="25" r="20" stroke-width="5" stroke-dasharray="80, 200" stroke-dashoffset="0" stroke-linecap="round"></circle>
                    </svg>
                    Odesílám...
                </span>
            `;

            // Simulace API požadavku (1.2 vteřiny)
            setTimeout(() => {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                submitBtn.innerHTML = originalBtnText;

                // Odstranit předchozí zprávu pokud existuje
                const oldMsg = form.querySelector('.form-success-message');
                if (oldMsg) oldMsg.remove();

                // Vytvořit úspěšnou zprávu
                const successMsg = document.createElement('div');
                successMsg.className = 'form-success-message';
                successMsg.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 0.8rem; color: #2e7d32; background: #e8f5e9; border: 1px solid #c8e6c9; padding: 1rem; border-radius: 8px; margin-top: 1rem; animation: slideDown 0.4s ease forwards;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        <div>
                            <strong style="display:block;">Zpráva byla úspěšně odeslána!</strong>
                            <span style="font-size: 0.9rem;">Odpovím vám co nejdříve.</span>
                        </div>
                    </div>
                `;
                
                form.appendChild(successMsg);
                form.reset();

                // Zpráva automaticky zmizí po 6 sekundách
                setTimeout(() => {
                    successMsg.style.animation = 'fadeOut 0.5s ease forwards';
                    setTimeout(() => successMsg.remove(), 500);
                }, 6000);

            }, 1200);
        });
    });

    // 5. Lightbox pro obrázky v "Ochutnávka z dílny"
    const featuredImgWraps = document.querySelectorAll('.featured-img-wrap');
    featuredImgWraps.forEach(wrap => {
        wrap.addEventListener('click', () => {
            const img = wrap.querySelector('img');
            if (!img) return;
            
            const imgSrc = img.getAttribute('src');
            const imgAlt = img.getAttribute('alt') || 'Obrázek';
            
            // Vytvoření lightbox elementu
            const lightbox = document.createElement('div');
            lightbox.className = 'lightbox-overlay';
            lightbox.innerHTML = `
                <button class="lightbox-close" aria-label="Zavřít">&times;</button>
                <img class="lightbox-img" src="${imgSrc}" alt="${imgAlt}">
            `;
            
            document.body.appendChild(lightbox);
            document.body.style.overflow = 'hidden'; // Zamezení scrollování pozadí
            
            // Animace zobrazení
            setTimeout(() => {
                lightbox.classList.add('show');
            }, 10);
            
            // Funkce pro zavření
            const closeLightbox = () => {
                lightbox.classList.remove('show');
                document.body.style.overflow = ''; // Obnovení scrollování
                setTimeout(() => {
                    lightbox.remove();
                }, 300);
            };
            
            // Zavření kliknutím na overlay nebo tlačítko
            lightbox.addEventListener('click', (e) => {
                if (e.target === lightbox || e.target.classList.contains('lightbox-close')) {
                    closeLightbox();
                }
            });
            
            // Zavření klávesou Escape
            const handleEsc = (e) => {
                if (e.key === 'Escape') {
                    closeLightbox();
                    document.removeEventListener('keydown', handleEsc);
                }
            };
            document.addEventListener('keydown', handleEsc);
        });
    });
});
