// --- Shared Cart State ---

const getCart = () => {
    const cart = localStorage.getItem('noodlehub_cart');
    return cart ? JSON.parse(cart) : [];
};

const saveCart = (cart) => {
    localStorage.setItem('noodlehub_cart', JSON.stringify(cart));
    updateCartBadge();
};

const updateCartBadge = () => {
    const cart = getCart();
    const count = cart.reduce((total, item) => total + item.qty, 0);
    document.querySelectorAll('#cart-count').forEach(badge => {
        badge.textContent = count;
        if (count > 0) {
            badge.style.transform = 'scale(1.2)';
            setTimeout(() => badge.style.transform = 'scale(1)', 200);
        }
    });
};

const addToCart = (product) => {
    const cart = getCart();
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
        existing.qty += product.qty;
    } else {
        cart.push(product);
    }
    saveCart(cart);
};

document.addEventListener('DOMContentLoaded', () => {
    updateCartBadge();
});
