/**
 * Originally By Alex Harri (https://alexharri.com/blog/webgl-gradients)
 * Shamelessly stolen and tweaked.
 */
import { noiseUtils, simplex_noise } from "../shader_utils.js";

const DEFAULT_VERTEX_SHADER = /* glsl */ `#version 300 es

in vec3 aPosition;

void main() {
  vec4 positionVec4 = vec4(aPosition, 1.0);
  positionVec4.xy = positionVec4.xy * 2.0 - 1.0;
  gl_Position = positionVec4;
}`;

const createFragmentShader = (options) => {
    const {
        blurAmount = 345,
        blurQuality = 7,
        blurExponentRange = [0.9, 1.2],
    } = options

    const uniforms = {};

    const shader = /* glsl */ `#version 300 es
precision mediump float;

    uniform float u_time; // Time in seconds
    uniform float u_h;
    uniform float u_w;
    uniform sampler2D u_gradient;
    
    out vec4 outColor;
  
    const float PI = 3.14159;

    float WAVE1_Y(float x) { return 0.45 * x;} 
    float WAVE2_Y(float x) { return 0.9 * x;}
    float WAVE1_HEIGHT(float x) { return 0.195 * x;} 
    float WAVE2_HEIGHT(float x) {return 0.144 * x;}

  
    ${noiseUtils}
    ${simplex_noise}

    float get_x() {
      return 900.0 + gl_FragCoord.x - u_w / 2.0;
    }
  
    // Various utility functions
    float smoothstep_custom(float t)
      { return t * t * t * (t * (6.0 * t - 15.0) + 10.0); }

    float lerp(float a, float b, float t)
      { return a * (1.0 - t) + b * t; }

    float ease_in(float x)
      { return 1.0 - cos((x * PI) * 0.5); }

    float wave_alpha_part(float dist, float blur_fac, float t) {
      float exp = mix(${blurExponentRange[0].toFixed(5)}, ${blurExponentRange[1].toFixed(5)}, t);
      float v = pow(blur_fac, exp);
      v = ease_in(v);
      v = smoothstep_custom(v);
      v = clamp(v, 0.008, 1.0);
      v *= ${blurAmount.toFixed(1)};
      float alpha = clamp(0.5 + dist / v, 0.0, 1.0);
      alpha = smoothstep_custom(alpha);
      return alpha;
    }

    float background_noise(float offset) {
      const float S = 0.064;
      const float L = 0.00085;
      const float L1 = 1.5, L2 = 0.9, L3 = 0.6;
      const float LY1 = 1.00, LY2 = 0.85, LY3 = 0.70;
      const float F = 0.04;
      const float Y_SCALE = 1.0 / 0.27;

      float x = get_x() * L;
      float y = gl_FragCoord.y * L * Y_SCALE;
      float time = u_time + offset;
      float x_shift = time * F;
      float sum = 0.5;
      sum += simplex_noise(vec3(x * L1 +  x_shift * 1.1, y * L1 * LY1, time * S)) * 0.30;
      sum += simplex_noise(vec3(x * L2 + -x_shift * 0.6, y * L2 * LY2, time * S)) * 0.25;
      sum += simplex_noise(vec3(x * L3 +  x_shift * 0.8, y * L3 * LY3, time * S)) * 0.20;
      return sum;
    }

    float wave_y_noise(float offset) {
      const float L = 0.000845;
      const float S = 0.075;
      const float F = 0.026;

      float time = u_time + offset;
      float x = get_x() * 0.000845;
      float y = time * S;
      float x_shift = time * 0.026;

      float sum = 0.0;
      sum += simplex_noise(vec2(x * 1.30 + x_shift, y * 0.54)) * 0.85;
      sum += simplex_noise(vec2(x * 1.00 + x_shift, y * 0.68)) * 1.15;
      sum += simplex_noise(vec2(x * 0.70 + x_shift, y * 0.59)) * 0.60;
      sum += simplex_noise(vec2(x * 0.40 + x_shift, y * 0.48)) * 0.40;
      return sum;
    }

    float calc_blur_bias() {
      const float S = 0.261;
      float bias_t = (sin(u_time * S) + 1.0) * 0.5;
      return lerp(-0.17, -0.04, bias_t);
    }

    float calc_blur(float offset) {
      const float L = 0.0011;
      const float S = 0.07;
      const float F = 0.03;
      
      float time = u_time + offset;

      float x = get_x() * L;
      float blur_fac = calc_blur_bias();
      blur_fac += simplex_noise(vec2(x * 0.60 + time * F *  1.0, time * S * 0.7)) * 0.5;
      blur_fac += simplex_noise(vec2(x * 1.30 + time * F * -0.8, time * S * 1.0)) * 0.4;
      blur_fac = (blur_fac + 1.0) * 0.5;
      blur_fac = clamp(blur_fac, 0.0, 1.0);
      return blur_fac;
    }

    float wave_alpha(float Y, float wave_height, float offset) {
      float wave_y = Y + wave_y_noise(offset) * wave_height;
      float dist = wave_y - gl_FragCoord.y;
      float blur_fac = calc_blur(offset);
      
      const float PART = 1.0 / float(${blurQuality.toFixed(1)});
      float sum = 0.0;
      for (int i = 0; i < ${blurQuality}; i++) {
        float t = ${blurQuality} == 1 ? 0.5 : PART * float(i);
        sum += wave_alpha_part(dist, blur_fac, t) * PART;
      }
      return sum;
    }
  
    vec3 calc_color(float lightness) {
      lightness = clamp(lightness, 0.0, 1.0);
      return vec3(texture(u_gradient, vec2(lightness, 0.5)));
    }
  
    void main() {
      float bg_lightness = background_noise(-192.4);
      float w1_lightness = background_noise( 273.3);
      float w2_lightness = background_noise( 623.1);

      float w1_alpha = wave_alpha(WAVE1_Y(u_h), WAVE1_HEIGHT(u_h), 112.5 * 48.75);
      float w2_alpha = wave_alpha(WAVE2_Y(u_h), WAVE2_HEIGHT(u_h), 225.0 * 36.00);

      float lightness = bg_lightness;
      lightness = lerp(lightness, w2_lightness, w2_alpha);
      lightness = lerp(lightness, w1_lightness, w1_alpha);

      outColor = vec4(calc_color(lightness), 1.0);
    }
  `;
    return { shader, uniforms };
};

