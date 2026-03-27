import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js'
import './App.css'

// NEW: Importing your generated energetic logo asset!
import logoImage from './logo.png' // Save image_0.png as logo.png in your src folder

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
  const [isShuffle, setIsShuffle] = useState(false);
  
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [sortOrder, setSortOrder] = useState('newest');

  const [activeTab, setActiveTab] = useState('list') 
  const [showSearch, setShowSearch] = useState(false) 
  
  const [progress, setProgress] = useState(0)
  const [currentTimeFormatted, setCurrentTimeFormatted] = useState('0:00')
  const [uploadProgressText, setUploadProgressText] = useState('')
  const [showMoreDetails, setShowMoreDetails] = useState(false) 
  const [activeMenu, setActiveMenu] = useState(null)
  const [menuDirection, setMenuDirection] = useState('down') // NEW: Tracks which way the menu should open
  
  // Playlist State Variables
  const [playlists, setPlaylists] = useState([]);
  const [playlistSortOrder, setPlaylistSortOrder] = useState('newest'); // NEW: Playlist Sorting
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [songForPlaylist, setSongForPlaylist] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const playlistFileInputRef = useRef(null);
  const [editingPlaylistId, setEditingPlaylistId] = useState(null);
  // NEW: Detail View State
  const [currentPlaylist, setCurrentPlaylist] = useState(null);
  const [playlistSongs, setPlaylistSongs] = useState([]);
  const [showAddSongsModal, setShowAddSongsModal] = useState(false); // NEW: Controls the Add Songs modal
  const [modalSearchTerm, setModalSearchTerm] = useState('');

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
      } else { navigateTo('list'); }
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

  const handleFooterNavigation = (e, tab) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMoreDetails(false); 
    setActiveMenu(null); 
    navigateTo(tab);
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

  const handleOpenPlaylistModal = (song) => {
    setSongForPlaylist(song);
    setShowPlaylistModal(true);
    setActiveMenu(null); 
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    const { data, error } = await supabase.from('playlists').insert([{ name: newPlaylistName }]).select();
    if (data) {
      setPlaylists([data[0], ...playlists]);
      setNewPlaylistName('');
      if (songForPlaylist) await handleAddSongToPlaylist(data[0].id, songForPlaylist.id);
    }
  };
  // --- NEW: OPEN PLAYLIST LOGIC ---
  const handleOpenLikedMusic = () => {
    setCurrentPlaylist({ id: 'liked', name: 'Liked Music', isAuto: true });
    // Filter the main songs array for favorites
    setPlaylistSongs(songs.filter(s => s.is_favorite)); 
    navigateTo('playlist-detail');
  };

  const handleOpenPlaylist = async (playlist) => {
    setCurrentPlaylist(playlist);
    setPlaylistSongs([]); // Clear previous songs while loading
    navigateTo('playlist-detail');

    // Fetch the songs joined through the junction table
    const { data, error } = await supabase
      .from('playlist_songs')
      .select('songs(*)')
      .eq('playlist_id', playlist.id);

    if (data) {
      // Clean up the returned data structure
      const extractedSongs = data.map(item => item.songs).filter(Boolean);
      setPlaylistSongs(extractedSongs);
    }
  };

  const handleRemoveFromPlaylist = async (e, songId) => {
    e.stopPropagation();
    if (!currentPlaylist) return;

    if (currentPlaylist.isAuto) {
      // If it's Liked Music, just unfavorite it!
      const song = songs.find(s => s.id === songId);
      if (song) handleToggleFavorite(song);
      setPlaylistSongs(prev => prev.filter(s => s.id !== songId));
    } else {
      // Remove the connection in the database
      await supabase.from('playlist_songs').delete().match({ playlist_id: currentPlaylist.id, song_id: songId });
      setPlaylistSongs(prev => prev.filter(s => s.id !== songId));
    }
    setActiveMenu(null);
  };

  // NEW: Instantly adds a song directly to the currently open playlist
  const handleAddSongFromDetail = async (song) => {
    // Prevent adding duplicates
    if (playlistSongs.some(s => s.id === song.id)) {
      alert("This song is already in the playlist!");
      return;
    }

    const { error } = await supabase.from('playlist_songs').insert([{ playlist_id: currentPlaylist.id, song_id: song.id }]);
    
    if (!error || error.code === '23505') { // 23505 is the safe Postgres "already exists" error
      setPlaylistSongs(prev => [...prev, song]); // Instantly updates your UI without reloading!
      setShowAddSongsModal(false); // Closes the modal
    } else {
      console.error("Error adding to playlist:", error);
    }
  };

  const handleAddSongToPlaylist = async (playlistId, songId) => {
    const { error } = await supabase.from('playlist_songs').insert([{ playlist_id: playlistId, song_id: songId }]);
    if (error && error.code !== '23505') {
      console.error("Error adding to playlist:", error);
    } else {
      setShowPlaylistModal(false);
      setSongForPlaylist(null);
    }
  };

  const triggerPlaylistCoverUpload = (playlistId) => {
    setEditingPlaylistId(playlistId);
    playlistFileInputRef.current.click();
  };

  const handlePlaylistCoverUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !editingPlaylistId) return;

    setIsUploading(true);
    setUploadProgressText("Updating cover...");

    try {
      const playlist = playlists.find(p => p.id === editingPlaylistId);
      if (playlist && playlist.cover_url) {
        const oldCoverId = extractPublicId(playlist.cover_url);
        if (oldCoverId) await fetch('/api/deleteImage', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ public_id: oldCoverId })});
      }

      const imgFormData = new FormData();
      imgFormData.append('file', file);
      imgFormData.append('upload_preset', 'mMelody_preset');
      const imgRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: imgFormData });
      const newCoverUrl = (await imgRes.json()).secure_url;

      const { data } = await supabase.from('playlists').update({ cover_url: newCoverUrl }).eq('id', editingPlaylistId).select();
      if (data) {
        setPlaylists(playlists.map(p => p.id === editingPlaylistId ? data[0] : p));
      }
    } catch (err) { console.error("Cover update error:", err); } 
    finally {
      setIsUploading(false);
      setUploadProgressText('');
      setEditingPlaylistId(null);
      event.target.value = null;
    }
  };

  const handleDeletePlaylistCover = async (e, playlist) => {
    e.stopPropagation();
    if (!window.confirm("Remove this custom cover art?")) return;
    
    setIsUploading(true);
    setUploadProgressText("Removing cover...");

    try {
      const coverId = extractPublicId(playlist.cover_url);
      if (coverId) await fetch('/api/deleteImage', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ public_id: coverId })});

      const { data } = await supabase.from('playlists').update({ cover_url: null }).eq('id', playlist.id).select();
      if (data) {
        setPlaylists(playlists.map(p => p.id === playlist.id ? data[0] : p));
      }
    } catch (err) { console.error("Cover delete error:", err); } 
    finally { setIsUploading(false); setUploadProgressText(''); }
  };

  const handleDeletePlaylist = async (playlist) => {
    if (!window.confirm(`Are you sure you want to completely delete "${playlist.name}"?`)) return;
    
    setIsUploading(true);
    setUploadProgressText("Deleting playlist...");

    try {
      if (playlist.cover_url) {
        const coverId = extractPublicId(playlist.cover_url);
        if (coverId) await fetch('/api/deleteImage', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ public_id: coverId })});
      }

      await supabase.from('playlists').delete().eq('id', playlist.id);
      setPlaylists(playlists.filter(p => p.id !== playlist.id));
    } catch (err) { console.error("Playlist deletion error:", err); }
    finally { setIsUploading(false); setUploadProgressText(''); }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Permanently delete ${selectedIds.length} selected song(s)?`)) return;

    setIsUploading(true);
    setUploadProgressText("Deleting from server...");
    const songsToDelete = songs.filter(s => selectedIds.includes(s.id));

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
      setSongs(prev => prev.filter(s => !selectedIds.includes(s.id)));
      setSelectedIds([]);
      setIsSelectionMode(false);
      if (songsToDelete.find(s => s.id === currentSong?.id)) {
        handleStop();
        setCurrentSong(null);
      }
    } catch (err) { console.error("Deletion Error:", err); }
    finally { setIsUploading(false); setUploadProgressText(''); }
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

  const sortedSongs = [...songs].sort((a, b) => {
    if (sortOrder === 'az') return (a.title || '').localeCompare(b.title || '');
    if (sortOrder === 'za') return (b.title || '').localeCompare(a.title || '');
    if (sortOrder === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
    return new Date(b.created_at) - new Date(a.created_at);
  });
  // NEW: Sorting logic applied to the playlists array
  const sortedPlaylists = [...playlists].sort((a, b) => {
    if (playlistSortOrder === 'az') return (a.name || '').localeCompare(b.name || '');
    if (playlistSortOrder === 'za') return (b.name || '').localeCompare(a.name || '');
    if (playlistSortOrder === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
    return new Date(b.created_at) - new Date(a.created_at); // default/newest
  });

  const handlePreviousSong = () => {
    if (!sortedSongs.length || !currentSong) return;
    const currentIndex = sortedSongs.findIndex(s => s.audio_url === currentSong.audio_url);
    if (currentIndex > 0) { 
      handlePlayPause(sortedSongs[currentIndex - 1]); 
    } else { 
      handlePlayPause(sortedSongs[sortedSongs.length - 1]); 
    }
  }

  const handleNextSong = () => {
    if (!sortedSongs.length || !currentSong) return;
    if (isShuffle) {
      const randomIndex = Math.floor(Math.random() * sortedSongs.length);
      handlePlayPause(sortedSongs[randomIndex]);
      return; 
    }
    const currentIndex = sortedSongs.findIndex(s => s.audio_url === currentSong.audio_url);
    if (currentIndex < sortedSongs.length - 1) { 
      handlePlayPause(sortedSongs[currentIndex + 1]); 
    } else { 
      handlePlayPause(sortedSongs[0]); 
    }
  }

  const handleSeekBackward = () => { if (audioRef.current) audioRef.current.currentTime -= 10; }
  const handleSeekForward = () => { if (audioRef.current) audioRef.current.currentTime += 10; }
  
  const handleSeek = (e) => {
    const seekPercentage = parseFloat(e.target.value);
    if (audioRef.current && audioRef.current.duration) {
      const newTime = (seekPercentage / 100) * audioRef.current.duration;
      audioRef.current.currentTime = newTime;
      setProgress(seekPercentage);
    }
  }

  const handleToggleFavorite = async (clickedSong) => {
    const targetSong = (clickedSong && clickedSong.audio_url) ? clickedSong : currentSong;
    if (!targetSong) return;
    
    const newFavoriteState = !targetSong.is_favorite;
    const { data } = await supabase.from('songs').update({ is_favorite: newFavoriteState }).eq('id', targetSong.id).select();
    
    if (data) {
      const updatedSongs = songs.map(s => (s.id === data[0].id ? data[0] : s));
      setSongs(updatedSongs);
      if (currentSong && currentSong.id === data[0].id) {
        setCurrentSong(data[0]); 
      }
    }
  }

  const handleOpenInfo = () => {
    setShowMoreDetails(true);
    setTimeout(() => {
      moreDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  const toggleMenu = (e, id) => {
    e.stopPropagation(); 
    if (activeMenu === id) {
      setActiveMenu(null);
    } else {
      // NEW: Calculate if the tap happened in the lower half of the user's screen
      const isBottomHalf = e.clientY > (window.innerHeight / 2);
      setMenuDirection(isBottomHalf ? 'up' : 'down');
      setActiveMenu(id);
    }
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
                  imgFormData.append('upload_preset', 'mMelody_preset');
                  const imgRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: imgFormData });
                  coverUrl = (await imgRes.json()).secure_url;
                }

                const audioFormData = new FormData();
                audioFormData.append('file', file);
                audioFormData.append('upload_preset', 'mMelody_preset');
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
                  is_favorite: false,
                  created_at: new Date().toISOString()
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
    
    // Safely check if the input is currently mounted before clearing it!
    if (fileInputRef.current) fileInputRef.current.value = null; 
  }

  const filteredSongs = sortedSongs.filter(song =>
    (song.title && song.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (song.artist && song.artist.toLowerCase().includes(searchTerm.toLowerCase()))
  )
  const filteredModalSongs = songs.filter(song =>
    (song.title && song.title.toLowerCase().includes(modalSearchTerm.toLowerCase())) ||
    (song.artist && song.artist.toLowerCase().includes(modalSearchTerm.toLowerCase()))
  );

  const toggleSelection = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  return (
    <div className="app-root" onClick={() => setActiveMenu(null)}> 
      <audio ref={audioRef} onEnded={handleNextSong} onTimeUpdate={handleTimeUpdate} />
      {/* NEW: Invisible shield that blocks clicks from hitting songs underneath */}
      {activeMenu && (
        <div className="menu-backdrop" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); }}></div>
      )}

      <div className="main-content-area">
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
                <button className={`detail-inter-btn ${isShuffle ? 'active-info' : ''}`} onClick={() => setIsShuffle(!isShuffle)} title="Toggle Shuffle">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 3 21 3 21 8"></polyline>
                    <line x1="4" y1="20" x2="21" y2="3"></line>
                    <polyline points="21 16 21 21 16 21"></polyline>
                    <line x1="15" y1="15" x2="21" y2="21"></line>
                    <line x1="4" y1="4" x2="9" y2="9"></line>
                  </svg>
                </button>

                <button className={`detail-inter-btn ${currentSong.is_favorite ? 'favorite-filled' : ''}`} onClick={() => handleToggleFavorite(currentSong)}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill={currentSong.is_favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                </button>

                <button className="detail-inter-btn" onClick={() => handleOpenPlaylistModal(currentSong)}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zM2 16h8v-2H2v2zm14-1v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4z"/>
                  </svg>
                </button>

                <button className="detail-inter-btn" onClick={() => alert("Add to Queue logic coming soon!")} title="Play Next in Queue">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="6" x2="20" y2="6"></line>
                    <line x1="4" y1="12" x2="20" y2="12"></line>
                    <line x1="4" y1="18" x2="11" y2="18"></line>
                    <polyline points="15 15 18 18 15 21"></polyline>
                    <line x1="11" y1="18" x2="18" y2="18"></line>
                  </svg>
                </button>
                
                <button className={`detail-inter-btn ${showMoreDetails ? 'active-info' : ''}`} onClick={handleOpenInfo}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>
              
              <div className="detail-progress-container">
                <div className="progress-bar-bg" style={{ position: 'relative' }}>
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    step="0.1"
                    value={progress || 0} 
                    onChange={handleSeek}
                    className="progress-scrubber"
                  />
                </div>
                <div className="time-row">
                  <span>{currentTimeFormatted}</span>
                  <span>{currentSong.duration || '0:00'}</span>
                </div>
              </div>

              <div className="detail-playback-controls-bar">
                <button className="pro-ctrl-btn" onClick={handleSeekBackward}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
                  </svg>
                </button>
                <button className="pro-ctrl-btn" onClick={handlePreviousSong}><svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
                <button className="pro-ctrl-btn master-play-pause-btn" onClick={() => handlePlayPause(currentSong)}>
                  {isPlaying ? (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                  ) : (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>
                  )}
                </button>
                <button className="pro-ctrl-btn master-stop-btn" onClick={handleStop}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                </button>
                <button className="pro-ctrl-btn" onClick={handleNextSong}><svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6zm10-12h2v12h-2z"/></svg></button>
                <button className="pro-ctrl-btn" onClick={handleSeekForward}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6-8.5-6z"/>
                  </svg>
                </button>
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
                    {currentSong.lyrics ? (
                      <div className="lyrics-box"><h4>Lyrics</h4><p>{currentSong.lyrics}</p></div>
                    ) : (
                      <div className="lyrics-box"><p style={{color: '#888', fontStyle: 'italic'}}>No lyrics embedded in this file.</p></div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state"><h3>No song selected</h3><p>Play a song from the list view to see details.</p></div>
          )
        )}

        {activeTab === 'list' && (
          <div className="app-container">
            <header className="header attractive-header">
              <div className="header-bg-glow"></div>
              <div className="brand-header-wrapper">
                  <img src={logoImage} alt="mMelody logo" className="app-logo" />
                  <h2>mMelody</h2>
              </div>
              
              <div className="upload-container">
                <button className="upload-btn" onClick={() => fileInputRef.current.click()} disabled={isUploading}>
                  {isUploading ? `⏳ ${uploadProgressText}` : 'Upload Music'}
                </button>
                <input type="file" accept="audio/mpeg, audio/mp3" multiple ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
              </div>

              <div className="selection-toolbar">
                <div className="toolbar-left">
                  <button className="action-icon-btn" onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedIds([]); }}>
                    {isSelectionMode ? 'Cancel' : 'Select'}
                  </button>
                  {isSelectionMode && selectedIds.length > 0 && (
                    <button className="delete-btn-red" onClick={handleDeleteSelected}>
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
                const isSelected = selectedIds.includes(song.id); 

                return (
                  <div key={uniqueId} className={`list-item ${isThisPlaying ? 'active' : ''} ${isSelected ? 'selected-row' : ''}`}>
                    <div className="list-clickable-area" onClick={() => isSelectionMode ? toggleSelection(song.id) : handlePlayPause(song)}>
                      {isSelectionMode ? (
                        <div className={`custom-checkbox ${isSelected ? 'checked' : ''}`}></div>
                      ) : (
                        <div className="drag-handle">=</div>
                      )}
                      
                      {song.cover_url ? (<img src={song.cover_url} alt="cover" className="list-art" />) : (<div className="list-art placeholder">🎵</div>)}
                      <div className="list-info">
                        <div className="list-title">{song.title || 'Unknown Audio'}</div>
                        <div className="list-subtitle">
                          {song.artist && <span>{song.artist}</span>}
                          {isThisPlaying && (
                            <span className="list-time-counter">
                              {currentTimeFormatted} / {song.duration || '0:00'}
                            </span>
                          )}
                        </div>
                        {isThisPlaying && (
                          <div className="list-progress-bar"><div className="list-progress-fill" style={{ width: `${progress}%` }}></div></div>
                          )}
                      </div>
                    </div>

                    {!isSelectionMode && (
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
                            <div className={`dropdown-menu ${menuDirection === 'up' ? 'dropdown-upward' : ''}`}>
                              <div className="dropdown-item" onClick={(e) => handleGoToDetails(e, song)}>📄 Go to Details</div>
                              <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); alert("Added to queue!"); }}>⏮ Add to Queue</div>
                              <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); handleToggleFavorite(song); }}>❤️ {song.is_favorite ? 'Remove Favorite' : 'Add Favorite'}</div>
                              <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); handleOpenPlaylistModal(song); }}>💽 Add to Playlist</div>
                              <div className="dropdown-item" style={{color: '#ff4d4d'}} onClick={() => { setSelectedIds([song.id]); handleDeleteSelected(); }}>🗑 Delete Song</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {/* --- NEW: PLAYLIST DETAIL VIEW --- */}
        {activeTab === 'playlist-detail' && currentPlaylist && (
          <div className="app-container">
            <div className="sticky-playlist-wrapper" style={{ paddingBottom: '15px' }}>
              <button className="back-btn" onClick={() => navigateTo('playlists')} style={{ padding: '5px 20px', color: '#56CCF2' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                <span style={{ fontSize: '1.1rem', fontWeight: '600', marginLeft: '5px' }}>Back</span>
              </button>
              
              <div className="pd-header-content">
                <div className={`pd-art ${currentPlaylist.isAuto ? 'liked-music-art' : ''}`}>
                  {currentPlaylist.isAuto ? '❤️' : currentPlaylist.cover_url ? (
                    <img src={currentPlaylist.cover_url} alt="cover" className="playlist-list-img" />
                  ) : '💽'}
                </div>
                <div className="pd-info">
                  <h2>{currentPlaylist.name}</h2>
                  <p>{playlistSongs.length} {playlistSongs.length === 1 ? 'Song' : 'Songs'}</p>
                  
                  {/* NEW: Only show the Add button if it's a custom playlist! */}
                  {!currentPlaylist.isAuto && (
                    <button className="add-songs-btn" onClick={() => setShowAddSongsModal(true)}>
                      + Add Songs
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="song-list">
              {playlistSongs.length === 0 ? (
                <div className="empty-state"><h3>It's quiet here...</h3><p>Add some songs to this playlist!</p></div>
              ) : (
                playlistSongs.map((song, index) => {
                  const isThisPlaying = currentSong && currentSong.audio_url === song.audio_url;
                  const uniqueId = `pd-${song.id || index}`;

                  return (
                    <div key={uniqueId} className={`list-item ${isThisPlaying ? 'active' : ''}`}>
                      <div className="list-clickable-area" onClick={() => handlePlayPause(song)}>
                        <div className="drag-handle" style={{ fontSize: '1rem', color: '#444' }}>{index + 1}</div>
                        {song.cover_url ? (<img src={song.cover_url} alt="cover" className="list-art" />) : (<div className="list-art placeholder">🎵</div>)}
                        <div className="list-info">
                          <div className="list-title">{song.title || 'Unknown Audio'}</div>
                          <div className="list-subtitle">
                            {song.artist && <span>{song.artist}</span>}
                            {isThisPlaying && <span className="list-time-counter">{currentTimeFormatted} / {song.duration || '0:00'}</span>}
                          </div>
                          {isThisPlaying && <div className="list-progress-bar"><div className="list-progress-fill" style={{ width: `${progress}%` }}></div></div>}
                        </div>
                      </div>

                      <div className="list-actions">
                        {isThisPlaying && <button className="list-stop-btn" onClick={handleStop}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>}
                        <div className="list-status">
                          {isThisPlaying && isPlaying ? <svg className="playing-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#56CCF2" strokeWidth="2" strokeLinecap="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg> : <span className="duration-text">{song.duration || '--:--'}</span>}
                        </div>

                        <div className="menu-container">
                          <button className="menu-btn" onClick={(e) => toggleMenu(e, uniqueId)}>⋮</button>
                          {activeMenu === uniqueId && (
                            /* Notice we are using menuDirection here so the bug stays squashed! */
                            <div className={`dropdown-menu ${menuDirection === 'up' ? 'dropdown-upward' : ''}`}>
                              <div className="dropdown-item" onClick={(e) => handleGoToDetails(e, song)}>📄 Go to Details</div>
                              <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); handleToggleFavorite(song); }}>❤️ {song.is_favorite ? 'Remove Favorite' : 'Add Favorite'}</div>
                              {/* NEW: Remove from this specific playlist! */}
                              <div className="dropdown-item" style={{color: '#ff4d4d'}} onClick={(e) => handleRemoveFromPlaylist(e, song.id)}>🗑 Remove from Playlist</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
        {/* NEW: THE PLAYLISTS TAB UI (YouTube Music Style) */}
        {activeTab === 'playlists' && (
          <div className="app-container">
            {/* NEW: Sticky Wrapper for Header + Controls */}
            <div className="sticky-playlist-wrapper">
              
              <header className="ocean-header">
                <div className="ocean-glow"></div>
                <h2 className="ocean-title">My Playlists</h2>
              </header>

              <div className="create-standalone-playlist">
                <input 
                  type="text" 
                  placeholder="Name your new playlist..." 
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  className="standalone-playlist-input"
                />
                <button className="create-btn" onClick={handleCreatePlaylist}>Create</button>
              </div>

              <div className="selection-toolbar" style={{ padding: '0 15px', marginTop: '-10px', marginBottom: '10px', justifyContent: 'flex-end' }}>
                <select className="sort-select" value={playlistSortOrder} onChange={(e) => setPlaylistSortOrder(e.target.value)}>
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="az">A-Z (Name)</option>
                  <option value="za">Z-A (Name)</option>
                </select>
              </div>
              
            </div>
            
            <input type="file" accept="image/*" ref={playlistFileInputRef} onChange={handlePlaylistCoverUpload} style={{ display: 'none' }} />

            <div className="playlists-list-view">
              
              {/* --- NEW: PINNED "LIKED MUSIC" AUTO-PLAYLIST --- */}
              <div className="playlist-list-item" onClick={handleOpenLikedMusic}>
                <div className="playlist-list-art liked-music-art">
                  ❤️
                </div>
                <div className="playlist-list-info">
                  <div className="playlist-list-name">Liked Music</div>
                  <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '3px' }}>Auto Playlist</div>
                </div>
                {/* No 3-dot menu here because it cannot be edited or deleted! */}
              </div>

              {/* --- CUSTOM PLAYLISTS --- */}
              {sortedPlaylists.length === 0 && (
                <div className="empty-state" style={{ paddingTop: '30px' }}>
                  <p style={{ color: '#888' }}>You haven't created any custom playlists yet.</p>
                </div>
              )}
              
              {sortedPlaylists.map((playlist, index) => (
                <div key={playlist.id} className="playlist-list-item" onClick={() => handleOpenPlaylist(playlist)}>
                  
                  <div className="playlist-list-art">
                    {isUploading && editingPlaylistId === playlist.id ? (
                      <div className="playlist-art-placeholder spinner-pulse">⏳</div>
                    ) : playlist.cover_url ? (
                      <img src={playlist.cover_url} alt={playlist.name} className="playlist-list-img" />
                    ) : (
                      <div className="playlist-art-placeholder">💽</div>
                    )}
                  </div>
                  
                  <div className="playlist-list-info">
                    <div className="playlist-list-name">{playlist.name}</div>
                  </div>
                    
                  <div className="menu-container">
                    <button className="menu-btn" onClick={(e) => toggleMenu(e, `pl-${playlist.id}`)}>⋮</button>
                    {activeMenu === `pl-${playlist.id}` && (
                      <div className={`dropdown-menu ${index >= sortedPlaylists.length - 3 ? 'dropdown-upward' : ''}`} style={{ right: '0' }}>
                        <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); triggerPlaylistCoverUpload(playlist.id); }}>
                          🖼 {playlist.cover_url ? 'Change Art' : 'Add Art'}
                        </div>
                        {playlist.cover_url && (
                          <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); handleDeletePlaylistCover(e, playlist); }}>
                            🗑 Remove Art
                          </div>
                        )}
                        <div className="dropdown-item" style={{color: '#ff4d4d'}} onClick={(e) => { e.stopPropagation(); setActiveMenu(null); handleDeletePlaylist(playlist); }}>
                          ❌ Delete Playlist
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              ))}
            </div>
          </div>
        )}

        {['queue', 'albums', 'artists'].includes(activeTab) && (
          <div className="empty-state"><h3>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3><p>This architecture is coming soon!</p></div>
        )}
      </div>

      {/* 1. ORIGINAL ADD TO PLAYLIST MODAL */}
      {showPlaylistModal && (
        <div className="modal-overlay" onClick={() => setShowPlaylistModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add to Playlist</h3>
              <button className="close-modal" onClick={() => setShowPlaylistModal(false)}>×</button>
            </div>
            
            <div className="create-playlist-row">
              <input 
                type="text" 
                placeholder="New playlist name..." 
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
              />
              <button className="create-btn" onClick={handleCreatePlaylist}>Create</button>
            </div>

            <div className="playlist-options">
              {playlists.length === 0 ? (
                <p className="no-playlists-text">No playlists yet. Create one above!</p>
              ) : (
                playlists.map(pl => (
                  <div key={pl.id} className="playlist-option-row" onClick={() => handleAddSongToPlaylist(pl.id, songForPlaylist.id)}>
                    <div className="pl-art-mini">
                      {pl.cover_url ? <img src={pl.cover_url} alt="cover" /> : '💽'}
                    </div>
                    <span className="pl-name">{pl.name}</span>
                    <span className="pl-add-icon">+</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. NEW: ADD SONGS TO PLAYLIST MODAL (FROM DETAIL VIEW) */}
      {showAddSongsModal && (
        <div className="modal-overlay" onClick={() => { setShowAddSongsModal(false); setModalSearchTerm(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Songs to {currentPlaylist?.name}</h3>
              <button className="close-modal" onClick={() => { setShowAddSongsModal(false); setModalSearchTerm(''); }}>×</button>
            </div>
            
            <div className="modal-search-container">
              <input
                type="text"
                placeholder="Search songs or artists..."
                className="modal-search-input"
                value={modalSearchTerm}
                onChange={(e) => setModalSearchTerm(e.target.value)}
                autoFocus
              />
            </div>

            <div className="playlist-options" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              {filteredModalSongs.length === 0 ? (
                <p className="no-playlists-text">No songs found.</p>
              ) : (
                filteredModalSongs.map(song => {
                  const isAlreadyAdded = playlistSongs.some(s => s.id === song.id);
                  return (
                    <div key={song.id} className="playlist-option-row" onClick={() => handleAddSongFromDetail(song)} style={{ opacity: isAlreadyAdded ? 0.5 : 1 }}>
                      <div className="pl-art-mini">
                        {song.cover_url ? <img src={song.cover_url} alt="cover" /> : '🎵'}
                      </div>
                      <span className="pl-name">{song.title || 'Unknown Song'}</span>
                      <span className="pl-add-icon">{isAlreadyAdded ? '✓' : '+'}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. GLOBAL UPLOAD TOAST */}
      {isUploading && uploadProgressText && (
        <div className="global-upload-toast">
          <span className="spinner-mini">⏳</span>
          <span className="toast-text">{uploadProgressText}</span>
        </div>
      )}

      {/* 4. FOOTER NAVBAR */}
      <nav className="bottom-footer">
        <button className={`footer-btn ${activeTab === 'list' ? 'active-tab' : ''}`} onClick={(e) => handleFooterNavigation(e, 'list')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
        </button>
        <button className={`footer-btn ${activeTab === 'detail' ? 'active-tab' : ''}`} onClick={(e) => handleFooterNavigation(e, 'detail')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
        </button>
        <button className={`footer-btn ${activeTab === 'queue' ? 'active-tab' : ''}`} onClick={(e) => handleFooterNavigation(e, 'queue')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        </button>
        <button className={`footer-btn ${activeTab === 'albums' ? 'active-tab' : ''}`} onClick={(e) => handleFooterNavigation(e, 'albums')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
        </button>
        <button className={`footer-btn ${activeTab === 'artists' ? 'active-tab' : ''}`} onClick={(e) => handleFooterNavigation(e, 'artists')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        </button>
        <button className={`footer-btn ${activeTab === 'playlists' ? 'active-tab' : ''}`} onClick={(e) => handleFooterNavigation(e, 'playlists')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
        </button>
        <button className={`footer-btn ${showSearch ? 'active-tab' : ''}`} onClick={(e) => { e.stopPropagation(); navigateTo('list'); setShowSearch(!showSearch); }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </button>
      </nav>
    </div>
  )
}

export default App