import { useEffect, useRef } from "react";
import { Asset } from "expo-asset";
import { Platform, View } from "react-native";
import {
  ClampToEdgeWrapping,
  Color,
  DirectionalLight,
  LinearFilter,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Texture,
  TextureLoader,
  WebGLRenderer,
} from "three";

const SMOKE_TEXTURE_ASSET = require("../assets/smoke-element.png");
const SMOKE_TEXTURE_WIDTH = 377;
const SMOKE_TEXTURE_HEIGHT = 329;

interface SmokeParticleData {
  rotSpeed: number;
  baseScale: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  edgeFade: number;
}

interface SmokeBreathingProps {
  size?: number;
  fullScreen?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
}

type NativeSmokeResources = {
  renderer: WebGLRenderer;
  scene: Scene;
  particles: Mesh[];
  geometry?: PlaneGeometry;
  texture?: Texture;
};

function configureSmokeTexture(texture: Texture) {
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return texture;
}

function createNativeSmokeTexture(asset: Asset) {
  const uri = asset.localUri ?? asset.uri;
  const texture = new Texture({
    downloadAsync: () => Promise.resolve(asset),
    localUri: uri,
    uri,
    width: asset.width ?? SMOKE_TEXTURE_WIDTH,
    height: asset.height ?? SMOKE_TEXTURE_HEIGHT,
  });

  texture.name = "smoke-element";
  return configureSmokeTexture(texture);
}

function elapsedSeconds(startTime: number) {
  return ((globalThis.performance?.now?.() ?? Date.now()) - startTime) / 1000;
}

function SmokeBreathingWeb({ size = 280, fullScreen = false, primaryColor = "#F4B47F", secondaryColor = "#E9965F" }: SmokeBreathingProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = fullScreen ? window.innerWidth : size;
    const height = fullScreen ? window.innerHeight : size;

    const canvas = document.createElement("canvas");
    container.appendChild(canvas);

    const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    const scene = new Scene();
    const camera = new PerspectiveCamera(60, width / height, 1, 10000);
    camera.position.z = fullScreen ? 4500 : 2200;

    const light = new DirectionalLight(0xffffff, 0.6);
    light.position.set(-1, 0, 1);
    scene.add(light);

    const textureLoader = new TextureLoader();
    const smokeAsset = Asset.fromModule(SMOKE_TEXTURE_ASSET);
    const smokeTexture = configureSmokeTexture(textureLoader.load(smokeAsset.uri));
    const startTime = globalThis.performance?.now?.() ?? Date.now();

    const primary = new Color(primaryColor);
    const secondary = new Color(secondaryColor);

    const smokeGeo = new PlaneGeometry(fullScreen ? 500 : 300, fullScreen ? 500 : 300);
    const smokeParticles: Mesh[] = [];
    const particleData: SmokeParticleData[] = [];

    const count = fullScreen ? 800 : 400;
    const circleRadius = fullScreen ? Math.min(width, height) * 2.2 : 1200;
    const spreadZ = fullScreen ? 1000 : 600;

    for (let i = 0; i < count; i++) {
      const colorMix = Math.random();
      const particleColor = primary.clone().lerp(secondary, colorMix);

      const angle = Math.random() * Math.PI * 2;
      const radius = circleRadius * Math.sqrt(Math.random());
      const baseX = Math.cos(angle) * radius;
      const baseY = Math.sin(angle) * radius;
      const baseZ = (Math.random() - 0.5) * spreadZ;

      const distFromCenter = radius / circleRadius;
      const edgeFade = 1 - distFromCenter * distFromCenter;

      const material = new MeshLambertMaterial({
        color: particleColor,
        map: smokeTexture,
        transparent: true,
        opacity: (0.08 + Math.random() * 0.08) * edgeFade,
        depthWrite: false,
      });

      const particle = new Mesh(smokeGeo, material);

      particle.position.set(baseX, baseY, baseZ);
      particle.rotation.z = Math.random() * 360;

      const rotDir = Math.random() > 0.5 ? 1 : -1;
      const rotSpeed = (0.0002 + Math.random() * 0.001) * rotDir;
      const baseScale = 0.4 + Math.random() * 0.5;

      particle.scale.setScalar(baseScale);

      scene.add(particle);
      smokeParticles.push(particle);
      particleData.push({
        rotSpeed,
        baseScale,
        baseX,
        baseY,
        baseZ,
        edgeFade,
      });
    }

    const breathe = () => {
      const t = elapsedSeconds(startTime);
      const breathCycle = (Math.sin(t * 0.4) + 1) / 2;
      const breathFactor = 0.85 + breathCycle * 0.2;

      for (let i = 0; i < smokeParticles.length; i++) {
        const particle = smokeParticles[i];
        const data = particleData[i];

        particle.rotation.z += data.rotSpeed;

        particle.position.x = data.baseX * breathFactor + Math.sin(t * 0.1 + i * 0.5) * 8;
        particle.position.y = data.baseY * breathFactor + Math.cos(t * 0.08 + i * 0.3) * 8;
        particle.position.z = data.baseZ * breathFactor + Math.sin(t * 0.06 + i * 0.7) * 5;

        const mat = particle.material as MeshLambertMaterial;
        mat.opacity = data.edgeFade * (0.06 + breathCycle * 0.06);

        const scaleWobble = 1 + Math.sin(t * 0.08 + i * 0.2) * 0.02;
        particle.scale.setScalar(data.baseScale * breathFactor * scaleWobble);
      }
    };

    const render = () => {
      breathe();
      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(render);
    };

    frameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frameRef.current);
      renderer.dispose();
      container.removeChild(canvas);
      smokeParticles.forEach((p) => {
        if (Array.isArray(p.material)) {
          p.material.forEach((m) => m.dispose());
        } else {
          p.material.dispose();
        }
      });
      smokeGeo.dispose();
      smokeTexture.dispose();
    };
  }, [size, fullScreen, primaryColor, secondaryColor]);

  const containerStyle: React.CSSProperties = fullScreen
    ? { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }
    : { width: size, height: size, position: "relative" };

  return <div ref={containerRef} style={containerStyle} />;
}

