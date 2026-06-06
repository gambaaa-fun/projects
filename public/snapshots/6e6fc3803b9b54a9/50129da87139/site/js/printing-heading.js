const heading = document.querySelector('.header__main-title');

const segments = [
  { text: 'Budoucnost vývoje je v ', special: false },
  { text: 'AI', special: true },
  { text: '. Najdi svého pomocníka pro svůj ', special: false },
  { text: 'projekt', special: true },
  { text: ' / ', special: false },
  { text: 'zájem', special: true },
];

heading.innerHTML = '';

let segIndex = 0;
let charIndex = 0;

function type() {
  if (segIndex >= segments.length) return;

  const seg = segments[segIndex];

  if (charIndex === 0) {
    if (seg.special) {
      heading.innerHTML += `<span class="special_text"></span>`;
    }
  }

  if (seg.special) {
    const spans = heading.querySelectorAll('.special_text');
    spans[spans.length - 1].textContent += seg.text[charIndex];
  } else {
    heading.innerHTML += seg.text[charIndex];
  }

  charIndex++;

  if (charIndex >= seg.text.length) {
    segIndex++;
    charIndex = 0;
  }

  setTimeout(type, 50);
}

type();
