import {DEFAULT_VERTEX_SHADER} from "./shader_utils.js";

// --- Configuration Constants ---
const RING_THICKNESS_PX = 10;
const RING_SPACING_PX = 20;
const INNER_RADIUS_PX = 200;
const NUM_RINGS = 20;
const ANIMATION_SPEED = 0.1;      // Global speed multiplier (lower = slower)

// Audio configuration
const DRONE_BASE_FREQ = 185.0; // Gb3
// G-flat major scale
// Gb, Ab, Bb, Cb, Db, Eb, F
const DRONE_SCALE = [1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8]; // Just intonation ratios


function generateRingConfigs(numRings) {
    const configs = [];
    const innerRadius = INNER_RADIUS_PX;

    for (let i = 0; i < numRings; i++) {
        const numRunners = i + 3;
        const velocities = [];
        const colors = [];

        // Calculate this ring's radius
        const ringRadius = innerRadius + i * RING_SPACING_PX;

        // Scale factor to maintain constant apparent speed across rings
        // Outer rings move slower in angular velocity to match arc speed
        const radiusScale = innerRadius / ringRadius;

        // Create array of half branding-color-light and half branding-color-complement-light
        const brandingColorLight = 0xAEDCE6; // #aedce6
        const brandingColorComplementLight = 0xDFACE6; // #dface6

        // Create array with half of each color
        const colorPool = [];
        for (let j = 0; j < Math.ceil(numRunners / 2); j++) {
            colorPool.push(brandingColorLight);
        }
        for (let j = 0; j < Math.floor(numRunners / 2); j++) {
            colorPool.push(brandingColorComplementLight);
        }
        // Shuffle the color pool
        for (let j = colorPool.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [colorPool[j], colorPool[k]] = [colorPool[k], colorPool[j]];
        }

        for (let j = 0; j < numRunners; j++) {
            // Random base velocity between 0.5 and 3.0
            const baseVelocity = 0.5 + Math.random() * 2.5;

            // Scale by radius to maintain constant apparent speed
            velocities.push(baseVelocity * radiusScale);

            // Assign color from shuffled pool
            colors.push(colorPool[j]);
        }

        configs.push({
            velocities: velocities,
            colors: colors,
            lonelyThreshold: Math.PI / numRunners
        });
    }
    return configs;
}

// Debug: Generate equidistant runner configuration
function generateEquidistantRingConfigs(numRings) {
    const configs = [];
    const innerRadius = INNER_RADIUS_PX;

    for (let i = 0; i < numRings; i++) {
        const numRunners = i + 3;
        const velocities = [];
        const colors = [];

        // Calculate this ring's radius
        const ringRadius = innerRadius + i * RING_SPACING_PX;
        const radiusScale = innerRadius / ringRadius;

        for (let j = 0; j < numRunners; j++) {
            // All same velocity = equidistant
            velocities.push(radiusScale);
            // Assign color from pool (no shuffle for predictability)
            colors.push(0xFF0000);
        }

        configs.push({
            velocities: velocities,
            colors: colors,
            lonelyThreshold: Math.PI / numRunners
        });
    }
    return configs;
}

const RING_CONFIGS = generateRingConfigs(NUM_RINGS);

// For debugging:
//const RING_CONFIGS = generateEquidistantRingConfigs(NUM_RINGS);

