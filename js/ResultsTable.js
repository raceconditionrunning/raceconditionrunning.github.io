import {Tabulator, ColumnCalcsModule, FormatModule, GroupRowsModule, InteractionModule, ResizeColumnsModule, ResizeTableModule, ResponsiveLayoutModule, SortModule, SelectRowModule, ReactiveDataModule, FilterModule} from 'tabulator-tables';
Tabulator.registerModule([ColumnCalcsModule, FormatModule, GroupRowsModule, InteractionModule, ResizeColumnsModule, ResizeTableModule, ResponsiveLayoutModule, SortModule, SelectRowModule, ReactiveDataModule, FilterModule]);
import {formatDuration} from "./common.js";
import {LapTable} from "./LapTable.js";
import {LapPaceChart} from "./LapPaceChart.js";



export class ResultsTable extends HTMLElement {
    constructor(data) {
        super();
        this._data = data
        this.table = null
    }

    connectedCallback() {
        this.render();
    }

    initialize(data, goals, options){
        this._data = data
        this.render()
        let rowFormatter = (row, e) => {
            // This formatter may be called multiple times.
            let rowElement = row.getElement()
            rowElement.id = `result-${row.getData().id}`
            if (rowElement.querySelector(".result-detail")) {
                return
            }
            let detailFragment = document.createElement("div")
            let lapTable= new LapTable()
            //create and style holder elements
            const id = row.getData().id
            detailFragment.setAttribute('id', "result-detail-" + id + "");
            detailFragment.setAttribute("class", "result-detail")
            detailFragment.setAttribute("hidden", "hidden")
            detailFragment.appendChild(new LapPaceChart())
            detailFragment.append(lapTable)
            rowElement.appendChild(detailFragment);
        }

        let expandRow = (row) => {
            let detail = row.getElement()?.querySelector(".result-detail")
            const lapsTable = detail.querySelector("lap-table")
            if (detail.classList.contains("initialized")) {
                return
            }
            const data = row.getData()
            // Tabulator and D3 won't render correctly unless the parent element is visible
            lapsTable.initialize(data.lapDetails, options).then(() => {
                row.getTable().redraw()
            })
            let chart = detail.querySelector("lap-pace-chart")
            chart.draw(data.lapDetails, data.goalName, data.goalLaps, (barNumber)=> {
                lapsTable.table.scrollToRow(barNumber)
            })
            detail.classList.add("initialized")
        }
        let useFinishTimes = false
        if (data.length > 0) {
            useFinishTimes = data[0].finishTime && Number.isFinite(data[0].finishTime)
        }
        let sortConfig = useFinishTimes ? {column: "finishTime", dir: "asc"} : {column: "nLaps", dir: "desc"}
        let rowClicked = (e, row) => {
            if (!(e.target.classList.contains("tabulator-row") || e.target.classList.contains("tabulator-cell"))) {
                return
            }
            let data = row.getData()
            if (!data.highlighted) {
                // Each of these dispatches a datachanged event right now so try to be stingy...
                // Long term these should be debounced by Lit's reactive data system.
                this.table.getRows().forEach((row) => row.getData().highlighted ? row.update({highlighted: false}): null)
                row.update({highlighted: true})
            } else {
                this.table.getRows().forEach((row) => row.getData().highlighted? row.update({highlighted: false}): null)
            }
            let currentHash = window.location.hash
            let newHash = `#result-${row.getData().id}`
            if (!row.getElement().querySelector(".result-detail").attributes["hidden"]) {
                history.replaceState(undefined, undefined, newHash)
            } else if (currentHash === newHash) {
                history.replaceState(undefined, undefined, " ")
            }
            // Table height changed, redraw
            row.getTable().redraw()
        }

        // Sort goals in descending order by their value
        goals = Object.entries(goals).sort((a, b) => b[1] - a[1])

        let goalColumns = goals.map((goal, index) => {
            return {
                title: goal[0].replaceAll("_", "."),
                field: `${goal[0]}Time`,
                sorter: "number",
                formatter: cell => formatDuration(cell.getValue(), true),
                resizable: false,
                responsive: index + 2
            }
        })
        let summaryColumns = [
            {
                title: "Laps", field: "nLaps", sorter: "number", resizable: false, index: 1
            }]
        if (useFinishTimes) {
            summaryColumns = [{
                title: "Finish Time", field: "finishTime", sorter: "number", formatter: cell => formatDuration(cell.getValue(), true), resizable: false, index: 0
            }, ...summaryColumns]
        }

        let view
        return new Promise((resolve, reject) => {

            view = new Tabulator(this.querySelector(".results-table"), {
                reactiveData: true,
                nestedFieldSeparator:false,
                data: this._data,
                layout: "fitDataFill",
                nestedData: true,
                responsiveLayout: true,
                initialSort: [sortConfig],
                columns: [
                    {title: "Name", field: "name", resizable: false},
                    ...summaryColumns,
                    ...goalColumns
                ],
                rowFormatter: rowFormatter
            })
            view.on("tableBuilt", () => this.scrollToResult(view))
            view.on("rowClick", rowClicked)

            view.on("dataChanged", function(data){
                console.log("Data changed")
                // Think of the map as a reactive view of this table. Every time the data changes, we need to update the map
                // Tabulator doesn't correctly clear the placeholder on its own
                if (view.rowManager.getDisplayRows().length) {
                    view.rowManager._clearPlaceholder();
                }

                view.getRows().filter((row) => !row.getData().highlighted).forEach((row) => {row.getElement()?.querySelector(".result-detail")?.setAttribute("hidden", "hidden");
                    row.getElement().classList.remove("details-opened")
                })
                // Handle highlighted row
                const highlighted = view.getRows().filter((row) => row.getData().highlighted)
                highlighted.forEach((row) => {
                    let detail = row.getElement()?.querySelector(".result-detail")
                    if (detail) {
                        detail.hidden = false
                    }
                    expandRow(row);
                    row.getElement().classList.add("details-opened")

                })

            });
            this.table = view
        })

    }

    render() {
        this.innerHTML = `
        <div class="results-table"></div>
        `;
    }

    scrollToResult() {
        let hash = window.location.hash
        if (!hash) {
            return
        }
        let match = hash.match(/\d+(?=\D*$)/)
        if (!match) {
            return
        }
        let id = parseInt(match[0])
        let row = this.table.getRow(id);

        if (row) {
            // Need to have table in view for it to fully load
            this.table.element.scrollIntoView({
                behavior: 'smooth'
            });
            // HACK: wait a bit so scroll ends
            setTimeout(() => this.table.scrollToRow(id, "center", false).then(() => {
                let data = row.getData()
                if (!data.highlighted) {
                    this.table.getRows().forEach((row) => row.update({highlighted: false}))
                    row.update({highlighted: true})
                    }
            }
            ), 750)

        }

    }

}
window.customElements.define('results-table', ResultsTable);