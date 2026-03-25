import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js'
import './App.css'

const CLOUDINARY_CLOUD_NAME = 'dexx3rdkl';

// --- Utility: MP3 Tag Extractor ---
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

// --- Utility: Cloudinary ID Extractor ---
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
  // --- Core State ---
  const [songs, setSongs] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [currentSong, setCurrentSong] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [queue, setQueue] = useState([])
  
  // --- Selection & Sorting State ---
  const [selectedIds, setSelectedIds] = useState([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [sortOrder, setSortOrder] = useState('newest'); // 'newest', 'oldest', 'az', 'za'
  
  // --- UI State ---
  const [activeTab, setActiveTab] = useState('list') 
  const [showSearch, setShowSearch] = useState(false) 
  const [progress, setProgress] = useState(0)
  const [currentTimeFormatted, setCurrentTimeFormatted] = useState('0:00')
  const [uploadProgressText, setUploadProgressText] = useState('')
  const [showMoreDetails, setShowMoreDetails] = useState(false) 
  const [activeMenu, setActiveMenu] = useState(null)

  // --- Playlist State ---
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

  useEffect(() => { getSongs(); getPlaylists(); }, [])

  async function getSongs() {
    const { data } = await supabase.from('songs').select('*').order('created_at', { ascending: false })
    if (data) setSongs(data)
  }

  async function getPlaylists() {
    const { data } = await supabase.from('playlists').select('*').order('created_at', { ascending: false })
    if (data) setPlaylists(data)
  }

  // --- Deletion Engine ---
  const handleDeleteSongs = async (songsToDelete) => {
    const confirmText = songsToDelete.length === 1 
      ? `Delete "${songsToDelete[0].title}"?` 
      : `Permanently delete ${songsToDelete.length} selected songs?`;
    
    if (!window.confirm(confirmText)) return;
    setIsUploading(true);
    setUploadProgressText("Deleting from server...");

    try {
      for (const song of songsToDelete) {
        // 1. Delete Audio (Video type in Cloudinary)
        const audioId = extractPublicId(song.audio_url);
        if (audioId) await fetch('/api/deleteAudio', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ public_id: audioId })});

        // 2. Delete Cover Image
        if (song.cover_url) {
          const coverId = extractPublicId(song.cover_url);
          if (coverId) await fetch('/api/deleteImage', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ public_id: coverId })});
        }

        // 3. Delete from Supabase
        await supabase.from('songs').delete().eq('id', song.id);
      }
      setSongs(prev => prev.filter(s => !songsToDelete.find(td => td.id === s.id)));
      setSelectedIds([]);
      setIsSelectionMode(false);
      if (songsToDelete.find(s => s.id === currentSong?.id)) {
        handleStop();
        setCurrentSong(null);
      }
    } catch (err) { console.error("Deletion Error:", err); }
    finally { setIsUploading(false); setUploadProgressText(''); }
  };

  // --- Playback Controls ---
  const handlePlayPause = (song) => {
    if (isSelectionMode) return; // Prevent play when selecting
    if (!audioRef.current) return;
    if (currentSong && currentSong.audio_url === song.audio_url) {
      if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
      else { audioRef.current.play(); setIsPlaying(true); }
    } else {
      setCurrentSong(song);
      setIsPlaying(true);
      audioRef.current.src = song.audio_url;
      audioRef.current.play();
    }
    setActiveMenu(null);
  }

  const handleNextSong = () => {
    if (queue.length > 0) {
      const next = queue[0];
      setQueue(prev => prev.slice(1));
      handlePlayPause(next);
      return;
    }
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

  // --- Sorting & Filtering ---
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

  // --- Selection Mode Utils ---
  const toggleSelection = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  const renderSongRow = (song, index) => {
    const isThisPlaying = currentSong?.id === song.id;
    const isSelected = selectedIds.includes(song.id);

    return (
      <div key={song.id || index} className={`list-item ${isThisPlaying ? 'active' : ''} ${isSelected ? 'selected-row' : ''}`}>
        <div className="list-clickable-area" onClick={() => isSelectionMode ? toggleSelection(song.id) : handlePlayPause(song)}>
          {isSelectionMode ? (
            <div className={`custom-checkbox ${isSelected ? 'checked' : ''}`}></div>
          ) : (
            <div className="drag-handle">=</div>
          )}
          {song.cover_url ? <img src={song.cover_url} alt="art" className="list-art" /> : <div className="list-art placeholder">🎵</div>}
          <div className="list-info">
            <div className="list-title">{song.title}</div>
            <div className="list-subtitle">
              {song.artist} {isThisPlaying && <span>• {currentTimeFormatted} / {song.duration}</span>}
            </div>
          </div>
        </div>
        
        {!isSelectionMode && (
          <div className="list-actions">
            <span className="duration-text">{song.duration}</span>
            <div className="menu-container">
              <button className="menu-btn" onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === song.id ? null : song.id); }}>⋮</button>
              {activeMenu === song.id && (
                <div className="dropdown-menu">
                  <div className="dropdown-item" onClick={() => { setQueue(prev => [song, ...prev]); setActiveMenu(null); alert("Play Next set!"); }}>⏭ Play Next</div>
                  <div className="dropdown-item" onClick={() => { setQueue(prev => [...prev, song]); setActiveMenu(null); alert("Added to Queue!"); }}>⏮ Add to Queue</div>
                  <div className="dropdown-item" style={{color: '#ff4d4d'}} onClick={() => handleDeleteSongs([song])}>🗑 Delete Song</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ... (Keep existing handleFileUpload, getPlaylists, and navigation logic) ...
  // Note: Standard handleFileUpload remains the same for Cloudinary pushing.

  return (
    <div className="app-root" onClick={() => setActiveMenu(null)}>
      <audio ref={audioRef} onEnded={handleNextSong} onTimeUpdate={() => {
        const cur = audioRef.current.currentTime;
        const dur = audioRef.current.duration;
        setProgress((cur / dur) * 100);
        const m = Math.floor(cur / 60);
        const s = Math.floor(cur % 60).toString().padStart(2, '0');
        setCurrentTimeFormatted(`${m}:${s}`);
      }} />

      {activeTab === 'list' && (
        <div className="app-container">
          <header className="header attractive-header">
            <div className="brand-header"><h2>mMelody</h2></div>
            <div className="upload-container">
              <button className="upload-btn" onClick={() => fileInputRef.current.click()}>{isUploading ? uploadProgressText : 'Upload Music'}</button>
              <input type="file" multiple ref={fileInputRef} onChange={(e) => {/* existing handleFileUpload logic */}} style={{display: 'none'}} />
            </div>

            {/* Selection & Sorting Toolbar */}
            <div className="selection-toolbar">
              <div className="toolbar-left">
                <button className="action-icon-btn" onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedIds([]); }}>
                  {isSelectionMode ? 'Cancel' : 'Select'}
                </button>
                {isSelectionMode && selectedIds.length > 0 && (
                  <button className="delete-btn-red" onClick={() => handleDeleteSongs(songs.filter(s => selectedIds.includes(s.id)))}>
                    Delete ({selectedIds.length})
                  </button>
                )}
              </div>
              <select className="sort-select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="az">A-Z (Title)</option>
                <option value="za">Z-A (Title)</option>
              </select>
            </div>
          </header>

          <div className="song-list">
            {filteredSongs.map((song, i) => renderSongRow(song, i))}
          </div>
        </div>
      )}
      
      {/* Footer Nav */}
      <nav className="bottom-footer">
        <button className={activeTab === 'list' ? 'active-tab footer-btn' : 'footer-btn'} onClick={() => setActiveTab('list')}>List</button>
        <button className={activeTab === 'detail' ? 'active-tab footer-btn' : 'footer-btn'} onClick={() => setActiveTab('detail')}>Detail</button>
        <button className={activeTab === 'playlists' ? 'active-tab footer-btn' : 'footer-btn'} onClick={() => setActiveTab('playlists')}>Playlists</button>
      </nav>
    </div>
  )
}
export default App;