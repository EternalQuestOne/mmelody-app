import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js'
import './App.css'

const CLOUDINARY_CLOUD_NAME = 'dexx3rdkl';

// UPGRADED: Ultra-aggressive text extractor for messy MP3 tags
const extractTagText = (frame) => {
  if (!frame) return '';
  if (typeof frame === 'string') return frame;
  if (frame.data) {
    if (typeof frame.data === 'string') return frame.data;
    if (typeof frame.data.text === 'string') return frame.data.text;
    if (typeof frame.data.lyrics === 'string') return frame.data.lyrics; // Pulls lyrics specifically
    if (typeof frame.data.description === 'string') return frame.data.description;
  }
  return '';
};

function App() {
  const [songs, setSongs] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [currentSong, setCurrentSong] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  
  const [viewMode, setViewMode] = useState('list') 
  const [progress, setProgress] = useState(0)
  const [currentTimeFormatted, setCurrentTimeFormatted] = useState('0:00')
  const [uploadProgressText, setUploadProgressText] = useState('')
  const [showMoreDetails, setShowMoreDetails] = useState(false) 

  const audioRef = useRef(null)
  const fileInputRef = useRef(null)
  const pressTimer = useRef(null) 

  useEffect(() => {
    getSongs()
  }, [])

  useEffect(() => {
    if (currentSong && audioRef.current && !isPlaying) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [currentSong])

  async function getSongs() {
    const { data } = await supabase.from('songs').select('*').order('created_at', { ascending: false })
    if (data) setSongs(data)
  }

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

  const handleStop = (e) => {
    if (e) e.stopPropagation();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setProgress(0);
      setCurrentTimeFormatted('0:00');
    }
  }

  const handlePlayPause = (song) => {
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
      setIsPlaying(true)
    }
  }

  // --- NEW: Perfected Touch & Hold Logic ---
  const handlePointerDown = (song) => {
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null; // Mark that long-press happened
      if (!currentSong || currentSong.audio_url !== song.audio_url) {
        setCurrentSong(song);
        setIsPlaying(true);
      }
      setViewMode('detail');
      setShowMoreDetails(false);
    }, 400); // 400ms hold
  }

  const handlePointerUp = (song) => {
    if (pressTimer.current) {
      // If timer is still active, it was a quick tap! Play the song.
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
      handlePlayPause(song);
    }
  }

  const handlePointerLeave = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setIsUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgressText(`Uploading ${i + 1} of ${files.length}...`);

      await new Promise((resolve) => {
        const objectURL = URL.createObjectURL(file);
        const tempAudio = new Audio(objectURL);
        
        tempAudio.addEventListener('loadedmetadata', () => {
          const mins = Math.floor(tempAudio.duration / 60);
          const secs = Math.floor(tempAudio.duration % 60).toString().padStart(2, '0');
          const durationStr = `${mins}:${secs}`;
          URL.revokeObjectURL(objectURL);

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
                  subtitle: extractTagText(tags.TIT3) || '',
                  artist: tags.artist || '',
                  album: tags.album || '',
                  genre: tags.genre || '',
                  release_year: tags.year || '',
                  duration: durationStr,
                  comment: extractTagText(tags.COMM) || '',
                  composer: extractTagText(tags.TCOM) || '', 
                  lyricist: extractTagText(tags.TEXT) || extractTagText(tags.TOLY) || '',
                  lyrics: extractTagText(tags.USLT) || extractTagText(tags.SYLT) || '', 
                  audio_url: audioUrl,
                  cover_url: coverUrl
                };

                const { data } = await supabase.from('songs').insert([newSong]).select();
                if (data) setSongs(prev => [data[0], ...prev]);
              } catch (err) {
                console.error("Upload error:", err);
              } finally {
                resolve(); 
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

  return (
    <div className="app-root">
      <audio
        ref={audioRef}
        src={currentSong ? currentSong.audio_url : ''}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
      />

      {/* --- DETAIL VIEW --- */}
      {viewMode === 'detail' && currentSong && (
        <div className="detail-view-container">
          <button className="back-btn" onClick={() => setViewMode('list')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Back to List
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
            {currentSong.subtitle && <h4 className="detail-subtitle">{currentSong.subtitle}</h4>}
            <p className="detail-artist">{currentSong.artist}</p>
          </div>
          
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
            <button className="pro-ctrl-btn stop-btn" onClick={handleStop}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            </button>
            <button className="pro-ctrl-btn play-pause-btn" onClick={() => handlePlayPause(currentSong)}>
              {isPlaying ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>
              )}
            </button>
          </div>

          <div className="more-details-wrapper">
            <button className="more-details-btn" onClick={() => setShowMoreDetails(!showMoreDetails)}>
              {showMoreDetails ? 'Hide Details' : 'More Details'}
            </button>

            {showMoreDetails && (
              <div className="more-details-content">
                <div className="tag-grid">
                  <div className="tag-item"><span>Subtitle:</span> {currentSong.subtitle || 'Unknown'}</div>
                  <div className="tag-item"><span>Album:</span> {currentSong.album || 'Unknown'}</div>
                  <div className="tag-item"><span>Year:</span> {currentSong.release_year || 'Unknown'}</div>
                  <div className="tag-item"><span>Composer:</span> {currentSong.composer || 'Unknown'}</div>
                  <div className="tag-item"><span>Lyricist:</span> {currentSong.lyricist || 'Unknown'}</div>
                  <div className="tag-item"><span>Genre:</span> {currentSong.genre || 'Unknown'}</div>
                  <div className="tag-item"><span>Comment:</span> {currentSong.comment || 'None'}</div>
                </div>
                
                {currentSong.lyrics ? (
                  <div className="lyrics-box">
                    <h4>Lyrics</h4>
                    <p>{currentSong.lyrics}</p>
                  </div>
                ) : (
                  <div className="lyrics-box">
                    <p style={{color: '#888', fontStyle: 'italic'}}>No lyrics embedded in this file.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- LIST VIEW --- */}
      {viewMode === 'list' && (
        <div className="app-container">
          <header className="header attractive-header">
            <div className="header-bg-glow"></div>
            <h2>Mmelody</h2>
            
            <div className="upload-container">
              <button className="upload-btn" onClick={() => fileInputRef.current.click()} disabled={isUploading}>
                {isUploading ? `⏳ ${uploadProgressText}` : '➕ Bulk Upload MP3s'}
              </button>
              <input type="file" accept="audio/mpeg, audio/mp3" multiple ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
            </div>

            <input
              type="text"
              placeholder="Search..."
              className="search-bar"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </header>
          
          <div className="song-list">
            {filteredSongs.map((song, index) => {
              const isThisPlaying = currentSong && currentSong.audio_url === song.audio_url;

              return (
                <div 
                  key={song.id || index} 
                  className={`list-item ${isThisPlaying ? 'active' : ''}`}
                  onPointerDown={() => handlePointerDown(song)}
                  onPointerUp={() => handlePointerUp(song)}
                  onPointerLeave={handlePointerLeave}
                >
                  <div className="drag-handle">=</div>
                  
                  {song.cover_url ? (
                    <img src={song.cover_url} alt="cover" className="list-art" />
                  ) : (
                    <div className="list-art placeholder">🎵</div>
                  )}
                  
                  <div className="list-info">
                    <div className="list-title">{song.title || 'Unknown Audio'}</div>
                    <div className="list-subtitle">
                      {song.artist && <span>{song.artist}</span>}
                      {/* NEW: Elapsed time counter shown directly in the list! */}
                      {isThisPlaying && (
                        <span className="list-time-counter">
                           {song.artist ? ' • ' : ''}{currentTimeFormatted} / {song.duration || '0:00'}
                        </span>
                      )}
                    </div>
                    
                    {isThisPlaying && (
                      <div className="list-progress-bar">
                        <div className="list-progress-fill" style={{ width: `${progress}%` }}></div>
                      </div>
                    )}
                  </div>

                  <div className="list-actions">
                    {isThisPlaying && (
                      <button className="list-stop-btn" onClick={handleStop}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                      </button>
                    )}
                    
                    <div className="list-status">
                      {isThisPlaying && isPlaying ? (
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
      )}
    </div>
  )
}

export default App