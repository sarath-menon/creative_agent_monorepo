import { useState, useEffect } from 'react';
import { readDir, BaseDirectory } from '@tauri-apps/plugin-fs';
import * as path from '@tauri-apps/api/path';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  extension?: string;
}

export const useFileSystem = () => {
  const [currentFiles, setCurrentFiles] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentDirectory, setCurrentDirectory] = useState<string>('');

  const loadCurrentDirectory = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Get home directory
      const homeDir = await path.homeDir();
      setCurrentDirectory(homeDir);
      
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
      
      
      setCurrentFiles(fileEntries);
    } catch (err) {
      console.error('Failed to load directory:', err);
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCurrentDirectory();
  }, []);

  return {
    currentFiles,
    isLoading,
    error,
    currentDirectory,
    refresh: loadCurrentDirectory
  };
};