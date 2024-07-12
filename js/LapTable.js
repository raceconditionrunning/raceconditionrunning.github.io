import {formatDuration, formatPace} from "./common.js";
import {Tabulator, ColumnCalcsModule,  FormatModule, GroupRowsModule, InteractionModule, MutatorModule, ResizeColumnsModule, ResizeTableModule, ResponsiveLayoutModule, SortModule, SelectRowModule, ReactiveDataModule, FilterModule} from 'tabulator-tables';
Tabulator.registerModule([ColumnCalcsModule, FormatModule, GroupRowsModule, InteractionModule, MutatorModule, ResizeColumnsModule, ResizeTableModule, ResponsiveLayoutModule, SortModule, SelectRowModule, ReactiveDataModule, FilterModule]);



export class LapTable extends HTMLElement {
    constructor() {
        super();
        this.videoLink = null

    }

    connectedCallback() {
        this.render();
    }

    render() {
        this.innerHTML = `
       <style>
            .laps-table{
            padding: 1rem;
            font-size: 1rem;
            }
  
        </style>
        <div class="laps-table"></div>
        `;
    }

    updateData(data, videoLink = null) {
        if (videoLink) {
            this.videoLink = videoLink
        }
        this.table.replaceData(data)
    }

    initialize(data, {videoLink = null, videoStartTime = null, descending = false}) {
        if (videoLink) {
            this.videoLink = videoLink
        }
        let view

        this.swappableColumns = {"pace": {
                state: 0,
                columns:[
                    // Updating column definitions messes up topCalcs and doesn't handle mutator changes.
                    {
                        title: "min/mi",
                        field: "pace",
                        headerSort: true,
                        mutator: (value, data, type, params, component) => {
                            return  data.duration * 1609.34 / data.distance
                        },
                        formatter: (cell) => formatDuration(cell.getValue(), false, false, true),
                        topCalc: (values, data, calcParams) => {
                            if (values.length === 0) {
                                return ""
                            }
                            let totalDuration = data.map(l => l.duration).reduce((a, b) => a + b, 0)
                            let totalDistance = data.map(l => l.distance).reduce((a, b) => a + b, 0)
                            let averagePace = totalDuration / totalDistance * 1609.34
                            return formatPace(averagePace, "")
                        }
                    },/*
                    {
                        title: "min/km",
                        field: "pace",
                        headerSort: false,
                        formatter: (cell) => formatDuration(cell.getValue() / 1.60934, false, false, true),
                        topCalc: (values, data, calcParams) => {
                            if (values.length === 0) {
                                return ""
                            }
                            let totalDuration = data.map(l => l.duration).reduce((a, b) => a + b, 0)
                            let totalDistance = data.map(l => l.distance).reduce((a, b) => a + b, 0)
                            let averagePace = totalDuration / totalDistance * 1609.34
                            return formatPace(averagePace, "")
                        }
                    }*/
                ]
            }, "distanceElapsed": {
                "state": 0,
                columns:[
                    {title: "Meters", field: "distanceElapsed", responsive: 4, headerSort: false, formatter: cell => cell.getValue().toFixed(1)},
                    {title: "Miles", field: "distanceElapsed", responsive: 4, headerSort: false, formatter: cell => (cell.getValue() / 1609.34).toFixed(2)}
                ]
            }}


        return new Promise((resolve, reject) => {
            view = new Tabulator(this.querySelector(".laps-table"), {
                data: data,
                selectableRows: false,
                index: "index",
                groupBy: "extra",
                height: 300,
                responsiveLayout: "collapse",
                columnCalcs: true,
                initialSort: [{column: "lapNumber", dir: descending ? "desc": "asc"}],
                columns: [
                    {title: "N", field: "lapNumber", sorter: "number", responsive: 0,
                    topCalc: (values, data, calcParams) => {
                        return "Avg."
                    }
                    },
                    {
                        title: "Duration",
                        field: "duration",
                        formatter: cell => formatDuration(cell.getValue(), false, true),
                        topCalc: (values, data, calcParams) => {
                            if (values.length === 0) {
                                return ""
                            }
                            let durationLengthPairs = data.map(l => [l.duration, l.distance])
                            // Only average full laps
                            durationLengthPairs = durationLengthPairs.filter(pair => pair[1] === durationLengthPairs[durationLengthPairs.length - 1][1])
                            let averageDuration = durationLengthPairs.reduce((a, pair) => pair[0] + a, 0) / durationLengthPairs.length
                            // Calculate duration std dev
                            let variance = durationLengthPairs.reduce((a, pair) => a + Math.pow(pair[0] - averageDuration, 2), 0) / durationLengthPairs.length
                            let stdDev = Math.sqrt(variance)
                            return formatDuration(averageDuration, false, true) + " ± " + formatDuration(stdDev, false, true)
                        }
                    },
                    this.swappableColumns.pace.columns[0],

                    {
                        title: "Elapsed", field: "timeElapsed", formatter: (cell) => {
                            if (this.videoLink) {
                                // Timestamp is wallclock time, convenient for indexing into video. If it's not provided,
                                // assume all runners started at the same time and use timeElapsed instead.
                                const cellTimestamp = cell.getData().timestamp ?? cell.getData().timeElapsed
                                return `<a href='${this.videoLink}&t=${Math.floor(cellTimestamp - videoStartTime ?? 0)}'>${formatDuration(cell.getValue(), true, false)}</a>`
                            } else {
                                return formatDuration(cell.getValue(), true, false)
                            }
                        }
                        , headerSort: false
                    },
                    /*{
                        title: "Time", field: "timestamp", formatter: (cell) => {
                            if (this.videoLink) {
                                return `<a href='${this.videoLink}${Math.floor(cell.getValue() - videoStartTime ?? 0)}'>${formatDuration(cell.getValue(), true, false)}</a>`
                            } else {
                                return formatDuration(cell.getValue(), true, false)
                            }
                        }
                    },*/
                    this.swappableColumns.distanceElapsed.columns[0]
                ]
            })
            view.on("tableBuilt", () => view.setGroupHeader(function (value, count, data, group) {
                if (value) {
                    return "Extra Laps (" + count + ")";
                } else {
                    return ""
                }

            }));
            view.on("renderComplete", resolve)
            view.on("rowClick", (e, row) => {
              // Emit an event to the parent element
                this.dispatchEvent(new CustomEvent('rowClick', {detail: row.getData()}))
            })
            view.on("headerClick", (e, column) => {
                const field = column.getField()
                if (field in this.swappableColumns) {
                    const swappableColumn = this.swappableColumns[field]
                    if (swappableColumn.columns.length === 1) {
                        return
                    }
                    swappableColumn.state = (swappableColumn.state + 1) % swappableColumn.columns.length
                    column.updateDefinition( swappableColumn.columns[swappableColumn.state])
                }
            });
            this.table = view
        })
    }

}

window.customElements.define('lap-table', LapTable);