// Helper function to create a gradient texture
function createGradientTexture(p, colors) {
    const gradientWidth = 256;
    const gradientHeight = 1;

    const texture = p.createImage(gradientWidth, gradientHeight);
    texture.loadPixels();
    for (let i = 0; i < gradientWidth; i++) {
        const t = i / (gradientWidth - 1);
        const colorIndex = Math.floor(t * (colors.length - 1));
        const localT = (t * (colors.length - 1)) - colorIndex;

        const color1 = colors[colorIndex];
        const color2 = colors[Math.min(colorIndex + 1, colors.length - 1)];

        const r = Math.floor(color1[0] * (1 - localT) + color2[0] * localT);
        const g = Math.floor(color1[1] * (1 - localT) + color2[1] * localT);
        const b = Math.floor(color1[2] * (1 - localT) + color2[2] * localT);

        const pixelIndex = i * 4;
        texture.pixels[pixelIndex] = r;
        texture.pixels[pixelIndex + 1] = g;
        texture.pixels[pixelIndex + 2] = b;
        texture.pixels[pixelIndex + 3] = 255;
    }

    texture.updatePixels();
    return texture;
}

export let WavyScene = gradientColors => p => {
    let width;
    let height;
    let outBuffer;
    let waveShader;
    let canvas;
    let gradientTexture;
    let hasRenderedFirstFrame = false;

    p.setup = async () => {
        width = p._userNode.offsetWidth;
        height = p._userNode.offsetHeight;
        canvas = p.createCanvas(width, height, p.WEBGL);

        // Check available webgl features if something isn't working
        // const ctx = canvas.elt.getContext("webgl2")
        // console.log(ctx.getSupportedExtensions())

        // Table of supported texture types: https://webgl2fundamentals.org/webgl/lessons/webgl-data-textures.html
        // Mobile targets usually can't render float textures. This buffer's shader needs to process to RGBA
        outBuffer = p.createFramebuffer({
            format: p.UNSIGNED_BYTE,
            width: width,
            height: height,
            density: 1,
            depth: false
        });

        p.imageMode(p.CENTER);
        p.noStroke();


        gradientTexture = createGradientTexture(p, gradientColors);
        const shader = createFragmentShader({});
        waveShader = p.createShader(DEFAULT_VERTEX_SHADER, shader['shader']);
        // First call builds the shader program
        p.shader(waveShader);
        
        // Start with canvas invisible for fade-in effect
        canvas.elt.style.opacity = '0';
        canvas.elt.style.transition = 'opacity 0.8s ease-in-out';
    }

    p.draw = () => {
        outBuffer.begin();
        p.clear();
        p.shader(waveShader);

        // Set uniforms
        waveShader.setUniform('u_time', p.millis() / 1000.0);
        waveShader.setUniform('u_h', height);
        waveShader.setUniform('u_w', width);
        waveShader.setUniform('u_gradient', gradientTexture);

        p.rect(0, 0, width, -height);
        outBuffer.end();

        p.clear();
        p.image(outBuffer, 0, 0, p._userNode.offsetWidth, -p._userNode.offsetHeight);
        
        // Fade in after first successful render
        if (!hasRenderedFirstFrame) {
            hasRenderedFirstFrame = true;
            canvas.elt.style.opacity = '1';
        }
    }

    p.windowResized = function () {
        width = p._userNode.offsetWidth;
        height = p._userNode.offsetHeight;
        p.resizeCanvas(width, height, true);
        outBuffer.resize(width, height);
    }
}