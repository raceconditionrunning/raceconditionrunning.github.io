import {formatDuration, formatPace} from "./common.js";
import * as d3 from 'd3';

export class LapPaceChart extends HTMLElement {
    constructor() {
        super();
    }

    draw(data, lapTarget=Number.MAX_VALUE, onBarClick) {
        /**
         * Make an SVG viz of a participants lap data. Design based on
         * Strava's lap analysis view
         */
            // Declare the chart dimensions and margins.
        const width = 1000;
        const height = 400;
        const marginTop = 30;
        const marginRight = 30;
        const marginBottom = 30;
        const marginLeft = 60;

        // Declare the x (horizontal position) scale.
        const x = d3.scaleLinear()
            .domain([0, d3.max(data, (d) => d.timeElapsed)]) // descending frequency
            .range([marginLeft, width - marginRight])
        let slowestPace = d3.max(data, (d) => d.paceMi) + 90
        slowestPace = Math.floor(slowestPace / 60) * 60
        let fastestPace = d3.min(data, (d) => d.paceMi) - 60
        fastestPace = Math.floor(fastestPace / 60) * 60

        let lowYTick = fastestPace
        let highYTick = slowestPace + 60
        const ySpread = Math.min(highYTick - lowYTick, 60 * 60)
        highYTick = lowYTick + ySpread


        let majorYTicks = [lowYTick]
        let allYTicks = [lowYTick]
        for (let i = 1; majorYTicks[i - 1] < highYTick; i++) {
            majorYTicks.push(majorYTicks[i - 1] + 60)
        }
        for (let i = 1; allYTicks[i - 1] < highYTick; i++) {
            allYTicks.push(allYTicks[i - 1] + 20)
        }
        while (majorYTicks.length > 20) {
            majorYTicks = majorYTicks.filter((value, index, Arr) =>
                index % 2 === 0
            );
            allYTicks = majorYTicks
        }
        let lowXTick = 0
        let highXTick = d3.max(data, d => d.timeElapsed)
        highXTick = Math.floor(highXTick / (60 * 10)) * 60 * 10
        let allXTicks = [lowXTick]
        let majorXTicks = [lowXTick]
        for (let i = 1; allXTicks[i - 1] < highXTick; i++) {
            allXTicks.push(allXTicks[i - 1] + 60 * 10)
        }
        for (let i = 1; majorXTicks[i - 1] < highXTick; i++) {
            majorXTicks.push(majorXTicks[i - 1] + 60 * 20)
        }
        let y
        let y_inv

        if (ySpread > (60 * 10)) {
            let exponent = 1/32
            if (ySpread > (60 * 30)) {
                exponent = 1/64
            }
            y = d3.scalePow()
                .exponent(exponent)
                .domain([lowYTick, highYTick])
                .range([marginTop, height - marginBottom]).clamp(true)

            y_inv = d3.scalePow()
                .exponent(exponent)
                .domain([highYTick, lowYTick])
                .range([marginTop, height - marginBottom]).clamp(true)
        } else {
            // Declare the y (vertical position) scale.
            y = d3.scaleLinear()
                .domain([lowYTick, highYTick])
                .range([marginTop, height - marginBottom]).clamp(true)

            y_inv = d3.scaleLinear()
                .domain([highYTick, lowYTick])
                .range([marginTop, height - marginBottom]).clamp(true)
        }

        // Create the SVG container.
        const svg = d3.create("svg")
            .attr("viewBox", [0, 0, width, height])
            .attr("style", "max-width: 100%; height: auto;")
            .style("-webkit-tap-highlight-color", "transparent")
            .style("overflow", "visible")
            .on("pointerenter pointermove", pointermoved)
            .on("pointerleave", pointerleft)
            .on("touchstart", event => event.preventDefault());

        // Grid lines
        svg.append("g")
            .attr("stroke", "lightgrey")
            .attr("stroke-width", "1px")
            .attr("fill", "none")
            .attr("shape-rendering", "crispEdges")
            .selectAll()
            .data(majorYTicks.slice(0, majorYTicks.length - 2))
            .join("line")
            .attr("class", "horizontal-grid")
            .attr("x1", marginLeft)
            .attr("x2", width - marginRight)
            .attr("y1",  d => y(d))
            .attr("y2", d => y(d))

        let mean = d3.mean(d3.map(data, d => d.paceMi))
        svg.append("g")
            .append("line")
            .attr("x1", marginLeft)
            .attr("x2", width)
            .attr("y1", y(mean))
            .attr("y2", y(mean))
            .attr("stroke", "lightgrey")
            .attr("stroke-width", "1px")
            .attr("stroke-dasharray", "6 2")


        const pairs = [[{timeElapsed: 0}, data[0]]]
        for (let i = 0; i < data.length - 1; i++) {
            pairs.push([data[i], data[i + 1]])
        }

        // Add a rect for each bar.
        let bars = svg.append("g")
            .attr('id', "bars")
            .selectAll()
            .data(pairs)
            .join("rect")
            .attr("x", (pair) => x(pair[0].timeElapsed))
            .attr("y", (pair) => height - marginBottom - y_inv(pair[1].paceMi) + y_inv(highYTick))
            .attr("height", (pair) => y_inv(pair[1].paceMi) - y_inv(highYTick))
            .attr("width", (pair) => x(pair[1].timeElapsed) - x(pair[0].timeElapsed))
            .attr("class", "data-bar")
            .attr("data-lap-num", pair => pair[0].n)
            .on("click", event => {
                onBarClick(parseInt(event.target.attributes["data-lap-num"].value))
            })

        let barNodes = bars.nodes()
        if (barNodes.length > 111) {
            d3.selectAll(barNodes.slice(111, barNodes.length)).classed("extra", true)
        }

        let xAxis = d3.axisBottom(x)
            .tickValues(allXTicks)
            .tickFormat((d, i) => formatDuration(d))
            .tickSizeOuter(0)

        // Add the x-axis and label.
        svg.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${height - marginBottom})`)
            .call(xAxis)
            .call(g => {
                if (allXTicks.length !== allXTicks.length) {
                    g.selectAll(".tick").filter(i => i % 2).classed("minor", true)
                }
            })
            .call(g => g.select(".domain").remove())

        let yAxis = d3.axisLeft(y)
            .tickValues(allYTicks.slice(0, allYTicks.length - 3))
            .tickFormat((y, i) => {
                if (y % 60 === 0) {
                    return formatPace(y)
                } else {
                    return ""
                }
            })
        // Add the y-axis and label, and remove the domain line.
        svg.append("g")
            .attr("color", "#666")
            .attr("transform", `translate(${marginLeft},0)`)
            .call(yAxis)
            .call(g => {
                if (allYTicks.length !== majorYTicks.length) {
                    g.selectAll(".tick").filter(i => i % 3 !== 0).classed("minor", true)
                }
            })
            .call(g => g.select(".domain").remove())
            .call(g => g.append("text")
                .attr("x", -10)
                .attr("y", 10)
                .attr("fill", "currentColor")
                .attr("text-anchor", "end")
                .text("↑ Pace"));

        if (data.length > lapTarget) {
            let finishTime = data[lapTarget].timeElapsed
            let flag = svg.append("g")
                .classed("finish-flag", true)
                .attr("data-lap-target", lapTarget)

            flag.append("line")
                .attr("stroke-width", "1px")
                .attr("x1", x(finishTime))
                .attr("x2", x(finishTime))
                .attr("y1", marginBottom)
                .attr("y2", height - marginTop)

            let flag_group = flag.append("g")
                .attr("transform", `translate(${x(finishTime) + .5},0)`)

            let flag_shape = flag_group.append("polygon")
                .attr("points", "0,0 -90,0 -80,16 -90,33 0,33")

            let text = flag_group.append("text")
                .attr("fill", "white")
                .attr("text-anchor", "end")
                .attr("alignment-baseline", "middle")
                .attr("x", -10)
                .attr("y", 22)
                .text(formatDuration(finishTime))
            const {x: bb_x, y: bb_y, width: w, height: h} = text.node().getBBox();

        }

        // Lines that show up when you hover a bar
        svg.append("g")
            .attr("id", "flaglines")
            .selectAll()
            .data(pairs)
            .join("line")
            .attr("x1", (pair) => x(pair[1].timeElapsed))
            .attr("x2", (pair) => x(pair[1].timeElapsed))
            //.attr("y1", (pair) => height - marginBottom - y_inv(pair[1].paceMi) + y_inv(slowestPace))
            .attr("y1", (pair) => height - marginBottom)
            .attr("y2", 0)
            .attr("fill", "none")
            .attr("display", "none")


        const tooltip = svg.append("g")
            .style("pointer-events", "none");

        function pointermoved(event) {
            let i = d3.bisect(d3.map(data, d => d.timeElapsed), x.invert(d3.pointer(event)[0]));
            // Bisect will return an index above the last element
            i = Math.min(Math.max(0, i), data.length - 1)
            svg.select(`#bars .highlighted`).classed("highlighted", false)
            svg.selectAll('#flaglines line').attr("display", "none")
            svg.select(`#bars rect:nth-child(${i + 1})`).classed("highlighted", true)
            svg.select(`#flaglines line:nth-child(${i + 1})`).attr("display", "")
            tooltip.style("display", null);

