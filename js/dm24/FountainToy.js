import {DEFAULT_VERTEX_SHADER, noise_1, noise_2, noise_3, simplex_noise, noiseUtils} from "../shader_utils.js";

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

function createWaveFragmentShader(options) {
    let uniforms = {};
    let ripple_frag = /* glsl */ `#version 300 es

precision mediump float;
uniform sampler2D previous;
uniform sampler2D jets;
uniform float radius;
uniform float dampening;
uniform float interactionRadius;
uniform vec2 resolution;
uniform vec3 mouse;
uniform float time;

out vec4 outColor;

${noiseUtils}
${simplex_noise}
${noise_1}
${noise_2}
${noise_3}



// Remixed from shadertoy: https://www.shadertoy.com/view/XsKGzK
float jetNoise(vec2 xy) { return 0.7 * simplex_noise(vec3(xy, 0.003*time)); }
float turbulentNoise(vec2 xy) { return 0.7 * simplex_noise(vec3(xy, 0.3*time)); }
void main() {

    vec2 uv = gl_FragCoord.xy / resolution.xy;

    float pressure = texture(previous, uv).x;
    float pVel = texture(previous, uv).y;

    float up = texture(previous, uv + vec2(0, -1.0 / resolution.y)).r;
    float down = texture(previous, uv + vec2(0, 1.0 / resolution.y)).r;
    float left = texture(previous, uv + vec2(-1.0 / resolution.x, 0)).r;
    float right = texture(previous, uv + vec2(1.0 / resolution.x, 0)).r;

    // Circular fountain boundary
    if (length(uv - vec2(0.5,0.5)) > radius / resolution.x) {
        //outColor = vec4(uv, 0.0,0.0);
        outColor = vec4(0.0);
        return;
    }

    // Apply horizontal wave function
    pVel += dampening * (-2.0 * pressure + right + left) / 4.0;
    // Apply vertical wave function (these could just as easily have been one line)
    pVel += dampening * (-2.0 * pressure + up + down) / 4.0;

    // Change pressure by pressure velocity
    pressure += dampening * pVel;

    // "Spring" motion. This makes the waves look more like water waves and less like sound waves.
    pVel -= 0.005 * dampening * pressure;

    // Velocity damping so things eventually calm down
    pVel *= dampening;

    // Pressure damping to prevent it from building up forever.
    pressure *= dampening;

    // Jet turbulence
    float jetsValue = texture(jets, vec2(uv.x, uv.y)).w;
    if (jetsValue > 0.0) {
        vec2 step = vec2(1.3, 1.7);
        // Can't have large low frequency components or we'll get pressure pulses across the jet map
        float n = jetNoise(uv * 10.0);
        n += 0.5 * jetNoise(uv * 2.0 - step);
        pressure += 0.1 * jetsValue * n;
        pVel += 0.1 * jetsValue * n;
    } else {
        float n = turbulentNoise(uv * 40.0);
        pressure += 0.05 * n;
        //pVel += 0.005 * n;
    }

    // Make ripples while mouse is down
    if (mouse.z > 0.0) {
        // Use smoothstep to interpolate the pressure, just for pixels 0.0-0.005 away from click
        pressure += 1.0 - smoothstep(0.0, interactionRadius, distance(uv, mouse.xy));
    }

    //x = pressure. y = pressure velocity. Z and W = X and Y gradient
    outColor = vec4(pressure, pVel, (right - left) / 2.0, (up - down) / 2.0);

    //outColor = vec4(uv.xy, 1.0, 1.0);
    //outColor = vec4(texture(jets, uv).xyzw);
    //outColor = vec4(mouse.xyz, 0.5);
    //outColor = vec4(texture(previous, uv).r, texture(previous, uv).g, texture(previous, uv).b, dampening);
    //outColor = vec4(current, current, current, 1.0);
}
`;
    return {shader: ripple_frag, uniforms: {}};
}

