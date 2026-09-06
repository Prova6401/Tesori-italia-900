'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Script from 'next/script'
import AuthControls from '@/components/auth-controls'
import { supabase } from '@/lib/supabase'
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  FileUp,
  Image as ImageIcon,
  LayoutGrid,
  List,
  MoreHorizontal,
  UserRound,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Sun,
  ShoppingBag,
  X,
} from 'lucide-react'

type CsvRow = Record<string, string>
type Product = {
  id: string
  title: string
  description?: string
  price: number
  quantity: number
  category: string
  images: string[]
  variants: string[]
}
type UserRole = 'manage' | 'customer' | null

declare global {
  interface Window {
    Papa?: {
      parse: (file: File, config: Record<string, unknown>) => void
    }
    JSZip?: new () => { loadAsync: (file: File) => Promise<{ files: Record<string, { dir: boolean; async: (type: string) => Promise<Blob> }> }> }
  }
}

const FALLBACK_IMAGE = 'https://www.svgrepo.com/show/508699/landscape-placeholder.svg'
const ZIP_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|avif)$/i

function normalizeTitle(value: string) {
  return value.toLocaleLowerCase().trim().replace(/\s+/g, ' ')
}

async function readStoredProducts(): Promise<Product[]> {
  if (!supabase) throw new Error('Supabase non configurato.')
  const pageSize = 1000
  const products: Product[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.from('products')
      .select('id,title,description,price,quantity,category,images,variants')
      .order('updated_at', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    const page = (data || []).map((product) => ({ ...product, images: (product.images || []).filter((image: string) => image !== FALLBACK_IMAGE) })) as Product[]
    products.push(...page)
    if (page.length < pageSize) break
    offset += pageSize
  }
  return products
}

async function writeStoredProducts(products: Product[]) {
  if (!supabase) throw new Error('Supabase non configurato.')
  for (let index = 0; index < products.length; index += 500) {
    const batch = products.slice(index, index + 500)
    const { error } = await supabase.from('products').upsert(batch.map((product) => ({
      id: product.id,
      title: product.title,
      description: product.description || '',
      price: product.price,
      quantity: product.quantity,
      category: product.category,
      images: product.images,
      variants: product.variants,
    })), { onConflict: 'id' })
    if (error) throw error
  }
}

async function clearStoredProducts() {
  if (!supabase) throw new Error('Supabase non configurato.')
  const { error } = await supabase.from('products').delete().not('id', 'is', null)
  if (error) throw error
}

async function deleteStoredProducts(ids: string[]) {
  if (!supabase || !ids.length) throw new Error('Supabase non configurato.')
  const { error } = await supabase.from('products').delete().in('id', ids)
  if (error) throw error
}

function parseNumber(value: string | undefined, integer = false) {
  if (!value) return 0
  const normalized = value.replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? (integer ? Math.max(0, Math.round(parsed)) : parsed) : 0
}

function normalizeRows(rows: CsvRow[]): Product[] {
  const grouped = new Map<string, Product>()
  for (const row of rows) {
    const id = (row['Item number'] || row['Item Number'] || row['item number'] || '').trim()
    if (!id) continue
    const price = parseNumber(row['Start price'] || row['Current price'])
    const images = (row.PicURL || '').split('|').map((url) => url.trim()).filter(Boolean)
    const variant = (row['Variation details'] || '').trim()
    const existing = grouped.get(id)
    if (existing) {
      existing.quantity += parseNumber(row['Available quantity'], true)
      if (variant && !existing.variants.includes(variant)) existing.variants.push(variant)
      for (const image of images) if (!existing.images.includes(image)) existing.images.push(image)
      if (!existing.price && price) existing.price = price
      continue
    }
    grouped.set(id, {
      id,
      title: (row.Title || 'Prodotto senza titolo').trim(),
      description: (row.Description || row['Item description'] || row['Description'] || '').trim(),
      price,
      quantity: parseNumber(row['Available quantity'], true),
      category: (row['eBay category 1 name'] || 'Senza categoria').trim(),
      images,
      variants: variant ? [variant] : [],
    })
  }
  return [...grouped.values()]
}

export default function Page() {
  const [products, setProducts] = useState<Product[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [priceFilter, setPriceFilter] = useState('all')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Product | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [cart, setCart] = useState<Product[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [notice, setNotice] = useState('')
  const [isImportingZip, setIsImportingZip] = useState(false)
  const [pageSize, setPageSize] = useState(24)
  const [viewLayout, setViewLayout] = useState<'grid' | 'list'>('grid')
  const [columns, setColumns] = useState(4)
  const [cardDetails, setCardDetails] = useState<'full' | 'minimal'>('full')
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false)
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false)
  const [isHeaderBrandCondensed, setIsHeaderBrandCondensed] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [userRole, setUserRole] = useState<UserRole>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const zipFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void (async () => {
      try {
        const stored = await readStoredProducts()
        setProducts(stored)
      } catch (error) {
        const supabaseError = error as { code?: string }
        setNotice(supabaseError.code === 'PGRST205'
          ? 'Manca la tabella products su Supabase. Esegui supabase-products.sql nel SQL Editor e ricarica la pagina.'
          : 'Impossibile caricare gli articoli online. Verifica Supabase e riprova.')
      }
    })()
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true
    const loadRole = async (userId?: string) => {
      if (!userId) {
        if (active) setUserRole(null)
        return
      }
      const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
      if (active) setUserRole(data?.role === 'manage' ? 'manage' : 'customer')
    }
    void supabase.auth.getUser().then(({ data }) => loadRole(data.user?.id))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { void loadRole(session?.user?.id) })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    let frame = 0
    const handleScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        const scrollY = window.scrollY
        setIsHeaderScrolled(scrollY > 20)
        setIsHeaderBrandCondensed(scrollY > 180)
        frame = 0
      })
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  const categories = useMemo(() => [...new Set(products.map((product) => product.category))].sort((a, b) => a.localeCompare(b)), [products])
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return products.filter((product) => {
      const matchesQuery = !needle || `${product.title} ${product.id} ${product.category}`.toLocaleLowerCase().includes(needle)
      const matchesPrice = priceFilter === 'all'
        || (priceFilter === 'under-25' && product.price < 25)
        || (priceFilter === '25-100' && product.price >= 25 && product.price <= 100)
        || (priceFilter === 'over-100' && product.price > 100)
      return matchesQuery && (category === 'all' || product.category === category) && matchesPrice && (!onlyAvailable || product.quantity > 0)
    })
  }, [products, query, category, priceFilter, onlyAvailable])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const available = products.filter((product) => product.quantity > 0).length
  const canManage = userRole === 'manage'
  const selectedProducts = products.filter((product) => selectedIds.includes(product.id))

  useEffect(() => { setPage(1) }, [query, category, priceFilter, onlyAvailable])
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])

  const persist = useCallback((next: Product[]) => {
    setProducts(next)
    void writeStoredProducts(next).catch(() => setNotice('Impossibile pubblicare gli articoli su Supabase.'))
  }, [])

  const updateProduct = useCallback(async (updated: Product) => {
    if (!canManage) return
    setProducts((current) => current.map((product) => product.id === updated.id ? updated : product))
    try { await writeStoredProducts([updated]); setSelected(updated) } catch { setNotice('Impossibile salvare la modifica su Supabase.') }
  }, [canManage])

  async function deleteProduct(product: Product) {
    if (!canManage) return
    if (!window.confirm(`Eliminare “${product.title}”?`)) return
    try {
      await deleteStoredProducts([product.id])
      setProducts((current) => current.filter((item) => item.id !== product.id))
      setSelected(null)
      setSelectedIds((current) => current.filter((id) => id !== product.id))
      setNotice('Annuncio eliminato.')
    } catch { setNotice('Impossibile eliminare l’annuncio su Supabase.') }
  }

  async function deleteSelectedProducts() {
    if (!canManage || !selectedIds.length) return
    if (!window.confirm(`Eliminare ${selectedIds.length} annunci selezionati?`)) return
    try {
      await deleteStoredProducts(selectedIds)
      setProducts((current) => current.filter((product) => !selectedIds.includes(product.id)))
      setSelectedIds([]); setIsBulkEditOpen(false); setNotice('Annunci eliminati.')
    } catch { setNotice('Impossibile eliminare gli annunci selezionati.') }
  }

  async function applyBulkEdit(changes: { category?: string; price?: number; quantity?: number }) {
    if (!canManage || !selectedProducts.length) return
    const updated = selectedProducts.map((product) => ({ ...product, ...(changes.category ? { category: changes.category } : {}), ...(changes.price !== undefined ? { price: changes.price } : {}), ...(changes.quantity !== undefined ? { quantity: changes.quantity } : {}) }))
    setProducts((current) => current.map((product) => updated.find((item) => item.id === product.id) || product))
    try { await writeStoredProducts(updated); setSelectedIds([]); setIsBulkEditOpen(false); setNotice(`${updated.length} annunci aggiornati.`) } catch { setNotice('Impossibile applicare le modifiche di gruppo.') }
  }

  function handleFile(file?: File) {
    if (!canManage) { setNotice('Solo gli account manage possono aggiungere annunci.'); return }
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setNotice('Seleziona un file CSV valido.')
      return
    }
    if (!window.Papa) { setNotice('Il parser CSV non è ancora pronto. Riprova tra un istante.'); return }
    setIsParsing(true); setNotice('')
    window.Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimitersToGuess: [',', ';', '\\t', '|'],
      complete: (results: { data: CsvRow[]; errors: unknown[] }) => {
        const normalized = normalizeRows(results.data)
        if (!normalized.length) setNotice('Nessun prodotto riconoscibile. Controlla le colonne eBay.')
        else persist(normalized)
        setIsParsing(false)
      },
      error: () => { setNotice('Errore durante la lettura del CSV.'); setIsParsing(false) },
    })
  }

  async function handleZip(file?: File) {
    if (!canManage) { setNotice('Solo gli account manage possono caricare fotografie.'); return }
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setNotice('Seleziona un file ZIP valido con le foto degli annunci.')
      return
    }
    if (!window.JSZip) {
      setNotice('Il lettore ZIP non è ancora pronto. Riprova tra un istante.')
      return
    }
    setIsImportingZip(true)
    setNotice('Analisi del pacchetto foto in corso…')
    try {
      const archive = await new window.JSZip().loadAsync(file)
      if (!supabase) throw new Error('Supabase non configurato.')
      const photoGroups = new Map<string, { order: number; path: string; blob: Blob }[]>()
      for (const [path, entry] of Object.entries(archive.files)) {
        if (entry.dir || !ZIP_IMAGE_EXTENSIONS.test(path)) continue
        const parts = path.split('/').filter(Boolean)
        const filename = parts.at(-1) || ''
        const folderTitle = parts.length > 1 && parts.at(-2) !== 'foto' ? parts.at(-2) || '' : ''
        const filenameTitle = filename.replace(/-\d+(?=\.[^.]+$)/, '').replace(/\.[^.]+$/, '')
        const title = folderTitle || filenameTitle
        if (!title) continue
        const match = filename.match(/-(\\d+)(?=\\.[^.]+$)/)
        const order = match ? Number.parseInt(match[1], 10) : 9999
        const blob = await entry.async('blob')
        const group = photoGroups.get(normalizeTitle(title)) || []
        group.push({ order, path, blob })
        photoGroups.set(normalizeTitle(title), group)
      }

      let attachedImages = 0
      const matchedProducts = new Set<string>()
      const nextProducts = await Promise.all(products.map(async (product) => {
        const productTitle = normalizeTitle(product.title)
        const groupEntry = [...photoGroups.entries()].find(([title]) => title === productTitle || title.includes(productTitle) || productTitle.includes(title))
        if (!groupEntry) return product
        const images = await Promise.all(groupEntry[1].sort((a, b) => a.order - b.order || a.path.localeCompare(b.path)).map(async (item, index) => {
          const extension = item.path.split('.').pop() || 'jpg'
          const storagePath = `${product.id}/${Date.now()}-${index}.${extension}`
          const upload = await supabase.storage.from('product-images').upload(storagePath, item.blob, { contentType: item.blob.type || 'image/jpeg', upsert: false })
          if (upload.error) throw upload.error
          return supabase.storage.from('product-images').getPublicUrl(storagePath).data.publicUrl
        }))
        attachedImages += images.length
        matchedProducts.add(product.id)
        return { ...product, images }
      }))
      if (!attachedImages) setNotice('Nessuna foto è stata associata: verifica che i nomi delle cartelle corrispondano ai titoli eBay.')
      else {
        persist(nextProducts)
        setNotice(`${attachedImages.toLocaleString('it-IT')} foto associate a ${matchedProducts.size.toLocaleString('it-IT')} prodotti.`)
      }
    } catch (error) {
      console.error('[v0] Import ZIP failed:', error)
      setNotice(error instanceof DOMException && error.name === 'QuotaExceededError'
        ? 'Le foto superano lo spazio disponibile del browser. Usa uno ZIP più piccolo o importa meno prodotti.'
        : 'Impossibile leggere il file ZIP. Verifica che sia un archivio ZIP valido.')
    } finally {
      setIsImportingZip(false)
    }
  }

  async function resetCatalog() {
    if (!canManage) { setNotice('Solo gli account manage possono modificare gli articoli.'); return }
    if (!window.confirm('Rimuovere definitivamente gli articoli salvati?')) return
    await clearStoredProducts().then(() => {
      setProducts([]); setSelected(null); setNotice('Articoli rimossi dalla vetrina.')
    }).catch(() => setNotice('Impossibile rimuovere gli articoli da Supabase.'))
  }

  const formatPrice = (price: number) => price.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
  const ebayUrl = (id: string) => `https://www.ebay.it/itm/${encodeURIComponent(id)}`
  const cartTotal = cart.reduce((total, product) => total + product.price, 0)
  const addToCart = (product: Product) => {
    setCart((current) => current.some((item) => item.id === product.id) ? current : [...current, product])
    setNotice('Articolo aggiunto al carrello.')
  }
  const removeFromCart = (id: string) => setCart((current) => current.filter((product) => product.id !== id))

  return (
    <>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js" strategy="afterInteractive" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js" strategy="afterInteractive" />
      <main className={`min-h-screen bg-background text-foreground ${isDarkMode ? 'site-dark' : ''}`}>
        <header className={`border-b border-border bg-card/80 backdrop-blur-xl ${isHeaderScrolled ? 'is-scrolled' : ''} ${isHeaderBrandCondensed ? 'is-brand-condensed' : ''}`}>
          <div className="mx-auto flex max-w-360 items-center justify-between gap-5 px-6 py-4 lg:px-10">
            <div className="flex min-w-0 items-center gap-3">
              <Image src="https://github.com/Prova6401/Tesori-italia-900/blob/main/public/logo.jpg?raw=true" alt="Tesori Italia '900s" width={48} height={48} priority className="brand-logo size-12 rounded-xl object-cover shadow-lg shadow-primary/20" />
              <div className="min-w-0"><h1 className="text-lg font-bold tracking-tight">Tesori Italia '900s</h1><p className="hidden text-xs text-muted-foreground sm:block">Oggetti scelti, storie da scoprire.</p></div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={() => setIsDarkMode((current) => !current)} className="cupertino-button cupertino-button-icon inline-flex size-10 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:text-foreground" aria-label={isDarkMode ? 'Attiva modalità chiara' : 'Attiva modalità scura'}>{isDarkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>
              <button onClick={() => setIsCartOpen(true)} className="cart-button" aria-label="Apri carrello"><ShoppingBag className="size-4" /><span>{cart.length}</span></button>
              <AuthControls />
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => handleFile(event.target.files?.[0])} />
              <input ref={zipFileRef} type="file" accept=".zip,application/zip" className="sr-only" onChange={(event) => handleZip(event.target.files?.[0])} />
              {canManage && <button onClick={resetCatalog} disabled={!products.length} className="header-reset-button inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground transition hover:border-destructive/60 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw className="size-4" /><span className="hidden sm:inline">Svuota</span></button>}
            </div>
          </div>
        </header>

        <div className={`store-toolbar ${isHeaderScrolled ? 'under-scrolled-header' : ''}`}>
          <div className="store-toolbar-count"><Database className="size-4 text-primary" /><span>{products.length.toLocaleString('it-IT')}</span><small>prodotti online</small></div>
          <label className="header-search store-toolbar-search items-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-2"><Search className="size-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca prodotti, categorie o parole chiave…" aria-label="Cerca prodotti" /></label>
          <div className="store-toolbar-filters">
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="header-filter header-category appearance-none rounded-xl border border-border bg-background/70 px-3 py-2 text-xs outline-none" aria-label="Filtra per categoria"><option value="all">Categorie</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <select value={priceFilter} onChange={(event) => setPriceFilter(event.target.value)} className="header-filter appearance-none rounded-xl border border-border bg-background/70 px-3 py-2 text-xs outline-none" aria-label="Filtra per prezzo"><option value="all">Prezzo</option><option value="under-25">Sotto 25 €</option><option value="25-100">25 - 100 €</option><option value="over-100">Oltre 100 €</option></select>
            <label className="header-availability items-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground"><input type="checkbox" checked={onlyAvailable} onChange={(event) => setOnlyAvailable(event.target.checked)} className="size-3.5 accent-primary" /> Disponibili</label>
            <div className="view-control"><button type="button" className="header-view items-center gap-1.5 rounded-xl border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground transition hover:bg-muted" onClick={() => setIsViewOpen((open) => !open)} aria-expanded={isViewOpen}><LayoutGrid className="size-3.5" /> Vista</button>{isViewOpen && <ViewPanel pageSize={pageSize} setPageSize={setPageSize} viewLayout={viewLayout} setViewLayout={setViewLayout} columns={columns} setColumns={setColumns} cardDetails={cardDetails} setCardDetails={setCardDetails} />}</div>
            {canManage && <div className="manage-actions items-center gap-2">
              <button onClick={() => fileRef.current?.click()} className="cupertino-button cupertino-button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"><Plus className="size-4" />{isParsing ? 'Pubblicazione…' : 'Aggiungi annuncio'}</button>
              <button onClick={() => zipFileRef.current?.click()} disabled={!products.length || isImportingZip} className="cupertino-button cupertino-button-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"><ImageIcon className="size-4" />{isImportingZip ? 'Foto in corso…' : 'Aggiungi foto'}</button>
            </div>}
            {canManage && <button type="button" className="bulk-select-button" onClick={() => setSelectedIds(selectedIds.length === visible.length ? [] : visible.map((product) => product.id))}>{selectedIds.length === visible.length && visible.length ? 'Deseleziona pagina' : 'Seleziona pagina'}</button>}
          </div>
        </div>

        <div className="mx-auto max-w-360 px-5 py-8 lg:px-8">
          <section className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div><p className="mb-2 font-mono text-xs uppercase tracking-[0.22em] text-primary">La collezione online</p><h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Trova qualcosa di speciale.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Esplora pezzi selezionati, scopri nuovi oggetti e trova il prossimo tesoro da portare a casa.</p></div>
            <div className="flex gap-2 text-xs text-muted-foreground"><span className="rounded-full border border-border px-3 py-2">{available.toLocaleString('it-IT')} disponibili</span><span className="rounded-full border border-border px-3 py-2">{categories.length} categorie</span></div>
          </section>

          {notice && <div className="mb-6 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">{notice}<button onClick={() => setNotice('')} aria-label="Chiudi messaggio"><X className="size-4" /></button></div>}

          {products.length === 0 ? <EmptyState canManage={canManage} onUpload={() => fileRef.current?.click()} /> : <>
            <div className="mb-4 flex items-center justify-between"><p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{filtered.length.toLocaleString('it-IT')}</span> risultati</p><p className="font-mono text-xs text-muted-foreground">PAGINA {page} / {pageCount}</p></div>
            {visible.length ? <div className={`product-grid ${viewLayout === 'list' ? 'product-grid-list' : ''} ${cardDetails === 'minimal' ? 'product-grid-minimal' : ''}`} style={{ '--product-columns': columns } as React.CSSProperties}>{visible.map((product) => <ProductCard key={product.id} product={product} formatPrice={formatPrice} compact={cardDetails === 'minimal'} canManage={canManage} isSelected={selectedIds.includes(product.id)} onToggleSelect={() => setSelectedIds((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id])} onOpen={() => setSelected(product)} />)}</div> : <div className="rounded-2xl border border-dashed border-border py-20 text-center text-muted-foreground">Nessun prodotto corrisponde ai filtri.</div>}
            {canManage && selectedIds.length > 0 && <BulkActionBar count={selectedIds.length} onDelete={deleteSelectedProducts} onEdit={() => setIsBulkEditOpen(true)} />}
            <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Paginazione"><button disabled={page === 1} onClick={() => setPage((current) => current - 1)} className="inline-flex size-10 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-30"><ChevronLeft className="size-4" /></button><span className="px-3 text-sm text-muted-foreground">{page} di {pageCount}</span><button disabled={page === pageCount} onClick={() => setPage((current) => current + 1)} className="inline-flex size-10 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-30"><ChevronRight className="size-4" /></button></nav>
          </>}
        </div>
      </main>
      {selected && <ProductEditorModal product={selected} formatPrice={formatPrice} ebayUrl={ebayUrl} canManage={canManage} darkMode={isDarkMode} onSave={updateProduct} onDelete={deleteProduct} onAddToCart={addToCart} onClose={() => setSelected(null)} />}
      {isBulkEditOpen && <BulkEditPanel selectedCount={selectedIds.length} darkMode={isDarkMode} onApply={applyBulkEdit} onClose={() => setIsBulkEditOpen(false)} />}
      {isCartOpen && <CartPage cart={cart} total={cartTotal} darkMode={isDarkMode} onRemove={removeFromCart} onClose={() => setIsCartOpen(false)} />}
      <nav className={`mobile-tab-bar ${isDarkMode ? 'mobile-dark' : ''}`} aria-label="Navigazione mobile"><button onClick={() => setIsMobileSearchOpen(true)}><Search /><span>Cerca</span></button><button onClick={() => setIsCartOpen(true)}><ShoppingBag /><span>Carrello</span><b>{cart.length}</b></button><button onClick={() => setIsMobileMoreOpen((open) => !open)}><MoreHorizontal /><span>Altro</span></button></nav>
      {isMobileSearchOpen && <div className={`mobile-search-overlay ${isDarkMode ? 'mobile-dark' : ''}`}><div className="mobile-search-top"><button onClick={() => setIsMobileSearchOpen(false)}><X /></button><label><Search /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca prodotti..." /></label></div><p>{filtered.length.toLocaleString('it-IT')} risultati</p></div>}
      {isMobileMoreOpen && <div className={`mobile-more-sheet ${isDarkMode ? 'mobile-dark' : ''}`}><div className="mobile-more-grabber" /><div className="mobile-more-heading"><strong>Altre opzioni</strong><button onClick={() => setIsMobileMoreOpen(false)}><X /></button></div><label>Categoria<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Tutte le categorie</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Prezzo<select value={priceFilter} onChange={(event) => setPriceFilter(event.target.value)}><option value="all">Tutti i prezzi</option><option value="under-25">Sotto 25 €</option><option value="25-100">25 - 100 €</option><option value="over-100">Oltre 100 €</option></select></label><label className="mobile-more-check"><input type="checkbox" checked={onlyAvailable} onChange={(event) => setOnlyAvailable(event.target.checked)} /> Solo disponibili</label><button onClick={() => { setIsViewOpen(true); setIsMobileMoreOpen(false) }}><LayoutGrid /> Vista</button>{canManage && <><button onClick={() => fileRef.current?.click()}><Plus /> Aggiungi annuncio</button><button onClick={() => zipFileRef.current?.click()}><ImageIcon /> Aggiungi foto</button><button onClick={resetCatalog}><RotateCcw /> Svuota</button><button onClick={() => setSelectedIds(visible.map((product) => product.id))}><List /> Seleziona pagina</button></>}</div>}
    </>
  )
}