            const path = tooltip.selectAll("rect")
                .data([,])
                .join("rect")
                .attr("fill", "white")
                .attr("stroke", "black");

            const text = tooltip.selectAll("text")
                .data([,])
                .join("text")
                .call(text => text
                    .selectAll("tspan")
                    .data(`Lap ${i} ${data[i].direction ? (data[i].direction === "CCW"? '↺': '↻') : ""}\n${(data[i].time).toFixed(2)}s\t${formatPace(data[i].paceMi)}\n${formatDuration(data[i].timeElapsed)}\t ${(data[i].distanceElapsed / 1609.34).toFixed(2)} mi`.split(/\n/))
                    .join("tspan")
                    .attr("x", 0)
                    .attr("y", (_, i) => `${i * 1.1}em`)
                    .attr("font-weight", (_, i) => i ? null : "bold")
                    .text(d => d));

            const {x: bb_x, y: bb_y, width: w, height: h} = text.node().getBBox();
            text.attr("transform", `translate(${12},${12 - bb_y})`);
            path.attr("width", w + 24)
                .attr("height", h + 24)

            let xPosition = 6 + x(data[i].timeElapsed)
            if (xPosition + w > width) {
                xPosition = x(data[i].timeElapsed) - w - 30
            }
            tooltip.attr("transform", `translate(${xPosition},0)`);
            svg.property("value", data[i]).dispatch("input", {bubbles: true});
        }

        function pointerleft() {
            tooltip.style("display", "none");
            svg.select(`#bars .highlighted`).classed("highlighted", false)
            svg.selectAll(`#flaglines line`).attr("display", "none")
            svg.node().value = null;
            svg.dispatch("input", {bubbles: true});
        }

        // Future responsive handler
        //window.addEventListener('resize', () => {} );

        // Return the SVG element.
        this.appendChild(svg.node());
        return this
    }

    connectedCallback() {

    }
}
window.customElements.define('lap-pace-chart', LapPaceChart);