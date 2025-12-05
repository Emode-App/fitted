
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Globe } from 'lucide-react';

export const Button: React.FC<{ 
  children?: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'purple' | 'black'; 
  className?: string;
  disabled?: boolean;
}> = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className = '',
  disabled = false
}) => {
  const baseClasses = "px-6 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";
  
  const variants = {
    primary: "bg-black dark:bg-white text-white dark:text-black hover:bg-gray-900 dark:hover:bg-gray-100",
    black: "bg-black dark:bg-white text-white dark:text-black hover:bg-gray-900 dark:hover:bg-gray-100",
    secondary: "bg-gray-100 dark:bg-zinc-800 text-black dark:text-white border border-gray-200 dark:border-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-700",
    purple: "bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-800 text-white shadow-lg shadow-indigo-500/30",
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`${baseClasses} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

export const Modal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  children?: React.ReactNode; 
  title?: string;
  variant?: 'bottom' | 'center';
}> = ({ 
  isOpen, 
  onClose, 
  children, 
  title,
  variant = 'center'
}) => {
  if (!isOpen) return null;

  const contentClasses = variant === 'bottom' 
    ? "bg-white dark:bg-zinc-900 w-full sm:w-[400px] sm:rounded-2xl rounded-t-3xl p-6 relative max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-300 shadow-2xl"
    : "bg-white dark:bg-zinc-900 w-[85%] max-w-sm rounded-3xl p-6 relative max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200 shadow-2xl";

  const containerClasses = variant === 'bottom'
    ? "fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    : "fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4";

  return createPortal(
    <div className={containerClasses}>
      <div 
        className={contentClasses}
        onClick={(e) => e.stopPropagation()}
      >
        {variant === 'bottom' && <div className="w-12 h-1.5 bg-gray-300 dark:bg-zinc-700 rounded-full mx-auto mb-6 sm:hidden" />}
        {title && <h3 className="text-xl font-bold mb-4 text-center text-black dark:text-white">{title}</h3>}
        {children}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-gray-100 dark:bg-zinc-800 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700 text-black dark:text-white"
        >
          ✕
        </button>
      </div>
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>,
    document.body
  );
};

// --- TIME AGO COMPONENT ---
export const TimeAgo: React.FC<{ 
  timestamp?: number; 
  staticText?: string; 
  className?: string;
  format?: 'relative' | 'time';
}> = ({ timestamp, staticText, className, format = 'relative' }) => {
  const [timeString, setTimeString] = useState(staticText || '');

  useEffect(() => {
    if (!timestamp) return;

    const update = () => {
      // Exact Time Format (e.g. 4:48 PM)
      if (format === 'time') {
        setTimeString(new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
        return;
      }

      // Relative Time Format (e.g. 5m)
      const now = Date.now();
      const diffMs = now - timestamp;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffSec < 60) {
        setTimeString('Just now');
      } else if (diffMin < 60) {
        setTimeString(`${diffMin}m`);
      } else if (diffHour < 24) {
        setTimeString(`${diffHour}h`);
      } else if (diffDay < 7) {
        setTimeString(`${diffDay}d`);
      } else {
        setTimeString(`${Math.floor(diffDay / 7)}w`);
      }
    };

    update();
    
    // Only set interval for relative time
    if (format === 'relative') {
      const interval = setInterval(update, 60000);
      return () => clearInterval(interval);
    }
  }, [timestamp, format]);

  return <span className={className}>{timeString}</span>;
};

// --- BRAND LOGOS ---

export const StockXLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.5 5L13.5 12L18.5 20H15.5L11.5 13.5L7.5 20H4.5L9.5 12L4.5 5H7.5L11.5 10.5L14.5 5H17.5Z" />
  </svg>
);

export const GoatLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM9 16H7V8H11C12.66 8 14 9.34 14 11V12C14 13.66 12.66 15 11 15H9V16ZM9 13H11C11.55 13 12 12.55 12 12V11C12 10.45 11.55 10 11 10H9V13ZM17 16H15V8H17V16Z" />
  </svg>
);

export const GrailedLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12 2L2 22H22L12 2ZM12 6L18 18H6L12 6ZM11 16H13V12H11V16Z" />
    <path d="M12 24C5.373 24 0 18.627 0 12S5.373 0 12 0s12 5.373 12 12-5.373 12-12 12zm0-22C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm1.6 14.5h-1.3l-2.4-4.2v4.2H8.5V9.5h1.3l2.4 4.2V9.5h1.4v7z" fill="none" /> 
    <path d="M11.9 4.6l-5.8 5.8 1.4 1.4 4.4-4.4 4.4 4.4 1.4-1.4z" transform="rotate(180 12 12)" />
    {/* Simplified G shape / Bolt */}
    <path d="M14 10H10V14H14V16H10C8.9 16 8 15.1 8 14V10C8 8.9 8.9 8 10 8H14V10Z" />
  </svg>
);

export const TikTokLogo = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93v6.16c0 2.52-1.12 4.84-2.9 6.24-1.72 1.33-3.92 1.83-6.09 1.46-2.15-.36-4.11-1.64-5.32-3.48-1.21-1.84-1.45-4.14-.64-6.15 1.05-2.62 3.65-4.17 6.42-3.83v4.06c-1.13-.19-2.31.25-3.03 1.16-.72.9-1 2.16-.73 3.28.28 1.11 1.25 1.93 2.39 2.03 1.14.09 2.22-.59 2.75-1.58.52-1 .56-2.18.56-3.32V.02h2.51z"/></svg>
);

// --- DYNAMIC STORE LINK COMPONENT ---

export const StoreButtonRow = ({ link, itemName }: { link: string, itemName?: string }) => {
  // Helper to detect known stores in the primary link
  const isStockXLink = link?.toLowerCase().includes('stockx');
  const isGoatLink = link?.toLowerCase().includes('goat');
  const isGrailedLink = link?.toLowerCase().includes('grailed');
  
  // Helper for generic button rendering
  const renderGenericButton = (url: string) => {
      let label = 'Shop';
      try {
          const hostname = new URL(url).hostname;
          let cleanHost = hostname.replace(/^www\./, '');
          const parts = cleanHost.split('.');
          if (parts.length > 1) {
              label = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
          }
      } catch (e) {
          console.log('Error parsing url', e);
      }
      return (
        <a href={url} target="_blank" rel="noreferrer" className="bg-blue-600 text-white px-4 h-12 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform gap-2 min-w-[100px]">
           <Globe className="w-4 h-4" />
           <span className="font-bold text-xs">{label}</span>
        </a>
      );
  };

  const searchQuery = encodeURIComponent(itemName || '');
  
  // Force generic search queries for known platforms if the specific link is provided but might be hallucinated
  // This ensures the button always works.
  const stockXSearchUrl = `https://stockx.com/search?s=${searchQuery}`;
  const goatUrl = `https://www.goat.com/search?query=${searchQuery}`;

  // If the provided link is a valid StockX link, use it. Otherwise fall back to search.
  const finalStockXUrl = (link && isStockXLink) ? link : stockXSearchUrl;

  return (
    <div className="flex gap-4 justify-center w-full mb-2">
        {/* 1. Primary Link Button (If provided and not a default store we already show) */}
        {link && link !== '#' && !isStockXLink && !isGoatLink && (
            isGrailedLink ? (
                <a href={link} target="_blank" rel="noreferrer" className="bg-gray-900 dark:bg-white text-white dark:text-black w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
                    <GrailedLogo className="w-6 h-6" />
                </a>
            ) : (
                renderGenericButton(link)
            )
        )}

        {/* 2. StockX Default Button */}
        <a 
            href={finalStockXUrl} 
            target="_blank" 
            rel="noreferrer" 
            className="bg-[#006340] text-white w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
        >
           <StockXLogo className="w-6 h-6" />
        </a>

        {/* 3. GOAT Default Button */}
        <a 
            href={isGoatLink ? goatUrl : goatUrl} 
            target="_blank" 
            rel="noreferrer" 
            className="bg-black dark:bg-white text-white dark:text-black w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
        >
           <GoatLogo className="w-6 h-6" />
        </a>
    </div>
  );
};
