#version 300 es

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
