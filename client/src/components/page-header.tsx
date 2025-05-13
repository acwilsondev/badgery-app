import React from 'react';
import { Search, Bell, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PageHeaderProps {
  title: string;
  description?: string;
  showSearch?: boolean;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  actionButton?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  showSearch = false,
  searchPlaceholder = "Search...",
  onSearchChange,
  actionButton,
  children
}: PageHeaderProps) {
  return (
    <>
      {/* Top navigation */}
      <div className="relative z-10 flex-shrink-0 flex h-16 bg-background shadow-sm border-b border-border">
        <div className="flex-1 px-4 flex justify-between">
          <div className="flex-1 flex">
            {showSearch && (
              <form className="w-full flex md:ml-0" action="#" method="GET">
                <label htmlFor="search-field" className="sr-only">Search</label>
                <div className="relative w-full focus-within:text-primary">
                  <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none pl-3">
                    <Search className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <Input
                    id="search-field"
                    className="block w-full h-full pl-10 border-transparent bg-muted/50 focus:ring-1 focus:ring-brand-purple/30"
                    placeholder={searchPlaceholder}
                    type="search"
                    onChange={e => onSearchChange?.(e.target.value)}
                  />
                </div>
              </form>
            )}
          </div>
          
          <div className="ml-4 flex items-center md:ml-6">
            <button
              type="button"
              className="bg-muted/50 p-2 rounded-md text-brand-purple hover:text-brand-purple/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-purple/50 transition-colors"
            >
              <span className="sr-only">View notifications</span>
              <Bell className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Page header */}
      <header className="bg-background shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-purple to-brand-lilac">{title}</h1>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          
          {actionButton && (
            <div className="mt-4 md:mt-0">
              <Button
                onClick={actionButton.onClick}
                className="bg-brand-purple hover:bg-brand-purple/90 text-white"
              >
                {actionButton.icon || <Plus className="h-4 w-4 mr-1" />}
                {actionButton.label}
              </Button>
            </div>
          )}
          
          {children}
        </div>
      </header>
    </>
  );
}