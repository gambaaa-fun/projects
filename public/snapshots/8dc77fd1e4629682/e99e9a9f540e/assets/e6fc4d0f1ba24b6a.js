// --- cart.html: Render and manage shopping cart ---

document.addEventListener('DOMContentLoaded', () => {
    const cartList = document.getElementById('cart-items-list');
    if (!cartList) return;

    const renderCart = () => {
        const summaryBox = document.getElementById('cart-summary-box');
        const cart = getCart();

        if (cart.length === 0) {
            cartList.innerHTML = `
                <div class="empty-cart text-muted">
                    <i class="icon icon-cart" style="font-size: 4rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                    <h2 class="mb-3">Váš košík je prázdný</h2>
                    <p class="mb-4">Zatím jste si nevybrali žádné produkty.</p>
                    <a href="products.html" class="btn btn-primary">Přejít k produktům</a>
                </div>
            `;
            if (summaryBox) summaryBox.style.display = 'none';
            return;
        }

        if (summaryBox) summaryBox.style.display = 'block';

        let html = '';
        let total = 0;

        cart.forEach(item => {
            const itemTotal = item.price * item.qty;
            total += itemTotal;
            html += `
                <div class="cart-item animate-up">
                    <img src="${item.img}" alt="${item.title}" class="cart-item-img">
                    <div class="cart-item-info">
                        <div class="cart-item-title">${item.title}</div>
                        <div class="text-muted small">${item.price} Kč / ks</div>
                    </div>
                    <div class="cart-item-controls">
                        <button class="qty-btn" onclick="updateQty('${item.id}', -1)">-</button>
                        <span style="width: 30px; text-align: center;">${item.qty}</span>
                        <button class="qty-btn" onclick="updateQty('${item.id}', 1)">+</button>
                    </div>
                    <div class="cart-item-price">${itemTotal} Kč</div>
                    <button class="cart-remove" onclick="removeFromCart('${item.id}')" title="Odebrat">
                        <i class="icon icon-trash"></i>
                    </button>
                </div>
            `;
        });

        cartList.innerHTML = html;

        const subtotalEl = document.getElementById('cart-subtotal');
        const totalEl = document.getElementById('cart-total');
        if (subtotalEl) subtotalEl.textContent = `${total} Kč`;
        if (totalEl) totalEl.textContent = `${total} Kč`;
    };

    window.updateQty = (id, change) => {
        let cart = getCart();
        const item = cart.find(i => i.id === id);
        if (item) {
            item.qty += change;
            if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
            saveCart(cart);
            renderCart();
        }
    };

    window.removeFromCart = (id) => {
        let cart = getCart().filter(i => i.id !== id);
        saveCart(cart);
        renderCart();
    };

    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            alert('Děkujeme za vaši objednávku! Toto je ukázkový e-shop.');
            updateCartBadge();
            renderCart();
        });
    }

    renderCart();
});
