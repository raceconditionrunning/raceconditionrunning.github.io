class Sprite {
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

        sounds = new Sprite({
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
        // We ping-pong these to run sim forward from previous state
        bufferA = p.createFramebuffer({format: p.FLOAT, width: simRes, height: simRes})
        bufferB = p.createFramebuffer({format: p.FLOAT, width: simRes, height: simRes})
        activeBuffer = bufferA
        inactiveBuffer = bufferB
        outBuffer = p.createFramebuffer({format: p.FLOAT, width: simRes, height: simRes})
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
        if ((p.mouseX - .5 * width) ** 2 + (p.mouseY - .5 * height) ** 2 > (.5 * width) ** 2) {
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
                document.getAnimations().forEach((anim) => {
                    if (!anim.effect.target.classList.contains('orbit')) {
                        return
                    }
                    anim.cancel();
                    anim.play();
                });
                currentNote = 0
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
        rippleShader.setUniform("mouse", [p.mouseX / width, 1.0 - (p.mouseY / height), p.mouseIsPressed && p.mouseButton === p.LEFT])
        p.rect(0, 0, simRes, -simRes);
        activeBuffer.end()


        outBuffer.begin()
        p.clear()
        p.shader(glintShader)
        glintShader.setUniform("data", activeBuffer);
        glintShader.setUniform("resolution", [simRes, simRes]);
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

