class AudioSprite {
    constructor(settingsObj) {
        this.src = settingsObj.src;
        this.samples = settingsObj.sprite;
        this.volume = 1; // Default volume
        this.init();
    }

    async init() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
        this.gainNode = this.ctx.createGain();
        this.gainNode.connect(this.ctx.destination);
        this.audioBuffer = await this.getFile();
    }

    async getFile() {
        const response = await fetch(this.src);
        if (!response.ok) {
            console.log(`${response.url} ${response.statusText}`);
            throw new Error(`${response.url} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        return audioBuffer;
    }

    setVolume(value) {
        this.volume = Math.min(1, Math.max(0, value));
        this.gainNode.gain.value = this.volume;
    }

    play(sampleName, offset = 0, loop = false) {
        const startTime = this.samples[sampleName][0] / 1000;
        const duration = this.samples[sampleName][1] / 1000;
        const sampleSource = this.ctx.createBufferSource();
        sampleSource.buffer = this.audioBuffer;
        sampleSource.connect(this.gainNode);
        if (loop) {
            sampleSource.loop = true;
            sampleSource.loopStart = startTime + 1.0;
            sampleSource.loopEnd = startTime + duration;
            sampleSource.start(this.ctx.currentTime + offset, startTime);
        } else {
            sampleSource.start(this.ctx.currentTime + offset, startTime, duration);
        }
        return sampleSource;
    }
}

function isPrefix(prefix, arr) {
    if (prefix.length > arr.length) {
        return false
    }
    for (let i = 0; i < prefix.length; i++) {
        if (arr[i] !== prefix[i]) {
            return false
        }
    }
    return true
}

export let RippleToy = rootUrl => p => {
    let width;
    let height;
    let bufferA;
    let outBuffer

    let dampening = 0.99;
    let rippleShader
    let glintShader
    let sounds
    let ambiance
    let startStamp
    let noteIndex = 0
    let lastNoteTime = 0
    let musicPlaying = false
    let ambiancePlaying = false
    let deltaBuffer = []
    let noteSequence = []
    let canvas
    let hintLastPlayed = 0
    let hintIsPlaying = false
    let musicHasPlayed = false
    let notesPlayed = []


    p.preload = function () {
        rippleShader = p.loadShader(`${rootUrl}/js/dm25/ripple.vert`, `${rootUrl}/js/dm25/ripple.frag`);
        glintShader = p.loadShader(`${rootUrl}/js/dm25/ripple.vert`, `${rootUrl}/js/dm25/glint.frag`);

        sounds = new AudioSprite({
            src: [`${rootUrl}/img/dm25/wasserklavier.mp3`],
            sprite: {
                note1: [0, 4000],
                note2: [4000, 4000],
                note3: [8000, 4000],
                note4: [12000, 4000],
                note5: [16000, 174000],
            }
        });
        ambiance = new AudioSprite({
            src: [`${rootUrl}/img/dm25/effects.mp3`],
            sprite: {
                hint: [0, 5900],
                honk1: [6000, 4000],
                honk2: [10000, 4000],
                honk3: [14000, 4000],
                drone: [20000, 56000],
            }
        });
        startStamp = Date.now() / 1000.0
    }

    p.setup = function () {
        width = p._userNode.offsetWidth;
        height = p._userNode.offsetHeight;
        canvas = p.createCanvas(width, height, p.WEBGL);
        // Check available webgl feautures if something isn't working
        //const ctx = canvas.elt.getContext("webgl2")
        //console.log(ctx.getSupportedExtensions())

        // https://stackoverflow.com/questions/28827511/webgl-ios-render-to-floating-point-texture

        bufferA = p.createFramebuffer({format: p.HALF_FLOAT, width: width, height: height, density: 1, depth: false})
        // Table of supported texture types: https://webgl2fundamentals.org/webgl/lessons/webgl-data-textures.html
        // Mobile targets usually can't render float textures. This buffer's shader needs to process to RGBA
        outBuffer = p.createFramebuffer({format: p.UNSIGNED_BYTE, width: width, height: height, density: 1, depth: false})
        p.imageMode(p.CENTER)
        p.noStroke();
    }
    p.startAmbiance = () => {
        ambiance.play('drone', 0, true)

        const hintMachine = () => {
            if (!hintIsPlaying && !musicPlaying) {
                if (lastNoteTime + 1000 < Date.now() &&  Date.now() < lastNoteTime + 6000  && hintLastPlayed + 15000 < Date.now() && notesPlayed.length === 4) {
                    let hint = ambiance.play('hint')
                    hint.addEventListener('ended', () => {
                        hintIsPlaying = false
                    })
                    hintIsPlaying = true
                    hintLastPlayed = Date.now()
                }
            }
            setTimeout(hintMachine, 1000)
        }
        const ambianceMachine = () => {
            if (!musicHasPlayed) {
                let sound = Math.floor(Math.random() * 3) + 1
                if (!hintIsPlaying) {
                    ambiance.play(`honk${sound}`)
                }
            }
            setTimeout(ambianceMachine, Math.random() * 15000 + 2000)

        }
        setTimeout(() => {
            ambianceMachine()
        }, Math.random() * 4000 + 1000)
        hintMachine()

    }

    const targetSequence = [1,0,3,2,1,0]
    const targetDurations = [1000, 800, 400, 900, 400]
    const targetDurationsNorm = targetDurations.map(d => d / targetDurations.reduce((a, b) => a + b, 0))
    p.mousePressed = () => {
        // Modify the shader to pass out internal values and you can debug by
        // logging them out here
        //p.loadPixels()
        //console.log(p.get(p.mouseX, p.mouseY))
        if (p.mouseX < 0 || p.mouseX > p._userNode.offsetWidth || p.mouseY < 0 || p.mouseY > p._userNode.offsetHeight) {
            return
        }
        if (musicPlaying) {
            return
        }
        if (!ambiancePlaying) {
            p.startAmbiance()
            ambiancePlaying = true
        }
        const delta = Date.now() - lastNoteTime
        if (delta > 10000) {
            // probably scrolled away and came back. Always "begin" on interaction
            deltaBuffer = []
            noteSequence = []
        }
        let noteToPlay = 4 - Math.ceil((p.mouseY / p._userNode.offsetHeight) * 4)
        if (!notesPlayed.includes(noteToPlay)) {
            notesPlayed.push(noteToPlay)
        }
        let customEvent = new CustomEvent('notePlayed', {detail: {note: noteToPlay}, bubbles: true, cancelable: true})
        p._userNode.dispatchEvent(customEvent)
        sounds.play(`note${noteToPlay + 1}`)
        noteSequence.push(noteToPlay)
        const wasPrefix = isPrefix(noteSequence, targetSequence)
        // Listen for the first note
        if (!wasPrefix) {
            deltaBuffer = []
            noteSequence = []
            if (noteToPlay === 1) {
                noteSequence.push(1)
            }

        } else if (noteSequence.length > 1) {
            deltaBuffer.push(Date.now() - lastNoteTime)
        }
        lastNoteTime = Date.now()

        if (noteSequence.length === targetSequence.length && wasPrefix && !musicPlaying) {
            // Decide whether to complete the piece
            // Normalize deltas
            const deltaSum = deltaBuffer.reduce((a, b) => a + b, 0)
            const deltaNorm = deltaBuffer.map(d => d / deltaSum)
            const closeEnough = deltaNorm.map((d, i) => Math.abs(d - targetDurationsNorm[i]) < 0.1)

            if (closeEnough.reduce((a, b) => a && b, true)) {
                musicPlaying = true
                // Dispatch custom event
                let event = new CustomEvent('musicStart', {detail: {}, bubbles: true, cancelable: true})

                p._userNode.dispatchEvent(event)
                let lastNote = sounds.play('note5', .700)
                ambiance.setVolume(.35)
                lastNote.addEventListener('ended', () => {
                    musicPlaying = false
                    musicHasPlayed = true
                    ambiance.setVolume(1)
                })
            } else {
                // TODO: hints
            }
            deltaBuffer = []
            noteSequence = []
        }
        console.log(deltaBuffer)
        console.log(noteSequence)

    }

    p.touchEnded = () => {
    }
    p.touchMoved = () => {
        if (p.mouseX < 0 || p.mouseX > p._userNode.offsetWidth || p.mouseY < 0 || p.mouseY > p._userNode.offsetHeight) {
            return
        }

        return false;
    }

    p.draw = function () {
        let currentMouseVec = null
        if (p.mouseIsPressed && p.mouseButton === p.LEFT) {
            // Clicking and dragging should feel like dragging a finger through water, but simulation
            // is too slow to keep up with the mouse. We slow down the water contact point movement by interpolating
            // between the last water contact and the current mouse position
            currentMouseVec = new p.createVector(p.mouseX, p.mouseY)
        } else {

        }
        bufferA.begin()
        p.clear()
        p.shader(rippleShader);
        rippleShader.setUniform("time", Date.now() / 1000.0 - startStamp);
        rippleShader.setUniform("dampening", dampening);
        rippleShader.setUniform("ripples", 1.0);
        rippleShader.setUniform("resolution", [width, height]);
        // Match ripple radius to the apparent size of the fountain. Makes ripples on mobile feel right
        rippleShader.setUniform("interactionRadius", p.lerp( 0.012, .005, p.constrain((p.windowWidth - 800) / 400, 0.0, 1.0)));
        if (currentMouseVec) {
            rippleShader.setUniform("mouse", [currentMouseVec.x / width, 1.0 - (currentMouseVec.y / height), true])
        } else {
            rippleShader.setUniform("mouse", [0, 0, false])
        }
        p.rect(0, 0, width, -height);
        bufferA.end()


        outBuffer.begin()
        p.clear()
        p.shader(glintShader)
        glintShader.setUniform("data", bufferA);
        glintShader.setUniform("resolution", [width, height]);
        p.rect(0, 0, width, -height)
        outBuffer.end()

        p.clear()
        p.image(outBuffer, 0, 0, p._userNode.offsetWidth, -p._userNode.offsetHeight)

    }

    p.windowResized = function () {
        width = p._userNode.offsetWidth;
        height = p._userNode.offsetHeight;
        p.resizeCanvas(width, height, true);
        bufferA.resize(width, height)
        outBuffer.resize(width, height)

    }

}

