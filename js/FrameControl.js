
export class FrameControl {
    constructor(options) {
        this.options = options || {};
        this.map = null;
        this.container = null;
    }
    onAdd(map) {
        this.map = map;
        this.container = document.createElement('div');
        this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        this.container.innerHTML = `
        <button class="maplibregl-ctrl-frame">
          <span class="maplibregl-ctrl-icon" aria-hidden="true" title="Zoom to fit"></span>
        </button>
    `;
        const span =  this.container.querySelector("span")
        span.style.transition = "opacity 0.2s ease-in-out";

       span.style.backgroundImage = "url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMSIgZGF0YS1uYW1lPSJMYXllciAxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgdmlld0JveD0iMCAwIDMwIDMwIj4KICA8ZGVmcz4KICAgIDxzdHlsZT4KICAgICAgLmNscy0xIHsKICAgICAgICBmaWxsOiAjMzMzOwogICAgICAgIHN0cm9rZS13aWR0aDogMHB4OwogICAgICB9CiAgICA8L3N0eWxlPgogIDwvZGVmcz4KICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xOCw4aDNjLjYsMCwxLC40LDEsMXYzYzAsLjYuNCwxLDEsMWgxYy42LDAsMS0uNCwxLTF2LTZjMC0uNi0uNC0xLTEtMWgtNmMtLjYsMC0xLC40LTEsMXYxYzAsLjYuNCwxLDEsMVoiLz4KICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik04LDEydi0zYzAtLjYuNC0xLDEtMWgzYy42LDAsMS0uNCwxLTF2LTFjMC0uNi0uNC0xLTEtMWgtNmMtLjYsMC0xLC40LTEsMXY2YzAsLjYuNCwxLDEsMWgxYy42LDAsMS0uNCwxLTFaIi8+CiAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMjIsMTh2M2MwLC42LS40LDEtMSwxaC0zYy0uNiwwLTEsLjQtMSwxdjFjMCwuNi40LDEsMSwxaDZjLjYsMCwxLS40LDEtMXYtNmMwLS42LS40LTEtMS0xaC0xYy0uNiwwLTEsLjQtMSwxWiIvPgogIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEyLDIyaC0zYy0uNiwwLTEtLjQtMS0xdi0zYzAtLjYtLjQtMS0xLTFoLTFjLS42LDAtMSwuNC0xLDF2NmMwLC42LjQsMSwxLDFoNmMuNiwwLDEtLjQsMS0xdi0xYzAtLjYtLjQtMS0xLTFaIi8+Cjwvc3ZnPg==')";
        this.container.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const targetBounds = typeof this.options.bounds === 'function' ? this.options.bounds() : this.options.bounds;
            if (!targetBounds) {
                console.warn("FrameControl: No bounds provided to fit the map to.");
                return;
            }
            this.map.fitBounds(targetBounds, {
                duration: this.options.duration ?? 1000,
                padding: this.options.padding ?? 0,
            });
        })
        this.update()
        this.map.on('moveend', this.update.bind(this));
        return this.container;
    }

    update() {
        const button = this.container.querySelector("button")
        const span =  this.container.querySelector("span")
        const targetBounds = typeof this.options.bounds === 'function' ? this.options.bounds() : this.options.bounds;
        if (!targetBounds) {
            console.warn("FrameControl: No bounds provided to fit the map to.");
            button.setAttribute('disabled', 'true');
            span.style.opacity = .15;
            return;
        }
        const bounds = this.map.getBounds();
        const center = bounds.getCenter();
        const eps = 0.1;
        const boundsDifferent = Math.abs(bounds._ne.lng - targetBounds._ne.lng) > eps ||
            Math.abs(bounds._sw.lat - targetBounds._sw.lat) > eps;
        const frameCenter = targetBounds.getCenter();
        const centerDifferent = Math.abs(center.lng - frameCenter.lng) > .001 ||
            Math.abs(center.lat - frameCenter.lat) > .001
        // Check if frame bounds are pretty much the same
        if (!boundsDifferent && !centerDifferent) {
            button.setAttribute('disabled', 'true');
            span.style.opacity = .15;
        } else {
            button.removeAttribute('disabled');
            span.style.opacity = 1;
        }
    }
    onRemove() {
        this.container.parentNode.removeChild(this.container);
        this.map.off('moveend', this.update.bind(this));
        this.map = undefined;
    }
}