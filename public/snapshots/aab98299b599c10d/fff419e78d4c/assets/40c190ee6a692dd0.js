const CART_STORAGE_KEY = 'sklenikum-cart';

const CART_UI_HTML = `
    <div id="cart-overlay" class="cart-overlay" aria-hidden="true"></div>
    <aside id="cart-panel" class="cart-panel" aria-label="Shopping cart" aria-hidden="true">
        <div class="cart-header">
            <h2 class="cart-title">Your Cart</h2>
            <button type="button" class="cart-close" aria-label="Close cart">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        <div class="cart-body">
            <p id="cart-empty" class="cart-empty">Your cart is empty.</p>
            <ul id="cart-items" class="cart-items"></ul>
        </div>
        <div class="cart-footer" hidden>
            <div class="cart-subtotal-row">
                <span>Subtotal</span>
                <span id="cart-subtotal">$0</span>
            </div>
            <button type="button" id="cart-checkout" class="cart-checkout-btn">Checkout</button>
            <button type="button" id="cart-clear" class="cart-clear-btn">Clear cart</button>
        </div>
    </aside>
    <div id="modal-remove" class="cart-modal" role="dialog" aria-modal="true" aria-labelledby="modal-remove-title" hidden>
        <div class="cart-modal-backdrop" data-modal-close></div>
        <div class="cart-modal-box">
            <h3 id="modal-remove-title" class="cart-modal-title">Remove item?</h3>
            <p id="modal-remove-text" class="cart-modal-text">Are you sure you want to remove this item from your cart?</p>
            <div class="cart-modal-actions">
                <button type="button" class="cart-modal-btn cart-modal-btn-secondary" data-modal-close>Cancel</button>
                <button type="button" id="modal-remove-confirm" class="cart-modal-btn cart-modal-btn-danger">Remove</button>
            </div>
        </div>
    </div>
    <div id="modal-added" class="cart-modal" role="dialog" aria-modal="true" aria-labelledby="modal-added-title" hidden>
        <div class="cart-modal-backdrop" data-modal-close></div>
        <div class="cart-modal-box">
            <h3 id="modal-added-title" class="cart-modal-title">Added to cart</h3>
            <p id="modal-added-text" class="cart-modal-text"></p>
            <div class="cart-modal-actions cart-modal-actions-stack">
                <button type="button" id="modal-added-checkout" class="cart-modal-btn cart-modal-btn-primary">Proceed to checkout</button>
                <button type="button" id="modal-added-continue" class="cart-modal-btn cart-modal-btn-secondary">Keep shopping</button>
            </div>
        </div>
    </div>
`;

function injectCartUI() {
    if (document.getElementById('cart-panel')) return;
    document.body.insertAdjacentHTML('beforeend', CART_UI_HTML);
}

function slugify(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
}

function parsePrice(priceText) {
    const match = String(priceText).replace(/,/g, '').match(/[\d.]+/);
    return match ? parseFloat(match[0]) : 0;
}

