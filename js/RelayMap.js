import { LitElement, html, css } from 'lit';
import { formatLegDescription } from "./common.js";
import { FrameControl } from "./FrameControl.js";
import { ElevationProfile } from "./ElevationProfile.js";
import { Protocol } from 'pmtiles';
import maplibregl from 'maplibre-gl';
import { along, distance, point, nearestPointOnLine, lineString } from '@turf';


function queryNearestDistanceAlongLegs(queryPoint, legs) {
    let totalDistance = 0;
    const line = lineString(legs.reduce((acc, leg) => acc.concat(leg.geometry.coordinates), []));
    const nearest = nearestPointOnLine(line, queryPoint, { units: 'meters' });

    for (let i = 1; i < line.geometry.coordinates.length; i++) {
        const segmentDist = distance(line.geometry.coordinates[i - 1], line.geometry.coordinates[i], { units: 'meters' });
        totalDistance += segmentDist;
        if (i === nearest.properties.index) {
            totalDistance += distance(nearest.geometry.coordinates, line.geometry.coordinates[i], { units: 'meters' });
            break;
        }
    }

    return [totalDistance, { lng: nearest.geometry.coordinates[0], lat: nearest.geometry.coordinates[1] }];
}

const calcSplitImportance = (distance) => {
    const frac = distance % 1;
    // If the distance is an integer, return 4 (most important)
    if (frac === 0) return 4;

    // Find the largest power of 2 that divides the fractional part
    let powerOf2 = 0;
    let temp = frac;
    while (temp !== Math.floor(temp) && powerOf2 < 10) {
        temp *= 2;
        powerOf2++;
    }

    return Math.max(1, 4 - powerOf2);
};

function placeSplits(line, atEach=1.0, units='meters') {
    const splits = [];
    let totalDistance = 0;
    let nextSplit = atEach;
    for (let i = 1; i < line.geometry.coordinates.length; i++) {
        const segmentDist = distance(line.geometry.coordinates[i - 1], line.geometry.coordinates[i], { units: units });
        // NOTE: A long line segment could have multiple splits. We need to exhaust all splits in a segment
        while (totalDistance + segmentDist >= nextSplit) {
            // Interpolate the split point along the previous segment
            const leftToGo = nextSplit - totalDistance;
            const splitPoint = along(lineString([line.geometry.coordinates[i - 1], line.geometry.coordinates[i]]), leftToGo, { units: units }).geometry.coordinates;
            // 1.0 -> 4, .5 -> 3, 0.25 -> 2, 0.1 -> 1
            const majorness = calcSplitImportance(nextSplit)
            splits.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: splitPoint
                },
                properties: {
                    distance: nextSplit,
                    index: i - 1, // Index of the segment where the split occurs
                    importance: majorness
                }
            });
            nextSplit += atEach;
        }
        totalDistance += segmentDist;
    }

    return splits;
}


export class RelayMap extends LitElement {
    static styles = css`
       
    `;

    static properties = {
        center: { type: Array },
        maxBounds: { type: Array, attribute: 'max-bounds' },
        styleHref: { type: String, attribute: 'style-href' },
        legs: { type: Object },
        exchanges: { type: Object },
        exchangeNames: { type: Object },
        trains: { type: Object },
        railLines: { type: Object },
        useStationCodes: { type: Boolean, attribute: 'use-station-codes' },
        lineColors: { type: Object },
        imgBasePath: { type: String, attribute: 'img-base-path' },
        pointCollections: { type: Object },
        pois: { type: Object },
        loading: { type: Boolean },
        liveArrivalsSetup: { type: Boolean, state: true }
    };

    constructor() {
        super();

        // Initialize properties
        this.center = [0, 0];
        this.maxBounds = [];
        this.styleHref = '';
        this.legs = null;
        this.exchanges = null;
        this.exchangeNames = {};
        this.trains = null;
        this.railLines = null;
        this.useStationCodes = false;
        this.lineColors = {};
        this.imgBasePath = '';
        this.pointCollections = {};
        this.pois = null;
        this.loading = true;
        this.liveArrivalsSetup = false;

        this.mapReady = new Promise((resolve) => {
            this._resolveMapReady = resolve;
        });

        let protocol = new Protocol();
        maplibregl.addProtocol("pmtiles", protocol.tile);
        this.map = null;
        this.frameControl = null;
        this.popupStore = new Map();
        this.landmarkMarkers = new Map();
    }

