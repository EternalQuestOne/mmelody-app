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
    <div>
      <h1>Mmelody 🎵</h1>
      <p>Your private music streaming app</p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '30px' }}>
        {songs.map((song, index) => (
          <div key={index} style={{ padding: '15px', border: '1px solid #ccc', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 5px 0' }}>{song.title}</h3>
            <p style={{ margin: '0 0 15px 0', color: 'gray' }}>{song.artist}</p>
            <audio controls src={song.audio_url} style={{ width: '100%' }}></audio>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App