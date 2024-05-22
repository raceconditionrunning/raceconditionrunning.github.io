import { LitElement, html, css } from 'lit';

export class TableFilterManager extends LitElement {
    constructor() {
        super();
        this.bib = '';
        this.full = true;
        this.half = true;
        this.test = false;
        this.filtersSet = false;
        this._table = null;
        this._filters = null;

        this.applyBibFilter = this.applyBibFilter.bind(this);
        this.applyFullFilter = this.applyFullFilter.bind(this);
        this.applyHalfFilter = this.applyHalfFilter.bind(this);
    }

    static get properties() {
        return {
            bib: { type: String },
            full: { type: Boolean },
            half: { type: Boolean },
            test: { type: Boolean },
            filtersSet: { type: Boolean }
        };
    }

    createRenderRoot() {
        // Render to the light DOM instead of shadow DOM
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this.initializeFiltersFromURL();
    }

    updated(changedProperties) {
        if (changedProperties.has('bib')) {
            this.applyBibFilter();
        }
        if (changedProperties.has('full')) {
            this.applyFullFilter();
        }
        if (changedProperties.has('half')) {
            this.applyHalfFilter();
        }
        if (changedProperties.has('test')) {
            this.applyTestFilter();
        }
    }

    set table(value) {
        this._table = value;
        this.checkInitialization();
    }

    get table() {
        return this._table;
    }

    set filters(value) {
        this._filters = value;
        this.checkInitialization();
    }

    get filters() {
        return this._filters;
    }

    checkInitialization() {
        if (this._table && this._filters && !this.filtersSet) {
            this.filtersSet = true;
        }
    }

    initializeFiltersFromURL() {
        const urlParams = new URLSearchParams(window.location.search);

        // Initialize Bib filter
        const bibValue = urlParams.get('bib');
        if (bibValue !== null) {
            this.bib = bibValue;
        }

        const fullValue = urlParams.get('full');
        if (fullValue !== null) {
            this.full = fullValue === 'true';
        }

        const halfValue = urlParams.get('half');
        if (halfValue !== null) {
            this.half = halfValue === 'true';
        }


        const testValue = urlParams.get('test');
        if (testValue !== null) {
            this.test = testValue === 'true';
        }
    }

    updateURLParams(key, value) {
        const url = new URL(window.location);
        const urlParams = url.searchParams;

        if (value !== null && value !== '') {
            urlParams.set(key, value);
        } else {
            urlParams.delete(key);
        }

        window.history.replaceState(null, '', url);
    }

    applyBibFilter() {
        if (!this.filtersSet) return;
        const oldFilters = this._table.getFilters().filter(filter => filter.field !== 'bib');

        if (this.bib !== '') {
            oldFilters.push({ field: 'bib', type: '=', value: this.bib });
        }

        this._table.setFilter(oldFilters); // setFilter all in one swoop to avoid multiple filter events
        this.updateURLParams('bib', this.bib ? this.bib : null);
    }

    applyFullFilter() {
        if (!this.filtersSet) return;
        if (!this.full) {
            this._table.addFilter(this._filters.excludeFull);
        } else {
            this._table.removeFilter(this._filters.excludeFull);
        }

        this.updateURLParams('full', this.full ? null : 'false');
    }

    applyHalfFilter() {
        if (!this.filtersSet) return;
        if (!this.half) {
            this._table.addFilter(this._filters.excludeHalf);
        } else {
            this._table.removeFilter(this._filters.excludeHalf);
        }

        this.updateURLParams('half', this.half ? null : 'false');
    }

    applyTestFilter() {
        if (!this.filtersSet) return;
        if (!this.test) {
            this._table.addFilter(this._filters.excludeTest);
        } else {
            this._table.removeFilter(this._filters.excludeTest);
        }

        this.updateURLParams('test', this.test ? 'true' : null);
    }

    render() {
        return html`
            <div class="row align-items-center mb-2 justify-content-center justify-content-sm-between">
              ${this.filtersSet ? html`
                <div class="col-auto col-sm-3 mb-1">
                  <div class="input-group">
                    <span class="input-group-text">Bib</span>
                    <input class="form-control" id="filter-bib" type="text" maxlength="2" .value=${this.bib} @input=${e => this.bib = e.target.value}/>
                  </div>
                </div>
                <div class="col-auto">
                    <div class="form-check form-check-inline">
                        <input class="form-check-input full" type="checkbox" id="filter-full" .checked=${this.full} @change=${e => this.full = e.target.checked}>
                        <label class="form-check-label" for="filter-full">Full</label>
                    </div>
                    <div class="form-check form-check-inline">
                        <input class="form-check-input half" type="checkbox" id="filter-half" .checked=${this.half} @change=${e => this.half = e.target.checked}>
                        <label class="form-check-label" for="filter-half">Half</label>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }
}

customElements.define('table-filter-manager', TableFilterManager);