    render() {
        return html`
            <div class="map-container">
                ${this.loading ? html`
                    <div class="map-loading text-muted">
                        <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
                        Loading map data...
                    </div>
                ` : ''}
            </div>
        `;
    }

    createRenderRoot() {
        // Light DOM rendering
        return this;
    }

    firstUpdated() {
        this.initializeMap();
        if (this.useStationCodes) {
            const stationImages = ['1', '2', '3', '4', 'T'];
            for (const code of stationImages) {
                if (this.map.hasImage(`${code}stationcode`)) continue;
                try {
                    this.map.loadImage(`${this.imgBasePath}${code}_station_code_vertical_dark.png`).then((image) => {
                        if (!image || !image.data) {
                            console.warn(`Image for ${code} not found or invalid.`);
                            return;
                        }
                        this.map.addImage(`${code}stationcode`, image.data, { pixelRatio: 4 });
                    })
                    this.map.loadImage(`${this.imgBasePath}${code}_station_code_vertical_dark_small.png`).then((image) => {
                        if (!image || !image.data) {
                            console.warn(`Image for ${code} not found or invalid.`);
                            return;
                        }
                        this.map.addImage(`${code}stationcodesmall`, image.data, { pixelRatio: 3 });

                    })
                } catch (e) {
                    console.warn(`Failed to load station code image for ${code}:`, e);
                }
            }
            // Generate a roundrect texture
            const canvas = document.createElement('canvas');
            canvas.width = 108;
            canvas.height = 72;
            const radius = 12;
            const padding = 8;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(0, 0, canvas.width, canvas.height, radius);
            ctx.fill();
            // FIXME: The corners are visibly stretched for short mile markers. Are the stretch regions correct?
            this.map.addImage('roundrect', {
                width: canvas.width,
                height: canvas.height,
                data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
                stretchX: [radius + 1, canvas.width - radius - 1],
                stretchY: [radius + 1, canvas.height - radius - 1],
                content: [radius + 1 + padding, radius + 1 + padding, canvas.width - radius - 1 - padding, canvas.height - radius - 1 - padding],
                pixelRatio: 3,
                sdf: true
            });


        }
    }

    updated(changedProperties) {
        this.mapReady.then(() => {
            if (changedProperties.has('legs') && this.legs) {
                this.updateLegs();
            }

            if (changedProperties.has('exchanges') && this.exchanges) {
                this.updateExchanges();
            }

            if (changedProperties.has('trains') && this.trains) {
                this.updateTrains();
            }

            if (changedProperties.has('railLines') && this.railLines) {
                this.updateRailLines();
            }

            if (changedProperties.has('pointCollections')) {
                this.updatePointCollections();
            }

            if (changedProperties.has('pois') && this.pois) {
                this.updatePOIs();
            }
        });
    }

    initializeMap() {
        const mapContainer = this.renderRoot.querySelector('.map-container');
        const maxBounds = this.maxBounds.reduce((bounds, coord) => {
            return bounds.extend(coord);
        }, new maplibregl.LngLatBounds(this.maxBounds[0], this.maxBounds[0]));

        this.map = new maplibregl.Map({
            container: mapContainer,
            attributionControl: true,
            style: this.styleHref,
            center: sessionStorage.getItem('mapCenter') ? JSON.parse(sessionStorage.getItem('mapCenter')) : this.center,
            zoom: Number(sessionStorage.getItem('mapZoom')) || 10, // Note that the loading event won't fire if any tile in view can't be loaded. We don't have full terrain, so we need to be zoomed in
            pitch: Number(sessionStorage.getItem('mapPitch')) || 0,
            bearing: Number(sessionStorage.getItem('mapBearing')) || 0,
            minZoom: 8,
            maxBounds: maxBounds,
            hash: false
        });
        this.map.on('load', () => {
            this._resolveMapReady();
        });

        this.setupMapControls();
        this.setupMapEvents();
    }