function ProductCard({ product, formatPrice, compact, canManage, isSelected, onToggleSelect, onOpen }: { product: Product; formatPrice: (price: number) => string; compact: boolean; canManage: boolean; isSelected: boolean; onToggleSelect: () => void; onOpen: () => void }) {
  return <div className={`product-card-wrap ${isSelected ? 'is-selected' : ''}`}><button onClick={onOpen} className="group overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5"><div className="relative aspect-square overflow-hidden bg-muted"><img src={product.images[0]} alt={product.title} loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" onError={(event) => { event.currentTarget.src = FALLBACK_IMAGE }} /><span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${product.quantity > 0 ? 'bg-emerald-500/90 text-white' : 'bg-foreground/80 text-background'}`}>{product.quantity > 0 ? 'Disponibile' : 'Esaurito'}</span>{product.images.length > 1 && <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-background/85 px-2 py-1 text-[10px] text-foreground"><ImageIcon className="size-3" />{product.images.length}</span>}</div><div className="space-y-3 p-4"><p className={`text-[11px] uppercase tracking-wider text-muted-foreground ${compact ? 'hidden' : ''}`}>{product.category}</p><h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5">{product.title}</h3><div className="flex items-end justify-between gap-2"><p className="text-lg font-bold tracking-tight">{formatPrice(product.price)}</p><p className={`text-[10px] text-muted-foreground ${compact ? 'hidden' : ''}`}>{product.quantity} pz</p></div><div className={`items-center justify-between border-t border-border pt-3 font-mono text-[10px] text-muted-foreground ${compact ? 'hidden' : 'flex'}`}><span>ID {product.id}</span><ArrowUpRight className="size-3.5 transition group-hover:text-primary" /></div></div></button>{canManage && <label className="product-select"><input type="checkbox" checked={isSelected} onChange={onToggleSelect} onClick={(event) => event.stopPropagation()} /> Seleziona</label>}</div>
}

