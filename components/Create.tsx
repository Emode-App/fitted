import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Loader2, Sparkles, Layers, Eraser, Move, User, Camera, FolderPlus, Plus, Image as ImageIcon, Trash2, ChevronLeft, ChevronRight, Link as LinkIcon, Share2, Check, ShoppingBag, Music } from 'lucide-react';
import { Button, Modal } from './Shared';
import { generateOutfit } from '../services/aiService';
import { addPost, getUser, getWardrobe, addAssetToWardrobe, createFolder, subscribe } from '../services/mockDb';
import { CURRENT_USER, BRAND_COLLECTIONS } from '../constants';
import { Post, Asset, Folder } from '../types';

interface CanvasItem {
  id: string;
  url: string;
  x: number; // percentage
  y: number; // percentage
  scale: number;
  rotation: number;
  isBgRemoved: boolean;
  isProcessingBg: boolean;
}

interface ItemMetadata {
  id: string;
  brand: string;
  name: string;
  price: string;
  urls: string[];
}

interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  cover: string;
}

interface CreateProps {
    onPublishSuccess?: () => void;
}

interface BackgroundOption {
  id: string;
  name: string;
  type: 'pattern' | 'color' | 'image';
  value: string;
}

const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { id: 'dots', name: 'Grid', type: 'pattern', value: 'bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#3f3f46_1px,transparent_1px)] [background-size:16px_16px] bg-gray-50 dark:bg-zinc-900' },
  { id: 'white', name: 'White', type: 'color', value: 'bg-white' },
  { id: 'black', name: 'Black', type: 'color', value: 'bg-black' },
  { id: 'green', name: 'Fitted Green', type: 'color', value: 'bg-[#2a3b2a]' },
  { id: 'concrete', name: 'Concrete', type: 'image', value: 'https://www.transparenttextures.com/patterns/concrete-wall.png' },
  { id: 'felt', name: 'Felt', type: 'image', value: 'https://www.transparenttextures.com/patterns/black-felt.png' },
];

const MOCK_TRACKS: MusicTrack[] = [
  { id: 't1', title: 'Paint The Town Red', artist: 'Doja Cat', cover: 'https://upload.wikimedia.org/wikipedia/en/d/d0/Doja_Cat_-_Paint_the_Town_Red.png' },
  { id: 't2', title: 'FE!N', artist: 'Travis Scott', cover: 'https://upload.wikimedia.org/wikipedia/en/4/43/Travis_Scott_-_Utopia.png' },
  { id: 't3', title: 'Rich Baby Daddy', artist: 'Drake', cover: 'https://upload.wikimedia.org/wikipedia/en/thumb/7/79/Drake_-_For_All_the_Dogs.png/220px-Drake_-_For_All_the_Dogs.png' },
  { id: 't4', title: 'Lovin On Me', artist: 'Jack Harlow', cover: 'https://upload.wikimedia.org/wikipedia/en/f/f6/Jack_Harlow_-_Lovin_on_Me.png' },
];

// Brand Logos
const InstagramLogo = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
);
const TikTokLogo = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93v6.16c0 2.52-1.12 4.84-2.9 6.24-1.72 1.33-3.92 1.83-6.09 1.46-2.15-.36-4.11-1.64-5.32-3.48-1.21-1.84-1.45-4.14-.64-6.15 1.05-2.62 3.65-4.17 6.42-3.83v4.06c-1.13-.19-2.31.25-3.03 1.16-.72.9-1 2.16-.73 3.28.28 1.11 1.25 1.93 2.39 2.03 1.14.09 2.22-.59 2.75-1.58.52-1 .56-2.18.56-3.32V.02h2.51z"/></svg>
);
const XLogo = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
);


