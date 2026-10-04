import {Tabulator, FormatModule, FrozenColumnsModule, InteractionModule, ResizeColumnsModule, ResizeTableModule, SortModule, FilterModule} from 'tabulator-tables';
Tabulator.registerModule([ FormatModule, FrozenColumnsModule, InteractionModule, ResizeColumnsModule, ResizeTableModule, SortModule, FilterModule]);
import {formatDuration, exchangeLineCode, exchangeStationCode} from "./common.js";



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

    /**
     * The name cell's badge: the runner count, outlined in light gray for a Competitive-format
     *  team, with a gradient outline for Interline teams, or "Solo" for solo runners.
     */
    static formatNameCell(cell) {
        let row = cell.getRow().getData()
        let teamSize = ""
        if (row.teamSize && row.lines === "Interline" && row.category !== "Solo") {
            teamSize = ` <span class="badge bg-secondary-subtle team-size-badge interline-team-size-badge fw-normal text-secondary" title="Interline team size">${row.teamSize}</span>`
        } else if (row.teamSize && row.category === "Competitive") {
            teamSize = ` <span class="badge bg-secondary-subtle team-size-badge fw-normal border border-2 text-secondary" style="border-color: #ccc;" title="Competitive format team">${row.teamSize}</span>`
        } else if (row.category === "Solo") {
            teamSize = ` <span class="badge bg-secondary-subtle team-size-badge fw-normal text-secondary" title="Solo Runner">Solo</span>`
        } else if (row.teamSize) {
            teamSize = ` <span class="badge bg-secondary-subtle team-size-badge fw-normal text-secondary" title="Team Size">${row.teamSize}</span>`
        }
        const name = cell.getValue()
        const link = row.link
        const nameHtml = link
            ? `<a class="runner-name text-decoration-dashed" href="${link}" target="_blank" rel="noopener" title="${name}">${name}</a>`
            : `<span class="runner-name" title="${name}">${name}</span>`
        return `${nameHtml} ${teamSize}`
    }

    /**
     * True if `exchangeCode` is the exchange immediately after `row.dnfAt` in course order --
     *  i.e. the one the runner never reached. Used to render a DNF marker in that cell instead
     *  of an empty one.
     */
    isExchangeAfterDnf(row, exchangeCode) {
        if (!row.dnfAt) return false
        const dnfIndex = this.exchangeOrder.indexOf(row.dnfAt)
        const thisIndex = this.exchangeOrder.indexOf(exchangeCode)
        return dnfIndex !== -1 && thisIndex === dnfIndex + 1
    }

    static exchangeTitle(exchangeCode, name) {
        const lineCode = exchangeLineCode(exchangeCode)
        const stationCode = exchangeStationCode(exchangeCode)
        const lineBadges = [...(lineCode ?? '')].map(line =>
            `<span class="line-name text-center line-name-${line}">${line}</span>`
        ).join('')
        return `<span class="link-station-label link-station-label-dark" title="${name}">${lineBadges}<span class="link-station-code">${stationCode}</span></span>`
    }

    static instanceCount = 0
    static NAME_COLUMN_BREAKPOINT = 700
    static NAME_COLUMN_NARROW_WIDTH = 150

    nameColumnWidth() {
        return window.innerWidth < RelayResultsTable.NAME_COLUMN_BREAKPOINT
            ? RelayResultsTable.NAME_COLUMN_NARROW_WIDTH
            : undefined
    }

    buildNameColumn() {
        return {
            title: "Name",
            field: "name",
            resizable: false,
            frozen: true,
            width: this.nameColumnWidth(),
            formatter: RelayResultsTable.formatNameCell
        }
    }

    initialize(data, exchangeColumnEntries){
        this._data = data
        this.lastUpdated = data.lastUpdated
        this.exchanges = Object.fromEntries(exchangeColumnEntries)
        this.exchangeOrder = []
        for (const [exchangeCode,_] of exchangeColumnEntries) {
            this.exchangeOrder.push(exchangeCode)
        }

        this._data.results = this.prepareRows(data.results)

        // Create cumulative columns
        this.cumulativeColumns = []
        for (const [exchangeCode, name] of exchangeColumnEntries) {
            this.cumulativeColumns.push({
                title: name,
                field: `exchangeTimes.${exchangeCode}`,
                resizable: false,
                titleFormatter: () => RelayResultsTable.exchangeTitle(exchangeCode, name),
                formatter: cell => {
                    const value = cell.getValue()
                    if (value === undefined) {
                        if (exchangeCode === this.exchangeOrder[0]) {
                            return "<span class='text-secondary'>DNS</span>"
                        }
                        if (this.isExchangeAfterDnf(cell.getRow().getData(), exchangeCode)) {
                            return "<span class='text-secondary'>DNF</span>"
                        }
                        return ""
                    }
                    return formatDuration(value, true, false, true)
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
                titleFormatter: () => RelayResultsTable.exchangeTitle(exchangeCode, name),
                formatter: cell => {
                    const value = cell.getValue()
                    if (value === undefined) {
                        if (this.isExchangeAfterDnf(cell.getRow().getData(), exchangeCode)) {
                            return "<span class='text-secondary'>DNF</span>"
                        }
                        return ""
                    }
                    const isFirst = exchangeCode === this.exchangeOrder[0]
                    const prefix = isFirst ? "" : "+"
                    return `${prefix}${formatDuration(value, true, false, true)}`
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
        const switchId = `splitModeSwitch-${RelayResultsTable.instanceCount++}`
        return new Promise((resolve, reject) => {
            this.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <div></div>
            <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" role="switch" id="${switchId}">
                <label class="form-check-label" for="${switchId}">Show splits</label>
            </div>
        </div>
        <table class="results-table table table-sm" style="font-variant-numeric: tabular-nums;"></table>
        <div class="last-updated text-secondary mt-2" style="display: none;"></div>
        `;
            view = new Tabulator(this.querySelector(".results-table"), {
                index: "name",
                data: this._data.results,
                layout: "fitData",
                // Small, full-height tables should not redraw as they enter the viewport.
                renderVertical: "basic",
                responsiveLayout: false,
                initialSort: [{column: "name", dir: "asc"}],
                columns: [
                    this.buildNameColumn(),
                    ...this.cumulativeColumns
                ]
            })

            this.table = view

            // Add event listener for the split mode switch
            const switchElement = this.querySelector(`#${switchId}`)
            switchElement.addEventListener('change', (e) => {
                this.setSplitMode(e.target.checked)
            })

            let resizeTimeout
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimeout)
                resizeTimeout = setTimeout(() => this.setSplitMode(this.mode === 'splits'), 150)
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

            view.on("tableBuilt", () => resolve(view))
        })

    }

    prepareRows(rows) {
        // Precompute splits for all data
        return rows.map(row => {
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

    }

    async updateResults(data) {
        this._data = data
        const holder = this.querySelector('.tabulator-tableholder')
        const left = holder?.scrollLeft
        const top = holder?.scrollTop
        await this.table.replaceData(this.prepareRows(data.results))
        if (holder) { holder.scrollLeft = left; holder.scrollTop = top }
        this.lastUpdated = data.lastUpdated
        const label = this.querySelector('.last-updated')
        label.textContent = data.lastUpdated ? `Latest photo upload ${new Date(data.lastUpdated).toLocaleString()}` : ''
        label.style.display = data.lastUpdated ? 'block' : 'none'
    }

    setSplitMode(enabled) {
        this.mode = enabled ? 'splits' : 'cumulative'
        if (this.table) {
            const nameColumn = this.buildNameColumn()

            const columns = enabled ?
                [nameColumn, ...this.splitColumns] :
                [nameColumn, ...this.cumulativeColumns]

            this.table.setColumns(columns)
        }
    }


}
window.customElements.define('relay-results-table', RelayResultsTable);
