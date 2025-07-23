
import './App.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/ui/theme-provider';
import {ChatApp} from '@/components/chat-app';


const queryClient = new QueryClient();



const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">

        <ChatApp />

      </ThemeProvider>
    </QueryClientProvider>
  );
};
export default App;
