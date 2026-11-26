// WebGL2 GLSL atmospheric Rayleigh/Mie sky dome and procedural horizon cloud layers.

export const SKY_VERT_SRC = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;

uniform mat4 uViewProjNoTrans;
out vec3 vDir;

void main() {
  vDir = aPosition;
  vec4 pos = uViewProjNoTrans * vec4(aPosition * 6000.0, 1.0);
  gl_Position = pos.xyww;
}
`;

export const SKY_FRAG_SRC = `#version 300 es
precision highp float;

in vec3 vDir;

uniform vec3 uSunDir;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uSunGlowColor;
uniform vec3 uCloudTint;
uniform float uTime;
uniform float uStormFactor;

out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm2(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * noise2(p);
    p *= 2.07;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 dir = normalize(vDir);
  vec3 sunDir = normalize(uSunDir);
  float y = clamp(dir.y, -0.25, 1.0);

  // Smooth horizon-to-zenith atmospheric gradient
  float hMix = pow(clamp(1.0 - max(y, 0.0), 0.0, 1.0), 2.4);
  vec3 sky = mix(uZenithColor, uHorizonColor, hMix);

  // Mie forward solar glow and crisp solar disc
  float sunCos = max(dot(dir, sunDir), 0.0);
  float mieGlow = pow(sunCos, 6.0) * 0.42 + pow(sunCos, 48.0) * 0.65;
  float sunDisc = smoothstep(0.9991, 0.9997, sunCos) * (1.0 - uStormFactor * 0.65);
  sky += uSunGlowColor * (mieGlow * (1.0 - uStormFactor * 0.45) + sunDisc * 2.2);

  // High-altitude sunlit cloud stratum projected onto upper sky plane
  if (dir.y > 0.025) {
    vec2 uv = dir.xz / (dir.y + 0.16) * 0.85 + vec2(uTime * 0.008, -uTime * 0.004);
    float c = fbm2(uv);
    float density = smoothstep(0.46 - uStormFactor * 0.14, 0.78, c) * smoothstep(0.025, 0.22, dir.y);
    float rim = pow(sunCos, 4.0) * 0.45;
    vec3 litCloud = uCloudTint + uSunGlowColor * rim;
    vec3 cloudShade = mix(litCloud, uZenithColor * 0.48, uStormFactor * 0.58 + (1.0 - c) * 0.25);
    sky = mix(sky, cloudShade, density * (0.68 + uStormFactor * 0.26));
  }

  // Soft horizon haze blend below sea horizon
  float below = smoothstep(0.02, -0.14, dir.y);
  sky = mix(sky, uHorizonColor * 0.72, below);

  outColor = vec4(sky, 1.0);
}
`;
