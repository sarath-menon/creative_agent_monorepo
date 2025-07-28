import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  checkAccessibilityPermission,
  requestAccessibilityPermission,
  checkFullDiskAccessPermission,
  requestFullDiskAccessPermission,
  checkScreenRecordingPermission,
  requestScreenRecordingPermission,
  checkMicrophonePermission,
  requestMicrophonePermission
} from 'tauri-plugin-macos-permissions-api';

// Accessibility Permission Hook
export function useAccessibilityPermission(enabled: boolean = true) {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['permission', 'accessibility'],
    queryFn: checkAccessibilityPermission,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled,
  });

  const mutation = useMutation({
    mutationFn: requestAccessibilityPermission,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permission', 'accessibility'] });
    },
  });

  return {
    isGranted: query.data ?? false,
    isLoading: query.isLoading,
    error: query.error,
    request: mutation.mutate,
    isRequesting: mutation.isPending,
  };
}

// Full Disk Access Permission Hook
export function useFullDiskAccessPermission(enabled: boolean = true) {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['permission', 'fullDiskAccess'],
    queryFn: checkFullDiskAccessPermission,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled,
  });

  const mutation = useMutation({
    mutationFn: requestFullDiskAccessPermission,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permission', 'fullDiskAccess'] });
    },
  });

  return {
    isGranted: query.data ?? false,
    isLoading: query.isLoading,
    error: query.error,
    request: mutation.mutate,
    isRequesting: mutation.isPending,
  };
}

// Screen Recording Permission Hook
export function useScreenRecordingPermission(enabled: boolean = true) {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['permission', 'screenRecording'],
    queryFn: checkScreenRecordingPermission,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled,
  });

  const mutation = useMutation({
    mutationFn: requestScreenRecordingPermission,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permission', 'screenRecording'] });
    },
  });

  return {
    isGranted: query.data ?? false,
    isLoading: query.isLoading,
    error: query.error,
    request: mutation.mutate,
    isRequesting: mutation.isPending,
  };
}

// Microphone Permission Hook
export function useMicrophonePermission(enabled: boolean = true) {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['permission', 'microphone'],
    queryFn: checkMicrophonePermission,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled,
  });

  const mutation = useMutation({
    mutationFn: requestMicrophonePermission,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permission', 'microphone'] });
    },
  });

  return {
    isGranted: query.data ?? false,
    isLoading: query.isLoading,
    error: query.error,
    request: mutation.mutate,
    isRequesting: mutation.isPending,
  };
}