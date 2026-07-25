"use client";

import { useEffect, useRef } from "react";

/**
 * WebGL thermal blob: domain-warped fractal noise through a heatmap palette
 * (white → orange rim → violet → magenta cores) with film grain.
 * Freezes on prefers-reduced-motion; renders nothing if WebGL is unavailable.
 */

const VERT = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = rot * p * 2.0;
    a *= 0.5;
  }
  return v;
}

vec3 thermal(float d) {
  d = clamp(d, 0.0, 1.0);
  vec3 white   = vec3(1.0, 1.0, 1.0);
  vec3 orange  = vec3(1.0, 0.60, 0.20);
  vec3 violet  = vec3(0.42, 0.24, 0.95);
  vec3 purple  = vec3(0.60, 0.18, 0.96);
  vec3 magenta = vec3(1.0, 0.20, 0.80);

  vec3 col = white;
  col = mix(col, orange,  smoothstep(0.26, 0.40, d));
  col = mix(col, violet,  smoothstep(0.38, 0.54, d));
  col = mix(col, purple,  smoothstep(0.54, 0.72, d));
  col = mix(col, magenta, smoothstep(0.74, 0.96, d));
  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = uv;
  p.x *= aspect;

  float t = u_time * 0.05;

  vec2 ptr = u_pointer;
  ptr.x *= aspect;

  vec2 q = vec2(
    fbm(p * 1.5 + vec2(0.0, t)),
    fbm(p * 1.5 + vec2(5.2, 1.3 - t))
  );
  vec2 r = vec2(
    fbm(p * 1.8 + 2.6 * q + vec2(1.7 - t * 0.8, 9.2)),
    fbm(p * 1.8 + 2.6 * q + vec2(8.3, 2.8 + t * 0.7))
  );

  float field = fbm(p * 1.9 + 3.2 * r + t * 0.35);
  field = field * 0.5 + 0.5;

  float d = field + 0.22 * r.y + 0.10 * q.x;
  d += 0.16 * (uv.x - 0.4) + 0.12 * (uv.y - 0.45);
  d -= 0.12;

  float pd = distance(p, ptr);
  d += 0.10 * exp(-pd * 2.5);

  float cores = smoothstep(0.62, 0.9, fbm(p * 3.4 + r * 2.0 - t * 0.6) * 0.5 + 0.5);
  d += 0.16 * cores * smoothstep(0.4, 0.7, d);

  vec3 col = thermal(d);

  float glowR = thermal(d + 0.05).r;
  float glowB = thermal(d - 0.05).b;
  col.r = mix(col.r, glowR, 0.35);
  col.b = mix(col.b, glowB, 0.35);

  float inside = smoothstep(0.28, 0.5, d);
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.06 * inside;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("[verity] shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

interface GradientCanvasProps {
  className?: string;
}

export function GradientCanvas({ className }: GradientCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      antialias: true,
      premultipliedAlpha: false,
    });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("[verity] program link error:", gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "u_resolution");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uPointer = gl.getUniformLocation(program, "u_pointer");

    const pointer = { x: 0.7, y: 0.6, tx: 0.7, ty: 0.6 };
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.tx = (e.clientX - rect.left) / rect.width;
      pointer.ty = 1 - (e.clientY - rect.top) / rect.height;
    };
    window.addEventListener("pointermove", onPointer);

    let raf = 0;
    const start = performance.now();

    const render = (now: number) => {
      const time = reduceMotion ? 8 : (now - start) / 1000;

      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uPointer, pointer.x, pointer.y);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (!reduceMotion) raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className ?? "gradient-canvas"}
    />
  );
}
