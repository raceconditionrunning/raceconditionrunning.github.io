import {Tabulator, ColumnCalcsModule, GroupRowsModule, FormatModule, InteractionModule, ResizeColumnsModule, ResizeTableModule, ResponsiveLayoutModule, SortModule, SelectRowModule} from 'tabulator-tables';
import {formatPace} from "./common.js";

Tabulator.registerModule([ColumnCalcsModule, FormatModule, GroupRowsModule, InteractionModule, ResizeColumnsModule, ResizeTableModule, ResponsiveLayoutModule, SortModule, SelectRowModule]);


export function createScheduleTable(container, schedule, startTime) {
    let firstLeg = {}
    let legs = new Array(schedule.length)
    for (let leg of schedule) {
        for (let runner of leg.runners) {
            firstLeg[runner] = Math.min(firstLeg[runner] ?? Number.MAX_VALUE, leg.leg)
        }
        legs[leg.leg] = leg
    }
    legs[0].start_time = new Date(startTime.getTime())
    for (let i = 1; i < legs.length; i++) {
        legs[i].start_time = new Date((legs[i - 1].start_time.getTime() + legs[i].pace_mi * legs[i].distance_mi * 1000 + 4 * 60 * 1000))
    }
    let finishTimeCalc = function(values, data, calcParams){
        if (data.length === 0) return;
        let lastLeg = data[data.length - 1]
        let endDate = new Date((lastLeg.start_time.getTime() + lastLeg.pace_mi * lastLeg.distance_mi * 1000 + 4 * 60 * 1000));
        return endDate.toTimeString().split(" ")[0].substring(0, 5)
    }

    let scheduleTable = new Tabulator(container, {
        data: schedule,
        layout: "fitDataFill",
        responsiveLayout: "collapse",
        selectable: false,
        columns: [
            {title: "Leg", field: "leg", headerSort:false, resizable: false, bottomCalc: ()=> "Finish"},
            {title: "Time", field: "start_time", formatter: cell => cell.getValue().toTimeString().split(" ")[0].substring(0, 5), bottomCalc: finishTimeCalc, headerSort:false, resizable: false},
            {title: "Start", field: "start_exchange", headerSort:false, resizable: false},
            {title: "Miles", field: "distance_mi", bottomCalc: "sum", bottomCalcParams: {precision: 2}, headerSort:false, resizable: false},
            {
                title: "Pace (/mi)", field: "pace_mi",  formatter: cell => formatPace(cell.getValue(), ""), headerSort:false, resizable: false
            },
            {
                title: "Elev. Gain (ft)", field: "ascent_ft", bottomCalc: "sum", headerSort:false, resizable: false
            },
            {title: "Runners", field: "runners", formatter: cell => {
                    let row = cell.getRow().getData()
                    let out = []
                    for (let runner of cell.getValue()) {
                        let classes = ""
                        if (runner === row.leader) {
                            classes += "leg-leader "
                        }
                        if (firstLeg[runner] === row.leg) {
                            classes += "first-leg "
                        }
                        out.push(`<span class="schedule-runner ${classes}">${runner}</span>`)
                    }
                    return out.join(", ")
                }, headerSort:false, resizable: false},
        ]
    })
    // Bottom calcs will truncate unless we redraw manually
    scheduleTable.on("dataProcessed", () => scheduleTable.redraw())
}

export function createLegDetailsTable(container, legsGeojson, exchangesGeoJson) {
    let legDescriptions = ""

    function formatLegDescription(startExchange, endExchange, leg) {
        let legNumber = `<span class="leg-number">${leg.id}:</span> `;

        let landmarkImg = startExchange.image_url ? `<img src="${startExchange.image_url}" class="landmark-img w-100 mb-2" style="max-width:180px;max-height:180px;object-fit: cover;" loading="lazy">` : "";

        let landmark = landmarkImg ? `<figure class="landmark-img-container float-start me-3 border-rounded mb-2" >${landmarkImg} <figcaption class="text-muted small lh-1" style="max-width:180px;max-height:180px">Start: ${startExchange.landmark}</figcaption></figure>` : `<i>Start: ${startExchange.landmark}</i>`;

        let startLink = startExchange.stationInfo
            ? `<a href="${startExchange.stationInfo}" target="_new">${startExchange.name}</a>`
            : startExchange.name;

        let endLink = endExchange.stationInfo
            ? `<a href="${endExchange.stationInfo}" target="_new">${endExchange.name}</a>`
            : endExchange.name;

        let legName = `${legNumber}${startLink} to ${endLink}`;

        return `<div class="d-flex flex-column flex-lg-row justify-content-between align-items-baseline"><h5>${legName}</h5><h6>${leg.distance_mi.toFixed(2)}mi ↑${leg.ascent_ft.toFixed(0)}ft ↓${leg.descent_ft.toFixed(0)}ft</h6></div>${landmark}<p class="mb-0">${leg.notes ?? ""}</p>`;
    }
    // Copy the legsGeojson array so we can modify it
    legsGeojson = JSON.parse(JSON.stringify(legsGeojson))
    for (let leg of legsGeojson) {
        let legData = leg.properties
        legData.id += 1
        let startExchange = exchangesGeoJson.filter(exchange => exchange.properties.id === legData.start_exchange)[0].properties
        let endExchange = exchangesGeoJson.filter(exchange => exchange.properties.id === legData.end_exchange)[0].properties
        legDescriptions += `<div class="mb-4 overflow-auto">${formatLegDescription(startExchange, endExchange, legData)}</div>`
    }
    container.innerHTML = legDescriptions

}
