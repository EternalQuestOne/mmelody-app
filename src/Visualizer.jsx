import { useEffect, useRef, useState } from 'react';

export default function Visualizer({ audioRef, isPlaying }) {
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  
  // Track active pattern: 0 (Default) through 4
  const [patternIndex, setPatternIndex] = useState(0);

  // Shared Physics Refs
  const peaksRef = useRef([]);
  const dropDelayRef = useRef([]);

  // Reset physics arrays when switching patterns to prevent visual overlap
  useEffect(() => {
    peaksRef.current = [];
    dropDelayRef.current = [];
  }, [patternIndex]);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    if (!audioEl._hasWebAudio) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AudioContext();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      
      // Standard FFT size for frequency-based patterns
      analyserRef.current.fftSize = 512; 
      analyserRef.current.smoothingTimeConstant = 0.75;

      const source = audioCtxRef.current.createMediaElementSource(audioEl);
      source.connect(analyserRef.current);
      analyserRef.current.connect(audioCtxRef.current.destination);
      audioEl._hasWebAudio = true;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      
      if (isPlaying) {
        analyser.getByteFrequencyData(dataArray);
      } else {
        dataArray.fill(0);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerY = canvas.height / 2;

      // --- PATTERN SELECTION LOGIC ---
      switch (patternIndex) {
        
        // PATTERN 0: Symmetrical Deep Blue Capsules (#2F80ED)
        case 0: {
          const barCount = 72;
          const barWidth = canvas.width / barCount;
          const centerX = (barCount - 1) / 2;
          const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
          grad.addColorStop(0, 'rgba(47, 128, 237, 0)');
          grad.addColorStop(0.5, 'rgba(47, 128, 237, 1)');
          grad.addColorStop(1, 'rgba(47, 128, 237, 0)');
          ctx.fillStyle = grad;
          for (let i = 0; i < barCount; i++) {
            const dist = Math.abs(i - centerX);
            const freq = Math.floor(Math.pow(dist / centerX, 1.1) * (bufferLength * 0.7));
            const ceil = Math.exp(-Math.pow(dist / (centerX * 0.75), 2));
            const h = ((Math.pow(dataArray[freq]/255, 1.4) * 0.85 * canvas.height) + 3) * ceil * (0.9 + Math.sin(i * 1.5) * 0.1);
            ctx.beginPath();
            ctx.roundRect(i * barWidth, centerY - (h / 2), barWidth - 3, Math.min(h, (canvas.height - 10) * ceil), 20);
            ctx.fill();
          }
          break;
        }

        // PATTERN 1: Symmetrical Light Blue Capsules (#56CCF2)
        case 1: {
          const barCount = 72;
          const barWidth = canvas.width / barCount;
          const centerX = (barCount - 1) / 2;
          const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
          grad.addColorStop(0, 'rgba(86, 204, 242, 0)');
          grad.addColorStop(0.5, 'rgba(86, 204, 242, 1)');
          grad.addColorStop(1, 'rgba(86, 204, 242, 0)');
          ctx.fillStyle = grad;
          for (let i = 0; i < barCount; i++) {
            const dist = Math.abs(i - centerX);
            const freq = Math.floor(Math.pow(dist / centerX, 1.1) * (bufferLength * 0.7));
            const ceil = Math.exp(-Math.pow(dist / (centerX * 0.75), 2));
            const h = ((Math.pow(dataArray[freq]/255, 1.4) * 0.85 * canvas.height) + 3) * ceil * (0.9 + Math.sin(i * 1.5) * 0.1);
            ctx.beginPath();
            ctx.roundRect(i * barWidth, centerY - (h / 2), barWidth - 3, Math.min(h, (canvas.height - 10) * ceil), 20);
            ctx.fill();
          }
          break;
        }

        // PATTERN 2: EQ Grid with Color Tiering
        case 2: {
          const count = 48; const w = canvas.width / count;
          if (peaksRef.current.length === 0) { peaksRef.current = new Array(count).fill(0); dropDelayRef.current = new Array(count).fill(0); }
          for (let i = 0; i < count; i++) {
            const prog = i / (count - 1);
            let eq = prog < 0.15 ? 1 + Math.pow(1-(prog/0.15),2)*2 : prog < 0.5 ? 1-((prog-0.15)/0.35)*0.4 : 0.6-((prog-0.5)/0.5)*0.3;
            let rows = Math.floor(Math.pow((dataArray[i * 2] * eq) / 255, 1.2) * 10);
            if (rows >= peaksRef.current[i]) { peaksRef.current[i] = rows; dropDelayRef.current[i] = 120; }
            else { if (dropDelayRef.current[i] > 0) dropDelayRef.current[i]--; else if (peaksRef.current[i] > 0) peaksRef.current[i] -= 0.04; }
            for (let r = 0; r < 10; r++) {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.fillRect(i * w, canvas.height - (r * 10) - 8, w - 4, 8);
              if (r < rows) {
                ctx.fillStyle = r > 6 ? '#56CCF2' : r > 2 ? '#2F80ED' : '#1A56DB';
                ctx.fillRect(i * w, canvas.height - (r * 10) - 8, w - 4, 8);
              }
              if (r === Math.floor(peaksRef.current[i]) && r > 0) {
                ctx.fillStyle = '#56CCF2'; ctx.fillRect(i * w, canvas.height - (r * 10) - 8, w - 4, 8);
              }
            }
          }
          break;
        }

        // PATTERN 3: EQ Grid Solid Blue with Cyan Caps
        case 3: {
          const count = 48; const w = canvas.width / count;
          if (peaksRef.current.length === 0) { peaksRef.current = new Array(count).fill(0); dropDelayRef.current = new Array(count).fill(0); }
          for (let i = 0; i < count; i++) {
            const prog = i / (count - 1);
            let eq = prog < 0.15 ? 1 + Math.pow(1-(prog/0.15),2)*2 : prog < 0.5 ? 1-((prog-0.15)/0.35)*0.4 : 0.6-((prog-0.5)/0.5)*0.3;
            let rows = Math.floor(Math.pow((dataArray[i * 2] * eq) / 255, 1.2) * 10);
            if (rows >= peaksRef.current[i]) { peaksRef.current[i] = rows; dropDelayRef.current[i] = 120; }
            else { if (dropDelayRef.current[i] > 0) dropDelayRef.current[i]--; else if (peaksRef.current[i] > 0) peaksRef.current[i] -= 0.04; }
            for (let r = 0; r < 10; r++) {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.fillRect(i * w, canvas.height - (r * 10) - 8, w - 4, 8);
              if (r < rows) { ctx.fillStyle = '#2F80ED'; ctx.fillRect(i * w, canvas.height - (r * 10) - 8, w - 4, 8); }
              if (r === Math.floor(peaksRef.current[i]) && r > 0) { ctx.fillStyle = '#56CCF2'; ctx.fillRect(i * w, canvas.height - (r * 10) - 8, w - 4, 8); }
            }
          }
          break;
        }

        // PATTERN 4: EQ Grid Solid Blue with Blue Caps
        case 4: {
          const count = 48; const w = canvas.width / count;
          if (peaksRef.current.length === 0) { peaksRef.current = new Array(count).fill(0); dropDelayRef.current = new Array(count).fill(0); }
          for (let i = 0; i < count; i++) {
            const prog = i / (count - 1);
            let eq = prog < 0.15 ? 1 + Math.pow(1-(prog/0.15),2)*2 : prog < 0.5 ? 1-((prog-0.15)/0.35)*0.4 : 0.6-((prog-0.5)/0.5)*0.3;
            let rows = Math.floor(Math.pow((dataArray[i * 2] * eq) / 255, 1.2) * 10);
            if (rows >= peaksRef.current[i]) { peaksRef.current[i] = rows; dropDelayRef.current[i] = 120; }
            else { if (dropDelayRef.current[i] > 0) dropDelayRef.current[i]--; else if (peaksRef.current[i] > 0) peaksRef.current[i] -= 0.04; }
            for (let r = 0; r < 10; r++) {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.fillRect(i * w, canvas.height - (r * 10) - 8, w - 4, 8);
              if (r < rows) { ctx.fillStyle = '#2F80ED'; ctx.fillRect(i * w, canvas.height - (r * 10) - 8, w - 4, 8); }
              if (r === Math.floor(peaksRef.current[i]) && r > 0) { ctx.fillStyle = '#2F80ED'; ctx.fillRect(i * w, canvas.height - (r * 10) - 8, w - 4, 8); }
            }
          }
          break;
        }
      }
    };

    draw();
    return () => cancelAnimationFrame(animationRef.current);
  }, [audioRef, isPlaying, patternIndex]);

  return (
    <div 
      onClick={() => setPatternIndex((prev) => (prev + 1) % 5)}
      style={{ width: '100%', boxSizing: 'border-box', padding: '0 25px', display: 'flex', justifyContent: 'center', margin: '15px 0 5px 0', cursor: 'pointer' }}
    >
      <canvas 
        ref={canvasRef} 
        width="600" 
        height="100" 
        style={{ 
          width: '100%', 
          height: patternIndex < 2 ? '60px' : '50px', 
          opacity: isPlaying ? 1 : 0.4, 
          filter: patternIndex === 0 ? 'drop-shadow(0 0 6px rgba(47, 128, 237, 0.4))' : 
                  patternIndex === 1 ? 'drop-shadow(0 0 6px rgba(86, 204, 242, 0.4))' : 'none',
          transition: 'opacity 0.3s ease'
        }} 
      />
    </div>
  );
}