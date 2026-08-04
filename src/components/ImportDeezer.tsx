import { useRef, useState } from 'react'
import { dedupeTracks, parseDeezerExport } from '../lib/deezer-import'
import type { DeezerImportResult } from '../lib/deezer-import'
import { useImportDeezer } from '../api/queries'
import { CheckIcon, UploadIcon } from './icons'

/**
 * Import de l'export JSON officiel Deezer.
 * Sélectionnez les fichiers playlists.json / favorites.json / history.json
 * (ils peuvent être choisis en une seule fois) puis lancez l'import.
 */
export function ImportDeezer() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<DeezerImportResult | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const importMutation = useImportDeezer()

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setMessage(null)

    const merged: DeezerImportResult = { playlists: [], favorites: [], history: [] }
    const seenPlaylists = new Set<string>()

    for (const file of Array.from(files)) {
      try {
        const text = await file.text()
        const parsed = parseDeezerExport(JSON.parse(text))
        for (const p of parsed.playlists) {
          if (!seenPlaylists.has(p.id)) {
            seenPlaylists.add(p.id)
            merged.playlists.push(p)
          }
        }
        merged.favorites.push(...parsed.favorites)
        merged.history.push(...parsed.history)
      } catch {
        setMessage({ ok: false, text: `« ${file.name} » : JSON illisible.` })
        return
      }
    }

    merged.favorites = dedupeTracks(merged.favorites)
    merged.history = dedupeTracks(merged.history)

    setResult(merged)
    setFileName(Array.from(files).map((f) => f.name).join(', '))
  }

  async function doImport() {
    if (!result) return
    try {
      const res = await importMutation.mutateAsync(result)
      setMessage({
        ok: true,
        text: `Importé : ${res.counts.playlists} playlist(s), ${res.counts.favorites} favori(s), ${res.counts.history} titre(s) d'historique.`
      })
      setResult(null)
      if (inputRef.current) inputRef.current.value = ''
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Échec de l’import.' })
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <UploadIcon width={18} height={18} className="text-accent" /> Importer mes données Deezer
      </h2>
      <p className="mb-3 text-xs leading-relaxed text-muted">
        Sélectionnez les fichiers <code className="text-text">playlists.json</code>,{' '}
        <code className="text-text">favorites.json</code> et <code className="text-text">history.json</code> issus de
        votre export Deezer (demande de données personnelles). Les titres sont convertis puis cherchés sur YouTube à la
        lecture.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-full border border-border bg-surface2 py-2.5 text-sm font-medium transition active:scale-[0.98]"
      >
        {fileName ? `Fichiers : ${fileName}` : 'Choisir les fichiers JSON…'}
      </button>

      {result && (
        <div className="mt-3 rounded-xl bg-surface2 p-3 text-xs">
          <p className="mb-1 font-medium">
            Prêt à importer : {result.playlists.length} playlist(s) · {result.favorites.length} favori(s) ·{' '}
            {result.history.length} titre(s)
          </p>
          <button
            onClick={() => void doImport()}
            disabled={importMutation.isPending}
            className="mt-2 w-full rounded-full bg-accent py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {importMutation.isPending ? 'Import en cours…' : 'Importer'}
          </button>
        </div>
      )}

      {message && (
        <p className={`mt-3 flex items-start gap-1.5 text-xs ${message.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {message.ok && <CheckIcon width={14} height={14} className="mt-px shrink-0" />}
          {message.text}
        </p>
      )}
    </section>
  )
}