function ViewPanel({ pageSize, setPageSize, viewLayout, setViewLayout, columns, setColumns, cardDetails, setCardDetails }: { pageSize: number; setPageSize: (value: number) => void; viewLayout: 'grid' | 'list'; setViewLayout: (value: 'grid' | 'list') => void; columns: number; setColumns: (value: number) => void; cardDetails: 'full' | 'minimal'; setCardDetails: (value: 'full' | 'minimal') => void }) {
  return <div className="view-panel"><div className="view-panel-heading"><span>Vista prodotti</span><small>Personalizza la vetrina</small></div><label>Annunci per pagina<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value="24">24</option><option value="48">48</option><option value="96">96</option><option value="250">250</option><option value="1000">1.000</option><option value="5000">5.000</option></select></label><div className="view-panel-group"><span>Layout</span><div className="view-segmented"><button className={viewLayout === 'grid' ? 'active' : ''} onClick={() => setViewLayout('grid')}><LayoutGrid /> Griglia</button><button className={viewLayout === 'list' ? 'active' : ''} onClick={() => setViewLayout('list')}><List /> Lista</button></div></div><div className="view-panel-group"><span>Annunci per riga</span><div className="view-segmented view-columns">{[2, 3, 4, 5, 6].map((value) => <button key={value} className={columns === value ? 'active' : ''} onClick={() => setColumns(value)}>{value}</button>)}</div></div><div className="view-panel-group"><span>Dettagli card</span><div className="view-segmented"><button className={cardDetails === 'full' ? 'active' : ''} onClick={() => setCardDetails('full')}>Completi</button><button className={cardDetails === 'minimal' ? 'active' : ''} onClick={() => setCardDetails('minimal')}>Essenziali</button></div></div></div>
}

