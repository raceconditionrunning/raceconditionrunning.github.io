import {DEFAULT_VERTEX_SHADER, noise_1, noise_2, noise_3, simplex_noise, noiseUtils} from "../shader_utils.js";

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

function createRippleFragmentShader(options) {
    let uniforms = {};
    let ripple_frag = /* glsl */ `#version 300 es

precision mediump float;
uniform float radius;
uniform float dampening;
uniform float interactionRadius;
uniform vec2 resolution;
uniform vec3 mouse;
uniform float time;
uniform float ripples;

out vec4 outColor;

${noiseUtils}
${simplex_noise}

float snoise(vec3 v)
{
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

    // First corner
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 =   v - i + dot(i, C.xxx) ;

    // Other corners
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );

    //   x0 = x0 - 0.0 + 0.0 * C.xxx;
    //   x1 = x0 - i1  + 1.0 * C.xxx;
    //   x2 = x0 - i2  + 2.0 * C.xxx;
    //   x3 = x0 - 1.0 + 3.0 * C.xxx;
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
    vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

    // Permutations
    i = mod289(i);
    vec4 p = permute( permute( permute(
                                   i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                               + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                      + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

    // Gradients: 7x7 points over a square, mapped onto an octahedron.
    // The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
    float n_ = 0.142857142857; // 1.0/7.0
    vec3  ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );

    //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
    //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);

    //Normalise gradients
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    // Mix final noise value
    vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 105.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                   dot(p2,x2), dot(p3,x3) ) );
}

// 3D simplex noise adapted from https://www.shadertoy.com/view/Ws23RD
// * Removed gradient normalization

vec4 snoise4(vec3 v)
{
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);

    // First corner
    vec3 i  = floor(v + dot(v, vec3(C.y)));
    vec3 x0 = v   - i + dot(i, vec3(C.x));

    // Other corners
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.x;
    vec3 x2 = x0 - i2 + C.y;
    vec3 x3 = x0 - 0.5;

    // Permutations
    vec4 p =
      permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0))
                            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    // Gradients: 7x7 points over a square, mapped onto an octahedron.
    // The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
    vec4 j = p - 49.0 * floor(p / 49.0);  // mod(p,7*7)

    vec4 x_ = floor(j / 7.0);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = (x_ * 2.0 + 0.5) / 7.0 - 1.0;
    vec4 y = (y_ * 2.0 + 0.5) / 7.0 - 1.0;

    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 g0 = vec3(a0.xy, h.x);
    vec3 g1 = vec3(a0.zw, h.y);
    vec3 g2 = vec3(a1.xy, h.z);
    vec3 g3 = vec3(a1.zw, h.w);

    // Compute noise and gradient at P
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    vec4 m2 = m * m;
    vec4 m3 = m2 * m;
    vec4 m4 = m2 * m2;
    vec3 grad =
      -6.0 * m3.x * x0 * dot(x0, g0) + m4.x * g0 +
      -6.0 * m3.y * x1 * dot(x1, g1) + m4.y * g1 +
      -6.0 * m3.z * x2 * dot(x2, g2) + m4.z * g2 +
      -6.0 * m3.w * x3 * dot(x3, g3) + m4.w * g3;
    vec4 px = vec4(dot(x0, g0), dot(x1, g1), dot(x2, g2), dot(x3, g3));
    return 42.0 * vec4(grad, dot(m4, px));
}

${noise_1}
${noise_2}
${noise_3}

#define RIPPLES_COUNT 1.0
#define RIPPLES_SCALE 10.0
#define RIPPLES_SPEED 0.3

#define WaveParams vec3(20.0, 2.0, 0.5)

vec2 hash22(vec2 p){
    return 2. * fract(sin(vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3))))*43758.5453) -1.;
}

float Ripple(vec2 uv,float index, float scale){

    uv=fract(uv)*scale+index*127.33;

    //uv.x+=time*0.2;
    //uv.y+=iMouse.y*0.01;

    float t =time*RIPPLES_SPEED;

    vec2 tile = floor(uv);
    vec2 fr = fract(uv);
    vec2 noise =hash22(tile);

    float CurrentTime = fract(t+noise.x) ;

    noise = hash22(tile+floor((t+noise.x)));;

    vec2 WaveCentre = vec2(0.5,0.5)+ noise *0.3 ;

	float Dist =distance(fract(uv) , WaveCentre)*(5.+WaveParams.z*noise.x);

    float Diff = (Dist - CurrentTime);

    float ScaleDiff = (1.0 - pow(3.*abs(Diff * WaveParams.x), WaveParams.y));
    ScaleDiff = max(ScaleDiff,  (1. - pow(abs((Dist - 1.5*CurrentTime) * WaveParams.x), WaveParams.y)));


    return clamp( ( ScaleDiff) / ( (CurrentTime) * Dist * 40.0) , 0.0, 1.0);
}

// Remixed from: https://www.shadertoy.com/view/X3fXW7
void main() {

    float ratio = resolution.y/resolution.x;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    uv.y *= ratio;


    // Settings
    float invertY    = -1.0; // 1.0 = invert y axis (application), -1.0= don't invert (shadertoy)
    float yaw        = -0.00;  // Rotate camera on z axis (like saying no with your head).
    float pitch      = 0.1;  // Rotate camera like saying yes with your head
    float roll       = 0.0;  // Rotate camera like putting your head to your shoulder
    float height     = 12.0;  // Height of the room, BUT also changes the pitch downwards.
    float fov        = 1.0;  // Basically zoom, comes with perspective distortion too.
    float scale      = 90.0; // Size of the rays (also changes the speed)
    float speed      = 0.005; // How quickly the rays dance
    float brightness = 1.7;  // Smaller = brighter, more intense rays
    float contrast   = 2.0;  // Difference between ray and darkness. Smaller = more grey.
    float multiply   = .2;  // Alpha/transparency and colour intensity of final result
    vec3  rayColor  = vec3(1.0,1.0,0.0); // rgb colour of rays


    // Camera matrix complicated maths stuff
    vec3 ww = normalize(invertY*vec3(yaw, height, pitch));
    vec3 uu = normalize(cross(ww, vec3(roll, 1.0, 0.0)));
    vec3 vv = normalize(cross(uu,ww));
    vec3 rd = uv.x*uu + uv.y*vv + fov;	// view ray
    vec3 pos = -ww + rd*(ww.y/rd.y);	// raytrace plane
    pos.y = time*speed;					// animate noise slice
    pos *= scale;				        // tiling frequency


    // Generate some noise
    vec4 noise = snoise4( pos );

    // Offset it and regenerate x2
    pos -= 0.07*noise.xyz;
    noise = snoise4( pos );

    pos -= 0.07*noise.xyz;
    noise = snoise4( pos );

    // Calculate intensity of this pixel
    float intensity = exp(noise.w*contrast - brightness);

    // Generate a lovely warm oceany gradient
    //vec4 c = vec4(234.0/255.0-(fragCoord.y/iResolution.y)*0.7,235.0/255.0-(fragCoord.y/iResolution.y)*0.4,166.0/255.0-(fragCoord.y/iResolution.y)*0.1,1.0);

    // Generate final rgba of this pixel
    vec4 wave = vec4(rayColor*multiply*intensity, intensity);


    float col = 0.;

    for(float i = 0.; i<=RIPPLES_COUNT; i++)
    {
        col += Ripple(uv,float(i)*0.1,RIPPLES_SCALE);
    }
    float val = noise1(uv.x*time*0.2, uv.y*time*0.2);
    vec4 color = vec4(rayColor.x * val, rayColor.y * val, rayColor.z * val, 1.0);
    outColor = 0.5 * wave + ripples * mix(color * 0.2, color, vec4(col)) * 0.15;

}
`;
    return {shader: ripple_frag, uniforms: {}};
}

