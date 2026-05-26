import { useEffect, useRef, useState } from 'react';

export default function Visualizer({ audioRef, isPlaying, isNormalized }) {
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  
  // FIX 1: Safely load from localStorage so WebView security blocks don't crash the app
  const [patternIndex, setPatternIndex] = useState(() => {
    try {
      const savedPattern = localStorage.getItem('mmelody_pattern');
      return savedPattern ? parseInt(savedPattern, 10) : 0;
    } catch (e) {
      return 0;
    }
  });

  const smoothedDataRef = useRef(new Array(64).fill(0));
  const peakDataRef = useRef(new Array(64).fill(0));

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    if (!audioEl._customAudioCtx) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const newCtx = new AudioContext();
        const newAnalyser = newCtx.createAnalyser();
        const newCompressor = newCtx.createDynamicsCompressor(); 
        
        // 1. PREAMP
        const newPreamp = newCtx.createGain();
        newPreamp.gain.value = 1; 

        // 2. BASS BOOST (Dedicated Lowshelf Filter at 60Hz)
        const newBassBoost = newCtx.createBiquadFilter();
        newBassBoost.type = 'lowshelf';
        newBassBoost.frequency.value = 60;
        newBassBoost.gain.value = 0;

        // 3. 10-BAND EQ
        const freqs = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
        const newEqBands = freqs.map((f, i) => {
            const eq = newCtx.createBiquadFilter();
            eq.type = i === 0 ? 'lowshelf' : (i === 9 ? 'highshelf' : 'peaking');
            eq.frequency.value = f;
            eq.gain.value = 0;
            return eq;
        });

        newAnalyser.fftSize = 512; 
        newAnalyser.smoothingTimeConstant = 0.4; 

        newCompressor.threshold.value = 0; 
        newCompressor.ratio.value = 1; 

        audioEl.crossOrigin = "anonymous";
        const source = newCtx.createMediaElementSource(audioEl);
        
        // --- NEW ROUTING GRAPH ---
        // source -> preamp -> bassBoost -> compressor -> eq0...eq9 -> analyser -> destination
        source.connect(newPreamp);
        newPreamp.connect(newBassBoost);
        newBassBoost.connect(newCompressor);

        let prevNode = newCompressor;
        newEqBands.forEach(band => {
            prevNode.connect(band);
            prevNode = band;
        });
        prevNode.connect(newAnalyser);
        newAnalyser.connect(newCtx.destination);
        
        audioEl._customAudioCtx = newCtx;
        audioEl._customAnalyser = newAnalyser;
        audioEl._customCompressor = newCompressor;
        audioEl._customPreamp = newPreamp;
        audioEl._customBassBoost = newBassBoost;
        audioEl._customEqBands = newEqBands;

        // Signal App.jsx that the graph is built and ready for saved presets to be applied
        setTimeout(() => window.dispatchEvent(new Event('audioGraphReady')), 100);
      } catch (err) {
        console.error("Web Audio Init Error:", err);
      }
    }

    audioCtxRef.current = audioEl._customAudioCtx;
    analyserRef.current = audioEl._customAnalyser;

    // FIX 2: Force Android to wake up the audio context on ANY screen tap
    const forceResume = () => {
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    };
    forceResume(); 
    window.addEventListener('touchstart', forceResume, { passive: true });
    window.addEventListener('click', forceResume, { passive: true });

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;
    
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const numBars = 64; 

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      
      if (isPlaying) {
        analyser.getByteFrequencyData(dataArray);
      } else {
        for(let i=0; i<dataArray.length; i++) {
            dataArray[i] = Math.max(0, dataArray[i] - 10);
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const usefulBins = Math.floor(dataArray.length * 0.5);
      const barWidth = (canvas.width / numBars) - 2;
      const centerY = canvas.height / 2;

      // PRE-CALCULATE STATIC GRADIENTS ONCE PER FRAME (Solves Android Lag)
      const modernGrad = ctx.createLinearGradient(0, canvas.height, 0, 0);
      modernGrad.addColorStop(0, 'rgba(47, 128, 237, 0.4)');
      modernGrad.addColorStop(1, '#56CCF2');

      const symGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      symGrad.addColorStop(0, '#56CCF2');
      symGrad.addColorStop(0.5, '#2F80ED');
      symGrad.addColorStop(1, '#56CCF2');

      const areaGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      areaGrad.addColorStop(0, 'rgba(86, 204, 242, 0.7)');
      areaGrad.addColorStop(1, 'rgba(47, 128, 237, 0.0)');

      for (let i = 0; i < numBars; i++) {
        const logIndex = Math.floor(Math.pow((i / numBars), 1.5) * usefulBins);
        
        let sum = 0;
        let count = 0;
        
        const startBin = logIndex;
        const endBin = i === numBars - 1 ? usefulBins : Math.floor(Math.pow(((i + 1) / numBars), 1.5) * usefulBins);
        
        for (let j = startBin; j < Math.max(startBin + 1, endBin); j++) {
            sum += dataArray[j] || 0;
            count++;
        }
        
        let rawVal = count > 0 ? (sum / count) : 0;
        const eqMultiplier = 1 + (i / numBars) * 1.5; 
        rawVal = Math.min(rawVal * eqMultiplier, 255);
        const targetHeight = (rawVal / 255) * canvas.height;

        let currentH = smoothedDataRef.current[i];
        
        if (targetHeight > currentH) {
            currentH += (targetHeight - currentH) * 0.4; 
        } else {
            currentH -= (currentH - targetHeight) * 0.15; 
        }
        smoothedDataRef.current[i] = currentH;

        let peakH = peakDataRef.current[i];
        if (currentH > peakH) {
            peakH = currentH;
        } else {
            peakH -= 1.5; 
        }
        peakDataRef.current[i] = Math.max(peakH, 0);

        const x = i * (canvas.width / numBars);
        const finalBarH = Math.max(currentH, 4); 

        // FIX 3: Wrap cases in { } blocks to prevent scope shadowing crashes in WebViews
        switch (patternIndex) {
            case 0: { // 1. Classic PotPlayer
                ctx.fillStyle = '#2F80ED';
                ctx.fillRect(x, canvas.height - finalBarH, barWidth, finalBarH);
                if (peakH > 0) {
                    ctx.fillStyle = '#56CCF2';
                    ctx.fillRect(x, canvas.height - peakH - 2, barWidth, 2);
                }
                break;
            }
            case 1: { // 2. Modern Gradient Bars
                ctx.fillStyle = modernGrad;
                ctx.beginPath();
                if(ctx.roundRect) {
                    ctx.roundRect(x, canvas.height - finalBarH, barWidth, finalBarH, [4, 4, 0, 0]);
                } else {
                    ctx.fillRect(x, canvas.height - finalBarH, barWidth, finalBarH);
                }
                ctx.fill();
                break;
            }
            case 2: { // 3. Center-Out Wavy (Mirrored)
                ctx.fillStyle = '#2F80ED';
                const h = Math.max(currentH * 0.8, 4);
                
                ctx.beginPath();
                if(ctx.roundRect){
                    ctx.roundRect(x, centerY - (h/2), barWidth, h, 10);
                } else {
                    ctx.fillRect(x, centerY - (h/2), barWidth, h);
                }
                ctx.fill();
                break;
            }
            case 3: { // 4. Symmetric Center Split
                const halfH = finalBarH / 2;
                
                ctx.fillStyle = symGrad;
                ctx.beginPath();
                if(ctx.roundRect) {
                    ctx.roundRect(x, centerY - halfH, barWidth, finalBarH, 4);
                } else {
                    ctx.fillRect(x, centerY - halfH, barWidth, finalBarH);
                }
                ctx.fill();
                break;
            }
            case 4: { // 5. Retro LED Blocks
                const blockSize = 4;
                const gap = 2;
                const totalBlocks = Math.max(1, Math.ceil(finalBarH / (blockSize + gap))); 
                
                for (let b = 0; b < totalBlocks; b++) {
                    if (b > 12) ctx.fillStyle = '#fa4619'; 
                    else if (b > 6) ctx.fillStyle = '#f8b122'; 
                    else ctx.fillStyle = '#f7f975'; 
                    
                    ctx.fillRect(x, canvas.height - (b * (blockSize + gap)) - blockSize, barWidth, blockSize);
                }
                break;
            }
            case 5: { // 6. Cyberpunk Floating Particles
                const dotY = canvas.height - finalBarH;
                
                ctx.beginPath();
                ctx.arc(x + (barWidth / 2), dotY, barWidth / 2, 0, Math.PI * 2);
                ctx.fillStyle = '#56CCF2';
                ctx.shadowBlur = 8;
                ctx.shadowColor = '#56CCF2';
                ctx.fill();
                ctx.shadowBlur = 0; 
                
                ctx.fillStyle = 'rgba(86, 204, 242, 0.15)';
                ctx.fillRect(x + (barWidth / 2) - 1, dotY, 2, finalBarH);
                break;
            }
            case 6: { // 7. Liquid Mountain Area
                if (i === 0) {
                    ctx.beginPath();
                    ctx.moveTo(0, canvas.height);
                }
                
                const mtnY = canvas.height - finalBarH;
                ctx.lineTo(x + (barWidth / 2), mtnY);
                
                if (i === numBars - 1) {
                    ctx.lineTo(canvas.width, canvas.height);
                    ctx.lineTo(0, canvas.height);
                    ctx.closePath();
                    
                    ctx.fillStyle = areaGrad;
                    ctx.fill();
                    
                    ctx.strokeStyle = '#56CCF2';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
                break;
            }
            case 7: { // 8. Neon Ghost Outlines
                ctx.strokeStyle = '#56CCF2';
                ctx.lineWidth = 1.5;
                ctx.shadowBlur = 4;
                ctx.shadowColor = '#2F80ED';
                
                ctx.beginPath();
                if(ctx.roundRect) {
                    ctx.roundRect(x, canvas.height - finalBarH, barWidth, finalBarH, [4, 4, 0, 0]);
                    ctx.stroke();
                } else {
                    ctx.strokeRect(x, canvas.height - finalBarH, barWidth, finalBarH);
                }
                ctx.shadowBlur = 0; 
                break;
            }
        }
      }
    };

    draw();
    return () => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        window.removeEventListener('touchstart', forceResume);
        window.removeEventListener('click', forceResume);
    };
  }, [audioRef, isPlaying, patternIndex]);

  useEffect(() => {
    const compressor = audioRef.current?._customCompressor;
    const ctx = audioRef.current?._customAudioCtx;
    if (!compressor || !ctx) return;

    if (isNormalized) {
      compressor.threshold.setTargetAtTime(-24, ctx.currentTime, 0.1);
      compressor.knee.setTargetAtTime(30, ctx.currentTime, 0.1);
      compressor.ratio.setTargetAtTime(12, ctx.currentTime, 0.1);
      compressor.attack.setTargetAtTime(0.003, ctx.currentTime, 0.1);
      compressor.release.setTargetAtTime(0.25, ctx.currentTime, 0.1);
    } else {
      compressor.threshold.setTargetAtTime(0, ctx.currentTime, 0.1);
      compressor.ratio.setTargetAtTime(1, ctx.currentTime, 0.1);
    }
  }, [isNormalized, audioRef]);

  return (
    <div 
      onClick={() => {
        setPatternIndex((prev) => {
          const nextPattern = (prev + 1) % 8;
          try {
             localStorage.setItem('mmelody_pattern', nextPattern.toString()); 
          } catch(e) {}
          return nextPattern;
        });
      }} 
      style={{ width: '100%', maxWidth: '350px', boxSizing: 'border-box', display: 'flex', justifyContent: 'center', margin: '10px auto 0 auto', cursor: 'pointer', minHeight: '40px' }} 
    >
      <canvas 
        ref={canvasRef} 
        width="640" 
        height="120" 
        style={{ 
          width: '100%', 
          height: '40px', 
          opacity: isPlaying ? 1 : 0.6, 
          transition: 'opacity 0.3s ease'
        }} 
      />
    </div>
  );
}