function EmptyState({ canManage, onUpload }: { canManage: boolean; onUpload: () => void }) { return <div className="flex min-h-107.5 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 text-center"><div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileUp className="size-7" /></div><h3 className="text-xl font-semibold">La vetrina sta per aprire</h3><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{canManage ? 'Aggiungi il primo annuncio per iniziare a costruire la tua vetrina online.' : 'Gli articoli della collezione appariranno qui presto.'}</p>{canManage && <button onClick={onUpload} className="mt-6 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90">Aggiungi annuncio</button>}</div> }

function BulkActionBar({ count, onDelete, onEdit }: { count: number; onDelete: () => void; onEdit: () => void }) {
  return <div className="bulk-action-bar"><strong>{count} selezionati</strong><button onClick={onEdit}>Modifica selezionati</button><button className="danger" onClick={onDelete}>Elimina selezionati</button></div>
}

function BulkEditPanel({ selectedCount, darkMode, onApply, onClose }: { selectedCount: number; darkMode: boolean; onApply: (changes: { category?: string; price?: number; quantity?: number }) => void; onClose: () => void }) {
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  return <div className={`editor-overlay ${darkMode ? 'editor-dark' : ''}`} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="bulk-editor" role="dialog" aria-modal="true"><div className="editor-heading"><div><p className="editor-kicker">Modifica di gruppo</p><h2>{selectedCount} annunci</h2></div><button onClick={onClose} aria-label="Chiudi"><X /></button></div><p className="editor-help">Compila solo i campi che vuoi applicare a tutti gli articoli selezionati.</p><label>Categoria<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Lascia invariata" /></label><label>Prezzo unico (€)<input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Lascia invariato" /></label><label>Quantità unica<input type="number" min="0" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Lascia invariata" /></label><div className="editor-actions"><button onClick={onClose}>Annulla</button><button className="editor-save" onClick={() => onApply({ ...(category ? { category } : {}), ...(price ? { price: Number(price) } : {}), ...(quantity ? { quantity: Number(quantity) } : {}) })}>Applica modifiche</button></div></section></div>
}

