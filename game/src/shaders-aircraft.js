// WebGL2 GLSL lit PBR-inspired solid shader and additive/emissive transparent pass shader.

export const SOLID_VERT_SRC = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;

uniform mat4 uModel;
uniform mat4 uViewProj;

out vec3 vWorldPos;
out vec3 vNormal;
out vec3 vColor;

void main() {
  vec4 wp = uModel * vec4(aPosition, 1.0);
  vWorldPos = wp.xyz;
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor;
  gl_Position = uViewProj * wp;
}
`;

export const SOLID_FRAG_SRC = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vColor;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunGlowColor;
uniform vec3 uHorizonColor;
uniform float uFogDensity;
uniform float uEmissive;
uniform vec3 uTint;
uniform float uAlpha;

out vec4 outColor;

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(uCamPos - vWorldPos);

  float ndotl = max(dot(N, L), 0.0);
  float hemi = 0.5 + 0.5 * N.y;
  vec3 amb = mix(vec3(0.18, 0.24, 0.34), uHorizonColor * 0.52, hemi);

  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 44.0) * 0.45;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.22;

  vec3 base = vColor * uTint;
  vec3 lit = base * (amb + uSunGlowColor * ndotl * 1.1) + uSunGlowColor * (spec + rim);
  lit += base * uEmissive;

  float dist = length(uCamPos - vWorldPos);
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 1.35));
  lit = mix(lit, uHorizonColor * 0.92, clamp(fog * (1.0 - min(uEmissive, 0.7)), 0.0, 0.95));

  outColor = vec4(lit, uAlpha);
}
`;
