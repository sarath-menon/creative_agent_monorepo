import { useQuery } from '@tanstack/react-query';
import { readDir, BaseDirectory } from '@tauri-apps/plugin-fs';
import * as path from '@tauri-apps/api/path';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  extension?: string;
}

interface FileSystemData {
  files: FileEntry[];
  currentDirectory: string;
}

const fetchFileSystemData = async (): Promise<FileSystemData> => {
  console.log('🔍 fetchFileSystemData called - fetching file data on demand');
  try {
    // Get home directory
    const homeDir = await path.homeDir();
    
    // Read directory contents from home directory for now
    const entries = await readDir('.', { 
      baseDir: BaseDirectory.Desktop,
    });

    const fileEntries: FileEntry[] = entries
      .map(entry => {
        const extension = entry.isFile ? 
          entry.name.split('.').pop()?.toLowerCase() : undefined;
        
        const transformedEntry = {
          name: entry.name,
          path: entry.name,
          isDirectory: entry.isDirectory,
          extension
        };
      
        return transformedEntry;
      })
      .filter(entry => {
        // Filter out hidden files and common system files
        if (entry.name.startsWith('.')) {
          console.log(`Filtering out hidden: ${entry.name}`);
          return false;
        }
        
        if (entry.isDirectory) {
          console.log(`Including directory: ${entry.name}`);
          return true;
        }
        
        // Include common file types
        const allowedExtensions = [
          'txt', 'md', 'js', 'ts', 'tsx', 'jsx', 'py', 'json', 'html', 'css',
          'go', 'rs', 'cpp', 'c', 'h', 'java', 'php', 'rb', 'sh', 'yml', 'yaml',
          'xml', 'csv', 'log', 'conf', 'cfg', 'ini', 'toml'
        ];
        
        const includeFile = !entry.extension || allowedExtensions.includes(entry.extension);
        return includeFile;
      })
      .sort((a, b) => {
        // Sort directories first, then files alphabetically
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    
    return {
      files: fileEntries,
      currentDirectory: homeDir
    };
  } catch (error) {
    console.error('Failed to load directory:', error);
    throw error;
  }
};

export const useFileSystem = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['fileSystem'],
    queryFn: fetchFileSystemData,
    enabled: false, // Don't fetch automatically
    staleTime: 0, // Always refetch when manually triggered
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });

  const fetchFiles = () => {
    return refetch();
  };

  return {
    currentFiles: data?.files ?? [],
    isLoading,
    error: error?.message ?? null,
    currentDirectory: data?.currentDirectory ?? '',
    refresh: refetch,
    fetchFiles // New method to trigger on-demand fetch
  };
};