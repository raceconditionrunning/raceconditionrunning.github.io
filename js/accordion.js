/**
 * Custom elements which wire up a Bootstrap 5 accordion correctly (e.g. with the correct aria attributes, IDs, etc.)
 *
 * Usage:
 * <accordion-group id="unique-accordion-identifier">
 *     <accordion-item>
 *         <accordion-header>This is the header text</accordion-header>
 *         <accordion-body>Content which is hidden until the header is clicked</accordion-body>
 *     </accordion-item>
 * </accordion-group>
 */
import {Collapse} from 'bootstrap';


export class AccordionGroup extends HTMLElement {
    constructor() {
        super();
        this.classList.add('accordion');
    }
    connectedCallback() {
        // We use this wrapper so we can sneak style element in without impacting
        // styles that use :first-child or :last-child.
        const wrapper = document.createElement('div');
        const style = document.createElement("style");

        // Boostrap styles expect to be applied on block elements
        style.textContent = `
        accordion-item, accordion-header, accordion-body, accordion-group {
    display: block;
        }
        `;

        while (this.firstChild) {
            wrapper.appendChild(this.firstChild);
        }
        if (!this.id) {
            console.error('Accordion group must have an ID');
        }

        // Deep-link to open based on URL hash
        this.addEventListener('show.bs.collapse',  (e) => {
            // Check if the owning item has an ID
            const header = e.target.parentElement
            if (header.id) {
                // Update the URL hash to reflect the current state, don't change history
                history.replaceState(null, null, `#${header.id}`);
            }
        });

        this.addEventListener('hide.bs.collapse',  (e) => {
            const header = e.target.parentElement
            if (header.id && window.location.hash === `#${header.id}`) {
                // Clear hash, don't change history
                history.replaceState(null, null, ' ');
            }
        });

        const openBasedOnHash = () => {
            const hash = window.location.hash;
            if (!hash) {
                return;
            }
            const target = this.querySelector(hash);
            if (target && target instanceof AccordionItem) {
                const myCollapse = target.getElementsByClassName('collapse')[0];
                console.log(myCollapse);
                const bsCollapse = new Collapse(myCollapse, {
                    toggle: true
                });
            }
        }

        // Listen to hash changes and open the corresponding accordion item
        window.addEventListener('hashchange', openBasedOnHash.bind(this));

        this.appendChild(wrapper);
        this.appendChild(style);
        // Run once on page load, but after the accordion has been fully initialized
        window.addEventListener("load", openBasedOnHash.bind(this));
    }
}

export class AccordionItem extends HTMLElement {
    constructor() {
        super();
        this.classList.add('accordion-item');
    }
    connectedCallback() {
        // Give each accordion item a unique ID
        const items = this.parentElement.querySelectorAll("accordion-item");
        const index = Array.from(items).indexOf(this);
        this.dataset.index = index;
    }
}

export class AccordionHeader extends HTMLElement {
    constructor() {
        super();
    }

    connectedCallback() {
        const parent = this.parentElement.closest('accordion-group');
        const parentItem = this.parentElement.closest('accordion-item');
        const scopedHeaderName = `${parent.id}-header-${parentItem.dataset.index}`;
        const scopedContentName = `${parent.id}-content-${parentItem.dataset.index}`;
        const wrapper = document.createElement('h3');
        wrapper.classList.add('accordion-header');
        wrapper.id = scopedHeaderName;

        wrapper.innerHTML = `
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" aria-expanded="false" aria-controls="${scopedContentName}" data-bs-target="#${scopedContentName}">
            </button>
        `;
        // Move existing children to the new wrapper
        while (this.firstChild) {
            wrapper.querySelector('.accordion-button').appendChild(this.firstChild);
        }

        // Append the wrapper as the only child of the custom element
        this.appendChild(wrapper);
    }
}

export class AccordionBody extends HTMLElement {
    constructor() {
        super();
        this.classList.add('accordion-collapse', 'collapse');
    }

    connectedCallback() {
        const parent = this.parentElement.closest('accordion-group');
        const parentItem = this.parentElement.closest('accordion-item');
        const scopedHeaderName = `${parent.id}-header-${parentItem.dataset.index}`;
        const scopedContentName = `${parent.id}-content-${parentItem.dataset.index}`;
        this.id = scopedContentName;
        this.setAttribute('aria-labelledby', scopedHeaderName);
        this.setAttribute('data-bs-parent', `#${parent.id}`);
        const wrapper = document.createElement('div');
        wrapper.classList.add('accordion-body');
        // Move existing children to the new wrapper
        while (this.firstChild) {
           wrapper.appendChild(this.firstChild);
        }

        // Append the wrapper as the only child of the custom element
        this.appendChild(wrapper);
    }
}



window.customElements.define('accordion-group', AccordionGroup);
window.customElements.define('accordion-item', AccordionItem);
window.customElements.define('accordion-header', AccordionHeader);
window.customElements.define('accordion-body', AccordionBody);
