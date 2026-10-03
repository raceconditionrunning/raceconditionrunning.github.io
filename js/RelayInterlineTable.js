import {Tabulator} from 'tabulator-tables';
import {formatDuration} from "./common.js";
import {RelayResultsTable} from "./RelayResultsTable.js";


/**
 * Interline teams run both branches at once and carry on as one from the exchange where the
 *  branches merge, so their result is not a single cell of either line's table. One row per team:
 *  each branch's arrival at the merge, the shared portion, and the finish.
 */
export class RelayInterlineTable extends HTMLElement {
    constructor() {
        super();
        this.table = null
        this.mergeExchange = null
        this.finishExchange = null
    }

    static formatTime(cell) {
        const value = cell.getValue()
        return value === undefined ? "" : formatDuration(value, true, false, true)
    }

    static sortTime(a, b) {
        // Treat missing times as very large number so they sort to bottom in ascending order
        const aVal = Number.isFinite(a) ? a : Number.MAX_SAFE_INTEGER
        const bVal = Number.isFinite(b) ? b : Number.MAX_SAFE_INTEGER
        return aVal - bVal
    }

    timeColumn(title, field, titleHtml) {
        return {
            title,
            field,
            resizable: false,
            titleFormatter: () => titleHtml,
            formatter: RelayInterlineTable.formatTime,
            sorter: RelayInterlineTable.sortTime
        }
    }

    /**
     * @param mergeExchange [id, name] of the exchange where the branches join
     * @param finishExchange [id, name] of the last exchange
     */
    initialize(data, mergeExchange, finishExchange) {
        this.mergeExchange = mergeExchange[0]
        this.finishExchange = finishExchange[0]
        const mergeTitle = RelayResultsTable.exchangeTitle(...mergeExchange)
        const finishTitle = RelayResultsTable.exchangeTitle(...finishExchange)

        return new Promise((resolve, reject) => {
            this.innerHTML = `<table class="results-table table table-sm" style="font-variant-numeric: tabular-nums;"></table>`
            const view = new Tabulator(this.querySelector(".results-table"), {
                index: "name",
                data: this.prepareRows(data.results),
                layout: "fitData",
                responsiveLayout: false,
                initialSort: [{column: "name", dir: "asc"}, {column: "finish", dir: "asc"}],
                columns: [
                    {
                        title: "Name",
                        field: "name",
                        resizable: false,
                        frozen: true,
                        formatter: RelayResultsTable.formatNameCell
                    },
                    this.timeColumn("First branch in", "firstIn", `<span class="d-inline-flex align-items-center gap-1" title="First branch to arrive">1st to ${mergeTitle}</span>`),
                    this.timeColumn("Second branch in", "secondIn", `<span class="d-inline-flex align-items-center gap-1" title="Second branch to arrive">2nd to ${mergeTitle}</span>`),
                    this.timeColumn("Shared", "shared", `<span title="From the second branch's arrival to the finish">Shared</span>`),
                    this.timeColumn("Finish", "finish", finishTitle),
                ]
            })
            this.table = view
            view.on("tableBuilt", () => resolve(view))
        })
    }

    prepareRows(rows) {
        return rows.map(row => {
            // exchangeTimes holds the later arrival at the merge; the earlier one is reported
            // separately once both branches are in.
            const later = row.exchangeTimes?.[this.mergeExchange]
            const earlier = row.earlierArrivals?.[this.mergeExchange]?.time
            const finish = row.exchangeTimes?.[this.finishExchange]
            return {
                ...row,
                firstIn: earlier ?? later,
                secondIn: earlier === undefined ? undefined : later,
                shared: finish === undefined || later === undefined ? undefined : finish - later,
                // max(branches) + shared: the branches start together, so this is the finish time
                finish
            }
        })
    }

    async updateResults(data) {
        const holder = this.querySelector('.tabulator-tableholder')
        const left = holder?.scrollLeft
        const top = holder?.scrollTop
        await this.table.replaceData(this.prepareRows(data.results))
        if (holder) { holder.scrollLeft = left; holder.scrollTop = top }
    }
}
window.customElements.define('relay-interline-table', RelayInterlineTable);
