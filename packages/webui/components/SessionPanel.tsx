'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import {
  Trash2,
  AlertTriangle,
  RefreshCw,
  History,
  Search
} from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface Session {
  id: string;
  createdAt: string | null;
  lastActivity: string | null;
  messageCount: number;
  title?: string | null;
}

interface SessionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentSessionId?: string | null;
  onSessionChange: (sessionId: string) => void;
  returnToWelcome: () => void;
  variant?: 'inline' | 'modal';
  onSearchOpen?: () => void;
  onNewChat?: () => void;
}

import NewChatButton from './NewChatButton';

export default function SessionPanel({ 
  isOpen, 
  onClose, 
  currentSessionId,
  onSessionChange,
  returnToWelcome,
  variant = 'modal',
  onSearchOpen,
  onNewChat,
}: SessionPanelProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNewSessionOpen, setNewSessionOpen] = useState(false);
  const [newSessionId, setNewSessionId] = useState('');
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  // Conversation management states
  const [isDeleteConversationDialogOpen, setDeleteConversationDialogOpen] = useState(false);
  const [selectedSessionForAction, setSelectedSessionForAction] = useState<string | null>(null);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/sessions');
      if (!response.ok) throw new Error('Failed to fetch sessions');
      const data = await response.json();
      // Sort sessions by lastActivity (most recent first)
      const sortedSessions = (data.sessions || []).sort((a: Session, b: Session) => {
        const timeA = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
        const timeB = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
        return timeB - timeA; // Descending order (most recent first)
      });
      setSessions(sortedSessions);
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchSessions();
    }
  }, [isOpen, fetchSessions]);

  // Listen for message events to refresh session counts
  useEffect(() => {
    const handleMessage = () => {
      // Refresh sessions when a message is sent to update message counts
      if (isOpen) {
        fetchSessions();
      }
    };

    const handleResponse = () => {
      // Refresh sessions when a response is received to update message counts
      if (isOpen) {
        fetchSessions();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('dexto:message', handleMessage);
      window.addEventListener('dexto:response', handleResponse);
      const handleTitleUpdated: EventListener = () => {
        if (!isOpen) return;
        void fetchSessions();
      };
      window.addEventListener('dexto:sessionTitleUpdated', handleTitleUpdated);
      
      return () => {
        window.removeEventListener('dexto:message', handleMessage);
        window.removeEventListener('dexto:response', handleResponse);
        window.removeEventListener('dexto:sessionTitleUpdated', handleTitleUpdated);
      };
    }
  }, [isOpen, fetchSessions]);

  const handleCreateSession = async () => {
    // Allow empty session ID for auto-generation
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: newSessionId.trim() || undefined }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create session');
      }
      
      const data = await response.json();
      setSessions(prev => [...prev, data.session]);
      setNewSessionId('');
      setNewSessionOpen(false);
      onSessionChange(data.session.id);
    } catch (err) {
      console.error('Error creating session:', err);
      setError(err instanceof Error ? err.message : 'Failed to create session');
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    setDeletingSessionId(sessionId);
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete session');
      }
      
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      
      // If we deleted the current session, trigger a page reload to return to welcome state
      if (currentSessionId === sessionId) {
        returnToWelcome();
      }
    } catch (err) {
      console.error('Error deleting session:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete session');
    } finally {
      setDeletingSessionId(null);
    }
  };


  const handleDeleteConversation = async () => {
    if (!selectedSessionForAction) return;
    
    setIsDeletingConversation(true);
    try {
      const response = await fetch(`/api/sessions/${selectedSessionForAction}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete conversation');
      }

      // Remove session from local state
      setSessions(prev => prev.filter(s => s.id !== selectedSessionForAction));
      
      // If we deleted the current session, trigger a page reload to return to welcome state
      if (currentSessionId === selectedSessionForAction) {
        returnToWelcome();
      }
      
      setDeleteConversationDialogOpen(false);
      setSelectedSessionForAction(null);
    } catch (error) {
      console.error('Error deleting conversation:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete conversation');
    } finally {
      setIsDeletingConversation(false);
    }
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };



  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/50">
        <div className="flex items-center space-x-2">
          <h2 className="text-base font-semibold">Chat History</h2>
        </div>
        <div className="flex items-center space-x-1">
          {onSearchOpen && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onSearchOpen}
                    className="h-7 w-7 p-0"
                    aria-label="Search conversations"
                  >
                    <Search className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Search conversations (⌘⇧S)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {onNewChat && (
            <NewChatButton onClick={onNewChat} variant="outline" />
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Sessions List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground px-4">
            <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No chat history</p>
            <p className="text-sm">Start a conversation to see it here</p>
          </div>
        ) : (
          <div className="px-3 py-2 space-y-0.5">
            <TooltipProvider>
              {sessions.map((session) => {
                const title = session.title && session.title.trim().length > 0 ? session.title : session.id;
                const isActive = currentSessionId === session.id;
                return (
                  <Tooltip key={session.id} delayDuration={150}>
                    <TooltipTrigger asChild>
                      <div
                        className={isActive
                          ? "group relative px-3 py-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors cursor-pointer"
                          : "group relative px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
                        }
                        onClick={() => onSessionChange(session.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <h3 className={isActive ? "font-semibold text-sm truncate" : "font-normal text-sm truncate text-muted-foreground"}>
                              {title}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(session.lastActivity)}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (session.messageCount > 0) {
                                  setSelectedSessionForAction(session.id);
                                  setDeleteConversationDialogOpen(true);
                                } else {
                                  handleDeleteSession(session.id);
                                }
                              }}
                              disabled={deletingSessionId === session.id}
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" align="center">
                      <div className="text-xs space-y-1">
                        <div className="font-mono">{session.id}</div>
                        <div className="text-muted-foreground">{session.messageCount} messages</div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          </div>
        )}
      </ScrollArea>

      {/* New Chat Dialog */}
      <Dialog open={isNewSessionOpen} onOpenChange={setNewSessionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start New Chat</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sessionId">Chat ID</Label>
              <Input
                id="sessionId"
                value={newSessionId}
                onChange={(e) => setNewSessionId(e.target.value)}
                placeholder="e.g., user-123, project-alpha"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to auto-generate a unique ID
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSessionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSession}>
              Start Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Delete Conversation Confirmation Dialog */}
      <Dialog open={isDeleteConversationDialogOpen} onOpenChange={setDeleteConversationDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              <span>Delete Conversation</span>
            </DialogTitle>
            <DialogDescription>
              This will permanently delete this conversation and all its messages. This action cannot be undone.
              {selectedSessionForAction && (
                <span className="block mt-2 font-medium">
                  Session: <span className="font-mono">{selectedSessionForAction}</span>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConversationDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteConversation}
              disabled={isDeletingConversation}
              className="flex items-center space-x-2"
            >
              <Trash2 className="h-4 w-4" />
              <span>{isDeletingConversation ? 'Deleting...' : 'Delete Conversation'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (variant === 'inline') {
    return <div className="h-full">{content}</div>;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg h-[600px] flex flex-col p-0">
        {content}
      </DialogContent>
    </Dialog>
  );
} 
