const CATEGORY_LABELS = {
    polycarbonate: 'Polycarbonate',
    glass: 'Glass',
    'lean-to': 'Lean-to',
    mini: 'Mini & Cold Frames',
    custom: 'Custom',
    accessories: 'Accessories',
};

const DEFAULT_GALLERY = [
    'images/product-gallery/exterior.png',
    'images/product-gallery/interior.png',
    'images/product-gallery/side.png',
    'images/product-gallery/detail.png',
];

const GALLERY_LABELS = ['Exterior view', 'Interior view', 'Side view', 'Frame detail'];

function normalizeImagePath(path) {
    if (!path) return '';
    return path.startsWith('/') ? path.slice(1) : path;
}

function buildGalleryUrls(mainImage) {
    const params = new URLSearchParams(window.location.search);
    const imagesParam = params.get('images');
    if (imagesParam) {
        return imagesParam.split(',').map((p) => normalizeImagePath(p.trim())).filter(Boolean);
    }

    const main = normalizeImagePath(mainImage);
    if (main) {
        return [main, ...DEFAULT_GALLERY.slice(1)];
    }

    return [...DEFAULT_GALLERY];
}

function initProductGallery(urls, productName) {
    const track = document.getElementById('product-gallery-track');
    const thumbs = document.getElementById('product-gallery-thumbs');
    const gallery = document.getElementById('product-gallery');
    if (!track || !urls.length) return;

    let slideIndex = 0;

    track.innerHTML = urls
        .map((src, i) => {
            const label = GALLERY_LABELS[i] || `View ${i + 1}`;
            const imgClass = i === 0 ? 'product-image product-gallery-img' : 'product-gallery-img';
            return `
                <div class="product-gallery-slide${i === 0 ? ' is-active' : ''}" data-index="${i}">
                    <img src="${src}" alt="${productName ? productName + ' — ' + label : label}" class="${imgClass}">
                </div>
            `;
        })
        .join('');

    if (thumbs) {
        thumbs.innerHTML = urls
            .map(
                (src, i) => `
            <button type="button" class="product-gallery-thumb${i === 0 ? ' is-active' : ''}"
                data-index="${i}" role="tab" aria-selected="${i === 0}" aria-label="Show image ${i + 1}">
                <img src="${src}" alt="">
            </button>
        `
            )
            .join('');
    }

    const slides = track.querySelectorAll('.product-gallery-slide');
    const thumbBtns = thumbs ? thumbs.querySelectorAll('.product-gallery-thumb') : [];

    function goToSlide(index) {
        slideIndex = (index + urls.length) % urls.length;
        slides.forEach((slide, i) => {
            slide.classList.toggle('is-active', i === slideIndex);
        });
        thumbBtns.forEach((btn, i) => {
            btn.classList.toggle('is-active', i === slideIndex);
            btn.setAttribute('aria-selected', i === slideIndex ? 'true' : 'false');
        });
    }

    gallery?.querySelector('.product-gallery-prev')?.addEventListener('click', () => goToSlide(slideIndex - 1));
    gallery?.querySelector('.product-gallery-next')?.addEventListener('click', () => goToSlide(slideIndex + 1));

    thumbBtns.forEach((btn) => {
        btn.addEventListener('click', () => goToSlide(parseInt(btn.dataset.index, 10)));
    });

    let touchStartX = 0;
    const viewport = gallery?.querySelector('.product-gallery-viewport');
    viewport?.addEventListener(
        'touchstart',
        (e) => {
            touchStartX = e.changedTouches[0].screenX;
        },
        { passive: true }
    );
    viewport?.addEventListener(
        'touchend',
        (e) => {
            const diff = e.changedTouches[0].screenX - touchStartX;
            if (Math.abs(diff) > 40) {
                goToSlide(diff < 0 ? slideIndex + 1 : slideIndex - 1);
            }
        },
        { passive: true }
    );

    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') goToSlide(slideIndex - 1);
        if (e.key === 'ArrowRight') goToSlide(slideIndex + 1);
    });
}

function initProductPage() {
    const article = document.querySelector('.product-detail');
    if (!article) return;

    const params = new URLSearchParams(window.location.search);
    const name = params.get('name');
    const price = params.get('price');
    const image = params.get('image');
    const desc = params.get('desc');
    const category = params.get('category');

    const nameEl = article.querySelector('.product-name');
    const priceEl = article.querySelector('.product-price');
    const descEl = article.querySelector('.product-desc');
    const breadcrumbCurrent = document.getElementById('breadcrumb-current');
    const breadcrumbCategoryLink = document.getElementById('breadcrumb-category-link');

    const productName = name || 'Greenhouse';

    if (name && nameEl) {
        nameEl.textContent = name;
        document.title = `${name} | Sklénikum`;
        if (breadcrumbCurrent) breadcrumbCurrent.textContent = name;
    }
    if (price && priceEl) priceEl.textContent = price;
    if (desc && descEl) descEl.textContent = desc;

    const galleryUrls = buildGalleryUrls(image);
    initProductGallery(galleryUrls, productName);

    if (category && breadcrumbCategoryLink) {
        const label = CATEGORY_LABELS[category] || category;
        breadcrumbCategoryLink.textContent = label;
        breadcrumbCategoryLink.href = `index.html#${category}`;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProductPage);
} else {
    initProductPage();
}
