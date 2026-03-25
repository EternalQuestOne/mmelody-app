import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [songs, setSongs] = useState([])
  
  // NEW: Brain cells to remember search and playback status
  const [searchTerm, setSearchTerm] = useState('')
  const [currentSong, setCurrentSong] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  
  // NEW: A remote control for the hidden audio player
  const audioRef = useRef(null)

  useEffect(() => {
    getSongs()
  }, [])

  // NEW: Automatically play when a new song is selected
  useEffect(() => {
    if (currentSong && audioRef.current) {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }, [currentSong])

  async function getSongs() {
    const { data } = await supabase.from('songs').select('*')
    if (data) {
      setSongs(data)
    }
  }

  // NEW: Custom Play/Pause logic
  const handlePlayPause = (song) => {
    if (currentSong && currentSong.audio_url === song.audio_url) {
      // If clicking the song that's already loaded, toggle play/pause
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
      } else {
        audioRef.current.play()
        setIsPlaying(true)
      }
    } else {
      // If clicking a new song, load it up
      setCurrentSong(song)
    }
  }

  // NEW: Filter songs based on the search bar
  const filteredSongs = songs.filter(song =>
    song.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    song.artist.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="app-container">
      <header className="header">
        <h1>Mmelody 🎵</h1>
        <p>Your private music streaming app</p>
        
        {/* NEW: Search Bar Input */}
        <input
          type="text"
          placeholder="Search for a song or artist..."
          className="search-bar"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </header>
      
      {/* NEW: One single, hidden audio player running the show */}
      <audio
        ref={audioRef}
        src={currentSong ? currentSong.audio_url : ''}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="song-list">
        {filteredSongs.map((song, index) => {
          // Check if this specific card is the one playing right now
          const isThisPlaying = currentSong && currentSong.audio_url === song.audio_url;

          return (
            <div key={index} className={`song-card ${isThisPlaying ? 'playing-card' : ''}`}>
              <div className="song-content">
                
                {/* Album Art & Now Playing Animation */}
                {song.cover_url && (
                  <div className="album-art-container">
                    <img src={song.cover_url} alt="Album Art" className="album-art" />
                    {isThisPlaying && isPlaying && (
                      <div className="now-playing-anim">
                        <div className="bar"></div>
                        <div className="bar"></div>
                        <div className="bar"></div>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="song-info">
                  <h3>{song.title}</h3>
                  <p>{song.artist}</p>
                </div>
              </div>

              {/* NEW: Custom Play/Pause Button */}
              <button 
                className={`custom-play-btn ${isThisPlaying && isPlaying ? 'pause' : 'play'}`}
                onClick={() => handlePlayPause(song)}
              >
                {isThisPlaying && isPlaying ? '⏸ Pause' : '▶ Play'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default App