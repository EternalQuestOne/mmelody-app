import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [songs, setSongs] = useState([])

  useEffect(() => {
    getSongs()
  }, [])

  async function getSongs() {
    const { data } = await supabase.from('songs').select('*')
    if (data) {
      setSongs(data)
    }
  }

  return (
    <div className="app-container">
      <header className="header">
        <h1>Mmelody 🎵</h1>
        <p>Your private music streaming app</p>
      </header>
      
      <div className="song-list">
        {songs.map((song, index) => (
          <div key={index} className="song-card">
            
            {/* NEW: This section holds the image and text side-by-side */}
            <div className="song-content">
              {song.cover_url && (
                <img src={song.cover_url} alt="Album Art" className="album-art" />
              )}
              <div className="song-info">
                <h3>{song.title}</h3>
                <p>{song.artist}</p>
              </div>
            </div>

            <audio controls src={song.audio_url} className="audio-player"></audio>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App