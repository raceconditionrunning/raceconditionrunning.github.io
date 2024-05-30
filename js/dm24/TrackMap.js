import { html, render } from 'lit-html';
import {LitElement,} from 'lit-element';

import 'maplibre-gl';


class DefaultDict {
    constructor(defaultInit) {
        return new Proxy({}, {
            get: (target, name) => name in target ?
                target[name] :
                (target[name] = typeof defaultInit === 'function' ?
                    new defaultInit().valueOf() :
                    defaultInit)
        })
    }
}



export class TrackMap extends LitElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.map = null;
        this.track = [[]]
        this.highlightedLap = null
        this.properties = {
            highlightedLap: { type: Number }
        };
        this._markerProperties = new DefaultDict(Object);
        this._userMarkers = {}
        this.render();
        this.initializeMap();
    }

    render() {
        const template = html`
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.3.2/maplibre-gl.min.css" integrity="sha512-1zfSoAFy0MQxOllHnsZoPEBz8m52JMWlDjB7tjaiiPq27l7XO23W7TUam+LIjB4p1UCFhyBDNOUzNiF+rQD1FQ==" crossorigin="anonymous" referrerpolicy="no-referrer" />
            <style>
                  #map {
                          height: 100%;
                            width: 100%;  
                    }
                    .marker {
                        
                        border-radius: 50%;
                        border: 2px solid white;
                        text-align: center;
                        font-size: .75rem;
                        width: 1.25rem;
                        height: 1.25rem;
                        line-height: 1.25rem;
                        color: white;
                        cursor: pointer;
                      font-weight: bold;
                      opacity: .95;
                      --background-color: black;
                      background-color: var(--background-color);
                    }
              .marker.lagged {
                  opacity: .7 !important;
                  }
              .marker.stale {
                    opacity: .5 !important;
                  }
                  .marker.dead {
                    display: none !important;
                    opacity: 0 !important;
                  }
              .marker.highlighted {
                z-index: 100;
                opacity: 1 !important;
                box-shadow: 0 0 10px 5px var(--background-color);
              }
              .marker.backgrounded {
                //opacity: inherit;
              }
              
            </style>
            <div id="map" tabindex="0"></div>
        `;
        render(template, this.shadowRoot);
        if (this.map) {
            // We're piggybacking on the overall render cycle (and its smart batching) to update the markers.
            // If you do it manually, you'll overload the MapLibreGL worker with geojson updates and it'll error out.
            this.refreshMarkersSource()
            if (this.map.getSource("track")) {

                this.trackFeatures.features = this.track.map((track, index) => {
                    return {
                        type: 'Feature',
                        properties: {
                            index: index,
                            color: this.highlightedLap === index ? 'red': '#888',
                        },
                        geometry: {
                            type: 'LineString',
                            coordinates: track
                        }
                    }
                })

                this.map.getSource("track").setData(this.trackFeatures)
            }
        }
    }

    initializeMap() {
        // Ensure the map container is defined
        const mapContainer = this.shadowRoot.getElementById('map');
        const centerAttribute = this.getAttribute('data-center');
        if (centerAttribute) {
            this.center = JSON.parse(centerAttribute);
        }
        const startAngleAttribute = this.getAttribute('data-start-angle');
        if (startAngleAttribute) {
            this.startAngle = parseFloat(startAngleAttribute);
        }
        if (mapContainer) {
            let map = new maplibregl.Map({
                container: mapContainer,
                style: 'https://api.maptiler.com/maps/streets/style.json?key=YvNrcU9QI9xFBf4H4cam',
                center: this.center,
                bearing: -45,
                pitch: 45,
                zoom: 17,
                minZoom: 16,
            });
            this.map = map;
            if (map.getLayer('poi-layer-id')) {
                map.removeLayer('poi-layer-id');
            }




            this.map.scrollZoom.disable()
            // container needs to have tabindex=0 to be focusable
            this.map.on("click", () => mapContainer.focus())
            this.map.on("pitchstart", () => mapContainer.focus())
            this.map.on("drag", () => mapContainer.focus())
            mapContainer.addEventListener('focus', () => this.map.scrollZoom.enable());
            mapContainer.addEventListener('blur', () => this.map.scrollZoom.disable());

            map.on('load', () => {
                this.loadBounds()
                /*map.addSource('markers', {
                    type: 'geojson',
                    data: {
                        type: 'FeatureCollection',
                        features: []
                    }
                });*/

                this.trackFeatures = {
                    'type': 'FeatureCollection',
                    'features': [{
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: []
                        }
                    }]
                };
                // Line metrics drop us to 1fps on Safari
                this.map.addSource('track', {
                    type: 'geojson',
                    //lineMetrics: true,
                    'data': this.trackFeatures
                });
                this.map.addLayer({
                    id: 'track',
                    type: 'line',
                    source: 'track',
                    layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    paint: {
                        'line-color': ['get', 'color'],
                        'line-width': 2,
                        /*'line-gradient': [
                            'interpolate',
                            ['linear'],
                            ['line-progress'],
                            0,
                            'blue',
                            0.1,
                            'royalblue',
                            0.3,
                            'cyan',
                            0.5,
                            'lime',
                            0.7,
                            'yellow',
                            1,
                            'red'
                        ]*/
                    }
                });
                //HACK: Make default style sparser
                const layers = this.map.getLayersOrder();
                // Get all layers with "poi" in the name
                layers.filter(name => name.includes('poi_')).forEach(name => {
                    this.map.removeLayer(name);
                });
                this.map.removeLayer("housenumber")
                const pathLayer = this.map.getLayer('road_path_pedestrian');
                if (pathLayer) {
                    map.setPaintProperty('road_path_pedestrian', 'line-dasharray', [1, 0]);
                    // Make the line white
                    map.setPaintProperty('road_path_pedestrian', 'line-color', '#FFFFFF');
                }


                map.setPaintProperty('water', 'fill-color', '#3CB6BF');


                // The map doesn't render at the correct height on Safari without this.
                // It works after refreshing in any case though...
                map.resize()
            });
        }
    }


    updateTrack(track) {
        this.track = track
        this.requestUpdate()

    }
    updateMarker(name, property, value) {
        this._markerProperties[name][property] = value;
        this.requestUpdate();
    }

    refreshMarkersSource() {
        // Get just the features with points
        const havePoints = Object.keys(this._markerProperties).filter(name => this._markerProperties[name].point);
        const withoutPoints = Object.keys(this._markerProperties).filter(name => !this._markerProperties[name].point);
        const features = havePoints.map(name => {
            return {
                type: 'Feature',
                properties: {
                    name: name
                },
                geometry: {
                    type: 'Point',
                    coordinates: this._markerProperties[name].point
                }
            };
        });
        // add markers to map
        features.forEach((entry) => {
            // Check if there is already a marker for this user
            let marker = this._userMarkers[entry.properties.name]
            if (!marker) {
                let el = document.createElement('div');
                el.className = 'marker';
                el.dataset.name = entry.properties.name;
                el.style.backgroundSize = 'cover';
                el.addEventListener('click', () => {
                    let customEvent = new CustomEvent('marker-click', { detail: entry.properties.name });
                    this.dispatchEvent(customEvent);
                });

                marker = new maplibregl.Marker({element: el})
                    .setLngLat(entry.geometry.coordinates)
                    .addTo(this.map);
                this._userMarkers[entry.properties.name] = marker

            } else {
                marker.setLngLat(entry.geometry.coordinates);
            }
            const props =  this._markerProperties[entry.properties.name]
            const el = marker.getElement();
            el.style.display = props.visible ? 'block' : 'none';
            if (props.backgroundColor) {
                el.style.setProperty("--background-color", props.backgroundColor);
            }
            el.classList.remove('lagged', 'stale', 'dead');
            if (props.freshness > 80) {
                el.classList.add('dead');
            } else if (props.freshness > 60) {
                el.classList.add('stale');
            } else if (props.freshness > 20) {
                el.classList.add('lagged');
            }
            if (props.highlighted) {
                el.classList.add('highlighted');
            } else {
                el.classList.remove('highlighted');
            }

            if (props.imageData) {
                marker.getElement().style.backgroundImage = `url(data:image/png;base64,${props.imageData})`;
            } else {
                marker.getElement().innerText = entry.properties.name;
            }

        });
        // Remove markers for users that don't have points
        withoutPoints.forEach(name => {
            let marker = this._userMarkers[name]
            if (marker) {
                marker.remove();
                delete this._userMarkers[name]
            }
        });
    }

    loadBounds() {
        const boundsJson = this.getAttribute('data-bounds');
        if (!boundsJson) {
            return;
        }
        const boundsFeature = JSON.parse(boundsJson);
        const boundsGeoJson = {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'Polygon',
                coordinates: boundsFeature
            }
        };
        // Ensure the source and layer for bounds don't already exist
        if (this.map.getSource('bounds')) {
            this.map.removeLayer('bounds');
            this.map.removeSource('bounds');
        }

        this.map.addSource('bounds', {
            type: 'geojson',
            data: boundsGeoJson
        });

        this.map.addLayer({
            id: 'bounds',
            type: 'fill',
            source: 'bounds',
            layout: {},
            paint: {
                'fill-color': '#FFFFFF',
                'fill-opacity': 0.4
            }
        });
    }

    addLiveBounds(points) {
        // Ugh
        if (this.map.loaded()) {
            this._addLiveBounds(points);
        } else {
            this.map.on('load', () => {
                this._addLiveBounds(points)
            });
        }
    }

    _addLiveBounds(points) {
        const boundsGeoJson = {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'Polygon',
                coordinates: points
            }
        };
        // Ensure the source and layer for bounds don't already exist
        if (this.map.getSource('live-bounds')) {
            this.map.removeLayer('live-bounds');
            this.map.removeSource('live-bounds');
        }

        this.map.addSource('live-bounds', {
            type: 'geojson',
            data: boundsGeoJson
        });

        this.map.addLayer({
            id: 'live-bounds',
            type: 'line',
            source: 'live-bounds',
            layout: {},
            paint: {
                'line-color': '#000000',
                'line-opacity': 0.1
            }
        });
    }

    static get observedAttributes() { return ['data-center', 'data-bounds']; }

    attributeChangedCallback(name, oldValue, newValue) {
        return;
        if (name === 'data-bounds' && this.map) {
            this.loadBounds();
        }
    }
}

customElements.define('track-map', TrackMap);