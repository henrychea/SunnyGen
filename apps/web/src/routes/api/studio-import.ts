import { createFileRoute } from '@tanstack/react-router'
import { MAX_PACK_BYTES, STUDIO_KINDS, type StudioKind } from '@sunnygen/core'
import { payloadTooLarge } from '~/server/guards.server'
import { MAX_UPLOAD_BYTES } from '~/server/media.server'
import { importPack } from '~/server/pack-import.server'

const MAX_MAPPING_BYTES = 2 * 1024 * 1024

export const Route = createFileRoute('/api/studio-import')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const tooLarge = payloadTooLarge(request, MAX_PACK_BYTES + 4 * 1024 * 1024)
        if (tooLarge) return tooLarge

        let form: FormData
        try {
          form = await request.formData()
        } catch {
          return Response.json({ error: 'Expected multipart form data' }, { status: 400 })
        }

        const rawKind = form.get('kind')
        const kind =
          typeof rawKind === 'string' && (STUDIO_KINDS as readonly string[]).includes(rawKind)
            ? (rawKind as StudioKind)
            : undefined
        if (rawKind !== null && !kind) {
          return Response.json({ error: 'Unknown studio kind' }, { status: 400 })
        }

        const pack = form.get('pack')
        const files = form.getAll('files').filter((entry): entry is File => entry instanceof File)
        if (pack instanceof File && files.length > 0) {
          return Response.json({ error: 'Send a zip or a folder, not both.' }, { status: 400 })
        }
        if (!(pack instanceof File) && files.length === 0) {
          return Response.json({ error: 'Attach a .zip file or a folder.' }, { status: 400 })
        }

        const mappingFile = form.get('mapping')
        let mapping: string | undefined
        if (mappingFile instanceof File) {
          if (mappingFile.size <= 0) {
            return Response.json({ error: 'The mapping file is empty.' }, { status: 400 })
          }
          if (mappingFile.size > MAX_MAPPING_BYTES) {
            return Response.json({ error: 'The mapping file exceeds 2 MB.' }, { status: 413 })
          }
          mapping = await mappingFile.text()
        }

        try {
          if (pack instanceof File) {
            if (pack.size <= 0) {
              return Response.json({ error: 'The zip is empty.' }, { status: 400 })
            }
            if (pack.size > MAX_PACK_BYTES) {
              return Response.json({ error: 'The pack exceeds the 250 MB limit.' }, { status: 413 })
            }
            const zip = new Uint8Array(await pack.arrayBuffer())
            if (zip[0] !== 0x50 || zip[1] !== 0x4b) {
              return Response.json({ error: 'That file is not a zip archive.' }, { status: 415 })
            }
            const result = await importPack({
              kind,
              zip,
              mapping,
              mappingName: mappingFile instanceof File ? mappingFile.name : undefined,
            })
            return Response.json(result)
          }

          const rawPaths = form.get('paths')
          let paths: string[] = []
          if (typeof rawPaths === 'string' && rawPaths) {
            try {
              const parsed = JSON.parse(rawPaths) as unknown
              if (Array.isArray(parsed))
                paths = parsed.filter((entry): entry is string => typeof entry === 'string')
            } catch {
              return Response.json({ error: 'The folder paths are not valid JSON.' }, { status: 400 })
            }
          }
          if (paths.length !== files.length) {
            return Response.json({ error: 'Folder paths do not match the uploaded files.' }, { status: 400 })
          }

          let total = 0
          for (const file of files) {
            if (file.size > MAX_UPLOAD_BYTES) {
              return Response.json({ error: `${file.name} exceeds the 100 MB limit.` }, { status: 413 })
            }
            total += file.size
          }
          if (total > MAX_PACK_BYTES) {
            return Response.json({ error: 'The pack exceeds the 250 MB limit.' }, { status: 413 })
          }

          const result = await importPack({
            kind,
            mapping,
            mappingName: mappingFile instanceof File ? mappingFile.name : undefined,
            files: await Promise.all(
              files.map(async (file, index) => ({
                path: paths[index] ?? file.name,
                data: new Uint8Array(await file.arrayBuffer()),
              })),
            ),
          })
          return Response.json(result)
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Import failed' },
            { status: 400 },
          )
        }
      },
    },
  },
})
