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
        if (!this.id) {
            console.error('Accordion group must have an ID');
        }

        // Deep-link to open based on URL hash
        this.addEventListener('show.bs.collapse',  (e) => {
            // Check if the owning item has an ID
            const body = e.target
            if (body.id) {
                // Update the URL hash to reflect the current state, don't change history
                history.replaceState(null, null, `#${body.id}`);
            }
        });

        this.addEventListener('hide.bs.collapse',  (e) => {
            const body = e.target
            if (body.id && window.location.hash === `#${body.id}`) {
                // Clear hash, don't change history
                history.replaceState(null, null, window.location.pathname + window.location.search);
            }
        });

        this.openBasedOnHash = () => {
            const hash = window.location.hash;
            if (!hash) {
                return;
            }
            const target = this.querySelector(hash);
            if (target && target instanceof AccordionBody) {
                const bsCollapse = new Collapse(target, {
                    toggle: true
                });
                // Make sure focus is set to the header of the opened item
                const header = target.parentElement.querySelector('.accordion-header');
                if (header) {
                    header.querySelector('.accordion-button').focus();
                }
            }
        }

        // Listen to hash changes and open the corresponding accordion item
        window.addEventListener('hashchange', this.openBasedOnHash.bind(this));

        this.style.display = this.style.display ? this.style.display : 'block';
        // Run once on page load, but after the accordion has been fully initialized
        window.addEventListener("load", this.openBasedOnHash.bind(this));
    }
}

export class AccordionItem extends HTMLElement {
    constructor() {
        super();
        this.classList.add('accordion-item');
    }
    connectedCallback() {
        const parent = this.parentElement.closest('accordion-group');
        if (parent.hasAttribute("faq")) {
            this.setAttribute("itemscope", "");
            this.setAttribute("itemtype", "https://schema.org/Question");
        }
        // Give each accordion item a unique ID
        const items = this.parentElement.querySelectorAll("accordion-item");
        const index = Array.from(items).indexOf(this);
        this.dataset.index = index;
        this.style.display = this.style.display ? this.style.display : 'block';

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
        this.classList.add('accordion-header');
        this.style.display = this.style.display ? this.style.display : 'block';
        wrapper.classList.add('mb-0');
        wrapper.id = scopedHeaderName;
        if (parent.hasAttribute("faq")) {
            wrapper.setAttribute("itemprop", "name");
        }

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
        let wrapper = document.createElement('div');
        if (parent.hasAttribute("faq")) {
            wrapper.setAttribute("itemscope", "");
            wrapper.setAttribute("itemprop", "acceptedAnswer");
            wrapper.setAttribute("itemtype", "https://schema.org/Answer");
            let innerWrapper = document.createElement('div');
            innerWrapper.setAttribute("itemprop", "text");
            wrapper.appendChild(innerWrapper);
            wrapper = innerWrapper;
        }
        wrapper.classList.add('accordion-body');
        // Move existing children to the new wrapper
        while (this.firstChild) {
            wrapper.appendChild(this.firstChild);
        }

        // Append the wrapper as the only child of the custom element
        this.appendChild(wrapper);
        // HAX: Once only, create a style tag and tuck it into the first accordion body.
        // We can't put the style any higher up because it will mess with first-child last-child
        // that boostrap uses to to style accordions
        if (parentItem.dataset.index == 0) {
            const styleElement = document.createElement('style');
            styleElement.textContent = `
            accordion-body {
                display: block;
            }
        `;
            this.appendChild(styleElement);
        }
    }
}



window.customElements.define('accordion-group', AccordionGroup);
window.customElements.define('accordion-item', AccordionItem);
window.customElements.define('accordion-header', AccordionHeader);
window.customElements.define('accordion-body', AccordionBody);
