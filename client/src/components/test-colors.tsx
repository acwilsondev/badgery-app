import React from 'react';

export default function TestColors() {
  return (
    <div className="p-8 space-y-4">
      <h1 className="text-3xl font-bold">Tailwind Brand Color Test</h1>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-brand-purple text-white rounded">
          bg-brand-purple
        </div>
        <div className="p-4 bg-brand-orange text-white rounded">
          bg-brand-orange
        </div>
        <div className="p-4 bg-brand-lilac text-brand-charcoal rounded">
          bg-brand-lilac
        </div>
        <div className="p-4 bg-brand-coral text-brand-charcoal rounded">
          bg-brand-coral
        </div>
        <div className="p-4 bg-brand-charcoal text-white rounded">
          bg-brand-charcoal
        </div>
        <div className="p-4 bg-brand-gray text-brand-charcoal rounded">
          bg-brand-gray
        </div>
      </div>
      
      <div className="p-4 border rounded">
        <h2 className="text-2xl font-bold">CSS Variable Test</h2>
        <div className="p-4 bg-primary text-primary-foreground mt-2 rounded">
          Background: Primary / Text: Primary Foreground
        </div>
        <div className="p-4 bg-accent text-accent-foreground mt-2 rounded">
          Background: Accent / Text: Accent Foreground
        </div>
        <div className="p-4 bg-secondary text-secondary-foreground mt-2 rounded">
          Background: Secondary / Text: Secondary Foreground
        </div>
      </div>
    </div>
  );
}