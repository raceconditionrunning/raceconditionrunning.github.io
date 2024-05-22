
export function nHoursAgo(n) {
    return new Date(Date.now() - n * 60 * 60 * 1000);
}
export class LiveTrackingClient {
    #enabled
    #state
    websocket
    websocketTryInterval
    constructor(serverHost) {
        this.url = new URL(`wss://${serverHost}/ws`)
        // If you want to exclude heavy image data: /last?fields=tst,lat,lon,addr,topic,isotst
        this.lastLocationsUrl = new URL(`https://${serverHost}/api/0/last`)
        this.listUsersUrl = new URL(`https://${serverHost}/api/0/list`)
        this.websocketUrl = new URL(`wss://${serverHost}/ws/last`)
        this.#state = 'disconnected';
        this.#enabled = false
    }

    get state() {
        return this.#state;
    }

    set state(newState) {
        if (this.#state !== newState) {
            console.log(`Live Tracking state changed from ${this.#state} to ${newState}`)
            this.#state = newState;
            this._emitEvent('liveconnectionchange', newState);
        }
    }

    _emitEvent(event, newState) {
        const customEvent = new CustomEvent(event, { "detail" : {"state": newState, "source": this} });
        document.dispatchEvent(customEvent);
    }


    getLastLocations() {
        // Copy URL and add fields to only get the necessary data
        let lastLocationsUrl = new URL(this.lastLocationsUrl)
        lastLocationsUrl.searchParams.append("fields", "tst,lat,lon,addr,topic,isotst")

        return fetch(this.lastLocationsUrl)
            .then(async response => {
                if (!response.ok) {
                    throw new Error('API response is not "ok".');
                }
                const data = await response.json();
                return data["results"];
            })
            .catch(error => {
                console.error(error);
                this.state = 'error';
                throw new Error("Unable to connect to API.");
            });
    }

    getUsers(activeInLastNHours) {
        // The users endpoint will give all users (and only the users), but we'll use
        // the `last` endpoint so we get name and photo data in one go

        // Note that the active filter is post processing only right now and won't
        // reduce the initial large request. We'd have to make two requests to implement that
        return fetch(this.lastLocationsUrl)
            .then(async response => {
                if (!response.ok) {
                    throw new Error('API response is not "ok".');
                }
                const data = await response.json();
                return data;
            })
            .catch(error => {
                console.error(error);
                this.state = 'error';
                throw new Error("Unable to connect to API.");
            });
    }

    getAllUsers() {
        return fetch(this.listUsersUrl)
            .then(async response => {
                if (!response.ok) {
                    throw new Error('API response is not "ok".');
                }
                const data = await response.json();
                return data["results"];
            })
            .catch(error => {
                console.error(error);
                throw new Error("Unable to connect to API.");
            });
    }

    getLatestTrack(user, sinceDate) {
        // Request into the future so we don't miss any data due to round trip time or clock issues
        const now = nHoursAgo(-.02).toISOString();
        const sinceDateString = sinceDate.toISOString();
        const params = new URLSearchParams({
            "user": user,
            "device": "phone",
            "from": sinceDateString,
            "to": now,
            "format": "geojson"
        })
        const url = new URL(`https://${this.url.host}/api/0/locations?${params}` )
        return fetch(url)
            .then(async response => {
                if (!response.ok) {
                    throw new Error('API response is not "ok".');
                }
                const data = await response.json();
                return data.features.map(feature => [...feature.geometry.coordinates, feature.properties.tst]);
            })
            .catch(error => {
                console.error(error);
                this.state = 'error';
                throw new Error("Unable to connect to API.");
            });
    }

    disable() {
        this.#enabled = false
        clearTimeout(this.websocketTryInterval)
        this.websocketTryInterval = null
        this.websocket.close()
    }

    enable() {
        this.#enabled = true
        this._configureWebSocket()
    }

    _configureWebSocket() {
        if (this.websocket) {
            console.log("Can't enable, Live Tracking is already connected")
            return
        }
        const url = this.websocketUrl
        this.websocket = new WebSocket(url);
        this.state = 'connecting';

        this.websocket.addEventListener("open", () => {
            clearTimeout(this.websocketTryInterval)
            this.websocketTryInterval = null
            this.state = 'connected';
            const msg = 'Hello.';
            this.websocket.send(msg);
        });
        this.websocket.addEventListener("close", () => {
            // Fired for connection closes of all kinds, including erroring out
            this.state = 'disconnected';
            this.websocket = null
            // Try to reconnect unless we're disabled
            if (this.#enabled) {
                this.websocketTryInterval = setTimeout(() => console.log("trying") || this._configureWebSocket(url), 10 * 1000)
            }
        });
        this.websocket.addEventListener("message", event => {
            if (!event.data) {
                console.log("Live client received empty message (PING).");
            } else {
                let payload
                try {
                    payload = JSON.parse(event.data)
                } catch (e) {
                    // Wasn't a json blob
                    return
                }
                if (payload._type === "location") {
                    const event = new CustomEvent("livelocation", { detail: payload })
                    document.dispatchEvent(event)
                }
            }
        });
        this.websocket.addEventListener("error", event => {
            // FIXME: Close will be sent right after this, so this change won't render
            console.error(event);
            this.state = 'error';
            console.log(`<span style="color: red;">ERROR: ${event.data} </span>`);
        });

    }

}
import { LitElement, html, css } from 'lit-element';

export class ConnectionDot extends LitElement {
    static get properties() {
        return {
            state: { type: String }
        };
    }

    static get styles() {
        return css`
            :host {
                display: inline-block;
                position: relative;
                width: .75rem;
                height: .75rem;
                margin-bottom: 1px;
                border-radius: 50%;
                transition: background-color 0.2s, border-color 0.2s;
                outline: none;
                background-color: transparent;
                border: 1px solid #adadad;
            }

            :host([state="connected"]) {
                background-color: rgb(90, 208, 90);
                border-color: transparent;
            }

            :host([state="disconnected"]) {
                background-color: #adadad;
                border-color: transparent;
            }
            
            :host([state="unknown"]) {
            }

            :host([state="error"]) {
                background-color: #d33682; //rgb(255, 79, 79);
                border-color: transparent;
            }

            :host([state="connecting"]) {
                border-color: rgb(90, 208, 90);
            }
        `;
    }

    constructor() {
        super();
        this.state = 'unknown';
    }

    render() {
        return html`
            <span role="status" aria-live="polite" aria-label="${this.state}" title="${this.state}"></span>
        `;
    }

    updated(changedProperties) {
        if (changedProperties.has('state')) {
            this.setAttribute('aria-label', this.state);
            this.setAttribute('title', this.state);
        }
    }
}

customElements.define('connection-dot', ConnectionDot);
