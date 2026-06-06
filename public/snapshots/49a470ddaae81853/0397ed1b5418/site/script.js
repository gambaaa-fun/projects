// Pouze přepínání jazyka — přidá/odebere třídu 'lang-en' na <html>
(function () {
    if (localStorage.getItem('lang') === 'en') {
        document.documentElement.classList.add('lang-en');
    }
}());

function setLang(lang) {
    localStorage.setItem('lang', lang);
    document.documentElement.classList.toggle('lang-en', lang === 'en');
}
window.setLang = setLang;