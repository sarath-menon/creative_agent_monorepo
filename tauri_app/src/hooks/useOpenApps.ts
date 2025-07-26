import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

export interface OpenApp {
  name: string;
  icon_png_base64: string;
}

const fetchVisibleApps = async (): Promise<OpenApp[]> => {
  try {
    const apps = await invoke<OpenApp[]>('list_apps_with_icons');
    return apps;
  } catch (error) {
    throw error;
  }
};

export function useOpenApps() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['openApps'],
    queryFn: fetchVisibleApps,
    refetchInterval: 10000, // 10 seconds
    staleTime: 5000, // Consider data fresh for 5 seconds
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });

  return {
    apps: data ?? [],
    isLoading,
    error: error?.message ?? null,
    refreshApps: refetch
  };
}