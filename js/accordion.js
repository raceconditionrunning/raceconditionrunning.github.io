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
        .accordion-flush accordion-item:last-child {
        `;

        while (this.firstChild) {
            wrapper.appendChild(this.firstChild);
        }
        if (!this.id) {
            console.error('Accordion group must have an ID');
        }

        this.appendChild(wrapper);
        this.appendChild(style);
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