function ProductEditorModal({ product, formatPrice, ebayUrl, canManage, darkMode, onSave, onDelete, onAddToCart, onClose }: { product: Product; formatPrice: (price: number) => string; ebayUrl: (id: string) => string; canManage: boolean; darkMode: boolean; onSave: (product: Product) => Promise<void>; onDelete: (product: Product) => Promise<void>; onAddToCart: (product: Product) => void; onClose: () => void }) {
  if (!canManage) return <CustomerProductModal product={product} formatPrice={formatPrice} ebayUrl={ebayUrl} darkMode={darkMode} onAddToCart={onAddToCart} onClose={onClose} />
  const [draft, setDraft] = useState(product)
  const [imageUrl, setImageUrl] = useState('')
  const [showUrlForm, setShowUrlForm] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const imageRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function uploadImage(file?: File) {
    if (!file || !supabase || !canManage) return
    setIsUploading(true)
    const extension = file.name.split('.').pop() || 'jpg'
    const path = `${draft.id}/${Date.now()}.${extension}`
    const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: false })
    if (error) setIsUploading(false)
    else {
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      setDraft((current) => ({ ...current, images: [...current.images.filter((image) => image !== FALLBACK_IMAGE), data.publicUrl] }))
      setIsUploading(false)
    }
  }

  function addImageUrl() {
    const url = imageUrl.trim()
    if (!url || !/^https?:\/\//i.test(url)) return
    setDraft((current) => ({ ...current, images: [...current.images.filter((image) => image !== FALLBACK_IMAGE), url] }))
    setImageUrl('')
    setShowUrlForm(false)
  }

  function removeImage(image: string) {
    setDraft((current) => ({ ...current, images: current.images.filter((item) => item !== image) }))
  }

  return <div className={`editor-overlay ${darkMode ? 'editor-dark' : ''}`} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="product-editor" role="dialog" aria-modal="true" aria-label="Modifica annuncio">
      <div className="editor-heading"><div><p className="editor-kicker">Gestione annuncio</p><h2>Modifica prodotto</h2></div><button onClick={onClose} aria-label="Chiudi"><X /></button></div>
      <div className="editor-body">
        <div className="editor-images">
          <div className="editor-image-main"><img src={draft.images[0] || FALLBACK_IMAGE} alt={draft.title} onError={(event) => { event.currentTarget.src = FALLBACK_IMAGE }} /><span>{draft.images.length} foto reali</span></div>
          <div className="editor-thumbs">{draft.images.map((image) => <div key={image} className="editor-thumb"><img src={image} alt="" onError={(event) => { event.currentTarget.src = FALLBACK_IMAGE }} /><button type="button" onClick={() => removeImage(image)} aria-label="Rimuovi foto"><X /></button></div>)}</div>
          <div className="editor-photo-actions"><button type="button" className="editor-add-image" onClick={() => imageRef.current?.click()} disabled={isUploading}><Plus />{isUploading ? 'Carico…' : 'Carica file'}</button><button type="button" className="editor-add-image" onClick={() => setShowUrlForm((open) => !open)}><Plus />Aggiungi foto via link</button><input ref={imageRef} type="file" accept="image/*" className="sr-only" onChange={(event) => uploadImage(event.target.files?.[0])} /></div>
          {showUrlForm && <form className="editor-url-form" onSubmit={(event) => { event.preventDefault(); addImageUrl() }}><label>URL della foto<input autoFocus type="url" required value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://esempio.it/foto.jpg" /></label><div><button type="button" onClick={() => setShowUrlForm(false)}>Annulla</button><button type="submit" className="editor-save">Aggiungi link</button></div></form>}
          <p className="editor-image-help">I file vengono salvati in Supabase Storage. I link restano esterni e non consumano spazio.</p>
        </div>
        <div className="editor-fields"><label>Titolo<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>Descrizione<textarea value={draft.description || ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={4} /></label><div className="editor-field-row"><label>Prezzo (€)<input type="number" min="0" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} /></label><label>Quantità<input type="number" min="0" step="1" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: Number(event.target.value) })} /></label></div><label>Categoria<input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label><p className="editor-id">ID annuncio: {draft.id} · {formatPrice(draft.price)}</p></div>
      </div>
      <div className="editor-actions"><button className="editor-delete" onClick={() => onDelete(product)}>Elimina annuncio</button><div><a href={ebayUrl(draft.id)} target="_blank" rel="noreferrer">Apri origine</a><button onClick={onClose}>Annulla</button><button className="editor-save" onClick={() => onSave(draft)}>Salva modifiche</button></div></div>
    </section>
  </div>
}

