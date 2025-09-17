'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Zap, Plus } from 'lucide-react';
import { Badge } from './ui/badge';
import type { PromptArgument, PromptInfo as CorePromptInfo } from '@dexto/core';

// Use canonical types from @dexto/core for alignment
type PromptInfo = CorePromptInfo;

// PromptItem component for rendering individual prompts
const PromptItem = ({ prompt, isSelected, onClick, onMouseEnter, dataIndex }: { 
  prompt: Prompt; 
  isSelected: boolean; 
  onClick: () => void; 
  onMouseEnter?: () => void;
  dataIndex?: number;
}) => (
  <div
    className={`px-3 py-2 cursor-pointer transition-colors ${
      isSelected
        ? 'bg-primary/20 ring-1 ring-primary/40'
        : 'hover:bg-primary/10'
    }`}
    onClick={onClick}
    onMouseEnter={onMouseEnter}
    data-index={dataIndex}
  >
    <div className="flex items-start gap-2">
      <div className="flex-shrink-0 mt-0.5">
        {prompt.source === 'mcp' ? (
          <Zap className="h-3 w-3 text-blue-400" />
        ) : prompt.source === 'starter' ? (
          <span className="text-xs">🚀</span>
        ) : (
          <Sparkles className="h-3 w-3 text-purple-400" />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-xs text-foreground">
            /{prompt.name}
          </span>
          {prompt.source === 'mcp' && (
            <Badge variant="outline" className="text-xs px-1.5 py-0.5 h-4">
              MCP
            </Badge>
          )}
          {prompt.source === 'internal' && (
            <Badge variant="outline" className="text-xs px-1.5 py-0.5 h-4">
              Internal
            </Badge>
          )}
          {prompt.source === 'custom' && (
            <Badge variant="outline" className="text-xs px-1.5 py-0.5 h-4 bg-primary/10 text-primary border-primary/20">
              Custom
            </Badge>
          )}
          {prompt.source === 'starter' && (
            <Badge variant="outline" className="text-xs px-1.5 py-0.5 h-4 bg-primary/10 text-primary border-primary/20">
              Starter
            </Badge>
          )}
        </div>
        
        {/* Show title if available */}
        {prompt.title && (
          <div className="text-xs font-medium text-foreground/90 mb-0.5">
            {prompt.title}
          </div>
        )}
        
        {/* Show description if available and different from title */}
        {prompt.description && prompt.description !== prompt.title && (
          <div className="text-xs text-muted-foreground mb-1.5 line-clamp-2">
            {prompt.description}
          </div>
        )}
        
        {prompt.arguments && prompt.arguments.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {prompt.arguments.map((arg) => (
              <Badge 
                key={arg.name} 
                variant="secondary" 
                className="text-xs px-1.5 py-0.5 h-4 bg-muted/60 text-muted-foreground"
              >
                {arg.name}{arg.required ? '*' : ''}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

// Define UI-specific Prompt interface extending core PromptInfo
interface Prompt extends PromptInfo {
  // UI-specific fields that may come from metadata
  starterPrompt?: boolean;
  category?: string;
  icon?: string;
  priority?: number;
}

interface SlashCommandAutocompleteProps {
  isVisible: boolean;
  searchQuery: string;
  onSelectPrompt: (prompt: Prompt) => void;
  onClose: () => void;
  onCreatePrompt?: () => void;
  refreshKey?: number;
}

export default function SlashCommandAutocomplete({ 
  isVisible, 
  searchQuery,
  onSelectPrompt, 
  onClose,
  onCreatePrompt,
  refreshKey,
}: SlashCommandAutocompleteProps) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [filteredPrompts, setFilteredPrompts] = useState<Prompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const showCreateOption = React.useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return false;
    if (trimmed === '/') return true;
    if (trimmed.startsWith('/') && filteredPrompts.length === 0) return true;
    return false;
  }, [searchQuery, filteredPrompts.length]);

  const combinedItems = React.useMemo(() => {
    const items: Array<{ kind: 'create' } | { kind: 'prompt'; prompt: Prompt }> = [];
    if (showCreateOption) {
      items.push({ kind: 'create' });
    }
    filteredPrompts.forEach((prompt) => items.push({ kind: 'prompt', prompt }));
    return items;
  }, [showCreateOption, filteredPrompts]);

  // Fetch available prompts
  useEffect(() => {
    if (!isVisible) return;

    const fetchPrompts = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/prompts');
        if (response.ok) {
          const data = await response.json();
          setPrompts(data.prompts || []);
          setFilteredPrompts(data.prompts || []);
        }
      } catch (error) {
        console.error('Failed to fetch prompts:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrompts();
  }, [isVisible, refreshKey]);

  // Filter prompts based on search query from parent input
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery === '/') {
      setFilteredPrompts(prompts);
      setSelectedIndex(0);
      return;
    }

    // Remove the leading "/" for filtering
    const query = searchQuery.startsWith('/') ? searchQuery.slice(1) : searchQuery;
    
    const filtered = prompts.filter(prompt => 
      prompt.name.toLowerCase().includes(query.toLowerCase()) ||
      (prompt.description && prompt.description.toLowerCase().includes(query.toLowerCase())) ||
      (prompt.title && prompt.title.toLowerCase().includes(query.toLowerCase()))
    );
    
    setFilteredPrompts(filtered);
    setSelectedIndex(0);
  }, [searchQuery, prompts]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [showCreateOption, filteredPrompts.length, searchQuery]);

  useEffect(() => {
    if (combinedItems.length === 0) {
      setSelectedIndex(0);
      return;
    }
    if (selectedIndex >= combinedItems.length) {
      setSelectedIndex(combinedItems.length - 1);
    }
  }, [combinedItems, selectedIndex]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const items = combinedItems;
      switch (e.key) {
        case 'ArrowDown':
          if (items.length === 0) return;
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % items.length);
          break;
        case 'ArrowUp':
          if (items.length === 0) return;
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (items.length === 0) {
            onCreatePrompt?.();
            return;
          }
          {
            const item = items[selectedIndex];
            if (item.kind === 'create') {
              onCreatePrompt?.();
            } else {
              onSelectPrompt(item.prompt);
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'Tab':
          e.preventDefault();
          if (items.length === 0) {
            onCreatePrompt?.();
            return;
          }
          {
            const item = items[selectedIndex];
            if (item.kind === 'create') {
              onCreatePrompt?.();
            } else {
              onSelectPrompt(item.prompt);
            }
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, combinedItems, selectedIndex, onSelectPrompt, onClose, onCreatePrompt]);

  // Scroll selected item into view when selectedIndex changes
  useEffect(() => {
    if (!scrollContainerRef.current) return;

    const scrollContainer = scrollContainerRef.current;
    const selectedItem = scrollContainer.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement;
    
    if (selectedItem) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const itemRect = selectedItem.getBoundingClientRect();
      
      // Check if item is visible in container
      const isAbove = itemRect.top < containerRect.top;
      const isBelow = itemRect.bottom > containerRect.bottom;
      
      if (isAbove || isBelow) {
        selectedItem.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        });
      }
    }
  }, [selectedIndex]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div 
      ref={containerRef}
      className="absolute left-0 right-0 mb-2 bg-background border border-border rounded-lg shadow-lg max-h-96 overflow-hidden z-[9999]"
      style={{ 
        position: 'absolute',
        bottom: 'calc(100% + 0px)',
        left: 0,
        right: 0,
        borderRadius: '8px',
        maxHeight: '320px',
        overflow: 'visible',
        zIndex: 9999,
        minWidth: '400px',
        // Custom dark styling
        background: 'linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--muted)) 100%)',
        border: '1px solid hsl(var(--border) / 0.3)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
      }}
    >
      {/* Header - Compact with prompt count */}
      <div className="px-3 py-2 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>Available Prompts</span>
          <Badge variant="secondary" className="ml-auto text-xs px-2 py-0.5">
            {prompts.length}
          </Badge>
        </div>
      </div>

      {/* Prompts List */}
      <div ref={scrollContainerRef} className="max-h-48 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 text-center text-xs text-muted-foreground">
            Loading prompts...
          </div>
        ) : (
          <>
            {showCreateOption && (
              <div
                className={`px-3 py-2 cursor-pointer transition-colors ${
                  selectedIndex === 0
                    ? 'bg-primary/20 ring-1 ring-primary/40'
                    : 'hover:bg-primary/10'
                }`}
                onClick={() => onCreatePrompt?.()}
                onMouseEnter={() => setSelectedIndex(0)}
                data-index={0}
              >
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <Plus className="h-3 w-3 text-primary" />
                  <span>Create new prompt</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Define a reusable prompt. Press Enter to continue.
                </div>
              </div>
            )}

            {filteredPrompts.length === 0 ? (
              !showCreateOption && (
                <div className="p-3 text-center text-xs text-muted-foreground">
                  No prompts available.
                </div>
              )
            ) : (
              filteredPrompts.map((prompt, index) => {
                const itemIndex = showCreateOption ? index + 1 : index;
                return (
                  <PromptItem 
                    key={prompt.name}
                    prompt={prompt}
                    isSelected={itemIndex === selectedIndex}
                    onClick={() => onSelectPrompt(prompt)}
                    onMouseEnter={() => setSelectedIndex(itemIndex)}
                    dataIndex={itemIndex}
                  />
                );
              })
            )}
          </>
        )}
      </div>

      {/* Footer - Compact with navigation hints */}
      <div className="px-2 py-1.5 border-t border-border bg-muted/20 text-xs text-muted-foreground text-center">
        <span>↑↓ Navigate • Tab/Enter Select • Esc Close</span>
      </div>
    </div>
  );
}
