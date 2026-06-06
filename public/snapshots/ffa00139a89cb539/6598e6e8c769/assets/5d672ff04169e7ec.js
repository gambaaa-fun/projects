lightGallery(document.getElementById("gallery"), {
    plugins: [lgZoom, lgThumbnail],

    speed: 500,
    download: false,
    thumbnail: true,
    zoom: true,
    selector: "a"
});