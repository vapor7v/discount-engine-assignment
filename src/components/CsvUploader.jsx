import { useRef } from 'react'

export default function CsvUploader({ label, description, onLoad, onError, hasData, fileName, accept = '.csv' }) {
  const inputRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => onLoad(evt.target.result, file.name)
    reader.onerror = () => {
      if (onError) onError(`Failed to read ${file.name}.`)
      else onLoad('', file.name)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      inputRef.current?.click()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Upload ${label}`}
      style={{
        border: `2px dashed ${hasData ? '#1e5c2c' : '#CECECE'}`,
        borderRadius: 6,
        padding: '1rem 1.2rem',
        background: hasData ? '#f0faf2' : '#fafafa',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
        outline: 'none',
      }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={handleKeyDown}
      onFocus={(e) => { e.currentTarget.style.boxShadow = '0 0 0 2px #FF5800' }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = 'none' }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ fontSize: 20 }}>{hasData ? '✅' : '📄'}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#131A48' }}>{label}</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            {hasData ? fileName : description}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: hasData ? '#1e5c2c' : '#FF5800',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {hasData ? 'Change' : 'Upload'}
          </span>
        </div>
      </div>
    </div>
  )
}
