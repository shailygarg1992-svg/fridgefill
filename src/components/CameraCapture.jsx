import { useRef } from 'react'

export default function CameraCapture({ photos, onCapture, onAnalyze, onBack, error }) {
  const fileRef = useRef()

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    onCapture([...photos, ...files])
    e.target.value = ''
  }

  const removePhoto = (index) => {
    onCapture(photos.filter((_, i) => i !== index))
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-14 pb-3 bg-gray-900/90 backdrop-blur">
        <button onClick={onBack} className="text-white text-sm font-medium px-3 py-1">
          Cancel
        </button>
        <h2 className="text-white font-semibold">Scan Fridge</h2>
        <div className="w-16" />
      </div>

      {/* Photo area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        {photos.length === 0 ? (
          <div className="text-center">
            <div className="w-32 h-32 rounded-full bg-gray-800 flex items-center justify-center mb-6 mx-auto">
              <svg className="w-16 h-16 text-gray-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
            </div>
            <p className="text-gray-400 text-lg mb-2">Take photos of your fridge</p>
            <p className="text-gray-600 text-sm">Shelves, door, drawers — the more the better</p>
          </div>
        ) : (
          <div className="w-full">
            <div className="grid grid-cols-2 gap-3 mb-4">
              {photos.map((photo, i) => (
                <div key={i} className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-800">
                  <img
                    src={URL.createObjectURL(photo)}
                    alt={`Fridge photo ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                    Photo {i + 1}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="w-full bg-red-500/20 border border-red-500/40 rounded-xl p-3 mt-4">
            <p className="text-red-300 text-sm text-center">{error}</p>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="px-6 pb-8 pt-4 bg-gray-900 space-y-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex-1 py-4 bg-gray-700 text-white font-semibold rounded-2xl flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {photos.length === 0 ? 'Take Photo' : 'Add More'}
          </button>

          {photos.length > 0 && (
            <button
              onClick={onAnalyze}
              className="flex-1 py-4 bg-green-600 text-white font-semibold rounded-2xl flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              Analyze
            </button>
          )}
        </div>

        <p className="text-gray-600 text-xs text-center">
          {photos.length} photo{photos.length !== 1 ? 's' : ''} taken
        </p>
      </div>
    </div>
  )
}
