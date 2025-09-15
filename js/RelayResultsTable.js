import {Tabulator, FormatModule, InteractionModule, ResizeColumnsModule, ResizeTableModule, SortModule, FilterModule} from 'tabulator-tables';
Tabulator.registerModule([ FormatModule, InteractionModule, ResizeColumnsModule, ResizeTableModule, SortModule, FilterModule]);
import {formatDuration} from "./common.js";



export class RelayResultsTable extends HTMLElement {
    constructor(data) {
        super();
        this._data = data
        this.table = null
    }

    initialize(data, exchanges){
        this._data = data
        let exchangeColumns = []
        let firstExchangeCode = Object.keys(exchanges)[Object.keys(exchanges).length - 1]
        for (const [exchangeCode, name] of Object.entries(exchanges)) {
            exchangeColumns.push({title: name, field: `exchangeTimes.${exchangeCode}`, resizable: false,
                titleFormatter: (cell) => {
                    let lineCode = exchangeCode[0]
                    let stationCode = exchangeCode.substring(1)
                    return `<span class="link-station-label link-station-label-dark" title="${name}"><span
                        class="line-name text-center line-name-${lineCode}">${lineCode}</span><span class="link-station-code">${stationCode}</span></span>`
                },
                formatter: cell => {
                    if (cell.getValue() !== undefined) return formatDuration(cell.getValue(), true)
                    if (!cell.getValue() && cell.getColumn().getField().endsWith(firstExchangeCode)) return "<span class='text-secondary'>DNS</span>"
                }
            })
        }

        let view
        return new Promise((resolve, reject) => {
            this.innerHTML = `
        <table class="results-table table table-sm"></table>
        `;
            view = new Tabulator(this.querySelector(".results-table"), {
                reactiveData: true,
                data: this._data,
                layout: "fitData",
                responsiveLayout: false,
                columns: [
                    {title: "Name", field: "name", resizable: false, formatter: cell => {
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
                    ...exchangeColumns
                ]
            })

            this.table = view
        })

    }


}
window.customElements.define('relay-results-table', RelayResultsTable);