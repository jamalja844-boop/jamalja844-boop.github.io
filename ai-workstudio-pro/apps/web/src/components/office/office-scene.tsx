"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { LiveData } from "@/components/dashboard/live-panel";

type Agent = LiveData["agents"][number] & { office_position?: { x?: number; z?: number } };

const STATUS_COLOR: Record<string, string> = {
  idle: "#6EBEEB",
  working: "#2DD4BF",
  waiting_approval: "#F6C05C",
  error: "#F2766D",
  disabled: "#475569",
};

const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Plaatsing: opgeslagen positie of automatisch raster per afdeling. */
function layout(agents: Agent[]): Map<string, [number, number, number]> {
  const map = new Map<string, [number, number, number]>();
  let auto = 0;
  for (const a of agents) {
    const p = a.office_position;
    if (p && typeof p.x === "number" && typeof p.z === "number") map.set(a.id, [p.x, 0, p.z]);
    else {
      const col = auto % 5;
      const row = Math.floor(auto / 5);
      map.set(a.id, [-8 + col * 4, 0, -6 + row * 4]);
      auto++;
    }
  }
  return map;
}

function Desk({ color, active }: { color: string; active: boolean }) {
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (!screen.current) return;
    const base = active ? 1.6 : 0.55;
    screen.current.emissiveIntensity = reduceMotion ? base : base + (active ? Math.sin(clock.elapsedTime * 9) * 0.35 : 0);
  });
  return (
    <group position={[0, 0, -0.9]}>
      <RoundedBox args={[1.9, 0.08, 0.9]} radius={0.03} position={[0, 0.72, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#12304f" metalness={0.3} roughness={0.5} />
      </RoundedBox>
      {[-0.85, 0.85].map((x) => (
        <mesh key={x} position={[x, 0.36, 0]} castShadow>
          <boxGeometry args={[0.06, 0.72, 0.8]} />
          <meshStandardMaterial color="#0b1f3a" />
        </mesh>
      ))}
      <mesh position={[0, 1.12, -0.25]} castShadow>
        <boxGeometry args={[1.1, 0.66, 0.05]} />
        <meshStandardMaterial color="#061327" />
      </mesh>
      <mesh position={[0, 1.12, -0.22]}>
        <planeGeometry args={[1.0, 0.56]} />
        <meshStandardMaterial ref={screen} color="#0b1f3a" emissive={color} emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, 0.82, -0.25]}>
        <boxGeometry args={[0.08, 0.2, 0.06]} />
        <meshStandardMaterial color="#173459" />
      </mesh>
    </group>
  );
}

function Robot({ agent, position, selected, onSelect }: { agent: Agent; position: [number, number, number]; selected: boolean; onSelect: (id: string) => void }) {
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const antenna = useRef<THREE.MeshStandardMaterial>(null);
  const [hover, setHover] = useState(false);
  const status = agent.status;
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.idle;
  const seed = useMemo(() => (agent.id.charCodeAt(0) + agent.id.charCodeAt(5)) / 30, [agent.id]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    if (!group.current || !head.current) return;
    if (reduceMotion) return;
    const working = status === "working";
    group.current.position.y = Math.sin(t * (working ? 6 : 1.6)) * (working ? 0.05 : 0.03);
    head.current.rotation.y = working ? Math.sin(t * 2.2) * 0.5 : Math.sin(t * 0.6) * 0.15;
    group.current.rotation.z = status === "error" ? 0.12 : 0;
    if (ring.current) {
      const s = 1 + (working || status === "waiting_approval" ? Math.sin(t * 4) * 0.08 : 0);
      ring.current.scale.set(s, s, s);
    }
    if (antenna.current) antenna.current.emissiveIntensity = status === "waiting_approval" ? 1.2 + Math.sin(t * 6) : working ? 2 : 0.9;
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(agent.id);
  };

  return (
    <group position={position}>
      <Desk color={color} active={status === "working"} />
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0.15]}>
        <ringGeometry args={[0.55, 0.68, 48]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 1 : 0.75} />
      </mesh>
      <group
        ref={group}
        position={[0, 0, 0.15]}
        onClick={click}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
      >
        <mesh position={[0, 0.55, 0]} castShadow>
          <capsuleGeometry args={[0.28, 0.42, 6, 16]} />
          <meshStandardMaterial color={agent.avatar_color} metalness={0.45} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.62, 0.25]}>
          <circleGeometry args={[0.1, 24]} />
          <meshStandardMaterial color="#061327" emissive={color} emissiveIntensity={0.9} />
        </mesh>
        <group ref={head} position={[0, 1.18, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.3, 32, 32]} />
            <meshStandardMaterial color="#e8f0fa" metalness={0.3} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.02, 0.2]}>
            <boxGeometry args={[0.36, 0.13, 0.16]} />
            <meshStandardMaterial color="#061327" emissive={color} emissiveIntensity={1.4} />
          </mesh>
          <mesh position={[0, 0.38, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.2]} />
            <meshStandardMaterial color="#8ea6c6" />
          </mesh>
          <mesh position={[0, 0.5, 0]}>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshStandardMaterial ref={antenna} color={color} emissive={color} emissiveIntensity={1} />
          </mesh>
        </group>
        {(hover || selected || status !== "idle") && (
          <Html position={[0, 2.05, 0]} center distanceFactor={14} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
            <div className="whitespace-nowrap rounded-lg border border-white/10 bg-[#061327]/90 px-2 py-1 text-center text-[11px] font-semibold text-white shadow-lg backdrop-blur">
              {agent.name}
              {status !== "idle" && <div className="text-[9.5px] font-medium" style={{ color }}>{status === "working" ? "aan het werk" : status === "waiting_approval" ? "wacht op goedkeuring" : status === "error" ? "fout" : status}</div>}
            </div>
          </Html>
        )}
      </group>
    </group>
  );
}

