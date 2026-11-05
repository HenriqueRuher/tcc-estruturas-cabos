// Cena3D: renderizador WebGL2 sem dependências para a camada de fundo da vista 3D do Experimento.
// Desenha o ambiente esférico (panorama equiretangular "aterrado": esfera achatada no piso Z = 0),
// os modelos de lab_geom.js com PBR (GGX), luz do teto com sombra (shadow map + PCF) e iluminação
// difusa/especular tirada do próprio panorama. A projeção reproduz a do canvas 2D de experimento.js
// (yaw, pitch, D, F, centro), para os marcadores desenhados por cima casarem pixel a pixel.
// Unidades em mm, Z para cima.
//
// Observação: aberto por file://, o Chrome bloqueia texturas vindas de outros arquivos. Passe o
// panorama como data URI (ex.: um .js com window.LAB_AMBIENTE = 'data:image/jpeg;base64,...').
(() => {
'use strict';

// ---------------------------------------------------------------- matrizes (coluna-maior)
const M4 = {
  mul(a, b) {
    const r = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + l] * b[c * 4 + k]; r[c * 4 + l] = s;
    }
    return r;
  },
  id: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  ponto(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; },
  // inversa-transposta do bloco 3x3 (matriz normal), devolve mat3 coluna-maior
  normal(m) {
    const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C || 1;
    // inversa = adj/det; transposta da inversa = cofatores/det
    return new Float32Array([
      A / det, B / det, C / det,
      -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det,
      (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det,
    ]);
  },
};
const norm = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

// ---------------------------------------------------------------- shaders
const COMUM = `
const float PI = 3.14159265;
uniform float uAz0;
vec2 dirUV(vec3 d) {
  float phi = atan(d.y, d.x) - uAz0;
  float th = asin(clamp(d.z, -1.0, 1.0));
  return vec2(0.5 - phi / (2.0 * PI), 0.5 - th / PI);
}
vec3 lin3(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 srgb3(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
const vec2 POI[16] = vec2[16](
  vec2(-0.942, -0.399), vec2(0.946, -0.769), vec2(-0.094, -0.929), vec2(0.345, 0.294),
  vec2(-0.916, 0.458), vec2(-0.815, -0.879), vec2(-0.383, 0.277), vec2(0.975, 0.756),
  vec2(0.443, -0.975), vec2(0.537, -0.474), vec2(-0.265, -0.419), vec2(0.792, 0.191),
  vec2(-0.242, 0.997), vec2(-0.814, 0.914), vec2(0.200, 0.786), vec2(0.144, -0.141));
uniform highp sampler2DShadow uSombra;
uniform float uTemSombra, uSombraRaio, uSombraBias;
uniform mat4 uLuzVP;
float visLuz(vec3 P) {
  if (uTemSombra < 0.5) return 1.0;
  vec4 l = uLuzVP * vec4(P, 1.0);
  vec3 p = l.xyz / l.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  vec2 tx = vec2(1.0) / vec2(textureSize(uSombra, 0));
  // rotação por pixel do padrão de Poisson (tira o serrilhado em bandas)
  float a = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
  mat2 R = mat2(cos(a), sin(a), -sin(a), cos(a));
  float s = 0.0;
  for (int i = 0; i < 16; i++) s += texture(uSombra, vec3(p.xy + R * POI[i] * tx * uSombraRaio, p.z - uSombraBias));
  return s / 16.0;
}
`;

const PISO_GLSL = `
uniform float uTemPiso, uPisoLado, uTemMasc;
uniform sampler2D uPiso;
uniform sampler2D uMasc;
uniform vec3 uGanho, uChaoMedio;
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ruido(vec2 p) { // value noise suave
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}
// mistura lajota/foto no piso: m = 1 foto real, 0 lajota (máscara ou faixa fixa de θ)
vec3 misturaPiso(vec3 foto, vec3 dir, vec2 xy, vec2 uvT, vec2 gx, vec2 gy) {
  if (uTemPiso < 0.5) return foto;
  float m;
  if (uTemMasc > 0.5) m = textureGrad(uMasc, uvT, gx, gy).r;
  else { float th = degrees(asin(clamp(normalize(dir).z, -1.0, 1.0))); m = smoothstep(-34.0, -31.0, th) * (1.0 - smoothstep(28.0, 31.0, th)); }
  vec3 tp = lin3(texture(uPiso, xy / uPisoLado).rgb) * uGanho; // mesmo tom/brilho do piso fotografado
  float suj = 0.55 * ruido(xy / 2300.0) + 0.3 * ruido(xy / 830.0 + 17.0) + 0.15 * ruido(xy / 260.0 + 41.0);
  tp *= mix(0.86, 1.06, suj);
  return mix(srgb3(tp), foto, m);
}
`;

const VS_OBJ = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNor;
layout(location = 2) in vec2 aUV;
uniform mat4 uVP, uM;
uniform mat3 uN;
out vec3 vP, vN;
out vec2 vUV;
void main() {
  vec4 w = uM * vec4(aPos, 1.0);
  vP = w.xyz; vN = normalize(uN * aNor); vUV = aUV;
  gl_Position = uVP * w;
}`;

const FS_OBJ = `#version 300 es
precision highp float;
${COMUM}
in vec3 vP, vN;
uniform vec3 uEye, uCor, uEmis;
uniform float uMetal, uRug;
uniform vec3 uSH[9];
uniform sampler2D uEnv;
uniform float uEnvLod, uEnvInt, uExpo, uNormalBias;
uniform vec3 uLuzDir, uLuzCor, uLuz2Dir, uLuz2Cor;
out vec4 saida;
vec3 irradiancia(vec3 n) {
  return max(vec3(0.0),
    uSH[0] * 0.282095 +
    uSH[1] * 0.488603 * n.y + uSH[2] * 0.488603 * n.z + uSH[3] * 0.488603 * n.x +
    uSH[4] * 1.092548 * n.x * n.y + uSH[5] * 1.092548 * n.y * n.z +
    uSH[6] * 0.315392 * (3.0 * n.z * n.z - 1.0) +
    uSH[7] * 1.092548 * n.x * n.z + uSH[8] * 0.546274 * (n.x * n.x - n.y * n.y));
}
vec2 envBRDF(float r, float NoV) { // aproximação de Karis
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022), c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r4 = r * c0 + c1;
  float a004 = min(r4.x * r4.x, exp2(-9.28 * NoV)) * r4.x + r4.y;
  return vec2(-1.04, 1.04) * a004 + r4.zw;
}
vec3 direta(vec3 N, vec3 V, vec3 L, vec3 Li, vec3 alb, vec3 F0, float rug) {
  float NoL = dot(N, L);
  if (NoL <= 0.0) return vec3(0.0);
  vec3 H = normalize(V + L);
  float NoV = max(dot(N, V), 1e-3), NoH = max(dot(N, H), 0.0), VoH = max(dot(V, H), 0.0);
  float a = max(rug * rug, 2e-3), a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * d * d);
  float k = (rug + 1.0) * (rug + 1.0) / 8.0;
  float G = NoV / (NoV * (1.0 - k) + k) * NoL / (NoL * (1.0 - k) + k);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - VoH, 5.0);
  vec3 spec = D * G * F / (4.0 * NoV * NoL + 1e-4);
  vec3 kd = (1.0 - F) * (1.0 - uMetal);
  return (kd * alb / PI + spec) * Li * NoL;
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uEye - vP);
  if (dot(N, V) < 0.0) N = normalize(N - V * dot(N, V) * 1.01); // normal de costas (malhas abertas)
  vec3 cor = lin3(uCor);
  float rug = clamp(uRug, 0.04, 1.0);
  vec3 alb = cor * (1.0 - uMetal);
  vec3 F0 = mix(vec3(0.04), cor, uMetal);
  float vis = visLuz(vP + N * uNormalBias);
  vec3 c = direta(N, V, normalize(uLuzDir), uLuzCor * vis, cor, F0, rug)
         + direta(N, V, normalize(uLuz2Dir), uLuz2Cor, cor, F0, rug);
  // ambiente difuso (harmônicos esféricos do panorama); um pouco de oclusão pela sombra
  float NoV = max(dot(N, V), 1e-3);
  vec2 ab = envBRDF(rug, NoV);
  vec3 Fr = F0 * ab.x + ab.y;
  vec3 kd = (1.0 - Fr) * (1.0 - uMetal);
  float ao = mix(0.6, 1.0, vis);
  c += kd * alb * irradiancia(N) / PI * uEnvInt * ao;
  // ambiente especular: panorama num mip conforme a rugosidade
  vec3 R = reflect(-V, N);
  vec2 uv = dirUV(R);
  vec3 env = lin3(textureLod(uEnv, uv, rug * uEnvLod).rgb) * uEnvInt;
  float horiz = clamp(1.0 + 1.2 * dot(R, N), 0.0, 1.0); // oclusão do horizonte
  c += env * Fr * horiz * horiz * mix(0.5, 1.0, vis);
  c += lin3(uEmis) * 4.0;
  saida = vec4(srgb3(aces(c * uExpo)), 1.0);
}`;

// proxy projetado: geometria simples que recebe a cor do panorama pela direção (P − centro), como o fundo
// (sem luz nem tone mapping), só escurecida pela sombra dos modelos. Grava profundidade e tapa o que está atrás.
const FS_PROJ = `#version 300 es
precision highp float;
${COMUM}
in vec3 vP, vN;
uniform vec3 uC;
uniform sampler2D uEnv;
uniform float uSombraForca, uDepurar, uNormalBias;
${PISO_GLSL}
out vec4 saida;
void main() {
  vec3 dir = vP - uC;
  vec2 uv = dirUV(normalize(dir));
  float u2 = fract(uv.x + 0.5);
  vec2 gx = vec2(dFdx(uv.x), dFdx(uv.y)), gy = vec2(dFdy(uv.x), dFdy(uv.y));
  float gx2 = dFdx(u2), gy2 = dFdy(u2);
  if (abs(gx2) < abs(gx.x)) gx.x = gx2;
  if (abs(gy2) < abs(gy.x)) gy.x = gy2;
  vec2 uvT = vec2(fract(uv.x), uv.y);
  vec3 col = textureGrad(uEnv, uvT, gx, gy).rgb;
  // mesma mistura do piso do fundo: o ponto do piso na mesma direção a partir do centro de captura
  if (dir.z < 0.0) col = misturaPiso(col, dir, (uC + dir * (-uC.z / dir.z)).xy, uvT, gx, gy);
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  col *= mix(1.0 - uSombraForca, 1.0, visLuz(vP + N * uNormalBias));
  if (uDepurar > 0.5) {
    // depuração: véu laranja semitransparente + contorno nas arestas da malha (pelas derivadas da normal)
    float aresta = clamp(length(fwidth(N)) * 3.0, 0.0, 1.0);
    col = mix(col, vec3(1.0, 0.45, 0.1), 0.35 + 0.6 * aresta);
  }
  saida = vec4(col, 1.0);
}`;

// material assado: cor = textura em UV (iluminação já "assada" na foto), sem luz nem tone mapping,
// multiplicada pela sombra dos modelos e por um AO de contato opcional; realce mistura um pouco de luz direcional.
const FS_ASSADO = `#version 300 es
precision highp float;
${COMUM}
in vec3 vP, vN;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uSombraForca, uNormalBias, uRealce, uAO;
uniform vec3 uLuzDir;
out vec4 saida;
void main() {
  vec3 col = texture(uTex, vUV).rgb;
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  col *= mix(1.0 - uSombraForca, 1.0, visLuz(vP + N * uNormalBias));
  if (uAO > 0.0) col *= mix(1.0 - 0.25 * uAO, 1.0, clamp(smoothstep(0.0, 250.0, vP.z) + step(0.7, N.z), 0.0, 1.0)); // contato com o piso
  if (uRealce > 0.0) col *= mix(1.0, 0.72 + 0.45 * max(dot(N, normalize(uLuzDir)), 0.0), uRealce);
  saida = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const VS_TELA = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }`;

const FS_AMB = `#version 300 es
precision highp float;
${COMUM}
uniform vec3 uEye, uR, uU, uF, uC;
uniform vec2 uCentroPx;
uniform float uFpx, uRaio, uPisoR, uSombraForca;
uniform mat4 uVP;
uniform sampler2D uEnv;
${PISO_GLSL}
uniform float uSala, uFundo;
uniform vec3 uSalaMin, uSalaMax;
out vec4 saida;
void main() {
  vec2 q = (gl_FragCoord.xy - uCentroPx) / uFpx;
  vec3 d = normalize(uR * q.x + uU * q.y + uF);
  vec3 oc = uEye - uC;
  float b = dot(oc, d), c = dot(oc, oc) - uRaio * uRaio, h = b * b - c;
  float t = -1.0; bool piso = false;
  float fora;
  if (uFundo > 0.5) {
    fora = 0.0; // só o panorama por direção (céu/infinito), sem piso nem caixa
  } else if (uSala > 0.5) {
    // sala (caixa alinhada aos eixos): usa sempre o ponto de SAÍDA do raio. De dentro é a parede vista;
    // de fora isso descarta as faces voltadas para a câmera (casa de bonecas) e mostra o interior.
    vec3 inv = 1.0 / (d + vec3(equal(d, vec3(0.0))) * 1e-7);
    vec3 t0 = (uSalaMin - uEye) * inv, t1 = (uSalaMax - uEye) * inv;
    vec3 tn = min(t0, t1), tx = max(t0, t1);
    float tmin = max(max(tn.x, tn.y), tn.z), tmax = min(min(tx.x, tx.y), tx.z);
    bool dentroSala = all(greaterThanEqual(uEye, uSalaMin)) && all(lessThanEqual(uEye, uSalaMax));
    fora = dentroSala ? 0.0 : 1.0;
    if (tmax > 0.0 && tmin <= tmax) {
      t = tmax;
      piso = d.z < 0.0 && tx.z == tmax; // saiu pelo plano de baixo (Z = min = piso)
    }
  } else {
    fora = (c < 0.0 && uEye.z >= 0.0) ? 0.0 : 1.0;
    if (fora < 0.5) { // câmera dentro da esfera aterrada
      t = -b + sqrt(max(h, 0.0));
      if (d.z < 0.0) { float tf = -uEye.z / d.z; if (tf < t) { t = tf; piso = true; } }
    } else if (uEye.z > 0.0 && d.z < 0.0) { // de fora: só o disco do piso, o resto vira fundo infinito
      float tf = -uEye.z / d.z; vec3 P = uEye + d * tf;
      if (length(P.xy - uC.xy) <= uPisoR) { t = tf; piso = true; }
    }
  }
  vec3 P = uEye + d * max(t, 0.0);
  vec3 dir = t > 0.0 ? P - uC : d;
  // amostragem com gradiente contínuo na costura u = 0/1
  vec2 uv = dirUV(normalize(dir));
  float u2 = fract(uv.x + 0.5);
  vec2 gx = vec2(dFdx(uv.x), dFdx(uv.y)), gy = vec2(dFdy(uv.x), dFdy(uv.y));
  float gx2 = dFdx(u2), gy2 = dFdy(u2);
  if (abs(gx2) < abs(gx.x)) gx.x = gx2;
  if (abs(gy2) < abs(gy.x)) gy.x = gy2;
  vec2 uvT = vec2(fract(uv.x), uv.y);
  vec3 col = textureGrad(uEnv, uvT, gx, gy).rgb;
  // de fora: abaixo do horizonte, fora do disco do piso, usa a cor média do chão real (não repete o piso)
  vec3 chaoMedio = uChaoMedio;
  if (fora > 0.5 && t <= 0.0 && d.z < 0.0) col = mix(col, chaoMedio, smoothstep(0.0, 0.08, -d.z));
  if (piso) {
    // lajota sintética só onde a foto não alcança (perto do ponto de captura); perto das paredes, a foto real
    col = misturaPiso(col, dir, P.xy, uvT, gx, gy);
    col *= mix(1.0 - uSombraForca, 1.0, visLuz(P + vec3(0.0, 0.0, 1.0)));
    if (fora > 0.5 && uSala < 0.5) col = mix(col, chaoMedio, smoothstep(0.85, 1.0, length(P.xy - uC.xy) / uPisoR));
  }
  if (uSala > 0.5 && t > 0.0) {
    // oclusão barata e sutil nas arestas (contínua dos dois lados da quina: sem linha dura)
    vec3 dm = min(P - uSalaMin, uSalaMax - P);
    float ao = 1.0;
    for (int a = 0; a < 3; a++) if (dm[a] > 2.0) { float s = clamp(dm[a] / 900.0, 0.0, 1.0); ao *= mix(0.9, 1.0, s * s * (3.0 - 2.0 * s)); }
    col *= ao;
  }
  saida = vec4(col, 1.0);
  if (t > 0.0) { vec4 cl = uVP * vec4(P, 1.0); gl_FragDepth = clamp(cl.z / cl.w * 0.5 + 0.5, 0.0, 0.9999999); }
  else gl_FragDepth = 0.9999999;
}`;

const VS_SOMBRA = `#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 uLuzVP, uM;
void main() { gl_Position = uLuzVP * uM * vec4(aPos, 1.0); }`;
const FS_SOMBRA = `#version 300 es
precision mediump float;
void main() {}`;

function compilar(gl, vs, fs) {
  const sh = (tipo, src) => {
    const s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Cena3D shader: ' + gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Cena3D link: ' + gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i), nm = a.name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}

// harmônicos esféricos (ordem 2) de um equiretangular reduzido; já convoluídos para irradiância
function calcularSH(px, w, h, az0) {
  const sh = Array.from({ length: 9 }, () => [0, 0, 0]);
  let soma = 0;
  for (let j = 0; j < h; j++) {
    const v = (j + 0.5) / h, th = (0.5 - v) * Math.PI, ct = Math.cos(th), st = Math.sin(th);
    const dw = ct * (2 * Math.PI / w) * (Math.PI / h);
    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w, phi = (0.5 - u) * 2 * Math.PI + az0;
      const x = ct * Math.cos(phi), y = ct * Math.sin(phi), z = st;
      const k = (j * w + i) * 4, c = [lin(px[k] / 255), lin(px[k + 1] / 255), lin(px[k + 2] / 255)];
      const Y = [0.282095, 0.488603 * y, 0.488603 * z, 0.488603 * x, 1.092548 * x * y, 1.092548 * y * z,
        0.315392 * (3 * z * z - 1), 1.092548 * x * z, 0.546274 * (x * x - y * y)];
      for (let n = 0; n < 9; n++) for (let a = 0; a < 3; a++) sh[n][a] += c[a] * Y[n] * dw;
      soma += dw;
    }
  }
  const A = [Math.PI, 2 * Math.PI / 3, 2 * Math.PI / 3, 2 * Math.PI / 3, Math.PI / 4, Math.PI / 4, Math.PI / 4, Math.PI / 4, Math.PI / 4];
  const f = 4 * Math.PI / soma;
  const r = new Float32Array(27);
  for (let n = 0; n < 9; n++) for (let a = 0; a < 3; a++) r[n * 3 + a] = sh[n][a] * A[n] * f;
  return r;
}

function criar(canvas, op = {}) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (!gl) return null;
  let progObj, progAmb, progSombra, progProj, progAssado;
  try {
    progObj = compilar(gl, VS_OBJ, FS_OBJ);
    progAmb = compilar(gl, VS_TELA, FS_AMB);
    progSombra = compilar(gl, VS_SOMBRA, FS_SOMBRA);
    progProj = compilar(gl, VS_OBJ, FS_PROJ);
    progAssado = compilar(gl, VS_OBJ, FS_ASSADO);
  } catch (e) { console.error(e); return null; }
  const vaoVazio = gl.createVertexArray();

  // ------------------------------------------------ estado
  const E = {
    amb: { centro: [0, 0, 1500], raio: 6000, azimute0: 0, visivel: true, sala: null },
    luz: { dir: norm([0.25, 0.35, 1]), cor: [1, 0.97, 0.92], intensidade: 2.4 },
    luz2: { dir: norm([-0.6, -0.5, 0.35]), cor: [0.85, 0.9, 1], intensidade: 0.35 },
    expo: op.exposicao || 0.85, envInt: 1.0, sombraForca: 0.55,
    fundo: op.fundo || [0.93, 0.93, 0.93],
    sh: new Float32Array(27), envLod: 6,
    pisoLado: op.pisoLado || 300, temPiso: false, temMasc: false,
    ganho: [1, 1, 1], chaoMedio: [0.7, 0.7, 0.7], proxies: true, depurar: false,
    objs: new Map(), prox: 1, sombraSuja: true, temSombra: false, luzVP: M4.id(), sombraTexelMM: 1,
  };
  E.sh[0] = E.sh[1] = E.sh[2] = Math.PI * 3.5449 * 0.8; // ambiente cinza uniforme (radiância 0,8) até carregar

  // ------------------------------------------------ texturas
  const texEnv = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texEnv);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([200, 200, 200, 255, 200, 200, 200, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const texPiso = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texPiso);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([200, 200, 200, 255]));
  const texMasc = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texMasc);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

  // ganho por canal da lajota: cor média do piso REAL no panorama (m > 0,9, θ de −31° a −20°) / média da piso.jpg
  function calcularGanho() {
    if (!E.envPx) return;
    const w = 256, h = 128;
    const amostras = [];
    for (let j = 0; j < h; j++) {
      const th = (0.5 - (j + 0.5) / h) * 180;
      if (th < -31 || th > -20) continue;
      for (let i = 0; i < w; i++) {
        const k = (j * w + i) * 4;
        const m = E.mascPx ? E.mascPx[k] / 255 : 1; // sem máscara: a faixa fixa vale 1 nesse intervalo
        if (m <= 0.9) continue;
        const c = [lin(E.envPx[k] / 255), lin(E.envPx[k + 1] / 255), lin(E.envPx[k + 2] / 255)];
        if (c[0] + c[1] + c[2] < 0.03) continue; // buracos pretos de panorama incompleto
        amostras.push(c);
      }
    }
    if (amostras.length < 20) return;
    // a faixa tem muitos móveis e entulho (escuros): fica só com o piso claro, entre os percentis 80 e 98 de luminância
    amostras.sort((p, q) => (p[0] + p[1] + p[2]) - (q[0] + q[1] + q[2]));
    const sel = amostras.slice(Math.floor(amostras.length * 0.8), Math.ceil(amostras.length * 0.98));
    const med = [0, 1, 2].map((a) => sel.reduce((t, c) => t + c[a], 0) / sel.length);
    E.chaoMedio = med.map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
    if (E.pisoMed) E.ganho = med.map((v, a) => Math.min(3, Math.max(0.3, v / Math.max(1e-4, E.pisoMed[a]))));
  }

  const avisar = () => { if (typeof op.aoCarregar === 'function') op.aoCarregar(); };
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  function obterImagem(fonte, cb) {
    if (!fonte) return;
    if (typeof fonte !== 'string') { cb(fonte); return; }
    const im = new Image();
    if (!/^data:/.test(fonte) && location.protocol !== 'file:') im.crossOrigin = 'anonymous';
    im.onload = () => cb(im);
    im.onerror = () => console.warn('Cena3D: não carregou', fonte.slice(0, 80));
    im.src = fonte;
  }
  function reduzir(im, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, w, h); return { c, x };
  }
  function carregarAmbiente(fonte) {
    obterImagem(fonte, (im) => {
      try {
        let src = im, w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
        if (w > maxTex) { const s = maxTex / w; w = maxTex; h = Math.round(h * s); src = reduzir(im, w, h).c; }
        gl.bindTexture(gl.TEXTURE_2D, texEnv);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        const an = gl.getExtension('EXT_texture_filter_anisotropic');
        if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        E.envLod = Math.max(1, Math.log2(Math.max(w, h)) - 2.5);
      } catch (e) { console.warn('Cena3D: textura do ambiente bloqueada (use data URI se for file://)', e); return; }
      try {
        const { x } = reduzir(im, 128, 64);
        E.imgPx = x.getImageData(0, 0, 128, 64).data;
        E.sh = calcularSH(E.imgPx, 128, 64, E.amb.azimute0);
        E.envPx = reduzir(im, 256, 128).x.getImageData(0, 0, 256, 128).data;
        calcularGanho();
      } catch (e) { console.warn('Cena3D: sem leitura de pixels para a luz ambiente', e); }
      avisar();
    });
  }
  function carregarPiso(fonte) {
    obterImagem(fonte, (im) => {
      try {
        gl.bindTexture(gl.TEXTURE_2D, texPiso);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        const an = gl.getExtension('EXT_texture_filter_anisotropic');
        if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        E.temPiso = true;
      } catch (e) { console.warn('Cena3D: textura do piso bloqueada', e); return; }
      try {
        const px = reduzir(im, 64, 64).x.getImageData(0, 0, 64, 64).data, sm = [0, 0, 0];
        for (let k = 0; k < px.length; k += 4) for (let a = 0; a < 3; a++) sm[a] += lin(px[k + a] / 255);
        E.pisoMed = sm.map((v) => v / (px.length / 4));
        calcularGanho();
      } catch (e) { /* sem leitura de pixels: ganho 1 */ }
      avisar();
    });
  }
  // texturas de material (cache por URL); até carregar, cinza neutro
  const texCinza = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texCinza);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([180, 180, 180, 255]));
  const CACHE_TEX = new Map();
  function texturaMaterial(url) {
    if (CACHE_TEX.has(url)) return CACHE_TEX.get(url);
    const ent = { tex: texCinza };
    CACHE_TEX.set(url, ent);
    obterImagem(url, (im) => {
      try {
        let src = im, w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
        if (Math.max(w, h) > maxTex) { const k = maxTex / Math.max(w, h); src = reduzir(im, Math.round(w * k), Math.round(h * k)).c; }
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // v = 0 na linha de cima
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        const an = gl.getExtension('EXT_texture_filter_anisotropic');
        if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(16, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        ent.tex = t;
      } catch (e) { console.warn('Cena3D: textura de material bloqueada', String(url).slice(0, 80), e); return; }
      avisar();
    });
    return ent;
  }
  function carregarMascara(fonte) {
    obterImagem(fonte, (im) => {
      try {
        gl.bindTexture(gl.TEXTURE_2D, texMasc);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        E.temMasc = true;
      } catch (e) { console.warn('Cena3D: textura da máscara bloqueada', e); return; }
      try { E.mascPx = reduzir(im, 256, 128).x.getImageData(0, 0, 256, 128).data; calcularGanho(); } catch (e) { /* ignora */ }
      avisar();
    });
  }
  if (op.ambiente) carregarAmbiente(op.ambiente);
  if (op.mascara) carregarMascara(op.mascara);
  if (op.piso) carregarPiso(op.piso);

  // ------------------------------------------------ shadow map
  const TAM_SOMBRA = 2048;
  const texSombra = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texSombra);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, TAM_SOMBRA, TAM_SOMBRA);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const fbSombra = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbSombra);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texSombra, 0);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // ------------------------------------------------ objetos
  function subir(parte) {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const bufs = [];
    const attr = (loc, dados, n = 3) => {
      const b = gl.createBuffer(); bufs.push(b);
      gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, dados instanceof Float32Array ? dados : new Float32Array(dados), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
    };
    attr(0, parte.pos); attr(1, parte.nor);
    if (parte.uv) attr(2, parte.uv, 2);
    const bi = gl.createBuffer(); bufs.push(bi);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bi);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, parte.idx instanceof Uint32Array ? parte.idx : new Uint32Array(parte.idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const m = parte.material || {};
    const proj = !!m.projetado; // proxies não projetam sombra (já estão na foto)
    const assado = !!m.assado;  // idem para a sala com textura assada
    return { vao, bufs, n: parte.idx.length, cor: m.cor || [0.7, 0.7, 0.7], metal: m.metal || 0, rug: m.rug == null ? 0.5 : m.rug, emis: m.emissivo || [0, 0, 0],
      sombra: m.sombra !== false && !proj && !assado, proj, assado, tex: m.textura ? texturaMaterial(m.textura) : null,
      realce: m.realce || 0, ao: m.ao == null ? 0 : m.ao };
  }
  function caixaLocal(modelo) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of modelo.partes) for (let k = 0; k < p.pos.length; k += 3) for (let a = 0; a < 3; a++) { const v = p.pos[k + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
    return { mn, mx };
  }
  function definirMatriz(o, m) {
    o.M = new Float32Array(m || M4.id()); o.N = M4.normal(o.M);
    const { mn, mx } = o.caixa; o.cantos = [];
    if (!Number.isFinite(mn[0])) return;
    for (let i = 0; i < 8; i++) o.cantos.push(M4.ponto(o.M, [i & 1 ? mx[0] : mn[0], i & 2 ? mx[1] : mn[1], i & 4 ? mx[2] : mn[2]]));
  }

  // ------------------------------------------------ sombra: caixa ortográfica da luz em torno dos objetos visíveis
  function prepararSombra() {
    E.sombraSuja = false;
    const pts = [];
    const L = norm(E.luz.dir);
    for (const o of E.objs.values()) if (o.vis) for (const c of o.cantos) {
      pts.push(c);
      if (L[2] > 0.05) pts.push([c[0] - L[0] * c[2] / L[2], c[1] - L[1] * c[2] / L[2], 0]); // projeção no piso
    }
    E.temSombra = pts.length > 0;
    if (!E.temSombra) return;
    const up = Math.abs(L[2]) < 0.95 ? [0, 0, 1] : [1, 0, 0];
    const X = norm(cruz(up, L)), Y = cruz(L, X); // Z do olho da luz = L (olha para -L)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of pts) {
      const a = dot(p, X), b = dot(p, Y), c = dot(p, L);
      x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); z0 = Math.min(z0, c); z1 = Math.max(z1, c);
    }
    const mg = 0.03 * Math.max(x1 - x0, y1 - y0) + 20;
    x0 -= mg; x1 += mg; y0 -= mg; y1 += mg; z0 -= mg; z1 += mg;
    // view: linhas X, Y, L (olho em coordenadas: x=dot(p,X), y=dot(p,Y), z=dot(p,L))
    const V = new Float32Array([X[0], Y[0], L[0], 0, X[1], Y[1], L[1], 0, X[2], Y[2], L[2], 0, 0, 0, 0, 1]);
    // ortho: z_olho em [z0, z1] (z1 mais perto da luz) -> ndc z: z1 -> -1, z0 -> +1
    const sx = 2 / (x1 - x0), sy = 2 / (y1 - y0), sz = -2 / (z1 - z0);
    const P = new Float32Array([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, -(x1 + x0) / (x1 - x0), -(y1 + y0) / (y1 - y0), (z1 + z0) / (z1 - z0), 1]);
    E.luzVP = M4.mul(P, V);
    E.sombraTexelMM = Math.max(x1 - x0, y1 - y0) / TAM_SOMBRA;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbSombra);
    gl.viewport(0, 0, TAM_SOMBRA, TAM_SOMBRA);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2.0, 3.0);
    gl.useProgram(progSombra.p);
    gl.uniformMatrix4fv(progSombra.u.uLuzVP, false, E.luzVP);
    for (const o of E.objs.values()) {
      if (!o.vis) continue;
      gl.uniformMatrix4fv(progSombra.u.uM, false, o.M);
      for (const p of o.partes) { if (!p.sombra) continue; gl.bindVertexArray(p.vao); gl.drawElements(gl.TRIANGLES, p.n, gl.UNSIGNED_INT, 0); }
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function uniformsPiso(u) {
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texPiso); gl.uniform1i(u.uPiso, 1);
    gl.uniform1f(u.uTemPiso, E.temPiso ? 1 : 0);
    gl.uniform1f(u.uPisoLado, E.pisoLado);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, texMasc); gl.uniform1i(u.uMasc, 3);
    gl.uniform1f(u.uTemMasc, E.temMasc ? 1 : 0);
    gl.uniform3fv(u.uGanho, E.ganho);
    if (u.uChaoMedio) gl.uniform3fv(u.uChaoMedio, E.chaoMedio);
  }
  function uniformsSombra(u) {
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texSombra);
    gl.uniform1i(u.uSombra, 2);
    gl.uniform1f(u.uTemSombra, E.temSombra ? 1 : 0);
    gl.uniformMatrix4fv(u.uLuzVP, false, E.luzVP);
    // raio do PCF ~ 8 mm de penumbra (luminárias grandes = sombra macia), em texels
    gl.uniform1f(u.uSombraRaio, Math.max(1.0, 8 / E.sombraTexelMM));
    gl.uniform1f(u.uSombraBias, 0.0008);
  }

  // ------------------------------------------------ câmera igual à do canvas 2D
  function montarCamera(cam) {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const c = cam.c || cam.centro || [0, 0, 0], D = cam.D, F = cam.F, W = cam.W, H = cam.H;
    const r = [cy, -sy, 0], u = [sp * sy, sp * cy, cp], f = [cp * sy, cp * cy, -sp];
    const eye = [c[0] - D * f[0], c[1] - D * f[1], c[2] - D * f[2]];
    // view: X_e = r·(p−eye), Y_e = u·(p−eye), Z_e = −f·(p−eye)
    const V = new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0,
      -dot(r, eye), -dot(u, eye), dot(f, eye), 1]);
    const a = E.amb;
    const dc = Math.hypot(eye[0] - a.centro[0], eye[1] - a.centro[1], eye[2] - a.centro[2]);
    let far = Math.max(dc + a.raio * 1.05, 0);
    if (a.sala) {
      far = 0;
      for (let i = 0; i < 8; i++) {
        const p = [(i & 1 ? a.sala.max : a.sala.min)[0], (i & 2 ? a.sala.max : a.sala.min)[1], (i & 4 ? a.sala.max : a.sala.min)[2]];
        far = Math.max(far, Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]) * 1.05);
      }
    }
    for (const o of E.objs.values()) for (const p of o.cantos) far = Math.max(far, Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]) * 1.05);
    far = Math.max(far, 1000);
    const near = Math.max(2, Math.min(20, far / 4000));
    const P = new Float32Array([2 * F / W, 0, 0, 0, 0, 2 * F / H, 0, 0, 0, 0, -(far + near) / (far - near), -1, 0, 0, -2 * far * near / (far - near), 0]);
    return { VP: M4.mul(P, V), eye, r, u, f, F, W, H };
  }

  function ajustarTamanho(W, H, dpr) {
    const w = Math.max(1, Math.round(W * dpr)), h = Math.max(1, Math.round(H * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  // ------------------------------------------------ desenho
  function desenhar(cam) {
    if (gl.isContextLost()) return;
    const dpr = cam.DPR || window.devicePixelRatio || 1;
    ajustarTamanho(cam.W, cam.H, dpr);
    if (E.sombraSuja) prepararSombra();
    const C = montarCamera(cam);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(E.fundo[0], E.fundo[1], E.fundo[2], 1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    // ambiente (tela cheia, escreve profundidade da esfera/piso)
    if (E.amb.visivel) {
      const u = progAmb.u, a = E.amb;
      gl.useProgram(progAmb.p);
      gl.depthFunc(gl.ALWAYS);
      gl.uniform3fv(u.uEye, C.eye); gl.uniform3fv(u.uR, C.r); gl.uniform3fv(u.uU, C.u); gl.uniform3fv(u.uF, C.f);
      gl.uniform3fv(u.uC, a.centro);
      gl.uniform2f(u.uCentroPx, canvas.width / 2, canvas.height / 2);
      gl.uniform1f(u.uFpx, C.F * canvas.width / C.W);
      gl.uniform1f(u.uRaio, a.raio);
      gl.uniform1f(u.uPisoR, Math.sqrt(Math.max(0, a.raio * a.raio - a.centro[2] * a.centro[2])));
      gl.uniform1f(u.uAz0, a.azimute0);
      gl.uniform1f(u.uSombraForca, E.sombraForca);
      const sala = a.modo === 'fundo' ? null : a.sala;
      gl.uniform1f(u.uFundo, a.modo === 'fundo' ? 1 : 0);
      gl.uniform1f(u.uSala, sala ? 1 : 0);
      gl.uniform3fv(u.uSalaMin, sala ? sala.min : [0, 0, 0]);
      gl.uniform3fv(u.uSalaMax, sala ? sala.max : [1, 1, 1]);
      gl.uniformMatrix4fv(u.uVP, false, C.VP);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texEnv); gl.uniform1i(u.uEnv, 0);
      uniformsPiso(u);
      uniformsSombra(u);
      gl.bindVertexArray(vaoVazio);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // objetos
    const u = progObj.u;
    gl.useProgram(progObj.p);
    gl.depthFunc(gl.LEQUAL);
    gl.uniformMatrix4fv(u.uVP, false, C.VP);
    gl.uniform3fv(u.uEye, C.eye);
    gl.uniform3fv(u.uSH, E.sh);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texEnv); gl.uniform1i(u.uEnv, 0);
    gl.uniform1f(u.uEnvLod, E.envLod);
    gl.uniform1f(u.uEnvInt, E.envInt);
    gl.uniform1f(u.uExpo, E.expo);
    gl.uniform1f(u.uAz0, E.amb.azimute0);
    gl.uniform1f(u.uNormalBias, E.sombraTexelMM * 1.5);
    const li = E.luz, l2 = E.luz2;
    gl.uniform3fv(u.uLuzDir, norm(li.dir)); gl.uniform3fv(u.uLuzCor, li.cor.map((v) => v * li.intensidade));
    gl.uniform3fv(u.uLuz2Dir, norm(l2.dir)); gl.uniform3fv(u.uLuz2Cor, l2.cor.map((v) => v * l2.intensidade));
    uniformsSombra(u);
    for (const o of E.objs.values()) {
      if (!o.vis) continue;
      gl.uniformMatrix4fv(u.uM, false, o.M);
      gl.uniformMatrix3fv(u.uN, false, o.N);
      for (const p of o.partes) {
        if (p.proj || p.assado) continue;
        gl.uniform3fv(u.uCor, p.cor); gl.uniform3fv(u.uEmis, p.emis);
        gl.uniform1f(u.uMetal, p.metal); gl.uniform1f(u.uRug, p.rug);
        gl.bindVertexArray(p.vao);
        gl.drawElements(gl.TRIANGLES, p.n, gl.UNSIGNED_INT, 0);
      }
    }
    // sala assada: recuada na profundidade (polygon offset) para o L-frame e objetos no piso ganharem
    {
      const v = progAssado.u;
      let usou = false;
      for (const o of E.objs.values()) {
        if (!o.vis) continue;
        let tem = false;
        for (const p of o.partes) {
          if (!p.assado) continue;
          if (!usou) {
            gl.useProgram(progAssado.p);
            gl.uniformMatrix4fv(v.uVP, false, C.VP);
            gl.uniform1f(v.uSombraForca, E.sombraForca);
            gl.uniform1f(v.uNormalBias, E.sombraTexelMM * 1.5);
            gl.uniform3fv(v.uLuzDir, norm(E.luz.dir));
            uniformsSombra(v);
            gl.uniform1i(v.uTex, 0);
            gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.0, 4.0);
            // paredes, piso e teto têm a normal para dentro: vistos de fora somem (casa de bonecas)
            gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
            usou = true;
          }
          if (!tem) { gl.uniformMatrix4fv(v.uM, false, o.M); gl.uniformMatrix3fv(v.uN, false, o.N); tem = true; }
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, p.tex ? p.tex.tex : texCinza);
          gl.uniform1f(v.uRealce, p.realce); gl.uniform1f(v.uAO, p.ao);
          gl.bindVertexArray(p.vao);
          gl.drawElements(gl.TRIANGLES, p.n, gl.UNSIGNED_INT, 0);
        }
      }
      if (usou) { gl.disable(gl.POLYGON_OFFSET_FILL); gl.disable(gl.CULL_FACE); }
    }
    // proxies projetados
    if (E.proxies) {
      const v = progProj.u;
      gl.useProgram(progProj.p);
      gl.uniformMatrix4fv(v.uVP, false, C.VP);
      gl.uniform3fv(v.uC, E.amb.centro);
      gl.uniform1f(v.uAz0, E.amb.azimute0);
      gl.uniform1f(v.uSombraForca, E.sombraForca);
      gl.uniform1f(v.uDepurar, E.depurar ? 1 : 0);
      gl.uniform1f(v.uNormalBias, E.sombraTexelMM * 1.5);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texEnv); gl.uniform1i(v.uEnv, 0);
      uniformsSombra(v);
      uniformsPiso(v);
      for (const o of E.objs.values()) {
        if (!o.vis) continue;
        let tem = false;
        for (const p of o.partes) {
          if (!p.proj) continue;
          if (!tem) { gl.uniformMatrix4fv(v.uM, false, o.M); gl.uniformMatrix3fv(v.uN, false, o.N); tem = true; }
          gl.bindVertexArray(p.vao);
          gl.drawElements(gl.TRIANGLES, p.n, gl.UNSIGNED_INT, 0);
        }
      }
    }
    gl.bindVertexArray(null);
  }

  // ------------------------------------------------ API
  const cena = {
    gl, canvas,
    adicionar(modelo, matriz) {
      const id = E.prox++;
      const o = { partes: modelo.partes.map(subir), caixa: caixaLocal(modelo), vis: true };
      definirMatriz(o, matriz);
      E.objs.set(id, o); E.sombraSuja = true;
      return id;
    },
    remover(id) {
      const o = E.objs.get(id); if (!o) return;
      for (const p of o.partes) { gl.deleteVertexArray(p.vao); p.bufs.forEach((b) => gl.deleteBuffer(b)); }
      E.objs.delete(id); E.sombraSuja = true;
    },
    visivel(id, v) { const o = E.objs.get(id); if (o && o.vis !== !!v) { o.vis = !!v; E.sombraSuja = true; } },
    mover(id, matriz) { const o = E.objs.get(id); if (o) { definirMatriz(o, matriz); E.sombraSuja = true; } },
    ambiente(a = {}) {
      const az = E.amb.azimute0;
      if (a.centro) E.amb.centro = a.centro.slice();
      if (a.raio != null) E.amb.raio = a.raio;
      if (a.azimute0 != null) E.amb.azimute0 = a.azimute0;
      if (a.visivel != null) E.amb.visivel = !!a.visivel;
      if (a.modo !== undefined) E.amb.modo = a.modo || null; // 'fundo': só panorama por direção
      // sala: { min:[x0,y0,0], max:[x1,y1,z1] } (caixa alinhada aos eixos, mm) ou null para a esfera aterrada
      if (a.sala !== undefined) E.amb.sala = a.sala ? { min: a.sala.min.slice(), max: a.sala.max.slice() } : null;
      if (a.mascara) carregarMascara(a.mascara);
      if (a.url || a.imagem) carregarAmbiente(a.url || a.imagem);
      else if (E.imgPx && az !== E.amb.azimute0) E.sh = calcularSH(E.imgPx, 128, 64, E.amb.azimute0);
      return { ...E.amb };
    },
    piso(url, lado) { if (lado) E.pisoLado = lado; if (url) carregarPiso(url); else E.temPiso = false; },
    luz(l = {}) {
      if (l.dir) E.luz.dir = norm(l.dir);
      if (l.cor) E.luz.cor = l.cor.slice();
      if (l.intensidade != null) E.luz.intensidade = l.intensidade;
      if (l.preenchimento != null) E.luz2.intensidade = l.preenchimento;
      if (l.ambiente != null) E.envInt = l.ambiente;
      if (l.sombra != null) E.sombraForca = l.sombra;
      E.sombraSuja = true;
    },
    exposicao(x) { E.expo = x; },
    proxiesVisiveis(v) { E.proxies = !!v; },
    depurarProxies(v) { E.depurar = !!v; },
    fundo(c) { E.fundo = c.slice(); },
    desenhar,
    redimensionar() {
      const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      ajustarTamanho(r.width, r.height, dpr);
    },
    destruir() {
      for (const id of [...E.objs.keys()]) cena.remover(id);
      for (const e of CACHE_TEX.values()) if (e.tex !== texCinza) gl.deleteTexture(e.tex);
      [texEnv, texPiso, texMasc, texSombra, texCinza].forEach((t) => gl.deleteTexture(t));
      gl.deleteFramebuffer(fbSombra);
      [progObj, progAmb, progSombra, progProj, progAssado].forEach((p) => gl.deleteProgram(p.p));
      const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
    },
  };
  return cena;
}

window.Cena3D = { criar };
})();
