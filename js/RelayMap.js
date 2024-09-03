import {formatLegDescription} from "./common.js";
import {ElevationProfile} from "./ElevationProfile.js";
import { Protocol } from 'https://cdn.jsdelivr.net/npm/pmtiles@3.0.7/+esm';

const mapboxKey = 'pk.eyJ1Ijoibmlja3N3YWxrZXIiLCJhIjoiY2t0ZjgyenE4MDR1YjJ1cno0N3hxYzI4YSJ9.ivPdsoEtV9TaLGbOOfFXKA'
import pmtiles from 'https://cdn.jsdelivr.net/npm/pmtiles@3.0.7/+esm'

import {distance, point, nearestPointOnLine, lineString} from '@turf';
const transformRequest = (url, resourceType) => {
    if (isMapboxURL(url)) {
        return transformMapboxUrl(url, resourceType, mapboxKey)
    }
    return {url}
}

class HomeControl {
    onAdd(map){
        this.map = map;
        this.container = document.createElement('div');
        this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        this.container.textContent = 'Home';

        this.container.innerHTML =
            '<div class="tools-box">' +
            '<button>' +
            '<span class="maplibregl-ctrl-icon" aria-hidden="true" title="Home"></span>' +
            '</button>' +
            '</div>';
        this.container.querySelector("span").style.backgroundImage = "url(data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMSIgZGF0YS1uYW1lPSJMYXllciAxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgdmlld0JveD0iMCAwIDEzNiAxMjkuNiI+CiAgPGRlZnM+CiAgICA8c3R5bGU+CiAgICAgIC5jbHMtMSB7CiAgICAgICAgZmlsbDogIzMzMzsKICAgICAgICBmaWxsLXJ1bGU6IGV2ZW5vZGQ7CiAgICAgICAgc3Ryb2tlLXdpZHRoOiAwcHg7CiAgICAgIH0KICAgIDwvc3R5bGU+CiAgPC9kZWZzPgogIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTcwLDIxLjlsNDMuNCw0Mi4xYzEuOSwxLjguNiw1LTIsNWgtMTB2NDAuOWgtMjMuOHYtMjZoLTE5LjN2MjZoLTIzLjh2LTQwLjloLTEwYy0yLjYsMC0zLjktMy4yLTItNWw0My40LTQyLjFjMS4xLTEuMSwyLjktMS4xLDQsMFoiLz4KPC9zdmc+)"
        this.container.onclick = () => {
            map.fitBounds(map.homeBounds, {
                padding: 32
            });
        }
        return this.container;
    }
    onRemove(){
        this.container.parentNode.removeChild(this.container);
        this.map = undefined;
    }
}



import { isMapboxURL, transformMapboxUrl } from "https://cdn.jsdelivr.net/npm/maplibregl-mapbox-request-transformer@0.0.2/src/index.min.js"
export class RelayMap extends HTMLElement {

    constructor() {
        super();

        let protocol = new Protocol();
        maplibregl.addProtocol("pmtiles",protocol.tile);
        this.mapInitialized = false;

        this.mapReady = new Promise((resolve) => {
            this._resolveMapReady = resolve;
        });
    }

    highlightLeg(legId) {
        this.mapReady.then(() => {
            // Pass -1 to clear all highlights
            if (legId >= 0) {
                console.log("Highlighting", legId)
                this.map.setFeatureState(
                    {source: 'legs', id: legId},
                    {selected: true}
                );
            }
            this.map.queryRenderedFeatures({ layers: ['legs'] }).forEach((feature) => {
                if (feature.id !== legId) {
                    console.log("Clearing", feature.id)
                    this.map.setFeatureState(
                        { source: 'legs', id: feature.id },
                        { selected: false }
                    );
                }
            });
            // Make sure the line gets redrawn
            this.map.redraw()
        })
    }

    addPoints(name, collection, style={}) {
        this.mapReady.then(() => {
            // If the source already exists, we'll just update the data
            if (this.map.getSource(name)) {
                this.map.getSource(name).setData(collection)
                return
            }
            this.map.addSource(name, {
                'type': 'geojson',
                'data': collection
            });
            this.map.addLayer({
                'id': name,
                'source': name,
                ...style
            });
        })
    }
    addTrains(trains) {
        this.mapReady.then(() => {
            this.map.getSource("trains").setData(trains)
        })
    }

