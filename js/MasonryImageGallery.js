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
        border: .5px solid var(--placeholder-border-color, #222);
        box-sizing: border-box;
        //margin-bottom: 2px;
    }
    
    .masonry img {
        display: block;
        max-width: 100%;
        height: 100%;
        width: 100%;
        object-fit: cover;
        background-color: var(--placeholder-bg, rgb(233, 236, 239));

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

        this.shadowRoot.innerHTML = `${styles}<div class="masonry"><div class='grid-sizer'></div></div>`;
        // Move light elements to shadow DOM
        this.childNodes.forEach((child) => {
            if (child.tagName === "A") {
                this.shadowRoot.querySelector(".masonry").appendChild(child);
            }
        })
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
                percentPosition: true,
                //gutter: 4
            });
            msnry.layout()
        });
    }

}

customElements.define('masonry-image-gallery', MasonryImageGallery);
