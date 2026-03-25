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
}

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

  const [playlists, setPlaylists] = useState([])
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false)
  const [songToAddToPlaylist, setSongToAddToPlaylist] = useState(null)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [viewingPlaylist, setViewingPlaylist] = useState(null) 
  const [playlistSongs, setPlaylistSongs] = useState([]) 

  const audioRef = useRef(null)
  const fileInputRef = useRef(null)
  const moreDetailsRef = useRef(null)

  useEffect(() => {
    window.history.replaceState({ tab: 'list' }, '', '');
    const handleHardwareBack = (event) => {
      if (event.state && event.state.tab) {
        setActiveTab(event.state.tab);
        setShowMoreDetails(false); 
        setActiveMenu(null);
        if (event.state.tab !== 'playlists') setViewingPlaylist(null);
      } else { setActiveTab('list'); }
    };
    window.addEventListener('popstate', handleHardwareBack);
    return () => window.removeEventListener('popstate', handleHardwareBack);
  }, []);

  const navigateTo = (newTab) => {
    if (activeTab === newTab && !viewingPlaylist) return;
    setActiveTab(newTab);
    if (newTab !== 'playlists') setViewingPlaylist(null); 
    window.history.pushState({ tab: newTab }, '', `#${newTab}`);
    window.scrollTo(0, 0);
  };

  useEffect(() => { 
    getSongs();
    getPlaylists(); 
  }, [])

  async function getSongs() {
    const { data } = await supabase.from('songs').select('*').order('created_at', { ascending: false })
    if (data) setSongs(data)
  }

  async function getPlaylists() {
    const { data } = await supabase.from('playlists').select('*').order('created_at', { ascending: false })
    if (data) setPlaylists(data)
  }

  const handleCreateAndAddPlaylist = async () => {
    if (!newPlaylistName.trim() || !songToAddToPlaylist) return;
    
    const { data: newPlaylistData } = await supabase.from('playlists').insert([{ name: newPlaylistName }]).select();
    
    if (newPlaylistData) {
      const newPlaylist = newPlaylistData[0];
      setPlaylists([newPlaylist, ...playlists]);
      
      await supabase.from('playlist_songs').insert([{ 
        playlist_id: newPlaylist.id, 
        song_id: songToAddToPlaylist.id 
      }]);
      
      setNewPlaylistName('');
      setIsPlaylistModalOpen(false);
      setSongToAddToPlaylist(null);
      alert(`Created "${newPlaylist.name}" and added song!`);
    }
  }

  const handleAddSongToExistingPlaylist = async (playlistId, playlistName) => {
    if (!songToAddToPlaylist) return;
    
    const { error } = await supabase.from('playlist_songs').insert([{ 
      playlist_id: playlistId, 
      song_id: songToAddToPlaylist.id 
    }]);

    if (error && error.code === '23505') {
      alert("This song is already in that playlist!");
    } else if (!error) {
      alert(`Added to ${playlistName}!`);
      setIsPlaylistModalOpen(false);
      setSongToAddToPlaylist(null);
    } else {
      console.error(error);
    }
  }

  const handleOpenPlaylist = async (playlist) => {
    setViewingPlaylist(playlist);
    const { data } = await supabase
      .from('playlist_songs')
      .select('songs(*)')
      .eq('playlist_id', playlist.id)
      .order('added_at', { ascending: false });

    if (data) {
      const extractedSongs = data.map(row => row.songs).filter(song => song !== null);
      setPlaylistSongs(extractedSongs);
    }
  }

  // --- THE FIX: This function now opens the modal everywhere! ---
  const openPlaylistModal = (e, song) => {
    if (e) e.stopPropagation();
    setSongToAddToPlaylist(song);
    setIsPlaylistModalOpen(true);
    setActiveMenu(null);
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

  const activeSongArray = viewingPlaylist ? playlistSongs : songs;

  const handlePreviousSong = () => {
    if (!activeSongArray.length || !currentSong) return;
    const currentIndex = activeSongArray.findIndex(s => s.audio_url === currentSong.audio_url);
    if (currentIndex < activeSongArray.length - 1) { handlePlayPause(activeSongArray[currentIndex + 1]); }
    else { handlePlayPause(activeSongArray[0]); }
  }

  const handleNextSong = () => {
    if (!activeSongArray.length || !currentSong) return;
    const currentIndex = activeSongArray.findIndex(s => s.audio_url === currentSong.audio_url);
    if (currentIndex > 0) { handlePlayPause(activeSongArray[currentIndex - 1]); }
    else { handlePlayPause(activeSongArray[activeSongArray.length - 1]); }
  }

  const handleSeekBackward = () => { if (audioRef.current) audioRef.current.currentTime -= 10; }
  const handleSeekForward = () => { if (audioRef.current) audioRef.current.currentTime += 10; }

  const handleToggleFavorite = async () => {
    if (!currentSong) return;
    const newFavoriteState = !currentSong.is_favorite;
    const { data } = await supabase.from('songs').update({ is_favorite: newFavoriteState }).eq('id', currentSong.id).select();
    if (data) {
      const updatedSongs = songs.map(s => (s.id === data[0].id ? data[0] : s));
      setSongs(updatedSongs);
      setCurrentSong(data[0]); 
    }
  }

  const handleOpenInfo = () => {
    setShowMoreDetails(true); 
    setTimeout(() => { moreDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
  }

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
                  is_favorite: false 
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
  }

  const filteredSongs = songs.filter(song =>
    (song.title && song.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (song.artist && song.artist.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // Reusable Component for List Rows (ensures bug-free menus!)
  const renderSongRow = (song, index) => {
    const isThisPlaying = currentSong && currentSong.audio_url === song.audio_url;
    const uniqueId = song.id || index;

    return (
      <div key={uniqueId} className={`list-item ${isThisPlaying ? 'active' : ''}`}>
        <div className="list-clickable-area" onClick={() => handlePlayPause(song)}>
          <div className="drag-handle">=</div>
          {song.cover_url ? (<img src={song.cover_url} alt="cover" className="list-art" />) : (<div className="list-art placeholder">🎵</div>)}
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
              <div className="list-progress-bar"><div className="list-progress-fill" style={{ width: `${progress}%` }}></div></div>
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
              <svg className="playing-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#56CCF2" strokeWidth="2" strokeLinecap="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
            ) : (<span className="duration-text">{song.duration || '--:--'}</span>)}
          </div>

          <div className="menu-container">
            <button className="menu-btn" onClick={(e) => toggleMenu(e, uniqueId)}>⋮</button>
            {activeMenu === uniqueId && (
              <div className="dropdown-menu">
                <div className="dropdown-item" onClick={(e) => handleGoToDetails(e, song)}>📄 Go to Details</div>
                <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); alert("Added to queue!"); }}>⏮ Add to Queue</div>
                <div className="dropdown-item" onClick={handleToggleFavorite}>❤️ {currentSong?.id === song.id && currentSong.is_favorite ? 'Remove Favorite' : 'Add Favorite'}</div>
                
                {/* THE FIX: Opening the Modal from the List! */}
                <div className="dropdown-item" onClick={(e) => openPlaylistModal(e, song)}>💽 Add to Playlist</div>
                
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-root" onClick={() => setActiveMenu(null)}> 
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} onTimeUpdate={handleTimeUpdate} />

      {/* --- PLAYLIST MODAL OVERLAY --- */}
      {isPlaylistModalOpen && (
        <div className="modal-overlay" onClick={() => setIsPlaylistModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Add to Playlist</h3>
            <p className="modal-song-name">Adding: <strong>{songToAddToPlaylist?.title}</strong></p>
            
            <div className="new-playlist-input-group">
              <input 
                type="text" 
                placeholder="New Playlist Name..." 
                value={newPlaylistName} 
                onChange={(e) => setNewPlaylistName(e.target.value)}
                className="modal-input"
              />
              <button className="modal-create-btn" onClick={handleCreateAndAddPlaylist}>Create</button>
            </div>
            
            <div className="modal-playlist-list">
              {playlists.map(pl => (
                <div key={pl.id} className="modal-playlist-item" onClick={() => handleAddSongToExistingPlaylist(pl.id, pl.name)}>
                  <div className="modal-pl-icon">💽</div>
                  <span>{pl.name}</span>
                </div>
              ))}
              {playlists.length === 0 && <p style={{color: '#888', textAlign: 'center'}}>No playlists yet.</p>}
            </div>
            <button className="modal-close-btn" onClick={() => setIsPlaylistModalOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="main-content-area">
        {/* --- DETAIL VIEW --- */}
        {activeTab === 'detail' && (
          currentSong ? (
            <div className="detail-view-container">
              <button className="back-btn" onClick={() => navigateTo('list')}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              </button>

              <div className="detail-art-container">
                {currentSong.cover_url ? (
                  <img src={currentSong.cover_url} alt="cover" className="detail-art" />
                ) : (
                  <div className="detail-art placeholder-large">🎵</div>
                )}
              </div>
              
              <div className="scrolling-wrapper">
                <div className="scrolling-text">
                  <span className="scroll-title">{currentSong.title || 'Unknown Title'}</span>
                  {currentSong.artist && <span className="scroll-artist"> • {currentSong.artist}</span>}
                </div>
              </div>

              <div className="detail-interaction-row">
                <button className={`detail-inter-btn ${currentSong.is_favorite ? 'favorite-filled' : ''}`} onClick={handleToggleFavorite}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill={currentSong.is_favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                </button>
                <button className="detail-inter-btn" onClick={handleOpenInfo}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                </button>
                
                {/* THE FIX: Opening the Modal from Detail View! */}
                <button className="detail-inter-btn" onClick={(e) => openPlaylistModal(e, currentSong)}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zM2 16h8v-2H2v2zm14-1v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4z"/></svg>
                </button>
                
                <button className="detail-inter-btn menu-container"><button className="menu-btn" onClick={(e) => toggleMenu(e, currentSong.id)}>⋮</button>{activeMenu === currentSong.id && (<div className="dropdown-menu dropdown-upward"><div className="dropdown-item" onClick={handleToggleFavorite}>❤️ {currentSong.is_favorite ? 'Remove Favorite' : 'Add Favorite'}</div><div className="dropdown-item" onClick={(e) => openPlaylistModal(e, currentSong)}>💽 Add to Playlist</div></div>)}</button>
              </div>
              
              <div className="detail-progress-container">
                <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${progress}%` }}></div></div>
                <div className="time-row"><span>{currentTimeFormatted}</span><span>{currentSong.duration || '0:00'}</span></div>
              </div>

              <div className="detail-playback-controls-bar">
                <button className="pro-ctrl-btn" onClick={handleSeekBackward}><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg></button>
                <button className="pro-ctrl-btn" onClick={handlePreviousSong}><svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
                <button className="pro-ctrl-btn master-play-pause-btn" onClick={() => handlePlayPause(currentSong)}>
                  {isPlaying ? (<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>) : (<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>)}
                </button>
                <button className="pro-ctrl-btn" onClick={handleNextSong}><svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6zm10-12h2v12h-2z"/></svg></button>
                <button className="pro-ctrl-btn" onClick={handleSeekForward}><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6-8.5-6z"/></svg></button>
              </div>

              <div className="more-details-wrapper" ref={moreDetailsRef}>
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
                    {currentSong.lyrics ? (<div className="lyrics-box"><h4>Lyrics</h4><p>{currentSong.lyrics}</p></div>) : (<div className="lyrics-box"><p style={{color: '#888', fontStyle: 'italic'}}>No lyrics embedded in this file.</p></div>)}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state"><h3>No song selected</h3><p>Play a song from the list view to see details.</p></div>
          )
        )}

        {/* --- PLAYLISTS TAB --- */}
        {activeTab === 'playlists' && (
          <div className="app-container">
            <header className="header attractive-header" style={{paddingBottom: '20px'}}>
              <div className="header-bg-glow"></div>
              {viewingPlaylist ? (
                <div style={{display: 'flex', alignItems: 'center'}}>
                  <button className="back-btn" onClick={() => setViewingPlaylist(null)} style={{padding:0, margin:'0 15px 0 0'}}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  </button>
                  <h2 style={{margin:0, fontSize: '1.5rem', textAlign:'left'}}>{viewingPlaylist.name}</h2>
                </div>
              ) : (
                <h2 style={{ fontSize: '1.5rem' }}>Your Playlists</h2>
              )}
            </header>

            {viewingPlaylist ? (
              <div className="song-list">
                {playlistSongs.length > 0 ? playlistSongs.map((song, index) => renderSongRow(song, index)) : (
                  <div className="empty-state"><p>This playlist is empty.</p></div>
                )}
              </div>
            ) : (
              <div className="playlists-grid">
                {playlists.map(pl => (
                  <div key={pl.id} className="playlist-card" onClick={() => handleOpenPlaylist(pl)}>
                    <div className="playlist-card-art">💽</div>
                    <div className="playlist-card-title">{pl.name}</div>
                  </div>
                ))}
                {playlists.length === 0 && <div className="empty-state"><p>No playlists created yet. Go to a song and tap "Add to Playlist"!</p></div>}
              </div>
            )}
          </div>
        )}

        {/* --- MAIN LIST VIEW --- */}
        {activeTab === 'list' && (
          <div className="app-container">
            <header className="header attractive-header">
              <div className="header-bg-glow"></div>
              <div className="brand-header">
                <svg className="brand-logo" width="38" height="38" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="50" cy="50" r="46" stroke="#2F80ED" strokeWidth="2" strokeDasharray="4 4" opacity="0.6" />
                  <circle cx="50" cy="50" r="36" stroke="#56CCF2" strokeWidth="3" opacity="0.8" />
                  <circle cx="50" cy="50" r="24" fill="url(#blueGradient)" />
                  <circle cx="15" cy="25" r="2.5" fill="#FFF" opacity="0.8"/>
                  <circle cx="85" cy="35" r="1.5" fill="#56CCF2" />
                  <circle cx="75" cy="85" r="2" fill="#FFF" opacity="0.6"/>
                  <circle cx="25" cy="80" r="1.5" fill="#56CCF2" />
                  <text x="50" y="62" fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="38" fill="#ffffff" textAnchor="middle">m</text>
                  <defs>
                    <linearGradient id="blueGradient" x1="26" y1="26" x2="74" y2="74" gradientUnits="userSpaceOnUse"><stop stopColor="#56CCF2" /><stop offset="1" stopColor="#2F80ED" /></linearGradient>
                  </defs>
                </svg>
                <h2>mMelody</h2>
              </div>
              
              <div className="upload-container">
                <button className="upload-btn" onClick={() => fileInputRef.current.click()} disabled={isUploading}>{isUploading ? `⏳ ${uploadProgressText}` : 'Upload Music'}</button>
                <input type="file" accept="audio/mpeg, audio/mp3" multiple ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
              </div>

              {showSearch && (<input type="text" placeholder="Search songs or artists..." className="search-bar animate-search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoFocus />)}
            </header>
            
            {/* THE FIX: Main List now correctly uses the renderSongRow component! */}
            <div className="song-list">
              {filteredSongs.map((song, index) => renderSongRow(song, index))}
            </div>
          </div>
        )}

        {['queue', 'albums', 'artists'].includes(activeTab) && (
          <div className="empty-state"><h3>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3><p>This architecture is coming soon!</p></div>
        )}
      </div>

      <nav className="bottom-footer">
        <button className={`footer-btn ${activeTab === 'list' ? 'active-tab' : ''}`} onClick={() => navigateTo('list')}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></button>
        <button className={`footer-btn ${activeTab === 'detail' ? 'active-tab' : ''}`} onClick={() => navigateTo('detail')}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg></button>
        <button className={`footer-btn ${activeTab === 'queue' ? 'active-tab' : ''}`} onClick={() => navigateTo('queue')}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></button>
        <button className={`footer-btn ${activeTab === 'albums' ? 'active-tab' : ''}`} onClick={() => navigateTo('albums')}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg></button>
        <button className={`footer-btn ${activeTab === 'artists' ? 'active-tab' : ''}`} onClick={() => navigateTo('artists')}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></button>
        <button className={`footer-btn ${activeTab === 'playlists' ? 'active-tab' : ''}`} onClick={() => navigateTo('playlists')}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg></button>
        <button className={`footer-btn ${showSearch ? 'active-tab' : ''}`} onClick={() => { navigateTo('list'); setShowSearch(!showSearch); }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></button>
      </nav>
    </div>
  )
}

export default App