function createRunnerRingFragmentShader(ringConfigs) {
    
    // Generate uniform declarations
    let uniforms = ``;
    uniforms += `uniform vec3 u_geom_params;\n`; // x: thickness_norm, y: spacing_norm, z: inner_radius_norm
    uniforms += `uniform sampler2D u_color_texture;\n`;
    uniforms += `uniform vec2 u_texture_size;\n`;
    uniforms += `uniform sampler2D u_runner_data_texture;\n`; // Packed runner data (position, loneliness, hasBeenLonely)
    uniforms += `uniform vec2 u_runner_texture_size;\n`; // Size of runner data texture

    for (let i = 0; i < ringConfigs.length; i++) {
        uniforms += `uniform float lonelyThreshold_${i};\n`; // TAU/(2*N) for this ring
    }

    // Helper function to read runner data from float texture
    const unpackRunnerData = `
    // Returns: vec3(position, loneliness, hasBeenLonely)
    vec3 unpackRunnerData(int ringIndex, int runnerIndex) {
        // texelFetch uses integer pixel coords with no filtering
        ivec2 pixelCoord = ivec2(runnerIndex, ringIndex);
        vec4 data = texelFetch(u_runner_data_texture, pixelCoord, 0);
        return vec3(data.r, data.g, data.b);
    }
    `;

    // Generate the logic for each ring
    let ringLogic = ``;

    // We build the rings dynamically in the shader using the uniforms
    // Ring i radius = inner + i * spacing

    for (let i = 0; i < ringConfigs.length; i++) {
        const n = ringConfigs[i].velocities.length;

        // Logic block for Ring i
        ringLogic += `
        {
            // --- RING ${i} ---
            // Calculate geometry in UV space based on uniforms
            float trackWidth = u_geom_params.x;
            float spacing = u_geom_params.y;
            float innerRadius = u_geom_params.z;

            float trackRadius = innerRadius + float(${i}) * spacing;
            float trackHalfWidth = trackWidth * 0.5;

            float distToTrackCenter = abs(dist - trackRadius);

            // Optimization: Only compute precise SDF if we are somewhat close to the track
            // Relaxed check to allow for corner radius overflow slightly
            if (distToTrackCenter < trackHalfWidth + 0.02) { // 0.02 is arbitrary margin

                vec3 finalRingColor =  vec3(0.0); // Base track color
                float minSd = 1000.0;
                float nearestLoneliness = 0.0;

                // Track which runner is nearest and whether it has been lonely
                int nearestRunnerIndex = 0;
                int nearestRunnerHasBeenLonely = 0;

                // Check all runners to find the closest segment shape
                for (int j = 0; j < ${n}; j++) {
                    // Unpack runner data from texture
                    vec3 runnerData = unpackRunnerData(${i}, j);
                    float runnerPosition = runnerData.x;
                    float runnerLoneliness = runnerData.y;
                    float runnerHasBeenLonely = runnerData.z;

                    // Polar-ish coordinates
                    // X: Arc length along the ring relative to runner center
                    float distArc = angularDist(angle, runnerPosition) * trackRadius;
                    // Y: Radial distance from center of ring
                    float distRadial = distToTrackCenter;

                    // Capsule (Segment) Logic
                    float halfArcLength = runnerLoneliness * trackRadius;

                    // Add a small buffer/gap between segments so they don't touch
                    float gap = 0.005;

                    // The "straight" segment length is the total length minus the rounded caps and the gap.
                    // Each cap has radius 'trackHalfWidth'.
                    float segLen = max(0.0, halfArcLength - trackHalfWidth - gap);

                    // SDF for a 2D segment on the X-axis from -segLen to +segLen
                    // with radius 'trackHalfWidth'.
                    vec2 pSeg = vec2(max(abs(distArc) - segLen, 0.0), distRadial);
                    float sd = length(pSeg) - trackHalfWidth;

                    if (sd < minSd) {
                        minSd = sd;
                        nearestLoneliness = runnerLoneliness;
                        nearestRunnerIndex = j;
                        nearestRunnerHasBeenLonely = int(runnerHasBeenLonely);
                    }
                }
                
                // Blend Runner on top of Track
                // smoothstep gives a nice anti-aliased edge (pixel width approx)
                // We use fwidth for AA? Or fixed constant. Fixed is safer for now.
                float aaWidth = 0.002; 
                float runnerAlpha = 1.0 - smoothstep(0.0, aaWidth, minSd);
                
                // Highlight lonely runners with smooth color transition
                float opacity = 1.0;
                // Use texelFetch for discrete color lookup (no filtering)
                ivec2 colorCoord = ivec2(nearestRunnerIndex, ${i});
                vec3 targetColor = texelFetch(u_color_texture, colorCoord, 0).rgb;
                vec3 whiteColor = vec3(1.0);
                vec3 finalRunnerColor = whiteColor;

                // Only fade in very close to the actual lonely threshold
                // Start at 95% of threshold, full brightness at threshold
                float fadeStart = lonelyThreshold_${i} * 0.95;
                float fadeEnd = lonelyThreshold_${i};
                float normL = smoothstep(fadeStart, fadeEnd, nearestLoneliness);

                // Opacity transition
                opacity = 0.1 + 0.9 * pow(normL, 2.0);

                // Smooth color transition from white to assigned color
                // Base color depends on whether runner has been lonely before
                vec3 baseColor = (nearestRunnerHasBeenLonely != 0) ? targetColor : whiteColor;
                finalRunnerColor = mix(baseColor, targetColor, normL);
                

                finalRingColor = mix(finalRingColor, finalRunnerColor, runnerAlpha * opacity);

                // Output alpha
                //float trackAlpha = 1.0 - smoothstep(trackHalfWidth - aaWidth, trackHalfWidth, distToTrackCenter);
                float trackAlpha = 0.0;
                float finalAlpha = max(trackAlpha, runnerAlpha * opacity * 0.9);

                outColor = vec4(finalRingColor, finalAlpha);
                return;
            }
        }
        `;
    }


    const frag = /* glsl */ `#version 300 es
    precision lowp float;

    uniform vec2 resolution;
    uniform float time;

    ${uniforms}

    out vec4 outColor;

    const float PI = 3.14159265359;
    const float TAU = 6.28318530718;

    // Helper to get angular distance between two angles in [0, TAU]
    float angularDist(float a1, float a2) {
        float diff = a1 - a2;
        // Robust modular distance
        return abs(mod(diff + PI, TAU) - PI);
    }

    ${unpackRunnerData}

    void main() {
        // Normalize coordinates to [-1, 1], correcting for aspect ratio
        vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);

        // Convert to polar coordinates
        float dist = length(uv);
        float angle = atan(uv.y, uv.x); // [-PI, PI]
        if (angle < 0.0) angle += TAU;  // [0, TAU]

        // Default Background
        outColor = vec4(0.0, 0.0, 0.0, 0.0); 

        // Generated Ring Logic
        ${ringLogic}
    }
    `;
    return { shader: frag };
}

