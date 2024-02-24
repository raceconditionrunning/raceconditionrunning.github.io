class AudioSprite {
    constructor(settingsObj) {
        this.src = settingsObj.src;
        this.samples = settingsObj.sprite;
        this.init();
    }

    async init() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx;
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

    play(sampleName, offset = 0) {
        const startTime = this.samples[sampleName][0] / 1000;
        const duration = this.samples[sampleName][1] / 1000;
        const sampleSource = this.ctx.createBufferSource();
        sampleSource.buffer = this.audioBuffer;
        sampleSource.connect(this.ctx.destination);
        sampleSource.start(this.ctx.currentTime + offset, startTime, duration);
        return sampleSource
    }
}

export let FountainToy = rootUrl => p => {
    let width;
    let height;
    let bufferA;
    let bufferB;
    let activeBuffer;
    let inactiveBuffer
    let outBuffer

    let dampening = 0.99;
    let rippleShader
    let glintShader
    let baseWaterShader
    let simRes = 1024
    let radiusPercentage = .4775
    let jetsTexture
    let sounds
    let startStamp
    let currentNote = 0
    let lastNoteTime = 0
    let deltaBuffer = []
    let canvas

    p.preload = function () {
        rippleShader = p.loadShader(`${rootUrl}/js/fountain/ripple.vert`, `${rootUrl}/js/fountain/ripple.frag`);
        glintShader = p.loadShader(`${rootUrl}/js/fountain/ripple.vert`, `${rootUrl}/js/fountain/glint.frag`);
        //baseWaterShader = p.loadShader(`${rootUrl}/js/fountain/ripple.vert`, `${rootUrl}/js/fountain/flowNoise.frag`);

        sounds = new AudioSprite({
            src: [`${rootUrl}/img/dm24/la-fille-aux-cheveux-de-lin.mp3`],
            sprite: {
                note1: [0, 2400],
                note2: [2500, 2400],
                note3: [5000, 2400],
                note4: [7500, 2400],
                note5: [10400, 252600],
            }
        });
        jetsTexture = p.loadImage(`${rootUrl}/img/dm24/jets.png`)
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

        // We ping-pong these to run sim forward from previous state
        bufferA = p.createFramebuffer({format: p.HALF_FLOAT, width: simRes, height: simRes, density: 1, depth: false})
        bufferB = p.createFramebuffer({format: p.HALF_FLOAT, width: simRes, height: simRes, density: 1, depth: false})
        activeBuffer = bufferA
        inactiveBuffer = bufferB
        // Table of supported texture types: https://webgl2fundamentals.org/webgl/lessons/webgl-data-textures.html
        // Mobile targets usually can't render float textures. This buffer's shader needs to process to RGBA
        outBuffer = p.createFramebuffer({format: p.UNSIGNED_BYTE, width: simRes, height: simRes, density: 1, depth: false})
        p.imageMode(p.CENTER)
        //testImage = p.loadImage("/img/rcc-logo.png")
        p.noStroke();
    }

    let startX, startY
    p.mousePressed = () => {
        // Modify the shader to pass out internal values and you can debug by
        // logging them out here
        //p.loadPixels()
        //console.log(p.get(p.mouseX, p.mouseY))
        if (p.mouseX < 0 || p.mouseX > p._userNode.offsetWidth || p.mouseY < 0 || p.mouseY > p._userNode.offsetHeight) {
            return
        }
        // Only allow mouse presses inside the circle
        if ((p.mouseX - radiusPercentage * width) ** 2 + (p.mouseY - radiusPercentage * height) ** 2 > (radiusPercentage * width) ** 2) {
            return;
        }
        if (currentNote === 5) {
            // Music is playing
            return;
        }

        const delta = Date.now() - lastNoteTime
        if (delta > 10000) {
            // probably scrolled away and came back. Always "begin" on interaction
            currentNote = 0
        }
        sounds.play(`note${currentNote + 1}`)
        if (currentNote > 0) {

            deltaBuffer.push(delta)
        }
        lastNoteTime = Date.now()
        currentNote += 1


        if (currentNote === 4) {
            // Decide whether to complete the piece
            const playingTime = deltaBuffer.reduce((a, b) => a + b, 0)
            if (1800 < playingTime && playingTime < 4000 && deltaBuffer[0] / (deltaBuffer[1] + deltaBuffer[2]) > 2.0 && (deltaBuffer[1] / deltaBuffer[2]) < 1.2) {
                currentNote += 1
                let lastNote = sounds.play('note5', .700)
                lastNote.addEventListener('ended', () => {
                    currentNote = 0
                })
            } else {
                const delays = [0, 1800, 2000, 2200]
                for (let pulsing of document.getElementsByClassName("pulse")) {
                    if (pulsing.getAnimations().length > 0) {
                        continue
                    }
                    // Get index in the parent of this element
                    const index = parseInt(pulsing.attributes.getNamedItem("data-n").value)
                    const startTarget = (delays[index] + 200) / 3500.
                    pulsing.animate([
                        {opacity: 1, offset: startTarget - 200 / 3500.},
                        {opacity: .1, offset: startTarget},
                        {opacity: .1, offset: .90},
                        {opacity: 1, offset: 1}
                    ], {
                        duration: 3000,
                        iterations: 1
                    })
                }
            }
            deltaBuffer = []
        }

    }
    p.touchStarted = () => {
        startX = p.mouseX;
        startY = p.mouseY;
    }
    p.touchEnded = () => {
    }
    p.touchMoved = () => {
        if (p.mouseX < 0 || p.mouseX > p._userNode.offsetWidth || p.mouseY < 0 || p.mouseY > p._userNode.offsetHeight) {
            return
        }
        if ((p.mouseX - .5 * width) ** 2 + (p.mouseY - .5 * height) ** 2 > (.5 * width) ** 2) {
            return;
        }
        return false;
    }

    p.draw = function () {
        [activeBuffer, inactiveBuffer] = [inactiveBuffer, activeBuffer]
        activeBuffer.begin()
        p.clear()
        p.shader(rippleShader);
        rippleShader.setUniform("previous", inactiveBuffer);
        rippleShader.setUniform("jets", jetsTexture);
        rippleShader.setUniform("time", Date.now() / 1000.0 - startStamp);
        rippleShader.setUniform("dampening", dampening);
        rippleShader.setUniform("resolution", [simRes, simRes]);
        rippleShader.setUniform("radius", simRes * radiusPercentage);
        // Match ripple radius to the apparent size of the fountain. Makes ripples on mobile feel right
        rippleShader.setUniform("interactionRadius", p.lerp( 0.012, .005, p.constrain((p.windowWidth - 800) / 400, 0.0, 1.0)));
        rippleShader.setUniform("mouse", [p.mouseX / width, 1.0 - (p.mouseY / height), p.mouseIsPressed && p.mouseButton === p.LEFT])
        p.rect(0, 0, simRes, -simRes);
        activeBuffer.end()


        outBuffer.begin()
        p.clear()
        p.shader(glintShader)
        glintShader.setUniform("data", activeBuffer);
        glintShader.setUniform("resolution", [simRes, simRes]);
        glintShader.setUniform("radius", simRes * radiusPercentage)
        p.rect(0, 0, simRes, -simRes)
        outBuffer.end()

        p.clear()
        p.image(outBuffer, 0, 0, p._userNode.offsetWidth, -p._userNode.offsetHeight)

    }

    p.windowResized = function () {
        width = p._userNode.offsetWidth;
        height = p._userNode.offsetHeight;
        p.resizeCanvas(width, height, true);

    }

}
