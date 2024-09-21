export class TransitVehicleTracker {
    constructor(apiUrl, routeId, key, pollingInterval = 15000) { // Default polling interval is 30 seconds
        this.apiUrl = apiUrl;
        this.routeId = routeId;
        this.key = key
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
        try {
            const vehicleApiUrl = `${this.apiUrl}/where/trips-for-route/${this.routeId}.json?key=${this.key}&includeStatus=true&includeSchedule=false`;
            const response = await fetch(vehicleApiUrl);
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
            let lastIdNumber = status.activeTripId.split('_')
            lastIdNumber = lastIdNumber[lastIdNumber.length - 1]
            return {
                id: lastIdNumber,
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

    async getArrivalsForStop(stopId) {
        const arrivalsUrl = `${this.apiUrl}/where/arrivals-and-departures-for-stop/${stopId}.json?key=${this.key}&minutesAfter=30&minutesBefore=0`;

        try {
            const response = await fetch(arrivalsUrl);
            const data = await response.json();
            console.log(data)
            if (!data) {
                return [];
            }

            const trips = data.data.references.trips;

            const arrivals = data.data.entry.arrivalsAndDepartures.map(arrival => {
                const trip = trips.find(trip => trip.id === arrival.tripId);
                return {
                    tripId: arrival.tripId,
                    routeId: arrival.routeId,
                    scheduledArrivalTime: new Date(arrival.scheduledArrivalTime),
                    predictedArrivalTime: arrival.predictedArrivalTime ? new Date(arrival.predictedArrivalTime) : null,
                    stopId: arrival.stopId,
                    headsign: arrival.tripHeadsign,
                    directionId: trip ? Number(trip.directionId) : null
                };
            });

            return arrivals;

        } catch (error) {
            console.error('Error fetching arrivals for stop:', error);
            return [];
        }
    }
}