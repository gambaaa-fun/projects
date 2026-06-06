document.addEventListener("DOMContentLoaded", () => {

    let hamelmnts = document.querySelectorAll(".hamburger-zone");

    for (const btn of document.querySelectorAll(".hamburger-btn")) {

        btn.addEventListener("click", (e) => {

            e.preventDefault();

            for (const element of hamelmnts) {
                element.classList.toggle("active");
            }
        });
    }

    const categories = document.querySelector('.categories');
    const toggleBtn = document.querySelector('.categories__toggle-btn');

    if (categories && toggleBtn) {
        const categoryItems = categories.querySelectorAll('.categories_item');

        const updateCategories = () => {
            if (categoryItems.length < 3) {
                categories.classList.remove('collapsed', 'expanded');
                toggleBtn.style.display = 'none';
                categoryItems.forEach(item => item.classList.remove('hidden'));
                return;
            }

            const firstRowTop = categoryItems[0].getBoundingClientRect().top;
            const thirdRowTop = categoryItems[2].getBoundingClientRect().top;
            const wrapped = thirdRowTop > firstRowTop + 4;

            if (wrapped) {
                toggleBtn.style.display = 'block';
                if (categories.classList.contains('expanded')) {
                    categories.classList.remove('collapsed');
                    categories.classList.add('expanded');
                    toggleBtn.textContent = 'Skrýt další kategorie';
                    categoryItems.forEach(item => item.classList.remove('hidden'));
                } else {
                    categories.classList.add('collapsed');
                    categories.classList.remove('expanded');
                    toggleBtn.textContent = 'Zobrazit další kategorie';
                    categoryItems.forEach((item, index) => {
                        if (index >= 2) {
                            item.classList.add('hidden');
                        } else {
                            item.classList.remove('hidden');
                        }
                    });
                }
            } else {
                categories.classList.remove('collapsed', 'expanded');
                toggleBtn.style.display = 'none';
                categoryItems.forEach(item => item.classList.remove('hidden'));
            }
        };

        toggleBtn.addEventListener('click', () => {
            if (categories.classList.contains('collapsed')) {
                categories.classList.remove('collapsed');
                categories.classList.add('expanded');
                toggleBtn.textContent = 'Skrýt další kategorie';
                categoryItems.forEach(item => item.classList.remove('hidden'));
            } else {
                categories.classList.add('collapsed');
                categories.classList.remove('expanded');
                toggleBtn.textContent = 'Zobrazit další kategorie';
                categoryItems.forEach((item, index) => {
                    if (index >= 2) {
                        item.classList.add('hidden');
                    } else {
                        item.classList.remove('hidden');
                    }
                });
            }
        });

        window.addEventListener('resize', updateCategories);
        updateCategories();
    }
});