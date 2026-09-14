// The site as an app: installing it from Chrome, and being opened from Finder with a `.scug` file.
//
// Jared: "is there a way to create a .scug file that lives in a project folder that when clicked on launches
// the dashboard in a browser. or better yet a local version of the webtool?"
//
// The site's manifest (manifest.webmanifest, beside this page in dist/) names `.scug` as a file type the
// installed app opens. Once someone has installed the app from Chrome, double-clicking a `.scug` in Finder
// opens this page in the app with the file in its launch queue. The file holds the project's id; the folder
// is looked up from what this browser remembers (useProject.ts), and asked for once when it has never seen it.
//
// Nothing here is a requirement: in a browser that has none of this, the page works as before.

import { useEffect, useState } from 'preact/hooks';

import { readLauncher, type Launcher } from '../model/project.ts';

/** Where the tools live for the team. A `.scug` written from a development server still points here. */
export const LIVE_SITE = 'https://switchyardsnwc.github.io/Scugnizzi-Tools/';

/** The Project page to write into a launch file: this page, unless it is a development server. */
export function launcherUrl(): string {
  const here = new URL('project.html', window.location.href);
  if (here.hostname === 'localhost' || here.hostname === '127.0.0.1') return `${LIVE_SITE}template-studio/dist/project.html`;
  return here.href;
}

/** A launch file as it arrived: what it says, and what it was called. */
export interface LaunchedFile {
  launcher: Launcher;
  fileName: string;
}

interface LaunchParams {
  files?: FileSystemHandle[];
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

/**
 * Hands over every `.scug` the app is opened with, now and while the page stays open. `onBad` hears about a
 * file that is not a launch file. Does nothing outside an installed app.
 */
export function watchLaunches(onFile: (file: LaunchedFile) => void, onBad: (fileName: string) => void): void {
  const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
  if (!queue?.setConsumer) return;
  queue.setConsumer((params) => {
    void (async () => {
      for (const handle of params.files ?? []) {
        if (handle.kind !== 'file') continue;
        let text = '';
        try {
          text = await (await (handle as FileSystemFileHandle).getFile()).text();
        } catch {
          text = '';
        }
        const launcher = readLauncher(text);
        if (launcher) onFile({ launcher, fileName: handle.name });
        else onBad(handle.name);
      }
    })();
  });
}

// --- installing ------------------------------------------------------------------------------------------------

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState = 'unavailable' | 'installable' | 'installed';

/**
 * Whether Chrome offers to install the site, with the click that asks it to. `installed` while the page is
 * running as the app, or after installing from here. `unavailable` when Chrome has not offered, which it does
 * not until the page has been open a moment, and never while the app is already installed.
 */
export function useInstall(): { state: InstallState; install(): Promise<boolean> } {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [state, setState] = useState<InstallState>(() => (isInstalledApp() ? 'installed' : 'unavailable'));

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
      setState((s) => (s === 'installed' ? s : 'installable'));
    };
    const onInstalled = () => {
      setPrompt(null);
      setState('installed');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!prompt) return false;
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') setState('installed');
      return outcome === 'accepted';
    } catch {
      return false;
    } finally {
      setPrompt(null);
      setState((s) => (s === 'installed' ? s : 'unavailable'));
    }
  };

  return { state, install };
}

export const isInstalledApp = (): boolean => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches;
  } catch {
    return false;
  }
};
