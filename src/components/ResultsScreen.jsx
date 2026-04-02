import { useState, useMemo } from 'react'
import { FREE_DELIVERY_THRESHOLD, DELIVERY_FEE } from '../data/staples'
import { getWalmartLink } from '../utils/api'
import FillCartButton from './FillCartButton'

// Get the per-unit price from an item, handling both old and new field names
function getUnitPrice(item) {
  return item.unit_price || item.est_price || 0
}

function getLineTotal(item) {
  return getUnitPrice(item) * (item.qty || 1)
}

function DeliveryProgressBar({ total, threshold }) {
  const pct = Math.min((total / threshold) * 100, 100)
  const met = total >= threshold
  const gap = Math.max(threshold - total, 0)

  return (
    <div className={`rounded-xl p-3 mb-4 ${met ? 'bg-green-50 border border-green-200' : total >= 25 ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'}`}>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-medium text-gray-600">
          {met ? 'Free delivery!' : `$${gap.toFixed(2)} more for free delivery`}
        </span>
        <span className={`text-xs font-bold ${met ? 'text-green-600' : 'text-gray-500'}`}>
          ${total.toFixed(2)} / ${threshold.toFixed(2)}
        </span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${met ? 'bg-green-500' : total >= 25 ? 'bg-amber-400' : 'bg-gray-300'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function ItemRow({ item, onToggle, included }) {
  const walmartUrl = item.walmart_search?.startsWith('http')
    ? item.walmart_search
    : getWalmartLink(item.walmart_search || item.item)

  const unitPrice = getUnitPrice(item)
  const qty = item.qty || 1
  const lineTotal = unitPrice * qty

  return (
    <div className={`flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0 transition-opacity ${included ? '' : 'opacity-30'}`}>
      <button onClick={onToggle} className="shrink-0">
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${included ? 'bg-green-600 border-green-600' : 'border-gray-300'}`}>
          {included && (
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </button>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 truncate">{item.item}</p>
        <p className="text-xs text-gray-400">
          {qty > 1 ? `${qty} x $${unitPrice.toFixed(2)}` : `$${unitPrice.toFixed(2)}`}
        </p>
      </div>

      <span className="text-sm font-medium text-gray-900 shrink-0">
        ${lineTotal.toFixed(2)}
      </span>

      <a
        href={walmartUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-blue-600"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
      </a>
    </div>
  )
}

export default function ResultsScreen({ results, onBack }) {
  const [dismissedIds, setDismissedIds] = useState(new Set())

  const toggleItem = (itemName) => {
    setDismissedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemName)) next.delete(itemName)
      else next.add(itemName)
      return next
    })
  }

  const allRestock = results.restock_list || []
  const fillers = results.free_delivery?.filler_suggestions || []

  const activeTotal = useMemo(() => {
    let total = 0
    for (const item of [...allRestock, ...fillers]) {
      if (!dismissedIds.has(item.item)) {
        total += getLineTotal(item)
      }
    }
    return total
  }, [allRestock, fillers, dismissedIds])

  const gap = FREE_DELIVERY_THRESHOLD - activeTotal

  const copyList = () => {
    const items = allRestock
      .filter((i) => !dismissedIds.has(i.item))
      .map((i) => `${i.item} (x${i.qty || 1})`)
    navigator.clipboard?.writeText(items.join('\n'))
  }

  return (
    <div className="min-h-screen bg-white pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 pt-14 pb-3">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-green-600 font-medium text-sm">
            Done
          </button>
          <h2 className="font-semibold text-gray-900 text-base">Restock List</h2>
          <button onClick={copyList} className="text-green-600 font-medium text-sm">
            Copy
          </button>
        </div>
      </div>

      <div className="px-4 pt-4">
        <DeliveryProgressBar total={activeTotal} threshold={FREE_DELIVERY_THRESHOLD} />

        {/* All restock items in a flat list */}
        {allRestock.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Recommended Items ({allRestock.filter(i => !dismissedIds.has(i.item)).length})
            </h3>
            {allRestock.map((item) => (
              <ItemRow
                key={item.item}
                item={item}
                included={!dismissedIds.has(item.item)}
                onToggle={() => toggleItem(item.item)}
              />
            ))}
          </div>
        )}

        {/* Free Delivery Fillers — only when $25-$34.99 */}
        {gap > 0 && activeTotal >= 25 && fillers.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wider">
                Add to get free delivery
              </h3>
              <span className="text-xs text-gray-400">(${gap.toFixed(2)} more)</span>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
              {fillers.map((item) => {
                const included = !dismissedIds.has(item.item)
                const unitPrice = getUnitPrice(item)
                const qty = item.qty || 1
                return (
                  <div key={item.item} className={`flex items-center gap-3 py-2 border-b border-amber-100 last:border-0 transition-opacity ${included ? '' : 'opacity-30'}`}>
                    <button onClick={() => toggleItem(item.item)} className="shrink-0">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${included ? 'bg-amber-500 border-amber-500' : 'border-gray-300'}`}>
                        {included && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{item.item}</p>
                      <p className="text-xs text-amber-700">{item.reason}</p>
                    </div>
                    <span className="text-sm font-medium text-gray-900 shrink-0">
                      ${(unitPrice * qty).toFixed(2)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 pb-6 z-20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold text-gray-900">${activeTotal.toFixed(2)}</p>
            <p className={`text-xs ${activeTotal >= FREE_DELIVERY_THRESHOLD ? 'text-green-600' : 'text-gray-400'}`}>
              {activeTotal >= FREE_DELIVERY_THRESHOLD ? 'Free delivery' : `+ $${DELIVERY_FEE} delivery`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const active = [...allRestock, ...fillers].filter((i) => !dismissedIds.has(i.item))
                if (active.length > 0) {
                  window.open(getWalmartLink(active[0].item), '_blank')
                }
              }}
              className="px-4 py-2.5 bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm"
            >
              Browse
            </button>
            <FillCartButton
              restockList={[...allRestock, ...fillers].filter((i) => !dismissedIds.has(i.item))}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
