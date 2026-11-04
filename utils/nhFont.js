// Loads the Spectral font NanoHive's serif headings use. One copy of the <link> code (it used to
// be pasted into the init plugin, the layout and the drawer); safe to call any number of times.
export function loadNhFont() {
  if (typeof document === 'undefined' || document.getElementById('nh-spectral-font')) return
  const link = document.createElement('link')
  link.id = 'nh-spectral-font'
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap'
  document.head.appendChild(link)
}
