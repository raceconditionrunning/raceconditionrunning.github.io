import {DEFAULT_VERTEX_SHADER} from "./shader_utils.js";

// --- Configuration Constants ---
const RING_THICKNESS_PX = 10;
const RING_SPACING_PX = 20;
const INNER_RADIUS_PX = 200;
const NUM_RINGS = 15;
const USE_DISTINCT_COLORS = false; // Toggle for color vs B&W mode
const HIGHLIGHT_LONELY = true;    // Toggle opacity based on loneliness

// Generate colors (HSL to RGB conversion helper or just simple generation)
function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [r, g, b];
}

function generateRingConfigs(numRings) {
    const configs = [];
    // Start with 3 runners on the inner ring?
    // Or just distinct velocities for each ring?
    // Let's assume standard Lonely Runner setup: N runners with velocities 1..N
    // But we have multiple rings.
    // Let's give Ring i -> (i + 3) runners with velocities 1..(i+3)
    // Colors generated rainbow-like across the rings.
    
    for (let i = 0; i < numRings; i++) {
        const numRunners = i + 3;
        const velocities = [];
        const colors = [];
        
        for (let j = 0; j < numRunners; j++) {
            // Velocities: 1, 2, 3 ...
            velocities.push(j + 1.0);
            
            // Color: Vary Hue based on velocity index and ring index
            // Global rainbow?
            const hue = (j / numRunners + i / numRings) % 1.0;
            const rgb = hslToRgb(hue, 0.7, 0.6);
            colors.push(rgb);
        }
        
        configs.push({
            velocities: velocities,
            colors: colors
        });
    }
    return configs;
}

const RING_CONFIGS = generateRingConfigs(NUM_RINGS);