/** Bewegende datastroom tussen samenwerkende agents. */
function DataLink({ from, to, active }: { from: [number, number, number]; to: [number, number, number]; active: boolean }) {
  const pulses = useRef<THREE.Mesh[]>([]);
  const curve = useMemo(() => {
    const a = new THREE.Vector3(from[0], 1.6, from[2] + 0.15);
    const b = new THREE.Vector3(to[0], 1.6, to[2] + 0.15);
    const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 1.6 + a.distanceTo(b) * 0.12, 0));
    return new THREE.QuadraticBezierCurve3(a, mid, b);
  }, [from, to]);
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 40, active ? 0.025 : 0.012, 6, false), [curve, active]);
  useFrame(({ clock }) => {
    if (!active || reduceMotion) return;
    pulses.current.forEach((m, i) => {
      if (!m) return;
      const p = curve.getPoint(((clock.elapsedTime * 0.45) + i / 3) % 1);
      m.position.copy(p);
    });
  });
  return (
    <group>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={active ? "#2DD4BF" : "#1b3b64"} transparent opacity={active ? 0.55 : 0.35} />
      </mesh>
      {active && [0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => { if (m) pulses.current[i] = m; }}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshBasicMaterial color="#5EEAD4" />
        </mesh>
      ))}
    </group>
  );
}

function Floor() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#071a33" roughness={0.9} />
      </mesh>
      <gridHelper args={[60, 30, "#1d4f74", "#0f2e4f"]} position={[0, 0.005, 0]} />
    </group>
  );
}

export default function OfficeScene({ agents, links, selectedId, onSelect }: { agents: Agent[]; links: LiveData["links"]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const positions = useMemo(() => layout(agents), [agents]);
  const byKey = useMemo(() => new Map(agents.map((a) => [a.key, a])), [agents]);
  return (
    <Canvas
      shadows
      orthographic
      dpr={[1, 2]}
      camera={{ position: [22, 20, 22], zoom: 44, near: -100, far: 200 }}
      onPointerMissed={() => onSelect(null)}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#061327"]} />
      <fog attach="fog" args={["#061327", 40, 90]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[10, 18, 8]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[0, 6, 0]} intensity={30} color="#2DD4BF" distance={30} />
      <pointLight position={[-12, 5, -10]} intensity={20} color="#6EBEEB" distance={28} />
      <Floor />
      {agents.map((a) => (
        <Robot key={a.id} agent={a} position={positions.get(a.id)!} selected={a.id === selectedId} onSelect={onSelect} />
      ))}
      {links.map((l, i) => {
        const from = byKey.get(l.from_key);
        const to = byKey.get(l.to_key);
        if (!from || !to) return null;
        return <DataLink key={`${l.from_key}-${l.to_key}-${i}`} from={positions.get(from.id)!} to={positions.get(to.id)!} active={l.active} />;
      })}
      <OrbitControls enableRotate={false} enableDamping minZoom={14} maxZoom={90} screenSpacePanning />
    </Canvas>
  );
}
