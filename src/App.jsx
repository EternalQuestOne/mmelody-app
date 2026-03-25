import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js'
import './App.css'

const CLOUDINARY_CLOUD_NAME = 'dexx3rdkl';

function App() {
  const [songs, setSongs] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [currentSong, setCurrentSong] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  
  // NEW STATES: View switching, progress, and upload tracking
  const [viewMode, setViewMode] = useState('list') // 'list' or 'detail'
  const [progress, setProgress] = useState(0)
  const [currentTimeFormatted, setCurrentTimeFormatted] = useState('0:00')
  const [uploadProgressText, setUploadProgressText] = useState('')

  const audioRef = useRef(null)
  const fileInputRef = useRef(null)
  const pressTimer = useRef(null) // For the long-press mechanic

  useEffect(() => {
    getSongs()
  }, [])

  useEffect(() => {
    if (currentSong && audioRef.current) {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }, [currentSong])

  async function getSongs() {
    const { data } = await supabase.from('songs').select('*').order('created_at', { ascending: false })
    if (data) setSongs(data)
  }

  // --- NEW: Audio Time Tracking ---
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const current = audioRef.current.currentTime;
    const duration = audioRef.current.duration;
    if (duration) {
      setProgress((current / duration) * 100);
      const mins = Math.floor(current / 60);
      const secs = Math.floor(current % 60).toString().padStart(2, '0');
      setCurrentTimeFormatted(`${mins}:${secs}`);
    }
  }

  // --- NEW: Stop Button Logic ---
  const handleStop = (e) => {
    e.stopPropagation(); // Prevents row click
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setProgress(0);
      setCurrentTimeFormatted('0:00');
    }
  }

  const handleRowClick = (song) => {
    if (currentSong && currentSong.audio_url === song.audio_url) {
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
      } else {
        audioRef.current.play()
        setIsPlaying(true)
      }
    } else {
      setCurrentSong(song)
    }
  }

  // --- NEW: Long Press (Touch & Hold) Logic ---
  const handlePointerDown = (song) => {
    pressTimer.current = setTimeout(() => {
      setCurrentSong(song);
      setViewMode('detail');
    }, 600); // 600ms hold triggers the detail view
  }

  const handlePointerUp = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }

  // --- NEW: Bulk Upload & Duration Extraction ---
  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setIsUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgressText(`Uploading ${i + 1} of ${files.length}...`);

      await new Promise((resolve) => {
        // 1. Get Audio Duration
        const objectURL = URL.createObjectURL(file);
        const tempAudio = new Audio(objectURL);
        
        tempAudio.addEventListener('loadedmetadata', () => {
          const mins = Math.floor(tempAudio.duration / 60);
          const secs = Math.floor(tempAudio.duration % 60).toString().padStart(2, '0');
          const durationStr = `${mins}:${secs}`;
          URL.revokeObjectURL(objectURL);

          // 2. Read Tags
          jsmediatags.read(file, {
            onSuccess: async function(tag) {
              try {
                const tags = tag.tags;
                let coverUrl = '';

                if (tags.picture) {
                  const byteArray = new Uint8Array(tags.picture.data);
                  const blob = new Blob([byteArray], { type: tags.picture.format });
                  const imgFormData = new FormData();
                  imgFormData.append('file', blob);
                  imgFormData.append('upload_preset', 'mmelody_preset');

                  const imgRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: imgFormData });
                  coverUrl = (await imgRes.json()).secure_url;
                }

                const audioFormData = new FormData();
                audioFormData.append('file', file);
                audioFormData.append('upload_preset', 'mmelody_preset');

                const audioRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, { method: 'POST', body: audioFormData });
                const audioUrl = (await audioRes.json()).secure_url;

                const newSong = {
                  title: tags.title || file.name.replace('.mp3', ''),
                  subtitle: tags.TIT3 ? tags.TIT3.data : '',
                  artist: tags.artist || '',
                  album: tags.album || '',
                  genre: tags.genre || '',
                  release_year: tags.year || '',
                  duration: durationStr, // <-- Saving the duration!
                  audio_url: audioUrl,
                  cover_url: coverUrl
                };

                const { data } = await supabase.from('songs').insert([newSong]).select();
                if (data) {
                  setSongs(prev => [data[0], ...prev]);
                }
              } catch (err) {
                console.error("Upload error:", err);
              } finally {
                resolve(); // Move to next file
              }
            },
            onError: function() { resolve(); }
          });
        });
      });
    }

    setIsUploading(false);
    setUploadProgressText('');
    event.target.value = null; 
  };

  const filteredSongs = songs.filter(song =>
    (song.title && song.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (song.artist && song.artist.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // --- RENDER DETAIL VIEW ---
  if (viewMode === 'detail' && currentSong) {
    return (
      <div className="detail-view-container">
        <button className="back-btn" onClick={() => setViewMode('list')}>
          ← Back to List
        </button>
        <div className="detail-art-container">
          {currentSong.cover_url ? (
            <img src={currentSong.cover_url} alt="cover" className="detail-art" />
          ) : (
            <div className="detail-art placeholder-large">🎵</div>
          )}
        </div>
        <div className="detail-info">
          <h2>{currentSong.title}</h2>
          <p>{currentSong.artist}</p>
        </div>
        
        {/* Detail View Progress Bar */}
        <div className="detail-progress-container">
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <div className="time-row">
            <span>{currentTimeFormatted}</span>
            <span>{currentSong.duration || '0:00'}</span>
          </div>
        </div>

        <div className="detail-controls">
          <button className="ctrl-btn" onClick={handleStop}>⏹</button>
          <button className="ctrl-btn main-play" onClick={() => handleRowClick(currentSong)}>
            {isPlaying ? '⏸' : '▶'}
          </button>
        </div>
      </div>
    )
  }

  // --- RENDER LIST VIEW ---
  return (
    <div className="app-container">
      <header className="header attractive-header">
        <div className="header-bg-glow"></div>
        <h2>Mmelody</h2>
        
        <div className="upload-container">
          <button 
            className="upload-btn" 
            onClick={() => fileInputRef.current.click()}
            disabled={isUploading}
          >
            {isUploading ? `⏳ ${uploadProgressText}` : '➕ Bulk Upload MP3s'}
          </button>
          {/* NEW: 'multiple' attribute allows selecting multiple files */}
          <input 
            type="file" 
            accept="audio/mpeg, audio/mp3" 
            multiple 
            ref={fileInputRef} 
            onChange={handleFileUpload}
            style={{ display: 'none' }} 
          />
        </div>

        <input
          type="text"
          placeholder="Search..."
          className="search-bar"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </header>
      
      <audio
        ref={audioRef}
        src={currentSong ? currentSong.audio_url : ''}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate} // <-- Feeds the progress bar
      />

      <div className="song-list">
        {filteredSongs.map((song, index) => {
          const isThisPlaying = currentSong && currentSong.audio_url === song.audio_url;

          return (
            <div 
              key={song.id || index} 
              className={`list-item ${isThisPlaying ? 'active' : ''}`}
              onClick={() => handleRowClick(song)}
              onPointerDown={() => handlePointerDown(song)}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <div className="drag-handle">=</div>
              
              {song.cover_url ? (
                <img src={song.cover_url} alt="cover" className="list-art" />
              ) : (
                <div className="list-art placeholder">🎵</div>
              )}
              
              <div className="list-info">
                <div className="list-title">{song.title || 'Unknown Audio'}</div>
                {song.artist && <div className="list-subtitle">{song.artist}</div>}
                
                {/* NEW: Progress Bar inside the list item */}
                {isThisPlaying && (
                  <div className="list-progress-bar">
                    <div className="list-progress-fill" style={{ width: `${progress}%` }}></div>
                  </div>
                )}
              </div>

              {/* NEW: Stop Button & Duration/Speaker Layout */}
              <div className="list-actions">
                {isThisPlaying && (
                  <button className="list-stop-btn" onClick={handleStop}>
                    {/* Professional Stop Icon SVG */}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                  </button>
                )}
                
                <div className="list-status">
                  {isThisPlaying && isPlaying ? (
                    /* Professional Animated Speaker/Wave SVG */
                    <svg className="playing-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1db954" strokeWidth="2" strokeLinecap="round">
                      <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                    </svg>
                  ) : (
                    <span className="duration-text">{song.duration || '--:--'}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default App