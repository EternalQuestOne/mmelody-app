import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js'
import './App.css'
import logoImage from './logo.png'
import defaultArtistImage from './Mic-Default.jpg'
import { MediaSession } from '@capgo/capacitor-media-session';

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
  const [credentials, setCredentials] = useState({
    supabaseUrl: localStorage.getItem('supabaseUrl') || '',
    supabaseAnonKey: localStorage.getItem('supabaseAnonKey') || '',
    cloudinaryName: localStorage.getItem('cloudinaryName') || ''
  });

  const isConfigured = localStorage.getItem('supabaseUrl') && localStorage.getItem('supabaseAnonKey') && localStorage.getItem('cloudinaryName');
  
  const [songs, setSongs] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [currentSong, setCurrentSong] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [showStopButton, setShowStopButton] = useState(false);
  const cancelUploadRef = useRef(false);
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
  
  const [menuDirection, setMenuDirection] = useState({ vertical: 'top', horizontal: 'center' });
  
  const [playlists, setPlaylists] = useState([]);
  const [playlistSortOrder, setPlaylistSortOrder] = useState('newest');
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [songForPlaylist, setSongForPlaylist] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const playlistFileInputRef = useRef(null);
  const [editingPlaylistId, setEditingPlaylistId] = useState(null);

  const albumFileInputRef = useRef(null);
  const [editingAlbumName, setEditingAlbumName] = useState(null);
  const [customAlbumArts, setCustomAlbumArts] = useState({});

  const artistFileInputRef = useRef(null);
  const [editingArtistName, setEditingArtistName] = useState(null);
  const [customArtistArts, setCustomArtistArts] = useState({});

  const [currentPlaylist, setCurrentPlaylist] = useState(null);
  const [playlistSongs, setPlaylistSongs] = useState([]);
  const [showAddSongsModal, setShowAddSongsModal] = useState(false); 
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [modalSelectedIds, setModalSelectedIds] = useState([]); 
  const [playlistTargetMode, setPlaylistTargetMode] = useState('single');
  
  // NEW: QUEUE & PLAYBACK STATE
  const [queueContext, setQueueContext] = useState('main'); 
  const [playingFrom, setPlayingFrom] = useState('Library: All Songs');
  const [userQueue, setUserQueue] = useState([]);
  const [toastMessage, setToastMessage] = useState('');

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

  // The Ultimate Android 12 + 15 Lock Screen Sync
  useEffect(() => {
    const syncProfessionalLockScreen = async () => {
      if (!currentSong) return;

      // 1. Prepare the artwork (Force JPG for Android compatibility)
      const optimizedArt = currentSong.cover_url 
        ? currentSong.cover_url.replace('/upload/', '/upload/w_500,h_500,c_fill,f_jpg/') 
        : 'https://images.unsplash.com/photo-1614680376593-902f74a77789?w=500&h=500&fit=crop';

      try {
        // STEP 1: Build the Lock Screen Data
        await MediaSession.setMetadata({
          title: currentSong.title || 'Unknown Title',
          artist: currentSong.artist || 'Unknown Artist',
          album: currentSong.album || 'mMelody',
          artwork: [{ src: optimizedArt, sizes: '512x512', type: 'image/jpeg' }]
        });

        // STEP 2: Explicitly declare Play/Pause State IMMEDIATELY after Metadata
        await MediaSession.setPlaybackState({ 
          playbackState: isPlaying ? 'playing' : 'paused' 
        });

        // STEP 3: Attach the Button Handlers and force immediate UI updates
        await MediaSession.setActionHandler({ action: 'play' }, async () => {
          if (audioRef.current) { 
            audioRef.current.play().catch(e => console.log("Play blocked:", e)); 
            setIsPlaying(true); 
            await MediaSession.setPlaybackState({ playbackState: 'playing' });
          }
        });

        await MediaSession.setActionHandler({ action: 'pause' }, async () => {
          if (audioRef.current) { 
            audioRef.current.pause(); 
            setIsPlaying(false); 
            await MediaSession.setPlaybackState({ playbackState: 'paused' });
          }
        });

        await MediaSession.setActionHandler({ action: 'previoustrack' }, () => handlePreviousSong());
        await MediaSession.setActionHandler({ action: 'nexttrack' }, () => handleNextSong());
        
      } catch (err) {
        console.log("Media Session error:", err);
      }
    };

    syncProfessionalLockScreen();

    // STEP 4: Kill the hidden Web Browser's player so it stops stealing button clicks
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    }

  }, [currentSong, isPlaying, queueContext, playlistSongs, songs, isShuffle, userQueue]);

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
    if (supabase) {
      getSongs();
      getPlaylists();
      getAlbumArts();
      getArtistArts();
    }
  }, [])

  async function getSongs() {
    if (!supabase) return;
    const { data } = await supabase.from('songs').select('*').order('created_at', { ascending: false })
    if (data) setSongs(data)
  }

  async function getPlaylists() {
    if (!supabase) return;
    const { data } = await supabase.from('playlists').select('*').order('created_at', { ascending: false })
    if (data) setPlaylists(data)
  }

  async function getAlbumArts() {
    if (!supabase) return;
    const { data } = await supabase.from('album_arts').select('*');
    if (data) {
      const artsDict = {};
      data.forEach(item => { artsDict[item.name] = item.cover_url; });
      setCustomAlbumArts(artsDict);
    }
  }

  async function getArtistArts() {
    if (!supabase) return;
    const { data } = await supabase.from('artist_arts').select('*');
    if (data) {
      const artsDict = {};
      data.forEach(item => { artsDict[item.name] = item.cover_url; });
      setCustomArtistArts(artsDict);
    }
  }

  const handleRefreshData = async () => {
    setIsUploading(true);
    setUploadProgressText("Syncing cloud data...");
    try {
      await getSongs();
      await getPlaylists();
      await getAlbumArts();
      await getArtistArts();
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
      showToast("Library Synced!");
    }
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleAddToQueue = (e, song) => {
    e.stopPropagation();
    setActiveMenu(null);
    setUserQueue(prev => [...prev, song]);
    showToast(`Added to Queue`);
  };

  const getUpcomingSongs = () => {
    const currentList = queueContext === 'playlist' ? playlistSongs : sortedSongs;
    if (!currentList.length || !currentSong || isShuffle) return [];
    const currentIndex = currentList.findIndex(s => s.audio_url === currentSong.audio_url);
    if (currentIndex === -1 || currentIndex === currentList.length - 1) return [];
    return currentList.slice(currentIndex + 1, currentIndex + 21);
  };

  const handleOpenBulkPlaylistModal = () => {
    setPlaylistTargetMode('multi');
    setShowPlaylistModal(true);
    setActiveMenu(null);
  };

  const handleOpenPlaylistModal = (song) => {
    setSongForPlaylist(song);
    setPlaylistTargetMode('single');
    setShowPlaylistModal(true);
    setActiveMenu(null); 
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    const { data, error } = await supabase.from('playlists').insert([{ name: newPlaylistName }]).select();
    if (data) {
      setPlaylists([data[0], ...playlists]);
      setNewPlaylistName('');
      if (playlistTargetMode === 'multi' && selectedIds.length > 0) {
         await handleAddSongToPlaylist(data[0].id, null);
      } else if (songForPlaylist) {
         await handleAddSongToPlaylist(data[0].id, songForPlaylist.id);
      }
    }
  };

  const handleOpenLikedMusic = () => {
    setCurrentPlaylist({ id: 'liked', name: 'Liked Music', isAuto: true });
    setPlaylistSongs(songs.filter(s => s.is_favorite)); 
    navigateTo('playlist-detail');
  };

  const handleOpenPlaylist = async (playlist) => {
    setCurrentPlaylist(playlist);
    setPlaylistSongs([]); 
    navigateTo('playlist-detail');

    const { data, error } = await supabase
      .from('playlist_songs')
      .select('songs(*)')
      .eq('playlist_id', playlist.id);

    if (data) {
      const extractedSongs = data.map(item => item.songs).filter(Boolean);
      setPlaylistSongs(extractedSongs);
    }
  };

  const handleRemoveFromPlaylist = async (e, songId) => {
    e.stopPropagation();
    if (!currentPlaylist) return;

    if (currentPlaylist.isAuto) {
      const song = songs.find(s => s.id === songId);
      if (song) handleToggleFavorite(song);
      setPlaylistSongs(prev => prev.filter(s => s.id !== songId));
    } else {
      await supabase.from('playlist_songs').delete().match({ playlist_id: currentPlaylist.id, song_id: songId });
      setPlaylistSongs(prev => prev.filter(s => s.id !== songId));
    }
    setActiveMenu(null);
  };

  const toggleModalSelection = (id) => {
    setModalSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleMultiAddSongsFromModal = async () => {
    if (modalSelectedIds.length === 0) return;
    setIsUploading(true);
    setUploadProgressText("Adding songs...");
    
    const newEntries = modalSelectedIds.map(songId => ({
      playlist_id: currentPlaylist.id,
      song_id: songId
    }));

    const { error } = await supabase.from('playlist_songs').upsert(newEntries, { onConflict: 'playlist_id, song_id', ignoreDuplicates: true });
    
    if (!error) {
      const songsToAdd = songs.filter(s => modalSelectedIds.includes(s.id) && !playlistSongs.some(ps => ps.id === s.id));
      setPlaylistSongs(prev => [...prev, ...songsToAdd]);
      setShowAddSongsModal(false);
      setModalSelectedIds([]);
      setModalSearchTerm('');
      showToast(`${songsToAdd.length} songs added!`);
    } else {
      console.error("Error bulk adding:", error);
    }
    setIsUploading(false);
  };

  const handleAddSongToPlaylist = async (playlistId, singleSongId) => {
    if (playlistTargetMode === 'multi') {
      setIsUploading(true);
      setUploadProgressText("Adding to playlist...");
      const newEntries = selectedIds.map(id => ({ playlist_id: playlistId, song_id: id }));
      
      const { error } = await supabase.from('playlist_songs').upsert(newEntries, { onConflict: 'playlist_id, song_id', ignoreDuplicates: true });
      if (!error) {
        showToast(`${selectedIds.length} songs added!`);
        setShowPlaylistModal(false);
        setIsSelectionMode(false);
        setSelectedIds([]);
      }
      setIsUploading(false);
    } else {
      const { error } = await supabase.from('playlist_songs').insert([{ playlist_id: playlistId, song_id: singleSongId }]);
      if (error && error.code !== '23505') {
        console.error("Error adding to playlist:", error);
      } else {
        showToast("Added to playlist!");
        setShowPlaylistModal(false);
        setSongForPlaylist(null);
      }
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
      const imgRes = await fetch(`https://api.cloudinary.com/v1_1/${credentials.cloudinaryName}/image/upload`, { method: 'POST', body: imgFormData });
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

  const triggerAlbumCoverUpload = (albumName) => {
    setEditingAlbumName(albumName);
    albumFileInputRef.current.click();
  };

  const handleAlbumCoverUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !editingAlbumName) return;

    setIsUploading(true);
    setUploadProgressText("Uploading album art...");

    try {
      const oldCoverUrl = customAlbumArts[editingAlbumName];
      if (oldCoverUrl) {
        const oldCoverId = extractPublicId(oldCoverUrl);
        if (oldCoverId) await fetch('/api/deleteImage', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ public_id: oldCoverId })});
      }

      const imgFormData = new FormData();
      imgFormData.append('file', file);
      imgFormData.append('upload_preset', 'mMelody_preset');
      const imgRes = await fetch(`https://api.cloudinary.com/v1_1/${credentials.cloudinaryName}/image/upload`, { method: 'POST', body: imgFormData });
      const newCoverUrl = (await imgRes.json()).secure_url;

      await supabase.from('album_arts').upsert([{ name: editingAlbumName, cover_url: newCoverUrl }]);
      setCustomAlbumArts(prev => ({ ...prev, [editingAlbumName]: newCoverUrl }));

    } catch (err) { console.error("Album cover upload error:", err); } 
    finally {
      setIsUploading(false);
      setUploadProgressText('');
      setEditingAlbumName(null);
      event.target.value = null;
    }
  };

  const handleDeleteAlbumCover = async (e, albumName) => {
    e.stopPropagation();
    if (!window.confirm(`Remove custom art for ${albumName}?`)) return;
    
    setIsUploading(true);
    setUploadProgressText("Removing cover...");

    try {
      const coverUrl = customAlbumArts[albumName];
      if (coverUrl) {
        const coverId = extractPublicId(coverUrl);
        if (coverId) await fetch('/api/deleteImage', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ public_id: coverId })});
      }
      
      await supabase.from('album_arts').delete().eq('name', albumName);
      setCustomAlbumArts(prev => {
        const newDict = { ...prev };
        delete newDict[albumName];
        return newDict;
      });

    } catch (err) { console.error("Cover delete error:", err); } 
    finally { setIsUploading(false); setUploadProgressText(''); }
  };

  const triggerArtistCoverUpload = (artistName) => {
    setEditingArtistName(artistName);
    artistFileInputRef.current.click();
  };

  const handleArtistCoverUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !editingArtistName) return;

    setIsUploading(true);
    setUploadProgressText("Uploading artist photo...");

    try {
      const oldCoverUrl = customArtistArts[editingArtistName];
      if (oldCoverUrl) {
        const oldCoverId = extractPublicId(oldCoverUrl);
        if (oldCoverId) await fetch('/api/deleteImage', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ public_id: oldCoverId })});
      }

      const imgFormData = new FormData();
      imgFormData.append('file', file);
      imgFormData.append('upload_preset', 'mMelody_preset');
      const imgRes = await fetch(`https://api.cloudinary.com/v1_1/${credentials.cloudinaryName}/image/upload`, { method: 'POST', body: imgFormData });
      const newCoverUrl = (await imgRes.json()).secure_url;

      await supabase.from('artist_arts').upsert([{ name: editingArtistName, cover_url: newCoverUrl }]);
      setCustomArtistArts(prev => ({ ...prev, [editingArtistName]: newCoverUrl }));

    } catch (err) { console.error("Artist cover upload error:", err); } 
    finally {
      setIsUploading(false);
      setUploadProgressText('');
      setEditingArtistName(null);
      event.target.value = null;
    }
  };

  const handleDeleteArtistCover = async (e, artistName) => {
    e.stopPropagation();
    if (!window.confirm(`Remove photo for ${artistName}?`)) return;
    
    setIsUploading(true);
    setUploadProgressText("Removing photo...");

    try {
      const coverUrl = customArtistArts[artistName];
      if (coverUrl) {
        const coverId = extractPublicId(coverUrl);
        if (coverId) await fetch('/api/deleteImage', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ public_id: coverId })});
      }
      
      await supabase.from('artist_arts').delete().eq('name', artistName);
      setCustomArtistArts(prev => {
        const newDict = { ...prev };
        delete newDict[artistName];
        return newDict;
      });

    } catch (err) { console.error("Cover delete error:", err); } 
    finally { setIsUploading(false); setUploadProgressText(''); }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Permanently delete ${selectedIds.length} selected song(s)?`)) return;

    setIsUploading(true);
    setShowStopButton(true);
    setUploadProgressText("Deleting from server...");
    cancelUploadRef.current = false;

    const songsToDelete = songs.filter(s => selectedIds.includes(s.id));
    const successfullyDeletedIds = [];

    try {
      for (let i = 0; i < songsToDelete.length; i++) {
        if (cancelUploadRef.current) {
          showToast(`Deletion stopped. Deleted ${successfullyDeletedIds.length} of ${songsToDelete.length}.`);
          break;
        }

        const song = songsToDelete[i];
        setUploadProgressText(`Deleting ${i + 1} of ${songsToDelete.length}...`);

        const audioId = extractPublicId(song.audio_url);
        if (audioId) await fetch('/api/deleteAudio', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ public_id: audioId })});
        
        if (song.cover_url) {
          const coverId = extractPublicId(song.cover_url);
          if (coverId) await fetch('/api/deleteImage', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ public_id: coverId })});
        }
        await supabase.from('songs').delete().eq('id', song.id);
        
        successfullyDeletedIds.push(song.id);
      }

      setSongs(prev => prev.filter(s => !successfullyDeletedIds.includes(s.id)));
      setSelectedIds([]);
      setIsSelectionMode(false);
      
      if (songsToDelete.find(s => s.id === currentSong?.id && successfullyDeletedIds.includes(s.id))) {
        handleStop();
        setCurrentSong(null);
      }

      if (!cancelUploadRef.current) {
         showToast(`Deleted ${successfullyDeletedIds.length} songs successfully.`);
      }
    } catch (err) { console.error("Deletion Error:", err); }
    finally { 
      setIsUploading(false); 
      setShowStopButton(false);
      setUploadProgressText(''); 
    }
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
    }
    setIsPlaying(false);
    setProgress(0);
    setCurrentTimeFormatted('0:00');
  }

  const handleExitApp = () => {
    if (window.confirm("Stop playback and exit mMelody?")) {
      handleStop();
      setCurrentSong(null);
      try { window.close(); } catch (e) { console.log(e); }
      setActiveTab('settings'); 
    }
  };

  const handlePlayPause = (song, context = queueContext) => {
    if (!audioRef.current) return;
    setQueueContext(context);

    if (context === 'main') {
      setPlayingFrom('Library: All Songs');
    } else if (context === 'playlist' && currentPlaylist) {
      let type = 'Playlist';
      if (currentPlaylist.isAlbum) type = 'Album';
      else if (currentPlaylist.isArtist) type = 'Artist';
      else if (currentPlaylist.isGenre) type = 'Genre';
      setPlayingFrom(`${type}: ${currentPlaylist.name}`);
    }

    if (currentSong && currentSong.audio_url === song.audio_url) {
      if (isPlaying) { 
        audioRef.current.pause(); 
        setIsPlaying(false); 
      } else { 
        audioRef.current.play().catch(e => console.error(e)); 
        setIsPlaying(true); 
      }
    } else {
      setProgress(0);
      setCurrentTimeFormatted('0:00');
      setCurrentSong(song);
      setIsPlaying(true);
    }
    setActiveMenu(null); 
  }

  const sortedSongs = [...songs].sort((a, b) => {
    if (sortOrder === 'az') return (a.title || '').localeCompare(b.title || '');
    if (sortOrder === 'za') return (b.title || '').localeCompare(a.title || '');
    if (sortOrder === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
    return new Date(b.created_at) - new Date(a.created_at);
  });
  
  const sortedPlaylists = [...playlists].sort((a, b) => {
    if (playlistSortOrder === 'az') return (a.name || '').localeCompare(b.name || '');
    if (playlistSortOrder === 'za') return (b.name || '').localeCompare(a.name || '');
    if (playlistSortOrder === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
    return new Date(b.created_at) - new Date(a.created_at); 
  });

  const handlePreviousSong = () => {
    const currentList = queueContext === 'playlist' ? playlistSongs : sortedSongs;
    if (!currentList.length || !currentSong) return;
    
    const currentIndex = currentList.findIndex(s => s.audio_url === currentSong.audio_url);
    if (currentIndex > 0) { 
      handlePlayPause(currentList[currentIndex - 1], queueContext); 
    } else { 
      handlePlayPause(currentList[currentList.length - 1], queueContext); 
    }
  }

  const handleNextSong = () => {
    if (userQueue.length > 0) {
      const nextSong = userQueue[0];
      setUserQueue(prev => prev.slice(1));
      setProgress(0);
      setCurrentTimeFormatted('0:00');
      setCurrentSong(nextSong);
      setIsPlaying(true);
      return;
    }

    const currentList = queueContext === 'playlist' ? playlistSongs : sortedSongs;
    if (!currentList.length || !currentSong) return;
    
    if (isShuffle) {
      const randomIndex = Math.floor(Math.random() * currentList.length);
      handlePlayPause(currentList[randomIndex], queueContext);
      return; 
    }
    
    const currentIndex = currentList.findIndex(s => s.audio_url === currentSong.audio_url);
    if (currentIndex < currentList.length - 1) { 
      handlePlayPause(currentList[currentIndex + 1], queueContext); 
    } else { 
      if (queueContext === 'playlist') {
        handleStop(); 
      } else {
        handlePlayPause(currentList[0], queueContext); 
      }
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
      const x = e.clientX;
      const y = e.clientY;
      const w = window.innerWidth;
      const h = window.innerHeight;

      const vertical = y > (h / 2) ? 'bottom' : 'top';
      
      let horizontal = 'center';
      if (x < w / 3) horizontal = 'left';
      else if (x > (w * 2) / 3) horizontal = 'right';

      setMenuDirection({ vertical, horizontal });
      setActiveMenu(id);
    }
  }

  const getDropdownStyle = () => {
    let style = { position: 'absolute', zIndex: 9999, minWidth: '160px' };
    
    style.top = 'auto';
    style.bottom = 'auto';
    style.left = 'auto';
    style.right = 'auto';
    style.transform = 'none';

    if (menuDirection.vertical === 'bottom') {
      style.bottom = '100%'; style.marginBottom = '8px';
    } else {
      style.top = '100%'; style.marginTop = '8px'; 
    }

    if (menuDirection.horizontal === 'left') {
      style.left = '0'; 
    } else if (menuDirection.horizontal === 'right') {
      style.right = '0'; 
    } else {
      style.left = '50%'; style.transform = 'translateX(-50%)'; 
    }
    return style;
  };

  const handleGoToDetails = (e, song) => {
    e.stopPropagation();
    setCurrentSong(song);
    navigateTo('detail');
    setShowMoreDetails(false);
    setActiveMenu(null);
  }

  // FIXED BATCH UPLOAD FUNCTION
  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    
    setIsUploading(true);
    setShowStopButton(true);
    cancelUploadRef.current = false;

    const BATCH_SIZE = 3;
    let processedCount = 0;
    let i = 0;

    // Use a while loop so we have absolute control over the iteration
    while (i < files.length) {
      // 1. The Ultimate Guard: Check before starting ANY new batch
      if (cancelUploadRef.current) {
        showToast(`Upload stopped. Saved ${processedCount} of ${files.length}.`);
        break; 
      }

      const chunk = files.slice(i, i + BATCH_SIZE);
      setUploadProgressText(`Uploading ${i + 1}-${Math.min(i + BATCH_SIZE, files.length)} of ${files.length}...`);

      // We still process in parallel for speed, but wrap it tightly
      await Promise.all(chunk.map(async (file) => {
        // 2. The Mid-Flight Guard: Check before even creating the audio element
        if (cancelUploadRef.current) return;

        return new Promise((resolve) => {
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
                  // 3. The Pre-Network Guard: Check before expensive Cloudinary fetch
                  if (cancelUploadRef.current) { resolve(); return; }

                  const tags = tag.tags;
                  let coverUrl = '';

                  if (tags.picture) {
                    const byteArray = new Uint8Array(tags.picture.data);
                    const blob = new Blob([byteArray], { type: tags.picture.format });
                    const imgFormData = new FormData();
                    imgFormData.append('file', blob);
                    imgFormData.append('upload_preset', 'mMelody_preset');
                    const imgRes = await fetch(`https://api.cloudinary.com/v1_1/${credentials.cloudinaryName}/image/upload`, { method: 'POST', body: imgFormData });
                    coverUrl = (await imgRes.json()).secure_url;
                  }
                  
                  // 4. The Post-Network Guard: Check before database insertion
                  if (cancelUploadRef.current) { resolve(); return; }

                  const audioFormData = new FormData();
                  audioFormData.append('file', file);
                  audioFormData.append('upload_preset', 'mMelody_preset');
                  const audioRes = await fetch(`https://api.cloudinary.com/v1_1/${credentials.cloudinaryName}/video/upload`, { method: 'POST', body: audioFormData });
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

                  // 5. The Absolute Final Check
                  if (!cancelUploadRef.current) {
                    const { data } = await supabase.from('songs').insert([newSong]).select();
                    if (data) {
                      setSongs(prev => [data[0], ...prev]);
                      processedCount++;
                    }
                  }
                } catch (err) { console.error("Upload error:", err); } 
                finally { resolve(); }
              },
              onError: function() { resolve(); }
            });
          });
          
          tempAudio.addEventListener('error', () => resolve());
        });
      }));

      // Only advance the loop index after the chunk has fully resolved
      i += BATCH_SIZE;
    }

    setIsUploading(false);
    setShowStopButton(false);
    setUploadProgressText('');
    
    if (!cancelUploadRef.current) {
       showToast(`${processedCount} songs processed successfully!`);
    }
    
    cancelUploadRef.current = false; 
    if (fileInputRef.current) fileInputRef.current.value = null; 
  }

  const toggleSelection = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  const filteredSongs = sortedSongs.filter(song =>
    (song.title && song.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (song.artist && song.artist.toLowerCase().includes(searchTerm.toLowerCase()))
  )
  
  const filteredModalSongs = songs.filter(song =>
    (song.title && song.title.toLowerCase().includes(modalSearchTerm.toLowerCase())) ||
    (song.artist && song.artist.toLowerCase().includes(modalSearchTerm.toLowerCase()))
  );

  const filteredPlaylists = sortedPlaylists.filter(pl => 
    (pl.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const albumsMap = songs.reduce((acc, song) => {
    const albumName = song.album ? song.album.trim() : 'Unknown Album';
    if (!acc[albumName]) {
      acc[albumName] = { name: albumName, cover_url: customAlbumArts[albumName] || null, songs: [] };
    }
    acc[albumName].songs.push(song);
    return acc;
  }, {});
  const albumsList = Object.values(albumsMap).sort((a, b) => a.name.localeCompare(b.name));
  const filteredAlbums = albumsList.filter(al => (al.name || '').toLowerCase().includes(searchTerm.toLowerCase()));

  const artistsMap = songs.reduce((acc, song) => {
    const artistName = song.artist ? song.artist.trim() : 'Unknown Artist';
    if (!acc[artistName]) {
      acc[artistName] = { name: artistName, cover_url: customArtistArts[artistName] || null, songs: [] };
    }
    acc[artistName].songs.push(song);
    return acc;
  }, {});
  const artistsList = Object.values(artistsMap).sort((a, b) => a.name.localeCompare(b.name));
  const filteredArtists = artistsList.filter(ar => (ar.name || '').toLowerCase().includes(searchTerm.toLowerCase()));

  const genresMap = songs.reduce((acc, song) => {
    let rawGenre = song.genre ? song.genre.trim() : 'Unknown Genre';
    let genreArray = rawGenre.split(/[,/]/).map(g => g.trim()).filter(Boolean);
    if (genreArray.length === 0) genreArray = ['Unknown Genre'];

    genreArray.forEach(genreName => {
      if (!acc[genreName]) {
        acc[genreName] = { name: genreName, songs: [] };
      }
      if (!acc[genreName].songs.find(s => s.id === song.id)) {
        acc[genreName].songs.push(song);
      }
    });
    return acc;
  }, {});
  const genresList = Object.values(genresMap).sort((a, b) => a.name.localeCompare(b.name));
  const filteredGenres = genresList.filter(gn => (gn.name || '').toLowerCase().includes(searchTerm.toLowerCase()));

  const handleOpenAlbum = (album) => {
    setCurrentPlaylist({ id: `album-${album.name}`, name: album.name, isAuto: true, isAlbum: true, cover_url: album.cover_url });
    setPlaylistSongs(album.songs); 
    navigateTo('playlist-detail');
  };

  const handleOpenArtist = (artist) => {
    setCurrentPlaylist({ id: `artist-${artist.name}`, name: artist.name, isAuto: true, isArtist: true, cover_url: artist.cover_url });
    setPlaylistSongs(artist.songs); 
    navigateTo('playlist-detail');
  };

  const handleOpenGenre = (genre) => {
    setCurrentPlaylist({ id: `genre-${genre.name}`, name: genre.name, isAuto: true, isGenre: true });
    setPlaylistSongs(genre.songs); 
    navigateTo('playlist-detail');
  };

  return (
    <div className="app-root" onClick={() => setActiveMenu(null)}> 

      {(!isConfigured || activeTab === 'settings') && (
        <div className="app-container" style={{ padding: '30px 20px', textAlign: 'center', marginTop: '40px' }}>
          <div className="pd-header-content" style={{ flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
            <div className="playlist-art-placeholder" style={{ fontSize: '3rem', width: '80px', height: '80px' }}>⚙️</div>
            <h2>{isConfigured ? 'App Settings' : 'Welcome to mMelody'}</h2>
            <p style={{ color: '#888', marginBottom: '20px', fontSize: '0.9rem' }}>
              {isConfigured 
                ? 'Update your personal cloud connection below.' 
                : 'To keep your music 100% private and free, please enter your personal database keys.'}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '400px', margin: '0 auto' }}>
            <input 
              type="text" placeholder="Supabase Project URL" className="standalone-playlist-input"
              value={credentials.supabaseUrl}
              onChange={(e) => setCredentials({...credentials, supabaseUrl: e.target.value})}
            />
            <input 
              type="password" placeholder="Supabase Anon Key" className="standalone-playlist-input"
              value={credentials.supabaseAnonKey}
              onChange={(e) => setCredentials({...credentials, supabaseAnonKey: e.target.value})}
            />
            <input 
              type="text" placeholder="Cloudinary Cloud Name" className="standalone-playlist-input"
              value={credentials.cloudinaryName}
              onChange={(e) => setCredentials({...credentials, cloudinaryName: e.target.value})}
            />
            
            <button className="upload-btn" style={{ marginTop: '20px' }} onClick={() => {
              if (!credentials.supabaseUrl || !credentials.supabaseAnonKey || !credentials.cloudinaryName) {
                alert("Please fill in all three fields!");
                return;
              }
              let fixedUrl = credentials.supabaseUrl.trim();
              if (!fixedUrl.startsWith('http')) fixedUrl = 'https://' + fixedUrl;

              localStorage.setItem('supabaseUrl', fixedUrl);
              localStorage.setItem('supabaseAnonKey', credentials.supabaseAnonKey.trim());
              localStorage.setItem('cloudinaryName', credentials.cloudinaryName.trim());
              alert("Settings Saved! Restarting to connect to your database...");
              window.location.reload(); 
            }}>
              Save & Connect
            </button>
            
            {isConfigured && (
              <button className="create-btn" style={{ background: 'transparent', border: '1px solid #444' }} onClick={() => navigateTo('list')}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {isConfigured && (
        <> 
          <audio 
            ref={audioRef} 
            src={currentSong?.audio_url || ''}
            autoPlay={isPlaying}
            onEnded={handleNextSong} 
            onTimeUpdate={handleTimeUpdate}
          />
          {activeMenu && (
            <div className="menu-backdrop" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); }}></div>
          )}

          <div className="main-content-area">
            {/* DETAIL VIEW */}
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

                  <div style={{ textAlign: 'center', color: '#888', fontSize: '0.85rem', marginTop: '-5px', marginBottom: '15px', fontWeight: '500', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#56CCF2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
                    Playing from {playingFrom}
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

                    <button className="detail-inter-btn" onClick={() => { navigateTo('queue'); setShowMoreDetails(false); }} title="View Queue">
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
                          <div className="lyrics-box"><p style={{color: '#888', fontStyle: 'italic'}}>Lyrics not available.</p></div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="empty-state"><h3>No song selected</h3><p>Play a song from the list view to see details.</p></div>
              )
            )}

            {/* LIST VIEW */}
            {activeTab === 'list' && (
              <div className="app-container">
                <header className="header attractive-header" style={{ position: 'relative', zIndex: 100, overflow: 'visible' }}>
                  <div className="header-bg-glow"></div>
                  <div className="brand-header-wrapper">
                      <img src={logoImage} alt="mMelody logo" className="app-logo" />
                      <h2>mMelody</h2>
                  </div>
                  
                  <div className="upload-container" style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    {!isUploading ? (
                      <button className="upload-btn" onClick={() => fileInputRef.current.click()}>
                        Upload Music
                      </button>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.05)', padding: '5px 15px', borderRadius: '25px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <span className="spinner-mini">⏳</span>
                        <span style={{ fontSize: '0.8rem', color: '#ccc' }}>{uploadProgressText}</span>
                        {showStopButton && (
                          <button 
                            onClick={() => { cancelUploadRef.current = true; showToast("Cancelling..."); }} 
                            style={{ background: '#ff4d4d', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '15px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            STOP
                          </button>
                        )}
                      </div>
                    )}
                    <input type="file" accept="audio/mpeg, audio/mp3" multiple ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
                  </div>

                  <div className="selection-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 999 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button className="action-icon-btn" onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedIds([]); }}>
                        {isSelectionMode ? 'Cancel' : 'Select'}
                      </button>

                      {!isSelectionMode && (
                        <span style={{ fontSize: '0.85rem', color: '#888', fontWeight: '600', marginLeft: '5px' }}>
                          {searchTerm ? `${filteredSongs.length} found` : `${songs.length} songs`}
                        </span>
                      )}
                      
                      {isSelectionMode && selectedIds.length > 0 && (
                        <div className="menu-container" style={{ position: 'relative' }}>
                          <button className="action-icon-btn" style={{ background: 'rgba(86, 204, 242, 0.15)', color: '#56CCF2', border: '1px solid rgba(86, 204, 242, 0.4)', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => toggleMenu(e, 'bulk-actions')}>
                            Actions ({selectedIds.length}) <span style={{ fontSize: '0.8rem' }}>▼</span>
                          </button>
                          {activeMenu === 'bulk-actions' && (
                            <div className="dropdown-menu" style={{ ...getDropdownStyle(), position: 'absolute', right: 'auto', left: 0, transform: 'none', top: '100%', marginTop: '8px', zIndex: 999999 }}>
                              <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); handleOpenBulkPlaylistModal(); }}>
                                💽 Add to Playlist
                              </div>
                              <div className="dropdown-item" style={{color: '#ff4d4d'}} onClick={(e) => { e.stopPropagation(); setActiveMenu(null); handleDeleteSelected(); }}>
                                🗑 Delete Selected
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {!isSelectionMode && (
                      <select className="sort-select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="az">A-Z (Title)</option>
                        <option value="za">Z-A (Title)</option>
                      </select>
                    )}
                  </div>

                  {showSearch && (
                    <div className="search-input-wrapper animate-search" style={{ position: 'relative', width: '100%', marginBottom: '10px' }}>
                      <input
                        type="text"
                        placeholder="Search songs or artists..."
                        className="search-bar"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoFocus
                        style={{ marginBottom: 0, paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
                      />
                      {searchTerm && (
                        <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#888', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                      )}
                    </div>
                  )}
                </header>
                
                <div className="song-list">
                  {filteredSongs.map((song, index) => {
                    const isThisPlaying = currentSong && currentSong.audio_url === song.audio_url;
                    const uniqueId = song.id || index;
                    const isSelected = selectedIds.includes(song.id); 

                    return (
                      <div key={uniqueId} className={`list-item ${isThisPlaying ? 'active' : ''} ${isSelected ? 'selected-row' : ''}`}>
                        <div className="list-clickable-area" onClick={() => isSelectionMode ? toggleSelection(song.id) : handlePlayPause(song, 'main')}>
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
                                <div className="dropdown-menu" style={getDropdownStyle()}>
                                  <div className="dropdown-item" onClick={(e) => handleGoToDetails(e, song)}>📄 Go to Details</div>
                                  <div className="dropdown-item" onClick={(e) => handleAddToQueue(e, song)}>⏮ Add to Queue</div>
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

            {/* PLAYLIST DETAIL VIEW */}
            {activeTab === 'playlist-detail' && currentPlaylist && (
              <div className="app-container">
                <div className="sticky-playlist-wrapper" style={{ paddingBottom: '15px' }}>
                  
                  <button className="back-btn" onClick={() => { 
                      const targetTab = currentPlaylist.isAlbum ? 'albums' : currentPlaylist.isArtist ? 'artists' : currentPlaylist.isGenre ? 'genres' : 'playlists';
                      setCurrentPlaylist(null); 
                      navigateTo(targetTab); 
                    }} style={{ padding: '5px 20px', color: '#56CCF2' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    <span style={{ fontSize: '1.1rem', fontWeight: '600', marginLeft: '5px' }}>Back</span>
                  </button>
                  
                  <div className="pd-header-content">
                    <div className={`pd-art ${currentPlaylist.isAuto ? 'liked-music-art' : ''}`} style={currentPlaylist.isArtist ? { borderRadius: '50%' } : {}}>
                      {currentPlaylist.isAuto && !currentPlaylist.isAlbum && !currentPlaylist.isArtist && !currentPlaylist.isGenre ? '❤️' : currentPlaylist.cover_url ? (
                        <img src={currentPlaylist.cover_url} alt="cover" className="playlist-list-img" />
                      ) : currentPlaylist.isArtist ? (
                        <svg width="40%" height="40%" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                      ) : '💽'}
                    </div>
                    <div className="pd-info">
                      <h2>{currentPlaylist.name}</h2>
                      <p>{playlistSongs.length} {playlistSongs.length === 1 ? 'Song' : 'Songs'}</p>
                      
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
                          <div className="list-clickable-area" onClick={() => handlePlayPause(song, 'playlist')}>
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
                                <div className="dropdown-menu" style={getDropdownStyle()}>
                                  <div className="dropdown-item" onClick={(e) => handleGoToDetails(e, song)}>📄 Go to Details</div>
                                  <div className="dropdown-item" onClick={(e) => handleAddToQueue(e, song)}>⏮ Add to Queue</div>
                                  <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); handleToggleFavorite(song); }}>❤️ {song.is_favorite ? 'Remove Favorite' : 'Add Favorite'}</div>
                                  {(!currentPlaylist.isAuto && !currentPlaylist.isAlbum && !currentPlaylist.isArtist && !currentPlaylist.isGenre) && (
                                    <div className="dropdown-item" style={{color: '#ff4d4d'}} onClick={(e) => handleRemoveFromPlaylist(e, song.id)}>🗑 Remove from Playlist</div>
                                  )}
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

            {/* PLAYLISTS VIEW */}
            {activeTab === 'playlists' && (
              <div className="app-container">
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

                  <div className="selection-toolbar" style={{ padding: '0 15px', marginTop: '-10px', marginBottom: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                    <select className="sort-select" value={playlistSortOrder} onChange={(e) => setPlaylistSortOrder(e.target.value)}>
                      <option value="newest">Newest First</option>
                      <option value="oldest">Oldest First</option>
                      <option value="az">A-Z (Name)</option>
                      <option value="za">Z-A (Name)</option>
                    </select>
                  </div>
                  
                  {showSearch && (
                    <div style={{ padding: '0 15px 10px 15px', position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Search playlists..."
                        className="search-bar animate-search"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoFocus
                        style={{ marginBottom: 0, paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
                      />
                      {searchTerm && (
                        <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: '25px', top: 'calc(50% - 5px)', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#888', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                      )}
                    </div>
                  )}
                </div>
                
                <input type="file" accept="image/*" ref={playlistFileInputRef} onChange={handlePlaylistCoverUpload} style={{ display: 'none' }} />

                <div className="playlists-list-view">
                  <div className="playlist-list-item" onClick={handleOpenLikedMusic}>
                    <div className="playlist-list-art liked-music-art">❤️</div>
                    <div className="playlist-list-info">
                      <div className="playlist-list-name">Liked Music</div>
                      <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '3px' }}>Auto Playlist</div>
                    </div>
                  </div>

                  {filteredPlaylists.length === 0 && (
                    <div className="empty-state" style={{ paddingTop: '30px' }}>
                      <p style={{ color: '#888' }}>No custom playlists found.</p>
                    </div>
                  )}
                  
                  {filteredPlaylists.map((playlist, index) => (
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
                          <div className="dropdown-menu" style={getDropdownStyle()}>
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

            {/* ALBUMS VIEW */}
            {activeTab === 'albums' && (
              <div className="app-container">
                <div className="sticky-playlist-wrapper">
                  <header className="ocean-header">
                    <div className="ocean-glow"></div>
                    <h2 className="ocean-title">Albums</h2>
                  </header>
                  {showSearch && (
                    <div style={{ padding: '0 15px 10px 15px', position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Search albums..."
                        className="search-bar animate-search"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoFocus
                        style={{ marginBottom: 0, paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
                      />
                      {searchTerm && (
                        <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: '25px', top: 'calc(50% - 5px)', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#888', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                      )}
                    </div>
                  )}
                </div>
                
                <input type="file" accept="image/*" ref={albumFileInputRef} onChange={handleAlbumCoverUpload} style={{ display: 'none' }} />

                {filteredAlbums.length === 0 ? (
                  <div className="empty-state"><p>No albums found.</p></div>
                ) : (
                  <div className="tag-grid" style={{ padding: '15px', gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))', gap: '12px' }}>
                    {filteredAlbums.map((album, index) => (
                      <div key={`al-${index}`} style={{ display: 'flex', flexDirection: 'column', position: 'relative', background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        
                        <div style={{ position: 'absolute', top: '4px', right: '4px', zIndex: 10 }}>
                          <button className="menu-btn" style={{ background: 'rgba(0,0,0,0.75)', color: '#fff', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0', border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }} onClick={(e) => toggleMenu(e, `al-${album.name}`)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                          </button>
                        </div>

                        {activeMenu === `al-${album.name}` && (
                          <div className="dropdown-menu" style={getDropdownStyle()}>
                            <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); triggerAlbumCoverUpload(album.name); }}>
                              🖼 {customAlbumArts[album.name] ? 'Change Art' : 'Add Art'}
                            </div>
                            {customAlbumArts[album.name] && (
                              <div className="dropdown-item" style={{color: '#ff4d4d'}} onClick={(e) => { e.stopPropagation(); setActiveMenu(null); handleDeleteAlbumCover(e, album.name); }}>
                                🗑 Remove Art
                              </div>
                            )}
                          </div>
                        )}

                        <div onClick={() => handleOpenAlbum(album)} style={{ cursor: 'pointer' }}>
                          <div style={{ width: '100%', aspectRatio: '1/1', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px', backgroundColor: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {isUploading && editingAlbumName === album.name ? (
                              <span className="spinner-pulse" style={{ fontSize: '1.2rem' }}>⏳</span>
                            ) : album.cover_url ? (
                              <img src={album.cover_url} alt={album.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle><circle cx="12" cy="12" r="1"></circle></svg>
                            )}
                          </div>
                          <div style={{ fontWeight: '600', fontSize: '0.75rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', width: '100%', textAlign: 'center', lineHeight: '1.2' }}>
                            {album.name}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#888', marginTop: '2px' }}>
                            {album.songs.length} {album.songs.length === 1 ? 'song' : 'songs'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ARTISTS VIEW */}
            {activeTab === 'artists' && (
              <div className="app-container">
                <div className="sticky-playlist-wrapper">
                  <header className="ocean-header">
                    <div className="ocean-glow"></div>
                    <h2 className="ocean-title">Artists</h2>
                  </header>
                  {showSearch && (
                    <div style={{ padding: '0 15px 10px 15px', position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Search artists..."
                        className="search-bar animate-search"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoFocus
                        style={{ marginBottom: 0, paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
                      />
                      {searchTerm && (
                        <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: '25px', top: 'calc(50% - 5px)', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#888', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                      )}
                    </div>
                  )}
                </div>
                
                <input type="file" accept="image/*" ref={artistFileInputRef} onChange={handleArtistCoverUpload} style={{ display: 'none' }} />

                {filteredArtists.length === 0 ? (
                  <div className="empty-state"><p>No artists found.</p></div>
                ) : (
                  <div className="tag-grid" style={{ padding: '15px', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '15px' }}>
                    {filteredArtists.map((artist, index) => (
                      <div key={`ar-${index}`} style={{ display: 'flex', flexDirection: 'column', position: 'relative', alignItems: 'center', background: 'transparent', padding: '5px' }}>
                        
                        <div style={{ position: 'absolute', top: '0px', right: '0px', zIndex: 10 }}>
                          <button className="menu-btn" style={{ background: 'rgba(0,0,0,0.75)', color: '#fff', width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0', border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }} onClick={(e) => toggleMenu(e, `ar-${artist.name}`)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                          </button>
                        </div>

                        {activeMenu === `ar-${artist.name}` && (
                          <div className="dropdown-menu" style={getDropdownStyle()}>
                            <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); triggerArtistCoverUpload(artist.name); }}>
                              🖼 {customArtistArts[artist.name] ? 'Change Photo' : 'Add Photo'}
                            </div>
                            {customArtistArts[artist.name] && (
                              <div className="dropdown-item" style={{color: '#ff4d4d'}} onClick={(e) => { e.stopPropagation(); setActiveMenu(null); handleDeleteArtistCover(e, artist.name); }}>
                                🗑 Remove Photo
                              </div>
                            )}
                          </div>
                        )}

                        <div onClick={() => handleOpenArtist(artist)} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                          <div style={{ width: '100%', aspectRatio: '1/1', borderRadius: '50%', overflow: 'hidden', marginBottom: '8px', backgroundColor: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,255,255,0.05)', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
                            {isUploading && editingArtistName === artist.name ? (
                              <span className="spinner-pulse" style={{ fontSize: '1.2rem' }}>⏳</span>
                            ) : artist.cover_url ? (
                              <img src={artist.cover_url} alt={artist.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <svg width="40%" height="40%" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                            )}
                          </div>
                          <div style={{ fontWeight: '600', fontSize: '0.75rem', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', width: '100%', textAlign: 'center', lineHeight: '1.2' }}>
                            {artist.name}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#888', marginTop: '2px', textAlign: 'center' }}>
                            {artist.songs.length} {artist.songs.length === 1 ? 'song' : 'songs'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* GENRES VIEW */}
            {activeTab === 'genres' && (
              <div className="app-container">
                <div className="sticky-playlist-wrapper">
                  <header className="ocean-header">
                    <div className="ocean-glow"></div>
                    <h2 className="ocean-title">Genres</h2>
                  </header>
                  {showSearch && (
                    <div style={{ padding: '0 15px 10px 15px', position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Search genres..."
                        className="search-bar animate-search"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoFocus
                        style={{ marginBottom: 0, paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
                      />
                      {searchTerm && (
                        <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: '25px', top: 'calc(50% - 5px)', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#888', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                      )}
                    </div>
                  )}
                </div>

                {filteredGenres.length === 0 ? (
                  <div className="empty-state"><p>No genres found.</p></div>
                ) : (
                  <div className="tag-grid" style={{ padding: '15px', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '12px' }}>
                    {filteredGenres.map((genre, index) => (
                      <div key={`gn-${index}`} onClick={() => handleOpenGenre(genre)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'linear-gradient(135deg, rgba(86, 204, 242, 0.15), rgba(47, 128, 237, 0.15))', padding: '10px', borderRadius: '12px', border: '1px solid rgba(86, 204, 242, 0.3)', boxShadow: '0 4px 10px rgba(0,0,0,0.2)', aspectRatio: '1/1', textAlign: 'center' }}>
                        <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#fff', marginBottom: '6px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {genre.name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#56CCF2' }}>
                          {genre.songs.length} {genre.songs.length === 1 ? 'song' : 'songs'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* QUEUE VIEW (NEW!) */}
            {activeTab === 'queue' && (
              <div className="app-container">
                <div className="sticky-playlist-wrapper">
                  <header className="ocean-header">
                    <div className="ocean-glow"></div>
                    <h2 className="ocean-title">Queue</h2>
                  </header>
                </div>

                <div className="song-list" style={{ paddingBottom: '20px' }}>
                  
                  {/* NOW PLAYING */}
                  {currentSong && (
                    <div style={{ padding: '0 15px 10px' }}>
                        <span style={{ color: '#56CCF2', fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Now Playing</span>
                    </div>
                  )}
                  {currentSong && (
                    <div className="list-item active" style={{ marginBottom: '25px', borderRadius: '8px', margin: '0 15px 25px 15px', border: '1px solid rgba(86, 204, 242, 0.3)' }} onClick={() => navigateTo('detail')}>
                        {currentSong.cover_url ? (<img src={currentSong.cover_url} alt="cover" className="list-art" />) : (<div className="list-art placeholder">🎵</div>)}
                        <div className="list-info">
                          <div className="list-title">{currentSong.title || 'Unknown Audio'}</div>
                          <div className="list-subtitle">
                            {currentSong.artist && <span>{currentSong.artist}</span>}
                          </div>
                        </div>
                        <div className="list-status">
                          {isPlaying ? <svg className="playing-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#56CCF2" strokeWidth="2" strokeLinecap="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg> : null}
                        </div>
                    </div>
                  )}

                  {/* UP NEXT HEADER */}
                  <div style={{ padding: '0 15px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#888', fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      {userQueue.length > 0 ? `Next In Queue (${userQueue.length})` : `Next From: ${playingFrom}`}
                    </span>
                    {userQueue.length > 0 && (
                      <button onClick={() => setUserQueue([])} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}>Clear Queue</button>
                    )}
                  </div>

                  {/* QUEUE LIST */}
                  {userQueue.length > 0 ? (
                    userQueue.map((song, index) => {
                      const uniqueId = `uq-${song.id || index}-${index}`;
                      return (
                        <div key={uniqueId} className="list-item">
                            <div className="list-clickable-area" onClick={() => {
                                const newQueue = userQueue.slice(index + 1);
                                setUserQueue(newQueue);
                                setProgress(0);
                                setCurrentTimeFormatted('0:00');
                                setCurrentSong(song);
                                setIsPlaying(true);
                            }}>
                              <div className="drag-handle" style={{ fontSize: '1rem', color: '#444' }}>{index + 1}</div>
                              {song.cover_url ? (<img src={song.cover_url} alt="cover" className="list-art" />) : (<div className="list-art placeholder">🎵</div>)}
                              <div className="list-info">
                                <div className="list-title">{song.title || 'Unknown Audio'}</div>
                                <div className="list-subtitle">{song.artist && <span>{song.artist}</span>}</div>
                              </div>
                            </div>
                            <div className="list-actions">
                              <button className="list-stop-btn" onClick={(e) => {
                                e.stopPropagation();
                                setUserQueue(prev => prev.filter((_, i) => i !== index));
                              }}>
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                              </button>
                            </div>
                        </div>
                      )
                    })
                  ) : (
                    // RENDER UPCOMING FROM CONTEXT
                    getUpcomingSongs().length === 0 ? (
                      <div className="empty-state">
                        {isShuffle ? <p>Shuffle is on! Next track is a surprise 🎲</p> : <p>No more songs coming up.</p>}
                      </div>
                    ) : (
                      getUpcomingSongs().map((song, index) => {
                        const uniqueId = `nq-${song.id || index}-${index}`;
                        return (
                            <div key={uniqueId} className="list-item" onClick={() => handlePlayPause(song, queueContext)}>
                              <div className="list-clickable-area">
                                  <div className="drag-handle" style={{ fontSize: '1rem', color: '#444' }}>{index + 1}</div>
                                  {song.cover_url ? (<img src={song.cover_url} alt="cover" className="list-art" />) : (<div className="list-art placeholder">🎵</div>)}
                                  <div className="list-info">
                                    <div className="list-title">{song.title || 'Unknown Audio'}</div>
                                    <div className="list-subtitle">{song.artist && <span>{song.artist}</span>}</div>
                                  </div>
                              </div>
                            </div>
                        )
                      })
                    )
                  )}
                </div>
              </div>
            )}

          </div>

          {/* ADD TO PLAYLIST MODAL */}
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
                      <div key={pl.id} className="playlist-option-row" onClick={() => handleAddSongToPlaylist(pl.id, songForPlaylist?.id)}>
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

          {/* ADD SONGS TO PLAYLIST MODAL */}
          {showAddSongsModal && (
            <div className="modal-overlay" onClick={() => { setShowAddSongsModal(false); setModalSearchTerm(''); setModalSelectedIds([]); }}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Add Songs to {currentPlaylist?.name}</h3>
                  <button className="close-modal" onClick={() => { setShowAddSongsModal(false); setModalSearchTerm(''); setModalSelectedIds([]); }}>×</button>
                </div>
                
                <div className="modal-search-container" style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search songs or artists..."
                    className="modal-search-input"
                    value={modalSearchTerm}
                    onChange={(e) => setModalSearchTerm(e.target.value)}
                    autoFocus
                    style={{ paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
                  />
                  {modalSearchTerm && (
                    <button onClick={() => setModalSearchTerm('')} style={{ position: 'absolute', right: '25px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#888', fontSize: '1.2rem', cursor: 'pointer', marginTop: '2px' }}>✕</button>
                  )}
                </div>

                <div className="playlist-options" style={{ maxHeight: '45vh', overflowY: 'auto', marginBottom: '15px' }}>
                  {filteredModalSongs.length === 0 ? (
                    <p className="no-playlists-text">No songs found.</p>
                  ) : (
                    filteredModalSongs.map(song => {
                      const isAlreadyAdded = playlistSongs.some(s => s.id === song.id);
                      return (
                        <div key={song.id} className="playlist-option-row" onClick={() => { if (!isAlreadyAdded) toggleModalSelection(song.id); }} style={{ opacity: isAlreadyAdded ? 0.5 : 1, cursor: isAlreadyAdded ? 'default' : 'pointer' }}>
                          <div className={`custom-checkbox ${modalSelectedIds.includes(song.id) ? 'checked' : ''}`} style={{ marginRight: '12px' }}></div>
                          <div className="pl-art-mini">
                            {song.cover_url ? <img src={song.cover_url} alt="cover" /> : '🎵'}
                          </div>
                          <span className="pl-name">{song.title || 'Unknown Song'}</span>
                          <span className="pl-add-icon">{isAlreadyAdded ? '✓' : ''}</span>
                        </div>
                      );
                    })
                  )}
                </div>

                {modalSelectedIds.length > 0 && (
                  <button className="upload-btn" style={{ width: '100%' }} onClick={handleMultiAddSongsFromModal}>
                    Add {modalSelectedIds.length} Song{modalSelectedIds.length > 1 ? 's' : ''}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* GLOBAL TOAST (UPLOADS & QUEUE) */}
          {(isUploading || toastMessage) && (
            <div className="global-upload-toast" style={{ bottom: '90px' }}>
              {isUploading && <span className="spinner-mini">⏳</span>}
              {!isUploading && <span>✅</span>}
              <span className="toast-text">{isUploading ? uploadProgressText : toastMessage}</span>
            </div>
          )}

          {/* FOOTER NAVBAR */}
          <nav className="bottom-footer">
            
            <button className={`footer-btn ${activeTab === 'list' ? 'active-tab' : ''}`} onClick={(e) => handleFooterNavigation(e, 'list')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>
            </button>

            <button className={`footer-btn ${activeTab === 'detail' ? 'active-tab' : ''}`} onClick={(e) => handleFooterNavigation(e, 'detail')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
            </button>

            <button className={`footer-btn ${activeTab === 'queue' ? 'active-tab' : ''}`} onClick={(e) => handleFooterNavigation(e, 'queue')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 5v10a3 3 0 1 0 3 3V8h3V5h-6z"></path><line x1="3" y1="6" x2="13" y2="6"></line><line x1="3" y1="12" x2="13" y2="12"></line><line x1="3" y1="18" x2="13" y2="18"></line></svg>
            </button>

            <button className={`footer-btn ${(activeTab === 'playlists' || (activeTab === 'playlist-detail' && currentPlaylist && !currentPlaylist.isAlbum && !currentPlaylist.isArtist && !currentPlaylist.isGenre)) ? 'active-tab' : ''}`} onClick={(e) => handleFooterNavigation(e, (currentPlaylist && !currentPlaylist.isAlbum && !currentPlaylist.isArtist && !currentPlaylist.isGenre) ? 'playlist-detail' : 'playlists')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8v10a2 2 0 0 0 2 2h10"></path>
                <rect x="8" y="4" width="12" height="12" rx="2" ry="2"></rect>
                <path d="M14.5 12.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"></path>
                <path d="M14.5 12.5V7l2.5 1"></path>
              </svg>
            </button>

            <button className={`footer-btn ${(activeTab === 'artists' || (activeTab === 'playlist-detail' && currentPlaylist && currentPlaylist.isArtist)) ? 'active-tab' : ''}`} onClick={(e) => handleFooterNavigation(e, (currentPlaylist && currentPlaylist.isArtist) ? 'playlist-detail' : 'artists')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </button>

            <button className={`footer-btn ${(activeTab === 'genres' || (activeTab === 'playlist-detail' && currentPlaylist && currentPlaylist.isGenre)) ? 'active-tab' : ''}`} onClick={(e) => handleFooterNavigation(e, (currentPlaylist && currentPlaylist.isGenre) ? 'playlist-detail' : 'genres')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
            </button>

            <button className={`footer-btn ${(activeTab === 'albums' || (activeTab === 'playlist-detail' && currentPlaylist && currentPlaylist.isAlbum)) ? 'active-tab' : ''}`} onClick={(e) => handleFooterNavigation(e, (currentPlaylist && currentPlaylist.isAlbum) ? 'playlist-detail' : 'albums')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
            </button>

            <button className={`footer-btn ${showSearch ? 'active-tab' : ''}`} onClick={(e) => { 
              e.stopPropagation(); 
              if (['detail', 'queue', 'settings', 'playlist-detail'].includes(activeTab)) {
                navigateTo('list');
              }
              setShowSearch(!showSearch); 
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </button>

            <div className="menu-container" style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
              <button className="footer-btn" onClick={(e) => toggleMenu(e, 'footer-menu')}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
              </button>

              {activeMenu === 'footer-menu' && (
                <div className="dropdown-menu" style={{ ...getDropdownStyle(), right: '10px', bottom: '60px', left: 'auto', top: 'auto', minWidth: '160px', padding: '10px 0', transform: 'none' }}>
                  
                  {/* NEW: Dedicated Cloud Sync Button! */}
                  <div className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 15px' }} onClick={(e) => { e.stopPropagation(); setActiveMenu(null); handleRefreshData(); }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#56CCF2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10"></polyline>
                      <polyline points="1 20 1 14 7 14"></polyline>
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                    </svg>
                    <span style={{ color: '#fff' }}>Sync Cloud</span>
                  </div>

                  <div className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 15px' }} onClick={(e) => { e.stopPropagation(); handleFooterNavigation(e, 'settings'); }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"></circle>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    <span>Settings</span>
                  </div>

                  <div className="dropdown-item" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 15px' }} onClick={(e) => { e.stopPropagation(); setActiveMenu(null); handleExitApp(); }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff4d4d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                      <line x1="12" y1="2" x2="12" y2="12"></line>
                    </svg>
                    <span style={{ color: '#fff' }}>Close App</span>
                  </div>

                </div>
              )}
            </div>

          </nav>
        </>
      )}
    </div>
  )
}

export default App