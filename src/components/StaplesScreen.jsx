import { useState } from 'react'
import { STAPLES } from '../data/staples'
import { daysSince, getWalmartLink } from '../utils/api'

const CATEGORIES = {
  dairy: 'Dairy',
  fruit: 'Fruit',
  vegetable: 'Vegetables',
  protein: 'Protein',
  grain: 'Grains',
  frozen: 'Frozen',
  pantry: 'Pantry',
  baby: 'Baby',
  personal_care: 'Personal Care',
  household: 'Household',
}

export default function StaplesScreen({ onBack }) {
  const [staples, setStaples] = useState(STAPLES)

  const toggleActive = (id) => {
    setStaples((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s))
    )
  }

  const grouped = staples.reduce((acc, item) => {
    const cat = item.category || 'other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 px-4 pt-14 pb-3">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-green-600 font-medium text-sm">
            Back
          </button>
          <h2 className="font-semibold text-gray-900">My Staples</h2>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 pt-4 pb-8">
        <p className="text-sm text-gray-500 mb-4">
          {staples.length} items tracked from your order history
        </p>

        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="mb-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
              {CATEGORIES[cat] || cat}
            </h3>
            <div className="card">
              {items.map((item, i) => {
                const days = daysSince(item.lastOrderDate)
                const overdue = days > item.avgFrequencyDays
                const active = item.active !== false

                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 px-4 py-3 ${i < items.length - 1 ? 'border-b border-gray-100' : ''} ${active ? '' : 'opacity-40'}`}
                  >
                    <button onClick={() => toggleActive(item.id)} className="shrink-0">
                      <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center ${active ? 'bg-green-600 border-green-600' : 'border-gray-300'}`}>
                        {active && (
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">Qty {item.typicalQty}</span>
                        <span className="text-xs text-gray-300">&middot;</span>
                        <span className="text-xs text-gray-500">${item.typicalPrice}</span>
                        <span className="text-xs text-gray-300">&middot;</span>
                        <span className={`text-xs ${overdue ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                          {days}d ago {overdue ? '(overdue)' : ''}
                        </span>
                      </div>
                    </div>

                    <a
                      href={getWalmartLink(item.walmartSearchQuery)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-blue-500"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </a>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