function CustomerProductModal({ product, formatPrice, ebayUrl, darkMode, onAddToCart, onClose }: { product: Product; formatPrice: (price: number) => string; ebayUrl: (id: string) => string; darkMode: boolean; onAddToCart: (product: Product) => void; onClose: () => void }) {
  return <div className={`editor-overlay customer-product-overlay ${darkMode ? 'editor-dark' : ''}`} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="customer-product-modal" role="dialog" aria-modal="true" aria-label="Dettaglio prodotto"><div className="customer-product-top"><p>Dettaglio articolo</p><button onClick={onClose} aria-label="Chiudi"><X /></button></div><div className="customer-product-content"><div className="customer-product-image"><img src={product.images[0] || FALLBACK_IMAGE} alt={product.title} onError={(event) => { event.currentTarget.src = FALLBACK_IMAGE }} /><span>{product.quantity > 0 ? 'Disponibile' : 'Esaurito'}</span></div><div className="customer-product-info"><p className="editor-kicker">{product.category}</p><h2>{product.title}</h2><p className="customer-product-description">{product.description || 'Un pezzo selezionato da Tesori Italia \'900s.'}</p><div className="customer-product-price">{formatPrice(product.price)}</div><div className="customer-product-saving">Prezzo più conveniente: qui non applichiamo le commissioni eBay.</div><div className="customer-product-actions"><button className="customer-buy-button" onClick={() => window.open(ebayUrl(product.id), '_blank', 'noopener,noreferrer')}>Acquista su eBay <ExternalLink /></button><button className="customer-cart-button" onClick={() => onAddToCart(product)}><ShoppingBag /> Aggiungi al carrello</button></div><p className="customer-product-note">Il pagamento online sarà disponibile prossimamente.</p></div></div></section></div>
}

