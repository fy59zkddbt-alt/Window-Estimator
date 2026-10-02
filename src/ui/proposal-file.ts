export function canShareProposal(file: File, browser: Pick<Navigator, 'share' | 'canShare'> = navigator): boolean {
  try { return typeof browser.share === 'function' && typeof browser.canShare === 'function' && browser.canShare({ files: [file] }); }
  catch { return false; }
}

export function downloadProposal(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url; link.download = file.name;
  document.body.append(link); link.click(); link.remove();
  // Give the browser time to consume the object URL before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
