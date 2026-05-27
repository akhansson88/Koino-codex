import { useCallback, useEffect, useRef } from "react";
import { Platform, View } from "react-native";

export function VoicePrayerCircle({ size = 320 }: { size?: number }) {
  if (Platform.OS === "web") {
    return <View style={{ height: size, width: size, borderRadius: size / 2, backgroundColor: "rgb(245, 154, 99)" }} />;
  }

  const { GLView } = require("expo-gl");
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onContextCreate = useCallback((gl: any) => {
    const vertexShaderSource = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragmentShaderSource = `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;
      varying vec2 v_uv;
      float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      float fbm(vec2 p) {
        float value = 0.0; float amplitude = 0.55; mat2 rotation = mat2(0.88, -0.48, 0.48, 0.88);
        for (int i = 0; i < 5; i++) { value += amplitude * noise(p); p = rotation * p * 1.82 + 9.37; amplitude *= 0.48; }
        return value;
      }
      mat2 rotate2d(float a) { float s = sin(a); float c = cos(a); return mat2(c, -s, s, c); }
      vec3 themePalette(float t) {
        vec3 deepCoral = vec3(0.67, 0.29, 0.20), roseClay = vec3(0.86, 0.42, 0.31), primary = vec3(0.961, 0.604, 0.388), peach = vec3(1.00, 0.73, 0.55), cream = vec3(0.99, 0.88, 0.75);
        vec3 color = mix(deepCoral, roseClay, smoothstep(0.00, 0.32, t));
        color = mix(color, primary, smoothstep(0.25, 0.60, t));
        color = mix(color, peach, smoothstep(0.52, 0.82, t));
        color = mix(color, cream, smoothstep(0.78, 1.00, t));
        return color;
      }
      void main() {
        vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
        float r = length(p); float t = u_time; vec3 background = vec3(0.980, 0.961, 0.933);
        float breath = 0.5 + 0.5 * sin(t * 1.15); float radius = 0.438 + 0.007 * sin(t * 1.15);
        float circle = 1.0 - smoothstep(radius, radius + 0.010, r); float edge = smoothstep(radius - 0.095, radius, r);
        vec2 driftA = vec2(0.060 * sin(t * 0.31), 0.052 * cos(t * 0.27)); vec2 driftB = vec2(0.055 * cos(t * 0.23), -0.066 * sin(t * 0.29));
        vec2 vortexA = p - driftA; vec2 vortexB = p - driftB; vec2 flow = rotate2d(0.15 * sin(t * 0.35)) * p;
        float largeCloud = fbm(flow * 1.05 + vec2(t * 0.025, -t * 0.018)); float slowTurn = 0.34 * sin(t * 0.22 + largeCloud * 2.6);
        flow = rotate2d(slowTurn) * flow; flow += vec2(-vortexA.y, vortexA.x) * (0.22 * (1.0 - smoothstep(0.10, 0.52, length(vortexA))));
        flow += vec2(vortexB.y, -vortexB.x) * (0.18 * (1.0 - smoothstep(0.12, 0.54, length(vortexB)))); flow += p * (0.030 * sin(t * 0.52 + largeCloud * 4.0));
        vec2 warp = vec2(fbm(flow * 1.55 + vec2(t * 0.030, -t * 0.020)), fbm(flow * 1.55 + vec2(5.7 - t * 0.025, 3.2 + t * 0.022))) - 0.5;
        vec2 softField = flow * 1.45 + warp * 1.25;
        float cloud1 = fbm(softField + vec2(t * 0.018, -t * 0.024)); float cloud2 = fbm(softField * 1.75 + warp * 0.85 + vec2(-t * 0.020, t * 0.016)); float cloud3 = fbm(softField * 2.55 - warp * 0.60 + vec2(t * 0.014, t * 0.012));
        float smoke = smoothstep(0.20, 0.90, cloud1 * 0.64 + cloud2 * 0.26 + cloud3 * 0.10);
        float diffuseCore = 1.0 - smoothstep(0.00, 0.36, r); float movingBloom = smoothstep(0.52, 0.95, cloud2 + cloud3 * 0.18); float softShadow = smoothstep(0.76, 0.24, cloud1 - cloud2 * 0.18 + r * 0.16);
        float tone = clamp(smoke + diffuseCore * 0.10 + movingBloom * 0.16, 0.0, 1.0);
        vec3 color = themePalette(tone); color = mix(color, vec3(0.62, 0.25, 0.18), softShadow * 0.15); color = mix(color, vec3(1.00, 0.89, 0.78), movingBloom * 0.30);
        color = mix(color, vec3(0.94, 0.50, 0.34), edge * 0.16); color *= 1.0 - edge * 0.030;
        color += vec3(0.961, 0.604, 0.388) * (0.025 + 0.025 * breath) * (1.0 - edge * 0.55);
        gl_FragColor = vec4(mix(background, color, circle), 1.0);
      }
    `;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failed");
      return shader;
    };

    const program = gl.createProgram();
    const vs = compile(gl.VERTEX_SHADER, vertexShaderSource);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentShaderSource);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const timeLocation = gl.getUniformLocation(program, "u_time");

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const startTime = Date.now();

    const render = () => {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(resolutionLocation, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(timeLocation, (Date.now() - startTime) * 0.001);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.endFrameEXP();
      rafRef.current = requestAnimationFrame(render);
    };

    render();
  }, []);

  return (
    <View style={{ alignSelf: "center", width: size, height: size, borderRadius: size / 2, overflow: "hidden" }}>
      <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
    </View>
  );
}
