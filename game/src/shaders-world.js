// WebGL2 GLSL shaders for fractal archipelago terrain and animated Fresnel ocean water.

export const TERRAIN_VERT_SRC = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

uniform mat4 uViewProj;

out vec3 vWorldPos;
out vec3 vNormal;

void main() {
  vWorldPos = aPosition;
  vNormal = aNormal;
  gl_Position = uViewProj * vec4(aPosition, 1.0);
}
`;

export const TERRAIN_FRAG_SRC = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunGlowColor;
uniform vec3 uHorizonColor;
uniform float uFogDensity;
uniform float uStormFactor;

out vec4 outColor;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(uCamPos - vWorldPos);

  float h = vWorldPos.y;
  float slope = 1.0 - clamp(N.y, 0.0, 1.0);
  float grain = noise2(vWorldPos.xz * 0.038) * 0.14 + noise2(vWorldPos.xz * 0.16) * 0.07;

  // Biome elevation & slope palette
  vec3 sandCol = vec3(0.76, 0.69, 0.54);
  vec3 meadowCol = vec3(0.18, 0.36, 0.21);
  vec3 forestCol = vec3(0.09, 0.23, 0.14);
  vec3 rockCol = vec3(0.36, 0.35, 0.38) + sin(h * 0.14) * 0.035;
  vec3 snowCol = vec3(0.92, 0.95, 0.99);

  vec3 base = mix(sandCol, meadowCol, smoothstep(2.0, 18.0, h));
  base = mix(base, forestCol, smoothstep(45.0, 190.0, h + grain * 60.0));
  base = mix(base, rockCol, smoothstep(0.16, 0.38, slope) + smoothstep(320.0, 520.0, h) * 0.55);

  float snowMask = smoothstep(370.0, 510.0, h + grain * 110.0) * (1.0 - smoothstep(0.34, 0.62, slope));
  base = mix(base, snowCol, clamp(snowMask, 0.0, 1.0));
  base *= (0.9 + grain);

  float ndotl = max(dot(N, L), 0.0);
  float hemi = 0.5 + 0.5 * N.y;
  vec3 skyAmb = mix(vec3(0.26, 0.34, 0.45), uHorizonColor * 0.55, hemi * 0.65);
  vec3 direct = uSunGlowColor * ndotl * (1.12 - uStormFactor * 0.28);
  vec3 lit = base * (skyAmb + direct);

  // Subtle snow & wet sand specular sheen
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 28.0) * mix(0.04, 0.24, snowMask);
  lit += uSunGlowColor * spec;

  float dist = length(uCamPos - vWorldPos);
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 1.35));
  lit = mix(lit, uHorizonColor * 0.92, clamp(fog, 0.0, 0.96));

  outColor = vec4(lit, 1.0);
}
`;

export const OCEAN_VERT_SRC = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;

uniform mat4 uViewProj;

out vec3 vWorldPos;

void main() {
  vWorldPos = aPosition;
  gl_Position = uViewProj * vec4(aPosition, 1.0);
}
`;

export const OCEAN_FRAG_SRC = `#version 300 es
precision highp float;

in vec3 vWorldPos;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunGlowColor;
uniform vec3 uHorizonColor;
uniform vec3 uZenithColor;
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform float uFogDensity;
uniform float uTime;

out vec4 outColor;

void main() {
  vec2 p = vWorldPos.xz;
  // Multi-directional wave normal perturbation
  float w1 = sin(p.x * 0.055 + uTime * 1.45) * cos(p.y * 0.048 - uTime * 1.1);
  float w2 = sin(p.x * 0.13 - p.y * 0.09 + uTime * 2.1);
  float w3 = cos(p.x * 0.26 + p.y * 0.22 - uTime * 2.7);
  vec3 N = normalize(vec3((w1 * 0.045 + w2 * 0.025 + w3 * 0.015), 1.0, (w2 * 0.04 + w3 * 0.02)));

  vec3 V = normalize(uCamPos - vWorldPos);
  vec3 L = normalize(uSunDir);

  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.2);
  float coastal = 0.5 + 0.5 * sin(p.x * 0.0012 + p.y * 0.0011);
  vec3 waterBase = mix(uWaterDeep, uWaterShallow, coastal * 0.38);

  vec3 skyRefl = mix(uHorizonColor, uZenithColor, 0.35);
  vec3 color = mix(waterBase, skyRefl, clamp(fresnel * 0.85, 0.08, 0.88));

  vec3 H = normalize(L + V);
  float sunSpec = pow(max(dot(N, H), 0.0), 140.0) * 1.55;
  float broadSheen = pow(max(dot(N, H), 0.0), 18.0) * 0.22;
  color += uSunGlowColor * (sunSpec + broadSheen);

  float dist = length(uCamPos - vWorldPos);
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 1.35));
  color = mix(color, uHorizonColor * 0.92, clamp(fog, 0.0, 0.98));

  outColor = vec4(color, 1.0);
}
`;
