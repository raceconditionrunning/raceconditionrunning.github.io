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


// Simple seeded PRNG (Mulberry32)
function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

function generateRingConfigs(numRings, seed) {
    const configs = [];
    const innerRadius = INNER_RADIUS_PX;
    const trackHalfWidth = RING_THICKNESS_PX * 0.5;

    // Use seeded random if seed is provided, else Math.random
    const random = seed ? mulberry32(seed) : Math.random;

    for (let i = 0; i < numRings; i++) {
        const numRunners = i + 3;
        const velocities = [];
        const colors = [];

        // Calculate this ring's radius (centered in the track)
        const ringRadius = innerRadius + trackHalfWidth + i * RING_SPACING_PX;

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
            const k = Math.floor(random() * (j + 1));
            [colorPool[j], colorPool[k]] = [colorPool[k], colorPool[j]];
        }

        for (let j = 0; j < numRunners; j++) {
            // Random base velocity between 0.5 and 3.0
            const baseVelocity = 0.5 + random() * 2.5;

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


function createRunnerRingFragmentShader(ringConfigs) {
    
    // Generate uniform declarations
    let uniforms = ``;
    uniforms += `uniform vec3 u_geom_params;\n`; // x: thickness_norm, y: spacing_norm, z: inner_radius_norm
    uniforms += `uniform sampler2D u_color_texture;\n`;
    uniforms += `uniform vec2 u_texture_size;\n`;
    uniforms += `uniform sampler2D u_runner_data_texture;\n`; // Packed runner data (position, loneliness, hasBeenLonely)
    uniforms += `uniform vec2 u_runner_texture_size;\n`; // Size of runner data texture
    uniforms += `uniform sampler2D u_flash_texture;\n`; // Flash intensity per ring

    for (let i = 0; i < ringConfigs.length; i++) {
        uniforms += `uniform float lonelyThreshold_${i};\n`; // TAU/(2*N) for this ring
    }

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
            float trackRadius = innerRadius + float(${i}) * spacing;
            float distToTrackCenter = dist - trackRadius;

            if (abs(distToTrackCenter) < trackWidth) {
                // Read flash intensity for this ring
                float flashIntensity = texelFetch(u_flash_texture, ivec2(${i}, 0), 0).r;
                vec3 finalRingColor = vec3(flashIntensity * 0.4); // Initialize with flash glow
                float minSd = 1000.0;
                float nearestLoneliness = 0.0;

                // Track which runner is nearest and whether it has been lonely
                int nearestRunnerIndex = 0;
                int nearestRunnerHasBeenLonely = 0;

                // Check all runners to find the closest segment shape
                for (int j = 0; j < ${n}; j++) {
                    // Unpack runner data from texture
                    ivec2 pixelCoord = ivec2(j, ${i});
                    vec4 runnerData = texelFetch(u_runner_data_texture, pixelCoord, 0);
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
                    // Each cap has radius 'runnerWidth'.
                    float segLen = max(0.0, halfArcLength - runnerWidth - gap);

                    // SDF for a 2D segment on the X-axis from -segLen to +segLen
                    // with radius 'runnerWidth'.
                    vec2 pSeg = vec2(max(abs(distArc) - segLen, 0.0), distRadial);
                    float sd = length(pSeg) - runnerWidth;

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
                float trackAlpha = 0.0;
                float finalAlpha = max(trackAlpha, runnerAlpha * opacity * 0.9);

                // Increase alpha slightly if flashing
                finalAlpha = max(finalAlpha, flashIntensity * 0.3);

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

    void main() {
        // Normalize coordinates to [-1, 1], correcting for aspect ratio
        vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);

        // Convert to polar coordinates
        float dist = length(uv);
        float angle = atan(uv.y, uv.x); // [-PI, PI]
        if (angle < 0.0) angle += TAU;  // [0, TAU]

        // Default Background
        outColor = vec4(0.0, 0.0, 0.0, 0.0); 
        
       float trackWidth = u_geom_params.x;
        float spacing = u_geom_params.y;
        float innerRadius = u_geom_params.z;
        float trackHalfWidth = trackWidth * 0.5;
        float runnerWidth = trackWidth * 0.45;

        // Generated Ring Logic
        ${ringLogic}
    }
    `;
    return { shader: frag };
}

export let LonelyRunnerToy = (numRings = NUM_RINGS) => p => {
    const ringConfigs = generateRingConfigs(numRings, Math.floor(Date.now() / 1000));
    // For debugging:
    //const ringConfigs = generateEquidistantRingConfigs(NUM_RINGS);
    let width;
    let height;
    let runnerShader;
    let startStamp;
    let colorTexture;
    let runnerDataTexture;

    const TAU = Math.PI * 2;

    // Visibility tracking
    let isVisible = true;
    let observer = null;

    // Interaction state
    let draggingRunner = null;
    let lastMouseAngle = 0;

    // Track which runners have been lonely at least once
    let hasBeenLonely = []; // Array of arrays (per ring, per runner)
    // Track manual position offsets for runners
    let runnerOffsets = []; // Array of arrays (per ring, per runner)

    // Ring flash state for visual feedback
    let ringFlashStates = []; // Array of {intensity, startTime}
    let flashTexture = null;

    // Center mechanism pulse state
    let isPulsing = false;
    let infinitePulseHandle = null; // Handle to the infinite pulse sequence when all runners have been lonely

    // UI elements
    let lonelyCountEl = null;
    let totalRunnersEl = null;
    let lonelyCounterContainer = null;
    let muteButtonEl = null;
    let isMuted = true;
    let hasUserInteractedWithCanvas = false;
    let totalRunners = 0;

    function toggleMute(targetState) {
        if (typeof targetState !== 'undefined') {
            isMuted = targetState;
        } else {
            isMuted = !isMuted;
        }

        if (muteGain) {
            const now = audioContext.currentTime;
            muteGain.gain.cancelScheduledValues(now);
            muteGain.gain.setValueAtTime(muteGain.gain.value, now);
            // Ramp to a very small value instead of 0 to avoid issues with exponential ramps elsewhere if any
            muteGain.gain.linearRampToValueAtTime(isMuted ? 0.0001 : 1.0, now + 0.1);
        }
        if (muteButtonEl) {
            muteButtonEl.classList.toggle('muted', isMuted);
        }

        // Suspend audio context when muted to save battery
        if (audioContext) {
            if (isMuted && audioContext.state === 'running') {
                audioContext.suspend();
            } else if (!isMuted && audioContext.state === 'suspended') {
                audioContext.resume();
            }
        }
    }

    // Helper: Calculate positions for a ring at a given time
    function getPositionsAtTime(ringIndex, time) {
        return ringConfigs[ringIndex].velocities.map((v, i) => {
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

    // Helper: Get mouse position in polar coordinates relative to center (UV space)
    function getMousePolar(mouseX, mouseY) {
        const minDim = Math.min(width, height);
        const uvScale = 2.0 / minDim;

        // p5 WEBGL mode has origin at center, so adjust
        const uvX = (mouseX - width / 2) * uvScale;
        const uvY = -(mouseY - height / 2) * uvScale; // Flip Y for WebGL

        const dist = Math.sqrt(uvX * uvX + uvY * uvY);
        let angle = Math.atan2(uvY, uvX);
        if (angle < 0) angle += TAU;

        return { dist, angle, uvScale };
    }

    // Helper: Identify ring index from normalized distance
    function getRingIndexFromDist(dist, uvScale) {
        // Calculate geometry parameters
        const thicknessNorm = RING_THICKNESS_PX * uvScale;
        const spacingNorm = RING_SPACING_PX * uvScale;
        const innerRadiusNorm = INNER_RADIUS_PX * uvScale;
        const trackHalfWidth = thicknessNorm * 0.5;

        // Check if click is in center mechanism
        if (dist < innerRadiusNorm - thicknessNorm) {
            return -1;
        }

        // Find which ring (if any)
        for (let ringIndex = 0; ringIndex < ringConfigs.length; ringIndex++) {
            const trackRadius = innerRadiusNorm + ringIndex * spacingNorm;

            if (Math.abs(dist - trackRadius) <= thicknessNorm) {
                return ringIndex;
            }
        }
        return null;
    }

    // Helper: Detect which ring was clicked
    // Returns ring index (0+), -1 for center mechanism, or null for outside all rings
    function getClickedRing(mouseX, mouseY) {
        const { dist, uvScale } = getMousePolar(mouseX, mouseY);
        return getRingIndexFromDist(dist, uvScale);
    }

    // Helper: Detect which runner (if any) was clicked
    // Returns {ringIndex, runnerIndex} or null
    function getClickedRunner(mouseX, mouseY, time) {
        const { angle, dist, uvScale } = getMousePolar(mouseX, mouseY);
        const ringIndex = getRingIndexFromDist(dist, uvScale);

        if (ringIndex === null || ringIndex === -1) return null;

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

        return null;
    }

    // Helper: Trigger visual flash for a ring
    function flashRing(ringIndex) {
        ringFlashStates[ringIndex] = {
            intensity: 1.0,
            startTime: Date.now() / 1000.0 - startStamp
        };
    }

    // Helper: Play percussive note for a ring
    function playRingNote(ringIndex) {
        if (!audioContext) return;

        // Calculate frequency same as the drone for this ring
        const scaleIndex = ringIndex % DRONE_SCALE.length;
        const freq = DRONE_BASE_FREQ * DRONE_SCALE[scaleIndex] * Math.pow(2, Math.floor(ringIndex / DRONE_SCALE.length));

        // Create one-shot oscillator
        const osc = audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;

        // Create gain for envelope
        const noteGain = audioContext.createGain();
        const now = audioContext.currentTime;

        // Percussive envelope: fast attack, medium decay
        noteGain.gain.setValueAtTime(0, now);
        noteGain.gain.linearRampToValueAtTime(0.25, now + 0.005); // 5ms attack
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.80); // 800ms decay

        // Connect: oscillator -> gain -> reverb + mute
        osc.connect(noteGain);
        noteGain.connect(muteGain);
        noteGain.connect(reverbNode); // Add reverb for atmosphere

        // Start and stop
        osc.start(now);
        osc.stop(now + 1.0); // Stop after 300ms
    }

    // Helper: Pulse rings in sequence, skipping those with no lonely runners
    function pulseRingsWithLonely(pulseHandle = null) {
        const isInfinitePulse = pulseHandle === infinitePulseHandle && infinitePulseHandle !== null;

        if (isPulsing && !isInfinitePulse) return; // Already pulsing (unless this is the infinite pulse)
        isPulsing = true;

        // Find all rings with lonely runners
        const ringsWithLonely = [];
        ringLonelyCounts.forEach((count, ringIndex) => {
            if (count > 0) {
                ringsWithLonely.push(ringIndex);
            }
        });

        // Pulse each ring in sequence with delays
        ringsWithLonely.forEach((ringIndex, sequenceIndex) => {
            setTimeout(() => {
                flashRing(ringIndex);
                playRingNote(ringIndex);

                // Reset isPulsing flag after the last ring
                if (sequenceIndex === ringsWithLonely.length - 1) {
                    setTimeout(() => {
                        isPulsing = false;
                        // If this is the infinite pulse, immediately trigger the next cycle
                        if (isInfinitePulse) {
                            pulseRingsWithLonely(pulseHandle);
                        }
                    }, 400); // Small delay after last pulse
                }
            }, sequenceIndex * 200); // 200ms between each ring pulse
        });

        // If no rings have lonely runners, reset immediately
        if (ringsWithLonely.length === 0) {
            isPulsing = false;
        }
    }

    // Audio system - continuous drones per ring

    let audioContext = null;
    let masterGain = null; // Master gain for gentle overall fade-in
    let muteGain = null; // Separate gain for muting without affecting fade-in
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

        // Create master gain node for overall volume control and fade-in
        masterGain = audioContext.createGain();
        masterGain.connect(audioContext.destination);

        // Create separate mute gain node
        muteGain = audioContext.createGain();
        muteGain.connect(masterGain);

        // Start master gain at very low level for gentle fade-in
        masterGain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        // Gentle fade-in over 8 seconds to match reverb tail build-up
        masterGain.gain.exponentialRampToValueAtTime(1.0, audioContext.currentTime + 8.0);

        // Initialize mute gain based on mute state
        muteGain.gain.value = isMuted ? 0.0001 : 1.0;

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

        // Reverb signal path: reverb -> filter -> delay -> feedback -> mute -> master
        reverbNode.connect(reverbFilter);
        reverbFilter.connect(feedbackDelay);
        feedbackDelay.connect(feedbackGain);
        feedbackGain.connect(feedbackDelay); // Feedback loop
        feedbackDelay.connect(reverbGain);
        reverbGain.connect(muteGain);

        // Create persistent oscillator + gain for each ring
        ringConfigs.forEach((config, ringIndex) => {
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

            // Connect: oscillators -> filter -> gain -> (dry: mute, wet: reverb)
            osc1.connect(filterNode);
            osc2.connect(filterNode);
            osc3.connect(filterNode);
            filterNode.connect(gainNode);

            // Dry signal to mute gain
            gainNode.connect(muteGain);
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
        const N = ringConfigs[ringIndex].velocities.length;
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
        const shaderData = createRunnerRingFragmentShader(ringConfigs);
        runnerShader = p.createShader(DEFAULT_VERTEX_SHADER, shaderData.shader);
        p.shader(runnerShader);

        // Set constant uniforms once
        ringConfigs.forEach((config, i) => {
            runnerShader.setUniform(`lonelyThreshold_${i}`, config.lonelyThreshold);
        });

        // Create color texture
        const maxRunners = Math.max(...ringConfigs.map(c => c.velocities.length));
        const numRings = ringConfigs.length;
        
        // p5 Graphics acts as a texture
        colorTexture = p.createGraphics(maxRunners, numRings);
        colorTexture.pixelDensity(1);
        colorTexture.loadPixels();
        
        for (let i = 0; i < numRings; i++) {
            const config = ringConfigs[i];
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

        // Create flash texture (stores flash intensity per ring)
        flashTexture = p.createFramebuffer({
            width: numRings,
            height: 1,
            format: p.FLOAT,
            textureFiltering: p.NEAREST,
            density: 1,
            antialias: false,
            depth: false
        });

        // Initialize/Reset state tracking
        hasBeenLonely = [];
        runnerOffsets = [];
        ringFlashStates = [];
        totalRunners = 0;
        ringConfigs.forEach((config, ringIndex) => {
            hasBeenLonely.push(new Array(config.velocities.length).fill(false));
            runnerOffsets.push(new Array(config.velocities.length).fill(0.0));
            // DEBUG: set equally around ring
            //runnerOffsets.push(config.velocities.map((_, j) => (TAU / config.velocities.length) * j));

            ringFlashStates.push({intensity: 0.0, startTime: 0.0});
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

        // Set up intersection observer to pause when not visible
        setupVisibilityObserver();
    }

    function setupVisibilityObserver() {
        if ('IntersectionObserver' in window) {
            observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    isVisible = entry.isIntersecting;
                    // Resume audio context if scrolling back and user has unmuted
                    if (isVisible && audioContext && audioContext.state === 'suspended' && !isMuted) {
                        audioContext.resume();
                    }
                    // Note: We don't call p.noLoop() - instead we skip rendering in draw() when !isVisible
                });
            }, {
                threshold: 0.01 // Trigger when 1% of element is visible
            });

            observer.observe(p._userNode);
        }
    }

    p.mousePressed = function () {
        // Initialize audio on first interaction
        if (!audioContext) {
            initAudio();
        }

        hasUserInteractedWithCanvas = true;

        const time = Date.now() / 1000.0 - startStamp;

        // Check which area was clicked
        const clickedRing = getClickedRing(p.mouseX, p.mouseY);

        // Check if user clicked in the center mechanism
        if (clickedRing === -1) {
            if (p.keyIsDown(p.SHIFT)) {
                if (infinitePulseHandle) {
                    // Cancel infinite pulse
                    infinitePulseHandle = null;
                } else {
                    // Start infinite pulse
                    infinitePulseHandle = Symbol('infinite-pulse');
                    pulseRingsWithLonely(infinitePulseHandle);
                }
            } else {
                // Regular click triggers manual pulse
                pulseRingsWithLonely();
            }
            return;
        }

        const clickedRunner = getClickedRunner(p.mouseX, p.mouseY, time);

        if (clickedRunner) {
            const {ringIndex, runnerIndex} = clickedRunner;
            // Start dragging
            draggingRunner = {ringIndex, runnerIndex};
            lastMouseAngle = getMouseAngle(p.mouseX, p.mouseY);
        } else if (clickedRing !== null) {
            // User clicked on a ring (but not on a runner)
            flashRing(clickedRing);
            playRingNote(clickedRing);
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

        ringConfigs.forEach((config, i) => {
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


        // Update UI counter with fraction
        if (lonelyCountEl) {
            lonelyCountEl.textContent = totalLonely;
        }

        if (infinitePulseHandle === null && totalLonely === totalRunners && totalRunners > 0) {
            infinitePulseHandle = Symbol('infinite-pulse');
            pulseRingsWithLonely(infinitePulseHandle);
        }

        // After first update cycle, disable the extra-gentle fade-in
        if (audioJustInitialized) {
            audioJustInitialized = false;
        }

        // Skip rendering if not visible (but keep simulation + audio running)
        if (!isVisible) {
            return;
        }


        // Bind runner data texture
        runnerShader.setUniform("u_runner_data_texture", runnerDataTexture);
        runnerShader.setUniform("u_runner_texture_size", [runnerDataTexture.width, runnerDataTexture.height]);

        // Update flash intensities and flash texture
        flashTexture.loadPixels();
        const flashDuration = 0.6;
        ringFlashStates.forEach((state, ringIndex) => {
            const elapsed = time - state.startTime;
            const t = elapsed / flashDuration;

            // Ease-out quadratic: (1 - t)^2
            if (t < 1.0 && t >= 0.0) {
                state.intensity = (1 - t) * (1 - t);
            } else if (t >= 1.0) {
                state.intensity = 0.0;
            }

            // Write to flash texture (R channel only)
            const idx = ringIndex * 4;
            flashTexture.pixels[idx] = state.intensity;
            flashTexture.pixels[idx + 1] = 0.0;  // G: unused
            flashTexture.pixels[idx + 2] = 0.0;  // B: unused
            flashTexture.pixels[idx + 3] = 1.0;  // A: unused
        });
        flashTexture.updatePixels();

        // Bind flash texture
        runnerShader.setUniform("u_flash_texture", flashTexture);

        // Cursor logic
        if (draggingRunner) {
            p.cursor('grabbing');
        } else {
            const hoveredRunner = getClickedRunner(p.mouseX, p.mouseY, time);
            if (hoveredRunner) {
                p.cursor('grab');
            } else {
                p.cursor('pointer');
            }
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

    // Cleanup when p5 instance is removed
    p.remove = function() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }
}