function SmokeBreathingNative({ size = 280, fullScreen = false, primaryColor = "#F4B47F", secondaryColor = "#E9965F" }: SmokeBreathingProps) {
  const { GLView } = require("expo-gl");
  const glRef = useRef<any>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const frameRef = useRef<number>(0);
  const disposedRef = useRef(false);
  const resourcesRef = useRef<NativeSmokeResources | null>(null);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
      const resources = resourcesRef.current;
      resourcesRef.current = null;
      rendererRef.current = null;
      if (resources) {
        resources.particles.forEach((particle) => {
          if (Array.isArray(particle.material)) {
            particle.material.forEach((material) => material.dispose());
          } else {
            particle.material.dispose();
          }
          resources.scene.remove(particle);
        });
        resources.geometry?.dispose();
        resources.texture?.dispose();
        resources.scene.clear();
        resources.renderer.renderLists.dispose();
        resources.renderer.dispose();
      }
    };
  }, []);

  const onContextCreate = async (gl: any) => {
    if (disposedRef.current) return;
    const { drawingBufferWidth: width, drawingBufferHeight: height } = gl;

    const renderer = new WebGLRenderer({
      canvas: {
        width,
        height,
        style: {},
        addEventListener: () => {},
        removeEventListener: () => {},
        clientWidth: width,
        clientHeight: height,
      } as any,
      context: gl as any,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    const scene = new Scene();
    const resources: NativeSmokeResources = { renderer, scene, particles: [] };
    resourcesRef.current = resources;
    const camera = new PerspectiveCamera(60, width / height, 1, 10000);
    camera.position.z = fullScreen ? 4500 : 2200;

    const light = new DirectionalLight(0xffffff, 0.6);
    light.position.set(-1, 0, 1);
    scene.add(light);

    const startTime = globalThis.performance?.now?.() ?? Date.now();
    const smokeAsset = await Asset.fromModule(SMOKE_TEXTURE_ASSET).downloadAsync();
    if (disposedRef.current) {
      renderer.dispose();
      return;
    }
    const smokeTexture = createNativeSmokeTexture(smokeAsset);
    resources.texture = smokeTexture;

    const primary = new Color(primaryColor);
    const secondary = new Color(secondaryColor);

    const smokeGeo = new PlaneGeometry(fullScreen ? 500 : 300, fullScreen ? 500 : 300);
    resources.geometry = smokeGeo;
    const smokeParticles: Mesh[] = [];
    resources.particles = smokeParticles;
    const particleData: SmokeParticleData[] = [];

    const count = fullScreen ? 800 : 400;
    const circleRadius = fullScreen ? Math.min(width, height) * 2.2 : 1200;
    const spreadZ = fullScreen ? 1000 : 600;

    for (let i = 0; i < count; i++) {
      const colorMix = Math.random();
      const particleColor = primary.clone().lerp(secondary, colorMix);

      const angle = Math.random() * Math.PI * 2;
      const radius = circleRadius * Math.sqrt(Math.random());
      const baseX = Math.cos(angle) * radius;
      const baseY = Math.sin(angle) * radius;
      const baseZ = (Math.random() - 0.5) * spreadZ;

      const distFromCenter = radius / circleRadius;
      const edgeFade = 1 - distFromCenter * distFromCenter;

      const material = new MeshLambertMaterial({
        color: particleColor,
        map: smokeTexture,
        transparent: true,
        opacity: (0.08 + Math.random() * 0.08) * edgeFade,
        depthWrite: false,
      });

      const particle = new Mesh(smokeGeo, material);

      particle.position.set(baseX, baseY, baseZ);
      particle.rotation.z = Math.random() * 360;

      const rotDir = Math.random() > 0.5 ? 1 : -1;
      const rotSpeed = (0.0002 + Math.random() * 0.001) * rotDir;
      const baseScale = 0.4 + Math.random() * 0.5;

      particle.scale.setScalar(baseScale);

      scene.add(particle);
      smokeParticles.push(particle);
      particleData.push({
        rotSpeed,
        baseScale,
        baseX,
        baseY,
        baseZ,
        edgeFade,
      });
    }

    const breathe = () => {
      const t = elapsedSeconds(startTime);
      const breathCycle = (Math.sin(t * 0.4) + 1) / 2;
      const breathFactor = 0.85 + breathCycle * 0.2;

      for (let i = 0; i < smokeParticles.length; i++) {
        const particle = smokeParticles[i];
        const data = particleData[i];

        particle.rotation.z += data.rotSpeed;

        particle.position.x = data.baseX * breathFactor + Math.sin(t * 0.1 + i * 0.5) * 8;
        particle.position.y = data.baseY * breathFactor + Math.cos(t * 0.08 + i * 0.3) * 8;
        particle.position.z = data.baseZ * breathFactor + Math.sin(t * 0.06 + i * 0.7) * 5;

        const mat = particle.material as MeshLambertMaterial;
        mat.opacity = data.edgeFade * (0.06 + breathCycle * 0.06);

        const scaleWobble = 1 + Math.sin(t * 0.08 + i * 0.2) * 0.02;
        particle.scale.setScalar(data.baseScale * breathFactor * scaleWobble);
      }
    };

    const render = () => {
      if (disposedRef.current || resourcesRef.current !== resources) return;
      breathe();
      renderer.render(scene, camera);
      gl.endFrameEXP?.();
      if (!disposedRef.current && resourcesRef.current === resources) {
        frameRef.current = requestAnimationFrame(render);
      }
    };

    frameRef.current = requestAnimationFrame(render);
  };

  return (
    <View style={{ width: fullScreen ? "100%" : size, height: fullScreen ? "100%" : size, position: "absolute", top: 0, left: 0 }}>
      <GLView
        ref={glRef}
        style={{ flex: 1 }}
        onContextCreate={onContextCreate}
      />
    </View>
  );
}

export function SmokeBreathing(props: SmokeBreathingProps) {
  if (Platform.OS === "web") {
    return <SmokeBreathingWeb {...props} />;
  }
  return <SmokeBreathingNative {...props} />;
}
