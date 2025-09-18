import {Tabulator, FormatModule, FrozenColumnsModule, InteractionModule, ResizeColumnsModule, ResizeTableModule, SortModule, FilterModule} from 'tabulator-tables';
Tabulator.registerModule([ FormatModule, FrozenColumnsModule, InteractionModule, ResizeColumnsModule, ResizeTableModule, SortModule, FilterModule]);
import {formatDuration} from "./common.js";



export class RelayResultsTable extends HTMLElement {
    constructor(data) {
        super();
        this._data = data
        this.table = null
        this.mode = 'cumulative' // 'cumulative' or 'splits'
        this.exchanges = null
        this.exchangeOrder = []
        this.cumulativeColumns = []
        this.splitColumns = []
    }

    initialize(data, exchangeColumnEntries){
        this._data = data
        this.lastUpdated = data.lastUpdated
        this.exchanges = Object.fromEntries(exchangeColumnEntries)
        this.exchangeOrder = []
        for (const [exchangeCode,_] of exchangeColumnEntries) {
            this.exchangeOrder.push(exchangeCode)
        }

        // Precompute splits for all data
        this._data.results = this._data.results.map(row => {
            const exchangeSplits = {}
            let previousTime = null

            for (const exchangeCode of this.exchangeOrder) {
                const currentTime = row.exchangeTimes?.[exchangeCode]
                if (currentTime !== undefined) {
                    if (exchangeCode === this.exchangeOrder[0]) {
                        // First exchange - split is the same as cumulative time
                        exchangeSplits[exchangeCode] = currentTime
                    } else {
                        // Calculate split from previous exchange
                        if (previousTime !== undefined) {
                            exchangeSplits[exchangeCode] = currentTime - previousTime
                        }
                    }
                }
                previousTime = currentTime
            }

            return {
                ...row,
                exchangeSplits
            }
        })

        // Create cumulative columns
        this.cumulativeColumns = []
        for (const [exchangeCode, name] of exchangeColumnEntries) {
            this.cumulativeColumns.push({
                title: name,
                field: `exchangeTimes.${exchangeCode}`,
                resizable: false,
                titleFormatter: (cell) => {
                    let lineCode = exchangeCode[0]
                    let stationCode = exchangeCode.substring(1)
                    return `<span class="link-station-label link-station-label-dark" title="${name}"><span
                        class="line-name text-center line-name-${lineCode}">${lineCode}</span><span class="link-station-code">${stationCode}</span></span>`
                },
                formatter: cell => {
                    const value = cell.getValue()
                    if (value === undefined) {
                        if (exchangeCode === this.exchangeOrder[0]) {
                            return "<span class='text-secondary'>DNS</span>"
                        }
                        return ""
                    }
                    return formatDuration(value, true)
                },
                sorter: (a, b) => {
                    // Treat undefined as very large number so it sorts to bottom in descending order
                    const aVal = a === "" ? Number.MAX_SAFE_INTEGER : a
                    const bVal = b === "" ? Number.MAX_SAFE_INTEGER : b
                    return aVal - bVal
                }
            })
        }

        // Create split columns
        this.splitColumns = []
        for (const [exchangeCode, name] of exchangeColumnEntries) {
            this.splitColumns.push({
                title: name,
                field: `exchangeSplits.${exchangeCode}`,
                resizable: false,
                titleFormatter: (cell) => {
                    let lineCode = exchangeCode[0]
                    let stationCode = exchangeCode.substring(1)
                    return `<span class="link-station-label link-station-label-dark" title="${name}"><span
                        class="line-name text-center line-name-${lineCode}">${lineCode}</span><span class="link-station-code">${stationCode}</span></span>`
                },
                formatter: cell => {
                    const value = cell.getValue()
                    if (value === undefined) {
                        return ""
                    }
                    const isFirst = exchangeCode === this.exchangeOrder[0]
                    const prefix = isFirst ? "" : "+"
                    return `${prefix}${formatDuration(value, true)}`
                },
                sorter: (a, b) => {
                    // Treat undefined as very large number so it sorts to bottom in descending order
                    const aVal = a === "" ? Number.MAX_SAFE_INTEGER : a
                    const bVal = b === "" ? Number.MAX_SAFE_INTEGER : b
                    return aVal - bVal
                }
            })
        }

        let view
        return new Promise((resolve, reject) => {
            this.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <div></div>
            <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" role="switch" id="splitModeSwitch">
                <label class="form-check-label" for="splitModeSwitch">Show splits</label>
            </div>
        </div>
        <table class="results-table table table-sm"></table>
        <div class="last-updated text-secondary mt-2" style="display: none;"></div>
        `;
            view = new Tabulator(this.querySelector(".results-table"), {
                reactiveData: true,
                data: this._data.results,
                layout: "fitData",
                responsiveLayout: false,
                initialSort: [{column: "name", dir: "asc"}],
                columns: [
                    {title: "Name", field: "name", resizable: false, frozen: true, formatter: cell => {
                            let row = cell.getRow().getData()
                            let teamSize = ""
                            if (row.teamSize && row.category === "Competitive") {
                                teamSize = ` <span class="badge bg-secondary-subtle team-size-badge fw-normal border border-2 border-primary text-secondary" title="Competitive format team">${row.teamSize}</span>`
                            } else if (row.category === "Solo") {
                                teamSize = ` <span class="badge bg-secondary-subtle team-size-badge fw-normal border border-2 border-success text-secondary" title="Solo Runner">Solo</span>`
                            } else if (row.teamSize) {
                                teamSize = ` <span class="badge bg-secondary-subtle team-size-badge fw-normal text-secondary" title="Team Size">${row.teamSize}</span>`
                            }
                            let out = `<span class="runner-name">${cell.getValue()}</span> ${teamSize}`
                            return out
                        }
                    },
                    ...this.cumulativeColumns
                ]
            })

            this.table = view

            // Add event listener for the split mode switch
            const switchElement = this.querySelector('#splitModeSwitch')
            switchElement.addEventListener('change', (e) => {
                this.setSplitMode(e.target.checked)
            })

            // Show last updated date if available
            if (this.lastUpdated) {
                const lastUpdatedElement = this.querySelector('.last-updated')
                const date = new Date(this.lastUpdated)
                const dateOptions = {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }
                const timeOptions = {
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZoneName: 'short'
                }
                const formattedDate = date.toLocaleDateString('en-US', dateOptions)
                const formattedTime = date.toLocaleTimeString('en-US', timeOptions)
                const isoDateTime = date.toISOString()
                lastUpdatedElement.innerHTML = `Last updated <time datetime="${isoDateTime}">${formattedDate} at ${formattedTime}</time>`
                lastUpdatedElement.style.display = 'block'
            }

            resolve(view)
        })

    }

    setSplitMode(enabled) {
        this.mode = enabled ? 'splits' : 'cumulative'
        if (this.table) {
            const nameColumn = {
                title: "Name",
                field: "name",
                resizable: false,
                frozen: true,
                formatter: cell => {
                    let row = cell.getRow().getData()
                    let teamSize = ""
                    if (row.teamSize && row.category === "Competitive") {
                        teamSize = ` <span class="badge bg-secondary-subtle team-size-badge fw-normal border border-2 border-primary text-secondary" title="Competitive format team">${row.teamSize}</span>`
                    } else if (row.category === "Solo") {
                        teamSize = ` <span class="badge bg-secondary-subtle team-size-badge fw-normal border border-2 border-success text-secondary" title="Solo Runner">Solo</span>`
                    } else if (row.teamSize) {
                        teamSize = ` <span class="badge bg-secondary-subtle team-size-badge fw-normal text-secondary" title="Team Size">${row.teamSize}</span>`
                    }
                    let out = `<span class="runner-name">${cell.getValue()}</span> ${teamSize}`
                    return out
                }
            }

            const columns = enabled ?
                [nameColumn, ...this.splitColumns] :
                [nameColumn, ...this.cumulativeColumns]

            this.table.setColumns(columns)
        }
    }


}
window.customElements.define('relay-results-table', RelayResultsTable);