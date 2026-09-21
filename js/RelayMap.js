import { LitElement, html, css } from 'lit';
import { formatLegDescription, legsForLine, exchangeStationCode, exchangeLineCode } from "./common.js";
import { FrameControl } from "./FrameControl.js";
import { ElevationProfile } from "./ElevationProfile.js";
import { Protocol } from 'pmtiles';
import * as maplibregl from 'maplibre-gl';
import { along, distance, point, nearestPointOnLine, lineString } from '@turf';

//  maps OBA's route id to the single digit that train's own line badge uses elsewhere on the page.
const ARRIVAL_ROUTE_LINE_CODES = {
    "40_100479": "1",
    "40_2LINE": "2",
};

// layer ids that draw from the "rail-lines" source, so they can all be brought forward
const RAIL_LINE_LAYERS = ['tunnel_lightrail', 'lightrail', 'lightrail_hatching', 'bridge_lightrail', 'bridge_lightrail_hatching'];

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

/**
 * Wash a line's colour most of the way to white: enough of a tinge to tell two leg numbers apart, not so
 * much that the label stops reading as white text on the map.
 */
function tintTowardsWhite(color, weight = 0.6) {
    const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color ?? '');
    if (!match) return '#ffffff';
    const channels = match.slice(1)
        .map(hex => Math.round(parseInt(hex, 16) * (1 - weight) + 255 * weight))
        .map(value => value.toString(16).padStart(2, '0'));
    return `#${channels.join('')}`;
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
        this.currentPOIs = null;
        this.activeLines = new Set();
        this.availableLines = [];
        this.exchangeLines = new Map();
        this.stationCodeImages = new Set();
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
        this.lineFilterControl = null;
        this.poiInteractionsSetup = false;
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

        // Generate a roundrect texture
        const roundrectCanvas = document.createElement('canvas');
        roundrectCanvas.width = 108;
        roundrectCanvas.height = 72;
        const radius = 12;
        const padding = 8;
        const roundrectCtx = roundrectCanvas.getContext('2d');
        roundrectCtx.fillStyle = '#ffffff';
        roundrectCtx.beginPath();
        roundrectCtx.roundRect(0, 0, roundrectCanvas.width, roundrectCanvas.height, radius);
        roundrectCtx.fill();
        // FIXME: The corners are visibly stretched for short mile markers. Are the stretch regions correct?
        this.map.addImage('roundrect', {
            width: roundrectCanvas.width,
            height: roundrectCanvas.height,
            data: roundrectCtx.getImageData(0, 0, roundrectCanvas.width, roundrectCanvas.height).data,
            stretchX: [radius + 1, roundrectCanvas.width - radius - 1],
            stretchY: [radius + 1, roundrectCanvas.height - radius - 1],
            content: [radius + 1 + padding, radius + 1 + padding, roundrectCanvas.width - radius - 1 - padding, roundrectCanvas.height - radius - 1 - padding],
            pixelRatio: 3,
            sdf: true
        });

        if (!this.useStationCodes) {
            // Relays from before station codes existed (LRR23) marked each exchange with a plain numbered
            // dot rather than a line-code badge. Draw that dot so those pages keep their original look.
            const dotCanvas = document.createElement('canvas');
            const size = 24;
            dotCanvas.width = size;
            dotCanvas.height = size;
            const dotCtx = dotCanvas.getContext('2d');
            dotCtx.fillStyle = '#000000';
            dotCtx.beginPath();
            dotCtx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
            dotCtx.fill();
            dotCtx.fillStyle = '#FFFFFF';
            dotCtx.beginPath();
            dotCtx.arc(size / 2, size / 2, size / 2 - 1, 0, 2 * Math.PI);
            dotCtx.fill();
            this.map.addImage('legacy-exchange-circle', {
                width: dotCanvas.width,
                height: dotCanvas.height,
                data: dotCtx.getImageData(0, 0, dotCanvas.width, dotCanvas.height).data,
                pixelRatio: 4
            });
        }
    }

    updated(changedProperties) {
        this.mapReady.then(() => {
            if (changedProperties.has('legs') && this.legs) {
                this.updateAvailableLines();
                this.updateLegs();
            }

            if (changedProperties.has('exchanges') && this.exchanges) {
                this.updateAvailableLines();
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
                this.updateAvailableLines();
                this.updatePOIs();
            }
        });
    }

    isLineActive(line) {
        return this.activeLines.has(line);
    }

    toggleLine(line) {
        if (this.activeLines.has(line)) {
            this.activeLines.delete(line);
        } else {
            this.activeLines.add(line);
        }
        if (this.refreshLegColors()) this.map.getSource('legs')?.setData(this.legs);
        this.refreshLegLabels();
        this.updateFeatureVisibility();
        this.updateLineFilterControl();
        this.updateLandmarkImages();
        this.clearArrivalPopups();
    }

    updateAvailableLines() {
        const lines = new Set();
        [this.legs, this.pois].forEach(collection => {
            (collection?.features || []).forEach(feature => {
                (feature.properties?.lines || []).forEach(line => lines.add(line));
            });
        });
        const nextLines = [...lines].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
        if (nextLines.join('|') !== this.availableLines.join('|')) {
            this.availableLines = nextLines;
            // Newly-seen lines start visible; lines that have disappeared drop out of the active set.
            nextLines.forEach(line => this.activeLines.add(line));
            [...this.activeLines].forEach(line => {
                if (!lines.has(line)) this.activeLines.delete(line);
            });
            this.updateLineFilterControl();
        }
        this.updateFeatureVisibility();
    }

    /**
     * The digit (or letter) a line's key is known by elsewhere on the page, e.g. "lrr_1line" -> "1".
     */
    lineDigit(line) {
        return String(line).match(/\d+/)?.[0] ?? line;
    }

    updateLineFilterControl() {
        if (!this.map) return;
        const mapContainer = this.renderRoot.querySelector('.map-container');
        if (!mapContainer) return;

        if (this.availableLines.length <= 1) {
            this.lineFilterControl?.remove();
            this.lineFilterControl = null;
            return;
        }

        if (!this.lineFilterControl) {
            this.lineFilterControl = document.createElement('div');
            this.lineFilterControl.className = 'map-line-filter';
            this.lineFilterControl.setAttribute('role', 'group');
            this.lineFilterControl.setAttribute('aria-label', 'Line filter');
            // Top left is taken by the navigation, fullscreen and geolocate controls
            this.lineFilterControl.style.position = 'absolute';
            this.lineFilterControl.style.top = '0.75rem';
            this.lineFilterControl.style.right = '0.75rem';
            this.lineFilterControl.style.zIndex = '2';
            mapContainer.appendChild(this.lineFilterControl);
        }

        this.lineFilterControl.replaceChildren();
        this.availableLines.forEach(line => {
            const active = this.isLineActive(line);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `map-line-filter-btn${active ? '' : ' map-line-filter-btn-inactive'}`;
            button.setAttribute('aria-pressed', String(active));
            button.setAttribute('aria-label', `Toggle line ${this.lineDigit(line)}`);

            const number = document.createElement('span');
            number.className = 'map-line-filter-number';
            number.style.backgroundColor = this.lineColors?.[line] ?? '#888';
            number.textContent = this.lineDigit(line);
            button.appendChild(number);

            button.addEventListener('click', () => this.toggleLine(line));
            this.lineFilterControl.appendChild(button);
        });
    }

    /**
     * The lines a feature belongs to, or undefined if it doesn't claim any. Legs and POIs carry their own
     * `lines`; exchanges inherit theirs from the legs that meet there.
     */
    linesForFeature(feature) {
        return feature.properties?.lines ?? this.exchangeLines.get(feature.properties?.id);
    }

    /**
     * Filtering hides features whose lines are all toggled off. Features with no line at all — future
     * exchanges, everything in a single-route relay — always stay put.
     */
    featureLineVisible(feature) {
        const lines = this.linesForFeature(feature);
        return !lines?.length || lines.some(line => this.isLineActive(line));
    }

    /**
     * Cumulative mileage is measured from the start of a line, so with more than one line shown there is
     * no meaningful "overall" distance until exactly one is toggled on.
     */
    overallSplitVisible(feature) {
        const lines = feature.properties?.lines;
        if (!lines?.length) return true;
        return this.activeLines.size === 1 && lines.some(line => this.isLineActive(line));
    }

    getLineVisibilityExpression(visibleValue = 1, hiddenValue = 0) {
        return [
            'case',
            ['boolean', ['feature-state', 'lineVisible'], true],
            visibleValue,
            hiddenValue
        ];
    }

    setLayerPaintProperty(layerId, property, value) {
        if (this.map.getLayer(layerId)) {
            this.map.setPaintProperty(layerId, property, value);
        }
    }

    /**
     * With every relay line toggled off there's no coloured route left on the map, so bring the physical
     * rail lines forward — darker and a bit wider — instead of leaving the map looking empty. Reverts back
     * to the style's own dim treatment as soon as any line is showing.
     */
    updateRailLineSalience() {
        const salient = this.activeLines.size === 0;
        this.railLineDefaults = this.railLineDefaults ?? new Map();
        RAIL_LINE_LAYERS.forEach(layerId => {
            const layer = this.map.getLayer(layerId);
            if (!layer) return;
            if (!this.railLineDefaults.has(layerId)) {
                this.railLineDefaults.set(layerId, {
                    color: this.map.getPaintProperty(layerId, 'line-color'),
                    width: this.map.getPaintProperty(layerId, 'line-width'),
                    // The wider "salient" width is pre-scaled and baked into the style's layer metadata,
                    // since a "zoom" expression (as line-width is here) can't be nested inside a runtime
                    // ["*", width, factor] expression — it's only legal as top-level step/interpolate input.
                    salientWidth: layer.metadata?.['salient-line-width']
                });
            }
            const { color, width, salientWidth } = this.railLineDefaults.get(layerId);
            this.map.setPaintProperty(layerId, 'line-color', salient ? '#eee' : color);
            this.map.setPaintProperty(layerId, 'line-width', salient ? salientWidth ?? width : width);
        });
    }

    updateLineVisibilityState(sourceId, collection, visible = feature => this.featureLineVisible(feature)) {
        if (!collection || !this.map.getSource(sourceId)) return;
        (collection.features || []).forEach(feature => {
            const id = feature.id ?? feature.properties?.id;
            if (id == null) return;
            this.map.setFeatureState(
                { source: sourceId, id },
                { lineVisible: visible(feature) }
            );
        });
    }

    updateFeatureVisibility() {
        if (!this.map) return;
        this.updateRailLineSalience();
        this.updateLineVisibilityState('legs', this.legs);
        this.updateLineVisibilityState('leg-labels', this.currentLegLabels);
        this.updateLineVisibilityState('overall-splits', this.currentOverallSplits, feature => this.overallSplitVisible(feature));
        this.updateLineVisibilityState('leg-splits', this.currentLegSplits);
        this.updateLineVisibilityState('exchanges', this.exchanges);
        this.updateLineVisibilityState('pois', this.currentPOIs);

        // The route fades out as the streets underneath come into view. That fade is line-layer-opacity
        // rather than line-opacity so the layer is composited once — a translucent line drawn per segment
        // blends with itself and turns solid at every kink. line-opacity is left to the line filter, which
        // is per feature and so can't live on the layer.
        ['legs', 'legs-secondary'].forEach(layerId => {
            this.setLayerPaintProperty(layerId, 'line-opacity', this.getLineVisibilityExpression(1));
            this.setLayerPaintProperty(layerId, 'line-layer-opacity', [
                'interpolate', ['linear'], ['zoom'],
                14, 1,
                15, 0.6,
                16, 0.45
            ]);
        });

        ['overall-splits', 'leg-splits'].forEach(layerId => {
            this.setLayerPaintProperty(layerId, 'icon-opacity', this.getLineVisibilityExpression(0.75));
            this.setLayerPaintProperty(layerId, 'text-opacity', this.getLineVisibilityExpression(1));
        });
        this.setLayerPaintProperty('leg-labels', 'text-opacity', this.getLineVisibilityExpression(1));

        this.setLayerPaintProperty('exchange-circle-current', 'icon-opacity', this.getLineVisibilityExpression(1));
        this.setLayerPaintProperty('exchange-circle-future', 'icon-opacity', this.getLineVisibilityExpression(0.25));
        this.setLayerPaintProperty('exchange-station-code', 'icon-opacity', this.getLineVisibilityExpression(1));
        this.setLayerPaintProperty('exchange-station-code', 'text-opacity', this.getLineVisibilityExpression(1));
        this.setLayerPaintProperty('exchange-id', 'text-opacity', this.getLineVisibilityExpression(1));
        this.setLayerPaintProperty('exchange-name', 'text-opacity', this.getLineVisibilityExpression(1));
        this.setLayerPaintProperty('exchange-station-code-future', 'icon-opacity', this.getLineVisibilityExpression(0.5));
        this.setLayerPaintProperty('exchange-station-code-future', 'text-opacity', this.getLineVisibilityExpression(0.5));
        this.setLayerPaintProperty('exchange-name-future', 'text-opacity', this.getLineVisibilityExpression(0.6));

        this.setLayerPaintProperty('pois', 'circle-opacity', this.getLineVisibilityExpression(0.9));
        this.setLayerPaintProperty('pois-labels', 'text-opacity', this.getLineVisibilityExpression(1));
    }

    clearArrivalPopups() {
        this.popupStore.forEach(({ popup, intervalId }) => {
            clearInterval(intervalId);
            this.fadeOutAndRemovePopup(popup);
        });
        this.popupStore.clear();
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
            //console.log(`Zoom level: ${this.map.getZoom()}`);
        });
        this.map.on('zoom', () => {
           this.updateLandmarkImages();
        })
    }

    updateLegs() {
        if (!this.legs) return;

        const legsData = this.legs.features;

        this.refreshLegColors();
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

        this.updateExchangeLines(legsData);

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
                    sequence: leg.properties.sequence,
                    lines: leg.properties.lines,
                    ...this.legLabelProperties(leg)
                }
            };
        });

        this.currentLegLabels = {
            type: 'FeatureCollection',
            features: labels
        };
        this.map.getSource('leg-labels').setData(this.currentLegLabels);

        this.currentOverallSplits = {
            "type": "FeatureCollection",
            "features": this.buildOverallSplits(legsData)
        };
        this.map.getSource('overall-splits').setData(this.currentOverallSplits)

        const allLegSplits = legsData.flatMap(leg => {
            const legSplits = placeSplits(leg, 0.25, 'miles')
            legSplits.forEach((splits, index) => {
                splits.properties.id = `leg-${leg.properties.id}-split-${index}`;
                splits.properties.legId = leg.properties.id;
                splits.properties.lines = leg.properties.lines;
            })
            return legSplits
        })

        this.currentLegSplits = {
            "type": "FeatureCollection",
            "features": allLegSplits
        };
        this.map.getSource('leg-splits').setData(this.currentLegSplits);
        this.updateFeatureVisibility();

        this.setupLegInteractions(legsData);

    }

    /**
     * An exchange belongs to whichever lines pass through it, which only the legs know.
     */
    updateExchangeLines(legsData) {
        this.exchangeLines = new Map();
        legsData.forEach(leg => {
            const { lines = [], start_exchange, end_exchange } = leg.properties;
            if (!lines.length) return;
            [start_exchange, end_exchange].forEach(exchangeId => {
                if (exchangeId == null) return;
                const known = this.exchangeLines.get(exchangeId) ?? [];
                this.exchangeLines.set(exchangeId, [...new Set([...known, ...lines])]);
            });
        });
    }

    /**
     * A leg's position is stated per line, so a leg shared by two lines has two numbers. Show the number for
     * whichever of its lines are currently toggled on — one if only one is, both if both are. Ordered to
     * match legColors, so the numbers and the colours they're tinged with pair up.
     */
    legNumbering(leg) {
        const { sequence = [], lines = [] } = leg.properties;
        if (!lines.length) return sequence.map(position => ({ number: String(position + 1) }));
        const shown = lines.filter(line => this.isLineActive(line));
        return shown.map(line => ({
            number: String(sequence[lines.indexOf(line)] + 1),
            color: this.lineColors?.[line]
        }));
    }

    legSequenceLabel(leg) {
        return this.legNumbering(leg).map(entry => entry.number).join('/');
    }

    /**
     * The label layer draws each number as its own section, so they arrive as separate properties.
     */
    legLabelProperties(leg) {
        const [primary, secondary] = this.legNumbering(leg);
        return {
            label: primary?.number ?? '',
            labelColor: tintTowardsWhite(primary?.color),
            labelSecondary: secondary?.number,
            labelSecondaryColor: secondary && tintTowardsWhite(secondary.color)
        };
    }

    /**
     * The colours a leg is drawn in, most important first, limited to whichever of its lines are currently
     * toggled on. A leg shared by two lines that are both showing gets both, drawn as a parallel pair;
     * turning one off collapses it back down to a single colour.
     */
    legColors(leg) {
        const lines = leg.properties.lines || [];
        return lines.filter(line => this.isLineActive(line)).map(line => this.lineColors?.[line]).filter(Boolean);
    }

    refreshLegColors() {
        if (!this.legs) return false;
        let changed = false;
        this.legs.features.forEach(leg => {
            const [color, secondary] = this.legColors(leg);
            if (!color) return;
            // Only a leg that is drawn as a pair carries a second colour; the style keys off its presence
            const next = { lineColor: color, lineColorSecondary: secondary };
            for (const [key, value] of Object.entries(next)) {
                if (leg.properties[key] === value) continue;
                changed = true;
                if (value === undefined) delete leg.properties[key];
                else leg.properties[key] = value;
            }
        });
        return changed;
    }

    refreshLegLabels() {
        if (!this.currentLegLabels || !this.legs) return;
        const byId = new Map(this.legs.features.map(leg => [leg.properties.id, this.legLabelProperties(leg)]));
        this.currentLegLabels.features.forEach(label => {
            for (const [key, value] of Object.entries(byId.get(label.properties.id) ?? {})) {
                if (value === undefined) delete label.properties[key];
                else label.properties[key] = value;
            }
        });
        this.map.getSource('leg-labels')?.setData(this.currentLegLabels);
    }

    /**
     * Cumulative mile markers run from the start of each line, so a relay with several lines gets several
     * chains of them. Legs are ordered along the line they're being measured on, not by leg id.
     */
    buildOverallSplits(legsData) {
        const lines = [...new Set(legsData.flatMap(leg => leg.properties.lines || []))];
        const chains = lines.length
            ? lines.map(line => [line, legsForLine(legsData, line)])
            : [[null, legsData]];

        return chains.flatMap(([line, chainLegs]) => {
            const splits = placeSplits(lineString(chainLegs.flatMap(leg => leg.geometry.coordinates)), 0.25, 'miles');
            splits.forEach((split, index) => {
                split.properties.id = `overall-${line ?? 'route'}-${index}`;
                if (line) split.properties.lines = [line];
            });
            return splits;
        });
    }

    /**
     * The chain of legs a distance along the route should be measured against: whichever of the leg's lines
     * is currently toggled on, or failing that, whichever line the leg under the cursor runs on.
     */
    lineChainFor(leg) {
        const legsData = this.legs?.features ?? [];
        const lines = leg?.properties?.lines || [];
        const line = lines.find(line => this.isLineActive(line)) ?? lines[0];
        return line ? legsForLine(legsData, line) : legsData;
    }

    updateExchanges() {
        if (!this.exchanges) return;

        // The station code and line badge live in the exchange id rather than in properties of their own
        this.currentExchanges = {
            type: 'FeatureCollection',
            features: this.exchanges.features.map(exchange => ({
                ...exchange,
                properties: {
                    ...exchange.properties,
                    station_code: exchangeStationCode(exchange.properties.id),
                    line_code: exchangeLineCode(exchange.properties.id)
                }
            }))
        };

        this.map.getSource('exchanges').setData(this.currentExchanges);
        this.loadStationCodeImages(this.currentExchanges.features);
        this.updateShortStationNames();
        // Trains may have arrived before the stations that name their destinations
        if (this.trains) this.updateTrains();
        this.updateFeatureVisibility();

        if (this.useStationCodes) {
            this.map.setLayoutProperty("exchange-id", 'visibility', 'none');
            this.map.setLayoutProperty('exchange-station-code', 'visibility', 'visible');
        } else {
            this.map.setLayoutProperty('exchange-station-code', 'visibility', 'none');
            this.map.setLayoutProperty("exchange-id", 'visibility', 'visible');
            // Without station codes there's no line badge to draw on the circle layers, so point them at
            // the plain numbered dot instead of the (never-loaded) line-code icon.
            ['exchange-circle-current', 'exchange-circle-future'].forEach(layerId => {
                this.map.setLayoutProperty(layerId, 'icon-image', 'legacy-exchange-circle');
                this.map.setLayoutProperty(layerId, 'icon-size', { stops: [[6, 0.25], [9, 0.5], [12, 1]] });
                this.map.setLayoutProperty(layerId, 'icon-allow-overlap', true);
                this.map.setLayoutProperty(layerId, 'icon-ignore-placement', true);
            });
        }

        this.setupExchangeInteractions();
        this.updateLandmarkImages();
    }

    /**
     * Load a badge image per line code present in the data. An exchange shared by two lines carries both
     * digits ("12"), and so needs its own combined badge.
     */
    loadStationCodeImages(exchanges) {
        if (!this.useStationCodes) return;

        const codes = new Set(exchanges.map(exchange => exchange.properties.line_code).filter(Boolean));
        for (const code of codes) {
            if (this.stationCodeImages.has(code)) continue;
            this.stationCodeImages.add(code);

            const load = (suffix, name, pixelRatio) =>
                this.map.loadImage(`${this.imgBasePath}${code}_station_code_vertical_dark${suffix}.png`)
                    .then(image => {
                        if (!image?.data) throw new Error('no image data');
                        if (!this.map.hasImage(name)) this.map.addImage(name, image.data, { pixelRatio });
                    })
                    .catch(e => console.warn(`Failed to load station code image for line ${code}:`, e));

            load('', `${code}stationcode`, 4);
            load('_small', `${code}stationcodesmall`, 3);
        }
    }

    /**
     * Some stations state a shorter name to be known by in passing — on a headsign or an arrivals board,
     * where "International District/Chinatown" is more than the space deserves.
     */
    shortStationName(name) {
        return this.shortStationNames?.get(name);
    }

    updateShortStationNames() {
        this.shortStationNames = new Map(
            (this.exchanges?.features || [])
                .filter(exchange => exchange.properties.short_name)
                .map(exchange => [exchange.properties.name, exchange.properties.short_name])
        );
    }

    updateTrains() {
        if (!this.trains) return;

        // Headsigns are long enough to crowd the map, so prefer the station's short name where there is one
        this.map.getSource("trains").setData({
            ...this.trains,
            features: (this.trains.features || []).map(train => {
                const short = this.shortStationName(train.properties?.headsign);
                if (!short) return train;
                return { ...train, properties: { ...train.properties, headsignShort: short } };
            })
        });
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
        this.currentPOIs = poiCollection;

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
        this.updateFeatureVisibility();
    }

    setupPOIInteractions() {
        if (this.poiInteractionsSetup) return;
        this.poiInteractionsSetup = true;

        const updatePOICursor = (e) => {
            this.map.getCanvas().style.cursor = e.features.some(feature => this.featureLineVisible(feature)) ? 'pointer' : '';
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
                    const poi = e.features.find(feature => this.featureLineVisible(feature));
                    if (!poi) return;
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
        const feature = e.features.find(feature => this.featureLineVisible(feature));
        if (!feature) return;
        const leg = legsData.find(l => l.properties.id === feature.id);
        if (!leg) return;
        const coordinates = leg.geometry.coordinates;
        const bounds = coordinates.reduce((bounds, coord) => {
            return bounds.extend(coord);
        }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));

        const legDetails = {
            ...leg.properties
        }
        legDetails.id = this.legSequenceLabel(leg); // Legs are identified by their position on the line
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
            const feature = e.features.find(feature => this.featureLineVisible(feature));
            if (!feature) {
                this.map.getCanvas().style.cursor = '';
                distancePopup.remove();
                return;
            }
            this.map.getCanvas().style.cursor = 'pointer';
            const coordinates = [e.lngLat.lng, e.lngLat.lat];
            const leg = legsData.find(l => l.properties.id === feature.id);
            if (!leg) return;
            const [distanceAlongLine, _] = queryNearestDistanceAlongLegs(point(coordinates), this.lineChainFor(leg));
            const [distanceAlongLeg, nearestPoint] = queryNearestDistanceAlongLegs(point(coordinates), [leg]);

            distancePopup
                .setLngLat(nearestPoint)
                .setHTML(`${(distanceAlongLine / 1609.34).toFixed(2)}mi <br><span class="leg-dist">${this.legSequenceLabel(leg)}: ${(distanceAlongLeg / 1609.34).toFixed(2)}mi</span>`)
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
            this.map.getCanvas().style.cursor = e.features.some(feature => this.featureLineVisible(feature)) ? 'pointer' : '';
        };

        const zoomToExchange = (e) => {
            const exchange = e.features.find(feature => this.featureLineVisible(feature));
            if (!exchange) return;
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
        const scaleFactor = Math.min(4.5, Math.max(0.8, (zoom - 14) * 0.35 + 0.8));
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
            return hasImage && isVisible && this.featureLineVisible(exchange);
        });

        // Remove markers that are no longer needed
        this.landmarkMarkers.forEach((marker, exchangeId) => {
            const stillVisible = visibleExchangesWithImages.some(ex => ex.properties.id === exchangeId);
            if (!stillVisible) {
                marker.getElement().classList.add('opacity-0');
                setTimeout(() => marker.remove(), 500); // Wait for the fade-out transition to complete
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
        this.landmarkMarkers.forEach(marker => {
            marker.getElement().classList.add('opacity-0');
            setTimeout(() => marker.remove(), 500); // Wait for the fade-out transition to complete
        });
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
        const exchangeIdByName = new Map(exchanges.features.map(exchange => [exchange.properties.name, exchange.properties.id]));

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
            const updateArrivals = async (popup, stops) => {
                try {
                    const arrivalLists = await Promise.all(
                        stops.flatMap(({ north, south }) => [
                            north ? endpoint(north) : Promise.resolve([]),
                            south ? endpoint(south) : Promise.resolve([])
                        ])
                    );

                    const currentTime = new Date();
                    // A narrow popup, so give the destination its short name where the station has one
                    const destination = (arrival) => this.shortStationName(arrival.headsign) ?? arrival.headsign;

                    function formatArrival(arrival) {
                        const arrivalTime = arrival.predictedArrivalTime || arrival.scheduledArrivalTime;
                        const isRealtime = arrival.predictedArrivalTime !== null;
                        const secondsUntilArrival = Math.round((new Date(arrivalTime) - currentTime) / 1000);
                        const minutesUntilArrival = Math.round(secondsUntilArrival / 60);
                        const isImminent = secondsUntilArrival < 30;
                        let duration = isImminent ? '<span class="trip-now">Now</span>' : `${minutesUntilArrival} min`;
                        let realtimeSymbol = '';
                        if (isRealtime) {
                            realtimeSymbol = '<span class="realtime-symbol"></span>';
                        }
                        let tripId = "";
                        if (arrival.tripId) {
                            tripId = "#" + arrival.tripId.substring(arrival.tripId.length - 4);
                        }
                        const destinationId = exchangeIdByName.get(arrival.headsign);
                        const stationCode = exchangeStationCode(destinationId);
                        const lineCode = ARRIVAL_ROUTE_LINE_CODES[arrival.routeId];
                        const lineBadge = (stationCode && lineCode)
                            ? `<span class="link-station-label link-station-label-dark"><span class="line-name line-name-${lineCode}">${lineCode}</span><span class="link-station-code">${stationCode}</span></span>`
                            : `<span class="line-marker line-${arrival.routeId}"></span>`;
                        return {
                            ...arrival,
                            time: new Date(arrivalTime),
                            realtime: isRealtime,
                            minutesUntilArrival: minutesUntilArrival,
                            html: `<tr><td>${lineBadge}</td><td class="trip-destination"> ${destination(arrival)} <span class="trip-id">${tripId}</span></td><td class="trip-eta text-end" nowrap="true">${realtimeSymbol}${duration}</td></tr>`
                        };
                    }

                    // Combine and sort arrivals by time
                    let combinedArrivals = arrivalLists.flat();

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
                const exchangeById = new Map(exchanges.features.map(exchange => [exchange.properties.id, exchange]));
                this.popupStore.forEach(({ popup, intervalId }, exchangeId) => {
                    const exchange = exchangeById.get(exchangeId);
                    if (!bounds.contains(popup.getLngLat()) || !exchange || !this.featureLineVisible(exchange)) {
                        clearInterval(intervalId);
                        this.fadeOutAndRemovePopup(popup);
                        this.popupStore.delete(exchangeId);
                    }
                });

                for (const exchange of exchanges.features) {
                    const exchangeCoords = exchange.geometry.coordinates;
                    const exchangeId = exchange.properties.id;
                    const props = exchange.properties;
                    // A station is one stop per direction, named on the exchange itself
                    const stops = props.stopCodeNorth || props.stopCodeSouth
                        ? [{ north: props.stopCodeNorth, south: props.stopCodeSouth }]
                        : [];

                    if (this.popupStore.has(exchangeId) ||
                        !bounds.contains(exchangeCoords) ||
                        !this.featureLineVisible(exchange) ||
                        stops.length === 0) {
                        continue;
                    }

                    // Create and show a single popup anchored at the top left
                    const popup = new maplibregl.Popup({
                        offset: [20, 40],
                        anchor: 'top-left',
                        className: 'arrivals-popup',
                        closeOnClick: false,
                        focusAfterOpen: false,
                        maxWidth: '320px'
                    })
                        .setLngLat(exchangeCoords)
                        .setHTML('Loading...')
                        .addTo(this.map);

                    // Initial update call
                    await updateArrivals(popup, stops);

                    // Store the popup and start the update interval
                    const intervalId = setInterval(() => {
                        updateArrivals(popup, stops);
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
        popupElement.classList.add('opacity-0');
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
