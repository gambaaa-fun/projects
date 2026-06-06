const menuButton = document.querySelector('.menu-button');
const menuPanel = document.querySelector('.menu-panel');
const smth = document.querySelector('.smth');

if (menuButton && menuPanel) {
	const setMenuState = (isOpen) => {
		document.body.classList.toggle('menu-open', isOpen);
		menuButton.setAttribute('aria-expanded', String(isOpen));
		menuButton.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
	};

	menuButton.addEventListener('click', () => {
		setMenuState(!document.body.classList.contains('menu-open'));
	});

	document.addEventListener('click', (event) => {
		if (!document.body.classList.contains('menu-open')) {
			return;
		}

		if (menuButton.contains(event.target) || menuPanel.contains(event.target)) {
			return;
		}

		setMenuState(false);
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') {
			setMenuState(false);
		}
	});
}


document.addEventListener('DOMContentLoaded', () => {
	if (typeof Swiper === 'undefined') {
		return;
	}

	document.querySelectorAll('.card-swiper').forEach((el) => {
		const pagEl = el.querySelector('.card-pagination');
		const prevBtn = document.createElement('button');
		prevBtn.className = 'card-nav card-prev';
		prevBtn.setAttribute('aria-label', 'Previous image');
		prevBtn.textContent = '‹';
		const nextBtn = document.createElement('button');
		nextBtn.className = 'card-nav card-next';
		nextBtn.setAttribute('aria-label', 'Next image');
		nextBtn.textContent = '›';
		el.appendChild(prevBtn);
		el.appendChild(nextBtn);

		const instance = new Swiper(el, {
			nested: true,
			loop: true,
			slidesPerView: 1,
			slidesPerGroup: 1,
			threshold: 50,
			resistanceRatio: 20,
			pagination: { el: pagEl, clickable: true },
			navigation: { prevEl: prevBtn, nextEl: nextBtn },
			spaceBetween: 0,
			allowTouchMove: true
		});

		window.cardSwipers = window.cardSwipers || [];
		window.cardSwipers.push(instance);
	});
});
