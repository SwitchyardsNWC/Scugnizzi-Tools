// TypeScript's DOM lib has FileSystemDirectoryHandle but not the async iteration or the permission
// methods, both of which the File System Access API has shipped in Chromium for years. Declared
// here rather than pulling in a dependency for four signatures.

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  keys(): AsyncIterableIterator<string>;
  values(): AsyncIterableIterator<FileSystemHandle>;
}

interface FileSystemHandle {
  queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}