function CartPage({ cart, total, darkMode, onRemove, onClose }: { cart: Product[]; total: number; darkMode: boolean; onRemove: (id: string) => void; onClose: () => void }) {
  return <div className={`cart-page ${darkMode ? 'cart-dark' : ''}`}><header className="cart-page-header"><div><p>TESORI ITALIA '900S</p><h1>Il tuo carrello</h1></div><button onClick={onClose} aria-label="Chiudi carrello"><X /></button></header><main className="cart-page-content">{cart.length ? <><div className="cart-page-list">{cart.map((product) => <article key={product.id} className="cart-line"><img src={product.images[0] || FALLBACK_IMAGE} alt={product.title} onError={(event) => { event.currentTarget.src = FALLBACK_IMAGE }} /><div><p>{product.category}</p><h2>{product.title}</h2><strong>{product.price.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</strong></div><button onClick={() => onRemove(product.id)} aria-label={`Rimuovi ${product.title}`}><X /></button></article>)}</div><aside className="cart-summary"><span>Totale provvisorio</span><strong>{total.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</strong><p>Pagamento online disponibile prossimamente.</p><button>Procedi al pagamento</button></aside></> : <div className="cart-empty"><ShoppingBag /><h2>Il carrello è vuoto</h2><p>Aggiungi i tuoi articoli preferiti per ritrovarli qui.</p><button onClick={onClose}>Continua lo shopping</button></div>}</main></div>
}

