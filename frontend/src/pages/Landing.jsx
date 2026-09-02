import { useEffect, useRef, useState } from 'react';
import { ReactLenis } from 'lenis/react';
import { NeuralMesh } from '../components/NeuralMesh';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Canvas, useFrame } from '@react-three/fiber';
import { QRCodeSVG } from 'qrcode.react';
import * as THREE from 'three';
import { Float, Sparkles } from '@react-three/drei';

gsap.registerPlugin(ScrollTrigger);

// STEP 1: Highly Interactive 3D Core
function NetworkNode() {
  const meshRef = useRef();
  const outerRef = useRef();
  const originalPositions = useRef();
  
  useEffect(() => {
    if (meshRef.current) {
      originalPositions.current = meshRef.current.geometry.attributes.position.array.slice();
    }
  }, []);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    
    // Smooth camera parallax
    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, state.pointer.x * 2.0, 0.05);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, state.pointer.y * 2.0, 0.05);
    state.camera.lookAt(0, 0, 0);
    
    if (meshRef.current) {
      // Base rotation of the Torus Knot
      meshRef.current.rotation.x = time * 0.15;
      meshRef.current.rotation.y = time * 0.2;
      
      const positions = meshRef.current.geometry.attributes.position.array;
      const orig = originalPositions.current;
      
      if (orig) {
        state.raycaster.setFromCamera(state.pointer, state.camera);
        const point = new THREE.Vector3();
        state.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), point);
        meshRef.current.worldToLocal(point);
        
        const px = point.x;
        const py = point.y;
        const pz = point.z;
        const maxDist = 2.0; // Radius of interaction sphere
        
        for (let i = 0; i < positions.length; i += 3) {
          const ox = orig[i];
          const oy = orig[i+1];
          const oz = orig[i+2];
          
          const dx = ox - px;
          const dy = oy - py;
          const dz = oz - pz;
          const distSq = dx*dx + dy*dy + dz*dz;
          
          let pushX = 0, pushY = 0, pushZ = 0;
          
          // Neutralized, soft magnetic nudge
          if (distSq < maxDist * maxDist) {
            const dist = Math.sqrt(distSq);
            // Linear, gentle force instead of aggressive cubic bounce
            const force = (maxDist - dist) / maxDist;
            const pushFactor = force * 0.15; // Drastically reduced multiplier for subtlety
            if (dist > 0.001) {
              pushX = (dx / dist) * pushFactor;
              pushY = (dy / dist) * pushFactor;
              pushZ = (dz / dist) * pushFactor;
            }
          }
          
          // Organic breathing/noise animation
          const noise = Math.sin(time * 2.5 + ox * 4 + oy * 4) * 0.015;
          
          positions[i] = ox + pushX + noise;
          positions[i+1] = oy + pushY + noise;
          positions[i+2] = oz + pushZ + noise;
        }
        meshRef.current.geometry.attributes.position.needsUpdate = true;
      }
    }
    
    // Outer wireframe sphere physics
    if (outerRef.current) {
      outerRef.current.rotation.x = time * -0.05;
      outerRef.current.rotation.y = time * -0.08;
      // Pulse outwards when mouse is far from center
      const targetScale = 1 + (Math.abs(state.pointer.x) + Math.abs(state.pointer.y)) * 0.15;
      outerRef.current.scale.setScalar(THREE.MathUtils.lerp(outerRef.current.scale.x, targetScale, 0.05));
    }
  });
  
  return (
    <group scale={1.5}>
      <Float speed={2.5} rotationIntensity={0.2} floatIntensity={0.8}>
        <points ref={meshRef}>
          {/* Reduced vertex count by 50% for massive CPU performance boost */}
          <torusKnotGeometry args={[1.3, 0.4, 150, 32]} />
          <pointsMaterial 
            color="#8052ff" 
            size={0.035} 
            transparent 
            opacity={0.85} 
            sizeAttenuation={true} 
            blending={THREE.AdditiveBlending} 
            depthWrite={false} 
          />
        </points>
        {/* Golden Sparkles for contrast */}
        <Sparkles count={350} scale={4.5} size={2.5} color="#ffb829" speed={0.5} opacity={0.5} />
        {/* Outer subtle containment sphere for depth */}
        <mesh ref={outerRef}>
           <sphereGeometry args={[2.8, 24, 24]} />
           <meshBasicMaterial 
             color="#8052ff" 
             wireframe={true} 
             transparent 
             opacity={0.03} 
             blending={THREE.AdditiveBlending} 
             depthWrite={false} 
           />
        </mesh>
      </Float>
    </group>
  );
}

