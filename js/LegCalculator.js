import noUiSlider from 'noUiSlider';

export class LegCalculator extends HTMLElement {
  constructor() {
      super();
        this.style.display = "none"
  }

  setLegs(legs, exchangeNames) {
      this.style.display = "block"
      let valuesSlider = document.getElementById('leg-calculator-slider');
      let cumulativeDistances = [0]
      let cumulativeAscents = [0]
      let cumulativeDescents = [0]
      for (let i = 1; i < legs.features.length + 1; i++) {
          let leg = legs.features[i - 1]
          cumulativeDistances.push(cumulativeDistances[i - 1] + leg.properties.distance_mi)
          cumulativeAscents.push(cumulativeAscents[i - 1] + leg.properties.ascent_ft)
          cumulativeDescents.push(cumulativeDescents[i - 1] + leg.properties.descent_ft)
      }

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

      let formatToStationNumber = {
          to: function(value) {
              return bisectLeft(cumulativeDistances, value);
          },
          from: function (value) {
              return cumulativeDistances[Math.round(value)];
          }
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
          tooltips: true,
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
      slider.on('update', function (values, handle, unencoded) {
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
          let legName = `${exchangeNames[leftValue]} to ${exchangeNames[rightValue]}`
          // "values" has the "to" function from "format" applied
          // "unencoded" contains the raw numerical slider values
          let legDesc = `<div class="d-flex flex-column flex-lg-row justify-content-between align-items-baseline"><h5>${legName}</h5><h6>${distance.toFixed(2)}mi ↑${ascent.toFixed(0)}ft ↓${descent.toFixed(0)}ft</h6></div>`
          container.querySelector("#leg-calculator-description").innerHTML = legDesc
      });
  }
  connectedCallback() {

  }

}

customElements.define('leg-calculator', LegCalculator);