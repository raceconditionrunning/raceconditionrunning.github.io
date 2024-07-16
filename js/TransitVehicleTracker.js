export class TransitVehicleTracker {
    constructor(apiUrl, pollingInterval = 15000) { // Default polling interval is 30 seconds
        this.apiUrl = apiUrl;
        this.pollingInterval = pollingInterval;
        this.timer = null;
        this.vehicles = [];

        document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    }

    startPolling() {
        this.poll();
        this.timer = setInterval(() => this.poll(), this.pollingInterval);
    }

    stopPolling() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    handleVisibilityChange() {
        if (document.hidden) {
            this.stopPolling();
        } else {
            this.startPolling();
        }
    }

    async poll() {
        console.log("Polling for vehicle data...")
        try {
            const response = await fetch(this.apiUrl);
            const data = await response.json();
            this.extractVehicleData(data);
        } catch (error) {
            console.error('Error fetching vehicle data:', error);
        }
    }

    extractVehicleData(data) {
        const trips = data.data.list;
        const tripMap = new Map(data.data.references.trips.map(trip => [trip.id, trip.tripHeadsign]));

        const vehicles = trips.map(trip => {
            const status = trip.status;
            const tripHeadsign = tripMap.get(status.activeTripId);

            return {
                id: status.activeTripId,
                lat: status.position.lat,
                lon: status.position.lon,
                bearing: status.orientation,
                timestamp: new Date(data.currentTime),
                realtime: status.predicted, // OBA terminology: "predicted" means real-time data
                headsign: tripHeadsign
            };
        });

        this.vehicles = vehicles;
        this.emitVehicleData(vehicles);
    }

    emitVehicleData(vehicles) {
        const event = new CustomEvent('vehicleDataUpdated', { detail: vehicles });
        document.dispatchEvent(event);
    }
}