
import React, { useState } from 'react';
import { ArrowLeft, Filter } from 'lucide-react';
import { BRAND_COLLECTIONS, MOCK_ITEMS } from '../constants';
import { Modal, StoreButtonRow } from './Shared';
import { ClothingItem } from '../types';

interface BrandPageProps {
  brandName: string;
  onBack: () => void;
}

export const BrandPage: React.FC<BrandPageProps> = ({ brandName, onBack }) => {
  // Fallback to MOCK_ITEMS if brand not found in collections, filtering by brand name match if possible
  const collection = BRAND_COLLECTIONS[brandName] || MOCK_ITEMS.filter(i => i.brand === brandName);
  const items = collection.length > 0 ? collection : MOCK_ITEMS; // Fallback to all items for demo if empty

  const [selectedItem, setSelectedItem] = useState<ClothingItem | null>(null);

  return (
    <div className="bg-white dark:bg-black min-h-screen pb-20 animate-in slide-in-from-right duration-300 transition-colors duration-200">
      {/* Header */}
      <div className="sticky top-0 bg-white/95 dark:bg-black/95 backdrop-blur z-20 px-4 h-14 flex items-center justify-between border-b border-gray-100 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-black dark:text-white">
            <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full">
                <ArrowLeft size={24} />
            </button>
            <span className="font-bold text-lg">{brandName}</span>
        </div>
        <button className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full">
            <Filter size={20} className="text-gray-500" />
        </button>
      </div>

      {/* Hero / Info (Optional) */}
      <div className="bg-gray-50 dark:bg-zinc-900 px-6 py-8 border-b border-gray-100 dark:border-zinc-800 mb-6">
        <h1 className="text-3xl font-black text-black dark:text-white tracking-tight mb-2">{brandName}</h1>
        <p className="text-gray-500 dark:text-zinc-400 text-sm max-w-xs leading-relaxed">
            Discover the latest collection and trending items from {brandName} on Fitted.
        </p>
      </div>

      {/* Items Grid */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">{items.length} Items</span>
        </div>
        
        <div className="grid grid-cols-2 gap-x-4 gap-y-8">
            {items.map((item, idx) => (
                <div 
                    key={item.id + idx} 
                    className="flex flex-col group cursor-pointer"
                    onClick={() => setSelectedItem(item)}
                >
                    <div className="w-full aspect-square bg-gray-50 dark:bg-white rounded-xl mb-3 overflow-hidden border border-gray-100 dark:border-zinc-800 relative">
                        <img 
                            src={item.imageUrl} 
                            className="w-full h-full object-cover mix-blend-multiply group-hover:scale-105 transition-transform duration-500" 
                            alt={item.name} 
                        />
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="bg-white rounded-full p-1.5 shadow-sm">
                                <ArrowLeft size={16} className="rotate-[135deg] text-black" />
                            </div>
                        </div>
                    </div>
                    <div className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-0.5">{item.brand}</div>
                    <div className="text-sm font-bold text-black dark:text-white leading-tight mb-1">{item.name}</div>
                    <div className="text-sm text-gray-600 dark:text-zinc-400">${item.price}</div>
                </div>
            ))}
        </div>
      </div>

      {/* Purchase Modal */}
      <Modal isOpen={!!selectedItem} onClose={() => setSelectedItem(null)} variant="center">
        {selectedItem && (
          <div className="flex flex-col items-center text-center pb-2 text-black dark:text-white">
            <div className="w-48 h-48 bg-gray-50 dark:bg-white rounded-xl mb-4 p-4 border border-gray-100 dark:border-zinc-700 shadow-inner flex items-center justify-center">
              <img src={selectedItem.imageUrl} className="max-w-full max-h-full object-contain mix-blend-multiply" alt={selectedItem.name}/>
            </div>
            <h2 className="text-xl font-bold mb-0.5 font-serif text-black dark:text-white">{selectedItem.brand}</h2>
            <p className="text-gray-500 dark:text-zinc-400 text-sm mb-4 line-clamp-1">{selectedItem.name}</p>
            <div className="text-2xl font-black mb-6 text-black dark:text-white">${selectedItem.price}</div>
            
            <StoreButtonRow link={selectedItem.purchaseLink} itemName={selectedItem.name} />

            <span className="text-[10px] text-gray-400 dark:text-zinc-500 mt-3 font-medium uppercase tracking-wider">Tap to buy</span>
          </div>
        )}
      </Modal>
    </div>
  );
};