// Helper Component for Navigable Folder List
const FolderCarousel = ({ 
  folders, 
  selectedFolderId, 
  setSelectedFolderId, 
  setIsCreatingFolder,
  compact = false
}: { 
  folders: Folder[], 
  selectedFolderId: string, 
  setSelectedFolderId: (id: string) => void, 
  setIsCreatingFolder: (v: boolean) => void,
  compact?: boolean
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
        // Scroll amount: roughly 2 tabs worth (approx 160px)
        const amount = 160 * (direction === 'left' ? -1 : 1);
        scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  return (
    <div className={`relative flex items-center w-full ${compact ? 'px-6' : 'px-8'}`}>
        <button 
            onClick={() => scroll('left')} 
            className="absolute left-0 z-10 bg-white dark:bg-zinc-800 shadow-sm border border-gray-200 dark:border-zinc-700 rounded-full p-1 text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-700 active:scale-95"
        >
            <ChevronLeft size={16} />
        </button>
        
        <div ref={scrollRef} className="flex gap-2 overflow-x-hidden scroll-smooth w-full px-1 py-1">
            {folders.map(folder => (
                <button
                    key={folder.id}
                    onClick={() => setSelectedFolderId(folder.id)}
                    className={`${compact ? 'px-3 py-1.5 rounded-lg text-xs' : 'px-4 py-2.5 rounded-xl text-sm'} font-bold whitespace-nowrap border transition-all flex items-center gap-1.5 shrink-0 ${
                        selectedFolderId === folder.id 
                        ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-md' 
                        : 'bg-white dark:bg-zinc-900 text-gray-600 dark:text-zinc-400 border-gray-200 dark:border-zinc-700 hover:border-gray-300'
                    }`}
                >
                    <span>{folder.name}</span>
                    {!compact && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${selectedFolderId === folder.id ? 'bg-white/20 dark:bg-black/20' : 'bg-gray-100 dark:bg-zinc-800'}`}>
                            {folder.assets.length}
                        </span>
                    )}
                </button>
            ))}
            <button 
                onClick={() => setIsCreatingFolder(true)}
                className={`${compact ? 'px-3 py-1.5 rounded-lg text-xs' : 'px-4 py-2.5 rounded-xl text-sm'} font-bold whitespace-nowrap border border-dashed border-purple-300 text-purple-600 bg-purple-50 dark:bg-purple-900/20 shrink-0 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors`}
            >
                {compact ? '+ Folder' : '+ New Folder'}
            </button>
        </div>

        <button 
            onClick={() => scroll('right')} 
            className="absolute right-0 z-10 bg-white dark:bg-zinc-800 shadow-sm border border-gray-200 dark:border-zinc-700 rounded-full p-1 text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-700 active:scale-95"
        >
            <ChevronRight size={16} />
        </button>
    </div>
  );
};

export const Create: React.FC<CreateProps> = ({ onPublishSuccess }) => {
  const [step, setStep] = useState<'upload' | 'canvas' | 'preview'>('upload');
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [faceImage, setFaceImage] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');

  // Asset Management State
  const [folders, setFolders] = useState<Folder[]>(getWardrobe());
  const [selectedFolderId, setSelectedFolderId] = useState<string>('last_used');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  // Canvas & Preview State
  const [activeTab, setActiveTab] = useState<'items' | 'background'>('items');
  const [selectedBackground, setSelectedBackground] = useState<BackgroundOption>(BACKGROUND_OPTIONS[0]);
  const [previewSlide, setPreviewSlide] = useState(0);
  const [showFrames, setShowFrames] = useState(true);
  const [caption, setCaption] = useState('');
  const [itemMetadata, setItemMetadata] = useState<Record<string, ItemMetadata>>({});
  const [socials, setSocials] = useState({ instagram: false, tiktok: false, twitter: false });
  const [testModalItem, setTestModalItem] = useState<ItemMetadata | null>(null);
  
  // Brand Search State
  const [activeBrandSearchId, setActiveBrandSearchId] = useState<string | null>(null);

  // Music State
  const [selectedMusic, setSelectedMusic] = useState<MusicTrack | null>(null);
  const [showMusicPicker, setShowMusicPicker] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasFileInputRef = useRef<HTMLInputElement>(null); // For direct canvas upload
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const itemStart = useRef({ x: 0, y: 0 });

  // Load user's saved face on mount
  useEffect(() => {
    const user = getUser(CURRENT_USER.id);
    if (user && user.aiFaceUrl) {
        setFaceImage(user.aiFaceUrl);
    }
  }, []);

  // Sync folders with mockDb
  useEffect(() => {
    setFolders(getWardrobe());
    const unsubscribe = subscribe(() => {
        setFolders(getWardrobe());
    });
    return () => unsubscribe();
  }, []);

  // Convert Blob/File URL to Base64
  const urlToBase64 = async (url: string): Promise<string> => {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("Conversion failed", e);
        return "";
    }
  };

  const addItemToCanvas = (url: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newItem: CanvasItem = {
      id,
      url,
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
      isBgRemoved: false,
      isProcessingBg: false,
    };
    
    setItems(prev => [...prev, newItem]);
    
    // Initialize metadata with empty name so placeholder shows
    setItemMetadata(prev => ({
        ...prev,
        [id]: { id, brand: '', name: '', price: '', urls: [''] }
    }));

    setSelectedItemId(newItem.id);
    if (step === 'upload') setStep('canvas');
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const url = URL.createObjectURL(e.target.files[0]);
      
      // Add to canvas
      addItemToCanvas(url);

      // Add to "Last Used" in Wardrobe DB
      const newAsset: Asset = { id: Math.random().toString(36), url, dateAdded: Date.now() };
      addAssetToWardrobe('last_used', newAsset);

      // Reset input
      e.target.value = '';
    }
  };

  const handleAddToFolder = (e: React.ChangeEvent<HTMLInputElement>, folderId: string) => {
    if (e.target.files && e.target.files[0]) {
        const url = URL.createObjectURL(e.target.files[0]);
        const newAsset: Asset = { id: Math.random().toString(36), url, dateAdded: Date.now() };
        
        addAssetToWardrobe(folderId, newAsset);
        e.target.value = '';
    }
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const newId = createFolder(newFolderName);
    setSelectedFolderId(newId);
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const handleFaceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const url = URL.createObjectURL(e.target.files[0]);
        setFaceImage(url);
        e.target.value = '';
    }
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
    if (selectedItemId === id) setSelectedItemId(null);
    const newMeta = { ...itemMetadata };
    delete newMeta[id];
    setItemMetadata(newMeta);
  };

  const toggleBackground = async (id: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, isProcessingBg: true } : item));
    await new Promise(resolve => setTimeout(resolve, 1500)); 
    setItems(prev => prev.map(item => item.id === id ? { ...item, isProcessingBg: false, isBgRemoved: !item.isBgRemoved } : item));
  };

  const handleGenerate = async () => {
    if (window.aistudio && !await window.aistudio.hasSelectedApiKey()) {
        await window.aistudio.openSelectKey();
    }

    if (items.length === 0) return;
    setIsGenerating(true);
    try {
      const clothingPromises = items.map(item => urlToBase64(item.url));
      const clothingBase64 = await Promise.all(clothingPromises);
      
      let faceBase64 = null;
      if (faceImage) {
        faceBase64 = await urlToBase64(faceImage);
      }

      const result = await generateOutfit(faceBase64, clothingBase64, prompt || "streetwear aesthetic");
      setGeneratedImage(result);
      setStep('preview');
    } catch (e: any) {
      if (e.message?.includes('403') || e.message?.includes('PERMISSION_DENIED')) {
          if (window.aistudio) {
              await window.aistudio.openSelectKey();
          }
          alert("Please select a valid paid API key to use the model.");
      } else {
          alert("Failed to generate outfit. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublish = () => {
      const newPost: Post = {
        id: `p_${Date.now()}`,
        user: CURRENT_USER,
        generatedImage: generatedImage!,
        boardImage: '', 
        backgroundConfig: selectedBackground,
        caption: caption,
        likes: 0,
        items: items.map(i => ({
             id: i.id,
             brand: itemMetadata[i.id]?.brand || '',
             name: itemMetadata[i.id]?.name || '',
             price: parseFloat(itemMetadata[i.id]?.price || '0'),
             imageUrl: i.url,
             purchaseLink: itemMetadata[i.id]?.urls?.[0] || '#',
             canvasState: {
                 x: i.x,
                 y: i.y,
                 scale: i.scale,
                 rotation: i.rotation,
                 isBgRemoved: i.isBgRemoved
             }
        })),
        timestamp: 'Just now',
        isLiked: false,
        music: selectedMusic ? {
            title: selectedMusic.title,
            artist: selectedMusic.artist,
            cover: selectedMusic.cover
        } : undefined
      };
      
      addPost(newPost);
      
      setStep('upload');
      setItems([]);
      setGeneratedImage(null);
      setCaption('');
      setSelectedMusic(null);
      
      if (onPublishSuccess) {
          onPublishSuccess();
      }
  };

  // Drag Logic
  const handlePointerDown = (e: React.PointerEvent | React.MouseEvent | React.TouchEvent, id: string) => {
    if (step === 'preview') return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedItemId(id);
    isDragging.current = true;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    dragStart.current = { x: clientX, y: clientY };
    const item = items.find(i => i.id === id);
    if (item) {
        itemStart.current = { x: item.x, y: item.y };
    }
  };

  const handlePointerMove = (e: React.PointerEvent | React.MouseEvent | React.TouchEvent) => {
    if (!isDragging.current || !selectedItemId || !canvasRef.current) return;
    e.preventDefault();

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const deltaXPixels = clientX - dragStart.current.x;
    const deltaYPixels = clientY - dragStart.current.y;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const deltaXPercent = (deltaXPixels / canvasRect.width) * 100;
    const deltaYPercent = (deltaYPixels / canvasRect.height) * 100;

    setItems(prev => prev.map(item => {
        if (item.id === selectedItemId) {
            return {
                ...item,
                x: Math.max(0, Math.min(100, itemStart.current.x + deltaXPercent)),
                y: Math.max(0, Math.min(100, itemStart.current.y + deltaYPercent))
            };
        }
        return item;
    }));
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  useEffect(() => {
    if (isDragging.current) {
        window.addEventListener('mouseup', handlePointerUp);
        window.addEventListener('touchend', handlePointerUp);
    }
    return () => {
        window.removeEventListener('mouseup', handlePointerUp);
        window.removeEventListener('touchend', handlePointerUp);
    };
  }, []);

  const getBackgroundStyle = () => {
    if (selectedBackground.type === 'pattern' || selectedBackground.type === 'color') {
        return selectedBackground.value;
    }
    return ''; // Image handled via inline style
  };

  const selectedFolder = folders.find(f => f.id === selectedFolderId);

  return (
    <div 
        className="h-full bg-white dark:bg-black w-full flex flex-col transition-colors duration-200"
        onMouseMove={(e: any) => handlePointerMove(e)}
        onTouchMove={(e: any) => handlePointerMove(e)}
        onMouseUp={handlePointerUp}
        onTouchEnd={handlePointerUp}
        onClick={() => setActiveBrandSearchId(null)} 
    >
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between sticky top-0 bg-white/95 dark:bg-black/95 backdrop-blur-sm z-20 shrink-0">
        <h1 className="text-2xl font-black tracking-tight text-black dark:text-white">{step === 'preview' ? 'PREVIEW POST' : 'BUILD FIT'}</h1>
        {step !== 'upload' && (
          <button onClick={() => { setStep('upload'); setItems([]); setGeneratedImage(null); }} className="text-sm font-medium text-gray-500 dark:text-zinc-500">
            Reset
          </button>
        )}
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        {step === 'upload' && items.length === 0 && (
          <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Main Upload Box */}
            <div className="mb-8">
                <label className="w-full aspect-[4/3] border-2 border-dashed border-gray-300 dark:border-zinc-700 rounded-3xl flex flex-col items-center justify-center bg-gray-50 dark:bg-zinc-900 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors group">
                    <div className="w-16 h-16 bg-gray-200 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4 text-gray-500 group-hover:scale-110 transition-transform">
                        <Upload size={24} />
                    </div>
                    <span className="font-bold text-gray-800 dark:text-zinc-200">Quick Upload</span>
                    <span className="text-xs text-gray-400 dark:text-zinc-500 mt-2 max-w-[200px] text-center">Auto-adds to 'Last Used' and Canvas</span>
                    <input 
                        type="file" 
                        className="hidden" 
                        ref={fileInputRef}
                        onChange={handleUpload} 
                        accept="image/*" 
                    />
                </label>
            </div>

            {/* Wardrobe / Assets Section */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-black text-xl text-black dark:text-white">Wardrobe</h2>
                </div>

                {/* Folder Carousel */}
                <div className="mb-4">
                  <FolderCarousel 
                    folders={folders}
                    selectedFolderId={selectedFolderId}
                    setSelectedFolderId={setSelectedFolderId}
                    setIsCreatingFolder={setIsCreatingFolder}
                  />
                </div>

                {/* Custom Folder Input */}
                {isCreatingFolder && (
                    <div className="flex gap-2 mb-4 animate-in slide-in-from-left">
                        <input 
                            autoFocus
                            type="text" 
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="Folder Name..."
                            className="flex-1 bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white"
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                        />
                        <button onClick={handleCreateFolder} className="bg-black dark:bg-white text-white dark:text-black px-4 rounded-xl font-bold text-sm">Add</button>
                        <button onClick={() => setIsCreatingFolder(false)} className="text-gray-400 px-2"><X size={20}/></button>
                    </div>
                )}

                {/* Assets Grid for Selected Folder */}
                <div className="bg-gray-50 dark:bg-zinc-900 rounded-2xl p-4 min-h-[200px]">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">{selectedFolder?.name} Assets</span>
                        <label className="text-xs font-bold text-black dark:text-white flex items-center gap-1 cursor-pointer hover:opacity-70">
                            <Plus size={14} />
                            Add to {selectedFolder?.name}
                            <input type="file" className="hidden" onChange={(e) => handleAddToFolder(e, selectedFolderId)} accept="image/*" />
                        </label>
                    </div>

                    {selectedFolder?.assets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-gray-400 border-2 border-dashed border-gray-200 dark:border-zinc-700 rounded-xl">
                            <ImageIcon size={24} className="mb-2 opacity-50" />
                            <span className="text-xs">No items yet</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-3">
                            {selectedFolder?.assets.map((asset) => (
                                <div 
                                    key={asset.id} 
                                    onClick={() => addItemToCanvas(asset.url)}
                                    className="aspect-square bg-white dark:bg-black rounded-xl p-2 shadow-sm border border-gray-100 dark:border-zinc-800 cursor-pointer hover:border-black dark:hover:border-white hover:shadow-md transition-all group relative"
                                >
                                    <img src={asset.url} className="w-full h-full object-contain" alt="asset" />
                                    <div className="absolute inset-0 bg-black/5 dark:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
          </div>
        )}

        {(step === 'canvas' || step === 'preview' || (step === 'upload' && items.length > 0)) && (
          <div className="flex flex-col w-full">
            
            {/* Control Bar (Face Upload) - Only in Canvas Mode */}
            {step === 'canvas' && (
                <div className="flex items-center gap-3 mb-4 overflow-x-auto hide-scrollbar">
                    <label className={`flex items-center gap-2 px-4 py-2 rounded-full border border-dashed cursor-pointer shrink-0 transition-colors ${faceImage ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-400' : 'bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-500'}`}>
                        <div className="w-6 h-6 bg-gray-200 dark:bg-zinc-800 rounded-full overflow-hidden shrink-0">
                            {faceImage ? (
                                <img src={faceImage} className="w-full h-full object-cover" alt="face" />
                            ) : (
                                <User size={16} className="text-gray-500 m-1" />
                            )}
                        </div>
                        <span className="text-xs font-bold">{faceImage ? 'Face Added' : 'Add Face (Optional)'}</span>
                        {!faceImage && <input type="file" className="hidden" onChange={handleFaceUpload} accept="image/*" />}
                        {faceImage && (
                            <button 
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFaceImage(null); }}
                                className="ml-1 p-0.5 bg-purple-200 dark:bg-purple-900 rounded-full hover:bg-purple-300 text-purple-800 dark:text-purple-300"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </label>
                    
                     <input 
                        type="text" 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe scene (e.g. 'Standing in Tokyo')"
                        className="flex-1 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-full px-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white text-black dark:text-white"
                     />
                </div>
            )}
            
            {/* PREVIEW CAROUSEL */}
            {step === 'preview' ? (
                <div className="mb-6">
                    <div className="relative w-full aspect-square bg-gray-100 dark:bg-zinc-900 rounded-xl overflow-hidden shadow-sm group">
                         {/* Nav Buttons */}
                         <button onClick={() => setPreviewSlide(0)} className={`absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-black/30 text-white rounded-full p-1.5 ${previewSlide === 0 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}><ChevronLeft size={20}/></button>
                         <button onClick={() => setPreviewSlide(1)} className={`absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-black/30 text-white rounded-full p-1.5 ${previewSlide === 1 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}><ChevronRight size={20}/></button>
                        
                         {/* Slide 1: AI Result */}
                         <div className={`absolute inset-0 transition-transform duration-300 ease-out ${previewSlide === 0 ? 'translate-x-0' : '-translate-x-full'}`}>
                            {generatedImage && <img src={generatedImage} className="w-full h-full object-cover" alt="AI Fit" />}
                         </div>

                         {/* Slide 2: The Board (Interactive) */}
                         <div className={`absolute inset-0 transition-transform duration-300 ease-out ${previewSlide === 1 ? 'translate-x-0' : 'translate-x-full'}`}>
                            <div 
                                className={`w-full h-full relative overflow-hidden ${selectedBackground.type !== 'image' ? selectedBackground.value : ''}`}
                                style={selectedBackground.type === 'image' ? { backgroundImage: `url(${selectedBackground.value})` } : {}}
                            >
                                {/* Overlay for texture opacity if needed */}
                                {selectedBackground.id !== 'white' && selectedBackground.id !== 'black' && <div className="absolute inset-0 bg-black/5 pointer-events-none"></div>}

                                {items.map((item) => (
                                    <div 
                                        key={item.id}
                                        onClick={() => setTestModalItem(itemMetadata[item.id])}
                                        className={`absolute cursor-pointer transition-transform hover:scale-105 active:scale-95 ${showFrames ? 'bg-white p-2 pb-5 shadow-2xl' : ''}`}
                                        style={{ 
                                            top: `${item.y}%`, 
                                            left: `${item.x}%`,
                                            width: showFrames ? '8rem' : 'auto',
                                            transform: `translate(-50%, -50%) rotate(${showFrames ? (item.rotation || (Math.random() * 10 - 5)) : 0}deg)` 
                                        }}
                                    >
                                        <div className={`w-full aspect-square ${showFrames ? 'bg-gray-50 mb-1' : ''} overflow-hidden`}>
                                            <img src={item.url} className={`w-32 h-32 object-contain ${item.isBgRemoved ? 'mix-blend-multiply' : ''}`} alt="item" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
                                <span className="text-[10px] font-bold text-white/50 bg-black/20 px-2 py-1 rounded-full backdrop-blur-md">Tap items to test links</span>
                            </div>
                         </div>
                    </div>
                    {/* Dots */}
                    <div className="flex justify-center gap-1.5 mt-3">
                        <div className={`w-1.5 h-1.5 rounded-full transition-colors ${previewSlide === 0 ? 'bg-black dark:bg-white' : 'bg-gray-300 dark:bg-zinc-700'}`} />
                        <div className={`w-1.5 h-1.5 rounded-full transition-colors ${previewSlide === 1 ? 'bg-black dark:bg-white' : 'bg-gray-300 dark:bg-zinc-700'}`} />
                    </div>
                    
                    {/* Frame Toggle */}
                    <div className="flex justify-center mt-3">
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-zinc-400 cursor-pointer select-none bg-gray-50 dark:bg-zinc-900 px-3 py-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800">
                            <input 
                                type="checkbox" 
                                checked={showFrames} 
                                onChange={(e) => setShowFrames(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-gray-300 text-black focus:ring-black accent-black"
                            />
                            Keep frames?
                        </label>
                    </div>
                </div>
            ) : (
                /* CANVAS EDITOR */
                <div 
                    ref={canvasRef}
                    className={`relative w-full aspect-square border border-gray-200 dark:border-zinc-800 rounded-2xl overflow-hidden mb-4 shadow-inner touch-none transition-all z-0 isolate ${getBackgroundStyle()}`}
                    style={selectedBackground.type === 'image' ? { backgroundImage: `url(${selectedBackground.value})`, backgroundSize: 'cover' } : {}}
                >
                {items.map((item) => (
                    <div 
                        key={item.id} 
                        className={`absolute w-40 h-40 flex items-center justify-center select-none ${selectedItemId === item.id ? 'z-20' : 'z-10'}`}
                        style={{ 
                            top: `${item.y}%`, 
                            left: `${item.x}%`,
                            transform: 'translate(-50%, -50%)',
                            touchAction: 'none'
                        }}
                        onMouseDown={(e) => handlePointerDown(e, item.id)}
                        onTouchStart={(e) => handlePointerDown(e, item.id)}
                    >
                        <div className={`relative w-full h-full transition-all ${selectedItemId === item.id ? 'scale-105' : ''}`}>
                            {selectedItemId === item.id && (
                                <div className="absolute inset-0 border-2 border-purple-500 rounded-lg pointer-events-none"></div>
                            )}
                            
                            <img 
                                src={item.url} 
                                className={`w-full h-full object-contain drop-shadow-xl transition-all duration-300 ${item.isBgRemoved ? 'mix-blend-multiply' : ''} ${item.isProcessingBg ? 'opacity-50 blur-sm' : ''}`} 
                                alt="Item" 
                                draggable={false}
                            />

                            {item.isProcessingBg && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Loader2 className="animate-spin text-purple-600" size={24} />
                                </div>
                            )}

                            {selectedItemId === item.id && (
                                <>
                                    <button onClick={(e) => { e.stopPropagation(); removeItem(item.id); }} className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1.5 shadow-md hover:bg-red-600 active:scale-95 transition-transform z-30">
                                        <X size={14} />
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); toggleBackground(item.id); }}
                                        className={`absolute -bottom-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 text-xs font-bold transition-all z-30 whitespace-nowrap ${item.isBgRemoved ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-white text-gray-700 border border-gray-200'}`}
                                    >
                                        {item.isBgRemoved ? <><Layers size={12} /><span>BG Removed</span></> : <><Eraser size={12} /><span>Remove BG</span></>}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
                
                {/* Direct Upload Button Overlay (Bottom Left) */}
                <label 
                    className="absolute bottom-4 left-4 z-40 bg-black dark:bg-white text-white dark:text-black p-3 rounded-full shadow-lg cursor-pointer hover:bg-gray-800 dark:hover:bg-gray-200 active:scale-95 transition-transform"
                    title="Quick Add Item"
                >
                     <Plus size={20} />
                     <input 
                        type="file" 
                        ref={canvasFileInputRef}
                        className="hidden" 
                        onChange={handleUpload} 
                        accept="image/*" 
                     />
                </label>

                {isGenerating && (
                    <div className="absolute inset-0 bg-white/80 dark:bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-50">
                        <Loader2 className="animate-spin text-purple-600 mb-2" size={40} />
                        <span className="text-sm font-bold text-purple-900 dark:text-purple-400 animate-pulse">Nano Banana is cooking...</span>
                    </div>
                )}
                </div>
            )}

            {/* Bottom Controls / Metadata */}
            {step === 'canvas' ? (
                <div className="flex-1 flex flex-col pb-4">
                    {/* Tabs */}
                    <div className="flex border-b border-gray-100 dark:border-zinc-800 mb-4">
                        <button onClick={() => setActiveTab('items')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'items' ? 'border-black dark:border-white text-black dark:text-white' : 'border-transparent text-gray-400 dark:text-zinc-600'}`}>Items</button>
                        <button onClick={() => setActiveTab('background')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'background' ? 'border-black dark:border-white text-black dark:text-white' : 'border-transparent text-gray-400 dark:text-zinc-600'}`}>Canvas</button>
                    </div>

                    <div className="flex-1 overflow-y-auto hide-scrollbar pb-2 min-h-[120px]">
                        {activeTab === 'items' ? (
                             <div className="flex flex-col gap-3 h-full">
                                {/* Folder Navigation */}
                                <div className="mb-2">
                                  <FolderCarousel 
                                    folders={folders}
                                    selectedFolderId={selectedFolderId}
                                    setSelectedFolderId={setSelectedFolderId}
                                    setIsCreatingFolder={setIsCreatingFolder}
                                    compact={true}
                                  />
                                </div>
                                
                                {/* Folder Creation Input */}
                                {isCreatingFolder && (
                                    <div className="flex gap-2 px-1">
                                        <input 
                                            autoFocus
                                            type="text" 
                                            value={newFolderName}
                                            onChange={(e) => setNewFolderName(e.target.value)}
                                            placeholder="Folder Name"
                                            className="flex-1 bg-gray-50 dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-black dark:text-white"
                                            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                                        />
                                        <button onClick={handleCreateFolder} className="bg-black dark:bg-white text-white dark:text-black px-3 rounded-lg text-xs font-bold">Add</button>
                                        <button onClick={() => setIsCreatingFolder(false)}><X size={16} className="text-gray-400"/></button>
                                    </div>
                                )}

                                {/* Assets Grid */}
                                <div className="grid grid-cols-4 gap-2 px-1 pb-2">
                                    <label className="aspect-square bg-white dark:bg-black border border-dashed border-gray-300 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-900">
                                        <Plus size={20} className="text-gray-400 mb-1" />
                                        <span className="text-[9px] font-bold text-gray-400 text-center leading-tight">Add to<br/>{selectedFolder?.name}</span>
                                        <input type="file" className="hidden" onChange={(e) => handleAddToFolder(e, selectedFolderId)} accept="image/*" />
                                    </label>

                                    {selectedFolder?.assets.map(asset => (
                                        <div 
                                            key={asset.id}
                                            onClick={() => addItemToCanvas(asset.url)}
                                            className="aspect-square bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-xl p-1.5 cursor-pointer hover:border-black dark:hover:border-white transition-all relative group"
                                        >
                                            <img src={asset.url} className="w-full h-full object-contain" alt="asset" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                             <div className="grid grid-cols-4 gap-3">
                                {BACKGROUND_OPTIONS.map(bg => (
                                    <button 
                                        key={bg.id}
                                        onClick={() => setSelectedBackground(bg)}
                                        className={`aspect-square rounded-xl border-2 overflow-hidden relative shadow-sm transition-all ${selectedBackground.id === bg.id ? 'border-black ring-1 ring-black dark:border-white dark:ring-white scale-95' : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300'}`}
                                    >
                                        <div 
                                            className={`w-full h-full ${bg.type !== 'image' ? bg.value : ''}`}
                                            style={bg.type === 'image' ? { backgroundImage: `url(${bg.value})`, backgroundSize: 'cover' } : {}}
                                        />
                                        <span className="absolute bottom-0 inset-x-0 bg-white/80 dark:bg-black/80 text-[9px] font-bold text-center py-1 backdrop-blur-sm text-black dark:text-white">{bg.name}</span>
                                    </button>
                                ))}
                             </div>
                        )}
                    </div>
                    
                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
                         <Button variant="purple" className="w-full flex items-center justify-center gap-2 h-14 text-lg" onClick={handleGenerate} disabled={items.length === 0}>
                            <Sparkles size={20} className="text-yellow-200" />
                            Generate fit
                         </Button>
                    </div>
                </div>
            ) : step === 'preview' && (
                <div className="animate-in slide-in-from-bottom duration-300 pb-4">
                    
                    {/* Caption */}
                    <div className="mb-4">
                        <label className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2 block">Caption</label>
                        <textarea 
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            placeholder="Write a caption..."
                            className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white text-black dark:text-white min-h-[80px]"
                        />
                    </div>
                    
                    {/* Music Selection */}
                    <div className="mb-6">
                        <label className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2 block">Add Music</label>
                        {!selectedMusic ? (
                             <div className="relative">
                                <button 
                                    onClick={() => setShowMusicPicker(!showMusicPicker)}
                                    className="w-full flex items-center gap-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-zinc-800 flex items-center justify-center">
                                        <Music size={16} className="text-gray-500" />
                                    </div>
                                    <span className="text-sm font-medium text-gray-600 dark:text-zinc-400">Pick a track...</span>
                                    <ChevronRight size={16} className="ml-auto text-gray-400" />
                                </button>
                                
                                {showMusicPicker && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 shadow-xl rounded-xl overflow-hidden z-20 animate-in slide-in-from-top-2">
                                        {MOCK_TRACKS.map(track => (
                                            <button 
                                                key={track.id}
                                                onClick={() => { setSelectedMusic(track); setShowMusicPicker(false); }}
                                                className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-zinc-800 border-b border-gray-50 dark:border-zinc-800 last:border-0 text-left"
                                            >
                                                <img src={track.cover} className="w-10 h-10 rounded bg-gray-200" alt="cover"/>
                                                <div>
                                                    <div className="text-xs font-bold text-black dark:text-white">{track.title}</div>
                                                    <div className="text-[10px] text-gray-500">{track.artist}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                             </div>
                        ) : (
                            <div className="flex items-center gap-3 bg-black dark:bg-white text-white dark:text-black rounded-xl px-4 py-3 shadow-md">
                                <img src={selectedMusic.cover} className="w-10 h-10 rounded border border-white/20 dark:border-black/20" alt="cover"/>
                                <div className="flex-1">
                                    <div className="text-xs font-bold">{selectedMusic.title}</div>
                                    <div className="text-[10px] text-white/70 dark:text-black/70">{selectedMusic.artist}</div>
                                </div>
                                <button onClick={() => setSelectedMusic(null)} className="p-2 hover:bg-white/10 dark:hover:bg-black/10 rounded-full"><X size={16}/></button>
                            </div>
                        )}
                    </div>

                    {/* Shop Links */}
                    <div className="mb-6">
                        <label className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2 block flex justify-between">
                            <span>Link Items ({items.length})</span>
                        </label>
                        <div className="space-y-3">
                            {items.map((item, idx) => {
                                const meta = itemMetadata[item.id] || { id: item.id, brand: '', name: '', price: '', urls: [''] };
                                
                                // Autocomplete Logic
                                const isSearching = activeBrandSearchId === item.id;
                                const brandSuggestions = Object.keys(BRAND_COLLECTIONS).filter(b => 
                                    b.toLowerCase().includes(meta.brand.toLowerCase())
                                );

                                return (
                                    <div key={item.id} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-3 shadow-sm z-10 relative">
                                        <div className="flex gap-3 mb-3">
                                            <div className="w-12 h-12 bg-gray-50 dark:bg-zinc-800 rounded-lg p-1 border border-gray-100 dark:border-zinc-700">
                                                <img src={item.url} className="w-full h-full object-contain" alt="item"/>
                                            </div>
                                            <div className="flex-1 space-y-2 relative">
                                                {/* Brand Input with Autocomplete */}
                                                <div className="relative" onClick={(e) => e.stopPropagation()}>
                                                    <input 
                                                        type="text" 
                                                        placeholder="Brand (e.g. Rick Owens)"
                                                        value={meta.brand}
                                                        onFocus={() => setActiveBrandSearchId(item.id)}
                                                        onChange={(e) => setItemMetadata(prev => ({ ...prev, [item.id]: { ...meta, brand: e.target.value } }))}
                                                        className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white placeholder:font-normal"
                                                    />
                                                    {isSearching && meta.brand.length > 0 && brandSuggestions.length > 0 && (
                                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-700 rounded-lg shadow-xl z-20 max-h-40 overflow-y-auto">
                                                            {brandSuggestions.map(suggestion => (
                                                                <button
                                                                    key={suggestion}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setItemMetadata(prev => ({ ...prev, [item.id]: { ...meta, brand: suggestion } }));
                                                                        setActiveBrandSearchId(null);
                                                                    }}
                                                                    className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-zinc-800 text-sm font-medium text-black dark:text-white"
                                                                >
                                                                    {suggestion}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                <input 
                                                    type="text" 
                                                    placeholder="Item Name (e.g. Hoodie)"
                                                    value={meta.name}
                                                    onChange={(e) => setItemMetadata(prev => ({ ...prev, [item.id]: { ...meta, name: e.target.value } }))}
                                                    className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs text-gray-600 dark:text-zinc-400 focus:outline-none focus:border-black dark:focus:border-white"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex gap-3 items-start">
                                            <div className="relative w-20 shrink-0">
                                                <span className="absolute left-2 top-2.5 text-xs text-gray-400">$</span>
                                                <input 
                                                    type="text" 
                                                    placeholder="0.00"
                                                    value={meta.price}
                                                    onChange={(e) => setItemMetadata(prev => ({ ...prev, [item.id]: { ...meta, price: e.target.value } }))}
                                                    className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg py-1.5 pl-5 pr-2 text-xs font-bold focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white"
                                                />
                                            </div>
                                            <div className="flex-1 space-y-2">
                                                {meta.urls.map((url, urlIdx) => (
                                                    <div key={urlIdx} className="flex gap-2">
                                                        <div className="relative flex-1">
                                                            <LinkIcon size={12} className="absolute left-2 top-2.5 text-gray-400" />
                                                            <input 
                                                                type="text" 
                                                                placeholder={`Purchase URL ${urlIdx + 1}...`}
                                                                value={url}
                                                                onChange={(e) => {
                                                                    const newUrls = [...meta.urls];
                                                                    newUrls[urlIdx] = e.target.value;
                                                                    setItemMetadata(prev => ({ ...prev, [item.id]: { ...meta, urls: newUrls } }));
                                                                }}
                                                                className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg py-1.5 pl-7 pr-2 text-xs focus:outline-none focus:border-black dark:focus:border-white text-black dark:text-white"
                                                            />
                                                        </div>
                                                        {urlIdx === meta.urls.length - 1 && (
                                                            <button 
                                                                onClick={() => {
                                                                     const newUrls = [...meta.urls, ''];
                                                                     setItemMetadata(prev => ({ ...prev, [item.id]: { ...meta, urls: newUrls } }));
                                                                }}
                                                                className="w-8 h-8 flex items-center justify-center bg-black dark:bg-white text-white dark:text-black rounded-lg shadow-sm hover:bg-gray-800 dark:hover:bg-gray-200 shrink-0 mt-px"
                                                            >
                                                                <Plus size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Socials */}
                    <div className="mb-8">
                        <label className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-3 block">Share to</label>
                        <div className="flex gap-3">
                            {['Instagram', 'TikTok', 'Twitter'].map(platform => {
                                const isSelected = socials[platform.toLowerCase() as keyof typeof socials];
                                return (
                                    <button 
                                        key={platform}
                                        onClick={() => setSocials(prev => ({ ...prev, [platform.toLowerCase()]: !isSelected }))}
                                        className={`flex-1 py-4 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all group ${
                                            isSelected 
                                            ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-lg shadow-black/20' 
                                            : 'bg-white dark:bg-zinc-900 text-gray-500 dark:text-zinc-500 border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-600 hover:bg-gray-50 dark:hover:bg-zinc-800'
                                        }`}
                                    >
                                        {platform === 'Instagram' && <InstagramLogo className={`w-6 h-6 ${isSelected ? 'text-white dark:text-black' : 'text-gray-900 dark:text-white'}`} />}
                                        {platform === 'TikTok' && <TikTokLogo className={`w-6 h-6 ${isSelected ? 'text-white dark:text-black' : 'text-gray-900 dark:text-white'}`} />}
                                        {platform === 'Twitter' && <XLogo className={`w-5 h-5 ${isSelected ? 'text-white dark:text-black' : 'text-gray-900 dark:text-white'}`} />}
                                        
                                        {isSelected && (
                                            <div className="absolute top-2 right-2">
                                                <Check size={12} className="text-green-400" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Button variant="secondary" onClick={() => setStep('canvas')}>Back to Edit</Button>
                        <Button variant="black" onClick={handlePublish}>Publish Post</Button>
                    </div>
                </div>
            )}
          </div>
        )}
      </div>

      {/* Testing Modal for Preview */}
      <Modal isOpen={!!testModalItem} onClose={() => setTestModalItem(null)} variant="center">
        {testModalItem && (
             <div className="flex flex-col items-center text-center pb-2 text-black dark:text-white">
                <div className="w-16 h-1 bg-gray-200 dark:bg-zinc-700 rounded-full mb-4"></div>
                <h3 className="text-lg font-bold text-gray-400 uppercase tracking-widest text-[10px] mb-2">Preview Mode</h3>
                <h2 className="text-xl font-bold mb-0.5 font-serif text-black dark:text-white">{testModalItem.brand || 'Brand'}</h2>
                <p className="text-gray-500 dark:text-zinc-400 text-sm mb-4 line-clamp-1">{testModalItem.name}</p>
                <div className="text-2xl font-black mb-6 text-black dark:text-white">${testModalItem.price || '0'}</div>
                <div className="w-full space-y-2">
                    {testModalItem.urls && testModalItem.urls.map((url, idx) => (
                         url ? (
                             <div key={idx} className="bg-gray-100 dark:bg-zinc-800 px-4 py-2 rounded-lg text-xs font-mono text-gray-500 dark:text-zinc-400 break-all">
                                {url}
                             </div>
                         ) : null
                    ))}
                    {(!testModalItem.urls || testModalItem.urls.every(u => !u)) && (
                         <div className="text-xs text-gray-400 italic">No URLs provided</div>
                    )}
                </div>
             </div>
        )}
      </Modal>
    </div>
  );
};