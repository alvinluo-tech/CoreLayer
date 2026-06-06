import { AssistantMirror } from '@/components/voice/AssistantMirror';
import { AppShell } from '@/components/shell/AppShell';

const isAssistantWindow =
  typeof window !== 'undefined' && window.location.search.includes('assistant=true');

function App() {
  if (isAssistantWindow) {
    return <AssistantMirror />;
  }
  return <AppShell />;
}

export default App;
