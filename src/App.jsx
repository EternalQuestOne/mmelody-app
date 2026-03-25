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

const extractPublicId = (url) => {
  try {
    const parts = url.split('/upload/');
    if (parts.length !== 2) return null;
    let path = parts[1];
    if (/^v\d+\//.test(path)) path = path.replace(/^v\d+\//, '');
    const lastDot = path.lastIndexOf('.');
    return lastDot !== -1 ? path.substring(0, lastDot) : path;
  } catch (e) { return null; }
};

function App() {
  const [songs, setSongs] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [currentSong, setCurrentSong] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [queue, setQueue] = useState([])
  const [selectedIds, setSelectedIds] = useState([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [sortOrder, setSortOrder] = useState('newest'); 
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
  const playlistFileInputRef = useRef(null)
  const moreDetailsRef = useRef(null)

  // Hardware Back Button Logic
  useEffect(() => {
    window.history.replaceState({ tab: 'list' }, '', '');
    const handleHardwareBack = (event) => {
      if (event.state && event.state.tab) {
        setActiveTab(event.state.tab);
        setShowMoreDetails(false); 
        setActiveMenu(null);
        if (event.state.tab !== 'playlists') setViewingPlaylist(null);
      } else { navigateTo('list'); }
    };
    window.addEventListener('popstate', handleHardwareBack);
    return () => window.removeEventListener('popstate', handleHardwareBack);
  }, []);

  const navigateTo = (newTab) => {
    setActiveTab(newTab);
    if (newTab !== 'playlists') setViewingPlaylist(null); 
    window.history.pushState({ tab: newTab }, '', `#${newTab}`);
  };

  useEffect(() => { getSongs(); getPlaylists(); }, [])

  async function getSongs() {
    const { data } = await supabase.from('songs').select('*').order('created_at', { ascending: false })
    if (data) setSongs(data)
  }

  async function getPlaylists() {
    const { data } = await supabase.from('playlists').select('*').order('created_at', { ascending: false })
    if (data) setPlaylists(data)
  }

  const handleDeleteSongs = async (songsToDelete) => {
    if (!window.confirm(`Delete ${songsToDelete.length} song(s)?`)) return;
    setIsUploading(true);
    setUploadProgressText("Deleting...");
    try {
      for (const song of songsToDelete) {
        const audioId = extractPublicId(song.audio_url);
        if (audioId) await fetch('/api/deleteAudio', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ public_id: audioId })});
        if (song.cover_url) {
          const coverId = extractPublicId(song.cover_url);
          if (coverId) await fetch('/api/deleteImage', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ public_id: coverId })});
        }
        await supabase.from('songs').delete().eq('id', song.id);
      }
      setSongs(prev => prev.filter(s => !songsToDelete.find(td => td.id === s.id)));
      setSelectedIds([]); setIsSelectionMode(false);
    } catch (err) { console.error(err); }
    finally { setIsUploading(false); setUploadProgressText(''); }
  };

  const handleStop = (e) => {
    if (e) e.stopPropagation();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; setIsPlaying(false); setProgress(0); }
  }

  const handlePlayPause = (song) => {
    if (isSelectionMode) { toggleSelection(song.id); return; }
    if (!audioRef.current) return;
    if (currentSong?.id === song.id) {
      if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
      else { audioRef.current.play(); setIsPlaying(true); }
    } else {
      setCurrentSong(song); setIsPlaying(true);
      audioRef.current.src = song.audio_url;
      audioRef.current.load(); audioRef.current.play();
    }
    setActiveMenu(null);
  }

  const handleNextSong = () => {
    const list = viewingPlaylist ? playlistSongs : filteredSongs;
    const idx = list.findIndex(s => s.id === currentSong?.id);
    if (idx < list.length - 1) handlePlayPause(list[idx + 1]);
    else handlePlayPause(list[0]);
  }

  const handlePreviousSong = () => {
    const list = viewingPlaylist ? playlistSongs : filteredSongs;
    const idx = list.findIndex(s => s.id === currentSong?.id);
    if (idx > 0) handlePlayPause(list[idx - 1]);
    else handlePlayPause(list[list.length - 1]);
  }

  const sortedSongs = [...songs].sort((a, b) => {
    if (sortOrder === 'az') return (a.title || '').localeCompare(b.title || '');
    if (sortOrder === 'za') return (b.title || '').localeCompare(a.title || '');
    if (sortOrder === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const filteredSongs = sortedSongs.filter(song =>
    (song.title?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (song.artist?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const toggleSelection = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  const handleToggleFavorite = async () => {
    if (!currentSong) return;
    const newState = !currentSong.is_favorite;
    const { data } = await supabase.from('songs').update({ is_favorite: newState }).eq('id', currentSong.id).select();
    if (data) {
      setSongs(songs.map(s => s.id === data[0].id ? data[0] : s));
      setCurrentSong(data[0]);
    }
  }

  const renderSongRow = (song, index) => {
    const isThisPlaying = currentSong?.id === song.id;
    const isSelected = selectedIds.includes(song.id);
    return (
      <div key={song.id} className={`list-item ${isThisPlaying ? 'active' : ''} ${isSelected ? 'selected-row' : ''}`}>
        <div className="list-clickable-area" onClick={() => isSelectionMode ? toggleSelection(song.id) : handlePlayPause(song)}>
          {isSelectionMode ? <div className={`custom-checkbox ${isSelected ? 'checked' : ''}`}></div> : <div className="drag-handle">=</div>}
          {song.cover_url ? <img src={song.cover_url} alt="art" className="list-art" /> : <div className="list-art placeholder">🎵</div>}
          <div className="list-info">
            <div className="list-title">{song.title}</div>
            <div className="list-subtitle">{song.artist}</div>
            {isThisPlaying && (
              <div className="list-playing-status">
                 <span className="list-time-counter">{currentTimeFormatted} / {song.duration}</span>
                 <div className="list-progress-bar"><div className="list-progress-fill" style={{ width: `${progress}%` }}></div></div>
              </div>
            )}
          </div>
        </div>
        {!isSelectionMode && (
          <div className="list-actions">
            {isThisPlaying && (
              <button className="list-stop-btn" onClick={handleStop}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
              </button>
            )}
            <span className="duration-text">{song.duration}</span>
            <div className="menu-container">
              <button className="menu-btn" onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === song.id ? null : song.id); }}>⋮</button>
              {activeMenu === song.id && (
                <div className="dropdown-menu">
                  <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setCurrentSong(song); navigateTo('detail'); }}>📄 Go to Details</div>
                  <div className="dropdown-item" onClick={() => { setQueue(prev => [song, ...prev]); setActiveMenu(null); }}>⏭ Play Next</div>
                  <div className="dropdown-item" onClick={() => { setQueue(prev => [...prev, song]); setActiveMenu(null); }}>⏮ Add to Queue</div>
                  <div className="dropdown-item" onClick={() => { setSongToAddToPlaylist(song); setIsPlaylistModalOpen(true); }}>💽 Add to Playlist</div>
                  <div className="dropdown-item" style={{color: '#ff4d4d'}} onClick={() => handleDeleteSongs([song])}>🗑 Delete</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-root" onClick={() => setActiveMenu(null)}>
      <audio ref={audioRef} onEnded={handleNextSong} onTimeUpdate={() => {
        const cur = audioRef.current.currentTime; const dur = audioRef.current.duration;
        if(dur) { setProgress((cur / dur) * 100); const m = Math.floor(cur / 60); const s = Math.floor(cur % 60).toString().padStart(2, '0'); setCurrentTimeFormatted(`${m}:${s}`); }
      }} />

      {isPlaylistModalOpen && (
        <div className="modal-overlay" onClick={() => setIsPlaylistModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
             <h3>Add to Playlist</h3>
             <div className="new-playlist-input-group">
               <input type="text" placeholder="New Playlist..." value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} className="modal-input" />
               <button className="modal-create-btn" onClick={async () => {
                 const { data } = await supabase.from('playlists').insert([{ name: newPlaylistName }]).select();
                 if (data) { setPlaylists([data[0], ...playlists]); setIsPlaylistModalOpen(false); }
               }}>Create</button>
             </div>
             <button className="modal-close-btn" onClick={() => setIsPlaylistModalOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="main-content-area">
        {activeTab === 'list' && (
          <div className="app-container">
            <header className="header attractive-header">
              <div className="brand-header"><h2>mMelody</h2></div>
              <div className="upload-container"><button className="upload-btn" onClick={() => fileInputRef.current.click()}>{isUploading ? uploadProgressText : 'Upload Music'}</button><input type="file" multiple ref={fileInputRef} onChange={() => {}} style={{display: 'none'}} /></div>
              <div className="selection-toolbar">
                <button className="action-icon-btn" onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedIds([]); }}>{isSelectionMode ? 'Cancel' : 'Select'}</button>
                {isSelectionMode && selectedIds.length > 0 && <button className="delete-btn-red" onClick={() => handleDeleteSongs(songs.filter(s => selectedIds.includes(s.id)))}>Delete ({selectedIds.length})</button>}
                <select className="sort-select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                  <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="az">A-Z</option><option value="za">Z-A</option>
                </select>
              </div>
            </header>
            <div className="song-list">{filteredSongs.map((song, i) => renderSongRow(song, i))}</div>
          </div>
        )}

        {activeTab === 'detail' && currentSong && (
          <div className="detail-view-container">
            <button className="back-btn" onClick={() => navigateTo('list')}>
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <div className="detail-art-container">{currentSong.cover_url ? <img src={currentSong.cover_url} className="detail-art" /> : <div className="detail-art placeholder-large">🎵</div>}</div>
            <div className="scrolling-wrapper"><div className="scrolling-text"><span className="scroll-title">{currentSong.title}</span><span className="scroll-artist"> • {currentSong.artist}</span></div></div>
            
            <div className="detail-interaction-row">
              <button className={`detail-inter-btn ${currentSong.is_favorite ? 'favorite-filled' : ''}`} onClick={handleToggleFavorite}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill={currentSong.is_favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              </button>
              <button className="detail-inter-btn" onClick={() => setShowMoreDetails(true)}><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg></button>
              <button className="detail-inter-btn" onClick={() => setIsPlaylistModalOpen(true)}><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zM2 16h8v-2H2v2zm14-1v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4z"/></svg></button>
              <button className="detail-inter-btn" onClick={() => setQueue(prev => [...prev, currentSong])}><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-7h14v-2H7v2z"/></svg></button>
            </div>

            <div className="detail-progress-container"><div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${progress}%` }}></div></div><div className="time-row"><span>{currentTimeFormatted}</span><span>{currentSong.duration}</span></div></div>
            <div className="detail-playback-controls-bar">
              <button className="pro-ctrl-btn" onClick={() => audioRef.current.currentTime -= 10}><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg></button>
              <button className="pro-ctrl-btn" onClick={handlePreviousSong}><svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
              <button className="pro-ctrl-btn master-play-pause-btn" onClick={() => handlePlayPause(currentSong)}>{isPlaying ? <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg> : <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>}</button>
              <button className="pro-ctrl-btn" onClick={handleNextSong}><svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6zm10-12h2v12h-2z"/></svg></button>
              <button className="pro-ctrl-btn" onClick={() => audioRef.current.currentTime += 10}><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6-8.5-6z"/></svg></button>
            </div>
            
            <button className="more-details-btn" onClick={() => setShowMoreDetails(!showMoreDetails)}>{showMoreDetails ? 'Hide Details' : 'More Details'}</button>
            {showMoreDetails && (
              <div className="more-details-content">
                <div className="tag-grid">
                  <div className="tag-item"><span>Title:</span> {currentSong.title}</div>
                  <div className="tag-item"><span>Artist:</span> {currentSong.artist}</div>
                  <div className="tag-item"><span>Subtitle:</span> {currentSong.subtitle}</div>
                  <div className="tag-item"><span>Album:</span> {currentSong.album}</div>
                  <div className="tag-item"><span>Year:</span> {currentSong.release_year}</div>
                  <div className="tag-item"><span>Composer:</span> {currentSong.composer}</div>
                  <div className="tag-item"><span>Lyricist:</span> {currentSong.lyricist}</div>
                  <div className="tag-item"><span>Genre:</span> {currentSong.genre}</div>
                  <div className="tag-item"><span>Comment:</span> {currentSong.comment}</div>
                </div>
                {currentSong.lyrics && <div className="lyrics-box"><h4>Lyrics</h4><p>{currentSong.lyrics}</p></div>}
              </div>
            )}
          </div>
        )}
      </div>

      <nav className="bottom-footer">
        <button className={`footer-btn ${activeTab === 'list' ? 'active-tab' : ''}`} onClick={() => navigateTo('list')}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></button>
        <button className={`footer-btn ${activeTab === 'detail' ? 'active-tab' : ''}`} onClick={() => navigateTo('detail')}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg></button>
        <button className={`footer-btn ${activeTab === 'playlists' ? 'active-tab' : ''}`} onClick={() => navigateTo('playlists')}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg></button>
        <button className={`footer-btn ${showSearch ? 'active-tab' : ''}`} onClick={() => { navigateTo('list'); setShowSearch(!showSearch); }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></button>
      </nav>
    </div>
  )
}
export default App;