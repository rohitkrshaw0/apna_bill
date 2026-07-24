// backup/destinations/localDiskBackupDestination.js
// Implements backupDestinationContract.js's IBackupDestination by triggering
// a browser download -- the only "local disk" write a browser sandbox
// permits without a native file-system permission prompt. Same
// Blob -> object URL -> synthetic <a> click technique as
// xml/export/download.js; this one lives here (not under xml/) because it
// is format-agnostic -- any Blob, any mime type -- so any future backup
// provider (not just apnabill's) can reuse it, matching this contract's own
// header comment that local disk, Supabase Storage, Drive, Dropbox, and S3
// are all equally valid, interchangeable implementations of one shape.
//
// download/list/delete are deliberately left unimplemented: a browser-
// triggered download exposes no path back to the app -- the user's browser,
// not this code, decides where the file actually lands -- so there is
// nothing here to read back, enumerate, or delete. A future "restore from
// local file" flow reads via <input type=file> or the File System Access
// API instead: a completely different, user-initiated read, not this
// destination's download().

export function createLocalDiskBackupDestination () {
  async function upload (blob, meta = {}) {
    const filename = meta.filename || `backup-${Date.now()}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { location: filename, uploadedAt: new Date().toISOString() };
  }

  return { upload };
}
