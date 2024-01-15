#version 300 es

precision highp float;
uniform sampler2D previous;
uniform sampler2D jets;
uniform float dampening;
uniform vec2 resolution;
uniform vec3 mouse;
uniform float time;

out vec4 outColor;
//
// Description : Array and textureless GLSL 2D/3D/4D simplex
//               noise functions.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : stegu
//     Lastmod : 20201014 (stegu)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//               https://github.com/stegu/webgl-noise
//

vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
    return mod289(((x*34.0)+10.0)*x);
}

vec4 taylorInvSqrt(vec4 r)
{
    return 1.79284291400159 - 0.85373472095314 * r;
}

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

//mini
float noise1(float seed1,float seed2){
    return(
    fract(seed1+12.34567*
          fract(100.*(abs(seed1*0.91)+seed2+94.68)*
                fract((abs(seed2*0.41)+45.46)*
                      fract((abs(seed2)+757.21)*
                            fract(seed1*0.0171))))))
    * 1.0038 - 0.00185;
}

//2 seeds
float noise2(float seed1,float seed2){
    float buff1 = abs(seed1+100.94) + 1000.;
    float buff2 = abs(seed2+100.73) + 1000.;
    buff1 = (buff1*fract(buff2*fract(buff1*fract(buff2*0.63))));
    buff2 = (buff2*fract(buff2*fract(buff1+buff2*fract(seed1*0.79))));
    buff1 = noise1(buff1, buff2);
    return(buff1 * 1.0038 - 0.00185);
}

//3 seeds
float noise2(float seed1,float seed2,float seed3){
    float buff1 = abs(seed1+100.81) + 1000.3;
    float buff2 = abs(seed2+100.45) + 1000.2;
    float buff3 = abs(noise1(seed1, seed2)+seed3) + 1000.1;
    buff1 = (buff3*fract(buff2*fract(buff1*fract(buff2*0.146))));
    buff2 = (buff2*fract(buff2*fract(buff1+buff2*fract(buff3*0.52))));
    buff1 = noise1(buff1, buff2);
    return(buff1);
}

//3 seeds hard
float noise3(float seed1,float seed2,float seed3){
    float buff1 = abs(seed1+100.813) + 1000.314;
    float buff2 = abs(seed2+100.453) + 1000.213;
    float buff3 = abs(noise1(buff2, buff1)+seed3) + 1000.17;
    buff1 = (buff3*fract(buff2*fract(buff1*fract(buff2*0.14619))));
    buff2 = (buff2*fract(buff2*fract(buff1+buff2*fract(buff3*0.5215))));
    buff1 = noise2(noise1(seed2,buff1), noise1(seed1,buff2), noise1(seed3,buff3));
    return(buff1);
}


// Remixed from shadertoy: https://www.shadertoy.com/view/XsKGzK
float jetNoise(vec2 xy) { return 0.7 * noise3(xy.x, xy.y, 0.003*time); }
float turbulentNoise(vec2 xy) { return 0.7 * snoise(vec3(xy, 0.3*time)); }
void main() {

    vec2 uv = gl_FragCoord.xy / resolution.xy;

    float pressure = texture(previous, uv).x;
    float pVel = texture(previous, uv).y;

    float up = texture(previous, uv + vec2(0, -1.0 / resolution.y)).r;
    float down = texture(previous, uv + vec2(0, 1.0 / resolution.y)).r;
    float left = texture(previous, uv + vec2(-1.0 / resolution.x, 0)).r;
    float right = texture(previous, uv + vec2(1.0 / resolution.x, 0)).r;

    // Circular fountain boundary
    if (length(uv - vec2(0.5,0.5)) > 0.49) {
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
    float jetsValue = texture(jets, vec2(uv.x, 1.0 - uv.y)).w;
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
        pressure += 1.0 - smoothstep(0.0, 0.005, distance(uv, mouse.xy));
    }

    //x = pressure. y = pressure velocity. Z and W = X and Y gradient
    outColor = vec4(pressure, pVel, (right - left) / 2.0, (up - down) / 2.0);

    //outColor = vec4(uv.xy, 1.0, 1.0);
    //outColor = vec4(texture(jets, uv).xyzw);
    //outColor = vec4(mouse.xyz, 0.5);
    //outColor = vec4(texture(previous, uv).r, texture(previous, uv).g, texture(previous, uv).b, dampening);
    //outColor = vec4(current, current, current, 1.0);
}

