import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const layouts = [{ id: 'grid', label: '网格' }, { id: 'waterfall', label: '瀑布流' }, { id: 'row', label: '横向' }, { id: 'column', label: '纵向' }]
const backgrounds = [{ value: '#f7f7f1', label: '暖白 / Paper' }, { value: '#151715', label: '墨黑 / Ink' }, { value: '#c8f36b', label: '酸橙 / Acid' }, { value: 'transparent', label: '透明 / Alpha' }]
const sizes = [{ id: 'source', label: '原图尺寸', scale: 1 }, { id: '2k', label: '2K 长边', scale: 2048 }, { id: '4k', label: '4K 长边', scale: 4096 }, { id: 'square', label: '社交 1080', scale: 1080 }]

function App() {
  const [images, setImages] = useState([]), [layout, setLayout] = useState('grid'), [cols, setCols] = useState(3)
  const [gap, setGap] = useState(24), [background, setBackground] = useState('#f7f7f1'), [fit, setFit] = useState(true)
  const [radius, setRadius] = useState(0), [shadow, setShadow] = useState(false), [borderWidth, setBorderWidth] = useState(0), [borderColor, setBorderColor] = useState('#f7f7f1'), [sort, setSort] = useState('upload')
  const [exportSize, setExportSize] = useState('source'), [format, setFormat] = useState('png'), [filename, setFilename] = useState('compose-lab')
  const [toast, setToast] = useState(''), [dragIndex, setDragIndex] = useState(null), fileInput = useRef(null), previewRef = useRef(null)
  const notify = message => { setToast(message); window.clearTimeout(notify.timer); notify.timer = window.setTimeout(() => setToast(''), 2200) }

  const addFiles = files => {
    const valid = files.filter(file => file.type.startsWith('image/'))
    if (!valid.length) return notify('请拖入 JPG、PNG 或 WEBP 图片')
    Promise.all(valid.map(async file => new Promise(resolve => { const url = URL.createObjectURL(file), image = new Image(); image.onload = async () => resolve({ file, url, image, id: crypto.randomUUID(), captureTime: await getExifDate(file) }); image.src = url })))
      .then(next => { setImages(current => [...current, ...next]); notify(`已加入 ${next.length} 张图片`) })
  }
  const removeImage = id => setImages(current => { const item = current.find(x => x.id === id); if (item) URL.revokeObjectURL(item.url); return current.filter(x => x.id !== id) })
  const clearImages = () => { images.forEach(x => URL.revokeObjectURL(x.url)); setImages([]); notify('画布已清空') }
  const orderedImages = useMemo(() => sort === 'name' ? [...images].sort((a, b) => a.file.name.localeCompare(b.file.name, 'zh')) : sort === 'size' ? [...images].sort((a, b) => b.image.naturalWidth * b.image.naturalHeight - a.image.naturalWidth * a.image.naturalHeight) : sort === 'date' ? [...images].sort((a, b) => b.captureTime - a.captureTime) : images, [images, sort])

  const getLayoutBoxes = () => {
    const count = orderedImages.length
    if (!count) return { width: 0, height: 0, boxes: [] }
    const columns = layout === 'column' ? 1 : layout === 'row' ? count : Math.min(cols, count)
    let cellWidth = Math.max(...orderedImages.map(x => x.image.naturalWidth)); if (fit) cellWidth = Math.min(cellWidth, 2200)
    if (layout === 'waterfall') {
      const heights = Array(columns).fill(0), boxes = []
      orderedImages.forEach((item, index) => { const column = heights.indexOf(Math.min(...heights)); const width = cellWidth, height = cellWidth * item.image.naturalHeight / item.image.naturalWidth; boxes.push({ item, x: column * (cellWidth + gap), y: heights[column], width, height }); heights[column] += height + gap })
      return { width: columns * cellWidth + gap * (columns - 1), height: Math.max(...heights) - gap, boxes }
    }
    const rows = Math.ceil(count / columns), rowHeights = Array.from({ length: rows }, (_, row) => Math.max(...orderedImages.slice(row * columns, (row + 1) * columns).map(x => cellWidth * x.image.naturalHeight / x.image.naturalWidth)))
    const boxes = []; orderedImages.forEach((item, index) => { const row = Math.floor(index / columns), column = index % columns; boxes.push({ item, x: column * (cellWidth + gap), y: rowHeights.slice(0, row).reduce((a, b) => a + b, 0) + row * gap, width: cellWidth, height: cellWidth * item.image.naturalHeight / item.image.naturalWidth }) })
    return { width: columns * cellWidth + gap * (columns - 1), height: rowHeights.reduce((a, b) => a + b, 0) + gap * (rows - 1), boxes }
  }

  const drawCanvas = (targetCanvas, scaleOverride = 1) => {
    if (!orderedImages.length) return null
    const { width, height, boxes } = getLayoutBoxes()
    const scale = exportSize === 'source' ? scaleOverride : Math.min(1, sizes.find(x => x.id === exportSize).scale / Math.max(width, height))
    targetCanvas.width = Math.max(1, Math.round(width * scale)); targetCanvas.height = Math.max(1, Math.round(height * scale)); const ctx = targetCanvas.getContext('2d'); ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height)
    if (background !== 'transparent') { ctx.fillStyle = background; ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height) }
    boxes.forEach(({ item, x, y, width: w, height: h }) => { ctx.save(); ctx.beginPath(); roundedRect(ctx, x * scale, y * scale, w * scale, h * scale, radius * scale); ctx.clip(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(item.image, x * scale, y * scale, w * scale, h * scale); ctx.restore(); if (borderWidth) { ctx.save(); ctx.beginPath(); roundedRect(ctx, (x + borderWidth / 2) * scale, (y + borderWidth / 2) * scale, (w - borderWidth) * scale, (h - borderWidth) * scale, Math.max(0, radius - borderWidth / 2) * scale); ctx.strokeStyle = borderColor; ctx.lineWidth = borderWidth * scale; ctx.stroke(); ctx.restore() } })
    return { width, height }
  }
  const renderPreview = () => { const canvas = previewRef.current; if (!canvas || !orderedImages.length) return; const dimensions = drawCanvas(canvas, Math.min(1, 700 / Math.max(canvas.width || 1, 1))); canvas.style.width = `${Math.min(dimensions.width, 700)}px`; canvas.style.height = 'auto' }
  useEffect(() => { renderPreview() }, [orderedImages, layout, cols, gap, background, fit, radius, shadow, borderWidth, borderColor, exportSize])

  const exportImage = () => { if (!orderedImages.length) return; const canvas = document.createElement('canvas'); drawCanvas(canvas); const mime = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg'; const quality = format === 'png' ? undefined : .96; const link = document.createElement('a'); link.download = `${filename || 'compose-lab'}.${format}`; link.href = canvas.toDataURL(mime, quality); link.click(); notify(`${format.toUpperCase()} 已导出`) }
  const onDrop = event => { event.preventDefault(); event.currentTarget.classList.remove('drag'); addFiles([...event.dataTransfer.files]) }
  const reorder = index => { if (dragIndex === null || dragIndex === index) return; const fromId = orderedImages[dragIndex]?.id, toId = orderedImages[index]?.id; setImages(current => { const next = [...current], from = next.findIndex(item => item.id === fromId), to = next.findIndex(item => item.id === toId); if (from < 0 || to < 0) return current; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); return next }); setDragIndex(null) }

  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="mark" /><span>拼图暗房 / COMPOSE LAB</span></div><div className="topmeta">REACT · LOCAL · PRIVATE</div></header>
    <section className="hero"><div><div className="eyebrow">High fidelity image composer</div><h1>把每一帧<br />排成一张 <em>大图</em></h1></div><p className="hero-copy"><b>拖入多张图片，决定它们的秩序。</b><br />所有处理都在浏览器本地完成。原图尺寸、布局和导出格式，都由你掌控。</p></section>
    <section className="workspace">
      <div><div className="panel stage"><div className="stage-head"><span className="label">01 / Canvas preview</span><span className="counter">{images.length} FRAME{images.length === 1 ? '' : 'S'}</span></div><div className={`dropzone ${images.length ? 'has-images' : ''}`} onClick={() => !images.length && fileInput.current?.click()} onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag') }} onDragLeave={e => e.currentTarget.classList.remove('drag')} onDrop={onDrop}><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => addFiles([...e.target.files])} />{!images.length ? <div className="empty"><div className="upload-icon">＋</div><h3>把图片放进这里</h3><p>支持 JPG、PNG、WEBP · 可一次选择多张</p><div className="hint">或者点击浏览文件</div></div> : <div className="preview-canvas-wrap"><canvas ref={previewRef} className={`preview-canvas ${shadow ? 'with-shadow' : ''}`} /></div>}</div></div>
        <div className="strip"><div className="strip-head"><span className="label">02 / Sequence</span><span className="strip-note">拖拽缩略图调整顺序</span></div><div className="thumbs">{!images.length ? <div className="empty-strip">上传后，图片会在这里排队。</div> : orderedImages.map((item, index) => <div className="thumb" key={item.id} draggable onDragStart={() => setDragIndex(index)} onDragOver={e => e.preventDefault()} onDrop={() => reorder(index)}><img src={item.url} alt={item.file.name} /><span>0{index + 1}</span><button title="移除" onClick={() => removeImage(item.id)}>×</button></div>)}</div></div>
      </div>
      <aside className="panel side"><div className="side-head"><span className="label">03 / Arrangement</span><span className="counter">SETTINGS</span></div><Control title="排列方式"><div className="seg">{layouts.map(item => <button className={layout === item.id ? 'active' : ''} key={item.id} onClick={() => setLayout(item.id)}>{item.label}</button>)}</div></Control><Control title="每行图片数" value={cols}><input className="range" type="range" min="1" max="6" value={cols} onChange={e => setCols(+e.target.value)} /></Control><Control title="图片间距" value={`${gap} px`}><input className="range" type="range" min="0" max="80" value={gap} onChange={e => setGap(+e.target.value)} /></Control><Control title="画布背景"><select className="select" value={background} onChange={e => setBackground(e.target.value)}>{backgrounds.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></Control><Control title="图片细节"><div className="mini-grid"><label>圆角 <b>{radius}px</b><input className="range" type="range" min="0" max="48" value={radius} onChange={e => setRadius(+e.target.value)} /></label><label>阴影 <input type="checkbox" checked={shadow} onChange={e => setShadow(e.target.checked)} /></label></div><div className="border-controls"><label>边框 <b>{borderWidth}px</b><input className="range" type="range" min="0" max="32" value={borderWidth} onChange={e => setBorderWidth(+e.target.value)} /></label><input className="color-input" type="color" value={borderColor} onChange={e => setBorderColor(e.target.value)} aria-label="边框颜色" /></div></Control><Control title="图片信息"><div className="info-card">{images.length ? <><span>{images.length} 张图片</span><span>{images.reduce((total, item) => total + item.image.naturalWidth * item.image.naturalHeight, 0).toLocaleString()} 总像素</span><span>最大 {Math.max(...images.map(item => item.image.naturalWidth))} × {Math.max(...images.map(item => item.image.naturalHeight))} px</span></> : <span>上传图片后显示尺寸与像素信息</span>}</div></Control><Control title="整理与导出"><div className="stack"><select className="select" value={sort} onChange={e => setSort(e.target.value)}><option value="upload">按上传顺序</option><option value="name">按文件名</option><option value="size">按图片尺寸</option><option value="date">按拍摄时间</option></select><select className="select" value={exportSize} onChange={e => setExportSize(e.target.value)}>{sizes.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select><div className="export-row"><select className="select" value={format} onChange={e => setFormat(e.target.value)}><option value="png">PNG 无损</option><option value="jpg">JPG 96%</option><option value="webp">WEBP 96%</option></select><input className="select filename" value={filename} onChange={e => setFilename(e.target.value)} aria-label="导出文件名" /></div></div></Control><div className="export"><button className="ghost" onClick={clearImages}>清空</button><button className="primary" disabled={!images.length} onClick={exportImage}>导出 {format.toUpperCase()} ↗</button></div></aside>
    </section><footer className="footer"><span>PIXELS STAY PIXELS <b>·</b> EXPORT AT SOURCE RESOLUTION</span><span>NO UPLOADS / NO TRACKING</span></footer>{toast && <div className="toast show">{toast}</div>}
  </main>
}
function Control({ title, value, children }) { return <div className="control"><div className="control-title"><span>{title}</span>{value !== undefined && <span className="value">{value}</span>}</div>{children}</div> }
function roundedRect(ctx, x, y, width, height, radius) { const r = Math.min(radius, width / 2, height / 2); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r); ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath() }
async function getExifDate(file) { if (!file.type.includes('jpeg')) return file.lastModified; try { const buffer = await file.arrayBuffer(), view = new DataView(buffer); if (view.getUint16(0) !== 0xffd8) return file.lastModified; let offset = 2; while (offset < view.byteLength) { if (view.getUint8(offset) !== 0xff) break; const marker = view.getUint8(offset + 1), length = view.getUint16(offset + 2); if (marker === 0xe1 && view.getUint32(offset + 4) === 0x45786966) { const tiff = offset + 10, little = view.getUint16(tiff) === 0x4949, u16 = p => view.getUint16(p, little), u32 = p => view.getUint32(p, little), ifd = tiff + u32(tiff + 4), entries = u16(ifd); for (let i = 0; i < entries; i++) { const entry = ifd + 2 + i * 12, tag = u16(entry); if ([0x9003, 0x9004, 0x0132].includes(tag)) { const ptr = tiff + u32(entry + 8), text = new TextDecoder().decode(new Uint8Array(buffer, ptr, 19)).replace(/\0/g, '').replace(/:/g, '-').replace(' ', 'T'); const time = Date.parse(text); if (!Number.isNaN(time)) return time } } } offset += 2 + length } } catch { /* use file modified time when EXIF is unavailable */ } return file.lastModified }
createRoot(document.getElementById('root')).render(<App />)
