'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { ChevronDown, Check, DownloadCloud, Sparkles } from 'lucide-react';
import { useChatContext } from './hooks/ChatContext';

type AgentItem = {
  name: string;
  description: string;
  author?: string;
  tags?: string[];
  installed: boolean;
};

type AgentsResponse = {
  installed: AgentItem[];
  available: AgentItem[];
  current?: { name?: string | null };
};

type AgentSelectorProps = {
  mode?: 'default' | 'badge' | 'title';
};

export default function AgentSelector({ mode = 'default' }: AgentSelectorProps) {
  const { returnToWelcome } = useChatContext();

  const [installed, setInstalled] = useState<AgentItem[]>([]);
  const [available, setAvailable] = useState<AgentItem[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [open, setOpen] = useState(false);

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      if (!res.ok) throw new Error('Failed to fetch agents');
      const data: AgentsResponse = await res.json();
      setInstalled(data.installed || []);
      setAvailable(data.available || []);
      setCurrent(data.current?.name ?? null);
    } catch (err) {
      console.error('AgentSelector load error:', err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAgents().finally(() => setLoading(false));
  }, [loadAgents]);

  const handleInstall = useCallback(async (name: string) => {
    try {
      setSwitching(true);
      const res = await fetch('/api/agents/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Install failed: ${res.status}`);
      }
      await loadAgents();
      setOpen(false); // Close dropdown after successful install
    } catch (err) {
      console.error('Install agent failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to install agent';
      alert(`Failed to install agent: ${errorMessage}`);
    } finally {
      setSwitching(false);
    }
  }, [loadAgents]);

  const handleSwitch = useCallback(async (name: string) => {
    try {
      setSwitching(true);
      const res = await fetch('/api/agents/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Switch failed: ${res.status}`);
      }
      setCurrent(name);
      setOpen(false); // Close dropdown after successful switch
      try {
        window.dispatchEvent(new CustomEvent('dexto:agentSwitched', { detail: { name } }));
      } catch {}
      returnToWelcome();
    } catch (err) {
      console.error('Switch agent failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to switch agent';
      alert(`Failed to switch agent: ${errorMessage}`);
    } finally {
      setSwitching(false);
    }
  }, [returnToWelcome]);

  const currentLabel = useMemo(() => current || 'Choose Agent', [current]);

  const getButtonClassName = (mode: string) => {
    const baseClasses = 'transition-all duration-200 shadow-lg hover:shadow-xl font-semibold rounded-full';
    
    switch (mode) {
      case 'badge':
        return `h-9 px-3 text-xs border border-teal-500 bg-teal-500/20 text-teal-600 hover:bg-teal-500/40 hover:border-teal-500 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 dark:border-teal-400 dark:hover:border-teal-300 ${baseClasses}`;
      case 'title':
        return `h-11 px-4 text-lg font-bold bg-gradient-to-r from-teal-500/30 to-teal-500/40 text-teal-600 hover:from-teal-500/50 hover:to-teal-500/60 hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-offset-2 border border-teal-500/40 dark:text-teal-400 dark:hover:text-teal-300 dark:border-teal-400 ${baseClasses}`;
      default:
        return `h-10 px-3 text-sm bg-teal-500/40 text-teal-600 hover:bg-teal-500/50 hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-offset-2 border border-teal-500/50 dark:text-teal-400 dark:hover:text-teal-300 dark:border-teal-400 ${baseClasses}`;
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={mode === 'badge' ? 'outline' : 'default'}
          size="sm"
          className={getButtonClassName(mode)}
          disabled={switching}
        >
          <Sparkles className="w-4 h-4 mr-2" />
          {switching ? 'Switching...' : mode === 'title' ? `Agent: ${currentLabel}` : currentLabel}
          <ChevronDown className="w-4 h-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 max-h-96 overflow-y-auto">
        {loading && (
          <DropdownMenuItem disabled className="text-center text-muted-foreground">
            Loading agents...
          </DropdownMenuItem>
        )}
        {!loading && (
          <>
            {installed.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Installed
                </div>
                {installed.map((agent) => (
                  <DropdownMenuItem
                    key={agent.name}
                    onClick={() => handleSwitch(agent.name)}
                    disabled={switching || agent.name === current}
                    className="cursor-pointer py-3"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{agent.name}</span>
                          {agent.name === current && (
                            <Check className="w-4 h-4 text-green-600 flex-shrink-0 animate-in fade-in duration-200" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {agent.description}
                        </p>
                        {agent.author && (
                          <p className="text-xs text-muted-foreground/80 mt-0.5">
                            by {agent.author}
                          </p>
                        )}
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))}
              </>
            )}
            {installed.length > 0 && available.length > 0 && <DropdownMenuSeparator />}
            {available.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Available
                </div>
                {available.map((agent) => (
                  <DropdownMenuItem
                    key={agent.name}
                    onClick={() => handleInstall(agent.name)}
                    disabled={switching}
                    className="cursor-pointer py-3"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{agent.name}</span>
                          <DownloadCloud className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {agent.description}
                        </p>
                        {agent.author && (
                          <p className="text-xs text-muted-foreground/80 mt-0.5">
                            by {agent.author}
                          </p>
                        )}
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))}
              </>
            )}
            {!loading && installed.length === 0 && available.length === 0 && (
              <DropdownMenuItem disabled className="text-center text-muted-foreground">
                No agents found
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}