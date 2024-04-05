import "masonry-layout";
import {prepareImagesForPhotoswipe} from "./common.js";
import PhotoSwipeLightbox from "photoswipe-lightbox";

export class MasonryImageGallery extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({mode: 'open'});
    }

    connectedCallback() {
        this.render();
    }

    render() {
        const imagePath = this.getAttribute('base-url');
        const fileExtension = this.getAttribute('file-extension');
        const imageNames = (this.getAttribute('image-names')).split('|');

        const galleryHTML = "<div class='grid-sizer'></div>" + imageNames.map(name => `
      <a href="${imagePath}${name}.webp">
        <img loading="lazy" src="${imagePath}${name}${fileExtension}"/>
      </a>
    `).join('');


        const styles = `<style>
    /* GALLERY **************************/
    .masonry {
        background-color: rgba(0,0,0,.05);
    }
    
    /* clear fix */
    .masonry:after {
        content: '';
        display: block;
        clear: both;
    }
    .masonry > a {
        float: left;
    }
    
    .masonry img {
        display: block;
        max-width: 100%;
    }
    
    .masonry .grid-sizer,
    .masonry a {
        width: 50%;
    }
    
    @media screen and (width > 720px) {
    .masonry .grid-sizer,
    .masonry a {
        width: 33.33%;
    }
    }
    
    .pswp img {
    max-width: none;
    object-fit: contain;
    }
    </style>`;

        this.shadowRoot.innerHTML = `${styles}<div class="masonry">${galleryHTML}</div>`;
        prepareImagesForPhotoswipe(this.shadowRoot.querySelectorAll("a")).then(() => {
            const lightbox = new PhotoSwipeLightbox({
                gallery: this.shadowRoot.querySelector(".masonry"),
                children: 'a',
                showHideAnimationType: 'zoom',
                showAnimationDuration: 200,
                hideAnimationDuration: 200,
                pswpModule: () => import("photoswipe")

            });
            lightbox.init();

            let container = this.shadowRoot.querySelector(".masonry");
            let msnry = new Masonry(container, {
                itemSelector: 'a',
                columnWidth: '.grid-sizer',
                percentPosition: true
            });
            msnry.layout()
        });
    }

}

customElements.define('masonry-image-gallery', MasonryImageGallery);
