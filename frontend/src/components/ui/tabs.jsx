import * as React from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        'inline-flex w-full items-center gap-1 overflow-x-auto rounded-xl bg-surface-alt p-1',
        className
      )}
      {...props}
    />
  );
});

const TabsTrigger = React.forwardRef(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium text-muted transition-colors',
        'hover:text-ink',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        'data-[state=active]:bg-white data-[state=active]:text-brand-dark data-[state=active]:shadow-sm',
        className
      )}
      {...props}
    />
  );
});

const TabsContent = React.forwardRef(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        'mt-4 focus-visible:outline-none',
        className
      )}
      {...props}
    />
  );
});

export { Tabs, TabsList, TabsTrigger, TabsContent };