    addLines(railLines, zIndex=0) {
        this.mapReady.then(() => {
            this.map.getSource("rail-lines").setData(railLines)
        })
    }
    computeDistanceAlongLegs(queryPoint, legs) {
        let totalDistance = 0
        // Merge all legs into a single line
        let line = lineString(legs.reduce((acc, leg) => acc.concat(leg.geometry.coordinates), []))
        // Get nearest point on line
        let nearest = nearestPointOnLine(line, queryPoint, {units: 'meters'})
        // Calculate cumulative distance up to index
        for (let i = 1; i < line.geometry.coordinates.length; i++) {
            let segmentDist = distance(line.geometry.coordinates[i-1], line.geometry.coordinates[i], {units: 'meters'})
            totalDistance += segmentDist
            if (i === nearest.properties.index) {
                totalDistance += distance(nearest.geometry.coordinates, line.geometry.coordinates[i], {units: 'meters'})
                break
            }
        }
        return [totalDistance, {lng: nearest.geometry.coordinates[0], lat: nearest.geometry.coordinates[1]}]
    }
    addRelayLine(legs, exchanges, exchangeNames, useStationCodes=false, lineColors={}, imgBasePath="") {

        this.mapReady.then(async () => {
            let map = this.map
            let legsData = legs.features

            if (useStationCodes) {
                const line1StationCode = await map.loadImage(`${imgBasePath}1_station_code.png`);

                map.addImage('1stationcode', line1StationCode.data, {
                    stretchX: [[76, 77]],
                    // This part of the image that can contain text ([x1, y1, x2, y2]):
                    content: [76, 2, 96, 77],
                    pixelRatio: 4
                });
                const train = await map.loadImage(`${imgBasePath}train_icon.png`);

                map.addImage('train', train.data, {
                    content: [0, 0, 1, 1],
                    pixelRatio: 2
                });
            }

            const relayBounds = legsData.reduce((bounds, leg) => leg.geometry.coordinates.reduce((bounds, coord) => {
                return bounds.extend(coord);
            }, bounds), new maplibregl.LngLatBounds(legsData[0].geometry.coordinates[0], legsData[0].geometry.coordinates[0]));

            map.homeBounds = relayBounds
            if (map.getZoom() < 10) {
            map.fitBounds(relayBounds, {
                padding: 32
            });
            }

            let hideAttribution =()=> {
                let attribution = this.querySelector(".maplibregl-compact-show")
                if (attribution) {
                    attribution.classList.remove("maplibregl-compact-show")
                    attribution.classList.remove("mapboxgl-compact-show")
                }
            }

            // Add line color to each leg
            legsData.forEach((leg) => {
                leg.properties.lineColor = lineColors[0]
            })
            map.getSource('legs').setData(legs)

            // For each leg, we find the midpoint and create a label
            let labels = legsData.map((leg) => {
                let coordinates = leg.geometry.coordinates
                let midPoint = coordinates[Math.floor(coordinates.length / 2)]
                return {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: midPoint
                    },
                    properties: {
                        id: leg.properties.id,
                        sequence: leg.properties.sequence
                    }
                }
            })

            map.getSource('leg-labels').setData({
                type: 'FeatureCollection',
                features: labels
            })

            map.getSource('exchanges').setData(exchanges);

            map.setLayerZoomRange("exchange-circle", 0, useStationCodes ? 12 : 24)
            if (useStationCodes) {
                map.setLayoutProperty("exchange-id", 'visibility', 'none');
            } else {
                // Hide exchange station code
                map.setLayoutProperty('exchange-station-code', 'visibility', 'none');
                map.setLayoutProperty("exchange-id", 'visibility', 'visible');
            }

            let currentActiveLeg = null
            let currentLegPopup = null
            map.on('click', 'legs', (e) => {
                let leg = legsData.slice().filter(l => l.properties.id === e.features[0].id)[0]
                let coordinates = leg.geometry.coordinates
                const bounds = coordinates.reduce((bounds, coord) => {
                    return bounds.extend(coord);
                }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
                currentLegPopup = new maplibregl.Popup({
                    anchor: "bottom-left",
                    offset: [16, 0],
                    className: "leg-popup",
                    focusAfterOpen: false
                })
                    .setLngLat([bounds.getEast(), bounds.getCenter().lat])
                    .setMaxWidth("300px")
                    .setHTML(formatLegDescription(exchangeNames[leg.properties.start_exchange], exchangeNames[leg.properties.end_exchange], leg.properties, false, false, coordinates))
                    .on("close", () => {
                        this.highlightLeg(-1)
                        currentActiveLeg = null
                        this.focus()
                    })
                    .addTo(map);
                let profile = currentLegPopup._content.querySelector("elevation-profile")
                profile.style.width = "100%"
                profile.style.height = "64px"
                // Maplibre strips out elevation (and any further data) per point. Get data straight from legs
                profile.elevationData = leg.geometry.coordinates
                map.fitBounds(bounds, {
                    padding: 32
                });
                this.highlightLeg(leg.id)
            })
            // Create a popup, but don't add it to the map yet.
            const distancePopup = new maplibregl.Popup({
                closeButton: false,
                closeOnClick: false,
                focusAfterOpen: false,
                className: 'distance-popup'
            });

            const updateDistancePopup = (e) => {
                map.getCanvas().style.cursor = 'pointer';
                const coordinates = [e.lngLat.lng, e.lngLat.lat];
                let leg = legsData.slice().filter(l => l.properties.id === e.features[0].id)
                const [distanceAlongLine, _] = this.computeDistanceAlongLegs(point(coordinates), legsData.slice())
                const [distanceAlongLeg, nearestPoint] = this.computeDistanceAlongLegs(point(coordinates), leg)

                distancePopup
                    .setLngLat(nearestPoint)
                    .setHTML(`${(distanceAlongLine / 1609.34).toFixed(2)}mi <br\><span class="leg-dist">${e.features[0].id + 1}: ${(distanceAlongLeg / 1609.34).toFixed(2)}mi</span>`)
                    .addTo(map);
            }
            map.on('mouseenter', 'legs-hover-region', updateDistancePopup);
            map.on('mousemove', 'legs-hover-region', updateDistancePopup);
            map.on('mouseleave', 'legs-hover-region', () => {
                map.getCanvas().style.cursor = '';
                distancePopup.remove()
            });
        })
    }

