// lightGallery(document.getElementById('gallery'), {
//     // Plugins to activate
//     plugins: [lgZoom, lgThumbnail, lgFullscreen],
//     // Core options
//     speed: 400,               // slide transition speed (ms)
//     download: true,           // show download button
//     counter: true,            // "1 / 7" counter
//     // Zoom plugin options
//     scale: 1,
//     zoom: true,
//     // Thumbnail plugin options
//     thumbnail: true,
//     animateThumb: true,
//     thumbWidth: 100,
//     thumbHeight: '65px',
//     toggleThumb: true,        // hide/show thumbnail strip
//     // Swipe on mobile
//     swipeToClose: true,
//     closable: true,
//     // Captions from data-sub-html
//     subHtmlSelectorRelative: false,
//   });



const prj1Images = [
    { src: 'images/projects/mctest.webp', thumb: 'images/projects/mctest.webp', subHtml: '<h4>Caption 1</h4>' },
    { src: 'images/projects/mctest2.webp', thumb: 'images/projects/mctest2.webp', subHtml: '<h4>Caption 2</h4>' },
];

const prj1Trigger = document.querySelector('#prj1 a');
let prj1Gallery = null;

function openPrj1Gallery(startIndex = 0) {
    if (prj1Gallery) {
        prj1Gallery.destroy();
        prj1Gallery = null;
    }

    const mountEl = document.createElement('div');
    document.body.appendChild(mountEl);

    prj1Gallery = lightGallery(mountEl, {
        plugins: [lgZoom, lgThumbnail],
        dynamic: true,
        dynamicEl: prj1Images,
        index: startIndex,
        speed: 400,
        counter: true,
        download: true,
        zoom: true,
        scale: 1,
        thumbnail: true,
        animateThumb: true,
        thumbWidth: 100,
        thumbHeight: '65px',
        toggleThumb: true,
        swipeToClose: true,
        closable: true,
    });

    prj1Gallery.openGallery(startIndex);

    mountEl.addEventListener('lgAfterClose', () => {
        if (prj1Gallery) {
            prj1Gallery.destroy();
            prj1Gallery = null;
        }
        mountEl.remove();
    });
}

if (prj1Trigger) {
    prj1Trigger.addEventListener('click', (event) => {
        event.preventDefault();
        openPrj1Gallery(0);
    });
}





