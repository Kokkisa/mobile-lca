import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { loadTier1 } from './lib/tiers';
import VoiceScreen from './screens/VoiceScreen';
import SettingsScreen from './screens/SettingsScreen';

export default function App() {
  const screen = useStore((s) => s.screen);
  const hydrate = useStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
    // Fire-and-forget: tier1 fetch is independent of the rest of the
    // app; matching just returns null until the bank arrives.
    void loadTier1();
  }, [hydrate]);

  return (
    <div className="relative h-full w-full bg-bg text-text overflow-hidden">
      <VoiceScreen />
      {screen === 'settings' && (
        <div className="absolute inset-0 z-50 animate-slide-up bg-bg">
          <SettingsScreen />
        </div>
      )}
    </div>
  );
}
