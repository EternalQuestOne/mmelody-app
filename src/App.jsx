import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js'
import './App.css'

const CLOUDINARY_CLOUD_NAME = 'dexx3rdkl';

const extractTagText = (frame) => {
  if (!frame) return '';
  if (typeof frame === 'string') return frame;
  if (frame.data) {
    if (typeof frame.data === 'string') return frame.data;
    if (typeof frame.data.text === 'string') return frame.data.text;
    if (typeof frame.data.lyrics === 'string') return frame.data.lyrics;
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
  
  const [activeTab, setActiveTab] = useState('list') 
  const [showSearch, setShowSearch] = useState(false) 
  
  const [progress, setProgress] = useState(0)
  const [currentTimeFormatted, setCurrentTimeFormatted] = useState('0:00')
  const [uploadProgressText, setUploadProgressText] = useState('')
  const [showMoreDetails, setShowMoreDetails] = useState(false) 
  const [activeMenu, setActiveMenu] = useState(null)

  const audioRef = useRef(null)
  const fileInputRef = useRef(null)

  // --- Hardware Back Button Hook ---
  useEffect(() => {
    window.history.replaceState({ tab: 'list' }, '', '');
    const handleHardwareBack = (event) => {
      if (event.state && event.state.tab) {
        setActiveTab(event.state.tab);
        setShowMoreDetails(false); 
        setActiveMenu(null);
      } else { setActiveTab('list'); }
    };
    window.addEventListener('popstate', handleHardwareBack);
    return () => window.removeEventListener('popstate', handleHardwareBack);
  }, []);

  const navigateTo = (newTab) => {
    if (activeTab === newTab) return;
    setActiveTab(newTab);
    window.history.pushState({ tab: newTab }, '', `#${newTab}`);
    window.scrollTo(0, 0);
  };

  useEffect(() => { getSongs() }, [])

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
    if (!audioRef.current) return;
    if (currentSong && currentSong.audio_url === song.audio_url) {
      if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
      else { audioRef.current.play().catch(e => console.error(e)); setIsPlaying(true); }
    } else {
      setCurrentSong(song);
      setIsPlaying(true);
      audioRef.current.src = song.audio_url;
      audioRef.current.load(); 
      audioRef.current.play().catch(e => { console.error("Playback blocked:", e); setIsPlaying(false); });
    }
    setActiveMenu(null); 
  }

  // --- NEW Playback Control Logic ---
  const handlePreviousSong = () => {
    if (!songs.length || !currentSong) return;
    const currentIndex = songs.findIndex(s => s.audio_url === currentSong.audio_url);
    // Descending sort means newer songs are at lower indices.
    // Finding 'Previous' means finding an *older* song, i.e., index + 1
    if (currentIndex < songs.length - 1) { handlePlayPause(songs[currentIndex + 1]); }
    else { handlePlayPause(songs[0]); } // wrap to start
  }

  const handleNextSong = () => {
    if (!songs.length || !currentSong) return;
    const currentIndex = songs.findIndex(s => s.audio_url === currentSong.audio_url);
    // Finding 'Next' means finding a *newer* song, i.e., index - 1
    if (currentIndex > 0) { handlePlayPause(songs[currentIndex - 1]); }
    else { handlePlayPause(songs[songs.length - 1]); } // wrap to end
  }

  const handleSeekBackward = () => { if (audioRef.current) audioRef.current.currentTime -= 10; }
  const handleSeekForward = () => { if (audioRef.current) audioRef.current.currentTime += 10; }

  // --- Other Interaction logic ---
  const handleToggleFavorite = async () => {
    if (!currentSong) return;
    const newFavoriteState = !currentSong.is_favorite;
    const { data } = await supabase.from('songs').update({ is_favorite: newFavoriteState }).eq('id', currentSong.id).select();
    if (data) {
      // update the local state of this song to prevent re-fetching the entire list
      const updatedSongs = songs.map(s => (s.id === data[0].id ? data[0] : s));
      setSongs(updatedSongs);
      setCurrentSong(data[0]); 
    }
  }

  const handleAddToPlaylistDetailed = () => { if (currentSong) alert("Open Playlist Selector! (Architecture coming next)"); }

  const toggleMenu = (e, songId) => {
    e.stopPropagation(); 
    setActiveMenu(activeMenu === songId ? null : songId);
  }

  const handleGoToDetails = (e, song) => {
    e.stopPropagation();
    setCurrentSong(song);
    navigateTo('detail');
    setShowMoreDetails(false);
    setActiveMenu(null);
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
                  cover_url: coverUrl,
                  is_favorite: false // default on new upload
                };

                const { data } = await supabase.from('songs').insert([newSong]).select();
                if (data) setSongs(prev => [data[0], ...prev]);
              } catch (err) { console.error("Upload error:", err); } 
              finally { resolve(); }
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
    <div className="app-root" onClick={() => setActiveMenu(null)}> 
      <audio
        ref={audioRef}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
      />

      <div className="main-content-area">
        {activeTab === 'detail' && (
          currentSong ? (
            <div className="detail-view-container">
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

              {/* Interaction row: favorite, info, playlist, more */}
              <div className="detail-interaction-row">
                <button className={`detail-inter-btn ${currentSong.is_favorite ? 'favorite-filled' : ''}`} onClick={handleToggleFavorite}>
                  {/* heart icon filled vs outline */}
                  <svg width="28" height="28" viewBox="0 0 24 24" fill={currentSong.is_favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                </button>
                <button className="detail-inter-btn"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></button>
                <button className="detail-inter-btn"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></button>
                <button className="detail-inter-btn menu-container"><button className="menu-btn" onClick={(e) => toggleMenu(e, currentSong.id)}>⋮</button>{activeMenu === currentSong.id && (<div className="dropdown-menu dropdown-upward"><div className="dropdown-item" onClick={handleToggleFavorite}>❤️ {currentSong.is_favorite ? 'Remove Favorite' : 'Add Favorite'}</div><div className="dropdown-item" onClick={handleAddToPlaylistDetailed}>💽 Add to Playlist</div></div>)}</button>
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

              {/* UPGRADED PROFESSIONAL CONTROLS BAR */}
              <div className="detail-playback-controls-bar">
                <button className="pro-ctrl-btn" onClick={handleSeekBackward}><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M2.5 12a10 10 0 0 1 10-10 10 10 0 0 1 10 10 10 10 0 0 1-10 10 10 10 0 0 1-10-10zm10-8a8 8 0 0 0-8 8 8 8 0 0 0 8 8 8 8 0 0 0 8-8 8 8 0 0 0-8-8zM7 11v2h8v-2H7z"/></svg></button>
                <button className="pro-ctrl-btn" onClick={handlePreviousSong}><svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
                <button className="pro-ctrl-btn master-play-pause-btn" onClick={() => handlePlayPause(currentSong)}>
                  {isPlaying ? (
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                  ) : (
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>
                  )}
                </button>
                <button className="pro-ctrl-btn" onClick={handleNextSong}><svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6zm10-12h2v12h-2z"/></svg></button>
                <button className="pro-ctrl-btn" onClick={handleSeekForward}><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M2.5 12a10 10 0 0 1 10-10 10 10 0 0 1 10 10 10 10 0 0 1-10 10 10 10 0 0 1-10-10zm10-8a8 8 0 0 0-8 8 8 8 0 0 0 8 8 8 8 0 0 0 8-8 8 8 0 0 0-8-8zM17 11v2H9v-2h8z"/></svg></button>
              </div>

              <div className="more-details-wrapper">
                <button className="more-details-btn" onClick={() => setShowMoreDetails(!showMoreDetails)}>
                  {showMoreDetails ? 'Hide Details' : 'More Details'}
                </button>

                {showMoreDetails && (
                  <div className="more-details-content">
                    <div className="tag-grid">
                      <div className="tag-item"><span>Title:</span> {currentSong.title || 'Unknown'}</div>
                      <div className="tag-item"><span>Artist:</span> {currentSong.artist || 'Unknown'}</div>
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
          ) : (
            <div className="empty-state">
              <h3>No song selected</h3>
              <p>Play a song from the list view to see details.</p>
            </div>
          )
        )}

        {activeTab === 'list' && (
          <div className="app-container">
            <header className="header attractive-header">
              <div className="header-bg-glow"></div>
              <h2>Mmelody</h2>
              
              <div className="upload-container">
                <button className="upload-btn" onClick={() => fileInputRef.current.click()} disabled={isUploading}>
                  {isUploading ? `⏳ ${uploadProgressText}` : 'Bulk Upload MP3s'}
                </button>
                <input type="file" accept="audio/mpeg, audio/mp3" multiple ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
              </div>

              {showSearch && (
                <input
                  type="text"
                  placeholder="Search songs or artists..."
                  className="search-bar animate-search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoFocus
                />
              )}
            </header>
            
            <div className="song-list">
              {filteredSongs.map((song, index) => {
                const isThisPlaying = currentSong && currentSong.audio_url === song.audio_url;
                const uniqueId = song.id || index;

                return (
                  <div key={uniqueId} className={`list-item ${isThisPlaying ? 'active' : ''}`}>
                    <div className="list-clickable-area" onClick={() => handlePlayPause(song)}>
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
                    </div>

                    <div className="list-actions">
                      {isThisPlaying && (
                        <button className="list-stop-btn" onClick={handleStop}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                        </button>
                      )}
                      
                      <div className="list-status">
                        {isThisPlaying && isPlaying ? (
                          <svg className="playing-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#56CCF2" strokeWidth="2" strokeLinecap="round">
                            <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                          </svg>
                        ) : (
                          <span className="duration-text">{song.duration || '--:--'}</span>
                        )}
                      </div>

                      <div className="menu-container">
                        <button className="menu-btn" onClick={(e) => toggleMenu(e, uniqueId)}>⋮</button>
                        {activeMenu === uniqueId && (
                          <div className="dropdown-menu">
                            <div className="dropdown-item" onClick={(e) => handleGoToDetails(e, song)}>📄 Go to Details</div>
                            <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); alert("Added to queue!"); }}>⏮ Add to Queue</div>
                            <div className="dropdown-item" onClick={handleToggleFavorite}>❤️ {currentSong.is_favorite ? 'Remove Favorite' : 'Add Favorite'}</div>
                            <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); alert("Ready to build Playlists!"); }}>💽 Add to Playlist</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {['queue', 'albums', 'artists', 'playlists'].includes(activeTab) && (
          <div className="empty-state">
            <h3>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3>
            <p>This architecture is coming soon!</p>
          </div>
        )}
      </div>

      <nav className="bottom-footer">
        <button className={`footer-btn ${activeTab === 'list' ? 'active-tab' : ''}`} onClick={() => navigateTo('list')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
        </button>
        <button className={`footer-btn ${activeTab === 'detail' ? 'active-tab' : ''}`} onClick={() => navigateTo('detail')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
        </button>
        <button className={`footer-btn ${activeTab === 'queue' ? 'active-tab' : ''}`} onClick={() => navigateTo('queue')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        </button>
        <button className={`footer-btn ${activeTab === 'albums' ? 'active-tab' : ''}`} onClick={() => navigateTo('albums')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
        </button>
        <button className={`footer-btn ${activeTab === 'artists' ? 'active-tab' : ''}`} onClick={() => navigateTo('artists')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        </button>
        <button className={`footer-btn ${activeTab === 'playlists' ? 'active-tab' : ''}`} onClick={() => navigateTo('playlists')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
        </button>
        <button className={`footer-btn ${showSearch ? 'active-tab' : ''}`} onClick={() => { navigateTo('list'); setShowSearch(!showSearch); }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </button>
      </nav>
    </div>
  )
}

export default App