    registerLiveArrivalsSource(exchanges, endpoint) {
        this.mapReady.then(() => {
            const map = this.map;
            const popupStore = new Map(); // Stores the popups and intervals by exchange ID

            const handleMapMoveEnd = async () => {
                const zoom = map.getZoom();
                const pitch = map.getPitch();
                const bounds = map.getBounds();

                // If conditions are not met, remove all popups and clear intervals
                if (zoom < 17 || pitch > 50) {
                    popupStore.forEach(({ popup, intervalId }) => {
                        clearInterval(intervalId);
                        fadeOutAndRemovePopup(popup);
                    });
                    popupStore.clear();
                    return;
                }

                for (const exchange of exchanges.features) {
                    const exchangeCoords = exchange.geometry.coordinates;
                    const exchangeId = exchange.properties.id;

                    // If the exchange is out of bounds, remove its popup and clear its interval
                    if (!bounds.contains(exchangeCoords)) {
                        if (popupStore.has(exchangeId)) {
                            const { popup, intervalId } = popupStore.get(exchangeId);
                            clearInterval(intervalId);
                            fadeOutAndRemovePopup(popup);
                            popupStore.delete(exchangeId);
                        }
                        continue;
                    }

                    // If the exchange is in bounds and doesn't already have a popup, create one
                    if (!popupStore.has(exchangeId)) {
                        const { stopCodeNorth, stopCodeSouth } = exchange.properties;

                        const updateArrivals = async () => {
                            let northboundArrivals = await endpoint(stopCodeNorth);
                            let southboundArrivals = await endpoint(stopCodeSouth);

                            const currentTime = new Date();

                            function formatArrival(arrival) {
                                const arrivalTime = arrival.predictedArrivalTime || arrival.scheduledArrivalTime;
                                const isRealtime = arrival.predictedArrivalTime !== null;
                                const minutesUntilArrival = Math.round((new Date(arrivalTime) - currentTime) / 60000);
                                let duration = `${minutesUntilArrival} min`;
                                if (minutesUntilArrival === 0) {
                                    duration = 'now';
                                }
                                let realtimeSymbol = '';
                                if (isRealtime) {
                                    realtimeSymbol = '<span class="realtime-symbol"></span>';
                                }
                                return {
                                    time: new Date(arrivalTime),
                                    realtime: isRealtime,
                                    minutesUntilArrival: minutesUntilArrival,
                                    html: `<tr><td><span class="line-marker line-${arrival.routeId}"></span></td><td class="trip-destination"> ${arrival.headsign}</td><td class="trip-eta text-end" nowrap="true">${realtimeSymbol}${duration}</td></tr>`
                                };
                            }
                            // Filter out arrivals that have already passed
                            northboundArrivals = northboundArrivals.filter(arrival => new Date(arrival.predictedArrivalTime || arrival.scheduledArrivalTime) > currentTime);
                            southboundArrivals = southboundArrivals.filter(arrival => new Date(arrival.predictedArrivalTime || arrival.scheduledArrivalTime) > currentTime);


                            // At most, show next two arrivals for each direction
                            northboundArrivals.splice(2);
                            southboundArrivals.splice(2);

                            // Combine and sort arrivals by time
                            const combinedArrivals = [
                                ...northboundArrivals.map(arrival => formatArrival(arrival)),
                                ...southboundArrivals.map(arrival => formatArrival(arrival))
                            ].sort((a, b) => a.time - b.time);

                            if (combinedArrivals.length === 0) {
                                // If there are no arrivals, show a message
                                combinedArrivals.push({
                                    html: '<div>No upcoming arrivals</div>'
                                });
                            }

                            // Create HTML content for the merged popup
                            const combinedContent = combinedArrivals.map(arrival => arrival.html).join('');
                            // Update the popup content.
                            popup.setHTML(`<table>${combinedContent}</table>`);
                        };

                        // Create and show a single popup anchored at the top left
                        const popup = new maplibregl.Popup({ offset: [20, 40], anchor: 'top-left', className: 'arrivals-popup', closeOnClick: false, focusAfterOpen: false})
                            .setLngLat(exchangeCoords)
                            .setHTML('Loading...')
                            .addTo(map);

                        // Store the popup in the state and start the update interval
                        const intervalId = setInterval(updateArrivals, 20000); // Refresh every 20 seconds
                        popupStore.set(exchangeId, { popup, intervalId });

                        // Initial update call
                        await updateArrivals();
                    }
                }
            };

            map.on('moveend', handleMapMoveEnd);

            // Call the handler immediately to handle the initial load
            handleMapMoveEnd();
        });

        function fadeOutAndRemovePopup(popup) {
            const popupElement = popup._content.parentElement;
            if (!popupElement) return;
            popupElement.classList.add('fade-out');
            setTimeout(() => popup.remove(), 500); // Wait for the fade-out transition to complete
        }
    }


