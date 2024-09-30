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
        // Iterate key value pairs of exchanges to create columns
        for (const [exchangeCode, name] of Object.entries(exchanges)) {
            exchangeColumns.push({title: name, field: `exchangeTimes.${exchangeCode}`, resizable: false, formatter: cell => formatDuration(cell.getValue(), true)})
        }

        let view
        return new Promise((resolve, reject) => {
            this.innerHTML = `
        <div class="results-table"></div>
        `;
            view = new Tabulator(this.querySelector(".results-table"), {
                reactiveData: true,
                data: this._data,
                layout: "fitData",
                responsiveLayout: false,
                columns: [
                    {title: "Name", field: "name", resizable: false},
                    ...exchangeColumns
                ]
            })

            this.table = view
        })

    }


}
window.customElements.define('relay-results-table', RelayResultsTable);