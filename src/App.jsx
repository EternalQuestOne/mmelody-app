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
  const [sortOrder, setSortOrder] = useState('newest'); 
  
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
        const audioId = extractPublicId(song.audio_url);
        if (audioId) await fetch('/api/deleteAudio', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ public_id: audioId })});
        if (song.cover_url) {
          const coverId = extractPublicId(song.cover_url);
          if (coverId) await fetch('/api/deleteImage', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ public_id: coverId })});
        }
        await supabase.from('songs').delete().eq('id', song.id);
      }
      setSongs(prev => prev.filter(s => !songsToDelete.find(td => td.id === s.id)));
      setSelectedIds([]);
      setIsSelectionMode(false);
      if (songsToDelete.find(s => s.id === currentSong?.id)) { handleStop(); setCurrentSong(null); }
    } catch (err) { console.error("Deletion Error:", err); }
    finally { setIsUploading(false); setUploadProgressText(''); }
  };

  // --- Playback Controls ---
  const handleStop = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; setIsPlaying(false); setProgress(0); }
  }

  const handlePlayPause = (song) => {
    if (isSelectionMode) { toggleSelection(song.id); return; }
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

  const toggleSelection = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  const navigateTo = (newTab) => {
    setActiveTab(newTab);
    if (newTab !== 'playlists') setViewingPlaylist(null);
  };

  const openPlaylistModal = (e, song) => {
    if (e) e.stopPropagation();
    setSongToAddToPlaylist(song);
    setIsPlaylistModalOpen(true);
    setActiveMenu(null);
  }

  const handleGoToDetails = (e, song) => {
    e.stopPropagation();
    setCurrentSong(song);
    navigateTo('detail');
    setShowMoreDetails(false);
    setActiveMenu(null);
  }

  // --- UPLOAD LOGIC ---
  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    setIsUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgressText(`Uploading ${i + 1}/${files.length}...`);
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
                  imgFormData.append('file', blob); imgFormData.append('upload_preset', 'mmelody_preset');
                  const imgRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: imgFormData });
                  coverUrl = (await imgRes.json()).secure_url;
                }
                const audioFormData = new FormData();
                audioFormData.append('file', file); audioFormData.append('upload_preset', 'mmelody_preset');
                const audioRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, { method: 'POST', body: audioFormData });
                const audioUrl = (await audioRes.json()).secure_url;

                const { data } = await supabase.from('songs').insert([{
                  title: tags.title || file.name.replace('.mp3', ''),
                  artist: tags.artist || '', album: tags.album || '', duration: durationStr,
                  lyrics: extractTagText(tags.USLT) || '', audio_url: audioUrl, cover_url: coverUrl,
                  subtitle: extractTagText(tags.TIT3) || '', release_year: tags.year || '',
                  composer: extractTagText(tags.TCOM) || '', lyricist: extractTagText(tags.TEXT) || '',
                  genre: tags.genre || '', comment: extractTagText(tags.COMM) || ''
                }]).select();
                if (data) setSongs(prev => [data[0], ...prev]);
              } catch (err) { console.error(err); } finally { resolve(); }
            },
            onError: () => resolve()
          });
        });
      });
    }
    setIsUploading(false); setUploadProgressText(''); event.target.value = null;
  }

  const renderSongRow = (song, index) => {
    const isThisPlaying = currentSong?.id === song.id;
    const isSelected = selectedIds.includes(song.id);
    return (
      <div key={song.id || index} className={`list-item ${isThisPlaying ? 'active' : ''} ${isSelected ? 'selected-row' : ''}`}>
        <div className="list-clickable-area" onClick={() => isSelectionMode ? toggleSelection(song.id) : handlePlayPause(song)}>
          {isSelectionMode ? <div className={`custom-checkbox ${isSelected ? 'checked' : ''}`}></div> : <div className="drag-handle">=</div>}
          {song.cover_url ? <img src={song.cover_url} alt="art" className="list-art" /> : <div className="list-art placeholder">🎵</div>}
          <div className="list-info">
            <div className="list-title">{song.title}</div>
            <div className="list-subtitle">
              {song.artist} {isThisPlaying && <span className="list-time-counter"> • {currentTimeFormatted} / {song.duration}</span>}
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
                  <div className="dropdown-item" onClick={(e) => handleGoToDetails(e, song)}>📄 Go to Details</div>
                  <div className="dropdown-item" onClick={() => { setQueue(prev => [song, ...prev]); setActiveMenu(null); alert("Play Next set!"); }}>⏭ Play Next</div>
                  <div className="dropdown-item" onClick={() => { setQueue(prev => [...prev, song]); setActiveMenu(null); alert("Added to Queue!"); }}>⏮ Add to Queue</div>
                  <div className="dropdown-item" onClick={(e) => openPlaylistModal(e, song)}>💽 Add to Playlist</div>
                  <div className="dropdown-item" style={{color: '#ff4d4d'}} onClick={() => handleDeleteSongs([song])}>🗑 Delete Song</div>
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
        setProgress((cur / dur) * 100); const m = Math.floor(cur / 60); const s = Math.floor(cur % 60).toString().padStart(2, '0');
        setCurrentTimeFormatted(`${m}:${s}`);
      }} />

      {/* PLAYLIST MODAL */}
      {isPlaylistModalOpen && (
        <div className="modal-overlay" onClick={() => setIsPlaylistModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Add to Playlist</h3>
            <p className="modal-song-name">Adding: <strong>{songToAddToPlaylist?.title}</strong></p>
            <div className="new-playlist-input-group">
              <input type="text" placeholder="New Playlist..." value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} className="modal-input" />
              <button className="modal-create-btn" onClick={async () => {
                const { data } = await supabase.from('playlists').insert([{ name: newPlaylistName }]).select();
                if (data) { 
                  setPlaylists([data[0], ...playlists]); 
                  await supabase.from('playlist_songs').insert([{ playlist_id: data[0].id, song_id: songToAddToPlaylist.id }]);
                  setIsPlaylistModalOpen(false); alert("Created & Added!");
                }
              }}>Create</button>
            </div>
            <div className="modal-playlist-list">
              {playlists.map(pl => (
                <div key={pl.id} className="modal-playlist-item" onClick={async () => {
                  await supabase.from('playlist_songs').insert([{ playlist_id: pl.id, song_id: songToAddToPlaylist.id }]);
                  setIsPlaylistModalOpen(false); alert("Added!");
                }}><span>{pl.name}</span></div>
              ))}
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
              <div className="upload-container">
                <button className="upload-btn" onClick={() => fileInputRef.current.click()}>{isUploading ? uploadProgressText : 'Upload Music'}</button>
                <input type="file" multiple ref={fileInputRef} onChange={handleFileUpload} style={{display: 'none'}} />
              </div>
              <div className="selection-toolbar">
                <button className="action-icon-btn" onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedIds([]); }}>{isSelectionMode ? 'Cancel' : 'Select'}</button>
                {isSelectionMode && selectedIds.length > 0 && <button className="delete-btn-red" onClick={() => handleDeleteSongs(songs.filter(s => selectedIds.includes(s.id)))}>Delete ({selectedIds.length})</button>}
                <select className="sort-select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                  <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="az">A-Z</option><option value="za">Z-A</option>
                </select>
              </div>
              {showSearch && <input type="text" placeholder="Search..." className="search-bar" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoFocus />}
            </header>
            <div className="song-list">{filteredSongs.map((song, i) => renderSongRow(song, i))}</div>
          </div>
        )}

        {activeTab === 'detail' && currentSong && (
          <div className="detail-view-container">
            <button className="back-btn" onClick={() => navigateTo('list')}>←</button>
            <div className="detail-art-container">{currentSong.cover_url ? <img src={currentSong.cover_url} className="detail-art" /> : <div className="detail-art placeholder-large">🎵</div>}</div>
            <div className="scrolling-wrapper"><div className="scrolling-text"><span className="scroll-title">{currentSong.title}</span><span className="scroll-artist"> • {currentSong.artist}</span></div></div>
            <div className="detail-progress-container"><div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${progress}%` }}></div></div><div className="time-row"><span>{currentTimeFormatted}</span><span>{currentSong.duration}</span></div></div>
            <div className="detail-playback-controls-bar">
              <button className="pro-ctrl-btn" onClick={handlePreviousSong}>⏮</button>
              <button className="pro-ctrl-btn master-play-pause-btn" onClick={() => handlePlayPause(currentSong)}>{isPlaying ? '⏸' : '▶'}</button>
              <button className="pro-ctrl-btn" onClick={handleNextSong}>⏭</button>
            </div>
            <button className="more-details-btn" onClick={() => setShowMoreDetails(!showMoreDetails)}>{showMoreDetails ? 'Hide' : 'More Details'}</button>
            {showMoreDetails && (
              <div className="more-details-content">
                <div className="tag-grid">
                  <div className="tag-item"><span>Artist:</span> {currentSong.artist}</div>
                  <div className="tag-item"><span>Album:</span> {currentSong.album}</div>
                </div>
                {currentSong.lyrics && <div className="lyrics-box"><h4>Lyrics</h4><p>{currentSong.lyrics}</p></div>}
              </div>
            )}
          </div>
        )}

        {activeTab === 'playlists' && (
          <div className="app-container">
            <header className="header"><h2>Your Playlists</h2></header>
            <div className="playlists-grid">
              {playlists.map(pl => (
                <div key={pl.id} className="playlist-card" onClick={() => { setViewingPlaylist(pl); setActiveTab('playlist-detail'); }}>
                  <div className="playlist-card-art">💽</div><div className="playlist-card-title">{pl.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <nav className="bottom-footer">
        <button className={`footer-btn ${activeTab === 'list' ? 'active-tab' : ''}`} onClick={() => navigateTo('list')}>List</button>
        <button className={`footer-btn ${activeTab === 'detail' ? 'active-tab' : ''}`} onClick={() => navigateTo('detail')}>Detail</button>
        <button className={`footer-btn ${activeTab === 'playlists' ? 'active-tab' : ''}`} onClick={() => navigateTo('playlists')}>Playlists</button>
        <button className={`footer-btn ${showSearch ? 'active-tab' : ''}`} onClick={() => setShowSearch(!showSearch)}>🔍</button>
      </nav>
    </div>
  )
}
export default App;