    connectedCallback() {
        this.innerHTML = `
<style>
relay-map {
    display: block;
    width: 100%;
    height: 100%;
}
`
        let centerValue = this.attributes.getNamedItem("center").value
        let boundaryValue = this.attributes.getNamedItem("max-bounds").value
        this.style.display = "block"
        Promise.all([JSON.parse(centerValue), JSON.parse(boundaryValue)]).then(([center, boundary]) => {
            let map = new maplibregl.Map({
                container: this,
                attributionControl: true,
                style: this.attributes.getNamedItem("style-href").value,
                center: sessionStorage.getItem('mapCenter') ? JSON.parse(sessionStorage.getItem('mapCenter')) : center,
                zoom: Number(sessionStorage.getItem('mapZoom')) || 9,
                pitch: Number(sessionStorage.getItem('mapPitch')) || 0,
                bearing: Number(sessionStorage.getItem('mapBearing')) || 0,
                minZoom: 8,
                maxBounds: boundary,
                hash: false,
                transformRequest: transformRequest,
            });
            // Don't break basic page scrolling until the map is focused
            map.scrollZoom.disable()
            let canvas = map.getCanvas()

            const mapDetailPopup = new maplibregl.Popup({
                closeButton: true,
                closeOnClick: true,
                focusAfterOpen: false,
            });

            map.on('contextmenu', (e) => {
                const coords = e.lngLat;
                mapDetailPopup
                    .setLngLat([coords.lng, coords.lat])
                    .setHTML(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`)
                    .addTo(map);
            });
            map.on("click", () => canvas.focus())
            map.on("pitchstart", () => canvas.focus())
            map.on("drag", () => canvas.focus())
            map.on("load", () => this._resolveMapReady())
            map.on('moveend', () => {
                // Store the current center, zoom, pitch, and bearing in session storage
                sessionStorage.setItem('mapCenter', JSON.stringify(map.getCenter()));
                sessionStorage.setItem('mapZoom', JSON.stringify(map.getZoom()));
                sessionStorage.setItem('mapPitch', JSON.stringify(map.getPitch()));
                sessionStorage.setItem('mapBearing', JSON.stringify(map.getBearing()));
            });
            canvas.addEventListener('focus', () => map.scrollZoom.enable());
            canvas.addEventListener('blur', () => {
                // Check whether focus is within container
                if (!this.contains(document.activeElement))
                    map.scrollZoom.disable()
                });

            let nav = new maplibregl.NavigationControl();
            map.addControl(nav, 'top-left');
            map.addControl(new maplibregl.FullscreenControl({container: map.getContainer()}), 'top-left');
            map.addControl(new maplibregl.GeolocateControl({
                positionOptions: {
                    enableHighAccuracy: true
                },
                trackUserLocation: true
            }), 'top-left');
            let scale = new maplibregl.ScaleControl({
                maxWidth: 80,
                unit: 'imperial'
            });
            map.addControl(new HomeControl(), 'top-left');

            map.addControl(scale);
            this.map = map
        })
    }
}

customElements.define('relay-map', RelayMap);