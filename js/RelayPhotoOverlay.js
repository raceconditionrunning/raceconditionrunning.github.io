import * as maplibregl from 'maplibre-gl';
import {photoAge} from './RelayLiveData.js';

export class RelayPhotoOverlay {
    constructor(relay, exchanges) {
        this.relay = relay; this.map = relay.map;
        this.exchanges = new Map(exchanges.features.map(e => [String(e.properties.id), e]));
        this.markers = new Map(); this.photos = [];
        this.update = () => this.render();
        this.map.on('moveend', this.update);
        this.place = () => { for (const {marker} of this.markers.values()) marker.setOffset(this.markerOffset()); };
        this.map.on('zoom', this.place);
        // Line controls may change without a map movement.
        this.observer = new MutationObserver(this.update);
        this.observer.observe(relay.querySelector('.map-container'), {subtree: true, attributes: true, attributeFilter: ['aria-pressed']});
        this.timer = setInterval(this.update, 15000);
        // Fresh photos pulse, unless the reader has asked for less motion.
        this.pulseTimer = setInterval(() => {
            if (!this.map.getLayer('team-photo-halo-fresh') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            this.dim = !this.dim;
            this.map.setPaintProperty('team-photo-halo-fresh', 'circle-opacity', this.dim ? 0.2 : 0.65);
        }, 1250);
    }
    /** Halos are drawn in the map, beneath the station codes, so they can never cover one. */
    ensureHaloLayers() {
        if (this.map.getSource('team-photos')) return;
        this.map.addSource('team-photos', {type: 'geojson', data: {type: 'FeatureCollection', features: []}});
        const before = this.map.getLayer('exchange-circle-current') ? 'exchange-circle-current' : undefined;
        for (const [id, filter] of [['team-photo-halo', ['!', ['get', 'fresh']]], ['team-photo-halo-fresh', ['get', 'fresh']]]) {
            this.map.addLayer({id, type: 'circle', source: 'team-photos', filter, paint: {
                // Wide enough to show around the station code, which appears at zoom 12
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 11.99, 14, 12, 28, 16, 42],
                'circle-color': ['case', ['get', 'old'], '#a69bac', '#d784ff'],
                'circle-blur': 0.5,
                'circle-opacity': ['case', ['get', 'old'], 0.3, 0.45],
                'circle-opacity-transition': {duration: 1250},
            }}, before);
        }
        this.map.setPaintProperty('team-photo-halo-fresh', 'circle-opacity', 0.65);
    }
    setPhotos(photos) { this.photos = photos; this.render(); }
    /**
     * Sit left of the station code, the one side neither the station name nor the landmark photo uses.
     *  The code badge is 20px wide and scales 1.2x-1.8x over zooms 12-16; below 12 only a dot is drawn,
     *  so the marker can sit on the point.
     */
    markerOffset() {
        const zoom = this.map.getZoom();
        if (zoom < 12) return [0, 0];
        const badgeScale = 1.2 + 0.6 * Math.min(1, (zoom - 12) / 4);
        return [-(10 * badgeScale + 15), 0];
    }
    render() {
        const groups = new Map();
        for (const photo of this.photos) {
            if (!photo.lines.some(line => this.relay.isLineActive(line))) continue;
            if (!this.exchanges.has(photo.exchange)) continue;
            if (!groups.has(photo.exchange)) groups.set(photo.exchange, []);
            groups.get(photo.exchange).push(photo);
        }
        this.ensureHaloLayers();
        const halos = [];
        for (const [id, entry] of this.markers) if (!groups.has(id)) { entry.marker.remove(); this.markers.delete(id); }
        for (const [id, photos] of groups) {
            const exchange = this.exchanges.get(id);
            let entry = this.markers.get(id);
            if (!entry) {
                const element = document.createElement('button');
                element.type = 'button'; element.className = 'team-photo-marker';
                const popup = new maplibregl.Popup({offset: 20, maxWidth: '320px'});
                const marker = new maplibregl.Marker({element, offset: this.markerOffset()}).setLngLat(exchange.geometry.coordinates).setPopup(popup).addTo(this.map);
                entry = {element, popup, marker}; this.markers.set(id, entry);
            }
            const newest = Math.max(...photos.map(p => Date.parse(p.capturedAt)));
            const fresh = Date.now() - newest < 10 * 60000;
            const old = Date.now() - newest > 30 * 60000;
            entry.element.classList.toggle('photo-old', old);
            halos.push({type: 'Feature', geometry: exchange.geometry, properties: {fresh, old}});
            const dot = document.createElement('span'); dot.className = 'photo-dot';
            const label = document.createElement('span'); label.className = 'photo-label';
            label.hidden = this.map.getZoom() < 12;
            label.textContent = photos.slice(0, 3).map(p => `${p.name} · ${photoAge(p.capturedAt)}`).join('\n') + (photos.length > 3 ? `\n+${photos.length - 3} more` : '');
            entry.element.replaceChildren(dot, label);
            entry.element.setAttribute('aria-label', `${exchange.properties.name}: ${photos.map(p => `${p.name}, photo ${photoAge(p.capturedAt)}`).join('; ')}`);
            const content = document.createElement('div'); content.className = 'team-photo-details';
            const title = document.createElement('strong'); title.textContent = exchange.properties.name; content.append(title);
            for (const photo of photos) {
                const row = document.createElement('p');
                row.textContent = `${photo.name} — photo ${photoAge(photo.capturedAt)}\nTaken ${new Date(photo.capturedAt).toLocaleString()}\nUploaded ${new Date(photo.uploadedAt).toLocaleString()}`;
                content.append(row);
            }
            const note = document.createElement('small'); note.textContent = 'Latest team photos. Photos may lag teams.'; content.append(note);
            entry.popup.setDOMContent(content);
        }
        this.map.getSource('team-photos').setData({type: 'FeatureCollection', features: halos});
    }
    destroy() {
        clearInterval(this.timer); clearInterval(this.pulseTimer);
        for (const id of ['team-photo-halo', 'team-photo-halo-fresh']) if (this.map.getLayer(id)) this.map.removeLayer(id);
        if (this.map.getSource('team-photos')) this.map.removeSource('team-photos');
        this.observer.disconnect(); this.map.off('moveend', this.update); this.map.off('zoom', this.place); for (const {marker} of this.markers.values()) marker.remove();
    }
}