export default function Landing() {
  const containerRef = useRef();
  const lenisRef = useRef();
  const [isLowPower, setIsLowPower] = useState(false);

  useEffect(() => {
    const checkLowPower = () => {
      setIsLowPower(window.innerWidth < 768 || window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    };
    checkLowPower();
    window.addEventListener('resize', checkLowPower);
    return () => window.removeEventListener('resize', checkLowPower);
  }, []);

  useEffect(() => {
    const updateLenis = (time) => {
      const lenis = lenisRef.current?.lenis;
      if (lenis) lenis.raf(time * 1000);
    };
    gsap.ticker.add(updateLenis);
    gsap.ticker.lagSmoothing(0);

    const updateScrollTrigger = () => { ScrollTrigger.update(); };
    const lenis = lenisRef.current?.lenis;
    if (lenis) lenis.on('scroll', updateScrollTrigger);

    let ctx = gsap.context(() => {
      // 1. Initial Load Animation for Hero Content
      gsap.fromTo('.hero-fade-in',
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 1, stagger: 0.2, ease: "power3.out", delay: 0.2 }
      );

      // 2. Hero Scrub Transition (Top to Bottom Parallax Exit)
      const heroTl = gsap.timeline({
        scrollTrigger: {
          trigger: '.hero-section',
          start: 'top top',
          end: 'bottom top',
          scrub: 1
        }
      });
      heroTl.to('.hero-content', { y: -150, opacity: 0, ease: 'none' }, 0);
      heroTl.to('.hero-canvas', { y: 250, opacity: 0, scale: 0.9, ease: 'none' }, 0);

      // 1. Scroll Spine Animation
      gsap.to('.scroll-spine-fill', {
        height: '100%',
        ease: 'none',
        scrollTrigger: {
          trigger: '.main-content',
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.5
        }
      });

      // 2. Section Reveals with Staggering for Bidirectional Visibility
      const sections = gsap.utils.toArray('.reveal-section');
      sections.forEach(sec => {
        const items = sec.querySelectorAll('.reveal-item');
        if (items.length > 0) {
          gsap.fromTo(items, 
            { opacity: 0, y: 50 },
            { 
              opacity: 1, 
              y: 0, 
              duration: 1, 
              stagger: 0.15,
              ease: 'power3.out',
              scrollTrigger: {
                trigger: sec,
                start: 'top 80%',
                // play on scroll down, reverse when scrolling back up past the trigger
                toggleActions: 'play none none reverse'
              }
            }
          );
        } else {
          gsap.fromTo(sec, 
            { opacity: 0, y: 50 },
            { 
              opacity: 1, 
              y: 0, 
              duration: 1, 
              ease: 'power3.out',
              scrollTrigger: {
                trigger: sec,
                start: 'top 80%',
                toggleActions: 'play none none reverse'
              }
            }
          );
        }
      });

      // 3. Fake Bounding Boxes drawing
      if (!isLowPower) {
        gsap.to('.dom-box', {
          strokeDashoffset: 0,
          stagger: 0.2,
          ease: 'power2.inOut',
          scrollTrigger: {
            trigger: '.vision-section',
            start: 'top 60%',
            end: 'center center',
            scrub: 1 // Ties drawing animation strictly to scroll position both ways
          }
        });
      }
    }, containerRef);

    return () => {
      ctx.revert();
      if (lenis) lenis.off('scroll', updateScrollTrigger);
      gsap.ticker.remove(updateLenis);
    };
  }, [isLowPower]);

  return (
    <ReactLenis root ref={lenisRef} autoRaf={false} options={{ syncTouch: true, smoothTouch: true }}>
      <div ref={containerRef} className="bg-[#030303] min-h-screen text-white font-sans overflow-hidden selection:bg-[#8052ff]/30 relative">
        
        {/* Global Vast Background */}
        <div className="fixed inset-0 z-0 pointer-events-none opacity-40 mix-blend-screen" style={{ maskImage: 'linear-gradient(to bottom, black 20%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 20%, transparent 100%)' }}>
          <NeuralMesh />
        </div>

        <div className="main-content relative z-10 max-w-[1600px] mx-auto">
          {/* Central Scroll Spine */}
          <div className="absolute left-6 md:left-24 top-0 bottom-0 w-[1px] bg-white/5 z-0 hidden md:block">
             <div className="scroll-spine-fill w-full bg-gradient-to-b from-[#8052ff] via-[#15846e] to-[#ffb829] shadow-[0_0_20px_rgba(128,82,255,0.8)] h-0 relative">
               <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#ffb829] shadow-[0_0_15px_#ffb829]" />
             </div>
          </div>

          {/* --- SECTION 1: ASYMMETRICAL HERO --- */}
          <section className="hero-section relative h-[100svh] w-full flex items-center justify-center md:pl-32 px-6">
             <div className="hero-canvas absolute inset-0 z-0 opacity-90 pointer-events-auto">
               {!isLowPower ? (
                 <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
                    <NetworkNode />
                 </Canvas>
               ) : (
                 <div className="w-full h-full flex items-center justify-center opacity-40">
                    <svg width="300" height="300" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="#8052ff" strokeWidth="1" strokeDasharray="4 4" />
                      <circle cx="50" cy="50" r="25" fill="none" stroke="#8052ff" strokeWidth="0.5" strokeDasharray="2 2" />
                      <circle cx="50" cy="50" r="4" fill="#8052ff" />
                    </svg>
                 </div>
               )}
             </div>
             
             <div className="hero-content relative z-10 w-full flex flex-col items-start pointer-events-none -mt-20">
                <div 
                   className="hero-fade-in inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-8 opacity-0"
                >
                   <div className="w-2 h-2 rounded-full bg-[#15846e] animate-pulse shadow-[0_0_10px_#15846e]" />
                   <span className="text-xs font-mono text-zinc-300 tracking-wider">SYSTEM ONLINE</span>
                </div>
                
                <h1 
                   className="hero-fade-in text-6xl md:text-8xl lg:text-[110px] font-black tracking-tighter leading-[0.9] mb-8 mix-blend-plus-lighter opacity-0"
                >
                  Meet <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#8052ff] to-[#ffb829]">SETU</span>.<br/>Your Agentic<br/>Workstation.
                </h1>
                
                <p 
                   className="hero-fade-in text-lg md:text-2xl text-zinc-400 max-w-2xl font-light leading-relaxed mb-12 border-l-2 border-[#8052ff]/50 pl-6 opacity-0"
                >
                  A local operating system that visually perceives the web, executes complex reasoning, and automates your entire browser experience securely.
                </p>
                
                <div 
                   className="hero-fade-in flex gap-4 pointer-events-auto opacity-0"
                >
                   <a 
                     href="/dashboard" 
                     className="px-8 py-4 bg-white text-black font-bold rounded-xl hover:scale-105 transition-transform flex items-center gap-2 shadow-[0_0_30px_rgba(255,255,255,0.2)]"
                   >
                      Launch Workspace
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                   </a>
                   <a 
                     href="#architecture" 
                     className="px-8 py-4 bg-white/5 border border-white/10 text-white font-bold rounded-xl hover:bg-white/10 transition-colors backdrop-blur-md"
                   >
                      View Architecture
                   </a>
                </div>
             </div>
          </section>

          {/* --- SECTION 2: THE BRAIN --- */}
          <section className="reveal-section relative min-h-screen w-full flex flex-col lg:flex-row items-center md:pl-48 pr-6 md:pr-12 py-32 gap-16 z-10">
             <div className="flex-1 max-w-2xl">
                <h2 className="reveal-item text-sm font-mono text-[#8052ff] mb-4 tracking-widest uppercase flex items-center gap-2">
                  <span className="w-8 h-[1px] bg-[#8052ff]" /> 01 / The Brain
                </h2>
                <h3 className="reveal-item text-5xl md:text-7xl font-black tracking-tight mb-8">Local LLM Reasoning.</h3>
                <p className="reveal-item text-xl text-zinc-400 leading-relaxed mb-12">
                  Unlike standard macros, SETU operates with an embedded cognitive engine. It understands natural language, analyzes context, and formulates multi-step plans entirely on your local machine.
                </p>
                
                <div className="reveal-item grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="p-8 rounded-3xl bg-gradient-to-br from-[#8052ff]/10 to-transparent border border-[#8052ff]/20">
                      <div className="w-12 h-12 rounded-full bg-[#8052ff]/20 flex items-center justify-center mb-6 text-[#8052ff]">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                      </div>
                      <h4 className="text-xl font-bold mb-3 text-white">Contextual Memory</h4>
                      <p className="text-sm text-zinc-400">Maintains conversation and session history natively. No cloud vector DBs needed.</p>
                   </div>
                   <div className="p-8 rounded-3xl bg-gradient-to-br from-[#15846e]/10 to-transparent border border-[#15846e]/20">
                      <div className="w-12 h-12 rounded-full bg-[#15846e]/20 flex items-center justify-center mb-6 text-[#15846e]">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                      </div>
                      <h4 className="text-xl font-bold mb-3 text-white">Self-Correcting</h4>
                      <p className="text-sm text-zinc-400">Detects execution errors in real-time and autonomously adjusts its browser strategy.</p>
                   </div>
                </div>
             </div>
             
             <div className="reveal-item flex-1 w-full h-[600px] bg-[#050505] rounded-[40px] border border-white/10 shadow-[0_30px_80px_rgba(128,82,255,0.15)] overflow-hidden relative flex flex-col">
                <div className="w-full h-14 border-b border-white/5 flex items-center px-6 bg-white/[0.02] gap-3">
                   <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                   <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                   <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                   <span className="ml-4 text-xs font-mono text-zinc-500">brain_telemetry.log</span>
                </div>
                <div className="p-8 font-mono text-sm space-y-4 overflow-hidden relative leading-relaxed">
                   <div className="text-zinc-500">{`>`} Initializing objective: <span className="text-white">"Buy mechanical keyboard"</span></div>
                   <div className="text-[#15846e]">{`>`} [LLM] Analyzing current screen state via SOM...</div>
                   <div className="text-[#8052ff]">{`>`} [LLM] Discovered search bar at coords (450, 120).</div>
                   <div className="text-zinc-500">{`>`} Executing ACTION: <span className="text-[#ffb829]">type("mechanical keyboard")</span></div>
                   <div className="text-[#15846e]">{`>`} [LLM] Evaluating results page. Highlighting highest-rated item...</div>
                   <div className="text-zinc-500">{`>`} Executing ACTION: <span className="text-[#ffb829]">click(890, 430)</span></div>
                   <div className="text-[#8052ff]">{`>`} [LLM] Cart updated. Proceeding to checkout flow.</div>
                   <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#050505] to-transparent pointer-events-none" />
                </div>
             </div>
          </section>

          {/* --- SECTION 3: VISUAL PERCEPTION --- */}
          <section className="reveal-section vision-section relative min-h-screen w-full flex flex-col lg:flex-row-reverse items-center md:pl-48 pr-6 md:pr-12 py-32 gap-16 z-10 bg-[radial-gradient(ellipse_at_right,_var(--tw-gradient-stops))] from-[#ffb829]/5 via-transparent to-transparent">
             <div className="flex-1 max-w-2xl">
                <h2 className="reveal-item text-sm font-mono text-[#ffb829] mb-4 tracking-widest uppercase flex items-center gap-2">
                  <span className="w-8 h-[1px] bg-[#ffb829]" /> 02 / Vision
                </h2>
                <h3 className="reveal-item text-5xl md:text-7xl font-black tracking-tight mb-8">It sees what you see.</h3>
                <p className="reveal-item text-xl text-zinc-400 leading-relaxed mb-8">
                  Instead of relying on brittle DOM scraping, SETU relies on visual bounding boxes and Set of Mark (SOM) computer vision. It interacts with Canvas elements, WebGL, and heavily obfuscated React portals just like a human.
                </p>
             </div>
             
             <div className="reveal-item flex-1 w-full relative">
                <div className="w-full aspect-video bg-[#09090b] rounded-3xl border-[8px] border-zinc-900 overflow-hidden relative shadow-2xl">
                   {/* Fake Website UI */}
                   <div className="absolute inset-0 p-8 flex flex-col gap-6 opacity-40 blur-[2px] bg-zinc-950">
                      <div className="w-full h-16 bg-white/5 rounded-xl border border-white/10" />
                      <div className="w-1/3 h-10 bg-white/5 rounded-xl border border-white/10" />
                      <div className="grid grid-cols-3 gap-6">
                        <div className="aspect-square bg-white/5 rounded-xl border border-white/10" />
                        <div className="aspect-square bg-white/5 rounded-xl border border-white/10" />
                        <div className="aspect-square bg-white/5 rounded-xl border border-white/10" />
                      </div>
                   </div>
                   
                   {/* Bounding Boxes drawn via SVG */}
                   <svg className="absolute inset-0 w-full h-full z-10" pointerEvents="none">
                      <rect className="dom-box" x="6%" y="8%" width="88%" height="16%" fill="none" stroke="#ffb829" strokeWidth="3" strokeDasharray="1500" strokeDashoffset="1500" rx="8" />
                      <text className="dom-box" x="7%" y="7%" fill="#ffb829" fontSize="12" fontFamily="monospace" strokeDasharray="50" strokeDashoffset="50">ID: 0</text>
                      
                      <rect className="dom-box" x="6%" y="30%" width="30%" height="10%" fill="none" stroke="#15846e" strokeWidth="3" strokeDasharray="1500" strokeDashoffset="1500" rx="8" />
                      <text className="dom-box" x="7%" y="29%" fill="#15846e" fontSize="12" fontFamily="monospace">ID: 1</text>
                      
                      <rect className="dom-box" x="6%" y="46%" width="27%" height="38%" fill="none" stroke="#8052ff" strokeWidth="3" strokeDasharray="1500" strokeDashoffset="1500" rx="8" />
                      <text className="dom-box" x="7%" y="45%" fill="#8052ff" fontSize="12" fontFamily="monospace">ID: 2</text>
                      
                      <rect className="dom-box" x="36.5%" y="46%" width="27%" height="38%" fill="none" stroke="#8052ff" strokeWidth="3" strokeDasharray="1500" strokeDashoffset="1500" rx="8" />
                      <text className="dom-box" x="37.5%" y="45%" fill="#8052ff" fontSize="12" fontFamily="monospace">ID: 3</text>
                      
                      <rect className="dom-box" x="67%" y="46%" width="27%" height="38%" fill="none" stroke="#8052ff" strokeWidth="3" strokeDasharray="1500" strokeDashoffset="1500" rx="8" />
                      <text className="dom-box" x="68%" y="45%" fill="#8052ff" fontSize="12" fontFamily="monospace">ID: 4</text>
                   </svg>
                </div>
             </div>
          </section>
          
          {/* --- SECTION 4: SECURITY --- */}
          <section id="architecture" className="reveal-section relative min-h-[80vh] w-full flex flex-col justify-center md:pl-48 pr-6 md:pr-12 py-32 z-10">
             <div className="max-w-3xl mb-20">
                <h2 className="reveal-item text-sm font-mono text-[#15846e] mb-4 tracking-widest uppercase flex items-center gap-2">
                  <span className="w-8 h-[1px] bg-[#15846e]" /> 03 / Architecture
                </h2>
                <h3 className="reveal-item text-5xl md:text-7xl font-black tracking-tight mb-8">Zero-Trust Isolation.</h3>
                <p className="reveal-item text-xl text-zinc-400">Built for enterprise. Every action is cryptographically verified and executed in safe ephemeral environments.</p>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
                {[
                  { t: 'Local-First LAN', d: 'Your credentials and execution data never leave your network. Total privacy by design.', c: '#15846e' },
                  { t: 'Process Sandboxing', d: 'Browser sub-agents are spawned in isolated OS-level containers with ephemeral profiles.', c: '#8052ff' },
                  { t: 'JWT Verification', d: 'Stateless, per-user session handling. WebSockets require strict cryptographic handshakes.', c: '#ffb829' }
                ].map((item, i) => (
                   <div 
                     key={i} 
                     className="reveal-item p-10 rounded-[40px] bg-[#09090b]/80 border border-white/5 backdrop-blur-xl hover:bg-white/[0.03] hover:border-white/10 transition-all duration-300 group shadow-xl"
                   >
                      <div className="w-16 h-16 rounded-2xl mb-8 flex items-center justify-center transition-transform group-hover:scale-110 group-hover:-rotate-6" style={{ backgroundColor: `${item.c}15`, color: item.c }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      </div>
                      <h4 className="text-2xl font-bold mb-4">{item.t}</h4>
                      <p className="text-zinc-400 leading-relaxed">{item.d}</p>
                   </div>
                ))}
             </div>
          </section>
          
          {/* --- SECTION 5: MOBILE --- */}
          <section className="reveal-section relative min-h-screen w-full flex flex-col lg:flex-row items-center justify-between md:pl-48 pr-6 md:pr-12 py-32 gap-16 z-10 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-[#8052ff]/10 via-transparent to-transparent">
             <div className="flex-1 max-w-xl">
                <h2 className="reveal-item text-sm font-mono text-white mb-4 tracking-widest uppercase flex items-center gap-2">
                  <span className="w-8 h-[1px] bg-white" /> 04 / Connectivity
                </h2>
                <h3 className="reveal-item text-5xl md:text-7xl font-black tracking-tight mb-8">Your smartphone is the remote.</h3>
                <p className="reveal-item text-xl text-zinc-400 leading-relaxed mb-12">
                  Scan the QR code to pair instantly via local network. Issue voice or text commands from your phone and watch your workstation execute them securely from anywhere in the room.
                </p>
                <div className="reveal-item inline-flex flex-col items-center gap-4 p-6 bg-white/[0.02] border border-white/10 rounded-3xl backdrop-blur-md">
                  <div className="bg-white p-3 rounded-2xl shadow-lg">
                    <QRCodeSVG value="setu-mobile-demo" size={160} level="H" />
                  </div>
                  <span className="text-xs font-mono tracking-widest text-zinc-500">SCAN TO PAIR</span>
                </div>
             </div>
             
             {/* Isometric Phone Mockup */}
             <div className="reveal-item flex-1 flex justify-center perspective-[2000px]">
                <div 
                  className="w-[320px] h-[650px] bg-black border-[12px] border-zinc-900 rounded-[50px] shadow-[40px_40px_80px_rgba(0,0,0,0.9)] overflow-hidden relative"
                  style={{ transform: 'rotateX(15deg) rotateY(-15deg)' }}
                >
                   {/* Dynamic Island */}
                   <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-8 bg-zinc-950 rounded-full z-10 shadow-inner" />
                   
                   <div className="absolute inset-0 bg-[#050505] flex flex-col pt-20 px-6 pb-10">
                      <div className="flex-1 flex flex-col gap-6 justify-end">
                         <div className="self-end bg-[#8052ff] text-white text-[15px] p-5 rounded-3xl rounded-br-sm max-w-[85%] shadow-lg">
                            "Book me a flight to NYC for next Friday."
                         </div>
                         <div className="self-start bg-zinc-900 text-zinc-300 text-[15px] p-5 rounded-3xl rounded-bl-sm max-w-[85%] shadow-lg border border-white/5">
                            Agent deployed. Opening Delta and scanning for flights...
                         </div>
                      </div>
                      <div className="w-full h-16 bg-white/5 rounded-full mt-8 flex items-center px-5 border border-white/10 backdrop-blur-md">
                         <div className="w-8 h-8 rounded-full bg-[#15846e] flex items-center justify-center shadow-[0_0_15px_#15846e]">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/></svg>
                         </div>
                         <span className="ml-4 text-zinc-400 font-medium">Listening to command...</span>
                      </div>
                   </div>
                </div>
             </div>
          </section>

          {/* --- SECTION 6: DEPLOY --- */}
          <section className="reveal-section relative py-40 md:pl-32 pr-6 md:pr-12 text-center flex flex-col items-center z-10">
             <h2 className="reveal-item text-5xl md:text-8xl font-black tracking-tight mb-8">Deploy in seconds.</h2>
             <p className="reveal-item text-xl text-zinc-400 mb-16 max-w-2xl leading-relaxed">
               Clone the repository, install dependencies, and boot the cognitive engine. No cloud subscriptions required.
             </p>
             
             <div className="reveal-item bg-[#050505] border border-white/10 rounded-[32px] p-8 md:p-10 w-full max-w-3xl text-left font-mono text-sm md:text-base text-zinc-300 shadow-[0_30px_80px_rgba(0,0,0,0.8)] relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-[#8052ff] group-hover:bg-[#ffb829] transition-colors duration-500" />
                <div className="flex items-center gap-2 mb-8">
                   <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                   <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                   <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                </div>
                <div className="space-y-4">
                  <p><span className="text-[#8052ff] font-bold">git clone</span> https://github.com/Dhairya2112/SETU.git</p>
                  <p><span className="text-[#8052ff] font-bold">cd</span> SETU/backend && pip install -r requirements.txt</p>
                  <p className="text-[#15846e] font-bold">python -m daphne -b 0.0.0.0 -p 8000 setu.asgi:application</p>
                  <div className="h-px w-full bg-white/10 my-6" />
                  <p className="text-zinc-500 italic">// In a new terminal window:</p>
                  <p><span className="text-[#8052ff] font-bold">cd</span> SETU/frontend && npm install</p>
                  <p><span className="text-[#ffb829] font-bold">npm run dev</span></p>
                </div>
             </div>
             
             <a 
               href="/dashboard" 
               className="reveal-item mt-20 px-14 py-6 bg-white text-black font-black rounded-2xl hover:scale-105 transition-transform shadow-[0_0_40px_rgba(255,255,255,0.3)] text-xl flex items-center gap-3"
             >
                Initialize Workspace
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
             </a>
          </section>
        </div>
      </div>
    </ReactLenis>
  );
}
