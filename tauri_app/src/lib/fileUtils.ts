export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  extension?: string;
}

const MEDIA_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
  'mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'
];

const CODE_EXTENSIONS = [
  'txt', 'md', 'js', 'ts', 'tsx', 'jsx', 'py', 'json', 'html', 'css',
  'go', 'rs', 'cpp', 'c', 'h', 'java', 'php', 'rb', 'sh', 'yml', 'yaml',
  'xml', 'csv', 'log', 'conf', 'cfg', 'ini', 'toml'
];

export const filterAndSortEntries = (entries: any[], basePath = '') => {
  return entries
    .map(entry => ({
      name: entry.name,
      path: basePath ? `${basePath}/${entry.name}` : entry.name,
      isDirectory: entry.isDirectory,
      extension: entry.isFile ? entry.name.split('.').pop()?.toLowerCase() : undefined
    }))
    .filter(entry => {
      if (entry.name.startsWith('.')) return false;
      if (entry.isDirectory) return true;
      return !entry.extension || CODE_EXTENSIONS.includes(entry.extension);
    })
    .sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
};

export const getMediaFiles = (files: FileEntry[]) => {
  return files.filter(f => 
    f.isDirectory || 
    (f.extension && MEDIA_EXTENSIONS.includes(f.extension))
  );
};

export const getParentPath = (path: string): string | null => {
  const parts = path.split('/');
  parts.pop();
  return parts.length > 0 ? parts.join('/') : null;
};

export const isMediaFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? MEDIA_EXTENSIONS.includes(ext) : false;
};

export const isImageFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext) : false;
};