// --- products.html: Filtering and sorting on top of static HTML ---
// Without JS: all products are visible, filter links navigate normally
// With JS: filtering shows/hides cards client-side, sorting reorders DOM

document.addEventListener('DOMContentLoaded', () => {
    const gridContainer = document.getElementById('product-grid');
    if (!gridContainer) return;

    const sortSelect = document.getElementById('sort-select');
    const filterBtns = document.querySelectorAll('.filter-btn');

    // Store original DOM order for resetting to "default" sort
    const allCards = [...gridContainer.querySelectorAll('.product-card')];
    allCards.forEach((card, i) => card.dataset.originalIndex = i);

    let currentCategory = 'all';
    let currentSort = 'default';

    // Read category from URL on load
    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get('category');
    if (categoryParam) currentCategory = categoryParam;

    // --- Core: apply current filter + sort state to the DOM ---
    const applyState = () => {
        const cards = [...gridContainer.querySelectorAll('.product-card')];

        // 1. Filter: show/hide by data-categories
        cards.forEach(card => {
            const cats = (card.dataset.categories || '').split(',');
            card.style.display = (currentCategory === 'all' || cats.includes(currentCategory)) ? '' : 'none';
        });

        // 2. Sort: reorder visible cards
        const visibleCards = cards.filter(c => c.style.display !== 'none');
        const sorted = [...visibleCards].sort((a, b) => {
            if (currentSort === 'price-asc')  return parseInt(a.dataset.price) - parseInt(b.dataset.price);
            if (currentSort === 'price-desc') return parseInt(b.dataset.price) - parseInt(a.dataset.price);
            if (currentSort === 'heat-asc')   return parseInt(a.dataset.heat)  - parseInt(b.dataset.heat);
            if (currentSort === 'heat-desc')  return parseInt(b.dataset.heat)  - parseInt(a.dataset.heat);
            // default: restore original DOM order
            return parseInt(a.dataset.originalIndex) - parseInt(b.dataset.originalIndex);
        });
        sorted.forEach(card => gridContainer.appendChild(card));

        // 3. Update active filter button styling
        filterBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === currentCategory);
        });
    };

    // Apply initial state (e.g. from URL ?category=hot)
    applyState();

    // --- Filter button clicks (prevent navigation, filter in-place) ---
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            currentCategory = e.currentTarget.dataset.category;
            const newUrl = new URL(window.location);
            if (currentCategory === 'all') newUrl.searchParams.delete('category');
            else newUrl.searchParams.set('category', currentCategory);
            window.history.pushState({}, '', newUrl);
            applyState();
        });
    });

    // --- Sort select ---
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            applyState();
        });
    }

    // --- Cart listeners ---
    const attachCartListeners = () => {
        document.querySelectorAll('.btn-add-to-cart').forEach(btn => {
            // Avoid duplicate listeners
            if (btn.dataset.listenerAttached) return;
            btn.dataset.listenerAttached = '1';
            btn.addEventListener('click', (e) => {
                const button = e.currentTarget;
                const card = button.closest('.product-card');
                const qtyInput = card ? card.querySelector('.grid-qty-input') : null;
                const qty = qtyInput ? (parseInt(qtyInput.value) || 1) : 1;
                addToCart({
                    id: button.dataset.id,
                    title: button.dataset.title,
                    price: parseInt(button.dataset.price),
                    img: button.dataset.img,
                    qty
                });
                const originalText = button.innerHTML;
                button.innerHTML = '<i class="icon icon-cart"></i>';
                button.style.backgroundColor = '#28a745';
                button.style.color = 'white';
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.style.backgroundColor = '';
                    button.style.color = '';
                }, 1500);
            });
        });
    };

    attachCartListeners();
});
