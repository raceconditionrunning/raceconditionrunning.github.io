import {formatLegDescription} from "./common.js";

const mapboxKey = 'pk.eyJ1Ijoibmlja3N3YWxrZXIiLCJhIjoiY2t0ZjgyenE4MDR1YjJ1cno0N3hxYzI4YSJ9.ivPdsoEtV9TaLGbOOfFXKA'
const transformRequest = (url, resourceType) => {
    if (isMapboxURL(url)) {
        return transformMapboxUrl(url, resourceType, mapboxKey)
    }
    return {url}
}
import { isMapboxURL, transformMapboxUrl } from "https://cdn.jsdelivr.net/npm/maplibregl-mapbox-request-transformer@0.0.2/src/index.min.js"
export class RelayMap extends HTMLElement {

    constructor() {
        super();
        this.mapInitialized = false;
        this.mapReady = new Promise((resolve) => {
            this._resolveMapReady = resolve;
        });
    }
    updateWithData(legs, exchanges, exchangeNames, railLines) {

        this.mapReady.then(() => {
            let map = this.map
            let legsData = legs.features

            const relayBounds = legsData.reduce((bounds, leg) => leg.geometry.coordinates.reduce((bounds, coord) => {
                return bounds.extend(coord);
            }, bounds), new maplibregl.LngLatBounds(legsData[0].geometry.coordinates[0], legsData[0].geometry.coordinates[0]));

            map.fitBounds(relayBounds, {
                padding: 32
            });

            let hideAttribution =()=> {
                let attribution = this.querySelector(".maplibregl-compact-show")
                if (attribution) {
                    attribution.classList.remove("maplibregl-compact-show")
                    attribution.classList.remove("mapboxgl-compact-show")
                }
            }

            window.addEventListener("resize", function () {
                if (window.innerWidth < 768) {
                    hideAttribution()
                }
            })
            if (window.innerWidth < 768) {
                hideAttribution()
            }

            map.addSource('route', {
                'type': 'geojson',
                'data': railLines
            })

            map.addLayer({
                'id': 'route',
                'type': 'line',
                'source': 'route',
                'layout': {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                'paint': {
                    'line-color': '#777',
                    'line-width': 1
                }
            });
            map.addSource('legs', {
                'type': 'geojson',
                'generateId': true,
                'data': legs
            });

            map.addLayer({
                'id': 'legs',
                'type': 'line',
                'source': 'legs',
                'layout': {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                'paint': {
                    'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#468040', '#6cc462'],
                    'line-width': 8
                }
            });
            map.addSource('exchanges', {
                'type': 'geojson',
                'generateId': true,
                'data': exchanges
            });

            map.addLayer({
                'id': 'exchange-circle',
                'type': 'circle',
                'source': 'exchanges',
                minzoom: 9,
                'paint': {
                    'circle-radius': 16,
                    'circle-color': '#fff'
                }
            });

            map.addLayer({
                id: 'exchange-id',
                type: 'symbol',
                source: 'exchanges',
                minzoom: 9,
                layout: {
                    'text-field': '{id}',
                    'text-font': ['Open Sans Semibold'],
                    'text-size': 16
                }
            });

            let currentExchangePopup = null;
            let currentHoveredExchange = null;
            let exchangePinned = false;
            // When a click event occurs on a feature in the places layer, open a popup at the
            // location of the feature, with description HTML from its properties.

            function addExchangePopup(feature) {
                return new maplibregl.Popup({
                    offset: [16, 0],
                    className: "exchange-name-popup",
                    focusAfterOpen: false,
                    closeButton: false,
                    anchor: 'left'
                })
                    .setLngLat(feature.geometry.coordinates)
                    .setHTML(`<h5 class="m-0"><a href="${feature.properties.stationInfo}" title="Official station page" target="_new">${feature.properties.name} 🔗</a></h5>`)
                    .setMaxWidth("350px")
                    .addTo(map);
            }

            map.on('click', 'exchange-circle', e => {
                const exchange = e.features[0]
                e.originalEvent.stopPropagation()

                currentExchangePopup = addExchangePopup(exchange)
                if (currentHoveredExchange) {
                    map.setFeatureState(
                        {source: 'exchanges', id: currentHoveredExchange},
                        {hover: false}
                    );
                }
                map.setFeatureState(
                    {source: 'exchanges', id: exchange.id},
                    {hover: true}
                );
                exchangePinned = true
                currentHoveredExchange = exchange.id
            })
            map.on('mousemove', 'exchange-circle', (e) => {
                if (exchangePinned && currentExchangePopup && currentExchangePopup.isOpen()) {
                    return
                }
                if (e.features.length > 0) {
                    let feature = e.features[0]
                    if (currentExchangePopup && currentExchangePopup.isOpen()) {
                        if (currentHoveredExchange === feature.properties.id) {
                            return
                        }
                        currentExchangePopup.remove()
                    }

                    currentHoveredExchange = feature.properties.id;
                    currentExchangePopup = addExchangePopup(feature)
                } else if (currentExchangePopup) {
                    currentExchangePopup.remove()
                    currentExchangePopup = null
                    currentHoveredExchange = null
                    exchangePinned = false;
                }
            });

            map.on("mouseenter", "exchange-circle", (e) => {
                map.getCanvas().style.cursor = 'pointer';
            });

            // Change it back to a pointer when it leaves.
            map.on('mouseleave', 'exchange-circle', (e) => {
                map.getCanvas().style.cursor = '';
                e.preventDefault()
            });

            let currentActiveLeg = null
            let currentLegPopup = null
            map.on('click', 'legs', (e) => {
                const coordinates = e.features[0].geometry.coordinates;
                const leg = e.features[0]
                const bounds = coordinates.reduce((bounds, coord) => {
                    return bounds.extend(coord);
                }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
                currentLegPopup = new maplibregl.Popup({
                    anchor: "bottom-left",
                    offset: [16, 0],
                    className: "leg-popup",
                    focusAfterOpen: true
                })
                    .setLngLat([bounds.getEast(), bounds.getCenter().lat])
                    .setMaxWidth("300px")
                    .setHTML(formatLegDescription(exchangeNames[leg.properties.start_exchange], exchangeNames[leg.properties.end_exchange], leg.properties))
                    .on("close", () => {
                        map.setFeatureState(
                            {source: 'legs', id: leg.id},
                            {selected: false}
                        );
                        currentActiveLeg = null
                        this.focus()
                    })
                    .addTo(map);
                map.fitBounds(bounds, {
                    padding: 32
                });
                if (currentActiveLeg) {
                    map.setFeatureState(
                        {source: 'legs', id: currentActiveLeg.id},
                        {selected: false}
                    );
                }
                map.setFeatureState(
                    {source: 'legs', id: leg.id},
                    {selected: true}
                );
                currentActiveLeg = leg
            })

            // Change the cursor to a pointer when the mouse is over the places layer.
            map.on('mouseenter', 'legs', () => {
                map.getCanvas().style.cursor = 'pointer';

            });

            // Change it back to a pointer when it leaves.
            map.on('mouseleave', 'legs', () => {
                map.getCanvas().style.cursor = '';
            });
        })
    }

    connectedCallback() {
        this.innerHTML = `<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.5.0/dist/maplibre-gl.css">
<style>
relay-map {
    display: block;
    width: 100%;
    height: 100%;
}
`
        // Make the map focusable
        this.tabIndex = 0
        let centerValue = this.attributes.getNamedItem("center").value
        let boundaryValue = this.attributes.getNamedItem("max-bounds").value
        this.style.display = "block"
        Promise.all([JSON.parse(centerValue), JSON.parse(boundaryValue)]).then(([center, boundary]) => {
            let map = new maplibregl.Map({
                container: this,
                attributionControl: false,
                style: this.attributes.getNamedItem("style-href").value,
                center: center,
                zoom: 9,
                minZoom: 9,
                maxBounds: boundary,
                transformRequest: transformRequest,
            });
            // Don't break basic page scrolling until the map is focused
            map.scrollZoom.disable()
            let container = map.getContainer();
            // container needs to have tabindex=0 to be focusable
            map.on("click", () => container.focus())
            map.on("pitchstart", () => container.focus())
            map.on("drag", () => container.focus())
            map.on("load", () => this._resolveMapReady())
            container.addEventListener('focus', () => map.scrollZoom.enable());
            container.addEventListener('blur', () => map.scrollZoom.disable());
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
            map.addControl(scale);
            map.addControl(new maplibregl.AttributionControl({
                compact: true
            }));
            this.map = map
        })
    }
}

customElements.define('relay-map', RelayMap);