function formatPrice(amount) {
    return '$' + amount.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function loadCart() {
    try {
        const raw = localStorage.getItem(CART_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveCart(items) {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
}

function getCartCount(items) {
    return items.reduce((sum, item) => sum + item.quantity, 0);
}

function getCartSubtotal(items) {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function getProductFromCard(card) {
    const nameEl = card.querySelector('.product-name');
    const priceEl = card.querySelector('.product-price');
    const imgEl = card.querySelector('.product-image');
    if (!nameEl || !priceEl) return null;

    const name = nameEl.textContent.trim();
    return {
        id: slugify(name),
        name,
        price: parsePrice(priceEl.textContent),
        image: imgEl ? imgEl.getAttribute('src') : '',
    };
}

function getProductFromDetail() {
    const article = document.querySelector('.product-detail');
    if (!article) return null;

    const nameEl = article.querySelector('.product-name');
    const priceEl = article.querySelector('.product-price');
    const imgEl = article.querySelector('.product-image');
    if (!nameEl || !priceEl) return null;

    const name = nameEl.textContent.trim();
    const image = imgEl ? imgEl.getAttribute('src') : '';

    return {
        id: slugify(name),
        name,
        price: parsePrice(priceEl.textContent),
        image,
    };
}

function addToCart(product) {
    const items = loadCart();
    const existing = items.find((item) => item.id === product.id);
    if (existing) {
        existing.quantity += 1;
    } else {
        items.push({ ...product, quantity: 1 });
    }
    saveCart(items);
    return items;
}

function updateQuantity(id, delta) {
    const items = loadCart();
    const item = items.find((i) => i.id === id);
    if (!item) return items;

    item.quantity += delta;
    const filtered = items.filter((i) => i.quantity > 0);
    saveCart(filtered);
    return filtered;
}

function removeFromCart(id) {
    const items = loadCart().filter((i) => i.id !== id);
    saveCart(items);
    return items;
}

function clearCart() {
    saveCart([]);
    return [];
}

function getCartActionHost(el) {
    if (!el) return null;
    if (el.classList.contains('product-card') || el.classList.contains('product-detail-info')) {
        return el;
    }
    return el.closest('.product-card') || el.closest('.product-detail-info');
}

function getProductFromHost(host) {
    if (!host) return null;
    if (host.classList.contains('product-detail-info')) {
        return getProductFromDetail();
    }
    return getProductFromCard(host);
}

function getDefaultAddHtml(host) {
    if (!host.dataset.defaultAddHtml) {
        const btn = host.querySelector('.add-to-cart');
        host.dataset.defaultAddHtml = btn
            ? btn.innerHTML.trim()
            : 'Add to cart <i class="fa-solid fa-bag-shopping"></i>';
    }
    return host.dataset.defaultAddHtml;
}

function createAddButton(host) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'add-to-cart';
    btn.innerHTML = getDefaultAddHtml(host);
    btn.setAttribute('aria-label', 'Add to cart');
    return btn;
}

function createQtyControl(productId, qty) {
    const div = document.createElement('div');
    div.className = 'card-qty-control';
    div.dataset.productId = productId;
    div.innerHTML = `
        <button type="button" class="card-qty-btn card-qty-decrease" aria-label="Decrease quantity">−</button>
        <span class="card-qty-value" aria-live="polite">${qty}</span>
        <button type="button" class="card-qty-btn card-qty-increase" aria-label="Increase quantity">+</button>
    `;
    return div;
}

function updateAddToCartButtons(items) {
    const qtyById = Object.fromEntries(items.map((item) => [item.id, item.quantity]));
    const hosts = new Set();

    document.querySelectorAll('.product-card').forEach((el) => hosts.add(el));
    document.querySelectorAll('.product-detail-info').forEach((el) => hosts.add(el));

    hosts.forEach((host) => {
        if (host.querySelector('.custom-build')) return;

        const product = getProductFromHost(host);
        if (!product) return;

        const qty = qtyById[product.id] || 0;
        const control = host.querySelector('.card-qty-control');
        const addBtn = host.querySelector('.add-to-cart:not(.custom-build)');
        const actionEl = control || addBtn;

        if (qty > 0) {
            if (control) {
                control.querySelector('.card-qty-value').textContent = qty;
                control.dataset.productId = product.id;
            } else if (actionEl) {
                actionEl.replaceWith(createQtyControl(product.id, qty));
            }
        } else if (control) {
            control.replaceWith(createAddButton(host));
        }
    });
}

function initCart() {
    injectCartUI();

    const cartBtn = document.querySelector('.cart-btn');
    const cartCount = document.querySelector('.cart-count');
    const cartPanel = document.getElementById('cart-panel');
    const cartOverlay = document.getElementById('cart-overlay');
    const cartClose = document.querySelector('.cart-close');
    const cartItemsEl = document.getElementById('cart-items');
    const cartSubtotalEl = document.getElementById('cart-subtotal');
    const cartEmptyEl = document.getElementById('cart-empty');
    const cartFooter = document.querySelector('.cart-footer');
    const clearCartBtn = document.getElementById('cart-clear');
    const checkoutBtn = document.getElementById('cart-checkout');

    const modalRemove = document.getElementById('modal-remove');
    const modalRemoveText = document.getElementById('modal-remove-text');
    const modalRemoveConfirm = document.getElementById('modal-remove-confirm');
    const modalAdded = document.getElementById('modal-added');
    const modalAddedText = document.getElementById('modal-added-text');
    const modalAddedCheckout = document.getElementById('modal-added-checkout');
    const modalAddedContinue = document.getElementById('modal-added-continue');

    if (!cartBtn || !cartPanel) return;

    let removeConfirmCallback = null;
    let activeModal = null;

    function updateBadge(items) {
        const count = getCartCount(items);
        if (cartCount) {
            cartCount.textContent = count;
            cartCount.hidden = count === 0;
        }
    }

    function renderCart(items) {
        updateBadge(items);
        updateAddToCartButtons(items);
        const subtotal = getCartSubtotal(items);
        const isEmpty = items.length === 0;

        if (cartEmptyEl) cartEmptyEl.hidden = !isEmpty;
        if (cartFooter) cartFooter.hidden = isEmpty;
        if (cartSubtotalEl) cartSubtotalEl.textContent = formatPrice(subtotal);

        if (!cartItemsEl) return;
        cartItemsEl.innerHTML = '';

        items.forEach((item) => {
            const li = document.createElement('li');
            li.className = 'cart-item';
            li.dataset.id = item.id;

            const imgSrc = item.image || 'images/accessories.png';
            li.innerHTML = `
                <img class="cart-item-image" src="${imgSrc}" alt="">
                <div class="cart-item-details">
                    <span class="cart-item-name">${item.name}</span>
                    <span class="cart-item-price">${formatPrice(item.price)}</span>
                    <div class="cart-item-qty">
                        <button type="button" class="qty-btn qty-decrease" aria-label="Decrease quantity">−</button>
                        <span class="qty-value">${item.quantity}</span>
                        <button type="button" class="qty-btn qty-increase" aria-label="Increase quantity">+</button>
                    </div>
                </div>
                <button type="button" class="cart-item-remove" aria-label="Remove ${item.name}">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;
            cartItemsEl.appendChild(li);
        });
    }

    function openCart() {
        cartPanel.classList.add('is-open');
        cartOverlay?.classList.add('is-open');
        document.body.classList.add('cart-open');
        cartPanel.setAttribute('aria-hidden', 'false');
        cartBtn.setAttribute('aria-expanded', 'true');
    }

    function closeCart() {
        cartPanel.classList.remove('is-open');
        cartOverlay?.classList.remove('is-open');
        if (!activeModal) {
            document.body.classList.remove('cart-open');
        }
        cartPanel.setAttribute('aria-hidden', 'true');
        cartBtn.setAttribute('aria-expanded', 'false');
    }

    function openModal(modal) {
        activeModal = modal;
        modal.hidden = false;
        document.body.classList.add('modal-open');
    }

    function closeModal(modal) {
        modal.hidden = true;
        if (activeModal === modal) {
            activeModal = null;
        }
        if (!activeModal && !cartPanel.classList.contains('is-open')) {
            document.body.classList.remove('modal-open');
            document.body.classList.remove('cart-open');
        } else if (!activeModal) {
            document.body.classList.remove('modal-open');
        }
        removeConfirmCallback = null;
    }

    function closeAllModals() {
        [modalRemove, modalAdded].forEach((m) => {
            if (m) closeModal(m);
        });
    }

    function confirmRemove(message, onConfirm) {
        if (!modalRemove) return;
        modalRemoveText.textContent = message;
        removeConfirmCallback = onConfirm;
        openModal(modalRemove);
        modalRemoveConfirm?.focus();
    }

    function getItemName(id) {
        const item = loadCart().find((i) => i.id === id);
        return item ? item.name : 'this item';
    }

    function runCheckout() {
        const items = loadCart();
        if (items.length === 0) return;
        alert(`Thank you! Your order total is ${formatPrice(getCartSubtotal(items))}. Checkout will be available soon.`);
        renderCart(clearCart());
        closeCart();
        closeAllModals();
    }

    function showAddedModal(productName) {
        if (!modalAdded) return;
        modalAddedText.textContent = `"${productName}" was added to your cart. Would you like to proceed to checkout or keep shopping?`;
        openModal(modalAdded);
    }

    [modalRemove, modalAdded].forEach((modal) => {
        if (!modal) return;
        modal.querySelectorAll('[data-modal-close]').forEach((el) => {
            el.addEventListener('click', () => closeModal(modal));
        });
    });

    modalRemoveConfirm?.addEventListener('click', () => {
        if (removeConfirmCallback) {
            removeConfirmCallback();
        }
        closeModal(modalRemove);
    });

    modalAddedCheckout?.addEventListener('click', () => {
        closeModal(modalAdded);
        renderCart(loadCart());
        openCart();
    });

    modalAddedContinue?.addEventListener('click', () => {
        closeModal(modalAdded);
    });

    cartBtn.addEventListener('click', () => {
        renderCart(loadCart());
        openCart();
    });

    cartClose?.addEventListener('click', closeCart);
    cartOverlay?.addEventListener('click', () => {
        if (!activeModal) closeCart();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (activeModal) {
            closeModal(activeModal);
        } else if (cartPanel.classList.contains('is-open')) {
            closeCart();
        }
    });

    cartItemsEl?.addEventListener('click', (e) => {
        const itemEl = e.target.closest('.cart-item');
        if (!itemEl) return;
        const id = itemEl.dataset.id;
        const name = getItemName(id);

        if (e.target.closest('.qty-decrease')) {
            const item = loadCart().find((i) => i.id === id);
            if (item && item.quantity === 1) {
                confirmRemove(
                    `Remove "${name}" from your cart?`,
                    () => renderCart(removeFromCart(id))
                );
            } else {
                renderCart(updateQuantity(id, -1));
            }
            return;
        }

        if (e.target.closest('.qty-increase')) {
            renderCart(updateQuantity(id, 1));
            return;
        }

        if (e.target.closest('.cart-item-remove')) {
            confirmRemove(
                `Remove "${name}" from your cart?`,
                () => renderCart(removeFromCart(id))
            );
        }
    });

    clearCartBtn?.addEventListener('click', () => {
        const items = loadCart();
        if (items.length === 0) return;
        confirmRemove(
            'Remove all items from your cart?',
            () => renderCart(clearCart())
        );
    });

    checkoutBtn?.addEventListener('click', runCheckout);

    document.addEventListener('click', (e) => {
        const decreaseBtn = e.target.closest('.card-qty-decrease');
        const increaseBtn = e.target.closest('.card-qty-increase');
        const addBtn = e.target.closest('.add-to-cart:not(.custom-build)');

        if (decreaseBtn || increaseBtn) {
            e.preventDefault();
            e.stopPropagation();

            const control = (decreaseBtn || increaseBtn).closest('.card-qty-control');
            const host = getCartActionHost(control);
            const product = getProductFromHost(host);
            if (!product) return;

            if (decreaseBtn) {
                const item = loadCart().find((i) => i.id === product.id);
                if (item && item.quantity === 1) {
                    confirmRemove(
                        `Remove "${product.name}" from your cart?`,
                        () => renderCart(removeFromCart(product.id))
                    );
                } else {
                    renderCart(updateQuantity(product.id, -1));
                }
            } else {
                renderCart(updateQuantity(product.id, 1));
            }
            return;
        }

        if (addBtn) {
            e.preventDefault();
            e.stopPropagation();

            const host = getCartActionHost(addBtn);
            const product = getProductFromHost(host);
            if (!product) return;

            renderCart(addToCart(product));
            showAddedModal(product.name);
        }
    });

    window.addEventListener('storage', (e) => {
        if (e.key === CART_STORAGE_KEY) {
            renderCart(loadCart());
        }
    });

    renderCart(loadCart());
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCart);
} else {
    initCart();
}
