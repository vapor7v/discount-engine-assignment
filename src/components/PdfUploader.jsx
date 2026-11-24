import { useRef } from 'react'

export default function PdfUploader({ onLoad, loading, hasData }) {
  const inputRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    onLoad(file)
    e.target.value = ''
  }

  return (
    <div
      style={{
        border: `2px dashed ${hasData ? '#1e5c2c' : '#CECECE'}`,
        borderRadius: 6,
        padding: '0.8rem 1.2rem',
        background: hasData ? '#f0faf2' : '#fafafa',
        cursor: 'pointer',
        marginTop: '0.5rem',
      }}
      onClick={() => !loading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ fontSize: 20 }}>{loading ? '⏳' : '📕'}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#131A48' }}>cart.pdf</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            {loading ? 'Parsing PDF...' : 'Upload a PDF cart (replaces current cart)'}
          </div>
        </div>
      </div>
    </div>
  )
}
