import * as d3 from 'd3';

export class ElevationProfile extends HTMLElement {
    constructor() {
    super();
    this.data = [];
    this.margin = { top: 0, right: 0, bottom: 0, left: 0 };
    this.width = this.offsetWidth - this.margin.left - this.margin.right;
    this.height = this.offsetHeight - this.margin.top - this.margin.bottom;
    this.style.display = 'block';
}

    connectedCallback() {
        this.width = this.offsetWidth - this.margin.left - this.margin.right;
        this.height = this.offsetHeight - this.margin.top - this.margin.bottom;

        // Listen for element resize
        this.resizeObserver = new ResizeObserver(() => {
            this.width = this.offsetWidth - this.margin.left - this.margin.right;
            this.height = this.offsetHeight - this.margin.top - this.margin.bottom;
            this.render();
        });
        this.resizeObserver.observe(this);

        this.render();
    }

    set elevationData(data) {
        this.data = data.map(d => ({ lat: d[0], lng: d[1], ele: d[2] }));
        this.render();
    }

    render() {
        this.innerHTML = `
            <style>
                svg {
                    font-family: sans-serif;
                    font-size: 10px;
                }
            </style>
            <svg width="${this.width + this.margin.left + this.margin.right}"
                 height="${this.height + this.margin.top + this.margin.bottom}">
                   <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="var(--ep-gradient-color-top)" />
                        <stop offset="100%" stop-color="var(--ep-gradient-color-bottom)" />
                  </linearGradient>
                <g transform="translate(${this.margin.left},${this.margin.top})"></g>
            </svg>
        `;

    this.svg = d3.select(this.querySelector('svg g'));

    const x = d3.scaleLinear()
    .domain([0, this.data.length - 1])
    .range([0, this.width]);

    const y = d3.scaleLinear()
    .domain([0, d3.max(this.data, d => d.ele)])
    .range([this.height, 0]);

    const area = d3.area()
    .x((d, i) => x(i))
    .y0(this.height)
    .y1(d => y(d.ele));

    this.svg.append('g')
        .append('path')
        .datum(this.data)
        .attr('d', area)
        .attr('style', "fill: url(#gradient); stroke: var(--ep-line-color); stroke-width: 2px")

    const xAxis = d3.axisBottom(x).tickFormat((d, i) => i);
    const yAxis = d3.axisLeft(y);

    /*svg.append('g')
    .attr('transform', `translate(0,${this.height})`)
    .call(xAxis);

    svg.append('g')
    .call(yAxis);*/
}
}

customElements.define('elevation-profile', ElevationProfile);