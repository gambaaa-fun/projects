document.addEventListener("DOMContentLoaded", () => {
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('.hlavni-navigace');
    const header = document.querySelector('.hlavni-hlavicka');

    if (header) {
        header.style.position = 'relative';
    }

    if (menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('nav-otevrena');
        });
    }

    const style = document.createElement('style');
    style.textContent = `
        .nav-otevrena {
            display: block !important;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background-color: var(--clr-navy);
            padding: 20px;
            border-top: 1px solid rgba(0,255,255,0.1);
            z-index: 100;
        }
        .nav-otevrena ul, .nav-otevrena menu {
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 16px;
            margin: 0;
            padding: 0;
        }
        .nav-otevrena a {
            color: white;
            font-family: 'Anton', sans-serif;
            font-size: 18px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            text-decoration: none;
        }
    `;
    document.head.appendChild(style);

    const hraci = [
        {
            jmeno: "David Havrda",
            cislo: "2",
            pozice: "CAM",
            vek: "17 LET",
            role: "ZÁLOŽNÍK",
            foto: "./images/hrac-hero-mobil.png"
        },
        {
            jmeno: "Jan Novák",
            cislo: "10",
            pozice: "ST",
            vek: "22 LET",
            role: "ÚTOČNÍK",
            foto: "./images/hrac-hero-mobil.png"
        },
        {
            jmeno: "Tomáš Svoboda",
            cislo: "5",
            pozice: "CB",
            vek: "25 LET",
            role: "OBRÁNCE",
            foto: "./images/hrac-hero-mobil.png"
        }
    ];

    let aktualniHrac = 0;

    const elJmeno = document.getElementById("hrac-jmeno");
    const elCislo = document.getElementById("hrac-cislo");
    const elPozice = document.getElementById("hrac-pozice");
    const elVek = document.getElementById("hrac-vek");
    const elRole = document.getElementById("hrac-role");
    const elFoto = document.getElementById("hrac-foto");
    const kartaHrace = document.querySelector(".hrac-karta-bg");

    const btnNext = document.getElementById("btn-next");
    const btnPrev = document.getElementById("btn-prev");

    function aktualizujHrace(index) {
        if (!kartaHrace) return;

        kartaHrace.style.opacity = 0;
        kartaHrace.style.transform = "scale(0.98)";

        setTimeout(() => {
            const hrac = hraci[index];
            if (elJmeno) elJmeno.textContent = hrac.jmeno;
            if (elCislo) elCislo.textContent = hrac.cislo;
            if (elPozice) elPozice.textContent = hrac.pozice;
            if (elVek) elVek.textContent = hrac.vek;
            if (elRole) elRole.textContent = hrac.role;
            if (elFoto) elFoto.src = hrac.foto;

            kartaHrace.style.opacity = 1;
            kartaHrace.style.transform = "scale(1)";
        }, 150);
    }

    if (btnNext && btnPrev && kartaHrace) {
        btnNext.addEventListener("click", () => {
            aktualniHrac = (aktualniHrac + 1) % hraci.length;
            aktualizujHrace(aktualniHrac);
        });

        btnPrev.addEventListener("click", () => {
            aktualniHrac = (aktualniHrac - 1 + hraci.length) % hraci.length;
            aktualizujHrace(aktualniHrac);
        });

        kartaHrace.style.transition = "opacity 0.15s ease, transform 0.15s ease";
    }
});