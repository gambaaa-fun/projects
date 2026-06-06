// --- index.html: Cart listeners + scroll animations (HTML is static) ---

document.addEventListener('DOMContentLoaded', () => {

    // Attach cart listeners to statically rendered product cards
    document.querySelectorAll('.btn-add-to-cart').forEach(btn => {
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

    // Scroll animations for product cards
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-up');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.product-card').forEach(card => observer.observe(card));
});
