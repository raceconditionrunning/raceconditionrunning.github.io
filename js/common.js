
export function formatPace(seconds, unit = " /mi") {
    let date = new Date(0);
    date.setSeconds(seconds);
    let start = 14
    if (seconds > 3600) {
        start = 12
    }
    let pace = date.toISOString().substring(start, 19).replace(/^0+/, '')
    return pace + unit
}

export function formatDuration(seconds, includeHours = true, includeMilliseconds = false, trimLeadingZeros = false) {
    if (!Number.isFinite(seconds)) {
        // Don't render Infinity, NaN, etc.
        return "";
    }

    let date = new Date(0);
    const hours = Math.floor(seconds / 3600)
    let milliseconds = (seconds % 1.0) * 1000
    if (milliseconds > 0 && !includeMilliseconds) {
        // If we're not showing the milliseconds, have to round up
        // World Athletics Technical Rules, 19.24.5
        // For all races, all times not ending in zero shall be converted and recorded
        // to the next longer whole second, e.g. 2:09:44.3 shall be recorded as
        // 2:09:45.
        date.setSeconds(seconds + 1);
    } else {
        date.setSeconds(seconds)
        date.setMilliseconds(milliseconds)
    }
    let start = 14
    let end = 19

    if (includeHours) {
        if (hours >= 10) {
            start -= 3
        } else {
            start -= 2
        }
    }
    if (includeMilliseconds) {
        end += 2
    }
    let result = date.toISOString().substring(start, end)
    if (trimLeadingZeros) {
        result = result.replace(/^0+/, '')
    }
    return result
}

export function durationToSeconds(duration) {
    const [hours, minutes, seconds] = duration.split(":").map((x) => parseInt(x))
    return hours * 3600 + minutes * 60 + seconds
}

export function formatLegDescription(startStation, endStation, leg){
    let legNumber = ""
    let { id, coordinates, notes, distance_mi, ascent_ft, descent_ft } = leg
    if (id) legNumber = `<span class="leg-number">${id}:</span> `
    let profileSummary = ""
    if (ascent_ft && descent_ft) {
        profileSummary = `<h6>${distance_mi.toFixed(2)}mi ↑${ascent_ft.toFixed(0)}ft ↓${descent_ft.toFixed(0)}ft</h6>`
    }
    let profile = ""
    if (coordinates && coordinates.length > 0) profile = "<elevation-profile></elevation-profile>"
    return `<h5 class="mb-1">${legNumber}${startStation} to ${endStation}</h5>${profileSummary}${profile}<p class="mb-0">${notes}</p>`
}

export function download(content, mimeType, filename) {
    const a = document.createElement('a') // Create "a" element
    const blob = new Blob([content], {type: mimeType}) // Create a blob (file-like object)
    const url = URL.createObjectURL(blob) // Create an object URL from blob
    a.setAttribute('href', url) // Set "a" element link
    a.setAttribute('download', filename) // Set download filename
    a.click() // Start downloading
}