export let LonelyRunnerToy = () => p => {
    let width;
    let height;
    let runnerShader;
    let startStamp;
    let colorTexture;
    let runnerDataTexture;

    const TAU = Math.PI * 2;

    // Interaction state
    let draggingRunner = null;
    let lastMouseAngle = 0;

    // Track which runners have been lonely at least once
    let hasBeenLonely = []; // Array of arrays (per ring, per runner)
    // Track manual position offsets for runners
    let runnerOffsets = []; // Array of arrays (per ring, per runner)
    
    // UI elements
    let lonelyCountEl = null;
    let totalRunnersEl = null;
    let lonelyCounterContainer = null;
    let muteButtonEl = null;
    let isMuted = true;
    let hasUserInteractedWithCanvas = false;

    function toggleMute(targetState) {
        if (typeof targetState !== 'undefined') {
            isMuted = targetState;
        } else {
            isMuted = !isMuted;
        }
        
        if (masterGain) {
            const now = audioContext.currentTime;
            masterGain.gain.cancelScheduledValues(now);
            masterGain.gain.setValueAtTime(masterGain.gain.value, now);
            // Ramp to a very small value instead of 0 to avoid issues with exponential ramps elsewhere if any
            masterGain.gain.linearRampToValueAtTime(isMuted ? 0.0001 : 1.0, now + 0.1);
        }
        if (muteButtonEl) {
            muteButtonEl.textContent = isMuted ? 'Unmute' : 'Mute';
        }
    }

    // Helper: Calculate positions for a ring at a given time
    function getPositionsAtTime(ringIndex, time) {
        return RING_CONFIGS[ringIndex].velocities.map((v, i) => {
            const offset = (runnerOffsets[ringIndex] && runnerOffsets[ringIndex][i]) || 0;
            return ((time * v * 0.5 * ANIMATION_SPEED) + offset) % TAU;
        });
    }

    // Helper: Check if a runner is lonely (min distance to others >= TAU/N)
    function isRunnerLonely(ringIndex, runnerIndex, time) {
        const positions = getPositionsAtTime(ringIndex, time);
        const N = positions.length;
        const lonelyThreshold = TAU / N;
        const runnerPos = positions[runnerIndex];

        let minDist = TAU;
        for (let i = 0; i < N; i++) {
            if (i === runnerIndex) continue;
            const d = Math.abs(runnerPos - positions[i]);
            const dist = Math.min(d, TAU - d);
            if (dist < minDist) minDist = dist;
        }

        return minDist >= lonelyThreshold;
    }

    // Helper: Calculate mouse angle relative to center
    function getMouseAngle(mouseX, mouseY) {
        const dx = mouseX - width / 2;
        // Flip Y for standard cartesian (Up is +Y), matching shader logic/view
        const dy = -(mouseY - height / 2);
        let angle = Math.atan2(dy, dx);
        if (angle < 0) angle += TAU;
        return angle;
    }

    // Helper: Detect which runner (if any) was clicked
    // Returns {ringIndex, runnerIndex} or null
    function getClickedRunner(mouseX, mouseY, time) {
        // Convert mouse coordinates to UV space (same as shader)
        const minDim = Math.min(width, height);
        const uvScale = 2.0 / minDim;

        // p5 WEBGL mode has origin at center, so adjust
        const uvX = (mouseX - width / 2) * uvScale;
        const uvY = -(mouseY - height / 2) * uvScale; // Flip Y for WebGL

        // Convert to polar
        const dist = Math.sqrt(uvX * uvX + uvY * uvY);
        let angle = Math.atan2(uvY, uvX);
        if (angle < 0) angle += TAU;

        // Calculate geometry parameters
        const thicknessNorm = RING_THICKNESS_PX * uvScale;
        const spacingNorm = RING_SPACING_PX * uvScale;
        const innerRadiusNorm = INNER_RADIUS_PX * uvScale;

        // Find which ring (if any)
        for (let ringIndex = 0; ringIndex < RING_CONFIGS.length; ringIndex++) {
            const trackRadius = innerRadiusNorm + ringIndex * spacingNorm;
            const trackHalfWidth = thicknessNorm * 0.5;

            if (Math.abs(dist - trackRadius) <= trackHalfWidth) {
                // On this ring! Now find which runner
                const positions = getPositionsAtTime(ringIndex, time);

                for (let runnerIndex = 0; runnerIndex < positions.length; runnerIndex++) {
                    const runnerAngle = positions[runnerIndex];

                    // Calculate angular distance
                    const d = Math.abs(angle - runnerAngle);
                    const angularDist = Math.min(d, TAU - d);

                    // Calculate loneliness for this runner
                    const N = positions.length;
                    let minDistToOthers = TAU;
                    for (let i = 0; i < N; i++) {
                        if (i === runnerIndex) continue;
                        const d = Math.abs(positions[runnerIndex] - positions[i]);
                        const dist = Math.min(d, TAU - d);
                        if (dist < minDistToOthers) minDistToOthers = dist;
                    }
                    const halfLoneliness = minDistToOthers * 0.5;

                    // Check if click is within this runner's segment
                    if (angularDist <= halfLoneliness) {
                        return {ringIndex, runnerIndex};
                    }
                }
            }
        }

        return null;
    }

    // Audio system - continuous drones per ring

    let audioContext = null;
    let masterGain = null; // Master gain for gentle overall fade-in
    let reverbNode = null; // Convolver for frozen reverb
    let reverbGain = null; // Wet signal gain
    let ringOscillators = []; // {osc1, osc2, osc3, gainNode, filterNode} per ring
    let ringLonelyCounts = []; // number of lonely runners per ring
    let audioJustInitialized = false; // Flag for gentle first startup

    // Generate a long, lush impulse response for frozen reverb
    function createReverbImpulse(duration, decay, reverse = false) {
        const sampleRate = audioContext.sampleRate;
        const length = sampleRate * duration;
        const impulse = audioContext.createBuffer(2, length, sampleRate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const n = reverse ? length - i : i;
            // Exponential decay with some randomness for natural sound
            const t = n / length;
            const envelope = Math.pow(1 - t, decay);

            // White noise with exponential decay
            left[i] = (Math.random() * 2 - 1) * envelope;
            right[i] = (Math.random() * 2 - 1) * envelope;
        }

        return impulse;
    }

    function initAudio() {
        if (audioContext) return;

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioJustInitialized = true;

        // Create master gain node for overall volume control
        masterGain = audioContext.createGain();
        masterGain.connect(audioContext.destination);

        // Start master gain at very low level
        masterGain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        // Gentle fade-in over 10 seconds, but only if not muted
        const targetGain = isMuted ? 0.0001 : 1.0;
        masterGain.gain.exponentialRampToValueAtTime(targetGain, audioContext.currentTime + 7.0);

        // Create frozen reverb
        reverbNode = audioContext.createConvolver();
        // Long reverb tail (8 seconds) with slow decay (1.2 = very slow)
        reverbNode.buffer = createReverbImpulse(8.0, 1.2);

        reverbGain = audioContext.createGain();
        reverbGain.gain.value = 0.5; // 50% wet signal

        // Create a feedback delay for the "frozen" effect
        const feedbackDelay = audioContext.createDelay(5.0);
        feedbackDelay.delayTime.value = 0.3; // 300ms delay

        const feedbackGain = audioContext.createGain();
        feedbackGain.gain.value = 0.7; // High feedback for frozen effect

        const reverbFilter = audioContext.createBiquadFilter();
        reverbFilter.type = 'lowpass';
        reverbFilter.frequency.value = 3000; // Darken the reverb tail

        // Reverb signal path: reverb -> filter -> delay -> feedback -> master
        reverbNode.connect(reverbFilter);
        reverbFilter.connect(feedbackDelay);
        feedbackDelay.connect(feedbackGain);
        feedbackGain.connect(feedbackDelay); // Feedback loop
        feedbackDelay.connect(reverbGain);
        reverbGain.connect(masterGain);

        // Create persistent oscillator + gain for each ring
        RING_CONFIGS.forEach((config, ringIndex) => {
            // Use configurable scale
            const scaleIndex = ringIndex % DRONE_SCALE.length;
            const freq = DRONE_BASE_FREQ * DRONE_SCALE[scaleIndex] * Math.pow(2, Math.floor(ringIndex / DRONE_SCALE.length));

            // Create three detuned oscillators for texture
            const osc1 = audioContext.createOscillator();
            const osc2 = audioContext.createOscillator();
            const osc3 = audioContext.createOscillator();

            // Low-pass filter for warmth
            const filterNode = audioContext.createBiquadFilter();
            filterNode.type = 'lowpass';
            filterNode.frequency.value = 800;
            filterNode.Q.value = 0.5;

            const gainNode = audioContext.createGain();

            // Mix of waveforms for richness
            osc1.type = 'sawtooth';
            osc2.type = 'triangle';
            osc3.type = 'sine';

            // Slight detuning for chorus effect
            osc1.frequency.value = freq;
            osc2.frequency.value = freq * 1.003; // +3 cents
            osc3.frequency.value = freq * 0.997; // -3 cents

            // Connect: oscillators -> filter -> gain -> (dry: master, wet: reverb)
            osc1.connect(filterNode);
            osc2.connect(filterNode);
            osc3.connect(filterNode);
            filterNode.connect(gainNode);

            // Dry signal to master
            gainNode.connect(masterGain);
            // Wet signal to reverb
            gainNode.connect(reverbNode);

            // Start at minimum audible level (exponentialRamp can't start from 0)
            gainNode.gain.setValueAtTime(0.001, audioContext.currentTime);

            osc1.start();
            osc2.start();
            osc3.start();

            ringOscillators.push({osc1, osc2, osc3, gainNode, filterNode});
            ringLonelyCounts.push(0);
        });
    }

    function updateRingDrone(ringIndex, lonelyCount) {
        if (!audioContext) return; // Don't update if audio not initialized yet

        const prevCount = ringLonelyCounts[ringIndex];
        if (lonelyCount === prevCount) return; // No change

        const {gainNode} = ringOscillators[ringIndex];
        const now = audioContext.currentTime;

        // Calculate target volume based on number of lonely runners
        // Volume scales with count: 0 lonely = silent, max lonely = max volume
        const N = RING_CONFIGS[ringIndex].velocities.length;
        const volumeScale = lonelyCount / N; // 0 to 1
        const maxVolume = 0.06; // Max volume per ring
        const targetVolume = lonelyCount > 0 ? 0.001 + (volumeScale * maxVolume) : 0.001;

        // Determine fade time
        const fadeTime = audioJustInitialized ? 8.0 :
                        (lonelyCount > prevCount ? 2.0 : 3.0); // Faster fade in, slower fade out

        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.exponentialRampToValueAtTime(targetVolume, now + fadeTime);

        ringLonelyCounts[ringIndex] = lonelyCount;
    }

    p.setup = async () => {
        // Offset so we start with an interesting configuration
        startStamp = Date.now() / 1000.0 - 36000;

        width = p._userNode.offsetWidth;
        height = p._userNode.offsetHeight;

        // Initialize canvas
        p.createCanvas(width, height, p.WEBGL);
        p.imageMode(p.CENTER);
        p.rectMode(p.CENTER);
        p.noStroke();

        // Create Shader
        const shaderData = createRunnerRingFragmentShader(RING_CONFIGS);
        runnerShader = p.createShader(DEFAULT_VERTEX_SHADER, shaderData.shader);
        p.shader(runnerShader);

        // Set constant uniforms once
        RING_CONFIGS.forEach((config, i) => {
            runnerShader.setUniform(`lonelyThreshold_${i}`, config.lonelyThreshold);
        });

        // Create color texture
        const maxRunners = Math.max(...RING_CONFIGS.map(c => c.velocities.length));
        const numRings = RING_CONFIGS.length;
        
        // p5 Graphics acts as a texture
        colorTexture = p.createGraphics(maxRunners, numRings);
        colorTexture.pixelDensity(1);
        colorTexture.loadPixels();
        
        for (let i = 0; i < numRings; i++) {
            const config = RING_CONFIGS[i];
            for (let j = 0; j < config.colors.length; j++) {
                const c = config.colors[j];
                const r = (c >> 16) & 0xFF;
                const g = (c >> 8) & 0xFF;
                const b = c & 0xFF;
                
                // Index in pixels array: 4 * (y * width + x)
                const idx = 4 * (i * maxRunners + j);
                
                colorTexture.pixels[idx] = r;
                colorTexture.pixels[idx + 1] = g;
                colorTexture.pixels[idx + 2] = b;
                colorTexture.pixels[idx + 3] = 255;
            }
        }
        colorTexture.updatePixels();

        // Create runner data texture (stores positions, loneliness, hasBeenLonely)
        runnerDataTexture = p.createFramebuffer({
            width: maxRunners,
            height: numRings,
            format: p.FLOAT,  // Use floating point texture
            textureFiltering: p.NEAREST,
            density: 1,
            antialias: false,
            depth: false
        });

        // Initialize/Reset state tracking
        hasBeenLonely = [];
        runnerOffsets = [];
        let totalRunners = 0;
        RING_CONFIGS.forEach((config, ringIndex) => {
            hasBeenLonely.push(new Array(config.velocities.length).fill(false));
            runnerOffsets.push(new Array(config.velocities.length).fill(0.0));
            // DEBUG: set equally around ring
            //runnerOffsets.push(config.velocities.map((_, j) => (TAU / config.velocities.length) * j));

            totalRunners += config.velocities.length;
        });
        
        // Setup UI
        lonelyCountEl = document.getElementById('lonely-count');
        totalRunnersEl = document.getElementById('total-runners');
        lonelyCounterContainer = document.getElementById('lonely-counter');
        muteButtonEl = document.getElementById('mute-toy');

        if (muteButtonEl) {
            muteButtonEl.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!audioContext) {
                    initAudio();
                }
                if (!hasUserInteractedWithCanvas) {
                    hasUserInteractedWithCanvas = true;
                }
                toggleMute();
            });
        }
        
        if (totalRunnersEl) {
            totalRunnersEl.textContent = totalRunners;
        }
        if (lonelyCounterContainer) {
            lonelyCounterContainer.style.opacity = 1;
        }
    }


    p.mousePressed = function () {
        // Initialize audio on first interaction
        if (!audioContext) {
            initAudio();
        }

        hasUserInteractedWithCanvas = true;

        const time = Date.now() / 1000.0 - startStamp;
        const clicked = getClickedRunner(p.mouseX, p.mouseY, time);

        if (clicked) {
            const {ringIndex, runnerIndex} = clicked;
            // Start dragging
            draggingRunner = {ringIndex, runnerIndex};
            lastMouseAngle = getMouseAngle(p.mouseX, p.mouseY);
        }
    }

    p.mouseDragged = function() {
        if (draggingRunner) {
            const currentMouseAngle = getMouseAngle(p.mouseX, p.mouseY);
            let dAngle = currentMouseAngle - lastMouseAngle;

            // Handle wrapping
            if (dAngle > Math.PI) dAngle -= TAU;
            if (dAngle < -Math.PI) dAngle += TAU;

            const {ringIndex, runnerIndex} = draggingRunner;
            runnerOffsets[ringIndex][runnerIndex] += dAngle;

            lastMouseAngle = currentMouseAngle;
        }
        return false; // Prevent default
    }

    p.mouseReleased = function() {
        draggingRunner = null;
    }

    // Support touch events for mobile
    p.touchStarted = function() {
        // Initialize audio on first interaction
        if (!audioContext) {
            initAudio();
        }

        hasUserInteractedWithCanvas = true;

        if (p.touches.length === 1) {
            // Simulate mouse press with first touch
            const touch = p.touches[0];
            p.mouseX = touch.x;
            p.mouseY = touch.y;
            p.mousePressed();
            return false; // Prevent default
        }
    }

    p.touchMoved = function() {
        if (p.touches.length === 1) {
            const touch = p.touches[0];
            p.mouseX = touch.x;
            p.mouseY = touch.y;
            p.mouseDragged();
            return false;
        }
    }

    p.touchEnded = function() {
        p.mouseReleased();
        return false;
    }


    p.draw = function () {
        p.clear();

        // Calculate current time (continuous animation)
        const time = Date.now() / 1000.0 - startStamp;

        // Calculate geometry parameters in Normalized Device Coordinates (UV space)
        const minDim = Math.min(width, height);
        const uvScale = 2.0 / minDim;

        const thicknessNorm = RING_THICKNESS_PX * uvScale;
        const spacingNorm = RING_SPACING_PX * uvScale;
        const innerRadiusNorm = INNER_RADIUS_PX * uvScale;

        // Pass dynamic uniforms
        runnerShader.setUniform("time", time);
        runnerShader.setUniform("resolution", [width * p.pixelDensity(), height * p.pixelDensity()]);
        runnerShader.setUniform("u_geom_params", [thicknessNorm, spacingNorm, innerRadiusNorm]);

        // Bind color texture
        runnerShader.setUniform("u_color_texture", colorTexture);
        runnerShader.setUniform("u_texture_size", [colorTexture.width, colorTexture.height]);

        // Update runner data texture with bit-packed data
        runnerDataTexture.loadPixels();

        let totalLonely = 0;

        RING_CONFIGS.forEach((config, i) => {
            // 1. Calculate all positions for this ring
            const currentPositions = config.velocities.map((v, j) => {
                const offset = runnerOffsets[i][j];
                return ((time * v * 0.5 * ANIMATION_SPEED) + offset) % TAU;
            });

            // 2. Calculate loneliness (buffer size) for each runner
            const loneliness = currentPositions.map((pos1, j) => {
                let minDist = TAU;
                currentPositions.forEach((pos2, k) => {
                    if (j === k) return;
                    let d = Math.abs(pos1 - pos2);
                    let dist = Math.min(d, TAU - d);
                    if (dist < minDist) minDist = dist;
                });
                return minDist * 0.5;
            });

            // 3. Count lonely runners in this ring and track first-time loneliness
            let lonelyCount = 0;
            for (let j = 0; j < config.velocities.length; j++) {
                const isLonely = isRunnerLonely(i, j, time);
                if (isLonely) {
                    lonelyCount++;
                    // Mark this runner as having been lonely
                    if (!hasBeenLonely[i][j]) {
                        hasBeenLonely[i][j] = true;
                    }
                }

                if (hasBeenLonely[i][j]) {
                    totalLonely++;
                }
            }

            // Update drone for this ring based on lonely count
            updateRingDrone(i, lonelyCount);

            // 4. Write runner data to float texture
            for (let j = 0; j < config.velocities.length; j++) {
                const position = currentPositions[j];
                const lonelyValue = loneliness[j];
                const hasBeenLonelyValue = hasBeenLonely[i][j] ? 1.0 : 0.0;

                const idx = 4 * (i * runnerDataTexture.width + j);
                runnerDataTexture.pixels[idx] = position;          // R: position (radians)
                runnerDataTexture.pixels[idx + 1] = lonelyValue;   // G: loneliness (radians)
                runnerDataTexture.pixels[idx + 2] = hasBeenLonelyValue; // B: hasBeenLonely (0.0 or 1.0)
                runnerDataTexture.pixels[idx + 3] = 1.0;            // A: unused
            }
        });

        runnerDataTexture.updatePixels();

        // Bind runner data texture
        runnerShader.setUniform("u_runner_data_texture", runnerDataTexture);
        runnerShader.setUniform("u_runner_texture_size", [runnerDataTexture.width, runnerDataTexture.height]);
        
        // Update UI counter
        if (lonelyCountEl) {
            lonelyCountEl.textContent = totalLonely;
        }

        // After first update cycle, disable the extra-gentle fade-in
        if (audioJustInitialized) {
            audioJustInitialized = false;
        }
        //console.log(p.frameRate())
        // Draw
        p.rect(0, 0, width, height);
    }

    p.windowResized = function () {
        width = p._userNode.offsetWidth;
        height = p._userNode.offsetHeight;
        p.resizeCanvas(width, height, true);
    }
}