function createGlintFragmentShader(options) {
    let uniforms = {};
    let glint_frag = /* glsl */ `#version 300 es

precision mediump float;
uniform sampler2D data;
uniform vec2 resolution;
uniform float radius; //pixels
out vec4 outColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 datum = texture(data, uv);
    // Sunlight glint
    vec3 normal = normalize(vec3(-datum.z, 0.2, -datum.w));
    outColor = vec4(1) * pow(max(0.0, dot(normal, normalize(vec3(-3, 20, 3)))), 1.0);
    outColor = 1.0 - outColor;
    // Circular fountain boundary
    if (length(uv - vec2(0.5,0.5)) > radius / resolution.x) {
        //outColor = vec4(uv, 0.0,0.0);
        outColor = vec4(0);
        return;
    }
    //outColor = vec4(0.0,0.0,uv);
    //outColor[3] = 1.0;
    //outColor = datum;
}

`;
    return {shader: glint_frag, uniforms: {}};
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
    let simRes = 1024
    let radiusPercentage = .4775
    let jetsTexture
    let sounds
    let startStamp
    let noteIndex = 0
    let lastNoteTime = 0
    let musicPlaying = false
    let deltaBuffer = []
    let canvas

    let lastMouseVel = null
    let lastWaterContactVec = null

    // Visibility tracking
    let isVisible = true
    let observer = null
    let pauseTimeout = null

    p.setup = async () => {
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
        jetsTexture = await p.loadImage(`${rootUrl}/img/dm24/jets.png`)
        startStamp = Date.now() / 1000.0

        const waveFragShader = createWaveFragmentShader({});
        rippleShader = p.createShader(DEFAULT_VERTEX_SHADER, waveFragShader['shader']);
        const glintFragShader = createGlintFragmentShader({});
        glintShader = p.createShader(DEFAULT_VERTEX_SHADER, glintFragShader['shader']);

        //baseWaterShader = p.loadShader(`${rootUrl}/js/fountain/ripple.vert`, `${rootUrl}/js/fountain/flowNoise.frag`);

        width = p._userNode.offsetWidth;
        height = p._userNode.offsetHeight;
        canvas = p.createCanvas(width, height, p.WEBGL);
        // Check available webgl feautures if something isn't working
        //const ctx = canvas.elt.getContext("webgl2")
        //console.log(ctx.getSupportedExtensions())

        // https://stackoverflow.com/questions/28827511/webgl-ios-render-to-floating-point-texture

        // We ping-pong these to run sim forward from previous state
        bufferA = p.createFramebuffer({format: p.HALF_FLOAT, width: simRes, height: simRes, density: 1, depth: false, antialias: false});
        bufferB = p.createFramebuffer({format: p.HALF_FLOAT, width: simRes, height: simRes, density: 1, depth: false, antialias: false});
        activeBuffer = bufferA
        inactiveBuffer = bufferB
        // Table of supported texture types: https://webgl2fundamentals.org/webgl/lessons/webgl-data-textures.html
        // Mobile targets usually can't render float textures. This buffer's shader needs to process to RGBA
        outBuffer = p.createFramebuffer({format: p.UNSIGNED_BYTE, width: simRes, height: simRes, density: 1, depth: false, antialias: false});
        p.imageMode(p.CENTER)
        //testImage = p.loadImage("/img/rcc-logo.png")
        p.noStroke();
        // First call builds the shader
        p.shader(glintShader);
        p.shader(rippleShader);

        // Set constant uniforms once for rippleShader
        rippleShader.setUniform("jets", jetsTexture);
        rippleShader.setUniform("dampening", dampening);
        rippleShader.setUniform("resolution", [simRes, simRes]);
        rippleShader.setUniform("radius", simRes * radiusPercentage);
        rippleShader.setUniform("interactionRadius", p.lerp(0.012, .005, p.constrain((p.windowWidth - 800) / 400, 0.0, 1.0)));

        // Set constant uniforms once for glintShader
        glintShader.setUniform("resolution", [simRes, simRes]);
        glintShader.setUniform("radius", simRes * radiusPercentage);

        // Set up intersection observer to pause when not visible (with delay)
        setupVisibilityObserver();
    }

    function setupVisibilityObserver() {
        if ('IntersectionObserver' in window) {
            observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    isVisible = entry.isIntersecting;
                    if (isVisible) {
                        // Cancel any pending pause and resume immediately
                        if (pauseTimeout) {
                            clearTimeout(pauseTimeout);
                            pauseTimeout = null;
                        }
                        p.loop();
                    } else {
                        // When not visible, wait 5 seconds before pausing to let ripples disperse
                        if (!pauseTimeout) {
                            pauseTimeout = setTimeout(() => {
                                p.noLoop();
                                pauseTimeout = null;
                            }, 5000);
                        }
                    }
                });
            }, {
                threshold: 0 // Trigger when 0% of element is visible
            });

            observer.observe(p._userNode);
        }
    }

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

        const delta = Date.now() - lastNoteTime
        if (delta > 10000) {
            // probably scrolled away and came back. Always "begin" on interaction
            noteIndex = 0
        }
        let noteToPlay = noteIndex
        if (noteIndex > 3) {
            // Up the scale
            sounds.play(`note${-noteIndex + 6 + 1}`)
        } else {
            // Down
            sounds.play(`note${noteToPlay + 1}`)
        }
        // Only check on up
        if (0 < noteIndex && noteIndex < 4) {
            deltaBuffer.push(delta)
        } else {
            deltaBuffer = []
        }
        lastNoteTime = Date.now()
        noteIndex += 1

        if (noteIndex === 4 && !musicPlaying) {
            // Decide whether to complete the piece
            const playingTime = deltaBuffer.reduce((a, b) => a + b, 0)
            if (1800 < playingTime && playingTime < 4000 && deltaBuffer[0] / (deltaBuffer[1] + deltaBuffer[2]) > 2.0 && (deltaBuffer[1] / deltaBuffer[2]) < 1.2) {
                // Dispatch custom event
                let event = new CustomEvent('musicStart', {detail: {}, bubbles: true, cancelable: true})
                p._userNode.dispatchEvent(event)
                musicPlaying = true
                let lastNote = sounds.play('note5', .700)
                lastNote.addEventListener('ended', () => {
                    musicPlaying = false
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
        noteIndex = noteIndex % 6

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
        if (p.mouseButton.left) {
            // Clicking and dragging should feel like dragging a finger through water, but simulation
            // is too slow to keep up with the mouse. We slow down the water contact point movement by interpolating
            // between the last water contact and the current mouse position
            const currentMouseVec = p.createVector(p.mouseX, p.mouseY)
            const diff = lastWaterContactVec ? lastWaterContactVec.copy().sub(currentMouseVec) : p.createVector(0, 0)
            const newDiff = diff.limit(lastMouseVel * .8 + .2 * diff.limit(p.lerp(6,8, (p.frameRate() - 60) / 60)).mag())
            lastMouseVel = newDiff.mag()
            lastWaterContactVec = lastWaterContactVec ? lastWaterContactVec.sub(newDiff): currentMouseVec
        } else {
            lastMouseVel = 0
            lastWaterContactVec = null
        }
        [activeBuffer, inactiveBuffer] = [inactiveBuffer, activeBuffer]
        activeBuffer.begin()
        p.clear()
        p.shader(rippleShader);
        // Only set dynamic uniforms that change every frame
        rippleShader.setUniform("previous", inactiveBuffer);
        rippleShader.setUniform("time", Date.now() / 1000.0 - startStamp);
        if (lastWaterContactVec) {
            rippleShader.setUniform("mouse", [lastWaterContactVec.x / width,lastWaterContactVec.y / height, true])
        } else {
            rippleShader.setUniform("mouse", [0, 0, false])
        }
        p.rect(0, 0, simRes, simRes);
        activeBuffer.end()


        outBuffer.begin()
        p.clear()
        p.shader(glintShader)
        // Only set dynamic uniform that changes every frame
        glintShader.setUniform("data", activeBuffer);
        p.rect(0, 0, simRes, simRes)
        outBuffer.end()

        p.resetShader()
        p.clear()
        p.image(outBuffer, 0, 0, p._userNode.offsetWidth, p._userNode.offsetHeight)

    }

    p.windowResized = function () {
        width = p._userNode.offsetWidth;
        height = p._userNode.offsetHeight;
        p.resizeCanvas(width, height, true);

        // Update window-size-dependent uniform
        rippleShader.setUniform("interactionRadius", p.lerp(0.012, .005, p.constrain((p.windowWidth - 800) / 400, 0.0, 1.0)));
    }

    // Cleanup when p5 instance is removed
    p.remove = function() {
        if (pauseTimeout) {
            clearTimeout(pauseTimeout);
            pauseTimeout = null;
        }
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }

}

