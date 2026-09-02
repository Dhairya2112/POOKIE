import { useEffect, useRef } from "react";

export const NeuralMesh = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles = [];
    // Subtler count for a professional, non-distracting background
    const particleCount = Math.min(180, Math.floor(window.innerWidth / 8));
    const connectionDistance = 120;
    const mouseDistance = 180;

    const mouse = { x: -1000, y: -1000 };
    let time = 0;
    let animationFrameId;

    // Single centered slowly drifting soft violet pulse
    const pulseCloud = {
      x: 0.5,
      y: 0.5,
      vx: 0.00005,
      vy: -0.00005,
      r: 0.45,
      alpha: 0.05,
    }; // subtle pulse

    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.15; // slow drift
        this.vy = (Math.random() - 0.5) * 0.15;
        this.baseRadius = Math.random() * 2 + 1; // Size scale down
        this.radius = this.baseRadius;
        this.pulseSpeed = Math.random() * 0.01 + 0.003;

        // Random geometric primitive shape
        const shapeRand = Math.random();
        if (shapeRand < 0.25) {
          this.shape = "circle";
        } else if (shapeRand < 0.5) {
          this.shape = "triangle";
        } else if (shapeRand < 0.75) {
          this.shape = "diamond";
        } else {
          this.shape = "square";
        }

        const rand = Math.random();
        if (rand < 0.5) {
          this.color = "128, 82, 255"; // Plum Voltage
        } else if (rand < 0.8) {
          this.color = "255, 255, 255"; // Bone
        } else if (rand < 0.92) {
          this.color = "21, 132, 110"; // Lichen
        } else {
          this.color = "255, 184, 41"; // Amber Spark
        }

        this.alpha = Math.random() * 0.35 + 0.15; // Softer professional alpha
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        // Wrap around borders for infinite loop look
        if (this.x < 0) this.x = canvas.width;
        if (this.x > canvas.width) this.x = 0;
        if (this.y < 0) this.y = canvas.height;
        if (this.y > canvas.height) this.y = 0;

        // Gentle breath animation
        this.radius =
          this.baseRadius + Math.sin(time * this.pulseSpeed * 4) * 0.4;
      }

      draw() {
        if (!ctx) return;
        ctx.beginPath();
        const size = this.radius * 2;
        ctx.fillStyle = `rgba(${this.color}, ${this.alpha})`;

        if (this.shape === "triangle") {
          ctx.moveTo(this.x, this.y - this.radius);
          ctx.lineTo(this.x + this.radius, this.y + this.radius);
          ctx.lineTo(this.x - this.radius, this.y + this.radius);
          ctx.closePath();
          ctx.fill();
        } else if (this.shape === "diamond") {
          ctx.moveTo(this.x, this.y - this.radius);
          ctx.lineTo(this.x + this.radius, this.y);
          ctx.lineTo(this.x, this.y + this.radius);
          ctx.lineTo(this.x - this.radius, this.y);
          ctx.closePath();
          ctx.fill();
        } else if (this.shape === "square") {
          ctx.rect(this.x - this.radius, this.y - this.radius, size, size);
          ctx.fill();
        } else {
          // Circle
          ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    const init = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
      }
    };

    const animate = () => {
      if (!ctx || !canvas) return;
      time += 0.5;

      // Clear background for transparency
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Single very subtle violet pulse against infinite black
      ctx.globalCompositeOperation = "screen";
      pulseCloud.x += pulseCloud.vx;
      pulseCloud.y += pulseCloud.vy;

      if (pulseCloud.x < 0.2 || pulseCloud.x > 0.8) pulseCloud.vx *= -1;
      if (pulseCloud.y < 0.2 || pulseCloud.y > 0.8) pulseCloud.vy *= -1;

      const px = pulseCloud.x * canvas.width;
      const py = pulseCloud.y * canvas.height;
      const rad = pulseCloud.r * Math.max(canvas.width, canvas.height);

      const gradient = ctx.createRadialGradient(px, py, 0, px, py, rad);
      gradient.addColorStop(0, `rgba(128, 82, 255, ${pulseCloud.alpha})`);
      gradient.addColorStop(
        0.5,
        `rgba(128, 82, 255, ${pulseCloud.alpha * 0.2})`,
      );
      gradient.addColorStop(1, "rgba(128, 82, 255, 0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      // Draw particle nodes and constellation hairline lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < connectionDistance) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);

            // Faint, thin hairline lines on the void in Plum Voltage (violet) or Bone (white)
            const opacity = (1 - distance / connectionDistance) * 0.15;
            ctx.strokeStyle = `rgba(128, 82, 255, ${opacity})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }

        // Mouse gravity pull (emergence and clustering)
        const dxMouse = particles[i].x - mouse.x;
        const dyMouse = particles[i].y - mouse.y;
        const distanceMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);

        if (distanceMouse < mouseDistance) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(mouse.x, mouse.y);

          const opacity = (1 - distanceMouse / mouseDistance) * 0.12;
          ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Soft magnetic clustering into organic forms
          particles[i].x -= dxMouse * 0.005;
          particles[i].y -= dyMouse * 0.005;
          particles[i].alpha = Math.min(0.8, particles[i].alpha + 0.01);
        } else {
          particles[i].alpha = Math.max(0.2, particles[i].alpha - 0.003);
        }

        particles[i].update();
        particles[i].draw();
      }

      // Mouse interactive radial pulse (violet light overlay)
      if (mouse.x > 0 && mouse.y > 0) {
        ctx.globalCompositeOperation = "screen";
        const mouseGlow = ctx.createRadialGradient(
          mouse.x,
          mouse.y,
          0,
          mouse.x,
          mouse.y,
          160,
        );
        mouseGlow.addColorStop(0, "rgba(128, 82, 255, 0.25)");
        mouseGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = mouseGlow;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 160, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    const handleResize = () => {
      init();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", handleResize);

    init();
    animate();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-0"
    />
  );
};
