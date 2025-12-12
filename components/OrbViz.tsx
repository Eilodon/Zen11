
import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface OrbProps {
  analyser: AnalyserNode | null;
  emotion: string;
  frequencyData?: Uint8Array;
}

const EMOTION_COLORS: Record<string, THREE.Color> = {
  anxious: new THREE.Color("#f97316"), // Orange Fire
  sad: new THREE.Color("#3b82f6"),     // Ocean Blue
  joyful: new THREE.Color("#eab308"),  // Sun Gold
  calm: new THREE.Color("#10b981"),    // Jade Green
  neutral: new THREE.Color("#a8a29e"), // Moon Stone
  seeking: new THREE.Color("#8b5cf6"), // Mystic Purple
  stressed: new THREE.Color("#ef4444"), // Red Alert
  confused: new THREE.Color("#14b8a6"), // Teal
  lonely: new THREE.Color("#6366f1"),   // Indigo
};

// --- Utils ---
// Simplex-like noise simulation using sin/cos superposition for liquid effect
// This is cheaper than Perlin noise but looks organic enough for a sphere
const liquidNoise = (x: number, y: number, z: number, t: number) => {
  return (
    Math.sin(x * 1.5 + t) * 0.5 +
    Math.sin(y * 1.5 + t * 1.2) * 0.5 +
    Math.sin(z * 1.5 + t * 0.8) * 0.5 +
    Math.sin((x + y + z) * 0.5 + t * 1.5) * 0.5
  );
};

// --- Components ---

const LiquidCore = ({ 
  emotion, 
  frequencyData, 
  detail, 
  isLowPower 
}: { 
  emotion: string, 
  frequencyData?: Uint8Array, 
  detail: number, 
  isLowPower: boolean 
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const coreMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  
  const targetColor = useRef(new THREE.Color(EMOTION_COLORS.neutral));
  const originalPositions = useRef<Float32Array | null>(null);

  useEffect(() => {
    const c = EMOTION_COLORS[emotion] || EMOTION_COLORS.neutral;
    targetColor.current.copy(c);
  }, [emotion]);

  // Capture original positions for vertex manipulation
  useEffect(() => {
    if (meshRef.current && meshRef.current.geometry) {
      const geo = meshRef.current.geometry;
      // Store original positions to calculate displacement from base shape
      originalPositions.current = geo.attributes.position.array.slice() as Float32Array;
    }
  }, [detail]);

  useFrame((state) => {
    if (!meshRef.current || !originalPositions.current) return;

    const time = state.clock.elapsedTime;
    const { geometry } = meshRef.current;
    const positionAttribute = geometry.attributes.position;
    
    // Audio Analysis
    let bass = 0;
    let mid = 0;
    let high = 0;

    if (frequencyData && frequencyData.length > 0) {
       // Analyze spectrum bands
       bass = frequencyData.slice(0, 4).reduce((a,b)=>a+b,0) / 4 / 255;
       mid = frequencyData.slice(4, 12).reduce((a,b)=>a+b,0) / 8 / 255;
       high = frequencyData.slice(12, 32).reduce((a,b)=>a+b,0) / 20 / 255;
    } else {
       // Idle breathing animation
       bass = Math.sin(time) * 0.1 + 0.1; 
    }

    // 1. Color Interpolation (Smooth transition)
    if (materialRef.current) {
       materialRef.current.color.lerp(targetColor.current, 0.05);
       materialRef.current.emissive.lerp(targetColor.current, 0.05);
       // Bass makes the core glow brighter
       materialRef.current.emissiveIntensity = THREE.MathUtils.lerp(materialRef.current.emissiveIntensity, 0.2 + bass * 0.5, 0.1);
    }
    if (coreMaterialRef.current) {
        coreMaterialRef.current.color.lerp(targetColor.current, 0.05);
        coreMaterialRef.current.emissive.lerp(targetColor.current, 0.05);
    }

    // 2. Rotation - Organic slow spin + reaction to mid frequencies
    meshRef.current.rotation.y -= 0.002 + (mid * 0.02);
    meshRef.current.rotation.z = Math.sin(time * 0.2) * 0.15;

    // 3. Vertex Displacement (The Liquid Effect)
    // Only run expensive vertex math if not low power
    if (!isLowPower && detail > 1) {
      const positions = positionAttribute.array as Float32Array;
      const originals = originalPositions.current;
      
      // Turbulence increases with high frequencies
      const noiseSpeed = 0.8 + high * 2.0;
      const noiseAmp = 0.3 + bass * 0.4; // Bass makes it swell

      for (let i = 0; i < positionAttribute.count; i++) {
        const ix = i * 3;
        const ox = originals[ix];
        const oy = originals[ix + 1];
        const oz = originals[ix + 2];

        // Normalize to get direction vector
        const len = Math.sqrt(ox*ox + oy*oy + oz*oz);
        const nx = ox/len; 
        const ny = oy/len; 
        const nz = oz/len;

        // Calculate noise displacement based on direction and time
        const distortion = liquidNoise(nx, ny, nz, time * noiseSpeed) * noiseAmp;
        
        // Apply breathing scale + noise
        const scale = 1 + distortion * 0.2;

        positions[ix] = ox * scale;
        positions[ix + 1] = oy * scale;
        positions[ix + 2] = oz * scale;
      }
      positionAttribute.needsUpdate = true;
      geometry.computeVertexNormals(); // Recompute lighting for correct refraction
    } else {
        // Simple scaling for low power mode
        const scale = 1 + bass * 0.1;
        meshRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group>
      {/* Outer Liquid Glass Shell */}
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1.5, detail]} />
        <meshPhysicalMaterial
          ref={materialRef}
          color={EMOTION_COLORS.neutral}
          emissive={EMOTION_COLORS.neutral}
          emissiveIntensity={0.2}
          roughness={0.15}   // Polished look
          metalness={0.1}    // Slight metallic shine
          transmission={0.95} // High transparency (Glass)
          thickness={1.5}    // Refraction depth
          ior={1.4}          // Index of refraction
          clearcoat={1.0}    // Extra shiny layer
          clearcoatRoughness={0.1}
          transparent={true}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Inner Glowing Core (The Soul) - Keeps the color strong inside the glass */}
      {!isLowPower && (
        <mesh scale={0.6}>
            <sphereGeometry args={[1, 32, 32]} />
            <meshStandardMaterial 
                ref={coreMaterialRef}
                color={EMOTION_COLORS.neutral}
                roughness={0.8}
                emissive={EMOTION_COLORS.neutral}
                emissiveIntensity={1.5} // Bright core
                toneMapped={false} // Bloom effect helper
            />
        </mesh>
      )}
    </group>
  );
};