function LegacyProductEditorModal({ product, formatPrice, ebayUrl, canManage, onSave, onDelete, onClose }: { product: Product; formatPrice: (price: number) => string; ebayUrl: (id: string) => string; canManage: boolean; onSave: (product: Product) => Promise<void>; onDelete: (product: Product) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(product)
  const [isUploading, setIsUploading] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const imageRef = useRef<HTMLInputElement>(null)
  useEffect(() => { const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey) }, [onClose])
  async function uploadImage(file?: File) {
    if (!file || !supabase || !canManage) return
    setIsUploading(true)
    const extension = file.name.split('.').pop() || 'jpg'
    const path = `${draft.id}/${Date.now()}.${extension}`
    const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: false })
    if (error) setIsUploading(false)
    else { const { data } = supabase.storage.from('product-images').getPublicUrl(path); setDraft((current) => ({ ...current, images: [...current.images.filter((image) => image !== FALLBACK_IMAGE), data.publicUrl] })); setIsUploading(false) }
  }
  async function removeImage(image: string) {
    const marker = '/storage/v1/object/public/product-images/'
    if (supabase && image.includes(marker)) await supabase.storage.from('product-images').remove([decodeURIComponent(image.split(marker)[1])])
    setDraft((current) => ({ ...current, images: current.images.filter((item) => item !== image) }))
  }
  function addImageUrl() {
    const url = imageUrl.trim()
    if (!url) return
    setDraft((current) => ({ ...current, images: [...current.images.filter((image) => image !== FALLBACK_IMAGE), url] }))
    setImageUrl('')
  }
  return <div className="editor-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="product-editor" role="dialog" aria-modal="true" aria-label="Modifica annuncio"><div className="editor-heading"><div><p className="editor-kicker">Gestione annuncio</p><h2>Modifica prodotto</h2></div><button onClick={onClose} aria-label="Chiudi"><X /></button></div><div className="editor-body"><div className="editor-images"><div className="editor-image-main"><img src={draft.images[0] || FALLBACK_IMAGE} alt={draft.title} onError={(event) => { event.currentTarget.src = FALLBACK_IMAGE }} /><span>{draft.images.length} foto</span></div><div className="editor-thumbs">{draft.images.map((image) => <div key={image} className="editor-thumb"><img src={image} alt="" onError={(event) => { event.currentTarget.src = FALLBACK_IMAGE }} /><button type="button" onClick={() => removeImage(image)} aria-label="Rimuovi foto"><X /></button></div>)}<button type="button" className="editor-add-image" onClick={() => imageRef.current?.click()} disabled={isUploading}><Plus />{isUploading ? 'Carico…' : 'Aggiungi foto'}</button><input ref={imageRef} type="file" accept="image/*" className="sr-only" onChange={(event) => uploadImage(event.target.files?.[0])} /></div></div><div className="editor-fields"><label>Titolo<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>Descrizione<textarea value={draft.description || ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={4} /></label><div className="editor-field-row"><label>Prezzo (€)<input type="number" min="0" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} /></label><label>Quantità<input type="number" min="0" step="1" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: Number(event.target.value) })} /></label></div><label>Categoria<input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label><p className="editor-id">ID annuncio: {draft.id} · {formatPrice(draft.price)}</p></div></div><div className="editor-actions"><button className="editor-delete" onClick={() => onDelete(product)}>Elimina annuncio</button><div><a href={ebayUrl(draft.id)} target="_blank" rel="noreferrer">Apri origine</a><button onClick={onClose}>Annulla</button><button className="editor-save" onClick={() => onSave(draft)}>Salva modifiche</button></div></div></section></div>
}

function ProductModal({ product, formatPrice, ebayUrl, onClose }: { product: Product; formatPrice: (price: number) => string; ebayUrl: (id: string) => string; onClose: () => void }) {
  const [imageIndex, setImageIndex] = useState(0)
  useEffect(() => { const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose(); document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey) }, [onClose])
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/75 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Dettaglio prodotto" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl"><div className="flex items-center justify-between border-b border-border px-5 py-4"><p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Dettaglio annuncio</p><button onClick={onClose} className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Chiudi"><X className="size-5" /></button></div><div className="grid gap-6 p-5 md:grid-cols-[minmax(280px,0.9fr)_1.1fr] md:p-7"><div><div className="aspect-square overflow-hidden rounded-xl bg-muted"><img src={product.images[imageIndex]} alt={product.title} className="size-full object-cover" onError={(event) => { event.currentTarget.src = FALLBACK_IMAGE }} /></div>{product.images.length > 1 && <div className="mt-3 flex gap-2 overflow-auto">{product.images.map((image, index) => <button key={image} onClick={() => setImageIndex(index)} className={`size-16 shrink-0 overflow-hidden rounded-lg border-2 ${index === imageIndex ? 'border-primary' : 'border-transparent'}`}><img src={image} alt="" className="size-full object-cover" /></button>)}</div>}</div><div className="flex flex-col"><p className="font-mono text-xs uppercase tracking-widest text-primary">{product.category}</p><h2 className="mt-3 text-2xl font-semibold leading-tight tracking-tight">{product.title}</h2><div className="mt-6 flex items-end justify-between border-y border-border py-5"><div><p className="text-3xl font-bold">{formatPrice(product.price)}</p><p className="mt-1 text-sm text-muted-foreground">Giacenza totale: {product.quantity} pezzi</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${product.quantity ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>{product.quantity ? 'Disponibile' : 'Esaurito'}</span></div>{product.variants.length > 0 && <div className="mt-5"><h3 className="text-sm font-semibold">Varianti ({product.variants.length})</h3><ul className="mt-2 max-h-32 space-y-2 overflow-auto text-sm text-muted-foreground">{product.variants.map((variant) => <li key={variant} className="rounded-lg bg-muted px-3 py-2">{variant}</li>)}</ul></div>}<div className="mt-auto flex flex-wrap gap-3 pt-7"><a href={ebayUrl(product.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90">Apri su eBay <ExternalLink className="size-4" /></a><span className="inline-flex items-center rounded-lg border border-border px-4 py-3 font-mono text-xs text-muted-foreground">ID {product.id}</span></div><p className="mt-4 text-xs leading-5 text-muted-foreground">Le immagini vengono lette dal campo PicURL del CSV. Per motivi di sicurezza del browser non è possibile fare scraping automatico della pagina eBay.</p></div></div></div></div>
}
