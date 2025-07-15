import noUiSlider from 'noUiSlider';

function bisectLeft(arr, value, lo=0, hi=arr.length) {
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] < value) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

/**
 * Custom element representing a dual-handler slider over the distance of the route, with grid lines placed
 * at each exchange between the legs. The underlying datastore is snapping the handles to distance of the nearest exchange,
 * so the code frequently makes the inverse mapping from distance to exchange number.
 */
export class LegCalculator extends HTMLElement {
  constructor() {
      super();
        this.style.display = "none"
      this._legToExchangeId = []
  }

  setLegs(legs, exchangeInfo) {
      this.style.display = "block"
      let valuesSlider = document.getElementById('leg-calculator-slider');
      let cumulativeDistances = [0]
      let cumulativeAscents = [0]
      let cumulativeDescents = [0]
      this._legToExchangeId = []
      for (let i = 1; i < legs.length + 1; i++) {
          let leg = legs[i - 1]
          cumulativeDistances.push(cumulativeDistances[i - 1] + leg.properties.distance_mi)
          cumulativeAscents.push(cumulativeAscents[i - 1] + leg.properties.ascent_ft)
          cumulativeDescents.push(cumulativeDescents[i - 1] + leg.properties.descent_ft)
            this._legToExchangeId.push(leg.properties.start_exchange)
      }
      this._legToExchangeId.push(legs[legs.length - 1].properties.end_exchange)

      let formatToStationNumber = {
          to: (value) => bisectLeft(cumulativeDistances, value),
          from: (value) => cumulativeDistances[Math.round(value)]
      };

      let steppedRange = {}
      for (let i = 0; i < cumulativeDistances.length - 1; i++) {
          let percentage = cumulativeDistances[i] / cumulativeDistances[cumulativeDistances.length - 1]
          steppedRange[`${percentage * 100}%`] = cumulativeDistances[i]
      }
      steppedRange["min"] = 0
      steppedRange["max"] = cumulativeDistances[cumulativeDistances.length - 1]
      let slider = noUiSlider.create(valuesSlider, {
          start: ["4", "12"],
          range: steppedRange,
          margin: .5,
          tooltips: // tooltip with manual formatting
              { to: (value) => {
                let index = bisectLeft(cumulativeDistances, value)
                      let exchange = this._legToExchangeId[index]
                      if (exchangeInfo[exchange].line) {
                          const lineCode = exchangeInfo[exchange].line
                          //FIXME: Hardcoded theming here
                          return `<span class="link-station-label link-station-label-dark" title="${exchangeInfo[exchange].name}"><span class="line-name line-name-${String(lineCode).toLowerCase()}">${lineCode}</span><span class='link-station-code'>${exchangeInfo[exchange].stationCode}</span></span>`
                      }
                        return `<span class="link-station-label link-station-label-dark" title="${exchangeInfo[exchange].name}">${exchangeInfo[exchange].stationCode}</span>`;
                      }
              },
          snap: true,
          connect: true,
          format: formatToStationNumber,
          pips: {
              mode: 'range',
              density: 50,
              format: formatToStationNumber
          }
      });


      let leftValue = 4
      let rightValue = 12
      let container = this
      slider.set(['4', '12']);
      slider.on('update', (values, handle, unencoded)=> {
          let oldLeft = leftValue
          let oldRight = rightValue
          if (handle === 0) {
              leftValue = values[handle]
          } else {
              rightValue = values[handle]
          }
          if (leftValue === rightValue) {
              if (handle === 0) {
                  leftValue = oldLeft
                  slider.set([leftValue, rightValue])
              } else {
                  rightValue = oldRight
                  slider.set([leftValue, rightValue])
              }
              return
          }
          let distance = cumulativeDistances[rightValue] - cumulativeDistances[leftValue]
          let ascent = cumulativeAscents[rightValue] - cumulativeAscents[leftValue]
          let descent = cumulativeDescents[rightValue] - cumulativeDescents[leftValue]
          let legName = ""
          if (this._legToExchangeId.length > 0) {
              legName = `${exchangeInfo[this._legToExchangeId[leftValue]].name} to ${exchangeInfo[this._legToExchangeId[rightValue]].name}`
          }

          // "values" has the "to" function from "format" applied
          // "unencoded" contains the raw numerical slider values
          let legDesc = `<div class="d-flex flex-column flex-lg-row justify-content-between align-items-baseline"><h5>${legName}</h5><h6>${distance.toFixed(2)}mi ↑${ascent.toFixed(0)}ft ↓${descent.toFixed(0)}ft</h6></div>`
          container.querySelector("#leg-calculator-description").innerHTML = legDesc
      });

      let profile = container.querySelector("elevation-profile")
      if (profile) {
          let allLegElevationData = legs.flatMap((leg) => leg.geometry.coordinates)
          profile.elevationData = allLegElevationData
      }
  }
  connectedCallback() {

  }

}

customElements.define('leg-calculator', LegCalculator);