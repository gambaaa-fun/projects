document.addEventListener('DOMContentLoaded', () => {
    // Mobile menu toggle
    const hamburger = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    
    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            
            // Toggle icon between hamburger and close
            const icon = hamburger.querySelector('i');
            if (icon) {
                if (navLinks.classList.contains('active')) {
                    icon.classList.remove('fa-bars');
                    icon.classList.add('fa-times');
                } else {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            }
        });
    }

    // Render Data if containers exist
    renderMoons();
    renderMonsters();
    renderLoot();

    // Add fade-in animation to main elements that don't have it explicitly
    const fadeElements = document.querySelectorAll('.card, .lore-section, .hero-content');
    fadeElements.forEach((el, index) => {
        el.classList.add('fade-in');
        // Stagger animations slightly up to 4 delays
        if (!el.classList.contains('delay-1') && !el.classList.contains('delay-2') && !el.classList.contains('delay-3') && !el.classList.contains('delay-4')) {
            const delay = (index % 4) + 1;
            el.classList.add(`delay-${delay}`);
        }
    });

    // Highlight current page in navigation
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navItems = document.querySelectorAll('.nav-link');
    
    navItems.forEach(item => {
        const href = item.getAttribute('href');
        if (href === currentPage) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
});

function renderMoons() {
    const container = document.getElementById('moons-container');
    if (!container || typeof moonsData === 'undefined') return;
    
    let html = '';
    moonsData.forEach(moon => {
        let badgeClass = moon.difficulty === 'Easy' ? 'badge-easy' : (moon.difficulty === 'Medium' ? 'badge-medium' : 'badge-hard');
        if (moon.difficulty === 'Neutral') badgeClass = 'badge-neutral';
        
        const cardImgHtml = moon.image
            ? `<img class="card-img" src="${moon.image}" alt="${moon.name} map">`
            : `<div class="card-img"><i class="fa-solid ${moon.icon}"></i></div>`;
        
        html += `
        <div class="card fade-in">
            ${cardImgHtml}
            <div class="card-content">
                <span class="badge ${badgeClass}">${moon.difficulty}</span>
                <h3 class="card-title">${moon.name}</h3>
                <p class="card-body">${moon.desc}</p>
                
                <div class="card-stats">
                    <div class="stat-item">
                        <span class="stat-label">Facility</span>
                        <span class="stat-value">${moon.facility}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Mansion</span>
                        <span class="stat-value">${moon.mansion}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Mines</span>
                        <span class="stat-value">${moon.mines}</span>
                    </div>
                </div>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

function renderMonsters() {
    const container = document.getElementById('monsters-container');
    if (!container || typeof monstersData === 'undefined') return;
    
    let html = '';
    let currentType = '';
    
    monstersData.forEach(monster => {
        if (monster.type !== currentType) {
            if (currentType !== '') {
                html += `<div class="section-divider" style="grid-column: 1 / -1; width: 100%; height: 2px; background: linear-gradient(to right, transparent, rgba(255,255,255,0.05), transparent); margin: 1rem 0;"></div>`;
            }
            currentType = monster.type;
            let title = currentType === 'Outside' ? 'Outside Monsters' : 'Inside Monsters';
            html += `<h2 class="section-title" style="grid-column: 1 / -1; width: 100%; margin-bottom: 0.5rem; justify-content: center; font-size: 1.8rem;">${title}</h2>`;
        }
        
        let badgeClass = monster.type === 'Outside' ? 'badge-neutral' : 'badge-hard';
        
        // Render carousel if multiple images exist, otherwise standard card image
        let mediaHtml = '';
        if (monster.images && monster.images.length > 0) {
            let slidesHtml = '';
            let dotsHtml = '';
            monster.images.forEach((img, idx) => {
                const activeClass = idx === 0 ? 'active' : '';
                slidesHtml += `
                <li class="carousel-slide ${activeClass}">
                    <img src="${img}" alt="${monster.name} ${idx + 1}">
                </li>`;
                dotsHtml += `<span class="carousel-dot ${activeClass}" data-slide="${idx}"></span>`;
            });
            
            mediaHtml = `
            <div class="card-carousel">
                <div class="carousel-track-container">
                    <ul class="carousel-track">
                        ${slidesHtml}
                    </ul>
                </div>
                <button class="carousel-btn carousel-btn-prev" aria-label="Previous Slide"><i class="fa-solid fa-chevron-left"></i></button>
                <button class="carousel-btn carousel-btn-next" aria-label="Next Slide"><i class="fa-solid fa-chevron-right"></i></button>
                <div class="carousel-dots">
                    ${dotsHtml}
                </div>
            </div>`;
        } else {
            mediaHtml = `<img class="card-img" src="${monster.image}" alt="${monster.name}">`;
        }
        
        html += `
        <div class="card fade-in">
            ${mediaHtml}
            <div class="card-content">
                <span class="badge ${badgeClass}">${monster.type}</span>
                <h3 class="card-title">${monster.name}</h3>
                <p class="card-body">${monster.desc}</p>
            </div>
        </div>`;
    });
    container.innerHTML = html;
    
    // Initialize carousel event listeners
    initCarouselControls();
}

function initCarouselControls() {
    const container = document.getElementById('monsters-container');
    if (!container) return;

    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.carousel-btn');
        const dot = e.target.closest('.carousel-dot');

        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            const carousel = btn.closest('.card-carousel');
            const slides = Array.from(carousel.querySelectorAll('.carousel-slide'));
            const dots = Array.from(carousel.querySelectorAll('.carousel-dot'));
            const activeSlide = carousel.querySelector('.carousel-slide.active');
            let activeIndex = slides.indexOf(activeSlide);

            if (btn.classList.contains('carousel-btn-prev')) {
                activeIndex = (activeIndex - 1 + slides.length) % slides.length;
            } else {
                activeIndex = (activeIndex + 1) % slides.length;
            }

            updateCarousel(carousel, slides, dots, activeIndex);
        }

        if (dot) {
            e.preventDefault();
            e.stopPropagation();
            const carousel = dot.closest('.card-carousel');
            const slides = Array.from(carousel.querySelectorAll('.carousel-slide'));
            const dots = Array.from(carousel.querySelectorAll('.carousel-dot'));
            const targetIndex = parseInt(dot.getAttribute('data-slide'), 10);

            updateCarousel(carousel, slides, dots, targetIndex);
        }
    });
}

function updateCarousel(carousel, slides, dots, targetIndex) {
    slides.forEach((slide, idx) => {
        if (idx === targetIndex) {
            slide.classList.add('active');
        } else {
            slide.classList.remove('active');
        }
    });

    dots.forEach((dot, idx) => {
        if (idx === targetIndex) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
}

function renderLoot() {
    const container = document.getElementById('loot-container');
    if (!container || typeof lootData === 'undefined') return;
    
    let html = '<div class="database-list fade-in">';
    
    lootData.forEach(item => {
        let badgeClass = item.rarity === 'Common' ? 'badge-neutral' : (item.rarity === 'Uncommon' ? 'badge-easy' : 'badge-medium');
        if (item.rarity === 'Rare') badgeClass = 'badge-medium';
        
        // Build spawns html
        let spawnsHtml = '';
        if (item.spawns && item.spawns.length > 0) {
            item.spawns.forEach((spawn, index) => {
                spawnsHtml += `
                    <div class="spawn-item">
                        <span class="spawn-moon">${spawn.moon}</span>
                        <span class="spawn-divider">&mdash;</span>
                        <span class="spawn-chance">${spawn.chance}</span>
                    </div>
                `;
                if (index < item.spawns.length - 1) {
                    spawnsHtml += `<span class="spawn-separator">|</span>`;
                }
            });
        } else {
            // Fallback just in case some items lack spawns array yet
            spawnsHtml = `
                    <div class="spawn-item">
                        <span class="spawn-moon">${item.best_moon || 'Unknown'}</span>
                        <span class="spawn-divider">&mdash;</span>
                        <span class="spawn-chance">${item.spawn_chance || '?'}</span>
                    </div>
            `;
        }
        
        html += `
        <div class="database-item" onclick="this.classList.toggle('active')">
            <div class="database-header">
                <div class="db-col db-name"><strong>${item.name}</strong></div>
                <div class="db-col db-value">${item.value}</div>
                <div class="db-col db-rarity"><span class="badge ${badgeClass}" style="margin-bottom: 0;">${item.rarity}</span></div>
                <div class="db-col db-toggle"><i class="fa-solid fa-chevron-down transition-icon"></i></div>
            </div>
            <div class="database-details">
                <div class="details-content">
                    <h4 class="details-title">Spawn Locations</h4>
                    <div class="spawns-inline">
                        ${spawnsHtml}
                    </div>
                </div>
            </div>
        </div>
        `;
    });
    
    html += '</div>';
    
    container.innerHTML = html;
}