export let RippleToy = rootUrl => p => {
    let width;
    let height;

    let dampening = 0.99;
    let rippleShader
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


    p.setup = async () =>{

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

        width = p._userNode.offsetWidth;
        height = p._userNode.offsetHeight;
        canvas = p.createCanvas(width, height, p.WEBGL);
        // Check available webgl feautures if something isn't working
        //const ctx = canvas.elt.getContext("webgl2")
        //console.log(ctx.getSupportedExtensions())

        // https://stackoverflow.com/questions/28827511/webgl-ios-render-to-floating-point-texture

        const rippleFragShader = createRippleFragmentShader({});
        rippleShader = p.createShader(DEFAULT_VERTEX_SHADER, rippleFragShader['shader']);
        p.imageMode(p.CENTER)
        p.noStroke();
        // First call builds the shader program
        p.shader(rippleShader);
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
            setTimeout(ambianceMachine, Math.random() * 18000 + 4000)

        }
        setTimeout(() => {
            ambianceMachine()
        }, Math.random() * 5000 + 2000)
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
            // Too subtle
            // const closeEnough = deltaNorm.map((d, i) => Math.abs(d - targetDurationsNorm[i]) < 0.1)
            // closeEnough.reduce((a, b) => a && b, true)
            if (deltaSum > 1000 && deltaSum < 4000) {
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
        p.rect(0, 0, width, height);

    }

    p.windowResized = function () {
        width = p._userNode.offsetWidth;
        height = p._userNode.offsetHeight;
        p.resizeCanvas(width, height, true);
    }

}

