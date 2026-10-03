/** One request stream shared by the results and photo map. */
export class RelayLiveData extends EventTarget {
    constructor(url, consume, interval = 30000) {
        super(); Object.assign(this, {url, consume, interval});
        this.live = true; this.failures = 0; this.checkedAt = null;
        this.visibility = () => {
            clearTimeout(this.timer);
            if (!document.hidden && this.live) this.refresh();
            this.notify();
        };
        document.addEventListener('visibilitychange', this.visibility);
    }
    notify() { this.dispatchEvent(new Event('status')); }
    async refresh() {
        if (this.busy) return;
        this.busy = true;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(this.url, {cache: 'no-cache', signal: controller.signal});
            if (!response.ok) throw new Error(`Results: ${response.status}`);
            const data = await response.json();
            if (!Array.isArray(data.results)) throw new Error('Invalid results');
            await this.consume(data);
            this.checkedAt = Date.now(); this.failures = 0;
        } catch (error) { this.failures++; console.warn('Live results refresh failed', error); }
        finally {
            clearTimeout(timeout); this.busy = false; this.notify();
            clearTimeout(this.timer);
            if (this.live && !document.hidden) this.timer = setTimeout(() => this.refresh(), Math.min(300000, this.interval * 2 ** this.failures));
        }
    }
    destroy() { this.live = false; clearTimeout(this.timer); document.removeEventListener('visibilitychange', this.visibility); }
}

export function photoAge(timestamp, now = Date.now()) {
    const minutes = Math.max(0, Math.floor((now - new Date(timestamp).getTime()) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
    return `${Math.floor(minutes / 1440)}d ago`;
}

/** Shared-course observations collapse naturally; distinct branch observations remain. */
export function latestTeamPhotos(results, courses) {
    const points = [];
    for (const team of results) {
        const selected = new Map();
        for (const course of courses.filter(c => !team.lines || c.lines.includes(team.lines))) {
            const candidates = Object.entries(team.observations || {})
                .filter(([id, observation]) => course.exchanges.includes(id) && Number.isFinite(Date.parse(observation.capturedAt)));
            candidates.sort((a, b) => Date.parse(b[1].capturedAt) - Date.parse(a[1].capturedAt)
                || course.exchanges.indexOf(b[0]) - course.exchanges.indexOf(a[0]));
            if (!candidates.length) continue;
            const [exchange, observation] = candidates[0];
            if (!selected.has(exchange)) selected.set(exchange, {name: team.name, exchange, ...observation, lines: []});
            selected.get(exchange).lines.push(course.line);
        }
        points.push(...selected.values());
    }
    return points;
}
