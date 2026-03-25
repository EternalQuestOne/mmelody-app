import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js'
import './App.css'

// ⚠️ CHANGE THIS TO YOUR ACTUAL CLOUDINARY CLOUD NAME!
const CLOUDINARY_CLOUD_NAME = 'dexx3rdkl'; 

function App() {
  const [songs, setSongs] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [currentSong, setCurrentSong] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  
  const audioRef = useRef(null)
  const fileInputRef = useRef(null)

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

  // --- NEW: THE AUTOMATED UPLOAD ENGINE ---
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);

    // 1. Read the MP3 Tags
    jsmediatags.read(file, {
      onSuccess: async function(tag) {
        try {
          const tags = tag.tags;
          let coverUrl = '';

          // 2. Extract and Upload Cover Art
          if (tags.picture) {
            const byteArray = new Uint8Array(tags.picture.data);
            const blob = new Blob([byteArray], { type: tags.picture.format });
            
            const imgFormData = new FormData();
            imgFormData.append('file', blob);
            imgFormData.append('upload_preset', 'mmelody_preset');

            const imgRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
              method: 'POST',
              body: imgFormData
            });
            const imgData = await imgRes.json();
            coverUrl = imgData.secure_url;
          }

          // 3. Upload the Audio File
          const audioFormData = new FormData();
          audioFormData.append('file', file);
          audioFormData.append('upload_preset', 'mmelody_preset');

          const audioRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, {
            method: 'POST',
            body: audioFormData
          });
          const audioData = await audioRes.json();
          const audioUrl = audioData.secure_url;

          // 4. Save Everything to Supabase
          const newSong = {
            title: tags.title || file.name.replace('.mp3', ''),
            artist: tags.artist || '',
            album: tags.album || '',
            genre: tags.genre || '',
            release_year: tags.year || '',
            comment: tags.comment ? tags.comment.text : '',
            composer: '', // Optional: ID3 tag mapping for these can be complex
            lyricist: '', 
            audio_url: audioUrl,
            cover_url: coverUrl
          };

          const { data, error } = await supabase.from('songs').insert([newSong]).select();
          
          if (data) {
            setSongs([data[0], ...songs]); // Add new song to the top of the list
          }
        } catch (err) {
          console.error("Upload error:", err);
          alert("Error uploading file to Cloudinary.");
        } finally {
          setIsUploading(false);
          event.target.value = null; // Reset the input
        }
      },
      onError: function(error) {
        console.error("Tag extraction error:", error);
        setIsUploading(false);
        alert("Could not read MP3 tags. Make sure it's a valid MP3 file!");
      }
    });
  };

  const filteredSongs = songs.filter(song =>
    (song.title && song.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (song.artist && song.artist.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <div className="app-container">
      <header className="header">
        <h2>Mmelody</h2>
        
        {/* NEW: Upload Button Area */}
        <div className="upload-container">
          <button 
            className="upload-btn" 
            onClick={() => fileInputRef.current.click()}
            disabled={isUploading}
          >
            {isUploading ? '⏳ Extracting & Uploading...' : '➕ Upload MP3'}
          </button>
          <input 
            type="file" 
            accept="audio/mpeg, audio/mp3" 
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
      />

      <div className="song-list">
        {filteredSongs.map((song, index) => {
          const isThisPlaying = currentSong && currentSong.audio_url === song.audio_url;

          return (
            <div 
              key={song.id || index} 
              className={`list-item ${isThisPlaying ? 'active' : ''}`}
              onClick={() => handleRowClick(song)}
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
              </div>

              <div className="list-status">
                {isThisPlaying && isPlaying ? '🔊' : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default App