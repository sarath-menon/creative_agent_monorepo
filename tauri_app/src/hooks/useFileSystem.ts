import { useQuery } from '@tanstack/react-query';
import { readDir, BaseDirectory } from '@tauri-apps/plugin-fs';
import * as path from '@tauri-apps/api/path';
import { filterAndSortEntries, type FileEntry } from '@/lib/fileUtils';

export type { FileEntry };

interface FileSystemData {
  files: FileEntry[];
  currentDirectory: string;
}

const fetchFileSystemData = async (): Promise<FileSystemData> => {
  try {
    // Get home directory
    const homeDir = await path.homeDir();
    
    // Read directory contents from home directory for now
    const entries = await readDir('.', { 
      baseDir: BaseDirectory.Desktop,
    });

    const fileEntries = filterAndSortEntries(entries);
    
    return {
      files: fileEntries,
      currentDirectory: homeDir
    };
  } catch (error) {
    console.error('Failed to load directory:', error);
    throw error;
  }
};

const fetchDirectoryContents = async (dirPath: string): Promise<FileEntry[]> => {
  try {
    // Read directory contents from the specified path
    const entries = await readDir(dirPath, { 
      baseDir: BaseDirectory.Desktop,
    });

    return filterAndSortEntries(entries, dirPath);
  } catch (error) {
    console.error('Failed to load directory contents:', error);
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

  const fetchDirectoryContentsWrapper = async (dirPath: string) => {
    return await fetchDirectoryContents(dirPath);
  };

  return {
    currentFiles: data?.files ?? [],
    isLoading,
    error: error?.message ?? null,
    currentDirectory: data?.currentDirectory ?? '',
    refresh: refetch,
    fetchFiles, // New method to trigger on-demand fetch
    fetchDirectoryContents: fetchDirectoryContentsWrapper // Expose directory contents function
  };
};