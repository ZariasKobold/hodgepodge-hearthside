/**
 * Local-first persistence.
 *
 * Permission to build on Wyrd's IP is revocable at any time, so a campaign has
 * to survive this app going away. Everything is stored under one key per
 * campaign and exports whole to JSON.
 */
const PREFIX = 'hodgepodge:'

const memory = new Map()

function backing() {
  try {
    const probe = '__bs__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

export function save(key, value) {
  const json = JSON.stringify(value)
  const store = backing()
  if (store) store.setItem(PREFIX + key, json)
  else memory.set(key, json)
}

export function load(key, fallback = null) {
  const store = backing()
  const raw = store ? store.getItem(PREFIX + key) : memory.get(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function remove(key) {
  const store = backing()
  if (store) store.removeItem(PREFIX + key)
  else memory.delete(key)
}

export function exportJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result))
      } catch (err) {
        reject(new Error('That file is not valid campaign JSON.'))
      }
    }
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsText(file)
  })
}