    setupMapControls() {
        // Don't break basic page scrolling until the map is focused
        this.map.scrollZoom.disable();
        let canvas = this.map.getCanvas();

        canvas.addEventListener('focus', () => this.map.scrollZoom.enable());
        canvas.addEventListener('blur', () => {
            if (!this.contains(document.activeElement))
                this.map.scrollZoom.disable();
        });

        let nav = new maplibregl.NavigationControl();
        this.map.addControl(nav, 'top-left');
        this.map.addControl(new maplibregl.FullscreenControl({ container: this.map.getContainer() }), 'top-left');
        this.map.addControl(new maplibregl.GeolocateControl({
            positionOptions: {
                enableHighAccuracy: true
            },
            trackUserLocation: true
        }), 'top-left');

        let scale = new maplibregl.ScaleControl({
            maxWidth: 80,
            unit: 'imperial'
        });

        this.frameControl = new FrameControl({ bounds: () => this.map.homeBounds, padding: 32 });
        this.map.addControl(this.frameControl, 'top-left');
        this.map.addControl(scale);
    }

    setupMapEvents() {
        const mapDetailPopup = new maplibregl.Popup({
            closeButton: true,
            closeOnClick: true,
            focusAfterOpen: false,
        });

        this.map.on('contextmenu', (e) => {
            const coords = e.lngLat;
            mapDetailPopup
                .setLngLat([coords.lng, coords.lat])
                .setHTML(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} ${(this.map.queryTerrainElevation(coords) * 3.28).toFixed(2)}ft`)
                .addTo(this.map);
        });

        this.map.on("click", () => this.map.getCanvas().focus());
        this.map.on("pitchstart", () => this.map.getCanvas().focus());
        this.map.on("drag", () => this.map.getCanvas().focus());

        this.map.on('moveend', () => {
            sessionStorage.setItem('mapCenter', JSON.stringify(this.map.getCenter()));
            sessionStorage.setItem('mapZoom', JSON.stringify(this.map.getZoom()));
            sessionStorage.setItem('mapPitch', JSON.stringify(this.map.getPitch()));
            sessionStorage.setItem('mapBearing', JSON.stringify(this.map.getBearing()));
            console.log(`Zoom level: ${this.map.getZoom()}`);
            this.updateLandmarkImages();
        });
    }

    updateLegs() {
        if (!this.legs) return;

        const legsData = this.legs.features;

        this.map.getSource('legs').setData(this.legs);

        // Update bounds
        const relayBounds = legsData.reduce((bounds, leg) =>
            leg.geometry.coordinates.reduce((bounds, coord) => {
                return bounds.extend(coord);
            }, bounds), new maplibregl.LngLatBounds(legsData[0].geometry.coordinates[0], legsData[0].geometry.coordinates[0]));

        this.map.homeBounds = relayBounds;
        if (this.frameControl) {
            this.frameControl.update();
        }

        if (this.map.getZoom() < 10) {
            this.map.fitBounds(relayBounds, {padding: 32});
        }

        // Numeric leg numbers
        const labels = legsData.map((leg) => {
            const coordinates = leg.geometry.coordinates;
            const totalDistance = coordinates.reduce((total, coord, index) => {
                if (index === 0) return total;
                return total + distance(coordinates[index - 1], coord, { units: 'meters' });
            }, 0);
            const midPoint = along(lineString(coordinates), totalDistance / 2, { units: 'meters' }).geometry.coordinates;
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
            };
        });


        this.map.getSource('leg-labels').setData({
            type: 'FeatureCollection',
            features: labels
        });

        const overallSplits = placeSplits(lineString(legsData.flatMap(leg => leg.geometry.coordinates)), 0.25, 'miles');

        this.map.getSource('overall-splits').setData({
            "type": "FeatureCollection",
            "features": overallSplits
        })

        const allLegSplits = legsData.flatMap(leg => {
            const legSplits = placeSplits(leg, 0.25, 'miles')
            legSplits.forEach(splits => {
                splits.properties.legId = leg.properties.id;
            })
            return legSplits
        })

        this.map.getSource('leg-splits').setData({
            "type": "FeatureCollection",
            "features": allLegSplits
        });

        this.setupLegInteractions(legsData);

    }

    updateExchanges() {
        if (!this.exchanges) return;

        this.map.getSource('exchanges').setData(this.exchanges);

        if (this.useStationCodes) {
            this.map.setLayoutProperty("exchange-id", 'visibility', 'none');
            this.map.setLayoutProperty('exchange-station-code', 'visibility', 'visible');
        } else {
            this.map.setLayoutProperty('exchange-station-code', 'visibility', 'none');
            this.map.setLayoutProperty("exchange-id", 'visibility', 'visible');
        }

        this.setupExchangeInteractions();
        this.updateLandmarkImages();
    }

    updateTrains() {
        if (!this.trains) return;
        this.map.getSource("trains").setData(this.trains);

    }

    updateRailLines() {
        if (!this.railLines) return;
        this.map.getSource("rail-lines").setData(this.railLines);
    }

    updatePointCollections() {
        Object.entries(this.pointCollections).forEach(([name, { collection, style }]) => {
            if (this.map.getSource(name)) {
                this.map.getSource(name).setData(collection);
                return;
            }

            this.map.addSource(name, {
                type: 'geojson',
                data: collection
            });

            this.map.addLayer({
                id: name,
                source: name,
                ...style
            });
        });
    }

    updatePOIs() {
        if (!this.pois) return;

        // Filter to only include POI features and ensure they have the feature_type property
        const poisFeatures = (this.pois.features || []).filter(feature =>
            feature.properties && feature.properties.feature_type === 'poi'
        );

        const poiCollection = {
            type: 'FeatureCollection',
            features: poisFeatures
        };

        // Update or create POI source
        if (this.map.getSource('pois')) {
            this.map.getSource('pois').setData(poiCollection);
        } else {
            this.map.addSource('pois', {
                type: 'geojson',
                data: poiCollection
            });
        }

        this.setupPOIInteractions();
    }

    setupPOIInteractions() {
        const updatePOICursor = (e) => {
            this.map.getCanvas().style.cursor = 'pointer';
        };

        const removePOICursor = () => {
            this.map.getCanvas().style.cursor = '';
        };

        // Add interactions for both POI layers
        ['pois', 'pois-labels'].forEach(layerId => {
            this.map.on('mouseenter', layerId, updatePOICursor);
            this.map.on('mouseleave', layerId, removePOICursor);
            this.map.on('click', layerId, {
                // Zoom to POI on click
                zoomToExchange: (e) => {
                    const poi = e.features[0];
                    const coordinates = poi.geometry.coordinates;
                    const bounds = new maplibregl.LngLatBounds(coordinates, coordinates);
                    this.map.fitBounds(bounds, {
                        padding: 32,
                        maxZoom: 17
                    });
                }
            });
        });
    }

    _legClickHandler(legsData, e) {
        const leg = legsData.find(l => l.properties.id === e.features[0].id);
        const coordinates = leg.geometry.coordinates;
        const bounds = coordinates.reduce((bounds, coord) => {
            return bounds.extend(coord);
        }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));

        const legDetails = {
            ...leg.properties
        }
        legDetails.id += 1; // Convert to 1-based index for display
        legDetails.coordinates = coordinates; // Store the coordinates for elevation profile
        this.currentLegPopup = new maplibregl.Popup({
            anchor: "bottom-left",
            offset: [16, 0],
            className: "leg-popup",
            focusAfterOpen: false
        })
            .setLngLat([bounds.getEast(), bounds.getCenter().lat])
            .setMaxWidth("300px")
            .setHTML(formatLegDescription(
                this.exchangeNames[leg.properties.start_exchange],
                this.exchangeNames[leg.properties.end_exchange],
                legDetails
            ))
            .addTo(this.map);

        this.currentLegPopup.on("close", () => {
            this.highlightLeg(null);
            this.focus();
        });

        const profile = this.currentLegPopup._content.querySelector("elevation-profile");
        if (profile) {
            profile.style.width = "100%";
            profile.style.height = "64px";
            profile.elevationData = leg.geometry.coordinates;
        }

        this.map.fitBounds(bounds, { padding: 32 });
        this.highlightLeg(leg.properties.id);
    }

    setupLegInteractions(legsData) {
        this.currentLegPopup = null;

        // maplibre compares this handle with equality, so we need to keep a reference to ensure
        // we can call `off`
        this._registeredLegClickHandler = this._registeredLegClickHandler ?? this._legClickHandler.bind(this, legsData)
        // remove existing click listeners to avoid duplicates
        this.map.off('click', 'legs', this._registeredLegClickHandler);
        this.map.on('click', 'legs', this._registeredLegClickHandler);
        // Make sure each leg feature has selected state set to false
        this.highlightLeg(null)
        this.setupDistancePopup(legsData);
    }

    setupDistancePopup(legsData) {
        const distancePopup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            focusAfterOpen: false,
            className: 'distance-popup'
        });

        const updateDistancePopup = (e) => {
            this.map.getCanvas().style.cursor = 'pointer';
            const coordinates = [e.lngLat.lng, e.lngLat.lat];
            const leg = legsData.filter(l => l.properties.id === e.features[0].id);
            const [distanceAlongLine, _] = queryNearestDistanceAlongLegs(point(coordinates), legsData);
            const [distanceAlongLeg, nearestPoint] = queryNearestDistanceAlongLegs(point(coordinates), leg);

            distancePopup
                .setLngLat(nearestPoint)
                .setHTML(`${(distanceAlongLine / 1609.34).toFixed(2)}mi <br><span class="leg-dist">${e.features[0].id + 1}: ${(distanceAlongLeg / 1609.34).toFixed(2)}mi</span>`)
                .addTo(this.map);
        };
        const removeDistancePopup = () => {
                this.map.getCanvas().style.cursor = '';
                distancePopup.remove();
        }
        this._registeredUpdateDistancePopup = this._registeredUpdateDistancePopup ?? updateDistancePopup;
        this._registeredRemoveDistancePopup = this._registeredRemoveDistancePopup ?? removeDistancePopup;
        this.map.off('mouseenter', 'legs-hover-region', this._registeredUpdateDistancePopup);
        this.map.off('mousemove', 'legs-hover-region', this._registeredUpdateDistancePopup);

        this.map.on('mouseenter', 'legs-hover-region', this._registeredUpdateDistancePopup);
        this.map.on('mousemove', 'legs-hover-region', this._registeredUpdateDistancePopup);
        this.map.off('mouseleave', 'legs-hover-region', this._registeredRemoveDistancePopup);
        this.map.on('mouseleave', 'legs-hover-region', this._registeredRemoveDistancePopup);
    }

    setupExchangeInteractions() {
        const updateExchangeCursor = (e) => {
            this.map.getCanvas().style.cursor = 'pointer';
        };

        const zoomToExchange = (e) => {
            const exchange = e.features[0];
            const coordinates = exchange.geometry.coordinates;
            const bounds = new maplibregl.LngLatBounds(coordinates, coordinates);
            this.map.fitBounds(bounds, {
                padding: 32,
                maxZoom: 17
            });
        };

        ['exchange-name', 'exchange-station-code'].forEach(layerId => {
            this.map.on('mouseenter', layerId, updateExchangeCursor);
            this.map.on('mousemove', layerId, updateExchangeCursor);
            this.map.on('mouseleave', layerId, () => {
                this.map.getCanvas().style.cursor = '';
            });
            this.map.on('click', layerId, zoomToExchange);
        });
    }

    updateLandmarkImages() {
        if (!this.exchanges) return;

        const zoom = this.map.getZoom();
        const bounds = this.map.getBounds();

        // Only show landmarks at zoom 15+
        if (zoom < 15) {
            this.clearLandmarkImages();
            return;
        }

        // Update sizes of existing markers
        const baseSize = 80;
        const scaleFactor = Math.min(3.0, Math.max(0.8, (zoom - 14) * 0.25 + 0.8));
        const imageSize = Math.round(baseSize * scaleFactor);

        this.landmarkMarkers.forEach(marker => {
            const img = marker.getElement().querySelector('img');
            if (img) {
                img.style.maxWidth = `${imageSize}px`;
                img.style.maxHeight = `${imageSize}px`;
            }
        });

        // Get currently visible exchanges with landmark images
        const visibleExchangesWithImages = this.exchanges.features.filter(exchange => {
            const coords = exchange.geometry.coordinates;
            const hasImage = exchange.properties.image_url;
            const isVisible = bounds.contains(coords);
            return hasImage && isVisible;
        });

        // Remove markers that are no longer needed
        this.landmarkMarkers.forEach((marker, exchangeId) => {
            const stillVisible = visibleExchangesWithImages.some(ex => ex.properties.id === exchangeId);
            if (!stillVisible) {
                marker.remove();
                this.landmarkMarkers.delete(exchangeId);
            }
        });

        // Add markers for newly visible exchanges
        visibleExchangesWithImages.forEach(exchange => {
            const exchangeId = exchange.properties.id;
            if (!this.landmarkMarkers.has(exchangeId)) {
                const marker = this.createLandmarkMarker(exchange);
                if (marker) {
                    this.landmarkMarkers.set(exchangeId, marker);
                }
            }
        });
    }

    createLandmarkMarker(exchange) {
        const coords = exchange.geometry.coordinates;
        const imageUrl = exchange.properties.image_url;

        if (!imageUrl) return null;

        const element = document.createElement('div');
        element.className = 'landmark-marker';

        const img = document.createElement('img');
        img.loading = 'lazy';
        img.src = imageUrl;
        img.alt = exchange.properties.name || 'Exchange landmark';
        img.style.cssText = `
            max-width: 80px;
            max-height: 80px;
            object-fit: cover;
            border-radius: 6px;
            border: 2px solid #ffffff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: block;
        `;

        // Handle image load errors
        img.onerror = () => {
            element.style.display = 'none';
        };

        element.appendChild(img);

        const marker = new maplibregl.Marker({
            element: element,
            anchor: 'bottom-left',
            offset: [28, -40],
            focusAfterOpen: false
        })
            .setLngLat(coords)
            .addTo(this.map);

        return marker;
    }

    clearLandmarkImages() {
        this.landmarkMarkers.forEach(marker => marker.remove());
        this.landmarkMarkers.clear();
    }

    // Public API methods
    highlightLeg(legId) {
        this.mapReady.then(() => {
            this.map.setGlobalStateProperty('selectedLeg', legId);
            if (legId) {
                this.map.setFeatureState(
                    {source: 'legs', id: legId},
                    {selected: true}
                );
            }

            this.map.querySourceFeatures("legs").forEach((feature) => {
                if (feature.id !== legId) {
                    this.map.setFeatureState(
                        {source: 'legs', id: feature.id},
                        {selected: false
                        }
                    );
                }
            });
        });
    }

    addPoints(name, collection, style = {}) {
        this.mapReady.then(() => {
            if (!this.pointCollections) {
                this.pointCollections = {};
            }
            this.pointCollections[name] = {collection, style};
            this.requestUpdate();
        });
    }


    registerLiveArrivalsSource(exchanges, endpoint) {
        this.mapReady.then(() => {
            try {
                if (!this.map.hasImage(`${this.imgBasePath}lrv.png`)) {
                    this.map.loadImage(`${this.imgBasePath}lrv.png`).then(image => {
                        this.map.addImage('lrv', image.data, {
                            content: [0, 0, 1, 1],
                            pixelRatio: 2,
                            sdf: true
                        });
                    });
                }
            } catch (e) {
                console.warn('Failed to load LRV icon:', e);
            }
            const updateArrivals = async (popup, stopCodeNorth, stopCodeSouth) => {
                try {
                    const [northboundArrivals, southboundArrivals] = await Promise.all([
                        endpoint(stopCodeNorth),
                        endpoint(stopCodeSouth)
                    ]);

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
                        let tripId = "";
                        if (arrival.tripId) {
                            tripId = "#" + arrival.tripId.substring(arrival.tripId.length - 4);
                        }
                        return {
                            ...arrival,
                            time: new Date(arrivalTime),
                            realtime: isRealtime,
                            minutesUntilArrival: minutesUntilArrival,
                            html: `<tr><td><span class="line-marker line-${arrival.routeId}"></span></td><td class="trip-destination"> ${arrival.headsign} <span class="trip-id">${tripId}</span></td><td class="trip-eta text-end" nowrap="true">${realtimeSymbol}${duration}</td></tr>`
                        };
                    }

                    // Combine and sort arrivals by time
                    let combinedArrivals = [...northboundArrivals, ...southboundArrivals];

                    // Remove duplicate trip IDs
                    const seenTripIds = new Set();
                    combinedArrivals = combinedArrivals.filter(arrival => {
                        if (seenTripIds.has(arrival.tripId)) {
                            return false;
                        }
                        seenTripIds.add(arrival.tripId);
                        return true;
                    });

                    combinedArrivals = combinedArrivals
                        .map(arrival => formatArrival(arrival))
                        .sort((a, b) => a.time - b.time)
                        .filter(arrival => new Date(arrival.predictedArrivalTime || arrival.scheduledArrivalTime) > currentTime);

                    // Balance arrivals by direction (max 4 total, prefer 2 each direction)
                    const arrivals = [];
                    let dir0Count = 0;
                    let dir1Count = 0;

                    for (let i = 0; i < combinedArrivals.length; i++) {
                        const arrival = combinedArrivals[i];
                        if (arrivals.length < 4) {
                            arrivals.push(arrival);
                            arrival.directionId === 0 ? dir0Count++ : dir1Count++;
                        } else {
                            // Try to balance the count
                            if (dir0Count < 2 && arrival.directionId === 0) {
                                for (let idx = arrivals.length - 1; idx >= 0; idx--) {
                                    if (arrivals[idx].directionId === 1) {
                                        arrivals[idx] = arrival;
                                        dir0Count++;
                                        dir1Count--;
                                        break;
                                    }
                                }
                            } else if (dir1Count < 2 && arrival.directionId === 1) {
                                for (let idx = arrivals.length - 1; idx >= 0; idx--) {
                                    if (arrivals[idx].directionId === 0) {
                                        arrivals[idx] = arrival;
                                        dir1Count++;
                                        dir0Count--;
                                        break;
                                    }
                                }
                            }
                        }
                        if (dir0Count === 2 && dir1Count === 2) break;
                    }

                    if (arrivals.length === 0) {
                        arrivals.push({
                            html: '<tr><td colspan="3">No upcoming arrivals</td></tr>'
                        });
                    }

                    const combinedContent = arrivals.map(arrival => arrival.html).join('');
                    popup.setHTML(`<table>${combinedContent}</table>`);
                } catch (error) {
                    console.error('Error updating arrivals:', error);
                    popup.setHTML('<div>Error loading arrivals</div>');
                }
            };

            const handleMapMoveEnd = async () => {
                const zoom = this.map.getZoom();
                const pitch = this.map.getPitch();
                const bounds = this.map.getBounds();

                // If conditions are not met, remove all popups and clear intervals
                if (zoom < 17 || pitch > 50) {
                    this.popupStore.forEach(({ popup, intervalId }) => {
                        clearInterval(intervalId);
                        this.fadeOutAndRemovePopup(popup);
                    });
                    this.popupStore.clear();
                    return;
                }

                // Clear out-of-bounds popups
                this.popupStore.forEach(({ popup, intervalId }, exchangeId) => {
                    if (!bounds.contains(popup.getLngLat())) {
                        clearInterval(intervalId);
                        this.fadeOutAndRemovePopup(popup);
                        this.popupStore.delete(exchangeId);
                    }
                });

                for (const exchange of exchanges.features) {
                    const exchangeCoords = exchange.geometry.coordinates;
                    const exchangeId = exchange.properties.id;
                    const { stopCodeNorth, stopCodeSouth } = exchange.properties;

                    if (this.popupStore.has(exchangeId) ||
                        !bounds.contains(exchangeCoords) ||
                        !(stopCodeNorth && stopCodeSouth)) {
                        continue;
                    }

                    // Create and show a single popup anchored at the top left
                    const popup = new maplibregl.Popup({
                        offset: [20, 40],
                        anchor: 'top-left',
                        className: 'arrivals-popup',
                        closeOnClick: false,
                        focusAfterOpen: false,
                        maxWidth: '260px'
                    })
                        .setLngLat(exchangeCoords)
                        .setHTML('Loading...')
                        .addTo(this.map);

                    // Initial update call
                    await updateArrivals(popup, stopCodeNorth, stopCodeSouth);

                    // Store the popup and start the update interval
                    const intervalId = setInterval(() => {
                        updateArrivals(popup, stopCodeNorth, stopCodeSouth);
                    }, 20000); // Refresh every 20 seconds

                    this.popupStore.set(exchangeId, { popup, intervalId });
                }
            };

            this.map.on('moveend', handleMapMoveEnd);
            // Call the handler immediately to handle the initial load
            handleMapMoveEnd();
        });
    }

    fadeOutAndRemovePopup(popup) {
        const popupElement = popup._content?.parentElement;
        if (!popupElement) return;
        popupElement.classList.add('fade-out');
        setTimeout(() => popup.remove(), 500); // Wait for the fade-out transition to complete
    }

    disconnectedCallback() {
        super.disconnectedCallback();

        // Clean up intervals when component is removed
        if (this.popupStore) {
            this.popupStore.forEach(({ popup, intervalId }) => {
                clearInterval(intervalId);
                popup.remove();
            });
            this.popupStore.clear();
        }

        // Clean up landmark markers
        if (this.landmarkMarkers) {
            this.clearLandmarkImages();
        }

        // Remove map if it exists
        if (this.map) {
            this.map.remove();
        }
    }
}

customElements.define('relay-map', RelayMap);