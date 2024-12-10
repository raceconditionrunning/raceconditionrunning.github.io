#version 300 es

precision mediump float;
uniform float radius;
uniform float dampening;
uniform float interactionRadius;
uniform vec2 resolution;
uniform vec3 mouse;
uniform float time;
uniform float ripples;

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
    pos.y = time*speed;				// animate noise slice
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