export function relayToGPX(trackName, legs, exchanges, options = {}) {
    const { eventName, permalink, year = new Date().getFullYear() } = options;

    let points = "";
    for (let leg of legs) {
        let coords = leg.geometry.coordinates;
        for (let coord of coords) {
            if (coord.length === 3) {
                points += `    <trkpt lat="${coord[1]}" lon="${coord[0]}"><ele>${coord[2]}</ele></trkpt>\n`;
            } else {
                points += `    <trkpt lat="${coord[1]}" lon="${coord[0]}"/>\n`;
            }
        }
    }

    let waypoints = "";
    for (let exchange of exchanges) {
        let coords = exchange.geometry.coordinates;
        waypoints += `    <wpt lat="${coords[1]}" lon="${coords[0]}"><name>${exchange.properties.name}</name></wpt>\n`;
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gpx version="1.1" creator="https://raceconditionrunning.com" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${trackName}</name>
    ${permalink ? `<link href="${permalink}">
      <text>${eventName || ""}</text>
    </link>` : ""}
    <time>${new Date().toISOString()}</time>
    <copyright author="OpenStreetMap Contributors">
      <year>${year}</year>
    </copyright>
  </metadata>
  ${waypoints}
  <trk>
    <name>${trackName}</name>
    <trkseg>
    ${points}
    </trkseg>
  </trk>
</gpx>`;
}

export function legToGPX(coords, eventName, trackName, year) {
    let points = ""
    for (let coord of coords) {
        points += `    <rtept lat="${coord[1]}" lon="${coord[0]}"/>\n`
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<gpx version="1.1" creator="https://raceconditionrunning.com" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${trackName}</name>
    <link href="{{url}}/{{permalink}}">
      <text>${eventName}</text>
    </link>
    <time>${new Date().toISOString()}</time>
    <copyright author="OpenStreetMap Contributors">
      <year>${year}</year>
    </copyright>
  </metadata>
  <rte>
    <name>${trackName}</name>
    ${points}
  </rte>
</gpx>`
}

export function createCountdown(countDownDate, unhideOnCompletion) {
    addEventListener("DOMContentLoaded", (event) => {
        const daysEl = document.getElementById("days")
        const hoursEl = document.getElementById("hours")
        const minutesEl = document.getElementById("minutes")
        const secondsEl = document.getElementById("seconds")

        const secondPluralEl = document.getElementById("second-plural")
        const minutePluralEl = document.getElementById("minute-plural")
        const hourPluralEl = document.getElementById("hour-plural")
        const dayPluralEl = document.getElementById("day-plural")
        const flashingEls = document.querySelectorAll(".flashing")
        let countdownInterval

        function updateCountdown(includeSeconds) {
            document.getElementById("static-count").style.display = "none";
            document.getElementById("dynamic-count").style.display = "";
            let now = new Date().getTime();
            let timeleft = countDownDate - now;

            let days = Math.floor(timeleft / (1000 * 60 * 60 * 24));
            let hours = Math.floor((timeleft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            let minutes = Math.floor((timeleft % (1000 * 60 * 60)) / (1000 * 60));
            let seconds = Math.floor((timeleft % (1000 * 60)) / 1000);
            if (daysEl) daysEl.innerHTML = days
            if (hoursEl) hoursEl.innerHTML = hours
            if (minutesEl) minutesEl.innerHTML = minutes
            if (secondsEl) secondsEl.innerHTML = seconds

            if (secondPluralEl) {
                if (seconds === 1) {
                    secondPluralEl.style.display = "none"
                } else {
                    secondPluralEl.style.display = ""
                }
            }
            if (minutePluralEl) {
                if (minutes === 1) {
                    minutePluralEl.style.display = "none"
                } else {
                    minutePluralEl.style.display = ""
                }
            }
            if (hourPluralEl) {
                if (hours === 1) {
                    hourPluralEl.style.display = "none"
                } else {
                    hourPluralEl.style.display = ""
                }
            }
            if (dayPluralEl) {
                if (days === 1) {
                    dayPluralEl.style.display = "none"
                } else {
                    dayPluralEl.style.display = ""
                }
            }
            flashingEls.forEach(el => {
                if (seconds % 2 === 0) {
                    el.style.visibility = "visible"
                } else {
                    el.style.visibility = "hidden"
                }
            })
            if (timeleft < 0) {
                clearInterval(countdownInterval);
                document.getElementById("countdown").style.display = "none";
                let toShow = document.getElementById(unhideOnCompletion)
                if (toShow) {
                    toShow.style.display = "";
                }
            }
        }

        updateCountdown()
        countdownInterval = setInterval(updateCountdown, 1000)
    });
}

export function processRelayGeoJSON(relay) {
    let legs = []
    let exchanges = []
    for (let feature of relay.features) {
        if (feature.geometry.type === "LineString") {
            legs.push(feature)
        } else if (feature.geometry.type === "Point") {
            exchanges.push(feature)
        }
    }

    if (legs[0].properties.sequence !== undefined) {
        legs.sort((a, b) => a.properties.sequence[0] - b.properties.sequence[0])
    } else {
        legs.sort((a, b) => a.properties.start_exchange - b.properties.start_exchange)

    }
    exchanges.sort((a, b) => a.properties.id - b.properties.id)

    legs = {
        type: "FeatureCollection",
        features: legs
    }
    exchanges = {
        type: "FeatureCollection",
        features: exchanges
    }

    return [legs, exchanges]
}


export async function prepareImagesForPhotoswipe(galleryElements) {
    // PhotoSwipe (lightbox) expects the width and height of each image to be set in the DOM. This function
    // waits for each image to load, then sets the dimensions.
    const promisesList = [];
    galleryElements.forEach((element) => {
        const thumbImage = element.querySelector('img')
        if (element.dataset.pswpWidth && element.dataset.pswpHeight) {
            return;
        }
        if (thumbImage.getAttribute("width") !== undefined && thumbImage.getAttribute("height") !== undefined) {
            // No need to fetch image, it's already in the DOM
            element.dataset.pswpWidth = thumbImage.getAttribute("width");
            element.dataset.pswpHeight = thumbImage.getAttribute("height");
            return
        }
        const promise = new Promise(function (resolve) {
            // We're assuming that the thumbnail image is in fact the full-size image
            // If that's not true and you want to force load the full image:
            //let image = new Image();
            //image.src = element.getAttribute('href');
            thumbImage.onload = () => {
                // This promise only completes when lazy load is triggered by user interaction (or no lazy attribute
                // is used.
                element.dataset.pswpWidth = thumbImage.naturalWidth;
                element.dataset.pswpHeight = thumbImage.naturalHeight;
                resolve(); // Resolve the promise only if the image has been loaded
            }
            thumbImage.onerror = () => { resolve(); };
            // onload may not trigger if the image is already in cache, so we need to check if it's already loaded
            if (thumbImage.complete && thumbImage.naturalWidth !== 0) {
                element.dataset.pswpWidth = thumbImage.naturalWidth;
                element.dataset.pswpHeight = thumbImage.naturalHeight;
                resolve();
            }
        });
        promisesList.push(promise);
    });
    await Promise.all(promisesList);
}