function createRunnerRingFragmentShader(ringConfigs) {
    
    // Generate uniform declarations
    let uniforms = ``;
    uniforms += `uniform vec3 u_geom_params;\n`; // x: thickness_norm, y: spacing_norm, z: inner_radius_norm
    uniforms += `uniform bool u_use_colors;\n`;
    uniforms += `uniform bool u_highlight_lonely;\n`;
    
    for (let i = 0; i < ringConfigs.length; i++) {
        const n = ringConfigs[i].velocities.length;
        // Optimization: Pass pre-computed positions and buffer sizes
        uniforms += `uniform vec3 colors_${i}[${n}];\n`;
        uniforms += `uniform float positions_${i}[${n}];\n`; 
        uniforms += `uniform float loneliness_${i}[${n}];\n`;
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
                vec3 nearestRunnerColor = vec3(0.0);
                float nearestLoneliness = 0.0;
                
                // Check all runners to find the closest segment shape
                for (int j = 0; j < ${n}; j++) {
                    // Polar-ish coordinates
                    // X: Arc length along the ring relative to runner center
                    float distArc = angularDist(angle, positions_${i}[j]) * trackRadius;
                    // Y: Radial distance from center of ring
                    float distRadial = distToTrackCenter; 
                    
                    // Capsule (Segment) Logic
                    float halfArcLength = loneliness_${i}[j] * trackRadius;
                    
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
                        nearestRunnerColor = u_use_colors ? colors_${i}[j] : vec3(1.0);
                        nearestLoneliness = loneliness_${i}[j];
                    }
                }
                
                // Blend Runner on top of Track
                // smoothstep gives a nice anti-aliased edge (pixel width approx)
                // We use fwidth for AA? Or fixed constant. Fixed is safer for now.
                float aaWidth = 0.002; 
                float runnerAlpha = 1.0 - smoothstep(0.0, aaWidth, minSd);
                
                // Highlight lonely runners
                float opacity = 1.0;
                if (u_highlight_lonely) {
                    // Map loneliness (angular half-distance) to opacity
                    // Non-linear ramp to make "lonely" state pop massively
                    // loneliness is radians.
                    // 0.05 rad is crowded. 0.5 rad is lonely.
                    float normL = smoothstep(0.05, 0.5, nearestLoneliness);
                    // Power curve to compress the low end and pop the high end
                    opacity = 0.1 + 0.9 * pow(normL, 8.0);
                }
                
                finalRingColor = mix(finalRingColor, nearestRunnerColor, runnerAlpha * opacity);
                
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
    precision mediump float;

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

        // Generated Ring Logic
        ${ringLogic}
    }
    `;
    return { shader: frag };
}

export let LonelyRunnerToy = rootUrl => p => {
    let width;
    let height;
    let runnerShader;
    let startStamp;

    p.setup = async () => {
        startStamp = Date.now() / 1000.0;

        width = p._userNode.offsetWidth;
        height = p._userNode.offsetHeight;
        
        // Initialize canvas
        p.createCanvas(width, height, p.WEBGL);
        p.imageMode(p.CENTER);
        p.rectMode(p.CENTER); // Ensure quads are drawn from center
        p.noStroke();

        // Create Shader
        const shaderData = createRunnerRingFragmentShader(RING_CONFIGS);
        runnerShader = p.createShader(DEFAULT_VERTEX_SHADER, shaderData.shader);
        p.shader(runnerShader);
        
        // Set static uniforms for each ring (colors)
        RING_CONFIGS.forEach((config, index) => {
            // Velocities not needed in shader anymore
            runnerShader.setUniform(`colors_${index}`, config.colors.flat());
        });
    }

    p.draw = function () {
        p.clear();
        
        // Calculate geometry parameters in Normalized Device Coordinates (UV space)
        // UV space goes from -1 to 1 along the shortest dimension.
        // So 1 unit = min(width, height) / 2 pixels.
        const minDim = Math.min(width, height);
        const uvScale = 2.0 / minDim; // 1 pixel = uvScale units
        
        const thicknessNorm = RING_THICKNESS_PX * uvScale;
        const spacingNorm = RING_SPACING_PX * uvScale;
        const innerRadiusNorm = INNER_RADIUS_PX * uvScale;
        
        // Pass dynamic uniforms
        const time = (Date.now() / 10000.0 - startStamp);
        runnerShader.setUniform("time", time);
        // Fix for high-DPI displays: pass physical resolution
        runnerShader.setUniform("resolution", [width * p.pixelDensity(), height * p.pixelDensity()]);
        
        // Pass geometry params
        runnerShader.setUniform("u_geom_params", [thicknessNorm, spacingNorm, innerRadiusNorm]);
        runnerShader.setUniform("u_use_colors", USE_DISTINCT_COLORS);
        runnerShader.setUniform("u_highlight_lonely", HIGHLIGHT_LONELY);
        
        const TAU = Math.PI * 2;

        RING_CONFIGS.forEach((config, i) => {
            // 1. Calculate all positions for this ring
            const currentPositions = config.velocities.map(v => (time * v * 0.5) % TAU);
            
            // 2. Calculate loneliness (buffer size) for each runner
            const loneliness = currentPositions.map((pos1, j) => {
                let minDist = TAU;
                currentPositions.forEach((pos2, k) => {
                    if (j === k) return;
                    let d = Math.abs(pos1 - pos2);
                    // Handle wrap-around distance
                    let dist = Math.min(d, TAU - d);
                    if (dist < minDist) minDist = dist;
                });
                // Territory is half the distance to the nearest neighbor
                return minDist * 0.5; 
            });

            // 3. Update uniforms
            // Use Float32Array for safe WebGL uniform passing
            runnerShader.setUniform(`positions_${i}`, new Float32Array(currentPositions));
            runnerShader.setUniform(`loneliness_${i}`, new Float32Array(loneliness));
        });
        
        // Draw a rect covering the screen to run the shader
        p.rect(0, 0, width, height);
    }

    p.windowResized = function () {
        width = p._userNode.offsetWidth;
        height = p._userNode.offsetHeight;
        p.resizeCanvas(width, height, true);
    }
}