const StarField = ({ count = 80, frequencyData }: { count?: number, frequencyData?: Uint8Array }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    
    // Random positions for particles
    const particles = useMemo(() => {
      const temp = [];
      for(let i=0; i<count; i++) {
         const t = Math.random() * 100;
         const factor = 20 + Math.random() * 100;
         const speed = 0.005 + Math.random() / 200;
         const xFactor = -50 + Math.random() * 100;
         const yFactor = -50 + Math.random() * 100;
         const zFactor = -50 + Math.random() * 100;
         temp.push({ t, factor, speed, xFactor, yFactor, zFactor });
      }
      return temp;
    }, [count]);
  
    useFrame((state) => {
      if(!meshRef.current) return;
      
      let energy = 0;
      if (frequencyData && frequencyData.length > 0) {
        // Use high freq for particle excitement
        energy = frequencyData.slice(10, 20).reduce((a,b)=>a+b,0) / 10 / 255;
      }
  
      particles.forEach((particle, i) => {
        let { factor, speed, xFactor, yFactor, zFactor } = particle;
        
        // Audio makes particles move faster
        particle.t += speed * (1 + energy * 8); 
        const t = particle.t;
        
        // Lissajous-like orbit paths
        const a = Math.cos(t) + Math.sin(t * 1) / 10;
        const b = Math.sin(t) + Math.cos(t * 2) / 10;
        const s = Math.cos(t);
        
        // Orbit radius expands with energy
        const r = 3 + (energy * 3); 
        
        dummy.position.set(
          (xFactor / 100) * a * r + Math.cos(t),
          (yFactor / 100) * b * r + Math.sin(t),
          (zFactor / 100) * b * r + Math.cos(t)
        );
        
        // Pulse size with audio
        const scale = (0.05 + Math.abs(Math.sin(t * 3)) * 0.05) * (1 + energy * 2);
        dummy.scale.setScalar(scale);
        dummy.rotation.set(s * 5, s * 5, s * 5);
        
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      meshRef.current.instanceMatrix.needsUpdate = true;
    });
  
    return (
      <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
      </instancedMesh>
    )
};

const BackgroundGlow = ({ emotion }: { emotion: string }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const targetColor = useRef(new THREE.Color(EMOTION_COLORS.neutral));

    useEffect(() => {
        const c = EMOTION_COLORS[emotion] || EMOTION_COLORS.neutral;
        targetColor.current.copy(c);
    }, [emotion]);

    useFrame(() => {
        if(meshRef.current) {
            (meshRef.current.material as THREE.MeshBasicMaterial).color.lerp(targetColor.current, 0.02);
            meshRef.current.rotation.z += 0.0005;
        }
    });

    return (
        <mesh ref={meshRef} position={[0, 0, -4]} scale={7}>
            <planeGeometry />
            <meshBasicMaterial 
                transparent 
                opacity={0.12} 
                map={useMemo(() => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 256; 
                    canvas.height = 256;
                    const context = canvas.getContext('2d')!;
                    const gradient = context.createRadialGradient(128,128, 0, 128,128, 128);
                    gradient.addColorStop(0, 'rgba(255,255,255,1)');
                    gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
                    gradient.addColorStop(1, 'rgba(255,255,255,0)');
                    context.fillStyle = gradient;
                    context.fillRect(0,0,256,256);
                    return new THREE.CanvasTexture(canvas);
                }, [])}
                color={EMOTION_COLORS.neutral}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
            />
        </mesh>
    );
};

// --- Performance Monitor to Auto-Scale Quality ---
const PerformanceMonitor = ({ onDowngrade }: { onDowngrade: () => void }) => {
  const { gl } = useThree();
  const frames = useRef(0);
  const prevTime = useRef(performance.now());
  const badFrames = useRef(0);

  useFrame(() => {
    frames.current++;
    const time = performance.now();
    
    if (time >= prevTime.current + 1000) {
      // Check FPS every second
      const fps = frames.current;
      if (fps < 24) badFrames.current++;
      else badFrames.current = 0;

      // If FPS is bad for 3 consecutive seconds, downgrade
      if (badFrames.current >= 3) {
        onDowngrade();
        badFrames.current = 0;
      }
      
      frames.current = 0;
      prevTime.current = time;
    }
  });
  return null;
};

// --- Main Export ---
export default function OrbViz({ analyser, emotion, frequencyData }: OrbProps) {
  // Detection for low-end devices
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const initialLowPower = typeof window !== 'undefined' && (window.navigator as any).deviceMemory && (window.navigator as any).deviceMemory < 4;
  
  const [isLowPower, setIsLowPower] = useState(initialLowPower);
  const [isVisible, setIsVisible] = useState(true);

  // Pause rendering when tab is inactive to save battery
  useEffect(() => {
    const handleVisibilityChange = () => setIsVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const handleDowngrade = () => {
    if (!isLowPower) {
      console.log("[OrbViz] Downgrading visual quality for performance");
      setIsLowPower(true);
    }
  };

  // High detail (24) creates a very smooth sphere, solving the "jagged" look.
  // Low detail (1) is an icosahedron (still stylish but low poly)
  const detailLevel = isLowPower ? 1 : (isMobile ? 12 : 24); 

  return (
    <div className="w-full h-full absolute inset-0 z-0 pointer-events-none fade-in">
      <Canvas 
        // DPR 2 eliminates aliasing on Retina screens
        dpr={isLowPower ? 1 : [1, 2]} 
        frameloop={isVisible ? 'always' : 'never'}
        camera={{ position: [0, 0, 5], fov: 45 }} // Narrower FOV for more cinematic look
        gl={{ 
          antialias: true, // Crucial for jagged edges
          powerPreference: 'high-performance',
          alpha: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2
        }}
      >
        <PerformanceMonitor onDowngrade={handleDowngrade} />
        
        {/* Cinematic Lighting */}
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#ffffff" />
        <pointLight position={[-10, -10, -5]} intensity={0.8} color="#ffd700" />
        <spotLight position={[0, 10, 0]} intensity={0.5} angle={0.5} penumbra={1} />

        {/* The Core */}
        <LiquidCore 
          emotion={emotion} 
          frequencyData={frequencyData} 
          detail={detailLevel} 
          isLowPower={isLowPower}
        />
        
        {/* Atmosphere */}
        {!isLowPower && <StarField count={50} frequencyData={frequencyData} />}
        <BackgroundGlow emotion={emotion} />
        
      </Canvas>
    </div>
  );
}
